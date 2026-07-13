#!/usr/bin/env node

import { generateImages } from '@ljoukov/llm';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	CHAIN_ILLUSTRATION_SCHEMA_VERSION,
	CHAIN_ILLUSTRATION_STYLE_KEY,
	buildGenerationPrompt,
	buildPlannerPrompt,
	buildStylePrompt,
	semanticPlanSchema,
	sha256,
	slugify,
	validateSemanticPlan,
	validateVisualJudge,
	visualJudgePrompt,
	visualJudgeSchema
} from './lib/chain-illustration-pipeline.mjs';
import { loadChainIllustrationCandidates } from './lib/chain-illustration-candidates.mjs';
import {
	createIpadPreview,
	fileSha256,
	hardImageCheck,
	publishChainIllustration
} from './lib/chain-illustration-publisher.mjs';
import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import { d1Query } from './lib/d1-rest.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
loadDefaultEnv(rootDir);

const usage = `Usage:
node scripts/generate-chain-illustrations.mjs [options]

Selects clean D1-backed science chains, runs a semantic evidence gate, generates two
independent 16:9 candidates from the same prompt, judges both, and optionally publishes
the winner to R2 and D1.

Options:
  --subject=all|Biology|Chemistry|Physics
  --chain-id=<answer-chain-id>             repeatable
  --source-document-id=<source-document>   repeatable; considers chains touched by an import
  --max-chains=20
  --work-root=tmp/chain-illustrations/<timestamp>
  --planner-model=gpt-5.6-sol
  --planner-thinking-level=max
  --judge-model=gpt-5.6-sol
  --judge-thinking-level=max
  --image-model=chatgpt-gpt-image-2
  --timeout-ms=7200000
  --image-timeout-ms=7200000
  --publish                                upload passing winners to R2 and D1
  --require                                fail if any accepted chain has no passing winner
  --include-existing                       regenerate even when the source fingerprint is current
  --replace-work-root                      replace a prior sentinel-owned work directory
  --dry-run                                mechanical selection only; no model/image calls
  --help`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const subject = canonicalSubject(stringArg('subject', 'all'));
const chainIds = stringArgs('chain-id');
const sourceDocumentIds = stringArgs('source-document-id');
const maxChains = integerArg('max-chains', 20, 1);
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const workRoot = path.resolve(
	rootDir,
	stringArg('work-root', path.join('tmp/chain-illustrations', runStamp))
);
const plannerModel = stringArg('planner-model', 'gpt-5.6-sol');
const plannerThinkingLevel = stringArg('planner-thinking-level', 'max');
const judgeModel = stringArg('judge-model', 'gpt-5.6-sol');
const judgeThinkingLevel = stringArg('judge-thinking-level', 'max');
const imageModel = stringArg('image-model', 'chatgpt-gpt-image-2');
const timeoutMs = integerArg('timeout-ms', 7_200_000, 1);
const imageTimeoutMs = integerArg('image-timeout-ms', timeoutMs, 1);
const publish = hasArg('publish');
const requireWinners = hasArg('require');
const includeExisting = hasArg('include-existing');
const replaceWorkRoot = hasArg('replace-work-root');
const dryRun = hasArg('dry-run');

if (imageModel !== 'chatgpt-gpt-image-2') {
	throw new Error('The automated pipeline currently supports only chatgpt-gpt-image-2.');
}

const selection = await loadChainIllustrationCandidates({
	rootDir,
	subject,
	chainIds,
	sourceDocumentIds,
	limit: maxChains,
	includeExisting
});
const plan = {
	subject,
	chainIds,
	sourceDocumentIds,
	maxChains,
	workRoot: relative(workRoot),
	plannerModel,
	plannerThinkingLevel,
	judgeModel,
	judgeThinkingLevel,
	imageModel,
	imageTimeoutMs,
	publish,
	requireWinners,
	includeExisting,
	replaceWorkRoot,
	selected: selection.eligible.map(candidateSummary),
	rejectedByMechanicalGate: selection.rejected.map((candidate) => ({
		...candidateSummary(candidate),
		blockers: candidate.mechanicalGate.blockers
	})),
	skippedFresh: selection.skippedFresh.map(candidateSummary)
};

if (dryRun || selection.eligible.length === 0) {
	console.log(
		JSON.stringify(
			{
				status: dryRun ? 'dry-run' : 'passed',
				plan,
				message: selection.eligible.length
					? 'Mechanical candidates are ready for the semantic gate.'
					: 'No eligible chains need illustrations.'
			},
			null,
			2
		)
	);
	process.exit(0);
}

