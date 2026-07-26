import {
	SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS,
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	canonicalHash,
	validateIndependentContentReviewRow
} from './science-challenge-release.mjs';
import {
	assertSubstantiveCurriculumEvidence,
	trueCurriculumTopicLeaves
} from './science-challenge-planner-curriculum.mjs';
import { validateVerificationRepairCandidate } from './science-challenge-verification-repair-transaction.mjs';

export const SCIENCE_CHALLENGE_DESCENDANT_REMAP_SCHEMA =
	'science-challenge-verifier-directed-descendant-remap/v1';
export const SCIENCE_CHALLENGE_DESCENDANT_REMAP_VALIDATION_SCHEMA =
	'science-challenge-verifier-directed-descendant-remap-validation/v1';
export const SCIENCE_CHALLENGE_DESCENDANT_REMAP_DISPOSITION =
	'deterministic-verifier-directed-descendant-remap';
export const SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD = 'grounding.curriculumComponentId';
export const SCIENCE_CHALLENGE_DESCENDANT_REMAP_COLLECTION_POLICY =
	'deferred-to-final-effective-cohort';

const HASH = /^[a-f0-9]{64}$/u;

/**
 * Build a review-pending, target-row-local curriculum descendant remap.
 *
 * This is intentionally pure. It cannot mutate the frozen plan, source attempts, prior candidate,
 * or prior review. Filesystem staging and source-run replay live in the evidence wrapper.
 */
