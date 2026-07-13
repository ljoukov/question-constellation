#!/usr/bin/env node

import { generateImages } from '@ljoukov/llm';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	CHAIN_ILLUSTRATION_SCHEMA_VERSION,
	CHAIN_ILLUSTRATION_STYLE_KEY,
	buildGenerationPrompt,
	buildLightEditPrompt,
	buildLightEditStylePrompt,
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
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
loadDefaultEnv(rootDir);

const usage = `Usage:
node scripts/generate-chain-illustrations.mjs [options]

Selects clean D1-backed science chains, runs a semantic evidence gate, generates one dark
16:9 illustration, edits that exact image into a composition-matched light sibling, validates
both theme variants, and optionally publishes the pair to R2 and D1.

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
  --publish                                upload passing dark/light pairs to R2 and D1
  --require                                fail if any accepted chain has no passing pair
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
const requirePairs = hasArg('require');
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
	requirePairs,
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
		jobs.push(await generateValidateAndMaybePublish(candidate, decision));
	}

	const failedAccepted = jobs.filter(
		(job) => job.status === 'no-passing-pair' || job.status === 'failed'
	);
	const summary = {
		status: requirePairs && failedAccepted.length ? 'failed' : 'passed',
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

async function generateValidateAndMaybePublish(candidate, decision) {
	const jobDir = path.join(workRoot, slugify(candidate.id));
	mkdirSync(jobDir, { recursive: true });
	const darkPromptText = buildGenerationPrompt(candidate, decision);
	const darkStylePrompt = buildStylePrompt(candidate);
	const lightPromptText = buildLightEditPrompt(candidate, decision);
	const lightStylePrompt = buildLightEditStylePrompt(candidate);
	const darkPromptSha256 = sha256(`${darkStylePrompt}\n\n${darkPromptText}`);
	const lightPromptSha256 = sha256(`${lightStylePrompt}\n\n${lightPromptText}`);
	const promptSha256 = sha256(`${darkPromptSha256}\n${lightPromptSha256}`);
	writeFileSync(path.join(jobDir, 'dark-style-prompt.txt'), `${darkStylePrompt}\n`);
	writeFileSync(path.join(jobDir, 'dark-image-prompt.txt'), `${darkPromptText}\n`);
	writeFileSync(path.join(jobDir, 'light-style-prompt.txt'), `${lightStylePrompt}\n`);
	writeFileSync(path.join(jobDir, 'light-edit-prompt.txt'), `${lightPromptText}\n`);
	writeJson(path.join(jobDir, 'decision.json'), decision);

	try {
		const dark = await generateDarkIllustration({
			jobDir,
			stylePrompt: darkStylePrompt,
			promptText: darkPromptText
		});
		const light = await generateLightIllustration({
			dark,
			jobDir,
			stylePrompt: lightStylePrompt,
			promptText: lightPromptText
		});
		const generated = [dark, light];
		for (const entry of generated) {
			entry.previewPath = await createIpadPreview(
				entry.filePath,
				path.join(jobDir, `${entry.theme}-ipad.webp`),
				{ rootDir }
			);
		}
		const hardEntries = await Promise.all(
			generated.map(async (entry) => [
				entry.theme,
				await hardImageCheck(entry.filePath, { rootDir })
			])
		);
		const hardChecks = Object.fromEntries(hardEntries);
		if (
			hardChecks.dark.status === 'passed' &&
			hardChecks.light.status === 'passed' &&
			(hardChecks.dark.width !== hardChecks.light.width ||
				hardChecks.dark.height !== hardChecks.light.height)
		) {
			hardChecks.light = {
				...hardChecks.light,
				status: 'failed',
				issues: [
					...hardChecks.light.issues,
					`Light edit dimensions ${hardChecks.light.width}x${hardChecks.light.height} do not match dark original ${hardChecks.dark.width}x${hardChecks.dark.height}.`
				]
			};
		}
		if (
			hardChecks.dark.status === 'passed' &&
			hardChecks.light.status === 'passed' &&
			hardChecks.dark.sha256 === hardChecks.light.sha256
		) {
			hardChecks.light = {
				...hardChecks.light,
				status: 'failed',
				issues: [...hardChecks.light.issues, 'Light edit is byte-identical to the dark original.']
			};
		}
		writeJson(path.join(jobDir, 'hard-image-checks.json'), hardChecks);
		if (Object.values(hardChecks).some((check) => check.status !== 'passed')) {
			return {
				chainId: candidate.id,
				status: 'no-passing-pair',
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
		const judgeValidation = validateVisualJudge(judge, hardChecks, decision.visualSteps);
		writeJson(path.join(jobDir, 'judge-validation.json'), judgeValidation);
		if (judgeValidation.status !== 'passed') {
			throw new Error(`Visual judge failed validation: ${judgeValidation.issues.join(' ')}`);
		}
		if (!judge.pass) {
			return {
				chainId: candidate.id,
				status: 'no-passing-pair',
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

		const fingerprintPrefix = candidate.sourceFingerprint.slice(0, 16);
		const darkAssetSha256 = fileSha256(dark.filePath);
		const lightAssetSha256 = fileSha256(light.filePath);
		const pairAssetPrefix = sha256(`${darkAssetSha256}\n${lightAssetSha256}`).slice(0, 16);
		const chainSlug = slugify(candidate.slug || candidate.id);
		const darkR2Key = `images/chains/${chainSlug}/${fingerprintPrefix}-${darkAssetSha256.slice(0, 16)}-dark.webp`;
		const lightR2Key = `images/chains/${chainSlug}/${fingerprintPrefix}-${lightAssetSha256.slice(0, 16)}-light.webp`;
		const item = {
			id: `chain-illustration-${chainSlug}-${fingerprintPrefix}-${pairAssetPrefix}`,
			answerChainId: candidate.id,
			sourceQuestionId: decision.representativeQuestionId,
			altText: decision.altText,
			caption: decision.caption,
			styleKey: CHAIN_ILLUSTRATION_STYLE_KEY,
			sourceFingerprint: candidate.sourceFingerprint,
			generationModel: imageModel,
			dark: {
				localPath: dark.filePath,
				r2Key: darkR2Key,
				publicPath: `/images/${darkR2Key.replace(/^images\//, '')}`,
				width: hardChecks.dark.width,
				height: hardChecks.dark.height,
				assetSha256: darkAssetSha256,
				promptText: `${darkStylePrompt}\n\n${darkPromptText}`,
				promptSha256: darkPromptSha256
			},
			light: {
				localPath: light.filePath,
				r2Key: lightR2Key,
				publicPath: `/images/${lightR2Key.replace(/^images\//, '')}`,
				width: hardChecks.light.width,
				height: hardChecks.light.height,
				assetSha256: lightAssetSha256,
				promptText: `${lightStylePrompt}\n\n${lightPromptText}`,
				promptSha256: lightPromptSha256,
				derivedFromAssetSha256: darkAssetSha256
			},
			generationMetadata: {
				schemaVersion: CHAIN_ILLUSTRATION_SCHEMA_VERSION,
				generatedBy: 'automated-chain-illustration-pipeline',
				imageModel,
				plannerModel,
				judgeModel,
				promptSha256,
				prompts: {
					dark: {
						stylePrompt: darkStylePrompt,
						instructionPrompt: darkPromptText,
						sha256: darkPromptSha256
					},
					light: {
						stylePrompt: lightStylePrompt,
						instructionPrompt: lightPromptText,
						sha256: lightPromptSha256
					}
				},
				sourceFingerprint: candidate.sourceFingerprint,
				generatedAt: new Date().toISOString(),
				decision,
				variants: generated.map((entry) => ({
					theme: entry.theme,
					mimeType: entry.mimeType,
					sha256: fileSha256(entry.filePath),
					action: entry.action,
					...hardChecks[entry.theme]
				})),
				validation: judge
			}
		};
		if (publish) await publishChainIllustration(item, { rootDir });
		const job = {
			chainId: candidate.id,
			status: publish ? 'published' : 'ready',
			variants: {
				dark: {
					path: relative(dark.filePath),
					r2Key: darkR2Key,
					publicPath: item.dark.publicPath
				},
				light: {
					path: relative(light.filePath),
					r2Key: lightR2Key,
					publicPath: item.light.publicPath
				}
			},
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
		if (requirePairs) throw error;
		return job;
	}
}

