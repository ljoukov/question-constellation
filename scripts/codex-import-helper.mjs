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

const rootDir = process.cwd();
let localPathBaseDir = rootDir;
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

try {
	if (command === 'help' || hasArg('help')) printHelp();
	else if (command === 'pdf-info') pdfInfoCommand();
	else if (command === 'pdftotext-pages') pdfTextPagesCommand();
	else if (command === 'render-pages') renderPagesCommand();
	else if (command === 'extract-embedded-images') extractEmbeddedImagesCommand();
	else if (command === 'contact-sheet') contactSheetCommand();
	else if (command === 'line-count') lineCountCommand();
	else if (command === 'detect-lines-from-pgm') detectLinesFromPgmCommand();
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
	const blocking = blockingIssues(deterministicIssues);
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
	const assets = normalizeAssets(
		question.assets ?? question.requiredAssets ?? [],
		question.sourceQuestionRef
	);
	const needsHumanReview = question.needsHumanReview === true;
	return {
		id: question.id ?? null,
		sourceQuestionRef: question.sourceQuestionRef,
		parentSourceQuestionRef:
			question.parentSourceQuestionRef ?? parentRef(question.sourceQuestionRef),
		displayOrder: question.displayOrder ?? index + 1,
		promptText,
		selfContainedPromptText: question.selfContainedPromptText ?? promptText,
		contextText: question.contextText ?? null,
		commandWord: question.commandWord ?? null,
		marks: numberOrNull(question.marks),
		pageStart: question.pageStart ?? null,
		pageEnd: question.pageEnd ?? question.pageStart ?? null,
		topicPath: question.topicPath ?? [],
		specRef: question.specRef ?? null,
		stemBlocks: normalizeBlocks(contextBlocks),
		leadBlocks: normalizeBlocks(question.leadBlocks ?? []),
		promptBlocks: normalizeBlocks(
			question.promptBlocks ?? [{ kind: 'paragraph', text: promptText }]
		),
		response: normalizeResponse(question.response, question.marks),
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
		modelAnswer: normalizeModelAnswer(question.modelAnswer),
		answerChain: question.answerChain ?? placeholderChain(question, sourceDocument.subjectArea),
		chainResolution: question.chainResolution ?? {
			action: 'needs_review',
			existingChainId: null,
			compatibilityRationale: 'Codex PDF extraction defers answer-chain assignment.',
			identityStable: false
		},
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

function normalizeAssets(assets, sourceQuestionRef) {
	return (assets ?? []).map((asset, index) => {
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
			const kind = block.kind ?? 'paragraph';
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
					rows: block.rows,
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
				rows: block.rows ?? null,
				items: block.items ?? null,
				keyItems: block.keyItems ?? null,
				compact: block.compact ?? null,
				wide: block.wide ?? null
			};
		})
		.filter(Boolean);
}

function normalizeResponse(response, marks) {
	if (!response?.kind) return { kind: marks ? 'lines' : 'none', count: marks ?? null };
	const output = canonicalResponse(response);
	if (output.kind === 'lines' && output.count === undefined)
		output.count = output.lineCount ?? marks ?? 1;
	if (output.kind === 'labeled-lines' && output.lineCount === undefined)
		output.lineCount = output.count ?? null;
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
			options: (response.options ?? []).map(String),
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

function marksFromResponse(response) {
	return Number(response?.lineCount ?? response?.count ?? 0) > 0;
}

function normalizeCorrectAnswers(value) {
	if (!value) return [];
	if (!Array.isArray(value) && typeof value === 'object') {
		return Object.entries(value)
			.filter(([, answer]) => answer !== null && answer !== undefined && String(answer).trim())
			.map(([targetId, answer]) => ({ targetId, correctAnswer: String(answer).trim() }));
	}
	return (Array.isArray(value) ? value : [value])
		.map((answer, index) => {
			if (typeof answer === 'string' || typeof answer === 'number') {
				return { targetId: 'answer', correctAnswer: String(answer).trim() };
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
			return { targetId: String(targetId), correctAnswer: String(correctAnswer).trim() };
		})
		.filter(Boolean);
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
		if (expectedLineCounts.has(ref)) {
			const expected = expectedLineCounts.get(ref);
			const actual = responseVisibleLineCount(response);
			if (actual !== expected) {
				issues.push({
					code: 'known_response_line_count_mismatch',
					field: 'response.lineCount',
					severity: 'error',
					evidence: `${ref}: expected ${expected}, found ${actual ?? 'missing'}`
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
				'aqa-computer-science-2024-june-paper-2-computing-concepts-qp'
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
			}
		}
		if (issues.length) findings.push({ sourceQuestionRef: ref, issues });
	}
	return findings;
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

function expectedResponseLineCountsForSource(sourceDocumentId) {
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
	if (!['lines', 'labeled-lines'].includes(response?.kind)) return null;
	if (Number.isFinite(Number(response.lineCount))) return Number(response.lineCount);
	if (Number.isFinite(Number(response.count))) return Number(response.count);
	if (Array.isArray(response.fields)) {
		const total = response.fields.reduce((sum, field) => sum + Number(field?.lineCount ?? 0), 0);
		return total || null;
	}
	return null;
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
	const gradingText = [
		...(question.markSchemeItems ?? []).map((item) => item.text),
		...(question.markChecklist ?? []).map((item) => item.text)
	]
		.filter(Boolean)
		.join('\n')
		.toLowerCase();
	const modelAnswerText = String(question.modelAnswer?.answerText ?? '').toLowerCase();
	if (sourceDocumentId === 'aqa-computer-science-2024-june-paper-2-computing-concepts-qp') {
		if (['04.1', '04.2'].includes(ref)) {
			const figureOneAssets = (question.assets ?? []).filter((asset) =>
				[asset.sourceLabel, asset.assetLabel, asset.label, asset.assetId]
					.filter(Boolean)
					.some((label) => normalizedMediaLabel(label) === 'figure 1')
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
					.some((label) => normalizedMediaLabel(label) === 'figure 2')
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
	const blockLabels = new Set();
	for (const block of [
		...(question.stemBlocks ?? []),
		...(question.leadBlocks ?? []),
		...(question.promptBlocks ?? []),
		...(question.afterResponseBlocks ?? [])
	]) {
		for (const label of [block?.label, block?.assetLabel, block?.sourceLabel].filter(Boolean)) {
			blockLabels.add(normalizedMediaLabel(label));
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
		const isTable = normalized.startsWith('table ');
		if (renderableAssetLabels.has(normalized)) continue;
		if (isTable && blockLabels.has(normalized)) continue;
		missing.push(label);
	}
	return [...new Set(missing)];
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

function blockPlainText(block) {
	if (!block || typeof block !== 'object') return '';
	if (typeof block.text === 'string') return block.text;
	if (Array.isArray(block.items)) return block.items.join(' ');
	return '';
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
