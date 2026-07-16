import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRows } = vi.hoisted(() => ({ queryRows: vi.fn() }));
vi.mock('./db', () => ({ queryRows }));

import { recallCards, type RecallCardDefinition } from '$lib/recall/aqaScienceRecall';

import {
	IMPORTABLE_RECALL_PROMPT_VERSIONS,
	RECALL_CATALOG_CACHE_TTL_MS,
	STATIC_RECALL_CATALOG_VERSION,
	SUPPORTED_RECALL_BUNDLE_SCHEMA_VERSION,
	SUPPORTED_RECALL_MEMORY_TIP_ENRICHMENT_PROMPT_VERSION,
	SUPPORTED_RECALL_MEMORY_TIP_ENRICHMENT_SCHEMA_VERSION,
	SUPPORTED_RECALL_PROMPT_VERSION,
	clearRecallCatalogCacheForTests,
	defaultRecallCatalogScope,
	getRecallCardById,
	getRecallCards,
	recallCatalogQueryForTests
} from './recallCatalog';

function fallbackContent(
	card: RecallCardDefinition,
	version: string,
	overrides: Partial<RecallCardDefinition> = {}
) {
	const value = { ...card, ...overrides };
	return JSON.stringify({
		version,
		id: value.id,
		topicId: value.topicId,
		specRef: value.specRef,
		kind: value.kind,
		visualCue: value.visualCue,
		front: value.front,
		back: value.back,
		reverseFront: value.reverseFront ?? null,
		reverseBack: value.reverseBack ?? null,
		distractors: value.distractors ?? [],
		explanation: value.explanation ?? null,
		memoryTip: value.memoryTip ?? null,
		choiceFeedback: value.choiceFeedback ?? {},
		choiceMisconceptions: value.choiceMisconceptions ?? {},
		sourceUrl: value.sourceUrl,
		sourceTitle: value.sourceTitle
	});
}

function hashFallbackContent(value: string) {
	return createHash('sha256').update(value).digest('hex');
}

const generatedScope = {
	subject: 'Biology' as const,
	offeringId: 'aqa-combined-biology-higher'
};

const separateHigherScope = {
	subject: 'Biology' as const,
	offeringId: 'aqa-gcse-biology-8461-v1.0:higher'
};

const baseRow = {
	card_id: 'generated-vaccine',
	concept_key: 'vaccination-response',
	subject: 'Biology',
	kind: 'process',
	visual_cue: '💉',
	front: 'What happens when the same pathogen re-enters after vaccination?',
	back: 'White blood cells quickly produce the correct antibodies.',
	reverse_front: null,
	reverse_back: null,
	explanation: 'Memory cells enable a faster, larger antibody response.',
	memory_tip: 'Memory cells remember the antigen.',
	content_revision: 2,
	content_hash: 'a'.repeat(64),
	provenance_json: '{}',
	offering_id: generatedScope.offeringId,
	curriculum_component_id: 'aqa-gcse-combined-science-8464-v1.0:4-3-1-7',
	topic_component_id: 'aqa-gcse-combined-science-8464-v1.0:4-3',
	target_code: '4.3.1.7',
	topic_code: '4.3',
	topic_title: 'Infection and response',
	source_url: 'https://example.test/specification',
	source_title: 'AQA GCSE Biology',
	choice_key: 'correct',
	choice_text: 'White blood cells quickly produce the correct antibodies.',
	choice_order: 0,
	is_correct: 1,
	choice_feedback: 'Yes. Memory cells trigger rapid production of specific antibodies.',
	choice_misconception: null
};

const distractors = [
	['wrong-a', 'Red blood cells make antibodies.', 'Red blood cells transport oxygen.', 'cell role'],
	[
		'wrong-b',
		'The pathogen becomes harmless by itself.',
		'Vaccination prepares immunity.',
		'causation'
	],
	[
		'wrong-c',
		'Skin cells digest the pathogen.',
		'White blood cells provide this response.',
		'cell role'
	]
] as const;

function validRows() {
	return [
		baseRow,
		...distractors.map(([key, text, feedback, misconception], index) => ({
			...baseRow,
			choice_key: key,
			choice_text: text,
			choice_order: index + 1,
			is_correct: 0,
			choice_feedback: feedback,
			choice_misconception: misconception
		}))
	];
}

beforeEach(() => {
	queryRows.mockReset();
	clearRecallCatalogCacheForTests();
});

