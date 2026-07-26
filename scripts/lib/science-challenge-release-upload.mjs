import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import {
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY,
	validateScienceChallengeCurriculumRemapDurableReceipt
} from './science-challenge-curriculum-remap-durable.mjs';
import {
	readScienceChallengeEffectiveCohort,
	validateScienceChallengeReviewRebaseSuccessorLineage
} from './science-challenge-effective-cohort.mjs';
import { canonicalHash, sha256 } from './science-challenge-release.mjs';
import { readScienceChallengeReviewRebaseEvidence } from './science-challenge-review-rebase-evidence.mjs';
import {
	buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding,
	inspectScienceChallengeReviewRebaseInfrastructureRecovery,
	inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal,
	validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding
} from './science-challenge-review-rebase-infra-recovery.mjs';
import {
	readScienceChallengeShortRecallCandidateSet,
	validateAcceptedScienceChallengeShortRecallArtifacts,
	validateScienceChallengeShortRecallReviewEvidence
} from './science-challenge-short-recall.mjs';

const HASH = /^[a-f0-9]{64}$/u;
const SHORT_RECALL_PROMPTS_FILE = 'short-recall-prompts.json';
const SHORT_RECALL_REVIEW_FILE = 'short-recall-review-evidence.json';
const SHORT_RECALL_AUTHORING_FILE = 'short-recall-authoring-evidence.json';
const BASE_PLAN_PATH = 'plans/base-plan.json';
const EFFECTIVE_PLAN_PATH = 'plans/effective-plan.json';
const CONTENT_REVIEW_PATH = 'reviews/content/summary.json';
const SOURCE_HASH_INDEX_PATH = 'indices/source-hashes.json';
const CURRICULUM_HASH_INDEX_PATH = 'indices/curriculum-hashes.json';
const DURABLE_RECEIPT_PATH = 'content/curriculum-remap/durable-receipt.json';
const EFFECTIVE_COHORT_ROOT = 'content/effective-cohort';
const EFFECTIVE_COHORT_INDEX_PATH = 'content/effective-cohort-index.json';
const EFFECTIVE_COHORT_INDEX_SCHEMA = 'science-challenge-effective-cohort-provenance-index/v1';
const PARENT_CHAIN_INDEX_PATH = 'content/parent-chain/index.json';
const PARENT_CHAIN_INDEX_SCHEMA = 'science-challenge-content-parent-chain-provenance-index/v1';
const PARENT_CHAIN_REFERENCE_ROOT = 'content/parent-chain/repository';
const INFRASTRUCTURE_RECOVERY_INDEX_PATH = 'content/infrastructure-recovery/index.json';
const INFRASTRUCTURE_RECOVERY_INDEX_SCHEMA =
	'science-challenge-review-rebase-infrastructure-recovery-provenance-index/v1';
const INFRASTRUCTURE_RECOVERY_REFERENCE_ROOT = 'content/infrastructure-recovery/repository';
const REVIEW_REBASE_MANIFEST_SCHEMA = 'science-challenge-review-rebase-manifest/v1';
const REVIEW_REBASE_DISPOSITION = 'deterministic-parent-bound-review-rebase';
const REVIEW_REBASE_SUCCESSOR_KIND = 'review-rebase-successor';
const EFFECTIVE_COHORT_BINDING_FIELDS = Object.freeze([
	'effectiveCohortManifestSha256',
	'effectiveCohortCandidateSetSha256'
]);
const TYPED_REMAP_BINDING_FIELDS = Object.freeze([
	'curriculumRemapDurableReceiptSha256',
	'curriculumRemapVerifierInputSha256',
	'curriculumRemapDecisionSetSha256',
	'descendantRemapManifestSetSha256'
]);
const DIFFICULTY_ADJUSTMENT_BINDING_FIELDS = Object.freeze([
	'difficultyPlanAdjustmentVerifierInputSha256',
	'difficultyAdjustmentManifestSetSha256',
	'difficultyPlanAdjustmentDecisionSetSha256'
]);
const REVIEW_REBASE_BINDING_FIELDS = Object.freeze(['contentParentLineageSha256']);
const REVIEW_REBASE_PARENT_CHAIN_FIELDS = Object.freeze([
	'kind',
	'reviewRebaseManifestSha256',
	'reviewRebaseId',
	'parentVerificationSha256',
	'parentRepairSha256',
	'reviewRebasePlanSha256',
	'reviewRebaseCandidateSetSha256',
	'reviewRebaseCollectionValidationSha256',
	'reviewRebaseCollectionRemediationSetSha256',
	'reviewRebaseCollectionRemediationTargetSetSha256',
	'firstVerificationSha256',
	'mutableTargetSetSha256',
	'successorObjectiveId',
	'successorExecutionId'
]);

/**
 * Read and replay the immutable short-recall files placed beside accepted-challenges.json.
 *
 * Paths are intentionally not configurable: upload authorization must use the exact release
 * siblings written before the accepted release marker.
 */
export function readScienceChallengeReleaseShortRecallUploadEvidence({
	acceptedReleasePath,
	release
}) {
	const issues = [];
	if (typeof acceptedReleasePath !== 'string' || !acceptedReleasePath) {
		return failed(['acceptedReleasePath must identify accepted-challenges.json.']);
	}
	const releaseRoot = path.dirname(path.resolve(acceptedReleasePath));
	const promptFile = readRequiredSiblingJson({
		releaseRoot,
		fileName: SHORT_RECALL_PROMPTS_FILE,
		label: 'Short-recall prompt bundle',
		issues
	});
	const reviewFile = readRequiredSiblingJson({
		releaseRoot,
		fileName: SHORT_RECALL_REVIEW_FILE,
		label: 'Short-recall review evidence',
		issues
	});
	const authoringFile = readRequiredSiblingJson({
		releaseRoot,
		fileName: SHORT_RECALL_AUTHORING_FILE,
		label: 'Short-recall authoring evidence',
		issues
	});
	if (issues.length) return failed(issues);

	const validation = validateScienceChallengeReleaseShortRecallUploadEvidence({
		release,
		prompts: promptFile.value,
		reviewEvidence: reviewFile.value,
		authoringEvidence: authoringFile.value
	});
	return {
		...validation,
		files: {
			prompts: promptFile,
			reviewEvidence: reviewFile,
			authoringEvidence: authoringFile
		}
	};
}

/**
 * Bind the reviewed prompt bundle to the exact ordered challenges in the accepted release.
 *
 * The authoring run can predate accepted-release materialization, so its source-artifact hash may
 * identify the earlier candidate JSON rather than accepted-challenges.json. The accepted review
 * binds that hash, while every candidate row and the candidate-set hash are replayed from
 * release.challenges here.
 */