export function buildScienceChallengeDescendantRemap(input) {
	const issues = [];
	if (!isRecord(input)) return failed('Descendant-remap input must be an object.');
	const {
		plan,
		curriculumEvidence,
		curriculumCatalog,
		shardId,
		repairSha256,
		priorCandidate,
		priorValidation,
		firstReviewSummary,
		firstReviewResult,
		firstAssignment,
		dispatchLedger,
		attempts,
		validateBatchCandidate
	} = input;

	if (!isRecord(plan) || !Array.isArray(plan.rows)) {
		issues.push('Descendant remap requires the exact frozen plan.');
	}
	if (!isRecord(curriculumEvidence) || !Array.isArray(curriculumEvidence.components)) {
		issues.push('Descendant remap requires the exact frozen curriculum evidence.');
	}
	if (!nonEmpty(shardId)) issues.push('Descendant remap shardId is required.');
	if (!HASH.test(String(repairSha256 ?? ''))) {
		issues.push('Descendant remap repairSha256 must be a lowercase SHA-256.');
	}
	if (!isRecord(priorCandidate) || !Array.isArray(priorCandidate.challenges)) {
		issues.push('Descendant remap requires the immutable prior candidate batch.');
	}
	if (typeof validateBatchCandidate !== 'function') {
		issues.push('Descendant remap requires ordinary batch validation.');
	}
	if (issues.length) return failed(issues);

	const planSha256 = canonicalHash(plan);
	const curriculumEvidenceSha256 = canonicalHash(curriculumEvidence);
	const curriculumCatalogSha256 = canonicalHash(curriculumCatalog);
	if (
		!HASH.test(String(plan.curriculumCatalogSha256 ?? '')) ||
		plan.curriculumCatalogSha256 !== curriculumCatalogSha256 ||
		curriculumEvidence.catalogSha256 !== curriculumCatalogSha256 ||
		curriculumEvidence.planId !== plan.planId
	) {
		issues.push(
			'Curriculum catalog is not the exact catalog bound by the frozen plan and evidence.'
		);
	}
	if (firstReviewSummary?.planSha256 !== planSha256) {
		issues.push('First review does not bind the frozen base plan.');
	}
	if (firstReviewSummary?.curriculumEvidenceSha256 !== curriculumEvidenceSha256) {
		issues.push('First review does not bind the frozen curriculum evidence.');
	}
	if (canonicalHash(firstReviewSummary) !== repairSha256) {
		issues.push('repairSha256 does not bind the immutable first review summary.');
	}
	if (firstReviewSummary?.status !== 'failed') {
		issues.push('Descendant remap requires an immutable failed first review.');
	}
	if (
		priorValidation?.status !== 'passed' ||
		(priorValidation?.issues?.length ?? 0) !== 0 ||
		priorValidation?.candidateSha256 !== canonicalHash(priorCandidate)
	) {
		issues.push('Prior candidate is not bound by a passed immutable validation.');
	}

	const shardRows = plan.rows.filter((row) => row?.shard === shardId);
	const priorById = uniqueChallengesById(priorCandidate.challenges, issues, 'prior candidate');
	if (
		priorCandidate.challenges.length !== shardRows.length ||
		shardRows.some((row) => !priorById.has(row.id))
	) {
		issues.push('Prior candidate membership differs from the exact shard rows.');
	}
	const priorCandidateSha256 = canonicalHash(priorCandidate);
	const priorBaseBatchValidation = validateBatchCandidate(
		structuredClone(priorCandidate),
		structuredClone(shardRows),
		{
			basePlan: structuredClone(plan),
			effectivePlan: null,
			effectivePlanRow: null,
			effectiveCurriculum: null,
			validationMode: 'prior-base-plan-replay'
		}
	);
	if (
		priorBaseBatchValidation?.status !== 'passed' ||
		(priorBaseBatchValidation?.issues?.length ?? 0) !== 0 ||
		!validBatchValidationBinding({
			validation: priorBaseBatchValidation,
			candidate: priorCandidate,
			planRows: shardRows,
			planSha256,
			expectedStatus: 'passed'
		}) ||
		canonicalHash(priorCandidate) !== priorCandidateSha256
	) {
		issues.push(
			'Prior candidate failed exact current ordinary validation against the frozen base plan.',
			...(priorBaseBatchValidation?.issues ?? [])
		);
	}

	const reviewSelection = selectVerifierDirectedReview({
		firstReviewSummary,
		firstReviewResult,
		firstAssignment,
		dispatchLedger,
		shardId,
		priorById,
		plan,
		curriculumEvidence
	});
	issues.push(...reviewSelection.issues);
	if (issues.length) return failed(issues);
	const { challengeId, review, canonicalVerifier } = reviewSelection;
	const basePlanRowIndex = plan.rows.findIndex((row) => row?.id === challengeId);
	const basePlanRow = plan.rows[basePlanRowIndex];
	const priorTarget = priorById.get(challengeId);
	if (!basePlanRow || basePlanRow.shard !== shardId || !priorTarget) {
		return failed(`${challengeId} is not an exact member of ${shardId}.`);
	}

	const curriculum = resolveCurriculumRemap({
		basePlanRow,
		curriculumEvidence,
		curriculumCatalog,
		attempts,
		priorTarget,
		challengeId
	});
	issues.push(...curriculum.issues);
	if (issues.length) return failed(issues);

	const effectivePlan = structuredClone(plan);
	const effectivePlanRow = effectivePlan.rows[basePlanRowIndex];
	applyComponentTupleToPlanRow(effectivePlanRow, curriculum.effectiveComponent);
	const effectivePlanSha256 = canonicalHash(effectivePlan);
	const effectivePlanRowSha256 = canonicalHash(effectivePlanRow);

	const attemptSelection = selectLatestMatchingAttempt({
		attempts,
		challengeId,
		priorTarget,
		from: curriculum.from,
		to: curriculum.to,
		rows: shardRows,
		reviews: firstReviewSummary.reviews,
		priorCandidate,
		basePlan: plan,
		effectivePlan,
		effectivePlanRow,
		effectiveCurriculum: curriculum.effectiveEvidence,
		validateBatchCandidate
	});
	issues.push(...attemptSelection.issues);
	if (issues.length) return failed(issues);

	const candidate = structuredClone(attemptSelection.replay.candidate);
	const candidateTarget = candidate.challenges.find(
		(challenge) => challenge?.definition?.id === challengeId
	);
	const candidateSha256 = canonicalHash(candidate);
	if (canonicalHash(candidateTarget) !== canonicalHash(attemptSelection.replay.candidateTarget)) {
		return failed(
			'Recovered target row differs from the latest immutable matching failed attempt.'
		);
	}
	const inverseRemap = {
		challengeId,
		field: SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD,
		from: curriculum.to,
		to: curriculum.from
	};
	const inverseTarget = structuredClone(candidateTarget);
	inverseTarget.grounding.curriculumComponentId = inverseRemap.to;
	if (canonicalHash(inverseTarget) !== canonicalHash(priorTarget)) {
		return failed('Exact inverse target-row remap does not reproduce the prior target bytes.');
	}

	const ordinaryBatchValidation = attemptSelection.effectiveValidation;
	if (
		ordinaryBatchValidation?.status !== 'passed' ||
		(ordinaryBatchValidation?.issues?.length ?? 0) !== 0
	) {
		issues.push(
			'Recovered candidate failed strict ordinary validation through the effective-row wrapper.',
			...(ordinaryBatchValidation?.issues ?? [])
		);
	}
	if (canonicalHash(candidate) !== candidateSha256) {
		issues.push('Ordinary batch validation mutated the recovered candidate.');
	}
	const collectionValidation = {
		status: 'deferred',
		issues: [],
		policy: SCIENCE_CHALLENGE_DESCENDANT_REMAP_COLLECTION_POLICY,
		shardId,
		challengeId,
		candidateSha256,
		effectivePlanSha256
	};
	if (issues.length) return failed(issues);

	const remap = {
		challengeId,
		field: SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD,
		from: curriculum.from,
		to: curriculum.to
	};
	const remapSha256 = canonicalHash(remap);
	const manifestCore = {
		schemaVersion: SCIENCE_CHALLENGE_DESCENDANT_REMAP_SCHEMA,
		disposition: SCIENCE_CHALLENGE_DESCENDANT_REMAP_DISPOSITION,
		shardId,
		repairSha256,
		challengeId,
		field: SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD,
		base: {
			planSha256,
			planRowIndex: basePlanRowIndex,
			planRowSha256: canonicalHash(basePlanRow),
			component: curriculum.baseComponent,
			componentSha256: canonicalHash(curriculum.baseComponent)
		},
		effective: {
			planSha256: effectivePlanSha256,
			planRowIndex: basePlanRowIndex,
			planRowSha256: effectivePlanRowSha256,
			component: curriculum.effectiveComponent,
			componentSha256: canonicalHash(curriculum.effectiveComponent)
		},
		evidence: {
			curriculumEvidenceSha256,
			curriculumCatalogSha256,
			baseEvidenceSha256: canonicalHash(curriculum.baseEvidence),
			effectiveEvidenceSha256: canonicalHash(curriculum.effectiveEvidence),
			effectiveSourceTextSha256: curriculum.effectiveEvidence.sourceTextSha256
		},
		firstReview: {
			summarySha256: canonicalHash(firstReviewSummary),
			resultSha256: canonicalHash(firstReviewResult),
			assignmentSha256: canonicalHash(firstAssignment),
			dispatchLedgerSha256: canonicalHash(dispatchLedger),
			reviewSha256: canonicalHash(review),
			canonicalVerifier
		},
		sourceAttempt: attemptSelection.binding,
		attemptBudget: attemptSelection.attemptBudget,
		priorCandidateSha256,
		priorValidationSha256: canonicalHash(priorValidation),
		priorBaseBatchValidationSha256: canonicalHash(priorBaseBatchValidation),
		candidateSha256,
		remap,
		remapSha256,
		inverseRemap,
		inverseRemapSha256: canonicalHash(inverseRemap),
		priorTargetSha256: canonicalHash(priorTarget),
		candidateTargetSha256: canonicalHash(candidateTarget),
		inverseTargetSha256: canonicalHash(inverseTarget),
		repairValidationSha256: canonicalHash(attemptSelection.repairValidation),
		baseBatchValidationSha256: canonicalHash(attemptSelection.baseValidation),
		ordinaryBatchValidationSha256: canonicalHash(ordinaryBatchValidation),
		collectionValidationPolicy: SCIENCE_CHALLENGE_DESCENDANT_REMAP_COLLECTION_POLICY,
		collectionValidationSha256: canonicalHash(collectionValidation),
		normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION
	};
	const manifest = {
		...manifestCore,
		manifestCoreSha256: canonicalHash(manifestCore)
	};
	const validation = {
		schemaVersion: SCIENCE_CHALLENGE_DESCENDANT_REMAP_VALIDATION_SCHEMA,
		status: 'review-pending',
		issues: [
			'A fresh full-cohort independent verification pass with the exact typed descendant-remap approval is required.'
		],
		authoringDisposition: SCIENCE_CHALLENGE_DESCENDANT_REMAP_DISPOSITION,
		sourceAttempt: attemptSelection.replay.attempt,
		sourceAttemptStatus: 'failed',
		basePlanSha256: planSha256,
		effectivePlanSha256,
		effectivePlanRowSha256,
		curriculumEvidenceSha256,
		firstReviewSha256: canonicalHash(firstReviewSummary),
		priorCandidateSha256,
		priorValidationSha256: canonicalHash(priorValidation),
		priorBaseBatchValidationSha256: canonicalHash(priorBaseBatchValidation),
		candidateSha256,
		remapSha256,
		manifestSha256: canonicalHash(manifest),
		ordinaryBatchValidationSha256: canonicalHash(ordinaryBatchValidation),
		collectionValidationPolicy: SCIENCE_CHALLENGE_DESCENDANT_REMAP_COLLECTION_POLICY,
		collectionValidationSha256: canonicalHash(collectionValidation),
		repairValidationSha256: canonicalHash(attemptSelection.repairValidation),
		baseBatchValidationSha256: canonicalHash(attemptSelection.baseValidation)
	};

	return {
		status: 'passed',
		issues: [],
		manifest,
		candidate,
		validation,
		effectivePlan,
		effectivePlanRow,
		effectiveCurriculum: curriculum.effectiveEvidence,
		remap,
		canonicalVerifier,
		sourceAttempt: attemptSelection.replay,
		priorBaseBatchValidation,
		baseBatchValidation: attemptSelection.baseValidation,
		effectiveBatchValidation: ordinaryBatchValidation,
		collectionValidation,
		repairValidation: attemptSelection.repairValidation
	};
}

