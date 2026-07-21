import { gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
	PHYSICS_QUESTION_ID_RECONCILIATION,
	buildPhysicsFingerprintTransition,
	buildPhysicsQuestionIdReconciliationPlan,
	buildPublishedPrimaryFingerprintRebasePlan,
	decodePublicRoutePayload,
	inspectPhysicsQuestionIdState,
	projectPhysicsFingerprintIdentity,
	validateD1TransactionalBatchResponse,
	validatePhysicsIllustrationFingerprintState,
	validatePhysicsIllustrationsAfterFingerprintRebase,
	validatePhysicsIllustrationsAfterIdentityPhase,
	validatePhysicsQuestionIdPreflight
} from '../../../scripts/lib/physics-question-id-reconciliation.mjs';
import {
	normalizedSourceFingerprintInput,
	sourceFingerprint
} from '../../../scripts/lib/chain-illustration-pipeline.mjs';

const oldId = PHYSICS_QUESTION_ID_RECONCILIATION.placeholderQuestionId;
const canonicalId = PHYSICS_QUESTION_ID_RECONCILIATION.canonicalQuestionId;

describe('Physics question-id reconciliation', () => {
	it('atomically renames the question, generated child ids, JSON references, illustrations and route payloads', async () => {
		const database = fixtureDatabase();
		const before = await inspect(database);
		const plan = buildPhysicsQuestionIdReconciliationPlan(before);

		expect(plan.status).toBe('ready');
		expect(plan.summary.affectedRowsByTable).toMatchObject({
			questions: 1,
			mark_scheme_items: 1,
			mark_checklist_items: 1,
			model_answers: 1,
			question_answer_chains: 1,
			common_weak_answers: 1,
			answer_chain_steps: 1,
			answer_chain_illustrations: 1
		});
		expect(plan.summary.affectedRoutePayloads).toHaveLength(2);

		applyTransaction(database, plan.statements);

		expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
		expect(database.prepare('SELECT id, slug FROM questions').all()).toEqual([
			{ id: canonicalId, slug: canonicalId }
		]);
		expect(database.prepare('SELECT id, question_id FROM mark_scheme_items').all()).toEqual([
			{ id: `${canonicalId}-ms-1`, question_id: canonicalId }
		]);
		expect(
			database
				.prepare('SELECT id, question_id, mark_scheme_item_ids_json FROM mark_checklist_items')
				.all()
		).toEqual([
			{
				id: `${canonicalId}-check-1`,
				question_id: canonicalId,
				mark_scheme_item_ids_json: JSON.stringify([`${canonicalId}-ms-1`])
			}
		]);
		expect(
			database
				.prepare('SELECT id, question_id, supporting_mark_scheme_item_ids_json FROM model_answers')
				.all()
		).toEqual([
			{
				id: `${canonicalId}-model-answer`,
				question_id: canonicalId,
				supporting_mark_scheme_item_ids_json: JSON.stringify([`${canonicalId}-ms-1`])
			}
		]);
		expect(
			database
				.prepare('SELECT supported_by_mark_scheme_item_ids_json FROM answer_chain_steps')
				.get()
		).toEqual({
			supported_by_mark_scheme_item_ids_json: JSON.stringify([`${canonicalId}-ms-1`])
		});
		expect(
			database
				.prepare(
					'SELECT source_question_id, generation_metadata_json FROM answer_chain_illustrations'
				)
				.get()
		).toEqual({
			source_question_id: canonicalId,
			generation_metadata_json: JSON.stringify({
				sourceFingerprint: fixtureCandidate(oldId).sourceFingerprint,
				decision: {
					representativeQuestionId: canonicalId,
					evidenceByQuestion: [
						{ questionId: canonicalId, markSchemeItemIds: [`${canonicalId}-ms-1`] }
					]
				}
			})
		});

		const routes = database
			.prepare(
				'SELECT id, route_path, payload_json, source_version, updated_at FROM public_route_payloads ORDER BY id'
			)
			.all() as Array<Record<string, string>>;
		expect(routes.map((route) => route.id)).toEqual([
			'chains:browse',
			`question-practice-page-v3:${canonicalId}`
		]);
		for (const route of routes) {
			expect(route.source_version).toBe(
				route.id === 'chains:browse' ? 'chains-materialization-v1' : 'question-practice-page-v3'
			);
			expect(route.updated_at).toBe(plan.routeUpdatedAt);
			expect(route.route_path).not.toContain(oldId);
			expect(JSON.stringify(decodePublicRoutePayload(route.payload_json).value)).not.toContain(
				oldId
			);
			expect(JSON.stringify(decodePublicRoutePayload(route.payload_json).value)).toContain(
				canonicalId
			);
		}
		const chainBrowsePayload = decodePublicRoutePayload(
			routes.find((route) => route.id === 'chains:browse')!.payload_json
		).value as { questionsById: Record<string, { id: string }> };
		expect(chainBrowsePayload.questionsById[canonicalId]).toEqual({ id: canonicalId });

		const after = await inspect(database);
		expect(validatePhysicsQuestionIdPreflight(after)).toEqual({ status: 'passed', issues: [] });
		expect(buildPhysicsQuestionIdReconciliationPlan(after).status).toBe('already-reconciled');
		database.close();
	});

	it('fails preflight instead of merging an existing canonical question', async () => {
		const database = fixtureDatabase();
		database
			.prepare(
				`INSERT INTO questions (
				   id, source_document_id, source_question_ref, slug, subject_area, component_code, prompt_text
				 ) VALUES (?, 'aqa-8464p1h-qp-jun22', '01.4', ?, 'Physics', '8464P1H', 'Duplicate')`
			)
			.run(canonicalId, canonicalId);
		const state = await inspect(database);
		const validation = validatePhysicsQuestionIdPreflight(state);
		expect(validation.status).toBe('failed');
		expect(validation.issues).toContain(
			'Both placeholder and canonical questions exist; refusing to merge them.'
		);
		expect(() => buildPhysicsQuestionIdReconciliationPlan(state)).toThrow(
			'Physics question-id preflight failed'
		);
		database.close();
	});

	it('rolls the complete sequence back if state changes after preflight', async () => {
		const database = fixtureDatabase();
		const plan = buildPhysicsQuestionIdReconciliationPlan(await inspect(database));
		database
			.prepare('UPDATE public_route_payloads SET payload_json = ? WHERE id = ?')
			.run(JSON.stringify({ changedAfterPreflight: oldId }), `question-practice-page-v3:${oldId}`);

		expect(() => applyTransaction(database, plan.statements)).toThrow();
		expect(
			database.prepare('SELECT COUNT(*) AS count FROM questions WHERE id = ?').get(oldId)
		).toEqual({ count: 1 });
		expect(
			database.prepare('SELECT COUNT(*) AS count FROM questions WHERE id = ?').get(canonicalId)
		).toEqual({ count: 0 });
		database.close();
	});

	it('rejects a newly materialized compressed route created after preflight', async () => {
		const database = fixtureDatabase();
		const plan = buildPhysicsQuestionIdReconciliationPlan(await inspect(database));
		database
			.prepare(
				'INSERT INTO public_route_payloads (id, route_kind, route_path, payload_json, source_version) VALUES (?, ?, ?, ?, ?)'
			)
			.run(
				'late-compressed-route',
				'question-practice-page',
				'/late-compressed-route',
				JSON.stringify({
					__qcPayloadEncoding: 'gzip-base64',
					data: gzipSync(Buffer.from(JSON.stringify({ questionId: oldId }))).toString('base64')
				}),
				'late-v1'
			);

		expect(() => applyTransaction(database, plan.statements)).toThrow();
		expect(
			database.prepare('SELECT COUNT(*) AS count FROM questions WHERE id = ?').get(oldId)
		).toEqual({ count: 1 });
		expect(
			database.prepare('SELECT COUNT(*) AS count FROM questions WHERE id = ?').get(canonicalId)
		).toEqual({ count: 0 });
		database.close();
	});

	it('rejects an illustration asset mutation after the preflight snapshot', async () => {
		const database = fixtureDatabase();
		const plan = buildPhysicsQuestionIdReconciliationPlan(await inspect(database));
		database
			.prepare('UPDATE answer_chain_illustrations SET asset_sha256 = ? WHERE is_primary = 1')
			.run('changed-after-preflight');

		expect(() => applyTransaction(database, plan.statements)).toThrow();
		expect(
			database.prepare('SELECT COUNT(*) AS count FROM questions WHERE id = ?').get(oldId)
		).toEqual({ count: 1 });
		expect(
			database.prepare('SELECT COUNT(*) AS count FROM questions WHERE id = ?').get(canonicalId)
		).toEqual({ count: 0 });
		database.close();
	});

	it('projects only allowlisted fingerprint identity leaves and records every changed path', () => {
		const oldCandidate = fixtureCandidate(oldId);
		const transition = buildPhysicsFingerprintTransition(oldCandidate, 'placeholder');
		const canonicalCandidate = fixtureCandidate(canonicalId, transition.oldFingerprint);

		expect(transition.oldFingerprint).toBe(oldCandidate.sourceFingerprint);
		expect(transition.canonicalFingerprint).toBe(canonicalCandidate.sourceFingerprint);
		expect(transition.canonicalFingerprint).not.toBe(transition.oldFingerprint);
		expect(transition.changedPaths.map((change) => change.path)).toEqual([
			'members[0].questionId',
			'members[0].markSchemeItems[0].id',
			'members[0].checklistItems[0].id',
			'members[0].checklistItems[0].markSchemeItemIds[0]',
			'members[0].modelAnswers[0].id',
			'members[0].modelAnswers[0].supportingMarkSchemeItemIds[0]'
		]);
		expect(transition.canonicalInput).toEqual(normalizedSourceFingerprintInput(canonicalCandidate));
		expect(transition.legacyOldFingerprint).not.toBe(transition.oldFingerprint);
		expect(transition.legacyCanonicalFingerprint).not.toBe(transition.canonicalFingerprint);
		expect(transition.legacyChangedPaths.map((change) => change.path)).toEqual(
			transition.changedPaths.map((change) => change.path)
		);

		const invalidInput = structuredClone(normalizedSourceFingerprintInput(oldCandidate));
		invalidInput.chain.title = `Unexpected ${oldId}`;
		expect(() => projectPhysicsFingerprintIdentity(invalidInput)).toThrow(
			'non-allowlisted fingerprint path chain.title'
		);
	});

	it('accepts only a reconstructed legacy primary hash and rebases it to the expanded hash', () => {
		const canonicalCandidate = fixtureCandidate(canonicalId);
		const transition = buildPhysicsFingerprintTransition(canonicalCandidate, 'canonical');
		canonicalCandidate.existingSourceFingerprint = transition.legacyCanonicalFingerprint;
		const legacyPrimary = {
			id: 'chain-illustration-grid',
			answer_chain_id: 'physics-chain-grid-transformer-efficiency',
			source_question_id: canonicalId,
			source_fingerprint: transition.legacyCanonicalFingerprint,
			generation_metadata_json: JSON.stringify({
				sourceFingerprint: transition.legacyCanonicalFingerprint
			}),
			status: 'published',
			is_primary: 1,
			needs_human_review: 0
		};

		const state = validatePhysicsIllustrationFingerprintState(canonicalCandidate, transition, [
			legacyPrimary
		]);
		expect(state).toMatchObject({ status: 'passed', phase: 'fingerprint-rebase-pending' });
		const rebase = buildPublishedPrimaryFingerprintRebasePlan({
			illustrationRows: [legacyPrimary],
			primaryId: legacyPrimary.id,
			oldFingerprint: transition.legacyCanonicalFingerprint,
			canonicalFingerprint: transition.canonicalFingerprint
		});
		expect(rebase.expectedPrimary).toMatchObject({
			source_fingerprint: transition.canonicalFingerprint
		});
		expect(JSON.parse(rebase.generationMetadataJson).sourceFingerprint).toBe(
			transition.canonicalFingerprint
		);

		const unproved = { ...legacyPrimary, source_fingerprint: 'f'.repeat(64) };
		canonicalCandidate.existingSourceFingerprint = unproved.source_fingerprint;
		expect(
			validatePhysicsIllustrationFingerprintState(canonicalCandidate, transition, [unproved])
		).toMatchObject({ status: 'failed' });
	});

	it('rebases only the exact published primary fingerprint after the identity transaction', async () => {
		const oldCandidate = fixtureCandidate(oldId);
		const transition = buildPhysicsFingerprintTransition(oldCandidate, 'placeholder');
		const database = fixtureDatabase({ includeHistoricalDraft: true, oldCandidate });
		const before = await inspect(database);
		const primaryBefore = before.illustrationRows.find(
			(row) => row.status === 'published' && row.is_primary === 1
		)!;
		const immutablePrimaryBefore = protectedIllustrationValues(primaryBefore);

		applyTransaction(database, buildPhysicsQuestionIdReconciliationPlan(before).statements);
		const afterIdentity = await inspect(database);
		expect(
			validatePhysicsIllustrationsAfterIdentityPhase(
				before.illustrationRows,
				afterIdentity.illustrationRows
			)
		).toMatchObject({ status: 'passed', issues: [] });

		const canonicalCandidate = fixtureCandidate(canonicalId, transition.oldFingerprint);
		const canonicalTransition = buildPhysicsFingerprintTransition(canonicalCandidate, 'canonical');
		const fingerprintState = validatePhysicsIllustrationFingerprintState(
			canonicalCandidate,
			canonicalTransition,
			afterIdentity.illustrationRows
		);
		expect(fingerprintState).toMatchObject({
			status: 'passed',
			phase: 'fingerprint-rebase-pending'
		});
		const rebase = buildPublishedPrimaryFingerprintRebasePlan({
			illustrationRows: afterIdentity.illustrationRows,
			primaryId: fingerprintState.primary!.id,
			oldFingerprint: transition.oldFingerprint,
			canonicalFingerprint: transition.canonicalFingerprint
		});
		expect(rebase.statements).toHaveLength(2);
		applyTransaction(database, rebase.statements);

		const after = await inspect(database);
		expect(
			validatePhysicsIllustrationsAfterFingerprintRebase(
				before.illustrationRows,
				after.illustrationRows,
				{
					primaryId: fingerprintState.primary!.id,
					oldFingerprint: transition.oldFingerprint,
					canonicalFingerprint: transition.canonicalFingerprint
				}
			)
		).toMatchObject({ status: 'passed', issues: [] });
		const primaryAfter = after.illustrationRows.find(
			(row) => row.id === fingerprintState.primary!.id
		)!;
		expect(primaryAfter.source_fingerprint).toBe(transition.canonicalFingerprint);
		expect(JSON.parse(primaryAfter.generation_metadata_json).sourceFingerprint).toBe(
			transition.canonicalFingerprint
		);
		expect(protectedIllustrationValues(primaryAfter)).toEqual(immutablePrimaryBefore);
		const historicalDraft = after.illustrationRows.find(
			(row) => row.id === 'chain-illustration-grid-historical'
		)!;
		expect(historicalDraft.source_fingerprint).toBe('historical-draft-fingerprint');
		expect(JSON.parse(historicalDraft.generation_metadata_json)).toMatchObject({
			sourceFingerprint: 'historical-draft-fingerprint',
			decision: { representativeQuestionId: canonicalId }
		});
		expect(historicalDraft.status).toBe('draft');
		expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
		database.close();
	});

	it('requires explicit success=true for the D1 batch envelope and every statement', () => {
		expect(
			validateD1TransactionalBatchResponse(
				{ success: true, result: [{ success: true }, { success: true }] },
				2
			)
		).toHaveLength(2);
		expect(() => validateD1TransactionalBatchResponse({ result: [{ success: true }] }, 1)).toThrow(
			'transactional batch failed'
		);
		expect(() => validateD1TransactionalBatchResponse({ success: true, result: [{}] }, 1)).toThrow(
			'without success=true'
		);
		expect(() =>
			validateD1TransactionalBatchResponse({ success: true, result: { success: true } }, 1)
		).toThrow('non-array result');
	});
});