describe('recall catalog read path', () => {
	it('uses one explicit public Separate Higher scope per subject', () => {
		expect(defaultRecallCatalogScope('Biology')).toEqual(separateHigherScope);
		expect(defaultRecallCatalogScope('Chemistry')).toEqual({
			subject: 'Chemistry',
			offeringId: 'aqa-gcse-chemistry-8462-v1.1:higher'
		});
	});

	it('uses an eligible imported D1 offering as the complete authoritative catalog', async () => {
		queryRows.mockResolvedValue(validRows());
		expect(SUPPORTED_RECALL_BUNDLE_SCHEMA_VERSION).toBe('recall-card-bundle-v2');
		expect(SUPPORTED_RECALL_PROMPT_VERSION).toBe('recall-card-compiler-v9');
		expect(SUPPORTED_RECALL_MEMORY_TIP_ENRICHMENT_SCHEMA_VERSION).toBe(
			'recall-memory-tip-enrichment-v1'
		);
		expect(SUPPORTED_RECALL_MEMORY_TIP_ENRICHMENT_PROMPT_VERSION).toBe(
			'recall-memory-tip-enricher-v1'
		);
		expect(IMPORTABLE_RECALL_PROMPT_VERSIONS).toEqual([
			'recall-card-compiler-v5',
			'recall-card-compiler-v6',
			'recall-card-compiler-v7',
			'recall-card-compiler-v8',
			'recall-card-compiler-v9'
		]);

		const cards = await getRecallCards(generatedScope);
		expect(cards).toHaveLength(1);
		expect(cards[0]).toMatchObject({
			id: 'generated-vaccine',
			topicId: 'biology-infection-response',
			offeringId: generatedScope.offeringId,
			curriculumComponentId: baseRow.curriculum_component_id,
			topicComponentId: baseRow.topic_component_id,
			contentRevision: 2,
			contentHash: 'a'.repeat(64),
			memoryTip: 'Memory cells remember the antigen.',
			choiceKeys: {
				'White blood cells quickly produce the correct antibodies.': 'correct',
				'Red blood cells make antibodies.': 'wrong-a',
				'The pathogen becomes harmless by itself.': 'wrong-b',
				'Skin cells digest the pathogen.': 'wrong-c'
			}
		});
		expect(cards[0]?.distractors).toHaveLength(3);
		expect(await getRecallCardById('generated-vaccine', generatedScope)).toBe(cards[0]);
		expect(queryRows).toHaveBeenCalledTimes(1);
		expect(recallCatalogQueryForTests).toContain('JOIN recall_generation_runs generation_run');
		expect(recallCatalogQueryForTests).toContain('WITH imported_memory_tip_enrichments AS');
		expect(recallCatalogQueryForTests).toContain(
			'LEFT JOIN imported_memory_tip_enrichments memory_tip_enrichment'
		);
		expect(recallCatalogQueryForTests).toContain("enrichment.status = 'published'");
		expect(recallCatalogQueryForTests).toContain('enrichment.needs_human_review = 0');
		expect(recallCatalogQueryForTests).toContain(
			"enrichment.import_owner = 'recall-memory-tip-enrichment-import/v1'"
		);
		expect(recallCatalogQueryForTests).toContain("enrichment_run.status = 'imported'");
		expect(recallCatalogQueryForTests).toContain(
			"enrichment_run.import_owner = 'recall-memory-tip-enrichment-import/v1'"
		);
		expect(recallCatalogQueryForTests).toContain(
			"'data/recall/enrichments/' || enrichment_run.id || '/accepted-enrichments.json'"
		);
		expect(recallCatalogQueryForTests).toContain("NULLIF(trim(c.memory_tip), '') IS NULL");
		expect(recallCatalogQueryForTests).toContain(
			'memory_tip_enrichment.base_generation_run_id = c.generation_run_id'
		);
		expect(recallCatalogQueryForTests).toContain(
			'memory_tip_enrichment.base_content_revision = c.content_revision'
		);
		expect(recallCatalogQueryForTests).toContain(
			'memory_tip_enrichment.base_content_hash = c.content_hash'
		);
		expect(recallCatalogQueryForTests).toContain(
			'memory_tip_enrichment.base_source_fingerprint = c.source_fingerprint'
		);
		expect(recallCatalogQueryForTests).toContain(
			'memory_tip_enrichment.base_artifact_hash = generation_run.artifact_hash'
		);
		expect(recallCatalogQueryForTests).toContain(
			'memory_tip_enrichment.base_artifact_path = generation_run.artifact_path'
		);
		expect(recallCatalogQueryForTests).toContain(
			"memory_tip_enrichment.effective_hash_version =\n     'recall-memory-tip-effective-content-v1'"
		);
		expect(recallCatalogQueryForTests).toContain(
			'COALESCE(memory_tip_enrichment.memory_tip, c.memory_tip) AS memory_tip'
		);
		expect(recallCatalogQueryForTests).toContain("generation_run.status = 'imported'");
		expect(recallCatalogQueryForTests).toContain('generation_run.schema_version = ?');
		expect(recallCatalogQueryForTests).toContain(
			'generation_run.prompt_version IN (?, ?, ?, ?, ?)'
		);
		expect(recallCatalogQueryForTests).toContain(
			'c.source_fingerprint = generation_run.source_fingerprint'
		);
		expect(recallCatalogQueryForTests).toContain('JOIN curriculum_offerings offering');
		expect(recallCatalogQueryForTests).toContain(
			'target_component.specification_id = offering.specification_id'
		);
		expect(recallCatalogQueryForTests).toContain(
			"'data/recall/generated/' || generation_run.id || '/accepted-cards.json'"
		);
		expect(recallCatalogQueryForTests).toContain('target.offering_id = ?');
		expect(queryRows).toHaveBeenCalledWith(expect.any(String), [
			SUPPORTED_RECALL_MEMORY_TIP_ENRICHMENT_SCHEMA_VERSION,
			SUPPORTED_RECALL_MEMORY_TIP_ENRICHMENT_PROMPT_VERSION,
			SUPPORTED_RECALL_BUNDLE_SCHEMA_VERSION,
			...IMPORTABLE_RECALL_PROMPT_VERSIONS,
			'Biology',
			generatedScope.offeringId
		]);
	});

	it('uses a reviewed enrichment as the effective learner-facing content identity', async () => {
		queryRows.mockResolvedValue(
			validRows().map((row) => ({
				...row,
				memory_tip: 'Antigen first; memory cells make the repeat response rapid.',
				content_revision: 3,
				content_hash: 'b'.repeat(64)
			}))
		);

		const cards = await getRecallCards(generatedScope);
		expect(cards).toHaveLength(1);
		expect(cards[0]).toMatchObject({
			id: baseRow.card_id,
			memoryTip: 'Antigen first; memory cells make the repeat response rapid.',
			contentRevision: 3,
			contentHash: 'b'.repeat(64)
		});
	});

	it('keeps native/base content when no exact enrichment is eligible', async () => {
		queryRows.mockResolvedValue(validRows());

		const cards = await getRecallCards(generatedScope);
		expect(cards[0]).toMatchObject({
			memoryTip: baseRow.memory_tip,
			contentRevision: baseRow.content_revision,
			contentHash: baseRow.content_hash
		});
		// A stale run, revision or hash cannot enter the LEFT JOIN, and a future
		// native tip always wins even if an old enrichment row remains stored.
		expect(recallCatalogQueryForTests).toContain(
			'memory_tip_enrichment.base_generation_run_id = c.generation_run_id'
		);
		expect(recallCatalogQueryForTests).toContain(
			'memory_tip_enrichment.base_content_revision = c.content_revision'
		);
		expect(recallCatalogQueryForTests).toContain(
			'memory_tip_enrichment.base_content_hash = c.content_hash'
		);
		expect(recallCatalogQueryForTests).toContain(
			'memory_tip_enrichment.base_source_fingerprint = c.source_fingerprint'
		);
		expect(recallCatalogQueryForTests).toContain(
			'memory_tip_enrichment.base_artifact_hash = generation_run.artifact_hash'
		);
		expect(recallCatalogQueryForTests).toContain(
			'memory_tip_enrichment.base_artifact_path = generation_run.artifact_path'
		);
		expect(recallCatalogQueryForTests).toContain("NULLIF(trim(c.memory_tip), '') IS NULL");
	});

	it('selects only an exact overlay and falls back for native or stale base content', () => {
		const db = recallCatalogDatabase();
		const read = () =>
			db
				.prepare(recallCatalogQueryForTests)
				.all(
					SUPPORTED_RECALL_MEMORY_TIP_ENRICHMENT_SCHEMA_VERSION,
					SUPPORTED_RECALL_MEMORY_TIP_ENRICHMENT_PROMPT_VERSION,
					SUPPORTED_RECALL_BUNDLE_SCHEMA_VERSION,
					...IMPORTABLE_RECALL_PROMPT_VERSIONS,
					'Biology',
					generatedScope.offeringId
				) as Array<Record<string, unknown>>;

		const enriched = read();
		expect(enriched).toHaveLength(4);
		expect(enriched[0]).toMatchObject({
			memory_tip: 'Antigen first; memory cells make the repeat response rapid.',
			content_revision: 2,
			content_hash: 'f'.repeat(64)
		});

		// Simulate a future native card revision without rewriting the immutable
		// enrichment. The read path must prefer native content independently of
		// the overlay's otherwise matching base guards.
		db.exec(`
			DROP TRIGGER recall_cards_published_content_immutable;
			UPDATE recall_cards
			SET memory_tip = 'Native reviewed tip.'
			WHERE id = 'generated-vaccine';
		`);
		const native = read();
		expect(native[0]).toMatchObject({
			memory_tip: 'Native reviewed tip.',
			content_revision: 1,
			content_hash: 'e'.repeat(64)
		});

		// Simulate a revised base identity. The old enrichment remains imported,
		// but its exact revision/hash guards no longer match.
		db.exec(`
			UPDATE recall_cards
			SET memory_tip = NULL,
			    content_revision = 2,
			    content_hash = '${'d'.repeat(64)}'
			WHERE id = 'generated-vaccine';
		`);
		const stale = read();
		expect(stale[0]).toMatchObject({
			memory_tip: null,
			content_revision: 2,
			content_hash: 'd'.repeat(64)
		});
	});

	it('rejects stale, native-tip and wrongly owned base identities before publication', () => {
		const db = recallCatalogDatabase();
		insertEnrichmentRun(db, 'guard-run');

		expect(() =>
			insertEnrichmentDraft(db, 'guard-run', {
				baseRevision: 2,
				baseHash: 'd'.repeat(64)
			})
		).toThrow(/base card identity is stale or ineligible/);

		db.exec(`
			DROP TRIGGER recall_cards_published_content_immutable;
			UPDATE recall_cards
			SET memory_tip = 'Native tip.'
			WHERE id = 'generated-vaccine';
		`);
		expect(() => insertEnrichmentDraft(db, 'guard-run')).toThrow(
			/base card identity is stale or ineligible/
		);

		db.exec(`
			UPDATE recall_cards
			SET memory_tip = NULL,
			    import_owner = 'untrusted-owner'
			WHERE id = 'generated-vaccine';
		`);
		expect(() => insertEnrichmentDraft(db, 'guard-run')).toThrow(
			/base card identity is stale or ineligible/
		);

		db.exec(`
			UPDATE recall_cards
			SET import_owner = 'recall-card-import/v1'
			WHERE id = 'generated-vaccine';
			UPDATE recall_generation_runs
			SET import_owner = 'untrusted-owner'
			WHERE id = 'base-run';
		`);
		expect(() => insertEnrichmentDraft(db, 'guard-run')).toThrow(
			/base card identity is stale or ineligible/
		);
	});

	it('requires owned enrichment provenance and keeps published content immutable', () => {
		const wrongRunOwnerDb = recallCatalogDatabase();
		wrongRunOwnerDb.exec(`
			UPDATE recall_card_memory_tip_enrichments
			SET status = 'retired'
			WHERE id = 'tip-run:generated-vaccine';
		`);
		insertEnrichmentRun(wrongRunOwnerDb, 'wrong-run-owner', 'untrusted-owner');
		insertEnrichmentDraft(wrongRunOwnerDb, 'wrong-run-owner');
		expect(() =>
			wrongRunOwnerDb.exec(`
				UPDATE recall_card_memory_tip_enrichments
				SET status = 'published'
				WHERE id = 'wrong-run-owner:generated-vaccine'
			`)
		).toThrow(/run is not an accepted import candidate/);

		const wrongRowOwnerDb = recallCatalogDatabase();
		wrongRowOwnerDb.exec(`
			UPDATE recall_card_memory_tip_enrichments
			SET status = 'retired'
			WHERE id = 'tip-run:generated-vaccine';
		`);
		insertEnrichmentRun(wrongRowOwnerDb, 'wrong-row-owner');
		insertEnrichmentDraft(wrongRowOwnerDb, 'wrong-row-owner', {
			owner: 'untrusted-owner'
		});
		expect(() =>
			wrongRowOwnerDb.exec(`
				UPDATE recall_card_memory_tip_enrichments
				SET status = 'published'
				WHERE id = 'wrong-row-owner:generated-vaccine'
			`)
		).toThrow(/run is not an accepted import candidate/);

		const immutableDb = recallCatalogDatabase();
		expect(() =>
			immutableDb.exec(`
				UPDATE recall_card_memory_tip_enrichments
				SET memory_tip = 'Changed after publication.'
				WHERE id = 'tip-run:generated-vaccine'
			`)
		).toThrow(/enrichment content is immutable/);
		expect(() =>
			immutableDb.exec(`
				UPDATE recall_memory_tip_enrichment_runs
				SET artifact_hash = '${'a'.repeat(64)}'
				WHERE id = 'tip-run'
			`)
		).toThrow(/run provenance is immutable/);
	});

	it('enforces learner-tip shape and rechecks the exact base before importing a run', () => {
		const shapeDb = recallCatalogDatabase();
		insertEnrichmentRun(shapeDb, 'shape-run');
		for (const memoryTip of ['Short', ' Leading-space tip.', 'Two lines\nare invalid.']) {
			expect(() => insertEnrichmentDraft(shapeDb, 'shape-run', { memoryTip })).toThrow(
				/CHECK constraint failed/
			);
		}

		const staleDb = recallCatalogDatabase();
		staleDb.exec(`
			UPDATE recall_card_memory_tip_enrichments
			SET status = 'retired'
			WHERE id = 'tip-run:generated-vaccine';
		`);
		insertEnrichmentRun(staleDb, 'stale-at-import');
		insertEnrichmentDraft(staleDb, 'stale-at-import');
		staleDb.exec(`
			UPDATE recall_card_memory_tip_enrichments
			SET status = 'published'
			WHERE id = 'stale-at-import:generated-vaccine';
			DROP TRIGGER recall_cards_published_content_immutable;
			UPDATE recall_cards
			SET content_revision = 2,
			    content_hash = '${'d'.repeat(64)}'
			WHERE id = 'generated-vaccine';
		`);
		expect(() =>
			staleDb.exec(`
				UPDATE recall_memory_tip_enrichment_runs
				SET status = 'imported'
				WHERE id = 'stale-at-import'
			`)
		).toThrow(/requires reviewed published rows/);
	});

	it('finalizes only the exact number of enrichments declared by the accepted artifact', () => {
		const db = recallCatalogDatabase();
		db.exec(`
			UPDATE recall_card_memory_tip_enrichments
			SET status = 'retired'
			WHERE id = 'tip-run:generated-vaccine';
		`);
		insertEnrichmentRun(db, 'count-mismatch', 'recall-memory-tip-enrichment-import/v1', 2);
		insertEnrichmentDraft(db, 'count-mismatch');
		db.exec(`
			UPDATE recall_card_memory_tip_enrichments
			SET status = 'published'
			WHERE id = 'count-mismatch:generated-vaccine';
		`);

		expect(() =>
			db.exec(`
				UPDATE recall_memory_tip_enrichment_runs
				SET status = 'imported'
				WHERE id = 'count-mismatch'
			`)
		).toThrow(/requires reviewed published rows/);
		expect(
			db
				.prepare(`SELECT status FROM recall_memory_tip_enrichment_runs WHERE id = ?`)
				.get('count-mismatch')
		).toEqual({ status: 'accepted' });
	});

	it('holds out malformed rows from an otherwise eligible offering without static ID merging', async () => {
		queryRows.mockResolvedValue([{ ...baseRow, visual_cue: '✅' }]);

		await expect(getRecallCards(generatedScope)).resolves.toEqual([]);
	});

	it('holds out an otherwise valid card when two choices share a server-owned key', async () => {
		queryRows.mockResolvedValue(
			validRows().map((row, index) => (index === 3 ? { ...row, choice_key: 'wrong-b' } : row))
		);

		await expect(getRecallCards(generatedScope)).resolves.toEqual([]);
	});

	it('holds out canonical rows that cannot support trustworthy choice diagnostics', async () => {
		const malformedVariants = [
			validRows().map((row, index) => (index === 1 ? { ...row, choice_misconception: null } : row)),
			validRows().map((row, index) =>
				index === 0
					? { ...row, choice_misconception: 'The correct choice is not a misconception.' }
					: row
			),
			validRows().map((row, index) =>
				index === 1 ? { ...row, choice_key: 'Client supplied key' } : row
			),
			validRows().map((row) => ({ ...row, content_hash: 'not-a-canonical-hash' })),
			validRows().map((row) => ({ ...row, memory_tip: 'Short' })),
			validRows().map((row) => ({ ...row, memory_tip: 'Two lines are\nnot valid.' }))
		];

		for (const rows of malformedVariants) {
			clearRecallCatalogCacheForTests();
			queryRows.mockResolvedValueOnce(rows);
			await expect(getRecallCards(generatedScope)).resolves.toEqual([]);
		}
	});

	it('uses the versioned static deck only for the exact AQA Separate Science Higher offering', async () => {
		queryRows.mockRejectedValue(new Error('D1_ERROR: no such table: recall_cards'));

		const cards = await getRecallCards(separateHigherScope);
		expect(cards.length).toBeGreaterThan(20);
		expect(cards.every((card) => card.offeringId === separateHigherScope.offeringId)).toBe(true);
		expect(
			cards.every((card) => card.contentRevision === 1 && card.contentHash.length === 64)
		).toBe(true);
		expect(
			cards.every(
				(card) =>
					card.choiceKeys[card.back] === 'correct' &&
					Object.keys(card.choiceKeys).length === 1 + (card.distractors?.length ?? 0)
			)
		).toBe(true);
		expect(
			cards.every(
				(card) =>
					card.curriculumComponentId.startsWith('aqa-gcse-biology-8461-v1.0:') &&
					card.topicComponentId.startsWith('aqa-gcse-biology-8461-v1.0:')
			)
		).toBe(true);
	});

	it('versions and re-hashes every enriched fallback card without changing its identity', async () => {
		queryRows.mockRejectedValue(new Error('D1_ERROR: no such table: recall_cards'));
		const cards = (
			await Promise.all(
				(['Biology', 'Chemistry', 'Physics'] as const).map((subject) =>
					getRecallCards(defaultRecallCatalogScope(subject))
				)
			)
		).flat();
		const previousVisualCue = {
			'bio-eukaryote-prokaryote': '🔬',
			'bio-mitochondria-function': '🔬',
			'bio-ribosome-function': '🔬',
			'bio-stem-cell-definition': '🔬',
			'bio-anaerobic-respiration-muscles': '🔬',
			'bio-photosynthesis-equation': '🔬',
			'bio-natural-selection-steps': '🔬',
			'chem-concentration-mass-volume': '🧪'
		} as const;

		expect(STATIC_RECALL_CATALOG_VERSION).toBe('aqa-separate-science-higher-v2');
		expect(cards).toHaveLength(76);
		expect(new Set(cards.map((card) => card.id)).size).toBe(76);
		expect(new Set(cards.map((card) => card.contentHash)).size).toBe(76);
		for (const card of cards) {
			const definition = recallCards.find((candidate) => candidate.id === card.id);
			expect(definition, `missing fallback definition ${card.id}`).toBeDefined();
			if (!definition) continue;
			expect(card.contentHash, `${card.id} v2 hash`).toBe(
				hashFallbackContent(fallbackContent(definition, STATIC_RECALL_CATALOG_VERSION))
			);

			const legacyHash = hashFallbackContent(
				fallbackContent(definition, 'aqa-separate-science-higher-v1', {
					visualCue:
						previousVisualCue[card.id as keyof typeof previousVisualCue] ?? definition.visualCue,
					memoryTip: undefined
				})
			);
			expect(card.contentHash, `${card.id} must invalidate its v1 evidence identity`).not.toBe(
				legacyHash
			);
		}
	});

	it('keeps the ready Separate Science deck when a focused generated import is only an overlay', async () => {
		queryRows.mockResolvedValue(
			validRows().map((row) => ({
				...row,
				offering_id: separateHigherScope.offeringId,
				curriculum_component_id: 'aqa-gcse-biology-8461-v1.0:4-3-1-7',
				topic_component_id: 'aqa-gcse-biology-8461-v1.0:4-3'
			}))
		);

		const cards = await getRecallCards(separateHigherScope);
		expect(cards.length).toBeGreaterThan(20);
		expect(cards[0]).toMatchObject({
			id: 'generated-vaccine',
			offeringId: separateHigherScope.offeringId
		});
		expect(cards.some((card) => card.id !== 'generated-vaccine')).toBe(true);
		expect(cards.every((card) => card.offeringId === separateHigherScope.offeringId)).toBe(true);
	});

	it('does not leak Separate Science static cards into Combined Science or Foundation', async () => {
		queryRows.mockRejectedValue(new Error('D1_ERROR: no such table: recall_cards'));

		await expect(getRecallCards(generatedScope)).resolves.toEqual([]);
		clearRecallCatalogCacheForTests();
		await expect(
			getRecallCards({
				subject: 'Biology',
				offeringId: 'aqa-gcse-biology-8461-v1.0:foundation'
			})
		).resolves.toEqual([]);
	});

	it('does not hide operational D1 failures', async () => {
		queryRows.mockRejectedValue(new Error('temporary D1 timeout'));
		await expect(getRecallCards(generatedScope)).rejects.toThrow('temporary D1 timeout');
	});

	it('degrades honestly without an exact learner offering', async () => {
		await expect(getRecallCards()).resolves.toEqual([]);
		expect(queryRows).not.toHaveBeenCalled();
	});

	it('reuses a catalog read only for the short TTL', async () => {
		queryRows.mockResolvedValue(validRows());
		const now = vi.spyOn(Date, 'now');
		now.mockReturnValue(10_000);

		await getRecallCards(generatedScope);
		await getRecallCards(generatedScope);
		expect(queryRows).toHaveBeenCalledTimes(1);

		now.mockReturnValue(10_000 + RECALL_CATALOG_CACHE_TTL_MS + 1);
		await getRecallCards(generatedScope);
		expect(queryRows).toHaveBeenCalledTimes(2);
		now.mockRestore();
	});
});

