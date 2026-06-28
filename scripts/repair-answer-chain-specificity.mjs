#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
	DEFAULT_EXTRACTION_MODEL,
	DEFAULT_THINKING_LEVEL,
	deterministicCandidateIssues,
	positiveMarkSchemeItem,
	readJson,
	repairFullPaperAnswerChains,
	setupLlmEnv,
	writeJson
} from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/repair-answer-chain-specificity.mjs [options]

Options:
  --input=<paper.json>
  --input-root=data/vision-extracted
  --paper=<source-document-id-or-fragment>
  --subject=<biology|chemistry|physics|all>
  --refs=01.3,05.7
  --write
  --batch-size=1
  --attempts=2
  --concurrency=1
  --max-existing-chains=0
  --max-existing-context-chars=50000
  --include-warnings
  --fail-on-blocking
  --model=chatgpt-gpt-5.5
  --thinking-level=xhigh
  --llm-timeout-ms=600000
  --llm-max-attempts=3`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const inputPath = stringArg('input', '');
const inputRoot = stringArg('input-root', 'data/vision-extracted');
const summaryPath = path.resolve(
	rootDir,
	stringArg('summary', 'tmp/answer-chain-specificity-repair-summary.json')
);
const paperArg = stringArg('paper', '');
const subjectArg = stringArg('subject', 'all').toLowerCase();
const sourceRefs = new Set(
	stringArg('refs', '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean)
);
const model = stringArg('model', process.env.EXTRACTION_PIPELINE_MODEL ?? DEFAULT_EXTRACTION_MODEL);
const thinkingLevel = stringArg(
	'thinking-level',
	process.env.EXTRACTION_PIPELINE_THINKING_LEVEL ?? DEFAULT_THINKING_LEVEL
);
const batchSize = integerArg('batch-size', 1, 1);
const attempts = integerArg('attempts', 2, 0);
const concurrency = integerArg('concurrency', 1, 1);
const maxExistingChains = integerArg('max-existing-chains', 0, 0);
const maxExistingContextChars = integerArg('max-existing-context-chars', 50000, 0);
const recursive = !hasArg('no-recursive');
const write = hasArg('write');
const failOnBlocking = hasArg('fail-on-blocking');
const includeWarnings = hasArg('include-warnings');
const existingChainsPath = stringArg('existing-chains', '');
const llmTimeoutMs = optionalIntegerArg('llm-timeout-ms');
const llmMaxAttempts = optionalIntegerArg('llm-max-attempts');

if (llmTimeoutMs) process.env.EXTRACTION_LLM_TIMEOUT_MS = String(llmTimeoutMs);
if (llmMaxAttempts) process.env.EXTRACTION_LLM_MAX_ATTEMPTS = String(llmMaxAttempts);
setupLlmEnv();

const existingChainContext = existingChainsPath
	? readExistingChainContext(path.resolve(rootDir, existingChainsPath))
	: null;
const files = selectInputFiles();
if (files.length === 0) throw new Error('No extracted paper JSON files matched the selection.');

const results = await mapWithConcurrency(files, concurrency, repairFile);

const summary = {
	status:
		results.some((result) => result.error) ||
		(failOnBlocking && results.some((result) => result.finalBlockingRefs.length > 0))
			? 'failed'
			: 'passed',
	write,
	inputRoot: inputPath ? null : inputRoot,
	input: inputPath || null,
	recursive,
	paper: paperArg || null,
	subject: subjectArg,
	refs: sourceRefs.size > 0 ? [...sourceRefs].sort(compareQuestionRefs) : null,
	model,
	thinkingLevel,
	attempts,
	batchSize,
	concurrency,
	includeWarnings,
	files: results,
	filesChanged: results.filter((result) => result.changed).length,
	initialBlockingRefs: results.reduce((sum, result) => sum + result.initialBlockingRefs.length, 0),
	finalBlockingRefs: results.reduce((sum, result) => sum + result.finalBlockingRefs.length, 0),
	finalWarningRefs: results.reduce((sum, result) => sum + result.finalWarningRefs.length, 0)
};

writeJson(summaryPath, summary);
console.log(
	[
		`answer-chain specificity repair ${summary.status}${write ? '' : ' dry-run'}`,
		`summary: ${relative(summaryPath)}`,
		`files: ${summary.files.length}, changed: ${summary.filesChanged}`,
		`initial blocking refs: ${summary.initialBlockingRefs}`,
		`final blocking refs: ${summary.finalBlockingRefs}`,
		`final warning refs: ${summary.finalWarningRefs}`
	].join('\n')
);
if (summary.status === 'failed') process.exit(1);

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function optionalIntegerArg(name) {
	const value = stringArg(name, '');
	if (!value) return null;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`--${name} must be a positive integer.`);
	}
	return parsed;
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

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function walkJsonFiles(dir) {
	const out = [];
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir)) {
		const filePath = path.join(dir, name);
		const stat = statSync(filePath);
		if (stat.isDirectory()) {
			if (recursive) out.push(...walkJsonFiles(filePath));
		} else if (name.endsWith('.json')) {
			out.push(filePath);
		}
	}
	return out.sort();
}

function sourceDocumentIdFor(candidate, filePath) {
	return (
		candidate?.sourceDocument?.id ??
		candidate?.sourceDocumentId ??
		path.basename(filePath ?? '', '.json')
	);
}

function subjectFor(candidate, filePath) {
	return String(
		candidate?.sourceDocument?.subjectArea ??
			candidate?.sourceDocument?.subject ??
			path.basename(path.dirname(filePath))
	).toLowerCase();
}

function selectInputFiles() {
	const candidates = inputPath
		? [path.resolve(rootDir, inputPath)]
		: walkJsonFiles(path.resolve(rootDir, inputRoot));
	return candidates.filter((filePath) => {
		if (!paperArg && subjectArg === 'all') return true;
		try {
			const candidate = readJson(filePath);
			const sourceDocumentId = sourceDocumentIdFor(candidate, filePath);
			const subject = subjectFor(candidate, filePath);
			const paperMatches =
				!paperArg || sourceDocumentId === paperArg || sourceDocumentId.includes(paperArg);
			const subjectMatches = subjectArg === 'all' || subject === subjectArg;
			return paperMatches && subjectMatches;
		} catch {
			return !paperArg && subjectArg === 'all';
		}
	});
}

function chainRepairFindings(candidate) {
	const questionByRef = new Map(
		(candidate.questions ?? []).map((question) => [question.sourceQuestionRef, question])
	);
	return deterministicCandidateIssues(candidate)
		.filter((finding) => sourceRefs.size === 0 || sourceRefs.has(finding.sourceQuestionRef))
		.filter((finding) => !extractionPlaceholderChain(questionByRef.get(finding.sourceQuestionRef)))
		.map((finding) => ({
			...finding,
			issues: finding.issues.filter((issue) => isAnswerChainRepairIssue(issue))
		}))
		.filter((finding) => finding.issues.length > 0);
}

function extractionPlaceholderChain(question) {
	const chain = question?.answerChain;
	if (!chain || chain.id) return false;
	const reviewText = [chain.reviewNotes, question.reviewNotes].flat().filter(Boolean).join('\n');
	return /placeholder generated by factual vision extraction/i.test(reviewText);
}

function isAnswerChainRepairIssue(issue) {
	const code = String(issue?.code ?? '');
	if (issue?.severity === 'warning' && !includeWarnings) return false;
	return (
		code === 'answer_chain_missing_stable_id' ||
		code === 'chain_numeric_substitution' ||
		code === 'chain_prompt_specific_number' ||
		code === 'chain_exact_fixed_answer_text' ||
		code === 'chain_step_missing_positive_evidence' ||
		code === 'chain_step_missing_mark_scheme_item' ||
		code === 'chain_step_non_positive_evidence' ||
		(includeWarnings && code === 'chain_numeric_review')
	);
}

function blockingRefs(findings) {
	return [
		...new Set(
			findings
				.filter((finding) => finding.issues.some((issue) => issue.severity === 'error'))
				.map((finding) => finding.sourceQuestionRef)
				.filter(Boolean)
		)
	].sort(compareQuestionRefs);
}

function warningRefs(findings) {
	return [
		...new Set(
			findings
				.filter(
					(finding) =>
						finding.issues.some((issue) => issue.severity === 'warning') &&
						!finding.issues.some((issue) => issue.severity === 'error')
				)
				.map((finding) => finding.sourceQuestionRef)
				.filter(Boolean)
		)
	].sort(compareQuestionRefs);
}

function compareQuestionRefs(left, right) {
	return String(left).localeCompare(String(right), undefined, {
		numeric: true,
		sensitivity: 'base'
	});
}

function chunks(values, size) {
	const out = [];
	for (let index = 0; index < values.length; index += size) {
		out.push(values.slice(index, index + size));
	}
	return out;
}

async function mapWithConcurrency(values, limit, mapper) {
	const results = new Array(values.length);
	let nextIndex = 0;
	const workerCount = Math.min(limit, values.length);
	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (nextIndex < values.length) {
				const index = nextIndex;
				nextIndex += 1;
				results[index] = await mapper(values[index], index);
			}
		})
	);
	return results;
}

async function repairFile(filePath) {
	const result = {
		file: relative(filePath),
		sourceDocumentId: null,
		changed: false,
		written: false,
		initialBlockingRefs: [],
		finalBlockingRefs: [],
		finalWarningRefs: [],
		attemptsRun: 0,
		batches: [],
		error: null
	};
	try {
		const original = readJson(filePath);
		result.sourceDocumentId = sourceDocumentIdFor(original, filePath);
		let candidate = repairMissingPositiveEvidenceIndexes(original);
		let findings = chainRepairFindings(candidate);
		result.initialBlockingRefs = blockingRefs(findings);
		if (
			result.initialBlockingRefs.length === 0 &&
			(!includeWarnings || warningRefs(findings).length === 0)
		) {
			result.finalBlockingRefs = [];
			result.finalWarningRefs = warningRefs(findings);
			return result;
		}

		for (let attempt = 1; attempt <= attempts; attempt += 1) {
			findings = chainRepairFindings(candidate);
			const refsToRepair = blockingRefs(findings);
			const warningOnlyRefs = includeWarnings ? warningRefs(findings) : [];
			const allRefsToRepair = [...new Set([...refsToRepair, ...warningOnlyRefs])].sort(
				compareQuestionRefs
			);
			if (allRefsToRepair.length === 0) break;
			result.attemptsRun = attempt;
			for (const batchRefs of chunks(allRefsToRepair, batchSize)) {
				console.error(
					`[repair-answer-chain-specificity] ${result.sourceDocumentId}: attempt ${attempt}, refs ${batchRefs.join(', ')}`
				);
				const before = chainRepairFindings(candidate).filter((finding) =>
					batchRefs.includes(finding.sourceQuestionRef)
				);
				candidate = await repairFullPaperAnswerChains({
					model,
					thinkingLevel,
					candidate,
					deterministicIssues: before,
					existingChainsText: existingChainsTextForBatch(candidate, batchRefs),
					sourceQuestionRefs: batchRefs
				});
				candidate = repairMissingPositiveEvidenceIndexes(candidate);
				const after = chainRepairFindings(candidate).filter((finding) =>
					batchRefs.includes(finding.sourceQuestionRef)
				);
				result.batches.push({
					attempt,
					refs: batchRefs,
					initialIssues: before.reduce((sum, finding) => sum + finding.issues.length, 0),
					finalIssues: after.reduce((sum, finding) => sum + finding.issues.length, 0)
				});
			}
		}

		const finalFindings = chainRepairFindings(candidate);
		result.finalBlockingRefs = blockingRefs(finalFindings);
		result.finalWarningRefs = warningRefs(finalFindings);
		result.changed = JSON.stringify(candidate) !== JSON.stringify(original);
		if (result.changed && write) {
			writeJson(filePath, candidate);
			result.written = true;
		}
		return result;
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
		return result;
	}
}

function repairMissingPositiveEvidenceIndexes(candidate) {
	let changed = false;
	const questions = (candidate.questions ?? []).map((question) => {
		const chain = question.answerChain;
		if (!chain?.steps?.length) return question;
		const markSchemeItems = question.markSchemeItems ?? [];
		const positiveIndexes = markSchemeItems
			.map((item, index) => ({ item, index }))
			.filter(({ item }) => positiveMarkSchemeItem(item));
		if (positiveIndexes.length === 0) return question;
		let questionChanged = false;
		const existingPositiveIndexes = new Set(
			chain.steps.flatMap((step) =>
				(step.markSchemeItemIndexes ?? []).filter((index) =>
					positiveMarkSchemeItem(markSchemeItems[index])
				)
			)
		);
		const steps = chain.steps.map((step) => {
			const currentIndexes = (step.markSchemeItemIndexes ?? []).filter((index) =>
				positiveMarkSchemeItem(markSchemeItems[index])
			);
			if (step.stepRole === 'given' || currentIndexes.length > 0) {
				if (currentIndexes.length === (step.markSchemeItemIndexes ?? []).length) return step;
				questionChanged = true;
				return { ...step, markSchemeItemIndexes: currentIndexes };
			}
			const inferredIndexes = inferPositiveEvidenceIndexes(step, positiveIndexes);
			const nextIndexes =
				inferredIndexes.length > 0
					? inferredIndexes
					: step.stepRole === 'conclusion'
						? [...existingPositiveIndexes]
						: [];
			if (nextIndexes.length === 0) return step;
			for (const index of nextIndexes) existingPositiveIndexes.add(index);
			questionChanged = true;
			return { ...step, markSchemeItemIndexes: nextIndexes };
		});
		if (!questionChanged) return question;
		changed = true;
		return {
			...question,
			answerChain: {
				...chain,
				steps
			}
		};
	});
	return changed ? { ...candidate, questions } : candidate;
}

function inferPositiveEvidenceIndexes(step, positiveIndexes) {
	const stepTokens = tokenSet(
		[step.stepText, step.explanation, step.commonOmission, step.stepRole].filter(Boolean).join('\n')
	);
	const scored = positiveIndexes
		.map(({ item, index }) => ({
			index,
			score: overlapScore(
				stepTokens,
				tokenSet([item.itemType, item.text].filter(Boolean).join('\n'))
			)
		}))
		.filter(({ score }) => score >= 2)
		.sort((left, right) => right.score - left.score || left.index - right.index);
	if (scored.length === 0 && positiveIndexes.length === 1) {
		const only = positiveIndexes[0];
		const score = overlapScore(
			stepTokens,
			tokenSet([only.item.itemType, only.item.text].filter(Boolean).join('\n'))
		);
		if (score >= 1) return [only.index];
	}
	return scored.slice(0, 3).map(({ index }) => index);
}

function overlapScore(leftTokens, rightTokens) {
	let score = 0;
	for (const token of leftTokens) {
		if (rightTokens.has(token)) score += 1;
	}
	return score;
}

function readExistingChainContext(filePath) {
	const raw = readFileSync(filePath, 'utf8');
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed?.answerChains) ? parsed : { raw };
	} catch {
		return { raw };
	}
}

function existingChainsTextForBatch(candidate, batchRefs) {
	if (!existingChainContext) return '';
	if (existingChainContext.raw) return existingChainContext.raw.slice(0, maxExistingContextChars);
	if (maxExistingChains === 0 || maxExistingContextChars === 0) return '';
	const questions = (candidate.questions ?? []).filter((question) =>
		batchRefs.includes(question.sourceQuestionRef)
	);
	const subject = String(
		candidate?.sourceDocument?.subjectArea ?? candidate?.sourceDocument?.subject ?? ''
	).toLowerCase();
	const currentIds = new Set(
		questions
			.map((question) => question.answerChain?.id)
			.filter((value) => typeof value === 'string')
	);
	const tokens = tokenSet(
		questions
			.flatMap((question) => [
				question.promptText,
				question.selfContainedPromptText,
				question.contextText,
				question.answerChain?.id,
				question.answerChain?.title,
				question.answerChain?.canonicalChainText,
				question.answerChain?.summary,
				question.answerChain?.broadTopic,
				...(question.markSchemeItems ?? []).map((item) => item?.text),
				...(question.markChecklist ?? []).map((item) => item?.text)
			])
			.filter(Boolean)
			.join('\n')
	);
	const scored = existingChainContext.answerChains
		.map((chain) => ({ chain, score: scoreExistingChain(chain, { subject, currentIds, tokens }) }))
		.filter((entry) => entry.score > 0)
		.sort(
			(left, right) =>
				right.score - left.score || String(left.chain.id).localeCompare(String(right.chain.id))
		);

	let selected = scored.slice(0, maxExistingChains).map((entry) => entry.chain);
	while (selected.length > 0) {
		const text = JSON.stringify(
			{
				version: existingChainContext.version ?? 1,
				source: existingChainContext.source ?? null,
				selection: {
					maxExistingChains,
					maxExistingContextChars,
					selectedChains: selected.length,
					batchRefs
				},
				answerChains: selected
			},
			null,
			2
		);
		if (text.length <= maxExistingContextChars) return text;
		selected = selected.slice(0, -1);
	}
	return '';
}

function scoreExistingChain(chain, { subject, currentIds, tokens }) {
	let score = 0;
	if (currentIds.has(chain?.id)) score += 1000;
	const subjects = (chain?.subjects ?? []).map((value) => String(value).toLowerCase());
	if (subject && subjects.includes(subject)) score += 50;
	const chainTokens = tokenSet(
		[
			chain?.id,
			chain?.title,
			chain?.canonicalChainText,
			chain?.summary,
			chain?.broadTopic,
			chain?.chainFamilyId,
			...(chain?.topicPaths ?? []),
			...(chain?.steps ?? []).flatMap((step) => [
				step?.stepText,
				step?.stepRole,
				step?.explanation,
				step?.commonOmission
			])
		]
			.filter(Boolean)
			.join('\n')
	);
	for (const token of chainTokens) {
		if (tokens.has(token)) score += 1;
	}
	return score;
}

function tokenSet(text) {
	const stop = new Set([
		'answer',
		'chain',
		'question',
		'mark',
		'marks',
		'using',
		'which',
		'where',
		'with',
		'from',
		'that',
		'this',
		'then',
		'correct',
		'figure',
		'value',
		'values'
	]);
	const tokens = String(text ?? '')
		.toLowerCase()
		.match(/[a-z][a-z0-9-]{3,}/g);
	return new Set((tokens ?? []).filter((token) => !stop.has(token)));
}
