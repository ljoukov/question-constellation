import { getQuestionExperimentPaper } from '$lib/server/questionExperimentData';
import type { PageServerLoad } from './$types';

const paperSlug = 'aqa-8464p1h-jun18';

export const load: PageServerLoad = async () => ({
	paper: await getQuestionExperimentPaper(paperSlug),
	initialRef: '03.3'
});
