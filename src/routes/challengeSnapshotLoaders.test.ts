import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUserChallengeProgress: vi.fn()
}));

vi.mock('$lib/server/challengeProgress', () => ({
	getUserChallengeProgress: mocks.getUserChallengeProgress
}));

import { challengesForSubject } from '$lib/challenges/catalog';
import type { ChallengeProgress } from '$lib/challenges/progress';
import { load as challengeHubLoad } from './challenges/+page.server';
import { load as challengeSubjectLoad } from './challenges/[subject]/+page.server';
import { load as challengeLeafLoad } from './challenges/[subject]/[slug]/+page.server';
import { load as learnerSubjectLoad } from './subjects/[subject]/+page.server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Ada Learner',
	photoUrl: null
};
const completedChallenge = challengesForSubject('biology')[0];
const challengeProgress: ChallengeProgress = {
	version: 2,
	challenges: completedChallenge
		? {
				[completedChallenge.id]: {
					startedAt: '2026-07-18T10:00:00.000Z',
					updatedAt: '2026-07-18T10:04:00.000Z',
					completedAt: '2026-07-18T10:04:00.000Z',
					plays: 1,
					lastStage: 'complete',
					bestScore: 450,
					bestTimeMs: 30_000,
					lastScore: 450,
					lastTimeMs: 30_000
				}
			}
		: {}
};

const subjectView = {
	subject: 'Biology',
	board: 'AQA',
	href: '/subjects/biology',
	scope: { status: 'all' },
	nextAction: { href: '/recall' },
	alternatives: []
};

function snapshotParent() {
	return vi.fn().mockResolvedValue({
		homeSnapshot: { challengeProgress, subjectViews: [subjectView] },
		homeSnapshotShouldRefresh: false
	});
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('challenge routes use the one-row parent snapshot', () => {
	it('loads the signed-in challenge hub without reading normalized progress rows', async () => {
		const parent = snapshotParent();
		const result = await challengeHubLoad({
			locals: { user },
			parent
		} as never);

		expect(result).toMatchObject({ challengeProgress, user });
		expect(parent).toHaveBeenCalledOnce();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('loads a signed-in challenge subject without reading normalized progress rows', async () => {
		const parent = snapshotParent();
		const result = await challengeSubjectLoad({
			locals: { user },
			params: { subject: 'biology' },
			parent
		} as never);

		expect(result).toMatchObject({ challengeProgress, user });
		expect(parent).toHaveBeenCalledOnce();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('loads a signed-in challenge leaf without reading normalized progress rows', async () => {
		const parent = snapshotParent();
		const result = await challengeLeafLoad({
			locals: { user },
			params: {
				subject: 'biology',
				slug: completedChallenge?.slug ?? 'smoking-risk-data-conclusions'
			},
			parent
		} as never);

		expect(result).toMatchObject({ initialProgress: challengeProgress, user });
		expect(parent).toHaveBeenCalledOnce();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('keeps public challenge routes signed-out and free of personal reads', async () => {
		const parent = vi.fn();
		const result = await challengeHubLoad({
			locals: { user: null },
			parent
		} as never);

		expect(result).toMatchObject({
			challengeProgress: { version: 2, challenges: {} },
			user: null
		});
		expect(parent).not.toHaveBeenCalled();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
	});
});

describe('signed-in subject challenge promotion uses the parent snapshot', () => {
	it('projects subject challenge totals without a normalized progress query', async () => {
		const parent = snapshotParent();
		const result = await learnerSubjectLoad({
			locals: { user },
			params: { subject: 'biology' },
			url: new URL('http://localhost/subjects/biology'),
			parent
		} as never);

		expect(result).toMatchObject({
			user,
			challengeProgress,
			challengeCompletedCount: 1,
			challengeTotalBestScore: 450
		});
		if (!result) throw new Error('Expected the Biology subject page data.');
		expect(result.challengeCatalog).toHaveLength(challengesForSubject('biology').length);
		expect(result.challengeCatalog[0]).toMatchObject({
			id: completedChallenge.id,
			subject: 'biology'
		});
		expect(parent).toHaveBeenCalledOnce();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('fails cheaply while an empty legacy fallback refreshes instead of running a fanout', async () => {
		const parent = vi.fn().mockResolvedValue({
			homeSnapshot: { challengeProgress, subjectViews: [] },
			homeSnapshotShouldRefresh: true
		});
		await expect(
			learnerSubjectLoad({
				locals: { user },
				params: { subject: 'biology' },
				url: new URL('http://localhost/subjects/biology'),
				parent
			} as never)
		).rejects.toMatchObject({ status: 503 });
		expect(parent).toHaveBeenCalledOnce();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
	});
});
