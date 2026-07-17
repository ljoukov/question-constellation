#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Queue JSON and subprocess plans are validated fail closed at runtime.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
	hashStudyCardArtifact,
	stableStringify,
	validateStudyCardBundle
} from './lib/study-card-artifact.mjs';
import { assertStudyCardCurriculumScope } from './lib/study-card-import.mjs';

const EXPECTED_ELIGIBLE = 789;
const EXPECTED_EXISTING_BASE_COVERED = 36;
const EXPECTED_RECOVERED_BASE_COVERED = 221;
const EXPECTED_PRE_DESCENDANT_COVERED = 257;
const EXPECTED_PRE_DESCENDANT_UNCOVERED = 532;
const EXPECTED_ACCEPTED_DESCENDANT_COVERED = 82;
const EXPECTED_PARTIAL_ACCEPTED_COVERED = 12;
const EXPECTED_PRE_PARTIAL_COVERED = 339;
const EXPECTED_FROZEN_COMPLETION_TARGETS = 450;
const EXPECTED_CURRENT_COVERED = 351;
const EXPECTED_CURRENT_UNCOVERED = 438;
const EXPECTED_LOGICAL_JOBS = 23;
const EXPECTED_PHYSICAL_BATCHES = 26;
const EXPECTED_STANDARD_GENERATION_BATCHES = 24;
const EXPECTED_STANDARD_PROMPT_VERSION = 'standard-study-card-descendant-coverage-v2';
const EXPECTED_LITERATURE_SHARDS = 13;
const EXPECTED_LITERATURE_CARDS = 171;
const COMBINED_FAILED_BATCH =
	'aqa-combined-science-trilogy-8464-physics-shared-descendants-03-e7b6933413-v1';
const PARTIAL_ACCEPTED_RELEASE_ID =
	'aqa-combined-science-trilogy-8464-physics-partial-accepted-rollout-recovered-v1';

const rootDir = process.cwd();
const catalog = readJson(path.join(rootDir, 'data/curricula/curriculum-catalog.json'));
const completionQueuePath = path.join(
	rootDir,
	'docs/release-evidence/study-card-descendant-coverage/completion-queue.json'
);
const prospectiveLogicalQueuePath = path.join(
	rootDir,
	'docs/release-evidence/study-card-descendant-coverage/post-partial-acceptance-completion-queue.json'
);
const executionQueuePath = path.join(
	rootDir,
	'docs/release-evidence/study-card-descendant-coverage/tier-safe-execution-queue.json'
);
const standardPreflightPath = path.join(
	rootDir,
	'docs/release-evidence/study-card-descendant-coverage/completion-queue-preflight.json'
);
const literatureManifestPath = path.join(
	rootDir,
	'data/study-cards/english-literature/ocr-j352-deepening-shard-manifest.json'
);
const literaturePreflightPath = path.join(
	rootDir,
	'docs/release-evidence/english-literature-deepening/queue-preflight.json'
);
const literatureSourcePreflightPath = path.join(
	rootDir,
	'docs/release-evidence/english-literature-deepening/source-preflight.json'
);
const coverageLedgerPath = path.join(
	rootDir,
	'docs/release-evidence/study-card-coverage-ledger.json'
);

const ledger = buildCoverageLedger();
writeJson(coverageLedgerPath, ledger);
const standard = prepareStandardQueue();
writeJson(prospectiveLogicalQueuePath, standard.logicalQueue);
writeJson(executionQueuePath, standard.executionQueue);
writeJson(standardPreflightPath, standard.preflight);
const literature = prepareLiteratureQueue();
writeJson(literaturePreflightPath, literature);
annotateHistoricalEvidence(ledger);

console.log(
	JSON.stringify(
		{
			status: 'queues_prepared_no_model_execution',
			coverage: ledger.canonical,
			standard: standard.preflight.counts,
			literature: literature.counts,
			literatureSourcePreflight: literature.sourcePreflight.status,
			modelCalls: 0
		},
		null,
		2
	)
);

