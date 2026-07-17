const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const STANDARD_STUDY_CARD_PROMPT_VERSION = 'standard-study-card-compiler-v5';
export const STANDARD_STUDY_CARD_SOURCE_EXCERPT_MAX_LENGTH = 400;

/**
 * @param {unknown} sourceText
 * @param {unknown} sourceExcerpt
 * @param {{maxLength?:number}} [options]
 */
export function standardStudyCardSourceExcerptIssue(
	sourceText,
	sourceExcerpt,
	{ maxLength = STANDARD_STUDY_CARD_SOURCE_EXCERPT_MAX_LENGTH } = {}
) {
	if (typeof sourceText !== 'string' || typeof sourceExcerpt !== 'string') {
		return 'source text and excerpt must both be strings';
	}
	if (sourceExcerpt.length === 0) return 'source excerpt must not be empty';
	if ([...sourceExcerpt].some((character) => isUnsafeControlCharacter(character))) {
		return 'source excerpt contains unsafe control characters';
	}
	if (sourceExcerpt.length > maxLength) {
		return `source excerpt exceeds ${maxLength} characters`;
	}
	if (!sourceText.includes(sourceExcerpt)) {
		return 'source excerpt is not one exact contiguous substring of its official component text';
	}
	return null;
}

/**
 * Validate generated candidates independently so one malformed row never discards an otherwise
 * reviewable batch.
 *
 * @template T
 * @param {{
 *   cards: T[],
 *   topicComponentIds: string[],
 *   minimumAcceptedPerTopic: number,
 *   topicComponentId: (card:T) => unknown,
 *   validateCard: (card:T, index:number) => void
 * }} input
 */
export function partitionStandardStudyCardCandidates(input) {
	/** @type {T[]} */
	const validCards = [];
	/** @type {Array<{index:number, card:T, issue:string}>} */
	const invalidCards = [];
	const validCountByTopic = new Map(input.topicComponentIds.map((id) => [id, 0]));
	for (const [index, card] of input.cards.entries()) {
		try {
			input.validateCard(card, index);
			validCards.push(card);
			const topicId = input.topicComponentId(card);
			if (typeof topicId === 'string' && validCountByTopic.has(topicId)) {
				validCountByTopic.set(topicId, (validCountByTopic.get(topicId) ?? 0) + 1);
			}
		} catch (error) {
			invalidCards.push({
				index,
				card,
				issue: error instanceof Error ? error.message : String(error)
			});
		}
	}
	const topicsBelowMinimum = input.topicComponentIds.flatMap((topicComponentId) => {
		const validCardCount = validCountByTopic.get(topicComponentId) ?? 0;
		return validCardCount < input.minimumAcceptedPerTopic
			? [
					{
						topicComponentId,
						validCardCount,
						missingCardCount: input.minimumAcceptedPerTopic - validCardCount
					}
				]
			: [];
	});
	const repairCandidates = topicsBelowMinimum.flatMap((topic) =>
		invalidCards
			.filter((entry) => input.topicComponentId(entry.card) === topic.topicComponentId)
			.slice(0, topic.missingCardCount)
	);
	const unrepairableTopics = topicsBelowMinimum.filter(
		(topic) =>
			repairCandidates.filter(
				(entry) => input.topicComponentId(entry.card) === topic.topicComponentId
			).length < topic.missingCardCount
	);
	return {
		validCards,
		invalidCards,
		validCountByTopic: Object.fromEntries(validCountByTopic),
		topicsBelowMinimum,
		repairCandidates,
		unrepairableTopics,
		canReviewWithoutRepair: topicsBelowMinimum.length === 0
	};
}

/** @param {unknown} value */
export function standardStudyCardMemoryTipIssue(value) {
	if (value === null) return null;
	if (typeof value !== 'string' || !value.trim()) {
		return 'memoryTip must be null or a non-empty string';
	}
	if (value.length > 180) return 'memoryTip is too long';
	return null;
}

/** @param {string} character */
function isUnsafeControlCharacter(character) {
	const code = character.charCodeAt(0);
	return (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31);
}

/** @param {unknown} value */
export function isKebabCaseStudyCardKey(value) {
	return typeof value === 'string' && KEBAB_CASE_PATTERN.test(value);
}

/**
 * @template {Record<string, unknown>} T
 * @param {T[]} choices
 * @returns {Array<T & { key: string }>}
 */
export function normalizeReviewedChoiceKeys(choices) {
	if (!Array.isArray(choices) || choices.length < 3 || choices.length > 4) {
		throw new Error('Reviewed study cards need three or four ordered choices.');
	}
	return choices.map((choice, index) => ({
		...choice,
		key: String.fromCharCode('a'.charCodeAt(0) + index)
	}));
}