prepareWorkRoot();
if (publish) await demoteStaleIllustrations(selection.eligible);
writeJson(path.join(workRoot, 'selection.json'), { plan, candidates: selection.eligible });
const plannerPrompt = buildPlannerPrompt(selection.eligible);
writeFileSync(path.join(workRoot, 'planner-prompt.md'), plannerPrompt);
const startedAt = new Date().toISOString();
let plannerRun = null;
const jobs = [];

try {
	plannerRun = await runCodexSdkTurn({
		prompt: plannerPrompt,
		workDir: workRoot,
		eventsPath: path.join(workRoot, 'planner-events.jsonl'),
		lastMessagePath: path.join(workRoot, 'planner-last-message.json'),
		summaryPath: path.join(workRoot, 'planner-run-summary.json'),
		model: plannerModel,
		thinkingLevel: plannerThinkingLevel,
		timeoutMs,
		outputSchema: semanticPlanSchema(),
		sandboxMode: 'read-only',
		environmentMode: 'minimal'
	});
	const semanticPlan = parseJsonResponse(plannerRun.finalResponse, 'semantic plan');
	writeJson(path.join(workRoot, 'semantic-plan.json'), semanticPlan);
	const semanticValidation = validateSemanticPlan(selection.eligible, semanticPlan);
	writeJson(path.join(workRoot, 'semantic-plan-validation.json'), semanticValidation);
	if (semanticValidation.status !== 'passed') {
		throw new Error(`Semantic plan failed validation: ${semanticValidation.issues.join(' ')}`);
	}

	for (const decision of semanticPlan.decisions) {
		const candidate = selection.eligible.find((item) => item.id === decision.chainId);
		if (!candidate) continue;
		if (decision.verdict === 'reject') {
			jobs.push({
				chainId: candidate.id,
				status: 'rejected-by-semantic-gate',
				rationale: decision.rationale
			});
			continue;
		}
		jobs.push(await generateJudgeAndMaybePublish(candidate, decision));
	}

	const failedAccepted = jobs.filter(
		(job) => job.status === 'no-passing-candidate' || job.status === 'failed'
	);
	const summary = {
		status: requireWinners && failedAccepted.length ? 'failed' : 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		planner: stripFinalResponse(plannerRun),
		jobs,
		counts: summarizeJobs(jobs)
	};
	writeJson(path.join(workRoot, 'summary.json'), summary);
	console.log(
		JSON.stringify(
			{ ...summary, summaryPath: relative(path.join(workRoot, 'summary.json')) },
			null,
			2
		)
	);
	if (summary.status === 'failed') process.exit(1);
} catch (error) {
	const summary = {
		status: 'failed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		planner: plannerRun ? stripFinalResponse(plannerRun) : null,
		jobs,
		error: error instanceof Error ? error.message : String(error)
	};
	writeJson(path.join(workRoot, 'summary.json'), summary);
	console.error(
		JSON.stringify(
			{ ...summary, summaryPath: relative(path.join(workRoot, 'summary.json')) },
			null,
			2
		)
	);
	process.exit(1);
}

