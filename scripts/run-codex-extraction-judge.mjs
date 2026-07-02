#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';

const rootDir = process.cwd();
loadDefaultEnv(rootDir);

const usage = `Usage:
node scripts/run-codex-extraction-judge.mjs \\
  --candidate=<normalized-extraction.json> \\
  --question-paper=<official-question-paper.pdf> \\
  --mark-scheme=<official-mark-scheme.pdf> \\
  --source-document-id=<stable-source-id>

Optional:
  --work-dir=tmp/codex-extraction-judge/<source-id>
  --output=tmp/codex-extraction-judge/<source-id>/judge-report.json
  --summary=tmp/codex-extraction-judge/<source-id>/codex-judge-summary.json
  --expected-marks=<n>
  --expected-questions=46
  --model=gpt-5.5
  --thinking-level=high
  --timeout-ms=7200000
  --force
  --dry-run`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const sourceDocumentId = requiredStringArg('source-document-id');
const candidatePath = path.resolve(rootDir, requiredStringArg('candidate'));
const questionPaperPath = path.resolve(rootDir, requiredStringArg('question-paper'));
const markSchemePath = path.resolve(rootDir, requiredStringArg('mark-scheme'));
const workDir = path.resolve(
	rootDir,
	stringArg('work-dir', path.join('tmp/codex-extraction-judge', sourceDocumentId))
);
const outputPath = path.resolve(
	rootDir,
	stringArg('output', path.join(workDir, 'judge-report.json'))
);
const summaryPath = path.resolve(
	rootDir,
	stringArg('summary', path.join(workDir, 'codex-judge-summary.json'))
);
const model = stringArg('model', 'gpt-5.5');
const thinkingLevel = stringArg('thinking-level', 'high');
const timeoutMs = integerArg('timeout-ms', 7_200_000, 1);
const expectedMarks = integerArg('expected-marks', null, 1);
const expectedQuestions = integerArg('expected-questions', null, 1);
const dryRun = hasArg('dry-run');
const force = hasArg('force');

for (const filePath of [candidatePath, questionPaperPath, markSchemePath]) {
	if (!existsSync(filePath)) throw new Error(`Input file does not exist: ${filePath}`);
}

const plan = {
	sourceDocumentId,
	candidatePath: relative(candidatePath),
	questionPaperPath: relative(questionPaperPath),
	markSchemePath: relative(markSchemePath),
	workDir: relative(workDir),
	outputPath: relative(outputPath),
	summaryPath: relative(summaryPath),
	model,
	thinkingLevel,
	expectedMarks,
	expectedQuestions
};

if (dryRun) {
	console.log(JSON.stringify({ status: 'dry-run', plan }, null, 2));
	process.exit(0);
}

prepareWorkDir();
const prompt = buildPrompt();
writeFileSync(path.join(workDir, 'prompt.md'), prompt);

const startedAt = new Date().toISOString();
let codexSummary = null;
try {
	const mechanicalValidation = validateCandidateMechanically();
	codexSummary = await runCodexSdkTurn({
		prompt,
		workDir,
		eventsPath: path.join(workDir, 'events.jsonl'),
		lastMessagePath: path.join(workDir, 'last-message.txt'),
		summaryPath: path.join(workDir, 'codex-run-summary.json'),
		model,
		thinkingLevel,
		timeoutMs
	});
	const judgeReportPath = path.join(workDir, 'judge-report.json');
	if (!existsSync(judgeReportPath)) throw new Error('Codex judge did not write judge-report.json.');
	const judgeReport = readJson(judgeReportPath);
	const status = judgePassed(judgeReport) ? 'passed' : 'failed';
	mkdirSync(path.dirname(outputPath), { recursive: true });
	copyFileSync(judgeReportPath, outputPath);
	const summary = {
		status,
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		mechanicalValidation,
		codex: codexSummary,
		judgeReport,
		artifacts: artifacts()
	};
	writeJson(summaryPath, summary);
	console.log(JSON.stringify(summary, null, 2));
	if (status !== 'passed') process.exit(1);
} catch (error) {
	const summary = {
		status: 'failed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		codex: codexSummary,
		error: error instanceof Error ? error.message : String(error),
		artifacts: artifacts()
	};
	writeJson(summaryPath, summary);
	console.error(JSON.stringify(summary, null, 2));
	process.exit(1);
}

