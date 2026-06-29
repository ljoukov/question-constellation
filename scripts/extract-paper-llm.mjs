#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
	blockingIssues,
	DEFAULT_EXTRACTION_MODEL,
	DEFAULT_THINKING_LEVEL,
	deterministicCandidateIssues,
	evaluateCandidate,
	evaluateCandidateQuestionBatches,
	extractFullPaperFromPdfSet,
	parsePageSelection,
	readJson,
	repairFullPaperAnswerChains,
	repairFullPaperQuestionQuality,
	renderPdfPages,
	setupLlmEnv,
	writeJson
} from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/extract-paper-llm.mjs \\
  --question-paper=<question-paper.pdf> \\
  --mark-scheme=<mark-scheme.pdf> \\
  --source-document-id=<stable-source-id> \\
  --output=<candidate.json>

Preset:
node scripts/extract-paper-llm.mjs --preset=aqa-physics --paper=<source-id-or-component>
node scripts/extract-paper-llm.mjs --preset=aqa-physics --all
node scripts/extract-paper-llm.mjs --preset=aqa-separate-science --subject=<biology|chemistry|physics|all> --paper=<source-id-or-component>
node scripts/extract-paper-llm.mjs --preset=aqa-separate-science --all

Optional:
  --question-pages=1-3
  --mark-scheme-pages=4-5
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
  --existing-chains=<json-or-md>
  --chunk-pages=6
  --context-pages=2
  --chunk-strategy=parent-question|fixed-pages|whole-paper
  --chunk-concurrency=1
  --extraction-strategy=chunk|agentic
  --agent-max-steps=8
  --extraction-granularity=chunk|question
  --allow-question-granularity
  --expected-question-count=1
  --repair-attempts=1
  --repair-answer-chains
  --evaluation-mode=extraction|full
  --judge-mode=paper|question-batches
  --judge-batch-size=8
  --judge-concurrency=2
  --judge-fixture=<golden-fixture.json>
  --skip-judge
  --dry-run
  --force
  --force-chunks
  --force-render
  --mark-scheme-image-mode=none|all
  --media-resolution=auto|low|medium|high|original
  --write-eval=<evaluation.json>
  --run-id=<llm-log-run-id>
  --model=chatgpt-gpt-5.5
  --judge-model=chatgpt-gpt-5.5
  --thinking-level=xhigh
  --judge-thinking-level=xhigh
  --repair-batch-size=1
  --repair-llm-timeout-ms=180000
  --repair-llm-max-attempts=1
  --llm-timeout-ms=600000
  --llm-max-attempts=3
  --llm-max-calls=12`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

setupLlmEnv();

const preset = stringArg('preset', '');
const runId = stringArg('run-id', process.env.EXTRACTION_RUN_ID ?? '');
if (runId) process.env.EXTRACTION_RUN_ID = runId;
const model = stringArg('model', process.env.EXTRACTION_PIPELINE_MODEL ?? DEFAULT_EXTRACTION_MODEL);
const judgeModel = stringArg('judge-model', process.env.EXTRACTION_PIPELINE_JUDGE_MODEL ?? model);
const thinkingLevel = stringArg(
	'thinking-level',
	process.env.EXTRACTION_PIPELINE_THINKING_LEVEL ?? DEFAULT_THINKING_LEVEL
);
const judgeThinkingLevel = stringArg(
	'judge-thinking-level',
	process.env.EXTRACTION_PIPELINE_JUDGE_THINKING_LEVEL ?? thinkingLevel
);
const dpi = integerArg('dpi', 160, 90);
const chunkPages = integerArg('chunk-pages', 6, 1);
const contextPages = integerArg('context-pages', 2, 0);
const chunkStrategy = stringArg('chunk-strategy', 'parent-question');
if (!['parent-question', 'fixed-pages', 'whole-paper'].includes(chunkStrategy)) {
	throw new Error('--chunk-strategy must be parent-question, fixed-pages, or whole-paper.');
}
const chunkConcurrency = integerArg('chunk-concurrency', 1, 1);
const extractionStrategy = stringArg('extraction-strategy', 'chunk');
if (!['chunk', 'agentic'].includes(extractionStrategy)) {
	throw new Error('--extraction-strategy must be chunk or agentic.');
}
const agentMaxSteps = integerArg('agent-max-steps', 8, 1);
const extractionGranularity = stringArg('extraction-granularity', 'chunk');
if (!['chunk', 'question'].includes(extractionGranularity)) {
	throw new Error('--extraction-granularity must be chunk or question.');
}
const allowQuestionGranularity = hasArg('allow-question-granularity');
if (extractionGranularity === 'question' && !allowQuestionGranularity) {
	throw new Error(
		'--extraction-granularity=question runs one LLM extraction call per detected sourceQuestionRef. ' +
			'Use the default chunk mode for production, or pass --allow-question-granularity for a focused diagnostic run.'
	);
}
const forceRender = hasArg('force-render') || hasArg('force');
const forceOutput = hasArg('force');
const forceChunkCache = hasArg('force-chunks');
const dryRun = hasArg('dry-run');
const markSchemeImageMode = stringArg('mark-scheme-image-mode', 'none');
if (!['none', 'all'].includes(markSchemeImageMode)) {
	throw new Error('--mark-scheme-image-mode must be none or all.');
}
const mediaResolution = stringArg('media-resolution', 'auto');
if (!['auto', 'low', 'medium', 'high', 'original'].includes(mediaResolution)) {
	throw new Error('--media-resolution must be auto, low, medium, high, or original.');
}
const questionPages = parsePageSelection(stringArg('question-pages', ''));
const markSchemePages = parsePageSelection(stringArg('mark-scheme-pages', ''));
const expectedQuestionCount = optionalIntegerArg('expected-question-count');
const repairAttempts = integerArg('repair-attempts', 0, 0);
const repairBatchSize = integerArg('repair-batch-size', 1, 1);
const repairAnswerChains = hasArg('repair-answer-chains');
const evaluationMode = stringArg('evaluation-mode', 'extraction');
if (!['extraction', 'full'].includes(evaluationMode)) {
	throw new Error('--evaluation-mode must be extraction or full.');
}
const judgeMode = stringArg('judge-mode', 'paper');
if (!['paper', 'question-batches'].includes(judgeMode)) {
	throw new Error('--judge-mode must be paper or question-batches.');
}
const judgeBatchSize = integerArg('judge-batch-size', 8, 1);
const judgeConcurrency = integerArg('judge-concurrency', 2, 1);
const llmTimeoutMs = optionalIntegerArg('llm-timeout-ms');
const llmMaxAttempts = optionalIntegerArg('llm-max-attempts');
const llmMaxCalls = optionalIntegerArg('llm-max-calls');
const repairLlmTimeoutMs = optionalIntegerArg('repair-llm-timeout-ms');
const repairLlmMaxAttempts = optionalIntegerArg('repair-llm-max-attempts');
const judgeFixturePath = stringArg('judge-fixture', '');
const writeEvalPath = stringArg('write-eval', '');
const extraInstructionsPath = stringArg('instructions', '');
const runJudge = !hasArg('skip-judge');
const supportingDocumentPaths = repeatedStringArg('supporting-document');
const existingChainsPath = stringArg('existing-chains', '');
const extractionSpec = readFileSync(path.join(rootDir, 'docs/extraction-spec.md'), 'utf8');
const extraInstructions = extraInstructionsPath ? readFileSync(extraInstructionsPath, 'utf8') : '';
const explicitExistingChainsText = existingChainsPath
	? readExistingChainsText(existingChainsPath)
	: '';

if (llmTimeoutMs) process.env.EXTRACTION_LLM_TIMEOUT_MS = String(llmTimeoutMs);
if (llmMaxAttempts) process.env.EXTRACTION_LLM_MAX_ATTEMPTS = String(llmMaxAttempts);
if (llmMaxCalls) process.env.EXTRACTION_LLM_MAX_CALLS = String(llmMaxCalls);

if (preset) {
	await runPreset(preset);
} else {
	await runGeneric();
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

function integerArg(name, defaultValue, minValue) {
	const value = stringArg(name, '');
	if (!value) return defaultValue;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minValue) {
		throw new Error(`--${name} must be an integer >= ${minValue}.`);
	}
	return parsed;
}

function optionalIntegerArg(name) {
	const value = stringArg(name, '');
	if (!value) return null;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(`--${name} must be a positive integer.`);
	}
	return parsed;
}

function readExistingChainsText(filePath) {
	if (!existsSync(filePath)) throw new Error(`Missing existing chains file: ${filePath}`);
	const raw = readFileSync(filePath, 'utf8');
	if (!filePath.endsWith('.json')) return raw.slice(0, 70000);
	const parsed = JSON.parse(raw);
	const chains = Array.isArray(parsed)
		? parsed
		: Array.isArray(parsed.answerChains)
			? parsed.answerChains
			: Array.isArray(parsed.answer_chains)
				? parsed.answer_chains
				: Array.isArray(parsed.questions)
					? parsed.questions.map((question) => question.answerChain).filter(Boolean)
					: parsed;
	return JSON.stringify(chains, null, 2).slice(0, 70000);
}

function assertInputFiles(filePaths, label) {
	for (const filePath of filePaths) {
		if (!existsSync(filePath)) throw new Error(`Missing ${label}: ${filePath}`);
	}
}

async function runGeneric() {
	const questionPaperPath = requiredStringArg('question-paper');
	const markSchemePath = requiredStringArg('mark-scheme');
	const sourceDocumentId = requiredStringArg('source-document-id');
	const outputPath = requiredStringArg('output');
	const markSchemeDocumentId = stringArg(
		'mark-scheme-document-id',
		sourceDocumentId.includes('-qp-')
			? sourceDocumentId.replace('-qp-', '-ms-')
			: `${sourceDocumentId}-mark-scheme`
	);
	assertInputFiles([questionPaperPath, markSchemePath, ...supportingDocumentPaths], 'input PDF');
	await runOne({
		questionPaperPath,
		markSchemePath,
		supportingDocumentPaths,
		sourceDocumentId,
		markSchemeDocumentId,
		outputPath,
		outputRoot: stringArg(
			'work-dir',
			path.join(rootDir, 'tmp/llm-extraction-pipeline', sourceDocumentId)
		),
		existingChainsText: explicitExistingChainsText,
		presetInstructions: '',
		documentMetadata: genericDocumentMetadata()
	});
}

function optionalMetadataString(name) {
	const value = stringArg(name, '').trim();
	return value || undefined;
}

function optionalMetadataYear() {
	const value = optionalIntegerArg('year');
	return value ?? undefined;
}

function genericDocumentMetadata() {
	const questionPaperUrl = optionalMetadataString('question-paper-url');
	const markSchemeUrl = optionalMetadataString('mark-scheme-url');
	return {
		board: optionalMetadataString('board'),
		qualification: optionalMetadataString('qualification'),
		subject: optionalMetadataString('subject'),
		subjectArea: optionalMetadataString('subject-area'),
		tier: optionalMetadataString('tier'),
		paper: optionalMetadataString('paper-label'),
		componentCode: optionalMetadataString('component-code'),
		series: optionalMetadataString('series'),
		year: optionalMetadataYear(),
		questionPaperTitle: optionalMetadataString('question-paper-title'),
		markSchemeTitle: optionalMetadataString('mark-scheme-title'),
		questionPaper: questionPaperUrl ? { sourceUrl: questionPaperUrl } : undefined,
		markScheme: markSchemeUrl ? { sourceUrl: markSchemeUrl } : undefined
	};
}

async function runPreset(name) {
	if (name === 'aqa-physics') {
		await runAqaPhysicsPreset();
		return;
	}
	if (name === 'aqa-separate-science') {
		await runAqaSeparateSciencePreset();
		return;
	}
	throw new Error(`Unknown preset: ${name}`);
}

function refsNeedingRepair(candidate, evaluation, options = {}) {
	const deterministic = deterministicCandidateIssues(candidate, {
		includeAnswerChainIssues: options.evaluationMode !== 'extraction'
	});
	const blocking = blockingIssues(deterministic);
	const refs = new Set(blocking.map((issue) => issue.sourceQuestionRef).filter(Boolean));
	for (const ref of questionHumanReviewRefs(candidate, {
		includeAnswerChainReview: options.evaluationMode !== 'extraction'
	})) {
		refs.add(ref);
	}
	const judgeRepairs = JSON.stringify(evaluation?.judge?.requiredRepairs ?? []);
	for (const question of candidate.questions ?? []) {
		if (judgeRepairs.includes(question.sourceQuestionRef)) refs.add(question.sourceQuestionRef);
	}
	if (refs.size > 0) return [...refs];
	return (candidate.questions ?? []).map((question) => question.sourceQuestionRef).filter(Boolean);
}

function questionHumanReviewRefs(candidate, options = {}) {
	const includeAnswerChainReview = options.includeAnswerChainReview !== false;
	const refs = new Set();
	for (const question of candidate.questions ?? []) {
		if (!question.sourceQuestionRef) continue;
		if (
			question.needsHumanReview ||
			(includeAnswerChainReview && question.answerChain?.needsHumanReview)
		) {
			refs.add(question.sourceQuestionRef);
			continue;
		}
		if (question.modelAnswer?.needsHumanReview) {
			refs.add(question.sourceQuestionRef);
			continue;
		}
		if ((question.assets ?? []).some((asset) => asset?.needsHumanReview)) {
			refs.add(question.sourceQuestionRef);
			continue;
		}
		if ((question.markChecklist ?? []).some((item) => item?.needsHumanReview)) {
			refs.add(question.sourceQuestionRef);
		}
	}
	return [...refs];
}

function chunks(values, size) {
	const result = [];
	for (let index = 0; index < values.length; index += size) {
		result.push(values.slice(index, index + size));
	}
	return result;
}

function filterDeterministicIssuesForRefs(deterministicIssues, refs) {
	const allowed = new Set(refs);
	return (deterministicIssues ?? []).filter((finding) => allowed.has(finding.sourceQuestionRef));
}

async function repairFailedQuestionBatches({
	model,
	thinkingLevel,
	candidate,
	evaluation,
	judge,
	existingChainsText,
	repairCacheDir,
	repairLlmTimeoutMs,
	repairLlmMaxAttempts,
	evaluationMode,
	repairAnswerChains
}) {
	let repaired = candidate;
	const refs = refsNeedingRepair(candidate, evaluation, { evaluationMode });
	for (const batchRefs of chunks(refs, repairBatchSize)) {
		const refsToRepair = [];
		for (const ref of batchRefs) {
			const cachePath = path.join(repairCacheDir, `repair-v2-${slugify(ref)}.json`);
			if (existsSync(cachePath)) {
				console.error(`[extract-cli] repair cache ${ref}`);
				repaired = applyQuestionRepair(repaired, readJson(cachePath));
			} else {
				refsToRepair.push(ref);
			}
		}
		if (refsToRepair.length === 0) continue;
		console.error(`[extract-cli] repairing refs ${refsToRepair.join(', ')}`);
		try {
			repaired = await withTemporaryLlmRepairEnv(
				{
					timeoutMs: repairLlmTimeoutMs,
					maxAttempts: repairLlmMaxAttempts
				},
				async () => {
					let next = await repairFullPaperQuestionQuality({
						model,
						thinkingLevel,
						candidate: repaired,
						deterministicIssues: filterDeterministicIssuesForRefs(
							deterministicCandidateIssues(repaired, {
								includeAnswerChainIssues: evaluationMode !== 'extraction'
							}),
							refsToRepair
						),
						judge,
						existingChainsText,
						sourceQuestionRefs: refsToRepair
					});
					if (repairAnswerChains) {
						next = await repairFullPaperAnswerChains({
							model,
							thinkingLevel,
							candidate: next,
							deterministicIssues: filterDeterministicIssuesForRefs(
								deterministicCandidateIssues(next),
								refsToRepair
							),
							judge,
							existingChainsText,
							sourceQuestionRefs: refsToRepair
						});
					}
					return next;
				}
			);
		} catch (error) {
			const errorSummary = summarizeRepairError(error);
			console.error(
				`[extract-cli] repair failed for refs ${refsToRepair.join(', ')}: ${errorSummary}`
			);
			repaired = markRepairFailureForRefs(repaired, refsToRepair, errorSummary);
			for (const ref of refsToRepair) {
				writeJson(path.join(repairCacheDir, `repair-failed-v2-${slugify(ref)}.json`), {
					repairVersion: 2,
					sourceQuestionRef: ref,
					failedAt: new Date().toISOString(),
					error: errorSummary
				});
			}
			continue;
		}
		for (const ref of refsToRepair) {
			const question = repaired.questions.find(
				(candidateQuestion) => candidateQuestion.sourceQuestionRef === ref
			);
			if (!question) continue;
			writeJson(path.join(repairCacheDir, `repair-v2-${slugify(ref)}.json`), {
				repairVersion: 2,
				sourceQuestionRef: ref,
				selfContainedPromptText: question.selfContainedPromptText,
				contextText: question.contextText,
				response: question.response,
				assets: question.assets,
				markSchemeItems: question.markSchemeItems,
				answerChain: question.answerChain,
				chainResolution: question.chainResolution ?? null,
				markChecklist: question.markChecklist,
				modelAnswer: question.modelAnswer,
				commonWeakAnswers: question.commonWeakAnswers ?? [],
				needsHumanReview: question.needsHumanReview,
				reviewNotes: question.reviewNotes ?? []
			});
		}
	}
	return repaired;
}

async function withTemporaryLlmRepairEnv({ timeoutMs, maxAttempts }, callback) {
	const updates = {};
	if (timeoutMs !== null && timeoutMs !== undefined) {
		updates.EXTRACTION_LLM_TIMEOUT_MS = String(timeoutMs);
	}
	if (maxAttempts !== null && maxAttempts !== undefined) {
		updates.EXTRACTION_LLM_MAX_ATTEMPTS = String(maxAttempts);
	}
	if (Object.keys(updates).length === 0) return callback();
	const previous = new Map();
	for (const [key, value] of Object.entries(updates)) {
		previous.set(key, process.env[key]);
		process.env[key] = value;
	}
	try {
		return await callback();
	} finally {
		for (const [key, value] of previous.entries()) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

function summarizeRepairError(error) {
	const pieces = [];
	if (error?.name) pieces.push(error.name);
	if (error?.message) pieces.push(error.message);
	if (Array.isArray(error?.attempts)) {
		const attemptSummaries = error.attempts
			.slice(-3)
			.map((attempt) => {
				const message = attempt?.error?.message ?? String(attempt?.error ?? '');
				return `attempt ${attempt?.attempt ?? '?'}: ${message}`;
			})
			.filter(Boolean);
		if (attemptSummaries.length) pieces.push(attemptSummaries.join('; '));
	}
	return pieces.join(' - ').slice(0, 900);
}

function uniqueStrings(values) {
	return [...new Set((values ?? []).filter(Boolean))];
}

function markRepairFailureForRefs(candidate, refs, errorSummary) {
	const failedRefs = new Set(refs);
	const note = `Automated LLM repair failed: ${errorSummary}. Review this question before import.`;
	const chainNote = 'Automated LLM repair failed; review this answer chain before import.';
	return {
		...candidate,
		questions: candidate.questions.map((question) => {
			if (!failedRefs.has(question.sourceQuestionRef)) return question;
			return {
				...question,
				needsHumanReview: true,
				reviewNotes: uniqueStrings([...(question.reviewNotes ?? []), note]),
				answerChain: question.answerChain
					? {
							...question.answerChain,
							needsHumanReview: true,
							reviewNotes: uniqueStrings([...(question.answerChain.reviewNotes ?? []), chainNote])
						}
					: question.answerChain
			};
		})
	};
}

function applyQuestionRepair(candidate, repair) {
	return {
		...candidate,
		questions: candidate.questions.map((question) => {
			if (question.sourceQuestionRef !== repair.sourceQuestionRef) return question;
			return {
				...question,
				selfContainedPromptText:
					repair.selfContainedPromptText !== undefined
						? repair.selfContainedPromptText
						: question.selfContainedPromptText,
				contextText: repair.contextText !== undefined ? repair.contextText : question.contextText,
				response: repair.response ?? question.response,
				assets: repair.assets ?? question.assets,
				markSchemeItems: repair.markSchemeItems ?? question.markSchemeItems,
				answerChain: repair.answerChain ?? question.answerChain,
				chainResolution: repair.chainResolution ?? question.chainResolution,
				markChecklist: repair.markChecklist ?? question.markChecklist,
				modelAnswer: repair.modelAnswer ?? question.modelAnswer,
				commonWeakAnswers: repair.commonWeakAnswers ?? question.commonWeakAnswers,
				needsHumanReview:
					repair.needsHumanReview !== undefined
						? repair.needsHumanReview
						: question.needsHumanReview,
				reviewNotes: repair.reviewNotes ?? question.reviewNotes
			};
		})
	};
}

async function runAqaPhysicsPreset() {
	const papers = discoverAqaPhysicsPapers();
	const paperArg = stringArg('paper', '');
	const all = hasArg('all');
	if (!paperArg && !all) throw new Error('Pass --paper=<source-id-or-component> or --all.');
	const selected = all
		? papers
		: papers.filter(
				(paper) => paper.sourceDocumentId === paperArg || paper.componentCode === paperArg
			);
	if (!selected.length) throw new Error(`No AQA Physics paper matched ${paperArg}.`);
	const outputRoot = stringArg(
		'output-root',
		path.join(rootDir, 'data/vision-extracted/aqa-combined-science-trilogy-higher/physics')
	);
	for (const paper of selected) {
		await runOne({
			questionPaperPath: paper.questionPaperPath,
			markSchemePath: paper.markSchemePath,
			supportingDocumentPaths,
			sourceDocumentId: paper.sourceDocumentId,
			markSchemeDocumentId: paper.markSchemeDocumentId,
			outputPath: stringArg('output', path.join(outputRoot, `${paper.sourceDocumentId}.json`)),
			outputRoot: path.join(rootDir, 'tmp/llm-extraction-pipeline/aqa-physics'),
			existingChainsText: explicitExistingChainsText,
			presetInstructions: [
				'Preset metadata:',
				'Board: AQA',
				'Qualification: GCSE',
				'Subject: Combined Science',
				'Subject area: Physics',
				'Tier: Higher',
				`Paper: ${paper.paper}`,
				`Component code: ${paper.componentCode}`,
				`Series: ${paper.series}`,
				`Year: ${paper.year}`
			].join('\n'),
			assetManifest: assetManifest(paper.sourceDocumentId),
			assetManifestText: compactAssetManifestText(assetManifest(paper.sourceDocumentId)),
			documentMetadata: {
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Combined Science',
				subjectArea: 'Physics',
				tier: 'Higher',
				paper: paper.paper,
				componentCode: paper.componentCode,
				series: paper.series,
				year: paper.year,
				questionPaperTitle: titleForQuestionPaper(paper.componentCode, paper.series),
				markSchemeTitle: titleForMarkScheme(paper.componentCode, paper.series)
			}
		});
	}
}

async function runAqaSeparateSciencePreset() {
	const subjectArg = stringArg('subject', 'all').toLowerCase();
	const papers = discoverAqaSeparateSciencePapers().filter(
		(paper) => subjectArg === 'all' || paper.subjectArea.toLowerCase() === subjectArg
	);
	const paperArg = stringArg('paper', '');
	const all = hasArg('all');
	if (!paperArg && !all) {
		throw new Error('Pass --paper=<source-id-or-component>, --all, and optionally --subject=...');
	}
	const selected = all
		? papers
		: papers.filter(
				(paper) => paper.sourceDocumentId === paperArg || paper.componentCode === paperArg
			);
	if (!selected.length) throw new Error(`No AQA Separate Science paper matched ${paperArg}.`);
	const outputRoot = stringArg(
		'output-root',
		path.join(rootDir, 'data/vision-extracted/aqa-separate-science-higher')
	);
	for (const paper of selected) {
		const subjectSlug = slugify(paper.subjectArea);
		await runOne({
			questionPaperPath: paper.questionPaperPath,
			markSchemePath: paper.markSchemePath,
			supportingDocumentPaths: [...paper.supportingDocumentPaths, ...supportingDocumentPaths],
			sourceDocumentId: paper.sourceDocumentId,
			markSchemeDocumentId: paper.markSchemeDocumentId,
			outputPath: stringArg(
				'output',
				path.join(outputRoot, subjectSlug, `${paper.sourceDocumentId}.json`)
			),
			outputRoot: path.join(rootDir, 'tmp/llm-extraction-pipeline/aqa-separate-science'),
			existingChainsText: explicitExistingChainsText,
			presetInstructions: [
				'Preset metadata:',
				'Board: AQA',
				'Qualification: GCSE',
				`Subject: ${paper.subject}`,
				`Subject area: ${paper.subjectArea}`,
				'Tier: Higher',
				`Paper: ${paper.paper}`,
				`Component code: ${paper.componentCode}`,
				`Series: ${paper.series}`,
				`Year: ${paper.year}`,
				'This is AQA Separate Science, not Combined Science Trilogy.'
			].join('\n'),
			documentMetadata: {
				board: 'AQA',
				qualification: 'GCSE',
				subject: paper.subject,
				subjectArea: paper.subjectArea,
				tier: 'Higher',
				paper: paper.paper,
				componentCode: paper.componentCode,
				series: paper.series,
				year: paper.year,
				questionPaperTitle: paper.questionPaperTitle,
				markSchemeTitle: paper.markSchemeTitle,
				questionPaper: { sourceUrl: paper.questionPaperUrl },
				markScheme: { sourceUrl: paper.markSchemeUrl },
				supportingDocuments: paper.supportingDocuments
			},
			assetManifest: assetManifest(paper.sourceDocumentId, outputRoot),
			assetManifestText: compactAssetManifestText(assetManifest(paper.sourceDocumentId, outputRoot))
		});
	}
}

async function runOne({
	questionPaperPath,
	markSchemePath,
	supportingDocumentPaths,
	sourceDocumentId,
	markSchemeDocumentId,
	outputPath,
	outputRoot,
	existingChainsText,
	presetInstructions,
	assetManifest = [],
	assetManifestText = '',
	documentMetadata = {}
}) {
	if (existsSync(outputPath) && !forceOutput) {
		console.log(`skip existing ${path.relative(rootDir, outputPath)}; pass --force to overwrite`);
		return;
	}
	if (dryRun) {
		console.log(
			JSON.stringify(
				{
					sourceDocumentId,
					markSchemeDocumentId,
					questionPaperPath,
					markSchemePath,
					supportingDocumentPaths,
					outputPath,
					model,
					judgeModel,
					thinkingLevel,
					judgeThinkingLevel,
					evaluationMode,
					extractionStrategy,
					agentMaxSteps,
					judgeMode,
					judgeBatchSize,
					judgeConcurrency,
					runJudge,
					runId: process.env.EXTRACTION_RUN_ID ?? null
				},
				null,
				2
			)
		);
		return;
	}
	console.error(
		`[extract-cli] ${sourceDocumentId}: extracting ${path.relative(rootDir, questionPaperPath)}`
	);
	let candidate = await extractFullPaperFromPdfSet({
		rootDir,
		questionPaperPath,
		markSchemePath,
		supportingDocumentPaths,
		sourceDocumentId,
		markSchemeDocumentId,
		outputRoot,
		dpi,
		forceRender,
		forceChunkCache,
		questionPages,
		markSchemePages,
		chunkPages,
		contextPages,
		chunkStrategy,
		chunkConcurrency,
		extractionStrategy,
		agentMaxSteps,
		extractionGranularity,
		allowQuestionGranularity,
		model,
		thinkingLevel,
		markSchemeImageMode,
		mediaResolution,
		extractionSpec,
		existingChainsText,
		extraInstructions: [presetInstructions, extraInstructions].filter(Boolean).join('\n\n'),
		expectedQuestionCount,
		assetManifest,
		assetManifestText,
		documentMetadata
	});
	console.error(
		`[extract-cli] ${sourceDocumentId}: extracted ${candidate.questions.length} questions`
	);
	candidate = materializeQuestionMediaAssets(candidate, {
		questionPaperPath,
		sourceDocumentId,
		outputPath,
		dpi
	});
	candidate = normalizeQuestionExtractionCandidate(candidate);
	console.error(
		`[extract-cli] ${sourceDocumentId}: writing pre-judge candidate ${path.relative(rootDir, outputPath)}`
	);
	writeJson(outputPath, candidate);
	console.error(`[extract-cli] ${sourceDocumentId}: evaluating`);
	let evaluation = await evaluateExtractedCandidate(candidate);
	for (let attempt = 0; evaluation.status !== 'passed' && attempt < repairAttempts; attempt += 1) {
		console.error(`[extract-cli] ${sourceDocumentId}: repairing attempt ${attempt + 1}`);
		candidate = await repairFailedQuestionBatches({
			model,
			thinkingLevel,
			candidate,
			evaluation,
			judge: evaluation.judge,
			existingChainsText,
			repairCacheDir: path.join(outputRoot, sourceDocumentId, 'repairs'),
			repairLlmTimeoutMs,
			repairLlmMaxAttempts,
			evaluationMode,
			repairAnswerChains
		});
		candidate = normalizeQuestionExtractionCandidate(candidate);
		writeJson(outputPath, candidate);
		evaluation = await evaluateExtractedCandidate(candidate);
	}
	console.error(`[extract-cli] ${sourceDocumentId}: writing ${path.relative(rootDir, outputPath)}`);
	writeJson(outputPath, candidate);
	if (writeEvalPath) writeJson(writeEvalPath, evaluation);
	console.log(
		JSON.stringify(
			{
				status: evaluation.status,
				output: path.relative(rootDir, outputPath),
				evaluation: writeEvalPath ? path.relative(rootDir, writeEvalPath) : null,
				sourceDocumentId,
				questions: candidate.questions.length,
				supportingDocuments: supportingDocumentPaths.length,
				model,
				judgeModel,
				thinkingLevel,
				judgeThinkingLevel,
				evaluationMode,
				judgeMode,
				judgeBatchSize,
				judgeConcurrency,
				runJudge,
				deterministicBlockingIssues: evaluation.deterministicBlockingIssues.length,
				mechanicalErrors: evaluation.mechanicalErrors.length,
				judgeVerdict: evaluation.judge?.verdict ?? null,
				judgeScore: evaluation.judge?.score ?? null
			},
			null,
			2
		)
	);
	if (evaluation.status !== 'passed') process.exit(1);
}

async function evaluateExtractedCandidate(candidate) {
	if (judgeMode === 'question-batches' && !judgeFixturePath) {
		return evaluateCandidateQuestionBatches({
			candidate,
			judgeModel,
			thinkingLevel: judgeThinkingLevel,
			runJudge,
			evaluationMode,
			judgeBatchSize,
			judgeConcurrency,
			onBatchResult: (batches) => {
				if (!writeEvalPath) return;
				writeJson(writeEvalPath, {
					status: 'running',
					evaluationMode,
					judgeMode: 'question-batches',
					judgeBatchSize,
					judgeConcurrency,
					questionCount: candidate.questions?.length ?? 0,
					completedBatches: batches.length,
					batches
				});
			}
		});
	}
	return evaluateCandidate({
		candidate,
		fixture: judgeFixturePath ? readJson(judgeFixturePath) : null,
		judgeModel,
		thinkingLevel: judgeThinkingLevel,
		runJudge,
		evaluationMode
	});
}

function materializeQuestionMediaAssets(
	candidate,
	{ questionPaperPath, sourceDocumentId, outputPath, dpi }
) {
	const missing = [];
	for (const question of candidate.questions ?? []) {
		const responseLabels = new Set(responseAssetLabels(question));
		const labels = [
			...new Set([
				...responseLabels,
				...mediaBlockAssetLabels(question),
				...referencedMediaAssetLabels(question)
			])
		];
		for (const label of labels) {
			const asset = (question.assets ?? []).find((candidateAsset) =>
				assetMatchesLabel(candidateAsset, label)
			);
			if (
				(!asset || !assetHasUsableReference(asset)) &&
				!questionHasStructuredTableSurface(question, label)
			) {
				missing.push({ question, label });
			}
		}
	}
	if (!missing.length) return candidate;
	const assetDir = extractedAssetDir(outputPath, sourceDocumentId);
	mkdirSync(assetDir, { recursive: true });
	const pageRenderDir = path.join(rootDir, 'tmp/llm-extraction-media-assets', sourceDocumentId);
	const renderedPages = renderPdfPages({
		pdfPath: questionPaperPath,
		outputDir: pageRenderDir,
		prefix: 'question-page',
		dpi,
		force: false
	});
	const renderedByPage = new Map(
		renderedPages.map((filePath) => [renderedPageNumber(filePath), filePath])
	);
	let croppedAssets = 0;
	let fallbackAssets = 0;
	const questions = candidate.questions.map((question) => {
		const questionMissing = missing.filter(
			(item) => item.question.sourceQuestionRef === question.sourceQuestionRef
		);
		if (!questionMissing.length) return question;
		const assets = [...(question.assets ?? [])];
		let nextQuestion = question;
		let requiresReview = false;
		let resolvedByCrop = false;
		const reviewNotesBeforeCrop = question.reviewNotes ?? [];
		const responseLabels = new Set(responseAssetLabels(question));
		for (const { label } of questionMissing) {
			const crop = cropReferencedMediaAsset({
				questionPaperPath,
				renderedByPage,
				assetDir,
				sourceDocumentId,
				question,
				label
			});
			if (crop) {
				croppedAssets += 1;
				resolvedByCrop = true;
				assets.push(crop.asset);
				nextQuestion = replaceMediaSummaryBlocksWithFigure(nextQuestion, label);
				continue;
			}
			const pageNumber = pageNumberForMissingAsset(question, label);
			const renderedPage = renderedByPage.get(pageNumber);
			if (!renderedPage) continue;
			const fileName = `page-${String(pageNumber).padStart(3, '0')}-${slugify(question.sourceQuestionRef)}-${slugify(label) || 'asset'}.png`;
			const destPath = path.join(assetDir, fileName);
			copyFileSync(renderedPage, destPath);
			fallbackAssets += 1;
			requiresReview = true;
			const isResponseAsset = responseLabels.has(label);
			assets.push({
				sourceLabel: label,
				assetType: 'image',
				role: isResponseAsset ? 'response-canvas' : 'question-context',
				pageNumber,
				required: true,
				filePath: relativePath(destPath),
				publicPath: `/images/papers/${sourceDocumentId}/${fileName}`,
				r2Key: `images/papers/${sourceDocumentId}/${fileName}`,
				altText: `${label} rendered from source paper page ${pageNumber}.`,
				extractionConfidence: 0.72,
				needsHumanReview: true,
				reviewNotes: [
					'Fallback full-page asset generated because the extraction referenced interactive media without a usable asset file. Review and crop if needed before publishing.'
				]
			});
		}
		const strippedReviewNotes = resolvedByCrop
			? stripResolvedMediaReviewNotes(nextQuestion.reviewNotes ?? [])
			: (nextQuestion.reviewNotes ?? []);
		const reviewNotes = requiresReview
			? [
					...strippedReviewNotes,
					'Generated fallback page image for missing interactive media asset.'
				]
			: strippedReviewNotes;
		const modelAnswer = clearResolvedMediaModelAnswer({
			modelAnswer: nextQuestion.modelAnswer,
			response: nextQuestion.response,
			resolvedByCrop,
			requiresReview
		});
		const clearedResolvedMediaReview =
			resolvedByCrop && reviewNotesBeforeCrop.length > 0 && reviewNotes.length === 0;
		return {
			...nextQuestion,
			response: ensureResponseAssetLabel(nextQuestion.response, questionMissing[0]?.label),
			assets,
			modelAnswer,
			needsHumanReview: requiresReview
				? true
				: clearedResolvedMediaReview
					? false
					: nextQuestion.needsHumanReview,
			reviewNotes
		};
	});
	console.error(
		`[extract-cli] ${sourceDocumentId}: materialized ${croppedAssets} cropped media asset(s), ${fallbackAssets} fallback page asset(s)`
	);
	return recomputeExtractionRunReviewState({ ...candidate, questions });
}

function normalizeQuestionExtractionCandidate(candidate) {
	const questions = (candidate.questions ?? []).map(normalizeQuestionExtractionQuality);
	return recomputeExtractionRunReviewState({ ...candidate, questions });
}

function normalizeQuestionExtractionQuality(question) {
	const markSchemeItems = normalizeLevelMarkSchemeItems(question);
	const normalized = {
		...question,
		selfContainedPromptText: stripDerivedMediaReadingContext(question.selfContainedPromptText),
		contextText: stripDerivedMediaReadingContext(question.contextText),
		stemBlocks: normalizeStemBlocks(question.stemBlocks, question.contextText),
		promptBlocks:
			Array.isArray(question.promptBlocks) && question.promptBlocks.length
				? question.promptBlocks
				: paragraphBlocksFromText(question.promptText),
		markSchemeItems,
		markChecklist: normalizeMarkChecklistItems({ ...question, markSchemeItems })
	};
	return normalizeAllowedAlternativeAnswerEvidence(normalized);
}

function paragraphBlocksFromText(text) {
	return String(text ?? '')
		.split(/\n{2,}/)
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => ({ kind: 'paragraph', text: part }));
}

function normalizeStemBlocks(blocks, contextText) {
	const source = Array.isArray(blocks) ? blocks : [];
	const context = normalizeText(contextText);
	let next = source;
	if (context && source.length > 1) {
		next = source.filter((block) => {
			if (String(block?.kind ?? '') !== 'paragraph') return true;
			return normalizeText(block.text) !== context;
		});
		if (!next.length) next = source;
	}
	const seen = new Set();
	return next.filter((block) => {
		const key = `${block?.kind ?? ''}:${normalizeText(block?.text ?? JSON.stringify(block ?? {}))}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function stripDerivedMediaReadingContext(text) {
	const value = String(text ?? '').trim();
	if (!value) return text ?? null;
	const parts = value
		.split(/\n{2,}/)
		.map((part) => part.trim())
		.filter((part) => !isDerivedMediaReadingParagraph(part));
	const stripped = parts.join('\n\n').trim();
	return stripped || null;
}

