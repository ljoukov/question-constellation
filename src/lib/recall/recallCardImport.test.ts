import { describe, expect, it } from 'vitest';

import {
	hashRecallArtifact,
	hashRecallCardContent,
	sha256,
	stableStringify
} from '../../../scripts/lib/recall-card-bundle.mjs';
import {
	buildRecallCardImportStatements,
	canonicalSourceFileHash,
	planRecallCardImport,
	recallStoredCardParentIssues
} from '../../../scripts/lib/recall-card-import.mjs';

describe('official source hash identity', () => {
	it('canonicalises the algorithm-qualified curriculum hash without accepting malformed values', () => {
		const digest = 'a'.repeat(64);
		expect(canonicalSourceFileHash(digest)).toBe(digest);
		expect(canonicalSourceFileHash(`sha256:${digest}`)).toBe(digest);
		expect(canonicalSourceFileHash(`SHA256:${digest.toUpperCase()}`)).toBe(digest);
		expect(canonicalSourceFileHash(`md5:${digest}`)).toBeNull();
		expect(canonicalSourceFileHash('a'.repeat(63))).toBeNull();
	});
});

describe('recall card D1 import plan', () => {
	it('uses a canonical artifact hash and publishes only after exact children are inserted', () => {
		const bundle = bundleFixture();
		const artifactHash = hashRecallArtifact(bundle);
		expect(artifactHash).toBe(hashRecallArtifact(JSON.parse(JSON.stringify(bundle))));
		const plan = planRecallCardImport(
			bundle,
			{},
			{
				artifactHash,
				artifactPath: 'data/recall/generated/recall-test-compiler-v5/accepted-cards.json'
			}
		);
		const statements = buildRecallCardImportStatements(bundle, plan);
		expectEveryPlaceholderBound(statements);

		expect(plan.counts).toEqual({ insert: 1, update: 0, noop: 0, conflicts: 0 });
		const draftIndex = statements.findIndex((statement) =>
			statement.sql.includes('INSERT INTO recall_cards')
		);
		const choiceIndex = statements.findIndex((statement) =>
			statement.sql.includes('INSERT INTO recall_card_choices')
		);
		const publishIndex = statements.findIndex((statement) =>
			statement.sql.includes("SET status = 'published'")
		);
		expect(draftIndex).toBeGreaterThan(-1);
		expect(choiceIndex).toBeGreaterThan(draftIndex);
		expect(publishIndex).toBeGreaterThan(choiceIndex);
		expect(statements[draftIndex].sql).toContain("'draft'");
		expect(statements.at(-1)?.sql).toContain("SET status = 'imported'");
		expect(statements.at(-1)?.sql).toContain("status IN ('accepted', 'imported')");
	});

	it('is idempotent for an exact published artifact', () => {
		const bundle = bundleFixture();
		const artifactHash = hashRecallArtifact(bundle);
		const plan = planRecallCardImport(
			bundle,
			{
				cards: [storedCardFixture(bundle, { content_revision: 4 })],
				generationRun: {
					id: bundle.run.id,
					schema_version: bundle.schemaVersion,
					prompt_version: bundle.promptVersion,
					source_fingerprint: bundle.source.fingerprint,
					artifact_hash: artifactHash,
					artifact_path: 'data/recall/generated/recall-test-compiler-v5/accepted-cards.json',
					status: 'imported',
					import_owner: 'recall-card-import/v1'
				}
			},
			{
				artifactHash,
				artifactPath: 'data/recall/generated/recall-test-compiler-v5/accepted-cards.json'
			}
		);

		expect(plan.counts).toEqual({ insert: 0, update: 0, noop: 1, conflicts: 0 });
		expect(plan.run.needsFinalization).toBe(false);
		expect(buildRecallCardImportStatements(bundle, plan)).toEqual([]);
	});

	it('finalizes an accepted run even when its exact cards are already published', () => {
		const bundle = bundleFixture();
		const artifactHash = hashRecallArtifact(bundle);
		const artifactPath = 'data/recall/generated/recall-test-compiler-v5/accepted-cards.json';
		const plan = planRecallCardImport(
			bundle,
			{
				cards: [storedCardFixture(bundle, { content_revision: 4 })],
				generationRun: {
					id: bundle.run.id,
					schema_version: bundle.schemaVersion,
					prompt_version: bundle.promptVersion,
					source_fingerprint: bundle.source.fingerprint,
					artifact_hash: artifactHash,
					artifact_path: artifactPath,
					status: 'accepted',
					import_owner: 'recall-card-import/v1'
				}
			},
			{ artifactHash, artifactPath }
		);

		expect(plan.run.needsFinalization).toBe(true);
		expect(buildRecallCardImportStatements(bundle, plan)).toEqual([
			expect.objectContaining({
				sql: expect.stringContaining("SET status = 'imported'")
			})
		]);
	});

	it('does not resurrect a generation run once it has been rejected', () => {
		const bundle = bundleFixture();
		const artifactHash = hashRecallArtifact(bundle);
		const artifactPath = 'data/recall/generated/recall-test-compiler-v5/accepted-cards.json';
		const plan = planRecallCardImport(
			bundle,
			{
				generationRun: {
					id: bundle.run.id,
					schema_version: bundle.schemaVersion,
					prompt_version: bundle.promptVersion,
					source_fingerprint: bundle.source.fingerprint,
					artifact_hash: artifactHash,
					artifact_path: artifactPath,
					status: 'rejected',
					import_owner: 'recall-card-import/v1'
				}
			},
			{ artifactHash, artifactPath }
		);

		expect(plan.conflicts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: expect.stringMatching(/terminal/) })
			])
		);
		expect(() => buildRecallCardImportStatements(bundle, plan)).toThrow(/unresolved conflicts/);
	});

	it('rejects a stored run whose version identity differs from the artifact', () => {
		const bundle = bundleFixture();
		const artifactHash = hashRecallArtifact(bundle);
		const artifactPath = 'data/recall/generated/recall-test-compiler-v5/accepted-cards.json';
		const plan = planRecallCardImport(
			bundle,
			{
				generationRun: {
					id: bundle.run.id,
					schema_version: bundle.schemaVersion,
					prompt_version: 'recall-card-compiler-v6',
					source_fingerprint: bundle.source.fingerprint,
					artifact_hash: artifactHash,
					artifact_path: artifactPath,
					status: 'imported',
					import_owner: 'recall-card-import/v1'
				}
			},
			{ artifactHash, artifactPath }
		);

		expect(plan.conflicts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: expect.stringMatching(/prompt version/) })
			])
		);
	});

	it('requires explicit revision authority and guards the exact preflight state', () => {
		const bundle = bundleFixture();
		const card = bundle.cards[0];
		const existing = {
			cards: [
				{
					...storedCardFixture(bundle),
					content_revision: 7,
					content_hash: 'f'.repeat(64),
					status: 'published'
				}
			]
		};
		const options = {
			artifactHash: hashRecallArtifact(bundle),
			artifactPath: 'data/recall/generated/recall-test-compiler-v5/accepted-cards.json'
		};
		expect(planRecallCardImport(bundle, existing, options).conflicts[0].reason).toMatch(
			/pass --allow-update/
		);

		const plan = planRecallCardImport(bundle, existing, { ...options, allowUpdate: true });
		expect(plan.actions[0]).toEqual(
			expect.objectContaining({
				type: 'update',
				contentRevision: 8,
				expected: expect.objectContaining({
					contentHash: 'f'.repeat(64),
					contentRevision: 7,
					status: 'published'
				})
			})
		);
		const statements = buildRecallCardImportStatements(bundle, plan);
		expectEveryPlaceholderBound(statements);
		const update = statements.find((statement) => statement.sql.includes('UPDATE recall_cards'))!;
		expect(update.sql).toContain('content_hash = ? AND content_revision = ? AND status = ?');
		expect(update.sql).toContain(
			'source_fingerprint = ? AND generation_run_id = ? AND provenance_json = ?'
		);
		expect(update.params.slice(-6)).toEqual([
			'f'.repeat(64),
			7,
			'published',
			bundle.source.fingerprint,
			bundle.run.id,
			stableStringify(card.provenance)
		]);
		for (const childInsert of statements.filter((statement) =>
			statement.sql.includes('INSERT INTO recall_card_')
		)) {
			expect(childInsert.sql).toContain('WHERE EXISTS');
		}
	});

	it('does not silently import a new run while identical cards retain old provenance', () => {
		const bundle = bundleFixture();
		const card = bundle.cards[0];
		const oldProvenance = {
			...card.provenance,
			generationRunId: 'older-recall-run-compiler-v5',
			generatedAt: '2026-07-14T10:01:00.000Z'
		};
		const existing = {
			cards: [
				storedCardFixture(bundle, {
					generation_run_id: oldProvenance.generationRunId,
					provenance_json: stableStringify(oldProvenance)
				})
			]
		};
		const options = {
			artifactHash: hashRecallArtifact(bundle),
			artifactPath: 'data/recall/generated/recall-test-compiler-v5/accepted-cards.json'
		};

		const blocked = planRecallCardImport(bundle, existing, options);
		expect(blocked.counts).toEqual({ insert: 0, update: 0, noop: 0, conflicts: 1 });
		expect(blocked.conflicts[0].reason).toMatch(/different source\/run provenance/);

		const rebind = planRecallCardImport(bundle, existing, { ...options, allowUpdate: true });
		expect(rebind.counts).toEqual({ insert: 0, update: 1, noop: 0, conflicts: 0 });
		expect(rebind.actions[0]).toEqual(
			expect.objectContaining({ type: 'update', contentRevision: 1 })
		);
		const statements = buildRecallCardImportStatements(bundle, rebind);
		expectEveryPlaceholderBound(statements);
		const finalization = statements.at(-1)!;
		expect(finalization.sql).toContain('generation_run_id = ? AND provenance_json = ?');
		expect(finalization.params).toEqual(
			expect.arrayContaining([
				bundle.run.id,
				bundle.source.fingerprint,
				stableStringify(card.provenance)
			])
		);
	});

	it('post-write parent verification compares run, source and canonical provenance', () => {
		const bundle = bundleFixture();
		const exact = storedCardFixture(bundle, {
			provenance_json: JSON.stringify(bundle.cards[0].provenance, null, 2)
		});
		expect(recallStoredCardParentIssues(bundle, [exact])).toEqual([]);

		const drifted = {
			...exact,
			source_fingerprint: 'e'.repeat(64),
			generation_run_id: 'other-run-compiler-v5',
			provenance_json: stableStringify({ ...bundle.cards[0].provenance, generatedAt: 'later' })
		};
		expect(recallStoredCardParentIssues(bundle, [drifted])).toEqual([
			`${drifted.id} source fingerprint differs`,
			`${drifted.id} generation run differs`,
			`${drifted.id} provenance differs`
		]);
	});

	it('refuses foreign ownership and stable concept identity drift', () => {
		const bundle = bundleFixture();
		const card = bundle.cards[0];
		const plan = planRecallCardImport(
			bundle,
			{
				cards: [
					{
						id: 'bio-other-id',
						subject: card.subject,
						concept_key: card.conceptKey,
						content_revision: 1,
						content_hash: card.contentHash,
						status: 'published',
						import_owner: 'manual-admin'
					}
				]
			},
			{
				artifactHash: hashRecallArtifact(bundle),
				artifactPath: 'data/recall/generated/recall-test-compiler-v5/accepted-cards.json'
			}
		);
		expect(plan.conflicts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: expect.stringMatching(/owned by manual-admin/) })
			])
		);
	});
});

