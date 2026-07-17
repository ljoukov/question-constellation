import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';

let db: DatabaseSync;

beforeEach(() => {
	db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON');
	db.exec(`
		CREATE TABLE curriculum_specifications (id TEXT PRIMARY KEY);
		CREATE TABLE curriculum_components (
			id TEXT PRIMARY KEY,
			specification_id TEXT NOT NULL REFERENCES curriculum_specifications(id)
		);
		CREATE TABLE curriculum_offerings (id TEXT PRIMARY KEY);
	`);
	db.exec(readFileSync(path.resolve('migrations/0018_recall_catalog.sql'), 'utf8'));
	db.exec(readFileSync(path.resolve('migrations/0019_recall_draft_first.sql'), 'utf8'));
	db.exec(readFileSync(path.resolve('migrations/0023_recall_three_or_four_choices.sql'), 'utf8'));
	db.exec(`
		INSERT INTO curriculum_specifications (id) VALUES ('spec');
		INSERT INTO curriculum_components (id, specification_id) VALUES ('component', 'spec');
		INSERT INTO curriculum_components (id, specification_id) VALUES ('topic', 'spec');
		INSERT INTO curriculum_offerings (id) VALUES ('offering');
		INSERT INTO recall_generation_runs (
			id, schema_version, prompt_version,
			generator_model, generator_thinking_level,
			reviewer_model, reviewer_thinking_level,
			cue_reviewer_model, cue_reviewer_thinking_level,
			source_fingerprint, artifact_hash, artifact_path, run_json,
			started_at, finished_at, status, import_owner
		) VALUES (
			'run', 'recall-card-bundle-v2', 'recall-card-compiler-v10',
			'gpt-5.6-sol', 'max', 'gpt-5.6-sol', 'max', 'gpt-5.6-sol', 'max',
			'${'a'.repeat(64)}', '${'b'.repeat(64)}', 'data/recall/generated/run/accepted-cards.json', '{}',
			'2026-07-15T10:00:00.000Z', '2026-07-15T10:01:00.000Z', 'accepted', 'recall-card-import/v1'
		);
	`);
});

describe('recall catalog draft-first guards', () => {
	it('rejects a direct published insert before completeness checks can be bypassed', () => {
		expect(() => insertCard('direct', 'published')).toThrow(/inserted as drafts/);
		expect(
			db.prepare(`SELECT COUNT(*) AS count FROM recall_cards WHERE id = 'direct'`).get()
		).toEqual({ count: 0 });
	});

	it('publishes a complete draft but rejects every published child mutation', () => {
		insertCompletePublishedCard();
		expect(db.prepare(`SELECT status FROM recall_cards WHERE id = 'card'`).get()).toEqual({
			status: 'published'
		});

		const mutations = [
			`INSERT INTO recall_card_choices
			 (id, card_id, display_order, choice_key, text, is_correct, feedback, misconception, import_owner)
			 VALUES ('choice-extra', 'card', 3, 'extra', 'Extra', 0, 'Feedback', 'Trap', 'recall-card-import/v1')`,
			`UPDATE recall_card_choices SET feedback = 'Changed' WHERE id = 'choice-1'`,
			`DELETE FROM recall_card_choices WHERE id = 'choice-1'`,
			`INSERT INTO recall_card_evidence
			 (id, card_id, source_kind, specification_id, curriculum_component_id,
			  source_page_start, source_page_end, source_excerpt, source_file_hash,
			  excerpt_hash, supports_json, import_owner)
			 VALUES ('evidence-extra', 'card', 'curriculum_component', 'spec', 'component',
			  1, 1, 'Excerpt', '${'c'.repeat(64)}', '${'d'.repeat(64)}', '["back"]', 'recall-card-import/v1')`,
			`UPDATE recall_card_evidence SET source_excerpt = 'Changed' WHERE card_id = 'card'`,
			`DELETE FROM recall_card_evidence WHERE card_id = 'card'`,
			`INSERT INTO recall_card_curriculum_targets
			 (card_id, offering_id, curriculum_component_id, topic_component_id,
			  is_primary, confidence, reviewed, mapping_source, import_owner)
			 VALUES ('card', 'offering', 'component', 'topic', 0, 1, 1, 'compiler', 'recall-card-import/v1')`,
			`UPDATE recall_card_curriculum_targets SET confidence = 0.5 WHERE card_id = 'card'`,
			`DELETE FROM recall_card_curriculum_targets WHERE card_id = 'card'`
		];
		for (const sql of mutations) expect(() => db.exec(sql)).toThrow(/immutable/);
		expect(() =>
			db.exec(`UPDATE recall_cards SET explanation = 'Changed' WHERE id = 'card'`)
		).toThrow(/must be retired before revision/);
	});

	it('publishes a complete three-choice draft after migration 0023', () => {
		insertCompletePublishedCard(3);
		expect(db.prepare(`SELECT status FROM recall_cards WHERE id = 'card'`).get()).toEqual({
			status: 'published'
		});
		expect(db.prepare(`SELECT COUNT(*) AS count FROM recall_card_choices`).get()).toEqual({
			count: 3
		});
	});

	it('rejects publication with fewer than three choices after migration 0023', () => {
		expect(() => insertCompletePublishedCard(2)).toThrow(/three or four choices/);
		expect(db.prepare(`SELECT status FROM recall_cards WHERE id = 'card'`).get()).toEqual({
			status: 'draft'
		});
	});
});

