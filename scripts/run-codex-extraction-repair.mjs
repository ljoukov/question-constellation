#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';

const rootDir = process.cwd();
loadDefaultEnv(rootDir);

const usage = `Usage:
node scripts/run-codex-extraction-repair.mjs \\
  --candidate=<normalized-extraction.json> \\
  --question-paper=<official-question-paper.pdf> \\
  --mark-scheme=<official-mark-scheme.pdf> \\
  --source-document-id=<stable-source-id> \\
  --judge-report=<failed-judge-report.json>

Optional:
  --validation-report=<failed-mechanical-validation.json>
  --work-dir=tmp/codex-extraction-repair/<source-id>
  --output=tmp/codex-extraction-repair/<source-id>/repaired-normalized-extraction.json
  --summary=tmp/codex-extraction-repair/<source-id>/codex-repair-summary.json
  --expected-marks=100
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
const judgeReportArg = stringArg('judge-report', '');
const validationReportArg = stringArg('validation-report', '');
const judgeReportPath = judgeReportArg ? path.resolve(rootDir, judgeReportArg) : null;
const validationReportPath = validationReportArg
	? path.resolve(rootDir, validationReportArg)
	: null;
const workDir = path.resolve(
	rootDir,
	stringArg('work-dir', path.join('tmp/codex-extraction-repair', sourceDocumentId))
);
const outputPath = path.resolve(
	rootDir,
	stringArg('output', path.join(workDir, 'repaired-normalized-extraction.json'))
);
const summaryPath = path.resolve(
	rootDir,
	stringArg('summary', path.join(workDir, 'codex-repair-summary.json'))
);
const model = stringArg('model', 'gpt-5.5');
const thinkingLevel = stringArg('thinking-level', 'high');
const timeoutMs = integerArg('timeout-ms', 7_200_000, 1);
const expectedMarks = integerArg('expected-marks', 100, 1);
const expectedQuestions = integerArg('expected-questions', null, 1);
const dryRun = hasArg('dry-run');
const force = hasArg('force');

for (const filePath of [candidatePath, questionPaperPath, markSchemePath]) {
	if (!existsSync(filePath)) throw new Error(`Input file does not exist: ${filePath}`);
}
for (const filePath of [judgeReportPath, validationReportPath].filter(Boolean)) {
	if (!existsSync(filePath)) throw new Error(`Evidence file does not exist: ${filePath}`);
}

const plan = {
	sourceDocumentId,
	candidatePath: relative(candidatePath),
	questionPaperPath: relative(questionPaperPath),
	markSchemePath: relative(markSchemePath),
	judgeReportPath: judgeReportPath ? relative(judgeReportPath) : null,
	validationReportPath: validationReportPath ? relative(validationReportPath) : null,
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
	const repairedPath = path.join(workDir, 'repaired-extraction.json');
	if (!existsSync(repairedPath))
		throw new Error('Codex repair did not write repaired-extraction.json.');
	const repaired = absolutizeLocalAssets(readJson(repairedPath), workDir);
	writeJson(repairedPath, repaired);
	const validation = validateRepaired(repairedPath);
	mkdirSync(path.dirname(outputPath), { recursive: true });
	writeJson(outputPath, repaired);
	const summary = {
		status: 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		codex: codexSummary,
		validation,
		artifacts: artifacts()
	};
	writeJson(summaryPath, summary);
	console.log(JSON.stringify(summary, null, 2));
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
		path.join(rootDir, 'scripts/answer-chain-specificity.mjs'),
		path.join(workDir, 'answer-chain-specificity.mjs')
	);
	copyFileSync(
		path.join(rootDir, 'scripts/codex-pdf-tools.sh'),
		path.join(workDir, 'pdf-tools.sh')
	);
	writeJson(
		path.join(workDir, 'candidate.json'),
		candidateWithLocalAssets(readJson(candidatePath))
	);
	if (judgeReportPath) copyFileSync(judgeReportPath, path.join(workDir, 'judge-report.json'));
	if (validationReportPath)
		copyFileSync(validationReportPath, path.join(workDir, 'validation-report.json'));
}

function buildPrompt() {
	const evidenceFiles = [
		judgeReportPath
			? '- judge-report.json: failed independent judge report and required repairs'
			: null,
		validationReportPath ? '- validation-report.json: failed deterministic validation report' : null
	]
		.filter(Boolean)
		.join('\n');
	const expectedQuestionLine =
		expectedQuestions === null
			? 'Confirm the repaired candidate still contains the complete official paper.'
			: `Confirm the repaired candidate still contains exactly ${expectedQuestions} atomic questions.`;
	return `You are repairing a normalized GCSE extraction candidate after validation/judge failure.

