export type PracticeDraftKind = 'science-practice' | 'english-guided';

export const MAX_PRACTICE_DRAFT_PAYLOAD_CHARS = 80_000;
export const MAX_PRACTICE_DRAFT_BATCH_PAYLOAD_CHARS = 1_500_000;

export type PracticeDraftSave = {
	questionId: string;
	draftKind: PracticeDraftKind;
	answerText: string;
	payload: Record<string, unknown>;
	clientUpdatedAt: number;
};

export type SavedPracticeDraft = PracticeDraftSave & {
	updatedAt: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function stringFromRecord(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return typeof value === 'string' ? value : '';
}

export function numberFromRecord(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function recordFromRecord(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return isRecord(value) ? value : null;
}

export function practiceDraftPayloadLength(payload: Record<string, unknown>) {
	return JSON.stringify(payload).length;
}

export function practiceDraftPayloadWithinSyncLimit(payload: Record<string, unknown>) {
	return practiceDraftPayloadLength(payload) <= MAX_PRACTICE_DRAFT_PAYLOAD_CHARS;
}

export function practiceDraftBatchWithinSyncLimit(
	drafts: Array<Pick<PracticeDraftSave, 'payload'>>
) {
	return (
		drafts.reduce((total, draft) => total + practiceDraftPayloadLength(draft.payload), 0) <=
		MAX_PRACTICE_DRAFT_BATCH_PAYLOAD_CHARS
	);
}
