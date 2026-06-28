#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
	blockingIssues,
	deterministicCandidateIssues,
	evaluateCandidate,
	judgeQuestionSolvability,
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
const solvabilityEvalRoot = path.resolve(
	rootDir,
	stringArg('solvability-eval-root', 'tmp/aqa-separate-science-solvability-evals')
);
const importReadyOutputRoot = path.resolve(
	rootDir,
	stringArg('import-ready-output-root', 'tmp/import-ready-extracted/aqa-separate-science-higher')
);
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
const skipSolvabilityJudge = hasArg('skip-solvability-judge');
const rejudge = hasArg('rejudge');
const runImport = hasArg('import');
const importDryRun = hasArg('import-dry-run');
const importRawOutput = hasArg('import-raw-output');
const replaceAllSubject = hasArg('replace-all-subject');
const paperArg = stringArg('paper', '');
const subjectArg = stringArg('subject', 'all').toLowerCase();
const maxPapers = optionalIntegerArg('max-papers');
const concurrency = integerArg('concurrency', 1, 1);
const paperAttempts = integerArg('paper-attempts', 2, 1);

const chunkPages = integerArg('chunk-pages', 1, 1);
const dpi = integerArg('dpi', 90, 72);
const repairAttempts = integerArg('repair-attempts', 1, 0);
const repairBatchSize = integerArg('repair-batch-size', 1, 1);
const judgeRepairAttempts = integerArg('judge-repair-attempts', 1, 0);
const llmTimeoutMs = integerArg('llm-timeout-ms', 600000, 1);
const llmMaxAttempts = integerArg('llm-max-attempts', 3, 1);
const judgeBatchSize = integerArg('judge-batch-size', 1, 1);
const minJudgeScore = numberArg('min-judge-score', 0.8);
const minSolvabilityScore = numberArg('min-solvability-score', 0.8);
const mediaResolution = stringArg('media-resolution', 'low');
const thinkingLevel = stringArg('thinking-level', 'xhigh');
const model = stringArg('model', '');
const judgeModel = stringArg('judge-model', '');
const markSchemeImageMode = stringArg('mark-scheme-image-mode', 'none');
const judgeMode = skipJudge ? 'none' : stringArg('judge-mode', 'question-batches');
const solvabilityMode = skipSolvabilityJudge
	? 'none'
	: stringArg('solvability-mode', 'question-batches');

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
if (!['question-batches', 'none'].includes(solvabilityMode)) {
	throw new Error('--solvability-mode must be question-batches or none.');
}

process.env.EXTRACTION_LLM_TIMEOUT_MS = String(llmTimeoutMs);
process.env.EXTRACTION_LLM_MAX_ATTEMPTS = String(llmMaxAttempts);
if (!dryRun && (judgeMode === 'question-batches' || solvabilityMode === 'question-batches')) {
	setupLlmEnv();
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const selected = selectRows(manifest.rows ?? []);
if (selected.length === 0) throw new Error('No AQA Separate Science papers matched the selection.');

const results = [];
mkdirSync(evalRoot, { recursive: true });
mkdirSync(solvabilityEvalRoot, { recursive: true });
mkdirSync(path.dirname(summaryPath), { recursive: true });

writeSummary('running');
await processSelectedPapers();

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

async function processSelectedPapers() {
	let nextIndex = 0;
	let stopRequested = false;
	const workerCount = Math.min(concurrency, selected.length);
	async function worker() {
		while (!stopRequested) {
			const row = selected[nextIndex];
			nextIndex += 1;
			if (!row) return;
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
				if (!continueOnError) stopRequested = true;
			}
		}
	}
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
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
		evalPath: path.join(evalRoot, `${row.source_document_id}.eval.json`),
		solvabilityEvalPath: path.join(
			solvabilityEvalRoot,
			`${row.source_document_id}.solvability.eval.json`
		)
	};
}

