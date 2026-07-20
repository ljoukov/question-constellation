import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUserChallengeProgress: vi.fn(),
	mergeUserChallengeProgress: vi.fn()
}));

vi.mock('$lib/server/challengeProgress', () => ({
	CHALLENGE_PROGRESS_FUTURE_TOLERANCE_MS: 5 * 60 * 1000,
	CHALLENGE_PROGRESS_MAX_ENTRIES: 60,
	CHALLENGE_PROGRESS_SCORE_VALUES: [400, 425, 450, 475, 500],
	getUserChallengeProgress: mocks.getUserChallengeProgress,
	mergeUserChallengeProgress: mocks.mergeUserChallengeProgress
}));

import type { ChallengeProgress } from '$lib/challenges/progress';
import { GET, POST } from './+server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};
const stored: ChallengeProgress = {
	version: 2,
	challenges: {
		'biology-data-conclusions': {
			startedAt: '2026-07-18T10:00:00.000Z',
			updatedAt: '2026-07-18T10:04:00.000Z',
			completedAt: '2026-07-18T10:04:00.000Z',
			plays: 1,
			lastStage: 'complete',
			bestScore: 400,
			bestTimeMs: 30_000,
			lastScore: 400,
			lastTimeMs: 30_000
		}
	}
};

function get(authenticated = true) {
	return GET({
		locals: { user: authenticated ? user : null }
	} as never);
}

function post(body: unknown, authenticated = true) {
	return POST({
		locals: { user: authenticated ? user : null },
		request: new Request('http://localhost/api/challenge-progress', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getUserChallengeProgress.mockResolvedValue(stored);
	mocks.mergeUserChallengeProgress.mockResolvedValue(stored);
});

describe('/api/challenge-progress', () => {
	it('requires authentication for reads and writes', async () => {
		expect((await get(false)).status).toBe(401);
		expect((await post({ progress: stored }, false)).status).toBe(401);
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
		expect(mocks.mergeUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('returns the authenticated learner progress', async () => {
		const response = await get();
		expect(response.status).toBe(200);
		expect(mocks.getUserChallengeProgress).toHaveBeenCalledWith(user.uid);
		expect(await response.json()).toEqual({ progress: stored });
	});

	it('rejects partial, malformed and unbounded v2 bodies', async () => {
		const partial = await post({
			progress: {
				version: 2,
				challenges: {
					'biology-data-conclusions': {
						startedAt: '2026-07-18T10:00:00.000Z',
						plays: 1,
						lastStage: 'complete'
					}
				}
			}
		});
		expect(partial.status).toBe(400);

		const excessive = await post({
			progress: {
				version: 2,
				challenges: Object.fromEntries(
					Array.from({ length: 101 }, (_, index) => [
						`challenge-${index}`,
						stored.challenges['biology-data-conclusions']
					])
				)
			}
		});
		expect(excessive.status).toBe(400);
		expect(mocks.mergeUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('rejects oversized bodies before parsing or merging them', async () => {
		const response = await post({
			progress: stored,
			padding: 'x'.repeat(70 * 1024)
		});

		expect(response.status).toBe(413);
		expect(mocks.mergeUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('rejects impossible scores and timestamps too far in the future', async () => {
		const invalidScore = structuredClone(stored);
		invalidScore.challenges['biology-data-conclusions'].bestScore = 499;
		expect((await post({ progress: invalidScore })).status).toBe(400);

		const future = structuredClone(stored);
		const timestamp = new Date(Date.now() + 10 * 60 * 1000).toISOString();
		future.challenges['biology-data-conclusions'].startedAt = timestamp;
		future.challenges['biology-data-conclusions'].updatedAt = timestamp;
		future.challenges['biology-data-conclusions'].completedAt = timestamp;
		expect((await post({ progress: future })).status).toBe(400);
		expect(mocks.mergeUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('passes a complete v2 body to the authenticated merge and returns its canonical result', async () => {
		const response = await post({ progress: stored });
		expect(response.status).toBe(200);
		expect(mocks.mergeUserChallengeProgress).toHaveBeenCalledWith(user.uid, stored);
		expect(await response.json()).toEqual({ progress: stored });
	});

	it('accepts a replay whose retained first completion predates the new run', async () => {
		const replay = structuredClone(stored);
		replay.challenges['biology-data-conclusions'] = {
			...replay.challenges['biology-data-conclusions'],
			startedAt: '2026-07-18T10:05:00.000Z',
			updatedAt: '2026-07-18T10:06:00.000Z',
			plays: 2,
			lastStage: 'showdown'
		};
		mocks.mergeUserChallengeProgress.mockResolvedValue(replay);

		const response = await post({ progress: replay });

		expect(response.status).toBe(200);
		expect(mocks.mergeUserChallengeProgress).toHaveBeenCalledWith(user.uid, replay);
	});

	it('allows the server layer to discard unknown catalogue IDs', async () => {
		const unknown = {
			version: 2,
			challenges: {
				'unknown-challenge': stored.challenges['biology-data-conclusions']
			}
		};
		mocks.mergeUserChallengeProgress.mockResolvedValue({ version: 2, challenges: {} });

		const response = await post({ progress: unknown });

		expect(response.status).toBe(200);
		expect(mocks.mergeUserChallengeProgress).toHaveBeenCalledWith(user.uid, unknown);
		expect(await response.json()).toEqual({ progress: { version: 2, challenges: {} } });
	});
});
