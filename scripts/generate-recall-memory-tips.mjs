#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { d1Rows } from './lib/d1-rest.mjs';
import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import { portableRecallRunSummary } from './lib/recall-generation-paths.mjs';
import {
	RECALL_MEMORY_TIP_GENERATION_OUTPUT_SCHEMA,
	RECALL_MEMORY_TIP_PROMPT_VERSION,
	RECALL_MEMORY_TIP_REVIEW_OUTPUT_SCHEMA,
	buildRecallMemoryTipCompanionIdentity,
	buildRecallMemoryTipGenerationPrompt,
	buildRecallMemoryTipReviewPrompt,
	compileRecallMemoryTipArtifact,
	hashRecallMemoryTipArtifact,
	hashRecallMemoryTipSourceSnapshot,
	normalizeRecallMemoryTipSourceSnapshot,
	parseRecallMemoryTipJson,
	validateRecallMemoryTipCandidates,
	validateRecallMemoryTipReviews,
	verifyRecallMemoryTipBaseArtifactFiles
} from './lib/recall-memory-tip-enrichment.mjs';

const rootDir = process.cwd();
loadDefaultEnv(rootDir);
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
for (const [stage, model, thinkingLevel] of [
	['generator', args.model, args.thinkingLevel],
	['reviewer', args.reviewerModel, args.reviewerThinkingLevel]
]) {
	if (model !== 'gpt-5.6-sol' || thinkingLevel !== 'max') {
		throw new Error(`${stage} must use gpt-5.6-sol/max for import-grade enrichment.`);
	}
}

const workRoot = path.resolve(rootDir, 'tmp/recall-memory-tip-enrichment');
const workDir = path.resolve(workRoot, args.runId);
const artifactRoot = path.resolve(rootDir, 'data/recall/enrichments');
const artifactDir = path.resolve(artifactRoot, args.runId);
assertStrictChild(workRoot, workDir, 'work directory');
assertStrictChild(artifactRoot, artifactDir, 'artifact directory');
const startedAt = new Date().toISOString();
const snapshot = await loadBaseSnapshot(args.cardIds);
verifyRecallMemoryTipBaseArtifactFiles(rootDir, snapshot);
const sourceFingerprint = hashRecallMemoryTipSourceSnapshot(snapshot);
const plan = {
	status: args.generate ? 'generation_requested' : 'dry_run',
	runId: args.runId,
	cardIds: snapshot.cards.map((card) => card.id),
	cardCount: snapshot.cards.length,
	sourceFingerprint,
	workDir: relative(workDir),
	artifactDir: relative(artifactDir),
	artifactPath: relative(path.join(artifactDir, 'accepted-enrichments.json')),
	schemaVersion: 'recall-memory-tip-enrichment-v1',
	promptVersion: RECALL_MEMORY_TIP_PROMPT_VERSION,
	models: {
		generator: { model: args.model, thinkingLevel: args.thinkingLevel },
		reviewer: { model: args.reviewerModel, thinkingLevel: args.reviewerThinkingLevel }
	}
};

if (!args.generate) {
	console.log(
		JSON.stringify(
			{
				...plan,
				note: 'Read-only D1/base-artifact preflight passed; add --generate for two Codex turns.'
			},
			null,
			2
		)
	);
	process.exit(0);
}

