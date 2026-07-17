import { describe, expect, it } from 'vitest';
import { cleanPromptText, learnerFacingModelAnswer } from './questionData';

describe('learner-facing question content', () => {
	it('keeps a concise model answer', () => {
		expect(learnerFacingModelAnswer('Meristem tissue')).toBe('Meristem tissue');
	});

	it('rejects raw mark-scheme and assessment-objective fragments', () => {
		expect(learnerFacingModelAnswer('04.6 meristem 1 AO1')).toBe('');
		expect(learnerFacingModelAnswer('Allow answers referring to stem cells.')).toBe('');
	});

	it('does not present checklist-style answer guidance as a model answer', () => {
		expect(
			learnerFacingModelAnswer(
				'A strong response would sustain the required form, address the audience and use accurate punctuation.'
			)
		).toBe('');
		expect(
			learnerFacingModelAnswer(
				'A high-level response may compare the poems while analysing imagery and structure.'
			)
		).toBe('');
		expect(
			learnerFacingModelAnswer(
				'No single fixed model answer is prescribed. Credit a range of valid approaches.'
			)
		).toBe('');
	});

	it('joins an extracted paragraph break that splits one sentence', () => {
		expect(
			cleanPromptText(
				'Describe how the measles vaccine helps a person to become immune to the\nmeasles pathogen.'
			)
		).toBe(
			'Describe how the measles vaccine helps a person to become immune to the measles pathogen.'
		);
	});

	it('preserves a real paragraph boundary', () => {
		expect(cleanPromptText('Read the information.\n\nExplain what happens next.')).toBe(
			'Read the information.\n\nExplain what happens next.'
		);
	});
});
