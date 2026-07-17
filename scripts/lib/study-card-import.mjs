/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Import plans operate on the runtime-validated artifact shape.
import {
	STUDY_CARD_IMPORT_OWNER,
	hashStudyCardArtifact,
	stableStringify
} from './study-card-artifact.mjs';

/**
 * Fail closed before an artifact reaches D1 when a Foundation target inherits
 * Higher-only scope from any ancestor.  Some official catalogue leaves repeat
 * a broad Foundation/Higher tier array even though their enclosing section is
 * explicitly Higher-only, so checking only the leaf is not sufficient.
 *
 * @param {any} bundle canonical output from validateStudyCardBundle
 * @param {any} catalog canonical curriculum-catalog JSON
 */
export function assertStudyCardCurriculumScope(bundle, catalog) {
	const issues = studyCardCurriculumScopeIssues(bundle, catalog);
	if (issues.length) {
		throw new Error(`Study-card curriculum scope validation failed:\n- ${issues.join('\n- ')}`);
	}
	return bundle;
}

/** @param {any} bundle @param {any} catalog */
export function studyCardCurriculumScopeIssues(bundle, catalog) {
	const issues = [];
	const offerings = Array.isArray(catalog?.offerings) ? catalog.offerings : [];
	const specifications = Array.isArray(catalog?.specifications) ? catalog.specifications : [];
	const offeringById = new Map(offerings.map((offering) => [offering.id, offering]));
	const specificationById = new Map(
		specifications.map((specification) => [specification.id, specification])
	);

	for (const card of bundle?.cards ?? []) {
		for (const target of card?.targets ?? []) {
			const offering = offeringById.get(target.offeringId);
			if (!offering) {
				issues.push(`${card.id} target references unknown offering ${target.offeringId}`);
				continue;
			}
			const specification = specificationById.get(offering.specificationId);
			if (!specification || !Array.isArray(specification.components)) {
				issues.push(
					`${card.id} target offering ${offering.id} has no readable curriculum specification`
				);
				continue;
			}
			const componentById = new Map(
				specification.components.map((component) => [component.id, component])
			);
			if (!componentById.has(target.curriculumComponentId)) {
				issues.push(
					`${card.id} target references unknown component ${target.curriculumComponentId}`
				);
				continue;
			}
			if (offering.tier !== 'Foundation') continue;

			const ancestry = componentAncestry(target.curriculumComponentId, componentById);
			if (ancestry.issue) {
				issues.push(`${card.id} target ancestry ${ancestry.issue}`);
				continue;
			}
			const higherOnlyAncestor = ancestry.components.find((component) =>
				isExplicitlyHigherOnly(component?.tier)
			);
			if (higherOnlyAncestor) {
				issues.push(
					`${card.id} Foundation target ${target.curriculumComponentId} is beneath Higher-only ancestor ${higherOnlyAncestor.id}`
				);
			}
		}
	}
	return issues;
}

/** @param {string} componentId @param {Map<string, any>} componentById */
function componentAncestry(componentId, componentById) {
	const components = [];
	const visited = new Set();
	let current = componentById.get(componentId);
	while (current) {
		if (visited.has(current.id)) {
			return { components, issue: `contains a cycle at ${current.id}` };
		}
		visited.add(current.id);
		components.push(current);
		if (!current.parentId) return { components, issue: null };
		current = componentById.get(current.parentId);
		if (!current) {
			return {
				components,
				issue: `is missing parent ${components.at(-1).parentId}`
			};
		}
	}
	return { components, issue: `does not contain ${componentId}` };
}

/** @param {unknown} tier */
function isExplicitlyHigherOnly(tier) {
	return Array.isArray(tier) && tier.length === 1 && tier[0] === 'Higher';
}

/**
 * A study-card release is append-only. An exact imported artifact is a no-op;
 * every other pre-existing release or card identity is a conflict that must be
 * resolved by producing a new reviewed release.
 *
 * @param {any} bundle canonical output from validateStudyCardBundle
 * @param {{releases?:any[],cards?:any[]}} existing
 * @param {{artifactHash?:string,artifactPath?:string}} options
 */
