import { getLearningChain, getQuestionTeaser } from '$lib/learningChains';
import { getQuestionExperimentPaper } from '$lib/server/questionExperimentData';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const chain = getLearningChain(params.chainId);
	if (!chain) {
		throw error(404, 'Question chain not found.');
	}

	const question = getQuestionTeaser(chain, params.ref);
	if (!question) {
		throw error(404, 'Question not found in this chain.');
	}

	return {
		chain,
		initialRef: question.ref,
		paper: await getQuestionExperimentPaper(chain.paperSlug)
	};
};
