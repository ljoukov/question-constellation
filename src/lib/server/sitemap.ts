const BASE_URL = 'https://constellation.eviworld.com';

export type SitemapEntry = {
	path: string;
	changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
	priority: string;
	lastmod?: string;
};

export function absoluteSiteUrl(path: string) {
	return `${BASE_URL}${path}`;
}

function escapeXml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function urlEntry({ path, priority, changefreq, lastmod }: SitemapEntry) {
	return [
		'<url>',
		`<loc>${escapeXml(absoluteSiteUrl(path))}</loc>`,
		lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : '',
		`<changefreq>${changefreq}</changefreq>`,
		`<priority>${priority}</priority>`,
		'</url>'
	].join('');
}

export function sitemapUrlSet(entries: SitemapEntry[]) {
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		entries.map(urlEntry).join(''),
		'</urlset>'
	].join('');
}

export function sitemapIndex(paths: string[]) {
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		paths
			.map((path) =>
				['<sitemap>', `<loc>${escapeXml(absoluteSiteUrl(path))}</loc>`, '</sitemap>'].join('')
			)
			.join(''),
		'</sitemapindex>'
	].join('');
}

export function sitemapResponse(body: string, maxAge = 3600) {
	return new Response(body, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': `public, max-age=${maxAge}`
		}
	});
}
