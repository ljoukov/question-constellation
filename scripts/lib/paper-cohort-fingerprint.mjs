import { createHash } from 'node:crypto';

import { d1Rows } from './d1-rest.mjs';

/** @typedef {Record<string, unknown>} D1Row */
/** @typedef {D1Row & { paper_source_document_id: string }} PaperScopedD1Row */
/** @typedef {{ name: string, sql: (placeholders: string) => string }} PaperTableQuery */
/** @typedef {Record<string, D1Row[]>} PaperTables */
/**
 * @typedef {{
 *   schemaVersion: string,
 *   sha256: string,
 *   rowCounts: Record<string, number>
 * }} CanonicalPaperFingerprint
 */

/** @type {readonly PaperTableQuery[]} */
const TABLE_QUERIES = Object.freeze([
	{
		name: 'sourceDocuments',
		sql: (placeholders) =>
			`WITH linked_documents AS (
			   SELECT q.source_document_id AS paper_source_document_id,
			          q.source_document_id AS linked_source_document_id
			     FROM questions q
			    WHERE q.source_document_id IN (${placeholders})
			   UNION
			   SELECT q.source_document_id AS paper_source_document_id,
			          row.source_document_id AS linked_source_document_id
			     FROM mark_scheme_items row
			     JOIN questions q ON q.id = row.question_id
			    WHERE q.source_document_id IN (${placeholders})
			      AND row.source_document_id IS NOT NULL
			 )
			 SELECT linked.paper_source_document_id, source.*
			   FROM linked_documents linked
			   JOIN source_documents source ON source.id = linked.linked_source_document_id
			  ORDER BY linked.paper_source_document_id, source.id`
	},
	{
		name: 'questions',
		sql: (placeholders) =>
			`SELECT q.source_document_id AS paper_source_document_id, q.*
			   FROM questions q
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, q.display_order, q.id`
	},
	{
		name: 'renderingOverlays',
		sql: (placeholders) =>
			`SELECT q.source_document_id AS paper_source_document_id, row.*
			   FROM question_rendering_overlays row
			   JOIN questions q ON q.id = row.question_id
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, row.question_id, row.overlay_version, row.id`
	},
	{
		name: 'responseAnswerKeys',
		sql: (placeholders) =>
			`SELECT q.source_document_id AS paper_source_document_id, row.*
			   FROM question_response_answer_keys row
			   JOIN questions q ON q.id = row.question_id
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, row.question_id, row.response_kind,
			           row.display_order, row.target_id, row.id`
	},
	{
		name: 'markSchemeItems',
		sql: (placeholders) =>
			`SELECT q.source_document_id AS paper_source_document_id, row.*
			   FROM mark_scheme_items row
			   JOIN questions q ON q.id = row.question_id
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, row.question_id, row.display_order, row.id`
	},
	{
		name: 'markChecklistItems',
		sql: (placeholders) =>
			`SELECT q.source_document_id AS paper_source_document_id, row.*
			   FROM mark_checklist_items row
			   JOIN questions q ON q.id = row.question_id
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, row.question_id, row.display_order, row.id`
	},
	{
		name: 'modelAnswers',
		sql: (placeholders) =>
			`SELECT q.source_document_id AS paper_source_document_id, row.*
			   FROM model_answers row
			   JOIN questions q ON q.id = row.question_id
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, row.question_id, row.id`
	},
	{
		name: 'questionAssets',
		sql: (placeholders) =>
			`SELECT q.source_document_id AS paper_source_document_id, row.*
			   FROM question_assets row
			   JOIN questions q ON q.id = row.question_id
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, row.question_id, row.id`
	},
	{
		name: 'questionChainMappings',
		sql: (placeholders) =>
			`SELECT q.source_document_id AS paper_source_document_id, row.*
			   FROM question_answer_chains row
			   JOIN questions q ON q.id = row.question_id
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, row.question_id, row.display_order, row.id`
	},
	{
		name: 'answerChains',
		sql: (placeholders) =>
			`SELECT DISTINCT q.source_document_id AS paper_source_document_id, row.*
			   FROM question_answer_chains mapping
			   JOIN questions q ON q.id = mapping.question_id
			   JOIN answer_chains row ON row.id = mapping.answer_chain_id
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, row.id`
	},
	{
		name: 'answerChainSteps',
		sql: (placeholders) =>
			`SELECT DISTINCT q.source_document_id AS paper_source_document_id, row.*
			   FROM question_answer_chains mapping
			   JOIN questions q ON q.id = mapping.question_id
			   JOIN answer_chain_steps row ON row.answer_chain_id = mapping.answer_chain_id
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, row.answer_chain_id, row.display_order, row.id`
	},
	{
		name: 'chainFamilies',
		sql: (placeholders) =>
			`WITH relevant AS (
			   SELECT DISTINCT q.source_document_id AS paper_source_document_id,
			          member.chain_family_id
			     FROM question_answer_chains mapping
			     JOIN questions q ON q.id = mapping.question_id
			     JOIN chain_family_members member ON member.answer_chain_id = mapping.answer_chain_id
			    WHERE q.source_document_id IN (${placeholders})
			 )
			 SELECT relevant.paper_source_document_id, row.*
			   FROM relevant
			   JOIN chain_families row ON row.id = relevant.chain_family_id
			  ORDER BY relevant.paper_source_document_id, row.id`
	},
	{
		name: 'chainFamilyMembers',
		sql: (placeholders) =>
			`WITH relevant AS (
			   SELECT DISTINCT q.source_document_id AS paper_source_document_id,
			          member.chain_family_id
			     FROM question_answer_chains mapping
			     JOIN questions q ON q.id = mapping.question_id
			     JOIN chain_family_members member ON member.answer_chain_id = mapping.answer_chain_id
			    WHERE q.source_document_id IN (${placeholders})
			 )
			 SELECT relevant.paper_source_document_id, row.*
			   FROM relevant
			   JOIN chain_family_members row ON row.chain_family_id = relevant.chain_family_id
			  ORDER BY relevant.paper_source_document_id, row.chain_family_id,
			           row.display_order, row.id`
	},
	{
		name: 'crossSubjectChainFamilies',
		sql: (placeholders) =>
			`WITH relevant_chains AS (
			   SELECT DISTINCT q.source_document_id AS paper_source_document_id,
			          mapping.answer_chain_id
			     FROM question_answer_chains mapping
			     JOIN questions q ON q.id = mapping.question_id
			    WHERE q.source_document_id IN (${placeholders})
			 ), relevant_families AS (
			   SELECT DISTINCT chains.paper_source_document_id, member.chain_family_id
			     FROM relevant_chains chains
			     JOIN chain_family_members member ON member.answer_chain_id = chains.answer_chain_id
			 ), relevant_cross AS (
			   SELECT DISTINCT chains.paper_source_document_id,
			          member.cross_subject_chain_family_id
			     FROM relevant_chains chains
			     JOIN cross_subject_chain_family_members member
			       ON member.answer_chain_id = chains.answer_chain_id
			   UNION
			   SELECT DISTINCT families.paper_source_document_id,
			          member.cross_subject_chain_family_id
			     FROM relevant_families families
			     JOIN cross_subject_chain_family_members member
			       ON member.chain_family_id = families.chain_family_id
			 )
			 SELECT relevant_cross.paper_source_document_id, row.*
			   FROM relevant_cross
			   JOIN cross_subject_chain_families row
			     ON row.id = relevant_cross.cross_subject_chain_family_id
			  ORDER BY relevant_cross.paper_source_document_id, row.id`
	},
	{
		name: 'crossSubjectChainFamilyMembers',
		sql: (placeholders) =>
			`WITH relevant_chains AS (
			   SELECT DISTINCT q.source_document_id AS paper_source_document_id,
			          mapping.answer_chain_id
			     FROM question_answer_chains mapping
			     JOIN questions q ON q.id = mapping.question_id
			    WHERE q.source_document_id IN (${placeholders})
			 ), relevant_families AS (
			   SELECT DISTINCT chains.paper_source_document_id, member.chain_family_id
			     FROM relevant_chains chains
			     JOIN chain_family_members member ON member.answer_chain_id = chains.answer_chain_id
			 ), relevant_cross AS (
			   SELECT DISTINCT chains.paper_source_document_id,
			          member.cross_subject_chain_family_id
			     FROM relevant_chains chains
			     JOIN cross_subject_chain_family_members member
			       ON member.answer_chain_id = chains.answer_chain_id
			   UNION
			   SELECT DISTINCT families.paper_source_document_id,
			          member.cross_subject_chain_family_id
			     FROM relevant_families families
			     JOIN cross_subject_chain_family_members member
			       ON member.chain_family_id = families.chain_family_id
			 )
			 SELECT relevant_cross.paper_source_document_id, row.*
			   FROM relevant_cross
			   JOIN cross_subject_chain_family_members row
			     ON row.cross_subject_chain_family_id = relevant_cross.cross_subject_chain_family_id
			  ORDER BY relevant_cross.paper_source_document_id,
			           row.cross_subject_chain_family_id, row.display_order, row.id`
	},
	{
		name: 'constellations',
		sql: (placeholders) =>
			`WITH relevant_chains AS (
			   SELECT DISTINCT q.source_document_id AS paper_source_document_id,
			          mapping.answer_chain_id
			     FROM question_answer_chains mapping
			     JOIN questions q ON q.id = mapping.question_id
			    WHERE q.source_document_id IN (${placeholders})
			 )
			 SELECT relevant_chains.paper_source_document_id, row.*
			   FROM relevant_chains
			   JOIN constellations row ON row.answer_chain_id = relevant_chains.answer_chain_id
			  ORDER BY relevant_chains.paper_source_document_id, row.id`
	},
	{
		name: 'constellationQuestions',
		sql: (placeholders) =>
			`WITH relevant_constellations AS (
			   SELECT DISTINCT q.source_document_id AS paper_source_document_id,
			          constellation.id AS constellation_id
			     FROM question_answer_chains mapping
			     JOIN questions q ON q.id = mapping.question_id
			     JOIN constellations constellation
			       ON constellation.answer_chain_id = mapping.answer_chain_id
			    WHERE q.source_document_id IN (${placeholders})
			 )
			 SELECT relevant_constellations.paper_source_document_id, row.*
			   FROM relevant_constellations
			   JOIN constellation_questions row
			     ON row.constellation_id = relevant_constellations.constellation_id
			  ORDER BY relevant_constellations.paper_source_document_id,
			           row.constellation_id, row.display_order, row.id`
	},
	{
		name: 'commonWeakAnswers',
		sql: (placeholders) =>
			`SELECT q.source_document_id AS paper_source_document_id, row.*
			   FROM common_weak_answers row
			   JOIN questions q ON q.id = row.question_id
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, row.question_id, row.id`
	},
	{
		name: 'chainWeakAnswers',
		sql: (placeholders) =>
			`SELECT DISTINCT q.source_document_id AS paper_source_document_id, row.*
			   FROM question_answer_chains mapping
			   JOIN questions q ON q.id = mapping.question_id
			   JOIN common_weak_answers row ON row.answer_chain_id = mapping.answer_chain_id
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, row.answer_chain_id, row.id`
	},
	{
		name: 'curriculumMappings',
		sql: (placeholders) =>
			`SELECT q.source_document_id AS paper_source_document_id, row.*
			   FROM question_curriculum_components row
			   JOIN questions q ON q.id = row.question_id
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, row.question_id, row.specification_id,
			           row.curriculum_component_id`
	}
]);

