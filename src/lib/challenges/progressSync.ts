import { clearBackgroundSyncIssue, reportBackgroundSyncIssue } from '$lib/backgroundSync';
import { challengeIds } from '$lib/challenges/catalogIdentity';
import {
	classifyRequestFailure,
	fetchWithResponseTimeout,
	requestErrorFromResponse
} from '$lib/requestFailure';
import {
	clearGuestChallengeProgress,
	mergeChallengeProgress,
	parseChallengeProgress,
	readChallengeProgress,
	writeChallengeProgress,
	type ChallengeProgress,
	type ChallengeProgressEntry
} from './progress';

export const CHALLENGE_PROGRESS_UPDATED_EVENT = 'qc:challenge-progress-updated';
export const CHALLENGE_PROGRESS_SYNC_ENDPOINT = '/api/challenge-progress';

export type ChallengeProgressUpdatedDetail = {
	userId: string | null;
	progress: ChallengeProgress;
	confirmed?: boolean;
};

export type ChallengeProgressStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const syncQueues = new Map<string, Promise<void>>();
const confirmedProgressByUser = new Map<string, ChallengeProgress>();
const recognizedChallengeIds = new Set<string>(challengeIds);

function browserStorage(): ChallengeProgressStorage | undefined {
	if (typeof window === 'undefined') return undefined;
	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}

function normalizedUserId(userId: string): string {
	return userId.trim();
}

function syncIssueId(userId: string): string {
	return `challenge-progress:${userId}`;
}

function dispatchProgressUpdated(userId: string, progress: ChallengeProgress): void {
	confirmedProgressByUser.set(userId, progress);
	if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
	window.dispatchEvent(
		new CustomEvent<ChallengeProgressUpdatedDetail>(CHALLENGE_PROGRESS_UPDATED_EVENT, {
			detail: { userId, progress, confirmed: true }
		})
	);
}

function recognizedProgress(progress: ChallengeProgress): ChallengeProgress {
	return {
		version: 2,
		challenges: Object.fromEntries(
			Object.entries(progress.challenges).filter(([id]) => recognizedChallengeIds.has(id))
		)
	};
}

function serialiseForUser<T>(userId: string, task: () => Promise<T>): Promise<T> {
	const previous = syncQueues.get(userId) ?? Promise.resolve();
	const result = previous.then(task, task);
	const tail = result.then(
		() => undefined,
		() => undefined
	);
	syncQueues.set(userId, tail);
	void tail.then(() => {
		if (syncQueues.get(userId) === tail) syncQueues.delete(userId);
	});
	return result;
}

const progressEntryKeys = [
	'startedAt',
	'updatedAt',
	'completedAt',
	'plays',
	'lastStage',
	'bestScore',
	'bestTimeMs',
	'lastScore',
	'lastTimeMs'
] satisfies Array<keyof ChallengeProgressEntry>;

function isCanonicalProgressEntry(value: unknown, parsed: ChallengeProgressEntry): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const candidate = value as Record<string, unknown>;
	const keys = Object.keys(candidate).sort();
	const expectedKeys = [...progressEntryKeys].sort();
	return (
		keys.length === expectedKeys.length &&
		keys.every((key, index) => key === expectedKeys[index]) &&
		progressEntryKeys.every((key) => candidate[key] === parsed[key])
	);
}

function canonicalProgress(value: unknown): ChallengeProgress | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const candidate = value as Record<string, unknown>;
	const topLevelKeys = Object.keys(candidate).sort();
	if (
		topLevelKeys.length !== 2 ||
		topLevelKeys[0] !== 'challenges' ||
		topLevelKeys[1] !== 'version' ||
		candidate.version !== 2 ||
		!candidate.challenges ||
		typeof candidate.challenges !== 'object' ||
		Array.isArray(candidate.challenges)
	) {
		return null;
	}
	const parsed = parseChallengeProgress(JSON.stringify(candidate));
	const rawChallenges = candidate.challenges as Record<string, unknown>;
	const rawIds = Object.keys(rawChallenges).sort();
	const parsedIds = Object.keys(parsed.challenges).sort();
	if (
		rawIds.length !== parsedIds.length ||
		!rawIds.every(
			(id, index) =>
				id === parsedIds[index] &&
				Boolean(parsed.challenges[id]) &&
				isCanonicalProgressEntry(rawChallenges[id], parsed.challenges[id])
		)
	) {
		return null;
	}
	return parsed;
}

