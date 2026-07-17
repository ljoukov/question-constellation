export type RecallPresentation = 'flashcard' | 'mcq' | 'truefalse';
export type RecallMcqFeedback = 'correct' | 'incorrect' | null;
export type RecallReviewIntent = 'repeat' | 'next';
export type RecallDragIntent = 'pending' | 'horizontal' | 'vertical';

const RECALL_DRAG_INTENT_SLOP_PX = 8;
const RECALL_DRAG_HORIZONTAL_BIAS = 0.8;
const RECALL_DRAG_VERTICAL_BIAS = 1.2;

export type RecallControlModel =
	| {
			phase: 'prompt';
			layout: 'single';
			label: 'Show answer';
			action: 'reveal';
	  }
	| {
			phase: 'prompt';
			layout: 'single';
			label: 'Skip card';
			action: 'skip';
	  }
	| {
			phase: 'prompt';
			layout: 'none';
			action: 'choose';
	  }
	| {
			phase: 'result';
			layout: 'split';
			repeatLabel: 'Repeat later';
			nextLabel: 'Next card' | 'See results';
	  };

export type ExplicitReverseRecallCard = {
	reverseFront?: string | null;
	reverseBack?: string | null;
};

export type RecallReviewDecision = {
	grade: 'again' | 'good';
	direction: 'left' | 'right';
};

export function recallDragIntent(
	deltaX: number,
	deltaY: number,
	currentIntent: RecallDragIntent = 'pending'
): RecallDragIntent {
	if (currentIntent !== 'pending') return currentIntent;

	const horizontalDistance = Math.abs(deltaX);
	const verticalDistance = Math.abs(deltaY);
	if (Math.max(horizontalDistance, verticalDistance) < RECALL_DRAG_INTENT_SLOP_PX) {
		return 'pending';
	}
	if (horizontalDistance >= verticalDistance * RECALL_DRAG_HORIZONTAL_BIAS) {
		return 'horizontal';
	}
	if (verticalDistance >= horizontalDistance * RECALL_DRAG_VERTICAL_BIAS) {
		return 'vertical';
	}
	return 'pending';
}

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
		return presentation === 'truefalse'
			? {
					phase: 'prompt',
					layout: 'none',
					action: 'choose'
				}
			: presentation === 'mcq'
				? {
						phase: 'prompt',
						layout: 'single',
						label: 'Skip card',
						action: 'skip'
					}
				: {
						phase: 'prompt',
						layout: 'single',
						label: 'Show answer',
						action: 'reveal'
					};
	}

	return {
		phase: 'result',
		layout: 'split',
		repeatLabel: 'Repeat later',
		nextLabel: isLastCard ? 'See results' : 'Next card'
	};
}

export function requeueRecallContentKey(keys: string[], contentKey: string): string[] {
	return [...keys, contentKey];
}

export function shouldRecordRecallWrongChoice({
	chosenAnswer,
	correctAnswer,
	choiceKeys
}: {
	chosenAnswer?: string;
	correctAnswer: string;
	choiceKeys: Record<string, string>;
}): boolean {
	return Boolean(
		chosenAnswer && chosenAnswer !== correctAnswer && Object.hasOwn(choiceKeys, chosenAnswer)
	);
}

export function explicitReversePair(
	card: ExplicitReverseRecallCard
): { front: string; back: string } | null {
	const front = card.reverseFront?.trim();
	const back = card.reverseBack?.trim();
	return front && back ? { front, back } : null;
}

export function cardsEligibleForRecallMode<T extends ExplicitReverseRecallCard>(
	cards: T[],
	mode: string
): T[] {
	return mode === 'reverse' ? cards.filter((card) => explicitReversePair(card) !== null) : cards;
}

export function shuffledRecallChoices<T>(
	items: T[],
	cardContentKey: string,
	sessionId: string
): T[] {
	const next = [...items];
	let state = hashString(`${sessionId}\u0000${cardContentKey}`) || 1;
	for (let index = next.length - 1; index > 0; index -= 1) {
		state = (state * 1664525 + 1013904223) >>> 0;
		const swapIndex = state % (index + 1);
		[next[index], next[swapIndex]] = [next[swapIndex], next[index]];
	}
	return next;
}

function hashString(value: string): number {
	let hash = 0;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
	}
	return hash;
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
	if (presentation !== 'flashcard' && !mcqFeedback) return null;
	return {
		grade: presentation !== 'flashcard' && mcqFeedback === 'incorrect' ? 'again' : 'good',
		direction: 'right'
	};
}
