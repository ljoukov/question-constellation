import { describe, expect, it } from 'vitest';
import { supportsLearnerPracticeInput } from './practiceEligibility';

describe('supportsLearnerPracticeInput', () => {
	it('accepts ordinary written answers', () => {
		expect(
			supportsLearnerPracticeInput({
				answerFormat: 'lines',
				prompt: 'Explain why the current is lower.',
				responseKind: 'lines'
			})
		).toBe(true);
	});

	it('accepts a reviewed choice interaction even when the stored format is choice', () => {
		expect(
			supportsLearnerPracticeInput({
				answerFormat: 'choice',
				prompt: 'Tick one box. Which tissue forms new root cells?',
				responseKind: 'choice'
			})
		).toBe(true);
	});

	it('rejects a choice prompt without a reviewed choice interaction', () => {
		expect(
			supportsLearnerPracticeInput({
				answerFormat: 'choice',
				prompt: 'Tick one box. Which tissue forms new root cells?',
				responseKind: null
			})
		).toBe(false);
	});

	it('rejects structured and direct-manipulation responses', () => {
		expect(
			supportsLearnerPracticeInput({
				answerFormat: 'table',
				prompt: 'Record the results.',
				responseKind: 'structured-table'
			})
		).toBe(false);
		expect(
			supportsLearnerPracticeInput({
				answerFormat: 'lines',
				prompt: 'Complete the graph by plotting the final point.',
				responseKind: 'lines'
			})
		).toBe(false);
	});

	it('fails closed for inconsistent stored and reviewed interaction types', () => {
		expect(
			supportsLearnerPracticeInput({
				answerFormat: 'lines',
				prompt: 'Tick one box. Which tissue forms new root cells?',
				responseKind: 'choice'
			})
		).toBe(false);
	});
});
