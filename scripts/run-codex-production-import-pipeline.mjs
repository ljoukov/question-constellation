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
  --model=gpt-5.6-sol
  --extraction-model=gpt-5.6-sol
  --extraction-thinking-level=max
  --chain-model=gpt-5.6-sol
  --chain-thinking-level=max
  --judge-model=gpt-5.6-sol
  --judge-thinking-level=max
  --solvability-model=gpt-5.6-sol
  --solvability-thinking-level=max
  --solvability-timeout-ms=7200000
  --expected-marks=100
  --expected-questions=46
  --run-id=<stable-log-id>
  --skip-solvability           skip the default Codex SDK solvability judge
  --run-legacy-solvability     use the old @ljoukov/llm solvability path instead of Codex SDK
  --skip-extraction-judge
  --run-legacy-chain-style-judge
  --no-import-check
  --skip-d1-conflict-check
  --allow-shared-chain-updates
  --skip-r2-upload
  --allow-visible-source-mismatch
  --allow-unpublishable-source-drops
  --reuse-existing-extraction
  --allow-dropped-questions  diagnostic only: allow partial import-ready subsets
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
const extractionJudgeOutputPath = path.join(workRoot, 'extraction-judge', 'judge-report.json');
const extractionJudgeSummaryPath = path.join(workRoot, 'codex-extraction-judge-summary.json');
const reconciledOutputPath = path.join(workRoot, 'chain-reconciled', `${sourceDocumentId}.json`);
const chainSummaryPath = path.join(workRoot, 'codex-chain-summary.json');
const importReadyRoot = path.join(workRoot, 'import-ready');
const importReadyAuditPath = path.join(workRoot, 'import-ready-audit.json');
const importReadyPaperPath = path.join(importReadyRoot, `${sourceDocumentId}.json`);
const solvabilityOutputPath = path.join(workRoot, 'codex-solvability', 'solvability-report.json');
const solvabilitySummaryPath = path.join(workRoot, 'codex-solvability-summary.json');
const summaryPath = path.join(workRoot, 'codex-production-import-summary.json');
const dryRun = hasArg('dry-run');
const force = hasArg('force');
const runExtractionJudge = !hasArg('skip-extraction-judge');
const skipSolvability = hasArg('skip-solvability');
const runLegacySolvability = hasArg('run-legacy-solvability') && !skipSolvability;
const runCodexSolvability = !skipSolvability && !runLegacySolvability;
const noImportCheck = hasArg('no-import-check');
const importToD1 = hasArg('import');
const checkExisting = !noImportCheck && !hasArg('skip-d1-conflict-check');
const uploadR2Assets = importToD1 && !hasArg('skip-r2-upload');

for (const filePath of [questionPaperPath, markSchemePath, ...supportingDocumentPaths]) {
	if (!existsSync(filePath)) throw new Error(`Input file does not exist: ${filePath}`);
}

const sourceIdentityCheck = inspectSourceIdentity();

const plan = {
	sourceDocumentId,
	questionPaperPath: relative(questionPaperPath),
	markSchemePath: relative(markSchemePath),
	supportingDocumentPaths: supportingDocumentPaths.map(relative),
	workRoot: relative(workRoot),
	rawOutputPath: relative(rawOutputPath),
	extractionJudgeOutputPath: relative(extractionJudgeOutputPath),
	reconciledOutputPath: relative(reconciledOutputPath),
	importReadyRoot: relative(importReadyRoot),
	importReadyAuditPath: relative(importReadyAuditPath),
	summaryPath: relative(summaryPath),
	sourceIdentityCheck,
	runExtractionJudge,
	solvabilityMode: skipSolvability ? 'none' : runLegacySolvability ? 'legacy' : 'codex',
	solvabilityOutputPath: runCodexSolvability ? relative(solvabilityOutputPath) : null,
	importMode: noImportCheck ? 'none' : importToD1 ? 'write' : 'dry-run',
	checkExisting,
	uploadR2Assets
};

if (dryRun) {
	console.log(JSON.stringify({ status: 'dry-run', plan, commands: plannedCommands() }, null, 2));
	process.exit(0);
}

