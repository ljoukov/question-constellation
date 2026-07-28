import { getQuestionPageData } from '$lib/server/questionData';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	try {
		const questionData = await getQuestionPageData(params.questionId);
		const question = questionData.question;

		return {
			question: {
				id: question.id,
				sourceRef: question.sourceRef,
				title: question.title,
				prompt: question.prompt,
				context: question.context,
				assets: question.assets,
				renderingOverlay: question.renderingOverlay,
				practiceUnavailableReason: question.practiceUnavailableReason,
				meta: question.meta,
				modelAnswer: question.modelAnswer,
				commonWeakAnswer: question.commonWeakAnswer,
				commonWeakExplanation: question.commonWeakExplanation,
				checklist: question.checklist,
				checklistSource: question.checklistSource
			},
			practiceQuestion: {
				id: questionData.practiceQuestion.id,
				practiceAvailable: questionData.practiceQuestion.practiceAvailable
			},
			practiceAvailable: questionData.question.practiceAvailable,
			user: locals.user
		};
	} catch (loadError) {
		if (loadError && typeof loadError === 'object' && 'status' in loadError) throw loadError;
		throw error(404, 'Question not found.');
	}
};