export function validateScienceChallengeReleaseShortRecallUploadEvidence({
	release,
	prompts,
	reviewEvidence,
	authoringEvidence
}) {
	const issues = [];
	if (!isRecord(release) || !isRecord(release.release) || !Array.isArray(release.challenges)) {
		return failed(['release must contain release metadata and an ordered challenge array.']);
	}

	const metadata = release.release;
	const expectedCount = release.challenges.length;
	const bundleSha256 = canonicalHash(prompts);
	const reviewSha256 = canonicalHash(reviewEvidence);
	const authoringEvidenceSha256 = canonicalHash(authoringEvidence);
	if (metadata.shortRecallBundleSha256 !== bundleSha256) {
		issues.push('Short-recall prompt bundle differs from release.shortRecallBundleSha256.');
	}
	if (metadata.shortRecallReviewSha256 !== reviewSha256) {
		issues.push('Short-recall review evidence differs from release.shortRecallReviewSha256.');
	}
	if (reviewEvidence?.authoringEvidenceSha256 !== authoringEvidenceSha256) {
		issues.push('Short-recall review evidence does not bind the exact sibling authoring evidence.');
	}
	if (
		metadata.shortRecallAuthoringEvidenceSha256 !== null &&
		metadata.shortRecallAuthoringEvidenceSha256 !== undefined &&
		metadata.shortRecallAuthoringEvidenceSha256 !== authoringEvidenceSha256
	) {
		issues.push(
			'Short-recall authoring evidence differs from release.shortRecallAuthoringEvidenceSha256.'
		);
	}

	let candidateSet;
	try {
		candidateSet = readScienceChallengeShortRecallCandidateSet(release.challenges, {
			expectedCount
		});
	} catch (error) {
		issues.push(errorMessage(error));
		return {
			status: 'failed',
			issues,
			bundleSha256,
			reviewSha256,
			authoringEvidenceSha256,
			candidateSet: null,
			promptSetSha256: null
		};
	}

	if (
		metadata.shortRecallCandidateSetSha256 !== null &&
		metadata.shortRecallCandidateSetSha256 !== undefined &&
		metadata.shortRecallCandidateSetSha256 !== candidateSet.candidateSetSha256
	) {
		issues.push('Accepted release challenges differ from release.shortRecallCandidateSetSha256.');
	}
	const candidateArtifactSha256 = reviewEvidence?.candidateArtifactSha256;
	if (!HASH.test(String(candidateArtifactSha256 ?? ''))) {
		issues.push('Short-recall review evidence has no valid candidate-artifact binding.');
	}
	if (
		metadata.shortRecallCandidateArtifactSha256 !== null &&
		metadata.shortRecallCandidateArtifactSha256 !== undefined &&
		metadata.shortRecallCandidateArtifactSha256 !== candidateArtifactSha256
	) {
		issues.push(
			'Short-recall review evidence differs from release.shortRecallCandidateArtifactSha256.'
		);
	}

	let replay;
	if (candidateArtifactSha256 === candidateSet.sourceArtifactSha256) {
		replay = validateAcceptedScienceChallengeShortRecallArtifacts({
			candidateEntries: release.challenges,
			prompts,
			authoringEvidence,
			reviewEvidence,
			expectedCount
		});
	} else {
		replay = validateScienceChallengeShortRecallReviewEvidence({
			reviewEvidence,
			authoringEvidence,
			candidateSet: {
				...candidateSet,
				sourceArtifactSha256: candidateArtifactSha256
			},
			prompts,
			expectedCount,
			requirePassed: true
		});
	}
	issues.push(...replay.issues);

	return {
		status: issues.length === 0 ? 'passed' : 'failed',
		issues,
		bundleSha256,
		reviewSha256,
		authoringEvidenceSha256,
		candidateSet,
		promptSetSha256: replay.promptSetSha256
	};
}

/**
 * Replay only release-upload evidence retained inside the immutable provenance archive.
 *
 * This deliberately does not reopen generation, curriculum, assignment or review source roots.
 * Those roots may be removed after the provenance archive has been materialized and validated.
 */
