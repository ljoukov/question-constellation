const examTailBoundary =
	/^\s*(?:(?:question\s+)?additional page,\s*if required\.?|copyright information)\s*$/i;

/**
 * Remove scanner/PDF tail matter before it can reach any learner surface.
 * @param {unknown} value
 */
export function stripExamPaperTail(value) {
	const lines = String(value ?? '').split(/\r?\n/);
	const boundaryIndex = lines.findIndex((line) => examTailBoundary.test(line));
	return (boundaryIndex === -1 ? lines : lines.slice(0, boundaryIndex)).join('\n');
}

/**
 * Canonical learner-facing cleanup shared by question, chain and browse surfaces.
 * @param {unknown} value
 */
export function cleanLearnerQuestionText(value) {
	return stripExamPaperTail(value)
		.split(/\r?\n/)
		.filter((line) => !/^\s*\[\s*\d+\s*marks?\s*\]\s*$/i.test(line))
		.filter((line) => !/^\s*(?:figure|table)\s+\d+\s*$/i.test(line))
		.join('\n')
		.replace(/([a-z0-9,;])\s*\n(?:[ \t]*\n)*[ \t]*([a-z])/g, '$1 $2')
		.trim();
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function learnerQuestionTextIssues(value) {
	const text = String(value ?? '');
	const issues = [];
	if (/\badditional page,\s*if required\b/i.test(text)) issues.push('exam_additional_page');
	if (/\bcopyright information\b|\bcopyright ©/i.test(text)) issues.push('exam_copyright');
	if (/\*\d{3,}[a-z0-9/.-]+\*/i.test(text)) issues.push('exam_paper_code');
	return [...new Set(issues)];
}
