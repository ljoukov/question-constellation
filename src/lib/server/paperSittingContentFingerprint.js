export const PAPER_SITTING_CONTENT_FINGERPRINT_VERSION = 'paper-sitting-content-v1';

// These sections cover every live input used to render or grade an approved
// paper, plus its source identity. Keep the query set shared by runtime and the
// approval scripts so a newly approved fingerprint cannot drift by construction.
export const PAPER_SITTING_CONTENT_QUERIES = [
	{
		name: 'question_source_documents',
		sql: `SELECT sd.*
		      FROM source_documents sd
		     WHERE sd.id = ?
		     ORDER BY sd.id`
	},
	{
		name: 'marking_source_documents',
		sql: `SELECT DISTINCT sd.*
		      FROM questions q
		      JOIN mark_scheme_items msi ON msi.question_id = q.id
		      JOIN source_documents sd ON sd.id = msi.source_document_id
		     WHERE q.source_document_id = ?
		     ORDER BY sd.id`
	},
	{
		name: 'questions',
		sql: `SELECT q.*
		      FROM questions q
		     WHERE q.source_document_id = ?
		     ORDER BY q.display_order, q.source_question_ref, q.id`
	},
	{
		name: 'rendering_overlays',
		sql: `SELECT qro.*
		      FROM question_rendering_overlays qro
		      JOIN questions q ON q.id = qro.question_id
		     WHERE q.source_document_id = ?
		     ORDER BY qro.question_id, qro.overlay_version, qro.id`
	},
	{
		name: 'question_assets',
		sql: `SELECT qa.*
		      FROM question_assets qa
		      JOIN questions q ON q.id = qa.question_id
		     WHERE q.source_document_id = ?
		     ORDER BY qa.question_id, qa.id`
	},
	{
		name: 'mark_scheme_items',
		sql: `SELECT msi.*
		      FROM mark_scheme_items msi
		      JOIN questions q ON q.id = msi.question_id
		     WHERE q.source_document_id = ?
		     ORDER BY msi.question_id, msi.display_order, msi.id`
	},
	{
		name: 'mark_checklist_items',
		sql: `SELECT mci.*
		      FROM mark_checklist_items mci
		      JOIN questions q ON q.id = mci.question_id
		     WHERE q.source_document_id = ?
		     ORDER BY mci.question_id, mci.display_order, mci.id`
	},
	{
		name: 'model_answers',
		sql: `SELECT ma.*
		      FROM model_answers ma
		      JOIN questions q ON q.id = ma.question_id
		     WHERE q.source_document_id = ?
		     ORDER BY ma.question_id, ma.id`
	},
	{
		name: 'response_answer_keys',
		sql: `SELECT rak.*
		      FROM question_response_answer_keys rak
		      JOIN questions q ON q.id = rak.question_id
		     WHERE q.source_document_id = ?
		     ORDER BY rak.question_id, rak.response_kind, rak.display_order, rak.target_id, rak.id`
	},
	{
		name: 'question_answer_chains',
		sql: `SELECT qac.*
		      FROM question_answer_chains qac
		      JOIN questions q ON q.id = qac.question_id
		     WHERE q.source_document_id = ?
		     ORDER BY qac.question_id, qac.is_primary DESC, qac.display_order, qac.id`
	},
	{
		name: 'answer_chains',
		sql: `SELECT DISTINCT ac.*
		      FROM answer_chains ac
		      JOIN question_answer_chains qac ON qac.answer_chain_id = ac.id
		      JOIN questions q ON q.id = qac.question_id
		     WHERE q.source_document_id = ?
		     ORDER BY ac.id`
	},
	{
		name: 'answer_chain_steps',
		sql: `SELECT DISTINCT acs.*
		      FROM answer_chain_steps acs
		      JOIN question_answer_chains qac ON qac.answer_chain_id = acs.answer_chain_id
		      JOIN questions q ON q.id = qac.question_id
		     WHERE q.source_document_id = ?
		     ORDER BY acs.answer_chain_id, acs.display_order, acs.id`
	}
];

/** @param {unknown} value @returns {unknown} */
function canonicalValue(value) {
	if (Array.isArray(value)) return value.map(canonicalValue);
	if (value && typeof value === 'object') {
		const record = /** @type {Record<string, unknown>} */ (value);
		return Object.fromEntries(
			Object.keys(record)
				.sort()
				.map((key) => [key, canonicalValue(record[key])])
		);
	}
	if (typeof value === 'number' && Object.is(value, -0)) return 0;
	return value;
}

/** @param {unknown} value @returns {string} */
function canonicalJson(value) {
	return JSON.stringify(canonicalValue(value)) ?? 'undefined';
}

/**
 * @param {{sourceDocumentId: string, query: (sql: string, params: Array<string | number | null>) => Promise<Record<string, unknown>[]>}} input
 */
export async function loadPaperSittingContentSections({ sourceDocumentId, query }) {
	const entries = await Promise.all(
		PAPER_SITTING_CONTENT_QUERIES.map(async ({ name, sql }) => [
			name,
			await query(sql, [sourceDocumentId])
		])
	);
	return Object.fromEntries(entries);
}

/** @param {Record<string, Array<Record<string, unknown>>>} sections */
export async function computePaperSittingContentFingerprint(sections) {
	const canonicalSections = Object.fromEntries(
		Object.keys(sections)
			.sort()
			.map((name) => [
				name,
				(sections[name] ?? [])
					.map(canonicalValue)
					.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)))
			])
	);
	const payload = canonicalJson({
		version: PAPER_SITTING_CONTENT_FINGERPRINT_VERSION,
		sections: canonicalSections
	});
	const digest = await globalThis.crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(payload)
	);
	const hex = [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
	return `${PAPER_SITTING_CONTENT_FINGERPRINT_VERSION}:${hex}`;
}

/**
 * @param {{sourceDocumentId: string, query: (sql: string, params: Array<string | number | null>) => Promise<Record<string, unknown>[]>}} input
 */
export async function fingerprintPaperSittingContent(input) {
	return computePaperSittingContentFingerprint(await loadPaperSittingContentSections(input));
}
