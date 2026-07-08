import { getHomePagePublicData } from '$lib/server/learningChainData';
import { getPersonalDashboard } from '$lib/server/personalLearning';
import { blogArticles } from '$lib/blog/articles';
import type { BlogArticle, BlogArticleMeta } from '$lib/blog/types';
import type { PageServerLoad } from './$types';

function toBlogMeta(article: BlogArticle): BlogArticleMeta {
	const meta = { ...article };
	delete (meta as Partial<BlogArticle>).bodyMarkdown;
	return meta;
}

const latestArticles = blogArticles.slice(0, 3).map(toBlogMeta);

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
			},
			latestArticles
		};
	}

	const { featuredChains, stats } = await getHomePagePublicData();

	return {
		user: locals.user,
		dashboard: null,
		featuredChains,
		stats,
		latestArticles
	};
};
