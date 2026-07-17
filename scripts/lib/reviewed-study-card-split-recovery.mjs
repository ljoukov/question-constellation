/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- The command validates archived unknown JSON before using it.
import { createHash } from 'node:crypto';

import {
	STUDY_CARD_SCHEMA_VERSION,
	hashStudyCardArtifact,
	stableStringify,
	validateStudyCardBundle
} from './study-card-artifact.mjs';
import { assertStudyCardCurriculumScope } from './study-card-import.mjs';

export const REVIEWED_SPLIT_RECOVERY_VERSION = 'reviewed-study-card-split-recovery-v1';
export const REVIEWED_PARTIAL_ACCEPTED_RECOVERY_VERSION =
	'reviewed-study-card-partial-accepted-recovery-v1';
export const REVIEWED_CARD_REPAIR_PROMPT_VERSION = 'standard-study-card-reviewed-repair-v3';
export const RECOVERY_MODEL = 'gpt-5.6-sol';
export const RECOVERY_THINKING_LEVEL = 'max';
export const SOURCE_BATCH_ID =
	'aqa-combined-science-trilogy-8464-physics-shared-descendants-03-e7b6933413-v1';
export const SHARED_RELEASE_ID =
	'aqa-combined-science-trilogy-8464-physics-shared-descendants-recovered-c2abf02025-v1';
export const HIGHER_RELEASE_ID =
	'aqa-combined-science-trilogy-8464-physics-higher-only-descendants-recovered-7ca60b4d90-v1';
export const PARTIAL_ACCEPTED_RELEASE_ID =
	'aqa-combined-science-trilogy-8464-physics-partial-accepted-rollout-recovered-v1';

export const SHARED_COMPONENT_IDS = Object.freeze([
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-5-4-2-3',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-5-4-3',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-5-4-3-1',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-5-4-3-2',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-5-4-3-3',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-5-4-3-4',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-6-1',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-6-2',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-6-2-2',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-6-2-3',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-6-2-4',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-7-1',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-7-2'
]);
export const HIGHER_COMPONENT_IDS = Object.freeze([
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-5-5-1',
	'aqa-gcse-combined-science-trilogy-8464-v1.1:6-5-5-2'
]);
const SOURCE_COMPONENT_IDS = Object.freeze([
	...SHARED_COMPONENT_IDS.slice(0, 6),
	...HIGHER_COMPONENT_IDS,
	...SHARED_COMPONENT_IDS.slice(6)
]);
export const STOPPING_CARD_ID =
	'aqa-8464-ccaa2e6e5b-aqa-8464-physics-6-5-4-3-speed-stopping-distance';
export const HIGHER_CARD_IDS = Object.freeze([
	'aqa-8464-653a60fc98-aqa-8464-physics-6-5-5-1-momentum-equation',
	'aqa-8464-e9e7b7d7f8-aqa-8464-physics-6-5-5-2-conservation-of-momentum'
]);
export const FOUNDATION_OFFERING_ID =
	'aqa-gcse-combined-science-trilogy-8464-v1.1:physics:foundation';
export const HIGHER_OFFERING_ID = 'aqa-gcse-combined-science-trilogy-8464-v1.1:physics:higher';

const STOPPING_REVIEW_ISSUE =
	'Choices c and d express the same underlying misconception: both make stopping distance independent of speed when braking force is fixed. The four-choice card therefore lacks three genuinely distinct distractors.';
const HIGHER_REVIEW_ISSUES = Object.freeze({
	[HIGHER_CARD_IDS[0]]:
		'The official source places 6.5.5 Momentum under “HT only”. Because the target set includes a Foundation offering, this card is out of scope.',
	[HIGHER_CARD_IDS[1]]:
		'The official source places 6.5.5 Momentum under “HT only”. Because the target set includes a Foundation offering, this card is out of scope.'
});

/**
 * Validate the archived failed trace and derive two exact, zero-regeneration
 * cohorts. No archived decision is silently reinterpreted: twelve cards retain
 * their original acceptance; the repaired stopping card and two scope-only
 * Higher rejections require fresh independent review.
 */
