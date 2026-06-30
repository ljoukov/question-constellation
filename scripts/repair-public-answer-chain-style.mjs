#!/usr/bin/env node

import { generateJson } from '@ljoukov/llm';
import { z } from 'zod';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { d1Query } from './lib/d1-rest.mjs';
import { fetchPublicChains } from './lib/public-chain-d1.mjs';
import { ALLOWED_STEP_ROLES, publicChainStyleIssues } from './lib/answer-chain-style.mjs';
import { readJson, setupLlmEnv, writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/repair-public-answer-chain-style.mjs

Optional:
  --subject=all|Physics|Biology|Chemistry
  --chain-id=<id>                    may be passed multiple times
  --limit=20
  --batch-size=10
  --model=chatgpt-gpt-5.5
  --thinking-level=high
  --output=tmp/public-chain-style-repair.json
  --input-repair=tmp/public-chain-style-repair.json
  --write                           apply a previously generated or newly generated repair to D1
  --errors-only                     repair only chains with hard errors, not warning-only chains
  --skip-generation                 requires --input-repair
  --resume                          reuse repairs already present in --output
  --timeout-ms=300000`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const subject = stringArg('subject', 'all');
const chainIds = stringArgs('chain-id');
const limit = integerArg('limit', 0, 0);
const batchSize = integerArg('batch-size', 10, 1);
const model = stringArg('model', 'chatgpt-gpt-5.5');
const thinkingLevel = stringArg('thinking-level', 'high');
const outputPath = path.resolve(rootDir, stringArg('output', 'tmp/public-chain-style-repair.json'));
const inputRepairPath = stringArg('input-repair', '');
const write = hasArg('write');
const errorsOnly = hasArg('errors-only');
const skipGeneration = hasArg('skip-generation');
const resume = hasArg('resume');
const timeoutMs = integerArg('timeout-ms', 300_000, 1);

const started = performance.now();
setupLlmEnv();
let repairPlan;
if (skipGeneration || inputRepairPath) {
	const resolved = path.resolve(rootDir, inputRepairPath || outputPath);
	repairPlan = readJson(resolved);
	repairPlan.validation = await validateLoadedRepairPlan(repairPlan);
} else {
	repairPlan = await generateRepairPlan();
	mkdirSync(path.dirname(outputPath), { recursive: true });
	writeJson(outputPath, repairPlan);
}

if (write) {
	const writeResult = await applyRepairPlan(repairPlan);
	repairPlan.write = writeResult;
	writeJson(outputPath, repairPlan);
}

const finalSummary = {
	status: repairPlan.validation?.errorChains > 0 ? 'failed' : 'passed',
	output: relative(outputPath),
	selectedChains: repairPlan.selectedChains,
	repairedChains: repairPlan.repairs?.length ?? 0,
	validation: repairPlan.validation,
	write: repairPlan.write ?? null,
	durationMs: Math.round(performance.now() - started),
	usage: repairPlan.usage ?? null,
	costUsd: repairPlan.costUsd ?? null
};
console.log(JSON.stringify(finalSummary, null, 2));
if (finalSummary.status !== 'passed') process.exit(1);

async function generateRepairPlan() {
	const chains = await fetchPublicChains({
		rootDir,
		subject,
		chainIds,
		includeExamples: true,
		maxExamplesPerChain: 3,
		maxMarkItemsPerExample: 8
	});
	const candidates = chains
		.map((chain) => ({
			chain,
			issues: publicChainStyleIssues(chain, { includeReuseWarnings: false })
		}))
		.filter(({ issues }) =>
			errorsOnly
				? issues.some((issue) => issue.severity === 'error')
				: issues.some((issue) => issue.severity === 'error' || issue.severity === 'warning')
		);
	const selected = (limit > 0 ? candidates.slice(0, limit) : candidates).map(
		({ chain, issues }) => ({
			...compactChainForPrompt(chain),
			issues
		})
	);
	mkdirSync(path.dirname(outputPath), { recursive: true });
	const existingPlan = resume && existsSync(outputPath) ? readJson(outputPath) : null;
	const repairs = [...(Array.isArray(existingPlan?.repairs) ? existingPlan.repairs : [])];
	const repairedIds = new Set(repairs.map((repair) => repair.chainId));
	const batchResults = [...(Array.isArray(existingPlan?.batches) ? existingPlan.batches : [])];
	const remaining = selected.filter((chain) => !repairedIds.has(chain.id));
	const batches = chunk(remaining, batchSize);
	for (const [index, batch] of batches.entries()) {
		console.error(
			`public chain repair batch ${index + 1}/${batches.length}: ${batch.length} chains`
		);
		try {
			const batchResult = await repairBatch(batch, index + 1, batches.length);
			batchResults.push(batchResult);
			repairs.push(...(batchResult.repairs ?? []));
			writeJson(outputPath, {
				status: 'partial',
				generatedAt: new Date().toISOString(),
				subject,
				chainIds,
				errorsOnly,
				model,
				thinkingLevel,
				batchSize,
				selectedChains: selected.length,
				totalPublicChainsScanned: chains.length,
				completedRepairs: repairs.length,
				remainingChains: selected.length - repairs.length,
				repairs,
				batches: batchResults.map(batchSummary),
				usage: sumUsage(batchResults.map((completedBatch) => completedBatch.usage).filter(Boolean)),
				costUsd: Number(
					batchResults
						.reduce((sum, completedBatch) => sum + Number(completedBatch.costUsd ?? 0), 0)
						.toFixed(6)
				),
				durationMs: Math.round(performance.now() - started)
			});
		} catch (error) {
			writeJson(outputPath, {
				status: 'failed',
				generatedAt: new Date().toISOString(),
				subject,
				chainIds,
				errorsOnly,
				model,
				thinkingLevel,
				batchSize,
				selectedChains: selected.length,
				totalPublicChainsScanned: chains.length,
				completedRepairs: repairs.length,
				remainingChains: selected.length - repairs.length,
				error: error instanceof Error ? error.message : String(error),
				repairs,
				batches: batchResults.map(batchSummary),
				durationMs: Math.round(performance.now() - started)
			});
			throw error;
		}
	}
	const repairedById = new Map(repairs.map((repair) => [repair.chainId, repair]));
	const missingRepairs = selected
		.map((chain) => chain.id)
		.filter((chainId) => !repairedById.has(chainId));
	const validation = validateRepairs({ selected, repairs, missingRepairs });
	return {
		status: validation.errorChains > 0 ? 'failed' : 'passed',
		generatedAt: new Date().toISOString(),
		subject,
		chainIds,
		errorsOnly,
		model,
		thinkingLevel,
		batchSize,
		selectedChains: selected.length,
		totalPublicChainsScanned: chains.length,
		repairs,
		missingRepairs,
		validation,
		batches: batchResults.map(batchSummary),
		usage: sumUsage(batchResults.map((batch) => batch.usage).filter(Boolean)),
		costUsd: Number(
			batchResults.reduce((sum, batch) => sum + Number(batch.costUsd ?? 0), 0).toFixed(6)
		),
		durationMs: Math.round(performance.now() - started)
	};
}

async function repairBatch(chains, batchIndex, batchCount) {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(new Error(`public chain repair batch ${batchIndex} timed out`)),
		timeoutMs
	);
	const batchStarted = performance.now();
	try {
		const repairSchema = z.object({
			chainId: z.string().nullish(),
			id: z.string().nullish(),
			title: z.string(),
			canonicalChainText: z.string(),
			summary: z.string(),
			steps: z.array(
				z.object({
					stepText: z.string(),
					stepRole: z.enum([
						'given',
						'cause',
						'process',
						'link',
						'effect',
						'evidence',
						'method',
						'calculation',
						'conclusion'
					]),
					explanation: z.string(),
					commonOmission: z.string()
				})
			),
			rationale: z.string().nullish()
		});
		const input = [
			'You are repairing deployed Question Constellation answer-chain copy.',
			'Rewrite only learner-facing chain wording. Do not change question memberships, mark-scheme facts, model answers, or solved answers.',
			'The input chains are already public; make their visible chain handles compact enough to memorize while preserving the mark-scoring idea.',
			'',
			'Hard style rules for every repair:',
			'- title: 1-3 words whenever possible, hard maximum 5 words.',
			'- canonicalChainText: 2-5 tiny links joined by " -> ". No sentences, no paragraphs, no "When..." or "For a..." wording.',
			'- each canonical link: usually 1-4 words.',
			'- steps: 2-5 compact labels, usually matching the canonical links. Each stepText should be 1-4 words, hard maximum 5 words.',
			'- summary: one short memory cue or usage note, ideally <= 8 words. Do not repeat the chain as an instruction.',
			'- explanation/commonOmission may be longer teaching text, but keep them concise.',
			'- Use only these stepRole values: given, cause, process, link, effect, evidence, method, calculation, conclusion.',
			'- Each repair object must include chainId exactly matching the input id.',
			'- Do not put worked numeric answers, exact table values, exact tick-box letters, or one-off final values in chain fields.',
			'- Keep exact fixed answers in marking/model-answer data. For recall chains, concrete reusable science terms are allowed when they are the thing students must remember.',
			'- For "any two", "any three", and "suggest one" mark schemes, do not list all alternatives as a required sequence. Use a category/count handle.',
			'- If a chain currently has one public paper, do not pretend it is cross-paper. Just make the wording reusable.',
			'',
			'Good examples:',
			'- Active transport: low to high -> active transport -> energy needed',
			'- Percentage change: change -> original -> times 100',
			'- Food test: reagent -> treatment -> colour',
			'- Clinical trials: safety -> dose -> works',
			'- Graph plotting: axis label -> scale -> plots -> best fit',
			'- Unit ratio: convert units -> compare -> ratio',
			'',
			`This is batch ${batchIndex} of ${batchCount}. Return a repair for every input chain.`,
			'Return a JSON object with exactly one top-level key named "repairs"; do not return a bare array.',
			'CHAIN_BATCH:',
			JSON.stringify(chains, null, 2)
		].join('\n');
		let rawRepairs;
		let responseMeta = {};
		try {
			const response = await generateJson({
				model,
				...(thinkingLevel === 'none' ? {} : { thinkingLevel }),
				telemetry: false,
				signal: controller.signal,
				schema: z.object({ repairs: z.array(repairSchema) }),
				input
			});
			rawRepairs = response.value.repairs;
			responseMeta = {
				model: response.result.model,
				modelVersion: response.result.modelVersion,
				usage: response.result.usage ?? null,
				costUsd: response.result.costUsd ?? null
			};
		} catch (error) {
			rawRepairs = parseRepairsFromFailedJsonCall(error, repairSchema);
			if (!rawRepairs) throw error;
			responseMeta = {
				model,
				modelVersion: null,
				usage: null,
				costUsd: null,
				recoveredFromRawJson: true,
				recoveredError: error instanceof Error ? error.message : String(error)
			};
		}
		return {
			batchIndex,
			batchCount,
			durationMs: Math.round(performance.now() - batchStarted),
			...responseMeta,
			repairs: rawRepairs.map((repair) => ({
				...repair,
				chainId: repair.chainId ?? repair.id,
				rationale: repair.rationale ?? ''
			}))
		};
	} finally {
		clearTimeout(timeout);
	}
}

function parseRepairsFromFailedJsonCall(error, repairSchema) {
	for (const attempt of [...(error?.attempts ?? [])].reverse()) {
		if (!attempt?.rawText) continue;
		try {
			const parsed = JSON.parse(attempt.rawText);
			const repairs = Array.isArray(parsed) ? parsed : parsed?.repairs;
			if (!Array.isArray(repairs)) continue;
			return repairs.map((repair) => repairSchema.parse(repair));
		} catch {
			// Try the next raw attempt.
		}
	}
	return null;
}

function validateRepairs({ selected, repairs, missingRepairs }) {
	const selectedById = new Map(selected.map((chain) => [chain.id, chain]));
	const seen = new Set();
	const findings = [];
	for (const missing of missingRepairs) {
		findings.push({
			chainId: missing,
			severity: 'error',
			code: 'missing_repair',
			field: 'chainId',
			evidence: 'LLM did not return a repair for this selected chain.'
		});
	}
	for (const repair of repairs) {
		const original = selectedById.get(repair.chainId);
		if (!original) {
			findings.push({
				chainId: repair.chainId,
				severity: 'error',
				code: 'unexpected_repair',
				field: 'chainId',
				evidence: 'Repair was not requested.'
			});
			continue;
		}
		if (seen.has(repair.chainId)) {
			findings.push({
				chainId: repair.chainId,
				severity: 'error',
				code: 'duplicate_repair',
				field: 'chainId',
				evidence: 'Repair appeared more than once.'
			});
		}
		seen.add(repair.chainId);
		const chainForAudit = {
			id: repair.chainId,
			title: repair.title,
			canonicalChainText: repair.canonicalChainText,
			summary: repair.summary,
			publicQuestions: original.publicQuestions,
			publicPapers: original.publicPapers,
			steps: repair.steps
		};
		findings.push(...publicChainStyleIssues(chainForAudit, { includeReuseWarnings: false }));
		if (repair.steps.length < 2 || repair.steps.length > 5) {
			findings.push({
				chainId: repair.chainId,
				severity: 'error',
				code: 'bad_step_count',
				field: 'steps',
				evidence: `${repair.steps.length} steps`
			});
		}
		for (const [index, step] of repair.steps.entries()) {
			if (!ALLOWED_STEP_ROLES.has(step.stepRole)) {
				findings.push({
					chainId: repair.chainId,
					severity: 'error',
					code: 'unsupported_step_role',
					field: `steps[${index}].stepRole`,
					evidence: step.stepRole
				});
			}
		}
	}
	const errorChainIds = new Set(
		findings.filter((finding) => finding.severity === 'error').map((finding) => finding.chainId)
	);
	const warningChainIds = new Set(
		findings.filter((finding) => finding.severity === 'warning').map((finding) => finding.chainId)
	);
	return {
		status: errorChainIds.size > 0 ? 'failed' : 'passed',
		errorChains: errorChainIds.size,
		warningChains: warningChainIds.size,
		errors: findings.filter((finding) => finding.severity === 'error').length,
		warnings: findings.filter((finding) => finding.severity === 'warning').length,
		findings
	};
}

async function applyRepairPlan(plan) {
	if (plan.validation?.errorChains > 0) {
		throw new Error('Refusing to write repair plan with validation errors.');
	}
	let chainsUpdated = 0;
	let stepsDeleted = 0;
	let stepsInserted = 0;
	let fitNotesUpdated = 0;
	const originalsById = new Map();
	const current = await fetchPublicChains({
		rootDir,
		chainIds: plan.repairs.map((repair) => repair.chainId)
	});
	for (const chain of current) originalsById.set(chain.id, chain);
	for (const repair of plan.repairs) {
		const original = originalsById.get(repair.chainId);
		await d1Query(
			`UPDATE answer_chains
			 SET title = ?,
			     canonical_chain_text = ?,
			     summary = ?,
			     updated_at = CURRENT_TIMESTAMP
			 WHERE id = ?`,
			[repair.title, repair.canonicalChainText, repair.summary, repair.chainId],
			{ rootDir }
		);
		chainsUpdated += 1;
		const deleteResult = await d1Query(
			`DELETE FROM answer_chain_steps WHERE answer_chain_id = ?`,
			[repair.chainId],
			{ rootDir }
		);
		stepsDeleted += Number(deleteResult.meta?.changes ?? 0);
		for (const [index, step] of repair.steps.entries()) {
			await d1Query(
				`INSERT INTO answer_chain_steps
				 (id, answer_chain_id, display_order, step_text, step_role, explanation,
				  common_omission, supported_by_mark_scheme_item_ids_json, evidence_json)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					`${repair.chainId}-step-${index + 1}`,
					repair.chainId,
					index + 1,
					step.stepText,
					step.stepRole,
					step.explanation || null,
					step.commonOmission || null,
					'[]',
					'[]'
				],
				{ rootDir }
			);
			stepsInserted += 1;
		}
		const fitResult = await d1Query(
			`UPDATE question_answer_chains
			 SET fit_notes = ?
			 WHERE answer_chain_id = ?
			   AND needs_human_review = 0
			   AND (fit_notes IS NULL OR fit_notes = ? OR LENGTH(fit_notes) > 100)`,
			[repair.summary, repair.chainId, original?.summary ?? repair.summary],
			{ rootDir }
		);
		fitNotesUpdated += Number(fitResult.meta?.changes ?? 0);
	}
	return {
		writtenAt: new Date().toISOString(),
		chainsUpdated,
		stepsDeleted,
		stepsInserted,
		fitNotesUpdated
	};
}