export function descendantRemapApprovalDecision(manifest, accepted) {
	if (manifest?.schemaVersion !== SCIENCE_CHALLENGE_DESCENDANT_REMAP_SCHEMA) {
		throw new Error('Descendant-remap manifest schema is invalid.');
	}
	if (typeof accepted !== 'boolean') {
		throw new TypeError('Descendant-remap approval accepted must be boolean.');
	}
	return { ...manifest.remap, accepted };
}

export function validateScienceChallengeDescendantRemapManifest({
	manifest,
	plan,
	priorCandidate,
	candidate
}) {
	const issues = [];
	if (
		manifest?.schemaVersion !== SCIENCE_CHALLENGE_DESCENDANT_REMAP_SCHEMA ||
		manifest?.disposition !== SCIENCE_CHALLENGE_DESCENDANT_REMAP_DISPOSITION
	) {
		return failed('Descendant-remap manifest schema or disposition is invalid.');
	}
	const { manifestCoreSha256, ...manifestCore } = manifest;
	if (
		!HASH.test(String(manifestCoreSha256 ?? '')) ||
		manifestCoreSha256 !== canonicalHash(manifestCore)
	) {
		issues.push('Descendant-remap manifest self-binding hash is invalid.');
	}
	if (
		manifest.base?.planSha256 !== canonicalHash(plan) ||
		!Number.isInteger(manifest.base?.planRowIndex) ||
		canonicalHash(plan?.rows?.[manifest.base.planRowIndex]) !== manifest.base?.planRowSha256
	) {
		issues.push('Descendant-remap manifest base plan binding is stale.');
	}
	if (
		manifest.base?.componentSha256 !== canonicalHash(manifest.base?.component) ||
		manifest.effective?.componentSha256 !== canonicalHash(manifest.effective?.component)
	) {
		issues.push('Descendant-remap component tuple hashes are invalid.');
	}
	if (
		canonicalHash(manifest.remap) !== manifest.remapSha256 ||
		manifest.remap?.challengeId !== manifest.challengeId ||
		manifest.remap?.field !== SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD ||
		manifest.remap?.from !== manifest.base?.component?.curriculumComponentId ||
		manifest.remap?.to !== manifest.effective?.component?.curriculumComponentId
	) {
		issues.push('Descendant-remap forward patch is invalid.');
	}
	const expectedInverse = {
		challengeId: manifest.challengeId,
		field: SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD,
		from: manifest.remap?.to,
		to: manifest.remap?.from
	};
	if (
		canonicalHash(manifest.inverseRemap) !== canonicalHash(expectedInverse) ||
		manifest.inverseRemapSha256 !== canonicalHash(expectedInverse)
	) {
		issues.push('Descendant-remap inverse patch is invalid.');
	}
	if (
		manifest.sourceAttempt?.status !== 'failed' ||
		manifest.sourceAttempt?.attempt !== manifest.attemptBudget?.selectedAttempt ||
		manifest.attemptBudget?.maxAttempts !== 4 ||
		manifest.attemptBudget?.exhausted !== true ||
		!Array.isArray(manifest.attemptBudget?.attempts) ||
		manifest.attemptBudget.attempts.length !== 4 ||
		manifest.attemptBudget.attempts.some(
			(attempt, index) =>
				attempt?.attempt !== index + 1 ||
				attempt?.status !== 'failed' ||
				(attempt.invalidated === true && attempt.attempt === manifest.attemptBudget.selectedAttempt)
		)
	) {
		issues.push('Descendant-remap source attempt or exhausted budget is invalid.');
	}
	if (
		!isRecord(priorCandidate) ||
		!isRecord(candidate) ||
		manifest.priorCandidateSha256 !== canonicalHash(priorCandidate) ||
		manifest.candidateSha256 !== canonicalHash(candidate)
	) {
		issues.push('Descendant-remap prior/current candidate binding is invalid.');
	} else {
		const priorTarget = priorCandidate.challenges?.find(
			(entry) => entry?.definition?.id === manifest.challengeId
		);
		const candidateTarget = candidate.challenges?.find(
			(entry) => entry?.definition?.id === manifest.challengeId
		);
		if (
			canonicalHash(priorTarget) !== manifest.priorTargetSha256 ||
			canonicalHash(candidateTarget) !== manifest.candidateTargetSha256 ||
			!onlyExactTargetFieldChanged({
				beforeBatch: { challenges: [priorTarget] },
				afterBatch: { challenges: [candidateTarget] },
				challengeId: manifest.challengeId,
				from: manifest.remap.from,
				to: manifest.remap.to
			})
		) {
			issues.push('Descendant-remap target-row forward diff is not exact.');
		} else {
			const inverseTarget = structuredClone(candidateTarget);
			inverseTarget.grounding.curriculumComponentId = manifest.inverseRemap.to;
			if (
				canonicalHash(inverseTarget) !== manifest.inverseTargetSha256 ||
				canonicalHash(inverseTarget) !== canonicalHash(priorTarget)
			) {
				issues.push('Descendant-remap target-row inverse replay is invalid.');
			}
		}
	}
	return issues.length ? failed(issues) : { status: 'passed', issues: [] };
}

