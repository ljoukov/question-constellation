import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getQuestionBankBrowsePageData: vi.fn()
}));

vi.mock('$lib/server/learningChainData', () => ({
	getQuestionBankBrowsePageData: mocks.getQuestionBankBrowsePageData
}));

import { load } from './+page.server';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getQuestionBankBrowsePageData.mockResolvedValue({
		filters: {
			search: '',
			subject: 'Biology',
			marks: 'all',
			topic: 'all',
			board: 'all',
			page: 1
		},
		sections: [
			{
				topic: {
					id: 'cells',
					board: 'AQA',
					qualification: 'GCSE',
					subject: 'Biology',
					code: null,
					title: 'Cells',
					paper: 'Paper 1',
					specUrl: null,
					questionCount: 1,
					chainCount: 1,
					firstQuestionId: 'question-1',
					firstQuestionTitle: 'Explain vaccination'
				},
				questions: [
					{
						id: 'question-1',
						slug: null,
						title: 'Explain vaccination',
						preview: 'Describe how a vaccine prevents disease.',
						board: 'AQA',
						qualification: 'GCSE',
						subject: 'Biology',
						tier: 'Higher',
						paper: 'Paper 1',
						componentCode: '8461/1H',
						series: 'June 2024',
						year: 2024,
						topicPath: ['Cells'],
						topic: 'Cells',
						topicId: 'cells',
						sourceRef: 'Q1',
						marks: 4,
						command: 'Describe',
						chainId: 'legacy-chain-id',
						chainTitle: 'Legacy chain title',
						practiceAvailable: true,
						practiceUnavailableReason: null
					}
				]
			}
		],
		subjects: ['Biology'],
		boards: ['AQA'],
		topicOptions: [{ id: 'cells', title: 'Cells' }],
		totalQuestions: 1,
		resultStart: 1,
		resultEnd: 1,
		page: 1,
		pageCount: 1
	});
});

describe('question bank page server load', () => {
	it('keeps legacy catalogue grouping fields out of the public page payload', async () => {
		const result = await load({
			locals: { user: null },
			url: new URL('https://example.test/questions?subject=Biology')
		} as never);
		if (!result) throw new Error('Expected question bank page data.');

		expect(result.sections[0].topic).not.toHaveProperty('chainCount');
		expect(result.sections[0].questions[0]).not.toHaveProperty('chainId');
		expect(result.sections[0].questions[0]).not.toHaveProperty('chainTitle');
		expect(JSON.stringify(result)).not.toContain('legacy-chain');
	});
});
