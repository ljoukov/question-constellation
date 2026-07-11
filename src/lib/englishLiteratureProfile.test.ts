import { describe, expect, it } from 'vitest';
import {
	emptyOcrEnglishLiteratureSelections,
	parseOcrEnglishLiteratureSelections
} from './englishLiteratureProfile';

describe('OCR English Literature profile selections', () => {
	it('accepts one valid option from each J352 group', () => {
		expect(
			parseOcrEnglishLiteratureSelections({
				modernText: 'Animal Farm',
				nineteenthCenturyNovel: 'A Christmas Carol',
				poetryCluster: 'Conflict',
				shakespearePlay: 'Macbeth'
			})
		).toEqual({
			modernText: 'Animal Farm',
			nineteenthCenturyNovel: 'A Christmas Carol',
			poetryCluster: 'Conflict',
			shakespearePlay: 'Macbeth'
		});
	});

	it('keeps unanswered selections empty instead of guessing the school choices', () => {
		expect(
			parseOcrEnglishLiteratureSelections({
				modernText: '',
				nineteenthCenturyNovel: null,
				poetryCluster: '',
				shakespearePlay: null
			})
		).toEqual({
			modernText: null,
			nineteenthCenturyNovel: null,
			poetryCluster: null,
			shakespearePlay: null
		});
		expect(emptyOcrEnglishLiteratureSelections().specificationCode).toBe('J352');
	});

	it('rejects values outside the current OCR option lists', () => {
		expect(
			parseOcrEnglishLiteratureSelections({
				modernText: 'Animal Farm',
				nineteenthCenturyNovel: 'A Christmas Carol',
				poetryCluster: 'Power and Conflict',
				shakespearePlay: 'Macbeth'
			})
		).toBeNull();
	});
});
