import rawShortRecallPrompts from './data/short-recall-prompts.v1.json';
import {
	canonicalJsonSha256,
	GENERATED_SCIENCE_SHORT_RECALL_CONTENT_VERSION,
	generatedScienceShortRecallChallengeIds,
	generatedScienceShortRecallPrompts
} from './generatedShortRecall';
import {
	generateSpellingVariants,
	normalizeShortRecallAnswer,
	SHORT_RECALL_CONTENT_VERSION,
	validateShortRecallPrompt,
	type ShortRecallPrompt
} from './shortRecall';

export const AUTHORED_SHORT_RECALL_PROMPT_COUNT = 92;
export const COMBINED_SHORT_RECALL_PROMPT_COUNT =
	AUTHORED_SHORT_RECALL_PROMPT_COUNT + generatedScienceShortRecallChallengeIds.length;

const AUTHORED_PROMPT_KEYS = [
	'acceptedAliases',
	'canonicalAnswer',
	'challengeId',
	'preferredHiddenStepIndex',
	'stem'
] as const;

export type ExcludedShortRecallSpellingCollision = {
	challengeId: string;
	variant: string;
	collidesWith: string[];
};

export type CompiledShortRecallPromptCatalog = {
	prompts: ShortRecallPrompt[];
	excludedSpellingVariantCollisions: ExcludedShortRecallSpellingCollision[];
};

/**
 * Compile authored and accepted generated sources as one immutable catalog. Spelling variants are
 * deliberately generated only after the two sources are combined so a typo can never become an
 * accepted answer owned anywhere else in the active catalog.
 */
export function buildShortRecallPromptCatalog(
	authoredValues: readonly unknown[],
	generatedValues: readonly unknown[],
	expectedGeneratedChallengeIds: readonly string[]
): CompiledShortRecallPromptCatalog {
	if (authoredValues.length !== AUTHORED_SHORT_RECALL_PROMPT_COUNT) {
		throw new Error(
			`Authored short-recall coverage is ${authoredValues.length}/${AUTHORED_SHORT_RECALL_PROMPT_COUNT}.`
		);
	}
	if (
		expectedGeneratedChallengeIds.some(
			(challengeId) =>
				typeof challengeId !== 'string' ||
				challengeId.length === 0 ||
				!/^[a-z0-9][a-z0-9-]*$/.test(challengeId)
		) ||
		new Set(expectedGeneratedChallengeIds).size !== expectedGeneratedChallengeIds.length
	) {
		throw new Error('Expected generated short-recall challenge membership is malformed.');
	}
	if (generatedValues.length !== expectedGeneratedChallengeIds.length) {
		throw new Error(
			`Generated short-recall coverage must match the complete accepted runtime; found ${generatedValues.length}/${expectedGeneratedChallengeIds.length}.`
		);
	}

	const authoredPrompts = authoredValues.map((value, index) => {
		if (
			!isRecord(value) ||
			!sameStringArray(Object.keys(value).sort(), [...AUTHORED_PROMPT_KEYS])
		) {
			throw new Error(`Invalid authored short-recall source shape at index ${index}.`);
		}
		const prompt = validateShortRecallPrompt(value);
		if (!prompt) throw new Error(`Invalid authored short-recall prompt at index ${index}.`);
		return { ...prompt, contentVersion: SHORT_RECALL_CONTENT_VERSION };
	});
	const generatedPrompts = generatedValues.map((value, index) => {
		const prompt = validateShortRecallPrompt(value);
		if (
			!prompt ||
			prompt.contentVersion !== GENERATED_SCIENCE_SHORT_RECALL_CONTENT_VERSION ||
			prompt.spellingVariants !== undefined
		) {
			throw new Error(`Invalid generated short-recall prompt at index ${index}.`);
		}
		return prompt;
	});
	const generatedIds = generatedPrompts.map((prompt) => prompt.challengeId);
	if (!sameStringArray(generatedIds, expectedGeneratedChallengeIds)) {
		throw new Error(
			'Generated short-recall prompt membership or order differs from the accepted runtime.'
		);
	}

	const sourcePrompts = [...authoredPrompts, ...generatedPrompts];
	const expectedTotal = AUTHORED_SHORT_RECALL_PROMPT_COUNT + expectedGeneratedChallengeIds.length;
	if (sourcePrompts.length !== expectedTotal) {
		throw new Error(`Combined short-recall coverage is ${sourcePrompts.length}/${expectedTotal}.`);
	}

	const acceptedOwners = new Map<string, Set<string>>();
	const challengeIds = new Set<string>();
	for (const prompt of sourcePrompts) {
		if (challengeIds.has(prompt.challengeId)) {
			throw new Error(`Duplicate short-recall prompt for challenge ${prompt.challengeId}.`);
		}
		challengeIds.add(prompt.challengeId);
		for (const answer of [prompt.canonicalAnswer, ...prompt.acceptedAliases]) {
			const normalized = normalizeShortRecallAnswer(answer);
			const owners = acceptedOwners.get(normalized) ?? new Set<string>();
			owners.add(prompt.challengeId);
			acceptedOwners.set(normalized, owners);
		}
	}

	const excludedSpellingVariantCollisions: ExcludedShortRecallSpellingCollision[] = [];
	const prompts = sourcePrompts.map((prompt) => {
		const spellingVariants = generateSpellingVariants([
			prompt.canonicalAnswer,
			...prompt.acceptedAliases
		]).filter((variant) => {
			const owners = acceptedOwners.get(normalizeShortRecallAnswer(variant));
			if (!owners || owners.size === 0) return true;
			excludedSpellingVariantCollisions.push({
				challengeId: prompt.challengeId,
				variant,
				collidesWith: [...owners].sort()
			});
			return false;
		});
		return { ...prompt, spellingVariants };
	});

	return { prompts, excludedSpellingVariantCollisions };
}

export const authoredShortRecallPromptSources = rawShortRecallPrompts as readonly unknown[];

const compiledShortRecallCatalog = buildShortRecallPromptCatalog(
	authoredShortRecallPromptSources,
	generatedScienceShortRecallPrompts,
	generatedScienceShortRecallChallengeIds
);

export const bundledShortRecallPrompts: readonly ShortRecallPrompt[] =
	compiledShortRecallCatalog.prompts;
export const excludedShortRecallSpellingVariantCollisions =
	compiledShortRecallCatalog.excludedSpellingVariantCollisions;

const promptByChallengeId = new Map(
	bundledShortRecallPrompts.map((prompt) => [prompt.challengeId, prompt])
);
const contentSha256ByChallengeId = new Map(
	bundledShortRecallPrompts.map((prompt) => [
		prompt.challengeId,
		shortRecallPromptContentSha256(prompt)
	])
);

export function bundledShortRecallPrompt(challengeId: string): ShortRecallPrompt | null {
	return promptByChallengeId.get(challengeId) ?? null;
}

export function bundledShortRecallPromptContentSha256(challengeId: string): string | null {
	return contentSha256ByChallengeId.get(challengeId) ?? null;
}

export function shortRecallPromptContentSha256(prompt: ShortRecallPrompt): string {
	return canonicalJsonSha256({
		challengeId: prompt.challengeId,
		stem: prompt.stem,
		canonicalAnswer: prompt.canonicalAnswer,
		acceptedAliases: prompt.acceptedAliases,
		spellingVariants: prompt.spellingVariants ?? [],
		preferredHiddenStepIndex: prompt.preferredHiddenStepIndex,
		contentVersion: prompt.contentVersion
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
