import {
	publicChallengePreviewDefinition,
	type PublicChallengePreviewDefinition
} from '$lib/challenges/authoredData';
import { challengesForSubject } from '$lib/challenges/catalog';
import {
	challengeProgressStorageKey,
	emptyChallengeProgress,
	type ChallengeProgressEntry
} from '$lib/challenges/progress';
import { describe, expect, it } from 'vitest';
import {
	hydrateSignedInChallengeProgress,
	mergeSubjectChallengeProgressUpdate,
	subjectChallengePromotion
} from './subjectChallengePromotion';

const challenges = challengesForSubject('biology')
	.slice(0, 3)
	.map(publicChallengePreviewDefinition);
const [firstChallenge, secondChallenge, thirdChallenge] = challenges as [
	PublicChallengePreviewDefinition,
	PublicChallengePreviewDefinition,
	PublicChallengePreviewDefinition
];

function entry({
	updatedAt,
	completedAt = null,
	bestScore = null
}: {
	updatedAt: string;
	completedAt?: string | null;
	bestScore?: number | null;
}): ChallengeProgressEntry {
	return {
		startedAt: '2026-07-18T09:00:00.000Z',
		updatedAt,
		completedAt,
		plays: 1,
		lastStage: completedAt ? 'complete' : 'diagnose',
		bestScore,
		bestTimeMs: bestScore === null ? null : 45_000,
		lastScore: bestScore,
		lastTimeMs: bestScore === null ? null : 45_000
	};
}

describe('subject challenge promotion', () => {
	it('recommends the next unfinished subject challenge and projects only subject totals', () => {
		const progress = {
			version: 2 as const,
			challenges: {
				[firstChallenge.id]: entry({
					updatedAt: '2026-07-18T10:00:00.000Z',
					completedAt: '2026-07-18T10:00:00.000Z',
					bestScore: 450
				}),
				[thirdChallenge.id]: entry({
					updatedAt: '2026-07-18T11:00:00.000Z'
				}),
				'retired-challenge': entry({
					updatedAt: '2026-07-18T12:00:00.000Z',
					completedAt: '2026-07-18T12:00:00.000Z',
					bestScore: 500
				})
			}
		};

		expect(subjectChallengePromotion(challenges, progress)).toEqual({
			challenge: thirdChallenge,
			challengeCompleted: false,
			completedCount: 1,
			totalBestScore: 450
		});
	});

	it('falls back to the most recently completed challenge when every subject challenge is done', () => {
		const progress = {
			version: 2 as const,
			challenges: {
				[firstChallenge.id]: entry({
					updatedAt: '2026-07-18T10:00:00.000Z',
					completedAt: '2026-07-18T10:00:00.000Z',
					bestScore: 425
				}),
				[secondChallenge.id]: entry({
					updatedAt: '2026-07-18T12:00:00.000Z',
					completedAt: '2026-07-18T12:00:00.000Z',
					bestScore: 475
				}),
				[thirdChallenge.id]: entry({
					updatedAt: '2026-07-18T11:00:00.000Z',
					completedAt: '2026-07-18T11:00:00.000Z',
					bestScore: 450
				})
			}
		};

		expect(subjectChallengePromotion(challenges, progress)).toEqual({
			challenge: secondChallenge,
			challengeCompleted: true,
			completedCount: 3,
			totalBestScore: 1350
		});
	});

	it('merges the current learner event and ignores a stale event from another account', () => {
		const current = {
			version: 2 as const,
			challenges: {
				[firstChallenge.id]: entry({
					updatedAt: '2026-07-18T10:00:00.000Z',
					completedAt: '2026-07-18T10:00:00.000Z',
					bestScore: 450
				})
			}
		};
		const imported = {
			version: 2 as const,
			challenges: {
				[secondChallenge.id]: entry({
					updatedAt: '2026-07-18T11:00:00.000Z',
					completedAt: '2026-07-18T11:00:00.000Z',
					bestScore: 475
				})
			}
		};

		expect(
			mergeSubjectChallengeProgressUpdate(current, 'learner-1', {
				userId: 'previous-account',
				progress: imported
			})
		).toBe(current);

		const merged = mergeSubjectChallengeProgressUpdate(current, 'learner-1', {
			userId: 'learner-1',
			progress: imported,
			confirmed: true
		});
		expect(Object.keys(merged.challenges).sort()).toEqual(
			[firstChallenge.id, secondChallenge.id].sort()
		);
		expect(subjectChallengePromotion(challenges, merged)).toMatchObject({
			challenge: thirdChallenge,
			completedCount: 2,
			totalBestScore: 925
		});
	});

	it('returns an empty promotion for a subject without challenges', () => {
		expect(subjectChallengePromotion([], emptyChallengeProgress())).toEqual({
			challenge: null,
			challengeCompleted: false,
			completedCount: 0,
			totalBestScore: 0
		});
	});

	it('hydrates a newly mounted signed-in consumer from account and pending guest progress', () => {
		const localProgress = {
			version: 2 as const,
			challenges: {
				[firstChallenge.id]: entry({
					updatedAt: '2026-07-18T13:00:00.000Z',
					completedAt: '2026-07-18T13:00:00.000Z',
					bestScore: 500
				})
			}
		};
		const guestProgress = {
			version: 2 as const,
			challenges: {
				[secondChallenge.id]: entry({
					updatedAt: '2026-07-18T13:05:00.000Z',
					completedAt: '2026-07-18T13:05:00.000Z',
					bestScore: 475
				})
			}
		};
		const storage = {
			getItem: (key: string) =>
				key === challengeProgressStorageKey('learner-1')
					? JSON.stringify(localProgress)
					: key === challengeProgressStorageKey()
						? JSON.stringify(guestProgress)
						: null
		};

		const hydrated = hydrateSignedInChallengeProgress(
			emptyChallengeProgress(),
			'learner-1',
			storage
		);

		expect(Object.keys(hydrated.challenges).sort()).toEqual(
			[firstChallenge.id, secondChallenge.id].sort()
		);
		expect(subjectChallengePromotion(challenges, hydrated)).toMatchObject({
			completedCount: 2,
			totalBestScore: 975
		});
	});
});
