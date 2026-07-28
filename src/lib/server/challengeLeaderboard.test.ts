import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	executePersonalQuery: vi.fn(),
	queryPersonalFirst: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	executePersonalQuery: mocks.executePersonalQuery,
	queryPersonalFirst: mocks.queryPersonalFirst
}));

import {
	challengeLeaderboardAlias,
	challengeLeaderboardIdentityKey,
	getChallengeLeaderboard,
	updateChallengeLeaderboardProjection
} from './challengeLeaderboard';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.queryPersonalFirst.mockResolvedValue(null);
	mocks.executePersonalQuery.mockResolvedValue(undefined);
});

describe('challenge leaderboard', () => {
	it('creates a stable pseudonym without exposing identity text', async () => {
		const first = await challengeLeaderboardAlias('learner@example.test');
		const second = await challengeLeaderboardAlias('learner@example.test');

		expect(first).toBe(second);
		expect(first).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
		expect(first).not.toContain('learner');
		expect(first).not.toContain('@');
		expect(challengeLeaderboardIdentityKey('learner@example.test')).toMatch(/^(?:[0-9a-f]{2})+$/u);
	});

	it('ranks one materialized scope row and separates an outside current learner', async () => {
		const participants = Object.fromEntries([
			...Array.from({ length: 5 }, (_, index) => [
				challengeLeaderboardIdentityKey(`leader-${index + 1}`),
				{ score: 1500 - index * 100, completed: 3 }
			]),
			[challengeLeaderboardIdentityKey('learner-1'), { score: 450, completed: 1 }]
		]);
		mocks.queryPersonalFirst.mockResolvedValue({
			participants_json: JSON.stringify(participants)
		});

		const result = await getChallengeLeaderboard({
			scope: 'biology',
			currentUserId: 'learner-1',
			limit: 5
		});

		expect(result.entries).toHaveLength(5);
		expect(result.entries[0]).toMatchObject({
			rank: 1,
			score: 1500,
			completed: 3,
			isCurrentUser: false
		});
		expect(result.currentUserEntry).toMatchObject({
			rank: 6,
			score: 450,
			completed: 1,
			isCurrentUser: true
		});
		expect(result.participantCount).toBe(6);

		const [query, params] = mocks.queryPersonalFirst.mock.calls[0] as [string, unknown[]];
		expect(query).toContain('FROM challenge_leaderboard_snapshots');
		expect(query).toContain('WHERE scope = ?');
		expect(query).not.toContain('user_challenge_progress');
		expect(query).not.toContain('JOIN');
		expect(params).toEqual(['biology']);
	});

	it('drops malformed snapshot members instead of exposing them', async () => {
		mocks.queryPersonalFirst.mockResolvedValue({
			participants_json: JSON.stringify({
				'not-hex': { score: 999, completed: 2 },
				aa: { score: -1, completed: 2 },
				bb: { score: 500, completed: 0 }
			})
		});

		await expect(getChallengeLeaderboard({ scope: 'all' })).resolves.toEqual({
			entries: [],
			currentUserEntry: null,
			participantCount: 0
		});
	});

	it('updates every leaderboard scope with one constant-size D1 statement', async () => {
		await updateChallengeLeaderboardProjection('learner-1', {
			version: 2,
			challenges: {
				'biology-one': {
					startedAt: '2026-07-01T00:00:00.000Z',
					updatedAt: '2026-07-01T00:01:00.000Z',
					completedAt: '2026-07-01T00:01:00.000Z',
					plays: 1,
					lastStage: 'complete',
					bestScore: 500,
					bestTimeMs: 60_000,
					lastScore: 500,
					lastTimeMs: 60_000
				},
				'physics-one': {
					startedAt: '2026-07-01T00:02:00.000Z',
					updatedAt: '2026-07-01T00:03:00.000Z',
					completedAt: '2026-07-01T00:03:00.000Z',
					plays: 1,
					lastStage: 'complete',
					bestScore: 450,
					bestTimeMs: 70_000,
					lastScore: 450,
					lastTimeMs: 70_000
				}
			}
		});

		expect(mocks.executePersonalQuery).toHaveBeenCalledOnce();
		const [query, params] = mocks.executePersonalQuery.mock.calls[0] as [string, unknown[]];
		expect(query).toContain('UPDATE challenge_leaderboard_snapshots');
		expect(query).toContain('json_set');
		expect(query).toContain('json_remove');
		expect(query).not.toContain('SELECT');
		expect(params).toHaveLength(16);
		expect(JSON.parse(params[3] as string)).toEqual({ score: 950, completed: 2 });
		expect(JSON.parse(params[7] as string)).toEqual({ score: 500, completed: 1 });
		expect(JSON.parse(params[11] as string)).toEqual({ score: 0, completed: 0 });
		expect(JSON.parse(params[15] as string)).toEqual({ score: 450, completed: 1 });
	});
});
