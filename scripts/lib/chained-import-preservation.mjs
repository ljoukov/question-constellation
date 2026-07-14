export const CHAINED_IMPORT_OWNER = 'chained-semantic-import/v1';

const quotedOwner = sqlString(CHAINED_IMPORT_OWNER);

/**
 * @typedef {{
 *   table: string,
 *   scope?: string,
 *   uniqueKeys: string[][],
 *   ownedSql: (row: string) => string
 * }} OwnershipConfig
 */

/** @param {string} row */
function metadataOwnerSql(row) {
	return `json_extract(${row}.metadata_json, '$.import_owner') = ${quotedOwner}`;
}

/** @param {string} row */
function overlayOwnerSql(row) {
	return `json_extract(${row}.render_json, '$.metadata.import_owner') = ${quotedOwner}`;
}

/** @param {string} row */
function weakAnswerOwnerSql(row) {
	// This table has no metadata column. The exact importer id is an explicit owner marker; generic
	// values such as `agent`, `observed`, or `human` never confer ownership.
	return `${row}.source = ${quotedOwner}`;
}

/** @param {string} row */
function checklistOwnerSql(row) {
	const suffixSql = `substr(${row}.id, length(${row}.question_id) + length('-check-') + 1)`;
	return `EXISTS (
		SELECT 1 FROM questions AS owned_question
		WHERE owned_question.id = ${row}.question_id
		  AND json_extract(owned_question.metadata_json, '$.import_owner') = ${quotedOwner}
		  AND instr(${row}.id, ${row}.question_id || '-check-') = 1
		  AND ${suffixSql} = printf('%d', CAST(${suffixSql} AS INTEGER))
		  AND CAST(${suffixSql} AS INTEGER) > 0
		  AND ${row}.display_order = CAST(${suffixSql} AS INTEGER)
	)`;
}

/** @param {string} row */
function modelAnswerOwnerSql(row) {
	return `EXISTS (
		SELECT 1 FROM questions AS owned_question
		WHERE owned_question.id = ${row}.question_id
		  AND json_extract(owned_question.metadata_json, '$.import_owner') = ${quotedOwner}
		  AND ${row}.id = (${row}.question_id || '-model-answer')
	)`;
}

/** @type {readonly OwnershipConfig[]} */
const PARENT_TABLES = Object.freeze([
	{
		table: 'source_documents',
		uniqueKeys: [['id']],
		ownedSql: metadataOwnerSql
	},
	{
		table: 'questions',
		uniqueKeys: [['id'], ['slug']],
		ownedSql: metadataOwnerSql
	},
	{
		table: 'answer_chains',
		uniqueKeys: [['id'], ['slug']],
		ownedSql: (row) => answerChainOwnershipSql(row)
	},
	{
		table: 'chain_families',
		uniqueKeys: [['id'], ['slug']],
		ownedSql: metadataOwnerSql
	},
	{
		table: 'constellations',
		uniqueKeys: [['id'], ['slug']],
		ownedSql: metadataOwnerSql
	}
]);

/**
 * Child-table reconciliation is intentionally ownership based, not parent based. A question can
 * legitimately contain extraction rows, official repairs, and semantic-chain rows from separate
 * pipelines. Merely importing that question does not transfer ownership of all of its children.
 */
/** @type {readonly OwnershipConfig[]} */
const CHILD_TABLES = Object.freeze([
	{
		table: 'question_rendering_overlays',
		scope: 'question_id',
		uniqueKeys: [
			['id'],
			['question_id', 'overlay_version'],
			['source_document_id', 'source_question_ref', 'overlay_version']
		],
		ownedSql: overlayOwnerSql
	},
	{
		table: 'question_assets',
		scope: 'question_id',
		uniqueKeys: [['id']],
		ownedSql: metadataOwnerSql
	},
	{
		table: 'question_response_answer_keys',
		scope: 'question_id',
		uniqueKeys: [['id'], ['question_id', 'response_kind', 'target_id']],
		ownedSql: metadataOwnerSql
	},
	{
		table: 'mark_scheme_items',
		scope: 'question_id',
		uniqueKeys: [['id']],
		ownedSql: metadataOwnerSql
	},
	{
		table: 'mark_checklist_items',
		scope: 'question_id',
		uniqueKeys: [['id']],
		// Ownership is inferred only from the exact deterministic id under an explicitly owned question.
		ownedSql: checklistOwnerSql
	},
	{
		table: 'model_answers',
		scope: 'question_id',
		uniqueKeys: [['id']],
		// `derivation` is not provenance; only the deterministic id and explicit parent owner count.
		ownedSql: modelAnswerOwnerSql
	},
	{
		table: 'common_weak_answers',
		scope: 'question_id',
		uniqueKeys: [['id']],
		ownedSql: weakAnswerOwnerSql
	},
	{
		table: 'question_answer_chains',
		scope: 'question_id',
		uniqueKeys: [['id'], ['question_id', 'answer_chain_id']],
		ownedSql: metadataOwnerSql
	},
	{
		table: 'constellation_questions',
		scope: 'constellation_and_question',
		uniqueKeys: [['id'], ['constellation_id', 'question_id']],
		ownedSql: metadataOwnerSql
	},
	{
		table: 'answer_chain_steps',
		scope: 'answer_chain_id',
		uniqueKeys: [['id'], ['answer_chain_id', 'display_order']],
		ownedSql: chainStepOwnershipSql
	},
	{
		table: 'chain_family_members',
		scope: 'chain_family_id',
		uniqueKeys: [['id'], ['chain_family_id', 'answer_chain_id']],
		ownedSql: metadataOwnerSql
	}
]);
const CONFLICT_TABLES = Object.freeze([...PARENT_TABLES, ...CHILD_TABLES]);