function confirmsBestResult(
	confirmed: ChallengeProgressEntry,
	candidate: ChallengeProgressEntry
): boolean {
	if (candidate.bestScore === null) return true;
	if (confirmed.bestScore === null || confirmed.bestScore < candidate.bestScore) return false;
	if (confirmed.bestScore > candidate.bestScore || candidate.bestTimeMs === null) return true;
	return confirmed.bestTimeMs !== null && confirmed.bestTimeMs <= candidate.bestTimeMs;
}

/**
 * The server is authoritative for the transient latest-stage/result tuple.
 * Confirmation therefore checks only durable monotonic facts. In particular,
 * an equal-timestamp D1 merge may return null lastScore/lastTimeMs while still
 * preserving the submitted completion, personal best and play count.
 */
function progressConfirms(
	confirmedProgress: ChallengeProgress,
	candidateProgress: ChallengeProgress
): boolean {
	for (const [challengeId, candidate] of Object.entries(candidateProgress.challenges)) {
		const confirmed = confirmedProgress.challenges[challengeId];
		if (!confirmed) return false;
		if (Date.parse(confirmed.startedAt) > Date.parse(candidate.startedAt)) return false;
		if (Date.parse(confirmed.updatedAt) < Date.parse(candidate.updatedAt)) return false;
		if (confirmed.plays < candidate.plays) return false;
		if (
			candidate.completedAt !== null &&
			(confirmed.completedAt === null ||
				Date.parse(confirmed.completedAt) > Date.parse(candidate.completedAt))
		) {
			return false;
		}
		if (!confirmsBestResult(confirmed, candidate)) return false;
	}
	return true;
}

async function responseProgress(response: Response): Promise<ChallengeProgress> {
	if (!response.ok) {
		throw await requestErrorFromResponse(response, 'Challenge progress sync failed.');
	}
	const body = (await response.json()) as unknown;
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw new Error('Challenge progress sync returned an invalid response.');
	}
	const progress = canonicalProgress((body as { progress?: unknown }).progress);
	if (!progress) {
		throw new Error('Challenge progress sync returned an invalid progress document.');
	}
	return recognizedProgress(progress);
}

async function postAndCacheProgress(
	userId: string,
	candidate: ChallengeProgress,
	storage: ChallengeProgressStorage
): Promise<ChallengeProgress> {
	const latestBeforeRequest = recognizedProgress(readChallengeProgress(storage, userId));
	let outgoing = recognizedProgress(
		mergeChallengeProgress(latestBeforeRequest, recognizedProgress(candidate))
	);
	// Preserve signed-in play locally even if this request fails.
	writeChallengeProgress(outgoing, storage, userId);

	while (true) {
		const response = await fetchWithResponseTimeout(CHALLENGE_PROGRESS_SYNC_ENDPOINT, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ progress: outgoing })
		});
		const remote = await responseProgress(response);
		if (!progressConfirms(remote, outgoing)) {
			throw new Error('Challenge progress sync did not confirm every submitted result.');
		}

		// A game may have written a newer stage while this request was in flight.
		const latestAfterRequest = recognizedProgress(readChallengeProgress(storage, userId));
		if (progressConfirms(remote, latestAfterRequest)) {
			writeChallengeProgress(remote, storage, userId);
			dispatchProgressUpdated(userId, remote);
			clearBackgroundSyncIssue(syncIssueId(userId));
			return remote;
		}

		// Do not label the newer browser state as confirmed. Send it in this
		// serialized operation before publishing a confirmed watermark.
		outgoing = recognizedProgress(mergeChallengeProgress(remote, latestAfterRequest));
		writeChallengeProgress(outgoing, storage, userId);
	}
}

function reportSyncFailure(userId: string, error: unknown, retry: () => Promise<unknown>): void {
	reportBackgroundSyncIssue({
		id: syncIssueId(userId),
		failure: classifyRequestFailure(error, {
			action: 'sync your challenge progress',
			serverLabel: 'Challenge progress sync'
		}),
		retry: async () => {
			await retry();
		}
	});
}

/**
 * Sends the complete account cache. Calls for the same user are serialized so
 * an older response cannot overwrite a newer local stage or personal best.
 */
