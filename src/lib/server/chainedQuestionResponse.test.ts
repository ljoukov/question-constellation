import { describe, expect, it } from 'vitest';
import {
	choiceMaxSelectionsForImport,
	cleanLegacyChoiceOption,
	explicitChainedQuestionResponse
} from '../../../scripts/lib/chained-question-response.mjs';

describe('chained question response import', () => {
	it('removes a detached PDF page number without changing a real numeric option', () => {
		expect(cleanLegacyChoiceOption('Phloem                          10')).toBe('Phloem');
		expect(cleanLegacyChoiceOption('10 cm')).toBe('10 cm');
		expect(cleanLegacyChoiceOption('Option 10')).toBe('Option 10');
	});

	it('preserves a reviewed single-choice response and its deterministic key', () => {
		expect(
			explicitChainedQuestionResponse({
				id: 'plant-tissue',
				response: {
					kind: 'choice',
					options: ['Epidermis', 'Meristem', 'Mesophyll', 'Phloem'],
					maxSelections: 1,
					correctAnswers: { answer: 'Meristem' }
				}
			})
		).toMatchObject({
			kind: 'choice',
			options: ['Epidermis', 'Meristem', 'Mesophyll', 'Phloem'],
			layout: 'vertical',
			maxSelections: 1,
			correctAnswers: { answer: 'Meristem' }
		});
	});

	it('retains tick-two intent from count or keyed-answer cardinality', () => {
		expect(choiceMaxSelectionsForImport({ count: 2 }, 5, undefined)).toBe(2);
		expect(
			choiceMaxSelectionsForImport({}, 5, { 'option-1': 'Fatty acids', 'option-2': 'Glycerol' })
		).toBe(2);
	});

	it('rejects an answer key that is absent from the visible options', () => {
		expect(() =>
			explicitChainedQuestionResponse({
				id: 'broken-choice',
				response: {
					kind: 'choice',
					options: ['A', 'B'],
					correctAnswers: { answer: 'C' }
				}
			})
		).toThrow(/not one of its visible options/);
	});
});