/**
 * Project a staged review-pending overlay for fresh verifier assignment/coverage only.
 * Publication code must authenticate replay and fresh review evidence before using this projection.
 */
export function projectScienceChallengeDescendantRemapPlan(plan, recoveries) {
	const issues = [];
	const effective = structuredClone(plan);
	const seen = new Set();
	for (const recovery of recoveries ?? []) {
		const manifest = recovery?.manifest ?? recovery;
		const integrity = validateScienceChallengeDescendantRemapManifest({
			manifest,
			plan,
			priorCandidate: recovery?.priorCandidate,
			candidate: recovery?.candidate
		});
		if (integrity.status !== 'passed') {
			issues.push(...integrity.issues);
			continue;
		}
		if (manifest.base.planSha256 !== canonicalHash(plan)) {
			issues.push(`${manifest.challengeId} recovery targets another base plan.`);
			continue;
		}
		if (seen.has(manifest.challengeId)) {
			issues.push(`${manifest.challengeId} has ambiguous duplicate descendant remaps.`);
			continue;
		}
		seen.add(manifest.challengeId);
		const index = effective.rows.findIndex((row) => row.id === manifest.challengeId);
		if (
			index !== manifest.base.planRowIndex ||
			canonicalHash(plan.rows[index]) !== manifest.base.planRowSha256
		) {
			issues.push(`${manifest.challengeId} recovery base row is stale.`);
			continue;
		}
		applyComponentTupleToPlanRow(effective.rows[index], manifest.effective.component);
		if (canonicalHash(effective.rows[index]) !== manifest.effective.planRowSha256) {
			issues.push(`${manifest.challengeId} effective row differs from the manifest.`);
		}
	}
	if (issues.length) return failed(issues);
	if (
		recoveries?.length === 1 &&
		canonicalHash(effective) !== (recoveries[0]?.manifest ?? recoveries[0])?.effective?.planSha256
	) {
		return failed('Effective plan differs from the exact recovery plan hash.');
	}
	return { status: 'passed', issues: [], plan: effective, planSha256: canonicalHash(effective) };
}

