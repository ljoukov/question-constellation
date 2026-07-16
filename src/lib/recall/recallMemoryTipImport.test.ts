import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

import {
	RECALL_MEMORY_TIP_EFFECTIVE_CONTENT_VERSION,
	RECALL_MEMORY_TIP_IMPORT_OWNER,
	compileRecallMemoryTipArtifact,
	hashRecallMemoryTipArtifact
} from '../../../scripts/lib/recall-memory-tip-enrichment.mjs';
import {
	buildRecallMemoryTipImportStatements,
	planRecallMemoryTipImport
} from '../../../scripts/lib/recall-memory-tip-import.mjs';
import { stableStringify } from '../../../scripts/lib/recall-card-bundle.mjs';
import {
	candidateFixture,
	companionFixture,
	reviewFixture,
	runFixture,
	snapshotFixture
} from './recallMemoryTipTestFixtures';

describe('recall memory-tip D1 import', () => {
	it('plans an immutable insert and guards every base, artifact, provenance and evidence identity', () => {
		const { artifact, snapshot, existing, artifactPath } = fixture();
		const plan = planRecallMemoryTipImport(artifact, snapshot, existing, { artifactPath });
		expect(plan.counts).toEqual({ insert: 1, noop: 0, conflicts: 0 });
		const statements = buildRecallMemoryTipImportStatements(artifact, snapshot, plan);
		expectEveryPlaceholderBound(statements);
		expect(statements[0].sql).toContain('recall_memory_tip_enrichment_runs');
		const insert = statements.find((statement) =>
			statement.sql.includes('INSERT INTO recall_card_memory_tip_enrichments')
		)!;
		expect(insert.sql).toContain('base_source_fingerprint');
		expect(insert.sql).toContain('base_artifact_hash');
		expect(insert.sql).toContain('base_artifact_path');
		expect(insert.sql).toContain('base_provenance_hash');
		expect(insert.sql).toContain('effective_hash_version');
		expect(insert.sql).toContain('c.provenance_json = ?');
		expect(insert.sql).toContain('evidence.source_excerpt = ?');
		expect(insert.sql).toContain('evidence.supports_json = ?');
		expect(statements.at(-2)?.sql).toContain("json_extract('memory-tip-import-count-mismatch'");
		expect(statements.at(-1)?.sql).toContain("SET status = 'imported'");
	});

	it('is idempotent only for the exact published overlay and imported run', () => {
		const { artifact, snapshot, existing, artifactPath } = fixture();
		const row = artifact.enrichments[0];
		existing.run = storedRun(artifact, artifactPath);
		existing.enrichments = [storedEnrichment(row)];
		existing.publishedForCards = existing.enrichments;
		const plan = planRecallMemoryTipImport(artifact, snapshot, existing, { artifactPath });
		expect(plan.counts).toEqual({ insert: 0, noop: 1, conflicts: 0 });
		expect(plan.run.needsFinalization).toBe(false);
		expect(buildRecallMemoryTipImportStatements(artifact, snapshot, plan)).toEqual([]);
	});

	it('fails closed when any live base, evidence or existing overlay identity drifts', () => {
		const first = fixture();
		first.existing.baseCards[0].source_fingerprint = 'f'.repeat(64);
		expect(
			planRecallMemoryTipImport(first.artifact, first.snapshot, first.existing, {
				artifactPath: first.artifactPath
			}).conflicts
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: expect.stringMatching(/base guard/) })
			])
		);

		const second = fixture();
		second.existing.evidence[0].supports_json = JSON.stringify(['front']);
		expect(
			planRecallMemoryTipImport(second.artifact, second.snapshot, second.existing, {
				artifactPath: second.artifactPath
			}).conflicts
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: expect.stringMatching(/evidence differs/) })
			])
		);

		const third = fixture();
		third.existing.enrichments = [
			{ ...storedEnrichment(third.artifact.enrichments[0]), memory_tip: 'Different tip.' }
		];
		expect(
			planRecallMemoryTipImport(third.artifact, third.snapshot, third.existing, {
				artifactPath: third.artifactPath
			}).conflicts
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: expect.stringMatching(/immutable/) })
			])
		);
	});

	it('uses a transaction-aborting count assertion instead of allowing a stale partial batch', () => {
		const { artifact, snapshot, existing, artifactPath } = fixture();
		const plan = planRecallMemoryTipImport(artifact, snapshot, existing, { artifactPath });
		const statements = buildRecallMemoryTipImportStatements(artifact, snapshot, plan);
		const assertion = statements.at(-2)!;
		const db = new DatabaseSync(':memory:');
		db.exec(`CREATE TABLE recall_card_memory_tip_enrichments (
		  enrichment_run_id TEXT, status TEXT, needs_human_review INTEGER, import_owner TEXT
		)`);
		expect(() => db.prepare(assertion.sql).get(...(assertion.params ?? []))).toThrow(
			/malformed JSON/
		);
		db.prepare(`INSERT INTO recall_card_memory_tip_enrichments VALUES (?, 'published', 0, ?)`).run(
			artifact.run.id,
			RECALL_MEMORY_TIP_IMPORT_OWNER
		);
		expect(db.prepare(assertion.sql).get(...(assertion.params ?? []))).toEqual({
			exact_published_enrichment_count: 1
		});
		db.close();
	});
});

