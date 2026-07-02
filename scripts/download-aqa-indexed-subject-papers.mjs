#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const usage = `Usage:
node scripts/download-aqa-indexed-subject-papers.mjs \\
  --computer-science-index-url=<url> \\
  --geography-index-url=<url> \\
  --history-index-url=<url>

Options:
  --subjects=computer-science,geography,history
  --output-root=data/aqa-gcse-history-geography-computer-science
  --concurrency=8
  --force
  --dry-run`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const subjectArg = stringArg('subjects', 'computer-science,geography,history');
const selectedSubjectSlugs = new Set(
	subjectArg
		.split(',')
		.map((value) => value.trim().toLowerCase())
		.filter(Boolean)
);
const outputRoot = path.resolve(
	rootDir,
	stringArg('output-root', 'data/aqa-gcse-history-geography-computer-science')
);
const sourcePageDir = path.join(outputRoot, 'source-pages');
const force = hasArg('force');
const dryRun = hasArg('dry-run');
const concurrency = integerArg('concurrency', 8, 1);

const specs = [
	{
		subjectSlug: 'computer-science',
		subject: 'Computer Science',
		specCode: '8525',
		indexUrl: sourceIndexUrl('computer-science', 'AQA_COMPUTER_SCIENCE_INDEX_URL'),
		aqaReportUrl:
			'https://www.aqa.org.uk/subjects/computer-science/gcse/computer-science-8525/assessment-resources?f.Resource+type|6=Examiner+reports&num_ranks=100&sort=date'
	},
	{
		subjectSlug: 'geography',
		subject: 'Geography',
		specCode: '8035',
		indexUrl: sourceIndexUrl('geography', 'AQA_GEOGRAPHY_INDEX_URL'),
		aqaReportUrl:
			'https://www.aqa.org.uk/subjects/geography/gcse/geography-8035/assessment-resources?f.Resource+type|6=Examiner+reports&num_ranks=100&sort=date'
	},
	{
		subjectSlug: 'history',
		subject: 'History',
		specCode: '8145',
		indexUrl: sourceIndexUrl('history', 'AQA_HISTORY_INDEX_URL'),
		aqaReportUrl:
			'https://www.aqa.org.uk/subjects/history/gcse/history-8145/assessment-resources?f.Resource+type|6=Examiner+reports&num_ranks=200&sort=date'
	}
].filter((spec) => selectedSubjectSlugs.has(spec.subjectSlug));

const supplementalGeographyPaper3PreReleaseByYear = new Map([
	[
		2020,
		{
			url: 'https://pmt.physicsandmathstutor.com/download/Geography/GCSE/Past-Papers/AQA/Paper-3/PM/June%202020%20PM.PDF',
			sourcePageUrl: 'https://www.physicsandmathstutor.com/past-papers/gcse-geography/aqa-paper-3/',
			discoveredVia: 'pmt_aqa_geography_paper_3_preliminary_material_index'
		}
	],
	[
		2021,
		{
			url: 'https://pmt.physicsandmathstutor.com/download/Geography/GCSE/Past-Papers/AQA/Paper-3/PM/June%202021%20PM.PDF',
			sourcePageUrl: 'https://www.physicsandmathstutor.com/past-papers/gcse-geography/aqa-paper-3/',
			discoveredVia: 'pmt_aqa_geography_paper_3_preliminary_material_index'
		}
	],
	[
		2022,
		{
			url: 'https://pmt.physicsandmathstutor.com/download/Geography/GCSE/Past-Papers/AQA/Paper-3/PM/June%202022%20PM.PDF',
			sourcePageUrl: 'https://www.physicsandmathstutor.com/past-papers/gcse-geography/aqa-paper-3/',
			discoveredVia: 'pmt_aqa_geography_paper_3_preliminary_material_index'
		}
	],
	[
		2023,
		{
			url: 'https://pmt.physicsandmathstutor.com/download/Geography/GCSE/Past-Papers/AQA/Paper-3/PM/June%202023%20PM.pdf',
			sourcePageUrl: 'https://www.physicsandmathstutor.com/past-papers/gcse-geography/aqa-paper-3/',
			discoveredVia: 'pmt_aqa_geography_paper_3_preliminary_material_index'
		}
	],
	[
		2024,
		{
			url: 'https://www.plympton.academy/site-plympton/assets/files/3998/2024_pre-release_booklet.pdf',
			sourcePageUrl:
				'https://www.plympton.academy/site-plympton/assets/files/3998/2024_pre-release_booklet.pdf',
			discoveredVia: 'supplemental_public_aqa_geography_pre_release_pdf_pointer'
		}
	]
]);

if (specs.length === 0) {
	throw new Error(
		`No subjects selected. Supported subjects: computer-science, geography, history.`
	);
}

const rows = [];
const sourcePages = {};
for (const spec of specs) {
	const indexHtml = await fetchText(spec.indexUrl);
	const aqaReportHtml = await fetchText(spec.aqaReportUrl);
	sourcePages[spec.subjectSlug] = {
		discovery_index: spec.indexUrl,
		aqa_examiner_reports: spec.aqaReportUrl
	};
	if (!dryRun) {
		mkdirSync(sourcePageDir, { recursive: true });
		writeFileSync(path.join(sourcePageDir, `${spec.subjectSlug}-discovery-index.html`), indexHtml);
		writeFileSync(
			path.join(sourcePageDir, `${spec.subjectSlug}-aqa-examiner-reports.html`),
			aqaReportHtml
		);
	}

	const indexRows = parseDiscoveryRows(spec, indexHtml);
	const aqaResources = parseAqaAssessmentResources(spec, aqaReportHtml);
	const reportResources = aqaResources.filter(
		(resource) => resource.document_type === 'examiner_report'
	);
	rows.push(...buildManifestRows(spec, indexRows, aqaResources, reportResources));
}

if (rows.length === 0) throw new Error('No importable papers were found.');

const allDocuments = rows.flatMap((row) => [
	row.question_paper,
	row.mark_scheme,
	...(row.supporting_documents ?? [])
]);
const uniqueDocuments = uniqueBy(allDocuments, documentKey);

const downloadPlan = uniqueDocuments.map((document) => ({
	document,
	dir: directoryForDocument(document)
}));

const downloadedMetadata = new Map();
if (!dryRun) {
	for (const subdir of [
		'question-papers',
		'mark-schemes',
		'supporting-documents',
		'examiner-reports'
	]) {
		mkdirSync(path.join(outputRoot, subdir), { recursive: true });
	}
	await mapWithConcurrency(downloadPlan, concurrency, async ({ document, dir }) => {
		const metadata = await downloadDocument(document, dir);
		downloadedMetadata.set(documentKey(document), metadata);
	});
	for (const document of allDocuments) {
		Object.assign(document, downloadedMetadata.get(documentKey(document)) ?? {});
	}
	writeManifest(rows, sourcePages);
}

const summary = {
	status: dryRun ? 'dry-run' : 'passed',
	output_root: relative(outputRoot),
	subjects: specs.map((spec) => spec.subject),
	rows: rows.length,
	question_papers: rows.length,
	mark_schemes: rows.length,
	supporting_documents: rows.reduce((sum, row) => sum + (row.supporting_documents?.length ?? 0), 0),
	examiner_reports: allDocuments.filter((document) => document.document_type === 'examiner_report')
		.length,
	unique_pdfs: uniqueDocuments.length,
	concurrency,
	manifest: relative(path.join(outputRoot, 'manifest.json'))
};
console.log(JSON.stringify(summary, null, 2));

function parseDiscoveryRows(spec, html) {
	const rows = [];
	const yearMatches = [...html.matchAll(/<h2\b[^>]*>\s*(\d{4})\s*<\/h2>/gi)];
	for (const [yearIndex, yearMatch] of yearMatches.entries()) {
		const year = Number(yearMatch[1]);
		const yearStart = yearMatch.index ?? 0;
		const yearEnd =
			yearMatches[yearIndex + 1]?.index ?? html.indexOf('</main>', yearStart) ?? html.length;
		const yearHtml = html.slice(yearStart, yearEnd);
		const sessionMatches = [...yearHtml.matchAll(/<h3\b[^>]*>\s*([^<]+?)\s*<\/h3>/gi)];
		for (const [sessionIndex, sessionMatch] of sessionMatches.entries()) {
			const session = decodeHtml(sessionMatch[1]).trim();
			const sessionStart = sessionMatch.index ?? 0;
			const sessionEnd = sessionMatches[sessionIndex + 1]?.index ?? yearHtml.length;
			const sessionHtml = yearHtml.slice(sessionStart, sessionEnd);
			rows.push(...parseDiscoveryTableRows(spec, { year, session }, sessionHtml));
		}
	}
	return uniqueBy(rows, (row) => row.rowKey);
}

function parseDiscoveryTableRows(spec, series, html) {
	const rows = [];
	for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
		const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
			(match) => match[1]
		);
		if (cells.length < 3) continue;
		const paperTitle = stripTags(cells[0]);
		if (!paperTitle || paperTitle === 'Paper') continue;
		const hasInsertColumn = cells.length >= 4;
		const questionPaperUrl = pdfUrlFromCell(cells[1]);
		const insertUrl = hasInsertColumn ? pdfUrlFromCell(cells[2]) : null;
		const markSchemeUrl = pdfUrlFromCell(hasInsertColumn ? cells[3] : cells[2]);
		const rowKind = questionPaperUrl ? 'paper' : 'supporting';
		const rowKey = slugify(`${spec.subjectSlug}-${series.year}-${series.session}-${paperTitle}`);
		rows.push({
			subjectSlug: spec.subjectSlug,
			subject: spec.subject,
			board: 'AQA',
			qualification: 'GCSE',
			year: series.year,
			session: series.session,
			series: `${series.session} ${series.year}`,
			seriesCode: seriesCode(series.session, series.year),
			paperTitle,
			component: componentFor(spec.subjectSlug, paperTitle, series.year),
			rowKind,
			pageUrl: spec.indexUrl,
			questionPaperUrl,
			insertUrl,
			markSchemeUrl: supplementedMarkSchemeUrl(spec.subjectSlug, series, paperTitle, markSchemeUrl),
			rowKey
		});
	}
	return rows;
}

function buildManifestRows(spec, indexRows, aqaResources, reportResources) {
	const paperRows = indexRows.filter((row) => row.rowKind === 'paper' && row.questionPaperUrl);
	const supportRows = indexRows.filter((row) => row.rowKind === 'supporting' && row.insertUrl);
	const manifestRows = [];
	for (const row of paperRows) {
		const aqaQuestionPaper = aqaDocumentFor(row, aqaResources, 'question_paper');
		const aqaMarkScheme = aqaDocumentFor(row, aqaResources, 'mark_scheme');
		if (!row.markSchemeUrl && !aqaMarkScheme) continue;
		const sourceDocumentId = `aqa-${row.rowKey}-qp`;
		const markSchemeDocumentId = `aqa-${row.rowKey}-ms`;
		const questionPaper =
			aqaQuestionPaper ??
			indexDocument(row, {
				documentType: 'question_paper',
				filename: safeFilename(`${row.rowKey}-question-paper`, 'QP'),
				title: `Question paper: ${row.paperTitle} - ${row.series}`,
				url: row.questionPaperUrl
			});
		const markScheme =
			aqaMarkScheme ??
			indexDocument(row, {
				documentType: 'mark_scheme',
				filename: markSchemeFilename(row),
				title: `Mark scheme: ${row.paperTitle} - ${row.series}`,
				url: row.markSchemeUrl
			});
		const supportingDocuments = supportingDocumentsFor(row, supportRows, reportResources);
		manifestRows.push({
			series_code: row.seriesCode,
			series: row.series,
			year: row.year,
			board: row.board,
			qualification: row.qualification,
			subject: row.subject,
			subject_area: row.subject,
			tier: '',
			paper: row.paperTitle,
			component: row.component,
			source_document_id: sourceDocumentId,
			mark_scheme_document_id: markSchemeDocumentId,
			question_paper: questionPaper,
			mark_scheme: markScheme,
			supporting_documents: supportingDocuments,
			examiner_reports: supportingDocuments.filter(
				(document) => document.document_type === 'examiner_report'
			)
		});
	}
	return manifestRows.sort(compareRows);
}

function indexDocument(row, { documentType, filename, title, url }) {
	return {
		document_type: documentType,
		filename,
		title,
		url,
		source_page_url: row.pageUrl,
		discovered_via: 'gcse_past_papers_index',
		source_role: 'discovery_index_pdf_pointer',
		board: row.board,
		qualification: row.qualification,
		subject: row.subject,
		series: row.series,
		year: row.year,
		component: row.component,
		local_path: relative(path.join(directoryForDocument({ document_type: documentType }), filename))
	};
}

function aqaDocumentFor(row, resources, documentType) {
	const candidates = resources
		.filter((resource) => resource.document_type === documentType)
		.filter((resource) => resource.year === row.year && resource.session === row.session)
		.filter((resource) => componentMatches(row.component, resource.component))
		.sort(compareAqaResourceCandidates);
	const resource = candidates[0];
	if (!resource) return null;
	return {
		document_type: documentType,
		filename: resource.filename,
		aqa_original_filename: resource.filename,
		title: resource.title,
		url: resource.url,
		source_page_url: resource.source_page_url,
		discovered_via: 'aqa_assessment_resources',
		source_role: 'official_aqa_assessment_resource',
		board: 'AQA',
		qualification: 'GCSE',
		subject: row.subject,
		series: row.series,
		year: row.year,
		component: resource.component,
		resource_id: resource.resource_id,
		sha1hash: resource.sha1hash,
		size: resource.size,
		publication_date: resource.publication_date,
		local_path: relative(
			path.join(directoryForDocument({ document_type: documentType }), resource.filename)
		)
	};
}

function supportingDocumentsFor(row, supportRows, reportResources) {
	const documents = [];
	if (row.insertUrl) {
		documents.push(
			indexDocument(row, {
				documentType: 'insert',
				filename: safeFilename(`${row.rowKey}-insert`, 'INS'),
				title: `Insert: ${row.paperTitle} - ${row.series}`,
				url: row.insertUrl
			})
		);
	}
	for (const supportRow of supportRows) {
		if (supportRow.year !== row.year || supportRow.session !== row.session) continue;
		if (!supportMatchesPaper(supportRow.paperTitle, row.paperTitle)) continue;
		documents.push(
			indexDocument(row, {
				documentType: supportRow.paperTitle.toLowerCase().includes('preliminary')
					? 'other'
					: 'insert',
				filename: safeFilename(`${supportRow.rowKey}-support`, 'SUPPORT'),
				title: `${supportRow.paperTitle} - ${supportRow.series}`,
				url: supportRow.insertUrl
			})
		);
	}
	for (const document of supplementalSupportingDocumentsFor(row, documents)) {
		documents.push(document);
	}
	for (const report of reportResources) {
		if (reportMatchesPaper(report, row)) documents.push(reportDocument(report, row));
	}
	return uniqueBy(documents, (document) => document.url).sort((left, right) =>
		left.title.localeCompare(right.title)
	);
}

function supplementalSupportingDocumentsFor(row, existingDocuments) {
	if (row.subjectSlug !== 'geography' || row.component !== '80353') return [];
	if (hasPreReleaseDocument(existingDocuments)) return [];
	const source = supplementalGeographyPaper3PreReleaseByYear.get(row.year);
	if (!source) return [];
	const filename = safeFilename(
		`geography-${row.year}-${row.session}-paper-3-pre-release-resources-booklet`,
		'PM'
	);
	return [
		{
			document_type: 'pre_release',
			filename,
			title: `Pre-release resources booklet: Paper 3 Geographical applications - ${row.series}`,
			url: source.url,
			source_page_url: source.sourcePageUrl,
			discovered_via: source.discoveredVia,
			source_role: 'discovery_index_pdf_pointer',
			board: row.board,
			qualification: row.qualification,
			subject: row.subject,
			series: row.series,
			year: row.year,
			component: row.component,
			local_path: relative(path.join(directoryForDocument({ document_type: 'pre_release' }), filename))
		}
	];
}

function hasPreReleaseDocument(documents) {
	return documents.some((document) =>
		[
			document.document_type,
			document.filename,
			document.title,
			document.url,
			document.discovered_via
		]
			.filter(Boolean)
			.some((value) => /\b(?:pre[- ]?release|preliminary|resources booklet)\b/i.test(value))
	);
}

function reportDocument(report, row) {
	return {
		document_type: 'examiner_report',
		filename: report.filename,
		title: report.title,
		url: report.url,
		source_page_url: report.source_page_url,
		discovered_via: 'aqa_assessment_resources_examiner_reports',
		source_role: 'official_aqa_assessment_resource',
		board: 'AQA',
		qualification: 'GCSE',
		subject: row.subject,
		series: row.series,
		year: row.year,
		component: report.component,
		resource_id: report.resource_id,
		sha1hash: report.sha1hash,
		size: report.size,
		publication_date: report.publication_date,
		local_path: relative(path.join(outputRoot, 'examiner-reports', report.filename))
	};
}

function parseAqaAssessmentResources(spec, html) {
	const text = html.replace(/\\"/g, '"').replace(/\\u0026/g, '&');
	const records = [];
	const recordPattern =
		/\{"_id":"sample-papers-and-mark-schemes[\s\S]*?(?=\},\{"_id":"sample-papers-and-mark-schemes|\],"searchPromo"|$)/g;
	let match;
	while ((match = recordPattern.exec(text))) {
		const record = match[0];
		const filename = matchString(record, /"originalFilename":"(AQA-[^"]+\.PDF)"/);
		const title = matchString(record, /"title":"([^"]+)"/);
		const url = matchString(record, /"url":"(https:\/\/[^"]+\.pdf)"/i);
		if (!filename || !title || !url) continue;
		const series = seriesFromFilename(filename) ?? seriesFromTitle(title);
		if (!series) continue;
		const documentType = documentTypeForAqaResource(filename, title);
		if (!documentType) continue;
		records.push({
			resource_id: matchString(record, /"_id":"([^"]+)"/),
			filename,
			title: decodeHtml(title),
			url,
			source_page_url: spec.aqaReportUrl,
			subjectSlug: spec.subjectSlug,
			subject: spec.subject,
			component: componentFromFilename(filename),
			document_type: documentType,
			series: `${series.session} ${series.year}`,
			seriesCode: seriesCode(series.session, series.year),
			session: series.session,
			year: series.year,
			sha1hash: matchString(record, /"sha1hash":"([^"]+)"/),
			size: Number(matchString(record, /"size":(\d+)/) ?? 0) || null,
			publication_date: matchString(record, /"publicationDate":"([^"]+)"/)
		});
	}
	return uniqueBy(records, (record) => record.resource_id ?? record.url);
}

function supportMatchesPaper(supportTitle, paperTitle) {
	const supportPaper = paperNumber(supportTitle);
	const targetPaper = paperNumber(paperTitle);
	if (supportPaper && targetPaper) return supportPaper === targetPaper;
	const supportSection = historySection(supportTitle);
	const targetSection = historySection(paperTitle);
	if (supportSection && targetSection && supportSection !== targetSection) return false;
	const supportOption = historyOption(supportTitle);
	const targetOption = historyOption(paperTitle);
	if (supportOption && targetOption && supportOption !== targetOption) return false;
	const supportTokens = meaningfulTokens(supportTitle);
	const targetTokens = new Set(meaningfulTokens(paperTitle));
	const shared = supportTokens.filter((token) => targetTokens.has(token));
	return shared.length >= 3;
}

function reportMatchesPaper(report, row) {
	if (report.year !== row.year || report.session !== row.session) return false;
	const reportComponent = report.component ?? '';
	const rowComponent = row.component ?? '';
	if (!reportComponent || !rowComponent) return false;
	if (reportComponent === rowComponent) return true;
	if (row.subjectSlug === 'computer-science' && reportComponent === '85251ABC') {
		return rowComponent.startsWith('85251');
	}
	if (row.subjectSlug === 'history') return rowComponent.startsWith(reportComponent);
	return false;
}

function componentMatches(rowComponent, resourceComponent) {
	const rowValue = String(rowComponent ?? '');
	const resourceValue = String(resourceComponent ?? '');
	if (!rowValue || !resourceValue) return false;
	if (rowValue === resourceValue) return true;
	if (rowValue.startsWith(resourceValue)) return true;
	if (resourceValue === '85251ABC' && rowValue.startsWith('85251')) return true;
	return false;
}

function compareAqaResourceCandidates(left, right) {
	return (
		resourcePenalty(left) - resourcePenalty(right) || left.filename.localeCompare(right.filename)
	);
}

function resourcePenalty(resource) {
	const filename = resource.filename.toUpperCase();
	let penalty = 0;
	if (filename.includes('-MQP')) penalty += 20;
	if (filename.includes('-CR.')) penalty += 2;
	if (filename.includes('-INS')) penalty += 100;
	return penalty;
}

function documentTypeForAqaResource(filename, title) {
	const upper = filename.toUpperCase();
	if (/-WRE-/.test(upper) || /Examiner'?s?|Examiners'?/i.test(title)) return 'examiner_report';
	if (/-QP-/.test(upper)) return 'question_paper';
	if (/-W-MS-|-MS-/.test(upper)) return 'mark_scheme';
	if (/-INS/.test(upper)) return 'insert';
	if (/-CM-/.test(upper)) return 'other';
	return null;
}

function componentFor(subjectSlug, paperTitle, year) {
	const title = paperTitle.toLowerCase();
	if (subjectSlug === 'geography') {
		const paper = paperNumber(title);
		return paper ? `8035${paper}` : '';
	}
	if (subjectSlug === 'computer-science') {
		const paper = paperNumber(title);
		if (year <= 2021) return paper === '1' ? '85201' : paper === '2' ? '85202' : '';
		if (paper === '1') {
			const language = /paper\s*1\s*([abc])/i.exec(paperTitle)?.[1]?.toUpperCase() ?? '';
			return `85251${language}`;
		}
		return paper === '2' ? '85252' : '';
	}
	if (subjectSlug === 'history') {
		const paper = paperNumber(title);
		const section = historySection(title);
		const option = historyOption(title);
		return paper && section ? `8145${paper}${section}${option ?? ''}` : '';
	}
	return '';
}

function componentFromFilename(filename) {
	return /^AQA-([A-Z0-9]+)-/.exec(filename)?.[1] ?? '';
}

function supplementedMarkSchemeUrl(subjectSlug, series, paperTitle, currentUrl) {
	if (currentUrl) return currentUrl;
	if (
		subjectSlug === 'geography' &&
		series.year === 2023 &&
		series.session === 'June' &&
		/Paper\s*2\b/i.test(paperTitle)
	) {
		return 'https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2023/june/AQA-80352-MS-JUN23.PDF';
	}
	return null;
}

function markSchemeFilename(row) {
	const basename = path.basename(new URL(row.markSchemeUrl).pathname);
	if (/^AQA-[A-Z0-9-]+\.PDF$/i.test(basename)) return basename.toUpperCase();
	return safeFilename(`${row.rowKey}-mark-scheme`, 'MS');
}

function directoryForDocument(document) {
	if (document.document_type === 'question_paper') return path.join(outputRoot, 'question-papers');
	if (document.document_type === 'mark_scheme') return path.join(outputRoot, 'mark-schemes');
	if (document.document_type === 'examiner_report')
		return path.join(outputRoot, 'examiner-reports');
	return path.join(outputRoot, 'supporting-documents');
}

async function downloadDocument(document, dir) {
	const filePath = path.join(dir, document.filename);
	if (!force && existsSync(filePath)) {
		verifyPdf(filePath, document);
		console.log(`exists ${relative(filePath)}`);
		return localMetadata(filePath, document);
	}
	const response = await fetch(document.url, {
		headers: { accept: 'application/pdf,*/*', 'user-agent': 'question-constellation-import/1.0' }
	});
	if (!response.ok) throw new Error(`Failed to download ${document.url}: ${response.status}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	if (!bytes.subarray(0, 4).equals(Buffer.from('%PDF'))) {
		throw new Error(`${document.url} did not download as a PDF.`);
	}
	if (document.sha1hash) {
		const sha1 = createHash('sha1').update(bytes).digest('hex');
		if (sha1 !== document.sha1hash) {
			throw new Error(
				`${document.filename} sha1 mismatch: expected ${document.sha1hash}, got ${sha1}`
			);
		}
	}
	mkdirSync(dir, { recursive: true });
	writeFileSync(filePath, bytes);
	console.log(`downloaded ${relative(filePath)}`);
	return localMetadata(filePath, document);
}

