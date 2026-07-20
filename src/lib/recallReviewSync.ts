import {
	classifyRequestFailure,
	fetchWithResponseTimeout,
	requestErrorFromResponse,
	type RequestFailure
} from '$lib/requestFailure';
import { markHomeSnapshotDirty } from '$lib/homeSnapshotClient';

export type RecallReviewSave = {
	id: string;
	cardId: string;
	contentRevision: number;
	contentHash: string;
	grade: 'again' | 'hard' | 'good' | 'easy';
	mode: 'recall' | 'recognise' | 'reverse' | 'true_false';
	selectedChoiceKey: string | null;
	statementChoiceKey: string | null;
	selectedTruth: boolean | null;
	sourceSessionId: string;
	responseDurationMs: number | null;
	createdAt: number;
};

export type RecallReviewFlushResult = {
	ok: boolean;
	failure: RequestFailure | null;
	pendingCount: number;
	discardedCount: number;
};

const queueKeyPrefix = 'question-constellation:recall-review-queue:v4:';

function queueKey(userId: string) {
	return `${queueKeyPrefix}${userId}`;
}

function readQueue(userId: string): RecallReviewSave[] {
	if (typeof window === 'undefined') return [];
	try {
		const parsed = JSON.parse(window.localStorage.getItem(queueKey(userId)) ?? '[]');
		return Array.isArray(parsed) ? parsed.filter(isRecallReviewSave) : [];
	} catch {
		return [];
	}
}

function writeQueue(userId: string, queue: RecallReviewSave[]) {
	if (typeof window === 'undefined') return;
	try {
		if (queue.length === 0) {
			window.localStorage.removeItem(queueKey(userId));
			return;
		}
		window.localStorage.setItem(queueKey(userId), JSON.stringify(queue.slice(-500)));
	} catch {
		// Recall progress is also stored locally by the page, so review remains usable.
	}
}

function reviewId() {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function queueRecallReview(
	userId: string,
	review: Omit<RecallReviewSave, 'id' | 'createdAt'>
) {
	const queue = readQueue(userId);
	queue.push({ ...review, id: reviewId(), createdAt: Date.now() });
	writeQueue(userId, queue);
}

export function pendingRecallReviewCount(userId: string) {
	return readQueue(userId).length;
}

export async function flushRecallReviewQueue(userId: string): Promise<RecallReviewFlushResult> {
	let discardedCount = 0;
	let savedCount = 0;
	while (true) {
		const review = readQueue(userId)[0];
		if (!review) {
			if (savedCount > 0) markHomeSnapshotDirty();
			return { ok: true, failure: null, pendingCount: 0, discardedCount };
		}
		try {
			const response = await fetchWithResponseTimeout('/api/recall/review', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					reviewId: review.id,
					cardId: review.cardId,
					contentRevision: review.contentRevision,
					contentHash: review.contentHash,
					grade: review.grade,
					mode: review.mode,
					selectedChoiceKey: review.selectedChoiceKey,
					statementChoiceKey: review.statementChoiceKey,
					selectedTruth: review.selectedTruth,
					sourceSessionId: review.sourceSessionId,
					responseDurationMs: review.responseDurationMs,
					createdAt: review.createdAt
				})
			});
			if (isTerminalReviewResponse(response)) {
				// Evidence/component state may already have committed before a
				// later terminal response. A deferred refresh is safe on no-ops.
				markHomeSnapshotDirty();
				writeQueue(
					userId,
					readQueue(userId).filter((queuedReview) => queuedReview.id !== review.id)
				);
				discardedCount += 1;
				continue;
			}
			if (!response.ok) {
				throw await requestErrorFromResponse(response, 'Recall progress sync failed.');
			}
			writeQueue(
				userId,
				readQueue(userId).filter((queuedReview) => queuedReview.id !== review.id)
			);
			savedCount += 1;
		} catch (error) {
			const pendingCount = readQueue(userId).length;
			markHomeSnapshotDirty();
			return {
				ok: false,
				failure: classifyRequestFailure(error, {
					action: 'sync this recall progress',
					serverLabel: 'Recall sync'
				}),
				pendingCount,
				discardedCount
			};
		}
	}
}

function isRecallReviewSave(value: unknown): value is RecallReviewSave {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const review = value as Partial<RecallReviewSave>;
	return (
		typeof review.id === 'string' &&
		review.id === review.id.trim() &&
		review.id.length >= 1 &&
		review.id.length <= 128 &&
		typeof review.cardId === 'string' &&
		review.cardId === review.cardId.trim() &&
		review.cardId.length >= 1 &&
		Number.isInteger(review.contentRevision) &&
		(review.contentRevision ?? 0) >= 1 &&
		typeof review.contentHash === 'string' &&
		review.contentHash === review.contentHash.trim() &&
		review.contentHash.length >= 1 &&
		review.contentHash.length <= 256 &&
		['again', 'hard', 'good', 'easy'].includes(review.grade ?? '') &&
		['recall', 'recognise', 'reverse', 'true_false'].includes(review.mode ?? '') &&
		(review.mode === 'recognise'
			? typeof review.selectedChoiceKey === 'string' &&
				review.selectedChoiceKey === review.selectedChoiceKey.trim() &&
				review.selectedChoiceKey.length >= 1 &&
				review.selectedChoiceKey.length <= 80
			: review.selectedChoiceKey === null) &&
		(review.mode === 'true_false'
			? typeof review.statementChoiceKey === 'string' &&
				review.statementChoiceKey === review.statementChoiceKey.trim() &&
				review.statementChoiceKey.length >= 1 &&
				review.statementChoiceKey.length <= 80 &&
				typeof review.selectedTruth === 'boolean'
			: review.statementChoiceKey === null && review.selectedTruth === null) &&
		typeof review.sourceSessionId === 'string' &&
		review.sourceSessionId === review.sourceSessionId.trim() &&
		review.sourceSessionId.length >= 1 &&
		review.sourceSessionId.length <= 128 &&
		(review.responseDurationMs === null ||
			(typeof review.responseDurationMs === 'number' &&
				Number.isInteger(review.responseDurationMs) &&
				review.responseDurationMs >= 0 &&
				review.responseDurationMs <= 6 * 60 * 60 * 1000)) &&
		typeof review.createdAt === 'number' &&
		Number.isInteger(review.createdAt) &&
		review.createdAt > 0 &&
		review.createdAt >= Date.UTC(2020, 0, 1) &&
		review.createdAt <= Date.now() + 5 * 60 * 1000
	);
}

function isTerminalReviewResponse(response: Response): boolean {
	return (
		response.status >= 400 &&
		response.status < 500 &&
		![401, 403, 408, 425, 429].includes(response.status)
	);
}
