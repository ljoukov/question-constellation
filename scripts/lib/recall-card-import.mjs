import {
	RECALL_IMPORT_OWNER,
	stableStringify,
	validateRecallCardBundle
} from './recall-card-bundle.mjs';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Curriculum rows retain the algorithm-qualified form (`sha256:<digest>`), while
 * recall evidence stores the 64-character digest in its typed field. Compare the
 * same canonical value without weakening either storage contract.
 *
 * @param {unknown} value
 */
export function canonicalSourceFileHash(value) {
	const normalized = String(value ?? '')
		.trim()
		.toLowerCase()
		.replace(/^sha256:/, '');
	return SHA256_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Canonicalise a stored JSON provenance value for semantic comparison while
 * preserving the raw database string separately for optimistic write guards.
 *
 * @param {unknown} value
 */
export function canonicalRecallProvenance(value) {
	try {
		return stableStringify(typeof value === 'string' ? JSON.parse(value) : value);
	} catch {
		return null;
	}
}

/**
 * Build a strict import plan from a validated accepted bundle and a read-only
 * D1 snapshot. Existing content is never silently adopted or overwritten.
 *
 * @param {any} bundle
 * @param {{cards?:any[], generationRun?:any|null, childRows?:any[]}} existing
 * @param {{allowUpdate?:boolean, artifactHash:string, artifactPath:string}} options
 */
export function planRecallCardImport(
	bundle,
	{ cards = [], generationRun = null, childRows = [] } = {},
	{ allowUpdate = false, artifactHash, artifactPath }
) {
	validateRecallCardBundle(bundle);
	const conflicts = [];
	if (generationRun) {
		if (generationRun.status === 'rejected') {
			conflicts.push({
				table: 'recall_generation_runs',
				id: generationRun.id,
				reason: 'rejected generation runs are terminal and cannot be imported'
			});
		}
		if (generationRun.import_owner !== RECALL_IMPORT_OWNER) {
			conflicts.push({
				table: 'recall_generation_runs',
				id: generationRun.id,
				reason: `owned by ${generationRun.import_owner ?? 'unknown'}`
			});
		}
		if (
			generationRun.artifact_hash !== artifactHash ||
			generationRun.artifact_path !== artifactPath
		) {
			conflicts.push({
				table: 'recall_generation_runs',
				id: generationRun.id,
				reason: 'run id already refers to a different artifact'
			});
		}
		if (
			generationRun.schema_version !== bundle.schemaVersion ||
			generationRun.prompt_version !== bundle.promptVersion ||
			generationRun.source_fingerprint !== bundle.source.fingerprint
		) {
			conflicts.push({
				table: 'recall_generation_runs',
				id: generationRun.id,
				reason: 'stored run schema, prompt version or source fingerprint differs from artifact'
			});
		}
	}
	for (const row of childRows) {
		if (row.import_owner !== RECALL_IMPORT_OWNER) {
			conflicts.push({
				table: row.table_name,
				id: row.id,
				cardId: row.card_id,
				reason: `owned by ${row.import_owner ?? 'unknown'}`
			});
		}
	}

	const byId = new Map(cards.map((row) => [row.id, row]));
	const byConcept = new Map(cards.map((row) => [`${row.subject}:${row.concept_key}`, row]));
	const actions = [];
	for (const card of bundle.cards) {
		const idMatch = byId.get(card.id);
		const conceptMatch = byConcept.get(`${card.subject}:${card.conceptKey}`);
		if (idMatch && conceptMatch && idMatch.id !== conceptMatch.id) {
			conflicts.push({
				cardId: card.id,
				reason: `id and concept resolve to different existing rows (${idMatch.id}, ${conceptMatch.id})`
			});
			continue;
		}
		const existingCard = idMatch ?? conceptMatch ?? null;
		if (!existingCard) {
			actions.push({ type: 'insert', card, contentRevision: 1 });
			continue;
		}
		if (existingCard.import_owner !== RECALL_IMPORT_OWNER) {
			conflicts.push({
				cardId: card.id,
				existingId: existingCard.id,
				reason: `existing card is owned by ${existingCard.import_owner ?? 'unknown'}`
			});
			continue;
		}
		if (existingCard.id !== card.id) {
			conflicts.push({
				cardId: card.id,
				existingId: existingCard.id,
				reason: 'stable concept key already exists under a different card id'
			});
			continue;
		}
		if (existingCard.subject !== card.subject || existingCard.concept_key !== card.conceptKey) {
			conflicts.push({
				cardId: card.id,
				reason: 'stable card id already exists with a different subject or concept key'
			});
			continue;
		}
		const expectedProvenance = stableStringify(card.provenance);
		const sameImportIdentity =
			existingCard.source_fingerprint === bundle.source.fingerprint &&
			existingCard.generation_run_id === bundle.run.id &&
			canonicalRecallProvenance(existingCard.provenance_json) === expectedProvenance;
		if (
			existingCard.content_hash === card.contentHash &&
			existingCard.status === 'published' &&
			sameImportIdentity
		) {
			actions.push({
				type: 'noop',
				card,
				contentRevision: Number(existingCard.content_revision)
			});
			continue;
		}
		if (!allowUpdate) {
			conflicts.push({
				cardId: card.id,
				reason:
					existingCard.content_hash === card.contentHash &&
					existingCard.status === 'published' &&
					!sameImportIdentity
						? 'identical published content belongs to different source/run provenance; pass --allow-update to rebind it explicitly'
						: existingCard.content_hash === card.contentHash
							? `existing identical card is ${existingCard.status}, not published; pass --allow-update to resume it`
							: 'published content differs; inspect it and pass --allow-update explicitly'
			});
			continue;
		}
		actions.push({
			type: 'update',
			card,
			expected: {
				contentHash: existingCard.content_hash,
				contentRevision: Number(existingCard.content_revision),
				status: existingCard.status,
				sourceFingerprint: existingCard.source_fingerprint,
				generationRunId: existingCard.generation_run_id,
				provenanceJson: existingCard.provenance_json
			},
			contentRevision:
				existingCard.content_hash === card.contentHash
					? Number(existingCard.content_revision)
					: Number(existingCard.content_revision) + 1
		});
	}
	return {
		owner: RECALL_IMPORT_OWNER,
		run: {
			id: bundle.run.id,
			type: generationRun ? 'existing' : 'insert',
			needsFinalization: !generationRun || generationRun.status !== 'imported',
			artifactHash,
			artifactPath
		},
		actions,
		conflicts,
		counts: {
			insert: actions.filter((action) => action.type === 'insert').length,
			update: actions.filter((action) => action.type === 'update').length,
			noop: actions.filter((action) => action.type === 'noop').length,
			conflicts: conflicts.length
		}
	};
}

/**
 * Emit one transactional statement list. Each changed card is stored as draft,
 * receives all of its exact children, then is published so database triggers
 * can enforce completeness.
 *
 * @param {any} bundle
 * @param {ReturnType<typeof planRecallCardImport>} plan
 */
export function buildRecallCardImportStatements(bundle, plan) {
	if (plan.conflicts.length)
		throw new Error('Cannot build recall import SQL with unresolved conflicts.');
	const runJson = stableStringify({
		run: bundle.run,
		source: bundle.source,
		cardCount: bundle.cards.length,
		artifactHash: plan.run.artifactHash,
		artifactPath: plan.run.artifactPath
	});
	const statements = [];
	if (plan.run.type === 'insert') {
		statements.push({
			sql: `INSERT INTO recall_generation_runs (
			        id, schema_version, prompt_version,
			        generator_model, generator_thinking_level,
			        reviewer_model, reviewer_thinking_level,
			        cue_reviewer_model, cue_reviewer_thinking_level,
			        source_fingerprint, artifact_hash, artifact_path, run_json,
			        started_at, finished_at, status, import_owner, created_at, updated_at
			      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			params: [
				bundle.run.id,
				bundle.schemaVersion,
				bundle.promptVersion,
				bundle.run.generator.model,
				bundle.run.generator.thinkingLevel,
				bundle.run.fullReviewer.model,
				bundle.run.fullReviewer.thinkingLevel,
				bundle.run.cueReviewer.model,
				bundle.run.cueReviewer.thinkingLevel,
				bundle.source.fingerprint,
				plan.run.artifactHash,
				plan.run.artifactPath,
				runJson,
				bundle.run.startedAt,
				bundle.run.finishedAt,
				RECALL_IMPORT_OWNER
			]
		});
	}

	for (const action of plan.actions) {
		if (action.type === 'noop') continue;
		const card = action.card;
		const commonParams = cardColumnParams(
			card,
			action.contentRevision,
			bundle.run.id,
			bundle.source.fingerprint
		);
		const postUpdateGuardSql = `EXISTS (
			SELECT 1 FROM recall_cards guard
			WHERE guard.id = ? AND guard.import_owner = ? AND guard.status = 'draft'
			  AND guard.content_hash = ? AND guard.content_revision = ? AND guard.generation_run_id = ?
		)`;
		const postUpdateGuardParams = [
			card.id,
			RECALL_IMPORT_OWNER,
			card.contentHash,
			action.contentRevision,
			bundle.run.id
		];
		if (action.type === 'insert') {
			statements.push({
				sql: `INSERT INTO recall_cards (
				        id, concept_key, board, qualification, subject, kind, visual_cue,
				        front, back, reverse_front, reverse_back, explanation, memory_tip,
				        content_revision, content_hash, source_fingerprint, generation_run_id,
				        provenance_json, status, needs_human_review, import_owner, created_at, updated_at
				      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
				params: [...commonParams, RECALL_IMPORT_OWNER]
			});
		} else {
			const expected = action.expected;
			if (!expected) throw new Error(`Update action for ${card.id} is missing preflight state.`);
			statements.push({
				sql: `UPDATE recall_cards
				      SET concept_key = ?, board = ?, qualification = ?, subject = ?, kind = ?, visual_cue = ?,
				          front = ?, back = ?, reverse_front = ?, reverse_back = ?, explanation = ?, memory_tip = ?,
				          content_revision = ?, content_hash = ?, source_fingerprint = ?, generation_run_id = ?,
				          provenance_json = ?, status = 'draft', needs_human_review = 0,
				          import_owner = ?, updated_at = CURRENT_TIMESTAMP
					  WHERE id = ? AND import_owner = ?
					    AND content_hash = ? AND content_revision = ? AND status = ?
					    AND source_fingerprint = ? AND generation_run_id = ? AND provenance_json = ?`,
				params: [
					...commonParams.slice(1),
					RECALL_IMPORT_OWNER,
					card.id,
					RECALL_IMPORT_OWNER,
					expected.contentHash,
					expected.contentRevision,
					expected.status,
					expected.sourceFingerprint,
					expected.generationRunId,
					expected.provenanceJson
				]
			});
			for (const table of [
				'recall_card_choices',
				'recall_card_evidence',
				'recall_card_curriculum_targets'
			]) {
				statements.push({
					sql: `DELETE FROM ${table}
					      WHERE card_id = ? AND import_owner = ? AND ${postUpdateGuardSql}`,
					params: [card.id, RECALL_IMPORT_OWNER, ...postUpdateGuardParams]
				});
			}
		}
		for (const choice of card.choices) {
			const params = [
				choice.id,
				card.id,
				choice.displayOrder,
				choice.choiceKey,
				choice.text,
				choice.isCorrect ? 1 : 0,
				choice.feedback,
				choice.misconception,
				RECALL_IMPORT_OWNER
			];
			statements.push({
				sql: `INSERT INTO recall_card_choices (
				        id, card_id, display_order, choice_key, text, is_correct,
				        feedback, misconception, import_owner, created_at, updated_at
				      ) ${
								action.type === 'update'
									? `SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP WHERE ${postUpdateGuardSql}`
									: 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
							}`,
				params: action.type === 'update' ? [...params, ...postUpdateGuardParams] : params
			});
		}
		for (const evidence of card.evidence) {
			const params = [
				evidence.id,
				card.id,
				evidence.sourceKind,
				evidence.specificationId,
				evidence.curriculumComponentId,
				evidence.pageStart,
				evidence.pageEnd,
				evidence.sourceExcerpt,
				evidence.sourceFileHash,
				evidence.excerptHash,
				stableStringify(evidence.supports),
				RECALL_IMPORT_OWNER
			];
			statements.push({
				sql: `INSERT INTO recall_card_evidence (
				        id, card_id, source_kind, specification_id, curriculum_component_id,
				        source_page_start, source_page_end, source_excerpt, source_file_hash,
				        excerpt_hash, supports_json, import_owner, created_at
				      ) ${
								action.type === 'update'
									? `SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP WHERE ${postUpdateGuardSql}`
									: 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
							}`,
				params: action.type === 'update' ? [...params, ...postUpdateGuardParams] : params
			});
		}
		for (const target of card.targets) {
			const params = [
				card.id,
				target.offeringId,
				target.curriculumComponentId,
				target.topicComponentId,
				target.isPrimary ? 1 : 0,
				target.confidence,
				target.reviewed ? 1 : 0,
				target.mappingSource,
				RECALL_IMPORT_OWNER
			];
			statements.push({
				sql: `INSERT INTO recall_card_curriculum_targets (
				        card_id, offering_id, curriculum_component_id, topic_component_id,
				        is_primary, confidence, reviewed, mapping_source,
				        import_owner, created_at, updated_at
				      ) ${
								action.type === 'update'
									? `SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP WHERE ${postUpdateGuardSql}`
									: 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
							}`,
				params: action.type === 'update' ? [...params, ...postUpdateGuardParams] : params
			});
		}
		statements.push({
			sql: `UPDATE recall_cards
			      SET status = 'published', updated_at = CURRENT_TIMESTAMP
			      WHERE id = ? AND import_owner = ? AND status = 'draft'
			        AND content_hash = ? AND content_revision = ? AND generation_run_id = ?
			        AND source_fingerprint = ? AND provenance_json = ?`,
			params: [
				card.id,
				RECALL_IMPORT_OWNER,
				card.contentHash,
				action.contentRevision,
				bundle.run.id,
				bundle.source.fingerprint,
				stableStringify(card.provenance)
			]
		});
	}
	const importedActions = plan.actions.filter((action) => action.type !== 'noop');
	const cardGuards = plan.actions
		.map(
			() =>
				`EXISTS (SELECT 1 FROM recall_cards
				 WHERE id = ? AND status = 'published' AND content_hash = ?
				   AND source_fingerprint = ? AND generation_run_id = ? AND provenance_json = ?)`
		)
		.join(' AND ');
	if (plan.run.needsFinalization || importedActions.length > 0) {
		statements.push({
			sql: `UPDATE recall_generation_runs
		      SET status = 'imported', updated_at = CURRENT_TIMESTAMP
		      WHERE id = ? AND import_owner = ? AND artifact_hash = ?
		        AND source_fingerprint = ? AND status IN ('accepted', 'imported')${cardGuards ? ` AND ${cardGuards}` : ''}`,
			params: [
				bundle.run.id,
				RECALL_IMPORT_OWNER,
				plan.run.artifactHash,
				bundle.source.fingerprint,
				...plan.actions.flatMap((action) => [
					action.card.id,
					action.card.contentHash,
					bundle.source.fingerprint,
					bundle.run.id,
					stableStringify(action.card.provenance)
				])
			]
		});
	}
	return statements;
}

/**
 * Compare the stored parent rows with every accepted identity-bearing field.
 * Child rows are verified separately by the importer.
 *
 * @param {any} bundle
 * @param {any[]} rows
 */
export function recallStoredCardParentIssues(bundle, rows) {
	const expectedById = new Map(bundle.cards.map((/** @type {any} */ card) => [card.id, card]));
	const issues = [];
	for (const row of rows) {
		const expected = expectedById.get(row.id);
		if (!expected) {
			issues.push(`${row.id} is not present in the accepted artifact`);
			continue;
		}
		if (row.status !== 'published') issues.push(`${row.id} is ${row.status}`);
		if (row.content_hash !== expected.contentHash) issues.push(`${row.id} content hash differs`);
		if (row.source_fingerprint !== bundle.source.fingerprint) {
			issues.push(`${row.id} source fingerprint differs`);
		}
		if (row.generation_run_id !== bundle.run.id) {
			issues.push(`${row.id} generation run differs`);
		}
		if (canonicalRecallProvenance(row.provenance_json) !== stableStringify(expected.provenance)) {
			issues.push(`${row.id} provenance differs`);
		}
	}
	if (rows.length !== bundle.cards.length) {
		issues.push('not every bundle card was found after import');
	}
	return issues;
}

/** @param {any} card @param {number} contentRevision @param {string} generationRunId @param {string} sourceFingerprint */
function cardColumnParams(card, contentRevision, generationRunId, sourceFingerprint) {
	return [
		card.id,
		card.conceptKey,
		card.board,
		card.qualification,
		card.subject,
		card.kind,
		card.visualCue,
		card.front,
		card.back,
		card.reverseFront,
		card.reverseBack,
		card.explanation,
		card.memoryTip,
		contentRevision,
		card.contentHash,
		sourceFingerprint,
		generationRunId,
		stableStringify(card.provenance)
	];
}
