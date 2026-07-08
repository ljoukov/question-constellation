import { getPublicQuestionData } from '$lib/server/questionData';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		return await getPublicQuestionData(params.questionId);
	} catch {
		throw error(404, 'Question not found.');
	}
};
