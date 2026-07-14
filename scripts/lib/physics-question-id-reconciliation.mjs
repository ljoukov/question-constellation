import { gzipSync, gunzipSync } from 'node:zlib';

import {
	normalizedSourceFingerprintInput,
	sourceFingerprintFromInput
} from './chain-illustration-pipeline.mjs';

export const PHYSICS_QUESTION_ID_RECONCILIATION = Object.freeze({
	placeholderQuestionId: 'aqa-8464p1h-qp-jun22-01.4',
	canonicalQuestionId: '8464p1h-jun22-01-4',
	expectedSourceDocumentId: 'aqa-8464p1h-qp-jun22',
	expectedSourceQuestionRef: '01.4',
	expectedSubjectArea: 'Physics',
	expectedComponentCode: '8464P1H',
	expectedAnswerChainId: 'physics-chain-grid-transformer-efficiency'
});

const PUBLIC_ROUTE_TABLE = 'public_route_payloads';
const QUESTIONS_TABLE = 'questions';

/** @typedef {(sql: string, params?: Array<string | number | null>) => Promise<Record<string, any>[]>} QueryRows */
/** @typedef {{ name: string, type: string, pk: number }} ColumnInfo */
/** @typedef {{ name: string, columns: ColumnInfo[], textColumns: string[], affectedTextColumns: string[], primaryKeyColumns: string[], affectedRows: Record<string, any>[] }} TableSnapshot */
/** @typedef {{ id: string, routeKind: string, routePath: string, payloadJson: string, sourceVersion: string | null, updatedAt: string, payloadLength: number, transformedId: string, transformedRoutePath: string, transformedPayloadJson: string, compressed: boolean }} AffectedRoutePayload */

const ALLOWED_FINGERPRINT_IDENTITY_PATHS = [
	/^members\[\d+\]\.questionId$/,
	/^members\[\d+\]\.markSchemeItems\[\d+\]\.id$/,
	/^members\[\d+\]\.checklistItems\[\d+\]\.id$/,
	/^members\[\d+\]\.checklistItems\[\d+\]\.markSchemeItemIds\[\d+\]$/,
	/^members\[\d+\]\.modelAnswers\[\d+\]\.id$/,
	/^members\[\d+\]\.modelAnswers\[\d+\]\.supportingMarkSchemeItemIds\[\d+\]$/
];

const ALLOWED_ILLUSTRATION_IDENTITY_COLUMNS = new Set([
	'source_question_id',
	'generation_metadata_json'
]);

/** @param {string} value */
function quoteIdentifier(value) {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
		throw new Error(`Unsafe SQLite identifier: ${value}`);
	}
	return `"${value}"`;
}

/** @param {string} value */
function isTextAffinity(value) {
	return /(?:CHAR|CLOB|TEXT)/i.test(value);
}

/** @param {unknown} value */
export function replacePhysicsQuestionIdentity(value) {
	if (typeof value !== 'string') return value;
	return value.replaceAll(
		PHYSICS_QUESTION_ID_RECONCILIATION.placeholderQuestionId,
		PHYSICS_QUESTION_ID_RECONCILIATION.canonicalQuestionId
	);
}

/**
 * Project only the identity-bearing leaves that participate in illustration freshness. A stale
 * token anywhere else is a hard error: it would mean the rename changes actual chain evidence,
 * not just generated database identities.
 * @param {unknown} input
 * @param {{fromQuestionId?: string, toQuestionId?: string}} [options]
 */
export function projectPhysicsFingerprintIdentity(
	input,
	{
		fromQuestionId = PHYSICS_QUESTION_ID_RECONCILIATION.placeholderQuestionId,
		toQuestionId = PHYSICS_QUESTION_ID_RECONCILIATION.canonicalQuestionId
	} = {}
) {
	if (!fromQuestionId || !toQuestionId || fromQuestionId === toQuestionId) {
		throw new Error('Fingerprint identity projection requires two distinct question ids.');
	}
	/** @type {Array<{path: string, before: string, after: string}>} */
	const changedPaths = [];

	/** @param {unknown} value @param {string} path @returns {unknown} */
	function visit(value, path) {
		if (typeof value === 'string') {
			if (!value.includes(fromQuestionId)) return value;
			if (!ALLOWED_FINGERPRINT_IDENTITY_PATHS.some((pattern) => pattern.test(path))) {
				throw new Error(`Physics identity appears at non-allowlisted fingerprint path ${path}.`);
			}
			const after = value.replaceAll(fromQuestionId, toQuestionId);
			changedPaths.push({ path, before: value, after });
			return after;
		}
		if (Array.isArray(value)) {
			return value.map((item, index) => visit(item, `${path}[${index}]`));
		}
		if (!value || typeof value !== 'object') return value;
		return Object.fromEntries(
			Object.entries(/** @type {Record<string, unknown>} */ (value)).map(([key, item]) => [
				key,
				visit(item, path ? `${path}.${key}` : key)
			])
		);
	}

	const projectedInput = visit(input, '');
	const questionIdChanges = changedPaths.filter((change) => /\.questionId$/.test(change.path));
	if (questionIdChanges.length !== 1) {
		throw new Error(
			`Expected exactly one Physics member questionId projection, found ${questionIdChanges.length}.`
		);
	}
	if (JSON.stringify(projectedInput).includes(fromQuestionId)) {
		throw new Error('Projected fingerprint input still contains the source question id.');
	}
	return { projectedInput, changedPaths };
}

