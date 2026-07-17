import { describe, expect, it } from 'vitest';
import { estimateGradeableMarks } from './questionExperimentGrading';

function estimate({
	maxMarks = 4,
	markScheme = [],
	checklist = [],
	modelAnswer = null,
	chain = null,
	answerKeys = []
}: Partial<Parameters<typeof estimateGradeableMarks>[0]> = {}) {
	return estimateGradeableMarks({
		maxMarks,
		markScheme,
		checklist,
		modelAnswer,
		chain,
		answerKeys
	});
}

describe('question-experiment grading coverage', () => {
	it('does not treat one one-mark source row as complete support for a four-mark answer', () => {
		expect(
			estimate({
				markScheme: [{ marks: 1 }] as Parameters<typeof estimateGradeableMarks>[0]['markScheme']
			})
		).toBe(1);
	});

	it('recognizes exact mark totals from official rows or reviewed checklist criteria', () => {
		expect(
			estimate({
				markScheme: [{ marks: 4 }] as Parameters<typeof estimateGradeableMarks>[0]['markScheme']
			})
		).toBe(4);
		expect(
			estimate({
				checklist: Array.from({ length: 4 }, (_, index) => ({
					id: `criterion-${index}`,
					required: 1
				})) as Parameters<typeof estimateGradeableMarks>[0]['checklist']
			})
		).toBe(4);
	});

	it('does not infer official mark coverage from a model answer or answer-chain alone', () => {
		expect(estimate({ modelAnswer: 'A plausible complete response.' })).toBe(0);
		expect(
			estimate({
				chain: { steps: [{ id: 'step-1' }] } as Parameters<
					typeof estimateGradeableMarks
				>[0]['chain']
			})
		).toBe(0);
	});

	it('counts non-deterministic answer keys only to their evidenced target count', () => {
		expect(
			estimate({
				answerKeys: [{ target_id: 'answer' }] as Parameters<
					typeof estimateGradeableMarks
				>[0]['answerKeys']
			})
		).toBe(1);
	});
});
