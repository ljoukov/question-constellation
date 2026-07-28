import { describe, expect, it } from 'vitest';
import {
	buildAuthoredChallengeChain,
	publicChallengeDefinition,
	publicChallengePreviewDefinition,
	publicNextChallengeDefinition
} from './authoredData';
import { challengeDefinitionFixture } from './testFixtures';

describe('authored challenge route data', () => {
	const firstChallenge = challengeDefinitionFixture();
	const secondChallenge = challengeDefinitionFixture({
		id: 'physics-fixture-b',
		slug: 'fixture-b',
		subject: 'physics',
		subjectArtTheme: 'forces-motion'
	});

	it('builds a stable method without imported question rows', () => {
		const chain = buildAuthoredChallengeChain(firstChallenge);

		expect(chain.id).toBe(`${firstChallenge.id}-authored-method`);
		expect(chain.title).toBe(firstChallenge.memoryHandle);
		expect(chain.modelAnswer).toBe(firstChallenge.staticAnswers[firstChallenge.strongerAnswer]);
		expect(chain.steps.length).toBeGreaterThan(0);
		expect(chain.steps.map((step) => step.short).join(' → ')).toBe(firstChallenge.memoryHandle);
		expect(chain.illustration).toBeNull();
	});

	it('does not expose catalogue copy or optional paper provenance in the leaf-game payload', () => {
		const challenge = challengeDefinitionFixture({
			sourceQuestionId: 'internal-source',
			transferQuestionId: 'internal-transfer'
		});
		const publicChallenge = publicChallengeDefinition(challenge);

		expect(publicChallenge).not.toHaveProperty('hook');
		expect(publicChallenge).not.toHaveProperty('sourceQuestionId');
		expect(publicChallenge).not.toHaveProperty('transferQuestionId');
		expect(publicChallenge.id).toBe(challenge.id);
		expect(publicChallenge.previewQuestion).toBe(challenge.previewQuestion);
	});

	it('allowlists catalogue-card fields without serialising answer keys or feedback', () => {
		const preview = publicChallengePreviewDefinition(firstChallenge);

		expect(Object.keys(preview).sort()).toEqual(
			[
				'cardArt',
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
		expect(preview.hook).toBe(firstChallenge.hook);
		expect(preview.cardArt).toBeNull();
	});

	it('serialises only the safe fields needed to plan and explain the next challenge', () => {
		const next = publicNextChallengeDefinition(secondChallenge);

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
