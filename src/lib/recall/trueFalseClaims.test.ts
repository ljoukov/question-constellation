import { describe, expect, it } from 'vitest';
import { balancedTrueFalseClaim } from './trueFalseClaims';

function claim(cardIndex: number, sessionId = 'session-a', sessionSize = 10) {
	const sessionCardKeys = Array.from({ length: sessionSize }, (_, index) => `card-${index}`);
	return balancedTrueFalseClaim({
		answer: `Answer ${cardIndex}`,
		distractors: [`Wrong ${cardIndex}a`, `Wrong ${cardIndex}b`, `Wrong ${cardIndex}c`],
		cardKey: `card-${cardIndex}`,
		sessionId,
		sessionCardKeys
	});
}

describe('balancedTrueFalseClaim', () => {
	it('balances an even session exactly instead of sampling one answer among four choices', () => {
		const claims = Array.from({ length: 10 }, (_, index) => claim(index));
		expect(claims.filter((item) => item.isTrue)).toHaveLength(5);
		expect(claims.filter((item) => !item.isTrue)).toHaveLength(5);
	});

	it('keeps odd sessions within one claim and is deterministic for a session', () => {
		const first = Array.from({ length: 9 }, (_, index) => claim(index, 'session-b', 9));
		const replay = Array.from({ length: 9 }, (_, index) => claim(index, 'session-b', 9));
		expect(replay).toEqual(first);
		expect(Math.abs(first.filter((item) => item.isTrue).length - 4.5)).toBe(0.5);
	});

	it('uses a real distractor for false claims and falls back safely when none exists', () => {
		const falseClaim = Array.from({ length: 10 }, (_, index) => claim(index)).find(
			(item) => !item.isTrue
		);
		expect(falseClaim?.text).toMatch(/^Wrong /);
		expect(
			balancedTrueFalseClaim({
				answer: 'Only supported answer',
				distractors: [],
				cardKey: 'solo',
				sessionId: 'session-a',
				sessionCardKeys: ['solo']
			})
		).toEqual({ text: 'Only supported answer', isTrue: true });
	});
});
