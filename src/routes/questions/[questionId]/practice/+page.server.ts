import { getPracticePageData } from '$lib/server/questionData';
import { getQuestionDraft } from '$lib/server/questionDrafts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	let practiceData: Awaited<ReturnType<typeof getPracticePageData>>;
	try {
		practiceData = await getPracticePageData(params.questionId);
	} catch {
		throw error(404, 'Practice question not found.');
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