function buildCoverageLedger() {
	const planner = runJson(process.execPath, ['scripts/plan-study-card-descendant-coverage.mjs']);
	const eligible = planner.plans.reduce((sum, plan) => sum + plan.eligibleComponentCount, 0);
	const covered = planner.plans.reduce((sum, plan) => sum + plan.coveredComponentCount, 0);
	const uncovered = planner.plans.reduce((sum, plan) => sum + plan.uncoveredComponentCount, 0);
	const baseRecovery = readJson(
		path.join(rootDir, 'docs/release-evidence/study-card-base-rollout-recovery.json')
	);
	const descendantRecovery = readJson(
		path.join(rootDir, 'docs/release-evidence/study-card-descendant-rollout-recovery.json')
	);
	const existingBaseIds = [
		'aqa-geography-8035-standard-v1',
		'aqa-computer-science-2027-standard-v1',
		'ocr-english-language-j351-standard-v1-rollout-recovered-v1'
	];
	const recoveredBaseIds = baseRecovery.releases.map((release) => release.releaseId);
	const acceptedDescendantIds = descendantRecovery.releases.map((release) => release.releaseId);
	const categories = {
		existingBase: plannerEligibleTargets(existingBaseIds),
		recoveredBase: plannerEligibleTargets(recoveredBaseIds),
		acceptedDescendants: plannerEligibleTargets(acceptedDescendantIds),
		combinedPhysicsPartialAccepted: plannerEligibleTargets([PARTIAL_ACCEPTED_RELEASE_ID])
	};
	assertDisjoint(categories);
	if (
		eligible !== EXPECTED_ELIGIBLE ||
		categories.existingBase.size !== EXPECTED_EXISTING_BASE_COVERED ||
		categories.recoveredBase.size !== EXPECTED_RECOVERED_BASE_COVERED ||
		categories.acceptedDescendants.size !== EXPECTED_ACCEPTED_DESCENDANT_COVERED ||
		categories.combinedPhysicsPartialAccepted.size !== EXPECTED_PARTIAL_ACCEPTED_COVERED ||
		covered !== EXPECTED_CURRENT_COVERED ||
		uncovered !== EXPECTED_CURRENT_UNCOVERED
	) {
		throw new Error('Canonical study-card coverage ledger drifted.');
	}
	const preDescendantCovered = categories.existingBase.size + categories.recoveredBase.size;
	const preDescendantUncovered = eligible - preDescendantCovered;
	if (
		preDescendantCovered !== EXPECTED_PRE_DESCENDANT_COVERED ||
		preDescendantUncovered !== EXPECTED_PRE_DESCENDANT_UNCOVERED
	) {
		throw new Error('Pre-descendant 257/532 historical queue ledger drifted.');
	}
	return {
		schemaVersion: 'study-card-coverage-ledger-v1',
		status: 'reconciled',
		definition:
			'Eligible means official section/topic descendants beneath selectable roots, partitioned once by inherited tier scope. Covered means at least one accepted reviewed card targets that exact eligible component in the applicable offering group.',
		canonical: {
			eligible,
			covered,
			uncovered,
			coverageEquation: `${categories.existingBase.size} existing-base + ${categories.recoveredBase.size} recovered-base + ${categories.acceptedDescendants.size} completed accepted-descendant + ${categories.combinedPhysicsPartialAccepted.size} partial accepted-descendant = ${covered} covered; ${eligible} - ${covered} = ${uncovered} uncovered`
		},
		components: {
			existingBaseCovered: categories.existingBase.size,
			recoveredBaseCovered: categories.recoveredBase.size,
			allBaseCovered: preDescendantCovered,
			acceptedDescendantCovered: categories.acceptedDescendants.size,
			combinedPhysicsPartialAcceptedCovered: categories.combinedPhysicsPartialAccepted.size,
			allAcceptedDescendantCovered:
				categories.acceptedDescendants.size + categories.combinedPhysicsPartialAccepted.size
		},
		historicalSnapshots: {
			missingRecoveredBaseSnapshot: {
				covered: categories.existingBase.size + categories.acceptedDescendants.size,
				uncovered: eligible - categories.existingBase.size - categories.acceptedDescendants.size,
				status: 'superseded-missing-seven-recovered-base-artifacts',
				evidencePath: 'docs/release-evidence/study-card-descendant-coverage/queue-state.json'
			},
			preDescendantQueueInput: {
				covered: preDescendantCovered,
				uncovered: preDescendantUncovered,
				status: 'historically-valid-before-the-12-accepted-descendant-jobs',
				evidencePath: 'docs/release-evidence/study-card-descendant-coverage/recovered-before.json'
			},
			prePartialAcceptedRecovery: {
				covered: EXPECTED_PRE_PARTIAL_COVERED,
				uncovered: EXPECTED_FROZEN_COMPLETION_TARGETS,
				status: 'superseded-after-materializing-12-archived-review-acceptances',
				evidencePath: 'docs/release-evidence/study-card-descendant-coverage/completion-queue.json'
			},
			currentAfterPartialAcceptedRecovery: {
				covered,
				uncovered,
				status: 'canonical'
			}
		},
		baseRecovery: {
			acceptedCards: baseRecovery.totals.cards,
			distinctTargetComponents: baseRecovery.totals.distinctTargetComponents,
			plannerEligibleTargetComponents: baseRecovery.totals.plannerEligibleTargetComponents
		},
		acceptedDescendantRecovery: {
			releases: descendantRecovery.totals.releases,
			acceptedCards: descendantRecovery.totals.cards,
			plannerEligibleTargetComponents: categories.acceptedDescendants.size
		},
		combinedPhysicsPartialAcceptedRecovery: {
			releaseId: PARTIAL_ACCEPTED_RELEASE_ID,
			artifactPath: `data/study-cards/releases/${PARTIAL_ACCEPTED_RELEASE_ID}/accepted-study-cards.json`,
			acceptedCards: 12,
			plannerEligibleTargetComponents: categories.combinedPhysicsPartialAccepted.size,
			rejectedTargetsRemainingQueued: 3,
			modelCalls: 0
		},
		modelCallsDuringReconciliation: 0
	};
}

