#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Historical rollout JSONL is validated before it contributes accepted content.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
	expectedStudyCardArtifactRelativePath,
	hashStudyCardArtifact,
	stableStringify,
	validateStudyCardBundle
} from './lib/study-card-artifact.mjs';
import { assertStudyCardCurriculumScope } from './lib/study-card-import.mjs';
import { normalizeReviewedChoiceKeys } from './lib/standard-study-card-compiler.mjs';

const MODEL = 'gpt-5.6-sol';
const THINKING_LEVEL = 'max';
const HISTORICAL_PROMPT_VERSION = 'standard-study-card-compiler-v2';
const TARGETED_REPAIR_PROMPT_VERSION = 'standard-study-card-targeted-repair-v2';
const REVIEWED_REPAIR_PROMPT_VERSION = 'standard-study-card-reviewed-repair-v3';
const RECOVERY_SUFFIX = '-rollout-recovered-v1';
const EXPECTED_TOTAL_CARDS = 253;
const EXPECTED_DISTINCT_TARGET_COMPONENTS = 222;
const EXPECTED_PLANNER_ELIGIBLE_COMPONENTS = 221;
const EXPECTED_COVERAGE_ROWS = 114;
const EXPECTED_REMAINING_TARGETS = 450;
const EXPECTED_COMPLETION_JOBS = 23;

const lineages = [
	{
		historicalReleaseId: 'aqa-biology-8461-standard-v1',
		specificationId: 'aqa-gcse-biology-8461-v1.0',
		subject: 'Biology',
		generatorRunId: '019f6bcf-35e8-7c63-b8ba-e189fea5788d',
		reviewerRunId: '019f6bf1-00cd-77b1-8d56-7299e68d3874',
		deterministicRepairRunId: '019f6be5-19f0-74b2-9348-4aa52b65f826',
		reviewedRepairAttempts: [],
		expectedGeneratedCards: 28,
		expectedReviewCandidates: 27,
		expectedAcceptedCards: 26,
		expectedTopics: 7
	},
	{
		historicalReleaseId: 'aqa-history-8145-standard-v1',
		specificationId: 'aqa-gcse-history-8145-v1.3',
		subject: 'History',
		generatorRunId: '019f6bcf-37cf-78e2-9ea0-e534dac0309c',
		reviewerRunId: '019f6be5-ab67-76c2-9aa5-2e869bcfb19d',
		deterministicRepairRunId: '019f6be5-1bab-7860-8401-a10f480e917c',
		reviewedRepairAttempts: [
			{
				generatorRunId: '019f6bf3-dad1-7060-839e-2d726e78cc66',
				reviewerRunId: '019f6bf4-4e8a-7d63-bd42-ba33789591ff',
				expectedAccepted: false
			},
			{
				generatorRunId: '019f6bf8-0e11-7072-9045-5bbb7a4ebfff',
				reviewerRunId: '019f6bf8-6b42-7523-a89a-7a1b8ef7be66',
				expectedAccepted: false
			},
			{
				generatorRunId: '019f6bfb-0a55-7653-97dc-36cc4d3cd8f2',
				reviewerRunId: '019f6bfb-3f0d-7a81-a60d-3457c30fccd3',
				expectedAccepted: true
			}
		],
		expectedGeneratedCards: 80,
		expectedReviewCandidates: 80,
		expectedAcceptedCards: 73,
		expectedTopics: 16
	},
	{
		historicalReleaseId: 'aqa-chemistry-8462-standard-v1',
		specificationId: 'aqa-gcse-chemistry-8462-v1.1',
		subject: 'Chemistry',
		generatorRunId: '019f6c04-d1a1-7493-85bd-dbe904f31811',
		reviewerRunId: '019f6c10-902d-7dd2-a6f1-a86175d2f6d0',
		deterministicRepairRunId: null,
		reviewedRepairAttempts: [],
		expectedGeneratedCards: 40,
		expectedReviewCandidates: 40,
		expectedAcceptedCards: 37,
		expectedTopics: 10
	},
	{
		historicalReleaseId: 'aqa-physics-8463-standard-v1',
		specificationId: 'aqa-gcse-physics-8463-v1.1',
		subject: 'Physics',
		generatorRunId: '019f6c04-d167-7a00-9fe9-a8640c321f5a',
		reviewerRunId: '019f6c0c-170c-7ec2-8834-878572263196',
		deterministicRepairRunId: null,
		reviewedRepairAttempts: [],
		expectedGeneratedCards: 32,
		expectedReviewCandidates: 32,
		expectedAcceptedCards: 31,
		expectedTopics: 8
	},
	{
		historicalReleaseId: 'aqa-combined-biology-8464-standard-v1',
		specificationId: 'aqa-gcse-combined-science-trilogy-8464-v1.1',
		subject: 'Biology',
		generatorRunId: '019f6c11-b988-7933-b4f4-09c525d34e76',
		reviewerRunId: '019f6c1a-8864-7911-9e35-56d2f21c7e79',
		deterministicRepairRunId: null,
		reviewedRepairAttempts: [],
		expectedGeneratedCards: 28,
		expectedReviewCandidates: 27,
		expectedAcceptedCards: 25,
		expectedTopics: 7
	},
	{
		historicalReleaseId: 'aqa-combined-chemistry-8464-standard-v1',
		specificationId: 'aqa-gcse-combined-science-trilogy-8464-v1.1',
		subject: 'Chemistry',
		generatorRunId: '019f6c18-d2b3-70d1-bd85-198a97e2179e',
		reviewerRunId: '019f6c24-fc72-73e2-9745-10fbbbe6dfdb',
		deterministicRepairRunId: null,
		reviewedRepairAttempts: [],
		expectedGeneratedCards: 40,
		expectedReviewCandidates: 38,
		expectedAcceptedCards: 35,
		expectedTopics: 10
	},
	{
		historicalReleaseId: 'aqa-combined-physics-8464-standard-v1',
		specificationId: 'aqa-gcse-combined-science-trilogy-8464-v1.1',
		subject: 'Physics',
		generatorRunId: '019f6c21-cdcd-79f1-9d07-e4658280830e',
		reviewerRunId: '019f6c28-59f2-73b2-9167-d3c0a44d2f9f',
		deterministicRepairRunId: null,
		reviewedRepairAttempts: [
			{
				generatorRunId: '019f6c31-f7cc-7e22-ae0f-0544d1b140be',
				reviewerRunId: '019f6c32-422a-77e3-ae54-4a5d205c7bd1',
				expectedAccepted: true
			}
		],
		expectedGeneratedCards: 28,
		expectedReviewCandidates: 28,
		expectedAcceptedCards: 26,
		expectedTopics: 7
	}
];

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
const sessionRoot = path.resolve(
	args.sessionRoot ?? path.join(os.homedir(), '.codex/sessions/2026/07/16')
);
const catalog = readJson(path.join(rootDir, 'data/curricula/curriculum-catalog.json'));
const globalEvidencePath = path.join(
	rootDir,
	'docs/release-evidence/study-card-base-rollout-recovery.json'
);
const postRecoveryPlanPath = path.join(
	rootDir,
	'docs/release-evidence/study-card-descendant-coverage/post-base-recovery-uncovered.json'
);
const completionQueuePath = path.join(
	rootDir,
	'docs/release-evidence/study-card-descendant-coverage/completion-queue.json'
);
const quarantinePath = path.join(
	rootDir,
	'docs/release-evidence/study-card-descendant-coverage/quarantined-accidental-interrupted-attempts.json'
);