function selectVerifierDirectedReview({
	firstReviewSummary,
	firstReviewResult,
	firstAssignment,
	dispatchLedger,
	shardId,
	priorById,
	plan,
	curriculumEvidence
}) {
	const issues = [];
	const reviews = Array.isArray(firstReviewSummary?.reviews) ? firstReviewSummary.reviews : [];
	const uniqueReviewIds = new Set(reviews.map((review) => review?.id));
	const acceptedCount = reviews.filter((review) => review?.accepted === true).length;
	const rejectedCount = reviews.filter((review) => review?.accepted === false).length;
	if (
		firstReviewSummary?.schemaVersion !== 'science-challenge-independent-verification-summary/v1' ||
		firstReviewSummary?.status !== 'failed' ||
		firstReviewSummary?.reviewCount !== reviews.length ||
		firstReviewSummary?.acceptedCount !== acceptedCount ||
		firstReviewSummary?.rejectedCount !== rejectedCount ||
		firstReviewSummary?.planId !== plan.planId ||
		firstReviewSummary?.planSha256 !== canonicalHash(plan) ||
		firstReviewSummary?.curriculumEvidenceSha256 !== canonicalHash(curriculumEvidence) ||
		!Array.isArray(firstReviewSummary?.issues) ||
		firstReviewSummary.issues.length !== 0 ||
		reviews.length !== plan.rows.length ||
		uniqueReviewIds.size !== plan.rows.length ||
		plan.rows.some((row, index) => reviews[index]?.id !== row.id)
	) {
		issues.push('First review summary membership, counts or frozen evidence bindings are invalid.');
	}
	const shardIds = new Set(
		(firstAssignment?.items ?? []).map((item) => item?.candidate?.definition?.id).filter(Boolean)
	);
	const directed = reviews.filter((review) => {
		if (!shardIds.has(review?.id)) return false;
		return review?.issues?.some(
			(issue) => issue?.field === SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD
		);
	});
	if (directed.length !== 1) {
		issues.push(
			`Expected exactly one verifier-directed descendant remap; found ${directed.length}.`
		);
		return { issues };
	}
	const review = directed[0];
	const rowValidation = validateIndependentContentReviewRow(review);
	issues.push(...rowValidation.issues.map((issue) => `${review.id}: ${issue}`));
	if (
		review.accepted !== false ||
		review.curriculumGrounded !== false ||
		SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.filter((field) => field !== 'curriculumGrounded').some(
			(field) => review[field] !== true
		) ||
		!Array.isArray(review.issues) ||
		review.issues.length !== 1 ||
		review.issues[0]?.field !== SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD
	) {
		issues.push(
			`${review.id} first review must fail only curriculum grounding with every other gate passed.`
		);
	}
	if (
		firstAssignment?.schemaVersion !== 'science-challenge-verification-assignment/v2' ||
		firstAssignment?.assignmentId !== shardId ||
		firstAssignment?.planId !== plan.planId ||
		firstAssignment?.planSha256 !== canonicalHash(plan) ||
		firstAssignment?.curriculumEvidenceSha256 !== canonicalHash(curriculumEvidence) ||
		firstAssignment?.evidenceSha256 !==
			canonicalHash(
				Object.fromEntries(
					Object.entries(firstAssignment ?? {}).filter(([key]) => key !== 'evidenceSha256')
				)
			)
	) {
		issues.push('First assignment is stale or does not bind the target shard.');
	}
	const expectedShardRows = plan.rows.filter((row) => row.shard === shardId);
	if (
		!Array.isArray(firstAssignment?.items) ||
		firstAssignment.items.length !== expectedShardRows.length ||
		firstAssignment.items.some(
			(item, index) =>
				item?.planRowIndex !==
					plan.rows.findIndex((row) => row.id === expectedShardRows[index].id) ||
				canonicalHash(item?.plan) !== canonicalHash(expectedShardRows[index]) ||
				item?.candidate?.definition?.id !== expectedShardRows[index].id ||
				canonicalHash(item?.candidate) !== canonicalHash(priorById.get(expectedShardRows[index].id))
		)
	) {
		issues.push(
			'First assignment item order, base-plan rows, or complete prior shard candidates are invalid.'
		);
	}
	const assignmentItem = (firstAssignment?.items ?? []).find(
		(item) => item?.candidate?.definition?.id === review.id
	);
	if (
		!assignmentItem ||
		canonicalHash(assignmentItem.candidate) !== canonicalHash(priorById.get(review.id))
	) {
		issues.push('First assignment does not bind the exact prior target candidate.');
	}
	const summaryRecord = firstReviewSummary?.assignmentResults?.find(
		(record) => record?.assignmentId === shardId
	);
	if (
		!summaryRecord ||
		summaryRecord.status !== 'passed' ||
		!Array.isArray(summaryRecord.issues) ||
		summaryRecord.issues.length !== 0 ||
		summaryRecord.sha256 !== canonicalHash(firstReviewResult) ||
		firstReviewResult?.schemaVersion !== 'science-challenge-independent-verification/v1' ||
		firstReviewResult?.assignmentId !== shardId ||
		firstReviewResult?.assignmentEvidenceSha256 !== firstAssignment?.evidenceSha256 ||
		canonicalHash(firstReviewResult?.reviews) !==
			canonicalHash(reviews.filter((candidateReview) => shardIds.has(candidateReview.id))) ||
		!nonEmpty(firstReviewResult?.verifier?.reviewedAt) ||
		Number.isNaN(Date.parse(firstReviewResult.verifier.reviewedAt)) ||
		new Date(firstReviewResult.verifier.reviewedAt).toISOString() !==
			firstReviewResult.verifier.reviewedAt
	) {
		issues.push('First raw verifier result is missing, reordered or stale.');
	}
	const dispatch = dispatchLedger?.dispatches?.find(
		(candidateDispatch) => candidateDispatch?.assignmentId === shardId
	);
	if (
		dispatchLedger?.schemaVersion !== 'science-challenge-verifier-dispatch-ledger/v1' ||
		firstReviewSummary?.dispatchLedgerSha256 !== canonicalHash(dispatchLedger) ||
		!dispatch ||
		dispatch.assignmentSha256 !== canonicalHash(firstAssignment) ||
		firstReviewResult?.verifier?.context !== 'empty' ||
		firstReviewResult?.verifier?.model !== 'gpt-5.6-sol' ||
		firstReviewResult?.verifier?.reasoningEffort !== 'max' ||
		firstReviewResult?.verifier?.provenance?.orchestrator !== 'codex-collaboration' ||
		firstReviewResult?.verifier?.provenance?.taskName !== dispatch.taskName ||
		firstReviewResult?.verifier?.provenance?.forkTurns !== 'none' ||
		firstReviewResult?.verifier?.provenance?.dispatchLedgerSha256 !== canonicalHash(dispatchLedger)
	) {
		issues.push('First review does not bind the canonical empty-context assigned verifier.');
	}
	return {
		issues,
		challengeId: review.id,
		review,
		canonicalVerifier: dispatch
			? {
					assignmentId: shardId,
					taskName: dispatch.taskName,
					orchestrator: dispatch.orchestrator,
					forkTurns: dispatch.forkTurns,
					model: dispatch.model,
					reasoningEffort: dispatch.reasoningEffort,
					dispatchLedgerSha256: canonicalHash(dispatchLedger),
					assignmentSha256: canonicalHash(firstAssignment)
				}
			: null
	};
}