function bundleFixture() {
	const sourceExcerpt =
		'Vaccination stimulates white blood cells to produce antibodies against the pathogen.';
	const card = {
		id: 'bio-vaccination-antibodies',
		conceptKey: 'vaccination-antibodies',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		kind: 'process',
		visualCue: '💉',
		front: 'What response does vaccination stimulate in white blood cells?',
		back: 'They produce antibodies against the pathogen.',
		reverseFront: null,
		reverseBack: null,
		explanation: 'The harmless pathogen material stimulates the specific antibody response.',
		memoryTip: null,
		choices: [
			{
				id: 'bio-vaccination-antibodies:antibodies',
				displayOrder: 0,
				choiceKey: 'antibodies',
				text: 'They produce antibodies against the pathogen.',
				isCorrect: true,
				feedback: 'White blood cells make antibodies specific to the pathogen.',
				misconception: null
			},
			...['antigens', 'antibiotics', 'painkillers'].map((name, index) => ({
				id: `bio-vaccination-antibodies:${name}`,
				displayOrder: index + 1,
				choiceKey: name,
				text: `They produce ${name} against the pathogen.`,
				isCorrect: false,
				feedback: `White blood cells produce antibodies, not ${name}.`,
				misconception: `Confuses antibodies with ${name}.`
			}))
		],
		evidence: [
			{
				id: 'bio-vaccination-antibodies:official-curriculum',
				sourceKind: 'curriculum_component',
				specificationId: 'aqa-8464',
				curriculumComponentId: 'aqa-8464-vaccination',
				pageStart: 37,
				pageEnd: 37,
				sourceExcerpt,
				sourceFileHash: 'a'.repeat(64),
				excerptHash: sha256(sourceExcerpt),
				supports: [
					'front',
					'back',
					'explanation',
					'choice:antibodies:feedback',
					'choice:antigens:feedback',
					'choice:antigens:misconception',
					'choice:antibiotics:feedback',
					'choice:antibiotics:misconception',
					'choice:painkillers:feedback',
					'choice:painkillers:misconception'
				]
			}
		],
		targets: [
			{
				offeringId: 'aqa-8464-biology-higher',
				curriculumComponentId: 'aqa-8464-vaccination',
				topicComponentId: 'aqa-8464-infection',
				isPrimary: true,
				confidence: 1,
				reviewed: true,
				mappingSource: 'recall-card-compiler-v2'
			}
		],
		contentRevision: 1,
		contentHash: '',
		provenance: {
			schemaVersion: 'recall-card-bundle-v2',
			promptVersion: 'recall-card-compiler-v5',
			generationRunId: 'recall-test-compiler-v5',
			generatedAt: '2026-07-15T10:01:00.000Z'
		}
	};
	card.contentHash = hashRecallCardContent(card);
	return {
		schemaVersion: 'recall-card-bundle-v2',
		promptVersion: 'recall-card-compiler-v5',
		run: {
			id: 'recall-test-compiler-v5',
			startedAt: '2026-07-15T10:00:00.000Z',
			finishedAt: '2026-07-15T10:01:00.000Z',
			generator: { model: 'gpt-5.6-sol', thinkingLevel: 'max' },
			fullReviewer: {
				model: 'gpt-5.6-sol',
				thinkingLevel: 'max',
				independentTurn: true
			},
			cueReviewer: {
				model: 'gpt-5.6-sol',
				thinkingLevel: 'max',
				independentTurn: true
			}
		},
		source: {
			catalogSchemaVersion: 2,
			catalogPath: 'data/curricula/curriculum-catalog.json',
			fingerprint: 'b'.repeat(64),
			specification: { id: 'aqa-8464', sha256: 'a'.repeat(64) },
			component: { id: 'aqa-8464-vaccination' },
			topicComponent: { id: 'aqa-8464-infection' },
			pageStart: 37,
			pageEnd: 37
		},
		cards: [card]
	};
}

function storedCardFixture(bundle: ReturnType<typeof bundleFixture>, overrides = {}) {
	const card = bundle.cards[0];
	return {
		id: card.id,
		subject: card.subject,
		concept_key: card.conceptKey,
		content_revision: 1,
		content_hash: card.contentHash,
		source_fingerprint: bundle.source.fingerprint,
		generation_run_id: bundle.run.id,
		provenance_json: stableStringify(card.provenance),
		status: 'published',
		import_owner: 'recall-card-import/v1',
		...overrides
	};
}

function expectEveryPlaceholderBound(statements: Array<{ sql: string; params: unknown[] }>) {
	for (const statement of statements) {
		expect(statement.params).toHaveLength(statement.sql.match(/\?/g)?.length ?? 0);
	}
}
