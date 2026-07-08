import { getQuestionBankBrowseData } from '$lib/server/learningChainData';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const browseData = await getQuestionBankBrowseData();

	return {
		...browseData,
		initialSearch: url.searchParams.get('q') ?? '',
		initialSubject: url.searchParams.get('subject') ?? 'All subjects',
		initialMarks: url.searchParams.get('marks') ?? 'all',
		initialView: url.searchParams.get('view') ?? 'topics',
		initialTopic: url.searchParams.get('topic') ?? 'all',
		initialBoard: url.searchParams.get('board') ?? 'all'
	};
};
