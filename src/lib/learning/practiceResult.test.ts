import { describe, expect, it } from 'vitest';
import { fixedChoiceAnswerIsCorrect, resolvePracticeResultPresentation } from './practiceResult';

describe('practice result presentation', () => {
	it('never asks for a rewrite when the answer earned full marks', () => {
		const result = resolvePracticeResultPresentation({
			gradeResult: {
				result: 'partial',
				awardedMarks: 1,
				maxMarks: 1,
				presentStepIds: ['meristem'],
				missingStepIds: ['plant-stem-cells']
			},
			checklistStepIds: ['plant-stem-cells', 'meristem'],
			choiceResponse: true,
			choiceAnswerCorrect: true
		});

		expect(result.fullMarks).toBe(true);
		expect(result.repairKind).toBe('none');
		expect([...result.presentStepIds]).toEqual(['plant-stem-cells', 'meristem']);
		expect([...result.missingStepIds]).toEqual([]);
	});

	it('uses a choice retry rather than a rewrite after an incorrect selection', () => {
		const result = resolvePracticeResultPresentation({
			gradeResult: {
				result: 'incorrect',
				awardedMarks: 0,
				maxMarks: 1,
				presentStepIds: [],
				missingStepIds: ['plant-stem-cells', 'meristem']
			},
			checklistStepIds: ['plant-stem-cells', 'meristem'],
			choiceResponse: true,
			choiceAnswerCorrect: false
		});

		expect(result.repairKind).toBe('retry_choice');
	});

	it('keeps the rewrite flow for an incomplete written answer', () => {
		const result = resolvePracticeResultPresentation({
			gradeResult: {
				result: 'partial',
				awardedMarks: 2,
				maxMarks: 4,
				presentStepIds: ['step-1'],
				missingStepIds: ['step-2']
			},
			checklistStepIds: ['step-1', 'step-2'],
			choiceResponse: false,
			choiceAnswerCorrect: null
		});

		expect(result.repairKind).toBe('rewrite');
		expect([...result.missingStepIds]).toEqual(['step-2']);
	});

	it('does not accept a rounded full mark for an incomplete multi-select answer', () => {
		const response = {
			kind: 'choice',
			correctAnswers: { first: 'A', second: 'D' }
		};
		const choiceAnswerCorrect = fixedChoiceAnswerIsCorrect(response, 'A');
		const result = resolvePracticeResultPresentation({
			gradeResult: {
				result: 'partial',
				awardedMarks: 1,
				maxMarks: 1,
				presentStepIds: ['first'],
				missingStepIds: ['second']
			},
			checklistStepIds: ['first', 'second'],
			choiceResponse: true,
			choiceAnswerCorrect
		});

		expect(choiceAnswerCorrect).toBe(false);
		expect(result.fullMarks).toBe(false);
		expect(result.repairKind).toBe('retry_choice');
	});
});
