import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';

const migration = readFileSync(
	path.resolve('migrations/0027_invalidate_stale_chain_illustrations.sql'),
	'utf8'
);

let db: DatabaseSync;

beforeEach(() => {
	db = new DatabaseSync(':memory:');
	db.exec(`
		CREATE TABLE answer_chains (id TEXT PRIMARY KEY, title TEXT);
		CREATE TABLE questions (id TEXT PRIMARY KEY, prompt_text TEXT);
		CREATE TABLE answer_chain_steps (
			id TEXT PRIMARY KEY, answer_chain_id TEXT NOT NULL, step_text TEXT
		);
		CREATE TABLE question_answer_chains (
			id TEXT PRIMARY KEY, question_id TEXT NOT NULL, answer_chain_id TEXT NOT NULL,
			fit_confidence REAL
		);
		CREATE TABLE question_rendering_overlays (
			id TEXT PRIMARY KEY, question_id TEXT NOT NULL, needs_human_review INTEGER NOT NULL
		);
		CREATE TABLE mark_scheme_items (
			id TEXT PRIMARY KEY, question_id TEXT NOT NULL, text TEXT
		);
		CREATE TABLE mark_checklist_items (
			id TEXT PRIMARY KEY, question_id TEXT NOT NULL, text TEXT
		);
		CREATE TABLE model_answers (
			id TEXT PRIMARY KEY, question_id TEXT NOT NULL, answer_text TEXT
		);
		CREATE TABLE answer_chain_illustrations (
			id TEXT PRIMARY KEY, answer_chain_id TEXT NOT NULL, is_primary INTEGER NOT NULL,
			status TEXT NOT NULL, updated_at TEXT
		);
		INSERT INTO answer_chains VALUES ('chain-1', 'Chain');
		INSERT INTO questions VALUES ('question-1', 'Prompt');
		INSERT INTO answer_chain_steps VALUES ('step-1', 'chain-1', 'Step');
		INSERT INTO question_answer_chains VALUES ('mapping-1', 'question-1', 'chain-1', 1);
		INSERT INTO question_rendering_overlays VALUES ('overlay-1', 'question-1', 0);
		INSERT INTO mark_scheme_items VALUES ('mark-1', 'question-1', 'Mark');
		INSERT INTO mark_checklist_items VALUES ('check-1', 'question-1', 'Check');
		INSERT INTO model_answers VALUES ('model-1', 'question-1', 'Answer');
		INSERT INTO answer_chain_illustrations
		VALUES ('illustration-1', 'chain-1', 1, 'published', CURRENT_TIMESTAMP);
	`);
});

describe('migration 0027 illustration freshness invalidation', () => {
	it('retires every pre-trigger published illustration and installs every fail-closed guard', () => {
		db.exec(migration);

		expect(currentIllustration()).toEqual({ is_primary: 0, status: 'draft' });
		expect(
			db
				.prepare(
					`SELECT COUNT(*) AS count FROM sqlite_master
				      WHERE type = 'trigger' AND name LIKE 'answer_chain_illustrations_stale_on_%'`
				)
				.get()
		).toEqual({ count: 21 });
	});

	it.each([
		['chain content', "UPDATE answer_chains SET title = 'Changed' WHERE id = 'chain-1'"],
		['chain steps', "UPDATE answer_chain_steps SET step_text = 'Changed' WHERE id = 'step-1'"],
		['chain mappings', 'UPDATE question_answer_chains SET fit_confidence = 0.9'],
		['question content', "UPDATE questions SET prompt_text = 'Changed' WHERE id = 'question-1'"],
		[
			'overlay insertion',
			"INSERT INTO question_rendering_overlays VALUES ('overlay-2', 'question-1', 0)"
		],
		[
			'overlay review-state update',
			"UPDATE question_rendering_overlays SET needs_human_review = 1 WHERE id = 'overlay-1'"
		],
		['overlay deletion', "DELETE FROM question_rendering_overlays WHERE id = 'overlay-1'"],
		['mark-scheme evidence', "UPDATE mark_scheme_items SET text = 'Changed' WHERE id = 'mark-1'"],
		['checklist evidence', "UPDATE mark_checklist_items SET text = 'Changed' WHERE id = 'check-1'"],
		[
			'model-answer evidence',
			"UPDATE model_answers SET answer_text = 'Changed' WHERE id = 'model-1'"
		]
	])('retires a fresh primary after %s changes', (_label, sql) => {
		db.exec(migration);
		republish();

		db.exec(sql);

		expect(currentIllustration()).toEqual({ is_primary: 0, status: 'draft' });
	});
});

function republish() {
	db.exec(
		"UPDATE answer_chain_illustrations SET is_primary = 1, status = 'published' WHERE id = 'illustration-1'"
	);
}

function currentIllustration() {
	return db
		.prepare(
			"SELECT is_primary, status FROM answer_chain_illustrations WHERE id = 'illustration-1'"
		)
		.get();
}
