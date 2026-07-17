import { getQuestionExperimentPaper } from '$lib/server/questionExperimentData';
import { getQuestionExperimentPaperSittingAvailability } from '$lib/server/paperSittingReadiness';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const paper = await getQuestionExperimentPaper(params.paperSlug);
	return {
		paper,
		user: locals.user,
		sittingAvailability: await getQuestionExperimentPaperSittingAvailability(paper)
	};
};
