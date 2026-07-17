import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import {
	PAPER_SITTING_CONTENT_QUERIES,
	computePaperSittingContentFingerprint,
	loadPaperSittingContentSections
} from './paperSittingContentFingerprint.js';

function contentSections() {
	return {
		question_source_documents: [{ id: 'paper', file_hash: 'qp-hash' }],
		marking_source_documents: [{ id: 'mark-scheme', file_hash: 'ms-hash' }],
		questions: [{ id: 'q-1', prompt_text: 'Explain the effect.', marks: 2 }],
		rendering_overlays: [
			{ id: 'overlay-1', question_id: 'q-1', render_json: '{"prompt":"Explain the effect."}' }
		],
		question_assets: [{ id: 'asset-1', question_id: 'q-1', r2_key: 'papers/asset-1.webp' }],
		mark_scheme_items: [
			{ id: 'msi-1', question_id: 'q-1', text: 'Links cause to effect.', marks: 2 }
		],
		mark_checklist_items: [
			{ id: 'check-1', question_id: 'q-1', text: 'Explains the link.', required: 1 }
		],
		model_answers: [{ id: 'model-1', question_id: 'q-1', answer_text: 'Because…' }],
		response_answer_keys: [
			{ id: 'key-1', question_id: 'q-1', target_id: 'choice', correct_answer: 'B' }
		],
		question_answer_chains: [
			{ id: 'mapping-1', question_id: 'q-1', answer_chain_id: 'chain-1', is_primary: 1 }
		],
		answer_chains: [{ id: 'chain-1', canonical_chain_text: 'cause -> process -> effect' }],
		answer_chain_steps: [
			{ id: 'step-1', answer_chain_id: 'chain-1', display_order: 1, step_text: 'Cause' }
		]
	};
}

describe('paper-sitting approved-content fingerprint', () => {
	it('covers every live source, render, asset and grading input family', () => {
		expect(PAPER_SITTING_CONTENT_QUERIES.map(({ name }) => name)).toEqual([
			'question_source_documents',
			'marking_source_documents',
			'questions',
			'rendering_overlays',
			'question_assets',
			'mark_scheme_items',
			'mark_checklist_items',
			'model_answers',
			'response_answer_keys',
			'question_answer_chains',
			'answer_chains',
			'answer_chain_steps'
		]);
	});

	it('is stable across object-key, section and row ordering', async () => {
		const sections = contentSections();
		sections.questions.push({ id: 'q-2', prompt_text: 'Second', marks: 1 });
		const reordered = Object.fromEntries(
			Object.entries(sections)
				.reverse()
				.map(([name, rows]) => [
					name,
					[...rows].reverse().map((row) => Object.fromEntries(Object.entries(row).reverse()))
				])
		);

		expect(await computePaperSittingContentFingerprint(reordered)).toBe(
			await computePaperSittingContentFingerprint(sections)
		);
	});

	it('changes when render or grading content is updated', async () => {
		const approved = contentSections();
		const approvedFingerprint = await computePaperSittingContentFingerprint(approved);
		const gradingChanged = structuredClone(approved);
		gradingChanged.mark_scheme_items[0].text = 'A different marking rule.';
		const renderChanged = structuredClone(approved);
		renderChanged.rendering_overlays[0].render_json = '{"prompt":"A changed prompt."}';

		expect(await computePaperSittingContentFingerprint(gradingChanged)).not.toBe(
			approvedFingerprint
		);
		expect(await computePaperSittingContentFingerprint(renderChanged)).not.toBe(
			approvedFingerprint
		);
	});

	it('changes when an approved asset or deterministic answer key is deleted', async () => {
		const approved = contentSections();
		const approvedFingerprint = await computePaperSittingContentFingerprint(approved);
		const assetDeleted = structuredClone(approved);
		assetDeleted.question_assets = [];
		const answerKeyDeleted = structuredClone(approved);
		answerKeyDeleted.response_answer_keys = [];

		expect(await computePaperSittingContentFingerprint(assetDeleted)).not.toBe(approvedFingerprint);
		expect(await computePaperSittingContentFingerprint(answerKeyDeleted)).not.toBe(
			approvedFingerprint
		);
	});

	it('loads every shared query against the exact source document id', async () => {
		const query = vi.fn(async (...queryArgs: [string, Array<string | number | null>]) => {
			void queryArgs;
			return [] as Array<Record<string, unknown>>;
		});
		await loadPaperSittingContentSections({ sourceDocumentId: 'paper-1', query });

		expect(query).toHaveBeenCalledTimes(PAPER_SITTING_CONTENT_QUERIES.length);
		expect(query.mock.calls.every(([, params]) => params[0] === 'paper-1')).toBe(true);
	});

	it('keeps every shared fingerprint query valid against the public-content schema', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(
			readFileSync(new URL('../../../migrations/0001_public_content.sql', import.meta.url), 'utf8')
		);
		for (const { sql } of PAPER_SITTING_CONTENT_QUERIES) {
			expect(() => db.prepare(sql).all('paper-1')).not.toThrow();
		}
		db.close();
	});

	it('withdraws legacy approvals when the fingerprint column is introduced', () => {
		const db = new DatabaseSync(':memory:');
		db.exec('PRAGMA foreign_keys = ON; CREATE TABLE source_documents (id TEXT PRIMARY KEY);');
		db.exec(
			readFileSync(
				new URL('../../../migrations/0022_question_paper_sitting_reviews.sql', import.meta.url),
				'utf8'
			)
		);
		db.prepare('INSERT INTO source_documents (id) VALUES (?)').run('paper-1');
		db.exec(`
			INSERT INTO question_paper_sitting_reviews (
				source_document_id, scope, overlay_version, expected_question_count,
				expected_total_marks, duration_minutes, question_refs_json,
				solvability_report_json, status, reviewed_by, reviewed_at
			) VALUES (
				'paper-1', 'complete_official_paper', 'v1', 1, 1, 60,
				'["01.1"]', '{}', 'approved', 'reviewer', '2026-07-16T10:00:00.000Z'
			)
		`);
		db.exec(
			readFileSync(
				new URL('../../../migrations/0028_paper_sitting_content_fingerprint.sql', import.meta.url),
				'utf8'
			)
		);

		expect(
			db
				.prepare('SELECT status, approved_content_fingerprint FROM question_paper_sitting_reviews')
				.get()
		).toEqual({ status: 'withdrawn', approved_content_fingerprint: null });
		db.close();
	});
});