mkdirSync(workRoot, { recursive: true });
const startedAt = new Date().toISOString();
const steps = [];
try {
	enforceSourceIdentity(sourceIdentityCheck);
	steps.push({ label: 'visible PDF source identity preflight', status: 'passed' });
	steps.push(runInherited(extractionCommand(), 'Codex PDF extraction'));
	if (runExtractionJudge) {
		steps.push(runInherited(extractionJudgeCommand(), 'independent Codex extraction judge'));
	}
	steps.push(runInherited(chainCommand(), 'Codex answer-chain reconciliation'));
	if (uploadR2Assets) steps.push(runInherited(uploadAssetsCommand(), 'R2 asset upload'));
	let importReady = null;
	if (runCodexSolvability) {
		importReady = runJson(
			prepareImportReadyCommand({ forceNoImportCheck: true }),
			'strict audit before Codex solvability'
		);
		steps.push({ label: 'strict audit before Codex solvability', status: 'passed' });
		steps.push(runInherited(codexSolvabilityCommand(), 'Codex solvability judge'));
		if (!noImportCheck) {
			importReady = runJson(
				prepareImportReadyCommand(),
				`strict audit / D1 ${importToD1 ? 'write' : 'dry-run'}`
			);
			steps.push({
				label: `strict audit / D1 ${importToD1 ? 'write' : 'dry-run'}`,
				status: 'passed'
			});
		}
	} else {
		importReady = runJson(
			prepareImportReadyCommand({ includeLegacySolvability: runLegacySolvability }),
			`strict audit${runLegacySolvability ? ' / legacy solvability' : ''} / D1 ${
				noImportCheck ? 'none' : importToD1 ? 'write' : 'dry-run'
			}`
		);
		steps.push({
			label: `strict audit${runLegacySolvability ? ' / legacy solvability' : ''} / D1 ${
				noImportCheck ? 'none' : importToD1 ? 'write' : 'dry-run'
			}`,
			status: 'passed'
		});
	}
	const summary = {
		status: 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		steps,
		importReady,
		solvabilitySummary: readJsonIfExists(solvabilitySummaryPath),
		extractionSummary: readJsonIfExists(extractionSummaryPath),
		extractionJudgeSummary: readJsonIfExists(extractionJudgeSummaryPath),
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
		extractionJudgeSummary: readJsonIfExists(extractionJudgeSummaryPath),
		chainSummary: readJsonIfExists(chainSummaryPath),
		solvabilitySummary: readJsonIfExists(solvabilitySummaryPath)
	};
	writeJson(summaryPath, summary);
	console.error(JSON.stringify({ ...summary, summary: relative(summaryPath) }, null, 2));
	process.exit(1);
}

function plannedCommands() {
	return [
		extractionCommand(),
		...(runExtractionJudge ? [extractionJudgeCommand()] : []),
		chainCommand(),
		...(uploadR2Assets ? [uploadAssetsCommand()] : []),
		...(runCodexSolvability
			? [
					prepareImportReadyCommand({ forceNoImportCheck: true }),
					codexSolvabilityCommand(),
					...(noImportCheck ? [] : [prepareImportReadyCommand()])
				]
			: [prepareImportReadyCommand({ includeLegacySolvability: runLegacySolvability })])
	].map((command) => command.map(String));
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
		`--model=${stringArg('extraction-model', stringArg('model', 'gpt-5.6-sol'))}`,
		`--thinking-level=${stringArg('extraction-thinking-level', stringArg('thinking-level', 'max'))}`,
		`--timeout-ms=${stringArg('extraction-timeout-ms', stringArg('timeout-ms', '7200000'))}`
	];
	forwardCommonExtractionArgs(args);
	if (hasArg('allow-unpublishable-source-drops')) args.push('--allow-unpublishable-source-drops');
	if (hasArg('reuse-existing-extraction')) args.push('--reuse-existing-extraction');
	if (force) args.push('--force');
	return args;
}

function extractionJudgeCommand() {
	const args = [
		'scripts/run-codex-extraction-judge.mjs',
		`--candidate=${rawOutputPath}`,
		`--question-paper=${questionPaperPath}`,
		`--mark-scheme=${markSchemePath}`,
		`--source-document-id=${sourceDocumentId}`,
		`--work-dir=${path.join(workRoot, 'extraction-judge')}`,
		`--output=${extractionJudgeOutputPath}`,
		`--summary=${extractionJudgeSummaryPath}`,
		`--model=${stringArg('judge-model', stringArg('model', 'gpt-5.6-sol'))}`,
		`--thinking-level=${stringArg('judge-thinking-level', 'max')}`,
		`--timeout-ms=${stringArg('judge-timeout-ms', stringArg('timeout-ms', '7200000'))}`
	];
	forwardString(args, 'expected-marks');
	forwardString(args, 'expected-questions');
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
		`--model=${stringArg('chain-model', stringArg('model', 'gpt-5.6-sol'))}`,
		`--thinking-level=${stringArg('chain-thinking-level', 'max')}`,
		`--timeout-ms=${stringArg('chain-timeout-ms', stringArg('timeout-ms', '7200000'))}`
	];
	forwardString(args, 'existing-chains');
	forwardString(args, 'existing-chain-input-root');
	if (hasArg('allow-shared-chain-updates')) args.push('--allow-shared-chain-updates');
	if (hasArg('run-legacy-chain-style-judge')) {
		args.push('--run-legacy-chain-style-judge');
	} else {
		args.push('--skip-chain-style-judge');
	}
	if (force) args.push('--force');
	return args;
}

