#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';
import { answerChainSpecificityIssues } from './answer-chain-specificity.mjs';

const rootDir = process.cwd();
let localPathBaseDir = rootDir;
const imageOcrTextCache = new Map();
const command = process.argv[2] ?? 'help';
const supportedResponseKinds = new Set([
	'none',
	'lines',
	'labeled-lines',
	'number-line',
	'choice',
	'choice-table',
	'matching',
	'equation-blanks',
	'asset-canvas',
	'image-label-zones',
	'drawing-box'
]);
const fixedResponseKinds = new Set([
	'choice',
	'choice-table',
	'matching',
	'equation-blanks',
	'number-line',
	'image-label-zones',
	'asset-canvas'
]);
const allowedAnswerChainStepRoles = new Set([
	'given',
	'cause',
	'process',
	'link',
	'effect',
	'evidence',
	'method',
	'calculation',
	'conclusion'
]);
const maxCanonicalChainLinks = 5;
const maxCanonicalChainLinkWords = 4;
const maxAnswerChainTitleWords = 5;
const maxAnswerChainStepWords = 5;
const maxAnswerChainStepChars = 48;
const maxAnswerChainSummaryWords = 16;
const maxAnswerChainSummaryChars = 110;
const forbiddenAnswerChainPlaceholderLabels = [
	/\bresource gained\b/i,
	/\bbiological use\b/i,
	/\bproduct (?:one|two|three)\b/i,
	/\bfinal answer\b/i,
	/\bcorrect option\b/i,
	/\banswer is\b/i
];
const computerScience2021Paper2SourceDocumentIds = new Set([
	'aqa-computer-science-2021-june-paper-2-written-assessment-qp',
	'aqa-computer-science-2021-november-paper-2-written-assessment-qp'
]);
const computerScience2021Paper1SourceDocumentIds = new Set([
	'aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp',
	'aqa-computer-science-2021-november-paper-1-computational-thinking-and-problem-solving-qp'
]);

