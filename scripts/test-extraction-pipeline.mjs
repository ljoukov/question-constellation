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

function requireExcludes(text, values, label) {
	const present = values.filter((value) => text.includes(value));
	if (present.length > 0) fail(`${label} includes forbidden text.`, present);
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
const codexPdfExtractionSource = readText(
	path.join(rootDir, 'scripts/run-codex-pdf-extraction.mjs')
);
const codexExtractionJudgeSource = readText(
	path.join(rootDir, 'scripts/run-codex-extraction-judge.mjs')
);
const codexExtractionRepairSource = readText(
	path.join(rootDir, 'scripts/run-codex-extraction-repair.mjs')
);
const codexAnswerChainsSource = readText(path.join(rootDir, 'scripts/run-codex-answer-chains.mjs'));
const codexSolvabilityJudgeSource = readText(
	path.join(rootDir, 'scripts/run-codex-solvability-judge.mjs')
);
const codexProductionImportSource = readText(
	path.join(rootDir, 'scripts/run-codex-production-import-pipeline.mjs')
);
const codexProductionImportBatchSource = readText(
	path.join(rootDir, 'scripts/run-codex-production-import-batch.mjs')
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
	'scripts/run-codex-extraction-judge.mjs',
	'scripts/run-codex-answer-chains.mjs',
	'scripts/run-codex-solvability-judge.mjs',
	'scripts/run-codex-production-import-pipeline.mjs',
	'scripts/run-codex-production-import-batch.mjs',
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
	'scripts/run-codex-extraction-judge.mjs',
	'scripts/run-codex-extraction-repair.mjs',
	'scripts/codex-pdf-tools.sh',
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
		'pnpm run codex:solvability-judge',
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
		'run-legacy-chain-style-judge',
		'run-legacy-solvability',
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
	['pdftotext', '-bbox-layout', 'Figure', 'choose_vertical_crop', 'bboxNormalized'],
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
		'assemble-extraction-fragments',
		'normalize-extraction',
		'validate-extraction',
		'validate-chain',
		'structured_fields',
		'tick_box',
		'equation_completion',
		'fixed_response_missing_answer_key',
		'answer_chain_canonical_not_memory_links',
		'answer_chain_step_label_too_long',
		'response_asset_not_renderable',
		'image_label_zones_missing_labels',
		'image_label_zones_missing_zones',
		'diagram_response_surface_missing',
		'referenced_media_missing_asset',
		'render_block_duplicate_text',
		'table_asset_canvas_response',
		'mark_scheme_under_granular_any_n',
		'mark_checklist_overrequires_alternatives',
		'known_response_line_count_mismatch',
		'labeled_lines_missing_labels',
		'known_mark_scheme_allowance_missing',
		'known_fixed_response_option_not_verbatim',
		'known_survey_context_missing',
		'known_graph_plotting_mark_scheme_mismatch',
		'known_level_response_descriptors_missing',
		'known_self_contained_answer_leak',
		'known_source_label_mismatch',
		'context_text_duplicates_render_block',
		'known_figure_crop_incomplete',
		'known_figure_key_text_missing',
		'asset_crop_contains_prompt_text',
		'genericFigureCropPromptTextIssues',
		'imageOcrTextForAsset',
		'known_figure_crop_prompt_contamination',
		'known_ring_choice_flattened',
		'known_algorithm_context_missing',
		'aqa-computer-science-2023-june-paper-2-computing-concepts-qp',
		"'07.2': 8",
		"'08.2': 12",
		"'10.2': 6",
		"'13.4': 3",
		"'13.5': 4",
		"'14.3': 2",
		'Figure 3 logic-circuit image asset must include the complete circuit',
		"'16.3': 18",
		'knownComputerScience2023Paper2FigureCropIssues',
		'knownComputerScience2023Paper2ResponseIssues',
		'knownComputerScience2023Paper2SqlIssues',
		'complete visible 16-cell RLE bit pattern',
		'Loan row L0007',
		'known_sql_skeleton_duplicate_response',
		'known_missing_response_control',
		'known_database_context_missing',
		'common_weak_answer_missing_confidence',
		'known_paired_boundary_answer_encoded_as_independent_aliases',
		'Q03.0 official mark-scheme split is 10111; 100;',
		"'07.3': 5"
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
		'pdf-tools.sh',
		'bash pdf-tools.sh',
		'Do not run git',
		'Do not create final answer chains',
		'write those records incrementally as small JSON fragments under question-fragments/',
		'assemble-extraction-fragments',
		'Do not wait until the whole paper is observed before writing any question data',
		'normalize-extraction',
		'validate-extraction',
		'expected-marks',
		'expected-questions',
		'question-paper.pdf',
		'mark-scheme.pdf',
		'events.jsonl',
		'gpt-5.5',
		'Do not duplicate learner-visible setup',
		'Use image-label-zones only when the response surface is a real extracted/rendered image asset',
		'Do not count the gaps between rules and do not subtract one from the number of rules',
		'Attach the same figure/table dependency to every atomic subquestion that refers to it',
		'For Computer Science code, SQL, pseudo-code',
		'carry that earlier dependency forward',
		'structured code/table blocks over extra screenshot assets',
		'Do not use independent aliases when two visible blanks/cells must be paired',
		'For Q03.2, the boundary test row has paired acceptable answers',
		'response.choiceOptions',
		'Ring your chosen method',
		'response space continues on the next page',
		'For labeled written responses',
		'Known fragile checks for Computer Science 2024 Paper 2',
		'Known fragile checks for Computer Science 2023 Paper 2',
		'02.1 = 2',
		'15.0 = 18',
		'16.3 = 18',
		'count both visible working lines and the printed final answer line',
		'07.2 = 8',
		'07.3 = 5',
		'08.2 = 12 total',
		'10.2 = 6 total',
		'13.4 = 3',
		'13.5 = 4 total',
		'14.3 = 2',
		'For Q03.0, the paper leaves an unruled blank workspace',
		'The official mark-scheme split is 10111; 100;',
		'Q07.2, Figure 1 is the 5 by 5 bitmap only',
		'Figure 2 is a simple 16-cell RLE bit pattern',
		'For Q11.2 and Q11.3, Figure 3 must include the complete logic circuit',
		'Q14.5 must include enough learner-visible Student and Loan table data',
		'Loan table through row L0007',
		'For Q14.5, render the DELETE FROM / WHERE SQL skeleton exactly once',
		'If an interactive response control already renders a SQL/code skeleton with blanks',
		'pageCount: pdfPageCount',
		'01.1 = 2',
		'01.2 = 5',
		'02.2 = 5',
		'13.1 = 4',
		'learner label bank must be AND, XOR, NOT',
		'08.2 = 6 total',
		'02.4 = 3 visible ruled lines',
		'11.0 = 37 across pages 22 and 23',
		'14.2 = 40 across pages 35 and 36',
		'15.0 = 35 editable code-grid rows',
		'For Q08.0, the official trace-table response must preserve the whole table progression',
		'intermediate retained weeks states [4,0,0], [4,6,0], [4,6,2]',
		'01.2 has four visible working lines plus a final keyed hexadecimal answer field',
		'System software = 3 lines and Application software = 3 lines',
		'02.3 = 2',
		'04.2 = 2 lines for each of the four numbered function fields',
		'15.3 = 3 lines for each of the two numbered reason fields',
		'For Q17.3, key the Huffman tree response by path from the rendered tree and Figure 3',
		'root-left/code 0 = I, node-7-right/code 11 = S, and node-3-right/code 101 = P',
		'complete model answer must be 11010101',
		'Do not put solved or derived facts into learner-visible prompts',
		'Figure 5 on page 12 should include the title',
		'For Q07.1, preserve the official truth-table answer options A-D',
		'For Q03.0 and Q09.1, preserve the official partial-mark split',
		'do not use ambiguous plain text such as "A-bar"',
		'response.lineCountEvidence',
		'leaf labels',
		'07.1 = 7',
		'07.3 = 16',
		'02.3 = 14',
		'06.7 = 10',
		'every visible blank segment must have a matching response.correctAnswers target',
		'Figure and response-surface assets must be complete learner-visible crops',
		'For Ordnance Survey map extracts and other grid-reference maps',
		'readable eastings and northings on the relevant margins',
		'0870, 0970, or 7109',
		'Do not use asset-canvas for tables that can be represented structurally',
		'one positive markSchemeItems row per independently awardable mark',
		'A question must not have more required checklist rows than its mark value',
		'01.2 = 4',
		'Q02.4 mark-scheme/checklist/model grading support includes the official allowed answer "diffusion"',
		'Million Women survey setup',
		'3 or 4 correct plots earns 1 mark',
		'official level-of-response mark bands/descriptors',
		'copy every learner-visible option exactly from the question paper',
		'For Q02.3, copy the multiple-choice options verbatim from the question paper',
		'For Figure 6/Q02.4',
		'The learner-visible key must include Tropical forest',
		'For Figure 9 and Figure 10/Q02.9',
		'For Figure 13/Q03.7',
		'For Q03.6, Q04.6, and Q05.6',
		'For Figure 20/Q05.7',
		'Q01.3/Figure 2 is an asset-canvas graph-completion response',
		'x-axis numerical scale 0, 100, 200, ... 1000',
		'Q02.3/Figure 6 requires the complete official Southampton Science Park learner source',
		'text block and all three photographs',
		'Distance from source (km)',
		'Do not represent such questions as response.kind="lines" or "labeled-lines" alone',
		'A crop that ends mid-grid or before the x-axis labels is invalid',
		'Y endpoint down to 0 m',
		'crop to the figure boundary',
		'selfContainedPromptText must not reveal the completed equation',
		'Figure 2 includes the complete Mesophyll cell label',
		'Figure 4 includes the full key including Water molecules and Nitrate ions',
		'Figure 6 includes the full cell-cycle chart and Stage 1 label',
		'Figure 9 includes the full Nodules label and arrows',
		'asset whose OCR includes surrounding task text such as "Study Figure"',
		'must not say that Large water plant is the producer',
		'do not shorten it to "water plant"',
		'between contextText and rendered blocks'
	],
	'Codex PDF extraction runner'
);

requireIncludes(
	codexExtractionJudgeSource,
	[
		'runCodexSdkTurn',
		'candidate.json',
		'question-paper.pdf',
		'mark-scheme.pdf',
		'pdf-tools.sh',
		'judge-report.json',
		'mechanical-validation.json',
		'Q07.1 has 7 visible ruled answer lines',
		'Q07.3 has 16 visible ruled answer lines',
		'Do not judge answer-chain style',
		'Do not inspect the repository',
		'learner-rendering judge',
		'judge learner-visible option text against the question paper',
		'Inspect labelled structured-table/table/key/equation blocks before declaring a referenced Figure/Table missing',
		'For Geography 2023 Paper 1 Q02.1 and Q02.3',
		'For Geography 2022 Paper 1 Q02.3',
		'requiredRepairs'
	],
	'Codex extraction judge runner'
);

requireIncludes(
	codexExtractionRepairSource,
	[
		'judge-report.json and validation-report.json as the authoritative list of current defects',
		'Do not apply repairs from other papers',
		'do not encode conditionally paired alternatives as independent response.correctAnswers aliases',
		'For Ordnance Survey map extracts and other grid-reference maps',
		'readable eastings and northings on the relevant margins',
		'Use bash pdf-tools.sh for PDF observation commands',
		'do not call helper.mjs pdf-info',
		'repaired-extraction.json',
		'repair-validation.json',
		'answer-chain-specificity.mjs'
	],
	'Codex extraction repair runner'
);
requireExcludes(
	codexExtractionRepairSource,
	['failed Biology Nov 2020', 'Preserve the already-correct Q07.1'],
	'Codex extraction repair runner'
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
		'do not put exact table names',
		'validate-chain',
		'chain-reconciled.json',
		'chain-validation-repair-attempts',
		'validation-repair-summary',
		'deterministic answer-chain validation',
		'run-legacy-chain-style-judge',
		'skip-chain-style-judge',
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
		'scripts/run-codex-solvability-judge.mjs',
		'scripts/prepare-import-ready-extraction.mjs',
		'scripts/upload-r2-images.mjs',
		'--skip-solvability',
		'--run-legacy-solvability',
		'--solvability-timeout-ms',
		'--skip-r2-upload',
		'--allow-dropped-questions',
		'--import',
		'codex-production-import-summary.json',
		'codex-extraction-summary.json',
		'codex-chain-summary.json',
		'importReadyAuditPath',
		'solvabilitySummaryPath',
		'importReadyPaperPath',
		'--check-existing',
		'--skip-d1-conflict-check',
		"stringArg('extraction-thinking-level'",
		"stringArg('chain-thinking-level'",
		"stringArg('solvability-thinking-level'"
	],
	'Codex production import orchestrator'
);

requireIncludes(
	codexProductionImportBatchSource,
	[
		'scripts/run-codex-production-import-pipeline.mjs',
		'--manifest=data/aqa-gcse-history-geography-computer-science/manifest.json',
		'--solvability-concurrency',
		'--continue-on-error',
		'--allow-dropped-questions',
		'paperAttempts',
		'paperSummary?.solvabilitySummary?.codex',
		'codex: {',
		'runCommandWithRetry'
	],
	'Codex production import batch orchestrator'
);