function resolveCurriculumRemap({
	basePlanRow,
	curriculumEvidence,
	curriculumCatalog,
	attempts,
	priorTarget,
	challengeId
}) {
	const issues = [];
	const from = priorTarget?.grounding?.curriculumComponentId;
	if (from !== basePlanRow.curriculumComponentId) {
		issues.push(`${challengeId} prior target does not bind the base plan curriculum component.`);
	}
	const evidenceById = uniqueBy(
		curriculumEvidence.components,
		(component) => component?.componentId,
		issues,
		'curriculum evidence'
	);
	const baseEvidence = evidenceById.get(from);
	const attemptedTargets = new Set();
	for (const attempt of attempts ?? []) {
		const target = attempt?.candidate?.challenges?.find(
			(challenge) => challenge?.definition?.id === challengeId
		);
		const value = target?.grounding?.curriculumComponentId;
		if (nonEmpty(value) && value !== from) attemptedTargets.add(value);
	}
	if (attemptedTargets.size !== 1) {
		issues.push(
			`Expected one unambiguous attempted descendant component; found ${attemptedTargets.size}.`
		);
		return { issues };
	}
	const [to] = attemptedTargets;
	const effectiveEvidence = evidenceById.get(to);
	if (!baseEvidence || !effectiveEvidence) {
		issues.push('Base or effective component is absent from the frozen curriculum evidence.');
		return { issues };
	}
	const specification = curriculumSpecification(curriculumCatalog, basePlanRow.specificationId);
	if (!specification) {
		issues.push('Curriculum catalog does not contain the plan specification.');
		return { issues };
	}
	const componentById = uniqueBy(
		specification.components,
		(component) => component?.id,
		issues,
		'curriculum catalog'
	);
	const baseCatalogComponent = componentById.get(from);
	const effectiveCatalogComponent = componentById.get(to);
	if (!baseCatalogComponent || !effectiveCatalogComponent) {
		issues.push('Base or effective component is absent from the bound curriculum catalog.');
		return { issues };
	}
	let leaves;
	try {
		leaves = trueCurriculumTopicLeaves(specification.components);
	} catch (error) {
		issues.push(errorMessage(error));
		return { issues };
	}
	if (!leaves.some((component) => component.id === to)) {
		issues.push(`${to} is not a true terminal topic leaf.`);
	}
	const ancestry = [];
	let cursor = effectiveCatalogComponent;
	const visited = new Set();
	while (cursor?.parentId) {
		if (visited.has(cursor.id)) {
			issues.push('Curriculum ancestry contains a cycle.');
			break;
		}
		visited.add(cursor.id);
		ancestry.push(cursor.parentId);
		if (cursor.parentId === from) break;
		cursor = componentById.get(cursor.parentId);
		if (!cursor) {
			issues.push('Curriculum ancestry refers to a missing component.');
			break;
		}
	}
	if (!ancestry.includes(from) || to === from) {
		issues.push(`${to} is not a strict descendant of ${from}.`);
	}
	if (
		baseEvidence.specificationId !== basePlanRow.specificationId ||
		effectiveEvidence.specificationId !== basePlanRow.specificationId ||
		baseEvidence.specificationSha256 !== basePlanRow.specificationSha256 ||
		effectiveEvidence.specificationSha256 !== basePlanRow.specificationSha256
	) {
		issues.push(
			'Base and effective components are not from the exact same specification evidence.'
		);
	}
	if (
		baseEvidence.componentId !== basePlanRow.curriculumComponentId ||
		baseEvidence.code !== basePlanRow.curriculumCode ||
		baseEvidence.title !== basePlanRow.curriculumTitle ||
		baseEvidence.pageStart !== basePlanRow.curriculumPageStart ||
		baseEvidence.pageEnd !== basePlanRow.curriculumPageEnd
	) {
		issues.push('Base plan component tuple differs from frozen curriculum evidence.');
	}
	if (
		effectiveEvidence.code !== effectiveCatalogComponent.code ||
		effectiveEvidence.title !== effectiveCatalogComponent.title ||
		effectiveEvidence.pageStart !== effectiveCatalogComponent.sourcePageStart ||
		effectiveEvidence.pageEnd !== effectiveCatalogComponent.sourcePageEnd
	) {
		issues.push('Effective evidence tuple differs from the true-leaf catalog component.');
	}
	try {
		assertSubstantiveCurriculumEvidence(
			{
				id: effectiveEvidence.componentId,
				code: effectiveEvidence.code,
				title: effectiveEvidence.title
			},
			effectiveEvidence.sourceText
		);
	} catch (error) {
		issues.push(errorMessage(error));
	}
	const baseComponent = componentTuple(baseEvidence);
	const effectiveComponent = componentTuple(effectiveEvidence);
	return {
		issues,
		from,
		to,
		baseEvidence,
		effectiveEvidence,
		baseComponent,
		effectiveComponent
	};
}