export function buildReviewedSplitRecoveryPreflight(input) {
	const {
		plan,
		candidates,
		reviews,
		repairCandidates,
		sourceEvidence,
		generationSummary,
		originalReviewSummary,
		repairGenerationSummary,
		catalog
	} = input;
	assertPassedRun(generationSummary, 'base generator');
	assertPassedRun(originalReviewSummary, 'original independent reviewer');
	assertPassedRun(repairGenerationSummary, 'reviewed-card repair generator');
	if (
		new Set([
			generationSummary.threadId,
			originalReviewSummary.threadId,
			repairGenerationSummary.threadId
		]).size !== 3
	) {
		throw new Error('Archived generator/reviewer run ids must be independent.');
	}
	assertSourcePlan(plan);
	if (stableStringify(sourceEvidence?.plan) !== stableStringify(plan)) {
		throw new Error('Archived source evidence plan differs from the failed batch plan.');
	}
	const candidateRows = exactCards(candidates, 15, 'archived candidates');
	const reviewRows = exactReviews(reviews, candidateRows);
	const candidateByComponent = new Map(
		candidateRows.map((card) => [card.curriculumComponentId, card])
	);
	if (stableStringify([...candidateByComponent.keys()]) !== stableStringify(SOURCE_COMPONENT_IDS)) {
		throw new Error('Archived candidate component order or identity drifted.');
	}
	for (const card of candidateRows) validateCandidateSource(card, sourceEvidence);

	const rejected = reviewRows.filter((review) => !review.accepted);
	if (
		stableStringify(rejected.map((review) => review.cardId)) !==
		stableStringify([STOPPING_CARD_ID, ...HIGHER_CARD_IDS])
	) {
		throw new Error('Archived independent reviewer rejection identities drifted.');
	}
	for (const review of reviewRows) {
		if (review.accepted) {
			if (review.issues.length) throw new Error(`${review.cardId} accepted review now has issues.`);
			continue;
		}
		const expectedIssue =
			review.cardId === STOPPING_CARD_ID
				? STOPPING_REVIEW_ISSUE
				: HIGHER_REVIEW_ISSUES[review.cardId];
		if (!expectedIssue || stableStringify(review.issues) !== stableStringify([expectedIssue])) {
			throw new Error(`${review.cardId} has an unexpected archived review issue.`);
		}
	}

	const repairs = exactCards(repairCandidates, 3, 'archived reviewer-repair candidates');
	if (
		stableStringify(repairs.map((card) => card.id)) !==
		stableStringify([STOPPING_CARD_ID, ...HIGHER_CARD_IDS])
	) {
		throw new Error('Archived reviewer-repair identities drifted.');
	}
	for (const card of repairs) validateCandidateSource(card, sourceEvidence);
	const stoppingReplacement = repairs[0];
	assertSameIdentity(
		candidateRows.find((card) => card.id === STOPPING_CARD_ID),
		stoppingReplacement
	);

	const acceptedIds = new Set(
		reviewRows.filter((review) => review.accepted).map((review) => review.cardId)
	);
	const partialAcceptedCards = candidateRows.filter((card) => acceptedIds.has(card.id));
	if (
		partialAcceptedCards.length !== 12 ||
		partialAcceptedCards.some((card) => !SHARED_COMPONENT_IDS.includes(card.curriculumComponentId))
	) {
		throw new Error('Archived accepted partial cohort drifted from twelve shared-scope cards.');
	}
	const sharedCards = [stoppingReplacement];
	const higherCards = HIGHER_COMPONENT_IDS.map((componentId) => {
		const original = candidateByComponent.get(componentId);
		if (!original || !HIGHER_CARD_IDS.includes(original.id)) {
			throw new Error(`Missing exact original Higher candidate for ${componentId}.`);
		}
		return original;
	});

	const partialAcceptedSourceEvidence = filteredSourceEvidence(sourceEvidence, {
		plan: partialAcceptedPlan(partialAcceptedCards),
		offeringIds: [FOUNDATION_OFFERING_ID, HIGHER_OFFERING_ID],
		componentIds: partialAcceptedCards.map((card) => card.curriculumComponentId)
	});
	const sharedSourceEvidence = filteredSourceEvidence(sourceEvidence, {
		plan: recoveryPlan('shared-rejected'),
		offeringIds: [FOUNDATION_OFFERING_ID, HIGHER_OFFERING_ID],
		componentIds: [stoppingReplacement.curriculumComponentId]
	});
	const higherSourceEvidence = filteredSourceEvidence(sourceEvidence, {
		plan: recoveryPlan('higher-only'),
		offeringIds: [HIGHER_OFFERING_ID],
		componentIds: HIGHER_COMPONENT_IDS
	});

	const partialAcceptedDraft = draftBundle({
		releaseId: PARTIAL_ACCEPTED_RELEASE_ID,
		cards: partialAcceptedCards,
		sourceEvidence: partialAcceptedSourceEvidence,
		generatorSummary: generationSummary,
		reviewerSummary: originalReviewSummary,
		finishedAt: originalReviewSummary.finishedAt
	});
	const sharedDraft = draftBundle({
		releaseId: SHARED_RELEASE_ID,
		cards: sharedCards,
		sourceEvidence: sharedSourceEvidence,
		generatorSummary: generationSummary,
		reviewerSummary: originalReviewSummary,
		finishedAt: repairGenerationSummary.finishedAt,
		supplementalRuns: [
			{
				purpose: 'targeted-card-repair',
				promptVersion: REVIEWED_CARD_REPAIR_PROMPT_VERSION,
				cardIds: [STOPPING_CARD_ID],
				generator: modelRun(repairGenerationSummary),
				reviewer: {
					model: RECOVERY_MODEL,
					thinkingLevel: RECOVERY_THINKING_LEVEL,
					runId: 'pending-fresh-review',
					independentTurn: true
				},
				startedAt: repairGenerationSummary.startedAt,
				finishedAt: repairGenerationSummary.finishedAt
			}
		]
	});
	const higherDraft = draftBundle({
		releaseId: HIGHER_RELEASE_ID,
		cards: higherCards,
		sourceEvidence: higherSourceEvidence,
		generatorSummary: generationSummary,
		reviewerSummary: {
			...originalReviewSummary,
			threadId: 'pending-fresh-review'
		},
		finishedAt: originalReviewSummary.finishedAt
	});
	const partialAcceptedValidated = validateRecoveryBundle(partialAcceptedDraft, catalog);
	// Pending draft lineages contain syntactically valid ids solely to exercise
	// the complete artifact and curriculum invariants before any model call.
	validateRecoveryBundle(sharedDraft, catalog);
	validateRecoveryBundle(higherDraft, catalog);
	assertNoInternalCollisions([partialAcceptedDraft, sharedDraft, higherDraft]);

	return {
		version: REVIEWED_SPLIT_RECOVERY_VERSION,
		sourceBatchId: SOURCE_BATCH_ID,
		archivedRuns: {
			generator: generationSummary,
			originalReviewer: originalReviewSummary,
			repairGenerator: repairGenerationSummary
		},
		partialAccepted: {
			plan: partialAcceptedPlan(partialAcceptedCards),
			cards: partialAcceptedCards,
			sourceEvidence: partialAcceptedSourceEvidence,
			validated: partialAcceptedValidated
		},
		shared: {
			plan: recoveryPlan('shared-rejected'),
			cards: sharedCards,
			freshReviewCards: [stoppingReplacement],
			preservedAcceptedCardIds: [],
			sourceEvidence: sharedSourceEvidence
		},
		higher: {
			plan: recoveryPlan('higher-only'),
			cards: higherCards,
			freshReviewCards: higherCards,
			preservedAcceptedCardIds: [],
			sourceEvidence: higherSourceEvidence
		}
	};
}

