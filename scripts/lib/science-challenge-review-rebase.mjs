import { SCIENCE_CHALLENGE_BATCH_SCHEMA, canonicalHash } from './science-challenge-release.mjs';

export const SCIENCE_CHALLENGE_REVIEW_REBASE_SPEC_SCHEMA =
	'science-challenge-review-rebase-spec/v1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_MANIFEST_SCHEMA =
	'science-challenge-review-rebase-manifest/v1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_VALIDATION_SCHEMA =
	'science-challenge-review-rebase-validation/v1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_DISPOSITION =
	'deterministic-parent-bound-review-rebase';

const HASH = /^[a-f0-9]{64}$/u;
const PLAN_FIELDS = new Set([
	'difficulty',
	'taskShape',
	'calibrationQuestionId',
	'calibrationQuestionSha256'
]);
const CANDIDATE_FIELDS = new Set([
	'definition.sourceQuestionId',
	'definition.marks',
	'definition.difficulty',
	'grounding.calibrationQuestionId',
	'grounding.calibrationQuestionSha256'
]);

/**
 * Build a deliberately review-pending cohort from immutable parent candidates.
 *
 * This is not an acceptance or release gate. It exists only to move an exhausted,
 * hash-bound parent run into a fresh full-cohort independent review without
 * pretending that provisional source metadata or known collection collisions passed.
 */
