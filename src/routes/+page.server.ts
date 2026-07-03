import { getExplorableLearningChains } from '$lib/server/learningChainData';
import { getPersonalDashboard } from '$lib/server/personalLearning';
import type { PageServerLoad } from './$types';

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
