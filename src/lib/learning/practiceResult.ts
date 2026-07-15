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

function fixedChoiceAnswerKey(response: Record<string, unknown> | null | undefined) {
	if (!response || response.kind !== 'choice') return null;
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
	const normalized = answers.map(normalizedFixedAnswer).filter(Boolean);
	return normalized.length > 0 ? normalized : null;
}

/** Returns null when no source-grounded key is available. */
export function fixedChoiceAnswerIsCorrect(
	response: Record<string, unknown> | null | undefined,
	studentAnswer: string
): boolean | null {
	const expected = fixedChoiceAnswerKey(response);
	if (!expected) return null;
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
	const presentStepIds = new Set(
		fullMarks ? checklistStepIds : (gradeResult?.presentStepIds ?? [])
	);
	const missingStepIds = new Set(fullMarks ? [] : (gradeResult?.missingStepIds ?? []));
	const repairKind: PracticeRepairKind =
		!gradeResult || fullMarks
			? 'none'
			: choiceResponse
				? 'retry_choice'
				: missingStepIds.size > 0
					? 'rewrite'
					: 'none';

	return {
		fullMarks,
		presentStepIds,
		missingStepIds,
		repairKind
	};
}
