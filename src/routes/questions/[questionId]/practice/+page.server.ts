import { getPracticePageData } from '$lib/server/questionData';
import { getQuestionDraft } from '$lib/server/questionDrafts';
import { supportsLearnerPracticeInput } from '$lib/learning/practiceEligibility';
import { learnerSubjectForQuestion, learnerSubjectHref } from '$lib/learning/subjects';
import { withEnglishPracticeContext } from '$lib/englishPracticeNavigation';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	let practiceData: Awaited<ReturnType<typeof getPracticePageData>>;
	try {
		practiceData = await getPracticePageData(params.questionId);
	} catch {
		throw error(404, 'Practice question not found.');
	}

	if (practiceData.englishPractice) {
		const firstStepId = practiceData.englishPractice.stages[0]?.id;
		if (firstStepId) {
			const stepPath = `/questions/${encodeURIComponent(params.questionId)}/practice/step-by-step/${encodeURIComponent(firstStepId)}`;
			throw redirect(307, withEnglishPracticeContext(stepPath, url.searchParams));
		}
	}

	if (
		locals.user &&
		!supportsLearnerPracticeInput({
			answerFormat: practiceData.question.answerFormat,
			prompt: practiceData.question.prompt,
			responseKind:
				typeof practiceData.question.renderingOverlay?.responseInteraction?.kind === 'string'
					? practiceData.question.renderingOverlay.responseInteraction.kind
					: null
		})
	) {
		const subject = learnerSubjectForQuestion({
			subject: practiceData.question.meta.subject,
			subjectArea: practiceData.question.meta.subjectArea,
			paper: practiceData.question.meta.paper
		});
		throw redirect(303, subject ? learnerSubjectHref(subject) : '/');
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

	return {
		...practiceData,
		user: locals.user,
		savedDraft
	};
};