prepareDirectory(workDir, args.force);
if (existsSync(artifactDir)) {
	throw new Error(`Durable artifact directory already exists: ${relative(artifactDir)}`);
}
writeJson(path.join(workDir, 'plan.json'), plan);
writeJson(path.join(workDir, 'source-snapshot.json'), snapshot);
let generatorRun = null;
let reviewerRun = null;
try {
	const generationPrompt = buildRecallMemoryTipGenerationPrompt(snapshot);
	writeFileSync(path.join(workDir, 'generation-prompt.txt'), `${generationPrompt}\n`);
	generatorRun = await runStage({
		stage: 'generation',
		prompt: generationPrompt,
		outputSchema: RECALL_MEMORY_TIP_GENERATION_OUTPUT_SCHEMA,
		model: args.model,
		thinkingLevel: args.thinkingLevel
	});
	const candidates = validateRecallMemoryTipCandidates(
		parseRecallMemoryTipJson(generatorRun.finalResponse),
		snapshot
	);
	writeJson(path.join(workDir, 'candidate-enrichments.json'), candidates);

	const reviewPrompt = buildRecallMemoryTipReviewPrompt(snapshot, candidates);
	writeFileSync(path.join(workDir, 'review-prompt.txt'), `${reviewPrompt}\n`);
	reviewerRun = await runStage({
		stage: 'review',
		prompt: reviewPrompt,
		outputSchema: RECALL_MEMORY_TIP_REVIEW_OUTPUT_SCHEMA,
		model: args.reviewerModel,
		thinkingLevel: args.reviewerThinkingLevel
	});
	const reviews = validateRecallMemoryTipReviews(
		parseRecallMemoryTipJson(reviewerRun.finalResponse),
		candidates
	);
	writeJson(path.join(workDir, 'review.json'), reviews);
	const rejected = reviews.reviews
		.filter((review) => !review.accepted)
		.map((review) => ({
			candidate: candidates.tips.find((tip) => tip.cardId === review.cardId),
			review
		}));
	writeJson(path.join(workDir, 'rejected-enrichments.json'), { enrichments: rejected });

	const run = {
		id: args.runId,
		startedAt,
		finishedAt: new Date().toISOString(),
		generator: { model: args.model, thinkingLevel: args.thinkingLevel },
		reviewer: {
			model: args.reviewerModel,
			thinkingLevel: args.reviewerThinkingLevel,
			independentTurn: true
		}
	};
	const companionArtifacts = buildRecallMemoryTipCompanionIdentity(workDir);
	const artifact = compileRecallMemoryTipArtifact({
		snapshot,
		candidates,
		reviews,
		run,
		companionArtifacts
	});
	mkdirSync(artifactDir, { recursive: true });
	copyDurableFiles(workDir, artifactDir);
	writeJson(path.join(artifactDir, 'accepted-enrichments.json'), artifact);
	writeJson(path.join(artifactDir, 'rejected-enrichments.json'), { enrichments: rejected });
	const manifest = {
		status: 'accepted',
		plan,
		run,
		counts: {
			generated: candidates.tips.length,
			accepted: artifact.enrichments.length,
			rejected: rejected.length
		},
		acceptedArtifact: relative(path.join(artifactDir, 'accepted-enrichments.json')),
		acceptedArtifactHash: hashRecallMemoryTipArtifact(artifact),
		companionArtifacts,
		codex: {
			generator: withoutFinalResponse(generatorRun),
			reviewer: withoutFinalResponse(reviewerRun)
		}
	};
	writeJson(path.join(workDir, 'recall-memory-tip-enrichment-run.json'), manifest);
	writeJson(path.join(artifactDir, 'recall-memory-tip-enrichment-run.json'), manifest);
	console.log(JSON.stringify(manifest, null, 2));
} catch (error) {
	const failure = {
		status: 'rejected',
		plan,
		startedAt,
		finishedAt: new Date().toISOString(),
		error: error instanceof Error ? error.message : String(error),
		codex: {
			generator: generatorRun ? withoutFinalResponse(generatorRun) : null,
			reviewer: reviewerRun ? withoutFinalResponse(reviewerRun) : null
		}
	};
	writeJson(path.join(workDir, 'recall-memory-tip-enrichment-run.json'), failure);
	console.error(JSON.stringify(failure, null, 2));
	process.exit(1);
}

