import { getConstellationPageData } from '$lib/server/questionData';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		return await getConstellationPageData(params.chainId);
	} catch {
		throw error(404, 'Constellation not found.');
	}
};
