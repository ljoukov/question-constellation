import { getExplorableLearningChain, getQuestionTeaser } from '$lib/server/learningChainData';
import { getFocusedQuestionExperimentPaper } from '$lib/server/questionExperimentData';
import { getPublicRoutePayload, practiceRoutePayloadId } from '$lib/server/publicRoutePayloads';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const materialized = await getPublicRoutePayload<{
		chain: Awaited<ReturnType<typeof getExplorableLearningChain>>;
		initialRef: string;
		paper: Awaited<ReturnType<typeof getFocusedQuestionExperimentPaper>>;
	}>(practiceRoutePayloadId(params.chainId, params.ref)).catch(() => null);
	if (materialized?.chain && materialized.paper) return materialized;

	const chain = await getExplorableLearningChain(params.chainId);
	if (!chain) {
		throw error(404, 'Question chain not found.');
	}

	const question = getQuestionTeaser(chain, params.ref);
	if (!question) {
		throw error(404, 'Question not found in this chain.');
	}

	return {
		chain,
		initialRef: question.id ?? question.ref,
		paper: await getFocusedQuestionExperimentPaper(
			question.paperSlug ?? chain.paperSlug,
			question.sourceRef ?? question.ref
		)
	};
};
