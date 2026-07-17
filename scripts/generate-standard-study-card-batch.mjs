#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import {
	STUDY_CARD_KINDS,
	STUDY_CARD_SCHEMA_VERSION,
	expectedStudyCardArtifactRelativePath,
	hashStudyCardArtifact,
	validateStudyCardBundle
} from './lib/study-card-artifact.mjs';
import {
	isKebabCaseStudyCardKey,
	normalizeReviewedChoiceKeys,
	partitionStandardStudyCardCandidates,
	STANDARD_STUDY_CARD_PROMPT_VERSION,
	standardStudyCardMemoryTipIssue,
	standardStudyCardSourceExcerptIssue
} from './lib/standard-study-card-compiler.mjs';

const SCHEMA_VERSION = STUDY_CARD_SCHEMA_VERSION;
const PROMPT_VERSION = STANDARD_STUDY_CARD_PROMPT_VERSION;
const DESCENDANT_COVERAGE_PROMPT_VERSION = 'standard-study-card-descendant-coverage-v2';
const TARGETED_REPAIR_PROMPT_VERSION = 'standard-study-card-targeted-repair-v2';
const REVIEWED_CARD_REPAIR_PROMPT_VERSION = 'standard-study-card-reviewed-repair-v3';
const MODEL = 'gpt-5.6-sol';
const THINKING_LEVEL = 'max';
const CARD_KINDS = [
	'definition',
	'formula',
	'process',
	'test-result',
	'unit',
	'practical',
	'fact',
	'comparison',
	'plot',
	'quotation',
	'character',
	'theme',
	'context',
	'method',
	'case-study',
	'chronology',
	'cause-consequence',
	'interpretation',
	'technique',
	'structure'
];
if (CARD_KINDS.some((kind) => !STUDY_CARD_KINDS.includes(kind))) {
	throw new Error('The generator kind list has drifted from the durable study-card contract.');
}

const rootDir = process.cwd();
loadDefaultEnv(rootDir);
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
if (args.resumeReviewed && (args.force || args.repairFrom)) {
	throw new Error('--resume-reviewed is mutually exclusive with --force and --repair-from.');
}
if (
	args.resumeGenerated &&
	(args.force || args.resumeReviewed || args.repairFrom || args.reviewedRepairFrom)
) {
	throw new Error(
		'--resume-generated is mutually exclusive with --force, repair modes and --resume-reviewed.'
	);
}
if (args.carryRepairFrom && !args.repairFrom) {
	throw new Error('--carry-repair-from requires --repair-from.');
}
if (args.reviewCarriedValid && (!args.repairFrom || !args.carryRepairFrom)) {
	throw new Error('--review-carried-valid requires --repair-from and --carry-repair-from.');
}
if (args.reviewCarriedValid && args.generate) {
	throw new Error('--review-carried-valid is a no-generation path; do not pass --generate.');
}
if (args.reviewedRepairFrom && (!args.repairCardId || args.repairFrom || args.resumeReviewed)) {
	throw new Error(
		'--reviewed-repair-from requires --repair-card-id and is incompatible with --repair-from/--resume-reviewed.'
	);
}
if (args.model !== MODEL || args.thinkingLevel !== THINKING_LEVEL) {
	throw new Error(`Import-grade study-card batches require ${MODEL}/${THINKING_LEVEL}.`);
}

const catalog = JSON.parse(readFileSync(path.resolve(args.catalog), 'utf8'));
const specification = catalog.specifications.find((entry) => entry.id === args.specificationId);
if (!specification) throw new Error(`Unknown specification ${args.specificationId}.`);
const offerings = catalog.offerings.filter(
	(entry) =>
		entry.specificationId === specification.id &&
		entry.profileSubject === args.subject &&
		(args.offeringIds.length === 0 || args.offeringIds.includes(entry.id))
);
if (offerings.length === 0) throw new Error(`No ${args.subject} offerings selected.`);
if (args.offeringIds.some((id) => !offerings.some((offering) => offering.id === id))) {
	throw new Error('At least one --offering-id is not compatible with the selected specification.');
}

const selectedTopicIds = new Set(offerings.flatMap((offering) => offering.selectableComponentIds));
const componentById = new Map(
	specification.components.map((component) => [component.id, component])
);
const selectedTopicFor = (componentId) => {
	let current = componentById.get(componentId);
	while (current) {
		if (selectedTopicIds.has(current.id)) return current.id;
		current = componentById.get(current.parentId);
	}
	return null;
};
const requiredComponents = args.requiredComponentIds.map((id) => {
	const component = componentById.get(id);
	if (!component) throw new Error(`Unknown required curriculum component ${id}.`);
	if (component.kind !== 'section' && component.kind !== 'topic') {
		throw new Error(`Required component ${id} must be an official section or topic descendant.`);
	}
	const topicComponentId = selectedTopicFor(id);
	if (!topicComponentId) {
		throw new Error(`Required component ${id} is outside the chosen offering scope.`);
	}
	if (offerings.some((offering) => offering.tier === 'Foundation') && isHigherOnly(component)) {
		throw new Error(
			`Required component ${id} is Higher-only but a Foundation offering is selected.`
		);
	}
	return { component, topicComponentId };
});
if (new Set(args.requiredComponentIds).size !== args.requiredComponentIds.length) {
	throw new Error('--required-component-id values must be unique.');
}
const requiredTopicIds = new Set(requiredComponents.map((entry) => entry.topicComponentId));
const requestedTopicIds = requiredComponents.length
	? requiredTopicIds
	: args.topicComponentIds.length
		? new Set(args.topicComponentIds)
		: selectedTopicIds;
const topics = specification.components
	.filter((component) => requestedTopicIds.has(component.id) && selectedTopicIds.has(component.id))
	.sort((left, right) => left.displayOrder - right.displayOrder);
if (topics.length === 0) throw new Error('No selectable curriculum topics were selected.');
for (const id of requestedTopicIds) {
	if (!topics.some((topic) => topic.id === id)) {
		throw new Error(`Topic ${id} is not selectable in the chosen offering set.`);
	}
}

if (
	requiredComponents.length > 0 &&
	args.topicComponentIds.some((id) => !requiredTopicIds.has(id))
) {
	throw new Error('--topic-component-id contains a topic with no required descendant.');
}

const pdfPath = resolvePdfPath(specification, args.sourceRoot);
const sourcePdfSha256 = sha256(readFileSync(pdfPath));
if (sourcePdfSha256 !== specification.sha256) {
	throw new Error(
		`Official source PDF hash differs from the catalog lock for ${specification.id}: expected ${specification.sha256}, found ${sourcePdfSha256}.`
	);
}
const requiredComponentIdSet = new Set(args.requiredComponentIds);
const sourceTopics = topics.map((topic) =>
	sourceForTopic(
		specification,
		topic,
		pdfPath,
		requiredComponents.length ? requiredComponentIdSet : null
	)
);
const orderedRequiredComponentIds = requiredComponents.length
	? sourceTopics.flatMap((topic) => topic.components.map((component) => component.id))
	: [];
const batchId =
	args.batchId ??
	`${slug(args.subject)}-${new Date().toISOString().replace(/[:.]/g, '-').toLowerCase()}-v1`;
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(batchId)) {
	throw new Error('--batch-id must be lowercase kebab-case.');
}
const workDir = path.resolve(args.workDir ?? `tmp/study-card-generation/${batchId}`);
const artifactRelativePath = expectedStudyCardArtifactRelativePath(batchId);
const artifactDir = path.dirname(path.resolve(artifactRelativePath));

const plan = {
	schemaVersion: SCHEMA_VERSION,
	promptVersion: requiredComponents.length ? DESCENDANT_COVERAGE_PROMPT_VERSION : PROMPT_VERSION,
	batchId,
	specificationId: specification.id,
	board: specification.board,
	qualification: specification.qualification,
	subject: args.subject,
	offeringIds: offerings.map((entry) => entry.id),
	topicComponentIds: topics.map((entry) => entry.id),
	...(requiredComponents.length
		? {
				generationMode: 'required-descendants',
				requiredComponentIds: orderedRequiredComponentIds
			}
		: {
				countPerTopic: args.countPerTopic,
				minimumAcceptedPerTopic: args.minimumAcceptedPerTopic
			}),
	expectedCardCount: requiredComponents.length
		? orderedRequiredComponentIds.length
		: topics.length * args.countPerTopic,
	model: args.model,
	thinkingLevel: args.thinkingLevel,
	sourcePdf: {
		path: path.relative(rootDir, pdfPath),
		sha256: sourcePdfSha256
	}
};
if (args.reviewedRepairFrom) {
	await runReviewedCardRepair();
	process.exit(0);
}
if (args.repairFrom) {
	await runTargetedRepair();
	process.exit(0);
}
if (!args.generate && !args.resumeGenerated) {
	console.log(
		JSON.stringify({ ...plan, note: 'Pass --generate to run generation and review.' }, null, 2)
	);
	process.exit(0);
}

if (existsSync(artifactDir)) {
	throw new Error(`Durable artifact directory exists: ${path.relative(rootDir, artifactDir)}`);
}
let startedAt;
let generation;
let candidates;
let review;
let reviews;
let deterministicInvalidCards = [];
let repairGeneration = null;
let repairedCards = [];
let reviewedRepairRuns = [];
if (args.resumeReviewed) {
	if (!existsSync(workDir)) {
		throw new Error(`Cannot resume missing work directory: ${path.relative(rootDir, workDir)}`);
	}
	const savedPlan = JSON.parse(readFileSync(path.join(workDir, 'plan.json'), 'utf8'));
	if (stableStringify(savedPlan) !== stableStringify(plan)) {
		throw new Error('The saved reviewed batch plan differs from the requested plan.');
	}
	const generationSummary = loadPassedStageSummary('generation');
	const reviewSummary = loadPassedStageSummary('review');
	startedAt = generationSummary.startedAt;
	generation = { threadId: generationSummary.threadId, usage: generationSummary.usage };
	review = { threadId: reviewSummary.threadId, usage: reviewSummary.usage };
	candidates = validateCandidates(
		JSON.parse(readFileSync(path.join(workDir, 'candidate-cards.json'), 'utf8')),
		{
			plan,
			specification,
			offerings,
			sourceTopics,
			allowReviewedLegacyChoiceKeys: true,
			allowPartial: true
		}
	);
	if (existsSync(path.join(workDir, 'failure-diagnostics.json'))) {
		deterministicInvalidCards = JSON.parse(
			readFileSync(path.join(workDir, 'failure-diagnostics.json'), 'utf8')
		).invalidCards;
	}
	if (existsSync(path.join(workDir, 'generation-repair', 'codex-run-summary.json'))) {
		const summary = loadPassedStageSummary('generation-repair');
		repairGeneration = {
			threadId: summary.threadId,
			usage: summary.usage,
			startedAt: summary.startedAt,
			finishedAt: summary.finishedAt
		};
		repairedCards = JSON.parse(
			readFileSync(path.join(workDir, 'repair-candidate-cards.json'), 'utf8')
		).cards;
	}
	reviews = validateReviews(
		JSON.parse(readFileSync(path.join(workDir, 'review.json'), 'utf8')),
		candidates.cards
	);
} else if (args.resumeGenerated) {
	if (!existsSync(workDir)) {
		throw new Error(`Cannot resume missing work directory: ${path.relative(rootDir, workDir)}`);
	}
	const savedPlan = JSON.parse(readFileSync(path.join(workDir, 'plan.json'), 'utf8'));
	if (stableStringify(savedPlan) !== stableStringify(plan)) {
		throw new Error('The saved generated batch plan differs from the requested plan.');
	}
	const generationSummary = loadPassedStageSummary('generation');
	startedAt = generationSummary.startedAt;
	generation = { threadId: generationSummary.threadId, usage: generationSummary.usage };
	candidates = validateCandidates(
		JSON.parse(readFileSync(path.join(workDir, 'candidate-cards.json'), 'utf8')),
		{
			plan,
			specification,
			offerings,
			sourceTopics,
			allowReviewedLegacyChoiceKeys: true,
			allowPartial: true
		}
	);
	deterministicInvalidCards = JSON.parse(
		readFileSync(path.join(workDir, 'failure-diagnostics.json'), 'utf8')
	).invalidCards;
	if (existsSync(path.join(workDir, 'generation-repair', 'codex-run-summary.json'))) {
		const summary = loadPassedStageSummary('generation-repair');
		repairGeneration = {
			threadId: summary.threadId,
			usage: summary.usage,
			startedAt: summary.startedAt,
			finishedAt: summary.finishedAt
		};
		repairedCards = JSON.parse(
			readFileSync(path.join(workDir, 'repair-candidate-cards.json'), 'utf8')
		).cards;
	}
	if (existsSync(path.join(workDir, 'review'))) {
		throw new Error(
			'Archive or remove the previous review directory before --resume-generated; its evidence must not be overwritten.'
		);
	}
	const reviewPrompt = buildReviewPrompt({
		plan,
		specification,
		offerings,
		sourceTopics,
		candidates
	});
	writeFileSync(path.join(workDir, 'review-prompt.txt'), `${reviewPrompt}\n`);
	review = await runStage('review', reviewPrompt, buildReviewSchema());
	reviews = validateReviews(parseOutput(review.finalResponse), candidates.cards);
	writeJson(path.join(workDir, 'review.json'), reviews);
} else {
	if (existsSync(workDir)) {
		if (!args.force) throw new Error(`Work directory exists: ${path.relative(rootDir, workDir)}`);
		rmSync(workDir, { recursive: true, force: true });
	}
	mkdirSync(workDir, { recursive: true });
	writeJson(path.join(workDir, 'plan.json'), plan);
	writeJson(path.join(workDir, 'source-evidence.json'), {
		plan,
		specification: publicSpecification(specification),
		offerings: offerings.map(publicOffering),
		topics: sourceTopics
	});

	startedAt = new Date().toISOString();
	const generationPrompt = buildGenerationPrompt({
		plan,
		specification,
		offerings,
		sourceTopics,
		countPerTopic: args.countPerTopic
	});
	writeFileSync(path.join(workDir, 'generation-prompt.txt'), `${generationPrompt}\n`);
	generation = await runStage('generation', generationPrompt, buildGenerationSchema());
	const rawCandidates = scopeRequiredCandidateIdentities(parseOutput(generation.finalResponse));
	if (
		!Array.isArray(rawCandidates.cards) ||
		rawCandidates.cards.length !== plan.expectedCardCount
	) {
		writeJson(path.join(workDir, 'failure-diagnostics.json'), {
			invalidCards: [],
			batchIssue: `Generator returned ${rawCandidates.cards?.length ?? 0}; expected ${plan.expectedCardCount}.`
		});
		throw new Error('Generator output does not contain the planned candidate count.');
	}
	writeJson(path.join(workDir, 'raw-candidate-cards.json'), rawCandidates);
	const idCounts = countValues(rawCandidates.cards.map((card) => card?.id));
	const conceptCounts = countValues(rawCandidates.cards.map((card) => card?.conceptKey));
	const partition = partitionGeneratedCandidates({
		cards: rawCandidates.cards,
		plan,
		topicComponentIds: topics.map((topic) => topic.id),
		minimumAcceptedPerTopic: args.minimumAcceptedPerTopic,
		topicComponentId: (card) => card?.topicComponentId,
		validateCard: (card) => {
			if (idCounts.get(card?.id) !== 1 || conceptCounts.get(card?.conceptKey) !== 1) {
				throw new Error('Candidate has a duplicated card or concept identity.');
			}
			validateCandidates(
				{ cards: [card] },
				{
					plan,
					specification,
					offerings,
					sourceTopics,
					allowPartial: true
				}
			);
		}
	});
	deterministicInvalidCards = partition.invalidCards;
	writeJson(path.join(workDir, 'failure-diagnostics.json'), {
		invalidCards: deterministicInvalidCards.map((entry) => ({
			index: entry.index,
			cardId: entry.card?.id ?? null,
			topicComponentId: entry.card?.topicComponentId ?? null,
			...(entry.requiredComponentId
				? {
						requiredComponentId: entry.requiredComponentId,
						requiredTopicComponentId: entry.requiredTopicComponentId,
						repairIdentity: entry.repairIdentity
					}
				: {}),
			issue: entry.issue,
			card: entry.card
		})),
		validCountByTopic: partition.validCountByTopic,
		topicsBelowMinimum: partition.topicsBelowMinimum,
		repairCardIds: partition.repairCandidates.map((entry) => entry.card?.id ?? null)
	});
	if (partition.unrepairableTopics.length > 0) {
		throw new Error(
			`Generated identities cannot restore ${partition.unrepairableTopics.length} topic(s) to the deterministic coverage gate.`
		);
	}
	if (partition.repairCandidates.length > 0) {
		const repairPrompt = buildTargetedRepairPrompt({
			invalidCards: partition.repairCandidates
		});
		writeFileSync(path.join(workDir, 'generation-repair-prompt.txt'), `${repairPrompt}\n`);
		repairGeneration = await runStage('generation-repair', repairPrompt, buildGenerationSchema());
		writeFileSync(
			path.join(workDir, 'generation-repair-model-output.json'),
			`${repairGeneration.finalResponse}\n`
		);
		const repairedRaw = parseOutput(repairGeneration.finalResponse);
		if (
			!Array.isArray(repairedRaw.cards) ||
			repairedRaw.cards.length !== partition.repairCandidates.length
		) {
			throw new Error(
				`Targeted coverage repair returned ${repairedRaw.cards?.length ?? 0}; expected ${partition.repairCandidates.length}.`
			);
		}
		repairedCards = repairedRaw.cards.map((card, index) => {
			const repairEntry = partition.repairCandidates[index];
			const expected = repairEntry.repairIdentity ?? repairEntry.card;
			if (
				card.id !== expected.id ||
				card.conceptKey !== expected.conceptKey ||
				card.topicComponentId !== expected.topicComponentId ||
				(repairEntry.requiredComponentId &&
					card.curriculumComponentId !== repairEntry.requiredComponentId)
			) {
				throw new Error(`Targeted coverage repair ${index} changed its identity.`);
			}
			return validateCandidates(
				{ cards: [card] },
				{
					plan,
					specification,
					offerings,
					sourceTopics,
					allowPartial: true
				}
			).cards[0];
		});
		writeJson(path.join(workDir, 'repair-candidate-cards.json'), { cards: repairedCards });
	}
	const validIndexes = new Set(
		partition.validCards.map((card) => rawCandidates.cards.indexOf(card))
	);
	const repairedByIndex = new Map(
		partition.repairCandidates.map((entry, index) => [entry.index, repairedCards[index]])
	);
	const reviewableCards = rawCandidates.cards.flatMap((card, index) => {
		const repaired = repairedByIndex.get(index);
		if (repaired) return [repaired];
		return validIndexes.has(index) ? [card] : [];
	});
	candidates = validateCandidates(
		{ cards: reviewableCards },
		{
			plan,
			specification,
			offerings,
			sourceTopics,
			allowPartial: true
		}
	);
	const deterministicCountByTopic = countValues(
		candidates.cards.map((card) => card.topicComponentId)
	);
	const deterministicCountByComponent = countValues(
		candidates.cards.map((card) => card.curriculumComponentId)
	);
	const deterministicIncomplete =
		plan.generationMode === 'required-descendants'
			? plan.requiredComponentIds.filter(
					(componentId) => deterministicCountByComponent.get(componentId) !== 1
				)
			: topics.filter(
					(topic) => (deterministicCountByTopic.get(topic.id) ?? 0) < args.minimumAcceptedPerTopic
				);
	if (deterministicIncomplete.length > 0) {
		throw new Error(
			`Targeted coverage repair left ${deterministicIncomplete.length} required scope item(s) below the deterministic gate.`
		);
	}
	writeJson(path.join(workDir, 'candidate-cards.json'), candidates);

	const reviewPrompt = buildReviewPrompt({
		plan,
		specification,
		offerings,
		sourceTopics,
		candidates
	});
	writeFileSync(path.join(workDir, 'review-prompt.txt'), `${reviewPrompt}\n`);
	review = await runStage('review', reviewPrompt, buildReviewSchema());
	reviews = validateReviews(parseOutput(review.finalResponse), candidates.cards);
	writeJson(path.join(workDir, 'review.json'), reviews);
}