export function validateScienceChallengeReleaseUploadEvidence({
	archiveRoot,
	provenanceManifest,
	release
}) {
	const issues = [];
	if (!isRecord(provenanceManifest)) {
		return failed(['provenanceManifest must be the validated archive manifest.']);
	}
	if (!isRecord(release) || !isRecord(release.release) || !Array.isArray(release.challenges)) {
		return failed(['release must contain release metadata and an ordered challenge array.']);
	}

	let archive;
	try {
		archive = requireArchiveRoot(archiveRoot);
	} catch (error) {
		return failed([errorMessage(error)]);
	}

	const basePlan = readTrackedJson({
		archiveRoot: archive,
		provenanceManifest,
		path: BASE_PLAN_PATH,
		kind: 'base-plan',
		label: 'archived base plan',
		issues
	});
	const effectivePlan = readTrackedJson({
		archiveRoot: archive,
		provenanceManifest,
		path: EFFECTIVE_PLAN_PATH,
		kind: 'effective-plan',
		label: 'archived effective plan',
		issues
	});
	const contentReview = readTrackedJson({
		archiveRoot: archive,
		provenanceManifest,
		path: CONTENT_REVIEW_PATH,
		kind: 'content-review-summary',
		label: 'archived content review',
		issues
	});
	const sourceHashIndex = readTrackedJson({
		archiveRoot: archive,
		provenanceManifest,
		path: SOURCE_HASH_INDEX_PATH,
		kind: 'source-hash-index',
		label: 'archived source hash index',
		issues
	});
	const curriculumHashIndex = readTrackedJson({
		archiveRoot: archive,
		provenanceManifest,
		path: CURRICULUM_HASH_INDEX_PATH,
		kind: 'curriculum-hash-index',
		label: 'archived curriculum hash index',
		issues
	});
	if (
		!isRecord(basePlan) ||
		!Array.isArray(basePlan.rows) ||
		!isRecord(effectivePlan) ||
		!Array.isArray(effectivePlan.rows) ||
		!isRecord(contentReview) ||
		!isRecord(sourceHashIndex) ||
		!Array.isArray(sourceHashIndex.questions) ||
		!isRecord(curriculumHashIndex) ||
		!Array.isArray(curriculumHashIndex.components)
	) {
		return failed(issues.length ? issues : ['archived release-upload evidence is incomplete.']);
	}

	const metadata = release.release;
	const provenanceBindings = isRecord(provenanceManifest.bindings)
		? provenanceManifest.bindings
		: {};
	const basePlanSha256 = canonicalHash(basePlan);
	const effectivePlanSha256 = canonicalHash(effectivePlan);
	const candidateSetSha256 = canonicalHash(release.challenges);
	const hasTypedRemap =
		hasAnyBinding(TYPED_REMAP_BINDING_FIELDS, metadata, provenanceBindings) ||
		contentReview[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY] !== undefined ||
		contentReview[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY] !==
			undefined ||
		hasTrackedArtifactKind(provenanceManifest, 'curriculum-remap-durable-receipt');
	const hasDifficultyAdjustment =
		hasAnyBinding(DIFFICULTY_ADJUSTMENT_BINDING_FIELDS, metadata, provenanceBindings) ||
		hasTrackedArtifactKind(provenanceManifest, 'content-difficulty-plan-adjustment-index');
	const hasReviewRebaseAncestry =
		hasAnyBinding(REVIEW_REBASE_BINDING_FIELDS, metadata, provenanceBindings) ||
		isRecord(provenanceManifest.lineage?.effectiveCohort?.parentChain) ||
		hasTrackedArtifactKind(provenanceManifest, 'content-parent-chain-index');
	const hasInfrastructureRecovery =
		hasTrackedArtifactKind(provenanceManifest, 'content-infrastructure-recovery-index') ||
		hasTrackedArtifactKind(provenanceManifest, 'content-infrastructure-recovery-artifact');
	const hasEffectiveCohort =
		hasAnyBinding(EFFECTIVE_COHORT_BINDING_FIELDS, metadata, provenanceBindings) ||
		hasTypedRemap ||
		hasDifficultyAdjustment ||
		hasReviewRebaseAncestry ||
		hasTrackedArtifactKind(provenanceManifest, 'effective-cohort-index');
	const effectivePlanChanged = basePlanSha256 !== effectivePlanSha256;

	if (
		metadata.planSha256 !== basePlanSha256 ||
		(metadata.basePlanSha256 ?? metadata.planSha256) !== basePlanSha256 ||
		(metadata.effectivePlanSha256 ?? metadata.planSha256) !== effectivePlanSha256
	) {
		issues.push('Accepted release base/effective plan bindings differ from the archived plans.');
	}
	if (
		contentReview.planSha256 !== effectivePlanSha256 ||
		(contentReview.basePlanSha256 ?? contentReview.planSha256) !== basePlanSha256 ||
		(contentReview.effectivePlanSha256 ?? contentReview.planSha256) !== effectivePlanSha256
	) {
		issues.push('Archived content review base/effective plan bindings are stale.');
	}
	if (
		contentReview.candidateSetSha256 !== candidateSetSha256 ||
		contentReview.reviewCount !== release.challenges.length
	) {
		issues.push('Archived content review does not bind the exact accepted candidate set.');
	}
	if (
		contentReview.sourceSnapshotSha256 !== metadata.sourceSnapshotSha256 ||
		sourceHashIndex.sourceSnapshotSha256 !== metadata.sourceSnapshotSha256 ||
		contentReview.curriculumEvidenceSha256 !== metadata.curriculumEvidenceSha256 ||
		curriculumHashIndex.curriculumEvidenceSha256 !== metadata.curriculumEvidenceSha256
	) {
		issues.push('Archived source/curriculum hash indices are stale.');
	}
	if (
		metadata.contentVerificationSha256 !== canonicalHash(contentReview) ||
		provenanceManifest.bindings?.contentVerificationSha256 !== canonicalHash(contentReview)
	) {
		issues.push('Accepted release does not bind the archived content review.');
	}
	if (
		provenanceBindings.basePlanSha256 !== basePlanSha256 ||
		provenanceBindings.effectivePlanSha256 !== effectivePlanSha256
	) {
		issues.push('Provenance manifest base/effective plan bindings are stale.');
	}
	if (
		effectivePlanChanged &&
		!hasTypedRemap &&
		!hasDifficultyAdjustment &&
		!hasReviewRebaseAncestry
	) {
		issues.push(
			'A changed effective plan requires typed remap, difficulty-adjustment or review-rebase ancestry.'
		);
	}

	let effectiveCohortReplay = null;
	let durableReceipt = null;
	let reviewRebaseReplay = null;
	let parentChainIndex = null;
	let infrastructureRecoveryReplay = null;
	let infrastructureRecoveryTerminal = null;
	let infrastructureRecoveryIndex = null;
	if (hasEffectiveCohort) {
		validateEffectiveCohortReleaseBindings({
			metadata,
			provenanceBindings,
			issues
		});
		const effectiveCohortIndex = readTrackedJson({
			archiveRoot: archive,
			provenanceManifest,
			path: EFFECTIVE_COHORT_INDEX_PATH,
			kind: 'effective-cohort-index',
			label: 'archived effective-cohort provenance index',
			issues
		});
		validateEffectiveCohortIndex({
			index: effectiveCohortIndex,
			metadata,
			provenanceManifest,
			basePlanSha256,
			effectivePlanSha256,
			candidateCount: release.challenges.length,
			candidateSetSha256,
			hasTypedRemap,
			hasDifficultyAdjustment,
			issues
		});
		const manifestRecord = findEffectiveCohortManifestRecord({
			provenanceManifest,
			effectiveCohortIndex,
			issues
		});
		if (manifestRecord) {
			const manifestFile = readTrackedJsonRecord({
				archiveRoot: archive,
				record: manifestRecord,
				label: 'archived effective-cohort manifest',
				issues
			});
			if (manifestFile) {
				const manifestCanonicalSha256 = canonicalHash(manifestFile);
				if (
					manifestCanonicalSha256 !== metadata.effectiveCohortManifestSha256 ||
					manifestCanonicalSha256 !== provenanceBindings.effectiveCohortManifestSha256
				) {
					issues.push(
						'Accepted release does not bind the exact archived effective-cohort manifest.'
					);
				}
				if (manifestRecord.sha256 !== effectiveCohortIndex?.manifestFileSha256) {
					issues.push('Effective-cohort provenance index does not bind the manifest file bytes.');
				}
				const cohortReferenceRoot = path.join(
					archive,
					effectiveCohortIndex?.referenceRoot ?? EFFECTIVE_COHORT_ROOT
				);
				if (hasReviewRebaseAncestry) {
					const parentReplay = replayArchivedReviewRebaseParentChain({
						archiveRoot: archive,
						provenanceManifest,
						metadata,
						terminalManifest: manifestFile,
						effectiveCohortIndex,
						contentReview,
						issues
					});
					parentChainIndex = parentReplay.parentChainIndex;
					reviewRebaseReplay = parentReplay.reviewRebaseReplay;
				}
				if (hasInfrastructureRecovery || manifestFile.infrastructureRecovery !== undefined) {
					const recoveryReplay = replayArchivedInfrastructureRecovery({
						archiveRoot: archive,
						provenanceManifest,
						terminalManifest: manifestFile,
						issues
					});
					infrastructureRecoveryReplay = recoveryReplay.evidence;
					infrastructureRecoveryTerminal = recoveryReplay.terminal;
					infrastructureRecoveryIndex = recoveryReplay.index;
				}
				effectiveCohortReplay = readScienceChallengeEffectiveCohort({
					manifestPath: path.join(archive, manifestRecord.path),
					referenceRoot: cohortReferenceRoot,
					basePlan,
					effectivePlan,
					expectedSourceSnapshotSha256: metadata.sourceSnapshotSha256,
					expectedCurriculumEvidenceSha256: metadata.curriculumEvidenceSha256,
					expectedCurriculumCatalogSha256: metadata.curriculumCatalogSha256,
					reviewRebaseEvidence: reviewRebaseReplay,
					reviewRebaseInfrastructureRecoveryEvidence: infrastructureRecoveryReplay
				});
				if (effectiveCohortReplay.status !== 'passed') {
					issues.push(
						...effectiveCohortReplay.issues.map((issue) => `effective-cohort replay: ${issue}`)
					);
				} else if (
					effectiveCohortReplay.candidateSetSha256 !== candidateSetSha256 ||
					canonicalHash(effectiveCohortReplay.candidateSet) !== candidateSetSha256 ||
					metadata.effectiveCohortCandidateSetSha256 !== candidateSetSha256 ||
					provenanceBindings.effectiveCohortCandidateSetSha256 !== candidateSetSha256
				) {
					issues.push('Effective-cohort replay does not produce the exact accepted candidate set.');
				}
			}
		}

		if (effectiveCohortReplay?.status === 'passed') {
			const replayHasTypedRemap =
				Number.isSafeInteger(effectiveCohortReplay.manifest?.remapCount) &&
				effectiveCohortReplay.manifest.remapCount > 0;
			const replayHasDifficultyAdjustment =
				Number.isSafeInteger(effectiveCohortReplay.manifest?.difficultyAdjustmentManifestCount) &&
				effectiveCohortReplay.manifest.difficultyAdjustmentManifestCount > 0;
			const replayHasReviewRebaseAncestry = isRecord(effectiveCohortReplay.parentChain);
			const replayHasInfrastructureRecovery = isRecord(
				effectiveCohortReplay.manifest?.infrastructureRecovery
			);
			if (replayHasTypedRemap !== hasTypedRemap) {
				issues.push(
					'Typed curriculum-remap bindings do not match the replayed effective-cohort lineage.'
				);
			}
			if (replayHasDifficultyAdjustment !== hasDifficultyAdjustment) {
				issues.push(
					'Difficulty-adjustment bindings do not match the replayed effective-cohort lineage.'
				);
			}
			if (replayHasReviewRebaseAncestry !== hasReviewRebaseAncestry) {
				issues.push(
					'Review-rebase ancestry bindings do not match the replayed effective-cohort lineage.'
				);
			}
			if (replayHasInfrastructureRecovery !== hasInfrastructureRecovery) {
				issues.push(
					'Infrastructure-recovery archive bindings do not match the replayed effective cohort.'
				);
			}
			if (
				replayHasInfrastructureRecovery
					? contentReview.reviewRebaseInfrastructureRecoveryManifestSha256 !==
							effectiveCohortReplay.manifest.infrastructureRecovery.manifestSha256 ||
						contentReview.reviewRebaseInfrastructureRecoveryId !==
							effectiveCohortReplay.manifest.infrastructureRecovery.recoveryId
					: contentReview.reviewRebaseInfrastructureRecoveryManifestSha256 !== undefined ||
						contentReview.reviewRebaseInfrastructureRecoveryId !== undefined
			) {
				issues.push(
					'Archived content review infrastructure-recovery binding is stale or unassigned.'
				);
			}
		}

		if (hasTypedRemap) {
			validateRemapReleaseBindings(metadata, provenanceBindings, issues);
			if (!effectivePlanChanged) {
				issues.push('A remap release requires distinct archived base and effective plans.');
			}
			durableReceipt = readTrackedJson({
				archiveRoot: archive,
				provenanceManifest,
				path: DURABLE_RECEIPT_PATH,
				kind: 'curriculum-remap-durable-receipt',
				label: 'archived curriculum remap durable receipt',
				issues
			});
			if (durableReceipt) {
				const receiptValidation =
					validateScienceChallengeCurriculumRemapDurableReceipt(durableReceipt);
				issues.push(
					...receiptValidation.issues.map((issue) => `curriculum remap durable receipt: ${issue}`)
				);
				const receiptCanonicalSha256 = canonicalHash(durableReceipt);
				if (
					receiptCanonicalSha256 !== metadata.curriculumRemapDurableReceiptSha256 ||
					receiptCanonicalSha256 !== provenanceBindings.curriculumRemapDurableReceiptSha256 ||
					contentReview[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY] !==
						receiptCanonicalSha256 ||
					canonicalHash(
						contentReview[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY]
					) !== receiptCanonicalSha256
				) {
					issues.push(
						'Accepted release, content review and archive do not bind the same durable remap receipt.'
					);
				}
				if (
					durableReceipt.basePlanSha256 !== basePlanSha256 ||
					durableReceipt.effectivePlanSha256 !== effectivePlanSha256 ||
					durableReceipt.effectiveCohortManifestSha256 !== metadata.effectiveCohortManifestSha256 ||
					durableReceipt.candidateCount !== release.challenges.length ||
					durableReceipt.candidateSetSha256 !== candidateSetSha256 ||
					durableReceipt.curriculumEvidenceSha256 !== metadata.curriculumEvidenceSha256 ||
					durableReceipt.curriculumCatalogSha256 !== metadata.curriculumCatalogSha256 ||
					durableReceipt.remapManifestSetSha256 !==
						effectiveCohortReplay?.manifest?.remapManifestSetSha256 ||
					durableReceipt.verifierInputSha256 !== metadata.curriculumRemapVerifierInputSha256 ||
					durableReceipt.decisionSetSha256 !== metadata.curriculumRemapDecisionSetSha256 ||
					durableReceipt.remapManifestSetSha256 !== metadata.descendantRemapManifestSetSha256
				) {
					issues.push(
						'Durable remap receipt differs from the archived cohort, plans, curriculum or candidates.'
					);
				}
				if (
					!Array.isArray(durableReceipt.remaps) ||
					durableReceipt.remaps.length === 0 ||
					durableReceipt.remaps.length !== effectiveCohortReplay?.manifest?.remapCount ||
					durableReceipt.remaps.some((remap) => remap?.decision?.accepted !== true)
				) {
					issues.push('Every effective-cohort remap requires one exact accepted durable decision.');
				}
			}
		} else {
			validateAbsentBindings(
				TYPED_REMAP_BINDING_FIELDS,
				metadata,
				provenanceBindings,
				'Release without a typed curriculum remap contains remap bindings.',
				issues
			);
		}

		if (hasDifficultyAdjustment) {
			validateDifficultyAdjustmentReleaseBindings({
				metadata,
				provenanceBindings,
				effectiveCohortReplay,
				issues
			});
		} else {
			validateAbsentBindings(
				DIFFICULTY_ADJUSTMENT_BINDING_FIELDS,
				metadata,
				provenanceBindings,
				'Release without a difficulty adjustment contains difficulty bindings.',
				issues
			);
		}

		if (hasReviewRebaseAncestry) {
			validateReviewRebaseSuccessorUpload({
				metadata,
				provenanceManifest,
				basePlan,
				effectivePlan,
				contentReview,
				candidateSetSha256,
				reviewRebaseReplay,
				reviewRebaseInfrastructureRecoveryEvidence: infrastructureRecoveryReplay,
				effectiveCohortReplay,
				parentChainIndex,
				issues
			});
		} else {
			validateAbsentBindings(
				REVIEW_REBASE_BINDING_FIELDS,
				metadata,
				provenanceBindings,
				'Release without review-rebase ancestry contains parent-lineage bindings.',
				issues
			);
		}
	} else {
		const ordinaryBindings = [
			...EFFECTIVE_COHORT_BINDING_FIELDS,
			...TYPED_REMAP_BINDING_FIELDS,
			...DIFFICULTY_ADJUSTMENT_BINDING_FIELDS,
			...REVIEW_REBASE_BINDING_FIELDS
		];
		if (
			ordinaryBindings.some(
				(field) =>
					(metadata[field] !== null && metadata[field] !== undefined) ||
					(provenanceBindings[field] !== null && provenanceBindings[field] !== undefined)
			) ||
			contentReview[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY] !== undefined ||
			contentReview[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY] !==
				undefined
		) {
			issues.push('Ordinary release contains unexpected effective-cohort remap bindings.');
		}
	}

	return issues.length
		? failed(issues)
		: {
				status: 'passed',
				issues: [],
				basePlan,
				effectivePlan,
				contentReview,
				sourceHashIndex,
				curriculumHashIndex,
				candidateSetSha256,
				hasEffectiveCohort,
				hasTypedRemap,
				hasDifficultyAdjustment,
				hasReviewRebaseAncestry,
				hasInfrastructureRecovery,
				effectiveCohortReplay,
				durableReceipt,
				reviewRebaseReplay,
				parentChainIndex,
				infrastructureRecoveryTerminal,
				infrastructureRecoveryIndex
			};
}

