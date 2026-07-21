import { describe, expect, it } from 'vitest';
import { emptyOcrEnglishLiteratureSelections } from './englishLiteratureProfile';
import {
	buildOcrEnglishLiteratureHub,
	ocrLiteratureSelectionSummary,
	type OcrLiteratureQuestionSource
} from './englishLiteratureHub';

const selections = {
	...emptyOcrEnglishLiteratureSelections(),
	modernText: 'Animal Farm',
	nineteenthCenturyNovel: 'A Christmas Carol',
	poetryCluster: 'Conflict',
	shakespearePlay: 'Macbeth'
};

function question(overrides: Partial<OcrLiteratureQuestionSource>): OcrLiteratureQuestionSource {
	return {
		id: 'question',
		slug: null,
		title: 'Question title',
		preview: 'Question preview',
		board: 'OCR',
		subject: 'English Literature',
		paper: 'Paper',
		componentCode: 'J352/01',
		series: 'June 2024',
		year: 2024,
		topicPath: [],
		sourceRef: '03.1a',
		marks: 20,
		practiceAvailable: true,
		practiceUnavailableReason: null,
		...overrides
	};
}

describe('OCR English Literature course hub', () => {
	it('keeps only questions for the four selected course options', () => {
		const hub = buildOcrEnglishLiteratureHub(selections, [
			question({ id: 'animal', topicPath: ['Modern prose', 'Animal Farm'] }),
			question({ id: 'inspector', sourceRef: '04.1a', topicPath: ['An Inspector Calls'] }),
			question({
				id: 'carol',
				componentCode: 'J352/12',
				year: 2022,
				sourceRef: '11.0',
				marks: 40,
				topicPath: ['19th century prose', 'A Christmas Carol']
			}),
			question({
				id: 'conflict',
				componentCode: 'J352/02',
				sourceRef: '02.1a',
				topicPath: ['Poetry across time', 'Conflict']
			}),
			question({
				id: 'macbeth',
				componentCode: 'J352/22',
				year: 2021,
				sourceRef: '05.0',
				marks: 40,
				topicPath: ['Shakespeare', 'Macbeth']
			})
		]);

		expect(hub.sections.map((section) => section.questions.map((item) => item.id))).toEqual([
			['animal'],
			['carol'],
			['conflict'],
			['macbeth']
		]);
		expect(hub.questionCount).toBe(4);
		expect(hub.availableQuestionCount).toBe(4);
	});

	it('keeps quarantined rows viewable but never prioritises them as a practice choice', () => {
		const hub = buildOcrEnglishLiteratureHub(selections, [
			question({
				id: 'missing-extract',
				year: 2024,
				topicPath: ['Modern prose', 'Animal Farm'],
				practiceAvailable: false,
				practiceUnavailableReason: 'Official extracts are still being reviewed.'
			}),
			question({
				id: 'reviewed-whole-text',
				year: 2023,
				topicPath: ['Modern prose', 'Animal Farm']
			})
		]);

		expect(hub.sections[0].questions.map((item) => item.id)).toEqual([
			'reviewed-whole-text',
			'missing-extract'
		]);
		expect(hub.availableQuestionCount).toBe(1);
		expect(hub.unavailableQuestionCount).toBe(1);
	});

	it('labels essay formats and older assessment material honestly', () => {
		const hub = buildOcrEnglishLiteratureHub(selections, [
			question({
				id: 'poetry-old',
				componentCode: 'J352/21',
				year: 2022,
				sourceRef: '02.2',
				topicPath: ['Conflict']
			}),
			question({
				id: 'macbeth-current',
				componentCode: 'J352/02',
				sourceRef: '09.1',
				marks: 40,
				topicPath: ['Macbeth']
			})
		]);

		const poetryQuestion = hub.sections[2].questions[0];
		const shakespeareQuestion = hub.sections[3].questions[0];
		expect(poetryQuestion.formatNote).toBe('Earlier anthology');
		expect(poetryQuestion.questionType).toBe('Anthology poem response');
		expect(shakespeareQuestion.questionType).toBe('Whole-play essay');
	});

	it('summarises complete and incomplete profiles for the home card', () => {
		expect(ocrLiteratureSelectionSummary(selections)).toContain('Animal Farm');
		expect(
			ocrLiteratureSelectionSummary({
				modernText: 'Animal Farm',
				nineteenthCenturyNovel: null,
				poetryCluster: null,
				shakespearePlay: null
			})
		).toBe('1 of 4 set texts chosen · finish your profile');
	});
});