requireIncludes(
	codexSolvabilityJudgeSource,
	[
		'runCodexSdkTurn',
		'buildLearnerVisibleQuestionContext',
		'solvability-contexts.json',
		'solvability-report.json',
		'studentVisibleSolvable',
		'markSchemeFits',
		'requiredRepairs',
		'studentVisibleContext.sections[*].blocks.stem',
		'structured table rendered there is visible evidence',
		'inspect the local image file under assets/',
		'assetCopyPairs',
		'--target-only',
		'gpt-5.5',
		'xhigh'
	],
	'Codex solvability judge'
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
		'allow-shared-chain-updates',
		'validateRenderJsonForApp',
		'asset-canvas assetId must be a string',
		'image-label-zones needs at least one target zone'
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
		'--allow-dropped-questions',
		'Import-ready subset dropped',
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
		'max-question-refs',
		"hasArg('d1')",
		'fetchPublicChains',
		'max-examples-per-chain'
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
	'codex:extraction-judge',
	'codex:answer-chains',
	'codex:solvability-judge',
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

if (
	packageJson.scripts?.['extract:production'] !==
	'node scripts/run-codex-production-import-pipeline.mjs'
) {
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
		'--source-document-id=',
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
	'scripts/run-codex-solvability-judge.mjs',
	'scripts/run-codex-production-import-pipeline.mjs',
	'scripts/run-codex-production-import-batch.mjs',
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
						},
						{
							kind: 'formula',
							text: '\\overline{A} + B'
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
				},
				{
					sourceQuestionRef: '01.3',
					promptText: 'Complete the Unicode value for w.',
					marks: 1,
					pageStart: 2,
					pageEnd: 2,
					response: {
						kind: 'equation-blanks',
						segments: [
							{ kind: 'text', text: 'w Unicode value = ' },
							{ kind: 'blank', id: 'unicode-w', label: 'w Unicode value' }
						],
						correctAnswers: [{ targetId: 'unicode-w', correctAnswer: '119 or 77' }]
					},
					markSchemeItems: [{ itemType: 'mark', text: '119 or 77.' }],
					markChecklist: [{ text: 'Gives the decimal or hexadecimal code.', markSchemeItemIndexes: [0] }]
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
	?.stemBlocks?.find((block) => block.kind === 'structured-table' && block.label === 'Table 1');
if (!propagatedTable || propagatedTable.rows?.length !== 2) {
	fail(
		'Codex helper normalization did not propagate shared parent table blocks.',
		helperNormalized
	);
}
if (propagatedTable.rows?.[0]?.[0]?.text !== 'Temperature') {
	fail('Codex helper normalization did not canonicalize structured-table string cells.', {
		propagatedTable
	});
}
const normalizedFormulaBlock = helperNormalized.questions
	.find((question) => question.sourceQuestionRef === '01.1')
	?.stemBlocks?.find((block) => block.text === '\\overline{A} + B');
if (normalizedFormulaBlock?.kind !== 'equation') {
	fail('Codex helper normalization did not canonicalize formula blocks to equation blocks.', {
		normalizedFormulaBlock
	});
}
const normalizedAliasAnswer = helperNormalized.questions
	.find((question) => question.sourceQuestionRef === '01.3')
	?.response?.correctAnswers?.find((answer) => answer.targetId === 'unicode-w');
if (
	normalizedAliasAnswer?.correctAnswer !== '119' ||
	normalizedAliasAnswer?.aliases?.join(',') !== '77'
) {
	fail('Codex helper normalization did not convert literal alternatives into aliases.', {
		normalizedAliasAnswer
	});
}

const helperChainValidationInput = path.join(helperNormalizeDir, 'bad-fixed-chain.json');
const helperChainValidationOutput = path.join(helperNormalizeDir, 'bad-fixed-chain-validation.json');
writeFileSync(
	helperChainValidationInput,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'test-fixed-chain-paper',
				docType: 'question_paper',
				subject: 'Geography',
				subjectArea: 'Geography',
				pageCount: 20
			},
			markSchemeDocument: { id: 'test-fixed-chain-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '02.3',
					promptText: 'Complete the paragraph using the correct word.',
					marks: 1,
					pageStart: 4,
					pageEnd: 4,
					response: {
						kind: 'equation-blanks',
						segments: [
							{ kind: 'text', text: 'Orchid plants are an example of a ' },
							{ kind: 'blank', id: 'blank-1', label: 'role' }
						],
						correctAnswers: [{ targetId: 'blank-1', correctAnswer: 'producer' }]
					},
					markSchemeItems: [{ itemType: 'mark', text: 'Producer.' }],
					markChecklist: [{ text: 'Completes the blank as producer.', markSchemeItemIndexes: [0] }],
					answerChain: {
						id: 'geo-chain-ecosystem-blank-concepts',
						title: 'Ecosystem Blanks',
						canonicalChainText: 'cue -> producer role',
						summary: 'Match ecology role.',
						steps: [
							{
								stepText: 'cue',
								stepRole: 'given',
								explanation: 'Read the context.',
								commonOmission: 'The cue matters.',
								markSchemeItemIndexes: [0]
							},
							{
								stepText: 'producer role',
								stepRole: 'conclusion',
								explanation: 'Select the plant role.',
								commonOmission: 'The role must fit the organism.',
								markSchemeItemIndexes: [0]
							}
						]
					}
				}
			]
		},
		null,
		2
	)
);
runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-chain',
	`--input=${helperChainValidationInput}`,
	`--output=${helperChainValidationOutput}`
]);
const helperChainValidation = JSON.parse(readText(helperChainValidationOutput));
if (
	helperChainValidation.status !== 'failed' ||
	!helperChainValidation.blockingIssues.some(
		(issue) =>
			issue.code === 'chain_exact_fixed_answer_text' &&
			issue.sourceQuestionRef === '02.3' &&
			issue.field === 'answerChain.steps[1].stepText'
	)
) {
	fail('Codex helper validate-chain did not reject exact fixed-response answer chain text.', {
		helperChainValidation
	});
}

const helperFragmentsDir = path.join(rootDir, 'tmp/test-codex-helper-fragments');
const helperQuestionFragmentsDir = path.join(helperFragmentsDir, 'question-fragments');
mkdirSync(helperQuestionFragmentsDir, { recursive: true });
writeFileSync(
	path.join(helperFragmentsDir, 'metadata.json'),
	JSON.stringify(
		{
			sourceDocumentId: 'test-fragment-paper',
			markSchemeDocumentId: 'test-fragment-ms',
			questionPaper: {
				id: 'test-fragment-paper',
				docType: 'question_paper',
				subject: 'Computer Science',
				subjectArea: 'Computer Science',
				title: 'Fragment test paper',
				pageCount: 4
			},
			markScheme: {
				id: 'test-fragment-ms',
				docType: 'mark_scheme',
				subject: 'Computer Science',
				subjectArea: 'Computer Science',
				title: 'Fragment test mark scheme',
				pageCount: 4
			}
		},
		null,
		2
	)
);
writeFileSync(
	path.join(helperQuestionFragmentsDir, 'q01.json'),
	JSON.stringify(
		{
			questions: [
				{
					sourceQuestionRef: '01.1',
					displayOrder: 1,
					promptText: 'State one purpose of a register.',
					selfContainedPromptText: 'State one purpose of a register.',
					marks: 1,
					pageStart: 2,
					pageEnd: 2,
					response: { kind: 'lines', count: 2, lineCountEvidence: 'Rendered crop shows 2 ruled lines.' },
					markSchemeItems: [{ itemType: 'mark', text: 'Stores data currently being used.' }],
					markChecklist: [{ text: 'States a valid register purpose.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'A register stores data currently being used by the CPU.' }
				}
			]
		},
		null,
		2
	)
);
writeFileSync(
	path.join(helperQuestionFragmentsDir, 'q02.json'),
	JSON.stringify(
		{
			questions: [
				{
					sourceQuestionRef: '02.1',
					displayOrder: 2,
					promptText: 'Explain one benefit of using hexadecimal.',
					selfContainedPromptText: 'Explain one benefit of using hexadecimal.',
					marks: 2,
					pageStart: 3,
					pageEnd: 3,
					response: { kind: 'lines', count: 3, lineCountEvidence: 'Rendered crop shows 3 ruled lines.' },
					markSchemeItems: [
						{ itemType: 'mark', text: 'Hexadecimal is shorter than binary.' },
						{ itemType: 'mark', text: 'It is easier for humans to read or transcribe.' }
					],
					markChecklist: [
						{ text: 'Identifies that hexadecimal is shorter.', markSchemeItemIndexes: [0] },
						{ text: 'Links this to human readability.', markSchemeItemIndexes: [1] }
					],
					modelAnswer: {
						answerText:
							'Hexadecimal is shorter than binary, so long values are easier for humans to read.'
					}
				}
			]
		},
		null,
		2
	)
);
const helperFragmentsRaw = path.join(helperFragmentsDir, 'extraction.json');
const helperFragmentsNormalized = path.join(helperFragmentsDir, 'normalized.json');
const helperFragmentsValidation = path.join(helperFragmentsDir, 'validation.json');
runNodeScript('scripts/codex-import-helper.mjs', [
	'assemble-extraction-fragments',
	`--fragments-dir=${helperQuestionFragmentsDir}`,
	`--output=${helperFragmentsRaw}`,
	`--metadata=${path.join(helperFragmentsDir, 'metadata.json')}`
]);
runNodeScript('scripts/codex-import-helper.mjs', [
	'normalize-extraction',
	`--input=${helperFragmentsRaw}`,
	`--output=${helperFragmentsNormalized}`,
	`--metadata=${path.join(helperFragmentsDir, 'metadata.json')}`
]);
runNodeScript('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${helperFragmentsNormalized}`,
	'--expected-marks=3',
	'--expected-questions=2',
	`--output=${helperFragmentsValidation}`
]);
const helperFragmentValidation = JSON.parse(readText(helperFragmentsValidation));
if (
	helperFragmentValidation.status !== 'passed' ||
	helperFragmentValidation.questionCount !== 2 ||
	helperFragmentValidation.markTotal !== 3
) {
	fail('Codex helper fragment assembly did not produce a valid extraction.', {
		helperFragmentValidation
	});
}

const invalidImageLabelExtractionPath = path.join(helperNormalizeDir, 'invalid-image-label.json');
writeFileSync(
	invalidImageLabelExtractionPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'test-paper', docType: 'question_paper', pageCount: 6 },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme', pageCount: 2 },
			questions: [
				{
					sourceQuestionRef: '01.1',
					promptText: 'Select the anomalous value from Table 1.',
					marks: 1,
					pageStart: 2,
					pageEnd: 2,
					response: {
						kind: 'image-label-zones',
						assetLabel: 'Table 1',
						correctAnswers: [{ targetId: 'row-1', correctAnswer: '14.2' }]
					},
					assets: [{ sourceLabel: 'Table 1', role: 'data-table' }],
					markSchemeItems: [{ itemType: 'mark', text: '14.2 selected.' }],
					markChecklist: [{ text: 'Selects 14.2.', markSchemeItemIndexes: [0] }]
				}
			]
		},
		null,
		2
	)
);
const imageLabelFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${invalidImageLabelExtractionPath}`,
	'--expected-marks=1',
	'--expected-questions=1'
]);
for (const code of [
	'response_asset_not_renderable',
	'image_label_zones_missing_labels',
	'image_label_zones_missing_zones'
]) {
	if (!imageLabelFailure.includes(code)) {
		fail(`Codex helper validation did not reject invalid image-label-zones with ${code}.`, {
			imageLabelFailure
		});
	}
}

const duplicateRenderTextPath = path.join(helperNormalizeDir, 'duplicate-render-text.json');
writeFileSync(
	duplicateRenderTextPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'test-paper', docType: 'question_paper', pageCount: 6 },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme', pageCount: 2 },
			questions: [
				{
					sourceQuestionRef: '01.2',
					promptText: 'The deadly nightshade plant has poisonous berries. Name the substance.',
					marks: 1,
					pageStart: 4,
					pageEnd: 4,
					stemBlocks: [
						{ kind: 'paragraph', text: 'The deadly nightshade plant has poisonous berries.' }
					],
					promptBlocks: [
						{
							kind: 'paragraph',
							text: 'The deadly nightshade plant has poisonous berries. Name the substance.'
						}
					],
					response: { kind: 'lines', count: 1 },
					markSchemeItems: [{ itemType: 'mark', text: 'Atropine.' }],
					markChecklist: [{ text: 'Names atropine.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'Atropine.' }
				}
			]
		},
		null,
		2
	)
);
const duplicateRenderFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${duplicateRenderTextPath}`,
	'--expected-marks=1',
	'--expected-questions=1'
]);
if (!duplicateRenderFailure.includes('render_block_duplicate_text')) {
	fail('Codex helper validation did not reject duplicated learner-visible render text.', {
		duplicateRenderFailure
	});
}

const missingReferencedMediaPath = path.join(helperNormalizeDir, 'missing-referenced-media.json');
writeFileSync(
	missingReferencedMediaPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'test-paper', docType: 'question_paper' },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '01.3',
					promptText: 'Use Figure 1 to describe the pattern.',
					marks: 1,
					pageStart: 5,
					pageEnd: 5,
					stemBlocks: [{ kind: 'paragraph', text: 'Figure 1 shows a graph.' }],
					promptBlocks: [{ kind: 'paragraph', text: 'Use Figure 1 to describe the pattern.' }],
					response: { kind: 'lines', count: 1 },
					markSchemeItems: [{ itemType: 'mark', text: 'Describes the pattern.' }],
					markChecklist: [{ text: 'Describes the graph pattern.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'The value increases.' }
				}
			]
		},
		null,
		2
	)
);
const missingMediaFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${missingReferencedMediaPath}`,
	'--expected-marks=1',
	'--expected-questions=1'
]);
if (!missingMediaFailure.includes('referenced_media_missing_asset')) {
	fail('Codex helper validation did not reject a referenced Figure without a renderable asset.', {
		missingMediaFailure
	});
}

const copyrightPlaceholderPath = path.join(helperNormalizeDir, 'copyright-placeholder-media.json');
writeFileSync(
	copyrightPlaceholderPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'test-paper', docType: 'question_paper', pageCount: 6 },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme', pageCount: 2 },
			questions: [
				{
					sourceQuestionRef: '02.1',
					promptText: 'Use Figure 7 to name the producer in the food web.',
					marks: 1,
					pageStart: 4,
					pageEnd: 4,
					contextText:
						'Figure 7 cannot be reproduced here due to third-party copyright restrictions.',
					assets: [{ sourceLabel: 'Figure 7', publicPath: '/assets/source-placeholder.png' }],
					response: { kind: 'lines', count: 1 },
					markSchemeItems: [{ itemType: 'answer', text: 'Large water plant.' }],
					markChecklist: [{ text: 'Names the producer.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'The producer is the large water plant.' }
				}
			]
		},
		null,
		2
	)
);
const copyrightPlaceholderFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${copyrightPlaceholderPath}`,
	'--expected-marks=1',
	'--expected-questions=1'
]);
if (!copyrightPlaceholderFailure.includes('media_copyright_placeholder')) {
	fail('Codex helper validation did not reject learner-visible copyright-placeholder media.', {
		copyrightPlaceholderFailure
	});
}

const missingDiagramSurfacePath = path.join(helperNormalizeDir, 'missing-diagram-surface.json');
writeFileSync(
	missingDiagramSurfacePath,
	JSON.stringify(
		{
			sourceDocument: { id: 'test-paper', docType: 'question_paper', pageCount: 6 },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme', pageCount: 2 },
			questions: [
				{
					sourceQuestionRef: '03.6',
					promptText:
						'Explain how a wave cut platform is formed as a cliff is eroded. Use one or more diagrams to support your answer.',
					marks: 4,
					pageStart: 5,
					pageEnd: 5,
					promptBlocks: [
						{
							kind: 'paragraph',
							text: 'Explain how a wave cut platform is formed as a cliff is eroded.'
						},
						{ kind: 'paragraph', text: 'Use one or more diagrams to support your answer.' }
					],
					response: {
						kind: 'lines',
						lineCount: 6,
						lineCountEvidence: 'Rendered page shows six ruled lines.'
					},
					markSchemeItems: [
						{
							itemType: 'level_descriptor',
							text: 'Max lower Level 2 if diagram is not used.'
						},
						{ itemType: 'mark', text: 'Explains notch formation and cliff retreat.' }
					],
					markChecklist: [
						{ text: 'Uses a labelled diagram.', markSchemeItemIndexes: [0] },
						{ text: 'Explains erosion and retreat.', markSchemeItemIndexes: [1] }
					],
					modelAnswer: {
						answerText:
							'A labelled diagram shows a notch cut by erosion, collapse, retreat and the platform left behind.'
					}
				}
			]
		},
		null,
		2
	)
);
const missingDiagramSurfaceFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${missingDiagramSurfacePath}`,
	'--expected-marks=4',
	'--expected-questions=1'
]);
if (!missingDiagramSurfaceFailure.includes('diagram_response_surface_missing')) {
	fail('Codex helper validation did not reject a diagram-required prompt with only lines.', {
		missingDiagramSurfaceFailure
	});
}

const structuredFigureMediaPath = path.join(helperNormalizeDir, 'structured-figure-media.json');
writeFileSync(
	structuredFigureMediaPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'test-paper', docType: 'question_paper', pageCount: 6 },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme', pageCount: 2 },
			questions: [
				{
					sourceQuestionRef: '01.3',
					promptText: 'Use Figure 1 to describe the pattern.',
					marks: 1,
					pageStart: 5,
					pageEnd: 5,
					stemBlocks: [
						{
							kind: 'structured-table',
							label: 'Figure 1',
							rows: [[{ text: 'Year 1: 12' }], [{ text: 'Year 2: 18' }]]
						}
					],
					promptBlocks: [{ kind: 'paragraph', text: 'Use Figure 1 to describe the pattern.' }],
					response: { kind: 'lines', count: 1 },
					markSchemeItems: [{ itemType: 'mark', text: 'Describes the increase.' }],
					markChecklist: [{ text: 'Describes the increase.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'The value increases from Year 1 to Year 2.' }
				}
			]
		},
		null,
		2
	)
);
runNodeScript('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${structuredFigureMediaPath}`,
	'--expected-marks=1',
	'--expected-questions=1'
]);