function validateRemapReleaseBindings(metadata, provenanceBindings, issues) {
	for (const field of [
		'basePlanSha256',
		'effectivePlanSha256',
		'effectiveCohortManifestSha256',
		'effectiveCohortCandidateSetSha256',
		'curriculumRemapDurableReceiptSha256',
		'curriculumRemapVerifierInputSha256',
		'curriculumRemapDecisionSetSha256',
		'descendantRemapManifestSetSha256'
	]) {
		if (!HASH.test(String(metadata[field] ?? ''))) {
			issues.push(`Accepted remap release requires release.${field}.`);
		}
		if (metadata[field] !== provenanceBindings[field]) {
			issues.push(`Accepted remap release and archive differ on ${field}.`);
		}
	}
}

function validateEffectiveCohortReleaseBindings({ metadata, provenanceBindings, issues }) {
	for (const field of [
		'basePlanSha256',
		'effectivePlanSha256',
		...EFFECTIVE_COHORT_BINDING_FIELDS
	]) {
		if (!HASH.test(String(metadata[field] ?? ''))) {
			issues.push(`Accepted effective-cohort release requires release.${field}.`);
		}
		if (metadata[field] !== provenanceBindings[field]) {
			issues.push(`Accepted effective-cohort release and archive differ on ${field}.`);
		}
	}
}

function validateDifficultyAdjustmentReleaseBindings({
	metadata,
	provenanceBindings,
	effectiveCohortReplay,
	issues
}) {
	for (const field of DIFFICULTY_ADJUSTMENT_BINDING_FIELDS) {
		if (!HASH.test(String(metadata[field] ?? ''))) {
			issues.push(`Accepted difficulty-adjustment release requires release.${field}.`);
		}
		if (metadata[field] !== provenanceBindings[field]) {
			issues.push(`Accepted difficulty-adjustment release and archive differ on ${field}.`);
		}
	}
	if (
		effectiveCohortReplay?.status === 'passed' &&
		(effectiveCohortReplay.manifest.difficultyAdjustmentManifestCount < 1 ||
			effectiveCohortReplay.manifest.difficultyAdjustmentManifestSetSha256 !==
				metadata.difficultyAdjustmentManifestSetSha256)
	) {
		issues.push(
			'Accepted difficulty-adjustment release differs from the replayed effective cohort.'
		);
	}
}

