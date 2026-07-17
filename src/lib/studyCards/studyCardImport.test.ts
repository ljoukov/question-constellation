import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import {
	hashStudyCardArtifact,
	validateStudyCardBundle
} from '../../../scripts/lib/study-card-artifact.mjs';
import {
	buildStudyCardImportStatements,
	planStudyCardImport
} from '../../../scripts/lib/study-card-import.mjs';
import {
	studyCardRuntimeCatalogParameters,
	studyCardRuntimeCatalogQuery
} from '../server/studyCardCatalogQuery';
import { studyCardArtifactFixture } from './studyCardTestFixtures';

describe('standard study-card D1 import plan', () => {
	it('orders an atomic draft-first release and binds every placeholder', () => {
		const bundle = validateStudyCardBundle(studyCardArtifactFixture());
		const plan = planStudyCardImport(bundle);
		const statements = buildStudyCardImportStatements(bundle, plan);

		expect(plan.action).toBe('insert');
		expect(plan.counts).toEqual({
			cards: 1,
			choices: 4,
			sources: 1,
			targets: 1,
			coverage: 2
		});
		for (const statement of statements) {
			expect(statement.params).toHaveLength(statement.sql.match(/\?/g)?.length ?? 0);
		}

		const releaseIndex = findStatement(statements, 'INSERT INTO study_card_releases');
		const draftIndex = findStatement(statements, 'INSERT INTO study_cards');
		const choiceIndex = findStatement(statements, 'INSERT INTO study_card_choices');
		const sourceIndex = findStatement(statements, 'INSERT INTO study_card_sources');
		const targetIndex = findStatement(statements, 'INSERT INTO study_card_targets');
		const coverageIndex = findStatement(statements, 'INSERT INTO study_deck_coverage');
		const publishIndex = findStatement(statements, "SET status = 'published'");
		const importIndex = findStatement(statements, "SET status = 'imported'");

		expect(releaseIndex).toBeLessThan(draftIndex);
		expect(draftIndex).toBeLessThan(choiceIndex);
		expect(choiceIndex).toBeLessThan(sourceIndex);
		expect(sourceIndex).toBeLessThan(targetIndex);
		expect(targetIndex).toBeLessThan(coverageIndex);
		expect(coverageIndex).toBeLessThan(publishIndex);
		expect(publishIndex).toBeLessThan(importIndex);
		expect(statements[draftIndex].sql).toContain('kind, emoji');
		expect(statements[draftIndex].params).toContain('🔥');
	});

	it('executes the generated statement batch against the guarded schema', () => {
		const bundle = validateStudyCardBundle(studyCardArtifactFixture());
		const plan = planStudyCardImport(bundle);
		const statements = buildStudyCardImportStatements(bundle, plan);
		const db = studyCardDatabase();

		for (const statement of statements) db.prepare(statement.sql).run(...statement.params);

		expect(
			db.prepare(`SELECT status FROM study_card_releases WHERE id = ?`).get(bundle.release.id)
		).toEqual({ status: 'imported' });
		expect(db.prepare(`SELECT status, emoji FROM study_cards`).get()).toEqual({
			status: 'published',
			emoji: '🔥'
		});
		expect(db.prepare(`SELECT COUNT(*) AS count FROM study_card_choices`).get()).toEqual({
			count: 4
		});
		expect(
			db.prepare(`SELECT status, card_count FROM study_deck_coverage ORDER BY status`).all()
		).toEqual([
			{ status: 'ready', card_count: 1 },
			{ status: 'withheld', card_count: 0 }
		]);

		expect(studyCardRuntimeCatalogParameters).toEqual([
			'board',
			'subject',
			'offeringId',
			'topicComponentId'
		]);
		expect(studyCardRuntimeCatalogQuery).toContain('candidate.offering_id = requested.offering_id');
		expect(studyCardRuntimeCatalogQuery).toContain('ORDER BY candidate.is_primary DESC');
		const runtimeCard = db
			.prepare(studyCardRuntimeCatalogQuery)
			.get(
				'OCR',
				'English Literature',
				'ocr-j352-english-literature-higher',
				'ocr-j352-macbeth'
			) as { id: string; choices_json: string };
		expect(runtimeCard.id).toBe(bundle.cards[0].id);
		expect(JSON.parse(runtimeCard.choices_json)).toHaveLength(4);
		expect(JSON.parse(runtimeCard.choices_json)[0].isCorrect).toBe(true);
		expect(
			db
				.prepare(studyCardRuntimeCatalogQuery)
				.get(
					'OCR',
					'English Literature',
					'ocr-j352-english-literature-higher',
					'ocr-j352-animal-farm'
				)
		).toBeUndefined();
	});

	it('imports and serves a reviewed three-choice card without weakening four-choice support', () => {
		const fixture = studyCardArtifactFixture();
		fixture.cards[0].choices.pop();
		const bundle = validateStudyCardBundle(fixture);
		const statements = buildStudyCardImportStatements(bundle, planStudyCardImport(bundle));
		const db = studyCardDatabase();

		for (const statement of statements) db.prepare(statement.sql).run(...statement.params);

		expect(db.prepare(`SELECT COUNT(*) AS count FROM study_card_choices`).get()).toEqual({
			count: 3
		});
		const runtimeCard = db
			.prepare(studyCardRuntimeCatalogQuery)
			.get(
				'OCR',
				'English Literature',
				'ocr-j352-english-literature-higher',
				'ocr-j352-macbeth'
			) as { choices_json: string };
		expect(JSON.parse(runtimeCard.choices_json)).toHaveLength(3);
		db.close();
	});

	it('serves one deterministic row in a reviewed secondary offering', () => {
		const fixture = studyCardArtifactFixture();
		fixture.cards[0].targets.push(
			{
				offeringId: 'ocr-j352-secondary-offering',
				curriculumComponentId: 'ocr-j352-macbeth-ambition',
				topicComponentId: 'ocr-j352-macbeth',
				isPrimary: false,
				confidence: 0.9,
				reviewed: true
			},
			{
				offeringId: 'ocr-j352-secondary-offering',
				curriculumComponentId: 'ocr-j352-secondary-component',
				topicComponentId: 'ocr-j352-secondary-topic',
				isPrimary: false,
				confidence: 0.8,
				reviewed: true
			}
		);
		fixture.coverage.push(
			{
				offeringId: 'ocr-j352-secondary-offering',
				topicComponentId: 'ocr-j352-macbeth',
				status: 'ready',
				cardCount: 1
			},
			{
				offeringId: 'ocr-j352-secondary-offering',
				topicComponentId: 'ocr-j352-secondary-topic',
				status: 'ready',
				cardCount: 1
			}
		);
		const bundle = validateStudyCardBundle(fixture);
		const statements = buildStudyCardImportStatements(bundle, planStudyCardImport(bundle));
		const db = studyCardDatabase();
		for (const statement of statements) db.prepare(statement.sql).run(...statement.params);

		const offeringRows = db
			.prepare(studyCardRuntimeCatalogQuery)
			.all('OCR', 'English Literature', 'ocr-j352-secondary-offering', null);
		expect(offeringRows).toHaveLength(1);
		expect(offeringRows[0]).toMatchObject({
			id: fixture.cards[0].id,
			offering_id: 'ocr-j352-secondary-offering',
			topic_component_id: 'ocr-j352-macbeth'
		});
		expect(
			db
				.prepare(studyCardRuntimeCatalogQuery)
				.get('OCR', 'English Literature', 'ocr-j352-secondary-offering', 'ocr-j352-secondary-topic')
		).toMatchObject({ id: fixture.cards[0].id });
		db.close();
	});

	it('is idempotent only for the exact imported immutable release', () => {
		const bundle = validateStudyCardBundle(studyCardArtifactFixture());
		const artifactHash = hashStudyCardArtifact(bundle);
		const release = {
			id: bundle.release.id,
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
			artifact_path: bundle.release.artifactPath,
			expected_card_count: 1,
			expected_coverage_count: 2,
			status: 'imported',
			import_owner: 'study-card-import/v1'
		};
		const cards = bundle.cards.map((card) => ({
			id: card.id,
			release_id: bundle.release.id,
			content_hash: card.contentHash,
			status: 'published',
			needs_human_review: 0,
			import_owner: 'study-card-import/v1'
		}));
		const plan = planStudyCardImport(bundle, { releases: [release], cards });

		expect(plan.action).toBe('noop');
		expect(plan.conflicts).toEqual([]);
		expect(buildStudyCardImportStatements(bundle, plan)).toEqual([]);
	});

	it('never overwrites an accepted, rejected, foreign or colliding identity', () => {
		const bundle = validateStudyCardBundle(studyCardArtifactFixture());
		const collision = planStudyCardImport(bundle, {
			cards: [
				{
					id: bundle.cards[0].id,
					release_id: 'another-release',
					import_owner: 'manual'
				}
			]
		});
		expect(collision.action).toBe('conflict');
		expect(collision.conflicts[0].reason).toMatch(/another-release/);

		const exactHash = hashStudyCardArtifact(bundle);
		const rejected = planStudyCardImport(bundle, {
			releases: [
				{
					id: bundle.release.id,
					status: 'rejected',
					import_owner: 'manual',
					artifact_hash: exactHash
				}
			],
			cards: []
		});
		expect(rejected.action).toBe('conflict');
		expect(rejected.conflicts.map((row) => row.reason).join('\n')).toMatch(/terminal/);
		expect(rejected.conflicts.map((row) => row.reason).join('\n')).toMatch(/owned by manual/);
		expect(() => buildStudyCardImportStatements(bundle, rejected)).toThrow(/unresolved conflicts/);
	});
});

