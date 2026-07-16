#!/usr/bin/env node

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import {
	RECALL_CUE_REVIEW_OUTPUT_SCHEMA,
	RECALL_FULL_REVIEW_OUTPUT_SCHEMA,
	RECALL_GENERATION_OUTPUT_SCHEMA,
	RECALL_PROMPT_VERSION,
	compileRecallCardBundle,
	hashRecallArtifact,
	parseRecallJsonOutput,
	validateRecallCandidateBatch,
	validateRecallCueReviews,
	validateRecallFullReviews
} from './lib/recall-card-bundle.mjs';
import {
	buildRecallCardFullReviewPrompt,
	buildRecallCardGenerationPrompt,
	buildRecallCardVisualCueBatchReviewPrompt
} from './lib/recall-card-generation-prompt.mjs';
import { loadOfficialRecallEvidence } from './lib/recall-curriculum-evidence.mjs';
import {
	assertStrictChild,
	portableRecallRunSummary,
	resolveRecallGenerationDirectories
} from './lib/recall-generation-paths.mjs';

const rootDir = process.cwd();
loadDefaultEnv(rootDir);

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
for (const [stage, model, thinkingLevel] of [
	['generator', args.model, args.thinkingLevel],
	['full reviewer', args.reviewerModel, args.reviewerThinkingLevel],
	['cue reviewer', args.cueReviewerModel, args.cueReviewerThinkingLevel]
]) {
	if (model !== 'gpt-5.6-sol' || thinkingLevel !== 'max') {
		throw new Error(`${stage} must use gpt-5.6-sol with max reasoning for import-grade runs.`);
	}
}

const startedAt = new Date().toISOString();
const compilerRunSuffix = RECALL_PROMPT_VERSION.replace(/^recall-card-/, '');
const runId =
	args.runId ?? `recall-${startedAt.replace(/[:.]/g, '-').toLowerCase()}-${compilerRunSuffix}`;
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(runId)) {
	throw new Error('--run-id must be a stable lowercase kebab-case identifier.');
}
if (!runId.endsWith(`-${compilerRunSuffix}`)) {
	throw new Error(`--run-id must end with -${compilerRunSuffix} for ${RECALL_PROMPT_VERSION}.`);
}
const { workRoot, workDir, artifactDir } = resolveRecallGenerationDirectories({
	rootDir,
	runId,
	workDir: args.workDir
});
const evidence = loadOfficialRecallEvidence({
	rootDir,
	catalogPath: args.catalog,
	specificationId: args.specificationId,
	componentId: args.componentId,
	subject: args.subject,
	offeringIds: args.offeringIds,
	primaryOfferingId: args.primaryOfferingId
});

const sourceForPrompt = {
	specification: evidence.specification,
	component: evidence.component,
	topicComponent: evidence.topicComponent,
	pageStart: evidence.pageStart,
	pageEnd: evidence.pageEnd,
	sourceFingerprint: evidence.fingerprint
};
const plan = {
	status: args.generate ? 'generation_requested' : 'dry_run',
	runId,
	workDir: relative(workDir),
	artifactDir: relative(artifactDir),
	catalog: evidence.catalogPath,
	specificationId: evidence.specification.id,
	componentId: evidence.component.id,
	topicComponentId: evidence.topicComponent.id,
	subject: evidence.subject,
	pageRange: [evidence.pageStart, evidence.pageEnd],
	pageTextCharacters: evidence.pageText.length,
	sourceFingerprint: evidence.fingerprint,
	count: args.count,
	targets: evidence.targets,
	models: {
		generator: { model: args.model, thinkingLevel: args.thinkingLevel },
		fullReviewer: { model: args.reviewerModel, thinkingLevel: args.reviewerThinkingLevel },
		cueReviewer: { model: args.cueReviewerModel, thinkingLevel: args.cueReviewerThinkingLevel }
	},
	promptVersion: RECALL_PROMPT_VERSION
};

