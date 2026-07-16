import { isEnglishSubject } from '$lib/englishSubjects';

export function useFocusedChainLayout(subject: string | null | undefined) {
	return !isEnglishSubject(subject);
}

export function hasExplainedWeakAnswer(
	answer: string | null | undefined,
	explanation: string | null | undefined
) {
	return Boolean(answer?.trim() && explanation?.trim());
}

export function hasDistinctMarkingPoints(
	checklistSource: 'official' | 'method' | null | undefined,
	itemCount: number
) {
	return checklistSource !== 'method' && itemCount > 0;
}