function prepareStandardQueue() {
	const completion = readJson(completionQueuePath);
	if (
		completion.jobCount !== EXPECTED_LOGICAL_JOBS ||
		completion.targetCount !== EXPECTED_FROZEN_COMPLETION_TARGETS ||
		completion.uniqueTargetCount !== EXPECTED_FROZEN_COMPLETION_TARGETS ||
		completion.duplicateTargetCount !== 0 ||
		completion.maximumTargetsPerJob !== 20
	) {
		throw new Error('Frozen 23-job completion queue contract drifted.');
	}
	const currentPlanner = runJson(process.execPath, [
		'scripts/plan-study-card-descendant-coverage.mjs'
	]);
	const currentTargets = new Set(
		currentPlanner.plans.flatMap((plan) =>
			plan.uncoveredComponents.map((component) => component.id)
		)
	);
	const logicalTargets = completion.jobs.flatMap((job) => job.componentIds);
	const frozenTargetSet = new Set(logicalTargets);
	const acceptedPartialTargets = plannerEligibleTargets([PARTIAL_ACCEPTED_RELEASE_ID]);
	const acceptedPartialComponentIds = new Set(
		[...acceptedPartialTargets].map((key) => key.split('|').at(-1))
	);
	const logicalJobs = completion.jobs.map((job) => {
		const componentIds = job.componentIds.filter((id) => currentTargets.has(id));
		if (!componentIds.length) {
			throw new Error(`${job.completionBatchId} became empty after partial acceptance.`);
		}
		return { ...job, componentIds, componentCount: componentIds.length };
	});
	const currentLogicalTargets = logicalJobs.flatMap((job) => job.componentIds);
	const removedTargets = logicalTargets.filter((id) => !currentTargets.has(id));
	if (
		currentTargets.size !== EXPECTED_CURRENT_UNCOVERED ||
		logicalTargets.length !== EXPECTED_FROZEN_COMPLETION_TARGETS ||
		frozenTargetSet.size !== EXPECTED_FROZEN_COMPLETION_TARGETS ||
		currentLogicalTargets.length !== EXPECTED_CURRENT_UNCOVERED ||
		new Set(currentLogicalTargets).size !== EXPECTED_CURRENT_UNCOVERED ||
		currentLogicalTargets.some((id) => !currentTargets.has(id)) ||
		[...currentTargets].some((id) => !frozenTargetSet.has(id)) ||
		removedTargets.length !== EXPECTED_PARTIAL_ACCEPTED_COVERED ||
		new Set(removedTargets).size !== EXPECTED_PARTIAL_ACCEPTED_COVERED ||
		removedTargets.some((id) => !acceptedPartialComponentIds.has(id))
	) {
		throw new Error(
			'Post-partial logical queue no longer equals the current 438-target planner union.'
		);
	}

	const splitLogicalJobs = [];
	const physicalBatches = [];
	for (const [index, job] of logicalJobs.entries()) {
		const split = tierSplit(job);
		if (split.higherOnly.length && split.shared.length && includesFoundation(job)) {
			splitLogicalJobs.push({
				logicalJobId: job.completionBatchId,
				sharedTargetCount: split.shared.length,
				higherOnlyTargetCount: split.higherOnly.length,
				higherOnlyComponentIds: split.higherOnly
			});
			if (job.batchId === COMBINED_FAILED_BATCH) {
				const recovery = runJson(process.execPath, [
					'scripts/recover-reviewed-study-card-split.mjs'
				]);
				if (
					recovery.status !== 'ready_for_fresh_review_after_queue_terminal' ||
					recovery.zeroRegeneration !== true ||
					recovery.cohorts.length !== 2 ||
					recovery.cohorts.reduce((sum, cohort) => sum + cohort.expectedCardCount, 0) !==
						job.componentCount ||
					recovery.cohorts.reduce((sum, cohort) => sum + cohort.freshReviewDecisions, 0) !== 3
				) {
					throw new Error('Combined Physics zero-regeneration preflight drifted.');
				}
				for (const cohort of recovery.cohorts) {
					physicalBatches.push({
						logicalJobId: job.completionBatchId,
						physicalBatchId: cohort.releaseId,
						executionGroupId: `${job.completionBatchId}-archived-fresh-review-group`,
						executionGroupPhysicalBatchCount: recovery.cohorts.length,
						executionKind: 'archived-output-fresh-review-only',
						mode: cohort.mode,
						specificationId: cohort.specificationId,
						subject: cohort.subject,
						offeringIds: cohort.offeringIds,
						componentIds: cohort.requiredComponentIds,
						componentCount: cohort.expectedCardCount,
						preservedOriginalReviewAcceptances: cohort.preservedOriginalReviewAcceptances,
						freshReviewDecisions: cohort.freshReviewDecisions,
						command: [
							'node',
							'scripts/recover-reviewed-study-card-split.mjs',
							'--execute',
							'--prepared-lock=docs/release-evidence/study-card-prepared-completion/prepared-run-lock.json'
						],
						dryPlanStatus: 'passed'
					});
				}
				continue;
			}
			for (const [mode, componentIds] of [
				['shared', split.shared],
				['higher-only', split.higherOnly]
			]) {
				const offeringIds =
					mode === 'higher-only'
						? job.offeringIds.filter((id) => offeringTier(id) === 'Higher')
						: job.offeringIds;
				const batchId = tierSafeBatchId(job, index + 1, mode, componentIds);
				physicalBatches.push(
					dryValidateStandardBatch({
						logicalJobId: job.completionBatchId,
						physicalBatchId: batchId,
						executionKind: 'standard-generation-review',
						mode,
						specificationId: job.specificationId,
						subject: job.subject,
						offeringIds,
						componentIds,
						componentCount: componentIds.length
					})
				);
			}
			continue;
		}
		if (split.higherOnly.length && includesFoundation(job)) {
			throw new Error(`${job.completionBatchId} is entirely Higher-only but selects Foundation.`);
		}
		physicalBatches.push(
			dryValidateStandardBatch({
				logicalJobId: job.completionBatchId,
				physicalBatchId: job.completionBatchId,
				executionKind: 'standard-generation-review',
				mode: job.mode,
				specificationId: job.specificationId,
				subject: job.subject,
				offeringIds: job.offeringIds,
				componentIds: job.componentIds,
				componentCount: job.componentCount
			})
		);
	}

	const physicalTargets = physicalBatches.flatMap((batch) => batch.componentIds);
	const standardBatches = physicalBatches.filter(
		(batch) => batch.executionKind === 'standard-generation-review'
	);
	const recoveryBatches = physicalBatches.filter(
		(batch) => batch.executionKind === 'archived-output-fresh-review-only'
	);
	if (
		splitLogicalJobs.length !== 3 ||
		physicalBatches.length !== EXPECTED_PHYSICAL_BATCHES ||
		standardBatches.length !== EXPECTED_STANDARD_GENERATION_BATCHES ||
		recoveryBatches.length !== 2 ||
		physicalTargets.length !== EXPECTED_CURRENT_UNCOVERED ||
		new Set(physicalTargets).size !== EXPECTED_CURRENT_UNCOVERED ||
		physicalTargets.some((id) => !currentTargets.has(id)) ||
		physicalBatches.some((batch) => batch.componentCount > 20)
	) {
		throw new Error('Tier-safe 26-batch execution queue drifted.');
	}
	const physicalIds = physicalBatches.map((batch) => batch.physicalBatchId);
	if (new Set(physicalIds).size !== physicalIds.length) {
		throw new Error('Tier-safe physical batch ids are duplicated.');
	}
	const acceptedTargetKeys = acceptedArtifactTargetKeys();
	const physicalTargetKeys = physicalBatches.flatMap((batch) =>
		batch.componentIds.map(
			(componentId) => `${batch.specificationId}|${batch.subject}|${componentId}`
		)
	);
	const acceptedTargetOverlap = physicalTargetKeys.filter((key) => acceptedTargetKeys.has(key));
	if (acceptedTargetOverlap.length) {
		throw new Error(`Tier-safe queue overlaps accepted target ${acceptedTargetOverlap[0]}.`);
	}
	const rejectedCombinedJob = logicalJobs.find((job) => job.batchId === COMBINED_FAILED_BATCH);
	if (
		!rejectedCombinedJob ||
		stableStringify(rejectedCombinedJob.componentIds) !==
			stableStringify([
				'aqa-gcse-combined-science-trilogy-8464-v1.1:6-5-4-3',
				'aqa-gcse-combined-science-trilogy-8464-v1.1:6-5-5-1',
				'aqa-gcse-combined-science-trilogy-8464-v1.1:6-5-5-2'
			])
	) {
		throw new Error('The exact three rejected Combined Physics targets are not queued.');
	}
	const logicalQueue = {
		schemaVersion: 'study-card-post-partial-completion-queue-v1',
		status: 'ready-but-not-started',
		lineage: {
			frozenCompletionQueuePath: relative(completionQueuePath),
			frozenLogicalJobs: completion.jobs.length,
			frozenTargets: logicalTargets.length,
			partialAcceptedReleaseId: PARTIAL_ACCEPTED_RELEASE_ID,
			removedAcceptedTargets: removedTargets.length
		},
		jobCount: logicalJobs.length,
		targetCount: currentLogicalTargets.length,
		uniqueTargetCount: new Set(currentLogicalTargets).size,
		duplicateTargetCount: currentLogicalTargets.length - new Set(currentLogicalTargets).size,
		maximumTargetsPerJob: Math.max(...logicalJobs.map((job) => job.componentCount)),
		acceptedTargetOverlapCount: acceptedTargetOverlap.length,
		removedAcceptedComponentIds: removedTargets,
		rejectedCombinedPhysicsTargets: rejectedCombinedJob.componentIds,
		jobs: logicalJobs,
		modelCallsDuringPreparation: 0
	};
	const executionQueue = {
		schemaVersion: 'study-card-tier-safe-execution-queue-v1',
		status: 'ready-but-not-started',
		modelCallsDuringPreparation: 0,
		lineage: {
			completionQueuePath: relative(completionQueuePath),
			postPartialLogicalQueuePath: relative(prospectiveLogicalQueuePath),
			frozenLogicalJobCount: completion.jobs.length,
			frozenLogicalTargetCount: logicalTargets.length,
			currentLogicalJobCount: logicalJobs.length,
			currentLogicalTargetCount: currentLogicalTargets.length,
			acceptedTargetsRemovedBeforeExecution: removedTargets.length,
			standardGenerationPromptVersion: EXPECTED_STANDARD_PROMPT_VERSION
		},
		tierScope: {
			physicalBatchCount: physicalBatches.length,
			standardGenerationBatchCount: standardBatches.length,
			archivedOutputRecoveryCohortCount: recoveryBatches.length,
			splitLogicalJobCount: splitLogicalJobs.length,
			splitLogicalJobs,
			policy:
				'Inherited Higher-only targets are never sent with a Foundation offering. Three historical logical jobs therefore expand into six physical cohorts while preserving 23-job lineage. The execution union is 438 after removing 12 newly materialized accepted targets from the frozen 450-target snapshot.'
		},
		physicalBatches
	};
	const preflight = {
		schemaVersion: 'study-card-completion-queue-preflight-v1',
		status: 'passed-no-model-execution',
		coverageLedgerPath: relative(coverageLedgerPath),
		completionQueuePath: relative(completionQueuePath),
		postPartialLogicalQueuePath: relative(prospectiveLogicalQueuePath),
		executionQueuePath: relative(executionQueuePath),
		counts: {
			logicalJobs: logicalJobs.length,
			frozenTargets: logicalTargets.length,
			acceptedTargetsRemoved: removedTargets.length,
			physicalBatches: physicalBatches.length,
			standardGenerationBatches: standardBatches.length,
			archivedOutputRecoveryCohorts: recoveryBatches.length,
			splitLogicalJobs: splitLogicalJobs.length,
			targets: physicalTargets.length,
			uniqueTargets: new Set(physicalTargets).size,
			maximumTargetsPerPhysicalBatch: Math.max(
				...physicalBatches.map((batch) => batch.componentCount)
			),
			dryPlansPassed: physicalBatches.filter((batch) => batch.dryPlanStatus === 'passed').length
		},
		invariants: {
			currentPlannerTargetUnionMatched: true,
			logicalLineagePreserved: true,
			acceptedTargetOverlapCount: 0,
			rejectedCombinedPhysicsTargetsQueued: 3,
			inheritedTierScopeValidated: true,
			foundationHigherOnlyMixes: 0,
			threeOrFourChoiceContract: `${EXPECTED_STANDARD_PROMPT_VERSION}: enforced-by-generator-schema-independent-review-artifact-validator-and-import-preflight`,
			acceptedArtifactsRegenerated: 0,
			modelCalls: 0
		}
	};
	return { logicalQueue, executionQueue, preflight };
}