function fixtureDatabase({
	includeHistoricalDraft = false,
	oldCandidate = fixtureCandidate(oldId)
}: {
	includeHistoricalDraft?: boolean;
	oldCandidate?: ReturnType<typeof fixtureCandidate>;
} = {}) {
	const database = new DatabaseSync(':memory:');
	database.exec(`
		PRAGMA foreign_keys = ON;
		CREATE TABLE source_documents (id TEXT PRIMARY KEY);
		CREATE TABLE questions (
		  id TEXT PRIMARY KEY,
		  source_document_id TEXT NOT NULL REFERENCES source_documents(id),
		  source_question_ref TEXT NOT NULL,
		  slug TEXT NOT NULL UNIQUE,
		  subject_area TEXT NOT NULL,
		  component_code TEXT NOT NULL,
		  prompt_text TEXT NOT NULL
		);
		CREATE TABLE answer_chains (id TEXT PRIMARY KEY);
		CREATE TABLE mark_scheme_items (
		  id TEXT PRIMARY KEY,
		  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
		  text TEXT NOT NULL,
		  metadata_json TEXT NOT NULL DEFAULT '{}'
		);
		CREATE TABLE mark_checklist_items (
		  id TEXT PRIMARY KEY,
		  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
		  mark_scheme_item_ids_json TEXT NOT NULL
		);
		CREATE TABLE model_answers (
		  id TEXT PRIMARY KEY,
		  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
		  answer_text TEXT NOT NULL,
		  supporting_mark_scheme_item_ids_json TEXT NOT NULL
		);
		CREATE TABLE question_answer_chains (
		  id TEXT PRIMARY KEY,
		  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
		  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
		  UNIQUE(question_id, answer_chain_id)
		);
		CREATE TABLE common_weak_answers (
		  id TEXT PRIMARY KEY,
		  question_id TEXT REFERENCES questions(id) ON DELETE CASCADE,
		  answer_chain_id TEXT REFERENCES answer_chains(id) ON DELETE CASCADE,
		  weak_answer_text TEXT NOT NULL,
		  missing_chain_step_ids_json TEXT NOT NULL
		);
		CREATE TABLE answer_chain_steps (
		  id TEXT PRIMARY KEY,
		  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
		  supported_by_mark_scheme_item_ids_json TEXT NOT NULL,
		  evidence_json TEXT NOT NULL DEFAULT '[]'
		);
		CREATE TABLE answer_chain_illustrations (
		  id TEXT PRIMARY KEY,
		  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
		  source_question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
		  r2_key TEXT NOT NULL UNIQUE,
		  public_path TEXT NOT NULL UNIQUE,
		  light_r2_key TEXT,
		  light_public_path TEXT,
		  alt_text TEXT NOT NULL,
		  caption TEXT,
		  width INTEGER NOT NULL,
		  height INTEGER NOT NULL,
		  style_key TEXT NOT NULL,
		  prompt_text TEXT NOT NULL,
		  generation_metadata_json TEXT NOT NULL,
		  source_fingerprint TEXT,
		  asset_sha256 TEXT,
		  light_asset_sha256 TEXT,
		  generation_model TEXT,
		  is_primary INTEGER NOT NULL,
		  status TEXT NOT NULL,
		  needs_human_review INTEGER NOT NULL,
		  created_at TEXT NOT NULL,
		  updated_at TEXT NOT NULL
		);
		CREATE TABLE public_route_payloads (
		  id TEXT PRIMARY KEY,
		  route_kind TEXT NOT NULL,
		  route_path TEXT NOT NULL UNIQUE,
		  payload_json TEXT NOT NULL,
		  source_version TEXT,
		  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
		INSERT INTO source_documents VALUES ('aqa-8464p1h-qp-jun22');
		INSERT INTO questions VALUES (
		  '${oldId}', 'aqa-8464p1h-qp-jun22', '01.4', '${oldId}', 'Physics', '8464P1H',
		  'Explain how step-up transformers make the network efficient.'
		);
		INSERT INTO answer_chains VALUES ('physics-chain-grid-transformer-efficiency');
		INSERT INTO mark_scheme_items VALUES (
		  '${oldId}-ms-1', '${oldId}', 'Potential difference increases.', '{}'
		);
		INSERT INTO mark_checklist_items VALUES (
		  '${oldId}-check-1', '${oldId}', '["${oldId}-ms-1"]'
		);
		INSERT INTO model_answers VALUES (
		  '${oldId}-model-answer', '${oldId}', 'Potential difference increases.',
		  '["${oldId}-ms-1"]'
		);
		INSERT INTO question_answer_chains VALUES (
		  '${oldId}--physics-chain-grid-transformer-efficiency', '${oldId}',
		  'physics-chain-grid-transformer-efficiency'
		);
		INSERT INTO common_weak_answers VALUES (
		  '${oldId}-weak-1', '${oldId}', 'physics-chain-grid-transformer-efficiency',
		  'It makes electricity faster.', '[]'
		);
		INSERT INTO answer_chain_steps VALUES (
		  'physics-chain-grid-transformer-efficiency-step-1',
		  'physics-chain-grid-transformer-efficiency', '["${oldId}-ms-1"]',
		  '[{"questionId":"${oldId}"}]'
		);
	`);
	insertIllustration(database, {
		id: 'chain-illustration-grid',
		sourceFingerprint: oldCandidate.sourceFingerprint,
		isPrimary: 1,
		status: 'published',
		metadata: {
			sourceFingerprint: oldCandidate.sourceFingerprint,
			decision: {
				representativeQuestionId: oldId,
				evidenceByQuestion: [{ questionId: oldId, markSchemeItemIds: [`${oldId}-ms-1`] }]
			}
		}
	});
	if (includeHistoricalDraft) {
		insertIllustration(database, {
			id: 'chain-illustration-grid-historical',
			sourceFingerprint: 'historical-draft-fingerprint',
			isPrimary: 0,
			status: 'draft',
			metadata: {
				sourceFingerprint: 'historical-draft-fingerprint',
				decision: { representativeQuestionId: oldId }
			}
		});
	}
	database
		.prepare(
			'INSERT INTO public_route_payloads (id, route_kind, route_path, payload_json, source_version) VALUES (?, ?, ?, ?, ?)'
		)
		.run(
			`question-practice-page-v3:${oldId}`,
			'question-practice-page',
			`/questions/${oldId}/practice`,
			JSON.stringify({ question: { id: oldId }, checklist: [`${oldId}-check-1`] }),
			'question-practice-page-v3'
		);
	const compressedValue = JSON.stringify({
		chain: { questionIds: [oldId, 'peer-question'] },
		questionsById: { [oldId]: { id: oldId } }
	});
	database
		.prepare(
			'INSERT INTO public_route_payloads (id, route_kind, route_path, payload_json, source_version) VALUES (?, ?, ?, ?, ?)'
		)
		.run(
			'chains:browse',
			'questions',
			'/questions',
			JSON.stringify({
				__qcPayloadEncoding: 'gzip-base64',
				data: gzipSync(Buffer.from(compressedValue)).toString('base64')
			}),
			'chains-materialization-v1'
		);
	return database;
}