function insertCard(id: string, status: 'draft' | 'published') {
	db.prepare(
		`INSERT INTO recall_cards (
			id, concept_key, board, qualification, subject, kind, visual_cue,
			front, back, explanation, content_revision, content_hash, source_fingerprint,
			generation_run_id, provenance_json, status, needs_human_review, import_owner
		 ) VALUES (?, ?, 'AQA', 'GCSE', 'Biology', 'process', '💉', ?, ?, ?, 1, ?, ?, 'run', '{}', ?, 0, 'recall-card-import/v1')`
	).run(
		id,
		`${id}-concept`,
		'What response follows vaccination?',
		'White blood cells produce antibodies.',
		'The immune response is primed before infection.',
		'e'.repeat(64),
		'f'.repeat(64),
		status
	);
}

function insertCompletePublishedCard(choiceCount = 4) {
	insertCard('card', 'draft');
	for (let index = 0; index < choiceCount; index += 1) {
		db.prepare(
			`INSERT INTO recall_card_choices
			 (id, card_id, display_order, choice_key, text, is_correct, feedback, misconception, import_owner)
			 VALUES (?, 'card', ?, ?, ?, ?, ?, ?, 'recall-card-import/v1')`
		).run(
			`choice-${index + 1}`,
			index,
			`choice-${index + 1}`,
			index === 0 ? 'White blood cells produce antibodies.' : `Distractor ${index}`,
			index === 0 ? 1 : 0,
			index === 0 ? 'This is the specific immune response.' : `Feedback ${index}`,
			index === 0 ? null : `Misconception ${index}`
		);
	}
	db.exec(`
		INSERT INTO recall_card_evidence (
			id, card_id, source_kind, specification_id, curriculum_component_id,
			source_page_start, source_page_end, source_excerpt, source_file_hash,
			excerpt_hash, supports_json, import_owner
		) VALUES (
			'evidence', 'card', 'curriculum_component', 'spec', 'component', 1, 1,
			'Official excerpt', '${'a'.repeat(64)}', '${'b'.repeat(64)}',
			'["back","explanation","choices"]', 'recall-card-import/v1'
		);
		INSERT INTO recall_card_curriculum_targets (
			card_id, offering_id, curriculum_component_id, topic_component_id,
			is_primary, confidence, reviewed, mapping_source, import_owner
		) VALUES (
			'card', 'offering', 'component', 'topic', 1, 1, 1,
			'recall-card-compiler-v2', 'recall-card-import/v1'
		);
		UPDATE recall_cards SET status = 'published' WHERE id = 'card';
	`);
}