const reviewerShortageIndexes = selectReviewerShortageIndexes(candidates, reviews);
if (reviewerShortageIndexes.length > 0) {
	const repairedReview = await repairRequiredReviewerRejections(
		candidates,
		reviews,
		reviewerShortageIndexes
	);
	candidates = repairedReview.candidates;
	reviews = repairedReview.reviews;
	reviewedRepairRuns = repairedReview.runs;
	writeJson(path.join(workDir, 'final-candidate-cards.json'), candidates);
	writeJson(path.join(workDir, 'final-review.json'), reviews);
}

const reviewById = new Map(reviews.reviews.map((entry) => [entry.cardId, entry]));
const acceptedCards = candidates.cards.filter((card) => reviewById.get(card.id)?.accepted);
const reviewerRejectedCards = candidates.cards.flatMap((card) => {
	const result = reviewById.get(card.id);
	return result?.accepted ? [] : [{ stage: 'independent-review', card, review: result }];
});
const reviewedRepairEvidence = reviewedRepairRuns.flatMap((run) => [
	...run.originalRejected.map((entry) => ({
		stage: `independent-review-before-repair-${run.attempt}`,
		supersededByRepair: true,
		card: entry.card,
		review: entry.review
	})),
	...run.replacements.flatMap((card, index) =>
		run.replacementReviews[index].accepted
			? []
			: [
					{
						stage: `independent-repair-review-${run.attempt}`,
						card,
						review: run.replacementReviews[index]
					}
				]
	)
]);
const deterministicRejectedCards = deterministicInvalidCards.map((entry) => ({
	stage: 'deterministic-candidate-validation',
	card: entry.card,
	issue: entry.issue
}));
const rejectedCards = [
	...reviewerRejectedCards,
	...reviewedRepairEvidence,
	...deterministicRejectedCards
];
const acceptedCountByTopic = new Map();
const acceptedComponentIds = new Set();
for (const card of acceptedCards) {
	acceptedCountByTopic.set(
		card.topicComponentId,
		(acceptedCountByTopic.get(card.topicComponentId) ?? 0) + 1
	);
	acceptedComponentIds.add(card.curriculumComponentId);
}
const coverage = offerings.flatMap((offering) =>
	topics
		.filter((topic) => offering.selectableComponentIds.includes(topic.id))
		.map((topic) => {
			const cardCount = acceptedCountByTopic.get(topic.id) ?? 0;
			const requiredIdsForTopic =
				plan.generationMode === 'required-descendants'
					? plan.requiredComponentIds.filter(
							(componentId) => selectedTopicFor(componentId) === topic.id
						)
					: [];
			const requiredAccepted =
				plan.generationMode === 'required-descendants'
					? requiredIdsForTopic.every((componentId) => acceptedComponentIds.has(componentId))
					: cardCount >= args.minimumAcceptedPerTopic;
			return {
				offeringId: offering.id,
				topicComponentId: topic.id,
				status: requiredAccepted ? 'ready' : 'withheld',
				cardCount,
				reason: requiredAccepted
					? null
					: plan.generationMode === 'required-descendants'
						? `Only ${requiredIdsForTopic.filter((componentId) => acceptedComponentIds.has(componentId)).length} of ${requiredIdsForTopic.length} required descendants passed independent review.`
						: `Only ${cardCount} of ${args.minimumAcceptedPerTopic} required cards passed independent review.`
			};
		})
);
const incomplete = coverage.filter((entry) => entry.status !== 'ready');
if (incomplete.length > 0 && !args.allowWithheld) {
	writeJson(path.join(workDir, 'rejected-cards.json'), { cards: rejectedCards });
	writeJson(path.join(workDir, 'coverage.json'), { coverage });
	throw new Error(
		`Independent review left ${incomplete.length} offering/topic rows below the coverage gate.`
	);
}

const finishedAt = new Date().toISOString();
const repairGenerationSummary = repairGeneration
	? loadPassedStageSummary('generation-repair')
	: null;
const acceptedCardIds = new Set(acceptedCards.map((card) => card.id));
const acceptedRepairCardIds = repairedCards
	.map((card) => card.id)
	.filter((cardId) => acceptedCardIds.has(cardId));
const reviewedRepairAcceptedIds = new Set(
	reviewedRepairRuns.flatMap((entry) =>
		entry.replacements.flatMap((card, index) =>
			entry.replacementReviews[index].accepted ? [card.id] : []
		)
	)
);
const initialReviewSummary = loadPassedStageSummary('review');
const supplementalRuns = [
	...(repairGenerationSummary
		? [
				{
					purpose: 'targeted-card-repair',
					promptVersion: TARGETED_REPAIR_PROMPT_VERSION,
					cardIds: acceptedRepairCardIds.filter((cardId) => !reviewedRepairAcceptedIds.has(cardId)),
					generator: {
						model: repairGenerationSummary.model,
						thinkingLevel: repairGenerationSummary.thinkingLevel,
						runId: repairGenerationSummary.threadId
					},
					reviewer: {
						model: initialReviewSummary.model,
						thinkingLevel: initialReviewSummary.thinkingLevel,
						runId: initialReviewSummary.threadId,
						independentTurn: true
					},
					startedAt: repairGenerationSummary.startedAt,
					finishedAt: initialReviewSummary.finishedAt
				}
			].filter((entry) => entry.cardIds.length > 0)
		: []),
	...reviewedRepairRuns.flatMap((entry) => {
		const cardIds = entry.replacements.flatMap((card, index) =>
			entry.replacementReviews[index].accepted ? [card.id] : []
		);
		return cardIds.length
			? [
					{
						purpose: 'targeted-card-repair',
						promptVersion: REVIEWED_CARD_REPAIR_PROMPT_VERSION,
						cardIds,
						generator: {
							model: entry.generationSummary.model,
							thinkingLevel: entry.generationSummary.thinkingLevel,
							runId: entry.generationSummary.threadId
						},
						reviewer: {
							model: entry.reviewSummary.model,
							thinkingLevel: entry.reviewSummary.thinkingLevel,
							runId: entry.reviewSummary.threadId,
							independentTurn: true
						},
						startedAt: entry.generationSummary.startedAt,
						finishedAt: entry.reviewSummary.finishedAt
					}
				]
			: [];
	})
];
const run = {
	id: batchId,
	startedAt,
	finishedAt,
	generator: {
		model: args.model,
		thinkingLevel: args.thinkingLevel,
		threadId: generation.threadId
	},
	reviewer: {
		model: args.model,
		thinkingLevel: args.thinkingLevel,
		threadId: review.threadId,
		independentTurn: true
	},
	...(repairGenerationSummary
		? {
				coverageRepairGenerator: {
					model: repairGenerationSummary.model,
					thinkingLevel: repairGenerationSummary.thinkingLevel,
					threadId: repairGenerationSummary.threadId
				}
			}
		: {})
};
const bundle = {
	schemaVersion: SCHEMA_VERSION,
	release: {
		id: batchId,
		promptVersion: plan.promptVersion,
		generator: {
			model: run.generator.model,
			thinkingLevel: run.generator.thinkingLevel,
			runId: run.generator.threadId
		},
		reviewer: {
			model: run.reviewer.model,
			thinkingLevel: run.reviewer.thinkingLevel,
			runId: run.reviewer.threadId,
			independentTurn: true
		},
		...(supplementalRuns.length ? { supplementalRuns } : {}),
		startedAt,
		finishedAt,
		sourceManifestHash: sha256(
			stableStringify({
				specification: publicSpecification(specification),
				offerings: offerings.map(publicOffering),
				topics: sourceTopics
			})
		),
		artifactPath: artifactRelativePath
	},
	cards: acceptedCards.map((card) => bindCard(card, { specification, offerings, sourceTopics })),
	coverage
};
const validatedBundle = validateStudyCardBundle(bundle);
const artifactHash = hashStudyCardArtifact(validatedBundle);
writeJson(path.join(workDir, 'accepted-study-cards.json'), bundle);
writeJson(path.join(workDir, 'rejected-cards.json'), { cards: rejectedCards });
writeJson(path.join(workDir, 'coverage.json'), { coverage });
mkdirSync(artifactDir, { recursive: true });
for (const name of [
	'plan.json',
	'source-evidence.json',
	'generation-prompt.txt',
	'raw-candidate-cards.json',
	'candidate-cards.json',
	'failure-diagnostics.json',
	'review-prompt.txt',
	'review.json',
	'accepted-study-cards.json',
	'rejected-cards.json',
	'coverage.json'
]) {
	writeFileSync(path.join(artifactDir, name), readFileSync(path.join(workDir, name)));
}
for (const [sourceName, destinationName] of [
	['generation/last-message.json', 'generation-model-output.json'],
	['generation/events.jsonl', 'generation-events.jsonl'],
	['generation/codex-run-summary.json', 'generation-codex-run-summary.json'],
	['review/last-message.json', 'review-model-output.json'],
	['review/events.jsonl', 'review-events.jsonl'],
	['review/codex-run-summary.json', 'review-codex-run-summary.json']
]) {
	copyFileSync(path.join(workDir, sourceName), path.join(artifactDir, destinationName));
}
for (const name of ['final-candidate-cards.json', 'final-review.json']) {
	if (existsSync(path.join(workDir, name))) {
		copyFileSync(path.join(workDir, name), path.join(artifactDir, name));
	}
}
if (repairGenerationSummary) {
	for (const name of [
		'generation-repair-prompt.txt',
		'generation-repair-model-output.json',
		'repair-candidate-cards.json'
	]) {
		copyFileSync(path.join(workDir, name), path.join(artifactDir, name));
	}
	for (const [sourceName, destinationName] of [
		['generation-repair/events.jsonl', 'generation-repair-events.jsonl'],
		['generation-repair/codex-run-summary.json', 'generation-repair-codex-run-summary.json']
	]) {
		copyFileSync(path.join(workDir, sourceName), path.join(artifactDir, destinationName));
	}
}
for (const entry of reviewedRepairRuns) {
	for (const name of [
		`${entry.generationStage}-prompt.txt`,
		`${entry.generationStage}-model-output.json`,
		`${entry.generationStage}-candidates.json`,
		`${entry.reviewStage}-prompt.txt`,
		`${entry.reviewStage}-model-output.json`,
		`${entry.reviewStage}.json`
	]) {
		copyFileSync(path.join(workDir, name), path.join(artifactDir, name));
	}
	for (const stage of [entry.generationStage, entry.reviewStage]) {
		for (const name of ['events.jsonl', 'codex-run-summary.json']) {
			copyFileSync(path.join(workDir, stage, name), path.join(artifactDir, `${stage}-${name}`));
		}
	}
}
writeJson(path.join(artifactDir, 'generation-run.json'), {
	status: incomplete.length ? 'accepted_with_withheld_topics' : 'accepted',
	plan,
	run,
	counts: {
		generated: plan.expectedCardCount,
		deterministicInvalid: deterministicInvalidCards.length,
		targetedCoverageRepairs: repairedCards.length,
		reviewerRepairAttempts: reviewedRepairRuns.length,
		reviewerRepairAccepted: reviewedRepairAcceptedIds.size,
		sentForReview: candidates.cards.length,
		accepted: acceptedCards.length,
		rejectedByReviewer: reviewerRejectedCards.length,
		readyCoverageRows: coverage.length - incomplete.length,
		withheldCoverageRows: incomplete.length
	},
	artifactPath: artifactRelativePath,
	artifactHash,
	modelUsage: {
		generator: generation.usage,
		...(repairGenerationSummary ? { coverageRepairGenerator: repairGenerationSummary.usage } : {}),
		...Object.fromEntries(
			reviewedRepairRuns.flatMap((entry) => [
				[`reviewedRepairGenerator${entry.attempt}`, entry.generationSummary.usage],
				[`reviewedRepairReviewer${entry.attempt}`, entry.reviewSummary.usage]
			])
		),
		reviewer: review.usage
	}
});
console.log(readFileSync(path.join(artifactDir, 'generation-run.json'), 'utf8'));