function prepareWorkDir() {
	if (existsSync(workDir)) {
		if (!force) throw new Error(`Work dir already exists; pass --force: ${relative(workDir)}`);
		rmSync(workDir, { recursive: true, force: true });
	}
	mkdirSync(workDir, { recursive: true });
	copyFileSync(questionPaperPath, path.join(workDir, 'question-paper.pdf'));
	copyFileSync(markSchemePath, path.join(workDir, 'mark-scheme.pdf'));
	copyFileSync(
		path.join(rootDir, 'scripts/codex-import-helper.mjs'),
		path.join(workDir, 'helper.mjs')
	);
	copyFileSync(
		path.join(rootDir, 'scripts/codex-pdf-tools.sh'),
		path.join(workDir, 'pdf-tools.sh')
	);
	writeJson(
		path.join(workDir, 'candidate.json'),
		candidateWithLocalAssets(readJson(candidatePath))
	);
}

function validateCandidateMechanically() {
	const args = [
		'helper.mjs',
		'validate-extraction',
		'--input=candidate.json',
		'--output=mechanical-validation.json'
	];
	if (expectedMarks !== null) args.push(`--expected-marks=${expectedMarks}`);
	if (expectedQuestions !== null) args.push(`--expected-questions=${expectedQuestions}`);
	const result = spawnSync(process.execPath, args, {
		cwd: workDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 64 * 1024 * 1024
	});
	if (result.status !== 0) {
		throw new Error(
			`mechanical validation failed with exit code ${result.status ?? result.signal}.\n${result.stdout}\n${result.stderr}`
		);
	}
	return readJson(path.join(workDir, 'mechanical-validation.json'));
}

function buildPrompt() {
	const expectedQuestionLine =
		expectedQuestions === null
			? 'Confirm the candidate question count matches the whole official paper.'
			: `Confirm the candidate contains exactly ${expectedQuestions} atomic questions.`;
	const expectedMarkLine =
		expectedMarks === null
			? 'Confirm the candidate mark total matches the whole official paper and official mark scheme.'
			: `Confirm the candidate mark total is exactly ${expectedMarks}.`;
	const sourceSpecificLine =
		sourceDocumentId === 'aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp'
			? 'For Geography 2022 Paper 1 Q02.3, the question-paper option B says "The trees drop their dead leaves because of lower temperatures in winter" while the mark scheme key abbreviates this as "The trees drop their leaves...". This is not a defect if response.options preserve the question-paper wording and the answer key still identifies option B / the corresponding mark-scheme wording.'
			: '';
	return `You are an independent GCSE extraction and learner-rendering judge. You did not create candidate.json.

Files in this clean work directory:
- candidate.json: normalized extraction JSON to judge
- question-paper.pdf: official question paper
- mark-scheme.pdf: official mark scheme
- assets/: local copies of candidate assets referenced by candidate.json, when the original asset files existed
- helper.mjs: deterministic JSON validator
- pdf-tools.sh: shell helper for PDF text, rendered pages, crops, embedded images, contact sheets, and line counting

Do not inspect the repository, previous extraction workdirs, benchmark artifacts, git history, or the web. Start only from these files.

Task:
1. Mechanically confirm candidate.json is a whole-paper extraction for ${sourceDocumentId}. ${expectedQuestionLine} ${expectedMarkLine}
2. Independently compare candidate questions against the official question-paper PDF and mark-scheme PDF.
3. Judge extraction quality only: learner-facing wording/context, page refs, response controls, answer-line counts, required figures/tables/assets, formula/equation rendering, positive mark-scheme alignment, answer keys/model answers, and whether each question is answerable from the assembled app-visible context.
4. Do not judge answer-chain style or chain quality. Chain reconciliation is a separate workflow.
5. Use PDF text layer for exact text, rendered pages/contact sheets for layout, embedded image extraction for figures/tables, and visual inspection for equations/formulae/line counts. OCR is fallback only.
6. For Biology Nov 2020, explicitly verify Q07.1 has 7 visible ruled answer lines and Q07.3 has 16 visible ruled answer lines.
7. Fail real defects, including missing renderable assets for mentioned figures, missing table data, duplicated learner-visible setup text, wrong response-line counts, wrong fixed-response answer keys, missing model answers for written questions, or mark-scheme rows that do not support grading.
8. For fixed-response or multiple-choice questions, judge learner-visible option text against the question paper, not against shortened mark-scheme wording. The mark scheme determines which option is correct; the question paper determines exactly what text the learner sees. Do not fail merely because a correct option's paper wording contains extra words that the mark scheme omits, as long as the selected option and grading evidence are aligned.
${sourceSpecificLine}

Useful commands:
- bash pdf-tools.sh pdf-info --pdf=question-paper.pdf --output=question-paper.info.txt
- bash pdf-tools.sh pdftotext-pages --pdf=question-paper.pdf --pages=1-36 --output=question-paper.pages.txt
- bash pdf-tools.sh pdftotext-pages --pdf=mark-scheme.pdf --pages=1-30 --output=mark-scheme.pages.txt
- bash pdf-tools.sh render-pages --pdf=question-paper.pdf --pages=1-36 --dpi=140 --output-dir=qp-pages
- bash pdf-tools.sh contact-sheet --glob='qp-pages/*.png' --output=qp-contact.jpg --thumb=170x240 --columns=6
- bash pdf-tools.sh extract-embedded-images --pdf=question-paper.pdf --output-dir=qp-images --manifest=qp-images.txt
- node helper.mjs validate-extraction --input=candidate.json${
		expectedMarks === null ? '' : ` --expected-marks=${expectedMarks}`
	}${
		expectedQuestions === null ? '' : ` --expected-questions=${expectedQuestions}`
	} --output=mechanical-validation.json

Write exactly one JSON file named judge-report.json with this shape:
{
  "status": "passed" or "failed",
  "verdict": "pass" or "fail",
  "score": number from 0 to 1,
  "questionCount": number,
  "markTotal": number,
  "checkedRefs": ["01.1"],
  "lineCountFindings": [{"sourceQuestionRef":"07.1","candidate":7,"expected":7,"status":"passed","evidence":"..."}],
  "renderabilityFindings": [],
  "solvabilityFindings": [],
  "markSchemeFindings": [],
  "requiredRepairs": [],
  "rationale": "concise summary"
}

Set status/verdict to failed/fail if any requiredRepairs are needed. Finish with a concise final message listing verdict, score, checked refs count, and required repair count.`;
}