function findStatement(statements: Array<{ sql: string; params: unknown[] }>, needle: string) {
	const index = statements.findIndex((statement) => statement.sql.includes(needle));
	expect(index).toBeGreaterThan(-1);
	return index;
}

function studyCardDatabase() {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON');
	db.exec(`
		CREATE TABLE curriculum_specifications (
			id TEXT PRIMARY KEY, board TEXT NOT NULL, qualification TEXT NOT NULL
		);
		CREATE TABLE curriculum_components (
			id TEXT PRIMARY KEY,
			specification_id TEXT NOT NULL REFERENCES curriculum_specifications(id),
			parent_id TEXT REFERENCES curriculum_components(id),
			selectable INTEGER NOT NULL,
			code TEXT NOT NULL,
			title TEXT NOT NULL,
			paper TEXT
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
		INSERT INTO curriculum_components VALUES
			('root', 'spec', NULL, 0, 'J352', 'English Literature', NULL),
			('ocr-j352-macbeth', 'spec', 'root', 1, 'Macbeth', 'Macbeth', 'Component 01'),
			('ocr-j352-macbeth-ambition', 'spec', 'ocr-j352-macbeth', 0, 'Macbeth.ambition', 'Ambition', 'Component 01'),
			('ocr-j352-animal-farm', 'spec', 'root', 1, 'Animal Farm', 'Animal Farm', 'Component 01'),
			('ocr-j352-secondary-topic', 'spec', 'root', 1, 'Secondary', 'Secondary topic', 'Component 02'),
			('ocr-j352-secondary-component', 'spec', 'ocr-j352-secondary-topic', 0, 'Secondary.detail', 'Secondary detail', 'Component 02');
		INSERT INTO curriculum_offerings VALUES (
			'ocr-j352-english-literature-higher', 'OCR', 'GCSE', 'English Literature',
			'spec', 'root', '["ocr-j352-macbeth","ocr-j352-animal-farm"]', 1
		), (
			'ocr-j352-secondary-offering', 'OCR', 'GCSE', 'English Literature',
			'spec', 'root', '["ocr-j352-macbeth","ocr-j352-secondary-topic"]', 1
		);
	`);
	return db;
}