async function loadBaseSnapshot(cardIds) {
	const placeholders = cardIds.map(() => '?').join(', ');
	const cards = await d1Rows(
		`SELECT c.id, c.concept_key, c.board, c.qualification, c.subject, c.kind,
		        c.visual_cue, c.front, c.back, c.reverse_front, c.reverse_back,
		        c.explanation, c.memory_tip, c.content_revision, c.content_hash,
		        c.source_fingerprint, c.generation_run_id, c.provenance_json,
		        c.status, c.needs_human_review, c.import_owner,
		        run.schema_version AS generation_schema_version,
		        run.prompt_version AS generation_prompt_version,
		        run.source_fingerprint AS generation_source_fingerprint,
		        run.artifact_hash AS generation_artifact_hash,
		        run.artifact_path AS generation_artifact_path,
		        run.status AS generation_status, run.import_owner AS generation_import_owner
		 FROM recall_cards c
		 JOIN recall_generation_runs run ON run.id = c.generation_run_id
		 WHERE c.id IN (${placeholders})`,
		cardIds,
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const found = new Set(cards.map((card) => card.id));
	const missing = cardIds.filter((id) => !found.has(id));
	if (missing.length) throw new Error(`Unknown recall card id(s): ${missing.join(', ')}`);
	const [choices, evidence, targets] = await Promise.all([
		d1Rows(
			`SELECT card_id, display_order, choice_key, text, is_correct, feedback, misconception
			 FROM recall_card_choices WHERE card_id IN (${placeholders})
			 ORDER BY card_id, display_order`,
			cardIds,
			{ rootDir, binding: 'QUESTION_DB' }
		),
		d1Rows(
			`SELECT card_id, id, source_kind, specification_id, curriculum_component_id,
			        source_page_start, source_page_end, source_excerpt, source_file_hash,
			        excerpt_hash, supports_json
			 FROM recall_card_evidence WHERE card_id IN (${placeholders})
			 ORDER BY card_id, id`,
			cardIds,
			{ rootDir, binding: 'QUESTION_DB' }
		),
		d1Rows(
			`SELECT card_id, offering_id, curriculum_component_id, topic_component_id,
			        is_primary, confidence, reviewed, mapping_source
			 FROM recall_card_curriculum_targets WHERE card_id IN (${placeholders})
			 ORDER BY card_id, offering_id`,
			cardIds,
			{ rootDir, binding: 'QUESTION_DB' }
		)
	]);
	const group = (rows) => {
		const result = new Map();
		for (const row of rows) {
			if (!result.has(row.card_id)) result.set(row.card_id, []);
			result.get(row.card_id).push(row);
		}
		return result;
	};
	const choicesByCard = group(choices);
	const evidenceByCard = group(evidence);
	const targetsByCard = group(targets);
	return normalizeRecallMemoryTipSourceSnapshot({
		cards: cards.map((card) => ({
			id: card.id,
			conceptKey: card.concept_key,
			board: card.board,
			qualification: card.qualification,
			subject: card.subject,
			kind: card.kind,
			visualCue: card.visual_cue,
			front: card.front,
			back: card.back,
			reverseFront: card.reverse_front,
			reverseBack: card.reverse_back,
			explanation: card.explanation,
			memoryTip: card.memory_tip,
			contentRevision: Number(card.content_revision),
			contentHash: card.content_hash,
			sourceFingerprint: card.source_fingerprint,
			generationRunId: card.generation_run_id,
			provenance: card.provenance_json,
			status: card.status,
			needsHumanReview: Number(card.needs_human_review),
			importOwner: card.import_owner,
			generationRun: {
				id: card.generation_run_id,
				schemaVersion: card.generation_schema_version,
				promptVersion: card.generation_prompt_version,
				sourceFingerprint: card.generation_source_fingerprint,
				artifactHash: card.generation_artifact_hash,
				artifactPath: card.generation_artifact_path,
				status: card.generation_status,
				importOwner: card.generation_import_owner
			},
			choices: (choicesByCard.get(card.id) ?? []).map((choice) => ({
				displayOrder: Number(choice.display_order),
				choiceKey: choice.choice_key,
				text: choice.text,
				isCorrect: Number(choice.is_correct),
				feedback: choice.feedback,
				misconception: choice.misconception
			})),
			evidence: (evidenceByCard.get(card.id) ?? []).map((row) => ({
				id: row.id,
				sourceKind: row.source_kind,
				specificationId: row.specification_id,
				curriculumComponentId: row.curriculum_component_id,
				pageStart: Number(row.source_page_start),
				pageEnd: Number(row.source_page_end),
				sourceExcerpt: row.source_excerpt,
				sourceFileHash: row.source_file_hash,
				excerptHash: row.excerpt_hash,
				supports: parseJson(row.supports_json, `${card.id}:${row.id} supports_json`)
			})),
			targets: (targetsByCard.get(card.id) ?? []).map((target) => ({
				offeringId: target.offering_id,
				curriculumComponentId: target.curriculum_component_id,
				topicComponentId: target.topic_component_id,
				isPrimary: Number(target.is_primary),
				confidence: Number(target.confidence),
				reviewed: Number(target.reviewed),
				mappingSource: target.mapping_source
			}))
		}))
	});
}

async function runStage({ stage, prompt, outputSchema, model, thinkingLevel }) {
	const stageDir = path.join(workDir, stage);
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
	const help = argv.includes('--help') || argv.includes('-h');
	const runId = value('run-id', '');
	const cardIds = [...new Set(values('card-id'))].sort();
	if (!help) {
		if (!runId || !/^[a-z0-9]+(?:-[a-z0-9]+)*-enricher-v1$/.test(runId)) {
			throw new Error('--run-id is required and must be kebab-case ending in -enricher-v1.');
		}
		if (!cardIds.length || cardIds.length > 20) {
			throw new Error('Repeat --card-id for between 1 and 20 explicit immutable base cards.');
		}
		for (const id of cardIds) {
			if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Invalid card id: ${id}`);
		}
	}
	const timeoutMs = Number(value('timeout-ms', '3600000'));
	if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 14_400_000) {
		throw new Error('--timeout-ms must be an integer from 1 to 14400000.');
	}
	return {
		help,
		generate: argv.includes('--generate'),
		force: argv.includes('--force'),
		runId,
		cardIds,
		model: value('model', 'gpt-5.6-sol'),
		thinkingLevel: value('thinking-level', 'max'),
		reviewerModel: value('reviewer-model', 'gpt-5.6-sol'),
		reviewerThinkingLevel: value('reviewer-thinking-level', 'max'),
		timeoutMs
	};
}

function usage() {
	return `Usage:
node scripts/generate-recall-memory-tips.mjs \\
  --run-id=<stable-name-enricher-v1> \\
  --card-id=<published recall card id> [--card-id=<another id>]

The default is a zero-model-cost read-only D1 and durable-base-artifact preflight.
Add --generate to run one gpt-5.6-sol/max generator turn followed by a separate
gpt-5.6-sol/max reviewer turn. Every selected card must pass review; partial
accepted batches are rejected.

Options:
  --generate
  --force
  --model=gpt-5.6-sol --thinking-level=max
  --reviewer-model=gpt-5.6-sol --reviewer-thinking-level=max
  --timeout-ms=3600000`;
}

function copyDurableFiles(sourceDir, destinationDir) {
	for (const [source, destination] of [
		['plan.json', 'plan.json'],
		['source-snapshot.json', 'source-snapshot.json'],
		['generation-prompt.txt', 'generation-prompt.txt'],
		['generation/last-message.json', 'generation-model-output.json'],
		['generation/codex-run-summary.json', 'generation-codex-run-summary.json'],
		['candidate-enrichments.json', 'candidate-enrichments.json'],
		['review-prompt.txt', 'review-prompt.txt'],
		['review/last-message.json', 'review-model-output.json'],
		['review/codex-run-summary.json', 'review-codex-run-summary.json'],
		['review.json', 'review.json']
	]) {
		const sourcePath = path.join(sourceDir, source);
		const destinationPath = path.join(destinationDir, destination);
		if (source.endsWith('codex-run-summary.json')) {
			writeJson(
				destinationPath,
				portableRecallRunSummary(JSON.parse(readFileSync(sourcePath, 'utf8')), rootDir)
			);
		} else {
			copyFileSync(sourcePath, destinationPath);
		}
	}
}

function prepareDirectory(directory, force) {
	if (existsSync(directory)) {
		if (!force) throw new Error(`Work directory exists; pass --force: ${relative(directory)}`);
		rmSync(directory, { recursive: true, force: true });
	}
	mkdirSync(directory, { recursive: true });
}

function parseJson(value, label) {
	try {
		return JSON.parse(value);
	} catch {
		throw new Error(`${label} is invalid JSON.`);
	}
}

function assertStrictChild(parent, child, label) {
	if (!child.startsWith(`${parent}${path.sep}`)) throw new Error(`${label} escapes its safe root.`);
}

function withoutFinalResponse(run) {
	const result = portableRecallRunSummary(run, rootDir);
	delete result.finalResponse;
	return result;
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function relative(filePath) {
	return path.relative(rootDir, filePath);
}