Files in this clean work directory:
- candidate.json: full normalized extraction candidate to repair
- question-paper.pdf: official question paper
- mark-scheme.pdf: official mark scheme
- helper.mjs: deterministic validator
- pdf-tools.sh: PDF text/render/crop helper
${evidenceFiles}

Do not inspect the repository, previous workdirs, benchmark artifacts, git history, or the web. Start from these files only.

Task:
1. Use the official PDFs and the supplied failure evidence to repair candidate.json.
2. Do not redo answer-chain reconciliation or chain wording. Preserve existing answerChain, chainResolution, and commonWeakAnswers fields exactly unless schema mechanics require copying them through.
3. Keep this a focused repair. You may use a one-off Node command to load candidate.json, make source-verified edits, and write repaired-extraction.json. Do not hand-type the full JSON into the terminal.
4. The repaired JSON must still be a whole-paper extraction for ${sourceDocumentId}. ${expectedQuestionLine} Expected mark total: ${expectedMarks}.
5. Use judge-report.json and validation-report.json as the authoritative list of current defects. If either report conflicts with the official PDFs, follow the PDFs and note the discrepancy in the final message. Do not apply repairs from other papers.
6. For paired table/cell answers, do not encode conditionally paired alternatives as independent response.correctAnswers aliases. For example, if one boundary value pairs with "Invalid number" and another boundary value pairs with "Valid number entered", use labeled/free response fields plus markChecklist/modelAnswer pairing guidance unless the app schema has an explicit structured-pair response.
7. Run deterministic validation with:
   node helper.mjs validate-extraction --input=repaired-extraction.json --expected-marks=${expectedMarks}${
			expectedQuestions === null ? '' : ` --expected-questions=${expectedQuestions}`
		} --output=repair-validation.json

Use PDF text/rendered pages to verify the failure evidence when needed. Finish only after repaired-extraction.json exists and repair-validation.json reports status "passed". Final message: repaired refs, validation status, question count, mark total.`;
}

function validateRepaired(repairedPath) {
	const args = [
		'helper.mjs',
		'validate-extraction',
		'--input=repaired-extraction.json',
		`--expected-marks=${expectedMarks}`,
		'--output=repair-validation.json'
	];
	if (expectedQuestions !== null) args.push(`--expected-questions=${expectedQuestions}`);
	const result = spawnSync(process.execPath, args, {
		cwd: workDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 64 * 1024 * 1024
	});
	if (result.status !== 0) {
		throw new Error(
			`repair validation failed with exit code ${result.status ?? result.signal}.\n${result.stdout}\n${result.stderr}`
		);
	}
	return readJson(path.join(workDir, 'repair-validation.json'));
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
		const sourcePath = path.isAbsolute(value)
			? value
			: path.resolve(path.dirname(candidatePath), value);
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

function absolutizeLocalAssets(candidate, baseDir) {
	function absolutize(filePath) {
		if (!filePath) return filePath;
		const value = String(filePath);
		if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
		return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
	}
	for (const question of candidate.questions ?? []) {
		for (const asset of question.assets ?? []) {
			if (asset.filePath || asset.file || asset.localPath) {
				asset.filePath = absolutize(asset.filePath ?? asset.file ?? asset.localPath);
			}
		}
	}
	for (const asset of candidate.localAssetManifest ?? []) {
		if (asset.filePath || asset.file || asset.localPath || asset.path) {
			asset.filePath = absolutize(asset.filePath ?? asset.file ?? asset.localPath ?? asset.path);
		}
	}
	return candidate;
}

function artifacts() {
	return {
		workDir: relative(workDir),
		prompt: relative(path.join(workDir, 'prompt.md')),
		events: relative(path.join(workDir, 'events.jsonl')),
		candidate: relative(path.join(workDir, 'candidate.json')),
		repaired: relative(path.join(workDir, 'repaired-extraction.json')),
		validation: relative(path.join(workDir, 'repair-validation.json')),
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
