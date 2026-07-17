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
		).toBe('What must happen immediately before antibodies are produced rapidly?');
	});

	it('asks a direct causal question instead of rendering an answer blank', () => {
		expect(
			gapGuidedQuestionPrompt({
				kind: 'missing',
				previous: 'The heart pumps less blood.',
				target: 'Less oxygen reaches the muscles.',
				next: 'Less aerobic respiration occurs.'
			})
		).toBe(
			'What causal step connects “heart pumps less blood” to “less aerobic respiration occurs”?'
		);
	});

	it('names the target when asking for the consequence', () => {
		expect(
			gapGuidedQuestionPrompt({
				kind: 'next',
				target: 'Less oxygen reaches the muscles.'
			})
		).toBe('What happens immediately after less oxygen reaches the muscles?');
	});
});
