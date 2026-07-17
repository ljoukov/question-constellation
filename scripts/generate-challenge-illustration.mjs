#!/usr/bin/env node

import { generateImages } from '@ljoukov/llm';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
	darkVisualJudgePrompt,
	darkVisualJudgeSchema,
	lightEditJudgePrompt,
	lightEditJudgeSchema,
	sha256,
	validateDarkVisualJudge,
	validateLightEditJudge
} from './lib/chain-illustration-pipeline.mjs';
import {
	CHALLENGE_ILLUSTRATION_IMAGE_MODEL,
	CHALLENGE_ILLUSTRATION_JOB_VERSION,
	buildChallengeDarkRetryPrompt,
	buildChallengeLightRetryPrompt,
	buildChallengePromptBundle,
	buildChallengeRunPlan,
	challengeUsageJudgePrompt,
	challengeUsageJudgeSchema,
	validateChallengeIllustrationSpec,
	validateChallengeUsageJudge
} from './lib/challenge-illustration-pipeline.mjs';
import {
	createIpadPreview,
	fileSha256,
	hardImageCheck
} from './lib/chain-illustration-publisher.mjs';
import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
loadDefaultEnv(rootDir);

const usage = [
	'Usage:',
	'  node scripts/generate-challenge-illustration.mjs generate --spec=<spec.json> [options]',
	'  node scripts/generate-challenge-illustration.mjs review-existing --spec=<spec.json> --dark=<dark.webp> --light=<light.webp> [options]',
	'',
	'The JSON spec owns evidence, teaser/earned disclosure, visual plan, mobile rendering and final',
	'repository paths. Both modes run the existing chain illustration science/glitch judges plus',
	'challenge usage QA. Files are copied to final paths only after every gate passes.',
	'',
	'Options:',
	'  --work-root=tmp/challenge-illustrations/<id>-<timestamp>',
	'  --max-attempts=3                 generate mode only',
	'  --judge-model=gpt-5.6-sol',
	'  --judge-thinking-level=max',
	'  --timeout-ms=7200000',
	'  --image-timeout-ms=7200000',
	'  --replace-work-root              only sentinel-owned work roots',
	'  --replace-output                 explicitly replace both configured final files',
	'  --dry-run                        validate and print plan; no work dir, model, image, or copy',
	'  --help'
].join('\n');

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const mode = process.argv
	.slice(2)
	.find((argument) => argument !== '--' && !argument.startsWith('--'));
if (!['generate', 'review-existing'].includes(mode)) {
	fail('First argument must be generate or review-existing.\n\n' + usage);
}
const specArg = stringArg('spec', '');
if (!specArg) fail('--spec is required.');
const specPath = path.resolve(rootDir, specArg);
if (!existsSync(specPath)) fail('Spec does not exist: ' + relative(specPath));
const spec = parseJson(readFileSync(specPath, 'utf8'), 'challenge illustration spec');
const validation = validateChallengeIllustrationSpec(spec);
const darkInputPath =
	mode === 'review-existing' ? requiredExistingPath('dark', stringArg('dark', '')) : null;
const lightInputPath =
	mode === 'review-existing' ? requiredExistingPath('light', stringArg('light', '')) : null;
const maxAttempts = integerArg('max-attempts', 3, 1);
const judgeModel = stringArg('judge-model', 'gpt-5.6-sol');
const judgeThinkingLevel = stringArg('judge-thinking-level', 'max');
const timeoutMs = integerArg('timeout-ms', 7_200_000, 1);
const imageTimeoutMs = integerArg('image-timeout-ms', timeoutMs, 1);
const replaceWorkRoot = hasArg('replace-work-root');
const replaceOutput = hasArg('replace-output');
const dryRun = hasArg('dry-run');
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const workRoot = path.resolve(
	rootDir,
	stringArg(
		'work-root',
		path.join('tmp', 'challenge-illustrations', String(spec.id ?? 'invalid') + '-' + runStamp)
	)
);
const plan = buildChallengeRunPlan(spec, {
	mode,
	darkPath: darkInputPath ? relative(darkInputPath) : null,
	lightPath: lightInputPath ? relative(lightInputPath) : null,
	maxAttempts,
	judgeModel,
	judgeThinkingLevel,
	replaceOutput
});
plan.specPath = relative(specPath);
plan.workRoot = relative(workRoot);

