#!/usr/bin/env node

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

import {
	SCIENCE_CHALLENGE_BATCH_SCHEMA,
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	SCIENCE_CHALLENGE_RELEASE_SCHEMA,
	SCIENCE_QUESTION_ART_DELIVERY_SCHEMA,
	SCIENCE_QUESTION_ART_MANIFEST_SCHEMA,
	SCIENCE_QUESTION_ART_REVIEW_SCHEMA,
	canonicalHash,
	normalizeGeneratedChallengeBatch,
	scienceQuestionArtLocalPath,
	scienceQuestionArtPublicPath,
	scienceQuestionArtR2Key,
	sha256,
	stableStringify,
	validateChallengePlan,
	validateGeneratedChallenge,
	validateGeneratedChallengeCollection,
	validateIndependentArtReviewRow,
	validateQuestionArtDeliveryManifest,
	validateQuestionArtManifest,
	validateRelease
} from './lib/science-challenge-release.mjs';
import {
	buildPerceptualAudit,
	validatePerceptualAudit
} from './lib/science-question-art-perceptual.mjs';
import {
	buildScienceChallengeReviewRebaseSuccessorEmptyRecoveryBinding,
	requireArtReviewEvidence,
	requireContentVerificationEvidence
} from './lib/science-challenge-review-evidence.mjs';
import {
	buildScienceChallengeCurriculumRemapVerifierInputFromArtifacts,
	validateScienceChallengeContentReviewRow
} from './lib/science-challenge-curriculum-remap-review.mjs';
import { buildScienceChallengeDifficultyPlanAdjustmentVerifierInputFromArtifacts } from './lib/science-challenge-difficulty-plan-adjustment-review.mjs';
import { SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY } from './lib/science-challenge-curriculum-remap-durable.mjs';
import {
	discoverScienceChallengeEffectiveCohortManifest,
	SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SUCCESSOR_DISPOSITION,
	readScienceChallengeEffectiveCohort
} from './lib/science-challenge-effective-cohort.mjs';
import { validateScienceChallengeEffectiveReleaseGate } from './lib/science-challenge-effective-release-gate.mjs';
import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_DISPOSITION,
	SCIENCE_CHALLENGE_REVIEW_REBASE_VALIDATION_SCHEMA
} from './lib/science-challenge-review-rebase.mjs';
import { readScienceChallengeReviewRebaseEvidence } from './lib/science-challenge-review-rebase-evidence.mjs';
import {
	buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding,
	inspectScienceChallengeReviewRebaseInfrastructureRecovery,
	inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal,
	validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding
} from './lib/science-challenge-review-rebase-infra-recovery.mjs';
import { validateScienceChallengeGeneratedBatch } from './lib/science-challenge-batch-validation.mjs';
import {
	readScienceChallengeDescendantRemap,
	scienceChallengeDescendantRemapDirectory
} from './lib/science-challenge-descendant-remap-evidence.mjs';
import {
	readScienceChallengeDifficultyPlanAdjustment,
	scienceChallengeDifficultyPlanAdjustmentDirectory
} from './lib/science-challenge-difficulty-plan-adjustment-evidence.mjs';
import { validateScienceChallengeVerifierAllocation } from './lib/science-challenge-verifier-dispatch.mjs';
import { requireArtGenerationJobEvidence } from './lib/science-challenge-art-lineage.mjs';
import {
	buildScienceChallengeProvenanceArchive,
	scienceChallengeProvenanceBindings,
	validateScienceChallengeProvenanceArchive
} from './lib/science-challenge-provenance-archive.mjs';
import {
	isScienceChallengeDirectMultipartRunSummary,
	isScienceChallengeDirectSingleRunSummary,
	requireScienceChallengeModelRunPolicy
} from './lib/science-challenge-authoring-run-policy.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './lib/science-challenge-authoring-transport.mjs';
import { validateAcceptedScienceChallengeShortRecallArtifacts } from './lib/science-challenge-short-recall.mjs';
import {
	scienceChallengeAuthoringInputPath,
	validateScienceChallengeAuthoringAttemptEvidence,
	validateScienceChallengeAuthoringInputEvidence
} from './lib/science-challenge-authoring-attempt.mjs';
import { readScienceChallengeDirectMultipartEvidence } from './lib/science-challenge-authoring-parts.mjs';
import {
	reconstructScienceChallengeAuthoringAttemptPrompt,
	reconstructScienceChallengeMultipartAttemptParts
} from './lib/science-challenge-authoring-prompts.mjs';
import {
	scienceChallengeMultipartPlanSalvageDirectory,
	validateScienceChallengeMultipartPlanSalvageAcceptance
} from './lib/science-challenge-multipart-plan-salvage-evidence.mjs';
import {
	requireExclusiveScienceChallengeMultipartRecoveryLineage,
	scienceChallengeMultipartContinuationDirectory,
	validateScienceChallengeMultipartContinuationAcceptance
} from './lib/science-challenge-multipart-continuation.mjs';
import {
	classifyScienceChallengeReviewRebaseMaterializationSource,
	relativeMultipartContinuationLineage,
	relativeMultipartPlanSalvageLineage,
	scienceChallengeReviewRebaseInfrastructureRecoveryProposalLineage,
	workspaceRelativeMaterializationPath
} from './lib/science-challenge-materialization-lineage.mjs';
import {
	buildVerificationRepairExecutionLedgerSnapshot,
	discoverVerificationRepairRecoveryBinding,
	discoverVerificationRepairRecoveryManifest,
	inspectVerificationRepairGenerationEvidence,
	requireMatchingVerificationRepairExecutionIdentity,
	requireVerificationRepairRecoveryArchivePair,
	scienceChallengeVerificationRepairExecutionIdentity,
	validateVerificationRepairRecoveryManifest,
	verificationRepairExecutionLedgerRoot
} from './lib/science-challenge-verification-repair-lineage.mjs';

const rootDir = process.cwd();
const STRUCTURED_OR_SDK_THINKING_LEVEL = 'max';
const PROMPT_JSON_THINKING_LEVEL = 'high';
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
if (args.mode === 'candidate' && existsSync(path.resolve(rootDir, args.candidateOutput))) {
	throw new Error(
		`Candidate materialization output already exists; use a fresh absent directory: ${args.candidateOutput}`
	);
}

const plan = readJson(args.plan);
const sourceSnapshot = readJson(args.source);
const curriculumEvidence = readJson(args.evidence);
if (typeof plan.curriculumCatalogPath !== 'string' || !plan.curriculumCatalogPath.trim()) {
	throw new Error('Plan does not bind a curriculumCatalogPath.');
}
const curriculumCatalog = readJson(plan.curriculumCatalogPath);
if (canonicalHash(curriculumCatalog) !== plan.curriculumCatalogSha256) {
	throw new Error('Plan-bound curriculum catalog bytes differ from curriculumCatalogSha256.');
}
const planValidation = validateChallengePlan(plan, {
	sourceSnapshot,
	curriculumEvidence,
	curriculumCatalog
});
if (planValidation.status !== 'passed') {
	throw new Error(`Plan validation failed:\n${planValidation.issues.join('\n')}`);
}
const generationRoot = path.resolve(rootDir, args.generationRoot);
const terminalEffectiveCohortManifestPath =
	discoverScienceChallengeEffectiveCohortManifest(generationRoot);
const repairGenerationEvidence = inspectVerificationRepairGenerationEvidence({
	generationRoot,
	terminalEffectiveCohortManifestPath
});
const repairExecutionLedgerRoot = repairGenerationEvidence.required
	? verificationRepairExecutionLedgerRoot(rootDir, repairGenerationEvidence.objectiveId)
	: null;
const repairRecoveryManifestPath = repairExecutionLedgerRoot
	? discoverVerificationRepairRecoveryManifest({ ledgerRoot: repairExecutionLedgerRoot })
	: null;
const repairRecoveryBinding = repairExecutionLedgerRoot
	? discoverVerificationRepairRecoveryBinding({
			ledgerRoot: repairExecutionLedgerRoot,
			generationRoot
		})
	: null;
const repairRecoveryManifest = repairRecoveryManifestPath
	? readJson(repairRecoveryManifestPath)
	: null;
requireVerificationRepairRecoveryArchivePair({
	bindingRecord: repairRecoveryBinding,
	manifest: repairRecoveryManifest,
	manifestPath: repairRecoveryManifestPath,
	recoveryRequired: Boolean(repairRecoveryBinding || repairRecoveryManifestPath)
});
if (repairRecoveryBinding) {
	requireMatchingVerificationRepairExecutionIdentity({
		expected: repairRecoveryBinding.identity,
		actual: repairGenerationEvidence.identity,
		label: 'Generation verification-repair execution identity'
	});
}
if (repairRecoveryManifest) {
	const recoveryValidation = validateVerificationRepairRecoveryManifest({
		manifest: repairRecoveryManifest,
		manifestPath: repairRecoveryManifestPath,
		planPath: path.resolve(rootDir, args.plan),
		generationRoot: path.resolve(rootDir, args.generationRoot)
	});
	if (recoveryValidation.status !== 'passed') {
		throw new Error(
			`Verification-repair recovery validation failed:\n${recoveryValidation.issues.join('\n')}`
		);
	}
}
const repairExecutionLedgerSnapshot = repairRecoveryBinding
	? buildVerificationRepairExecutionLedgerSnapshot({
			ledgerRoot: repairRecoveryBinding.ledgerRoot,
			identity: repairRecoveryBinding.identity,
			outputRoot: generationRoot
		})
	: null;
const sourceById = new Map(
	sourceSnapshot.questions.map((question) => [
		question.id,
		{ ...question, contentSha256: question.contentSha256 ?? canonicalHash(question) }
	])
);
const curriculumById = new Map(
	curriculumEvidence.components.map((component) => [component.componentId, component])
);
const existingCatalog = await loadExistingCatalog();
if (existingCatalog.length !== 92)
	throw new Error(`Expected 92 existing rounds; found ${existingCatalog.length}.`);
const terminalEffectiveCohortManifest = terminalEffectiveCohortManifestPath
	? readJson(terminalEffectiveCohortManifestPath)
	: null;
let reviewRebaseInfrastructureRecoveryEvidence = null;
let reviewRebaseInfrastructureRecoveryTerminal = null;
let autoResolvedReviewRebaseManifest = null;
if (terminalEffectiveCohortManifest?.infrastructureRecovery !== undefined) {
	validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(
		terminalEffectiveCohortManifest.infrastructureRecovery
	);
	const recoveryManifestPath = resolveRepositoryRelativePath(
		terminalEffectiveCohortManifest.infrastructureRecovery.manifestPath,
		'infrastructure-recovery manifest'
	);
	const recoveryManifest = readJson(recoveryManifestPath);
	if (
		canonicalHash(recoveryManifest) !==
		terminalEffectiveCohortManifest.infrastructureRecovery.manifestSha256
	) {
		throw new Error(
			'Effective-cohort infrastructure-recovery manifest differs from its repo-relative binding.'
		);
	}
	autoResolvedReviewRebaseManifest = recoveryManifest.reviewRebase?.manifestPath ?? null;
	if (!autoResolvedReviewRebaseManifest) {
		throw new Error(
			'Infrastructure-recovery manifest does not bind its B0 review-rebase manifest.'
		);
	}
	reviewRebaseInfrastructureRecoveryEvidence =
		inspectScienceChallengeReviewRebaseInfrastructureRecovery({
			workspaceRoot: rootDir,
			reviewRebaseManifestPath: autoResolvedReviewRebaseManifest,
			verificationSummaryPath: recoveryManifest.verification?.summaryPath,
			failedRoot: recoveryManifest.failedRoot?.path,
			successorRoot: recoveryManifest.successor?.path,
			existingDefinitions: existingCatalog
		});
	reviewRebaseInfrastructureRecoveryTerminal =
		inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal({
			evidence: reviewRebaseInfrastructureRecoveryEvidence,
			referenceRoot: rootDir
		});
	if (reviewRebaseInfrastructureRecoveryTerminal.status !== 'passed') {
		throw new Error(
			`Infrastructure-recovery terminal replay failed:\n${(
				reviewRebaseInfrastructureRecoveryTerminal.issues ?? []
			).join('\n')}`
		);
	}
	const expectedRecoveryBinding = buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding({
		evidence: reviewRebaseInfrastructureRecoveryTerminal,
		referenceRoot: rootDir
	});
	if (
		canonicalHash(expectedRecoveryBinding) !==
		canonicalHash(terminalEffectiveCohortManifest.infrastructureRecovery)
	) {
		throw new Error(
			'Effective-cohort infrastructure-recovery binding differs from terminal replay.'
		);
	}
}
if (
	args.reviewRebaseManifest &&
	autoResolvedReviewRebaseManifest &&
	path.resolve(rootDir, args.reviewRebaseManifest) !==
		path.resolve(rootDir, autoResolvedReviewRebaseManifest)
) {
	throw new Error('Explicit review-rebase manifest differs from infrastructure-recovery ancestry.');
}
const resolvedReviewRebaseManifest = args.reviewRebaseManifest ?? autoResolvedReviewRebaseManifest;
const reviewRebaseEvidence = resolvedReviewRebaseManifest
	? readScienceChallengeReviewRebaseEvidence({
			repositoryRoot: rootDir,
			manifestPath: resolvedReviewRebaseManifest,
			existingDefinitions: existingCatalog
		})
	: null;
if (reviewRebaseEvidence?.status === 'failed') {
	throw new Error(`Review-rebase replay failed:\n${reviewRebaseEvidence.issues.join('\n')}`);
}
if (
	reviewRebaseEvidence &&
	(canonicalHash(reviewRebaseEvidence.plan) !== canonicalHash(plan) ||
		reviewRebaseEvidence.coreManifest.sourceSnapshotSha256 !== canonicalHash(sourceSnapshot) ||
		reviewRebaseEvidence.coreManifest.curriculumEvidenceSha256 !==
			canonicalHash(curriculumEvidence))
) {
	throw new Error('Review-rebase replay differs from the materializer plan, source or curriculum.');
}
const effectiveCohort = terminalEffectiveCohortManifestPath
	? readScienceChallengeEffectiveCohort({
			manifestPath: terminalEffectiveCohortManifestPath,
			referenceRoot: generationRoot,
			basePlan: plan,
			expectedRepairSha256: repairGenerationEvidence.identity?.verificationSha256,
			expectedObjectiveId: repairGenerationEvidence.identity?.objectiveId,
			expectedExecutionId: repairGenerationEvidence.identity?.executionId,
			expectedFirstReviewSha256: repairGenerationEvidence.identity?.verificationSha256,
			expectedSourceSnapshotSha256: canonicalHash(sourceSnapshot),
			expectedCurriculumEvidenceSha256: canonicalHash(curriculumEvidence),
			expectedCurriculumCatalogSha256: canonicalHash(curriculumCatalog),
			reviewRebaseEvidence,
			reviewRebaseInfrastructureRecoveryEvidence
		})
	: null;
if (effectiveCohort && effectiveCohort.status !== 'passed') {
	throw new Error(`Effective-cohort replay failed:\n${effectiveCohort.issues.join('\n')}`);
}
const effectiveReviewRebaseEvidence = effectiveCohort?.reviewRebaseEvidence ?? null;
if (
	effectiveReviewRebaseEvidence &&
	(!reviewRebaseEvidence ||
		canonicalHash(effectiveReviewRebaseEvidence.manifest) !==
			canonicalHash(reviewRebaseEvidence.manifest))
) {
	throw new Error(
		'Effective-cohort review-rebase ancestry differs from the explicitly replayed parent.'
	);
}
if (reviewRebaseEvidence && effectiveCohort && !effectiveReviewRebaseEvidence) {
	throw new Error(
		'The supplied review-rebase parent is not authenticated by the effective cohort.'
	);
}
const descendantRemapDirectories = plan.rows
	.map((row) => row.shard)
	.filter((shardId, index, values) => values.indexOf(shardId) === index)
	.flatMap((shardId) =>
		listDescendantRemapDirectories(path.resolve(rootDir, args.generationRoot, 'shards', shardId))
	);
const difficultyAdjustmentDirectories = plan.rows
	.map((row) => row.shard)
	.filter((shardId, index, values) => values.indexOf(shardId) === index)
	.flatMap((shardId) =>
		listDifficultyPlanAdjustmentDirectories(
			path.resolve(rootDir, args.generationRoot, 'shards', shardId)
		)
	);
if (descendantRemapDirectories.length > 1) {
	throw new Error(
		'This release contains multiple independently projected descendant remaps; a single exact effective-plan projection is required.'
	);
}
const recoveryShardIds = [...descendantRemapDirectories, ...difficultyAdjustmentDirectories].map(
	(directory) => path.basename(path.dirname(directory))
);
if (new Set(recoveryShardIds).size !== recoveryShardIds.length) {
	throw new Error(
		'A shard cannot contain competing descendant-remap and difficulty-adjustment lineage.'
	);
}
const recoveryDirectoryCount =
	descendantRemapDirectories.length + difficultyAdjustmentDirectories.length;
if (
	(recoveryDirectoryCount > 0 && !effectiveCohort) ||
	(effectiveCohort && recoveryDirectoryCount === 0 && !effectiveReviewRebaseEvidence) ||
	(effectiveCohort &&
		(effectiveCohort.manifest.remapCount !== descendantRemapDirectories.length ||
			effectiveCohort.manifest.difficultyAdjustmentManifestCount !==
				difficultyAdjustmentDirectories.length))
) {
	throw new Error(
		'The effective cohort must bind either its exact typed recoveries or authenticated review-rebase ancestry.'
	);
}
const descendantRemapRecoveries = descendantRemapDirectories.map((directory) =>
	readDescendantRemapForMaterialization(directory)
);
const difficultyAdjustmentRecoveries = difficultyAdjustmentDirectories.map((directory) =>
	readDifficultyPlanAdjustmentForMaterialization(directory)
);
const replayedRecoveryByManifestSha256 = new Map(
	[...descendantRemapRecoveries, ...difficultyAdjustmentRecoveries].map((recovery) => [
		canonicalHash(recovery.manifest),
		{
			manifest: recovery.manifest,
			priorCandidate: recovery.priorCandidate,
			candidate: recovery.candidate
		}
	])
);
const combinedRecoveries =
	effectiveCohort?.recoveries.map((recovery, index) => {
		const replayed = replayedRecoveryByManifestSha256.get(canonicalHash(recovery.manifest));
		if (!replayed) {
			throw new Error(`Effective-cohort recovery ${index + 1} has no replayed source artifact.`);
		}
		return replayed;
	}) ?? [];
