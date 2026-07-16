import { describe, expect, it } from 'vitest';
import { gapGuidedQuestionPrompt } from './personalLearning';

describe('gap guided question copy', () => {
	it('names the causal link without quoting or capitalising a fragment awkwardly', () => {
		expect(
			gapGuidedQuestionPrompt({
				kind: 'missing',
				target: 'Memory cells are produced.',
				next: 'Antibodies are produced rapidly.'
			})
		).toBe('Add the step immediately before: antibodies are produced rapidly');
	});

	it('anchors both sides of a missing middle step', () => {
		expect(
			gapGuidedQuestionPrompt({
				kind: 'missing',
				previous: 'The heart pumps less blood.',
				target: 'Less oxygen reaches the muscles.',
				next: 'Less aerobic respiration occurs.'
			})
		).toBe(
			'Complete the missing link: heart pumps less blood → ? → less aerobic respiration occurs'
		);
	});

	it('names the target when asking for the consequence', () => {
		expect(
			gapGuidedQuestionPrompt({
				kind: 'next',
				target: 'Less oxygen reaches the muscles.'
			})
		).toBe('Add the next step after: less oxygen reaches the muscles');
	});
});
