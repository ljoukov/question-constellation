import { getQuestionChainPageData, isEnglishQuestion } from '$lib/server/questionData';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	if (await isEnglishQuestion(params.questionId)) {
		throw redirect(307, `/questions/${encodeURIComponent(params.questionId)}/practice`);
	}

	try {
		return await getQuestionChainPageData(params.questionId);
	} catch {
		throw error(404, 'Question chain not found.');
	}
};
