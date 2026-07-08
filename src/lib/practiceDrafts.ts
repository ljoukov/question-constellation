export type PracticeDraftKind = 'science-practice' | 'english-guided';

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