if (dryRun || validation.status !== 'passed') {
	console.log(JSON.stringify(plan, null, 2));
	process.exit(validation.status === 'passed' ? 0 : 1);
}

prepareWorkRoot(workRoot, replaceWorkRoot);
writeJson(path.join(workRoot, 'run-plan.json'), plan);
writeJson(path.join(workRoot, 'spec.snapshot.json'), spec);
copyFileSync(specPath, path.join(workRoot, 'spec.source.json'));
const bundle = buildChallengePromptBundle(spec);
writePromptArtifacts(workRoot, bundle);
const startedAt = new Date().toISOString();
let job;

try {
	job =
		mode === 'generate'
			? await generatePair(bundle)
			: await reviewExistingPair(bundle, darkInputPath, lightInputPath);
	if (job.status === 'passed') {
		const published = publishPassingPair(job.variants.dark.path, job.variants.light.path);
		job.status = 'published';
		job.published = published;
	}
	job.finishedAt = new Date().toISOString();
	writeJson(path.join(workRoot, 'job.json'), job);
	console.log(
		JSON.stringify(
			{
				...job,
				jobPath: relative(path.join(workRoot, 'job.json'))
			},
			null,
			2
		)
	);
	if (job.status !== 'published') process.exit(1);
} catch (error) {
	job = {
		schemaVersion: CHALLENGE_ILLUSTRATION_JOB_VERSION,
		status: 'failed',
		mode,
		specId: spec.id,
		specSha256: plan.specSha256,
		startedAt,
		finishedAt: new Date().toISOString(),
		error: error instanceof Error ? error.message : String(error)
	};
	writeJson(path.join(workRoot, 'job.json'), job);
	console.error(
		JSON.stringify({ ...job, jobPath: relative(path.join(workRoot, 'job.json')) }, null, 2)
	);
	process.exit(1);
}

async function generatePair(promptBundle) {
	const darkAttempts = [];
	let darkPrompt = promptBundle.darkInstructionPrompt;
	let acceptedDark = null;
	for (let number = 1; number <= maxAttempts; number += 1) {
		const attemptDir = path.join(workRoot, 'dark-attempt-' + pad(number));
		mkdirSync(attemptDir, { recursive: true });
		writeFileSync(path.join(attemptDir, 'instruction-prompt.txt'), darkPrompt + '\n');
		const attempt = await generateAndReviewDark({
			number,
			attemptDir,
			stylePrompt: promptBundle.darkStylePrompt,
			instructionPrompt: darkPrompt
		});
		darkAttempts.push(attemptSummary(attempt));
		writeJson(path.join(attemptDir, 'attempt.json'), attemptSummary(attempt));
		if (attempt.status === 'passed') {
			acceptedDark = attempt;
			break;
		}
		if (number < maxAttempts) {
			darkPrompt = buildChallengeDarkRetryPrompt(promptBundle.darkInstructionPrompt, {
				hardCheck: attempt.hardCheck,
				visualJudge: attempt.visualJudge,
				usageJudge: attempt.usageJudge
			});
			writeFileSync(
				path.join(workRoot, 'dark-retry-' + pad(number + 1) + '-prompt.txt'),
				darkPrompt + '\n'
			);
		}
	}
	if (!acceptedDark) {
		return baseJob('failed-dark', {
			stage: 'dark-attempts',
			attempts: { dark: darkAttempts, light: [] }
		});
	}

	const lightAttempts = [];
	let lightPrompt = promptBundle.lightInstructionPrompt;
	let acceptedLight = null;
	for (let number = 1; number <= maxAttempts; number += 1) {
		const attemptDir = path.join(workRoot, 'light-attempt-' + pad(number));
		mkdirSync(attemptDir, { recursive: true });
		writeFileSync(path.join(attemptDir, 'instruction-prompt.txt'), lightPrompt + '\n');
		const attempt = await generateAndReviewLight({
			number,
			attemptDir,
			dark: acceptedDark,
			stylePrompt: promptBundle.lightStylePrompt,
			instructionPrompt: lightPrompt
		});
		lightAttempts.push(attemptSummary(attempt));
		writeJson(path.join(attemptDir, 'attempt.json'), attemptSummary(attempt));
		if (attempt.status === 'passed') {
			acceptedLight = attempt;
			break;
		}
		if (number < maxAttempts) {
			lightPrompt = buildChallengeLightRetryPrompt(promptBundle.lightInstructionPrompt, {
				hardCheck: attempt.hardCheck,
				visualJudge: attempt.visualJudge,
				usageJudge: attempt.usageJudge
			});
			writeFileSync(
				path.join(workRoot, 'light-retry-' + pad(number + 1) + '-prompt.txt'),
				lightPrompt + '\n'
			);
		}
	}
	if (!acceptedLight) {
		return baseJob('failed-light', {
			stage: 'light-attempts',
			attempts: { dark: darkAttempts, light: lightAttempts }
		});
	}
	return passingJob({
		dark: acceptedDark,
		light: acceptedLight,
		attempts: { dark: darkAttempts, light: lightAttempts }
	});
}

