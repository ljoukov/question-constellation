import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRows } = vi.hoisted(() => ({ queryRows: vi.fn() }));
vi.mock('./db', () => ({ queryRows }));

import { getQuestionBankQuestions, getQuestionBankQuestionsForSubject } from './learningChainData';

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

	it('excludes a catalogue title that the live question page rejects as copied prompt text', async () => {
		queryRows.mockResolvedValue([
			{
				id: 'copied-command-remainder',
				slug: null,
				source_document_id: 'aqa-biology-paper',
				source_question_ref: '03.4',
				display_order: 4,
				prompt_text: 'Explain how viruses cause illness.',
				self_contained_prompt_text:
					'Viruses reproduce inside living cells and damage them when new virus particles are released.',
				context_text: null,
				self_containment_json: null,
				command_word: 'Explain',
				answer_format: 'lines',
				marks: 3,
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Biology',
				subject_area: 'Biology',
				tier: 'Higher',
				paper: 'Biology Paper 1',
				component_code: '8464/B/1H',
				series: 'June',
				year: 2024,
				topic_path_json: JSON.stringify(['Infection and response']),
				metadata_json: JSON.stringify({ card_title: 'Viruses cause illness' }),
				source_board: 'AQA',
				source_qualification: 'GCSE',
				source_subject: 'Biology',
				source_tier: 'Higher',
				source_paper: 'Biology Paper 1',
				source_component_code: '8464/B/1H',
				source_series: 'June',
				source_year: 2024,
				answer_chain_id: 'virus-mechanism',
				chain_title: 'Virus replication damages cells',
				reviewed_answer_text: 'Viruses reproduce inside cells and damage or destroy the cells.'
			}
		]);

		await expect(getQuestionBankQuestions()).resolves.toEqual([]);
	});

	it('marks source-dependent signed-in English questions unavailable without reviewed source text', async () => {
		queryRows.mockResolvedValue([
			{
				id: 'ocr-language-missing-source',
				slug: null,
				source_document_id: 'ocr-language-paper',
				source_question_ref: '03.0',
				display_order: 3,
				prompt_text: 'Look again at lines 10-28. Explore how the writer uses language.',
				self_contained_prompt_text: null,
				context_text: 'The relevant source is Text 2 from the insert.',
				self_containment_json: JSON.stringify({ status: 'self_contained' }),
				command_word: 'Explore',
				marks: 12,
				board: 'OCR',
				qualification: 'GCSE',
				subject: 'English Language',
				subject_area: 'English Language',
				tier: null,
				paper: 'Communicating information and ideas',
				component_code: 'J351/01',
				series: 'June',
				year: 2024,
				topic_path_json: JSON.stringify(['Reading']),
				metadata_json: JSON.stringify({ card_title: 'Language and structure effects' }),
				source_board: 'OCR',
				source_qualification: 'GCSE',
				source_subject: 'English Language',
				source_tier: null,
				source_paper: 'Communicating information and ideas',
				source_component_code: 'J351/01',
				source_series: 'June',
				source_year: 2024,
				answer_chain_id: 'english-language-reading',
				chain_title: 'Analyse language',
				reviewed_answer_text: 'The writer makes the scene feel threatening.',
				reviewed_source_assets_json: '[]',
				reviewed_render_json: null
			}
		]);

		const questions = await getQuestionBankQuestionsForSubject('OCR', 'English Language');

		expect(questions[0]).toMatchObject({
			id: 'ocr-language-missing-source',
			practiceAvailable: false
		});
		expect(questions[0].practiceUnavailableReason).toContain('official extract or source text');
	});

	it('keeps an exact overlay-referenced Literature source asset available for practice', async () => {
		queryRows.mockResolvedValue([
			{
				id: 'ocr-literature-reviewed-extract',
				slug: null,
				source_document_id: 'ocr-literature-paper',
				source_question_ref: '04.0',
				display_order: 4,
				prompt_text:
					'Starting with this extract, explore how Shakespeare presents guilt in the play.',
				self_contained_prompt_text: null,
				context_text: null,
				self_containment_json: JSON.stringify({
					status: 'source_complete',
					requires_assets: true,
					required_source_count: 1,
					required_asset_labels: ['Macbeth extract']
				}),
				command_word: 'Explore',
				marks: 40,
				board: 'OCR',
				qualification: 'GCSE',
				subject: 'English Literature',
				subject_area: 'English Literature',
				tier: null,
				paper: 'Exploring modern and literary heritage texts',
				component_code: 'J352/01',
				series: 'June',
				year: 2024,
				topic_path_json: JSON.stringify(['Shakespeare', 'Macbeth']),
				metadata_json: JSON.stringify({ card_title: 'Guilt in Macbeth' }),
				source_board: 'OCR',
				source_qualification: 'GCSE',
				source_subject: 'English Literature',
				source_tier: null,
				source_paper: 'Exploring modern and literary heritage texts',
				source_component_code: 'J352/01',
				source_series: 'June',
				source_year: 2024,
				answer_chain_id: 'english-literature-extract',
				chain_title: 'Analyse an extract',
				reviewed_answer_text: 'Shakespeare presents guilt as psychologically destructive.',
				reviewed_source_assets_json: JSON.stringify([
					{
						id: 'macbeth-extract',
						publicPath: '/images/papers/macbeth-extract.png',
						role: 'source-page',
						sourceLabel: 'Macbeth extract',
						required: true
					}
				]),
				reviewed_render_json: JSON.stringify({
					stemBlocks: [{ kind: 'figure', assetId: 'macbeth-extract' }],
					promptBlocks: [
						{
							kind: 'paragraph',
							text: 'Starting with this extract, explore how Shakespeare presents guilt.'
						}
					]
				})
			}
		]);

		const questions = await getQuestionBankQuestionsForSubject('OCR', 'English Literature');

		expect(questions[0]).toMatchObject({
			id: 'ocr-literature-reviewed-extract',
			practiceAvailable: true,
			practiceUnavailableReason: null
		});
		expect(String(queryRows.mock.calls[0]?.[0])).toContain("'id', qa.id");
	});
});
