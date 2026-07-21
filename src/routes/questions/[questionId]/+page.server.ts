import { getQuestionChainPageData } from '$lib/server/questionData';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		const questionData = await getQuestionChainPageData(params.questionId);

		return {
			...questionData,
			practiceAvailable: questionData.question.practiceAvailable,
			user: locals.user
		};
	} catch (loadError) {
		if (loadError && typeof loadError === 'object' && 'status' in loadError) throw loadError;
		throw error(404, 'Question not found.');
	}
};
