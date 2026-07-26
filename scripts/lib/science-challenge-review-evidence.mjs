import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { validateScienceChallengeModelRunPolicy } from './science-challenge-authoring-run-policy.mjs';
import {
	SCIENCE_QUESTION_ART_REVIEW_INPUT_SCHEMA,
	SCIENCE_QUESTION_ART_REVIEW_SCHEMA,
	canonicalHash,
	sha256,
	validateIndependentArtReviewRow
} from './science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY,
	validateScienceChallengeContentReviewRow,
	validateScienceChallengeCurriculumRemapProposalEvidenceList,
	validateScienceChallengeCurriculumRemapProposals,
	validateScienceChallengeCurriculumRemapVerifierInput
} from './science-challenge-curriculum-remap-review.mjs';
import {
	buildScienceChallengeCurriculumRemapDurableReceipt,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY,
	validateScienceChallengeCurriculumRemapDurableReceipt
} from './science-challenge-curriculum-remap-durable.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY,
	validateScienceChallengeDifficultyPlanAdjustmentProposalEvidenceList,
	validateScienceChallengeDifficultyPlanAdjustmentProposals,
	validateScienceChallengeDifficultyPlanAdjustmentReviewRow,
	validateScienceChallengeDifficultyPlanAdjustmentVerifierInput
} from './science-challenge-difficulty-plan-adjustment-review.mjs';
import {
	SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA,
	validateScienceChallengeAssignmentPeerEvidence
} from './science-challenge-verification-peers.mjs';
import { validateScienceChallengeVerifierDispatchLedger } from './science-challenge-verifier-dispatch.mjs';
import {
	buildScienceChallengeVerifierPacketBundle,
	SCIENCE_CHALLENGE_VERIFIER_PACKET_MANIFEST_SCHEMA,
	validateScienceChallengeReviewRebaseIndexBindings,
	validateScienceChallengeReviewRebaseInfrastructureRecoveryIndexBinding
} from './science-challenge-verifier-packets.mjs';
import { validateScienceChallengeReviewRebaseSuccessorLineage } from './science-challenge-effective-cohort.mjs';

const CONTENT_SUMMARY_SCHEMA = 'science-challenge-independent-verification-summary/v1';
const ASSIGNMENT_INDEX_SCHEMA = 'science-challenge-verification-assignment-index/v1';
const CONTENT_RESULT_SCHEMA = 'science-challenge-independent-verification/v1';
const ART_REVIEW_SCHEMA = SCIENCE_QUESTION_ART_REVIEW_SCHEMA;
const ART_REVIEW_INPUT_SCHEMA = SCIENCE_QUESTION_ART_REVIEW_INPUT_SCHEMA;
export const ART_REVIEW_REQUEST_SCHEMA = 'science-question-art-review-request/v2';
export const ART_REVIEW_RUBRIC_VERSION = 'science-question-art-review-rubric/v2';
const REVIEW_MODEL = 'gpt-5.6-sol';
const REVIEW_THINKING = 'max';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_SUCCESSOR_EMPTY_RECOVERY_BINDING_SCHEMA =
	'science-challenge-review-rebase-successor-empty-recovery-binding/v1';

export function buildScienceChallengeReviewRebaseSuccessorEmptyRecoveryBinding({
	effectiveCohort,
	reviewRebaseEvidence,
	reviewRebaseInfrastructureRecoveryEvidence = null
}) {
	const ancestry = validateScienceChallengeReviewRebaseSuccessorLineage({
		effectiveCohort,
		reviewRebaseEvidence,
		reviewRebaseInfrastructureRecoveryEvidence
	});
	if (ancestry.status !== 'passed') {
		throw new Error(
			`Authenticated review-rebase successor ancestry is invalid:\n${(ancestry.issues ?? []).join(
				'\n'
			)}`
		);
	}
	const emptyRecoverySetSha256 = canonicalHash([]);
	if (
		!Array.isArray(effectiveCohort.recoveries) ||
		effectiveCohort.recoveries.length !== 0 ||
		effectiveCohort.manifest.recoveryCount !== 0 ||
		effectiveCohort.manifest.recoverySetSha256 !== emptyRecoverySetSha256
	) {
		throw new Error(
			'Authenticated review-rebase successor does not bind the canonical empty recovery set.'
		);
	}
	const binding = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_SUCCESSOR_EMPTY_RECOVERY_BINDING_SCHEMA,
		effectiveCohortManifestSha256: canonicalHash(effectiveCohort.manifest),
		recoverySetSha256: emptyRecoverySetSha256
	};
	if (effectiveCohort.manifest.infrastructureRecovery !== undefined) {
		const infrastructureRecovery = effectiveCohort.manifest.infrastructureRecovery;
		if (
			!infrastructureRecovery ||
			typeof infrastructureRecovery !== 'object' ||
			Array.isArray(infrastructureRecovery) ||
			!/^[a-f0-9]{64}$/u.test(String(infrastructureRecovery.manifestSha256 ?? '')) ||
			!/^[a-f0-9]{64}$/u.test(String(infrastructureRecovery.recoveryId ?? ''))
		) {
			throw new Error(
				'Authenticated review-rebase successor infrastructure-recovery binding is invalid.'
			);
		}
		binding.reviewRebaseInfrastructureRecoveryManifestSha256 =
			infrastructureRecovery.manifestSha256;
		binding.reviewRebaseInfrastructureRecoveryId = infrastructureRecovery.recoveryId;
	}
	return binding;
}

export function buildArtReviewRequest({
	specs,
	assetInventory,
	model = REVIEW_MODEL,
	thinkingLevel = REVIEW_THINKING
}) {
	const inventoryById = new Map(assetInventory.map((asset) => [asset.id, asset]));
	return {
		schemaVersion: ART_REVIEW_REQUEST_SCHEMA,
		rubricVersion: ART_REVIEW_RUBRIC_VERSION,
		model,
		thinkingLevel,
		manifestSpecsSha256: canonicalHash(specs),
		assetInventorySha256: canonicalHash(assetInventory),
		attachments: specs.flatMap((spec) => {
			const inventory = inventoryById.get(spec.id);
			return ['dark', 'light'].map((theme) => ({
				id: spec.id,
				theme,
				path: spec.output[`${theme}Path`],
				sha256: inventory?.[`${theme}Sha256`] ?? null
			}));
		})
	};
}

export function buildArtReviewModelTurn({ prompt, structuredInput, ...options }) {
	if (typeof prompt !== 'string' || !prompt.trim()) {
		throw new Error('Art review model turn requires a non-empty text prompt.');
	}
	if (
		!Array.isArray(structuredInput) ||
		structuredInput.length < 3 ||
		structuredInput[0]?.type !== 'text' ||
		structuredInput[0]?.text !== prompt ||
		!structuredInput.some((item) => item?.type === 'local_image')
	) {
		throw new Error(
			'Art review model turn requires structured text plus local-image input, separate from the text prompt.'
		);
	}
	return { prompt, structuredInput, ...options };
}

