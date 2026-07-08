import { getHomePagePublicData } from '$lib/server/learningChainData';
import { blogArticles } from '$lib/blog/articles';
import type { BlogArticle, BlogArticleMeta } from '$lib/blog/types';
import type { PageServerLoad } from './$types';

function toBlogMeta(article: BlogArticle): BlogArticleMeta {
	const meta = { ...article };
	delete (meta as Partial<BlogArticle>).bodyMarkdown;
	return meta;
}

const latestArticles = blogArticles.slice(0, 3).map(toBlogMeta);

export const load: PageServerLoad = async () => {
	const { featuredChains, stats } = await getHomePagePublicData();

	return {
		featuredChains,
		stats,
		latestArticles
	};
};
