import { describe, expect, it } from 'vitest';
import { challengeCatalog } from './catalog';
import {
	buildAuthoredChallengeChain,
	publicChallengeDefinition,
	publicChallengePreviewDefinition,
	publicNextChallengeDefinition
} from './authoredData';

describe('authored challenge route data', () => {
	it('builds a stable method for every challenge without imported question rows', () => {
		for (const challenge of challengeCatalog) {
			const chain = buildAuthoredChallengeChain(challenge);

			expect(chain.id).toBe(`${challenge.id}-authored-method`);
			expect(chain.title).toBe(challenge.memoryHandle);
			expect(chain.modelAnswer).toBe(challenge.staticAnswers[challenge.strongerAnswer]);
			expect(chain.steps.length).toBeGreaterThan(0);
			expect(chain.steps.map((step) => step.short).join(' → ')).toBe(challenge.memoryHandle);
			expect(chain.illustration).toBeNull();
		}
	});

	it('does not expose catalogue copy or optional paper provenance in the leaf-game payload', () => {
		for (const challenge of challengeCatalog) {
			const publicChallenge = publicChallengeDefinition(challenge);

			expect(publicChallenge).not.toHaveProperty('hook');
			expect(publicChallenge).not.toHaveProperty('sourceQuestionId');
			expect(publicChallenge).not.toHaveProperty('transferQuestionId');
			expect(publicChallenge.id).toBe(challenge.id);
			expect(publicChallenge.previewQuestion).toBe(challenge.previewQuestion);
		}
	});

	it('allowlists catalogue-card fields without serialising answer keys or feedback', () => {
		const challenge = challengeCatalog[0];
		const preview = publicChallengePreviewDefinition(challenge);

		expect(Object.keys(preview).sort()).toEqual(
			[
				'hook',
				'id',
				'marks',
				'previewQuestion',
				'slug',
				'subject',
				'subjectArtTheme',
				'title',
				'topic'
			].sort()
		);
		expect(preview).not.toHaveProperty('staticAnswers');
		expect(preview).not.toHaveProperty('strongerAnswer');
		expect(preview).not.toHaveProperty('diagnosisChoices');
		expect(preview).not.toHaveProperty('repairChoices');
		expect(preview).not.toHaveProperty('sourceQuestionId');
		expect(preview).not.toHaveProperty('transferQuestionId');
		expect(preview.hook).toBe(challenge.hook);
	});

	it('serialises only the safe fields needed to plan and explain the next challenge', () => {
		const next = publicNextChallengeDefinition(challengeCatalog[1]);

		expect(Object.keys(next).sort()).toEqual(
			[
				'arc',
				'difficulty',
				'estimatedMinutes',
				'id',
				'marks',
				'mechanic',
				'slug',
				'subject',
				'title',
				'topic'
			].sort()
		);
		expect(next).not.toHaveProperty('staticAnswers');
		expect(next).not.toHaveProperty('showdownExplanation');
	});
});