function replayArchivedInfrastructureRecovery({
	archiveRoot,
	provenanceManifest,
	terminalManifest,
	issues
}) {
	const binding = terminalManifest?.infrastructureRecovery;
	if (!isRecord(binding)) {
		issues.push(
			'Archived infrastructure-recovery evidence is present without a terminal effective-cohort binding.'
		);
		return { evidence: null, terminal: null, index: null };
	}
	try {
		validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(binding);
	} catch (error) {
		issues.push(errorMessage(error));
		return { evidence: null, terminal: null, index: null };
	}
	const index = readTrackedJson({
		archiveRoot,
		provenanceManifest,
		path: INFRASTRUCTURE_RECOVERY_INDEX_PATH,
		kind: 'content-infrastructure-recovery-index',
		label: 'archived infrastructure-recovery provenance index',
		issues
	});
	if (!isRecord(index)) return { evidence: null, terminal: null, index };
	const artifacts = Array.isArray(index.artifacts) ? index.artifacts : [];
	if (
		index.schemaVersion !== INFRASTRUCTURE_RECOVERY_INDEX_SCHEMA ||
		index.referenceRoot !== INFRASTRUCTURE_RECOVERY_REFERENCE_ROOT ||
		canonicalHash(index.infrastructureRecovery) !== canonicalHash(binding) ||
		index.logicalLedgerSha256 !== binding.logicalLedgerSha256 ||
		index.finalProposalSetSha256 !== binding.finalProposalSetSha256 ||
		!Array.isArray(index.pendingShardIds) ||
		index.pendingShardIds.length !== 0 ||
		index.artifactCount !== artifacts.length ||
		index.artifactSetSha256 !== canonicalHash(artifacts)
	) {
		issues.push('Archived infrastructure-recovery index is stale or incomplete.');
		return { evidence: null, terminal: null, index };
	}
	const tracked = Array.isArray(provenanceManifest.trackedArtifacts)
		? provenanceManifest.trackedArtifacts
		: [];
	const evidencePaths = [];
	const seenSourcePaths = new Set();
	for (const artifact of artifacts) {
		try {
			const expectedArchivePath = normalizeArchivePath(
				`${INFRASTRUCTURE_RECOVERY_REFERENCE_ROOT}/${artifact?.sourcePath ?? ''}`
			)
				.split(path.sep)
				.join('/');
			const records = tracked.filter(
				(record) =>
					record?.kind === 'content-infrastructure-recovery-artifact' &&
					record?.path === expectedArchivePath
			);
			if (
				records.length !== 1 ||
				seenSourcePaths.has(artifact?.sourcePath) ||
				artifact.archivePath !== expectedArchivePath
			) {
				throw new Error(
					'Infrastructure-recovery archive has a missing, duplicated or disconnected sibling.'
				);
			}
			const record = records[0];
			const filePath = requireContainedFile(
				archiveRoot,
				expectedArchivePath,
				`infrastructure-recovery artifact ${artifact.sourcePath}`
			);
			const bytes = readFileSync(filePath);
			if (
				record.sha256 !== artifact.sha256 ||
				record.bytes !== artifact.byteLength ||
				sha256(bytes) !== artifact.sha256 ||
				bytes.length !== artifact.byteLength ||
				(record.canonicalSha256 ?? null) !== (artifact.canonicalSha256 ?? null)
			) {
				throw new Error(
					`Infrastructure-recovery artifact ${artifact.sourcePath} differs from its index.`
				);
			}
			seenSourcePaths.add(artifact.sourcePath);
			evidencePaths.push({
				path: artifact.sourcePath,
				byteLength: artifact.byteLength,
				sha256: artifact.sha256
			});
		} catch (error) {
			issues.push(errorMessage(error));
		}
	}
	evidencePaths.sort((left, right) => left.path.localeCompare(right.path));
	if (
		evidencePaths.length !== artifacts.length ||
		canonicalHash(evidencePaths) !== index.evidencePathInventorySha256 ||
		!seenSourcePaths.has(binding.manifestPath)
	) {
		issues.push(
			'Archived infrastructure-recovery evidence-path inventory is not exact and closed-world.'
		);
		return { evidence: null, terminal: null, index };
	}
	try {
		const repositoryRoot = path.join(archiveRoot, INFRASTRUCTURE_RECOVERY_REFERENCE_ROOT);
		const recoveryManifestPath = requireContainedFile(
			repositoryRoot,
			binding.manifestPath,
			'archived infrastructure-recovery manifest'
		);
		const recoveryManifest = JSON.parse(readFileSync(recoveryManifestPath, 'utf8'));
		if (canonicalHash(recoveryManifest) !== binding.manifestSha256) {
			throw new Error(
				'Archived infrastructure-recovery manifest differs from the effective-cohort binding.'
			);
		}
		const existingDefinitions = readTrackedJson({
			archiveRoot,
			provenanceManifest,
			path: 'content/parent-chain/existing-definitions.json',
			kind: 'content-parent-chain-existing-definitions',
			label: 'archived review-rebase existing definitions',
			issues
		});
		if (!Array.isArray(existingDefinitions)) {
			throw new Error('Archived infrastructure recovery lacks existing definitions.');
		}
		const evidence = inspectScienceChallengeReviewRebaseInfrastructureRecovery({
			workspaceRoot: repositoryRoot,
			reviewRebaseManifestPath: recoveryManifest.reviewRebase?.manifestPath,
			verificationSummaryPath: recoveryManifest.verification?.summaryPath,
			failedRoot: recoveryManifest.failedRoot?.path,
			successorRoot: recoveryManifest.successor?.path,
			existingDefinitions
		});
		const terminal = inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal({
			evidence,
			referenceRoot: repositoryRoot
		});
		const replayedBinding = buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding({
			evidence: terminal,
			referenceRoot: repositoryRoot
		});
		if (
			terminal.status !== 'passed' ||
			canonicalHash(replayedBinding) !== canonicalHash(binding) ||
			canonicalHash(terminal.evidencePaths) !== canonicalHash(evidencePaths) ||
			terminal.evidencePathInventorySha256 !== index.evidencePathInventorySha256 ||
			terminal.logicalLedgerSha256 !== index.logicalLedgerSha256 ||
			terminal.finalProposalSetSha256 !== index.finalProposalSetSha256
		) {
			throw new Error('Archived infrastructure-recovery closure differs from terminal replay.');
		}
		return { evidence, terminal, index };
	} catch (error) {
		issues.push(errorMessage(error));
		return { evidence: null, terminal: null, index };
	}
}

function replayArchivedReviewRebaseParentChain({
	archiveRoot,
	provenanceManifest,
	metadata,
	terminalManifest,
	effectiveCohortIndex,
	contentReview,
	issues
}) {
	const parentChainIndex = readTrackedJson({
		archiveRoot,
		provenanceManifest,
		path: PARENT_CHAIN_INDEX_PATH,
		kind: 'content-parent-chain-index',
		label: 'archived content parent-chain index',
		issues
	});
	if (!isRecord(parentChainIndex)) {
		return { parentChainIndex, reviewRebaseReplay: null };
	}
	const parentChain = terminalManifest?.parentChain;
	if (
		parentChainIndex.schemaVersion !== PARENT_CHAIN_INDEX_SCHEMA ||
		parentChainIndex.referenceRoot !== PARENT_CHAIN_REFERENCE_ROOT ||
		!isRecord(parentChainIndex.parentChain) ||
		!isRecord(parentChain) ||
		canonicalHash(parentChainIndex.parentChain) !== canonicalHash(parentChain) ||
		parentChainIndex.contentParentLineageSha256 !== canonicalHash(parentChain) ||
		parentChainIndex.contentParentLineageSha256 !== metadata.contentParentLineageSha256 ||
		parentChainIndex.contentParentLineageSha256 !==
			provenanceManifest.bindings?.contentParentLineageSha256
	) {
		issues.push('Archived content parent-chain index has stale schema, root or lineage bindings.');
	}

	validateParentChainIndexClosedWorld({
		index: parentChainIndex,
		effectiveCohortIndex,
		provenanceManifest,
		archiveRoot,
		issues
	});

	let normalizedParentManifestPath = null;
	try {
		const manifestReferencePath = normalizeArchivePath(
			parentChainIndex.reviewRebaseManifestRef?.path
		);
		const prefix = `${PARENT_CHAIN_REFERENCE_ROOT}/`;
		if (!manifestReferencePath.startsWith(prefix)) {
			throw new Error('Archived review-rebase B0 manifest is outside its repository root.');
		}
		normalizedParentManifestPath = normalizeArchivePath(manifestReferencePath.slice(prefix.length));
		if (
			terminalManifest?.parent?.kind === 'review-rebase' &&
			normalizeArchivePath(terminalManifest.parent.manifestPath) !== normalizedParentManifestPath
		) {
			throw new Error('Review-rebase S1 points at another B0 manifest path.');
		}
	} catch (error) {
		issues.push(`review-rebase B0: ${errorMessage(error)}`);
	}
	const expectedB0ArchivePath = normalizedParentManifestPath
		? `${PARENT_CHAIN_REFERENCE_ROOT}/${normalizedParentManifestPath}`
		: null;
	const expectedReferences = [
		[
			'reviewRebaseManifestRef',
			parentChain?.reviewRebaseManifestSha256,
			expectedB0ArchivePath,
			'review-rebase B0 manifest'
		],
		[
			'parentVerificationRef',
			parentChain?.parentVerificationSha256,
			null,
			'review-rebase V0 verification'
		],
		['parentRepairRef', parentChain?.parentRepairSha256, null, 'review-rebase R0 repair'],
		[
			'firstVerificationRef',
			parentChain?.firstVerificationSha256,
			null,
			'review-rebase V1 verification'
		],
		[
			'effectiveCohortManifestRef',
			canonicalHash(terminalManifest),
			effectiveCohortIndex?.manifestRef?.path,
			'review-rebase S1 effective-cohort manifest'
		],
		[
			'effectiveCohortIndexRef',
			canonicalHash(effectiveCohortIndex),
			EFFECTIVE_COHORT_INDEX_PATH,
			'review-rebase S1 effective-cohort index'
		],
		[
			'contentVerificationRef',
			canonicalHash(contentReview),
			CONTENT_REVIEW_PATH,
			'review-rebase V2 verification'
		]
	];
	const loadedReferences = {};
	for (const [field, expectedCanonicalSha256, expectedPath, label] of expectedReferences) {
		loadedReferences[field] = readParentChainReference({
			archiveRoot,
			provenanceManifest,
			reference: parentChainIndex[field],
			expectedCanonicalSha256,
			expectedPath,
			label,
			issues
		});
	}
	const existingDefinitions = readParentChainReference({
		archiveRoot,
		provenanceManifest,
		reference: parentChainIndex.existingDefinitionsRef,
		expectedPath: 'content/parent-chain/existing-definitions.json',
		label: 'review-rebase existing definitions',
		issues
	});
	const b0Manifest = loadedReferences.reviewRebaseManifestRef;
	if (
		!isRecord(b0Manifest) ||
		b0Manifest.schemaVersion !== REVIEW_REBASE_MANIFEST_SCHEMA ||
		b0Manifest.disposition !== REVIEW_REBASE_DISPOSITION ||
		b0Manifest.releaseEligible !== false ||
		b0Manifest.requiresFreshFullVerification !== true
	) {
		issues.push('Archived review-rebase B0 is not an exact non-release-eligible rebase manifest.');
	}
	if (
		!Array.isArray(existingDefinitions) ||
		existingDefinitions.length !== b0Manifest?.evidence?.inputs?.existingDefinitions?.count ||
		canonicalHash(existingDefinitions) !==
			b0Manifest?.evidence?.inputs?.existingDefinitions?.canonicalSha256
	) {
		issues.push('Archived review-rebase existing definitions differ from the B0 binding.');
	}

	let reviewRebaseReplay = null;
	if (normalizedParentManifestPath && isRecord(b0Manifest) && Array.isArray(existingDefinitions)) {
		const repositoryRoot = path.join(archiveRoot, PARENT_CHAIN_REFERENCE_ROOT);
		reviewRebaseReplay = readScienceChallengeReviewRebaseEvidence({
			repositoryRoot,
			manifestPath: normalizedParentManifestPath,
			existingDefinitions
		});
		if (reviewRebaseReplay.status !== 'passed') {
			issues.push(...reviewRebaseReplay.issues.map((issue) => `review-rebase B0 replay: ${issue}`));
		} else if (
			canonicalHash(reviewRebaseReplay.manifest) !== parentChain?.reviewRebaseManifestSha256 ||
			canonicalHash(reviewRebaseReplay.manifest) !==
				parentChainIndex.reviewRebaseManifestRef?.canonicalSha256 ||
			reviewRebaseReplay.manifestPathRelative !== normalizedParentManifestPath
		) {
			issues.push('Review-rebase B0 replay differs from the indexed parent manifest.');
		}
	}
	return { parentChainIndex, reviewRebaseReplay };
}

