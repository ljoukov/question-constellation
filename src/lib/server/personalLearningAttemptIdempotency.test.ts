import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	executePersonalQuery: vi.fn(),
	queryFirst: vi.fn(),
	queryPersonalFirst: vi.fn(),
	queryPersonalRows: vi.fn(),
	queryRows: vi.fn(),
	getPracticePageData: vi.fn(),
	getCurriculumProfileSnapshot: vi.fn()
}));

vi.mock('./db', () => ({
	executePersonalQuery: mocks.executePersonalQuery,
	queryFirst: mocks.queryFirst,
	queryPersonalFirst: mocks.queryPersonalFirst,
	queryPersonalRows: mocks.queryPersonalRows,
	queryRows: mocks.queryRows
}));

vi.mock('$lib/server/questionData', () => ({
	getPracticePageData: mocks.getPracticePageData
}));

vi.mock('$lib/server/curriculumCatalog', () => ({
	getCurriculumProfileSnapshot: mocks.getCurriculumProfileSnapshot
}));

import { recordQuestionAttempt } from './personalLearning';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};

const profileRow = {
	uid: user.uid,
	email: user.email,
	name: user.name,
	photo_url: null,
	selected_board: 'AQA',
	selected_qualification: 'GCSE',
	selected_subject: 'Biology',
	selected_tier: 'Higher',
	theme_preference: 'auto',
	created_at: '2026-07-16T10:00:00.000Z',
	updated_at: '2026-07-16T10:00:00.000Z',
	last_seen_at: '2026-07-16T10:00:00.000Z'
};

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.getCurriculumProfileSnapshot.mockResolvedValue({
		qualification: 'GCSE',
		subjects: [
			'Biology',
			'Chemistry',
			'Physics',
			'Computer Science',
			'Geography',
			'History',
			'English Language',
			'English Literature'
		].map((subject) => ({ subject, boards: [{ name: 'AQA' }] }))
	});
	mocks.getPracticePageData.mockResolvedValue({
		question: {
			id: 'question-1',
			title: 'Explain the process',
			sourceRef: '01.1',
			meta: {
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Biology',
				subjectArea: 'Biology',
				tier: 'Higher',
				paper: 'Biology Paper 1',
				topic: 'Cell biology',
				marks: 4
			}
		},
		chain: {
			id: 'chain-1',
			title: 'Cause to process to effect',
			steps: [{ id: 'step-1' }, { id: 'step-2' }, { id: 'step-3' }, { id: 'step-4' }]
		}
	});
	mocks.queryRows.mockResolvedValue([
		{
			board: 'AQA',
			qualification: 'GCSE',
			subject: 'Biology',
			subject_area: 'Biology',
			component_code: '8461',
			tier: 'Higher'
		}
	]);
	mocks.queryPersonalRows.mockResolvedValue([
		{
			user_id: user.uid,
			subject: 'Biology',
			board: 'AQA',
			qualification: 'GCSE',
			course: 'Separate Science',
			tier: 'Higher',
			enabled: 1,
			current_grade: null,
			target_grade: null,
			created_at: '2026-07-16T10:00:00.000Z',
			updated_at: '2026-07-16T10:00:00.000Z'
		}
	]);
	mocks.queryPersonalFirst.mockImplementation(async (sql: string) => {
		if (sql.includes('FROM user_profiles')) return profileRow;
		if (sql.includes('FROM user_english_literature_selections')) return null;
		if (sql.includes('INSERT INTO user_question_attempts')) return null;
		if (sql.includes('matches_write')) return { matches_write: 0 };
		return null;
	});
});

describe('question attempt canonical idempotency', () => {
	it('rejects a conflicting attempt id before mutating any gap state', async () => {
		await expect(
			recordQuestionAttempt({
				user,
				questionId: 'question-1',
				answer: 'A different answer',
				attemptId: 'paper:learner-1:session-1:paper-1:question-1',
				assistance: {},
				result: {
					status: 'ok',
					result: 'incorrect',
					awardedMarks: 0,
					maxMarks: 4,
					presentStepIds: [],
					missingStepIds: ['step-1'],
					feedbackMarkdown: 'Missing the first causal step.',
					thinkingMarkdown: null,
					model: 'chatgpt-test',
					modelVersion: 'test-v1'
				}
			})
		).rejects.toThrow('different canonical write');

		const canonicalFence = mocks.queryPersonalFirst.mock.calls.find(([sql]) =>
			String(sql).includes('matches_write')
		)?.[0];
		expect(canonicalFence).toContain('answer_text = ?');
		expect(canonicalFence).toContain('awarded_marks = ?');
		expect(canonicalFence).toContain('present_step_ids_json = ?');
		expect(canonicalFence).toContain('missing_step_ids_json = ?');
		expect(canonicalFence).toContain("COALESCE(model, '')");
		expect(canonicalFence).toContain('independent = ?');
		expect(canonicalFence).toContain('assistance_json = ?');
		expect(
			mocks.executePersonalQuery.mock.calls.some(([sql]) => String(sql).includes('user_chain_gaps'))
		).toBe(false);
	});
});
