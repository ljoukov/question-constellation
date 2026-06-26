#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { generateJson, loadLocalEnv } from '@ljoukov/llm';
import {
	blockingAnswerChainSpecificityIssues,
	chainSpecificityIssueSummary
} from './answer-chain-specificity.mjs';

const rootDir = process.cwd();
const dataRoot = path.join(rootDir, 'data/aqa-combined-science-trilogy-higher');
const questionPaperDir = path.join(dataRoot, 'question-papers');
const markSchemeDir = path.join(dataRoot, 'mark-schemes');
const localAssetRoot = path.join(dataRoot, 'assets/question-papers');
const outputRoot = path.join(
	rootDir,
	'data/vision-extracted/aqa-combined-science-trilogy-higher/physics'
);
const renderRoot = path.join(rootDir, 'tmp/pdfs/physics-vision');
const taxonomyPath = path.join(rootDir, 'docs/physics-chain-family-taxonomy.md');
const extractionSpecPath = path.join(rootDir, 'docs/extraction-spec.md');
const defaultModel = process.env.PHYSICS_VISION_MODEL ?? 'chatgpt-gpt-5.5-fast';
const defaultDpi = 140;

const paperArg = stringArg('paper', '');
const allPapers = hasArg('all');
const force = hasArg('force');
const dryRun = hasArg('dry-run');
const model = stringArg('model', defaultModel);
const dpi = integerArg('dpi', defaultDpi, 90);
const chunkPages = integerArg('chunk-pages', 6, 1);

if (!paperArg && !allPapers) {
	throw new Error('Pass --paper=<source_document_id> or --all.');
}

loadLocalEnv();
process.env.CHATGPT_RESPONSES_WEBSOCKET_MODE = 'off';
process.env.CHATGPT_RESPONSES_EXPERIMENTAL_HEADER = 'off';

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function integerArg(name, defaultValue, minValue) {
	const value = stringArg(name, '');
	if (!value) return defaultValue;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minValue) {
		throw new Error(`--${name} must be an integer >= ${minValue}.`);
	}
	return parsed;
}

function sha256(filePath) {
	return `sha256:${createHash('sha256').update(readFileSync(filePath)).digest('hex')}`;
}