function selectLatestMatchingAttempt({
	attempts,
	challengeId,
	priorTarget,
	from,
	to,
	rows,
	reviews,
	priorCandidate,
	basePlan,
	effectivePlan,
	effectivePlanRow,
	effectiveCurriculum,
	validateBatchCandidate
}) {
	const issues = [];
	if (!Array.isArray(attempts) || attempts.length !== 4) {
		return {
			issues: ['Descendant remap requires exactly four immutable exhausted repair attempts.']
		};
	}
	const ordered = [...attempts].sort((left, right) => left.attempt - right.attempt);
	if (ordered.some((attempt, index) => attempt?.attempt !== index + 1)) {
		issues.push('Repair attempts must be exact, unique and contiguous from 1 through 4.');
	}
	if (ordered.some((attempt) => attempt.attempt > 4)) {
		issues.push('Descendant remap cannot create or consume attempt 5.');
	}
	if (
		ordered.some(
			(attempt) => attempt?.status !== 'failed' || attempt?.sourceValidation?.status !== 'failed'
		)
	) {
		issues.push(
			'Descendant remap requires every exhausted source attempt to retain failed validation status.'
		);
	}
	if (issues.length) return { issues };
	const matching = [];
	for (const attempt of ordered) {
		if (
			attempt?.invalidated === true ||
			attempt?.status !== 'failed' ||
			attempt?.sourceValidation?.status !== 'failed' ||
			attempt?.runSummary?.status !== 'passed' ||
			attempt?.runPolicy?.status !== 'passed' ||
			(attempt?.runPolicy?.issues?.length ?? 0) !== 0
		) {
			continue;
		}
		if (
			attempt.sourceValidation.candidateSha256 !== canonicalHash(attempt.candidate) ||
			attempt.sourceValidation.runSummarySha256 !== canonicalHash(attempt.runSummary) ||
			!Array.isArray(attempt.sourceValidation.verificationRepairCohortIssues) ||
			attempt.sourceValidation.verificationRepairCohortIssues.length !== 0
		) {
			continue;
		}
		const target = attempt.candidate.challenges?.find(
			(challenge) => challenge?.definition?.id === challengeId
		);
		if (
			!target ||
			!onlyExactTargetFieldChanged({
				beforeBatch: { challenges: [priorTarget] },
				afterBatch: { challenges: [target] },
				challengeId,
				from,
				to
			})
		) {
			continue;
		}
		const candidateSha256 = canonicalHash(attempt.candidate);
		const repairValidation = validateVerificationRepairCandidate({
			candidate: structuredClone(attempt.candidate),
			priorCandidate: structuredClone(priorCandidate),
			rows: structuredClone(rows),
			reviews: structuredClone(reviews)
		});
		if (
			repairValidation.status !== 'passed' ||
			(repairValidation.issues?.length ?? 0) !== 0 ||
			canonicalHash(attempt.candidate) !== candidateSha256
		) {
			continue;
		}
		const baseValidation = validateBatchCandidate(
			structuredClone(attempt.candidate),
			structuredClone(basePlan.rows.filter((row) => row.shard === rows[0]?.shard)),
			{
				basePlan: structuredClone(basePlan),
				effectivePlan: null,
				effectivePlanRow: null,
				effectiveCurriculum: null,
				validationMode: 'base-plan-negative-control'
			}
		);
		const effectiveValidation = validateBatchCandidate(
			structuredClone(attempt.candidate),
			structuredClone(effectivePlan.rows.filter((row) => row.shard === rows[0]?.shard)),
			{
				basePlan: structuredClone(basePlan),
				effectivePlan: structuredClone(effectivePlan),
				effectivePlanRow: structuredClone(effectivePlanRow),
				effectiveCurriculum: structuredClone(effectiveCurriculum),
				validationMode: 'effective-row'
			}
		);
		if (
			baseValidation?.status !== 'failed' ||
			effectiveValidation?.status !== 'passed' ||
			(effectiveValidation?.issues?.length ?? 0) !== 0 ||
			!validBatchValidationBinding({
				validation: baseValidation,
				candidate: attempt.candidate,
				planRows: basePlan.rows.filter((row) => row.shard === rows[0]?.shard),
				planSha256: canonicalHash(basePlan),
				expectedStatus: 'failed'
			}) ||
			!validBatchValidationBinding({
				validation: effectiveValidation,
				candidate: attempt.candidate,
				planRows: effectivePlan.rows.filter((row) => row.shard === rows[0]?.shard),
				planSha256: canonicalHash(effectivePlan),
				expectedStatus: 'passed'
			}) ||
			canonicalHash(attempt.candidate) !== candidateSha256
		) {
			continue;
		}
		matching.push({
			...attempt,
			candidateTarget: target,
			repairValidation,
			baseValidation,
			effectiveValidation
		});
	}
	if (matching.length === 0) {
		issues.push('No immutable failed attempt contains the exact verifier-directed target remap.');
		return { issues };
	}
	const targetHashes = new Set(matching.map((attempt) => canonicalHash(attempt.candidateTarget)));
	if (targetHashes.size !== 1) {
		issues.push('Matching failed attempts contain ambiguous target-row candidates.');
		return { issues };
	}
	const replay = matching.at(-1);
	const binding = {
		attempt: replay.attempt,
		status: 'failed',
		runStatus: 'passed',
		runSummarySha256: canonicalHash(replay.runSummary),
		sourceValidationSha256: canonicalHash(replay.sourceValidation),
		sourceCandidateSha256: canonicalHash(replay.candidate),
		targetCandidateSha256: canonicalHash(replay.candidateTarget),
		runPolicySha256: canonicalHash(replay.runPolicy),
		exactFileBindingsSha256: canonicalHash(replay.fileBindings),
		fileBindings: replay.fileBindings
	};
	const attemptBudget = {
		maxAttempts: 4,
		exhausted: true,
		attempts: ordered.map((attempt) => ({
			attempt: attempt.attempt,
			status: 'failed',
			invalidated: attempt.invalidated === true,
			runSummarySha256: canonicalHash(attempt.runSummary),
			validationSha256: canonicalHash(attempt.sourceValidation),
			candidateSha256: canonicalHash(attempt.candidate),
			fileBindingsSha256: canonicalHash(attempt.fileBindings)
		})),
		matchingAttempts: matching.map((attempt) => attempt.attempt),
		selectedAttempt: replay.attempt
	};
	return {
		issues,
		replay,
		binding,
		attemptBudget,
		repairValidation: replay.repairValidation,
		baseValidation: replay.baseValidation,
		effectiveValidation: replay.effectiveValidation
	};
}

