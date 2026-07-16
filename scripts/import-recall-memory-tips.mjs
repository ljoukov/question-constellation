#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { d1Batch, d1Rows } from './lib/d1-rest.mjs';
import {
	RECALL_MEMORY_TIP_EFFECTIVE_CONTENT_VERSION,
	RECALL_MEMORY_TIP_IMPORT_OWNER,
	RECALL_MEMORY_TIP_PROMPT_VERSION,
	RECALL_MEMORY_TIP_SCHEMA_VERSION,
	hashEffectiveRecallMemoryTip,
	hashRecallMemoryTipArtifact,
	verifyRecallMemoryTipBaseArtifactFiles,
	verifyRecallMemoryTipDurableCompanions
} from './lib/recall-memory-tip-enrichment.mjs';
import {
	buildRecallMemoryTipImportStatements,
	planRecallMemoryTipImport
} from './lib/recall-memory-tip-import.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
if (!args.input) throw new Error(`--input is required.\n\n${usage()}`);
const inputPath = path.resolve(rootDir, args.input);
const artifactDir = path.dirname(inputPath);
const artifact = JSON.parse(readFileSync(inputPath, 'utf8'));
const snapshot = JSON.parse(readFileSync(path.join(artifactDir, 'source-snapshot.json'), 'utf8'));
verifyRecallMemoryTipBaseArtifactFiles(rootDir, snapshot);
const artifactHash = hashRecallMemoryTipArtifact(artifact);
const artifactPath = path.relative(rootDir, inputPath);
requireDurableArtifact(inputPath, artifact, artifactHash);

await requireSchema();
const existing = await loadExisting(artifact);
const plan = planRecallMemoryTipImport(artifact, snapshot, existing, { artifactPath });
if (plan.conflicts.length) {
	emit({ status: 'conflict', dryRun: !args.write, input: artifactPath, plan: reportPlan(plan) });
	process.exit(1);
}
const statements = buildRecallMemoryTipImportStatements(artifact, snapshot, plan);
let verification = null;
if (args.write) {
	await d1Batch(statements, { rootDir, binding: 'QUESTION_DB' });
	verification = await verifyImport(artifact, snapshot, artifactHash, artifactPath);
}
emit({
	status: args.write ? 'imported' : 'dry_run',
	dryRun: !args.write,
	input: artifactPath,
	artifactHash,
	owner: RECALL_MEMORY_TIP_IMPORT_OWNER,
	plan: reportPlan(plan),
	statementCount: statements.length,
	transactionPayloadBytes: Buffer.byteLength(JSON.stringify(statements)),
	verification
});

function parseArgs(argv) {
	const value = (name, fallback = null) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
	return {
		help: argv.includes('--help') || argv.includes('-h'),
		input: value('input', ''),
		output: value('output'),
		write: argv.includes('--write')
	};
}

function usage() {
	return `Usage:
node scripts/import-recall-memory-tips.mjs \\
  --input=data/recall/enrichments/<run-id>/accepted-enrichments.json

The default is a read-only D1 schema, artifact, companion, immutable-base,
evidence, ownership, conflict and idempotency preflight. Add --write only after
reviewing that dry-run report. The write repeats every guard in one D1 batch and
performs an exact post-write verification.

Options:
  --write
  --output=<report.json>`;
}

function requireDurableArtifact(filePath, artifact, artifactHash) {
	const expectedPath = path.resolve(
		rootDir,
		`data/recall/enrichments/${artifact.run.id}/accepted-enrichments.json`
	);
	if (filePath !== expectedPath) {
		throw new Error(`--write accepts only the canonical durable artifact at ${expectedPath}.`);
	}
	verifyRecallMemoryTipDurableCompanions(path.dirname(filePath), artifact.companionArtifacts);
	const manifest = JSON.parse(
		readFileSync(path.join(path.dirname(filePath), 'recall-memory-tip-enrichment-run.json'), 'utf8')
	);
	if (
		manifest.status !== 'accepted' ||
		manifest.acceptedArtifact !== path.relative(rootDir, filePath) ||
		manifest.acceptedArtifactHash !== artifactHash ||
		manifest.run?.id !== artifact.run.id ||
		manifest.counts?.accepted !== artifact.enrichments.length ||
		manifest.counts?.rejected !== 0
	) {
		throw new Error('Durable memory-tip run manifest differs from the accepted artifact.');
	}
}

