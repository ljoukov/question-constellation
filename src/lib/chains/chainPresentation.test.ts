import { describe, expect, it } from 'vitest';
import {
	hasDistinctMarkingPoints,
	hasExplainedWeakAnswer,
	useFocusedChainLayout
} from './chainPresentation';

describe('chain presentation', () => {
	it('uses the focused answer layout for non-English subjects', () => {
		expect(useFocusedChainLayout('Biology')).toBe(true);
		expect(useFocusedChainLayout('Combined Science')).toBe(true);
	});

	it('uses the same focused answer layout when no image is available', () => {
		expect(useFocusedChainLayout('Biology')).toBe(true);
	});

	it('keeps English on its existing layout', () => {
		expect(useFocusedChainLayout('English Language')).toBe(false);
		expect(useFocusedChainLayout('English Literature')).toBe(false);
	});

	it('only shows a weak-answer callout when it includes useful explanation', () => {
		expect(
			hasExplainedWeakAnswer('It decreases the voltage.', 'The transformer steps it up.')
		).toBe(true);
		expect(hasExplainedWeakAnswer('Names the topic.', '')).toBe(false);
		expect(hasExplainedWeakAnswer('', 'Missing the causal link.')).toBe(false);
	});

	it('does not repeat a method-derived checklist beneath the same method', () => {
		expect(hasDistinctMarkingPoints('method', 5)).toBe(false);
		expect(hasDistinctMarkingPoints('official', 5)).toBe(true);
		expect(hasDistinctMarkingPoints('official', 0)).toBe(false);
	});
});
