import { sitemapIndex, sitemapResponse } from '$lib/server/sitemap';
import type { RequestHandler } from './$types';

const _SITEMAP_SECTION_PATHS = [
	'/sitemaps/static.xml',
	'/sitemaps/past-papers.xml',
	'/sitemaps/questions.xml',
	'/sitemaps/chains.xml',
	'/sitemaps/topics.xml'
] as const;

export const GET: RequestHandler = async () => {
	return sitemapResponse(sitemapIndex([..._SITEMAP_SECTION_PATHS]));
};