function uploadAssetsCommand() {
	return [
		'scripts/upload-r2-images.mjs',
		`--asset-root=${path.join(workRoot, 'codex-extraction')}`,
		`--referenced-baseline=${reconciledOutputPath}`,
		`--source-document-id=${sourceDocumentId}`
	];
}

function codexSolvabilityCommand() {
	const minScore = stringArg('min-solvability-score', stringArg('min-score', ''));
	const args = [
		'scripts/run-codex-solvability-judge.mjs',
		`--input=${importReadyPaperPath}`,
		`--source-document-id=${sourceDocumentId}`,
		`--work-dir=${path.join(workRoot, 'codex-solvability')}`,
		`--output=${solvabilityOutputPath}`,
		`--summary=${solvabilitySummaryPath}`,
		`--model=${stringArg('solvability-model', stringArg('model', 'gpt-5.6-sol'))}`,
		`--thinking-level=${stringArg('solvability-thinking-level', 'max')}`,
		`--timeout-ms=${stringArg('solvability-timeout-ms', stringArg('timeout-ms', '7200000'))}`
	];
	if (minScore) args.push(`--min-score=${minScore}`);
	const question = stringArg('solvability-question', '');
	if (question) args.push(`--question=${question}`);
	const maxQuestions = stringArg('solvability-max-questions', '');
	if (maxQuestions) args.push(`--max-questions=${maxQuestions}`);
	if (hasArg('solvability-target-only')) args.push('--target-only');
	if (force) args.push('--force');
	return args;
}

function prepareImportReadyCommand({
	forceNoImportCheck = false,
	includeLegacySolvability = false
} = {}) {
	const args = [
		'scripts/prepare-import-ready-extraction.mjs',
		`--input=${reconciledOutputPath}`,
		`--output-root=${importReadyRoot}`,
		`--audit-output=${importReadyAuditPath}`
	];
	if (includeLegacySolvability) {
		args.push('--run-solvability');
		args.push(`--model=${stringArg('solvability-model', stringArg('model', 'gpt-5.6-sol'))}`);
		args.push(`--thinking-level=${stringArg('solvability-thinking-level', 'max')}`);
		forwardString(args, 'min-solvability-score');
		forwardString(args, 'concurrency');
	}
	forwardString(args, 'run-id');
	if (noImportCheck || forceNoImportCheck) args.push('--no-import-check');
	if (checkExisting && !forceNoImportCheck) args.push('--check-existing');
	if (hasArg('allow-shared-chain-updates')) args.push('--allow-shared-chain-updates');
	if (hasArg('allow-dropped-questions')) args.push('--allow-dropped-questions');
	if (importToD1 && !forceNoImportCheck) args.push('--import');
	return args;
}

function inspectSourceIdentity() {
	const expectedSeries = stringArg('series', '');
	const expectedComponent = stringArg('component-code', '');
	const questionPaper = inspectPdfSource(questionPaperPath);
	const markScheme = inspectPdfSource(markSchemePath);
	const issues = [];
	const expectedSeriesKey = normalizeSeries(expectedSeries);
	const visibleSeries = firstNonEmpty([questionPaper.series, markScheme.series]);
	const visibleSeriesKey = normalizeSeries(visibleSeries);
	if (expectedSeriesKey && visibleSeriesKey && expectedSeriesKey !== visibleSeriesKey) {
		issues.push({
			code: 'visible_series_mismatch',
			severity: 'error',
			expected: expectedSeries,
			visible: visibleSeries,
			evidence: {
				questionPaper: questionPaper.seriesEvidence,
				markScheme: markScheme.seriesEvidence
			}
		});
	}
	if (
		normalizeSeries(questionPaper.series) &&
		normalizeSeries(markScheme.series) &&
		normalizeSeries(questionPaper.series) !== normalizeSeries(markScheme.series)
	) {
		issues.push({
			code: 'question_paper_mark_scheme_series_mismatch',
			severity: 'error',
			questionPaper: questionPaper.series,
			markScheme: markScheme.series,
			evidence: {
				questionPaper: questionPaper.seriesEvidence,
				markScheme: markScheme.seriesEvidence
			}
		});
	}
	const expectedComponentKey = normalizeComponent(expectedComponent);
	const visibleComponent = firstNonEmpty([questionPaper.component, markScheme.component]);
	if (
		expectedComponentKey &&
		normalizeComponent(visibleComponent) &&
		!componentCodesCompatible(expectedComponent, visibleComponent)
	) {
		issues.push({
			code: 'visible_component_mismatch',
			severity: 'error',
			expected: expectedComponent,
			visible: visibleComponent,
			evidence: {
				questionPaper: questionPaper.componentEvidence,
				markScheme: markScheme.componentEvidence
			}
		});
	}
	if (
		normalizeComponent(questionPaper.component) &&
		normalizeComponent(markScheme.component) &&
		!componentCodesCompatible(questionPaper.component, markScheme.component)
	) {
		issues.push({
			code: 'question_paper_mark_scheme_component_mismatch',
			severity: 'error',
			questionPaper: questionPaper.component,
			markScheme: markScheme.component,
			evidence: {
				questionPaper: questionPaper.componentEvidence,
				markScheme: markScheme.componentEvidence
			}
		});
	}
	return {
		status: issues.some((issue) => issue.severity === 'error') ? 'failed' : 'passed',
		expected: {
			series: expectedSeries || null,
			componentCode: expectedComponent || null
		},
		visible: {
			series: visibleSeries || null,
			componentCode: visibleComponent || null
		},
		questionPaper,
		markScheme,
		issues
	};
}

