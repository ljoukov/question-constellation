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
		'node scripts/extract-paper-llm.mjs',
		'pnpm run download:aqa-separate-science',
			'pnpm run extract:aqa-separate-science:batch',
			'pnpm run import:aqa-separate-science',
			'--concurrency',
			'--force-chunks',
			'@ljoukov/llm',
			'tmp/llm-extraction-logs',
			'pnpm run summarize:llm-extraction-logs',
			'--run-id',
			'costUsd',
			'pdfinfo',
		'pdftoppm',
		'--mark-scheme-image-mode=all',
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
		'summarizeLlmInput',
		'EXTRACTION_LLM_MAX_ATTEMPTS ?? 3',
		'Return exactly the requested JSON object shape',
		'summarizeLlmError',
		'answerChainSpecificityIssues',
		'expandCompactFullPaperExtraction',
		'LOOKAHEAD QUESTION PAPER PAGE',
		'Do not start or extract sibling subquestions',
		'If an atomic subquestion number/prompt first appears on a lookahead page, omit it from this chunk'
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
		'--mark-scheme-image-mode',
		'--repair-attempts',
		'--repair-batch-size',
		'--llm-timeout-ms',
		'--llm-max-attempts',
		'--llm-max-attempts=3',
		'--skip-judge',
		'extractFullPaperFromPdfSet'
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
		"integerArg('llm-max-attempts', 3, 1)",
		"integerArg('judge-batch-size', 1, 1)",
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
		'deterministicCandidateIssues'
	],
	'Vision importer'
);

for (const scriptName of [
	'download:aqa-separate-science',
	'extract:aqa-separate-science:batch',
	'extract:physics-vision',
	'extract:aqa-separate-science',
	'extract:paper-llm',
	'summarize:llm-extraction-logs',
	'import:vision',
	'import:aqa-separate-science',
	'eval:extraction-pipeline-llm',
	'test:chain-golden',
	'test:extraction-pipeline'
]) {
	if (!packageJson.scripts?.[scriptName]) fail(`Missing package script: ${scriptName}`);
}

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
	'questionRefsFromText',
	'markSchemeTextExcerptForRefs',
	'judgeCandidateAgainstRubric',
	'pdfText'
]) {
	if (typeof pipelineModule[exportName] !== 'function') {
		fail(`Missing library export: ${exportName}`);
	}
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

const parsedRefs = pipelineModule.questionRefsFromText('0 1 . 1 Complete\n01.2 Describe\n10.12 Explain');
if (parsedRefs.join(',') !== '01.1,01.2,10.12') {
	fail('questionRefsFromText did not parse spaced and compact question refs.', parsedRefs);
}
const markSchemeExcerpt = pipelineModule.markSchemeTextExcerptForRefs(
	['header', '01.1 first answer', 'nearby guidance', '02.1 second answer'].join('\n'),
	['01.1'],
	2
);
if (!markSchemeExcerpt.includes('01.1 first answer') || markSchemeExcerpt.includes('02.1 second answer')) {
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
			(issue) =>
				issue.severity === 'error' && issue.code === 'chain_step_non_positive_evidence'
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
