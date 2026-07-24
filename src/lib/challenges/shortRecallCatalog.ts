import rawShortRecallPrompts from './data/short-recall-prompts.v1.json';
import {
	generateSpellingVariants,
	normalizeShortRecallAnswer,
	SHORT_RECALL_CONTENT_VERSION,
	validateShortRecallPrompt,
	type ShortRecallPrompt
} from './shortRecall';

const parsedPrompts = (rawShortRecallPrompts as unknown[]).map((value, index) => {
	const prompt = validateShortRecallPrompt(value);
	if (!prompt) throw new Error(`Invalid bundled short-recall prompt at index ${index}.`);
	return prompt;
});

const globallyAcceptedAnswers = new Set(
	parsedPrompts.flatMap((prompt) =>
		[prompt.canonicalAnswer, ...prompt.acceptedAliases].map(normalizeShortRecallAnswer)
	)
);

export const bundledShortRecallPrompts: readonly ShortRecallPrompt[] = parsedPrompts.map(
	(prompt) => ({
		...prompt,
		spellingVariants: generateSpellingVariants([
			prompt.canonicalAnswer,
			...prompt.acceptedAliases
		]).filter((variant) => !globallyAcceptedAnswers.has(normalizeShortRecallAnswer(variant))),
		contentVersion: SHORT_RECALL_CONTENT_VERSION
	})
);

const promptByChallengeId = new Map(
	bundledShortRecallPrompts.map((prompt) => [prompt.challengeId, prompt])
);

export function bundledShortRecallPrompt(challengeId: string): ShortRecallPrompt | null {
	return promptByChallengeId.get(challengeId) ?? null;
}
