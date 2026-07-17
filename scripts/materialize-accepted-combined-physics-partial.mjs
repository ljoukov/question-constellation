#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Archived rollout JSON is validated fail closed before materialization.

import { createHash } from 'node:crypto';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import {
	PARTIAL_ACCEPTED_RELEASE_ID,
	SOURCE_BATCH_ID,
	buildReviewedSplitRecoveryPreflight,
	reviewedSplitRecoveryCollisions
} from './lib/reviewed-study-card-split-recovery.mjs';
import {
	hashStudyCardArtifact,
	stableStringify,
	validateStudyCardBundle
} from './lib/study-card-artifact.mjs';
import { assertStudyCardCurriculumScope } from './lib/study-card-import.mjs';

const rootDir = process.cwd();
const force = process.argv.includes('--force');
const sourceDir = path.join(rootDir, 'data/study-cards/rollout-recovery', SOURCE_BATCH_ID);
const outputDir = path.join(rootDir, 'data/study-cards/releases', PARTIAL_ACCEPTED_RELEASE_ID);
const artifactPath = path.join(outputDir, 'accepted-study-cards.json');
const catalog = readJson(path.join(rootDir, 'data/curricula/curriculum-catalog.json'));
const archiveEvidence = readJson(path.join(sourceDir, 'recovery-evidence.json'));

verifyArchive();
const input = {
	plan: readJson(path.join(sourceDir, 'plan.json')),
	candidates: readJson(path.join(sourceDir, 'candidate-cards.json')),
	reviews: readJson(path.join(sourceDir, 'review.json')),
	repairCandidates: readJson(
		path.join(sourceDir, 'reviewed-repair-generation-1-model-output.json')
	),
	sourceEvidence: readJson(path.join(sourceDir, 'source-evidence.json')),
	generationSummary: readJson(path.join(sourceDir, 'generation/codex-run-summary.json')),
	originalReviewSummary: readJson(path.join(sourceDir, 'review/codex-run-summary.json')),
	repairGenerationSummary: readJson(
		path.join(sourceDir, 'reviewed-repair-generation-1/codex-run-summary.json')
	),
	catalog
};
const preflight = buildReviewedSplitRecoveryPreflight(input);
const accepted = preflight.partialAccepted.validated;
if (
	accepted.validated.release.id !== PARTIAL_ACCEPTED_RELEASE_ID ||
	accepted.validated.cards.length !== 12 ||
	accepted.validated.cards.some((card) => archiveEvidence.rejectedCardIds.includes(card.id)) ||
	accepted.artifactHash !== hashStudyCardArtifact(accepted.validated)
) {
	throw new Error('Partial accepted release drifted from the exact 12/3 archived review split.');
}

const existingBundles = loadExistingBundles().filter(
	(bundle) => bundle.release.id !== PARTIAL_ACCEPTED_RELEASE_ID
);
const collisions = reviewedSplitRecoveryCollisions([accepted.validated], existingBundles);
if (collisions.length) {
	throw new Error(`Partial accepted release collision(s): ${collisions.join(', ')}`);
}

if (existsSync(artifactPath) && !force) {
	const existing = validateStudyCardBundle(readJson(artifactPath));
	assertStudyCardCurriculumScope(existing, catalog);
	if (stableStringify(existing) !== stableStringify(accepted.validated)) {
		throw new Error('Existing partial accepted artifact differs from deterministic recovery.');
	}
	emit('already_materialized');
	process.exit(0);
}

mkdirSync(outputDir, { recursive: true });
writeJson(artifactPath, accepted.bundle);
writeJson(path.join(outputDir, 'candidate-cards.json'), {
	cards: preflight.partialAccepted.cards
});
writeJson(path.join(outputDir, 'review.json'), {
	reviews: input.reviews.reviews.filter((review) => review.accepted)
});
writeJson(path.join(outputDir, 'coverage.json'), {
	coverage: accepted.bundle.coverage
});
writeJson(path.join(outputDir, 'source-evidence.json'), preflight.partialAccepted.sourceEvidence);
for (const [source, destination] of [
	['generation-prompt.txt', 'generation-prompt.txt'],
	['generation-model-output.json', 'generation-model-output.json'],
	['review-prompt.txt', 'review-prompt.txt'],
	['review-model-output.json', 'review-model-output.json'],
	['generation/codex-run-summary.json', 'generation-run.json'],
	['review/codex-run-summary.json', 'review-run.json']
]) {
	copyFileSync(path.join(sourceDir, source), path.join(outputDir, destination));
}

