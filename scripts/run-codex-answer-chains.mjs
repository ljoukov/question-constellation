#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';
import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';

const rootDir = process.cwd();
loadDefaultEnv(rootDir);

const usage = `Usage:
node scripts/run-codex-answer-chains.mjs \\
  --input=<normalized-extraction.json> \\
  --output=<chain-reconciled.json>

Optional:
  --existing-chains=<existing-chain-context.json>
  --existing-chain-input-root=<audited-json-root>
  --work-dir=tmp/codex-answer-chains/<source-id>
  --summary=tmp/codex-answer-chains/<source-id>/codex-chain-summary.json
  --model=gpt-5.5
  --thinking-level=xhigh
  --timeout-ms=7200000
  --force
  --dry-run`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const inputPath = path.resolve(rootDir, requiredStringArg('input'));
const inputPaper = readJson(inputPath);
const sourceDocumentId =
	inputPaper.sourceDocument?.id ?? inputPaper.sourceDocumentId ?? path.basename(inputPath, '.json');
const outputPath = path.resolve(
	rootDir,
	stringArg('output', path.join('tmp/codex-answer-chains', sourceDocumentId, 'chain-reconciled.json'))
);
const workDir = path.resolve(
	rootDir,
	stringArg('work-dir', path.join('tmp/codex-answer-chains', sourceDocumentId))
);
const summaryPath = path.resolve(rootDir, stringArg('summary', path.join(workDir, 'codex-chain-summary.json')));
const existingChainsPath = stringArg('existing-chains', '');
const existingChainInputRoot = stringArg('existing-chain-input-root', '');
const model = stringArg('model', 'gpt-5.5');
const thinkingLevel = stringArg('thinking-level', 'xhigh');
const timeoutMs = integerArg('timeout-ms', 7_200_000, 1);
const dryRun = hasArg('dry-run');
const force = hasArg('force');

if (!existsSync(inputPath)) throw new Error(`Input file does not exist: ${inputPath}`);
if (existingChainsPath && !existsSync(path.resolve(rootDir, existingChainsPath))) {
	throw new Error(`Existing chains file does not exist: ${existingChainsPath}`);
}
if (existingChainInputRoot && !existsSync(path.resolve(rootDir, existingChainInputRoot))) {
	throw new Error(`Existing chain input root does not exist: ${existingChainInputRoot}`);
}

const plan = {
	sourceDocumentId,
	inputPath: relative(inputPath),
	outputPath: relative(outputPath),
	workDir: relative(workDir),
	summaryPath: relative(summaryPath),
	existingChainsPath: existingChainsPath ? relative(path.resolve(rootDir, existingChainsPath)) : null,
	existingChainInputRoot: existingChainInputRoot
		? relative(path.resolve(rootDir, existingChainInputRoot))
		: null,
	model,
	thinkingLevel,
	questionCount: inputPaper.questions?.length ?? 0
};

if (dryRun) {
	console.log(JSON.stringify({ status: 'dry-run', plan }, null, 2));
	process.exit(0);
}

prepareWorkDir();
const prompt = buildChainPrompt();
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
	const chainPath = ensureChainOutput();
	const validation = validateChain(chainPath);
	mkdirSync(path.dirname(outputPath), { recursive: true });
	copyFileSync(chainPath, outputPath);
	const summary = {
		status: 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		codex: codexSummary,
		validation,
		artifacts: artifacts(chainPath)
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
		artifacts: artifacts(path.join(workDir, 'chain-reconciled.json'))
	};
	writeJson(summaryPath, summary);
	console.error(JSON.stringify(summary, null, 2));
	process.exit(1);
}