if (
	effectiveCohort &&
	(combinedRecoveries.length !== recoveryDirectoryCount ||
		replayedRecoveryByManifestSha256.size !== recoveryDirectoryCount ||
		canonicalHash(combinedRecoveries) !== canonicalHash(effectiveCohort.recoveries) ||
		effectiveCohort.manifest.recoverySetSha256 !== canonicalHash(combinedRecoveries) ||
		canonicalHash(descendantRemapRecoveries.map((recovery) => recovery.manifest)) !==
			canonicalHash(effectiveCohort.remapManifests) ||
		canonicalHash(difficultyAdjustmentRecoveries.map((recovery) => recovery.manifest)) !==
			canonicalHash(effectiveCohort.difficultyAdjustmentManifests))
) {
	throw new Error('Replayed recovery artifacts differ from the effective cohort recovery set.');
}
const recoverySetSha256 = effectiveCohort?.manifest.recoverySetSha256 ?? null;
const descendantRemapByShard = new Map(
	descendantRemapRecoveries.map((recovery) => [recovery.manifest.shardId, recovery])
);
const difficultyAdjustmentByShard = new Map(
	difficultyAdjustmentRecoveries.map((recovery) => [recovery.manifest.shardId, recovery])
);
const effectivePlan = effectiveCohort?.effectivePlan ?? plan;
const curriculumRemapVerifierInput =
	descendantRemapRecoveries.length > 0
		? buildScienceChallengeCurriculumRemapVerifierInputFromArtifacts({
				basePlan: plan,
				effectivePlan,
				recoveries: descendantRemapRecoveries,
				curriculumEvidence,
				curriculumCatalog,
				firstReviewSummary: descendantRemapRecoveries[0].firstReviewSummary,
				effectiveCohortManifest: effectiveCohort.manifest,
				effectiveCohortManifestSha256: canonicalHash(effectiveCohort.manifest),
				combinedRecoveries,
				recoverySetSha256
			})
		: null;
const difficultyPlanAdjustmentVerifierInput =
	difficultyAdjustmentRecoveries.length > 0
		? buildScienceChallengeDifficultyPlanAdjustmentVerifierInputFromArtifacts({
				basePlan: plan,
				effectivePlan,
				effectiveCohortManifest: effectiveCohort.manifest,
				effectiveCohortManifestSha256: canonicalHash(effectiveCohort.manifest),
				recoveries: difficultyAdjustmentRecoveries,
				combinedRecoveries,
				recoverySetSha256
			})
		: null;
if (
	curriculumRemapVerifierInput &&
	difficultyPlanAdjustmentVerifierInput &&
	(curriculumRemapVerifierInput.recoverySetSha256 !==
		difficultyPlanAdjustmentVerifierInput.recoverySetSha256 ||
		canonicalHash(curriculumRemapVerifierInput.recoveries) !==
			canonicalHash(difficultyPlanAdjustmentVerifierInput.recoveries))
) {
	throw new Error('Curriculum and difficulty verifier inputs bind different recovery sets.');
}
const generatedEntries = [];
const shardLineage = [];

for (const shardId of [...new Set(plan.rows.map((row) => row.shard))].sort()) {
	const shardDir = path.resolve(rootDir, args.generationRoot, 'shards', shardId);
	const descendantRemap = descendantRemapByShard.get(shardId) ?? null;
	const difficultyPlanAdjustment = difficultyAdjustmentByShard.get(shardId) ?? null;
	const typedRecovery = descendantRemap ?? difficultyPlanAdjustment;
	const effectiveShard = effectiveCohort?.manifest.shards.find(
		(shard) => shard.shardId === shardId
	);
	const successorRepair = effectiveShard?.disposition === 'successor-repair-proposal';
	const successorUnchanged = effectiveShard?.disposition === 'successor-unchanged';
	const candidatePath = effectiveShard
		? path.resolve(generationRoot, effectiveShard.candidate.path)
		: path.join(shardDir, 'candidate.json');
	const validationPath = effectiveShard
		? path.resolve(generationRoot, effectiveShard.validation.path)
		: path.join(shardDir, 'validation.json');
	if (!existsSync(candidatePath) || !existsSync(validationPath)) {
		throw new Error(`Missing generated candidate or validation for ${shardId}.`);
	}
	const validation = JSON.parse(readFileSync(validationPath, 'utf8'));
	const directReviewRebaseValidation =
		!effectiveCohort &&
		validation.authoringDisposition === SCIENCE_CHALLENGE_REVIEW_REBASE_DISPOSITION;
	const directReviewRebase = directReviewRebaseValidation && Boolean(reviewRebaseEvidence);
	const reviewRebaseUnchanged =
		Boolean(effectiveReviewRebaseEvidence) &&
		effectiveCohort?.manifest.disposition ===
			SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SUCCESSOR_DISPOSITION &&
		successorUnchanged &&
		!effectiveCohort?.manifest.infrastructureRecovery;
	if (directReviewRebaseValidation && args.mode === 'release') {
		throw new Error(
			'Direct review-rebase candidates are review-pending and cannot materialize an accepted release.'
		);
	}
	if (directReviewRebaseValidation && !reviewRebaseEvidence) {
		throw new Error(`${shardId} direct review-rebase candidate lacks its exact parent replay.`);
	}
	if (typedRecovery && validation.status !== (successorRepair ? 'passed' : 'review-pending')) {
		throw new Error(`${shardId} typed recovery has a stale terminal successor validation status.`);
	}
	const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
	if (candidate.schemaVersion !== SCIENCE_CHALLENGE_BATCH_SCHEMA) {
		throw new Error(`${shardId} has an invalid batch schema.`);
	}
	if (validation.candidateSha256 !== canonicalHash(candidate)) {
		throw new Error(`${shardId} validation does not bind the current candidate bytes.`);
	}
	const infrastructureRecoverySourceKind = effectiveCohort?.manifest.infrastructureRecovery
		? classifyScienceChallengeReviewRebaseMaterializationSource({
				infrastructureRecoveryBinding: effectiveCohort.manifest.infrastructureRecovery,
				infrastructureRecoveryTerminal: reviewRebaseInfrastructureRecoveryTerminal,
				shardId,
				candidate,
				validation,
				hasCurrentTypedRepair: Boolean(typedRecovery)
			})
		: null;
	const infrastructureRecoverySource =
		infrastructureRecoverySourceKind === 'terminal-recovery-proposal'
			? scienceChallengeReviewRebaseInfrastructureRecoveryProposalLineage({
					infrastructureRecoveryBinding: effectiveCohort.manifest.infrastructureRecovery,
					infrastructureRecoveryTerminal: reviewRebaseInfrastructureRecoveryTerminal,
					shard: effectiveShard,
					candidate,
					validation
				})
			: null;
	const frozenReviewRebaseSource =
		infrastructureRecoverySourceKind === 'frozen-review-rebase-source';
	const reviewRebaseSourced = Boolean(
		directReviewRebase || reviewRebaseUnchanged || frozenReviewRebaseSource
	);
	if (!typedRecovery && !reviewRebaseSourced && validation.status !== 'passed') {
		throw new Error(`${shardId} did not pass deterministic validation.`);
	}
	const reviewRebaseSource = reviewRebaseSourced
		? requireReviewRebaseSourceLineage({
				shardId,
				candidate,
				validation,
				reviewRebaseEvidence
			})
		: null;
	const requiresAuthoringReplay =
		!reviewRebaseSourced && !infrastructureRecoverySource && (!typedRecovery || successorRepair);
	let authoringInputs = null;
	if (requiresAuthoringReplay) {
		const inputPath = scienceChallengeAuthoringInputPath({
			shardDir,
			repairSha256: validation.verificationRepairSha256 ?? null
		});
		if (!existsSync(inputPath)) {
			throw new Error(`Missing generated authoring input for ${shardId}.`);
		}
		authoringInputs = JSON.parse(readFileSync(inputPath, 'utf8'));
		const inputEvidence = validateScienceChallengeAuthoringInputEvidence({
			inputs: authoringInputs,
			validation
		});
		if (inputEvidence.status !== 'passed') {
			throw new Error(
				`${shardId} validation does not bind its authoring inputs:\n${inputEvidence.issues.join(
					'\n'
				)}`
			);
		}
	}
	const expectedIds = effectivePlan.rows
		.filter((row) => row.shard === shardId)
		.map((row) => row.id);
	const candidateIds = candidate.challenges?.map((entry) => entry?.definition?.id) ?? [];
	if (
		candidateIds.length !== expectedIds.length ||
		candidateIds.some((id) => !expectedIds.includes(id)) ||
		new Set(candidateIds).size !== candidateIds.length
	) {
		throw new Error(`${shardId} candidate membership differs from the plan.`);
	}
	generatedEntries.push(...candidate.challenges);
	const shardRows = effectivePlan.rows.filter((row) => row.shard === shardId);
	const runSummaryRows =
		(reviewRebaseSourced || typedRecovery || infrastructureRecoverySource) &&
		(!successorRepair || Boolean(infrastructureRecoverySource))
			? plan.rows.filter((row) => row.shard === shardId)
			: shardRows;
	const runSummaries =
		reviewRebaseSourced || infrastructureRecoverySource || (typedRecovery && !successorRepair)
			? []
			: listAttemptRunSummaries(shardDir, candidate, validation, {
					inputs: authoringInputs,
					rows: runSummaryRows,
					existingChallengeDefinitions: existingCatalog,
					allPlanIds: effectivePlan.rows.map((row) => row.id)
				});
	const salvageDirectories = listMultipartPlanSalvageDirectories(shardDir);
	const continuationDirectories = listMultipartContinuationDirectories(shardDir);
	requireExclusiveScienceChallengeMultipartRecoveryLineage({
		shardId,
		salvageDirectories,
		continuationDirectories
	});
	let salvage = null;
	let continuation = null;
	if (
		(reviewRebaseSourced || infrastructureRecoverySource || (typedRecovery && !successorRepair)) &&
		(salvageDirectories.length || continuationDirectories.length)
	) {
		throw new Error(
			`${shardId} deterministic exceptional lineage cannot coexist with multipart recovery lineage.`
		);
	} else if (
		reviewRebaseSourced ||
		infrastructureRecoverySource ||
		(typedRecovery && !successorRepair)
	) {
		// Exact source evidence is authenticated by review-rebase or typed-recovery replay.
	} else if (
		validation.authoringDisposition === 'exhausted-multipart-part-continuation' ||
		continuationDirectories.length > 0
	) {
		continuation = requireMultipartContinuationLineage({
			shardId,
			shardDir,
			candidate,
			validation,
			inputs: authoringInputs,
			rows: shardRows,
			continuationDirectories
		});
	} else if (
		validation.authoringDisposition === 'deterministic-multipart-plan-drift-salvage' ||
		salvageDirectories.length > 0
	) {
		salvage = requireMultipartPlanSalvageLineage({
			shardId,
			shardDir,
			candidate,
			validation,
			inputs: authoringInputs,
			rows: shardRows,
			salvageDirectories
		});
	} else if (
		!runSummaries.some(
			(run) =>
				run.candidateSha256 === canonicalHash(candidate) &&
				run.validationSha256 === canonicalHash(validation) &&
				run.validationStatus === 'passed' &&
				run.toolFree === true
		)
	) {
		throw new Error(
			`${shardId} has no tool-free model run bound to its current candidate and validation.`
		);
	}
	const shardThinkingLevels = reviewRebaseSource
		? reviewRebaseSource.sourceValidations.map((sourceValidation) => sourceValidation.thinkingLevel)
		: [
				validation.thinkingLevel ?? typedRecovery?.provenance?.executionIdentity?.thinkingLevel
			].filter(Boolean);
	shardLineage.push({
		shardId,
		thinkingLevel: shardThinkingLevels.length === 1 ? shardThinkingLevels[0] : 'mixed',
		thinkingLevels: [...new Set(shardThinkingLevels)].sort(),
		candidatePath: workspaceRelativeMaterializationPath(
			rootDir,
			candidatePath,
			`${shardId} candidate lineage path`
		),
		candidateSha256: canonicalHash(candidate),
		validationPath: workspaceRelativeMaterializationPath(
			rootDir,
			validationPath,
			`${shardId} validation lineage path`
		),
		validationSha256: canonicalHash(validation),
		runSummaries,
		reviewRebaseSource,
		reviewRebaseInfrastructureRecovery: infrastructureRecoverySource,
		salvage,
		continuation,
		descendantRemap: descendantRemap ? releaseRecoveryLineage(descendantRemap.lineage) : null,
		difficultyPlanAdjustment: difficultyPlanAdjustment
			? releaseRecoveryLineage(difficultyPlanAdjustment.lineage)
			: null
	});
}

if (generatedEntries.length !== effectivePlan.rows.length) {
	throw new Error(
		`Expected ${effectivePlan.rows.length} generated entries; found ${generatedEntries.length}.`
	);
}
const entryById = new Map(generatedEntries.map((entry) => [entry.definition.id, entry]));
const validationIssues = [];
for (const row of effectivePlan.rows) {
	const entry = entryById.get(row.id);
	if (!entry) {
		validationIssues.push(`Missing generated challenge ${row.id}.`);
		continue;
	}
	const source = sourceById.get(row.calibrationQuestionId);
	const curriculum = curriculumById.get(row.curriculumComponentId);
	const result = validateGeneratedChallenge(entry, {
		planRow: row,
		sourceQuestion: { id: source.id, contentSha256: source.contentSha256 },
		curriculum: {
			id: curriculum.componentId,
			specificationId: curriculum.specificationId,
			specificationSha256: curriculum.specificationSha256
		}
	});
	for (const issue of result.issues) validationIssues.push(`${row.id}: ${issue}`);
}
const collectionValidation = validateGeneratedChallengeCollection(generatedEntries, {
	existingDefinitions: existingCatalog
});
validationIssues.push(...collectionValidation.issues);
if (validationIssues.length) {
	throw new Error(`Compiled challenge validation failed:\n${validationIssues.join('\n')}`);
}

const orderedGeneratedEntries = effectivePlan.rows.map((row) => entryById.get(row.id));
if (
	effectiveCohort &&
	canonicalHash(orderedGeneratedEntries) !== effectiveCohort.candidateSetSha256
) {
	throw new Error('Materialized candidate set differs from the exact effective-cohort manifest.');
}
const shortRecallCandidateArtifact =
	args.mode === 'release' ? readJson(args.shortRecallCandidate) : null;
const shortRecallPrompts = args.mode === 'release' ? readJson(args.shortRecallBundle) : null;
const shortRecallAuthoringEvidence =
	args.mode === 'release' ? readJson(args.shortRecallAuthoringEvidence) : null;
const shortRecallReviewEvidence = args.mode === 'release' ? readJson(args.shortRecallReview) : null;
const shortRecallValidation =
	args.mode === 'release'
		? validateAcceptedScienceChallengeShortRecallArtifacts({
				candidateEntries: shortRecallCandidateArtifact,
				prompts: shortRecallPrompts,
				authoringEvidence: shortRecallAuthoringEvidence,
				reviewEvidence: shortRecallReviewEvidence
			})
		: null;
if (shortRecallValidation?.status === 'failed') {
	throw new Error(`Short-recall release gate failed:\n${shortRecallValidation.issues.join('\n')}`);
}
if (
	shortRecallValidation &&
	canonicalHash(shortRecallValidation.candidateSet.entries) !==
		canonicalHash(orderedGeneratedEntries)
) {
	throw new Error('Short-recall review binds a different ordered release candidate set.');
}
const acceptedContentThinkingLevels = [
	...new Set(
		shardLineage.flatMap((shard) =>
			Array.isArray(shard.thinkingLevels) ? shard.thinkingLevels : [shard.thinkingLevel]
		)
	)
].sort();
if (
	acceptedContentThinkingLevels.length === 0 ||
	acceptedContentThinkingLevels.some((level) => !['high', 'max'].includes(level))
) {
	throw new Error('Accepted content lineage contains an unsupported thinking-level set.');
}
const verifierDispatchLedger =
	args.mode === 'release' ? readJson(args.verifierDispatchLedger) : null;
const contentVerification =
	args.mode === 'release'
		? readAndRequireContentReview(
				args.contentReview,
				orderedGeneratedEntries,
				verifierDispatchLedger,
				curriculumRemapVerifierInput,
				difficultyPlanAdjustmentVerifierInput
			)
		: null;
const curriculumRemapDurableReceipt =
	contentVerification?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY] ?? null;
let effectiveReleaseGate = null;
if (args.mode === 'release' && effectiveCohort) {
	effectiveReleaseGate = validateScienceChallengeEffectiveReleaseGate({
		effectiveCohort,
		basePlan: plan,
		effectivePlan,
		contentVerification,
		curriculumRemapVerifierInput,
		curriculumRemapVerifierInputSha256: curriculumRemapVerifierInput
			? canonicalHash(curriculumRemapVerifierInput)
			: null,
		difficultyPlanAdjustmentVerifierInput,
		reviewRebaseEvidence,
		reviewRebaseInfrastructureRecoveryEvidence
	});
	if (effectiveReleaseGate.status !== 'passed') {
		throw new Error(
			`Effective-cohort post-review gate failed:\n${effectiveReleaseGate.issues.join('\n')}`
		);
	}
} else if (
	curriculumRemapDurableReceipt !== null ||
	contentVerification?.difficultyPlanAdjustmentVerifierInputSha256 !== undefined
) {
	throw new Error('Content verification contains an unassigned typed-recovery decision.');
}
const artManifest = buildArtManifest(existingCatalog, orderedGeneratedEntries);
const artManifestValidation = validateQuestionArtManifest(artManifest, { expectedCount: 1_000 });
if (artManifestValidation.status !== 'passed') {
	throw new Error(`Art manifest validation failed:\n${artManifestValidation.issues.join('\n')}`);
}
const artReview =
	args.mode === 'release' ? readAndRequireArtReview(args.artReview, artManifest) : null;
