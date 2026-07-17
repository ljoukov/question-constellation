#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Historical rollout JSONL is parsed and pinned by exact hashes.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BATCH_ID = 'aqa-combined-science-trilogy-8464-physics-shared-descendants-03-e7b6933413-v1';
const GENERATOR_RUN_ID = '019f6c49-a3cc-7ee1-b385-9064ede9c439';
const REVIEWER_RUN_ID = '019f6c4e-fbb3-76f2-b189-dc3edf004d2f';
const REPAIR_GENERATOR_RUN_ID = '019f6c51-9268-7420-9cad-77ae86eea363';
const MODEL = 'gpt-5.6-sol';
const THINKING_LEVEL = 'max';
const EXACT_RECONSTRUCTED_HASHES = Object.freeze({
	'plan.json': '953b7d82b14be49a045d323b8a2cafa0ea05d913b0dc35d0696da0c97cb48a0b',
	'candidate-cards.json': 'd1f7616bb32594d5401a669bbb6fb304dda89037d48e73f4f7c97e1d9fda1034',
	'review.json': 'c3db5ff5900cd10ae5bd5b4bb06c51f94cd6de1252e9a752f873c28782fd4ee0',
	'reviewed-repair-generation-1-model-output.json':
		'e5625995d660028d539514a667c1dac6cbdc6c0131f4b706e392b10513e6d2ee',
	'source-evidence.json': 'f0255476152410f713a2226a9a50d24bf7314c3eac0e8c7e8da03630fd76a7b0'
});

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
const sessionRoot = path.resolve(
	args.sessionRoot ?? path.join(os.homedir(), '.codex/sessions/2026/07/16')
);
const outputDir = path.resolve(
	args.outputDir ?? path.join('data/study-cards/rollout-recovery', BATCH_ID)
);
if (existsSync(outputDir)) {
	if (!args.force) throw new Error(`Recovered trace already exists: ${relative(outputDir)}.`);
	rmSync(outputDir, { recursive: true, force: true });
}
mkdirSync(outputDir, { recursive: true });

const generator = loadSession(GENERATOR_RUN_ID);
const reviewer = loadSession(REVIEWER_RUN_ID);
const repairGenerator = loadSession(REPAIR_GENERATOR_RUN_ID);
for (const session of [generator, reviewer, repairGenerator]) {
	if (!session.cwd.includes(`/study-card-generation/${BATCH_ID}/`)) {
		throw new Error(`${session.runId} does not belong to ${BATCH_ID}.`);
	}
}

const scope = parseGenerationScope(generator.prompt);
const candidates = parseReviewCandidates(reviewer.prompt);
if (generator.output?.cards?.length !== 15 || candidates.cards?.length !== 15) {
	throw new Error('Failed Combined Physics trace no longer contains exactly 15 candidates.');
}
if (reviewer.output?.reviews?.length !== 15) {
	throw new Error('Failed Combined Physics trace no longer contains exactly 15 reviews.');
}
for (const [index, card] of candidates.cards.entries()) {
	if (reviewer.output.reviews[index]?.cardId !== card.id) {
		throw new Error(`Reviewer identity drift at ${index}.`);
	}
}
if (repairGenerator.output?.cards?.length !== 3) {
	throw new Error('Failed Combined Physics trace no longer contains three repair candidates.');
}

const catalog = readJson(path.join(rootDir, 'data/curricula/curriculum-catalog.json'));
const specification = catalog.specifications.find((entry) => entry.id === scope.specification.id);
if (!specification) throw new Error(`Unknown specification ${scope.specification.id}.`);
const plan = {
	schemaVersion: 'standard-study-deck-v1',
	promptVersion: 'standard-study-card-descendant-coverage-v1',
	batchId: BATCH_ID,
	specificationId: scope.specification.id,
	board: scope.specification.board,
	qualification: scope.specification.qualification,
	subject: 'Physics',
	offeringIds: scope.offerings.map((offering) => offering.id),
	topicComponentIds: scope.topics.map((topic) => topic.topicComponentId),
	generationMode: 'required-descendants',
	requiredComponentIds: scope.topics.flatMap((topic) =>
		topic.components.map((component) => component.id)
	),
	expectedCardCount: 15,
	model: MODEL,
	thinkingLevel: THINKING_LEVEL,
	sourcePdf: {
		path: specification.localPath,
		sha256: specification.sha256
	}
};
const sourceEvidence = {
	plan,
	specification: scope.specification,
	offerings: scope.offerings,
	topics: scope.topics
};

