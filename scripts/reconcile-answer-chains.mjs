#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
	DEFAULT_EXTRACTION_MODEL,
	DEFAULT_THINKING_LEVEL,
	deterministicCandidateIssues,
	evaluateCandidate,
	readJson,
	repairFullPaperAnswerChains,
	setupLlmEnv,
	writeJson
} from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/reconcile-answer-chains.mjs [options]

Options:
  --input=<paper.json>
  --input-root=data/vision-extracted
  --output=<paper.json>
  --output-root=tmp/chain-reconciled
  --paper=<source-document-id-or-fragment>
  --subject=<biology|chemistry|physics|all>
  --refs=01.3,05.7
  --existing-chains=tmp/existing-chain-context.json
  --attempts=1
  --batch-size=8
  --concurrency=1
  --include-warnings
  --skip-judge
  --min-judge-score=0.8
  --dry-run
  --in-place
  --fail-on-blocking
  --model=chatgpt-gpt-5.5
  --judge-model=chatgpt-gpt-5.5
  --thinking-level=xhigh
  --llm-timeout-ms=600000
  --llm-max-attempts=3
  --run-id=<llm-log-run-id>`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const inputPath = stringArg('input', '');
const inputRoot = path.resolve(rootDir, stringArg('input-root', 'data/vision-extracted'));
const outputPath = stringArg('output', '');
const outputRoot = path.resolve(rootDir, stringArg('output-root', 'tmp/chain-reconciled'));
const summaryPath = path.resolve(
	rootDir,
	stringArg('summary', 'tmp/answer-chain-reconcile-summary.json')
);
const paperArg = stringArg('paper', '');
const subjectArg = stringArg('subject', 'all').toLowerCase();
const sourceRefs = new Set(
	stringArg('refs', '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean)
);
const existingChainsPath = stringArg('existing-chains', '');
const model = stringArg('model', process.env.EXTRACTION_PIPELINE_MODEL ?? DEFAULT_EXTRACTION_MODEL);
const judgeModel = stringArg('judge-model', process.env.EXTRACTION_PIPELINE_JUDGE_MODEL ?? model);
const thinkingLevel = stringArg(
	'thinking-level',
	process.env.EXTRACTION_PIPELINE_THINKING_LEVEL ?? DEFAULT_THINKING_LEVEL
);
const attempts = integerArg('attempts', 1, 0);
const batchSize = integerArg('batch-size', 8, 1);
const concurrency = integerArg('concurrency', 1, 1);
const minJudgeScore = numberArg('min-judge-score', 0.8);
const includeWarnings = hasArg('include-warnings');
const runJudge = !hasArg('skip-judge');
const recursive = !hasArg('no-recursive');
const dryRun = hasArg('dry-run');
const inPlace = hasArg('in-place');
const failOnBlocking = hasArg('fail-on-blocking');
const llmTimeoutMs = optionalIntegerArg('llm-timeout-ms');
const llmMaxAttempts = optionalIntegerArg('llm-max-attempts');
const runId = stringArg('run-id', process.env.EXTRACTION_RUN_ID ?? '');

if (outputPath && !inputPath) throw new Error('--output requires --input.');
if (outputPath && inPlace) throw new Error('--output and --in-place cannot be used together.');
if (dryRun && inPlace) throw new Error('--dry-run and --in-place cannot be used together.');
if (runId) process.env.EXTRACTION_RUN_ID = runId;
if (llmTimeoutMs) process.env.EXTRACTION_LLM_TIMEOUT_MS = String(llmTimeoutMs);
if (llmMaxAttempts) process.env.EXTRACTION_LLM_MAX_ATTEMPTS = String(llmMaxAttempts);

const existingChainsText = existingChainsPath
	? readFileSync(path.resolve(rootDir, existingChainsPath), 'utf8')
	: '';
const files = selectInputFiles();
if (files.length === 0) throw new Error('No extracted paper JSON files matched the selection.');
if (!dryRun && (attempts > 0 || runJudge)) setupLlmEnv();

const results = await mapWithConcurrency(files, concurrency, reconcileFile);
const summary = {
	status: results.some((result) => result.status === 'failed') ? 'failed' : 'passed',
	dryRun,
	input: inputPath || null,
	inputRoot: inputPath ? null : relative(inputRoot),
	output: outputPath || null,
	outputRoot: outputPath || inPlace ? null : relative(outputRoot),
	inPlace,
	recursive,
	paper: paperArg || null,
	subject: subjectArg,
	refs: sourceRefs.size > 0 ? [...sourceRefs].sort(compareQuestionRefs) : null,
	model,
	judgeModel,
	thinkingLevel,
	attempts,
	batchSize,
	concurrency,
	includeWarnings,
	runJudge,
	minJudgeScore,
	chainResolutionRequired: true,
	existingChains: existingChainsPath ? relative(path.resolve(rootDir, existingChainsPath)) : null,
	files: results,
	filesChanged: results.filter((result) => result.changed).length,
	initialBlockingRefs: results.reduce((sum, result) => sum + result.initialBlockingRefs.length, 0),
	finalBlockingRefs: results.reduce((sum, result) => sum + result.finalBlockingRefs.length, 0),
	finalWarningRefs: results.reduce((sum, result) => sum + result.finalWarningRefs.length, 0)
};

writeJson(summaryPath, summary);
console.log(
	JSON.stringify({ ...summary, summary: relative(summaryPath), files: undefined }, null, 2)
);
if (summary.status === 'failed' && failOnBlocking) process.exit(1);

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

function optionalIntegerArg(name) {
	const raw = stringArg(name, '');
	if (!raw) return null;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`--${name} must be a positive integer.`);
	}
	return value;
}

function numberArg(name, defaultValue) {
	const raw = stringArg(name, '');
	if (!raw) return defaultValue;
	const value = Number(raw);
	if (!Number.isFinite(value)) throw new Error(`--${name} must be a number.`);
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

function sourceDocumentIdFor(candidate, filePath) {
	return (
		candidate?.sourceDocument?.id ??
		candidate?.sourceDocumentId ??
		path.basename(filePath ?? '', '.json')
	);
}

function subjectFor(candidate, filePath) {
	return String(
		candidate?.sourceDocument?.subjectArea ??
			candidate?.sourceDocument?.subject ??
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
	if (inPlace) return filePath;
	if (outputPath) return path.resolve(rootDir, outputPath);
	if (inputPath) return path.join(outputRoot, path.basename(filePath));
	const relativeInputPath = path.relative(inputRoot, filePath);
	return path.join(outputRoot, relativeInputPath);
}

async function reconcileFile(filePath) {
	const result = {
		file: relative(filePath),
		output: relative(outputPathFor(filePath)),
		sourceDocumentId: null,
		status: 'passed',
		changed: false,
		written: false,
		initialBlockingRefs: [],
		finalBlockingRefs: [],
		finalWarningRefs: [],
		attemptsRun: 0,
		batches: [],
		judge: null,
		error: null
	};
	try {
		const original = readJson(filePath);
		result.sourceDocumentId = sourceDocumentIdFor(original, filePath);
		const initialFindings = chainFindings(original);
		result.initialBlockingRefs = blockingRefs(initialFindings);
		if (dryRun) {
			result.finalBlockingRefs = result.initialBlockingRefs;
			result.finalWarningRefs = warningRefs(initialFindings);
			result.status = result.finalBlockingRefs.length > 0 ? 'failed' : 'passed';
			return result;
		}

		let candidate = original;
		let judge = null;
		for (let attempt = 1; attempt <= attempts; attempt += 1) {
			const findings = chainFindings(candidate);
			let refsToRepair = refsForRepair(findings);
			if (refsToRepair.length === 0 && runJudge) {
				judge = await runChainJudge(candidate);
				if (judge.status === 'passed') break;
				refsToRepair = refsFromJudge(judge.judge, candidate);
			}
			if (refsToRepair.length === 0) break;
			result.attemptsRun = attempt;
			for (const batchRefs of chunks(refsToRepair, batchSize)) {
				console.error(
					`[reconcile-answer-chains] ${result.sourceDocumentId}: attempt ${attempt}, refs ${batchRefs.join(', ')}`
				);
				const before = chainFindings(candidate).filter((finding) =>
					batchRefs.includes(finding.sourceQuestionRef)
				);
				candidate = await repairFullPaperAnswerChains({
					model,
					thinkingLevel,
					candidate,
					deterministicIssues: before,
					judge: judge?.judge ?? null,
					existingChainsText,
					sourceQuestionRefs: batchRefs
				});
				const after = chainFindings(candidate).filter((finding) =>
					batchRefs.includes(finding.sourceQuestionRef)
				);
				result.batches.push({
					attempt,
					refs: batchRefs,
					initialIssues: before.reduce((sum, finding) => sum + finding.issues.length, 0),
					finalIssues: after.reduce((sum, finding) => sum + finding.issues.length, 0)
				});
			}
		}

		const finalFindings = chainFindings(candidate);
		result.finalBlockingRefs = blockingRefs(finalFindings);
		result.finalWarningRefs = warningRefs(finalFindings);
		if (runJudge && result.finalBlockingRefs.length === 0) {
			judge = await runChainJudge(candidate);
			result.judge = summarizeJudge(judge);
		}
		result.changed = JSON.stringify(candidate) !== JSON.stringify(original);
		const judgeFailed = Boolean(result.judge && result.judge.status !== 'passed');
		result.status = result.finalBlockingRefs.length > 0 || judgeFailed ? 'failed' : 'passed';
		if (result.changed || !inPlace) {
			writeJson(outputPathFor(filePath), candidate);
			result.written = true;
		}
		return result;
	} catch (error) {
		result.status = 'failed';
		result.error = error instanceof Error ? error.message : String(error);
		return result;
	}
}

function chainFindings(candidate) {
	return deterministicCandidateIssues(candidate)
		.filter((finding) => !sourceRefs.size || sourceRefs.has(finding.sourceQuestionRef))
		.map((finding) => ({
			...finding,
			issues: (finding.issues ?? []).filter(isChainIssue)
		}))
		.filter((finding) => finding.issues.length > 0);
}

function isChainIssue(issue) {
	const code = String(issue?.code ?? '');
	if (issue?.severity === 'warning' && !includeWarnings) return false;
	return (
		code === 'answer_chain_missing_stable_id' ||
		code === 'chain_numeric_substitution' ||
		code === 'chain_prompt_specific_number' ||
		code === 'chain_exact_fixed_answer_text' ||
		code === 'chain_step_missing_positive_evidence' ||
		code === 'chain_step_missing_mark_scheme_item' ||
		code === 'chain_step_non_positive_evidence' ||
		(includeWarnings && code === 'chain_numeric_review')
	);
}

function refsForRepair(findings) {
	const refs = [
		...new Set(
			findings
				.filter((finding) => finding.issues.some((issue) => issue.severity === 'error'))
				.map((finding) => finding.sourceQuestionRef)
				.filter(Boolean)
		)
	];
	if (includeWarnings) {
		for (const ref of warningRefs(findings)) refs.push(ref);
	}
	return [...new Set(refs)].sort(compareQuestionRefs);
}

function blockingRefs(findings) {
	return [
		...new Set(
			findings
				.filter((finding) => finding.issues.some((issue) => issue.severity === 'error'))
				.map((finding) => finding.sourceQuestionRef)
				.filter(Boolean)
		)
	].sort(compareQuestionRefs);
}

function warningRefs(findings) {
	return [
		...new Set(
			findings
				.filter(
					(finding) =>
						finding.issues.some((issue) => issue.severity === 'warning') &&
						!finding.issues.some((issue) => issue.severity === 'error')
				)
				.map((finding) => finding.sourceQuestionRef)
				.filter(Boolean)
		)
	].sort(compareQuestionRefs);
}

function chunks(values, size) {
	const out = [];
	for (let index = 0; index < values.length; index += size) {
		out.push(values.slice(index, index + size));
	}
	return out;
}

async function mapWithConcurrency(values, limit, mapper) {
	const results = new Array(values.length);
	let nextIndex = 0;
	const workerCount = Math.min(limit, values.length);
	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (nextIndex < values.length) {
				const index = nextIndex;
				nextIndex += 1;
				results[index] = await mapper(values[index], index);
			}
		})
	);
	return results;
}

function compareQuestionRefs(left, right) {
	return String(left).localeCompare(String(right), undefined, {
		numeric: true,
		sensitivity: 'base'
	});
}

async function runChainJudge(candidate) {
	return evaluateCandidate({
		candidate,
		judgeModel,
		thinkingLevel,
		minJudgeScore,
		runJudge: true,
		evaluationMode: 'full'
	});
}

function summarizeJudge(evaluation) {
	return {
		status: evaluation.status,
		judgeVerdict: evaluation.judge?.verdict ?? null,
		judgeScore: evaluation.judge?.score ?? null,
		requiredRepairs: evaluation.judge?.requiredRepairs ?? [],
		deterministicBlockingIssues: evaluation.deterministicBlockingIssues ?? []
	};
}

function refsFromJudge(judge, candidate) {
	const text = JSON.stringify(judge?.requiredRepairs ?? []);
	const refs = (candidate.questions ?? [])
		.map((question) => question.sourceQuestionRef)
		.filter((ref) => ref && text.includes(ref));
	if (refs.length > 0) return refs.sort(compareQuestionRefs);
	return (candidate.questions ?? [])
		.filter((question) => Number(question.marks ?? 0) > 0)
		.map((question) => question.sourceQuestionRef)
		.filter(Boolean)
		.sort(compareQuestionRefs);
}