export function buildReviewedSplitRecoveryPrompt(cohort) {
	const historicalIssues =
		cohort.plan.mode === 'shared-rejected'
			? { [STOPPING_CARD_ID]: STOPPING_REVIEW_ISSUE }
			: HIGHER_REVIEW_ISSUES;
	return `You are the fresh independent reviewer for a narrowly scoped, import-grade GCSE study-card recovery. No content generation or rewriting is allowed.

Review only the supplied card(s) under the exact corrected offering scope. Treat the historical issue only as audit context; decide independently from the official source text. Accept only when the exact excerpt and locator support the front, back, explanation and feedback; the tier/offering mapping is correct; the prompt is unambiguous; there are three or four unique choices with exactly one correct choice equal to back; each distractor is plausible and distinct; and any memory tip is honest. Return one review per card in the supplied order. An accepted review has no issues. Output JSON only.

Recovery plan:
${JSON.stringify(cohort.plan, null, 2)}

Historical issues being re-reviewed:
${JSON.stringify(historicalIssues, null, 2)}

Exact candidates (do not rewrite):
${JSON.stringify(cohort.freshReviewCards, null, 2)}

Exact official source scope:
${JSON.stringify(
	{
		specification: cohort.sourceEvidence.specification,
		offerings: cohort.sourceEvidence.offerings,
		topics: cohort.sourceEvidence.topics
	},
	null,
	2
)}`;
}

export function reviewedSplitRecoveryReviewSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['reviews'],
		properties: {
			reviews: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['cardId', 'accepted', 'issues', 'learnerValue'],
					properties: {
						cardId: { type: 'string' },
						accepted: { type: 'boolean' },
						issues: { type: 'array', items: { type: 'string' } },
						learnerValue: { type: 'array', items: { type: 'string' } }
					}
				}
			}
		}
	};
}

export function validateAcceptedRecoveryReview(value, cards, label = 'fresh review') {
	const reviews = exactReviews(value, cards);
	for (const review of reviews) {
		if (!review.accepted || review.issues.length) {
			throw new Error(`${label} did not accept ${review.cardId}: ${review.issues.join('; ')}`);
		}
	}
	return { reviews };
}

export function buildReviewedSplitRecoveryArtifacts({
	preflight,
	sharedReview,
	higherReview,
	sharedReviewSummary,
	higherReviewSummary,
	catalog
}) {
	validateAcceptedRecoveryReview(
		sharedReview,
		preflight.shared.freshReviewCards,
		'shared recovery review'
	);
	validateAcceptedRecoveryReview(
		higherReview,
		preflight.higher.freshReviewCards,
		'Higher recovery review'
	);
	assertPassedRun(sharedReviewSummary, 'shared recovery reviewer');
	assertPassedRun(higherReviewSummary, 'Higher recovery reviewer');
	const archivedIds = new Set(
		Object.values(preflight.archivedRuns).map((summary) => summary.threadId)
	);
	if (
		archivedIds.has(sharedReviewSummary.threadId) ||
		archivedIds.has(higherReviewSummary.threadId) ||
		sharedReviewSummary.threadId === higherReviewSummary.threadId
	) {
		throw new Error('Fresh recovery reviews must use new independent run ids.');
	}

	const sharedBundle = draftBundle({
		releaseId: SHARED_RELEASE_ID,
		cards: preflight.shared.cards,
		sourceEvidence: preflight.shared.sourceEvidence,
		generatorSummary: preflight.archivedRuns.generator,
		reviewerSummary: preflight.archivedRuns.originalReviewer,
		finishedAt: sharedReviewSummary.finishedAt,
		supplementalRuns: [
			{
				purpose: 'targeted-card-repair',
				promptVersion: REVIEWED_CARD_REPAIR_PROMPT_VERSION,
				cardIds: [STOPPING_CARD_ID],
				generator: modelRun(preflight.archivedRuns.repairGenerator),
				reviewer: { ...modelRun(sharedReviewSummary), independentTurn: true },
				startedAt: preflight.archivedRuns.repairGenerator.startedAt,
				finishedAt: sharedReviewSummary.finishedAt
			}
		]
	});
	const higherBundle = draftBundle({
		releaseId: HIGHER_RELEASE_ID,
		cards: preflight.higher.cards,
		sourceEvidence: preflight.higher.sourceEvidence,
		generatorSummary: preflight.archivedRuns.generator,
		reviewerSummary: higherReviewSummary,
		finishedAt: higherReviewSummary.finishedAt
	});
	const shared = validateRecoveryBundle(sharedBundle, catalog);
	const higher = validateRecoveryBundle(higherBundle, catalog);
	assertNoInternalCollisions([shared.bundle, higher.bundle]);
	return { shared, higher };
}

