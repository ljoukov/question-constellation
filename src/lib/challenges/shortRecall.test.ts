import { describe, expect, it } from 'vitest';
import {
	generateSpellingVariants,
	keyboardNeighbors,
	matchShortRecall,
	normalizeShortRecallAnswer,
	validateShortRecallPrompt
} from './shortRecall';

const prompt = {
	canonicalAnswer: 'activation energy',
	acceptedAliases: ['energy threshold'],
	spellingVariants: generateSpellingVariants(['activation energy', 'energy threshold'])
};

describe('short recall matching', () => {
	it('accepts canonical answers, explicit aliases and harmless leading articles', () => {
		expect(matchShortRecall('Activation energy', prompt)).toMatchObject({
			correct: true,
			kind: 'exact'
		});
		expect(matchShortRecall('the energy threshold', prompt)).toMatchObject({
			correct: true,
			kind: 'alias'
		});
	});

	it('requires reviewed inflections and does not use substring matching', () => {
		expect(
			matchShortRecall('antibodies', {
				canonicalAnswer: 'antibody',
				acceptedAliases: ['antibodies']
			})
		).toMatchObject({ correct: true, kind: 'alias' });
		expect(
			matchShortRecall('mitosi', {
				canonicalAnswer: 'mitosis',
				acceptedAliases: []
			})
		).toMatchObject({ correct: false, kind: 'none' });
		expect(
			matchShortRecall('collision frequency', {
				canonicalAnswer: 'collision',
				acceptedAliases: []
			})
		).toMatchObject({ correct: false, kind: 'none' });
	});

	it('accepts one transposition, omission or neighbouring-key substitution', () => {
		expect(matchShortRecall('acitvation energy', prompt)).toMatchObject({
			correct: true,
			kind: 'spelling'
		});
		expect(matchShortRecall('activtion energy', prompt)).toMatchObject({
			correct: true,
			kind: 'spelling'
		});
		expect(matchShortRecall('activatiom energy', prompt)).toMatchObject({
			correct: true,
			kind: 'spelling'
		});
		expect(keyboardNeighbors('n')).toContain('m');
	});

	it('pre-generates unambiguous slips for three-letter answers', () => {
		const addPrompt = {
			canonicalAnswer: 'add',
			acceptedAliases: ['combine'],
			spellingVariants: generateSpellingVariants(['add', 'combine'])
		};
		expect(matchShortRecall('addd', addPrompt)).toMatchObject({
			correct: true,
			kind: 'spelling'
		});
		expect(matchShortRecall('sdd', addPrompt)).toMatchObject({
			correct: true,
			kind: 'spelling'
		});
		expect(matchShortRecall('ad', addPrompt)).toMatchObject({
			correct: false,
			kind: 'none'
		});
	});

	it('rejects multiple slips, short-word guesses and semantic near misses', () => {
		expect(matchShortRecall('activtion enery', prompt)).toMatchObject({
			correct: false,
			kind: 'none'
		});
		expect(
			matchShortRecall('ax', {
				canonicalAnswer: 'at',
				acceptedAliases: []
			})
		).toMatchObject({ correct: false, kind: 'none' });
		expect(
			matchShortRecall('mars', {
				canonicalAnswer: 'mass',
				acceptedAliases: []
			})
		).toMatchObject({ correct: false, kind: 'none' });
		expect(
			matchShortRecall('photon', {
				canonicalAnswer: 'proton',
				acceptedAliases: []
			})
		).toMatchObject({ correct: false, kind: 'none' });
		expect(matchShortRecall('collision rate', prompt)).toMatchObject({
			correct: false,
			kind: 'none'
		});
	});

	it('normalizes accents and punctuation deterministically', () => {
		expect(normalizeShortRecallAnswer('  The “Café-rate” ')).toBe('cafe rate');
		expect(generateSpellingVariants(['mass'])).toEqual(
			[...generateSpellingVariants(['mass'])].sort()
		);
	});

	it('validates the inspectable prompt contract', () => {
		expect(
			validateShortRecallPrompt({
				challengeId: 'chemistry-temperature-collision-rate',
				stem: 'Particles need enough ___ to react.',
				canonicalAnswer: 'activation energy',
				acceptedAliases: ['energy threshold'],
				preferredHiddenStepIndex: 2
			})
		).toMatchObject({
			challengeId: 'chemistry-temperature-collision-rate',
			canonicalAnswer: 'activation energy'
		});
		expect(
			validateShortRecallPrompt({
				challengeId: 'broken',
				stem: 'Two ___ blanks ___.',
				canonicalAnswer: 'far too many words',
				acceptedAliases: [],
				preferredHiddenStepIndex: -1
			})
		).toBeNull();
	});
});
