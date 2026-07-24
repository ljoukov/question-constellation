import { describe, expect, it } from 'vitest';
import { challengeCatalog, challengesForSubject } from './catalog';
import { bundledShortRecallPrompts } from './shortRecallCatalog';
import {
	generateSpellingVariants,
	matchShortRecall,
	normalizeShortRecallAnswer,
	validateShortRecallPrompt
} from './shortRecall';

describe('short recall prompt catalog', () => {
	it('covers all 92 challenges exactly once and in catalog order', () => {
		expect(bundledShortRecallPrompts.map((prompt) => prompt.challengeId)).toEqual(
			challengeCatalog.map((challenge) => challenge.id)
		);
		expect(new Set(bundledShortRecallPrompts.map((prompt) => prompt.challengeId)).size).toBe(92);
		expect(challengesForSubject('biology')).toHaveLength(30);
		expect(challengesForSubject('chemistry')).toHaveLength(30);
		expect(challengesForSubject('physics')).toHaveLength(32);
	});

	it('keeps every prompt short, inspectable and valid', () => {
		for (const prompt of bundledShortRecallPrompts) {
			expect(validateShortRecallPrompt(prompt), prompt.challengeId).not.toBeNull();
			expect(prompt.stem.match(/___/g), prompt.challengeId).toHaveLength(1);
			for (const answer of [prompt.canonicalAnswer, ...prompt.acceptedAliases]) {
				expect(
					normalizeShortRecallAnswer(answer).split(' ').filter(Boolean).length,
					`${prompt.challengeId}: ${answer}`
				).toBeGreaterThanOrEqual(1);
				expect(
					normalizeShortRecallAnswer(answer).split(' ').filter(Boolean).length,
					`${prompt.challengeId}: ${answer}`
				).toBeLessThanOrEqual(2);
			}
		}
	});

	it('removes generated typo variants that are valid answers elsewhere', () => {
		const accepted = new Set(
			bundledShortRecallPrompts.flatMap((prompt) =>
				[prompt.canonicalAnswer, ...prompt.acceptedAliases].map(normalizeShortRecallAnswer)
			)
		);

		for (const prompt of bundledShortRecallPrompts) {
			const rawVariants = generateSpellingVariants([
				prompt.canonicalAnswer,
				...prompt.acceptedAliases
			]);
			expect(prompt.spellingVariants?.length ?? 0).toBeLessThanOrEqual(rawVariants.length);
			for (const variant of prompt.spellingVariants ?? []) {
				expect(accepted.has(normalizeShortRecallAnswer(variant)), prompt.challengeId).toBe(false);
			}
		}
	});

	it('accepts standard no-space force notation for both zero-resultant prompts', () => {
		for (const challengeId of ['physics-drag-balance', 'physics-exp-tug-of-war-zero-resultant']) {
			const prompt = bundledShortRecallPrompts.find(
				(candidate) => candidate.challengeId === challengeId
			);
			expect(prompt, challengeId).toBeDefined();
			expect(matchShortRecall('0N', prompt!), challengeId).toMatchObject({
				correct: true,
				kind: 'alias'
			});
		}
	});
});
