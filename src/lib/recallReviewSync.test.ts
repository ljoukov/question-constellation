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

const review = (cardId: string) => ({
	cardId,
	grade: 'good' as const,
	mode: 'recall' as const
});

describe('recall review sync queue', () => {
	beforeEach(() => {
		vi.stubGlobal('window', { localStorage: new MemoryStorage() });
	});

	afterEach(() => vi.unstubAllGlobals());

	it('does not lose a review queued while a flush is in flight', async () => {
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
		queueRecallReview('user-1', review('card-2'));
		resolveFirst(new Response('{}', { status: 200 }));

		await expect(flush).resolves.toMatchObject({ ok: true, pendingCount: 0 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(pendingRecallReviewCount('user-1')).toBe(0);
	});

	it('retains failed reviews for a later retry', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('{}', { status: 500 }))
			.mockResolvedValue(new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		queueRecallReview('user-1', review('card-1'));
		await expect(flushRecallReviewQueue('user-1')).resolves.toMatchObject({
			ok: false,
			pendingCount: 1
		});
		expect(pendingRecallReviewCount('user-1')).toBe(1);

		await expect(flushRecallReviewQueue('user-1')).resolves.toMatchObject({
			ok: true,
			pendingCount: 0
		});
	});
});
