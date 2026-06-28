#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { readJson, renderPdfPages, writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const inputRoot = path.resolve(
	rootDir,
	stringArg('input-root', 'data/vision-extracted/aqa-separate-science-higher')
);
const assetRoot = path.resolve(
	rootDir,
	stringArg(
		'asset-root',
		'data/vision-extracted/aqa-separate-science-higher/assets/question-papers'
	)
);
const manifestPath = path.resolve(
	rootDir,
	stringArg('manifest', 'data/aqa-separate-science-higher/manifest.json')
);
const sourcePdfRoot = path.resolve(
	rootDir,
	stringArg('source-pdf-root', 'data/aqa-separate-science-higher/question-papers')
);
const paperArg = stringArg('paper', '');
const subjectArg = stringArg('subject', 'all').toLowerCase();
const dpi = integerArg('dpi', 120, 72);
const all = hasArg('all');
const recursive = hasArg('recursive') || all;
const dryRun = hasArg('dry-run');
const repairTextReferences = hasArg('repair-text-references');

if (!all && !paperArg) throw new Error('Pass --all or --paper=<source-document-id>.');
if (!existsSync(manifestPath)) throw new Error(`Missing manifest ${relative(manifestPath)}.`);
if (!existsSync(inputRoot)) throw new Error(`Missing input root ${relative(inputRoot)}.`);

const manifest = readJson(manifestPath);
const sourcePdfs = new Map(
	(manifest.rows ?? []).map((row) => [
		row.source_document_id,
		path.join(sourcePdfRoot, row.question_paper.filename)
	])
);
const files = selectInputFiles();
const results = [];
for (const filePath of files) {
	const result = repairFile(filePath);
	results.push(result);
}

const summary = {
	status: results.some((result) => result.error) ? 'failed' : 'passed',
	dryRun,
	inputRoot: relative(inputRoot),
	assetRoot: relative(assetRoot),
	files: results.length,
	questionsRepaired: results.reduce((sum, result) => sum + result.questionsRepaired, 0),
	assetsCreated: results.reduce((sum, result) => sum + result.assetsCreated, 0),
	blocksRemoved: results.reduce((sum, result) => sum + result.blocksRemoved, 0),
	repairTextReferences,
	results
};
console.log(JSON.stringify(summary, null, 2));
if (summary.status !== 'passed') process.exit(1);

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
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

function walkJsonFiles(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const filePath = path.join(dir, name);
		const stat = statSync(filePath);
		if (stat.isDirectory()) {
			if (recursive) out.push(...walkJsonFiles(filePath));
		} else if (name.endsWith('.json')) {
			out.push(filePath);
		}
	}
	return out.sort();
}

function selectInputFiles() {
	return walkJsonFiles(inputRoot).filter((filePath) => {
		const paper = readJson(filePath);
		const sourceDocumentId = paper.sourceDocument?.id ?? paper.sourceDocumentId ?? '';
		const subject = String(
			paper.sourceDocument?.subjectArea ??
				paper.sourceDocument?.subject ??
				path.basename(path.dirname(filePath))
		).toLowerCase();
		return (
			(!paperArg || sourceDocumentId === paperArg) &&
			(subjectArg === 'all' || subject === subjectArg)
		);
	});
}

function responseAssetLabels(question) {
	const response = question.response;
	if (!response || typeof response !== 'object') return [];
	if (!['asset-canvas', 'image-label-zones'].includes(response.kind)) return [];
	const explicit = [
		response.assetLabel,
		response.label,
		response.assetId,
		response.sourceLabel,
		...(Array.isArray(response.assets) ? response.assets : [])
	]
		.filter((value) => typeof value === 'string' && value.trim())
		.map((value) => value.trim());
	if (explicit.length > 0) return explicit;
	const inferred = inferInteractiveAssetLabel(question);
	return inferred ? [inferred] : [];
}

function ensureResponseAssetLabel(response, fallbackLabel) {
	if (!response || typeof response !== 'object' || !fallbackLabel) return response;
	if (!['asset-canvas', 'image-label-zones'].includes(response.kind)) return response;
	if (response.assetLabel || response.label || response.assetId || response.sourceLabel)
		return response;
	return { ...response, assetLabel: fallbackLabel };
}

