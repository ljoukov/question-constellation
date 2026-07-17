import { describe, expect, it } from 'vitest';
import { deriveCheckedAnswerPerformance } from './workingGradeEstimate';

function attempt(questionId: string, awardedMarks: number, maxMarks: number) {
	return { questionId, awardedMarks, maxMarks };
}

describe('checked-answer performance', () => {
	it('does not turn recall-only topic coverage into exam performance', () => {
		expect(
			deriveCheckedAnswerPerformance({
				attempts: [],
				observedTopicCount: 4,
				includedTopicCount: 7
			})
		).toEqual({
			label: 'Checked-answer summary not ready',
			detail:
				'Recall and guided work can choose what to practise, but they do not measure independent exam performance. Check a few independent exam answers to start a mark-rate summary.',
			value: null
		});
	});

	it('abstains while independent exam evidence is too narrow', () => {
		const performance = deriveCheckedAnswerPerformance({
			attempts: [attempt('q-1', 4, 6), attempt('q-2', 3, 4)],
			observedTopicCount: 1,
			includedTopicCount: 7
		});

		expect(performance.label).toBe('Checked-answer summary building');
		expect(performance.value).toBeNull();
		expect(performance.detail).toContain('2 independent checked questions');
		expect(performance.detail).toContain('unassessed topics remain unknown');
	});

	it('reports the exact mark rate without claiming a predicted grade', () => {
		const performance = deriveCheckedAnswerPerformance({
			attempts: [
				attempt('q-1', 4, 6),
				attempt('q-2', 3, 4),
				attempt('q-3', 5, 6),
				attempt('q-4', 2, 4)
			],
			observedTopicCount: 2,
			includedTopicCount: 7,
			offeringId: 'aqa-gcse-biology-8461-v1.0:higher'
		});

		expect(performance).toMatchObject({
			label: 'Checked-answer mark rate',
			value: '14/20 marks · 70%'
		});
		expect(performance.detail).toContain('4 independent checked questions across 2 of 7');
		expect(performance.detail).toContain('AQA 8461H');
		expect(performance.detail).toContain('complete 200-mark qualification total');
		expect(performance.detail).toContain('cannot convert this question sample to a GCSE grade');
		expect(performance.detail).toContain('5 unassessed topics remain unknown');
		expect(`${performance.label} ${performance.value}`).not.toMatch(/predicted grade/i);
	});

	it('uses only the latest supplied result for each question', () => {
		const performance = deriveCheckedAnswerPerformance({
			attempts: [
				attempt('q-1', 6, 6),
				attempt('q-1', 0, 6),
				attempt('q-2', 4, 4),
				attempt('q-3', 4, 4)
			],
			observedTopicCount: 2,
			includedTopicCount: 2
		});

		expect(performance.detail).toContain('3 independent checked questions');
		expect(performance.detail).not.toContain('4 independent checked questions');
		expect(performance.value).toBe('14/14 marks · 100%');
	});

	it('explains why one Combined Science subject cannot yield a double grade', () => {
		const performance = deriveCheckedAnswerPerformance({
			attempts: [attempt('q-1', 6, 6), attempt('q-2', 6, 6), attempt('q-3', 6, 6)],
			observedTopicCount: 2,
			includedTopicCount: 2,
			offeringId: 'aqa-gcse-combined-science-trilogy-8464-v1.1:biology:foundation'
		});

		expect(performance.value).toBe('18/18 marks · 100%');
		expect(performance.detail).toContain('AQA 8464F');
		expect(performance.detail).toContain('double grade from all six papers (420 marks)');
		expect(performance.detail).toContain('subject-only sample');
	});

	it('does not reuse a 2024 boundary for the supported 2027 Computer Science course', () => {
		const performance = deriveCheckedAnswerPerformance({
			attempts: [attempt('q-1', 4, 4), attempt('q-2', 4, 4), attempt('q-3', 4, 4)],
			observedTopicCount: 2,
			includedTopicCount: 2,
			offeringId: 'aqa-gcse-computer-science-8525-v1.3-2027:higher'
		});

		expect(performance.detail).toContain('first exams in 2027');
		expect(performance.detail).toContain('no applicable June 2024 grade boundary');
	});
});