/**
 * Build and validate the old/new illustration freshness inputs for either side of the identity
 * migration. This also makes an interrupted phase-one run safely resumable.
 * @param {Parameters<typeof normalizedSourceFingerprintInput>[0] & {sourceFingerprint: string}} candidate
 * @param {'placeholder' | 'canonical'} identity
 */
export function buildPhysicsFingerprintTransition(candidate, identity) {
	const config = PHYSICS_QUESTION_ID_RECONCILIATION;
	const currentInput = normalizedSourceFingerprintInput(candidate);
	const computedCurrentFingerprint = sourceFingerprintFromInput(currentInput);
	if (candidate.sourceFingerprint !== computedCurrentFingerprint) {
		throw new Error(
			`Candidate source fingerprint ${candidate.sourceFingerprint} does not match computed ${computedCurrentFingerprint}.`
		);
	}

	if (identity === 'placeholder') {
		const { projectedInput: canonicalInput, changedPaths } =
			projectPhysicsFingerprintIdentity(currentInput);
		return {
			identity,
			oldInput: currentInput,
			canonicalInput,
			oldFingerprint: computedCurrentFingerprint,
			canonicalFingerprint: sourceFingerprintFromInput(canonicalInput),
			changedPaths
		};
	}
	if (identity === 'canonical') {
		const reverse = projectPhysicsFingerprintIdentity(currentInput, {
			fromQuestionId: config.canonicalQuestionId,
			toQuestionId: config.placeholderQuestionId
		});
		return {
			identity,
			oldInput: reverse.projectedInput,
			canonicalInput: currentInput,
			oldFingerprint: sourceFingerprintFromInput(reverse.projectedInput),
			canonicalFingerprint: computedCurrentFingerprint,
			changedPaths: reverse.changedPaths.map((change) => ({
				path: change.path,
				before: change.after,
				after: change.before
			}))
		};
	}
	throw new Error(`Unknown Physics candidate identity: ${identity}`);
}

/** @param {string} raw */
export function decodePublicRoutePayload(raw) {
	const wrapper = JSON.parse(raw);
	if (wrapper?.__qcPayloadEncoding === 'gzip-base64' && typeof wrapper.data === 'string') {
		return {
			value: JSON.parse(gunzipSync(Buffer.from(wrapper.data, 'base64')).toString('utf8')),
			compressed: true,
			wrapper
		};
	}
	return { value: wrapper, compressed: false, wrapper: null };
}

/**
 * Replace identity tokens in JSON keys as well as values while preserving the existing payload
 * encoding. Parsing before and after replacement also proves that the rewritten payload is valid.
 * @param {string} raw
 */
export function rewritePublicRoutePayload(raw) {
	const decoded = decodePublicRoutePayload(raw);
	const rewrittenJson = JSON.stringify(decoded.value).replaceAll(
		PHYSICS_QUESTION_ID_RECONCILIATION.placeholderQuestionId,
		PHYSICS_QUESTION_ID_RECONCILIATION.canonicalQuestionId
	);
	const rewrittenValue = JSON.parse(rewrittenJson);
	if (!decoded.compressed) return JSON.stringify(rewrittenValue);
	return JSON.stringify({
		...decoded.wrapper,
		data: gzipSync(Buffer.from(JSON.stringify(rewrittenValue))).toString('base64')
	});
}

/** @param {Record<string, any>} row */
function routePayloadContainsPlaceholder(row) {
	const placeholder = PHYSICS_QUESTION_ID_RECONCILIATION.placeholderQuestionId;
	if (
		String(row.id ?? '').includes(placeholder) ||
		String(row.route_path ?? '').includes(placeholder)
	) {
		return true;
	}
	return JSON.stringify(decodePublicRoutePayload(String(row.payload_json)).value).includes(
		placeholder
	);
}

/** @param {Record<string, any>} row @returns {AffectedRoutePayload} */
function affectedRoutePayload(row) {
	const decoded = decodePublicRoutePayload(String(row.payload_json));
	return {
		id: String(row.id),
		routeKind: String(row.route_kind),
		routePath: String(row.route_path),
		payloadJson: String(row.payload_json),
		sourceVersion: row.source_version == null ? null : String(row.source_version),
		updatedAt: String(row.updated_at),
		payloadLength: Number(row.payload_length),
		transformedId: /** @type {string} */ (replacePhysicsQuestionIdentity(String(row.id))),
		transformedRoutePath: /** @type {string} */ (
			replacePhysicsQuestionIdentity(String(row.route_path))
		),
		transformedPayloadJson: rewritePublicRoutePayload(String(row.payload_json)),
		compressed: decoded.compressed
	};
}

/**
 * Inspect every user table so an identity hidden in a child-row id or JSON field cannot be missed.
 * Public route payloads are decoded separately because their JSON may be gzip/base64 wrapped.
 * @param {QueryRows} queryRows
 */