async function generateDarkIllustration({ jobDir, stylePrompt, promptText }) {
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
			throw new Error(`Dark generation returned ${images.length} images.`);
		}
		const filePath = path.join(jobDir, 'dark.webp');
		writeFileSync(filePath, images[0].data);
		return {
			theme: 'dark',
			action: 'generate',
			filePath,
			mimeType: images[0].mimeType ?? 'image/webp'
		};
	} finally {
		clearTimeout(timer);
	}
}

async function generateLightIllustration({ dark, jobDir, stylePrompt, promptText }) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), imageTimeoutMs);
	try {
		const images = await generateImages({
			model: imageModel,
			stylePrompt,
			styleImages: [
				{
					data: readFileSync(dark.filePath),
					mimeType: dark.mimeType ?? 'image/webp'
				}
			],
			imagePrompts: [promptText],
			imageResolution: '2048x1152',
			imageQuality: 'high',
			outputFormat: 'webp',
			action: 'edit',
			numImages: 1,
			signal: controller.signal
		});
		if (images.length !== 1) {
			throw new Error(`Light edit returned ${images.length} images.`);
		}
		const filePath = path.join(jobDir, 'light.webp');
		writeFileSync(filePath, images[0].data);
		return {
			theme: 'light',
			action: 'edit',
			filePath,
			mimeType: images[0].mimeType ?? 'image/webp'
		};
	} finally {
		clearTimeout(timer);
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
			`${label} did not return valid JSON: ${error instanceof Error ? error.message : error}`,
			{ cause: error }
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
	return Object.fromEntries(Object.entries(run).filter(([key]) => key !== 'finalResponse'));
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