function fixture(): any {
	const snapshot = snapshotFixture();
	const artifact = compileRecallMemoryTipArtifact({
		snapshot,
		candidates: candidateFixture(),
		reviews: reviewFixture(),
		run: runFixture(),
		companionArtifacts: companionFixture()
	});
	const card = snapshot.cards[0];
	return {
		artifact,
		snapshot,
		artifactPath: `data/recall/enrichments/${artifact.run.id}/accepted-enrichments.json`,
		existing: {
			run: null,
			baseCards: [
				{
					id: card.id,
					status: 'published',
					needs_human_review: 0,
					memory_tip: null,
					import_owner: 'recall-card-import/v1',
					generation_run_id: card.generationRunId,
					content_revision: card.contentRevision,
					content_hash: card.contentHash,
					source_fingerprint: card.sourceFingerprint,
					provenance_json: stableStringify(card.provenance),
					generation_status: 'imported',
					generation_import_owner: 'recall-card-import/v1',
					generation_source_fingerprint: card.sourceFingerprint,
					generation_artifact_hash: card.generationRun.artifactHash,
					generation_artifact_path: card.generationRun.artifactPath
				}
			],
			evidence: card.evidence.map((row: any) => ({
				card_id: card.id,
				id: row.id,
				source_file_hash: row.sourceFileHash,
				excerpt_hash: row.excerptHash,
				source_excerpt: row.sourceExcerpt,
				supports_json: stableStringify(row.supports)
			})),
			enrichments: [],
			publishedForCards: []
		}
	};
}

function storedRun(artifact: any, artifactPath: string) {
	return {
		id: artifact.run.id,
		schema_version: artifact.schemaVersion,
		prompt_version: artifact.promptVersion,
		generator_model: artifact.run.generator.model,
		generator_thinking_level: artifact.run.generator.thinkingLevel,
		reviewer_model: artifact.run.reviewer.model,
		reviewer_thinking_level: artifact.run.reviewer.thinkingLevel,
		source_fingerprint: artifact.sourceFingerprint,
		artifact_hash: hashRecallMemoryTipArtifact(artifact),
		artifact_path: artifactPath,
		run_json: stableStringify({
			run: artifact.run,
			sourceFingerprint: artifact.sourceFingerprint,
			enrichmentCount: artifact.enrichments.length,
			artifactHash: hashRecallMemoryTipArtifact(artifact),
			artifactPath
		}),
		started_at: artifact.run.startedAt,
		finished_at: artifact.run.finishedAt,
		status: 'imported',
		import_owner: RECALL_MEMORY_TIP_IMPORT_OWNER
	};
}

function storedEnrichment(row: any) {
	return {
		id: row.id,
		enrichment_run_id: row.provenance.enrichmentRunId,
		card_id: row.cardId,
		base_generation_run_id: row.baseGenerationRunId,
		base_content_revision: row.baseContentRevision,
		base_content_hash: row.baseContentHash,
		base_source_fingerprint: row.baseSourceFingerprint,
		base_artifact_hash: row.baseArtifactHash,
		base_artifact_path: row.baseArtifactPath,
		base_provenance_hash: row.baseProvenanceHash,
		memory_tip: row.memoryTip,
		effective_content_revision: row.effectiveContentRevision,
		effective_hash_version: RECALL_MEMORY_TIP_EFFECTIVE_CONTENT_VERSION,
		effective_content_hash: row.effectiveContentHash,
		provenance_json: stableStringify(row.provenance),
		status: 'published',
		needs_human_review: 0,
		import_owner: RECALL_MEMORY_TIP_IMPORT_OWNER
	};
}

function expectEveryPlaceholderBound(statements: Array<{ sql: string; params?: unknown[] }>) {
	for (const statement of statements) {
		const placeholders = [...statement.sql.matchAll(/\?/g)].length;
		expect(statement.params?.length ?? 0, statement.sql).toBe(placeholders);
	}
}