export async function inspectPhysicsQuestionIdState(queryRows) {
	const tableRows = await queryRows(
		`SELECT name
		 FROM sqlite_master
		 WHERE type = 'table'
		   AND name NOT LIKE 'sqlite_%'
		   AND substr(name, 1, 1) <> '_'
		 ORDER BY name`
	);
	/** @type {TableSnapshot[]} */
	const tables = [];
	for (const { name: rawName } of tableRows) {
		const name = String(rawName);
		const columns = /** @type {ColumnInfo[]} */ (
			(await queryRows(`PRAGMA table_info(${quoteIdentifier(name)})`)).map((column) => ({
				name: String(column.name),
				type: String(column.type ?? ''),
				pk: Number(column.pk ?? 0)
			}))
		);
		const textColumns = columns
			.filter((column) => isTextAffinity(column.type))
			.map((column) => column.name);
		const primaryKeyColumns = columns
			.filter((column) => column.pk > 0)
			.sort((left, right) => left.pk - right.pk)
			.map((column) => column.name);
		/** @type {Record<string, any>[]} */
		let affectedRows = [];
		if (name !== PUBLIC_ROUTE_TABLE && textColumns.length) {
			const where = textColumns
				.map((column) => `instr(COALESCE(${quoteIdentifier(column)}, ''), ?) > 0`)
				.join(' OR ');
			affectedRows = await queryRows(
				`SELECT * FROM ${quoteIdentifier(name)} WHERE ${where}`,
				textColumns.map(() => PHYSICS_QUESTION_ID_RECONCILIATION.placeholderQuestionId)
			);
		}
		const affectedTextColumns = textColumns.filter((column) =>
			affectedRows.some((row) =>
				String(row[column] ?? '').includes(PHYSICS_QUESTION_ID_RECONCILIATION.placeholderQuestionId)
			)
		);
		tables.push({
			name,
			columns,
			textColumns,
			affectedTextColumns,
			primaryKeyColumns,
			affectedRows
		});
	}

	const questions = tables.find((table) => table.name === QUESTIONS_TABLE);
	const routes = tables.find((table) => table.name === PUBLIC_ROUTE_TABLE);
	if (!questions) throw new Error('questions table is missing.');
	if (!routes) throw new Error('public_route_payloads table is missing.');

	const [oldQuestions, canonicalQuestions, canonicalSlugRows, routeRows, illustrationRows] =
		await Promise.all([
			queryRows(`SELECT * FROM questions WHERE id = ?`, [
				PHYSICS_QUESTION_ID_RECONCILIATION.placeholderQuestionId
			]),
			queryRows(`SELECT * FROM questions WHERE id = ?`, [
				PHYSICS_QUESTION_ID_RECONCILIATION.canonicalQuestionId
			]),
			queryRows(`SELECT id, slug FROM questions WHERE slug = ?`, [
				PHYSICS_QUESTION_ID_RECONCILIATION.canonicalQuestionId
			]),
			queryRows(
				`SELECT id, route_kind, route_path, payload_json, source_version, updated_at,
			        length(payload_json) AS payload_length
			 FROM public_route_payloads
			 ORDER BY id`
			),
			queryRows(`SELECT * FROM answer_chain_illustrations WHERE answer_chain_id = ? ORDER BY id`, [
				PHYSICS_QUESTION_ID_RECONCILIATION.expectedAnswerChainId
			])
		]);
	const affectedRoutePayloads = routeRows
		.filter(routePayloadContainsPlaceholder)
		.map(affectedRoutePayload);

	const conflicts = [];
	if (
		canonicalSlugRows.some(
			(row) => row.id !== PHYSICS_QUESTION_ID_RECONCILIATION.canonicalQuestionId
		)
	) {
		conflicts.push(`Canonical slug is already owned by ${canonicalSlugRows[0].id}.`);
	}
	const routeIdOwners = new Map(routeRows.map((row) => [String(row.id), row]));
	const routePathOwners = new Map(routeRows.map((row) => [String(row.route_path), row]));
	for (const route of affectedRoutePayloads) {
		const idOwner = routeIdOwners.get(route.transformedId);
		if (idOwner && String(idOwner.id) !== route.id) {
			conflicts.push(`${route.id} would collide with route id ${route.transformedId}.`);
		}
		const pathOwner = routePathOwners.get(route.transformedRoutePath);
		if (pathOwner && String(pathOwner.id) !== route.id) {
			conflicts.push(`${route.id} would collide with route path ${route.transformedRoutePath}.`);
		}
	}

	for (const table of tables) {
		if ([QUESTIONS_TABLE, PUBLIC_ROUTE_TABLE].includes(table.name)) continue;
		if (!table.affectedRows.length || !table.primaryKeyColumns.length) continue;
		for (const row of table.affectedRows) {
			const originalKey = table.primaryKeyColumns.map((column) => row[column]);
			const transformedKey = originalKey.map(replacePhysicsQuestionIdentity);
			if (JSON.stringify(originalKey) === JSON.stringify(transformedKey)) continue;
			const matches = await queryRows(
				`SELECT ${table.primaryKeyColumns.map(quoteIdentifier).join(', ')}
				 FROM ${quoteIdentifier(table.name)}
				 WHERE ${table.primaryKeyColumns.map((column) => `${quoteIdentifier(column)} = ?`).join(' AND ')}`,
				/** @type {Array<string | number | null>} */ (transformedKey)
			);
			if (matches.length) {
				conflicts.push(
					`${table.name} primary key ${JSON.stringify(originalKey)} would collide with ${JSON.stringify(transformedKey)}.`
				);
			}
		}
	}

	return {
		tables,
		oldQuestions,
		canonicalQuestions,
		affectedRoutePayloads,
		routeSnapshot: {
			count: routeRows.length,
			maxUpdatedAt: routeRows.reduce(
				(maximum, row) => (String(row.updated_at) > maximum ? String(row.updated_at) : maximum),
				''
			),
			payloadLengthTotal: routeRows.reduce(
				(total, row) => total + Number(row.payload_length ?? 0),
				0
			)
		},
		illustrationRows,
		conflicts
	};
}

