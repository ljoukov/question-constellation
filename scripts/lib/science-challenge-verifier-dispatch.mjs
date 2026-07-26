import { canonicalHash } from './science-challenge-release.mjs';

export const SCIENCE_CHALLENGE_VERIFIER_COUNT = 3;
export const SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER = 17;
export const SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_COUNT =
	SCIENCE_CHALLENGE_VERIFIER_COUNT * SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER;

const DISPATCH_LEDGER_SCHEMA = 'science-challenge-verifier-dispatch-ledger/v1';
const ORCHESTRATOR = 'codex-collaboration';
const REVIEW_MODEL = 'gpt-5.6-sol';
const REVIEW_REASONING_EFFORT = 'max';

export function validateScienceChallengeVerifierDispatchLedger(ledger, assignmentIndex) {
	const issues = [];
	if (
		ledger?.schemaVersion !== DISPATCH_LEDGER_SCHEMA ||
		ledger?.orchestrator !== ORCHESTRATOR ||
		ledger?.indexSha256 !== canonicalHash(assignmentIndex) ||
		!ledger?.createdAt ||
		Number.isNaN(Date.parse(ledger.createdAt))
	) {
		issues.push('Ledger metadata does not bind the assignment index.');
	}
	if (!Array.isArray(assignmentIndex?.assignments)) {
		issues.push('Assignment index assignments must be an array.');
		return failed(issues);
	}
	if (assignmentIndex.assignments.length !== SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_COUNT) {
		issues.push(
			`Assignment index must contain exactly ${SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_COUNT} assignments.`
		);
	}
	if (
		!Array.isArray(ledger?.dispatches) ||
		ledger.dispatches.length !== assignmentIndex.assignments.length
	) {
		issues.push('Ledger must contain exactly one dispatch per assignment.');
		return failed(issues);
	}

	const assignmentById = new Map(
		assignmentIndex.assignments.map((assignment) => [assignment.assignmentId, assignment])
	);
	const allocation = validateScienceChallengeVerifierAllocation(ledger.dispatches, {
		expectedAssignmentCount: assignmentIndex.assignments.length
	});
	issues.push(...allocation.issues);

	for (const [dispatchIndex, dispatch] of ledger.dispatches.entries()) {
		const orderedAssignment = assignmentIndex.assignments[dispatchIndex];
		if (
			dispatch?.assignmentId !== orderedAssignment?.assignmentId ||
			dispatch?.assignmentSha256 !== orderedAssignment?.sha256 ||
			dispatch?.assignmentPath !== orderedAssignment?.path
		) {
			issues.push(`Dispatch row ${dispatchIndex + 1} differs from assignment-index order.`);
		}
		const assignment = assignmentById.get(dispatch?.assignmentId);
		if (
			!assignment ||
			dispatch.assignmentSha256 !== assignment.sha256 ||
			dispatch.assignmentPath !== assignment.path
		) {
			issues.push(`${String(dispatch?.assignmentId)} dispatch does not bind its assignment bytes.`);
		}
	}
	for (const assignment of assignmentIndex.assignments) {
		if (!allocation.dispatchByAssignment.has(assignment.assignmentId)) {
			issues.push(`Missing dispatch for ${assignment.assignmentId}.`);
		}
	}
	return issues.length ? failed(issues) : passed(allocation);
}

export function validateScienceChallengeVerifierAllocation(
	dispatches,
	{ expectedAssignmentCount = SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_COUNT } = {}
) {
	const issues = [];
	if (!Array.isArray(dispatches)) {
		return failed(['Dispatches must be an array.']);
	}
	if (expectedAssignmentCount !== SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_COUNT) {
		issues.push(
			`Verifier allocation requires exactly ${SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_COUNT} assignments.`
		);
	}
	if (dispatches.length !== expectedAssignmentCount) {
		issues.push(`Verifier allocation must contain exactly ${expectedAssignmentCount} dispatches.`);
	}

	const dispatchByAssignment = new Map();
	const assignmentCountByTaskName = new Map();
	const taskNameByBlock = new Map();

	for (const [dispatchIndex, dispatch] of dispatches.entries()) {
		const assignmentId = dispatch?.assignmentId;
		const taskName = dispatch?.taskName;
		if (
			dispatch?.orchestrator !== ORCHESTRATOR ||
			dispatch?.forkTurns !== 'none' ||
			dispatch?.model !== REVIEW_MODEL ||
			dispatch?.reasoningEffort !== REVIEW_REASONING_EFFORT ||
			!functioningTaskName(taskName)
		) {
			issues.push(`${String(assignmentId)} has invalid empty-context dispatch metadata.`);
		}
		if (dispatchByAssignment.has(assignmentId)) {
			issues.push(`Duplicate dispatch for ${String(assignmentId)}.`);
		} else {
			dispatchByAssignment.set(assignmentId, dispatch);
		}

		if (functioningTaskName(taskName)) {
			const block = Math.floor(dispatchIndex / SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER);
			const blockTaskName = taskNameByBlock.get(block);
			if (blockTaskName === undefined) {
				taskNameByBlock.set(block, taskName);
			} else if (blockTaskName !== taskName) {
				issues.push(
					`Dispatch row ${dispatchIndex + 1} breaks the deterministic 17-row verifier block.`
				);
			}
			assignmentCountByTaskName.set(taskName, (assignmentCountByTaskName.get(taskName) ?? 0) + 1);
		}
	}

	if (assignmentCountByTaskName.size !== SCIENCE_CHALLENGE_VERIFIER_COUNT) {
		issues.push(
			`Verifier allocation must contain exactly ${SCIENCE_CHALLENGE_VERIFIER_COUNT} unique canonical task names.`
		);
	}
	for (const [taskName, assignmentCount] of assignmentCountByTaskName) {
		if (assignmentCount !== SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER) {
			issues.push(
				`${taskName} must cover exactly ${SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER} assignments; found ${assignmentCount}.`
			);
		}
	}

	return issues.length
		? failed(issues, { dispatchByAssignment, assignmentCountByTaskName })
		: passed({ dispatchByAssignment, assignmentCountByTaskName });
}

function functioningTaskName(value) {
	return typeof value === 'string' && /^\/root\/[a-z0-9_]+(?:\/[a-z0-9_]+)*$/.test(value);
}

function failed(issues, extra = {}) {
	return { status: 'failed', issues, ...extra };
}

function passed(extra = {}) {
	return { status: 'passed', issues: [], ...extra };
}
