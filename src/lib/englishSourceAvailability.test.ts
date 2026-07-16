import { describe, expect, it } from 'vitest';
import { shouldShowEnglishSourcePaper } from './englishSourceAvailability';

const sourcePaperUrl = 'https://example.test/official-paper.pdf';

describe('shouldShowEnglishSourcePaper', () => {
	it('shows the official paper to a signed-in learner when a short prompt refers to a missing extract', () => {
		expect(
			shouldShowEnglishSourcePaper({
				sourcePaperUrl,
				signedIn: true,
				prompt: 'How does Dickens present Pip and Joe in this extract and elsewhere in the novel?',
				context: 'In this extract, Joe has come to London to visit Pip.',
				hasAssets: false
			})
		).toBe(true);
	});

	it('shows the official paper for a two-extract comparison', () => {
		expect(
			shouldShowEnglishSourcePaper({
				sourcePaperUrl,
				signedIn: true,
				prompt: 'Compare how family tension is presented in these two extracts.',
				context: 'For part (a), focus only on the extracts here.',
				hasAssets: false
			})
		).toBe(true);
	});

	it('does not repeat a source-paper link when the extract is embedded', () => {
		expect(
			shouldShowEnglishSourcePaper({
				sourcePaperUrl,
				signedIn: true,
				prompt: 'How does the writer present the relationship in this extract?',
				context: `Printed extract: ${'Joe greets Pip warmly. '.repeat(30)}`,
				hasAssets: false
			})
		).toBe(false);
	});

	it('treats source assets as embedded material', () => {
		expect(
			shouldShowEnglishSourcePaper({
				sourcePaperUrl,
				signedIn: true,
				prompt: 'Compare the two poems shown in the extracts.',
				context: '',
				hasAssets: true
			})
		).toBe(false);
	});

	it('does not add an acquisition-style paper link to a self-contained signed-in task', () => {
		expect(
			shouldShowEnglishSourcePaper({
				sourcePaperUrl,
				signedIn: true,
				prompt: 'Write a speech arguing your point of view.',
				context: '',
				hasAssets: false
			})
		).toBe(false);
	});

	it('preserves the existing public source-paper link behavior', () => {
		expect(
			shouldShowEnglishSourcePaper({
				sourcePaperUrl,
				signedIn: false,
				prompt: 'Write a speech.',
				context: '',
				hasAssets: false
			})
		).toBe(true);
	});
});