const missingEquationBlankKeyPath = path.join(
	helperNormalizeDir,
	'missing-equation-blank-key.json'
);
writeFileSync(
	missingEquationBlankKeyPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'test-paper', docType: 'question_paper' },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '01.1',
					promptText: 'Complete the word equation.',
					marks: 2,
					pageStart: 2,
					pageEnd: 2,
					response: {
						kind: 'equation-blanks',
						segments: [
							{ kind: 'blank', id: 'before-arrow-1' },
							{ kind: 'text', text: ' + ' },
							{ kind: 'blank', id: 'before-arrow-2' },
							{ kind: 'text', text: ' -> ' },
							{ kind: 'blank', id: 'after-arrow' }
						],
						correctAnswers: [
							{ targetId: 'before-arrow-1', correctAnswer: 'carbon dioxide' },
							{ targetId: 'after-arrow', correctAnswer: 'glucose' }
						]
					},
					markSchemeItems: [
						{ itemType: 'mark', text: 'Carbon dioxide and water before the arrow.' },
						{ itemType: 'mark', text: 'Glucose after the arrow.' }
					],
					markChecklist: [
						{ text: 'Completes the reactants.', markSchemeItemIndexes: [0] },
						{ text: 'Completes glucose.', markSchemeItemIndexes: [1] }
					]
				}
			]
		},
		null,
		2
	)
);
const missingEquationKeyFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${missingEquationBlankKeyPath}`,
	'--expected-marks=2',
	'--expected-questions=1'
]);
if (!missingEquationKeyFailure.includes('equation_blank_missing_answer_key')) {
	fail('Codex helper validation did not reject an unkeyed equation blank.', {
		missingEquationKeyFailure
	});
}

const tableAssetCanvasPath = path.join(helperNormalizeDir, 'table-asset-canvas.json');
writeFileSync(
	tableAssetCanvasPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'test-paper', docType: 'question_paper' },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '01.4',
					promptText: 'Draw a ring around the anomalous result in Table 1.',
					marks: 1,
					pageStart: 2,
					pageEnd: 2,
					stemBlocks: [
						{
							kind: 'table',
							label: 'Table 1',
							columns: ['Temperature', 'Test 1', 'Test 2'],
							rows: [['45', '1.9', '14.2']]
						}
					],
					response: {
						kind: 'asset-canvas',
						assetLabel: 'Table 1',
						correctAnswers: [{ targetId: 'table-cell', correctAnswer: '14.2' }]
					},
					assets: [
						{
							sourceLabel: 'Table 1',
							role: 'response-surface',
							filePath: 'scripts/codex-import-helper.mjs'
						}
					],
					markSchemeItems: [{ itemType: 'mark', text: 'A ring around 14.2.' }],
					markChecklist: [{ text: 'Identifies 14.2.', markSchemeItemIndexes: [0] }]
				}
			]
		},
		null,
		2
	)
);
const tableAssetCanvasFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${tableAssetCanvasPath}`,
	'--expected-marks=1',
	'--expected-questions=1'
]);
if (!tableAssetCanvasFailure.includes('table_asset_canvas_response')) {
	fail('Codex helper validation did not reject a table-backed asset-canvas response.', {
		tableAssetCanvasFailure
	});
}

const underGranularAnyNPath = path.join(helperNormalizeDir, 'under-granular-any-n.json');
writeFileSync(
	underGranularAnyNPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'test-paper', docType: 'question_paper' },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '03.1',
					promptText: 'Give two similarities between the cells.',
					marks: 2,
					pageStart: 6,
					pageEnd: 6,
					response: {
						kind: 'labeled-lines',
						labels: ['Similarity 1', 'Similarity 2'],
						lineCount: 2
					},
					markSchemeItems: [
						{
							itemType: 'mark',
							text: 'Any two similarities: cytoplasm, cell membrane, DNA/genetic material, ribosomes.',
							marks: 1
						}
					],
					markChecklist: [
						{
							text: 'Gives two valid similarities.',
							markSchemeItemIndexes: [0]
						}
					],
					modelAnswer: { answerText: 'Both have cytoplasm and a cell membrane.' }
				}
			]
		},
		null,
		2
	)
);
const underGranularAnyNFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${underGranularAnyNPath}`,
	'--expected-marks=2',
	'--expected-questions=1'
]);
if (!underGranularAnyNFailure.includes('mark_scheme_under_granular_any_n')) {
	fail('Codex helper validation did not reject compressed any-N mark-scheme rows.', {
		underGranularAnyNFailure
	});
}

const overrequiredChecklistPath = path.join(helperNormalizeDir, 'overrequired-checklist.json');
writeFileSync(
	overrequiredChecklistPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'test-paper', docType: 'question_paper' },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '01.5',
					promptText: 'Suggest one possible cause of the anomalous result.',
					marks: 1,
					pageStart: 3,
					pageEnd: 3,
					response: { kind: 'lines', count: 2, lineCount: 2 },
					markSchemeItems: [
						{ itemType: 'mark', text: 'Scale or value was misread.', marks: 1 },
						{ itemType: 'mark', text: 'Temperature changed.', marks: 1 },
						{ itemType: 'mark', text: 'Different amount of pondweed was used.', marks: 1 }
					],
					markChecklist: [
						{ text: 'Scale or value was misread.', required: true, markSchemeItemIndexes: [0] },
						{ text: 'Temperature changed.', required: true, markSchemeItemIndexes: [1] },
						{
							text: 'Different amount of pondweed was used.',
							required: true,
							markSchemeItemIndexes: [2]
						}
					],
					modelAnswer: { answerText: 'The scale may have been misread.' }
				}
			]
		},
		null,
		2
	)
);
const overrequiredChecklistFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${overrequiredChecklistPath}`,
	'--expected-marks=1',
	'--expected-questions=1'
]);
if (!overrequiredChecklistFailure.includes('mark_checklist_overrequires_alternatives')) {
	fail('Codex helper validation did not reject an over-required alternative checklist.', {
		overrequiredChecklistFailure
	});
}

const knownLineCountMismatchPath = path.join(helperNormalizeDir, 'known-line-count-mismatch.json');
writeFileSync(
	knownLineCountMismatchPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'aqa-84611h-qp-nov20', docType: 'question_paper' },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '01.2',
					promptText: 'Describe how you could make the investigation more valid.',
					marks: 2,
					pageStart: 2,
					pageEnd: 2,
					response: { kind: 'lines', count: 2, lineCount: 2 },
					markSchemeItems: [{ itemType: 'mark', text: 'Use more temperatures.', marks: 1 }],
					markChecklist: [{ text: 'Improves validity.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'Use more temperatures and repeat the investigation.' }
				}
			]
		},
		null,
		2
	)
);
const knownLineCountFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${knownLineCountMismatchPath}`,
	'--expected-marks=2',
	'--expected-questions=1'
]);
if (!knownLineCountFailure.includes('known_response_line_count_mismatch')) {
	fail('Codex helper validation did not reject a known source-document line-count mismatch.', {
		knownLineCountFailure
	});
}

const missingKnownAllowancePath = path.join(helperNormalizeDir, 'missing-known-allowance.json');
writeFileSync(
	missingKnownAllowancePath,
	JSON.stringify(
		{
			sourceDocument: { id: 'aqa-84611h-qp-nov20', docType: 'question_paper' },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '02.4',
					promptText: 'Name the process by which water moves into root hair cells.',
					marks: 1,
					pageStart: 9,
					pageEnd: 9,
					response: { kind: 'lines', count: 1, lineCount: 1 },
					markSchemeItems: [{ itemType: 'mark', text: 'Osmosis.', marks: 1 }],
					markChecklist: [{ text: 'Names osmosis.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'Osmosis.' }
				}
			]
		},
		null,
		2
	)
);
const missingKnownAllowanceFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${missingKnownAllowancePath}`,
	'--expected-marks=1',
	'--expected-questions=1'
]);
if (!missingKnownAllowanceFailure.includes('known_mark_scheme_allowance_missing')) {
	fail('Codex helper validation did not reject a missing known mark-scheme allowance.', {
		missingKnownAllowanceFailure
	});
}

const missingSurveyContextPath = path.join(helperNormalizeDir, 'missing-survey-context.json');
writeFileSync(
	missingSurveyContextPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'aqa-84611h-qp-nov20', docType: 'question_paper' },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '06.5',
					promptText: 'Suggest two other factors that should have been controlled.',
					selfContainedPromptText: 'Suggest two other factors that should have been controlled.',
					marks: 2,
					pageStart: 22,
					pageEnd: 22,
					response: { kind: 'lines', count: 4, lineCount: 4 },
					markSchemeItems: [
						{ itemType: 'mark', text: 'Age.', marks: 1 },
						{ itemType: 'mark', text: 'BMI.', marks: 1 }
					],
					markChecklist: [
						{ text: 'Names age.', required: false, markSchemeItemIndexes: [0] },
						{ text: 'Names BMI.', required: false, markSchemeItemIndexes: [1] }
					],
					modelAnswer: { answerText: 'Age and BMI.' }
				}
			]
		},
		null,
		2
	)
);
const missingSurveyContextFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${missingSurveyContextPath}`,
	'--expected-marks=2',
	'--expected-questions=1'
]);
if (!missingSurveyContextFailure.includes('known_survey_context_missing')) {
	fail('Codex helper validation did not reject missing Million Women survey context.', {
		missingSurveyContextFailure
	});
}

const graphPlottingMismatchPath = path.join(helperNormalizeDir, 'graph-plotting-mismatch.json');
writeFileSync(
	graphPlottingMismatchPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'aqa-84611h-qp-nov20', docType: 'question_paper' },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '01.9',
					promptText: 'Plot a graph of mean rate against temperature.',
					marks: 4,
					pageStart: 5,
					pageEnd: 5,
					response: { kind: 'drawing-box' },
					markSchemeItems: [
						{ itemType: 'mark', text: 'Suitable linear scale.', marks: 1 },
						{ itemType: 'mark', text: 'Both axes labelled.', marks: 1 },
						{ itemType: 'mark', text: 'Two correct plotted mean points.', marks: 1 },
						{ itemType: 'mark', text: 'Line of best fit.', marks: 1 }
					],
					markChecklist: [
						{ text: 'Uses a suitable scale.', markSchemeItemIndexes: [0] },
						{ text: 'Labels axes.', markSchemeItemIndexes: [1] },
						{ text: 'Plots two mean points.', markSchemeItemIndexes: [2] },
						{ text: 'Draws a line of best fit.', markSchemeItemIndexes: [3] }
					]
				}
			]
		},
		null,
		2
	)
);
const graphPlottingMismatchFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${graphPlottingMismatchPath}`,
	'--expected-marks=4',
	'--expected-questions=1'
]);
if (!graphPlottingMismatchFailure.includes('known_graph_plotting_mark_scheme_mismatch')) {
	fail('Codex helper validation did not reject the known Q01.9 plotting mark mismatch.', {
		graphPlottingMismatchFailure
	});
}

const cs2024P1ATraceTableIncompletePath = path.join(
	helperNormalizeDir,
	'cs-2024-p1a-trace-table-incomplete.json'
);
writeFileSync(
	cs2024P1ATraceTableIncompletePath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp',
				docType: 'question_paper'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '08.0',
					promptText: 'Complete the trace table for the algorithm in Figure 6.',
					marks: 6,
					pageStart: 16,
					pageEnd: 17,
					stemBlocks: [
						{ kind: 'paragraph', text: 'Figure 6 shows an algorithm.' },
						{
							kind: 'structured-table',
							label: 'Trace table',
							rows: [['i', 'daysTotal', 'weeks[0]', 'weeks[1]', 'weeks[2]', 'weeksTotal']]
						}
					],
					response: {
						kind: 'equation-blanks',
						segments: [
							{ kind: 'blank', id: 'i-column' },
							{ kind: 'blank', id: 'days-total-column' },
							{ kind: 'blank', id: 'weeks-column' },
							{ kind: 'blank', id: 'weeks-total' }
						],
						correctAnswers: [
							{ targetId: 'i-column', correctAnswer: '0, 1, 2' },
							{ targetId: 'days-total-column', correctAnswer: '30, 48, 16' },
							{ targetId: 'weeks-column', correctAnswer: 'weeks[0]=4, weeks[1]=6, weeks[2]=2' },
							{ targetId: 'weeks-total', correctAnswer: '12' }
						]
					},
					markSchemeItems: [
						{ itemType: 'mark', text: 'i column correct: 0, 1, 2.', marks: 1 },
						{ itemType: 'mark', text: 'First daysTotal value 30.', marks: 1 },
						{ itemType: 'mark', text: 'Rest of daysTotal column 48, 16.', marks: 1 },
						{ itemType: 'mark', text: 'Second weeks[0] value 4.', marks: 1 },
						{ itemType: 'mark', text: 'Rest of weeks columns 6 and 2 with previous weeks retained.', marks: 1 },
						{ itemType: 'mark', text: 'weeksTotal 12.', marks: 1 }
					]
				}
			]
		},
		null,
		2
	)
);
const cs2024P1ATraceTableIncompleteFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${cs2024P1ATraceTableIncompletePath}`,
		'--expected-marks=6',
		'--expected-questions=1'
	]
);
if (!cs2024P1ATraceTableIncompleteFailure.includes('known_trace_table_response_incomplete')) {
	fail('Codex helper validation did not reject incomplete CS 2024 Paper 1A Q08 trace table.', {
		cs2024P1ATraceTableIncompleteFailure
	});
}

const cs2024P1APairedBoundaryAliasPath = path.join(
	helperNormalizeDir,
	'computer-science-2024-paper-1a-paired-boundary-alias.json'
);
writeFileSync(
	cs2024P1APairedBoundaryAliasPath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp',
				docType: 'question_paper'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '03.2',
					promptText: 'Complete the test plan.',
					selfContainedPromptText: 'Complete the test plan for boundary validation.',
					marks: 4,
					pageStart: 8,
					pageEnd: 9,
					stemBlocks: [
						{
							kind: 'structured-table',
							label: 'Figure 3',
							rows: [['6', 'while (userNumber < 1 || userNumber > 100)']]
						}
					],
					response: {
						kind: 'equation-blanks',
						segments: [
							{ kind: 'blank', id: 'row1-expected' },
							{ kind: 'blank', id: 'row2-data' },
							{ kind: 'blank', id: 'row2-expected' },
							{ kind: 'blank', id: 'row3-data' }
						],
						correctAnswers: [
							{ targetId: 'row1-expected', correctAnswer: 'Invalid number' },
							{ targetId: 'row2-data', correctAnswer: '0', aliases: ['1', '100', '101'] },
							{
								targetId: 'row2-expected',
								correctAnswer: 'Invalid number',
								aliases: ['Valid number entered']
							},
							{ targetId: 'row3-data', correctAnswer: '50' }
						]
					},
					markSchemeItems: [
						{ itemType: 'mark', text: 'Row 1 expected result Invalid number.', marks: 1 },
						{
							itemType: 'mark',
							text: 'Boundary row uses 0/101 with Invalid number or 1/100 with Valid number entered.',
							marks: 1
						}
					],
					markChecklist: [
						{ text: 'Pairs the boundary value with the matching expected result.', markSchemeItemIndexes: [1] }
					]
				}
			]
		},
		null,
		2
	)
);
const cs2024P1APairedBoundaryAliasFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${cs2024P1APairedBoundaryAliasPath}`,
		'--expected-marks=4',
		'--expected-questions=1'
	]
);
if (
	!cs2024P1APairedBoundaryAliasFailure.includes(
		'known_paired_boundary_answer_encoded_as_independent_aliases'
	)
) {
	fail('Codex helper validation did not reject unsafe paired-boundary aliases.', {
		cs2024P1APairedBoundaryAliasFailure
	});
}

