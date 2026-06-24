import { getLearningChain } from '$lib/learningChains';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const chain = getLearningChain(params.chainId);
	if (!chain) {
		throw error(404, 'Question chain not found.');
	}

	return { chain };
};