function isDerivedMediaReadingParagraph(text) {
	return /^\s*(?:using|from|reading)\s+(?:figure|fig\.?|table|graph)\s+\d+[A-Za-z]?\s*:/i.test(
		String(text ?? '')
	);
}

function normalizeText(text) {
	return String(text ?? '')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalizeLevelMarkSchemeItems(question) {
	const items = question.markSchemeItems ?? [];
	const levels = items.map((item) => checklistLevelNumber(item)).filter(Boolean);
	const maxLevel = Math.max(0, ...levels);
	const maxMarks = Number(question.marks);
	if (!maxLevel || !Number.isFinite(maxMarks) || maxMarks <= 1) return items;
	return items.map((item) => {
		const level = checklistLevelNumber(item);
		if (!level || level > maxLevel) return item;
		const text = String(item.text ?? '');
		if (/\b\d+\s*(?:-|–|to)\s*\d+\s*marks?\b/i.test(text)) return item;
		const low = Math.floor(((level - 1) * maxMarks) / maxLevel) + 1;
		const high = Math.floor((level * maxMarks) / maxLevel);
		const replacement = `Level ${level} (${low}-${high} marks)`;
		return {
			...item,
			text: text.replace(new RegExp(`\\bLevel\\s+${level}\\b\\s*[:,]?`, 'i'), `${replacement}:`)
		};
	});
}

function normalizeMarkChecklistItems(question) {
	const items = (question.markChecklist ?? []).map((item) => {
		const text = String(item.text ?? '').trim();
		const references = checklistReferencedMarkSchemeItems(question, item);
		let required = item.required !== false;
		if (references.length && references.every(isIndicativeMarkSchemeItem)) required = false;
		else if (references.length && references.some(isLevelMarkSchemeItem)) required = true;
		else if (isOptionalChecklistText(text) || isNegativeGuidanceChecklistText(text)) {
			required = false;
		}
		return { ...item, text, required };
	});
	return normalizeLevelResponseChecklist(question, normalizeSelectionChecklist(question, items));
}

function normalizeLevelResponseChecklist(question, items) {
	if (!(question.markSchemeItems ?? []).some(isLevelMarkSchemeItem)) return items;
	const levelIndexes = (question.markSchemeItems ?? [])
		.map((item, index) => (isLevelMarkSchemeItem(item) ? index : null))
		.filter((index) => index !== null);
	const next = items.map((item) => {
		const references = checklistReferencedMarkSchemeItems(question, item);
		if (!references.some((ref) => isLevelMarkSchemeItem(ref) || isIndicativeMarkSchemeItem(ref))) {
			return item;
		}
		return { ...item, required: false };
	});
	if (next.some((item) => /appropriate level of response|level-of-response/i.test(item.text))) {
		return next;
	}
	return [
		{
			text: 'Provide enough scientifically relevant detail for the appropriate level of response.',
			required: true,
			markSchemeItemIndexes: levelIndexes,
			confidence: 0.9,
			needsHumanReview: false
		},
		...next
	];
}

function normalizeSelectionChecklist(question, items) {
	const requiredCount = inferRequiredChecklistSelectionCount(question, items);
	if (!requiredCount) return items;
	const optionIndexes = items
		.map((item, index) => ({ item, index }))
		.filter(({ item }) => isChecklistSelectionAlternative(question, item))
		.map(({ index }) => index);
	if (optionIndexes.length <= requiredCount) {
		if (items.some((item) => item.required)) return items;
		return [
			{
				text: normalizeSelectionUmbrellaText(question, requiredCount, ''),
				required: true,
				markSchemeItemIndexes: uniqueNumbers(
					items.flatMap((item) => item.markSchemeItemIndexes ?? [])
				),
				confidence: 0.9,
				needsHumanReview: false
			},
			...items
		];
	}
	const optionMarkIndexes = uniqueNumbers(
		optionIndexes.flatMap((index) => items[index]?.markSchemeItemIndexes ?? [])
	);
	const next = items.map((item, index) =>
		optionIndexes.includes(index) ? { ...item, required: false } : item
	);
	const allMarkIndexes = uniqueNumbers(
		next.flatMap((item) => item.markSchemeItemIndexes ?? [])
	);
	if (!next.some((item) => item.required)) {
		return [
			{
				text: normalizeSelectionUmbrellaText(question, requiredCount, ''),
				required: true,
				markSchemeItemIndexes: optionMarkIndexes.length ? optionMarkIndexes : allMarkIndexes,
				confidence: 0.9,
				needsHumanReview: false
			},
			...next
		];
	}
	const existingUmbrellaIndex = next.findIndex((item) =>
		isSelectionUmbrellaChecklistItem(item, requiredCount)
	);
	if (existingUmbrellaIndex >= 0) {
		const item = next[existingUmbrellaIndex];
		next[existingUmbrellaIndex] = {
			...item,
			text: normalizeSelectionUmbrellaText(question, requiredCount, item.text),
			required: true,
			markSchemeItemIndexes: item.markSchemeItemIndexes?.length
				? item.markSchemeItemIndexes
				: optionMarkIndexes
		};
		return next;
	}
	return [
		{
			text: normalizeSelectionUmbrellaText(question, requiredCount, ''),
			required: true,
			markSchemeItemIndexes: optionMarkIndexes,
			confidence: 0.9,
			needsHumanReview: false
		},
		...next
	];
}

function checklistReferencedMarkSchemeItems(question, item) {
	return (item.markSchemeItemIndexes ?? [])
		.map((index) => question.markSchemeItems?.[index])
		.filter(Boolean);
}

function isOptionalChecklistText(text) {
	return /^(?:may|can include|could include|acceptable alternatives?|examples? include)\b/i.test(
		String(text ?? '').trim()
	);
}

function isNegativeGuidanceChecklistText(text) {
	return /^(?:do not credit|do not accept|reject|ignore)\b/i.test(String(text ?? '').trim());
}

function isIndicativeMarkSchemeItem(item) {
	const text = `${item?.itemType ?? ''} ${item?.text ?? ''}`;
	return /\bindicative\b/i.test(text);
}

function isLevelMarkSchemeItem(item) {
	const itemType = String(item?.itemType ?? '');
	const text = String(item?.text ?? '');
	return /\blevel\b/i.test(itemType) || /^\s*Level\s+\d+\b/i.test(text);
}

function checklistLevelNumber(item) {
	if (!isLevelMarkSchemeItem(item)) return null;
	const match = String(item?.text ?? item?.itemType ?? '').match(/\blevel\s+(\d+)\b/i);
	return match ? Number(match[1]) : null;
}

function inferRequiredChecklistSelectionCount(question, items) {
	const text = [
		question.promptText,
		question.selfContainedPromptText,
		...items.map((item) => item.text),
		...(question.markSchemeItems ?? []).map((item) => item.text)
	]
		.filter(Boolean)
		.join('\n');
	const explicit =
		text.match(/\b(?:give|suggest|state|name|identify|write)\s+(one|two|three|four|five|\d+)\b/i) ??
		text.match(/\bmaximum of\s+(one|two|three|four|five|\d+)\b/i) ??
		text.match(/\bany\s+(one|two|three|four|five|\d+)\s+(?:from|of)\b/i);
	if (explicit) return wordNumber(explicit[1]);
	const marks = Number(question.marks);
	const positiveOneMarkItems = (question.markSchemeItems ?? []).filter(
		(item) => !isLevelMarkSchemeItem(item) && !isIndicativeMarkSchemeItem(item) && Number(item.marks) === 1
	);
	if (Number.isInteger(marks) && marks > 0 && positiveOneMarkItems.length > marks) return marks;
	return null;
}

function wordNumber(value) {
	const normalized = String(value ?? '').toLowerCase();
	const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
	const parsed = words[normalized] ?? Number(normalized);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isChecklistSelectionAlternative(question, item) {
	if (isNegativeGuidanceChecklistText(item.text)) return false;
	const references = checklistReferencedMarkSchemeItems(question, item);
	if (references.length !== 1) return false;
	if (references.some((ref) => isLevelMarkSchemeItem(ref) || isIndicativeMarkSchemeItem(ref))) {
		return false;
	}
	if (item.markSchemeItemIndexes?.length !== 1) return false;
	const ref = references[0];
	return (
		Number(ref.marks) === 1 ||
		/^(?:may|credits?|states?|gives?|identifies?|describes?)\b/i.test(String(item.text ?? '')) ||
		/\b(?:reason|conclusion|aspect|limitation|validity|point)\b/i.test(
			`${ref.itemType ?? ''} ${ref.text ?? ''}`
		)
	);
}

function isSelectionUmbrellaChecklistItem(item, requiredCount) {
	const text = String(item.text ?? '');
	return (
		(item.markSchemeItemIndexes?.length ?? 0) > 1 ||
		new RegExp(`\\b(?:any|maximum of|give|suggest|state)\\s+${numberWord(requiredCount)}\\b`, 'i').test(
			text
		) ||
		/\bdistinct credited\b/i.test(text)
	);
}

function normalizeSelectionUmbrellaText(question, requiredCount, existingText) {
	const text = String(existingText ?? '').trim();
	if (/\bmaximum of\b/i.test(text) || !text) {
		return `Give ${numberWord(requiredCount)} distinct credited ${selectionNoun(question, requiredCount)}.`;
	}
	return text;
}

function selectionNoun(question, requiredCount) {
	const prompt = String(question.promptText ?? question.selfContainedPromptText ?? '').toLowerCase();
	if (/\breasons?\b/.test(prompt)) return requiredCount === 1 ? 'reason' : 'reasons';
	if (/\bconclusions?\b/.test(prompt)) return requiredCount === 1 ? 'conclusion' : 'conclusions';
	if (/\baspects?\b/.test(prompt)) return requiredCount === 1 ? 'aspect' : 'aspects';
	if (/\bfactors?\b/.test(prompt)) return requiredCount === 1 ? 'factor' : 'factors';
	if (/\bpoints?\b/.test(prompt)) return requiredCount === 1 ? 'point' : 'points';
	return requiredCount === 1 ? 'point' : 'points';
}

function numberWord(value) {
	const words = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };
	return words[value] ?? String(value);
}

function uniqueNumbers(values) {
	return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value)))];
}

