export type PracticeStateRestoreMode = 'draft' | 'checked_result' | 'fresh_attempt';

type RestorablePracticeState = {
	answerText?: string;
	gradedAnswerText?: string;
	gradeResult?: unknown;
	view?: 'attempt' | 'result';
};

export function practiceStateRestoreMode(
	state: RestorablePracticeState | null,
	requestedView: 'attempt' | 'result'
): PracticeStateRestoreMode {
	if (!state) return 'draft';
	const hasCheckedResult = Boolean(
		state.gradeResult && state.gradedAnswerText && state.gradedAnswerText === state.answerText
	);
	if (requestedView === 'result' && hasCheckedResult) return 'checked_result';
	if (hasCheckedResult || state.view === 'result') return 'fresh_attempt';
	return 'draft';
}