function prepareLiteratureQueue() {
	const manifest = readJson(literatureManifestPath);
	if (
		manifest.schemaVersion !== 'ocr-j352-literature-deepening-shards-v1' ||
		manifest.shards?.length !== EXPECTED_LITERATURE_SHARDS ||
		manifest.totalCards !== EXPECTED_LITERATURE_CARDS ||
		stableStringify(manifest.counts) !== stableStringify({ plot: 96, quotation: 72, method: 3 }) ||
		sha256(readFileSync(path.join(rootDir, manifest.masterSourcePlan))) !==
			manifest.masterSourcePlanHash
	) {
		throw new Error('English Literature 13-shard manifest drifted.');
	}
	const existingCards = acceptedArtifactIdentities();
	const existingLiteratureBundle = validateStudyCardBundle(
		readJson(path.join(rootDir, manifest.additiveContext.artifactPath))
	);
	if (
		existingLiteratureBundle.cards.length !== 67 ||
		hashStudyCardArtifact(existingLiteratureBundle) !== manifest.additiveContext.artifactHash
	) {
		throw new Error('English Literature additive accepted deck drifted from 67 cards.');
	}
	const plannedCardIds = [];
	const plannedConceptKeys = [];
	const jobs = [];
	for (const shard of manifest.shards) {
		const sourcePlanPath = path.join(rootDir, shard.sourcePlanPath);
		if (sha256(readFileSync(sourcePlanPath)) !== shard.sourcePlanHash) {
			throw new Error(`${shard.releaseId} source-plan hash drifted.`);
		}
		const sourcePlan = readJson(sourcePlanPath);
		const evidence = sourcePlan.topics.flatMap((topic) => topic.evidence);
		const activeTopicIds = new Set(
			sourcePlan.topics
				.filter((topic) => topic.evidence.length)
				.map((topic) => topic.topicComponentId)
		);
		const expectedExistingContextCards = existingLiteratureBundle.cards.filter((card) =>
			card.targets.some((target) => activeTopicIds.has(target.topicComponentId))
		).length;
		if (evidence.length !== shard.expectedCardCount || evidence.length > 20) {
			throw new Error(`${shard.releaseId} source-plan cardinality drifted.`);
		}
		for (const row of evidence) {
			plannedCardIds.push(`ocr-j352-card-${row.id}`);
			plannedConceptKeys.push(`ocr-j352-concept-${row.id}`);
		}
		const dryArgs = [
			'scripts/generate-english-literature-study-deck.mjs',
			`--source-plan=${shard.sourcePlanPath}`,
			`--release-id=${shard.releaseId}`,
			`--existing-artifact=${manifest.additiveContext.artifactPath}`
		];
		const dryPlan = runJson(process.execPath, dryArgs);
		if (
			dryPlan.releaseId !== shard.releaseId ||
			dryPlan.expectedCardCount !== shard.expectedCardCount ||
			dryPlan.existingAcceptedArtifactHash !== manifest.additiveContext.artifactHash ||
			dryPlan.existingAcceptedCardCount !== expectedExistingContextCards
		) {
			throw new Error(`${shard.releaseId} dry generator plan drifted.`);
		}
		jobs.push({
			index: shard.index,
			releaseId: shard.releaseId,
			sourcePlanPath: shard.sourcePlanPath,
			sourcePlanHash: shard.sourcePlanHash,
			titles: shard.titles,
			expectedCardCount: shard.expectedCardCount,
			existingAcceptedContextCardCount: expectedExistingContextCards,
			dryPlanStatus: 'passed',
			command: [
				'node',
				'scripts/generate-english-literature-study-deck.mjs',
				`--source-plan=${shard.sourcePlanPath}`,
				`--release-id=${shard.releaseId}`,
				`--source-hash-lock=${relative(literatureSourcePreflightPath)}`,
				`--existing-artifact=${manifest.additiveContext.artifactPath}`,
				'--source-timeout-ms=180000',
				'--generate',
				'--force'
			]
		});
	}
	if (
		jobs.reduce((sum, job) => sum + job.expectedCardCount, 0) !== EXPECTED_LITERATURE_CARDS ||
		new Set(plannedCardIds).size !== EXPECTED_LITERATURE_CARDS ||
		new Set(plannedConceptKeys).size !== EXPECTED_LITERATURE_CARDS ||
		plannedCardIds.some((id) => existingCards.cardIds.has(id)) ||
		plannedConceptKeys.some((id) => existingCards.conceptKeys.has(`OCR|English Literature|${id}`))
	) {
		throw new Error('English Literature planned identities collide or drift from 171.');
	}
	const sourcePreflight = validateLiteratureSourcePreflight();
	return {
		schemaVersion: 'ocr-j352-literature-deepening-queue-preflight-v1',
		status:
			sourcePreflight.status === 'passed'
				? 'passed-no-model-execution'
				: 'static-plan-passed-source-preflight-pending',
		manifestPath: relative(literatureManifestPath),
		manifestHash: sha256(readFileSync(literatureManifestPath)),
		masterSourcePlanHash: manifest.masterSourcePlanHash,
		additiveContext: manifest.additiveContext,
		rightsBoundary: manifest.rightsBoundary,
		counts: {
			shards: jobs.length,
			cards: jobs.reduce((sum, job) => sum + job.expectedCardCount, 0),
			...manifest.counts,
			maximumCardsPerShard: Math.max(...jobs.map((job) => job.expectedCardCount)),
			dryPlansPassed: jobs.filter((job) => job.dryPlanStatus === 'passed').length,
			plannedCardIdCollisions: 0,
			plannedConceptCollisions: 0
		},
		sourcePreflight,
		invariants: {
			additiveAcceptedDeckUnchanged: true,
			modernPrimaryTextQuotations: 'withheld',
			poetryCompleteness: 'withheld',
			threeOrFourChoiceContract:
				'enforced-by-generator-schema-independent-review-artifact-validator-and-import-preflight',
			modelCalls: 0
		},
		jobs
	};
}