function recallCatalogDatabase(): DatabaseSync {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON');
	db.exec(`
		CREATE TABLE curriculum_specifications (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			landing_url TEXT NOT NULL
		);
		CREATE TABLE curriculum_components (
			id TEXT PRIMARY KEY,
			specification_id TEXT NOT NULL REFERENCES curriculum_specifications(id),
			code TEXT NOT NULL,
			title TEXT NOT NULL
		);
		CREATE TABLE curriculum_offerings (
			id TEXT PRIMARY KEY,
			specification_id TEXT NOT NULL REFERENCES curriculum_specifications(id)
		);
	`);
	for (const migration of [
		'migrations/0018_recall_catalog.sql',
		'migrations/0019_recall_draft_first.sql',
		'migrations/0020_recall_memory_tip_enrichments.sql'
	]) {
		db.exec(readFileSync(path.resolve(migration), 'utf8'));
	}

	db.exec(`
		INSERT INTO curriculum_specifications (id, title, landing_url)
		VALUES ('spec', 'AQA GCSE Biology', 'https://example.test/specification');
		INSERT INTO curriculum_components (id, specification_id, code, title) VALUES
			('component', 'spec', '4.3.1.7', 'Vaccination'),
			('topic', 'spec', '4.3', 'Infection and response');
		INSERT INTO curriculum_offerings (id, specification_id)
		VALUES ('${generatedScope.offeringId}', 'spec');

		INSERT INTO recall_generation_runs (
			id, schema_version, prompt_version,
			generator_model, generator_thinking_level,
			reviewer_model, reviewer_thinking_level,
			cue_reviewer_model, cue_reviewer_thinking_level,
			source_fingerprint, artifact_hash, artifact_path, run_json,
			started_at, finished_at, status, import_owner
		) VALUES (
			'base-run', 'recall-card-bundle-v2', 'recall-card-compiler-v5',
			'gpt-5.6-sol', 'max', 'gpt-5.6-sol', 'max', 'gpt-5.6-sol', 'max',
			'${'a'.repeat(64)}', '${'b'.repeat(64)}',
			'data/recall/generated/base-run/accepted-cards.json', '{}',
			'2026-07-16T10:00:00.000Z', '2026-07-16T10:01:00.000Z',
			'accepted', 'recall-card-import/v1'
		);
		INSERT INTO recall_cards (
			id, concept_key, board, qualification, subject, kind, visual_cue,
			front, back, explanation, memory_tip, content_revision, content_hash,
			source_fingerprint, generation_run_id, provenance_json, status,
			needs_human_review, import_owner
		) VALUES (
			'generated-vaccine', 'vaccination-response', 'AQA', 'GCSE', 'Biology',
			'process', '💉',
			'What happens when the same pathogen re-enters after vaccination?',
			'White blood cells quickly produce the correct antibodies.',
			'Memory cells enable a faster, larger antibody response.',
			NULL, 1, '${'e'.repeat(64)}', '${'a'.repeat(64)}', 'base-run', '{}',
			'draft', 0, 'recall-card-import/v1'
		);
		INSERT INTO recall_card_choices (
			id, card_id, display_order, choice_key, text, is_correct,
			feedback, misconception, import_owner
		) VALUES
			('choice-correct', 'generated-vaccine', 0, 'correct',
			 'White blood cells quickly produce the correct antibodies.', 1,
			 'Memory cells trigger the specific response.', NULL, 'recall-card-import/v1'),
			('choice-a', 'generated-vaccine', 1, 'wrong-a',
			 'Red blood cells make antibodies.', 0,
			 'Red blood cells transport oxygen.', 'cell role', 'recall-card-import/v1'),
			('choice-b', 'generated-vaccine', 2, 'wrong-b',
			 'The pathogen becomes harmless by itself.', 0,
			 'Vaccination prepares immunity.', 'causation', 'recall-card-import/v1'),
			('choice-c', 'generated-vaccine', 3, 'wrong-c',
			 'Skin cells digest the pathogen.', 0,
			 'White blood cells provide this response.', 'cell role', 'recall-card-import/v1');
		INSERT INTO recall_card_evidence (
			id, card_id, source_kind, specification_id, curriculum_component_id,
			source_page_start, source_page_end, source_excerpt, source_file_hash,
			excerpt_hash, supports_json, import_owner
		) VALUES (
			'evidence', 'generated-vaccine', 'curriculum_component', 'spec', 'component',
			1, 1, 'Official excerpt', '${'a'.repeat(64)}', '${'b'.repeat(64)}',
			'["back","explanation","choices"]', 'recall-card-import/v1'
		);
		INSERT INTO recall_card_curriculum_targets (
			card_id, offering_id, curriculum_component_id, topic_component_id,
			is_primary, confidence, reviewed, mapping_source, import_owner
		) VALUES (
			'generated-vaccine', '${generatedScope.offeringId}', 'component', 'topic',
			1, 1, 1, 'recall-card-compiler-v5', 'recall-card-import/v1'
		);
		UPDATE recall_cards SET status = 'published' WHERE id = 'generated-vaccine';
		UPDATE recall_generation_runs SET status = 'imported' WHERE id = 'base-run';

		INSERT INTO recall_memory_tip_enrichment_runs (
			id, schema_version, prompt_version,
			generator_model, generator_thinking_level,
			reviewer_model, reviewer_thinking_level,
			source_fingerprint, artifact_hash, artifact_path, run_json,
			started_at, finished_at, status, import_owner
		) VALUES (
			'tip-run', 'recall-memory-tip-enrichment-v1',
			'recall-memory-tip-enricher-v1',
			'gpt-5.6-sol', 'max', 'gpt-5.6-sol', 'max',
			'${'c'.repeat(64)}', '${'d'.repeat(64)}',
			'data/recall/enrichments/tip-run/accepted-enrichments.json',
			'{"enrichmentCount":1}',
			'2026-07-16T10:02:00.000Z', '2026-07-16T10:03:00.000Z',
			'accepted', 'recall-memory-tip-enrichment-import/v1'
		);
		INSERT INTO recall_card_memory_tip_enrichments (
			id, enrichment_run_id, card_id, base_generation_run_id,
			base_content_revision, base_content_hash, base_source_fingerprint,
			base_artifact_hash, base_artifact_path, base_provenance_hash, memory_tip,
			effective_content_revision, effective_hash_version, effective_content_hash,
			provenance_json,
			status, needs_human_review, import_owner
		) VALUES (
			'tip-run:generated-vaccine', 'tip-run', 'generated-vaccine', 'base-run',
			1, '${'e'.repeat(64)}', '${'a'.repeat(64)}', '${'b'.repeat(64)}',
			'data/recall/generated/base-run/accepted-cards.json', '${'c'.repeat(64)}',
			'Antigen first; memory cells make the repeat response rapid.',
			2, 'recall-memory-tip-effective-content-v1', '${'f'.repeat(64)}',
			'{}', 'draft', 0,
			'recall-memory-tip-enrichment-import/v1'
		);
		UPDATE recall_card_memory_tip_enrichments
		SET status = 'published'
		WHERE id = 'tip-run:generated-vaccine';
		UPDATE recall_memory_tip_enrichment_runs
		SET status = 'imported'
		WHERE id = 'tip-run';
	`);
	return db;
}

