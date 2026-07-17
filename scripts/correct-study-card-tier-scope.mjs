#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- The exact correction validates unknown artifact JSON at runtime.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
	hashStudyCardArtifact,
	hashStudyCardContent,
	stableStringify,
	validateStudyCardBundle
} from './lib/study-card-artifact.mjs';
import { assertStudyCardCurriculumScope } from './lib/study-card-import.mjs';

const HISTORICAL_RELEASE_ID = 'aqa-physics-8463-physics-shared-descendants-04-4e998fe959-v1';
const RELEASE_ID = `${HISTORICAL_RELEASE_ID}-rollout-recovered-v1`;
const ORIGINAL_ARTIFACT_HASH = '5be13a4da939b08aa6836073ccb461c3b7f7b11f6c727aacd99f571596eb56b1';
const CORRECTED_ARTIFACT_HASH = '06f144955f700fadf6124a36c914e68837ab5a14aa6ec66ede3d050cd9d6a3b3';
const FOUNDATION_OFFERING_ID = 'aqa-gcse-physics-8463-v1.1:foundation';
const HIGHER_OFFERING_ID = 'aqa-gcse-physics-8463-v1.1:higher';
const HIGHER_ONLY_ANCESTOR_ID = 'aqa-gcse-physics-8463-v1.1:4-5-7';
const AFFECTED_CARD_IDS = Object.freeze([
	'aqa-8463-ba4007ba2c-aqa-physics-8463-4-5-7-3-force-causes-momentum-change',
	'aqa-8463-d6d0e2d29f-aqa-physics-8463-4-5-7-2-closed-system-momentum'
]);
const WITHHELD_REASON =
	'No card remains in this release after removing Foundation targets beneath the Higher-only Momentum section.';

const rootDir = process.cwd();
const releaseDir = path.join(rootDir, 'data/study-cards/releases', RELEASE_ID);
const artifactPath = path.join(releaseDir, 'accepted-study-cards.json');
const coveragePath = path.join(releaseDir, 'coverage.json');
const runPath = path.join(releaseDir, 'generation-run.json');
const catalogPath = path.join(rootDir, 'data/curricula/curriculum-catalog.json');
const evidenceDir = path.join(rootDir, 'docs/release-evidence/study-card-descendant-coverage');
const beforeEvidencePath = path.join(evidenceDir, `${RELEASE_ID}-scope-correction-before.json`);
const afterEvidencePath = path.join(evidenceDir, `${RELEASE_ID}-scope-correction-after.json`);

const catalog = readJson(catalogPath);
const artifact = readJson(artifactPath);
const validatedBefore = validateStudyCardBundle(artifact);
const beforeHash = hashStudyCardArtifact(validatedBefore);
const existingRun = readJson(runPath);
const recoveryEvidencePath = path.join(releaseDir, 'recovery-evidence.json');
const recoveryEvidence = readJson(recoveryEvidencePath);

if (beforeHash !== ORIGINAL_ARTIFACT_HASH) {
	if (
		beforeHash === CORRECTED_ARTIFACT_HASH &&
		existingRun?.artifactHash === beforeHash &&
		recoveryEvidence?.historicalBatchId === HISTORICAL_RELEASE_ID &&
		recoveryEvidence?.recoveredReleaseId === RELEASE_ID &&
		recoveryEvidence?.historicalArtifactHash === ORIGINAL_ARTIFACT_HASH &&
		recoveryEvidence?.scopeCorrectionApplied === true &&
		recoveryEvidence?.artifactHash === beforeHash
	) {
		assertStudyCardCurriculumScope(validatedBefore, catalog);
		for (const card of affectedSnapshot(validatedBefore)) {
			if (
				card.targets.length !== 1 ||
				card.targets[0].offeringId !== HIGHER_OFFERING_ID ||
				card.targets[0].isPrimary !== true
			) {
				throw new Error(`${card.id} lost its exact corrected Higher-only target.`);
			}
		}
		console.log(
			JSON.stringify(
				{
					status: 'already_corrected',
					releaseId: RELEASE_ID,
					artifactHash: beforeHash,
					evidence: relative(recoveryEvidencePath),
					historicalArtifactHash: ORIGINAL_ARTIFACT_HASH
				},
				null,
				2
			)
		);
		process.exit(0);
	}
	throw new Error(
		`Refusing scope correction: expected original artifact ${ORIGINAL_ARTIFACT_HASH}, found ${beforeHash}.`
	);
}
if (existingRun.artifactHash !== ORIGINAL_ARTIFACT_HASH) {
	throw new Error(
		'The generation-run artifact hash does not match the preserved original artifact.'
	);
}