function dryValidateStandardBatch(batch) {
	const command = standardCommand(batch);
	const dryArgs = command.slice(1).filter((argument) => argument !== '--generate');
	const plan = runJson(process.execPath, dryArgs);
	if (
		plan.batchId !== batch.physicalBatchId ||
		plan.specificationId !== batch.specificationId ||
		plan.subject !== batch.subject ||
		plan.expectedCardCount !== batch.componentCount ||
		plan.promptVersion !== EXPECTED_STANDARD_PROMPT_VERSION ||
		stableStringify(plan.offeringIds) !== stableStringify(batch.offeringIds) ||
		new Set(plan.requiredComponentIds).size !== batch.componentIds.length ||
		batch.componentIds.some((id) => !plan.requiredComponentIds.includes(id))
	) {
		throw new Error(`${batch.physicalBatchId} dry plan drifted.`);
	}
	return {
		...batch,
		command,
		dryPlanStatus: 'passed',
		dryPlan: {
			promptVersion: plan.promptVersion,
			expectedCardCount: plan.expectedCardCount,
			topicComponentIds: plan.topicComponentIds,
			sourcePdf: plan.sourcePdf,
			model: plan.model,
			thinkingLevel: plan.thinkingLevel
		}
	};
}

function standardCommand(batch) {
	return [
		'node',
		'scripts/generate-standard-study-card-batch.mjs',
		`--specification-id=${batch.specificationId}`,
		`--subject=${batch.subject}`,
		'--source-root=data/curricula/sources',
		`--batch-id=${batch.physicalBatchId}`,
		'--generate',
		...batch.offeringIds.map((id) => `--offering-id=${id}`),
		...batch.componentIds.map((id) => `--required-component-id=${id}`)
	];
}

