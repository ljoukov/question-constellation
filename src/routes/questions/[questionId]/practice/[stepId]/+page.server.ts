import { getPracticePageData, getQuestionChainPageData } from '$lib/server/questionData';
import { getQuestionDraft } from '$lib/server/questionDrafts';
import { withEnglishPracticeContext } from '$lib/englishPracticeNavigation';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	let practiceData: Awaited<ReturnType<typeof getPracticePageData>>;
	try {
		practiceData = await getPracticePageData(params.questionId);
	} catch {
		const questionData = await getQuestionChainPageData(params.questionId).catch(() => null);
		if (questionData && !questionData.question.practiceAvailable) {
			throw redirect(303, `/questions/${encodeURIComponent(params.questionId)}`);
		}
		throw error(404, 'Practice question not found.');
	}

	const englishPractice = practiceData.englishPractice;
	if (!englishPractice) {
		throw redirect(307, `/questions/${encodeURIComponent(params.questionId)}/practice`);
	}

	if (!englishPractice.stages.some((stage) => stage.id === params.stepId)) {
		const firstStepId = englishPractice.stages[0]?.id;
		if (!firstStepId) throw error(404, 'Practice step not found.');
		const stepPath = `/questions/${encodeURIComponent(params.questionId)}/practice/${encodeURIComponent(firstStepId)}`;
		throw redirect(
			307,
			withEnglishPracticeContext(stepPath, url.searchParams)
		);
	}

	const savedDraft = locals.user
		? await getQuestionDraft(locals.user.uid, practiceData.question.id).catch((draftError) => {
				console.warn('[english-step-page] failed to load saved draft', {
					error: draftError,
					questionId: practiceData.question.id,
					userId: locals.user?.uid
				});
				return null;
			})
		: null;

	return {
		...practiceData,
		englishPractice,
		stepId: params.stepId,
		user: locals.user,
		savedDraft
	};
};
