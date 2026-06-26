#!/usr/bin/env node

import path from 'node:path';
import {
	DEFAULT_EXTRACTION_MODEL,
	DEFAULT_THINKING_LEVEL,
	readJson,
	evaluateCandidate,
	runGoldenPdfEval,
	setupLlmEnv,
	writeJson
} from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const runLlm = hasArg('run-llm');
const fixturePath = stringArg(
	'fixture',
	path.join(rootDir, 'tests/golden/extraction-pipeline-spring-energy.json')
);
const candidatePath = stringArg('candidate', '');
const writeCandidatePath = stringArg('write-candidate', '');
const writeResultPath = stringArg('write-result', '');
const model = stringArg('model', process.env.EXTRACTION_PIPELINE_MODEL ?? DEFAULT_EXTRACTION_MODEL);
const judgeModel = stringArg('judge-model', process.env.EXTRACTION_PIPELINE_JUDGE_MODEL ?? model);
const thinkingLevel = stringArg(
	'thinking-level',
	process.env.EXTRACTION_PIPELINE_THINKING_LEVEL ?? DEFAULT_THINKING_LEVEL
);
const minJudgeScore = numberArg('min-score', 0.8);
const repairAttempts = integerArg('repair-attempts', 0, 0);
const outputRoot = stringArg('work-dir', path.join(rootDir, 'tmp/extraction-pipeline-golden'));

if (!runLlm && !candidatePath) {
	throw new Error(
		'Pass --run-llm to run model extraction, or --candidate=<json> to judge an existing candidate.'
	);
}

setupLlmEnv();

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

function integerArg(name, defaultValue, minValue) {
	const raw = stringArg(name, '');
	if (!raw) return defaultValue;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer >= ${minValue}.`);
	}
	return value;
}

const fixture = readJson(fixturePath);
const existingCandidate = candidatePath ? readJson(candidatePath) : null;
const result = candidatePath
	? {
			fixture,
			candidate: existingCandidate,
			evaluation: await evaluateCandidate({
				candidate: existingCandidate,
				fixture,
				judgeModel,
				thinkingLevel,
				minJudgeScore
			})
		}
	: await runGoldenPdfEval({
			rootDir,
			fixturePath,
			outputRoot,
			model,
			judgeModel,
			thinkingLevel,
			minJudgeScore,
			repairAttempts
		});

const output = {
	status: result.evaluation.status,
	fixture: path.relative(rootDir, fixturePath),
	model,
	judgeModel,
	thinkingLevel,
	minJudgeScore,
	...result.evaluation,
	candidate: result.candidate
};

if (writeCandidatePath) writeJson(writeCandidatePath, result.candidate);
if (writeResultPath) writeJson(writeResultPath, output);
console.log(JSON.stringify(output, null, 2));
if (result.evaluation.status !== 'passed') process.exit(1);
