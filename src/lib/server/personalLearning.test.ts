import { describe, expect, it } from 'vitest';
import type { PracticePageData } from './questionData';
import {
	isQuestionInGapScope,
	questionAttemptFollowUpKind,
	type GapFollowUpScope
} from './personalLearning';

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

describe('science attempt follow-up routing', () => {
	it.each([
		{ marks: 3, expected: 'recall' },
		{ marks: 4, expected: 'close_gap' },
		{ marks: 6, expected: 'close_gap' },
		{ marks: 7, expected: 'none' }
	] as const)('routes a $marks-mark causal question to $expected', ({ marks, expected }) => {
		expect(
			questionAttemptFollowUpKind({
				subject: 'Biology',
				marks,
				chainStepCount: 4,
				chainTitle: 'Cause to process to effect'
			})
		).toBe(expected);
	});

	it('keeps short or explicitly recall-shaped chains out of close-gap practice', () => {
		expect(
			questionAttemptFollowUpKind({
				subject: 'Chemistry',
				marks: 4,
				chainStepCount: 2,
				chainTitle: 'Short chain'
			})
		).toBe('recall');
		expect(
			questionAttemptFollowUpKind({
				subject: 'Physics',
				marks: 6,
				chainStepCount: 4,
				chainTitle: 'Recall the named structure'
			})
		).toBe('recall');
	});

	it('never creates the science close-gap flow for another subject', () => {
		expect(
			questionAttemptFollowUpKind({
				subject: 'Geography',
				marks: 4,
				chainStepCount: 4,
				chainTitle: 'Cause to process to effect'
			})
		).toBe('none');
	});

	it('keeps the mark range authoritative even for recall-shaped outliers', () => {
		expect(
			questionAttemptFollowUpKind({
				subject: 'Physics',
				marks: 7,
				chainStepCount: 2,
				chainTitle: 'Recall a named law'
			})
		).toBe('none');
		expect(
			questionAttemptFollowUpKind({
				subject: 'Biology',
				marks: 0,
				chainStepCount: 1,
				chainTitle: 'Recall a named structure'
			})
		).toBe('none');
	});
});
