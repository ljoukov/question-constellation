import type { ChallengeProgress } from '$lib/challenges/progress';
import { publicChallengePreviewFixture } from '$lib/challenges/testFixtures';
import type { SignedInSubjectView } from '$lib/learning/viewTypes';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import SubjectHub from './SubjectHub.svelte';

const challengeCatalog = [
	publicChallengePreviewFixture(),
	publicChallengePreviewFixture({
		id: 'biology-fixture-b',
		slug: 'fixture-b',
		title: 'Second fixture challenge'
	})
];
const completedChallenge = challengeCatalog[0];
const recommendedChallenge = challengeCatalog[1];
const challengeProgress: ChallengeProgress = {
	version: 2,
	challenges: {
		[completedChallenge.id]: {
			startedAt: '2026-07-18T09:00:00.000Z',
			updatedAt: '2026-07-18T09:05:00.000Z',
			completedAt: '2026-07-18T09:05:00.000Z',
			plays: 1,
			lastStage: 'complete',
			bestScore: 475,
			bestTimeMs: 45_000,
			lastScore: 475,
			lastTimeMs: 45_000
		}
	}
};
const subject: SignedInSubjectView = {
	subject: 'Biology',
	slug: 'biology',
	href: '/subjects/biology',
	board: 'AQA',
	qualification: 'GCSE',
	course: 'Combined Science',
	tier: 'Higher',
	courseLabel: 'AQA GCSE Biology',
	scope: {
		status: 'all',
		label: 'All topics',
		unitSingular: 'topic',
		unitPlural: 'topics',
		href: '/subjects/biology/content',
		includedTopicIds: [],
		includedCount: 0,
		totalCount: 0
	},
	progress: {
		coverageCount: 0,
		coverageTotal: 0,
		coverageLabel: 'Nothing checked yet',
		secureCount: 0,
		dueCount: 0,
		examAnswerCount: 0,
		evidenceLabel: 'No evidence yet',
		checkedAnswerPerformance: {
			label: 'Checked answers',
			detail: 'Nothing checked yet.',
			value: null
		}
	},
	nextAction: {
		id: 'recall:biology',
		kind: 'recall',
		eyebrow: 'Recommended next',
		title: 'Cell biology recall',
		detail: 'Build a secure base before answering another question.',
		durationMinutes: 5,
		href: '/recall/biology/quick',
		available: true
	},
	alternatives: [],
	topics: [],
	specification: {
		code: '8464',
		url: null
	}
};

describe('SubjectHub challenge promotion', () => {
	it('renders the current unfinished recommendation and progress without a finite total', () => {
		const { body } = render(SubjectHub, {
			props: {
				subject,
				challengeCatalog,
				challengeProgress,
				challengeUserId: 'learner-1',
				recallDeck: {
					subject: 'Biology',
					totalCardCount: 18,
					topics: [{ id: 'cells', title: 'Cell biology', cardCount: 8 }]
				}
			}
		});

		expect(body).toContain(recommendedChallenge.title);
		expect(body).toMatch(/<strong[^>]*>1<\/strong> complete/);
		expect(body).toMatch(/<strong[^>]*>475<\/strong> points/);
		expect(body).toContain('Play now');
		expect(body).toContain('Customise deck');
		expect(body).toContain('Start recall');
		expect(body).toContain('Create a practice paper');
		expect(body).toContain('/subjects/biology/paper');
		expect(body).not.toContain('of 2 complete');
	});
});
