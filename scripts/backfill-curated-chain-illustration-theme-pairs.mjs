#!/usr/bin/env node

import { generateImages } from '@ljoukov/llm';
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
	CHAIN_ILLUSTRATION_SCHEMA_VERSION,
	buildLightEditPrompt,
	buildLightEditStylePrompt,
	sha256,
	slugify,
	validateVisualJudge,
	visualJudgePrompt,
	visualJudgeSchema
} from './lib/chain-illustration-pipeline.mjs';
import { loadChainIllustrationCandidates } from './lib/chain-illustration-candidates.mjs';
import {
	APPROVED_CURATED_CHAIN_IDS,
	curatedDecisionFor,
	parseLightFileArgs,
	selectApprovedManifestEntries,
	validateCuratedJudgeCoverage,
	validateHistoricalBaselineWaiver,
	validateHistoricalPrompt
} from './lib/curated-chain-illustration-backfill.mjs';
import {
	createIpadPreview,
	fileSha256,
	hardImageCheck,
	imageDimensions,
	publishChainIllustration
} from './lib/chain-illustration-publisher.mjs';
import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
loadDefaultEnv(rootDir);

const usage = `Usage:
node scripts/backfill-curated-chain-illustration-theme-pairs.mjs [options]

Preserves the approved historical dark illustration byte-for-byte, creates only a strict
light-mode edit, judges the complete pair, and optionally publishes the pair to R2 and D1.
This command is hard-limited to the three historical calibration chains and has no broad default.

Required:
  --chain-id=<approved-chain-id>           repeatable; at least one is mandatory

Options:
  --manifest=docs/chain-illustrations/manifest.json
  --light-file=<chain-id>=<path>           use a supplied light edit instead of calling the image model
  --work-root=tmp/curated-chain-illustration-backfill/<timestamp>
  --image-model=chatgpt-gpt-image-2
  --judge-model=gpt-5.6-sol
  --judge-thinking-level=max
  --timeout-ms=7200000
  --image-timeout-ms=7200000
  --publish                                publish only after every selected pair passes
  --require                                fail when any selected pair does not pass
  --reuse-existing-judges                 reuse matching audited pairs in the explicit work root
  --replace-work-root                      replace a prior sentinel-owned work directory
  --dry-run                                validate selection, D1 evidence and approved dark files only
  --help

Approved chain IDs:
${APPROVED_CURATED_CHAIN_IDS.map((id) => `  ${id}`).join('\n')}`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const chainIds = stringArgs('chain-id');
const lightFiles = parseLightFileArgs(stringArgs('light-file'));
const manifestPath = resolveProjectPath(
	stringArg('manifest', 'docs/chain-illustrations/manifest.json'),
	'--manifest'
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entries = selectApprovedManifestEntries(manifest, chainIds);
for (const lightChainId of lightFiles.keys()) {
	if (!chainIds.includes(lightChainId)) {
		throw new Error(`--light-file was supplied for unselected chain ${lightChainId}.`);
	}
}

const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const workRoot = path.resolve(
	rootDir,
	stringArg('work-root', path.join('tmp/curated-chain-illustration-backfill', runStamp))
);
const imageModel = stringArg('image-model', 'chatgpt-gpt-image-2');
const judgeModel = stringArg('judge-model', 'gpt-5.6-sol');
const judgeThinkingLevel = stringArg('judge-thinking-level', 'max');
const timeoutMs = integerArg('timeout-ms', 7_200_000, 1);
const imageTimeoutMs = integerArg('image-timeout-ms', timeoutMs, 1);
const publish = hasArg('publish');
const requirePairs = hasArg('require');
const reuseExistingJudges = hasArg('reuse-existing-judges');
const replaceWorkRoot = hasArg('replace-work-root');
const dryRun = hasArg('dry-run');

if (reuseExistingJudges && replaceWorkRoot) {
	throw new Error('--reuse-existing-judges cannot be combined with --replace-work-root.');
}
if (reuseExistingJudges && !process.argv.some((arg) => arg.startsWith('--work-root='))) {
	throw new Error('--reuse-existing-judges requires an explicit --work-root.');
}

if (imageModel !== 'chatgpt-gpt-image-2') {
	throw new Error('The curated edit flow supports only chatgpt-gpt-image-2.');
}

const selection = await loadChainIllustrationCandidates({
	rootDir,
	chainIds,
	limit: chainIds.length,
	includeExisting: true
});
const candidates = chainIds.map((chainId) => {
	const candidate = selection.eligible.find((item) => item.id === chainId);
	if (candidate) return candidate;
	const rejected = selection.rejected.find((item) => item.id === chainId);
	if (rejected) {
		throw new Error(
			`${chainId} no longer passes the mechanical evidence gate: ${rejected.mechanicalGate.blockers.join(' ')}`
		);
	}
	throw new Error(`${chainId} is not a current published D1 chain.`);
});

const prepared = await Promise.all(
	entries.map(async (entry) => {
		const candidate = candidates.find((item) => item.id === entry.answerChainId);
		const decision = curatedDecisionFor(entry, candidate);
		const darkSourcePath = resolveProjectPath(entry.localPath, `${entry.answerChainId} dark asset`);
		const historicalPromptPath = resolveProjectPath(
			entry.promptPath,
			`${entry.answerChainId} historical prompt`
		);
		const historicalPrompt = readFileSync(historicalPromptPath, 'utf8').trim();
		const promptValidation = validateHistoricalPrompt(historicalPrompt, decision);
		if (promptValidation.status !== 'passed') {
			throw new Error(
				`${entry.answerChainId} historical prompt failed validation: ${promptValidation.issues.join(' ')}`
			);
		}
		const hardCheck = await hardImageCheck(darkSourcePath, { rootDir });
		if (hardCheck.status !== 'passed') {
			throw new Error(
				`${entry.answerChainId} approved dark failed image checks: ${hardCheck.issues.join(' ')}`
			);
		}
		if (hardCheck.width !== entry.width || hardCheck.height !== entry.height) {
			throw new Error(
				`${entry.answerChainId} approved dark is ${hardCheck.width}x${hardCheck.height}, not manifest ${entry.width}x${entry.height}.`
			);
		}
		if (hardCheck.sha256 !== entry.assetSha256) {
			throw new Error(
				`${entry.answerChainId} approved dark SHA-256 changed; refusing to backfill an unreviewed replacement.`
			);
		}
		return {
			entry,
			candidate,
			decision,
			darkSourcePath,
			darkSourceSha256: hardCheck.sha256,
			historicalPrompt,
			historicalPromptPath
		};
	})
);

const suppliedLightPreflight = new Map();
for (const [chainId, suppliedPath] of lightFiles) {
	const sourcePath = path.resolve(rootDir, suppliedPath);
	if (!existsSync(sourcePath))
		throw new Error(`Supplied light file does not exist: ${suppliedPath}`);
	const dimensions = await imageDimensions(sourcePath, { rootDir });
	if (
		dimensions.width < 1536 ||
		dimensions.height < 864 ||
		Math.abs(dimensions.width / dimensions.height - 16 / 9) > 0.015
	) {
		throw new Error(`${chainId} supplied light must be a high-resolution 16:9 landscape image.`);
	}
	const suppliedSha256 = fileSha256(sourcePath);
	const manifestEntry = entries.find((entry) => entry.answerChainId === chainId);
	if (manifestEntry?.lightAssetSha256 && suppliedSha256 !== manifestEntry.lightAssetSha256) {
		throw new Error(
			`${chainId} supplied light SHA-256 does not match the reviewed manifest asset.`
		);
	}
	suppliedLightPreflight.set(chainId, {
		path: suppliedPath,
		format: dimensions.format,
		width: dimensions.width,
		height: dimensions.height,
		sha256: suppliedSha256
	});
}

const plan = {
	status: dryRun ? 'validated' : 'ready',
	manifest: relative(manifestPath),
	chainIds,
	workRoot: relative(workRoot),
	imageModel,
	judgeModel,
	judgeThinkingLevel,
	reuseExistingJudges,
	publish,
	requirePairs,
	selected: prepared.map((item) => ({
		chainId: item.candidate.id,
		subjectArea: item.candidate.subjectArea,
		sourceFingerprint: item.candidate.sourceFingerprint,
		darkPath: relative(item.darkSourcePath),
		darkSha256: item.darkSourceSha256,
		lightInput: suppliedLightPreflight.get(item.candidate.id) ?? 'generate strict edit'
	}))
};

if (dryRun) {
	console.log(JSON.stringify(plan, null, 2));
	process.exit(0);
}

prepareWorkRoot();
writeJson(path.join(workRoot, 'selection.json'), plan);
const startedAt = new Date().toISOString();
const jobs = [];

for (const preparedItem of prepared) {
	jobs.push(await buildAndJudgePair(preparedItem));
}

const readyJobs = jobs.filter((job) => job.status === 'ready');
const allReady = readyJobs.length === jobs.length;
if (publish && !allReady) {
	for (const job of readyJobs) job.status = 'withheld-because-cohort-failed';
}

if (publish && allReady) {
	const fresh = await loadChainIllustrationCandidates({
		rootDir,
		chainIds,
		limit: chainIds.length,
		includeExisting: true
	});
	for (const job of readyJobs) {
		const current = fresh.eligible.find((item) => item.id === job.chainId);
		if (!current || current.sourceFingerprint !== job.sourceFingerprint) {
			throw new Error(
				`${job.chainId} source evidence changed during editing; no selected pair was published.`
			);
		}
	}
	// R2 receives both immutable assets before one D1 upsert promotes the complete pair. A failed
	// upload can leave only an unreachable immutable object; it can never expose a half-pair.
	for (const job of readyJobs) {
		await publishChainIllustration(job.publishItem, { rootDir });
		job.status = 'published';
		writeJson(path.join(job.jobDir, 'job.json'), serializableJob(job));
	}
}

const failed = jobs.filter((job) => !['ready', 'published'].includes(job.status));
const summaryStatus =
	(publish && !allReady) || ((publish || requirePairs) && failed.length) ? 'failed' : 'passed';
const summary = {
	status: summaryStatus,
	startedAt,
	finishedAt: new Date().toISOString(),
	plan,
	jobs: jobs.map(serializableJob)
};
writeJson(path.join(workRoot, 'summary.json'), summary);
console.log(
	JSON.stringify(
		{ ...summary, summaryPath: relative(path.join(workRoot, 'summary.json')) },
		null,
		2
	)
);
if (summaryStatus === 'failed') process.exit(1);

async function buildAndJudgePair(preparedItem) {
	const { entry, candidate, decision, darkSourcePath, darkSourceSha256, historicalPrompt } =
		preparedItem;
	const jobDir = path.join(workRoot, slugify(candidate.id));
	mkdirSync(jobDir, { recursive: true });
	const priorDecision = reuseExistingJudges
		? readRequiredJson(path.join(jobDir, 'decision.json'), `${candidate.id} prior decision`)
		: null;
	const priorHardChecks = reuseExistingJudges
		? readRequiredJson(
				path.join(jobDir, 'hard-image-checks.json'),
				`${candidate.id} prior hard checks`
			)
		: null;
	if (priorDecision && sha256(JSON.stringify(priorDecision)) !== sha256(JSON.stringify(decision))) {
		throw new Error(`${candidate.id} visual decision changed; refusing to reuse its judge.`);
	}
	const darkPath = path.join(jobDir, 'dark.webp');
	copyFileSync(darkSourcePath, darkPath);
	if (fileSha256(darkPath) !== darkSourceSha256) {
		throw new Error(`${candidate.id} approved dark changed while it was copied.`);
	}

	const lightStylePrompt = buildLightEditStylePrompt(candidate);
	const lightPrompt = buildLightEditPrompt(candidate, decision);
	writeFileSync(path.join(jobDir, 'historical-dark-prompt.txt'), `${historicalPrompt}\n`);
	writeFileSync(path.join(jobDir, 'light-style-prompt.txt'), `${lightStylePrompt}\n`);
	writeFileSync(path.join(jobDir, 'light-edit-prompt.txt'), `${lightPrompt}\n`);
	writeJson(path.join(jobDir, 'decision.json'), decision);

	try {
		const suppliedLightPath = lightFiles.get(candidate.id);
		const light = suppliedLightPath
			? await importSuppliedLight({ suppliedLightPath, darkPath, jobDir })
			: await generateLightEdit({ darkPath, jobDir, lightStylePrompt, lightPrompt });
		const dark = {
			theme: 'dark',
			action: 'preserve-approved-historical-asset',
			filePath: darkPath,
			mimeType: 'image/webp'
		};
		for (const variant of [dark, light]) {
			variant.previewPath = await createIpadPreview(
				variant.filePath,
				path.join(jobDir, `${variant.theme}-ipad.webp`),
				{ rootDir }
			);
		}
		const hardChecks = {
			dark: await hardImageCheck(dark.filePath, { rootDir }),
			light: await hardImageCheck(light.filePath, { rootDir })
		};
		if (hardChecks.dark.sha256 !== darkSourceSha256) {
			hardChecks.dark = {
				...hardChecks.dark,
				status: 'failed',
				issues: [...hardChecks.dark.issues, 'Approved dark bytes were not preserved.']
			};
		}
		if (
			hardChecks.dark.width !== hardChecks.light.width ||
			hardChecks.dark.height !== hardChecks.light.height
		) {
			hardChecks.light = {
				...hardChecks.light,
				status: 'failed',
				issues: [
					...hardChecks.light.issues,
					'Light edit dimensions do not match the approved dark exactly.'
				]
			};
		}
		if (hardChecks.dark.sha256 === hardChecks.light.sha256) {
			hardChecks.light = {
				...hardChecks.light,
				status: 'failed',
				issues: [...hardChecks.light.issues, 'Light edit is byte-identical to the approved dark.']
			};
		}
		if (
			priorHardChecks &&
			(priorHardChecks.dark?.sha256 !== hardChecks.dark.sha256 ||
				priorHardChecks.light?.sha256 !== hardChecks.light.sha256)
		) {
			throw new Error(`${candidate.id} image bytes changed; refusing to reuse its judge.`);
		}
		writeJson(path.join(jobDir, 'hard-image-checks.json'), hardChecks);
		if (Object.values(hardChecks).some((check) => check.status !== 'passed')) {
			const job = {
				chainId: candidate.id,
				status: 'no-passing-pair',
				stage: 'hard-image-checks',
				jobDir,
				hardChecks
			};
			writeJson(path.join(jobDir, 'job.json'), serializableJob(job));
			return job;
		}

		let judgeRun;
		let judge;
		if (reuseExistingJudges) {
			judge = readRequiredJson(path.join(jobDir, 'judge.json'), `${candidate.id} prior judge`);
			judgeRun = {
				...readRequiredJson(
					path.join(jobDir, 'judge-run-summary.json'),
					`${candidate.id} prior judge summary`
				),
				reused: true
			};
		} else {
			judgeRun = await runCodexSdkTurn({
				prompt: [
					{ type: 'text', text: visualJudgePrompt(candidate, decision, hardChecks) },
					{ type: 'local_image', path: dark.previewPath },
					{ type: 'local_image', path: light.previewPath }
				],
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
			judge = parseJsonResponse(judgeRun.finalResponse, `${candidate.id} visual judge`);
			writeJson(path.join(jobDir, 'judge.json'), judge);
		}
		const judgeValidation = validateVisualJudge(judge, hardChecks, decision.visualSteps);
		const coverageValidation = validateCuratedJudgeCoverage(judge, decision);
		if (coverageValidation.status !== 'passed') {
			judgeValidation.status = 'failed';
			judgeValidation.issues.push(...coverageValidation.issues);
		}
		writeJson(path.join(jobDir, 'judge-validation.json'), judgeValidation);
		if (judgeValidation.status !== 'passed') {
			throw new Error(`Visual judge returned invalid QA: ${judgeValidation.issues.join(' ')}`);
		}
		const historicalBaselineWaiver = judge.pass
			? { status: 'not-needed', issues: [], inheritedDefects: [] }
			: validateHistoricalBaselineWaiver(judge);
		writeJson(path.join(jobDir, 'historical-baseline-waiver.json'), historicalBaselineWaiver);
		if (!judge.pass && historicalBaselineWaiver.status !== 'passed') {
			const job = {
				chainId: candidate.id,
				status: 'no-passing-pair',
				stage: 'visual-judge',
				jobDir,
				judge,
				historicalBaselineWaiver,
				hardChecks
			};
			writeJson(path.join(jobDir, 'job.json'), serializableJob(job));
			return job;
		}

		const darkAssetSha256 = hardChecks.dark.sha256;
		const lightAssetSha256 = hardChecks.light.sha256;
		const fingerprintPrefix = candidate.sourceFingerprint.slice(0, 16);
		const pairAssetPrefix = sha256(`${darkAssetSha256}\n${lightAssetSha256}`).slice(0, 16);
		const chainSlug = slugify(candidate.slug || candidate.id);
		const darkR2Key = `images/chains/${chainSlug}/${fingerprintPrefix}-${darkAssetSha256.slice(0, 16)}-dark.webp`;
		const lightR2Key = `images/chains/${chainSlug}/${fingerprintPrefix}-${lightAssetSha256.slice(0, 16)}-light.webp`;
		const darkPromptSha256 = sha256(historicalPrompt);
		const lightValidationPrompt = `${lightStylePrompt}\n\n${lightPrompt}`;
		const lightPromptText =
			light.action === 'provided-edit'
				? readFileSync(
						resolveProjectPath(entry.lightPromptPath, `${candidate.id} supplied light prompt`),
						'utf8'
					).trim()
				: lightValidationPrompt;
		const lightPromptSha256 = sha256(lightPromptText);
		const lightValidationPromptSha256 = sha256(lightValidationPrompt);
		const publishItem = {
			id: `chain-illustration-${chainSlug}-${fingerprintPrefix}-${pairAssetPrefix}`,
			answerChainId: candidate.id,
			sourceQuestionId: entry.sourceQuestionId,
			altText: entry.altText,
			caption: entry.caption,
			styleKey: manifest.styleKey,
			sourceFingerprint: candidate.sourceFingerprint,
			generationModel:
				light.action === 'edit' ? imageModel : entry.lightGenerationModel || 'provided-light-edit',
			dark: {
				localPath: dark.filePath,
				r2Key: darkR2Key,
				publicPath: publicPathFor(darkR2Key),
				width: hardChecks.dark.width,
				height: hardChecks.dark.height,
				assetSha256: darkAssetSha256,
				promptText: historicalPrompt,
				promptSha256: darkPromptSha256
			},
			light: {
				localPath: light.filePath,
				r2Key: lightR2Key,
				publicPath: publicPathFor(lightR2Key),
				width: hardChecks.light.width,
				height: hardChecks.light.height,
				assetSha256: lightAssetSha256,
				promptText: lightPromptText,
				promptSha256: lightPromptSha256,
				derivedFromAssetSha256: darkAssetSha256
			},
			generationMetadata: {
				schemaVersion: CHAIN_ILLUSTRATION_SCHEMA_VERSION,
				generatedBy: 'curated-historical-dark-theme-backfill',
				manifestVersion: manifest.version,
				manifestIllustrationId: entry.id,
				selectedCandidate: entry.selectedCandidate,
				selectionRationale: entry.selectionRationale,
				darkAction: dark.action,
				lightAction: light.action,
				imageModel:
					light.action === 'edit'
						? imageModel
						: entry.lightGenerationModel || 'provided-light-edit',
				judgeModel,
				sourceFingerprint: candidate.sourceFingerprint,
				darkPromptSha256,
				lightPromptSha256,
				lightValidationPromptSha256,
				prompts: {
					dark: { promptText: historicalPrompt, sha256: darkPromptSha256 },
					light: {
						promptText: lightPromptText,
						sha256: lightPromptSha256,
						validationPrompt: lightValidationPrompt,
						validationSha256: lightValidationPromptSha256
					}
				},
				decision,
				validation: judge,
				historicalBaselineWaiver,
				variants: [
					{ theme: 'dark', action: dark.action, ...hardChecks.dark },
					{ theme: 'light', action: light.action, ...hardChecks.light }
				]
			}
		};
		const job = {
			chainId: candidate.id,
			status: 'ready',
			jobDir,
			sourceFingerprint: candidate.sourceFingerprint,
			variants: {
				dark: { path: relative(dark.filePath), r2Key: darkR2Key },
				light: { path: relative(light.filePath), r2Key: lightR2Key }
			},
			hardChecks,
			judge,
			historicalBaselineWaiver,
			judgeRun: stripFinalResponse(judgeRun),
			publishItem
		};
		writeJson(path.join(jobDir, 'job.json'), serializableJob(job));
		return job;
	} catch (error) {
		const job = {
			chainId: candidate.id,
			status: 'failed',
			jobDir,
			error: error instanceof Error ? error.message : String(error)
		};
		writeJson(path.join(jobDir, 'job.json'), serializableJob(job));
		return job;
	}
}

async function generateLightEdit({ darkPath, jobDir, lightStylePrompt, lightPrompt }) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), imageTimeoutMs);
	try {
		const images = await generateImages({
			model: imageModel,
			stylePrompt: lightStylePrompt,
			styleImages: [{ data: readFileSync(darkPath), mimeType: 'image/webp' }],
			imagePrompts: [lightPrompt],
			imageResolution: '2048x1152',
			imageQuality: 'high',
			outputFormat: 'webp',
			action: 'edit',
			numImages: 1,
			signal: controller.signal
		});
		if (images.length !== 1) throw new Error(`Light edit returned ${images.length} images.`);
		const generatedPath = path.join(jobDir, 'light-generated.webp');
		writeFileSync(generatedPath, images[0].data);
		const filePath = path.join(jobDir, 'light.webp');
		await normalizeLightDimensions(generatedPath, darkPath, filePath);
		return {
			theme: 'light',
			action: 'edit',
			filePath,
			mimeType: 'image/webp'
		};
	} finally {
		clearTimeout(timer);
	}
}

