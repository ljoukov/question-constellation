// @ts-nocheck -- D1 rows are dynamically shaped and are checked by exact runtime guards below.
import {
	RECALL_MEMORY_TIP_BASE_OWNER,
	RECALL_MEMORY_TIP_EFFECTIVE_CONTENT_VERSION,
	RECALL_MEMORY_TIP_IMPORT_OWNER,
	RECALL_MEMORY_TIP_PROMPT_VERSION,
	RECALL_MEMORY_TIP_SCHEMA_VERSION,
	hashEffectiveRecallMemoryTip,
	hashRecallMemoryTipArtifact,
	validateRecallMemoryTipArtifactAgainstSnapshot
} from './recall-memory-tip-enrichment.mjs';
import { sha256, stableStringify } from './recall-card-bundle.mjs';

export function canonicalJsonHash(value) {
	try {
		const parsed = typeof value === 'string' ? JSON.parse(value) : value;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		return sha256(stableStringify(parsed));
	} catch {
		return null;
	}
}

/**
 * Plan a strictly additive overlay import. Base cards and published overlays
 * are immutable; no flag can convert a conflict into an update.
 */
/**
 * @param {any} artifactInput
 * @param {any} snapshotInput
 * @param {{run?:any,baseCards?:any[],evidence?:any[],enrichments?:any[],publishedForCards?:any[]}} existing
 * @param {{artifactPath:string}} options
 */
export function planRecallMemoryTipImport(
	artifactInput,
	snapshotInput,
	{ run = null, baseCards = [], evidence = [], enrichments = [], publishedForCards = [] } = {},
	{ artifactPath }
) {
	const { artifact, snapshot } = validateRecallMemoryTipArtifactAgainstSnapshot(
		artifactInput,
		snapshotInput
	);
	const artifactHash = hashRecallMemoryTipArtifact(artifact);
	const conflicts = [];
	const expectedArtifactPath = `data/recall/enrichments/${artifact.run.id}/accepted-enrichments.json`;
	if (artifactPath !== expectedArtifactPath) {
		conflicts.push({
			table: 'recall_memory_tip_enrichment_runs',
			id: artifact.run.id,
			reason: `artifact path must be ${expectedArtifactPath}`
		});
	}
	if (run) validateStoredRun(run, artifact, artifactHash, artifactPath, conflicts);

	const snapshotById = new Map(snapshot.cards.map((card) => [card.id, card]));
	const baseById = new Map(baseCards.map((row) => [row.id, row]));
	const evidenceByKey = new Map(evidence.map((row) => [`${row.card_id}:${row.id}`, row]));
	const enrichmentById = new Map(enrichments.map((row) => [row.id, row]));
	const publishedByCard = new Map(publishedForCards.map((row) => [row.card_id, row]));
	const actions = [];

	for (const row of artifact.enrichments) {
		const snapshotCard = snapshotById.get(row.cardId);
		const base = baseById.get(row.cardId);
		if (!snapshotCard || !base) {
			conflicts.push({ cardId: row.cardId, reason: 'exact base card is missing' });
			continue;
		}
		validateBaseRow(row, snapshotCard, base, conflicts);
		validateEvidenceRows(row, evidenceByKey, conflicts);

		const otherPublished = publishedByCard.get(row.cardId);
		if (otherPublished && otherPublished.id !== row.id) {
			conflicts.push({
				cardId: row.cardId,
				existingId: otherPublished.id,
				reason: 'a different published memory-tip enrichment already exists'
			});
			continue;
		}
		const existing = enrichmentById.get(row.id);
		if (!existing) {
			actions.push({ type: 'insert', row });
			continue;
		}
		const same = storedEnrichmentMatches(existing, row);
		if (same && existing.status === 'published' && Number(existing.needs_human_review) === 0) {
			actions.push({ type: 'noop', row });
		} else {
			conflicts.push({
				cardId: row.cardId,
				existingId: existing.id,
				reason: same
					? `exact enrichment is ${existing.status}, not published`
					: 'existing enrichment identity or content differs; overlays are immutable'
			});
		}
	}
	return {
		owner: RECALL_MEMORY_TIP_IMPORT_OWNER,
		artifactHash,
		artifactPath,
		run: {
			id: artifact.run.id,
			type: run ? 'existing' : 'insert',
			needsFinalization: !run || run.status !== 'imported'
		},
		actions,
		conflicts,
		counts: {
			insert: actions.filter((action) => action.type === 'insert').length,
			noop: actions.filter((action) => action.type === 'noop').length,
			conflicts: conflicts.length
		}
	};
}