function verifyPdf(filePath, document) {
	const bytes = readFileSync(filePath);
	if (!bytes.subarray(0, 4).equals(Buffer.from('%PDF'))) {
		throw new Error(`${relative(filePath)} is not a PDF.`);
	}
	if (document.sha1hash) {
		const sha1 = createHash('sha1').update(bytes).digest('hex');
		if (sha1 !== document.sha1hash) {
			throw new Error(
				`${relative(filePath)} sha1 mismatch: expected ${document.sha1hash}, got ${sha1}`
			);
		}
	}
}

function localMetadata(filePath, document) {
	const bytes = readFileSync(filePath);
	return {
		local_path: relative(filePath),
		size_bytes: bytes.length,
		sha256: createHash('sha256').update(bytes).digest('hex'),
		page_count: pdfPageCount(filePath),
		...(document.sha1hash ? { sha1hash: document.sha1hash } : {})
	};
}

function pdfPageCount(filePath) {
	const result = spawnSync('pdfinfo', [filePath], { encoding: 'utf8' });
	if (result.status !== 0) return null;
	const match = /^Pages:\s+(\d+)/m.exec(result.stdout);
	return match ? Number(match[1]) : null;
}

function writeManifest(manifestRows, sourcePagesValue) {
	const manifest = {
		generated_at: new Date().toISOString(),
		scope:
			'AQA GCSE History, Geography, and Computer Science papers discovered from an AQA past-paper index, preferring official AQA assessment-resource records and including mark schemes, inserts/preliminary documents, and AQA examiner reports where public PDFs are available.',
		board: 'AQA',
		qualification: 'GCSE',
		subjects: specs.map((spec) => spec.subject),
		source_pages: sourcePagesValue,
		output_root: relative(outputRoot),
		local_directories: {
			question_papers: relative(path.join(outputRoot, 'question-papers')),
			mark_schemes: relative(path.join(outputRoot, 'mark-schemes')),
			supporting_documents: relative(path.join(outputRoot, 'supporting-documents')),
			examiner_reports: relative(path.join(outputRoot, 'examiner-reports')),
			source_pages: relative(sourcePageDir)
		},
		counts: {
			rows: manifestRows.length,
			question_papers: manifestRows.length,
			mark_schemes: manifestRows.length,
			supporting_documents: manifestRows.reduce(
				(sum, row) => sum + (row.supporting_documents?.length ?? 0),
				0
			),
			examiner_reports: manifestRows.reduce(
				(sum, row) => sum + (row.examiner_reports?.length ?? 0),
				0
			)
		},
		rows: manifestRows
	};
	writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function paperNumber(text) {
	return /paper\s*([123])/i.exec(text)?.[1] ?? null;
}

function historySection(text) {
	return /section\s*([ab])/i.exec(text)?.[1]?.toUpperCase() ?? null;
}

function historyOption(text) {
	return /option\s*([a-e])/i.exec(text)?.[1]?.toUpperCase() ?? null;
}

function meaningfulTokens(text) {
	const stop = new Set([
		'insert',
		'preliminary',
		'material',
		'paper',
		'section',
		'option',
		'with',
		'the',
		'and',
		'for',
		'map',
		'extract',
		'legend',
		'applications',
		'challenges',
		'living',
		'environment'
	]);
	return slugify(text)
		.split('-')
		.filter((token) => token.length > 2 && !stop.has(token));
}

function seriesFromFilename(filename) {
	const match = /-(JUN|NOV)(\d{2})\.PDF$/i.exec(filename);
	if (!match) return null;
	return {
		session: match[1].toUpperCase() === 'JUN' ? 'June' : 'November',
		year: 2000 + Number(match[2])
	};
}

function seriesFromTitle(title) {
	const match = /-\s*(June|November)\s+(\d{4})\s*$/i.exec(title);
	if (!match) return null;
	return { session: titleCase(match[1]), year: Number(match[2]) };
}

function seriesCode(session, year) {
	const month = session.toLowerCase().startsWith('nov') ? 'NOV' : 'JUN';
	return `${month}${String(year).slice(-2)}`;
}

function compareRows(left, right) {
	return (
		left.subject.localeCompare(right.subject) ||
		left.year - right.year ||
		left.series_code.localeCompare(right.series_code) ||
		String(left.component ?? '').localeCompare(String(right.component ?? '')) ||
		left.paper.localeCompare(right.paper)
	);
}

async function fetchText(url) {
	const response = await fetch(url, {
		headers: {
			accept: 'text/html,application/xhtml+xml',
			'user-agent': 'question-constellation-import/1.0'
		}
	});
	if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
	return response.text();
}

function stripTags(html) {
	return decodeHtml(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function pdfUrlFromCell(cellHtml) {
	return /href="([^"]+\.pdf)"/i.exec(cellHtml)?.[1] ?? null;
}

function decodeHtml(value) {
	return String(value)
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/&ndash;/g, '-')
		.replace(/&mdash;/g, '-');
}