function enforceSourceIdentity(check) {
	if (hasArg('allow-visible-source-mismatch')) return;
	const errors = check.issues.filter((issue) => issue.severity === 'error');
	if (errors.length === 0) return;
	throw new Error(
		`Visible PDF source identity preflight failed: ${errors
			.map(
				(issue) =>
					`${issue.code} expected=${issue.expected ?? 'n/a'} visible=${issue.visible ?? 'n/a'}`
			)
			.join('; ')}. Pass --allow-visible-source-mismatch only for an audited exception.`
	);
}

function inspectPdfSource(filePath) {
	const firstPagesText = pdfTextFirstPages(filePath, 2);
	const seriesMatch = findSeries(firstPagesText);
	const componentMatch = findComponent(firstPagesText);
	return {
		path: relative(filePath),
		series: seriesMatch?.series ?? null,
		seriesEvidence: seriesMatch?.evidence ?? null,
		component: componentMatch?.component ?? null,
		componentEvidence: componentMatch?.evidence ?? null
	};
}

function pdfTextFirstPages(filePath, pages) {
	const result = spawnSync('pdftotext', ['-f', '1', '-l', String(pages), filePath, '-'], {
		cwd: rootDir,
		encoding: 'utf8',
		maxBuffer: 4 * 1024 * 1024
	});
	if (result.status !== 0) return '';
	return result.stdout;
}

function findSeries(text) {
	const longMatch = text.match(/\b(January|June|November)\s+(20\d{2})\b/i);
	if (longMatch) {
		return {
			series: `${titleCase(longMatch[1])} ${longMatch[2]}`,
			evidence: trimEvidence(longMatch[0])
		};
	}
	const compactMatch = text.match(/\b(Jan|Jun|Nov)(\d{2})\b/i);
	if (compactMatch) {
		const month = { jan: 'January', jun: 'June', nov: 'November' }[compactMatch[1].toLowerCase()];
		return {
			series: `${month} 20${compactMatch[2]}`,
			evidence: trimEvidence(compactMatch[0])
		};
	}
	return null;
}

function findComponent(text) {
	const match = text.match(/\b(\d{4})\/([0-9A-Z]+(?:\/[A-Z]+)*)\b/i);
	if (!match) return null;
	return {
		component: `${match[1]}/${match[2].toUpperCase()}`,
		evidence: trimEvidence(match[0])
	};
}

function normalizeSeries(value) {
	const match = String(value ?? '').match(
		/\b(january|jan|june|jun|november|nov)\s*(20)?(\d{2})\b/i
	);
	if (!match) return '';
	const monthMap = {
		jan: 'january',
		january: 'january',
		jun: 'june',
		june: 'june',
		nov: 'november',
		november: 'november'
	};
	return `${monthMap[match[1].toLowerCase()]}-20${match[3]}`;
}

function normalizeComponent(value) {
	return String(value ?? '')
		.toUpperCase()
		.replace(/[^0-9A-Z]/g, '');
}

function componentCodesCompatible(expected, visible) {
	const expectedKey = normalizeComponent(expected);
	const visibleKey = normalizeComponent(visible);
	if (!expectedKey || !visibleKey) return true;
	if (expectedKey === visibleKey) return true;
	if (expectedKey.startsWith(visibleKey) && /^[A-Z]+$/.test(expectedKey.slice(visibleKey.length))) {
		return true;
	}
	if (visibleKey.startsWith(expectedKey) && /^[A-Z]+$/.test(visibleKey.slice(expectedKey.length))) {
		return true;
	}
	return false;
}

function firstNonEmpty(values) {
	return values.find((value) => String(value ?? '').trim()) ?? '';
}

function titleCase(value) {
	const lower = String(value ?? '').toLowerCase();
	return lower ? `${lower[0].toUpperCase()}${lower.slice(1)}` : '';
}

function trimEvidence(value) {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 120);
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