export function reviewedSplitRecoveryCollisions(recoveries, existingBundles) {
	const collisions = [];
	const releaseIds = new Set(existingBundles.map((bundle) => bundle.release.id));
	const cardIds = new Set(existingBundles.flatMap((bundle) => bundle.cards.map((card) => card.id)));
	const concepts = new Set(
		existingBundles.flatMap((bundle) =>
			bundle.cards.map((card) => `${card.board}:${card.subject}:${card.conceptKey}`)
		)
	);
	for (const recovery of recoveries) {
		if (releaseIds.has(recovery.release.id)) collisions.push(`release ${recovery.release.id}`);
		for (const card of recovery.cards) {
			if (cardIds.has(card.id)) collisions.push(`card ${card.id}`);
			const concept = `${card.board}:${card.subject}:${card.conceptKey}`;
			if (concepts.has(concept)) collisions.push(`concept ${concept}`);
		}
	}
	return collisions;
}

export function assertReviewedSplitRecoveryQueueTerminal(queue) {
	if (!queue?.finishedAt) {
		throw new Error(
			'The descendant-coverage queue is still live; refusing all recovery model calls.'
		);
	}
	return queue;
}

function assertSourcePlan(plan) {
	if (
		plan?.batchId !== SOURCE_BATCH_ID ||
		plan?.specificationId !== 'aqa-gcse-combined-science-trilogy-8464-v1.1' ||
		plan?.subject !== 'Physics' ||
		plan?.promptVersion !== 'standard-study-card-descendant-coverage-v1' ||
		plan?.generationMode !== 'required-descendants' ||
		plan?.expectedCardCount !== 15 ||
		stableStringify(plan.offeringIds) !==
			stableStringify([FOUNDATION_OFFERING_ID, HIGHER_OFFERING_ID]) ||
		stableStringify(plan.requiredComponentIds) !== stableStringify(SOURCE_COMPONENT_IDS)
	) {
		throw new Error('Archived failed-batch plan drifted from the exact reviewed split source.');
	}
}

function recoveryPlan(mode) {
	const shared = mode === 'shared-rejected';
	return {
		schemaVersion: STUDY_CARD_SCHEMA_VERSION,
		recoveryVersion: REVIEWED_SPLIT_RECOVERY_VERSION,
		mode,
		sourceBatchId: SOURCE_BATCH_ID,
		releaseId: shared ? SHARED_RELEASE_ID : HIGHER_RELEASE_ID,
		specificationId: 'aqa-gcse-combined-science-trilogy-8464-v1.1',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Physics',
		offeringIds: shared ? [FOUNDATION_OFFERING_ID, HIGHER_OFFERING_ID] : [HIGHER_OFFERING_ID],
		requiredComponentIds: shared
			? ['aqa-gcse-combined-science-trilogy-8464-v1.1:6-5-4-3']
			: [...HIGHER_COMPONENT_IDS],
		expectedCardCount: shared ? 1 : HIGHER_COMPONENT_IDS.length,
		generationPolicy: 'reuse-exact-archived-content-no-regeneration',
		freshReviewCardIds: shared ? [STOPPING_CARD_ID] : [...HIGHER_CARD_IDS]
	};
}

function partialAcceptedPlan(cards) {
	return {
		schemaVersion: STUDY_CARD_SCHEMA_VERSION,
		recoveryVersion: REVIEWED_PARTIAL_ACCEPTED_RECOVERY_VERSION,
		mode: 'partial-archived-review-acceptance',
		sourceBatchId: SOURCE_BATCH_ID,
		releaseId: PARTIAL_ACCEPTED_RELEASE_ID,
		specificationId: 'aqa-gcse-combined-science-trilogy-8464-v1.1',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Physics',
		offeringIds: [FOUNDATION_OFFERING_ID, HIGHER_OFFERING_ID],
		requiredComponentIds: cards.map((card) => card.curriculumComponentId),
		expectedCardCount: cards.length,
		acceptancePolicy: 'include-only-cards-explicitly-accepted-by-the-archived-independent-reviewer',
		modelCallsDuringRecovery: 0
	};
}

