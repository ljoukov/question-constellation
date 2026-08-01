import { describe, expect, it } from 'vitest';
import { challengeDefinitionFixture } from '$lib/challenges/testFixtures';
import {
	buildChallengeExplanationPrompt,
	validateChallengeExplanationOutput
} from './challengeExplanation';

describe('challenge model explanations', () => {
	it('grounds the model in the question without sending either answer choice', () => {
		const challenge = challengeDefinitionFixture({
			previewQuestion: 'Explain why the magnetic field in a transformer core must change.',
			staticAnswers: {
				a: 'The hidden weak answer text.',
				b: 'The hidden stronger answer text.'
			}
		});
		const prompt = buildChallengeExplanationPrompt(challenge);

		expect(prompt).toContain(challenge.previewQuestion);
		expect(prompt).toContain('Teach the prerequisite idea');
		expect(prompt).not.toContain(challenge.staticAnswers.a);
		expect(prompt).not.toContain(challenge.staticAnswers.b);
		expect(prompt).not.toContain(challenge.showdownExplanation);
	});

	it('accepts a concise teaching explanation that returns the learner to the task', () => {
		const output = `Alternating current repeatedly changes direction. That means the magnetic
		field made by the primary coil also changes instead of staying fixed. The iron core carries
		that changing field through the secondary coil.

		A changing magnetic field can induce a potential difference in a nearby coil because the
		magnetic environment through that coil is continually changing. A steady field does not keep
		producing the same induction effect. Now look for a response that follows those changes in order.`;

		expect(validateChallengeExplanationOutput(output)).toBe(output);
	});

	it('rejects output that points to an answer label', () => {
		const output = `${'The field changes because the current repeatedly reverses direction. '.repeat(8)}Now look for Answer B.`;
		expect(() => validateChallengeExplanationOutput(output)).toThrow(
			'referred to an answer choice'
		);
	});
});
