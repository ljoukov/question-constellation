import type { ChallengeChoice, ChallengeWeakAnswerKind } from './types';

export type ChallengeInterludeMechanic =
	| 'faded-examiner'
	| 'chain-echo'
	| 'evidence-sweep'
	| 'weakness-lens'
	| 'link-order'
	| 'reason-match';

export type ChallengeInterludeDefinition = {
	id: ChallengeInterludeMechanic;
	label: string;
	action: string;
	intensity: string;
	description: string;
};

export type ChallengeInterludeResult = {
	mechanic: ChallengeInterludeMechanic;
	score: number;
	durationMs: number;
	attempts: number;
	correctDecisions: number;
	totalDecisions: number;
};

export const challengeInterludeDefinitions = [
	{
		id: 'faded-examiner',
		label: 'Answer replay',
		action: 'Watch',
		intensity: 'Calm',
		description: 'Watch a weak answer turn into an exam-ready one.'
	},
	{
		id: 'chain-echo',
		label: 'Chain echo',
		action: 'Recall',
		intensity: 'Light',
		description: 'Look once, then recall the words that fade.'
	},
	{
		id: 'evidence-sweep',
		label: 'Mark sweep',
		action: 'Judge',
		intensity: 'Sharp',
		description: 'Make a few quick mark-or-no-mark calls.'
	},
	{
		id: 'weakness-lens',
		label: 'Weakness lens',
		action: 'Spot',
		intensity: 'Calm',
		description: 'Name the one kind of problem holding this answer back.'
	},
	{
		id: 'link-order',
		label: 'Link order',
		action: 'Arrange',
		intensity: 'Light',
		description: 'Put the reviewed answer-chain links back in order.'
	},
	{
		id: 'reason-match',
		label: 'Reason match',
		action: 'Connect',
		intensity: 'Sharp',
		description: 'Match each diagnosis to the reason it stands or falls.'
	}
] as const satisfies readonly ChallengeInterludeDefinition[];

const HANDLE_SEPARATOR = /\s*(?:→|⟶|;|,)\s*|\s+\+\s+|\s+=\s+|\s+follows\s+/i;
export const CHALLENGE_INTERLUDE_SCORE = 50;

export type ChainEcho = {
	steps: string[];
	hiddenIndex: number;
	hiddenStep: string;
};

export type EvidenceSweepItem = {
	id: string;
	text: string;
	feedback: string;
	earnsMark: boolean;
};

export type WeaknessLensOption = {
	id: ChallengeWeakAnswerKind;
	label: string;
};

export type LinkOrderItem = {
	id: string;
	label: string;
	originalIndex: number;
};

export type DiagnosisReasonItem = {
	id: string;
	statement: string;
	reason: string;
	correct: boolean;
};

export const weaknessLensOptions = [
	{ id: 'incomplete', label: 'Missing an idea' },
	{ id: 'incorrect-claim', label: 'Science claim is wrong' },
	{ id: 'wrong-value', label: 'Method right, value wrong' },
	{ id: 'off-command', label: 'Answers the wrong instruction' }
] as const satisfies readonly WeaknessLensOption[];

export function challengeMemorySteps(memoryHandle: string): string[] {
	const steps = memoryHandle
		.split(HANDLE_SEPARATOR)
		.map((step) => step.trim())
		.filter(Boolean);
	return steps.length > 0 ? steps : [memoryHandle.trim()].filter(Boolean);
}

export function buildChainEcho(memoryHandle: string): ChainEcho {
	const steps = challengeMemorySteps(memoryHandle);
	const hiddenIndex =
		steps.length > 2 ? Math.floor(steps.length / 2) : Math.max(0, steps.length - 1);
	const hiddenStep = steps[hiddenIndex] ?? memoryHandle.trim();

	return {
		steps,
		hiddenIndex,
		hiddenStep
	};
}

export function buildEvidenceSweep(
	choices: readonly ChallengeChoice[],
	seed: string
): EvidenceSweepItem[] {
	const correct = choices.find((choice) => choice.correct);
	const incorrect = choices.filter((choice) => !choice.correct).slice(0, 2);
	const selected = correct ? [correct, ...incorrect] : incorrect;

	return stableOrder(selected, `${seed}:evidence-sweep`).map((choice) => ({
		id: choice.id,
		text: choice.text,
		feedback:
			choice.feedback?.trim() ||
			(choice.correct ? 'This earns the missing mark.' : 'This is not sufficient yet.'),
		earnsMark: choice.correct
	}));
}

export function buildLinkOrder(segments: readonly string[], seed: string): LinkOrderItem[] {
	const original = segments
		.map((label, originalIndex) => ({
			id: `${seed}:link:${originalIndex}`,
			label: label.trim(),
			originalIndex
		}))
		.filter((item) => Boolean(item.label));
	if (original.length < 2) return original;

	const shuffled = stableOrder(original, `${seed}:link-order`);
	if (isLinkOrderCorrect(shuffled))
		return [...shuffled.slice(1), shuffled[0]].filter((item): item is LinkOrderItem =>
			Boolean(item)
		);
	return shuffled;
}

export function isLinkOrderCorrect(items: readonly LinkOrderItem[]): boolean {
	return items.every((item, index) => item.originalIndex === index);
}

export function restoreLinkOrder(items: readonly LinkOrderItem[]): LinkOrderItem[] {
	return [...items].sort((left, right) => left.originalIndex - right.originalIndex);
}

export function buildDiagnosisReasonItems(
	choices: readonly ChallengeChoice[],
	seed: string
): DiagnosisReasonItem[] {
	return stableOrder(
		choices.map((choice) => ({
			id: choice.id,
			statement: choice.text,
			reason:
				choice.feedback?.trim() ||
				(choice.correct ? 'This is the decisive diagnosis.' : 'This does not fix the weakness.'),
			correct: choice.correct
		})),
		`${seed}:reason-match`
	);
}

export function shuffledDiagnosisReasons(
	items: readonly DiagnosisReasonItem[],
	seed: string
): Array<Pick<DiagnosisReasonItem, 'id' | 'reason'>> {
	return stableOrder(
		items.map(({ id, reason }) => ({ id, reason })),
		`${seed}:reason-options`
	);
}

export function challengeInterludeScore(mechanic: ChallengeInterludeMechanic): number {
	void mechanic;
	return CHALLENGE_INTERLUDE_SCORE;
}

function stableOrder<T extends { id: string }>(values: readonly T[], seed: string): T[] {
	const ordered = values
		.map((value, index) => ({
			value,
			index,
			order: stableHash(`${seed}:${value.id}`)
		}))
		.sort((left, right) => left.order - right.order || left.index - right.index)
		.map(({ value }) => value);

	if (ordered.length > 1 && ordered.every((value, index) => value.id === values[index]?.id)) {
		const offset = (stableHash(`${seed}:rotation`) % (ordered.length - 1)) + 1;
		return [...ordered.slice(offset), ...ordered.slice(0, offset)];
	}

	return ordered;
}

function stableHash(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}