function filteredSourceEvidence(sourceEvidence, { plan, offeringIds, componentIds }) {
	const componentSet = new Set(componentIds);
	const output = {
		plan,
		specification: sourceEvidence.specification,
		offerings: sourceEvidence.offerings.filter((offering) => offeringIds.includes(offering.id)),
		topics: sourceEvidence.topics
			.map((topic) => ({
				...topic,
				components: topic.components.filter((component) => componentSet.has(component.id))
			}))
			.filter((topic) => topic.components.length)
	};
	if (output.offerings.length !== offeringIds.length) {
		throw new Error('Filtered recovery evidence lost an offering.');
	}
	const found = output.topics.flatMap((topic) => topic.components.map((component) => component.id));
	if (stableStringify(found) !== stableStringify(componentIds)) {
		throw new Error('Filtered recovery evidence lost or reordered a component.');
	}
	return output;
}

function draftBundle({
	releaseId,
	cards,
	sourceEvidence,
	generatorSummary,
	reviewerSummary,
	finishedAt,
	supplementalRuns = []
}) {
	const sourceManifestHash = sha256(
		stableStringify({
			specification: sourceEvidence.specification,
			offerings: sourceEvidence.offerings,
			topics: sourceEvidence.topics
		})
	);
	const release = {
		id: releaseId,
		promptVersion: 'standard-study-card-descendant-coverage-v1',
		generator: modelRun(generatorSummary),
		reviewer: { ...modelRun(reviewerSummary), independentTurn: true },
		...(supplementalRuns.length ? { supplementalRuns } : {}),
		startedAt: generatorSummary.startedAt,
		finishedAt,
		sourceManifestHash,
		artifactPath: `data/study-cards/releases/${releaseId}/accepted-study-cards.json`
	};
	const boundCards = cards.map((card) => bindCandidate(card, sourceEvidence));
	return {
		schemaVersion: STUDY_CARD_SCHEMA_VERSION,
		release,
		cards: boundCards,
		coverage: buildCoverage(boundCards, sourceEvidence.offerings)
	};
}

function bindCandidate(card, sourceEvidence) {
	const component = sourceEvidence.topics
		.flatMap((topic) => topic.components)
		.find((entry) => entry.id === card.curriculumComponentId);
	if (!component) throw new Error(`${card.id} has no exact filtered source component.`);
	const topic = sourceEvidence.topics.find(
		(entry) => entry.topicComponentId === card.topicComponentId
	);
	if (
		!topic ||
		component.locator !== card.sourceLocator ||
		!component.text.includes(card.sourceExcerpt)
	) {
		throw new Error(`${card.id} source excerpt or locator drifted.`);
	}
	const correct = card.choices.filter((choice) => choice.isCorrect === true);
	if (correct.length !== 1 || correct[0].text.trim() !== card.back.trim()) {
		throw new Error(`${card.id} correct choice no longer equals back.`);
	}
	const applicable = sourceEvidence.offerings.filter((offering) =>
		offering.selectableComponentIds.includes(card.topicComponentId)
	);
	if (!applicable.length) throw new Error(`${card.id} has no applicable corrected offering.`);
	return {
		id: card.id,
		conceptKey: card.conceptKey,
		kind: card.kind,
		visualCue: card.visualCue,
		front: card.front,
		back: card.back,
		reverseFront: card.reverseFront ?? null,
		reverseBack: card.reverseBack ?? null,
		explanation: card.explanation,
		memoryTip: card.memoryTip ?? null,
		choices: card.choices,
		board: sourceEvidence.specification.board,
		qualification: sourceEvidence.specification.qualification,
		subject: 'Physics',
		contentRevision: 1,
		sources: [
			{
				kind: 'curriculum-specification',
				url: sourceEvidence.specification.landingUrl,
				title: sourceEvidence.specification.title,
				locator: card.sourceLocator,
				excerpt: card.sourceExcerpt,
				sourceHash: sourceEvidence.specification.sha256,
				rightsBasis: 'official_exam_board_specification',
				supports: ['front', 'back', 'explanation', ...(card.memoryTip ? ['memoryTip'] : [])]
			}
		],
		targets: applicable.map((offering, index) => ({
			offeringId: offering.id,
			curriculumComponentId: card.curriculumComponentId,
			topicComponentId: card.topicComponentId,
			isPrimary: index === 0,
			confidence: 1,
			reviewed: true
		}))
	};
}

