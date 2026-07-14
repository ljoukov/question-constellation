import { describe, expect, it } from 'vitest';
import { enabledProfileCombinationForQuestion } from './profileQuestionCompatibility';

const combinedHigher = {
	subject: 'Biology',
	board: 'AQA',
	qualification: 'GCSE',
	course: 'Combined Science' as const,
	tier: 'Higher' as const,
	enabled: true
};

const combinedQuestion = {
	board: 'AQA',
	qualification: 'GCSE',
	subject: 'Combined Science: Trilogy',
	subjectArea: 'Biology',
	componentCode: '8464/B/1H',
	tier: 'Foundation and Higher'
};

describe('signed-in question/profile compatibility', () => {
	it('attributes a shared-tier question to the learner exact enabled combination', () => {
		expect(enabledProfileCombinationForQuestion([combinedHigher], combinedQuestion)).toBe(
			combinedHigher
		);
	});

	it('rejects a Separate Science question for a Combined Science learner', () => {
		expect(
			enabledProfileCombinationForQuestion([combinedHigher], {
				...combinedQuestion,
				subject: 'Biology',
				componentCode: '8461/1H'
			})
		).toBeNull();
	});

	it('rejects Higher-only evidence for a Foundation learner', () => {
		expect(
			enabledProfileCombinationForQuestion([{ ...combinedHigher, tier: 'Foundation' }], {
				...combinedQuestion,
				tier: 'Higher'
			})
		).toBeNull();
	});

	it('rejects science evidence when tier or course identity is missing', () => {
		expect(
			enabledProfileCombinationForQuestion([combinedHigher], {
				...combinedQuestion,
				tier: null
			})
		).toBeNull();
		expect(
			enabledProfileCombinationForQuestion([combinedHigher], {
				...combinedQuestion,
				subject: null,
				componentCode: null
			})
		).toBeNull();
	});

	it('rejects disabled, wrong-board, and unidentified questions', () => {
		expect(
			enabledProfileCombinationForQuestion(
				[{ ...combinedHigher, enabled: false }],
				combinedQuestion
			)
		).toBeNull();
		expect(
			enabledProfileCombinationForQuestion([combinedHigher], {
				...combinedQuestion,
				board: 'OCR'
			})
		).toBeNull();
		expect(
			enabledProfileCombinationForQuestion([combinedHigher], {
				...combinedQuestion,
				board: null
			})
		).toBeNull();
	});

	it('matches an untiered non-science question to its exact subject and board', () => {
		const history = {
			subject: 'History',
			board: 'AQA',
			qualification: 'GCSE',
			course: 'GCSE Subject' as const,
			tier: 'Higher' as const,
			enabled: true
		};
		expect(
			enabledProfileCombinationForQuestion([history], {
				board: 'aqa',
				qualification: 'gcse',
				subject: 'AQA GCSE History',
				subjectArea: null,
				componentCode: '8145/1A',
				tier: null
			})
		).toBe(history);
	});
});
