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

	it('holds out a question that references an absent exam table', () => {
		expect(
			supportsLearnerPracticeInput({
				answerFormat: 'labeled-lines',
				prompt: 'Calculate mean value X.',
				context: 'Table 1 shows the results at 20 °C.',
				responseKind: 'labeled-lines',
				hasReferencedSourceMaterial: false
			})
		).toBe(false);
	});

	it('allows a text response when its referenced table is rendered', () => {
		expect(
			supportsLearnerPracticeInput({
				answerFormat: 'labeled-lines',
				prompt: 'Calculate mean value X.',
				context: 'Table 1 shows the results at 20 °C.',
				responseKind: 'labeled-lines',
				hasReferencedSourceMaterial: true
			})
		).toBe(true);
	});

	it('holds out an equation completion without reviewed equation blanks', () => {
		expect(
			supportsLearnerPracticeInput({
				prompt: 'Complete the equation for the reaction. C11H24 → C5H10 + 2 +',
				responseKind: 'lines'
			})
		).toBe(false);
		expect(
			supportsLearnerPracticeInput({
				prompt: 'Balance the equation for complete combustion of methane.',
				responseKind: 'lines'
			})
		).toBe(false);
		expect(
			supportsLearnerPracticeInput({
				prompt: 'Balance the equation for complete combustion of methane.',
				responseKind: 'equation-blanks'
			})
		).toBe(true);
	});

	it('holds out multiple named response fields without a reviewed labeled input', () => {
		expect(
			supportsLearnerPracticeInput({
				prompt: 'Describe the test.\nTest\nResult',
				responseKind: 'lines'
			})
		).toBe(false);
		expect(
			supportsLearnerPracticeInput({
				prompt: 'Describe the test.\nTest\nResult',
				responseKind: 'labeled-lines'
			})
		).toBe(true);
	});

	it('holds out an unstated hypothesis and reaction-specific pressure question', () => {
		expect(
			supportsLearnerPracticeInput({
				prompt: 'Explain why the students thought their hypothesis would be correct.'
			})
		).toBe(false);
		expect(
			supportsLearnerPracticeInput({
				prompt: 'Explain the effect of increasing the pressure on the yield of ammonia.'
			})
		).toBe(false);
		expect(
			supportsLearnerPracticeInput({
				prompt: 'Explain the effect of increasing the pressure on the yield of ammonia.',
				context: 'The equation for the reaction is N2 + 3 H2 ⇌ 2 NH3.'
			})
		).toBe(true);
	});
});
