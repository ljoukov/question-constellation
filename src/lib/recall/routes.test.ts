import { describe, expect, it } from 'vitest';
import type { RecallCard, RecallRuntimeSubject } from './aqaScienceRecall';
import {
	recallActivityHref,
	recallSessionHref,
	recallSubjectFromSlug,
	recallSubjectSlugs,
	recallTopicsForCards
} from './routes';

describe('generic recall routes', () => {
	it('round-trips all eight supported learner subjects', () => {
		const expected: Array<[RecallRuntimeSubject, string]> = [
			['Biology', 'biology'],
			['Chemistry', 'chemistry'],
			['Physics', 'physics'],
			['Computer Science', 'computer-science'],
			['Geography', 'geography'],
			['History', 'history'],
			['English Language', 'english-language'],
			['English Literature', 'english-literature']
		];
		expect(Object.entries(recallSubjectSlugs)).toEqual(expected);
		for (const [subject, slug] of expected) {
			expect(recallSubjectFromSlug(slug)).toBe(subject);
			expect(recallActivityHref(subject, 'true-false')).toBe(`/recall/${slug}/true-false`);
		}
	});

	it('creates a real true-or-false session URL', () => {
		expect(
			recallSessionHref({
				subject: 'English Literature',
				activity: 'true-false',
				topic: 'ocr-j352-macbeth',
				size: 8
			})
		).toBe(
			'/recall?subject=English+Literature&activity=true-false&size=8&start=1&mode=truefalse&topic=ocr-j352-macbeth'
		);
	});

	it('creates a course-hub return path for Literature study cards', () => {
		expect(
			recallSessionHref({
				subject: 'English Literature',
				activity: 'flashcards',
				size: 10,
				returnTo: '/english-literature'
			})
		).toBe(
			'/recall?subject=English+Literature&activity=flashcards&size=10&start=1&returnTo=%2Fenglish-literature'
		);
	});

	it('derives exact imported topic labels instead of the static science taxonomy', () => {
		const card = {
			id: 'lit-card',
			board: 'OCR',
			qualification: 'GCSE',
			subject: 'English Literature',
			topicId: 'ocr-j352-macbeth',
			topicTitle: 'Macbeth',
			topicPaper: 'Component 01',
			specRef: 'Macbeth.ambition',
			kind: 'quotation',
			visualCue: '📖',
			front: 'Which quotation captures ambition?',
			back: '“Vaulting ambition”',
			distractors: ['“Fair is foul”', '“Out, damned spot!”'],
			choiceKeys: {
				'“Vaulting ambition”': 'vaulting-ambition',
				'“Fair is foul”': 'fair-is-foul',
				'“Out, damned spot!”': 'out-damned-spot'
			},
			sourceUrl: 'https://example.test/macbeth',
			sourceTitle: 'Macbeth',
			offeringId: 'ocr-gcse-english-literature-j352-v3.0:higher',
			curriculumComponentId: 'ocr-j352-macbeth:ambition',
			topicComponentId: 'ocr-j352-macbeth',
			contentRevision: 1,
			contentHash: 'a'.repeat(64)
		} satisfies RecallCard;

		expect(recallTopicsForCards([card, card])).toEqual([
			{
				id: 'ocr-j352-macbeth',
				subject: 'English Literature',
				specRef: 'ocr-j352-macbeth',
				title: 'Macbeth',
				paper: 'Component 01'
			}
		]);
	});
});
