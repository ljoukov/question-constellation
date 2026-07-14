import { describe, expect, it } from 'vitest';
import type { PracticePageData } from './questionData';
import { isQuestionInGapScope, type GapFollowUpScope } from './personalLearning';

function scienceQuestion({
	id,
	subject = 'Combined Science: Trilogy',
	subjectArea = 'Biology',
	board = 'AQA',
	qualification = 'GCSE',
	tier = 'Higher',
	paper = `${subjectArea} Paper 1`
}: {
	id: string;
	subject?: string;
	subjectArea?: string;
	board?: string;
	qualification?: string;
	tier?: string;
	paper?: string;
}): PracticePageData['question'] {
	return {
		id,
		meta: {
			board,
			qualification,
			subject,
			subjectArea,
			tier,
			paper,
			topic: 'Test topic',
			questionType: 'Explain',
			marks: 4
		}
	} as PracticePageData['question'];
}

const legacyCombinedScope: GapFollowUpScope = {
	board: 'AQA',
	qualification: 'GCSE',
	subject: 'Combined Science',
	course: null,
	tier: 'Higher'
};

describe('gap follow-up question scope', () => {
	it('infers the Biology area and Combined Science course from a legacy source question', () => {
		const source = scienceQuestion({ id: 'source' });

		expect(
			isQuestionInGapScope(
				legacyCombinedScope,
				scienceQuestion({ id: 'same-chain-biology' }),
				source
			)
		).toBe(true);
		expect(
			isQuestionInGapScope(
				legacyCombinedScope,
				scienceQuestion({ id: 'chemistry', subjectArea: 'Chemistry' }),
				source
			)
		).toBe(false);
		expect(
			isQuestionInGapScope(
				legacyCombinedScope,
				scienceQuestion({ id: 'separate-biology', subject: 'Biology' }),
				source
			)
		).toBe(false);
	});

	it('keeps an explicit Separate Science scope separate from Combined Science questions', () => {
		const scope: GapFollowUpScope = {
			...legacyCombinedScope,
			subject: 'Biology',
			course: 'Separate Science'
		};
		const source = scienceQuestion({ id: 'source', subject: 'Biology' });

		expect(
			isQuestionInGapScope(scope, scienceQuestion({ id: 'separate', subject: 'Biology' }), source)
		).toBe(true);
		expect(isQuestionInGapScope(scope, scienceQuestion({ id: 'combined' }), source)).toBe(false);
	});

	it('still enforces board and compatible tier', () => {
		const source = scienceQuestion({ id: 'source' });

		expect(
			isQuestionInGapScope(
				legacyCombinedScope,
				scienceQuestion({ id: 'wrong-board', board: 'Edexcel' }),
				source
			)
		).toBe(false);
		expect(
			isQuestionInGapScope(
				legacyCombinedScope,
				scienceQuestion({ id: 'wrong-tier', tier: 'Foundation' }),
				source
			)
		).toBe(false);
		expect(
			isQuestionInGapScope(
				legacyCombinedScope,
				scienceQuestion({ id: 'both-tiers', tier: 'Foundation and Higher' }),
				source
			)
		).toBe(true);
	});
});
