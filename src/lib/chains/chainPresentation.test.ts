import { describe, expect, it } from 'vitest';
import type { ChainIllustration } from './chainIllustration';
import { hasExplainedWeakAnswer, useIllustratedChainLayout } from './chainPresentation';

const illustration: ChainIllustration = {
	id: 'test-illustration',
	src: '/images/chains/test.webp',
	lightSrc: '/images/chains/test-light.webp',
	alt: 'A four-step answer chain.',
	caption: 'One → two → three → four.',
	width: 1600,
	height: 900
};

describe('chain presentation', () => {
	it('uses the focused illustration layout for non-English subjects with an image', () => {
		expect(useIllustratedChainLayout('Biology', illustration)).toBe(true);
		expect(useIllustratedChainLayout('Combined Science', illustration)).toBe(true);
	});

	it('keeps the text-chain layout when no image is available', () => {
		expect(useIllustratedChainLayout('Biology', null)).toBe(false);
	});

	it('keeps English on its existing layout even if an image is added later', () => {
		expect(useIllustratedChainLayout('English Language', illustration)).toBe(false);
		expect(useIllustratedChainLayout('English Literature', illustration)).toBe(false);
	});

	it('only shows a weak-answer callout when it includes useful explanation', () => {
		expect(
			hasExplainedWeakAnswer('It decreases the voltage.', 'The transformer steps it up.')
		).toBe(true);
		expect(hasExplainedWeakAnswer('Names the topic.', '')).toBe(false);
		expect(hasExplainedWeakAnswer('', 'Missing the causal link.')).toBe(false);
	});
});