async function runTargetedRepair() {
	const baseDir = path.resolve(args.repairFrom);
	if (baseDir === workDir)
		throw new Error('Repair work directory must differ from the base trace.');
	const base = loadTargetedRepairBase(baseDir);
	const repairPlan = {
		schemaVersion: SCHEMA_VERSION,
		status: args.generate ? 'repair_pending' : 'repair_ready',
		batchId,
		baseRunDir: path.relative(rootDir, baseDir),
		basePromptVersion: base.plan.promptVersion,
		repairPromptVersion: TARGETED_REPAIR_PROMPT_VERSION,
		baseGeneratorRunId: base.generationSummary.threadId,
		preservedCardCount:
			base.validCards.length + base.carriedRepairs.flatMap((entry) => entry.cards).length,
		carriedRepairRuns: base.carriedRepairs.map((entry) => ({
			runId: entry.generationSummary.threadId,
			cardIds: entry.cards.map((card) => card.id)
		})),
		repairCardIds: base.invalidCards.map((entry) => entry.card.id),
		mergedCardCount: base.rawCandidates.cards.length,
		model: args.model,
		thinkingLevel: args.thinkingLevel
	};
	if (args.reviewCarriedValid) {
		await runReviewCarriedValid({ baseDir, base, repairPlan });
		return;
	}
	if (!args.generate) {
		console.log(JSON.stringify(repairPlan, null, 2));
		return;
	}
	if (existsSync(workDir)) {
		if (!args.force)
			throw new Error(`Repair work directory exists: ${path.relative(rootDir, workDir)}`);
		rmSync(workDir, { recursive: true, force: true });
	}
	if (existsSync(artifactDir)) {
		throw new Error(`Durable artifact directory exists: ${path.relative(rootDir, artifactDir)}`);
	}
	mkdirSync(workDir, { recursive: true });
	writeJson(path.join(workDir, 'plan.json'), repairPlan);
	writeJson(path.join(workDir, 'source-evidence.json'), base.sourceEvidence);

	const repairStartedAt = new Date().toISOString();
	const generationPrompt = buildTargetedRepairPrompt(base);
	writeFileSync(path.join(workDir, 'repair-generation-prompt.txt'), `${generationPrompt}\n`);
	const generation = await runStage('repair-generation', generationPrompt, buildGenerationSchema());
	writeFileSync(
		path.join(workDir, 'repair-generation-model-output.json'),
		`${generation.finalResponse}\n`
	);
	const repairedRaw = parseOutput(generation.finalResponse);
	if (!Array.isArray(repairedRaw.cards) || repairedRaw.cards.length !== base.invalidCards.length) {
		throw new Error(
			`Targeted repair returned ${repairedRaw.cards?.length ?? 0}; expected ${base.invalidCards.length}.`
		);
	}
	const repairedCards = repairedRaw.cards.map((card, index) => {
		const expected = base.invalidCards[index].card;
		if (
			card.id !== expected.id ||
			card.conceptKey !== expected.conceptKey ||
			card.topicComponentId !== expected.topicComponentId
		) {
			throw new Error(`Targeted repair ${index} changed its card, concept or topic identity.`);
		}
		return validateCandidates(
			{ cards: [card] },
			{
				plan: base.plan,
				specification,
				offerings,
				sourceTopics,
				allowPartial: true,
				sourceExcerptMaxLength: 400
			}
		).cards[0];
	});
	writeJson(path.join(workDir, 'repair-candidate-cards.json'), { cards: repairedCards });

	const repairedById = new Map(
		[...base.carriedRepairs.flatMap((entry) => entry.cards), ...repairedCards].map((card) => [
			card.id,
			card
		])
	);
	const mergedCandidates = {
		cards: base.rawCandidates.cards.map((card) => repairedById.get(card.id) ?? card)
	};
	validateCandidates(mergedCandidates, {
		plan: base.plan,
		specification,
		offerings,
		sourceTopics,
		sourceExcerptMaxLength: 2_000
	});
	writeJson(path.join(workDir, 'merged-candidate-cards.json'), mergedCandidates);

	const reviewPrompt = buildReviewPrompt({
		plan: base.plan,
		specification,
		offerings,
		sourceTopics,
		candidates: mergedCandidates
	});
	writeFileSync(path.join(workDir, 'review-prompt.txt'), `${reviewPrompt}\n`);
	const review = await runStage('review', reviewPrompt, buildReviewSchema());
	writeFileSync(path.join(workDir, 'review-model-output.json'), `${review.finalResponse}\n`);
	const reviews = validateReviews(parseOutput(review.finalResponse), mergedCandidates.cards);
	writeJson(path.join(workDir, 'review.json'), reviews);
	const rejectedCards = mergedCandidates.cards.flatMap((card, index) =>
		reviews.reviews[index].accepted ? [] : [{ card, review: reviews.reviews[index] }]
	);
	writeJson(path.join(workDir, 'rejected-cards.json'), { cards: rejectedCards });
	const acceptedCards = mergedCandidates.cards.filter(
		(card, index) => reviews.reviews[index].accepted
	);
	const acceptedCountByTopic = new Map();
	for (const card of acceptedCards) {
		acceptedCountByTopic.set(
			card.topicComponentId,
			(acceptedCountByTopic.get(card.topicComponentId) ?? 0) + 1
		);
	}
	const coverage = offerings.flatMap((offering) =>
		topics
			.filter((topic) => offering.selectableComponentIds.includes(topic.id))
			.map((topic) => {
				const cardCount = acceptedCountByTopic.get(topic.id) ?? 0;
				return {
					offeringId: offering.id,
					topicComponentId: topic.id,
					status: cardCount >= args.minimumAcceptedPerTopic ? 'ready' : 'withheld',
					cardCount,
					reason:
						cardCount >= args.minimumAcceptedPerTopic
							? null
							: `Only ${cardCount} of ${args.minimumAcceptedPerTopic} required cards passed independent review.`
				};
			})
	);
	writeJson(path.join(workDir, 'coverage.json'), { coverage });
	const incomplete = coverage.filter((row) => row.status !== 'ready');
	if (incomplete.length > 0 && !args.allowWithheld) {
		throw new Error(
			`Merged targeted-repair review left ${incomplete.length} offering/topic rows below the coverage gate.`
		);
	}

	const repairFinishedAt = new Date().toISOString();
	const sourceManifestHash = sha256(
		stableStringify({
			specification: publicSpecification(specification),
			offerings: offerings.map(publicOffering),
			topics: sourceTopics
		})
	);
	const acceptedCardIds = new Set(acceptedCards.map((card) => card.id));
	const repairCardIds = repairedCards
		.map((card) => card.id)
		.filter((cardId) => acceptedCardIds.has(cardId));
	const carriedSupplementalRuns = base.carriedRepairs.flatMap((entry) => {
		const cardIds = entry.cards
			.map((card) => card.id)
			.filter((cardId) => acceptedCardIds.has(cardId));
		return cardIds.length
			? [
					{
						purpose: 'targeted-card-repair',
						promptVersion: entry.promptVersion,
						cardIds,
						generator: {
							model: entry.generationSummary.model,
							thinkingLevel: entry.generationSummary.thinkingLevel,
							runId: entry.generationSummary.threadId
						},
						reviewer: {
							model: args.model,
							thinkingLevel: args.thinkingLevel,
							runId: review.threadId,
							independentTurn: true
						},
						startedAt: entry.generationSummary.startedAt,
						finishedAt: repairFinishedAt
					}
				]
			: [];
	});
	const currentSupplementalRuns = repairCardIds.length
		? [
				{
					purpose: 'targeted-card-repair',
					promptVersion: TARGETED_REPAIR_PROMPT_VERSION,
					cardIds: repairCardIds,
					generator: {
						model: args.model,
						thinkingLevel: args.thinkingLevel,
						runId: generation.threadId
					},
					reviewer: {
						model: args.model,
						thinkingLevel: args.thinkingLevel,
						runId: review.threadId,
						independentTurn: true
					},
					startedAt: repairStartedAt,
					finishedAt: repairFinishedAt
				}
			]
		: [];
	const supplementalRuns = [...carriedSupplementalRuns, ...currentSupplementalRuns];
	const bundle = {
		schemaVersion: SCHEMA_VERSION,
		release: {
			id: batchId,
			promptVersion: base.plan.promptVersion,
			generator: {
				model: base.generationSummary.model,
				thinkingLevel: base.generationSummary.thinkingLevel,
				runId: base.generationSummary.threadId
			},
			reviewer: {
				model: args.model,
				thinkingLevel: args.thinkingLevel,
				runId: review.threadId,
				independentTurn: true
			},
			...(repairGenerationSummary && acceptedRepairCardIds.length
				? {
						supplementalRuns: [
							{
								purpose: 'targeted-card-repair',
								promptVersion: TARGETED_REPAIR_PROMPT_VERSION,
								cardIds: acceptedRepairCardIds,
								generator: {
									model: repairGenerationSummary.model,
									thinkingLevel: repairGenerationSummary.thinkingLevel,
									runId: repairGenerationSummary.threadId
								},
								reviewer: {
									model: args.model,
									thinkingLevel: args.thinkingLevel,
									runId: review.threadId,
									independentTurn: true
								},
								startedAt: repairGenerationSummary.startedAt,
								finishedAt
							}
						]
					}
				: {}),
			...(supplementalRuns.length ? { supplementalRuns } : {}),
			startedAt: base.generationSummary.startedAt,
			finishedAt: repairFinishedAt,
			sourceManifestHash,
			artifactPath: artifactRelativePath
		},
		cards: acceptedCards.map((card) => bindCard(card, { specification, offerings, sourceTopics })),
		coverage
	};
	const validatedBundle = validateStudyCardBundle(bundle);
	const artifactHash = hashStudyCardArtifact(validatedBundle);
	writeJson(path.join(workDir, 'accepted-study-cards.json'), bundle);

	mkdirSync(artifactDir, { recursive: true });
	for (const name of [
		'plan.json',
		'source-evidence.json',
		'repair-generation-prompt.txt',
		'repair-generation-model-output.json',
		'repair-candidate-cards.json',
		'merged-candidate-cards.json',
		'review-prompt.txt',
		'review-model-output.json',
		'review.json',
		'accepted-study-cards.json',
		'rejected-cards.json',
		'coverage.json'
	]) {
		copyFileSync(path.join(workDir, name), path.join(artifactDir, name));
	}
	for (const [sourceName, destinationName] of [
		['generation/last-message.json', 'base-generation-model-output.json'],
		['generation/events.jsonl', 'base-generation-events.jsonl'],
		['generation/codex-run-summary.json', 'base-generation-codex-run-summary.json'],
		['failure-diagnostics.json', 'base-failure-diagnostics.json']
	]) {
		copyFileSync(path.join(baseDir, sourceName), path.join(artifactDir, destinationName));
	}
	for (const [index, carried] of base.carriedRepairs.entries()) {
		for (const [sourceName, suffix] of [
			['plan.json', 'plan.json'],
			['repair-generation-prompt.txt', 'prompt.txt'],
			['repair-generation-model-output.json', 'model-output.json'],
			['repair-generation/events.jsonl', 'events.jsonl'],
			['repair-generation/codex-run-summary.json', 'codex-run-summary.json']
		]) {
			copyFileSync(
				path.join(carried.dir, sourceName),
				path.join(artifactDir, `carried-repair-${index + 1}-${suffix}`)
			);
		}
	}
	copyFileSync(
		path.join(workDir, 'repair-generation', 'codex-run-summary.json'),
		path.join(artifactDir, 'repair-generation-codex-run-summary.json')
	);
	copyFileSync(
		path.join(workDir, 'review', 'codex-run-summary.json'),
		path.join(artifactDir, 'review-codex-run-summary.json')
	);
	writeJson(path.join(artifactDir, 'generation-run.json'), {
		status: 'accepted_after_targeted_card_repair',
		plan: repairPlan,
		base: {
			promptVersion: base.plan.promptVersion,
			generatorRunId: base.generationSummary.threadId,
			preservedCards: base.validCards.length,
			rejectedBeforeReview: base.invalidCards.length
		},
		repair: {
			promptVersion: TARGETED_REPAIR_PROMPT_VERSION,
			carriedGeneratorRuns: base.carriedRepairs.map((entry) => ({
				runId: entry.generationSummary.threadId,
				cardIds: entry.cards.map((card) => card.id)
			})),
			generatorRunId: generation.threadId,
			reviewerRunId: review.threadId,
			cardIds: repairCardIds,
			accepted: true
		},
		counts: {
			published: acceptedCards.length,
			rejectedByReviewer: rejectedCards.length,
			readyCoverageRows: coverage.length - incomplete.length,
			withheldCoverageRows: incomplete.length
		},
		artifactPath: artifactRelativePath,
		artifactHash,
		sourceManifestHash,
		modelUsage: {
			baseGenerator: base.generationSummary.usage,
			repairGenerator: generation.usage,
			reviewer: review.usage
		}
	});
	console.log(readFileSync(path.join(artifactDir, 'generation-run.json'), 'utf8'));
}

