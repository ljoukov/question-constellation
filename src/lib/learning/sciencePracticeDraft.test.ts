import { describe, expect, it } from 'vitest';
import type { SavedPracticeDraft } from '$lib/practiceDrafts';
import {
	isResumableSciencePracticeDraft,
	sciencePracticeStateFromDraft
} from './sciencePracticeDraft';

function draft(payload: Record<string, unknown>): SavedPracticeDraft {
	return {
		questionId: 'question-1',
		draftKind: 'science-practice',
		answerText: String(payload.answerText ?? ''),
		payload,
		clientUpdatedAt: 1234,
		updatedAt: '2026-07-16 12:00:00'
	};
}

describe('science practice cloud drafts', () => {
	it('restores the same activity and response timer across devices', () => {
		const restored = sciencePracticeStateFromDraft(
			draft({
				answerText: 'Less oxygen reaches the cells.',
				view: 'attempt',
				activitySessionId: 'science-session-1',
				responseStartedAt: 1_700_000_000_000,
				pendingAttemptId: 'attempt-1',
				pendingAttemptSignature: 'signature-1',
				pendingResponseDurationMs: 42_000,
				hintUsed: true
			})
		);

		expect(restored).toMatchObject({
			activitySessionId: 'science-session-1',
			responseStartedAt: 1_700_000_000_000,
			pendingAttemptId: 'attempt-1',
			pendingAttemptSignature: 'signature-1',
			pendingResponseDurationMs: 42_000,
			hintUsed: true
		});
	});

	it('offers only unfinished work as resumable', () => {
		expect(
			isResumableSciencePracticeDraft(
				draft({ answerText: 'Unfinished answer', view: 'attempt', gradeResult: null })
			)
		).toBe(true);
		expect(
			isResumableSciencePracticeDraft(
				draft({
					answerText: 'Checked answer',
					gradedAnswerText: 'Checked answer',
					view: 'result',
					gradeResult: { result: 'correct' }
				})
			)
		).toBe(false);
		expect(isResumableSciencePracticeDraft(draft({ answerText: '', view: 'attempt' }))).toBe(false);
	});
});
