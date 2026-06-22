import { getQuestionExperimentPapers } from '$lib/server/questionExperimentData';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	papers: await getQuestionExperimentPapers()
});
