import {
	SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS,
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	canonicalHash,
	validateIndependentContentReviewRow
} from './science-challenge-release.mjs';
import { validateVerificationRepairCandidate } from './science-challenge-verification-repair-transaction.mjs';

export const SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SCHEMA =
	'science-challenge-verifier-directed-difficulty-plan-adjustment/v1';
export const SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_VALIDATION_SCHEMA =
	'science-challenge-verifier-directed-difficulty-plan-adjustment-validation/v1';
export const SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DISPOSITION =
	'deterministic-verifier-directed-difficulty-plan-adjustment';
export const SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD = 'definition.difficulty';
export const SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY =
	'complete-terminal-attempt-04-only';
export const SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_COLLECTION_POLICY =
	'deferred-to-final-effective-cohort';
export const SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA =
	'science-challenge-verifier-directed-difficulty-plan-adjustment-set/v1';
export const SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_DISPOSITION =
	'deterministic-verifier-directed-difficulty-plan-adjustment-set';

const HASH = /^[a-f0-9]{64}$/u;
const MAX_ATTEMPTS = 4;
const ALLOWED_DIFFICULTY_ADJUSTMENTS = new Set(['starter:standard', 'stretch:standard']);

/**
 * Build a review-pending difficulty-plan adjustment from one complete immutable attempt-04 batch.
 *
 * The model output remains untouched. The plan projection is the only changed planning artifact,
 * and publication still requires a new explicit independent-review decision.
 */
