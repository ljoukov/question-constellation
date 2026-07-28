import { getPracticePageData, getQuestionPageData } from '$lib/server/questionData';
import { getQuestionDraft } from '$lib/server/questionDrafts';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	let practiceData: Awaited<ReturnType<typeof getPracticePageData>>;
	try {
		practiceData = await getPracticePageData(params.questionId);
	} catch {
		const questionData = await getQuestionPageData(params.questionId).catch(() => null);
		if (questionData && !questionData.question.practiceAvailable) {
			throw redirect(303, `/questions/${encodeURIComponent(params.questionId)}`);
		}
		throw error(404, 'Practice question not found.');
	}

	if (!practiceData.question.practiceAvailable) {
		throw redirect(303, `/questions/${encodeURIComponent(practiceData.question.id)}`);
	}

	const savedDraft = locals.user
		? await getQuestionDraft(locals.user.uid, practiceData.question.id).catch((draftError) => {
				console.warn('[practice-page] failed to load saved draft', {
					error: draftError,
					questionId: practiceData.question.id,
					userId: locals.user?.uid
				});
				return null;
			})
		: null;

	const question = practiceData.question;
	return {
		question: {
			id: question.id,
			sourceRef: question.sourceRef,
			title: question.title,
			prompt: question.prompt,
			context: question.context,
			assets: question.assets,
			renderingOverlay: question.renderingOverlay,
			meta: question.meta,
			modelAnswer: question.modelAnswer,
			commonWeakExplanation: question.commonWeakExplanation,
			weakAnswerMissingStepIds: question.weakAnswerMissingStepIds,
			checklist: question.checklist,
			checklistSource: question.checklistSource
		},
		markingPoints: practiceData.chain.steps.map((point) => ({
			id: point.id,
			short: point.short,
			label: point.label
		})),
		nextQuestionId: practiceData.nextQuestion.id,
		user: locals.user,
		savedDraft
	};
};