async function importSuppliedLight({ suppliedLightPath, darkPath, jobDir }) {
	const sourcePath = path.resolve(rootDir, suppliedLightPath);
	if (!existsSync(sourcePath))
		throw new Error(`Supplied light file does not exist: ${suppliedLightPath}`);
	const filePath = path.join(jobDir, 'light.webp');
	await normalizeLightDimensions(sourcePath, darkPath, filePath);
	return {
		theme: 'light',
		action: 'provided-edit',
		filePath,
		mimeType: 'image/webp',
		sourcePath
	};
}

async function normalizeLightDimensions(sourcePath, darkPath, outputPath) {
	const [source, dark] = await Promise.all([
		imageDimensions(sourcePath, { rootDir }),
		imageDimensions(darkPath, { rootDir })
	]);
	if (source.format === 'WEBP' && source.width === dark.width && source.height === dark.height) {
		copyFileSync(sourcePath, outputPath);
		return;
	}
	await execFileAsync(
		'convert',
		[
			sourcePath,
			'-auto-orient',
			'-resize',
			`${dark.width}x${dark.height}!`,
			'-quality',
			'95',
			outputPath
		],
		{ cwd: rootDir, maxBuffer: 4 * 1024 * 1024 }
	);
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
	const sentinelPath = path.join(workRoot, '.curated-chain-illustration-backfill');
	if (existsSync(workRoot)) {
		if (!existsSync(sentinelPath)) {
			throw new Error(`Refusing to replace a work root without the curated-backfill sentinel.`);
		}
		if (reuseExistingJudges) return;
		if (!replaceWorkRoot) {
			throw new Error(`Work root already exists; pass --replace-work-root: ${relative(workRoot)}`);
		}
		rmSync(workRoot, { recursive: true, force: true });
	}
	mkdirSync(workRoot, { recursive: true });
	writeFileSync(sentinelPath, `${CHAIN_ILLUSTRATION_SCHEMA_VERSION}\n`);
}

function resolveProjectPath(value, label) {
	const resolved = path.resolve(rootDir, String(value ?? ''));
	if (resolved !== rootDir && !resolved.startsWith(`${rootDir}${path.sep}`)) {
		throw new Error(`${label} must stay inside this repository.`);
	}
	if (!existsSync(resolved)) throw new Error(`${label} does not exist: ${value}`);
	return resolved;
}

function readRequiredJson(filePath, label) {
	if (!existsSync(filePath)) throw new Error(`${label} does not exist.`);
	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch (error) {
		throw new Error(
			`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
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

function serializableJob(job) {
	const result = { ...job };
	delete result.publishItem;
	result.jobDir = job.jobDir ? relative(job.jobDir) : undefined;
	return result;
}

function stripFinalResponse(run) {
	const summary = { ...run };
	delete summary.finalResponse;
	return summary;
}

function publicPathFor(r2Key) {
	return `/images/${r2Key.replace(/^images\//, '')}`;
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
