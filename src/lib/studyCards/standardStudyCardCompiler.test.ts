import { describe, expect, it } from 'vitest';
import {
	isKebabCaseStudyCardKey,
	normalizeReviewedChoiceKeys,
	partitionStandardStudyCardCandidates,
	STANDARD_STUDY_CARD_PROMPT_VERSION,
	standardStudyCardMemoryTipIssue,
	standardStudyCardSourceExcerptIssue
} from '../../../scripts/lib/standard-study-card-compiler.mjs';

describe('standard study-card compiler choice identities', () => {
	it('versions the prospective nullable-memory and retained-valid-row prompt as v5', () => {
		expect(STANDARD_STUDY_CARD_PROMPT_VERSION).toBe('standard-study-card-compiler-v5');
	});

	it('requires one short character-for-character source substring', () => {
		const source = 'First official line.\nSecond official line.\nThird official line.';
		expect(standardStudyCardSourceExcerptIssue(source, 'Second official line.')).toBeNull();
		expect(
			standardStudyCardSourceExcerptIssue(source, 'First official line.\nThird official line.')
		).toMatch(/not one exact contiguous substring/);
		expect(
			standardStudyCardSourceExcerptIssue(source, 'First official line. Second official line.')
		).toMatch(/not one exact contiguous substring/);
		expect(
			standardStudyCardSourceExcerptIssue(source, `Second${String.fromCharCode(0)} official line.`)
		).toMatch(/unsafe control/);
		expect(standardStudyCardSourceExcerptIssue('x'.repeat(401), 'x'.repeat(401))).toMatch(
			/exceeds 400/
		);
	});

	it('allows no memory tip when an honest retrieval route would be contrived', () => {
		expect(standardStudyCardMemoryTipIssue(null)).toBeNull();
		expect(standardStudyCardMemoryTipIssue('Anchor the process to its first stage.')).toBeNull();
		expect(standardStudyCardMemoryTipIssue('')).toMatch(/null or a non-empty string/);
	});

	it('derives stable durable keys without changing reviewed choice content or order', () => {
		const choices = ['First', 'Second', 'Third', 'Fourth'].map((text, index) => ({
			key: String.fromCharCode('A'.charCodeAt(0) + index),
			text,
			isCorrect: index === 2,
			feedback: `Feedback ${index}`,
			misconception: index === 2 ? null : `Misconception ${index}`
		}));

		const normalized = normalizeReviewedChoiceKeys(choices);

		expect(normalized.map((choice) => choice.key)).toEqual(['a', 'b', 'c', 'd']);
		const withoutKeys = (rows: Array<Record<string, unknown>>) =>
			rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'key')));
		expect(withoutKeys(normalized)).toEqual(withoutKeys(choices));
		expect(choices.map((choice) => choice.key)).toEqual(['A', 'B', 'C', 'D']);
	});

	it('recognizes only durable lowercase kebab-case keys', () => {
		expect(isKebabCaseStudyCardKey('choice-a')).toBe(true);
		expect(isKebabCaseStudyCardKey('A')).toBe(false);
		expect(isKebabCaseStudyCardKey('choice_a')).toBe(false);
	});

	it('derives consecutive identities for a reviewed three-choice card', () => {
		const choices = ['Correct', 'Plausible A', 'Plausible B'].map((text) => ({ text }));
		expect(normalizeReviewedChoiceKeys(choices).map((choice) => choice.key)).toEqual([
			'a',
			'b',
			'c'
		]);
		expect(() => normalizeReviewedChoiceKeys(choices.slice(0, 2))).toThrow(/three or four/);
	});

	it('keeps deterministic-valid rows and skips repair when every topic still clears coverage', () => {
		const cards = [
			{ id: 'chem-a', topicComponentId: 'chemistry' },
			{ id: 'chem-b', topicComponentId: 'chemistry' },
			{ id: 'chem-c', topicComponentId: 'chemistry' },
			{ id: 'chem-bad', topicComponentId: 'chemistry' },
			{ id: 'physics-a', topicComponentId: 'physics' },
			{ id: 'physics-b', topicComponentId: 'physics' },
			{ id: 'physics-c', topicComponentId: 'physics' },
			{ id: 'physics-d', topicComponentId: 'physics' }
		];

		const result = partitionStandardStudyCardCandidates({
			cards,
			topicComponentIds: ['chemistry', 'physics'],
			minimumAcceptedPerTopic: 3,
			topicComponentId: (card) => card.topicComponentId,
			validateCard: (card) => {
				if (card.id === 'chem-bad') throw new Error('source excerpt is not exact');
			}
		});

		expect(result.validCards).toHaveLength(7);
		expect(result.invalidCards.map((entry) => entry.card.id)).toEqual(['chem-bad']);
		expect(result.canReviewWithoutRepair).toBe(true);
		expect(result.repairCandidates).toEqual([]);
	});

	it('targets only enough failed identities to restore a topic minimum', () => {
		const cards = [
			{ id: 'chem-a', topicComponentId: 'chemistry' },
			{ id: 'chem-b', topicComponentId: 'chemistry' },
			{ id: 'chem-bad-1', topicComponentId: 'chemistry' },
			{ id: 'chem-bad-2', topicComponentId: 'chemistry' },
			{ id: 'physics-a', topicComponentId: 'physics' },
			{ id: 'physics-b', topicComponentId: 'physics' },
			{ id: 'physics-c', topicComponentId: 'physics' },
			{ id: 'physics-bad', topicComponentId: 'physics' }
		];

		const result = partitionStandardStudyCardCandidates({
			cards,
			topicComponentIds: ['chemistry', 'physics'],
			minimumAcceptedPerTopic: 3,
			topicComponentId: (card) => card.topicComponentId,
			validateCard: (card) => {
				if (card.id.includes('bad')) throw new Error('invalid source evidence');
			}
		});

		expect(result.topicsBelowMinimum).toEqual([
			{ topicComponentId: 'chemistry', validCardCount: 2, missingCardCount: 1 }
		]);
		expect(result.repairCandidates.map((entry) => entry.card.id)).toEqual(['chem-bad-1']);
		expect(result.unrepairableTopics).toEqual([]);
		expect(result.invalidCards.map((entry) => entry.card.id)).toEqual([
			'chem-bad-1',
			'chem-bad-2',
			'physics-bad'
		]);
	});
});
