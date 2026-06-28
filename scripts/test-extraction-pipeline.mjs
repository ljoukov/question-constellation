#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const packagePath = path.join(rootDir, 'package.json');

function fail(message, details = null) {
	console.error(JSON.stringify({ status: 'failed', message, details }, null, 2));
	process.exit(1);
}

function readText(filePath) {
	if (!existsSync(filePath)) fail(`Missing file: ${path.relative(rootDir, filePath)}`);
	return readFileSync(filePath, 'utf8');
}

function requireIncludes(text, values, label) {
	const missing = values.filter((value) => !text.includes(value));
	if (missing.length > 0) fail(`${label} is missing required text.`, missing);
}

function runNodeScript(scriptPath, args = []) {
	return execFileSync(process.execPath, [scriptPath, ...args], {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
}

function runNodeCheck(scriptPath) {
	return execFileSync(process.execPath, ['--check', scriptPath], {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
}

const packageJson = JSON.parse(readText(packagePath));
const extractionSpec = readText(path.join(rootDir, 'docs/extraction-spec.md'));
const pipelineSource = readText(path.join(rootDir, 'scripts/lib/llm-extraction-pipeline.mjs'));
const cliSource = readText(path.join(rootDir, 'scripts/extract-paper-llm.mjs'));
const batchSource = readText(path.join(rootDir, 'scripts/extract-aqa-separate-science-batch.mjs'));
const downloaderSource = readText(path.join(rootDir, 'scripts/download-aqa-separate-science.mjs'));
const importSource = readText(path.join(rootDir, 'scripts/import-physics-vision.mjs'));
const repairAssetSource = readText(
	path.join(rootDir, 'scripts/repair-extraction-response-assets.mjs')
);
const repairChainSpecificitySource = readText(
	path.join(rootDir, 'scripts/repair-answer-chain-specificity.mjs')
);
const prepareImportReadySource = readText(
	path.join(rootDir, 'scripts/prepare-import-ready-extraction.mjs')
);
const existingChainContextSource = readText(
	path.join(rootDir, 'scripts/build-existing-chain-context.mjs')
);
const reconcileAnswerChainsSource = readText(
	path.join(rootDir, 'scripts/reconcile-answer-chains.mjs')
);
const chainSpecificityAuditSource = readText(
	path.join(rootDir, 'scripts/audit-answer-chain-specificity.mjs')
);
const questionTypesSource = readText(path.join(rootDir, 'src/lib/experiments/questions/types.ts'));
const questionDataSource = readText(path.join(rootDir, 'src/lib/server/questionExperimentData.ts'));
const questionGradingSource = readText(
	path.join(rootDir, 'src/lib/server/questionExperimentGrading.ts')
);

for (const filePath of [
	'docs/product-methodology.md',
	'docs/product-flows.md',
	'docs/extraction-spec.md',
	'scripts/lib/llm-extraction-pipeline.mjs',
	'scripts/download-aqa-separate-science.mjs',
	'scripts/extract-aqa-separate-science-batch.mjs',
	'scripts/extract-paper-llm.mjs',
	'scripts/summarize-llm-extraction-logs.mjs',
	'scripts/import-physics-vision.mjs',
	'scripts/eval-extraction-pipeline-llm.mjs',
	'scripts/audit-extracted-question-data.mjs',
	'scripts/evaluate-question-solvability.mjs',
	'scripts/build-import-ready-extracted-subset.mjs',
	'scripts/build-existing-chain-context.mjs',
	'scripts/reconcile-answer-chains.mjs',
	'scripts/prepare-import-ready-extraction.mjs',
	'scripts/repair-extracted-question-data.mjs',
	'scripts/repair-answer-chain-specificity.mjs',
	'scripts/repair-extraction-response-assets.mjs',
	'scripts/test-answer-chain-golden.mjs',
	'scripts/audit-answer-chain-specificity.mjs',
	'tests/golden/answer-chain-quality.json',
	'tests/golden/extraction-pipeline-spring-energy.json'
]) {
	if (!existsSync(path.join(rootDir, filePath)))
		fail(`Pipeline references missing file: ${filePath}`);
}

requireIncludes(
	extractionSpec,
	[
		'node scripts/eval-extraction-pipeline-llm.mjs --run-llm',
		'pnpm run eval:question-solvability',
		'pnpm run repair:extracted-data',
		'pnpm run repair:answer-chain-specificity',
		'pnpm run repair:extraction-response-assets',
		'node scripts/extract-paper-llm.mjs',
		'pnpm run download:aqa-separate-science',
		'pnpm run extract:aqa-separate-science:batch',
		'--concurrency',
		'--force-chunks',
		'@ljoukov/llm',
		'tmp/llm-extraction-logs',
		'pnpm run summarize:llm-extraction-logs',
		'pnpm run audit:extracted-data',
		'pnpm run audit:current-exported-data',
		'pnpm run build:import-ready-extracted-subset',
		'pnpm run build:existing-chain-context',
		'pnpm run reconcile:answer-chains',
		'pnpm run prepare:import-ready-extraction',
		'pnpm run audit:answer-chain-specificity',
		'--import-raw-output',
		'--fail-on-warnings',
		'--extraction-granularity=chunk',
		'--concurrency=4',
		'--repair-text-references',
		'--run-id',
		'--paper-attempts',
		'costUsd',
		'pdfinfo',
		'pdftoppm',
		'--mark-scheme-image-mode=all',
		'learner-facing solvability judge',
		'reusable reasoning or method pattern'
	],
	'Extraction spec'
);

requireIncludes(
	pipelineSource,
	[
		'export async function extractCandidateFromPdfPair',
		'export async function extractFullPaperFromPdfSet',
		'export async function evaluateCandidate',
		'export async function runGoldenPdfEval',
		'export async function judgeQuestionSolvability',
		'export async function judgeExtractionAgainstRubric',
		'export function buildLearnerVisibleQuestionContext',
		'export const SolvabilityJudgeSchema',
		'export async function repairFullPaperAnswerChains',
		'export const FullPaperExtractionSchema',
		'export const LlmFullPaperExtractionSchema',
		'export const LlmCompactFullPaperExtractionSchema',
		'export async function judgeCandidateAgainstRubric',
		'export function pdfPageCount',
		'export function pdfText',
		'chatgpt-gpt-5.5',
		'xhigh',
		'appendLlmLog',
		'llm_call_started',
		'llm_call_event',
		'llm_call_completed',
		'clear needsHumanReview only when every previous review note is resolved',
		'Do not clear review-marked fallback full-page assets',
		'summarizeLlmInput',
		'EXTRACTION_LLM_MAX_ATTEMPTS ?? 3',
		'Return exactly the requested JSON object shape',
		'summarizeLlmError',
		'answerChainSpecificityIssues',
		'text-only answer-chain grouping and reconciliation phase',
		'Some current chains may be placeholders with id null',
		'expandCompactFullPaperExtraction',
		'normalizeQuestionResponseForExtraction',
		'unorderedGroups',
		'Source question-paper text for selected pages',
		'For calculation questions with visible working lines',
		'Do not use asset-canvas for a table that can be represented structurally',
		'LOOKAHEAD QUESTION PAPER PAGE',
		'PRIOR CONTEXT QUESTION PAPER PAGE',
		'priorContextPages',
		'contextPages = 2',
		"extractionGranularity = 'chunk'",
		"extractionGranularity === 'question'",
		'Do not start or extract sibling subquestions',
		'If an atomic subquestion number/prompt first appears on a lookahead page, omit it from this chunk',
		'withdrawn questions, replacement notices, statistics-only rows'
	],
	'Pipeline library'
);

requireIncludes(
	cliSource,
	[
		'--question-paper',
		'--mark-scheme',
		'--source-document-id',
		'--output',
		'--preset=aqa-physics',
		'--preset=aqa-separate-science',
		'--supporting-document',
		'--existing-chains',
		'--context-pages=2',
		'--chunk-concurrency=1',
		'--extraction-granularity=chunk|question',
		'--mark-scheme-image-mode',
		'--repair-attempts',
		'--repair-answer-chains',
		'--evaluation-mode=extraction|full',
		'--repair-batch-size',
		'--llm-timeout-ms',
		'--llm-max-attempts',
		'--llm-max-attempts=3',
		'--llm-max-calls=12',
		'--skip-judge',
		'process.env.EXTRACTION_RUN_ID = runId',
		"!['asset-canvas', 'image-label-zones'].includes(response.kind)",
		'extractFullPaperFromPdfSet',
		'repairFullPaperQuestionQuality',
		'questionHumanReviewRefs',
		'repair-v2-'
	],
	'Pipeline CLI'
);

requireIncludes(
	batchSource,
	[
		'concurrency',
		'processSelectedPapers',
		'Promise.all',
		'--thinking-level=${thinkingLevel}',
		"integerArg('llm-timeout-ms', 600000, 1)",
		"integerArg('llm-max-attempts', 3, 1)",
		"integerArg('paper-attempts', 2, 1)",
		"integerArg('chunk-pages', 6, 1)",
		"integerArg('chunk-concurrency', 2, 1)",
		'--chunk-concurrency=${chunkConcurrency}',
		'--run-id=aqa-separate-science-${paper.sourceDocumentId}',
		"stringArg('extraction-granularity', 'chunk')",
		'--extraction-granularity=${extractionGranularity}',
		"integerArg('repair-batch-size', 4, 1)",
		'--repair-answer-chains',
		"const evaluationMode = stringArg('evaluation-mode', 'extraction')",
		'--evaluation-mode=${evaluationMode}',
		'--llm-max-calls=${llmMaxCalls}',
		"integerArg('judge-batch-size', 4, 1)",
		"stringArg('judge-mode', 'paper')",
		"stringArg('solvability-mode', 'none')",
		'runExtractionCommandWithRetry',
		'solvabilityMode',
		'evaluateSolvabilityForPaper',
		'scripts/prepare-import-ready-extraction.mjs',
		'importRawOutput',
		'importReadyOutputRoot',
		'repairPreJudgeValidationIssues',
		'humanReviewFindings',
		'asset_needs_human_review',
		'validation.blockingIssues.length > 0',
		"status: 'running'",
		'completedBatches'
	],
	'AQA Separate Science batch extractor'
);

requireIncludes(
	downloaderSource,
	[
		'GCSE Biology 8461',
		'chemistry-8462/assessment-resources',
		'physics-8463/assessment-resources',
		'data/aqa-separate-science-higher',
		'sha1 mismatch'
	],
	'AQA Separate Science downloader'
);

requireIncludes(
	importSource,
	[
		'input-root',
		'--recursive',
		'--replace-all-subject',
		'subjectAreaForPaper',
		'chainPrefixForSubject',
		'deterministicCandidateIssues',
		'needsHumanReview',
		'unorderedGroupsArray'
	],
	'Vision importer'
);

requireIncludes(
	questionTypesSource,
	['unorderedGroups?: Array<', 'targetIds: string[]', 'answers: string[]'],
	'Question response types'
);

requireIncludes(
	questionDataSource,
	['equationBlankUnorderedGroups', 'unorderedGroups: equationBlankUnorderedGroups'],
	'Question renderer data parser'
);

requireIncludes(
	questionGradingSource,
	[
		'unorderedEquationBlankItems',
		'equationBlankSubmittedAnswer',
		'without reusing an answer',
		'unorderedGroups: equationBlankUnorderedGroups'
	],
	'Question deterministic grading'
);

requireIncludes(
	repairAssetSource,
	[
		"!['asset-canvas', 'image-label-zones'].includes(response.kind)",
		"role: isResponseAsset ? 'response-canvas' : 'question-context'",
		'repairTextReferences'
	],
	'Response asset repair script'
);

requireIncludes(
	repairChainSpecificitySource,
	[
		'repairFullPaperAnswerChains',
		'chain_numeric_substitution',
		'chain_prompt_specific_number',
		'chain_exact_fixed_answer_text',
		'extractionPlaceholderChain',
		'--concurrency',
		'--fail-on-blocking'
	],
	'Answer-chain specificity repair script'
);

requireIncludes(
	prepareImportReadySource,
	[
		'scripts/build-import-ready-extracted-subset.mjs',
		'scripts/audit-extracted-question-data.mjs',
		'--fail-on-warnings',
		'scripts/import-physics-vision.mjs',
		'importMode',
		'--run-solvability'
	],
	'Import-ready extraction preparation script'
);

requireIncludes(
	existingChainContextSource,
	[
		'answerChains',
		'exampleQuestionRefs',
		'needs_human_review',
		'questionCount',
		'max-question-refs'
	],
	'Existing chain context builder'
);

requireIncludes(
	reconcileAnswerChainsSource,
	[
		'repairFullPaperAnswerChains',
		'evaluateCandidate',
		'chainResolution',
		'--existing-chains',
		'--skip-judge',
		'--fail-on-blocking',
		'answer_chain_missing_stable_id',
		'tmp/answer-chain-reconcile-summary.json',
		'refsFromJudge'
	],
	'Answer-chain reconciliation script'
);

requireIncludes(
	chainSpecificityAuditSource,
	[
		'input-root',
		'semantic-root',
		'--d1',
		'--mark-review',
		'answer_chains',
		'question_answer_chains',
		"status = 'draft'",
		'chain contains prompt-specific numeric solution text'
	],
	'Answer-chain specificity audit'
);

for (const scriptName of [
	'download:aqa-separate-science',
	'extract:aqa-separate-science:batch',
	'extract:physics-vision',
	'extract:aqa-separate-science',
	'extract:paper-llm',
	'summarize:llm-extraction-logs',
	'eval:question-solvability',
	'audit:extracted-data',
	'audit:current-exported-data',
	'audit:answer-chain-specificity',
	'build:import-ready-extracted-subset',
	'build:existing-chain-context',
	'reconcile:answer-chains',
	'prepare:import-ready-extraction',
	'repair:extracted-data',
	'repair:answer-chain-specificity',
	'repair:extraction-response-assets',
	'import:vision',
	'import:aqa-separate-science',
	'eval:extraction-pipeline-llm',
	'test:chain-golden',
	'test:extraction-pipeline'
]) {
	if (!packageJson.scripts?.[scriptName]) fail(`Missing package script: ${scriptName}`);
}

for (const obsoleteScriptName of ['extract:aqa', 'repair:physics-vision-chains']) {
	if (packageJson.scripts?.[obsoleteScriptName]) {
		fail(`Obsolete extraction script is still exposed in package.json: ${obsoleteScriptName}`);
	}
}

for (const obsoletePath of [
	'scripts/extract-aqa-data.mjs',
	'scripts/repair-physics-vision-chains.mjs'
]) {
	if (existsSync(path.join(rootDir, obsoletePath))) {
		fail(`Obsolete extraction path still exists: ${obsoletePath}`);
	}
}

const uploadR2Source = readText(path.join(rootDir, 'scripts/upload-r2-images.mjs'));
requireIncludes(
	uploadR2Source,
	[
		'--asset-root=',
		'--referenced-baseline=',
		'data/vision-extracted/aqa-separate-science-higher/assets/question-papers',
		'all_local_assets'
	],
	'R2 asset uploader'
);

const goldenOutput = JSON.parse(runNodeScript('scripts/test-answer-chain-golden.mjs'));
if (goldenOutput.status !== 'passed' || goldenOutput.cases < 4) {
	fail('Golden chain test did not pass through the pipeline contract test.', goldenOutput);
}

for (const scriptPath of [
	'scripts/lib/llm-extraction-pipeline.mjs',
	'scripts/download-aqa-separate-science.mjs',
	'scripts/extract-aqa-separate-science-batch.mjs',
	'scripts/extract-paper-llm.mjs',
	'scripts/summarize-llm-extraction-logs.mjs',
	'scripts/import-physics-vision.mjs',
	'scripts/audit-extracted-question-data.mjs',
	'scripts/evaluate-question-solvability.mjs',
	'scripts/build-import-ready-extracted-subset.mjs',
	'scripts/build-existing-chain-context.mjs',
	'scripts/reconcile-answer-chains.mjs',
	'scripts/prepare-import-ready-extraction.mjs',
	'scripts/repair-extracted-question-data.mjs',
	'scripts/repair-extraction-response-assets.mjs',
	'scripts/eval-extraction-pipeline-llm.mjs'
]) {
	runNodeCheck(scriptPath);
}

const fakeLogDir = path.join(rootDir, 'tmp/test-llm-extraction-logs');
mkdirSync(fakeLogDir, { recursive: true });
writeFileSync(
	path.join(fakeLogDir, 'sample.jsonl'),
	[
		{
			timestamp: '2026-06-27T00:00:00.000Z',
			runId: 'test-run',
			type: 'llm_call_started',
			callId: '0001-test',
			label: 'extract-full-paper:test-paper:01.1',
			model: 'chatgpt-gpt-5.5'
		},
		{
			timestamp: '2026-06-27T00:00:02.000Z',
			runId: 'test-run',
			type: 'llm_call_started',
			callId: '0002-active',
			label: 'judge-rubric:test-paper',
			model: 'chatgpt-gpt-5.5'
		},
		{
			timestamp: '2026-06-27T00:00:01.000Z',
			runId: 'test-run',
			type: 'llm_call_completed',
			callId: '0001-test',
			label: 'extract-full-paper:test-paper:01.1',
			ok: true,
			model: 'chatgpt-gpt-5.5',
			usage: { promptTokens: 10, responseTokens: 5, thinkingTokens: 3, totalTokens: 18 },
			costUsd: 0.012345,
			thoughtChars: 20,
			outputTextChars: 40
		}
	]
		.map((record) => JSON.stringify(record))
		.join('\n') + '\n'
);
const logSummary = JSON.parse(
	runNodeScript('scripts/summarize-llm-extraction-logs.mjs', [
		`--log-dir=${fakeLogDir}`,
		'--run-id=test-run'
	])
);
if (
	logSummary.status !== 'running' ||
	logSummary.completed !== 1 ||
	logSummary.activeCallIds.length !== 1 ||
	logSummary.costUsd !== 0.012345 ||
	logSummary.usage.totalTokens !== 18 ||
	logSummary.byLabelPrefix['extract-full-paper']?.completed !== 1
) {
	fail('LLM extraction log summarizer did not aggregate sample JSONL correctly.', logSummary);
}

const chainContextDir = path.join(rootDir, 'tmp/test-existing-chain-context');
mkdirSync(chainContextDir, { recursive: true });
const chainContextInput = path.join(chainContextDir, 'paper.json');
const chainContextOutput = path.join(chainContextDir, 'context.json');
const reusableChain = {
	id: 'bio-chain-process-cause-effect',
	title: 'Explain a process cause and effect',
	canonicalChainText:
		'Identify the process, connect the cause to the effect, and state the outcome.',
	summary: 'Reusable cause-effect explanation chain.',
	broadTopic: 'Biology',
	chainFamilyId: 'process-cause-effect',
	steps: [
		{
			stepText: 'Connect the cause to the process and outcome.',
			stepRole: 'link',
			explanation: null,
			commonOmission: null,
			markSchemeItemIndexes: [0]
		}
	],
	confidence: 0.9,
	needsHumanReview: false,
	reviewNotes: []
};
writeFileSync(
	chainContextInput,
	JSON.stringify(
		{
			sourceDocument: { id: 'test-paper', subjectArea: 'Biology' },
			questions: [
				{
					sourceQuestionRef: '01.1',
					marks: 2,
					topicPath: ['Biology', 'Cells'],
					answerChain: reusableChain,
					needsHumanReview: false
				},
				{
					sourceQuestionRef: '01.2',
					marks: 3,
					topicPath: ['Biology', 'Cells'],
					answerChain: reusableChain,
					needsHumanReview: false
				},
				{
					sourceQuestionRef: '01.3',
					marks: 1,
					answerChain: {
						...reusableChain,
						id: 'bio-chain-review-only',
						needsHumanReview: true
					},
					needsHumanReview: false
				}
			]
		},
		null,
		2
	)
);
const chainContextSummary = JSON.parse(
	runNodeScript('scripts/build-existing-chain-context.mjs', [
		`--input=${chainContextInput}`,
		`--output=${chainContextOutput}`
	])
);
const chainContext = JSON.parse(readText(chainContextOutput));
if (
	chainContextSummary.answerChains !== 1 ||
	chainContext.answerChains.length !== 1 ||
	chainContext.answerChains[0].questionCount !== 2 ||
	chainContext.answerChains[0].exampleQuestionRefs.length !== 2 ||
	chainContext.skipped.length !== 1
) {
	fail('Existing chain context builder did not dedupe chains or skip review-marked chains.', {
		chainContextSummary,
		chainContext
	});
}

const pipelineModule = await import(
	pathToFileURL(path.join(rootDir, 'scripts/lib/llm-extraction-pipeline.mjs')).href
);
for (const exportName of [
	'extractCandidateFromPdfPair',
	'extractCandidateFromImages',
	'extractFullPaperFromPdfSet',
	'evaluateCandidate',
	'runGoldenPdfEval',
	'expandCompactFullPaperExtraction',
	'repairCandidateAnswerChains',
	'repairFullPaperAnswerChains',
	'repairFullPaperQuestionQuality',
	'sanitizeAnswerChainEvidenceIndexes',
	'buildLearnerVisibleQuestionContext',
	'chunkImages',
	'mergeFullPaperChunks',
	'judgeQuestionSolvability',
	'questionRefsFromText',
	'markSchemeTextExcerptForRefs',
	'normalizeRepairEnvelope',
	'judgeCandidateAgainstRubric',
	'pdfText'
]) {
	if (typeof pipelineModule[exportName] !== 'function') {
		fail(`Missing library export: ${exportName}`);
	}
}

const contextWindowChunks = pipelineModule.chunkImages(
	[
		'/tmp/question-paper-001.png',
		'/tmp/question-paper-002.png',
		'/tmp/question-paper-003.png',
		'/tmp/question-paper-004.png',
		'/tmp/question-paper-005.png'
	],
	2,
	1
);
if (
	contextWindowChunks.length !== 3 ||
	contextWindowChunks[0].priorContextPages.length !== 0 ||
	contextWindowChunks[0].corePages.join(',') !== '1,2' ||
	contextWindowChunks[0].lookaheadPages.join(',') !== '3' ||
	contextWindowChunks[1].priorContextPages.join(',') !== '2' ||
	contextWindowChunks[1].corePages.join(',') !== '3,4' ||
	contextWindowChunks[1].lookaheadPages.join(',') !== '5'
) {
	fail('Chunking did not include prior context, core, and lookahead pages as expected.', {
		contextWindowChunks
	});
}

const mergedChunkReviewState = pipelineModule.mergeFullPaperChunks([
	{
		extractionRun: {
			agentVersion: 'test',
			needsHumanReview: true,
			reviewNotes: [
				'Chunk 1 extracted only atomic marked questions whose prompt begins on core pages; 02.1 begins on lookahead-only page 7.'
			]
		},
		sourceDocument: { id: 'test-paper' },
		questions: []
	},
	{
		extractionRun: { agentVersion: 'test', needsHumanReview: false, reviewNotes: [] },
		sourceDocument: { id: 'test-paper' },
		questions: [
			{
				sourceQuestionRef: '02.1',
				displayOrder: 1,
				extractionConfidence: 0.9,
				response: { kind: 'lines' },
				assets: [],
				markChecklist: [],
				modelAnswer: { answerText: 'Use the supplied context.', needsHumanReview: false },
				answerChain: { id: 'test-chain', needsHumanReview: false }
			}
		]
	}
]);
if (
	mergedChunkReviewState.extractionRun.needsHumanReview ||
	mergedChunkReviewState.extractionRun.reviewNotes.length !== 0
) {
	fail('Chunk-window review notes survived full-paper merge as paper-level blockers.', {
		extractionRun: mergedChunkReviewState.extractionRun
	});
}

const numericTitleIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			commandWord: 'Calculate',
			response: { kind: 'lines' },
			markSchemeItems: [{ itemType: 'mark', text: 'Use the correct equation.' }],
			answerChain: {
				id: 'physics-chain-calculate-3-2-j',
				title: 'Calculate 3.2 J',
				canonicalChainText: 'Select the correct equation and calculate the energy.',
				summary: 'Use a reusable calculation method.',
				steps: [
					{
						stepText: 'Use the correct equation.',
						stepRole: 'calculation',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});

const parsedRefs = pipelineModule.questionRefsFromText(
	'0 1 . 1 Complete\n01.2 Describe\n10.12 Explain\n25.0\n23.50 kg'
);
if (parsedRefs.join(',') !== '01.1,01.2,10.12') {
	fail('questionRefsFromText did not parse spaced and compact question refs.', parsedRefs);
}
const normalizedRepairEnvelope = pipelineModule.normalizeRepairEnvelope({
	'02.3': {
		answerChain: {
			id: 'chem-chain-recall-comparative-property-differences',
			title: 'Recall and state comparative property differences'
		}
	}
});
if (
	!Array.isArray(normalizedRepairEnvelope.repairs) ||
	normalizedRepairEnvelope.repairs[0]?.sourceQuestionRef !== '02.3' ||
	normalizedRepairEnvelope.repairs[0]?.answerChain?.title !==
		'Recall and state comparative property differences'
) {
	fail(
		'normalizeRepairEnvelope did not accept sourceQuestionRef-keyed repair JSON.',
		normalizedRepairEnvelope
	);
}
const compactAliasExpansion = pipelineModule.expandCompactFullPaperExtraction({
	value: {
		questions: [
			{
				sourceQuestionRef: '09.5',
				promptText: 'Calculate the concentration.',
				marks: 6,
				markSchemeItems: [{ mark: 1, criterion: 'Calculate the amount of sulfuric acid.' }],
				markChecklist: ['Calculate the amount of sulfuric acid.'],
				modelAnswer: 'Use concentration times volume to calculate moles.'
			}
		]
	},
	sourceDocumentId: 'aqa-84621h-qp-jun19',
	markSchemeDocumentId: 'aqa-84621h-ms-jun19',
	questionPaper: { title: 'Question paper', pageCount: 32 },
	markScheme: { title: 'Mark scheme', pageCount: 26 },
	chunk: { corePages: [32] }
});
if (
	compactAliasExpansion.questions[0]?.markSchemeItems[0]?.text !==
		'Calculate the amount of sulfuric acid.' ||
	compactAliasExpansion.questions[0]?.markSchemeItems[0]?.marks !== 1 ||
	compactAliasExpansion.questions[0]?.markChecklist[0]?.text !==
		'Calculate the amount of sulfuric acid.' ||
	compactAliasExpansion.questions[0]?.modelAnswer?.answerText !==
		'Use concentration times volume to calculate moles.'
) {
	fail('Compact extraction alias normalization failed.', compactAliasExpansion.questions[0]);
}
const markSchemeExcerpt = pipelineModule.markSchemeTextExcerptForRefs(
	['header', '01.1 first answer', 'nearby guidance', '02.1 second answer'].join('\n'),
	['01.1'],
	2
);
if (
	!markSchemeExcerpt.includes('01.1 first answer') ||
	markSchemeExcerpt.includes('02.1 second answer')
) {
	fail('markSchemeTextExcerptForRefs did not isolate nearby mark-scheme rows.');
}
if (
	!numericTitleIssues.some((finding) =>
		finding.issues.some(
			(issue) =>
				issue.severity === 'error' &&
				issue.code === 'chain_prompt_specific_number' &&
				['id', 'title'].includes(issue.field)
		)
	)
) {
	fail('Deterministic checks did not flag prompt-specific numbers in chain id/title.');
}

const withdrawnStatisticsIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '06.2',
			commandWord: null,
			marks: 1,
			response: { kind: 'none' },
			markSchemeItems: [
				{
					itemType: 'withdrawal-note',
					text: 'Question 6 was withdrawn and no replacement question was provided.',
					marks: null
				},
				{
					itemType: 'max-mark-statistic',
					text: 'Mean mark (max mark): 06.2 0.65 (1).',
					marks: 1
				}
			],
			answerChain: {
				id: null,
				title: 'No reusable chain',
				canonicalChainText: 'No chain can be extracted.',
				summary: 'No chain can be extracted.',
				steps: []
			}
		}
	]
});
if (
	!withdrawnStatisticsIssues.some((finding) =>
		finding.issues.some((issue) => issue.code === 'question_withdrawn_or_statistics_only')
	)
) {
	fail('Deterministic checks accepted a withdrawn/statistics-only row as learner-facing.');
}

const missingNormalMediaIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '02.1',
			commandWord: 'Describe',
			marks: 1,
			response: { kind: 'lines' },
			stemBlocks: [{ kind: 'figure', label: 'Figure 1' }],
			leadBlocks: [],
			promptBlocks: [],
			afterResponseBlocks: [],
			assets: [],
			markSchemeItems: [{ itemType: 'mark', text: 'Correct statement.', marks: 1 }],
			modelAnswer: { answerText: 'Correct statement.' },
			answerChain: {
				id: 'bio-chain-use-figure-evidence',
				title: 'Use figure evidence to support a statement',
				canonicalChainText:
					'Use the relevant figure to identify the visible evidence needed by the prompt.',
				summary: 'Use source media evidence before writing the answer.',
				steps: [
					{
						stepText: 'Read the relevant feature from the figure.',
						stepRole: 'evidence',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	!missingNormalMediaIssues.some((finding) =>
		finding.issues.some((issue) => issue.code === 'media_block_missing_asset')
	)
) {
	fail('Deterministic checks did not flag a normal figure block with no concrete asset.');
}

const conditionalAlternativeIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '03.5',
			commandWord: 'Compare',
			marks: 1,
			response: { kind: 'lines' },
			markSchemeItems: [
				{
					itemType: 'conditional-alternative-credit',
					text: 'If neither precise comparison is used, allow a general wall-thickness comparison.',
					marks: 1
				}
			],
			modelAnswer: { answerText: 'A valid general comparison can earn the fallback mark.' },
			answerChain: {
				id: 'bio-chain-conditional-alternative',
				title: 'Use an accepted fallback comparison only when precise points are absent',
				canonicalChainText:
					'When a mark scheme gives a credited fallback route, use it as an alternative route rather than as an extra mark after the precise route.',
				summary:
					'Treat credited fallback routes as alternatives, not additional independent points.',
				steps: [
					{
						stepText:
							'Apply the credited fallback route only when the preferred precise route has not already been used.',
						stepRole: 'method',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	conditionalAlternativeIssues.some((finding) =>
		finding.issues.some((issue) =>
			['chain_step_missing_positive_evidence', 'chain_step_non_positive_evidence'].includes(
				issue.code
			)
		)
	)
) {
	fail(
		'Deterministic checks rejected a credited conditional alternative as non-positive evidence.'
	);
}

const auditFixturePath = path.join(fakeLogDir, 'bad-numeric-chain-extraction.json');
const auditResultPath = path.join(fakeLogDir, 'bad-numeric-chain-audit.json');
writeFileSync(
	auditFixturePath,
	JSON.stringify(
		{
			sourceDocumentId: 'test-paper',
			extractionRun: {
				agentVersion: 'test',
				needsHumanReview: false,
				reviewNotes: []
			},
			sourceDocument: {
				id: 'test-paper',
				title: 'Test Question Paper',
				pageCount: 1,
				filePath: 'package.json',
				fileHash: 'sha256:test'
			},
			markSchemeDocument: {
				id: 'test-mark-scheme',
				title: 'Test Mark Scheme',
				pageCount: 1,
				filePath: 'package.json',
				fileHash: 'sha256:test'
			},
			questions: [
				{
					id: null,
					sourceQuestionRef: '01.1',
					parentSourceQuestionRef: '01',
					displayOrder: 1,
					promptText: 'Calculate the elastic potential energy.',
					selfContainedPromptText: null,
					contextText: null,
					commandWord: 'Calculate',
					marks: 2,
					pageStart: 1,
					pageEnd: 1,
					topicPath: ['Physics', 'Energy'],
					specRef: null,
					stemBlocks: [],
					leadBlocks: [],
					promptBlocks: [{ kind: 'text', text: 'Calculate the elastic potential energy.' }],
					response: { kind: 'lines', count: 2 },
					afterResponseBlocks: [],
					assets: [],
					markSchemeItems: [
						{
							itemType: 'mark',
							text: 'Correct substitution and final answer.',
							marks: 2,
							sourceRef: 'MS 01.1',
							confidence: 1
						}
					],
					markChecklist: [
						{
							text: 'Uses the correct equation and calculates the final energy.',
							required: true,
							markSchemeItemIndexes: [0],
							confidence: 1,
							needsHumanReview: false
						}
					],
					modelAnswer: {
						answerText: 'E_e = 0.612 J',
						confidence: 1,
						needsHumanReview: false
					},
					answerChain: {
						id: 'physics-chain-calculate-0-612-j',
						title: 'Calculate 0.612 J',
						canonicalChainText: 'Substitute the given values and calculate E_e = 0.612 J.',
						summary: 'Calculate the specific final energy value.',
						broadTopic: 'Energy',
						chainFamilyId: null,
						steps: [
							{
								stepText: 'Calculate E_e = 0.612 J.',
								stepRole: 'calculation',
								explanation: null,
								commonOmission: null,
								markSchemeItemIndexes: [0]
							}
						],
						confidence: 0.9,
						needsHumanReview: false,
						reviewNotes: []
					},
					commonWeakAnswers: [],
					extractionConfidence: 1,
					needsHumanReview: false,
					reviewNotes: []
				}
			]
		},
		null,
		2
	)
);
try {
	runNodeScript('scripts/audit-extracted-question-data.mjs', [
		`--input=${auditFixturePath}`,
		`--output=${auditResultPath}`
	]);
	fail('Extracted-data audit accepted a prompt-specific numeric answer chain.');
} catch {
	const auditResult = JSON.parse(readText(auditResultPath));
	if (
		auditResult.status !== 'failed' ||
		!auditResult.failures.some((failure) => failure.code === 'chain_prompt_specific_number')
	) {
		fail('Extracted-data audit did not report the numeric chain specificity defect.', auditResult);
	}
}

const chainAuditResult = JSON.parse(
	runNodeScript('scripts/audit-answer-chain-specificity.mjs', [
		`--input=${auditFixturePath}`,
		'--json',
		'--no-semantic'
	])
);
if (
	chainAuditResult.files_scanned !== 1 ||
	chainAuditResult.blocking_findings !== 1 ||
	chainAuditResult.blocking_chains !== 1 ||
	!chainAuditResult.blocking_examples.some(
		(example) => example.chainId === 'physics-chain-calculate-0-612-j'
	)
) {
	fail('Answer-chain specificity audit did not scan an arbitrary extracted JSON input.', {
		chainAuditResult
	});
}

const missingChainIdIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '05.7',
			commandWord: 'Which',
			marks: 1,
			response: {
				kind: 'choice',
				correctAnswers: [{ targetId: 'choice', correctAnswer: 'Willow bark' }]
			},
			markSchemeItems: [{ itemType: 'answer', text: 'willow bark' }],
			answerChain: {
				id: null,
				title: 'Fixed-response cue recall',
				canonicalChainText: 'Use the cue to select the matching option.',
				summary: 'Reusable fixed-response recall chain.',
				steps: [
					{
						stepText: 'Select the matching option.',
						stepRole: 'conclusion',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	!missingChainIdIssues.some((finding) =>
		finding.issues.some(
			(issue) => issue.severity === 'error' && issue.code === 'answer_chain_missing_stable_id'
		)
	)
) {
	fail('Deterministic checks did not flag a marked question with a missing answerChain.id.');
}

const fixedAnswerStepIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			commandWord: null,
			response: {
				kind: 'choice',
				correctAnswers: [{ targetId: 'answer', correctAnswer: 'Arteries' }]
			},
			markSchemeItems: [{ itemType: 'answer', text: 'Arteries.' }],
			modelAnswer: null,
			answerChain: {
				id: 'bio-chain-disease-cue-structure-category',
				title: 'Use a disease cue to identify the affected structure category',
				canonicalChainText: 'Use the condition cue to select the affected structure category.',
				summary: 'A generic recall/discrimination chain.',
				steps: [
					{
						stepText: 'Select Arteries.',
						stepRole: 'conclusion',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	!fixedAnswerStepIssues.some((finding) =>
		finding.issues.some(
			(issue) =>
				issue.severity === 'error' &&
				issue.code === 'chain_exact_fixed_answer_text' &&
				issue.field === 'answerChain.steps[0].stepText'
		)
	)
) {
	fail('Deterministic checks did not flag exact fixed-response answers in chain step text.');
}

const unsupportedResponseIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			commandWord: null,
			response: { kind: 'single_choice_tick_box' },
			markSchemeItems: [{ itemType: 'answer', text: 'Arteries.' }],
			modelAnswer: null,
			answerChain: {
				id: 'bio-chain-disease-cue-structure-category',
				title: 'Use a disease cue to identify the affected structure category',
				canonicalChainText: 'Use the condition cue to select the affected structure category.',
				summary: 'A generic recall/discrimination chain.',
				steps: [
					{
						stepText: 'Select the affected structure category.',
						stepRole: 'conclusion',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	!unsupportedResponseIssues.some((finding) =>
		finding.issues.some(
			(issue) => issue.severity === 'error' && issue.code === 'unsupported_response_kind'
		)
	)
) {
	fail('Deterministic checks did not flag unsupported response.kind values.');
}

const missingAnswerKeyIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			commandWord: null,
			response: { kind: 'choice', options: ['Arteries', 'Capillaries', 'Veins'] },
			markSchemeItems: [{ itemType: 'answer', text: 'Arteries.' }],
			modelAnswer: null,
			answerChain: {
				id: 'bio-chain-disease-cue-structure-category',
				title: 'Use a disease cue to identify the affected structure category',
				canonicalChainText: 'Use the condition cue to select the affected structure category.',
				summary: 'A generic recall/discrimination chain.',
				steps: [
					{
						stepText: 'Select the affected structure category.',
						stepRole: 'conclusion',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	!missingAnswerKeyIssues.some((finding) =>
		finding.issues.some(
			(issue) => issue.severity === 'error' && issue.code === 'fixed_response_missing_answer_key'
		)
	)
) {
	fail('Deterministic checks did not flag missing fixed-response answer keys.');
}

const missingResponseSlotsIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '07.2',
			commandWord: 'Complete',
			response: {
				kind: 'equation-blanks',
				correctAnswers: [
					{ targetId: 'table4-green-result', correctAnswer: 'starch present' },
					{ targetId: 'table4-white-result', correctAnswer: 'no starch' }
				]
			},
			assets: [],
			markSchemeItems: [{ itemType: 'mark', text: 'Both table entries correct.' }],
			modelAnswer: { answerText: 'Green: starch present. White: no starch.' },
			answerChain: {
				id: 'bio-chain-complete-results-table',
				title: 'Complete a results table from the stimulus',
				canonicalChainText: 'Use the stimulus condition to infer each expected table result.',
				summary: 'Reusable table-completion reasoning chain.',
				steps: [
					{
						stepText: 'Infer each expected result from the stimulus condition.',
						stepRole: 'conclusion',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	!missingResponseSlotsIssues.some((finding) =>
		finding.issues.some(
			(issue) => issue.severity === 'warning' && issue.code === 'response_control_missing_slots'
		)
	)
) {
	fail('Deterministic checks did not flag equation-blanks with no visible slots.');
}

const missingResponseAssetIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '01.9',
			commandWord: 'Complete',
			response: { kind: 'asset-canvas', assetLabel: 'Figure 1 blank graph grid' },
			assets: [{ sourceLabel: 'Figure 1 blank graph grid' }],
			markSchemeItems: [{ itemType: 'mark', text: 'Plots all points accurately.' }],
			modelAnswer: { answerText: 'Completed graph.' },
			answerChain: {
				id: 'bio-chain-complete-graph-from-table',
				title: 'Complete a graph from table data',
				canonicalChainText:
					'Read table values, set up graph axes, plot points, and draw a best-fit line.',
				summary: 'Reusable graph completion method.',
				steps: [
					{
						stepText: 'Read the values from the table.',
						stepRole: 'method',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	!missingResponseAssetIssues.some((finding) =>
		finding.issues.some(
			(issue) => issue.severity === 'error' && issue.code === 'response_asset_label_only'
		)
	)
) {
	fail('Deterministic checks did not flag label-only response assets.');
}

const missingReferencedMediaIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '04.6',
			commandWord: 'Describe',
			marks: 1,
			promptText:
				'Describe one change in structure that occurs when an unspecialised cell differentiates to form a phloem cell. Use Figure 3.',
			response: { kind: 'lines' },
			assets: [],
			markSchemeItems: [{ itemType: 'marking_point', text: 'Loss of nucleus.' }],
			modelAnswer: { answerText: 'The nucleus is lost.' },
			answerChain: {
				id: 'bio-chain-compare-visible-structure-change',
				title: 'Use visual evidence to describe a structure change',
				canonicalChainText:
					'Identify the relevant visible structure and describe the credited structural change.',
				summary: 'Reusable visual-evidence description chain.',
				steps: [
					{
						stepText: 'Use the visible structure cue to describe the accepted change.',
						stepRole: 'evidence',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	!missingReferencedMediaIssues.some((finding) =>
		finding.issues.some(
			(issue) => issue.severity === 'warning' && issue.code === 'referenced_media_missing_asset'
		)
	)
) {
	fail('Deterministic checks did not flag missing media referenced by learner text for review.');
}

const copyrightPlaceholderMediaIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '04.4',
			commandWord: 'Name',
			marks: 1,
			promptText: 'Name part Y in Figure 3.',
			contextText:
				'Figure 3 shows two plant cells. Figure 3 cannot be reproduced here due to third-party copyright restrictions.',
			response: { kind: 'lines' },
			assets: [{ sourceLabel: 'Figure 3', filePath: 'tmp/source-page-016.png' }],
			markSchemeItems: [{ itemType: 'answer', text: 'Vacuole.' }],
			modelAnswer: { answerText: 'Part Y is the vacuole.' },
			answerChain: {
				id: 'bio-chain-name-labelled-part',
				title: 'Use a label to name the visible part',
				canonicalChainText:
					'Match the label on the stimulus to the accepted biological structure name.',
				summary: 'Reusable labelled-structure recall chain.',
				steps: [
					{
						stepText: 'Match the label to the accepted structure name.',
						stepRole: 'conclusion',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	!copyrightPlaceholderMediaIssues.some((finding) =>
		finding.issues.some(
			(issue) => issue.severity === 'error' && issue.code === 'media_copyright_placeholder'
		)
	)
) {
	fail('Deterministic checks did not flag copyright-placeholder media.');
}

const labelledTableMediaIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '01.9',
			commandWord: 'Complete',
			marks: 4,
			promptText: 'Complete Figure 1 using data from Table 1.',
			response: { kind: 'asset-canvas', assetLabel: 'Figure 1 blank graph grid' },
			stemBlocks: [
				{
					kind: 'table',
					label: 'Table 1 mean data for Figure 1',
					columns: ['Temperature', 'Mean rate'],
					rows: [['25', '33.2']]
				},
				{ kind: 'figure', label: 'Figure 1', assetLabel: 'Figure 1 blank graph grid' }
			],
			assets: [
				{
					sourceLabel: 'Figure 1 blank graph grid',
					filePath: 'tmp/figure-1-blank-graph-grid.png'
				}
			],
			markSchemeItems: [{ itemType: 'marking_point', text: 'Correct graph completion.' }],
			modelAnswer: { answerText: 'Completed graph.' },
			answerChain: {
				id: 'bio-chain-graph-scale-plot-line-best-fit',
				title: 'Complete a graph from table data',
				canonicalChainText:
					'Read table values, choose suitable axes, plot the points, and draw a best-fit line.',
				summary: 'Reusable graph completion chain.',
				steps: [
					{
						stepText: 'Use table data to complete the graph.',
						stepRole: 'method',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	labelledTableMediaIssues.some((finding) =>
		finding.issues.some((issue) => issue.code === 'media_block_missing_asset')
	)
) {
	fail('Deterministic checks treated a labelled table as a missing media block.');
}

const duplicateFixedModelAnswerIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '01.1',
			commandWord: 'Complete',
			marks: 1,
			response: {
				kind: 'equation-blanks',
				segments: [{ kind: 'blank', id: 'blank1', label: 'product' }],
				correctAnswers: [{ targetId: 'blank1', correctAnswer: 'glucose' }]
			},
			markSchemeItems: [{ itemType: 'answer', text: 'glucose' }],
			modelAnswer: { answerText: 'glucose' },
			answerChain: {
				id: 'bio-chain-equation-product-recall',
				title: 'Recall a product from an equation cue',
				canonicalChainText: 'Use the equation cue to recall the credited product.',
				summary: 'Reusable equation-completion recall chain.',
				steps: [
					{
						stepText: 'Recall the credited product for the blank.',
						stepRole: 'conclusion',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	duplicateFixedModelAnswerIssues.some((finding) =>
		finding.issues.some((issue) => issue.code === 'fixed_response_model_answer_review')
	)
) {
	fail(
		'Deterministic checks warned when a fixed-response model answer only duplicates the answer key.'
	);
}

const duplicateEquationModelAnswerIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '01.1',
			commandWord: 'Complete',
			marks: 2,
			response: {
				kind: 'equation-blanks',
				segments: [
					{ kind: 'blank', id: 'blank1', label: 'reactant before arrow 1' },
					{ kind: 'text', text: ' + ' },
					{ kind: 'blank', id: 'blank2', label: 'reactant before arrow 2' },
					{ kind: 'text', text: ' -> ' },
					{ kind: 'blank', id: 'blank3', label: 'product after arrow' },
					{ kind: 'text', text: ' + oxygen' }
				],
				correctAnswers: [
					{
						targetId: 'blank1',
						correctAnswer: 'carbon dioxide (or water, in either order with blank2)'
					},
					{
						targetId: 'blank2',
						correctAnswer: 'water (or carbon dioxide, in either order with blank1)'
					},
					{ targetId: 'blank3', correctAnswer: 'glucose' }
				]
			},
			markSchemeItems: [
				{ itemType: 'mark', text: 'Before arrow: carbon dioxide and water; either order.' },
				{ itemType: 'mark', text: 'After arrow: glucose.' }
			],
			modelAnswer: { answerText: 'carbon dioxide + water -> glucose + oxygen' },
			answerChain: {
				id: 'bio-chain-equation-term-placement',
				title: 'Place recalled terms in a process word equation',
				canonicalChainText:
					'Use the process cue to recall the input and output terms, then place each term on the correct side of the equation.',
				summary: 'Reusable word-equation completion chain.',
				steps: [
					{
						stepText: 'Recall and place the required equation terms.',
						stepRole: 'method',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0, 1]
					}
				]
			}
		}
	]
});
if (
	duplicateEquationModelAnswerIssues.some((finding) =>
		finding.issues.some((issue) => issue.code === 'fixed_response_model_answer_review')
	)
) {
	fail(
		'Deterministic checks warned when a fixed-response model answer only repeats a completed equation.'
	);
}

const mismatchedMediaAssetIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '05.2',
			commandWord: 'Calculate',
			marks: 2,
			promptText: 'Use Figure 4 to calculate the change.',
			response: { kind: 'lines' },
			assets: [
				{
					sourceLabel: 'Figure 4',
					filePath: 'data/vision-extracted/example/page-019-05-2-figure-5.png',
					altText: 'Figure 5 rendered from source paper page 19.'
				}
			],
			markSchemeItems: [{ itemType: 'marking_point', text: 'Correct calculation.' }],
			modelAnswer: { answerText: 'The change is calculated from the graph.' },
			answerChain: {
				id: 'bio-chain-graph-read-calculate-change',
				title: 'Read a graph value and calculate a change',
				canonicalChainText:
					'Identify the graph values, subtract to find the change, and give the result.',
				summary: 'Reusable graph-reading calculation chain.',
				steps: [
					{
						stepText: 'Read the graph values and calculate the change.',
						stepRole: 'calculation',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	!mismatchedMediaAssetIssues.some((finding) =>
		finding.issues.some((issue) => issue.code === 'media_asset_label_mismatch')
	)
) {
	fail('Deterministic checks did not flag a numbered media asset label/path mismatch.');
}

const localSourcePageFixture = path.join(
	rootDir,
	'data/aqa-separate-science-higher/question-papers/AQA-84611H-QP-JUN24-CR.PDF'
);
if (existsSync(localSourcePageFixture)) {
	const wrongSourcePageIssues = pipelineModule.deterministicCandidateIssues({
		sourceDocument: {
			filePath: path.relative(rootDir, localSourcePageFixture)
		},
		questions: [
			{
				sourceQuestionRef: '05.2',
				commandWord: 'Explain',
				marks: 3,
				promptText: 'Explain the result using Figure 4.',
				contextText: 'Figure 4 shows the results.',
				response: { kind: 'lines', count: 3 },
				assets: [
					{
						sourceLabel: 'Figure 4',
						assetType: 'image',
						pageNumber: 19,
						filePath: 'tmp/figure-4-page-19.png'
					}
				],
				markSchemeItems: [{ itemType: 'marking_point', text: 'Accept osmosis explanation.' }],
				modelAnswer: { answerText: 'Water leaves the potato by osmosis.' },
				answerChain: {
					id: 'biology-chain-explain-result-from-condition',
					title: 'Explain a result from the changed condition',
					canonicalChainText:
						'Use the changed condition to explain the observed result through the relevant process.',
					summary: 'Connect the condition to the process and outcome.',
					steps: [
						{
							stepText: 'Connect the condition to the process and outcome.',
							stepRole: 'link',
							explanation: null,
							commonOmission: null,
							markSchemeItemIndexes: [0]
						}
					]
				}
			}
		]
	});
	if (
		!wrongSourcePageIssues.some((finding) =>
			finding.issues.some(
				(issue) => issue.severity === 'error' && issue.code === 'media_asset_page_label_mismatch'
			)
		)
	) {
		fail(
			'Deterministic checks did not flag a numbered media asset assigned to the wrong source PDF page.'
		);
	}
}

const missingWrittenModelAnswerIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '01.2',
			commandWord: 'Name',
			marks: 1,
			response: { kind: 'lines' },
			markSchemeItems: [{ itemType: 'answer', text: 'Cell membrane.' }],
			modelAnswer: null,
			answerChain: {
				id: 'bio-chain-boundary-cue-recall',
				title: 'Recall a named boundary structure from a cue',
				canonicalChainText: 'Use the boundary cue to recall the accepted structure name.',
				summary: 'A reusable recall chain for structure names.',
				steps: [
					{
						stepText: 'Use the cue to recall the accepted structure name.',
						stepRole: 'conclusion',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					}
				]
			}
		}
	]
});
if (
	!missingWrittenModelAnswerIssues.some((finding) =>
		finding.issues.some(
			(issue) =>
				issue.severity === 'error' && issue.code === 'written_response_missing_model_answer'
		)
	)
) {
	fail('Deterministic checks did not flag missing modelAnswer for written response.');
}

const evidenceIndexCandidate = {
	questions: [
		{
			sourceQuestionRef: '01.1',
			commandWord: null,
			response: { kind: 'lines' },
			markSchemeItems: [
				{ itemType: 'mark', text: 'States a valid lifestyle factor.' },
				{ itemType: 'ignore', text: 'Ignore obesity.' },
				{ itemType: 'guidance', text: 'Allow qualified diet examples.' }
			],
			answerChain: {
				id: 'bio-chain-valid-risk-factor-recall',
				title: 'Recall a valid risk factor',
				canonicalChainText: 'Use the risk-factor cue to recall a valid credited example.',
				summary: 'A reusable recall chain for credited risk-factor examples.',
				steps: [
					{
						stepText: 'Recall a valid credited factor.',
						stepRole: 'conclusion',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0, 1, 2, 99]
					}
				]
			}
		}
	]
};
const evidenceIssues = pipelineModule.deterministicCandidateIssues(evidenceIndexCandidate);
if (
	!evidenceIssues.some((finding) =>
		finding.issues.some(
			(issue) => issue.severity === 'error' && issue.code === 'chain_step_non_positive_evidence'
		)
	)
) {
	fail('Deterministic checks did not flag non-positive chain evidence links.');
}
const sanitizedEvidenceCandidate =
	pipelineModule.sanitizeAnswerChainEvidenceIndexes(evidenceIndexCandidate);
const sanitizedIndexes =
	sanitizedEvidenceCandidate.questions[0].answerChain.steps[0].markSchemeItemIndexes;
if (sanitizedIndexes.join(',') !== '0') {
	fail('sanitizeAnswerChainEvidenceIndexes did not keep only positive existing mark rows.');
}

const solvabilityContext = pipelineModule.buildLearnerVisibleQuestionContext(
	{
		sourceDocument: { id: 'test-paper' },
		markSchemeDocument: { id: 'test-ms' },
		questions: [
			{
				sourceQuestionRef: '05.5',
				parentSourceQuestionRef: '05',
				displayOrder: 5,
				promptText: 'Use Table 1 to calculate the mean.',
				contextText: 'Table 1 shows values 2, 4 and 6.',
				stemBlocks: [
					{
						kind: 'table',
						label: 'Table 1',
						columns: ['Trial', 'Value'],
						rows: [
							['1', '2'],
							['2', '4'],
							['3', '6']
						]
					}
				],
				promptBlocks: [{ kind: 'text', text: 'Calculate the mean value.' }],
				response: { kind: 'lines', count: 1 },
				assets: [],
				markSchemeItems: [{ itemType: 'mark', text: 'Mean = 4.' }]
			},
			{
				sourceQuestionRef: '05.7',
				parentSourceQuestionRef: '05',
				displayOrder: 7,
				promptText: 'Explain how the mean from 05.5 supports the conclusion.',
				contextText: 'Use your answer to 05.5.',
				stemBlocks: [{ kind: 'text', text: 'Use your answer to 05.5.' }],
				promptBlocks: [{ kind: 'text', text: 'Explain how the mean supports the conclusion.' }],
				response: { kind: 'lines', count: 3 },
				assets: [{ sourceLabel: 'Figure 5' }],
				markSchemeItems: [{ itemType: 'mark', text: 'Uses the mean value of 4.' }],
				markChecklist: [{ text: 'Refers to mean value 4.', markSchemeItemIndexes: [0] }],
				modelAnswer: { answerText: 'The mean value is 4, so it supports the conclusion.' }
			}
		]
	},
	'05.7'
);
if (solvabilityContext.includedSourceQuestionRefs.join(',') !== '05.5,05.7') {
	fail(
		'Solvability context did not include prior parent-group subpart context.',
		solvabilityContext
	);
}
if (
	!JSON.stringify(solvabilityContext.studentVisibleContext.sections).includes('Table 1') ||
	!JSON.stringify(solvabilityContext.targetAnswerKey).includes('mean value of 4')
) {
	fail(
		'Solvability context omitted visible table or target answer-key evidence.',
		solvabilityContext
	);
}

const numberedFigureContext = pipelineModule.buildLearnerVisibleQuestionContext(
	{
		sourceDocument: { id: 'test-paper' },
		markSchemeDocument: { id: 'test-ms' },
		questions: [
			{
				sourceQuestionRef: '01.6',
				parentSourceQuestionRef: '01',
				displayOrder: 6,
				promptText: 'Use Figure 1.',
				contextText: 'Figure 1 shows earlier results.',
				stemBlocks: [{ kind: 'figure', label: 'Figure 1', assetLabel: 'Figure 1' }],
				response: { kind: 'lines', count: 1 },
				assets: [{ sourceLabel: 'Figure 1', filePath: 'tmp/figure-1.png' }],
				markSchemeItems: [{ itemType: 'mark', text: 'Earlier answer.' }]
			},
			{
				sourceQuestionRef: '01.7',
				parentSourceQuestionRef: '01',
				displayOrder: 7,
				promptText: 'Use Figure 2.',
				contextText: 'Figure 2 shows the target setup.',
				stemBlocks: [{ kind: 'figure', label: 'Figure 2', assetLabel: 'Figure 2' }],
				response: { kind: 'lines', count: 1 },
				assets: [{ sourceLabel: 'Figure 2', filePath: 'tmp/figure-2.png' }],
				markSchemeItems: [{ itemType: 'mark', text: 'Target answer.' }]
			}
		]
	},
	'01.7'
);
const figureTwoMedia = numberedFigureContext.studentVisibleContext.media.find(
	(media) => media.label === 'Figure 2'
);
if (figureTwoMedia?.asset?.sourceLabel !== 'Figure 2') {
	fail('Solvability media selection cross-matched numbered figure assets.', figureTwoMedia);
}

const tmpDir = path.join(rootDir, 'tmp/test-extraction-pipeline');
mkdirSync(tmpDir, { recursive: true });
const pdfPath = path.join(tmpDir, 'one-page.pdf');
pipelineModule.writeSimplePdf(pdfPath, 'Test PDF', ['Question 01.1', 'Calculate something.']);
if (pipelineModule.pdfPageCount(pdfPath) !== 1) fail('pdfPageCount did not read synthetic PDF.');
const rendered = pipelineModule.renderPdfPages({
	pdfPath,
	outputDir: path.join(tmpDir, 'rendered'),
	prefix: 'page',
	dpi: 90,
	force: true
});
if (rendered.length !== 1 || !existsSync(rendered[0]))
	fail('renderPdfPages did not render one page.');
if (pipelineModule.selectPages(rendered, [1]).length !== 1)
	fail('selectPages did not select page 1.');
if (pipelineModule.selectPages(rendered, [2]).length !== 0)
	fail('selectPages selected a missing page.');

const sortDir = path.join(tmpDir, 'sort');
mkdirSync(sortDir, { recursive: true });
for (const name of ['page-10.png', 'page-2.png', 'page-1.png']) {
	writeFileSync(path.join(sortDir, name), '');
}
const sortedNames = pipelineModule.imageFiles(sortDir).map((filePath) => path.basename(filePath));
if (sortedNames.join(',') !== 'page-1.png,page-2.png,page-10.png') {
	fail('imageFiles did not sort rendered pages numerically.', sortedNames);
}

const badJudgeScore = pipelineModule.JudgeSchema.safeParse({
	verdict: 'pass',
	score: 8,
	rationale: 'bad score',
	conceptMatches: [],
	forbiddenValueFindings: [],
	modelAnswerValueMatches: [],
	requiredRepairs: []
});
if (badJudgeScore.success) fail('JudgeSchema accepted a score outside 0..1.');

const badStepRole = pipelineModule.StepSchema.safeParse({
	stepText: 'Do a thing.',
	stepRole: 'random',
	explanation: null,
	commonOmission: null,
	markSchemeItemIndexes: []
});
if (badStepRole.success) fail('StepSchema accepted a non-spec stepRole.');

runNodeScript('scripts/extract-paper-llm.mjs', ['--help']);

console.log(
	JSON.stringify(
		{
			status: 'passed',
			library: 'scripts/lib/llm-extraction-pipeline.mjs',
			cli: 'scripts/extract-paper-llm.mjs',
			eval: 'scripts/eval-extraction-pipeline-llm.mjs',
			goldenCases: goldenOutput.cases
		},
		null,
		2
	)
);