async function processPaper(paper) {
	const args = extractionCommandArgs(paper);
	if (dryRun) {
		return {
			sourceDocumentId: paper.sourceDocumentId,
			subject: paper.subject,
			outputPath: relative(paper.outputPath),
			evalPath: relative(paper.evalPath),
			solvabilityEvalPath: relative(paper.solvabilityEvalPath),
			status: 'dry-run',
			existingOutput: existsSync(paper.outputPath),
			command: [process.execPath, ...args]
		};
	}

	if (existsSync(paper.outputPath) && !force) {
		let validation = validateExtractionOutput(paper.outputPath);
		let evalResult = existsSync(paper.evalPath) ? readJson(paper.evalPath) : null;
		let solvabilityResult = existsSync(paper.solvabilityEvalPath)
			? readJson(paper.solvabilityEvalPath)
			: null;
		if (
			judgeMode === 'question-batches' &&
			(!evalResult || rejudge || validation.blockingIssues.length > 0)
		) {
			evalResult = await evaluateAndRepairQuestionBatches(paper);
			validation = validateExtractionOutput(paper.outputPath);
		}
		if (solvabilityMode === 'question-batches' && (!solvabilityResult || rejudge)) {
			solvabilityResult = await evaluateSolvabilityForPaper(paper);
		}
		return {
			sourceDocumentId: paper.sourceDocumentId,
			subject: paper.subject,
			outputPath: relative(paper.outputPath),
			evalPath: existsSync(paper.evalPath) ? relative(paper.evalPath) : null,
			solvabilityEvalPath: existsSync(paper.solvabilityEvalPath)
				? relative(paper.solvabilityEvalPath)
				: null,
			status:
				validation.blockingIssues.length ||
				(judgeMode !== 'none' && evalResult?.status !== 'passed') ||
				(solvabilityMode !== 'none' && solvabilityResult?.status !== 'passed')
					? 'failed'
					: 'skipped',
			questions: validation.questions,
			blockingIssues: validation.blockingIssues,
			judgeMode,
			judgeStatus: evalResult?.status ?? null,
			solvabilityMode,
			solvabilityStatus: solvabilityResult?.status ?? null
		};
	}
	console.error(`[batch] extracting ${paper.sourceDocumentId} -> ${relative(paper.outputPath)}`);
	await runExtractionCommandWithRetry(args, {
		EXTRACTION_LLM_TIMEOUT_MS: String(llmTimeoutMs),
		EXTRACTION_LLM_MAX_ATTEMPTS: String(llmMaxAttempts)
	});

	let validation = validateExtractionOutput(paper.outputPath);
	let evalResult = existsSync(paper.evalPath) ? readJson(paper.evalPath) : null;
	if (judgeMode === 'question-batches') {
		evalResult = await evaluateAndRepairQuestionBatches(paper);
		validation = validateExtractionOutput(paper.outputPath);
	}
	const solvabilityResult =
		solvabilityMode === 'question-batches' ? await evaluateSolvabilityForPaper(paper) : null;
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
	if (solvabilityMode !== 'none' && solvabilityResult?.status !== 'passed') {
		throw new Error(`Solvability judge status was ${solvabilityResult?.status ?? 'missing'}.`);
	}
	return {
		sourceDocumentId: paper.sourceDocumentId,
		subject: paper.subject,
		outputPath: relative(paper.outputPath),
		evalPath: relative(paper.evalPath),
		solvabilityEvalPath: solvabilityMode === 'none' ? null : relative(paper.solvabilityEvalPath),
		status: 'extracted',
		questions: validation.questions,
		judgeMode,
		judgeScore: evalResult?.judge?.score ?? null,
		solvabilityMode,
		solvabilityStatus: solvabilityResult?.status ?? null
	};
}

function extractionCommandArgs(paper) {
	const args = [
		'scripts/extract-paper-llm.mjs',
		'--preset=aqa-separate-science',
		`--paper=${paper.sourceDocumentId}`,
		`--chunk-pages=${chunkPages}`,
		`--dpi=${dpi}`,
		`--media-resolution=${mediaResolution}`,
		`--thinking-level=${thinkingLevel}`,
		`--repair-attempts=${repairAttempts}`,
		`--repair-batch-size=${repairBatchSize}`,
		`--mark-scheme-image-mode=${markSchemeImageMode}`,
		`--output=${paper.outputPath}`,
		`--write-eval=${paper.evalPath}`
	];
	if (model) args.push(`--model=${model}`);
	if (judgeModel) args.push(`--judge-model=${judgeModel}`);
	if (judgeMode !== 'paper') args.push('--skip-judge');
	if (force) args.push('--force');
	if (forceChunks) args.push('--force-chunks');
	return args;
}

async function runExtractionCommandWithRetry(args, extraEnv) {
	let lastError = null;
	for (let attempt = 1; attempt <= paperAttempts; attempt += 1) {
		const attemptArgs = attempt === 1 ? args : args.filter((arg) => arg !== '--force-chunks');
		try {
			if (attempt > 1) {
				console.error(
					`[batch] retrying extraction attempt ${attempt}/${paperAttempts} using existing target caches`
				);
			}
			await runCommand(process.execPath, attemptArgs, extraEnv);
			return;
		} catch (error) {
			lastError = error;
			if (attempt < paperAttempts) continue;
			break;
		}
	}
	throw lastError ?? new Error('Extraction command failed.');
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
		writeJson(evalPath, {
			status: 'running',
			judgeMode: 'question-batches',
			judgeBatchSize,
			minJudgeScore,
			questionCount: questions.length,
			completedBatches: batches.length,
			batches
		});
	}
	const failed = batches.filter((batch) => batch.status !== 'passed');
	const result = {
		status: failed.length ? 'failed' : 'passed',
		judgeMode: 'question-batches',
		judgeBatchSize,
		minJudgeScore,
		questionCount: questions.length,
		completedBatches: batches.length,
		batches
	};
	writeJson(evalPath, result);
	return result;
}

