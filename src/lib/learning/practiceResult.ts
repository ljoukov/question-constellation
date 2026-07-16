export type PracticeGradeSummary = {
	result: 'correct' | 'partial' | 'incorrect';
	awardedMarks: number;
	maxMarks: number;
	presentStepIds: string[];
	missingStepIds: string[];
};

export type PracticeRepairKind = 'none' | 'rewrite' | 'retry_choice';

function normalizedFixedAnswer(value: string) {
	return value
		.toLowerCase()
		.normalize('NFKC')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function fixedChoiceCorrectAnswers(
	response: Record<string, unknown> | null | undefined
): string[] {
	if (!response || response.kind !== 'choice') return [];
	const rawAnswers = response.correctAnswers;
	const answers = Array.isArray(rawAnswers)
		? rawAnswers.map((answer) =>
				answer && typeof answer === 'object'
					? String((answer as Record<string, unknown>).correctAnswer ?? '')
					: ''
			)
		: rawAnswers && typeof rawAnswers === 'object'
			? Object.values(rawAnswers).map((answer) => (typeof answer === 'string' ? answer : ''))
			: [];
	return answers.map((answer) => answer.trim()).filter(Boolean);
}

/** Returns null when no source-grounded key is available. */
export function fixedChoiceAnswerIsCorrect(
	response: Record<string, unknown> | null | undefined,
	studentAnswer: string
): boolean | null {
	const answers = fixedChoiceCorrectAnswers(response);
	if (answers.length === 0) return null;
	const expected = answers.map(normalizedFixedAnswer).filter(Boolean);
	const selected = studentAnswer.split(/\r?\n/).map(normalizedFixedAnswer).filter(Boolean);
	if (selected.length !== expected.length) return false;
	const selectedAnswers = new Set(selected);
	return expected.every((answer) => selectedAnswers.has(answer));
}

export function resolvePracticeResultPresentation({
	gradeResult,
	checklistStepIds,
	choiceResponse,
	choiceAnswerCorrect
}: {
	gradeResult: PracticeGradeSummary | null;
	checklistStepIds: string[];
	choiceResponse: boolean;
	choiceAnswerCorrect: boolean | null;
}) {
	const numericFullMarks = Boolean(
		gradeResult && gradeResult.maxMarks > 0 && gradeResult.awardedMarks >= gradeResult.maxMarks
	);
	const fullMarks = Boolean(
		gradeResult &&
		numericFullMarks &&
		(!choiceResponse
			? true
			: choiceAnswerCorrect === null
				? gradeResult.result === 'correct'
				: choiceAnswerCorrect)
	);
	const presentStepIds = new Set(gradeResult?.presentStepIds ?? []);
	const missingStepIds = new Set(gradeResult?.missingStepIds ?? []);
	const everyStepClassified = checklistStepIds.every(
		(stepId) => presentStepIds.has(stepId) || missingStepIds.has(stepId)
	);
	const fullMarkClassificationIsConsistent =
		!fullMarks || checklistStepIds.every((stepId) => presentStepIds.has(stepId));
	const showStepDiagnostics = Boolean(
		gradeResult &&
			!choiceResponse &&
			checklistStepIds.length > 0 &&
			everyStepClassified &&
			fullMarkClassificationIsConsistent
	);
	const repairKind: PracticeRepairKind =
		!gradeResult || fullMarks
			? 'none'
			: choiceResponse
				? 'retry_choice'
				: showStepDiagnostics && missingStepIds.size > 0
					? 'rewrite'
					: 'none';

	return {
		fullMarks,
		presentStepIds,
		missingStepIds,
		showStepDiagnostics,
		repairKind
	};
}
