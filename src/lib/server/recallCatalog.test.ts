import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRows } = vi.hoisted(() => ({ queryRows: vi.fn() }));
vi.mock('./db', () => ({ queryRows }));

import {
	IMPORTABLE_RECALL_PROMPT_VERSIONS,
	RECALL_CATALOG_CACHE_TTL_MS,
	SUPPORTED_RECALL_BUNDLE_SCHEMA_VERSION,
	SUPPORTED_RECALL_PROMPT_VERSION,
	clearRecallCatalogCacheForTests,
	getRecallCardById,
	getRecallCards,
	recallCatalogQueryForTests
} from './recallCatalog';

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
	it('uses an eligible imported D1 offering as the complete authoritative catalog', async () => {
		queryRows.mockResolvedValue(validRows());
		expect(SUPPORTED_RECALL_BUNDLE_SCHEMA_VERSION).toBe('recall-card-bundle-v2');
		expect(SUPPORTED_RECALL_PROMPT_VERSION).toBe('recall-card-compiler-v6');
		expect(IMPORTABLE_RECALL_PROMPT_VERSIONS).toEqual([
			'recall-card-compiler-v5',
			'recall-card-compiler-v6'
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
		expect(recallCatalogQueryForTests).toContain("generation_run.status = 'imported'");
		expect(recallCatalogQueryForTests).toContain('generation_run.schema_version = ?');
		expect(recallCatalogQueryForTests).toContain('generation_run.prompt_version IN (?, ?)');
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
			SUPPORTED_RECALL_BUNDLE_SCHEMA_VERSION,
			...IMPORTABLE_RECALL_PROMPT_VERSIONS,
			'Biology',
			generatedScope.offeringId
		]);
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
			validRows().map((row) => ({ ...row, content_hash: 'not-a-canonical-hash' }))
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
