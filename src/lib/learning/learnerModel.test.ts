import { describe, expect, it } from 'vitest';
import {
	computeLearnerState,
	evidenceStrength,
	rankCandidateActions,
	type LearnerEvidence,
	type LearningActionCandidate
} from './learnerModel';

const NOW = '2026-07-13T12:00:00.000Z';

function evidence(overrides: Partial<LearnerEvidence> = {}): LearnerEvidence {
	return {
		id: 'evidence-1',
		kind: 'short_constructed',
		outcome: 'correct',
		occurredAt: '2026-07-12T12:00:00.000Z',
		itemId: 'question-1',
		independent: true,
		...overrides
	};
}

function candidate(overrides: Partial<LearningActionCandidate> = {}): LearningActionCandidate {
	return {
		id: 'action-1',
		subject: 'Biology',
		kind: 'recall',
		curriculumComponentId: 'cell-biology',
		componentId: 'cell-division',
		state: 'developing',
		uncertainty: 'medium',
		estimatedMinutes: 5,
		...overrides
	};
}

describe('learner evidence strength', () => {
	it('keeps production and transfer above recognition and self-rating evidence', () => {
		expect(evidenceStrength('independent_transfer_constructed')).toBe(
			evidenceStrength('independent_exam_constructed')
		);
		expect(evidenceStrength('independent_exam_constructed')).toBeGreaterThan(
			evidenceStrength('short_constructed')
		);
		expect(evidenceStrength('short_constructed')).toBeGreaterThan(
			evidenceStrength('multiple_choice')
		);
		expect(evidenceStrength('multiple_choice')).toBeGreaterThan(evidenceStrength('true_false'));
		expect(evidenceStrength('true_false')).toBeGreaterThan(
			evidenceStrength('flashcard_self_rating')
		);
	});
});

describe('computeLearnerState', () => {
	it('reports no evidence without inventing a mastery percentage', () => {
		const result = computeLearnerState([], { now: NOW });
		expect(result.state).toBe('no_evidence');
		expect(result.uncertainty).toBe('high');
		expect(result.nextCheckAt).toBeNull();
		expect(result).not.toHaveProperty('percentage');
	});

	it('does not call recognition or self-rated flashcards secure', () => {
		const result = computeLearnerState(
			[
				evidence({
					id: 'flash-1',
					kind: 'flashcard_self_rating',
					outcome: 'known',
					itemId: 'card-1'
				}),
				evidence({
					id: 'mcq-1',
					kind: 'multiple_choice',
					itemId: 'mcq-1'
				})
			],
			{ now: NOW }
		);
		expect(result.state).toBe('developing');
		expect(result.reasonCode).toBe('recognition_only');
	});

	it('requires repeated independent construction on different items before calling evidence secure', () => {
		const result = computeLearnerState(
			[
				evidence({
					id: 'exam-1',
					kind: 'independent_exam_constructed',
					occurredAt: '2026-07-10T12:00:00.000Z',
					itemId: 'exam-question-1'
				}),
				evidence({
					id: 'transfer-1',
					kind: 'independent_transfer_constructed',
					itemId: 'transfer-question-1'
				})
			],
			{ now: NOW }
		);
		expect(result.state).toBe('secure');
		expect(result.uncertainty).toBe('medium');
		expect(result.distinctItemCount).toBe(2);
		expect(result.nextCheckAt).toBe('2026-08-02T12:00:00.000Z');
	});

	it('does not call same-day successes secure', () => {
		const result = computeLearnerState(
			[
				evidence({
					id: 'exam-morning',
					kind: 'independent_exam_constructed',
					itemId: 'question-a',
					occurredAt: '2026-07-12T08:00:00.000Z'
				}),
				evidence({
					id: 'exam-afternoon',
					kind: 'independent_transfer_constructed',
					itemId: 'question-b',
					occurredAt: '2026-07-12T16:00:00.000Z'
				})
			],
			{ now: NOW }
		);
		expect(result.state).toBe('developing');
		expect(result.uncertainty).not.toBe('low');
	});

	it('lets two later independent successes resolve an earlier contradiction', () => {
		const result = computeLearnerState(
			[
				evidence({
					id: 'initial-correct',
					kind: 'independent_exam_constructed',
					itemId: 'question-a',
					occurredAt: '2026-07-02T12:00:00.000Z'
				}),
				evidence({
					id: 'later-failure',
					kind: 'independent_exam_constructed',
					outcome: 'incorrect',
					itemId: 'question-b',
					occurredAt: '2026-07-05T12:00:00.000Z'
				}),
				evidence({
					id: 'recheck-one',
					kind: 'independent_exam_constructed',
					itemId: 'question-c',
					occurredAt: '2026-07-08T12:00:00.000Z'
				}),
				evidence({
					id: 'recheck-two',
					kind: 'independent_transfer_constructed',
					itemId: 'question-d',
					occurredAt: '2026-07-12T12:00:00.000Z'
				})
			],
			{ now: NOW }
		);
		expect(result.state).toBe('secure');
		expect(result.reasonCode).toBe('repeated_independent_constructed_success');
	});

	it('ignores evidence explicitly superseded by a correction', () => {
		const result = computeLearnerState(
			[
				evidence({
					id: 'bad-import',
					kind: 'independent_exam_constructed',
					outcome: 'incorrect'
				}),
				evidence({
					id: 'correction',
					kind: 'flashcard_self_rating',
					outcome: 'known',
					itemId: 'correction',
					occurredAt: '2026-07-13T06:00:00.000Z',
					supersedesEvidenceId: 'bad-import'
				})
			],
			{ now: NOW }
		);
		expect(result.reasonCode).toBe('recognition_only');
		expect(result.evidenceCount).toBe(1);
	});

	it('does not count retries of the same item as independent secure evidence', () => {
		const result = computeLearnerState(
			[
				evidence({
					id: 'exam-1',
					kind: 'independent_exam_constructed',
					itemId: 'same-question',
					occurredAt: '2026-07-10T12:00:00.000Z'
				}),
				evidence({
					id: 'exam-retry',
					kind: 'independent_exam_constructed',
					itemId: 'same-question'
				})
			],
			{ now: NOW }
		);
		expect(result.state).toBe('developing');
		expect(result.reasonCode).toBe('insufficient_independent_evidence');
	});

	it('surfaces recent contradictory constructed responses instead of averaging them away', () => {
		const result = computeLearnerState(
			[
				evidence({
					id: 'short-correct',
					itemId: 'question-a',
					occurredAt: '2026-07-10T12:00:00.000Z'
				}),
				evidence({
					id: 'exam-incorrect',
					kind: 'independent_exam_constructed',
					outcome: 'incorrect',
					itemId: 'question-b'
				})
			],
			{ now: NOW }
		);
		expect(result.state).toBe('conflicting');
		expect(result.uncertainty).toBe('high');
		expect(result.reasonCode).toBe('contradictory_constructed_evidence');
	});

	it('marks previously secure evidence due after its scheduled check date', () => {
		const result = computeLearnerState(
			[
				evidence({
					id: 'exam-old',
					kind: 'independent_exam_constructed',
					itemId: 'exam-old',
					occurredAt: '2026-05-30T12:00:00.000Z'
				}),
				evidence({
					id: 'transfer-old',
					kind: 'independent_transfer_constructed',
					itemId: 'transfer-old',
					occurredAt: '2026-06-01T12:00:00.000Z'
				})
			],
			{ now: NOW }
		);
		expect(result.state).toBe('due');
		expect(result.reasonCode).toBe('scheduled_check_due');
		expect(result.uncertainty).toBe('medium');
	});
});