const geography2023P2Figure2MissingScalePath = path.join(
	helperNormalizeDir,
	'geography-2023-p2-figure2-missing-scale.json'
);
writeFileSync(
	geography2023P2Figure2MissingScalePath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp',
				docType: 'question_paper'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '01.3',
					promptText: 'Complete Figure 2 using the following data.',
					marks: 1,
					pageStart: 4,
					pageEnd: 4,
					stemBlocks: [
						{
							kind: 'paragraph',
							text: 'Study Figure 2, a graph showing selected crimes reported on Twitter in Mexico City.'
						}
					],
					response: {
						kind: 'asset-canvas',
						assetLabel: 'Figure 2',
						instructions: 'Draw the missing Theft of motor vehicle bar at the correct value.',
						correctAnswers: [
							{
								targetId: 'theft-motor-vehicle-bar',
								correctAnswer: 'Bar for Theft of motor vehicle reaches 350 reports.'
							}
						]
					},
					assets: [
						{
							sourceLabel: 'Figure 2',
							role: 'response-surface',
							filePath: 'assets/figure-02-crime-graph.png'
						}
					],
					markSchemeItems: [
						{ itemType: 'answer', text: 'Bar plotted accurately at 350 reports.', marks: 1 }
					]
				}
			]
		},
		null,
		2
	)
);
const geography2023P2Figure2MissingScaleFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${geography2023P2Figure2MissingScalePath}`,
		'--expected-marks=1',
		'--expected-questions=1'
	]
);
if (!geography2023P2Figure2MissingScaleFailure.includes('known_graph_scale_missing')) {
	fail('Codex helper validation did not reject Geography 2023 Paper 2 Q01.3 without graph scale.', {
		geography2023P2Figure2MissingScaleFailure
	});
}

const geography2023P2Figure6MissingVisualSourcePath = path.join(
	helperNormalizeDir,
	'geography-2023-p2-figure6-missing-visual-source.json'
);
writeFileSync(
	geography2023P2Figure6MissingVisualSourcePath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp',
				docType: 'question_paper'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '02.3',
					promptText:
						'To what extent are modern industrial developments environmentally sustainable? Use Figure 6 and your own understanding.',
					marks: 6,
					pageStart: 14,
					pageEnd: 15,
					stemBlocks: [
						{
							kind: 'paragraph',
							text: 'Study Figure 6, information about the Southampton Science Park.'
						},
						{
							kind: 'table',
							label: 'Figure 6',
							columns: ['Information about the Southampton Science Park'],
							rows: [
								[
									'Provides high-quality office, laboratory and meeting facilities in a healthy and inspiring environment.'
								],
								['72 acres of green space, lakes, walking routes and picnic spots.'],
								['27 acres are a protected conservation area.'],
								['Committed to minimising waste and making buildings more energy efficient.']
							]
						}
					],
					response: {
						kind: 'lines',
						lineCount: 17,
						lineCountEvidence: 'Visible ruled answer lines counted from pages 14 and 15.'
					},
					assets: [],
					markSchemeItems: [
						{
							itemType: 'mark',
							text: 'Levelled response crediting evidence from Figure 6 and own understanding.',
							marks: 6
						}
					]
				}
			]
		},
		null,
		2
	)
);
const geography2023P2Figure6MissingVisualSourceFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${geography2023P2Figure6MissingVisualSourcePath}`,
		'--expected-marks=6',
		'--expected-questions=1'
	]
);
if (
	!geography2023P2Figure6MissingVisualSourceFailure.includes(
		'known_figure6_visual_source_missing'
	)
) {
	fail(
		'Codex helper validation did not reject Geography 2023 Paper 2 Q02.3 without Figure 6 visual source.',
		{ geography2023P2Figure6MissingVisualSourceFailure }
	);
}

const missingLevelDescriptorsPath = path.join(helperNormalizeDir, 'missing-level-descriptors.json');
writeFileSync(
	missingLevelDescriptorsPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'aqa-84611h-qp-nov20', docType: 'question_paper' },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '02.3',
					promptText:
						'Explain how a root hair cell is adapted for absorbing water and mineral ions.',
					marks: 6,
					pageStart: 8,
					pageEnd: 8,
					response: { kind: 'lines', count: 14, lineCount: 14 },
					markSchemeItems: [
						{ itemType: 'mark', text: 'Large surface area.', marks: 1 },
						{ itemType: 'mark', text: 'Thin cell wall.', marks: 1 },
						{ itemType: 'mark', text: 'Many mitochondria for active transport.', marks: 1 }
					],
					markChecklist: [
						{ text: 'Links surface area to absorption.', markSchemeItemIndexes: [0] },
						{ text: 'Links thin wall to short diffusion distance.', markSchemeItemIndexes: [1] },
						{ text: 'Links mitochondria to active transport.', markSchemeItemIndexes: [2] }
					],
					modelAnswer: {
						answerText:
							'Root hair cells have a large surface area and thin wall for absorption, and mitochondria provide energy for active transport of mineral ions.'
					}
				}
			]
		},
		null,
		2
	)
);
const missingLevelDescriptorsFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${missingLevelDescriptorsPath}`,
		'--expected-marks=6',
		'--expected-questions=1'
	]
);
if (!missingLevelDescriptorsFailure.includes('known_level_response_descriptors_missing')) {
	fail('Codex helper validation did not reject missing level-of-response descriptors.', {
		missingLevelDescriptorsFailure
	});
}

const selfContainedAnswerLeakPath = path.join(
	helperNormalizeDir,
	'self-contained-answer-leak.json'
);
writeFileSync(
	selfContainedAnswerLeakPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'aqa-84611h-qp-nov20', docType: 'question_paper' },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '01.1',
					promptText: 'Complete the word equation for photosynthesis.',
					selfContainedPromptText:
						'Complete the word equation for photosynthesis: carbon dioxide + water -> glucose + oxygen.',
					marks: 2,
					pageStart: 2,
					pageEnd: 2,
					response: {
						kind: 'equation-blanks',
						segments: [
							{ kind: 'blank', id: 'reactant-1' },
							{ kind: 'text', text: ' + ' },
							{ kind: 'blank', id: 'reactant-2' },
							{ kind: 'text', text: ' -> ' },
							{ kind: 'blank', id: 'product-1' },
							{ kind: 'text', text: ' + oxygen' }
						],
						correctAnswers: [
							{ targetId: 'reactant-1', correctAnswer: 'carbon dioxide or water' },
							{ targetId: 'reactant-2', correctAnswer: 'water or carbon dioxide' },
							{ targetId: 'product-1', correctAnswer: 'glucose' }
						]
					},
					markSchemeItems: [
						{ itemType: 'mark', text: 'Carbon dioxide and water before the arrow.', marks: 1 },
						{ itemType: 'mark', text: 'Glucose after the arrow.', marks: 1 }
					],
					markChecklist: [
						{ text: 'Includes carbon dioxide and water.', markSchemeItemIndexes: [0] },
						{ text: 'Includes glucose.', markSchemeItemIndexes: [1] }
					]
				}
			]
		},
		null,
		2
	)
);
const selfContainedAnswerLeakFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${selfContainedAnswerLeakPath}`,
		'--expected-marks=2',
		'--expected-questions=1'
	]
);
if (!selfContainedAnswerLeakFailure.includes('known_self_contained_answer_leak')) {
	fail('Codex helper validation did not reject a Q01.1 self-contained answer leak.', {
		selfContainedAnswerLeakFailure
	});
}

const tinyFigurePath = path.join(helperNormalizeDir, 'tiny-figure.png');
writeFileSync(
	tinyFigurePath,
	Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
		'base64'
	)
);

const geography2022Paper3SourceTablePath = path.join(
	helperNormalizeDir,
	'geography-2022-paper-3-source-table.json'
);
writeFileSync(
	geography2022Paper3SourceTablePath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-geography-2022-june-paper-3-geographical-applications-qp',
				docType: 'question_paper',
				pageCount: 20
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme', pageCount: 10 },
			questions: [
				{
					sourceQuestionRef: '04.2',
					promptText: 'What was the total environmental quality score?',
					marks: 1,
					pageStart: 11,
					pageEnd: 11,
					stemBlocks: [
						{
							kind: 'structured-table',
							label: 'Figure 4',
							rows: [
								[{ text: 'Environmental quality category' }, { text: 'Score shown' }],
								[{ text: 'Lots of litter / No litter' }, { text: '-1' }],
								[{ text: 'Crowded / Few people' }, { text: '-2' }],
								[{ text: 'Noisy / Quiet' }, { text: '-1' }],
								[{ text: 'Lots of traffic / Little traffic' }, { text: '-2' }],
								[{ text: 'Unattractive / Attractive' }, { text: '0' }]
							]
						}
					],
					response: {
						kind: 'equation-blanks',
						segments: [{ kind: 'blank', id: 'total-score' }],
						correctAnswers: [{ targetId: 'total-score', correctAnswer: '-6' }]
					},
					markSchemeItems: [{ itemType: 'mark', text: '-6.', marks: 1 }],
					markChecklist: [{ text: 'Gives -6.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: '-6' }
				}
			]
		},
		null,
		2
	)
);
const geography2022Paper3SourceTableFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${geography2022Paper3SourceTablePath}`,
		'--expected-marks=1',
		'--expected-questions=1'
	]
);
if (!geography2022Paper3SourceTableFailure.includes('known_source_table_value_mismatch')) {
	fail('Codex helper validation did not reject swapped Geography 2022 Paper 3 source values.', {
		geography2022Paper3SourceTableFailure
	});
}

const geography2022Paper2KnownIssuesPath = path.join(
	helperNormalizeDir,
	'geography-2022-paper-2-known-issues.json'
);
writeFileSync(
	geography2022Paper2KnownIssuesPath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-geography-2022-june-paper-2-challenges-in-the-human-environment-qp',
				docType: 'question_paper',
				pageCount: 40
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme', pageCount: 30 },
			questions: [
				{
					sourceQuestionRef: '01.10',
					promptText: 'Assess the challenges created by urban change.',
					marks: 12,
					pageStart: 11,
					pageEnd: 12,
					response: { kind: 'lines', lineCount: 30 },
					markSchemeItems: [
						{ itemType: 'level', text: 'Level 3 content.', marks: 9 },
						{ itemType: 'mark', text: 'SPaG high performance.', marks: 3 },
						{ itemType: 'mark', text: 'SPaG intermediate/threshold performance.', marks: 2 }
					],
					markChecklist: [{ text: 'Awards content and SPaG.', markSchemeItemIndexes: [0, 1, 2] }],
					modelAnswer: { answerText: 'A named city creates several challenges.' }
				},
				{
					sourceQuestionRef: '03.1',
					promptText: 'Use Figure 10 to identify the continent.',
					marks: 1,
					pageStart: 23,
					pageEnd: 23,
					needsHumanReview: true,
					stemBlocks: [
						{
							kind: 'structured-table',
							label: 'Figure 10',
							rows: [
								[{ text: 'Source status' }, { text: 'Official map unavailable.' }],
								[{ text: 'Review action' }, { text: 'Block for human review.' }]
							]
						}
					],
					response: {
						kind: 'choice',
						options: ['A Africa', 'B Asia'],
						correctAnswers: [{ targetId: 'answer', correctAnswer: 'A Africa' }]
					},
					markSchemeItems: [{ itemType: 'mark', text: 'A Africa.', marks: 1 }],
					markChecklist: [{ text: 'Selects Africa.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'Africa.' }
				}
			]
		},
		null,
		2
	)
);
const geography2022Paper2KnownIssuesFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${geography2022Paper2KnownIssuesPath}`,
		'--expected-marks=13',
		'--expected-questions=2'
	]
);
if (
	!geography2022Paper2KnownIssuesFailure.includes('known_spag_rubric_incomplete') ||
	!geography2022Paper2KnownIssuesFailure.includes('known_unresolved_copyright_source')
) {
	fail('Codex helper validation did not reject Geography 2022 Paper 2 known defects.', {
		geography2022Paper2KnownIssuesFailure
	});
}