async function reviewExistingPair(promptBundle, sourceDarkPath, sourceLightPath) {
	const inputDir = path.join(workRoot, 'review-inputs');
	mkdirSync(inputDir, { recursive: true });
	const darkPath = path.join(inputDir, 'dark.webp');
	const lightPath = path.join(inputDir, 'light.webp');
	copyFileSync(sourceDarkPath, darkPath);
	copyFileSync(sourceLightPath, lightPath);

	const darkDir = path.join(workRoot, 'review-dark');
	mkdirSync(darkDir, { recursive: true });
	const dark = await reviewDarkFile({
		number: 1,
		attemptDir: darkDir,
		filePath: darkPath,
		action: 'review-existing',
		instructionPrompt: promptBundle.darkInstructionPrompt,
		stylePrompt: promptBundle.darkStylePrompt
	});
	writeJson(path.join(darkDir, 'attempt.json'), attemptSummary(dark));
	if (dark.status !== 'passed') {
		return baseJob('failed-dark-review', {
			stage: dark.stage,
			inputs: {
				dark: inputArtifact(sourceDarkPath),
				light: inputArtifact(sourceLightPath)
			},
			attempts: { dark: [attemptSummary(dark)], light: [] }
		});
	}

	const lightDir = path.join(workRoot, 'review-light');
	mkdirSync(lightDir, { recursive: true });
	const light = await reviewLightFile({
		number: 1,
		attemptDir: lightDir,
		dark,
		filePath: lightPath,
		action: 'review-existing',
		instructionPrompt: promptBundle.lightInstructionPrompt,
		stylePrompt: promptBundle.lightStylePrompt
	});
	writeJson(path.join(lightDir, 'attempt.json'), attemptSummary(light));
	if (light.status !== 'passed') {
		return baseJob('failed-light-review', {
			stage: light.stage,
			inputs: {
				dark: inputArtifact(sourceDarkPath),
				light: inputArtifact(sourceLightPath)
			},
			attempts: {
				dark: [attemptSummary(dark)],
				light: [attemptSummary(light)]
			}
		});
	}
	return passingJob({
		dark,
		light,
		inputs: {
			dark: inputArtifact(sourceDarkPath),
			light: inputArtifact(sourceLightPath)
		},
		attempts: {
			dark: [attemptSummary(dark)],
			light: [attemptSummary(light)]
		}
	});
}

async function generateAndReviewDark({ number, attemptDir, stylePrompt, instructionPrompt }) {
	const generated = await generateDarkImage(attemptDir, stylePrompt, instructionPrompt);
	return reviewDarkFile({
		number,
		attemptDir,
		filePath: generated.filePath,
		action: generated.action,
		instructionPrompt,
		stylePrompt
	});
}

async function generateAndReviewLight({
	number,
	attemptDir,
	dark,
	stylePrompt,
	instructionPrompt
}) {
	const generated = await generateLightImage(
		attemptDir,
		dark.filePath,
		stylePrompt,
		instructionPrompt
	);
	return reviewLightFile({
		number,
		attemptDir,
		dark,
		filePath: generated.filePath,
		action: generated.action,
		instructionPrompt,
		stylePrompt
	});
}