export function syncChallengeProgress(
	userId: string,
	progress?: ChallengeProgress,
	storage: ChallengeProgressStorage | undefined = browserStorage(),
	confirmedProgress?: ChallengeProgress | null
): Promise<ChallengeProgress> {
	const uid = normalizedUserId(userId);
	if (!uid || !storage || typeof fetch === 'undefined') {
		return Promise.resolve(
			recognizedProgress(progress ?? readChallengeProgress(storage, uid || undefined))
		);
	}

	return serialiseForUser(uid, async () => {
		const candidate = recognizedProgress(progress ?? readChallengeProgress(storage, uid));
		const suppliedConfirmed = confirmedProgress ? recognizedProgress(confirmedProgress) : null;
		const cachedConfirmed = confirmedProgressByUser.get(uid) ?? null;
		const confirmed =
			suppliedConfirmed && cachedConfirmed
				? recognizedProgress(mergeChallengeProgress(suppliedConfirmed, cachedConfirmed))
				: (suppliedConfirmed ?? cachedConfirmed);
		if (confirmed && progressConfirms(confirmed, candidate)) {
			writeChallengeProgress(confirmed, storage, uid);
			dispatchProgressUpdated(uid, confirmed);
			clearBackgroundSyncIssue(syncIssueId(uid));
			return confirmed;
		}
		try {
			return await postAndCacheProgress(uid, candidate, storage);
		} catch (error) {
			reportSyncFailure(uid, error, () =>
				syncChallengeProgress(uid, undefined, storage, confirmedProgress)
			);
			throw error;
		}
	});
}

/**
 * First signed-in sync. Guest and account caches are merged before upload, and
 * guest state is removed only after the server has confirmed and returned the
 * durable merged document.
 */
export function importGuestChallengeProgress(
	userId: string,
	storage: ChallengeProgressStorage | undefined = browserStorage(),
	canonicalSeed?: ChallengeProgress | null
): Promise<ChallengeProgress> {
	const uid = normalizedUserId(userId);
	if (!uid || !storage || typeof fetch === 'undefined') {
		const local = recognizedProgress(readChallengeProgress(storage, uid || undefined));
		return Promise.resolve(
			canonicalSeed
				? recognizedProgress(mergeChallengeProgress(recognizedProgress(canonicalSeed), local))
				: local
		);
	}

	return serialiseForUser(uid, async () => {
		const suppliedSeed = canonicalSeed ? recognizedProgress(canonicalSeed) : null;
		const cachedSeed = confirmedProgressByUser.get(uid) ?? null;
		const seed =
			suppliedSeed && cachedSeed
				? recognizedProgress(mergeChallengeProgress(suppliedSeed, cachedSeed))
				: (suppliedSeed ?? cachedSeed);
		const account = recognizedProgress(readChallengeProgress(storage, uid));
		const guest = recognizedProgress(readChallengeProgress(storage));
		let candidate = recognizedProgress(
			mergeChallengeProgress(seed ?? account, mergeChallengeProgress(account, guest))
		);
		writeChallengeProgress(candidate, storage, uid);

		if (!seed && Object.keys(candidate.challenges).length === 0) {
			// A direct visit outside the home route has no canonical seed. With
			// no recognized browser delta there is nothing to write; challenge
			// routes receive their account progress in server data when needed.
			clearGuestChallengeProgress(storage);
			return candidate;
		}

		if (seed && progressConfirms(seed, candidate)) {
			writeChallengeProgress(seed, storage, uid);
			clearGuestChallengeProgress(storage);
			dispatchProgressUpdated(uid, seed);
			clearBackgroundSyncIssue(syncIssueId(uid));
			return seed;
		}

		try {
			while (true) {
				const merged = await postAndCacheProgress(uid, candidate, storage);
				const latestGuest = recognizedProgress(readChallengeProgress(storage));
				if (progressConfirms(merged, latestGuest)) {
					clearGuestChallengeProgress(storage);
					return merged;
				}
				// Guest play changed while the previous request was in flight. Confirm
				// that newer state durably before removing either guest storage key.
				candidate = recognizedProgress(mergeChallengeProgress(merged, latestGuest));
				writeChallengeProgress(candidate, storage, uid);
			}
		} catch (error) {
			reportSyncFailure(uid, error, () =>
				importGuestChallengeProgress(uid, storage, canonicalSeed)
			);
			throw error;
		}
	});
}

export const initialiseChallengeProgressSync = importGuestChallengeProgress;