async function requireSchema() {
	const tables = [
		'recall_generation_runs',
		'recall_cards',
		'recall_card_evidence',
		'recall_memory_tip_enrichment_runs',
		'recall_card_memory_tip_enrichments'
	];
	const rows = await d1Rows(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${tables.map(() => '?').join(', ')})`,
		tables,
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const found = new Set(rows.map((row) => row.name));
	const missing = tables.filter((name) => !found.has(name));
	if (missing.length) throw new Error(`Memory-tip import schema is absent: ${missing.join(', ')}`);

	const requiredColumns = [
		'id',
		'enrichment_run_id',
		'card_id',
		'base_generation_run_id',
		'base_content_revision',
		'base_content_hash',
		'base_source_fingerprint',
		'base_artifact_hash',
		'base_artifact_path',
		'base_provenance_hash',
		'memory_tip',
		'effective_content_revision',
		'effective_hash_version',
		'effective_content_hash',
		'provenance_json',
		'status',
		'needs_human_review',
		'import_owner'
	];
	const columnRows = await d1Rows('PRAGMA table_info(recall_card_memory_tip_enrichments)', [], {
		rootDir,
		binding: 'QUESTION_DB'
	});
	const columns = new Set(columnRows.map((row) => row.name));
	const missingColumns = requiredColumns.filter((name) => !columns.has(name));
	if (missingColumns.length) {
		throw new Error(`Memory-tip enrichment columns are absent: ${missingColumns.join(', ')}`);
	}

	const triggers = [
		'recall_memory_tip_enrichment_runs_insert_as_accepted',
		'recall_memory_tip_enrichment_runs_metadata_immutable',
		'recall_memory_tip_enrichment_runs_status_transition',
		'recall_memory_tip_enrichment_runs_import_requires_published_rows',
		'recall_memory_tip_enrichment_runs_delete_immutable',
		'recall_memory_tip_enrichments_insert_as_draft',
		'recall_memory_tip_enrichments_insert_base_guard',
		'recall_memory_tip_enrichments_publish_base_guard',
		'recall_memory_tip_enrichments_publish_run_guard',
		'recall_memory_tip_enrichments_content_immutable',
		'recall_memory_tip_enrichments_status_transition',
		'recall_memory_tip_enrichments_delete_immutable'
	];
	const triggerRows = await d1Rows(
		`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN (${triggers.map(() => '?').join(', ')})`,
		triggers,
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const installedTriggers = new Set(triggerRows.map((row) => row.name));
	const missingTriggers = triggers.filter((name) => !installedTriggers.has(name));
	if (missingTriggers.length) {
		throw new Error(`Memory-tip integrity triggers are absent: ${missingTriggers.join(', ')}`);
	}
	const indexRows = await d1Rows(
		`SELECT name FROM sqlite_master
		 WHERE type = 'index' AND name = 'idx_recall_memory_tip_enrichments_one_published'`,
		[],
		{ rootDir, binding: 'QUESTION_DB' }
	);
	if (!indexRows.length) throw new Error('Published memory-tip uniqueness index is absent.');
}

async function loadExisting(artifact) {
	const cardIds = artifact.enrichments.map((row) => row.cardId);
	const enrichmentIds = artifact.enrichments.map((row) => row.id);
	const cardPlaceholders = cardIds.map(() => '?').join(', ');
	const enrichmentPlaceholders = enrichmentIds.map(() => '?').join(', ');
	const [runs, baseCards, evidence, enrichments, publishedForCards] = await Promise.all([
		d1Rows(`SELECT * FROM recall_memory_tip_enrichment_runs WHERE id = ?`, [artifact.run.id], {
			rootDir,
			binding: 'QUESTION_DB'
		}),
		d1Rows(
			`SELECT c.*,
			        run.status AS generation_status,
			        run.import_owner AS generation_import_owner,
			        run.source_fingerprint AS generation_source_fingerprint,
			        run.artifact_hash AS generation_artifact_hash,
			        run.artifact_path AS generation_artifact_path
			 FROM recall_cards c
			 JOIN recall_generation_runs run ON run.id = c.generation_run_id
			 WHERE c.id IN (${cardPlaceholders})`,
			cardIds,
			{ rootDir, binding: 'QUESTION_DB' }
		),
		d1Rows(
			`SELECT card_id, id, source_file_hash, excerpt_hash, source_excerpt, supports_json
			 FROM recall_card_evidence WHERE card_id IN (${cardPlaceholders})`,
			cardIds,
			{ rootDir, binding: 'QUESTION_DB' }
		),
		d1Rows(
			`SELECT * FROM recall_card_memory_tip_enrichments WHERE id IN (${enrichmentPlaceholders})`,
			enrichmentIds,
			{ rootDir, binding: 'QUESTION_DB' }
		),
		d1Rows(
			`SELECT * FROM recall_card_memory_tip_enrichments
			 WHERE card_id IN (${cardPlaceholders}) AND status = 'published'`,
			cardIds,
			{ rootDir, binding: 'QUESTION_DB' }
		)
	]);
	return {
		run: runs[0] ?? null,
		baseCards,
		evidence,
		enrichments,
		publishedForCards
	};
}

async function verifyImport(artifact, snapshot, artifactHash, artifactPath) {
	const existing = await loadExisting(artifact);
	const plan = planRecallMemoryTipImport(artifact, snapshot, existing, { artifactPath });
	if (
		plan.conflicts.length ||
		plan.counts.insert !== 0 ||
		plan.counts.noop !== artifact.enrichments.length ||
		plan.run.needsFinalization ||
		plan.artifactHash !== artifactHash
	) {
		throw new Error(`Memory-tip post-write verification failed: ${JSON.stringify(plan)}`);
	}
	for (const row of existing.enrichments) {
		const accepted = artifact.enrichments.find((entry) => entry.id === row.id);
		if (
			!accepted ||
			row.effective_hash_version !== RECALL_MEMORY_TIP_EFFECTIVE_CONTENT_VERSION ||
			row.effective_content_hash !==
				hashEffectiveRecallMemoryTip(accepted.baseContentHash, accepted.memoryTip)
		) {
			throw new Error(`Memory-tip effective identity verification failed for ${row.id}.`);
		}
	}
	return {
		runId: artifact.run.id,
		runStatus: existing.run?.status,
		published: existing.enrichments.length,
		idempotentNoops: plan.counts.noop,
		schemaVersion: RECALL_MEMORY_TIP_SCHEMA_VERSION,
		promptVersion: RECALL_MEMORY_TIP_PROMPT_VERSION,
		effectiveHashVersion: RECALL_MEMORY_TIP_EFFECTIVE_CONTENT_VERSION
	};
}

function emit(value) {
	const output = `${JSON.stringify(value, null, 2)}\n`;
	if (args.output) writeFileSync(path.resolve(rootDir, args.output), output);
	process.stdout.write(output);
}

function reportPlan(plan) {
	return {
		owner: plan.owner,
		artifactHash: plan.artifactHash,
		artifactPath: plan.artifactPath,
		run: plan.run,
		actions: plan.actions.map((action) => ({
			type: action.type,
			cardId: action.row.cardId,
			effectiveContentRevision: action.row.effectiveContentRevision,
			effectiveContentHash: action.row.effectiveContentHash
		})),
		conflicts: plan.conflicts,
		counts: plan.counts
	};
}
