import type { RecallCard } from './aqaScienceRecall';
import { recallCardContentKey } from './contentIdentity';

export type RecallChoiceDiagnostic = {
	key: string;
	text: string;
	isCorrect: boolean;
	misconception: string | null;
};

export type RecallCardRankingProgress = {
	seenCount: number;
	dueAt: number;
	lastSeenAt: number;
	wrongChoiceCount: number;
	repeatedMisconceptionCount: number;
};

/** Resolve a client-returned choice identifier exclusively through canonical data. */
export function recallChoiceDiagnostic(
	card: RecallCard,
	selectedChoiceKey: string
): RecallChoiceDiagnostic | null {
	const match = Object.entries(card.choiceKeys).find(([, key]) => key === selectedChoiceKey);
	if (!match) return null;
	const [text, key] = match;
	const isCorrect = text.trim() === card.back.trim();
	return {
		key,
		text,
		isCorrect,
		misconception: isCorrect ? null : (card.choiceMisconceptions?.[text]?.trim() ?? null)
	};
}

/**
 * Personalise only the order of reviewed canonical cards. The final canonical
 * index is retained as a deterministic fallback for missing or tied evidence.
 */
export function rankCanonicalRecallCards(
	cards: readonly RecallCard[],
	progressByContentKey: Readonly<Record<string, RecallCardRankingProgress>>,
	now: number
): RecallCard[] {
	const canonicalIndex = new Map(cards.map((card, index) => [recallCardContentKey(card), index]));
	return [...cards].sort((left, right) => {
		const leftKey = recallCardContentKey(left);
		const rightKey = recallCardContentKey(right);
		const leftProgress = progressByContentKey[leftKey];
		const rightProgress = progressByContentKey[rightKey];
		const leftRepeated = leftProgress?.repeatedMisconceptionCount ?? 0;
		const rightRepeated = rightProgress?.repeatedMisconceptionCount ?? 0;
		const leftHasRepeatedMisconception = leftRepeated >= 2;
		const rightHasRepeatedMisconception = rightRepeated >= 2;
		if (leftHasRepeatedMisconception !== rightHasRepeatedMisconception) {
			return leftHasRepeatedMisconception ? -1 : 1;
		}
		if (leftRepeated !== rightRepeated) return rightRepeated - leftRepeated;

		const leftWrong = leftProgress?.wrongChoiceCount ?? 0;
		const rightWrong = rightProgress?.wrongChoiceCount ?? 0;
		const leftHasWrongChoice = leftWrong > 0;
		const rightHasWrongChoice = rightWrong > 0;
		if (leftHasWrongChoice !== rightHasWrongChoice) return leftHasWrongChoice ? -1 : 1;
		if (leftWrong !== rightWrong) return rightWrong - leftWrong;

		const leftDue = !leftProgress || leftProgress.dueAt <= now;
		const rightDue = !rightProgress || rightProgress.dueAt <= now;
		if (leftDue !== rightDue) return leftDue ? -1 : 1;
		if (leftDue && rightDue) {
			const leftDueAt = leftProgress?.dueAt ?? Number.NEGATIVE_INFINITY;
			const rightDueAt = rightProgress?.dueAt ?? Number.NEGATIVE_INFINITY;
			if (leftDueAt !== rightDueAt) return leftDueAt - rightDueAt;
		}

		const leftLastSeen = leftProgress?.lastSeenAt ?? 0;
		const rightLastSeen = rightProgress?.lastSeenAt ?? 0;
		if (leftLastSeen !== rightLastSeen) return leftLastSeen - rightLastSeen;
		return (canonicalIndex.get(leftKey) ?? 0) - (canonicalIndex.get(rightKey) ?? 0);
	});
}
