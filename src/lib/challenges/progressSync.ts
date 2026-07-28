import { clearBackgroundSyncIssue, reportBackgroundSyncIssue } from '$lib/backgroundSync';
import {
	classifyRequestFailure,
	fetchWithResponseTimeout,
	requestErrorFromResponse
} from '$lib/requestFailure';
import {
	clearGuestChallengeProgress,
	emptyChallengeProgress,
	mergeChallengeProgress,
	parseChallengeProgress,
	readChallengeProgress,
	writeChallengeProgress,
	type ChallengeProgress,
	type ChallengeProgressEntry
} from './progress';
import {
	CHALLENGE_PROGRESS_UPDATED_EVENT,
	type ChallengeProgressUpdatedDetail
} from './progressEvents';

export const CHALLENGE_PROGRESS_SYNC_ENDPOINT = '/api/challenge-progress';
export const CHALLENGE_PROGRESS_SYNC_MAX_REQUEST_BYTES = 60 * 1024;

export { CHALLENGE_PROGRESS_UPDATED_EVENT } from './progressEvents';
export type { ChallengeProgressUpdatedDetail } from './progressEvents';

export type ChallengeProgressStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const syncQueues = new Map<string, Promise<void>>();
const confirmedProgressByUser = new Map<string, ChallengeProgress>();

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
			Object.entries(progress.challenges)
				.filter(([id]) => /^[a-z0-9][a-z0-9-]{0,159}$/u.test(id))
				.slice(0, 1_000)
		)
	};
}

function progressRequestBody(progress: ChallengeProgress): string {
	return JSON.stringify({ progress });
}

function utf8ByteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

/**
 * Keep every upload below the API's 64 KiB request ceiling. The server merges
 * each chunk monotonically, so a large account cache can be recovered without
 * turning one oversized document into a permanent sync failure.
 */
export function challengeProgressRequestChunks(
	progress: ChallengeProgress,
	maxRequestBytes = CHALLENGE_PROGRESS_SYNC_MAX_REQUEST_BYTES
): ChallengeProgress[] {
	const chunks: ChallengeProgress[] = [];
	let current = emptyChallengeProgress();

	for (const [challengeId, entry] of Object.entries(progress.challenges)) {
		const candidate: ChallengeProgress = {
			version: 2,
			challenges: { ...current.challenges, [challengeId]: entry }
		};
		if (utf8ByteLength(progressRequestBody(candidate)) <= maxRequestBytes) {
			current = candidate;
			continue;
		}
		if (Object.keys(current.challenges).length === 0) {
			throw new Error(`Challenge progress entry ${challengeId} exceeds the sync request limit.`);
		}
		chunks.push(current);
		current = { version: 2, challenges: { [challengeId]: entry } };
		if (utf8ByteLength(progressRequestBody(current)) > maxRequestBytes) {
			throw new Error(`Challenge progress entry ${challengeId} exceeds the sync request limit.`);
		}
	}

	if (Object.keys(current.challenges).length > 0) chunks.push(current);
	return chunks;
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

function unconfirmedProgress(
	confirmedProgress: ChallengeProgress,
	candidateProgress: ChallengeProgress
): ChallengeProgress {
	return {
		version: 2,
		challenges: Object.fromEntries(
			Object.entries(candidateProgress.challenges).filter(([challengeId, entry]) => {
				const candidate = {
					version: 2,
					challenges: { [challengeId]: entry }
				} satisfies ChallengeProgress;
				return !progressConfirms(confirmedProgress, candidate);
			})
		)
	};
}

type ChallengeProgressResponse = {
	progress: ChallengeProgress;
	rejectedChallengeIds: string[];
};

function withoutChallengeIds(
	progress: ChallengeProgress,
	challengeIds: ReadonlySet<string>
): ChallengeProgress {
	if (challengeIds.size === 0) return progress;
	return {
		version: 2,
		challenges: Object.fromEntries(
			Object.entries(progress.challenges).filter(([challengeId]) => !challengeIds.has(challengeId))
		)
	};
}

async function responseProgress(response: Response): Promise<ChallengeProgressResponse> {
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
	const rejectedValue = (body as { rejectedChallengeIds?: unknown }).rejectedChallengeIds;
	if (
		rejectedValue !== undefined &&
		(!Array.isArray(rejectedValue) ||
			rejectedValue.some(
				(id) => typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,159}$/u.test(id)
			) ||
			new Set(rejectedValue).size !== rejectedValue.length)
	) {
		throw new Error('Challenge progress sync returned invalid rejected challenge ids.');
	}
	return {
		progress: recognizedProgress(progress),
		rejectedChallengeIds: rejectedValue ?? []
	};
}

async function postAndCacheProgress(
	userId: string,
	candidate: ChallengeProgress,
	storage: ChallengeProgressStorage,
	initialConfirmed?: ChallengeProgress | null
): Promise<ChallengeProgress> {
	const latestBeforeRequest = recognizedProgress(readChallengeProgress(storage, userId));
	let outgoing = recognizedProgress(
		mergeChallengeProgress(latestBeforeRequest, recognizedProgress(candidate))
	);
	let remote = recognizedProgress(
		initialConfirmed ?? confirmedProgressByUser.get(userId) ?? emptyChallengeProgress()
	);
	// Preserve signed-in play locally even if this request fails.
	writeChallengeProgress(outgoing, storage, userId);

	while (true) {
		const pending = unconfirmedProgress(remote, outgoing);
		for (const chunk of challengeProgressRequestChunks(pending)) {
			const response = await fetchWithResponseTimeout(CHALLENGE_PROGRESS_SYNC_ENDPOINT, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: progressRequestBody(chunk)
			});
			const responseState = await responseProgress(response);
			const rejectedIds = new Set(responseState.rejectedChallengeIds);
			const confirmedChunk = withoutChallengeIds(chunk, rejectedIds);
			if (!progressConfirms(responseState.progress, confirmedChunk)) {
				throw new Error('Challenge progress sync did not confirm every submitted result.');
			}
			if (rejectedIds.size > 0) {
				outgoing = withoutChallengeIds(outgoing, rejectedIds);
				writeChallengeProgress(
					withoutChallengeIds(readChallengeProgress(storage, userId), rejectedIds),
					storage,
					userId
				);
				writeChallengeProgress(
					withoutChallengeIds(readChallengeProgress(storage), rejectedIds),
					storage
				);
			}
			remote = recognizedProgress(mergeChallengeProgress(remote, responseState.progress));
		}
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
 * Sends only state not covered by a known server confirmation, split into
 * bounded requests when a complete cache import is required. Calls for the same
 * user are serialized so an older response cannot overwrite a newer local
 * stage or personal best.
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
			return await postAndCacheProgress(uid, candidate, storage, confirmed);
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
				const merged = await postAndCacheProgress(uid, candidate, storage, seed);
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