export function planStudyCardImport(
	bundle,
	{ releases = [], cards = [] } = {},
	{ artifactHash = hashStudyCardArtifact(bundle), artifactPath = bundle.release.artifactPath } = {}
) {
	const conflicts = [];
	const release = releases.find((row) => row.id === bundle.release.id) ?? null;
	const expectedCards = new Map(bundle.cards.map((card) => [card.id, card]));
	const existingCards = cards.filter((row) => expectedCards.has(row.id));

	if (!release) {
		for (const row of existingCards) {
			conflicts.push({
				table: 'study_cards',
				id: row.id,
				reason: `card id already belongs to release ${row.release_id ?? 'unknown'}`
			});
		}
		return {
			owner: STUDY_CARD_IMPORT_OWNER,
			action: conflicts.length ? 'conflict' : 'insert',
			artifactHash,
			artifactPath,
			conflicts,
			counts: {
				cards: bundle.cards.length,
				choices: bundle.cards.reduce((sum, card) => sum + card.choices.length, 0),
				sources: bundle.cards.reduce((sum, card) => sum + card.sources.length, 0),
				targets: bundle.cards.reduce((sum, card) => sum + card.targets.length, 0),
				coverage: bundle.coverage.length
			}
		};
	}

	if (release.import_owner !== STUDY_CARD_IMPORT_OWNER) {
		conflicts.push({
			table: 'study_card_releases',
			id: release.id,
			reason: `owned by ${release.import_owner ?? 'unknown'}`
		});
	}
	if (release.status === 'rejected') {
		conflicts.push({
			table: 'study_card_releases',
			id: release.id,
			reason: 'rejected releases are terminal'
		});
	}
	for (const [field, expected] of Object.entries({
		schema_version: bundle.schemaVersion,
		prompt_version: bundle.release.promptVersion,
		generator_model: bundle.release.generator.model,
		generator_thinking_level: bundle.release.generator.thinkingLevel,
		generator_run_id: bundle.release.generator.runId,
		reviewer_model: bundle.release.reviewer.model,
		reviewer_thinking_level: bundle.release.reviewer.thinkingLevel,
		reviewer_run_id: bundle.release.reviewer.runId,
		source_manifest_hash: bundle.release.sourceManifestHash,
		artifact_hash: artifactHash,
		artifact_path: artifactPath,
		expected_card_count: bundle.cards.length,
		expected_coverage_count: bundle.coverage.length
	})) {
		if (String(release[field]) !== String(expected)) {
			conflicts.push({
				table: 'study_card_releases',
				id: release.id,
				reason: `${field} differs from the accepted artifact`
			});
		}
	}
	if (release.status !== 'imported') {
		conflicts.push({
			table: 'study_card_releases',
			id: release.id,
			reason: `existing exact release is ${release.status}, not imported`
		});
	}
	if (existingCards.length !== bundle.cards.length) {
		conflicts.push({
			table: 'study_cards',
			id: bundle.release.id,
			reason: 'existing release does not contain every accepted card identity'
		});
	}
	for (const row of existingCards) {
		const expected = expectedCards.get(row.id);
		if (
			row.release_id !== bundle.release.id ||
			row.content_hash !== expected.contentHash ||
			row.status !== 'published' ||
			Number(row.needs_human_review) !== 0 ||
			row.import_owner !== STUDY_CARD_IMPORT_OWNER
		) {
			conflicts.push({
				table: 'study_cards',
				id: row.id,
				reason: 'stored card identity, content, review state or ownership differs'
			});
		}
	}

	return {
		owner: STUDY_CARD_IMPORT_OWNER,
		action: conflicts.length ? 'conflict' : 'noop',
		artifactHash,
		artifactPath,
		conflicts,
		counts: {
			cards: bundle.cards.length,
			choices: bundle.cards.reduce((sum, card) => sum + card.choices.length, 0),
			sources: bundle.cards.reduce((sum, card) => sum + card.sources.length, 0),
			targets: bundle.cards.reduce((sum, card) => sum + card.targets.length, 0),
			coverage: bundle.coverage.length
		}
	};
}

/**
 * Build the ordered D1 batch: accepted release -> draft cards -> children and
 * coverage -> published cards -> imported release. D1 batch execution is the
 * transaction boundary; database triggers independently re-check the bundle.
 *
 * @param {any} bundle canonical output from validateStudyCardBundle
 * @param {ReturnType<typeof planStudyCardImport>} plan
 */
