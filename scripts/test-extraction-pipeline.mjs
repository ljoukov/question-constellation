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

function runNodeScriptExpectFailure(scriptPath, args = []) {
	try {
		execFileSync(process.execPath, [scriptPath, ...args], {
			cwd: rootDir,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		});
		fail(`Expected ${scriptPath} to fail.`);
	} catch (error) {
		return String(error.stdout ?? '') + String(error.stderr ?? '');
	}
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
const productionPipelineSource = readText(
	path.join(rootDir, 'scripts/run-production-extraction-pipeline.mjs')
);
const codexImportHelperSource = readText(path.join(rootDir, 'scripts/codex-import-helper.mjs'));
const codexSdkRunnerSource = readText(path.join(rootDir, 'scripts/lib/codex-sdk-runner.mjs'));
const codexPdfExtractionSource = readText(path.join(rootDir, 'scripts/run-codex-pdf-extraction.mjs'));
const codexAnswerChainsSource = readText(path.join(rootDir, 'scripts/run-codex-answer-chains.mjs'));
const codexProductionImportSource = readText(
	path.join(rootDir, 'scripts/run-codex-production-import-pipeline.mjs')
);
const productionBatchSource = readText(
	path.join(rootDir, 'scripts/run-production-extraction-batch.mjs')
);
const productionVerifierSource = readText(
	path.join(rootDir, 'scripts/verify-production-extraction-run.mjs')
);
const downloaderSource = readText(path.join(rootDir, 'scripts/download-aqa-separate-science.mjs'));
const importSource = readText(path.join(rootDir, 'scripts/import-physics-vision.mjs'));
const repairAssetSource = readText(
	path.join(rootDir, 'scripts/repair-extraction-response-assets.mjs')
);
const cropPdfFigureSource = readText(path.join(rootDir, 'scripts/crop-pdf-figure.py'));
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
const codexObservationSource = readText(
	path.join(rootDir, 'docs/codex-whole-pdf-import-observations.md')
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
	'scripts/run-production-extraction-pipeline.mjs',
	'scripts/codex-import-helper.mjs',
	'scripts/lib/codex-sdk-runner.mjs',
	'scripts/run-codex-pdf-extraction.mjs',
	'scripts/run-codex-answer-chains.mjs',
	'scripts/run-codex-production-import-pipeline.mjs',
	'scripts/run-production-extraction-batch.mjs',
	'scripts/verify-production-extraction-run.mjs',
	'scripts/summarize-llm-extraction-logs.mjs',
	'scripts/crop-pdf-figure.py',
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
		'pnpm run extract:production',
		'pnpm run codex:production-import',
		'Codex SDK',
		'run-codex-pdf-extraction.mjs',
		'run-codex-answer-chains.mjs',
		'pnpm run extract:production:batch',
		'pnpm run verify:production-extraction',
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
		'--allow-question-granularity',
		'--concurrency=4',
		'--repair-text-references',
		'--run-id',
		'--paper-attempts',
		'costUsd',
		'pdfinfo',
		'pdftoppm',
		'pdftotext',
		'Codex is now the main production runner',
		'@openai/codex-sdk',
		'helper.mjs',
		'validate-extraction',
		'validate-chain',
		'D1 replacement safety',
		'phase-specific model and reasoning overrides',
		'Codex Whole-PDF Import Observations',
		'--mark-scheme-image-mode=all',
		'learner-facing solvability judge',
		'production-extraction-summary.json',
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
		'buildFullPaperPrompt',
		'normalizeQuestionResponseForExtraction',
		'unorderedGroups',
		'Source question-paper text for selected pages',
		'QUESTION PAPER TEXT FOR CORE PAGES FOLLOWS',
		'deterministic question-paper text scout',
		'The script detected these sourceQuestionRef values from core-page text',
		'For calculation questions with visible working lines',
		'For markChecklist.required, true means every full-credit response',
		'level-response indicative content must be required=false',
		'Do not use asset-canvas for a table that can be represented structurally',
		'LOOKAHEAD QUESTION PAPER PAGE',
		'PRIOR CONTEXT QUESTION PAPER PAGE',
		'priorContextPages',
		'contextPages = 2',
		'chunkStrategy',
		'chunkImagesByParentQuestion',
		"extractionGranularity = 'chunk'",
		"extractionGranularity === 'question'",
		'allowQuestionGranularity',
		'Do not start or extract sibling subquestions',
		'If an atomic subquestion number/prompt first appears on a lookahead page, omit it from this chunk',
		'withdrawn questions, replacement notices, statistics-only rows',
		'stage_extraction_questions',
		'validate_staged_extraction',
		'stagedExtractionEnvelope',
		'chunkStrategy=whole-paper is only supported with extractionStrategy=agentic'
	],
	'Pipeline library'
);