async function evaluateAndRepairQuestionBatches(paper) {
	let candidate = readSanitizedExtractionOutput(paper.outputPath);
	candidate = await repairPreJudgeValidationIssues(paper, candidate);
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
		for (const refs of chunksOf(failedRefs, repairBatchSize)) {
			candidate = await repairFullPaperQuestionQuality({
				model: model || undefined,
				thinkingLevel,
				candidate,
				deterministicIssues: deterministicCandidateIssues(candidate),
				judge: {
					...aggregateJudge,
					requiredRepairs: aggregateJudge.requiredRepairs.filter((line) =>
						refs.some((ref) => line.includes(ref))
					)
				},
				sourceQuestionRefs: refs
			});
		}
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

async function repairPreJudgeValidationIssues(paper, initialCandidate) {
	let candidate = initialCandidate;
	for (let attempt = 0; attempt < judgeRepairAttempts; attempt += 1) {
		const validation = validateCandidate(candidate);
		if (validation.blockingIssues.length === 0) return candidate;
		const refs = [...new Set(validation.blockingIssues.map((issue) => issue.sourceQuestionRef))].filter(
			Boolean
		);
		if (refs.length === 0) return candidate;
		const aggregateJudge = {
			verdict: 'fail',
			score: 0,
			rationale:
				'Pre-judge validation found deterministic blockers or unresolved needsHumanReview flags. Repair concrete extraction fields, or keep concise blocking review notes when the issue requires source media/context/manual review.',
			requiredRepairs: validation.blockingIssues.map(
				(issue) =>
					`${issue.sourceQuestionRef}: ${issue.message} Field ${issue.field}. Evidence: ${issue.evidence}`
			)
		};
		console.error(
			`[batch] repairing ${paper.sourceDocumentId} from pre-judge validation, attempt ${attempt + 1}`
		);
		for (const refsChunk of chunksOf(refs, repairBatchSize)) {
			candidate = await repairFullPaperQuestionQuality({
				model: model || undefined,
				thinkingLevel,
				candidate,
				deterministicIssues: validationFindingsForRefs(validation, refsChunk),
				judge: {
					...aggregateJudge,
					requiredRepairs: aggregateJudge.requiredRepairs.filter((line) =>
						refsChunk.some((ref) => line.includes(ref))
					)
				},
				sourceQuestionRefs: refsChunk
			});
		}
		writeJson(paper.outputPath, candidate);
	}
	return candidate;
}

async function evaluateSolvabilityForPaper(paper) {
	const candidate = readSanitizedExtractionOutput(paper.outputPath);
	const results = [];
	const questions = candidate.questions ?? [];
	for (const question of questions) {
		console.error(
			`[batch] solvability judging ${paper.sourceDocumentId} ${question.sourceQuestionRef}`
		);
		const evaluation = await judgeQuestionSolvability({
			candidate,
			sourceQuestionRef: question.sourceQuestionRef,
			model: judgeModel || model || undefined,
			thinkingLevel,
			minJudgeScore: minSolvabilityScore
		});
		results.push({
			sourceQuestionRef: question.sourceQuestionRef,
			status: evaluation.status,
			includedSourceQuestionRefs: evaluation.includedSourceQuestionRefs,
			media: evaluation.media,
			judge: {
				verdict: evaluation.judge.verdict,
				score: evaluation.judge.score,
				studentVisibleSolvable: evaluation.judge.studentVisibleSolvable,
				markSchemeAlignment: evaluation.judge.markSchemeAlignment,
				rationale: evaluation.judge.rationale,
				missingContext: evaluation.judge.missingContext,
				mediaFindings: evaluation.judge.mediaFindings,
				renderFindings: evaluation.judge.renderFindings,
				requiredRepairs: evaluation.judge.requiredRepairs
			}
		});
		writeJson(paper.solvabilityEvalPath, {
			status: 'running',
			judgeMode: 'solvability-question-batches',
			minSolvabilityScore,
			questionCount: questions.length,
			completedQuestions: results.length,
			results
		});
	}
	const failed = results.filter((result) => result.status !== 'passed');
	const output = {
		status: failed.length ? 'failed' : 'passed',
		judgeMode: 'solvability-question-batches',
		minSolvabilityScore,
		questionCount: questions.length,
		completedQuestions: results.length,
		results
	};
	writeJson(paper.solvabilityEvalPath, output);
	return output;
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
	return validateCandidate(candidate);
}

function validateCandidate(candidate) {
	const deterministicFindings = deterministicCandidateIssues(candidate);
	const deterministicBlockingIssues = blockingIssues(deterministicFindings);
	const reviewFindings = humanReviewFindings(candidate);
	const humanReviewIssues = reviewFindings.flatMap((finding) =>
		finding.issues.map((issue) => ({ ...issue, sourceQuestionRef: finding.sourceQuestionRef }))
	);
	return {
		questions: candidate.questions?.length ?? 0,
		deterministicFindings,
		reviewFindings,
		deterministicBlockingIssues,
		humanReviewIssues,
		blockingIssues: [...deterministicBlockingIssues, ...humanReviewIssues]
	};
}

function validationFindingsForRefs(validation, refs) {
	const allowed = new Set(refs);
	return [...(validation.deterministicFindings ?? []), ...(validation.reviewFindings ?? [])].filter(
		(finding) => allowed.has(finding.sourceQuestionRef)
	);
}

function humanReviewFindings(candidate) {
	const findings = [];
	for (const question of candidate.questions ?? []) {
		const issues = humanReviewIssuesForQuestion(question);
		if (!issues.length) continue;
		findings.push({
			sourceQuestionRef: question.sourceQuestionRef,
			chainId: question.answerChain?.id ?? null,
			issues
		});
	}
	return findings;
}

function humanReviewIssuesForQuestion(question) {
	const issues = [];
	if (question.needsHumanReview) {
		issues.push(reviewIssue('question_needs_human_review', 'questions.needsHumanReview', question));
	}
	if (question.answerChain?.needsHumanReview) {
		issues.push(
			reviewIssue('chain_needs_human_review', 'answerChain.needsHumanReview', question.answerChain)
		);
	}
	if (question.modelAnswer?.needsHumanReview) {
		issues.push(
			reviewIssue('model_answer_needs_human_review', 'modelAnswer.needsHumanReview', question.modelAnswer)
		);
	}
	for (const [index, asset] of (question.assets ?? []).entries()) {
		if (!asset?.needsHumanReview) continue;
		issues.push(reviewIssue('asset_needs_human_review', `assets[${index}].needsHumanReview`, asset));
	}
	for (const [index, item] of (question.markChecklist ?? []).entries()) {
		if (!item?.needsHumanReview) continue;
		issues.push(
			reviewIssue('mark_checklist_needs_human_review', `markChecklist[${index}].needsHumanReview`, item)
		);
	}
	return issues;
}

function reviewIssue(code, field, value) {
	return {
		severity: 'error',
		code,
		field,
		evidence: reviewIssueEvidence(value),
		message:
			'Extraction output still has needsHumanReview=true. The batch harness must repair concrete fields or keep the row blocked from raw import.'
	};
}

function reviewIssueEvidence(value) {
	const notes = value?.reviewNotes ?? value?.reviewFlags ?? [];
	if (Array.isArray(notes) && notes.length > 0) return notes.join('; ').slice(0, 500);
	for (const key of ['sourceLabel', 'label', 'answerText', 'title', 'text']) {
		if (typeof value?.[key] === 'string' && value[key].trim()) return value[key].trim().slice(0, 500);
	}
	return 'needsHumanReview=true';
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

function chunksOf(values, size) {
	const chunks = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
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
	if (!importRawOutput) {
		if (replaceAllSubject) {
			throw new Error(
				'--replace-all-subject is not supported by the safe import-ready subset path. ' +
					'Use the default per-paper import, or pass --import-raw-output only after a complete strict audit.'
			);
		}
		for (const row of selected) {
			const paper = paperInfo(row);
			const perPaperOutputRoot = path.join(importReadyOutputRoot, row.source_document_id);
			const args = [
				'scripts/prepare-import-ready-extraction.mjs',
				`--input=${paper.outputPath}`,
				`--output-root=${perPaperOutputRoot}`,
				`--audit-output=${path.join(perPaperOutputRoot, 'audit.json')}`,
				`--paper=${row.source_document_id}`
			];
			if (!importDryRun) args.push('--import');
			console.error(`[batch] preparing import-ready subset for ${row.source_document_id}`);
			await runCommand(process.execPath, args);
		}
		return;
	}

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
		concurrency,
		judgeMode,
		solvabilityMode,
		judgeRepairAttempts,
		paperAttempts,
		outputRoot: relative(outputRoot),
		importRawOutput,
		importReadyOutputRoot: relative(importReadyOutputRoot),
		evalRoot: relative(evalRoot),
		solvabilityEvalRoot: relative(solvabilityEvalRoot),
		results
	};
}

function writeSummary(status) {
	writeJson(summaryPath, summary(status));
}
