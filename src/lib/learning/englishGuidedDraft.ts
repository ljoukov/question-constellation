import {
	isRecord,
	recordFromRecord,
	type PracticeDraftSave,
	type SavedPracticeDraft
} from '$lib/practiceDrafts';

function matchingPassedResult(result: unknown, answer: string) {
	return (
		isRecord(result) &&
		result.decision === 'pass' &&
		typeof result.checkedAnswer === 'string' &&
		result.checkedAnswer.trim() === answer.trim()
	);
}

/** A completed five-stage answer is reviewable, but is no longer an unfinished draft. */
export function isResumableEnglishGuidedDraft(
	draft: PracticeDraftSave | SavedPracticeDraft | null
) {
	if (!draft || draft.draftKind !== 'english-guided' || !isRecord(draft.payload)) return false;
	const answers = recordFromRecord(draft.payload, 'stepAnswers') ?? {};
	const results = recordFromRecord(draft.payload, 'stepResults') ?? {};
	const entries = Object.entries(answers).filter(
		(entry): entry is [string, string] => typeof entry[1] === 'string'
	);
	if (!entries.some(([, answer]) => answer.trim().length > 0)) return false;

	const completed =
		entries.length > 0 &&
		entries.every(
			([stepId, answer]) =>
				answer.trim().length > 0 && matchingPassedResult(results[stepId], answer)
		);
	return !completed;
}