async function reviewDarkFile({
	number,
	attemptDir,
	filePath,
	action,
	instructionPrompt,
	stylePrompt
}) {
	const previews = await createPreviews(filePath, attemptDir, 'dark');
	const hardCheck = await hardImageCheck(filePath, { rootDir });
	writeJson(path.join(attemptDir, 'hard-image-check.json'), hardCheck);
	const base = {
		number,
		theme: 'dark',
		action,
		filePath,
		previews,
		hardCheck,
		promptSha256: sha256(stylePrompt + '\n\n' + instructionPrompt),
		instructionPrompt
	};
	if (hardCheck.status !== 'passed') {
		return { ...base, status: 'failed', stage: 'dark-hard-check' };
	}
	const visual = await runJudge({
		label: 'dark-visual',
		attemptDir,
		prompt: darkVisualJudgePrompt(bundle.candidate, bundle.decision, hardCheck),
		images: [previews.desktop],
		outputSchema: darkVisualJudgeSchema()
	});
	const visualValidation = validateDarkVisualJudge(
		visual.result,
		hardCheck,
		bundle.decision.visualSteps
	);
	writeJson(path.join(attemptDir, 'dark-visual-judge-validation.json'), visualValidation);
	if (visualValidation.status !== 'passed') {
		throw new Error('Dark visual judge contract failed: ' + visualValidation.issues.join(' '));
	}
	if (!visual.result.pass) {
		return {
			...base,
			status: 'failed',
			stage: 'dark-visual-judge',
			visualJudge: visual.result,
			visualJudgeRun: visual.run
		};
	}
	const usageReview = await runJudge({
		label: 'dark-usage',
		attemptDir,
		prompt: challengeUsageJudgePrompt(spec, { dark: hardCheck }, 'dark'),
		images: usagePreviewPaths(previews),
		outputSchema: challengeUsageJudgeSchema('dark')
	});
	const usageValidation = validateChallengeUsageJudge(usageReview.result, spec, 'dark');
	writeJson(path.join(attemptDir, 'dark-usage-judge-validation.json'), usageValidation);
	if (usageValidation.status !== 'passed') {
		throw new Error('Dark usage judge contract failed: ' + usageValidation.issues.join(' '));
	}
	return {
		...base,
		status: usageReview.result.pass ? 'passed' : 'failed',
		stage: 'dark-usage-judge',
		visualJudge: visual.result,
		visualJudgeRun: visual.run,
		usageJudge: usageReview.result,
		usageJudgeRun: usageReview.run
	};
}

async function reviewLightFile({
	number,
	attemptDir,
	dark,
	filePath,
	action,
	instructionPrompt,
	stylePrompt
}) {
	const previews = await createPreviews(filePath, attemptDir, 'light');
	const rawHardCheck = await hardImageCheck(filePath, { rootDir });
	const hardCheck = enforcePairHardCheck(dark.hardCheck, rawHardCheck);
	const hardChecks = { dark: dark.hardCheck, light: hardCheck };
	writeJson(path.join(attemptDir, 'hard-image-checks.json'), hardChecks);
	const base = {
		number,
		theme: 'light',
		action,
		filePath,
		previews,
		hardCheck,
		promptSha256: sha256(stylePrompt + '\n\n' + instructionPrompt),
		instructionPrompt
	};
	if (hardCheck.status !== 'passed') {
		return { ...base, status: 'failed', stage: 'light-hard-check' };
	}
	const visual = await runJudge({
		label: 'light-visual',
		attemptDir,
		prompt: lightEditJudgePrompt(bundle.candidate, bundle.decision, hardChecks),
		images: [dark.previews.desktop, previews.desktop],
		outputSchema: lightEditJudgeSchema()
	});
	const visualValidation = validateLightEditJudge(
		visual.result,
		hardChecks,
		bundle.decision.visualSteps
	);
	writeJson(path.join(attemptDir, 'light-visual-judge-validation.json'), visualValidation);
	if (visualValidation.status !== 'passed') {
		throw new Error('Light visual judge contract failed: ' + visualValidation.issues.join(' '));
	}
	if (!visual.result.pass) {
		return {
			...base,
			status: 'failed',
			stage: 'light-visual-judge',
			visualJudge: visual.result,
			visualJudgeRun: visual.run
		};
	}
	const usageReview = await runJudge({
		label: 'pair-usage',
		attemptDir,
		prompt: challengeUsageJudgePrompt(spec, hardChecks, 'pair'),
		images: [...usagePreviewPaths(dark.previews), ...usagePreviewPaths(previews)],
		outputSchema: challengeUsageJudgeSchema('pair')
	});
	const usageValidation = validateChallengeUsageJudge(usageReview.result, spec, 'pair');
	writeJson(path.join(attemptDir, 'pair-usage-judge-validation.json'), usageValidation);
	if (usageValidation.status !== 'passed') {
		throw new Error('Pair usage judge contract failed: ' + usageValidation.issues.join(' '));
	}
	return {
		...base,
		status: usageReview.result.pass ? 'passed' : 'failed',
		stage: 'pair-usage-judge',
		visualJudge: visual.result,
		visualJudgeRun: visual.run,
		usageJudge: usageReview.result,
		usageJudgeRun: usageReview.run
	};
}

