import { parse as parseYaml } from 'yaml';
import type { BlogArticle, BlogArticleMeta } from './types';

export type { BlogArticle, BlogArticleMeta } from './types';

const rawArticleModules = import.meta.glob('./content/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

function parseArticle(path: string, raw: string): BlogArticle {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) {
		throw new Error(`Blog article ${path} is missing frontmatter.`);
	}

	const meta = parseYaml(match[1]) as BlogArticleMeta;
	if (!meta.slug) throw new Error(`Blog article ${path} is missing a slug.`);
	if (!meta.title) throw new Error(`Blog article ${path} is missing a title.`);

	return {
		...meta,
		bodyMarkdown: match[2].trim()
	};
}

export const blogArticles = Object.entries(rawArticleModules)
	.map(([path, raw]) => parseArticle(path, raw))
	.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

export const articlesBySlug = new Map(blogArticles.map((article) => [article.slug, article]));

export const comparisonArticles = blogArticles.filter(
	(article) => article.category === 'Comparison'
);

export const learningArticles = blogArticles.filter((article) => article.category !== 'Comparison');

export function getArticle(slug: string) {
	return articlesBySlug.get(slug) ?? null;
}

export function getRelatedArticles(article: BlogArticle) {
	return article.relatedSlugs
		.map((slug) => articlesBySlug.get(slug))
		.filter((related): related is BlogArticle => Boolean(related));
}
