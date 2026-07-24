import { describe, expect, it } from 'vitest';
import {
	emptyChallengeLeaderboard,
	nextChallengeScoreLandmark,
	projectChallengeLeaderboard,
	type ChallengeLeaderboardSnapshot
} from './leaderboard';

describe('challenge leaderboard presentation', () => {
	it('keeps the next personal landmark ahead of the current score', () => {
		expect(nextChallengeScoreLandmark(0)).toEqual({
			previous: 0,
			next: 500,
			remaining: 500,
			progress: 0
		});
		expect(nextChallengeScoreLandmark(750)).toEqual({
			previous: 500,
			next: 1000,
			remaining: 250,
			progress: 0.5
		});
		expect(nextChallengeScoreLandmark(1000)).toEqual({
			previous: 1000,
			next: 1500,
			remaining: 500,
			progress: 0
		});
	});

	it('provides a stable empty snapshot', () => {
		expect(emptyChallengeLeaderboard()).toEqual({
			entries: [],
			currentUserEntry: null,
			participantCount: 0
		});
	});

	it('projects a rank move from a newly improved atlas score', () => {
		const snapshot: ChallengeLeaderboardSnapshot = {
			entries: [
				{ rank: 1, alias: 'Solar Owl', score: 1825, completed: 4, isCurrentUser: false },
				{ rank: 2, alias: 'Quiet Nova', score: 1475, completed: 3, isCurrentUser: false },
				{ rank: 3, alias: 'You', score: 1000, completed: 2, isCurrentUser: true },
				{ rank: 4, alias: 'Amber Fox', score: 450, completed: 1, isCurrentUser: false }
			],
			currentUserEntry: null,
			participantCount: 4
		};

		expect(
			projectChallengeLeaderboard({
				snapshot,
				score: 1500,
				completed: 3,
				includeCurrentUser: true
			})
		).toEqual({
			previousRank: 3,
			projectedRank: 2,
			rankImproved: true,
			nextRival: snapshot.entries[0],
			pointsToNextRank: 325
		});
	});

	it('does not invent an exact projected rank when hidden rows or a full tie remain', () => {
		const outsideSnapshot: ChallengeLeaderboardSnapshot = {
			entries: [
				{ rank: 1, alias: 'Solar Owl', score: 1800, completed: 4, isCurrentUser: false },
				{ rank: 2, alias: 'Quiet Nova', score: 1400, completed: 3, isCurrentUser: false },
				{ rank: 3, alias: 'Amber Fox', score: 900, completed: 2, isCurrentUser: false }
			],
			currentUserEntry: {
				rank: 9,
				alias: 'You',
				score: 400,
				completed: 1,
				isCurrentUser: true
			},
			participantCount: 12
		};
		expect(
			projectChallengeLeaderboard({
				snapshot: outsideSnapshot,
				score: 950,
				completed: 2,
				includeCurrentUser: true
			}).projectedRank
		).toBeNull();

		const tiedSnapshot: ChallengeLeaderboardSnapshot = {
			entries: [
				{ rank: 1, alias: 'Solar Owl', score: 1000, completed: 2, isCurrentUser: false },
				{ rank: 2, alias: 'You', score: 500, completed: 1, isCurrentUser: true }
			],
			currentUserEntry: null,
			participantCount: 2
		};
		expect(
			projectChallengeLeaderboard({
				snapshot: tiedSnapshot,
				score: 1000,
				completed: 2,
				includeCurrentUser: true
			}).projectedRank
		).toBeNull();
	});
});