const results = lineages.map(recoverRelease);
const totals = summarizeResults(results);
assertExactTotals(totals);

const planner = JSON.parse(
	execFileSync(process.execPath, ['scripts/plan-study-card-descendant-coverage.mjs'], {
		cwd: rootDir,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	})
);
const completionQueue = readJson(completionQueuePath);
const plannerTargets = planner.plans.flatMap((plan) =>
	plan.uncoveredComponents.map((row) => row.id)
);
const completionTargets = completionQueue.jobs.flatMap((job) => job.componentIds);
assertExactTargetUnion(plannerTargets, completionTargets);

const quarantine = readJson(quarantinePath);
assertQuarantine(quarantine);
const normalizedPlanner = {
	schemaVersion: 'study-card-descendant-post-base-recovery-v1',
	status: 'frozen-recovery-no-model-execution',
	definition: planner.definition,
	targetCount: plannerTargets.length,
	uniqueTargetCount: new Set(plannerTargets).size,
	completionJobCount: completionQueue.jobCount,
	maximumTargetsPerJob: completionQueue.maximumTargetsPerJob,
	duplicateTargetCount: completionQueue.duplicateTargetCount,
	plans: planner.plans
};
writeJson(postRecoveryPlanPath, normalizedPlanner);

writeJson(globalEvidencePath, {
	schemaVersion: 'study-card-base-rollout-recovery-evidence-v1',
	status: 'accepted_base_transcripts_recovered',
	policy:
		'Only cards accepted by the recorded independent reviewer, plus independently accepted reviewed repairs, were materialized. Recovery made zero model calls.',
	identityPolicy:
		'Historical artifact wrappers were absent. Each durable artifact therefore uses an explicit rollout-recovered-v1 release id; the historical release id remains evidence and is never silently substituted.',
	accountingNote:
		'The seven releases contain 253 accepted cards and 222 distinct targeted curriculum component ids. Exactly 221 of those ids are section/topic descendants counted by the descendant planner; one accepted target is outside that planner kind filter. The earlier inferred 139 figure is not the recovered lineage cardinality.',
	sessionRoot,
	modelCallsDuringRecovery: 0,
	totals,
	postRecovery: {
		plannerTargetCount: plannerTargets.length,
		plannerUniqueTargetCount: new Set(plannerTargets).size,
		completionJobCount: completionQueue.jobCount,
		completionQueuePath: relative(completionQueuePath),
		postRecoveryPlanPath: relative(postRecoveryPlanPath),
		plannerAndCompletionTargetUnionMatch: true
	},
	accidentalAttempts: {
		quarantinePath: relative(quarantinePath),
		attemptCount: quarantine.attempts.length,
		acceptedArtifactCount: 0,
		disposition: 'quarantined-not-accepted'
	},
	releases: results
});

