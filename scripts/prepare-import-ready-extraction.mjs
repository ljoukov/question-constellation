#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const inputPath = stringArg('input', '');
const inputRoot = stringArg('input-root', 'data/vision-extracted');
const outputRoot = stringArg('output-root', 'tmp/import-ready-extracted');
const auditOutput = stringArg('audit-output', 'tmp/import-ready-extracted-audit.json');
const paperArg = stringArg('paper', '');
const subjectArg = stringArg('subject', 'all').toLowerCase();
const recursive = !hasArg('no-recursive');
const runSolvability = hasArg('run-solvability');
const importToD1 = hasArg('import');
const noImportCheck = hasArg('no-import-check');
const checkExisting = hasArg('check-existing');
const allowSharedChainUpdates = hasArg('allow-shared-chain-updates');
const keepWarnings = hasArg('keep-warnings');
const model = stringArg('model', '');
const thinkingLevel = stringArg('thinking-level', '');
const concurrency = stringArg('concurrency', '');
const minSolvabilityScore = stringArg('min-solvability-score', '');
const runId = stringArg('run-id', '');

if (runId) process.env.EXTRACTION_RUN_ID = runId;

const buildSummary = buildImportReadySubset();
auditImportReadySubset();
const importResults = noImportCheck ? [] : runImportChecks(buildSummary);

console.log(
	JSON.stringify(
		{
			status: 'passed',
			input: inputPath || null,
			inputRoot: inputPath ? null : relative(path.resolve(rootDir, inputRoot)),
			outputRoot: relative(path.resolve(rootDir, outputRoot)),
			auditOutput: relative(path.resolve(rootDir, auditOutput)),
			paper: paperArg || null,
			subject: subjectArg,
			recursive,
			runSolvability,
			importMode: noImportCheck ? 'none' : importToD1 ? 'write' : 'dry-run',
			checkExisting,
			allowSharedChainUpdates,
			keptQuestions: buildSummary.keptQuestions,
			droppedQuestions: buildSummary.droppedQuestions,
			importedPapers: importResults.map((result) => result.sourceDocumentId),
			importResults
		},
		null,
		2
	)
);

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

function runCapture(args, label) {
	const result = spawnSync(process.execPath, args, {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
		maxBuffer: 16 * 1024 * 1024
	});
	if (result.status !== 0) {
		throw new Error(`${label} failed with exit code ${result.status ?? result.signal}.`);
	}
	return result.stdout;
}

function runCapturedLog(args, label) {
	const output = runCapture(args, label);
	if (output.trim()) process.stderr.write(output);
	return output;
}

function buildImportReadySubset() {
	const args = [
		'scripts/build-import-ready-extracted-subset.mjs',
		`--output-root=${outputRoot}`,
		`--subject=${subjectArg}`
	];
	if (inputPath) args.push(`--input=${inputPath}`);
	else args.push(`--input-root=${inputRoot}`);
	if (paperArg) args.push(`--paper=${paperArg}`);
	if (!recursive) args.push('--no-recursive');
	if (keepWarnings) args.push('--keep-warnings');

	const raw = runCapture(args, 'import-ready subset build');
	const summary = JSON.parse(raw);
	if (summary.status !== 'passed') {
		throw new Error(`Import-ready subset build returned ${summary.status}.`);
	}
	if (summary.keptQuestions <= 0) {
		throw new Error('Import-ready subset contains no questions; nothing is safe to import.');
	}
	return summary;
}

function auditImportReadySubset() {
	const resolvedOutputRoot = path.resolve(rootDir, outputRoot);
	const resolvedAuditOutput = path.resolve(rootDir, auditOutput);
	if (
		resolvedAuditOutput.startsWith(`${resolvedOutputRoot}${path.sep}`) &&
		existsSync(resolvedAuditOutput)
	) {
		rmSync(resolvedAuditOutput, { force: true });
	}
	const args = [
		'scripts/audit-extracted-question-data.mjs',
		`--input-root=${outputRoot}`,
		`--output=${auditOutput}`,
		`--subject=${subjectArg}`,
		'--fail-on-warnings'
	];
	if (!recursive) args.push('--no-recursive');
	if (paperArg) args.push(`--paper=${paperArg}`);
	if (runSolvability) {
		args.push('--run-solvability');
		if (model) args.push(`--model=${model}`);
		if (thinkingLevel) args.push(`--thinking-level=${thinkingLevel}`);
		if (concurrency) args.push(`--concurrency=${concurrency}`);
		if (minSolvabilityScore) args.push(`--min-solvability-score=${minSolvabilityScore}`);
	}
	runCapturedLog(args, 'strict import-ready audit');
}

function runImportChecks(summary) {
	const files = (summary.files ?? []).filter((file) => file.keptQuestions > 0);
	if (files.length === 0) {
		throw new Error('Import-ready subset has no paper files with kept questions.');
	}
	return files.map((file) => {
		const sourceDocumentId = file.sourceDocumentId;
		if (!sourceDocumentId) throw new Error(`Missing sourceDocumentId in subset file ${file.output}.`);
		const args = [
			'scripts/import-physics-vision.mjs',
			`--input-root=${outputRoot}`,
			'--recursive',
			`--paper=${sourceDocumentId}`
		];
		if (!importToD1) args.push('--dry-run');
		if (checkExisting) args.push('--check-existing');
		if (allowSharedChainUpdates) args.push('--allow-shared-chain-updates');
		runCapturedLog(args, `${importToD1 ? 'import' : 'import dry-run'} ${sourceDocumentId}`);
		return {
			sourceDocumentId,
			mode: importToD1 ? 'write' : 'dry-run',
			questions: file.keptQuestions
		};
	});
}
