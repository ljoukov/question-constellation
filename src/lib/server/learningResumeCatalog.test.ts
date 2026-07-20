import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	queryPersonalRows: vi.fn(),
	queryRows: vi.fn()
}));

vi.mock('./db', () => ({
	queryPersonalRows: mocks.queryPersonalRows,
	queryRows: mocks.queryRows
}));

import { getLatestResumeActionsBySubject, type ResumeQuestionRow } from './learningResume';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('catalog-backed resume lookup', () => {
	it('uses the bounded personal draft read and performs no public question query', async () => {
		mocks.queryPersonalRows.mockResolvedValue([
			{
				question_id: 'biology-question',
				draft_kind: 'science-practice',
				answer_text: 'Cells release energy by respiration.',
				draft_json: JSON.stringify({
					answerText: 'Cells release energy by respiration.',
					view: 'attempt'
				}),
				client_updated_at: 100,
				updated_at: '2026-07-20 10:00:00'
			}
		]);
		const publicQuestions: ResumeQuestionRow[] = [
			{
				id: 'biology-question',
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Combined Science: Trilogy',
				subject_area: 'Biology',
				component_code: '8464/B/1H',
				tier: 'Higher',
				reviewedPrimaryMappingCount: 1,
				reviewedCurriculumMappings: [{ componentId: 'biology:cells', depth: 2 }]
			}
		];

		const actions = await getLatestResumeActionsBySubject(
			'learner-1',
			[
				{
					subject: 'Biology',
					board: 'AQA',
					qualification: 'GCSE',
					course: 'Combined Science',
					tier: 'Higher',
					enabled: true,
					currentGrade: null,
					targetGrade: null
				}
			],
			new Map([['Biology', new Set(['biology:cells'])]]),
			{ publicQuestions }
		);

		expect(actions.get('Biology')).toMatchObject({
			id: 'resume:biology-question',
			href: '/questions/biology-question/practice'
		});
		expect(mocks.queryPersonalRows).toHaveBeenCalledOnce();
		expect(mocks.queryPersonalRows.mock.calls[0][0]).toContain('LIMIT 50');
		expect(mocks.queryRows).not.toHaveBeenCalled();
	});
});