function inferInteractiveAssetLabel(question) {
	const textLabel = inferInteractiveAssetLabelFromText(question);
	if (textLabel) return textLabel;
	const labels = [
		...(question.assets ?? []).map(
			(asset) => asset?.sourceLabel ?? asset?.label ?? asset?.assetLabel
		),
		...[
			...(question.stemBlocks ?? []),
			...(question.leadBlocks ?? []),
			...(question.promptBlocks ?? []),
			...(question.afterResponseBlocks ?? [])
		].map((block) => block?.label ?? block?.sourceLabel ?? block?.assetLabel ?? block?.assetId)
	]
		.filter((value) => typeof value === 'string' && value.trim())
		.map((value) => value.trim());
	const figureLabel = labels.find((label) => /\b(figure|graph|diagram|image)\b/i.test(label));
	if (figureLabel) return figureLabel;
	return labels.length === 1 ? labels[0] : null;
}

function inferInteractiveAssetLabelFromText(question) {
	const text = [
		question.promptText,
		question.selfContainedPromptText,
		question.contextText,
		...(question.reviewNotes ?? []),
		...[
			...(question.stemBlocks ?? []),
			...(question.leadBlocks ?? []),
			...(question.promptBlocks ?? []),
			...(question.afterResponseBlocks ?? [])
		].flatMap(blockText)
	]
		.filter(Boolean)
		.join('\n');
	const match = text.match(/\b(?:figure|fig\.?|graph|diagram|image)\s+(\d+[A-Za-z]?)\b/i);
	return match ? `Figure ${match[1]}` : null;
}

function blockText(block) {
	if (!block || typeof block !== 'object') return [];
	const values = [block.text, block.caption, block.label, block.altText].filter(
		(value) => typeof value === 'string' && value.trim()
	);
	if (Array.isArray(block.rows)) {
		values.push(
			...block.rows.flatMap((row) =>
				(Array.isArray(row) ? row : Object.values(row ?? {})).filter(
					(value) => typeof value === 'string' && value.trim()
				)
			)
		);
	}
	return values;
}

