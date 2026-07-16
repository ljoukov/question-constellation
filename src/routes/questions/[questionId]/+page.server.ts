import { isEnglishSubject } from '$lib/englishSubjects';
import { supportsLearnerPracticeInput } from '$lib/learning/practiceEligibility';
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
			practiceAvailable: supportsLearnerPracticeInput({
				answerFormat: questionData.question.answerFormat,
				prompt: questionData.question.prompt,
				responseKind:
					typeof questionData.question.renderingOverlay?.responseInteraction?.kind === 'string'
						? questionData.question.renderingOverlay.responseInteraction.kind
						: null
			}),
			user: locals.user
		};
	} catch (loadError) {
		if (loadError && typeof loadError === 'object' && 'status' in loadError) throw loadError;
		throw error(404, 'Question not found.');
	}
};