export function buildStudyCardImportStatements(bundle, plan) {
	if (plan.conflicts.length) {
		throw new Error('Cannot build study-card import SQL with unresolved conflicts.');
	}
	if (plan.action === 'noop') return [];
	if (plan.action !== 'insert')
		throw new Error(`Unsupported study-card import action ${plan.action}`);

	const releaseJson = stableStringify(bundle.release);
	const statements = [
		{
			sql: `INSERT INTO study_card_releases (
			        id, schema_version, prompt_version,
			        generator_model, generator_thinking_level, generator_run_id,
			        reviewer_model, reviewer_thinking_level, reviewer_run_id,
			        reviewer_independent_turn, source_manifest_hash,
			        artifact_hash, artifact_path, expected_card_count,
			        expected_coverage_count, release_json, started_at, finished_at,
			        status, import_owner, created_at, updated_at
			      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?,
			                'accepted', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			params: [
				bundle.release.id,
				bundle.schemaVersion,
				bundle.release.promptVersion,
				bundle.release.generator.model,
				bundle.release.generator.thinkingLevel,
				bundle.release.generator.runId,
				bundle.release.reviewer.model,
				bundle.release.reviewer.thinkingLevel,
				bundle.release.reviewer.runId,
				bundle.release.sourceManifestHash,
				plan.artifactHash,
				plan.artifactPath,
				bundle.cards.length,
				bundle.coverage.length,
				releaseJson,
				bundle.release.startedAt,
				bundle.release.finishedAt,
				STUDY_CARD_IMPORT_OWNER
			]
		}
	];

	for (const card of bundle.cards) {
		statements.push({
			sql: `INSERT INTO study_cards (
			        id, release_id, concept_key, board, qualification, subject, kind, emoji,
			        front, back, reverse_front, reverse_back, explanation, memory_tip,
			        content_revision, content_hash, source_fingerprint, provenance_json,
			        status, needs_human_review, import_owner, created_at, updated_at
			      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
			                'draft', 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			params: [
				card.id,
				bundle.release.id,
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
				card.contentRevision,
				card.contentHash,
				bundle.release.sourceManifestHash,
				stableStringify(card.provenance),
				STUDY_CARD_IMPORT_OWNER
			]
		});
		for (const choice of card.choices) {
			statements.push({
				sql: `INSERT INTO study_card_choices (
				        id, card_id, display_order, choice_key, text, is_correct,
				        feedback, misconception, import_owner, created_at, updated_at
				      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
				params: [
					choice.id,
					card.id,
					choice.displayOrder,
					choice.choiceKey,
					choice.text,
					choice.isCorrect ? 1 : 0,
					choice.feedback,
					choice.misconception,
					STUDY_CARD_IMPORT_OWNER
				]
			});
		}
		for (const source of card.sources) {
			statements.push({
				sql: `INSERT INTO study_card_sources (
				        id, card_id, source_kind, source_url, source_title, source_locator,
				        source_excerpt, source_hash, rights_basis, supports_json,
				        import_owner, created_at, updated_at
				      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
				params: [
					source.id,
					card.id,
					source.sourceKind,
					source.sourceUrl,
					source.sourceTitle,
					source.sourceLocator,
					source.sourceExcerpt,
					source.sourceHash,
					source.rightsBasis,
					stableStringify(source.supports),
					STUDY_CARD_IMPORT_OWNER
				]
			});
		}
		for (const target of card.targets) {
			statements.push({
				sql: `INSERT INTO study_card_targets (
				        card_id, offering_id, curriculum_component_id, topic_component_id,
				        is_primary, confidence, reviewed, mapping_source, import_owner,
				        created_at, updated_at
				      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
				params: [
					card.id,
					target.offeringId,
					target.curriculumComponentId,
					target.topicComponentId,
					target.isPrimary ? 1 : 0,
					target.confidence,
					target.reviewed ? 1 : 0,
					target.mappingSource,
					STUDY_CARD_IMPORT_OWNER
				]
			});
		}
	}

	for (const coverage of bundle.coverage) {
		statements.push({
			sql: `INSERT INTO study_deck_coverage (
			        release_id, offering_id, topic_component_id, status, reason,
			        card_count, reviewed, import_owner, created_at, updated_at
			      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			params: [
				bundle.release.id,
				coverage.offeringId,
				coverage.topicComponentId,
				coverage.status,
				coverage.reason,
				coverage.cardCount,
				STUDY_CARD_IMPORT_OWNER
			]
		});
	}

	for (const card of bundle.cards) {
		statements.push({
			sql: `UPDATE study_cards
			      SET status = 'published', updated_at = CURRENT_TIMESTAMP
			      WHERE id = ? AND release_id = ? AND status = 'draft'
			        AND needs_human_review = 0 AND content_hash = ?
			        AND source_fingerprint = ? AND import_owner = ?`,
			params: [
				card.id,
				bundle.release.id,
				card.contentHash,
				bundle.release.sourceManifestHash,
				STUDY_CARD_IMPORT_OWNER
			]
		});
	}

	statements.push({
		sql: `UPDATE study_card_releases
		      SET status = 'imported', updated_at = CURRENT_TIMESTAMP
		      WHERE id = ? AND status = 'accepted' AND import_owner = ?
		        AND artifact_hash = ? AND artifact_path = ?
		        AND source_manifest_hash = ?`,
		params: [
			bundle.release.id,
			STUDY_CARD_IMPORT_OWNER,
			plan.artifactHash,
			plan.artifactPath,
			bundle.release.sourceManifestHash
		]
	});
	return statements;
}

/** @param {any} bundle @param {any[]} rows */
export function storedStudyCardIssues(bundle, rows) {
	const expected = new Map(bundle.cards.map((card) => [card.id, card]));
	const issues = [];
	for (const row of rows) {
		const card = expected.get(row.id);
		if (!card) {
			issues.push(`${row.id} is not present in the accepted artifact`);
			continue;
		}
		if (row.release_id !== bundle.release.id) issues.push(`${row.id} release differs`);
		if (row.status !== 'published') issues.push(`${row.id} is ${row.status}`);
		if (Number(row.needs_human_review) !== 0) issues.push(`${row.id} needs review`);
		if (row.content_hash !== card.contentHash) issues.push(`${row.id} content hash differs`);
		if (row.source_fingerprint !== bundle.release.sourceManifestHash) {
			issues.push(`${row.id} source manifest hash differs`);
		}
		if (row.import_owner !== STUDY_CARD_IMPORT_OWNER) issues.push(`${row.id} owner differs`);
	}
	if (rows.length !== bundle.cards.length) issues.push('not every accepted card was found');
	return issues;
}