export function buildScienceChallengeReviewRebase({
	basePlan,
	sourceSnapshot,
	curriculumEvidence,
	parentVerificationSummary,
	parentRepairSummary,
	parentCandidateById,
	selections,
	spec,
	validatePlan,
	validateBatch,
	validateCollection
}) {
	const issues = [];
	if (!isRecord(basePlan) || !Array.isArray(basePlan.rows)) {
		return failed('Review rebase requires an exact base plan.');
	}
	if (!isRecord(sourceSnapshot) || !Array.isArray(sourceSnapshot.questions)) {
		return failed('Review rebase requires an exact source snapshot.');
	}
	if (!isRecord(curriculumEvidence) || !Array.isArray(curriculumEvidence.components)) {
		return failed('Review rebase requires exact curriculum evidence.');
	}
	if (!isRecord(parentVerificationSummary) || !Array.isArray(parentVerificationSummary.reviews)) {
		return failed('Review rebase requires a complete parent verification summary.');
	}
	if (!isRecord(parentRepairSummary) || !Array.isArray(parentRepairSummary.results)) {
		return failed('Review rebase requires a complete parent repair summary.');
	}
	if (!(parentCandidateById instanceof Map)) {
		return failed('Review rebase requires verifier-bound parent candidates.');
	}
	if (!Array.isArray(selections) || selections.length === 0) {
		return failed('Review rebase requires candidate selections.');
	}
	for (const [value, label] of [
		[validatePlan, 'plan validator'],
		[validateBatch, 'batch validator'],
		[validateCollection, 'collection validator']
	]) {
		if (typeof value !== 'function') issues.push(`Review rebase requires a ${label}.`);
	}
	const specValidation = validateReviewRebaseSpec(spec);
	issues.push(...specValidation.issues);
	if (issues.length) return failed(issues);

	const basePlanSha256 = canonicalHash(basePlan);
	const sourceSnapshotSha256 = canonicalHash(sourceSnapshot);
	const curriculumEvidenceSha256 = canonicalHash(curriculumEvidence);
	const parentVerificationSha256 = canonicalHash(parentVerificationSummary);
	const parentRepairSha256 = canonicalHash(parentRepairSummary);
	const parentIdentity = parentRepairSummary.verificationRepairExecutionIdentity;
	const expectedParent = {
		planSha256: basePlanSha256,
		sourceSnapshotSha256,
		curriculumEvidenceSha256,
		verificationSha256: parentVerificationSha256,
		repairSha256: parentRepairSha256,
		candidateSetSha256: parentVerificationSummary.candidateSetSha256,
		objectiveId: parentIdentity?.objectiveId,
		executionId: parentIdentity?.executionId
	};
	if (canonicalHash(spec.parent) !== canonicalHash(expectedParent)) {
		issues.push('Review rebase spec does not bind the exact parent evidence set.');
	}
	if (
		parentVerificationSummary.planSha256 !== basePlanSha256 ||
		parentRepairSummary.planSha256 !== basePlanSha256
	) {
		issues.push('Parent verification and repair summaries must bind the exact base plan.');
	}
	if (
		parentVerificationSummary.sourceSnapshotSha256 !== sourceSnapshotSha256 ||
		parentRepairSummary.sourceSnapshotSha256 !== sourceSnapshotSha256 ||
		parentVerificationSummary.curriculumEvidenceSha256 !== curriculumEvidenceSha256 ||
		parentRepairSummary.curriculumEvidenceSha256 !== curriculumEvidenceSha256
	) {
		issues.push('Parent summaries bind different source or curriculum evidence.');
	}
	if (
		parentVerificationSummary.status !== 'failed' ||
		parentVerificationSummary.reviewCount !== basePlan.rows.length ||
		parentVerificationSummary.reviews.length !== basePlan.rows.length
	) {
		issues.push('Parent verification must be a complete failed full-cohort review.');
	}
	if (parentRepairSummary.status !== 'failed') {
		issues.push('Review rebase is only available after a failed parent repair closure.');
	}
	if (
		parentRepairSummary.verificationRepairSha256 !== parentVerificationSha256 ||
		parentIdentity?.verificationSha256 !== parentVerificationSha256 ||
		parentIdentity?.planSha256 !== basePlanSha256 ||
		parentIdentity?.priorCandidateSetSha256 !== parentVerificationSummary.candidateSetSha256 ||
		!HASH.test(String(parentIdentity?.objectiveId ?? '')) ||
		!HASH.test(String(parentIdentity?.executionId ?? ''))
	) {
		issues.push('Parent repair identity is incomplete or differs from the parent review.');
	}
	const reviewById = uniqueBy(
		parentVerificationSummary.reviews,
		(review) => review?.id,
		issues,
		'parent review'
	);
	for (const row of basePlan.rows) {
		if (!reviewById.has(row.id) || !parentCandidateById.has(row.id)) {
			issues.push(`${row.id} is missing parent review or candidate evidence.`);
		}
	}
	const parentOrderedCandidates = basePlan.rows.map((row) => parentCandidateById.get(row.id));
	if (
		parentOrderedCandidates.some((entry) => !isRecord(entry)) ||
		canonicalHash(parentOrderedCandidates) !== parentVerificationSummary.candidateSetSha256
	) {
		issues.push('Verifier-bound parent candidates differ from the reviewed candidate set.');
	}
	if (issues.length) return failed(issues);

	const planMutationResult = applyPlanMutations({
		basePlan,
		mutations: spec.planMutations,
		reviewById,
		sourceSnapshot,
		approval: spec.approval
	});
	if (planMutationResult.status !== 'passed') return planMutationResult;
	const plan = planMutationResult.plan;
	const planSha256 = canonicalHash(plan);
	const planValidation = validatePlan(structuredClone(plan));
	if (planValidation?.status !== 'passed' || (planValidation?.issues?.length ?? 0) !== 0) {
		return failed([
			'Rebased plan failed deterministic validation.',
			...(planValidation?.issues ?? [])
		]);
	}

	const shardIds = [...new Set(plan.rows.map((row) => row.shard))].sort();
	const selectionByShard = uniqueBy(
		selections,
		(selection) => selection?.shardId,
		issues,
		'candidate selection'
	);
	if (
		selectionByShard.size !== shardIds.length ||
		shardIds.some((shardId) => !selectionByShard.has(shardId))
	) {
		issues.push('Review rebase requires exactly one candidate selection for every shard.');
	}
	const candidateMutationByShard = groupCandidateMutations({
		mutations: spec.candidateMutations,
		rowById: new Map(plan.rows.map((row) => [row.id, row])),
		reviewById,
		approval: spec.approval,
		issues
	});
	if (issues.length) return failed(issues);

	const candidateBatches = new Map();
	const selectionSourceBindings = [];
	const outputValidations = new Map();
	const candidateById = new Map();
	for (const shardId of shardIds) {
		const selection = selectionByShard.get(shardId);
		const shardRows = plan.rows.filter((row) => row.shard === shardId);
		const sourceCandidate = structuredClone(selection?.candidate);
		if (
			!isRecord(sourceCandidate) ||
			sourceCandidate.schemaVersion !== SCIENCE_CHALLENGE_BATCH_SCHEMA ||
			!Array.isArray(sourceCandidate.challenges)
		) {
			issues.push(`${shardId} selection has no valid source candidate batch.`);
			continue;
		}
		if (
			!nonEmpty(selection.candidatePath) ||
			!nonEmpty(selection.validationPath) ||
			!nonEmpty(selection.disposition) ||
			!HASH.test(String(selection.candidateSha256 ?? '')) ||
			!HASH.test(String(selection.validationSha256 ?? '')) ||
			canonicalHash(sourceCandidate) !== selection.candidateSha256 ||
			!isRecord(selection.validation) ||
			canonicalHash(selection.validation) !== selection.validationSha256
		) {
			issues.push(`${shardId} selection source paths or hashes are stale.`);
			continue;
		}
		const sourceIds = sourceCandidate.challenges.map((entry) => entry?.definition?.id);
		const expectedIds = shardRows.map((row) => row.id);
		if (canonicalHash(sourceIds) !== canonicalHash(expectedIds)) {
			issues.push(`${shardId} selection membership differs from the rebased plan.`);
			continue;
		}
		const rowOverrideResult = applyRowOverrides({
			candidate: sourceCandidate,
			overrides: selection.rowOverrides ?? [],
			expectedIds,
			reviewById
		});
		if (rowOverrideResult.status !== 'passed') {
			issues.push(...rowOverrideResult.issues.map((issue) => `${shardId}: ${issue}`));
			continue;
		}
		const mutations = candidateMutationByShard.get(shardId) ?? [];
		const candidateResult = applyCandidateMutations({
			candidate: rowOverrideResult.candidate,
			mutations,
			reviewById
		});
		if (candidateResult.status !== 'passed') {
			issues.push(...candidateResult.issues.map((issue) => `${shardId}: ${issue}`));
			continue;
		}
		const candidate = candidateResult.candidate;
		for (const entry of candidate.challenges) {
			const id = entry.definition.id;
			const review = reviewById.get(id);
			const parent = parentCandidateById.get(id);
			if (review.accepted === true && canonicalHash(entry) !== canonicalHash(parent)) {
				issues.push(`${id}: independently accepted parent content changed during rebase.`);
			}
		}
		const batchValidation = validateBatch(
			structuredClone(candidate),
			structuredClone(shardRows),
			structuredClone(plan)
		);
		if (batchValidation?.status !== 'passed' || (batchValidation?.issues?.length ?? 0) !== 0) {
			issues.push(
				`${shardId} rebased batch failed deterministic validation.`,
				...(batchValidation?.issues ?? []).map((issue) => `${shardId}: ${issue}`)
			);
			continue;
		}
		const candidateSha256 = canonicalHash(candidate);
		candidateBatches.set(shardId, candidate);
		for (const entry of candidate.challenges) {
			candidateById.set(entry.definition.id, entry);
		}
		selectionSourceBindings.push({
			shardId,
			disposition: selection.disposition,
			source: {
				candidatePath: selection.candidatePath,
				candidateSha256: selection.candidateSha256,
				validationPath: selection.validationPath,
				validationSha256: selection.validationSha256
			},
			rowOverrides: rowOverrideResult.bindings,
			rowOverrideSetSha256: canonicalHash(rowOverrideResult.bindings),
			candidateSha256,
			mutations: candidateResult.bindings,
			mutationSetSha256: canonicalHash(candidateResult.bindings),
			rowBindings: candidate.challenges.map((entry) => {
				const id = entry.definition.id;
				return {
					challengeId: id,
					parentAccepted: reviewById.get(id).accepted,
					parentCandidateSha256: canonicalHash(parentCandidateById.get(id)),
					sourceCandidateSha256: canonicalHash(
						sourceCandidate.challenges.find((sourceEntry) => sourceEntry?.definition?.id === id)
					),
					selectedSourceCandidateSha256: canonicalHash(
						rowOverrideResult.candidate.challenges.find(
							(sourceEntry) => sourceEntry?.definition?.id === id
						)
					),
					rebasedCandidateSha256: canonicalHash(entry)
				};
			})
		});
	}
	if (issues.length) return failed(issues);
	const orderedCandidates = plan.rows.map((row) => candidateById.get(row.id));
	if (
		orderedCandidates.length !== plan.rows.length ||
		orderedCandidates.some((entry, index) => entry?.definition?.id !== plan.rows[index].id)
	) {
		return failed('Rebased candidate set differs from exact plan order or membership.');
	}

	const collectionValidation = validateCollection(
		structuredClone(orderedCandidates),
		structuredClone(plan)
	);
	const collectionGate = validateExpectedCollectionFailure({
		collectionValidation,
		remediations: spec.collectionRemediations,
		reviewById,
		rowById: new Map(plan.rows.map((row) => [row.id, row]))
	});
	if (collectionGate.status !== 'passed') return collectionGate;
	const candidateSetSha256 = canonicalHash(orderedCandidates);
	const rebaseId = canonicalHash({
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_MANIFEST_SCHEMA,
		basePlanSha256,
		planSha256,
		sourceSnapshotSha256,
		curriculumEvidenceSha256,
		parentVerificationSha256,
		parentRepairSha256,
		approvalSha256: canonicalHash(spec.approval),
		specSha256: canonicalHash(spec),
		selectionSourceSetSha256: canonicalHash(selectionSourceBindings),
		candidateSetSha256,
		collectionValidationSha256: canonicalHash(collectionValidation)
	});
	const selectionBindings = [];
	for (const sourceBinding of selectionSourceBindings) {
		const validation = {
			schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_VALIDATION_SCHEMA,
			status: 'passed',
			contentStatus: 'review-pending',
			issues: [],
			authoringDisposition: SCIENCE_CHALLENGE_REVIEW_REBASE_DISPOSITION,
			releaseEligible: false,
			rebaseId,
			shardId: sourceBinding.shardId,
			basePlanSha256,
			planSha256,
			sourceSnapshotSha256,
			curriculumEvidenceSha256,
			parentVerificationSha256,
			parentRepairSha256,
			sourceCandidateSha256: sourceBinding.source.candidateSha256,
			sourceValidationSha256: sourceBinding.source.validationSha256,
			candidateSha256: sourceBinding.candidateSha256,
			mutationSetSha256: sourceBinding.mutationSetSha256,
			requiresFreshFullVerification: true
		};
		outputValidations.set(sourceBinding.shardId, validation);
		selectionBindings.push({
			...sourceBinding,
			validationSha256: canonicalHash(validation)
		});
	}
	const manifestCore = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_MANIFEST_SCHEMA,
		status: 'review-pending',
		disposition: SCIENCE_CHALLENGE_REVIEW_REBASE_DISPOSITION,
		rebaseId,
		basePlanSha256,
		planSha256,
		sourceSnapshotSha256,
		curriculumEvidenceSha256,
		parent: {
			verificationSha256: parentVerificationSha256,
			repairSha256: parentRepairSha256,
			candidateSetSha256: parentVerificationSummary.candidateSetSha256,
			objectiveId: parentIdentity.objectiveId,
			executionId: parentIdentity.executionId
		},
		approval: structuredClone(spec.approval),
		approvalSha256: canonicalHash(spec.approval),
		specSha256: canonicalHash(spec),
		planMutations: planMutationResult.bindings,
		planMutationSetSha256: canonicalHash(planMutationResult.bindings),
		selectionSourceSetSha256: canonicalHash(selectionSourceBindings),
		selections: selectionBindings,
		selectionSetSha256: canonicalHash(selectionBindings),
		candidateCount: orderedCandidates.length,
		candidateSetSha256,
		collectionValidation: structuredClone(collectionValidation),
		collectionValidationSha256: canonicalHash(collectionValidation),
		collectionRemediations: structuredClone(spec.collectionRemediations),
		collectionRemediationSetSha256: canonicalHash(spec.collectionRemediations),
		requiresFreshFullVerification: true,
		releaseEligible: false
	};
	const manifest = {
		...manifestCore,
		manifestCoreSha256: canonicalHash(manifestCore)
	};
	return {
		status: 'passed',
		issues: [],
		manifest,
		plan,
		planValidation,
		candidateBatches,
		orderedCandidates,
		outputValidations,
		collectionValidation
	};
}

