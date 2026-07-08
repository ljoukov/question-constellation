import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	flushPracticeDraftQueue,
	queuePracticeDraft,
	queuedPracticeDraftForQuestion
} from './practiceDraftSync';
import type { PracticeDraftSave } from './practiceDrafts';

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

function draft(questionId: string, clientUpdatedAt: number): PracticeDraftSave {
	return {
		questionId,
		draftKind: 'science-practice',
		answerText: `answer ${questionId}`,
		payload: { answerText: `answer ${questionId}` },
		clientUpdatedAt
	};
}

function okResponse() {
	return Promise.resolve({ ok: true } as Response);
}

describe('practice draft sync queue', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('window', {
			localStorage: new MemoryStorage()
		});
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('flushes every pending draft, not only the current question', async () => {
		const fetchMock = vi.fn(() => okResponse());
		vi.stubGlobal('fetch', fetchMock);

		queuePracticeDraft('user-1', draft('q1', 100));
		queuePracticeDraft('user-1', draft('q2', 200));

		await expect(flushPracticeDraftQueue('user-1')).resolves.toBe(true);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		const body = JSON.parse(String(firstCall[1].body)) as {
			drafts: PracticeDraftSave[];
		};
		expect(body.drafts.map((item) => item.questionId)).toEqual(['q1', 'q2']);
		expect(queuedPracticeDraftForQuestion('user-1', 'q1')).toBeNull();
		expect(queuedPracticeDraftForQuestion('user-1', 'q2')).toBeNull();
	});

	it('keeps failed drafts and sends them with the next successful flush', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: false } as Response)
			.mockImplementation(() => okResponse());
		vi.stubGlobal('fetch', fetchMock);

		queuePracticeDraft('user-1', draft('q1', 100));
		await expect(flushPracticeDraftQueue('user-1')).resolves.toBe(false);
		queuePracticeDraft('user-1', draft('q2', 200));
		await expect(flushPracticeDraftQueue('user-1')).resolves.toBe(true);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const retryCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
		const retryBody = JSON.parse(String(retryCall[1].body)) as {
			drafts: PracticeDraftSave[];
		};
		expect(retryBody.drafts.map((item) => item.questionId)).toEqual(['q1', 'q2']);
	});

	it('does not drop a newer local edit while an older flush is in flight', async () => {
		let resolveFetch: (response: Response) => void = () => {};
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveFetch = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		queuePracticeDraft('user-1', draft('q1', 100));
		const flushPromise = flushPracticeDraftQueue('user-1');
		queuePracticeDraft('user-1', draft('q1', 200));
		resolveFetch({ ok: true } as Response);

		await expect(flushPromise).resolves.toBe(true);
		expect(queuedPracticeDraftForQuestion('user-1', 'q1')?.clientUpdatedAt).toBe(200);
	});
});
