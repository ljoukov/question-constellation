import {
	classifyRequestFailure,
	fetchWithResponseTimeout,
	requestErrorFromResponse,
	type RequestFailure
} from '$lib/requestFailure';

export type RecallReviewSave = {
	id: string;
	cardId: string;
	grade: 'again' | 'hard' | 'good' | 'easy';
	mode: 'recall' | 'recognise' | 'reverse';
	sourceSessionId: string;
	responseDurationMs: number | null;
	createdAt: number;
};

export type RecallReviewFlushResult = {
	ok: boolean;
	failure: RequestFailure | null;
	pendingCount: number;
};

const queueKeyPrefix = 'question-constellation:recall-review-queue:v1:';

function queueKey(userId: string) {
	return `${queueKeyPrefix}${userId}`;
}

function readQueue(userId: string): RecallReviewSave[] {
	if (typeof window === 'undefined') return [];
	try {
		const parsed = JSON.parse(window.localStorage.getItem(queueKey(userId)) ?? '[]');
		return Array.isArray(parsed) ? (parsed as RecallReviewSave[]) : [];
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
	while (true) {
		const review = readQueue(userId)[0];
		if (!review) return { ok: true, failure: null, pendingCount: 0 };
		try {
			const response = await fetchWithResponseTimeout('/api/recall/review', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					reviewId: review.id,
					cardId: review.cardId,
					grade: review.grade,
					mode: review.mode,
					sourceSessionId: review.sourceSessionId,
					responseDurationMs: review.responseDurationMs,
					createdAt: review.createdAt
				})
			});
			if (!response.ok) {
				throw await requestErrorFromResponse(response, 'Recall progress sync failed.');
			}
			writeQueue(
				userId,
				readQueue(userId).filter((queuedReview) => queuedReview.id !== review.id)
			);
		} catch (error) {
			const pendingCount = readQueue(userId).length;
			return {
				ok: false,
				failure: classifyRequestFailure(error, {
					action: 'sync this recall progress',
					serverLabel: 'Recall sync'
				}),
				pendingCount
			};
		}
	}
}