if (!args.generate) {
	console.log(
		JSON.stringify({ ...plan, note: 'Pass --generate to spend a Codex model run.' }, null, 2)
	);
	process.exit(0);
}

prepareWorkDir(workDir, args.force, workRoot);
if (existsSync(artifactDir)) {
	throw new Error(`Durable artifact directory already exists: ${relative(artifactDir)}`);
}
writeJson(path.join(workDir, 'plan.json'), plan);
writeJson(path.join(workDir, 'source-evidence.json'), {
	...sourceForPrompt,
	catalogSchemaVersion: evidence.catalogSchemaVersion,
	catalogPath: evidence.catalogPath,
	subject: evidence.subject,
	targets: evidence.targets,
	pageText: evidence.pageText
});

let generatorRun = null;
let fullReviewerRun = null;
let cueReviewerRun = null;
let replacementCueReviewerRun = null;
try {
	const generationPrompt = buildRecallCardGenerationPrompt({
		subject: evidence.subject,
		topicId: evidence.topicComponent.id,
		specRef: evidence.component.code,
		officialCurriculumExcerpt: evidence.pageText,
		count: args.count,
		source: sourceForPrompt,
		curriculumTargets: evidence.targets
	});
	writeFileSync(path.join(workDir, 'generation-prompt.txt'), `${generationPrompt}\n`);
	generatorRun = await runStage({
		name: 'generation',
		prompt: generationPrompt,
		outputSchema: RECALL_GENERATION_OUTPUT_SCHEMA,
		model: args.model,
		thinkingLevel: args.thinkingLevel
	});
	const candidates = validateRecallCandidateBatch(
		parseRecallJsonOutput(generatorRun.finalResponse),
		{
			subject: evidence.subject,
			pageText: evidence.pageText,
			expectedCount: args.count
		}
	);
	writeJson(path.join(workDir, 'candidate-cards.json'), candidates);

	const completeCards = candidates.cards.map((card) => ({ ...card, subject: evidence.subject }));
	const fullReviewPrompt = buildRecallCardFullReviewPrompt({
		cards: completeCards,
		evidence: { ...sourceForPrompt, pageText: evidence.pageText },
		targets: evidence.targets
	});
	writeFileSync(path.join(workDir, 'full-review-prompt.txt'), `${fullReviewPrompt}\n`);
	fullReviewerRun = await runStage({
		name: 'full-review',
		prompt: fullReviewPrompt,
		outputSchema: RECALL_FULL_REVIEW_OUTPUT_SCHEMA,
		model: args.reviewerModel,
		thinkingLevel: args.reviewerThinkingLevel
	});
	const fullReviews = validateRecallFullReviews(
		parseRecallJsonOutput(fullReviewerRun.finalResponse),
		candidates.cards.map((card) => card.id)
	);
	writeJson(path.join(workDir, 'full-review.json'), fullReviews);

	const cuePrompt = buildRecallCardVisualCueBatchReviewPrompt(completeCards, evidence.subject);
	writeFileSync(path.join(workDir, 'cue-review-prompt.txt'), `${cuePrompt}\n`);
	cueReviewerRun = await runStage({
		name: 'cue-review',
		prompt: cuePrompt,
		outputSchema: RECALL_CUE_REVIEW_OUTPUT_SCHEMA,
		model: args.cueReviewerModel,
		thinkingLevel: args.cueReviewerThinkingLevel
	});
	let cueReviews = validateRecallCueReviews(
		parseRecallJsonOutput(cueReviewerRun.finalResponse),
		completeCards,
		evidence.subject
	);
	writeJson(path.join(workDir, 'cue-review.json'), cueReviews);

	const cueReviewById = new Map(cueReviews.reviews.map((review) => [review.cardId, review]));
	const replacements = completeCards
		.filter((card) => {
			const review = cueReviewById.get(card.id);
			return review && !review.accepted && review.replacementCue !== card.visualCue;
		})
		.map((card) => ({
			...card,
			visualCue: cueReviewById.get(card.id).replacementCue
		}));
	if (replacements.length) {
		const replacementPrompt = buildRecallCardVisualCueBatchReviewPrompt(
			replacements,
			evidence.subject
		);
		writeFileSync(
			path.join(workDir, 'cue-replacement-review-prompt.txt'),
			`${replacementPrompt}\n`
		);
		replacementCueReviewerRun = await runStage({
			name: 'cue-replacement-review',
			prompt: replacementPrompt,
			outputSchema: RECALL_CUE_REVIEW_OUTPUT_SCHEMA,
			model: args.cueReviewerModel,
			thinkingLevel: args.cueReviewerThinkingLevel
		});
		const replacementReviews = validateRecallCueReviews(
			parseRecallJsonOutput(replacementCueReviewerRun.finalResponse),
			replacements,
			evidence.subject
		);
		writeJson(path.join(workDir, 'cue-replacement-review.json'), replacementReviews);
		const replacementCardById = new Map(replacements.map((card) => [card.id, card]));
		for (const [index, card] of candidates.cards.entries()) {
			const replacement = replacementCardById.get(card.id);
			if (replacement) candidates.cards[index] = { ...card, visualCue: replacement.visualCue };
		}
		const replacementReviewById = new Map(
			replacementReviews.reviews.map((review) => [review.cardId, review])
		);
		cueReviews = {
			reviews: cueReviews.reviews.map(
				(review) => replacementReviewById.get(review.cardId) ?? review
			)
		};
		writeJson(path.join(workDir, 'final-cue-review.json'), cueReviews);
	}

	const finishedAt = new Date().toISOString();
	const run = {
		id: runId,
		startedAt,
		finishedAt,
		generator: { model: args.model, thinkingLevel: args.thinkingLevel },
		fullReviewer: {
			model: args.reviewerModel,
			thinkingLevel: args.reviewerThinkingLevel,
			independentTurn: true
		},
		cueReviewer: {
			model: args.cueReviewerModel,
			thinkingLevel: args.cueReviewerThinkingLevel,
			independentTurn: true,
			replacementReviewRun: replacements.length > 0
		}
	};
	const { bundle, rejectedCards } = compileRecallCardBundle({
		candidates,
		fullReviews,
		cueReviews,
		evidence,
		run
	});
	writeJson(path.join(workDir, 'accepted-cards.json'), bundle);
	writeJson(path.join(workDir, 'rejected-cards.json'), { cards: rejectedCards });
	mkdirSync(artifactDir, { recursive: true });
	copyDurableArtifacts(workDir, artifactDir);
	writeJson(path.join(artifactDir, 'accepted-cards.json'), bundle);
	writeJson(path.join(artifactDir, 'rejected-cards.json'), { cards: rejectedCards });
	const acceptedArtifact = relative(path.join(artifactDir, 'accepted-cards.json'));
	const runSummary = {
		status: 'accepted',
		plan,
		run,
		counts: {
			generated: candidates.cards.length,
			accepted: bundle.cards.length,
			rejected: rejectedCards.length,
			cueReplacementsReviewed: replacements.length
		},
		artifacts: artifactPaths(workDir),
		durableArtifacts: readdirSync(artifactDir)
			.sort()
			.map((name) => relative(path.join(artifactDir, name))),
		acceptedArtifact,
		acceptedArtifactHash: hashRecallArtifact(bundle),
		codex: {
			generator: withoutFinalResponse(generatorRun),
			fullReviewer: withoutFinalResponse(fullReviewerRun),
			cueReviewer: withoutFinalResponse(cueReviewerRun),
			replacementCueReviewer: replacementCueReviewerRun
				? withoutFinalResponse(replacementCueReviewerRun)
				: null
		}
	};
	writeJson(path.join(workDir, 'recall-generation-run.json'), runSummary);
	writeJson(path.join(artifactDir, 'recall-generation-run.json'), runSummary);
	console.log(JSON.stringify(runSummary, null, 2));
} catch (error) {
	const failure = {
		status: 'failed',
		plan,
		startedAt,
		finishedAt: new Date().toISOString(),
		error: error instanceof Error ? error.message : String(error),
		artifacts: artifactPaths(workDir),
		codex: {
			generator: generatorRun ? withoutFinalResponse(generatorRun) : null,
			fullReviewer: fullReviewerRun ? withoutFinalResponse(fullReviewerRun) : null,
			cueReviewer: cueReviewerRun ? withoutFinalResponse(cueReviewerRun) : null,
			replacementCueReviewer: replacementCueReviewerRun
				? withoutFinalResponse(replacementCueReviewerRun)
				: null
		}
	};
	writeJson(path.join(workDir, 'recall-generation-run.json'), failure);
	console.error(JSON.stringify(failure, null, 2));
	process.exit(1);
}

