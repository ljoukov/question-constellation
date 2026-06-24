import { getExplorableLearningChains } from '$lib/server/learningChainData';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	chains: await getExplorableLearningChains()
});