requireIncludes(
	cliSource,
	[
		'materializeQuestionMediaAssets',
		'crop-pdf-figure.py',
		'normalizeQuestionExtractionCandidate',
		'normalizeAllowedAlternativeAnswerEvidence',
		'Accept also:',
		'Give ${numberWord(requiredCount)} distinct credited',
		'isOptionalChecklistText',
		'indicative'
	],
	'Extraction CLI'
);

requireIncludes(
	cropPdfFigureSource,
	[
		'pdftotext',
		'-bbox-layout',
		'Figure',
		'choose_vertical_crop',
		'bboxNormalized'
	],
	'PDF figure cropper'
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
		'--chunk-strategy=parent-question|fixed-pages|whole-paper',
		'--chunk-concurrency=1',
		'--extraction-granularity=chunk|question',
		'--allow-question-granularity',
		'--subject=Biology',
		'--subject-area=Biology',
		'--component-code=84611H',
		'genericDocumentMetadata',
		'--mark-scheme-image-mode',
		'--repair-attempts',
		'--repair-answer-chains',
		'--evaluation-mode=extraction|full',
		'--judge-mode=paper|question-batches',
		'--judge-batch-size=8',
		'--judge-concurrency=2',
		'--repair-batch-size',
		'--llm-timeout-ms',
		'--llm-max-attempts',
		'--llm-max-attempts=3',
		'--llm-max-calls=12',
		'--judge-thinking-level',
		'--skip-judge',
		'process.env.EXTRACTION_RUN_ID = runId',
		"!['asset-canvas', 'image-label-zones'].includes(response.kind)",
		'extractFullPaperFromPdfSet',
		'evaluateCandidateQuestionBatches',
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
		"stringArg('chunk-strategy', 'parent-question')",
		"['parent-question', 'fixed-pages', 'whole-paper']",
		'--chunk-strategy=${chunkStrategy}',
		"integerArg('chunk-concurrency', 2, 1)",
		'--chunk-concurrency=${chunkConcurrency}',
		'--run-id=aqa-separate-science-${paper.sourceDocumentId}',
		"stringArg('extraction-granularity', 'chunk')",
		'--extraction-granularity=${extractionGranularity}',
		'--allow-question-granularity',
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
	productionPipelineSource,
	[
		'scripts/extract-paper-llm.mjs',
		'scripts/build-existing-chain-context.mjs',
		'scripts/reconcile-answer-chains.mjs',
		'scripts/prepare-import-ready-extraction.mjs',
		'--run-solvability',
		'--skip-solvability',
		'--import',
		'production-extraction-summary.json',
		'existing-chain-input-root',
		'--subject=Biology',
		'--subject-area=Biology',
		'--component-code=84611H',
		'--extraction-thinking-level=medium',
		'--extraction-judge-thinking-level=medium',
		'--extraction-judge-mode=question-batches|paper',
		'--extraction-judge-batch-size=8',
		'--extraction-judge-concurrency=2',
		'--chain-thinking-level=xhigh',
		'--solvability-thinking-level=xhigh',
		"forwardPhaseString(args, 'extraction-model', 'model')",
		"forwardPhaseString(args, 'extraction-thinking-level', 'thinking-level')",
		'--judge-thinking-level=${extractionJudgeThinkingLevel}',
		'--judge-mode=${extractionJudgeMode}',
		'--judge-batch-size=${extractionJudgeBatchSize}',
		'--judge-concurrency=${extractionJudgeConcurrency}',
		"forwardPhaseString(args, 'chain-model', 'model')",
		"forwardPhaseString(args, 'chain-thinking-level', 'thinking-level')",
		"forwardPhaseString(args, 'solvability-thinking-level', 'thinking-level')",
		'process.env.EXTRACTION_RUN_ID = runId',
		"forwardString(args, 'run-id')",
		"forwardString(args, 'question-paper-title')"
	],
	'Production extraction orchestrator'
);

requireIncludes(
	codexImportHelperSource,
	[
		'pdf-info',
		'pdftotext-pages',
		'render-pages',
		'extract-embedded-images',
		'contact-sheet',
		'line-count',
		'normalize-extraction',
		'validate-extraction',
		'validate-chain',
		'structured_fields',
		'tick_box',
		'equation_completion',
		'fixed_response_missing_answer_key'
	],
	'Codex import helper'
);

requireIncludes(
	codexSdkRunnerSource,
	[
		"from '@openai/codex-sdk'",
		'loadDotEnvFile',
		'runCodexSdkTurn',
		'eventsPath',
		'lastMessagePath',
		'commandActions',
		'failedCommandActions',
		'usage',
		'CODEX_API_KEY',
		'CLOUDFLARE'
	].filter((value) => value !== 'CLOUDFLARE'),
	'Codex SDK runner'
);

