export type ChallengeExplanation = {
	explanation: string;
	model: string;
	modelVersion: string;
};

const MAX_EXPLANATION_LENGTH = 2_000;

export function parseChallengeExplanation(value: unknown): ChallengeExplanation | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const candidate = value as Record<string, unknown>;
	const explanation = typeof candidate.explanation === 'string' ? candidate.explanation.trim() : '';
	const model = typeof candidate.model === 'string' ? candidate.model.trim() : '';
	const modelVersion =
		typeof candidate.modelVersion === 'string' ? candidate.modelVersion.trim() : '';
	if (!explanation || explanation.length > MAX_EXPLANATION_LENGTH || !model || !modelVersion) {
		return null;
	}
	return { explanation, model, modelVersion };
}

export function challengeExplanationParagraphs(explanation: string): string[] {
	return explanation
		.split(/\n\s*\n/u)
		.map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
		.filter(Boolean);
}
