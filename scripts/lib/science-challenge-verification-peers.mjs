import { canonicalHash } from './science-challenge-release.mjs';

export const SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA =
	'science-challenge-verification-assignment/v2';
export const SCIENCE_CHALLENGE_COMPONENT_PEER_EVIDENCE_SCHEMA =
	'science-challenge-same-component-peer-evidence/v1';

export function buildSameCurriculumComponentPeerEvidence({ currentRow, planRows, candidateById }) {
	const peers = planRows
		.map((row, planRowIndex) => ({ planRowIndex, row }))
		.filter(
			({ row }) =>
				row.id !== currentRow.id && row.curriculumComponentId === currentRow.curriculumComponentId
		)
		.map(({ planRowIndex, row }) => {
			const candidate = candidateById.get(row.id);
			if (!candidate) {
				throw new Error(`Missing generated peer candidate ${row.id}.`);
			}
			return {
				planSummary: {
					planRowIndex,
					id: row.id,
					shard: row.shard,
					difficulty: row.difficulty,
					taskShape: row.taskShape,
					arc: row.arc,
					mechanic: row.mechanic
				},
				candidateSha256: canonicalHash(candidate),
				candidateSummary: candidateSummaryForPeer(candidate)
			};
		});
	return {
		schemaVersion: SCIENCE_CHALLENGE_COMPONENT_PEER_EVIDENCE_SCHEMA,
		curriculumComponentId: currentRow.curriculumComponentId,
		ordering: 'plan.rows ascending, excluding the current item',
		peers
	};
}

export function validateScienceChallengeAssignmentPeerEvidence({ assignments, planRows }) {
	const issues = [];
	const candidateById = new Map();
	const itemById = new Map();
	const indexedItems = [];

	for (const assignment of assignments) {
		if (assignment?.schemaVersion !== SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA) {
			issues.push(
				`${assignment?.assignmentId ?? 'unknown assignment'} must use ${SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA}.`
			);
		}
		for (const item of assignment?.items ?? []) {
			const id = item?.candidate?.definition?.id;
			if (!id) continue;
			if (candidateById.has(id)) {
				issues.push(`Assignment candidate ${id} is duplicated.`);
				continue;
			}
			candidateById.set(id, item.candidate);
			itemById.set(id, item);
			indexedItems.push(item);
		}
	}

	const expectedPlanRows = planRows ?? planRowsFromIndexedItems(indexedItems, issues);
	const plannedIds = new Set(expectedPlanRows.map((row) => row.id));
	const planRowIndexById = new Map(
		expectedPlanRows.map((row, planRowIndex) => [row.id, planRowIndex])
	);
	for (const item of indexedItems) {
		const id = item?.candidate?.definition?.id;
		if (id && item.planRowIndex !== planRowIndexById.get(id)) {
			issues.push(`${id}.planRowIndex differs from the bound plan order.`);
		}
	}
	for (const row of expectedPlanRows) {
		if (!candidateById.has(row.id)) {
			issues.push(`Assignment candidates are missing planned item ${row.id}.`);
		}
	}
	for (const id of candidateById.keys()) {
		if (!plannedIds.has(id)) {
			issues.push(`Assignment candidate ${id} is not present in the plan.`);
		}
	}
	if (issues.length) return { status: 'failed', issues };

	for (const row of expectedPlanRows) {
		const expected = buildSameCurriculumComponentPeerEvidence({
			currentRow: row,
			planRows: expectedPlanRows,
			candidateById
		});
		const actual = itemById.get(row.id)?.sameCurriculumComponentPeerEvidence;
		if (canonicalHash(actual) !== canonicalHash(expected)) {
			issues.push(
				`${row.id}.sameCurriculumComponentPeerEvidence is incomplete, reordered or stale.`
			);
		}
	}

	return issues.length ? { status: 'failed', issues } : { status: 'passed', issues: [] };
}

function planRowsFromIndexedItems(items, issues) {
	const ordered = [...items].sort(
		(left, right) => Number(left?.planRowIndex) - Number(right?.planRowIndex)
	);
	for (const [planRowIndex, item] of ordered.entries()) {
		if (!Number.isInteger(item?.planRowIndex) || item.planRowIndex !== planRowIndex) {
			issues.push('Assignment item planRowIndex values must be unique and contiguous from zero.');
			break;
		}
		if (!item?.plan) {
			issues.push(`Assignment item ${planRowIndex} has no plan row.`);
		}
	}
	return ordered.map((item) => item?.plan).filter(Boolean);
}

function candidateSummaryForPeer(candidate) {
	const definition = candidate?.definition ?? {};
	const art = candidate?.art ?? {};
	return {
		title: definition.title,
		hook: definition.hook,
		difficulty: definition.difficulty,
		marks: definition.marks,
		estimatedMinutes: definition.estimatedMinutes,
		previewQuestion: definition.previewQuestion,
		questionPresentation: definition.questionPresentation,
		staticAnswers: definition.staticAnswers,
		strongerAnswer: definition.strongerAnswer,
		weakAnswer: definition.weakAnswer,
		weakAnswerKind: definition.weakAnswerKind,
		showdownExplanation: definition.showdownExplanation,
		commandWordLesson: definition.commandWordLesson,
		diagnosisPrompt: definition.diagnosisPrompt,
		diagnosisChoices: definition.diagnosisChoices,
		repairPrompt: definition.repairPrompt,
		repairChoices: definition.repairChoices,
		transferPromptLead: definition.transferPromptLead,
		transferChoices: definition.transferChoices,
		transferExplanation: definition.transferExplanation,
		memoryHandle: definition.memoryHandle,
		art: {
			opening: artSummaryForPeer(art.opening),
			transfer: artSummaryForPeer(art.transfer)
		}
	};
}

function artSummaryForPeer(art) {
	return {
		scene: art?.scene,
		visualAnchor: art?.visualAnchor,
		approvedMeaning: art?.approvedMeaning,
		altText: art?.altText
	};
}
