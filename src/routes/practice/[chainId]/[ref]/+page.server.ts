import { getExplorableLearningChain, getQuestionTeaser } from '$lib/server/learningChainData';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const chain = await getExplorableLearningChain(params.chainId);
	if (!chain) throw error(404, 'Question chain not found.');

	const question = getQuestionTeaser(chain, params.ref);
	if (!question) throw error(404, 'Question not found in this chain.');

	throw redirect(
		307,
		`/questions/${encodeURIComponent(question.id ?? question.ref)}/practice`
	);
};
