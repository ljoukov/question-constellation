import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	recallCards,
	recallCurriculumTopics,
	recallKindLabels,
	recallMemoryTipById,
	recallSubjects,
	type RecallSubject
} from './aqaScienceRecall';

describe('AQA science recall curriculum', () => {
	it('uses unique card ids and valid topic links', () => {
		const cardIds = new Set<string>();
		const topicIds = new Set(recallCurriculumTopics.map((topic) => topic.id));

		for (const card of recallCards) {
			expect(cardIds.has(card.id), `duplicate recall card id ${card.id}`).toBe(false);
			cardIds.add(card.id);
			expect(topicIds.has(card.topicId), `missing topic for card ${card.id}`).toBe(true);
			expect(card.front.trim()).not.toBe('');
			expect(card.back.trim()).not.toBe('');
			expect(card.sourceUrl).toMatch(/^https:\/\/www\.aqa\.org\.uk\//);
			expect(card.sourceTitle).toContain(`AQA GCSE ${card.subject}`);
			expect(recallKindLabels[card.kind]).toBeTruthy();
		}
	});

	it('covers all science subjects with multiple recall types', () => {
		const subjects = recallSubjects.filter(
			(subject): subject is RecallSubject => subject !== 'All subjects'
		);

		for (const subject of subjects) {
			const subjectCards = recallCards.filter((card) => card.subject === subject);
			expect(subjectCards.length, `${subject} card count`).toBeGreaterThanOrEqual(20);
			expect(
				new Set(subjectCards.map((card) => card.kind)).size,
				`${subject} card kinds`
			).toBeGreaterThanOrEqual(5);
		}
	});

	it('keeps the 76-card fallback identity and curriculum mapping stable', () => {
		const identity = recallCards
			.map(({ id, subject, topicId, specRef }) => ({ id, subject, topicId, specRef }))
			.sort((left, right) => left.id.localeCompare(right.id));

		expect(recallCards).toHaveLength(76);
		expect(createHash('sha256').update(JSON.stringify(identity)).digest('hex')).toBe(
			'162832094db6db66f55beb9ff846cc9faa355127d9850e49ab2b6c3982c3c2d7'
		);
	});

	it('gives every fallback card a concise, distinct second encoding', () => {
		const normalize = (value: string) =>
			value
				.normalize('NFKC')
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, ' ')
				.trim();

		expect(Object.keys(recallMemoryTipById).sort()).toEqual(
			recallCards.map((card) => card.id).sort()
		);
		for (const card of recallCards) {
			expect(card.memoryTip?.trim(), `${card.id} needs a memory tip`).toBeTruthy();
			expect(card.memoryTip?.length, `${card.id} memory tip is too long`).toBeLessThanOrEqual(180);
			expect(normalize(card.memoryTip ?? ''), `${card.id} merely repeats its answer`).not.toBe(
				normalize(card.back)
			);
			expect(
				/[\u2190-\u21ff=|:+×÷↑↓–]/u.test(card.memoryTip ?? ''),
				`${card.id} should use a compact relationship, contrast, or mnemonic encoding`
			).toBe(true);
		}
	});

	it('gives the pilot MCQs concise explanations and feedback for every distractor', () => {
		const pilotIds = ['bio-nucleus-function', 'chem-isotope-definition', 'phys-parallel-pd'];

		for (const id of pilotIds) {
			const card = recallCards.find((candidate) => candidate.id === id);
			expect(card, `missing pilot card ${id}`).toBeDefined();
			expect(card?.explanation?.trim(), `missing explanation for ${id}`).toBeTruthy();
			expect(card?.explanation?.length, `overlong explanation for ${id}`).toBeLessThanOrEqual(180);

			for (const distractor of card?.distractors ?? []) {
				expect(
					card?.choiceFeedback?.[distractor]?.trim(),
					`missing feedback for “${distractor}” on ${id}`
				).toBeTruthy();
			}

			expect(Object.keys(card?.choiceFeedback ?? {}).sort()).toEqual(
				[...(card?.distractors ?? [])].sort()
			);
		}
	});
});