describe('rankCandidateActions', () => {
	it('honours subject, curriculum scope, availability, mode, and time constraints', () => {
		const result = rankCandidateActions(
			[
				candidate({ id: 'in-scope', kind: 'recall' }),
				candidate({ id: 'wrong-topic', curriculumComponentId: 'genetics' }),
				candidate({ id: 'unavailable', available: false }),
				candidate({ id: 'too-long', estimatedMinutes: 15 }),
				candidate({ id: 'wrong-mode', kind: 'apply_chain' }),
				candidate({ id: 'wrong-subject', subject: 'Chemistry' })
			],
			{
				subject: 'Biology',
				scopeComponentIds: ['cell-biology'],
				allowedKinds: ['recall'],
				maxMinutes: 10
			}
		);
		expect(result.map((item) => item.candidate.id)).toEqual(['in-scope']);
	});

	it('puts an active conflicting gap before due recall and secure transfer', () => {
		const result = rankCandidateActions(
			[
				candidate({ id: 'secure-transfer', kind: 'apply_chain', state: 'secure' }),
				candidate({ id: 'due-recall', state: 'due' }),
				candidate({
					id: 'conflicting-gap',
					kind: 'close_gap',
					state: 'conflicting',
					uncertainty: 'high',
					activeGap: true
				})
			],
			{ subject: 'Biology' }
		);
		expect(result.map((item) => item.candidate.id)).toEqual([
			'conflicting-gap',
			'due-recall',
			'secure-transfer'
		]);
		expect(result[0].reasonCode).toBe('resolve_conflicting_evidence');
	});

	it('uses stable ids as the final tie-breaker', () => {
		const result = rankCandidateActions(
			[candidate({ id: 'action-z' }), candidate({ id: 'action-a' })],
			{ subject: 'Biology' }
		);
		expect(result.map((item) => item.candidate.id)).toEqual(['action-a', 'action-z']);
	});
});