const artPerceptualAudit =
	args.mode === 'release'
		? readAndRequirePerceptualAudit(args.artPerceptualAudit, artManifest, artReview)
		: null;
const artGenerationLineage =
	args.mode === 'release'
		? readAndRequireArtGenerationLineage(artManifest, args.artGenerationRoot)
		: [];
const artDelivery =
	args.mode === 'release' ? buildArtDeliveryManifest(artManifest, artReview) : null;
const coverage = buildCoverage(effectivePlan);
const runtimeProjection =
	args.mode === 'release'
		? buildRuntimeProjection(
				effectivePlan.planId,
				existingCatalog,
				orderedGeneratedEntries,
				curriculumById,
				artManifest,
				artDelivery
			)
		: null;
const lineage = {
	schemaVersion: 'science-challenge-release-lineage/v1',
	content: shardLineage,
	descendantRemaps: shardLineage
		.map((shard) => shard.descendantRemap)
		.filter((value) => value !== null),
	difficultyPlanAdjustments: shardLineage
		.map((shard) => shard.difficultyPlanAdjustment)
		.filter((value) => value !== null),
	effectiveCohort: effectiveCohort
		? {
				manifestSha256: canonicalHash(effectiveCohort.manifest),
				basePlanSha256: effectiveCohort.manifest.basePlanSha256,
				effectivePlanSha256: effectiveCohort.manifest.effectivePlanSha256,
				candidateSetSha256: effectiveCohort.candidateSetSha256,
				candidateCount: effectiveCohort.manifest.candidateCount,
				remapManifestSetSha256: effectiveCohort.manifest.remapManifestSetSha256,
				difficultyAdjustmentCount: effectiveCohort.manifest.difficultyAdjustmentCount,
				difficultyAdjustmentManifestSetSha256:
					effectiveCohort.manifest.difficultyAdjustmentManifestSetSha256,
				recoverySetSha256: effectiveCohort.manifest.recoverySetSha256,
				infrastructureRecovery: effectiveCohort.manifest.infrastructureRecovery ?? null,
				parentChain: effectiveCohort.parentChain ?? null
			}
		: null,
	curriculumRemap: curriculumRemapDurableReceipt
		? {
				verifierInputSha256: canonicalHash(curriculumRemapVerifierInput),
				durableReceiptSha256: canonicalHash(curriculumRemapDurableReceipt),
				proposalSetSha256: curriculumRemapDurableReceipt.proposalSetSha256,
				decisionSetSha256: curriculumRemapDurableReceipt.decisionSetSha256
			}
		: null,
	curriculumRemapVerifierInput: curriculumRemapVerifierInput
		? {
				sha256: canonicalHash(curriculumRemapVerifierInput),
				basePlanSha256: curriculumRemapVerifierInput.basePlanSha256,
				effectivePlanSha256: curriculumRemapVerifierInput.effectivePlanSha256,
				proposalSetSha256: canonicalHash(curriculumRemapVerifierInput.proposals),
				manifestSetSha256: curriculumRemapVerifierInput.remapManifestSetSha256,
				decisionSetSha256: curriculumRemapDurableReceipt?.decisionSetSha256 ?? null
			}
		: null,
	difficultyPlanAdjustment: difficultyPlanAdjustmentVerifierInput
		? {
				verifierInputSha256: canonicalHash(difficultyPlanAdjustmentVerifierInput),
				adjustmentManifestSetSha256:
					difficultyPlanAdjustmentVerifierInput.adjustmentManifestSetSha256,
				recoverySetSha256: difficultyPlanAdjustmentVerifierInput.recoverySetSha256,
				acceptedDecisionCount:
					effectiveReleaseGate?.acceptedDifficultyPlanAdjustmentDecisionCount ?? null,
				decisionSetSha256: effectiveReleaseGate?.difficultyPlanAdjustmentDecisionSetSha256 ?? null
			}
		: null,
	art: artGenerationLineage,
	recovery: repairRecoveryManifest
		? {
				schemaVersion: repairRecoveryManifest.schemaVersion,
				executionId: repairRecoveryManifest.executionId,
				objectiveId: repairRecoveryManifest.identity.objectiveId,
				path: workspaceRelativeMaterializationPath(
					rootDir,
					repairRecoveryManifestPath,
					'Verification-repair recovery manifest path'
				),
				sha256: canonicalHash(repairRecoveryManifest),
				executionLedgerSha256: canonicalHash(repairExecutionLedgerSnapshot)
			}
		: null
};
const releaseMaterializedAt = materializedAt(plan, args.materializedAt);
const releaseBindings = {
	planSha256: canonicalHash(plan),
	basePlanSha256: canonicalHash(plan),
	effectivePlanSha256: canonicalHash(effectivePlan),
	sourceSnapshotSha256: canonicalHash(sourceSnapshot),
	curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
	curriculumCatalogSha256: canonicalHash(curriculumCatalog),
	effectiveCohortManifestSha256: effectiveCohort ? canonicalHash(effectiveCohort.manifest) : null,
	effectiveCohortCandidateSetSha256: effectiveCohort ? effectiveCohort.candidateSetSha256 : null,
	curriculumRemapVerifierInputSha256: curriculumRemapVerifierInput
		? canonicalHash(curriculumRemapVerifierInput)
		: null,
	curriculumRemapDurableReceiptSha256: curriculumRemapDurableReceipt
		? canonicalHash(curriculumRemapDurableReceipt)
		: null,
	descendantRemapManifestSetSha256: descendantRemapRecoveries.length
		? canonicalHash(descendantRemapRecoveries.map((recovery) => recovery.manifest))
		: null,
	curriculumRemapDecisionSetSha256: curriculumRemapDurableReceipt?.decisionSetSha256 ?? null,
	difficultyPlanAdjustmentVerifierInputSha256: difficultyPlanAdjustmentVerifierInput
		? canonicalHash(difficultyPlanAdjustmentVerifierInput)
		: null,
	difficultyAdjustmentManifestSetSha256: difficultyAdjustmentRecoveries.length
		? canonicalHash(difficultyAdjustmentRecoveries.map((recovery) => recovery.manifest))
		: null,
	recoverySetSha256,
	difficultyPlanAdjustmentDecisionCount:
		effectiveReleaseGate?.acceptedDifficultyPlanAdjustmentDecisionCount ?? null,
	difficultyPlanAdjustmentDecisionSetSha256:
		effectiveReleaseGate?.difficultyPlanAdjustmentDecisionSetSha256 ?? null,
	contentVerificationSha256: contentVerification ? canonicalHash(contentVerification) : null,
	verifierDispatchLedgerSha256: verifierDispatchLedger
		? canonicalHash(verifierDispatchLedger)
		: null,
	artManifestSha256: canonicalHash(artManifest),
	artReviewSha256: artReview ? canonicalHash(artReview) : null,
	artPerceptualAuditSha256: artPerceptualAudit ? canonicalHash(artPerceptualAudit) : null,
	artDeliveryManifestSha256: artDelivery ? canonicalHash(artDelivery) : null,
	runtimeSha256: runtimeProjection ? canonicalHash(runtimeProjection) : null,
	shortRecallCandidateArtifactSha256: shortRecallReviewEvidence?.candidateArtifactSha256 ?? null,
	shortRecallCandidateSetSha256: shortRecallValidation?.candidateSet?.candidateSetSha256 ?? null,
	shortRecallBundleSha256: shortRecallPrompts ? canonicalHash(shortRecallPrompts) : null,
	shortRecallReviewSha256: shortRecallReviewEvidence
		? canonicalHash(shortRecallReviewEvidence)
		: null,
	shortRecallAuthoringEvidenceSha256: shortRecallAuthoringEvidence
		? canonicalHash(shortRecallAuthoringEvidence)
		: null,
	shortRecallAuthoringRunSha256: shortRecallReviewEvidence?.authoring?.runSha256 ?? null,
	shortRecallReviewerRunSha256: shortRecallReviewEvidence?.reviewer?.runSha256 ?? null,
	coverageSha256: canonicalHash(coverage),
	lineageSha256: canonicalHash(lineage),
	contentGenerationLineageSha256: canonicalHash(shardLineage),
	contentParentLineageSha256: effectiveReleaseGate?.contentParentLineageSha256 ?? null,
	artGenerationLineageSha256: args.mode === 'release' ? canonicalHash(artGenerationLineage) : null
};
const provenanceBindings =
	args.mode === 'release' ? scienceChallengeProvenanceBindings(releaseBindings) : null;

const outputRoot =
	args.mode === 'release'
		? path.resolve(rootDir, 'data/challenges/releases', plan.planId)
		: path.resolve(rootDir, args.candidateOutput);
if (existsSync(outputRoot)) {
	throw new Error(
		`Materialization output already exists and is immutable: ${workspaceRelativeMaterializationPath(
			rootDir,
			outputRoot,
			'Materialization output path'
		)}`
	);
}

let releaseStagingRoot;
let provenanceArchive = null;
if (args.mode === 'release') {
	const stagingParent = path.resolve(rootDir, 'tmp', 'science-challenge-release-staging');
	mkdirSync(stagingParent, { recursive: true });
	releaseStagingRoot = mkdtempSync(path.join(stagingParent, `${plan.planId}-`));
	try {
		provenanceArchive = buildScienceChallengeProvenanceArchive({
			rootDir,
			archiveRoot: path.join(releaseStagingRoot, 'provenance'),
			releaseId: plan.planId,
			materializedAt: releaseMaterializedAt,
			expectedBindings: provenanceBindings,
			lineage,
			artManifest,
			artDeliveryManifest: artDelivery,
			runtime: runtimeProjection,
			coverage,
			planPath: args.plan,
			effectivePlan,
			effectiveCohort,
			reviewRebaseEvidence,
			reviewRebaseInfrastructureRecoveryEvidence,
			reviewRebaseInfrastructureRecoveryTerminal,
			reviewRebaseExistingDefinitions: reviewRebaseEvidence ? existingCatalog : null,
			curriculumCatalogPath: plan.curriculumCatalogPath,
			curriculumRemapVerifierInputSha256: curriculumRemapVerifierInput
				? canonicalHash(curriculumRemapVerifierInput)
				: null,
			curriculumRemapDurableReceipt,
			descendantRemapRecoveries,
			difficultyPlanAdjustmentVerifierInputSha256: difficultyPlanAdjustmentVerifierInput
				? canonicalHash(difficultyPlanAdjustmentVerifierInput)
				: null,
			difficultyPlanAdjustmentRecoveries,
			sourceSnapshotPath: args.source,
			curriculumEvidencePath: args.evidence,
			assignmentIndexPath: args.verificationAssignmentIndex,
			verifierDispatchLedgerPath: args.verifierDispatchLedger,
			generationRoot: args.generationRoot,
			contentReviewPath: args.contentReview,
			artGenerationRoot: args.artGenerationRoot,
			artReviewRoot: path.dirname(args.artReview),
			artPerceptualAuditPath: args.artPerceptualAudit,
			repairRecoveryManifestPath,
			repairExecutionLedgerSnapshot
		});
	} catch (error) {
		rmSync(releaseStagingRoot, { recursive: true, force: true });
		throw error;
	}
} else {
	const stagingParent = path.dirname(outputRoot);
	mkdirSync(stagingParent, { recursive: true });
	releaseStagingRoot = mkdtempSync(
		path.join(stagingParent, `.${path.basename(outputRoot)}-candidate-staging-`)
	);
}

const release = {
	schemaVersion: SCIENCE_CHALLENGE_RELEASE_SCHEMA,
	release: {
		id: plan.planId,
		status: args.mode === 'release' ? 'accepted' : 'candidate',
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
		model: 'gpt-5.6-sol',
		thinkingLevel:
			acceptedContentThinkingLevels.length === 1 ? acceptedContentThinkingLevels[0] : 'mixed',
		thinkingLevels: acceptedContentThinkingLevels,
		...releaseBindings,
		provenanceArchiveSha256: provenanceArchive?.manifestSha256 ?? null,
		materializedAt: releaseMaterializedAt
	},
	coverage,
	lineage,
	challenges: effectivePlan.rows.map((row) => entryById.get(row.id))
};
const releaseValidation = validateRelease(release, {
	expectedCount: 408,
	forEntry: (entry) => {
		const row = effectivePlan.rows.find((candidate) => candidate.id === entry.definition.id);
		const source = sourceById.get(row.calibrationQuestionId);
		const curriculum = curriculumById.get(row.curriculumComponentId);
		return {
			planRow: row,
			sourceQuestion: { id: source.id, contentSha256: source.contentSha256 },
			curriculum: {
				id: curriculum.componentId,
				specificationId: curriculum.specificationId,
				specificationSha256: curriculum.specificationSha256
			}
		};
	}
});
if (releaseValidation.status !== 'passed') {
	if (releaseStagingRoot) {
		rmSync(releaseStagingRoot, { recursive: true, force: true });
	}
	throw new Error(`Release validation failed:\n${releaseValidation.issues.join('\n')}`);
}

const materializationRoot = releaseStagingRoot ?? outputRoot;
try {
	mkdirSync(materializationRoot, { recursive: true });
	if (provenanceArchive) {
		const durableValidation = validateScienceChallengeProvenanceArchive({
			archiveRoot: path.join(materializationRoot, 'provenance'),
			expectedBindings: provenanceBindings
		});
		if (
			durableValidation.status !== 'passed' ||
			canonicalHash(durableValidation.manifest) !== provenanceArchive.manifestSha256 ||
			durableValidation.manifest?.releaseId !== plan.planId ||
			durableValidation.manifest?.materializedAt !== releaseMaterializedAt
		) {
			throw new Error(
				`Durable provenance archive validation failed:\n${durableValidation.issues.join('\n')}`
			);
		}
	}
	writeJson(path.join(materializationRoot, 'art-manifest.json'), artManifest);
	writeJson(path.join(materializationRoot, 'coverage.json'), release.coverage);
	if (artDelivery)
		writeJson(path.join(materializationRoot, 'art-delivery-manifest.json'), artDelivery);
	if (contentVerification) {
		writeJson(path.join(materializationRoot, 'content-verification.json'), contentVerification);
		for (const assignmentResult of contentVerification.assignmentResults) {
			writeJson(
				path.join(
					materializationRoot,
					'content-verification-assignments',
					`${assignmentResult.assignmentId}.json`
				),
				readBoundJsonForCopy(
					assignmentResult.path,
					assignmentResult.sha256,
					`content review result ${assignmentResult.assignmentId}`
				)
			);
		}
	}
	if (verifierDispatchLedger) {
		writeJson(
			path.join(materializationRoot, 'verifier-dispatch-ledger.json'),
			verifierDispatchLedger
		);
	}
	if (curriculumRemapDurableReceipt) {
		writeJson(
			path.join(materializationRoot, 'curriculum-remap-durable-receipt.json'),
			curriculumRemapDurableReceipt
		);
	}
	if (args.mode === 'candidate' && curriculumRemapVerifierInput) {
		writeJson(
			path.join(materializationRoot, 'curriculum-remap-verifier-input.json'),
			curriculumRemapVerifierInput
		);
	}
	if (args.mode === 'candidate' && difficultyPlanAdjustmentVerifierInput) {
		writeJson(
			path.join(materializationRoot, 'difficulty-plan-adjustment-verifier-input.json'),
			difficultyPlanAdjustmentVerifierInput
		);
	}
	if (artReview) {
		writeJson(path.join(materializationRoot, 'art-review.json'), artReview);
		for (const batch of artReview.batches) {
			const batchRoot = path.join(materializationRoot, 'art-review-batches', batch.batchId);
			writeJson(
				path.join(batchRoot, 'review-input.json'),
				readBoundJsonForCopy(
					batch.inputPath,
					batch.inputFileSha256,
					`art review input ${batch.batchId}`,
					{ rawHash: true }
				)
			);
			writeJson(
				path.join(batchRoot, 'review-request.json'),
				readBoundJsonForCopy(
					batch.requestPath,
					batch.requestFileSha256,
					`art review request ${batch.batchId}`,
					{ rawHash: true }
				)
			);
			writeJson(
				path.join(batchRoot, 'result.json'),
				readBoundJsonForCopy(
					batch.resultPath,
					batch.resultSha256,
					`art review result ${batch.batchId}`
				)
			);
			writeJson(
				path.join(batchRoot, 'run-summary.json'),
				readBoundJsonForCopy(
					batch.runSummaryPath,
					batch.runSummarySha256,
					`art review run summary ${batch.batchId}`
				)
			);
		}
	}
	if (artPerceptualAudit) {
		writeJson(path.join(materializationRoot, 'art-perceptual-audit.json'), artPerceptualAudit);
	}

	if (args.mode === 'release') {
		writeJson(path.join(materializationRoot, 'short-recall-prompts.json'), shortRecallPrompts);
		writeJson(
			path.join(materializationRoot, 'short-recall-authoring-evidence.json'),
			shortRecallAuthoringEvidence
		);
		writeJson(
			path.join(materializationRoot, 'short-recall-review-evidence.json'),
			shortRecallReviewEvidence
		);
		writeJson(path.join(materializationRoot, 'runtime.json'), runtimeProjection);
	}

	// This is the release marker. Write it only after all sibling evidence and the runtime projection.
	writeJson(path.join(materializationRoot, 'accepted-challenges.json'), release);
	if (releaseStagingRoot) {
		validateCompletedReleaseTree({
			releaseRoot: releaseStagingRoot,
			release,
			artManifest,
			artDelivery,
			runtime: runtimeProjection,
			shortRecallPrompts,
			shortRecallAuthoringEvidence,
			shortRecallReviewEvidence,
			coverage,
			contentVerification,
			verifierDispatchLedger,
			artReview,
			artPerceptualAudit,
			provenanceBindings,
			curriculumRemapDurableReceipt,
			curriculumRemapVerifierInput: args.mode === 'candidate' ? curriculumRemapVerifierInput : null,
			difficultyPlanAdjustmentVerifierInput:
				args.mode === 'candidate' ? difficultyPlanAdjustmentVerifierInput : null
		});
		mkdirSync(path.dirname(outputRoot), { recursive: true });
		renameSync(releaseStagingRoot, outputRoot);
	}
} catch (error) {
	if (releaseStagingRoot && existsSync(releaseStagingRoot)) {
		rmSync(releaseStagingRoot, { recursive: true, force: true });
	}
	throw error;
}

