import { getPublicQuestionData } from '$lib/server/questionData';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		return {
			...(await getPublicQuestionData(params.questionId)),
			user: locals.user
		};
	} catch {
		throw error(404, 'Question not found.');
	}
};
