import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	flushRecallReviewQueue,
	pendingRecallReviewCount,
	queueRecallReview
} from './recallReviewSync';

class MemoryStorage {
	private values = new Map<string, string>();
	getItem(key: string) {
		return this.values.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		this.values.set(key, value);
	}
	removeItem(key: string) {
		this.values.delete(key);
	}
}

const review = (cardId: string, contentRevision = 3, contentHash = `${cardId}-hash`) => ({
	cardId,
	contentRevision,
	contentHash,
	grade: 'good' as const,
	mode: 'recall' as const,
	selectedChoiceKey: null,
	sourceSessionId: 'recall-session-1',
	responseDurationMs: 4_200
});

describe('recall review sync queue', () => {
	beforeEach(() => {
		vi.stubGlobal('window', { localStorage: new MemoryStorage() });
	});

	afterEach(() => vi.unstubAllGlobals());

	it('does not lose a content-versioned review queued while a flush is in flight', async () => {
		let resolveFirst: (response: Response) => void = () => {};
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						resolveFirst = resolve;
					})
			)
			.mockResolvedValue(new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		queueRecallReview('user-1', review('card-1'));
		const flush = flushRecallReviewQueue('user-1');
		queueRecallReview('user-1', review('card-2', 7, 'new-content-hash'));
		resolveFirst(new Response('{}', { status: 200 }));

		await expect(flush).resolves.toMatchObject({
			ok: true,
			pendingCount: 0,
			discardedCount: 0
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
			cardId: 'card-1',
			contentRevision: 3,
			contentHash: 'card-1-hash',
			sourceSessionId: 'recall-session-1',
			responseDurationMs: 4_200
		});
		expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
			cardId: 'card-2',
			contentRevision: 7,
			contentHash: 'new-content-hash'
		});
		expect(pendingRecallReviewCount('user-1')).toBe(0);
	});

	it('discards an explicitly stale review and continues with current queued content', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: 'stale_recall_card' }), {
					status: 409,
					headers: { 'content-type': 'application/json' }
				})
			)
			.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		queueRecallReview('user-1', review('card-old', 1, 'retired-hash'));
		queueRecallReview('user-1', review('card-current', 2, 'current-hash'));

		await expect(flushRecallReviewQueue('user-1')).resolves.toMatchObject({
			ok: true,
			pendingCount: 0,
			discardedCount: 1
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(pendingRecallReviewCount('user-1')).toBe(0);
	});

	it('discards an out-of-scope review and continues with later valid work', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: 'outside_curriculum_scope' }), {
					status: 409,
					headers: { 'content-type': 'application/json' }
				})
			)
			.mockResolvedValue(new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		queueRecallReview('user-1', review('card-1'));
		queueRecallReview('user-1', review('card-2'));
		await expect(flushRecallReviewQueue('user-1')).resolves.toMatchObject({
			ok: true,
			pendingCount: 0,
			discardedCount: 1
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(pendingRecallReviewCount('user-1')).toBe(0);
	});

	it('retains retryable server and authentication failures', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('{}', { status: 500 }))
			.mockResolvedValueOnce(new Response('{}', { status: 401 }));
		vi.stubGlobal('fetch', fetchMock);

		queueRecallReview('user-1', review('card-1'));
		for (let attempt = 0; attempt < 2; attempt += 1) {
			await expect(flushRecallReviewQueue('user-1')).resolves.toMatchObject({
				ok: false,
				pendingCount: 1,
				discardedCount: 0
			});
		}
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(pendingRecallReviewCount('user-1')).toBe(1);
	});

	it('filters locally corrupted rows using the API field constraints', () => {
		window.localStorage.setItem(
			'question-constellation:recall-review-queue:v3:user-1',
			JSON.stringify([
				{
					id: 'bad-review',
					...review('card-1'),
					responseDurationMs: -1,
					createdAt: Date.now()
				},
				{
					id: 'bad-time',
					...review('card-2'),
					createdAt: Date.UTC(2019, 11, 31)
				},
				{
					id: 'future-time',
					...review('card-3'),
					createdAt: Date.now() + 6 * 60 * 1000
				}
			])
		);

		expect(pendingRecallReviewCount('user-1')).toBe(0);
	});

	it('discards a permanent invalid-clock response instead of blocking the queue', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: 'invalid_created_at' }), { status: 400 })
			)
			.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		queueRecallReview('user-1', review('card-1'));
		queueRecallReview('user-1', review('card-2'));

		await expect(flushRecallReviewQueue('user-1')).resolves.toMatchObject({
			ok: true,
			pendingCount: 0,
			discardedCount: 1
		});
	});

	it('persists the server-owned choice key across an offline retry', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('{}', { status: 500 }))
			.mockResolvedValueOnce(new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		queueRecallReview('user-1', {
			...review('card-1'),
			grade: 'again',
			mode: 'recognise',
			selectedChoiceKey: 'confuses-antibodies'
		});

		await expect(flushRecallReviewQueue('user-1')).resolves.toMatchObject({
			ok: false,
			pendingCount: 1
		});
		await expect(flushRecallReviewQueue('user-1')).resolves.toMatchObject({
			ok: true,
			pendingCount: 0
		});
		const first = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		const second = JSON.parse(fetchMock.mock.calls[1][1].body as string);
		expect(first.selectedChoiceKey).toBe('confuses-antibodies');
		expect(second).toEqual(first);
	});
});