async function runReviewedCardRepair() {
	const reviewedDir = path.resolve(args.reviewedRepairFrom);
	if (reviewedDir === workDir) {
		throw new Error('Reviewed-card repair work directory must differ from its reviewed trace.');
	}
	for (const name of [
		'plan.json',
		'source-evidence.json',
		'merged-candidate-cards.json',
		'review.json',
		'review/events.jsonl',
		'review/codex-run-summary.json',
		'repair-generation/events.jsonl',
		'repair-generation/codex-run-summary.json'
	]) {
		if (!existsSync(path.join(reviewedDir, name))) {
			throw new Error(`Reviewed trace is missing ${name}.`);
		}
	}
	const reviewedPlan = JSON.parse(readFileSync(path.join(reviewedDir, 'plan.json'), 'utf8'));
	if (
		reviewedPlan.batchId !== batchId ||
		reviewedPlan.basePromptVersion !== 'standard-study-card-compiler-v3' ||
		reviewedPlan.model !== args.model ||
		reviewedPlan.thinkingLevel !== args.thinkingLevel
	) {
		throw new Error('Reviewed repair trace has incompatible batch or model provenance.');
	}
	const sourceEvidence = JSON.parse(
		readFileSync(path.join(reviewedDir, 'source-evidence.json'), 'utf8')
	);
	if (stableStringify(sourceEvidence.topics) !== stableStringify(sourceTopics)) {
		throw new Error('Current official source evidence drifted from the reviewed trace.');
	}
	const reviewedCandidates = validateCandidates(
		JSON.parse(readFileSync(path.join(reviewedDir, 'merged-candidate-cards.json'), 'utf8')),
		{
			plan: { ...plan, promptVersion: reviewedPlan.basePromptVersion },
			offerings,
			sourceTopics,
			sourceExcerptMaxLength: 2_000
		}
	);
	const reviewedResults = validateReviews(
		JSON.parse(readFileSync(path.join(reviewedDir, 'review.json'), 'utf8')),
		reviewedCandidates.cards
	);
	const reviewedById = new Map(reviewedResults.reviews.map((entry) => [entry.cardId, entry]));
	const rejectedTarget = reviewedCandidates.cards.find((card) => card.id === args.repairCardId);
	if (!rejectedTarget || reviewedById.get(rejectedTarget.id)?.accepted !== false) {
		throw new Error(
			'--repair-card-id must name a candidate rejected by the completed full review.'
		);
	}
	const topicRejectedCount = reviewedCandidates.cards.filter(
		(card) =>
			card.topicComponentId === rejectedTarget.topicComponentId &&
			reviewedById.get(card.id)?.accepted === false
	).length;
	const repairPlan = {
		schemaVersion: SCHEMA_VERSION,
		status: args.generate ? 'reviewed_card_repair_pending' : 'reviewed_card_repair_ready',
		mode: 'repair-one-full-review-rejection',
		batchId,
		reviewedRunDir: path.relative(rootDir, reviewedDir),
		basePromptVersion: reviewedPlan.basePromptVersion,
		repairPromptVersion: REVIEWED_CARD_REPAIR_PROMPT_VERSION,
		fullReviewerRunId: JSON.parse(
			readFileSync(path.join(reviewedDir, 'review', 'codex-run-summary.json'), 'utf8')
		).threadId,
		repairCardId: rejectedTarget.id,
		topicComponentId: rejectedTarget.topicComponentId,
		topicRejectedCount,
		model: args.model,
		thinkingLevel: args.thinkingLevel
	};
	if (!args.generate) {
		console.log(JSON.stringify(repairPlan, null, 2));
		return;
	}
	if (existsSync(workDir)) {
		if (!args.force) {
			throw new Error(`Repair work directory exists: ${path.relative(rootDir, workDir)}`);
		}
		rmSync(workDir, { recursive: true, force: true });
	}
	if (existsSync(artifactDir)) {
		throw new Error(`Durable artifact directory exists: ${path.relative(rootDir, artifactDir)}`);
	}
	mkdirSync(workDir, { recursive: true });
	writeJson(path.join(workDir, 'plan.json'), repairPlan);
	writeJson(path.join(workDir, 'source-evidence.json'), sourceEvidence);

	const sourceTopic = sourceTopics.find(
		(topic) => topic.topicComponentId === rejectedTarget.topicComponentId
	);
	const generationPrompt = `You are repairing exactly one card rejected by an independent full-deck review. Do not generate any other card and do not alter its identity.

Preserve id, conceptKey and topicComponentId exactly. Address every supplied reviewer issue. If every reviewer issue concerns memoryTip, reproduce every other field byte-for-byte from the rejected candidate and set memoryTip to null; do not shorten or otherwise alter sourceExcerpt, content, choices, locator, cue, or kind. Otherwise keep already accurate learner-facing content unless a change is needed. Set memoryTip to null when no honest, non-contrived retrieval route exists; never force wordplay, false initials, false ordering, repeat the answer, or invent a gimmick merely to fill the field. Use only the supplied official component text. sourceExcerpt must remain one exact contiguous substring of at most 400 characters with no reflow or control bytes. The card must have exactly three or four unique choices with one correct answer. Output JSON only.

Required identity and rejected candidate:
${JSON.stringify(
	{
		requiredIdentity: {
			id: rejectedTarget.id,
			conceptKey: rejectedTarget.conceptKey,
			topicComponentId: rejectedTarget.topicComponentId
		},
		reviewer: reviewedById.get(rejectedTarget.id),
		rejectedCandidate: rejectedTarget
	},
	null,
	2
)}

Official topic source:
${JSON.stringify(sourceTopic, null, 2)}`;
	writeFileSync(
		path.join(workDir, 'reviewed-repair-generation-prompt.txt'),
		`${generationPrompt}\n`
	);
	const generation = await runStage(
		'reviewed-repair-generation',
		generationPrompt,
		buildGenerationSchema()
	);
	writeFileSync(
		path.join(workDir, 'reviewed-repair-generation-model-output.json'),
		`${generation.finalResponse}\n`
	);
	const generationOutput = parseOutput(generation.finalResponse);
	if (!Array.isArray(generationOutput.cards) || generationOutput.cards.length !== 1) {
		throw new Error('Reviewed-card repair generator must return exactly one card.');
	}
	const replacement = generationOutput.cards[0];
	if (
		replacement.id !== rejectedTarget.id ||
		replacement.conceptKey !== rejectedTarget.conceptKey ||
		replacement.topicComponentId !== rejectedTarget.topicComponentId
	) {
		throw new Error('Reviewed-card repair changed its card, concept or topic identity.');
	}
	validateCandidates(
		{ cards: [replacement] },
		{
			plan,
			offerings,
			sourceTopics,
			allowPartial: true,
			sourceExcerptMaxLength: 400
		}
	);
	writeJson(path.join(workDir, 'reviewed-repair-candidate-card.json'), { cards: [replacement] });

	const reviewPrompt = buildReviewPrompt({
		plan,
		specification,
		offerings,
		sourceTopics: [sourceTopic],
		candidates: { cards: [replacement] }
	});
	writeFileSync(path.join(workDir, 'reviewed-repair-review-prompt.txt'), `${reviewPrompt}\n`);
	const replacementReview = await runStage(
		'reviewed-repair-review',
		reviewPrompt,
		buildReviewSchema()
	);
	writeFileSync(
		path.join(workDir, 'reviewed-repair-review-model-output.json'),
		`${replacementReview.finalResponse}\n`
	);
	const replacementReviews = validateReviews(parseOutput(replacementReview.finalResponse), [
		replacement
	]);
	writeJson(path.join(workDir, 'reviewed-repair-review.json'), replacementReviews);
	if (!replacementReviews.reviews[0].accepted) {
		writeJson(path.join(workDir, 'rejected-cards.json'), {
			cards: [
				{
					stage: 'reviewed-card-repair-review',
					card: replacement,
					review: replacementReviews.reviews[0]
				}
			]
		});
		throw new Error('The single reviewed-card replacement did not pass independent review.');
	}

	const acceptedFromFullReview = reviewedCandidates.cards.filter(
		(card) => reviewedById.get(card.id)?.accepted
	);
	const acceptedCards = [...acceptedFromFullReview, replacement];
	const acceptedCountByTopic = new Map();
	for (const card of acceptedCards) {
		acceptedCountByTopic.set(
			card.topicComponentId,
			(acceptedCountByTopic.get(card.topicComponentId) ?? 0) + 1
		);
	}
	const coverage = offerings.flatMap((offering) =>
		topics
			.filter((topic) => offering.selectableComponentIds.includes(topic.id))
			.map((topic) => {
				const cardCount = acceptedCountByTopic.get(topic.id) ?? 0;
				return {
					offeringId: offering.id,
					topicComponentId: topic.id,
					status: cardCount >= args.minimumAcceptedPerTopic ? 'ready' : 'withheld',
					cardCount,
					reason:
						cardCount >= args.minimumAcceptedPerTopic
							? null
							: `Only ${cardCount} of ${args.minimumAcceptedPerTopic} required cards passed independent review.`
				};
			})
	);
	const incomplete = coverage.filter((row) => row.status !== 'ready');
	writeJson(path.join(workDir, 'coverage.json'), { coverage });
	if (incomplete.length > 0 && !args.allowWithheld) {
		throw new Error(
			`The single reviewed-card repair left ${incomplete.length} offering/topic rows below the coverage gate.`
		);
	}

	const baseRunDir = path.resolve(rootDir, reviewedPlan.baseRunDir);
	const baseGenerationSummary = JSON.parse(
		readFileSync(path.join(baseRunDir, 'generation', 'codex-run-summary.json'), 'utf8')
	);
	const firstRepairSummary = JSON.parse(
		readFileSync(path.join(reviewedDir, 'repair-generation', 'codex-run-summary.json'), 'utf8')
	);
	const fullReviewSummary = JSON.parse(
		readFileSync(path.join(reviewedDir, 'review', 'codex-run-summary.json'), 'utf8')
	);
	const newGenerationSummary = JSON.parse(
		readFileSync(path.join(workDir, 'reviewed-repair-generation', 'codex-run-summary.json'), 'utf8')
	);
	const newReviewSummary = JSON.parse(
		readFileSync(path.join(workDir, 'reviewed-repair-review', 'codex-run-summary.json'), 'utf8')
	);
	for (const [label, summary] of [
		['base generator', baseGenerationSummary],
		['first repair generator', firstRepairSummary],
		['full reviewer', fullReviewSummary],
		['reviewed-card repair generator', newGenerationSummary],
		['reviewed-card repair reviewer', newReviewSummary]
	]) {
		if (
			summary.status !== 'passed' ||
			summary.model !== args.model ||
			summary.thinkingLevel !== args.thinkingLevel ||
			!summary.threadId ||
			!summary.startedAt ||
			!summary.finishedAt
		) {
			throw new Error(`${label} provenance is incomplete or incompatible.`);
		}
	}
	const originalRepairCardIds = reviewedPlan.repairCardIds.filter((cardId) =>
		acceptedCards.some((card) => card.id === cardId)
	);
	const supplementalRuns = [
		...(originalRepairCardIds.length
			? [
					{
						purpose: 'targeted-card-repair',
						promptVersion: reviewedPlan.repairPromptVersion,
						cardIds: originalRepairCardIds,
						generator: {
							model: firstRepairSummary.model,
							thinkingLevel: firstRepairSummary.thinkingLevel,
							runId: firstRepairSummary.threadId
						},
						reviewer: {
							model: fullReviewSummary.model,
							thinkingLevel: fullReviewSummary.thinkingLevel,
							runId: fullReviewSummary.threadId,
							independentTurn: true
						},
						startedAt: firstRepairSummary.startedAt,
						finishedAt: fullReviewSummary.finishedAt
					}
				]
			: []),
		{
			purpose: 'targeted-card-repair',
			promptVersion: REVIEWED_CARD_REPAIR_PROMPT_VERSION,
			cardIds: [replacement.id],
			generator: {
				model: newGenerationSummary.model,
				thinkingLevel: newGenerationSummary.thinkingLevel,
				runId: newGenerationSummary.threadId
			},
			reviewer: {
				model: newReviewSummary.model,
				thinkingLevel: newReviewSummary.thinkingLevel,
				runId: newReviewSummary.threadId,
				independentTurn: true
			},
			startedAt: newGenerationSummary.startedAt,
			finishedAt: newReviewSummary.finishedAt
		}
	];
	const sourceManifestHash = sha256(
		stableStringify({
			specification: publicSpecification(specification),
			offerings: offerings.map(publicOffering),
			topics: sourceTopics
		})
	);
	const bundle = {
		schemaVersion: SCHEMA_VERSION,
		release: {
			id: batchId,
			promptVersion: reviewedPlan.basePromptVersion,
			generator: {
				model: baseGenerationSummary.model,
				thinkingLevel: baseGenerationSummary.thinkingLevel,
				runId: baseGenerationSummary.threadId
			},
			reviewer: {
				model: fullReviewSummary.model,
				thinkingLevel: fullReviewSummary.thinkingLevel,
				runId: fullReviewSummary.threadId,
				independentTurn: true
			},
			supplementalRuns,
			startedAt: baseGenerationSummary.startedAt,
			finishedAt: newReviewSummary.finishedAt,
			sourceManifestHash,
			artifactPath: artifactRelativePath
		},
		cards: acceptedCards.map((card) => bindCard(card, { specification, offerings, sourceTopics })),
		coverage
	};
	const validatedBundle = validateStudyCardBundle(bundle);
	const artifactHash = hashStudyCardArtifact(validatedBundle);
	writeJson(path.join(workDir, 'accepted-study-cards.json'), bundle);
	const originalReviewerRejected = reviewedCandidates.cards.flatMap((card, index) =>
		reviewedResults.reviews[index].accepted
			? []
			: [
					{
						stage: 'original-full-deck-review',
						supersededByAcceptedRepair: card.id === replacement.id,
						card,
						review: reviewedResults.reviews[index]
					}
				]
	);
	writeJson(path.join(workDir, 'rejected-cards.json'), { cards: originalReviewerRejected });

	mkdirSync(artifactDir, { recursive: true });
	for (const name of [
		'plan.json',
		'source-evidence.json',
		'reviewed-repair-generation-prompt.txt',
		'reviewed-repair-generation-model-output.json',
		'reviewed-repair-candidate-card.json',
		'reviewed-repair-review-prompt.txt',
		'reviewed-repair-review-model-output.json',
		'reviewed-repair-review.json',
		'accepted-study-cards.json',
		'rejected-cards.json',
		'coverage.json'
	]) {
		copyFileSync(path.join(workDir, name), path.join(artifactDir, name));
	}
	for (const [sourceName, destinationName] of [
		['merged-candidate-cards.json', 'full-review-candidate-cards.json'],
		['review-prompt.txt', 'full-review-prompt.txt'],
		['review-model-output.json', 'full-review-model-output.json'],
		['review.json', 'full-review.json'],
		['review/events.jsonl', 'full-review-events.jsonl'],
		['review/codex-run-summary.json', 'full-review-codex-run-summary.json'],
		['repair-generation-prompt.txt', 'source-repair-prompt.txt'],
		['repair-generation-model-output.json', 'source-repair-model-output.json'],
		['repair-generation/events.jsonl', 'source-repair-events.jsonl'],
		['repair-generation/codex-run-summary.json', 'source-repair-codex-run-summary.json']
	]) {
		copyFileSync(path.join(reviewedDir, sourceName), path.join(artifactDir, destinationName));
	}
	for (const [sourceName, destinationName] of [
		['generation/last-message.json', 'base-generation-model-output.json'],
		['generation/events.jsonl', 'base-generation-events.jsonl'],
		['generation/codex-run-summary.json', 'base-generation-codex-run-summary.json'],
		['failure-diagnostics.json', 'base-failure-diagnostics.json']
	]) {
		copyFileSync(path.join(baseRunDir, sourceName), path.join(artifactDir, destinationName));
	}
	for (const stage of ['reviewed-repair-generation', 'reviewed-repair-review']) {
		for (const name of ['events.jsonl', 'codex-run-summary.json']) {
			copyFileSync(path.join(workDir, stage, name), path.join(artifactDir, `${stage}-${name}`));
		}
	}
	writeJson(path.join(artifactDir, 'generation-run.json'), {
		status: incomplete.length
			? 'accepted_with_withheld_topics'
			: 'accepted_after_one_reviewed_card_repair',
		plan: repairPlan,
		counts: {
			fullReviewAccepted: acceptedFromFullReview.length,
			fullReviewRejected: originalReviewerRejected.length,
			supersededByAcceptedRepair: 1,
			remainingFullReviewRejected: originalReviewerRejected.length - 1,
			published: acceptedCards.length,
			readyCoverageRows: coverage.length - incomplete.length,
			withheldCoverageRows: incomplete.length
		},
		artifactPath: artifactRelativePath,
		artifactHash,
		sourceManifestHash,
		modelUsage: {
			baseGenerator: baseGenerationSummary.usage,
			firstRepairGenerator: firstRepairSummary.usage,
			fullReviewer: fullReviewSummary.usage,
			reviewedCardRepairGenerator: newGenerationSummary.usage,
			reviewedCardRepairReviewer: newReviewSummary.usage
		}
	});
	console.log(readFileSync(path.join(artifactDir, 'generation-run.json'), 'utf8'));
}

