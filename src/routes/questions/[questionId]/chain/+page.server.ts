import { getQuestionChainPageData } from '$lib/server/questionData';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		return await getQuestionChainPageData(params.questionId);
	} catch {
		throw error(404, 'Question chain not found.');
	}
};
