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

	return {
		...browseData,
		user: locals.user
	};
};
