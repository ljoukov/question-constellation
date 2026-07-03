import { getExplorableLearningChains } from '$lib/server/learningChainData';
import { getPersonalDashboard, updateUserPreferences } from '$lib/server/personalLearning';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const chains = await getExplorableLearningChains();
	const subjects = new Set(chains.map((chain) => chain.subject).filter(Boolean));
	const questionCount = chains.reduce((total, chain) => total + chain.questions.length, 0);
	const dashboard = locals.user
		? await getPersonalDashboard(locals.user).catch((error) => {
				console.warn('Failed to load personal dashboard.', error);
				return null;
			})
		: null;

	return {
		user: locals.user,
		dashboard,
		featuredChains: chains.slice(0, 3),
		stats: {
			chainCount: chains.length,
			questionCount,
			subjectCount: subjects.size
		}
	};
};

export const actions: Actions = {
	updatePreferences: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { message: 'Sign in to save preferences.' });
		}

		const form = await request.formData();
		const board = String(form.get('board') ?? 'AQA');
		const subject = String(form.get('subject') ?? 'Biology');
		const tier = String(form.get('tier') ?? 'Higher');
		await updateUserPreferences({
			userId: locals.user.uid,
			board,
			subject,
			tier
		});

		return { saved: true };
	}
};