console.log(
	JSON.stringify(
		{
			status: 'passed',
			mode: args.mode,
			releaseId: plan.planId,
			generatedRounds: release.challenges.length,
			finalRounds: existingCatalog.length + release.challenges.length,
			questionContexts: (existingCatalog.length + release.challenges.length) * 2,
			artSpecs: artManifest.specs.length,
			shortRecallPrompts: shortRecallPrompts?.length ?? 0,
			shortRecallBundleSha256: release.release.shortRecallBundleSha256,
			shortRecallReviewSha256: release.release.shortRecallReviewSha256,
			provenanceArchiveSha256: release.release.provenanceArchiveSha256,
			outputRoot: workspaceRelativeMaterializationPath(
				rootDir,
				outputRoot,
				'Materialization output path'
			),
			curriculumRemapVerifierInputPath:
				args.mode === 'candidate' && curriculumRemapVerifierInput
					? workspaceRelativeMaterializationPath(
							rootDir,
							path.join(outputRoot, 'curriculum-remap-verifier-input.json'),
							'Curriculum-remap verifier-input path'
						)
					: null,
			difficultyPlanAdjustmentVerifierInputPath:
				args.mode === 'candidate' && difficultyPlanAdjustmentVerifierInput
					? workspaceRelativeMaterializationPath(
							rootDir,
							path.join(outputRoot, 'difficulty-plan-adjustment-verifier-input.json'),
							'Difficulty-plan adjustment verifier-input path'
						)
					: null,
			releaseSha256: canonicalHash(release)
		},
		null,
		2
	)
);

async function loadExistingCatalog() {
	const server = await createServer({
		root: rootDir,
		server: { middlewareMode: true },
		appType: 'custom',
		logLevel: 'silent'
	});
	try {
		const module = await server.ssrLoadModule('/src/lib/challenges/catalog.ts');
		return module.challengeCatalog;
	} finally {
		await server.close();
	}
}

function buildArtManifest(existingCatalog, newEntries) {
	const specs = [];
	for (const challenge of existingCatalog) {
		specs.push(legacyArtSpec(challenge, 'opening'));
		specs.push(legacyArtSpec(challenge, 'transfer'));
	}
	for (const entry of newEntries) {
		for (const context of ['opening', 'transfer']) {
			const art = entry.art[context];
			specs.push({
				...art,
				challengeId: entry.definition.id,
				subject: entry.definition.subject,
				question:
					context === 'opening'
						? entry.definition.previewQuestion
						: entry.definition.transferPromptLead,
				output: outputPaths(art.id)
			});
		}
	}
	const ids = specs.map((spec) => spec.id);
	if (new Set(ids).size !== ids.length) throw new Error('Art manifest contains duplicate ids.');
	return {
		schemaVersion: SCIENCE_QUESTION_ART_MANIFEST_SCHEMA,
		releaseId: plan.planId,
		width: 960,
		height: 540,
		specs
	};
}

function legacyArtSpec(challenge, context) {
	const question = context === 'opening' ? challenge.previewQuestion : challenge.transferPromptLead;
	const id = `${challenge.id}-${context}`;
	const subjectLabel = challenge.subject[0].toUpperCase() + challenge.subject.slice(1);
	const conciseQuestion = question.replace(/\s+/g, ' ').trim();
	return {
		schemaVersion: 'science-question-art/v1',
		id,
		challengeId: challenge.id,
		context,
		subject: challenge.subject,
		question: conciseQuestion,
		scene: `A single coherent, text-free GCSE ${subjectLabel} scene showing the starting situation in this question before any result or conclusion: ${conciseQuestion}`,
		visualAnchor: `${challenge.topic}: ${challenge.title.replace(/\?$/, '')}`,
		altText: truncate(
			`A text-free ${subjectLabel} illustration showing the starting setup described by: ${conciseQuestion}`,
			320
		),
		approvedMeaning:
			'The question-specific starting situation is visible, while the result and correct reasoning remain unresolved.',
		accuracyConstraints: [
			`Use only scientifically plausible ${subjectLabel} objects, structures or apparatus named or unambiguously required by the question.`,
			'Keep the depicted state before the measured result, reaction outcome, calculation or explanatory conclusion.'
		],
		forbiddenDetails: [
			'Do not reveal the correct answer, result, causal link, completed sequence, numerical solution or winning choice.',
			'Do not add text, labels, equations, values, arrows, branding or unrelated apparatus.'
		],
		output: outputPaths(id)
	};
}

function outputPaths(id) {
	return {
		darkPath: scienceQuestionArtLocalPath(plan.planId, id, 'dark'),
		lightPath: scienceQuestionArtLocalPath(plan.planId, id, 'light')
	};
}

function buildRuntimeProjection(
	releaseId,
	existingCatalog,
	newEntries,
	curriculumComponents,
	artManifest,
	artDelivery
) {
	const definitions = newEntries.map((entry) => entry.definition);
	return {
		schemaVersion: 'generated-science-challenge-runtime/v1',
		releaseId,
		definitions,
		identities: definitions.map(({ id, slug, subject }) => ({ id, slug, subject })),
		curriculum: newEntries.map((entry) => {
			const component = curriculumComponents.get(entry.grounding.curriculumComponentId);
			if (!component) {
				throw new Error(
					`Runtime projection is missing curriculum ${entry.grounding.curriculumComponentId}.`
				);
			}
			return {
				id: entry.definition.id,
				subject: entry.definition.subject,
				curriculumComponentId: entry.grounding.curriculumComponentId,
				specificationId: entry.grounding.specificationId,
				specificationSha256: entry.grounding.specificationSha256,
				specRef: component.code,
				topicLabel: component.title,
				sourceTextSha256: component.sourceTextSha256,
				pageStart: component.pageStart,
				pageEnd: component.pageEnd
			};
		}),
		visuals: buildRuntimeVisuals(existingCatalog, newEntries, artManifest, artDelivery)
	};
}

function buildRuntimeVisuals(existingCatalog, newEntries, artManifest, artDelivery) {
	const specById = new Map(artManifest.specs.map((spec) => [spec.id, spec]));
	const deliveryById = new Map(artDelivery.objects.map((object) => [object.id, object]));
	const definitions = [...existingCatalog, ...newEntries.map((entry) => entry.definition)];
	return definitions.map((challenge) => {
		const opening = specById.get(`${challenge.id}-opening`);
		const transfer = specById.get(`${challenge.id}-transfer`);
		const segments = challenge.memoryHandle
			.split(/\s*(?:→|⟶)\s*/u)
			.map((segment) => segment.trim())
			.filter(Boolean);
		return {
			id: challenge.id,
			segments,
			decisiveIndex: Math.max(0, segments.length - 2),
			decisiveLabel: challenge.memoryHandle,
			cardArt: artRecord(opening, deliveryById),
			transferArt: artRecord(transfer, deliveryById)
		};
	});
}

function artRecord(spec, deliveryById) {
	const dark = deliveryById.get(`${spec.id}-dark`);
	const light = deliveryById.get(`${spec.id}-light`);
	if (!dark || !light) throw new Error(`Missing R2 delivery paths for ${spec.id}.`);
	return {
		src: light.publicPath,
		darkSrc: dark.publicPath,
		alt: spec.altText,
		width: 960,
		height: 540
	};
}

function buildArtDeliveryManifest(artManifest, artReview) {
	const objects = [];
	for (const spec of artManifest.specs) {
		for (const theme of ['dark', 'light']) {
			const localPath = spec.output[`${theme}Path`];
			const filePath = path.resolve(rootDir, localPath);
			if (!existsSync(filePath)) throw new Error(`Reviewed illustration is missing: ${localPath}`);
			const assetSha256 = sha256(readFileSync(filePath));
			objects.push({
				id: `${spec.id}-${theme}`,
				artId: spec.id,
				challengeId: spec.challengeId,
				subject: spec.subject,
				context: spec.context,
				theme,
				localPath,
				r2Key: scienceQuestionArtR2Key(artManifest.releaseId, spec.id, theme, assetSha256),
				publicPath: scienceQuestionArtPublicPath(
					artManifest.releaseId,
					spec.id,
					theme,
					assetSha256
				),
				sha256: assetSha256,
				size: statSync(filePath).size,
				contentType: 'image/webp',
				cacheControl: 'public, max-age=31536000, immutable'
			});
		}
	}
	const delivery = {
		schemaVersion: SCIENCE_QUESTION_ART_DELIVERY_SCHEMA,
		releaseId: artManifest.releaseId,
		bucket: 'question-constellation',
		sourceManifestSha256: canonicalHash(artManifest),
		assetInventorySha256: artReview.assetInventorySha256,
		objectCount: objects.length,
		objects
	};
	const validation = validateQuestionArtDeliveryManifest(delivery, {
		artManifest,
		expectedCount: 2_000
	});
	if (validation.status !== 'passed') {
		throw new Error(`Art delivery validation failed:\n${validation.issues.join('\n')}`);
	}
	return delivery;
}

function buildCoverage(plan) {
	const dimensions = [
		'subject',
		'chapterId',
		'curriculumComponentId',
		'difficulty',
		'taskShape',
		'arc',
		'mechanic'
	];
	return {
		schemaVersion: 'science-challenge-coverage/v1',
		generatedRounds: plan.rows.length,
		generatedQuestionContexts: plan.rows.length * 2,
		finalRounds: 500,
		finalQuestionContexts: 1_000,
		dimensions: Object.fromEntries(
			dimensions.map((dimension) => [dimension, countsFor(plan.rows, dimension)])
		)
	};
}

function countsFor(rows, field) {
	const counts = new Map();
	for (const row of rows) counts.set(row[field], (counts.get(row[field]) ?? 0) + 1);
	return Object.fromEntries(
		[...counts.entries()].sort(([left], [right]) =>
			String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0
		)
	);
}

function readAndRequireContentReview(
	relativePath,
	generatedEntries,
	dispatchLedger,
	expectedCurriculumRemapVerifierInput,
	expectedDifficultyPlanAdjustmentVerifierInput
) {
	const review = readJson(relativePath);
	const expectedReviewRebaseSuccessorEmptyRecoveryBinding =
		buildMaterializerReviewRebaseSuccessorEmptyRecoveryBinding({
			effectiveCohort,
			reviewRebaseEvidence,
			reviewRebaseInfrastructureRecoveryEvidence
		});
	const rawEvidence = requireContentVerificationEvidence({
		summary: review,
		summaryPath: relativePath,
		plan: effectivePlan,
		basePlan: plan,
		expectedCurriculumRemapVerifierInput,
		expectedDifficultyPlanAdjustmentVerifierInput,
		expectedReviewRebaseSuccessorEmptyRecoveryBinding,
		sourceSnapshot,
		curriculumEvidence,
		rootDir,
		requiredStatus: 'passed',
		expectedCount: 408
	});
	if (rawEvidence.status !== 'passed') {
		throw new Error(`Raw content verification evidence failed:\n${rawEvidence.issues.join('\n')}`);
	}
	if (canonicalHash(rawEvidence.ledger) !== canonicalHash(dispatchLedger)) {
		throw new Error('The supplied verifier dispatch ledger differs from the raw evidence ledger.');
	}
	const expectedAssignmentCount = new Set(effectivePlan.rows.map((row) => row.shard)).size;
	if (review.schemaVersion !== 'science-challenge-independent-verification-summary/v1') {
		throw new Error('Content verification summary has an invalid schemaVersion.');
	}
	if (review.status !== 'passed' || review.acceptedCount !== 408 || review.rejectedCount !== 0) {
		throw new Error('All 408 generated challenges must pass independent verification.');
	}
	if (
		review.assignmentCount !== expectedAssignmentCount ||
		review.reviewCount !== 408 ||
		!Array.isArray(review.assignmentResults) ||
		review.assignmentResults.length !== expectedAssignmentCount ||
		review.assignmentResults.some((result) => result.status !== 'passed') ||
		!Array.isArray(review.issues) ||
		review.issues.length !== 0
	) {
		throw new Error('Content verification summary is incomplete or contains invalid assignments.');
	}
	if (
		review.planId !== effectivePlan.planId ||
		review.planSha256 !== canonicalHash(effectivePlan) ||
		(review.basePlanSha256 ?? review.planSha256) !== canonicalHash(plan) ||
		(review.effectivePlanSha256 ?? review.planSha256) !== canonicalHash(effectivePlan)
	) {
		throw new Error('Content verification was run against a different plan.');
	}
	if (
		review.sourceSnapshotSha256 !== canonicalHash(sourceSnapshot) ||
		review.curriculumEvidenceSha256 !== canonicalHash(curriculumEvidence)
	) {
		throw new Error('Content verification was run against different source or curriculum bytes.');
	}
	if (review.candidateSetSha256 !== canonicalHash(generatedEntries)) {
		throw new Error('Content verification was run against different candidate bytes.');
	}
	validateVerifierDispatchForRelease(dispatchLedger, review, expectedAssignmentCount);
	if (!Array.isArray(review.reviews) || review.reviews.length !== 408) {
		throw new Error('Content verification must contain exactly 408 review rows.');
	}
	const boundReviewRows = [];
	for (const assignmentResult of review.assignmentResults) {
		const reviewPath = path.resolve(rootDir, assignmentResult.path);
		if (!reviewPath.startsWith(`${rootDir}${path.sep}`) || !existsSync(reviewPath)) {
			throw new Error(`Content verifier result is missing or unsafe: ${assignmentResult.path}`);
		}
		const assignmentReview = JSON.parse(readFileSync(reviewPath, 'utf8'));
		if (canonicalHash(assignmentReview) !== assignmentResult.sha256) {
			throw new Error(`Content verifier result bytes changed: ${assignmentResult.assignmentId}`);
		}
		boundReviewRows.push(...(assignmentReview.reviews ?? []));
	}
	if (canonicalHash(boundReviewRows) !== canonicalHash(review.reviews)) {
		throw new Error('Aggregated content reviews differ from the bound verifier result files.');
	}
	const proposalById = new Map(
		(expectedCurriculumRemapVerifierInput?.proposals ?? []).map((proposal) => [
			proposal.challengeId,
			proposal
		])
	);
	const difficultyProposalById = new Map(
		(expectedDifficultyPlanAdjustmentVerifierInput?.proposals ?? []).map((proposal) => [
			proposal.challengeId,
			proposal
		])
	);
	for (const rowReview of review.reviews) {
		const validation = validateScienceChallengeContentReviewRow(rowReview, {
			proposal: proposalById.get(rowReview.id),
			difficultyProposal: difficultyProposalById.get(rowReview.id)
		});
		if (validation.status !== 'passed') {
			throw new Error(
				`Content review hard gate failed for ${rowReview.id}: ${validation.issues.join(' ')}`
			);
		}
		const planRow = effectivePlan.rows.find((row) => row.id === rowReview.id);
		if (planRow?.taskShape === 'quantitative' && rowReview.checkedCalculations.length === 0) {
			throw new Error(`Quantitative review ${rowReview.id} has no calculation audit.`);
		}
	}
	const ids = new Set(
		review.reviews.filter((entry) => entry.accepted === true).map((entry) => entry.id)
	);
	if (ids.size !== 408) throw new Error('Content verification ids must be unique and accepted.');
	for (const row of effectivePlan.rows)
		if (!ids.has(row.id)) throw new Error(`Missing accepting content review for ${row.id}.`);
	const decisions = rawEvidence.curriculumRemapDecisions ?? [];
	if (expectedCurriculumRemapVerifierInput) {
		if (
			decisions.length !== expectedCurriculumRemapVerifierInput.proposals.length ||
			decisions.some((decision) => decision.accepted !== true) ||
			review.acceptedRemapDecisionCount !== decisions.length ||
			review.rejectedRemapDecisionCount !== 0
		) {
			throw new Error(
				'Every immutable descendant-remap proposal requires one exact accepted fresh-review decision.'
			);
		}
	} else if (decisions.length !== 0) {
		throw new Error('Content review contains an unassigned curriculum remap decision.');
	}
	const difficultyDecisions = rawEvidence.difficultyPlanAdjustmentDecisions ?? [];
	if (expectedDifficultyPlanAdjustmentVerifierInput) {
		if (
			difficultyDecisions.length !==
				expectedDifficultyPlanAdjustmentVerifierInput.proposals.length ||
			difficultyDecisions.some((decision) => decision.accepted !== true) ||
			review.difficultyPlanAdjustmentVerifierInputSha256 !==
				canonicalHash(expectedDifficultyPlanAdjustmentVerifierInput) ||
			review.recoverySetSha256 !==
				expectedDifficultyPlanAdjustmentVerifierInput.recoverySetSha256 ||
			review.acceptedDifficultyPlanAdjustmentDecisionCount !== difficultyDecisions.length ||
			review.rejectedDifficultyPlanAdjustmentDecisionCount !== 0
		) {
			throw new Error(
				'Every difficulty-plan adjustment proposal requires one exact accepted fresh-review decision.'
			);
		}
	} else if (difficultyDecisions.length !== 0) {
		throw new Error('Content review contains an unassigned difficulty-plan adjustment decision.');
	}
	return review;
}

