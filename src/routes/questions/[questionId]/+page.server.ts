import { isEnglishSubject } from '$lib/englishSubjects';
import { getQuestionChainPageData } from '$lib/server/questionData';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		const questionData = await getQuestionChainPageData(params.questionId);

		// English keeps its dedicated step-by-step teaching flow. The public
		// question entry introduced here is the science question-first path.
		if (isEnglishSubject(questionData.question.meta.subject)) {
			throw redirect(307, `/questions/${encodeURIComponent(params.questionId)}/practice`);
		}

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
