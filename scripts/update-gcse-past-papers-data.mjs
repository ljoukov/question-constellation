import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_ROOT = process.env.GCSE_PAST_PAPER_SOURCE_ROOT?.replace(/\/$/, '');
if (!SOURCE_ROOT) {
	throw new Error('Set GCSE_PAST_PAPER_SOURCE_ROOT to the source past-paper index origin.');
}
const GCSE_ROOT = `${SOURCE_ROOT}/uk/past-papers/gcse`;
const OUTPUT_PATH = 'src/lib/pastPapers/gcsePastPaperData.json';
const SUMMARY_PATH = 'tmp/gcse-past-papers-scrape-summary.json';

const BOARD_IDS = ['aqa', 'edexcel', 'ocr', 'wjec'];
const BOARD_NAMES = {
	aqa: 'AQA',
	edexcel: 'Edexcel',
	ocr: 'OCR',
	wjec: 'WJEC'
};

const URL_FIXES = {
	'https://pastpapers.download.wjec.co.uk/s19-3430u10-1+3430ua-1%20wjec%20gcse%20da%20biology%20-%20u-ms.pdf':
		{
			url: 'https://pmt.physicsandmathstutor.com/download/Science/GCSE/Past-Papers/WJEC-Wales/Unit-1F/June%202019%20MS%20-%20Unit%201%20%28F%29%20WJEC%20Science%20GCSE.pdf',
			note: 'Replacement for unavailable WJEC Science Double Award 2019 Unit 1 mark-scheme link.'
		},
	'https://pastpapers.download.wjec.co.uk/s19-3430u20-1+3430ub0-1%20wjec%20gcse%20da%20chemistry%20-ms.pdf':
		{
			url: 'https://pmt.physicsandmathstutor.com/download/Science/GCSE/Past-Papers/WJEC-Wales/Unit-2F/June%202019%20MS%20-%20Unit%202%20%28F%29%20WJEC%20Science%20GCSE.pdf',
			note: 'Replacement for unavailable WJEC Science Double Award 2019 Unit 2 mark-scheme link.'
		},
	'https://pastpapers.download.wjec.co.uk/s19-3430u40-1+3430ud0-1%20wjec%20gcse%20da%20biology%20-%20-ms.pdf':
		{
			url: 'https://pmt.physicsandmathstutor.com/download/Science/GCSE/Past-Papers/WJEC-Wales/Unit-4F/June%202019%20MS%20-%20Unit%204%20%28F%29%20WJEC%20Science%20GCSE.pdf',
			note: 'Replacement for unavailable WJEC Science Double Award 2019 Unit 4 mark-scheme link.'
		},
	'https://pastpapers.download.wjec.co.uk/s19-3430u50-1+3430ue0-1%20wjec%20gcse%20da%20chemistry%20-ms.pdf':
		{
			url: 'https://pmt.physicsandmathstutor.com/download/Science/GCSE/Past-Papers/WJEC-Wales/Unit-5F/June%202019%20MS%20-%20Unit%205%20%28F%29%20WJEC%20Science%20GCSE.pdf',
			note: 'Replacement for unavailable WJEC Science Double Award 2019 Unit 5 mark-scheme link.'
		}
};

const args = new Set(process.argv.slice(2));
const skipVerify = args.has('--skip-verify');
const allowBroken = args.has('--allow-broken');

function decodeHtml(value) {
	return value
		.replaceAll('&amp;', '&')
		.replaceAll('&nbsp;', ' ')
		.replaceAll('&#x27;', "'")
		.replaceAll('&#39;', "'")
		.replaceAll('&quot;', '"')
		.replaceAll('&gt;', '>')
		.replaceAll('&lt;', '<');
}