const affectedBefore = affectedSnapshot(validatedBefore);
if (
	stableStringify(affectedBefore.map((entry) => entry.id)) !== stableStringify(AFFECTED_CARD_IDS)
) {
	throw new Error('The exact two expected Physics cards were not found.');
}
for (const card of affectedBefore) {
	const foundationTargets = card.targets.filter(
		(target) => target.offeringId === FOUNDATION_OFFERING_ID
	);
	const higherTargets = card.targets.filter((target) => target.offeringId === HIGHER_OFFERING_ID);
	if (foundationTargets.length !== 1 || higherTargets.length !== 1) {
		throw new Error(`${card.id} does not have the expected Foundation/Higher target pair.`);
	}
}

const appliedAt = new Date().toISOString();
const learnerHashesBefore = learnerHashes(validatedBefore);
const modelLineageBefore = stableStringify({
	release: validatedBefore.release,
	generatorSummary: readJson(path.join(releaseDir, 'generation-codex-run-summary.json')),
	reviewerSummary: readJson(path.join(releaseDir, 'review-codex-run-summary.json')),
	reviews: readJson(path.join(releaseDir, 'review.json'))
});

writeJson(beforeEvidencePath, {
	schemaVersion: 'study-card-scope-correction-evidence-v1',
	correctionId: `${RELEASE_ID}-foundation-higher-ancestry`,
	releaseId: RELEASE_ID,
	recordedAt: appliedAt,
	reason:
		'The two leaf components repeat Foundation/Higher tier metadata but inherit Higher-only scope from their Momentum parent section.',
	policy: {
		foundationOfferingId: FOUNDATION_OFFERING_ID,
		higherOnlyAncestorId: HIGHER_ONLY_ANCESTOR_ID,
		operation: 'remove-only-the-Foundation-target-and-promote-the-existing-Higher-target',
		cardsRegenerated: 0
	},
	originalArtifactHash: beforeHash,
	generationRunArtifactHash: existingRun.artifactHash,
	affectedCards: affectedBefore,
	affectedCoverage: affectedCoverage(validatedBefore),
	totals: targetTotals(validatedBefore)
});

for (const card of artifact.cards) {
	if (!AFFECTED_CARD_IDS.includes(card.id)) continue;
	card.targets = card.targets.filter((target) => target.offeringId !== FOUNDATION_OFFERING_ID);
	if (card.targets.length !== 1 || card.targets[0].offeringId !== HIGHER_OFFERING_ID) {
		throw new Error(`${card.id} did not retain exactly its reviewed Higher target.`);
	}
	card.targets[0].isPrimary = true;
}

for (const row of artifact.coverage) {
	const count = artifact.cards.filter((card) =>
		card.targets.some(
			(target) =>
				target.offeringId === row.offeringId && target.topicComponentId === row.topicComponentId
		)
	).length;
	row.cardCount = count;
	if (count === 0) {
		row.status = 'withheld';
		row.reason = WITHHELD_REASON;
	} else {
		row.status = 'ready';
		row.reason = null;
	}
}

const validatedAfter = validateStudyCardBundle(artifact);
assertStudyCardCurriculumScope(validatedAfter, catalog);
const correctedHash = hashStudyCardArtifact(validatedAfter);
const learnerHashesAfter = learnerHashes(validatedAfter);
if (stableStringify(learnerHashesAfter) !== stableStringify(learnerHashesBefore)) {
	throw new Error('Learner-facing card content changed during the target-only correction.');
}
const modelLineageAfter = stableStringify({
	release: validatedAfter.release,
	generatorSummary: readJson(path.join(releaseDir, 'generation-codex-run-summary.json')),
	reviewerSummary: readJson(path.join(releaseDir, 'review-codex-run-summary.json')),
	reviews: readJson(path.join(releaseDir, 'review.json'))
});
if (modelLineageAfter !== modelLineageBefore) {
	throw new Error('Generator or independent-review lineage changed during the correction.');
}

const affectedAfter = affectedSnapshot(validatedAfter);
const run = {
	...existingRun,
	counts: {
		...existingRun.counts,
		readyCoverageRows: validatedAfter.coverage.filter((row) => row.status === 'ready').length,
		withheldCoverageRows: validatedAfter.coverage.filter((row) => row.status === 'withheld').length
	},
	artifactHash: correctedHash,
	deterministicPostAcceptanceScopeCorrection: {
		kind: 'remove-foundation-targets-beneath-higher-only-ancestor',
		appliedAt,
		cardsRegenerated: 0,
		affectedCardIds: AFFECTED_CARD_IDS,
		removedOfferingId: FOUNDATION_OFFERING_ID,
		retainedOfferingId: HIGHER_OFFERING_ID,
		higherOnlyAncestorId: HIGHER_ONLY_ANCESTOR_ID,
		originalArtifactHash: beforeHash,
		correctedArtifactHash: correctedHash,
		beforeEvidencePath: relative(beforeEvidencePath),
		afterEvidencePath: relative(afterEvidencePath)
	}
};

