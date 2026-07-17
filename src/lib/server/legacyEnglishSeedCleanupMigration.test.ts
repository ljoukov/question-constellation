import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';

const migration0024 = readFileSync(
	path.resolve('migrations/0024_remove_superseded_english_guided_seed.sql'),
	'utf8'
);
const migration0025 = readFileSync(
	path.resolve('migrations/0025_canonicalize_reviewed_english_source_metadata.sql'),
	'utf8'
);

let db: DatabaseSync;

beforeEach(() => {
	db = createBaseDatabase();
	seedLegacyGraph();
});

describe('migration 0024 superseded English guided seed cleanup', () => {
	it('removes the exact unsupported legacy graph without requiring a replacement', () => {
		expect(() => applyMigrationAtomically()).not.toThrow();

		expect(count('questions', "id = 'english-lit-romeo-juliet-fate-guided'")).toBe(0);
		expect(count('answer_chains', "id = 'english-chain-romeo-juliet-fate'")).toBe(0);
		expect(
			count('public_route_payloads', "payload_json LIKE '%english-chain-romeo-juliet-fate%'")
		).toBe(0);
		expect(
			count('sqlite_master', "type = 'table' AND name = '_migration_0024_release_guard'")
		).toBe(0);
	});

	it('does not relabel or mutate an incomplete current-cohort replacement', () => {
		seedOfficialReplacement({ completeEvidence: false });
		expect(() => applyMigrationAtomically()).not.toThrow();
		expect(count('questions', "id = 'english-lit-romeo-juliet-fate-guided'")).toBe(0);
		expect(count('questions', "id = 'ocr-j352-02-jun24-04-0'")).toBe(1);
	});

	it('is an idempotent no-op on a clean content schema', () => {
		db = createBaseDatabase();

		expect(() => applyMigrationAtomically(migration0024)).not.toThrow();
		expect(() => applyMigrationAtomically(migration0025)).not.toThrow();
		expect(count('questions', '1 = 1')).toBe(0);
		expect(count('source_documents', '1 = 1')).toBe(0);
	});

	it('removes only the exact legacy graph after every official proof is present', () => {
		seedOfficialReplacement({ completeEvidence: true });
		seedUnrelatedPublishedQuestion();
		expect(() => applyMigrationAtomically()).not.toThrow();

		for (const [table, predicate] of [
			['questions', "id = 'english-lit-romeo-juliet-fate-guided'"],
			['source_documents', "id = 'ocr-j352-02-jun24-romeo-juliet-fate'"],
			['answer_chains', "id = 'english-chain-romeo-juliet-fate'"],
			['constellations', "id = 'english-constellation-romeo-juliet-fate'"],
			['content_imports', "id = 'english-guided-romeo-juliet-fate-seed-v1'"],
			['public_route_payloads', "payload_json LIKE '%english-chain-romeo-juliet-fate%'"],
			['common_weak_answers', "question_id = 'english-lit-romeo-juliet-fate-guided'"]
		] as const) {
			expect(count(table, predicate), `${table} should have no legacy row`).toBe(0);
		}
		expect(count('questions', "id IN ('ocr-j352-02-jun24-04-0', 'unrelated-question')")).toBe(2);
		expect(
			db
				.prepare(
					`SELECT question_count, source FROM question_board_availability
					  WHERE qualification = 'GCSE' AND subject = 'English Literature' AND board = 'OCR'`
				)
				.get()
		).toEqual({ question_count: 2, source: 'migration-0024-live-count' });
	});
});