function validateReviewRebaseSuccessorUpload({
	metadata,
	provenanceManifest,
	basePlan,
	effectivePlan,
	contentReview,
	candidateSetSha256,
	reviewRebaseReplay,
	reviewRebaseInfrastructureRecoveryEvidence,
	effectiveCohortReplay,
	parentChainIndex,
	issues
}) {
	if (!HASH.test(String(metadata.contentParentLineageSha256 ?? ''))) {
		issues.push('Accepted review-rebase successor requires release.contentParentLineageSha256.');
	}
	const terminalManifest = effectiveCohortReplay?.manifest;
	const core = reviewRebaseReplay?.coreManifest;
	const manifest = reviewRebaseReplay?.manifest;
	const lineageValidation = validateScienceChallengeReviewRebaseSuccessorLineage({
		effectiveCohort: effectiveCohortReplay,
		reviewRebaseEvidence: reviewRebaseReplay,
		reviewRebaseInfrastructureRecoveryEvidence
	});
	const reviewRebaseSuccessor =
		lineageValidation.status === 'passed'
			? lineageValidation.rootSuccessor
			: findReviewRebaseSuccessor(effectiveCohortReplay);
	const successorManifest = reviewRebaseSuccessor?.manifest;
	const parentChain =
		(lineageValidation.status === 'passed' ? lineageValidation.parentChain : null) ??
		effectiveCohortReplay?.parentChain ??
		terminalManifest?.parentChain ??
		null;
	const firstVerification = reviewRebaseSuccessor?.reviewSummary;
	const authority =
		(lineageValidation.status === 'passed'
			? lineageValidation.verificationRepairAuthority
			: null) ?? reviewRebaseSuccessor?.verificationRepairAuthority;
	if (lineageValidation.status !== 'passed') {
		issues.push(
			...lineageValidation.issues.map((issue) => `review-rebase successor lineage: ${issue}`)
		);
	}
	if (
		!isRecord(parentChain) ||
		parentChain.kind !== REVIEW_REBASE_SUCCESSOR_KIND ||
		canonicalHash(Object.keys(parentChain).sort()) !==
			canonicalHash([...REVIEW_REBASE_PARENT_CHAIN_FIELDS].sort())
	) {
		issues.push('Review-rebase successor parentChain is missing fields or has an invalid kind.');
		return;
	}
	for (const field of REVIEW_REBASE_PARENT_CHAIN_FIELDS.slice(1)) {
		if (!HASH.test(String(parentChain[field] ?? ''))) {
			issues.push(`Review-rebase successor parentChain.${field} must be a lowercase SHA-256.`);
		}
	}
	const parentChainSha256 = canonicalHash(parentChain);
	const indexedParentChain = parentChainIndex?.parentChain;
	const archivedParentChain = provenanceManifest.lineage?.effectiveCohort?.parentChain;
	if (
		parentChainSha256 !== metadata.contentParentLineageSha256 ||
		parentChainSha256 !== provenanceManifest.bindings?.contentParentLineageSha256 ||
		!isRecord(indexedParentChain) ||
		parentChainSha256 !== canonicalHash(indexedParentChain) ||
		!isRecord(archivedParentChain) ||
		parentChainSha256 !== canonicalHash(archivedParentChain)
	) {
		issues.push('Review-rebase successor parentChain differs across release and archive lineage.');
	}
	if (
		!reviewRebaseReplay ||
		reviewRebaseReplay.status !== 'passed' ||
		!isRecord(core) ||
		!isRecord(manifest) ||
		parentChain.reviewRebaseManifestSha256 !== canonicalHash(manifest) ||
		parentChain.reviewRebaseId !== core.rebaseId ||
		parentChain.parentVerificationSha256 !== core.parent?.verificationSha256 ||
		parentChain.parentRepairSha256 !== core.parent?.repairSha256 ||
		parentChain.reviewRebasePlanSha256 !== core.planSha256 ||
		parentChain.reviewRebaseCandidateSetSha256 !== core.candidateSetSha256 ||
		parentChain.reviewRebaseCollectionValidationSha256 !== core.collectionValidationSha256 ||
		parentChain.reviewRebaseCollectionRemediationSetSha256 !==
			core.collectionRemediationSetSha256 ||
		parentChain.reviewRebaseCollectionRemediationTargetSetSha256 !==
			authority?.collectionRemediationTargetSetSha256
	) {
		issues.push('Review-rebase successor parentChain differs from replayed V0/R0/B0 evidence.');
	}
	if (
		successorManifest?.disposition !== 'review-pending-effective-cohort-successor' ||
		successorManifest?.parent?.kind !== 'review-rebase' ||
		successorManifest.parent.manifestSha256 !== parentChain.reviewRebaseManifestSha256 ||
		successorManifest.parent.rebaseId !== parentChain.reviewRebaseId ||
		successorManifest.parent.planSha256 !== parentChain.reviewRebasePlanSha256 ||
		successorManifest.parent.candidateSetSha256 !== parentChain.reviewRebaseCandidateSetSha256 ||
		successorManifest.parent.collectionValidationSha256 !==
			parentChain.reviewRebaseCollectionValidationSha256 ||
		successorManifest.parent.collectionRemediationSetSha256 !==
			parentChain.reviewRebaseCollectionRemediationSetSha256 ||
		successorManifest.parent.collectionRemediationTargetSetSha256 !==
			parentChain.reviewRebaseCollectionRemediationTargetSetSha256 ||
		successorManifest.basePlanSha256 !== canonicalHash(basePlan) ||
		successorManifest.effectivePlanSha256 !== canonicalHash(effectivePlan)
	) {
		issues.push('Review-rebase S1 successor does not bind the exact replayed B0 parent and plans.');
	}
	if (
		!isRecord(firstVerification) ||
		canonicalHash(firstVerification) !== parentChain.firstVerificationSha256 ||
		firstVerification.status !== 'failed' ||
		firstVerification.reviewRebaseManifestSha256 !== parentChain.reviewRebaseManifestSha256 ||
		firstVerification.reviewRebaseId !== parentChain.reviewRebaseId ||
		firstVerification.planSha256 !== parentChain.reviewRebasePlanSha256 ||
		firstVerification.candidateSetSha256 !== parentChain.reviewRebaseCandidateSetSha256 ||
		!Number.isSafeInteger(firstVerification.rejectedCount) ||
		firstVerification.rejectedCount < 1
	) {
		issues.push('Review-rebase S1 successor does not replay the exact failed V1 verification.');
	}
	const mutableTargetIds = successorManifest?.review?.mutableTargetIds;
	if (
		!Array.isArray(mutableTargetIds) ||
		mutableTargetIds.length < 1 ||
		parentChain.mutableTargetSetSha256 !== canonicalHash(mutableTargetIds) ||
		successorManifest.review?.mutableTargetSetSha256 !== parentChain.mutableTargetSetSha256 ||
		parentChain.successorObjectiveId !==
			(authority?.objectiveId ?? successorManifest?.objectiveId) ||
		parentChain.successorExecutionId !== (authority?.executionId ?? successorManifest?.executionId)
	) {
		issues.push('Review-rebase S1 mutable target or successor authority is stale.');
	}
	if (
		candidateSetSha256 === parentChain.reviewRebaseCandidateSetSha256 ||
		effectiveCohortReplay?.candidateSetSha256 === parentChain.reviewRebaseCandidateSetSha256
	) {
		issues.push('Direct review-rebase B0 candidates are not release eligible without S1 repair.');
	}
	const expectedAssignmentCount = new Set(effectivePlan.rows.map((row) => row.shard)).size;
	const expectedReviewCount = effectivePlan.rows.length;
	if (
		contentReview.status !== 'passed' ||
		contentReview.effectiveCohortManifestSha256 !== canonicalHash(terminalManifest) ||
		contentReview.candidateSetSha256 !== candidateSetSha256 ||
		contentReview.assignmentCount !== expectedAssignmentCount ||
		!Array.isArray(contentReview.assignmentResults) ||
		contentReview.assignmentResults.length !== expectedAssignmentCount ||
		contentReview.assignmentResults.some((result) => result?.status !== 'passed') ||
		contentReview.reviewCount !== expectedReviewCount ||
		contentReview.acceptedCount !== expectedReviewCount ||
		contentReview.rejectedCount !== 0 ||
		!Array.isArray(contentReview.reviews) ||
		contentReview.reviews.length !== expectedReviewCount ||
		contentReview.reviews.some((review) => review?.accepted !== true) ||
		!Array.isArray(contentReview.issues) ||
		contentReview.issues.length !== 0 ||
		canonicalHash(contentReview) === parentChain.firstVerificationSha256
	) {
		issues.push(
			'Review-rebase terminal verification is not a fresh complete passing review of the exact terminal successor.'
		);
	}
}

