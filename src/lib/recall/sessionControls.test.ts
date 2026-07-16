import { describe, expect, it } from 'vitest';
import {
	cardsEligibleForRecallMode,
	explicitReversePair,
	mixedRecallPresentation,
	recallControlModel,
	recallReviewDecision,
	shuffledRecallChoices
} from './sessionControls';

describe('recall session controls', () => {
	it('alternates a five-card mixed deck when choices exist', () => {
		expect(Array.from({ length: 5 }, (_, index) => mixedRecallPresentation(index, true))).toEqual([
			'flashcard',
			'mcq',
			'flashcard',
			'mcq',
			'flashcard'
		]);
		expect(mixedRecallPresentation(1, false)).toBe('flashcard');
	});

	it('uses one prompt action and one unambiguous continuation after an MCQ', () => {
		expect(
			recallControlModel({ presentation: 'flashcard', revealed: false, isLastCard: false })
		).toEqual({
			phase: 'prompt',
			layout: 'single',
			label: 'Show answer',
			action: 'reveal'
		});
		expect(recallControlModel({ presentation: 'mcq', revealed: false, isLastCard: false })).toEqual(
			{
				phase: 'prompt',
				layout: 'none',
				action: 'choose'
			}
		);

		expect(
			recallControlModel({ presentation: 'flashcard', revealed: true, isLastCard: false })
		).toEqual({
			phase: 'result',
			layout: 'split',
			repeatLabel: 'Repeat',
			nextLabel: 'Next card'
		});
		expect(recallControlModel({ presentation: 'mcq', revealed: true, isLastCard: true })).toEqual({
			phase: 'result',
			layout: 'single',
			nextLabel: 'See results'
		});
	});

	it('lets a learner repeat a correct guess and keeps a wrong MCQ due when continuing', () => {
		expect(
			recallReviewDecision({ presentation: 'mcq', mcqFeedback: 'correct', intent: 'repeat' })
		).toEqual({ grade: 'again', direction: 'left' });
		expect(
			recallReviewDecision({ presentation: 'mcq', mcqFeedback: 'incorrect', intent: 'next' })
		).toEqual({ grade: 'again', direction: 'right' });
		expect(
			recallReviewDecision({ presentation: 'flashcard', mcqFeedback: null, intent: 'next' })
		).toEqual({ grade: 'good', direction: 'right' });
		expect(
			recallReviewDecision({ presentation: 'mcq', mcqFeedback: null, intent: 'next' })
		).toBeNull();
	});

	it('uses only explicit complete reverse pairs', () => {
		const reversible = { id: 'reversible', reverseFront: 'Definition', reverseBack: 'Term' };
		const missing = { id: 'missing', reverseFront: null, reverseBack: null };
		const incomplete = { id: 'incomplete', reverseFront: 'Definition', reverseBack: null };
		expect(explicitReversePair(reversible)).toEqual({ front: 'Definition', back: 'Term' });
		expect(explicitReversePair(missing)).toBeNull();
		expect(explicitReversePair(incomplete)).toBeNull();
		expect(cardsEligibleForRecallMode([reversible, missing, incomplete], 'reverse')).toEqual([
			reversible
		]);
		expect(cardsEligibleForRecallMode([reversible, missing], 'recall')).toEqual([
			reversible,
			missing
		]);
	});

	it('keeps MCQ order stable on restore but varies it for a new session', () => {
		const choices = ['answer', 'one', 'two', 'three'];
		const first = shuffledRecallChoices(choices, 'card@1:hash', 'session-one');
		expect(shuffledRecallChoices(choices, 'card@1:hash', 'session-one')).toEqual(first);
		expect(shuffledRecallChoices(choices, 'card@1:hash', 'session-two')).not.toEqual(first);
		expect(first).toEqual(expect.arrayContaining(choices));
	});
});
