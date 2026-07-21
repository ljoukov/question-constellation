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

	if (practiceData.englishPractice) {
		const firstStepId = practiceData.englishPractice.stages[0]?.id;
		if (firstStepId) {
			const stepPath = `/questions/${encodeURIComponent(params.questionId)}/practice/${encodeURIComponent(firstStepId)}`;
			throw redirect(307, withEnglishPracticeContext(stepPath, url.searchParams));
		}
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

	return {
		...practiceData,
		user: locals.user,
		savedDraft
	};
};