try {
	if (command === 'help' || hasArg('help')) printHelp();
	else if (command === 'pdf-info') pdfInfoCommand();
	else if (command === 'pdftotext-pages') pdfTextPagesCommand();
	else if (command === 'render-pages') renderPagesCommand();
	else if (command === 'extract-embedded-images') extractEmbeddedImagesCommand();
	else if (command === 'contact-sheet') contactSheetCommand();
	else if (command === 'line-count') lineCountCommand();
	else if (command === 'detect-lines-from-pgm') detectLinesFromPgmCommand();
	else if (command === 'assemble-extraction-fragments') assembleExtractionFragmentsCommand();
	else if (command === 'normalize-extraction') normalizeExtractionCommand();
	else if (command === 'validate-extraction') validateExtractionCommand();
	else if (command === 'validate-chain') validateChainCommand();
	else if (command === 'summarize-codex-events') summarizeCodexEventsCommand();
	else throw new Error(`Unknown command: ${command}`);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

function printHelp() {
	console.log(`Usage:
node helper.mjs pdf-info --pdf=question-paper.pdf --output=qp-info.json
node helper.mjs pdftotext-pages --pdf=question-paper.pdf --pages=2-4 --output=qp-pages-2-4.txt
node helper.mjs render-pages --pdf=question-paper.pdf --pages=1-4 --dpi=180 --output-dir=qp-pages
node helper.mjs extract-embedded-images --pdf=question-paper.pdf --output-dir=qp-images --manifest=qp-images.json
node helper.mjs contact-sheet --glob=qp-pages/*.png --output=qp-contact.jpg --thumb=220x310 --columns=4
node helper.mjs line-count --image=qp-pages/page-03.png --crop=170,400,950,1100 --output=q01-lines.json
node helper.mjs detect-lines-from-pgm --pgm=qp-pages/page-03-crop.pgm --output=q01-lines.json
node helper.mjs assemble-extraction-fragments --fragments-dir=question-fragments --output=extraction.json --metadata=metadata.json
node helper.mjs normalize-extraction --input=extraction.json --output=normalized.json --metadata=metadata.json
node helper.mjs validate-extraction --input=normalized.json --expected-marks=100 --output=validation.json
node helper.mjs validate-chain --input=chain-reconciled.json --output=chain-validation.json
node helper.mjs summarize-codex-events --events=events.jsonl --output=codex-run-summary.json`);
	process.exit(0);
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue = '') {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function numberArg(name, defaultValue = null) {
	const raw = stringArg(name, '');
	if (!raw) return defaultValue;
	const value = Number(raw);
	if (!Number.isFinite(value)) throw new Error(`--${name} must be numeric.`);
	return value;
}

function requiredArg(name) {
	const value = stringArg(name, '');
	if (!value) throw new Error(`Pass --${name}=...`);
	return value;
}

function parsePages(value, pageCount = null) {
	if (!value) return [];
	const pages = [];
	for (const part of value.split(',')) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const range = trimmed.match(/^(\d+)-(\d+)$/);
		if (range) {
			const start = Number(range[1]);
			const end = Number(range[2]);
			for (let page = start; page <= end; page += 1) pages.push(page);
			continue;
		}
		pages.push(Number(trimmed));
	}
	const unique = [...new Set(pages)].filter((page) => Number.isInteger(page) && page > 0);
	if (pageCount !== null) return unique.filter((page) => page <= pageCount);
	return unique;
}

function pdfInfoCommand() {
	const pdf = requiredArg('pdf');
	const info = pdfInfo(pdf);
	const pageCount = pdfPageCount(pdf);
	const output = {
		pdf,
		pageCount,
		tool: info.tool,
		raw: info.raw,
		fileHash: `sha256:${fileHash(pdf)}`,
		fileSizeBytes: readFileSync(pdf).length
	};
	writeMaybe(output);
}

function pdfTextPagesCommand() {
	const pdf = requiredArg('pdf');
	const pages = parsePages(stringArg('pages', ''), pdfPageCount(pdf));
	const maxChars = Number(numberArg('max-chars', 80000));
	const text = pdfText(pdf, maxChars, pages);
	const output = stringArg('output', '');
	if (output) {
		mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
		writeFileSync(output, text);
	}
	console.log(
		JSON.stringify(
			{ pdf, pages, output: output || null, chars: text.length, preview: text.slice(0, 1200) },
			null,
			2
		)
	);
}

function renderPagesCommand() {
	const pdf = requiredArg('pdf');
	const pageCount = pdfPageCount(pdf);
	const pages = parsePages(stringArg('pages', ''), pageCount);
	const selectedPages = pages.length
		? pages
		: Array.from({ length: pageCount }, (_, index) => index + 1);
	const dpi = String(numberArg('dpi', 180));
	const outputDir = requiredArg('output-dir');
	const prefix = stringArg('prefix', 'page');
	mkdirSync(outputDir, { recursive: true });
	const files = [];
	for (const page of selectedPages) {
		const outputPrefix = path.join(outputDir, `${prefix}-${String(page).padStart(2, '0')}`);
		execFileSync('pdftoppm', [
			'-png',
			'-r',
			dpi,
			'-f',
			String(page),
			'-l',
			String(page),
			pdf,
			outputPrefix
		]);
		const generated = `${outputPrefix}-1.png`;
		const finalPath = `${outputPrefix}.png`;
		if (existsSync(generated)) {
			rmSync(finalPath, { force: true });
			copyFileSync(generated, finalPath);
			rmSync(generated, { force: true });
		}
		files.push(finalPath);
	}
	const manifest = { pdf, dpi: Number(dpi), pages: selectedPages, files };
	writeMaybe(manifest);
}

function extractEmbeddedImagesCommand() {
	const pdf = requiredArg('pdf');
	const outputDir = requiredArg('output-dir');
	const manifestPath = stringArg('manifest', path.join(outputDir, 'embedded-images.json'));
	mkdirSync(outputDir, { recursive: true });
	const listRaw = execFileSync('pdfimages', ['-list', pdf], { encoding: 'utf8' });
	const prefix = path.join(outputDir, 'embedded');
	spawnSync('pdfimages', ['-png', pdf, prefix], { stdio: 'ignore' });
	const files = readdirSync(outputDir)
		.filter((file) => /\.(?:png|jpg|jpeg|ppm)$/i.test(file))
		.sort()
		.map((file) => path.join(outputDir, file));
	const manifest = { pdf, listRaw, files };
	writeJson(manifestPath, manifest);
	console.log(JSON.stringify({ ...manifest, manifest: manifestPath }, null, 2));
}

function contactSheetCommand() {
	const pattern = requiredArg('glob');
	const output = requiredArg('output');
	const thumb = stringArg('thumb', '220x310');
	const columns = String(numberArg('columns', 4));
	mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
	const result = spawnSync(
		'bash',
		[
			'-lc',
			`montage ${shellQuote(pattern)} -thumbnail ${shellQuote(thumb)} -tile ${shellQuote(columns)}x -geometry +4+4 ${shellQuote(output)}`
		],
		{ encoding: 'utf8' }
	);
	if (result.status !== 0) {
		throw new Error(`montage failed: ${result.stderr || result.stdout}`);
	}
	console.log(JSON.stringify({ pattern, output, thumb, columns: Number(columns) }, null, 2));
}

function lineCountCommand() {
	const image = requiredArg('image');
	const crop = parseCrop(requiredArg('crop'));
	const threshold = Number(numberArg('threshold', 180));
	const minRunRatio = Number(numberArg('min-run-ratio', 0.4));
	const minDarkRatio = Number(numberArg('min-dark-ratio', 0.08));
	const pgm = stringArg('pgm', `${image.replace(/\.[^.]+$/, '')}-crop.pgm`);
	execFileSync('convert', [
		image,
		'-crop',
		`${crop.width}x${crop.height}+${crop.x}+${crop.y}`,
		'-colorspace',
		'Gray',
		'-compress',
		'none',
		pgm
	]);
	const result = detectHorizontalLines(readPgm(pgm), { threshold, minRunRatio, minDarkRatio });
	writeMaybe({ image, crop, pgm, parameters: { threshold, minRunRatio, minDarkRatio }, ...result });
}

function detectLinesFromPgmCommand() {
	const pgm = requiredArg('pgm');
	const threshold = Number(numberArg('threshold', 180));
	const minRunRatio = Number(numberArg('min-run-ratio', 0.4));
	const minDarkRatio = Number(numberArg('min-dark-ratio', 0.08));
	const result = detectHorizontalLines(readPgm(pgm), { threshold, minRunRatio, minDarkRatio });
	writeMaybe({ pgm, parameters: { threshold, minRunRatio, minDarkRatio }, ...result });
}

function assembleExtractionFragmentsCommand() {
	const fragmentsDir = path.resolve(requiredArg('fragments-dir'));
	const output = requiredArg('output');
	const metadataPath = stringArg('metadata', '');
	const metadata = metadataPath && existsSync(metadataPath) ? readJson(metadataPath) : {};
	const files = jsonFilesUnder(fragmentsDir);
	if (files.length === 0) {
		throw new Error(`No JSON fragments found under ${fragmentsDir}`);
	}
	const assembled = {
		sourceDocument: metadata.questionPaper ?? {},
		markSchemeDocument: metadata.markScheme ?? {},
		supportingDocuments: metadata.supportingDocuments ?? [],
		reviewNotes: [],
		localAssetManifest: [],
		questions: []
	};
	const seenRefs = new Map();
	const fragmentSummaries = [];
	for (const filePath of files) {
		const fragment = readJson(filePath);
		const questions = questionsFromFragment(fragment, filePath);
		const reviewNotes = Array.isArray(fragment?.reviewNotes) ? fragment.reviewNotes : [];
		const assets = Array.isArray(fragment?.localAssetManifest)
			? fragment.localAssetManifest
			: Array.isArray(fragment?.assetManifest)
				? fragment.assetManifest
				: [];
		for (const question of questions) {
			const ref = String(question?.sourceQuestionRef ?? '').trim();
			if (!ref) throw new Error(`Question without sourceQuestionRef in ${filePath}`);
			if (seenRefs.has(ref)) {
				throw new Error(
					`Duplicate sourceQuestionRef ${ref} in ${filePath}; first seen in ${seenRefs.get(ref)}`
				);
			}
			seenRefs.set(ref, filePath);
			assembled.questions.push(question);
		}
		assembled.reviewNotes.push(...reviewNotes);
		assembled.localAssetManifest.push(...assets);
		fragmentSummaries.push({
			file: path.relative(rootDir, filePath),
			questions: questions.map((question) => question.sourceQuestionRef)
		});
	}
	assembled.questions.sort((a, b) => displayOrderFor(a) - displayOrderFor(b));
	writeJson(output, assembled);
	console.log(
		JSON.stringify(
			{
				output,
				fragmentCount: files.length,
				questionCount: assembled.questions.length,
				firstRef: assembled.questions[0]?.sourceQuestionRef ?? null,
				lastRef: assembled.questions.at(-1)?.sourceQuestionRef ?? null,
				fragments: fragmentSummaries
			},
			null,
			2
		)
	);
}

function normalizeExtractionCommand() {
	const inputPath = requiredArg('input');
	localPathBaseDir = path.dirname(path.resolve(inputPath));
	const input = readJson(inputPath);
	const metadataPath = stringArg('metadata', '');
	const metadata = metadataPath && existsSync(metadataPath) ? readJson(metadataPath) : {};
	const normalized = normalizeExtraction(input, metadata);
	const output = requiredArg('output');
	writeJson(output, normalized);
	console.log(JSON.stringify(mechanicalSummary(normalized), null, 2));
}

function validateExtractionCommand() {
	const inputPath = requiredArg('input');
	localPathBaseDir = path.dirname(path.resolve(inputPath));
	const candidate = readJson(inputPath);
	const expectedMarks = numberArg('expected-marks', null);
	const expectedQuestions = numberArg('expected-questions', null);
	const summary = mechanicalSummary(candidate, { expectedMarks, expectedQuestions });
	writeMaybe(summary);
	if (summary.blockingIssues.length) process.exit(1);
}

function validateChainCommand() {
	const inputPath = requiredArg('input');
	localPathBaseDir = path.dirname(path.resolve(inputPath));
	const candidate = readJson(inputPath);
	const deterministicIssues = deterministicIssuesFor(candidate, { includeAnswerChainIssues: true });
	const blocking = chainValidationBlockingIssues(deterministicIssues);
	const summary = {
		status: blocking.length ? 'failed' : 'passed',
		sourceDocumentId: candidate.sourceDocument?.id ?? candidate.sourceDocumentId ?? null,
		questionCount: candidate.questions.length,
		blockingIssues: blocking,
		deterministicIssueCount: deterministicIssues.length,
		deterministicIssues
	};
	writeMaybe(summary);
	if (blocking.length) process.exit(1);
}

function summarizeCodexEventsCommand() {
	const eventsPath = requiredArg('events');
	const lines = existsSync(eventsPath)
		? readFileSync(eventsPath, 'utf8').split(/\n/).filter(Boolean)
		: [];
	const events = lines
		.map((line) => {
			try {
				return JSON.parse(line);
			} catch {
				return null;
			}
		})
		.filter(Boolean);
	const commands = events.filter((event) => event.item?.type === 'command_execution');
	const completedCommands = commands.filter((event) => event.type === 'item.completed');
	const failedCommands = completedCommands.filter((event) => event.item?.exit_code !== 0);
	const fileChanges = events
		.filter((event) => event.item?.type === 'file_change' && event.type === 'item.completed')
		.flatMap((event) => event.item.changes ?? []);
	const usage =
		events.filter((event) => event.type === 'turn.completed').slice(-1)[0]?.usage ?? null;
	const summary = {
		events: events.length,
		commandActions: completedCommands.length,
		failedCommandActions: failedCommands.length,
		fileChanges: fileChanges.length,
		usage,
		failedCommands: failedCommands.map((event) => ({
			command: event.item.command,
			exitCode: event.item.exit_code
		}))
	};
	writeMaybe(summary);
}

function jsonFilesUnder(dirPath) {
	return readdirSync(dirPath, { withFileTypes: true })
		.flatMap((entry) => {
			const entryPath = path.join(dirPath, entry.name);
			if (entry.isDirectory()) return jsonFilesUnder(entryPath);
			if (entry.isFile() && entry.name.endsWith('.json')) return [entryPath];
			return [];
		})
		.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

function questionsFromFragment(fragment, filePath) {
	if (Array.isArray(fragment)) return fragment;
	if (Array.isArray(fragment?.questions)) return fragment.questions;
	if (fragment && typeof fragment === 'object' && fragment.sourceQuestionRef) return [fragment];
	throw new Error(
		`Fragment must be a question object, an array of question objects, or an object with questions[]: ${filePath}`
	);
}

function displayOrderFor(question) {
	const explicit = Number(question?.displayOrder);
	if (Number.isFinite(explicit)) return explicit;
	return sortableQuestionRef(question?.sourceQuestionRef);
}

function sortableQuestionRef(ref) {
	const parts = String(ref ?? '').match(/\d+|[A-Za-z]+/g) ?? [];
	let value = 0;
	parts.slice(0, 3).forEach((part, index) => {
		const number = /^\d+$/.test(part)
			? Number(part)
			: part
					.toLowerCase()
					.split('')
					.reduce((sum, char) => sum + char.charCodeAt(0) - 96, 0);
		value += number / 100 ** index;
	});
	return value || Number.MAX_SAFE_INTEGER;
}

function writeMaybe(value) {
	const output = stringArg('output', '');
	if (output) writeJson(output, value);
	console.log(JSON.stringify(value, null, 2));
}

function normalizeExtraction(input, metadata) {
	const sourceDocument = normalizeDocument(input.sourceDocument, metadata.questionPaper, {
		id: metadata.sourceDocumentId,
		docType: 'question_paper',
		title: metadata.questionPaperTitle,
		path: metadata.questionPaperPath
	});
	const markSchemeDocument = normalizeDocument(input.markSchemeDocument, metadata.markScheme, {
		id: metadata.markSchemeDocumentId,
		docType: 'mark_scheme',
		title: metadata.markSchemeTitle,
		path: metadata.markSchemePath
	});
	const questions = (input.questions ?? []).map((question, index) =>
		normalizeQuestion(question, index, sourceDocument)
	);
	const questionsWithSharedTables = propagateStructuredTableBlocks(questions);
	return {
		sourceDocumentId: sourceDocument.id,
		extractionRun: {
			agentVersion: 'codex-pdf-extraction-v1',
			needsHumanReview:
				(input.reviewNotes ?? []).length > 0 ||
				questions.some((question) => question.needsHumanReview),
			reviewNotes: input.reviewNotes ?? [],
			source: 'codex-official-pdf',
			model: metadata.codexModel ?? null,
			extractedAt: new Date().toISOString()
		},
		sourceDocument,
		markSchemeDocument,
		supportingDocuments: (input.supportingDocuments ?? metadata.supportingDocuments ?? []).map(
			(doc, index) =>
				normalizeDocument(doc, metadata.supportingDocuments?.[index], {
					id: doc?.id ?? `${sourceDocument.id}-support-${index + 1}`,
					docType: doc?.docType ?? 'supporting_document',
					title:
						doc?.title ?? path.basename(doc?.filePath ?? doc?.sourceFile ?? `support-${index + 1}`)
				})
		),
		questions: questionsWithSharedTables,
		localAssetManifest: normalizeLocalAssetManifest(
			input.localAssetManifest ?? input.assetManifest ?? []
		)
	};
}

function propagateStructuredTableBlocks(questions) {
	const tablesByParent = new Map();
	for (const question of questions) {
		const parent =
			question.parentSourceQuestionRef ?? parentRef(question.sourceQuestionRef) ?? 'unknown';
		for (const block of renderBlocksFor(question)) {
			if (!isStructuredTableBlock(block)) continue;
			const label = normalizedLabel(block.label ?? block.assetLabel ?? block.sourceLabel);
			if (!label) continue;
			if (!tablesByParent.has(parent)) tablesByParent.set(parent, new Map());
			if (!tablesByParent.get(parent).has(label)) tablesByParent.get(parent).set(label, block);
		}
	}
	return questions.map((question) => {
		const parent =
			question.parentSourceQuestionRef ?? parentRef(question.sourceQuestionRef) ?? 'unknown';
		const availableTables = tablesByParent.get(parent);
		if (!availableTables?.size) return question;
		const existing = new Set(
			renderBlocksFor(question)
				.filter(isStructuredTableBlock)
				.map((block) => normalizedLabel(block.label ?? block.assetLabel ?? block.sourceLabel))
				.filter(Boolean)
		);
		const missingBlocks = [...referencedTableLabels(question)]
			.map((label) => normalizedLabel(label))
			.filter((label) => label && !existing.has(label) && availableTables.has(label))
			.map((label) => cloneJson(availableTables.get(label)));
		if (!missingBlocks.length) return question;
		return {
			...question,
			stemBlocks: [...missingBlocks, ...(question.stemBlocks ?? [])]
		};
	});
}

function renderBlocksFor(question) {
	return [
		...(question.stemBlocks ?? []),
		...(question.leadBlocks ?? []),
		...(question.promptBlocks ?? []),
		...(question.afterResponseBlocks ?? [])
	];
}

function isStructuredTableBlock(block) {
	if (!block || typeof block !== 'object') return false;
	if (!['table', 'structured-table'].includes(String(block.kind ?? ''))) return false;
	return (block.rows ?? []).some(
		(row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim())
	);
}

function referencedTableLabels(question) {
	const labels = new Set();
	const text = [
		question.promptText,
		question.selfContainedPromptText,
		question.contextText,
		...(question.reviewNotes ?? [])
	]
		.filter(Boolean)
		.join('\n');
	for (const match of text.matchAll(/\btable\s+(\d+[A-Za-z]?)\b/gi))
		labels.add(`Table ${match[1]}`);
	if (/^table\s+\d+/i.test(String(question.response?.assetLabel ?? ''))) {
		labels.add(question.response.assetLabel);
	}
	for (const asset of question.assets ?? []) {
		const label = asset.sourceLabel ?? asset.assetLabel ?? asset.label;
		if (/data[-_ ]?table|table/i.test(String(asset.role ?? label ?? ''))) labels.add(label);
	}
	return labels;
}

function normalizedLabel(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function normalizedForExactMatch(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalizedSlugForExactMatch(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function cloneJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function normalizeDocument(doc = {}, metadataDoc = {}, fallback = {}) {
	const sourcePathCandidates = [
		doc.filePath,
		doc.sourceFile,
		metadataDoc?.originalPath,
		metadataDoc?.path,
		fallback.path
	]
		.map(normalizeLocalFilePath)
		.filter(Boolean);
	const sourcePath =
		sourcePathCandidates.find((candidate) => existsSync(candidate)) ??
		sourcePathCandidates[0] ??
		null;
	const detectedPageCount = sourcePath ? bestEffortPdfPageCount(sourcePath) : 0;
	const pageCount = positiveInteger(doc.pageCount, metadataDoc?.pageCount, detectedPageCount) ?? 0;
	return {
		id: doc.id ?? metadataDoc?.id ?? fallback.id,
		docType: doc.docType ?? metadataDoc?.docType ?? fallback.docType,
		board: doc.board ?? metadataDoc?.board ?? null,
		qualification: doc.qualification ?? metadataDoc?.qualification ?? null,
		subject: doc.subject ?? metadataDoc?.subject ?? null,
		subjectArea: doc.subjectArea ?? metadataDoc?.subjectArea ?? doc.subject ?? null,
		tier: doc.tier ?? metadataDoc?.tier ?? null,
		paper: doc.paper ?? metadataDoc?.paper ?? null,
		componentCode: doc.componentCode ?? metadataDoc?.componentCode ?? null,
		series: doc.series ?? metadataDoc?.series ?? null,
		year: doc.year ?? metadataDoc?.year ?? null,
		title: doc.title ?? metadataDoc?.title ?? fallback.title ?? fallback.id,
		sourceUrl: doc.sourceUrl ?? metadataDoc?.sourceUrl ?? null,
		filePath: sourcePath,
		fileHash:
			sourcePath && existsSync(sourcePath)
				? `sha256:${fileHash(sourcePath)}`
				: (doc.fileHash ?? null),
		pageCount,
		metadata: {
			...(doc.metadata ?? {}),
			provenanceNotes: doc.provenanceNotes ?? undefined,
			originalFilename: sourcePath ? path.basename(sourcePath) : undefined
		}
	};
}

function positiveInteger(...values) {
	for (const value of values) {
		const number = Number(value);
		if (Number.isInteger(number) && number > 0) return number;
	}
	return null;
}

function normalizeQuestion(question, index, sourceDocument) {
	const promptText = String(question.promptText ?? question.sourceQuestionRef ?? '').trim();
	const contextBlocks = normalizedContextBlocks(question);
	const promptBlocks = question.promptBlocks ?? [{ kind: 'paragraph', text: promptText }];
	const contextText = nonDuplicatingContextText(question, [
		...contextBlocks,
		...(question.leadBlocks ?? []),
		...promptBlocks,
		...(question.afterResponseBlocks ?? [])
	]);
	const assets = normalizeAssets(
		question.assets ?? question.requiredAssets ?? [],
		question.sourceQuestionRef
	);
	const response = normalizeResponse(question.response, question.marks);
	const modelAnswer = normalizeModelAnswer(question.modelAnswer);
	const normalizedModelAnswer = fixedResponseModelAnswerDuplicatesAnswerKey(response, modelAnswer)
		? null
		: modelAnswer;
	const needsHumanReview = question.needsHumanReview === true;
	const chainResolution = normalizeChainResolution(question.chainResolution) ?? {
		action: 'needs_review',
		existingChainId: null,
		compatibilityRationale: 'Codex PDF extraction defers answer-chain assignment.',
		identityStable: false
	};
	return {
		id: question.id ?? null,
		sourceQuestionRef: question.sourceQuestionRef,
		parentSourceQuestionRef:
			question.parentSourceQuestionRef ?? parentRef(question.sourceQuestionRef),
		displayOrder: question.displayOrder ?? index + 1,
		promptText,
		selfContainedPromptText: question.selfContainedPromptText ?? promptText,
		contextText,
		commandWord: question.commandWord ?? null,
		marks: numberOrNull(question.marks),
		pageStart: question.pageStart ?? null,
		pageEnd: question.pageEnd ?? question.pageStart ?? null,
		topicPath: question.topicPath ?? [],
		specRef: question.specRef ?? null,
		stemBlocks: normalizeBlocks(contextBlocks),
		leadBlocks: normalizeBlocks(question.leadBlocks ?? []),
		promptBlocks: normalizeBlocks(promptBlocks),
		response,
		afterResponseBlocks: normalizeBlocks(question.afterResponseBlocks ?? []),
		assets,
		markSchemeItems: (question.markSchemeItems ?? []).map((item) => ({
			itemType: item.itemType ?? item.kind ?? 'mark',
			text: String(item.text ?? '').trim(),
			marks: numberOrNull(item.marks),
			sourceRef: item.sourceRef ?? question.sourceQuestionRef,
			confidence: item.confidence ?? null
		})),
		markChecklist: (question.markChecklist ?? []).map((item) => ({
			text: String(item.text ?? '').trim(),
			required: item.required !== false,
			markSchemeItemIndexes: item.markSchemeItemIndexes ?? [],
			confidence: item.confidence ?? null,
			needsHumanReview: item.needsHumanReview === true
		})),
		modelAnswer: normalizedModelAnswer,
		answerChain: question.answerChain ?? placeholderChain(question, sourceDocument.subjectArea),
		chainResolution,
		commonWeakAnswers: question.commonWeakAnswers ?? [],
		extractionConfidence: normalizedConfidence(
			question.extractionConfidence ?? question.confidence,
			needsHumanReview ? 0.5 : 0.9
		),
		needsHumanReview,
		reviewNotes: question.reviewNotes ?? []
	};
}

function numberOrNull(value) {
	if (value === null || value === undefined || value === '') return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function normalizedConfidence(value, fallback) {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.max(0, Math.min(1, number));
}

function normalizedContextBlocks(question) {
	const explicitBlocks = question.stemBlocks ?? question.contextBlocks ?? null;
	if (Array.isArray(explicitBlocks) && explicitBlocks.length) return explicitBlocks;
	const contextText = String(question.contextText ?? '').trim();
	if (!contextText) return [];
	return [{ kind: 'paragraph', text: contextText }];
}

function nonDuplicatingContextText(question, blocks = []) {
	const original = String(question.contextText ?? '').trim();
	if (!original) return null;
	if (!normalizedRenderText(original)) return null;
	let cleaned = original;
	const blockTexts = blocks
		.map((block) => String(block?.text ?? '').trim())
		.filter((text) => normalizedRenderText(text).length >= 24)
		.sort((a, b) => b.length - a.length);
	for (const text of blockTexts) {
		cleaned = cleaned.replace(whitespaceFlexibleRegExp(text, 'gi'), ' ');
	}
	cleaned = cleaned
		.replace(/\s+([,.;:!?])/g, '$1')
		.replace(/^[,.;:\s]+/, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!normalizedRenderText(cleaned).replace(/[^a-z0-9]+/g, '')) return null;
	return cleaned;
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function whitespaceFlexibleRegExp(value, flags = 'g') {
	return new RegExp(escapeRegExp(value).replace(/\s+/g, '\\s+'), flags);
}

function normalizeAssets(assets, sourceQuestionRef) {
	const normalized = (assets ?? []).map((asset, index) => {
		const sourceLabel =
			asset.sourceLabel ??
			asset.assetLabel ??
			asset.label ??
			asset.assetId ??
			asset.id ??
			`${sourceQuestionRef ?? 'question'}-asset-${index + 1}`;
		const filePath = normalizeLocalFilePath(
			asset.filePath ?? asset.file ?? asset.localPath ?? null
		);
		return {
			...asset,
			sourceLabel: String(sourceLabel),
			role: asset.role ?? asset.kind ?? null,
			page: asset.page ?? asset.pageStart ?? null,
			filePath,
			publicPath: asset.publicPath ?? null,
			r2Key: asset.r2Key ?? null,
			description: asset.description ?? asset.notes ?? null,
			needsHumanReview: asset.needsHumanReview === true
		};
	});
	return normalized;
}

function normalizeLocalAssetManifest(manifest) {
	return (manifest ?? [])
		.map((asset) => {
			const filePath = normalizeLocalFilePath(
				asset.filePath ?? asset.file ?? asset.localPath ?? asset.path
			);
			if (!filePath || !existsSync(filePath)) return null;
			const page = Number(asset.page ?? asset.pageNumber ?? NaN);
			return {
				page: Number.isFinite(page) ? page : null,
				fileName: String(asset.fileName ?? path.basename(filePath)),
				filePath,
				publicPath: String(asset.publicPath ?? ''),
				r2Key: String(asset.r2Key ?? '')
			};
		})
		.filter(Boolean);
}

function normalizeLocalFilePath(filePath) {
	if (!filePath) return null;
	const value = String(filePath);
	if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
	if (path.isAbsolute(value)) return value;
	const resolved = path.resolve(localPathBaseDir, value);
	return existsSync(resolved) ? resolved : value;
}

function normalizeBlocks(blocks) {
	return (blocks ?? [])
		.map((block) => {
			if (!block || typeof block !== 'object') return null;
			const kind = normalizeBlockKind(block.kind ?? 'paragraph');
			if (
				kind === 'table' &&
				(!Array.isArray(block.columns) || block.columns.length === 0) &&
				Array.isArray(block.rows)
			) {
				return {
					kind: 'structured-table',
					text: null,
					label: block.label ?? null,
					assetLabel: block.assetLabel ?? block.sourceLabel ?? null,
					columns: null,
					rows: normalizeStructuredTableRows(block.rows),
					items: null,
					keyItems: null,
					compact: block.compact ?? null,
					wide: block.wide ?? null
				};
			}
			return {
				kind,
				text: block.text ?? null,
				label: block.label ?? null,
				assetLabel: block.assetLabel ?? block.sourceLabel ?? null,
				columns: block.columns ?? null,
				rows:
					kind === 'structured-table'
						? normalizeStructuredTableRows(block.rows)
						: (block.rows ?? null),
				items: block.items ?? null,
				keyItems: block.keyItems ?? null,
				compact: block.compact ?? null,
				wide: block.wide ?? null
			};
		})
		.filter(Boolean);
}

function normalizeBlockKind(kind) {
	const value = String(kind ?? 'paragraph');
	if (['formula', 'math'].includes(value)) return 'equation';
	return value;
}

function normalizeStructuredTableRows(rows) {
	if (!Array.isArray(rows)) return null;
	return rows.map((row) => {
		if (!Array.isArray(row)) return [];
		return row.map((cell) => {
			if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
				return {
					...cell,
					text: String(cell.text ?? '')
				};
			}
			return { text: String(cell ?? '') };
		});
	});
}

function normalizeResponse(response, marks) {
	if (!response?.kind) return { kind: marks ? 'lines' : 'none', count: marks ?? null };
	const output = canonicalResponse(response);
	if (output.kind === 'labeled-lines' && Array.isArray(output.fields)) {
		const fieldLabels = output.fields
			.map((field) => String(field?.label ?? '').trim())
			.filter(Boolean);
		if (!Array.isArray(output.labels) || output.labels.length === 0) output.labels = fieldLabels;
		const fieldLineCounts = output.fields
			.map((field) => Number(field?.lineCount ?? 0))
			.filter((count) => Number.isFinite(count) && count > 0);
		if (fieldLineCounts.length) {
			// The app renderer treats lineCount as lines per label. Keep fields[] for exact
			// paper provenance and use the largest field count for a renderable fallback.
			output.lineCount = Math.max(...fieldLineCounts);
		}
	}
	if (output.kind === 'lines' && output.count === undefined)
		output.count = output.lineCount ?? marks ?? 1;
	if (output.kind === 'labeled-lines' && output.lineCount === undefined)
		output.lineCount = output.count ?? null;
	if (output.kind === 'matching') {
		if (!Array.isArray(output.left) && Array.isArray(output.prompts)) output.left = output.prompts;
		if (!Array.isArray(output.right) && Array.isArray(output.options))
			output.right = output.options;
		output.left ??= [];
		output.right ??= [];
	}
	if (output.kind === 'choice') {
		const options = Array.isArray(output.options)
			? output.options
			: Array.isArray(output.choiceOptions)
				? output.choiceOptions
				: [];
		output.options = options.map(choiceOptionString).filter(Boolean);
	}
	if (fixedResponseKinds.has(output.kind)) {
		output.correctAnswers = normalizeCorrectAnswers(
			output.correctAnswers ?? response.answerKey ?? []
		);
	}
	return output;
}

function canonicalResponse(response) {
	const kind = String(response.kind ?? '').trim();
	if (supportedResponseKinds.has(kind)) return { ...response };
	if (kind === 'structured_fields') {
		const labels = (response.fields ?? response.labels ?? []).map(String);
		return {
			...response,
			kind: 'labeled-lines',
			labels,
			count: response.lineCount ?? (labels.length || null),
			lineCount: response.lineCount ?? (labels.length || null)
		};
	}
	if (kind === 'calculation') {
		const answerLabel = response.answerField?.label ?? 'Final answer';
		return {
			...response,
			kind: 'labeled-lines',
			labels: ['Working', answerLabel].filter(Boolean),
			count: response.lineCount ?? null,
			lineCount: response.lineCount ?? null,
			unit: response.answerField?.unit ?? response.unit ?? null
		};
	}
	if (kind === 'short_numeric') {
		return {
			...response,
			kind: 'labeled-lines',
			labels: [response.answerField?.label ?? response.label ?? 'Answer'],
			count: response.lineCount ?? 1,
			lineCount: response.lineCount ?? 1
		};
	}
	if (kind === 'tick_box' || kind === 'multiple_choice') {
		return {
			...response,
			kind: 'choice',
			options: (response.options ?? []).map(choiceOptionString).filter(Boolean),
			correctAnswers: normalizeCorrectAnswers(response.correctAnswers ?? response.answers ?? [])
		};
	}
	if (kind === 'tick_box_table' || kind === 'table_choice') {
		return {
			...response,
			kind: 'choice-table',
			columns: (response.columns ?? []).map(String),
			rows: (response.rows ?? response.options ?? []).map((row) =>
				Array.isArray(row) ? row.map(String) : [String(row)]
			),
			correctAnswers: normalizeCorrectAnswers(response.correctAnswers ?? response.answers ?? [])
		};
	}
	if (kind === 'equation_completion' || kind === 'formula_completion') {
		const blankCount = Number(response.blankCount ?? response.blanks ?? 1);
		const segments =
			response.segments ??
			Array.from({ length: Math.max(1, blankCount) }, (_, index) => ({
				kind: 'blank',
				id: `blank-${index + 1}`,
				label: null,
				width: null
			}));
		return {
			...response,
			kind: 'equation-blanks',
			segments,
			correctAnswers: normalizeCorrectAnswers(response.correctAnswers ?? response.answers ?? [])
		};
	}
	if (kind === 'graph_plot' || kind === 'diagram_drawing') {
		return {
			...response,
			kind: 'asset-canvas',
			assetLabel:
				response.assetLabel ?? response.targetAssetId ?? response.assetId ?? response.label ?? null,
			instructions: response.instructions ?? response.graphType ?? kind,
			correctAnswers: normalizeCorrectAnswers(response.correctAnswers ?? response.answers ?? [])
		};
	}
	return {
		...response,
		kind: marksFromResponse(response) ? 'lines' : 'none',
		count: response.lineCount ?? null,
		notes: `Original Codex response kind ${kind || 'missing'} was normalized.`
	};
}

function choiceOptionString(option) {
	if (typeof option === 'string') return option.trim();
	if (typeof option === 'number' || typeof option === 'boolean') return String(option);
	if (!option || typeof option !== 'object') return '';
	const id = String(option.id ?? option.label ?? option.letter ?? option.key ?? '').trim();
	const text = String(option.text ?? option.value ?? option.answer ?? option.option ?? '').trim();
	if (id && text) return `${id}. ${text}`;
	return text || id;
}

function marksFromResponse(response) {
	return Number(response?.lineCount ?? response?.count ?? 0) > 0;
}

function normalizeCorrectAnswers(value) {
	if (!value) return [];
	if (!Array.isArray(value) && typeof value === 'object') {
		return Object.entries(value)
			.filter(([, answer]) => answer !== null && answer !== undefined && String(answer).trim())
			.map(([targetId, answer]) => normalizeCorrectAnswerEntry({ targetId, correctAnswer: answer }))
			.filter(Boolean);
	}
	return (Array.isArray(value) ? value : [value])
		.map((answer, index) => {
			if (typeof answer === 'string' || typeof answer === 'number') {
				return normalizeCorrectAnswerEntry({
					targetId: index === 0 ? 'answer' : `answer-${index + 1}`,
					correctAnswer: answer
				});
			}
			if (!answer || typeof answer !== 'object') return null;
			const targetId =
				answer.targetId ??
				answer.id ??
				(Array.isArray(answer.targetIds) ? answer.targetIds.join('|') : null) ??
				(index === 0 ? 'answer' : `answer-${index + 1}`);
			const correctAnswer =
				answer.correctAnswer ??
				answer.answer ??
				answer.text ??
				(Array.isArray(answer.answers) ? answer.answers.join(' | ') : null);
			if (correctAnswer === null || correctAnswer === undefined || !String(correctAnswer).trim())
				return null;
			return normalizeCorrectAnswerEntry({
				targetId,
				correctAnswer,
				aliases: answer.aliases ?? answer.acceptedAnswers ?? answer.accepted ?? null
			});
		})
		.filter(Boolean);
}

function rawCorrectAnswerEntries(value) {
	if (!value) return [];
	if (!Array.isArray(value) && typeof value === 'object') {
		return Object.entries(value).flatMap(([targetId, answer]) => {
			if (Array.isArray(answer)) {
				return answer.map((item) => rawCorrectAnswerEntry(targetId, item)).filter(Boolean);
			}
			return [rawCorrectAnswerEntry(targetId, answer)].filter(Boolean);
		});
	}
	return (Array.isArray(value) ? value : [value])
		.map((answer, index) => {
			if (typeof answer === 'string' || typeof answer === 'number') {
				return {
					targetId: index === 0 ? 'answer' : `answer-${index + 1}`,
					correctAnswer: String(answer).trim(),
					aliases: []
				};
			}
			if (!answer || typeof answer !== 'object') return null;
			return rawCorrectAnswerEntry(
				answer.targetId ?? answer.id ?? (index === 0 ? 'answer' : `answer-${index + 1}`),
				answer
			);
		})
		.filter(Boolean);
}

function rawCorrectAnswerEntry(targetId, value) {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string' || typeof value === 'number') {
		const correctAnswer = String(value).trim();
		return correctAnswer ? { targetId: String(targetId), correctAnswer, aliases: [] } : null;
	}
	if (!value || typeof value !== 'object') return null;
	const correctAnswer = value.correctAnswer ?? value.answer ?? value.text ?? value.value;
	if (correctAnswer === null || correctAnswer === undefined || !String(correctAnswer).trim()) {
		return null;
	}
	return {
		targetId: String(targetId),
		correctAnswer: String(correctAnswer).trim(),
		aliases: aliasValues(value.aliases ?? value.acceptedAnswers ?? value.accepted)
	};
}

function normalizeCorrectAnswerEntry({ targetId, correctAnswer, aliases = null }) {
	const split = splitMachineAnswerAlternatives(correctAnswer);
	const explicitAliases = aliasValues(aliases);
	const canonical = split[0] ?? String(correctAnswer ?? '').trim();
	const combinedAliases = [...new Set([...split.slice(1), ...explicitAliases])].filter(
		(alias) => normalizedForExactMatch(alias) !== normalizedForExactMatch(canonical)
	);
	if (!String(targetId ?? '').trim() || !canonical) return null;
	return {
		targetId: String(targetId).trim(),
		correctAnswer: canonical,
		...(combinedAliases.length ? { aliases: combinedAliases } : {})
	};
}

function aliasValues(value) {
	if (typeof value === 'string') {
		return value
			.split(/\s*(?:\||;|\n)\s*/)
			.map((alias) => alias.trim())
			.filter(Boolean);
	}
	if (!Array.isArray(value)) return [];
	return value
		.map((alias) =>
			typeof alias === 'string' || typeof alias === 'number' ? String(alias).trim() : ''
		)
		.filter(Boolean);
}

function splitMachineAnswerAlternatives(value) {
	const text = String(value ?? '').trim();
	if (!text) return [];
	if (/\b(?:\d+(?:\.\d+)?|[a-z])\s+or\s+(?:more|less|fewer)\b/i.test(text)) {
		return [text];
	}
	const parts = text
		.split(/\s+\bor\b\s+|\s+\|\s+/i)
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts.length < 2) return [text];
	if (parts.some((part) => part.length > 24 || /\b(?:allow|accept|ignore|reject)\b/i.test(part))) {
		return [text];
	}
	return parts;
}

function normalizeModelAnswer(value) {
	if (!value) return null;
	if (typeof value === 'string')
		return { answerText: value, confidence: null, needsHumanReview: false };
	return {
		answerText: value.answerText ?? '',
		confidence: value.confidence ?? 0.5,
		needsHumanReview: value.needsHumanReview === true
	};
}

function normalizeChainResolution(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const allowedActions = new Set([
		'reuse_existing',
		'update_existing',
		'create_new',
		'needs_review'
	]);
	const action = allowedActions.has(value.action) ? value.action : 'needs_review';
	let existingChainId =
		value.existingChainId ?? value.existing_chain_id ?? value.currentChainId ?? null;
	if (!existingChainId && ['reuse_existing', 'update_existing'].includes(action)) {
		existingChainId = value.chainId ?? value.chain_id ?? value.answerChainId ?? null;
	}
	if (action === 'create_new') existingChainId = null;
	const compatibilityRationale =
		value.compatibilityRationale ??
		value.compatibility_rationale ??
		value.rationale ??
		value.reason ??
		'Chain reconciliation did not provide a rationale.';
	return {
		...value,
		action,
		existingChainId: existingChainId ? String(existingChainId) : null,
		compatibilityRationale: String(compatibilityRationale),
		identityStable: value.identityStable === true
	};
}

function fixedResponseModelAnswerDuplicatesAnswerKey(response, modelAnswer) {
	if (!fixedResponseKinds.has(response?.kind)) return false;
	if (!String(modelAnswer?.answerText ?? '').trim()) return false;
	return normalizeCorrectAnswers(response?.correctAnswers).length > 0;
}

function unresolvedExtractionReviewIssues(question) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const issues = [];
	if (question.needsHumanReview === true) {
		issues.push({
			code: 'needs_human_review',
			field: 'needsHumanReview',
			severity: 'error',
			evidence: ref
		});
	}
	if (question.modelAnswer?.needsHumanReview === true) {
		issues.push({
			code: 'model_answer_needs_human_review',
			field: 'modelAnswer.needsHumanReview',
			severity: 'error',
			evidence: ref
		});
	}
	for (const [index, asset] of (question.assets ?? []).entries()) {
		if (asset?.needsHumanReview !== true) continue;
		issues.push({
			code: 'asset_needs_human_review',
			field: `assets[${index}].needsHumanReview`,
			severity: 'error',
			evidence: `${ref} ${asset.sourceLabel ?? asset.assetLabel ?? asset.label ?? index}`
		});
	}
	for (const [index, item] of (question.markChecklist ?? []).entries()) {
		if (item?.needsHumanReview !== true) continue;
		issues.push({
			code: 'mark_checklist_needs_human_review',
			field: `markChecklist[${index}].needsHumanReview`,
			severity: 'error',
			evidence: ref
		});
	}
	return issues;
}

function placeholderChain(question, subjectArea) {
	return {
		id: null,
		title: 'Reusable chain pending Codex reconciliation',
		canonicalChainText: 'Assign a reusable reasoning or method pattern from source mark evidence.',
		summary: 'Placeholder created after PDF extraction; answer-chain Codex run must replace it.',
		broadTopic: subjectArea ?? null,
		chainFamilyId: null,
		steps: [
			{
				stepText: 'Create a reusable chain step from positive mark-scheme evidence.',
				stepRole: 'method',
				explanation: null,
				commonOmission: null,
				markSchemeItemIndexes: []
			}
		],
		confidence: 0.1,
		needsHumanReview: true,
		reviewNotes: ['Placeholder chain; run Codex answer-chain reconciliation.']
	};
}

function mechanicalSummary(candidate, options = {}) {
	const refs = candidate.questions.map((question) => question.sourceQuestionRef);
	const duplicateRefs = refs.filter((ref, index) => refs.indexOf(ref) !== index);
	const markTotal = candidate.questions.reduce(
		(sum, question) => sum + Number(question.marks ?? 0),
		0
	);
	const deterministicIssues = deterministicIssuesFor(candidate, {
		includeAnswerChainIssues: false
	});
	const extraIssues = [];
	if (options.expectedMarks != null && markTotal !== options.expectedMarks) {
		extraIssues.push({
			code: 'mark_total_mismatch',
			message: `${markTotal} != ${options.expectedMarks}`
		});
	}
	if (
		options.expectedQuestions != null &&
		candidate.questions.length !== options.expectedQuestions
	) {
		extraIssues.push({
			code: 'question_count_mismatch',
			message: `${candidate.questions.length} != ${options.expectedQuestions}`
		});
	}
	if (duplicateRefs.length) {
		extraIssues.push({ code: 'duplicate_refs', message: duplicateRefs.join(', ') });
	}
	const blocking = [...blockingIssues(deterministicIssues), ...extraIssues];
	return {
		status: blocking.length ? 'failed' : 'passed',
		sourceDocumentId: candidate.sourceDocument?.id ?? candidate.sourceDocumentId ?? null,
		questionCount: candidate.questions.length,
		markTotal,
		firstRef: refs[0] ?? null,
		lastRef: refs[refs.length - 1] ?? null,
		duplicateRefs: [...new Set(duplicateRefs)],
		parentMarkTotals: parentMarkTotals(candidate.questions),
		reviewQuestionRefs: candidate.questions
			.filter((question) => question.needsHumanReview)
			.map((question) => question.sourceQuestionRef),
		blockingIssues: blocking,
		deterministicIssueCount: deterministicIssues.length,
		deterministicIssues
	};
}

function deterministicIssuesFor(candidate, options = {}) {
	const findings = [];
	const sourceDocumentId = candidate?.sourceDocument?.id ?? candidate?.sourceDocumentId ?? null;
	const sourcePageCount = Number(candidate?.sourceDocument?.pageCount ?? 0);
	const expectedLineCounts = expectedResponseLineCountsForSource(sourceDocumentId);
	if (!candidate?.sourceDocument?.id) {
		findings.push({
			sourceQuestionRef: null,
			issues: [
				{
					code: 'missing_source_document',
					field: 'sourceDocument.id',
					severity: 'error',
					evidence: 'sourceDocument.id is required.'
				}
			]
		});
	}
	if (!Number.isInteger(sourcePageCount) || sourcePageCount <= 0) {
		findings.push({
			sourceQuestionRef: null,
			issues: [
				{
					code: 'source_document_missing_page_count',
					field: 'sourceDocument.pageCount',
					severity: 'error',
					evidence: candidate?.sourceDocument?.pageCount ?? 'missing'
				}
			]
		});
	}
	if (!candidate?.markSchemeDocument?.id) {
		findings.push({
			sourceQuestionRef: null,
			issues: [
				{
					code: 'missing_mark_scheme_document',
					field: 'markSchemeDocument.id',
					severity: 'error',
					evidence: 'markSchemeDocument.id is required.'
				}
			]
		});
	}
	for (const question of candidate.questions ?? []) {
		const issues = [];
		const ref = question.sourceQuestionRef ?? 'unknown';
		if (!/^\d{2}\.\d{1,2}[a-z]?$/.test(ref)) {
			issues.push({
				code: 'invalid_question_ref',
				field: 'sourceQuestionRef',
				severity: 'error',
				evidence: ref
			});
		}
		if (!String(question.promptText ?? '').trim()) {
			issues.push({
				code: 'missing_prompt_text',
				field: 'promptText',
				severity: 'error',
				evidence: ref
			});
		}
		if (!Number.isFinite(Number(question.marks))) {
			issues.push({
				code: 'missing_marks',
				field: 'marks',
				severity: 'error',
				evidence: ref
			});
		}
		if (
			!Number.isFinite(Number(question.pageStart)) ||
			!Number.isFinite(Number(question.pageEnd))
		) {
			issues.push({
				code: 'missing_page_range',
				field: 'pageStart/pageEnd',
				severity: 'error',
				evidence: ref
			});
		} else if (
			Number.isInteger(sourcePageCount) &&
			sourcePageCount > 0 &&
			Number(question.pageEnd) > sourcePageCount
		) {
			issues.push({
				code: 'question_page_span_out_of_range',
				field: 'pageStart/pageEnd',
				severity: 'error',
				evidence: `${question.pageEnd} > ${sourcePageCount}`
			});
		}
		if (!(question.markSchemeItems ?? []).length) {
			issues.push({
				code: 'missing_mark_scheme_items',
				field: 'markSchemeItems',
				severity: 'error',
				evidence: ref
			});
		}
		if (!(question.markChecklist ?? []).length) {
			issues.push({
				code: 'missing_mark_checklist',
				field: 'markChecklist',
				severity: 'error',
				evidence: ref
			});
		}
		for (const issue of unresolvedExtractionReviewIssues(question)) issues.push(issue);
		const overrequiredChecklist = overrequiredAlternativeChecklist(question);
		if (overrequiredChecklist) {
			issues.push({
				code: 'mark_checklist_overrequires_alternatives',
				field: 'markChecklist.required',
				severity: 'error',
				evidence: overrequiredChecklist
			});
		}
		const underGranularMarkScheme = underGranularAnyNMarkScheme(question);
		if (underGranularMarkScheme) {
			issues.push({
				code: 'mark_scheme_under_granular_any_n',
				field: 'markSchemeItems',
				severity: 'error',
				evidence: underGranularMarkScheme
			});
		}
		const response = question.response;
		if (!response?.kind || !supportedResponseKinds.has(response.kind)) {
			issues.push({
				code: 'unsupported_response_kind',
				field: 'response.kind',
				severity: 'error',
				evidence: response?.kind ?? 'missing'
			});
		}
		if (
			response?.kind === 'labeled-lines' &&
			!(Array.isArray(response.labels) && response.labels.length > 0) &&
			!(Array.isArray(response.fields) && response.fields.length > 0)
		) {
			issues.push({
				code: 'labeled_lines_missing_labels',
				field: 'response.labels',
				severity: 'error',
				evidence:
					'labeled-lines responses must expose renderer labels, or fields[] that can be normalized into labels.'
			});
		}
		if (
			response?.kind === 'matching' &&
			(!(Array.isArray(response.left) && response.left.length > 0) ||
				!(Array.isArray(response.right) && response.right.length > 0))
		) {
			issues.push({
				code: 'matching_response_missing_render_items',
				field: 'response.left',
				severity: 'error',
				evidence:
					'matching responses must expose non-empty left/right arrays after normalization; prompts/options alone are not renderable by the app.'
			});
		}
		for (const issue of responseDiagramSurfaceIssues(question)) issues.push(issue);
		for (const issue of drawingBoxGridMetadataIssues(question)) issues.push(issue);
		if (
			fixedResponseKinds.has(response?.kind) &&
			!(response.correctAnswers ?? []).length &&
			response.kind !== 'asset-canvas'
		) {
			issues.push({
				code: 'fixed_response_missing_answer_key',
				field: 'response.correctAnswers',
				severity: 'error',
				evidence: ref
			});
		}
		for (const answer of rawCorrectAnswerEntries(response?.correctAnswers)) {
			if (
				fixedResponseKinds.has(response?.kind) &&
				!(answer.aliases ?? []).length &&
				splitMachineAnswerAlternatives(answer.correctAnswer).length > 1
			) {
				issues.push({
					code: 'fixed_response_alternative_answer_not_machine_readable',
					field: 'response.correctAnswers',
					severity: 'error',
					evidence: `${ref} ${answer.targetId}: ${answer.correctAnswer}`
				});
			}
		}
		if (expectedLineCounts.has(ref)) {
			const expected = expectedLineCounts.get(ref);
			const mismatch = responseLineCountMismatch(response, expected);
			if (mismatch) {
				issues.push({
					code: 'known_response_line_count_mismatch',
					field: 'response.lineCount',
					severity: 'error',
					evidence: `${ref}: ${mismatch}`
				});
			}
		}
		if (sourceDocumentId === 'aqa-84611h-qp-nov20' && ref === '02.4') {
			const gradingText = [
				...(question.markSchemeItems ?? []).map((item) => item.text),
				...(question.markChecklist ?? []).map((item) => item.text),
				question.modelAnswer?.answerText
			]
				.filter(Boolean)
				.join('\n')
				.toLowerCase();
			if (!gradingText.includes('diffusion')) {
				issues.push({
					code: 'known_mark_scheme_allowance_missing',
					field: 'markSchemeItems',
					severity: 'error',
					evidence: '02.4 must include the official allowed answer diffusion as well as osmosis.'
				});
			}
		}
		if (
			[
				'aqa-84611h-qp-nov20',
				'aqa-computer-science-2023-june-paper-2-computing-concepts-qp',
				'aqa-computer-science-2024-june-paper-2-computing-concepts-qp',
				'aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp',
				...computerScience2021Paper2SourceDocumentIds,
				...computerScience2021Paper1SourceDocumentIds,
				'aqa-computer-science-2022-june-paper-2-computing-concepts-qp',
				'aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp',
				'aqa-geography-2022-june-paper-2-challenges-in-the-human-environment-qp',
				'aqa-geography-2022-june-paper-3-geographical-applications-qp',
				'aqa-geography-2020-june-paper-2-challenges-in-the-human-environment-qp',
				'aqa-geography-2021-june-paper-2-challenges-in-the-human-environment-qp',
				'aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp',
				'aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp'
			].includes(sourceDocumentId)
		) {
			for (const issue of knownSourceSpecificIssues(question, sourceDocumentId)) issues.push(issue);
		}
		if (response?.kind === 'equation-blanks') {
			const blankIds = (response.segments ?? [])
				.filter((segment) => segment?.kind === 'blank')
				.map((segment, index) => String(segment.id ?? segment.targetId ?? `blank-${index + 1}`));
			const keyedIds = new Set(
				(response.correctAnswers ?? []).flatMap((answer) =>
					String(answer?.targetId ?? answer?.id ?? '')
						.split('|')
						.map((part) => part.trim())
						.filter(Boolean)
				)
			);
			for (const blankId of blankIds) {
				if (keyedIds.has(blankId)) continue;
				issues.push({
					code: 'equation_blank_missing_answer_key',
					field: 'response.correctAnswers',
					severity: 'error',
					evidence: `${ref} -> ${blankId}`
				});
			}
		}
		if (['lines', 'labeled-lines'].includes(response?.kind) && !question.modelAnswer?.answerText) {
			issues.push({
				code: 'written_response_missing_model_answer',
				field: 'modelAnswer',
				severity: 'error',
				evidence: ref
			});
		}
		for (const asset of question.assets ?? []) {
			if (!asset.sourceLabel) {
				issues.push({
					code: 'asset_missing_source_label',
					field: 'assets.sourceLabel',
					severity: 'error',
					evidence: ref
				});
			}
		}
		for (const label of missingReferencedMediaLabels(question)) {
			issues.push({
				code: 'referenced_media_missing_asset',
				field: 'assets',
				severity: 'error',
				evidence: `${ref} -> ${label}`
			});
		}
		for (const issue of contextTextDuplicateBlockIssues(question)) issues.push(issue);
		for (const issue of copyrightPlaceholderMediaIssues(question)) issues.push(issue);
		for (const issue of learnerVisibleSourceProvenanceIssues(question)) issues.push(issue);
		for (const issue of genericFigureCropPromptTextIssues(question)) issues.push(issue);
		if (['asset-canvas', 'image-label-zones'].includes(response?.kind)) {
			const labels = [
				response.assetLabel,
				response.assetId,
				response.sourceLabel,
				...(Array.isArray(response.assets) ? response.assets : [])
			].filter(Boolean);
			const matchingAssets = (question.assets ?? []).filter((asset) =>
				labels.some((label) =>
					[asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
						.filter(Boolean)
						.includes(label)
				)
			);
			if (!labels.length || matchingAssets.length === 0) {
				issues.push({
					code: 'response_asset_missing_asset',
					field: 'response.assetLabel',
					severity: 'error',
					evidence: ref
				});
			}
			if (matchingAssets.length > 0 && !matchingAssets.some(assetHasRenderableSource)) {
				issues.push({
					code: 'response_asset_not_renderable',
					field: 'assets.filePath',
					severity: 'error',
					evidence: `${ref} -> ${labels.join(', ')}`
				});
			}
			if (
				response.kind === 'asset-canvas' &&
				labels.some((label) => normalizedMediaLabel(label).startsWith('table '))
			) {
				issues.push({
					code: 'table_asset_canvas_response',
					field: 'response.kind',
					severity: 'error',
					evidence: `${ref} -> ${labels.join(', ')}`
				});
			}
			if (
				response.kind === 'image-label-zones' &&
				(!Array.isArray(response.labels) || response.labels.length === 0)
			) {
				issues.push({
					code: 'image_label_zones_missing_labels',
					field: 'response.labels',
					severity: 'error',
					evidence: ref
				});
			}
			if (
				response.kind === 'image-label-zones' &&
				(!Array.isArray(response.zones) || response.zones.length === 0)
			) {
				issues.push({
					code: 'image_label_zones_missing_zones',
					field: 'response.zones',
					severity: 'error',
					evidence: ref
				});
			}
		}
		const duplicateRenderText = duplicateLearnerVisibleBlockText(question);
		if (duplicateRenderText) {
			issues.push({
				code: 'render_block_duplicate_text',
				field: 'stemBlocks/leadBlocks/promptBlocks/afterResponseBlocks',
				severity: 'error',
				evidence: duplicateRenderText
			});
		}
		if (options.includeAnswerChainIssues) {
			if (!question.answerChain?.title || !question.answerChain?.canonicalChainText) {
				issues.push({
					code: 'missing_answer_chain',
					field: 'answerChain',
					severity: 'error',
					evidence: ref
				});
			}
			if (!String(question.answerChain?.id ?? '').trim()) {
				issues.push({
					code: 'answer_chain_missing_id',
					field: 'answerChain.id',
					severity: 'error',
					evidence: ref
				});
			}
			issues.push(
				...answerChainSpecificityIssues(question.answerChain, {
					commandWord: question.commandWord
				}).map((issue) => ({
					...issue,
					field: issue.field ? `answerChain.${issue.field}` : 'answerChain'
				}))
			);
			issues.push(...fixedResponseChainExactAnswerIssues(question));
			issues.push(...answerChainStyleIssues(question.answerChain, ref));
			for (const [stepIndex, step] of (question.answerChain?.steps ?? []).entries()) {
				if (!allowedAnswerChainStepRoles.has(step?.stepRole)) {
					issues.push({
						code: 'answer_chain_unsupported_step_role',
						field: `answerChain.steps[${stepIndex}].stepRole`,
						severity: 'error',
						evidence: step?.stepRole ?? 'missing'
					});
				}
				const indexes = Array.isArray(step?.markSchemeItemIndexes)
					? step.markSchemeItemIndexes
					: [];
				if (!indexes.length) {
					issues.push({
						code: 'chain_step_missing_positive_evidence',
						field: `answerChain.steps[${stepIndex}].markSchemeItemIndexes`,
						severity: 'error',
						evidence: ref
					});
					continue;
				}
				for (const index of indexes) {
					const markItem = (question.markSchemeItems ?? [])[index];
					if (!Number.isInteger(index) || !markItem || !isPositiveMarkSchemeItem(markItem)) {
						issues.push({
							code: 'chain_step_invalid_positive_evidence',
							field: `answerChain.steps[${stepIndex}].markSchemeItemIndexes`,
							severity: 'error',
							evidence: `${ref} -> ${index}`
						});
					}
				}
			}
			if (question.needsHumanReview || question.answerChain?.needsHumanReview) {
				issues.push({
					code: 'needs_human_review',
					field: 'needsHumanReview',
					severity: 'error',
					evidence: ref
				});
			}
			for (const [weakIndex, weakAnswer] of (question.commonWeakAnswers ?? []).entries()) {
				const hasWeakText = String(
					weakAnswer?.weakAnswerText ?? weakAnswer?.weak_answer_text ?? ''
				).trim();
				if (hasWeakText && !String(weakAnswer?.explanation ?? '').trim()) {
					issues.push({
						code: 'common_weak_answer_missing_explanation',
						field: `commonWeakAnswers[${weakIndex}].explanation`,
						severity: 'warning',
						evidence: ref
					});
				}
				if (hasWeakText && !Number.isFinite(Number(weakAnswer?.confidence))) {
					issues.push({
						code: 'common_weak_answer_missing_confidence',
						field: `commonWeakAnswers[${weakIndex}].confidence`,
						severity: 'error',
						evidence: ref
					});
				}
			}
		}
		if (issues.length) findings.push({ sourceQuestionRef: ref, issues });
	}
	return findings;
}

function fixedResponseChainExactAnswerIssues(question) {
	const chain = question.answerChain;
	if (!chain || !fixedResponseKinds.has(question.response?.kind)) return [];
	const issues = [];
	for (const answer of exactFixedAnswerTexts(question)) {
		const normalizedAnswer = normalizedForExactMatch(answer);
		const answerSlug = normalizedSlugForExactMatch(answer);
		for (const [field, value] of reusableAnswerChainTextFields(chain)) {
			const normalizedField = normalizedForExactMatch(value);
			const fieldSlug = normalizedSlugForExactMatch(value);
			if (
				normalizedField.includes(normalizedAnswer) ||
				(answerSlug && fieldSlug.includes(answerSlug))
			) {
				issues.push({
					code: 'chain_exact_fixed_answer_text',
					field,
					severity: 'error',
					evidence: value,
					message:
						'Fixed-response answer-chain text includes the exact correct answer. Keep exact answers in response.correctAnswers, markSchemeItems, markChecklist, or modelAnswer only.'
				});
			}
		}
	}
	return issues;
}

function exactFixedAnswerTexts(question) {
	const values = [
		...rawCorrectAnswerEntries(question.response?.correctAnswers).map(
			(answer) => answer.correctAnswer
		),
		question.modelAnswer?.answerText
	].filter((value) => typeof value === 'string' && value.trim());
	return [...new Set(values.map((value) => value.trim()))].filter((value) => {
		const normalized = normalizedForExactMatch(value);
		return normalized.length >= 4 && normalized.split(' ').length <= 6;
	});
}

function reusableAnswerChainTextFields(chain) {
	return [
		['answerChain.id', chain?.id],
		['answerChain.title', chain?.title],
		['answerChain.canonicalChainText', chain?.canonicalChainText],
		['answerChain.summary', chain?.summary],
		...(chain?.steps ?? []).flatMap((step, index) => [
			[`answerChain.steps[${index}].stepText`, step?.stepText],
			[`answerChain.steps[${index}].explanation`, step?.explanation],
			[`answerChain.steps[${index}].commonOmission`, step?.commonOmission]
		])
	].filter(([, value]) => typeof value === 'string' && value.trim());
}

function answerChainStyleIssues(chain, ref) {
	if (!chain) return [];
	const issues = [];
	const title = String(chain.title ?? '').trim();
	if (title) {
		const words = wordCount(title);
		if (words > maxAnswerChainTitleWords) {
			issues.push({
				code: 'answer_chain_title_too_long',
				field: 'answerChain.title',
				severity: 'error',
				evidence: `${ref}: ${words} words`
			});
		}
	}
	const canonical = String(chain.canonicalChainText ?? '').trim();
	if (canonical) {
		const links = canonical
			.split(/\s*->\s*/)
			.map((part) => part.trim())
			.filter(Boolean);
		if (!canonical.includes('->') || links.length < 2 || links.length > maxCanonicalChainLinks) {
			issues.push({
				code: 'answer_chain_canonical_not_memory_links',
				field: 'answerChain.canonicalChainText',
				severity: 'error',
				evidence: `${ref}: write 2-${maxCanonicalChainLinks} compact links joined by ->`
			});
		}
		for (const [index, link] of links.entries()) {
			const words = wordCount(link);
			if (words > maxCanonicalChainLinkWords) {
				issues.push({
					code: 'answer_chain_canonical_link_too_long',
					field: 'answerChain.canonicalChainText',
					severity: 'error',
					evidence: `${ref}: link ${index + 1} has ${words} words`
				});
			}
			if (isForbiddenAnswerChainPlaceholder(link)) {
				issues.push({
					code: 'answer_chain_placeholder_label',
					field: 'answerChain.canonicalChainText',
					severity: 'error',
					evidence: `${ref}: "${link}"`
				});
			}
		}
	}
	const summary = String(chain.summary ?? '').trim();
	if (summary) {
		const words = wordCount(summary);
		if (words > maxAnswerChainSummaryWords || summary.length > maxAnswerChainSummaryChars) {
			issues.push({
				code: 'answer_chain_summary_too_long',
				field: 'answerChain.summary',
				severity: 'error',
				evidence: `${ref}: ${words} words, ${summary.length} chars`
			});
		}
	}
	for (const [stepIndex, step] of (chain.steps ?? []).entries()) {
		const stepText = String(step?.stepText ?? '').trim();
		if (!stepText) continue;
		const words = wordCount(stepText);
		if (words > maxAnswerChainStepWords || stepText.length > maxAnswerChainStepChars) {
			issues.push({
				code: 'answer_chain_step_label_too_long',
				field: `answerChain.steps[${stepIndex}].stepText`,
				severity: 'error',
				evidence: `${ref}: ${words} words, ${stepText.length} chars`
			});
		}
		if (isForbiddenAnswerChainPlaceholder(stepText)) {
			issues.push({
				code: 'answer_chain_placeholder_label',
				field: `answerChain.steps[${stepIndex}].stepText`,
				severity: 'error',
				evidence: `${ref}: "${stepText}"`
			});
		}
	}
	return issues;
}

function isForbiddenAnswerChainPlaceholder(text) {
	return forbiddenAnswerChainPlaceholderLabels.some((pattern) => pattern.test(String(text ?? '')));
}

function wordCount(text) {
	return String(text ?? '').match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
}

function duplicateLearnerVisibleBlockText(question) {
	const seen = [];
	for (const block of [
		...(question.stemBlocks ?? []),
		...(question.leadBlocks ?? []),
		...(question.promptBlocks ?? []),
		...(question.afterResponseBlocks ?? [])
	]) {
		const rawText = blockPlainText(block).trim();
		const text = normalizedRenderText(rawText);
		if (text.length < 18) continue;
		for (const previous of seen) {
			if (text === previous.normalized || text.startsWith(`${previous.normalized} `)) {
				return rawText.slice(0, Math.max(rawText.indexOf('.') + 1, 120)).trim();
			}
			if (previous.normalized.startsWith(`${text} `)) {
				return previous.rawText.slice(0, Math.max(previous.rawText.indexOf('.') + 1, 120)).trim();
			}
		}
		seen.push({ normalized: text, rawText });
	}
	return null;
}

function expectedHistoryResponseLineCountsForSource(sourceDocumentId) {
	const paper2SectionACounts = {
		'01.1': 49,
		'02.1': 52,
		'03.1': 52,
		'04.1': 101
	};
	const paper2SectionBCounts = {
		'01.1': 48,
		'02.1': 50,
		'03.1': 49,
		'04.1': 98
	};
	const countsBySource = {
		'aqa-history-2020-june-paper-1-section-a-option-a-america-1840-1895-expansion-and-consolidation-qp':
			{
				'01.1': 22,
				'02.1': 24,
				'03.1': 50,
				'04.1': 25,
				'05.1': 51,
				'06.1': 75
			},
		'aqa-history-2020-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp':
			{
				'01.0': 22,
				'02.0': 23,
				'03.0': 49,
				'04.0': 24,
				'05.0': 49,
				'06.0': 74
			},
		'aqa-history-2020-june-paper-1-section-a-option-c-russia-1894-1945-tsardom-and-communism-qp': {
			'01.1': 22,
			'02.1': 24,
			'03.1': 49,
			'04.1': 22,
			'05.1': 48,
			'06.1': 71
		},
		'aqa-history-2020-june-paper-1-section-a-option-d-america-1920-1973-opportunity-and-inequality-qp':
			{
				'01.1': 22,
				'02.1': 21,
				'03.1': 51,
				'04.1': 22,
				'05.1': 50,
				'06.1': 75
			},
		'aqa-history-2021-june-paper-1-section-a-option-a-america-1840-1895-expansion-and-consolidation-qp':
			{
				'01.1': 22,
				'02.1': 23,
				'03.1': 50,
				'04.1': 23,
				'05.1': 50,
				'06.1': 76
			},
		'aqa-history-2021-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp':
			{
				'01.1': 22,
				'02.1': 24,
				'03.1': 50,
				'04.1': 24,
				'05.1': 51,
				'06.1': 76
			},
		'aqa-history-2021-june-paper-1-section-a-option-c-russia-1894-1945-tsardom-and-communism-qp': {
			'01.0': 22,
			'02.0': 24,
			'03.0': 51,
			'04.0': 23,
			'05.0': 51,
			'06.0': 73
		},
		'aqa-history-2021-june-paper-1-section-a-option-d-america-1920-1973-opportunity-and-inequality-qp':
			{
				'01.1': 21,
				'02.1': 23,
				'03.1': 49,
				'04.1': 23,
				'05.1': 50,
				'06.1': 73
			},
		'aqa-history-2021-june-paper-1-section-b-option-a-conflict-and-tension-the-first-world-war-1894-1918-qp':
			{
				'01.0': 21,
				'02.0': 76,
				'03.0': 51,
				'04.0': 102
			},
		'aqa-history-2021-june-paper-1-section-b-option-b-conflict-and-tension-the-inter-war-years-1918-1939-qp':
			{
				'01.1': 22,
				'02.1': 77,
				'03.1': 52,
				'04.1': 103
			},
		'aqa-history-2021-june-paper-1-section-b-option-c-conflict-and-tension-between-east-and-west-1945-1972-qp':
			{
				'01.0': 22,
				'02.0': 76,
				'03.0': 52,
				'04.0': 102
			},
		'aqa-history-2021-june-paper-1-section-b-option-d-conflict-and-tension-in-asia-1950-1975-qp': {
			'01.0': 22,
			'02.0': 77,
			'03.0': 51,
			'04.0': 103
		},
		'aqa-history-2021-june-paper-2-section-a-option-c-britain-migration-empires-and-the-people-c790-to-the-present-day-qp':
			{
				'01.1': 47,
				'02.1': 48,
				'03.1': 47,
				'04.1': 97
			},
		'aqa-history-2021-june-paper-2-section-b-option-b-medieval-england-the-reign-of-edward-i-1272-1307-qp':
			{
				'01.1': 48,
				'02.1': 51,
				'03.1': 51,
				'04.1': 96
			},
		'aqa-history-2021-june-paper-2-section-b-option-d-restoration-england-1660-1685-qp': {
			'01.1': 48,
			'02.1': 52,
			'03.1': 52,
			'04.1': 97
		},
		'aqa-history-2022-june-paper-1-section-a-option-a-america-1840-1895-expansion-and-consolidation-qp':
			{
				'01.1': 21,
				'02.1': 22,
				'03.1': 49,
				'04.1': 23,
				'05.1': 49,
				'06.1': 71
			},
		'aqa-history-2022-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp':
			{
				'01.1': 21,
				'02.1': 23,
				'03.1': 49,
				'04.1': 24,
				'05.1': 50,
				'06.1': 72
			},
		'aqa-history-2022-june-paper-1-section-a-option-c-russia-1894-1945-tsardom-and-communism-qp': {
			'01.1': 22,
			'02.1': 22,
			'03.1': 46,
			'04.1': 22,
			'05.1': 47,
			'06.1': 70
		},
		'aqa-history-2022-june-paper-1-section-a-option-d-america-1920-1973-opportunity-and-inequality-qp':
			{
				'01.1': 22,
				'02.1': 24,
				'03.1': 48,
				'04.1': 25,
				'05.1': 50,
				'06.1': 74
			},
		'aqa-history-2022-june-paper-1-section-b-option-a-conflict-and-tension-the-first-world-war-1894-1918-qp':
			{
				'01.0': 23,
				'02.0': 74,
				'03.0': 48,
				'04.0': 101
			},
		'aqa-history-2020-june-paper-1-section-b-option-a-conflict-and-tension-the-first-world-war-1894-1918-qp':
			{
				'01.0': 22,
				'02.0': 76,
				'03.0': 51,
				'04.0': 103
			},
		'aqa-history-2020-june-paper-1-section-b-option-b-conflict-and-tension-the-inter-war-years-1918-1939-qp':
			{
				'01.1': 22,
				'02.1': 74,
				'03.1': 50,
				'04.1': 98
			},
		'aqa-history-2020-june-paper-1-section-b-option-c-conflict-and-tension-between-east-and-west-1945-1972-qp':
			{
				'01.1': 22,
				'02.1': 77,
				'03.1': 51,
				'04.1': 103
			},
		'aqa-history-2020-june-paper-1-section-b-option-d-conflict-and-tension-in-asia-1950-1975-qp': {
			'01.0': 22,
			'02.0': 73,
			'03.0': 48,
			'04.0': 101
		},
		'aqa-history-2020-june-paper-1-section-b-option-e-conflict-and-tension-in-the-gulf-and-afghanistan-1990-2009-qp':
			{
				'01.1': 22,
				'02.1': 76,
				'03.1': 50,
				'04.1': 101
			},
		'aqa-history-2020-june-paper-2-section-a-option-a-britain-health-and-the-people-c1000-to-the-present-day-qp':
			paper2SectionACounts,
		'aqa-history-2020-june-paper-2-section-a-option-b-britain-power-and-the-people-c1170-to-the-present-day-qp':
			paper2SectionACounts,
		'aqa-history-2020-june-paper-2-section-a-option-c-britain-migration-empires-and-the-people-c790-to-the-present-day-qp':
			paper2SectionACounts,
		'aqa-history-2020-june-paper-2-section-b-option-a-norman-england-c1066-c1100-qp':
			paper2SectionBCounts,
		'aqa-history-2020-june-paper-2-section-b-option-b-medieval-england-the-reign-of-edward-i-1272-1307-qp':
			paper2SectionBCounts,
		'aqa-history-2020-june-paper-2-section-b-option-c-elizabethan-england-c1568-1603-qp':
			paper2SectionBCounts,
		'aqa-history-2020-june-paper-2-section-b-option-d-restoration-england-1660-1685-qp':
			paper2SectionBCounts
	};
	const counts = countsBySource[sourceDocumentId];
	return counts ? new Map(Object.entries(withQuestionRefSuffixAliases(counts))) : null;
}

function withQuestionRefSuffixAliases(counts) {
	const output = { ...counts };
	for (const [ref, count] of Object.entries(counts)) {
		const match = /^(\d{2})\.(0|1)$/.exec(String(ref));
		if (!match) continue;
		const alternateRef = `${match[1]}.${match[2] === '0' ? '1' : '0'}`;
		if (!(alternateRef in output)) output[alternateRef] = count;
	}
	return output;
}

function expectedResponseLineCountsForSource(sourceDocumentId) {
	const historyCounts = expectedHistoryResponseLineCountsForSource(sourceDocumentId);
	if (historyCounts) return historyCounts;
	if (
		sourceDocumentId ===
		'aqa-history-2024-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp'
	) {
		return new Map(
			Object.entries({
				'01.1': 22,
				'02.1': 24,
				'03.1': 50,
				'04.1': 25,
				'05.1': 51,
				'06.1': 75
			})
		);
	}
	if (
		sourceDocumentId === 'aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp'
	) {
		return new Map(
			Object.entries({
				'01.8': 18,
				'01.9': 12,
				'01.10': 27,
				'02.4': 18,
				'02.9': 28,
				'03.7': 18,
				'04.7': 18,
				'05.7': 18
			})
		);
	}
	if (
		sourceDocumentId === 'aqa-geography-2020-june-paper-1-living-with-the-physical-environment-qp'
	) {
		return new Map(
			Object.entries({
				'01.5': 18,
				'01.12': 27,
				'02.6': 18,
				'02.9': 27,
				'03.6': 18,
				'04.5': 12,
				'04.6': 18,
				'05.5': 12,
				'05.6': 18
			})
		);
	}
	if (
		sourceDocumentId === 'aqa-geography-2020-june-paper-2-challenges-in-the-human-environment-qp'
	) {
		return new Map(
			Object.entries({
				'01.5': 12,
				'02.4': 12,
				'02.9': 4,
				'04.4': 2,
				'05.4': 2,
				'06.4': 2
			})
		);
	}
	if (
		sourceDocumentId === 'aqa-geography-2021-june-paper-1-living-with-the-physical-environment-qp'
	) {
		return new Map(
			Object.entries({
				'01.3': 16,
				'01.11': 27,
				'02.5': 18,
				'02.9': 27,
				'03.5': 12,
				'03.6': 18,
				'04.5': 12,
				'04.6': 18,
				'05.5': 12,
				'05.6': 18
			})
		);
	}
	if (
		sourceDocumentId === 'aqa-geography-2021-june-paper-2-challenges-in-the-human-environment-qp'
	) {
		return new Map(
			Object.entries({
				'01.7': 18,
				'02.6': { fields: { 'Name of country': 1, Answer: 10 } },
				'03.4': 18,
				'04.5': 18,
				'05.5': 18,
				'06.5': 18
			})
		);
	}
	if (sourceDocumentId === 'aqa-geography-2021-june-paper-3-geographical-applications-qp') {
		return new Map(
			Object.entries({
				'01.2': 4,
				'01.3': 18,
				'01.4': 17,
				'02.2': 2,
				'02.3': 18,
				'03.1': 4,
				'03.2': 30,
				'04.3': 4,
				'04.4': 1,
				'04.5': 4,
				'04.8': 4,
				'04.10': 12
			})
		);
	}
	if (sourceDocumentId === 'aqa-geography-2020-june-paper-3-geographical-applications-qp') {
		return new Map(
			Object.entries({
				'01.5': 4,
				'01.3': 12,
				'03.1': 27,
				'05.3': { fields: { 'Title of physical fieldwork enquiry': 2, Assessment: 18 } },
				'05.4': { fields: { 'Title of fieldwork enquiry': 2, Evaluation: 30 } }
			})
		);
	}
	if (
		sourceDocumentId === 'aqa-geography-2022-june-paper-2-challenges-in-the-human-environment-qp'
	) {
		return new Map(
			Object.entries({
				'01.4': 18,
				'01.5': 12,
				'02.5': 18,
				'03.3': 12,
				'03.4': 18
			})
		);
	}
	if (
		sourceDocumentId === 'aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp'
	) {
		return new Map(
			Object.entries({
				'01.4': 12,
				'01.10': 18,
				'01.11': 27,
				'02.9': 18,
				'02.10': { fields: { 'Chosen environment': 2, Answer: 24 } },
				'03.5': 12,
				'03.6': 18,
				'04.5': 12,
				'04.6': 18,
				'05.5': 12,
				'05.6': 18
			})
		);
	}
	if (
		sourceDocumentId ===
		'aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp'
	) {
		return new Map(
			Object.entries({
				'01.5': 20,
				'02.4': 3,
				'02.5': 1,
				'03.1': 2,
				'04.2': 1,
				'06.0': 32,
				'07.0': 20,
				'09.3': 12,
				'11.0': 37,
				12.6: 25,
				12.7: 25,
				'13.0': 12,
				14.1: 3,
				14.2: 40,
				'15.0': 35
			})
		);
	}
	if (computerScience2021Paper2SourceDocumentIds.has(sourceDocumentId)) {
		return new Map(
			Object.entries({
				'01.1': 2,
				'01.2': 5,
				'01.3': 2,
				'01.4': 2,
				'03.0': 2,
				'04.0': 1,
				'05.1': 9,
				'05.2': 4,
				'07.2': 4,
				'10.0': 18,
				'12.0': 6,
				13.1: 4,
				13.3: 4,
				'14.0': 18,
				16.2: 5,
				18.2: 6,
				'20.0': 24
			})
		);
	}
	if (sourceDocumentId === 'aqa-computer-science-2022-june-paper-2-computing-concepts-qp') {
		return new Map(
			Object.entries({
				'01.2': { fields: { Working: 4, 'Hexadecimal =': 1 } },
				'02.3': 2,
				'02.4': 2,
				'03.4': { perField: 2 },
				'04.1': { fields: { 'System software': 3, 'Application software': 3 } },
				'04.2': { perField: 2 },
				'05.0': 23,
				'07.1': 2,
				'07.2': 12,
				'08.0': { perField: 2 },
				'09.1': { perField: 2 },
				'09.2': 4,
				'10.0': 5,
				'12.0': 7,
				13.3: 5,
				14.1: 2,
				14.3: { perField: 2 },
				14.5: 4,
				15.1: { perField: 2 },
				15.2: 4,
				15.3: { perField: 3 },
				16.1: 4,
				16.2: 4,
				17.1: { perField: 2 },
				18.1: 4,
				18.3: 2,
				18.4: 2
			})
		);
	}
	if (computerScience2021Paper1SourceDocumentIds.has(sourceDocumentId)) {
		return new Map(
			Object.entries({
				'02.1': 2,
				'02.2': 2,
				'02.3': 2,
				'03.1': 4,
				'03.2': 4,
				'04.1': 6,
				'04.2': 2,
				'04.3': 6,
				'04.5': 2,
				'05.2': 4,
				'05.3': 17,
				'06.1': 6,
				'06.2': 6,
				'07.6': 18,
				'09.3': 16
			})
		);
	}
	if (sourceDocumentId === 'aqa-computer-science-2024-june-paper-2-computing-concepts-qp') {
		return new Map(
			Object.entries({
				'02.1': 2,
				'02.2': 5,
				'05.3': 7,
				'06.0': 7,
				'07.3': 2,
				'08.1': 15,
				'08.2': 6,
				'09.1': 2,
				'09.2': 10,
				'11.0': 12,
				'12.0': 24,
				13.1: 4,
				13.2: 34,
				'14.0': 6,
				'15.0': 6,
				'16.0': 8,
				'17.0': 10,
				18.1: 4,
				18.2: 6,
				18.3: 4,
				18.6: 6,
				19.1: 4,
				19.2: 14
			})
		);
	}
	if (sourceDocumentId === 'aqa-computer-science-2023-june-paper-2-computing-concepts-qp') {
		// Source-text guardrails for test coverage: "'10.2': 6", "'13.4': 3", "'13.5': 4", "'14.3': 2", "'16.3': 18".
		return new Map(
			Object.entries({
				'02.1': 2,
				'02.2': 5,
				'04.0': 5,
				'06.2': 6,
				'07.2': 8,
				'07.3': 5,
				'08.2': 12,
				10.2: 6,
				13.4: 3,
				13.5: 4,
				14.3: 2,
				14.4: 10,
				'15.0': 18,
				16.3: 18
			})
		);
	}
	if (sourceDocumentId !== 'aqa-84611h-qp-nov20') return new Map();
	return new Map(
		Object.entries({
			'01.2': 4,
			'01.3': 4,
			'01.5': 2,
			'01.6': 2,
			'01.7': 1,
			'01.8': 2,
			'02.1': 4,
			'02.3': 14,
			'02.4': 1,
			'02.5': 6,
			'03.1': 2,
			'03.2': 6,
			'03.3': 5,
			'03.4': 1,
			'03.6': 8,
			'04.2': 7,
			'04.3': 2,
			'04.4': 6,
			'04.5': 4,
			'04.6': 4,
			'04.7': 6,
			'04.8': 2,
			'05.1': 1,
			'05.2': 2,
			'05.3': 1,
			'05.4': 12,
			'05.5': 5,
			'05.6': 5,
			'06.1': 4,
			'06.2': 5,
			'06.3': 5,
			'06.4': 6,
			'06.5': 4,
			'06.6': 2,
			'06.7': 10,
			'07.1': 7,
			'07.2': 4,
			'07.3': 16,
			'07.4': 3
		})
	);
}

function responseVisibleLineCount(response) {
	if (!['lines', 'labeled-lines', 'drawing-box'].includes(response?.kind)) return null;
	if (Array.isArray(response.fields)) {
		const total = response.fields.reduce((sum, field) => sum + Number(field?.lineCount ?? 0), 0);
		return total || null;
	}
	if (Number.isFinite(Number(response.lineCount))) return Number(response.lineCount);
	if (Number.isFinite(Number(response.count))) return Number(response.count);
	return null;
}

function responseLineCountMismatch(response, expected) {
	if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
		if (expected.fields && typeof expected.fields === 'object') {
			const actuals = responseNamedFieldLineCounts(response);
			const missing = [];
			const mismatched = [];
			for (const [label, rawCount] of Object.entries(expected.fields)) {
				const expectedCount = Number(rawCount);
				const actualCount = actuals.get(normalizedFieldLabel(label));
				if (!Number.isFinite(expectedCount)) continue;
				if (actualCount === undefined) {
					missing.push(`${label}=${expectedCount}`);
				} else if (actualCount !== expectedCount) {
					mismatched.push(`${label}: expected ${expectedCount}, found ${actualCount}`);
				}
			}
			if (missing.length || mismatched.length) {
				const actualDescription = actuals.size
					? [...actuals.entries()].map(([label, count]) => `${label}=${count}`).join(', ')
					: 'none';
				return [
					missing.length ? `missing fields ${missing.join(', ')}` : '',
					mismatched.join('; '),
					`actual fields: ${actualDescription}`
				]
					.filter(Boolean)
					.join('; ');
			}
			return null;
		}
		if (Number.isFinite(Number(expected.perField))) {
			const expectedPerField = Number(expected.perField);
			const actuals = responseFieldLineCounts(response);
			if (actuals.length === 0)
				return `expected ${expectedPerField} per labeled field, found missing`;
			const bad = actuals.filter((actual) => actual !== expectedPerField);
			if (bad.length) {
				return `expected ${expectedPerField} per labeled field, found ${actuals.join(', ')}`;
			}
			return null;
		}
		if (Number.isFinite(Number(expected.total))) {
			const actual = responseVisibleLineCount(response);
			const expectedTotal = Number(expected.total);
			return actual === expectedTotal
				? null
				: `expected ${expectedTotal} total visible lines, found ${actual ?? 'missing'}`;
		}
	}
	const actual = responseVisibleLineCount(response);
	return actual === expected ? null : `expected ${expected}, found ${actual ?? 'missing'}`;
}

function responseDiagramSurfaceIssues(question) {
	if (!questionRequiresDiagramResponse(question)) return [];
	const kind = question.response?.kind;
	if (['drawing-box', 'asset-canvas', 'image-label-zones'].includes(kind)) return [];
	return [
		{
			code: 'diagram_response_surface_missing',
			field: 'response.kind',
			severity: 'error',
			evidence: `${question.sourceQuestionRef ?? 'unknown'} -> ${kind ?? 'missing'}`,
			message:
				'The official prompt requires a diagram/drawing/plotting response, but the extracted response control is not diagram-capable. Use drawing-box for blank diagram spaces or asset-canvas/image-label-zones for source-image drawing.'
		}
	];
}

function drawingBoxGridMetadataIssues(question) {
	const response = question.response ?? {};
	if (response.kind !== 'drawing-box') return [];
	const issues = [];
	const grid = response.grid;
	const visibleText = learnerVisibleQuestionText(question);
	const asksForGrid =
		/\b(?:complete|draw|shade|fill|mark|plot)\b[^.\n]{0,120}\b(?:grid|cell|square)\b/i.test(
			visibleText
		) || /\b(?:following|the|this)\s+grid\b/i.test(visibleText);
	if (!grid) {
		if (asksForGrid) {
			issues.push({
				code: 'drawing_grid_metadata_missing',
				field: 'response.grid',
				severity: 'warning',
				evidence: question.sourceQuestionRef,
				message:
					'The prompt appears to ask the learner to complete a printed grid. Add response.grid rows/columns, or use asset-canvas when the answer surface is a source visual.'
			});
		}
		return issues;
	}
	const rows = Number(grid.rows);
	const columns = Number(grid.columns);
	if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) {
		issues.push({
			code: 'drawing_grid_invalid',
			field: 'response.grid',
			severity: 'error',
			evidence: JSON.stringify(grid),
			message: 'drawing-box response.grid must contain positive integer rows and columns.'
		});
		return issues;
	}
	if (
		Array.isArray(response.rowLabels) &&
		response.rowLabels.length > 0 &&
		response.rowLabels.length !== rows
	) {
		issues.push({
			code: 'drawing_grid_row_label_count_mismatch',
			field: 'response.rowLabels',
			severity: 'error',
			evidence: `${response.rowLabels.length} labels for ${rows} rows`,
			message: 'drawing-box rowLabels must match response.grid.rows when supplied.'
		});
	}
	if (
		Array.isArray(response.columnLabels) &&
		response.columnLabels.length > 0 &&
		response.columnLabels.length !== columns
	) {
		issues.push({
			code: 'drawing_grid_column_label_count_mismatch',
			field: 'response.columnLabels',
			severity: 'error',
			evidence: `${response.columnLabels.length} labels for ${columns} columns`,
			message: 'drawing-box columnLabels must match response.grid.columns when supplied.'
		});
	}
	return issues;
}

function contextTextDuplicateBlockIssues(question) {
	const context = normalizedRenderText(question.contextText);
	if (!context) return [];
	const duplicateFields = [];
	for (const field of ['stemBlocks', 'leadBlocks', 'promptBlocks', 'afterResponseBlocks']) {
		for (const [index, block] of (question[field] ?? []).entries()) {
			const text = normalizedRenderText(block?.text);
			if (text.length < 24) continue;
			if (context === text || context.includes(text) || text.includes(context)) {
				duplicateFields.push(`${field}[${index}]`);
			}
		}
	}
	if (!duplicateFields.length) return [];
	return [
		{
			code: 'context_text_duplicates_render_block',
			field: 'contextText/stemBlocks/leadBlocks/promptBlocks/afterResponseBlocks',
			severity: 'error',
			evidence: `${question.sourceQuestionRef ?? 'unknown'} duplicates contextText in ${duplicateFields
				.slice(0, 5)
				.join(', ')}`
		}
	];
}

function questionRequiresDiagramResponse(question) {
	const text = learnerVisibleQuestionText(question);
	const gradingText = [
		...(question.markSchemeItems ?? []).map((item) => item?.text),
		...(question.markChecklist ?? []).map((item) => item?.text),
		question.modelAnswer?.answerText
	]
		.filter(Boolean)
		.join('\n');
	return (
		/\buse\s+one\s+or\s+more\s+diagrams?\b/i.test(text) ||
		/\buse\s+(?:a|an)\s+diagrams?\b/i.test(text) ||
		/\bdraw\s+(?:a|an|one\s+or\s+more)?\s*diagrams?\b/i.test(text) ||
		/\bsketch\s+(?:a|an|one\s+or\s+more)?\s*diagrams?\b/i.test(text) ||
		/\bcomplete\s+(?:the\s+)?(?:graph|diagram|drawing)\b/i.test(text) ||
		/\bplot\b[^.\n]{0,120}\b(?:graph|grid|axis|axes)\b/i.test(text) ||
		/\b(?:graph|grid|axis|axes)\b[^.\n]{0,120}\bplot\b/i.test(text) ||
		/\bmax(?:imum)?\s+(?:lower\s+)?level\s+\d+\s+if\s+diagram\s+is\s+not\s+used\b/i.test(
			gradingText
		)
	);
}

function responseFieldLineCounts(response) {
	if (!['lines', 'labeled-lines'].includes(response?.kind)) return [];
	if (response.kind === 'lines') {
		const count = Number(response.lineCount ?? response.count ?? 0);
		return Number.isFinite(count) && count > 0 ? [count] : [];
	}
	if (Array.isArray(response.fields) && response.fields.length > 0) {
		return response.fields
			.map((field) => Number(field?.lineCount ?? 0))
			.filter((count) => Number.isFinite(count) && count > 0);
	}
	const count = Number(response.lineCount ?? response.count ?? 0);
	if (!Number.isFinite(count) || count <= 0) return [];
	const labelCount =
		Array.isArray(response.labels) && response.labels.length > 0 ? response.labels.length : 1;
	return Array.from({ length: labelCount }, () => count);
}

function responseNamedFieldLineCounts(response) {
	const result = new Map();
	if (response?.kind !== 'labeled-lines') return result;
	if (Array.isArray(response.fields) && response.fields.length > 0) {
		for (const field of response.fields) {
			const label = normalizedFieldLabel(field?.label);
			const count = Number(field?.lineCount ?? 0);
			if (label && Number.isFinite(count) && count > 0) result.set(label, count);
		}
		return result;
	}
	const count = Number(response.lineCount ?? response.count ?? 0);
	if (!Number.isFinite(count) || count <= 0) return result;
	for (const label of response.labels ?? []) {
		const normalized = normalizedFieldLabel(label);
		if (normalized) result.set(normalized, count);
	}
	return result;
}

function normalizedFieldLabel(label) {
	return String(label ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function knownSourceSpecificIssues(question, sourceDocumentId = null) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const issues = [];
	const visibleText = [
		question.contextText,
		question.selfContainedPromptText,
		...(question.stemBlocks ?? []).map(blockSearchText),
		...(question.leadBlocks ?? []).map(blockSearchText),
		...(question.promptBlocks ?? []).map(blockSearchText)
	]
		.filter(Boolean)
		.join('\n')
		.toLowerCase();
	const learnerVisibleBlockText = [
		question.contextText,
		...(question.stemBlocks ?? []).map(blockSearchText),
		...(question.leadBlocks ?? []).map(blockSearchText),
		...(question.promptBlocks ?? []).map(blockSearchText),
		...(question.afterResponseBlocks ?? []).map(blockSearchText)
	]
		.filter(Boolean)
		.join('\n')
		.toLowerCase();
	const gradingText = [
		...(question.markSchemeItems ?? []).map((item) => item.text),
		...(question.markChecklist ?? []).map((item) => item.text)
	]
		.filter(Boolean)
		.join('\n')
		.toLowerCase();
	const modelAnswerText = String(question.modelAnswer?.answerText ?? '').toLowerCase();
	if (
		sourceDocumentId === 'aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp'
	) {
		for (const issue of knownGeography2022Paper1Issues(question, visibleText, gradingText)) {
			issues.push(issue);
		}
		return issues;
	}
	if (
		sourceDocumentId === 'aqa-geography-2022-june-paper-2-challenges-in-the-human-environment-qp'
	) {
		for (const issue of knownGeography2022Paper2Issues(question, visibleText)) {
			issues.push(issue);
		}
		return issues;
	}
	if (
		sourceDocumentId === 'aqa-geography-2020-june-paper-2-challenges-in-the-human-environment-qp'
	) {
		for (const issue of knownGeography2020Paper2Issues(question, learnerVisibleBlockText)) {
			issues.push(issue);
		}
		return issues;
	}
	if (
		sourceDocumentId === 'aqa-geography-2021-june-paper-2-challenges-in-the-human-environment-qp'
	) {
		for (const issue of knownGeography2021Paper2Issues(question, learnerVisibleBlockText)) {
			issues.push(issue);
		}
		return issues;
	}
	if (sourceDocumentId === 'aqa-geography-2022-june-paper-3-geographical-applications-qp') {
		for (const issue of knownGeography2022Paper3Issues(question, visibleText)) {
			issues.push(issue);
		}
		return issues;
	}
	if (
		sourceDocumentId === 'aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp'
	) {
		for (const issue of knownGeography2023Paper1Issues(question)) {
			issues.push(issue);
		}
		return issues;
	}
	if (
		sourceDocumentId === 'aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp'
	) {
		for (const issue of knownGeography2023Paper2Issues(question)) {
			issues.push(issue);
		}
		return issues;
	}
	if (
		sourceDocumentId ===
		'aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp'
	) {
		for (const issue of knownComputerScience2024Paper1AResponseIssues(question, visibleText)) {
			issues.push(issue);
		}
		return issues;
	}
	if (computerScience2021Paper2SourceDocumentIds.has(sourceDocumentId)) {
		for (const issue of knownComputerScience2021Paper2ResponseIssues(question)) {
			issues.push(issue);
		}
		return issues;
	}
	if (computerScience2021Paper1SourceDocumentIds.has(sourceDocumentId)) {
		for (const issue of knownComputerScience2021Paper1ResponseIssues(question, visibleText)) {
			issues.push(issue);
		}
		return issues;
	}
	if (sourceDocumentId === 'aqa-computer-science-2022-june-paper-2-computing-concepts-qp') {
		for (const issue of knownComputerScience2022Paper2ResponseIssues(question)) {
			issues.push(issue);
		}
		return issues;
	}
	if (sourceDocumentId === 'aqa-computer-science-2023-june-paper-2-computing-concepts-qp') {
		for (const issue of knownComputerScience2023Paper2FigureCropIssues(question)) {
			issues.push(issue);
		}
		for (const issue of knownComputerScience2023Paper2ResponseIssues(question)) {
			issues.push(issue);
		}
		for (const issue of knownComputerScience2023Paper2SqlIssues(question)) {
			issues.push(issue);
		}
		return issues;
	}
	if (sourceDocumentId === 'aqa-computer-science-2024-june-paper-2-computing-concepts-qp') {
		if (['04.1', '04.2'].includes(ref)) {
			const figureOneAssets = (question.assets ?? []).filter((asset) =>
				[asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
					.filter(Boolean)
					.some((label) => mediaLabelMatches(label, 'figure 1'))
			);
			if (figureOneAssets.length) {
				issues.push({
					code: 'known_simple_figure_asset_should_be_structural',
					field: 'assets',
					severity: 'error',
					evidence:
						'Q04.1/Q04.2 should render Figure 1 as a structured code block containing 00110011, or prove an exact crop. Do not attach an unchecked Figure 1 screenshot asset.'
				});
			}
		}
		if (ref === '05.4') {
			const hasFigureTwoDependency = (question.assets ?? []).some((asset) =>
				[asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
					.filter(Boolean)
					.some((label) => mediaLabelMatches(label, 'figure 2'))
			);
			if (!hasFigureTwoDependency) {
				issues.push({
					code: 'known_prior_figure_context_missing',
					field: 'assets/stemBlocks',
					severity: 'error',
					evidence:
						'05.4 must carry forward Figure 2 / Image D context as well as Figure 3, because the colour-to-binary mapping depends on the earlier image.'
				});
			}
		}
		if (ref === '05.3') {
			if (
				/(?:8\s*(?:by|x)\s*5|8\s+pixels?\s+by\s+5|2\s+bits?\s+per\s+pixel|colour\s+depth\s+of\s+2|uses\s+three\s+colou?rs)/i.test(
					visibleText
				)
			) {
				issues.push({
					code: 'known_self_contained_answer_leak',
					field: 'contextText/stemBlocks/selfContainedPromptText',
					severity: 'error',
					evidence:
						'05.3 learner-facing context must not give away derived Image D dimensions, colour count, or 2-bit colour depth; provide Figure 2 and preserve the official calculation task.'
				});
			}
		}
		if (ref === '06.0' && /decimal\s+megabytes?|as\s+in\s+the\s+paper/.test(visibleText)) {
			issues.push({
				code: 'known_self_contained_answer_leak',
				field: 'selfContainedPromptText',
				severity: 'error',
				evidence:
					'06.0 learner-facing prompt must not add non-official "decimal megabytes" or "as in the paper" guidance.'
			});
		}
		if (ref === '07.1' && /\bor\s+logic\s+gate\b|\bor\s+gate\b/.test(visibleText)) {
			issues.push({
				code: 'known_self_contained_answer_leak',
				field: 'selfContainedPromptText',
				severity: 'error',
				evidence:
					'07.1 learner-facing text must not name Figure 4 as an OR gate; that reveals the keyed truth-table choice.'
			});
		}
		if (ref === '07.1') {
			const optionText = responseLabels(question.response).join('\n');
			const normalizedOptions = optionText
				.replace(/[|,:;=<>-]+/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()
				.toLowerCase();
			const requiredRows = ['0 0 0', '0 1 0', '1 0 0', '1 1 1', '0 1 1', '1 0 1', '1 1 0'];
			const hasRequiredRows = requiredRows.every((row) => normalizedOptions.includes(row));
			if (!hasRequiredRows || /\b(?:pairs only|as printed|q is|exactly one)\b/i.test(optionText)) {
				issues.push({
					code: 'known_truth_table_options_unfaithful',
					field: 'response.options',
					severity: 'error',
					evidence:
						'07.1 response options must preserve the official visible truth-table rows for A-D, not prose summaries of the gates or table behavior.'
				});
			}
		}
		if (ref === '07.2') {
			const labels = new Set(
				(responseLabels(question.response) ?? []).map((label) => label.trim().toUpperCase())
			);
			const answerLabels = new Set(
				(question.response?.correctAnswers ?? []).map((answer) =>
					String(answer?.correctAnswer ?? '')
						.trim()
						.toUpperCase()
				)
			);
			for (const requiredLabel of ['AND', 'XOR', 'NOT']) {
				if (labels.has(requiredLabel) && answerLabels.has(requiredLabel)) continue;
				issues.push({
					code: 'known_logic_gate_label_bank_mismatch',
					field: 'response.labels',
					severity: 'error',
					evidence:
						'07.2 learner-facing label bank and answer key must both include AND, XOR, and NOT.'
				});
				break;
			}
			if (labels.has('OR') || answerLabels.has('OR')) {
				issues.push({
					code: 'known_logic_gate_label_bank_mismatch',
					field: 'response.correctAnswers',
					severity: 'error',
					evidence:
						'07.2 official mark scheme uses XOR for box Y. OR must not appear as a keyed response option or answer.'
				});
			}
			if (question.needsHumanReview) {
				issues.push({
					code: 'known_unresolved_review_flag',
					field: 'needsHumanReview',
					severity: 'error',
					evidence:
						'07.2 has enough rendered truth-table/circuit and mark-scheme evidence to resolve without a review flag.'
				});
			}
		}
		if (ref === '07.3' && /\ba\s*-\s*bar\b|\ba\s*bar\b/.test(modelAnswerText)) {
			issues.push({
				code: 'known_boolean_not_bar_ambiguous',
				field: 'modelAnswer.answerText',
				severity: 'error',
				evidence:
					'07.3 modelAnswer must use an actual overbar notation such as \\overline{A}, not ambiguous plain text A-bar.'
			});
		}
		if (ref === '07.3' && /\b(?:not|and|or)\s+gate\b/.test(visibleText)) {
			issues.push({
				code: 'known_self_contained_answer_leak',
				field: 'selfContainedPromptText',
				severity: 'error',
				evidence:
					'07.3 learner-facing text must not name the gates in Figure 6; attach/render the circuit and keep the Boolean answer in grading fields.'
			});
		}
		if (ref === '03.0') {
			const positiveItems = (question.markSchemeItems ?? []).filter(isPositiveMarkSchemeItem);
			const hasFirstPart = positiveItems.some(
				(item) => Number(item.marks ?? 1) <= 1 && /\b11010\b/.test(String(item.text ?? ''))
			);
			const hasSecondPart = positiveItems.some(
				(item) => Number(item.marks ?? 1) <= 1 && /\b101\b/.test(String(item.text ?? ''))
			);
			const hasCollapsedTwoMarkItem = positiveItems.some((item) => Number(item.marks ?? 0) > 1);
			if (positiveItems.length < 2 || !hasFirstPart || !hasSecondPart || hasCollapsedTwoMarkItem) {
				issues.push({
					code: 'known_partial_mark_scheme_collapsed',
					field: 'markSchemeItems',
					severity: 'error',
					evidence:
						'03.0 official mark scheme credits 11010 and 101 as separate 1-mark parts; do not collapse them into one 2-mark binary answer row.'
				});
			}
			if (!/\b11010101\b/.test(modelAnswerText) || /\b10111010\b/.test(modelAnswerText)) {
				issues.push({
					code: 'known_model_answer_mismatch',
					field: 'modelAnswer.answerText',
					severity: 'error',
					evidence:
						'03.0 complete model answer must be 11010101; the official 11010 and 101 mark fragments combine in that order.'
				});
			}
		}
		if (ref === '09.1') {
			const positiveItems = (question.markSchemeItems ?? []).filter(isPositiveMarkSchemeItem);
			const hasA = positiveItems.some(
				(item) => Number(item.marks ?? 1) <= 1 && /^A\b/i.test(String(item.text ?? '').trim())
			);
			const hasDded = positiveItems.some(
				(item) => Number(item.marks ?? 1) <= 1 && /\bDDED\b/.test(String(item.text ?? ''))
			);
			const hasCollapsedTwoMarkItem = positiveItems.some((item) => Number(item.marks ?? 0) > 1);
			if (positiveItems.length < 2 || !hasA || !hasDded || hasCollapsedTwoMarkItem) {
				issues.push({
					code: 'known_partial_mark_scheme_collapsed',
					field: 'markSchemeItems',
					severity: 'error',
					evidence:
						'09.1 official mark scheme credits A and DDED as separate 1-mark parts; do not collapse them into one 2-mark decoded-string row.'
				});
			}
		}
		if (ref === '13.2') {
			const hasLevelBands =
				/(?:5\s*[-–]\s*6|5\s+to\s+6)/.test(gradingText) &&
				/(?:3\s*[-–]\s*4|3\s+to\s+4)/.test(gradingText) &&
				/(?:1\s*[-–]\s*2|1\s+to\s+2)/.test(gradingText);
			if (!hasLevelBands) {
				issues.push({
					code: 'known_level_response_descriptors_missing',
					field: 'markSchemeItems',
					severity: 'error',
					evidence:
						'13.2 must preserve the official level mark bands as ranges 5-6, 3-4, and 1-2, not only representative 6/4/2 rows.'
				});
			}
		}
		if (ref === '18.7' && /insert\s+into\s*\(\s*\)/.test(visibleText)) {
			issues.push({
				code: 'known_sql_skeleton_labels_missing',
				field: 'stemBlocks/promptBlocks/response.fields',
				severity: 'error',
				evidence:
					'18.7 must preserve the learner-visible SQL skeleton with official A/B/C label positions; a flattened INSERT INTO ( ) sentence is insufficient.'
			});
		}
		for (const issue of knownComputerScience2024Paper2SqlAssetIssues(question)) issues.push(issue);
		for (const issue of knownComputerScience2024Paper2FigureCropIssues(question))
			issues.push(issue);
		return issues;
	}
	if (['06.5', '06.6'].includes(ref)) {
		const hasSurveyContext =
			/15\s*year|over\s+15\s+years/.test(visibleText) &&
			(/400\s*000/.test(visibleText) ||
				/800\s*000/.test(visibleText) ||
				/million women/.test(visibleText));
		if (!hasSurveyContext) {
			issues.push({
				code: 'known_survey_context_missing',
				field: 'stemBlocks/contextText',
				severity: 'error',
				evidence: `${ref} must include the Million Women survey setup, duration, cohort size, and controlled-factor context.`
			});
		}
	}
	if (ref === '01.1') {
		const standaloneText = String(question.selfContainedPromptText ?? '').toLowerCase();
		if (
			standaloneText.includes('carbon dioxide') &&
			standaloneText.includes('water') &&
			standaloneText.includes('glucose')
		) {
			issues.push({
				code: 'known_self_contained_answer_leak',
				field: 'selfContainedPromptText',
				severity: 'error',
				evidence:
					'01.1 selfContainedPromptText must not include the completed photosynthesis equation answers.'
			});
		}
	}
	if (ref === '01.9') {
		if (
			!/\b3\s+or\s+4\b/.test(gradingText) ||
			!/all\s+(?:plotted\s+)?(?:mean\s+)?points/.test(gradingText)
		) {
			issues.push({
				code: 'known_graph_plotting_mark_scheme_mismatch',
				field: 'markSchemeItems',
				severity: 'error',
				evidence:
					'01.9 must encode 2 marks for all points plotted correctly and 1 mark for 3 or 4 correct plots.'
			});
		}
	}
	if (['01.3', '01.9'].includes(ref)) {
		const hasRateUnit =
			/rate\s+of\s+photosynthesis/.test(visibleText) &&
			/cm\s*(?:3|\u00b3)\s*\/\s*hour/.test(visibleText);
		if (!hasRateUnit) {
			issues.push({
				code: 'known_table_unit_missing',
				field: 'stemBlocks/contextText',
				severity: 'error',
				evidence: `${ref} must render Table 1 with the official rate header/unit: Rate of photosynthesis in cm3/hour.`
			});
		}
	}
	if (ref === '01.3') {
		const responseText = stringifyBlockValue(question.response).toLowerCase();
		if (!/cm\s*(?:3|\u00b3)\s*\/\s*hour/.test(responseText)) {
			issues.push({
				code: 'known_response_unit_missing',
				field: 'response.labels',
				severity: 'error',
				evidence: '01.3 response must expose the printed final-answer unit: X = ... cm3/hour.'
			});
		}
	}
	if (['02.3', '06.7', '07.3'].includes(ref)) {
		if (!/\blevel\s*1\b/.test(gradingText) || !/\blevel\s*2\b/.test(gradingText)) {
			issues.push({
				code: 'known_level_response_descriptors_missing',
				field: 'markSchemeItems',
				severity: 'error',
				evidence: `${ref} must include official level-of-response descriptors and mark bands, not only indicative content rows.`
			});
		}
	}
	for (const issue of knownFigureCropIssues(question)) issues.push(issue);
	return issues;
}

function knownGeography2020Paper2Issues(question, learnerVisibleBlockText = '') {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const issues = [];
	if (ref === '01.2') {
		const answerText = rawCorrectAnswerEntries(question.response?.correctAnswers)
			.map((answer) => `${answer.targetId ?? ''} ${answer.correctAnswer ?? ''}`)
			.join('\n')
			.toLowerCase();
		const keysChina2050 = /\bchina\b[\s\S]{0,80}\b2050\b[\s\S]{0,80}\b80\b/.test(answerText);
		const keysIndia2019 = /\bindia\b[\s\S]{0,80}\b2019\b[\s\S]{0,80}\b35\b/.test(answerText);
		const wronglyKeysIndia2050 = /\bindia\b[\s\S]{0,80}\b2050\b/.test(answerText);
		const wronglyKeysNigeria2050 = /\bnigeria\b[\s\S]{0,80}\b2050\b/.test(answerText);
		if (!keysChina2050 || !keysIndia2019 || wronglyKeysIndia2050 || wronglyKeysNigeria2050) {
			issues.push({
				code: 'known_graph_completion_answer_key_mismatch',
				field: 'response.correctAnswers',
				severity: 'error',
				evidence:
					'Geography 2020 Paper 2 Q01.2 must key the missing Figure 1 bars as China 2050 = 80 and India 2019 = 35; India 2050 and Nigeria 2050 are already visible and must not be keyed as missing.'
			});
		}
	}
	if (ref === '04.1') {
		const answers = rawCorrectAnswerEntries(question.response?.correctAnswers);
		const centralAfricanRepublic = answers.find((answer) =>
			/central[- ]african[- ]republic/i.test(String(answer?.targetId ?? ''))
		);
		const canonical = String(centralAfricanRepublic?.correctAnswer ?? '')
			.trim()
			.toLowerCase();
		if (canonical !== '25 or more') {
			issues.push({
				code: 'known_range_category_answer_split',
				field: 'response.correctAnswers',
				severity: 'error',
				evidence:
					'Geography 2020 Paper 2 Q04.1 must key Central African Republic as the complete category "25 or more"; do not split this into correctAnswer "25" with alias "more".'
			});
		}
	}
	if (['02.6', '02.7'].includes(ref)) {
		const requiredFigureSevenB = [
			/tourism\s+helps\s+develop\s+infrastructure\s+in\s+the\s+country/i,
			/tourism\s+brings\s+much\s+needed\s+foreign\s+currency/i,
			/i\s+can\s+only\s+get\s+work\s+as\s+a\s+driver\s+or\s+waiter/i
		];
		if (!requiredFigureSevenB.every((pattern) => pattern.test(learnerVisibleBlockText))) {
			issues.push({
				code: 'known_figure_7b_source_evidence_missing',
				field: 'stemBlocks/promptBlocks/leadBlocks/afterResponseBlocks',
				severity: 'error',
				evidence:
					'Geography 2020 Paper 2 Q02.6-Q02.7 must render or transcribe Figure 7b opinion evidence, including the infrastructure, foreign-currency, and local-resident employment bubbles.'
			});
		}
	}
	const requiredVisibleData = {
		'04.1': [
			/egypt[\s\S]{0,80}less\s+than\s+5/i,
			/central\s+african\s+republic[\s\S]{0,80}25\s+or\s+more/i
		],
		'05.1': [
			/niger[\s\S]{0,80}more\s+than\s+2000/i,
			/central\s+african\s+republic[\s\S]{0,80}1001\s*[-\u2013]\s*1384/i
		],
		'06.1': [
			/libya[\s\S]{0,80}50\s*[-\u2013]\s*74\.99/i,
			/central\s+african\s+republic[\s\S]{0,80}25\s*[-\u2013]\s*49\.99/i
		]
	};
	const required = requiredVisibleData[ref];
	if (required && !required.every((pattern) => pattern.test(learnerVisibleBlockText))) {
		issues.push({
			code: 'known_map_completion_source_data_missing',
			field: 'stemBlocks/promptBlocks/leadBlocks/afterResponseBlocks',
			severity: 'error',
			evidence: `Geography 2020 Paper 2 ${ref} must show the official completion data table in learner-visible blocks, not only in selfContainedPromptText or response.correctAnswers.`
		});
	}
	return issues;
}

function knownGeography2021Paper2Issues(question, learnerVisibleBlockText = '') {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const issues = [];
	if (!['02.7', '02.8', '02.9'].includes(ref)) return issues;
	const hasFigureEightAsset = (question.assets ?? []).some((asset) =>
		[
			asset.sourceLabel,
			asset.assetLabel,
			asset.label,
			asset.assetId,
			asset.description,
			asset.filePath
		]
			.filter(Boolean)
			.some(
				(label) => mediaLabelMatches(label, 'figure 8') || /figure[-_ ]?08/i.test(String(label))
			)
	);
	const hasFullAshaText =
		/\basha\s+is\s+a\s+charity\b/i.test(learnerVisibleBlockText) &&
		/\bresource\s+centres\b/i.test(learnerVisibleBlockText) &&
		/\benglish\s+classes\b/i.test(learnerVisibleBlockText);
	if (hasFigureEightAsset && hasFullAshaText) {
		issues.push({
			code: 'known_duplicate_figure_8_visible_source',
			field: 'stemBlocks/assets',
			severity: 'error',
			evidence:
				'Geography 2021 Paper 2 Q02.7-Q02.9 must render Figure 8 once only: keep the readable asset or the transcribed Asha source text, not both.'
		});
	}
	return issues;
}

function knownGeography2022Paper2Issues(question, visibleText) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const issues = [];
	if (ref === '01.10') {
		const spagItems = (question.markSchemeItems ?? []).filter((item) =>
			/\b(?:spag|spelling|punctuation|grammar|specialist\s+terms?)\b/i.test(
				String(item?.text ?? '')
			)
		);
		const hasHigh = spagItems.some(
			(item) => Number(item?.marks) === 3 && /\bhigh\b/i.test(String(item?.text ?? ''))
		);
		const hasIntermediate = spagItems.some(
			(item) => Number(item?.marks) === 2 && /\bintermediate\b/i.test(String(item?.text ?? ''))
		);
		const hasThreshold = spagItems.some(
			(item) => Number(item?.marks) === 1 && /\bthreshold\b/i.test(String(item?.text ?? ''))
		);
		if (!hasHigh || !hasIntermediate || !hasThreshold) {
			issues.push({
				code: 'known_spag_rubric_incomplete',
				field: 'markSchemeItems',
				severity: 'error',
				evidence:
					'Geography 2022 Paper 2 Q01.10 must include distinct SPaG rows: High 3, Intermediate 2, and Threshold 1. Do not merge intermediate and threshold into a single 2-mark row.'
			});
		}
	}
	if (ref === '03.1') {
		const hasFigureTenAsset = (question.assets ?? []).some((asset) =>
			[asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
				.filter(Boolean)
				.some((label) => mediaLabelMatches(label, 'figure 10'))
		);
		if (!hasFigureTenAsset) {
			issues.push({
				code: 'known_unresolved_copyright_source',
				field: 'stemBlocks/assets/needsHumanReview',
				severity: 'error',
				evidence:
					'Geography 2022 Paper 2 Q03.1 depends on Figure 10, which is withheld in the public question paper. Do not replace it with a structured substitute from mark-scheme answer-key evidence; without a real renderable Figure 10 asset from an official supporting source, this row must remain blocked or be held out of the publishable extraction.'
			});
		}
	}
	return issues;
}

function knownGeography2022Paper3Issues(question, visibleText) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	if (ref !== '04.2') return [];
	const rows = [
		...(question.stemBlocks ?? []),
		...(question.leadBlocks ?? []),
		...(question.promptBlocks ?? [])
	].flatMap((block) => (Array.isArray(block?.rows) ? block.rows : []));
	function scoreFor(labelPattern) {
		for (const row of rows) {
			const cells = (Array.isArray(row) ? row : [])
				.map((cell) => stringifyBlockValue(cell).replace(/\s+/g, ' ').trim())
				.filter(Boolean);
			if (!cells.length || !labelPattern.test(cells[0])) continue;
			return cells.slice(1).join(' ');
		}
		return '';
	}
	const requiredValues = [
		{
			label: 'Noisy',
			score: scoreFor(/\bnoisy\b/i),
			matches: /^[-−]\s*1\b/
		},
		{
			label: 'Lots of traffic',
			score: scoreFor(/\blots\s+of\s+traffic\b/i),
			matches: /^[-−]\s*2\b/
		},
		{
			label: 'Unattractive',
			score: scoreFor(/\bunattractive\b/i),
			matches: /^0\b/
		},
		{
			label: 'Lots of litter',
			score: scoreFor(/\blots\s+of\s+litter\b/i),
			matches: /^[-−]\s*2\b/
		},
		{
			label: 'Crowded',
			score: scoreFor(/\bcrowded\b/i),
			matches: /^[-−]\s*1\b/
		}
	];
	const missing = requiredValues
		.filter((requirement) => !requirement.matches.test(requirement.score))
		.map((requirement) => requirement.label);
	if (!missing.length) return [];
	return [
		{
			code: 'known_source_table_value_mismatch',
			field: 'stemBlocks',
			severity: 'error',
			evidence: `Geography 2022 Paper 3 Q04.2 Figure 4 environmental quality values are wrong or missing for: ${missing.join(
				', '
			)}. Required values are Noisy=-1, Lots of traffic=-2, Unattractive=0, Lots of litter=-2, Crowded=-1.`
		}
	];
}

function knownGeography2023Paper1Issues(question) {
	const issues = knownAssetDimensionIssues(
		question,
		new Map([
			[
				'01.2',
				{
					label: 'figure 1',
					minWidth: 900,
					minHeight: 820,
					evidence:
						'Figure 1 must include the complete Arctic sea-ice graph, including the lower graph area, x-axis/year labels, y-axis scale, and graph bottom.'
				}
			],
			[
				'01.3',
				{
					label: 'figure 1',
					minWidth: 900,
					minHeight: 820,
					evidence:
						'Q01.3 is not answerable unless Figure 1 includes the complete graph bottom and axes needed to read 1980 and 2016 values.'
				}
			],
			[
				'01.8',
				{
					label: 'figure 4',
					minWidth: 1250,
					minHeight: 1700,
					evidence:
						'Figure 4 must include the world map/key and the complete tropical storm deaths table, including the final Stan row, so the median can be calculated from all listed storms.'
				}
			],
			[
				'02.5',
				{
					label: 'figure 8',
					minWidth: 1200,
					minHeight: 560,
					maxHeight: 780,
					forbiddenOcrTerms: ['Study Figure 8', 'describe the distribution'],
					evidence:
						'Figure 8 must be a clean map-only crop with map/title/key evidence, without Q02.4 answer lines or duplicated Q02.5 setup/prompt text.'
				}
			],
			[
				'02.6',
				{
					label: 'figure 9',
					minWidth: 1200,
					minHeight: 620,
					maxHeight: 840,
					forbiddenOcrTerms: ['Using Figure 9', 'what percentage', 'Shade one circle only'],
					evidence:
						'Figure 9 must be a clean nutrient-cycle diagram crop, without the Q02.6 prompt or response-control instruction below it.'
				}
			],
			[
				'03.3',
				{
					label: 'figure 11',
					minWidth: 820,
					minHeight: 1050,
					evidence:
						'Figure 11 OS map must include both X and Y markers, full 39-41/71-74 grid labels, scale bar, and north arrow.'
				}
			],
			[
				'03.4',
				{
					label: 'figure 11',
					minWidth: 820,
					minHeight: 1050,
					evidence:
						'Figure 11 OS map must include both X and Y markers, full 39-41/71-74 grid labels, scale bar, and north arrow.'
				}
			],
			[
				'04.6',
				{
					label: 'figure 16',
					minWidth: 900,
					minHeight: 330,
					maxHeight: 620,
					forbiddenOcrTerms: ['Discuss the issues', 'flood management schemes'],
					evidence:
						'Figure 16 must be a clean source-box crop that stops before the Q04.6 prompt text.'
				}
			],
			[
				'05.3',
				{
					label: 'figure 17',
					minWidth: 1200,
					minHeight: 1050,
					evidence:
						'Figure 17 OS map must include both X and Y markers, full 63-67/59-61 grid labels, scale bar, and north arrow.'
				}
			],
			[
				'05.4',
				{
					label: 'figure 17',
					minWidth: 1200,
					minHeight: 1050,
					evidence:
						'Figure 17 OS map must include both X and Y markers, full 63-67/59-61 grid labels, scale bar, and north arrow.'
				}
			]
		])
	);
	const ref = question.sourceQuestionRef ?? 'unknown';
	if (ref === '02.1' || ref === '02.3') {
		const potentiallyVisiblePrompt = [
			question.selfContainedPromptText,
			...(question.stemBlocks ?? []).map(blockSearchText),
			...(question.leadBlocks ?? []).map(blockSearchText),
			...(question.promptBlocks ?? []).map(blockSearchText)
		]
			.filter(Boolean)
			.join('\n');
		if (!/\blarge\s+water\s+plant\b/i.test(potentiallyVisiblePrompt)) {
			issues.push({
				code: 'known_source_label_mismatch',
				field: 'selfContainedPromptText/stemBlocks/promptBlocks',
				severity: 'error',
				evidence:
					'Geography 2023 Paper 1 Figure 7 substitutes must preserve the exact official organism label "Large water plant"; do not shorten it to "water plant".'
			});
		}
		const explicitProducerLeakPatterns = [
			/\blarge\s+water\s+plant\b[^.\n;]{0,80}\b(?:is|as|=|:)\s*(?:the\s+)?producer\b/i,
			/\bproducer\b[^.\n;]{0,80}\b(?:is|=|:)\s*(?:the\s+)?large\s+water\s+plant\b/i,
			/\blarge\s+water\s+plant\b[^.\n;]{0,100}\b(?:base\s+of\s+the\s+food\s+web|lowest\s+trophic|photosynthesi[sz]es|makes\s+its\s+own\s+food)\b/i
		];
		if (explicitProducerLeakPatterns.some((pattern) => pattern.test(potentiallyVisiblePrompt))) {
			issues.push({
				code: 'known_self_contained_answer_leak',
				field: 'selfContainedPromptText/stemBlocks/promptBlocks',
				severity: 'error',
				evidence:
					'Geography 2023 Paper 1 Q02.1 asks the learner to identify a producer from Figure 7. Learner-visible/self-contained wording may show organism names and feeding links, but must not label Large water plant as the producer before the learner answers.'
			});
		}
	}
	if (ref === '01.10') {
		const figureFiveAssets = (question.assets ?? []).filter((asset) =>
			[asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
				.filter(Boolean)
				.some((label) => mediaLabelMatches(label, 'figure 5'))
		);
		const completeSingleAsset = figureFiveAssets.some((asset) => {
			const dimensions = imageDimensionsForAsset(asset);
			return dimensions && dimensions.width >= 900 && dimensions.height >= 1200;
		});
		if (figureFiveAssets.length === 1 && !completeSingleAsset) {
			const dimensions = imageDimensionsForAsset(figureFiveAssets[0]);
			issues.push({
				code: 'known_figure_crop_incomplete',
				field: 'assets.filePath',
				severity: 'error',
				evidence: `01.10 Figure 5 must include both the cyclone shelter photograph and Cyclone Amphan track map/key, or use separate Figure 5 photograph/map assets. Found one Figure 5 asset${
					dimensions ? ` sized ${dimensions.width}x${dimensions.height}` : ''
				}.`
			});
		}
	}
	return issues;
}

function knownGeography2023Paper2Issues(question) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const issues = [];
	if (ref === '01.3') {
		const evidence = learnerVisibleEvidenceForFigure(question, 'figure 2');
		if (!hasFigure2CrimeGraphScale(evidence)) {
			issues.push({
				code: 'known_graph_scale_missing',
				field: 'stemBlocks/assets.filePath',
				severity: 'error',
				evidence:
					'Geography 2023 Paper 2 Q01.3 requires learner-visible Figure 2 graph scale evidence: the complete graph crop or structured source evidence must show the x-axis numerical scale including 0, 100, 1000 and the "Number of reports" axis title. A bar/grid-only crop is not solvable for placing the 350-report bar.'
			});
		}
	}
	if (ref === '02.3') {
		const evidence = learnerVisibleEvidenceForFigure(question, 'figure 6');
		if (!hasFigure6ScienceParkSource(question, evidence)) {
			issues.push({
				code: 'known_figure6_visual_source_missing',
				field: 'stemBlocks/assets.filePath',
				severity: 'error',
				evidence:
					'Geography 2023 Paper 2 Q02.3 requires learner-visible Figure 6 as a complete source with the official text plus the three Southampton Science Park photographs. A text-only extraction is not enough because the learner needs the construction/road, shuttle/building, and aerial site/green-setting evidence.'
			});
		}
	}
	if (ref === '02.4') {
		const evidence = learnerVisibleEvidenceForFigure(question, 'figure 7');
		if (!hasFigure7BirthRateKey(evidence)) {
			issues.push({
				code: 'known_figure_key_text_missing',
				field: 'stemBlocks/assets.filePath',
				severity: 'error',
				evidence:
					'Geography 2023 Paper 2 Q02.4 requires the learner-visible Figure 7 key/category mapping for birth rates, including the 11.47 or more category needed to shade Iceland for 12.3. Do not rely on selfContainedPromptText only.'
			});
		}
	}
	if (ref === '04.5') {
		const evidence = learnerVisibleEvidenceForFigure(question, 'figure 13');
		if (
			requiredEvidenceTermsMissing(evidence, [
				/\bzai\b/i,
				/\bcompost\b/i,
				/\btermite/i,
				/\b500\b|five\s+hundred/i
			]).length
		) {
			issues.push({
				code: 'known_source_information_missing',
				field: 'stemBlocks/assets.filePath',
				severity: 'error',
				evidence:
					'Geography 2023 Paper 2 Q04.5 requires learner-visible Figure 13 information about Zai holes, compost/manure, termites, and yields increasing by up to 500%; a photograph-only crop plus selfContainedPromptText is not enough.'
			});
		}
	}
	return issues;
}

function learnerVisibleEvidenceForFigure(question, label) {
	const blockText = [
		question.contextText,
		...(question.stemBlocks ?? []).map(blockSearchText),
		...(question.leadBlocks ?? []).map(blockSearchText),
		...(question.promptBlocks ?? []).map(blockSearchText),
		...(question.afterResponseBlocks ?? []).map(blockSearchText)
	]
		.filter(Boolean)
		.join('\n');
	const ocrText = (question.assets ?? [])
		.filter((asset) =>
			[asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
				.filter(Boolean)
				.some((candidate) => mediaLabelMatches(candidate, label))
		)
		.map((asset) => imageOcrTextForAsset(asset))
		.filter(Boolean)
		.join('\n');
	return `${blockText}\n${ocrText}`;
}

function hasFigure2CrimeGraphScale(evidence) {
	const text = normalizedRenderText(evidence);
	return (
		/\bnumber\s+of\s+reports\b/.test(text) &&
		/\b0\b/.test(text) &&
		/\b100\b/.test(text) &&
		/\b1000\b/.test(text)
	);
}

function hasFigure6ScienceParkSource(question, evidence) {
	const text = normalizedRenderText(evidence);
	const hasTextSource =
		/\b72\s+acres\b/.test(text) &&
		/\bgreen\s+space\b/.test(text) &&
		/\b27\s+acres\b/.test(text) &&
		/\bconservation\b/.test(text) &&
		/\benergy\s+efficient\b/.test(text);
	const hasRenderableFigure = (question.assets ?? []).some(
		(asset) =>
			[asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
				.filter(Boolean)
				.some((candidate) => mediaLabelMatches(candidate, 'figure 6')) &&
			assetHasRenderableSource(asset)
	);
	const hasStructuredPhotoEvidence =
		/\b(?:construction|tree[- ]?removal|road)\b/.test(text) &&
		/\b(?:bus|shuttle|public\s+transport)\b/.test(text) &&
		/\b(?:aerial|car\s+park|parking|green\s+setting|site)\b/.test(text);
	return hasTextSource && (hasRenderableFigure || hasStructuredPhotoEvidence);
}

function hasFigure7BirthRateKey(evidence) {
	const text = normalizedRenderText(evidence);
	return /11\s*47/.test(text) && /\bmore\b/.test(text);
}

function requiredEvidenceTermsMissing(evidence, patterns) {
	return patterns.filter((pattern) => !pattern.test(String(evidence ?? '')));
}

function knownGeography2022Paper1Issues(question, visibleText, gradingText) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const issues = [];
	if (ref === '01.10') {
		const marks = Number(question.marks ?? 0);
		if (marks !== 12) {
			issues.push({
				code: 'known_spag_marks_missing_from_total',
				field: 'marks',
				severity: 'error',
				evidence:
					'Geography 2022 Paper 1 Q01.10 is 12 marks total: 9 content marks plus the separate printed +3 SPaG marks.'
			});
		}
		const positiveItems = (question.markSchemeItems ?? []).filter(isPositiveMarkSchemeItem);
		const hasSpagText =
			/\bspag\b/.test(gradingText) ||
			/spelling[\s\S]{0,80}punctuation[\s\S]{0,80}grammar/.test(gradingText) ||
			/specialist terminology/.test(gradingText);
		const hasPositiveSpagMarks = positiveItems.some((item) => {
			const text = String(item.text ?? '').toLowerCase();
			const itemMarks = Number(item.marks ?? 0);
			return (
				itemMarks > 0 &&
				(/\bspag\b/.test(text) ||
					/spelling[\s\S]{0,80}punctuation[\s\S]{0,80}grammar/.test(text) ||
					/specialist terminology/.test(text))
			);
		});
		if (!hasSpagText || !hasPositiveSpagMarks) {
			issues.push({
				code: 'known_spag_positive_rubric_missing',
				field: 'markSchemeItems',
				severity: 'error',
				evidence:
					'Q01.10 must include the official separate 3-mark SPaG rubric as positive grading evidence, not only zero-mark guidance.'
			});
		}
		if (!hasGeography2022Q0110NamedExample(question)) {
			issues.push({
				code: 'known_model_answer_named_example_missing',
				field: 'modelAnswer.answerText',
				severity: 'error',
				evidence:
					"Q01.10 asks for named tectonic hazard example(s), and the mark scheme caps answers without named examples. The model answer must include a named tectonic hazard/place example such as L'Aquila 2009, Nepal/Gorkha 2015, Haiti 2010, Tohoku/Japan 2011, Nyiragongo 2002, or Iceland 2010."
			});
		}
	}
	if (ref === '02.3') {
		const expectedOptionB =
			'B The trees drop their dead leaves because of lower temperatures in winter.';
		const expectedWithoutLabel =
			'The trees drop their dead leaves because of lower temperatures in winter.';
		const markSchemeWording =
			'The trees drop their leaves because of lower temperatures in winter.';
		const optionB = responseLabels(question.response).find((option) =>
			/^B\b/i.test(String(option).trim())
		);
		const optionBText = String(optionB ?? '');
		const optionBMatches =
			!optionB ||
			normalizedRenderText(optionBText) === normalizedRenderText(expectedOptionB) ||
			normalizedRenderText(optionBText) === normalizedRenderText(expectedWithoutLabel);
		const correctAnswerTexts = rawCorrectAnswerEntries(question.response?.correctAnswers).map(
			(answer) => String(answer.correctAnswer ?? '')
		);
		const correctAnswerMatches = correctAnswerTexts.some((text) => {
			const normalized = normalizedRenderText(text);
			return (
				normalized === normalizedRenderText(expectedOptionB) ||
				normalized === normalizedRenderText(expectedWithoutLabel) ||
				normalized === normalizedRenderText(`B ${markSchemeWording}`) ||
				normalized === normalizedRenderText(markSchemeWording) ||
				normalized === 'b'
			);
		});
		if (!optionBMatches || !correctAnswerMatches) {
			issues.push({
				code: 'known_fixed_response_option_not_verbatim',
				field: optionBMatches ? 'response.correctAnswers' : 'response.options',
				severity: 'error',
				evidence:
					'Q02.3 option B must preserve the question-paper wording exactly: "B The trees drop their dead leaves because of lower temperatures in winter." The mark scheme may omit "dead" in grading evidence.'
			});
		}
	}
	issues.push(...knownGeography2022Paper1FigureIssues(question, visibleText));
	return issues;
}

function hasGeography2022Q0110NamedExample(question) {
	const modelAnswerText = normalizedRenderText(question.modelAnswer?.answerText ?? '');
	return [
		/\bl['’]?aquila\b/i,
		/\bitaly\b/i,
		/\bhaiti\b/i,
		/\bchristchurch\b/i,
		/\btohoku\b/i,
		/\bjapan\b/i,
		/\bnepal\b/i,
		/\bgorkha\b/i,
		/\bboxing day\b/i,
		/\bnyiragongo\b/i,
		/\bcongo\b/i,
		/\beyjafjallajokull\b/i,
		/\biceland\b/i
	].some((pattern) => pattern.test(modelAnswerText));
}

function knownGeography2022Paper1FigureIssues(question, visibleText) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const requirements = geography2022Paper1FigureRequirements(ref);
	const issues = [];
	for (const requirement of requirements) {
		const matchingAssets = (question.assets ?? []).filter((asset) =>
			assetMatchesFigureRequirement(asset, requirement, question)
		);
		for (const asset of matchingAssets) {
			const dimensions = imageDimensionsForAsset(asset);
			if (!dimensions) continue;
			if (dimensions.width >= requirement.minWidth && dimensions.height >= requirement.minHeight) {
				const ocrText = imageOcrTextForAsset(asset);
				if (requirement.requiredOcrTerms) {
					if (ocrText && includesAllOcrTerms(ocrText, requirement.requiredOcrTerms)) {
						// Continue to the forbidden-text check below.
					} else {
						issues.push({
							code: 'known_figure_key_text_missing',
							field: 'assets.filePath',
							severity: 'error',
							evidence: `${ref} ${asset.sourceLabel ?? requirement.label}: ${requirement.evidence} OCR did not find required visible key text: ${requirement.requiredOcrTerms.join(', ')}.`
						});
						continue;
					}
				}
				if (requirement.forbiddenOcrTerms && ocrText) {
					const forbidden = matchingOcrTerms(ocrText, requirement.forbiddenOcrTerms);
					if (forbidden.length) {
						issues.push({
							code: 'known_figure_crop_duplicate_prompt_text',
							field: 'assets.filePath',
							severity: 'error',
							evidence: `${ref} ${asset.sourceLabel ?? requirement.label}: ${requirement.evidence} Crop OCR contains duplicated prompt/setup text that should be rendered separately: ${forbidden.join(', ')}.`
						});
					}
				}
				continue;
			}
			issues.push({
				code: 'known_figure_crop_incomplete',
				field: 'assets.filePath',
				severity: 'error',
				evidence: `${ref} ${asset.sourceLabel ?? requirement.label}: ${requirement.evidence} Found ${dimensions.width}x${dimensions.height}; expected at least ${requirement.minWidth}x${requirement.minHeight}, or split/structured assets that fully render the required learner-visible surface.`
			});
		}
	}
	if (ref === '02.9') {
		issues.push(...knownGeography2022Paper1Figure9And10DuplicateIssues(question));
	}
	if (ref === '05.1') {
		issues.push(...knownGeography2022Paper1Figure18Issues(question, visibleText));
	}
	return issues;
}

function assetMatchesFigureRequirement(asset, requirement, question) {
	if (
		requirement.matchResponseAsset &&
		['asset-canvas', 'image-label-zones'].includes(question.response?.kind) &&
		String(asset?.assetId ?? '') === String(question.response?.assetId ?? '') &&
		[question.response?.assetLabel, question.response?.sourceLabel, question.response?.label]
			.filter(Boolean)
			.some((label) => mediaLabelMatches(label, requirement.label))
	) {
		return true;
	}
	return [asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
		.filter(Boolean)
		.some((label) => mediaLabelMatches(label, requirement.label));
}

function matchingOcrTerms(text, terms) {
	const normalized = normalizeOcrSearchText(text);
	return terms.filter((term) => normalized.includes(normalizeOcrSearchText(term)));
}

function genericFigureCropPromptTextIssues(question) {
	const issues = [];
	const ref = question.sourceQuestionRef ?? 'unknown';
	for (const asset of question.assets ?? []) {
		const labels = [asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
			.filter(Boolean)
			.map(String);
		if (!labels.some((label) => /\b(?:figure|fig\.?|table|source|photograph|map)\b/i.test(label)))
			continue;
		const ocrText = imageOcrTextForAsset(asset);
		if (!ocrText) continue;
		const forbidden = matchingOcrTerms(ocrText, [
			'Study Figure',
			'Study Fig',
			'Using Figure',
			'Using Fig',
			'With the help of Figure',
			'Shade one circle only'
		]);
		if (!forbidden.length) continue;
		issues.push({
			code: 'asset_crop_contains_prompt_text',
			field: 'assets.filePath',
			severity: 'error',
			evidence: `${ref} ${labels[0]} crop OCR contains setup/prompt text that should be rendered in stemBlocks or promptBlocks, not inside the source image: ${forbidden.join(', ')}.`
		});
	}
	return issues;
}

function knownGeography2022Paper1Figure9And10DuplicateIssues(question) {
	const assetsByLabel = new Map();
	for (const asset of question.assets ?? []) {
		for (const label of [asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId].filter(
			Boolean
		)) {
			const normalized = normalizedMediaLabel(label);
			if (normalized === 'figure 9' || normalized === 'figure 10') {
				if (!assetsByLabel.has(normalized)) assetsByLabel.set(normalized, []);
				assetsByLabel.get(normalized).push(asset);
			}
		}
	}
	const figure9 = assetsByLabel.get('figure 9') ?? [];
	const figure10 = assetsByLabel.get('figure 10') ?? [];
	const issues = [];
	for (const asset of [...figure9, ...figure10]) {
		const ocrText = imageOcrTextForAsset(asset);
		if (!ocrText) continue;
		if (includesAllOcrTerms(ocrText, ['Figure 9', 'Figure 10'])) {
			issues.push({
				code: 'known_combined_optional_route_asset_duplicated',
				field: 'assets.filePath',
				severity: 'error',
				evidence:
					'Q02.9 must not attach separate Figure 9 and Figure 10 assets that each contain the same combined Figure 9/Figure 10 source block. Use one combined Figures 9 and 10 asset, or crop Figure 9 and Figure 10 into separate clean assets.'
			});
		}
	}
	return issues;
}

function geography2022Paper1FigureRequirements(ref) {
	const byRef = new Map([
		[
			'01.5',
			[
				{
					label: 'figure 3',
					minWidth: 1050,
					minHeight: 820,
					forbiddenOcrTerms: ['Use the data', 'complete Figure 3', 'Study Figure 3'],
					evidence:
						'Figure 3 must include the clean divided bar graph, x-axis labels through 2019, right edge, and key/legend without duplicated setup or prompt text.'
				}
			]
		],
		[
			'01.8',
			[
				{
					label: 'figure 4',
					minWidth: 900,
					minHeight: 360,
					forbiddenOcrTerms: ['Study Figure 4', 'Do you agree'],
					evidence:
						'Figure 4 must be a clean source-figure crop with the two captioned extreme-weather impacts, without duplicated setup or Q01.8 prompt text.'
				}
			]
		],
		[
			'02.1',
			[
				{
					label: 'figure 5',
					minWidth: 1120,
					minHeight: 960,
					requiredOcrTerms: [
						'Tropical forest',
						'Savanna',
						'Desert',
						'Polar and high mountain ice',
						'Mediterranean',
						'Temperate grassland',
						'Temperate deciduous forest',
						'Coniferous forest',
						'Tundra'
					],
					evidence:
						'Figure 5 must include the complete world ecosystems map and the full ecosystem key entries, not only the word Key.'
				}
			]
		],
		[
			'02.2',
			[
				{
					label: 'figure 5',
					minWidth: 1120,
					minHeight: 960,
					requiredOcrTerms: [
						'Tropical forest',
						'Savanna',
						'Desert',
						'Polar and high mountain ice',
						'Mediterranean',
						'Temperate grassland',
						'Temperate deciduous forest',
						'Coniferous forest',
						'Tundra'
					],
					evidence:
						'Figure 5 must include the complete world ecosystems map and the full ecosystem key entries, not only the word Key.'
				}
			]
		],
		[
			'02.5',
			[
				{
					label: 'figure 7',
					minWidth: 1120,
					minHeight: 720,
					forbiddenOcrTerms: ['Using Figure 7', 'describe changes'],
					evidence:
						'Figure 7 must include the clean full 2002-2018 graph, including the 2018 bar and label, without the Q02.5 prompt.'
				}
			]
		],
		[
			'02.9',
			[
				{
					label: 'figure 9',
					minWidth: 1120,
					minHeight: 900,
					forbiddenOcrTerms: ['Figure 10'],
					evidence:
						'Figure 9 must be a clean hot-desert source asset if Figure 10 is attached separately; do not duplicate the same combined Figure 9/Figure 10 source block twice.'
				},
				{
					label: 'figure 10',
					minWidth: 1120,
					minHeight: 900,
					forbiddenOcrTerms: ['Figure 9'],
					evidence:
						'Figure 10 must be a clean cold-environment source asset if Figure 9 is attached separately; do not duplicate the same combined Figure 9/Figure 10 source block twice.'
				}
			]
		],
		[
			'02.4',
			[
				{
					label: 'figure 6',
					minWidth: 1120,
					minHeight: 1450,
					evidence:
						'Figure 6 must include the complete climate graph/key and the full rainforest vegetation photograph below it.'
				}
			]
		],
		[
			'03.3',
			[
				{
					label: 'figure 11',
					minWidth: 1000,
					minHeight: 1200,
					requiredOcrTerms: [
						'Spurn Head',
						'Key',
						'Settlement',
						'Site where erosion rate recorded',
						'Holderness coastline'
					],
					evidence:
						'Figure 11 must include Spurn Head, the southern spit shape, scale/key text, and the complete relevant map/erosion-rate evidence.'
				}
			]
		],
		[
			'03.7',
			[
				{
					label: 'figure 13',
					minWidth: 1120,
					minHeight: 520,
					evidence:
						'Figure 13 must include the full coastal-management diagram, preserving all edge labels and arrows including Cliff collapse, North groyne, South groyne, and Longshore drift.'
				}
			]
		],
		[
			'04.1',
			[
				{
					label: 'figure 14',
					minWidth: 760,
					minHeight: 560,
					matchResponseAsset: true,
					requiredOcrTerms: ['River', 'Distance', 'source'],
					forbiddenOcrTerms: ['Plot the width', 'Using Figure 14', 'Median size of sediment'],
					evidence:
						'Figure 14 response canvas should be the clean plotting grid/graph surface with the x-axis title/scale "Distance from source (km)", axes through 90 km, and y-axis down to 0; put table/source values in structured blocks rather than duplicating Q04.1/Q04.2 prompt text inside the image. OCR is unreliable on the dense grid, so exact source values must also be checked from the structured Figure 14 table.'
				}
			]
		],
		[
			'04.7',
			[
				{
					label: 'figure 16',
					minWidth: 1120,
					minHeight: 520,
					requiredOcrTerms: ['Local resident', 'Environment Officer'],
					forbiddenOcrTerms: ['Assess the benefits'],
					evidence:
						'Figure 16 must include both quotation boxes and both role labels without clipping the Environment Officer box or duplicating the Q04.7 prompt.'
				}
			]
		],
		[
			'05.7',
			[
				{
					label: 'figure 20',
					minWidth: 1000,
					minHeight: 1500,
					requiredOcrTerms: [
						'Visitor numbers',
						'3.89 million',
						'Snowdonia',
						'1.46 million',
						'2.43 million',
						'122'
					],
					evidence:
						'Figure 20 must include the complete Snowdonia tourism infographic and the full visitor photograph at the bottom.'
				}
			]
		]
	]);
	return byRef.get(ref) ?? [];
}

function knownGeography2022Paper1Figure18Issues(question, visibleText) {
	const figure18Assets = (question.assets ?? []).filter((asset) =>
		[asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
			.filter(Boolean)
			.some((label) => mediaLabelMatches(label, 'figure 18'))
	);
	if (figure18Assets.length === 0 && /\bfigure\s+18\b/i.test(visibleText)) {
		return [
			{
				code: 'known_response_canvas_missing',
				field: 'assets',
				severity: 'error',
				evidence:
					'Q05.1 mentions Figure 18 and uses it as the cross-section response surface; a renderable Figure 18 asset is required.'
			}
		];
	}
	const figure17Files = new Set(
		(question.assets ?? [])
			.filter((asset) =>
				[asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
					.filter(Boolean)
					.some((label) => mediaLabelMatches(label, 'figure 17'))
			)
			.map(assetFileIdentity)
			.filter(Boolean)
	);
	const issues = [];
	for (const asset of figure18Assets) {
		const dimensions = imageDimensionsForAsset(asset);
		if (!dimensions) continue;
		const sharesFigure17File = figure17Files.has(assetFileIdentity(asset));
		const tooSmallCombined = sharesFigure17File && dimensions.height < 1500;
		const tooSmallSeparate =
			!sharesFigure17File && (dimensions.width < 760 || dimensions.height < 420);
		const ocrText = imageOcrTextForAsset(asset);
		const duplicatedSetupText =
			ocrText &&
			matchingOcrTerms(ocrText, [
				'partly completed cross section',
				'Figure 18 is',
				'Complete Figure 18'
			]);
		if (!tooSmallCombined && !tooSmallSeparate && !duplicatedSetupText) continue;
		issues.push({
			code: 'known_response_canvas_incomplete',
			field: 'assets.filePath',
			severity: 'error',
			evidence: `${question.sourceQuestionRef ?? '05.1'} ${asset.sourceLabel ?? 'Figure 18'}: Figure 18 must show the clean complete cross-section response graph/canvas, including the lower axis and Y endpoint down to 0 m, without duplicated setup text. Found ${dimensions.width}x${dimensions.height}; combined Figure 17/18 crops should be at least 1500 px tall, or a separate Figure 18 crop must be at least 760x420 px.`
		});
	}
	return issues;
}

function assetFileIdentity(asset) {
	const value = asset?.filePath ?? asset?.file ?? asset?.localPath ?? asset?.path ?? null;
	if (!value) return null;
	if (/^[a-z][a-z0-9+.-]*:/i.test(String(value))) return String(value);
	return path.resolve(localPathBaseDir, String(value));
}

function imageOcrTextForAsset(asset) {
	const filePath = asset?.filePath ?? asset?.file ?? asset?.localPath ?? null;
	if (!filePath) return null;
	const value = String(filePath);
	if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
	const resolved = path.isAbsolute(value) ? value : path.resolve(localPathBaseDir, value);
	if (!existsSync(resolved)) return null;
	if (imageOcrTextCache.has(resolved)) return imageOcrTextCache.get(resolved);
	try {
		const text = execFileSync('tesseract', [resolved, 'stdout', '--psm', '6'], {
			encoding: 'utf8',
			timeout: 15000,
			maxBuffer: 2 * 1024 * 1024,
			stdio: ['ignore', 'pipe', 'ignore']
		});
		imageOcrTextCache.set(resolved, text);
		return text;
	} catch {
		imageOcrTextCache.set(resolved, null);
		return null;
	}
}

function includesAllOcrTerms(text, terms) {
	const normalized = normalizeOcrSearchText(text);
	return terms.every((term) => normalized.includes(normalizeOcrSearchText(term)));
}

function normalizeOcrSearchText(text) {
	return String(text ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function knownComputerScience2024Paper1AResponseIssues(question, visibleText) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const issues = [];
	if (ref === '03.2' && hasUnsafeBoundaryRowIndependentAliases(question.response)) {
		issues.push({
			code: 'known_paired_boundary_answer_encoded_as_independent_aliases',
			field: 'response.correctAnswers',
			severity: 'error',
			evidence:
				'Q03.2 boundary test-data and expected-result blanks are paired: 0 or 101 must pair with Invalid number, while 1 or 100 must pair with Valid number entered. Do not encode these as independent aliases. Use a labeled/free response surface with markChecklist/modelAnswer pairing guidance, or a future structured-pair response.'
		});
	}
	if (ref === '08.0') {
		const responseText = JSON.stringify(question.response ?? {});
		if (
			!hasTraceState(responseText, [4, 0, 0]) ||
			!hasTraceState(responseText, [4, 6, 0]) ||
			!hasTraceState(responseText, [4, 6, 2])
		) {
			issues.push({
				code: 'known_trace_table_response_incomplete',
				field: 'response',
				severity: 'error',
				evidence:
					'Q08.0 official trace-table response must represent the intermediate retained weeks states [4,0,0], [4,6,0], [4,6,2] and final weeksTotal 12. Do not compress the response to only final weeks[0], weeks[1], weeks[2] blanks.'
			});
		}
	}
	if (!['12.2', '12.5'].includes(ref)) return issues;
	const hasGetTileReturnContext =
		/\bgettile\s*\(/.test(visibleText) &&
		/\breturns?\b/.test(visibleText) &&
		/\btile\s+value\b/.test(visibleText);
	const hasBlankZeroContext =
		/\bblank\s+space\b/.test(visibleText) &&
		/(?:represented\s+(?:as|by)|value\s+(?:of\s+)?)\s*0\b/.test(visibleText);
	if (!hasGetTileReturnContext || !hasBlankZeroContext) {
		issues.push({
			code: 'known_sliding_puzzle_context_missing',
			field: 'stemBlocks/contextText/selfContainedPromptText',
			severity: 'error',
			evidence:
				'Q12 subparts using getTile(i, j) == 0 must state that getTile(row, column) returns the tile value and that the blank space is represented by 0.'
		});
	}
	if (ref === '12.5' && !/\bfigure\s*17\b|\bboard\b.*\bblank\b/.test(visibleText)) {
		issues.push({
			code: 'known_sliding_puzzle_board_missing',
			field: 'stemBlocks/contextText/selfContainedPromptText',
			severity: 'error',
			evidence:
				'Q12.5 must carry the repeated Figure 17 board or equivalent blank-space board context forward for independent rendering.'
		});
	}
	return issues;
}

function hasUnsafeBoundaryRowIndependentAliases(response) {
	if (!response || typeof response !== 'object') return false;
	const answersByTarget = new Map(
		rawCorrectAnswerEntries(response.correctAnswers).map((entry) => [
			normalizedAnswerTarget(entry.targetId),
			answerAlternatives(entry)
		])
	);
	const dataAlternatives =
		answersByTarget.get('row2data') ?? answersByTarget.get('boundarytestdata') ?? [];
	const expectedAlternatives =
		answersByTarget.get('row2expected') ?? answersByTarget.get('boundaryexpectedresult') ?? [];
	const hasInvalidData = dataAlternatives.some((value) => ['0', '101'].includes(value));
	const hasValidData = dataAlternatives.some((value) => ['1', '100'].includes(value));
	const hasInvalidResult = expectedAlternatives.some((value) => value === 'invalid number');
	const hasValidResult = expectedAlternatives.some((value) => value === 'valid number entered');
	return hasInvalidData && hasValidData && hasInvalidResult && hasValidResult;
}

function normalizedAnswerTarget(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

function answerAlternatives(entry) {
	return [entry?.correctAnswer, ...(entry?.aliases ?? [])]
		.map((value) =>
			String(value ?? '')
				.toLowerCase()
				.replace(/\s+/g, ' ')
				.trim()
		)
		.filter(Boolean);
}

function hasTraceState(text, values) {
	const escaped = values.map((value) => String(value));
	const pattern = new RegExp(`(?:\\[|\\b)${escaped.join('(?:\\s*[,|/]\\s*|\\s+)')}(?:\\]|\\b)`);
	return pattern.test(String(text ?? ''));
}

function knownComputerScience2021Paper2ResponseIssues(question) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const issues = [];
	if (ref === '03.0') {
		const hasFigureOneAsset = (question.assets ?? []).some((asset) =>
			[asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
				.filter(Boolean)
				.some((label) => mediaLabelMatches(label, 'figure 1'))
		);
		if (hasFigureOneAsset) {
			issues.push({
				code: 'known_simple_figure_asset_should_be_structural',
				field: 'assets',
				severity: 'error',
				evidence:
					'Q03.0 Figure 1 is a simple eight-bit pattern. Render it as a structured code/text block containing 1 0 1 1 0 0 0 0 and omit the fragile screenshot asset.'
			});
		}
	}
	if (ref === '13.3') {
		const choiceOptions = question.response?.choiceOptions ?? question.response?.choices ?? [];
		const hasChoiceOptions =
			Array.isArray(choiceOptions) &&
			choiceOptions.some((option) => /authentication/i.test(String(option))) &&
			choiceOptions.some((option) => /mac\s+address\s+filtering/i.test(String(option)));
		const labels = [
			...(question.response?.labels ?? []),
			...(question.response?.fields ?? []).map((field) => field?.label)
		]
			.filter(Boolean)
			.join('\n');
		if (!hasChoiceOptions || /chosen\s+security\s+method/i.test(labels)) {
			issues.push({
				code: 'known_ring_choice_flattened',
				field: 'response.choiceOptions',
				severity: 'error',
				evidence:
					'Q13.3 must render the official ring choice as fixed choiceOptions Authentication / MAC address filtering, plus four written explanation lines. Do not turn the chosen method into a writable line.'
			});
		}
	}
	for (const issue of knownAssetDimensionIssues(
		question,
		new Map([
			[
				'11.1',
				{
					label: 'figure 2',
					minWidth: 980,
					minHeight: 720,
					evidence:
						'Figure 2 asset must include the complete logic circuit diagram, all input labels, and the output P label.'
				}
			],
			[
				'11.3',
				{
					label: 'figure 2',
					minWidth: 980,
					minHeight: 720,
					evidence:
						'Figure 2 asset must include the complete logic circuit diagram, all input labels, and the output P label.'
				}
			],
			[
				'16.1',
				{
					label: 'figure 5',
					minWidth: 900,
					minHeight: 700,
					evidence:
						'Figures 4/5 asset must include complete clean Figure 4 and Figure 5 content, especially the full Figure 5 grid.'
				}
			]
		])
	)) {
		issues.push(issue);
	}
	return issues;
}

function knownComputerScience2021Paper1ResponseIssues(question, visibleText) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const issues = [];
	if (ref === '04.4') {
		const rowCount = Array.isArray(question.response?.rows) ? question.response.rows.length : 0;
		if (rowCount !== 7) {
			issues.push({
				code: 'known_trace_table_response_rows_mismatch',
				field: 'response.rows',
				severity: 'error',
				evidence:
					'Q04.4 official trace table response has 7 rows: the initial newRow row plus i = 0, 1, 2, 3, 4, 5. The digital response control must match that full table, not only the first editable row.'
			});
		}
	}
	if (ref === '02.4') {
		const hasAlgorithmCode = renderBlocksFor(question).some(
			(block) =>
				String(block.kind ?? '') === 'code' &&
				/\bseconds\b[\s\S]*\bgetBPM\s*\(\)[\s\S]*\bUNTIL\s+seconds\s*>\s*200/i.test(
					blockPlainText(block)
				)
		);
		if (!hasAlgorithmCode) {
			issues.push({
				code: 'known_algorithm_context_missing',
				field: 'stemBlocks',
				severity: 'error',
				evidence:
					'Q02.4 must carry the complete Figure 1 algorithm into learner-visible structured code before the trace-table response; an asset-only dependency is not enough.'
			});
		}
	}
	if (ref === '07.5') {
		const sewingMachineMentions = (visibleText.match(/\bsewing\s+machine\b/g) ?? []).length;
		const gateRestrictionMentions = (visibleText.match(/\band\b.*\bor\b.*\bnot\b/g) ?? []).length;
		if (sewingMachineMentions > 1 || gateRestrictionMentions > 1) {
			issues.push({
				code: 'known_duplicate_logic_scenario',
				field: 'stemBlocks/promptBlocks',
				severity: 'error',
				evidence:
					'Q07.5 must render the sewing-machine scenario and AND/OR/NOT gate restriction once. Put shared scenario in stem/context and keep promptBlocks to the marked instruction.'
			});
		}
	}
	if (ref === '09.2') {
		const grid = question.response?.grid ?? {};
		if (Number(grid.rows) !== 4 || Number(grid.columns) !== 7) {
			issues.push({
				code: 'known_drawing_grid_mismatch',
				field: 'response.grid',
				severity: 'error',
				evidence:
					'Q09.2 official drawing response grid is 4 rows by 7 columns. Do not infer a smaller grid from the algorithm or crop.'
			});
		}
	}
	for (const issue of knownComputerScience2021Paper1CircuitCropIssues(question)) {
		issues.push(issue);
	}
	return issues;
}

function knownComputerScience2021Paper1CircuitCropIssues(question) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const requirements = new Map([
		[
			'02.4',
			{
				label: 'figure 1',
				minWidth: 650,
				minHeight: 680,
				evidence:
					'Figure 1 asset, if used, must include the complete algorithm from seconds <- 0 through UNTIL seconds > 200.'
			}
		],
		[
			'03.3',
			{
				label: 'figure 3',
				minWidth: 730,
				minHeight: 680,
				evidence:
					'Figure 3 asset must include the complete convert(cards) subroutine skeleton and all labels L1 to L5.'
			}
		],
		[
			'06.2',
			{
				label: 'figure 5',
				minWidth: 730,
				minHeight: 760,
				evidence:
					'Figure 5 asset, if used, must include the complete array/table context for the binary search comparison question.'
			}
		],
		[
			'07.2',
			{
				label: 'figure 6',
				minWidth: 850,
				minHeight: 380,
				evidence:
					'Figure 6 asset must include the complete official logic circuit, including all input labels/dots and output Q.'
			}
		],
		[
			'07.3',
			{
				label: 'figure 7',
				minWidth: 760,
				minHeight: 390,
				evidence:
					'Figure 7 asset must include the complete official logic circuit, including the top A input NOT gate area and right-side output/Q area.'
			}
		]
	]);
	return knownAssetDimensionIssues(question, requirements);
}

function knownComputerScience2022Paper2ResponseIssues(question) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const issues = [];
	if (ref === '01.2') {
		const answers = new Map(
			normalizeCorrectAnswers(question.response?.correctAnswers).map((answer) => [
				answer.targetId,
				String(answer.correctAnswer ?? '')
					.trim()
					.toUpperCase()
			])
		);
		if (question.response?.kind !== 'labeled-lines') {
			issues.push({
				code: 'known_working_plus_answer_response_missing',
				field: 'response.kind',
				severity: 'error',
				evidence:
					'Q01.2 needs a learner response surface with four visible working lines plus a final keyed hexadecimal answer field; equation-blanks alone loses the official working space.'
			});
		}
		if (answers.get('left-hex-digit') !== 'B' || answers.get('right-hex-digit') !== '9') {
			issues.push({
				code: 'known_hex_answer_key_missing',
				field: 'response.correctAnswers',
				severity: 'error',
				evidence:
					'Q01.2 must retain correctAnswers left-hex-digit = B and right-hex-digit = 9 while also rendering the working lines.'
			});
		}
	}
	if (ref === '02.2') {
		const segments = Array.isArray(question.response?.segments) ? question.response.segments : [];
		const blankCount = segments.filter((segment) => segment?.kind === 'blank').length;
		if (question.response?.kind !== 'equation-blanks' || blankCount !== 8) {
			issues.push({
				code: 'known_bit_box_response_mismatch',
				field: 'response',
				severity: 'error',
				evidence:
					'Q02.2 official response is an eight-cell bit box. Represent it as response.kind="equation-blanks" with eight one-bit blank targets and keyed correctAnswers, not generic ruled lines.'
			});
		}
	}
	if (ref === '03.3') {
		const options = responseLabels(question.response);
		const optionB = options.find((option) => /^B\b/i.test(String(option).trim())) ?? '';
		const optionD = options.find((option) => /^D\b/i.test(String(option).trim())) ?? '';
		if (!hasOverlineW(optionB) || !hasOverlineW(optionD)) {
			issues.push({
				code: 'known_boolean_overline_missing',
				field: 'response.options',
				severity: 'error',
				evidence:
					'Q03.3 official options B and D show an overline on W. Preserve this as LaTeX \\overline{W} or equivalent unambiguous notation.'
			});
		}
	}
	if (ref === '17.3') {
		const huffmanIssue = knownComputerScience2022Paper2HuffmanTreeKeyIssue(question);
		if (huffmanIssue) issues.push(huffmanIssue);
	}
	const requirements = new Map([
		[
			'12.0',
			{
				label: 'figure 1',
				minWidth: 350,
				minHeight: 250,
				maxHeight: 520,
				evidence:
					'Figure 1 bitmap asset must be a tight bitmap-only crop; do not include clipped following prompt text.'
			}
		],
		[
			'03.2',
			{
				label: 'q03.2 logic circuit drawing box',
				minWidth: 1100,
				minHeight: 610,
				maxHeight: 630,
				evidence:
					'Q03.2 drawing-box asset must include D/L/W input labels and R output label, but exclude duplicated instruction text and the [3 marks] label.'
			}
		],
		[
			'17.2',
			{
				label: 'figure 2',
				minWidth: 600,
				minHeight: 100,
				evidence:
					'Figure 2 asset must visibly show the full MISSISSIPPI string. Prefer a structured Figure 2 text block and omit the redundant asset if the crop is fragile.'
			}
		],
		[
			'17.3',
			[
				{
					label: 'figure 2',
					minWidth: 600,
					minHeight: 100,
					evidence:
						'Figure 2 asset must visibly show the full MISSISSIPPI string. Prefer a structured Figure 2 text block and omit the redundant asset if the crop is fragile.'
				},
				{
					label: 'figure 3',
					minWidth: 690,
					minHeight: 360,
					evidence:
						'Figure 3 asset must include the complete Huffman code table, including the P / 101 row. Prefer a structured table block and omit the redundant asset if the crop is fragile.'
				},
				{
					label: 'q17.3 huffman tree response',
					minWidth: 1000,
					minHeight: 640,
					evidence:
						'Q17.3 response asset must include the complete Huffman tree surface and all blank leaf boxes needed for I, S and P.'
				}
			]
		]
	]);
	if (['17.2', '17.3'].includes(ref)) {
		const hasFigureTwoAsset = (question.assets ?? []).some((asset) =>
			[asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
				.filter(Boolean)
				.some((label) => mediaLabelMatches(label, 'figure 2'))
		);
		if (hasFigureTwoAsset) {
			issues.push({
				code: 'known_simple_figure_asset_should_be_structural',
				field: 'assets',
				severity: 'error',
				evidence:
					'Q17 Figure 2 is the text MISSISSIPPI. Render it as a structured text/code block and omit the fragile screenshot asset so the visible string cannot be clipped or wrong.'
			});
		}
	}
	for (const issue of knownAssetDimensionIssues(question, requirements)) issues.push(issue);
	return issues;
}

function knownComputerScience2022Paper2HuffmanTreeKeyIssue(question) {
	if (question.response?.kind !== 'image-label-zones') return null;
	const zones = new Map(
		(question.response?.zones ?? []).map((zone) => [String(zone.id ?? ''), zone])
	);
	const mismatches = [];
	for (const answer of normalizeCorrectAnswers(question.response?.correctAnswers)) {
		const zone = zones.get(String(answer.targetId ?? ''));
		if (!zone) continue;
		const expected = expectedComputerScience2022HuffmanLeaf(zone);
		if (!expected) continue;
		const actual = String(answer.correctAnswer ?? '')
			.trim()
			.toUpperCase();
		if (actual !== expected)
			mismatches.push(`${answer.targetId}: expected ${expected}, found ${actual}`);
	}
	if (mismatches.length === 0) return null;
	return {
		code: 'known_huffman_tree_answer_key_swapped',
		field: 'response.correctAnswers',
		severity: 'error',
		evidence: `Q17.3 Huffman response key must follow the rendered tree and Figure 3 code table: root-left/code 0 = I, node-7-right/code 11 = S, node-3-right/code 101 = P. ${mismatches.join('; ')}.`
	};
}

function expectedComputerScience2022HuffmanLeaf(zone) {
	const x = Number(zone.x ?? 0);
	const y = Number(zone.y ?? 0);
	if (x <= 0.2 && y <= 0.5) return 'I';
	if (x >= 0.7 && y >= 0.35 && y <= 0.65) return 'S';
	if (x >= 0.45 && x <= 0.7 && y >= 0.65) return 'P';
	return null;
}

function hasOverlineW(value) {
	const text = String(value ?? '');
	return /\\overline\s*\{?\s*W\s*\}?|W\u0305|W̅|overline\s*\(?\s*W/i.test(text);
}

function knownComputerScience2023Paper2FigureCropIssues(question) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const requirements = new Map([
		[
			'07.2',
			{
				label: 'figure 1',
				minWidth: 400,
				minHeight: 360,
				maxHeight: 400,
				evidence:
					'Figure 1 bitmap image asset must be a tight crop of the 5 by 5 bitmap only; do not include the caption, following prompt text, or answer area.'
			}
		],
		[
			'07.4',
			{
				label: 'figure 2',
				minWidth: 900,
				minHeight: 180,
				evidence:
					'Figure 2 image asset must include the complete visible 16-cell RLE bit pattern; prefer a structured table and omit the image asset if the structured block fully represents the pattern.'
			}
		],
		[
			'11.2',
			{
				label: 'figure 3',
				minWidth: 590,
				minHeight: 360,
				evidence:
					'Figure 3 logic-circuit image asset must include the complete circuit: inputs A, B, C, gates G1 and G2, both rails, the output line, and D.'
			}
		],
		[
			'11.3',
			{
				label: 'figure 3',
				minWidth: 590,
				minHeight: 360,
				evidence:
					'Figure 3 logic-circuit image asset must include the complete circuit: inputs A, B, C, gates G1 and G2, both rails, the output line, and D.'
			}
		],
		[
			'14.1',
			{
				label: 'figure 5',
				minWidth: 1100,
				minHeight: 1400,
				evidence:
					'Figure 5 database image asset must include complete BookCopy, Student and Loan tables, including Loan row L0007; prefer complete structured tables and omit the image asset if the structured blocks fully represent the data.'
			}
		],
		[
			'14.2',
			{
				label: 'figure 5',
				minWidth: 1100,
				minHeight: 1400,
				evidence:
					'Figure 5 database image asset must include complete BookCopy, Student and Loan tables, including Loan row L0007; prefer complete structured tables and omit the image asset if the structured blocks fully represent the data.'
			}
		],
		[
			'14.3',
			{
				label: 'figure 5',
				minWidth: 1100,
				minHeight: 1400,
				evidence:
					'Figure 5 database image asset must include complete BookCopy, Student and Loan tables, including Loan row L0007; prefer complete structured tables and omit the image asset if the structured blocks fully represent the data.'
			}
		],
		[
			'14.5',
			{
				label: 'figure 5',
				minWidth: 1100,
				minHeight: 1400,
				evidence:
					'Figure 5 database image asset must include complete BookCopy, Student and Loan tables, including Loan row L0007; prefer complete structured tables and omit the image asset if the structured blocks fully represent the data.'
			}
		]
	]);
	return knownAssetDimensionIssues(question, requirements);
}

function knownAssetDimensionIssues(question, requirements) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const rawRequirement = requirements.get(ref);
	if (!rawRequirement) return [];
	const refRequirements = Array.isArray(rawRequirement) ? rawRequirement : [rawRequirement];
	const issues = [];
	for (const requirement of refRequirements) {
		for (const asset of question.assets ?? []) {
			const label = normalizedMediaLabel(
				asset.sourceLabel ?? asset.assetLabel ?? asset.label ?? asset.assetId ?? ''
			);
			if (!mediaLabelMatches(label, requirement.label)) continue;
			const dimensions = imageDimensionsForAsset(asset);
			if (!dimensions) continue;
			const tooSmall =
				dimensions.width < requirement.minWidth || dimensions.height < requirement.minHeight;
			const tooTall =
				Number.isFinite(Number(requirement.maxHeight)) &&
				dimensions.height > Number(requirement.maxHeight);
			if (!tooSmall && !tooTall) {
				if (requirement.forbiddenOcrTerms) {
					const ocrText = imageOcrTextForAsset(asset);
					if (ocrText) {
						const forbidden = matchingOcrTerms(ocrText, requirement.forbiddenOcrTerms);
						if (forbidden.length) {
							issues.push({
								code: 'known_figure_crop_duplicate_prompt_text',
								field: 'assets.filePath',
								severity: 'error',
								evidence: `${ref} ${asset.sourceLabel ?? label}: ${requirement.evidence} Crop OCR contains duplicated prompt/setup text that should be rendered separately: ${forbidden.join(', ')}.`
							});
						}
					}
				}
				continue;
			}
			issues.push({
				code: tooTall ? 'known_figure_crop_prompt_contamination' : 'known_figure_crop_incomplete',
				field: 'assets.filePath',
				severity: 'error',
				evidence: `${ref} ${asset.sourceLabel ?? label}: ${requirement.evidence} Found ${dimensions.width}x${dimensions.height}; expected at least ${requirement.minWidth}x${requirement.minHeight}${
					requirement.maxHeight ? ` and height no more than ${requirement.maxHeight}` : ''
				}, or no image asset when a complete structured block is present.`
			});
		}
	}
	return issues;
}

function knownComputerScience2023Paper2SqlIssues(question) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	if (ref !== '14.5') return [];
	const response = question.response ?? {};
	if (response.kind !== 'equation-blanks') return [];
	const responseText = (response.segments ?? [])
		.map((segment) => [segment?.text, segment?.label].filter(Boolean).join(' '))
		.filter(Boolean)
		.join('\n');
	if (!/\bDELETE\s+FROM\b/i.test(responseText) || !/\bWHERE\b/i.test(responseText)) return [];
	const blockText = [
		...(question.stemBlocks ?? []),
		...(question.leadBlocks ?? []),
		...(question.promptBlocks ?? [])
	]
		.map(blockSearchText)
		.filter(Boolean)
		.join('\n');
	if (!/\bDELETE\s+FROM\b/i.test(blockText) || !/\bWHERE\b/i.test(blockText)) return [];
	return [
		{
			code: 'known_sql_skeleton_duplicate_response',
			field: 'promptBlocks/response',
			severity: 'error',
			evidence:
				'Q14.5 must render the DELETE FROM / WHERE skeleton once. If response.kind="equation-blanks" contains the SQL text and blanks, do not also include the same skeleton in prompt/stem blocks.'
		}
	];
}

function knownComputerScience2023Paper2ResponseIssues(question) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	if (ref === '14.5') return knownComputerScience2023Paper2Q145ContextIssues(question);
	if (ref !== '03.0') return [];
	const issues = [];
	if (!question.response?.kind || question.response.kind === 'none') {
		issues.push({
			code: 'known_missing_response_control',
			field: 'response.kind',
			severity: 'error',
			evidence:
				'Q03.0 is a marked binary-answer question. Even though the paper has unruled blank workspace, the digital extraction needs an app-visible learner answer control, not response.kind="none".'
		});
	}
	const gradingText = [
		...(question.markSchemeItems ?? []).map((item) => item.text),
		...(question.markChecklist ?? []).map((item) => item.text)
	]
		.filter(Boolean)
		.join('\n')
		.toLowerCase();
	const modelAnswerText = String(question.modelAnswer?.answerText ?? '').toLowerCase();
	const hasOfficialSplit =
		/\b10111\b/.test(gradingText) && /(?:^|[^01])100(?:[^01]|$)/.test(gradingText);
	if (!hasOfficialSplit || !/\b10111100\b/.test(modelAnswerText)) {
		issues.push({
			code: 'known_model_answer_mismatch',
			field: 'modelAnswer/markSchemeItems',
			severity: 'error',
			evidence:
				'Q03.0 official mark-scheme split is 10111; 100; and the complete binary model answer is 10111100. Do not use the 2024 Q03 answer 11010101.'
		});
	}
	return issues;
}

function knownComputerScience2023Paper2Q145ContextIssues(question) {
	const hasFigureFiveAsset = (question.assets ?? []).some((asset) =>
		[asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
			.filter(Boolean)
			.some((label) => mediaLabelMatches(label, 'figure 5'))
	);
	const visibleBlockText = [
		...(question.stemBlocks ?? []),
		...(question.leadBlocks ?? []),
		...(question.promptBlocks ?? [])
	]
		.map(blockSearchText)
		.filter(Boolean)
		.join('\n')
		.toLowerCase();
	if (
		hasFigureFiveAsset ||
		(visibleBlockText.includes('tuc004') && visibleBlockText.includes('pb002'))
	) {
		return [];
	}
	return [
		{
			code: 'known_database_context_missing',
			field: 'stemBlocks/assets',
			severity: 'error',
			evidence:
				'Q14.5 must carry Figure 5 database context or visible Student/Loan table data linking Barry Tucker to TUC004 and PB002 to the Loan row; the SQL answer key is not enough for learner solvability.'
		}
	];
}

function knownComputerScience2024Paper2SqlAssetIssues(question) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	if (!['18.5', '18.7'].includes(ref)) return [];
	const issues = [];
	for (const asset of question.assets ?? []) {
		const label = normalizedMediaLabel(
			asset.sourceLabel ?? asset.assetLabel ?? asset.label ?? asset.assetId ?? ''
		);
		if (!label.includes('sql skeleton')) continue;
		const dimensions = imageDimensionsForAsset(asset);
		if (!dimensions || dimensions.height <= 620) continue;
		issues.push({
			code: 'known_sql_skeleton_crop_too_broad',
			field: 'assets.filePath',
			severity: 'error',
			evidence: `${ref} ${asset.sourceLabel ?? label}: SQL skeleton crops must not include neighboring prompt text, response lines, or adjacent questions. Prefer the structured code block if it is faithful. Found ${dimensions.width}x${dimensions.height}; expected a tight skeleton-only crop or no SQL asset.`
		});
	}
	return issues;
}

function responseLabels(response) {
	if (!response) return [];
	return [
		...(Array.isArray(response.labels) ? response.labels : []),
		...(Array.isArray(response.options) ? response.options : []),
		...(Array.isArray(response.labelBank) ? response.labelBank : [])
	]
		.map((label) => String(label ?? '').trim())
		.filter(Boolean);
}

function knownComputerScience2024Paper2FigureCropIssues(question) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const requirements = new Map([
		[
			'figure 2',
			{
				minWidth: 980,
				minHeight: 730,
				evidence:
					'Figure 2 asset must include the complete four bitmap images A, B, C and D, including labels, right edges and lower grid content.'
			}
		],
		[
			'figure 5',
			{
				minWidth: 900,
				minHeight: 760,
				evidence:
					'Figure 5 truth-table asset should include the complete learner-visible table, including header and all eight data rows.'
			}
		],
		[
			'figure 6',
			{
				minWidth: 980,
				minHeight: 520,
				evidence:
					'Figure 6 logic-circuit asset must include the complete circuit, including the right-side output line and Q label.'
			}
		],
		[
			'figure 7',
			{
				minWidth: 880,
				minHeight: 620,
				evidence:
					'Figure 7 Huffman-tree asset must include the complete tree, including A, D, E, and P leaf labels.'
			}
		],
		[
			'figure 8',
			{
				minWidth: 900,
				minHeight: 1350,
				evidence:
					'Figure 8 database asset must include the complete Film, Performance and Actor tables, including Actor rows 8 Tom Hanks and 9 Lea Thompson.'
			}
		]
	]);
	const issues = [];
	for (const asset of question.assets ?? []) {
		const label = normalizedMediaLabel(
			asset.sourceLabel ?? asset.assetLabel ?? asset.label ?? asset.assetId ?? ''
		);
		const requirement = requirements.get(label);
		if (!requirement) continue;
		const dimensions = imageDimensionsForAsset(asset);
		if (!dimensions) continue;
		if (dimensions.width >= requirement.minWidth && dimensions.height >= requirement.minHeight) {
			continue;
		}
		issues.push({
			code: 'known_figure_crop_incomplete',
			field: 'assets.filePath',
			severity: 'error',
			evidence: `${ref} ${asset.sourceLabel ?? label}: ${requirement.evidence} Found ${dimensions.width}x${dimensions.height}; expected at least ${requirement.minWidth}x${requirement.minHeight}.`
		});
	}
	return issues;
}

function knownFigureCropIssues(question) {
	const ref = question.sourceQuestionRef ?? 'unknown';
	const requirements = new Map([
		[
			'figure 2',
			{
				minWidth: 900,
				minHeight: 520,
				maxHeight: 620,
				evidence:
					"Figure 2 crop must include the complete right-hand 'Mesophyll cell' label and Stomata label, but not the Q02.2 prompt text."
			}
		],
		[
			'figure 4',
			{
				minWidth: 1050,
				minHeight: 620,
				maxHeight: 730,
				evidence:
					"Figure 4 crop must include the full key, including 'Water molecules' and 'Nitrate ions', but not the Q02.4 prompt text."
			}
		],
		[
			'figure 5',
			{
				minWidth: 1150,
				minHeight: 500,
				maxHeight: 570,
				evidence:
					'Figure 5 crop must include the three cell diagrams and scale bars, but not the Q03.1 prompt text.'
			}
		],
		[
			'figure 6',
			{
				minWidth: 950,
				minHeight: 720,
				evidence:
					'Figure 6 crop must include the full cell-cycle chart, including the Stage 1 label.'
			}
		],
		[
			'figure 9',
			{
				minWidth: 700,
				minHeight: 480,
				evidence: "Figure 9 crop must include the full 'Nodules' label, arrows, and nodule image."
			}
		]
	]);
	const issues = [];
	for (const asset of question.assets ?? []) {
		const label = normalizedMediaLabel(
			asset.sourceLabel ?? asset.assetLabel ?? asset.label ?? asset.assetId ?? ''
		);
		const requirement =
			label === 'figure 10' && Number(asset.page ?? question.pageStart ?? 0) === 26
				? {
						minWidth: 900,
						minHeight: 960,
						maxHeight: 1040,
						evidence:
							'Repeated Figure 10 crop must include the graph, axes, and key, but not the Q06.4 prompt text.'
					}
				: requirements.get(label);
		if (!requirement) continue;
		const dimensions = imageDimensionsForAsset(asset);
		if (!dimensions) continue;
		const tooSmall =
			dimensions.width < requirement.minWidth || dimensions.height < requirement.minHeight;
		const tooTall =
			Number.isFinite(Number(requirement.maxHeight)) &&
			dimensions.height > Number(requirement.maxHeight);
		if (!tooSmall && !tooTall) continue;
		issues.push({
			code: tooTall ? 'known_figure_crop_prompt_contamination' : 'known_figure_crop_incomplete',
			field: 'assets.filePath',
			severity: 'error',
			evidence: `${ref} ${asset.sourceLabel ?? label}: ${requirement.evidence} Found ${dimensions.width}x${dimensions.height}; expected at least ${requirement.minWidth}x${requirement.minHeight}${
				requirement.maxHeight ? ` and height no more than ${requirement.maxHeight}` : ''
			}.`
		});
	}
	return issues;
}

function missingReferencedMediaLabels(question) {
	const labels = referencedMediaLabels(question);
	if (!labels.length) return [];
	const renderableBlockLabels = new Set();
	for (const block of [
		...(question.stemBlocks ?? []),
		...(question.leadBlocks ?? []),
		...(question.promptBlocks ?? []),
		...(question.afterResponseBlocks ?? [])
	]) {
		if (!blockHasRenderableSource(block)) continue;
		for (const label of [block?.label, block?.assetLabel, block?.sourceLabel].filter(Boolean)) {
			renderableBlockLabels.add(normalizedMediaLabel(label));
		}
	}
	const renderableAssetLabels = new Set();
	for (const asset of question.assets ?? []) {
		if (!assetHasRenderableSource(asset)) continue;
		for (const label of [asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId].filter(
			Boolean
		)) {
			renderableAssetLabels.add(normalizedMediaLabel(label));
		}
	}
	const missing = [];
	for (const label of labels) {
		const normalized = normalizedMediaLabel(label);
		if (hasRenderableMediaLabel(renderableAssetLabels, normalized)) continue;
		if (hasRenderableMediaLabel(renderableBlockLabels, normalized)) continue;
		missing.push(label);
	}
	return [...new Set(missing)];
}

function copyrightPlaceholderMediaIssues(question) {
	const text = learnerVisibleQuestionText(question);
	if (
		!/\b(?:cannot be reproduced|not reproduced|third[- ]party copyright|copyright restrictions?|copyright placeholder|not supplied)\b/i.test(
			text
		)
	) {
		return [];
	}
	const ref = question.sourceQuestionRef ?? 'unknown';
	return [
		{
			code: 'media_copyright_placeholder',
			field: 'contextText/stemBlocks/leadBlocks/promptBlocks',
			severity: 'error',
			evidence: `${ref}: ${text.replace(/\s+/g, ' ').trim().slice(0, 220)}`,
			message:
				'Learner-visible question content still contains a copyright/source placeholder. Provide a renderable or structured official source, or keep the question blocked for human review.'
		}
	];
}

function learnerVisibleSourceProvenanceIssues(question) {
	const text = learnerVisibleQuestionText(question);
	if (
		!/\b(?:neutral substitute|official (?:evidence|marking evidence|marking\/report evidence|report evidence)|mark[- ]scheme evidence|marking\/report evidence|reconstruct(?:ed|ion)|source unavailable|source status|not learner visible)\b/i.test(
			text
		)
	) {
		return [];
	}
	const ref = question.sourceQuestionRef ?? 'unknown';
	return [
		{
			code: 'learner_visible_source_provenance',
			field: 'contextText/stemBlocks/leadBlocks/promptBlocks',
			severity: 'error',
			evidence: `${ref}: ${text.replace(/\s+/g, ' ').trim().slice(0, 220)}`,
			message:
				'Learner-visible source substitutes must contain clean source content only. Move reconstruction/provenance wording to reviewNotes or provenance metadata.'
		}
	];
}

function learnerVisibleQuestionText(question) {
	return [
		question.promptText,
		question.selfContainedPromptText,
		question.contextText,
		...(question.stemBlocks ?? []).map(blockSearchText),
		...(question.leadBlocks ?? []).map(blockSearchText),
		...(question.promptBlocks ?? []).map(blockSearchText),
		...(question.afterResponseBlocks ?? []).map(blockSearchText)
	]
		.map(stringifyBlockValue)
		.filter(Boolean)
		.join('\n');
}

function referencedMediaLabels(question) {
	const labels = [];
	const texts = [
		question.promptText,
		question.selfContainedPromptText,
		question.contextText,
		...(question.stemBlocks ?? []).map(blockPlainText),
		...(question.leadBlocks ?? []).map(blockPlainText),
		...(question.promptBlocks ?? []).map(blockPlainText),
		...(question.afterResponseBlocks ?? []).map(blockPlainText)
	];
	for (const text of texts) {
		const value = String(text ?? '');
		const regex = /\b(Fig(?:ure)?|Table)\s+(\d+[A-Za-z]?)/gi;
		for (const match of value.matchAll(regex)) {
			const kind = /^table$/i.test(match[1]) ? 'Table' : 'Figure';
			labels.push(`${kind} ${match[2]}`);
		}
	}
	return [...new Set(labels)];
}

function normalizedMediaLabel(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/\bfig\.\s*/g, 'figure ')
		.replace(/\bfig\s+/g, 'figure ')
		.replace(/\s+/g, ' ')
		.trim();
}

function mediaLabelMatches(value, expected) {
	const normalized = normalizedMediaLabel(value);
	const normalizedExpected = normalizedMediaLabel(expected);
	if (!normalized || !normalizedExpected) return false;
	if (normalized === normalizedExpected) return true;
	return (
		normalized.startsWith(`${normalizedExpected} `) ||
		normalized.startsWith(`${normalizedExpected}:`) ||
		normalized.startsWith(`${normalizedExpected} -`)
	);
}

function hasRenderableMediaLabel(renderableLabels, expectedLabel) {
	for (const label of renderableLabels) {
		if (mediaLabelMatches(label, expectedLabel)) return true;
		if (combinedFigureLabelCovers(label, expectedLabel)) return true;
	}
	return false;
}

function combinedFigureLabelCovers(value, expected) {
	const normalized = normalizedMediaLabel(value);
	const normalizedExpected = normalizedMediaLabel(expected);
	const expectedMatch = /^figure\s+(\d+[a-z]?)$/.exec(normalizedExpected);
	if (!expectedMatch) return false;
	const figureNumbers = [
		...normalized.matchAll(/\bfigures?\s+(\d+[a-z]?)(?:\s*(?:,|and|&)\s*(\d+[a-z]?))*/g)
	];
	for (const match of figureNumbers) {
		const numbers = [
			match[1],
			...[...match[0].matchAll(/\b(\d+[a-z]?)\b/g)].map((item) => item[1])
		];
		if (numbers.includes(expectedMatch[1])) return true;
	}
	return false;
}

function blockPlainText(block) {
	if (!block || typeof block !== 'object') return '';
	if (typeof block.text === 'string') return block.text;
	if (Array.isArray(block.items)) return block.items.join(' ');
	return '';
}

function blockHasRenderableSource(block) {
	if (!block || typeof block !== 'object') return false;
	const kind = String(block.kind ?? '').toLowerCase();
	if (
		[
			'code',
			'table',
			'structured-table',
			'structured_table',
			'equation',
			'formula',
			'math',
			'diagram',
			'structured-text',
			'structured_text'
		].includes(kind)
	) {
		return Boolean(blockRenderableContentText(block));
	}
	return false;
}

function blockRenderableContentText(block) {
	return [
		block?.text,
		block?.columns,
		block?.rows,
		block?.items,
		block?.keyItems,
		block?.formula,
		block?.latex
	]
		.map(stringifyBlockValue)
		.filter(Boolean)
		.join(' ');
}

function blockSearchText(block) {
	if (!block || typeof block !== 'object') return '';
	return [
		block.text,
		block.label,
		block.assetLabel,
		block.columns,
		block.rows,
		block.items,
		block.keyItems
	]
		.map(stringifyBlockValue)
		.filter(Boolean)
		.join(' ');
}

function stringifyBlockValue(value) {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (Array.isArray(value)) return value.map(stringifyBlockValue).filter(Boolean).join(' ');
	if (typeof value === 'object')
		return Object.values(value).map(stringifyBlockValue).filter(Boolean).join(' ');
	return '';
}

function normalizedRenderText(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

function assetHasRenderableSource(asset) {
	if (asset?.publicPath || asset?.public_path || asset?.r2Key || asset?.r2_key) return true;
	const filePath = asset?.filePath ?? asset?.file ?? asset?.localPath ?? null;
	if (!filePath) return false;
	const value = String(filePath);
	if (/^https?:\/\//i.test(value)) return true;
	if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
	const resolved = path.isAbsolute(value) ? value : path.resolve(localPathBaseDir, value);
	return existsSync(resolved);
}

function imageDimensionsForAsset(asset) {
	const filePath = asset?.filePath ?? asset?.file ?? asset?.localPath ?? null;
	if (!filePath) return null;
	const value = String(filePath);
	if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
	const resolved = path.isAbsolute(value) ? value : path.resolve(localPathBaseDir, value);
	if (!existsSync(resolved)) return null;
	try {
		const buffer = readFileSync(resolved);
		if (
			buffer.length >= 24 &&
			buffer[0] === 0x89 &&
			buffer[1] === 0x50 &&
			buffer[2] === 0x4e &&
			buffer[3] === 0x47
		) {
			return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
		}
	} catch {
		return null;
	}
	return null;
}

function underGranularAnyNMarkScheme(question) {
	const requiredCount = Number(question?.marks ?? 0);
	if (!Number.isFinite(requiredCount) || requiredCount <= 1) return null;
	const positiveItems = (question.markSchemeItems ?? []).filter(isPositiveMarkSchemeItem);
	const itemTexts = positiveItems.map((item) => String(item.text ?? ''));
	const anyCount = Math.max(0, ...itemTexts.map(inferredAnyNCountFromText));
	if (!anyCount) return null;
	const expectedRows = Math.min(requiredCount, anyCount);
	if (positiveItems.length >= expectedRows) return null;
	return `${question.sourceQuestionRef ?? 'unknown'} expects ${expectedRows} independently awardable rows from an any-${anyCount} mark scheme, found ${positiveItems.length}.`;
}

function overrequiredAlternativeChecklist(question) {
	const marks = Number(question?.marks ?? 0);
	if (!Number.isFinite(marks) || marks <= 0) return null;
	const checklist = question.markChecklist ?? [];
	if (checklist.length <= marks) return null;
	const requiredCount = checklist.filter((item) => item?.required !== false).length;
	if (requiredCount <= marks) return null;
	return `${question.sourceQuestionRef ?? 'unknown'} has ${requiredCount} required checklist rows for ${marks} marks; alternative/any-answer checklist rows must not all be required.`;
}

function inferredAnyNCountFromText(text) {
	const match = String(text ?? '').match(/\bany\s+(two|three|four|five|six|2|3|4|5|6)\b/i);
	if (!match) return 0;
	const wordToNumber = { two: 2, three: 3, four: 4, five: 5, six: 6 };
	const raw = match[1].toLowerCase();
	return wordToNumber[raw] ?? Number(raw);
}

function isPositiveMarkSchemeItem(item) {
	const itemType = String(item?.itemType ?? item?.kind ?? '').toLowerCase();
	const text = String(item?.text ?? '').toLowerCase();
	const negativeType =
		/^(?:allow|accept|ignore|reject|alternative|guidance|do[_ -]?not|do not credit|do not accept)$/;
	if (itemType) return !negativeType.test(itemType);
	return !/^\s*(?:allow|accept|ignore|reject|alternative|guidance|do[_ -]?not|do not credit|do not accept)\b/.test(
		text
	);
}

function blockingIssues(findings) {
	return findings.flatMap((finding) =>
		(finding.issues ?? [])
			.filter((issue) => issue.severity === 'error')
			.map((issue) => ({ ...issue, sourceQuestionRef: finding.sourceQuestionRef }))
	);
}

function chainValidationBlockingIssues(findings) {
	return findings.flatMap((finding) =>
		(finding.issues ?? [])
			.filter((issue) => issue.severity === 'error' || issue.severity === 'warning')
			.map((issue) => ({ ...issue, sourceQuestionRef: finding.sourceQuestionRef }))
	);
}

function parentMarkTotals(questions) {
	const totals = {};
	for (const question of questions) {
		const parent =
			question.parentSourceQuestionRef ?? parentRef(question.sourceQuestionRef) ?? 'unknown';
		totals[parent] = (totals[parent] ?? 0) + Number(question.marks ?? 0);
	}
	return totals;
}

function parentRef(ref) {
	const match = String(ref ?? '').match(/^(\d{2})\./);
	return match ? match[1] : null;
}

function parseCrop(value) {
	const [x, y, width, height] = value.split(',').map((part) => Number(part.trim()));
	if (![x, y, width, height].every((part) => Number.isFinite(part))) {
		throw new Error('--crop must be x,y,width,height');
	}
	return { x, y, width, height };
}

function readPgm(filePath) {
	const text = readFileSync(filePath, 'utf8');
	const tokens = text
		.replace(/#[^\n]*/g, '')
		.trim()
		.split(/\s+/);
	if (tokens[0] !== 'P2') throw new Error('Expected ASCII PGM P2 output from convert.');
	const width = Number(tokens[1]);
	const height = Number(tokens[2]);
	const max = Number(tokens[3]);
	const values = tokens.slice(4).map(Number);
	return { width, height, max, values };
}

function detectHorizontalLines(image, { threshold, minRunRatio, minDarkRatio }) {
	const rows = [];
	for (let y = 0; y < image.height; y += 1) {
		let dark = 0;
		let longestRun = 0;
		let currentRun = 0;
		for (let x = 0; x < image.width; x += 1) {
			const value = image.values[y * image.width + x];
			if (value <= threshold) {
				dark += 1;
				currentRun += 1;
				longestRun = Math.max(longestRun, currentRun);
			} else {
				currentRun = 0;
			}
		}
		const darkRatio = dark / image.width;
		const runRatio = longestRun / image.width;
		if (darkRatio >= minDarkRatio && runRatio >= minRunRatio) rows.push({ y, darkRatio, runRatio });
	}
	const groups = [];
	for (const row of rows) {
		const previous = groups[groups.length - 1];
		if (previous && row.y <= previous.endY + 2) {
			previous.endY = row.y;
			previous.rows.push(row);
		} else {
			groups.push({ startY: row.y, endY: row.y, rows: [row] });
		}
	}
	const lineYs = groups.map((group) => Math.round((group.startY + group.endY) / 2));
	return { lineCount: lineYs.length, lineYs, groups };
}

function shellQuote(value) {
	return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function fileHash(filePath) {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function pdfPageCount(filePath) {
	const output = pdfInfo(filePath).raw;
	const match = output.match(/^Pages:\s+(\d+)/m);
	if (!match) throw new Error(`Could not read page count for ${filePath}`);
	return Number(match[1]);
}

function bestEffortPdfPageCount(filePath) {
	try {
		return pdfPageCount(filePath);
	} catch {
		return 0;
	}
}

function pdfInfo(filePath) {
	try {
		return {
			tool: 'pdfinfo',
			raw: execFileSync('pdfinfo', [filePath], { encoding: 'utf8' })
		};
	} catch (pdfInfoError) {
		try {
			return {
				tool: 'mutool info',
				raw: execFileSync('mutool', ['info', filePath], { encoding: 'utf8' })
			};
		} catch (mutoolError) {
			const pdfMessage =
				pdfInfoError instanceof Error ? pdfInfoError.message : String(pdfInfoError);
			const mutoolMessage =
				mutoolError instanceof Error ? mutoolError.message : String(mutoolError);
			throw new Error(
				`Could not inspect PDF ${filePath}. pdfinfo: ${pdfMessage}; mutool: ${mutoolMessage}`,
				{ cause: mutoolError }
			);
		}
	}
}

function pdfText(filePath, maxChars = 140000, pages = []) {
	const args = ['-layout'];
	if (pages.length) {
		args.push('-f', String(Math.min(...pages)), '-l', String(Math.max(...pages)));
	}
	args.push(filePath, '-');
	const text = execFileSync('pdftotext', args, {
		encoding: 'utf8',
		maxBuffer: Math.max(maxChars * 4, 1024 * 1024)
	});
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n[truncated to ${maxChars} characters]`;
}