async function runStage({ name, prompt, outputSchema, model, thinkingLevel }) {
	const stageDir = path.join(workDir, name);
	mkdirSync(stageDir, { recursive: true });
	return runCodexSdkTurn({
		prompt,
		workDir: stageDir,
		eventsPath: path.join(stageDir, 'events.jsonl'),
		lastMessagePath: path.join(stageDir, 'last-message.json'),
		summaryPath: path.join(stageDir, 'codex-run-summary.json'),
		model,
		thinkingLevel,
		timeoutMs: args.timeoutMs,
		networkAccessEnabled: false,
		webSearchMode: 'disabled',
		outputSchema,
		sandboxMode: 'read-only',
		environmentMode: 'minimal'
	});
}

function parseArgs(argv) {
	const value = (name, fallback = null) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
	const values = (name) =>
		argv
			.filter((argument) => argument.startsWith(`--${name}=`))
			.map((argument) => argument.slice(name.length + 3));
	const required = (name) => {
		const result = value(name);
		if (!result) throw new Error(`--${name} is required.\n\n${usage()}`);
		return result;
	};
	const integer = (name, fallback, min, max) => {
		const parsed = Number(value(name, String(fallback)));
		if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
			throw new Error(`--${name} must be an integer from ${min} to ${max}.`);
		}
		return parsed;
	};
	const help = argv.includes('--help') || argv.includes('-h');
	return {
		help,
		generate: argv.includes('--generate'),
		force: argv.includes('--force'),
		catalog: value('catalog', 'data/curricula/curriculum-catalog.json'),
		specificationId: help ? '' : required('specification-id'),
		componentId: help ? '' : required('component-id'),
		subject: value('subject') || undefined,
		offeringIds: values('offering-id'),
		primaryOfferingId: value('primary-offering-id') || undefined,
		count: integer('count', 3, 1, 20),
		runId: value('run-id') || undefined,
		workDir: value('work-dir') || undefined,
		model: value('model', 'gpt-5.6-sol'),
		thinkingLevel: value('thinking-level', 'max'),
		reviewerModel: value('reviewer-model', value('model', 'gpt-5.6-sol')),
		reviewerThinkingLevel: value('reviewer-thinking-level', 'max'),
		cueReviewerModel: value('cue-reviewer-model', value('model', 'gpt-5.6-sol')),
		cueReviewerThinkingLevel: value('cue-reviewer-thinking-level', 'max'),
		timeoutMs: integer('timeout-ms', 3_600_000, 1, 14_400_000)
	};
}

