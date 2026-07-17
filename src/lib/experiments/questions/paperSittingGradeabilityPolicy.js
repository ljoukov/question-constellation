/**
 * Count marks backed by explicit official rows, reviewed checklist criteria, or
 * structured answer-key targets. A model answer or answer chain can help a
 * grader explain a decision, but neither proves complete mark coverage alone.
 *
 * @param {{
 *   maxMarks: number,
 *   markScheme?: Array<{marks?: number | null}>,
 *   checklist?: Array<{required?: boolean | number | null}>,
 *   answerKeys?: Array<unknown>
 * }} input
 */
export function estimateOfficialGradeableMarks({
	maxMarks,
	markScheme = [],
	checklist = [],
	answerKeys = []
}) {
	if (!Number.isFinite(maxMarks) || maxMarks <= 0) return 0;

	const explicitMarkTotal = markScheme.reduce((sum, item) => {
		const marks = Number(item?.marks ?? 0);
		return sum + (Number.isFinite(marks) && marks > 0 ? marks : 0);
	}, 0);
	const requiredChecklistCount = checklist.filter(
		(item) => item?.required === true || Number(item?.required) > 0
	).length;
	const evidenceMarks = Math.max(
		explicitMarkTotal,
		requiredChecklistCount || checklist.length,
		answerKeys.length
	);

	return Math.min(maxMarks, evidenceMarks);
}