export function validateReviewRebaseSpec(spec) {
	const issues = [];
	if (!isRecord(spec) || spec.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_SPEC_SCHEMA) {
		return failed(`Review rebase spec must use ${SCIENCE_CHALLENGE_REVIEW_REBASE_SPEC_SCHEMA}.`);
	}
	if (
		!isRecord(spec.parent) ||
		[
			'planSha256',
			'sourceSnapshotSha256',
			'curriculumEvidenceSha256',
			'verificationSha256',
			'repairSha256',
			'candidateSetSha256',
			'objectiveId',
			'executionId'
		].some((field) => !HASH.test(String(spec.parent?.[field] ?? '')))
	) {
		issues.push(
			'Review rebase requires exact parent plan, evidence, review, repair, and run hashes.'
		);
	}
	if (
		!isRecord(spec.approval) ||
		spec.approval.decision !== 'approved' ||
		spec.approval.scope !== 'fresh-full-review-only' ||
		!nonEmpty(spec.approval.rationale) ||
		!Array.isArray(spec.approval.authorizedMutationKeys) ||
		!Array.isArray(spec.approval.authorizedCollectionRemediationKeys)
	) {
		issues.push('Review rebase requires an explicit scoped operator approval.');
	}
	for (const [field, allowed] of [
		['planMutations', PLAN_FIELDS],
		['candidateMutations', CANDIDATE_FIELDS]
	]) {
		if (!Array.isArray(spec[field]) || spec[field].length === 0) {
			issues.push(`Review rebase ${field} must be a non-empty array.`);
			continue;
		}
		const seen = new Set();
		for (const [index, mutation] of spec[field].entries()) {
			const key = `${mutation?.challengeId ?? ''}:${mutation?.field ?? ''}`;
			if (
				!nonEmpty(mutation?.challengeId) ||
				!allowed.has(mutation?.field) ||
				!isJsonValue(mutation?.from) ||
				!isJsonValue(mutation?.to) ||
				Object.is(mutation.from, mutation.to) ||
				!['parent-review', 'operator-approved-atomic-source-reallocation'].includes(
					mutation?.authority
				) ||
				seen.has(key)
			) {
				issues.push(`Review rebase ${field}[${index}] is invalid or duplicated.`);
			}
			seen.add(key);
		}
	}
	if (!Array.isArray(spec.collectionRemediations) || spec.collectionRemediations.length === 0) {
		issues.push('Review rebase requires explicit collection-remediation bindings.');
	} else {
		const seenIssues = new Set();
		for (const [index, remediation] of spec.collectionRemediations.entries()) {
			if (
				!nonEmpty(remediation?.issue) ||
				!nonEmpty(remediation?.preferredChallengeId) ||
				seenIssues.has(remediation.issue)
			) {
				issues.push(`Review rebase collectionRemediations[${index}] is invalid or duplicated.`);
			}
			seenIssues.add(remediation?.issue);
		}
	}
	const expectedMutationKeys = [
		...(Array.isArray(spec.planMutations) ? spec.planMutations : []),
		...(Array.isArray(spec.candidateMutations) ? spec.candidateMutations : [])
	]
		.map((mutation) => `${mutation?.challengeId ?? ''}:${mutation?.field ?? ''}`)
		.sort();
	const expectedRemediationKeys = (
		Array.isArray(spec.collectionRemediations) ? spec.collectionRemediations : []
	)
		.map(
			(remediation) =>
				`${remediation?.preferredChallengeId ?? ''}:${canonicalHash(remediation?.issue ?? '')}`
		)
		.sort();
	if (
		canonicalHash(sortedUniqueStrings(spec.approval?.authorizedMutationKeys)) !==
		canonicalHash(expectedMutationKeys)
	) {
		issues.push('Review rebase approval does not exactly authorize every mutation target.');
	}
	if (
		canonicalHash(sortedUniqueStrings(spec.approval?.authorizedCollectionRemediationKeys)) !==
		canonicalHash(expectedRemediationKeys)
	) {
		issues.push('Review rebase approval does not exactly authorize every collection remediation.');
	}
	return issues.length ? failed(issues) : { status: 'passed', issues: [] };
}

