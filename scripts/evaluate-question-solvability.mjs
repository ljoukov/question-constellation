#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
	DEFAULT_EXTRACTION_MODEL,
	DEFAULT_THINKING_LEVEL,
	buildLearnerVisibleQuestionContext,
	judgeQuestionSolvability,
	readJson,
	setupLlmEnv,
	writeJson
} from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const inputPath = stringArg('input', '');
const inputRoot = stringArg('input-root', 'data/vision-extracted/aqa-separate-science-higher');
const outputPath = path.resolve(rootDir, stringArg('output', 'tmp/question-solvability-eval.json'));
const paperArg = stringArg('paper', '');
const questionArg = stringArg('question', '');
const subjectArg = stringArg('subject', 'all').toLowerCase();
const model = stringArg('model', DEFAULT_EXTRACTION_MODEL);
const thinkingLevel = stringArg('thinking-level', DEFAULT_THINKING_LEVEL);
const minJudgeScore = numberArg('min-score', 0.8);
const maxQuestions = optionalIntegerArg('max-questions');
const all = hasArg('all');
const recursive = hasArg('recursive') || all;
const dryRun = hasArg('dry-run');
const continueOnError = hasArg('continue-on-error');
const skipImages = hasArg('skip-images');
const includePriorContext = !hasArg('target-only');
const llmTimeoutMs = optionalIntegerArg('llm-timeout-ms');
const llmMaxAttempts = optionalIntegerArg('llm-max-attempts');

if (!inputPath && !all && !paperArg) {
	throw new Error('Pass --input=<json>, --paper=<source-document-id>, or --all.');
}
if (llmTimeoutMs) process.env.EXTRACTION_LLM_TIMEOUT_MS = String(llmTimeoutMs);
if (llmMaxAttempts) process.env.EXTRACTION_LLM_MAX_ATTEMPTS = String(llmMaxAttempts);
if (!dryRun) setupLlmEnv();
mkdirSync(path.dirname(outputPath), { recursive: true });

const files = selectInputFiles();
if (files.length === 0) throw new Error('No extracted paper JSON files matched the selection.');

const planned = planChecks(files);
if (maxQuestions) planned.splice(maxQuestions);
if (planned.length === 0) throw new Error('No questions matched the selection.');

if (dryRun) {
	const result = {
		status: 'dry-run',
		inputs: files.map(relative),
		plannedQuestionCount: planned.length,
		planned: planned.map(({ filePath, sourceQuestionRef }) => ({
			file: relative(filePath),
			sourceQuestionRef
		}))
	};
	writeJson(outputPath, result);
	console.log(JSON.stringify(result, null, 2));
	process.exit(0);
}

const results = [];
writeSummary('running');
for (const item of planned) {
	try {
		console.error(`[solvability] judging ${relative(item.filePath)} ${item.sourceQuestionRef}`);
		const evaluation = await judgeQuestionSolvability({
			candidate: item.candidate,
			sourceQuestionRef: item.sourceQuestionRef,
			model,
			thinkingLevel,
			minJudgeScore,
			attachImages: !skipImages,
			includePriorContext
		});
		results.push({
			file: relative(item.filePath),
			sourceDocumentId:
				item.candidate.sourceDocument?.id ?? item.candidate.sourceDocumentId ?? null,
			...evaluation
		});
		writeSummary('running');
	} catch (error) {
		const result = {
			file: relative(item.filePath),
			sourceDocumentId:
				item.candidate?.sourceDocument?.id ?? item.candidate?.sourceDocumentId ?? null,
			sourceQuestionRef: item.sourceQuestionRef,
			status: 'failed',
			error: error instanceof Error ? error.message : String(error)
		};
		results.push(result);
		writeSummary('failed');
		if (!continueOnError) throw error;
	}
}

const status = results.some((result) => result.status !== 'passed') ? 'failed' : 'passed';
writeSummary(status);
console.log(JSON.stringify(summary(status), null, 2));
if (status !== 'passed') process.exit(1);

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function numberArg(name, defaultValue) {
	const raw = stringArg(name, '');
	if (!raw) return defaultValue;
	const value = Number(raw);
	if (!Number.isFinite(value)) throw new Error(`--${name} must be a number.`);
	return value;
}

function optionalIntegerArg(name) {
	const raw = stringArg(name, '');
	if (!raw) return null;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`--${name} must be a positive integer.`);
	}
	return value;
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

function selectInputFiles() {
	if (inputPath) return [path.resolve(rootDir, inputPath)];
	const root = path.resolve(rootDir, inputRoot);
	const files = walkJsonFiles(root);
	return files.filter((filePath) => {
		const candidate = JSON.parse(readFileSync(filePath, 'utf8'));
		const sourceDocumentId = candidate.sourceDocument?.id ?? candidate.sourceDocumentId ?? '';
		const subject = String(
			candidate.sourceDocument?.subjectArea ??
				candidate.sourceDocument?.subject ??
				path.basename(path.dirname(filePath))
		).toLowerCase();
		const paperMatches =
			!paperArg || sourceDocumentId === paperArg || sourceDocumentId.includes(paperArg);
		const subjectMatches = subjectArg === 'all' || subject === subjectArg;
		return paperMatches && subjectMatches;
	});
}

function planChecks(files) {
	const planned = [];
	for (const filePath of files) {
		if (!existsSync(filePath)) throw new Error(`Missing input file ${relative(filePath)}.`);
		const candidate = readJson(filePath);
		const questions = candidate.questions ?? [];
		for (const question of questions) {
			if (questionArg && question.sourceQuestionRef !== questionArg) continue;
			if (!question.sourceQuestionRef) continue;
			if (dryRun) {
				const context = buildLearnerVisibleQuestionContext(candidate, question.sourceQuestionRef, {
					attachImages: !skipImages,
					includePriorContext
				});
				planned.push({
					filePath,
					candidate,
					sourceQuestionRef: question.sourceQuestionRef,
					media: context.studentVisibleContext.media
				});
			} else {
				planned.push({ filePath, candidate, sourceQuestionRef: question.sourceQuestionRef });
			}
		}
	}
	return planned;
}

function summary(status) {
	return {
		status,
		model,
		thinkingLevel,
		minJudgeScore,
		includePriorContext,
		attachImages: !skipImages,
		inputCount: files.length,
		questionCount: planned.length,
		completed: results.length,
		passed: results.filter((result) => result.status === 'passed').length,
		failed: results.filter((result) => result.status !== 'passed').length,
		results
	};
}

function writeSummary(status) {
	writeJson(outputPath, summary(status));
}
