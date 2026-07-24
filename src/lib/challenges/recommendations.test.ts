import { describe, expect, it } from 'vitest';
import type { ChallengeProgress } from './progress';
import {
	mostRecentlyCompletedChallenge,
	recommendedChallengePathStep,
	recommendedUnfinishedChallenge
} from './recommendations';

const challenges = [
	{ id: 'biology-one', subject: 'biology', slug: 'one' },
	{ id: 'biology-two', subject: 'biology', slug: 'two' },
	{ id: 'chemistry-one', subject: 'chemistry', slug: 'one' }
] as const;

function progress(entries: ChallengeProgress['challenges'] = {}): ChallengeProgress {
	return { version: 2, challenges: entries } as ChallengeProgress;
}

function entry({
	stage = 'complete',
	completedAt = '2026-07-19T10:02:00.000Z',
	updatedAt = '2026-07-19T10:02:00.000Z'
}: {
	stage?: 'showdown' | 'diagnose' | 'repair' | 'transfer' | 'complete';
	completedAt?: string | null;
	updatedAt?: string;
} = {}) {
	return {
		startedAt: '2026-07-19T10:00:00.000Z',
		updatedAt,
		completedAt,
		plays: 1,
		lastStage: stage,
		bestScore: completedAt ? 450 : null,
		bestTimeMs: completedAt ? 90_000 : null,
		lastScore: completedAt ? 450 : null,
		lastTimeMs: completedAt ? 90_000 : null
	};
}

describe('challenge recommendations', () => {
	it('skips solved and just-completed challenges', () => {
		const result = recommendedUnfinishedChallenge(
			challenges,
			progress({ 'biology-one': entry() }),
			{ currentChallengeId: 'biology-one', preferredSubject: 'biology' }
		);

		expect(result?.id).toBe('biology-two');
	});

	it('prefers the newest genuinely started unfinished round', () => {
		const result = recommendedUnfinishedChallenge(
			challenges,
			progress({
				'biology-one': entry({
					stage: 'diagnose',
					completedAt: null,
					updatedAt: '2026-07-19T10:04:00.000Z'
				}),
				'biology-two': entry({
					stage: 'repair',
					completedAt: null,
					updatedAt: '2026-07-19T10:08:00.000Z'
				})
			})
		);

		expect(result?.id).toBe('biology-two');
	});

	it('falls back across subjects and returns null only when everything is solved', () => {
		const partlySolved = progress({
			'biology-one': entry(),
			'biology-two': entry()
		});
		expect(
			recommendedUnfinishedChallenge(challenges, partlySolved, {
				preferredSubject: 'biology'
			})?.id
		).toBe('chemistry-one');

		expect(
			recommendedUnfinishedChallenge(
				challenges,
				progress({
					'biology-one': entry(),
					'biology-two': entry(),
					'chemistry-one': entry()
				})
			)
		).toBeNull();
	});

	it('selects the most recently completed challenge for an all-complete card', () => {
		const completed = progress({
			'biology-one': entry({ updatedAt: '2026-07-19T10:02:00.000Z' }),
			'biology-two': entry({
				completedAt: '2026-07-19T10:08:00.000Z',
				updatedAt: '2026-07-19T10:08:00.000Z'
			}),
			'chemistry-one': entry({
				completedAt: '2026-07-19T10:05:00.000Z',
				updatedAt: '2026-07-19T10:05:00.000Z'
			})
		});

		expect(mostRecentlyCompletedChallenge(challenges, completed)?.id).toBe('biology-two');
		expect(mostRecentlyCompletedChallenge(challenges, progress())).toBeNull();
	});
});

describe('automatic challenge paths', () => {
	const pathChallenges = [
		{
			id: 'biology-standard',
			subject: 'biology',
			slug: 'biology-standard',
			difficulty: 'standard',
			arc: 'read-the-evidence'
		},
		{
			id: 'chemistry-standard',
			subject: 'chemistry',
			slug: 'chemistry-standard',
			difficulty: 'standard',
			arc: 'read-the-evidence'
		},
		{
			id: 'chemistry-starter',
			subject: 'chemistry',
			slug: 'chemistry-starter',
			difficulty: 'starter',
			arc: 'complete-the-method'
		},
		{
			id: 'physics-starter',
			subject: 'physics',
			slug: 'physics-starter',
			difficulty: 'starter',
			arc: 'connect-cause-to-effect'
		}
	] as const;

	it('rotates to the next subject and softens difficulty after a supported mixed round', () => {
		expect(
			recommendedChallengePathStep(pathChallenges, progress(), {
				currentChallenge: pathChallenges[0],
				scope: 'mixed',
				roundScore: 400
			})?.id
		).toBe('chemistry-starter');
	});

	it('stays inside a subject path and raises demand only after a fluent round', () => {
		expect(
			recommendedChallengePathStep(pathChallenges, progress(), {
				currentChallenge: pathChallenges[2],
				scope: 'chemistry',
				roundScore: 500
			})?.id
		).toBe('chemistry-standard');
	});

	it('resumes genuine unfinished work before applying the new-path heuristic', () => {
		const activeProgress = progress({
			'physics-starter': entry({
				stage: 'repair',
				completedAt: null,
				updatedAt: '2026-07-19T10:08:00.000Z'
			})
		});

		expect(
			recommendedChallengePathStep(pathChallenges, activeProgress, {
				currentChallenge: pathChallenges[0],
				scope: 'mixed',
				roundScore: 500
			})?.id
		).toBe('physics-starter');
	});

	it('does not let an old partial attempt interrupt an active mixed orbit', () => {
		const activeProgress = progress({
			'physics-starter': entry({
				stage: 'repair',
				completedAt: null,
				updatedAt: '2026-07-19T10:08:00.000Z'
			})
		});

		expect(
			recommendedChallengePathStep(pathChallenges, activeProgress, {
				currentChallenge: pathChallenges[0],
				scope: 'mixed',
				roundScore: 500,
				resumeStarted: false
			})?.id
		).toBe('chemistry-standard');
	});

	it('returns null instead of replaying solved work when a scope is complete', () => {
		expect(
			recommendedChallengePathStep(
				pathChallenges,
				progress({
					'chemistry-standard': entry(),
					'chemistry-starter': entry()
				}),
				{
					currentChallenge: pathChallenges[0],
					scope: 'chemistry',
					roundScore: 450
				}
			)
		).toBeNull();
	});
});
