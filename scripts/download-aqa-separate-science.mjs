#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outputRoot = path.join(rootDir, stringArg('output-root', 'data/aqa-separate-science-higher'));
const force = hasArg('force');
const dryRun = hasArg('dry-run');
const includeInserts = !hasArg('no-inserts');

const specs = [
	{
		specCode: '8461',
		subject: 'Biology',
		subjectArea: 'Biology',
		pageUrl: 'https://www.aqa.org.uk/subjects/biology/gcse/biology-8461/assessment-resources'
	},
	{
		specCode: '8462',
		subject: 'Chemistry',
		subjectArea: 'Chemistry',
		pageUrl: 'https://www.aqa.org.uk/subjects/chemistry/gcse/chemistry-8462/assessment-resources'
	},
	{
		specCode: '8463',
		subject: 'Physics',
		subjectArea: 'Physics',
		pageUrl: 'https://www.aqa.org.uk/subjects/physics/gcse/physics-8463/assessment-resources'
	}
];

const resourcesBySpec = [];
for (const spec of specs) {
	const html = await fetchText(spec.pageUrl);
	const resources = parseAqaResources(html)
		.map((resource) => normalizeResource(spec, resource))
		.filter(Boolean)
		.sort(compareResource);
	resourcesBySpec.push({ spec, resources });
}

const rows = resourcesBySpec.flatMap(({ spec, resources }) => pairedRows(spec, resources));
if (rows.length === 0) throw new Error('No AQA Separate Science Higher paper pairs were found.');

const files = [];
for (const row of rows) {
	files.push({
		resource: row.question_paper,
		dir: path.join(outputRoot, 'question-papers')
	});
	files.push({
		resource: row.mark_scheme,
		dir: path.join(outputRoot, 'mark-schemes')
	});
	for (const supportingDocument of row.supporting_documents ?? []) {
		files.push({
			resource: supportingDocument,
			dir: path.join(outputRoot, 'supporting-documents')
		});
	}
}

if (!dryRun) {
	mkdirSync(path.join(outputRoot, 'question-papers'), { recursive: true });
	mkdirSync(path.join(outputRoot, 'mark-schemes'), { recursive: true });
	mkdirSync(path.join(outputRoot, 'supporting-documents'), { recursive: true });
	for (const { resource, dir } of files) {
		await downloadResource(resource, dir);
	}
	writeManifest(rows);
}

console.log(
	JSON.stringify(
		{
			output_root: path.relative(rootDir, outputRoot),
			scope:
				'AQA GCSE Separate Science Higher standard question papers and mark schemes' +
				(includeInserts ? ', with standard inserts where present' : ''),
			source_pages: specs.map((spec) => spec.pageUrl),
			rows: rows.length,
			question_papers: rows.length,
			mark_schemes: rows.length,
			supporting_documents: rows.reduce(
				(sum, row) => sum + (row.supporting_documents?.length ?? 0),
				0
			),
			dry_run: dryRun
		},
		null,
		2
	)
);

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

async function fetchText(url) {
	const response = await fetch(url, {
		headers: { Accept: 'text/html,application/xhtml+xml' }
	});
	if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
	return response.text();
}

function parseAqaResources(html) {
	const text = html.replace(/\\"/g, '"').replace(/\\u0026/g, '&');
	const resources = [];
	const filenamePattern = /"originalFilename":"(AQA-[A-Z0-9-]+\.PDF)"/g;
	let match;
	while ((match = filenamePattern.exec(text))) {
		const start = text.lastIndexOf('{"_id":"sample-papers-and-mark-schemes', match.index);
		if (start < 0) continue;
		const window = text.slice(start, match.index + 2600);
		const resourceId = matchString(window, /"_id":"([^"]+)"/);
		const url = matchString(window, /"url":"(https:\/\/[^"]+\.pdf)"/i);
		const title = matchString(window, /"title":"([^"]+)"/);
		if (!resourceId || !url || !title) continue;
		resources.push({
			resourceId,
			filename: match[1],
			title,
			url,
			sha1hash: matchString(window, /"sha1hash":"([^"]+)"/),
			size: Number(matchString(window, /"size":(\d+)/) ?? 0) || null,
			publicationDate: matchString(window, /"publicationDate":"([^"]+)"/)
		});
	}
	return uniqueBy(resources, (resource) => resource.resourceId);
}

function matchString(text, pattern) {
	return pattern.exec(text)?.[1] ?? null;
}

function uniqueBy(items, keyFor) {
	const byKey = new Map();
	for (const item of items) byKey.set(keyFor(item), item);
	return [...byKey.values()];
}

function normalizeResource(spec, resource) {
	const match = resource.filename.match(
		new RegExp(`^AQA-${spec.specCode}([12]H)-(QP|W-MS|MS|INS)-([A-Z]{3}\\d{2})(?:-CR)?\\.PDF$`)
	);
	if (!match) return null;
	const component = `${spec.specCode}${match[1]}`;
	const documentType =
		match[2] === 'QP' ? 'question_paper' : match[2].endsWith('MS') ? 'mark_scheme' : 'insert';
	if (documentType === 'insert' && !includeInserts) return null;
	const { series, year } = parseSeries(match[3]);
	return {
		...resource,
		specCode: spec.specCode,
		subject: spec.subject,
		subjectArea: spec.subjectArea,
		component,
		paper: match[1].startsWith('1') ? `${spec.subject} Paper 1` : `${spec.subject} Paper 2`,
		documentKind: match[2],
		documentType,
		seriesCode: match[3],
		series,
		year
	};
}