function normalizeAllowedAlternativeAnswerEvidence(question) {
	if (Number(question.marks) !== 1) return question;
	const alternatives = (question.markSchemeItems ?? [])
		.map((item, index) => ({ item, index, alternative: allowedAlternativeText(item) }))
		.filter(({ alternative }) => alternative);
	if (!alternatives.length) return question;
	let changed = false;
	const markChecklist = (question.markChecklist ?? []).map((item) => {
		const match = alternatives.find(({ index }) => (item.markSchemeItemIndexes ?? []).includes(index));
		if (!match || textMentions(item.text, match.alternative)) return item;
		changed = true;
		return {
			...item,
			text: appendSentence(item.text, `Accept also: ${match.alternative}.`)
		};
	});
	const acceptedAlternatives = alternatives.map(({ alternative }) => alternative);
	const modelAnswer =
		question.modelAnswer && !acceptedAlternatives.every((answer) => textMentions(question.modelAnswer.answerText, answer))
			? {
					...question.modelAnswer,
					answerText: appendSentence(
						question.modelAnswer.answerText,
						`Accept ${acceptedAlternatives.join(' or ')}.`
					)
				}
			: question.modelAnswer;
	const response =
		question.response && Array.isArray(question.response.correctAnswers)
			? {
					...question.response,
					correctAnswers: uniqueStrings([
						...(question.response.correctAnswers ?? []),
						...acceptedAlternatives
					])
				}
			: question.response;
	return changed || modelAnswer !== question.modelAnswer || response !== question.response
		? { ...question, markChecklist, modelAnswer, response }
		: question;
}