describe('migration 0025 reviewed English source metadata canonicalization', () => {
	it('refuses until migration 0024 has removed the seed, then updates reviewed rows', () => {
		seedReviewedJune2023Poetry();
		expect(() => applyMigrationAtomically(migration0025)).toThrow(/CHECK constraint failed/);
		expect(june2023SourceStatuses()).toEqual([
			'self_contained',
			'self_contained',
			'self_contained'
		]);

		expect(() => applyMigrationAtomically(migration0024)).not.toThrow();
		expect(() => applyMigrationAtomically(migration0025)).not.toThrow();
		expect(june2023SourceStatuses()).toEqual([
			'source_complete',
			'source_complete',
			'source_complete'
		]);
	});

	it('succeeds only for the exact reviewed paper hash and all six exact source assets', () => {
		seedOfficialReplacement({ completeEvidence: true });
		applyMigrationAtomically(migration0024);
		seedReviewedJune2023Poetry();

		db.exec(`
			UPDATE source_documents
			   SET file_hash = 'wrong-hash'
			 WHERE id = 'ocr-j352-02-qp-jun23'
		`);
		expect(() => applyMigrationAtomically(migration0025)).toThrow(/CHECK constraint failed/);
		expect(june2023SourceStatuses()).toEqual([
			'self_contained',
			'self_contained',
			'self_contained'
		]);

		db.exec(`
			UPDATE source_documents
			   SET file_hash = 'fac1175b0c234520f9cc9ea715fa86db3ac8f2072d396823dee13fe0b758a8ae'
			 WHERE id = 'ocr-j352-02-qp-jun23';
			DELETE FROM question_assets
			 WHERE id = 'ocr-j352-02-jun23-03-1a-asset-question-3-printed-poems-page-9';
		`);
		expect(() => applyMigrationAtomically(migration0025)).toThrow(/CHECK constraint failed/);
		expect(count('question_assets', "question_id LIKE 'ocr-j352-02-jun23-%'")).toBe(5);
		expect(count('sqlite_master', "type = 'table' AND name LIKE '_migration_0025_%'")).toBe(0);
		expect(june2023SourceStatuses()).toEqual([
			'self_contained',
			'self_contained',
			'self_contained'
		]);

		seedJune2023PoetryAsset(
			'ocr-j352-02-jun23-03-1a-asset-question-3-printed-poems-page-9',
			'ocr-j352-02-jun23-03-1a',
			'Question 3 printed poems page 9',
			9
		);
		expect(() => applyMigrationAtomically(migration0025)).not.toThrow();

		const rows = db
			.prepare(
				`
				SELECT q.id,
				       json_extract(q.self_containment_json, '$.status') AS status,
				       json_extract(q.self_containment_json, '$.requires_assets') AS requires_assets,
				       json_extract(q.self_containment_json, '$.required_source_count') AS source_count,
				       json_extract(q.self_containment_json, '$.complete_source_bundle') AS complete_bundle,
				       json_array_length(q.self_containment_json, '$.required_asset_labels') AS label_count,
				       COUNT(qa.id) AS asset_count
				  FROM questions q
				  JOIN question_assets qa ON qa.question_id = q.id
				 WHERE q.id IN (
				   'ocr-j352-02-jun23-01-1a',
				   'ocr-j352-02-jun23-02-1a',
				   'ocr-j352-02-jun23-03-1a'
				 )
				 GROUP BY q.id
				 ORDER BY q.id
			`
			)
			.all();
		expect(rows).toEqual([
			{
				id: 'ocr-j352-02-jun23-01-1a',
				status: 'source_complete',
				requires_assets: 1,
				source_count: 2,
				complete_bundle: 0,
				label_count: 2,
				asset_count: 2
			},
			{
				id: 'ocr-j352-02-jun23-02-1a',
				status: 'source_complete',
				requires_assets: 1,
				source_count: 2,
				complete_bundle: 0,
				label_count: 2,
				asset_count: 2
			},
			{
				id: 'ocr-j352-02-jun23-03-1a',
				status: 'source_complete',
				requires_assets: 1,
				source_count: 2,
				complete_bundle: 0,
				label_count: 2,
				asset_count: 2
			}
		]);
	});
});