function tierSafeBatchId(job, logicalIndex, mode, componentIds) {
	return slug(
		`${shortSpecification(job.specificationId)}-${job.subject}-${mode}-completion-${String(logicalIndex).padStart(2, '0')}-${sha256(componentIds.join('\n')).slice(0, 10)}-v1`
	);
}

function tierSplit(job) {
	const specification = catalog.specifications.find((entry) => entry.id === job.specificationId);
	const byId = new Map(specification.components.map((component) => [component.id, component]));
	const isHigherOnly = (id) => {
		let current = byId.get(id);
		const seen = new Set();
		while (current) {
			if (seen.has(current.id)) throw new Error(`Curriculum ancestry cycle at ${current.id}.`);
			seen.add(current.id);
			if (current.tier.length === 1 && current.tier[0] === 'Higher') return true;
			current = byId.get(current.parentId);
		}
		return false;
	};
	return {
		shared: job.componentIds.filter((id) => !isHigherOnly(id)),
		higherOnly: job.componentIds.filter(isHigherOnly)
	};
}

function includesFoundation(job) {
	return job.offeringIds.some((id) => offeringTier(id) === 'Foundation');
}

function offeringTier(offeringId) {
	const offering = catalog.offerings.find((entry) => entry.id === offeringId);
	if (!offering) throw new Error(`Unknown offering ${offeringId}.`);
	return offering.tier;
}

