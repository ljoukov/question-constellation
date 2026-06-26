#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
	DEFAULT_EXTRACTION_MODEL,
	DEFAULT_THINKING_LEVEL,
	deterministicCandidateIssues,
	evaluateCandidate,
	extractCandidateFromPdfPair,
	parsePageSelection,
	readJson,
	repairCandidateAnswerChains,
	setupLlmEnv,
	writeJson
} from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/extract-paper-llm.mjs \\
  --question-paper=<question-paper.pdf> \\
  --mark-scheme=<mark-scheme.pdf> \\
  --source-document-id=<stable-source-id> \\
  --output=<candidate.json>

Optional:
  --question-pages=1-3
  --mark-scheme-pages=4-5
  --expected-question-count=1
  --repair-attempts=1
  --judge-fixture=<golden-fixture.json>
  --skip-judge
  --write-eval=<evaluation.json>
  --model=chatgpt-gpt-5.5-fast
  --thinking-level=xhigh`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const questionPaperPath = requiredStringArg('question-paper');
const markSchemePath = requiredStringArg('mark-scheme');
const sourceDocumentId = requiredStringArg('source-document-id');
const outputPath = requiredStringArg('output');
const model = stringArg('model', process.env.EXTRACTION_PIPELINE_MODEL ?? DEFAULT_EXTRACTION_MODEL);
const judgeModel = stringArg('judge-model', process.env.EXTRACTION_PIPELINE_JUDGE_MODEL ?? model);
const thinkingLevel = stringArg(
	'thinking-level',
	process.env.EXTRACTION_PIPELINE_THINKING_LEVEL ?? DEFAULT_THINKING_LEVEL
);
const outputRoot = stringArg(
	'work-dir',
	path.join(rootDir, 'tmp/llm-extraction-pipeline', sourceDocumentId)
);
const dpi = integerArg('dpi', 160, 90);
const forceRender = hasArg('force-render');
const questionPages = parsePageSelection(stringArg('question-pages', ''));
const markSchemePages = parsePageSelection(stringArg('mark-scheme-pages', ''));
const expectedQuestionCount = optionalIntegerArg('expected-question-count');
const repairAttempts = integerArg('repair-attempts', 0, 0);
const judgeFixturePath = stringArg('judge-fixture', '');
const writeEvalPath = stringArg('write-eval', '');
const extraInstructionsPath = stringArg('instructions', '');
const runJudge = !hasArg('skip-judge');

if (!existsSync(questionPaperPath)) throw new Error(`Missing question PDF: ${questionPaperPath}`);
if (!existsSync(markSchemePath)) throw new Error(`Missing mark scheme PDF: ${markSchemePath}`);

setupLlmEnv();

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function requiredStringArg(name) {
	const value = stringArg(name, '');
	if (!value) throw new Error(`Pass --${name}=...\n\n${usage}`);
	return value;
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

function optionalIntegerArg(name) {
	const value = stringArg(name, '');
	if (!value) return null;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(`--${name} must be a positive integer.`);
	}
	return parsed;
}

const extractionSpec = readFileSync(path.join(rootDir, 'docs/extraction-spec.md'), 'utf8');
const extraInstructions = extraInstructionsPath ? readFileSync(extraInstructionsPath, 'utf8') : '';

let candidate = await extractCandidateFromPdfPair({
	rootDir,
	questionPaperPath,
	markSchemePath,
	sourceDocumentId,
	outputRoot,
	dpi,
	forceRender,
	questionPages,
	markSchemePages,
	model,
	thinkingLevel,
	extractionSpec,
	extraInstructions,
	expectedQuestionCount
});

let evaluation = await evaluateCandidate({
	candidate,
	fixture: judgeFixturePath ? readJson(judgeFixturePath) : null,
	judgeModel,
	thinkingLevel,
	runJudge
});

for (let attempt = 0; evaluation.status !== 'passed' && attempt < repairAttempts; attempt += 1) {
	candidate = await repairCandidateAnswerChains({
		model,
		thinkingLevel,
		candidate,
		deterministicIssues: deterministicCandidateIssues(candidate),
		judge: evaluation.judge
	});
	evaluation = await evaluateCandidate({
		candidate,
		fixture: judgeFixturePath ? readJson(judgeFixturePath) : null,
		judgeModel,
		thinkingLevel,
		runJudge
	});
}

writeJson(outputPath, candidate);
if (writeEvalPath) writeJson(writeEvalPath, evaluation);

console.log(
	JSON.stringify(
		{
			status: evaluation.status,
			output: path.relative(rootDir, outputPath),
			evaluation: writeEvalPath ? path.relative(rootDir, writeEvalPath) : null,
			sourceDocumentId,
			questions: candidate.questions.length,
			model,
			judgeModel,
			thinkingLevel,
			runJudge,
			deterministicBlockingIssues: evaluation.deterministicBlockingIssues.length,
			mechanicalErrors: evaluation.mechanicalErrors.length,
			judgeVerdict: evaluation.judge?.verdict ?? null,
			judgeScore: evaluation.judge?.score ?? null
		},
		null,
		2
	)
);

if (evaluation.status !== 'passed') process.exit(1);