function buildMaterializerReviewRebaseSuccessorEmptyRecoveryBinding({
	effectiveCohort,
	reviewRebaseEvidence,
	reviewRebaseInfrastructureRecoveryEvidence
}) {
	if (!effectiveCohort || !reviewRebaseEvidence) return null;
	return buildScienceChallengeReviewRebaseSuccessorEmptyRecoveryBinding({
		effectiveCohort,
		reviewRebaseEvidence,
		reviewRebaseInfrastructureRecoveryEvidence
	});
}

function validateVerifierDispatchForRelease(ledger, review, expectedAssignmentCount) {
	if (
		ledger?.schemaVersion !== 'science-challenge-verifier-dispatch-ledger/v1' ||
		ledger.orchestrator !== 'codex-collaboration' ||
		ledger.indexSha256 !== review.indexSha256 ||
		canonicalHash(ledger) !== review.dispatchLedgerSha256 ||
		!Array.isArray(ledger.dispatches) ||
		ledger.dispatches.length !== expectedAssignmentCount
	) {
		throw new Error('Verifier dispatch ledger is incomplete or differs from the review summary.');
	}
	const allocation = validateScienceChallengeVerifierAllocation(ledger.dispatches, {
		expectedAssignmentCount
	});
	if (allocation.status !== 'passed') {
		throw new Error(
			`Verifier dispatch ledger contains an invalid three-verifier allocation:\n${allocation.issues.join('\n')}`
		);
	}
	const dispatchByAssignment = allocation.dispatchByAssignment;
	for (const result of review.assignmentResults) {
		const dispatch = dispatchByAssignment.get(result.assignmentId);
		if (
			!dispatch ||
			result.verifier?.context !== 'empty' ||
			result.verifier?.model !== 'gpt-5.6-sol' ||
			result.verifier?.reasoningEffort !== 'max' ||
			result.verifier?.provenance?.orchestrator !== 'codex-collaboration' ||
			result.verifier?.provenance?.taskName !== dispatch.taskName ||
			result.verifier?.provenance?.forkTurns !== 'none' ||
			result.verifier?.provenance?.dispatchLedgerSha256 !== canonicalHash(ledger)
		) {
			throw new Error(`Verifier provenance is invalid for ${result.assignmentId}.`);
		}
	}
}

function readAndRequireArtReview(relativePath, manifest) {
	const review = readJson(relativePath);
	const rawEvidence = requireArtReviewEvidence({
		review,
		reviewPath: relativePath,
		manifest,
		rootDir,
		requiredStatus: 'passed',
		expectedCount: 1_000
	});
	if (rawEvidence.status !== 'passed') {
		throw new Error(`Raw art review evidence failed:\n${rawEvidence.issues.join('\n')}`);
	}
	if (review.schemaVersion !== SCIENCE_QUESTION_ART_REVIEW_SCHEMA) {
		throw new Error('Art review summary has an invalid schemaVersion.');
	}
	if (review.model !== 'gpt-5.6-sol' || review.thinkingLevel !== 'max') {
		throw new Error('Art review used the wrong model or thinking level.');
	}
	if (review.status !== 'passed' || review.acceptedCount !== 1_000 || review.rejectedCount !== 0) {
		throw new Error('All 1,000 illustration pairs must pass independent visual review.');
	}
	if (
		review.selectedCount !== 1_000 ||
		review.missingCount !== 0 ||
		review.invalidBatchCount !== 0 ||
		review.batchCount !== 250 ||
		!Array.isArray(review.reviews) ||
		review.reviews.length !== 1_000 ||
		!Array.isArray(review.batches) ||
		review.batches.length !== 250
	) {
		throw new Error('Art review summary is incomplete.');
	}
	if (review.manifestSha256 !== canonicalHash(manifest)) {
		throw new Error('Art review was run against a different manifest.');
	}
	const assetInventory = manifest.specs.map((spec) => ({
		id: spec.id,
		darkSha256: hashRequiredAsset(spec.output.darkPath),
		lightSha256: hashRequiredAsset(spec.output.lightPath)
	}));
	if (review.assetInventorySha256 !== canonicalHash(assetInventory)) {
		throw new Error('Art review was run against different illustration bytes.');
	}
	const batchIds = new Set();
	const reviewedArtIds = new Set();
	const batchReviewRows = [];
	for (const batch of review.batches) {
		if (
			batch.status !== 'passed' ||
			batch.model !== 'gpt-5.6-sol' ||
			batch.thinkingLevel !== 'max' ||
			!Array.isArray(batch.ids) ||
			batch.ids.length !== 4 ||
			batchIds.has(batch.batchId)
		) {
			throw new Error('Art review batch lineage is malformed or duplicated.');
		}
		batchIds.add(batch.batchId);
		for (const id of batch.ids) {
			if (reviewedArtIds.has(id)) throw new Error(`Art review batch repeats ${id}.`);
			reviewedArtIds.add(id);
		}
		const inputPath = requiredBoundFile(batch.inputPath, batch.inputFileSha256, 'art review input');
		const input = JSON.parse(readFileSync(inputPath, 'utf8'));
		if (canonicalHash(input) !== batch.inputSha256) {
			throw new Error(`Art review input hash mismatch for ${batch.batchId}.`);
		}
		const resultPath = requiredBoundFile(batch.resultPath, null, 'art review result');
		const result = JSON.parse(readFileSync(resultPath, 'utf8'));
		if (
			canonicalHash(result) !== batch.resultSha256 ||
			result.provenance?.inputSha256 !== batch.inputSha256 ||
			result.provenance?.model !== batch.model ||
			result.provenance?.thinkingLevel !== batch.thinkingLevel
		) {
			throw new Error(`Art review result provenance mismatch for ${batch.batchId}.`);
		}
		const runSummaryPath = requiredBoundFile(batch.runSummaryPath, null, 'art review run summary');
		const runSummary = JSON.parse(readFileSync(runSummaryPath, 'utf8'));
		const eventLogPath = requiredBoundFile(
			batch.eventLogPath,
			batch.eventLogSha256,
			'art review event log'
		);
		const lastMessagePath = requiredBoundFile(
			batch.lastMessagePath,
			batch.lastMessageSha256,
			'art review last message'
		);
		if (
			canonicalHash(runSummary) !== batch.runSummarySha256 ||
			runSummary.model !== batch.model ||
			runSummary.thinkingLevel !== batch.thinkingLevel
		) {
			throw new Error(`Art review model run provenance mismatch for ${batch.batchId}.`);
		}
		requireScienceChallengeModelRunPolicy({
			summary: runSummary,
			eventLogBytes: readFileSync(eventLogPath),
			lastMessageBytes: readFileSync(lastMessagePath),
			expectedModel: 'gpt-5.6-sol',
			expectedThinkingLevel: 'max',
			policyLabel: `${batch.batchId} art review run`
		});
		batchReviewRows.push(...(result.reviews ?? []));
	}
	if (
		reviewedArtIds.size !== 1_000 ||
		canonicalHash(batchReviewRows) !== canonicalHash(review.reviews)
	) {
		throw new Error('Art review rows differ from their bound model batch results.');
	}
	for (const rowReview of review.reviews) {
		const validation = validateIndependentArtReviewRow(rowReview);
		if (validation.status !== 'passed') {
			throw new Error(
				`Art review hard gate failed for ${rowReview.id}: ${validation.issues.join(' ')}`
			);
		}
	}
	const acceptedIds = new Set(
		review.reviews.filter((entry) => entry.accepted === true).map((entry) => entry.id)
	);
	if (acceptedIds.size !== 1_000) throw new Error('Art review ids must be unique and accepted.');
	for (const spec of manifest.specs) {
		if (!acceptedIds.has(spec.id)) throw new Error(`Missing accepting art review for ${spec.id}.`);
	}
	return review;
}

function readAndRequirePerceptualAudit(relativePath, manifest, artReview) {
	const audit = readJson(relativePath);
	const assetInventory = manifest.specs.map((spec) => ({
		id: spec.id,
		darkSha256: hashRequiredAsset(spec.output.darkPath),
		lightSha256: hashRequiredAsset(spec.output.lightPath)
	}));
	if (artReview.assetInventorySha256 !== canonicalHash(assetInventory)) {
		throw new Error('Perceptual audit inputs differ from the independently reviewed images.');
	}
	const validation = validatePerceptualAudit(audit, {
		manifest,
		assetInventory,
		expectedRecordCount: 2_000
	});
	if (validation.status !== 'passed') {
		throw new Error(`Perceptual duplicate audit failed:\n${validation.issues.join('\n')}`);
	}
	const recomputed = buildPerceptualAudit(manifest, { rootDir });
	if (canonicalHash(recomputed) !== canonicalHash(audit)) {
		throw new Error(
			'Perceptual audit dHashes do not match a fresh computation from current files.'
		);
	}
	return audit;
}

function readAndRequireArtGenerationLineage(manifest, relativeRoot) {
	const workRoot = path.resolve(rootDir, relativeRoot);
	const expectedRoot = path.join(rootDir, 'tmp', 'science-challenges');
	if (!workRoot.startsWith(`${expectedRoot}${path.sep}`) || !existsSync(workRoot)) {
		throw new Error('Art generation work root is missing or outside tmp/science-challenges.');
	}
	const lineage = [];
	const replayedRepairReviews = new Set();
	for (const spec of manifest.specs) {
		const specDir = path.join(workRoot, spec.id);
		if (!existsSync(specDir))
			throw new Error(`Missing art generation job directory for ${spec.id}.`);
		const expectedSpecSha256 = canonicalHash(spec);
		const currentOutputs = {
			dark: {
				path: spec.output.darkPath,
				sha256: hashRequiredAsset(spec.output.darkPath),
				width: 960,
				height: 540
			},
			light: {
				path: spec.output.lightPath,
				sha256: hashRequiredAsset(spec.output.lightPath),
				width: 960,
				height: 540
			}
		};
		const jobPaths = readdirSync(specDir, { withFileTypes: true })
			.filter(
				(entry) =>
					entry.isFile() &&
					(entry.name === 'job.json' || /^repair-[a-f0-9]{12}-job\.json$/.test(entry.name))
			)
			.map((entry) => path.join(specDir, entry.name))
			.sort();
		const matchingJobs = [];
		for (const jobPath of jobPaths) {
			const job = JSON.parse(readFileSync(jobPath, 'utf8'));
			if (
				job.schemaVersion !== 'science-question-art-job/v1' ||
				job.id !== spec.id ||
				job.status !== 'passed' ||
				job.imageModel !== 'chatgpt-gpt-image-2' ||
				job.specSha256 !== expectedSpecSha256 ||
				canonicalHash(job.outputs) !== canonicalHash(currentOutputs) ||
				job.checks?.pair?.status !== 'passed' ||
				job.checks?.pair?.darkSha256 !== currentOutputs.dark.sha256 ||
				job.checks?.pair?.lightSha256 !== currentOutputs.light.sha256
			) {
				continue;
			}
			if (
				path.basename(jobPath).startsWith('repair-') &&
				!validOptionalHash(job.repairReviewSha256) &&
				!validOptionalHash(job.repairPerceptualAuditSha256)
			) {
				continue;
			}
			const repairEvidenceSha256 =
				job.repairReviewSha256 ?? job.repairPerceptualAuditSha256 ?? null;
			let repairEvidencePath = null;
			let repairEvidence = null;
			if (path.basename(jobPath).startsWith('repair-')) {
				repairEvidencePath = path.join(workRoot, `repair-evidence-${repairEvidenceSha256}.json`);
				if (!existsSync(repairEvidencePath)) {
					continue;
				}
				repairEvidence = JSON.parse(readFileSync(repairEvidencePath, 'utf8'));
				if (canonicalHash(repairEvidence) !== repairEvidenceSha256) continue;
				if (job.repairReviewSha256 && !replayedRepairReviews.has(job.repairReviewSha256)) {
					const replay = requireArtReviewEvidence({
						review: repairEvidence,
						manifest,
						rootDir,
						requiredStatus: 'failed',
						expectedCount: manifest.specs.length,
						useCurrentAssetBytes: false
					});
					if (replay.status !== 'passed') {
						throw new Error(`Historical repair review replay failed:\n${replay.issues.join('\n')}`);
					}
					replayedRepairReviews.add(job.repairReviewSha256);
				}
			}
			const generationArtifacts = requireArtGenerationJobEvidence({
				job,
				jobPath,
				spec,
				manifest,
				currentOutputs,
				rootDir,
				repairEvidence
			});
			matchingJobs.push({
				path: workspaceRelativeMaterializationPath(rootDir, jobPath, 'Art-generation job path'),
				sha256: canonicalHash(job),
				imageModel: job.imageModel,
				attempt: job.attempt,
				repairReviewSha256: job.repairReviewSha256 ?? null,
				repairPerceptualAuditSha256: job.repairPerceptualAuditSha256 ?? null,
				repairEvidencePath: repairEvidencePath
					? workspaceRelativeMaterializationPath(
							rootDir,
							repairEvidencePath,
							'Art repair-evidence path'
						)
					: null,
				finishedAt: job.finishedAt,
				generationArtifacts
			});
		}
		if (matchingJobs.length === 0) {
			throw new Error(`No required-model art job binds the current reviewed bytes for ${spec.id}.`);
		}
		lineage.push({
			id: spec.id,
			specSha256: expectedSpecSha256,
			outputs: currentOutputs,
			matchingJobs
		});
	}
	if (lineage.length !== 1_000 || new Set(lineage.map((item) => item.id)).size !== 1_000) {
		throw new Error('Art generation lineage must bind exactly 1,000 unique question contexts.');
	}
	return lineage;
}

function validOptionalHash(value) {
	return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function hashRequiredAsset(relativePath) {
	const filePath = path.resolve(rootDir, relativePath);
	if (!existsSync(filePath)) throw new Error(`Reviewed illustration is missing: ${relativePath}`);
	return sha256(readFileSync(filePath));
}

function materializedAt(planValue, override) {
	const value = override ?? `${planValue.createdOn}T00:00:00.000Z`;
	if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
		throw new Error('--materialized-at must be a valid ISO date-time.');
	}
	return new Date(value).toISOString();
}

function listMultipartPlanSalvageDirectories(shardDir) {
	return readdirSync(shardDir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				/^verification-repair-[a-f0-9]{12}-multipart-plan-salvage$/.test(entry.name)
		)
		.map((entry) => path.join(shardDir, entry.name))
		.sort();
}

function listMultipartContinuationDirectories(shardDir) {
	return readdirSync(shardDir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				/^verification-repair-[a-f0-9]{12}-attempt-04-multipart-continuation$/.test(entry.name)
		)
		.map((entry) => path.join(shardDir, entry.name))
		.sort();
}

function listDescendantRemapDirectories(shardDir) {
	if (!existsSync(shardDir)) return [];
	return readdirSync(shardDir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				/^verification-repair-[a-f0-9]{12}-descendant-remap$/.test(entry.name)
		)
		.map((entry) => path.join(shardDir, entry.name))
		.sort();
}

function listDifficultyPlanAdjustmentDirectories(shardDir) {
	if (!existsSync(shardDir)) return [];
	return readdirSync(shardDir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				/^verification-repair-[a-f0-9]{12}-difficulty-plan-adjustment$/u.test(entry.name)
		)
		.map((entry) => path.join(shardDir, entry.name))
		.sort();
}

function releaseRecoveryLineage(value) {
	if (Array.isArray(value)) return value.map(releaseRecoveryLineage);
	if (value === null || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value).map(([field, entry]) => {
			if (
				(field.endsWith('Path') || field === 'path') &&
				typeof entry === 'string' &&
				path.isAbsolute(entry)
			) {
				return [
					field,
					workspaceRelativeMaterializationPath(rootDir, entry, 'Exceptional-recovery lineage path')
				];
			}
			return [field, releaseRecoveryLineage(entry)];
		})
	);
}

