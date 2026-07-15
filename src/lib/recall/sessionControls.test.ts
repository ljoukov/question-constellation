import { describe, expect, it } from 'vitest';
import {
	mixedRecallPresentation,
	recallControlModel,
	recallReviewDecision
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

	it('uses one prompt action and the same two result decisions for both card types', () => {
		expect(
			recallControlModel({ presentation: 'flashcard', revealed: false, isLastCard: false })
		).toEqual({
			phase: 'prompt',
			layout: 'single',
			label: 'Show answer',
			action: 'reveal',
			disabled: false
		});
		expect(recallControlModel({ presentation: 'mcq', revealed: false, isLastCard: false })).toEqual(
			{
				phase: 'prompt',
				layout: 'single',
				label: 'Choose an answer',
				action: 'instruction',
				disabled: true
			}
		);

		for (const presentation of ['flashcard', 'mcq'] as const) {
			expect(recallControlModel({ presentation, revealed: true, isLastCard: false })).toEqual({
				phase: 'result',
				layout: 'split',
				repeatLabel: 'Repeat',
				nextLabel: 'Next card'
			});
		}
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
});
