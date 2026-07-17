// Final release evidence stores a compact phase result plus the complete
// source-reviewed closure. Validate both known closure contracts without ever
// relabelling a failed model audit as a model pass.

const SHA256 = /^[a-f0-9]{64}$/;
const REPAIR_CLOSURE = 'human_source_reviewed_after_failed_model_audits';
const FALSE_POSITIVE_CLOSURE = 'human_source_reviewed_false_positive';

/**
 * @param {{
 *   phase: any,
 *   result: any,
 *   questionCount: number,
 *   markTotal: number,
 *   recoveredRollout?: boolean
 * }} input
 */
export function validReviewedSourceClosurePhase({
	phase,
	result,
	questionCount,
	markTotal,
	recoveredRollout = false
}) {
	try {
		assert(phase?.status === 'passed_after_reviewed_source_closure');
		assert(phase?.modelJudgePass === false);
		const closure = phase?.reviewedSourceClosure;
		assert(closure?.status === 'passed' && closure?.modelJudgePass === false);
		assert(
			Number(closure?.deterministicValidation?.questionCount) === questionCount &&
				Number(closure?.deterministicValidation?.markTotal) === markTotal &&
				closure?.deterministicValidation?.status === 'passed' &&
				Number(closure?.deterministicValidation?.blockingIssues) === 0
		);
		for (const artifact of [
			closure?.outputArtifact,
			closure?.deterministicValidation,
			closure?.sourceDocuments?.questionPaper,
			closure?.sourceDocuments?.markScheme
		]) {
			assert(hashedArtifact(artifact));
		}
		const checkedCount = firstFinite(result?.checkedRefCount, result?.checkedRefs);
		const repairCount = firstFinite(result?.requiredRepairCount, result?.requiredRepairs);
		const verdict = result?.modelVerdict ?? result?.verdict;
		assert(Number(result?.score) >= 0.8 && checkedCount === questionCount);

		if (closure.closureType === REPAIR_CLOSURE) {
			assert(Boolean(closure?.repairRef));
			assert(closure?.databaseSittingApprovalRetained === true);
			assert(verdict === 'fail' && repairCount === 1 && recoveredRollout);
			return true;
		}
		if (closure.closureType !== FALSE_POSITIVE_CLOSURE) return false;

		assert(
			result?.status === 'passed_after_reviewed_source_closure' &&
				verdict === 'reviewed_source_closure' &&
				repairCount === 0
		);
		assertFalsePositiveClosure(closure, questionCount, markTotal);
		return true;
	} catch {
		return false;
	}
}

/** @param {any} closure @param {number} questionCount @param {number} markTotal */
function assertFalsePositiveClosure(closure, questionCount, markTotal) {
	const mutation = closure?.candidateMutation;
	assert(
		mutation?.unchanged === true &&
			Array.isArray(mutation?.changedPaths) &&
			mutation.changedPaths.length === 0 &&
			hashedJsonArtifact(mutation?.before) &&
			hashedJsonArtifact(mutation?.after) &&
			mutation.before.path === mutation.after.path &&
			mutation.before.sha256 === mutation.after.sha256 &&
			mutation.before.canonicalJsonSha256 === mutation.after.canonicalJsonSha256 &&
			mutation.after.sha256 === closure.outputArtifact.sha256
	);
	assert(hashedArtifact(closure?.sourceDocuments?.examinerReport));
	assert(Number(closure?.deterministicValidation?.deterministicIssueCount) === 0);

	const audits = Array.isArray(closure?.modelAudits) ? closure.modelAudits : [];
	assert(audits.length > 0);
	const auditRepairRefs = new Set();
	for (const audit of audits) {
		const checkedRefList = Array.isArray(audit?.checkedRefList) ? audit.checkedRefList : [];
		assert(
			audit?.executionStatus === 'passed' &&
				audit?.verdict === 'fail' &&
				Number(audit?.score) >= 0.8 &&
				audit?.model === 'gpt-5.6-sol' &&
				audit?.thinkingLevel === 'max' &&
				Boolean(audit?.threadId) &&
				Number(audit?.checkedRefs) === questionCount &&
				checkedRefList.length === questionCount &&
				new Set(checkedRefList).size === questionCount &&
				Number(audit?.questionCount) === questionCount &&
				Number(audit?.markTotal) === markTotal &&
				Array.isArray(audit?.requiredRepairs) &&
				audit.requiredRepairs.length > 0 &&
				hashedArtifact(audit?.report) &&
				hashedArtifact(audit?.summary) &&
				hashedArtifact(audit?.events) &&
				hashedJsonArtifact(audit?.candidate) &&
				audit.candidate.sha256 === closure.outputArtifact.sha256
		);
		for (const repair of audit.requiredRepairs) {
			const ref = String(repair?.sourceQuestionRef ?? '').trim();
			assert(ref && Boolean(repair?.field));
			auditRepairRefs.add(ref);
		}
	}

	const findings = Array.isArray(closure?.falsePositiveFindings)
		? closure.falsePositiveFindings
		: [];
	assert(findings.length > 0);
	const findingRefs = new Set();
	for (const finding of findings) {
		const ref = String(finding?.sourceQuestionRef ?? '').trim();
		const anchors = finding?.officialSource?.anchors;
		assert(
			ref &&
				Boolean(finding?.field) &&
				finding?.modelFinding?.sourceQuestionRef === ref &&
				finding?.modelFinding?.field === finding.field &&
				finding?.disposition === 'false_positive_no_candidate_change' &&
				Boolean(finding?.officialSource?.document) &&
				Number.isInteger(Number(finding?.officialSource?.physicalPdfPage)) &&
				Number(finding.officialSource.physicalPdfPage) > 0 &&
				Array.isArray(anchors) &&
				anchors.length > 0 &&
				anchors.every((anchor) => String(anchor ?? '').trim()) &&
				Boolean(String(finding?.rationale ?? '').trim())
		);
		findingRefs.add(ref);
	}
	assert(sameSet(findingRefs, auditRepairRefs));
	assert(
		typeof closure?.assertion === 'string' &&
			/No model-judge pass is claimed/i.test(closure.assertion)
	);

	const invariants = closure?.invariants ?? {};
	for (const key of [
		'exactCandidateHash',
		'exactFailedJudgeReportHash',
		'exactFailedJudgeSummaryHash',
		'exactOfficialQuestionPaperHash',
		'exactOfficialMarkSchemeHash',
		'exactOfficialExaminerReportHash',
		'soleFailedFindingSourceDisproved',
		'candidateUnchanged',
		'changedFieldCountExact',
		'fullRefInventoryValidated',
		'fullMarkInventoryValidated',
		'zeroDeterministicBlockers'
	]) {
		assert(invariants[key] === true);
	}
}

/** @param {any} value */
function hashedArtifact(value) {
	return Boolean(value?.path) && SHA256.test(String(value?.sha256 ?? ''));
}

/** @param {any} value */
function hashedJsonArtifact(value) {
	return hashedArtifact(value) && SHA256.test(String(value?.canonicalJsonSha256 ?? ''));
}

/** @param {...unknown} values */
function firstFinite(...values) {
	for (const value of values) {
		const number = Number(value);
		if (Number.isFinite(number)) return number;
	}
	return Number.NaN;
}

/** @param {Set<string>} left @param {Set<string>} right */
function sameSet(left, right) {
	return left.size === right.size && [...left].every((value) => right.has(value));
}

/** @param {unknown} condition @returns {asserts condition} */
function assert(condition) {
	if (!condition) throw new Error('invalid reviewed-source closure phase');
}
