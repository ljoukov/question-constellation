import { getGapLearningData } from '$lib/server/personalLearning';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) {
		throw redirect(302, `/auth/relogin?next=${encodeURIComponent(url.pathname)}`);
	}

	const gapData = await getGapLearningData(locals.user.uid, params.gapId);
	if (!gapData) {
		throw error(404, 'Practice step not found.');
	}
	const learnerGapData = {
		...gapData,
		presentation: {
			...gapData.presentation,
			questions: gapData.presentation.questions.map(({ id, question }) => ({ id, question }))
		}
	};

	return {
		user: locals.user,
		gapData: learnerGapData
	};
};