function plannerEligibleTargets(releaseIds) {
	const offeringById = new Map(catalog.offerings.map((offering) => [offering.id, offering]));
	const specificationById = new Map(
		catalog.specifications.map((specification) => [specification.id, specification])
	);
	const keys = new Set();
	for (const releaseId of releaseIds) {
		const artifactPath = path.join(
			rootDir,
			'data/study-cards/releases',
			releaseId,
			'accepted-study-cards.json'
		);
		const bundle = validateStudyCardBundle(readJson(artifactPath));
		assertStudyCardCurriculumScope(bundle, catalog);
		for (const card of bundle.cards) {
			for (const target of card.targets) {
				const offering = offeringById.get(target.offeringId);
				const specification = specificationById.get(offering.specificationId);
				const component = specification.components.find(
					(entry) => entry.id === target.curriculumComponentId
				);
				if (component?.kind === 'section' || component?.kind === 'topic') {
					keys.add(
						`${offering.specificationId}|${offering.profileSubject}|${target.curriculumComponentId}`
					);
				}
			}
		}
	}
	return keys;
}

function assertDisjoint(categories) {
	const names = Object.keys(categories);
	for (let left = 0; left < names.length; left += 1) {
		for (let right = left + 1; right < names.length; right += 1) {
			const overlap = [...categories[names[left]]].filter((key) =>
				categories[names[right]].has(key)
			);
			if (overlap.length) {
				throw new Error(`${names[left]} and ${names[right]} overlap at ${overlap[0]}.`);
			}
		}
	}
}

