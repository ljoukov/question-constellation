import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getQuestionBankQuestionsForSubject: vi.fn(),
	getPracticePageData: vi.fn(),
	getQuestionDrafts: vi.fn(),
	enabledProfileCombinationForQuestion: vi.fn()
}));

vi.mock('$lib/server/learningChainData', () => ({
	getQuestionBankQuestionsForSubject: mocks.getQuestionBankQuestionsForSubject
}));

vi.mock('$lib/server/questionData', () => ({
	getPracticePageData: mocks.getPracticePageData
}));

vi.mock('$lib/server/questionDrafts', () => ({
	getQuestionDrafts: mocks.getQuestionDrafts
}));

vi.mock('$lib/learning/profileQuestionCompatibility', () => ({
	enabledProfileCombinationForQuestion: mocks.enabledProfileCombinationForQuestion
}));

import { load } from './+page.server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};

const subject = {
	subject: 'Chemistry',
	slug: 'chemistry',
	href: '/subjects/chemistry',
	board: 'AQA',
	qualification: 'GCSE',
	course: 'Separate Science',
	tier: 'Higher',
	courseLabel: 'AQA GCSE Chemistry',
	scope: {
		status: 'all',
		label: 'All topics',
		unitSingular: 'topic',
		unitPlural: 'topics',
		href: '/subjects/chemistry/content',
		includedTopicIds: [],
		includedCount: 2,
		totalCount: 2
	},
	progress: {
		coverageCount: 0,
		coverageTotal: 2,
		coverageLabel: 'Nothing checked yet',
		secureCount: 0,
		dueCount: 0,
		examAnswerCount: 0,
		evidenceLabel: 'No evidence yet',
		checkedAnswerPerformance: { label: 'Checked answers', detail: 'None yet.', value: null }
	},
	nextAction: {
		id: 'question-1',
		kind: 'subject',
		eyebrow: 'Recommended',
		title: 'Answer a question',
		detail: 'Try this question.',
		durationMinutes: 5,
		href: '/questions/q-1/practice',
		available: true
	},
	alternatives: [],
	topics: [
		{
			id: 'energy',
			code: '4.5',
			title: 'Energy changes',
			paper: 'Paper 1',
			included: true,
			state: 'not_checked',
			stateLabel: 'Not checked',
			evidenceCount: 0,
			dueCount: 0
		},
		{
			id: 'rates',
			code: '4.6',
			title: 'Rates of reaction',
			paper: 'Paper 1',
			included: true,
			state: 'not_checked',
			stateLabel: 'Not checked',
			evidenceCount: 0,
			dueCount: 0
		}
	],
	specification: { code: '8462', url: null }
};

function bankQuestion(index: number, topicId: 'energy' | 'rates') {
	return {
		id: `q-${index}`,
		slug: null,
		title: `Question ${index}`,
		preview: `Prompt ${index}`,
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Chemistry',
		tier: 'Higher',
		paper: 'Paper 1',
		componentCode: '8462/1H',
		series: 'June 2024',
		year: 2024,
		topicPath: [topicId === 'energy' ? 'Energy changes' : 'Rates of reaction'],
		topic: topicId === 'energy' ? 'Energy changes' : 'Rates of reaction',
		topicId,
		sourceRef: `Q${index}`,
		marks: 3,
		command: 'Explain',
		chainId: 'internal-chain',
		chainTitle: 'Internal chain title',
		practiceAvailable: true,
		practiceUnavailableReason: null
	};
}

function practiceData(questionId: string) {
	const index = Number(questionId.replace('q-', ''));
	return {
		question: {
			id: questionId,
			sourceRef: `Q${index}`,
			title: `Question ${index}`,
			prompt: `Complete prompt ${index}`,
			context: '',
			assets: [],
			renderingOverlay: null,
			practiceAvailable: true,
			meta: {
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Chemistry',
				tier: 'Higher',
				paper: 'Paper 1',
				topic: 'Energy changes',
				questionType: 'Explain',
				marks: 3
			},
			checklist: [{ id: `${questionId}-point`, text: 'State the key idea.', stepId: 'step-1' }]
		},
		chain: {
			steps: [{ id: 'step-1', short: 'Key idea', label: 'State the key idea' }]
		}
	};
}

function run(url: string, authenticated = true) {
	return load({
		locals: { user: authenticated ? user : null },
		params: { subject: 'chemistry' },
		url: new URL(url),
		parent: async () => ({ homeSnapshot: { subjectViews: [subject] } })
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	const questions = Array.from({ length: 16 }, (_, index) =>
		bankQuestion(index + 1, index < 8 ? 'energy' : 'rates')
	);
	mocks.getQuestionBankQuestionsForSubject.mockResolvedValue(questions);
	mocks.getPracticePageData.mockImplementation(async (questionId: string) =>
		practiceData(questionId)
	);
	mocks.getQuestionDrafts.mockResolvedValue([]);
	mocks.enabledProfileCombinationForQuestion.mockReturnValue({ enabled: true });
});

describe('signed-in practice-paper route', () => {
	it('shows a topic-optional builder before a paper has been created', async () => {
		const result = await run('https://example.test/subjects/chemistry/paper');
		if (!result) throw new Error('Expected paper builder data.');

		expect(result.paper).toBeNull();
		expect(result.questionCount).toBe(16);
		expect(result.topics).toEqual([
			{ id: 'energy', title: 'Energy changes', questionCount: 8 },
			{ id: 'rates', title: 'Rates of reaction', questionCount: 8 }
		]);
	});

	it('creates a deterministic multi-question paper from selected topics', async () => {
		const result = await run(
			'https://example.test/subjects/chemistry/paper?paper=paper-seed-123&minutes=30&topic=energy'
		);
		if (!result?.paper) throw new Error('Expected generated paper data.');

		expect(result.paper.title).toBe('Energy changes practice paper');
		expect(result.paper.questions).toHaveLength(8);
		expect(
			result.paper.questions.every(
				(question: { meta: { topic: string } }) => question.meta.topic === 'Energy changes'
			)
		).toBe(true);
		expect(result.paper.totalMarks).toBe(24);
		expect(JSON.stringify(result.paper)).not.toContain('internal-chain');
		expect(mocks.getQuestionDrafts).toHaveBeenCalledWith(
			'learner-1',
			expect.arrayContaining(result.paper.questions.map((question: { id: string }) => question.id))
		);
	});

	it('only resumes answers saved for the exact paper id', async () => {
		mocks.getQuestionDrafts.mockImplementation(async (_userId: string, questionIds: string[]) => [
			{
				questionId: questionIds[0],
				draftKind: 'question-practice',
				answerText: 'Answer from a different paper',
				payload: {
					answerText: 'Answer from a different paper',
					view: 'result',
					practicePaper: { id: 'different-paper', status: 'complete' }
				},
				clientUpdatedAt: 123,
				updatedAt: '2026-08-01T12:00:00.000Z'
			}
		]);

		const result = await run(
			'https://example.test/subjects/chemistry/paper?paper=fresh-paper-123&minutes=30&topic=energy'
		);
		if (!result?.paper) throw new Error('Expected generated paper data.');

		expect(result.paper.savedStatus).toBe('in_progress');
		expect(
			result.paper.questions.every((question: { saved: unknown }) => question.saved === null)
		).toBe(true);
	});

	it('redirects signed-out visitors through sign-in and back to the requested paper', async () => {
		await expect(
			run('https://example.test/subjects/chemistry/paper?paper=paper-seed-123&minutes=30', false)
		).rejects.toMatchObject({ status: 303 });
	});
});
