import { getHomePagePublicData } from '$lib/server/learningChainData';
import { getPersonalDashboard } from '$lib/server/personalLearning';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		const dashboard = await getPersonalDashboard(locals.user).catch((error) => {
			console.warn('Failed to load personal dashboard.', error);
			return null;
		});

		return {
			user: locals.user,
			dashboard,
			featuredChains: [],
			stats: {
				chainCount: 0,
				questionCount: 0,
				subjectCount: 0
			}
		};
	}

	const { featuredChains, stats } = await getHomePagePublicData();

	return {
		user: locals.user,
		dashboard: null,
		featuredChains,
		stats
	};
};
