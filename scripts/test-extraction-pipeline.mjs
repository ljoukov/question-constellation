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

for (const filePath of [
	'docs/product-methodology.md',
	'docs/product-flows.md',
	'docs/extraction-spec.md',
	'scripts/lib/llm-extraction-pipeline.mjs',
	'scripts/extract-paper-llm.mjs',
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
		'@ljoukov/llm',
		'pdfinfo',
		'pdftoppm',
		'reusable reasoning or method pattern'
	],
	'Extraction spec'
);

requireIncludes(
	pipelineSource,
	[
		'export async function extractCandidateFromPdfPair',
		'export async function evaluateCandidate',
		'export async function runGoldenPdfEval',
		'export async function judgeCandidateAgainstRubric',
		'export function pdfPageCount',
		'chatgpt-gpt-5.5-fast',
		'xhigh',
		'answerChainSpecificityIssues'
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
		'--repair-attempts',
		'--skip-judge',
		'extractCandidateFromPdfPair'
	],
	'Pipeline CLI'
);

for (const scriptName of [
	'extract:paper-llm',
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
	'scripts/extract-paper-llm.mjs',
	'scripts/eval-extraction-pipeline-llm.mjs'
]) {
	runNodeCheck(scriptPath);
}

const pipelineModule = await import(
	pathToFileURL(path.join(rootDir, 'scripts/lib/llm-extraction-pipeline.mjs')).href
);
for (const exportName of [
	'extractCandidateFromPdfPair',
	'extractCandidateFromImages',
	'evaluateCandidate',
	'runGoldenPdfEval',
	'repairCandidateAnswerChains',
	'judgeCandidateAgainstRubric'
]) {
	if (typeof pipelineModule[exportName] !== 'function') {
		fail(`Missing library export: ${exportName}`);
	}
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
