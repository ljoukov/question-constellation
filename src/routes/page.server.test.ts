import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getHomePagePublicData: vi.fn(),
	getSignedInLearningHome: vi.fn(),
	getUserChallengeProgress: vi.fn(),
	refreshOneStaleRecommendationWithModel: vi.fn()
}));

vi.mock('$lib/server/learningChainData', () => ({
	getHomePagePublicData: mocks.getHomePagePublicData
}));

vi.mock('$lib/server/subjectLearning', () => ({
	getSignedInLearningHome: mocks.getSignedInLearningHome
}));

vi.mock('$lib/server/challengeProgress', () => ({
	getUserChallengeProgress: mocks.getUserChallengeProgress
}));

vi.mock('$lib/server/recommendationLlm', () => ({
	refreshOneStaleRecommendationWithModel: mocks.refreshOneStaleRecommendationWithModel
}));

import { challengeCatalog } from '$lib/challenges/catalog';
import type { ChallengeProgress } from '$lib/challenges/progress';
import { load } from './+page.server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Ada Learner',
	photoUrl: null
};
const completedChallenge = challengeCatalog[0];
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
const dashboard = {
	studentName: 'Ada',
	subjects: [],
	weeklySummary: {
		attemptCount: 2,
		recallCount: 3,
		closedGapCount: 1
	}
};
const homeSnapshot = {
	dashboard,
	challengeProgress
};

function run({
	authenticated = true,
	parent = vi.fn().mockResolvedValue({ homeSnapshot }),
	localProfileCookie
}: {
	authenticated?: boolean;
	parent?: ReturnType<typeof vi.fn>;
	localProfileCookie?: string;
} = {}) {
	return load({
		locals: { user: authenticated ? user : null },
		parent,
		cookies: { get: vi.fn().mockReturnValue(localProfileCookie) }
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getHomePagePublicData.mockResolvedValue({
		featuredChains: [],
		stats: { chainCount: 7, questionCount: 12, subjectCount: 3 }
	});
});

describe('home page server load', () => {
	it('renders signed-in home entirely from the one layout snapshot', async () => {
		const parent = vi.fn().mockResolvedValue({ homeSnapshot });

		const result = await run({ parent });
		if (!result) throw new Error('Expected signed-in home data.');

		expect(parent).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			user,
			dashboard,
			challengeCompletedCount: 1,
			challengeTotalBestScore: 450
		});
		expect(result.challengeRecommendation?.id).not.toBe(completedChallenge.id);
		expect(result.challengeCatalog).toHaveLength(challengeCatalog.length);
		expect(mocks.getHomePagePublicData).not.toHaveBeenCalled();
		expect(mocks.getSignedInLearningHome).not.toHaveBeenCalled();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
		expect(mocks.refreshOneStaleRecommendationWithModel).not.toHaveBeenCalled();
	});

	it('shows a useful authored fallback without starting the old query fan-out', async () => {
		const result = await run({
			parent: vi.fn().mockResolvedValue({ homeSnapshot: null, homeSnapshotShouldRefresh: true })
		});
		if (!result) throw new Error('Expected fallback home data.');

		expect(result).toMatchObject({
			user,
			dashboard: {
				studentName: 'Ada',
				subjects: [],
				weeklySummary: {
					attemptCount: 0,
					recallCount: 0,
					closedGapCount: 0
				}
			},
			challengeCompletedCount: 0,
			challengeTotalBestScore: 0,
			snapshotInitialising: true
		});
		expect(result.challengeRecommendation).not.toBeNull();
		expect(result.challengeCatalog).toHaveLength(challengeCatalog.length);
		expect(mocks.getHomePagePublicData).not.toHaveBeenCalled();
		expect(mocks.getSignedInLearningHome).not.toHaveBeenCalled();
		expect(mocks.getUserChallengeProgress).not.toHaveBeenCalled();
	});

	it('keeps pending guest subject choices visible while the first snapshot is built', async () => {
		const pendingProfile = encodeURIComponent(
			JSON.stringify({
				version: 1,
				updatedAt: 1_784_545_762_577,
				pendingSync: true,
				subjects: [
					{
						subject: 'Biology',
						board: 'AQA',
						qualification: 'GCSE',
						course: 'Separate Science',
						tier: 'Higher',
						enabled: true,
						currentGrade: null,
						targetGrade: null
					},
					{
						subject: 'Chemistry',
						board: 'AQA',
						qualification: 'GCSE',
						course: 'Combined Science',
						tier: 'Higher',
						enabled: false,
						currentGrade: null,
						targetGrade: null
					},
					{
						subject: 'History',
						board: 'AQA',
						qualification: 'GCSE',
						course: 'GCSE Subject',
						tier: 'Higher',
						enabled: true,
						currentGrade: null,
						targetGrade: null
					}
				],
				englishLiteratureSelections: {
					board: 'OCR',
					specificationCode: 'J352',
					modernText: null,
					nineteenthCenturyNovel: null,
					poetryCluster: null,
					shakespearePlay: null
				}
			})
		);

		const result = await run({
			parent: vi.fn().mockResolvedValue({ homeSnapshot: null, homeSnapshotShouldRefresh: true }),
			localProfileCookie: pendingProfile
		});

		expect(result).toMatchObject({
			snapshotInitialising: true,
			pendingLocalSubjects: [
				{ subject: 'Biology', courseLabel: 'AQA · Separate · Higher' },
				{ subject: 'History', courseLabel: 'AQA · GCSE' }
			]
		});
	});

	it('keeps the public home data path for signed-out visitors', async () => {
		const parent = vi.fn();

		const result = await run({ authenticated: false, parent });

		expect(parent).not.toHaveBeenCalled();
		expect(mocks.getHomePagePublicData).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			user: null,
			dashboard: null,
			challengeRecommendation: null,
			challengeCompletedCount: 0,
			challengeTotalBestScore: 0,
			snapshotInitialising: false,
			pendingLocalSubjects: [],
			stats: { chainCount: 7, questionCount: 12, subjectCount: 3 }
		});
	});
});
