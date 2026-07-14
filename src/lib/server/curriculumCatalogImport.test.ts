import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	CURRICULUM_IMPORT_OWNER,
	buildCurriculumImportSnapshot,
	buildCurriculumUpsertStatements,
	buildTrustedQuestionCurriculumMappings,
	validateCurriculumCatalog
} from '../../../scripts/lib/curriculum-catalog.mjs';

const sha256 = 'a'.repeat(64);
let rootDir: string;

beforeEach(() => {
	rootDir = mkdtempSync(path.join(tmpdir(), 'curriculum-catalog-'));
	mkdirSync(path.join(rootDir, 'data/curricula'), { recursive: true });
	writeFileSync(path.join(rootDir, 'data/curricula/aqa-8461.pdf'), 'test-pdf');
});

describe('official curriculum catalog import', () => {
	it('validates official evidence and builds the exact denormalized runtime contracts', () => {
		const catalog = validate(fixture());
		const snapshot = buildCurriculumImportSnapshot(catalog);

		expect(snapshot.specifications).toHaveLength(1);
		expect(snapshot.components).toHaveLength(4);
		expect(snapshot.offerings).toHaveLength(1);
		expect(snapshot.offerings[0].selectionTree).toEqual({
			groups: [
				{
					id: 'aqa-gcse-biology-8461-higher:curriculum',
					title: 'Topics',
					kind: 'curriculum',
					displayOrder: 1,
					components: [
						{
							id: 'aqa-8461-cell-structure',
							code: '4.1.1',
							title: 'Cell structure',
							kind: 'topic',
							displayOrder: 1,
							subjectArea: 'Biology',
							optionGroupId: null,
							sourcePageStart: 18,
							sourcePageEnd: 20
						},
						{
							id: 'aqa-8461-cell-transport',
							code: '4.1.3',
							title: 'Transport in cells',
							kind: 'topic',
							displayOrder: 2,
							subjectArea: 'Biology',
							optionGroupId: null,
							sourcePageStart: 24,
							sourcePageEnd: 26
						}
					]
				}
			]
		});
		expect(snapshot.offerings[0].selectableComponentIds).toEqual([
			'aqa-8461-cell-structure',
			'aqa-8461-cell-transport'
		]);
		expect(snapshot.profileSnapshots).toEqual([
			expect.objectContaining({
				id: 'gcse-current',
				qualification: 'GCSE',
				options: {
					qualification: 'GCSE',
					subjects: [
						{
							subject: 'Biology',
							tierApplies: true,
							boards: [
								{
									id: 'aqa',
									name: 'AQA',
									courses: [
										{
											name: 'Separate Science',
											tiers: [
												{
													name: 'Higher',
													offeringId: 'aqa-gcse-biology-8461-higher',
													specification: {
														id: 'aqa-gcse-biology-8461-current',
														code: '8461',
														version: 'current',
														title: 'GCSE Biology 8461',
														officialSourceUrl:
															'https://www.aqa.org.uk/subjects/science/gcse/biology-8461'
													}
												}
											]
										}
									]
								}
							]
						}
					]
				}
			})
		]);
	});

	it('rejects source, tree, and exact offering inconsistencies before D1 access', () => {
		const input = fixture();
		input.specifications[0].pdfUrl = 'https://example.com/not-official.pdf';
		input.specifications[0].components[2].depth = 8;
		input.offerings[0].selectableComponentIds = ['aqa-8461-cell-structure'];

		expect(() => validate(input)).toThrow(/not on an official AQA domain/);
		expect(() => validate(input)).toThrow(/depth must be exactly parent depth \+ 1/);
		expect(() => validate(input)).toThrow(
			/must exactly equal the applicable selectable descendants/
		);
	});

	it('rejects local PDF hash and page-count drift', () => {
		expect(() =>
			validateCurriculumCatalog(fixture(), {
				rootDir,
				inspectPdf: () => ({ sha256: 'b'.repeat(64), pageCount: 99 })
			})
		).toThrow(/sha256 mismatch/);
		expect(() =>
			validateCurriculumCatalog(fixture(), {
				rootDir,
				inspectPdf: () => ({ sha256: 'b'.repeat(64), pageCount: 99 })
			})
		).toThrow(/pageCount mismatch/);
	});

	it('uses the current persisted Higher profile key for untiered non-science offerings', () => {
		const input = fixture();
		input.specifications[0].subject = 'Geography';
		input.specifications[0].profileSubjects = ['Geography'];
		input.offerings[0].profileSubject = 'Geography';
		input.offerings[0].tier = 'Untiered';

		expect(() => validate(input)).toThrow(
			/must be Higher for non-science subjects to match the current persisted profile key/
		);
	});

	it('does not expose the synthetic Higher persistence key as a real tier choice', () => {
		const input = fixture();
		input.specifications[0].subject = 'Geography';
		input.specifications[0].profileSubjects = ['Geography'];
		for (const component of input.specifications[0].components) {
			component.subjectArea = 'Geography';
		}
		input.specifications[0].components[0].metadata.untiered = true;
		input.offerings[0].profileSubject = 'Geography';
		input.offerings[0].tier = 'Higher';
		const snapshot = buildCurriculumImportSnapshot(validate(input));

		expect(snapshot.profileSnapshots[0].options.subjects[0]).toEqual(
			expect.objectContaining({ subject: 'Geography', tierApplies: false })
		);
	});

	it('normalizes non-default offerings but keeps them out of the profile snapshot', () => {
		const input = fixture();
		input.schemaVersion = 1;
		input.specifications[0].components[0].tier = null;
		input.specifications[0].components[1].tier = 'Both';
		input.offerings.push({
			...input.offerings[0],
			id: 'aqa-gcse-biology-8461-foundation',
			tier: 'Foundation',
			label: 'AQA GCSE Biology (Foundation)',
			isDefault: false
		});
		const snapshot = buildCurriculumImportSnapshot(validate(input));

		expect(snapshot.offerings).toHaveLength(2);
		expect(snapshot.components[0].tierJson).toEqual([]);
		expect(snapshot.components[1].tierJson).toEqual([]);
		expect(snapshot.profileSnapshots[0].options.subjects[0].boards[0].courses[0].tiers).toEqual([
			expect.objectContaining({ name: 'Higher' })
		]);
	});

	it('rejects non-canonical component and offering tier labels', () => {
		const componentTier = fixture();
		componentTier.specifications[0].components[2].tier = ['H'];
		expect(() => validate(componentTier)).toThrow(/contains unsupported tier H/);

		const duplicateTier = fixture();
		duplicateTier.specifications[0].components[2].tier = ['Higher', 'Higher'];
		expect(() => validate(duplicateTier)).toThrow(/must not contain duplicates/);

		const offeringTier = fixture();
		offeringTier.offerings[0].tier = 'H';
		expect(() => validate(offeringTier)).toThrow(/tier must be Foundation or Higher/);
	});

	it('emits and validates official option-group selection constraints', () => {
		const input = fixture();
		input.specifications[0].components[1].metadata = { selectionMin: 1, selectionMax: 1 };
		input.specifications[0].components[2].optionGroupId = 'aqa-8461-cell-group';
		input.specifications[0].components[3].optionGroupId = 'aqa-8461-cell-group';
		const snapshot = buildCurriculumImportSnapshot(validate(input));

		expect(snapshot.offerings[0].selectionTree.groups[0]).toEqual(
			expect.objectContaining({ kind: 'option_group', selectionMin: 1, selectionMax: 1 })
		);

		input.specifications[0].components[3].optionGroupId = 'missing-group';
		expect(() => validate(input)).toThrow(/optionGroupId missing-group does not exist/);
	});

	it('keeps curriculum scope independent of papers while genuine option groups still win', () => {
		const input = fixture();
		input.specifications[0].components[3].paper = 'Paper 2';
		const snapshot = buildCurriculumImportSnapshot(validate(input));

		expect(snapshot.offerings[0].selectionTree.groups).toEqual([
			expect.objectContaining({
				id: 'aqa-gcse-biology-8461-higher:curriculum',
				title: 'Topics',
				kind: 'curriculum',
				components: expect.arrayContaining([
					expect.objectContaining({ id: 'aqa-8461-cell-structure' }),
					expect.objectContaining({ id: 'aqa-8461-cell-transport' })
				])
			})
		]);
		expect(snapshot.offerings[0].selectionTree.groups[0].components[0]).not.toHaveProperty('paper');

		input.specifications[0].components[1].metadata = { selectionMin: 1, selectionMax: 1 };
		input.specifications[0].components[2].optionGroupId = 'aqa-8461-cell-group';
		input.specifications[0].components[3].optionGroupId = 'aqa-8461-cell-group';
		const optionSnapshot = buildCurriculumImportSnapshot(validate(input));
		expect(optionSnapshot.offerings[0].selectionTree.groups).toEqual([
			expect.objectContaining({
				id: 'aqa-8461-cell-group',
				title: 'Cell biology',
				selectionMin: 1,
				selectionMax: 1
			})
		]);
	});

	it('maps only clean published questions from exact identities to the deepest component', () => {
		const input = fixture();
		input.specifications[0].components[1].metadata.questionSpecRefs = ['4.1'];
		input.specifications[0].components[2].metadata.questionSpecRefs = ['4.1'];
		input.specifications[0].components[2].metadata.examComponentCodes = ['8461/1H'];
		input.specifications[0].components[3].metadata.examComponentCodes = ['8461/1H'];
		const snapshot = buildCurriculumImportSnapshot(validate(input));
		const result = buildTrustedQuestionCurriculumMappings(
			[
				{
					id: 'q-exact',
					status: 'published',
					needs_human_review: 0,
					board: 'AQA',
					qualification: 'GCSE',
					subject: 'Biology',
					subject_area: 'Biology',
					component_code: '8461/2H',
					spec_ref: '4.1',
					year: 2024,
					prompt_text: 'This wording is never used for classification.'
				},
				{
					id: 'q-keyword-only',
					status: 'published',
					needs_human_review: 0,
					board: 'AQA',
					qualification: 'GCSE',
					subject: 'Biology',
					subject_area: 'Biology',
					component_code: '8461/2H',
					spec_ref: null,
					year: 2024,
					prompt_text: 'Describe cell structure.'
				},
				{
					id: 'q-review',
					status: 'published',
					needs_human_review: 1,
					board: 'AQA',
					qualification: 'GCSE',
					subject: 'Biology',
					subject_area: 'Biology',
					component_code: '8461/1H',
					spec_ref: '4.1',
					year: 2024
				},
				{
					id: 'q-repeated-paper-code',
					status: 'published',
					needs_human_review: 0,
					board: 'AQA',
					qualification: 'GCSE',
					subject: 'Biology',
					subject_area: 'Biology',
					component_code: '8461/1H',
					spec_ref: null,
					year: 2024
				}
			],
			snapshot
		);

		expect(result.mappings).toEqual([
			expect.objectContaining({
				questionId: 'q-exact',
				curriculumComponentId: 'aqa-8461-cell-structure',
				mappingSource: `${CURRICULUM_IMPORT_OWNER}:spec_ref`,
				confidence: 1,
				reviewed: true
			})
		]);
		expect(result.unmapped).toEqual([
			{ questionId: 'q-keyword-only', reason: 'no exact trusted identifier match' }
		]);
		expect(result.ineligible).toEqual([
			{ questionId: 'q-review', reason: 'not clean and published' }
		]);
		expect(result.ambiguous).toEqual([
			{
				questionId: 'q-repeated-paper-code',
				componentIds: ['aqa-8461-cell-group', 'aqa-8461-cell-structure', 'aqa-8461-cell-transport'],
				reason: 'component_code repeats across multiple curriculum components'
			}
		]);
	});

	it('makes every upsert owner-guarded and keeps mapping ownership explicit', () => {
		const snapshot = buildCurriculumImportSnapshot(validate(fixture()));
		const statements = buildCurriculumUpsertStatements(snapshot, [
			{
				questionId: 'q1',
				curriculumComponentId: 'aqa-8461-cell-structure',
				specificationId: 'aqa-gcse-biology-8461-current',
				isPrimary: true,
				confidence: 1,
				mappingSource: `${CURRICULUM_IMPORT_OWNER}:spec_ref`,
				mappingNotes: 'Exact identity.',
				reviewed: true
			}
		]);

		expect(
			statements.some((statement) => statement.sql.includes('curriculum_specifications'))
		).toBe(true);
		expect(
			statements
				.filter((statement) => !statement.sql.includes('question_curriculum_components'))
				.every((statement) => statement.sql.includes('import_owner = excluded.import_owner'))
		).toBe(true);
		expect(statements.at(-1)?.sql).toContain(
			`question_curriculum_components.mapping_source LIKE '${CURRICULUM_IMPORT_OWNER}:%'`
		);
		expect(JSON.parse(String(statements.at(-1)?.params?.[0]))[0].mappingSource).toBe(
			`${CURRICULUM_IMPORT_OWNER}:spec_ref`
		);
	});

	it('executes the migration and complete snapshot twice idempotently in SQLite', () => {
		const snapshot = buildCurriculumImportSnapshot(validate(fixture()));
		const mappings = [
			{
				questionId: 'q1',
				curriculumComponentId: 'aqa-8461-cell-structure',
				specificationId: 'aqa-gcse-biology-8461-current',
				isPrimary: true,
				confidence: 1,
				mappingSource: `${CURRICULUM_IMPORT_OWNER}:spec_ref`,
				mappingNotes: 'Exact identity.',
				reviewed: true
			}
		];
		const statements = buildCurriculumUpsertStatements(snapshot, mappings);
		const database = new DatabaseSync(':memory:');
		database.exec('PRAGMA foreign_keys = ON; CREATE TABLE questions (id TEXT PRIMARY KEY);');
		database.exec(
			readFileSync(path.join(process.cwd(), 'migrations/0017_curriculum_catalog.sql'), 'utf8')
		);
		database.prepare('INSERT INTO questions (id) VALUES (?)').run('q1');

		for (const statement of statements) database.prepare(statement.sql).run(...statement.params);
		for (const statement of statements) database.prepare(statement.sql).run(...statement.params);

		expect(
			database.prepare('SELECT COUNT(*) AS count FROM curriculum_specifications').get()
		).toEqual({ count: 1 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM curriculum_components').get()).toEqual({
			count: 4
		});
		expect(database.prepare('SELECT COUNT(*) AS count FROM curriculum_offerings').get()).toEqual({
			count: 1
		});
		expect(
			database.prepare('SELECT COUNT(*) AS count FROM curriculum_profile_snapshots').get()
		).toEqual({ count: 1 });
		expect(
			database.prepare('SELECT is_primary, reviewed FROM question_curriculum_components').get()
		).toEqual({ is_primary: 1, reviewed: 1 });
		const offering = database
			.prepare('SELECT selection_tree_json FROM curriculum_offerings WHERE id = ?')
			.get('aqa-gcse-biology-8461-higher') as { selection_tree_json: string };
		expect(JSON.parse(offering.selection_tree_json)).toEqual(snapshot.offerings[0].selectionTree);
		database.close();
	});
});

