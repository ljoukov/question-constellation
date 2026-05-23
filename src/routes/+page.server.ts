import { getHomeData } from '$lib/server/questionData';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return getHomeData();
};
