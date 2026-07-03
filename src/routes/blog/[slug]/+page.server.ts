import { error } from '@sveltejs/kit';
import { getArticle, getRelatedArticles } from '$lib/blog/articles';
import type { BlogArticle, BlogArticleMeta } from '$lib/blog/types';

function toMeta(article: BlogArticle): BlogArticleMeta {
	const meta = { ...article };
	delete (meta as Partial<BlogArticle>).bodyMarkdown;
	return meta;
}

export function load({ params }) {
	const article = getArticle(params.slug);
	if (!article) {
		error(404, 'Blog article not found');
	}

	return {
		article,
		relatedArticles: getRelatedArticles(article).map(toMeta)
	};
}