async function validateLoadedRepairPlan(plan) {
	const repairs = Array.isArray(plan.repairs) ? plan.repairs : [];
	const current = await fetchPublicChains({
		rootDir,
		chainIds: repairs.map((repair) => repair.chainId)
	});
	const currentById = new Map(current.map((chain) => [chain.id, chain]));
	const selected = repairs.map((repair) => {
		const chain = currentById.get(repair.chainId) ?? {};
		return {
			id: repair.chainId,
			publicQuestions: Number(chain.publicQuestions ?? 0),
			publicPapers: Number(chain.publicPapers ?? 0)
		};
	});
	return validateRepairs({ selected, repairs, missingRepairs: [] });
}

function compactChainForPrompt(chain) {
	return {
		id: chain.id,
		subjectArea: chain.subjectArea,
		broadTopic: chain.broadTopic,
		publicQuestions: Number(chain.publicQuestions ?? 0),
		publicPapers: Number(chain.publicPapers ?? 0),
		current: {
			title: chain.title,
			canonicalChainText: chain.canonicalChainText,
			summary: chain.summary,
			steps: (chain.steps ?? []).map((step) => ({
				stepText: step.stepText,
				stepRole: step.stepRole,
				explanation: snippet(step.explanation, 240),
				commonOmission: snippet(step.commonOmission, 180)
			}))
		},
		examples: chain.examples
	};
}

function chunk(values, size) {
	const out = [];
	for (let index = 0; index < values.length; index += size)
		out.push(values.slice(index, index + size));
	return out;
}

function batchSummary(batch) {
	const summary = { ...batch };
	delete summary.repairs;
	return summary;
}

function snippet(value, maxLength) {
	const text = String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function sumUsage(usages) {
	const total = {};
	for (const usage of usages) {
		for (const [key, value] of Object.entries(usage ?? {})) {
			if (typeof value === 'number') total[key] = (total[key] ?? 0) + value;
		}
	}
	return Object.keys(total).length ? total : null;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function stringArgs(name) {
	const prefix = `--${name}=`;
	return process.argv
		.filter((candidate) => candidate.startsWith(prefix))
		.map((arg) => arg.slice(prefix.length));
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
