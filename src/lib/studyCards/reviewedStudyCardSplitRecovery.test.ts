import { describe, expect, it } from 'vitest';

import {
	FOUNDATION_OFFERING_ID,
	HIGHER_CARD_IDS,
	HIGHER_COMPONENT_IDS,
	HIGHER_OFFERING_ID,
	PARTIAL_ACCEPTED_RELEASE_ID,
	SHARED_COMPONENT_IDS,
	STOPPING_CARD_ID,
	assertReviewedSplitRecoveryQueueTerminal,
	buildReviewedSplitRecoveryArtifacts,
	buildReviewedSplitRecoveryPreflight,
	buildReviewedSplitRecoveryPrompt,
	reviewedSplitRecoveryCollisions
} from '../../../scripts/lib/reviewed-study-card-split-recovery.mjs';

const stoppingIssue =
	'Choices c and d express the same underlying misconception: both make stopping distance independent of speed when braking force is fixed. The four-choice card therefore lacks three genuinely distinct distractors.';
const higherIssue =
	'The official source places 6.5.5 Momentum under “HT only”. Because the target set includes a Foundation offering, this card is out of scope.';

describe('reviewed Combined Physics split recovery', () => {
	it('reuses exact content while splitting shared and inherited Higher scope', () => {
		const input = recoveryInput();
		const preflight = buildReviewedSplitRecoveryPreflight(input);

		expect(preflight.partialAccepted.cards).toHaveLength(12);
		expect(preflight.partialAccepted.plan.releaseId).toBe(PARTIAL_ACCEPTED_RELEASE_ID);
		expect(preflight.partialAccepted.validated.bundle.cards).toHaveLength(12);
		expect(
			preflight.partialAccepted.validated.bundle.coverage.filter(
				(row: { status: string }) => row.status === 'withheld'
			)
		).toHaveLength(0);
		expect(preflight.shared.cards).toHaveLength(1);
		expect(preflight.shared.preservedAcceptedCardIds).toHaveLength(0);
		expect(preflight.shared.freshReviewCards.map((card) => card.id)).toEqual([STOPPING_CARD_ID]);
		expect(
			preflight.shared.cards.find((card) => card.id === STOPPING_CARD_ID)?.choices
		).toHaveLength(3);
		expect(preflight.higher.cards.map((card) => card.id)).toEqual(HIGHER_CARD_IDS);
		expect(preflight.higher.cards[1]).toBe(input.candidates.cards[7]);
		expect(buildReviewedSplitRecoveryPrompt(preflight.shared)).toContain(
			'"mode": "shared-rejected"'
		);
		expect(buildReviewedSplitRecoveryPrompt(preflight.higher)).toContain('"mode": "higher-only"');
	});

	it('refuses unexpected archived review, identity and source drift', () => {
		const issueDrift = recoveryInput();
		issueDrift.reviews.reviews[6].issues = ['A different issue'];
		expect(() => buildReviewedSplitRecoveryPreflight(issueDrift)).toThrow(
			/unexpected archived review issue/
		);

		const sourceDrift = recoveryInput();
		sourceDrift.repairCandidates.cards[0]!.sourceExcerpt = 'Unsupported replacement text.';
		expect(() => buildReviewedSplitRecoveryPreflight(sourceDrift)).toThrow(
			/exact official source evidence/
		);
	});

	it('builds two immutable artifacts with exact original and supplemental provenance', () => {
		const input = recoveryInput();
		const preflight = buildReviewedSplitRecoveryPreflight(input);
		const sharedSummary = runSummary('fresh-shared-review', '2026-07-16T20:00:00.000Z');
		const higherSummary = runSummary('fresh-higher-review', '2026-07-16T20:02:00.000Z');
		const artifacts = buildReviewedSplitRecoveryArtifacts({
			preflight,
			sharedReview: acceptedReviews(preflight.shared.freshReviewCards),
			higherReview: acceptedReviews(preflight.higher.freshReviewCards),
			sharedReviewSummary: sharedSummary,
			higherReviewSummary: higherSummary,
			catalog: input.catalog
		});

		expect(artifacts.shared.bundle.cards).toHaveLength(1);
		expect(
			artifacts.shared.bundle.cards.every(
				(card: { targets: unknown[] }) => card.targets.length === 2
			)
		).toBe(true);
		expect(artifacts.shared.bundle.release.reviewer.runId).toBe('original-reviewer');
		expect(artifacts.shared.bundle.release.supplementalRuns).toEqual([
			expect.objectContaining({
				cardIds: [STOPPING_CARD_ID],
				generator: expect.objectContaining({ runId: 'repair-generator' }),
				reviewer: expect.objectContaining({ runId: 'fresh-shared-review' })
			})
		]);
		expect(
			artifacts.higher.bundle.cards.every(
				(card: { targets: Array<{ offeringId: string }> }) =>
					card.targets.length === 1 && card.targets[0]!.offeringId === HIGHER_OFFERING_ID
			)
		).toBe(true);
		expect(artifacts.higher.bundle.release.reviewer.runId).toBe('fresh-higher-review');
		expect(artifacts.shared.artifactHash).toMatch(/^[a-f0-9]{64}$/);
		expect(artifacts.higher.artifactHash).toMatch(/^[a-f0-9]{64}$/);
	});

	it('blocks live-queue execution and detects durable identity collisions', () => {
		expect(() => assertReviewedSplitRecoveryQueueTerminal({ finishedAt: null })).toThrow(
			/queue is still live/
		);
		expect(
			assertReviewedSplitRecoveryQueueTerminal({ finishedAt: '2026-07-16T21:00:00.000Z' })
		).toEqual({ finishedAt: '2026-07-16T21:00:00.000Z' });

		const input = recoveryInput();
		const preflight = buildReviewedSplitRecoveryPreflight(input);
		const recovery = {
			release: { id: preflight.shared.plan.releaseId },
			cards: preflight.shared.cards.map((card) => ({
				...card,
				board: 'AQA',
				subject: 'Physics'
			}))
		};
		expect(
			reviewedSplitRecoveryCollisions(
				[recovery],
				[
					{
						release: { id: 'existing' },
						cards: [
							{
								id: STOPPING_CARD_ID,
								board: 'AQA',
								subject: 'Physics',
								conceptKey: 'different-concept'
							}
						]
					}
				]
			)
		).toContain(`card ${STOPPING_CARD_ID}`);
	});
});

