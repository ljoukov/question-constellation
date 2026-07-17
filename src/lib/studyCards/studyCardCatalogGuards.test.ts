import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';

let db: DatabaseSync;

beforeEach(() => {
	db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON');
	db.exec(`
		CREATE TABLE curriculum_specifications (
			id TEXT PRIMARY KEY,
			board TEXT NOT NULL,
			qualification TEXT NOT NULL
		);
		CREATE TABLE curriculum_components (
			id TEXT PRIMARY KEY,
			specification_id TEXT NOT NULL REFERENCES curriculum_specifications(id),
			parent_id TEXT REFERENCES curriculum_components(id),
			selectable INTEGER NOT NULL
		);
		CREATE TABLE curriculum_offerings (
			id TEXT PRIMARY KEY,
			board TEXT NOT NULL,
			qualification TEXT NOT NULL,
			profile_subject TEXT NOT NULL,
			specification_id TEXT NOT NULL REFERENCES curriculum_specifications(id),
			root_component_id TEXT REFERENCES curriculum_components(id),
			selectable_component_ids_json TEXT NOT NULL,
			enabled INTEGER NOT NULL
		);
	`);
	db.exec(readFileSync(path.resolve('migrations/0021_study_card_catalog.sql'), 'utf8'));
	db.exec(`
		INSERT INTO curriculum_specifications VALUES ('spec', 'OCR', 'GCSE');
		INSERT INTO curriculum_components VALUES ('root', 'spec', NULL, 0);
		INSERT INTO curriculum_components VALUES ('topic', 'spec', 'root', 1);
		INSERT INTO curriculum_components VALUES ('component', 'spec', 'topic', 0);
		INSERT INTO curriculum_offerings VALUES (
			'offering', 'OCR', 'GCSE', 'English Literature', 'spec', 'root', '["topic"]', 1
		);
	`);
});

describe('study-card catalog publication guards', () => {
	it('rejects a direct published insert', () => {
		insertRelease('direct-release', 1, 1);
		expect(() => insertCard('direct', 'direct-release', 'published')).toThrow(/inserted as drafts/);
		expect(db.prepare(`SELECT COUNT(*) AS count FROM study_cards`).get()).toEqual({ count: 0 });
	});

	it('publishes and imports a complete release, then freezes every child', () => {
		insertCompleteRelease('complete-release', 1);

		expect(db.prepare(`SELECT status FROM study_cards WHERE id = 'card'`).get()).toEqual({
			status: 'published'
		});
		expect(
			db.prepare(`SELECT status FROM study_card_releases WHERE id = 'complete-release'`).get()
		).toEqual({ status: 'imported' });

		for (const sql of [
			`UPDATE study_card_choices SET feedback = 'Changed feedback' WHERE card_id = 'card'`,
			`DELETE FROM study_card_sources WHERE card_id = 'card'`,
			`UPDATE study_card_targets SET confidence = 0.5 WHERE card_id = 'card'`,
			`UPDATE study_deck_coverage SET card_count = 2 WHERE release_id = 'complete-release'`
		]) {
			expect(() => db.exec(sql)).toThrow(/immutable/);
		}
		expect(() =>
			db.exec(`UPDATE study_cards SET explanation = 'Changed' WHERE id = 'card'`)
		).toThrow(/use a new release/);
	});

	it('blocks publication when a reviewed target has no ready coverage row', () => {
		insertRelease('missing-coverage', 1, 1);
		insertCard('card', 'missing-coverage', 'draft');
		insertChildren('card');

		expect(() => db.exec(`UPDATE study_cards SET status = 'published' WHERE id = 'card'`)).toThrow(
			/lacks reviewed ready coverage/
		);
	});

	it('recounts target membership before a release can become imported', () => {
		insertRelease('count-drift', 1, 1);
		insertCard('card', 'count-drift', 'draft');
		insertChildren('card');
		insertCoverage('count-drift', 'ready', 2, null);
		db.exec(`UPDATE study_cards SET status = 'published' WHERE id = 'card'`);

		expect(() =>
			db.exec(`UPDATE study_card_releases SET status = 'imported' WHERE id = 'count-drift'`)
		).toThrow(/coverage count differs/);
	});

	it('allows a reviewed withheld row to make a zero-card scope explicit', () => {
		insertRelease('withheld-release', 0, 1);
		insertCoverage(
			'withheld-release',
			'withheld',
			0,
			'Primary-text rights and independent review are not complete.'
		);
		db.exec(`UPDATE study_card_releases SET status = 'imported' WHERE id = 'withheld-release'`);

		expect(
			db.prepare(`SELECT status FROM study_card_releases WHERE id = 'withheld-release'`).get()
		).toEqual({ status: 'imported' });
	});
});