function usage() {
	return `Usage:
node scripts/generate-recall-cards.mjs \\
  --specification-id=<catalog specification id> \\
  --component-id=<focused topic or section id> \\
  [--subject=Biology|Chemistry|Physics] [--count=3]

The default is a zero-model-cost dry run. Add --generate to run three independent
Codex gpt-5.6-sol/max turns (generator, full reviewer, cue reviewer).

Optional:
  --catalog=data/curricula/curriculum-catalog.json
  --offering-id=<exact offering id>              repeatable
  --primary-offering-id=<one selected offering>
  --run-id=<stable kebab id ending in ${RECALL_PROMPT_VERSION.replace(/^recall-card-/, '')}>
  --work-dir=tmp/recall-generation/<run-id>
  --model=gpt-5.6-sol --thinking-level=max
  --reviewer-model=gpt-5.6-sol --reviewer-thinking-level=max
  --cue-reviewer-model=gpt-5.6-sol --cue-reviewer-thinking-level=max
  --timeout-ms=3600000
  --force`;
}

function prepareWorkDir(directory, force, safeRoot) {
	assertStrictChild(safeRoot, directory, 'Recall generation work directory');
	if (existsSync(directory)) {
		if (!force) throw new Error(`Work directory exists; pass --force: ${relative(directory)}`);
		rmSync(directory, { recursive: true, force: true });
	}
	mkdirSync(directory, { recursive: true });
}

