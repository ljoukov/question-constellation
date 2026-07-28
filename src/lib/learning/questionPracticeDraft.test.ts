import { describe, expect, it } from 'vitest';
import type { SavedPracticeDraft } from '$lib/practiceDrafts';
import {
	isResumableQuestionPracticeDraft,
	questionPracticeStateFromDraft
} from './questionPracticeDraft';

function draft(payload: Record<string, unknown>): SavedPracticeDraft {
	return {
		questionId: 'question-1',
		draftKind: 'question-practice',
		answerText: String(payload.answerText ?? ''),
		payload,
		clientUpdatedAt: 1234,
		updatedAt: '2026-07-16 12:00:00'
	};
}

describe('question-practice cloud drafts', () => {
	it('restores the same activity and response timer across devices', () => {
		const restored = questionPracticeStateFromDraft(
			draft({
				answerText: 'Less oxygen reaches the cells.',
				view: 'attempt',
				activitySessionId: 'question-session-1',
				responseStartedAt: 1_700_000_000_000,
				pendingAttemptId: 'attempt-1',
				pendingAttemptSignature: 'signature-1',
				pendingResponseDurationMs: 42_000,
				hintUsed: true
			})
		);

		expect(restored).toMatchObject({
			activitySessionId: 'question-session-1',
			responseStartedAt: 1_700_000_000_000,
			pendingAttemptId: 'attempt-1',
			pendingAttemptSignature: 'signature-1',
			pendingResponseDurationMs: 42_000,
			hintUsed: true
		});
	});

	it('offers only unfinished work as resumable', () => {
		expect(
			isResumableQuestionPracticeDraft(
				draft({ answerText: 'Unfinished answer', view: 'attempt', gradeResult: null })
			)
		).toBe(true);
		expect(
			isResumableQuestionPracticeDraft(
				draft({
					answerText: 'Checked answer',
					gradedAnswerText: 'Checked answer',
					view: 'result',
					gradeResult: { result: 'correct' }
				})
			)
		).toBe(false);
		expect(isResumableQuestionPracticeDraft(draft({ answerText: '', view: 'attempt' }))).toBe(
			false
		);
	});
});
