type LearnerPracticeInput = {
	answerFormat?: string | null;
	prompt: string;
	responseKind?: string | null;
};

function normalized(value: string | null | undefined) {
	return value?.trim().toLowerCase().replace(/[_-]+/g, ' ') ?? '';
}

export function promptRequiresReviewedChoice(prompt: string) {
	return /\b(?:tick|select|choose|circle)\b[\s\S]{0,60}\b(?:one|two|three|1|2|3)\b[\s\S]{0,36}\b(?:box|boxes|answer|answers|option|options)\b/i.test(
		prompt
	);
}

export function promptRequiresDirectVisualInteraction(prompt: string) {
	return [
		/\bcomplete\b[\s\S]{0,100}\b(?:punnett square|diagram|graph|table|grid)\b/i,
		/\b(?:draw|plot|shade|label|mark)\b[\s\S]{0,100}\b(?:figure|diagram|graph|grid|axes|table|map)\b/i
	].some((pattern) => pattern.test(prompt));
}

/**
 * Fail closed when the exam requires an interaction that the reviewed overlay
 * does not represent. A generic textarea would change what the learner is
 * being tested on and make deterministic marking impossible.
 */
export function supportsLearnerPracticeInput({
	answerFormat,
	prompt,
	responseKind
}: LearnerPracticeInput) {
	const format = normalized(answerFormat);
	const interaction = normalized(responseKind);
	if (promptRequiresDirectVisualInteraction(prompt)) return false;

	if (interaction === 'choice') {
		return !format || format === 'choice';
	}
	if (format === 'choice') return false;

	const supportedTextKinds = new Set(['lines', 'labeled lines']);
	if (format && !supportedTextKinds.has(format)) return false;
	if (interaction && !supportedTextKinds.has(interaction)) return false;
	if (promptRequiresReviewedChoice(prompt)) return false;
	return true;
}
