import { isEnglishSubject } from '$lib/englishSubjects';
import type { ChainIllustration } from './chainIllustration';

export function useIllustratedChainLayout(
	subject: string | null | undefined,
	illustration: ChainIllustration | null | undefined
) {
	return Boolean(illustration) && !isEnglishSubject(subject);
}

export function hasExplainedWeakAnswer(
	answer: string | null | undefined,
	explanation: string | null | undefined
) {
	return Boolean(answer?.trim() && explanation?.trim());
}