function readDescendantRemapForMaterialization(directory) {
	const shardDir = path.dirname(directory);
	const shardId = path.basename(shardDir);
	const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
	const repairSha256 = manifest.repairSha256;
	const expectedDirectory = scienceChallengeDescendantRemapDirectory({
		shardDir,
		repairSha256
	});
	if (path.resolve(directory) !== path.resolve(expectedDirectory)) {
		throw new Error(`${shardId} descendant-remap directory is not objective-bound.`);
	}
	if (
		listMultipartPlanSalvageDirectories(shardDir).length > 0 ||
		listMultipartContinuationDirectories(shardDir).length > 0
	) {
		throw new Error(`${shardId} descendant remap cannot coexist with multipart recovery lineage.`);
	}
	const inputs = JSON.parse(readFileSync(path.join(shardDir, 'input.json'), 'utf8'));
	const rows = plan.rows.filter((row) => row.shard === shardId);
	const priorCandidate = JSON.parse(
		readFileSync(path.join(directory, 'prior-candidate.json'), 'utf8')
	);
	const priorValidation = JSON.parse(
		readFileSync(path.join(directory, 'prior-validation.json'), 'utf8')
	);
	const firstReviewSummary = JSON.parse(
		readFileSync(path.join(directory, 'first-review-summary.json'), 'utf8')
	);
	const firstReviewResult = JSON.parse(
		readFileSync(path.join(directory, 'first-review-result.json'), 'utf8')
	);
	const firstAssignment = JSON.parse(
		readFileSync(path.join(directory, 'first-assignment.json'), 'utf8')
	);
	const firstDispatchLedger = JSON.parse(
		readFileSync(path.join(directory, 'first-dispatch-ledger.json'), 'utf8')
	);
	const provenance = JSON.parse(readFileSync(path.join(directory, 'provenance.json'), 'utf8'));
	const inputSha256 = canonicalHash({
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
		inputs,
		priorCandidateSha256: canonicalHash(priorCandidate),
		verificationSummarySha256: repairSha256
	});
	const recovery = readScienceChallengeDescendantRemap({
		resume: true,
		shardId,
		shardDir,
		outputRoot: generationRoot,
		workspaceRoot: rootDir,
		repairSha256,
		expectedPlanSha256: canonicalHash(plan),
		expectedExecutionIdentity: provenance.executionIdentity,
		inputSha256,
		inputs,
		rows,
		plan,
		curriculumEvidence,
		curriculumCatalog,
		priorCandidate,
		priorValidation,
		firstReviewSummary,
		firstReviewResult,
		firstAssignment,
		dispatchLedger: firstDispatchLedger,
		validateBatchCandidate: (candidate, candidateRows, context) => {
			const validation = validateScienceChallengeGeneratedBatch(candidate, candidateRows, {
				sourceById,
				curriculumById,
				existingDefinitions: existingCatalog,
				planRows: plan.rows
			});
			return {
				...validation,
				candidateSha256: canonicalHash(candidate),
				planRowsSha256: canonicalHash(candidateRows),
				planSha256: canonicalHash(context.effectivePlan ?? context.basePlan),
				candidateCount: candidate?.challenges?.length ?? 0
			};
		},
		validateCollectionCandidate: (candidate, projectedPlan) =>
			validateDescendantRemapCollection({
				shardId,
				candidate,
				projectedPlan
			}),
		reconstructSourceEvidence: ({ attemptDirectory, summary }) => ({
			expectedPromptBytes: Buffer.from(
				`${reconstructScienceChallengeAuthoringAttemptPrompt({
					shardDir,
					attemptDirectory,
					rows,
					inputs,
					existingChallengeDefinitions: existingCatalog
				})}\n`
			),
			expectedPartPrompts: reconstructScienceChallengeMultipartAttemptParts({
				shardDir,
				attemptDirectory,
				rows,
				inputs,
				partSize: summary.partSize,
				existingChallengeDefinitions: existingCatalog,
				allPlanIds: plan.rows.map((row) => row.id)
			}).map((part) => part.prompt)
		})
	});
	if (recovery.status !== 'passed') {
		throw new Error(`${shardId} descendant-remap replay failed:\n${recovery.issues.join('\n')}`);
	}
	return recovery;
}

function readDifficultyPlanAdjustmentForMaterialization(directory) {
	const shardDir = path.dirname(directory);
	const shardId = path.basename(shardDir);
	const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
	const repairSha256 = manifest.repairSha256;
	const expectedDirectory = scienceChallengeDifficultyPlanAdjustmentDirectory({
		shardDir,
		repairSha256
	});
	if (path.resolve(directory) !== path.resolve(expectedDirectory)) {
		throw new Error(`${shardId} difficulty-plan adjustment directory is not objective-bound.`);
	}
	if (
		listMultipartPlanSalvageDirectories(shardDir).length > 0 ||
		listMultipartContinuationDirectories(shardDir).length > 0 ||
		listDescendantRemapDirectories(shardDir).length > 0
	) {
		throw new Error(
			`${shardId} difficulty-plan adjustment cannot coexist with competing recovery lineage.`
		);
	}
	const inputs = JSON.parse(readFileSync(path.join(shardDir, 'input.json'), 'utf8'));
	const rows = plan.rows.filter((row) => row.shard === shardId);
	const priorCandidate = JSON.parse(
		readFileSync(path.join(directory, 'prior-candidate.json'), 'utf8')
	);
	const priorValidation = JSON.parse(
		readFileSync(path.join(directory, 'prior-validation.json'), 'utf8')
	);
	const firstReviewSummary = JSON.parse(
		readFileSync(path.join(directory, 'first-review-summary.json'), 'utf8')
	);
	const firstReviewResult = JSON.parse(
		readFileSync(path.join(directory, 'first-review-result.json'), 'utf8')
	);
	const firstAssignment = JSON.parse(
		readFileSync(path.join(directory, 'first-assignment.json'), 'utf8')
	);
	const firstDispatchLedger = JSON.parse(
		readFileSync(path.join(directory, 'first-dispatch-ledger.json'), 'utf8')
	);
	const provenance = JSON.parse(readFileSync(path.join(directory, 'provenance.json'), 'utf8'));
	const inputSha256 = canonicalHash({
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
		inputs,
		priorCandidateSha256: canonicalHash(priorCandidate),
		verificationSummarySha256: repairSha256
	});
	const recovery = readScienceChallengeDifficultyPlanAdjustment({
		resume: true,
		shardId,
		shardDir,
		outputRoot: generationRoot,
		workspaceRoot: rootDir,
		repairSha256,
		expectedPlanSha256: canonicalHash(plan),
		expectedExecutionIdentity: provenance.executionIdentity,
		inputSha256,
		inputs,
		rows,
		plan,
		curriculumEvidence,
		priorCandidate,
		priorValidation,
		firstReviewSummary,
		firstReviewResult,
		firstAssignment,
		dispatchLedger: firstDispatchLedger,
		validateBatchCandidate: (candidate, candidateRows, context) => {
			const validation = validateScienceChallengeGeneratedBatch(candidate, candidateRows, {
				sourceById,
				curriculumById,
				existingDefinitions: existingCatalog,
				planRows: plan.rows
			});
			return {
				...validation,
				candidateSha256: canonicalHash(candidate),
				planRowsSha256: canonicalHash(candidateRows),
				planSha256: canonicalHash(context.effectivePlan ?? context.basePlan),
				candidateCount: candidate?.challenges?.length ?? 0
			};
		},
		reconstructSourceEvidence: ({ attemptDirectory, summary }) => ({
			expectedPromptBytes: Buffer.from(
				`${reconstructScienceChallengeAuthoringAttemptPrompt({
					shardDir,
					attemptDirectory,
					rows,
					inputs,
					existingChallengeDefinitions: existingCatalog
				})}\n`
			),
			expectedPartPrompts: reconstructScienceChallengeMultipartAttemptParts({
				shardDir,
				attemptDirectory,
				rows,
				inputs,
				partSize: summary.partSize,
				existingChallengeDefinitions: existingCatalog,
				allPlanIds: plan.rows.map((row) => row.id)
			}).map((part) => part.prompt)
		})
	});
	if (recovery.status !== 'passed') {
		throw new Error(
			`${shardId} difficulty-plan adjustment replay failed:\n${recovery.issues.join('\n')}`
		);
	}
	return recovery;
}

function validateDescendantRemapCollection({ shardId, candidate, projectedPlan }) {
	const entries = [];
	for (const candidateShardId of [...new Set(plan.rows.map((row) => row.shard))].sort()) {
		const batch =
			candidateShardId === shardId
				? candidate
				: (effectiveCohort?.candidateBatches.get(candidateShardId) ??
					JSON.parse(
						readFileSync(
							path.join(generationRoot, 'shards', candidateShardId, 'candidate.json'),
							'utf8'
						)
					));
		entries.push(...(batch.challenges ?? []));
	}
	const validation = validateGeneratedChallengeCollection(entries, {
		existingDefinitions: existingCatalog
	});
	const actualIds = entries.map((entry) => entry?.definition?.id);
	const expectedIds = projectedPlan.rows.map((row) => row.id);
	const structuralIssues = [];
	if (
		actualIds.length !== expectedIds.length ||
		new Set(actualIds).size !== expectedIds.length ||
		expectedIds.some((id) => !actualIds.includes(id))
	) {
		structuralIssues.push(
			`Complete candidate collection must contain exactly ${expectedIds.length} unique planned challenges.`
		);
	}
	const issues = [...structuralIssues, ...validation.issues];
	const candidateById = new Map(entries.map((entry) => [entry?.definition?.id, entry]));
	const candidateSet = projectedPlan.rows.map((row) => candidateById.get(row.id));
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		repairTargets: [],
		candidateSet,
		candidateCount: candidateSet.length,
		candidateSetSha256: canonicalHash(candidateSet),
		effectivePlanSha256: canonicalHash(projectedPlan)
	};
}

function requireMultipartContinuationLineage({
	shardId,
	shardDir,
	candidate,
	validation,
	inputs,
	rows,
	continuationDirectories
}) {
	const repairSha256 = validation.verificationRepairSha256;
	if (
		typeof repairSha256 !== 'string' ||
		!/^[a-f0-9]{64}$/.test(repairSha256) ||
		!repairGenerationEvidence.required ||
		!repairGenerationEvidence.identity ||
		repairGenerationEvidence.identity.verificationSha256 !== repairSha256
	) {
		throw new Error(
			`${shardId} multipart continuation is not bound to the generation repair objective.`
		);
	}
	const expectedContinuationDir = scienceChallengeMultipartContinuationDirectory({
		shardDir,
		repairSha256
	});
	if (
		continuationDirectories.length !== 1 ||
		path.resolve(continuationDirectories[0]) !== path.resolve(expectedContinuationDir)
	) {
		throw new Error(
			`${shardId} must contain exactly its objective-bound multipart continuation directory.`
		);
	}
	const repairDir = path.join(shardDir, `verification-repair-${repairSha256.slice(0, 12)}`);
	const verificationSummaryPath = path.join(repairDir, 'verification-summary.json');
	const priorCandidatePath = path.join(repairDir, 'prior-candidate.json');
	const priorValidationPath = path.join(repairDir, 'prior-validation.json');
	const continuationPlanPath = path.join(expectedContinuationDir, 'plan.json');
	for (const filePath of [
		verificationSummaryPath,
		priorCandidatePath,
		priorValidationPath,
		continuationPlanPath
	]) {
		if (!existsSync(filePath)) {
			throw new Error(`${shardId} multipart continuation evidence is missing: ${filePath}`);
		}
	}
	const verificationSummary = JSON.parse(readFileSync(verificationSummaryPath, 'utf8'));
	const priorCandidate = JSON.parse(readFileSync(priorCandidatePath, 'utf8'));
	const priorValidation = JSON.parse(readFileSync(priorValidationPath, 'utf8'));
	const continuationPlan = JSON.parse(readFileSync(continuationPlanPath, 'utf8'));
	const continuationExecutionIdentity = scienceChallengeVerificationRepairExecutionIdentity({
		planSha256: canonicalHash(plan),
		verificationSha256: repairSha256,
		priorCandidateSetSha256: verificationSummary.candidateSetSha256,
		model: validation.model,
		transport: validation.transport,
		responseMode: validation.responseMode,
		thinkingLevel: validation.thinkingLevel,
		directPartSize: validation.directPartSize
	});
	if (continuationExecutionIdentity.objectiveId !== repairGenerationEvidence.identity.objectiveId) {
		throw new Error(`${shardId} multipart continuation belongs to another repair objective.`);
	}
	const acceptance = validateScienceChallengeMultipartContinuationAcceptance({
		acceptedCandidate: candidate,
		acceptedValidation: validation,
		replayOptions: {
			resume: true,
			shardId,
			shardDir,
			outputRoot: generationRoot,
			workspaceRoot: rootDir,
			repairSha256,
			expectedPlanSha256: canonicalHash(plan),
			expectedExecutionIdentity: continuationExecutionIdentity,
			inputSha256: validation.inputSha256,
			inputs,
			rows,
			priorCandidate,
			priorValidation,
			reviews: verificationSummary.reviews,
			expectedReviewIds: plan.rows.map((row) => row.id),
			authMode: continuationPlan.invocationPolicy?.authMode,
			validateBatchCandidate: (replayedCandidate, replayedRows) =>
				validateMaterializedSalvageCandidate(replayedCandidate, replayedRows, inputs),
			validateCollectionCandidate: (replayedCandidate) =>
				validateMaterializedContinuationCollection(shardId, replayedCandidate),
			reconstructSourceEvidence: ({ attemptDirectory, summary }) => ({
				expectedPromptBytes: Buffer.from(
					`${reconstructScienceChallengeAuthoringAttemptPrompt({
						shardDir,
						attemptDirectory,
						rows,
						inputs,
						existingChallengeDefinitions: existingCatalog
					})}\n`
				),
				expectedPartPrompts: reconstructScienceChallengeMultipartAttemptParts({
					shardDir,
					attemptDirectory,
					rows,
					inputs,
					partSize: summary.partSize,
					existingChallengeDefinitions: existingCatalog,
					allPlanIds: plan.rows.map((row) => row.id)
				}).map((part) => part.prompt)
			})
		}
	});
	if (acceptance.status !== 'passed') {
		throw new Error(
			`${shardId} exhausted multipart continuation replay failed:\n${acceptance.issues.join('\n')}`
		);
	}
	return relativeMultipartContinuationLineage(acceptance.lineage, { rootDir });
}

function validateMaterializedContinuationCollection(shardId, candidateOverride) {
	const entries = [];
	const structuralIssues = [];
	for (const candidateShardId of [...new Set(plan.rows.map((row) => row.shard))].sort()) {
		let candidate = candidateShardId === shardId ? candidateOverride : null;
		if (!candidate) {
			const candidatePath = path.join(generationRoot, 'shards', candidateShardId, 'candidate.json');
			if (!existsSync(candidatePath)) {
				structuralIssues.push(
					`${candidateShardId}: candidate.json is missing from the complete cohort.`
				);
				continue;
			}
			try {
				candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
			} catch (error) {
				structuralIssues.push(
					`${candidateShardId}: candidate.json is not valid JSON: ${
						error instanceof Error ? error.message : String(error)
					}.`
				);
				continue;
			}
		}
		if (!Array.isArray(candidate?.challenges)) {
			structuralIssues.push(`${candidateShardId}: candidate batch has no challenges array.`);
			continue;
		}
		entries.push(...candidate.challenges);
	}
	const validation = validateGeneratedChallengeCollection(entries, {
		existingDefinitions: existingCatalog
	});
	const actualIds = entries.map((entry) => entry?.definition?.id);
	const expectedIds = plan.rows.map((row) => row.id);
	if (
		actualIds.length !== expectedIds.length ||
		new Set(actualIds).size !== expectedIds.length ||
		expectedIds.some((id) => !actualIds.includes(id))
	) {
		structuralIssues.push(
			`Complete candidate collection must contain exactly ${expectedIds.length} unique planned challenges.`
		);
	}
	const issues = [...structuralIssues, ...validation.issues];
	const issuesById = new Map();
	for (const issue of issues) {
		const challengeId = issue.match(/^([^:]+):/)?.[1];
		const row = plan.rows.find((candidateRow) => candidateRow.id === challengeId);
		if (!row) continue;
		const rowIssues = issuesById.get(challengeId) ?? [];
		rowIssues.push(issue);
		issuesById.set(challengeId, rowIssues);
	}
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		repairTargets: [...issuesById.entries()].map(([challengeId, targetIssues]) => ({
			challengeId,
			shardId: plan.rows.find((row) => row.id === challengeId).shard,
			issues: targetIssues
		}))
	};
}

function requireMultipartPlanSalvageLineage({
	shardId,
	shardDir,
	candidate,
	validation,
	inputs,
	rows,
	salvageDirectories
}) {
	const repairSha256 = validation.verificationRepairSha256;
	if (
		typeof repairSha256 !== 'string' ||
		!/^[a-f0-9]{64}$/.test(repairSha256) ||
		!repairGenerationEvidence.required ||
		!repairGenerationEvidence.identity ||
		repairGenerationEvidence.identity.verificationSha256 !== repairSha256
	) {
		throw new Error(
			`${shardId} plan-drift salvage is not bound to the generation repair objective.`
		);
	}
	const expectedSalvageDir = scienceChallengeMultipartPlanSalvageDirectory({
		shardDir,
		repairSha256
	});
	if (
		salvageDirectories.length !== 1 ||
		path.resolve(salvageDirectories[0]) !== path.resolve(expectedSalvageDir)
	) {
		throw new Error(
			`${shardId} must contain exactly its objective-bound multipart plan-drift salvage directory.`
		);
	}
	const repairDir = path.join(shardDir, `verification-repair-${repairSha256.slice(0, 12)}`);
	const verificationSummaryPath = path.join(repairDir, 'verification-summary.json');
	const priorCandidatePath = path.join(repairDir, 'prior-candidate.json');
	const priorValidationPath = path.join(repairDir, 'prior-validation.json');
	for (const filePath of [verificationSummaryPath, priorCandidatePath, priorValidationPath]) {
		if (!existsSync(filePath)) {
			throw new Error(`${shardId} plan-drift salvage repair snapshot is missing: ${filePath}`);
		}
	}
	const verificationSummary = JSON.parse(readFileSync(verificationSummaryPath, 'utf8'));
	const priorCandidate = JSON.parse(readFileSync(priorCandidatePath, 'utf8'));
	const priorValidation = JSON.parse(readFileSync(priorValidationPath, 'utf8'));
	const salvageExecutionIdentity = scienceChallengeVerificationRepairExecutionIdentity({
		planSha256: canonicalHash(plan),
		verificationSha256: repairSha256,
		priorCandidateSetSha256: verificationSummary.candidateSetSha256,
		model: validation.model,
		transport: validation.transport,
		responseMode: validation.responseMode ?? SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON,
		thinkingLevel: validation.thinkingLevel,
		directPartSize: validation.directPartSize
	});
	if (salvageExecutionIdentity.objectiveId !== repairGenerationEvidence.identity.objectiveId) {
		throw new Error(`${shardId} plan-drift salvage belongs to another repair objective.`);
	}
	const acceptance = validateScienceChallengeMultipartPlanSalvageAcceptance({
		acceptedCandidate: candidate,
		acceptedValidation: validation,
		replayOptions: {
			resume: true,
			shardId,
			shardDir,
			outputRoot: generationRoot,
			workspaceRoot: rootDir,
			repairSha256,
			expectedPlanSha256: canonicalHash(plan),
			expectedExecutionIdentity: salvageExecutionIdentity,
			inputSha256: validation.inputSha256,
			inputs,
			rows,
			priorCandidate,
			priorValidation,
			reviews: verificationSummary.reviews,
			expectedReviewIds: plan.rows.map((row) => row.id),
			validateBatchCandidate: (replayedCandidate, replayedRows) =>
				validateMaterializedSalvageCandidate(replayedCandidate, replayedRows, inputs),
			reconstructSourceEvidence: ({ attemptDirectory, summary }) => ({
				expectedPromptBytes: Buffer.from(
					`${reconstructScienceChallengeAuthoringAttemptPrompt({
						shardDir,
						attemptDirectory,
						rows,
						inputs,
						existingChallengeDefinitions: existingCatalog
					})}\n`
				),
				expectedPartPrompts: reconstructScienceChallengeMultipartAttemptParts({
					shardDir,
					attemptDirectory,
					rows,
					inputs,
					partSize: summary.partSize,
					existingChallengeDefinitions: existingCatalog,
					allPlanIds: plan.rows.map((row) => row.id)
				}).map((part) => part.prompt)
			})
		}
	});
	if (acceptance.status !== 'passed') {
		throw new Error(
			`${shardId} deterministic multipart plan-drift salvage replay failed:\n${acceptance.issues.join(
				'\n'
			)}`
		);
	}
	return relativeMultipartPlanSalvageLineage(acceptance.lineage, {
		rootDir,
		multipartLineageParts
	});
}

