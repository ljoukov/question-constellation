import { getExplorableLearningChain } from '$lib/server/learningChainData';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const chain = await getExplorableLearningChain(params.chainId);
	if (!chain) {
		throw error(404, 'Question chain not found.');
	}

	return { chain };
};