const geography2023Paper1KnownIssuesPath = path.join(
	helperNormalizeDir,
	'geography-2023-paper-1-known-issues.json'
);
writeFileSync(
	geography2023Paper1KnownIssuesPath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp',
				docType: 'question_paper',
				pageCount: 44
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme', pageCount: 38 },
			questions: [
				{
					sourceQuestionRef: '01.2',
					promptText: 'Using Figure 1, which statement is true?',
					marks: 1,
					pageStart: 3,
					pageEnd: 3,
					stemBlocks: [{ kind: 'paragraph', text: 'Study Figure 1.' }],
					assets: [{ sourceLabel: 'Figure 1', filePath: 'tiny-figure.png' }],
					response: {
						kind: 'choice',
						options: ['A', 'B'],
						correctAnswers: [{ targetId: 'choice', correctAnswer: 'B' }]
					},
					markSchemeItems: [{ itemType: 'mark', text: 'B.', marks: 1 }],
					markChecklist: [{ text: 'Selects B.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'B.' }
				},
				{
					sourceQuestionRef: '01.11',
					promptText: 'Suggest how plate margin processes lead to hazards.',
					marks: 12,
					pageStart: 12,
					pageEnd: 13,
					response: { kind: 'lines', lineCount: 27 },
					markSchemeItems: [{ itemType: 'level', text: 'Level response.', marks: 9 }],
					markChecklist: [{ text: 'Explains plate margin processes.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'Different margins create earthquakes and volcanoes.' }
				},
				{
					sourceQuestionRef: '02.10',
					promptText: 'Assess the extent to which human activity has affected the chosen environment.',
					marks: 9,
					pageStart: 22,
					pageEnd: 24,
					response: {
						kind: 'labeled-lines',
						fields: [
							{ label: 'Chosen environment', lineCount: 2 },
							{ label: 'Answer', lineCount: 23 }
						]
					},
					markSchemeItems: [{ itemType: 'level', text: 'Level response.', marks: 9 }],
					markChecklist: [{ text: 'Assesses human activity.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'Human activity changes the environment in several ways.' }
				},
				{
					sourceQuestionRef: '02.1',
					promptText: 'Name the producer in Figure 7.',
					contextText: 'Study Figure 7, a diagram of a food web.',
					marks: 1,
					pageStart: 14,
					pageEnd: 14,
					stemBlocks: [
						{ kind: 'paragraph', text: 'Study Figure 7, a diagram of a food web.' },
						{
							kind: 'structured-table',
							label: 'Figure 7',
							rows: [
								[{ text: 'Neutral substitute from official marking evidence' }],
								[{ text: 'Water plant is at the base of the food web.' }]
							]
						}
					],
					response: {
						kind: 'lines',
						lineCount: 1
					},
					markSchemeItems: [{ itemType: 'mark', text: 'Large water plant.', marks: 1 }],
					markChecklist: [{ text: 'Names Large water plant.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'Large water plant.' }
				}
			]
		},
		null,
		2
	)
);
const geography2023Paper1KnownIssuesFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${geography2023Paper1KnownIssuesPath}`,
		'--expected-marks=23',
		'--expected-questions=4'
	]
);
if (
	!geography2023Paper1KnownIssuesFailure.includes('known_figure_crop_incomplete') ||
	!geography2023Paper1KnownIssuesFailure.includes('known_response_line_count_mismatch') ||
	!geography2023Paper1KnownIssuesFailure.includes('learner_visible_source_provenance') ||
	!geography2023Paper1KnownIssuesFailure.includes('known_source_label_mismatch') ||
	!geography2023Paper1KnownIssuesFailure.includes('context_text_duplicates_render_block')
) {
	fail('Codex helper validation did not reject Geography 2023 Paper 1 known defects.', {
		geography2023Paper1KnownIssuesFailure
	});
}

const geography2023Figure7ValidPath = path.join(helperNormalizeDir, 'geography-2023-figure7-valid.json');
writeFileSync(
	geography2023Figure7ValidPath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp',
				docType: 'question_paper',
				pageCount: 40
			},
			markSchemeDocument: { id: 'aqa-geography-2023-paper-1-ms', docType: 'mark_scheme', pageCount: 32 },
			questions: [
				{
					sourceQuestionRef: '02.1',
					promptText: 'Using Figure 7, identify a producer.',
					selfContainedPromptText:
						'Study Figure 7, a diagram of a food web. Using Figure 7, identify a producer.',
					marks: 1,
					pageStart: 14,
					pageEnd: 14,
					stemBlocks: [
						{ kind: 'paragraph', text: 'Study Figure 7, a diagram of a food web.' },
						{
							kind: 'table',
							label: 'Figure 7',
							columns: ['Food source', 'Consumer'],
							rows: [
								['Large water plant', 'Aquatic insects'],
								['Large water plant', 'Crayfish'],
								['Aquatic insects', 'Trout'],
								['Crayfish', 'Trout'],
								['Trout', 'Humans']
							]
						}
					],
					promptBlocks: [{ kind: 'paragraph', text: 'Using Figure 7, identify a producer.' }],
					response: { kind: 'lines', lineCount: 1 },
					markSchemeItems: [{ itemType: 'mark', text: 'Large water plant.', marks: 1 }],
					markChecklist: [{ text: 'Names Large water plant.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'Large water plant.' }
				}
			]
		},
		null,
		2
	)
);
runNodeScript('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${geography2023Figure7ValidPath}`,
	'--expected-marks=1',
	'--expected-questions=1'
]);

const duplicateContextNormalizePath = path.join(
	helperNormalizeDir,
	'geography-2023-context-duplicate-normalize.json'
);
const duplicateContextNormalizedPath = path.join(
	helperNormalizeDir,
	'geography-2023-context-duplicate-normalized.json'
);
const duplicateContextCandidate = JSON.parse(readFileSync(geography2023Figure7ValidPath, 'utf8'));
duplicateContextCandidate.questions[0].contextText = 'Study Figure 7, a diagram of a food web.';
writeFileSync(duplicateContextNormalizePath, JSON.stringify(duplicateContextCandidate, null, 2));
runNodeScript('scripts/codex-import-helper.mjs', [
	'normalize-extraction',
	`--input=${duplicateContextNormalizePath}`,
	`--output=${duplicateContextNormalizedPath}`
]);
const duplicateContextNormalized = JSON.parse(readFileSync(duplicateContextNormalizedPath, 'utf8'));
if (duplicateContextNormalized.questions[0]?.contextText !== null) {
	fail('Codex helper normalization did not remove contextText duplicated in stemBlocks.', {
		contextText: duplicateContextNormalized.questions[0]?.contextText
	});
}
runNodeScript('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${duplicateContextNormalizedPath}`,
	'--expected-marks=1',
	'--expected-questions=1'
]);

const incompleteFigureCropPath = path.join(helperNormalizeDir, 'incomplete-figure-crop.json');
writeFileSync(
	incompleteFigureCropPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'aqa-84611h-qp-nov20', docType: 'question_paper' },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '02.2',
					promptText: 'Figure 2 shows part of a leaf. Which two changes increase diffusion?',
					selfContainedPromptText:
						'Figure 2 shows part of a leaf. Which two changes increase diffusion?',
					marks: 2,
					pageStart: 7,
					pageEnd: 7,
					stemBlocks: [
						{ kind: 'paragraph', text: 'Figure 2 shows part of a leaf.' },
						{ kind: 'asset', assetLabel: 'Figure 2' }
					],
					response: {
						kind: 'choice',
						options: [
							'Decreased number of chloroplasts',
							'Increased carbon dioxide concentration',
							'Increased number of open stomata'
						],
						correctAnswers: [
							{ targetId: 'choice-1', correctAnswer: 'Increased carbon dioxide concentration' },
							{ targetId: 'choice-2', correctAnswer: 'Increased number of open stomata' }
						]
					},
					assets: [{ sourceLabel: 'Figure 2', role: 'figure', filePath: 'tiny-figure.png' }],
					markSchemeItems: [
						{ itemType: 'mark', text: 'Increased carbon dioxide concentration.', marks: 1 },
						{ itemType: 'mark', text: 'Increased number of stomata that are open.', marks: 1 }
					],
					markChecklist: [
						{ text: 'Selects increased carbon dioxide concentration.', markSchemeItemIndexes: [0] },
						{ text: 'Selects increased number of open stomata.', markSchemeItemIndexes: [1] }
					],
					modelAnswer: {
						answerText:
							'Increased carbon dioxide concentration and increased number of stomata that are open.'
					}
				}
			]
		},
		null,
		2
	)
);
const incompleteFigureCropFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${incompleteFigureCropPath}`,
	'--expected-marks=2',
	'--expected-questions=1'
]);
if (!incompleteFigureCropFailure.includes('known_figure_crop_incomplete')) {
	fail('Codex helper validation did not reject a known incomplete figure crop.', {
		incompleteFigureCropFailure
	});
}

const computerScienceCanaryFailurePath = path.join(
	helperNormalizeDir,
	'computer-science-canary-known-defects.json'
);
const broadSqlSkeletonPath = path.join(helperNormalizeDir, 'broad-sql-skeleton.png');
const broadSqlSkeletonBuffer = Buffer.alloc(24);
Buffer.from('89504e470d0a1a0a', 'hex').copy(broadSqlSkeletonBuffer, 0);
broadSqlSkeletonBuffer.writeUInt32BE(1000, 16);
broadSqlSkeletonBuffer.writeUInt32BE(900, 20);
writeFileSync(broadSqlSkeletonPath, broadSqlSkeletonBuffer);
writeFileSync(
	computerScienceCanaryFailurePath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-computer-science-2024-june-paper-2-computing-concepts-qp',
				docType: 'question_paper'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '03.0',
					promptText: 'Add the two binary numbers together.',
					selfContainedPromptText: 'Add the two binary numbers together.',
					marks: 2,
					pageStart: 3,
					pageEnd: 3,
					response: { kind: 'lines', lineCount: 1 },
					markSchemeItems: [{ itemType: 'mark', text: '11010101', marks: 2 }],
					markChecklist: [{ text: 'Binary sum is 11010101.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: '10111010' }
				},
				{
					sourceQuestionRef: '05.3',
					promptText:
						'Calculate the minimum amount of storage required to store Image D. Give your answer in bytes.',
					selfContainedPromptText:
						'Figure 2 shows Image D as an 8 by 5 pixel bitmap using three colours and needing 2 bits per pixel. Calculate the storage.',
					marks: 2,
					pageStart: 7,
					pageEnd: 7,
					stemBlocks: [
						{
							kind: 'paragraph',
							text: 'Image D is 8 pixels by 5 pixels and uses three colours.'
						}
					],
					response: { kind: 'lines', lineCount: 1 },
					markSchemeItems: [{ itemType: 'mark', text: '10 bytes', marks: 2 }],
					markChecklist: [{ text: 'Gives 10 bytes.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: '10 bytes' }
				},
				{
					sourceQuestionRef: '06.0',
					promptText: 'Calculate the number of bits in 7 MB.',
					selfContainedPromptText:
						'Calculate the number of bits in 7 MB. Use decimal megabytes as in the paper.',
					marks: 2,
					pageStart: 10,
					pageEnd: 10,
					response: { kind: 'lines', lineCount: 1 },
					markSchemeItems: [{ itemType: 'mark', text: '56 000 000 bits', marks: 2 }],
					markChecklist: [{ text: 'Gives 56 000 000 bits.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: '56 000 000 bits' }
				},
				{
					sourceQuestionRef: '07.1',
					promptText: 'Which truth table matches the logic gate in Figure 4?',
					selfContainedPromptText:
						'Figure 4 shows a two-input OR logic gate. Which truth table matches the logic gate?',
					marks: 1,
					pageStart: 12,
					pageEnd: 12,
					response: {
						kind: 'choice',
						options: ['A', 'B', 'C', 'D'],
						correctAnswers: [{ targetId: 'answer', correctAnswer: 'C' }]
					},
					markSchemeItems: [{ itemType: 'mark', text: 'C', marks: 1 }],
					markChecklist: [{ text: 'Selects C.', markSchemeItemIndexes: [0] }]
				},
				{
					sourceQuestionRef: '07.2',
					promptText:
						'Complete the logic circuit by writing the name of a logic gate in each empty box.',
					selfContainedPromptText:
						'Complete the logic circuit so it has the same functionality as Figure 5.',
					marks: 3,
					pageStart: 12,
					pageEnd: 12,
					response: {
						kind: 'image-label-zones',
						assetLabel: 'Q07.2 logic circuit',
						labels: ['AND', 'OR', 'NOT'],
						zones: [
							{ id: 'box-X', label: 'X', x: 10, y: 10, width: 50, height: 50 },
							{ id: 'box-Y', label: 'Y', x: 70, y: 10, width: 50, height: 50 },
							{ id: 'box-Z', label: 'Z', x: 130, y: 10, width: 50, height: 50 }
						],
						correctAnswers: [
							{ targetId: 'box-X', correctAnswer: 'AND' },
							{ targetId: 'box-Y', correctAnswer: 'OR' },
							{ targetId: 'box-Z', correctAnswer: 'NOT' }
						]
					},
					assets: [
						{
							sourceLabel: 'Q07.2 logic circuit',
							role: 'response-surface',
							filePath: 'tiny-figure.png'
						}
					],
					markSchemeItems: [
						{ itemType: 'mark', text: 'X = AND', marks: 1 },
						{ itemType: 'mark', text: 'Y = OR', marks: 1 },
						{ itemType: 'mark', text: 'Z = NOT', marks: 1 }
					],
					markChecklist: [{ text: 'Uses AND, OR and NOT.', markSchemeItemIndexes: [0, 1, 2] }],
					modelAnswer: { answerText: 'X = AND; Y = OR; Z = NOT' }
				},
				{
					sourceQuestionRef: '08.2',
					promptText: 'Explain three ways to improve the performance of a CPU.',
					selfContainedPromptText: 'Explain three ways to improve the performance of a CPU.',
					marks: 3,
					pageStart: 15,
					pageEnd: 15,
					response: {
						kind: 'labeled-lines',
						fields: [
							{ label: '1', lineCount: 1 },
							{ label: '2', lineCount: 1 },
							{ label: '3', lineCount: 1 }
						]
					},
					markSchemeItems: [{ itemType: 'mark', text: 'One improvement explained.', marks: 3 }],
					markChecklist: [{ text: 'Gives three improvements.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'Increase clock speed; increase cache; increase cores.' }
				},
				{
					sourceQuestionRef: '09.1',
					promptText: 'State the string that this bit pattern represents.',
					selfContainedPromptText:
						'Figure 7 contains a Huffman tree used to decode the bit pattern. State the string that this bit pattern represents.',
					marks: 2,
					pageStart: 16,
					pageEnd: 16,
					stemBlocks: [
						{ kind: 'paragraph', text: 'Figure 7 contains a Huffman tree.' },
						{ kind: 'asset', assetLabel: 'Figure 7' }
					],
					response: {
						kind: 'labeled-lines',
						fields: [{ label: 'String', lineCount: 1 }]
					},
					assets: [{ sourceLabel: 'Figure 7', role: 'figure', filePath: 'tiny-figure.png' }],
					markSchemeItems: [{ itemType: 'mark', text: 'Decodes the bit pattern.', marks: 2 }],
					markChecklist: [{ text: 'Decoded string is correct.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'ADDED' }
				},
				{
					sourceQuestionRef: '04.1',
					promptText:
						'State the result of applying a left binary shift of two to the bit pattern shown in Figure 1.',
					selfContainedPromptText:
						'Figure 1 shows the bit pattern 00110011. State the result of applying a left binary shift of two to the bit pattern shown in Figure 1.',
					marks: 1,
					pageStart: 3,
					pageEnd: 3,
					stemBlocks: [
						{ kind: 'paragraph', text: 'Figure 1 shows a bit pattern.' },
						{ kind: 'code', label: 'Figure 1', text: '00110011' }
					],
					response: { kind: 'lines', lineCount: 1 },
					assets: [{ sourceLabel: 'Figure 1', role: 'figure', filePath: 'tiny-figure.png' }],
					markSchemeItems: [{ itemType: 'mark', text: '11001100', marks: 1 }],
					markChecklist: [{ text: 'Gives shifted bit pattern.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: '11001100' }
				},
				{
					sourceQuestionRef: '05.4',
					promptText:
						'Complete the table to show the binary representation of each colour in Image D.',
					selfContainedPromptText:
						'Figure 3 shows how Image D can be represented as binary data. Complete the table to show the binary representation of each colour in Image D.',
					marks: 1,
					pageStart: 9,
					pageEnd: 9,
					stemBlocks: [
						{
							kind: 'paragraph',
							text: 'Figure 3 shows how Image D can be represented as binary data.'
						},
						{ kind: 'asset', assetLabel: 'Figure 3' }
					],
					response: {
						kind: 'choice-table',
						columns: ['Colour', 'Binary representation'],
						rows: [
							['White', ''],
							['Black', ''],
							['Grey', '']
						],
						correctAnswers: [
							{ targetId: 'White', correctAnswer: '00' },
							{ targetId: 'Black', correctAnswer: '01' },
							{ targetId: 'Grey', correctAnswer: '10' }
						]
					},
					assets: [{ sourceLabel: 'Figure 3', role: 'figure', filePath: 'tiny-figure.png' }],
					markSchemeItems: [{ itemType: 'mark', text: 'All three rows correct.', marks: 1 }],
					markChecklist: [{ text: 'Maps all colours correctly.', markSchemeItemIndexes: [0] }]
				},
				{
					sourceQuestionRef: '07.3',
					promptText: 'Write a Boolean expression for the output.',
					selfContainedPromptText: 'Write a Boolean expression for the output.',
					marks: 1,
					pageStart: 13,
					pageEnd: 13,
					response: { kind: 'lines', lineCount: 1 },
					assets: [],
					markSchemeItems: [
						{ itemType: 'mark', text: 'Correct Boolean expression with NOT A.', marks: 1 }
					],
					markChecklist: [{ text: 'Uses NOT A correctly.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'A-bar + B.C' }
				},
				{
					sourceQuestionRef: '18.7',
					promptText: 'State the SQL that should have been written in place of the labels.',
					selfContainedPromptText:
						'The following SQL is run: INSERT INTO ( ). State the SQL that should have been written in place of the labels.',
					marks: 3,
					pageStart: 26,
					pageEnd: 26,
					stemBlocks: [{ kind: 'paragraph', text: 'The following SQL is run: INSERT INTO ( )' }],
					response: {
						kind: 'labeled-lines',
						fields: [
							{ label: 'First label', lineCount: 2 },
							{ label: 'Second label', lineCount: 2 },
							{ label: 'Third label', lineCount: 2 }
						]
					},
					assets: [
						{
							sourceLabel: 'Q18.7 SQL skeleton',
							role: 'source_sql',
							filePath: 'broad-sql-skeleton.png'
						}
					],
					markSchemeItems: [{ itemType: 'mark', text: 'Correct INSERT SQL.', marks: 3 }],
					markChecklist: [{ text: 'SQL fields are correct.', markSchemeItemIndexes: [0] }],
					modelAnswer: { answerText: 'Film VALUES 103, Gladiator, 2000' }
				},
				{
					sourceQuestionRef: '13.2',
					promptText: 'Discuss advantages and disadvantages of a school network.',
					selfContainedPromptText: 'Discuss advantages and disadvantages of a school network.',
					marks: 6,
					pageStart: 20,
					pageEnd: 21,
					response: { kind: 'lines', lineCount: 34 },
					markSchemeItems: [
						{
							itemType: 'mark',
							text: 'Level 3: thorough discussion of advantages and disadvantages.',
							marks: 6
						},
						{
							itemType: 'mark',
							text: 'Level 2: some explanation of advantages and disadvantages.',
							marks: 4
						},
						{
							itemType: 'mark',
							text: 'Level 1: simple descriptions of advantages or disadvantages.',
							marks: 2
						}
					],
					markChecklist: [{ text: 'Apply level descriptor.', markSchemeItemIndexes: [0, 1, 2] }]
				}
			]
		},
		null,
		2
	)
);
const computerScienceCanaryFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${computerScienceCanaryFailurePath}`,
	'--expected-marks=27',
	'--expected-questions=12'
]);
for (const expectedFailure of [
	'known_response_line_count_mismatch',
	'known_figure_crop_incomplete',
	'known_simple_figure_asset_should_be_structural',
	'known_prior_figure_context_missing',
	'known_self_contained_answer_leak',
	'known_truth_table_options_unfaithful',
	'known_logic_gate_label_bank_mismatch',
	'known_model_answer_mismatch',
	'known_partial_mark_scheme_collapsed',
	'known_level_response_descriptors_missing',
	'known_boolean_not_bar_ambiguous',
	'known_sql_skeleton_labels_missing',
	'known_sql_skeleton_crop_too_broad'
]) {
	if (!computerScienceCanaryFailure.includes(expectedFailure)) {
		fail(
			`Codex helper validation did not reject Computer Science canary defect: ${expectedFailure}`,
			{
				computerScienceCanaryFailure
			}
		);
	}
}

