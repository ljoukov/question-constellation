import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	queryPersonalRows: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	queryPersonalRows: mocks.queryPersonalRows
}));

import { challengeLeaderboardAlias, getChallengeLeaderboard } from './challengeLeaderboard';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.queryPersonalRows.mockResolvedValue([]);
});

describe('challenge leaderboard', () => {
	it('creates a stable pseudonym without exposing identity text', async () => {
		const first = await challengeLeaderboardAlias('learner@example.test');
		const second = await challengeLeaderboardAlias('learner@example.test');

		expect(first).toBe(second);
		expect(first).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
		expect(first).not.toContain('learner');
		expect(first).not.toContain('@');
	});

	it('ranks only the requested challenge scope and separates an outside current row', async () => {
		mocks.queryPersonalRows.mockResolvedValue([
			{
				user_id: 'leader-1',
				total_score: 1500,
				completed_count: 3,
				rank: 1,
				participant_count: 12
			},
			{
				user_id: 'learner-1',
				total_score: 450,
				completed_count: 1,
				rank: 9,
				participant_count: 12
			}
		]);

		const result = await getChallengeLeaderboard({
			challengeIds: ['biology-a', 'biology-b', 'biology-a'],
			currentUserId: 'learner-1',
			limit: 5
		});

		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			rank: 1,
			score: 1500,
			completed: 3,
			isCurrentUser: false
		});
		expect(result.currentUserEntry).toMatchObject({
			rank: 9,
			score: 450,
			completed: 1,
			isCurrentUser: true
		});
		expect(result.participantCount).toBe(12);

		const [query, params] = mocks.queryPersonalRows.mock.calls[0] as [string, unknown[]];
		expect(query).toContain('challenge_id IN (?, ?)');
		expect(query).toContain('ROW_NUMBER() OVER');
		expect(query).not.toContain('best_time');
		expect(params).toEqual(['biology-a', 'biology-b', 5, 'learner-1', 6]);
	});

	it('drops malformed database rows instead of exposing them', async () => {
		mocks.queryPersonalRows.mockResolvedValue([
			{
				user_id: '',
				total_score: 999,
				completed_count: 2,
				rank: 1,
				participant_count: 1
			}
		]);

		await expect(getChallengeLeaderboard({ challengeIds: ['biology-a'] })).resolves.toEqual({
			entries: [],
			currentUserEntry: null,
			participantCount: 1
		});
	});
});