async function generateDarkImage(attemptDir, stylePrompt, instructionPrompt) {
	const images = await withImageTimeout((signal) =>
		generateImages({
			model: CHALLENGE_ILLUSTRATION_IMAGE_MODEL,
			stylePrompt,
			imagePrompts: [instructionPrompt],
			imageResolution: '2048x1152',
			imageQuality: 'high',
			outputFormat: 'webp',
			action: 'generate',
			numImages: 1,
			signal
		})
	);
	if (images.length !== 1) {
		throw new Error('Dark generation returned ' + images.length + ' images.');
	}
	const filePath = path.join(attemptDir, 'dark.webp');
	writeFileSync(filePath, images[0].data);
	return { action: 'generate', filePath };
}

async function generateLightImage(attemptDir, darkPath, stylePrompt, instructionPrompt) {
	const images = await withImageTimeout((signal) =>
		generateImages({
			model: CHALLENGE_ILLUSTRATION_IMAGE_MODEL,
			stylePrompt,
			styleImages: [
				{
					data: readFileSync(darkPath),
					mimeType: 'image/webp'
				}
			],
			imagePrompts: [instructionPrompt],
			imageResolution: '2048x1152',
			imageQuality: 'high',
			outputFormat: 'webp',
			action: 'edit',
			numImages: 1,
			signal
		})
	);
	if (images.length !== 1) {
		throw new Error('Light edit returned ' + images.length + ' images.');
	}
	const filePath = path.join(attemptDir, 'light.webp');
	writeFileSync(filePath, images[0].data);
	return { action: 'edit', filePath };
}

async function withImageTimeout(callback) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), imageTimeoutMs);
	try {
		return await callback(controller.signal);
	} finally {
		clearTimeout(timer);
	}
}

async function runJudge({ label, attemptDir, prompt, images, outputSchema }) {
	const judgeDir = path.join(attemptDir, label + '-judge');
	mkdirSync(judgeDir, { recursive: true });
	writeFileSync(path.join(judgeDir, 'prompt.txt'), prompt + '\n');
	const run = await runCodexSdkTurn({
		prompt: [
			{ type: 'text', text: prompt },
			...images.map((imagePath) => ({ type: 'local_image', path: imagePath }))
		],
		workDir: judgeDir,
		eventsPath: path.join(judgeDir, 'events.jsonl'),
		lastMessagePath: path.join(judgeDir, 'last-message.json'),
		summaryPath: path.join(judgeDir, 'run-summary.json'),
		model: judgeModel,
		thinkingLevel: judgeThinkingLevel,
		timeoutMs,
		outputSchema,
		sandboxMode: 'read-only',
		environmentMode: 'minimal'
	});
	const result = parseJson(run.finalResponse, label + ' judge');
	writeJson(path.join(judgeDir, 'result.json'), result);
	return { result, run: stripFinalResponse(run) };
}

async function createPreviews(filePath, attemptDir, theme) {
	const desktop = path.join(attemptDir, theme + '-desktop-1024.webp');
	const mobile = path.join(attemptDir, theme + '-mobile.webp');
	await createIpadPreview(filePath, desktop, { rootDir });
	await createMobilePreview(filePath, mobile, theme);
	const mobileViewport =
		spec.usage.mobileFit === 'pan'
			? path.join(attemptDir, theme + '-mobile-initial-viewport.webp')
			: null;
	if (mobileViewport) await createMobileViewportPreview(mobile, mobileViewport);
	return { desktop, mobile, mobileViewport };
}

