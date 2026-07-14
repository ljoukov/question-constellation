#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { copyCodexImportHelperBundle } from './lib/codex-import-helper-bundle.mjs';
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
  --model=gpt-5.6-sol
  --thinking-level=max
  --skip-chain-style-judge
  --run-legacy-chain-style-judge
  --allow-shared-chain-updates
  --chain-style-judge-model=chatgpt-gpt-5.5
  --chain-style-judge-thinking-level=medium
  --chain-style-judge-batch-size=8
  --chain-style-judge-max-existing-chains=16
  --chain-style-judge-source-snippet-chars=360
  --chain-validation-repair-attempts=2
  --chain-style-repair-attempts=4
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
	stringArg(
		'output',
		path.join('tmp/codex-answer-chains', sourceDocumentId, 'chain-reconciled.json')
	)
);
const workDir = path.resolve(
	rootDir,
	stringArg('work-dir', path.join('tmp/codex-answer-chains', sourceDocumentId))
);
const summaryPath = path.resolve(
	rootDir,
	stringArg('summary', path.join(workDir, 'codex-chain-summary.json'))
);
const existingChainsPath = stringArg('existing-chains', '');
const existingChainInputRoot = stringArg('existing-chain-input-root', '');
const model = stringArg('model', 'gpt-5.6-sol');
const thinkingLevel = stringArg('thinking-level', 'max');
const runLegacyChainStyleJudge = hasArg('run-legacy-chain-style-judge');
const skipChainStyleJudge = hasArg('skip-chain-style-judge') || !runLegacyChainStyleJudge;
const allowSharedChainUpdates = hasArg('allow-shared-chain-updates');
const chainStyleJudgeModel = stringArg('chain-style-judge-model', 'chatgpt-gpt-5.5');
const chainStyleJudgeThinkingLevel = stringArg('chain-style-judge-thinking-level', 'medium');
const chainStyleJudgeBatchSize = integerArg('chain-style-judge-batch-size', 8, 1);
const chainStyleJudgeMaxExistingChains = integerArg('chain-style-judge-max-existing-chains', 16, 0);
const chainStyleJudgeSourceSnippetChars = integerArg(
	'chain-style-judge-source-snippet-chars',
	360,
	80
);
const chainValidationRepairAttempts = integerArg('chain-validation-repair-attempts', 2, 0);
const chainStyleRepairAttempts = integerArg('chain-style-repair-attempts', 4, 0);
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
	existingChainsPath: existingChainsPath
		? relative(path.resolve(rootDir, existingChainsPath))
		: null,
	existingChainInputRoot: existingChainInputRoot
		? relative(path.resolve(rootDir, existingChainInputRoot))
		: null,
	model,
	thinkingLevel,
	skipChainStyleJudge,
	allowSharedChainUpdates,
	chainStyleJudgeModel,
	chainStyleJudgeThinkingLevel,
	chainStyleJudgeBatchSize,
	chainStyleJudgeMaxExistingChains,
	chainStyleJudgeSourceSnippetChars,
	chainValidationRepairAttempts,
	chainStyleRepairAttempts,
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
	let validation = validateChain(chainPath, { allowFailure: true });
	const validationRepairs = [];
	for (
		let attempt = 1;
		!chainValidationPassed(validation) && attempt <= chainValidationRepairAttempts;
		attempt += 1
	) {
		const failedValidationPath = path.join(workDir, `chain-validation-failed-${attempt}.json`);
		writeJson(failedValidationPath, validation);
		const repairPrompt = buildValidationRepairPrompt(attempt, failedValidationPath);
		const repairPromptPath = path.join(workDir, `validation-repair-prompt-${attempt}.md`);
		writeFileSync(repairPromptPath, repairPrompt);
		const repairSummary = await runCodexSdkTurn({
			prompt: repairPrompt,
			workDir,
			eventsPath: path.join(workDir, `validation-repair-events-${attempt}.jsonl`),
			lastMessagePath: path.join(workDir, `validation-repair-last-message-${attempt}.txt`),
			summaryPath: path.join(workDir, `validation-repair-summary-${attempt}.json`),
			model,
			thinkingLevel,
			timeoutMs
		});
		validationRepairs.push(repairSummary);
		ensureChainOutput();
		validation = validateChain(chainPath, { allowFailure: true });
	}
	if (!chainValidationPassed(validation)) {
		throw new Error('deterministic answer-chain validation failed after repair attempts.');
	}
	let styleJudge = judgeChainStyle(chainPath, { allowFailure: true });
	const repairs = [];
	for (
		let attempt = 1;
		!styleJudgePassed(styleJudge) && attempt <= chainStyleRepairAttempts;
		attempt += 1
	) {
		const failedStylePath = path.join(workDir, `chain-style-judge-failed-${attempt}.json`);
		if (existsSync(path.join(workDir, 'chain-style-judge.json'))) {
			copyFileSync(path.join(workDir, 'chain-style-judge.json'), failedStylePath);
		}
		const repairPrompt = buildStyleRepairPrompt(attempt, failedStylePath);
		const repairPromptPath = path.join(workDir, `style-repair-prompt-${attempt}.md`);
		writeFileSync(repairPromptPath, repairPrompt);
		const repairSummary = await runCodexSdkTurn({
			prompt: repairPrompt,
			workDir,
			eventsPath: path.join(workDir, `style-repair-events-${attempt}.jsonl`),
			lastMessagePath: path.join(workDir, `style-repair-last-message-${attempt}.txt`),
			summaryPath: path.join(workDir, `style-repair-summary-${attempt}.json`),
			model,
			thinkingLevel,
			timeoutMs
		});
		repairs.push(repairSummary);
		ensureChainOutput();
		validation = validateChain(chainPath);
		styleJudge = judgeChainStyle(chainPath, { allowFailure: true });
	}
	if (!styleJudgePassed(styleJudge)) {
		throw new Error('answer-chain style judge failed after repair attempts.');
	}
	mkdirSync(path.dirname(outputPath), { recursive: true });
	copyFileSync(chainPath, outputPath);
	const summary = {
		status: 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		codex: codexSummary,
		validationRepairs,
		repairs,
		validation,
		styleJudge,
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
	copyCodexImportHelperBundle({ rootDir, workDir });
	copyFileSync(
		path.join(rootDir, 'scripts/answer-chain-specificity.mjs'),
		path.join(workDir, 'answer-chain-specificity.mjs')
	);
	const specSourcePath = path.join(rootDir, 'docs/extraction-spec.md');
	if (existsSync(specSourcePath)) {
		const specTargetDir = path.join(workDir, 'docs');
		mkdirSync(specTargetDir, { recursive: true });
		copyFileSync(specSourcePath, path.join(specTargetDir, 'extraction-spec.md'));
	}
	if (existingChainsPath) {
		copyFileSync(
			path.resolve(rootDir, existingChainsPath),
			path.join(workDir, 'existing-chain-context.json')
		);
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

This work directory is prepared for the task. Do not inspect repo state, run git commands, or roam outside the provided inputs. Do not inspect PDFs in this phase and do not alter source extraction facts unless needed only to attach chain fields. Keep extraction, response controls, mark schemes, checklists, model answers, assets, page ranges, and provenance intact.

For every marked question decide one action:
- reuse_existing: the existing chain already describes the reusable reasoning pattern without source-specific answers.
- create_new: no existing chain is safely reusable.
- update_existing: only if the new generalized wording still fits every already-attached example available in existing-chain-context.json.
- needs_review: only when evidence is insufficient or contradictory.

If updating/generalizing an existing published chain, inspect all available attached examples in existing-chain-context.json. If those examples do not provide enough evidence to prove the generalized chain still fits, do not update the existing chain; create a new chain or mark needs_review. Split rather than over-generalize.

${
	allowSharedChainUpdates
		? 'This run is explicitly allowed to propose shared-chain updates, but only after the cross-paper compatibility check above.'
		: 'This run is not authorized to alter published/shared chain definitions. Treat update_existing as import-blocking. If an existing chain already fits, set reuse_existing and keep that chain id/visible definition unchanged. If it would need generalized, count-neutral, or less source-specific wording to fit, create a new stable chain id instead of update_existing.'
}

Answer-chain fields must describe reusable reasoning, method patterns, or compact recall handles. Do not put worked numeric answers, exact table values, exact tick-box letters, exact blank-fill answers, one-off final data values, question-specific dates/years, mark counts, or item counts in answerChain.title, canonicalChainText, summary, stepText, explanation, or commonOmission. Keep those values only in response.correctAnswers, markSchemeItems, markChecklist, modelAnswer, or prompt evidence. For History, use compact period/category wording such as "correct period" or "specified crisis" instead of a printed year range inside chain fields.

Do include concrete GCSE biology terms when those terms are the mark-scoring idea. Compact does not mean abstract. For recall or explanation questions, a useful chain may name glucose, nitrate ions, fatty acids, glycerol, chlorophyll, active transport, osmosis, mitosis, thorns, or self-reporting if that is what learners must remember. Do not hide concrete accepted terms behind placeholders.

The same rule applies outside science: use concrete compact GCSE computing/geography/history concepts when they are the reusable idea. Good computing handles include "data + instructions -> binary", "high vs low -> clear contrast -> three points", "school users -> shared benefits -> risks/costs -> balance", and "fake story -> sensitive gain -> one vs many". These are allowed even for fixed-response questions because they cue the underlying concept rather than the option letter or exact blank text.

For fixed-response items, distinguish concept from answer artifact:
- allowed: a compact underlying concept or method, such as "data + instructions -> binary" or "destination -> value marker -> ordered values";
- forbidden: the exact selected letter, the full selected option sentence, exact table values, the literal answer for a labelled blank such as a specific SQL keyword, or a final numeric result.
- for SQL/code blanks, visible chains should cue structure ("command clause", "filter condition", "destination", "ordered values"), while exact SQL words and values stay in response.correctAnswers/modelAnswer.
- for database questions, do not put exact table names, field names, row ids, copied identifiers, book names, person names, or other one-paper table values in answerChain fields or commonWeakAnswers. Use generic handles such as "target table", "row filter", "both identifiers", "join fields", or "ordered fields".

Student-visible chain style is strict:
- answerChain.title should usually be 1 to 3 words. Use more only when absolutely necessary, and never more than 5 words.
- answerChain.canonicalChainText is the memory handle. Write it as 2 to 5 compact links joined by " -> ". Do not write a sentence or paragraph.
- Each canonical link should usually be 1 to 4 words. Good: "low to high -> active transport -> energy needed", "change -> original -> times 100", "reagent -> treatment -> colour".
- answerChain.steps[].stepText should be the compact link label, not a full instruction. Aim for 1 to 4 words, hard maximum 5 words. One simple emoji per step is allowed if it makes the step more memorable, but emojis are optional.
- answerChain.summary should be one short memory cue or usage note. Do not repeat the canonical chain as a sentence.
- Put longer teaching detail in explanation or commonOmission, not in title, canonicalChainText, summary, or stepText.

Never use placeholder visible labels when concrete mark-scoring words are available. Bad labels include "resource gained", "biological use", "product one", "product two", "first difference", "second difference", "function cue", "process name", "source material", "condition present", "product made", "source absent", "defence cue", "response category", "cause", "first cause", and "second claim". Replace them with the real compact cue, for example "plant sugar -> respiration -> energy", "lipids broken -> fatty acids -> glycerol", "water entry -> osmosis", "growth/repair -> mitosis", or "self-report -> weak data".

Common failure modes to avoid:
- Do not put final numeric answers or worked table values in answer-chain fields. For calculations, write the method handle, such as "selected stages -> add -> total percent" or "convert units -> compare -> ratio".
- Do not put question-specific years or dates in answer-chain fields, including step explanations and common omissions. Use period-neutral wording when the year belongs to this paper rather than to the reusable chain.
- For fixed-choice questions, visible links should usually be the compact underlying concept, not the answer letter or a verbatim option sentence.
- Keep canonicalChainText and steps aligned: each visible canonical link should normally have a matching compact stepText.
- If the mark scheme gives alternative routes, do not turn alternatives into a false required sequence. Use one compact alternative link such as "self-report/change/binge" with branch detail in explanation/commonOmission, or split the chain if the alternatives are different skills.
- For "any two", "any three", or "suggest one" questions, do not list all accepted alternatives as an ordered chain. Use a category/count handle such as "both shown -> shared structures -> choose two", "shown differences -> choose three", or "specific extension -> relevant outcome"; put examples in explanation/commonOmission.
- For alternative one-mark science routes, use an alternative link instead of a forced sequence, for example "too hot -> denature/shape change".
- For level-style questions, index positive indicative-content rows, not the generic level descriptor row.
- Summaries should be short memory cues, not imperatives. Prefer "Grid marks separately", "No heat for iodine", or "Branch answers score" over "Label, scale, plot, then fit".

Each marked question must have a stable answerChain.id. Reuse the existing id when the existing chain is genuinely reused; create a stable subject-prefixed id for new chains.
For chainResolution.action="create_new", make answerChain.id globally collision-resistant by including this sourceDocumentId or a short source-paper slug plus the source question ref, for example "hist-chain-${sourceDocumentId}-01-1-interpretation-difference". Do not create broad reusable ids such as "hist-chain-source-utility-judgement" unless that exact id already exists in existing-chain-context.json and you are choosing reuse_existing. If the same broad method is already published and fits unchanged, set reuse_existing with that existing id instead of create_new.

Before creating a new chain, actively look for existing chains with the same mark-scoring method even if their title is broader, their examples are in a different paper, or their current canonical text is wordier than the target style. Prefer reuse_existing over create_new when the existing visible chain can be reused unchanged. Use update_existing only in an update-authorized run; otherwise create_new when the existing visible chain would need changed wording to fit. Do not split a chain just because the data source is a graph instead of a table, the command word differs, or the context organism/substance changes; split only when the ordered mark-scoring links differ or when the only matching published chain is too count-specific/source-specific to reuse unchanged.

Allowed answerChain.steps[].stepRole values are exactly: given, cause, process, link, effect, evidence, method, calculation, conclusion.

Every answerChain.steps[] entry must include a non-empty markSchemeItemIndexes array. These indexes are zero-based indexes into that same question's markSchemeItems array and must point only to positive marking points, not allow/accept/reject/ignore/guidance/alternative rows. If one reusable chain step is supported by several positive mark items, include all of those indexes. If one positive mark item supports several compact reusable steps, duplicate the index across those steps.

For each written, explanatory, calculation-method, or multi-mark question, produce at least one question-specific commonWeakAnswers entry unless the source genuinely provides no useful trap. Do not reuse identical chain-level text across every question. Each entry must include:
- weakAnswerText: a plausible incomplete or mistaken student answer for this exact source question.
- explanation: a concise student-facing reason that answer fails for this exact question; this powers the pre-answer hint UI, so do not leave it blank.
- missingStepIndexes: an array of zero-based omitted answer-chain step indexes. Use [] when the omitted link is not identifiable; do not omit the property.
- confidence: a number from 0 to 1.
The explanation should point to the trap, not give a worked numeric answer. Keep final numeric values and fixed-response answers out of commonWeakAnswers.

Before finishing, run the validator. It rejects missing ids, paragraph-like canonical chains, overlong step labels, non-canonical step roles, missing step evidence, placeholder/review chains, missing commonWeakAnswers confidence, and invalid mark-scheme evidence indexes.

Write the full reconciled paper to chain-reconciled.json, preserving all questions. Then run:
node helper.mjs validate-chain --input=chain-reconciled.json --output=chain-validation.json

If validation fails, repair chain-reconciled.json and rerun validation. Finish with a concise final message listing reused/created/updated/needs-review chain counts and artifact paths.`;
}

function ensureChainOutput() {
	const chainPath = path.join(workDir, 'chain-reconciled.json');
	if (!existsSync(chainPath)) throw new Error('Codex did not write chain-reconciled.json.');
	return chainPath;
}

function validateChain(chainPath, { allowFailure = false } = {}) {
	const normalizeResult = normalizeChainOutput(chainPath, { allowFailure });
	if (normalizeResult?.status === 'failed') return normalizeResult;
	const result = spawnSync(
		process.execPath,
		[
			'helper.mjs',
			'validate-chain',
			`--input=${path.basename(chainPath)}`,
			'--output=chain-validation.json'
		],
		{
			cwd: workDir,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 64 * 1024 * 1024
		}
	);
	if (result.status !== 0) {
		const failedReport = existsSync(path.join(workDir, 'chain-validation.json'))
			? readJson(path.join(workDir, 'chain-validation.json'))
			: { status: 'failed', blockingIssues: [], deterministicIssues: [] };
		if (allowFailure) {
			return {
				...failedReport,
				runnerExitStatus: result.status ?? null,
				runnerSignal: result.signal ?? null,
				runnerError: `helper validate-chain failed with exit code ${result.status ?? result.signal}`,
				stdout: result.stdout.trim() || null,
				stderr: result.stderr.trim() || null
			};
		}
		throw new Error(
			`helper validate-chain failed with exit code ${result.status ?? result.signal}.\n${result.stdout}\n${result.stderr}`
		);
	}
	if (result.stdout.trim()) process.stderr.write(result.stdout);
	if (result.stderr.trim()) process.stderr.write(result.stderr);
	return readJson(path.join(workDir, 'chain-validation.json'));
}

function normalizeChainOutput(chainPath, { allowFailure = false } = {}) {
	const result = spawnSync(
		process.execPath,
		[
			'helper.mjs',
			'normalize-extraction',
			`--input=${path.basename(chainPath)}`,
			`--output=${path.basename(chainPath)}`
		],
		{
			cwd: workDir,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 64 * 1024 * 1024
		}
	);
	if (result.status !== 0) {
		if (allowFailure) {
			return {
				status: 'failed',
				blockingIssues: [],
				deterministicIssues: [],
				runnerExitStatus: result.status ?? null,
				runnerSignal: result.signal ?? null,
				runnerError: `helper normalize-extraction failed with exit code ${
					result.status ?? result.signal
				}`,
				stdout: result.stdout.trim() || null,
				stderr: result.stderr.trim() || null
			};
		}
		throw new Error(
			`helper normalize-extraction failed with exit code ${result.status ?? result.signal}.\n${result.stdout}\n${result.stderr}`
		);
	}
	if (result.stdout.trim()) process.stderr.write(result.stdout);
	if (result.stderr.trim()) process.stderr.write(result.stderr);
	return { status: 'passed' };
}

function chainValidationPassed(validation) {
	return validation?.status === 'passed';
}

function judgeChainStyle(chainPath, { allowFailure = false } = {}) {
	if (skipChainStyleJudge) {
		return { status: 'skipped' };
	}
	const args = [
		'scripts/judge-answer-chain-style.mjs',
		`--input=${chainPath}`,
		`--output=${path.join(workDir, 'chain-style-judge.json')}`,
		`--model=${chainStyleJudgeModel}`,
		`--thinking-level=${chainStyleJudgeThinkingLevel}`,
		`--batch-size=${chainStyleJudgeBatchSize}`,
		`--max-existing-chains-per-batch=${chainStyleJudgeMaxExistingChains}`,
		`--source-snippet-chars=${chainStyleJudgeSourceSnippetChars}`
	];
	if (existsSync(path.join(workDir, 'existing-chain-context.json'))) {
		args.push(`--existing-chains=${path.join(workDir, 'existing-chain-context.json')}`);
	}
	const result = spawnSync(process.execPath, args, {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 64 * 1024 * 1024
	});
	if (result.status !== 0) {
		const failedReport = existsSync(path.join(workDir, 'chain-style-judge.json'))
			? readJson(path.join(workDir, 'chain-style-judge.json'))
			: null;
		if (allowFailure) {
			return {
				...(failedReport ?? { status: 'failed', issues: [] }),
				runnerExitStatus: result.status ?? null,
				runnerSignal: result.signal ?? null,
				runnerError: `answer-chain style judge failed with exit code ${result.status ?? result.signal}`,
				stderr: result.stderr.trim() || null
			};
		}
		throw new Error(
			`answer-chain style judge failed with exit code ${result.status ?? result.signal}.\n${result.stdout}\n${result.stderr}`
		);
	}
	if (result.stdout.trim()) process.stderr.write(result.stdout);
	if (result.stderr.trim()) process.stderr.write(result.stderr);
	return readJson(path.join(workDir, 'chain-style-judge.json'));
}

function styleJudgePassed(styleJudge) {
	if (skipChainStyleJudge || styleJudge?.status === 'skipped') return true;
	return (
		styleJudge?.status === 'passed' &&
		!(styleJudge.issues ?? []).some((issue) => issue.severity === 'error')
	);
}

function buildStyleRepairPrompt(attempt, failedStylePath) {
	const failedStyleName = path.basename(failedStylePath);
	return `You are repairing answer-chain quality for the same extracted GCSE paper.

Inputs in this directory:
- chain-reconciled.json: current whole-paper chain reconciliation output to repair
- ${failedStyleName}: independent prompt-based style judge report with errors/warnings
- extraction.json: original extraction facts; use only as source evidence
- existing-chain-context.json: existing chain ids and example refs, if present
- helper.mjs: deterministic validator
- docs/extraction-spec.md: product/schema contract

Repair attempt: ${attempt}

Task:
1. Read ${failedStyleName}.
2. Repair every real error in chain-reconciled.json by editing only answerChain and chainResolution fields.
3. Consider warnings when they affect learner-facing clarity or duplicate chain consolidation.
4. Preserve all extraction facts: prompts, response controls, correctAnswers, mark schemes, checklists, model answers, assets, page ranges, ids, and provenance.
5. Do not put worked numeric answers, exact table values, tick-box letters, exact blank-fill answers, or final source-specific numeric results in answer-chain fields. Calculation chains should describe the method only.
6. Keep concrete GCSE terms when they are the mark-scoring idea: glucose, nitrate ions, fatty acids, glycerol, chlorophyll, osmosis, mitosis, active transport, self-reporting, etc.
7. For fixed-response repairs, keep the useful underlying concept when it is reusable, but remove answer artifacts. For example, "data + instructions -> binary" is a valid concept handle, while a letter or a full option sentence is not. "destination -> value marker -> ordered values" is valid for SQL INSERT, while the literal blank answer is not.
8. Keep canonicalChainText and steps aligned. If canonicalChainText has a visible link, the steps should normally include the same compact link.
9. Do not turn alternative mark routes into a false required sequence. Use a compact alternative link with branch detail in explanation/commonOmission, or split the chain if the skills are genuinely different.
10. Use positive mark-scheme evidence indexes only. Avoid generic level descriptor rows.
11. Keep titles short, summaries as distinct memory cues, and visible step labels compact.

After repair, run:
node helper.mjs validate-chain --input=chain-reconciled.json --output=chain-validation.json

If validation fails, repair and rerun it. Finish with a concise message listing what you changed and the artifact paths.`;
}

function buildValidationRepairPrompt(attempt, failedValidationPath) {
	const failedValidationName = path.basename(failedValidationPath);
	return `You are repairing deterministic answer-chain validation failures for one extracted GCSE paper.

Inputs in this directory:
- chain-reconciled.json: current whole-paper chain reconciliation output to repair
- ${failedValidationName}: host-side deterministic validation report with blocking issues
- extraction.json: original extraction facts; use only as source evidence
- existing-chain-context.json: existing chain ids and example refs, if present
- helper.mjs: current deterministic validator
- docs/extraction-spec.md: product/schema contract

Repair attempt: ${attempt}

Task:
1. Read ${failedValidationName}.
2. Repair every real blocking issue in chain-reconciled.json.
3. Edit only answerChain, chainResolution, and commonWeakAnswers fields unless the validation report explicitly requires a small consistency fix to markSchemeItemIndexes inside those fields.
4. Preserve source extraction facts: prompt text, response controls, correctAnswers, mark schemes, checklists, model answers, assets, page ranges, ids, and provenance.
5. Do not put worked numeric answers, exact table values, exact tick-box letters, exact blank-fill answers, source-specific dates/years, final source values, or one-paper fixed answers in answer-chain fields.
6. If an issue code is chain_exact_fixed_answer_text, remove the exact fixed answer from answerChain.title, canonicalChainText, summary, stepText, explanation, and commonOmission. Keep the exact answer only in response.correctAnswers, markSchemeItems, markChecklist, or modelAnswer.
7. For fixed-response recall or blank-fill items, use a compact generic recall/discrimination chain such as "cue -> category -> slot" or a similarly short method handle. Do not copy the literal answer word into the visible chain.
8. Keep concrete reusable concepts when they are not exact one-paper answers. Prefer short memory handles: title 1-3 words, canonicalChainText 2-5 links joined by " -> ", and stepText usually 1-4 words.
9. Use only positive mark-scheme evidence indexes in answerChain.steps[].markSchemeItemIndexes.

After repair, run:
node helper.mjs validate-chain --input=chain-reconciled.json --output=chain-validation.json

If validation still fails, repair and rerun it. Finish with a concise message listing what you changed and the artifact paths.`;
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
		validationRepairSummaries: Array.from({ length: chainValidationRepairAttempts }, (_, index) =>
			path.join(workDir, `validation-repair-summary-${index + 1}.json`)
		)
			.filter((filePath) => existsSync(filePath))
			.map(relative),
		chainStyleJudge: skipChainStyleJudge
			? null
			: relative(path.join(workDir, 'chain-style-judge.json')),
		styleRepairSummaries: Array.from({ length: chainStyleRepairAttempts }, (_, index) =>
			path.join(workDir, `style-repair-summary-${index + 1}.json`)
		)
			.filter((filePath) => existsSync(filePath))
			.map(relative),
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
