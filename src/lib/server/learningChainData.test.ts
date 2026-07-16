import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRows } = vi.hoisted(() => ({ queryRows: vi.fn() }));
vi.mock('./db', () => ({ queryRows }));

import { getQuestionBankQuestions } from './learningChainData';

beforeEach(() => {
	queryRows.mockReset();
});

describe('question-bank atlas coverage', () => {
	it('keeps a reviewed chained question browseable even when direct practice is unavailable', async () => {
		queryRows.mockResolvedValue([
			{
				id: 'structured-choice-question',
				slug: null,
				source_document_id: 'aqa-science-paper',
				source_question_ref: 'Q04.6',
				display_order: 1,
				prompt_text: 'Which tissue in the cut stem will differentiate into new root cells?',
				self_contained_prompt_text: null,
				command_word: 'Tick',
				answer_format: 'multiple_choice',
				marks: 1,
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Biology',
				subject_area: 'Biology',
				tier: 'Higher',
				paper: 'Biology Paper 1',
				component_code: '8464/B/1H',
				series: 'June',
				year: 2024,
				topic_path_json: JSON.stringify(['Cell biology']),
				metadata_json: JSON.stringify({ card_title: 'Meristem → new root cells' }),
				source_board: 'AQA',
				source_qualification: 'GCSE',
				source_subject: 'Biology',
				source_tier: 'Higher',
				source_paper: 'Biology Paper 1',
				source_component_code: '8464/B/1H',
				source_series: 'June',
				source_year: 2024,
				answer_chain_id: 'bio-chain-cell-differentiation',
				chain_title: 'Cell differentiation',
				reviewed_answer_text: 'Meristem'
			}
		]);

		const questions = await getQuestionBankQuestions();

		expect(questions).toHaveLength(1);
		expect(questions[0]).toMatchObject({
			id: 'structured-choice-question',
			title: 'Meristem → new root cells',
			chainId: 'bio-chain-cell-differentiation'
		});
	});
});
