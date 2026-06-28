#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/run-production-extraction-pipeline.mjs \\
  --question-paper=<question-paper.pdf> \\
  --mark-scheme=<mark-scheme.pdf> \\
  --source-document-id=<stable-source-id>

Optional:
  --mark-scheme-document-id=<stable-mark-scheme-id>
  --supporting-document=<examiner-report-or-insert.pdf>
  --board=AQA
  --qualification=GCSE
  --subject=Biology
  --subject-area=Biology
  --tier=Higher
  --paper-label="Biology Paper 1"
  --component-code=84611H
  --series="November 2020"
  --year=2020
  --question-paper-title="Question paper (Higher) : Paper 1 - November 2020"
  --mark-scheme-title="Mark scheme (Higher) : Paper 1 - November 2020"
  --question-paper-url=<official-source-url>
  --mark-scheme-url=<official-source-url>
  --existing-chains=<existing-chain-context.json>
  --existing-chain-input-root=<audited-json-root>
  --work-root=tmp/production-extraction/<source-id>
  --question-pages=1-3
  --mark-scheme-pages=4-5
  --chunk-pages=2
  --context-pages=2
  --chunk-concurrency=2
  --chunk-strategy=parent-question|fixed-pages
  --model=chatgpt-gpt-5.5
  --judge-model=chatgpt-gpt-5.5
  --thinking-level=xhigh
  --extraction-model=chatgpt-gpt-5.5-fast
  --extraction-thinking-level=medium
  --extraction-judge-thinking-level=xhigh
  --chain-model=chatgpt-gpt-5.5
  --chain-thinking-level=xhigh
  --solvability-model=chatgpt-gpt-5.5
  --solvability-thinking-level=xhigh
  --media-resolution=low|medium|high|original|auto
  --dpi=160
  --llm-timeout-ms=600000
  --llm-max-attempts=3
  --llm-max-calls=48
  --run-id=<llm-log-run-id>
  --force
  --force-chunks
  --skip-extraction-judge
  --skip-chain-judge
  --skip-solvability
  --no-import-check
  --import
  --dry-run`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const sourceDocumentId = requiredStringArg('source-document-id');
const questionPaperPath = path.resolve(rootDir, requiredStringArg('question-paper'));
const markSchemePath = path.resolve(rootDir, requiredStringArg('mark-scheme'));
const markSchemeDocumentId = stringArg(
	'mark-scheme-document-id',
	sourceDocumentId.includes('-qp-')
		? sourceDocumentId.replace('-qp-', '-ms-')
		: `${sourceDocumentId}-mark-scheme`
);
const supportingDocumentPaths = repeatedStringArg('supporting-document').map((filePath) =>
	path.resolve(rootDir, filePath)
);
const workRoot = path.resolve(
	rootDir,
	stringArg('work-root', path.join('tmp/production-extraction', sourceDocumentId))
);
const rawOutputPath = path.join(workRoot, 'raw', `${sourceDocumentId}.json`);
const extractionEvalPath = path.join(workRoot, 'eval', `${sourceDocumentId}.extraction.eval.json`);
const generatedExistingChainsPath = path.join(workRoot, 'existing-chain-context.json');
const reconciledOutputPath = path.join(workRoot, 'chain-reconciled', `${sourceDocumentId}.json`);
const reconcileSummaryPath = path.join(workRoot, 'chain-reconcile-summary.json');
const importReadyRoot = path.join(workRoot, 'import-ready');
const importReadyAuditPath = path.join(workRoot, 'import-ready-audit.json');
const summaryPath = path.join(workRoot, 'production-extraction-summary.json');

const existingChainsPath = stringArg('existing-chains', '');
const existingChainInputRoot = stringArg('existing-chain-input-root', '');
const runSolvability = !hasArg('skip-solvability');
const importToD1 = hasArg('import');
const noImportCheck = hasArg('no-import-check');
const dryRun = hasArg('dry-run');
const skipExtractionJudge = hasArg('skip-extraction-judge');
const skipChainJudge = hasArg('skip-chain-judge');
const runId = stringArg('run-id', '');

if (runId) process.env.EXTRACTION_RUN_ID = runId;

for (const filePath of [questionPaperPath, markSchemePath, ...supportingDocumentPaths]) {
	if (!existsSync(filePath)) throw new Error(`Input file does not exist: ${filePath}`);
}

const plan = {
	sourceDocumentId,
	questionPaperPath: relative(questionPaperPath),
	markSchemePath: relative(markSchemePath),
	supportingDocumentPaths: supportingDocumentPaths.map(relative),
	workRoot: relative(workRoot),
	rawOutputPath: relative(rawOutputPath),
	extractionEvalPath: relative(extractionEvalPath),
	reconciledOutputPath: relative(reconciledOutputPath),
	reconcileSummaryPath: relative(reconcileSummaryPath),
	importReadyRoot: relative(importReadyRoot),
	importReadyAuditPath: relative(importReadyAuditPath),
	summaryPath: relative(summaryPath),
	existingChainsPath: existingChainsPath
		? relative(path.resolve(rootDir, existingChainsPath))
		: null,
	existingChainInputRoot: existingChainInputRoot
		? relative(path.resolve(rootDir, existingChainInputRoot))
		: null,
	runSolvability,
	importMode: noImportCheck ? 'none' : importToD1 ? 'write' : 'dry-run'
};

if (dryRun) {
	console.log(JSON.stringify({ status: 'dry-run', plan, commands: plannedCommands() }, null, 2));
	process.exit(0);
}

mkdirSync(workRoot, { recursive: true });

const startedAt = new Date().toISOString();
const stepResults = [];
try {
	const extraction = runInherited(extractionCommand(), 'PDF extraction');
	stepResults.push(extraction);

	let chainContextPath = existingChainsPath ? path.resolve(rootDir, existingChainsPath) : '';
	if (!chainContextPath && existingChainInputRoot) {
		const contextBuild = runInherited(
			existingChainContextCommand(),
			'existing chain context build'
		);
		stepResults.push(contextBuild);
		chainContextPath = generatedExistingChainsPath;
	}

	const reconciliation = runInherited(
		reconcileCommand(chainContextPath),
		'answer-chain reconciliation'
	);
	stepResults.push(reconciliation);

	const importReady = runJson(prepareImportReadyCommand(), 'strict import-ready preparation');
	stepResults.push({ label: 'strict import-ready preparation', status: 'passed' });

	const summary = {
		status: 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		steps: stepResults,
		importReady
	};
	writeJson(summaryPath, summary);
	console.log(JSON.stringify({ ...summary, summary: relative(summaryPath) }, null, 2));
} catch (error) {
	const summary = {
		status: 'failed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		steps: stepResults,
		error: error instanceof Error ? error.message : String(error)
	};
	writeJson(summaryPath, summary);
	console.error(JSON.stringify({ ...summary, summary: relative(summaryPath) }, null, 2));
	process.exit(1);
}

function plannedCommands() {
	const commands = [extractionCommand()];
	if (!existingChainsPath && existingChainInputRoot) commands.push(existingChainContextCommand());
	commands.push(
		reconcileCommand(
			existingChainsPath || (existingChainInputRoot ? generatedExistingChainsPath : '')
		)
	);
	commands.push(prepareImportReadyCommand());
	return commands.map((command) => command.map((part) => String(part)));
}

function extractionCommand() {
	const args = [
		'scripts/extract-paper-llm.mjs',
		`--question-paper=${questionPaperPath}`,
		`--mark-scheme=${markSchemePath}`,
		`--source-document-id=${sourceDocumentId}`,
		`--mark-scheme-document-id=${markSchemeDocumentId}`,
		`--output=${rawOutputPath}`,
		`--write-eval=${extractionEvalPath}`,
		`--work-dir=${path.join(workRoot, 'llm-work')}`,
		'--evaluation-mode=extraction'
	];
	for (const supportingDocumentPath of supportingDocumentPaths) {
		args.push(`--supporting-document=${supportingDocumentPath}`);
	}
	forwardString(args, 'board');
	forwardString(args, 'qualification');
	forwardString(args, 'subject');
	forwardString(args, 'subject-area');
	forwardString(args, 'tier');
	forwardString(args, 'paper-label');
	forwardString(args, 'component-code');
	forwardString(args, 'series');
	forwardString(args, 'year');
	forwardString(args, 'question-paper-title');
	forwardString(args, 'mark-scheme-title');
	forwardString(args, 'question-paper-url');
	forwardString(args, 'mark-scheme-url');
	forwardString(args, 'question-pages');
	forwardString(args, 'mark-scheme-pages');
	forwardString(args, 'chunk-pages');
	forwardString(args, 'context-pages');
	forwardString(args, 'chunk-concurrency');
	forwardString(args, 'chunk-strategy');
	forwardPhaseString(args, 'extraction-model', 'model');
	forwardString(args, 'judge-model');
	forwardPhaseString(args, 'extraction-thinking-level', 'thinking-level');
	forwardPhaseString(args, 'extraction-judge-thinking-level', 'judge-thinking-level');
	forwardString(args, 'media-resolution');
	forwardString(args, 'dpi');
	forwardString(args, 'llm-timeout-ms');
	forwardString(args, 'llm-max-attempts');
	forwardString(args, 'llm-max-calls');
	forwardString(args, 'run-id');
	if (hasArg('force')) args.push('--force');
	if (hasArg('force-chunks')) args.push('--force-chunks');
	if (skipExtractionJudge) args.push('--skip-judge');
	return args;
}

function existingChainContextCommand() {
	return [
		'scripts/build-existing-chain-context.mjs',
		`--input-root=${path.resolve(rootDir, existingChainInputRoot)}`,
		`--output=${generatedExistingChainsPath}`
	];
}

function reconcileCommand(chainContextPath) {
	const args = [
		'scripts/reconcile-answer-chains.mjs',
		`--input=${rawOutputPath}`,
		`--output=${reconciledOutputPath}`,
		`--summary=${reconcileSummaryPath}`,
		'--fail-on-blocking'
	];
	forwardPhaseString(args, 'chain-model', 'model');
	forwardString(args, 'judge-model');
	forwardPhaseString(args, 'chain-thinking-level', 'thinking-level');
	forwardString(args, 'llm-timeout-ms');
	forwardString(args, 'llm-max-attempts');
	forwardString(args, 'run-id');
	if (chainContextPath) args.push(`--existing-chains=${path.resolve(rootDir, chainContextPath)}`);
	if (skipChainJudge) args.push('--skip-judge');
	return args;
}

function prepareImportReadyCommand() {
	const args = [
		'scripts/prepare-import-ready-extraction.mjs',
		`--input=${reconciledOutputPath}`,
		`--output-root=${importReadyRoot}`,
		`--audit-output=${importReadyAuditPath}`
	];
	if (runSolvability) {
		args.push('--run-solvability');
		const model =
			stringArg('solvability-model', '') || stringArg('judge-model', '') || stringArg('model', '');
		if (model) args.push(`--model=${model}`);
		forwardPhaseString(args, 'solvability-thinking-level', 'thinking-level');
		forwardString(args, 'min-solvability-score');
		forwardString(args, 'concurrency');
	}
	forwardString(args, 'run-id');
	if (noImportCheck) args.push('--no-import-check');
	if (importToD1) args.push('--import');
	return args;
}

function runInherited(args, label) {
	const result = spawnSync(process.execPath, args, {
		cwd: rootDir,
		stdio: 'inherit'
	});
	if (result.status !== 0) {
		throw new Error(`${label} failed with exit code ${result.status ?? result.signal}.`);
	}
	return { label, status: 'passed' };
}

function runJson(args, label) {
	const result = spawnSync(process.execPath, args, {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
		maxBuffer: 16 * 1024 * 1024
	});
	if (result.status !== 0) {
		throw new Error(`${label} failed with exit code ${result.status ?? result.signal}.`);
	}
	return JSON.parse(result.stdout);
}

function forwardString(args, name) {
	const value = stringArg(name, '');
	if (value) args.push(`--${name}=${value}`);
}

function forwardPhaseString(args, phaseName, targetName) {
	const value = stringArg(phaseName, '') || stringArg(targetName, '');
	if (value) args.push(`--${targetName}=${value}`);
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function repeatedStringArg(name) {
	const prefix = `--${name}=`;
	return process.argv
		.filter((candidate) => candidate.startsWith(prefix))
		.map((candidate) => candidate.slice(prefix.length))
		.filter(Boolean);
}

function requiredStringArg(name) {
	const value = stringArg(name, '');
	if (!value) throw new Error(`Pass --${name}=...\n\n${usage}`);
	return value;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}