function slugify(value) {
	return String(value)
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');
}

function safeFilename(base, suffix) {
	const stem = `${slugify(base)}-${suffix.toLowerCase()}`
		.toUpperCase()
		.slice(0, 176)
		.replace(/-+$/g, '');
	return `${stem}.PDF`;
}

function titleCase(value) {
	return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function matchString(text, pattern) {
	return pattern.exec(text)?.[1] ?? null;
}

function uniqueBy(items, keyFor) {
	const byKey = new Map();
	for (const item of items) byKey.set(keyFor(item), item);
	return [...byKey.values()];
}

async function mapWithConcurrency(values, limit, mapper) {
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
		while (nextIndex < values.length) {
			const index = nextIndex;
			nextIndex += 1;
			await mapper(values[index], index);
		}
	});
	await Promise.all(workers);
}

function documentKey(document) {
	return `${document.document_type}:${document.filename}:${document.url}`;
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function sourceIndexUrl(subjectSlug, envName) {
	const value = stringArg(`${subjectSlug}-index-url`, process.env[envName] ?? '');
	if (!value) {
		throw new Error(`Provide --${subjectSlug}-index-url or set ${envName}.`);
	}
	return value;
}

function integerArg(name, defaultValue, minValue) {
	const raw = stringArg(name, '');
	if (!raw) return defaultValue;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer >= ${minValue}.`);
	}
	return value;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}