function validateStoredRun(run, artifact, artifactHash, artifactPath, conflicts) {
	if (run.status === 'rejected') {
		conflicts.push({
			table: 'recall_memory_tip_enrichment_runs',
			id: run.id,
			reason: 'rejected enrichment runs are terminal'
		});
	}
	if (run.import_owner !== RECALL_MEMORY_TIP_IMPORT_OWNER) {
		conflicts.push({
			table: 'recall_memory_tip_enrichment_runs',
			id: run.id,
			reason: 'wrong owner'
		});
	}
	if (
		run.schema_version !== RECALL_MEMORY_TIP_SCHEMA_VERSION ||
		run.prompt_version !== RECALL_MEMORY_TIP_PROMPT_VERSION ||
		run.generator_model !== artifact.run.generator.model ||
		run.generator_thinking_level !== artifact.run.generator.thinkingLevel ||
		run.reviewer_model !== artifact.run.reviewer.model ||
		run.reviewer_thinking_level !== artifact.run.reviewer.thinkingLevel ||
		run.source_fingerprint !== artifact.sourceFingerprint ||
		run.artifact_hash !== artifactHash ||
		run.artifact_path !== artifactPath ||
		run.started_at !== artifact.run.startedAt ||
		run.finished_at !== artifact.run.finishedAt ||
		canonicalStoredRunJson(run.run_json) !==
			stableStringify({
				run: artifact.run,
				sourceFingerprint: artifact.sourceFingerprint,
				enrichmentCount: artifact.enrichments.length,
				artifactHash,
				artifactPath
			})
	) {
		conflicts.push({
			table: 'recall_memory_tip_enrichment_runs',
			id: run.id,
			reason: 'stored run identity differs from the accepted artifact'
		});
	}
}

function canonicalStoredRunJson(value) {
	try {
		return stableStringify(typeof value === 'string' ? JSON.parse(value) : value);
	} catch {
		return null;
	}
}

function validateBaseRow(row, snapshotCard, base, conflicts) {
	const expectedProvenance = stableStringify(snapshotCard.provenance);
	const actualProvenanceHash = canonicalJsonHash(base.provenance_json);
	const expected = {
		status: 'published',
		needs_human_review: 0,
		memory_tip: null,
		import_owner: RECALL_MEMORY_TIP_BASE_OWNER,
		generation_run_id: row.baseGenerationRunId,
		content_revision: row.baseContentRevision,
		content_hash: row.baseContentHash,
		source_fingerprint: row.baseSourceFingerprint,
		generation_status: 'imported',
		generation_import_owner: RECALL_MEMORY_TIP_BASE_OWNER,
		generation_source_fingerprint: row.baseSourceFingerprint,
		generation_artifact_hash: row.baseArtifactHash,
		generation_artifact_path: row.baseArtifactPath
	};
	const mismatches = Object.entries(expected)
		.filter(([key, value]) => {
			const actual = key === 'memory_tip' ? (base[key] ?? null) : base[key];
			return String(actual) !== String(value);
		})
		.map(([key]) => key);
	let actualProvenance = null;
	try {
		actualProvenance = stableStringify(JSON.parse(base.provenance_json));
	} catch {
		// The mismatch is reported as provenance_json below.
	}
	if (actualProvenanceHash !== row.baseProvenanceHash || actualProvenance !== expectedProvenance) {
		mismatches.push('provenance_json');
	}
	if (mismatches.length) {
		conflicts.push({
			cardId: row.cardId,
			reason: `base guard mismatch: ${[...new Set(mismatches)].join(', ')}`
		});
	}
}

function validateEvidenceRows(row, evidenceByKey, conflicts) {
	for (const citation of row.provenance.citedEvidence) {
		const stored = evidenceByKey.get(`${row.cardId}:${citation.id}`);
		let storedSupports = null;
		try {
			storedSupports = JSON.parse(stored?.supports_json ?? 'null');
		} catch {
			// Report the same exact-evidence conflict below.
		}
		if (
			!stored ||
			stored.source_file_hash !== citation.sourceFileHash ||
			stored.excerpt_hash !== citation.excerptHash ||
			stored.source_excerpt !== citation.sourceExcerpt ||
			stableStringify(storedSupports) !== stableStringify(citation.supports) ||
			sha256(stableStringify(storedSupports)) !== citation.supportsHash
		) {
			conflicts.push({
				cardId: row.cardId,
				evidenceId: citation.id,
				reason: 'stored evidence differs from the reviewed citation identity'
			});
		}
	}
}

