export type RecallPresentation = 'flashcard' | 'mcq';
export type RecallMcqFeedback = 'correct' | 'incorrect' | null;
export type RecallReviewIntent = 'repeat' | 'next';

export type RecallControlModel =
	| {
			phase: 'prompt';
			layout: 'single';
			label: 'Show answer';
			action: 'reveal';
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
					layout: 'none',
					action: 'choose'
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
	if (presentation === 'mcq' && !mcqFeedback) return null;
	return {
		grade: presentation === 'mcq' && mcqFeedback === 'incorrect' ? 'again' : 'good',
		direction: 'right'
	};
}