function validateMaterializedSalvageCandidate(candidate, rows, inputs) {
	const issues = [];
	if (!candidate || candidate.schemaVersion !== SCIENCE_CHALLENGE_BATCH_SCHEMA) {
		issues.push(`schemaVersion must be ${SCIENCE_CHALLENGE_BATCH_SCHEMA}.`);
	}
	if (!Array.isArray(candidate?.challenges) || candidate.challenges.length !== rows.length) {
		issues.push(`Batch must contain exactly ${rows.length} challenges.`);
		return { status: 'failed', issues };
	}
	const candidateIds = candidate.challenges.map((entry) => entry?.definition?.id);
	if (canonicalHash(candidateIds) !== canonicalHash(rows.map((row) => row.id))) {
		issues.push('Batch challenges must preserve the exact planned row order and membership.');
	}
	for (const [index, row] of rows.entries()) {
		const entry = candidate.challenges[index];
		if (entry?.definition?.id !== row.id) continue;
		const source = sourceById.get(row.calibrationQuestionId);
		const curriculum = curriculumById.get(row.curriculumComponentId);
		const result = validateGeneratedChallenge(entry, {
			planRow: row,
			sourceQuestion: { id: source.id, contentSha256: source.contentSha256 },
			curriculum: {
				id: curriculum.componentId,
				specificationId: curriculum.specificationId,
				specificationSha256: curriculum.specificationSha256
			}
		});
		for (const issue of result.issues) issues.push(`${row.id}: ${issue}`);
		const expected = inputs[index]?.plan?.expectedAnswerPositions;
		if (!expected) {
			issues.push(`${row.id}: authoring input has no expected answer positions.`);
			continue;
		}
		if (entry.definition.strongerAnswer !== expected.strongerAnswer) {
			issues.push(`${row.id}: strongerAnswer must be ${expected.strongerAnswer}.`);
		}
		for (const [field, expectedIndex] of [
			['diagnosisChoices', expected.diagnosisCorrectIndex],
			['repairChoices', expected.repairCorrectIndex],
			['transferChoices', expected.transferCorrectIndex]
		]) {
			if (entry.definition[field]?.findIndex((choice) => choice.correct) !== expectedIndex) {
				issues.push(
					`${row.id}: ${field} correct choice must be at zero-based index ${expectedIndex}.`
				);
			}
		}
	}
	const slugs = candidate.challenges.map(
		(entry) => `${entry.definition?.subject}/${entry.definition?.slug}`
	);
	if (new Set(slugs).size !== slugs.length) {
		issues.push('Route slugs must be unique within the batch.');
	}
	const artIds = candidate.challenges.flatMap((entry) => [
		entry.art?.opening?.id,
		entry.art?.transfer?.id
	]);
	if (new Set(artIds).size !== artIds.length) {
		issues.push('Every question context needs a unique art id.');
	}
	issues.push(
		...validateGeneratedChallengeCollection(candidate.challenges, {
			existingDefinitions: existingCatalog
		}).issues
	);
	return { status: issues.length ? 'failed' : 'passed', issues };
}

function listAttemptRunSummaries(
	shardDir,
	acceptedCandidate,
	acceptedValidation,
	{ inputs, rows, existingChallengeDefinitions, allPlanIds }
) {
	const summaries = [];
	const attemptDirectories = readdirSync(shardDir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				(/^attempt-\d{2}$/.test(entry.name) ||
					/^verification-repair-[a-f0-9]{12}-attempt-\d{2}$/.test(entry.name))
		)
		.map((entry) => entry.name)
		.sort();
	for (const attemptDirectory of attemptDirectories) {
		const runSummaryPath = path.join(shardDir, attemptDirectory, 'run-summary.json');
		const candidatePath = path.join(shardDir, attemptDirectory, 'candidate.json');
		const validationPath = path.join(shardDir, attemptDirectory, 'validation.json');
		const eventLogPath = path.join(shardDir, attemptDirectory, 'events.jsonl');
		const lastMessagePath = path.join(shardDir, attemptDirectory, 'last-message.json');
		const repairMatch = attemptDirectory.match(
			/^verification-repair-([a-f0-9]{12})-attempt-(\d{2})$/
		);
		const ordinaryMatch = attemptDirectory.match(/^attempt-(\d{2})$/);
		const attempt = Number(repairMatch?.[2] ?? ordinaryMatch?.[1]);
		const promptName = repairMatch
			? `verification-repair-${repairMatch[1]}-prompt-attempt-${attempt}.txt`
			: `prompt-attempt-${attempt}.txt`;
		const promptPath = path.join(shardDir, promptName);
		const basePaths = [
			runSummaryPath,
			candidatePath,
			validationPath,
			eventLogPath,
			lastMessagePath,
			promptPath
		];
		if (basePaths.some((filePath) => !existsSync(filePath))) continue;
		const summary = JSON.parse(readFileSync(runSummaryPath, 'utf8'));
		const directTransport = isScienceChallengeDirectSingleRunSummary(summary);
		const multipart = isScienceChallengeDirectMultipartRunSummary(summary);
		const responseMode = directResponseMode(summary);
		const providerSchemaApplied =
			directTransport || multipart
				? (summary.providerSchemaApplied ??
					responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON)
				: null;
		const validThinkingLevel =
			summary.thinkingLevel === STRUCTURED_OR_SDK_THINKING_LEVEL ||
			(responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
				summary.thinkingLevel === PROMPT_JSON_THINKING_LEVEL);
		if (!validThinkingLevel) continue;
		if (
			multipart &&
			summary.parts.some((record) => record?.thinkingLevel !== summary.thinkingLevel)
		) {
			continue;
		}
		const requestPath = directTransport
			? path.join(shardDir, attemptDirectory, 'request.json')
			: null;
		const thoughtsPath = directTransport
			? path.join(shardDir, attemptDirectory, 'thoughts.txt')
			: null;
		const resultMetadataPath = directTransport
			? path.join(shardDir, attemptDirectory, 'result-metadata.json')
			: null;
		if (
			directTransport &&
			[requestPath, thoughtsPath, resultMetadataPath].some(
				(filePath) => !filePath || !existsSync(filePath)
			)
		) {
			continue;
		}
		const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
		const validation = JSON.parse(readFileSync(validationPath, 'utf8'));
		if (validation.status !== 'passed') continue;
		const rawModelResponseBytes = readFileSync(lastMessagePath);
		const rawModelResponse = rawModelResponseBytes.toString('utf8');
		let rawModelCandidate;
		try {
			rawModelCandidate = JSON.parse(rawModelResponse);
		} catch {
			throw new Error(`${attemptDirectory} last model message is not valid JSON.`);
		}
		const eventBytes = readFileSync(eventLogPath);
		const multipartEvidence = multipart
			? readScienceChallengeDirectMultipartEvidence({
					attemptDir: path.join(shardDir, attemptDirectory),
					summary
				})
			: undefined;
		const expectedPartPrompts = multipart
			? reconstructScienceChallengeMultipartAttemptParts({
					shardDir,
					attemptDirectory,
					rows,
					inputs,
					partSize: summary.partSize,
					existingChallengeDefinitions,
					allPlanIds
				}).map((part) => part.prompt)
			: undefined;
		const attemptEvidence = validateScienceChallengeAuthoringAttemptEvidence({
			summary,
			eventLogBytes: eventBytes,
			lastMessageBytes: rawModelResponseBytes,
			promptBytes: readFileSync(promptPath),
			expectedPromptBytes: Buffer.from(
				`${reconstructScienceChallengeAuthoringAttemptPrompt({
					shardDir,
					attemptDirectory,
					rows,
					inputs,
					existingChallengeDefinitions
				})}\n`
			),
			...(directTransport
				? {
						requestBytes: readFileSync(requestPath),
						thoughtsBytes: readFileSync(thoughtsPath),
						resultMetadataBytes: readFileSync(resultMetadataPath)
					}
				: {}),
			multipartEvidence,
			expectedPartPrompts,
			inputs,
			candidate,
			validation,
			acceptedCandidate,
			acceptedValidation
		});
		if (attemptEvidence.status !== 'passed') {
			// Unsafe or internally inconsistent historical attempts are not release provenance.
			// The shard-level binding check still requires one qualifying attempt for accepted bytes.
			continue;
		}
		if (
			canonicalHash(normalizeGeneratedChallengeBatch(rawModelCandidate)) !==
				canonicalHash(candidate) ||
			validation.rawCandidateSha256 !== canonicalHash(rawModelCandidate) ||
			validation.normalizationVersion !== SCIENCE_CHALLENGE_NORMALIZATION_VERSION ||
			summary.finalResponseSha256 !== sha256(Buffer.from(rawModelResponse)) ||
			summary.lastMessageFileSha256 !== sha256(Buffer.from(rawModelResponse)) ||
			summary.eventLogSha256 !== sha256(eventBytes)
		) {
			throw new Error(`${attemptDirectory} does not bind its candidate to the raw model output.`);
		}
		let repairEvidence = null;
		if (repairMatch) {
			const repairDirectory = path.join(shardDir, `verification-repair-${repairMatch[1]}`);
			const verificationSummaryPath = path.join(repairDirectory, 'verification-summary.json');
			const priorCandidatePath = path.join(repairDirectory, 'prior-candidate.json');
			if (!existsSync(verificationSummaryPath) || !existsSync(priorCandidatePath)) {
				throw new Error(`Verification-repair lineage is incomplete for ${attemptDirectory}.`);
			}
			const verificationSummary = JSON.parse(readFileSync(verificationSummaryPath, 'utf8'));
			const priorCandidate = JSON.parse(readFileSync(priorCandidatePath, 'utf8'));
			const verificationSummarySha256 = canonicalHash(verificationSummary);
			const priorCandidateSha256 = canonicalHash(priorCandidate);
			if (
				!validOptionalHash(validation.verificationRepairSha256) ||
				validation.verificationRepairSha256 !== verificationSummarySha256 ||
				!validation.verificationRepairSha256.startsWith(repairMatch[1]) ||
				validation.verificationRepairSha256 !==
					repairGenerationEvidence.identity?.verificationSha256 ||
				!validOptionalHash(validation.priorCandidateSha256) ||
				validation.priorCandidateSha256 !== priorCandidateSha256
			) {
				throw new Error(`Verification-repair evidence does not bind ${attemptDirectory}.`);
			}
			repairEvidence = {
				verificationSummaryPath: workspaceRelativeMaterializationPath(
					rootDir,
					verificationSummaryPath,
					'Verification summary lineage path'
				),
				verificationSummarySha256,
				priorCandidatePath: workspaceRelativeMaterializationPath(
					rootDir,
					priorCandidatePath,
					'Prior candidate lineage path'
				),
				priorCandidateSha256
			};
		} else if (
			validation.verificationRepairSha256 !== null ||
			validation.priorCandidateSha256 !== null
		) {
			throw new Error(`${attemptDirectory} unexpectedly claims verification-repair evidence.`);
		}
		summaries.push({
			kind: repairMatch
				? 'independent-verification-repair'
				: attempt === 1
					? 'generation'
					: 'deterministic-repair',
			attempt,
			path: workspaceRelativeMaterializationPath(
				rootDir,
				runSummaryPath,
				'Run summary lineage path'
			),
			sha256: canonicalHash(summary),
			eventLogPath: workspaceRelativeMaterializationPath(
				rootDir,
				eventLogPath,
				'Event log lineage path'
			),
			eventLogSha256: sha256(eventBytes),
			lastMessagePath: workspaceRelativeMaterializationPath(
				rootDir,
				lastMessagePath,
				'Last message lineage path'
			),
			lastMessageSha256: sha256(Buffer.from(rawModelResponse)),
			promptPath: workspaceRelativeMaterializationPath(rootDir, promptPath, 'Prompt lineage path'),
			promptSha256: sha256(readFileSync(promptPath)),
			candidatePath: workspaceRelativeMaterializationPath(
				rootDir,
				candidatePath,
				'Candidate lineage path'
			),
			candidateSha256: canonicalHash(candidate),
			validationPath: workspaceRelativeMaterializationPath(
				rootDir,
				validationPath,
				'Validation lineage path'
			),
			validationSha256: canonicalHash(validation),
			validationStatus: validation.status,
			inputSha256: validation.inputSha256,
			rawCandidateSha256: validation.rawCandidateSha256,
			normalizationVersion: validation.normalizationVersion,
			model: summary.model,
			modelVersion: summary.modelVersion ?? null,
			provider: summary.provider ?? null,
			thinkingLevel: summary.thinkingLevel,
			transport: summary.transport ?? 'codex-sdk',
			transportVersion: summary.transportVersion ?? null,
			responseMode,
			providerSchemaApplied,
			modelVersions: multipart ? summary.modelVersions : null,
			directPartSize: multipart ? summary.partSize : null,
			rowIds: multipart ? summary.rowIds : null,
			requestPath: requestPath
				? workspaceRelativeMaterializationPath(rootDir, requestPath, 'Request lineage path')
				: null,
			requestSha256: requestPath ? sha256(readFileSync(requestPath)) : null,
			thoughtsPath: thoughtsPath
				? workspaceRelativeMaterializationPath(rootDir, thoughtsPath, 'Thoughts lineage path')
				: null,
			thoughtsSha256: thoughtsPath ? sha256(readFileSync(thoughtsPath)) : null,
			resultMetadataPath: resultMetadataPath
				? workspaceRelativeMaterializationPath(
						rootDir,
						resultMetadataPath,
						'Result metadata lineage path'
					)
				: null,
			resultMetadataSha256: resultMetadataPath ? sha256(readFileSync(resultMetadataPath)) : null,
			parts: multipart
				? multipartLineageParts({
						attemptDir: path.join(shardDir, attemptDirectory),
						partRecords: summary.parts,
						responseMode,
						providerSchemaApplied
					})
				: null,
			usage: summary.usage,
			durationSeconds: summary.durationSeconds,
			status: summary.status,
			toolFree: true,
			repairEvidence
		});
	}
	return summaries;
}

function multipartLineageParts({ attemptDir, partRecords, responseMode, providerSchemaApplied }) {
	return partRecords.map((record) => {
		const workspacePath = (relativePath) =>
			workspaceRelativeMaterializationPath(
				rootDir,
				path.join(attemptDir, relativePath),
				'Multipart attempt lineage path'
			);
		return {
			partId: record.partId,
			index: record.index,
			start: record.start,
			end: record.end,
			rowIds: record.rowIds,
			inputSha256: record.inputSha256,
			transportVersion: record.transportVersion ?? directSingleTransportVersion(responseMode),
			responseMode: record.responseMode ?? responseMode,
			providerSchemaApplied: record.providerSchemaApplied ?? providerSchemaApplied,
			responseSchemaSha256: record.responseSchemaSha256,
			promptPath: workspacePath(record.promptPath),
			promptSha256: record.promptSha256,
			requestPath: workspacePath(record.requestPath),
			requestSha256: record.requestSha256,
			eventLogPath: workspacePath(record.eventLogPath),
			eventLogSha256: record.eventLogSha256,
			rawOutputPath: workspacePath(record.rawOutputPath),
			rawOutputSha256: record.rawOutputSha256,
			rawCandidateSha256: record.rawCandidateSha256,
			thoughtsPath: workspacePath(record.thoughtsPath),
			thoughtsSha256: record.thoughtsSha256,
			resultMetadataPath: workspacePath(record.resultMetadataPath),
			resultMetadataSha256: record.resultMetadataSha256,
			runSummaryPath: workspacePath(record.runSummaryPath),
			runSummarySha256: record.runSummarySha256,
			status: record.status,
			provider: record.provider,
			model: record.model,
			modelVersion: record.modelVersion,
			thinkingLevel: record.thinkingLevel,
			usage: record.usage,
			costUsd: record.costUsd
		};
	});
}

function directResponseMode(summary) {
	if (
		!isScienceChallengeDirectSingleRunSummary(summary) &&
		!isScienceChallengeDirectMultipartRunSummary(summary)
	) {
		return null;
	}
	if (summary.responseMode !== undefined) return summary.responseMode;
	return SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON;
}

function directSingleTransportVersion(responseMode) {
	return responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
		? SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION
		: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION;
}