function normalizeAssetKey(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function assetMatchesLabel(asset, label) {
	const wanted = normalizeAssetKey(label);
	if (!wanted) return false;
	return [
		asset?.sourceLabel,
		asset?.label,
		asset?.assetLabel,
		asset?.altText,
		asset?.id,
		asset?.assetId,
		asset?.filePath,
		asset?.publicPath
	].some((value) => {
		const normalized = normalizeAssetKey(value);
		return (
			normalized.length > 0 &&
			(normalized === wanted || normalized.includes(wanted) || wanted.includes(normalized))
		);
	});
}

function assetHasUsableReference(asset) {
	return Boolean(
		asset?.filePath ||
		asset?.sourcePath ||
		asset?.localPath ||
		asset?.path ||
		asset?.publicPath ||
		asset?.r2Key
	);
}

function questionRenderBlocks(question) {
	return ['stemBlocks', 'leadBlocks', 'promptBlocks', 'afterResponseBlocks'].flatMap((field) =>
		(question[field] ?? []).map((block, index) => ({ field, index, block }))
	);
}

function mediaBlockKinds() {
	return new Set([
		'figure',
		'image',
		'assetRef',
		'assetReference',
		'imageFigure',
		'imageBlock',
		'figure-placeholder',
		'figure-reference'
	]);
}

function renderBlockAssetLabel(block) {
	const value =
		block?.assetLabel ??
		block?.sourceLabel ??
		block?.label ??
		block?.assetId ??
		block?.id ??
		block?.altText;
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isMediaRenderBlock(block) {
	return Boolean(
		block &&
			typeof block === 'object' &&
			mediaBlockKinds().has(String(block.kind ?? ''))
	);
}

function mediaBlockAssetLabels(question) {
	const labels = [];
	for (const { block } of questionRenderBlocks(question)) {
		if (!isMediaRenderBlock(block)) continue;
		if (assetHasUsableReference(block)) continue;
		const label = renderBlockAssetLabel(block) ?? inferInteractiveAssetLabelFromText(question);
		if (label) labels.push(label);
	}
	return labels;
}

function referencedMediaAssetLabels(question) {
	if (!repairTextReferences) return [];
	const labels = [];
	const text = learnerFacingQuestionText(question);
	for (const match of text.matchAll(/\b(?:figure|fig\.?|graph|diagram|image)\s+(\d+[A-Za-z]?)\b/gi)) {
		const label = `Figure ${match[1]}`;
		if (mediaReferenceNeedsVisualContext(text, label, question.response?.kind)) labels.push(label);
	}
	return labels;
}

function learnerFacingQuestionText(question) {
	return [
		question.promptText,
		question.selfContainedPromptText,
		question.contextText,
		...(question.reviewNotes ?? []),
		...[
			...(question.stemBlocks ?? []),
			...(question.leadBlocks ?? []),
			...(question.promptBlocks ?? []),
			...(question.afterResponseBlocks ?? [])
		].flatMap(blockText)
	]
		.filter(Boolean)
		.join('\n');
}

function mediaReferenceNeedsVisualContext(text, label, responseKind) {
	const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const labelPattern = escapedLabel.replace(/figure/i, '(?:figure|fig\\.?|graph|diagram|image)');
	const aroundLabel = new RegExp(
		`(?:use|using|in|from|shown? in|shows?|complete|label|plot|draw|name|identify|results? in|part|set up)\\b[^.\\n]{0,100}\\b${labelPattern}\\b|\\b${labelPattern}\\b[^.\\n]{0,100}\\b(?:shows?|complete|label|plot|draw|name|identify|results?|part|set up)`,
		'i'
	);
	return ['asset-canvas', 'image-label-zones'].includes(responseKind) || aroundLabel.test(text);
}

function pruneEmptyMediaBlocks(question) {
	let removed = 0;
	const updates = {};
	for (const field of ['stemBlocks', 'leadBlocks', 'promptBlocks', 'afterResponseBlocks']) {
		const blocks = question[field] ?? [];
		const nextBlocks = blocks.filter((block) => {
			if (!isMediaRenderBlock(block)) return true;
			if (assetHasUsableReference(block)) return true;
			if (renderBlockAssetLabel(block) || inferInteractiveAssetLabelFromText(question)) return true;
			const hasDescriptiveText = blockText(block).some((value) => String(value ?? '').trim());
			if (hasDescriptiveText) return true;
			removed += 1;
			return false;
		});
		if (nextBlocks.length !== blocks.length) updates[field] = nextBlocks;
	}
	return { question: Object.keys(updates).length ? { ...question, ...updates } : question, removed };
}

function renderedPageNumber(filePath) {
	const match = path.basename(filePath).match(/-(\d+)\.png$/);
	return match ? Number(match[1]) : null;
}

function renderedPagesByNumber(sourceDocumentId, questionPaperPath) {
	const rendered = renderPdfPages({
		pdfPath: questionPaperPath,
		outputDir: path.join(rootDir, 'tmp/llm-extraction-response-assets', sourceDocumentId),
		prefix: 'question-page',
		dpi,
		force: false
	});
	return new Map(rendered.map((filePath) => [renderedPageNumber(filePath), filePath]));
}

function repairFile(filePath) {
	try {
		const paper = readJson(filePath);
		const sourceDocumentId = paper.sourceDocument?.id ?? paper.sourceDocumentId;
		const questionPaperPath = sourcePdfs.get(sourceDocumentId);
		if (!questionPaperPath || !existsSync(questionPaperPath)) {
			throw new Error(`Missing source question paper for ${sourceDocumentId}.`);
		}
		const pageImages = renderedPagesByNumber(sourceDocumentId, questionPaperPath);
		let assetsCreated = 0;
		let questionsRepaired = 0;
		let blocksRemoved = 0;
		const questions = (paper.questions ?? []).map((question) => {
			const pruned = pruneEmptyMediaBlocks(question);
			question = pruned.question;
			blocksRemoved += pruned.removed;
			const responseLabels = new Set(responseAssetLabels(question));
			const labels = [
				...new Set([
					...responseLabels,
					...mediaBlockAssetLabels(question),
					...referencedMediaAssetLabels(question)
				])
			];
			const missingLabels = labels.filter((label) => {
				const matchingAssets = (question.assets ?? []).filter((candidate) =>
					assetMatchesLabel(candidate, label)
				);
				return !matchingAssets.some(assetHasUsableReference);
			});
			if (!missingLabels.length) {
				if (pruned.removed === 0) return question;
				questionsRepaired += 1;
				return {
					...question,
					needsHumanReview: true,
					reviewNotes: [
						...(question.reviewNotes ?? []),
						'Removed empty unlabelled media placeholder block.'
					]
				};
			}
			questionsRepaired += 1;
			const questionAssets = [...(question.assets ?? [])];
			const outputDir = path.join(assetRoot, sourceDocumentId);
			if (!dryRun) mkdirSync(outputDir, { recursive: true });
			for (const label of missingLabels) {
				const pageNumber = pageNumberForMissingAsset(question, label);
				const pageImage = pageImages.get(pageNumber);
				if (!pageImage) continue;
				const fileName = `page-${String(pageNumber).padStart(3, '0')}-${slugify(question.sourceQuestionRef)}-${slugify(label) || 'asset'}.png`;
				const destPath = path.join(outputDir, fileName);
				if (!dryRun) copyFileSync(pageImage, destPath);
				assetsCreated += 1;
				const isResponseAsset = responseLabels.has(label);
				questionAssets.push({
					sourceLabel: label,
					assetType: 'image',
					role: isResponseAsset ? 'response-canvas' : 'question-context',
					pageNumber,
					required: isResponseAsset,
					filePath: relative(destPath),
					publicPath: `/images/papers/${sourceDocumentId}/${fileName}`,
					r2Key: `images/papers/${sourceDocumentId}/${fileName}`,
					altText: `${label} rendered from source paper page ${pageNumber}.`,
					extractionConfidence: 0.72,
					needsHumanReview: true,
					reviewNotes: [
						'Fallback full-page asset generated from the official question paper because extraction referenced interactive media without a usable asset file. Review and crop if needed before publishing.'
					]
				});
			}
			return {
				...question,
				response: ensureResponseAssetLabel(question.response, missingLabels[0]),
				assets: questionAssets,
				needsHumanReview: true,
				reviewNotes: [
					...(question.reviewNotes ?? []),
					'Generated fallback page image for missing interactive media asset.'
				]
			};
		});
		if (!dryRun && (assetsCreated > 0 || blocksRemoved > 0)) writeJson(filePath, { ...paper, questions });
		return {
			file: relative(filePath),
			sourceDocumentId,
			questionsRepaired,
			assetsCreated,
			blocksRemoved
		};
	} catch (error) {
		return {
			file: relative(filePath),
			error: error instanceof Error ? error.message : String(error),
			questionsRepaired: 0,
			assetsCreated: 0,
			blocksRemoved: 0
		};
	}
}

function pageNumberForMissingAsset(question, label) {
	const text = [
		question.contextText,
		question.promptText,
		question.selfContainedPromptText,
		...(question.reviewNotes ?? [])
	]
		.filter(Boolean)
		.join('\n')
		.toLowerCase();
	const labelText = String(label ?? '').toLowerCase();
	const explicitPage = explicitPageReference(text, labelText);
	if (explicitPage) return explicitPage;
	const referencesPreviousPage =
		/\bprevious page\b|\bpreceding page\b/.test(text) &&
		(!labelText || text.includes(labelText) || /\bfigure|graph|diagram|image\b/.test(labelText));
	if (referencesPreviousPage && Number(question.pageStart) > 1) return Number(question.pageStart) - 1;
	if (
		Number(question.pageEnd) > Number(question.pageStart) &&
		/\b(?:figure|fig|graph|diagram|image|grid)\b/.test(labelText)
	) {
		return Number(question.pageEnd);
	}
	return Number(question.pageStart ?? question.pageEnd ?? 1);
}

function explicitPageReference(text, labelText) {
	const escapedLabel = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	if (escapedLabel) {
		const labelMatch = text.match(new RegExp(`${escapedLabel}[\\s\\S]{0,80}\\bon page\\s+(\\d+)`, 'i'));
		if (labelMatch) return Number(labelMatch[1]);
	}
	const nearbyMatch = text.match(/\b(?:figure|fig\.?|graph|diagram|image)\s+\d+[a-z]?[\s\S]{0,80}\bon page\s+(\d+)/i);
	return nearbyMatch ? Number(nearbyMatch[1]) : null;
}

function slugify(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