requireIncludes(
	codexPdfExtractionSource,
	[
		'official-question-paper.pdf',
		'helper.mjs',
		'metadata.json',
		'Do not run git',
		'Do not create final answer chains',
		'normalize-extraction',
		'validate-extraction',
		'expected-marks',
		'expected-questions',
		'question-paper.pdf',
		'mark-scheme.pdf',
		'events.jsonl',
		'gpt-5.5'
	],
	'Codex PDF extraction runner'
);

requireIncludes(
	codexAnswerChainsSource,
	[
		'answer-chain reconciliation phase',
		'existing-chain-context.json',
		'reuse_existing',
		'create_new',
		'update_existing',
		'Do not put worked numeric answers',
		'validate-chain',
		'chain-reconciled.json',
		'events.jsonl',
		'xhigh'
	],
	'Codex answer-chain runner'
);

requireIncludes(
	codexProductionImportSource,
	[
		'scripts/run-codex-pdf-extraction.mjs',
		'scripts/run-codex-answer-chains.mjs',
		'scripts/prepare-import-ready-extraction.mjs',
		'--run-solvability',
		'--skip-solvability',
		'--import',
		'codex-production-import-summary.json',
		'codex-extraction-summary.json',
		'codex-chain-summary.json',
		'importReadyAuditPath',
		'--check-existing',
		'--skip-d1-conflict-check',
		"stringArg('extraction-thinking-level'",
		"stringArg('chain-thinking-level'",
		"stringArg('solvability-thinking-level'"
	],
	'Codex production import orchestrator'
);

requireIncludes(
	codexObservationSource,
	[
		'true PDF-only Codex baselines',
		'20-step cap is too small',
		'OCR',
		'Formulae and equations',
		'PDF-to-structured-question JSON extraction',
		'Separate answer-chain reconciliation',
		'Safe D1 replacement/import'
	],
	'Codex whole-PDF observations'
);

requireIncludes(
	productionBatchSource,
	[
		'scripts/run-production-extraction-pipeline.mjs',
		'--run-id-prefix',
		'--solvability-concurrency',
		'extraction-judge-mode',
		'extraction-judge-batch-size',
		'extraction-judge-concurrency',
		'supporting_documents',
		'--concurrency',
		'--paper-attempts',
		'--dry-run'
	],
	'Production extraction batch orchestrator'
);

requireIncludes(
	productionVerifierSource,
	[
		'production-extraction-summary.json',
		'judge-solvability',
		"judgeMode === 'question-batches'",
		'requiredRepairs',
		'allow-dropped-questions',
		'LLM log must include'
	],
	'Production extraction verifier'
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
		'unorderedGroupsArray',
		'checkExisting',
		'existingReplacementPlan',
		'questionIdCollisions',
		'sharedIncomingChains',
		'allow-shared-chain-updates'
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
		'--run-solvability',
		'--check-existing',
		'--allow-shared-chain-updates',
		'runCapturedLog',
		'process.stderr.write(output)',
		'process.env.EXTRACTION_RUN_ID = runId'
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
	'extract:production',
	'extract:production:llm',
	'extract:production:batch',
	'verify:production-extraction',
	'summarize:llm-extraction-logs',
	'eval:question-solvability',
	'audit:extracted-data',
	'audit:current-exported-data',
	'audit:answer-chain-specificity',
	'build:import-ready-extracted-subset',
	'build:existing-chain-context',
	'reconcile:answer-chains',
	'prepare:import-ready-extraction',
	'codex:pdf-extract',
	'codex:answer-chains',
	'codex:production-import',
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

if (packageJson.scripts?.['extract:production'] !== 'node scripts/run-codex-production-import-pipeline.mjs') {
	fail('extract:production must point at the Codex production import runner.');
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
	'scripts/codex-import-helper.mjs',
	'scripts/lib/codex-sdk-runner.mjs',
	'scripts/run-codex-pdf-extraction.mjs',
	'scripts/run-codex-answer-chains.mjs',
	'scripts/run-codex-production-import-pipeline.mjs',
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

const codexChainDryRun = JSON.parse(
	runNodeScript('scripts/run-codex-answer-chains.mjs', [
		`--input=${chainContextInput}`,
		`--existing-chains=${chainContextOutput}`,
		`--output=${path.join(chainContextDir, 'codex-chain-output.json')}`,
		`--work-dir=${path.join(chainContextDir, 'codex-chain-work')}`,
		'--dry-run'
	])
);
if (
	codexChainDryRun.status !== 'dry-run' ||
	codexChainDryRun.plan.questionCount !== 3 ||
	codexChainDryRun.plan.existingChainsPath !== 'tmp/test-existing-chain-context/context.json'
) {
	fail('Codex answer-chain dry-run did not expose the expected plan.', {
		codexChainDryRun
	});
}

const helperNormalizeDir = path.join(rootDir, 'tmp/test-codex-helper-normalize');
mkdirSync(helperNormalizeDir, { recursive: true });
const helperNormalizeInput = path.join(helperNormalizeDir, 'raw.json');
const helperNormalizeOutput = path.join(helperNormalizeDir, 'normalized.json');
writeFileSync(
	helperNormalizeInput,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'test-paper',
				docType: 'question_paper',
				subject: 'Biology',
				subjectArea: 'Biology'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '01.1',
					promptText: 'Use Table 1 to calculate the mean.',
					marks: 1,
					pageStart: 2,
					pageEnd: 2,
					response: { kind: 'lines', count: 1 },
					stemBlocks: [
						{
							kind: 'table',
							label: 'Table 1',
							rows: [
								['Temperature', 'Test 1', 'Test 2'],
								['45', '1.9', '14.2']
							]
						}
					],
					markSchemeItems: [{ itemType: 'mark', text: 'Correct mean.' }],
					markChecklist: [{ text: 'Calculates the mean.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'Mean calculated from the table.' }
				},
				{
					sourceQuestionRef: '01.2',
					promptText: 'Draw a ring around the anomalous result in Table 1.',
					marks: 1,
					pageStart: 2,
					pageEnd: 2,
					response: {
						kind: 'image-label-zones',
						assetLabel: 'Table 1',
						correctAnswers: [{ targetId: '45-test-2', correctAnswer: '14.2' }]
					},
					assets: [{ sourceLabel: 'Table 1', role: 'data-table' }],
					markSchemeItems: [{ itemType: 'mark', text: 'A ring around 14.2.' }],
					markChecklist: [{ text: 'Identifies the anomalous result.', markSchemeItemIndexes: [0] }]
				}
			]
		},
		null,
		2
	)
);
runNodeScript('scripts/codex-import-helper.mjs', [
	'normalize-extraction',
	`--input=${helperNormalizeInput}`,
	`--output=${helperNormalizeOutput}`
]);
const helperNormalized = JSON.parse(readText(helperNormalizeOutput));
const propagatedTable = helperNormalized.questions
	.find((question) => question.sourceQuestionRef === '01.2')
	?.stemBlocks?.find((block) => block.kind === 'table' && block.label === 'Table 1');
