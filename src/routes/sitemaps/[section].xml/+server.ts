import {
	gcsePastPaperBoards,
	gcsePastPaperEntryIndex,
	gcsePastPaperSubjectIndex
} from '$lib/pastPapers/gcsePastPapers';
import { challengeCatalog, challengePath, challengeSubjects } from '$lib/challenges/catalog';
import { blogArticles } from '$lib/blog/articles';
import {
	getPublicChainSitemapEntries,
	getPublicQuestionSitemapEntries,
	getSeoTopicSitemapEntries
} from '$lib/server/seoIndexData';
import type { SitemapEntry } from '$lib/server/sitemap';
import { sitemapResponse, sitemapUrlSet } from '$lib/server/sitemap';
import type { RequestHandler } from './$types';

const staticEntries: SitemapEntry[] = [
	{ path: '/', priority: '1.0', changefreq: 'weekly' },
	{ path: '/chains', priority: '0.95', changefreq: 'weekly' },
	{ path: '/past-papers', priority: '0.95', changefreq: 'weekly' },
	{ path: '/past-papers/gcse', priority: '0.9', changefreq: 'weekly' },
	{ path: '/english', priority: '0.7', changefreq: 'monthly' },
	{ path: '/recall', priority: '0.6', changefreq: 'monthly' }
];

function challengeEntries(): SitemapEntry[] {
	return [
		{ path: '/challenges', priority: '0.92', changefreq: 'weekly', lastmod: '2026-07-17' },
		...challengeSubjects.map((subject) => ({
			path: `/challenges/${subject.subject}`,
			priority: '0.88',
			changefreq: 'weekly' as const,
			lastmod: '2026-07-17'
		})),
		...challengeCatalog.map((challenge) => ({
			path: challengePath(challenge),
			priority: '0.82',
			changefreq: 'monthly' as const,
			lastmod: challenge.lastReviewed
		}))
	];
}

function pastPaperEntries(): SitemapEntry[] {
	const boardEntries: SitemapEntry[] = gcsePastPaperBoards
		.filter((board) => board.id !== 'all')
		.map((board) => ({
			path: `/past-papers/gcse/${board.id}`,
			changefreq: 'weekly',
			priority: '0.85'
		}));
	const subjectEntries: SitemapEntry[] = gcsePastPaperSubjectIndex.map((page) => ({
		path: page.localPath,
		changefreq: 'monthly',
		priority: '0.8'
	}));
	const paperEntries: SitemapEntry[] = gcsePastPaperEntryIndex.map((entry) => ({
		path: entry.localPath,
		changefreq: 'yearly',
		priority: '0.75'
	}));

	return [...boardEntries, ...subjectEntries, ...paperEntries];
}

function blogEntries(): SitemapEntry[] {
	return [
		{ path: '/blog', priority: '0.82', changefreq: 'weekly' },
		...blogArticles.map((article) => ({
			path: `/blog/${article.slug}`,
			changefreq: 'monthly' as const,
			priority: article.category === 'Comparison' ? '0.74' : '0.7',
			lastmod: article.updatedAt ?? article.publishedAt
		}))
	];
}

function uniqueEntries(entries: SitemapEntry[]) {
	const seen = new Set<string>();
	return entries.filter((entry) => {
		if (seen.has(entry.path)) return false;
		seen.add(entry.path);
		return true;
	});
}

async function entriesForSection(section: string): Promise<SitemapEntry[] | null> {
	if (section === 'static') return uniqueEntries(staticEntries);
	if (section === 'challenges') return uniqueEntries(challengeEntries());
	if (section === 'blog') return uniqueEntries(blogEntries());
	if (section === 'past-papers') return uniqueEntries(pastPaperEntries());
	if (section === 'questions') return uniqueEntries(await getPublicQuestionSitemapEntries());
	if (section === 'chains') return uniqueEntries(await getPublicChainSitemapEntries());
	if (section === 'topics') return uniqueEntries(await getSeoTopicSitemapEntries());
	return null;
}

export const GET: RequestHandler = async ({ params }) => {
	const entries = await entriesForSection(params.section);
	if (!entries) {
		return new Response('Sitemap section not found.', { status: 404 });
	}

	return sitemapResponse(sitemapUrlSet(entries));
};
