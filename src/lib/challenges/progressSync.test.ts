import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	CHALLENGE_PROGRESS_GUEST_STORAGE_KEY,
	challengeProgressStorageKey,
	type ChallengeProgress,
	type ChallengeProgressEntry
} from './progress';
import { importGuestChallengeProgress, syncChallengeProgress } from './progressSync';

function entry(overrides: Partial<ChallengeProgressEntry> = {}): ChallengeProgressEntry {
	return {
		startedAt: '2026-07-17T10:00:00.000Z',
		updatedAt: '2026-07-17T10:02:00.000Z',
		completedAt: '2026-07-17T10:02:00.000Z',
		plays: 1,
		lastStage: 'complete',
		bestScore: 450,
		bestTimeMs: 120_000,
		lastScore: 450,
		lastTimeMs: 120_000,
		...overrides
	};
}

function progress(id: string, value: ChallengeProgressEntry): ChallengeProgress {
	return { version: 2, challenges: { [id]: value } };
}

function memoryStorage(seed: Record<string, string> = {}) {
	const values = new Map(Object.entries(seed));
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		removeItem: (key: string) => values.delete(key)
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('challenge progress sync', () => {
	it('merges guest and account state, writes the confirmed result, then clears guest state', async () => {
		const accountKey = challengeProgressStorageKey('user-1');
		const storage = memoryStorage({
			[CHALLENGE_PROGRESS_GUEST_STORAGE_KEY]: JSON.stringify(
				progress('biology-data-conclusions', entry({ bestScore: 475, bestTimeMs: 150_000 }))
			),
			[accountKey]: JSON.stringify(
				progress('biology-data-conclusions', entry({ bestScore: 450, bestTimeMs: 80_000 }))
			)
		});
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const request = JSON.parse(String(init?.body)) as { progress: ChallengeProgress };
			return new Response(JSON.stringify({ progress: request.progress }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		const merged = await importGuestChallengeProgress('user-1', storage);

		expect(merged.challenges['biology-data-conclusions']).toMatchObject({
			bestScore: 475,
			bestTimeMs: 150_000
		});
		expect(JSON.parse(storage.values.get(accountKey) ?? '{}')).toEqual(merged);
		expect(storage.values.has(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY)).toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('accepts server canonicalization of an equal-timestamp transient result', async () => {
		const accountKey = challengeProgressStorageKey('canonical-user');
		const outgoing = progress(
			'biology-data-conclusions',
			entry({
				bestScore: 500,
				bestTimeMs: 45_000,
				lastScore: 500,
				lastTimeMs: 45_000
			})
		);
		const canonical = progress(
			'biology-data-conclusions',
			entry({
				bestScore: 500,
				bestTimeMs: 45_000,
				lastScore: null,
				lastTimeMs: null
			})
		);
		const storage = memoryStorage({
			[CHALLENGE_PROGRESS_GUEST_STORAGE_KEY]: JSON.stringify(outgoing)
		});
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ progress: canonical }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		const confirmed = await importGuestChallengeProgress('canonical-user', storage);

		expect(confirmed).toEqual(canonical);
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(storage.values.has(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY)).toBe(false);
		expect(JSON.parse(storage.values.get(accountKey) ?? '{}')).toEqual(canonical);
	});

	it('keeps guest progress when the server does not confirm the import', async () => {
		const accountKey = challengeProgressStorageKey('user-failure');
		const storage = memoryStorage({
			[CHALLENGE_PROGRESS_GUEST_STORAGE_KEY]: JSON.stringify(
				progress('biology-cell-differences', entry())
			)
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('Unavailable', { status: 503 }))
		);

		await expect(importGuestChallengeProgress('user-failure', storage)).rejects.toThrow();

		expect(storage.values.has(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY)).toBe(true);
		expect(
			(JSON.parse(storage.values.get(accountKey) ?? '{}') as ChallengeProgress).challenges[
				'biology-cell-differences'
			]
		).toEqual(entry());
	});

	it('uses a dominating home snapshot seed without an initial network request', async () => {
		const userId = 'seeded-user';
		const accountKey = challengeProgressStorageKey(userId);
		const serverSeed = progress(
			'biology-data-conclusions',
			entry({ bestScore: 475, lastScore: 475 })
		);
		const storage = memoryStorage({
			[accountKey]: JSON.stringify(
				progress('biology-data-conclusions', entry({ bestScore: 450, lastScore: 450 }))
			),
			[CHALLENGE_PROGRESS_GUEST_STORAGE_KEY]: JSON.stringify(
				progress('biology-data-conclusions', entry({ bestScore: 425, lastScore: 425 }))
			)
		});
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const merged = await importGuestChallengeProgress(userId, storage, serverSeed);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(merged).toEqual(serverSeed);
		expect(JSON.parse(storage.values.get(accountKey) ?? '{}')).toEqual(serverSeed);
		expect(storage.values.has(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY)).toBe(false);
	});

	it('uploads only a recognized local delta missing from the home snapshot seed', async () => {
		const userId = 'seed-with-delta';
		const accountKey = challengeProgressStorageKey(userId);
		const serverSeed = progress('biology-data-conclusions', entry());
		const storage = memoryStorage({
			[accountKey]: JSON.stringify(serverSeed),
			[CHALLENGE_PROGRESS_GUEST_STORAGE_KEY]: JSON.stringify(
				progress('biology-cell-differences', entry({ bestScore: 500, lastScore: 500 }))
			)
		});
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const request = JSON.parse(String(init?.body)) as { progress: ChallengeProgress };
			return new Response(JSON.stringify({ progress: request.progress }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		const merged = await importGuestChallengeProgress(userId, storage, serverSeed);

		expect(fetchMock).toHaveBeenCalledOnce();
		const outgoing = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
			progress: ChallengeProgress;
		};
		expect(Object.keys(outgoing.progress.challenges).sort()).toEqual([
			'biology-cell-differences',
			'biology-data-conclusions'
		]);
		expect(merged.challenges['biology-cell-differences']?.bestScore).toBe(500);
		expect(storage.values.has(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY)).toBe(false);
	});

	it('acknowledges and removes retired guest ids without a poison-loop request', async () => {
		const userId = 'retired-id-user';
		const accountKey = challengeProgressStorageKey(userId);
		const emptySeed: ChallengeProgress = { version: 2, challenges: {} };
		const storage = memoryStorage({
			[accountKey]: JSON.stringify(progress('retired-account-id', entry())),
			[CHALLENGE_PROGRESS_GUEST_STORAGE_KEY]: JSON.stringify(progress('retired-guest-id', entry()))
		});
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const merged = await importGuestChallengeProgress(userId, storage, emptySeed);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(merged).toEqual(emptySeed);
		expect(JSON.parse(storage.values.get(accountKey) ?? '{}')).toEqual(emptySeed);
		expect(storage.values.has(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY)).toBe(false);
	});

	it('skips later focus-style sync when the confirmed seed still dominates local state', async () => {
		const userId = 'confirmed-user';
		const accountKey = challengeProgressStorageKey(userId);
		const confirmed = progress('biology-data-conclusions', entry());
		const storage = memoryStorage({ [accountKey]: JSON.stringify(confirmed) });
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const result = await syncChallengeProgress(userId, undefined, storage, confirmed);

		expect(result).toEqual(confirmed);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('skips clean focus-style sync after canonical transient normalization', async () => {
		const userId = 'canonical-confirmed-user';
		const accountKey = challengeProgressStorageKey(userId);
		const local = progress(
			'biology-data-conclusions',
			entry({ bestScore: 500, lastScore: 500, lastTimeMs: 75_000 })
		);
		const confirmed = progress(
			'biology-data-conclusions',
			entry({ bestScore: 500, lastScore: null, lastTimeMs: null })
		);
		const storage = memoryStorage({ [accountKey]: JSON.stringify(local) });
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const result = await syncChallengeProgress(userId, undefined, storage, confirmed);

		expect(result).toEqual(confirmed);
		expect(JSON.parse(storage.values.get(accountKey) ?? '{}')).toEqual(confirmed);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('reuses an in-flight confirmation for a queued clean lifecycle sync', async () => {
		const userId = 'queued-clean-lifecycle-user';
		const accountKey = challengeProgressStorageKey(userId);
		const candidate = progress('biology-data-conclusions', entry());
		const storage = memoryStorage({ [accountKey]: JSON.stringify(candidate) });
		let resolveRequest: (response: Response) => void = () => {};
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveRequest = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		const initialSync = syncChallengeProgress(userId, candidate, storage);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		const queuedLifecycleSync = syncChallengeProgress(userId, undefined, storage, {
			version: 2,
			challenges: {}
		});
		resolveRequest(
			new Response(JSON.stringify({ progress: candidate }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);

		await expect(initialSync).resolves.toEqual(candidate);
		await expect(queuedLifecycleSync).resolves.toEqual(candidate);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('unions supplied and cached confirmations before repairing a stale local cache', async () => {
		const userId = 'combined-confirmation-user';
		const accountKey = challengeProgressStorageKey(userId);
		const supplied = progress('biology-data-conclusions', entry());
		const fullyConfirmed: ChallengeProgress = {
			version: 2,
			challenges: {
				...supplied.challenges,
				'biology-cell-differences': entry({
					updatedAt: '2026-07-17T10:04:00.000Z',
					bestScore: 500,
					lastScore: 500
				})
			}
		};
		const storage = memoryStorage({ [accountKey]: JSON.stringify(fullyConfirmed) });
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ progress: fullyConfirmed }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		await syncChallengeProgress(userId, fullyConfirmed, storage);
		storage.setItem(accountKey, JSON.stringify(supplied));
		const repaired = await syncChallengeProgress(userId, undefined, storage, supplied);

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(repaired).toEqual(fullyConfirmed);
		expect(JSON.parse(storage.values.get(accountKey) ?? '{}')).toEqual(fullyConfirmed);
	});

	it('does not POST an empty document on a direct non-home entry', async () => {
		const storage = memoryStorage();
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const result = await importGuestChallengeProgress('empty-direct-entry', storage);

		expect(result).toEqual({ version: 2, challenges: {} });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('uploads guest progress written while the first import request is in flight before clearing', async () => {
		const storage = memoryStorage({
			[CHALLENGE_PROGRESS_GUEST_STORAGE_KEY]: JSON.stringify(
				progress('biology-data-conclusions', entry())
			)
		});
		const pending: Array<{
			request: ChallengeProgress;
			resolve: (response: Response) => void;
		}> = [];
		const fetchMock = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((resolve) => {
					const body = JSON.parse(String(init?.body)) as { progress: ChallengeProgress };
					pending.push({ request: body.progress, resolve });
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		const importing = importGuestChallengeProgress('user-mid-flight', storage);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		storage.setItem(
			CHALLENGE_PROGRESS_GUEST_STORAGE_KEY,
			JSON.stringify({
				version: 2,
				challenges: {
					'biology-data-conclusions': entry(),
					'biology-cell-differences': entry({
						updatedAt: '2026-07-17T10:04:00.000Z',
						bestScore: 500,
						lastScore: 500
					})
				}
			} satisfies ChallengeProgress)
		);
		pending[0]?.resolve(
			new Response(JSON.stringify({ progress: pending[0].request }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);

		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(pending[1]?.request.challenges['biology-cell-differences']?.bestScore).toBe(500);
		pending[1]?.resolve(
			new Response(JSON.stringify({ progress: pending[1].request }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);
		const merged = await importing;

		expect(merged.challenges['biology-cell-differences']?.bestScore).toBe(500);
		expect(storage.values.has(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY)).toBe(false);
	});

	it('confirms account progress written while a sync request is in flight before returning', async () => {
		const userId = 'account-mid-flight';
		const accountKey = challengeProgressStorageKey(userId);
		const initial = progress('biology-data-conclusions', entry());
		const storage = memoryStorage({ [accountKey]: JSON.stringify(initial) });
		const pending: Array<{
			request: ChallengeProgress;
			resolve: (response: Response) => void;
		}> = [];
		const fetchMock = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((resolve) => {
					const body = JSON.parse(String(init?.body)) as { progress: ChallengeProgress };
					pending.push({ request: body.progress, resolve });
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		const syncing = syncChallengeProgress(userId, initial, storage);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		storage.setItem(
			accountKey,
			JSON.stringify({
				version: 2,
				challenges: {
					...initial.challenges,
					'biology-cell-differences': entry({
						updatedAt: '2026-07-17T10:04:00.000Z',
						bestScore: 500,
						lastScore: 500
					})
				}
			} satisfies ChallengeProgress)
		);
		pending[0]?.resolve(
			new Response(JSON.stringify({ progress: pending[0].request }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);

		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(pending[1]?.request.challenges['biology-cell-differences']?.bestScore).toBe(500);
		pending[1]?.resolve(
			new Response(JSON.stringify({ progress: pending[1].request }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);

		const confirmed = await syncing;
		expect(confirmed.challenges['biology-cell-differences']?.bestScore).toBe(500);
	});

	it('treats a malformed 200 progress document as non-confirmation', async () => {
		const storage = memoryStorage({
			[CHALLENGE_PROGRESS_GUEST_STORAGE_KEY]: JSON.stringify(
				progress('biology-cell-differences', entry())
			)
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				const malformed = progress('biology-cell-differences', entry()) as unknown as {
					version: 2;
					challenges: Record<string, Partial<ChallengeProgressEntry>>;
				};
				delete malformed.challenges['biology-cell-differences']?.updatedAt;
				return new Response(JSON.stringify({ progress: malformed }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				});
			})
		);

		await expect(importGuestChallengeProgress('user-malformed', storage)).rejects.toThrow(
			'invalid progress document'
		);
		expect(storage.values.has(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY)).toBe(true);
	});

	it('treats a canonical 200 response that drops an outgoing entry as non-confirmation', async () => {
		const storage = memoryStorage({
			[CHALLENGE_PROGRESS_GUEST_STORAGE_KEY]: JSON.stringify(
				progress('biology-cell-differences', entry())
			)
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ progress: { version: 2, challenges: {} } }), {
						status: 200,
						headers: { 'content-type': 'application/json' }
					})
			)
		);

		await expect(importGuestChallengeProgress('user-dropped', storage)).rejects.toThrow(
			'did not confirm every submitted result'
		);
		expect(storage.values.has(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY)).toBe(true);
	});

	it('rejects canonical responses that lose a submitted durable personal best', async () => {
		const outgoing = progress(
			'biology-data-conclusions',
			entry({ bestScore: 500, bestTimeMs: 45_000, lastScore: 500, lastTimeMs: 45_000 })
		);
		const weaker = progress(
			'biology-data-conclusions',
			entry({ bestScore: 475, bestTimeMs: 30_000, lastScore: null, lastTimeMs: null })
		);
		const storage = memoryStorage({
			[CHALLENGE_PROGRESS_GUEST_STORAGE_KEY]: JSON.stringify(outgoing)
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ progress: weaker }), {
						status: 200,
						headers: { 'content-type': 'application/json' }
					})
			)
		);

		await expect(importGuestChallengeProgress('user-weaker-best', storage)).rejects.toThrow(
			'did not confirm every submitted result'
		);
		expect(storage.values.has(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY)).toBe(true);
	});

	it('serializes concurrent writes for the same user', async () => {
		const storage = memoryStorage();
		const releases: Array<() => void> = [];
		const fetchMock = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((resolve) => {
					const request = JSON.parse(String(init?.body)) as { progress: ChallengeProgress };
					releases.push(() =>
						resolve(
							new Response(JSON.stringify({ progress: request.progress }), {
								status: 200,
								headers: { 'content-type': 'application/json' }
							})
						)
					);
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		const first = syncChallengeProgress(
			'serialized-user',
			progress('biology-data-conclusions', entry()),
			storage
		);
		const second = syncChallengeProgress(
			'serialized-user',
			progress('biology-cell-differences', entry()),
			storage
		);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		releases[0]?.();
		await first;
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		releases[1]?.();
		await second;

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const stored = JSON.parse(
			storage.values.get(challengeProgressStorageKey('serialized-user')) ?? '{}'
		) as ChallengeProgress;
		expect(Object.keys(stored.challenges).sort()).toEqual([
			'biology-cell-differences',
			'biology-data-conclusions'
		]);
	});
});