function parseSeries(seriesCode) {
	const monthCode = seriesCode.slice(0, 3).toUpperCase();
	const year = 2000 + Number(seriesCode.slice(3));
	const month = monthCode === 'JUN' ? 'June' : monthCode === 'NOV' ? 'November' : monthCode;
	return { month, year, series: `${month} ${year}` };
}

function compareResource(left, right) {
	return (
		left.subject.localeCompare(right.subject) ||
		left.year - right.year ||
		left.seriesCode.localeCompare(right.seriesCode) ||
		left.component.localeCompare(right.component) ||
		left.documentKind.localeCompare(right.documentKind)
	);
}

function pairedRows(spec, resources) {
	const groups = new Map();
	for (const resource of resources) {
		const key = `${resource.component}:${resource.seriesCode}`;
		const group = groups.get(key) ?? [];
		group.push(resource);
		groups.set(key, group);
	}
	const rows = [];
	for (const group of groups.values()) {
		const questionPaper = group.find((resource) => resource.documentKind === 'QP');
		const markScheme =
			group.find((resource) => resource.documentKind === 'MS') ??
			group.find((resource) => resource.documentKind === 'W-MS');
		if (!questionPaper || !markScheme) continue;
		rows.push({
			series_code: questionPaper.seriesCode,
			series: questionPaper.series,
			year: questionPaper.year,
			board: 'AQA',
			qualification: 'GCSE',
			subject: spec.subject,
			subject_area: spec.subjectArea,
			tier: 'Higher',
			paper: questionPaper.paper,
			component: questionPaper.component,
			source_document_id: `aqa-${questionPaper.component.toLowerCase()}-qp-${questionPaper.seriesCode.toLowerCase()}`,
			mark_scheme_document_id: `aqa-${questionPaper.component.toLowerCase()}-ms-${questionPaper.seriesCode.toLowerCase()}`,
			question_paper: manifestResource(questionPaper),
			mark_scheme: manifestResource(markScheme),
			supporting_documents: group
				.filter((resource) => resource.documentKind === 'INS')
				.map((resource) => manifestResource(resource))
		});
	}
	return rows.sort(
		(left, right) =>
			left.subject.localeCompare(right.subject) ||
			left.year - right.year ||
			left.series_code.localeCompare(right.series_code) ||
			left.component.localeCompare(right.component)
	);
}

function manifestResource(resource) {
	return {
		filename: resource.filename,
		aqa_original_filename: resource.filename,
		title: resource.title,
		url: resource.url,
		resource_id: resource.resourceId,
		sha1hash: resource.sha1hash,
		size: resource.size,
		publication_date: resource.publicationDate
	};
}

async function downloadResource(resource, dir) {
	const filePath = path.join(dir, resource.filename);
	if (!force && existsSync(filePath)) {
		verifyDownloadedFile(filePath, resource);
		console.log(`exists ${path.relative(rootDir, filePath)}`);
		return;
	}
	const response = await fetch(resource.url);
	if (!response.ok) {
		throw new Error(`Failed to download ${resource.filename}: ${response.status} ${resource.url}`);
	}
	const bytes = Buffer.from(await response.arrayBuffer());
	if (!bytes.subarray(0, 4).equals(Buffer.from('%PDF'))) {
		throw new Error(`${resource.filename} did not download as a PDF.`);
	}
	if (resource.sha1hash) {
		const digest = createHash('sha1').update(bytes).digest('hex');
		if (digest !== resource.sha1hash) {
			throw new Error(
				`${resource.filename} sha1 mismatch: expected ${resource.sha1hash}, got ${digest}`
			);
		}
	}
	if (resource.size && bytes.length !== resource.size) {
		throw new Error(
			`${resource.filename} size mismatch: expected ${resource.size}, got ${bytes.length}`
		);
	}
	writeFileSync(filePath, bytes);
	console.log(`downloaded ${path.relative(rootDir, filePath)}`);
}

function verifyDownloadedFile(filePath, resource) {
	const bytes = readFileSync(filePath);
	if (!bytes.subarray(0, 4).equals(Buffer.from('%PDF'))) {
		throw new Error(`${path.relative(rootDir, filePath)} is not a PDF.`);
	}
	if (resource.sha1hash) {
		const digest = createHash('sha1').update(bytes).digest('hex');
		if (digest !== resource.sha1hash) {
			throw new Error(
				`${path.relative(rootDir, filePath)} sha1 mismatch: expected ${resource.sha1hash}, got ${digest}`
			);
		}
	}
}

function writeManifest(manifestRows) {
	const manifest = {
		source_pages: specs.map((spec) => spec.pageUrl),
		checked_at: new Date().toISOString(),
		qualification: 'GCSE',
		board: 'AQA',
		subject: 'Separate Science',
		tier: 'Higher',
		scope:
			'Standard Higher question papers and mark schemes for AQA GCSE Biology 8461, Chemistry 8462, and Physics 8463; modified-print variants and examiner reports are excluded. Standard inserts are included as supporting documents when present.',
		local_directories: {
			question_papers: path.relative(rootDir, path.join(outputRoot, 'question-papers')),
			mark_schemes: path.relative(rootDir, path.join(outputRoot, 'mark-schemes')),
			supporting_documents: path.relative(rootDir, path.join(outputRoot, 'supporting-documents')),
			extractions: 'data/vision-extracted/aqa-separate-science-higher'
		},
		counts: {
			rows: manifestRows.length,
			question_papers: manifestRows.length,
			mark_schemes: manifestRows.length,
			supporting_documents: manifestRows.reduce(
				(sum, row) => sum + (row.supporting_documents?.length ?? 0),
				0
			)
		},
		rows: manifestRows
	};
	writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
