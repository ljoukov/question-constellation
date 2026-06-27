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

function responseAssetLabels(response) {
	if (!response || typeof response !== 'object') return [];
	if (!['asset-canvas', 'image-label-zones'].includes(response.kind)) return [];
	return [
		response.assetLabel,
		response.label,
		response.assetId,
		response.sourceLabel,
		...(Array.isArray(response.assets) ? response.assets : [])
	]
		.filter((value) => typeof value === 'string' && value.trim())
		.map((value) => value.trim());
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
		return normalized === wanted || normalized.includes(wanted) || wanted.includes(normalized);
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
		const questions = (paper.questions ?? []).map((question) => {
			const labels = responseAssetLabels(question.response);
			const missingLabels = labels.filter((label) => {
				const asset = (question.assets ?? []).find((candidate) =>
					assetMatchesLabel(candidate, label)
				);
				return !asset || !assetHasUsableReference(asset);
			});
			if (!missingLabels.length) return question;
			questionsRepaired += 1;
			const pageNumber = question.pageStart ?? question.pageEnd ?? 1;
			const pageImage = pageImages.get(pageNumber);
			if (!pageImage) return question;
			const questionAssets = [...(question.assets ?? [])];
			const outputDir = path.join(assetRoot, sourceDocumentId);
			if (!dryRun) mkdirSync(outputDir, { recursive: true });
			for (const label of missingLabels) {
				const fileName = `page-${String(pageNumber).padStart(3, '0')}-${slugify(question.sourceQuestionRef)}-${slugify(label) || 'asset'}.png`;
				const destPath = path.join(outputDir, fileName);
				if (!dryRun) copyFileSync(pageImage, destPath);
				assetsCreated += 1;
				questionAssets.push({
					sourceLabel: label,
					assetType: 'image',
					role: 'response-canvas',
					pageNumber,
					required: true,
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
				assets: questionAssets,
				needsHumanReview: true,
				reviewNotes: [
					...(question.reviewNotes ?? []),
					'Generated fallback page image for missing interactive media asset.'
				]
			};
		});
		if (!dryRun && assetsCreated > 0) writeJson(filePath, { ...paper, questions });
		return {
			file: relative(filePath),
			sourceDocumentId,
			questionsRepaired,
			assetsCreated
		};
	} catch (error) {
		return {
			file: relative(filePath),
			error: error instanceof Error ? error.message : String(error),
			questionsRepaired: 0,
			assetsCreated: 0
		};
	}
}

function slugify(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