function textContent(html) {
	return decodeHtml(
		html
			.replace(/<!--.*?-->/gs, '')
			.replace(/<script[\s\S]*?<\/script>/gi, '')
			.replace(/<style[\s\S]*?<\/style>/gi, '')
			.replace(/<svg[\s\S]*?<\/svg>/gi, '')
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

function attrValue(attributes, name) {
	const match =
		attributes.match(new RegExp(`${name}="([^"]*)"`)) ||
		attributes.match(new RegExp(`${name}='([^']*)'`));
	return match ? decodeHtml(match[1]) : '';
}

function absoluteUrl(href) {
	return href.startsWith('http') ? new URL(href).toString() : new URL(href, SOURCE_ROOT).toString();
}

function fixDocumentUrl(url) {
	return URL_FIXES[url] ?? { url };
}

function slugify(value) {
	return value
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

async function fetchText(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status}`);
	}
	return response.text();
}

async function parseBoardPage(boardId) {
	const pageUrl = `${GCSE_ROOT}/${boardId}`;
	const html = await fetchText(pageUrl);
	const pages = [];
	let category = 'Subjects';
	let currentSubject = '';
	const tokenPattern = /<(h2|h3)\b[^>]*>([\s\S]*?)<\/\1>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
	let match;

	while ((match = tokenPattern.exec(html))) {
		if (match[1] === 'h2') {
			const heading = textContent(match[2]);
			if (heading && /^(STEM Subjects|Humanities & Social Sciences)$/i.test(heading)) {
				category = heading;
			}
			continue;
		}

		if (match[1] === 'h3') {
			currentSubject = textContent(match[2]);
			continue;
		}

		const href = attrValue(match[3], 'href');
		const subjectMatch = href.match(new RegExp(`/uk/past-papers/gcse/${boardId}/([^"'#?]+)`));
		if (!subjectMatch) continue;

		const label = textContent(match[4])
			.replace(/\s*(?:->|\u2192)$/, '')
			.trim();
		let subject = currentSubject || label;
		let tier = null;

		if (/^(higher|foundation)$/i.test(label)) {
			tier = label[0].toUpperCase() + label.slice(1).toLowerCase();
		} else if (label && label !== 'View papers') {
			subject = label;
		}

		pages.push({
			id: `${boardId}-${subjectMatch[1]}`,
			boardId,
			boardName: BOARD_NAMES[boardId],
			category,
			subject,
			subjectSlug: subjectMatch[1],
			tier,
			sourcePageUrl: absoluteUrl(href)
		});
	}

	return [...new Map(pages.map((page) => [page.sourcePageUrl, page])).values()];
}

function documentType(label) {
	const normalized = label.toLowerCase();
	if (normalized.includes('question')) return 'questionPaper';
	if (normalized.includes('mark')) return 'markScheme';
	if (normalized.includes('insert')) return 'insert';
	return 'other';
}

async function parseSubjectPage(page) {
	const html = await fetchText(page.sourcePageUrl);
	const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);
	const descriptionMatch = html.match(/<meta name="description" content="([^"]*)"/);
	const entries = [];
	let year = '';
	let series = '';

	const tokenPattern = /<(h2|h3)\b[^>]*>([\s\S]*?)<\/\1>|<table\b[^>]*>([\s\S]*?)<\/table>/gi;
	let match;

	while ((match = tokenPattern.exec(html))) {
		if (match[1] === 'h2') {
			const heading = textContent(match[2]);
			if (/^\d{4}$/.test(heading)) year = heading;
			continue;
		}

		if (match[1] === 'h3') {
			const heading = textContent(match[2]);
			if (heading && !/subjects|papers|gcse/i.test(heading)) series = heading;
			continue;
		}

		const table = match[3];
		const headers = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((header) =>
			textContent(header[1])
		);
		const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];

		for (const row of rows) {
			if (/<th\b/i.test(row[1])) continue;
			const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
			if (cells.length < 2) continue;

			const paper = textContent(cells[0]);
			const documents = [];

			for (let index = 1; index < cells.length; index += 1) {
				const label = headers[index] || `Document ${index}`;
				const links = [...cells[index].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
				for (const link of links) {
					const href = attrValue(link[1], 'href');
					if (!href) continue;
					const fixed = fixDocumentUrl(absoluteUrl(href));
					documents.push({
						type: documentType(label),
						label,
						url: fixed.url
					});
				}
			}

			if (!year || !series || !paper || documents.length === 0) continue;

			entries.push({
				id: slugify([page.boardId, page.subjectSlug, year, series, paper].join(' ')),
				boardId: page.boardId,
				boardName: page.boardName,
				subject: page.subject,
				subjectSlug: page.subjectSlug,
				tier: page.tier,
				category: page.category,
				year: Number(year),
				series,
				paper,
				documents
			});
		}
	}

	const publicPage = { ...page };
	delete publicPage.sourcePageUrl;
	return {
		...publicPage,
		title: textContent(titleMatch?.[1] ?? `${page.boardName} GCSE ${page.subject}`).replace(
			/ \| .*$/,
			''
		),
		description: decodeHtml(descriptionMatch?.[1] ?? ''),
		entries
	};
}

async function mapWithConcurrency(items, concurrency, mapper) {
	const results = new Array(items.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await mapper(items[index], index);
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
	return results;
}

async function verifyUrl(url) {
	try {
		let response = await fetch(url, { method: 'HEAD' });
		if (response.status === 405 || response.status === 403) {
			response = await fetch(url, { headers: { Range: 'bytes=0-0' } });
		}

		const contentType = response.headers.get('content-type') ?? '';
		return {
			url,
			status: response.status,
			contentType,
			ok: response.ok && contentType.toLowerCase().includes('pdf')
		};
	} catch (error) {
		return {
			url,
			status: 0,
			contentType: '',
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

function summarize(pages, verificationResults) {
	const entries = pages.flatMap((page) => page.entries);
	const documents = entries.flatMap((entry) => entry.documents);
	const brokenUrls = verificationResults.filter((result) => !result.ok);
	const statusCounts = verificationResults.reduce((counts, result) => {
		const key = String(result.status);
		counts[key] = (counts[key] ?? 0) + 1;
		return counts;
	}, {});

	return {
		boardCount: BOARD_IDS.length,
		subjectPageCount: pages.length,
		entryCount: entries.length,
		documentCellCount: documents.length,
		uniqueDocumentUrlCount: new Set(documents.map((document) => document.url)).size,
		verification: {
			skipped: skipVerify,
			checkedUrlCount: verificationResults.length,
			okUrlCount: verificationResults.filter((result) => result.ok).length,
			statusCounts,
			brokenUrls
		},
		urlFixes: Object.values(URL_FIXES).map((fix) => ({
			url: fix.url,
			note: fix.note
		})),
		boards: BOARD_IDS.map((boardId) => {
			const boardPages = pages.filter((page) => page.boardId === boardId);
			const boardEntries = boardPages.flatMap((page) => page.entries);
			return {
				id: boardId,
				name: BOARD_NAMES[boardId],
				subjectPageCount: boardPages.length,
				entryCount: boardEntries.length,
				documentCellCount: boardEntries.flatMap((entry) => entry.documents).length
			};
		})
	};
}

async function main() {
	const subjectPages = [];
	for (const boardId of BOARD_IDS) {
		subjectPages.push(...(await parseBoardPage(boardId)));
	}

	const pages = await mapWithConcurrency(subjectPages, 8, (page) => parseSubjectPage(page));
	const documentUrls = [
		...new Set(
			pages
				.flatMap((page) => page.entries.flatMap((entry) => entry.documents))
				.map((doc) => doc.url)
		)
	].sort();
	const verificationResults = skipVerify
		? []
		: await mapWithConcurrency(documentUrls, 24, (url) => verifyUrl(url));
	const summary = summarize(pages, verificationResults);

	if (!skipVerify && summary.verification.brokenUrls.length > 0 && !allowBroken) {
		await mkdir(path.dirname(SUMMARY_PATH), { recursive: true });
		await writeFile(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
		throw new Error(
			`Verification failed for ${summary.verification.brokenUrls.length} URLs. See ${SUMMARY_PATH}.`
		);
	}

	const data = {
		summary,
		pages
	};

	await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
	await mkdir(path.dirname(SUMMARY_PATH), { recursive: true });
	await writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`);
	await writeFile(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);

	console.log(
		[
			`Wrote ${OUTPUT_PATH}`,
			`Subject pages: ${summary.subjectPageCount}`,
			`Paper rows: ${summary.entryCount}`,
			`Document cells: ${summary.documentCellCount}`,
			`Unique document URLs: ${summary.uniqueDocumentUrlCount}`,
			`Verified URLs: ${summary.verification.okUrlCount}/${summary.verification.checkedUrlCount}`
		].join('\n')
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