function candidateWithLocalAssets(candidate) {
	const assetsDir = path.join(workDir, 'assets');
	mkdirSync(assetsDir, { recursive: true });
	const remapped = new Map();
	const usedNames = new Set();
	function remap(filePath) {
		if (!filePath) return filePath;
		const value = String(filePath);
		if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
		const sourcePath = path.isAbsolute(value) ? value : path.resolve(rootDir, value);
		if (!existsSync(sourcePath)) return value;
		if (!remapped.has(sourcePath)) {
			const parsed = path.parse(sourcePath);
			let fileName = path.basename(sourcePath);
			let suffix = 1;
			while (usedNames.has(fileName)) {
				fileName = `${parsed.name}-${suffix}${parsed.ext}`;
				suffix += 1;
			}
			usedNames.add(fileName);
			const localPath = path.join(assetsDir, fileName);
			copyFileSync(sourcePath, localPath);
			remapped.set(sourcePath, path.join('assets', fileName));
		}
		return remapped.get(sourcePath);
	}
	for (const question of candidate.questions ?? []) {
		for (const asset of question.assets ?? []) {
			asset.filePath = remap(asset.filePath ?? asset.file ?? asset.localPath ?? null);
		}
	}
	for (const asset of candidate.localAssetManifest ?? []) {
		asset.filePath = remap(asset.filePath ?? asset.file ?? asset.localPath ?? asset.path ?? null);
	}
	return candidate;
}

function judgePassed(report) {
	const requiredRepairs = Array.isArray(report?.requiredRepairs) ? report.requiredRepairs : [];
	return (
		report?.status === 'passed' &&
		report?.verdict === 'pass' &&
		Number(report?.score ?? 0) >= 0.8 &&
		requiredRepairs.length === 0
	);
}

function artifacts() {
	return {
		workDir: relative(workDir),
		prompt: relative(path.join(workDir, 'prompt.md')),
		events: relative(path.join(workDir, 'events.jsonl')),
		mechanicalValidation: relative(path.join(workDir, 'mechanical-validation.json')),
		judgeReport: relative(path.join(workDir, 'judge-report.json')),
		output: relative(outputPath),
		summary: relative(summaryPath)
	};
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function requiredStringArg(name) {
	const value = stringArg(name, '');
	if (!value) throw new Error(`Pass --${name}=...\n\n${usage}`);
	return value;
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

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}