const computerScienceNewGuardrailsPath = path.join(
	helperNormalizeDir,
	'computer-science-new-guardrails.json'
);
writeFileSync(
	computerScienceNewGuardrailsPath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp',
				docType: 'question_paper'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '14.1',
					promptText: 'Describe what is meant by a validation check.',
					selfContainedPromptText: 'Describe what is meant by a validation check.',
					marks: 1,
					pageStart: 35,
					pageEnd: 35,
					response: { kind: 'lines', lineCount: 2 },
					markSchemeItems: [{ itemType: 'mark', text: 'Checks data is sensible.', marks: 1 }],
					markChecklist: [{ text: 'Defines validation.', markSchemeItemIndexes: [0] }]
				}
			]
		},
		null,
		2
	)
);
const computerScienceNewGuardrailsFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${computerScienceNewGuardrailsPath}`,
		'--expected-marks=1',
		'--expected-questions=1'
	]
);
if (!computerScienceNewGuardrailsFailure.includes('known_response_line_count_mismatch')) {
	fail('Codex helper validation did not reject new CS Paper 1A line-count guardrail.', {
		computerScienceNewGuardrailsFailure
	});
}

const computerScience2024Paper1ASlidingContextPath = path.join(
	helperNormalizeDir,
	'computer-science-2024-paper-1a-sliding-context.json'
);
writeFileSync(
	computerScience2024Paper1ASlidingContextPath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp',
				docType: 'question_paper'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '12.5',
					promptText: 'State the purpose of the program.',
					selfContainedPromptText:
						'The program loops through positions and checks getTile(i, j) == 0. State the purpose of the program.',
					marks: 1,
					pageStart: 28,
					pageEnd: 28,
					response: { kind: 'lines', lineCount: 2 },
					stemBlocks: [{ kind: 'code', label: 'Figure 16', text: 'if (getTile(i, j) == 0)' }],
					markSchemeItems: [{ itemType: 'mark', text: 'Finds the blank tile.', marks: 1 }],
					markChecklist: [{ text: 'States that it finds the blank tile.', markSchemeItemIndexes: [0] }]
				}
			]
		},
		null,
		2
	)
);
const computerScience2024Paper1ASlidingContextFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${computerScience2024Paper1ASlidingContextPath}`,
		'--expected-marks=1',
		'--expected-questions=1'
	]
);
for (const expectedFailure of [
	'known_sliding_puzzle_context_missing',
	'known_sliding_puzzle_board_missing'
]) {
	if (!computerScience2024Paper1ASlidingContextFailure.includes(expectedFailure)) {
		fail(`Codex helper validation did not reject CS 2024 Paper 1A guardrail: ${expectedFailure}`, {
			computerScience2024Paper1ASlidingContextFailure
		});
	}
}

const computerScience2021Paper2LinePath = path.join(
	helperNormalizeDir,
	'computer-science-2021-paper-2-line-count.json'
);
writeFileSync(
	computerScience2021Paper2LinePath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-computer-science-2021-november-paper-2-written-assessment-qp',
				docType: 'question_paper'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '01.3',
					promptText: 'Explain one reason for using hexadecimal.',
					selfContainedPromptText: 'Explain one reason for using hexadecimal.',
					marks: 1,
					pageStart: 2,
					pageEnd: 2,
					response: { kind: 'lines', lineCount: 1 },
					markSchemeItems: [{ itemType: 'mark', text: 'More compact than binary.', marks: 1 }],
					markChecklist: [{ text: 'Gives a valid reason.', markSchemeItemIndexes: [0] }]
				},
				{
					sourceQuestionRef: '13.3',
					promptText: 'Explain how one of these security methods works.',
					selfContainedPromptText:
						'Ring your chosen security method: Authentication or MAC address filtering. Explain how it works.',
					marks: 2,
					pageStart: 13,
					pageEnd: 13,
					response: {
						kind: 'labeled-lines',
						fields: [
							{ label: 'Chosen security method', lineCount: 1 },
							{ label: 'How it works', lineCount: 3 }
						]
					},
					markSchemeItems: [{ itemType: 'mark', text: 'Explains one method.', marks: 2 }],
					markChecklist: [{ text: 'Explains method.', markSchemeItemIndexes: [0] }]
				}
			]
		},
		null,
		2
	)
);
const computerScience2021Paper2LineFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${computerScience2021Paper2LinePath}`,
		'--expected-marks=3',
		'--expected-questions=2'
	]
);
if (!computerScience2021Paper2LineFailure.includes('known_response_line_count_mismatch')) {
	fail('Codex helper validation did not reject CS 2021 Paper 2 line-count guardrail.', {
		computerScience2021Paper2LineFailure
	});
}
if (!computerScience2021Paper2LineFailure.includes('known_ring_choice_flattened')) {
	fail('Codex helper validation did not reject CS 2021 Paper 2 ring-choice guardrail.', {
		computerScience2021Paper2LineFailure
	});
}

const computerScience2021Paper1ResponsePath = path.join(
	helperNormalizeDir,
	'computer-science-2021-paper-1-response-guards.json'
);
writeFileSync(
	computerScience2021Paper1ResponsePath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-computer-science-2021-november-paper-1-computational-thinking-and-problem-solving-qp',
				docType: 'question_paper'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '02.4',
					promptText: 'Complete the trace table.',
					selfContainedPromptText: 'Complete the trace table for Figure 1.',
					marks: 4,
					pageStart: 5,
					pageEnd: 5,
					stemBlocks: [{ kind: 'paragraph', text: 'Use the algorithm in Figure 1.' }],
					response: {
						kind: 'choice-table',
						columns: ['seconds', 'bpm', 'effort', 'OUTPUT'],
						rows: [['0', '70', '', '']],
						correctAnswers: [{ targetId: 'row1-effort', correctAnswer: '20' }]
					},
					assets: [{ sourceLabel: 'Figure 1', role: 'algorithm', filePath: 'tiny-figure.png' }],
					markSchemeItems: [{ itemType: 'mark', text: 'Trace table completed.', marks: 4 }],
					markChecklist: [{ text: 'Completes trace table.', markSchemeItemIndexes: [0] }]
				},
				{
					sourceQuestionRef: '04.4',
					promptText: 'Complete the trace table.',
					selfContainedPromptText: 'Complete the trace table.',
					marks: 3,
					pageStart: 10,
					pageEnd: 10,
					response: {
						kind: 'choice-table',
						columns: ['i', 'newRow[0]'],
						rows: [
							['', '0'],
							['0', '']
						],
						correctAnswers: [{ targetId: 'row-count', correctAnswer: 'seven trace rows' }]
					},
					markSchemeItems: [{ itemType: 'mark', text: 'Trace table completed.', marks: 3 }],
					markChecklist: [{ text: 'Completes trace table.', markSchemeItemIndexes: [0] }]
				},
				{
					sourceQuestionRef: '05.3',
					promptText: 'Develop an algorithm.',
					selfContainedPromptText: 'Develop an algorithm.',
					marks: 9,
					pageStart: 13,
					pageEnd: 13,
					response: { kind: 'lines', lineCount: 13 },
					markSchemeItems: [{ itemType: 'mark', text: 'Algorithm is correct.', marks: 9 }],
					markChecklist: [{ text: 'Develops a valid algorithm.', markSchemeItemIndexes: [0] }]
				},
				{
					sourceQuestionRef: '07.2',
					promptText: 'Identify the output of the logic circuit in Figure 6.',
					selfContainedPromptText: 'Figure 6 shows a logic circuit. Identify the output.',
					marks: 1,
					pageStart: 17,
					pageEnd: 17,
					stemBlocks: [{ kind: 'asset', assetLabel: 'Figure 6' }],
					response: {
						kind: 'choice',
						options: ['A', 'B'],
						correctAnswers: [{ targetId: 'answer', correctAnswer: 'A' }]
					},
					assets: [{ sourceLabel: 'Figure 6', role: 'figure', filePath: 'tiny-figure.png' }],
					markSchemeItems: [{ itemType: 'mark', text: 'Correct output.', marks: 1 }],
					markChecklist: [{ text: 'Selects correct output.', markSchemeItemIndexes: [0] }]
				},
				{
					sourceQuestionRef: '09.2',
					promptText: 'Draw the output grid.',
					selfContainedPromptText: 'Draw the output grid.',
					marks: 2,
					pageStart: 25,
					pageEnd: 25,
					response: { kind: 'drawing-box', grid: { rows: 3, columns: 5 } },
					markSchemeItems: [{ itemType: 'mark', text: 'Grid drawn correctly.', marks: 2 }],
					markChecklist: [{ text: 'Uses the correct grid.', markSchemeItemIndexes: [0] }]
				}
			]
		},
		null,
		2
	)
);
const computerScience2021Paper1ResponseFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${computerScience2021Paper1ResponsePath}`,
		'--expected-marks=19',
		'--expected-questions=5'
	]
);
for (const expectedFailure of [
	'known_algorithm_context_missing',
	'known_trace_table_response_rows_mismatch',
	'known_response_line_count_mismatch',
	'known_figure_crop_incomplete',
	'known_drawing_grid_mismatch'
]) {
	if (!computerScience2021Paper1ResponseFailure.includes(expectedFailure)) {
		fail(`Codex helper validation did not reject CS 2021 Paper 1 guardrail: ${expectedFailure}`, {
			computerScience2021Paper1ResponseFailure
		});
	}
}

const computerScience2022Paper2DrawingPath = path.join(
	helperNormalizeDir,
	'computer-science-2022-paper-2-drawing-crop.json'
);
writeFileSync(
	computerScience2022Paper2DrawingPath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-computer-science-2022-june-paper-2-computing-concepts-qp',
				docType: 'question_paper'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '02.2',
					promptText: 'Apply a binary shift three places to the right on 10101000.',
					selfContainedPromptText: 'Apply a binary shift three places to the right on 10101000.',
					marks: 1,
					pageStart: 3,
					pageEnd: 3,
					response: { kind: 'lines', lineCount: 2 },
					markSchemeItems: [{ itemType: 'mark', text: '00010101.', marks: 1 }],
					markChecklist: [{ text: 'Gives the shifted 8-bit result.', markSchemeItemIndexes: [0] }]
				},
				{
					sourceQuestionRef: '03.2',
					promptText: 'Complete the logic circuit for D, L, W and R.',
					selfContainedPromptText: 'Complete the logic circuit for D, L, W and R.',
					marks: 3,
					pageStart: 4,
					pageEnd: 4,
					response: { kind: 'drawing-box', assetLabel: 'Q03.2 logic circuit drawing box' },
					assets: [
						{
							sourceLabel: 'Q03.2 logic circuit drawing box',
							role: 'response-surface',
							filePath: 'tiny-figure.png'
						}
					],
					markSchemeItems: [{ itemType: 'mark', text: 'Circuit is correct.', marks: 3 }],
					markChecklist: [{ text: 'Draws the correct circuit.', markSchemeItemIndexes: [0] }]
				},
				{
					sourceQuestionRef: '03.3',
					promptText: 'Choose the corrected Boolean expression.',
					selfContainedPromptText: 'Choose the corrected Boolean expression.',
					marks: 1,
					pageStart: 4,
					pageEnd: 4,
					response: {
						kind: 'choice',
						options: [
							'A (W . D) . (D . L) . (W . L)',
							'B (W . D) . (D . L) + (W . L)',
							'C (W . D) + (D . L) + (W . L)',
							'D (W . D) + (D + L) . (W . L)'
						],
						correctAnswers: [{ targetId: 'answer', correctAnswer: 'C' }]
					},
					markSchemeItems: [{ itemType: 'mark', text: 'C', marks: 1 }],
					markChecklist: [{ text: 'Selects C.', markSchemeItemIndexes: [0] }]
				},
				{
					sourceQuestionRef: '09.2',
					promptText: 'Explain one benefit.',
					selfContainedPromptText: 'Explain one benefit.',
					marks: 2,
					pageStart: 10,
					pageEnd: 10,
					response: { kind: 'lines', lineCount: 2 },
					markSchemeItems: [{ itemType: 'mark', text: 'Valid explanation.', marks: 2 }],
					markChecklist: [{ text: 'Explains a valid benefit.', markSchemeItemIndexes: [0] }]
				},
				{
					sourceQuestionRef: '17.2',
					promptText: 'Use Figure 2 to create a Huffman tree.',
					selfContainedPromptText: 'Figure 2 shows MISSISSIPPI. Use it to create a Huffman tree.',
					marks: 2,
					pageStart: 20,
					pageEnd: 20,
					response: { kind: 'lines', lineCount: 2 },
					assets: [{ sourceLabel: 'Figure 2', role: 'figure', filePath: 'tiny-figure.png' }],
					markSchemeItems: [{ itemType: 'mark', text: 'Uses MISSISSIPPI frequencies.', marks: 2 }],
					markChecklist: [{ text: 'Uses the frequency text.', markSchemeItemIndexes: [0] }]
				}
			]
		},
		null,
		2
	)
);
const computerScience2022Paper2DrawingFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${computerScience2022Paper2DrawingPath}`,
		'--expected-marks=9',
		'--expected-questions=5'
	]
);
if (!computerScience2022Paper2DrawingFailure.includes('known_bit_box_response_mismatch')) {
	fail('Codex helper validation did not reject CS 2022 Paper 2 bit-box response guardrail.', {
		computerScience2022Paper2DrawingFailure
	});
}
if (!computerScience2022Paper2DrawingFailure.includes('known_figure_crop_incomplete')) {
	fail('Codex helper validation did not reject CS 2022 Paper 2 drawing-crop guardrail.', {
		computerScience2022Paper2DrawingFailure
	});
}
if (!computerScience2022Paper2DrawingFailure.includes('known_response_line_count_mismatch')) {
	fail('Codex helper validation did not reject CS 2022 Paper 2 line-count guardrail.', {
		computerScience2022Paper2DrawingFailure
	});
}
if (!computerScience2022Paper2DrawingFailure.includes('known_boolean_overline_missing')) {
	fail('Codex helper validation did not reject CS 2022 Paper 2 Boolean-overline guardrail.', {
		computerScience2022Paper2DrawingFailure
	});
}
if (!computerScience2022Paper2DrawingFailure.includes('known_simple_figure_asset_should_be_structural')) {
	fail('Codex helper validation did not reject CS 2022 Paper 2 text-figure asset guardrail.', {
		computerScience2022Paper2DrawingFailure
	});
}

const computerScience2022Paper2HuffmanSwapPath = path.join(
	helperNormalizeDir,
	'computer-science-2022-paper-2-huffman-swap.json'
);
writeFileSync(
	computerScience2022Paper2HuffmanSwapPath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-computer-science-2022-june-paper-2-computing-concepts-qp',
				docType: 'question_paper'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '17.3',
					promptText:
						'Complete the Huffman tree below to show the position of the characters I, S and P using the codes from Figure 3.',
					selfContainedPromptText:
						'Figure 3 gives I=0, S=11 and P=101. Complete the Huffman tree.',
					marks: 1,
					pageStart: 19,
					pageEnd: 19,
					stemBlocks: [
						{
							kind: 'table',
							label: 'Figure 3',
							columns: ['Character', 'Binary code'],
							rows: [
								['M', '100'],
								['I', '0'],
								['S', '11'],
								['P', '101']
							]
						}
					],
					response: {
						kind: 'image-label-zones',
						assetId: 'q17-3-huffman-tree-response',
						assetLabel: 'Q17.3 Huffman tree response',
						labels: ['I', 'S', 'P'],
						zones: [
							{ id: 'left-root-leaf', x: 0.04, y: 0.28, width: 0.09, height: 0.1 },
							{ id: 'right-node-leaf', x: 0.79, y: 0.47, width: 0.09, height: 0.11 },
							{ id: 'right-of-3-leaf', x: 0.52, y: 0.78, width: 0.09, height: 0.11 }
						],
						correctAnswers: [
							{ targetId: 'left-root-leaf', correctAnswer: 'I' },
							{ targetId: 'right-node-leaf', correctAnswer: 'P' },
							{ targetId: 'right-of-3-leaf', correctAnswer: 'S' }
						]
					},
					assets: [
						{
							sourceLabel: 'Q17.3 Huffman tree response',
							role: 'response-surface',
							filePath: 'tiny-figure.png'
						}
					],
					markSchemeItems: [{ itemType: 'mark', text: 'I, S and P are in the correct leaves.', marks: 1 }],
					markChecklist: [{ text: 'Labels all three leaves correctly.', markSchemeItemIndexes: [0] }]
				}
			]
		},
		null,
		2
	)
);
const computerScience2022Paper2HuffmanSwapFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${computerScience2022Paper2HuffmanSwapPath}`,
		'--expected-marks=1',
		'--expected-questions=1'
	]
);
if (
	!computerScience2022Paper2HuffmanSwapFailure.includes('known_huffman_tree_answer_key_swapped')
) {
	fail('Codex helper validation did not reject CS 2022 Paper 2 Huffman S/P key swap.', {
		computerScience2022Paper2HuffmanSwapFailure
	});
}