function requireReviewRebaseSourceLineage({
	shardId,
	candidate,
	validation,
	reviewRebaseEvidence
}) {
	if (reviewRebaseEvidence?.status !== 'passed') {
		throw new Error(`${shardId} requires replayed review-rebase source evidence.`);
	}
	const manifest = reviewRebaseEvidence.manifest;
	const coreManifest = reviewRebaseEvidence.coreManifest;
	const selection = coreManifest.selections.find((entry) => entry.shardId === shardId);
	const replayedSelection = reviewRebaseEvidence.selections.find(
		(entry) => entry.shardId === shardId
	);
	const outputCandidate = reviewRebaseEvidence.candidateBatches.get(shardId);
	const outputValidation = reviewRebaseEvidence.outputValidations.get(shardId);
	if (
		!selection ||
		!replayedSelection ||
		!outputCandidate ||
		!outputValidation ||
		selection.source.candidateSha256 !== replayedSelection.candidateSha256 ||
		selection.source.validationSha256 !== replayedSelection.validationSha256 ||
		canonicalHash(replayedSelection.candidate) !== selection.source.candidateSha256 ||
		canonicalHash(replayedSelection.validation) !== selection.source.validationSha256 ||
		outputValidation.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_VALIDATION_SCHEMA ||
		outputValidation.authoringDisposition !== SCIENCE_CHALLENGE_REVIEW_REBASE_DISPOSITION ||
		outputValidation.status !== 'passed' ||
		outputValidation.contentStatus !== 'review-pending' ||
		outputValidation.releaseEligible !== false ||
		outputValidation.rebaseId !== coreManifest.rebaseId ||
		outputValidation.sourceCandidateSha256 !== selection.source.candidateSha256 ||
		outputValidation.sourceValidationSha256 !== selection.source.validationSha256 ||
		outputValidation.candidateSha256 !== canonicalHash(outputCandidate) ||
		selection.candidateSha256 !== canonicalHash(outputCandidate) ||
		selection.validationSha256 !== canonicalHash(outputValidation) ||
		canonicalHash(candidate) !== canonicalHash(outputCandidate) ||
		canonicalHash(validation) !== canonicalHash(outputValidation)
	) {
		throw new Error(`${shardId} differs from its exact review-rebase selection or output bytes.`);
	}

	const sourceValidations = [
		reviewRebaseSourceValidation({
			shardId,
			challengeId: null,
			candidatePath: replayedSelection.candidatePath,
			candidateSha256: replayedSelection.candidateSha256,
			candidate: replayedSelection.candidate,
			validationPath: replayedSelection.validationPath,
			validationSha256: replayedSelection.validationSha256,
			validation: replayedSelection.validation
		})
	];
	const replayedOverridesById = new Map(
		(replayedSelection.rowOverrides ?? []).map((entry) => [entry.challengeId, entry])
	);
	for (const rowOverride of selection.rowOverrides ?? []) {
		const replayedOverride = replayedOverridesById.get(rowOverride.challengeId);
		if (
			!replayedOverride ||
			rowOverride.source.candidatePath !== replayedOverride.candidatePath ||
			rowOverride.source.candidateSha256 !== replayedOverride.candidateSha256 ||
			rowOverride.source.validationPath !== replayedOverride.validationPath ||
			rowOverride.source.validationSha256 !== replayedOverride.validationSha256
		) {
			throw new Error(
				`${shardId} row override ${rowOverride.challengeId} differs from its replayed source.`
			);
		}
		sourceValidations.push(
			reviewRebaseSourceValidation({
				shardId,
				challengeId: rowOverride.challengeId,
				candidatePath: replayedOverride.candidatePath,
				candidateSha256: replayedOverride.candidateSha256,
				candidate: replayedOverride.candidate,
				validationPath: replayedOverride.validationPath,
				validationSha256: replayedOverride.validationSha256,
				validation: replayedOverride.validation
			})
		);
	}
	if (
		sourceValidations.length !== 1 + (replayedSelection.rowOverrides?.length ?? 0) ||
		new Set(sourceValidations.map((entry) => entry.challengeId)).size !== sourceValidations.length
	) {
		throw new Error(`${shardId} review-rebase source validations are incomplete or duplicated.`);
	}
	return {
		kind: 'review-rebase-selection',
		reviewRebaseManifestSha256: canonicalHash(manifest),
		reviewRebaseId: coreManifest.rebaseId,
		shardId,
		selectionSha256: canonicalHash(selection),
		sourceCandidateSha256: selection.source.candidateSha256,
		sourceValidationSha256: selection.source.validationSha256,
		rowOverrideSetSha256: selection.rowOverrideSetSha256,
		mutationSetSha256: selection.mutationSetSha256,
		outputCandidateSha256: canonicalHash(outputCandidate),
		outputValidationSha256: canonicalHash(outputValidation),
		parentVerificationSha256: coreManifest.parent.verificationSha256,
		parentRepairSha256: coreManifest.parent.repairSha256,
		sourceValidations
	};
}

function reviewRebaseSourceValidation({
	shardId,
	challengeId,
	candidatePath,
	candidateSha256,
	candidate,
	validationPath,
	validationSha256,
	validation
}) {
	const thinkingLevel =
		validation?.thinkingLevel ??
		validation?.provenance?.executionIdentity?.thinkingLevel ??
		validation?.verificationRepairExecutionIdentity?.thinkingLevel;
	if (
		!candidatePath ||
		!validationPath ||
		canonicalHash(candidate) !== candidateSha256 ||
		canonicalHash(validation) !== validationSha256 ||
		validation?.candidateSha256 !== candidateSha256 ||
		!['high', 'max'].includes(thinkingLevel)
	) {
		throw new Error(
			`${shardId} review-rebase source validation ${
				challengeId ?? 'base selection'
			} is stale or lacks high/max thinking evidence.`
		);
	}
	return {
		challengeId,
		candidatePath,
		candidateSha256,
		validationPath,
		validationSha256,
		thinkingLevel
	};
}

function readJson(relativePath) {
	const absolute = path.resolve(rootDir, relativePath);
	if (!existsSync(absolute)) throw new Error(`Required JSON does not exist: ${absolute}`);
	return JSON.parse(readFileSync(absolute, 'utf8'));
}

function resolveRepositoryRelativePath(relativePath, label) {
	if (
		typeof relativePath !== 'string' ||
		!relativePath.trim() ||
		path.isAbsolute(relativePath) ||
		relativePath.includes('\\') ||
		relativePath.includes('\0') ||
		path.posix.normalize(relativePath) !== relativePath ||
		relativePath === '..' ||
		relativePath.startsWith('../')
	) {
		throw new Error(`${label} path must be safe and repository-relative.`);
	}
	const absolute = path.resolve(rootDir, ...relativePath.split('/'));
	if (absolute === rootDir || !absolute.startsWith(`${rootDir}${path.sep}`)) {
		throw new Error(`${label} path escapes the repository.`);
	}
	return absolute;
}

function readBoundJsonForCopy(relativePath, expectedHash, label, { rawHash = false } = {}) {
	const absolute = requiredBoundFile(relativePath, rawHash ? expectedHash : null, label);
	const bytes = readFileSync(absolute);
	const value = JSON.parse(bytes.toString('utf8'));
	const actualHash = rawHash ? sha256(bytes) : canonicalHash(value);
	if (actualHash !== expectedHash) {
		throw new Error(`${label} differs from its recorded hash: ${relativePath}`);
	}
	return value;
}

function validateCompletedReleaseTree({
	releaseRoot,
	release,
	artManifest,
	artDelivery,
	runtime,
	shortRecallPrompts,
	shortRecallAuthoringEvidence,
	shortRecallReviewEvidence,
	coverage,
	contentVerification,
	verifierDispatchLedger,
	artReview,
	artPerceptualAudit,
	provenanceBindings,
	curriculumRemapDurableReceipt,
	curriculumRemapVerifierInput,
	difficultyPlanAdjustmentVerifierInput
}) {
	const expected = new Map();
	const bind = (relativePath, value, expectedHash = canonicalHash(value)) => {
		expected.set(relativePath, expectedHash);
	};
	bind('accepted-challenges.json', release);
	bind('art-manifest.json', artManifest);
	bind('coverage.json', coverage);
	if (artDelivery) bind('art-delivery-manifest.json', artDelivery);
	if (runtime) bind('runtime.json', runtime, release.release.runtimeSha256);
	if (shortRecallPrompts) {
		bind('short-recall-prompts.json', shortRecallPrompts, release.release.shortRecallBundleSha256);
	}
	if (shortRecallAuthoringEvidence) {
		bind(
			'short-recall-authoring-evidence.json',
			shortRecallAuthoringEvidence,
			shortRecallReviewEvidence.authoringEvidenceSha256
		);
	}
	if (shortRecallReviewEvidence) {
		bind(
			'short-recall-review-evidence.json',
			shortRecallReviewEvidence,
			release.release.shortRecallReviewSha256
		);
	}
	if (contentVerification) bind('content-verification.json', contentVerification);
	if (verifierDispatchLedger) bind('verifier-dispatch-ledger.json', verifierDispatchLedger);
	if (artReview) bind('art-review.json', artReview);
	if (artPerceptualAudit) bind('art-perceptual-audit.json', artPerceptualAudit);
	if (curriculumRemapDurableReceipt) {
		bind('curriculum-remap-durable-receipt.json', curriculumRemapDurableReceipt);
	}
	if (curriculumRemapVerifierInput) {
		bind('curriculum-remap-verifier-input.json', curriculumRemapVerifierInput);
	}
	if (difficultyPlanAdjustmentVerifierInput) {
		bind('difficulty-plan-adjustment-verifier-input.json', difficultyPlanAdjustmentVerifierInput);
	}
	for (const result of contentVerification?.assignmentResults ?? []) {
		bind(`content-verification-assignments/${result.assignmentId}.json`, null, result.sha256);
	}
	for (const batch of artReview?.batches ?? []) {
		const prefix = `art-review-batches/${batch.batchId}`;
		bind(`${prefix}/review-input.json`, null, batch.inputSha256);
		bind(`${prefix}/review-request.json`, null, batch.requestSha256);
		bind(`${prefix}/result.json`, null, batch.resultSha256);
		bind(`${prefix}/run-summary.json`, null, batch.runSummarySha256);
	}

	const actual = listReleaseFiles(releaseRoot).filter(
		(relativePath) =>
			relativePath !== 'provenance/manifest.json' && !relativePath.startsWith('provenance/')
	);
	if (
		actual.length !== expected.size ||
		actual.some((relativePath) => !expected.has(relativePath))
	) {
		throw new Error('Completed release staging tree contains missing or unexpected files.');
	}
	for (const [relativePath, expectedHash] of expected) {
		const filePath = path.join(releaseRoot, relativePath);
		const value = JSON.parse(readFileSync(filePath, 'utf8'));
		if (canonicalHash(value) !== expectedHash) {
			throw new Error(`Completed release file differs from its binding: ${relativePath}`);
		}
	}
	if (provenanceBindings) {
		const provenanceValidation = validateScienceChallengeProvenanceArchive({
			archiveRoot: path.join(releaseRoot, 'provenance'),
			expectedBindings: provenanceBindings
		});
		if (provenanceValidation.status !== 'passed') {
			throw new Error(
				`Completed release provenance validation failed:\n${provenanceValidation.issues.join('\n')}`
			);
		}
		if (
			canonicalHash(provenanceValidation.manifest) !== release.release.provenanceArchiveSha256 ||
			provenanceValidation.manifest?.releaseId !== release.release.id ||
			provenanceValidation.manifest?.materializedAt !== release.release.materializedAt
		) {
			throw new Error('Completed release does not bind its final provenance archive manifest.');
		}
	}
}

function listReleaseFiles(directory, prefix = '') {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isSymbolicLink()) {
			throw new Error(`Completed release staging tree contains a symlink: ${relativePath}`);
		}
		if (entry.isDirectory()) {
			files.push(...listReleaseFiles(path.join(directory, entry.name), relativePath));
		} else if (entry.isFile()) {
			files.push(relativePath);
		} else {
			throw new Error(`Completed release staging tree contains a non-file entry: ${relativePath}`);
		}
	}
	return files.sort();
}

function requiredBoundFile(relativePath, expectedRawSha256, label) {
	const absolute = path.resolve(rootDir, relativePath);
	if (!absolute.startsWith(`${rootDir}${path.sep}`) || !existsSync(absolute)) {
		throw new Error(`${label} is missing or outside the workspace: ${relativePath}`);
	}
	if (expectedRawSha256 && sha256(readFileSync(absolute)) !== expectedRawSha256) {
		throw new Error(`${label} bytes differ from their recorded hash: ${relativePath}`);
	}
	return absolute;
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	const temporaryPath = `${filePath}.${process.pid}.tmp`;
	writeFileSync(temporaryPath, `${stableStringify(value)}\n`);
	renameSync(temporaryPath, filePath);
}

function truncate(value, maximum) {
	if (value.length <= maximum) return value;
	return `${value.slice(0, maximum - 1).trimEnd()}…`;
}

function parseArgs(argv) {
	const values = new Map();
	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') {
			if (values.has('help')) throw new Error('Duplicate --help option.');
			values.set('help', true);
		} else if (arg.startsWith('--') && arg.includes('=')) {
			const [key, ...rest] = arg.slice(2).split('=');
			if (
				![
					'mode',
					'plan',
					'source',
					'evidence',
					'generation-root',
					'review-rebase-manifest',
					'candidate-output',
					'content-review',
					'verifier-dispatch-ledger',
					'verification-assignment-index',
					'art-review',
					'art-generation-root',
					'art-perceptual-audit',
					'short-recall-candidate',
					'short-recall-bundle',
					'short-recall-authoring-evidence',
					'short-recall-review',
					'materialized-at'
				].includes(key)
			) {
				throw new Error(`Unknown option --${key}.`);
			}
			if (values.has(key)) throw new Error(`Duplicate --${key} option.`);
			const value = rest.join('=');
			if (!value) throw new Error(`--${key} requires a non-empty value.`);
			values.set(key, value);
		} else if (arg.startsWith('-')) {
			throw new Error(`Unknown option ${arg}.`);
		} else {
			throw new Error(`Unexpected positional argument ${arg}.`);
		}
	}
	const mode = String(values.get('mode') ?? 'candidate');
	if (!['candidate', 'release'].includes(mode))
		throw new Error('--mode must be candidate or release.');
	return {
		help: Boolean(values.get('help')),
		mode,
		plan: String(values.get('plan') ?? 'tmp/science-challenges/science-500-v1/plan.json'),
		source: String(values.get('source') ?? 'tmp/science-challenge-sources-v1.json'),
		evidence: String(
			values.get('evidence') ?? 'tmp/science-challenges/science-500-v1/curriculum-evidence.json'
		),
		generationRoot: String(
			values.get('generation-root') ?? 'tmp/science-challenges/science-500-v1/generation'
		),
		reviewRebaseManifest: values.has('review-rebase-manifest')
			? String(values.get('review-rebase-manifest'))
			: null,
		candidateOutput: String(
			values.get('candidate-output') ?? 'tmp/science-challenges/science-500-v1/compiled'
		),
		contentReview: String(
			values.get('content-review') ??
				'tmp/science-challenges/science-500-v1/verification/summary.json'
		),
		verifierDispatchLedger: String(
			values.get('verifier-dispatch-ledger') ??
				'tmp/science-challenges/science-500-v1/verification/dispatch-ledger.json'
		),
		verificationAssignmentIndex: String(
			values.get('verification-assignment-index') ??
				'tmp/science-challenges/science-500-v1/verification/assignment-index.json'
		),
		artReview: String(
			values.get('art-review') ??
				'tmp/science-challenges/science-500-v1/art-review/review-summary.json'
		),
		artGenerationRoot: String(
			values.get('art-generation-root') ?? 'tmp/science-challenges/science-500-v1/art-generation'
		),
		artPerceptualAudit: String(
			values.get('art-perceptual-audit') ??
				'tmp/science-challenges/science-500-v1/art-review/perceptual-audit.json'
		),
		shortRecallCandidate: String(
			values.get('short-recall-candidate') ??
				'tmp/science-challenges/science-500-v1/compiled/accepted-challenges.json'
		),
		shortRecallBundle: String(
			values.get('short-recall-bundle') ??
				'tmp/science-challenges/science-500-v1/short-recall/review-v1/short-recall-prompts.json'
		),
		shortRecallAuthoringEvidence: String(
			values.get('short-recall-authoring-evidence') ??
				'tmp/science-challenges/science-500-v1/short-recall/authoring-v1/authoring-evidence.json'
		),
		shortRecallReview: String(
			values.get('short-recall-review') ??
				'tmp/science-challenges/science-500-v1/short-recall/review-v1/review-evidence.json'
		),
		materializedAt: values.has('materialized-at') ? String(values.get('materialized-at')) : null
	};
}

function usage() {
	return [
		'Usage: node scripts/materialize-science-challenge-release.mjs [options]',
		'',
		'--mode=candidate|release',
		'--plan=<plan.json>',
		'--source=<source-snapshot.json>',
		'--evidence=<curriculum-evidence.json>',
		'--generation-root=<directory>',
		'--review-rebase-manifest=<repo-relative review-rebase manifest.json>',
		'--candidate-output=<fresh-absent-directory>',
		'--content-review=<summary.json>  Required in release mode',
		'--verifier-dispatch-ledger=<ledger.json>  Required in release mode',
		'--verification-assignment-index=<index.json>  Required in release mode',
		'--art-review=<summary.json>      Required in release mode',
		'--art-generation-root=<directory>  Required in release mode',
		'--art-perceptual-audit=<audit.json>  Required in release mode',
		'--short-recall-candidate=<json>  Exact candidate artifact reviewed by the recall pipeline',
		'--short-recall-bundle=<json>  Reviewed 408-row prompt bundle; required in release mode',
		'--short-recall-authoring-evidence=<json>  Exact passed authoring evidence',
		'--short-recall-review=<json>  Independent 408/408 review evidence; required in release mode',
		'--materialized-at=<ISO>         Optional reproducible release timestamp; defaults to plan date'
	].join('\n');
}