function recoveryInput() {
	const sourceComponentIds = [
		...SHARED_COMPONENT_IDS.slice(0, 6),
		...HIGHER_COMPONENT_IDS,
		...SHARED_COMPONENT_IDS.slice(6)
	];
	const cards = sourceComponentIds.map((componentId, index) =>
		candidate(componentId, candidateId(componentId, index), index)
	);
	const reviews = cards.map((card) => ({
		cardId: card.id,
		accepted: ![STOPPING_CARD_ID, ...HIGHER_CARD_IDS].includes(card.id),
		issues:
			card.id === STOPPING_CARD_ID
				? [stoppingIssue]
				: HIGHER_CARD_IDS.includes(card.id)
					? [higherIssue]
					: [],
		learnerValue: ['Tests exact official knowledge.']
	}));
	const repairCards = [STOPPING_CARD_ID, ...HIGHER_CARD_IDS].map((id) => {
		const original = structuredClone(cards.find((card) => card.id === id)!);
		if (id === STOPPING_CARD_ID) original.choices = original.choices.slice(0, 3);
		return original;
	});
	const plan = {
		schemaVersion: 'standard-study-deck-v1',
		promptVersion: 'standard-study-card-descendant-coverage-v1',
		batchId: 'aqa-combined-science-trilogy-8464-physics-shared-descendants-03-e7b6933413-v1',
		specificationId: 'aqa-gcse-combined-science-trilogy-8464-v1.1',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Physics',
		offeringIds: [FOUNDATION_OFFERING_ID, HIGHER_OFFERING_ID],
		topicComponentIds: ['topic-6-5', 'topic-6-6', 'topic-6-7'],
		generationMode: 'required-descendants',
		requiredComponentIds: sourceComponentIds,
		expectedCardCount: 15,
		model: 'gpt-5.6-sol',
		thinkingLevel: 'max'
	};
	const components: Array<{ id: string; parentId: string | null; tier: string[] }> =
		sourceComponentIds.map((id) => ({
			id,
			parentId: topicId(id),
			tier: ['Foundation', 'Higher']
		}));
	components.push(
		{ id: 'topic-6-5', parentId: 'root', tier: ['Foundation', 'Higher'] },
		{ id: 'topic-6-6', parentId: 'root', tier: ['Foundation', 'Higher'] },
		{ id: 'topic-6-7', parentId: 'root', tier: ['Foundation', 'Higher'] },
		{ id: 'root', parentId: null, tier: ['Foundation', 'Higher'] }
	);
	return {
		plan,
		candidates: { cards },
		reviews: { reviews },
		repairCandidates: { cards: repairCards },
		sourceEvidence: {
			plan,
			specification: {
				id: plan.specificationId,
				board: 'AQA',
				qualification: 'GCSE',
				title: 'AQA GCSE Combined Science',
				landingUrl: 'https://example.test/specification',
				sha256: 'a'.repeat(64)
			},
			offerings: [
				{
					id: FOUNDATION_OFFERING_ID,
					tier: 'Foundation',
					selectableComponentIds: ['topic-6-5', 'topic-6-6', 'topic-6-7']
				},
				{
					id: HIGHER_OFFERING_ID,
					tier: 'Higher',
					selectableComponentIds: ['topic-6-5', 'topic-6-6', 'topic-6-7']
				}
			],
			topics: ['topic-6-5', 'topic-6-6', 'topic-6-7'].map((topic) => ({
				topicComponentId: topic,
				components: cards
					.filter((card) => card.topicComponentId === topic)
					.map((card) => ({
						id: card.curriculumComponentId,
						locator: card.sourceLocator,
						text: card.sourceExcerpt
					}))
			}))
		},
		generationSummary: runSummary('base-generator', '2026-07-16T18:00:00.000Z'),
		originalReviewSummary: runSummary('original-reviewer', '2026-07-16T18:10:00.000Z'),
		repairGenerationSummary: runSummary('repair-generator', '2026-07-16T18:20:00.000Z'),
		catalog: {
			offerings: [
				{
					id: FOUNDATION_OFFERING_ID,
					tier: 'Foundation',
					specificationId: plan.specificationId
				},
				{
					id: HIGHER_OFFERING_ID,
					tier: 'Higher',
					specificationId: plan.specificationId
				}
			],
			specifications: [{ id: plan.specificationId, components }]
		}
	};
}

