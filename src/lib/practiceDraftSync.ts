import {
	practiceDraftBatchWithinSyncLimit,
	practiceDraftPayloadWithinSyncLimit,
	type PracticeDraftSave,
	type SavedPracticeDraft
} from '$lib/practiceDrafts';
import { clearBackgroundSyncIssue, reportBackgroundSyncIssue } from '$lib/backgroundSync';
import {
	classifyRequestFailure,
	fetchWithResponseTimeout,
	requestErrorFromResponse
} from '$lib/requestFailure';
import { markHomeSnapshotDirty } from '$lib/homeSnapshotClient';

const queueKeyPrefix = 'question-constellation:practice-draft-queue:v1:';
const flushDelayMs = 20_000;
const maxBatchSize = 50;
const maxKeepaliveBatchSize = 10;
const maxKeepaliveBodyBytes = 60 * 1024;
const draftEndpoint = '/api/question-drafts';

const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const installedListeners = new Map<string, { count: number; cleanup: () => void }>();

type Queue = Record<string, PracticeDraftSave>;

function storageAvailable() {
	return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function queueKey(userId: string) {
	return `${queueKeyPrefix}${userId}`;
}

function syncIssueId(userId: string) {
	return `practice-drafts:${userId}`;
}

function reportDraftSyncFailure(userId: string, error: unknown) {
	reportBackgroundSyncIssue({
		id: syncIssueId(userId),
		failure: classifyRequestFailure(error, {
			action: 'sync your saved answer',
			serverLabel: 'Answer sync'
		}),
		retry: async () => {
			await flushPracticeDraftQueue(userId);
		}
	});
}

function reportOversizedDraft(userId: string) {
	reportBackgroundSyncIssue({
		id: syncIssueId(userId),
		failure: {
			kind: 'invalid',
			title: "Couldn't sync this saved answer",
			message:
				'This long practice history is still saved in this browser, but it is too large to sync to another device. Resetting the practice will create a smaller cloud draft.',
			retryable: false,
			reference: null,
			status: 400
		},
		retry: () => {}
	});
}

function readQueue(userId: string): Queue {
	if (!storageAvailable()) return {};
	try {
		const raw = window.localStorage.getItem(queueKey(userId));
		return raw ? (JSON.parse(raw) as Queue) : {};
	} catch {
		return {};
	}
}

function writeQueue(userId: string, queue: Queue) {
	if (!storageAvailable()) return;
	try {
		const key = queueKey(userId);
		if (Object.keys(queue).length === 0) {
			window.localStorage.removeItem(key);
			return;
		}
		window.localStorage.setItem(key, JSON.stringify(queue));
	} catch {
		// Keep the in-memory UI usable when storage is unavailable or full.
	}
}

function draftRequestBody(drafts: PracticeDraftSave[]) {
	return JSON.stringify({ drafts });
}

function draftRequestBodyBytes(drafts: PracticeDraftSave[]) {
	return new TextEncoder().encode(draftRequestBody(drafts)).byteLength;
}

export function practiceDraftSyncBatches(
	drafts: PracticeDraftSave[],
	options: { keepalive?: boolean } = {}
) {
	const batches: PracticeDraftSave[][] = [];
	const deferred: PracticeDraftSave[] = [];
	const maxItems = options.keepalive ? maxKeepaliveBatchSize : maxBatchSize;
	let current: PracticeDraftSave[] = [];

	for (const draft of drafts) {
		if (options.keepalive && draftRequestBodyBytes([draft]) > maxKeepaliveBodyBytes) {
			deferred.push(draft);
			continue;
		}
		const candidate = [...current, draft];
		const candidateFits =
			candidate.length <= maxItems &&
			practiceDraftBatchWithinSyncLimit(candidate) &&
			(!options.keepalive || draftRequestBodyBytes(candidate) <= maxKeepaliveBodyBytes);
		if (!candidateFits && current.length > 0) {
			batches.push(current);
			current = [];
		}
		current.push(draft);
	}
	if (current.length > 0) batches.push(current);
	return { batches, deferred };
}

function scheduleFlush(userId: string) {
	if (flushTimers.has(userId)) return;
	flushTimers.set(
		userId,
		setTimeout(() => {
			flushTimers.delete(userId);
			void flushPracticeDraftQueue(userId);
		}, flushDelayMs)
	);
}

export function queuedPracticeDraftForQuestion(
	userId: string | null | undefined,
	questionId: string
): PracticeDraftSave | null {
	if (!userId) return null;
	return readQueue(userId)[questionId] ?? null;
}

export function latestPracticeDraft(
	remoteDraft: SavedPracticeDraft | null | undefined,
	localDraft: PracticeDraftSave | null | undefined
): SavedPracticeDraft | PracticeDraftSave | null {
	if (!remoteDraft) return localDraft ?? null;
	if (!localDraft) return remoteDraft;
	return localDraft.clientUpdatedAt >= remoteDraft.clientUpdatedAt ? localDraft : remoteDraft;
}

export function queuePracticeDraft(userId: string | null | undefined, draft: PracticeDraftSave) {
	if (!userId) return;
	if (!practiceDraftPayloadWithinSyncLimit(draft.payload)) {
		reportOversizedDraft(userId);
		return;
	}
	const queue = readQueue(userId);
	const previous = queue[draft.questionId];
	if (previous && previous.clientUpdatedAt > draft.clientUpdatedAt) return;
	queue[draft.questionId] = draft;
	writeQueue(userId, queue);
	scheduleFlush(userId);
}

function removeSentDrafts(userId: string, sentDrafts: PracticeDraftSave[]) {
	const queue = readQueue(userId);
	let changed = false;
	for (const draft of sentDrafts) {
		const current = queue[draft.questionId];
		if (!current) continue;
		if (current.clientUpdatedAt !== draft.clientUpdatedAt) continue;
		delete queue[draft.questionId];
		changed = true;
	}
	if (changed) writeQueue(userId, queue);
}

export async function flushPracticeDraftQueue(
	userId: string | null | undefined,
	options: { keepalive?: boolean } = {}
) {
	if (!userId || typeof fetch === 'undefined') return true;
	const queue = readQueue(userId);
	const queuedDrafts = Object.values(queue).sort(
		(left, right) => left.clientUpdatedAt - right.clientUpdatedAt
	);
	if (queuedDrafts.length === 0) {
		clearBackgroundSyncIssue(syncIssueId(userId));
		return true;
	}
	const oversizedDrafts = queuedDrafts.filter(
		(draft) => !practiceDraftPayloadWithinSyncLimit(draft.payload)
	);
	if (oversizedDrafts.length > 0) {
		removeSentDrafts(userId, oversizedDrafts);
		if (!options.keepalive) reportOversizedDraft(userId);
	}
	const drafts = queuedDrafts.filter((draft) => practiceDraftPayloadWithinSyncLimit(draft.payload));
	if (drafts.length === 0) return oversizedDrafts.length === 0;

	const { batches } = practiceDraftSyncBatches(drafts, options);
	let savedBatchCount = 0;
	for (const batch of batches) {
		let response: Response;
		try {
			response = await fetchWithResponseTimeout(draftEndpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: draftRequestBody(batch),
				keepalive: options.keepalive
			});
		} catch (error) {
			if (!options.keepalive) reportDraftSyncFailure(userId, error);
			// The server saves a batch row-by-row. A timeout/error can follow a
			// partial commit, so conservatively latch one later snapshot refresh.
			markHomeSnapshotDirty();
			scheduleFlush(userId);
			return false;
		}

		if (!response.ok) {
			if (!options.keepalive) {
				reportDraftSyncFailure(
					userId,
					await requestErrorFromResponse(response, 'Answer draft sync failed.')
				);
			}
			markHomeSnapshotDirty();
			scheduleFlush(userId);
			return false;
		}

		removeSentDrafts(userId, batch);
		savedBatchCount += 1;
	}

	if (Object.keys(readQueue(userId)).length > 0) {
		scheduleFlush(userId);
	} else if (oversizedDrafts.length === 0) {
		clearBackgroundSyncIssue(syncIssueId(userId));
	}
	if (savedBatchCount > 0) markHomeSnapshotDirty();
	return oversizedDrafts.length === 0;
}