async function createMobilePreview(inputPath, outputPath, theme) {
	const width = spec.usage.mobileWidth;
	const height = spec.usage.mobileHeight;
	const geometry = String(width) + 'x' + String(height);
	const fitArg =
		spec.usage.mobileFit === 'pan'
			? geometry + '!'
			: spec.usage.mobileFit === 'cover'
				? geometry + '^'
				: geometry;
	const background = theme === 'dark' ? '#061421' : '#f7f5ef';
	await execFileAsync(
		'convert',
		[
			inputPath,
			'-resize',
			fitArg,
			'-background',
			background,
			'-gravity',
			imageMagickGravity(spec.usage.mobilePosition),
			'-extent',
			geometry,
			'-quality',
			'90',
			outputPath
		],
		{ cwd: rootDir, maxBuffer: 4 * 1024 * 1024 }
	);
}

async function createMobileViewportPreview(inputPath, outputPath) {
	const viewportWidth = spec.usage.mobileViewportWidth;
	const height = spec.usage.mobileHeight;
	await execFileAsync(
		'convert',
		[
			inputPath,
			'-gravity',
			imageMagickGravity(spec.usage.mobilePosition),
			'-crop',
			String(viewportWidth) + 'x' + String(height) + '+0+0',
			'+repage',
			'-quality',
			'90',
			outputPath
		],
		{ cwd: rootDir, maxBuffer: 4 * 1024 * 1024 }
	);
}

function usagePreviewPaths(previews) {
	return [
		previews.desktop,
		previews.mobile,
		...(previews.mobileViewport ? [previews.mobileViewport] : [])
	];
}

function enforcePairHardCheck(dark, light) {
	const issues = [...(light.issues ?? [])];
	if (
		dark.status === 'passed' &&
		light.status === 'passed' &&
		(dark.width !== light.width || dark.height !== light.height)
	) {
		issues.push(
			'Light dimensions ' +
				light.width +
				'x' +
				light.height +
				' do not match dark ' +
				dark.width +
				'x' +
				dark.height +
				'.'
		);
	}
	if (dark.status === 'passed' && light.status === 'passed' && dark.sha256 === light.sha256) {
		issues.push('Light edit is byte-identical to the dark master.');
	}
	return { ...light, status: issues.length ? 'failed' : light.status, issues };
}

function passingJob({ dark, light, attempts, inputs = null }) {
	return baseJob('passed', {
		stage: 'all-gates',
		inputs,
		variants: {
			dark: variantArtifact(dark),
			light: variantArtifact(light)
		},
		prompts: {
			darkSha256: dark.promptSha256,
			lightSha256: light.promptSha256,
			pairSha256: sha256(dark.promptSha256 + '\n' + light.promptSha256)
		},
		hardChecks: { dark: dark.hardCheck, light: light.hardCheck },
		judges: {
			darkVisual: dark.visualJudge,
			darkUsage: dark.usageJudge,
			lightVisual: light.visualJudge,
			pairUsage: light.usageJudge
		},
		judgeRuns: {
			darkVisual: dark.visualJudgeRun,
			darkUsage: dark.usageJudgeRun,
			lightVisual: light.visualJudgeRun,
			pairUsage: light.usageJudgeRun
		},
		attempts
	});
}

function baseJob(status, extra = {}) {
	return {
		schemaVersion: CHALLENGE_ILLUSTRATION_JOB_VERSION,
		status,
		mode,
		specId: spec.id,
		displayStage: spec.displayStage,
		specPath: relative(specPath),
		specSha256: plan.specSha256,
		imageModel: CHALLENGE_ILLUSTRATION_IMAGE_MODEL,
		judgeModel,
		judgeThinkingLevel,
		startedAt,
		...extra
	};
}

function variantArtifact(attempt) {
	return {
		path: attempt.filePath,
		relativePath: relative(attempt.filePath),
		sha256: fileSha256(attempt.filePath),
		width: attempt.hardCheck.width,
		height: attempt.hardCheck.height,
		format: attempt.hardCheck.format,
		action: attempt.action,
		promptSha256: attempt.promptSha256,
		previews: {
			desktop: relative(attempt.previews.desktop),
			mobile: relative(attempt.previews.mobile),
			mobileViewport: attempt.previews.mobileViewport
				? relative(attempt.previews.mobileViewport)
				: null
		}
	};
}

