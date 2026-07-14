import {
	getHomePagePublicData,
	type HomePagePublicData
} from '$lib/server/learningChainData';
import {
	getDefaultLearnerProfileSettings
} from '$lib/server/personalLearning';
import { getSignedInLearningHome } from '$lib/server/subjectLearning';
import { refreshOneStaleRecommendationWithModel } from '$lib/server/recommendationLlm';
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

export const load: PageServerLoad = async ({ cookies, locals, platform }) => {
	const emptyPublicData: HomePagePublicData = {
		featuredChains: [],
		stats: { chainCount: 0, questionCount: 0, subjectCount: 0 }
	};
	const [publicData, baseLearnerSettings, dashboard] = locals.user
		? [emptyPublicData, null, await getSignedInLearningHome(locals.user)]
		: await Promise.all([
				getHomePagePublicData(),
				getDefaultLearnerProfileSettings().catch(() => null),
				Promise.resolve(null)
			]);
	const localProfile = parseAnonymousLearnerProfileCookie(
		cookies.get(ANONYMOUS_PROFILE_COOKIE_NAME)
	);
	const learnerSettings = baseLearnerSettings
		? anonymousProfileSettings(
				baseLearnerSettings,
				!locals.user || localProfile?.pendingSync ? localProfile : null
			)
		: null;
	if (
		locals.user &&
		dashboard &&
		platform?.ctx &&
		typeof platform.env.CHATGPT_CODEX_PROXY_URL === 'string' &&
		typeof platform.env.CHATGPT_CODEX_PROXY_API_KEY === 'string'
	) {
		const eligibleSubjects = dashboard.subjects
			.filter((subject) => subject.scope.status !== 'not_set')
			.filter((subject) => subject.alternatives.filter((action) => action.available).length >= 2)
			.map((subject) => subject.subject);
		platform.ctx.waitUntil(
			refreshOneStaleRecommendationWithModel({
				user: locals.user,
				subjects: eligibleSubjects,
				platformEnv: platform.env
			})
		);
	}

	return {
		featuredChains: publicData.featuredChains,
		stats: publicData.stats,
		latestArticles,
		learnerSettings,
		dashboard,
		user: locals.user
	};
};
