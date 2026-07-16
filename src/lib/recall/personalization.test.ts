import { describe, expect, it } from 'vitest';
import type { RecallCard } from './aqaScienceRecall';
import { recallCardContentKey } from './contentIdentity';
import { rankCanonicalRecallCards, recallChoiceDiagnostic } from './personalization';

function card(id: string): RecallCard {
	return {
		id,
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		topicId: 'biology-cell-biology',
		specRef: '4.1.1',
		kind: 'fact',
		visualCue: '🔬',
		front: `Question ${id}`,
		back: `Answer ${id}`,
		distractors: [`Wrong ${id}`],
		choiceKeys: { [`Answer ${id}`]: 'correct', [`Wrong ${id}`]: 'confused-location' },
		choiceMisconceptions: { [`Wrong ${id}`]: 'Confuses the location of the structure.' },
		sourceUrl: 'https://example.test/specification',
		sourceTitle: 'Official specification',
		offeringId: 'offering',
		curriculumComponentId: `component-${id}`,
		topicComponentId: 'topic',
		contentRevision: 1,
		contentHash: id.repeat(64).slice(0, 64)
	};
}

describe('canonical recall personalisation', () => {
	it('resolves choice meaning from canonical data and rejects spoofed keys', () => {
		const current = card('a');
		expect(recallChoiceDiagnostic(current, 'confused-location')).toEqual({
			key: 'confused-location',
			text: 'Wrong a',
			isCorrect: false,
			misconception: 'Confuses the location of the structure.'
		});
		expect(recallChoiceDiagnostic(current, 'correct')).toMatchObject({ isCorrect: true });
		expect(recallChoiceDiagnostic(current, 'invented-by-client')).toBeNull();
	});

	it('prioritises repeated misconceptions, then wrong answers, then due work', () => {
		const cards = [card('a'), card('b'), card('c'), card('d')];
		const now = Date.UTC(2026, 6, 15);
		const progress = {
			[recallCardContentKey(cards[0])]: {
				seenCount: 1,
				dueAt: now - 1,
				lastSeenAt: now - 100,
				wrongChoiceCount: 0,
				repeatedMisconceptionCount: 0
			},
			[recallCardContentKey(cards[1])]: {
				seenCount: 2,
				dueAt: now + 100_000,
				lastSeenAt: now - 50,
				wrongChoiceCount: 2,
				repeatedMisconceptionCount: 2
			},
			[recallCardContentKey(cards[2])]: {
				seenCount: 1,
				dueAt: now + 100_000,
				lastSeenAt: now - 25,
				wrongChoiceCount: 1,
				repeatedMisconceptionCount: 1
			}
		};

		expect(rankCanonicalRecallCards(cards, progress, now).map((item) => item.id)).toEqual([
			'b',
			'c',
			'd',
			'a'
		]);
	});

	it('preserves canonical order when no personal evidence is available', () => {
		const cards = [card('c'), card('a'), card('b')];
		expect(rankCanonicalRecallCards(cards, {}, Date.UTC(2026, 6, 15))).toEqual(cards);
	});
});
