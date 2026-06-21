import { getAnswerChainPageData } from '$lib/server/questionData';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	let data;

	try {
		data = await getAnswerChainPageData(params.chainId);
	} catch {
		throw error(404, 'Answer chain not found.');
	}

	throw redirect(307, `/questions/${data.startQuestion.id}/chain`);
};