/**
 * @param {string[]} sourceDocumentIds
 * @returns {Promise<Map<string, CanonicalPaperFingerprint>>}
 */
export async function buildCanonicalPaperFingerprints(sourceDocumentIds) {
	if (!Array.isArray(sourceDocumentIds) || sourceDocumentIds.length === 0) return new Map();
	const placeholders = sourceDocumentIds.map(() => '?').join(',');
	const queried = await Promise.all(
		TABLE_QUERIES.map(async (query) => ({
			name: query.name,
			rows: /** @type {PaperScopedD1Row[]} */ (
				await d1Rows(
					query.sql(placeholders),
					query.name === 'sourceDocuments'
						? [...sourceDocumentIds, ...sourceDocumentIds]
						: sourceDocumentIds
				)
			)
		}))
	);
	/** @type {Map<string, PaperTables>} */
	const byPaper = new Map(
		sourceDocumentIds.map((sourceDocumentId) => [
			sourceDocumentId,
			/** @type {PaperTables} */ (
				Object.fromEntries(TABLE_QUERIES.map((query) => [query.name, []]))
			)
		])
	);
	for (const table of queried) {
		for (const rawRow of table.rows) {
			const { paper_source_document_id: sourceDocumentId, ...row } = rawRow;
			const paper = byPaper.get(sourceDocumentId);
			if (paper) paper[table.name].push(row);
		}
	}
	return new Map(
		[...byPaper].map(([sourceDocumentId, tables]) => {
			const canonicalJson = stableStringify({ schemaVersion: 'paper-d1-row-lock-v2', tables });
			return [
				sourceDocumentId,
				{
					schemaVersion: 'paper-d1-row-lock-v2',
					sha256: createHash('sha256').update(canonicalJson).digest('hex'),
					rowCounts: Object.fromEntries(
						Object.entries(tables).map(([name, rows]) => [name, rows.length])
					)
				}
			];
		})
	);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function stableStringify(value) {
	return /** @type {string} */ (JSON.stringify(sortValue(value)));
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function sortValue(value) {
	if (Array.isArray(value)) return value.map(sortValue);
	if (value && typeof value === 'object') {
		const record = /** @type {Record<string, unknown>} */ (value);
		return Object.fromEntries(
			Object.keys(record)
				.sort()
				.map((key) => [key, sortValue(record[key])])
		);
	}
	return value;
}
