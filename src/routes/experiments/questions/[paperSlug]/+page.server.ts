import { getQuestionExperimentPaper } from '$lib/server/questionExperimentData';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => ({
	paper: await getQuestionExperimentPaper(params.paperSlug)
});