function acceptedArtifactIdentities() {
	const cardIds = new Set();
	const conceptKeys = new Set();
	const releasesDir = path.join(rootDir, 'data/study-cards/releases');
	for (const entry of readdirSync(releasesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const artifactPath = path.join(releasesDir, entry.name, 'accepted-study-cards.json');
		if (!existsSync(artifactPath)) continue;
		const bundle = validateStudyCardBundle(readJson(artifactPath));
		for (const card of bundle.cards) {
			cardIds.add(card.id);
			conceptKeys.add(`${card.board}|${card.subject}|${card.conceptKey}`);
		}
	}
	return { cardIds, conceptKeys };
}

function acceptedArtifactTargetKeys() {
	const keys = new Set();
	const offeringById = new Map(catalog.offerings.map((offering) => [offering.id, offering]));
	const releasesDir = path.join(rootDir, 'data/study-cards/releases');
	for (const entry of readdirSync(releasesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const artifactPath = path.join(releasesDir, entry.name, 'accepted-study-cards.json');
		if (!existsSync(artifactPath)) continue;
		const bundle = validateStudyCardBundle(readJson(artifactPath));
		assertStudyCardCurriculumScope(bundle, catalog);
		for (const card of bundle.cards) {
			for (const target of card.targets) {
				const offering = offeringById.get(target.offeringId);
				if (!offering) throw new Error(`Unknown offering ${target.offeringId}.`);
				keys.add(
					`${offering.specificationId}|${offering.profileSubject}|${target.curriculumComponentId}`
				);
			}
		}
	}
	return keys;
}

function validateLiteratureSourcePreflight() {
	if (!existsSync(literatureSourcePreflightPath)) {
		return {
			status: 'pending',
			path: relative(literatureSourcePreflightPath),
			command: 'node scripts/run-english-literature-deepening.mjs --preflight-only',
			modelCalls: 0
		};
	}
	const evidence = readJson(literatureSourcePreflightPath);
	if (
		evidence.status !== 'passed' ||
		evidence.masterSourcePlanHash !== readJson(literatureManifestPath).masterSourcePlanHash ||
		stableStringify(evidence.counts) !==
			stableStringify({ topics: 19, evidence: 171, sources: 25 }) ||
		evidence.exactAnchorAndExcerptValidation !== 'passed' ||
		evidence.failClosed !== true ||
		evidence.sources.some((source) => !/^[a-f0-9]{64}$/.test(source.sourceHash))
	) {
		throw new Error('English Literature source preflight evidence drifted.');
	}
	return {
		status: 'passed',
		path: relative(literatureSourcePreflightPath),
		evidenceHash: sha256(readFileSync(literatureSourcePreflightPath)),
		counts: evidence.counts,
		exactAnchorAndExcerptValidation: evidence.exactAnchorAndExcerptValidation,
		failClosed: evidence.failClosed,
		modelCalls: 0
	};
}

function annotateHistoricalEvidence(coverage) {
	const ledgerPath = relative(coverageLedgerPath);
	annotate('docs/release-evidence/study-card-descendant-coverage/queue-state.json', (value) => ({
		...value,
		status: 'superseded-missing-seven-recovered-base-artifacts',
		supersededBy: ledgerPath,
		reconciliation: coverage.canonical
	}));
	annotate('docs/release-evidence/study-card-descendant-coverage/before.json', (value) => ({
		...value,
		status: 'superseded-missing-seven-recovered-base-artifacts',
		supersededBy: ledgerPath,
		reconciliation: coverage.canonical
	}));
	annotate(
		'docs/release-evidence/study-card-descendant-coverage/recovered-before.json',
		(value) => ({
			...value,
			status: 'historically-valid-pre-descendant-queue-input',
			canonicalLedger: ledgerPath,
			reconciliation: {
				preDescendant: {
					eligible: EXPECTED_ELIGIBLE,
					covered: EXPECTED_PRE_DESCENDANT_COVERED,
					uncovered: EXPECTED_PRE_DESCENDANT_UNCOVERED
				},
				current: coverage.canonical
			}
		})
	);
	annotate(
		'docs/release-evidence/study-card-descendant-coverage/recovered-queue-state.json',
		(value) => ({
			...value,
			canonicalLedger: ledgerPath,
			reconciliation: {
				preDescendantUncovered: EXPECTED_PRE_DESCENDANT_UNCOVERED,
				acceptedDescendantCoverage: EXPECTED_ACCEPTED_DESCENDANT_COVERED,
				partialAcceptedCoverage: EXPECTED_PARTIAL_ACCEPTED_COVERED,
				currentCovered: EXPECTED_CURRENT_COVERED,
				currentUncovered: EXPECTED_CURRENT_UNCOVERED
			}
		})
	);
	annotate(
		'docs/release-evidence/study-card-descendant-coverage/completion-queue.json',
		(value) => ({
			...value,
			status: 'historical-frozen-lineage-superseded-for-execution',
			canonicalLedger: ledgerPath,
			postPartialLogicalQueue: relative(prospectiveLogicalQueuePath),
			tierSafeExecutionQueue: relative(executionQueuePath),
			reconciliation: {
				frozenSnapshot: {
					covered: EXPECTED_PRE_PARTIAL_COVERED,
					uncovered: EXPECTED_FROZEN_COMPLETION_TARGETS
				},
				partialAcceptedTargetsRemovedBeforeExecution: EXPECTED_PARTIAL_ACCEPTED_COVERED,
				canonical: coverage.canonical
			}
		})
	);
}

function annotate(relativePath, transform) {
	const filePath = path.join(rootDir, relativePath);
	if (!existsSync(filePath)) throw new Error(`Missing evidence to annotate: ${relativePath}.`);
	writeJson(filePath, transform(readJson(filePath)));
}

function shortSpecification(specificationId) {
	return specificationId
		.replace(/^aqa-gcse-/, 'aqa-')
		.replace(/^ocr-gcse-/, 'ocr-')
		.replace(/-v\d+(?:\.\d+)*(?:-\d+)?$/, '');
}

function slug(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function runJson(command, args) {
	return JSON.parse(
		execFileSync(command, args, {
			cwd: rootDir,
			encoding: 'utf8',
			maxBuffer: 128 * 1024 * 1024
		})
	);
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
