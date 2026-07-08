import { blogArticles } from '$lib/blog/articles';
import type { BlogArticle, BlogArticleMeta } from '$lib/blog/types';
import type { PageServerLoad } from './$types';

function toMeta(article: BlogArticle): BlogArticleMeta {
	const meta = { ...article };
	delete (meta as Partial<BlogArticle>).bodyMarkdown;
	return meta;
}

export const load: PageServerLoad = async ({ locals }) => {
	return {
		articles: blogArticles.map(toMeta),
		user: locals.user
	};
};