function artifactPaths(directory) {
	const names = [
		'plan.json',
		'source-evidence.json',
		'generation-prompt.txt',
		'candidate-cards.json',
		'full-review-prompt.txt',
		'full-review.json',
		'cue-review-prompt.txt',
		'cue-review.json',
		'cue-replacement-review-prompt.txt',
		'cue-replacement-review.json',
		'final-cue-review.json',
		'accepted-cards.json',
		'rejected-cards.json',
		'recall-generation-run.json'
	];
	return names
		.map((name) => path.join(directory, name))
		.filter((filePath) => existsSync(filePath))
		.map(relative);
}

function copyDurableArtifacts(sourceDir, destinationDir) {
	const files = [
		['plan.json', 'plan.json'],
		['source-evidence.json', 'source-evidence.json'],
		['generation-prompt.txt', 'generation-prompt.txt'],
		['candidate-cards.json', 'candidate-cards.json'],
		['generation/last-message.json', 'generation-model-output.json'],
		['generation/codex-run-summary.json', 'generation-codex-run-summary.json'],
		['full-review-prompt.txt', 'full-review-prompt.txt'],
		['full-review.json', 'full-review.json'],
		['full-review/last-message.json', 'full-review-model-output.json'],
		['full-review/codex-run-summary.json', 'full-review-codex-run-summary.json'],
		['cue-review-prompt.txt', 'cue-review-prompt.txt'],
		['cue-review.json', 'cue-review.json'],
		['cue-review/last-message.json', 'cue-review-model-output.json'],
		['cue-review/codex-run-summary.json', 'cue-review-codex-run-summary.json'],
		['cue-replacement-review-prompt.txt', 'cue-replacement-review-prompt.txt'],
		['cue-replacement-review.json', 'cue-replacement-review.json'],
		['final-cue-review.json', 'final-cue-review.json'],
		['cue-replacement-review/last-message.json', 'cue-replacement-review-model-output.json'],
		['cue-replacement-review/codex-run-summary.json', 'cue-replacement-codex-run-summary.json']
	];
	for (const [sourceName, destinationName] of files) {
		const sourcePath = path.join(sourceDir, sourceName);
		if (!existsSync(sourcePath)) continue;
		const destinationPath = path.join(destinationDir, destinationName);
		if (sourceName.endsWith('/codex-run-summary.json')) {
			const summary = portableRecallRunSummary(
				JSON.parse(readFileSync(sourcePath, 'utf8')),
				rootDir
			);
			writeJson(destinationPath, summary);
			continue;
		}
		copyFileSync(sourcePath, destinationPath);
	}
}

function withoutFinalResponse(run) {
	const summary = portableRecallRunSummary(run, rootDir);
	delete summary.finalResponse;
	return summary;
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function relative(filePath) {
	return path.relative(rootDir, filePath);
}