async function generateJudgeAndMaybePublish(candidate, decision) {
	const jobDir = path.join(workRoot, slugify(candidate.id));
	mkdirSync(jobDir, { recursive: true });
	const promptText = buildGenerationPrompt(candidate, decision);
	const stylePrompt = buildStylePrompt(candidate);
	const promptSha256 = sha256(`${stylePrompt}\n\n${promptText}`);
	writeFileSync(path.join(jobDir, 'style-prompt.txt'), `${stylePrompt}\n`);
	writeFileSync(path.join(jobDir, 'image-prompt.txt'), `${promptText}\n`);
	writeJson(path.join(jobDir, 'decision.json'), decision);

	try {
		const generated = await Promise.all(
			['A', 'B'].map((label) => generateImageCandidate({ label, jobDir, stylePrompt, promptText }))
		);
		for (const entry of generated) {
			entry.previewPath = await createIpadPreview(
				entry.filePath,
				path.join(jobDir, `candidate-${entry.label.toLowerCase()}-ipad.webp`),
				{ rootDir }
			);
		}
		const hardEntries = await Promise.all(
			generated.map(async (entry) => [
				entry.label,
				await hardImageCheck(entry.filePath, { rootDir })
			])
		);
		const hardChecks = Object.fromEntries(hardEntries);
		writeJson(path.join(jobDir, 'hard-image-checks.json'), hardChecks);
		if (Object.values(hardChecks).every((check) => check.status !== 'passed')) {
			return {
				chainId: candidate.id,
				status: 'no-passing-candidate',
				stage: 'hard-image-checks',
				hardChecks
			};
		}

		const judgeInput = [
			{ type: 'text', text: visualJudgePrompt(candidate, decision, hardChecks) },
			...generated.map((entry) => ({ type: 'local_image', path: entry.previewPath }))
		];
		const judgeRun = await runCodexSdkTurn({
			prompt: judgeInput,
			workDir: jobDir,
			eventsPath: path.join(jobDir, 'judge-events.jsonl'),
			lastMessagePath: path.join(jobDir, 'judge-last-message.json'),
			summaryPath: path.join(jobDir, 'judge-run-summary.json'),
			model: judgeModel,
			thinkingLevel: judgeThinkingLevel,
			timeoutMs,
			outputSchema: visualJudgeSchema(),
			sandboxMode: 'read-only',
			environmentMode: 'minimal'
		});
		const judge = parseJsonResponse(judgeRun.finalResponse, 'visual judge');
		writeJson(path.join(jobDir, 'judge.json'), judge);
		const judgeValidation = validateVisualJudge(judge, hardChecks);
		writeJson(path.join(jobDir, 'judge-validation.json'), judgeValidation);
		if (judgeValidation.status !== 'passed') {
			throw new Error(`Visual judge failed validation: ${judgeValidation.issues.join(' ')}`);
		}
		if (judge.winner === 'neither') {
			return {
				chainId: candidate.id,
				status: 'no-passing-candidate',
				stage: 'visual-judge',
				judge,
				hardChecks
			};
		}

		const fresh = await loadChainIllustrationCandidates({
			rootDir,
			chainIds: [candidate.id],
			limit: 1,
			includeExisting: true
		});
		const freshCandidate = fresh.eligible.find((item) => item.id === candidate.id);
		if (!freshCandidate || freshCandidate.sourceFingerprint !== candidate.sourceFingerprint) {
			throw new Error(
				'Source evidence changed during generation; refusing to publish a stale image.'
			);
		}

		const winner = generated.find((entry) => entry.label === judge.winner);
		const winnerCheck = hardChecks[judge.winner];
		const fingerprintPrefix = candidate.sourceFingerprint.slice(0, 16);
		const assetSha256 = fileSha256(winner.filePath);
		const assetPrefix = assetSha256.slice(0, 16);
		const chainSlug = slugify(candidate.slug || candidate.id);
		const r2Key = `images/chains/${chainSlug}/${fingerprintPrefix}-${assetPrefix}.webp`;
		const item = {
			id: `chain-illustration-${chainSlug}-${fingerprintPrefix}-${assetPrefix}`,
			answerChainId: candidate.id,
			sourceQuestionId: decision.representativeQuestionId,
			localPath: winner.filePath,
			r2Key,
			publicPath: `/images/${r2Key.replace(/^images\//, '')}`,
			altText: decision.altText,
			caption: decision.caption,
			width: winnerCheck.width,
			height: winnerCheck.height,
			styleKey: CHAIN_ILLUSTRATION_STYLE_KEY,
			sourceFingerprint: candidate.sourceFingerprint,
			assetSha256,
			generationModel: imageModel,
			promptText: `${stylePrompt}\n\n${promptText}`,
			generationMetadata: {
				schemaVersion: CHAIN_ILLUSTRATION_SCHEMA_VERSION,
				generatedBy: 'automated-chain-illustration-pipeline',
				imageModel,
				plannerModel,
				judgeModel,
				promptSha256,
				sourceFingerprint: candidate.sourceFingerprint,
				generatedAt: new Date().toISOString(),
				decision,
				candidates: generated.map((entry) => ({
					label: entry.label,
					mimeType: entry.mimeType,
					sha256: fileSha256(entry.filePath),
					...hardChecks[entry.label]
				})),
				selection: judge
			}
		};
		if (publish) await publishChainIllustration(item, { rootDir });
		const job = {
			chainId: candidate.id,
			status: publish ? 'published' : 'ready',
			winner: judge.winner,
			winnerPath: relative(winner.filePath),
			r2Key,
			publicPath: item.publicPath,
			promptSha256,
			sourceFingerprint: candidate.sourceFingerprint,
			judge,
			hardChecks,
			judgeRun: stripFinalResponse(judgeRun)
		};
		writeJson(path.join(jobDir, 'job.json'), job);
		return job;
	} catch (error) {
		const job = {
			chainId: candidate.id,
			status: 'failed',
			error: error instanceof Error ? error.message : String(error)
		};
		writeJson(path.join(jobDir, 'job.json'), job);
		if (requireWinners) throw error;
		return job;
	}
}