writeJson(path.join(outputDir, 'plan.json'), plan);
writeJson(path.join(outputDir, 'candidate-cards.json'), candidates);
writeJson(path.join(outputDir, 'review.json'), reviewer.output);
writeFileSync(
	path.join(outputDir, 'reviewed-repair-generation-1-model-output.json'),
	`${repairGenerator.outputText}\n`
);
writeJson(path.join(outputDir, 'source-evidence.json'), sourceEvidence);
writeText(path.join(outputDir, 'generation-prompt.txt'), generator.prompt);
writeJson(path.join(outputDir, 'generation-model-output.json'), generator.output);
writeText(path.join(outputDir, 'review-prompt.txt'), reviewer.prompt);
writeJson(path.join(outputDir, 'review-model-output.json'), reviewer.output);
writeText(path.join(outputDir, 'reviewed-repair-generation-1-prompt.txt'), repairGenerator.prompt);

const summaries = [
	['generation/codex-run-summary.json', generator],
	['review/codex-run-summary.json', reviewer],
	['reviewed-repair-generation-1/codex-run-summary.json', repairGenerator]
];
for (const [relativePath, session] of summaries) {
	writeJson(path.join(outputDir, relativePath), recoveredSummary(session));
}

const reconstructedHashes = Object.fromEntries(
	Object.keys(EXACT_RECONSTRUCTED_HASHES).map((name) => [
		name,
		sha256(readFileSync(path.join(outputDir, name)))
	])
);
if (
	Object.entries(EXACT_RECONSTRUCTED_HASHES).some(
		([name, expected]) => reconstructedHashes[name] !== expected
	)
) {
	throw new Error(
		`A byte-exact failed-trace reconstruction drifted: ${JSON.stringify(reconstructedHashes)}.`
	);
}
const summaryHashes = Object.fromEntries(
	summaries.map(([name]) => [name, sha256(readFileSync(path.join(outputDir, name)))])
);
const reviews = reviewer.output.reviews;
const acceptedCardIds = reviews.filter((review) => review.accepted).map((review) => review.cardId);
const rejectedCardIds = reviews.filter((review) => !review.accepted).map((review) => review.cardId);
if (acceptedCardIds.length !== 12 || rejectedCardIds.length !== 3) {
	throw new Error('Archived reviewer acceptance split drifted from 12 accepted / 3 rejected.');
}

const evidence = {
	schemaVersion: 'failed-combined-physics-rollout-trace-recovery-v1',
	status: 'exact_core_files_reconstructed_from_jsonl',
	policy:
		'Only the 12 cards accepted by the archived independent reviewer are treated as accepted evidence. The three rejected cards remain rejected; generated repair candidates are not accepted without a fresh independent review.',
	batchId: BATCH_ID,
	outputDir: relative(outputDir),
	sessionRoot,
	modelCallsDuringRecovery: 0,
	exactCoreFileHashes: reconstructedHashes,
	reconstructedSummaryHashes: summaryHashes,
	summaryIdentityPolicy:
		'Original SDK summary wrappers were absent. Minimal summaries are reconstructed from JSONL run ids, boundaries and token counts and are explicitly labelled; they are not claimed byte-identical to the missing wrappers.',
	sessions: {
		generator: sessionEvidence(generator),
		reviewer: sessionEvidence(reviewer),
		repairGenerator: sessionEvidence(repairGenerator)
	},
	counts: {
		generated: generator.output.cards.length,
		reviewed: reviews.length,
		acceptedByArchivedReviewer: acceptedCardIds.length,
		rejectedByArchivedReviewer: rejectedCardIds.length,
		generatedRepairCandidatesNotYetAccepted: repairGenerator.output.cards.length
	},
	acceptedCardIds,
	rejectedCardIds,
	repairCandidateIds: repairGenerator.output.cards.map((card) => card.id)
};
writeJson(path.join(outputDir, 'recovery-evidence.json'), evidence);