async function inspect(database: DatabaseSync) {
	return inspectPhysicsQuestionIdState(async (sql, params = []) =>
		database.prepare(sql).all(...params)
	);
}

function applyTransaction(
	database: DatabaseSync,
	statements: Array<{ sql: string; params: Array<string | number | null> }>
) {
	database.exec('BEGIN IMMEDIATE');
	try {
		for (const statement of statements) {
			const prepared = database.prepare(statement.sql);
			if (/^\s*SELECT\b/i.test(statement.sql)) prepared.all(...statement.params);
			else prepared.run(...statement.params);
		}
		database.exec('COMMIT');
	} catch (error) {
		database.exec('ROLLBACK');
		throw error;
	}
}

function fixtureCandidate(questionId: string, existingSourceFingerprint?: string) {
	const candidate = {
		id: 'physics-chain-grid-transformer-efficiency',
		slug: 'physics-chain-grid-transformer-efficiency',
		title: 'Step-Up Grid',
		canonicalChainText:
			'step-up potential difference -> lower current -> less cable heating -> higher efficiency',
		summary:
			'Higher potential difference lowers current and cable heating, so more energy reaches consumers.',
		subjectArea: 'Physics',
		broadTopic: 'Electricity',
		confidence: 0.97,
		updatedAt: '2026-07-13 16:52:57',
		existingSourceFingerprint: existingSourceFingerprint ?? null,
		existingIllustrationId: 'chain-illustration-grid',
		sourceFingerprint: '',
		steps: [
			{
				id: 'physics-chain-grid-transformer-efficiency-step-1',
				displayOrder: 1,
				stepText: 'Step-up potential difference',
				stepRole: 'process',
				explanation: 'A transformer increases potential difference.',
				commonOmission: 'Saying it decreases.'
			},
			{
				id: 'physics-chain-grid-transformer-efficiency-step-2',
				displayOrder: 2,
				stepText: 'Lower current',
				stepRole: 'effect',
				explanation: 'The same power needs less current.',
				commonOmission: 'Saying current rises.'
			}
		],
		members: [
			{
				questionId,
				sourceDocumentId: 'aqa-8464p1h-qp-jun22',
				sourceQuestionRef: '01.4',
				promptText: 'Explain why step-up transformers improve efficiency.',
				selfContainedPromptText: 'Explain why step-up transformers improve grid efficiency.',
				marks: 3,
				fitConfidence: 0.97,
				markSchemeItems: [
					{
						id: `${questionId}-ms-1`,
						displayOrder: 1,
						itemType: 'mark',
						text: 'Potential difference increases.',
						marks: 1,
						confidence: 0.99
					}
				],
				checklistItems: [
					{
						id: `${questionId}-check-1`,
						displayOrder: 1,
						text: 'State that potential difference increases.',
						required: true,
						confidence: 0.99,
						needsHumanReview: 0,
						markSchemeItemIds: [`${questionId}-ms-1`]
					}
				],
				modelAnswers: [
					{
						id: `${questionId}-model-answer`,
						answerText: 'Potential difference rises, so current and heating fall.',
						derivation: 'Derived from the mark scheme.',
						confidence: 0.99,
						needsHumanReview: 0,
						supportingMarkSchemeItemIds: [`${questionId}-ms-1`]
					}
				]
			}
		]
	};
	candidate.sourceFingerprint = sourceFingerprint(candidate);
	candidate.existingSourceFingerprint ??= candidate.sourceFingerprint;
	return candidate;
}

