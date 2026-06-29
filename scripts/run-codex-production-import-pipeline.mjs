#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/run-codex-production-import-pipeline.mjs \\
  --question-paper=<official-question-paper.pdf> \\
  --mark-scheme=<official-mark-scheme.pdf> \\
  --source-document-id=<stable-source-id>

Optional:
  --mark-scheme-document-id=<stable-mark-scheme-id>
  --supporting-document=<insert-or-examiner-report.pdf>
  --existing-chains=<existing-chain-context.json>
  --existing-chain-input-root=<audited-json-root>
  --work-root=tmp/codex-production-import/<source-id>
  --model=gpt-5.5
  --extraction-model=gpt-5.5
  --extraction-thinking-level=high
  --chain-model=gpt-5.5
  --chain-thinking-level=xhigh
  --solvability-model=gpt-5.5
  --solvability-thinking-level=xhigh
  --expected-marks=100
  --expected-questions=46
  --run-id=<stable-log-id>
  --skip-solvability
  --no-import-check
  --skip-d1-conflict-check
  --allow-shared-chain-updates
  --import
  --force
  --dry-run

Metadata flags are forwarded to the PDF extraction run:
  --board --qualification --subject --subject-area --tier --paper-label --component-code
  --series --year --question-paper-title --mark-scheme-title --question-paper-url --mark-scheme-url`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const sourceDocumentId = requiredStringArg('source-document-id');
const questionPaperPath = path.resolve(rootDir, requiredStringArg('question-paper'));
const markSchemePath = path.resolve(rootDir, requiredStringArg('mark-scheme'));
const supportingDocumentPaths = repeatedStringArg('supporting-document').map((filePath) =>
	path.resolve(rootDir, filePath)
);
const workRoot = path.resolve(
	rootDir,
	stringArg('work-root', path.join('tmp/codex-production-import', sourceDocumentId))
);
const rawOutputPath = path.join(workRoot, 'raw', `${sourceDocumentId}.json`);
const extractionSummaryPath = path.join(workRoot, 'codex-extraction-summary.json');
const reconciledOutputPath = path.join(workRoot, 'chain-reconciled', `${sourceDocumentId}.json`);
const chainSummaryPath = path.join(workRoot, 'codex-chain-summary.json');
const importReadyRoot = path.join(workRoot, 'import-ready');
const importReadyAuditPath = path.join(workRoot, 'import-ready-audit.json');
const summaryPath = path.join(workRoot, 'codex-production-import-summary.json');
const dryRun = hasArg('dry-run');
const force = hasArg('force');
const runSolvability = !hasArg('skip-solvability');
const noImportCheck = hasArg('no-import-check');
const importToD1 = hasArg('import');
const checkExisting = !noImportCheck && !hasArg('skip-d1-conflict-check');

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
	reconciledOutputPath: relative(reconciledOutputPath),
	importReadyRoot: relative(importReadyRoot),
	importReadyAuditPath: relative(importReadyAuditPath),
	summaryPath: relative(summaryPath),
	runSolvability,
	importMode: noImportCheck ? 'none' : importToD1 ? 'write' : 'dry-run',
	checkExisting
};

if (dryRun) {
	console.log(JSON.stringify({ status: 'dry-run', plan, commands: plannedCommands() }, null, 2));
	process.exit(0);
}

mkdirSync(workRoot, { recursive: true });
const startedAt = new Date().toISOString();
const steps = [];
try {
	steps.push(runInherited(extractionCommand(), 'Codex PDF extraction'));
	steps.push(runInherited(chainCommand(), 'Codex answer-chain reconciliation'));
	const importReady = runJson(prepareImportReadyCommand(), 'strict audit / solvability / D1 dry-run');
	steps.push({ label: 'strict audit / solvability / D1 dry-run', status: 'passed' });
	const summary = {
		status: 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		steps,
		importReady,
		extractionSummary: readJsonIfExists(extractionSummaryPath),
		chainSummary: readJsonIfExists(chainSummaryPath)
	};
	writeJson(summaryPath, summary);
	console.log(JSON.stringify({ ...summary, summary: relative(summaryPath) }, null, 2));
} catch (error) {
	const summary = {
		status: 'failed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		steps,
		error: error instanceof Error ? error.message : String(error),
		extractionSummary: readJsonIfExists(extractionSummaryPath),
		chainSummary: readJsonIfExists(chainSummaryPath)
	};
	writeJson(summaryPath, summary);
	console.error(JSON.stringify({ ...summary, summary: relative(summaryPath) }, null, 2));
	process.exit(1);
}

function plannedCommands() {
	return [extractionCommand(), chainCommand(), prepareImportReadyCommand()].map((command) =>
		command.map(String)
	);
}

function extractionCommand() {
	const args = [
		'scripts/run-codex-pdf-extraction.mjs',
		`--question-paper=${questionPaperPath}`,
		`--mark-scheme=${markSchemePath}`,
		`--source-document-id=${sourceDocumentId}`,
		`--output=${rawOutputPath}`,
		`--summary=${extractionSummaryPath}`,
		`--work-dir=${path.join(workRoot, 'codex-extraction')}`,
		`--model=${stringArg('extraction-model', stringArg('model', 'gpt-5.5'))}`,
		`--thinking-level=${stringArg('extraction-thinking-level', stringArg('thinking-level', 'high'))}`,
		`--timeout-ms=${stringArg('extraction-timeout-ms', stringArg('timeout-ms', '7200000'))}`
	];
	forwardCommonExtractionArgs(args);
	if (force) args.push('--force');
	return args;
}

function chainCommand() {
	const args = [
		'scripts/run-codex-answer-chains.mjs',
		`--input=${rawOutputPath}`,
		`--output=${reconciledOutputPath}`,
		`--summary=${chainSummaryPath}`,
		`--work-dir=${path.join(workRoot, 'codex-chains')}`,
		`--model=${stringArg('chain-model', stringArg('model', 'gpt-5.5'))}`,
		`--thinking-level=${stringArg('chain-thinking-level', 'xhigh')}`,
		`--timeout-ms=${stringArg('chain-timeout-ms', stringArg('timeout-ms', '7200000'))}`
	];
	forwardString(args, 'existing-chains');
	forwardString(args, 'existing-chain-input-root');
	if (force) args.push('--force');
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
		args.push(`--model=${stringArg('solvability-model', stringArg('model', 'gpt-5.5'))}`);
		args.push(`--thinking-level=${stringArg('solvability-thinking-level', 'xhigh')}`);
		forwardString(args, 'min-solvability-score');
		forwardString(args, 'concurrency');
	}
	forwardString(args, 'run-id');
	if (noImportCheck) args.push('--no-import-check');
	if (checkExisting) args.push('--check-existing');
	if (hasArg('allow-shared-chain-updates')) args.push('--allow-shared-chain-updates');
	if (importToD1) args.push('--import');
	return args;
}

function forwardCommonExtractionArgs(args) {
	for (const supportingDocumentPath of supportingDocumentPaths) {
		args.push(`--supporting-document=${supportingDocumentPath}`);
	}
	for (const name of [
		'mark-scheme-document-id',
		'board',
		'qualification',
		'subject',
		'subject-area',
		'tier',
		'paper-label',
		'component-code',
		'series',
		'year',
		'question-paper-title',
		'mark-scheme-title',
		'question-paper-url',
		'mark-scheme-url',
		'expected-marks',
		'expected-questions'
	]) {
		forwardString(args, name);
	}
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
		maxBuffer: 64 * 1024 * 1024
	});
	if (result.status !== 0) {
		throw new Error(`${label} failed with exit code ${result.status ?? result.signal}.`);
	}
	return JSON.parse(result.stdout);
}

function readJsonIfExists(filePath) {
	if (!existsSync(filePath)) return null;
	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch {
		return null;
	}
}

function forwardString(args, name) {
	const value = stringArg(name, '');
	if (value) args.push(`--${name}=${value}`);
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