function attemptSummary(attempt) {
	return {
		number: attempt.number,
		theme: attempt.theme,
		action: attempt.action,
		status: attempt.status,
		stage: attempt.stage,
		asset: existsSync(attempt.filePath)
			? { path: relative(attempt.filePath), sha256: fileSha256(attempt.filePath) }
			: null,
		previews: attempt.previews
			? {
					desktop: relative(attempt.previews.desktop),
					mobile: relative(attempt.previews.mobile),
					mobileViewport: attempt.previews.mobileViewport
						? relative(attempt.previews.mobileViewport)
						: null
				}
			: null,
		promptSha256: attempt.promptSha256,
		hardCheck: attempt.hardCheck,
		visualJudge: attempt.visualJudge ?? null,
		visualJudgeRun: attempt.visualJudgeRun ?? null,
		usageJudge: attempt.usageJudge ?? null,
		usageJudgeRun: attempt.usageJudgeRun ?? null
	};
}

function publishPassingPair(darkSource, lightSource) {
	const targets = [
		{ theme: 'dark', source: darkSource, target: resolveRepoPath(spec.output.darkPath) },
		{ theme: 'light', source: lightSource, target: resolveRepoPath(spec.output.lightPath) }
	];
	for (const entry of targets) {
		entry.alreadyIdentical =
			existsSync(entry.target) && fileSha256(entry.source) === fileSha256(entry.target);
	}
	if (!replaceOutput) {
		const conflicts = targets.filter(
			(entry) => existsSync(entry.target) && !entry.alreadyIdentical
		);
		if (conflicts.length) {
			throw new Error(
				'Refusing to overwrite configured output: ' +
					conflicts.map((entry) => relative(entry.target)).join(', ') +
					'. Pass --replace-output only after reviewing the replacement.'
			);
		}
	}
	const pending = targets.filter((entry) => !entry.alreadyIdentical);
	const transactionId = randomUUID();
	for (const entry of pending) {
		mkdirSync(path.dirname(entry.target), { recursive: true });
		entry.stage = path.join(
			path.dirname(entry.target),
			'.' + path.basename(entry.target) + '.' + transactionId + '.stage'
		);
		entry.backup = path.join(
			path.dirname(entry.target),
			'.' + path.basename(entry.target) + '.' + transactionId + '.backup'
		);
		copyFileSync(entry.source, entry.stage);
		if (fileSha256(entry.source) !== fileSha256(entry.stage)) {
			throw new Error('Staged copy hash mismatch for ' + entry.theme + '.');
		}
	}
	const replaced = [];
	const installed = [];
	try {
		for (const entry of pending) {
			if (existsSync(entry.target)) {
				renameSync(entry.target, entry.backup);
				replaced.push(entry);
			}
		}
		for (const entry of pending) {
			renameSync(entry.stage, entry.target);
			installed.push(entry);
		}
		for (const entry of replaced) unlinkIfExists(entry.backup);
	} catch (error) {
		for (const entry of installed.reverse()) unlinkIfExists(entry.target);
		for (const entry of replaced.reverse()) {
			if (existsSync(entry.backup)) renameSync(entry.backup, entry.target);
		}
		for (const entry of pending) unlinkIfExists(entry.stage);
		throw error;
	}
	const published = {};
	for (const entry of targets) {
		const sourceSha256 = fileSha256(entry.source);
		const outputSha256 = fileSha256(entry.target);
		if (sourceSha256 !== outputSha256) {
			throw new Error('Final output hash mismatch for ' + entry.theme + '.');
		}
		published[entry.theme] = {
			path: relative(entry.target),
			sha256: outputSha256,
			action: entry.alreadyIdentical ? 'already-identical' : 'copied'
		};
	}
	return published;
}