async function runReviewCarriedValid({ baseDir, base, repairPlan }) {
	const reviewPlan = {
		...repairPlan,
		status: 'review_carried_valid_pending',
		mode: 'review-carried-valid-without-generation',
		repairCardIds: [],
		excludedInvalidCardIds: base.invalidCards.map((entry) => entry.card.id)
	};
	if (existsSync(workDir)) {
		if (!args.force) {
			throw new Error(`Review work directory exists: ${path.relative(rootDir, workDir)}`);
		}
		rmSync(workDir, { recursive: true, force: true });
	}
	if (existsSync(artifactDir)) {
		throw new Error(`Durable artifact directory exists: ${path.relative(rootDir, artifactDir)}`);
	}
	mkdirSync(workDir, { recursive: true });
	writeJson(path.join(workDir, 'plan.json'), reviewPlan);
	writeJson(path.join(workDir, 'source-evidence.json'), base.sourceEvidence);

	const validBaseIds = new Set(base.validCards.map((card) => card.id));
	const carriedById = new Map(
		base.carriedRepairs.flatMap((entry) => entry.cards).map((card) => [card.id, card])
	);
	const reviewCandidates = {
		cards: base.rawCandidates.cards.flatMap((card) => {
			const carried = carriedById.get(card.id);
			if (carried) return [carried];
			return validBaseIds.has(card.id) ? [card] : [];
		})
	};
	validateCandidates(reviewCandidates, {
		plan: base.plan,
		offerings,
		sourceTopics,
		allowPartial: true,
		sourceExcerptMaxLength: 2_000
	});
	if (
		reviewCandidates.cards.length !==
		base.validCards.length + base.carriedRepairs.flatMap((entry) => entry.cards).length
	) {
		throw new Error('The carried-valid review set lost or duplicated a preserved card identity.');
	}
	writeJson(path.join(workDir, 'review-candidate-cards.json'), reviewCandidates);

	const reviewPrompt = buildReviewPrompt({
		plan: base.plan,
		specification,
		offerings,
		sourceTopics,
		candidates: reviewCandidates
	});
	writeFileSync(path.join(workDir, 'review-prompt.txt'), `${reviewPrompt}\n`);
	const review = await runStage('review', reviewPrompt, buildReviewSchema());
	writeFileSync(path.join(workDir, 'review-model-output.json'), `${review.finalResponse}\n`);
	const reviews = validateReviews(parseOutput(review.finalResponse), reviewCandidates.cards);
	writeJson(path.join(workDir, 'review.json'), reviews);

	const reviewerRejected = reviewCandidates.cards.flatMap((card, index) =>
		reviews.reviews[index].accepted
			? []
			: [
					{
						stage: 'independent-review',
						card,
						review: reviews.reviews[index]
					}
				]
	);
	const deterministicRejected = base.originalInvalidCards.map((entry) => ({
		stage: 'base-deterministic-source-gate',
		card: entry.card,
		issue: entry.issue
	}));
	const failedRepairEvidence = base.carriedRepairs.flatMap((entry) =>
		entry.rejectedCards.map((rejected) => ({
			stage: 'carried-repair-deterministic-source-gate',
			generatorRunId: entry.generationSummary.threadId,
			promptVersion: entry.promptVersion,
			...rejected
		}))
	);
	const rejectedEvidence = [...reviewerRejected, ...deterministicRejected, ...failedRepairEvidence];
	writeJson(path.join(workDir, 'rejected-cards.json'), { cards: rejectedEvidence });

	const acceptedCards = reviewCandidates.cards.filter(
		(_card, index) => reviews.reviews[index].accepted
	);
	const acceptedCountByTopic = new Map();
	for (const card of acceptedCards) {
		acceptedCountByTopic.set(
			card.topicComponentId,
			(acceptedCountByTopic.get(card.topicComponentId) ?? 0) + 1
		);
	}
	const coverage = offerings.flatMap((offering) =>
		topics
			.filter((topic) => offering.selectableComponentIds.includes(topic.id))
			.map((topic) => {
				const cardCount = acceptedCountByTopic.get(topic.id) ?? 0;
				return {
					offeringId: offering.id,
					topicComponentId: topic.id,
					status: cardCount >= args.minimumAcceptedPerTopic ? 'ready' : 'withheld',
					cardCount,
					reason:
						cardCount >= args.minimumAcceptedPerTopic
							? null
							: `Only ${cardCount} of ${args.minimumAcceptedPerTopic} required cards passed independent review.`
				};
			})
	);
	writeJson(path.join(workDir, 'coverage.json'), { coverage });
	const incomplete = coverage.filter((row) => row.status !== 'ready');
	if (incomplete.length > 0 && !args.allowWithheld) {
		throw new Error(
			`Carried-valid review left ${incomplete.length} offering/topic rows below the coverage gate.`
		);
	}

	const finishedAt = new Date().toISOString();
	const sourceManifestHash = sha256(
		stableStringify({
			specification: publicSpecification(specification),
			offerings: offerings.map(publicOffering),
			topics: sourceTopics
		})
	);
	const acceptedCardIds = new Set(acceptedCards.map((card) => card.id));
	const supplementalRuns = base.carriedRepairs.flatMap((entry) => {
		const cardIds = entry.cards
			.map((card) => card.id)
			.filter((cardId) => acceptedCardIds.has(cardId));
		return cardIds.length
			? [
					{
						purpose: 'targeted-card-repair',
						promptVersion: entry.promptVersion,
						cardIds,
						generator: {
							model: entry.generationSummary.model,
							thinkingLevel: entry.generationSummary.thinkingLevel,
							runId: entry.generationSummary.threadId
						},
						reviewer: {
							model: args.model,
							thinkingLevel: args.thinkingLevel,
							runId: review.threadId,
							independentTurn: true
						},
						startedAt: entry.generationSummary.startedAt,
						finishedAt
					}
				]
			: [];
	});
	const bundle = {
		schemaVersion: SCHEMA_VERSION,
		release: {
			id: batchId,
			promptVersion: base.plan.promptVersion,
			generator: {
				model: base.generationSummary.model,
				thinkingLevel: base.generationSummary.thinkingLevel,
				runId: base.generationSummary.threadId
			},
			reviewer: {
				model: args.model,
				thinkingLevel: args.thinkingLevel,
				runId: review.threadId,
				independentTurn: true
			},
			...(supplementalRuns.length ? { supplementalRuns } : {}),
			startedAt: base.generationSummary.startedAt,
			finishedAt,
			sourceManifestHash,
			artifactPath: artifactRelativePath
		},
		cards: acceptedCards.map((card) => bindCard(card, { specification, offerings, sourceTopics })),
		coverage
	};
	const validatedBundle = validateStudyCardBundle(bundle);
	const artifactHash = hashStudyCardArtifact(validatedBundle);
	writeJson(path.join(workDir, 'accepted-study-cards.json'), bundle);

	mkdirSync(artifactDir, { recursive: true });
	for (const name of [
		'plan.json',
		'source-evidence.json',
		'review-candidate-cards.json',
		'review-prompt.txt',
		'review-model-output.json',
		'review.json',
		'accepted-study-cards.json',
		'rejected-cards.json',
		'coverage.json'
	]) {
		copyFileSync(path.join(workDir, name), path.join(artifactDir, name));
	}
	for (const [sourceName, destinationName] of [
		['generation/last-message.json', 'base-generation-model-output.json'],
		['generation/events.jsonl', 'base-generation-events.jsonl'],
		['generation/codex-run-summary.json', 'base-generation-codex-run-summary.json'],
		['failure-diagnostics.json', 'base-failure-diagnostics.json']
	]) {
		copyFileSync(path.join(baseDir, sourceName), path.join(artifactDir, destinationName));
	}
	for (const [index, carried] of base.carriedRepairs.entries()) {
		for (const [sourceName, suffix] of [
			['plan.json', 'plan.json'],
			['repair-generation-prompt.txt', 'prompt.txt'],
			['repair-generation-model-output.json', 'model-output.json'],
			['repair-generation/events.jsonl', 'events.jsonl'],
			['repair-generation/codex-run-summary.json', 'codex-run-summary.json']
		]) {
			copyFileSync(
				path.join(carried.dir, sourceName),
				path.join(artifactDir, `carried-repair-${index + 1}-${suffix}`)
			);
		}
	}
	copyFileSync(
		path.join(workDir, 'review', 'codex-run-summary.json'),
		path.join(artifactDir, 'review-codex-run-summary.json')
	);
	writeJson(path.join(artifactDir, 'generation-run.json'), {
		status: incomplete.length
			? 'accepted_with_withheld_topics'
			: 'accepted_after_carried_valid_review',
		plan: reviewPlan,
		base: {
			promptVersion: base.plan.promptVersion,
			generatorRunId: base.generationSummary.threadId,
			generatedCards: base.rawCandidates.cards.length,
			preservedValidCards: base.validCards.length
		},
		carriedRepairRuns: base.carriedRepairs.map((entry) => ({
			promptVersion: entry.promptVersion,
			generatorRunId: entry.generationSummary.threadId,
			validCardIds: entry.cards.map((card) => card.id),
			failedCardIds: entry.rejectedCards.map((entry) => entry.card.id)
		})),
		reviewerRunId: review.threadId,
		counts: {
			sentForReview: reviewCandidates.cards.length,
			published: acceptedCards.length,
			rejectedByReviewer: reviewerRejected.length,
			excludedAtBaseSourceGate: base.originalInvalidCards.length,
			failedCarriedRepairCandidates: failedRepairEvidence.length,
			readyCoverageRows: coverage.length - incomplete.length,
			withheldCoverageRows: incomplete.length
		},
		artifactPath: artifactRelativePath,
		artifactHash,
		sourceManifestHash,
		modelUsage: {
			baseGenerator: base.generationSummary.usage,
			carriedRepairGenerators: base.carriedRepairs.map((entry) => entry.generationSummary.usage),
			reviewer: review.usage
		}
	});
	console.log(readFileSync(path.join(artifactDir, 'generation-run.json'), 'utf8'));
}