function candidate(componentId: string, id: string, index: number) {
	const topicComponentId = topicId(componentId);
	const excerpt = `Official source statement ${index} supports the exact answer.`;
	return {
		id,
		conceptKey: `recovery-concept-${index + 1}`,
		topicComponentId,
		curriculumComponentId: componentId,
		kind: 'fact',
		visualCue: '🧲',
		front: `What is official recovery fact ${index + 1}?`,
		back: `Correct answer ${index + 1}`,
		reverseFront: null,
		reverseBack: null,
		explanation: `The official source supports correct answer ${index + 1}.`,
		memoryTip: null,
		choices: [
			{
				key: 'a',
				text: `Correct answer ${index + 1}`,
				isCorrect: true,
				feedback: 'Correct according to the official source.',
				misconception: null
			},
			{
				key: 'b',
				text: `Wrong answer ${index + 1}a`,
				isCorrect: false,
				feedback: 'This confuses the first neighbouring idea.',
				misconception: `wrong-neighbour-${index + 1}-a`
			},
			{
				key: 'c',
				text: `Wrong answer ${index + 1}b`,
				isCorrect: false,
				feedback: 'This confuses the second neighbouring idea.',
				misconception: `wrong-neighbour-${index + 1}-b`
			},
			{
				key: 'd',
				text: `Wrong answer ${index + 1}c`,
				isCorrect: false,
				feedback: 'This confuses the third neighbouring idea.',
				misconception: `wrong-neighbour-${index + 1}-c`
			}
		],
		sourceExcerpt: excerpt,
		sourceLocator: `Official PDF page ${index + 1}`
	};
}

function candidateId(componentId: string, index: number) {
	if (componentId === SHARED_COMPONENT_IDS[1]) return STOPPING_CARD_ID;
	if (componentId === HIGHER_COMPONENT_IDS[0]) return HIGHER_CARD_IDS[0];
	if (componentId === HIGHER_COMPONENT_IDS[1]) return HIGHER_CARD_IDS[1];
	return `recovery-card-${index + 1}`;
}

function topicId(componentId: string) {
	if (componentId.includes(':6-5-')) return 'topic-6-5';
	if (componentId.includes(':6-6-')) return 'topic-6-6';
	return 'topic-6-7';
}

function runSummary(threadId: string, startedAt: string) {
	return {
		status: 'passed',
		model: 'gpt-5.6-sol',
		thinkingLevel: 'max',
		threadId,
		startedAt,
		finishedAt: new Date(Date.parse(startedAt) + 60_000).toISOString(),
		usage: { input_tokens: 1, output_tokens: 1 }
	};
}

function acceptedReviews(cards: Array<{ id: string }>) {
	return {
		reviews: cards.map((card) => ({
			cardId: card.id,
			accepted: true,
			issues: [],
			learnerValue: ['Tests exact official knowledge.']
		}))
	};
}