if (!propagatedTable || propagatedTable.rows?.length !== 2) {
	fail('Codex helper normalization did not propagate shared parent table blocks.', helperNormalized);
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
	'buildFullPaperPrompt',
	'repairCandidateAnswerChains',
	'repairFullPaperAnswerChains',
	'repairFullPaperQuestionQuality',
	'sanitizeAnswerChainEvidenceIndexes',
	'buildLearnerVisibleQuestionContext',
	'chunkImages',
	'chunkImagesByParentQuestion',
	'mergeFullPaperChunks',
	'normalizeExtractedQuestionForImport',
	'judgeQuestionSolvability',
	'questionRefsFromText',
	'markSchemeTextExcerptForRefs',
	'normalizeRepairEnvelope',
	'judgeCandidateAgainstRubric',
	'positiveMarkSchemeItem',
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

const parentQuestionChunks = pipelineModule.chunkImagesByParentQuestion(
	[
		'/tmp/question-paper-001.png',
		'/tmp/question-paper-002.png',
		'/tmp/question-paper-003.png',
		'/tmp/question-paper-004.png',
		'/tmp/question-paper-005.png'
	],
	new Map([
		[1, ['01.1', '01.2']],
		[2, ['01.3', '01.4']],
		[3, ['02.1']],
		[4, ['02.2']],
		[5, ['03.1']]
	]),
	1,
	1
);
if (
	parentQuestionChunks.length !== 3 ||
	parentQuestionChunks[0].corePages.join(',') !== '1,2' ||
	parentQuestionChunks[1].priorContextPages.join(',') !== '2' ||
	parentQuestionChunks[1].corePages.join(',') !== '3,4' ||
	parentQuestionChunks[1].lookaheadPages.join(',') !== '5' ||
	parentQuestionChunks[2].corePages.join(',') !== '5'
) {
	fail('Parent-question chunk planning split a multi-page parent question.', {
		parentQuestionChunks
	});
}

const parentAwareJudgeBatches = pipelineModule.parentQuestionBatchesForEvaluation(
	{
		extractionRun: {
			pageSelection: {
				questionPages: [1, 2, 3, 4, 5, 6, 7],
				contextPages: 1
			}
		},
		sourceDocument: { pageCount: 7 },
		questions: [
			{
				sourceQuestionRef: '05.1',
				parentSourceQuestionRef: '05',
				pageStart: 3,
				pageEnd: 3
			},
			{
				sourceQuestionRef: '05.7',
				parentSourceQuestionRef: '05',
				pageStart: 5,
				pageEnd: 6
			},
			{
				sourceQuestionRef: '06.1',
				parentSourceQuestionRef: '06',
				pageStart: 7,
				pageEnd: 7
			}
		]
	},
	{ judgeBatchSize: 1 }
);
if (
	parentAwareJudgeBatches.length !== 2 ||
	parentAwareJudgeBatches[0].sourceQuestionRefs.join(',') !== '05.1,05.7' ||
	parentAwareJudgeBatches[0].questionPages.join(',') !== '2,3,4,5,6'
) {
	fail('Parent-aware judge batching split a multi-subpart parent or dropped context pages.', {
		parentAwareJudgeBatches
	});
}

if (
	!pipelineModule.shouldSkipNoQuestionChunkText(
		'32 Do not write outside the box There are no questions printed on this page'
	) ||
	!pipelineModule.shouldSkipNoQuestionChunkText(
		'Question Additional page, if required. number Write the question numbers in the left-hand margin.'
	) ||
	pipelineModule.shouldSkipNoQuestionChunkText(
		'0 7 . 4 Explain the result shown in Figure 10. [4 marks]'
	)
) {
	fail(
		'No-question chunk skip heuristic did not distinguish blank/additional pages from questions.'
	);
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
const extractionPromptWithTextScout = pipelineModule.buildFullPaperPrompt({
	sourceDocumentId: 'aqa-84611h-qp-nov20',
	markSchemeDocumentId: 'aqa-84611h-ms-nov20',
	questionPaper: {
		id: 'aqa-84611h-qp-nov20',
		docType: 'question_paper',
		title: 'Question paper',
		fileName: 'qp.pdf',
		pages: [2]
	},
	markScheme: {
		id: 'aqa-84611h-ms-nov20',
		docType: 'mark_scheme',
		title: 'Mark scheme',
		fileName: 'ms.pdf'
	},
	chunk: {
		index: 0,
		total: 1,
		corePages: [2],
		priorContextPages: [],
		lookaheadPages: []
	},
	questionPaperText: '01.1 Complete the word equation.',
	coreQuestionRefs: ['01.1', '01.2'],
	extractionSpec: ''
});
if (
	!extractionPromptWithTextScout.includes(
		'The script detected these sourceQuestionRef values from core-page text: 01.1, 01.2'
	) ||
	!extractionPromptWithTextScout.includes('deterministic question-paper text scout')
) {
	fail('Full-paper extraction prompt does not anchor on deterministic text/ref scout.', {
		extractionPromptWithTextScout
	});
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
				contextText: 'Use the information about the solution.',
				contextBlocks: [
					{
						kind: 'paragraph',
						text: 'Use the information about the solution.',
						compact: true
					}
				],
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
if (
	compactAliasExpansion.questions[0]?.stemBlocks?.length !== 1 ||
	compactAliasExpansion.questions[0]?.stemBlocks?.[0]?.text !==
		'Use the information about the solution.'
) {
	fail(
		'Compact extraction expansion did not remove adjacent duplicate text context blocks.',
		compactAliasExpansion.questions[0]?.stemBlocks
	);
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

const rowOnlyStructuredTableIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '01.4',
			commandWord: 'Draw',
			marks: 1,
			promptText: 'Draw a ring around the anomalous result in Table 1.',
			response: {
				kind: 'image-label-zones',
				assetLabel: 'Table 1',
				correctAnswers: [{ targetId: '45-test-2', correctAnswer: '14.2' }]
			},
			stemBlocks: [
				{
					kind: 'table',
					label: 'Table 1',
					rows: [
						['Temperature', 'Test 1', 'Test 2'],
						['45', '1.9', '14.2']
					]
				}
			],
			assets: [{ sourceLabel: 'Table 1', role: 'data-table' }],
			markSchemeItems: [{ itemType: 'mark', text: 'A ring around 14.2.' }],
			answerChain: {
				id: 'bio-chain-data-anomaly-selection',
				title: 'Select an anomalous table value',
				canonicalChainText:
					'Use the pattern in a data table to identify and mark the anomalous value.',
				summary: 'Reusable table-anomaly selection chain.',
				steps: [
					{
						stepText: 'Identify the anomalous table value.',
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
	rowOnlyStructuredTableIssues.some((finding) =>
		finding.issues.some((issue) =>
			['response_asset_label_only', 'referenced_media_missing_asset'].includes(issue.code)
		)
	)
) {
	fail('Deterministic checks did not accept a row-only structured table as a table surface.');
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

if (
	!pipelineModule.positiveMarkSchemeItem({
		itemType: 'alternative',
		marks: 1,
		text: 'Any one valid cause from the listed alternatives.'
	})
) {
	fail('Marked alternative mark-scheme rows should count as positive evidence.');
}
if (
	pipelineModule.positiveMarkSchemeItem({
		itemType: 'guidance',
		marks: 1,
		text: 'Ignore unqualified human error.'
	})
) {
	fail('Guidance rows should not count as positive evidence even when marks are malformed.');
}
const singleStepEvidenceFill = pipelineModule.sanitizeAnswerChainEvidenceIndexes({
	questions: [
		{
			sourceQuestionRef: '01.5',
			markSchemeItems: [
				{
					itemType: 'alternative',
					marks: 1,
					text: 'Any one valid practical cause.'
				}
			],
			answerChain: {
				id: 'bio-chain-suggest-practical-cause',
				title: 'Suggest a practical cause',
				canonicalChainText:
					'Use the investigation context to suggest one valid practical cause for the result.',
				summary: 'Reusable practical-cause suggestion chain.',
				steps: [
					{
						stepText: 'Suggest one valid practical cause.',
						stepRole: 'conclusion',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: []
					}
				]
			}
		}
	]
});
if (
	singleStepEvidenceFill.questions[0].answerChain.steps[0].markSchemeItemIndexes.join(',') !== '0'
) {
	fail('Single-step chains with one positive mark row should receive that evidence index.');
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

const unorderedAnswerKeyContext = pipelineModule.buildLearnerVisibleQuestionContext(
	{
		questions: [
			{
				sourceQuestionRef: '01.1',
				promptText: 'Complete the word equation.',
				stemBlocks: [],
				promptBlocks: [{ kind: 'text', text: 'Complete the word equation.' }],
				response: {
					kind: 'equation-blanks',
					correctAnswers: [
						{ targetId: 'b1', correctAnswer: 'carbon dioxide' },
						{ targetId: 'b2', correctAnswer: 'water' }
					],
					unorderedGroups: [{ targetIds: ['b1', 'b2'], answers: ['carbon dioxide', 'water'] }]
				},
				markSchemeItems: [{ itemType: 'mark', text: 'carbon dioxide and water in either order' }]
			}
		]
	},
	'01.1',
	{ attachImages: false }
);
if (
	unorderedAnswerKeyContext.targetAnswerKey.responseUnorderedGroups?.[0]?.targetIds?.join(',') !==
	'b1,b2'
) {
	fail('Solvability answer key omitted unordered response groups.', unorderedAnswerKeyContext);
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
function writeSyntheticProductionRun({ runRoot, runId, solvabilityRequiredRepairs = [] }) {
	const sourceDocumentId = path.basename(runRoot);
	const rawPath = path.join(runRoot, 'raw', `${sourceDocumentId}.json`);
	const evalPath = path.join(runRoot, 'eval', `${sourceDocumentId}.extraction.eval.json`);
	const reconciledPath = path.join(runRoot, 'chain-reconciled', `${sourceDocumentId}.json`);
	const reconcileSummaryPath = path.join(runRoot, 'chain-reconcile-summary.json');
	const importReadyRoot = path.join(runRoot, 'import-ready');
	const importReadyPath = path.join(importReadyRoot, `${sourceDocumentId}.json`);
	const importReadyAuditPath = path.join(runRoot, 'import-ready-audit.json');
	const summaryPath = path.join(runRoot, 'production-extraction-summary.json');
	for (const dir of [
		path.dirname(rawPath),
		path.dirname(evalPath),
		path.dirname(reconciledPath),
		importReadyRoot
	]) {
		mkdirSync(dir, { recursive: true });
	}
	const candidate = {
		sourceDocumentId,
		sourceDocument: { id: sourceDocumentId, subject: 'Biology', subjectArea: 'Biology' },
		markSchemeDocument: { id: `${sourceDocumentId}-ms` },
		questions: [
			{
				sourceQuestionRef: '01.1',
				promptText: 'State the energy source.',
				stemBlocks: [{ kind: 'paragraph', text: 'This question is about photosynthesis.' }],
				promptBlocks: [{ kind: 'paragraph', text: 'State the energy source.' }],
				response: { kind: 'lines', count: 1 },
				markSchemeItems: [{ itemType: 'mark', text: 'Light.', marks: 1 }],
				markChecklist: [
					{
						text: 'States light.',
						required: true,
						markSchemeItemIndexes: [0],
						needsHumanReview: false
					}
				],
				modelAnswer: {
					answerText: 'Light.',
					needsHumanReview: false,
					confidence: 0.95
				},
				answerChain: {
					id: 'bio-chain-identify-energy-source',
					title: 'Identify the required source from a science cue',
					canonicalChainText: 'Read the question cue and state the accepted source or category.',
					summary: 'Reusable source-identification chain.',
					steps: [
						{
							stepText: 'Identify the accepted source from the cue.',
							stepRole: 'conclusion',
							markSchemeItemIndexes: [0]
						}
					],
					needsHumanReview: false
				},
				chainResolution: {
					action: 'create_new',
					existingChainId: null,
					compatibilityRationale: 'New reusable chain.',
					identityStable: true
				},
				assets: [],
				needsHumanReview: false
			}
		]
	};
	const summaryPlan = {
		sourceDocumentId,
		rawOutputPath: path.relative(rootDir, rawPath),
		extractionEvalPath: path.relative(rootDir, evalPath),
		reconciledOutputPath: path.relative(rootDir, reconciledPath),
		reconcileSummaryPath: path.relative(rootDir, reconcileSummaryPath),
		importReadyRoot: path.relative(rootDir, importReadyRoot),
		importReadyAuditPath: path.relative(rootDir, importReadyAuditPath),
		summaryPath: path.relative(rootDir, summaryPath),
		runId,
		runSolvability: true,
		skipExtractionJudge: false,
		skipChainJudge: false,
		importMode: 'dry-run'
	};
	writeFileSync(rawPath, JSON.stringify(candidate, null, 2));
	writeFileSync(reconciledPath, JSON.stringify(candidate, null, 2));
	writeFileSync(importReadyPath, JSON.stringify(candidate, null, 2));
	writeFileSync(
		evalPath,
		JSON.stringify(
			{
				status: 'passed',
				judgeMode: 'question-batches',
				judgeBatchSize: 8,
				judgeConcurrency: 2,
				questionCount: 1,
				completedBatches: 1,
				mechanicalErrors: [],
				deterministicBlockingIssues: [],
				judge: { verdict: 'pass', score: 0.91, requiredRepairs: [] },
				batches: [
					{
						index: 1,
						sourceQuestionRefs: ['01.1'],
						questionPages: [1],
						status: 'passed',
						mechanicalErrors: [],
						deterministicBlockingIssues: [],
						judge: { verdict: 'pass', score: 0.91, requiredRepairs: [] }
					}
				]
			},
			null,
			2
		)
	);
	writeFileSync(
		reconcileSummaryPath,
		JSON.stringify(
			{
				status: 'passed',
				finalBlockingRefs: 0,
				finalWarningRefs: 0,
				files: [
					{
						file: path.relative(rootDir, rawPath),
						status: 'passed',
						judge: {
							status: 'passed',
							judgeVerdict: 'pass',
							judgeScore: 0.92,
							requiredRepairs: []
						}
					}
				]
			},
			null,
			2
		)
	);
	writeFileSync(
		importReadyAuditPath,
		JSON.stringify(
			{
				status: 'passed',
				mechanical: {
					status: 'passed',
					fileCount: 1,
					questionCount: 1,
					errorCount: 0,
					warningCount: 0,
					files: [
						{
							file: path.relative(rootDir, importReadyPath),
							sourceDocumentId,
							questionCount: 1,
							status: 'passed',
							errors: [],
							warnings: []
						}
					]
				},
				solvability: {
					enabled: true,
					status: 'passed',
					planned: 1,
					completed: 1,
					passed: 1,
					failed: 0,
					results: [
						{
							sourceQuestionRef: '01.1',
							status: 'passed',
							judge: {
								score: 0.94,
								requiredRepairs: solvabilityRequiredRepairs,
								missingContext: [],
								renderFindings: []
							}
						}
					]
				}
			},
			null,
			2
		)
	);
	writeFileSync(
		summaryPath,
		JSON.stringify(
			{
				status: 'passed',
				plan: summaryPlan,
				steps: [
					{ label: 'PDF extraction', status: 'passed' },
					{ label: 'answer-chain reconciliation', status: 'passed' },
					{ label: 'strict import-ready preparation', status: 'passed' }
				],
				importReady: {
					status: 'passed',
					outputRoot: path.relative(rootDir, importReadyRoot),
					auditOutput: path.relative(rootDir, importReadyAuditPath),
					runSolvability: true,
					importMode: 'dry-run',
					keptQuestions: 1,
					droppedQuestions: 0,
					importResults: [{ sourceDocumentId, mode: 'dry-run', questions: 1 }]
				}
			},
			null,
			2
		)
	);
	return { summaryPath };
}
const productionVerifierLogDir = path.join(tmpDir, 'production-verifier-logs');
mkdirSync(productionVerifierLogDir, { recursive: true });
function writeVerifierLlmLog(runId) {
	const records = [];
	for (const label of [
		'extract-full-paper:test-paper:all',
		'judge-extraction:test-paper',
		'judge-rubric:test-paper',
		'judge-solvability:test-paper:01.1'
	]) {
		const callId = `${records.length + 1}-${label}`;
		records.push({ type: 'llm_call_started', runId, callId, label, model: 'test-model' });
		records.push({
			type: 'llm_call_completed',
			runId,
			callId,
			label,
			model: 'test-model',
			ok: true,
			costUsd: 0.001,
			usage: { totalTokens: 10 }
		});
	}
	writeFileSync(
		path.join(productionVerifierLogDir, `${runId}.jsonl`),
		records.map((record) => JSON.stringify(record)).join('\n')
	);
}
const validProductionRunId = 'test-production-run-valid';
writeVerifierLlmLog(validProductionRunId);
const validProductionRun = writeSyntheticProductionRun({
	runRoot: path.join(tmpDir, 'production-run-valid'),
	runId: validProductionRunId
});
const verifierResult = JSON.parse(
	runNodeScript('scripts/verify-production-extraction-run.mjs', [
		`--summary=${validProductionRun.summaryPath}`,
		`--log-dir=${productionVerifierLogDir}`
	])
);
if (
	verifierResult.status !== 'passed' ||
	verifierResult.questionCounts.importReady !== 1 ||
	!verifierResult.llmLog?.labelPrefixes?.includes('judge-solvability')
) {
	fail('Production extraction verifier did not pass a complete synthetic run.', verifierResult);
}
const staleProductionRunId = 'test-production-run-stale';
writeVerifierLlmLog(staleProductionRunId);
const staleProductionRun = writeSyntheticProductionRun({
	runRoot: path.join(tmpDir, 'production-run-stale'),
	runId: staleProductionRunId,
	solvabilityRequiredRepairs: ['Remove duplicated learner-visible context.']
});
const staleVerifierOutput = runNodeScriptExpectFailure(
	'scripts/verify-production-extraction-run.mjs',
	[`--summary=${staleProductionRun.summaryPath}`, `--log-dir=${productionVerifierLogDir}`]
);
if (!staleVerifierOutput.includes('solvability judge must not request required repairs')) {
	fail(
		'Production verifier did not reject stale solvability required repairs.',
		staleVerifierOutput
	);
}
const productionBatchDataRoot = path.join(tmpDir, 'production-batch-data');
mkdirSync(path.join(productionBatchDataRoot, 'question-papers'), { recursive: true });
mkdirSync(path.join(productionBatchDataRoot, 'mark-schemes'), { recursive: true });
mkdirSync(path.join(productionBatchDataRoot, 'supporting-documents'), { recursive: true });
writeFileSync(path.join(productionBatchDataRoot, 'question-papers', 'QP.PDF'), 'fake qp');
writeFileSync(path.join(productionBatchDataRoot, 'mark-schemes', 'MS.PDF'), 'fake ms');
writeFileSync(path.join(productionBatchDataRoot, 'supporting-documents', 'INS.PDF'), 'fake insert');
const productionBatchManifestPath = path.join(tmpDir, 'production-batch-manifest.json');
writeFileSync(
	productionBatchManifestPath,
	JSON.stringify(
		{
			board: 'AQA',
			qualification: 'GCSE',
			tier: 'Higher',
			rows: [
				{
					series: 'June 2026',
					year: 2026,
					board: 'AQA',
					qualification: 'GCSE',
					subject: 'Biology',
					subject_area: 'Biology',
					tier: 'Higher',
					paper: 'Biology Paper 1',
					component: '84611H',
					source_document_id: 'aqa-test-qp-jun26',
					mark_scheme_document_id: 'aqa-test-ms-jun26',
					question_paper: {
						filename: 'QP.PDF',
						title: 'Question paper test',
						url: 'https://example.test/qp.pdf'
					},
					mark_scheme: {
						filename: 'MS.PDF',
						title: 'Mark scheme test',
						url: 'https://example.test/ms.pdf'
					},
					supporting_documents: [{ filename: 'INS.PDF' }]
				}
			]
		},
		null,
		2
	)
);
const productionBatchDryRun = JSON.parse(
	runNodeScript('scripts/run-production-extraction-batch.mjs', [
		`--manifest=${productionBatchManifestPath}`,
		`--data-root=${productionBatchDataRoot}`,
		'--all',
		'--dry-run',
		'--concurrency=2',
		'--paper-attempts=2',
		'--solvability-concurrency=3',
		'--run-id-prefix=test-production-batch',
		'--chunk-pages=2',
		'--existing-chain-input-root=tmp/import-ready-existing'
	])
);
const productionBatchCommand = productionBatchDryRun.planned?.[0]?.command?.join('\n') ?? '';
if (
	productionBatchDryRun.status !== 'dry-run' ||
	productionBatchDryRun.selected !== 1 ||
	!productionBatchCommand.includes('scripts/run-production-extraction-pipeline.mjs') ||
	!productionBatchCommand.includes('--supporting-document=') ||
	!productionBatchCommand.includes('--concurrency=3') ||
	!productionBatchCommand.includes('--run-id=test-production-batch-aqa-test-qp-jun26') ||
	!productionBatchCommand.includes('--existing-chain-input-root=tmp/import-ready-existing')
) {
	fail('Production batch dry-run did not plan a full per-paper production command.', {
		productionBatchDryRun,
		productionBatchCommand
	});
}
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
