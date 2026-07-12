import { getHomePagePublicData } from '$lib/server/learningChainData';
import {
	getDefaultLearnerProfileSettings,
	getLearnerProfileSettings
} from '$lib/server/personalLearning';
import {
	ANONYMOUS_PROFILE_COOKIE_NAME,
	anonymousProfileSettings,
	parseAnonymousLearnerProfileCookie
} from '$lib/anonymousLearnerProfile';
import { blogArticles } from '$lib/blog/articles';
import type { BlogArticle, BlogArticleMeta } from '$lib/blog/types';
import type { PageServerLoad } from './$types';

function toBlogMeta(article: BlogArticle): BlogArticleMeta {
	const meta = { ...article };
	delete (meta as Partial<BlogArticle>).bodyMarkdown;
	return meta;
}

const latestArticles = blogArticles.slice(0, 3).map(toBlogMeta);

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const [publicData, learnerSettings] = await Promise.all([
		getHomePagePublicData(),
		locals.user
			? getLearnerProfileSettings(locals.user).catch(() => null)
			: getDefaultLearnerProfileSettings()
					.then((settings) =>
						anonymousProfileSettings(
							settings,
							parseAnonymousLearnerProfileCookie(cookies.get(ANONYMOUS_PROFILE_COOKIE_NAME))
						)
					)
					.catch(() => null)
	]);

	return {
		featuredChains: publicData.featuredChains,
		stats: publicData.stats,
		latestArticles,
		learnerSettings,
		user: locals.user
	};
};