export function installPracticeDraftWindowFlush(userId: string | null | undefined) {
	if (!userId || typeof window === 'undefined') return () => {};
	const installed = installedListeners.get(userId);
	if (installed) {
		installed.count += 1;
		return () => {
			installed.count -= 1;
			if (installed.count > 0) return;
			installed.cleanup();
			installedListeners.delete(userId);
		};
	}

	const flush = (keepalive = false) => {
		void flushPracticeDraftQueue(userId, { keepalive });
	};
	const flushOnVisibilityChange = () => {
		if (document.visibilityState === 'hidden') flush(true);
	};
	const flushOnLeave = () => flush(true);
	const flushOnReturn = () => flush(false);

	document.addEventListener('visibilitychange', flushOnVisibilityChange);
	window.addEventListener('pagehide', flushOnLeave);
	window.addEventListener('beforeunload', flushOnLeave);
	window.addEventListener('online', flushOnReturn);
	window.addEventListener('focus', flushOnReturn);
	window.addEventListener('pageshow', flushOnReturn);

	const cleanup = () => {
		document.removeEventListener('visibilitychange', flushOnVisibilityChange);
		window.removeEventListener('pagehide', flushOnLeave);
		window.removeEventListener('beforeunload', flushOnLeave);
		window.removeEventListener('online', flushOnReturn);
		window.removeEventListener('focus', flushOnReturn);
		window.removeEventListener('pageshow', flushOnReturn);
	};
	installedListeners.set(userId, { count: 1, cleanup });
	return () => {
		const current = installedListeners.get(userId);
		if (!current) return;
		current.count -= 1;
		if (current.count > 0) return;
		current.cleanup();
		installedListeners.delete(userId);
	};
}