function validBatchValidationBinding({
	validation,
	candidate,
	planRows,
	planSha256,
	expectedStatus
}) {
	return (
		validation?.status === expectedStatus &&
		validation.candidateSha256 === canonicalHash(candidate) &&
		validation.planRowsSha256 === canonicalHash(planRows) &&
		validation.planSha256 === planSha256 &&
		validation.candidateCount === candidate.challenges.length
	);
}

function onlyExactTargetFieldChanged({ beforeBatch, afterBatch, challengeId, from, to }) {
	const before = structuredClone(beforeBatch);
	const after = structuredClone(afterBatch);
	const beforeTarget = before.challenges?.find(
		(challenge) => challenge?.definition?.id === challengeId
	);
	const afterTarget = after.challenges?.find(
		(challenge) => challenge?.definition?.id === challengeId
	);
	if (
		!beforeTarget ||
		!afterTarget ||
		beforeTarget.grounding?.curriculumComponentId !== from ||
		afterTarget.grounding?.curriculumComponentId !== to ||
		from === to
	) {
		return false;
	}
	afterTarget.grounding.curriculumComponentId = from;
	return canonicalHash(after) === canonicalHash(before);
}

function componentTuple(evidence) {
	return {
		curriculumComponentId: evidence.componentId,
		curriculumCode: evidence.code,
		curriculumTitle: evidence.title,
		curriculumPageStart: evidence.pageStart,
		curriculumPageEnd: evidence.pageEnd,
		specificationId: evidence.specificationId,
		specificationSha256: evidence.specificationSha256,
		sourceTextSha256: evidence.sourceTextSha256
	};
}

function applyComponentTupleToPlanRow(row, component) {
	for (const field of [
		'curriculumComponentId',
		'curriculumCode',
		'curriculumTitle',
		'curriculumPageStart',
		'curriculumPageEnd',
		'specificationId',
		'specificationSha256'
	]) {
		row[field] = component[field];
	}
}

function curriculumSpecification(catalog, specificationId) {
	if (Array.isArray(catalog?.specifications)) {
		return catalog.specifications.find((specification) => specification?.id === specificationId);
	}
	if (catalog?.id === specificationId && Array.isArray(catalog.components)) return catalog;
	return null;
}

function uniqueChallengesById(challenges, issues, label) {
	return uniqueBy(challenges, (challenge) => challenge?.definition?.id, issues, label);
}

function uniqueBy(values, idFor, issues, label) {
	const byId = new Map();
	for (const value of values ?? []) {
		const id = idFor(value);
		if (!nonEmpty(id)) {
			issues.push(`${label} contains an item without an id.`);
			continue;
		}
		if (byId.has(id)) issues.push(`${label} duplicates ${id}.`);
		byId.set(id, value);
	}
	return byId;
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

function failed(value) {
	return {
		status: 'failed',
		issues: Array.isArray(value) ? value : [value],
		manifest: null,
		candidate: null,
		validation: null
	};
}