function loadTargetedRepairBase(baseDir) {
	for (const name of [
		'plan.json',
		'source-evidence.json',
		'generation/last-message.json',
		'generation/events.jsonl',
		'generation/codex-run-summary.json',
		'failure-diagnostics.json'
	]) {
		if (!existsSync(path.join(baseDir, name))) throw new Error(`Base trace is missing ${name}.`);
	}
	const basePlan = JSON.parse(readFileSync(path.join(baseDir, 'plan.json'), 'utf8'));
	if (
		basePlan.promptVersion !== 'standard-study-card-compiler-v3' ||
		basePlan.batchId !== batchId ||
		basePlan.specificationId !== specification.id ||
		basePlan.subject !== args.subject ||
		basePlan.countPerTopic !== args.countPerTopic ||
		basePlan.minimumAcceptedPerTopic !== args.minimumAcceptedPerTopic ||
		basePlan.expectedCardCount !== plan.expectedCardCount ||
		basePlan.model !== args.model ||
		basePlan.thinkingLevel !== args.thinkingLevel ||
		stableStringify(basePlan.offeringIds) !== stableStringify(plan.offeringIds) ||
		stableStringify(basePlan.topicComponentIds) !== stableStringify(plan.topicComponentIds) ||
		basePlan.sourcePdf?.sha256 !== plan.sourcePdf.sha256
	) {
		throw new Error('Base trace does not match this exact failed v3 batch identity and scope.');
	}
	const sourceEvidence = JSON.parse(
		readFileSync(path.join(baseDir, 'source-evidence.json'), 'utf8')
	);
	if (stableStringify(sourceEvidence.topics) !== stableStringify(sourceTopics)) {
		throw new Error('Current official source evidence drifted from the preserved base trace.');
	}
	const generationSummary = JSON.parse(
		readFileSync(path.join(baseDir, 'generation', 'codex-run-summary.json'), 'utf8')
	);
	if (
		generationSummary.status !== 'passed' ||
		generationSummary.model !== args.model ||
		generationSummary.thinkingLevel !== args.thinkingLevel ||
		!generationSummary.threadId ||
		!generationSummary.startedAt ||
		!generationSummary.finishedAt
	) {
		throw new Error('Base generator provenance is incomplete or incompatible.');
	}
	const rawCandidates = parseOutput(
		readFileSync(path.join(baseDir, 'generation', 'last-message.json'), 'utf8')
	);
	if (
		!Array.isArray(rawCandidates.cards) ||
		rawCandidates.cards.length !== plan.expectedCardCount
	) {
		throw new Error('Base generator payload does not contain the planned candidate count.');
	}
	if (
		new Set(rawCandidates.cards.map((card) => card.id)).size !== rawCandidates.cards.length ||
		new Set(rawCandidates.cards.map((card) => card.conceptKey)).size !== rawCandidates.cards.length
	) {
		throw new Error('Base generator payload has duplicate card or concept identities.');
	}
	const validCards = [];
	const detectedInvalidCards = [];
	for (const [index, card] of rawCandidates.cards.entries()) {
		try {
			validateCandidates(
				{ cards: [card] },
				{
					plan: basePlan,
					specification,
					offerings,
					sourceTopics,
					allowPartial: true,
					sourceExcerptMaxLength: 2_000
				}
			);
			validCards.push(card);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!message.includes('.sourceExcerpt ')) {
				throw new Error(`Base card ${index} has a non-repairable failure: ${message}`, {
					cause: error
				});
			}
			detectedInvalidCards.push({ index, card, issue: message });
		}
	}
	if (
		detectedInvalidCards.length < 1 ||
		validCards.length + detectedInvalidCards.length !== plan.expectedCardCount
	) {
		throw new Error('Base trace does not have a bounded set of exact-source failures to repair.');
	}
	const diagnostics = JSON.parse(
		readFileSync(path.join(baseDir, 'failure-diagnostics.json'), 'utf8')
	);
	const diagnosticIds = (diagnostics.invalidCards ?? []).map((entry) => entry.cardId).sort();
	const detectedIds = detectedInvalidCards.map((entry) => entry.card.id).sort();
	if (stableStringify(diagnosticIds) !== stableStringify(detectedIds)) {
		throw new Error('Base failure diagnostics do not match the independently detected repair set.');
	}
	const carriedRepairs = args.carryRepairFrom
		? [loadCarriedRepairTrace(path.resolve(args.carryRepairFrom), detectedInvalidCards, baseDir)]
		: [];
	const carriedIds = new Set(carriedRepairs.flatMap((entry) => entry.cards.map((card) => card.id)));
	const invalidCards = detectedInvalidCards.filter((entry) => !carriedIds.has(entry.card.id));
	if (invalidCards.length < 1 && !args.reviewCarriedValid) {
		throw new Error(
			'Carried repair trace already resolves every failed identity; no model repair remains.'
		);
	}
	return {
		plan: basePlan,
		sourceEvidence,
		generationSummary,
		rawCandidates,
		validCards,
		originalInvalidCards: detectedInvalidCards,
		invalidCards,
		carriedRepairs
	};
}

function loadCarriedRepairTrace(carryDir, expectedFailures, baseDir) {
	if (carryDir === baseDir) throw new Error('Carried repair trace must differ from the v3 base.');
	for (const name of [
		'plan.json',
		'repair-generation-prompt.txt',
		'repair-generation-model-output.json',
		'repair-generation/events.jsonl',
		'repair-generation/codex-run-summary.json'
	]) {
		if (!existsSync(path.join(carryDir, name))) {
			throw new Error(`Carried repair trace is missing ${name}.`);
		}
	}
	const carryPlan = JSON.parse(readFileSync(path.join(carryDir, 'plan.json'), 'utf8'));
	if (
		carryPlan.batchId !== batchId ||
		carryPlan.basePromptVersion !== 'standard-study-card-compiler-v3' ||
		typeof carryPlan.repairPromptVersion !== 'string' ||
		!carryPlan.repairPromptVersion.trim()
	) {
		throw new Error('Carried repair trace has incompatible batch or prompt provenance.');
	}
	const generationSummary = JSON.parse(
		readFileSync(path.join(carryDir, 'repair-generation', 'codex-run-summary.json'), 'utf8')
	);
	if (
		generationSummary.status !== 'passed' ||
		generationSummary.model !== args.model ||
		generationSummary.thinkingLevel !== args.thinkingLevel ||
		!generationSummary.threadId ||
		!generationSummary.startedAt ||
		!generationSummary.finishedAt
	) {
		throw new Error('Carried repair generator provenance is incomplete or incompatible.');
	}
	const raw = parseOutput(
		readFileSync(path.join(carryDir, 'repair-generation-model-output.json'), 'utf8')
	);
	if (!Array.isArray(raw.cards)) throw new Error('Carried repair output has no cards.');
	const expectedById = new Map(expectedFailures.map((entry) => [entry.card.id, entry.card]));
	const cards = [];
	const rejectedCards = [];
	for (const card of raw.cards) {
		const expected = expectedById.get(card.id);
		if (!expected) throw new Error(`Carried repair output contains unexpected card ${card.id}.`);
		if (
			card.conceptKey !== expected.conceptKey ||
			card.topicComponentId !== expected.topicComponentId
		) {
			throw new Error(`Carried repair card ${card.id} changed its concept or topic identity.`);
		}
		try {
			validateCandidates(
				{ cards: [card] },
				{
					plan,
					offerings,
					sourceTopics,
					allowPartial: true,
					sourceExcerptMaxLength: 400
				}
			);
			cards.push(card);
		} catch (error) {
			if (!(error instanceof Error) || !error.message.includes('.sourceExcerpt ')) throw error;
			rejectedCards.push({ card, issue: error.message });
		}
	}
	if (cards.length < 1) {
		throw new Error('Carried repair trace contains no independently exact-valid replacement.');
	}
	return {
		dir: carryDir,
		promptVersion: carryPlan.repairPromptVersion,
		generationSummary,
		cards,
		rejectedCards
	};
}

function selectReviewerShortageIndexes(candidates, reviews) {
	if (plan.generationMode === 'required-descendants') {
		return reviews.reviews.flatMap((entry, index) => (entry.accepted ? [] : [index]));
	}
	const acceptedByTopic = new Map();
	for (const [index, card] of candidates.cards.entries()) {
		if (reviews.reviews[index].accepted) {
			acceptedByTopic.set(
				card.topicComponentId,
				(acceptedByTopic.get(card.topicComponentId) ?? 0) + 1
			);
		}
	}
	return topics.flatMap((topic) => {
		const shortage = Math.max(
			0,
			args.minimumAcceptedPerTopic - (acceptedByTopic.get(topic.id) ?? 0)
		);
		if (shortage === 0) return [];
		return candidates.cards
			.flatMap((card, index) =>
				card.topicComponentId === topic.id && !reviews.reviews[index].accepted ? [index] : []
			)
			.slice(0, shortage);
	});
}

async function repairRequiredReviewerRejections(
	initialCandidates,
	initialReviews,
	initialRepairIndexes
) {
	let workingCards = [...initialCandidates.cards];
	let workingReviews = [...initialReviews.reviews];
	let activeIndexes = [...initialRepairIndexes];
	const runs = [];
	for (let attempt = 1; attempt <= 2; attempt += 1) {
		const rejectedIndexes = activeIndexes.filter((index) => !workingReviews[index].accepted);
		if (rejectedIndexes.length === 0) break;
		const rejected = rejectedIndexes.map((index) => ({
			index,
			card: workingCards[index],
			review: workingReviews[index]
		}));
		const generationStage = `reviewed-repair-generation-${attempt}`;
		const reviewStage = `reviewed-repair-review-${attempt}`;
		const repairScope = sourceTopics
			.filter((topic) =>
				rejected.some(({ card }) => card.topicComponentId === topic.topicComponentId)
			)
			.map((topic) => ({
				...topic,
				components: topic.components.filter((component) =>
					rejected.some(({ card }) => card.curriculumComponentId === component.id)
				)
			}));
		const repairPrompt = `You are performing a narrowly scoped repair of cards rejected by an independent reviewer in an import-grade descendant-coverage release.

Return exactly ${rejected.length} replacement cards in the listed order. Preserve every id, conceptKey, topicComponentId and curriculumComponentId exactly. Address every reviewer issue using only the exact official component supplied for that card. Do not alter or discuss accepted cards.

Every sourceExcerpt must be one exact contiguous substring of at most 400 characters from that component's text, without reflow or control bytes. Front, back, explanation, feedback and any memoryTip must be fully entailed. memoryTip may be null. Use exactly three or four unique choices with one exact correct answer; four is allowed only for three distinct plausible misconceptions. Keep a meaningful allowed subject emoji that does not reveal the answer. Output JSON only.

Rejected cards and required identities:
${JSON.stringify(
	rejected.map(({ card, review }) => ({
		requiredIdentity: {
			id: card.id,
			conceptKey: card.conceptKey,
			topicComponentId: card.topicComponentId,
			curriculumComponentId: card.curriculumComponentId
		},
		reviewer: review,
		rejectedCandidate: card
	})),
	null,
	2
)}

Official source scope:
${JSON.stringify(
	{
		specification: publicSpecification(specification),
		offerings: offerings.map(publicOffering),
		topics: repairScope
	},
	null,
	2
)}`;
		writeFileSync(path.join(workDir, `${generationStage}-prompt.txt`), `${repairPrompt}\n`);
		const generationResult = await runStage(generationStage, repairPrompt, buildGenerationSchema());
		writeFileSync(
			path.join(workDir, `${generationStage}-model-output.json`),
			`${generationResult.finalResponse}\n`
		);
		const generated = parseOutput(generationResult.finalResponse);
		if (!Array.isArray(generated.cards) || generated.cards.length !== rejected.length) {
			throw new Error(
				`Reviewed repair ${attempt} returned ${generated.cards?.length ?? 0}; expected ${rejected.length}.`
			);
		}
		const replacements = generated.cards.map((card, index) => {
			const expected = rejected[index].card;
			for (const field of ['id', 'conceptKey', 'topicComponentId', 'curriculumComponentId']) {
				if (card[field] !== expected[field]) {
					throw new Error(`Reviewed repair ${attempt} changed ${field} for ${expected.id}.`);
				}
			}
			return validateCandidates(
				{ cards: [card] },
				{ plan, offerings, sourceTopics, allowPartial: true }
			).cards[0];
		});
		writeJson(path.join(workDir, `${generationStage}-candidates.json`), {
			cards: replacements
		});
		const replacementPrompt = buildReviewPrompt({
			plan,
			specification,
			offerings,
			sourceTopics,
			candidates: { cards: replacements }
		});
		writeFileSync(path.join(workDir, `${reviewStage}-prompt.txt`), `${replacementPrompt}\n`);
		const reviewResult = await runStage(reviewStage, replacementPrompt, buildReviewSchema());
		writeFileSync(
			path.join(workDir, `${reviewStage}-model-output.json`),
			`${reviewResult.finalResponse}\n`
		);
		const replacementReviews = validateReviews(
			parseOutput(reviewResult.finalResponse),
			replacements
		);
		writeJson(path.join(workDir, `${reviewStage}.json`), replacementReviews);
		for (const [replacementIndex, original] of rejected.entries()) {
			workingCards[original.index] = replacements[replacementIndex];
			workingReviews[original.index] = replacementReviews.reviews[replacementIndex];
		}
		runs.push({
			attempt,
			generationStage,
			reviewStage,
			originalRejected: rejected,
			replacements,
			replacementReviews: replacementReviews.reviews,
			generationSummary: loadPassedStageSummary(generationStage),
			reviewSummary: loadPassedStageSummary(reviewStage)
		});
	}
	return {
		candidates: { cards: workingCards },
		reviews: { reviews: workingReviews },
		runs
	};
}

function buildTargetedRepairPrompt(base) {
	const repairTopicIds = new Set(
		base.invalidCards.map((entry) => entry.requiredTopicComponentId ?? entry.card.topicComponentId)
	);
	const repairScope = sourceTopics.filter((topic) => repairTopicIds.has(topic.topicComponentId));
	return `You are performing a narrowly scoped source-evidence repair in an import-grade GCSE standard deck. Do not regenerate, rewrite or discuss any preserved card.

Produce exactly ${base.invalidCards.length} replacement card(s), in the listed order, and preserve each required identity exactly. ${plan.generationMode === 'required-descendants' ? 'Each replacement must target its listed requiredCurriculumComponentId exactly; do not substitute another descendant.' : 'You may select a different supplied descendant curriculumComponentId only when necessary to make the same concept fully supported.'} Revise learner-facing content only when necessary. Use only the supplied official component text.

Targeted-repair v2 hard rules for every replacement:
- sourceExcerpt is one exact character-for-character contiguous substring of at most 400 characters from the selected component text. Prefer one sentence, clause or bullet. Do not reflow whitespace, join paragraphs, omit internal words, add ellipses, transliterate Unicode spaces, or emit control bytes. If equation layout previously caused malformed spacing, narrow the same concept to an exactly quoted reactant side, product side, or adjacent prose claim rather than reproducing the layout; adjust front/back/explanation accordingly.
- sourceLocator names the selected component's supplied official page locator.
- Front, back, explanation, choice feedback and every contrast must be fully entailed by that one excerpt. memoryTip may be null; include it only when it provides an honest, non-contrived retrieval route supported by the excerpt.
- Supply exactly three or four unique choices with one exact correct answer. Use four only for three genuinely distinct plausible misconceptions; otherwise use three. Every distractor needs specific diagnostic feedback and a misconception label.
- Keep the meaningful subject emoji within the supplied allowlist and do not leak the answer.
- IDs, concept keys and choice keys remain lowercase kebab-case. Output JSON only and match the schema.

Required replacements and preserved failures:
${JSON.stringify(
	base.invalidCards.map((entry) => ({
		index: entry.index,
		requiredIdentity: entry.repairIdentity ?? {
			id: entry.card.id,
			conceptKey: entry.card.conceptKey,
			topicComponentId: entry.card.topicComponentId
		},
		...(entry.requiredComponentId
			? { requiredCurriculumComponentId: entry.requiredComponentId }
			: {}),
		deterministicFailure: entry.issue,
		rejectedCandidate: entry.card
	})),
	null,
	2
)}

Official repair scope:
${JSON.stringify(
	{
		specification: publicSpecification(specification),
		offerings: offerings.map(publicOffering),
		topics: repairScope
	},
	null,
	2
)}`;
}

