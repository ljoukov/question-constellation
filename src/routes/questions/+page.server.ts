import { getQuestionBankBrowsePageData } from '$lib/server/learningChainData';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const requestedPage = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
	const browseData = await getQuestionBankBrowsePageData({
		search: url.searchParams.get('q') ?? '',
		subject: url.searchParams.get('subject') ?? 'All subjects',
		marks: url.searchParams.get('marks') ?? 'all',
		topic: url.searchParams.get('topic') ?? 'all',
		board: url.searchParams.get('board') ?? 'all',
		page: Number.isFinite(requestedPage) ? requestedPage : 1
	});
	const { sections, ...pageData } = browseData;

	return {
		...pageData,
		sections: sections.map((section) => {
			const { chainCount: _chainCount, ...topic } = section.topic;
			return {
				topic,
				questions: section.questions.map((question) => {
					const { chainId: _chainId, chainTitle: _chainTitle, ...publicQuestion } = question;
					return publicQuestion;
				})
			};
		}),
		user: locals.user
	};
};
