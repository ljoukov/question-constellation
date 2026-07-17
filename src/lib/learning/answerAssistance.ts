export const EXTERNAL_INPUT_SOURCES = ['paste', 'drop'] as const;

export type ExternalInputSource = (typeof EXTERNAL_INPUT_SOURCES)[number];

export type ConstructedAnswerAssistance = {
	hintOpened?: boolean;
	markingPointsViewed?: boolean;
	feedbackRewrite?: boolean;
	externalInputDetected?: boolean;
	externalInputSources?: readonly ExternalInputSource[];
};

export type NormalizedConstructedAnswerAssistance = {
	hintOpened: boolean;
	markingPointsViewed: boolean;
	feedbackRewrite: boolean;
	externalInputDetected: boolean;
	externalInputSources: ExternalInputSource[];
};

export function normalizeExternalInputSources(value: unknown): ExternalInputSource[] {
	if (!Array.isArray(value)) return [];
	const supplied = new Set(
		value.filter((item): item is ExternalInputSource =>
			EXTERNAL_INPUT_SOURCES.includes(item as ExternalInputSource)
		)
	);
	return EXTERNAL_INPUT_SOURCES.filter((source) => supplied.has(source));
}

export function addExternalInputSource(
	current: readonly ExternalInputSource[],
	source: ExternalInputSource
): ExternalInputSource[] {
	return normalizeExternalInputSources([...current, source]);
}

export function externalInputSourceFromBeforeInput(
	inputType: string | null | undefined
): ExternalInputSource | null {
	if (inputType === 'insertFromPaste') return 'paste';
	if (inputType === 'insertFromDrop') return 'drop';
	return null;
}

export function normalizeConstructedAnswerAssistance(
	assistance: ConstructedAnswerAssistance | null | undefined
): NormalizedConstructedAnswerAssistance {
	const externalInputSources = normalizeExternalInputSources(assistance?.externalInputSources);
	return {
		hintOpened: assistance?.hintOpened === true,
		markingPointsViewed: assistance?.markingPointsViewed === true,
		feedbackRewrite: assistance?.feedbackRewrite === true,
		externalInputDetected:
			assistance?.externalInputDetected === true || externalInputSources.length > 0,
		externalInputSources
	};
}

export function constructedAnswerIsIndependent(
	assistance: ConstructedAnswerAssistance | null | undefined
): boolean {
	const normalized = normalizeConstructedAnswerAssistance(assistance);
	return !(
		normalized.hintOpened ||
		normalized.markingPointsViewed ||
		normalized.feedbackRewrite ||
		normalized.externalInputDetected
	);
}
