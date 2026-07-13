#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { d1Rows } from './lib/d1-rest.mjs';
import { readJson, writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/run-codex-production-import-batch.mjs --all [options]
node scripts/run-codex-production-import-batch.mjs --subject=<subject> [options]
node scripts/run-codex-production-import-batch.mjs --paper=<source-document-id-or-component> [options]

Options:
  --manifest=data/aqa-gcse-history-geography-computer-science/manifest.json
  --data-root=data/aqa-gcse-history-geography-computer-science
  --subject=all|computer-science|geography|history|biology|chemistry|physics|english
  --max-papers=<n>
  --exclude-paper=<source-document-id-or-component> (repeatable)
  --skip-imported
  --concurrency=<n>
  --paper-attempts=<n>
  --work-root=tmp/codex-production-import-batch
  --summary=tmp/codex-production-import-batch-summary.json
  --run-id-prefix=codex-production-batch
  --run-id=<single-paper-run-id>
  --d1-existing-chains
  --existing-chain-context-root=<dir>
  --existing-chain-max-examples=<n>
  --existing-chain-max-mark-items=<n>
  --existing-chain-max-chains=<n>
  --allow-unpublishable-source-drops
  --reuse-existing-extraction
  --generate-chain-illustrations       run one deduplicated post-import image batch
  --require-chain-illustrations        fail the batch if an accepted chain has no winner
  --chain-illustration-max-chains=20
  --force-chain-illustrations
  --dry-run
  --continue-on-error
  --allow-dropped-questions  diagnostic only: allow partial import-ready subsets

All model, judge, chain, solvability, import, and force flags accepted by codex:production-import
are forwarded. Use --solvability-concurrency=<n> to control per-paper solvability checks; batch
--concurrency controls how many paper pipelines run at once.`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const dataRoot = path.resolve(
	rootDir,
	stringArg('data-root', 'data/aqa-gcse-history-geography-computer-science')
);
const manifestPath = path.resolve(
	rootDir,
	stringArg('manifest', path.join(dataRoot, 'manifest.json'))
);
const workRoot = path.resolve(rootDir, stringArg('work-root', 'tmp/codex-production-import-batch'));
const summaryPath = path.resolve(
	rootDir,
	stringArg('summary', 'tmp/codex-production-import-batch-summary.json')
);
const all = hasArg('all');
const paperArg = stringArg('paper', '');
const excludePaperArgs = stringArgs('exclude-paper').flatMap((value) =>
	value
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean)
);
const subjectArg = canonicalSubject(stringArg('subject', 'all'));
const maxPapers = optionalIntegerArg('max-papers');
const skipImported = hasArg('skip-imported');
const concurrency = integerArg('concurrency', 1, 1);
const paperAttempts = integerArg('paper-attempts', 1, 1);
const dryRun = hasArg('dry-run');
const continueOnError = hasArg('continue-on-error');
const runId = stringArg('run-id', '');
const runIdPrefix = stringArg('run-id-prefix', runId || 'codex-production-batch');
const explicitExistingChains = stringArg('existing-chains', '');
const useD1ExistingChains =
	!explicitExistingChains && (hasArg('d1-existing-chains') || hasArg('auto-d1-existing-chains'));
const existingChainContextRoot = path.resolve(
	rootDir,
	stringArg('existing-chain-context-root', path.join(workRoot, 'existing-chain-contexts'))
);
const existingChainMaxExamples = integerArg('existing-chain-max-examples', 4, 0);
const existingChainMaxMarkItems = integerArg('existing-chain-max-mark-items', 4, 0);
const existingChainMaxChains = integerArg('existing-chain-max-chains', 0, 0);
const generateChainIllustrations =
	hasArg('generate-chain-illustrations') || hasArg('require-chain-illustrations');
const requireChainIllustrations = hasArg('require-chain-illustrations');
let chainIllustrationResult = null;

if (generateChainIllustrations && (!hasArg('import') || hasArg('no-import-check'))) {
	throw new Error(
		'--generate-chain-illustrations requires a real D1 import: use --import without --no-import-check.'
	);
}

if (!existsSync(manifestPath)) throw new Error(`Missing manifest: ${relative(manifestPath)}`);
if (!all && !paperArg && subjectArg === 'all') {
	throw new Error(
		`Pass --all, --subject=<subject>, or --paper=<source-document-id-or-component>.\n\n${usage}`
	);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
// TODO(curriculum-notices): add a reviewed corpus-level pass after several papers can be compared.
// Ask for a short learner-facing title and one or two sentences only when the context changes how
// imported questions should be used, and require supporting source-document IDs. Do not turn paper
// summaries or extraction notes into notices. Attribute official dates separately from product
// policy. Example: "OCR first assessed its revised anthology in June 2024. Earlier questions use
// the previous version; this question bank keeps them for essay practice."
// A single-paper extraction must not infer a curriculum transition by itself.
const importedSourceDocumentIds = skipImported
	? await loadImportedSourceDocumentIds(manifest.rows ?? [])
	: new Set();
const skippedImportedRows = [];
const selected = selectRows(manifest.rows ?? []);
if (selected.length === 0) {
	if (!skipImported || skippedImportedRows.length === 0) {
		throw new Error('No manifest rows matched the selection.');
	}
	const output = emptySelectionSummary(dryRun ? 'dry-run' : 'passed');
	mkdirSync(path.dirname(summaryPath), { recursive: true });
	writeJson(summaryPath, output);
	console.log(JSON.stringify(output, null, 2));
	process.exit(0);
}

const d1ExistingChainsBySubject = useD1ExistingChains
	? buildD1ExistingChainContexts(selected)
	: new Map();
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
		skipImported,
		skippedImported: skippedImportedRows.length,
		d1ExistingChains: d1ExistingChainsSummary(),
		chainIllustrations: generateChainIllustrations
			? {
					command: [
						process.execPath,
						...chainIllustrationBatchCommand(planned.map((paper) => paper.sourceDocumentId))
					]
				}
			: null,
		missingFiles,
		planned: planned.map((paper) => ({
			sourceDocumentId: paper.sourceDocumentId,
			subject: subjectAreaFor(paper.row),
			paper: paper.row.paper,
			series: paper.row.series,
			workRoot: relative(paper.workRoot),
			existingChainsPath: paper.existingChainsPath ? relative(paper.existingChainsPath) : null,
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
if (generateChainIllustrations && results.some((result) => result.status === 'passed')) {
	const importedIds = results
		.filter((result) => result.status === 'passed')
		.map((result) => result.sourceDocumentId);
	try {
		await runCommand(process.execPath, chainIllustrationBatchCommand(importedIds));
		const illustrationSummaryPath = path.join(workRoot, 'chain-illustrations', 'summary.json');
		chainIllustrationResult = existsSync(illustrationSummaryPath)
			? readJson(illustrationSummaryPath)
			: { status: 'passed' };
	} catch (error) {
		chainIllustrationResult = {
			status: 'failed',
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
const illustrationFailed =
	requireChainIllustrations && chainIllustrationResult?.status === 'failed';
const finalStatus = failed.length || illustrationFailed ? 'failed' : 'passed';
writeSummary(finalStatus);
console.log(JSON.stringify(summary(finalStatus), null, 2));
if (failed.length > 0 || illustrationFailed) process.exit(1);

function selectRows(rows) {
	const excludedPapers = new Set(excludePaperArgs);
	const excludedPaperUpper = new Set(excludePaperArgs.map((value) => value.toUpperCase()));
	const filtered = rows.filter((row) => {
		const rowSubject = canonicalSubject(subjectAreaFor(row));
		const subjectMatches = subjectArg === 'all' || rowSubject === subjectArg;
		const component = String(row.component ?? '').toUpperCase();
		const unitCode = String(row.unit_code ?? '').toUpperCase();
		const sourceDocumentId = sourceDocumentIdFor(row);
		const excluded =
			excludedPapers.has(sourceDocumentId) ||
			excludedPaperUpper.has(component) ||
			excludedPaperUpper.has(unitCode) ||
			excludedPapers.has(row.question_paper?.filename ?? '') ||
			excludedPapers.has(row.mark_scheme?.filename ?? '');
		const paperMatches =
			!paperArg ||
			sourceDocumentId === paperArg ||
			component === paperArg.toUpperCase() ||
			unitCode === paperArg.toUpperCase() ||
			row.question_paper?.filename === paperArg ||
			row.mark_scheme?.filename === paperArg;
		if (excluded || !subjectMatches || !paperMatches) return false;
		if (skipImported && importedSourceDocumentIds.has(sourceDocumentId)) {
			skippedImportedRows.push(row);
			return false;
		}
		return true;
	});
	return maxPapers ? filtered.slice(0, maxPapers) : filtered;
}

async function loadImportedSourceDocumentIds(rows) {
	const ids = [...new Set(rows.map((row) => sourceDocumentIdFor(row)).filter(Boolean))];
	if (ids.length === 0) return new Set();
	const importedRows = await d1Rows(
		`SELECT DISTINCT source_document_id AS id FROM questions WHERE source_document_id IN (${ids
			.map(() => '?')
			.join(',')})`,
		ids,
		{ rootDir }
	);
	return new Set(importedRows.map((row) => row.id));
}

function plannedPaper(row) {
	const sourceDocumentId = sourceDocumentIdFor(row);
	const questionPaperPath = documentPath(row.question_paper, 'question-papers');
	const markSchemePath = documentPath(row.mark_scheme, 'mark-schemes');
	const supportingDocumentPaths = supportingDocumentsFor(row).map((document) =>
		documentPath(document, documentSubdir(document))
	);
	const paperWorkRoot = path.join(workRoot, sourceDocumentId);
	const existingChainsPath = existingChainsPathFor(row);
	const missingFiles = [questionPaperPath, markSchemePath, ...supportingDocumentPaths]
		.filter((filePath) => !existsSync(filePath))
		.map(relative);
	return {
		row,
		sourceDocumentId,
		questionPaperPath,
		markSchemePath,
		supportingDocumentPaths,
		existingChainsPath,
		workRoot: paperWorkRoot,
		missingFiles,
		command: productionCommand(row, {
			questionPaperPath,
			markSchemePath,
			supportingDocumentPaths,
			existingChainsPath,
			workRoot: paperWorkRoot
		})
	};
}

function documentPath(document, defaultSubdir) {
	if (document?.local_path) return path.resolve(rootDir, document.local_path);
	return path.join(dataRoot, defaultSubdir, document?.filename ?? '');
}

function documentSubdir(document) {
	return document?.document_type === 'examiner_report'
		? 'examiner-reports'
		: 'supporting-documents';
}

function supportingDocumentsFor(row) {
	const documents = [];
	if (row.examiner_report) documents.push(row.examiner_report);
	documents.push(...(row.supporting_documents ?? []));

	const seen = new Set();
	return documents.filter((document) => {
		const key = document?.local_path ?? document?.source_url ?? document?.filename ?? '';
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function productionCommand(row, paper) {
	const sourceDocumentId = sourceDocumentIdFor(row);
	const args = [
		'scripts/run-codex-production-import-pipeline.mjs',
		`--question-paper=${paper.questionPaperPath}`,
		`--mark-scheme=${paper.markSchemePath}`,
		`--source-document-id=${sourceDocumentId}`,
		`--mark-scheme-document-id=${markSchemeDocumentIdFor(row)}`,
		`--work-root=${paper.workRoot}`,
		`--board=${row.board ?? manifest.board ?? ''}`,
		`--qualification=${row.qualification ?? manifest.qualification ?? ''}`,
		`--subject=${row.subject ?? manifest.subject ?? ''}`,
		`--subject-area=${subjectAreaFor(row)}`,
		`--tier=${row.tier ?? manifest.tier ?? ''}`,
		`--paper-label=${row.paper ?? ''}`,
		`--component-code=${row.unit_code ?? row.component ?? ''}`,
		`--series=${row.series ?? ''}`,
		`--year=${row.year ?? ''}`,
		`--question-paper-title=${row.question_paper?.title ?? ''}`,
		`--mark-scheme-title=${row.mark_scheme?.title ?? ''}`,
		`--question-paper-url=${documentUrl(row.question_paper)}`,
		`--mark-scheme-url=${documentUrl(row.mark_scheme)}`,
		`--run-id=${runIdFor(row)}`
	].filter((arg) => !arg.endsWith('='));
	for (const supportingDocumentPath of paper.supportingDocumentPaths) {
		args.push(`--supporting-document=${supportingDocumentPath}`);
	}
	if (paper.existingChainsPath) args.push(`--existing-chains=${paper.existingChainsPath}`);
	for (const name of [
		'existing-chain-input-root',
		'model',
		'thinking-level',
		'extraction-model',
		'extraction-thinking-level',
		'extraction-timeout-ms',
		'judge-model',
		'judge-thinking-level',
		'judge-timeout-ms',
		'chain-model',
		'chain-thinking-level',
		'chain-timeout-ms',
		'solvability-model',
		'solvability-thinking-level',
		'min-solvability-score',
		'timeout-ms',
		'expected-marks',
		'expected-questions'
	]) {
		forwardString(args, name);
	}
	const solvabilityConcurrency = stringArg('solvability-concurrency', '');
	if (solvabilityConcurrency) args.push(`--concurrency=${solvabilityConcurrency}`);
	for (const flag of [
		'force',
		'skip-solvability',
		'skip-extraction-judge',
		'no-import-check',
		'skip-d1-conflict-check',
		'allow-shared-chain-updates',
		'allow-unpublishable-source-drops',
		'reuse-existing-extraction',
		'allow-dropped-questions',
		'skip-r2-upload',
		'import'
	]) {
		if (hasArg(flag)) args.push(`--${flag}`);
	}
	return args;
}

function chainIllustrationBatchCommand(sourceDocumentIds) {
	const args = [
		'scripts/generate-chain-illustrations.mjs',
		`--max-chains=${stringArg('chain-illustration-max-chains', '20')}`,
		`--work-root=${path.join(workRoot, 'chain-illustrations')}`,
		`--planner-model=${stringArg('chain-illustration-planner-model', 'gpt-5.6-sol')}`,
		`--planner-thinking-level=${stringArg('chain-illustration-planner-thinking-level', 'max')}`,
		`--judge-model=${stringArg('chain-illustration-judge-model', 'gpt-5.6-sol')}`,
		`--judge-thinking-level=${stringArg('chain-illustration-judge-thinking-level', 'max')}`,
		`--image-model=${stringArg('chain-illustration-image-model', 'chatgpt-gpt-image-2')}`,
		`--image-timeout-ms=${stringArg('chain-illustration-image-timeout-ms', stringArg('timeout-ms', '7200000'))}`,
		`--timeout-ms=${stringArg('chain-illustration-timeout-ms', stringArg('timeout-ms', '7200000'))}`,
		'--publish'
	];
	for (const sourceDocumentId of sourceDocumentIds) {
		args.push(`--source-document-id=${sourceDocumentId}`);
	}
	if (requireChainIllustrations) args.push('--require');
	args.push('--replace-work-root');
	if (hasArg('force-chain-illustrations')) args.push('--include-existing');
	return args;
}

function runIdFor(row) {
	if (runId && selected.length === 1) return runId;
	return `${runIdPrefix}-${sourceDocumentIdFor(row)}`;
}

function existingChainsPathFor(row) {
	if (explicitExistingChains) return path.resolve(rootDir, explicitExistingChains);
	if (!useD1ExistingChains) return null;
	return d1ExistingChainsBySubject.get(canonicalSubject(subjectAreaFor(row))) ?? null;
}

function buildD1ExistingChainContexts(rows) {
	const subjects = [
		...new Set(rows.map((row) => canonicalSubject(subjectAreaFor(row))).filter(Boolean))
	].sort();
	const bySubject = new Map();
	mkdirSync(existingChainContextRoot, { recursive: true });
	for (const subject of subjects) {
		const outputPath = path.join(existingChainContextRoot, `${subject}.json`);
		const args = [
			'scripts/build-existing-chain-context.mjs',
			'--d1',
			`--subject=${subject}`,
			`--output=${outputPath}`,
			`--max-examples-per-chain=${existingChainMaxExamples}`,
			`--max-mark-items-per-example=${existingChainMaxMarkItems}`
		];
		if (existingChainMaxChains > 0) args.push(`--max-chains=${existingChainMaxChains}`);
		const result = spawnSync(process.execPath, args, {
			cwd: rootDir,
			encoding: 'utf8'
		});
		if (result.stdout?.trim()) console.error(result.stdout.trim());
		if (result.stderr?.trim()) console.error(result.stderr.trim());
		if (result.status !== 0) {
			throw new Error(
				`Failed to build D1 existing-chain context for ${subject}: ${process.execPath} exited with ${
					result.status ?? result.signal
				}.`
			);
		}
		bySubject.set(subject, outputPath);
	}
	return bySubject;
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
					sourceDocumentId: paper.sourceDocumentId,
					subject: subjectAreaFor(paper.row),
					paper: paper.row.paper,
					series: paper.row.series,
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
	console.error(`[codex-production-batch] importing ${paper.sourceDocumentId}`);
	await runCommandWithRetry(process.execPath, paper.command);
	const paperSummaryPath = path.join(paper.workRoot, 'codex-production-import-summary.json');
	const paperSummary = existsSync(paperSummaryPath) ? readJson(paperSummaryPath) : null;
	return {
		sourceDocumentId: paper.sourceDocumentId,
		subject: subjectAreaFor(paper.row),
		paper: paper.row.paper,
		series: paper.row.series,
		workRoot: relative(paper.workRoot),
		status: paperSummary?.status ?? 'passed',
		summaryPath: existsSync(paperSummaryPath) ? relative(paperSummaryPath) : null,
		codex: {
			extraction: paperSummary?.extractionSummary?.codex ?? null,
			extractionJudge: paperSummary?.extractionJudgeSummary?.codex ?? null,
			chains: paperSummary?.chainSummary?.codex ?? null,
			solvability: paperSummary?.solvabilitySummary?.codex ?? null
		},
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
		try {
			if (attempt > 1) {
				console.error(`[codex-production-batch] retrying attempt ${attempt}/${paperAttempts}`);
			}
			await runCommand(command, args);
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
		skipImported,
		skippedImported: skippedImportedRows.length,
		d1ExistingChains: d1ExistingChainsSummary(),
		chainIllustrations: chainIllustrationResult,
		results
	};
}

function d1ExistingChainsSummary() {
	return useD1ExistingChains
		? [...d1ExistingChainsBySubject.entries()].map(([subject, filePath]) => ({
				subject,
				filePath: relative(filePath)
			}))
		: [];
}

function emptySelectionSummary(status) {
	return {
		status,
		selected: 0,
		passed: 0,
		failed: 0,
		concurrency,
		paperAttempts,
		manifest: relative(manifestPath),
		dataRoot: relative(dataRoot),
		workRoot: relative(workRoot),
		runIdPrefix,
		continueOnError,
		skipImported,
		skippedImported: skippedImportedRows.length,
		d1ExistingChains: [],
		chainIllustrations: null,
		planned: [],
		results: []
	};
}

function writeSummary(status) {
	writeJson(summaryPath, summary(status));
}

function canonicalSubject(value) {
	const normalized = String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (!normalized || normalized === 'all') return 'all';
	if (normalized.includes('computer-science') || normalized === 'computing')
		return 'computer-science';
	if (normalized.includes('english-literature')) return 'english-literature';
	if (normalized.includes('english-language')) return 'english-language';
	if (normalized.includes('geography')) return 'geography';
	if (normalized.includes('history')) return 'history';
	if (normalized.includes('biology')) return 'biology';
	if (normalized.includes('chemistry')) return 'chemistry';
	if (normalized.includes('physics')) return 'physics';
	if (normalized.includes('english')) return 'english';
	if (normalized.includes('science')) return 'science';
	return normalized;
}

function sourceDocumentIdFor(row) {
	if (row.source_document_id) return row.source_document_id;
	const spec = slugPart(row.spec_code ?? manifest.spec_code ?? row.unit_code ?? row.component);
	const unit = slugPart(row.unit_code ?? row.component ?? row.paper);
	const series = slugPart(row.series_code ?? row.series ?? row.year);
	const componentParts = unit.startsWith(spec) ? [unit] : [spec, unit];
	return ['ocr', ...componentParts, 'qp', series].filter(Boolean).join('-');
}

function markSchemeDocumentIdFor(row) {
	if (row.mark_scheme_document_id) return row.mark_scheme_document_id;
	return sourceDocumentIdFor(row).replace('-qp-', '-ms-');
}

function subjectAreaFor(row) {
	const subject = row.subject_area ?? row.subject ?? manifest.subject ?? '';
	const englishContext = [
		row.subject_area,
		row.subject,
		manifest.subject,
		row.paper,
		row.component,
		row.title,
		row.source_document_id
	]
		.filter(Boolean)
		.join(' ');
	if (/english/i.test(englishContext)) {
		if (/literature/i.test(englishContext)) return 'English Literature';
		if (/language/i.test(englishContext)) return 'English Language';
	}
	return subject;
}

function documentUrl(document) {
	return document?.url ?? document?.source_url ?? '';
}

function slugPart(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function stringArgs(name) {
	const prefix = `--${name}=`;
	return process.argv
		.filter((candidate) => candidate.startsWith(prefix))
		.map((candidate) => candidate.slice(prefix.length));
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

function forwardString(args, name) {
	const value = stringArg(name, '');
	if (value) args.push(`--${name}=${value}`);
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}