function storedEnrichmentMatches(stored, row) {
	return (
		stored.import_owner === RECALL_MEMORY_TIP_IMPORT_OWNER &&
		stored.enrichment_run_id === row.provenance.enrichmentRunId &&
		stored.card_id === row.cardId &&
		stored.base_generation_run_id === row.baseGenerationRunId &&
		Number(stored.base_content_revision) === row.baseContentRevision &&
		stored.base_content_hash === row.baseContentHash &&
		stored.base_source_fingerprint === row.baseSourceFingerprint &&
		stored.base_artifact_hash === row.baseArtifactHash &&
		stored.base_artifact_path === row.baseArtifactPath &&
		stored.base_provenance_hash === row.baseProvenanceHash &&
		stored.memory_tip === row.memoryTip &&
		Number(stored.effective_content_revision) === row.effectiveContentRevision &&
		stored.effective_hash_version === RECALL_MEMORY_TIP_EFFECTIVE_CONTENT_VERSION &&
		stored.effective_content_hash ===
			hashEffectiveRecallMemoryTip(row.baseContentHash, row.memoryTip) &&
		canonicalJsonHash(stored.provenance_json) === sha256(stableStringify(row.provenance))
	);
}

export function buildRecallMemoryTipImportStatements(artifactInput, snapshotInput, plan) {
	if (plan.conflicts.length) throw new Error('Cannot build memory-tip import SQL with conflicts.');
	const { artifact, snapshot } = validateRecallMemoryTipArtifactAgainstSnapshot(
		artifactInput,
		snapshotInput
	);
	const snapshotById = new Map(snapshot.cards.map((card) => [card.id, card]));
	const statements = [];
	if (plan.run.type === 'insert') {
		statements.push({
			sql: `INSERT INTO recall_memory_tip_enrichment_runs (
			        id, schema_version, prompt_version,
			        generator_model, generator_thinking_level,
			        reviewer_model, reviewer_thinking_level,
			        source_fingerprint, artifact_hash, artifact_path, run_json,
			        started_at, finished_at, status, import_owner, created_at, updated_at
			      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			params: [
				artifact.run.id,
				artifact.schemaVersion,
				artifact.promptVersion,
				artifact.run.generator.model,
				artifact.run.generator.thinkingLevel,
				artifact.run.reviewer.model,
				artifact.run.reviewer.thinkingLevel,
				artifact.sourceFingerprint,
				plan.artifactHash,
				plan.artifactPath,
				stableStringify({
					run: artifact.run,
					sourceFingerprint: artifact.sourceFingerprint,
					enrichmentCount: artifact.enrichments.length,
					artifactHash: plan.artifactHash,
					artifactPath: plan.artifactPath
				}),
				artifact.run.startedAt,
				artifact.run.finishedAt,
				RECALL_MEMORY_TIP_IMPORT_OWNER
			]
		});
	}

	for (const action of plan.actions) {
		if (action.type === 'noop') continue;
		const row = action.row;
		const card = snapshotById.get(row.cardId);
		const evidenceGuards = row.provenance.citedEvidence
			.map(
				() => `EXISTS (
					SELECT 1 FROM recall_card_evidence evidence
					WHERE evidence.card_id = c.id AND evidence.id = ?
					  AND evidence.source_file_hash = ? AND evidence.excerpt_hash = ?
					  AND evidence.source_excerpt = ? AND evidence.supports_json = ?
				)`
			)
			.join(' AND ');
		const baseGuard = `c.id = ? AND c.status = 'published' AND c.needs_human_review = 0
			AND c.memory_tip IS NULL AND c.import_owner = ?
			AND c.generation_run_id = ? AND c.content_revision = ? AND c.content_hash = ?
			AND c.source_fingerprint = ? AND c.provenance_json = ?
			AND base_run.id = c.generation_run_id AND base_run.status = 'imported'
			AND base_run.import_owner = ? AND base_run.source_fingerprint = ?
			AND base_run.artifact_hash = ? AND base_run.artifact_path = ?
			AND ${evidenceGuards}`;
		const baseParams = [
			row.cardId,
			RECALL_MEMORY_TIP_BASE_OWNER,
			row.baseGenerationRunId,
			row.baseContentRevision,
			row.baseContentHash,
			row.baseSourceFingerprint,
			stableStringify(card.provenance),
			RECALL_MEMORY_TIP_BASE_OWNER,
			row.baseSourceFingerprint,
			row.baseArtifactHash,
			row.baseArtifactPath,
			...row.provenance.citedEvidence.flatMap((citation) => [
				citation.id,
				citation.sourceFileHash,
				citation.excerptHash,
				citation.sourceExcerpt,
				stableStringify(citation.supports)
			])
		];
		const contentParams = [
			row.id,
			artifact.run.id,
			row.cardId,
			row.baseGenerationRunId,
			row.baseContentRevision,
			row.baseContentHash,
			row.baseSourceFingerprint,
			row.baseArtifactHash,
			row.baseArtifactPath,
			row.baseProvenanceHash,
			row.memoryTip,
			row.effectiveContentRevision,
			RECALL_MEMORY_TIP_EFFECTIVE_CONTENT_VERSION,
			hashEffectiveRecallMemoryTip(row.baseContentHash, row.memoryTip),
			stableStringify(row.provenance),
			RECALL_MEMORY_TIP_IMPORT_OWNER
		];
		statements.push({
			sql: `INSERT INTO recall_card_memory_tip_enrichments (
			        id, enrichment_run_id, card_id, base_generation_run_id,
			        base_content_revision, base_content_hash, base_source_fingerprint,
			        base_artifact_hash, base_artifact_path, base_provenance_hash,
			        memory_tip, effective_content_revision, effective_hash_version,
			        effective_content_hash, provenance_json, status, needs_human_review,
			        import_owner, created_at, updated_at
			      )
			      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?,
			             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
			      FROM recall_cards c
			      JOIN recall_generation_runs base_run ON base_run.id = c.generation_run_id
			      WHERE ${baseGuard}`,
			params: [...contentParams, ...baseParams]
		});
		statements.push({
			sql: `UPDATE recall_card_memory_tip_enrichments
			      SET status = 'published', updated_at = CURRENT_TIMESTAMP
			      WHERE id = ? AND enrichment_run_id = ? AND status = 'draft'
			        AND import_owner = ? AND base_content_hash = ?
			        AND effective_hash_version = ? AND effective_content_hash = ?
			        AND EXISTS (
			          SELECT 1 FROM recall_cards c
			          JOIN recall_generation_runs base_run ON base_run.id = c.generation_run_id
			          WHERE ${baseGuard}
			        )`,
			params: [
				row.id,
				artifact.run.id,
				RECALL_MEMORY_TIP_IMPORT_OWNER,
				row.baseContentHash,
				RECALL_MEMORY_TIP_EFFECTIVE_CONTENT_VERSION,
				hashEffectiveRecallMemoryTip(row.baseContentHash, row.memoryTip),
				...baseParams
			]
		});
	}
	if (plan.run.needsFinalization) {
		statements.push({
			sql: `SELECT CASE
			        WHEN (SELECT COUNT(*) FROM recall_card_memory_tip_enrichments
			              WHERE enrichment_run_id = ? AND status = 'published'
			                AND needs_human_review = 0 AND import_owner = ?) = ?
			        THEN 1
			        ELSE json_extract('memory-tip-import-count-mismatch', '$')
			      END AS exact_published_enrichment_count`,
			params: [artifact.run.id, RECALL_MEMORY_TIP_IMPORT_OWNER, artifact.enrichments.length]
		});
		statements.push({
			sql: `UPDATE recall_memory_tip_enrichment_runs
			      SET status = 'imported', updated_at = CURRENT_TIMESTAMP
			      WHERE id = ? AND import_owner = ? AND status = 'accepted'
			        AND schema_version = ? AND prompt_version = ?
			        AND source_fingerprint = ? AND artifact_hash = ? AND artifact_path = ?`,
			params: [
				artifact.run.id,
				RECALL_MEMORY_TIP_IMPORT_OWNER,
				artifact.schemaVersion,
				artifact.promptVersion,
				artifact.sourceFingerprint,
				plan.artifactHash,
				plan.artifactPath
			]
		});
	}
	return statements;
}
