export type RecallPresentation = 'flashcard' | 'mcq';
export type RecallMcqFeedback = 'correct' | 'incorrect' | null;
export type RecallReviewIntent = 'repeat' | 'next';

export type RecallControlModel =
	| {
			phase: 'prompt';
			layout: 'single';
			label: 'Show answer' | 'Choose an answer';
			action: 'reveal' | 'instruction';
			disabled: boolean;
	  }
	| {
			phase: 'result';
			layout: 'split';
			repeatLabel: 'Repeat';
			nextLabel: 'Next card' | 'See results';
	  };

export type RecallReviewDecision = {
	grade: 'again' | 'good';
	direction: 'left' | 'right';
};

export function mixedRecallPresentation(
	cardPosition: number,
	hasMultipleChoiceOptions: boolean
): RecallPresentation {
	return hasMultipleChoiceOptions && cardPosition % 2 === 1 ? 'mcq' : 'flashcard';
}

export function recallControlModel({
	presentation,
	revealed,
	isLastCard
}: {
	presentation: RecallPresentation;
	revealed: boolean;
	isLastCard: boolean;
}): RecallControlModel {
	if (!revealed) {
		return presentation === 'mcq'
			? {
					phase: 'prompt',
					layout: 'single',
					label: 'Choose an answer',
					action: 'instruction',
					disabled: true
				}
			: {
					phase: 'prompt',
					layout: 'single',
					label: 'Show answer',
					action: 'reveal',
					disabled: false
				};
	}

	return {
		phase: 'result',
		layout: 'split',
		repeatLabel: 'Repeat',
		nextLabel: isLastCard ? 'See results' : 'Next card'
	};
}

export function recallReviewDecision({
	presentation,
	mcqFeedback,
	intent
}: {
	presentation: RecallPresentation;
	mcqFeedback: RecallMcqFeedback;
	intent: RecallReviewIntent;
}): RecallReviewDecision | null {
	if (intent === 'repeat') return { grade: 'again', direction: 'left' };
	if (presentation === 'mcq' && !mcqFeedback) return null;
	return {
		grade: presentation === 'mcq' && mcqFeedback === 'incorrect' ? 'again' : 'good',
		direction: 'right'
	};
}