console.log(
	JSON.stringify(
		{
			status: 'recovered',
			evidencePath: relative(globalEvidencePath),
			totals,
			postRecovery: {
				plannerTargetCount: plannerTargets.length,
				completionJobCount: completionQueue.jobCount,
				targetUnionMatch: true
			}
		},
		null,
		2
	)
);

function recoverRelease(lineage) {
	const generator = loadSession(lineage.generatorRunId);
	const reviewer = loadSession(lineage.reviewerRunId);
	assertSessionLineage(generator, lineage.historicalReleaseId);
	assertSessionLineage(reviewer, lineage.historicalReleaseId);
	const rawCandidates = generator.output;
	const reviewCandidates = parseReviewCandidates(reviewer.prompt);
	const scope = parseGenerationScope(generator.prompt);
	if (scope.specification.id !== lineage.specificationId) {
		throw new Error(`${lineage.historicalReleaseId} specification identity drifted.`);
	}
	if (scope.topics.length !== lineage.expectedTopics) {
		throw new Error(`${lineage.historicalReleaseId} topic count drifted.`);
	}
	if (rawCandidates.cards?.length !== lineage.expectedGeneratedCards) {
		throw new Error(`${lineage.historicalReleaseId} generator cardinality drifted.`);
	}
	if (reviewCandidates.cards?.length !== lineage.expectedReviewCandidates) {
		throw new Error(`${lineage.historicalReleaseId} review candidate cardinality drifted.`);
	}
	assertReviewMatches(reviewer.output, reviewCandidates.cards, lineage.historicalReleaseId);

	const reviewById = new Map(reviewer.output.reviews.map((review) => [review.cardId, review]));
	const acceptedFromFullReview = reviewCandidates.cards.filter(
		(card) => reviewById.get(card.id)?.accepted === true
	);
	const deterministicRepair = lineage.deterministicRepairRunId
		? recoverDeterministicRepair(lineage, reviewCandidates.cards, reviewById, reviewer)
		: null;
	const reviewedRepairAttempts = lineage.reviewedRepairAttempts.map((attempt, index) =>
		recoverReviewedRepair(lineage, attempt, index + 1, reviewById)
	);
	const acceptedReviewedRepairs = reviewedRepairAttempts.filter((attempt) => attempt.accepted);
	const acceptedCards = [
		...acceptedFromFullReview,
		...acceptedReviewedRepairs.map((attempt) => attempt.card)
	];
	assertUnique(
		acceptedCards.map((card) => card.id),
		`${lineage.historicalReleaseId} accepted card`
	);
	if (acceptedCards.length !== lineage.expectedAcceptedCards) {
		throw new Error(
			`${lineage.historicalReleaseId} expected ${lineage.expectedAcceptedCards} accepted cards, recovered ${acceptedCards.length}.`
		);
	}

	const recoveredReleaseId = `${lineage.historicalReleaseId}${RECOVERY_SUFFIX}`;
	const artifactRelativePath = expectedStudyCardArtifactRelativePath(recoveredReleaseId);
	const releaseDir = path.join(rootDir, path.dirname(artifactRelativePath));
	if (existsSync(releaseDir)) {
		if (!args.force) throw new Error(`Recovery release already exists: ${relative(releaseDir)}.`);
		rmSync(releaseDir, { recursive: true, force: true });
	}
	mkdirSync(releaseDir, { recursive: true });

	const supplementalRuns = [];
	if (deterministicRepair?.acceptedCardIds.length) {
		supplementalRuns.push({
			purpose: 'targeted-card-repair',
			promptVersion: TARGETED_REPAIR_PROMPT_VERSION,
			cardIds: deterministicRepair.acceptedCardIds,
			generator: modelRun(deterministicRepair.session.runId),
			reviewer: reviewerRun(reviewer.runId),
			startedAt: deterministicRepair.session.startedAt,
			finishedAt: reviewer.completedAt
		});
	}
	for (const attempt of acceptedReviewedRepairs) {
		supplementalRuns.push({
			purpose: 'targeted-card-repair',
			promptVersion: REVIEWED_REPAIR_PROMPT_VERSION,
			cardIds: [attempt.card.id],
			generator: modelRun(attempt.generator.runId),
			reviewer: reviewerRun(attempt.reviewer.runId),
			startedAt: attempt.generator.startedAt,
			finishedAt: attempt.reviewer.completedAt
		});
	}
	const finishedAt = acceptedReviewedRepairs.at(-1)?.reviewer.completedAt ?? reviewer.completedAt;
	const coverage = buildCoverage(acceptedCards, scope.offerings, scope.topics);
	const release = {
		id: recoveredReleaseId,
		promptVersion: HISTORICAL_PROMPT_VERSION,
		generator: modelRun(generator.runId),
		reviewer: reviewerRun(reviewer.runId),
		...(supplementalRuns.length ? { supplementalRuns } : {}),
		startedAt: generator.startedAt,
		finishedAt,
		sourceManifestHash: sha256(stableStringify(scope)),
		artifactPath: artifactRelativePath
	};
	const bundle = {
		schemaVersion: 'standard-study-deck-v1',
		release,
		cards: acceptedCards.map((card) =>
			bindCard(card, {
				specification: scope.specification,
				offerings: scope.offerings,
				sourceTopics: scope.topics,
				subject: lineage.subject
			})
		),
		coverage
	};
	const validated = validateStudyCardBundle(bundle);
	assertStudyCardCurriculumScope(validated, catalog);
	const artifactHash = hashStudyCardArtifact(validated);

	const candidateById = new Map(reviewCandidates.cards.map((card) => [card.id, card]));
	const deterministicExclusions = rawCandidates.cards.flatMap((card) => {
		const candidate = candidateById.get(card.id);
		if (candidate && stableStringify(candidate) === stableStringify(card)) return [];
		return [
			{
				stage: candidate
					? 'deterministic-candidate-superseded'
					: 'deterministic-candidate-excluded',
				card,
				...(candidate ? { replacement: candidate } : {})
			}
		];
	});
	const reviewerRejected = reviewCandidates.cards.flatMap((card) => {
		const review = reviewById.get(card.id);
		return review?.accepted ? [] : [{ stage: 'independent-review', card, review }];
	});
	const rejectedReviewedRepairs = reviewedRepairAttempts.flatMap((attempt) =>
		attempt.accepted
			? []
			: [
					{
						stage: `reviewed-repair-review-${attempt.attempt}`,
						card: attempt.card,
						review: attempt.review
					}
				]
	);

	writeJson(path.join(releaseDir, 'accepted-study-cards.json'), bundle);
	writeJson(path.join(releaseDir, 'raw-candidate-cards.json'), rawCandidates);
	writeJson(path.join(releaseDir, 'candidate-cards.json'), reviewCandidates);
	writeJson(path.join(releaseDir, 'review.json'), reviewer.output);
	writeJson(path.join(releaseDir, 'coverage.json'), { coverage });
	writeJson(path.join(releaseDir, 'generation-model-output.json'), generator.output);
	writeJson(path.join(releaseDir, 'review-model-output.json'), reviewer.output);
	writeText(path.join(releaseDir, 'generation-prompt.txt'), generator.prompt);
	writeText(path.join(releaseDir, 'review-prompt.txt'), reviewer.prompt);
	writeJson(path.join(releaseDir, 'source-evidence.json'), {
		specification: scope.specification,
		offerings: scope.offerings,
		topics: scope.topics,
		sourceManifestHash: release.sourceManifestHash
	});
	writeJson(path.join(releaseDir, 'rejected-cards.json'), {
		cards: [...reviewerRejected, ...deterministicExclusions, ...rejectedReviewedRepairs]
	});
	if (deterministicRepair) {
		writeText(
			path.join(releaseDir, 'generation-repair-prompt.txt'),
			deterministicRepair.session.prompt
		);
		writeJson(
			path.join(releaseDir, 'generation-repair-model-output.json'),
			deterministicRepair.session.output
		);
	}
	for (const attempt of reviewedRepairAttempts) {
		writeText(
			path.join(releaseDir, `reviewed-repair-${attempt.attempt}-generation-prompt.txt`),
			attempt.generator.prompt
		);
		writeJson(
			path.join(releaseDir, `reviewed-repair-${attempt.attempt}-generation-model-output.json`),
			attempt.generator.output
		);
		writeText(
			path.join(releaseDir, `reviewed-repair-${attempt.attempt}-review-prompt.txt`),
			attempt.reviewer.prompt
		);
		writeJson(
			path.join(releaseDir, `reviewed-repair-${attempt.attempt}-review-model-output.json`),
			attempt.reviewer.output
		);
	}

	const acceptedComponentIds = new Set(acceptedCards.map((card) => card.curriculumComponentId));
	const specification = catalog.specifications.find(
		(entry) => entry.id === lineage.specificationId
	);
	if (!specification) throw new Error(`Missing catalog specification ${lineage.specificationId}.`);
	const plannerEligibleIds = new Set(
		specification.components
			.filter((component) => component.kind === 'section' || component.kind === 'topic')
			.map((component) => component.id)
	);
	const acceptedPlannerEligibleIds = [...acceptedComponentIds].filter((id) =>
		plannerEligibleIds.has(id)
	);
	const nonPlannerEligibleAcceptedIds = [...acceptedComponentIds].filter(
		(id) => !plannerEligibleIds.has(id)
	);
	const offeringCoverage = scope.offerings.map((offering) => {
		const rows = coverage.filter((row) => row.offeringId === offering.id);
		return {
			offeringId: offering.id,
			ready: rows.filter((row) => row.status === 'ready').length,
			withheld: rows.filter((row) => row.status === 'withheld').length,
			coverageRows: rows.length,
			cardCount: validated.cards.filter((card) =>
				card.targets.some((target) => target.offeringId === offering.id)
			).length
		};
	});
	const sessionRows = [
		generator,
		reviewer,
		...(deterministicRepair ? [deterministicRepair.session] : []),
		...reviewedRepairAttempts.flatMap((attempt) => [attempt.generator, attempt.reviewer])
	];
	const recoveryEvidence = {
		schemaVersion: 'study-card-base-rollout-jsonl-recovery-v1',
		status: 'accepted_transcript_recovered_under_new_identity',
		historicalReleaseId: lineage.historicalReleaseId,
		recoveredReleaseId,
		identityPolicy:
			'The explicit recovery id preserves reviewed content and provenance without claiming byte identity with the absent historical artifact wrapper.',
		generator: sessionEvidence(generator),
		reviewer: sessionEvidence(reviewer),
		...(deterministicRepair
			? {
					deterministicRepair: {
						...sessionEvidence(deterministicRepair.session),
						acceptedCardIds: deterministicRepair.acceptedCardIds,
						unacceptedCardIds: deterministicRepair.unacceptedCardIds
					}
				}
			: {}),
		reviewedRepairAttempts: reviewedRepairAttempts.map((attempt) => ({
			attempt: attempt.attempt,
			accepted: attempt.accepted,
			cardId: attempt.card.id,
			generator: sessionEvidence(attempt.generator),
			reviewer: sessionEvidence(attempt.reviewer)
		})),
		counts: {
			generated: rawCandidates.cards.length,
			reviewCandidates: reviewCandidates.cards.length,
			accepted: acceptedCards.length,
			distinctTargetComponents: acceptedComponentIds.size,
			plannerEligibleTargetComponents: acceptedPlannerEligibleIds.length,
			nonPlannerEligibleTargetComponents: nonPlannerEligibleAcceptedIds.length,
			coverageRows: coverage.length,
			readyCoverageRows: coverage.filter((row) => row.status === 'ready').length,
			withheldCoverageRows: coverage.filter((row) => row.status === 'withheld').length,
			sessions: sessionRows.length
		},
		nonPlannerEligibleAcceptedComponentIds: nonPlannerEligibleAcceptedIds,
		offeringCoverage,
		modelCallsDuringRecovery: 0,
		artifactHash
	};
	writeJson(path.join(releaseDir, 'recovery-evidence.json'), recoveryEvidence);
	writeJson(path.join(releaseDir, 'generation-run.json'), {
		status: 'accepted_rollout_recovery',
		plan: {
			historicalReleaseId: lineage.historicalReleaseId,
			recoveredReleaseId,
			specificationId: lineage.specificationId,
			subject: lineage.subject,
			offeringIds: scope.offerings.map((offering) => offering.id),
			topicComponentIds: scope.topics.map((topic) => topic.topicComponentId),
			countPerTopic: lineage.expectedGeneratedCards / lineage.expectedTopics,
			minimumAcceptedPerTopic: 3,
			model: MODEL,
			thinkingLevel: THINKING_LEVEL
		},
		counts: recoveryEvidence.counts,
		artifactPath: artifactRelativePath,
		artifactHash,
		modelCallsDuringRecovery: 0
	});

	const validator = JSON.parse(
		execFileSync(
			process.execPath,
			['scripts/import-study-cards.mjs', `--input=${artifactRelativePath}`, '--validate-only'],
			{ cwd: rootDir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
		)
	);
	if (validator.status !== 'valid' || validator.artifactHash !== artifactHash) {
		throw new Error(`${recoveredReleaseId} import validator did not reproduce its artifact hash.`);
	}

	return {
		historicalReleaseId: lineage.historicalReleaseId,
		releaseId: recoveredReleaseId,
		specificationId: lineage.specificationId,
		subject: lineage.subject,
		artifactPath: artifactRelativePath,
		artifactHash,
		cardCount: acceptedCards.length,
		distinctTargetComponentCount: acceptedComponentIds.size,
		plannerEligibleTargetComponentCount: acceptedPlannerEligibleIds.length,
		nonPlannerEligibleAcceptedComponentIds: nonPlannerEligibleAcceptedIds,
		coverageCount: coverage.length,
		readyCoverageCount: coverage.filter((row) => row.status === 'ready').length,
		withheldCoverageCount: coverage.filter((row) => row.status === 'withheld').length,
		offeringCoverage,
		deterministicRepairAcceptedCardCount: deterministicRepair?.acceptedCardIds.length ?? 0,
		reviewedRepairAttempts: reviewedRepairAttempts.length,
		acceptedReviewedRepairs: acceptedReviewedRepairs.length,
		sessionCount: sessionRows.length,
		generatorRunId: generator.runId,
		reviewerRunId: reviewer.runId,
		validator: {
			status: validator.status,
			artifactHash: validator.artifactHash,
			counts: validator.counts
		}
	};
}

function recoverDeterministicRepair(lineage, finalCandidates, reviewById, reviewer) {
	const session = loadSession(lineage.deterministicRepairRunId);
	assertSessionLineage(session, lineage.historicalReleaseId);
	if (!Array.isArray(session.output?.cards) || session.output.cards.length < 1) {
		throw new Error(`${lineage.historicalReleaseId} deterministic repair output is malformed.`);
	}
	const finalById = new Map(finalCandidates.map((card) => [card.id, card]));
	const acceptedCardIds = [];
	const unacceptedCardIds = [];
	for (const card of session.output.cards) {
		const finalCard = finalById.get(card.id);
		const incorporated = finalCard && stableStringify(finalCard) === stableStringify(card);
		if (incorporated && reviewById.get(card.id)?.accepted === true) {
			acceptedCardIds.push(card.id);
		} else {
			unacceptedCardIds.push(card.id);
		}
	}
	assertUnique(acceptedCardIds, `${lineage.historicalReleaseId} deterministic repair card`);
	return { session, acceptedCardIds, unacceptedCardIds, reviewerRunId: reviewer.runId };
}

function recoverReviewedRepair(lineage, attempt, index, initialReviewById) {
	const generator = loadSession(attempt.generatorRunId);
	const reviewer = loadSession(attempt.reviewerRunId);
	assertSessionLineage(generator, lineage.historicalReleaseId);
	assertSessionLineage(reviewer, lineage.historicalReleaseId);
	if (generator.output?.cards?.length !== 1 || reviewer.output?.reviews?.length !== 1) {
		throw new Error(`${lineage.historicalReleaseId} reviewed repair ${index} is malformed.`);
	}
	const card = generator.output.cards[0];
	const review = reviewer.output.reviews[0];
	if (review.cardId !== card.id || review.accepted !== attempt.expectedAccepted) {
		throw new Error(`${lineage.historicalReleaseId} reviewed repair ${index} status drifted.`);
	}
	if (attempt.expectedAccepted && initialReviewById.get(card.id)?.accepted !== false) {
		throw new Error(
			`${lineage.historicalReleaseId} accepted reviewed repair does not replace an initial rejection.`
		);
	}
	return {
		attempt: index,
		accepted: review.accepted,
		card,
		review,
		generator,
		reviewer
	};
}

function bindCard(card, { specification, offerings, sourceTopics, subject }) {
	const sourceTopic = sourceTopics.find(
		(topic) => topic.topicComponentId === card.topicComponentId
	);
	const sourceComponent = sourceTopic?.components.find(
		(component) => component.id === card.curriculumComponentId
	);
	if (!sourceTopic || !sourceComponent) throw new Error(`${card.id} source scope is absent.`);
	const applicableOfferings = offerings.filter((offering) =>
		offering.selectableComponentIds.includes(card.topicComponentId)
	);
	if (!applicableOfferings.length) throw new Error(`${card.id} has no applicable offering.`);
	const primary = applicableOfferings[0];
	const content = {
		...card,
		choices: normalizeReviewedChoiceKeys(card.choices),
		board: specification.board,
		qualification: specification.qualification,
		subject,
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
	delete content.topicComponentId;
	delete content.curriculumComponentId;
	delete content.sourceExcerpt;
	delete content.sourceLocator;
	return content;
}

function buildCoverage(cards, offerings, topics) {
	const coverage = offerings.flatMap((offering) =>
		topics
			.filter((topic) => offering.selectableComponentIds.includes(topic.topicComponentId))
			.map((topic) => {
				const cardCount = cards.filter(
					(card) => card.topicComponentId === topic.topicComponentId
				).length;
				return {
					offeringId: offering.id,
					topicComponentId: topic.topicComponentId,
					status: cardCount >= 3 ? 'ready' : 'withheld',
					cardCount,
					reason:
						cardCount >= 3
							? null
							: `Only ${cardCount} of 3 required cards passed independent review.`
				};
			})
	);
	const withheld = coverage.filter((row) => row.status === 'withheld');
	if (withheld.length) {
		throw new Error(`Recovered base rollout has ${withheld.length} withheld coverage rows.`);
	}
	return coverage;
}

function parseGenerationScope(prompt) {
	const marker = '\nDeterministic scope:\n';
	const index = prompt.lastIndexOf(marker);
	if (index < 0) throw new Error('Generation prompt lacks deterministic scope.');
	return JSON.parse(prompt.slice(index + marker.length));
}

function parseReviewCandidates(prompt) {
	const marker = '\nCandidates:\n';
	const index = prompt.lastIndexOf(marker);
	if (index < 0) throw new Error('Review prompt lacks exact candidates.');
	return JSON.parse(prompt.slice(index + marker.length));
}

function assertReviewMatches(output, cards, label) {
	if (!Array.isArray(output?.reviews) || output.reviews.length !== cards.length) {
		throw new Error(`${label} review did not return one decision per exact candidate.`);
	}
	for (const [index, card] of cards.entries()) {
		const review = output.reviews[index];
		if (review.cardId !== card.id || typeof review.accepted !== 'boolean') {
			throw new Error(`${label} reviewer identity mismatch at ${index}.`);
		}
	}
}

function loadSession(runId) {
	const fileName = readdirSync(sessionRoot).find((name) => name.endsWith(`-${runId}.jsonl`));
	if (!fileName) throw new Error(`Rollout JSONL is missing for ${runId}.`);
	const filePath = path.join(sessionRoot, fileName);
	const raw = readFileSync(filePath, 'utf8');
	const rows = raw
		.split('\n')
		.filter(Boolean)
		.map((line, index) => {
			try {
				return JSON.parse(line);
			} catch (error) {
				throw new Error(`${fileName}:${index + 1}: ${error.message}`, { cause: error });
			}
		});
	const meta = rows.find((row) => row.type === 'session_meta')?.payload;
	const complete = rows
		.filter((row) => row.type === 'event_msg' && row.payload?.type === 'task_complete')
		.at(-1);
	const user = rows
		.filter((row) => row.type === 'response_item' && row.payload?.role === 'user')
		.at(-1);
	if (!meta || !complete?.payload?.last_agent_message || !user) {
		throw new Error(`${fileName} lacks metadata, prompt or completed model output.`);
	}
	const prompt = user.payload.content.map((entry) => entry.text ?? '').join('\n');
	const outputText = complete.payload.last_agent_message;
	return {
		runId,
		fileName,
		filePath,
		fileHash: sha256(raw),
		cwd: meta.cwd,
		startedAt: meta.timestamp,
		completedAt: complete.timestamp,
		prompt,
		promptHash: sha256(prompt),
		outputText,
		outputHash: sha256(outputText),
		output: parseModelJson(outputText)
	};
}

function assertSessionLineage(session, historicalReleaseId) {
	if (!session.cwd.includes(`/study-card-generation/${historicalReleaseId}`)) {
		throw new Error(`${session.runId} does not belong to ${historicalReleaseId}.`);
	}
}

function sessionEvidence(session) {
	return {
		runId: session.runId,
		rolloutFileName: session.fileName,
		rolloutHash: session.fileHash,
		cwd: session.cwd,
		startedAt: session.startedAt,
		completedAt: session.completedAt,
		promptHash: session.promptHash,
		modelOutputHash: session.outputHash
	};
}

function summarizeResults(results) {
	const distinctTargetKeys = new Set();
	const plannerEligibleKeys = new Set();
	for (const result of results) {
		const artifact = validateStudyCardBundle(readJson(path.join(rootDir, result.artifactPath)));
		for (const card of artifact.cards) {
			for (const target of card.targets) {
				distinctTargetKeys.add(
					`${result.specificationId}|${result.subject}|${target.curriculumComponentId}`
				);
			}
		}
		const specification = catalog.specifications.find(
			(entry) => entry.id === result.specificationId
		);
		const eligibleIds = new Set(
			specification.components
				.filter((component) => component.kind === 'section' || component.kind === 'topic')
				.map((component) => component.id)
		);
		for (const card of artifact.cards) {
			for (const target of card.targets) {
				if (eligibleIds.has(target.curriculumComponentId)) {
					plannerEligibleKeys.add(
						`${result.specificationId}|${result.subject}|${target.curriculumComponentId}`
					);
				}
			}
		}
	}
	return {
		releases: results.length,
		cards: results.reduce((sum, result) => sum + result.cardCount, 0),
		distinctTargetComponents: distinctTargetKeys.size,
		plannerEligibleTargetComponents: plannerEligibleKeys.size,
		nonPlannerEligibleTargetComponents: distinctTargetKeys.size - plannerEligibleKeys.size,
		coverageRows: results.reduce((sum, result) => sum + result.coverageCount, 0),
		readyCoverageRows: results.reduce((sum, result) => sum + result.readyCoverageCount, 0),
		withheldCoverageRows: results.reduce((sum, result) => sum + result.withheldCoverageCount, 0),
		deterministicRepairAcceptedCards: results.reduce(
			(sum, result) => sum + result.deterministicRepairAcceptedCardCount,
			0
		),
		reviewedRepairAttempts: results.reduce((sum, result) => sum + result.reviewedRepairAttempts, 0),
		acceptedReviewedRepairs: results.reduce(
			(sum, result) => sum + result.acceptedReviewedRepairs,
			0
		),
		sessions: results.reduce((sum, result) => sum + result.sessionCount, 0),
		validatorsPassed: results.filter((result) => result.validator.status === 'valid').length
	};
}

function assertExactTotals(totals) {
	if (
		totals.releases !== 7 ||
		totals.cards !== EXPECTED_TOTAL_CARDS ||
		totals.distinctTargetComponents !== EXPECTED_DISTINCT_TARGET_COMPONENTS ||
		totals.plannerEligibleTargetComponents !== EXPECTED_PLANNER_ELIGIBLE_COMPONENTS ||
		totals.coverageRows !== EXPECTED_COVERAGE_ROWS ||
		totals.readyCoverageRows !== EXPECTED_COVERAGE_ROWS ||
		totals.withheldCoverageRows !== 0 ||
		totals.validatorsPassed !== 7
	) {
		throw new Error(`Recovered base totals drifted: ${JSON.stringify(totals)}.`);
	}
}

function assertExactTargetUnion(plannerTargets, completionTargets) {
	const plannerSet = new Set(plannerTargets);
	const completionSet = new Set(completionTargets);
	if (
		plannerTargets.length !== EXPECTED_REMAINING_TARGETS ||
		plannerSet.size !== EXPECTED_REMAINING_TARGETS ||
		completionTargets.length !== EXPECTED_REMAINING_TARGETS ||
		completionSet.size !== EXPECTED_REMAINING_TARGETS ||
		completionQueueJobCount() !== EXPECTED_COMPLETION_JOBS ||
		[...plannerSet].some((id) => !completionSet.has(id)) ||
		[...completionSet].some((id) => !plannerSet.has(id))
	) {
		throw new Error('Post-recovery planner and the 23-job completion queue do not match exactly.');
	}
}

function completionQueueJobCount() {
	return readJson(completionQueuePath).jobs.length;
}

function assertQuarantine(quarantine) {
	if (
		quarantine.status !== 'quarantined-not-accepted' ||
		quarantine.attempts?.length !== 2 ||
		quarantine.attempts.some(
			(attempt) =>
				attempt.candidateExists ||
				attempt.reviewExists ||
				attempt.acceptedArtifactExists ||
				attempt.disposition !== 'ignore-and-never-infer-acceptance'
		)
	) {
		throw new Error('Accidentally interrupted jobs are not safely quarantined.');
	}
}

function modelRun(runId) {
	return { model: MODEL, thinkingLevel: THINKING_LEVEL, runId };
}

function reviewerRun(runId) {
	return { ...modelRun(runId), independentTurn: true };
}

function parseModelJson(value) {
	const trimmed = String(value ?? '').trim();
	const unwrapped = trimmed.startsWith('```')
		? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
		: trimmed;
	return JSON.parse(unwrapped);
}

function parseArgs(argv) {
	const value = (name) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
	return {
		force: argv.includes('--force'),
		sessionRoot: value('session-root')
	};
}

function assertUnique(values, label) {
	if (new Set(values).size !== values.length)
		throw new Error(`${label} identities are duplicated.`);
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${value.replace(/\s+$/, '')}\n`);
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
