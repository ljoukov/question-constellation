import { describe, expect, it } from 'vitest';
import {
	gcsePastPaperEntryIndex,
	getGcsePastPaperEntry,
	getGcsePastPaperSubjectPage,
	pastPaperEntryPath,
	pastPaperEntrySlug
} from './gcsePastPapers';

describe('GCSE past paper entry routes', () => {
	it('builds the requested AQA Biology Higher Paper 1 route', () => {
		const page = getGcsePastPaperSubjectPage('aqa', 'biology-higher');
		expect(page).toBeTruthy();
		const entry = page?.entries.find((candidate) => candidate.id.endsWith('2023-june-paper-1'));
		expect(entry).toBeTruthy();

		expect(pastPaperEntrySlug(page!, entry!)).toBe('2023-june-paper-1');
		expect(pastPaperEntryPath(page!, entry!)).toBe(
			'/past-papers/gcse/aqa/biology-higher/2023-june-paper-1'
		);
	});

	it('resolves paper entries by route params', () => {
		const result = getGcsePastPaperEntry('aqa', 'biology-higher', '2023-june-paper-1');
		expect(result?.entry.paper).toBe('Paper 1');
		expect(result?.entry.year).toBe(2023);
		expect(result?.entry.series).toBe('June');
		expect(result?.localPath).toBe('/past-papers/gcse/aqa/biology-higher/2023-june-paper-1');
	});

	it('includes paper-level pages in the generated entry index', () => {
		expect(
			gcsePastPaperEntryIndex.some(
				(entry) => entry.localPath === '/past-papers/gcse/aqa/biology-higher/2023-june-paper-1'
			)
		).toBe(true);
	});
});
