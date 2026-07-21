import { describe, expect, it } from 'vitest';
import { routeStage } from './journeys';

describe('analytics journey route stages', () => {
	it('classifies the canonical question-first route hierarchy', () => {
		expect(routeStage('/questions')).toBe('Questions');
		expect(routeStage('/questions/question-1')).toBe('Question');
		expect(routeStage('/questions/question-1/answer-chain')).toBe('Answer chain');
		expect(routeStage('/questions/question-1/practice')).toBe('Practice');
		expect(routeStage('/questions/question-1/practice/task')).toBe('Guided practice');
		expect(routeStage('/constellations/chain-1')).toBe('Constellation');
	});

	it('classifies signed-in subject and recall branches', () => {
		expect(routeStage('/challenges')).toBe('Challenges');
		expect(routeStage('/challenges/physics/half-range-uncertainty')).toBe('Challenges');
		expect(routeStage('/subjects/english-literature')).toBe('Subject');
		expect(routeStage('/recall/biology/quick')).toBe('Recall');
	});
});