function insertRelease(id: string, expectedCards: number, expectedCoverage: number) {
	db.prepare(
		`INSERT INTO study_card_releases (
			id, schema_version, prompt_version,
			generator_model, generator_thinking_level, generator_run_id,
			reviewer_model, reviewer_thinking_level, reviewer_run_id,
			reviewer_independent_turn, source_manifest_hash, artifact_hash, artifact_path,
			expected_card_count, expected_coverage_count, release_json,
			started_at, finished_at, status, import_owner
		 ) VALUES (?, 'standard-study-deck-v1', 'compiler-v1',
		           'gpt-5.6-sol', 'max', 'generator-run',
		           'gpt-5.6-sol', 'max', 'reviewer-run', 1, ?, ?, ?, ?, ?, '{}',
		           '2026-07-16T10:00:00.000Z', '2026-07-16T10:10:00.000Z',
		           'accepted', 'study-card-import/v1')`
	).run(
		id,
		'a'.repeat(64),
		'b'.repeat(64),
		`data/study-cards/releases/${id}/accepted-study-cards.json`,
		expectedCards,
		expectedCoverage
	);
}

function insertCard(id: string, releaseId: string, status: 'draft' | 'published') {
	db.prepare(
		`INSERT INTO study_cards (
			id, release_id, concept_key, board, qualification, subject, kind, emoji,
			front, back, explanation, memory_tip, content_revision, content_hash,
			source_fingerprint, provenance_json, status, needs_human_review, import_owner
		 ) VALUES (?, ?, ?, 'OCR', 'GCSE', 'English Literature', 'quotation', '🔥',
		           'Which quotation captures dangerous ambition?', '“Vaulting ambition”',
		           'Macbeth recognises the destructive force that motivates his choice.',
		           'Picture ambition vaulting out of control.', 1, ?, ?, '{}', ?, 0,
		           'study-card-import/v1')`
	).run(id, releaseId, `${id}-concept`, 'c'.repeat(64), 'a'.repeat(64), status);
}

function insertChildren(cardId: string) {
	const choices = [
		['correct', '“Vaulting ambition”', 1, 'This directly names Macbeth’s motivation.', null],
		[
			'fair',
			'“Fair is foul”',
			0,
			'This is the witches’ paradox.',
			'Confuses moral inversion with ambition.'
		],
		[
			'spot',
			'“Out, damned spot!”',
			0,
			'This expresses later guilt.',
			'Confuses guilt with motivation.'
		],
		[
			'brave',
			'“Brave Macbeth”',
			0,
			'This establishes his reputation.',
			'Confuses reputation with motivation.'
		]
	] as const;
	for (const [index, choice] of choices.entries()) {
		db.prepare(
			`INSERT INTO study_card_choices (
				id, card_id, display_order, choice_key, text, is_correct,
				feedback, misconception, import_owner
			 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'study-card-import/v1')`
		).run(`${cardId}:choice:${choice[0]}`, cardId, index, ...choice);
	}
	db.prepare(
		`INSERT INTO study_card_sources (
			id, card_id, source_kind, source_url, source_title, source_locator,
			source_excerpt, source_hash, rights_basis, supports_json, import_owner
		 ) VALUES (?, ?, 'primary-text', 'https://www.gutenberg.org/ebooks/1533',
		           'Macbeth', 'Act 1, Scene 7', 'only vaulting ambition', ?,
		           'Public-domain primary text.',
		           '["front","back","explanation","memoryTip"]', 'study-card-import/v1')`
	).run(`${cardId}:source:1`, cardId, 'd'.repeat(64));
	db.prepare(
		`INSERT INTO study_card_targets (
			card_id, offering_id, curriculum_component_id, topic_component_id,
			is_primary, confidence, reviewed, mapping_source, import_owner
		 ) VALUES (?, 'offering', 'component', 'topic', 1, 1, 1,
		           'standard-study-deck-v1', 'study-card-import/v1')`
	).run(cardId);
}

function insertCoverage(
	releaseId: string,
	status: 'ready' | 'withheld',
	cardCount: number,
	reason: string | null
) {
	db.prepare(
		`INSERT INTO study_deck_coverage (
			release_id, offering_id, topic_component_id, status, reason,
			card_count, reviewed, import_owner
		 ) VALUES (?, 'offering', 'topic', ?, ?, ?, 1, 'study-card-import/v1')`
	).run(releaseId, status, reason, cardCount);
}

function insertCompleteRelease(releaseId: string, coverageCount: number) {
	insertRelease(releaseId, 1, 1);
	insertCard('card', releaseId, 'draft');
	insertChildren('card');
	insertCoverage(releaseId, 'ready', coverageCount, null);
	db.exec(`
		UPDATE study_cards SET status = 'published' WHERE id = 'card';
		UPDATE study_card_releases SET status = 'imported' WHERE id = '${releaseId}';
	`);
}