function writePromptArtifacts(outputRoot, promptBundle) {
	writeFileSync(
		path.join(outputRoot, 'dark-style-prompt.txt'),
		promptBundle.darkStylePrompt + '\n'
	);
	writeFileSync(
		path.join(outputRoot, 'dark-instruction-prompt.txt'),
		promptBundle.darkInstructionPrompt + '\n'
	);
	writeFileSync(
		path.join(outputRoot, 'light-style-prompt.txt'),
		promptBundle.lightStylePrompt + '\n'
	);
	writeFileSync(
		path.join(outputRoot, 'light-instruction-prompt.txt'),
		promptBundle.lightInstructionPrompt + '\n'
	);
	writeJson(path.join(outputRoot, 'prompt-hashes.json'), {
		dark: sha256(promptBundle.darkStylePrompt + '\n\n' + promptBundle.darkInstructionPrompt),
		light: sha256(promptBundle.lightStylePrompt + '\n\n' + promptBundle.lightInstructionPrompt)
	});
}

function prepareWorkRoot(outputRoot, replace) {
	const relativeRoot = path.relative(rootDir, outputRoot);
	if (!relativeRoot || relativeRoot.startsWith('..' + path.sep) || path.isAbsolute(relativeRoot)) {
		throw new Error('--work-root must be a dedicated directory inside this repository.');
	}
	const sentinel = path.join(outputRoot, '.challenge-illustration-work-root');
	if (existsSync(outputRoot)) {
		if (!existsSync(sentinel)) {
			throw new Error('Refusing to replace a work root without the pipeline sentinel.');
		}
		if (!replace) {
			throw new Error('Work root exists; pass --replace-work-root: ' + relative(outputRoot));
		}
		rmSync(outputRoot, { recursive: true, force: true });
	}
	mkdirSync(outputRoot, { recursive: true });
	writeFileSync(sentinel, CHALLENGE_ILLUSTRATION_JOB_VERSION + '\n');
}

function resolveRepoPath(relativePath) {
	const resolved = path.resolve(rootDir, relativePath);
	const fromRoot = path.relative(rootDir, resolved);
	if (!fromRoot || fromRoot.startsWith('..' + path.sep) || path.isAbsolute(fromRoot)) {
		throw new Error('Configured output escapes the repository: ' + relativePath);
	}
	return resolved;
}

function requiredExistingPath(name, value) {
	if (!value) fail('--' + name + ' is required for review-existing.');
	const resolved = path.resolve(rootDir, value);
	const fromRoot = path.relative(rootDir, resolved);
	if (!fromRoot || fromRoot.startsWith('..' + path.sep) || path.isAbsolute(fromRoot)) {
		fail('--' + name + ' must be inside this repository.');
	}
	if (!existsSync(resolved)) fail('--' + name + ' does not exist: ' + value);
	return resolved;
}

function inputArtifact(filePath) {
	return { path: relative(filePath), sha256: fileSha256(filePath) };
}

function imageMagickGravity(position) {
	const normalized = String(position).trim().toLowerCase();
	const map = {
		left: 'West',
		center: 'Center',
		right: 'East',
		'left top': 'NorthWest',
		'center top': 'North',
		'right top': 'NorthEast',
		'left center': 'West',
		'center center': 'Center',
		'right center': 'East',
		'left bottom': 'SouthWest',
		'center bottom': 'South',
		'right bottom': 'SouthEast'
	};
	return map[normalized] ?? 'Center';
}

function parseJson(value, label) {
	try {
		return JSON.parse(value);
	} catch (error) {
		throw new Error(
			label + ' is not valid JSON: ' + (error instanceof Error ? error.message : String(error)),
			{ cause: error }
		);
	}
}

function stripFinalResponse(run) {
	return Object.fromEntries(Object.entries(run).filter(([key]) => key !== 'finalResponse'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function unlinkIfExists(filePath) {
	if (existsSync(filePath)) unlinkSync(filePath);
}

function pad(value) {
	return String(value).padStart(2, '0');
}

function relative(filePath) {
	return path.relative(rootDir, filePath) || '.';
}

function hasArg(name) {
	return process.argv.includes('--' + name);
}

function stringArg(name, defaultValue) {
	const prefix = '--' + name + '=';
	const match = process.argv.find((candidate) => candidate.startsWith(prefix));
	return match ? match.slice(prefix.length) : defaultValue;
}

function integerArg(name, defaultValue, minimum) {
	const raw = stringArg(name, '');
	if (!raw) return defaultValue;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < minimum) {
		fail('--' + name + ' must be an integer >= ' + minimum + '.');
	}
	return value;
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
