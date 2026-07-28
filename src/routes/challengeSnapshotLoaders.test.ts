import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUserChallengeProgress: vi.fn(),
	getChallengeLeaderboard: vi.fn(),
	getChallengeHub: vi.fn(),
	getChallengeSubject: vi.fn(),
	getChallengeDetail: vi.fn()
}));

vi.mock('$lib/server/challengeProgress', () => ({
	getUserChallengeProgress: mocks.getUserChallengeProgress
}));

vi.mock('$lib/server/challengeLeaderboard', () => ({
	getChallengeLeaderboard: mocks.getChallengeLeaderboard
}));

vi.mock('$lib/server/challengeCatalog', () => ({
	getChallengeHub: mocks.getChallengeHub,
	getChallengeSubject: mocks.getChallengeSubject,
	getChallengeDetail: mocks.getChallengeDetail
}));

import {
	buildAuthoredChallengeChain,
	publicChallengeDefinition,
	publicNextChallengeDefinition
} from '$lib/challenges/authoredData';
import type { ChallengeProgress } from '$lib/challenges/progress';
import {
	challengeDefinitionFixture,
	publicChallengePreviewFixture
} from '$lib/challenges/testFixtures';
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
const fullChallenge = challengeDefinitionFixture();
const completedChallenge = publicChallengePreviewFixture();
const secondChallenge = publicChallengePreviewFixture({
	id: 'biology-fixture-b',
	slug: 'fixture-b',
	title: 'Second fixture challenge'
});
const challengeCatalog = [completedChallenge, secondChallenge];
const basePayload = {
	schemaVersion: 'challenge-catalog-route/v1',
	releaseId: 'fixture-release',
	socialImage: {
		url: '/challenge-assets/images/challenges/fixture/social-light.webp',
		alt: 'Synthetic challenge social art.',
		width: 1600,
		height: 900
	},
	ks4ScienceUrl: 'https://example.test/curriculum'
};
const hubPayload = {
	...basePayload,
	featuredChallenge: completedChallenge,
	challenges: challengeCatalog,
	subjects: [
		{
			subject: 'biology',
			label: 'Biology',
			challengeIds: challengeCatalog.map(({ id }) => id),
			cardArt: null
		}
	],
	curriculumLinks: [],
	challengeIds: challengeCatalog.map(({ id }) => id)
};
const subjectPayload = {
	...basePayload,
	subject: {
		subject: 'biology',
		label: 'Biology',
		description: 'Synthetic subject description.'
	},
	defaultHeroId: completedChallenge.id,
	challenges: challengeCatalog,
	curriculumLinks: [],
	challengeIds: challengeCatalog.map(({ id }) => id)
};
const detailPayload = {
	...basePayload,
	challenge: publicChallengeDefinition(fullChallenge),
	chain: buildAuthoredChallengeChain(fullChallenge),
	visual: {
		segments: ['Observe', 'Connect', 'Apply'],
		decisiveIndex: 1,
		decisiveLabel: 'Connect the evidence.',
		cardArt: {
			src: '/challenge-assets/images/challenges/fixture/light.webp',
			darkSrc: '/challenge-assets/images/challenges/fixture/dark.webp',
			alt: 'Synthetic challenge art.',
			width: 1600,
			height: 900
		}
	},
	nextChallenges: [
		publicNextChallengeDefinition(challengeDefinitionFixture({ id: secondChallenge.id }))
	],
	shortRecallPrompt: {
		challengeId: fullChallenge.id,
		stem: 'A claim needs supporting ___.',
		canonicalAnswer: 'evidence',
		acceptedAliases: [],
		spellingVariants: [],
		preferredHiddenStepIndex: 1,
		contentVersion: 'fixture-v1'
	},
	curriculumCitation: null,
	challengeIds: challengeCatalog.map(({ id }) => id)
};
const challengeProgress: ChallengeProgress = {
	version: 2,
	challenges: {
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
};

const subjectView = {
	subject: 'Biology',
	board: 'AQA',
	href: '/subjects/biology',
	scope: { status: 'all' },
	nextAction: { href: '/recall/biology/quick' },
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
	mocks.getChallengeHub.mockResolvedValue(hubPayload);
	mocks.getChallengeSubject.mockResolvedValue(subjectPayload);
	mocks.getChallengeDetail.mockResolvedValue(detailPayload);
	mocks.getChallengeLeaderboard.mockResolvedValue({
		entries: [],
		currentUserEntry: null,
		participantCount: 0
	});
});

describe('challenge routes use denormalized D1 payloads and the one-row parent snapshot', () => {
	it('loads the signed-in challenge hub without reading normalized progress rows', async () => {
		const parent = snapshotParent();
		const result = await challengeHubLoad({ locals: { user }, parent } as never);

		expect(result).toMatchObject({ challengeProgress, user, releaseId: 'fixture-release' });
		expect(parent).toHaveBeenCalledOnce();
		expect(mocks.getChallengeHub).toHaveBeenCalledOnce();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
		expect(mocks.getChallengeLeaderboard).toHaveBeenCalledWith(
			expect.objectContaining({ currentUserId: user.uid })
		);
	});

	it('loads a signed-in challenge subject from its single materialized payload', async () => {
		const parent = snapshotParent();
		const result = await challengeSubjectLoad({
			locals: { user },
			params: { subject: 'biology' },
			parent
		} as never);

		expect(result).toMatchObject({ challengeProgress, user, releaseId: 'fixture-release' });
		expect(mocks.getChallengeSubject).toHaveBeenCalledWith('biology');
		expect(parent).toHaveBeenCalledOnce();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('loads a signed-in challenge leaf with embedded chain, visual and recall data', async () => {
		const parent = snapshotParent();
		const result = await challengeLeafLoad({
			locals: { user },
			params: { subject: 'biology', slug: completedChallenge.slug },
			url: new URL(`http://localhost/challenges/biology/${completedChallenge.slug}?scope=mixed`),
			parent
		} as never);

		expect(result).toMatchObject({
			initialProgress: challengeProgress,
			pathScope: 'mixed',
			user,
			releaseId: 'fixture-release'
		});
		if (!result) throw new Error('Expected challenge leaf data.');
		expect(result.challenge).not.toHaveProperty('hook');
		expect(result.challenge).not.toHaveProperty('sourceQuestionId');
		expect(result.shortRecallPrompt).toMatchObject({ challengeId: completedChallenge.id });
		expect(result.visual.cardArt?.src).toContain('/challenge-assets/');
		expect(mocks.getChallengeDetail).toHaveBeenCalledWith('biology', completedChallenge.slug);
		expect(parent).toHaveBeenCalledOnce();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('keeps public challenge routes signed-out and free of per-user snapshot reads', async () => {
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

describe('signed-in subject challenge promotion uses the D1 subject payload', () => {
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
		expect(result.challengeCatalog).toEqual(challengeCatalog);
		expect(mocks.getChallengeSubject).toHaveBeenCalledWith('biology');
		expect(parent).toHaveBeenCalledOnce();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('fails cheaply while an empty cached snapshot refreshes', async () => {
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
