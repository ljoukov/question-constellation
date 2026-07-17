import { describe, expect, it } from 'vitest';
import curriculumCatalog from '../../../data/curricula/curriculum-catalog.json';
import {
	officialGradeBoundaryContextForOffering,
	supportedGradeBoundaryOfferingIds
} from './officialGradeBoundaryContext';

describe('official June 2024 grade-boundary context', () => {
	it('accounts for every supported catalog offering exactly once', () => {
		const catalogOfferingIds = curriculumCatalog.offerings.map((offering) => offering.id).sort();

		expect(supportedGradeBoundaryOfferingIds()).toEqual(catalogOfferingIds);
		expect(new Set(supportedGradeBoundaryOfferingIds()).size).toBe(17);
		for (const offeringId of catalogOfferingIds) {
			expect(officialGradeBoundaryContextForOffering(offeringId)).not.toBeNull();
		}
	});

	it('preserves exact primary-source provenance', () => {
		const aqa = officialGradeBoundaryContextForOffering('aqa-gcse-biology-8461-v1.0:higher');
		const ocr = officialGradeBoundaryContextForOffering(
			'ocr-gcse-english-literature-j352-v3.0:higher'
		);

		expect(aqa?.source).toMatchObject({
			documentId: 'AQA-GCSE-GDE-BDY-JUN-2024',
			url: 'https://media.aqa.org.uk/over/stat_pdf/AQA-GCSE-GDE-BDY-JUN-2024.PDF',
			sha256: 'a8db6256bf7b47812538e7d00a7b390a8dd0ded3232459109fc88426f4d1ec8f'
		});
		expect(ocr?.source).toMatchObject({
			documentId: '714692',
			url: 'https://www.ocr.org.uk/Images/714692-gcse-grade-boundaries-june-2024.pdf',
			sha256: '7d9db4d9c3c578a168fce759832ce03944b8b77d44d641cacfa88d7e25248d47'
		});
	});

	it('stores tier-aware separate-science totals and Foundation ceilings', () => {
		const foundation = officialGradeBoundaryContextForOffering(
			'aqa-gcse-physics-8463-v1.1:foundation'
		);
		const higher = officialGradeBoundaryContextForOffering('aqa-gcse-physics-8463-v1.1:higher');

		expect(foundation?.boundarySet).toMatchObject({
			qualificationCode: '8463F',
			maximumMark: 200,
			highestPublishedAward: '5',
			lowestPublishedAward: '1',
			thresholds: { '5': 136, '4': 122, '1': 24 }
		});
		expect(foundation?.boundarySet?.thresholds).not.toHaveProperty('6');
		expect(higher?.boundarySet).toMatchObject({
			qualificationCode: '8463H',
			maximumMark: 200,
			thresholds: { '9': 151, '4': 67, '3': 58 }
		});
	});

	it('models Combined Science as one 420-mark double award, never three subject grades', () => {
		for (const subject of ['biology', 'chemistry', 'physics']) {
			const foundation = officialGradeBoundaryContextForOffering(
				`aqa-gcse-combined-science-trilogy-8464-v1.1:${subject}:foundation`
			);
			const higher = officialGradeBoundaryContextForOffering(
				`aqa-gcse-combined-science-trilogy-8464-v1.1:${subject}:higher`
			);

			expect(foundation).toMatchObject({ applicability: 'combined_subject_slice' });
			expect(foundation?.boundarySet).toMatchObject({
				qualificationCode: '8464F',
				awardType: 'double',
				maximumMark: 420,
				highestPublishedAward: '5-5',
				lowestPublishedAward: '1-1',
				thresholds: { '5-5': 266, '1-1': 63 }
			});
			expect(foundation?.boundarySet?.thresholds).not.toHaveProperty('6-6');
			expect(higher?.boundarySet).toMatchObject({
				qualificationCode: '8464H',
				awardType: 'double',
				maximumMark: 420,
				thresholds: { '9-9': 289, '4-3': 83 }
			});
		}
	});

	it('does not fabricate one boundary for a future specification or option-dependent History', () => {
		const computerScience = officialGradeBoundaryContextForOffering(
			'aqa-gcse-computer-science-8525-v1.3-2027:higher'
		);
		const history = officialGradeBoundaryContextForOffering('aqa-gcse-history-8145-v1.3:higher');

		expect(computerScience).toMatchObject({
			applicability: 'future_specification',
			boundarySet: null
		});
		expect(computerScience?.learnerCaveat).toContain('first exams in 2027');
		expect(history).toMatchObject({
			applicability: 'history_option_route',
			boundarySet: null
		});
		expect(history?.learnerCaveat).toContain('exact History option route');
	});

	it('stores exact overall totals for the supported untiered qualifications', () => {
		expect(
			officialGradeBoundaryContextForOffering('aqa-gcse-geography-8035-v1.1:higher')?.boundarySet
		).toMatchObject({ qualificationCode: '8035', maximumMark: 252, thresholds: { '9': 202 } });
		expect(
			officialGradeBoundaryContextForOffering('ocr-gcse-english-language-j351-v2.0:higher')
				?.boundarySet
		).toMatchObject({ qualificationCode: 'J351', maximumMark: 160, thresholds: { '9': 130 } });
		expect(
			officialGradeBoundaryContextForOffering('ocr-gcse-english-literature-j352-v3.0:higher')
				?.boundarySet
		).toMatchObject({ qualificationCode: 'J352', maximumMark: 160, thresholds: { '9': 133 } });
	});
});
