import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getQuestionBankBrowseData: vi.fn(),
	queryRows: vi.fn()
}));

vi.mock('./learningChainData', () => ({
	getQuestionBankBrowseData: mocks.getQuestionBankBrowseData
}));
vi.mock('./db', () => ({ queryRows: mocks.queryRows }));

import {
	getPublicChainSitemapEntries,
	getPublicQuestionSitemapEntries,
	getSeoTopicPages
} from './seoIndexData';

describe('public question sitemap entries', () => {
	beforeEach(() => {
		mocks.getQuestionBankBrowseData.mockReset();
		mocks.queryRows.mockReset();
	});

	it('uses the reviewed question catalogue so every listed question is learner-visible', async () => {
		mocks.getQuestionBankBrowseData.mockResolvedValue({
			questions: [{ id: 'question-one' }, { id: 'question with spaces' }],
			topics: []
		});

		await expect(getPublicQuestionSitemapEntries()).resolves.toEqual([
			{
				path: '/questions/question-one',
				changefreq: 'monthly',
				priority: '0.78'
			},
			{
				path: '/questions/question%20with%20spaces',
				changefreq: 'monthly',
				priority: '0.78'
			}
		]);
		expect(mocks.getQuestionBankBrowseData).toHaveBeenCalledOnce();
	});

	it('lists only constellations represented by learner-visible catalogue questions', async () => {
		mocks.getQuestionBankBrowseData.mockResolvedValue({
			questions: [
				{ id: 'one', chainId: 'shared-chain' },
				{ id: 'two', chainId: 'shared-chain' },
				{ id: 'three', chainId: 'single-chain' },
				{ id: 'four', chainId: null }
			],
			topics: []
		});

		await expect(getPublicChainSitemapEntries()).resolves.toEqual([
			{
				path: '/constellations/shared-chain',
				changefreq: 'monthly',
				priority: '0.76'
			},
			{
				path: '/constellations/single-chain',
				changefreq: 'monthly',
				priority: '0.68'
			}
		]);
	});

	it('removes non-visible question links from public topic pages', async () => {
		mocks.getQuestionBankBrowseData.mockResolvedValue({
			questions: [{ id: 'visible-one' }, { id: 'visible-two' }],
			topics: []
		});
		mocks.queryRows.mockResolvedValue(
			['visible-one', 'hidden-question', 'visible-two'].map((id, index) => ({
				id,
				source_question_ref: `0${index + 1}.1`,
				command_word: 'Explain',
				marks: 2,
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Biology',
				subject_area: 'Biology',
				tier: 'Higher',
				paper: 'Biology Paper 1',
				series: 'June',
				year: 2024,
				topic_path_json: JSON.stringify(['Cell biology'])
			}))
		);

		const pages = await getSeoTopicPages();

		expect(pages).toHaveLength(1);
		expect(pages[0]).toMatchObject({ questionCount: 2 });
		expect(pages[0].questions.map((question) => question.id)).toEqual([
			'visible-one',
			'visible-two'
		]);
	});
});