function validate(input: any) {
	return validateCurriculumCatalog(input, {
		rootDir,
		inspectPdf: () => ({ sha256, pageCount: 40 })
	});
}

function fixture(): any {
	return {
		schemaVersion: '1',
		generatedAt: '2026-07-13T12:00:00.000Z',
		specifications: [
			{
				id: 'aqa-gcse-biology-8461-current',
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Biology',
				course: 'Separate Science',
				profileSubjects: ['Biology'],
				specificationCode: '8461',
				version: 'current',
				title: 'GCSE Biology 8461',
				firstTeachingYear: 2016,
				firstExamYear: 2018,
				lastExamYear: null,
				status: 'current',
				landingUrl: 'https://www.aqa.org.uk/subjects/science/gcse/biology-8461',
				pdfUrl:
					'https://filestore.aqa.org.uk/resources/biology/specifications/AQA-8461-SP-2016.PDF',
				localPath: 'data/curricula/aqa-8461.pdf',
				sha256,
				pageCount: 40,
				components: [
					{
						id: 'aqa-8461-root',
						parentId: null,
						code: '8461',
						title: 'Biology',
						kind: 'specification',
						depth: 0,
						displayOrder: 0,
						selectable: false,
						subjectArea: 'Biology',
						paper: null,
						tier: [],
						optionGroupId: null,
						sourcePageStart: 1,
						sourcePageEnd: 40,
						metadata: {}
					},
					{
						id: 'aqa-8461-cell-group',
						parentId: 'aqa-8461-root',
						code: '4.1',
						title: 'Cell biology',
						kind: 'topic_group',
						depth: 1,
						displayOrder: 1,
						selectable: false,
						subjectArea: 'Biology',
						paper: 'Paper 1',
						tier: [],
						optionGroupId: null,
						sourcePageStart: 17,
						sourcePageEnd: 27,
						metadata: { questionComponentCodes: ['8461/1H'] }
					},
					{
						id: 'aqa-8461-cell-structure',
						parentId: 'aqa-8461-cell-group',
						code: '4.1.1',
						title: 'Cell structure',
						kind: 'topic',
						depth: 2,
						displayOrder: 1,
						selectable: true,
						subjectArea: 'Biology',
						paper: 'Paper 1',
						tier: [],
						optionGroupId: null,
						sourcePageStart: 18,
						sourcePageEnd: 20,
						metadata: {}
					},
					{
						id: 'aqa-8461-cell-transport',
						parentId: 'aqa-8461-cell-group',
						code: '4.1.3',
						title: 'Transport in cells',
						kind: 'topic',
						depth: 2,
						displayOrder: 2,
						selectable: true,
						subjectArea: 'Biology',
						paper: 'Paper 1',
						tier: [],
						optionGroupId: null,
						sourcePageStart: 24,
						sourcePageEnd: 26,
						metadata: {}
					}
				]
			}
		],
		offerings: [
			{
				id: 'aqa-gcse-biology-8461-higher',
				board: 'AQA',
				qualification: 'GCSE',
				profileSubject: 'Biology',
				course: 'Separate Science',
				tier: 'Higher',
				specificationId: 'aqa-gcse-biology-8461-current',
				rootComponentId: 'aqa-8461-root',
				selectableComponentIds: ['aqa-8461-cell-structure', 'aqa-8461-cell-transport'],
				label: 'AQA GCSE Biology (Higher)',
				isDefault: true
			}
		]
	};
}