const computerScience2022Paper2PerFieldLinePath = path.join(
	helperNormalizeDir,
	'computer-science-2022-paper-2-per-field-lines.json'
);
writeFileSync(
	computerScience2022Paper2PerFieldLinePath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-computer-science-2022-june-paper-2-computing-concepts-qp',
				docType: 'question_paper'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '04.2',
					promptText: 'State four functions of an operating system.',
					selfContainedPromptText: 'State four functions of an operating system.',
					marks: 4,
					pageStart: 6,
					pageEnd: 6,
					response: {
						kind: 'labeled-lines',
						labels: ['1', '2', '3', '4'],
						lineCount: 1
					},
					markSchemeItems: [
						{ itemType: 'mark', text: 'Manages memory.', marks: 1 },
						{ itemType: 'mark', text: 'Manages files.', marks: 1 },
						{ itemType: 'mark', text: 'Manages peripherals.', marks: 1 },
						{ itemType: 'mark', text: 'Provides a user interface.', marks: 1 }
					],
					markChecklist: [
						{ text: 'Gives four valid operating-system functions.', markSchemeItemIndexes: [0, 1, 2, 3] }
					],
					modelAnswer: {
						answerText: 'Manages memory, files, peripherals, and the user interface.'
					}
				}
			]
		},
		null,
		2
	)
);
const computerScience2022Paper2PerFieldLineFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${computerScience2022Paper2PerFieldLinePath}`,
		'--expected-marks=4',
		'--expected-questions=1'
	]
);
if (
	!computerScience2022Paper2PerFieldLineFailure.includes(
		'expected 2 per labeled field'
	)
) {
	fail('Codex helper validation did not reject CS 2022 Paper 2 per-field line undercount.', {
		computerScience2022Paper2PerFieldLineFailure
	});
}

const computerScience2022Paper2ResponseSurfacePath = path.join(
	helperNormalizeDir,
	'computer-science-2022-paper-2-response-surfaces.json'
);
writeFileSync(
	computerScience2022Paper2ResponseSurfacePath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-computer-science-2022-june-paper-2-computing-concepts-qp',
				docType: 'question_paper'
			},
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '01.2',
					promptText: 'Convert the binary number 10111001 into hexadecimal. You should show your working.',
					selfContainedPromptText:
						'Convert the binary number 10111001 into hexadecimal. Show your working.',
					marks: 2,
					pageStart: 2,
					pageEnd: 2,
					response: {
						kind: 'equation-blanks',
						segments: [
							{ kind: 'text', text: 'Hexadecimal = ' },
							{ kind: 'blank', id: 'left-hex-digit' },
							{ kind: 'blank', id: 'right-hex-digit' }
						],
						correctAnswers: [
							{ targetId: 'left-hex-digit', correctAnswer: 'B' },
							{ targetId: 'right-hex-digit', correctAnswer: '9' }
						]
					},
					markSchemeItems: [
						{ itemType: 'mark', text: 'B as the left hexadecimal digit.', marks: 1 },
						{ itemType: 'mark', text: '9 as the right hexadecimal digit.', marks: 1 }
					],
					markChecklist: [
						{ text: 'Left hexadecimal digit is B.', markSchemeItemIndexes: [0] },
						{ text: 'Right hexadecimal digit is 9.', markSchemeItemIndexes: [1] }
					]
				},
				{
					sourceQuestionRef: '04.1',
					promptText: 'Describe what is meant by the terms system software and application software.',
					selfContainedPromptText:
						'Describe what is meant by the terms system software and application software.',
					marks: 2,
					pageStart: 6,
					pageEnd: 6,
					response: { kind: 'lines', lineCount: 3 },
					markSchemeItems: [
						{ itemType: 'mark', text: 'System software manages the computer system.', marks: 1 },
						{ itemType: 'mark', text: 'Application software is used for end-user tasks.', marks: 1 }
					],
					markChecklist: [
						{ text: 'Defines system software.', markSchemeItemIndexes: [0] },
						{ text: 'Defines application software.', markSchemeItemIndexes: [1] }
					],
					modelAnswer: {
						answerText:
							'System software manages the computer system. Application software lets the user perform tasks.'
					}
				}
			]
		},
		null,
		2
	)
);
const computerScience2022Paper2ResponseSurfaceFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${computerScience2022Paper2ResponseSurfacePath}`,
		'--expected-marks=4',
		'--expected-questions=2'
	]
);
for (const expectedFailure of [
	'known_working_plus_answer_response_missing',
	'known_response_line_count_mismatch'
]) {
	if (!computerScience2022Paper2ResponseSurfaceFailure.includes(expectedFailure)) {
		fail(`Codex helper validation did not reject CS 2022 response surface: ${expectedFailure}`, {
			computerScience2022Paper2ResponseSurfaceFailure
		});
	}
}

