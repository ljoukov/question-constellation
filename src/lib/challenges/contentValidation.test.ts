import { describe, expect, it } from 'vitest';
import { challengeCatalog } from './catalog';
import { validateChallengeTransferVisuals } from './contentValidation';
import type { ChallengeDefinition } from './types';
import { challengeVisual } from './visuals';

describe('challenge transfer solvability', () => {
	it('keeps every published follow-up self-contained or backed by reviewed transfer art', () => {
		const issues = challengeCatalog.flatMap((challenge) =>
			validateChallengeTransferVisuals(challenge, challengeVisual(challenge))
		);

		expect(issues).toEqual([]);
	});

	it('rejects the missing-diagram failure mode', () => {
		const challenge = {
			...challengeCatalog[0],
			id: 'regression-missing-diagram',
			transferPromptLead: 'A diagram shows three cells. Which cell is prokaryotic?'
		} satisfies ChallengeDefinition;

		expect(validateChallengeTransferVisuals(challenge, undefined)).toContainEqual({
			challengeId: 'regression-missing-diagram',
			code: 'missing-transfer-art',
			message:
				'The transfer copy refers to visual material, but the stage has no reviewed transferArt.'
		});
	});

	it('rejects follow-ups that ask for an unsupported drawing interaction', () => {
		const challenge = {
			...challengeCatalog[0],
			id: 'regression-drawing-task',
			transferPromptLead: 'Draw a graph of the values before choosing the conclusion.'
		} satisfies ChallengeDefinition;

		expect(validateChallengeTransferVisuals(challenge, undefined).map(({ code }) => code)).toEqual([
			'unsupported-drawing-task',
			'missing-transfer-art'
		]);
	});
});