function applyPlanMutations({ basePlan, mutations, reviewById, sourceSnapshot, approval }) {
	const plan = structuredClone(basePlan);
	const rowById = new Map(plan.rows.map((row) => [row.id, row]));
	const sourceById = new Map(sourceSnapshot.questions.map((question) => [question.id, question]));
	const issues = [];
	const bindings = [];
	for (const mutation of mutations) {
		const row = rowById.get(mutation.challengeId);
		const review = reviewById.get(mutation.challengeId);
		if (!row || review?.accepted !== false) {
			issues.push(
				`${mutation.challengeId}: plan mutation target was not rejected by the parent review.`
			);
			continue;
		}
		if (!Object.is(row[mutation.field], mutation.from)) {
			issues.push(
				`${mutation.challengeId}.${mutation.field} differs from the declared source value.`
			);
			continue;
		}
		if (!mutationAuthorityIsBound({ mutation, review, approval })) {
			issues.push(
				`${mutation.challengeId}.${mutation.field} has no exact review or approval authority.`
			);
			continue;
		}
		row[mutation.field] = structuredClone(mutation.to);
		bindings.push({
			challengeId: mutation.challengeId,
			field: mutation.field,
			from: structuredClone(mutation.from),
			to: structuredClone(mutation.to),
			authority: mutation.authority,
			parentReviewSha256: canonicalHash(review)
		});
	}
	for (const row of plan.rows) {
		const source = sourceById.get(row.calibrationQuestionId);
		if (!source) {
			issues.push(`${row.id}: rebased calibration question is absent from the source snapshot.`);
		} else if (row.calibrationQuestionSha256 !== (source.contentSha256 ?? canonicalHash(source))) {
			issues.push(`${row.id}: rebased calibration question SHA-256 is stale.`);
		}
	}
	return issues.length ? failed(issues) : { status: 'passed', issues: [], plan, bindings };
}

