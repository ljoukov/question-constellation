import type { PracticeDraftKind, SavedPracticeDraft } from '$lib/practiceDrafts';
import { queryPersonalFirst } from './db';

type UserQuestionDraftRow = {
	question_id: string;
	draft_kind: PracticeDraftKind;
	answer_text: string;
	draft_json: string;
	client_updated_at: number;
	updated_at: string;
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function savedDraftFromRow(row: UserQuestionDraftRow): SavedPracticeDraft {
	return {
		questionId: row.question_id,
		draftKind: row.draft_kind,
		answerText: row.answer_text,
		payload: parseJson<Record<string, unknown>>(row.draft_json, {}),
		clientUpdatedAt: row.client_updated_at,
		updatedAt: row.updated_at
	};
}

export async function getQuestionDraft(
	userId: string,
	questionId: string
): Promise<SavedPracticeDraft | null> {
	const row = await queryPersonalFirst<UserQuestionDraftRow>(
		`SELECT question_id, draft_kind, answer_text, draft_json, client_updated_at, updated_at
		 FROM user_question_drafts
		 WHERE user_id = ?
		   AND question_id = ?`,
		[userId, questionId]
	);
	return row ? savedDraftFromRow(row) : null;
}
