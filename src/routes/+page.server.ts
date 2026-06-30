import { getExplorableLearningChains } from '$lib/server/learningChainData';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => ({
	chains: await getExplorableLearningChains(),
	initialSearch: url.searchParams.get('q') ?? '',
	initialSubject: url.searchParams.get('subject') ?? 'All subjects',
	initialMarks: url.searchParams.get('marks') ?? 'all'
});