const computerScience2023SqlDuplicatePath = path.join(
	helperNormalizeDir,
	'computer-science-2023-sql-duplicate.json'
);
writeFileSync(
	computerScience2023SqlDuplicatePath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-computer-science-2023-june-paper-2-computing-concepts-qp',
				docType: 'question_paper',
				pageCount: 24
			},
			markSchemeDocument: { id: 'aqa-computer-science-2023-june-paper-2-computing-concepts-ms' },
			questions: [
				{
					sourceQuestionRef: '14.5',
					promptText:
						'Barry Tucker has returned their copy of the book Python Basics. Complete the SQL to delete the loan record for the book PB002.',
					selfContainedPromptText:
						'Barry Tucker has returned their copy of the book Python Basics. Complete the SQL to delete the loan record for the book PB002.',
					marks: 2,
					pageStart: 19,
					pageEnd: 19,
					promptBlocks: [
						{ kind: 'paragraph', text: 'Complete the SQL to delete the loan record.' },
						{ kind: 'code', text: 'DELETE FROM __________\n\nWHERE ______________________________' }
					],
					response: {
						kind: 'equation-blanks',
						segments: [
							{ kind: 'text', text: 'DELETE FROM ' },
							{ kind: 'blank', id: 'delete-from' },
							{ kind: 'text', text: '\n\nWHERE ' },
							{ kind: 'blank', id: 'where-clause' }
						],
						correctAnswers: [
							{ targetId: 'delete-from', correctAnswer: 'Loan' },
							{
								targetId: 'where-clause',
								correctAnswer: 'CopyID = "PB002" AND StudentID = "TUC004"'
							}
						]
					},
					markSchemeItems: [
						{ itemType: 'mark', text: 'DELETE FROM Loan.', marks: 1 },
						{
							itemType: 'mark',
							text: 'WHERE CopyID = "PB002" AND StudentID = "TUC004".',
							marks: 1
						}
					],
					markChecklist: [
						{ text: 'Completes DELETE FROM with Loan.', markSchemeItemIndexes: [0] },
						{
							text: 'Completes WHERE with both CopyID PB002 and StudentID TUC004.',
							markSchemeItemIndexes: [1]
						}
					]
				}
			]
		},
		null,
		2
	)
);
const computerScience2023SqlDuplicateFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${computerScience2023SqlDuplicatePath}`,
		'--expected-marks=2',
		'--expected-questions=1'
	]
);
if (!computerScience2023SqlDuplicateFailure.includes('known_sql_skeleton_duplicate_response')) {
	fail('Codex helper validation did not reject duplicated Q14.5 SQL skeleton rendering.', {
		computerScience2023SqlDuplicateFailure
	});
}

const computerScience2023MissingResponsePath = path.join(
	helperNormalizeDir,
	'computer-science-2023-missing-response.json'
);
writeFileSync(
	computerScience2023MissingResponsePath,
	JSON.stringify(
		{
			sourceDocument: {
				id: 'aqa-computer-science-2023-june-paper-2-computing-concepts-qp',
				docType: 'question_paper',
				pageCount: 28
			},
			markSchemeDocument: { id: 'aqa-computer-science-2023-june-paper-2-computing-concepts-ms' },
			questions: [
				{
					sourceQuestionRef: '03.0',
					promptText: 'Add together the following three binary numbers and give your answer in binary.',
					selfContainedPromptText:
						'Add together the following three binary numbers and give your answer in binary.',
					marks: 2,
					pageStart: 3,
					pageEnd: 3,
					stemBlocks: [
						{
							kind: 'code',
							text: '  0 1 0 1 1 0 0 0\n  0 0 0 1 1 0 0 1\n+ 0 1 0 0 1 0 1 1'
						}
					],
					response: { kind: 'none' },
					markSchemeItems: [{ itemType: 'mark', text: 'Correct binary answer.', marks: 2 }],
					markChecklist: [{ text: 'Adds the binary numbers correctly.', markSchemeItemIndexes: [0] }]
				}
			]
		},
		null,
		2
	)
);
const computerScience2023MissingResponseFailure = runNodeScriptExpectFailure(
	'scripts/codex-import-helper.mjs',
	[
		'validate-extraction',
		`--input=${computerScience2023MissingResponsePath}`,
		'--expected-marks=2',
		'--expected-questions=1'
	]
);
if (!computerScience2023MissingResponseFailure.includes('known_missing_response_control')) {
	fail('Codex helper validation did not reject missing Q03.0 response control.', {
		computerScience2023MissingResponseFailure
	});
}

const oversizedFigurePath = path.join(helperNormalizeDir, 'oversized-figure-crop.png');
const oversizedFigureBuffer = Buffer.alloc(24);
Buffer.from('89504e470d0a1a0a', 'hex').copy(oversizedFigureBuffer, 0);
oversizedFigureBuffer.writeUInt32BE(1000, 16);
oversizedFigureBuffer.writeUInt32BE(700, 20);
writeFileSync(oversizedFigurePath, oversizedFigureBuffer);
const oversizedFigureCropPath = path.join(helperNormalizeDir, 'oversized-figure-crop.json');
writeFileSync(
	oversizedFigureCropPath,
	JSON.stringify(
		{
			sourceDocument: { id: 'aqa-84611h-qp-nov20', docType: 'question_paper' },
			markSchemeDocument: { id: 'test-ms', docType: 'mark_scheme' },
			questions: [
				{
					sourceQuestionRef: '02.2',
					promptText: 'Figure 2 shows part of a leaf. Which two changes increase diffusion?',
					selfContainedPromptText:
						'Figure 2 shows part of a leaf. Which two changes increase diffusion?',
					marks: 2,
					pageStart: 7,
					pageEnd: 7,
					stemBlocks: [
						{ kind: 'paragraph', text: 'Figure 2 shows part of a leaf.' },
						{ kind: 'asset', assetLabel: 'Figure 2' }
					],
					response: {
						kind: 'choice',
						options: [
							'Decreased number of chloroplasts',
							'Increased carbon dioxide concentration',
							'Increased number of open stomata'
						],
						correctAnswers: [
							{ targetId: 'choice-1', correctAnswer: 'Increased carbon dioxide concentration' },
							{ targetId: 'choice-2', correctAnswer: 'Increased number of open stomata' }
						]
					},
					assets: [
						{ sourceLabel: 'Figure 2', role: 'figure', filePath: 'oversized-figure-crop.png' }
					],
					markSchemeItems: [
						{ itemType: 'mark', text: 'Increased carbon dioxide concentration.', marks: 1 },
						{ itemType: 'mark', text: 'Increased number of stomata that are open.', marks: 1 }
					],
					markChecklist: [
						{ text: 'Selects increased carbon dioxide concentration.', markSchemeItemIndexes: [0] },
						{ text: 'Selects increased number of open stomata.', markSchemeItemIndexes: [1] }
					],
					modelAnswer: {
						answerText:
							'Increased carbon dioxide concentration and increased number of stomata that are open.'
					}
				}
			]
		},
		null,
		2
	)
);
const oversizedFigureCropFailure = runNodeScriptExpectFailure('scripts/codex-import-helper.mjs', [
	'validate-extraction',
	`--input=${oversizedFigureCropPath}`,
	'--expected-marks=2',
	'--expected-questions=1'
]);
if (!oversizedFigureCropFailure.includes('known_figure_crop_prompt_contamination')) {
	fail('Codex helper validation did not reject a known prompt-contaminated figure crop.', {
		oversizedFigureCropFailure
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

const missingDiagramResponseIssues = pipelineModule.deterministicCandidateIssues(
	{
		questions: [
			{
				sourceQuestionRef: '03.6',
				commandWord: 'Explain',
				marks: 4,
				promptText:
					'Explain how a wave cut platform is formed as a cliff is eroded. Use one or more diagrams to support your answer.',
				response: { kind: 'lines', count: 6 },
				markSchemeItems: [
					{ itemType: 'level_descriptor', text: 'Max lower Level 2 if diagram is not used.' },
					{ itemType: 'mark', text: 'Explains erosion and retreat.' }
				],
				markChecklist: [{ text: 'Uses a labelled diagram.', markSchemeItemIndexes: [0] }],
				modelAnswer: { answerText: 'A labelled diagram shows notch formation and retreat.' }
			}
		]
	},
	{ includeAnswerChainIssues: false }
);
if (
	!missingDiagramResponseIssues.some((finding) =>
		finding.issues.some(
			(issue) =>
				issue.severity === 'error' && issue.code === 'diagram_response_surface_missing'
		)
	)
) {
	fail('Deterministic checks did not flag a diagram-required prompt with only answer lines.');
}

const drawingBoxDiagramResponseIssues = pipelineModule.deterministicCandidateIssues(
	{
		questions: [
			{
				sourceQuestionRef: '03.6',
				commandWord: 'Explain',
				marks: 4,
				promptText:
					'Explain how a wave cut platform is formed as a cliff is eroded. Use one or more diagrams to support your answer.',
				response: { kind: 'drawing-box', label: 'Diagram and written answer' },
				markSchemeItems: [
					{ itemType: 'level_descriptor', text: 'Max lower Level 2 if diagram is not used.' },
					{ itemType: 'mark', text: 'Explains erosion and retreat.' }
				],
				markChecklist: [{ text: 'Uses a labelled diagram.', markSchemeItemIndexes: [0] }],
				modelAnswer: { answerText: 'A labelled diagram shows notch formation and retreat.' }
			}
		]
	},
	{ includeAnswerChainIssues: false }
);
if (
	drawingBoxDiagramResponseIssues.some((finding) =>
		finding.issues.some((issue) => issue.code === 'diagram_response_surface_missing')
	)
) {
	fail('Deterministic checks rejected a diagram-required drawing-box response.', {
		drawingBoxDiagramResponseIssues
	});
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

const rawAlternativeAnswerQuestion = {
	sourceQuestionRef: '11.0',
	commandWord: 'Complete',
	marks: 2,
	promptText: 'Complete the Unicode values.',
	response: {
		kind: 'equation-blanks',
		segments: [
			{ kind: 'text', text: 'w = ' },
			{ kind: 'blank', id: 'unicode-w', label: 'w Unicode value' }
		],
		correctAnswers: [{ targetId: 'unicode-w', correctAnswer: '119 or 77' }]
	},
	markSchemeItems: [{ itemType: 'mark', text: '119 or 77.' }],
	modelAnswer: null
};
const rawAlternativeAnswerIssues = pipelineModule.deterministicCandidateIssues(
	{ questions: [rawAlternativeAnswerQuestion] },
	{ includeAnswerChainIssues: false }
);
if (
	!rawAlternativeAnswerIssues.some((finding) =>
		finding.issues.some(
			(issue) =>
				issue.severity === 'error' &&
				issue.code === 'fixed_response_alternative_answer_not_machine_readable'
		)
	)
) {
	fail('Deterministic checks did not reject literal fixed-response alternatives.');
}
const normalizedAlternativeAnswerQuestion = pipelineModule.normalizeExtractedQuestionForImport(
	rawAlternativeAnswerQuestion
);
const normalizedAlternativeAnswer =
	normalizedAlternativeAnswerQuestion.response?.correctAnswers?.[0];
if (
	normalizedAlternativeAnswer?.correctAnswer !== '119' ||
	normalizedAlternativeAnswer?.aliases?.join(',') !== '77'
) {
	fail('Import normalizer did not convert literal fixed-response alternatives into aliases.', {
		normalizedAlternativeAnswerQuestion
	});
}
const normalizedAlternativeAnswerIssues = pipelineModule.deterministicCandidateIssues(
	{ questions: [normalizedAlternativeAnswerQuestion] },
	{ includeAnswerChainIssues: false }
);
if (
	normalizedAlternativeAnswerIssues.some((finding) =>
		finding.issues.some(
			(issue) => issue.code === 'fixed_response_alternative_answer_not_machine_readable'
		)
	)
) {
	fail('Deterministic checks rejected normalized fixed-response aliases.', {
		normalizedAlternativeAnswerIssues
	});
}

const graphPlottingAssetQuestion = {
	sourceQuestionRef: '04.1',
	commandWord: 'Plot',
	marks: 1,
	promptText: 'Plot the width of the river at Site 6 on to the graph below. Use the following data.',
	stemBlocks: [
		{
			kind: 'structured-table',
			label: 'Figure 14',
			columns: ['Site', '1', '2', '6'],
			rows: [
				['Distance from source (km)', '2', '15', '66'],
				['Width of river (m)', '1.9', '3.2', '9.0']
			]
		}
	],
	response: {
		kind: 'asset-canvas',
		assetLabel: 'Figure 14',
		instructions: 'Plot Site 6 at distance 66 km and width 9.0 m.',
		correctAnswers: [{ targetId: 'site-6-point', correctAnswer: 'Point plotted at (66 km, 9.0 m).' }]
	},
	markSchemeItems: [{ itemType: 'mark', text: 'Correct plot at distance 66 km and river width 9.0 m.' }],
	modelAnswer: { answerText: 'Plot a point at 66 km and 9.0 m.' }
};
const normalizedGraphPlottingAssetQuestion =
	pipelineModule.normalizeExtractedQuestionForImport(graphPlottingAssetQuestion);
if (normalizedGraphPlottingAssetQuestion.response?.kind !== 'asset-canvas') {
	fail('Import normalizer converted a graph plotting canvas into a choice-table.', {
		normalizedGraphPlottingAssetQuestion
	});
}
const graphPlottingChoiceTableIssues = pipelineModule.deterministicCandidateIssues(
	{
		questions: [
			{
				...graphPlottingAssetQuestion,
				response: {
					kind: 'choice-table',
					columns: ['Source row', 'Source column', 'Value'],
					rows: [['Site: Distance from source (km)', '6', '66']],
					correctAnswers: [
						{ targetId: 'answer', correctAnswer: 'Site: Distance from source (km) | 6 | 66' }
					]
				}
			}
		]
	},
	{ includeAnswerChainIssues: false }
);
if (
	!graphPlottingChoiceTableIssues.some((finding) =>
		finding.issues.some(
			(issue) =>
				issue.severity === 'error' && issue.code === 'diagram_response_surface_missing'
		)
	)
) {
	fail('Deterministic checks did not reject graph plotting represented as choice-table.', {
		graphPlottingChoiceTableIssues
	});
}

const tableValueSelectionQuestion = {
	sourceQuestionRef: '01.4',
	commandWord: 'Ring',
	marks: 1,
	promptText: 'Ring the anomalous value in Table 1.',
	stemBlocks: [
		{
			kind: 'structured-table',
			label: 'Table 1',
			columns: ['Trial', '1', '2', '3'],
			rows: [['Volume of gas (cm3)', '18.5', '19.3', '14.2']]
		}
	],
	response: {
		kind: 'asset-canvas',
		assetLabel: 'Table 1',
		correctAnswers: [{ targetId: 'answer', correctAnswer: '14.2' }]
	},
	markSchemeItems: [{ itemType: 'mark', text: 'A ring around 14.2.' }],
	modelAnswer: null
};
const normalizedTableValueSelectionQuestion =
	pipelineModule.normalizeExtractedQuestionForImport(tableValueSelectionQuestion);
if (
	normalizedTableValueSelectionQuestion.response?.kind !== 'choice-table' ||
	normalizedTableValueSelectionQuestion.response?.correctAnswers?.[0]?.correctAnswer !==
		'Trial: Volume of gas (cm3) | 3 | 14.2'
) {
	fail('Import normalizer did not convert a genuine table value selection into choice-table.', {
		normalizedTableValueSelectionQuestion
	});
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

const duplicateChoiceLetterModelAnswerIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '01.2',
			commandWord: 'Shade',
			marks: 2,
			response: {
				kind: 'choice',
				multiple: true,
				options: [
					'A Storage distractor',
					'B Human readable',
					'C Processing distractor',
					'F Faster to type'
				],
				correctAnswers: [
					{ targetId: 'answer-1', correctAnswer: 'B Human readable' },
					{ targetId: 'answer-2', correctAnswer: 'F Faster to type' }
				]
			},
			markSchemeItems: [
				{ itemType: 'mark', text: 'Human readable.' },
				{ itemType: 'mark', text: 'Faster to type.' }
			],
			modelAnswer: { answerText: 'B and F' },
			answerChain: {
				id: 'cs-chain-choice-concept-match',
				title: 'Choice concept',
				canonicalChainText: 'concept cue -> option match',
				summary: 'Match concepts.',
				steps: [
					{
						stepText: 'concept cue',
						stepRole: 'given',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [0]
					},
					{
						stepText: 'option match',
						stepRole: 'conclusion',
						explanation: null,
						commonOmission: null,
						markSchemeItemIndexes: [1]
					}
				]
			}
		}
	]
});
if (
	duplicateChoiceLetterModelAnswerIssues.some((finding) =>
		finding.issues.some((issue) => issue.code === 'fixed_response_model_answer_review')
	)
) {
	fail(
		'Deterministic checks warned when a fixed-response model answer used only the correct option letters.'
	);
}

const duplicateBitSequenceModelAnswerIssues = pipelineModule.deterministicCandidateIssues({
	questions: [
		{
			sourceQuestionRef: '07.4',
			commandWord: 'Give',
			marks: 2,
			response: {
				kind: 'equation-blanks',
				segments: Array.from({ length: 4 }, (_, index) => ({
					kind: 'blank',
					id: `bit-${index + 1}`
				})),
				correctAnswers: [
					{ targetId: 'bit-1', correctAnswer: '1' },
					{ targetId: 'bit-2', correctAnswer: '0' },
					{ targetId: 'bit-3', correctAnswer: '1' },
					{ targetId: 'bit-4', correctAnswer: '1' }
				]
			},
			markSchemeItems: [{ itemType: 'mark', text: 'Correct bit pattern.' }],
			modelAnswer: { answerText: '1011' },
			answerChain: {
				id: 'cs-chain-bit-pattern-method',
				title: 'Bit pattern',
				canonicalChainText: 'cue -> bit order',
				summary: 'Order bits.',
				steps: [
					{
						stepText: 'bit order',
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
	duplicateBitSequenceModelAnswerIssues.some((finding) =>
		finding.issues.some((issue) => issue.code === 'fixed_response_model_answer_review')
	)
) {
	fail(
		'Deterministic checks warned when a fixed-response model answer only joined one-bit answer keys.'
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

const codeOperatorSolvabilityContext = pipelineModule.buildLearnerVisibleQuestionContext(
	{
		questions: [
			{
				sourceQuestionRef: '03.3',
				parentSourceQuestionRef: '03',
				displayOrder: 3,
				promptText: 'Describe the syntax and logic errors.',
				stemBlocks: [
					{
						kind: 'structured-table',
						label: 'Figure 3',
						rows: [
							['6', 'while (userNumber < 1 || userNumber > 100)'],
							['faulty', 'whil (userNumber < 1 || userNumber >= 100)']
						]
					}
				],
				promptBlocks: [{ kind: 'paragraph', text: 'Complete the table.' }],
				response: { kind: 'labeled-lines', labels: ['Syntax error', 'Logic error'] },
				markSchemeItems: [{ itemType: 'mark', text: '>=100 should be >100.' }]
			}
		]
	},
	'03.3',
	{ attachImages: false }
);
const codeOperatorVisibleText = JSON.stringify(
	codeOperatorSolvabilityContext.studentVisibleContext.sections
);
if (
	!codeOperatorVisibleText.includes('userNumber < 1 || userNumber > 100') ||
	!codeOperatorVisibleText.includes('userNumber >= 100')
) {
	fail('Solvability context stripped literal code comparison operators.', {
		codeOperatorSolvabilityContext
	});
}

const mixedChoiceLineSolvabilityContext = pipelineModule.buildLearnerVisibleQuestionContext(
	{
		questions: [
			{
				sourceQuestionRef: '04.1',
				parentSourceQuestionRef: '04',
				displayOrder: 1,
				promptText:
					'How many countries had a serious threat level? Shade one circle only. What percentage had a serious threat level?',
				stemBlocks: [{ kind: 'text', text: 'Study Figure 12.' }],
				promptBlocks: [
					{
						kind: 'text',
						text: 'Shade one circle only. Give the percentage.'
					}
				],
				response: {
					kind: 'labeled-lines',
					choiceOptions: ['A 3', 'B 4', 'C 5', 'D 6'],
					fields: [{ label: 'Percentage', lineCount: 1 }],
					labels: ['Percentage'],
					lineCount: 1,
					correctAnswers: [
						{ targetId: 'choice', correctAnswer: 'B 4' },
						{ targetId: 'Percentage', correctAnswer: '16%' }
					]
				},
				markSchemeItems: [{ itemType: 'mark', text: 'B 4 and 16%.' }]
			}
		]
	},
	'04.1',
	{ attachImages: false }
);
const mixedChoiceLineResponseText =
	mixedChoiceLineSolvabilityContext.studentVisibleContext.sections[0]?.response ?? '';
if (
	!mixedChoiceLineResponseText.includes('Fixed choice control') ||
	!mixedChoiceLineResponseText.includes('B 4') ||
	!mixedChoiceLineResponseText.includes('Percentage')
) {
	fail(
		'Solvability context omitted labeled-lines fixed choice options from the response surface.',
		mixedChoiceLineSolvabilityContext
	);
}

const keyBlockSolvabilityContext = pipelineModule.buildLearnerVisibleQuestionContext(
	{
		questions: [
			{
				sourceQuestionRef: '17.2',
				parentSourceQuestionRef: '17',
				displayOrder: 1,
				promptText: 'Explain why RLE is not suitable.',
				stemBlocks: [
					{ kind: 'paragraph', text: 'When using RLE, the data become:' },
					{
						kind: 'key',
						label: 'RLE output',
						text: '1M 1I 2S 1I 2S 1I 2P 1I'
					},
					{
						kind: 'key',
						label: 'SQL skeleton',
						text: "INSERT INTO [A]\n[B] (5, 'Alina', 'Ahmed', '2020-11-30')"
					},
					{
						kind: 'key',
						label: 'Word bank',
						items: ['chain', 'consumer', 'increase', 'producer', 'reduce', 'web']
					}
				],
				promptBlocks: [{ kind: 'paragraph', text: 'Explain why RLE is not suitable.' }],
				response: { kind: 'lines', lineCount: 4 },
				markSchemeItems: [{ itemType: 'mark', text: 'RLE output is longer.' }]
			}
		]
	},
	'17.2',
	{ attachImages: false }
);
const keyBlockVisibleText = keyBlockSolvabilityContext.studentVisibleContext.sections[0]?.blocks
	?.stem ?? [];
if (
	!keyBlockVisibleText.some((text) => text.includes('1M 1I 2S')) ||
	!keyBlockVisibleText.some((text) => text.includes('INSERT INTO [A]')) ||
	!keyBlockVisibleText.some((text) => text.includes('- producer')) ||
	keyBlockSolvabilityContext.studentVisibleContext.sections[0]?.response !==
		'Answer lines: 4 line(s).'
) {
	fail('Solvability context omitted learner-visible key block text or lineCount response data.', {
		keyBlockSolvabilityContext
	});
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

const normalizedChoiceOptionsQuestion = pipelineModule.normalizeExtractedQuestionForImport({
	sourceQuestionRef: '01.1',
	response: {
		kind: 'choice',
		choiceOptions: ['A One', 'B Two'],
		correctAnswers: [{ targetId: 'choice', correctAnswer: 'B' }]
	}
});
if (
	normalizedChoiceOptionsQuestion.response.options?.join('|') !== 'A One|B Two' ||
	normalizedChoiceOptionsQuestion.response.choiceOptions?.join('|') !== 'A One|B Two'
) {
	fail('Import normalization did not canonicalize choiceOptions to options.', {
		normalizedChoiceOptionsQuestion
	});
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

const multiPageFigureContext = pipelineModule.buildLearnerVisibleQuestionContext(
	{
		sourceDocument: { id: 'test-paper' },
		questions: [
			{
				sourceQuestionRef: '02.1',
				promptText: 'Use Figure 1.',
				stemBlocks: [{ kind: 'figure', label: 'Figure 1', assetLabel: 'Figure 1' }],
				response: { kind: 'lines', count: 1 },
				assets: [
					{ sourceLabel: 'Figure 1', assetLabel: 'Figure 1 page 2', filePath: 'tmp/fig-1-p2.png' },
					{ sourceLabel: 'Figure 1', assetLabel: 'Figure 1 page 3', filePath: 'tmp/fig-1-p3.png' }
				],
				markSchemeItems: [{ itemType: 'mark', text: 'Uses both pages.' }]
			}
		]
	},
	'02.1',
	{ attachImages: false }
);
const figureOneMedia = multiPageFigureContext.studentVisibleContext.media.filter(
	(media) => media.label === 'Figure 1'
);
if (
	figureOneMedia.length !== 2 ||
	!figureOneMedia.some((media) => media.asset?.assetLabel === 'Figure 1 page 2') ||
	!figureOneMedia.some((media) => media.asset?.assetLabel === 'Figure 1 page 3')
) {
	fail('Solvability media context collapsed multi-page figure assets.', figureOneMedia);
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