async function runStage(name, prompt, outputSchema) {
	const directory = path.join(workDir, name);
	return await runCodexSdkTurn({
		prompt,
		workDir: directory,
		eventsPath: path.join(directory, 'events.jsonl'),
		lastMessagePath: path.join(directory, 'last-message.json'),
		summaryPath: path.join(directory, 'codex-run-summary.json'),
		model: args.model,
		thinkingLevel: args.thinkingLevel,
		timeoutMs: args.timeoutMs,
		networkAccessEnabled: false,
		webSearchMode: 'disabled',
		outputSchema,
		sandboxMode: 'read-only',
		environmentMode: 'minimal'
	});
}

function loadPassedStageSummary(name) {
	const summaryPath = path.join(workDir, name, 'codex-run-summary.json');
	if (!existsSync(summaryPath)) throw new Error(`Missing ${name} run summary.`);
	const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
	if (
		summary.status !== 'passed' ||
		summary.model !== args.model ||
		summary.thinkingLevel !== args.thinkingLevel ||
		!summary.threadId ||
		!summary.startedAt ||
		!summary.finishedAt
	) {
		throw new Error(`${name} summary is not a passed ${args.model}/${args.thinkingLevel} run.`);
	}
	return summary;
}

function partitionGeneratedCandidates(input) {
	if (input.plan.generationMode !== 'required-descendants') {
		return partitionStandardStudyCardCandidates(input);
	}
	const validCards = [];
	const invalidCards = [];
	const validCountByTopic = new Map(input.topicComponentIds.map((id) => [id, 0]));
	const requiredComponentIds = input.plan.requiredComponentIds;
	for (const [index, card] of input.cards.entries()) {
		const requiredComponentId = requiredComponentIds[index];
		const requiredTopicComponentId = selectedTopicFor(requiredComponentId);
		try {
			if (card?.curriculumComponentId !== requiredComponentId) {
				throw new Error(
					`Candidate must target required component ${requiredComponentId} at position ${index}.`
				);
			}
			if (card?.topicComponentId !== requiredTopicComponentId) {
				throw new Error(
					`Candidate must map required component ${requiredComponentId} to ${requiredTopicComponentId}.`
				);
			}
			input.validateCard(card, index);
			validCards.push(card);
			validCountByTopic.set(
				requiredTopicComponentId,
				(validCountByTopic.get(requiredTopicComponentId) ?? 0) + 1
			);
		} catch (error) {
			const issue = error instanceof Error ? error.message : String(error);
			const identityWasDuplicated = issue.includes('duplicated card or concept identity');
			const usableId =
				isKebabCaseStudyCardKey(card?.id) && !identityWasDuplicated
					? card.id
					: `${input.plan.batchId}-component-${index + 1}`;
			const usableConceptKey =
				isKebabCaseStudyCardKey(card?.conceptKey) && !identityWasDuplicated
					? card.conceptKey
					: `${input.plan.batchId}-component-${index + 1}-concept`;
			invalidCards.push({
				index,
				card,
				issue,
				requiredComponentId,
				requiredTopicComponentId,
				repairIdentity: {
					id: usableId,
					conceptKey: usableConceptKey,
					topicComponentId: requiredTopicComponentId
				}
			});
		}
	}
	const missingByTopic = new Map();
	for (const entry of invalidCards) {
		missingByTopic.set(
			entry.requiredTopicComponentId,
			(missingByTopic.get(entry.requiredTopicComponentId) ?? 0) + 1
		);
	}
	const topicsBelowMinimum = [...missingByTopic].map(([topicComponentId, missingCardCount]) => ({
		topicComponentId,
		validCardCount: validCountByTopic.get(topicComponentId) ?? 0,
		missingCardCount
	}));
	return {
		validCards,
		invalidCards,
		validCountByTopic: Object.fromEntries(validCountByTopic),
		topicsBelowMinimum,
		repairCandidates: invalidCards,
		unrepairableTopics: [],
		canReviewWithoutRepair: invalidCards.length === 0
	};
}

function buildGenerationPrompt({ plan, specification, offerings, sourceTopics, countPerTopic }) {
	const requiredDescendantMode = plan.generationMode === 'required-descendants';
	const generationTask = requiredDescendantMode
		? `Create exactly one high-value recall card for EVERY supplied official descendant component (${plan.expectedCardCount} cards total), in the exact component order shown. Each curriculumComponentId must equal that supplied component id; do not substitute a sibling or broader component. topicComponentId must remain its supplied selectable topic container.`
		: `Create exactly ${countPerTopic} high-value recall cards for EVERY supplied selectable curriculum topic (${plan.expectedCardCount} cards total). The topic is a course-scope container: a card may use a narrower descendant concept, but topicComponentId must remain the supplied selectable topic id and curriculumComponentId must be the exact supplied descendant id whose excerpt supports the answer.`;
	return `You are the generator in an offline, import-grade GCSE standard-deck compiler.

${generationTask} Use only the official source excerpts below.

Hard rules:
- Output JSON only, matching the schema.
- This is ${specification.board} ${specification.qualification} ${plan.subject}; do not import facts from another board or version.
- Every answer must be entailed by one source excerpt. sourceExcerpt must be ONE short passage of at most 400 characters and a character-for-character CONTIGUOUS substring copied from the selected component's exact text value. Prefer one sentence, clause or bullet. Preserve every space, line break, punctuation mark and character at that location. Never copy equation/diagram layout, reflow a line, insert a line break, join paragraphs or non-contiguous fragments, omit words or clauses from the middle, use ellipses, or emit control bytes. Before returning JSON, verify mentally that source.text.includes(sourceExcerpt) would be true. Give that component id and its page locator.
- Preserve source qualifiers exactly: do not turn "may", "typical", "without knowledge of", a listed sequence, or a limited example into a stronger universal, credential rule, or spatial convention.
- Exclude Higher-only content whenever ANY target offering is Foundation. Prefer shared core knowledge, never silently map Higher-only content to Foundation.
- Fronts must support unaided recall and be self-contained: never use unresolved phrases such as "these issues". Backs are concise canonical answers. Write a separate explanation. memoryTip may be null and should be null when no honest, non-contrived retrieval route exists; never restate the answer or force a gimmick. Every factual contrast or clause in the explanation must be directly supported by the cited excerpt; omit even generally true embellishment when the excerpt does not state it.
- Use one meaningful emoji from the supplied allowlist. It must orient without revealing the answer or a defining property of the answer. Do not use a generic book/note cue merely to mean "study". For security, encryption, lock, key or access questions, do not use 🔐.
- Supply exactly three or four unique choices. Exactly one isCorrect=true and its text equals back exactly. Use four total choices only when there are three distinct, plausible neighbouring misconceptions; use three total choices when a third distractor would be contrived or repetitive. Every choice has concise teaching feedback and every wrong choice has a specific misconception label. Do not make distractors by combining unrelated nonsense categories.
- Prefer durable definitions, relationships, sequence, comparison, methods and exact governing facts over trivia.${requiredDescendantMode ? ' Teach the most useful retrievable claim actually supported by each required component.' : ' Vary kinds within each topic.'}
- A card must retrieve a usable subject concept or method. Do not turn an assessment objective, curriculum heading, list of command verbs, or paired near-synonyms into content merely because it appears in the specification.
- IDs, concept keys and all choice keys are lowercase kebab-case and globally specific. Use stable choice keys a, b, c and d in displayed order. Do not mention answer controls in the front.
- Do not create quotation or plot cards from curriculum specifications.

Allowed kinds: ${CARD_KINDS.join(', ')}.
Allowed emoji for ${plan.subject}: ${allowedCues(plan.subject).join(' ')}.

Deterministic scope:
${JSON.stringify(
	{
		specification: publicSpecification(specification),
		offerings: offerings.map(publicOffering),
		topics: sourceTopics
	},
	null,
	2
)}`;
}

function buildReviewPrompt({ specification, offerings, sourceTopics, candidates }) {
	const componentIdsByTopic = new Map();
	for (const card of candidates.cards) {
		const componentIds = componentIdsByTopic.get(card.topicComponentId) ?? new Set();
		componentIds.add(card.curriculumComponentId);
		componentIdsByTopic.set(card.topicComponentId, componentIds);
	}
	const citedSourceTopics = sourceTopics
		.filter((topic) => componentIdsByTopic.has(topic.topicComponentId))
		.map((topic) => ({
			...topic,
			components: topic.components.filter((component) =>
				componentIdsByTopic.get(topic.topicComponentId)?.has(component.id)
			)
		}));
	return `You are the independent reviewer in an offline, import-grade GCSE standard-deck pipeline. You did not generate these cards. Review each complete card against the supplied official source and deterministic course scope. Do not rewrite or silently repair anything.

Accept only when ALL are true: exact source excerpt and locator support the back/explanation; board, subject, tier and topic mapping are correct; the prompt is unambiguous; the canonical answer is accurate and concise; the card has three or four choices with exactly one correct; every distractor is unique and pedagogically plausible; a four-choice card has three genuinely distinct misconceptions rather than a contrived filler; feedback diagnoses the actual error; any present memoryTip adds honest retrieval value without merely repeating the answer; the emoji is meaningful but does not leak the answer; and no card is mere curriculum-title trivia. memoryTip may be null and its absence is never grounds for rejection.

Reject Higher-only material if any target is Foundation. Reject an unsupported inference even if it is generally true. Return exactly one review for every card id, in the same order. Output JSON only.

Scope:
${JSON.stringify(
	{
		specification: publicSpecification(specification),
		offerings: offerings.map(publicOffering),
		topics: citedSourceTopics
	},
	null,
	2
)}

Candidates:
${JSON.stringify(candidates, null, 2)}`;
}

function validateCandidates(
	value,
	{
		plan,
		offerings,
		sourceTopics,
		allowReviewedLegacyChoiceKeys = false,
		allowPartial = false,
		sourceExcerptMaxLength = 400
	}
) {
	if (!value || !Array.isArray(value.cards))
		throw new Error('Generator output must contain cards.');
	if (!allowPartial && value.cards.length !== plan.expectedCardCount) {
		throw new Error(
			`Generator returned ${value.cards.length}; expected ${plan.expectedCardCount}.`
		);
	}
	const sourceByTopic = new Map(sourceTopics.map((topic) => [topic.topicComponentId, topic]));
	const ids = new Set();
	const concepts = new Set();
	const countByTopic = new Map();
	const countByComponent = new Map();
	for (const [index, card] of value.cards.entries()) {
		const label = `cards[${index}]`;
		for (const field of [
			'id',
			'conceptKey',
			'topicComponentId',
			'curriculumComponentId',
			'kind',
			'visualCue',
			'front',
			'back',
			'explanation',
			'sourceExcerpt',
			'sourceLocator'
		]) {
			if (typeof card[field] !== 'string' || !card[field].trim()) {
				throw new Error(`${label}.${field} is required.`);
			}
		}
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(card.id)) throw new Error(`${label}.id is invalid.`);
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(card.conceptKey)) {
			throw new Error(`${label}.conceptKey is invalid.`);
		}
		if (ids.has(card.id) || concepts.has(card.conceptKey))
			throw new Error(`${label} is duplicated.`);
		ids.add(card.id);
		concepts.add(card.conceptKey);
		if (!CARD_KINDS.includes(card.kind) || card.kind === 'plot' || card.kind === 'quotation') {
			throw new Error(`${label}.kind is unsupported for specification generation.`);
		}
		if (!allowedCues(plan.subject).includes(card.visualCue)) {
			throw new Error(`${label}.visualCue is outside the subject allowlist.`);
		}
		const topic = sourceByTopic.get(card.topicComponentId);
		if (!topic) throw new Error(`${label}.topicComponentId is not in scope.`);
		const source = topic.components.find(
			(component) => component.id === card.curriculumComponentId
		);
		if (!source) throw new Error(`${label}.curriculumComponentId is not in the topic source.`);
		const appliesToFoundation = offerings.some(
			(offering) =>
				offering.tier === 'Foundation' &&
				offering.selectableComponentIds.includes(card.topicComponentId)
		);
		if (appliesToFoundation && isHigherOnly(source)) {
			throw new Error(`${label} maps Higher-only evidence into a Foundation offering.`);
		}
		const sourceExcerptIssue = standardStudyCardSourceExcerptIssue(
			source.text,
			card.sourceExcerpt,
			{ maxLength: sourceExcerptMaxLength }
		);
		if (sourceExcerptIssue) {
			throw new Error(`${label}.sourceExcerpt ${sourceExcerptIssue}.`);
		}
		if (!card.sourceLocator.includes(`page`))
			throw new Error(`${label}.sourceLocator needs pages.`);
		if (!Array.isArray(card.choices) || card.choices.length < 3 || card.choices.length > 4) {
			throw new Error(`${label} needs three or four choices.`);
		}
		const correct = card.choices.filter((choice) => choice.isCorrect === true);
		if (correct.length !== 1 || correct[0].text.trim() !== card.back.trim()) {
			throw new Error(`${label} needs one correct choice equal to back.`);
		}
		if (
			new Set(card.choices.map((choice) => choice.text.trim().toLowerCase())).size !==
			card.choices.length
		) {
			throw new Error(`${label} choice text must be unique.`);
		}
		if (
			new Set(card.choices.map((choice) => choice.key.trim().toLowerCase())).size !==
			card.choices.length
		) {
			throw new Error(`${label} choice keys must be unique.`);
		}
		for (const choice of card.choices) {
			if (!choice.key?.trim() || !choice.text?.trim() || !choice.feedback?.trim()) {
				throw new Error(`${label} has an incomplete choice.`);
			}
			if (!allowReviewedLegacyChoiceKeys && !isKebabCaseStudyCardKey(choice.key)) {
				throw new Error(`${label} choice keys must be lowercase kebab-case.`);
			}
			if (!choice.isCorrect && !choice.misconception?.trim()) {
				throw new Error(`${label} wrong choices need misconceptions.`);
			}
		}
		const memoryTipIssue = standardStudyCardMemoryTipIssue(card.memoryTip);
		if (memoryTipIssue) throw new Error(`${label}.${memoryTipIssue}.`);
		countByTopic.set(card.topicComponentId, (countByTopic.get(card.topicComponentId) ?? 0) + 1);
		countByComponent.set(
			card.curriculumComponentId,
			(countByComponent.get(card.curriculumComponentId) ?? 0) + 1
		);
	}
	if (!allowPartial) {
		if (plan.generationMode === 'required-descendants') {
			for (const componentId of plan.requiredComponentIds) {
				if (countByComponent.get(componentId) !== 1) {
					throw new Error(`Required component ${componentId} needs exactly one card.`);
				}
			}
		} else {
			for (const topic of sourceTopics) {
				if (countByTopic.get(topic.topicComponentId) !== plan.countPerTopic) {
					throw new Error(`Topic ${topic.topicComponentId} has the wrong card count.`);
				}
			}
		}
	}
	return { cards: value.cards };
}