/** @param {Record<string, any>} row */
function questionIdentityIssues(row) {
	const expected = PHYSICS_QUESTION_ID_RECONCILIATION;
	const issues = [];
	if (row.source_document_id !== expected.expectedSourceDocumentId) {
		issues.push(
			`source_document_id is ${row.source_document_id}, expected ${expected.expectedSourceDocumentId}.`
		);
	}
	if (row.source_question_ref !== expected.expectedSourceQuestionRef) {
		issues.push(
			`source_question_ref is ${row.source_question_ref}, expected ${expected.expectedSourceQuestionRef}.`
		);
	}
	if (row.subject_area !== expected.expectedSubjectArea) {
		issues.push(`subject_area is ${row.subject_area}, expected ${expected.expectedSubjectArea}.`);
	}
	if (row.component_code !== expected.expectedComponentCode) {
		issues.push(
			`component_code is ${row.component_code}, expected ${expected.expectedComponentCode}.`
		);
	}
	return issues;
}

/** @param {Awaited<ReturnType<typeof inspectPhysicsQuestionIdState>>} state */
export function validatePhysicsQuestionIdPreflight(state) {
	const issues = [...state.conflicts];
	if (state.oldQuestions.length > 1 || state.canonicalQuestions.length > 1) {
		issues.push('Question identity lookup returned duplicate primary keys.');
	}
	if (state.oldQuestions.length && state.canonicalQuestions.length) {
		issues.push('Both placeholder and canonical questions exist; refusing to merge them.');
	}
	if (!state.oldQuestions.length && !state.canonicalQuestions.length) {
		issues.push('Neither placeholder nor canonical Physics question exists.');
	}
	const question = state.oldQuestions[0] ?? state.canonicalQuestions[0];
	if (question) issues.push(...questionIdentityIssues(question));
	for (const table of state.tables) {
		if (table.affectedRows.length && !table.primaryKeyColumns.length) {
			issues.push(
				`${table.name} contains the placeholder but has no primary key for audited updates.`
			);
		}
	}
	const illustrationTable = state.tables.find(
		(table) => table.name === 'answer_chain_illustrations'
	);
	for (const column of illustrationTable?.affectedTextColumns ?? []) {
		if (!ALLOWED_ILLUSTRATION_IDENTITY_COLUMNS.has(column)) {
			issues.push(
				`Illustration identity occurs in protected column answer_chain_illustrations.${column}.`
			);
		}
	}
	return { status: issues.length ? 'failed' : 'passed', issues };
}

/** @param {TableSnapshot} questions */
function canonicalQuestionInsert(questions) {
	const config = PHYSICS_QUESTION_ID_RECONCILIATION;
	const columnNames = questions.columns.map((column) => column.name);
	const select = [];
	const params = [];
	for (const column of questions.columns) {
		if (isTextAffinity(column.type)) {
			select.push(`replace(${quoteIdentifier(column.name)}, ?, ?)`);
			params.push(config.placeholderQuestionId, config.canonicalQuestionId);
		} else {
			select.push(quoteIdentifier(column.name));
		}
	}
	params.push(
		config.placeholderQuestionId,
		config.expectedSourceDocumentId,
		config.expectedSourceQuestionRef,
		config.expectedSubjectArea,
		config.expectedComponentCode
	);
	return {
		sql: `INSERT INTO questions (${columnNames.map(quoteIdentifier).join(', ')})
		      SELECT ${select.join(', ')}
		      FROM questions
		      WHERE id = ?
		        AND source_document_id = ?
		        AND source_question_ref = ?
		        AND subject_area = ?
		        AND component_code = ?`,
		params
	};
}

/** @param {TableSnapshot} table */
function replaceTableIdentityStatement(table) {
	const placeholder = PHYSICS_QUESTION_ID_RECONCILIATION.placeholderQuestionId;
	const canonical = PHYSICS_QUESTION_ID_RECONCILIATION.canonicalQuestionId;
	if (!table.affectedTextColumns.length) {
		throw new Error(`${table.name} has no affected text columns.`);
	}
	return {
		sql: `UPDATE ${quoteIdentifier(table.name)}
		      SET ${table.affectedTextColumns.map((column) => `${quoteIdentifier(column)} = replace(${quoteIdentifier(column)}, ?, ?)`).join(', ')}
		      WHERE ${table.affectedTextColumns.map((column) => `instr(COALESCE(${quoteIdentifier(column)}, ''), ?) > 0`).join(' OR ')}`,
		params: [
			...table.affectedTextColumns.flatMap(() => [placeholder, canonical]),
			...table.affectedTextColumns.map(() => placeholder)
		]
	};
}

/** @param {AffectedRoutePayload} route @param {string} updatedAt */
function routeUpdateStatement(route, updatedAt) {
	return {
		sql: `UPDATE public_route_payloads
		      SET id = ?, route_path = ?, payload_json = ?, updated_at = ?
		      WHERE id = ?
		        AND route_path = ?
		        AND payload_json = ?
		        AND source_version IS ?
		        AND updated_at = ?`,
		params: [
			route.transformedId,
			route.transformedRoutePath,
			route.transformedPayloadJson,
			updatedAt,
			route.id,
			route.routePath,
			route.payloadJson,
			route.sourceVersion,
			route.updatedAt
		]
	};
}

/** @param {string} condition @param {Array<string | number | null>} params @param {string} label */
function verificationGuardStatement(condition, params, label) {
	return {
		sql: `SELECT CASE WHEN ${condition}
		      THEN ?
		      ELSE json_extract('intentional-reconciliation-guard-error', '$')
		      END AS reconciliation_status`,
		params: [...params, label]
	};
}

