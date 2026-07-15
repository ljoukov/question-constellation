const SUPPORTED_RESPONSE_KINDS = new Set([
	'none',
	'lines',
	'labeled-lines',
	'number-line',
	'choice',
	'choice-table',
	'matching',
	'equation-blanks',
	'asset-canvas',
	'image-label-zones',
	'drawing-box'
]);

/**
 * Remove a detached PDF page number without changing legitimate numbers inside an option.
 * The text-layer leak has a wide whitespace run before the page number (for example
 * `Phloem····10`), unlike a real option such as `10 cm`.
 *
 * @param {unknown} value
 */
export function cleanLegacyChoiceOption(value) {
	return String(value ?? '')
		.replace(/\s{3,}\d{1,3}\s*$/, '')
		.trim();
}

/** @param {unknown} value */
function normalizeCorrectAnswers(value) {
	if (Array.isArray(value)) {
		return Object.fromEntries(
			value
				.map((answer) => [
					String(answer?.targetId ?? answer?.target_id ?? '').trim(),
					String(answer?.correctAnswer ?? answer?.correct_answer ?? '').trim()
				])
				.filter(([targetId, correctAnswer]) => targetId && correctAnswer)
		);
	}
	if (!value || typeof value !== 'object') return undefined;
	const entries = Object.entries(value)
		.map(([targetId, correctAnswer]) => [targetId.trim(), String(correctAnswer ?? '').trim()])
		.filter(([targetId, correctAnswer]) => targetId && correctAnswer);
	return entries.length ? Object.fromEntries(entries) : undefined;
}

/**
 * Preserve multi-select intent across extractor variants that historically used either
 * `maxSelections`, `count`, or one keyed target per required selection.
 *
 * @param {Record<string, any>} response
 * @param {number} optionCount
 * @param {Record<string, string> | undefined} correctAnswers
 */
export function choiceMaxSelectionsForImport(response, optionCount, correctAnswers) {
	const keyedAnswerCount = correctAnswers ? Object.keys(correctAnswers).length : 0;
	const requested = Number((response.maxSelections ?? response.count ?? keyedAnswerCount) || 1);
	if (!Number.isInteger(requested) || requested < 1) return 1;
	return Math.min(requested, Math.max(1, optionCount - 1));
}

/**
 * Prefer a reviewed/extracted response object over legacy prompt heuristics. This keeps the exact
 * source options, selection count, and answer key together through the chained importer.
 *
 * @param {Record<string, any>} question
 * @returns {Record<string, any> | null}
 */
export function explicitChainedQuestionResponse(question) {
	const value = question?.response;
	if (!value || typeof value !== 'object') return null;
	if (!SUPPORTED_RESPONSE_KINDS.has(value.kind)) {
		throw new Error(`${question.id} has unsupported explicit response kind ${String(value.kind)}.`);
	}

	const correctAnswers = normalizeCorrectAnswers(value.correctAnswers);
	if (value.kind !== 'choice') {
		return {
			...value,
			...(correctAnswers ? { correctAnswers } : {}),
			provenance: value.provenance ?? 'explicit-extraction-response'
		};
	}

	const options = (value.options ?? []).map(cleanLegacyChoiceOption).filter(Boolean);
	if (options.length < 2) {
		throw new Error(`${question.id} explicit choice response must contain at least two options.`);
	}
	const maxSelections = choiceMaxSelectionsForImport(value, options.length, correctAnswers);
	for (const answer of Object.values(correctAnswers ?? {})) {
		if (!options.includes(answer)) {
			throw new Error(
				`${question.id} choice answer key ${answer} is not one of its visible options.`
			);
		}
	}

	return {
		...value,
		options,
		layout: value.layout === 'horizontal' ? 'horizontal' : 'vertical',
		maxSelections,
		...(correctAnswers ? { correctAnswers } : {}),
		provenance: value.provenance ?? 'explicit-extraction-response'
	};
}