export function buildScienceChallengeDifficultyPlanAdjustment(input) {
	const issues = [];
	if (!isRecord(input)) return failed('Difficulty-plan adjustment input must be an object.');
	const {
		plan,
		shardId,
		repairSha256,
		curriculumEvidenceSha256,
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
		issues.push('Difficulty-plan adjustment requires the exact frozen plan.');
	}
	if (!nonEmpty(shardId)) issues.push('Difficulty-plan adjustment shardId is required.');
	if (!HASH.test(String(repairSha256 ?? ''))) {
		issues.push('Difficulty-plan adjustment repairSha256 must be a lowercase SHA-256.');
	}
	if (!HASH.test(String(curriculumEvidenceSha256 ?? ''))) {
		issues.push('Difficulty-plan adjustment curriculumEvidenceSha256 must be a lowercase SHA-256.');
	}
	if (!isRecord(priorCandidate) || !Array.isArray(priorCandidate.challenges)) {
		issues.push('Difficulty-plan adjustment requires the immutable prior candidate batch.');
	}
	if (typeof validateBatchCandidate !== 'function') {
		issues.push('Difficulty-plan adjustment requires ordinary batch validation.');
	}
	if (issues.length) return failed(issues);

	const planSha256 = canonicalHash(plan);
	if (
		firstReviewSummary?.planSha256 !== planSha256 ||
		firstReviewSummary?.curriculumEvidenceSha256 !== curriculumEvidenceSha256 ||
		canonicalHash(firstReviewSummary) !== repairSha256 ||
		firstReviewSummary?.status !== 'failed'
	) {
		issues.push(
			'First review does not bind the frozen plan, curriculum evidence and failed repair objective.'
		);
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

	const reviewSelection = selectVerifierDirectedDifficultyReview({
		firstReviewSummary,
		firstReviewResult,
		firstAssignment,
		dispatchLedger,
		shardId,
		priorById,
		plan,
		curriculumEvidenceSha256
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

	const attemptSelection = selectTerminalAttempt({
		attempts,
		challengeId,
		priorTarget,
		rows: shardRows,
		reviews: firstReviewSummary.reviews,
		priorCandidate,
		basePlan: plan,
		basePlanRow,
		validateBatchCandidate
	});
	issues.push(...attemptSelection.issues);
	if (issues.length) return failed(issues);

	const from = basePlanRow.difficulty;
	const to = attemptSelection.candidateTarget?.definition?.difficulty;
	if (from !== 'stretch' || to !== 'standard' || priorTarget?.definition?.difficulty !== from) {
		return failed(
			`${challengeId} difficulty adjustment must be the explicitly reviewed stretch to standard correction.`
		);
	}
	if (!reviewExplicitlyAllowsDifficultyAdjustment(review.issues[0], from, to)) {
		return failed(
			`${challengeId} first review does not explicitly authorize the exact ${from} to ${to} adjustment.`
		);
	}

	const effectivePlan = structuredClone(plan);
	const effectivePlanRow = effectivePlan.rows[basePlanRowIndex];
	effectivePlanRow.difficulty = to;
	const effectivePlanSha256 = canonicalHash(effectivePlan);
	const candidate = structuredClone(attemptSelection.candidate);
	const candidateSha256 = canonicalHash(candidate);
	const candidateTarget = candidate.challenges.find(
		(challenge) => challenge?.definition?.id === challengeId
	);
	const restoredTarget = structuredClone(candidateTarget);
	restoredTarget.definition.difficulty = from;
	if (canonicalHash(restoredTarget) !== canonicalHash(priorTarget)) {
		return failed(
			'Terminal attempt target changes bytes outside the one verifier-directed difficulty field.'
		);
	}
	const siblingReviewBindings = firstReviewSummary.reviews
		.filter(
			(candidateReview) =>
				candidateReview.id !== challengeId && shardRows.some((row) => row.id === candidateReview.id)
		)
		.map((candidateReview) => {
			const priorSibling = priorById.get(candidateReview.id);
			const candidateSibling = candidate.challenges.find(
				(entry) => entry?.definition?.id === candidateReview.id
			);
			return {
				challengeId: candidateReview.id,
				accepted: candidateReview.accepted,
				priorSha256: canonicalHash(priorSibling),
				candidateSha256: canonicalHash(candidateSibling)
			};
		});

	const baseBatchValidation = validateBatchCandidate(
		structuredClone(candidate),
		structuredClone(shardRows),
		{
			basePlan: structuredClone(plan),
			effectivePlan: null,
			effectivePlanRow: null,
			validationMode: 'base-plan-negative-control'
		}
	);
	const effectiveShardRows = effectivePlan.rows.filter((row) => row.shard === shardId);
	const effectiveBatchValidation = validateBatchCandidate(
		structuredClone(candidate),
		structuredClone(effectiveShardRows),
		{
			basePlan: structuredClone(plan),
			effectivePlan: structuredClone(effectivePlan),
			effectivePlanRow: structuredClone(effectivePlanRow),
			validationMode: 'effective-row'
		}
	);
	if (
		baseBatchValidation?.status !== 'failed' ||
		effectiveBatchValidation?.status !== 'passed' ||
		(effectiveBatchValidation?.issues?.length ?? 0) !== 0 ||
		!validBatchValidationBinding({
			validation: baseBatchValidation,
			candidate,
			planRows: shardRows,
			planSha256,
			expectedStatus: 'failed'
		}) ||
		!validBatchValidationBinding({
			validation: effectiveBatchValidation,
			candidate,
			planRows: effectiveShardRows,
			planSha256: effectivePlanSha256,
			expectedStatus: 'passed'
		}) ||
		canonicalHash(candidate) !== candidateSha256
	) {
		issues.push(
			'Terminal attempt must fail the frozen plan and pass the exact effective difficulty plan.',
			...(baseBatchValidation?.issues ?? []),
			...(effectiveBatchValidation?.issues ?? [])
		);
	}

	const collectionValidation = deferredCollectionValidation({
		candidate,
		effectivePlan,
		shardId,
		recoveryCount: 1
	});
	if (issues.length) return failed(issues);

	const adjustment = {
		challengeId,
		field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
		from,
		to
	};
	const inverseAdjustment = {
		challengeId,
		field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
		from: to,
		to: from
	};
	const manifestCore = {
		schemaVersion: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SCHEMA,
		disposition: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DISPOSITION,
		shardId,
		repairSha256,
		challengeId,
		field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
		base: {
			planSha256,
			planRowIndex: basePlanRowIndex,
			planRowSha256: canonicalHash(basePlanRow),
			difficulty: from
		},
		effective: {
			planSha256: effectivePlanSha256,
			planRowIndex: basePlanRowIndex,
			planRowSha256: canonicalHash(effectivePlanRow),
			difficulty: to
		},
		firstReview: {
			summarySha256: canonicalHash(firstReviewSummary),
			resultSha256: canonicalHash(firstReviewResult),
			assignmentSha256: canonicalHash(firstAssignment),
			dispatchLedgerSha256: canonicalHash(dispatchLedger),
			reviewSha256: canonicalHash(review),
			issueSha256: canonicalHash(review.issues[0]),
			canonicalVerifier
		},
		sourceAttempt: attemptSelection.binding,
		attemptBudget: attemptSelection.attemptBudget,
		priorCandidateSha256,
		priorValidationSha256: canonicalHash(priorValidation),
		priorBaseBatchValidationSha256: canonicalHash(priorBaseBatchValidation),
		candidateSha256,
		siblingReviewBindings,
		siblingReviewBindingsSha256: canonicalHash(siblingReviewBindings),
		adjustment,
		adjustmentSha256: canonicalHash(adjustment),
		inverseAdjustment,
		inverseAdjustmentSha256: canonicalHash(inverseAdjustment),
		priorTargetSha256: canonicalHash(priorTarget),
		candidateTargetSha256: canonicalHash(candidateTarget),
		inverseTargetSha256: canonicalHash(priorTarget),
		repairValidationSha256: canonicalHash(attemptSelection.repairValidation),
		baseBatchValidationSha256: canonicalHash(baseBatchValidation),
		effectiveBatchValidationSha256: canonicalHash(effectiveBatchValidation),
		collectionValidationPolicy: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_COLLECTION_POLICY,
		collectionValidationSha256: canonicalHash(collectionValidation),
		normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION
	};
	const manifest = {
		...manifestCore,
		manifestCoreSha256: canonicalHash(manifestCore)
	};
	const validation = {
		schemaVersion: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_VALIDATION_SCHEMA,
		status: 'review-pending',
		issues: [
			'A fresh full-cohort independent verification pass with the exact typed difficulty-plan adjustment decision is required.'
		],
		authoringDisposition: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DISPOSITION,
		sourceAttempt: MAX_ATTEMPTS,
		sourceAttemptStatus: 'failed',
		sourcePolicy: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY,
		basePlanSha256: planSha256,
		effectivePlanSha256,
		effectivePlanRowSha256: canonicalHash(effectivePlanRow),
		curriculumEvidenceSha256,
		firstReviewSha256: canonicalHash(firstReviewSummary),
		priorCandidateSha256,
		priorValidationSha256: canonicalHash(priorValidation),
		priorBaseBatchValidationSha256: canonicalHash(priorBaseBatchValidation),
		candidateSha256,
		adjustmentSha256: canonicalHash(adjustment),
		manifestSha256: canonicalHash(manifest),
		effectiveBatchValidationSha256: canonicalHash(effectiveBatchValidation),
		collectionValidationPolicy: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_COLLECTION_POLICY,
		collectionValidationSha256: canonicalHash(collectionValidation),
		repairValidationSha256: canonicalHash(attemptSelection.repairValidation),
		baseBatchValidationSha256: canonicalHash(baseBatchValidation)
	};

	return {
		status: 'passed',
		issues: [],
		manifest,
		candidate,
		validation,
		effectivePlan,
		effectivePlanRow,
		adjustment,
		canonicalVerifier,
		sourceAttempt: attemptSelection.terminal,
		priorBaseBatchValidation,
		baseBatchValidation,
		effectiveBatchValidation,
		collectionValidation,
		repairValidation: attemptSelection.repairValidation
	};
}

/**
 * Bind multiple verifier-authorized difficulty corrections found in one immutable terminal batch.
 *
 * Unlike the legacy single-adjustment path, a target row may also contain ordinary reviewed content
 * repairs. This builder never rewrites that row. It binds the complete terminal candidate, records
 * the exact candidate bytes with each difficulty value projected back to its base value, and changes
 * only the corresponding frozen plan rows.
 */
export function buildScienceChallengeDifficultyPlanAdjustmentSet(input) {
	const issues = [];
	if (!isRecord(input)) {
		return failed('Difficulty-plan adjustment set input must be an object.');
	}
	const {
		plan,
		shardId,
		repairSha256,
		curriculumEvidenceSha256,
		objectiveId,
		executionId,
		requestedAdjustments,
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
		issues.push('Difficulty-plan adjustment set requires the exact frozen plan.');
	}
	if (!nonEmpty(shardId)) {
		issues.push('Difficulty-plan adjustment set shardId is required.');
	}
	for (const [value, label] of [
		[repairSha256, 'repairSha256'],
		[curriculumEvidenceSha256, 'curriculumEvidenceSha256'],
		[objectiveId, 'objectiveId'],
		[executionId, 'executionId']
	]) {
		if (!HASH.test(String(value ?? ''))) {
			issues.push(`Difficulty-plan adjustment set ${label} must be a lowercase SHA-256.`);
		}
	}
	if (!isRecord(priorCandidate) || !Array.isArray(priorCandidate.challenges)) {
		issues.push('Difficulty-plan adjustment set requires the immutable prior candidate batch.');
	}
	if (typeof validateBatchCandidate !== 'function') {
		issues.push('Difficulty-plan adjustment set requires ordinary batch validation.');
	}
	const requestedValidation = validateRequestedDifficultyAdjustments(requestedAdjustments);
	issues.push(...requestedValidation.issues);
	if (issues.length) return failed(issues);

	const planSha256 = canonicalHash(plan);
	if (
		firstReviewSummary?.planSha256 !== planSha256 ||
		firstReviewSummary?.curriculumEvidenceSha256 !== curriculumEvidenceSha256 ||
		canonicalHash(firstReviewSummary) !== repairSha256 ||
		firstReviewSummary?.status !== 'failed'
	) {
		issues.push(
			'Difficulty-plan adjustment set first review does not bind the frozen plan, curriculum evidence and failed repair objective.'
		);
	}
	if (
		priorValidation?.status !== 'passed' ||
		(priorValidation?.issues?.length ?? 0) !== 0 ||
		priorValidation?.candidateSha256 !== canonicalHash(priorCandidate)
	) {
		issues.push(
			'Difficulty-plan adjustment set prior candidate is not bound by a passed immutable validation.'
		);
	}
	const shardRows = plan.rows.filter((row) => row?.shard === shardId);
	const priorById = uniqueChallengesById(
		priorCandidate.challenges,
		issues,
		'difficulty-plan adjustment set prior candidate'
	);
	if (
		priorCandidate.challenges.length !== shardRows.length ||
		shardRows.some((row) => !priorById.has(row.id))
	) {
		issues.push(
			'Difficulty-plan adjustment set prior candidate membership differs from the exact shard rows.'
		);
	}
	const requestedById = new Map(
		requestedAdjustments.map((adjustment) => [adjustment.challengeId, adjustment])
	);
	if (
		requestedAdjustments.some(
			(adjustment) => plan.rows.find((row) => row?.id === adjustment.challengeId)?.shard !== shardId
		)
	) {
		issues.push('Difficulty-plan adjustment set contains a wrong-shard target.');
	}
	const expectedOrder = shardRows
		.filter((row) => requestedById.has(row.id))
		.map((row) => requestedById.get(row.id));
	if (canonicalHash(expectedOrder) !== canonicalHash(requestedAdjustments)) {
		issues.push(
			'Difficulty-plan adjustment set targets must follow the exact frozen shard-row order.'
		);
	}
	const priorCandidateSha256 = canonicalHash(priorCandidate);
	const priorBaseBatchValidation = validateBatchCandidate(
		structuredClone(priorCandidate),
		structuredClone(shardRows),
		{
			basePlan: structuredClone(plan),
			effectivePlan: null,
			effectivePlanRows: [],
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
			'Difficulty-plan adjustment set prior candidate failed exact current ordinary validation against the frozen base plan.',
			...(priorBaseBatchValidation?.issues ?? [])
		);
	}

	const reviewEnvelope = validateDifficultyAdjustmentSetReviewEnvelope({
		firstReviewSummary,
		firstReviewResult,
		firstAssignment,
		dispatchLedger,
		shardId,
		priorById,
		plan,
		curriculumEvidenceSha256
	});
	issues.push(...reviewEnvelope.issues);
	if (issues.length) return failed(issues);

	const terminalSelection = selectTerminalAttemptForAdjustmentSet({
		attempts,
		rows: shardRows,
		reviews: firstReviewSummary.reviews,
		priorCandidate,
		basePlan: plan,
		requestedAdjustments,
		validateBatchCandidate
	});
	issues.push(...terminalSelection.issues);
	if (issues.length) return failed(issues);
	const candidate = structuredClone(terminalSelection.candidate);
	const candidateSha256 = canonicalHash(candidate);
	const reviewById = new Map(firstReviewSummary.reviews.map((review) => [review?.id, review]));
	const adjustmentRecords = [];
	for (const requested of requestedAdjustments) {
		const rowIndex = plan.rows.findIndex((row) => row?.id === requested.challengeId);
		const basePlanRow = plan.rows[rowIndex];
		const priorTarget = priorById.get(requested.challengeId);
		const candidateTarget = candidate.challenges.find(
			(entry) => entry?.definition?.id === requested.challengeId
		);
		const review = reviewById.get(requested.challengeId);
		const difficultyIssues = review?.issues?.filter(
			(issue) => issue?.field === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD
		);
		issues.push(
			...validateIndependentContentReviewRow(review).issues.map(
				(issue) => `${requested.challengeId}: ${issue}`
			)
		);
		if (
			review?.accepted !== false ||
			review?.difficultyCalibrated !== false ||
			difficultyIssues?.length !== 1 ||
			!reviewExplicitlyAllowsDifficultyAdjustment(difficultyIssues[0], requested.from, requested.to)
		) {
			issues.push(
				`${requested.challengeId} does not have one exact verifier-authorized ${requested.from} to ${requested.to} difficulty correction.`
			);
			continue;
		}
		if (
			basePlanRow?.difficulty !== requested.from ||
			priorTarget?.definition?.difficulty !== requested.from ||
			candidateTarget?.definition?.difficulty !== requested.to
		) {
			issues.push(
				`${requested.challengeId} requested difficulty correction differs from the frozen plan, prior candidate or terminal candidate.`
			);
			continue;
		}
		const candidateWithoutAdjustment = structuredClone(candidateTarget);
		candidateWithoutAdjustment.definition.difficulty = requested.from;
		const effectivePlanRow = structuredClone(basePlanRow);
		effectivePlanRow.difficulty = requested.to;
		adjustmentRecords.push({
			...requested,
			basePlanRowIndex: rowIndex,
			basePlanRowSha256: canonicalHash(basePlanRow),
			effectivePlanRowSha256: canonicalHash(effectivePlanRow),
			review: structuredClone(review),
			reviewSha256: canonicalHash(review),
			issue: structuredClone(difficultyIssues[0]),
			issueSha256: canonicalHash(difficultyIssues[0]),
			priorTargetSha256: canonicalHash(priorTarget),
			candidateTargetSha256: canonicalHash(candidateTarget),
			candidateWithoutAdjustmentSha256: canonicalHash(candidateWithoutAdjustment)
		});
	}
	if (issues.length) return failed(issues);
	if (
		canonicalHash(adjustmentRecords.map(adjustmentCore)) !== canonicalHash(requestedAdjustments)
	) {
		return failed(
			'Difficulty-plan adjustment set resolved targets differ from the exact requested corrections.'
		);
	}

	const effectivePlan = structuredClone(plan);
	for (const adjustment of adjustmentRecords) {
		effectivePlan.rows[adjustment.basePlanRowIndex].difficulty = adjustment.to;
	}
	const effectivePlanSha256 = canonicalHash(effectivePlan);
	const effectiveShardRows = effectivePlan.rows.filter((row) => row?.shard === shardId);
	const baseBatchValidation = validateBatchCandidate(
		structuredClone(candidate),
		structuredClone(shardRows),
		{
			basePlan: structuredClone(plan),
			effectivePlan: null,
			effectivePlanRows: [],
			validationMode: 'base-plan-negative-control'
		}
	);
	const effectiveBatchValidation = validateBatchCandidate(
		structuredClone(candidate),
		structuredClone(effectiveShardRows),
		{
			basePlan: structuredClone(plan),
			effectivePlan: structuredClone(effectivePlan),
			effectivePlanRows: structuredClone(
				adjustmentRecords.map((adjustment) => effectivePlan.rows[adjustment.basePlanRowIndex])
			),
			validationMode: 'effective-adjustment-set'
		}
	);
	if (
		baseBatchValidation?.status !== 'failed' ||
		effectiveBatchValidation?.status !== 'passed' ||
		(effectiveBatchValidation?.issues?.length ?? 0) !== 0 ||
		!validBatchValidationBinding({
			validation: baseBatchValidation,
			candidate,
			planRows: shardRows,
			planSha256,
			expectedStatus: 'failed'
		}) ||
		!validBatchValidationBinding({
			validation: effectiveBatchValidation,
			candidate,
			planRows: effectiveShardRows,
			planSha256: effectivePlanSha256,
			expectedStatus: 'passed'
		}) ||
		canonicalHash(candidate) !== candidateSha256
	) {
		issues.push(
			'Difficulty-plan adjustment set terminal candidate must fail the frozen plan and pass the exact combined effective plan.',
			...(baseBatchValidation?.issues ?? []),
			...(effectiveBatchValidation?.issues ?? [])
		);
	}
	const collectionValidation = deferredCollectionValidation({
		candidate,
		effectivePlan,
		shardId,
		recoveryCount: adjustmentRecords.length
	});
	if (issues.length) return failed(issues);

	const rowReviewBindings = shardRows.map((row) => {
		const review = reviewById.get(row.id);
		const prior = priorById.get(row.id);
		const current = candidate.challenges.find((entry) => entry?.definition?.id === row.id);
		return {
			challengeId: row.id,
			accepted: review.accepted,
			reviewSha256: canonicalHash(review),
			priorCandidateSha256: canonicalHash(prior),
			candidateSha256: canonicalHash(current)
		};
	});
	const manifestCore = {
		schemaVersion: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA,
		disposition: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_DISPOSITION,
		shardId,
		repairSha256,
		objectiveId,
		executionId,
		field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
		base: {
			planSha256,
			shardRowsSha256: canonicalHash(shardRows)
		},
		effective: {
			planSha256: effectivePlanSha256,
			shardRowsSha256: canonicalHash(effectiveShardRows)
		},
		firstReview: {
			summarySha256: canonicalHash(firstReviewSummary),
			resultSha256: canonicalHash(firstReviewResult),
			assignmentSha256: canonicalHash(firstAssignment),
			dispatchLedgerSha256: canonicalHash(dispatchLedger),
			canonicalVerifier: reviewEnvelope.canonicalVerifier
		},
		sourceAttempt: terminalSelection.binding,
		attemptBudget: terminalSelection.attemptBudget,
		priorCandidateSha256,
		priorValidationSha256: canonicalHash(priorValidation),
		priorBaseBatchValidationSha256: canonicalHash(priorBaseBatchValidation),
		candidateSha256,
		adjustmentCount: adjustmentRecords.length,
		adjustments: adjustmentRecords,
		adjustmentSetSha256: canonicalHash(adjustmentRecords),
		requestedAdjustmentSetSha256: canonicalHash(requestedAdjustments),
		rowReviewBindings,
		rowReviewBindingsSha256: canonicalHash(rowReviewBindings),
		repairValidationSha256: canonicalHash(terminalSelection.repairValidation),
		baseBatchValidationSha256: canonicalHash(baseBatchValidation),
		effectiveBatchValidationSha256: canonicalHash(effectiveBatchValidation),
		collectionValidationPolicy: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_COLLECTION_POLICY,
		collectionValidationSha256: canonicalHash(collectionValidation),
		normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION
	};
	const manifest = {
		...manifestCore,
		manifestCoreSha256: canonicalHash(manifestCore)
	};
	const validation = {
		schemaVersion: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_VALIDATION_SCHEMA,
		status: 'review-pending',
		issues: [
			'A fresh full-cohort independent verification pass with one exact typed decision for every difficulty-plan adjustment is required.'
		],
		authoringDisposition: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_DISPOSITION,
		sourceAttempt: MAX_ATTEMPTS,
		sourceAttemptStatus: 'failed',
		sourcePolicy: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY,
		basePlanSha256: planSha256,
		effectivePlanSha256,
		curriculumEvidenceSha256,
		firstReviewSha256: canonicalHash(firstReviewSummary),
		priorCandidateSha256,
		candidateSha256,
		adjustmentCount: adjustmentRecords.length,
		adjustmentSetSha256: canonicalHash(adjustmentRecords),
		manifestSha256: canonicalHash(manifest),
		effectiveBatchValidationSha256: canonicalHash(effectiveBatchValidation),
		collectionValidationPolicy: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_COLLECTION_POLICY,
		collectionValidationSha256: canonicalHash(collectionValidation)
	};
	return {
		status: 'passed',
		issues: [],
		manifest,
		candidate,
		validation,
		effectivePlan,
		adjustments: adjustmentRecords.map(adjustmentCore),
		canonicalVerifier: reviewEnvelope.canonicalVerifier,
		sourceAttempt: terminalSelection.terminal,
		priorBaseBatchValidation,
		baseBatchValidation,
		effectiveBatchValidation,
		collectionValidation,
		repairValidation: terminalSelection.repairValidation
	};
}

export function difficultyPlanAdjustmentDecision(manifest, accepted) {
	if (manifest?.schemaVersion !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SCHEMA) {
		throw new Error('Difficulty-plan adjustment manifest schema is invalid.');
	}
	if (typeof accepted !== 'boolean') {
		throw new TypeError('Difficulty-plan adjustment accepted must be boolean.');
	}
	return { ...manifest.adjustment, accepted };
}

export function difficultyPlanAdjustmentSetDecisions(manifest, accepted) {
	if (manifest?.schemaVersion !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA) {
		throw new Error('Difficulty-plan adjustment set manifest schema is invalid.');
	}
	if (typeof accepted !== 'boolean') {
		throw new TypeError('Difficulty-plan adjustment set accepted must be boolean.');
	}
	return manifest.adjustments.map((adjustment) => ({
		...adjustmentCore(adjustment),
		accepted
	}));
}

export function validateScienceChallengeDifficultyPlanAdjustmentManifest({
	manifest,
	plan,
	priorCandidate,
	candidate
}) {
	const issues = [];
	if (
		manifest?.schemaVersion !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SCHEMA ||
		manifest?.disposition !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DISPOSITION
	) {
		return failed('Difficulty-plan adjustment manifest schema or disposition is invalid.');
	}
	const { manifestCoreSha256, ...manifestCore } = manifest;
	if (
		!HASH.test(String(manifestCoreSha256 ?? '')) ||
		manifestCoreSha256 !== canonicalHash(manifestCore)
	) {
		issues.push('Difficulty-plan adjustment manifest self-binding hash is invalid.');
	}
	if (
		manifest.base?.planSha256 !== canonicalHash(plan) ||
		!Number.isInteger(manifest.base?.planRowIndex) ||
		canonicalHash(plan?.rows?.[manifest.base.planRowIndex]) !== manifest.base?.planRowSha256 ||
		plan?.rows?.[manifest.base.planRowIndex]?.shard !== manifest.shardId ||
		plan?.rows?.[manifest.base.planRowIndex]?.difficulty !== manifest.base?.difficulty
	) {
		issues.push('Difficulty-plan adjustment base plan binding is stale.');
	}
	if (
		canonicalHash(manifest.adjustment) !== manifest.adjustmentSha256 ||
		manifest.adjustment?.challengeId !== manifest.challengeId ||
		manifest.adjustment?.field !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD ||
		manifest.adjustment?.from !== manifest.base?.difficulty ||
		manifest.adjustment?.to !== manifest.effective?.difficulty ||
		manifest.adjustment?.from !== 'stretch' ||
		manifest.adjustment?.to !== 'standard'
	) {
		issues.push('Difficulty-plan adjustment forward patch is invalid.');
	}
	const expectedInverse = {
		challengeId: manifest.challengeId,
		field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
		from: manifest.adjustment?.to,
		to: manifest.adjustment?.from
	};
	if (
		canonicalHash(manifest.inverseAdjustment) !== canonicalHash(expectedInverse) ||
		manifest.inverseAdjustmentSha256 !== canonicalHash(expectedInverse)
	) {
		issues.push('Difficulty-plan adjustment inverse patch is invalid.');
	}
	if (
		manifest.sourceAttempt?.status !== 'failed' ||
		manifest.sourceAttempt?.attempt !== MAX_ATTEMPTS ||
		!['direct-terminal-candidate', 'helper-approved-multipart-salvage'].includes(
			manifest.sourceAttempt?.sourceKind
		) ||
		manifest.attemptBudget?.selectedAttempt !== MAX_ATTEMPTS ||
		manifest.attemptBudget?.maxAttempts !== MAX_ATTEMPTS ||
		manifest.attemptBudget?.exhausted !== true ||
		manifest.attemptBudget?.selectionPolicy !==
			SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY ||
		!Array.isArray(manifest.attemptBudget?.attempts) ||
		manifest.attemptBudget.attempts.length !== MAX_ATTEMPTS ||
		manifest.attemptBudget.attempts.some(
			(attempt, index) =>
				attempt?.attempt !== index + 1 ||
				attempt?.status !== 'failed' ||
				(attempt.invalidated === true && attempt.attempt === MAX_ATTEMPTS)
		)
	) {
		issues.push('Difficulty-plan adjustment requires the exact exhausted terminal attempt-04.');
	}
	if (
		manifest.sourceAttempt?.sourceKind === 'helper-approved-multipart-salvage' &&
		[
			'helperSalvageManifestSha256',
			'helperSalvageCandidateSha256',
			'helperSalvageCorrectionsSha256',
			'helperTargetCorrectionSha256'
		].some((field) => !HASH.test(String(manifest.sourceAttempt?.[field] ?? '')))
	) {
		issues.push('Difficulty-plan adjustment helper-salvage bindings are incomplete.');
	}
	if (
		!isRecord(priorCandidate) ||
		!isRecord(candidate) ||
		manifest.priorCandidateSha256 !== canonicalHash(priorCandidate) ||
		manifest.candidateSha256 !== canonicalHash(candidate)
	) {
		issues.push('Difficulty-plan adjustment prior/current candidate binding is invalid.');
	} else {
		const priorTarget = priorCandidate.challenges?.find(
			(entry) => entry?.definition?.id === manifest.challengeId
		);
		const candidateTarget = candidate.challenges?.find(
			(entry) => entry?.definition?.id === manifest.challengeId
		);
		const restoredTarget = structuredClone(candidateTarget);
		if (restoredTarget) restoredTarget.definition.difficulty = manifest.inverseAdjustment.to;
		const siblingIds = priorCandidate.challenges
			.map((entry) => entry?.definition?.id)
			.filter((id) => id !== manifest.challengeId);
		const siblingBindings = manifest.siblingReviewBindings;
		const siblingBindingById = new Map(
			(siblingBindings ?? []).map((binding) => [binding?.challengeId, binding])
		);
		if (
			canonicalHash(priorTarget) !== manifest.priorTargetSha256 ||
			canonicalHash(candidateTarget) !== manifest.candidateTargetSha256 ||
			candidateTarget?.definition?.difficulty !== manifest.adjustment.to ||
			priorTarget?.definition?.difficulty !== manifest.adjustment.from ||
			canonicalHash(restoredTarget) !== canonicalHash(priorTarget) ||
			canonicalHash(priorTarget) !== manifest.inverseTargetSha256 ||
			!Array.isArray(siblingBindings) ||
			manifest.siblingReviewBindingsSha256 !== canonicalHash(siblingBindings) ||
			siblingBindings.length !== siblingIds.length ||
			new Set(siblingBindings.map((binding) => binding?.challengeId)).size !== siblingIds.length ||
			siblingIds.some((id) => {
				const binding = siblingBindingById.get(id);
				const priorSibling = priorCandidate.challenges.find(
					(entry) => entry?.definition?.id === id
				);
				const candidateSibling = candidate.challenges.find((entry) => entry?.definition?.id === id);
				return (
					typeof binding?.accepted !== 'boolean' ||
					binding.priorSha256 !== canonicalHash(priorSibling) ||
					binding.candidateSha256 !== canonicalHash(candidateSibling) ||
					(binding.accepted === true && binding.candidateSha256 !== binding.priorSha256)
				);
			})
		) {
			issues.push('Difficulty-plan adjustment candidate diff or inverse replay is not exact.');
		}
	}
	return issues.length ? failed(issues) : { status: 'passed', issues: [] };
}

export function validateScienceChallengeDifficultyPlanAdjustmentSetManifest({
	manifest,
	plan,
	priorCandidate,
	candidate
}) {
	const issues = [];
	if (
		manifest?.schemaVersion !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA ||
		manifest?.disposition !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_DISPOSITION
	) {
		return failed('Difficulty-plan adjustment set manifest schema or disposition is invalid.');
	}
	const { manifestCoreSha256, ...manifestCore } = manifest;
	if (
		!HASH.test(String(manifestCoreSha256 ?? '')) ||
		manifestCoreSha256 !== canonicalHash(manifestCore)
	) {
		issues.push('Difficulty-plan adjustment set manifest self-binding hash is invalid.');
	}
	for (const [value, label] of [
		[manifest.repairSha256, 'repairSha256'],
		[manifest.objectiveId, 'objectiveId'],
		[manifest.executionId, 'executionId']
	]) {
		if (!HASH.test(String(value ?? ''))) {
			issues.push(`Difficulty-plan adjustment set ${label} is invalid.`);
		}
	}
	const basePlanSha256 = canonicalHash(plan);
	const shardRows = plan?.rows?.filter((row) => row?.shard === manifest.shardId);
	if (
		manifest.base?.planSha256 !== basePlanSha256 ||
		!Array.isArray(shardRows) ||
		shardRows.length === 0 ||
		manifest.base?.shardRowsSha256 !== canonicalHash(shardRows)
	) {
		issues.push('Difficulty-plan adjustment set base plan or shard binding is stale.');
	}
	if (
		!isRecord(priorCandidate) ||
		!Array.isArray(priorCandidate.challenges) ||
		!isRecord(candidate) ||
		!Array.isArray(candidate.challenges) ||
		manifest.priorCandidateSha256 !== canonicalHash(priorCandidate) ||
		manifest.candidateSha256 !== canonicalHash(candidate)
	) {
		issues.push('Difficulty-plan adjustment set prior/current candidate binding is invalid.');
		return failed(issues);
	}
	const expectedIds = shardRows.map((row) => row.id);
	if (
		canonicalHash(priorCandidate.challenges.map((entry) => entry?.definition?.id)) !==
			canonicalHash(expectedIds) ||
		canonicalHash(candidate.challenges.map((entry) => entry?.definition?.id)) !==
			canonicalHash(expectedIds)
	) {
		issues.push('Difficulty-plan adjustment set candidate membership or order is stale.');
	}
	if (
		manifest.sourceAttempt?.status !== 'failed' ||
		manifest.sourceAttempt?.attempt !== MAX_ATTEMPTS ||
		manifest.sourceAttempt?.selectionPolicy !==
			SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY ||
		!['direct-terminal-candidate', 'helper-approved-multipart-salvage'].includes(
			manifest.sourceAttempt?.sourceKind
		) ||
		manifest.attemptBudget?.selectedAttempt !== MAX_ATTEMPTS ||
		manifest.attemptBudget?.maxAttempts !== MAX_ATTEMPTS ||
		manifest.attemptBudget?.exhausted !== true ||
		manifest.attemptBudget?.selectionPolicy !==
			SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY ||
		!Array.isArray(manifest.attemptBudget?.attempts) ||
		manifest.attemptBudget.attempts.length !== MAX_ATTEMPTS ||
		manifest.attemptBudget.attempts.some(
			(attempt, index) =>
				attempt?.attempt !== index + 1 ||
				attempt?.status !== 'failed' ||
				(attempt.invalidated === true && attempt.attempt === MAX_ATTEMPTS)
		)
	) {
		issues.push('Difficulty-plan adjustment set requires the exact exhausted terminal attempt-04.');
	}
	if (
		manifest.firstReview?.summarySha256 !== manifest.repairSha256 ||
		!HASH.test(String(manifest.firstReview?.resultSha256 ?? '')) ||
		!HASH.test(String(manifest.firstReview?.assignmentSha256 ?? '')) ||
		!HASH.test(String(manifest.firstReview?.dispatchLedgerSha256 ?? '')) ||
		manifest.sourceAttempt?.sourceCandidateSha256 !== canonicalHash(candidate) ||
		!HASH.test(String(manifest.sourceAttempt?.runSummarySha256 ?? '')) ||
		!HASH.test(String(manifest.sourceAttempt?.sourceValidationSha256 ?? '')) ||
		!HASH.test(String(manifest.sourceAttempt?.runPolicySha256 ?? '')) ||
		!HASH.test(String(manifest.sourceAttempt?.exactFileBindingsSha256 ?? ''))
	) {
		issues.push(
			'Difficulty-plan adjustment set verifier or terminal evidence hashes are missing or stale.'
		);
	}
	if (
		!Array.isArray(manifest.adjustments) ||
		manifest.adjustments.length < 2 ||
		manifest.adjustmentCount !== manifest.adjustments.length ||
		manifest.adjustmentSetSha256 !== canonicalHash(manifest.adjustments) ||
		manifest.requestedAdjustmentSetSha256 !==
			canonicalHash(manifest.adjustments.map(adjustmentCore))
	) {
		issues.push('Difficulty-plan adjustment set membership or hashes are invalid.');
		return failed(issues);
	}
	const seenTargets = new Set();
	const priorById = new Map(
		priorCandidate.challenges.map((entry) => [entry?.definition?.id, entry])
	);
	const candidateById = new Map(
		candidate.challenges.map((entry) => [entry?.definition?.id, entry])
	);
	const effectivePlan = structuredClone(plan);
	for (const [index, adjustment] of manifest.adjustments.entries()) {
		const key = `${adjustment?.challengeId}:${adjustment?.field}`;
		const basePlanRow = plan?.rows?.[adjustment?.basePlanRowIndex];
		const priorTarget = priorById.get(adjustment?.challengeId);
		const candidateTarget = candidateById.get(adjustment?.challengeId);
		const difficultyIssues = adjustment?.review?.issues?.filter(
			(issue) => issue?.field === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD
		);
		if (seenTargets.has(key)) {
			issues.push(
				`${adjustment?.challengeId ?? `adjustment[${index}]`} has a duplicate or competing difficulty correction.`
			);
			continue;
		}
		seenTargets.add(key);
		if (
			adjustment?.field !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD ||
			!ALLOWED_DIFFICULTY_ADJUSTMENTS.has(`${adjustment?.from}:${adjustment?.to}`) ||
			basePlanRow?.id !== adjustment?.challengeId ||
			basePlanRow?.shard !== manifest.shardId ||
			basePlanRow?.difficulty !== adjustment?.from ||
			adjustment.basePlanRowSha256 !== canonicalHash(basePlanRow) ||
			priorTarget?.definition?.difficulty !== adjustment?.from ||
			candidateTarget?.definition?.difficulty !== adjustment?.to ||
			adjustment.priorTargetSha256 !== canonicalHash(priorTarget) ||
			adjustment.candidateTargetSha256 !== canonicalHash(candidateTarget)
		) {
			issues.push(`Difficulty-plan adjustment set adjustment[${index}] target is stale or wrong.`);
			continue;
		}
		const reviewValidation = validateIndependentContentReviewRow(adjustment.review);
		if (
			reviewValidation.status !== 'passed' ||
			adjustment.review?.id !== adjustment.challengeId ||
			adjustment.review?.accepted !== false ||
			adjustment.review?.difficultyCalibrated !== false ||
			adjustment.reviewSha256 !== canonicalHash(adjustment.review) ||
			difficultyIssues?.length !== 1 ||
			adjustment.issueSha256 !== canonicalHash(adjustment.issue) ||
			canonicalHash(difficultyIssues[0]) !== canonicalHash(adjustment.issue) ||
			!reviewExplicitlyAllowsDifficultyAdjustment(adjustment.issue, adjustment.from, adjustment.to)
		) {
			issues.push(
				`Difficulty-plan adjustment set adjustment[${index}] verifier evidence is invalid.`
			);
		}
		const withoutAdjustment = structuredClone(candidateTarget);
		withoutAdjustment.definition.difficulty = adjustment.from;
		if (adjustment.candidateWithoutAdjustmentSha256 !== canonicalHash(withoutAdjustment)) {
			issues.push(
				`Difficulty-plan adjustment set adjustment[${index}] inverse candidate binding is invalid.`
			);
		}
		effectivePlan.rows[adjustment.basePlanRowIndex].difficulty = adjustment.to;
		if (
			adjustment.effectivePlanRowSha256 !==
			canonicalHash(effectivePlan.rows[adjustment.basePlanRowIndex])
		) {
			issues.push(`Difficulty-plan adjustment set adjustment[${index}] effective row is stale.`);
		}
	}
	const actualAdjustments = shardRows
		.map((row) => {
			const target = candidateById.get(row.id);
			return target?.definition?.difficulty === row.difficulty
				? null
				: {
						challengeId: row.id,
						field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
						from: row.difficulty,
						to: target?.definition?.difficulty
					};
		})
		.filter(Boolean);
	if (
		canonicalHash(actualAdjustments) !== canonicalHash(manifest.adjustments.map(adjustmentCore))
	) {
		issues.push(
			'Difficulty-plan adjustment set does not exactly cover the terminal candidate plan differences.'
		);
	}
	const effectiveShardRows = effectivePlan.rows.filter((row) => row?.shard === manifest.shardId);
	if (
		manifest.effective?.planSha256 !== canonicalHash(effectivePlan) ||
		manifest.effective?.shardRowsSha256 !== canonicalHash(effectiveShardRows)
	) {
		issues.push('Difficulty-plan adjustment set combined effective plan is stale.');
	}
	if (
		!Array.isArray(manifest.rowReviewBindings) ||
		manifest.rowReviewBindings.length !== shardRows.length ||
		manifest.rowReviewBindingsSha256 !== canonicalHash(manifest.rowReviewBindings)
	) {
		issues.push('Difficulty-plan adjustment set row review bindings are incomplete.');
	} else {
		for (const [index, binding] of manifest.rowReviewBindings.entries()) {
			const prior = priorCandidate.challenges[index];
			const current = candidate.challenges[index];
			if (
				binding?.challengeId !== shardRows[index].id ||
				typeof binding?.accepted !== 'boolean' ||
				!HASH.test(String(binding?.reviewSha256 ?? '')) ||
				binding.priorCandidateSha256 !== canonicalHash(prior) ||
				binding.candidateSha256 !== canonicalHash(current) ||
				(binding.accepted === true && binding.priorCandidateSha256 !== binding.candidateSha256)
			) {
				issues.push(
					`Difficulty-plan adjustment set rowReviewBindings[${index}] is stale or permits accepted-row drift.`
				);
			}
		}
	}
	return issues.length
		? failed(issues)
		: {
				status: 'passed',
				issues: [],
				effectivePlan,
				adjustments: manifest.adjustments.map(adjustmentCore)
			};
}

export function projectScienceChallengeDifficultyPlanAdjustments(plan, recoveries) {
	const issues = [];
	const effective = structuredClone(plan);
	const seen = new Set();
	for (const recovery of recoveries ?? []) {
		const manifest = recovery?.manifest ?? recovery;
		const integrity = validateScienceChallengeDifficultyPlanAdjustmentManifest({
			manifest,
			plan,
			priorCandidate: recovery?.priorCandidate,
			candidate: recovery?.candidate
		});
		if (integrity.status !== 'passed') {
			issues.push(...integrity.issues);
			continue;
		}
		const key = `${manifest.challengeId}:${manifest.field}`;
		if (seen.has(key)) {
			issues.push(`${manifest.challengeId} has ambiguous duplicate difficulty adjustments.`);
			continue;
		}
		seen.add(key);
		const index = effective.rows.findIndex((row) => row.id === manifest.challengeId);
		if (
			index !== manifest.base.planRowIndex ||
			canonicalHash(plan.rows[index]) !== manifest.base.planRowSha256
		) {
			issues.push(`${manifest.challengeId} difficulty adjustment base row is stale.`);
			continue;
		}
		effective.rows[index].difficulty = manifest.adjustment.to;
		if (canonicalHash(effective.rows[index]) !== manifest.effective.planRowSha256) {
			issues.push(`${manifest.challengeId} effective row differs from the adjustment manifest.`);
		}
	}
	return issues.length
		? failed(issues)
		: { status: 'passed', issues: [], plan: effective, planSha256: canonicalHash(effective) };
}

function validateRequestedDifficultyAdjustments(value) {
	const issues = [];
	if (!Array.isArray(value) || value.length < 2) {
		return failed(
			'Difficulty-plan adjustment set requires at least two explicit requested corrections.'
		);
	}
	const seen = new Set();
	for (const [index, adjustment] of value.entries()) {
		const keys = Object.keys(adjustment ?? {}).sort();
		if (
			!isRecord(adjustment) ||
			canonicalHash(keys) !== canonicalHash(['challengeId', 'field', 'from', 'to'].sort()) ||
			!nonEmpty(adjustment.challengeId) ||
			adjustment.field !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD ||
			!ALLOWED_DIFFICULTY_ADJUSTMENTS.has(`${adjustment.from}:${adjustment.to}`)
		) {
			issues.push(`requestedAdjustments[${index}] is invalid.`);
			continue;
		}
		const key = `${adjustment.challengeId}:${adjustment.field}`;
		if (seen.has(key)) {
			issues.push(`${adjustment.challengeId} has a duplicate or competing requested correction.`);
		}
		seen.add(key);
	}
	return issues.length ? failed(issues) : { status: 'passed', issues: [] };
}

function adjustmentCore(value) {
	return {
		challengeId: value.challengeId,
		field: value.field,
		from: value.from,
		to: value.to
	};
}

function validateDifficultyAdjustmentSetReviewEnvelope({
	firstReviewSummary,
	firstReviewResult,
	firstAssignment,
	dispatchLedger,
	shardId,
	priorById,
	plan,
	curriculumEvidenceSha256
}) {
	const issues = [];
	const reviews = Array.isArray(firstReviewSummary?.reviews) ? firstReviewSummary.reviews : [];
	const acceptedCount = reviews.filter((review) => review?.accepted === true).length;
	const rejectedCount = reviews.filter((review) => review?.accepted === false).length;
	if (
		firstReviewSummary?.schemaVersion !== 'science-challenge-independent-verification-summary/v1' ||
		firstReviewSummary?.reviewCount !== reviews.length ||
		firstReviewSummary?.acceptedCount !== acceptedCount ||
		firstReviewSummary?.rejectedCount !== rejectedCount ||
		firstReviewSummary?.planId !== plan.planId ||
		firstReviewSummary?.planSha256 !== canonicalHash(plan) ||
		firstReviewSummary?.curriculumEvidenceSha256 !== curriculumEvidenceSha256 ||
		!Array.isArray(firstReviewSummary?.issues) ||
		firstReviewSummary.issues.length !== 0 ||
		reviews.length !== plan.rows.length ||
		new Set(reviews.map((review) => review?.id)).size !== plan.rows.length ||
		plan.rows.some((row, index) => reviews[index]?.id !== row.id)
	) {
		issues.push(
			'Difficulty-plan adjustment set first review summary membership, counts or frozen evidence bindings are invalid.'
		);
	}
	const shardIds = new Set(
		(firstAssignment?.items ?? []).map((item) => item?.candidate?.definition?.id).filter(Boolean)
	);
	if (
		firstAssignment?.schemaVersion !== 'science-challenge-verification-assignment/v2' ||
		firstAssignment?.assignmentId !== shardId ||
		firstAssignment?.planId !== plan.planId ||
		firstAssignment?.planSha256 !== canonicalHash(plan) ||
		firstAssignment?.curriculumEvidenceSha256 !== curriculumEvidenceSha256 ||
		firstAssignment?.evidenceSha256 !==
			canonicalHash(
				Object.fromEntries(
					Object.entries(firstAssignment ?? {}).filter(([key]) => key !== 'evidenceSha256')
				)
			)
	) {
		issues.push(
			'Difficulty-plan adjustment set first assignment is stale or targets another shard.'
		);
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
			'Difficulty-plan adjustment set assignment item order, plan rows or prior candidates are invalid.'
		);
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
			canonicalHash(reviews.filter((review) => shardIds.has(review.id))) ||
		!canonicalReviewTimestamp(firstReviewResult?.verifier?.reviewedAt)
	) {
		issues.push(
			'Difficulty-plan adjustment set raw verifier result is missing, reordered or stale.'
		);
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
		issues.push(
			'Difficulty-plan adjustment set does not bind the canonical empty-context verifier.'
		);
	}
	return {
		issues,
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

function selectTerminalAttemptForAdjustmentSet({
	attempts,
	rows,
	reviews,
	priorCandidate,
	basePlan,
	requestedAdjustments,
	validateBatchCandidate
}) {
	const issues = [];
	if (!Array.isArray(attempts) || attempts.length !== MAX_ATTEMPTS) {
		return {
			issues: ['Difficulty-plan adjustment set requires exactly four immutable exhausted attempts.']
		};
	}
	const ordered = [...attempts].sort((left, right) => left.attempt - right.attempt);
	if (ordered.some((attempt, index) => attempt?.attempt !== index + 1)) {
		issues.push(
			'Difficulty-plan adjustment set attempts must be exact, unique and contiguous from 1 through 4.'
		);
	}
	if (ordered.some((attempt) => attempt?.attempt > MAX_ATTEMPTS || attempt?.status !== 'failed')) {
		issues.push(
			'Difficulty-plan adjustment set requires four failed attempts and forbids attempt 5.'
		);
	}
	if (issues.length) return { issues };
	const terminal = ordered[MAX_ATTEMPTS - 1];
	if (terminal.invalidated === true) {
		return {
			issues: [
				'Difficulty-plan adjustment set terminal attempt-04 is invalidated and cannot be selected.'
			]
		};
	}
	if (
		(terminal.sourceKind !== undefined && terminal.sourceKind !== 'direct-terminal-candidate') ||
		terminal.runSummary?.status !== 'passed' ||
		terminal.runPolicy?.status !== 'passed' ||
		(terminal.runPolicy?.issues?.length ?? 0) !== 0 ||
		terminal.sourceValidation?.status !== 'failed' ||
		terminal.sourceValidation?.candidateSha256 !== canonicalHash(terminal.candidate) ||
		terminal.sourceValidation?.runSummarySha256 !== canonicalHash(terminal.runSummary) ||
		!Array.isArray(terminal.sourceValidation?.verificationRepairCohortIssues) ||
		terminal.sourceValidation.verificationRepairCohortIssues.length !== 0
	) {
		return {
			issues: [
				'Difficulty-plan adjustment set terminal attempt-04 is invalid or not bound to its direct model output.'
			]
		};
	}
	const candidateById = new Map(
		(terminal.candidate?.challenges ?? []).map((entry) => [entry?.definition?.id, entry])
	);
	const expectedIds = rows.map((row) => row.id);
	if (
		canonicalHash(terminal.candidate?.challenges?.map((entry) => entry?.definition?.id)) !==
		canonicalHash(expectedIds)
	) {
		return {
			issues: ['Difficulty-plan adjustment set terminal candidate membership or order is stale.']
		};
	}
	const actualAdjustments = rows
		.map((row) => {
			const candidate = candidateById.get(row.id);
			return candidate?.definition?.difficulty === row.difficulty
				? null
				: {
						challengeId: row.id,
						field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
						from: row.difficulty,
						to: candidate?.definition?.difficulty
					};
		})
		.filter(Boolean);
	if (canonicalHash(actualAdjustments) !== canonicalHash(requestedAdjustments)) {
		return {
			issues: [
				'Difficulty-plan adjustment set terminal candidate plan differences do not exactly match the requested corrections.'
			]
		};
	}
	const candidateSha256 = canonicalHash(terminal.candidate);
	const repairValidation = validateVerificationRepairCandidate({
		candidate: structuredClone(terminal.candidate),
		priorCandidate: structuredClone(priorCandidate),
		rows: structuredClone(rows),
		reviews: structuredClone(reviews)
	});
	if (
		repairValidation.status !== 'passed' ||
		(repairValidation.issues?.length ?? 0) !== 0 ||
		canonicalHash(terminal.candidate) !== candidateSha256
	) {
		return {
			issues: [
				'Difficulty-plan adjustment set terminal attempt-04 violates accepted/rejected row preservation.',
				...(repairValidation.issues ?? [])
			]
		};
	}
	return {
		issues,
		terminal,
		candidate: terminal.candidate,
		repairValidation,
		binding: {
			attempt: MAX_ATTEMPTS,
			status: 'failed',
			sourceKind: terminal.sourceKind ?? 'direct-terminal-candidate',
			runStatus: terminal.runSummary.status,
			selectionPolicy: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY,
			runSummarySha256: canonicalHash(terminal.runSummary),
			sourceValidationSha256: canonicalHash(terminal.sourceValidation),
			sourceCandidateSha256: canonicalHash(terminal.candidate),
			runPolicySha256: canonicalHash(terminal.runPolicy),
			exactFileBindingsSha256: canonicalHash(terminal.fileBindings),
			fileBindings: terminal.fileBindings
		},
		attemptBudget: {
			maxAttempts: MAX_ATTEMPTS,
			exhausted: true,
			selectionPolicy: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY,
			selectedAttempt: MAX_ATTEMPTS,
			attempts: ordered.map((attempt) => ({
				attempt: attempt.attempt,
				status: 'failed',
				invalidated: attempt.invalidated === true,
				runSummarySha256:
					attempt.runSummary === undefined ? null : canonicalHash(attempt.runSummary),
				validationSha256:
					attempt.sourceValidation === undefined ? null : canonicalHash(attempt.sourceValidation),
				candidateSha256: attempt.candidate === undefined ? null : canonicalHash(attempt.candidate),
				fileBindingsSha256: canonicalHash(attempt.fileBindings)
			}))
		}
	};
}

function selectVerifierDirectedDifficultyReview({
	firstReviewSummary,
	firstReviewResult,
	firstAssignment,
	dispatchLedger,
	shardId,
	priorById,
	plan,
	curriculumEvidenceSha256
}) {
	const issues = [];
	const reviews = Array.isArray(firstReviewSummary?.reviews) ? firstReviewSummary.reviews : [];
	const acceptedCount = reviews.filter((review) => review?.accepted === true).length;
	const rejectedCount = reviews.filter((review) => review?.accepted === false).length;
	if (
		firstReviewSummary?.schemaVersion !== 'science-challenge-independent-verification-summary/v1' ||
		firstReviewSummary?.reviewCount !== reviews.length ||
		firstReviewSummary?.acceptedCount !== acceptedCount ||
		firstReviewSummary?.rejectedCount !== rejectedCount ||
		firstReviewSummary?.planId !== plan.planId ||
		firstReviewSummary?.planSha256 !== canonicalHash(plan) ||
		firstReviewSummary?.curriculumEvidenceSha256 !== curriculumEvidenceSha256 ||
		!Array.isArray(firstReviewSummary?.issues) ||
		firstReviewSummary.issues.length !== 0 ||
		reviews.length !== plan.rows.length ||
		new Set(reviews.map((review) => review?.id)).size !== plan.rows.length ||
		plan.rows.some((row, index) => reviews[index]?.id !== row.id)
	) {
		issues.push('First review summary membership, counts or frozen evidence bindings are invalid.');
	}
	const shardIds = new Set(
		(firstAssignment?.items ?? []).map((item) => item?.candidate?.definition?.id).filter(Boolean)
	);
	const directed = reviews.filter(
		(review) =>
			shardIds.has(review?.id) &&
			Array.isArray(review?.issues) &&
			review.issues.length === 1 &&
			review.issues[0]?.field === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD
	);
	if (directed.length !== 1) {
		issues.push(
			`Expected exactly one verifier-directed difficulty adjustment; found ${directed.length}.`
		);
		return { issues };
	}
	const review = directed[0];
	issues.push(
		...validateIndependentContentReviewRow(review).issues.map((issue) => `${review.id}: ${issue}`)
	);
	if (
		review.accepted !== false ||
		review.difficultyCalibrated !== false ||
		SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.filter((field) => field !== 'difficultyCalibrated').some(
			(field) => review[field] !== true
		) ||
		!Array.isArray(review.issues) ||
		review.issues.length !== 1 ||
		review.issues[0]?.field !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD
	) {
		issues.push(`${review.id} first review must fail only difficulty calibration.`);
	}
	if (
		firstAssignment?.schemaVersion !== 'science-challenge-verification-assignment/v2' ||
		firstAssignment?.assignmentId !== shardId ||
		firstAssignment?.planId !== plan.planId ||
		firstAssignment?.planSha256 !== canonicalHash(plan) ||
		firstAssignment?.curriculumEvidenceSha256 !== curriculumEvidenceSha256 ||
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
			'First assignment item order, plan rows, or complete prior shard candidates are invalid.'
		);
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

function selectTerminalAttempt({
	attempts,
	challengeId,
	priorTarget,
	rows,
	reviews,
	priorCandidate,
	basePlan,
	basePlanRow,
	validateBatchCandidate
}) {
	const issues = [];
	if (!Array.isArray(attempts) || attempts.length !== MAX_ATTEMPTS) {
		return {
			issues: ['Difficulty-plan adjustment requires exactly four immutable exhausted attempts.']
		};
	}
	const ordered = [...attempts].sort((left, right) => left.attempt - right.attempt);
	if (ordered.some((attempt, index) => attempt?.attempt !== index + 1)) {
		issues.push('Repair attempts must be exact, unique and contiguous from 1 through 4.');
	}
	if (ordered.some((attempt) => attempt?.attempt > MAX_ATTEMPTS || attempt?.status !== 'failed')) {
		issues.push('Difficulty-plan adjustment requires four failed attempts and forbids attempt 5.');
	}
	if (issues.length) return { issues };
	const terminal = ordered[MAX_ATTEMPTS - 1];
	if (terminal.invalidated === true) {
		return {
			issues: ['Terminal attempt-04 is invalidated and cannot be selected.']
		};
	}
	const helperRecovery =
		terminal.sourceKind === 'helper-approved-multipart-salvage'
			? validateHelperApprovedTerminalRecovery(terminal, { challengeId, basePlanRow })
			: null;
	if (helperRecovery?.status === 'failed') return { issues: helperRecovery.issues };
	if (
		helperRecovery === null &&
		terminal.sourceKind !== undefined &&
		terminal.sourceKind !== 'direct-terminal-candidate'
	) {
		return { issues: ['Terminal attempt-04 source kind is unsupported.'] };
	}
	if (
		helperRecovery === null &&
		(terminal.runSummary?.status !== 'passed' ||
			terminal.runPolicy?.status !== 'passed' ||
			(terminal.runPolicy?.issues?.length ?? 0) !== 0 ||
			terminal.sourceValidation?.status !== 'failed' ||
			terminal.sourceValidation?.candidateSha256 !== canonicalHash(terminal.candidate) ||
			terminal.sourceValidation?.runSummarySha256 !== canonicalHash(terminal.runSummary) ||
			!Array.isArray(terminal.sourceValidation?.verificationRepairCohortIssues) ||
			terminal.sourceValidation.verificationRepairCohortIssues.length !== 0)
	) {
		return {
			issues: ['Terminal attempt-04 is invalid or not bound to its direct model output.']
		};
	}
	const candidateTarget = terminal.candidate?.challenges?.find(
		(challenge) => challenge?.definition?.id === challengeId
	);
	if (
		!candidateTarget ||
		candidateTarget.definition?.difficulty === basePlanRow.difficulty ||
		!onlyTargetDifficultyDiffers({
			priorCandidate,
			candidate: terminal.candidate,
			challengeId,
			from: basePlanRow.difficulty,
			to: candidateTarget.definition?.difficulty
		})
	) {
		return {
			issues: [
				'Complete terminal attempt-04 does not contain exactly one target difficulty adjustment.'
			]
		};
	}
	const candidateSha256 = canonicalHash(terminal.candidate);
	const repairValidation = validateVerificationRepairCandidate({
		candidate: structuredClone(terminal.candidate),
		priorCandidate: structuredClone(priorCandidate),
		rows: structuredClone(rows),
		reviews: structuredClone(reviews)
	});
	if (
		repairValidation.status !== 'passed' ||
		(repairValidation.issues?.length ?? 0) !== 0 ||
		canonicalHash(terminal.candidate) !== candidateSha256
	) {
		return {
			issues: [
				'Terminal attempt-04 violates accepted/rejected row preservation.',
				...(repairValidation.issues ?? [])
			]
		};
	}
	return {
		issues,
		terminal,
		candidate: terminal.candidate,
		candidateTarget,
		repairValidation,
		binding: {
			attempt: MAX_ATTEMPTS,
			status: 'failed',
			sourceKind:
				terminal.sourceKind ??
				(helperRecovery ? 'helper-approved-multipart-salvage' : 'direct-terminal-candidate'),
			runStatus: terminal.runSummary?.status ?? terminal.helperSalvage?.sourceRunStatus,
			selectionPolicy: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY,
			runSummarySha256:
				terminal.runSummary === undefined ? null : canonicalHash(terminal.runSummary),
			sourceValidationSha256:
				terminal.sourceValidation === undefined ? null : canonicalHash(terminal.sourceValidation),
			sourceCandidateSha256: canonicalHash(terminal.candidate),
			targetCandidateSha256: canonicalHash(candidateTarget),
			runPolicySha256: terminal.runPolicy === undefined ? null : canonicalHash(terminal.runPolicy),
			...(helperRecovery
				? {
						helperSalvageManifestSha256: canonicalHash(terminal.helperSalvage.manifest),
						helperSalvageCandidateSha256: canonicalHash(terminal.helperSalvage.candidate),
						helperSalvageCorrectionsSha256: canonicalHash(
							terminal.helperSalvage.manifest.salvage.corrections
						),
						helperTargetCorrectionSha256: canonicalHash(helperRecovery.targetCorrection)
					}
				: {}),
			exactFileBindingsSha256: canonicalHash(terminal.fileBindings),
			fileBindings: terminal.fileBindings
		},
		attemptBudget: {
			maxAttempts: MAX_ATTEMPTS,
			exhausted: true,
			selectionPolicy: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY,
			selectedAttempt: MAX_ATTEMPTS,
			attempts: ordered.map((attempt) => ({
				attempt: attempt.attempt,
				status: 'failed',
				invalidated: attempt.invalidated === true,
				runSummarySha256:
					attempt.runSummary === undefined ? null : canonicalHash(attempt.runSummary),
				validationSha256:
					attempt.sourceValidation === undefined ? null : canonicalHash(attempt.sourceValidation),
				candidateSha256: attempt.candidate === undefined ? null : canonicalHash(attempt.candidate),
				fileBindingsSha256: canonicalHash(attempt.fileBindings)
			}))
		}
	};
}

function reviewExplicitlyAllowsDifficultyAdjustment(issue, from, to) {
	if (!isRecord(issue) || issue.field !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD) {
		return false;
	}
	const statement = `${issue.evidence ?? ''} ${issue.repair ?? ''}`.toLowerCase();
	return (
		new RegExp(`\\b${escapeRegExp(from)}\\b`, 'u').test(statement) &&
		new RegExp(`\\b${escapeRegExp(to)}\\b`, 'u').test(statement)
	);
}

function validateHelperApprovedTerminalRecovery(terminal, { challengeId, basePlanRow }) {
	const helper = terminal.helperSalvage;
	const manifest = helper?.manifest;
	const helperCandidate = helper?.candidate;
	const corrections = manifest?.salvage?.corrections;
	const targetIndex = helperCandidate?.challenges?.findIndex(
		(entry) => entry?.definition?.id === challengeId
	);
	const targetCorrection = corrections?.find(
		(correction) =>
			correction?.kind === 'definition.difficulty' &&
			correction?.absoluteRowIndex === targetIndex &&
			correction?.from === terminal.candidate?.challenges?.[targetIndex]?.definition?.difficulty &&
			correction?.to === basePlanRow.difficulty
	);
	const reconstructed = structuredClone(helperCandidate);
	if (targetIndex >= 0 && targetCorrection) {
		reconstructed.challenges[targetIndex].definition.difficulty = targetCorrection.from;
	}
	if (
		manifest?.schemaVersion !== 'science-challenge-multipart-plan-salvage-evidence/v2' ||
		manifest?.sourceAttempt?.attempt !== MAX_ATTEMPTS ||
		manifest?.sourceAttempt?.status !== 'failed' ||
		manifest?.candidateSha256 !== canonicalHash(helperCandidate) ||
		manifest?.salvage?.candidateSha256 !== canonicalHash(helperCandidate) ||
		!Array.isArray(corrections) ||
		!targetCorrection ||
		canonicalHash(reconstructed) !== canonicalHash(terminal.candidate)
	) {
		return failed(
			'Terminal attempt-04 helper salvage does not bind the exact target difficulty inversion.'
		);
	}
	return { status: 'passed', issues: [], targetCorrection };
}

function onlyTargetDifficultyDiffers({ priorCandidate, candidate, challengeId, from, to }) {
	if (
		!Array.isArray(priorCandidate?.challenges) ||
		!Array.isArray(candidate?.challenges) ||
		priorCandidate.challenges.length !== candidate.challenges.length
	) {
		return false;
	}
	const priorTarget = priorCandidate.challenges.find(
		(challenge) => challenge?.definition?.id === challengeId
	);
	const target = structuredClone(
		candidate.challenges.find((challenge) => challenge?.definition?.id === challengeId)
	);
	if (!priorTarget || !target || target.definition?.difficulty !== to) {
		return false;
	}
	target.definition.difficulty = from;
	return canonicalHash(target) === canonicalHash(priorTarget);
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

function deferredCollectionValidation({ candidate, effectivePlan, shardId, recoveryCount }) {
	return {
		status: 'deferred',
		issues: [],
		policy: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_COLLECTION_POLICY,
		shardId,
		recoveryCount,
		candidateSha256: canonicalHash(candidate),
		effectivePlanSha256: canonicalHash(effectivePlan)
	};
}

function uniqueChallengesById(challenges, issues, label) {
	const result = new Map();
	for (const challenge of challenges ?? []) {
		const id = challenge?.definition?.id;
		if (!nonEmpty(id) || result.has(id)) {
			issues.push(`${label} contains a missing or duplicate challenge id.`);
		} else {
			result.set(id, challenge);
		}
	}
	return result;
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function canonicalReviewTimestamp(value) {
	if (!nonEmpty(value) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) {
		return false;
	}
	const canonical = new Date(value).toISOString();
	return canonical === value || canonical.replace('.000Z', 'Z') === value;
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
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
