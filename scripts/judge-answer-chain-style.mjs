#!/usr/bin/env node

import { generateJson } from '@ljoukov/llm';
import { z } from 'zod';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { readJson, setupLlmEnv, writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/judge-answer-chain-style.mjs \\
  --input=chain-reconciled.json \\
  --output=chain-style-judge.json

Optional:
  --existing-chains=existing-chain-context.json
  --model=chatgpt-gpt-5.5
  --thinking-level=medium
  --batch-size=12
  --max-existing-chains-per-batch=20
  --source-snippet-chars=360
  --timeout-ms=240000`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const inputPath = path.resolve(rootDir, requiredStringArg('input'));
const outputPath = path.resolve(rootDir, stringArg('output', 'tmp/chain-style-judge.json'));
const existingChainsPath = stringArg('existing-chains', '');
const model = stringArg('model', 'chatgpt-gpt-5.5');
const thinkingLevel = stringArg('thinking-level', 'medium');
const batchSize = integerArg('batch-size', 12, 1);
const maxExistingChainsPerBatch = integerArg('max-existing-chains-per-batch', 20, 0);
const sourceSnippetChars = integerArg('source-snippet-chars', 360, 80);
const timeoutMs = integerArg('timeout-ms', 240_000, 1);
const dryRun = hasArg('dry-run');
const STOP_WORDS = new Set([
	'and',
	'are',
	'but',
	'can',
	'for',
	'from',
	'has',
	'have',
	'into',
	'not',
	'that',
	'the',
	'then',
	'this',
	'use',
	'with',
	'when',
	'where',
	'which',
	'why'
]);

const candidate = readJson(inputPath);
const existingChains = existingChainsPath
	? (readJson(path.resolve(rootDir, existingChainsPath)).answerChains ?? [])
	: [];
const payload = {
	sourceDocumentId: candidate.sourceDocument?.id ?? candidate.sourceDocumentId ?? null,
	chains: chainPayload(candidate),
	existingChains: existingChains.map(compactExistingChain)
};

if (dryRun) {
	const result = {
		status: 'dry-run',
		input: relative(inputPath),
		chainCount: payload.chains.length,
		batchSize,
		maxExistingChainsPerBatch,
		sourceSnippetChars,
		batches: chunk(payload.chains, batchSize).length
	};
	writeJson(outputPath, result);
	console.log(JSON.stringify(result, null, 2));
	process.exit(0);
}

setupLlmEnv();
const started = performance.now();
const batchResults = [];
const batches = chunk(payload.chains, batchSize);
for (const [index, chains] of batches.entries()) {
	const batchPayload = {
		sourceDocumentId: payload.sourceDocumentId,
		chains,
		existingChains: relevantExistingChains(chains, payload.existingChains)
	};
	console.error(
		`chain style judge batch ${index + 1}/${batches.length}: ` +
			`${chains.length} candidate chains, ${batchPayload.existingChains.length} existing chains`
	);
	batchResults.push(
		await judgeBatch({
			payload: batchPayload,
			batchIndex: index + 1,
			batchCount: batches.length
		})
	);
	console.error(`chain style judge batch ${index + 1}/${batches.length}: done`);
}
const issues = batchResults.flatMap((result) => result.issues ?? []);
const output = {
	status: issues.some((issue) => issue.severity === 'error') ? 'failed' : 'passed',
	summary: batchResults
		.map((result) => result.summary)
		.filter(Boolean)
		.join(' '),
	issues,
	model,
	thinkingLevel,
	batchSize,
	batches: batchResults.map((result, index) => ({
		index: index + 1,
		status: result.status,
		chainCount: batches[index].length,
		durationMs: result.durationMs,
		usage: result.usage ?? null,
		costUsd: result.costUsd ?? null
	})),
	usage: sumUsage(batchResults.map((result) => result.usage).filter(Boolean)),
	costUsd: batchResults.reduce((sum, result) => sum + Number(result.costUsd ?? 0), 0),
	durationMs: Math.round(performance.now() - started)
};
writeJson(outputPath, output);
console.log(JSON.stringify(output, null, 2));
if (output.status !== 'passed' || output.issues.some((issue) => issue.severity === 'error')) {
	process.exit(1);
}

async function judgeBatch({ payload, batchIndex, batchCount }) {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(new Error(`chain style judge batch ${batchIndex} timed out`)),
		timeoutMs
	);
	const startedBatch = performance.now();
	try {
		const response = await generateJson({
			model,
			...(thinkingLevel === 'none' ? {} : { thinkingLevel }),
			telemetry: false,
			signal: controller.signal,
			schema: z.object({
				status: z.enum(['passed', 'failed']),
				summary: z.string(),
				issues: z.array(
					z.object({
						severity: z.enum(['error', 'warning']),
						code: z.string(),
						chainId: z.string().nullable(),
						sourceQuestionRefs: z.array(z.string()),
						finding: z.string(),
						suggestedTitle: z.string().nullable().optional(),
						suggestedCanonicalChainText: z.string().nullable().optional(),
						suggestedStepTexts: z.array(z.string()).nullable().optional()
					})
				)
			}),
			input: [
				'You are an independent answer-chain style validator for Question Constellation.',
				'Judge only answer-chain quality and chain consolidation. Do not judge PDF extraction.',
				'Fail real learner-facing chain problems even when deterministic length checks pass.',
				`This is batch ${batchIndex} of ${batchCount}. Judge every chain in this batch.`,
				'',
				'Product standard:',
				'- A chain is a memorable GCSE reasoning handle, not a paragraph.',
				'- Titles should usually be 1-3 words; allow up to 5 only when a short title would be ambiguous.',
				'- canonicalChainText should be 2-5 tiny links joined by " -> ".',
				'- Each visible chain link and stepText should usually be 1-4 words.',
				'- One simple emoji per step is allowed if it makes the step easier to remember, but emojis are optional.',
				'- Summary must add a short memory cue or usage note. It must not repeat the canonical chain in sentence form.',
				'- Put explanations in explanation/commonOmission/modelAnswer/checklist, not in the visible chain labels.',
				'- Never require final numeric answers, exact table values, exact fixed-response answer text, or worked calculation results in chain fields. Calculation chains should cue the method only.',
				'- For fixed-response questions such as choice, matching, equation blanks, image labels, and number lines, keep exact selected letters, full selected-option sentences, exact blank-fill answers, final values, and table values in response.correctAnswers, not in answerChain fields. Use a reusable cue/category/method handle instead.',
				'- Do not over-sanitize fixed-response chains. A compact underlying concept is allowed when it is the reusable GCSE idea. For example, "data + instructions -> binary" is a valid concept handle for a binary representation choice question; "B" or the full option sentence is not.',
				'- For SQL/code blanks, fail literal blank answers in visible chain fields, but pass structural cues. Good: "command clause -> filter condition" or "destination -> value marker -> ordered values". Bad: visible labels that expose an exact blank keyword or final value.',
				'- For "any two", "any three", or "suggest one" mark schemes, the visible chain should not list every accepted alternative as a required sequence. A compact category/count handle is acceptable when examples live in explanation or mark evidence.',
				'- Existing chains may include old rows from the same sourceDocumentId that this candidate paper will replace. Do not fail a duplicate solely because an incoming question moves away from an old same-paper chain that is absent from the candidate output. Do fail duplicates among incoming chains, or when the candidate ignores an existing same-reasoning chain from other papers.',
				'',
				'Always fail issues like these:',
				'- Title: "Symbiosis benefit: resource gained then used" because it is too long and abstract.',
				'- Summary: "Name the resource gained from the relationship and connect it to how the organism uses it" because it repeats the chain as an instruction.',
				'- Step: "State the useful resource or substance the organism gains from its partner in the relationship" because it is not a memory cue.',
				'- Canonical text that starts "When...", "For a...", or reads as a complete teaching paragraph.',
				'- Generic chains such as "resource gained -> biological use" when the source supports a more concrete memorable chain.',
				'- Fixed-response exact-answer chains such as title "Willow Bark", canonical "painkiller plant -> willow bark", canonical "CO2 + water -> glucose", or chain labels that copy "fatty acids" and "glycerol" from response.correctAnswers.',
				'- Over-abstract repairs such as "stored content -> binary scope" when the mark evidence supports the compact underlying concept "data + instructions -> binary".',
				'- New chain IDs that duplicate an existing chain with the same ordered mark-scoring links.',
				'- Alternative mark routes written as a false required sequence.',
				'',
				'Pass compact examples:',
				'- title: "Active transport"; canonical: "low to high -> active transport -> energy needed"',
				'- title: "Percentage change"; canonical: "change -> original -> times 100"',
				'- title: "Food test"; canonical: "reagent -> treatment -> colour"',
				'- title: "Clinical trials"; canonical: "safety -> dose -> works"',
				'- title: "Stage total"; canonical: "selected stages -> add -> total percent"',
				'- title: "Unit ratio"; canonical: "convert units -> compare -> ratio"',
				'- title: "Cell similarities"; canonical: "both shown -> shared structures -> choose two"',
				'- title: "Practical extension"; canonical: "specific extension -> relevant outcome"',
				'- title: "Binary Storage"; canonical: "data + instructions -> binary"',
				'- title: "School network"; canonical: "school users -> shared benefits -> risks/costs -> balance"',
				'- title: "Blagging phishing"; canonical: "fake story -> sensitive gain -> one vs many"',
				'- title: "SQL query"; canonical: "command clause -> filter condition"',
				'',
				'Return JSON only. status must be failed if any issue has severity error.',
				'',
				'CHAIN_PAYLOAD:',
				JSON.stringify(payload, null, 2)
			].join('\n')
		});
		return {
			...response.value,
			model: response.result.model,
			modelVersion: response.result.modelVersion,
			usage: response.result.usage ?? null,
			costUsd: response.result.costUsd ?? null,
			durationMs: Math.round(performance.now() - startedBatch)
		};
	} finally {
		clearTimeout(timeout);
	}
}

function chainPayload(candidate) {
	const groups = new Map();
	for (const question of candidate.questions ?? []) {
		const chain = question.answerChain;
		if (!chain?.id) continue;
		const group = groups.get(chain.id) ?? {
			id: chain.id,
			title: chain.title ?? '',
			canonicalChainText: chain.canonicalChainText ?? '',
			summary: chain.summary ?? '',
			steps: (chain.steps ?? []).map((step) => ({
				stepText: step.stepText ?? '',
				explanation: snippet(step.explanation ?? '', 220),
				commonOmission: snippet(step.commonOmission ?? '', 220)
			})),
			questions: []
		};
		group.questions.push({
			sourceQuestionRef: question.sourceQuestionRef,
			promptText: snippet(question.promptText ?? '', sourceSnippetChars),
			marks: question.marks,
			responseKind: question.response?.kind ?? null,
			responseCorrectAnswers: responseCorrectAnswerTexts(question.response).map((answer) =>
				snippet(answer, 120)
			),
			chainResolution: question.chainResolution ?? null,
			markSchemeItems: (question.markSchemeItems ?? [])
				.map((item, index) => ({
					index,
					itemType: item.itemType ?? item.kind ?? null,
					text: snippet(item.text ?? '', sourceSnippetChars)
				}))
				.slice(0, 8)
		});
		groups.set(chain.id, group);
	}
	return [...groups.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function compactExistingChain(chain) {
	return {
		id: chain.id,
		title: chain.title ?? '',
		canonicalChainText: snippet(chain.canonicalChainText ?? '', 260),
		summary: snippet(chain.summary ?? '', 220),
		broadTopic: chain.broadTopic ?? '',
		chainFamilyId: chain.chainFamilyId ?? '',
		exampleQuestionRefs: chain.exampleQuestionRefs ?? []
	};
}

function relevantExistingChains(batchChains, existing) {
	if (maxExistingChainsPerBatch === 0 || existing.length === 0) return [];
	const referencedIds = new Set(
		batchChains.flatMap((chain) =>
			(chain.questions ?? [])
				.map((question) => question.chainResolution?.existingChainId)
				.filter(Boolean)
		)
	);
	const batchTokens = tokenSet(
		batchChains
			.flatMap((chain) => [
				chain.id,
				chain.title,
				chain.canonicalChainText,
				chain.summary,
				...(chain.steps ?? []).map((step) => step.stepText),
				...(chain.questions ?? []).flatMap((question) => [
					question.promptText,
					...(question.markSchemeItems ?? []).map((item) => item.text)
				])
			])
			.join(' ')
	);
	return existing
		.map((chain) => ({
			chain,
			score:
				(referencedIds.has(chain.id) ? 1000 : 0) +
				overlapScore(
					batchTokens,
					tokenSet(
						`${chain.id} ${chain.title} ${chain.canonicalChainText} ${chain.summary} ${chain.chainFamilyId}`
					)
				)
		}))
		.filter((entry) => entry.score > 0)
		.sort((left, right) => right.score - left.score || left.chain.id.localeCompare(right.chain.id))
		.slice(0, maxExistingChainsPerBatch)
		.map((entry) => entry.chain);
}

function tokenSet(text) {
	return new Set(
		String(text)
			.toLowerCase()
			.match(/[a-z0-9]+/g)
			?.filter((token) => token.length > 2 && !STOP_WORDS.has(token)) ?? []
	);
}

function overlapScore(left, right) {
	let score = 0;
	for (const token of right) {
		if (left.has(token)) score += 1;
	}
	return score;
}

function responseCorrectAnswerTexts(response) {
	const answers = response?.correctAnswers;
	if (!answers) return [];
	if (Array.isArray(answers)) {
		return answers
			.map((answer) => answer?.correctAnswer)
			.filter((answer) => typeof answer === 'string' && answer.trim());
	}
	if (typeof answers === 'object') {
		return Object.values(answers)
			.flatMap((answer) => (Array.isArray(answer) ? answer : [answer]))
			.filter((answer) => typeof answer === 'string' && answer.trim());
	}
	return [];
}

function snippet(value, maxChars) {
	const text = String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
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

function requiredStringArg(name) {
	const value = stringArg(name, '');
	if (!value) throw new Error(`Pass --${name}=...\n\n${usage}`);
	return value;
}

function chunk(values, size) {
	const chunks = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
}

function sumUsage(usages) {
	if (usages.length === 0) return null;
	const result = {};
	for (const usage of usages) {
		for (const [key, value] of Object.entries(usage)) {
			if (typeof value === 'number') result[key] = (result[key] ?? 0) + value;
		}
	}
	return result;
}

function relative(filePath) {
	return path.relative(rootDir, filePath);
}