export function requireContentVerificationEvidence({
	summary,
	summaryPath,
	plan,
	basePlan = plan,
	expectedCurriculumRemapVerifierInput = null,
	expectedDifficultyPlanAdjustmentVerifierInput = null,
	expectedReviewRebaseEvidence = null,
	expectedReviewRebaseSuccessorEmptyRecoveryBinding = null,
	sourceSnapshot,
	curriculumEvidence,
	rootDir,
	requiredStatus,
	expectedCount = plan.rows.length
}) {
	const issues = [];
	const evidencePaths = new Set();
	if (summary?.schemaVersion !== CONTENT_SUMMARY_SCHEMA) {
		issues.push(`summary schemaVersion must be ${CONTENT_SUMMARY_SCHEMA}.`);
	}
	const planSha256 = canonicalHash(plan);
	const basePlanSha256 = canonicalHash(basePlan);
	const sourceSnapshotSha256 = canonicalHash(sourceSnapshot);
	const curriculumEvidenceSha256 = canonicalHash(curriculumEvidence);
	if (
		summary?.planId !== plan.planId ||
		summary?.planSha256 !== planSha256 ||
		(summary?.basePlanSha256 ?? summary?.planSha256) !== basePlanSha256 ||
		(summary?.effectivePlanSha256 ?? summary?.planSha256) !== planSha256 ||
		summary?.sourceSnapshotSha256 !== sourceSnapshotSha256 ||
		summary?.curriculumEvidenceSha256 !== curriculumEvidenceSha256
	) {
		issues.push('summary does not bind the current plan, source snapshot and curriculum evidence.');
	}
	const verificationRoot = path.dirname(path.resolve(rootDir, summaryPath));
	const indexPath = path.join(verificationRoot, 'assignment-index.json');
	const ledgerPath = path.join(verificationRoot, 'dispatch-ledger.json');
	evidencePaths.add(indexPath);
	evidencePaths.add(ledgerPath);
	const index = readJsonWithinRoot(indexPath, rootDir, issues, 'assignment index');
	const ledger = readJsonWithinRoot(ledgerPath, rootDir, issues, 'dispatch ledger');
	if (!index || !ledger) return fail(issues);
	const reviewRebaseIndexValidation = validateScienceChallengeReviewRebaseIndexBindings(index);
	issues.push(
		...reviewRebaseIndexValidation.issues.map((issue) => `review rebase index: ${issue}`)
	);
	const reviewRebaseMode = reviewRebaseIndexValidation.rebaseMode;
	const infrastructureRecoveryIndexValidation =
		validateScienceChallengeReviewRebaseInfrastructureRecoveryIndexBinding(index);
	issues.push(
		...infrastructureRecoveryIndexValidation.issues.map(
			(issue) => `review rebase infrastructure recovery index: ${issue}`
		)
	);
	const infrastructureRecoveryMode =
		infrastructureRecoveryIndexValidation.infrastructureRecoveryMode;
	const emptySuccessorBindingValidation = validateReviewRebaseSuccessorEmptyRecoveryBinding(
		expectedReviewRebaseSuccessorEmptyRecoveryBinding
	);
	issues.push(...emptySuccessorBindingValidation.issues);
	const authenticatedEmptySuccessorMode =
		emptySuccessorBindingValidation.status === 'passed' &&
		expectedReviewRebaseSuccessorEmptyRecoveryBinding !== null;
	let reviewRebaseBindings = null;
	if (reviewRebaseMode) {
		if (expectedReviewRebaseEvidence?.status !== 'passed') {
			issues.push(
				'exact replayed review-rebase evidence is required for review-rebase verification.'
			);
		} else {
			try {
				reviewRebaseBindings = buildReviewRebaseBindings(
					expectedReviewRebaseEvidence,
					index.candidateSetSha256
				);
			} catch (error) {
				issues.push(
					`review-rebase replay binding failed: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	} else if (expectedReviewRebaseEvidence !== null) {
		issues.push('ordinary verification must not be given review-rebase replay authority.');
	}
	if (
		authenticatedEmptySuccessorMode &&
		(index.effectiveCohortManifestSha256 !==
			expectedReviewRebaseSuccessorEmptyRecoveryBinding.effectiveCohortManifestSha256 ||
			summary.effectiveCohortManifestSha256 !==
				expectedReviewRebaseSuccessorEmptyRecoveryBinding.effectiveCohortManifestSha256 ||
			index.recoverySetSha256 !==
				expectedReviewRebaseSuccessorEmptyRecoveryBinding.recoverySetSha256 ||
			summary.recoverySetSha256 !==
				expectedReviewRebaseSuccessorEmptyRecoveryBinding.recoverySetSha256 ||
			index.reviewRebaseInfrastructureRecoveryManifestSha256 !==
				expectedReviewRebaseSuccessorEmptyRecoveryBinding.reviewRebaseInfrastructureRecoveryManifestSha256 ||
			summary.reviewRebaseInfrastructureRecoveryManifestSha256 !==
				expectedReviewRebaseSuccessorEmptyRecoveryBinding.reviewRebaseInfrastructureRecoveryManifestSha256 ||
			index.reviewRebaseInfrastructureRecoveryId !==
				expectedReviewRebaseSuccessorEmptyRecoveryBinding.reviewRebaseInfrastructureRecoveryId ||
			summary.reviewRebaseInfrastructureRecoveryId !==
				expectedReviewRebaseSuccessorEmptyRecoveryBinding.reviewRebaseInfrastructureRecoveryId)
	) {
		issues.push(
			'authenticated review-rebase successor empty recovery binding differs from the replayed effective cohort.'
		);
	}
	if (
		index.schemaVersion !== ASSIGNMENT_INDEX_SCHEMA ||
		index.planId !== plan.planId ||
		index.planSha256 !== planSha256 ||
		(index.basePlanSha256 ?? index.planSha256) !== basePlanSha256 ||
		(index.effectivePlanSha256 ?? index.planSha256) !== planSha256 ||
		index.sourceSnapshotSha256 !== sourceSnapshotSha256 ||
		index.curriculumEvidenceSha256 !== curriculumEvidenceSha256 ||
		summary.curriculumRemapVerifierInputSha256 !== index.curriculumRemapVerifierInputSha256 ||
		summary.difficultyPlanAdjustmentVerifierInputSha256 !==
			index.difficultyPlanAdjustmentVerifierInputSha256 ||
		summary.effectiveCohortManifestSha256 !== index.effectiveCohortManifestSha256 ||
		summary.recoverySetSha256 !== index.recoverySetSha256 ||
		summary.reviewRebaseInfrastructureRecoveryManifestSha256 !==
			index.reviewRebaseInfrastructureRecoveryManifestSha256 ||
		summary.reviewRebaseInfrastructureRecoveryId !== index.reviewRebaseInfrastructureRecoveryId ||
		canonicalHash(index) !== summary.indexSha256
	) {
		issues.push('assignment index provenance differs from the summary or current evidence.');
	}
	if (reviewRebaseBindings) {
		const expectedBindings = {
			planId: expectedReviewRebaseEvidence.plan.planId,
			planSha256: expectedReviewRebaseEvidence.coreManifest.planSha256,
			basePlanSha256: expectedReviewRebaseEvidence.coreManifest.basePlanSha256,
			effectivePlanSha256: expectedReviewRebaseEvidence.coreManifest.planSha256,
			sourceSnapshotSha256: expectedReviewRebaseEvidence.coreManifest.sourceSnapshotSha256,
			curriculumEvidenceSha256: expectedReviewRebaseEvidence.coreManifest.curriculumEvidenceSha256,
			candidateCount: expectedReviewRebaseEvidence.coreManifest.candidateCount,
			candidateSetSha256: expectedReviewRebaseEvidence.coreManifest.candidateSetSha256,
			...reviewRebaseBindings
		};
		for (const [field, expected] of Object.entries(expectedBindings)) {
			if (
				canonicalHash(index[field]) !== canonicalHash(expected) ||
				(field.startsWith('reviewRebase') &&
					canonicalHash(summary[field]) !== canonicalHash(expected))
			) {
				issues.push(`review-rebase ${field} differs from exact replay.`);
			}
		}
	}
	if (index.curriculumRemapVerifierInputSha256 && !expectedCurriculumRemapVerifierInput) {
		issues.push('expected curriculum remap verifier input is required for replay.');
	}
	if (
		index.difficultyPlanAdjustmentVerifierInputSha256 &&
		!expectedDifficultyPlanAdjustmentVerifierInput
	) {
		issues.push('expected difficulty-plan adjustment verifier input is required for replay.');
	}
	if (
		expectedCurriculumRemapVerifierInput &&
		(index.curriculumRemapVerifierInputSha256 !==
			canonicalHash(expectedCurriculumRemapVerifierInput) ||
			expectedCurriculumRemapVerifierInput.basePlanSha256 !== basePlanSha256 ||
			expectedCurriculumRemapVerifierInput.effectivePlanSha256 !== planSha256 ||
			canonicalHash(expectedCurriculumRemapVerifierInput.effectivePlan) !== planSha256 ||
			index.curriculumCatalogSha256 !==
				expectedCurriculumRemapVerifierInput.curriculumCatalogSha256 ||
			index.effectiveCohortManifestSha256 !==
				expectedCurriculumRemapVerifierInput.effectiveCohortManifestSha256 ||
			index.candidateCount !== expectedCurriculumRemapVerifierInput.candidateCount ||
			index.candidateSetSha256 !== expectedCurriculumRemapVerifierInput.candidateSetSha256 ||
			index.remapManifestSetSha256 !== expectedCurriculumRemapVerifierInput.remapManifestSetSha256)
	) {
		issues.push('expected curriculum remap verifier input differs from the bound plan/index.');
	}
	if (
		expectedDifficultyPlanAdjustmentVerifierInput &&
		(index.difficultyPlanAdjustmentVerifierInputSha256 !==
			canonicalHash(expectedDifficultyPlanAdjustmentVerifierInput) ||
			expectedDifficultyPlanAdjustmentVerifierInput.basePlanSha256 !== basePlanSha256 ||
			expectedDifficultyPlanAdjustmentVerifierInput.effectivePlanSha256 !== planSha256 ||
			canonicalHash(expectedDifficultyPlanAdjustmentVerifierInput.basePlan) !== basePlanSha256 ||
			canonicalHash(expectedDifficultyPlanAdjustmentVerifierInput.effectivePlan) !== planSha256 ||
			index.effectiveCohortManifestSha256 !==
				expectedDifficultyPlanAdjustmentVerifierInput.effectiveCohortManifestSha256 ||
			index.candidateCount !== expectedDifficultyPlanAdjustmentVerifierInput.candidateCount ||
			index.candidateSetSha256 !==
				expectedDifficultyPlanAdjustmentVerifierInput.candidateSetSha256 ||
			index.difficultyAdjustmentManifestSetSha256 !==
				expectedDifficultyPlanAdjustmentVerifierInput.adjustmentManifestSetSha256 ||
			index.recoverySetSha256 !== expectedDifficultyPlanAdjustmentVerifierInput.recoverySetSha256 ||
			canonicalHash(expectedDifficultyPlanAdjustmentVerifierInput.recoveries) !==
				expectedDifficultyPlanAdjustmentVerifierInput.recoverySetSha256)
	) {
		issues.push(
			'expected difficulty-plan adjustment verifier input differs from the bound plan/index.'
		);
	}
	if (
		expectedCurriculumRemapVerifierInput &&
		(index.recoverySetSha256 !== expectedCurriculumRemapVerifierInput.recoverySetSha256 ||
			canonicalHash(expectedCurriculumRemapVerifierInput.recoveries) !==
				expectedCurriculumRemapVerifierInput.recoverySetSha256)
	) {
		issues.push('expected curriculum remap verifier input has a stale recovery set binding.');
	}
	if (
		expectedCurriculumRemapVerifierInput &&
		expectedDifficultyPlanAdjustmentVerifierInput &&
		(expectedCurriculumRemapVerifierInput.recoverySetSha256 !==
			expectedDifficultyPlanAdjustmentVerifierInput.recoverySetSha256 ||
			canonicalHash(expectedCurriculumRemapVerifierInput.recoveries) !==
				canonicalHash(expectedDifficultyPlanAdjustmentVerifierInput.recoveries) ||
			expectedCurriculumRemapVerifierInput.effectiveCohortManifestSha256 !==
				expectedDifficultyPlanAdjustmentVerifierInput.effectiveCohortManifestSha256)
	) {
		issues.push(
			'curriculum-remap and difficulty-plan verifier inputs must bind the identical replayable recovery set.'
		);
	}
	if (
		!expectedCurriculumRemapVerifierInput &&
		!expectedDifficultyPlanAdjustmentVerifierInput &&
		!authenticatedEmptySuccessorMode &&
		(index.effectiveCohortManifestSha256 !== undefined ||
			summary.effectiveCohortManifestSha256 !== undefined ||
			index.recoverySetSha256 !== undefined ||
			summary.recoverySetSha256 !== undefined ||
			index.reviewRebaseInfrastructureRecoveryManifestSha256 !== undefined ||
			summary.reviewRebaseInfrastructureRecoveryManifestSha256 !== undefined ||
			index.reviewRebaseInfrastructureRecoveryId !== undefined ||
			summary.reviewRebaseInfrastructureRecoveryId !== undefined)
	) {
		issues.push(
			'ordinary verification must not contain an effective-cohort or typed recovery-set binding.'
		);
	}
	if (
		authenticatedEmptySuccessorMode &&
		(expectedCurriculumRemapVerifierInput || expectedDifficultyPlanAdjustmentVerifierInput)
	) {
		issues.push(
			'authenticated review-rebase successor empty recovery binding cannot be combined with typed recovery authority.'
		);
	}
	if (authenticatedEmptySuccessorMode && reviewRebaseMode) {
		issues.push(
			'direct review-rebase verification cannot contain a successor empty recovery binding.'
		);
	}
	if (
		reviewRebaseMode &&
		(expectedCurriculumRemapVerifierInput || expectedDifficultyPlanAdjustmentVerifierInput)
	) {
		issues.push('review-rebase verification cannot be combined with typed recovery authority.');
	}
	const dispatchValidation = validateScienceChallengeVerifierDispatchLedger(ledger, index);
	if (
		dispatchValidation.status !== 'passed' ||
		canonicalHash(ledger) !== summary.dispatchLedgerSha256
	) {
		issues.push(
			...dispatchValidation.issues.map((issue) => `dispatch ledger: ${issue}`),
			...(canonicalHash(ledger) === summary.dispatchLedgerSha256
				? []
				: ['dispatch ledger does not bind the verification summary.'])
		);
	}
	if (!Array.isArray(index.assignments)) {
		issues.push('assignment index assignments must be an array.');
		return fail(issues);
	}
	const indexedRemapProposalCount = index.assignments.reduce(
		(sum, assignment) =>
			sum + (assignment?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY]?.length ?? 0),
		0
	);
	const indexedDifficultyPlanAdjustmentProposalCount = index.assignments.reduce(
		(sum, assignment) =>
			sum +
			(assignment?.[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY]?.length ?? 0),
		0
	);
	if (
		indexedRemapProposalCount > 0 !==
		functioningSha256(index.curriculumRemapVerifierInputSha256)
	) {
		issues.push(
			'assignment index remap proposals and curriculumRemapVerifierInputSha256 must be present together.'
		);
	}
	if (
		indexedDifficultyPlanAdjustmentProposalCount > 0 !==
		functioningSha256(index.difficultyPlanAdjustmentVerifierInputSha256)
	) {
		issues.push(
			'assignment index difficulty proposals and difficultyPlanAdjustmentVerifierInputSha256 must be present together.'
		);
	}
	let verifierPacketManifest = null;
	let verifierPackets = null;
	if (
		indexedRemapProposalCount > 0 ||
		indexedDifficultyPlanAdjustmentProposalCount > 0 ||
		reviewRebaseMode ||
		infrastructureRecoveryMode
	) {
		const packetManifestPath = path.join(verificationRoot, 'verifier-packets', 'manifest.json');
		evidencePaths.add(packetManifestPath);
		verifierPacketManifest = readJsonWithinRoot(
			packetManifestPath,
			rootDir,
			issues,
			'verifier packet manifest'
		);
		if (verifierPacketManifest) {
			verifierPackets = [];
			for (const packetRecord of verifierPacketManifest.packets ?? []) {
				const packet = readBoundJson(
					packetRecord?.packetPath,
					packetRecord?.packetSha256,
					rootDir,
					issues,
					'verifier packet'
				);
				if (packetRecord?.packetPath) {
					evidencePaths.add(path.resolve(rootDir, packetRecord.packetPath));
				}
				if (packet) {
					const payloads = [];
					for (const wave of packet.waves ?? []) {
						const payload = readBoundJson(
							wave?.followupPayloadPath,
							wave?.followupPayloadSha256,
							rootDir,
							issues,
							'verifier wave followup payload'
						);
						if (wave?.followupPayloadPath) {
							evidencePaths.add(path.resolve(rootDir, wave.followupPayloadPath));
						}
						if (payload) {
							payloads.push({
								payloadPath: wave.followupPayloadPath,
								payload
							});
						}
					}
					verifierPackets.push({
						packetPath: packetRecord.packetPath,
						packet,
						payloads
					});
				}
			}
		}
	}
	const expectedAssignmentIds = [...new Set(plan.rows.map((row) => row.shard))].sort();
	if (
		index.assignments.length !== expectedAssignmentIds.length ||
		index.assignments.some(
			(assignment, assignmentIndex) =>
				assignment.assignmentId !== expectedAssignmentIds[assignmentIndex]
		)
	) {
		issues.push('assignment index membership differs from the planned shards.');
	}
	const dispatchByAssignment = new Map(
		Array.isArray(ledger.dispatches)
			? ledger.dispatches.map((dispatch) => [dispatch.assignmentId, dispatch])
			: []
	);
	const resultByAssignment = new Map(
		Array.isArray(summary.assignmentResults)
			? summary.assignmentResults.map((result) => [result.assignmentId, result])
			: []
	);
	if (
		!Array.isArray(summary.assignmentResults) ||
		resultByAssignment.size !== index.assignments.length
	) {
		issues.push('summary must contain one unique raw result binding per assignment.');
	}
	const rawReviews = [];
	const rawCurriculumRemapProposals = [];
	const rawCurriculumRemapProposalEvidence = [];
	const rawDifficultyPlanAdjustmentProposals = [];
	const rawDifficultyPlanAdjustmentProposalEvidence = [];
	const candidateById = new Map();
	const assignmentEvidenceValues = [];
	for (const assignmentRecord of index.assignments) {
		const assignment = readBoundJson(
			assignmentRecord.path,
			assignmentRecord.sha256,
			rootDir,
			issues,
			`assignment ${assignmentRecord.assignmentId}`
		);
		evidencePaths.add(path.resolve(rootDir, String(assignmentRecord.path ?? '')));
		if (!assignment) continue;
		const { evidenceSha256, ...assignmentCore } = assignment;
		const expectedRows = plan.rows.filter((row) => row.shard === assignmentRecord.assignmentId);
		const itemIds = Array.isArray(assignment.items)
			? assignment.items.map((item) => item?.candidate?.definition?.id)
			: [];
		if (
			assignment.schemaVersion !== SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA ||
			assignment.assignmentId !== assignmentRecord.assignmentId ||
			assignment.planSha256 !== planSha256 ||
			(assignment.basePlanSha256 ?? assignment.planSha256) !== basePlanSha256 ||
			(assignment.effectivePlanSha256 ?? assignment.planSha256) !== planSha256 ||
			assignment.sourceSnapshotSha256 !== sourceSnapshotSha256 ||
			assignment.curriculumEvidenceSha256 !== curriculumEvidenceSha256 ||
			(reviewRebaseMode &&
				(!reviewRebaseBindings ||
					canonicalHash(
						Object.fromEntries(
							[
								'reviewRebaseManifestSha256',
								'reviewRebaseId',
								'reviewRebaseCandidateSetSha256',
								'reviewRebaseCollectionRemediationSetSha256',
								'reviewRebaseCollectionRemediations'
							].map((field) => [field, assignment[field]])
						)
					) !==
						canonicalHash(
							Object.fromEntries(
								[
									'reviewRebaseManifestSha256',
									'reviewRebaseId',
									'reviewRebaseCandidateSetSha256',
									'reviewRebaseCollectionRemediationSetSha256',
									'reviewRebaseCollectionRemediations'
								].map((field) => [field, assignmentRecord[field]])
							)
						) ||
					!assignment.items.every((item) =>
						reviewRebaseItemMatchesReplay(item, expectedReviewRebaseEvidence)
					))) ||
			evidenceSha256 !== canonicalHash(assignmentCore) ||
			itemIds.length !== expectedRows.length ||
			itemIds.some((id, itemIndex) => id !== expectedRows[itemIndex]?.id)
		) {
			issues.push(`${assignmentRecord.assignmentId} assignment evidence is stale or malformed.`);
		}
		assignmentEvidenceValues.push(assignment);
		for (const item of assignment.items ?? []) {
			if (item?.candidate?.definition?.id) {
				candidateById.set(item.candidate.definition.id, item.candidate);
			}
		}
		const indexProposals =
			assignmentRecord[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY] ?? [];
		const evidenceProposals =
			assignment[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY] ?? [];
		const candidateSha256ById = new Map(
			(assignment.items ?? []).map((item) => [
				item?.candidate?.definition?.id,
				canonicalHash(item?.candidate)
			])
		);
		const historicalRemapCandidates = historicalRemapCandidateBindings(
			expectedCurriculumRemapVerifierInput
		);
		for (const [challengeId, candidateSha256] of historicalRemapCandidates.targetById) {
			if (assignmentRecord.ids.includes(challengeId)) {
				candidateSha256ById.set(challengeId, candidateSha256);
			}
		}
		let proposalsValid = true;
		if (
			(indexProposals.length > 0 || evidenceProposals.length > 0) &&
			(!index.basePlanSha256 ||
				!index.effectivePlanSha256 ||
				!assignment.basePlanSha256 ||
				!assignment.effectivePlanSha256)
		) {
			issues.push(
				`${assignmentRecord.assignmentId} remap verification requires explicit basePlanSha256 and effectivePlanSha256 bindings.`
			);
			proposalsValid = false;
		}
		for (const [label, proposals] of [
			['assignment index', indexProposals],
			['assignment evidence', evidenceProposals]
		]) {
			const proposalValidation = validateScienceChallengeCurriculumRemapProposals(proposals, {
				assignedChallengeIds: assignmentRecord.ids,
				basePlanSha256,
				effectivePlanSha256: planSha256,
				curriculumEvidenceSha256,
				candidateById: candidateSha256ById
			});
			if (proposalValidation.status !== 'passed') proposalsValid = false;
			for (const issue of proposalValidation.issues) {
				issues.push(
					`${assignmentRecord.assignmentId} ${label} ${SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY}${issue}`
				);
			}
		}
		if (canonicalHash(indexProposals) !== canonicalHash(evidenceProposals)) {
			issues.push(
				`${assignmentRecord.assignmentId} assignment remap proposals differ from their bound index row.`
			);
			proposalsValid = false;
		}
		const indexProposalEvidence =
			assignmentRecord[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY] ?? [];
		const assignmentProposalEvidence =
			assignment[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY] ?? [];
		for (const [label, proposalEvidence] of [
			['assignment index', indexProposalEvidence],
			['assignment evidence', assignmentProposalEvidence]
		]) {
			const displayValidation = validateScienceChallengeCurriculumRemapProposalEvidenceList(
				proposalEvidence,
				{
					proposals: evidenceProposals
				}
			);
			if (displayValidation.status !== 'passed') proposalsValid = false;
			for (const issue of displayValidation.issues) {
				issues.push(
					`${assignmentRecord.assignmentId} ${label} ${SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY}${issue}`
				);
			}
		}
		if (canonicalHash(indexProposalEvidence) !== canonicalHash(assignmentProposalEvidence)) {
			issues.push(
				`${assignmentRecord.assignmentId} reviewer-visible remap proposal evidence differs from its bound index row.`
			);
			proposalsValid = false;
		}
		if (proposalsValid) {
			rawCurriculumRemapProposals.push(...evidenceProposals);
			rawCurriculumRemapProposalEvidence.push(...assignmentProposalEvidence);
		}
		const indexDifficultyProposalValue =
			assignmentRecord[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY];
		const assignmentDifficultyProposalValue =
			assignment[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY];
		const indexDifficultyProposals = Array.isArray(indexDifficultyProposalValue)
			? indexDifficultyProposalValue
			: [];
		const assignmentDifficultyProposals = Array.isArray(assignmentDifficultyProposalValue)
			? assignmentDifficultyProposalValue
			: [];
		let difficultyProposalsValid = true;
		if (
			(indexDifficultyProposalValue !== undefined &&
				!Array.isArray(indexDifficultyProposalValue)) ||
			(assignmentDifficultyProposalValue !== undefined &&
				!Array.isArray(assignmentDifficultyProposalValue))
		) {
			issues.push(
				`${assignmentRecord.assignmentId} difficulty proposals must be arrays when present.`
			);
			difficultyProposalsValid = false;
		}
		if (
			(indexDifficultyProposals.length > 0 || assignmentDifficultyProposals.length > 0) &&
			(!index.basePlanSha256 ||
				!index.effectivePlanSha256 ||
				!assignment.basePlanSha256 ||
				!assignment.effectivePlanSha256)
		) {
			issues.push(
				`${assignmentRecord.assignmentId} difficulty verification requires explicit basePlanSha256 and effectivePlanSha256 bindings.`
			);
			difficultyProposalsValid = false;
		}
		for (const [label, proposals] of [
			['assignment index', indexDifficultyProposals],
			['assignment evidence', assignmentDifficultyProposals]
		]) {
			const proposalValidation = validateScienceChallengeDifficultyPlanAdjustmentProposals(
				proposals,
				{
					assignedChallengeIds: assignmentRecord.ids,
					basePlanSha256,
					effectivePlanSha256: planSha256
				}
			);
			if (proposalValidation.status !== 'passed') difficultyProposalsValid = false;
			for (const issue of proposalValidation.issues) {
				issues.push(
					`${assignmentRecord.assignmentId} ${label} ${SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY}: ${issue}`
				);
			}
		}
		if (canonicalHash(indexDifficultyProposals) !== canonicalHash(assignmentDifficultyProposals)) {
			issues.push(
				`${assignmentRecord.assignmentId} assignment difficulty proposals differ from their bound index row.`
			);
			difficultyProposalsValid = false;
		}
		const indexDifficultyProposalEvidence =
			assignmentRecord[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY] ??
			[];
		const assignmentDifficultyProposalEvidence =
			assignment[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY] ?? [];
		for (const [label, proposalEvidence, proposals] of [
			['assignment index', indexDifficultyProposalEvidence, indexDifficultyProposals],
			['assignment evidence', assignmentDifficultyProposalEvidence, assignmentDifficultyProposals]
		]) {
			const displayValidation =
				validateScienceChallengeDifficultyPlanAdjustmentProposalEvidenceList(proposalEvidence, {
					proposals
				});
			if (displayValidation.status !== 'passed') difficultyProposalsValid = false;
			for (const issue of displayValidation.issues) {
				issues.push(
					`${assignmentRecord.assignmentId} ${label} ${SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY}: ${issue}`
				);
			}
		}
		if (
			canonicalHash(indexDifficultyProposalEvidence) !==
			canonicalHash(assignmentDifficultyProposalEvidence)
		) {
			issues.push(
				`${assignmentRecord.assignmentId} reviewer-visible difficulty proposal evidence differs from its bound index row.`
			);
			difficultyProposalsValid = false;
		}
		if (difficultyProposalsValid) {
			rawDifficultyPlanAdjustmentProposals.push(...assignmentDifficultyProposals);
			rawDifficultyPlanAdjustmentProposalEvidence.push(...assignmentDifficultyProposalEvidence);
		}
		const resultRecord = resultByAssignment.get(assignmentRecord.assignmentId);
		const result = resultRecord
			? readBoundJson(
					resultRecord.path,
					resultRecord.sha256,
					rootDir,
					issues,
					`review result ${assignmentRecord.assignmentId}`
				)
			: null;
		if (resultRecord?.path) evidencePaths.add(path.resolve(rootDir, resultRecord.path));
		if (!resultRecord || !result) {
			issues.push(`${assignmentRecord.assignmentId} has no bound raw review result.`);
			continue;
		}
		const dispatch = dispatchByAssignment.get(assignmentRecord.assignmentId);
		validateContentResult(
			result,
			resultRecord,
			assignment,
			assignmentRecord,
			dispatch,
			canonicalHash(ledger),
			proposalsValid ? evidenceProposals : [],
			difficultyProposalsValid ? assignmentDifficultyProposals : [],
			issues
		);
		rawReviews.push(...(Array.isArray(result.reviews) ? result.reviews : []));
	}
	const peerValidation = validateScienceChallengeAssignmentPeerEvidence({
		assignments: assignmentEvidenceValues,
		planRows: plan.rows
	});
	for (const issue of peerValidation.issues) {
		issues.push(`assignment peer evidence: ${issue}`);
	}
	const orderedCandidates = plan.rows.map((row) => candidateById.get(row.id));
	if (
		orderedCandidates.some((candidate) => !candidate) ||
		canonicalHash(orderedCandidates) !== summary.candidateSetSha256 ||
		canonicalHash(orderedCandidates) !== index.candidateSetSha256
	) {
		issues.push('raw assignment candidates differ from the summary candidate set.');
	}
	if (expectedCurriculumRemapVerifierInput) {
		const historicalRemapCandidates = historicalRemapCandidateBindings(
			expectedCurriculumRemapVerifierInput
		);
		const expectedValidation = validateScienceChallengeCurriculumRemapVerifierInput(
			expectedCurriculumRemapVerifierInput,
			{
				assignedChallengeIds: plan.rows.map((row) => row.id),
				basePlanSha256,
				effectivePlanSha256: planSha256,
				curriculumEvidenceSha256,
				candidateById: new Map(
					plan.rows.map((row) => [
						row.id,
						historicalRemapCandidates.targetById.get(row.id) ??
							(candidateById.has(row.id) ? canonicalHash(candidateById.get(row.id)) : null)
					])
				),
				batchCandidateById: new Map(
					plan.rows.map((row) => [row.id, historicalRemapCandidates.batchByShard.get(row.shard)])
				)
			}
		);
		issues.push(
			...expectedValidation.issues.map(
				(issue) => `expected curriculum remap verifier input: ${issue}`
			)
		);
		if (
			canonicalHash(expectedCurriculumRemapVerifierInput.proposals) !==
				canonicalHash(rawCurriculumRemapProposals) ||
			canonicalHash(expectedCurriculumRemapVerifierInput.evidence) !==
				canonicalHash(rawCurriculumRemapProposalEvidence)
		) {
			issues.push('raw assignments omit or alter the expected curriculum remap proposal set.');
		}
	} else if (rawCurriculumRemapProposals.length > 0) {
		issues.push('expected curriculum remap verifier input is required for assigned proposals.');
	}
	if (expectedDifficultyPlanAdjustmentVerifierInput) {
		const expectedValidation = validateScienceChallengeDifficultyPlanAdjustmentVerifierInput(
			expectedDifficultyPlanAdjustmentVerifierInput,
			{
				basePlan,
				effectivePlan: plan
			}
		);
		issues.push(
			...expectedValidation.issues.map(
				(issue) => `expected difficulty-plan adjustment verifier input: ${issue}`
			)
		);
		if (
			canonicalHash(expectedDifficultyPlanAdjustmentVerifierInput.proposals) !==
				canonicalHash(rawDifficultyPlanAdjustmentProposals) ||
			canonicalHash(expectedDifficultyPlanAdjustmentVerifierInput.proposalEvidence) !==
				canonicalHash(rawDifficultyPlanAdjustmentProposalEvidence)
		) {
			issues.push(
				'raw assignments omit or alter the expected difficulty-plan adjustment proposal set.'
			);
		}
	} else if (rawDifficultyPlanAdjustmentProposals.length > 0) {
		issues.push(
			'expected difficulty-plan adjustment verifier input is required for assigned proposals.'
		);
	}
	if (
		indexedRemapProposalCount > 0 ||
		indexedDifficultyPlanAdjustmentProposalCount > 0 ||
		reviewRebaseMode ||
		infrastructureRecoveryMode
	) {
		validateVerifierPacketPayloadBindings({
			packetManifest: verifierPacketManifest,
			packets: verifierPackets,
			index,
			ledger,
			assignmentIndexPath: path.relative(rootDir, indexPath),
			dispatchLedgerPath: path.relative(rootDir, ledgerPath),
			packetRootPath: path.relative(rootDir, path.join(verificationRoot, 'verifier-packets')),
			reviewRootPath: path.relative(rootDir, path.join(verificationRoot, 'reviews')),
			issues
		});
	}
	if (
		rawReviews.length !== expectedCount ||
		canonicalHash(rawReviews) !== canonicalHash(summary.reviews)
	) {
		issues.push('summary reviews differ from the bound raw verifier results.');
	}
	const acceptedCount = rawReviews.filter((review) => review.accepted === true).length;
	const rejectedCount = rawReviews.filter((review) => review.accepted === false).length;
	const remapDecisions = rawReviews.flatMap(
		(review) => review[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY] ?? []
	);
	const acceptedRemapDecisionCount = remapDecisions.filter(
		(decision) => decision.accepted === true
	).length;
	const rejectedRemapDecisionCount = remapDecisions.filter(
		(decision) => decision.accepted === false
	).length;
	const difficultyPlanAdjustmentDecisions = rawReviews.flatMap(
		(review) => review[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY] ?? []
	);
	const acceptedDifficultyPlanAdjustmentDecisionCount = difficultyPlanAdjustmentDecisions.filter(
		(decision) => decision.accepted === true
	).length;
	const rejectedDifficultyPlanAdjustmentDecisionCount = difficultyPlanAdjustmentDecisions.filter(
		(decision) => decision.accepted === false
	).length;
	let curriculumRemapDurableReceipt = null;
	if (indexedRemapProposalCount > 0) {
		try {
			curriculumRemapDurableReceipt = buildScienceChallengeCurriculumRemapDurableReceipt({
				verifierInput: expectedCurriculumRemapVerifierInput,
				assignmentIndex: index,
				packetManifest: verifierPacketManifest,
				packets: verifierPackets,
				assignmentResults: summary.assignmentResults,
				decisions: remapDecisions
			});
			const durableValidation = validateScienceChallengeCurriculumRemapDurableReceipt(
				summary[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY],
				{
					verifierInput: expectedCurriculumRemapVerifierInput,
					assignmentIndex: index,
					packetManifest: verifierPacketManifest,
					packets: verifierPackets,
					assignmentResults: summary.assignmentResults,
					decisions: remapDecisions
				}
			);
			issues.push(
				...durableValidation.issues.map((issue) => `curriculum remap durable receipt: ${issue}`)
			);
			if (
				canonicalHash(summary[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY]) !==
					summary[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY] ||
				canonicalHash(curriculumRemapDurableReceipt) !==
					summary[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY]
			) {
				issues.push(
					'curriculum remap durable receipt hash differs from exact raw verifier replay.'
				);
			}
		} catch (error) {
			issues.push(
				`curriculum remap durable receipt replay failed: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	} else if (
		summary[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY] !== undefined ||
		summary[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY] !== undefined
	) {
		issues.push('ordinary verification must not contain a curriculum remap durable receipt.');
	}
	const summaryAcceptedRemapCount = summary.acceptedRemapDecisionCount ?? 0;
	const summaryRejectedRemapCount = summary.rejectedRemapDecisionCount ?? 0;
	const summaryAcceptedDifficultyCount = summary.acceptedDifficultyPlanAdjustmentDecisionCount ?? 0;
	const summaryRejectedDifficultyCount = summary.rejectedDifficultyPlanAdjustmentDecisionCount ?? 0;
	const reviewRebaseCollectionFailure =
		reviewRebaseBindings?.reviewRebaseCollectionRemediations.length > 0;
	if (
		summary.reviewCount !== expectedCount ||
		summary.acceptedCount !== acceptedCount ||
		summary.rejectedCount !== rejectedCount ||
		summaryAcceptedRemapCount !== acceptedRemapDecisionCount ||
		summaryRejectedRemapCount !== rejectedRemapDecisionCount ||
		summaryAcceptedDifficultyCount !== acceptedDifficultyPlanAdjustmentDecisionCount ||
		summaryRejectedDifficultyCount !== rejectedDifficultyPlanAdjustmentDecisionCount ||
		summary.assignmentCount !== index.assignments.length ||
		!Array.isArray(summary.issues) ||
		summary.issues.length !== 0 ||
		summary.status !== requiredStatus ||
		(requiredStatus === 'passed' && rejectedCount !== 0) ||
		(requiredStatus === 'passed' && rejectedRemapDecisionCount !== 0) ||
		(requiredStatus === 'passed' && rejectedDifficultyPlanAdjustmentDecisionCount !== 0) ||
		(requiredStatus === 'passed' && reviewRebaseCollectionFailure) ||
		(requiredStatus === 'failed' &&
			rejectedCount === 0 &&
			rejectedRemapDecisionCount === 0 &&
			rejectedDifficultyPlanAdjustmentDecisionCount === 0 &&
			!reviewRebaseCollectionFailure)
	) {
		issues.push('summary status and counts do not match the raw hard-gated reviews.');
	}
	return issues.length
		? fail(issues)
		: {
				status: 'passed',
				issues: [],
				index,
				ledger,
				rawReviews,
				rawCurriculumRemapProposals,
				rawDifficultyPlanAdjustmentProposals,
				curriculumRemapDecisions: remapDecisions,
				difficultyPlanAdjustmentDecisions,
				curriculumRemapDurableReceipt,
				reviewRebaseEvidence: expectedReviewRebaseEvidence,
				orderedCandidates,
				evidencePaths: [...evidencePaths].sort()
			};
}

function validateReviewRebaseSuccessorEmptyRecoveryBinding(binding) {
	if (binding === null) return { status: 'absent', issues: [] };
	const issues = [];
	if (
		!binding ||
		typeof binding !== 'object' ||
		Array.isArray(binding) ||
		binding.schemaVersion !==
			SCIENCE_CHALLENGE_REVIEW_REBASE_SUCCESSOR_EMPTY_RECOVERY_BINDING_SCHEMA
	) {
		issues.push(
			`expected review-rebase successor empty recovery binding must use ${SCIENCE_CHALLENGE_REVIEW_REBASE_SUCCESSOR_EMPTY_RECOVERY_BINDING_SCHEMA}.`
		);
		return { status: 'failed', issues };
	}
	if (!/^[a-f0-9]{64}$/u.test(String(binding.effectiveCohortManifestSha256 ?? ''))) {
		issues.push(
			'expected review-rebase successor empty recovery binding requires an effective-cohort manifest SHA-256.'
		);
	}
	if (binding.recoverySetSha256 !== canonicalHash([])) {
		issues.push(
			'expected review-rebase successor empty recovery binding must use the canonical empty recovery-set SHA-256.'
		);
	}
	const infrastructureFields = [
		'reviewRebaseInfrastructureRecoveryManifestSha256',
		'reviewRebaseInfrastructureRecoveryId'
	];
	const presentInfrastructureFields = infrastructureFields.filter(
		(field) => binding[field] !== undefined
	);
	if (
		presentInfrastructureFields.length > 0 &&
		presentInfrastructureFields.length !== infrastructureFields.length
	) {
		issues.push(
			'expected review-rebase successor infrastructure-recovery binding fields must be present all-or-none.'
		);
	}
	for (const field of presentInfrastructureFields) {
		if (!/^[a-f0-9]{64}$/u.test(String(binding[field] ?? ''))) {
			issues.push(
				`expected review-rebase successor infrastructure-recovery ${field} must be a lowercase SHA-256.`
			);
		}
	}
	const expectedFields = [
		'effectiveCohortManifestSha256',
		'recoverySetSha256',
		'schemaVersion',
		...(presentInfrastructureFields.length ? infrastructureFields : [])
	];
	if (Object.keys(binding).sort().join(',') !== expectedFields.sort().join(',')) {
		issues.push('expected review-rebase successor empty recovery binding has unknown fields.');
	}
	return issues.length ? { status: 'failed', issues } : { status: 'passed', issues: [] };
}

function historicalRemapCandidateBindings(verifierInput) {
	const targetById = new Map();
	const batchByShard = new Map();
	for (const override of verifierInput?.candidateOverrides ?? []) {
		const challengeId = override?.manifest?.challengeId;
		const target = override?.candidate?.challenges?.find(
			(entry) => entry?.definition?.id === challengeId
		);
		if (challengeId && target) targetById.set(challengeId, canonicalHash(target));
		if (override?.shardId && override?.candidateSha256) {
			batchByShard.set(override.shardId, override.candidateSha256);
		}
	}
	return { targetById, batchByShard };
}

function reviewRebaseItemMatchesReplay(item, replay) {
	if (replay?.status !== 'passed') return false;
	const id = item?.candidate?.definition?.id;
	if (!id) return false;
	const planRowIndex = replay.plan.rows.findIndex((row) => row.id === id);
	if (planRowIndex < 0 || item.planRowIndex !== planRowIndex) return false;
	const expectedCandidate = replay.candidateBatches
		.get(replay.plan.rows[planRowIndex].shard)
		?.challenges?.find((candidate) => candidate?.definition?.id === id);
	return (
		canonicalHash(item.plan) === canonicalHash(replay.plan.rows[planRowIndex]) &&
		canonicalHash(item.candidate) === canonicalHash(expectedCandidate)
	);
}

function buildReviewRebaseBindings(reviewRebase, candidateSetSha256) {
	const core = reviewRebase?.coreManifest;
	const remediations = structuredClone(core?.collectionRemediations);
	if (!Array.isArray(remediations)) {
		throw new Error('review-rebase collection remediations are missing.');
	}
	const targetIds = [...new Set(remediations.map((item) => item.preferredChallengeId))].sort();
	if (
		core.status !== 'review-pending' ||
		core.requiresFreshFullVerification !== true ||
		core.releaseEligible !== false ||
		core.candidateSetSha256 !== candidateSetSha256 ||
		core.planSha256 !== canonicalHash(reviewRebase.plan) ||
		core.collectionValidationSha256 !== canonicalHash(reviewRebase.collectionValidation) ||
		core.collectionRemediationSetSha256 !== canonicalHash(remediations) ||
		canonicalHash(reviewRebase.collectionValidation?.issues) !==
			canonicalHash(remediations.map((item) => item.issue))
	) {
		throw new Error('review-rebase replay has stale candidate, plan or collection bindings.');
	}
	return {
		reviewRebaseManifestSha256: canonicalHash(reviewRebase.manifest),
		reviewRebaseId: core.rebaseId,
		reviewRebaseCandidateSetSha256: core.candidateSetSha256,
		reviewRebaseCollectionValidationSha256: core.collectionValidationSha256,
		reviewRebaseCollectionRemediationSetSha256: core.collectionRemediationSetSha256,
		reviewRebaseCollectionRemediations: remediations,
		reviewRebaseCollectionRemediationTargetIds: targetIds,
		reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(targetIds)
	};
}

export function requireArtReviewEvidence({
	review,
	manifest,
	rootDir,
	requiredStatus,
	expectedCount = manifest.specs.length,
	useCurrentAssetBytes = true
}) {
	const issues = [];
	const evidencePaths = new Set();
	if (
		review?.schemaVersion !== ART_REVIEW_SCHEMA ||
		review?.releaseId !== manifest.releaseId ||
		review?.manifestSha256 !== canonicalHash(manifest) ||
		review?.model !== REVIEW_MODEL ||
		review?.thinkingLevel !== REVIEW_THINKING
	) {
		issues.push('art review summary metadata does not bind the current manifest/model.');
	}
	const currentInventory = useCurrentAssetBytes
		? buildArtInventory(manifest.specs, rootDir, issues)
		: null;
	if (currentInventory && review?.assetInventorySha256 !== canonicalHash(currentInventory)) {
		issues.push('art review summary does not bind the current image bytes.');
	}
	if (!Array.isArray(review?.batches) || !Array.isArray(review?.reviews)) {
		issues.push('art review summary batches and reviews must be arrays.');
		return fail(issues);
	}
	const batchIds = new Set();
	const reviewedIds = new Set();
	const rawReviews = [];
	const historicalInventory = [];
	for (const batch of review.batches) {
		if (
			batch?.status !== 'passed' ||
			batch?.model !== REVIEW_MODEL ||
			batch?.thinkingLevel !== REVIEW_THINKING ||
			!Array.isArray(batch?.ids) ||
			batch.ids.length === 0 ||
			batchIds.has(batch.batchId)
		) {
			issues.push('art review contains malformed or duplicated batch lineage.');
			continue;
		}
		batchIds.add(batch.batchId);
		for (const id of batch.ids) {
			if (reviewedIds.has(id)) issues.push(`art review repeats ${id} across batches.`);
			reviewedIds.add(id);
		}
		const specs = batch.ids.map((id) => manifest.specs.find((spec) => spec.id === id));
		if (specs.some((spec) => !spec)) {
			issues.push(`${batch.batchId} contains an unknown art id.`);
			continue;
		}
		const input = readBoundJson(
			batch.inputPath,
			batch.inputFileSha256,
			rootDir,
			issues,
			`${batch.batchId} input`,
			{ rawHash: true }
		);
		const request = readBoundJson(
			batch.requestPath,
			batch.requestFileSha256,
			rootDir,
			issues,
			`${batch.batchId} request`,
			{ rawHash: true }
		);
		const result = readBoundJson(
			batch.resultPath,
			batch.resultSha256,
			rootDir,
			issues,
			`${batch.batchId} result`
		);
		const runSummary = readBoundJson(
			batch.runSummaryPath,
			batch.runSummarySha256,
			rootDir,
			issues,
			`${batch.batchId} run summary`
		);
		for (const file of [
			batch.inputPath,
			batch.requestPath,
			batch.resultPath,
			batch.runSummaryPath
		]) {
			if (file) evidencePaths.add(path.resolve(rootDir, file));
		}
		if (!input || !request || !result || !runSummary) continue;
		if (
			!Array.isArray(input.assets) ||
			input.assets.length !== specs.length ||
			input.assets.some(
				(asset, assetIndex) =>
					asset.id !== specs[assetIndex].id ||
					!functioningSha256(asset.darkSha256) ||
					!functioningSha256(asset.lightSha256)
			)
		) {
			issues.push(`${batch.batchId} input asset inventory is malformed.`);
		}
		historicalInventory.push(...(Array.isArray(input.assets) ? input.assets : []));
		const eventLogPath = path.resolve(rootDir, String(batch.eventLogPath ?? ''));
		const lastMessagePath = path.resolve(rootDir, String(batch.lastMessagePath ?? ''));
		const promptPath = path.resolve(rootDir, String(batch.promptPath ?? ''));
		evidencePaths.add(eventLogPath);
		evidencePaths.add(lastMessagePath);
		evidencePaths.add(promptPath);
		const eventBytes = readFileWithinRoot(eventLogPath, rootDir, issues, `${batch.batchId} events`);
		const lastMessageBytes = readFileWithinRoot(
			lastMessagePath,
			rootDir,
			issues,
			`${batch.batchId} last message`
		);
		const promptBytes = readFileWithinRoot(promptPath, rootDir, issues, `${batch.batchId} prompt`);
		let rawModelResult = null;
		if (lastMessageBytes) {
			try {
				rawModelResult = JSON.parse(lastMessageBytes.toString('utf8'));
			} catch {
				issues.push(`${batch.batchId} last model message is not valid JSON.`);
			}
		}
		const runPolicy = validateScienceChallengeModelRunPolicy({
			summary: runSummary,
			eventLogBytes: eventBytes,
			lastMessageBytes,
			expectedModel: REVIEW_MODEL,
			expectedThinkingLevel: REVIEW_THINKING
		});
		issues.push(...runPolicy.issues.map((issue) => `${batch.batchId} model run policy: ${issue}`));
		const finalAgentMessage = runPolicy.agentMessages.at(-1) ?? null;
		const expectedInput = {
			schemaVersion: ART_REVIEW_INPUT_SCHEMA,
			manifestSpecsSha256: canonicalHash(specs),
			assets: useCurrentAssetBytes ? buildArtInventory(specs, rootDir, issues) : input.assets
		};
		const expectedRequest = buildArtReviewRequest({
			specs,
			assetInventory: expectedInput.assets,
			model: REVIEW_MODEL,
			thinkingLevel: REVIEW_THINKING
		});
		const requestSha256 = canonicalHash(expectedRequest);
		if (
			input.schemaVersion !== ART_REVIEW_INPUT_SCHEMA ||
			canonicalHash(input) !== batch.inputSha256 ||
			canonicalHash(input) !== canonicalHash(expectedInput) ||
			canonicalHash(request) !== batch.requestSha256 ||
			canonicalHash(request) !== requestSha256 ||
			result.requestSha256 !== requestSha256 ||
			result.provenance?.inputSha256 !== batch.inputSha256 ||
			result.provenance?.requestSha256 !== requestSha256 ||
			result.provenance?.model !== REVIEW_MODEL ||
			result.provenance?.thinkingLevel !== REVIEW_THINKING ||
			runSummary.model !== REVIEW_MODEL ||
			runSummary.thinkingLevel !== REVIEW_THINKING ||
			runSummary.status !== 'passed' ||
			!eventBytes ||
			!lastMessageBytes ||
			!promptBytes ||
			batch.eventLogSha256 !== (eventBytes ? sha256(eventBytes) : null) ||
			batch.lastMessageSha256 !== (lastMessageBytes ? sha256(lastMessageBytes) : null) ||
			batch.promptSha256 !== (promptBytes ? sha256(promptBytes) : null) ||
			!promptBytes?.toString('utf8').includes(requestSha256) ||
			runSummary.eventLogSha256 !== (eventBytes ? sha256(eventBytes) : null) ||
			runSummary.finalResponseSha256 !== (lastMessageBytes ? sha256(lastMessageBytes) : null) ||
			runSummary.lastMessageFileSha256 !== (lastMessageBytes ? sha256(lastMessageBytes) : null) ||
			finalAgentMessage !== lastMessageBytes?.toString('utf8') ||
			canonicalHash(rawModelResult) !== canonicalHash({ requestSha256, reviews: result.reviews })
		) {
			issues.push(`${batch.batchId} raw input/result/model provenance is invalid.`);
		}
		const rows = Array.isArray(result.reviews) ? result.reviews : [];
		if (
			rows.length !== batch.ids.length ||
			rows.some((row, rowIndex) => row.id !== batch.ids[rowIndex])
		) {
			issues.push(`${batch.batchId} raw review membership differs from the batch.`);
		}
		for (const row of rows) {
			const validation = validateIndependentArtReviewRow(row);
			for (const issue of validation.issues) issues.push(`${row.id}: ${issue}`);
		}
		rawReviews.push(...rows);
	}
	const acceptedCount = rawReviews.filter((row) => row.accepted === true).length;
	const rejectedCount = rawReviews.filter((row) => row.accepted === false).length;
	const cleanAcceptedCount = rawReviews.filter(
		(row) => row.accepted === true && row.disposition === 'accept'
	).length;
	const annotatedAcceptedCount = rawReviews.filter(
		(row) => row.accepted === true && row.disposition === 'retain-with-annotation'
	).length;
	const majorRejectedCount = rawReviews.filter(
		(row) => row.accepted === false && row.disposition === 'fresh-regenerate'
	).length;
	if (!useCurrentAssetBytes && canonicalHash(historicalInventory) !== review.assetInventorySha256) {
		issues.push('historical batch inputs differ from the art review asset inventory.');
	}
	if (
		review.selectedCount !== expectedCount ||
		review.acceptedCount !== acceptedCount ||
		review.cleanAcceptedCount !== cleanAcceptedCount ||
		review.annotatedAcceptedCount !== annotatedAcceptedCount ||
		review.rejectedCount !== rejectedCount ||
		review.majorRejectedCount !== majorRejectedCount ||
		review.missingCount !== 0 ||
		review.invalidBatchCount !== 0 ||
		review.batchCount !== review.batches.length ||
		reviewedIds.size !== expectedCount ||
		rawReviews.length !== expectedCount ||
		canonicalHash(rawReviews) !== canonicalHash(review.reviews) ||
		review.status !== requiredStatus ||
		(requiredStatus === 'passed' && rejectedCount !== 0) ||
		(requiredStatus === 'failed' && rejectedCount === 0)
	) {
		issues.push('art review status/counts differ from the bound raw batch results.');
	}
	return issues.length
		? fail(issues)
		: {
				status: 'passed',
				issues: [],
				rawReviews,
				evidencePaths: [...evidencePaths].sort()
			};
}

function validateContentResult(
	result,
	resultRecord,
	assignment,
	assignmentRecord,
	dispatch,
	ledgerSha256,
	curriculumRemapProposals,
	difficultyPlanAdjustmentProposals,
	issues
) {
	if (
		resultRecord.status !== 'passed' ||
		!Array.isArray(resultRecord.issues) ||
		resultRecord.issues.length !== 0 ||
		canonicalHash(resultRecord.verifier) !== canonicalHash(result.verifier) ||
		result.schemaVersion !== CONTENT_RESULT_SCHEMA ||
		result.assignmentId !== assignmentRecord.assignmentId ||
		result.assignmentEvidenceSha256 !== assignment.evidenceSha256 ||
		result.verifier?.context !== 'empty' ||
		result.verifier?.model !== REVIEW_MODEL ||
		result.verifier?.reasoningEffort !== REVIEW_THINKING ||
		!result.verifier?.reviewedAt ||
		Number.isNaN(Date.parse(result.verifier.reviewedAt)) ||
		!dispatch ||
		result.verifier?.provenance?.orchestrator !== 'codex-collaboration' ||
		result.verifier?.provenance?.taskName !== dispatch.taskName ||
		result.verifier?.provenance?.forkTurns !== 'none' ||
		result.verifier?.provenance?.dispatchLedgerSha256 !== ledgerSha256
	) {
		issues.push(`${assignmentRecord.assignmentId} raw verifier provenance is invalid.`);
	}
	const expectedIds = assignmentRecord.ids;
	const rows = Array.isArray(result.reviews) ? result.reviews : [];
	const proposalByChallengeId = new Map(
		curriculumRemapProposals.map((proposal) => [proposal.challengeId, proposal])
	);
	const difficultyProposalByChallengeId = new Map(
		difficultyPlanAdjustmentProposals.map((proposal) => [proposal.challengeId, proposal])
	);
	if (
		rows.length !== expectedIds.length ||
		rows.some((row, rowIndex) => row.id !== expectedIds[rowIndex])
	) {
		issues.push(`${assignmentRecord.assignmentId} raw review membership is invalid.`);
	}
	for (const row of rows) {
		const curriculumReview = structuredClone(row);
		delete curriculumReview[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY];
		const validation = validateScienceChallengeContentReviewRow(curriculumReview, {
			proposal: proposalByChallengeId.get(row?.id)
		});
		for (const issue of validation.issues) issues.push(`${row.id}: ${issue}`);
		const difficultyReview = structuredClone(row);
		delete difficultyReview[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY];
		const difficultyValidation = validateScienceChallengeDifficultyPlanAdjustmentReviewRow(
			difficultyReview,
			{
				proposal: difficultyProposalByChallengeId.get(row?.id)
			}
		);
		for (const issue of difficultyValidation.issues) {
			issues.push(`${row.id}: ${issue}`);
		}
	}
}

function validateVerifierPacketPayloadBindings({
	packetManifest,
	packets,
	index,
	ledger,
	assignmentIndexPath,
	dispatchLedgerPath,
	packetRootPath,
	reviewRootPath,
	issues
}) {
	if (
		!isRecord(packetManifest) ||
		packetManifest.schemaVersion !== SCIENCE_CHALLENGE_VERIFIER_PACKET_MANIFEST_SCHEMA ||
		packetManifest.assignmentIndexSha256 !== canonicalHash(index) ||
		packetManifest.dispatchLedgerSha256 !== canonicalHash(ledger) ||
		!Array.isArray(packetManifest.packets)
	) {
		issues.push(
			'typed-recovery verifier packet manifest does not bind the assignment index and dispatch ledger.'
		);
		return;
	}
	let expectedBundle;
	try {
		expectedBundle = buildScienceChallengeVerifierPacketBundle({
			assignmentIndex: index,
			dispatchLedger: ledger,
			assignmentIndexPath,
			dispatchLedgerPath,
			packetRootPath,
			reviewRootPath
		});
	} catch (error) {
		issues.push(
			`typed-recovery verifier packet replay could not rebuild the canonical bundle: ${error instanceof Error ? error.message : String(error)}`
		);
		return;
	}
	if (canonicalHash(packetManifest) !== canonicalHash(expectedBundle.manifest)) {
		issues.push(
			'typed-recovery verifier packet manifest differs from the exact canonical packet and followup-payload bundle.'
		);
	}

	const actualArtifactsByPath = new Map();
	for (const artifact of Array.isArray(packets) ? packets : []) {
		if (
			!isRecord(artifact) ||
			typeof artifact.packetPath !== 'string' ||
			actualArtifactsByPath.has(artifact.packetPath)
		) {
			issues.push('typed-recovery verifier packet artifacts are missing or duplicated.');
			continue;
		}
		actualArtifactsByPath.set(artifact.packetPath, artifact.packet);
		for (const payloadArtifact of artifact.payloads ?? []) {
			if (
				!isRecord(payloadArtifact) ||
				typeof payloadArtifact.payloadPath !== 'string' ||
				actualArtifactsByPath.has(payloadArtifact.payloadPath)
			) {
				issues.push('typed-recovery verifier followup payloads are missing or duplicated.');
				continue;
			}
			actualArtifactsByPath.set(payloadArtifact.payloadPath, payloadArtifact.payload);
		}
	}
	for (const expectedArtifact of expectedBundle.artifacts) {
		const expectedPath = path.join(packetRootPath, expectedArtifact.relativePath);
		const actualValue = actualArtifactsByPath.get(expectedPath);
		if (
			actualValue === undefined ||
			canonicalHash(actualValue) !== canonicalHash(expectedArtifact.value)
		) {
			issues.push(
				`typed-recovery verifier artifact ${expectedPath} differs from the exact canonical packet or followup payload.`
			);
		}
	}
	if (actualArtifactsByPath.size !== expectedBundle.artifacts.length) {
		issues.push(
			'typed-recovery verifier packet and followup-payload membership differs from the canonical bundle.'
		);
	}
}

function buildArtInventory(specs, rootDir, issues) {
	return specs.map((spec) => {
		const darkPath = path.resolve(rootDir, spec.output.darkPath);
		const lightPath = path.resolve(rootDir, spec.output.lightPath);
		if (!isWithinRoot(darkPath, rootDir) || !isWithinRoot(lightPath, rootDir)) {
			issues.push(`${spec.id} art path escapes the workspace.`);
			return { id: spec.id, darkSha256: null, lightSha256: null };
		}
		if (!existsSync(darkPath) || !existsSync(lightPath)) {
			issues.push(`${spec.id} art pair is incomplete.`);
			return { id: spec.id, darkSha256: null, lightSha256: null };
		}
		return {
			id: spec.id,
			darkSha256: sha256(readFileSync(darkPath)),
			lightSha256: sha256(readFileSync(lightPath))
		};
	});
}

function readBoundJson(
	relativePath,
	expectedHash,
	rootDir,
	issues,
	label,
	{ rawHash = false } = {}
) {
	const filePath = path.resolve(rootDir, String(relativePath ?? ''));
	const value = readJsonWithinRoot(filePath, rootDir, issues, label);
	if (!value) return null;
	const actualHash = rawHash ? sha256(readFileSync(filePath)) : canonicalHash(value);
	if (!/^[a-f0-9]{64}$/.test(String(expectedHash ?? '')) || actualHash !== expectedHash) {
		issues.push(`${label} differs from its recorded hash.`);
	}
	return value;
}

function readJsonWithinRoot(filePath, rootDir, issues, label) {
	if (!isWithinRoot(filePath, rootDir) || !existsSync(filePath)) {
		issues.push(`${label} is missing or outside the workspace.`);
		return null;
	}
	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch {
		issues.push(`${label} is not valid JSON.`);
		return null;
	}
}

function readFileWithinRoot(filePath, rootDir, issues, label) {
	if (!isWithinRoot(filePath, rootDir) || !existsSync(filePath)) {
		issues.push(`${label} is missing or outside the workspace.`);
		return null;
	}
	return readFileSync(filePath);
}

function isWithinRoot(filePath, rootDir) {
	const resolvedRoot = path.resolve(rootDir);
	return filePath === resolvedRoot || filePath.startsWith(`${resolvedRoot}${path.sep}`);
}

function functioningSha256(value) {
	return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(issues) {
	return { status: 'failed', issues };
}