function validateReviews(value, cards) {
	if (!value || !Array.isArray(value.reviews) || value.reviews.length !== cards.length) {
		throw new Error('Reviewer must return one review per card.');
	}
	for (const [index, review] of value.reviews.entries()) {
		if (review.cardId !== cards[index].id || typeof review.accepted !== 'boolean') {
			throw new Error(`Review ${index} does not match its candidate.`);
		}
		if (!Array.isArray(review.issues) || !Array.isArray(review.learnerValue)) {
			throw new Error(`Review ${index} needs issues and learnerValue arrays.`);
		}
		if (review.accepted && review.issues.length > 0) {
			throw new Error(`Accepted review ${review.cardId} cannot contain issues.`);
		}
		if (!review.accepted && review.issues.length === 0) {
			throw new Error(`Rejected review ${review.cardId} must explain why.`);
		}
	}
	return value;
}

function bindCard(card, { specification, offerings, sourceTopics }) {
	const sourceTopic = sourceTopics.find(
		(topic) => topic.topicComponentId === card.topicComponentId
	);
	const sourceComponent = sourceTopic.components.find(
		(component) => component.id === card.curriculumComponentId
	);
	const applicableOfferings = offerings.filter((offering) =>
		offering.selectableComponentIds.includes(card.topicComponentId)
	);
	const primary = applicableOfferings[0];
	const content = {
		...card,
		choices: normalizeReviewedChoiceKeys(card.choices),
		board: specification.board,
		qualification: specification.qualification,
		subject: args.subject,
		contentRevision: 1,
		sources: [
			{
				kind: 'curriculum-specification',
				url: specification.landingUrl,
				title: specification.title,
				locator: card.sourceLocator,
				excerpt: card.sourceExcerpt,
				sourceHash: specification.sha256,
				rightsBasis: 'official_exam_board_specification',
				supports: [
					'front',
					'back',
					'explanation',
					...(card.memoryTip === null ? [] : ['memoryTip'])
				]
			}
		],
		targets: applicableOfferings.map((offering) => ({
			offeringId: offering.id,
			curriculumComponentId: sourceComponent.id,
			topicComponentId: sourceTopic.topicComponentId,
			isPrimary: offering.id === primary.id,
			confidence: 1,
			reviewed: true
		}))
	};
	// The model-facing compiler shape carries its deterministic component ids at
	// the card root.  The durable v1 artifact stores that relationship only in
	// reviewed targets, so do not leak compiler-only fields into the exact
	// import contract.
	delete content.topicComponentId;
	delete content.curriculumComponentId;
	delete content.sourceExcerpt;
	delete content.sourceLocator;
	return content;
}

function sourceForTopic(specification, topic, pdfPath, requiredComponentIds = null) {
	const components = descendants(specification.components, topic.id).filter(
		(component) =>
			(!requiredComponentIds || requiredComponentIds.has(component.id)) &&
			Number.isInteger(component.sourcePageStart) &&
			Number.isInteger(component.sourcePageEnd)
	);
	const pageStart = Math.min(...components.map((component) => component.sourcePageStart));
	const pageEnd = Math.max(...components.map((component) => component.sourcePageEnd));
	if (!Number.isFinite(pageStart) || !Number.isFinite(pageEnd)) {
		throw new Error(`Topic ${topic.id} has no source pages.`);
	}
	const physicalText = extractPdfPages(pdfPath, pageStart, pageEnd);
	const pageHeader = `Official PDF pages ${pageStart}-${pageEnd}`;
	return {
		topicComponentId: topic.id,
		code: topic.code,
		title: topic.title,
		paper: topic.paper,
		pageStart,
		pageEnd,
		components: components.map((component) => ({
			id: component.id,
			code: component.code,
			title: component.title,
			kind: component.kind,
			tier: component.tier,
			locator: `${pageHeader}; ${component.code} ${component.title}`,
			text: sourceSliceForComponent(physicalText, component, pageHeader)
		}))
	};
}

function sourceSliceForComponent(physicalText, component, pageHeader) {
	const normalized = physicalText.split(String.fromCharCode(0)).join('').trim();
	const titleIndex = normalized.toLowerCase().indexOf(component.title.toLowerCase());
	const start = titleIndex >= 0 ? titleIndex : 0;
	const slice = normalized.slice(start, start + 7_000).trim();
	if (slice.length < 80) throw new Error(`${component.id} produced too little source text.`);
	return `${pageHeader}\n${slice}`;
}

function descendants(components, rootId) {
	const children = new Map();
	for (const component of components) {
		const rows = children.get(component.parentId) ?? [];
		rows.push(component);
		children.set(component.parentId, rows);
	}
	const output = [];
	const visit = (id) => {
		const row = components.find((component) => component.id === id);
		if (row) output.push(row);
		for (const child of children.get(id) ?? []) visit(child.id);
	};
	visit(rootId);
	return output;
}

function extractPdfPages(pdfPath, pageStart, pageEnd) {
	return execFileSync(
		'pdftotext',
		['-f', String(pageStart), '-l', String(pageEnd), '-raw', '-nopgbrk', pdfPath, '-'],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
	);
}

function resolvePdfPath(specification, sourceRoot) {
	const configured = path.resolve(specification.localPath);
	if (existsSync(configured)) return configured;
	if (sourceRoot) {
		const fallback = path.resolve(sourceRoot, path.basename(specification.localPath));
		if (existsSync(fallback)) return fallback;
	}
	throw new Error(`Official source PDF is missing: ${specification.localPath}`);
}

function publicSpecification(specification) {
	return {
		id: specification.id,
		board: specification.board,
		qualification: specification.qualification,
		subject: specification.subject,
		specificationCode: specification.specificationCode,
		version: specification.version,
		title: specification.title,
		landingUrl: specification.landingUrl,
		pdfUrl: specification.pdfUrl,
		sha256: specification.sha256
	};
}

function publicOffering(offering) {
	return {
		id: offering.id,
		profileSubject: offering.profileSubject,
		course: offering.course,
		tier: offering.tier,
		label: offering.label,
		selectableComponentIds: offering.selectableComponentIds
	};
}

function allowedCues(subject) {
	return (
		{
			Biology: [
				'🔬',
				'🧫',
				'🧬',
				'🫀',
				'🫁',
				'🦠',
				'💉',
				'💊',
				'🌿',
				'🍃',
				'🍄',
				'🦋',
				'🌍',
				'🌡️',
				'💧',
				'💨',
				'🏃',
				'🏋️',
				'🧪'
			],
			Chemistry: [
				'⚛️',
				'🔗',
				'⚖️',
				'🧪',
				'🧂',
				'🔥',
				'⚡',
				'🧊',
				'⏱️',
				'⛽',
				'📏',
				'🫧',
				'♻️',
				'🌡️'
			],
			Physics: [
				'⚙️',
				'⚡',
				'🔗',
				'🔌',
				'🔋',
				'📈',
				'🔀',
				'☢️',
				'🏃',
				'🏋️',
				'🏎️',
				'🎳',
				'🚗',
				'🌊',
				'🌈',
				'🧲',
				'🌌',
				'🏔️',
				'⚛️',
				'⚖️',
				'🌡️'
			],
			'Computer Science': ['💻', '🧮', '🔐', '🗄️', '🌐', '🧩', '🔀', '📈'],
			Geography: ['🗺️', '🌍', '🌋', '🌪️', '🌊', '🏙️', '🌳', '🏭', '🏔️', '♻️'],
			History: ['🏛️', '👑', '🗳️', '⚔️', '📜', '🚂', '🏭', '⏳'],
			'English Language': ['✍️', '🔎', '💬', '📖', '🎭', '🧩']
		}[subject] ?? []
	);
}

function parseOutput(value) {
	const trimmed = String(value ?? '').trim();
	const unwrapped = trimmed.startsWith('```')
		? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
		: trimmed;
	return JSON.parse(unwrapped);
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}

function countValues(values) {
	const counts = new Map();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return counts;
}

function isHigherOnly(component) {
	let current = componentById.get(component?.id) ?? component;
	while (current) {
		if (Array.isArray(current.tier)) {
			if (current.tier.length === 1 && current.tier[0] === 'Higher') return true;
		} else if (current?.tier === 'Higher') {
			return true;
		}
		current = componentById.get(current.parentId);
	}
	return false;
}

function scopeRequiredCandidateIdentities(value) {
	if (plan.generationMode !== 'required-descendants' || !Array.isArray(value?.cards)) {
		return value;
	}
	return {
		...value,
		cards: value.cards.map((card, index) => {
			const requiredComponentId = plan.requiredComponentIds[index] ?? `position-${index + 1}`;
			const prefix = `${slug(specification.board)}-${slug(specification.specificationCode)}-${sha256(requiredComponentId).slice(0, 10)}`;
			const rawId = isKebabCaseStudyCardKey(card?.id) ? card.id : `card-${index + 1}`;
			const rawConcept = isKebabCaseStudyCardKey(card?.conceptKey)
				? card.conceptKey
				: `concept-${index + 1}`;
			return {
				...card,
				id: boundedSlug(`${prefix}-${rawId}`, 160),
				conceptKey: boundedSlug(`${prefix}-${rawConcept}`, 100)
			};
		})
	};
}

function boundedSlug(value, maximumLength) {
	return value.slice(0, maximumLength).replace(/-+$/, '');
}

function slug(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
	const value = (name, fallback = null) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
	const values = (name) =>
		argv
			.filter((argument) => argument.startsWith(`--${name}=`))
			.map((argument) => argument.slice(name.length + 3));
	const integer = (name, fallback, min, max) => {
		const parsed = Number(value(name, String(fallback)));
		if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
			throw new Error(`--${name} must be an integer from ${min} to ${max}.`);
		}
		return parsed;
	};
	const help = argv.includes('--help') || argv.includes('-h');
	const required = (name) => {
		const result = value(name);
		if (!result && !help) throw new Error(`--${name} is required.\n\n${usage()}`);
		return result ?? '';
	};
	return {
		help,
		generate: argv.includes('--generate'),
		force: argv.includes('--force'),
		resumeReviewed: argv.includes('--resume-reviewed'),
		resumeGenerated: argv.includes('--resume-generated'),
		reviewCarriedValid: argv.includes('--review-carried-valid'),
		allowWithheld: argv.includes('--allow-withheld'),
		catalog: value('catalog', 'data/curricula/curriculum-catalog.json'),
		sourceRoot: value('source-root'),
		specificationId: required('specification-id'),
		subject: required('subject'),
		offeringIds: values('offering-id'),
		topicComponentIds: values('topic-component-id'),
		requiredComponentIds: values('required-component-id'),
		countPerTopic: integer('count-per-topic', 3, 2, 6),
		minimumAcceptedPerTopic: integer(
			'minimum-accepted-per-topic',
			Math.min(3, integer('count-per-topic', 3, 2, 6)),
			1,
			integer('count-per-topic', 3, 2, 6)
		),
		batchId: value('batch-id'),
		workDir: value('work-dir'),
		repairFrom: value('repair-from'),
		carryRepairFrom: value('carry-repair-from'),
		reviewedRepairFrom: value('reviewed-repair-from'),
		repairCardId: value('repair-card-id'),
		model: value('model', MODEL),
		thinkingLevel: value('thinking-level', THINKING_LEVEL),
		timeoutMs: integer('timeout-ms', 3_600_000, 60_000, 14_400_000)
	};
}

function usage() {
	return `Usage:
node scripts/generate-standard-study-card-batch.mjs \\
  --specification-id=<catalog id> --subject=<profile subject> \\
  [--offering-id=<exact id>] [--topic-component-id=<selectable id>] \\
  [--required-component-id=<exact official section/topic descendant>] \\
  [--count-per-topic=3] [--minimum-accepted-per-topic=3]
  [--source-root=<directory containing official PDFs>]

The default is a no-model-cost plan. Pass --generate for an independent
${MODEL}/${THINKING_LEVEL} generator and reviewer run. Generated rows are
validated independently: exact-valid rows proceed, and only enough failed
identities to restore a topic minimum are targeted for repair. With one or more
--required-component-id values, the batch creates exactly one card per listed
descendant and every descendant must pass. Use --resume-reviewed
only to recompile an unchanged batch whose saved generation and independent
review both passed but whose durable artifact was not written. Use
--resume-generated after preserving a failed review directory when generation
and deterministic validation passed but no usable independent review exists. Use
--repair-from=<preserved failed work directory> to regenerate only candidate
identities that failed the exact source gate, then independently review the
complete merged deck. When one repair output contains both accepted and still
invalid replacements, --carry-repair-from=<preserved repair work directory>
keeps its exact-valid replacements and generates only the remaining identities.
Use --review-carried-valid (without --generate) to independently review and
publish only the base and carried candidates that already pass deterministic
validation, while retaining unresolved candidates as rejected evidence.`;
}

function buildChoiceSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['key', 'text', 'isCorrect', 'feedback', 'misconception'],
		properties: {
			key: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
			text: { type: 'string' },
			isCorrect: { type: 'boolean' },
			feedback: { type: 'string' },
			misconception: { type: ['string', 'null'] }
		}
	};
}

function buildGenerationSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['cards'],
		properties: {
			cards: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: [
						'id',
						'conceptKey',
						'topicComponentId',
						'curriculumComponentId',
						'kind',
						'visualCue',
						'front',
						'back',
						'reverseFront',
						'reverseBack',
						'explanation',
						'memoryTip',
						'choices',
						'sourceExcerpt',
						'sourceLocator'
					],
					properties: {
						id: { type: 'string' },
						conceptKey: { type: 'string' },
						topicComponentId: { type: 'string' },
						curriculumComponentId: { type: 'string' },
						kind: { type: 'string', enum: CARD_KINDS },
						visualCue: { type: 'string' },
						front: { type: 'string' },
						back: { type: 'string' },
						reverseFront: { type: ['string', 'null'] },
						reverseBack: { type: ['string', 'null'] },
						explanation: { type: 'string' },
						memoryTip: { type: ['string', 'null'] },
						choices: { type: 'array', minItems: 3, maxItems: 4, items: buildChoiceSchema() },
						sourceExcerpt: { type: 'string', maxLength: 400 },
						sourceLocator: { type: 'string' }
					}
				}
			}
		}
	};
}

function buildReviewSchema() {
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