function insertEnrichmentRun(
	db: DatabaseSync,
	runId: string,
	owner = 'recall-memory-tip-enrichment-import/v1',
	enrichmentCount = 1
): void {
	db.prepare(
		`INSERT INTO recall_memory_tip_enrichment_runs (
			id, schema_version, prompt_version,
			generator_model, generator_thinking_level,
			reviewer_model, reviewer_thinking_level,
			source_fingerprint, artifact_hash, artifact_path, run_json,
			started_at, finished_at, status, import_owner
		) VALUES (
			?, 'recall-memory-tip-enrichment-v1', 'recall-memory-tip-enricher-v1',
			'gpt-5.6-sol', 'max', 'gpt-5.6-sol', 'max', ?, ?, ?, ?,
			'2026-07-16T11:00:00.000Z', '2026-07-16T11:01:00.000Z', 'accepted', ?
		)`
	).run(
		runId,
		'a'.repeat(64),
		'b'.repeat(64),
		`data/recall/enrichments/${runId}/accepted-enrichments.json`,
		JSON.stringify({ enrichmentCount }),
		owner
	);
}

function insertEnrichmentDraft(
	db: DatabaseSync,
	runId: string,
	overrides: {
		baseRevision?: number;
		baseHash?: string;
		memoryTip?: string;
		owner?: string;
	} = {}
): void {
	const baseRevision = overrides.baseRevision ?? 1;
	db.prepare(
		`INSERT INTO recall_card_memory_tip_enrichments (
			id, enrichment_run_id, card_id, base_generation_run_id,
			base_content_revision, base_content_hash, base_source_fingerprint,
			base_artifact_hash, base_artifact_path, base_provenance_hash, memory_tip,
			effective_content_revision, effective_hash_version, effective_content_hash,
			provenance_json,
			status, needs_human_review, import_owner
		) VALUES (
			?, ?, 'generated-vaccine', 'base-run', ?, ?, ?, ?, ?, ?, ?, ?,
			'recall-memory-tip-effective-content-v1', ?, '{}', 'draft', 0, ?
		)`
	).run(
		`${runId}:generated-vaccine`,
		runId,
		baseRevision,
		overrides.baseHash ?? 'e'.repeat(64),
		'a'.repeat(64),
		'b'.repeat(64),
		'data/recall/generated/base-run/accepted-cards.json',
		'c'.repeat(64),
		overrides.memoryTip ?? 'Antigen first; memory cells make the repeat response rapid.',
		baseRevision + 1,
		'f'.repeat(64),
		overrides.owner ?? 'recall-memory-tip-enrichment-import/v1'
	);
}
