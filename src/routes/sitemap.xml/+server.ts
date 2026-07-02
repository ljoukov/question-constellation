import type { RequestHandler } from './$types';
import { gcsePastPaperBoards, gcsePastPaperSubjectIndex } from '$lib/pastPapers/gcsePastPapers';

const BASE_URL = 'https://constellation.eviworld.com';

type SitemapUrl = {
	path: string;
	priority: string;
	changefreq: string;
};

const staticUrls: SitemapUrl[] = [
	{ path: '/', priority: '1.0', changefreq: 'weekly' },
	{ path: '/past-papers/gcse', priority: '0.9', changefreq: 'weekly' },
	{ path: '/english', priority: '0.7', changefreq: 'monthly' },
	{ path: '/recall', priority: '0.6', changefreq: 'monthly' }
];

function urlEntry({ path, priority, changefreq }: SitemapUrl) {
	return [
		'<url>',
		`<loc>${BASE_URL}${path}</loc>`,
		`<changefreq>${changefreq}</changefreq>`,
		`<priority>${priority}</priority>`,
		'</url>'
	].join('');
}

function pastPaperSubjectEntry(path: string) {
	return [
		'<url>',
		`<loc>${BASE_URL}${path}</loc>`,
		'<changefreq>monthly</changefreq>',
		'<priority>0.8</priority>',
		'</url>'
	].join('');
}

function pastPaperBoardEntry(path: string) {
	return [
		'<url>',
		`<loc>${BASE_URL}${path}</loc>`,
		'<changefreq>weekly</changefreq>',
		'<priority>0.85</priority>',
		'</url>'
	].join('');
}

export const GET: RequestHandler = async () => {
	const boardPaths = gcsePastPaperBoards
		.filter((board) => board.id !== 'all')
		.map((board) => `/past-papers/gcse/${board.id}`);
	const body = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		staticUrls.map(urlEntry).join(''),
		boardPaths.map(pastPaperBoardEntry).join(''),
		gcsePastPaperSubjectIndex.map((page) => pastPaperSubjectEntry(page.localPath)).join(''),
		'</urlset>'
	].join('');

	return new Response(body, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
