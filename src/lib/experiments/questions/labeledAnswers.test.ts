import { describe, expect, it } from 'vitest';
import {
	normalizedLabeledAnswerKey,
	parseLabeledAnswerMap,
	serializeLabeledAnswerFields
} from './labeledAnswers';

const fields = [{ label: 'Test' }, { label: 'Colour of positive result' }];

describe('labeled answer serialization', () => {
	it('preserves a trailing space while a learner is typing', () => {
		const serialized = serializeLabeledAnswerFields(fields, {
			Test: 'Benedict’s solution ',
			'Colour of positive result': ''
		});

		expect(serialized).toBe('Test: Benedict’s solution \nColour of positive result:');
		expect(parseLabeledAnswerMap(serialized).get('test')).toBe('Benedict’s solution ');
	});

	it('preserves learner-authored leading spaces and colons', () => {
		const serialized = serializeLabeledAnswerFields(fields, {
			Test: '  ratio 2:1 ',
			'Colour of positive result': 'brick red'
		});
		const parsed = parseLabeledAnswerMap(serialized);

		expect(parsed.get('test')).toBe('  ratio 2:1 ');
		expect(parsed.get('colour of positive result')).toBe('brick red');
	});

	it('normalizes labels without normalizing their values', () => {
		expect(normalizedLabeledAnswerKey(' Colour-of-positive result ')).toBe(
			'colour of positive result'
		);
		expect(parseLabeledAnswerMap('Test: hello world ').get('test')).toBe('hello world ');
	});
});