function findReviewRebaseSuccessor(effectiveCohort) {
	const seen = new Set();
	let cursor = effectiveCohort;
	while (cursor?.status === 'passed' && isRecord(cursor.manifest)) {
		const manifestSha256 = canonicalHash(cursor.manifest);
		if (seen.has(manifestSha256)) return null;
		seen.add(manifestSha256);
		if (cursor.manifest.parent?.kind === 'review-rebase') return cursor;
		cursor = cursor.predecessor;
	}
	return null;
}

function validateParentChainIndexClosedWorld({
	index,
	effectiveCohortIndex,
	provenanceManifest,
	archiveRoot,
	issues
}) {
	const artifactRefs = Array.isArray(index.artifactRefs) ? index.artifactRefs : [];
	const uniquePaths = new Set(artifactRefs.map((reference) => reference?.path));
	if (
		!Array.isArray(index.artifactRefs) ||
		index.artifactCount !== artifactRefs.length ||
		uniquePaths.size !== artifactRefs.length ||
		artifactRefs.some((reference) => !isRecord(reference))
	) {
		issues.push('Archived content parent-chain artifactRefs are incomplete or duplicated.');
	}
	for (const reference of artifactRefs) {
		readParentChainReference({
			archiveRoot,
			provenanceManifest,
			reference,
			label: `content parent-chain artifact ${reference?.path ?? 'unknown'}`,
			issues
		});
	}
	const trackedRepositoryPaths = (provenanceManifest.trackedArtifacts ?? [])
		.filter((record) => record?.kind === 'content-parent-chain-artifact')
		.map((record) => record.path)
		.sort();
	const indexedRepositoryPaths = artifactRefs
		.filter((reference) => reference?.kind === 'content-parent-chain-artifact')
		.map((reference) => reference.path)
		.sort();
	if (canonicalHash(trackedRepositoryPaths) !== canonicalHash(indexedRepositoryPaths)) {
		issues.push(
			'Archived review-rebase replay repository is not closed by the parent-chain index.'
		);
	}
	for (const field of [
		'reviewRebaseManifestRef',
		'existingDefinitionsRef',
		'parentVerificationRef',
		'parentRepairRef',
		'firstVerificationRef',
		'effectiveCohortManifestRef',
		'effectiveCohortIndexRef',
		'contentVerificationRef'
	]) {
		const reference = index[field];
		if (
			!isRecord(reference) ||
			!artifactRefs.some(
				(candidate) =>
					candidate.path === reference.path &&
					candidate.kind === reference.kind &&
					candidate.sha256 === reference.sha256 &&
					candidate.canonicalSha256 === reference.canonicalSha256
			)
		) {
			issues.push(`Archived content parent-chain index ${field} is absent from artifactRefs.`);
		}
	}
	const effectiveArtifactRefs = Array.isArray(effectiveCohortIndex?.artifactRefs)
		? effectiveCohortIndex.artifactRefs
		: [];
	const effectiveReferenceSet = [
		effectiveCohortIndex?.manifestRef,
		...effectiveArtifactRefs
	].filter(isRecord);
	if (
		!Array.isArray(effectiveCohortIndex?.artifactRefs) ||
		effectiveCohortIndex.artifactCount !== effectiveArtifactRefs.length ||
		new Set(effectiveArtifactRefs.map((reference) => reference?.path)).size !==
			effectiveArtifactRefs.length ||
		effectiveArtifactRefs.some(
			(reference) =>
				reference?.kind !== 'effective-cohort-artifact' ||
				!artifactRefs.some((candidate) => sameArtifactReference(candidate, reference))
		) ||
		!isRecord(effectiveCohortIndex?.manifestRef) ||
		!artifactRefs.some((candidate) =>
			sameArtifactReference(candidate, effectiveCohortIndex.manifestRef)
		)
	) {
		issues.push(
			'Archived review-rebase terminal effective-cohort artifacts are not exact and closed-world.'
		);
	}
	for (const reference of effectiveReferenceSet) {
		readParentChainReference({
			archiveRoot,
			provenanceManifest,
			reference,
			label: `review-rebase effective-cohort artifact ${reference.path ?? 'unknown'}`,
			issues
		});
	}
}

function sameArtifactReference(left, right) {
	return (
		left?.kind === right?.kind &&
		left?.path === right?.path &&
		left?.sha256 === right?.sha256 &&
		left?.canonicalSha256 === right?.canonicalSha256 &&
		(left?.bytes === undefined || right?.bytes === undefined || left.bytes === right.bytes)
	);
}

function readParentChainReference({
	archiveRoot,
	provenanceManifest,
	reference,
	expectedCanonicalSha256,
	expectedPath,
	label,
	issues
}) {
	if (
		!isRecord(reference) ||
		typeof reference.kind !== 'string' ||
		typeof reference.path !== 'string' ||
		!HASH.test(String(reference.sha256 ?? '')) ||
		!HASH.test(String(reference.canonicalSha256 ?? ''))
	) {
		issues.push(`${label} reference is missing or malformed.`);
		return null;
	}
	if (expectedPath !== null && expectedPath !== undefined && reference.path !== expectedPath) {
		issues.push(`${label} reference points at another archive path.`);
	}
	if (
		expectedCanonicalSha256 !== null &&
		expectedCanonicalSha256 !== undefined &&
		reference.canonicalSha256 !== expectedCanonicalSha256
	) {
		issues.push(`${label} reference differs from the expected canonical SHA-256.`);
	}
	const records = (provenanceManifest.trackedArtifacts ?? []).filter(
		(record) => record?.kind === reference.kind && record?.path === reference.path
	);
	if (records.length !== 1) {
		issues.push(`${label} must have exactly one tracked archive record.`);
		return null;
	}
	const record = records[0];
	if (
		record.sha256 !== reference.sha256 ||
		record.canonicalSha256 !== reference.canonicalSha256 ||
		(reference.bytes !== undefined && record.bytes !== reference.bytes)
	) {
		issues.push(`${label} reference differs from its tracked archive record.`);
	}
	return readTrackedJsonRecord({
		archiveRoot,
		record,
		label,
		issues
	});
}

