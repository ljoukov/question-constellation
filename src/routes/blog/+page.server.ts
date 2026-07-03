import { blogArticles, comparisonArticles, learningArticles } from '$lib/blog/articles';
import type { BlogArticle, BlogArticleMeta } from '$lib/blog/types';

function toMeta(article: BlogArticle): BlogArticleMeta {
	const meta = { ...article };
	delete (meta as Partial<BlogArticle>).bodyMarkdown;
	return meta;
}

export function load() {
	return {
		articles: blogArticles.map(toMeta),
		comparisonArticles: comparisonArticles.map(toMeta),
		learningArticles: learningArticles.map(toMeta)
	};
}