function applyMigrationAtomically(sql = migration0024) {
	db.exec('BEGIN IMMEDIATE');
	try {
		db.exec(sql);
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}

function createBaseDatabase() {
	const database = new DatabaseSync(':memory:');
	database.exec(readFileSync(path.resolve('migrations/0001_public_content.sql'), 'utf8'));
	database.exec(readFileSync(path.resolve('migrations/0005_public_route_payloads.sql'), 'utf8'));
	database.exec(
		readFileSync(path.resolve('migrations/0008_question_board_availability.sql'), 'utf8')
	);
	return database;
}

function seedLegacyGraph() {
	db.exec(`
		INSERT INTO content_imports (id, source)
		VALUES ('english-guided-romeo-juliet-fate-seed-v1', 'manual-seed');
		INSERT INTO source_documents (id, doc_type, board, qualification, subject_area)
		VALUES (
			'ocr-j352-02-jun24-romeo-juliet-fate', 'question_paper', 'OCR', 'GCSE',
			'English Literature'
		);
		INSERT INTO questions (
			id, source_document_id, source_question_ref, slug, display_order, prompt_text,
			board, qualification, subject_area, status, needs_human_review
		) VALUES (
			'english-lit-romeo-juliet-fate-guided',
			'ocr-j352-02-jun24-romeo-juliet-fate', '4*',
			'english-lit-romeo-juliet-fate-guided', 1, 'How does Shakespeare present fate?',
			'OCR', 'GCSE', 'English Literature', 'published', 0
		);
		INSERT INTO answer_chains (
			id, slug, title, canonical_chain_text, status, needs_human_review
		) VALUES (
			'english-chain-romeo-juliet-fate', 'english-chain-romeo-juliet-fate',
			'Fate in Romeo and Juliet', 'claim -> evidence -> analysis', 'published', 0
		);
		INSERT INTO question_answer_chains (
			id, question_id, answer_chain_id, is_primary, needs_human_review
		) VALUES (
			'legacy-membership', 'english-lit-romeo-juliet-fate-guided',
			'english-chain-romeo-juliet-fate', 1, 0
		);
		INSERT INTO constellations (
			id, slug, title, answer_chain_id, status, needs_human_review
		) VALUES (
			'english-constellation-romeo-juliet-fate',
			'english-constellation-romeo-juliet-fate', 'Romeo and Juliet fate',
			'english-chain-romeo-juliet-fate', 'published', 0
		);
		INSERT INTO constellation_questions (
			id, constellation_id, question_id, display_order
		) VALUES (
			'legacy-constellation-question', 'english-constellation-romeo-juliet-fate',
			'english-lit-romeo-juliet-fate-guided', 1
		);
		INSERT INTO common_weak_answers (
			id, question_id, answer_chain_id, weak_answer_text
		) VALUES (
			'legacy-weak-answer', 'english-lit-romeo-juliet-fate-guided',
			'english-chain-romeo-juliet-fate', 'They are fated.'
		);
		INSERT INTO public_route_payloads (id, route_kind, route_path, payload_json)
		VALUES (
			'legacy-payload', 'question',
			'/questions/english-lit-romeo-juliet-fate-guided',
			'{"questionId":"english-lit-romeo-juliet-fate-guided","chainId":"english-chain-romeo-juliet-fate"}'
		);
	`);
}

function seedOfficialReplacement({ completeEvidence }: { completeEvidence: boolean }) {
	db.exec(`
		INSERT INTO content_imports (id, source, metadata_json)
		VALUES (
			'current-j352-02-import',
			'tmp/current-model-paper-cohort/retry-runs/ocr-j352-02-qp-jun24/import-ready',
			'{"vision_extracted":true,"source_document_ids":["ocr-j352-02-qp-jun24"]}'
		);
		INSERT INTO source_documents (
			id, doc_type, board, qualification, subject_area, component_code, year, file_hash
		) VALUES (
			'ocr-j352-02-qp-jun24', 'question_paper', 'OCR', 'GCSE', 'English Literature',
			'J352/02', 2024,
			'c0f3be806bddf97e106ac6a1c3ff57e676871c83a68a086eaad97cf0f2017574'
		);
		INSERT INTO questions (
			id, source_document_id, source_question_ref, slug, display_order, prompt_text,
			marks, board, qualification, subject_area, component_code, year,
			self_containment_json, status, needs_human_review
		) VALUES (
			'ocr-j352-02-jun24-04-0', 'ocr-j352-02-qp-jun24', '04.0',
			'ocr-j352-02-jun24-04-0', 4, 'How does Shakespeare present fate?',
			40, 'OCR', 'GCSE', 'English Literature', 'J352/02', 2024,
			'{"status":"source_complete","requires_assets":true,"required_source_count":1,"required_asset_labels":["Question 4 printed extract"]}',
			'published', 0
		);
	`);
	if (completeEvidence) seedOfficialEvidence();
}

function seedOfficialEvidence() {
	db.exec(`
		INSERT INTO question_rendering_overlays (
			id, question_id, source_document_id, source_question_ref, provenance,
			confidence, needs_human_review, render_json
		) VALUES (
			'official-overlay', 'ocr-j352-02-jun24-04-0', 'ocr-j352-02-qp-jun24', '04.0',
			'vision', 0.95, 0, '{"blocks":[]}'
		);
		INSERT INTO question_assets (
			id, question_id, asset_type, required, role, r2_key, public_path,
			needs_human_review
		) VALUES (
			'official-source-page', 'ocr-j352-02-jun24-04-0', 'image', 1, 'source-page',
			'papers/ocr-j352-02/q04.webp', '/assets/papers/ocr-j352-02/q04.webp', 0
		);
		INSERT INTO mark_scheme_items (
			id, question_id, display_order, item_type, text
		) VALUES ('official-mark', 'ocr-j352-02-jun24-04-0', 1, 'level', 'Relevant response.');
		INSERT INTO mark_checklist_items (id, question_id, display_order, text)
		VALUES ('official-check', 'ocr-j352-02-jun24-04-0', 1, 'Analyse language.');
		INSERT INTO model_answers (id, question_id, answer_text, derivation, needs_human_review)
		VALUES (
			'official-model', 'ocr-j352-02-jun24-04-0', 'A reviewed model answer.',
			'mark-scheme-grounded', 0
		);
		INSERT INTO answer_chains (
			id, slug, title, canonical_chain_text, status, needs_human_review
		) VALUES (
			'official-j352-02-q04-chain', 'official-j352-02-q04-chain',
			'Official J352/02 Q04 chain', 'claim -> quotation -> analysis', 'published', 0
		);
		INSERT INTO answer_chain_steps (
			id, answer_chain_id, display_order, step_text, step_role
		) VALUES
			('official-step-1', 'official-j352-02-q04-chain', 1, 'Make a precise claim.', 'claim'),
			('official-step-2', 'official-j352-02-q04-chain', 2, 'Analyse exact evidence.', 'analysis');
		INSERT INTO question_answer_chains (
			id, question_id, answer_chain_id, is_primary, needs_human_review
		) VALUES (
			'official-membership', 'ocr-j352-02-jun24-04-0',
			'official-j352-02-q04-chain', 1, 0
		);
	`);
}

function seedUnrelatedPublishedQuestion() {
	db.exec(`
		INSERT INTO source_documents (id, doc_type)
		VALUES ('unrelated-source', 'question_paper');
		INSERT INTO questions (
			id, source_document_id, source_question_ref, slug, display_order, prompt_text,
			board, qualification, subject_area, status, needs_human_review
		) VALUES (
			'unrelated-question', 'unrelated-source', '01.0', 'unrelated-question', 1,
			'An unrelated question.', 'OCR', 'GCSE', 'English Literature', 'published', 0
		);
	`);
}

function seedReviewedJune2023Poetry() {
	db.exec(`
		INSERT INTO source_documents (
			id, doc_type, board, qualification, subject_area, component_code, year, file_hash
		) VALUES (
			'ocr-j352-02-qp-jun23', 'question_paper', 'OCR', 'GCSE', 'English Literature',
			'J352/02', 2023,
			'fac1175b0c234520f9cc9ea715fa86db3ac8f2072d396823dee13fe0b758a8ae'
		);
	`);

	for (const [questionNumber, pageA, pageB] of [
		[1, 4, 5],
		[2, 6, 7],
		[3, 8, 9]
	] as const) {
		const questionId = `ocr-j352-02-jun23-0${questionNumber}-1a`;
		const firstLabel = `Question ${questionNumber} printed poems page ${pageA}`;
		const secondLabel = `Question ${questionNumber} printed poems page ${pageB}`;
		db.prepare(
			`
			INSERT INTO questions (
				id, source_document_id, source_question_ref, slug, display_order, prompt_text,
				marks, board, qualification, subject_area, component_code, year,
				self_containment_json, status, needs_human_review
			) VALUES (?, 'ocr-j352-02-qp-jun23', ?, ?, ?, ?, 20, 'OCR', 'GCSE',
			          'English Literature', 'J352/02', 2023, ?, 'published', 0)
		`
		).run(
			questionId,
			`0${questionNumber}.1a`,
			questionId,
			questionNumber,
			`Compare the printed poems for question ${questionNumber}.`,
			JSON.stringify({
				status: 'self_contained',
				requires_assets: true,
				required_source_count: 2,
				complete_source_bundle: false,
				required_asset_labels: [firstLabel, secondLabel]
			})
		);
		seedJune2023PoetryAsset(
			`${questionId}-asset-question-${questionNumber}-printed-poems-page-${pageA}`,
			questionId,
			firstLabel,
			pageA
		);
		seedJune2023PoetryAsset(
			`${questionId}-asset-question-${questionNumber}-printed-poems-page-${pageB}`,
			questionId,
			secondLabel,
			pageB
		);
	}
}

function seedJune2023PoetryAsset(
	assetId: string,
	questionId: string,
	sourceLabel: string,
	page: number
) {
	db.prepare(
		`
		INSERT INTO question_assets (
			id, question_id, asset_type, source_label, required, role, page_number,
			r2_key, public_path, needs_human_review
		) VALUES (?, ?, 'image', ?, 1, 'source-page', ?, ?, ?, 0)
	`
	).run(
		assetId,
		questionId,
		sourceLabel,
		page,
		`images/papers/ocr-j352-02-qp-jun23/page-${String(page).padStart(2, '0')}.png`,
		`/images/papers/ocr-j352-02-qp-jun23/page-${String(page).padStart(2, '0')}.png`
	);
}

function june2023SourceStatuses(): string[] {
	return db
		.prepare(
			`
			SELECT json_extract(self_containment_json, '$.status') AS status
			  FROM questions
			 WHERE id IN (
			   'ocr-j352-02-jun23-01-1a',
			   'ocr-j352-02-jun23-02-1a',
			   'ocr-j352-02-jun23-03-1a'
			 )
			 ORDER BY id
		`
		)
		.all()
		.map((row) => String((row as { status: unknown }).status));
}

function count(table: string, predicate = '1 = 1') {
	const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${predicate}`).get() as {
		count: number;
	};
	return Number(row.count);
}