function validateAbsentBindings(fields, metadata, provenanceBindings, message, issues) {
	if (hasAnyBinding(fields, metadata, provenanceBindings)) issues.push(message);
}

function hasAnyBinding(fields, ...records) {
	return fields.some((field) =>
		records.some(
			(record) => isRecord(record) && record[field] !== null && record[field] !== undefined
		)
	);
}

function hasTrackedArtifactKind(provenanceManifest, kind) {
	return (
		Array.isArray(provenanceManifest.trackedArtifacts) &&
		provenanceManifest.trackedArtifacts.some((record) => record?.kind === kind)
	);
}

function findEffectiveCohortManifestRecord({ provenanceManifest, effectiveCohortIndex, issues }) {
	const tracked = Array.isArray(provenanceManifest.trackedArtifacts)
		? provenanceManifest.trackedArtifacts
		: [];
	let expectedPath = null;
	try {
		expectedPath = normalizeArchivePath(
			`${effectiveCohortIndex?.referenceRoot}/${effectiveCohortIndex?.manifestPath}`
		);
	} catch (error) {
		issues.push(errorMessage(error));
	}
	const records = tracked.filter(
		(record) => record?.kind === 'effective-cohort-manifest' && record?.path === expectedPath
	);
	if (records.length !== 1) {
		issues.push('Archive must track exactly one immutable effective-cohort manifest.');
		return null;
	}
	if (!records[0].path.startsWith(`${EFFECTIVE_COHORT_ROOT}/`)) {
		issues.push('Effective-cohort manifest is outside its archive reference root.');
		return null;
	}
	return records[0];
}

function validateEffectiveCohortIndex({
	index,
	metadata,
	provenanceManifest,
	basePlanSha256,
	effectivePlanSha256,
	candidateCount,
	candidateSetSha256,
	hasTypedRemap,
	hasDifficultyAdjustment,
	issues
}) {
	if (!isRecord(index)) return;
	if (
		index.schemaVersion !== EFFECTIVE_COHORT_INDEX_SCHEMA ||
		index.referenceRoot !== EFFECTIVE_COHORT_ROOT ||
		typeof index.manifestPath !== 'string' ||
		!index.manifestPath ||
		index.manifestSha256 !== metadata.effectiveCohortManifestSha256 ||
		index.basePlanSha256 !== basePlanSha256 ||
		index.effectivePlanSha256 !== effectivePlanSha256 ||
		index.candidateCount !== candidateCount ||
		index.candidateSetSha256 !== candidateSetSha256
	) {
		issues.push('Effective-cohort provenance index differs from the accepted release evidence.');
	}
	if (
		hasTypedRemap &&
		(index.durableReceiptSha256 !== metadata.curriculumRemapDurableReceiptSha256 ||
			index.remapManifestSetSha256 !== metadata.descendantRemapManifestSetSha256)
	) {
		issues.push('Effective-cohort provenance index differs from typed remap evidence.');
	}
	if (
		!hasTypedRemap &&
		((index.durableReceiptSha256 !== null && index.durableReceiptSha256 !== undefined) ||
			(index.remapManifestSetSha256 !== undefined &&
				index.remapManifestSetSha256 !== canonicalHash([])))
	) {
		issues.push('Effective-cohort provenance index contains unexpected typed remap evidence.');
	}
	if (
		hasDifficultyAdjustment &&
		index.difficultyAdjustmentManifestSetSha256 !== metadata.difficultyAdjustmentManifestSetSha256
	) {
		issues.push('Effective-cohort provenance index differs from difficulty-adjustment evidence.');
	}
	if (
		!hasDifficultyAdjustment &&
		index.difficultyAdjustmentManifestSetSha256 !== undefined &&
		index.difficultyAdjustmentManifestSetSha256 !== canonicalHash([])
	) {
		issues.push(
			'Effective-cohort provenance index contains unexpected difficulty-adjustment evidence.'
		);
	}
	if (
		index.candidateCount !== undefined &&
		(!Number.isSafeInteger(index.candidateCount) || index.candidateCount < 1)
	) {
		issues.push('Effective-cohort provenance index candidateCount is invalid.');
	}
	if (
		provenanceManifest.bindings?.effectiveCohortManifestSha256 !== index.manifestSha256 ||
		provenanceManifest.bindings?.effectiveCohortCandidateSetSha256 !== index.candidateSetSha256
	) {
		issues.push('Effective-cohort provenance index differs from archive bindings.');
	}
	if (
		hasTypedRemap &&
		provenanceManifest.bindings?.curriculumRemapDurableReceiptSha256 !== index.durableReceiptSha256
	) {
		issues.push('Effective-cohort provenance index durable receipt differs from archive bindings.');
	}
}

function readRequiredSiblingJson({ releaseRoot, fileName, label, issues }) {
	const filePath = path.join(releaseRoot, fileName);
	try {
		if (!existsSync(filePath)) throw new Error(`${label} is missing: ${filePath}`);
		const stats = lstatSync(filePath);
		if (stats.isSymbolicLink() || !stats.isFile()) {
			throw new Error(`${label} must be a regular non-symlink file: ${filePath}`);
		}
		const bytes = readFileSync(filePath);
		return {
			path: filePath,
			bytes,
			value: JSON.parse(bytes.toString('utf8'))
		};
	} catch (error) {
		issues.push(errorMessage(error));
		return null;
	}
}

function readTrackedJson({
	archiveRoot,
	provenanceManifest,
	path: archivePath,
	kind,
	label,
	issues
}) {
	const tracked = Array.isArray(provenanceManifest.trackedArtifacts)
		? provenanceManifest.trackedArtifacts
		: [];
	const records = tracked.filter((record) => record?.path === archivePath && record?.kind === kind);
	if (records.length !== 1) {
		issues.push(`${label} must have exactly one tracked archive record.`);
		return null;
	}
	return readTrackedJsonRecord({
		archiveRoot,
		record: records[0],
		label,
		issues
	});
}

function readTrackedJsonRecord({ archiveRoot, record, label, issues }) {
	try {
		const archivePath = normalizeArchivePath(record?.path);
		const filePath = requireContainedFile(archiveRoot, archivePath, label);
		const bytes = readFileSync(filePath);
		const value = JSON.parse(bytes.toString('utf8'));
		if (
			!HASH.test(String(record.sha256 ?? '')) ||
			sha256(bytes) !== record.sha256 ||
			(record.canonicalSha256 !== undefined && record.canonicalSha256 !== canonicalHash(value))
		) {
			throw new Error(`${label} differs from its tracked byte/canonical binding.`);
		}
		return value;
	} catch (error) {
		issues.push(errorMessage(error));
		return null;
	}
}

function requireArchiveRoot(archiveRoot) {
	const resolved = path.resolve(archiveRoot);
	if (!existsSync(resolved)) throw new Error('Release provenance archive does not exist.');
	const stats = lstatSync(resolved);
	if (stats.isSymbolicLink() || !stats.isDirectory()) {
		throw new Error('Release provenance archive must be a real directory.');
	}
	return realpathSync(resolved);
}

function requireContainedFile(archiveRoot, archivePath, label) {
	const filePath = path.join(archiveRoot, archivePath);
	if (!existsSync(filePath)) throw new Error(`${label} is missing.`);
	const stats = lstatSync(filePath);
	if (stats.isSymbolicLink() || !stats.isFile()) {
		throw new Error(`${label} must be a regular non-symlink file.`);
	}
	const real = realpathSync(filePath);
	if (!isWithin(archiveRoot, real)) throw new Error(`${label} escapes the provenance archive.`);
	return real;
}

function normalizeArchivePath(value) {
	if (typeof value !== 'string' || !value || path.isAbsolute(value)) {
		throw new Error('Tracked archive path must be a non-empty relative path.');
	}
	const normalized = value.split('/').join(path.sep);
	if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
		throw new Error('Tracked archive path escapes the provenance archive.');
	}
	return normalized.split(path.sep).join('/');
}

function isWithin(root, target) {
	return target === root || target.startsWith(`${root}${path.sep}`);
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

function failed(issues) {
	return { status: 'failed', issues };
}
