import { afterEach, describe, expect, it, vi } from 'vitest';
import { authoredChallengeIds, challengeIds } from './catalogIdentity';
import { generatedScienceChallengeDefinitions } from './generatedRuntime';
import {
	mergeChallengeProgress,
	parseChallengeProgress,
	type ChallengeProgress,
	type ChallengeProgressEntry
} from './progress';
import {
	CHALLENGE_PROGRESS_SYNC_MAX_REQUEST_BYTES,
	challengeProgressRequestChunks,
	syncChallengeProgress
} from './progressSync';

function entry(): ChallengeProgressEntry {
	return {
		startedAt: '2026-07-17T10:00:00.000Z',
		updatedAt: '2026-07-17T10:02:00.000Z',
		completedAt: '2026-07-17T10:02:00.000Z',
		plays: 1,
		lastStage: 'complete',
		bestScore: 450,
		bestTimeMs: 120_000,
		lastScore: 450,
		lastTimeMs: 120_000
	};
}

function memoryStorage() {
	const values = new Map<string, string>();
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

describe('release-sized challenge progress sync', () => {
	it('normalizes, merges and syncs every accepted runtime challenge without mocking the catalog', async () => {
		const retiredId = 'retired-generated-challenge';
		const generatedChallenge = generatedScienceChallengeDefinitions[0];
		const probeId = generatedChallenge?.id ?? authoredChallengeIds[0];
		const parsed = parseChallengeProgress(
			JSON.stringify({
				version: 2,
				challenges: {
					[probeId]: entry(),
					[retiredId]: entry()
				}
			})
		);
		const catalogProgress: ChallengeProgress = {
			version: 2,
			challenges: Object.fromEntries(challengeIds.map((id) => [id, entry()]))
		};
		const local = mergeChallengeProgress(catalogProgress, parsed);
		const acceptedIds = new Set(challengeIds);
		const expected = {
			version: 2,
			challenges: Object.fromEntries(
				Object.entries(local.challenges).filter(([id]) => acceptedIds.has(id))
			)
		} satisfies ChallengeProgress;
		let remote: ChallengeProgress = { version: 2, challenges: {} };
		const requestSizes: number[] = [];
		const requestedIds = new Set<string>();
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const body = String(init?.body);
			requestSizes.push(new TextEncoder().encode(body).byteLength);
			const request = JSON.parse(body) as { progress: ChallengeProgress };
			for (const id of Object.keys(request.progress.challenges)) requestedIds.add(id);
			remote = mergeChallengeProgress(remote, request.progress);
			return new Response(JSON.stringify({ progress: remote }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		const confirmed = await syncChallengeProgress('release-catalog-user', local, memoryStorage());

		expect(fetchMock).toHaveBeenCalledTimes(challengeProgressRequestChunks(expected).length);
		expect(requestSizes.every((size) => size <= CHALLENGE_PROGRESS_SYNC_MAX_REQUEST_BYTES)).toBe(
			true
		);
		expect(requestedIds).toEqual(new Set(challengeIds));
		expect(requestedIds.has(retiredId)).toBe(false);
		expect(confirmed).toEqual(expected);
		expect(remote).toEqual(expected);

		if (generatedChallenge) {
			expect(challengeIds).toContain(generatedChallenge.id);
			expect(requestedIds).toContain(generatedChallenge.id);
			expect(confirmed.challenges[generatedChallenge.id]).toEqual(entry());
		} else {
			expect(challengeIds).toEqual(authoredChallengeIds);
		}
	});
});
