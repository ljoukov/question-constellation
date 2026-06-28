#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
	blockingIssues,
	DEFAULT_EXTRACTION_MODEL,
	DEFAULT_THINKING_LEVEL,
	deterministicCandidateIssues,
	evaluateCandidate,
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
  --existing-chains=<json-or-md>
  --chunk-pages=6
  --context-pages=2
  --chunk-strategy=parent-question|fixed-pages
  --chunk-concurrency=1
  --extraction-granularity=chunk|question
  --expected-question-count=1
  --repair-attempts=1
  --repair-answer-chains
  --evaluation-mode=extraction|full
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
  --thinking-level=xhigh
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
const dpi = integerArg('dpi', 160, 90);
const chunkPages = integerArg('chunk-pages', 6, 1);
const contextPages = integerArg('context-pages', 2, 0);
const chunkStrategy = stringArg('chunk-strategy', 'parent-question');
if (!['parent-question', 'fixed-pages'].includes(chunkStrategy)) {
	throw new Error('--chunk-strategy must be parent-question or fixed-pages.');
}
const chunkConcurrency = integerArg('chunk-concurrency', 1, 1);
const extractionGranularity = stringArg('extraction-granularity', 'chunk');
if (!['chunk', 'question'].includes(extractionGranularity)) {
	throw new Error('--extraction-granularity must be chunk or question.');
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
		presetInstructions: ''
	});
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
					evaluationMode,
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
		extractionGranularity,
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
	candidate = materializeFallbackResponseAssets(candidate, {
		questionPaperPath,
		sourceDocumentId,
		outputPath,
		dpi
	});
	console.error(`[extract-cli] ${sourceDocumentId}: evaluating`);
	let evaluation = await evaluateCandidate({
		candidate,
		fixture: judgeFixturePath ? readJson(judgeFixturePath) : null,
		judgeModel,
		thinkingLevel,
		runJudge,
		evaluationMode
	});
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
		evaluation = await evaluateCandidate({
			candidate,
			fixture: judgeFixturePath ? readJson(judgeFixturePath) : null,
			judgeModel,
			thinkingLevel,
			runJudge,
			evaluationMode
		});
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
				evaluationMode,
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

function materializeFallbackResponseAssets(
	candidate,
	{ questionPaperPath, sourceDocumentId, outputPath, dpi }
) {
	const missing = [];
	for (const question of candidate.questions ?? []) {
		const labels = responseAssetLabels(question);
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
	const pageRenderDir = path.join(rootDir, 'tmp/llm-extraction-fallback-assets', sourceDocumentId);
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
	const questions = candidate.questions.map((question) => {
		const questionMissing = missing.filter(
			(item) => item.question.sourceQuestionRef === question.sourceQuestionRef
		);
		if (!questionMissing.length) return question;
		const assets = [...(question.assets ?? [])];
		for (const { label } of questionMissing) {
			const pageNumber = question.pageStart ?? question.pageEnd ?? 1;
			const renderedPage = renderedByPage.get(pageNumber);
			if (!renderedPage) continue;
			const fileName = `page-${String(pageNumber).padStart(3, '0')}-${slugify(question.sourceQuestionRef)}-${slugify(label) || 'asset'}.png`;
			const destPath = path.join(assetDir, fileName);
			copyFileSync(renderedPage, destPath);
			assets.push({
				sourceLabel: label,
				assetType: 'image',
				role: 'response-canvas',
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
		return {
			...question,
			response: ensureResponseAssetLabel(question.response, questionMissing[0]?.label),
			assets,
			needsHumanReview: true,
			reviewNotes: [
				...(question.reviewNotes ?? []),
				'Generated fallback page image for missing interactive media asset.'
			]
		};
	});
	console.error(
		`[extract-cli] ${sourceDocumentId}: materialized ${missing.length} fallback response asset(s)`
	);
	return { ...candidate, questions };
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