function prepareWorkDir() {
	if (existsSync(workDir)) {
		if (!force) {
			throw new Error(`Work dir already exists; pass --force to replace it: ${relative(workDir)}`);
		}
		rmSync(workDir, { recursive: true, force: true });
	}
	mkdirSync(workDir, { recursive: true });
	copyFileSync(inputPath, path.join(workDir, 'extraction.json'));
	copyFileSync(path.join(rootDir, 'scripts/codex-import-helper.mjs'), path.join(workDir, 'helper.mjs'));
	const specSourcePath = path.join(rootDir, 'docs/extraction-spec.md');
	if (existsSync(specSourcePath)) {
		const specTargetDir = path.join(workDir, 'docs');
		mkdirSync(specTargetDir, { recursive: true });
		copyFileSync(specSourcePath, path.join(specTargetDir, 'extraction-spec.md'));
	}
	if (existingChainsPath) {
		copyFileSync(path.resolve(rootDir, existingChainsPath), path.join(workDir, 'existing-chain-context.json'));
	} else if (existingChainInputRoot) {
		const result = spawnSync(
			process.execPath,
			[
				'scripts/build-existing-chain-context.mjs',
				`--input-root=${path.resolve(rootDir, existingChainInputRoot)}`,
				`--output=${path.join(workDir, 'existing-chain-context.json')}`
			],
			{ cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
		);
		if (result.status !== 0) {
			throw new Error(
				`existing chain context build failed with exit code ${result.status ?? result.signal}.`
			);
		}
		if (result.stdout.trim()) process.stderr.write(result.stdout);
	}
}

function buildChainPrompt() {
	const hasExisting = existsSync(path.join(workDir, 'existing-chain-context.json'));
	return `You are running the answer-chain reconciliation phase for one extracted GCSE paper.

Inputs:
- extraction.json: normalized whole-paper extraction for ${sourceDocumentId}
${hasExisting ? '- existing-chain-context.json: existing extracted/published chains and example question refs' : '- No existing-chain-context.json was supplied; create new chains where needed.'}
- docs/extraction-spec.md: import/schema contract if you need to check allowed answer-chain fields
- helper.mjs: deterministic chain validation

Do not inspect PDFs in this phase and do not alter source extraction facts unless needed only to attach chain fields. Keep extraction, response controls, mark schemes, checklists, model answers, assets, page ranges, and provenance intact.

For every marked question decide one action:
- reuse_existing: the existing chain already describes the reusable reasoning pattern without source-specific answers.
- create_new: no existing chain is safely reusable.
- update_existing: only if the new generalized wording still fits every already-attached example available in existing-chain-context.json.
- needs_review: only when evidence is insufficient or contradictory.

If updating/generalizing an existing published chain, inspect all available attached examples in existing-chain-context.json. If those examples do not provide enough evidence to prove the generalized chain still fits, do not update the existing chain; create a new chain or mark needs_review. Split rather than over-generalize.

Answer-chain fields must describe reusable reasoning or method patterns. Do not put worked numeric answers, exact table values, exact tick-box letters, one-question facts, or final source-specific answers in answerChain.title, canonicalChainText, summary, stepText, explanation, or commonOmission. Keep those values only in response.correctAnswers, markSchemeItems, markChecklist, or modelAnswer.

Each marked question must have a stable answerChain.id. Reuse the existing id when the existing chain is genuinely reused; create a stable subject-prefixed id for new chains.

Allowed answerChain.steps[].stepRole values are exactly: given, cause, process, link, effect, evidence, method, calculation, conclusion.

Every answerChain.steps[] entry must include a non-empty markSchemeItemIndexes array. These indexes are zero-based indexes into that same question's markSchemeItems array and must point only to positive marking points, not allow/accept/reject/ignore/guidance/alternative rows. If one reusable chain step is supported by several positive mark items, include all of those indexes. If one positive mark item supports several compact reusable steps, duplicate the index across those steps.

Before finishing, run the validator. It rejects missing ids, non-canonical step roles, missing step evidence, placeholder/review chains, and invalid mark-scheme evidence indexes.

Write the full reconciled paper to chain-reconciled.json, preserving all questions. Then run:
node helper.mjs validate-chain --input=chain-reconciled.json --output=chain-validation.json

If validation fails, repair chain-reconciled.json and rerun validation. Finish with a concise final message listing reused/created/updated/needs-review chain counts and artifact paths.`;
}

function ensureChainOutput() {
	const chainPath = path.join(workDir, 'chain-reconciled.json');
	if (!existsSync(chainPath)) throw new Error('Codex did not write chain-reconciled.json.');
	return chainPath;
}

function validateChain(chainPath) {
	const result = spawnSync(
		process.execPath,
		['helper.mjs', 'validate-chain', `--input=${path.basename(chainPath)}`, '--output=chain-validation.json'],
		{
			cwd: workDir,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 64 * 1024 * 1024
		}
	);
	if (result.status !== 0) {
		throw new Error(
			`helper validate-chain failed with exit code ${result.status ?? result.signal}.\n${result.stdout}\n${result.stderr}`
		);
	}
	if (result.stdout.trim()) process.stderr.write(result.stdout);
	if (result.stderr.trim()) process.stderr.write(result.stderr);
	return readJson(path.join(workDir, 'chain-validation.json'));
}

function artifacts(chainPath) {
	return {
		workDir: relative(workDir),
		events: relative(path.join(workDir, 'events.jsonl')),
		prompt: relative(path.join(workDir, 'prompt.md')),
		input: relative(path.join(workDir, 'extraction.json')),
		existingChainContext: existsSync(path.join(workDir, 'existing-chain-context.json'))
			? relative(path.join(workDir, 'existing-chain-context.json'))
			: null,
		chainReconciled: relative(chainPath),
		chainValidation: relative(path.join(workDir, 'chain-validation.json')),
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
