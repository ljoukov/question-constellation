#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
	blockingIssues,
	deterministicCandidateIssues,
	evaluateCandidate,
	readJson,
	repairFullPaperQuestionQuality,
	sanitizeAnswerChainEvidenceIndexes,
	setupLlmEnv,
	writeJson
} from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const dataRoot = path.join(rootDir, 'data/aqa-separate-science-higher');
const manifestPath = path.join(dataRoot, 'manifest.json');
const outputRoot = path.join(rootDir, 'data/vision-extracted/aqa-separate-science-higher');
const evalRoot = path.resolve(rootDir, stringArg('eval-root', 'tmp/aqa-separate-science-evals'));
const summaryPath = path.resolve(
	rootDir,
	stringArg('summary', 'tmp/aqa-separate-science-batch-summary.json')
);

const all = hasArg('all');
const dryRun = hasArg('dry-run');
const force = hasArg('force');
const forceChunks = hasArg('force-chunks');
const continueOnError = hasArg('continue-on-error');
const skipJudge = hasArg('skip-judge');
const rejudge = hasArg('rejudge');
const runImport = hasArg('import');
const importDryRun = hasArg('import-dry-run');
const replaceAllSubject = hasArg('replace-all-subject');
const paperArg = stringArg('paper', '');
const subjectArg = stringArg('subject', 'all').toLowerCase();
const maxPapers = optionalIntegerArg('max-papers');

const chunkPages = integerArg('chunk-pages', 1, 1);
const dpi = integerArg('dpi', 90, 72);
const repairAttempts = integerArg('repair-attempts', 1, 0);
const judgeRepairAttempts = integerArg('judge-repair-attempts', 1, 0);
const llmTimeoutMs = integerArg('llm-timeout-ms', 240000, 1);
const llmMaxAttempts = integerArg('llm-max-attempts', 1, 1);
const judgeBatchSize = integerArg('judge-batch-size', 5, 1);
const minJudgeScore = numberArg('min-judge-score', 0.8);
const mediaResolution = stringArg('media-resolution', 'low');
const thinkingLevel = stringArg('thinking-level', 'low');
const model = stringArg('model', '');
const judgeModel = stringArg('judge-model', '');
const markSchemeImageMode = stringArg('mark-scheme-image-mode', 'none');
const judgeMode = skipJudge ? 'none' : stringArg('judge-mode', 'question-batches');

if (!existsSync(manifestPath)) {
	throw new Error(
		`Missing ${path.relative(rootDir, manifestPath)}. Run pnpm run download:aqa-separate-science first.`
	);
}
if (!all && !paperArg) {
	throw new Error('Pass --all or --paper=<source-document-id-or-component>.');
}
if (!['none', 'all'].includes(markSchemeImageMode)) {
	throw new Error('--mark-scheme-image-mode must be none or all.');
}
if (!['paper', 'question-batches', 'none'].includes(judgeMode)) {
	throw new Error('--judge-mode must be paper, question-batches, or none.');
}

process.env.EXTRACTION_LLM_TIMEOUT_MS = String(llmTimeoutMs);
process.env.EXTRACTION_LLM_MAX_ATTEMPTS = String(llmMaxAttempts);
if (!dryRun && judgeMode === 'question-batches') setupLlmEnv();

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const selected = selectRows(manifest.rows ?? []);
if (selected.length === 0) throw new Error('No AQA Separate Science papers matched the selection.');

const results = [];
mkdirSync(evalRoot, { recursive: true });
mkdirSync(path.dirname(summaryPath), { recursive: true });

writeSummary('running');
for (const row of selected) {
	const paper = paperInfo(row);
	try {
		const result = await processPaper(paper);
		results.push(result);
		writeSummary('running');
	} catch (error) {
		const result = {
			sourceDocumentId: paper.sourceDocumentId,
			subject: paper.subject,
			outputPath: relative(paper.outputPath),
			status: 'failed',
			error: error instanceof Error ? error.message : String(error)
		};
		results.push(result);
		writeSummary('failed');
		if (!continueOnError) {
			console.error(JSON.stringify(result, null, 2));
			process.exit(1);
		}
	}
}

const failed = results.filter((result) => result.status === 'failed');
const finalStatus = failed.length ? 'failed' : 'passed';
writeSummary(finalStatus);
console.log(JSON.stringify(summary(finalStatus), null, 2));
if (failed.length > 0) process.exit(1);

