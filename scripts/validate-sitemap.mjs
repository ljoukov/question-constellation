#!/usr/bin/env node

const PRODUCTION_ORIGIN = 'https://constellation.eviworld.com';
const SITEMAP_URL_LIMIT = 50_000;
const SITEMAP_BYTE_LIMIT = 50 * 1024 * 1024;
const PRIVATE_PATH_PATTERNS = [
	/^\/api(?:\/|$)/,
	/^\/auth(?:\/|$)/,
	/^\/images(?:\/|$)/,
	/^\/experiments(?:\/|$)/
];

function parseArgs(argv) {
	const options = {
		baseUrl: 'http://127.0.0.1:4173',
		checkPages: true,
		concurrency: 12,
		limit: Infinity
	};

	for (const arg of argv) {
		if (arg.startsWith('--base-url=')) {
			options.baseUrl = arg.slice('--base-url='.length).replace(/\/$/, '');
		} else if (arg === '--no-check-pages') {
			options.checkPages = false;
		} else if (arg.startsWith('--concurrency=')) {
			const value = Number(arg.slice('--concurrency='.length));
			options.concurrency =
				Number.isFinite(value) && value > 0 ? Math.floor(value) : options.concurrency;
		} else if (arg.startsWith('--limit=')) {
			const value = Number(arg.slice('--limit='.length));
			options.limit = Number.isFinite(value) && value > 0 ? value : options.limit;
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return options;
}

async function fetchText(url) {
	const response = await fetch(url, { redirect: 'manual' });
	const text = await response.text();
	return { response, text };
}

function localUrlForProductionLoc(baseUrl, loc) {
	const url = new URL(loc);
	return `${baseUrl}${url.pathname}${url.search}`;
}

function extractTagValues(xml, tagName) {
	const pattern = new RegExp(`<${tagName}>(.*?)</${tagName}>`, 'g');
	return Array.from(xml.matchAll(pattern), (match) => decodeXml(match[1]));
}

function decodeXml(value) {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'");
}

function extractCanonical(html) {
	const link = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i)?.[0];
	if (!link) return null;
	return link.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? null;
}

function canonicalToAbsolute(canonical, pageUrl) {
	return new URL(canonical, pageUrl).toString().replace(/\/$/, '/');
}

function normalizeAbsoluteUrl(url) {
	const parsed = new URL(url);
	parsed.hash = '';
	return parsed.toString();
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function validateLoc(loc, seen) {
	const url = new URL(loc);
	assert(url.origin === PRODUCTION_ORIGIN, `Non-production sitemap URL: ${loc}`);
	assert(!url.search, `Sitemap URL should not include query params: ${loc}`);
	assert(!url.hash, `Sitemap URL should not include hashes: ${loc}`);
	assert(!seen.has(loc), `Duplicate sitemap URL: ${loc}`);
	assert(
		!PRIVATE_PATH_PATTERNS.some((pattern) => pattern.test(url.pathname)),
		`Private/internal URL included in sitemap: ${loc}`
	);
	seen.add(loc);
}

async function validatePage(baseUrl, loc) {
	const localUrl = localUrlForProductionLoc(baseUrl, loc);
	const { response, text } = await fetchText(localUrl);
	assert(response.status === 200, `Expected 200 for ${loc}; got ${response.status}`);

	const contentType = response.headers.get('content-type') ?? '';
	if (!contentType.includes('text/html')) return;

	const canonical = extractCanonical(text);
	assert(canonical, `Missing canonical link on ${loc}`);
	const expected = normalizeAbsoluteUrl(loc);
	const actual = normalizeAbsoluteUrl(canonicalToAbsolute(canonical, loc));
	assert(actual === expected, `Canonical mismatch for ${loc}; got ${actual}`);
}

async function validatePages(baseUrl, locs, concurrency) {
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(concurrency, locs.length) }, async () => {
		while (nextIndex < locs.length) {
			const loc = locs[nextIndex];
			nextIndex += 1;
			await validatePage(baseUrl, loc);
		}
	});
	await Promise.all(workers);
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const sitemapIndexUrl = `${options.baseUrl}/sitemap.xml`;
	const { response: indexResponse, text: indexXml } = await fetchText(sitemapIndexUrl);
	assert(
		indexResponse.status === 200,
		`Expected 200 for /sitemap.xml; got ${indexResponse.status}`
	);
	assert(indexXml.includes('<sitemapindex'), '/sitemap.xml must be a sitemap index');

	const sitemapLocs = extractTagValues(indexXml, 'loc');
	assert(sitemapLocs.length > 0, '/sitemap.xml did not list any section sitemaps');

	const seenUrls = new Set();
	const sectionSummaries = [];
	for (const sitemapLoc of sitemapLocs) {
		const sectionUrl = localUrlForProductionLoc(options.baseUrl, sitemapLoc);
		const { response: sectionResponse, text: sectionXml } = await fetchText(sectionUrl);
		assert(
			sectionResponse.status === 200,
			`Expected 200 for ${sitemapLoc}; got ${sectionResponse.status}`
		);
		assert(sectionXml.includes('<urlset'), `${sitemapLoc} is not a urlset sitemap`);
		assert(
			Buffer.byteLength(sectionXml, 'utf8') <= SITEMAP_BYTE_LIMIT,
			`${sitemapLoc} exceeds sitemap byte limit`
		);

		const locs = extractTagValues(sectionXml, 'loc');
		assert(locs.length <= SITEMAP_URL_LIMIT, `${sitemapLoc} exceeds sitemap URL limit`);
		for (const loc of locs) validateLoc(loc, seenUrls);
		sectionSummaries.push({ loc: sitemapLoc, count: locs.length });
	}

	if (options.checkPages) {
		const urlsToCheck = Array.from(seenUrls).slice(0, options.limit);
		await validatePages(options.baseUrl, urlsToCheck, options.concurrency);
	}

	console.log(
		JSON.stringify(
			{
				ok: true,
				baseUrl: options.baseUrl,
				sectionCount: sectionSummaries.length,
				urlCount: seenUrls.size,
				checkedPageCount: options.checkPages ? Math.min(seenUrls.size, options.limit) : 0,
				concurrency: options.checkPages ? options.concurrency : 0,
				sections: sectionSummaries
			},
			null,
			2
		)
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