/**
 * Build an id-stable upsert. `conflictColumns` may target a secondary UNIQUE key; that is needed
 * when a reviewed step changes id but retains the same `(answer_chain_id, display_order)` slot.
 * An optional update predicate provides a final database-side ownership guard after preflight.
 *
 * @param {string} table
 * @param {string[]} columns
 * @param {Array<string | number | null>} values
 * @param {{
 *   conflictColumn?: string,
 *   conflictColumns?: string[],
 *   preserveColumns?: string[],
 *   updateWhereSql?: string,
 *   doNothingOnConflict?: boolean
 * }} [options]
 */
export function upsertStatement(table, columns, values, options = {}) {
	const conflictColumns = options.conflictColumns ?? [options.conflictColumn ?? 'id'];
	const preserved = new Set(options.preserveColumns ?? []);
	for (const column of conflictColumns) {
		if (!columns.includes(column)) {
			throw new Error(`${table} upsert is missing conflict column ${column}.`);
		}
	}
	if (columns.length !== values.length) {
		throw new Error(`${table} upsert has ${columns.length} columns but ${values.length} values.`);
	}
	for (const column of preserved) {
		if (!columns.includes(column))
			throw new Error(`${table} cannot preserve missing column ${column}.`);
	}
	const updateColumns = columns.filter(
		(column) => !conflictColumns.includes(column) && !preserved.has(column)
	);
	if (!options.doNothingOnConflict && !updateColumns.length) {
		throw new Error(`${table} upsert has no mutable columns.`);
	}
	const placeholders = columns.map(() => '?').join(', ');
	const conflictTarget = conflictColumns.join(', ');
	const conflictAction = options.doNothingOnConflict
		? 'DO NOTHING'
		: `DO UPDATE SET ${updateColumns
				.map((column) => `${column} = excluded.${column}`)
				.join(', ')}${options.updateWhereSql ? ` WHERE ${options.updateWhereSql}` : ''}`;
	const valuesByColumn = Object.fromEntries(
		columns.map((column, index) => [column, values[index]])
	);
	return {
		sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${conflictTarget}) ${conflictAction}`,
		params: values,
		importTable: table,
		importRowId: String(valuesByColumn.id ?? valuesByColumn[conflictColumns[0]]),
		importValues: valuesByColumn,
		importConflictColumns: conflictColumns
	};
}

/**
 * Delete only stale rows this importer can prove it owns. Every unowned/unknown row is counted as
 * preserved ambiguity; it is never inferred to be stale merely because its parent is in scope.
 *
 * @param {{
 *   statements: Array<Record<string, any>>,
 *   importedQuestionIds: string[],
 *   importedChainIds: string[],
 *   importedChainFamilyIds?: string[],
 *   importedConstellationIds?: string[]
 * }} input
 */
export function scopedChildReconciliationStatements(input) {
	const plannedIdsByTable = plannedIds(input.statements);
	const questionIds = uniqueStrings(input.importedQuestionIds);
	const chainIds = uniqueStrings(input.importedChainIds);
	const familyIds = uniqueStrings(
		input.importedChainFamilyIds ?? chainIds.map((chainId) => `${chainId}-family`)
	);
	const constellationIds = uniqueStrings(input.importedConstellationIds ?? []);
	return CHILD_TABLES.flatMap((config) => {
		/** @type {Array<[string, string[]]>} */
		const scopes =
			config.scope === 'question_id'
				? [['question_id', questionIds]]
				: config.scope === 'answer_chain_id'
					? [['answer_chain_id', chainIds]]
					: config.scope === 'chain_family_id'
						? [['chain_family_id', familyIds]]
						: [
								['constellation_id', constellationIds],
								['question_id', questionIds]
							];
		if (scopes.some(([, ids]) => ids.length === 0)) return [];
		return [scopedDelete(config, scopes, plannedIdsByTable.get(config.table) ?? new Set())];
	});
}

/**
 * Preflight planned parent and child writes against both primary and secondary UNIQUE keys. A collision is
 * blocking unless the existing row has this importer's explicit owner marker. Historical source,
 * provenance, and creator labels are intentionally not ownership. This prevents deterministic ids
 * from silently transferring ownership.
 *
 * @param {{ statements: Array<Record<string, any>> }} input
 */
export function importConflictDiagnosticStatements(input) {
	/** @type {Map<string, Map<string, { conflictColumns: string[], rows: Array<Record<string, any>> }>>} */
	const statementsByTable = new Map();
	for (const statement of input.statements) {
		if (!statement.importTable || !statement.importValues) continue;
		const conflictColumns = statement.importConflictColumns ?? ['id'];
		const signature = conflictColumns.join('\u0000');
		const groups = statementsByTable.get(statement.importTable) ?? new Map();
		const group = groups.get(signature) ?? { conflictColumns, rows: [] };
		group.rows.push(statement.importValues);
		groups.set(signature, group);
		statementsByTable.set(statement.importTable, groups);
	}

	return CONFLICT_TABLES.flatMap((config) => {
		const groups = statementsByTable.get(config.table);
		if (!groups?.size) return [];
		const collisionSql = config.uniqueKeys
			.map(
				(key) =>
					`(${key
						.map((column) => `existing.${column} IS json_extract(planned.row_json, '$.${column}')`)
						.join(' AND ')})`
			)
			.join(' OR ');
		const ownedSql = config.ownedSql('existing');
		return [...groups.values()].map(({ conflictColumns, rows: sourceRows }) => {
			if (
				!config.uniqueKeys.some(
					(key) =>
						key.length === conflictColumns.length &&
						key.every((column, index) => column === conflictColumns[index])
				)
			) {
				throw new Error(
					`${config.table} uses unrecognised conflict target (${conflictColumns.join(', ')}).`
				);
			}
			const diagnosticColumns = new Set(config.uniqueKeys.flat());
			const rows = sourceRows.map((row) =>
				Object.fromEntries([...diagnosticColumns].map((column) => [column, row[column] ?? null]))
			);
			const targetMatchSql = conflictColumns
				.map((column) => `existing.${column} IS json_extract(planned.row_json, '$.${column}')`)
				.join(' AND ');
			return {
				diagnosticSql: `WITH planned(row_json) AS (SELECT value FROM json_each(?)),
					collisions AS (
						SELECT planned.row_json,
						       existing.id AS existing_id,
						       CASE WHEN (${targetMatchSql}) THEN 1 ELSE 0 END AS target_match,
						       CASE WHEN COALESCE((${ownedSql}), 0) THEN 1 ELSE 0 END AS importer_owned
						FROM ${config.table} AS existing
						JOIN planned ON (${collisionSql})
					),
					blocked_plans AS (
						SELECT row_json
						FROM collisions
						GROUP BY row_json
						HAVING COUNT(DISTINCT existing_id) > 1
						   OR MAX(CASE WHEN importer_owned = 0 OR target_match = 0 THEN 1 ELSE 0 END) = 1
					)
					SELECT COUNT(DISTINCT collisions.existing_id) AS blocking_conflict_count,
					       GROUP_CONCAT(DISTINCT collisions.existing_id) AS blocking_conflict_ids
					FROM collisions
					JOIN blocked_plans ON blocked_plans.row_json IS collisions.row_json`,
				params: [JSON.stringify(rows)],
				conflictTable: config.table,
				conflictColumns,
				plannedRowCount: rows.length
			};
		});
	});
}

/**
 * @deprecated Use importConflictDiagnosticStatements.
 * @param {{ statements: Array<Record<string, any>> }} input
 */
export function childImportConflictDiagnosticStatements(input) {
	return importConflictDiagnosticStatements(input);
}

/** @param {string} table @param {string} rowAlias */
export function childOwnershipSql(table, rowAlias = table) {
	const config = CHILD_TABLES.find((candidate) => candidate.table === table);
	if (!config) throw new Error(`No chained-import ownership policy exists for ${table}.`);
	return config.ownedSql(rowAlias);
}

/** @param {string} table @param {string} rowAlias */
export function importOwnershipSql(table, rowAlias = table) {
	const config = CONFLICT_TABLES.find((candidate) => candidate.table === table);
	if (!config) throw new Error(`No chained-import ownership policy exists for ${table}.`);
	return config.ownedSql(rowAlias);
}

/** @param {string} row */
export function answerChainOwnershipSql(row = 'answer_chains') {
	return metadataOwnerSql(row);
}

/** @param {Record<string, any>[]} statements */
function plannedIds(statements) {
	const result = new Map();
	for (const statement of statements) {
		if (!statement.importTable || !statement.importRowId) continue;
		const ids = result.get(statement.importTable) ?? new Set();
		ids.add(statement.importRowId);
		result.set(statement.importTable, ids);
	}
	return result;
}

/**
 * @param {Record<string, any>} config
 * @param {Array<[string, string[]]>} scopes
 * @param {Set<string>} retainedIds
 */
function scopedDelete(config, scopes, retainedIds) {
	const staleWhere = `${scopes
		.map(([column]) => `${column} IN (SELECT CAST(value AS TEXT) FROM json_each(?))`)
		.join(' AND ')} AND id NOT IN (SELECT CAST(value AS TEXT) FROM json_each(?))`;
	const ownedSql = config.ownedSql(config.table);
	const params = [
		...scopes.map(([, ids]) => JSON.stringify(ids)),
		JSON.stringify([...retainedIds].sort())
	];
	return {
		sql: `DELETE FROM ${config.table} WHERE ${staleWhere} AND (${ownedSql})`,
		diagnosticSql: `SELECT
			COALESCE(SUM(CASE WHEN (${ownedSql}) THEN 1 ELSE 0 END), 0) AS owned_stale_count,
			COALESCE(SUM(CASE WHEN (${ownedSql}) THEN 0 ELSE 1 END), 0) AS preserved_unowned_count
			FROM ${config.table} WHERE ${staleWhere}`,
		params,
		reconcileTable: config.table,
		parentScopeCount: scopes.reduce((count, [, ids]) => count + ids.length, 0),
		retainedRowCount: retainedIds.size
	};
}

/** @param {string} row */
function chainStepOwnershipSql(row) {
	const suffixSql = `substr(${row}.id, length(${row}.answer_chain_id) + length('-step-') + 1)`;
	return `EXISTS (
		SELECT 1 FROM answer_chains AS owned_chain
		WHERE owned_chain.id = ${row}.answer_chain_id
		  AND ${answerChainOwnershipSql('owned_chain')}
		  AND instr(${row}.id, ${row}.answer_chain_id || '-step-') = 1
		  AND ${suffixSql} = printf('%d', CAST(${suffixSql} AS INTEGER))
		  AND CAST(${suffixSql} AS INTEGER) > 0
	)`;
}

/** @param {string} value */
function sqlString(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

/** @param {string[]} values */
function uniqueStrings(values) {
	return [...new Set(values.map(String).filter(Boolean))].sort();
}

/**
 * Convert extraction-time checklist indexes to the stable mark-scheme row ids stored in D1.
 * Explicit ids take priority when a newer extraction already supplies them.
 *
 * @param {string} questionId
 * @param {number} markSchemeItemCount
 * @param {Record<string, any>} modelAnswer
 */
export function modelAnswerSupportingMarkSchemeIds(questionId, markSchemeItemCount, modelAnswer) {
	const explicitIds = modelAnswer.supporting_mark_scheme_item_ids;
	if (Array.isArray(explicitIds) && explicitIds.length) {
		return explicitIds.map(String);
	}
	const indexes =
		modelAnswer.supporting_mark_scheme_item_indexes ?? modelAnswer.supportingIndexes ?? [];
	if (!Array.isArray(indexes)) {
		throw new Error(`${questionId} model-answer support must be an array.`);
	}
	return indexes.map((rawIndex) => {
		const index = Number(rawIndex);
		if (!Number.isInteger(index) || index < 0 || index >= markSchemeItemCount) {
			throw new Error(`${questionId} model answer cites missing mark-scheme index ${rawIndex}.`);
		}
		return `${questionId}-ms-${index + 1}`;
	});
}

/** @param {Record<string, any>} chain */
export function chainSummaryForImport(chain) {
	return chain.summary ?? chain.why_questions_share_chain ?? chain.why_same_chain ?? null;
}
