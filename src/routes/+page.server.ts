import { learningChains } from '$lib/learningChains';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	chains: learningChains
});