/** @param {Awaited<ReturnType<typeof inspectPhysicsQuestionIdState>>} state @param {string} routeUpdatedAt */
function verificationGuardStatements(state, routeUpdatedAt) {
	const config = PHYSICS_QUESTION_ID_RECONCILIATION;
	const statements = [
		verificationGuardStatement(
			`(SELECT COUNT(*) FROM questions WHERE id = ?) = 0
			 AND (SELECT COUNT(*) FROM questions
		  WHERE id = ?
		    AND source_document_id = ?
		    AND source_question_ref = ?
		    AND subject_area = ?
		    AND component_code = ?) = 1
			 AND NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check)`,
			[
				config.placeholderQuestionId,
				config.canonicalQuestionId,
				config.expectedSourceDocumentId,
				config.expectedSourceQuestionRef,
				config.expectedSubjectArea,
				config.expectedComponentCode
			],
			'question-and-foreign-keys-verified'
		)
	];
	for (const table of state.tables) {
		if (!table.textColumns.length) continue;
		statements.push(
			verificationGuardStatement(
				`NOT EXISTS (
			   SELECT 1 FROM ${quoteIdentifier(table.name)}
			   WHERE ${table.textColumns.map((column) => `instr(COALESCE(${quoteIdentifier(column)}, ''), ?) > 0`).join(' OR ')}
			 )`,
				table.textColumns.map(() => config.placeholderQuestionId),
				`${table.name}-text-verified`
			)
		);
	}
	for (const route of state.affectedRoutePayloads) {
		statements.push(
			verificationGuardStatement(
				`EXISTS (
			   SELECT 1 FROM public_route_payloads
			   WHERE id = ? AND route_path = ? AND updated_at = ?
			 )`,
				[route.transformedId, route.transformedRoutePath, routeUpdatedAt],
				`${route.transformedId}-payload-verified`
			)
		);
	}
	return statements;
}

/** @param {Awaited<ReturnType<typeof inspectPhysicsQuestionIdState>>} state */
function routeSnapshotGuardStatement(state) {
	return verificationGuardStatement(
		`(SELECT COUNT(*) FROM public_route_payloads) = ?
		 AND COALESCE((SELECT MAX(updated_at) FROM public_route_payloads), '') = ?
		 AND COALESCE((SELECT SUM(length(payload_json)) FROM public_route_payloads), 0) = ?`,
		[
			state.routeSnapshot.count,
			state.routeSnapshot.maxUpdatedAt,
			state.routeSnapshot.payloadLengthTotal
		],
		'public-route-snapshot-verified'
	);
}

/** @param {Awaited<ReturnType<typeof inspectPhysicsQuestionIdState>>} state */
function illustrationSnapshotGuardStatements(state) {
	const chainId = PHYSICS_QUESTION_ID_RECONCILIATION.expectedAnswerChainId;
	const statements = [
		verificationGuardStatement(
			`(SELECT COUNT(*) FROM answer_chain_illustrations WHERE answer_chain_id = ?) = ?`,
			[chainId, state.illustrationRows.length],
			'illustration-row-count-snapshot-verified'
		)
	];
	for (const row of state.illustrationRows) {
		const entries = Object.entries(row);
		for (const [column, value] of entries) {
			quoteIdentifier(column);
			if (!isD1Parameter(value)) {
				throw new Error(`Unsupported D1 value in illustration snapshot ${column}.`);
			}
		}
		statements.push(
			verificationGuardStatement(
				`(SELECT COUNT(*) FROM answer_chain_illustrations
				  WHERE ${entries.map(([column]) => `${quoteIdentifier(column)} IS ?`).join('\n    AND ')}) = 1`,
				entries.map(([, value]) => /** @type {string | number | null} */ (value)),
				`${row.id}-illustration-snapshot-verified`
			)
		);
	}
	return statements;
}

/**
 * Build the one-shot transactional batch. Cloudflare D1 executes a REST `batch` as one SQL
 * transaction; the final guard deliberately errors if any reference, payload, or FK is stale.
 * @param {Awaited<ReturnType<typeof inspectPhysicsQuestionIdState>>} state
 */
