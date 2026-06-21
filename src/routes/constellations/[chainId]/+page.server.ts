import { getConstellationPageData } from '$lib/server/questionData';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	let data;

	try {
		data = getConstellationPageData(params.chainId);
	} catch {
		throw error(404, 'Constellation not found.');
	}

	throw redirect(307, `/questions/${data.startQuestion.id}/chain`);
};
