import { describe, expect, it } from 'vitest';
import { challengeExplanationParagraphs, parseChallengeExplanation } from './explanations';

describe('challenge explanations', () => {
	it('accepts a bounded model explanation payload', () => {
		expect(
			parseChallengeExplanation({
				explanation: 'A changing field matters because it can induce a potential difference.',
				model: 'chatgpt-gpt-5.5-fast',
				modelVersion: 'test-version'
			})
		).toEqual({
			explanation: 'A changing field matters because it can induce a potential difference.',
			model: 'chatgpt-gpt-5.5-fast',
			modelVersion: 'test-version'
		});
	});

	it('rejects malformed or unbounded payloads', () => {
		expect(parseChallengeExplanation(null)).toBeNull();
		expect(parseChallengeExplanation({ explanation: 'Useful but incomplete.' })).toBeNull();
		expect(
			parseChallengeExplanation({
				explanation: 'x'.repeat(2_001),
				model: 'model',
				modelVersion: 'version'
			})
		).toBeNull();
	});

	it('turns model paragraphs into compact learner-facing blocks', () => {
		expect(challengeExplanationParagraphs(' First idea.\n\n Second\nidea. ')).toEqual([
			'First idea.',
			'Second idea.'
		]);
	});
});
