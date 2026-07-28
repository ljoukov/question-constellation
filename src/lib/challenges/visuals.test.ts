import { describe, expect, it } from 'vitest';
import {
	assertFinalChallengeArtOwnership,
	type ChallengeCardArt,
	type ChallengeVisualDefinition
} from './visuals';

function fixtureCardArt(id: string, revision = ''): ChallengeCardArt {
	return {
		src: `https://assets.example.test/${id}-light.webp${revision}`,
		darkSrc: `https://assets.example.test/${id}-dark.webp${revision}`,
		alt: `${id} synthetic art`,
		width: 1600,
		height: 900
	};
}

function fixtureVisual(cardArt: ChallengeCardArt): ChallengeVisualDefinition {
	return {
		segments: ['Observe', 'Connect', 'Apply'],
		decisiveIndex: 1,
		decisiveLabel: 'Connect the evidence.',
		cardArt
	};
}

describe('challenge art ownership', () => {
	it('accepts one complete primary pair per challenge', () => {
		const ownership = assertFinalChallengeArtOwnership([
			{ id: 'challenge-one', visual: fixtureVisual(fixtureCardArt('one')) },
			{ id: 'challenge-two', visual: fixtureVisual(fixtureCardArt('two')) }
		]);

		expect(ownership.filter((pair) => pair.roles.includes('primary'))).toHaveLength(2);
	});

	it('rejects cross-challenge pair reuse without rejecting same-challenge reuse', () => {
		const sharedPrimary = fixtureCardArt('shared-primary', '?rev=one');
		const sameFilesWithAnotherRevision = fixtureCardArt('shared-primary', '?rev=two');
		const firstVisual = {
			...fixtureVisual(sharedPrimary),
			transferArt: sameFilesWithAnotherRevision
		};

		expect(() =>
			assertFinalChallengeArtOwnership([{ id: 'challenge-one', visual: firstVisual }])
		).not.toThrow();
		expect(() =>
			assertFinalChallengeArtOwnership([
				{ id: 'challenge-one', visual: firstVisual },
				{ id: 'challenge-two', visual: fixtureVisual(sameFilesWithAnotherRevision) }
			])
		).toThrow(/shared across challenge-one and challenge-two/);
	});

	it('rejects missing or incomplete primary pairs', () => {
		expect(() =>
			assertFinalChallengeArtOwnership([
				{
					id: 'missing-primary',
					visual: {
						segments: ['Observe', 'Connect', 'Apply'],
						decisiveIndex: 1,
						decisiveLabel: 'Connect the evidence.'
					}
				}
			])
		).toThrow(/exactly one primary light\/dark art pair/);

		expect(() =>
			assertFinalChallengeArtOwnership([
				{
					id: 'incomplete-primary',
					visual: fixtureVisual({
						src: 'https://assets.example.test/light.webp',
						alt: 'Synthetic art',
						width: 1600,
						height: 900
					})
				}
			])
		).toThrow(/distinct light\/dark pair/);
	});
});
