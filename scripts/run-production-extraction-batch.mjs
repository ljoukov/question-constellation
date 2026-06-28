#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/run-production-extraction-batch.mjs --all [options]
node scripts/run-production-extraction-batch.mjs --paper=<source-document-id-or-component> [options]

Options:
  --manifest=data/aqa-separate-science-higher/manifest.json
  --data-root=data/aqa-separate-science-higher
  --subject=biology|chemistry|physics|all
  --max-papers=<n>
  --concurrency=<n>
  --paper-attempts=<n>
  --work-root=tmp/production-extraction
  --summary=tmp/production-extraction-batch-summary.json
  --run-id-prefix=production-batch
  --run-id=<single-paper-run-id>
  --existing-chains=<existing-chain-context.json>
  --existing-chain-input-root=<audited-json-root>
  --solvability-concurrency=<n>
  --dry-run
  --continue-on-error

All model, chunking, judge, import, and force flags accepted by extract:production are forwarded.`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const dataRoot = path.resolve(rootDir, stringArg('data-root', 'data/aqa-separate-science-higher'));
const manifestPath = path.resolve(
	rootDir,
	stringArg('manifest', path.join(dataRoot, 'manifest.json'))
);
const workRoot = path.resolve(rootDir, stringArg('work-root', 'tmp/production-extraction'));
const summaryPath = path.resolve(
	rootDir,
	stringArg('summary', 'tmp/production-extraction-batch-summary.json')
);
const all = hasArg('all');
const paperArg = stringArg('paper', '');
const subjectArg = stringArg('subject', 'all').toLowerCase();
const maxPapers = optionalIntegerArg('max-papers');
const concurrency = integerArg('concurrency', 1, 1);
const paperAttempts = integerArg('paper-attempts', 1, 1);
const dryRun = hasArg('dry-run');
const continueOnError = hasArg('continue-on-error');
const runId = stringArg('run-id', '');
const runIdPrefix = stringArg('run-id-prefix', runId || 'production-batch');

if (!existsSync(manifestPath)) throw new Error(`Missing manifest: ${relative(manifestPath)}`);
if (!all && !paperArg)
	throw new Error(`Pass --all or --paper=<source-document-id-or-component>.\n\n${usage}`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const selected = selectRows(manifest.rows ?? []);
if (selected.length === 0) throw new Error('No manifest rows matched the selection.');

const planned = selected.map((row) => plannedPaper(row));
const missingFiles = planned.flatMap((paper) => paper.missingFiles);
if (!dryRun && missingFiles.length > 0) {
	throw new Error(
		`Missing input files:\n${missingFiles.map((filePath) => `- ${filePath}`).join('\n')}`
	);
}

const results = [];
mkdirSync(path.dirname(summaryPath), { recursive: true });

if (dryRun) {
	const output = {
		status: 'dry-run',
		selected: planned.length,
		concurrency,
		paperAttempts,
		manifest: relative(manifestPath),
		dataRoot: relative(dataRoot),
		workRoot: relative(workRoot),
		missingFiles,
		planned: planned.map((paper) => ({
			sourceDocumentId: paper.row.source_document_id,
			subject: paper.row.subject_area ?? paper.row.subject ?? null,
			workRoot: relative(paper.workRoot),
			missingFiles: paper.missingFiles,
			command: [process.execPath, ...paper.command]
		}))
	};
	console.log(JSON.stringify(output, null, 2));
	process.exit(0);
}

writeSummary('running');
await processSelectedPapers();
const failed = results.filter((result) => result.status === 'failed');
const finalStatus = failed.length ? 'failed' : 'passed';
writeSummary(finalStatus);
console.log(JSON.stringify(summary(finalStatus), null, 2));
if (failed.length > 0) process.exit(1);

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

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function selectRows(rows) {
	const filtered = rows.filter((row) => {
		const subjectMatches =
			subjectArg === 'all' ||
			String(row.subject_area ?? row.subject ?? '').toLowerCase() === subjectArg;
		const component = String(row.component ?? '').toUpperCase();
		const paperMatches =
			!paperArg ||
			row.source_document_id === paperArg ||
			component === paperArg.toUpperCase() ||
			row.question_paper?.filename === paperArg ||
			row.mark_scheme?.filename === paperArg;
		return subjectMatches && paperMatches;
	});
	return maxPapers ? filtered.slice(0, maxPapers) : filtered;
}

function plannedPaper(row) {
	const questionPaperPath = path.join(
		dataRoot,
		'question-papers',
		row.question_paper?.filename ?? ''
	);
	const markSchemePath = path.join(dataRoot, 'mark-schemes', row.mark_scheme?.filename ?? '');
	const supportingDocumentPaths = (row.supporting_documents ?? []).map((document) =>
		path.join(dataRoot, 'supporting-documents', document.filename)
	);
	const paperWorkRoot = path.join(workRoot, row.source_document_id);
	const missingFiles = [questionPaperPath, markSchemePath, ...supportingDocumentPaths]
		.filter((filePath) => !existsSync(filePath))
		.map(relative);
	return {
		row,
		questionPaperPath,
		markSchemePath,
		supportingDocumentPaths,
		workRoot: paperWorkRoot,
		missingFiles,
		command: productionCommand(row, {
			questionPaperPath,
			markSchemePath,
			supportingDocumentPaths,
			workRoot: paperWorkRoot
		})
	};
}

function productionCommand(row, paper) {
	const args = [
		'scripts/run-production-extraction-pipeline.mjs',
		`--question-paper=${paper.questionPaperPath}`,
		`--mark-scheme=${paper.markSchemePath}`,
		`--source-document-id=${row.source_document_id}`,
		`--mark-scheme-document-id=${row.mark_scheme_document_id}`,
		`--work-root=${paper.workRoot}`,
		`--board=${row.board ?? manifest.board ?? ''}`,
		`--qualification=${row.qualification ?? manifest.qualification ?? ''}`,
		`--subject=${row.subject ?? manifest.subject ?? ''}`,
		`--subject-area=${row.subject_area ?? row.subject ?? manifest.subject ?? ''}`,
		`--tier=${row.tier ?? manifest.tier ?? ''}`,
		`--paper-label=${row.paper ?? ''}`,
		`--component-code=${row.component ?? ''}`,
		`--series=${row.series ?? ''}`,
		`--year=${row.year ?? ''}`,
		`--question-paper-title=${row.question_paper?.title ?? ''}`,
		`--mark-scheme-title=${row.mark_scheme?.title ?? ''}`,
		`--question-paper-url=${row.question_paper?.url ?? ''}`,
		`--mark-scheme-url=${row.mark_scheme?.url ?? ''}`,
		`--run-id=${runIdFor(row)}`
	].filter((arg) => !arg.endsWith('='));
	for (const supportingDocumentPath of paper.supportingDocumentPaths) {
		args.push(`--supporting-document=${supportingDocumentPath}`);
	}
	forwardString(args, 'existing-chains');
	forwardString(args, 'existing-chain-input-root');
	forwardString(args, 'question-pages');
	forwardString(args, 'mark-scheme-pages');
	forwardString(args, 'chunk-pages');
	forwardString(args, 'context-pages');
	forwardString(args, 'chunk-concurrency');
	forwardString(args, 'chunk-strategy');
	forwardString(args, 'model');
	forwardString(args, 'judge-model');
	forwardString(args, 'thinking-level');
	forwardString(args, 'extraction-model');
	forwardString(args, 'extraction-thinking-level');
	forwardString(args, 'extraction-judge-thinking-level');
	forwardString(args, 'chain-model');
	forwardString(args, 'chain-thinking-level');
	forwardString(args, 'solvability-model');
	forwardString(args, 'solvability-thinking-level');
	forwardString(args, 'media-resolution');
	forwardString(args, 'dpi');
	forwardString(args, 'llm-timeout-ms');
	forwardString(args, 'llm-max-attempts');
	forwardString(args, 'llm-max-calls');
	forwardString(args, 'min-solvability-score');
	const solvabilityConcurrency = stringArg('solvability-concurrency', '');
	if (solvabilityConcurrency) args.push(`--concurrency=${solvabilityConcurrency}`);
	for (const flag of [
		'force',
		'force-chunks',
		'skip-extraction-judge',
		'skip-chain-judge',
		'skip-solvability',
		'no-import-check',
		'import'
	]) {
		if (hasArg(flag)) args.push(`--${flag}`);
	}
	return args;
}

function runIdFor(row) {
	if (runId && selected.length === 1) return runId;
	return `${runIdPrefix}-${row.source_document_id}`;
}

function forwardString(args, name) {
	const value = stringArg(name, '');
	if (value) args.push(`--${name}=${value}`);
}

async function processSelectedPapers() {
	let nextIndex = 0;
	let stopRequested = false;
	const workerCount = Math.min(concurrency, planned.length);
	async function worker() {
		while (!stopRequested) {
			const paper = planned[nextIndex];
			nextIndex += 1;
			if (!paper) return;
			try {
				const result = await processPaper(paper);
				results.push(result);
				writeSummary('running');
			} catch (error) {
				const result = {
					sourceDocumentId: paper.row.source_document_id,
					subject: paper.row.subject_area ?? paper.row.subject ?? null,
					workRoot: relative(paper.workRoot),
					status: 'failed',
					error: error instanceof Error ? error.message : String(error)
				};
				results.push(result);
				writeSummary('failed');
				if (!continueOnError) stopRequested = true;
			}
		}
	}
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

async function processPaper(paper) {
	console.error(`[production-batch] extracting ${paper.row.source_document_id}`);
	await runCommandWithRetry(process.execPath, paper.command);
	const paperSummaryPath = path.join(paper.workRoot, 'production-extraction-summary.json');
	const paperSummary = existsSync(paperSummaryPath) ? readJson(paperSummaryPath) : null;
	return {
		sourceDocumentId: paper.row.source_document_id,
		subject: paper.row.subject_area ?? paper.row.subject ?? null,
		workRoot: relative(paper.workRoot),
		status: paperSummary?.status ?? 'passed',
		summaryPath: existsSync(paperSummaryPath) ? relative(paperSummaryPath) : null,
		importReady: paperSummary?.importReady
			? {
					status: paperSummary.importReady.status,
					keptQuestions: paperSummary.importReady.keptQuestions,
					droppedQuestions: paperSummary.importReady.droppedQuestions,
					importMode: paperSummary.importReady.importMode
				}
			: null
	};
}

function runCommand(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: rootDir,
			stdio: 'inherit'
		});
		child.on('error', reject);
		child.on('exit', (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${command} exited with ${code ?? signal}`));
		});
	});
}

async function runCommandWithRetry(command, args) {
	let lastError = null;
	for (let attempt = 1; attempt <= paperAttempts; attempt += 1) {
		const attemptArgs = attempt === 1 ? args : args.filter((arg) => arg !== '--force-chunks');
		try {
			if (attempt > 1) {
				console.error(
					`[production-batch] retrying paper attempt ${attempt}/${paperAttempts} with existing chunk caches`
				);
			}
			await runCommand(command, attemptArgs);
			return;
		} catch (error) {
			lastError = error;
			if (attempt < paperAttempts) continue;
		}
	}
	throw lastError ?? new Error(`${command} failed.`);
}

function summary(status) {
	return {
		status,
		selected: selected.length,
		passed: results.filter((result) => result.status === 'passed').length,
		failed: results.filter((result) => result.status === 'failed').length,
		concurrency,
		paperAttempts,
		manifest: relative(manifestPath),
		dataRoot: relative(dataRoot),
		workRoot: relative(workRoot),
		runIdPrefix,
		continueOnError,
		results
	};
}

function writeSummary(status) {
	writeJson(summaryPath, summary(status));
}