const readyCoverageRows = accepted.validated.coverage.filter((row) => row.status === 'ready');
const withheldCoverageRows = accepted.validated.coverage.filter((row) => row.status === 'withheld');
writeJson(path.join(outputDir, 'recovery-evidence.json'), {
	schemaVersion: 'combined-physics-partial-accepted-release-recovery-v1',
	status: 'accepted_partial_release_materialized',
	policy:
		'Only cards explicitly accepted by the archived independent reviewer are published. Rejected cards and unreviewed repair candidates remain excluded.',
	sourceBatchId: SOURCE_BATCH_ID,
	sourceArchive: relative(sourceDir),
	sourceArchiveEvidenceHash: sha256(readFileSync(path.join(sourceDir, 'recovery-evidence.json'))),
	exactCoreFileHashes: archiveEvidence.exactCoreFileHashes,
	reconstructedSummaryHashes: archiveEvidence.reconstructedSummaryHashes,
	releaseId: PARTIAL_ACCEPTED_RELEASE_ID,
	artifactPath: relative(artifactPath),
	artifactHash: accepted.artifactHash,
	lineage: {
		generatorRunId: accepted.validated.release.generator.runId,
		reviewerRunId: accepted.validated.release.reviewer.runId,
		independentReview: true
	},
	counts: {
		archivedCandidates: input.candidates.cards.length,
		archivedAccepted: accepted.validated.cards.length,
		archivedRejectedExcluded: archiveEvidence.rejectedCardIds.length,
		unreviewedRepairCandidatesExcluded: archiveEvidence.repairCandidateIds.length,
		readyCoverageRows: readyCoverageRows.length,
		withheldCoverageRows: withheldCoverageRows.length
	},
	acceptedCardIds: accepted.validated.cards.map((card) => card.id),
	acceptedCurriculumComponentIds: accepted.validated.cards.map(
		(card) => card.targets[0].curriculumComponentId
	),
	rejectedCardIds: archiveEvidence.rejectedCardIds,
	rejectedCurriculumComponents: [
		{
			cardId: archiveEvidence.rejectedCardIds[0],
			componentId: preflight.shared.cards[0].curriculumComponentId,
			status: 'uncovered-pending-fresh-review',
			coverageRepresentation:
				'Its parent topic has other accepted cards, so the topic-level artifact schema cannot express this descendant hole as a second withheld row.'
		},
		...preflight.higher.cards.map((card) => ({
			cardId: card.id,
			componentId: card.curriculumComponentId,
			status: 'uncovered-pending-fresh-review-under-corrected-higher-only-scope',
			coverageRepresentation:
				'The parent 6.5 topic has other accepted cards, so the topic-level artifact schema cannot express this descendant hole as a second withheld row.'
		}))
	],
	modelCallsDuringRecovery: 0
});

emit('materialized');

function verifyArchive() {
	if (
		archiveEvidence.status !== 'exact_core_files_reconstructed_from_jsonl' ||
		archiveEvidence.batchId !== SOURCE_BATCH_ID ||
		archiveEvidence.counts.acceptedByArchivedReviewer !== 12 ||
		archiveEvidence.counts.rejectedByArchivedReviewer !== 3
	) {
		throw new Error('Recovered archive evidence no longer proves the required 12/3 split.');
	}
	for (const [name, expectedHash] of Object.entries({
		...archiveEvidence.exactCoreFileHashes,
		...archiveEvidence.reconstructedSummaryHashes
	})) {
		const actualHash = sha256(readFileSync(path.join(sourceDir, name)));
		if (actualHash !== expectedHash) {
			throw new Error(`Recovered archive hash drifted for ${name}.`);
		}
	}
}

function loadExistingBundles() {
	const releasesDir = path.join(rootDir, 'data/study-cards/releases');
	return readdirSync(releasesDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== PARTIAL_ACCEPTED_RELEASE_ID)
		.map((entry) => path.join(releasesDir, entry.name, 'accepted-study-cards.json'))
		.filter(existsSync)
		.map((filePath) => validateStudyCardBundle(readJson(filePath)));
}

function emit(status) {
	console.log(
		JSON.stringify(
			{
				status,
				releaseId: PARTIAL_ACCEPTED_RELEASE_ID,
				artifactPath: relative(artifactPath),
				artifactHash: accepted.artifactHash,
				acceptedCards: accepted.validated.cards.length,
				rejectedCardsExcluded: archiveEvidence.rejectedCardIds.length,
				modelCalls: 0
			},
			null,
			2
		)
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
