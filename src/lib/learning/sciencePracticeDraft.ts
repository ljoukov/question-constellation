import {
	isRecord,
	numberFromRecord,
	recordFromRecord,
	stringFromRecord,
	type PracticeDraftSave,
	type SavedPracticeDraft
} from '$lib/practiceDrafts';
import { practiceStateRestoreMode } from './practiceStateRestore';

export type RestoredSciencePracticeDraft = {
	answerText: string;
	rewriteText: string;
	gradedAnswerText: string;
	gradeResult: Record<string, unknown> | null;
	view: 'attempt' | 'result';
	activitySessionId?: string;
	responseStartedAt?: number;
	pendingAttemptId?: string;
	pendingAttemptSignature?: string;
	pendingResponseDurationMs: number | null;
	hintUsed: boolean;
	markingPointsUsed: boolean;
	updatedAt: number;
};

export function sciencePracticeStateFromDraft(
	draft: PracticeDraftSave | SavedPracticeDraft | null
): RestoredSciencePracticeDraft | null {
	if (!draft || draft.draftKind !== 'science-practice' || !isRecord(draft.payload)) return null;
	const view = stringFromRecord(draft.payload, 'view');
	return {
		answerText: stringFromRecord(draft.payload, 'answerText') || draft.answerText,
		rewriteText: stringFromRecord(draft.payload, 'rewriteText'),
		gradedAnswerText: stringFromRecord(draft.payload, 'gradedAnswerText'),
		gradeResult: recordFromRecord(draft.payload, 'gradeResult'),
		view: view === 'result' ? 'result' : 'attempt',
		activitySessionId: stringFromRecord(draft.payload, 'activitySessionId') || undefined,
		responseStartedAt: numberFromRecord(draft.payload, 'responseStartedAt') ?? undefined,
		pendingAttemptId: stringFromRecord(draft.payload, 'pendingAttemptId') || undefined,
		pendingAttemptSignature:
			stringFromRecord(draft.payload, 'pendingAttemptSignature') || undefined,
		pendingResponseDurationMs: numberFromRecord(draft.payload, 'pendingResponseDurationMs'),
		hintUsed: draft.payload.hintUsed === true,
		markingPointsUsed: draft.payload.markingPointsUsed === true,
		updatedAt: draft.clientUpdatedAt
	};
}

export function isResumableSciencePracticeDraft(
	draft: PracticeDraftSave | SavedPracticeDraft | null
): boolean {
	const state = sciencePracticeStateFromDraft(draft);
	if (!state || (!state.answerText.trim() && !state.rewriteText.trim())) return false;
	return practiceStateRestoreMode(state, 'attempt') === 'draft';
}