export function buildPhysicsQuestionIdReconciliationPlan(state) {
	const validation = validatePhysicsQuestionIdPreflight(state);
	if (validation.status !== 'passed') {
		throw new Error(`Physics question-id preflight failed: ${validation.issues.join(' ')}`);
	}
	const hasPlaceholder = state.oldQuestions.length === 1;
	const staleRowCount = state.tables.reduce((total, table) => total + table.affectedRows.length, 0);
	const hasStaleReferences =
		staleRowCount > (hasPlaceholder ? 1 : 0) || state.affectedRoutePayloads.length > 0;
	if (!hasPlaceholder && !hasStaleReferences) {
		return {
			status: 'already-reconciled',
			statements: [],
			validation,
			summary: reconciliationSummary(state)
		};
	}

	const routeUpdatedAt = new Date().toISOString();
	const statements = [
		routeSnapshotGuardStatement(state),
		...illustrationSnapshotGuardStatements(state)
	];
	const questions = state.tables.find((table) => table.name === QUESTIONS_TABLE);
	if (!questions) throw new Error('questions table is missing from the reconciliation snapshot.');
	if (hasPlaceholder) statements.push(canonicalQuestionInsert(questions));
	else if (questions.affectedRows.length) statements.push(replaceTableIdentityStatement(questions));
	for (const table of state.tables) {
		if ([QUESTIONS_TABLE, PUBLIC_ROUTE_TABLE].includes(table.name)) continue;
		if (table.affectedRows.length) statements.push(replaceTableIdentityStatement(table));
	}
	for (const route of state.affectedRoutePayloads) {
		statements.push(routeUpdateStatement(route, routeUpdatedAt));
	}
	if (hasPlaceholder) {
		statements.push({
			sql: `DELETE FROM questions
			      WHERE id = ?
			        AND source_document_id = ?
			        AND source_question_ref = ?
			        AND subject_area = ?
			        AND component_code = ?`,
			params: [
				PHYSICS_QUESTION_ID_RECONCILIATION.placeholderQuestionId,
				PHYSICS_QUESTION_ID_RECONCILIATION.expectedSourceDocumentId,
				PHYSICS_QUESTION_ID_RECONCILIATION.expectedSourceQuestionRef,
				PHYSICS_QUESTION_ID_RECONCILIATION.expectedSubjectArea,
				PHYSICS_QUESTION_ID_RECONCILIATION.expectedComponentCode
			]
		});
	}
	statements.push(...verificationGuardStatements(state, routeUpdatedAt));
	for (const [index, statement] of statements.entries()) {
		if (statement.params.length > 100) {
			throw new Error(
				`Reconciliation statement ${index + 1} exceeds D1's 100-bound-parameter limit.`
			);
		}
		if (Buffer.byteLength(statement.sql, 'utf8') > 100_000) {
			throw new Error(`Reconciliation statement ${index + 1} exceeds D1's 100 KB SQL limit.`);
		}
		for (const parameter of statement.params) {
			if (typeof parameter === 'string' && Buffer.byteLength(parameter, 'utf8') > 2_000_000) {
				throw new Error(
					`Reconciliation statement ${index + 1} contains a parameter above D1's 2 MB value limit.`
				);
			}
		}
	}
	return {
		status: hasPlaceholder ? 'ready' : 'cleanup-ready',
		statements,
		routeUpdatedAt,
		validation,
		summary: reconciliationSummary(state)
	};
}

/** @param {Awaited<ReturnType<typeof inspectPhysicsQuestionIdState>>} state */
export function reconciliationSummary(state) {
	return {
		placeholderQuestionCount: state.oldQuestions.length,
		canonicalQuestionCount: state.canonicalQuestions.length,
		affectedRowsByTable: Object.fromEntries(
			state.tables
				.filter((table) => table.affectedRows.length)
				.map((table) => [table.name, table.affectedRows.length])
		),
		affectedRoutePayloads: state.affectedRoutePayloads.map((route) => ({
			id: route.id,
			transformedId: route.transformedId,
			routePath: route.routePath,
			transformedRoutePath: route.transformedRoutePath,
			compressed: route.compressed
		})),
		routeSnapshot: state.routeSnapshot,
		conflicts: state.conflicts
	};
}

/**
 * Require the candidate and its single published primary row to describe the same current source.
 * @param {Record<string, any>} candidate
 * @param {ReturnType<typeof buildPhysicsFingerprintTransition>} transition
 * @param {Record<string, any>[]} illustrationRows
 */
export function validatePhysicsIllustrationFingerprintState(
	candidate,
	transition,
	illustrationRows
) {
	const issues = [];
	const primaries = illustrationRows.filter(
		(row) => row.status === 'published' && Number(row.is_primary) === 1
	);
	if (primaries.length !== 1) {
		issues.push(`Expected exactly one published primary illustration, found ${primaries.length}.`);
	}
	const primary = primaries[0] ?? null;
	const expectedQuestionId =
		transition.identity === 'placeholder'
			? PHYSICS_QUESTION_ID_RECONCILIATION.placeholderQuestionId
			: PHYSICS_QUESTION_ID_RECONCILIATION.canonicalQuestionId;
	const expectedCurrentFingerprint =
		transition.identity === 'placeholder'
			? transition.oldFingerprint
			: transition.canonicalFingerprint;
	if (candidate.sourceFingerprint !== expectedCurrentFingerprint) {
		issues.push(
			`Candidate current fingerprint is ${candidate.sourceFingerprint}, expected ${expectedCurrentFingerprint}.`
		);
	}
	if (primary) {
		if (primary.answer_chain_id !== PHYSICS_QUESTION_ID_RECONCILIATION.expectedAnswerChainId) {
			issues.push(`Published primary belongs to unexpected chain ${primary.answer_chain_id}.`);
		}
		if (Number(primary.needs_human_review) !== 0) {
			issues.push('Published primary illustration still needs human review.');
		}
		if (primary.source_question_id !== expectedQuestionId) {
			issues.push(
				`Published primary source question is ${primary.source_question_id}, expected ${expectedQuestionId}.`
			);
		}
		if (candidate.existingIllustrationId !== primary.id) {
			issues.push(
				`Candidate resolves primary ${candidate.existingIllustrationId}, but snapshot primary is ${primary.id}.`
			);
		}
		if (candidate.existingSourceFingerprint !== primary.source_fingerprint) {
			issues.push(
				`Candidate stored fingerprint ${candidate.existingSourceFingerprint} differs from primary ${primary.source_fingerprint}.`
			);
		}
		const allowedStoredFingerprints =
			transition.identity === 'placeholder'
				? [transition.oldFingerprint]
				: [transition.oldFingerprint, transition.canonicalFingerprint];
		if (!allowedStoredFingerprints.includes(primary.source_fingerprint)) {
			issues.push(
				`Published primary fingerprint ${primary.source_fingerprint} is not an expected transition fingerprint.`
			);
		}
		try {
			const metadata = JSON.parse(String(primary.generation_metadata_json));
			if (metadata?.sourceFingerprint !== primary.source_fingerprint) {
				issues.push(
					`Published primary metadata fingerprint ${metadata?.sourceFingerprint} differs from stored ${primary.source_fingerprint}.`
				);
			}
		} catch (error) {
			issues.push(`Published primary generation metadata is invalid JSON: ${errorMessage(error)}.`);
		}
	}
	const phase =
		transition.identity === 'placeholder'
			? 'identity-and-fingerprint-pending'
			: primary?.source_fingerprint === transition.canonicalFingerprint
				? 'complete'
				: 'fingerprint-rebase-pending';
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		phase,
		primary
	};
}

