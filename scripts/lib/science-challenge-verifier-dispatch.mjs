import { canonicalHash } from './science-challenge-release.mjs';

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
	if (assignmentIndex.assignments.length === 0) {
		issues.push('Assignment index must contain at least one assignment.');
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
	{ expectedAssignmentCount = Array.isArray(dispatches) ? dispatches.length : 0 } = {}
) {
	const issues = [];
	if (!Array.isArray(dispatches)) {
		return failed(['Dispatches must be an array.']);
	}
	if (!Number.isInteger(expectedAssignmentCount) || expectedAssignmentCount < 1) {
		issues.push('Verifier allocation expectedAssignmentCount must be a positive integer.');
	}
	if (dispatches.length !== expectedAssignmentCount) {
		issues.push(`Verifier allocation must contain exactly ${expectedAssignmentCount} dispatches.`);
	}

	const dispatchByAssignment = new Map();
	const assignmentCountByTaskName = new Map();
	const completedTaskNames = new Set();
	let activeTaskName = null;

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
			if (taskName !== activeTaskName) {
				if (activeTaskName !== null) completedTaskNames.add(activeTaskName);
				if (completedTaskNames.has(taskName)) {
					issues.push(
						`Dispatch row ${dispatchIndex + 1} reopens a completed verifier block.`
					);
				}
				activeTaskName = taskName;
			}
			assignmentCountByTaskName.set(taskName, (assignmentCountByTaskName.get(taskName) ?? 0) + 1);
		}
	}

	const assignmentCounts = [...assignmentCountByTaskName.values()];
	if (assignmentCounts.length === 0) {
		issues.push('Verifier allocation must contain at least one canonical task name.');
	} else if (Math.max(...assignmentCounts) - Math.min(...assignmentCounts) > 1) {
		issues.push('Verifier allocation blocks must be balanced to within one assignment.');
	}

	return issues.length
		? failed(issues, { dispatchByAssignment, assignmentCountByTaskName })
		: passed({ dispatchByAssignment, assignmentCountByTaskName });
}

export function scienceChallengeVerifierAllocationRanges({ assignmentCount, verifierCount }) {
	if (!Number.isInteger(assignmentCount) || assignmentCount < 1) {
		throw new Error('Verifier allocation assignmentCount must be a positive integer.');
	}
	if (
		!Number.isInteger(verifierCount) ||
		verifierCount < 1 ||
		verifierCount > assignmentCount
	) {
		throw new Error(
			'Verifier allocation verifierCount must be a positive integer no larger than assignmentCount.'
		);
	}
	const minimum = Math.floor(assignmentCount / verifierCount);
	const remainder = assignmentCount % verifierCount;
	let start = 0;
	return Array.from({ length: verifierCount }, (_unused, index) => {
		const count = minimum + (index < remainder ? 1 : 0);
		const range = { start, end: start + count, count };
		start = range.end;
		return range;
	});
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
