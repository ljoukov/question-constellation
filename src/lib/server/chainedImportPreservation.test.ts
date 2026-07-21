import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	CHAINED_IMPORT_OWNER,
	chainSummaryForImport,
	childOwnershipSql,
	importConflictDiagnosticStatements,
	importOwnershipSql,
	modelAnswerSupportingMarkSchemeIds,
	scopedChildReconciliationStatements,
	upsertStatement
} from '../../../scripts/lib/chained-import-preservation.mjs';
import {
	deleteLegacyPracticePayloadsStatement,
	deleteStaleQuestionPracticePayloadVersionsStatement,
	invalidateQuestionPracticePayloadsStatement
} from '../../../scripts/lib/public-route-materialization-scope.mjs';
import {
	applyScopedChainRepairs,
	applyScopedQuestionRepairs,
	atomicQuestionPromptForImport,
	SCOPED_REPAIR_SCHEMA_VERSION
} from '../../../scripts/lib/scoped-chained-content-repairs.mjs';
import {
	chainedImportPhysicsRepairSource,
	chainedImportQuestionRepairSource
} from './fixtures/chainedImportRepairSource';

const rootDir = process.cwd();
const importerSource = readFileSync(
	path.join(rootDir, 'scripts/import-chained-questions.mjs'),
	'utf8'
);
const materializerSource = readFileSync(
	path.join(rootDir, 'scripts/materialize-public-route-payloads.mjs'),
	'utf8'
);
const baseline = structuredClone(chainedImportQuestionRepairSource);
const physics = structuredClone(chainedImportPhysicsRepairSource);
const repair = JSON.parse(
	readFileSync(
		path.join(rootDir, 'scripts/repairs/illustrated-science-question-fixes.json'),
		'utf8'
	)
);

function runStatement(database: DatabaseSync, statement: { sql: string; params: unknown[] }) {
	database.prepare(statement.sql).run(...(statement.params as never[]));
}