/**
 * Validate that phase one changed no illustration state beyond the two approved identity fields.
 * @param {Record<string, any>[]} beforeRows
 * @param {Record<string, any>[]} afterRows
 */
export function validatePhysicsIllustrationsAfterIdentityPhase(beforeRows, afterRows) {
	const expectedRows = expectedIllustrationRowsAfterIdentityPhase(beforeRows);
	const issues = compareIllustrationRows(expectedRows, afterRows);
	return { status: issues.length ? 'failed' : 'passed', issues, expectedRows };
}

/**
 * Build the deliberately tiny second transaction. It updates only the published primary's
 * freshness hash and the matching top-level metadata field, with every other row value used as an
 * optimistic-concurrency predicate.
 * @param {{illustrationRows: Record<string, any>[], primaryId: string, oldFingerprint: string, canonicalFingerprint: string}} input
 */
export function buildPublishedPrimaryFingerprintRebasePlan({
	illustrationRows,
	primaryId,
	oldFingerprint,
	canonicalFingerprint
}) {
	const primaries = illustrationRows.filter(
		(row) => row.status === 'published' && Number(row.is_primary) === 1
	);
	if (primaries.length !== 1 || primaries[0].id !== primaryId) {
		throw new Error('Fingerprint rebase requires the exact preflight published primary row.');
	}
	const primary = primaries[0];
	if (primary.source_fingerprint !== oldFingerprint) {
		throw new Error(
			`Published primary fingerprint is ${primary.source_fingerprint}, expected old ${oldFingerprint}.`
		);
	}
	if (primary.source_question_id !== PHYSICS_QUESTION_ID_RECONCILIATION.canonicalQuestionId) {
		throw new Error('Fingerprint rebase requires the canonical source question id.');
	}
	const generationMetadataJson = rebaseGenerationMetadataFingerprint(
		primary.generation_metadata_json,
		oldFingerprint,
		canonicalFingerprint
	);
	const immutableEntries = Object.entries(primary).filter(
		([column]) => !['source_fingerprint', 'generation_metadata_json'].includes(column)
	);
	for (const [column, value] of immutableEntries) {
		quoteIdentifier(column);
		if (!isD1Parameter(value)) {
			throw new Error(`Unsupported D1 value in illustration predicate ${column}.`);
		}
	}
	const update = {
		sql: `UPDATE answer_chain_illustrations
		      SET source_fingerprint = ?, generation_metadata_json = ?
		      WHERE source_fingerprint IS ?
		        AND generation_metadata_json IS ?
		        AND ${immutableEntries.map(([column]) => `${quoteIdentifier(column)} IS ?`).join('\n        AND ')}`,
		params: [
			canonicalFingerprint,
			generationMetadataJson,
			oldFingerprint,
			primary.generation_metadata_json,
			...immutableEntries.map(([, value]) => /** @type {string | number | null} */ (value))
		]
	};
	const guard = verificationGuardStatement(
		`(SELECT COUNT(*) FROM answer_chain_illustrations
		   WHERE id = ?
		     AND answer_chain_id = ?
		     AND source_question_id = ?
		     AND source_fingerprint = ?
		     AND generation_metadata_json = ?
		     AND status = 'published'
		     AND is_primary = 1
		     AND needs_human_review = 0) = 1
		 AND (SELECT COUNT(*) FROM answer_chain_illustrations
		      WHERE answer_chain_id = ? AND status = 'published' AND is_primary = 1) = 1`,
		[
			primary.id,
			PHYSICS_QUESTION_ID_RECONCILIATION.expectedAnswerChainId,
			PHYSICS_QUESTION_ID_RECONCILIATION.canonicalQuestionId,
			canonicalFingerprint,
			generationMetadataJson,
			PHYSICS_QUESTION_ID_RECONCILIATION.expectedAnswerChainId
		],
		'published-primary-fingerprint-rebased'
	);
	validateStatementLimits([update, guard]);
	return {
		statements: [update, guard],
		generationMetadataJson,
		expectedPrimary: {
			...primary,
			source_fingerprint: canonicalFingerprint,
			generation_metadata_json: generationMetadataJson
		}
	};
}

/**
 * Verify the final illustration snapshot against the original preflight rows. Draft hashes remain
 * historical; the published primary alone receives the canonical freshness fingerprint.
 * @param {Record<string, any>[]} beforeRows
 * @param {Record<string, any>[]} afterRows
 * @param {{primaryId: string, oldFingerprint: string, canonicalFingerprint: string}} transition
 */