function slugify(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function parsePaperFilename(fileName) {
	const match = fileName.match(/^AQA-(8464P[12]H)-QP-([A-Z]{3}\d{2})\.PDF$/i);
	if (!match) return null;
	const componentCode = match[1].toUpperCase();
	const seriesCode = match[2].toUpperCase();
	return {
		componentCode,
		seriesCode,
		sourceDocumentId: `aqa-${componentCode.toLowerCase()}-qp-${seriesCode.toLowerCase()}`
	};
}

function parseSeries(seriesCode) {
	const monthCode = seriesCode.slice(0, 3).toUpperCase();
	const year = 2000 + Number(seriesCode.slice(3));
	const month = monthCode === 'JUN' ? 'June' : monthCode === 'NOV' ? 'November' : monthCode;
	return { month, year, series: `${month} ${year}` };
}

function paperLabel(componentCode) {
	return componentCode.includes('P1') ? 'Physics Paper 1' : 'Physics Paper 2';
}

function titleForQuestionPaper(componentCode, series) {
	return `Question paper (Higher): ${paperLabel(componentCode)} - ${series}`;
}

function titleForMarkScheme(componentCode, series) {
	return `Mark scheme (Higher): ${paperLabel(componentCode)} - ${series}`;
}

function discoverPapers() {
	const papers = [];
	for (const fileName of readdirSync(questionPaperDir).sort()) {
		const parsed = parsePaperFilename(fileName);
		if (!parsed) continue;
		const markSchemeFile = findMarkSchemeFile(parsed.componentCode, parsed.seriesCode);
		if (!markSchemeFile) {
			throw new Error(`No matching mark scheme found for ${fileName}.`);
		}
		const { series, year } = parseSeries(parsed.seriesCode);
		const qpPath = path.join(questionPaperDir, fileName);
		const msPath = path.join(markSchemeDir, markSchemeFile);
		const markSchemeDocumentId = parsed.sourceDocumentId.replace('-qp-', '-ms-');
		papers.push({
			...parsed,
			questionPaperFileName: fileName,
			markSchemeFileName: markSchemeFile,
			questionPaperPath: qpPath,
			markSchemePath: msPath,
			markSchemeDocumentId,
			series,
			year,
			paper: paperLabel(parsed.componentCode)
		});
	}
	return papers;
}

function findMarkSchemeFile(componentCode, seriesCode) {
	const candidates = [
		`AQA-${componentCode}-MS-${seriesCode}.PDF`,
		`AQA-${componentCode}-W-MS-${seriesCode}.PDF`
	];
	const files = new Set(readdirSync(markSchemeDir));
	return candidates.find((candidate) => files.has(candidate)) ?? null;
}

function pdfPageCount(filePath) {
	const raw = execFileSync('pdfinfo', [filePath], { encoding: 'utf8' });
	const match = raw.match(/^Pages:\s+(\d+)/m);
	if (!match) throw new Error(`Could not read PDF page count from ${filePath}.`);
	return Number(match[1]);
}

function renderPdfPages(pdfPath, outputDir, prefix) {
	mkdirSync(outputDir, { recursive: true });
	const existing = readdirSync(outputDir).filter((fileName) => fileName.endsWith('.png'));
	if (!force && existing.length > 0) {
		return imageFiles(outputDir);
	}
	execFileSync('pdftoppm', ['-r', String(dpi), '-png', pdfPath, path.join(outputDir, prefix)], {
		stdio: ['ignore', 'pipe', 'pipe']
	});
	return imageFiles(outputDir);
}

function imageFiles(dir) {
	return readdirSync(dir)
		.filter((fileName) => fileName.endsWith('.png'))
		.sort()
		.map((fileName) => path.join(dir, fileName));
}

function pageNumberFromRenderedPath(filePath) {
	const match = path.basename(filePath).match(/-(\d+)\.png$/);
	return match ? Number(match[1]) : null;
}

function imagePart(filePath) {
	return {
		type: 'inlineData',
		mimeType: 'image/png',
		data: readFileSync(filePath).toString('base64'),
		filename: path.basename(filePath)
	};
}

function assetManifest(sourceDocumentId) {
	const dir = path.join(localAssetRoot, sourceDocumentId);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((fileName) => /\.(png|jpe?g|webp)$/i.test(fileName))
		.sort()
		.map((fileName) => {
			const page = Number(fileName.match(/^image-(\d{3})-/i)?.[1] ?? 0) || null;
			const relativePath = path
				.relative(rootDir, path.join(dir, fileName))
				.split(path.sep)
				.join('/');
			return {
				page,
				fileName,
				filePath: relativePath,
				publicPath: `/images/papers/${sourceDocumentId}/${fileName}`,
				r2Key: `images/papers/${sourceDocumentId}/${fileName}`
			};
		});
}

function compactAssetManifestText(assets) {
	if (!assets.length) return 'No extracted local image assets found for this paper.';
	const byPage = new Map();
	for (const asset of assets) {
		const page = asset.page ?? 'unknown';
		const rows = byPage.get(page) ?? [];
		rows.push(asset);
		byPage.set(page, rows);
	}
	return Array.from(byPage.entries())
		.sort((a, b) => Number(a[0]) - Number(b[0]))
		.map(
			([page, rows]) =>
				`page ${page}: ${rows
					.map((asset) => `${asset.fileName} -> ${asset.publicPath}`)
					.join('; ')}`
		)
		.join('\n');
}

function relevantSpecExcerpt() {
	const raw = readFileSync(extractionSpecPath, 'utf8');
	const start = raw.indexOf('## Render Extraction Methodology');
	const contract = raw.indexOf('## Output Contract');
	return raw.slice(start, Math.min(raw.length, contract + 2600));
}

function taxonomyExcerpt() {
	if (!existsSync(taxonomyPath)) return '';
	const raw = readFileSync(taxonomyPath, 'utf8');
	return raw
		.split(/\r?\n/)
		.filter((line) => /physics-chain-|^## |^### /.test(line))
		.join('\n')
		.slice(0, 18000);
}

function createBlockSchema() {
	return z.object({
		kind: z.enum([
			'paragraph',
			'equation',
			'figure',
			'table',
			'structured-table',
			'ordered-list',
			'bullet-list',
			'key'
		]),
		text: z.string().nullable(),
		label: z.string().nullable(),
		assetLabel: z.string().nullable(),
		columns: z.array(z.string()).nullable(),
		rows: z.array(z.array(z.string())).nullable(),
		items: z.array(z.string()).nullable(),
		keyItems: z.array(z.object({ marker: z.string(), text: z.string() })).nullable(),
		compact: z.boolean().nullable(),
		wide: z.boolean().nullable()
	});
}

function createResponseSchema() {
	return z.object({
		kind: z.enum([
			'none',
			'lines',
			'labeled-lines',
			'number-line',
			'choice',
			'choice-table',
			'matching',
			'asset-canvas',
			'drawing-box',
			'equation-blanks',
			'image-label-zones'
		]),
		count: z.number().nullable(),
		lineCount: z.number().nullable(),
		labels: z.array(z.string()).nullable(),
		label: z.string().nullable(),
		prefix: z.string().nullable(),
		unit: z.string().nullable(),
		options: z.array(z.string()).nullable(),
		layout: z.enum(['vertical', 'horizontal']).nullable(),
		columns: z.array(z.string()).nullable(),
		rows: z.array(z.array(z.string())).nullable(),
		leftTitle: z.string().nullable(),
		rightTitle: z.string().nullable(),
		left: z.array(z.string()).nullable(),
		right: z.array(z.string()).nullable(),
		assetLabel: z.string().nullable(),
		labelBank: z.array(z.string()).nullable(),
		segments: z
			.array(
				z.object({
					kind: z.enum(['text', 'math', 'blank']),
					text: z.string().nullable(),
					id: z.string().nullable(),
					label: z.string().nullable(),
					width: z.number().nullable()
				})
			)
			.nullable(),
		zones: z
			.array(
				z.object({
					id: z.string(),
					label: z.string(),
					x: z.number(),
					y: z.number(),
					width: z.number(),
					height: z.number()
				})
			)
			.nullable(),
		allowRepeats: z.boolean().nullable(),
		correctAnswers: z
			.array(z.object({ targetId: z.string(), correctAnswer: z.string() }))
			.nullable()
	});
}

const PaperSchema = z.object({
	extractionRun: z.object({
		agentVersion: z.string(),
		needsHumanReview: z.boolean(),
		reviewNotes: z.array(z.string())
	}),
	sourceDocument: z.object({
		id: z.string(),
		title: z.string(),
		pageCount: z.number()
	}),
	markSchemeDocument: z.object({
		id: z.string(),
		title: z.string(),
		pageCount: z.number()
	}),
	questions: z.array(
		z.object({
			id: z.string().nullable(),
			sourceQuestionRef: z.string(),
			parentSourceQuestionRef: z.string().nullable(),
			displayOrder: z.number(),
			promptText: z.string(),
			selfContainedPromptText: z.string().nullable(),
			contextText: z.string().nullable(),
			commandWord: z.string().nullable(),
			marks: z.number().nullable(),
			pageStart: z.number(),
			pageEnd: z.number(),
			topicPath: z.array(z.string()),
			specRef: z.string().nullable(),
			stemBlocks: z.array(createBlockSchema()),
			leadBlocks: z.array(createBlockSchema()),
			promptBlocks: z.array(createBlockSchema()),
			response: createResponseSchema(),
			afterResponseBlocks: z.array(createBlockSchema()),
			assets: z.array(
				z.object({
					sourceLabel: z.string(),
					assetType: z.string(),
					role: z.string(),
					pageNumber: z.number().nullable(),
					localAssetFileName: z.string().nullable(),
					publicPath: z.string().nullable(),
					altText: z.string(),
					required: z.boolean(),
					needsHumanReview: z.boolean(),
					reviewNotes: z.array(z.string())
				})
			),
			markSchemeItems: z.array(
				z.object({
					itemType: z.string(),
					text: z.string(),
					marks: z.number().nullable(),
					sourceRef: z.string(),
					confidence: z.number().nullable()
				})
			),
			markChecklist: z.array(
				z.object({
					text: z.string(),
					required: z.boolean(),
					markSchemeItemIndexes: z.array(z.number()),
					confidence: z.number().nullable(),
					needsHumanReview: z.boolean()
				})
			),
			modelAnswer: z
				.object({
					answerText: z.string(),
					confidence: z.number(),
					needsHumanReview: z.boolean()
				})
				.nullable(),
			answerChain: z.object({
				id: z.string().nullable(),
				title: z.string(),
				canonicalChainText: z.string(),
				summary: z.string(),
				broadTopic: z.string().nullable(),
				chainFamilyId: z.string().nullable(),
				steps: z.array(
					z.object({
						stepText: z.string(),
						stepRole: z.string(),
						explanation: z.string().nullable(),
						commonOmission: z.string().nullable(),
						markSchemeItemIndexes: z.array(z.number())
					})
				),
				confidence: z.number(),
				needsHumanReview: z.boolean(),
				reviewNotes: z.array(z.string())
			}),
			commonWeakAnswers: z.array(
				z.object({
					weakAnswerText: z.string(),
					missingStepIndexes: z.array(z.number()),
					explanation: z.string(),
					confidence: z.number()
				})
			),
			extractionConfidence: z.number(),
			needsHumanReview: z.boolean(),
			reviewNotes: z.array(z.string())
		})
	)
});

function buildPrompt(paper, qpImages, msImages, assets, chunk = null) {
	return [
		'Extract this full AQA GCSE Combined Science Physics Higher paper into the JSON schema.',
		'Use the question paper page images and mark scheme page images as the source of truth.',
		'This is not a PDF-to-text cleanup task: use visual layout, tables, figures, answer lines, tick boxes, and formula formatting.',
		chunk
			? `This is chunk ${chunk.index + 1} of ${chunk.total}. Extract only atomic marked questions whose question/subquestion number begins on core question-paper pages ${chunk.corePages.join(', ')}. Use any included lookahead page only to complete a question that started on a core page. Do not extract questions whose number first appears only on a lookahead page.`
			: null,
		'Do not include page furniture, outside-box instructions, copyright, barcodes, page numbers, or generic mark-scheme instructions.',
		'Use Markdown **bold** for bold words in question text. Use TeX for equations and units where appropriate, such as $I \\propto \\frac{1}{d^2}$ and $\\text{density}=\\frac{\\text{mass}}{\\text{volume}}$.',
		'Extract every atomic marked question/subquestion. Do not create rows for unmarked parent stems. Put shared parent context into stemBlocks for each dependent subquestion so single-question mode is self-contained.',
		'Do not duplicate a figure/table caption in prose and as a figure/table block. If a sentence says "shown in Figure 3", keep that sentence as text; the actual Figure 3 block should appear separately once.',
		'Do not duplicate answer-bank words, MCQ options, matching terms, image-label labels, or equation blanks as ordinary prompt/key blocks when they are already represented in the response object. The response object is the source of truth for interactive answer choices.',
		'For response objects, count official answer lines. Use fixed-response kinds for MCQ/tick boxes/matching/equation blanks/image-label tasks. Put correct fixed answers in response.correctAnswers as an array of {targetId, correctAnswer} when the mark scheme gives them. Use targetId "answer" for a single selected choice.',
		'For mark schemes, preserve level descriptors as markSchemeItems but convert positive marking evidence into student-facing checklist items. Keep allow/reject/guidance out of required checklist rows unless they are genuinely creditworthy alternatives.',
		'For written-response questions, generate a concise modelAnswer from the official mark scheme only. Do not include AO/spec refs, mark counts, examiner instructions, or raw row numbers in model answers.',
		'For answer chains, every marked question must have an answerChain. Multi-step questions need the reusable reasoning/practical/calculation chain. Simple recall, label, or MCQ questions still need a compact single-step answer-move chain that states the reusable discrimination or fact family being tested; do not use answerChain=null.',
		'Answer chains must be reusable method patterns, not solved worked answers. Put prompt-specific values, substitutions, intermediate calculations, final numeric answers, and units tied to one question in markChecklist/modelAnswer only. Chain steps should say "convert the extension to metres", "substitute into $E_e=\\frac{1}{2}ke^2$", and "calculate the energy with the correct unit", not "substitute $k=8500$ and $e=0.012$" or "calculate $E_e=0.612$".',
		'When a chain matches a known Physics chain id below, reuse that id exactly. Otherwise invent a stable id starting physics-chain-.',
		'Asset mapping: use localAssetFileName/publicPath only when the figure/table/graph visibly corresponds to one of the local extracted assets. If unsure, leave localAssetFileName null and mark the asset/question needsHumanReview.',
		'',
		`Paper: ${paper.sourceDocumentId}`,
		`Question paper filename: ${paper.questionPaperFileName}`,
		`Mark scheme filename: ${paper.markSchemeFileName}`,
		`Component: ${paper.componentCode}`,
		`Series: ${paper.series}`,
		`Question paper pages included: ${qpImages.map(pageNumberFromRenderedPath).join(', ')}`,
		chunk ? `Core extraction pages: ${chunk.corePages.join(', ')}` : null,
		chunk?.lookaheadPages?.length
			? `Lookahead-only pages: ${chunk.lookaheadPages.join(', ')}`
			: null,
		`Mark scheme pages included: ${msImages.map(pageNumberFromRenderedPath).join(', ')}`,
		'',
		'Local extracted asset manifest:',
		compactAssetManifestText(assets),
		'',
		'Known Physics chain ids and family context:',
		taxonomyExcerpt(),
		'',
		'Extraction methodology requirements:',
		relevantSpecExcerpt()
	]
		.filter(Boolean)
		.join('\n');
}

function chunkQuestionPaperImages(qpImages) {
	const chunks = [];
	for (let start = 0; start < qpImages.length; start += chunkPages) {
		const coreImages = qpImages.slice(start, Math.min(start + chunkPages, qpImages.length));
		const lookaheadImages =
			start + chunkPages < qpImages.length
				? qpImages.slice(start + chunkPages, start + chunkPages + 1)
				: [];
		chunks.push({
			index: chunks.length,
			coreImages,
			lookaheadImages,
			images: [...coreImages, ...lookaheadImages],
			corePages: coreImages.map(pageNumberFromRenderedPath),
			lookaheadPages: lookaheadImages.map(pageNumberFromRenderedPath)
		});
	}
	return chunks.map((chunk) => ({ ...chunk, total: chunks.length }));
}

async function extractChunk(paper, chunk, msImages, assets) {
	const prompt = buildPrompt(paper, chunk.images, msImages, assets, chunk);
	const input = [
		{
			role: 'system',
			content:
				'You are a careful exam-paper extraction agent. You read page images visually and return complete, source-grounded JSON for rendering, grading, and answer-chain practice.'
		},
		{
			role: 'user',
			content: [
				{ type: 'text', text: prompt },
				{ type: 'text', text: 'QUESTION PAPER PAGE IMAGES FOLLOW, IN ORDER.' },
				...chunk.images.map(imagePart),
				{ type: 'text', text: 'MARK SCHEME PAGE IMAGES FOLLOW, IN ORDER.' },
				...msImages.map(imagePart)
			]
		}
	];

	console.log(
		JSON.stringify(
			{
				paper: paper.sourceDocumentId,
				chunk: `${chunk.index + 1}/${chunk.total}`,
				core_pages: chunk.corePages,
				lookahead_pages: chunk.lookaheadPages,
				question_pages_sent: chunk.images.length,
				mark_scheme_pages: msImages.length
			},
			null,
			2
		)
	);

	const { value } = await generateJson({
		model,
		thinkingLevel: 'medium',
		telemetry: false,
		input,
		schema: PaperSchema
	});
	console.log(
		`chunk ${chunk.index + 1}/${chunk.total} extracted ${value.questions.length} questions for ${paper.sourceDocumentId}`
	);
	return value;
}

function mergeChunkValues(values) {
	if (values.length === 0) throw new Error('No chunk values to merge.');
	const questionsByRef = new Map();
	for (const value of values) {
		for (const question of value.questions ?? []) {
			if (!question.sourceQuestionRef) continue;
			const existing = questionsByRef.get(question.sourceQuestionRef);
			if (
				!existing ||
				(question.extractionConfidence ?? 0) > (existing.extractionConfidence ?? 0)
			) {
				questionsByRef.set(question.sourceQuestionRef, question);
			}
		}
	}
	const questions = Array.from(questionsByRef.values())
		.sort((a, b) => compareQuestionRefs(a.sourceQuestionRef, b.sourceQuestionRef))
		.map((question, index) => ({ ...question, displayOrder: index + 1 }));
	return {
		...values[0],
		questions,
		extractionRun: {
			...values[0].extractionRun,
			chunkCount: values.length,
			needsHumanReview: values.some((value) => value.extractionRun?.needsHumanReview)
		}
	};
}

function compareQuestionRefs(left, right) {
	const leftParts = String(left ?? '')
		.split('.')
		.map((part) => Number(part));
	const rightParts = String(right ?? '')
		.split('.')
		.map((part) => Number(part));
	const length = Math.max(leftParts.length, rightParts.length);
	for (let index = 0; index < length; index += 1) {
		const leftPart = leftParts[index] ?? -1;
		const rightPart = rightParts[index] ?? -1;
		if (leftPart !== rightPart) return leftPart - rightPart;
	}
	return String(left ?? '').localeCompare(String(right ?? ''));
}

function validateAnswerChains(value, paper) {
	const failures = [];
	for (const question of value.questions ?? []) {
		const issues = blockingAnswerChainSpecificityIssues(question.answerChain, {
			commandWord: question.commandWord
		});
		if (!issues.length) continue;
		failures.push(
			`${paper.sourceDocumentId} ${question.sourceQuestionRef} ${question.answerChain?.id ?? 'no-chain-id'}: ${chainSpecificityIssueSummary(issues, 4)}`
		);
	}
	if (failures.length > 0) {
		throw new Error(
			`Extracted answer chains include prompt-specific numeric solution steps (${failures.length}). ` +
				`Regenerate with reusable method wording. Examples: ${failures.slice(0, 8).join(' | ')}`
		);
	}
}

async function extractPaper(paper) {
	const outPath = path.join(outputRoot, `${paper.sourceDocumentId}.json`);
	if (existsSync(outPath) && !force) {
		console.log(`skip existing ${path.relative(rootDir, outPath)}`);
		return;
	}

	const qpPageCount = pdfPageCount(paper.questionPaperPath);
	const msPageCount = pdfPageCount(paper.markSchemePath);
	const paperRenderDir = path.join(renderRoot, paper.sourceDocumentId);
	const qpImages = renderPdfPages(
		paper.questionPaperPath,
		path.join(paperRenderDir, 'qp'),
		'qp-page'
	);
	const msImages = renderPdfPages(paper.markSchemePath, path.join(paperRenderDir, 'ms'), 'ms-page');
	const assets = assetManifest(paper.sourceDocumentId);
	const chunks = chunkQuestionPaperImages(qpImages);

	console.log(
		JSON.stringify(
			{
				paper: paper.sourceDocumentId,
				model,
				dpi,
				chunk_pages: chunkPages,
				chunks: chunks.length,
				question_pages: qpImages.length,
				mark_scheme_pages: msImages.length,
				assets: assets.length,
				output: path.relative(rootDir, outPath),
				dry_run: dryRun
			},
			null,
			2
		)
	);

	if (dryRun) return;

	const chunkValues = [];
	for (const chunk of chunks) {
		chunkValues.push(await extractChunk(paper, chunk, msImages, assets));
	}
	const value = mergeChunkValues(chunkValues);

	const enriched = {
		...value,
		extractionRun: {
			...value.extractionRun,
			source: 'llm-vision-original-pdf-page-images',
			model,
			dpi,
			extractedAt: new Date().toISOString()
		},
		sourceDocument: {
			...value.sourceDocument,
			id: paper.sourceDocumentId,
			docType: 'question_paper',
			board: 'AQA',
			qualification: 'GCSE',
			subject: 'Combined Science',
			subjectArea: 'Physics',
			tier: 'Higher',
			paper: paper.paper,
			componentCode: paper.componentCode,
			series: paper.series,
			year: paper.year,
			title: titleForQuestionPaper(paper.componentCode, paper.series),
			filePath: path.relative(rootDir, paper.questionPaperPath).split(path.sep).join('/'),
			fileHash: sha256(paper.questionPaperPath),
			pageCount: qpPageCount,
			metadata: { aqa_original_filename: paper.questionPaperFileName }
		},
		markSchemeDocument: {
			...value.markSchemeDocument,
			id: paper.markSchemeDocumentId,
			docType: 'mark_scheme',
			board: 'AQA',
			qualification: 'GCSE',
			subject: 'Combined Science',
			subjectArea: 'Physics',
			tier: 'Higher',
			paper: paper.paper,
			componentCode: paper.componentCode,
			series: paper.series,
			year: paper.year,
			title: titleForMarkScheme(paper.componentCode, paper.series),
			filePath: path.relative(rootDir, paper.markSchemePath).split(path.sep).join('/'),
			fileHash: sha256(paper.markSchemePath),
			pageCount: msPageCount,
			metadata: { aqa_original_filename: paper.markSchemeFileName }
		},
		localAssetManifest: assets
	};

	validateAnswerChains(enriched, paper);

	mkdirSync(path.dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(enriched, null, 2)}\n`);
	console.log(`wrote ${path.relative(rootDir, outPath)} (${enriched.questions.length} questions)`);
}

const papers = discoverPapers();
const selectedPapers = allPapers
	? papers
	: papers.filter(
			(paper) => paper.sourceDocumentId === paperArg || paper.componentCode === paperArg
		);

if (!selectedPapers.length) {
	throw new Error(`No Physics paper matched ${paperArg}.`);
}

for (const paper of selectedPapers) {
	await extractPaper(paper);
}