function allowedAlternativeText(item) {
	const text = String(item?.text ?? '');
	if (text.length > 160 || !/\bis also allowed\b/i.test(text)) return null;
	const match = text.match(/;\s*([^.;]+?)\s+is also allowed\b/i);
	return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
}

function appendSentence(text, sentence) {
	const base = String(text ?? '').trim();
	const addition = String(sentence ?? '').trim();
	if (!addition) return base;
	if (!base) return addition;
	if (textMentions(base, addition)) return base;
	return `${base.replace(/\s+$/g, '')}${/[.!?]$/.test(base) ? '' : '.'} ${addition}`;
}

function textMentions(text, value) {
	return String(text ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
}

function cropReferencedMediaAsset({
	questionPaperPath,
	renderedByPage,
	assetDir,
	sourceDocumentId,
	question,
	label
}) {
	if (!canCropMediaLabel(label)) return null;
	for (const pageNumber of candidateAssetPages(question)) {
		const renderedPage = renderedByPage.get(pageNumber);
		if (!renderedPage) continue;
		const fileName = `page-${String(pageNumber).padStart(3, '0')}-${slugify(question.sourceQuestionRef)}-${slugify(label) || 'asset'}-crop.png`;
		const destPath = path.join(assetDir, fileName);
		const crop = runFigureCrop({
			questionPaperPath,
			pageNumber,
			label,
			renderedPage,
			destPath
		});
		if (!crop) continue;
		const responseLabels = new Set(responseAssetLabels(question));
		const isResponseAsset = responseLabels.has(label);
		return {
			crop,
			asset: {
				sourceLabel: label,
				assetType: 'image',
				role: isResponseAsset ? 'response-canvas' : 'question-context',
				pageNumber,
				required: isResponseAsset || referencedMediaAssetLabels(question).includes(label),
				filePath: relativePath(destPath),
				publicPath: `/images/papers/${sourceDocumentId}/${fileName}`,
				r2Key: `images/papers/${sourceDocumentId}/${fileName}`,
				altText: `${label} cropped from source paper page ${pageNumber}.`,
				extractionConfidence: crop.extractionConfidence ?? 0.86,
				needsHumanReview: crop.needsHumanReview === true,
				reviewNotes: [],
				crop: {
					method: crop.method,
					bboxPixels: crop.bboxPixels,
					bboxNormalized: crop.bboxNormalized
				}
			}
		};
	}
	return null;
}

function runFigureCrop({ questionPaperPath, pageNumber, label, renderedPage, destPath }) {
	try {
		const raw = execFileSync(
			'python3',
			[
				path.join(rootDir, 'scripts/crop-pdf-figure.py'),
				'--pdf',
				questionPaperPath,
				'--page',
				String(pageNumber),
				'--label',
				label,
				'--image',
				renderedPage,
				'--output',
				destPath
			],
			{ cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
		);
		const parsed = JSON.parse(raw);
		return parsed.status === 'passed' ? parsed : null;
	} catch {
		return null;
	}
}

function canCropMediaLabel(label) {
	return /\b(?:figure|fig\.?|graph|diagram|image)\s+\d+[A-Za-z]?\b/i.test(String(label ?? ''));
}

function candidateAssetPages(question) {
	const pages = [
		question.pageStart,
		question.pageEnd,
		Number(question.pageStart) - 1,
		Number(question.pageStart) - 2,
		Number(question.pageEnd) + 1
	]
		.map(Number)
		.filter((value) => Number.isInteger(value) && value > 0);
	return [...new Set(pages)];
}

function mediaBlockAssetLabels(question) {
	const labels = [];
	for (const { block } of questionRenderBlocks(question)) {
		if (!isMediaRenderBlock(block)) continue;
		if (assetHasUsableReference(block)) continue;
		const label = renderBlockAssetLabel(block) ?? inferInteractiveAssetLabelFromText(question);
		if (label) labels.push(label);
	}
	return labels;
}

function referencedMediaAssetLabels(question) {
	const labels = [];
	const text = learnerFacingQuestionText(question);
	for (const match of text.matchAll(
		/\b(figure|fig\.?|graph|diagram|image)\s+(\d+[A-Za-z]?)\b/gi
	)) {
		const prefix = /^fig/i.test(match[1]) ? 'Figure' : titleCase(match[1]);
		const label = `${prefix} ${match[2]}`;
		if (mediaReferenceNeedsVisualContext(text, label, question.response?.kind)) labels.push(label);
	}
	return [...new Set(labels)];
}

function learnerFacingQuestionText(question) {
	return [
		question.promptText,
		question.selfContainedPromptText,
		question.contextText,
		...(question.reviewNotes ?? []),
		...questionRenderBlocks(question).flatMap(({ block }) => blockText(block))
	]
		.filter(Boolean)
		.join('\n');
}

function mediaReferenceNeedsVisualContext(text, label, responseKind) {
	const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const labelPattern = escapedLabel
		.replace(/figure/i, '(?:figure|fig\\.?)')
		.replace(/graph/i, 'graph')
		.replace(/diagram/i, 'diagram')
		.replace(/image/i, 'image');
	const aroundLabel = new RegExp(
		`(?:use|using|in|from|shown? in|shows?|complete|label|plot|draw|name|identify|results? in|part|set up|data from)\\b[^.\\n]{0,100}\\b${labelPattern}\\b|\\b${labelPattern}\\b[^.\\n]{0,100}\\b(?:shows?|complete|label|plot|draw|name|identify|results?|part|set up|data)`,
		'i'
	);
	return ['asset-canvas', 'image-label-zones'].includes(responseKind) || aroundLabel.test(text);
}

function questionRenderBlocks(question) {
	return ['stemBlocks', 'leadBlocks', 'promptBlocks', 'afterResponseBlocks'].flatMap((field) =>
		(question[field] ?? []).map((block, index) => ({ field, index, block }))
	);
}

function mediaBlockKinds() {
	return new Set([
		'figure',
		'image',
		'assetRef',
		'assetReference',
		'imageFigure',
		'imageBlock',
		'figure-placeholder',
		'figure-reference'
	]);
}

function isMediaRenderBlock(block) {
	return Boolean(
		block && typeof block === 'object' && mediaBlockKinds().has(String(block.kind ?? ''))
	);
}

function renderBlockAssetLabel(block) {
	const value =
		block?.assetLabel ??
		block?.sourceLabel ??
		block?.label ??
		block?.assetId ??
		block?.id ??
		block?.altText;
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function blockText(block) {
	if (!block || typeof block !== 'object') return [];
	const values = [block.text, block.caption, block.label, block.altText].filter(
		(value) => typeof value === 'string' && value.trim()
	);
	if (Array.isArray(block.keyItems)) {
		values.push(
			...block.keyItems
				.map((item) => item?.text)
				.filter((value) => typeof value === 'string' && value.trim())
		);
	}
	if (Array.isArray(block.rows)) {
		values.push(
			...block.rows.flatMap((row) =>
				(Array.isArray(row) ? row : Object.values(row ?? {})).filter(
					(value) => typeof value === 'string' && value.trim()
				)
			)
		);
	}
	return values;
}

function replaceMediaSummaryBlocksWithFigure(question, label) {
	let replaced = false;
	const updates = {};
	for (const field of ['stemBlocks', 'leadBlocks', 'promptBlocks', 'afterResponseBlocks']) {
		const blocks = question[field] ?? [];
		const nextBlocks = [];
		for (const block of blocks) {
			if (!isReplaceableMediaSummaryBlock(block, label)) {
				nextBlocks.push(block);
				continue;
			}
			if (!replaced) {
				nextBlocks.push({ kind: 'figure', label, assetLabel: label });
				replaced = true;
			}
		}
		if (nextBlocks.length !== blocks.length || nextBlocks.some((block, index) => block !== blocks[index])) {
			updates[field] = nextBlocks;
		}
	}
	if (!Object.keys(updates).length) return question;
	return {
		...question,
		...updates,
		reviewNotes: stripResolvedMediaReviewNotes(question.reviewNotes ?? [])
	};
}

function isReplaceableMediaSummaryBlock(block, label) {
	if (!block || typeof block !== 'object') return false;
	if (['table', 'structured-table'].includes(String(block.kind ?? ''))) return false;
	if (isMediaRenderBlock(block) && assetHasUsableReference(block)) return false;
	if (!blockMentionsLabel(block, label)) return false;
	return ['paragraph', 'key', 'figure-placeholder', 'figure-reference'].includes(
		String(block.kind ?? 'paragraph')
	);
}

function blockMentionsLabel(block, label) {
	const wanted = normalizeAssetKey(label);
	if (!wanted) return false;
	return [
		block?.label,
		block?.assetLabel,
		block?.sourceLabel,
		block?.altText,
		block?.text,
		block?.caption
	].some((value) => normalizeAssetKey(value).includes(wanted));
}

function stripResolvedMediaReviewNotes(notes) {
	return notes.filter(
		(note) =>
			!/fallback (?:full-)?page asset|missing interactive media asset|missing media asset|no separate local asset manifest/i.test(
				String(note ?? '')
			)
	);
}

function clearResolvedMediaModelAnswer({ modelAnswer, response, resolvedByCrop, requiresReview }) {
	if (!modelAnswer || !resolvedByCrop || requiresReview) return modelAnswer;
	if (!['asset-canvas', 'image-label-zones'].includes(response?.kind)) return modelAnswer;
	const reviewNotes = stripResolvedMediaReviewNotes(modelAnswer.reviewNotes ?? []);
	if (modelAnswer.needsHumanReview !== true && reviewNotes.length === (modelAnswer.reviewNotes ?? []).length) {
		return modelAnswer;
	}
	return {
		...modelAnswer,
		needsHumanReview: reviewNotes.length > 0,
		reviewNotes
	};
}

function recomputeExtractionRunReviewState(candidate) {
	const reviewNotes = (candidate.extractionRun?.reviewNotes ?? []).filter(Boolean);
	return {
		...candidate,
		extractionRun: {
			...(candidate.extractionRun ?? {}),
			needsHumanReview: (candidate.questions ?? []).some(questionHasHumanReviewFlag) || reviewNotes.length > 0,
			reviewNotes
		}
	};
}

function questionHasHumanReviewFlag(question) {
	if (question.needsHumanReview) return true;
	if (question.modelAnswer?.needsHumanReview) return true;
	if ((question.assets ?? []).some((asset) => asset?.needsHumanReview)) return true;
	if ((question.markChecklist ?? []).some((item) => item?.needsHumanReview)) return true;
	return false;
}

function pageNumberForMissingAsset(question, label) {
	const text = [
		question.contextText,
		question.promptText,
		question.selfContainedPromptText,
		...(question.reviewNotes ?? [])
	]
		.filter(Boolean)
		.join('\n')
		.toLowerCase();
	const labelText = String(label ?? '').toLowerCase();
	const explicitPage = explicitPageReference(text, labelText);
	if (explicitPage) return explicitPage;
	const referencesPreviousPage =
		/\bprevious page\b|\bpreceding page\b/.test(text) &&
		(!labelText || text.includes(labelText) || /\bfigure|graph|diagram|image\b/.test(labelText));
	if (referencesPreviousPage && Number(question.pageStart) > 1)
		return Number(question.pageStart) - 1;
	if (
		Number(question.pageEnd) > Number(question.pageStart) &&
		/\b(?:figure|fig|graph|diagram|image|grid)\b/.test(labelText)
	) {
		return Number(question.pageEnd);
	}
	return Number(question.pageStart ?? question.pageEnd ?? 1);
}

function explicitPageReference(text, labelText) {
	const escapedLabel = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	if (escapedLabel) {
		const labelMatch = text.match(
			new RegExp(`${escapedLabel}[\\s\\S]{0,80}\\bon page\\s+(\\d+)`, 'i')
		);
		if (labelMatch) return Number(labelMatch[1]);
	}
	const nearbyMatch = text.match(
		/\b(?:figure|fig\.?|graph|diagram|image)\s+\d+[a-z]?[\s\S]{0,80}\bon page\s+(\d+)/i
	);
	return nearbyMatch ? Number(nearbyMatch[1]) : null;
}

function titleCase(value) {
	const text = String(value ?? '').toLowerCase();
	return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function responseAssetLabels(question) {
	const response = question.response;
	if (!response || typeof response !== 'object') return [];
	if (!['asset-canvas', 'image-label-zones'].includes(response.kind)) return [];
	const primary = [
		response.assetLabel,
		response.assetId,
		response.sourceLabel,
		...(Array.isArray(response.assets) ? response.assets : [])
	]
		.filter((value) => typeof value === 'string' && value.trim())
		.map((value) => value.trim());
	const explicit = primary.length
		? primary
		: [response.label]
				.filter((value) => typeof value === 'string' && value.trim())
				.map((value) => value.trim());
	if (explicit.length > 0) return explicit;
	const inferred = inferInteractiveAssetLabel(question);
	return inferred ? [inferred] : [];
}

function ensureResponseAssetLabel(response, fallbackLabel) {
	if (!response || typeof response !== 'object' || !fallbackLabel) return response;
	if (!['asset-canvas', 'image-label-zones'].includes(response.kind)) return response;
	if (response.assetLabel || response.label || response.assetId || response.sourceLabel)
		return response;
	return { ...response, assetLabel: fallbackLabel };
}

function inferInteractiveAssetLabel(question) {
	const sourceText = [
		question.promptText,
		question.selfContainedPromptText,
		question.contextText,
		question.response?.instructions
	]
		.filter(Boolean)
		.join('\n');
	const sourceLabelMatch = sourceText.match(
		/\b(?:Figure|Fig\.?|Table|Graph|Diagram|Image)\s+\d+[A-Za-z]?\b/i
	);
	if (sourceLabelMatch) return sourceLabelMatch[0].replace(/^Fig\.?/i, 'Figure');
	const labels = [
		...(question.assets ?? []).map(
			(asset) => asset?.sourceLabel ?? asset?.label ?? asset?.assetLabel
		),
		...[
			...(question.stemBlocks ?? []),
			...(question.leadBlocks ?? []),
			...(question.promptBlocks ?? []),
			...(question.afterResponseBlocks ?? [])
		].map((block) => block?.label ?? block?.sourceLabel ?? block?.assetLabel ?? block?.assetId)
	]
		.filter((value) => typeof value === 'string' && value.trim())
		.map((value) => value.trim());
	const figureLabel = labels.find((label) => /\b(figure|graph|diagram|image)\b/i.test(label));
	if (figureLabel) return figureLabel;
	return labels.length === 1 ? labels[0] : null;
}

function normalizeAssetKey(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function assetMatchesLabel(asset, label) {
	const wanted = normalizeAssetKey(label);
	if (!wanted) return false;
	return [
		asset?.sourceLabel,
		asset?.label,
		asset?.assetLabel,
		asset?.altText,
		asset?.id,
		asset?.assetId,
		asset?.filePath,
		asset?.publicPath
	].some((value) => {
		const normalized = normalizeAssetKey(value);
		return (
			normalized.length > 0 &&
			(normalized === wanted || normalized.includes(wanted) || wanted.includes(normalized))
		);
	});
}

function questionHasStructuredTableSurface(question, label) {
	if (!/\btable\b/i.test(String(label ?? ''))) return false;
	return ['stemBlocks', 'leadBlocks', 'promptBlocks', 'afterResponseBlocks'].some((field) =>
		(question[field] ?? []).some((block) => structuredTableBlockMatches(block, label))
	);
}

function structuredTableBlockMatches(block, label) {
	if (!block || typeof block !== 'object') return false;
	if (!['table', 'structured-table'].includes(String(block.kind ?? ''))) return false;
	if (!assetMatchesLabel(block, label)) return false;
	const rows = Array.isArray(block.rows) ? block.rows : [];
	const hasRows = rows.some(
		(row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim())
	);
	const hasColumns = Array.isArray(block.columns)
		? block.columns.some((column) => String(column ?? '').trim())
		: false;
	return hasRows && hasColumns;
}

function assetHasUsableReference(asset) {
	return Boolean(
		asset?.filePath ||
		asset?.sourcePath ||
		asset?.localPath ||
		asset?.path ||
		asset?.publicPath ||
		asset?.r2Key
	);
}

function extractedAssetDir(outputPath, sourceDocumentId) {
	const subjectDir = path.dirname(outputPath);
	const extractionRoot = path.dirname(subjectDir);
	return path.join(extractionRoot, 'assets/question-papers', sourceDocumentId);
}

function renderedPageNumber(filePath) {
	const match = path.basename(filePath).match(/-(\d+)\.png$/);
	return match ? Number(match[1]) : null;
}

function relativePath(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function parsePaperFilename(fileName) {
	const match = fileName.match(/^AQA-(8464P[12]H)-QP-([A-Z]{3}\d{2})\.PDF$/i);
	if (!match) return null;
	const componentCode = match[1].toUpperCase();
	const seriesCode = match[2].toUpperCase();
	return {
		componentCode,
		seriesCode,
		sourceDocumentId: `aqa-${componentCode.toLowerCase()}-qp-${seriesCode.toLowerCase()}`
	};
}

function parseSeries(seriesCode) {
	const monthCode = seriesCode.slice(0, 3).toUpperCase();
	const year = 2000 + Number(seriesCode.slice(3));
	const month = monthCode === 'JUN' ? 'June' : monthCode === 'NOV' ? 'November' : monthCode;
	return { month, year, series: `${month} ${year}` };
}

function paperLabel(componentCode) {
	return componentCode.includes('P1') ? 'Physics Paper 1' : 'Physics Paper 2';
}

function slugify(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function titleForQuestionPaper(componentCode, series) {
	return `Question paper (Higher): ${paperLabel(componentCode)} - ${series}`;
}

function titleForMarkScheme(componentCode, series) {
	return `Mark scheme (Higher): ${paperLabel(componentCode)} - ${series}`;
}

function discoverAqaPhysicsPapers() {
	const dataRoot = path.join(rootDir, 'data/aqa-combined-science-trilogy-higher');
	const questionPaperDir = path.join(dataRoot, 'question-papers');
	const markSchemeDir = path.join(dataRoot, 'mark-schemes');
	const files = new Set(readdirSync(markSchemeDir));
	return readdirSync(questionPaperDir)
		.sort()
		.map((fileName) => {
			const parsed = parsePaperFilename(fileName);
			if (!parsed) return null;
			const markSchemeFile =
				[
					`AQA-${parsed.componentCode}-MS-${parsed.seriesCode}.PDF`,
					`AQA-${parsed.componentCode}-W-MS-${parsed.seriesCode}.PDF`
				].find((candidate) => files.has(candidate)) ?? null;
			if (!markSchemeFile) return null;
			const { series, year } = parseSeries(parsed.seriesCode);
			return {
				...parsed,
				questionPaperPath: path.join(questionPaperDir, fileName),
				markSchemePath: path.join(markSchemeDir, markSchemeFile),
				markSchemeDocumentId: parsed.sourceDocumentId.replace('-qp-', '-ms-'),
				paper: paperLabel(parsed.componentCode),
				series,
				year
			};
		})
		.filter(Boolean);
}

function discoverAqaSeparateSciencePapers() {
	const dataRoot = path.join(rootDir, 'data/aqa-separate-science-higher');
	const manifestPath = path.join(dataRoot, 'manifest.json');
	if (!existsSync(manifestPath)) {
		throw new Error(
			`Missing AQA Separate Science manifest at ${path.relative(rootDir, manifestPath)}. Run pnpm run download:aqa-separate-science first.`
		);
	}
	const manifest = readJson(manifestPath);
	const questionPaperDir = path.join(dataRoot, 'question-papers');
	const markSchemeDir = path.join(dataRoot, 'mark-schemes');
	const supportingDir = path.join(dataRoot, 'supporting-documents');
	return (manifest.rows ?? []).map((row) => ({
		sourceDocumentId: row.source_document_id,
		markSchemeDocumentId: row.mark_scheme_document_id,
		componentCode: row.component,
		questionPaperPath: path.join(questionPaperDir, row.question_paper.filename),
		markSchemePath: path.join(markSchemeDir, row.mark_scheme.filename),
		supportingDocumentPaths: (row.supporting_documents ?? []).map((document) =>
			path.join(supportingDir, document.filename)
		),
		subject: row.subject,
		subjectArea: row.subject_area ?? row.subject,
		paper: row.paper,
		series: row.series,
		year: row.year,
		questionPaperTitle: row.question_paper.title,
		markSchemeTitle: row.mark_scheme.title,
		questionPaperUrl: row.question_paper.url,
		markSchemeUrl: row.mark_scheme.url,
		supportingDocuments: (row.supporting_documents ?? []).map((document) => ({
			docType: document.filename.includes('-INS-') ? 'insert' : 'supporting_document',
			title: document.title,
			sourceUrl: document.url
		}))
	}));
}

function assetManifest(sourceDocumentId, outputRoot = null) {
	const candidateDirs = [
		path.join(
			rootDir,
			'data/aqa-combined-science-trilogy-higher/assets/question-papers',
			sourceDocumentId
		),
		path.join(
			rootDir,
			'data/vision-extracted/aqa-combined-science-trilogy-higher/assets/question-papers',
			sourceDocumentId
		),
		path.join(
			rootDir,
			'data/vision-extracted/aqa-separate-science-higher/assets/question-papers',
			sourceDocumentId
		)
	];
	if (outputRoot) {
		candidateDirs.push(path.join(outputRoot, 'assets/question-papers', sourceDocumentId));
		candidateDirs.push(
			path.join(path.dirname(outputRoot), 'assets/question-papers', sourceDocumentId)
		);
	}
	const byPath = new Map();
	for (const dir of candidateDirs) {
		if (!existsSync(dir)) continue;
		for (const fileName of readdirSync(dir)
			.filter((candidate) => /\.(png|jpe?g|webp)$/i.test(candidate))
			.sort()) {
			const filePath = path.join(dir, fileName);
			byPath.set(filePath, {
				page: pageNumberFromAssetFile(fileName),
				fileName,
				filePath: relativePath(filePath),
				publicPath: `/images/papers/${sourceDocumentId}/${fileName}`,
				r2Key: `images/papers/${sourceDocumentId}/${fileName}`
			});
		}
	}
	return [...byPath.values()].sort((a, b) => (a.page ?? 9999) - (b.page ?? 9999));
}

function pageNumberFromAssetFile(fileName) {
	return (
		Number(fileName.match(/^image-(\d{3})-/i)?.[1] ?? 0) ||
		Number(fileName.match(/^page-(\d{3})-/i)?.[1] ?? 0) ||
		null
	);
}

function compactAssetManifestText(assets) {
	if (!assets.length) return 'No extracted local image assets found for this paper.';
	return assets
		.map(
			(asset) =>
				`page ${asset.page ?? 'unknown'}: ${asset.fileName} -> ${asset.publicPath} (${asset.r2Key})`
		)
		.join('\n');
}