writeJson(artifactPath, artifact);
writeJson(coveragePath, { coverage: artifact.coverage });
writeJson(runPath, run);
writeJson(afterEvidencePath, {
	schemaVersion: 'study-card-scope-correction-evidence-v1',
	correctionId: `${RELEASE_ID}-foundation-higher-ancestry`,
	releaseId: RELEASE_ID,
	recordedAt: appliedAt,
	operation:
		'Removed the Foundation target from exactly two cards and promoted each already-reviewed Higher target to primary.',
	originalArtifactHash: beforeHash,
	correctedArtifactHash: correctedHash,
	generationRunArtifactHash: run.artifactHash,
	affectedCards: affectedAfter,
	affectedCoverage: affectedCoverage(validatedAfter),
	totals: targetTotals(validatedAfter),
	invariants: {
		cardsRegenerated: 0,
		cardIdsUnchanged: true,
		cardCountUnchanged: true,
		learnerFacingContentUnchanged: true,
		sourcesUnchanged: true,
		generatorAndReviewerLineageUnchanged: true,
		removedFoundationTargets: 2,
		addedTargets: 0,
		reassignedPrimaryTargets: 2,
		curriculumScopeValidationPassed: true
	},
	reproduction: {
		command: 'node scripts/correct-study-card-tier-scope.mjs',
		expectedOriginalArtifactHash: ORIGINAL_ARTIFACT_HASH,
		catalogPath: relative(catalogPath),
		artifactPath: relative(artifactPath),
		beforeEvidencePath: relative(beforeEvidencePath)
	},
	queueEvidence:
		'queue-state.json remains the historical live-run record of the original accepted hash; this correction evidence and generation-run.json carry the corrected immutable import hash.'
});

console.log(
	JSON.stringify(
		{
			status: 'corrected',
			releaseId: RELEASE_ID,
			originalArtifactHash: beforeHash,
			correctedArtifactHash: correctedHash,
			affectedCardIds: AFFECTED_CARD_IDS,
			beforeEvidence: relative(beforeEvidencePath),
			afterEvidence: relative(afterEvidencePath)
		},
		null,
		2
	)
);

function affectedSnapshot(bundle) {
	return bundle.cards
		.filter((card) => AFFECTED_CARD_IDS.includes(card.id))
		.map((card) => ({
			id: card.id,
			conceptKey: card.conceptKey,
			learnerContentHash: learnerContentHash(card),
			contentHash: hashStudyCardContent(card),
			targets: card.targets.map((target) => ({
				offeringId: target.offeringId,
				curriculumComponentId: target.curriculumComponentId,
				topicComponentId: target.topicComponentId,
				isPrimary: target.isPrimary,
				confidence: target.confidence,
				reviewed: target.reviewed
			}))
		}))
		.sort((left, right) => left.id.localeCompare(right.id));
}

function affectedCoverage(bundle) {
	return bundle.coverage.filter(
		(row) =>
			row.topicComponentId === 'aqa-gcse-physics-8463-v1.1:4-5' &&
			[FOUNDATION_OFFERING_ID, HIGHER_OFFERING_ID].includes(row.offeringId)
	);
}

function targetTotals(bundle) {
	return {
		cards: bundle.cards.length,
		targets: bundle.cards.reduce((total, card) => total + card.targets.length, 0),
		readyCoverageRows: bundle.coverage.filter((row) => row.status === 'ready').length,
		withheldCoverageRows: bundle.coverage.filter((row) => row.status === 'withheld').length
	};
}

function learnerHashes(bundle) {
	return Object.fromEntries(
		bundle.cards
			.map((card) => [card.id, learnerContentHash(card)])
			.sort(([left], [right]) => left.localeCompare(right))
	);
}

function learnerContentHash(card) {
	return sha256(
		stableStringify({
			id: card.id,
			conceptKey: card.conceptKey,
			kind: card.kind,
			visualCue: card.visualCue,
			front: card.front,
			back: card.back,
			reverseFront: card.reverseFront,
			reverseBack: card.reverseBack,
			explanation: card.explanation,
			memoryTip: card.memoryTip,
			contentRevision: card.contentRevision,
			choices: card.choices.map((choice) => ({
				choiceKey: choice.choiceKey,
				text: choice.text,
				isCorrect: choice.isCorrect,
				feedback: choice.feedback,
				misconception: choice.misconception
			})),
			sources: card.sources.map((source) => ({
				sourceKind: source.sourceKind,
				sourceUrl: source.sourceUrl,
				sourceTitle: source.sourceTitle,
				sourceLocator: source.sourceLocator,
				sourceExcerpt: source.sourceExcerpt,
				sourceHash: source.sourceHash,
				rightsBasis: source.rightsBasis,
				supports: source.supports
			}))
		})
	);
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