describe('additive chained imports', () => {
	it('preserves publication state, illustration pairs, and unrelated subset rows', () => {
		const database = new DatabaseSync(':memory:');
		database.exec(`
			PRAGMA foreign_keys = ON;
			CREATE TABLE source_documents (id TEXT PRIMARY KEY, title TEXT);
			CREATE TABLE questions (
			  id TEXT PRIMARY KEY,
			  source_document_id TEXT NOT NULL REFERENCES source_documents(id),
			  prompt_text TEXT NOT NULL,
			  status TEXT NOT NULL
			);
			CREATE TABLE answer_chains (
			  id TEXT PRIMARY KEY,
			  title TEXT NOT NULL,
			  summary TEXT,
			  status TEXT NOT NULL
			);
			CREATE TABLE answer_chain_steps (
			  id TEXT PRIMARY KEY,
			  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
			  step_text TEXT NOT NULL
			);
			CREATE TABLE answer_chain_illustrations (
			  id TEXT PRIMARY KEY,
			  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
			  source_question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
			  r2_key TEXT NOT NULL,
			  light_r2_key TEXT NOT NULL,
			  status TEXT NOT NULL
			);
			INSERT INTO source_documents VALUES ('imported-doc', 'Old'), ('unrelated-doc', 'Unrelated');
			INSERT INTO questions VALUES
			  ('imported-question', 'imported-doc', 'Old prompt', 'published'),
			  ('unrelated-question', 'unrelated-doc', 'Keep me', 'published');
			INSERT INTO answer_chains VALUES
			  ('imported-chain', 'Old chain', 'Old summary', 'published'),
			  ('unrelated-chain', 'Keep chain', 'Keep summary', 'published');
			INSERT INTO answer_chain_steps VALUES
			  ('imported-chain-step-1', 'imported-chain', 'Old step'),
			  ('unrelated-chain-step-1', 'unrelated-chain', 'Keep step');
			INSERT INTO answer_chain_illustrations VALUES (
			  'approved-pair', 'imported-chain', 'imported-question',
			  'images/chains/kept-dark.webp', 'images/chains/kept-light.webp', 'published'
			);
		`);

		runStatement(
			database,
			upsertStatement(
				'questions',
				['id', 'source_document_id', 'prompt_text', 'status'],
				['imported-question', 'imported-doc', 'Atomic prompt', 'draft'],
				{ preserveColumns: ['status'] }
			)
		);
		runStatement(
			database,
			upsertStatement(
				'answer_chains',
				['id', 'title', 'summary', 'status'],
				['imported-chain', 'Updated chain', 'Updated summary', 'draft'],
				{ preserveColumns: ['status'] }
			)
		);
		runStatement(
			database,
			upsertStatement(
				'answer_chain_steps',
				['id', 'answer_chain_id', 'step_text'],
				['imported-chain-step-1', 'imported-chain', 'Updated step']
			)
		);

		expect(database.prepare('SELECT * FROM answer_chain_illustrations').all()).toEqual([
			expect.objectContaining({
				id: 'approved-pair',
				answer_chain_id: 'imported-chain',
				source_question_id: 'imported-question',
				r2_key: 'images/chains/kept-dark.webp',
				light_r2_key: 'images/chains/kept-light.webp',
				status: 'published'
			})
		]);
		expect(
			database
				.prepare("SELECT prompt_text, status FROM questions WHERE id = 'imported-question'")
				.get()
		).toEqual({
			prompt_text: 'Atomic prompt',
			status: 'published'
		});
		expect(
			database
				.prepare("SELECT title, summary, status FROM answer_chains WHERE id = 'imported-chain'")
				.get()
		).toEqual({
			title: 'Updated chain',
			summary: 'Updated summary',
			status: 'published'
		});
		expect(
			database
				.prepare("SELECT prompt_text, status FROM questions WHERE id = 'unrelated-question'")
				.get()
		).toEqual({
			prompt_text: 'Keep me',
			status: 'published'
		});
		expect(
			database
				.prepare("SELECT step_text FROM answer_chain_steps WHERE id = 'unrelated-chain-step-1'")
				.get()
		).toEqual({
			step_text: 'Keep step'
		});
		database.close();
	});

	it('has no destructive preflight, so a failed partial import cannot strip existing rows', () => {
		expect(importerSource).not.toMatch(/DELETE\s+FROM/i);
		expect(importerSource).not.toContain('clearPublicTables');
		expect(importerSource).not.toMatch(/\binsertStatement\s*\(/);
		expect(importerSource.match(/\bupsertStatement\s*\(/g)?.length).toBeGreaterThan(12);
		expect(importerSource).toContain(
			"const applySchemaRequested = schemaOnly || args.has('--apply-schema')"
		);
		expect(importerSource).toContain('if (applySchemaRequested) {');
		expect(importerSource.indexOf("executeBatch(insertStatements, 'upsert')")).toBeLessThan(
			importerSource.indexOf(
				"executeAtomicBatch(reconciliationStatements, 'reconcile importer-owned child rows')"
			)
		);
		expect(importerSource.indexOf("'reconcile importer-owned child rows'")).toBeLessThan(
			importerSource.indexOf("'invalidate changed question practice caches'")
		);
		expect(importerSource.indexOf("'invalidate changed question practice caches'")).toBeLessThan(
			importerSource.indexOf('await materializePublicRoutePayloads({')
		);
		expect(importerSource.indexOf('await materializePublicRoutePayloads({')).toBeLessThan(
			importerSource.indexOf("executeBatch([contentImportStatement], 'record successful import')")
		);
		expect(importerSource).toContain(
			"'skipped: remote rows do not represent the planned post-import state'"
		);
		expect(importerSource).toContain('importConflictDiagnosticStatements');

		const database = new DatabaseSync(':memory:');
		database.exec(`
			CREATE TABLE rows (id TEXT PRIMARY KEY, value TEXT NOT NULL);
			INSERT INTO rows VALUES ('existing', 'safe');
		`);
		runStatement(database, upsertStatement('rows', ['id', 'value'], ['new-row', 'partial']));
		expect(() =>
			database.prepare("INSERT INTO rows (id, value) VALUES ('broken', NULL)").run()
		).toThrow();
		expect(database.prepare("SELECT value FROM rows WHERE id = 'existing'").get()).toEqual({
			value: 'safe'
		});
		database.close();
	});

	it('blocks exact deterministic-id collisions on foreign parent rows before they can be adopted', () => {
		const database = new DatabaseSync(':memory:');
		database.exec(`
			CREATE TABLE source_documents (
			  id TEXT PRIMARY KEY, title TEXT NOT NULL, metadata_json TEXT NOT NULL
			);
			CREATE TABLE questions (
			  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, prompt_text TEXT NOT NULL,
			  status TEXT NOT NULL, metadata_json TEXT NOT NULL
			);
			CREATE TABLE answer_chains (
			  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
			  created_by TEXT NOT NULL, metadata_json TEXT NOT NULL
			);
			INSERT INTO source_documents VALUES
			  ('shared-doc', 'Vision document', '{"source_pipeline":"llm-vision-extracted"}');
			INSERT INTO questions VALUES
			  ('shared-question', 'shared-question', 'Vision prompt', 'published', '{"source_pipeline":"llm-vision-extracted"}');
			INSERT INTO answer_chains VALUES
			  ('shared-chain', 'shared-chain', 'Vision chain', 'vision_agent', '{"source":"llm-vision-extracted"}');
		`);
		const planned = [
			upsertStatement(
				'source_documents',
				['id', 'title', 'metadata_json'],
				['shared-doc', 'Baseline document', `{"import_owner":"${CHAINED_IMPORT_OWNER}"}`],
				{ updateWhereSql: importOwnershipSql('source_documents') }
			),
			upsertStatement(
				'questions',
				['id', 'slug', 'prompt_text', 'status', 'metadata_json'],
				[
					'shared-question',
					'shared-question',
					'Baseline prompt',
					'draft',
					`{"import_owner":"${CHAINED_IMPORT_OWNER}"}`
				],
				{
					preserveColumns: ['status'],
					updateWhereSql: importOwnershipSql('questions')
				}
			),
			upsertStatement(
				'answer_chains',
				['id', 'slug', 'title', 'created_by', 'metadata_json'],
				[
					'shared-chain',
					'shared-chain',
					'Semantic chain',
					'extraction_agent',
					`{"import_owner":"${CHAINED_IMPORT_OWNER}"}`
				],
				{ updateWhereSql: importOwnershipSql('answer_chains') }
			)
		];
		const diagnostics = importConflictDiagnosticStatements({ statements: planned });
		for (const table of ['source_documents', 'questions', 'answer_chains']) {
			const diagnostic = diagnostics.find((candidate) => candidate.conflictTable === table);
			if (!diagnostic) throw new Error(`Expected ${table} conflict diagnostic.`);
			expect(database.prepare(diagnostic.diagnosticSql).get(...diagnostic.params)).toEqual({
				blocking_conflict_count: 1,
				blocking_conflict_ids:
					table === 'source_documents'
						? 'shared-doc'
						: table === 'questions'
							? 'shared-question'
							: 'shared-chain'
			});
		}

		for (const statement of planned) runStatement(database, statement);
		expect(
			database.prepare("SELECT title FROM source_documents WHERE id = 'shared-doc'").get()
		).toEqual({ title: 'Vision document' });
		expect(
			database
				.prepare("SELECT prompt_text, status FROM questions WHERE id = 'shared-question'")
				.get()
		).toEqual({ prompt_text: 'Vision prompt', status: 'published' });
		expect(
			database.prepare("SELECT title FROM answer_chains WHERE id = 'shared-chain'").get()
		).toEqual({ title: 'Vision chain' });
		database.close();
	});

	it('blocks owned collisions that the exact ON CONFLICT target cannot resolve', () => {
		const database = new DatabaseSync(':memory:');
		database.exec(`
			CREATE TABLE questions (
			  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, prompt_text TEXT NOT NULL,
			  metadata_json TEXT NOT NULL
			);
			CREATE TABLE answer_chains (
			  id TEXT PRIMARY KEY, created_by TEXT NOT NULL, metadata_json TEXT NOT NULL
			);
			CREATE TABLE answer_chain_steps (
			  id TEXT PRIMARY KEY, answer_chain_id TEXT NOT NULL, display_order INTEGER NOT NULL,
			  step_text TEXT NOT NULL, UNIQUE (answer_chain_id, display_order)
			);
			INSERT INTO questions VALUES
			  ('existing-question', 'taken-slug', 'Existing', '{"import_owner":"${CHAINED_IMPORT_OWNER}"}');
			INSERT INTO answer_chains VALUES
			  ('owned-chain', 'extraction_agent', '{"import_owner":"${CHAINED_IMPORT_OWNER}"}');
			INSERT INTO answer_chain_steps VALUES
			  ('planned-step-id', 'owned-chain', 1, 'Primary-key occupant'),
			  ('owned-chain-step-2', 'owned-chain', 2, 'Secondary-key occupant');
		`);

		const parentSecondaryCollision = upsertStatement(
			'questions',
			['id', 'slug', 'prompt_text', 'metadata_json'],
			['new-question-id', 'taken-slug', 'Planned', `{"import_owner":"${CHAINED_IMPORT_OWNER}"}`],
			{ updateWhereSql: importOwnershipSql('questions') }
		);
		const childDoubleCollision = upsertStatement(
			'answer_chain_steps',
			['id', 'answer_chain_id', 'display_order', 'step_text'],
			['planned-step-id', 'owned-chain', 2, 'Impossible replacement'],
			{
				conflictColumns: ['answer_chain_id', 'display_order'],
				updateWhereSql: childOwnershipSql('answer_chain_steps')
			}
		);
		const diagnostics = importConflictDiagnosticStatements({
			statements: [parentSecondaryCollision, childDoubleCollision]
		});
		const questionDiagnostic = diagnostics.find(
			(statement) => statement.conflictTable === 'questions'
		);
		const stepDiagnostic = diagnostics.find(
			(statement) => statement.conflictTable === 'answer_chain_steps'
		);
		if (!questionDiagnostic || !stepDiagnostic) throw new Error('Expected collision diagnostics.');
		expect(
			database.prepare(questionDiagnostic.diagnosticSql).get(...questionDiagnostic.params)
		).toEqual({
			blocking_conflict_count: 1,
			blocking_conflict_ids: 'existing-question'
		});
		const stepConflict = database
			.prepare(stepDiagnostic.diagnosticSql)
			.get(...stepDiagnostic.params) as {
			blocking_conflict_count: number;
			blocking_conflict_ids: string;
		};
		expect(stepConflict.blocking_conflict_count).toBe(2);
		expect(new Set(stepConflict.blocking_conflict_ids.split(','))).toEqual(
			new Set(['planned-step-id', 'owned-chain-step-2'])
		);
		database.close();
	});

	it('blocks published compact chains and memberships that have legacy labels but no explicit owner', () => {
		const database = new DatabaseSync(':memory:');
		database.exec(`
			CREATE TABLE answer_chains (
			  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
			  summary TEXT, canonical_chain_text TEXT NOT NULL, created_by TEXT NOT NULL,
			  status TEXT NOT NULL, metadata_json TEXT NOT NULL
			);
			CREATE TABLE questions (id TEXT PRIMARY KEY, metadata_json TEXT NOT NULL);
			CREATE TABLE question_answer_chains (
			  id TEXT PRIMARY KEY, question_id TEXT NOT NULL, answer_chain_id TEXT NOT NULL,
			  is_primary INTEGER NOT NULL, transfer_distance TEXT NOT NULL,
			  display_order INTEGER NOT NULL, metadata_json TEXT NOT NULL,
			  UNIQUE (question_id, answer_chain_id)
			);
			INSERT INTO answer_chains VALUES
			  ('bio-chain-vaccine-antigen-antibodies-memory-immunity',
			   'bio-chain-vaccine-antigen-antibodies-memory-immunity', 'Vaccine immunity',
			   'Antigen primes fast immunity.',
			   'harmless antigen -> antibodies -> memory cells -> faster response',
			   'extraction_agent', 'published', '{"why_questions_share_chain":"Reviewed compact chain"}'),
			  ('chem-chain-alloy-hardness-distorted-layers',
			   'chem-chain-alloy-hardness-distorted-layers', 'Alloy hardness',
			   'Different-sized atoms stop metal layers sliding easily.',
			   'different atoms -> distorted layers -> less sliding -> harder alloy',
			   'extraction_agent', 'published', '{"source":"semantic-chain-candidate"}'),
			  ('explicit-owned-chain', 'explicit-owned-chain', 'Owned old title', 'Owned old summary',
			   'old -> owned', 'extraction_agent', 'published',
			   '{"import_owner":"${CHAINED_IMPORT_OWNER}"}');
			INSERT INTO questions VALUES
			  ('8464c1h-jun22-05-3', '{"source_pipeline":"targeted_official_mark_scheme_repair"}'),
			  ('owned-question', '{"import_owner":"${CHAINED_IMPORT_OWNER}"}');
			INSERT INTO question_answer_chains VALUES
			  ('8464c1h-jun22-05-3--chem-chain-alloy-hardness-distorted-layers',
			   '8464c1h-jun22-05-3', 'chem-chain-alloy-hardness-distorted-layers', 1, 'near', 3,
			   '{"source":"constellation.questions"}'),
			  ('owned-question--explicit-owned-chain', 'owned-question', 'explicit-owned-chain',
			   0, 'near', 2, '{"import_owner":"${CHAINED_IMPORT_OWNER}"}');
		`);

		const chain = (id: string, title: string) =>
			upsertStatement(
				'answer_chains',
				[
					'id',
					'slug',
					'title',
					'summary',
					'canonical_chain_text',
					'created_by',
					'status',
					'metadata_json'
				],
				[
					id,
					id,
					title,
					'Planned expanded summary',
					'planned -> expanded -> chain',
					'extraction_agent',
					'draft',
					`{"import_owner":"${CHAINED_IMPORT_OWNER}","source":"semantic-chain-candidate"}`
				],
				{
					preserveColumns: ['status'],
					updateWhereSql: importOwnershipSql('answer_chains')
				}
			);
		const membership = (
			id: string,
			questionId: string,
			answerChainId: string,
			displayOrder: number
		) =>
			upsertStatement(
				'question_answer_chains',
				[
					'id',
					'question_id',
					'answer_chain_id',
					'is_primary',
					'transfer_distance',
					'display_order',
					'metadata_json'
				],
				[
					id,
					questionId,
					answerChainId,
					1,
					'start',
					displayOrder,
					`{"import_owner":"${CHAINED_IMPORT_OWNER}","source":"constellation.questions"}`
				],
				{
					conflictColumns: ['question_id', 'answer_chain_id'],
					updateWhereSql: childOwnershipSql('question_answer_chains')
				}
			);

		const planned = [
			chain('bio-chain-vaccine-antigen-antibodies-memory-immunity', 'Expanded vaccine chain'),
			chain('chem-chain-alloy-hardness-distorted-layers', 'Expanded alloy chain'),
			chain('explicit-owned-chain', 'Owned updated title'),
			membership(
				'8464c1h-jun22-05-3--chem-chain-alloy-hardness-distorted-layers',
				'8464c1h-jun22-05-3',
				'chem-chain-alloy-hardness-distorted-layers',
				1
			),
			membership(
				'owned-question--explicit-owned-chain',
				'owned-question',
				'explicit-owned-chain',
				1
			)
		];
		const diagnostics = importConflictDiagnosticStatements({ statements: planned });
		const chainDiagnostic = diagnostics.find(
			(statement) => statement.conflictTable === 'answer_chains'
		);
		const membershipDiagnostic = diagnostics.find(
			(statement) => statement.conflictTable === 'question_answer_chains'
		);
		if (!chainDiagnostic || !membershipDiagnostic) throw new Error('Expected legacy diagnostics.');
		const chainConflicts = database
			.prepare(chainDiagnostic.diagnosticSql)
			.get(...chainDiagnostic.params) as {
			blocking_conflict_count: number;
			blocking_conflict_ids: string;
		};
		expect(chainConflicts.blocking_conflict_count).toBe(2);
		expect(new Set(chainConflicts.blocking_conflict_ids.split(','))).toEqual(
			new Set([
				'bio-chain-vaccine-antigen-antibodies-memory-immunity',
				'chem-chain-alloy-hardness-distorted-layers'
			])
		);
		expect(
			database.prepare(membershipDiagnostic.diagnosticSql).get(...membershipDiagnostic.params)
		).toEqual({
			blocking_conflict_count: 1,
			blocking_conflict_ids: '8464c1h-jun22-05-3--chem-chain-alloy-hardness-distorted-layers'
		});

		// The SQL guard preserves the published compact rows even if a caller bypasses preflight.
		for (const statement of planned) runStatement(database, statement);
		expect(
			database
				.prepare(
					`SELECT id, title, summary FROM answer_chains
					 WHERE id IN ('bio-chain-vaccine-antigen-antibodies-memory-immunity',
					              'chem-chain-alloy-hardness-distorted-layers') ORDER BY id`
				)
				.all()
		).toEqual([
			{
				id: 'bio-chain-vaccine-antigen-antibodies-memory-immunity',
				title: 'Vaccine immunity',
				summary: 'Antigen primes fast immunity.'
			},
			{
				id: 'chem-chain-alloy-hardness-distorted-layers',
				title: 'Alloy hardness',
				summary: 'Different-sized atoms stop metal layers sliding easily.'
			}
		]);
		expect(
			database
				.prepare(
					`SELECT transfer_distance, display_order FROM question_answer_chains
					 WHERE id = '8464c1h-jun22-05-3--chem-chain-alloy-hardness-distorted-layers'`
				)
				.get()
		).toEqual({ transfer_distance: 'near', display_order: 3 });
		expect(
			database.prepare("SELECT title FROM answer_chains WHERE id = 'explicit-owned-chain'").get()
		).toEqual({ title: 'Owned updated title' });
		expect(
			database
				.prepare(
					`SELECT is_primary, transfer_distance, display_order FROM question_answer_chains
					 WHERE id = 'owned-question--explicit-owned-chain'`
				)
				.get()
		).toEqual({ is_primary: 1, transfer_distance: 'start', display_order: 1 });
		database.close();
	});

	it('reruns deterministic checklist and model-answer rows without adopting legacy children', () => {
		const database = new DatabaseSync(':memory:');
		database.exec(`
			CREATE TABLE questions (
			  id TEXT PRIMARY KEY, metadata_json TEXT NOT NULL
			);
			CREATE TABLE mark_checklist_items (
			  id TEXT PRIMARY KEY, question_id TEXT NOT NULL, display_order INTEGER NOT NULL,
			  text TEXT NOT NULL
			);
			CREATE TABLE model_answers (
			  id TEXT PRIMARY KEY, question_id TEXT NOT NULL, answer_text TEXT NOT NULL
			);
			INSERT INTO questions VALUES
			  ('owned-q', '{"import_owner":"${CHAINED_IMPORT_OWNER}"}'),
			  ('legacy-q', '{"source_pipeline":"legacy-import"}');
		`);

		const checklist = (text: string) =>
			upsertStatement(
				'mark_checklist_items',
				['id', 'question_id', 'display_order', 'text'],
				['owned-q-check-1', 'owned-q', 1, text],
				{ updateWhereSql: childOwnershipSql('mark_checklist_items') }
			);
		const modelAnswer = (answerText: string) =>
			upsertStatement(
				'model_answers',
				['id', 'question_id', 'answer_text'],
				['owned-q-model-answer', 'owned-q', answerText],
				{ updateWhereSql: childOwnershipSql('model_answers') }
			);

		const firstRun = [checklist('First checklist text'), modelAnswer('First model answer')];
		for (const diagnostic of importConflictDiagnosticStatements({ statements: firstRun })) {
			expect(database.prepare(diagnostic.diagnosticSql).get(...diagnostic.params)).toEqual({
				blocking_conflict_count: 0,
				blocking_conflict_ids: null
			});
		}
		for (const statement of firstRun) runStatement(database, statement);

		const secondRun = [checklist('Updated checklist text'), modelAnswer('Updated model answer')];
		for (const diagnostic of importConflictDiagnosticStatements({ statements: secondRun })) {
			expect(database.prepare(diagnostic.diagnosticSql).get(...diagnostic.params)).toEqual({
				blocking_conflict_count: 0,
				blocking_conflict_ids: null
			});
		}
		for (const statement of secondRun) runStatement(database, statement);
		expect(
			database.prepare("SELECT text FROM mark_checklist_items WHERE id = 'owned-q-check-1'").get()
		).toEqual({ text: 'Updated checklist text' });
		expect(
			database
				.prepare("SELECT answer_text FROM model_answers WHERE id = 'owned-q-model-answer'")
				.get()
		).toEqual({ answer_text: 'Updated model answer' });

		database.exec(`
			INSERT INTO mark_checklist_items VALUES
			  ('legacy-q-check-1', 'legacy-q', 1, 'Keep legacy checklist'),
			  ('owned-q-check-2', 'owned-q', 1, 'Keep malformed checklist');
			INSERT INTO model_answers VALUES
			  ('legacy-q-model-answer', 'legacy-q', 'Keep legacy model answer');
		`);
		const blocked = [
			upsertStatement(
				'mark_checklist_items',
				['id', 'question_id', 'display_order', 'text'],
				['legacy-q-check-1', 'legacy-q', 1, 'Adopt legacy checklist'],
				{ updateWhereSql: childOwnershipSql('mark_checklist_items') }
			),
			upsertStatement(
				'mark_checklist_items',
				['id', 'question_id', 'display_order', 'text'],
				['owned-q-check-2', 'owned-q', 2, 'Adopt malformed checklist'],
				{ updateWhereSql: childOwnershipSql('mark_checklist_items') }
			),
			upsertStatement(
				'model_answers',
				['id', 'question_id', 'answer_text'],
				['legacy-q-model-answer', 'legacy-q', 'Adopt legacy model answer'],
				{ updateWhereSql: childOwnershipSql('model_answers') }
			)
		];
		const blockedDiagnostics = importConflictDiagnosticStatements({ statements: blocked });
		const checklistDiagnostic = blockedDiagnostics.find(
			(statement) => statement.conflictTable === 'mark_checklist_items'
		);
		const modelDiagnostic = blockedDiagnostics.find(
			(statement) => statement.conflictTable === 'model_answers'
		);
		if (!checklistDiagnostic || !modelDiagnostic) throw new Error('Expected child diagnostics.');
		const checklistConflicts = database
			.prepare(checklistDiagnostic.diagnosticSql)
			.get(...checklistDiagnostic.params) as {
			blocking_conflict_count: number;
			blocking_conflict_ids: string;
		};
		expect(checklistConflicts.blocking_conflict_count).toBe(2);
		expect(new Set(checklistConflicts.blocking_conflict_ids.split(','))).toEqual(
			new Set(['legacy-q-check-1', 'owned-q-check-2'])
		);
		expect(database.prepare(modelDiagnostic.diagnosticSql).get(...modelDiagnostic.params)).toEqual({
			blocking_conflict_count: 1,
			blocking_conflict_ids: 'legacy-q-model-answer'
		});

		// The final SQL ownership predicates also fail closed if preflight is accidentally bypassed.
		for (const statement of blocked) runStatement(database, statement);
		expect(
			database.prepare("SELECT text FROM mark_checklist_items WHERE id = 'legacy-q-check-1'").get()
		).toEqual({ text: 'Keep legacy checklist' });
		expect(
			database
				.prepare(
					"SELECT display_order, text FROM mark_checklist_items WHERE id = 'owned-q-check-2'"
				)
				.get()
		).toEqual({ display_order: 1, text: 'Keep malformed checklist' });
		expect(
			database
				.prepare("SELECT answer_text FROM model_answers WHERE id = 'legacy-q-model-answer'")
				.get()
		).toEqual({ answer_text: 'Keep legacy model answer' });
		database.close();
	});

	it('refresh retires legacy practice routes and only invalidates changed question-page caches', () => {
		expect(materializerSource).not.toContain("routeKind: 'practice'");
		expect(materializerSource.indexOf("'materialize browse and home routes'")).toBeLessThan(
			materializerSource.indexOf("'retire legacy practice routes'")
		);
		const database = new DatabaseSync(':memory:');
		database.exec(`
			CREATE TABLE public_route_payloads (
			  id TEXT PRIMARY KEY, route_kind TEXT NOT NULL, route_path TEXT NOT NULL
			);
			INSERT INTO public_route_payloads VALUES
			  ('practice:owned-chain:keep', 'practice', '/practice/owned-chain/keep'),
			  ('practice:owned-chain:stale', 'practice', '/practice/owned-chain/stale'),
			  ('practice:foreign-chain:keep', 'practice', '/practice/foreign-chain/keep'),
			  ('question-practice-page:question-practice-page-v5:changed-question', 'question-practice-page', '/questions/changed-question/practice'),
			  ('question-practice-page:future-cache-version:changed-question', 'question-practice-page', '/questions/changed-question/practice'),
			  ('question-practice-page:question-practice-page-v3:other-question', 'question-practice-page', '/questions/other-question/practice'),
			  ('chains:browse', 'questions', '/questions'),
			  ('home:public-summary', 'home', '/');
		`);
		runStatement(database, deleteLegacyPracticePayloadsStatement());
		runStatement(database, invalidateQuestionPracticePayloadsStatement(['changed-question']));
		expect(database.prepare('SELECT id FROM public_route_payloads ORDER BY id').all()).toEqual([
			{ id: 'chains:browse' },
			{ id: 'home:public-summary' },
			{ id: 'question-practice-page:question-practice-page-v3:other-question' }
		]);
		database.close();
	});

	it('legacy route cleanup leaves canonical question-practice payloads intact', () => {
		const database = new DatabaseSync(':memory:');
		database.exec(`
			CREATE TABLE public_route_payloads (
			  id TEXT PRIMARY KEY, route_kind TEXT NOT NULL, route_path TEXT NOT NULL
			);
			INSERT INTO public_route_payloads VALUES
			  ('practice:kept-chain:kept-question', 'practice', '/practice/kept-chain/kept-question'),
			  ('practice:ineligible-chain:stale-question', 'practice', '/practice/ineligible-chain/stale-question'),
			  ('canonical-practice', 'question-practice-page', '/questions/kept-question/practice'),
			  ('chains:browse', 'questions', '/questions');
		`);
		runStatement(database, deleteLegacyPracticePayloadsStatement());
		expect(database.prepare('SELECT id FROM public_route_payloads ORDER BY id').all()).toEqual([
			{ id: 'canonical-practice' },
			{ id: 'chains:browse' }
		]);
		database.close();
	});

	it('full refresh cleanup removes obsolete versioned question-page caches', () => {
		const database = new DatabaseSync(':memory:');
		database.exec(`
			CREATE TABLE public_route_payloads (
			  id TEXT PRIMARY KEY,
			  route_kind TEXT NOT NULL,
			  route_path TEXT NOT NULL,
			  source_version TEXT
			);
			INSERT INTO public_route_payloads VALUES
			  ('old', 'question-practice-page', '/questions/old/practice', 'question-practice-page-v11'),
			  ('current', 'question-practice-page', '/questions/current/practice', 'question-practice-page-v13'),
			  ('browse', 'questions', '/questions', 'anything');
		`);
		runStatement(
			database,
			deleteStaleQuestionPracticePayloadVersionsStatement('question-practice-page-v13')
		);
		expect(database.prepare('SELECT id FROM public_route_payloads ORDER BY id').all()).toEqual([
			{ id: 'browse' },
			{ id: 'current' }
		]);
		database.close();
	});

	it('keeps the base rendering-overlay migration additive when schema setup is replayed', () => {
		const migration = readFileSync(
			path.join(rootDir, 'migrations/0001_public_content.sql'),
			'utf8'
		);
		expect(migration).toContain('CREATE TABLE IF NOT EXISTS question_rendering_overlays');
		expect(migration).not.toMatch(/DROP TABLE IF EXISTS question_rendering_overlays/i);
	});

	it('removes only proven-owned stale rows and preserves other-pipeline children on the same question', () => {
		const database = new DatabaseSync(':memory:');
		database.exec(`
			PRAGMA foreign_keys = ON;
			CREATE TABLE questions (id TEXT PRIMARY KEY, metadata_json TEXT NOT NULL);
			CREATE TABLE answer_chains (
			  id TEXT PRIMARY KEY,
			  created_by TEXT NOT NULL,
			  metadata_json TEXT NOT NULL
			);
			CREATE TABLE answer_chain_steps (
			  id TEXT PRIMARY KEY,
			  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
			  display_order INTEGER NOT NULL,
			  step_text TEXT NOT NULL,
			  UNIQUE (answer_chain_id, display_order)
			);
			CREATE TABLE question_answer_chains (
			  id TEXT PRIMARY KEY,
			  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
			  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
			  is_primary INTEGER NOT NULL,
			  metadata_json TEXT NOT NULL,
			  UNIQUE (question_id, answer_chain_id)
			);
			CREATE TABLE question_response_answer_keys (
			  id TEXT PRIMARY KEY, question_id TEXT NOT NULL, response_kind TEXT NOT NULL,
			  target_id TEXT NOT NULL, metadata_json TEXT NOT NULL,
			  UNIQUE (question_id, response_kind, target_id)
			);
			CREATE TABLE question_rendering_overlays (
			  id TEXT PRIMARY KEY, question_id TEXT NOT NULL, overlay_version TEXT NOT NULL,
			  source_document_id TEXT NOT NULL, source_question_ref TEXT NOT NULL,
			  provenance TEXT NOT NULL, render_json TEXT NOT NULL,
			  UNIQUE (question_id, overlay_version),
			  UNIQUE (source_document_id, source_question_ref, overlay_version)
			);
			CREATE TABLE mark_scheme_items (
			  id TEXT PRIMARY KEY, question_id TEXT NOT NULL, metadata_json TEXT NOT NULL
			);
			CREATE TABLE mark_checklist_items (
			  id TEXT PRIMARY KEY, question_id TEXT NOT NULL, display_order INTEGER NOT NULL
			);
			CREATE TABLE model_answers (
			  id TEXT PRIMARY KEY, question_id TEXT NOT NULL, derivation TEXT NOT NULL
			);
			CREATE TABLE common_weak_answers (
			  id TEXT PRIMARY KEY, question_id TEXT, source TEXT NOT NULL
			);
			CREATE TABLE chain_family_members (
			  id TEXT PRIMARY KEY, chain_family_id TEXT NOT NULL, answer_chain_id TEXT NOT NULL,
			  metadata_json TEXT NOT NULL,
			  UNIQUE (chain_family_id, answer_chain_id)
			);
			CREATE TABLE constellation_questions (
			  id TEXT PRIMARY KEY, constellation_id TEXT NOT NULL, question_id TEXT NOT NULL,
			  metadata_json TEXT NOT NULL,
			  UNIQUE (constellation_id, question_id)
			);
			CREATE TABLE answer_chain_illustrations (
			  id TEXT PRIMARY KEY,
			  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
			  source_question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
			  r2_key TEXT NOT NULL,
			  light_r2_key TEXT NOT NULL
			);
			INSERT INTO questions VALUES
			  ('owned-question', '{"import_owner":"${CHAINED_IMPORT_OWNER}","source_pipeline":"targeted_official_mark_scheme_repair"}'),
			  ('unrelated-question', '{"source_pipeline":"llm-vision-extracted"}');
			INSERT INTO answer_chains VALUES
			  ('owned-chain', 'extraction_agent', '{"import_owner":"${CHAINED_IMPORT_OWNER}"}'),
			  ('second-legitimate-chain', 'extraction_agent', '{"source":"semantic-chain-candidate"}'),
			  ('stale-chain', 'extraction_agent', '{"source":"semantic-chain-candidate"}'),
			  ('legacy-stale-chain', 'extraction_agent', '{"source":"semantic-chain-candidate"}'),
			  ('vision-chain', 'vision_agent', '{"source":"llm-vision-extracted"}'),
			  ('unrelated-chain', 'vision_agent', '{"source":"llm-vision-extracted"}');
			INSERT INTO answer_chain_steps VALUES
			  ('owned-chain-step-1', 'owned-chain', 1, 'Keep one'),
			  ('owned-chain-step-2', 'owned-chain', 2, 'Keep two'),
			  ('owned-chain-step-3', 'owned-chain', 3, 'Delete stale owned step'),
			  ('reviewer-note', 'owned-chain', 4, 'Preserve unknown foreign annotation'),
			  ('unrelated-chain-step-1', 'unrelated-chain', 1, 'Never touch');
			INSERT INTO question_answer_chains VALUES
			  ('owned-question--owned-chain', 'owned-question', 'owned-chain', 0, '{"import_owner":"${CHAINED_IMPORT_OWNER}","source":"constellation.questions"}'),
			  ('owned-question--second-legitimate-chain', 'owned-question', 'second-legitimate-chain', 1, '{"import_owner":"${CHAINED_IMPORT_OWNER}","source":"answer_chain.supporting_questions"}'),
			  ('owned-question--stale-chain', 'owned-question', 'stale-chain', 0, '{"import_owner":"${CHAINED_IMPORT_OWNER}","source":"constellation.questions"}'),
			  ('owned-question--legacy-stale-chain', 'owned-question', 'legacy-stale-chain', 0, '{"source":"constellation.questions"}'),
			  ('owned-question--vision-chain', 'owned-question', 'vision-chain', 0, '{"source":"llm-vision-extracted"}'),
			  ('unrelated-question--unrelated-chain', 'unrelated-question', 'unrelated-chain', 1, '{"source":"llm-vision-extracted"}');
			INSERT INTO question_response_answer_keys VALUES
			  ('official-key', 'owned-question', 'choice', 'answer', '{"source":"rendering_overlay_correct_answers"}');
			INSERT INTO question_rendering_overlays VALUES
			  ('legacy-overlay', 'owned-question', 'legacy-v1', 'doc', '01.1',
			   'structured-extraction-overlay', '{"metadata":{"source":"baseline-fallback"}}'),
			  ('owned-overlay', 'owned-question', 'owned-v1', 'doc', '01.2',
			   'structured-extraction-overlay',
			   '{"metadata":{"import_owner":"${CHAINED_IMPORT_OWNER}"}}');
			INSERT INTO mark_scheme_items VALUES
			  ('vision-mark', 'owned-question', '{"source":"llm-vision-extracted"}');
			INSERT INTO mark_checklist_items VALUES ('official-check', 'owned-question', 1);
			INSERT INTO model_answers VALUES
			  ('vision-model', 'owned-question', 'generated_from_mark_scheme');
			INSERT INTO common_weak_answers VALUES ('vision-weak', 'owned-question', 'agent');
			INSERT INTO chain_family_members VALUES
			  ('generated-stale', 'owned-chain-family', 'stale-chain', '{"import_owner":"${CHAINED_IMPORT_OWNER}","source":"semantic-chain-candidate"}'),
			  ('legacy-generated-stale', 'owned-chain-family', 'legacy-stale-chain', '{"source":"semantic-chain-candidate"}'),
			  ('manual-alternate', 'manual-family', 'owned-chain', '{"source":"semantic-chain-candidate"}');
			INSERT INTO constellation_questions VALUES
			  ('selected-stale', 'selected-constellation', 'owned-question', '{"import_owner":"${CHAINED_IMPORT_OWNER}"}'),
			  ('other-constellation', 'other-constellation', 'owned-question', '{"import_owner":"${CHAINED_IMPORT_OWNER}"}'),
			  ('other-question', 'selected-constellation', 'unrelated-question', '{"import_owner":"${CHAINED_IMPORT_OWNER}"}');
			INSERT INTO answer_chain_illustrations VALUES (
			  'approved-pair', 'owned-chain', 'owned-question',
			  'images/chains/approved-dark.webp', 'images/chains/approved-light.webp'
			);
		`);

		const plannedStatements = [
			upsertStatement(
				'answer_chain_steps',
				['id', 'answer_chain_id', 'display_order', 'step_text'],
				['owned-chain-step-1', 'owned-chain', 1, 'Keep one'],
				{ conflictColumns: ['answer_chain_id', 'display_order'] }
			),
			upsertStatement(
				'answer_chain_steps',
				['id', 'answer_chain_id', 'display_order', 'step_text'],
				['owned-chain-step-2', 'owned-chain', 2, 'Keep two'],
				{ conflictColumns: ['answer_chain_id', 'display_order'] }
			),
			upsertStatement(
				'question_answer_chains',
				['id', 'question_id', 'answer_chain_id', 'is_primary', 'metadata_json'],
				[
					'owned-question--owned-chain',
					'owned-question',
					'owned-chain',
					1,
					'{"import_owner":"${CHAINED_IMPORT_OWNER}","source":"constellation.questions"}'
				]
			),
			upsertStatement(
				'question_answer_chains',
				['id', 'question_id', 'answer_chain_id', 'is_primary', 'metadata_json'],
				[
					'owned-question--second-legitimate-chain',
					'owned-question',
					'second-legitimate-chain',
					0,
					'{"import_owner":"${CHAINED_IMPORT_OWNER}","source":"answer_chain.supporting_questions"}'
				]
			)
		];
		for (const statement of plannedStatements) runStatement(database, statement);
		const cleanup = scopedChildReconciliationStatements({
			statements: plannedStatements,
			importedQuestionIds: ['owned-question'],
			importedChainIds: ['owned-chain'],
			importedConstellationIds: ['selected-constellation']
		});
		const stepCleanup = cleanup.find(
			(statement) => statement.reconcileTable === 'answer_chain_steps'
		);
		const membershipCleanup = cleanup.find(
			(statement) => statement.reconcileTable === 'question_answer_chains'
		);
		if (!stepCleanup || !membershipCleanup) throw new Error('Expected scoped cleanup statements.');
		expect(database.prepare(stepCleanup.diagnosticSql).get(...stepCleanup.params)).toEqual({
			owned_stale_count: 1,
			preserved_unowned_count: 1
		});
		expect(
			database.prepare(membershipCleanup.diagnosticSql).get(...membershipCleanup.params)
		).toEqual({
			owned_stale_count: 1,
			preserved_unowned_count: 2
		});
		for (const table of [
			'answer_chain_steps',
			'question_answer_chains',
			'question_rendering_overlays',
			'question_response_answer_keys',
			'mark_scheme_items',
			'mark_checklist_items',
			'model_answers',
			'common_weak_answers',
			'constellation_questions',
			'chain_family_members'
		]) {
			const statement = cleanup.find((candidate) => candidate.reconcileTable === table);
			if (!statement) throw new Error(`Expected ${table} cleanup.`);
			database.prepare(statement.sql).run(...statement.params);
		}

		expect(database.prepare('SELECT id FROM answer_chain_steps ORDER BY id').all()).toEqual([
			{ id: 'owned-chain-step-1' },
			{ id: 'owned-chain-step-2' },
			{ id: 'reviewer-note' },
			{ id: 'unrelated-chain-step-1' }
		]);
		expect(
			database.prepare('SELECT id, is_primary FROM question_answer_chains ORDER BY id').all()
		).toEqual([
			{ id: 'owned-question--legacy-stale-chain', is_primary: 0 },
			{ id: 'owned-question--owned-chain', is_primary: 1 },
			{ id: 'owned-question--second-legitimate-chain', is_primary: 0 },
			{ id: 'owned-question--vision-chain', is_primary: 0 },
			{ id: 'unrelated-question--unrelated-chain', is_primary: 1 }
		]);
		expect(database.prepare('SELECT id FROM question_response_answer_keys').all()).toEqual([
			{ id: 'official-key' }
		]);
		expect(database.prepare('SELECT id FROM question_rendering_overlays').all()).toEqual([
			{ id: 'legacy-overlay' }
		]);
		expect(database.prepare('SELECT id FROM mark_scheme_items').all()).toEqual([
			{ id: 'vision-mark' }
		]);
		expect(database.prepare('SELECT id FROM mark_checklist_items').all()).toEqual([
			{ id: 'official-check' }
		]);
		expect(database.prepare('SELECT id FROM model_answers').all()).toEqual([
			{ id: 'vision-model' }
		]);
		expect(database.prepare('SELECT id FROM common_weak_answers').all()).toEqual([
			{ id: 'vision-weak' }
		]);
		expect(database.prepare('SELECT id FROM chain_family_members ORDER BY id').all()).toEqual([
			{ id: 'legacy-generated-stale' },
			{ id: 'manual-alternate' }
		]);
		expect(database.prepare('SELECT id FROM constellation_questions ORDER BY id').all()).toEqual([
			{ id: 'other-constellation' },
			{ id: 'other-question' }
		]);
		expect(database.prepare('SELECT * FROM answer_chain_illustrations').get()).toEqual(
			expect.objectContaining({
				id: 'approved-pair',
				r2_key: 'images/chains/approved-dark.webp',
				light_r2_key: 'images/chains/approved-light.webp'
			})
		);
		database.close();
	});

	it('replaces a renamed owned step by its UNIQUE slot and blocks the same collision on a foreign chain', () => {
		const database = new DatabaseSync(':memory:');
		database.exec(`
			CREATE TABLE answer_chains (
			  id TEXT PRIMARY KEY,
			  created_by TEXT NOT NULL,
			  metadata_json TEXT NOT NULL
			);
			CREATE TABLE answer_chain_steps (
			  id TEXT PRIMARY KEY,
			  answer_chain_id TEXT NOT NULL,
			  display_order INTEGER NOT NULL,
			  step_text TEXT NOT NULL,
			  UNIQUE (answer_chain_id, display_order)
			);
			INSERT INTO answer_chains VALUES
			  ('owned-chain', 'extraction_agent', '{"import_owner":"${CHAINED_IMPORT_OWNER}"}'),
			  ('vision-chain', 'vision_agent', '{"source":"llm-vision-extracted"}');
			INSERT INTO answer_chain_steps VALUES
			  ('owned-chain-step-9', 'owned-chain', 1, 'Old wording'),
			  ('vision-step', 'vision-chain', 1, 'Vision wording');
		`);

		const ownedReplacement = upsertStatement(
			'answer_chain_steps',
			['id', 'answer_chain_id', 'display_order', 'step_text'],
			['owned-chain-step-1', 'owned-chain', 1, 'Reviewed wording'],
			{
				conflictColumns: ['answer_chain_id', 'display_order'],
				updateWhereSql: childOwnershipSql('answer_chain_steps')
			}
		);
		const foreignReplacement = upsertStatement(
			'answer_chain_steps',
			['id', 'answer_chain_id', 'display_order', 'step_text'],
			['vision-chain-step-1', 'vision-chain', 1, 'Do not overwrite'],
			{
				conflictColumns: ['answer_chain_id', 'display_order'],
				updateWhereSql: childOwnershipSql('answer_chain_steps')
			}
		);
		const diagnostics = importConflictDiagnosticStatements({
			statements: [ownedReplacement, foreignReplacement]
		});
		const stepDiagnostic = diagnostics.find(
			(statement) => statement.conflictTable === 'answer_chain_steps'
		);
		if (!stepDiagnostic) throw new Error('Expected answer-chain step conflict diagnostic.');
		expect(database.prepare(stepDiagnostic.diagnosticSql).get(...stepDiagnostic.params)).toEqual({
			blocking_conflict_count: 1,
			blocking_conflict_ids: 'vision-step'
		});

		// The secondary-key target updates the primary id atomically instead of first violating UNIQUE.
		runStatement(database, ownedReplacement);
		expect(
			database
				.prepare(
					"SELECT id, step_text FROM answer_chain_steps WHERE answer_chain_id = 'owned-chain'"
				)
				.get()
		).toEqual({ id: 'owned-chain-step-1', step_text: 'Reviewed wording' });

		// Even if a caller ignored preflight, the database-side ownership predicate is fail-closed.
		runStatement(database, foreignReplacement);
		expect(
			database
				.prepare(
					"SELECT id, step_text FROM answer_chain_steps WHERE answer_chain_id = 'vision-chain'"
				)
				.get()
		).toEqual({ id: 'vision-step', step_text: 'Vision wording' });
		database.close();
	});

	it('round-trips stable model-answer evidence ids and the curated chain summary', () => {
		const repairedQuestions = new Map(
			applyScopedQuestionRepairs(baseline.questions, repair).map((question) => [
				question.id,
				question
			])
		);
		const alloy = repairedQuestions.get('8464c1h-jun22-05-3');
		if (!alloy) throw new Error('Scoped alloy question was not found.');
		const evidenceIds = modelAnswerSupportingMarkSchemeIds(
			alloy.id,
			alloy.mark_scheme_items.length,
			alloy.model_answer
		);
		expect(evidenceIds).toEqual([
			'8464c1h-jun22-05-3-ms-1',
			'8464c1h-jun22-05-3-ms-2',
			'8464c1h-jun22-05-3-ms-3',
			'8464c1h-jun22-05-3-ms-4'
		]);

		const repairedChains = new Map(
			applyScopedChainRepairs(physics.answer_chain_candidates, repair).map((chain) => [
				chain.id,
				chain
			])
		);
		const gridChain = repairedChains.get('physics-chain-grid-transformer-efficiency');
		if (!gridChain) throw new Error('Scoped grid chain was not found.');
		expect(chainSummaryForImport(gridChain)).toBe(
			'Higher potential difference lowers current and cable heating, so more energy reaches consumers.'
		);
		expect(
			gridChain.steps.map((step: { id: string; step_text: string }) => [step.id, step.step_text])
		).toEqual([
			['physics-chain-grid-transformer-efficiency-step-1', 'Step-up potential difference'],
			['physics-chain-grid-transformer-efficiency-step-2', 'Lower current'],
			['physics-chain-grid-transformer-efficiency-step-3', 'Less cable heating'],
			['physics-chain-grid-transformer-efficiency-step-4', 'Higher efficiency']
		]);
		expect(gridChain.steps[0].supporting_evidence).toHaveLength(2);
		expect(gridChain.steps[3].step_role).toBe('conclusion');
	});

	it('reapplies tracked generic omission patches even when generated physics data is reverted', () => {
		const revertedPhysics = structuredClone(physics);
		const oldOmissions = new Map([
			[
				'physics-chain-circuit-power-pd-current-calculation',
				'Substitutes 6.9 for 6.9 kW, 240 for 240 mW, or 290 for 290 mA.'
			],
			['physics-chain-work-done-force-distance-calculation', 'Uses 15 mm as 15 m.'],
			['physics-chain-ohms-law-calculation', 'Substitutes 480 as amps instead of 0.480 A.']
		]);
		for (const chain of revertedPhysics.answer_chain_candidates) {
			const oldOmission = oldOmissions.get(chain.id);
			if (oldOmission) chain.steps[1].common_omission = oldOmission;
		}
		const repairedChains = new Map(
			applyScopedChainRepairs(revertedPhysics.answer_chain_candidates, repair).map((chain) => [
				chain.id,
				chain
			])
		);
		expect(
			repairedChains.get('physics-chain-circuit-power-pd-current-calculation')?.steps[1]
				.common_omission
		).toBe('Treats kilo- or milli-prefixed values as though they were already in base units.');
		expect(
			repairedChains.get('physics-chain-work-done-force-distance-calculation')?.steps[1]
				.common_omission
		).toBe('Treats a millimetre value as though it were already in metres.');
		expect(repairedChains.get('physics-chain-ohms-law-calculation')?.steps[1].common_omission).toBe(
			'Treats a milliamp value as though it were already in amps.'
		);
	});
});

describe('scoped chained repair contract', () => {
	it('applies reviewed atomic titles and prompts under the exact schema version', () => {
		expect(repair.schemaVersion).toBe(SCOPED_REPAIR_SCHEMA_VERSION);
		const repairedQuestions = new Map(
			applyScopedQuestionRepairs(baseline.questions, repair).map((question) => [
				question.id,
				question
			])
		);
		expect(repairedQuestions.get('8464b1h-nov20-04-2')?.card_title).toBe(
			'Vaccine protection against gonorrhoea'
		);
		const measles = repairedQuestions.get('8464b1h-jun24-03-3');
		if (!measles) throw new Error('Scoped measles question was not found.');
		expect(atomicQuestionPromptForImport(measles)).toBe(measles.prompt_text);
		expect(atomicQuestionPromptForImport(measles)).toMatch(/\[4 marks\]\s*$/);
		expect(JSON.stringify(measles)).not.toContain('Norovirus is a type of virus.');
		expect(JSON.stringify(measles)).not.toContain('Explain how viruses cause illness.');
		expect(measles.parent_stem).toBe(
			'This question is about communicable diseases.\nMeasles is a communicable disease caused by a pathogen.'
		);
		expect(measles.context_blocks).toEqual([
			{
				kind: 'parent_stem',
				text: 'This question is about communicable diseases.\nMeasles is a communicable disease caused by a pathogen.',
				required: true
			}
		]);
		expect(atomicQuestionPromptForImport(measles)).not.toContain(
			'This question is about communicable diseases.'
		);
		expect(repairedQuestions.get('8464c1h-jun22-05-3')?.card_title).toBe(
			'Adding other metals to aluminium'
		);
		const plantTissue = repairedQuestions.get('8464b1h-jun24-04-6');
		if (!plantTissue) throw new Error('Scoped plant-tissue question was not found.');
		expect(plantTissue.answer_format).toBe('choice');
		expect(plantTissue.response).toMatchObject({
			kind: 'choice',
			options: ['Epidermis', 'Meristem', 'Mesophyll', 'Phloem'],
			maxSelections: 1,
			correctAnswers: { answer: 'Meristem' }
		});
		expect(plantTissue.prompt_text).not.toContain('Phloem');
		expect(plantTissue.prompt_text).not.toMatch(/\b10\s*$/);
		expect(plantTissue.model_answer).toBeNull();
	});

	it('removes following-sibling setup if the generated baseline regresses', () => {
		const leakedSentence = 'Norovirus is a type of virus.';
		const regressedQuestions = baseline.questions.map((question: Record<string, unknown>) => {
			if (question.id !== '8464b1h-jun24-03-3') return question;
			return {
				...question,
				prompt_text: `${question.prompt_text}\n${leakedSentence}`,
				parent_stem: `${question.parent_stem}\n${leakedSentence}`,
				self_contained_prompt_text: `${question.self_contained_prompt_text}\n${leakedSentence}`,
				self_contained_prompt_markdown: `${question.self_contained_prompt_markdown}\n${leakedSentence}`,
				full_prompt_text: `${question.full_prompt_text}\n${leakedSentence}`,
				context_blocks: [{ kind: 'parent_stem', text: leakedSentence, required: true }]
			};
		});
		const measles = applyScopedQuestionRepairs(regressedQuestions, repair).find(
			(question) => question.id === '8464b1h-jun24-03-3'
		);
		expect(measles).toBeDefined();
		expect(JSON.stringify(measles)).not.toContain(leakedSentence);
		expect(atomicQuestionPromptForImport(measles!)).toMatch(/\[4 marks\]\s*$/);
	});

	it('rejects schema drift, duplicate ids, and identity changes', () => {
		expect(() =>
			applyScopedQuestionRepairs(baseline.questions, { ...repair, schemaVersion: 'v3' })
		).toThrow(/schema must be exactly/);
		expect(() =>
			applyScopedQuestionRepairs(baseline.questions, {
				...repair,
				questions: [repair.questions[0], repair.questions[0]]
			})
		).toThrow(/duplicate id/);
		expect(() =>
			applyScopedQuestionRepairs(baseline.questions, {
				...repair,
				questions: [{ ...repair.questions[0], source_question_ref: '99.9' }]
			})
		).toThrow(/cannot change identity field source_question_ref/);
	});

	it('requires exact chain step-id coverage without positional fallback or truncation', () => {
		const missingStep = structuredClone(repair);
		missingStep.chains[0].steps = missingStep.chains[0].steps.slice(0, 2);
		expect(() => applyScopedChainRepairs(physics.answer_chain_candidates, missingStep)).toThrow(
			/exact source step-id set/
		);

		const duplicateStep = structuredClone(repair);
		duplicateStep.chains[0].steps[1].id = duplicateStep.chains[0].steps[0].id;
		expect(() => applyScopedChainRepairs(physics.answer_chain_candidates, duplicateStep)).toThrow(
			/duplicate id/
		);

		const unknownStep = structuredClone(repair);
		unknownStep.chains[0].steps[2].id = 'physics-chain-grid-transformer-efficiency-step-99';
		expect(() => applyScopedChainRepairs(physics.answer_chain_candidates, unknownStep)).toThrow(
			/exact source step-id set/
		);

		const unreviewedExtension = structuredClone(repair);
		delete unreviewedExtension.chains[0].stepMode;
		expect(() =>
			applyScopedChainRepairs(physics.answer_chain_candidates, unreviewedExtension)
		).toThrow(/exact source step-id set/);

		const nonConclusionExtension = structuredClone(repair);
		nonConclusionExtension.chains[0].steps[3].step_role = 'effect';
		expect(() =>
			applyScopedChainRepairs(physics.answer_chain_candidates, nonConclusionExtension)
		).toThrow(/unique conclusion step/);

		const fifthStep = structuredClone(repair);
		fifthStep.chains[0].steps.push({
			id: 'physics-chain-grid-transformer-efficiency-step-5',
			step_text: 'Another conclusion',
			step_role: 'conclusion'
		});
		expect(() => applyScopedChainRepairs(physics.answer_chain_candidates, fifthStep)).toThrow(
			/exactly one conclusion step/
		);
	});

	it('rejects duplicate, unknown, or over-broad named step patches', () => {
		const duplicate = structuredClone(repair);
		duplicate.stepPatches = [duplicate.stepPatches[0], duplicate.stepPatches[0]];
		expect(() => applyScopedChainRepairs(physics.answer_chain_candidates, duplicate)).toThrow(
			/duplicate target/
		);

		const unknown = structuredClone(repair);
		unknown.stepPatches[0].step_id = 'physics-chain-circuit-power-pd-current-calculation-step-99';
		expect(() => applyScopedChainRepairs(physics.answer_chain_candidates, unknown)).toThrow(
			/unknown step id/
		);

		const overBroad = structuredClone(repair);
		overBroad.stepPatches[0].supporting_evidence = [];
		expect(() => applyScopedChainRepairs(physics.answer_chain_candidates, overBroad)).toThrow(
			/unsupported fields/
		);
	});
});