function buildCoverage(cards, offerings) {
	return offerings.flatMap((offering) =>
		[
			...new Set(
				cards.flatMap((card) =>
					card.targets
						.filter((target) => target.offeringId === offering.id)
						.map((target) => target.topicComponentId)
				)
			)
		]
			.sort()
			.map((topicComponentId) => ({
				offeringId: offering.id,
				topicComponentId,
				status: 'ready',
				cardCount: cards.filter((card) =>
					card.targets.some(
						(target) =>
							target.offeringId === offering.id && target.topicComponentId === topicComponentId
					)
				).length,
				reason: null
			}))
	);
}

function validateRecoveryBundle(bundle, catalog) {
	const validated = validateStudyCardBundle(bundle);
	assertStudyCardCurriculumScope(validated, catalog);
	return { bundle, validated, artifactHash: hashStudyCardArtifact(validated) };
}

function assertNoInternalCollisions(bundles) {
	const ids = bundles.flatMap((bundle) => bundle.cards.map((card) => card.id));
	const concepts = bundles.flatMap((bundle) =>
		bundle.cards.map((card) => `${card.board}:${card.subject}:${card.conceptKey}`)
	);
	if (new Set(ids).size !== ids.length || new Set(concepts).size !== concepts.length) {
		throw new Error('Recovery cohorts collide with each other.');
	}
}

function exactCards(value, expectedLength, label) {
	if (!value || !Array.isArray(value.cards) || value.cards.length !== expectedLength) {
		throw new Error(`${label} must contain exactly ${expectedLength} cards.`);
	}
	return value.cards;
}

function exactReviews(value, cards) {
	if (!value || !Array.isArray(value.reviews) || value.reviews.length !== cards.length) {
		throw new Error('Review evidence must contain one row per exact card.');
	}
	for (const [index, review] of value.reviews.entries()) {
		if (
			review.cardId !== cards[index].id ||
			typeof review.accepted !== 'boolean' ||
			!Array.isArray(review.issues) ||
			!Array.isArray(review.learnerValue)
		) {
			throw new Error(`Review ${index} no longer matches its exact card.`);
		}
		if (review.accepted && review.issues.length) {
			throw new Error(`Accepted review ${review.cardId} contains issues.`);
		}
	}
	return value.reviews;
}

function validateCandidateSource(card, sourceEvidence) {
	const component = sourceEvidence.topics
		.flatMap((topic) => topic.components)
		.find((entry) => entry.id === card.curriculumComponentId);
	if (
		!component ||
		component.locator !== card.sourceLocator ||
		!component.text.includes(card.sourceExcerpt)
	) {
		throw new Error(`${card.id} no longer has exact official source evidence.`);
	}
	if (!Array.isArray(card.choices) || card.choices.length < 3 || card.choices.length > 4) {
		throw new Error(`${card.id} must retain three or four choices.`);
	}
}

function assertSameIdentity(original, replacement) {
	for (const field of ['id', 'conceptKey', 'topicComponentId', 'curriculumComponentId']) {
		if (!original || original[field] !== replacement[field]) {
			throw new Error(`Stopping-distance repair changed ${field}.`);
		}
	}
}

function assertPassedRun(summary, label) {
	if (
		summary?.status !== 'passed' ||
		summary?.model !== RECOVERY_MODEL ||
		summary?.thinkingLevel !== RECOVERY_THINKING_LEVEL ||
		!summary?.threadId ||
		!summary?.startedAt ||
		!summary?.finishedAt
	) {
		throw new Error(`${label} is not a passed ${RECOVERY_MODEL}/${RECOVERY_THINKING_LEVEL} run.`);
	}
}

function modelRun(summary) {
	return {
		model: summary.model,
		thinkingLevel: summary.thinkingLevel,
		runId: summary.threadId
	};
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