function insertIllustration(
	database: DatabaseSync,
	{
		id,
		sourceFingerprint,
		isPrimary,
		status,
		metadata
	}: {
		id: string;
		sourceFingerprint: string;
		isPrimary: number;
		status: string;
		metadata: Record<string, unknown>;
	}
) {
	database
		.prepare(
			`INSERT INTO answer_chain_illustrations (
			   id, answer_chain_id, source_question_id, r2_key, public_path,
			   light_r2_key, light_public_path, alt_text, caption, width, height,
			   style_key, prompt_text, generation_metadata_json, source_fingerprint,
			   asset_sha256, light_asset_sha256, generation_model, is_primary, status,
			   needs_human_review, created_at, updated_at
			 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
		)
		.run(
			id,
			'physics-chain-grid-transformer-efficiency',
			oldId,
			`images/chains/${id}-dark.webp`,
			`/images/chains/${id}-dark.webp`,
			`images/chains/${id}-light.webp`,
			`/images/chains/${id}-light.webp`,
			'Grid transformer illustration',
			'Why stepping up voltage improves efficiency.',
			1672,
			941,
			'luminous-scientific-atlas-v1',
			'Illustrate the grid efficiency chain.',
			JSON.stringify(metadata),
			sourceFingerprint,
			`${id}-dark-sha256`,
			`${id}-light-sha256`,
			'codex-imagegen',
			isPrimary,
			status,
			'2026-07-13 17:20:58',
			'2026-07-13 17:42:17'
		);
}

function protectedIllustrationValues(row: Record<string, unknown>) {
	return Object.fromEntries(
		Object.entries(row).filter(
			([column]) =>
				!['source_question_id', 'source_fingerprint', 'generation_metadata_json'].includes(column)
		)
	);
}
