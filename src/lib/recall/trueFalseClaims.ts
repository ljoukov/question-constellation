import { shuffledRecallChoices } from './sessionControls';

type BalancedTrueFalseClaimInput = {
	answer: string;
	distractors: string[];
	cardKey: string;
	sessionId: string;
	sessionCardKeys: string[];
};

export type BalancedTrueFalseClaim = {
	text: string;
	isTrue: boolean;
};

export function balancedTrueFalseClaim({
	answer,
	distractors,
	cardKey,
	sessionId,
	sessionCardKeys
}: BalancedTrueFalseClaimInput): BalancedTrueFalseClaim {
	const normalizedAnswer = answer.trim();
	const normalizedDistractors = distractors
		.map((choice) => choice.trim())
		.filter(
			(choice, index, values) =>
				Boolean(choice) && choice !== normalizedAnswer && values.indexOf(choice) === index
		);
	if (normalizedDistractors.length === 0) {
		return { text: normalizedAnswer, isTrue: true };
	}

	const stableSessionId = sessionId || 'preview';
	const position = sessionCardKeys.indexOf(cardKey);
	const startsTrue =
		shuffledRecallChoices([true, false], 'true-false-session-balance', stableSessionId)[0] ?? true;
	const isTrue =
		position >= 0
			? position % 2 === 0
				? startsTrue
				: !startsTrue
			: (shuffledRecallChoices(
					[true, false],
					`${cardKey}\u0000true-false-preview`,
					stableSessionId
				)[0] ?? true);
	if (isTrue) return { text: normalizedAnswer, isTrue: true };

	const falseClaim =
		shuffledRecallChoices(
			normalizedDistractors,
			`${cardKey}\u0000true-false-distractor`,
			stableSessionId
		)[0] ?? normalizedDistractors[0];
	return { text: falseClaim, isTrue: false };
}
