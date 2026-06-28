#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
	deterministicCandidateIssues,
	normalizeExtractedQuestionForImport,
	readJson,
	writeJson
} from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const inputPath = stringArg('input', '');
const inputRoot = path.resolve(rootDir, stringArg('input-root', 'data/vision-extracted'));
const outputRoot = path.resolve(rootDir, stringArg('output-root', 'tmp/import-ready-extracted'));
const paperArg = stringArg('paper', '');
const subjectArg = stringArg('subject', 'all').toLowerCase();
const recursive = !hasArg('no-recursive');
const dryRun = hasArg('dry-run');
const keepWarnings = hasArg('keep-warnings');

const files = selectInputFiles();
if (files.length === 0) throw new Error('No extracted paper JSON files matched the selection.');

const results = files.map(buildSubsetForFile);
const summary = {
	status: results.some((result) => result.error) ? 'failed' : 'passed',
	dryRun,
	input: inputPath || null,
	inputRoot: inputPath ? null : relative(inputRoot),
	outputRoot: relative(outputRoot),
	recursive,
	paper: paperArg || null,
	subject: subjectArg,
	keepWarnings,
	files: results,
	writtenFiles: results.filter((result) => result.written).length,
	keptQuestions: results.reduce((sum, result) => sum + result.keptQuestions, 0),
	droppedQuestions: results.reduce((sum, result) => sum + result.droppedQuestions, 0),
	prunedAssets: results.reduce((sum, result) => sum + result.prunedAssets, 0),
	dropReasons: aggregateDropReasons(results)
};

console.log(JSON.stringify(summary, null, 2));
if (summary.status === 'failed') process.exit(1);

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function walkJsonFiles(dir) {
	const out = [];
	if (!existsSync(dir)) return out;
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

function sourceDocumentIdFor(candidate, filePath) {
	return (
		candidate?.sourceDocument?.id ??
		candidate?.sourceDocumentId ??
		path.basename(filePath ?? '', '.json')
	);
}

function subjectFor(candidate, filePath) {
	return String(
		candidate.sourceDocument?.subjectArea ??
			candidate.sourceDocument?.subject ??
			path.basename(path.dirname(filePath))
	).toLowerCase();
}

function selectInputFiles() {
	const candidates = inputPath ? [path.resolve(rootDir, inputPath)] : walkJsonFiles(inputRoot);
	return candidates.filter((filePath) => {
		if (!paperArg && subjectArg === 'all') return true;
		try {
			const candidate = readJson(filePath);
			const sourceDocumentId = sourceDocumentIdFor(candidate, filePath);
			const paperMatches =
				!paperArg || sourceDocumentId === paperArg || sourceDocumentId.includes(paperArg);
			const subjectMatches = subjectArg === 'all' || subjectFor(candidate, filePath) === subjectArg;
			return paperMatches && subjectMatches;
		} catch {
			return !paperArg && subjectArg === 'all';
		}
	});
}

function outputPathFor(filePath) {
	if (inputPath) return path.join(outputRoot, path.basename(filePath));
	const relativeInputPath = path.relative(inputRoot, filePath);
	return path.join(outputRoot, relativeInputPath);
}

function buildSubsetForFile(filePath) {
	try {
		const paper = readJson(filePath);
		const issueMap = questionIssueMap(paper);
		const dropped = [];
		const keptQuestions = [];
		let prunedAssets = 0;
		for (const question of paper.questions ?? []) {
			const reasons = dropReasonsForQuestion(question, issueMap.get(question.sourceQuestionRef) ?? []);
			if (reasons.length > 0) {
				dropped.push({ sourceQuestionRef: question.sourceQuestionRef, reasons });
			} else {
				const pruned = pruneLabelOnlyAssets(question);
				prunedAssets += pruned.prunedAssets;
				keptQuestions.push(normalizeExtractedQuestionForImport(pruned.question));
			}
		}
		const outPath = outputPathFor(filePath);
		const output = {
			...paper,
			questions: keptQuestions,
			extractionRun: {
				...(paper.extractionRun ?? {}),
				importReadySubset: true,
				importReadySubsetSource: relative(filePath),
				importReadySubsetDroppedQuestions: dropped.map((item) => item.sourceQuestionRef)
			}
		};
		if (!dryRun) {
			mkdirSync(path.dirname(outPath), { recursive: true });
			writeJson(outPath, output);
		}
		return {
			file: relative(filePath),
			output: relative(outPath),
			sourceDocumentId: sourceDocumentIdFor(paper, filePath),
			written: !dryRun,
			originalQuestions: paper.questions?.length ?? 0,
			keptQuestions: keptQuestions.length,
			droppedQuestions: dropped.length,
			prunedAssets,
			dropped
		};
	} catch (error) {
		return {
			file: relative(filePath),
			output: null,
			written: false,
			originalQuestions: 0,
			keptQuestions: 0,
			droppedQuestions: 0,
			prunedAssets: 0,
			dropped: [],
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

function questionIssueMap(paper) {
	const map = new Map();
	for (const finding of deterministicCandidateIssues(paper)) {
		if (!finding.sourceQuestionRef) continue;
		map.set(finding.sourceQuestionRef, finding.issues ?? []);
	}
	return map;
}

function dropReasonsForQuestion(question, issues) {
	const reasons = [];
	if (question.needsHumanReview) reasons.push('question_needs_human_review');
	if (question.answerChain?.needsHumanReview) reasons.push('chain_needs_human_review');
	if ((question.assets ?? []).some((asset) => asset?.needsHumanReview)) {
		reasons.push('asset_needs_human_review');
	}
	for (const issue of issues) {
		if (issue.severity === 'error' || (!keepWarnings && issue.severity === 'warning')) {
			reasons.push(issue.code);
		}
	}
	return [...new Set(reasons)];
}

function pruneLabelOnlyAssets(question) {
	const assets = question.assets ?? [];
	const prunedAssets = assets.filter((asset) => !assetHasConcreteReference(asset)).length;
	if (prunedAssets === 0) return { question, prunedAssets };
	return {
		question: {
			...question,
			assets: assets.filter(assetHasConcreteReference)
		},
		prunedAssets
	};
}

function assetHasConcreteReference(asset) {
	return Boolean(asset?.filePath || asset?.sourcePath || asset?.localPath || asset?.path);
}

function aggregateDropReasons(results) {
	const counts = {};
	for (const result of results) {
		for (const item of result.dropped ?? []) {
			for (const reason of item.reasons ?? []) counts[reason] = (counts[reason] ?? 0) + 1;
		}
	}
	return Object.fromEntries(
		Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
	);
}