export function validatePhysicsIllustrationsAfterFingerprintRebase(
	beforeRows,
	afterRows,
	{ primaryId, oldFingerprint, canonicalFingerprint }
) {
	const expectedRows = expectedIllustrationRowsAfterIdentityPhase(beforeRows).map((row) => {
		if (row.id !== primaryId) return row;
		if (row.source_fingerprint === canonicalFingerprint) {
			const metadata = JSON.parse(String(row.generation_metadata_json));
			if (metadata?.sourceFingerprint !== canonicalFingerprint) {
				throw new Error(
					'Already-rebased primary metadata does not contain the canonical fingerprint.'
				);
			}
			return row;
		}
		if (row.source_fingerprint !== oldFingerprint) {
			throw new Error('Original published primary did not contain a transition fingerprint.');
		}
		return {
			...row,
			source_fingerprint: canonicalFingerprint,
			generation_metadata_json: rebaseGenerationMetadataFingerprint(
				row.generation_metadata_json,
				oldFingerprint,
				canonicalFingerprint
			)
		};
	});
	const issues = compareIllustrationRows(expectedRows, afterRows);
	return { status: issues.length ? 'failed' : 'passed', issues, expectedRows };
}

/**
 * Validate Cloudflare's outer envelope and every per-statement result. Missing success fields are
 * failures, not implicit successes.
 * @param {unknown} body
 * @param {number} statementCount
 */
export function validateD1TransactionalBatchResponse(body, statementCount) {
	if (!body || typeof body !== 'object') {
		throw new Error('D1 transactional batch returned a non-object response.');
	}
	const envelope = /** @type {Record<string, any>} */ (body);
	if (envelope.success !== true) {
		throw new Error(`D1 transactional batch failed: ${JSON.stringify(envelope.errors ?? body)}`);
	}
	if (!Array.isArray(envelope.result) || envelope.result.length !== statementCount) {
		throw new Error(
			`D1 transactional batch returned ${Array.isArray(envelope.result) ? envelope.result.length : 'a non-array result'}, expected ${statementCount}.`
		);
	}
	if (envelope.result.some((result) => result?.success !== true)) {
		throw new Error('D1 transactional batch contained a statement without success=true.');
	}
	return envelope.result;
}

/** @param {Record<string, any>[]} rows */
function expectedIllustrationRowsAfterIdentityPhase(rows) {
	return rows.map((row) => {
		const expected = { ...row };
		for (const [column, value] of Object.entries(row)) {
			if (
				typeof value !== 'string' ||
				!value.includes(PHYSICS_QUESTION_ID_RECONCILIATION.placeholderQuestionId)
			) {
				continue;
			}
			if (!ALLOWED_ILLUSTRATION_IDENTITY_COLUMNS.has(column)) {
				throw new Error(`Protected illustration column ${column} contains the placeholder id.`);
			}
			expected[column] = replacePhysicsQuestionIdentity(value);
			if (column === 'generation_metadata_json') JSON.parse(expected[column]);
		}
		return expected;
	});
}

/** @param {Record<string, any>[]} expectedRows @param {Record<string, any>[]} actualRows */
function compareIllustrationRows(expectedRows, actualRows) {
	const issues = [];
	const expectedById = new Map(expectedRows.map((row) => [String(row.id), row]));
	const actualById = new Map(actualRows.map((row) => [String(row.id), row]));
	if (expectedRows.length !== actualRows.length) {
		issues.push(
			`Illustration row count changed from ${expectedRows.length} to ${actualRows.length}.`
		);
	}
	for (const [id, expected] of expectedById) {
		const actual = actualById.get(id);
		if (!actual) {
			issues.push(`Illustration row ${id} is missing.`);
			continue;
		}
		const columns = new Set([...Object.keys(expected), ...Object.keys(actual)]);
		for (const column of columns) {
			if (expected[column] !== actual[column]) {
				issues.push(`Illustration row ${id} changed protected value ${column}.`);
			}
		}
	}
	for (const id of actualById.keys()) {
		if (!expectedById.has(id)) issues.push(`Unexpected illustration row ${id} appeared.`);
	}
	return issues;
}

/** @param {unknown} raw @param {string} oldFingerprint @param {string} canonicalFingerprint */
function rebaseGenerationMetadataFingerprint(raw, oldFingerprint, canonicalFingerprint) {
	const metadata = JSON.parse(String(raw));
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		throw new Error('Published primary generation metadata must be a JSON object.');
	}
	if (metadata.sourceFingerprint !== oldFingerprint) {
		throw new Error(
			`Published primary metadata fingerprint is ${metadata.sourceFingerprint}, expected ${oldFingerprint}.`
		);
	}
	return JSON.stringify({ ...metadata, sourceFingerprint: canonicalFingerprint });
}

/** @param {Array<{sql: string, params: Array<any>}>} statements */
function validateStatementLimits(statements) {
	for (const [index, statement] of statements.entries()) {
		if (statement.params.length > 100) {
			throw new Error(`Statement ${index + 1} exceeds D1's 100-bound-parameter limit.`);
		}
		if (Buffer.byteLength(statement.sql, 'utf8') > 100_000) {
			throw new Error(`Statement ${index + 1} exceeds D1's 100 KB SQL limit.`);
		}
		for (const parameter of statement.params) {
			if (typeof parameter === 'string' && Buffer.byteLength(parameter, 'utf8') > 2_000_000) {
				throw new Error(`Statement ${index + 1} contains a parameter above D1's 2 MB limit.`);
			}
		}
	}
}

/** @param {unknown} value */
function isD1Parameter(value) {
	return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

/** @param {unknown} error */
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