function groupCandidateMutations({ mutations, rowById, reviewById, approval, issues }) {
	const grouped = new Map();
	for (const mutation of mutations) {
		const row = rowById.get(mutation.challengeId);
		const review = reviewById.get(mutation.challengeId);
		if (!row || review?.accepted !== false) {
			issues.push(
				`${mutation.challengeId}: provisional candidate mutation target was not rejected by the parent review.`
			);
			continue;
		}
		if (!mutationAuthorityIsBound({ mutation, review, approval })) {
			issues.push(
				`${mutation.challengeId}.${mutation.field} has no exact review or approval authority.`
			);
			continue;
		}
		const rows = grouped.get(row.shard) ?? [];
		rows.push(mutation);
		grouped.set(row.shard, rows);
	}
	return grouped;
}

function applyRowOverrides({ candidate, overrides, expectedIds, reviewById }) {
	if (!Array.isArray(overrides)) return failed('rowOverrides must be an array.');
	const output = structuredClone(candidate);
	const outputIndexById = new Map(
		output.challenges.map((entry, index) => [entry?.definition?.id, index])
	);
	const seen = new Set();
	const bindings = [];
	const issues = [];
	for (const [index, override] of overrides.entries()) {
		const id = override?.challengeId;
		const sourceCandidate = override?.candidate;
		if (
			!nonEmpty(id) ||
			seen.has(id) ||
			!outputIndexById.has(id) ||
			reviewById.get(id)?.accepted !== false
		) {
			issues.push(`rowOverrides[${index}] is duplicated, absent, or targets accepted content.`);
			continue;
		}
		seen.add(id);
		if (
			!isRecord(sourceCandidate) ||
			sourceCandidate.schemaVersion !== SCIENCE_CHALLENGE_BATCH_SCHEMA ||
			!Array.isArray(sourceCandidate.challenges) ||
			canonicalHash(sourceCandidate.challenges.map((entry) => entry?.definition?.id)) !==
				canonicalHash(expectedIds) ||
			!nonEmpty(override.candidatePath) ||
			!nonEmpty(override.validationPath) ||
			!HASH.test(String(override.candidateSha256 ?? '')) ||
			!HASH.test(String(override.validationSha256 ?? '')) ||
			canonicalHash(sourceCandidate) !== override.candidateSha256 ||
			!isRecord(override.validation) ||
			canonicalHash(override.validation) !== override.validationSha256
		) {
			issues.push(`rowOverrides[${index}] has stale source paths, hashes, or membership.`);
			continue;
		}
		const sourceEntry = sourceCandidate.challenges.find((entry) => entry?.definition?.id === id);
		if (!sourceEntry || canonicalHash(sourceEntry) !== override.rowSha256) {
			issues.push(`rowOverrides[${index}] does not bind the exact source row.`);
			continue;
		}
		const targetIndex = outputIndexById.get(id);
		const replacedRowSha256 = canonicalHash(output.challenges[targetIndex]);
		output.challenges[targetIndex] = structuredClone(sourceEntry);
		bindings.push({
			challengeId: id,
			replacedRowSha256,
			sourceRowSha256: override.rowSha256,
			source: {
				candidatePath: override.candidatePath,
				candidateSha256: override.candidateSha256,
				validationPath: override.validationPath,
				validationSha256: override.validationSha256
			}
		});
	}
	return issues.length
		? failed(issues)
		: { status: 'passed', issues: [], candidate: output, bindings };
}