async function generateImageCandidate({ label, jobDir, stylePrompt, promptText }) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), imageTimeoutMs);
	try {
		const images = await generateImages({
			model: imageModel,
			stylePrompt,
			imagePrompts: [promptText],
			imageResolution: '2048x1152',
			imageQuality: 'high',
			outputFormat: 'webp',
			action: 'generate',
			numImages: 1,
			signal: controller.signal
		});
		if (images.length !== 1) {
			throw new Error(`Candidate ${label} returned ${images.length} images.`);
		}
		const filePath = path.join(jobDir, `candidate-${label.toLowerCase()}.webp`);
		writeFileSync(filePath, images[0].data);
		return { label, filePath, mimeType: images[0].mimeType ?? null };
	} finally {
		clearTimeout(timer);
	}
}

async function demoteStaleIllustrations(candidates) {
	for (const candidate of candidates) {
		if (
			!candidate.existingIllustrationId ||
			!candidate.existingSourceFingerprint ||
			candidate.existingSourceFingerprint === candidate.sourceFingerprint
		) {
			continue;
		}
		await d1Query(
			`UPDATE answer_chain_illustrations
			 SET is_primary = 0, status = 'draft', needs_human_review = 1,
			     updated_at = CURRENT_TIMESTAMP
			 WHERE id = ? AND source_fingerprint = ?`,
			[candidate.existingIllustrationId, candidate.existingSourceFingerprint],
			{ rootDir }
		);
	}
}

function prepareWorkRoot() {
	const relativeWorkRoot = path.relative(rootDir, workRoot);
	if (
		!relativeWorkRoot ||
		relativeWorkRoot.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relativeWorkRoot)
	) {
		throw new Error('--work-root must be a dedicated directory inside this repository.');
	}
	const sentinelPath = path.join(workRoot, '.chain-illustration-work-root');
	if (existsSync(workRoot)) {
		if (!existsSync(sentinelPath)) {
			throw new Error(
				`Refusing to replace a work root without the pipeline sentinel: ${relative(workRoot)}`
			);
		}
		if (!replaceWorkRoot) {
			throw new Error(`Work root already exists; pass --replace-work-root: ${relative(workRoot)}`);
		}
		rmSync(workRoot, { recursive: true, force: true });
	}
	mkdirSync(workRoot, { recursive: true });
	writeFileSync(sentinelPath, `${CHAIN_ILLUSTRATION_SCHEMA_VERSION}\n`);
}

function parseJsonResponse(value, label) {
	try {
		return JSON.parse(value);
	} catch (error) {
		throw new Error(
			`${label} did not return valid JSON: ${error instanceof Error ? error.message : error}`
		);
	}
}

function candidateSummary(candidate) {
	return {
		id: candidate.id,
		subjectArea: candidate.subjectArea,
		title: candidate.title,
		steps: candidate.steps.length,
		questions: candidate.members.length,
		papers: new Set(candidate.members.map((member) => member.sourceDocumentId)).size,
		sourceFingerprint: candidate.sourceFingerprint
	};
}

function summarizeJobs(rows) {
	return rows.reduce((counts, row) => {
		counts[row.status] = (counts[row.status] ?? 0) + 1;
		return counts;
	}, {});
}

function stripFinalResponse(run) {
	const { finalResponse: _finalResponse, ...summary } = run;
	return summary;
}

function canonicalSubject(value) {
	const normalized = String(value ?? '')
		.trim()
		.toLowerCase();
	if (!normalized || normalized === 'all') return 'all';
	if (normalized === 'biology') return 'Biology';
	if (normalized === 'chemistry') return 'Chemistry';
	if (normalized === 'physics') return 'Physics';
	throw new Error('--subject must be all, Biology, Chemistry, or Physics.');
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
		.map((candidate) => candidate.slice(prefix.length))
		.filter(Boolean);
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