console.log(
	JSON.stringify(
		{
			status: evidence.status,
			outputDir: evidence.outputDir,
			exactCoreFileHashes: reconstructedHashes,
			counts: evidence.counts,
			modelCallsDuringRecovery: 0
		},
		null,
		2
	)
);

function loadSession(runId) {
	const fileName = readdirSync(sessionRoot).find((name) => name.endsWith(`-${runId}.jsonl`));
	if (!fileName) throw new Error(`Rollout JSONL is missing for ${runId}.`);
	const filePath = path.join(sessionRoot, fileName);
	const raw = readFileSync(filePath, 'utf8');
	const rows = raw
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
	const metaRow = rows.find((row) => row.type === 'session_meta');
	const complete = rows
		.filter((row) => row.type === 'event_msg' && row.payload?.type === 'task_complete')
		.at(-1);
	const tokenCount = rows
		.filter((row) => row.type === 'event_msg' && row.payload?.type === 'token_count')
		.at(-1);
	const user = rows
		.filter((row) => row.type === 'response_item' && row.payload?.role === 'user')
		.at(-1);
	if (!metaRow || !complete?.payload?.last_agent_message || !user) {
		throw new Error(`${fileName} lacks complete trace evidence.`);
	}
	const prompt = user.payload.content.map((entry) => entry.text ?? '').join('\n');
	const outputText = complete.payload.last_agent_message;
	return {
		runId,
		fileName,
		filePath,
		fileHash: sha256(raw),
		cwd: metaRow.payload.cwd,
		startedAt: metaRow.timestamp,
		completedAt: complete.timestamp,
		prompt,
		promptHash: sha256(prompt),
		outputText,
		outputHash: sha256(outputText),
		output: JSON.parse(outputText),
		usage: tokenCount?.payload?.info?.total_token_usage ?? null,
		rowCount: rows.length
	};
}

function recoveredSummary(session) {
	return {
		status: 'passed',
		error: null,
		threadId: session.runId,
		model: MODEL,
		thinkingLevel: THINKING_LEVEL,
		workDir: session.cwd,
		startedAt: session.startedAt,
		finishedAt: session.completedAt,
		durationSeconds: Number(
			((Date.parse(session.completedAt) - Date.parse(session.startedAt)) / 1000).toFixed(3)
		),
		usage: session.usage,
		recovery:
			'summary reconstructed from preserved rollout JSONL identity, boundaries and token counts'
	};
}

function sessionEvidence(session) {
	return {
		runId: session.runId,
		rolloutFileName: session.fileName,
		rolloutHash: session.fileHash,
		cwd: session.cwd,
		startedAt: session.startedAt,
		completedAt: session.completedAt,
		promptHash: session.promptHash,
		modelOutputHash: session.outputHash,
		usage: session.usage,
		rowCount: session.rowCount
	};
}

function parseGenerationScope(prompt) {
	const marker = '\nDeterministic scope:\n';
	const index = prompt.lastIndexOf(marker);
	if (index < 0) throw new Error('Generator prompt lacks deterministic scope.');
	return JSON.parse(prompt.slice(index + marker.length));
}

function parseReviewCandidates(prompt) {
	const marker = '\nCandidates:\n';
	const index = prompt.lastIndexOf(marker);
	if (index < 0) throw new Error('Reviewer prompt lacks candidates.');
	return JSON.parse(prompt.slice(index + marker.length));
}

function parseArgs(argv) {
	const value = (name) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
	return {
		force: argv.includes('--force'),
		sessionRoot: value('session-root'),
		outputDir: value('output-dir')
	};
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${value.replace(/\s+$/, '')}\n`);
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