if (runImport && !dryRun) {
	await runImportStep();
}

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
	if (!Number.isInteger(value) || value < 1)
		throw new Error(`--${name} must be a positive integer.`);
	return value;
}

function slugify(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function selectRows(rows) {
	const filtered = rows.filter((row) => {
		const subjectMatches =
			subjectArg === 'all' || String(row.subject_area ?? row.subject).toLowerCase() === subjectArg;
		const paperMatches =
			!paperArg || row.source_document_id === paperArg || row.component === paperArg.toUpperCase();
		return subjectMatches && paperMatches;
	});
	return maxPapers ? filtered.slice(0, maxPapers) : filtered;
}

function paperInfo(row) {
	const subject = row.subject_area ?? row.subject;
	const subjectSlug = slugify(subject);
	return {
		sourceDocumentId: row.source_document_id,
		markSchemeDocumentId: row.mark_scheme_document_id,
		component: row.component,
		subject,
		outputPath: path.join(outputRoot, subjectSlug, `${row.source_document_id}.json`),
		evalPath: path.join(evalRoot, `${row.source_document_id}.eval.json`)
	};
}

async function processPaper(paper) {
	if (existsSync(paper.outputPath) && !force) {
		let validation = validateExtractionOutput(paper.outputPath);
		let evalResult = existsSync(paper.evalPath) ? readJson(paper.evalPath) : null;
		if (judgeMode === 'question-batches' && (!evalResult || rejudge)) {
			evalResult = await evaluateAndRepairQuestionBatches(paper);
			validation = validateExtractionOutput(paper.outputPath);
		}
		return {
			sourceDocumentId: paper.sourceDocumentId,
			subject: paper.subject,
			outputPath: relative(paper.outputPath),
			evalPath: existsSync(paper.evalPath) ? relative(paper.evalPath) : null,
			status:
				validation.blockingIssues.length ||
				(judgeMode !== 'none' && evalResult?.status !== 'passed')
					? 'failed'
					: 'skipped',
			questions: validation.questions,
			blockingIssues: validation.blockingIssues,
			judgeMode,
			judgeStatus: evalResult?.status ?? null
		};
	}

	const args = [
		'scripts/extract-paper-llm.mjs',
		'--preset=aqa-separate-science',
		`--paper=${paper.sourceDocumentId}`,
		`--chunk-pages=${chunkPages}`,
		`--dpi=${dpi}`,
		`--media-resolution=${mediaResolution}`,
		`--thinking-level=${thinkingLevel}`,
		`--repair-attempts=${repairAttempts}`,
		`--mark-scheme-image-mode=${markSchemeImageMode}`,
		`--output=${paper.outputPath}`,
		`--write-eval=${paper.evalPath}`
	];
	if (model) args.push(`--model=${model}`);
	if (judgeModel) args.push(`--judge-model=${judgeModel}`);
	if (judgeMode !== 'paper') args.push('--skip-judge');
	if (force) args.push('--force');
	if (forceChunks) args.push('--force-chunks');

	if (dryRun) {
		return {
			sourceDocumentId: paper.sourceDocumentId,
			subject: paper.subject,
			outputPath: relative(paper.outputPath),
			evalPath: relative(paper.evalPath),
			status: 'dry-run',
			command: [process.execPath, ...args]
		};
	}

	console.error(`[batch] extracting ${paper.sourceDocumentId} -> ${relative(paper.outputPath)}`);
	await runCommand(process.execPath, args, {
		EXTRACTION_LLM_TIMEOUT_MS: String(llmTimeoutMs),
		EXTRACTION_LLM_MAX_ATTEMPTS: String(llmMaxAttempts)
	});

	let validation = validateExtractionOutput(paper.outputPath);
	let evalResult = existsSync(paper.evalPath) ? readJson(paper.evalPath) : null;
	if (judgeMode === 'question-batches') {
		evalResult = await evaluateAndRepairQuestionBatches(paper);
		validation = validateExtractionOutput(paper.outputPath);
	}
	if (validation.blockingIssues.length > 0) {
		throw new Error(
			`Extraction failed deterministic gates: ${validation.blockingIssues
				.slice(0, 5)
				.map((issue) => `${issue.sourceQuestionRef}: ${issue.code}`)
				.join(', ')}`
		);
	}
	if (judgeMode !== 'none' && evalResult?.status !== 'passed') {
		throw new Error(`Extraction judge status was ${evalResult?.status ?? 'missing'}.`);
	}
	return {
		sourceDocumentId: paper.sourceDocumentId,
		subject: paper.subject,
		outputPath: relative(paper.outputPath),
		evalPath: relative(paper.evalPath),
		status: 'extracted',
		questions: validation.questions,
		judgeMode,
		judgeScore: evalResult?.judge?.score ?? null
	};
}

async function evaluateQuestionBatches(candidate, evalPath) {
	const batches = [];
	const questions = candidate.questions ?? [];
	for (let index = 0; index < questions.length; index += judgeBatchSize) {
		const batchQuestions = questions.slice(index, index + judgeBatchSize);
		const batchCandidate = { ...candidate, questions: batchQuestions };
		console.error(
			`[batch] judging ${candidate.sourceDocument?.id ?? candidate.sourceDocumentId} questions ${index + 1}-${index + batchQuestions.length}`
		);
		const evaluation = await evaluateCandidate({
			candidate: batchCandidate,
			judgeModel: judgeModel || model || undefined,
			thinkingLevel,
			minJudgeScore,
			runJudge: true
		});
		batches.push({
			index: batches.length + 1,
			sourceQuestionRefs: batchQuestions.map((question) => question.sourceQuestionRef),
			status: evaluation.status,
			deterministicBlockingIssues: evaluation.deterministicBlockingIssues,
			mechanicalErrors: evaluation.mechanicalErrors,
			judge: evaluation.judge
				? {
						verdict: evaluation.judge.verdict,
						score: evaluation.judge.score,
						rationale: evaluation.judge.rationale,
						requiredRepairs: evaluation.judge.requiredRepairs
					}
				: null
		});
	}
	const failed = batches.filter((batch) => batch.status !== 'passed');
	const result = {
		status: failed.length ? 'failed' : 'passed',
		judgeMode: 'question-batches',
		judgeBatchSize,
		minJudgeScore,
		questionCount: questions.length,
		batches
	};
	writeJson(evalPath, result);
	return result;
}

async function evaluateAndRepairQuestionBatches(paper) {
	let candidate = readSanitizedExtractionOutput(paper.outputPath);
	let evaluation = await evaluateQuestionBatches(candidate, paper.evalPath);
	for (
		let attempt = 0;
		evaluation.status !== 'passed' && attempt < judgeRepairAttempts;
		attempt += 1
	) {
		const failedBatches = evaluation.batches.filter((batch) => batch.status !== 'passed');
		const failedRefs = repairRefsFromFailedBatches(failedBatches);
		const aggregateJudge = {
			verdict: 'fail',
			score: Math.min(...failedBatches.map((batch) => batch.judge?.score ?? 0)),
			rationale: failedBatches
				.map((batch) => {
					const repairs = actionableRepairLines(batch);
					const deterministic = (batch.deterministicBlockingIssues ?? [])
						.map((issue) => `${issue.sourceQuestionRef}: ${issue.code}`)
						.join(', ');
					return [
						`Questions ${batch.sourceQuestionRefs.join(', ')} failed.`,
						deterministic ? `Deterministic: ${deterministic}.` : '',
						repairs.length ? `Required repairs: ${repairs.join(' | ')}` : ''
					]
						.filter(Boolean)
						.join(' ');
				})
				.join('\n\n'),
			requiredRepairs: failedBatches.flatMap((batch) => actionableRepairLines(batch))
		};
		console.error(
			`[batch] repairing ${paper.sourceDocumentId} from batched judge feedback, attempt ${attempt + 1}`
		);
		candidate = await repairFullPaperQuestionQuality({
			model: model || undefined,
			thinkingLevel,
			candidate,
			deterministicIssues: deterministicCandidateIssues(candidate),
			judge: aggregateJudge,
			sourceQuestionRefs: failedRefs
		});
		writeJson(paper.outputPath, candidate);
		const blocking = blockingIssues(deterministicCandidateIssues(candidate));
		if (blocking.length > 0) {
			if (attempt + 1 < judgeRepairAttempts) {
				evaluation = deterministicRepairEvaluation(blocking);
				continue;
			}
			writeJson(paper.evalPath, {
				status: 'failed',
				judgeMode: 'question-batches',
				repairAttempt: attempt + 1,
				deterministicBlockingIssues: blocking
			});
			return readJson(paper.evalPath);
		}
		evaluation = await evaluateQuestionBatches(candidate, paper.evalPath);
	}
	return evaluation;
}

function deterministicRepairEvaluation(blocking) {
	return {
		status: 'failed',
		judgeMode: 'question-batches',
		judgeBatchSize,
		minJudgeScore,
		questionCount: null,
		batches: [
			{
				index: 1,
				sourceQuestionRefs: [...new Set(blocking.map((issue) => issue.sourceQuestionRef))],
				status: 'failed',
				deterministicBlockingIssues: blocking.map((issue) => ({
					code: issue.code,
					field: issue.field,
					evidence: issue.evidence,
					sourceQuestionRef: issue.sourceQuestionRef
				})),
				mechanicalErrors: [],
				judge: {
					verdict: 'fail',
					score: 0,
					rationale: 'Post-repair deterministic gate still found blocking chain evidence issues.',
					requiredRepairs: blocking.map(
						(issue) =>
							`${issue.sourceQuestionRef}: ${issue.message} Field ${issue.field}. Evidence: ${issue.evidence}`
					)
				}
			}
		]
	};
}

function validateExtractionOutput(filePath) {
	if (!existsSync(filePath)) throw new Error(`Missing extraction output ${relative(filePath)}.`);
	const candidate = readSanitizedExtractionOutput(filePath);
	return {
		questions: candidate.questions?.length ?? 0,
		blockingIssues: blockingIssues(deterministicCandidateIssues(candidate))
	};
}

function readSanitizedExtractionOutput(filePath) {
	const candidate = readJson(filePath);
	const sanitized = sanitizeAnswerChainEvidenceIndexes(candidate);
	if (sanitized !== candidate) writeJson(filePath, sanitized);
	return sanitized;
}

function repairRefsFromFailedBatches(failedBatches) {
	const refs = new Set();
	for (const batch of failedBatches) {
		for (const issue of batch.deterministicBlockingIssues ?? []) {
			if (issue.sourceQuestionRef) refs.add(issue.sourceQuestionRef);
		}
		const feedbackText = actionableRepairLines(batch).join('\n');
		for (const match of feedbackText.matchAll(/\bQ?(\d{2}\.\d+)\b/g)) refs.add(match[1]);
	}
	if (refs.size > 0) return [...refs];
	return [...new Set(failedBatches.flatMap((batch) => batch.sourceQuestionRefs ?? []))];
}

function actionableRepairLines(batch) {
	return (batch.judge?.requiredRepairs ?? []).filter((repair) => {
		const normalizedRepair = repair.replace(
			/^\s*(?:for\s+)?(?:Q?\d{2}\.\d+\s*(?:,|and)?\s*)+[:,]?\s*/i,
			''
		);
		return (
			!/^\s*(optionally|optional|consider|retain|keep)\b/i.test(normalizedRepair) &&
			!/\bnot a pass blocker\b/i.test(repair)
		);
	});
}

async function runImportStep() {
	if (all && !paperArg) {
		const args = [
			'scripts/import-physics-vision.mjs',
			`--input-root=${relative(outputRoot)}`,
			'--recursive',
			'--all'
		];
		if (importDryRun) args.push('--dry-run');
		if (replaceAllSubject) args.push('--replace-all-subject');
		console.error(`[batch] importing all extracted papers`);
		await runCommand(process.execPath, args);
		return;
	}

	for (const row of selected) {
		const args = [
			'scripts/import-physics-vision.mjs',
			`--input-root=${relative(outputRoot)}`,
			'--recursive',
			`--paper=${row.source_document_id}`
		];
		if (importDryRun) args.push('--dry-run');
		if (replaceAllSubject) args.push('--replace-all-subject');
		console.error(`[batch] importing ${row.source_document_id}`);
		await runCommand(process.execPath, args);
	}
}

function runCommand(command, args, extraEnv = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: rootDir,
			env: { ...process.env, ...extraEnv },
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

function summary(status) {
	return {
		status,
		selected: selected.length,
		extracted: results.filter((result) => result.status === 'extracted').length,
		skipped: results.filter((result) => result.status === 'skipped').length,
		failed: results.filter((result) => result.status === 'failed').length,
		dryRun: results.filter((result) => result.status === 'dry-run').length,
		judgeMode,
		judgeRepairAttempts,
		outputRoot: relative(outputRoot),
		evalRoot: relative(evalRoot),
		results
	};
}

function writeSummary(status) {
	writeJson(summaryPath, summary(status));
}