function applyCandidateMutations({ candidate, mutations, reviewById }) {
	const output = structuredClone(candidate);
	const byId = new Map(output.challenges.map((entry) => [entry?.definition?.id, entry]));
	const issues = [];
	const bindings = [];
	for (const mutation of mutations) {
		const entry = byId.get(mutation.challengeId);
		if (!entry || reviewById.get(mutation.challengeId)?.accepted !== false) {
			issues.push(`${mutation.challengeId}: candidate mutation target is missing or was accepted.`);
			continue;
		}
		const actual = readPath(entry, mutation.field);
		if (!Object.is(actual, mutation.from)) {
			issues.push(
				`${mutation.challengeId}.${mutation.field} differs from the declared source value.`
			);
			continue;
		}
		writePath(entry, mutation.field, structuredClone(mutation.to));
		bindings.push({
			challengeId: mutation.challengeId,
			field: mutation.field,
			from: structuredClone(mutation.from),
			to: structuredClone(mutation.to),
			authority: mutation.authority
		});
	}
	return issues.length
		? failed(issues)
		: { status: 'passed', issues: [], candidate: output, bindings };
}

function validateExpectedCollectionFailure({
	collectionValidation,
	remediations,
	reviewById,
	rowById
}) {
	const issues = [];
	if (
		collectionValidation?.status !== 'failed' ||
		!Array.isArray(collectionValidation.issues) ||
		collectionValidation.issues.length === 0
	) {
		issues.push('Review rebase must expose a non-empty deterministic collection failure.');
		return failed(issues);
	}
	const expectedIssues = remediations.map((remediation) => remediation.issue);
	if (canonicalHash(collectionValidation.issues) !== canonicalHash(expectedIssues)) {
		issues.push('Review rebase collection issues differ from the approved remediation set.');
	}
	for (const remediation of remediations) {
		const row = rowById.get(remediation.preferredChallengeId);
		const review = reviewById.get(remediation.preferredChallengeId);
		if (
			!row ||
			review?.accepted !== false ||
			!remediation.issue.includes(remediation.preferredChallengeId)
		) {
			issues.push(
				`${remediation.preferredChallengeId}: collection remediation is not a rejected issue participant.`
			);
		}
	}
	return issues.length ? failed(issues) : { status: 'passed', issues: [] };
}

