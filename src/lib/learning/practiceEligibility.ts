type LearnerPracticeInput = {
	answerFormat?: string | null;
	prompt: string;
	context?: string | null;
	responseKind?: string | null;
	responseHasWrittenFields?: boolean;
	hasReferencedSourceMaterial?: boolean;
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

export function promptRequiresEquationBlanks(prompt: string) {
	return /\b(?:complete|balance)\b[\s\S]{0,80}\b(?:symbol |word |balanced )?(?:chemical )?equation\b/i.test(
		prompt
	);
}

export function promptRequiresReviewedLabeledFields(prompt: string) {
	const labels = prompt.match(
		/^\s*(?:test|result|colour change(?:\s+to)?|factor|reason|error|avoided by|gradient|unit)\s*(?:=)?\s*$/gim
	);
	return (labels?.length ?? 0) >= 2;
}

export function promptHasUnresolvedDependency(
	prompt: string,
	context?: string | null,
	hasReferencedSourceMaterial = false
) {
	const visibleText = `${context ?? ''}\n${prompt}`;
	const mentionsUnstatedHypothesis =
		/\b(?:their|the|this)\s+hypothesis\b/i.test(visibleText) &&
		!/\bhypothesis\s*(?::|was\b|is\b|that\b|[-–—]|["'‘“])/i.test(visibleText);
	if (mentionsUnstatedHypothesis) return true;

	// A pressure/yield or pressure/position question is reaction-specific even
	// when a weak import dropped the word “equilibrium” from the visible stem.
	const needsSpecificEquilibrium =
		/\b(?:increas|decreas)\w*\s+(?:the\s+)?pressure\b/i.test(visibleText) &&
		/\b(?:yield|position)\b/i.test(visibleText);
	const hasReactionContext =
		hasReferencedSourceMaterial ||
		/\b(?:equation|reaction)\b[\s\S]{0,180}(?:⇌|<=>|↔|→)/i.test(visibleText) ||
		/(?:⇌|<=>|↔)/.test(visibleText);
	return needsSpecificEquilibrium && !hasReactionContext;
}

export function promptReferencesExamSource(prompt: string, context?: string | null) {
	return /\b(?:figure|table|graph|diagram|chart|map|source)\s*\d+[a-z]?\b/i.test(
		`${context ?? ''}\n${prompt}`
	);
}

/**
 * Fail closed when the exam requires an interaction that the reviewed overlay
 * does not represent. A generic textarea would change what the learner is
 * being tested on and make deterministic marking impossible.
 */
export function supportsLearnerPracticeInput({
	answerFormat,
	prompt,
	context,
	responseKind,
	responseHasWrittenFields = false,
	hasReferencedSourceMaterial = false
}: LearnerPracticeInput) {
	const format = normalized(answerFormat);
	const interaction = normalized(responseKind);
	const supportedMixedAssetCanvas =
		interaction === 'asset canvas' && responseHasWrittenFields && hasReferencedSourceMaterial;
	if (promptRequiresDirectVisualInteraction(prompt) && !supportedMixedAssetCanvas) return false;
	if (promptRequiresEquationBlanks(prompt)) return interaction === 'equation blanks';
	if (promptReferencesExamSource(prompt, context) && !hasReferencedSourceMaterial) return false;
	if (promptHasUnresolvedDependency(prompt, context, hasReferencedSourceMaterial)) return false;

	if (interaction === 'choice') {
		return !format || format === 'choice';
	}
	if (format === 'choice') return false;
	if (interaction === 'asset canvas' || format === 'asset canvas') {
		return supportedMixedAssetCanvas;
	}

	const supportedTextKinds = new Set(['lines', 'labeled lines']);
	if (format && !supportedTextKinds.has(format)) return false;
	if (interaction && !supportedTextKinds.has(interaction)) return false;
	if (promptRequiresReviewedChoice(prompt)) return false;
	if (promptRequiresReviewedLabeledFields(prompt) && interaction !== 'labeled lines') return false;
	return true;
}