function mutationAuthorityIsBound({ mutation, review, approval }) {
	if (mutation.authority === 'operator-approved-atomic-source-reallocation') {
		return (
			approval?.decision === 'approved' &&
			approval?.authorizedMutationKeys?.includes(`${mutation.challengeId}:${mutation.field}`)
		);
	}
	const matchingIssue = review?.issues?.find((issue) => {
		if (!nonEmpty(issue?.field) || !nonEmpty(issue?.repair)) return false;
		if (mutation.field === 'difficulty' || mutation.field === 'definition.difficulty') {
			return (
				issue.field === 'definition.difficulty' &&
				new RegExp(`\\b${escapeRegExp(String(mutation.to))}\\b`, 'iu').test(issue.repair)
			);
		}
		if (
			mutation.field === 'calibrationQuestionId' ||
			mutation.field === 'calibrationQuestionSha256' ||
			mutation.field === 'definition.sourceQuestionId' ||
			mutation.field.startsWith('grounding.calibrationQuestion')
		) {
			return /calibrationQuestionId|sourceQuestionId/u.test(issue.field);
		}
		return false;
	});
	return Boolean(matchingIssue) && mutation.authority === 'parent-review';
}

function sortedUniqueStrings(values) {
	if (!Array.isArray(values) || values.some((value) => !nonEmpty(value))) return [];
	const sorted = [...new Set(values)].sort();
	return sorted.length === values.length ? sorted : [];
}

function uniqueBy(rows, keyFor, issues, label) {
	const result = new Map();
	for (const row of rows) {
		const key = keyFor(row);
		if (!nonEmpty(key) || result.has(key)) {
			issues.push(`${label} keys must be non-empty and unique.`);
			continue;
		}
		result.set(key, row);
	}
	return result;
}

function readPath(value, field) {
	return field.split('.').reduce((current, key) => current?.[key], value);
}

function writePath(value, field, next) {
	const parts = field.split('.');
	let current = value;
	for (const key of parts.slice(0, -1)) current = current[key];
	current[parts.at(-1)] = next;
}

function isJsonValue(value) {
	if (value === null) return true;
	if (['string', 'number', 'boolean'].includes(typeof value)) return true;
	if (Array.isArray(value)) return value.every(isJsonValue);
	if (isRecord(value)) return Object.values(value).every(isJsonValue);
	return false;
}

function isRecord(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function failed(input) {
	const issues = Array.isArray(input) ? input : [input];
	return { status: 'failed', issues };
}
