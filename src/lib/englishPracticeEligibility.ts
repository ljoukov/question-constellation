export const ENGLISH_SOURCE_CONTEXT_UNAVAILABLE_REASON =
	'This practice task is unavailable because the official extract or source text has not been imported and reviewed yet.';

export const ENGLISH_REVIEW_UNAVAILABLE_REASON =
	'This practice task is unavailable because its learner-facing material has not completed review yet.';

export type EnglishSourceAssetEvidence = {
	id?: string | null;
	publicPath?: string | null;
	role?: string | null;
	sourceLabel?: string | null;
	altText?: string | null;
	required?: boolean | number | null;
};

export type EnglishSourceTaskKind =
	| 'poetry-comparison'
	| 'extract-comparison'
	| 'extract-and-wider'
	| 'whole-text-judgement'
	| 'single-text-analysis'
	| 'other';

export type EnglishPracticeEligibility = {
	available: boolean;
	requiresSourceContext: boolean;
	hasSourceContext: boolean;
	reason: string | null;
};

export type EnglishPracticeEligibilityInput = {
	subject?: string | null;
	prompt?: string | null;
	context?: string | null;
	selfContainedPrompt?: string | null;
	selfContainmentJson?: string | null;
	assets?: EnglishSourceAssetEvidence[] | null;
	renderingOverlay?: unknown;
	taskKind?: EnglishSourceTaskKind | null;
	reviewed?: boolean;
};

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function stringValues(value: unknown): string[] {
	if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
	if (Array.isArray(value)) return value.flatMap(stringValues);
	if (!value || typeof value !== 'object') return [];
	return Object.values(value as Record<string, unknown>).flatMap(stringValues);
}

function normalized(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizedLabel(value: string | null | undefined): string {
	return normalized(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function booleanMetadataValue(record: Record<string, unknown>, ...keys: string[]): boolean {
	return keys.some((key) => record[key] === true);
}

function requiredAssetLabels(value: string | null | undefined): string[] {
	const parsed = parseJsonRecord(value);
	const labels = parsed.required_asset_labels ?? parsed.requiredAssetLabels;
	return Array.isArray(labels)
		? [...new Set(labels.map((label) => normalized(String(label))).filter(Boolean))]
		: [];
}

function metadataRequiredSourceCount(value: string | null | undefined): number | null {
	const parsed = parseJsonRecord(value);
	for (const key of [
		'required_source_count',
		'requiredSourceCount',
		'source_count',
		'sourceCount'
	]) {
		const count = Number(parsed[key]);
		if (Number.isInteger(count) && count > 0) return count;
	}
	return null;
}

function metadataConfirmsCompleteSourceBundle(value: string | null | undefined): boolean {
	const parsed = parseJsonRecord(value);
	return booleanMetadataValue(
		parsed,
		'complete_source_bundle',
		'completeSourceBundle',
		'source_bundle_complete',
		'sourceBundleComplete'
	);
}

function metadataConfirmsSourceComplete(value: string | null | undefined): boolean {
	return parseJsonRecord(value).status === 'source_complete';
}

function selfContainmentRequiresSource(value: string | null | undefined): boolean {
	const parsed = parseJsonRecord(value);
	if (
		booleanMetadataValue(parsed, 'requires_context', 'requiresContext') ||
		booleanMetadataValue(parsed, 'requires_assets', 'requiresAssets')
	) {
		return true;
	}
	return requiredAssetLabels(value).length > 0;
}

export function englishLearnerVisibleContext({
	prompt,
	context,
	selfContainmentJson
}: Pick<EnglishPracticeEligibilityInput, 'prompt' | 'context' | 'selfContainmentJson'>): string {
	const visibleContext = context?.trim() ?? '';
	if (!visibleContext) return '';
	const parsed = parseJsonRecord(selfContainmentJson);
	if (
		booleanMetadataValue(parsed, 'requires_context', 'requiresContext') ||
		booleanMetadataValue(parsed, 'requires_assets', 'requiresAssets')
	) {
		return visibleContext;
	}
	if (/\b(?:figure|table)\s+\d+\b/i.test(`${prompt ?? ''}\n${visibleContext}`)) {
		return visibleContext;
	}
	return parsed.is_self_contained === true ? '' : visibleContext;
}

export function englishTaskRequiresSourceContext({
	prompt,
	context,
	selfContainedPrompt,
	selfContainmentJson,
	taskKind
}: Pick<
	EnglishPracticeEligibilityInput,
	'prompt' | 'context' | 'selfContainedPrompt' | 'selfContainmentJson' | 'taskKind'
>): boolean {
	if (selfContainmentRequiresSource(selfContainmentJson)) return true;
	if (
		taskKind === 'poetry-comparison' ||
		taskKind === 'extract-comparison' ||
		taskKind === 'extract-and-wider'
	) {
		return true;
	}
	const taskText = [prompt, context, selfContainedPrompt].filter(Boolean).join('\n');
	return [
		/\b(?:look|read)(?:\s+again)?\s+(?:at\s+)?lines?\s+\d+/i,
		/\b(?:from|in)\s+(?:these|the)\s+lines?\b/i,
		/\b(?:this|the|these|two|both|printed|following)\s+extracts?\b/i,
		/\bextract\s+from\b/i,
		/\b(?:source|text)\s*(?:[a-d]|[1-4])\b/i,
		/\b(?:both|the\s+two|these)\s+(?:texts|sources|poems|passages)\b/i,
		/\b(?:from|in|according\s+to)\s+(?:the|this)\s+(?:source|passage)\b/i,
		/\b(?:refer|referring)\s+to\s+(?:the|this)\s+(?:text|source|extract)\b/i,
		/\bread\s+(?:the\s+)?(?:two\s+)?(?:poems|passages|sources|extracts)\s+below\b/i,
		/\bfocus\s+(?:only\s+)?on\s+(?:the\s+)?(?:printed\s+)?extracts?\b/i,
		/\bstarting\s+with\s+(?:this|the)\s+(?:moment|passage|scene|section|episode)\b/i,
		/\b(?:this|the)\s+(?:moment|passage|scene|section|episode)\s+(?:above|below)\b/i,
		/\busing\s+(?:this|the)\s+(?:moment|passage|scene|section|episode)\b/i,
		/\brefer(?:ring)?\s+to\s+(?:act|scene|chapter|lines?)\b[\s\S]*\belsewhere\b/i
	].some((pattern) => pattern.test(taskText));
}

export function isUsableEnglishSourceAsset(asset: EnglishSourceAssetEvidence): boolean {
	if (!normalized(asset.publicPath)) return false;
	const description = normalized(
		[asset.role, asset.sourceLabel, asset.altText].filter(Boolean).join(' ')
	).toLowerCase();
	if (
		/\b(?:copyright|placeholder|not\s+reproduced|unavailable|missing\s+source|source[- ]defect|defect[- ]observation)\b/.test(
			description
		)
	) {
		return false;
	}
	return (
		/\b(?:source[- ]page|source[- ]text|extract|passage|poem|stimulus|printed\s+(?:poems?|extracts?))\b/.test(
			description
		) || Boolean(asset.required)
	);
}

function quotedContentLength(value: string): number {
	const matches = value.matchAll(/"([^"]{24,})"|“([^”]{24,})”|‘([^’]{24,})’/g);
	let total = 0;
	for (const match of matches) {
		total += (match[1] ?? match[2] ?? match[3] ?? '').trim().length;
	}
	return total;
}

function textLooksLikeImportedSource(value: string | null | undefined): boolean {
	const text = value?.trim() ?? '';
	if (!text) return false;
	const compact = normalized(text);
	if (quotedContentLength(text) >= 120) return true;
	const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;
	return compact.length >= 600 && lineCount >= 4;
}

type RenderingBlock = Record<string, unknown>;

function renderingOverlayBlocks(renderingOverlay: unknown): RenderingBlock[] {
	if (!renderingOverlay || typeof renderingOverlay !== 'object') return [];
	const record = renderingOverlay as Record<string, unknown>;
	return [record.stemBlocks, record.promptBlocks]
		.flatMap((value) => (Array.isArray(value) ? value : []))
		.filter((value): value is Record<string, unknown> =>
			Boolean(value && typeof value === 'object')
		);
}

const RENDERED_TEXT_BLOCK_KINDS = new Set([
	'paragraph',
	'table',
	'structured-table',
	'key',
	'ordered-list',
	'bullet-list',
	'equation'
]);

function renderedOverlayText(blocks: RenderingBlock[]): string {
	return blocks
		.filter((block) =>
			RENDERED_TEXT_BLOCK_KINDS.has(
				normalized(typeof block.kind === 'string' ? block.kind : '').toLowerCase()
			)
		)
		.flatMap(stringValues)
		.join('\n');
}

function visibleSourceAssets(
	assets: EnglishSourceAssetEvidence[] | null | undefined,
	blocks: RenderingBlock[]
): EnglishSourceAssetEvidence[] {
	const usableAssets = (assets ?? []).filter(isUsableEnglishSourceAsset);
	if (blocks.length === 0) return usableAssets;

	const renderedAssetIds = new Set(
		blocks
			.filter((block) => block.kind === 'figure' && typeof block.assetId === 'string')
			.map((block) => String(block.assetId))
	);
	return usableAssets.filter((asset) => {
		const rendererKey = normalized(asset.id) || normalized(asset.publicPath);
		return Boolean(rendererKey) && renderedAssetIds.has(rendererKey);
	});
}

function sourceOrdinal(value: string | null | undefined): string | null {
	const text = normalized(value).toLowerCase();
	const numbered = text.match(/\b(?:extract|poem|source|text|passage)\s*(?:number\s*)?([12ab])\b/i);
	if (numbered) return numbered[1].toLowerCase();
	const named = text.match(/\b(first|second)\s+(?:extract|poem|source|text|passage)\b/i);
	if (named) return named[1].toLowerCase() === 'first' ? '1' : '2';
	return null;
}

function markedSourceCount(text: string): number {
	const ordinals = new Set<string>();
	for (const match of text.matchAll(
		/\b(?:extract|poem|source|text|passage)\s*(?:number\s*)?([12ab])\b/gi
	)) {
		ordinals.add(match[1].toLowerCase());
	}
	for (const match of text.matchAll(
		/\b(first|second)\s+(?:extract|poem|source|text|passage)\b/gi
	)) {
		ordinals.add(match[1].toLowerCase() === 'first' ? '1' : '2');
	}
	return Math.min(ordinals.size, 2);
}

function assetMatchesRequiredLabel(
	asset: EnglishSourceAssetEvidence,
	requiredLabel: string
): boolean {
	const wanted = normalizedLabel(requiredLabel);
	if (!wanted) return false;
	return [asset.sourceLabel, asset.altText].some((value) => normalizedLabel(value) === wanted);
}

function visibleAssetsIdentifyDistinctSources(assets: EnglishSourceAssetEvidence[]): boolean {
	const ordinals = new Set(
		assets
			.map((asset) =>
				sourceOrdinal([asset.sourceLabel, asset.altText, asset.role].filter(Boolean).join(' '))
			)
			.filter((value): value is string => Boolean(value))
	);
	return ordinals.size >= 2;
}

function inferredRequiredSourceCount({
	prompt,
	selfContainedPrompt,
	selfContainmentJson,
	taskKind
}: Pick<
	EnglishPracticeEligibilityInput,
	'prompt' | 'selfContainedPrompt' | 'selfContainmentJson' | 'taskKind'
>): number | null {
	const explicit = metadataRequiredSourceCount(selfContainmentJson);
	if (explicit !== null) return explicit;
	const taskText = [prompt, selfContainedPrompt].filter(Boolean).join('\n');
	const comparesPrintedSourceWithStudiedPoem =
		/\b(?:and|with)\s+(?:in\s+)?(?:one\s+other|another|a\s+second)\s+poem\b/i.test(taskText) ||
		/\b(?:one\s+other|another|a\s+second)\s+poem\s+from\s+(?:the|your|an?)\s+(?:anthology|cluster)\b/i.test(
			taskText
		);
	if (taskKind === 'poetry-comparison' && comparesPrintedSourceWithStudiedPoem) return 1;
	if (
		/\b(?:two|both|these)\s+(?:extracts|poems|texts|sources|passages)\b/i.test(taskText) ||
		/\bcompare\b[\s\S]*\b(?:poems|extracts)\b/i.test(taskText)
	) {
		return 2;
	}
	if (taskKind === 'poetry-comparison' || taskKind === 'extract-comparison') return null;
	if (/\bcompare\b/i.test(taskText)) return null;
	return 1;
}

export function hasImportedEnglishSourceContext({
	prompt,
	context,
	assets,
	renderingOverlay,
	selfContainedPrompt,
	selfContainmentJson,
	taskKind
}: Pick<
	EnglishPracticeEligibilityInput,
	| 'prompt'
	| 'context'
	| 'assets'
	| 'renderingOverlay'
	| 'selfContainedPrompt'
	| 'selfContainmentJson'
	| 'taskKind'
>): boolean {
	const blocks = renderingOverlayBlocks(renderingOverlay);
	const visibleAssets = visibleSourceAssets(assets, blocks);
	const visibleText = blocks.length > 0 ? renderedOverlayText(blocks) : (context ?? '');
	const labels = requiredAssetLabels(selfContainmentJson);
	const requiredSourceCount = inferredRequiredSourceCount({
		prompt,
		selfContainedPrompt,
		selfContainmentJson,
		taskKind
	});
	if (requiredSourceCount === null) return false;

	if (labels.length > 0) {
		const everyRequiredAssetIsVisible = labels.every((label) =>
			visibleAssets.some((asset) => assetMatchesRequiredLabel(asset, label))
		);
		return (
			everyRequiredAssetIsVisible &&
			(requiredSourceCount === 1 ||
				labels.length >= requiredSourceCount ||
				metadataConfirmsCompleteSourceBundle(selfContainmentJson))
		);
	}

	if (requiredSourceCount > 1) {
		return (
			(textLooksLikeImportedSource(visibleText) &&
				markedSourceCount(visibleText) >= requiredSourceCount) ||
			visibleAssetsIdentifyDistinctSources(visibleAssets)
		);
	}

	return visibleAssets.length > 0 || textLooksLikeImportedSource(visibleText);
}

export function englishPracticeEligibility(
	input: EnglishPracticeEligibilityInput
): EnglishPracticeEligibility {
	if (input.reviewed === false) {
		return {
			available: false,
			requiresSourceContext: false,
			hasSourceContext: false,
			reason: ENGLISH_REVIEW_UNAVAILABLE_REASON
		};
	}

	const requiresSourceContext = englishTaskRequiresSourceContext(input);
	const hasSourceContext =
		!requiresSourceContext ||
		hasImportedEnglishSourceContext({
			prompt: input.prompt,
			context: englishLearnerVisibleContext(input),
			assets: input.assets,
			renderingOverlay: input.renderingOverlay,
			selfContainedPrompt: input.selfContainedPrompt,
			selfContainmentJson: input.selfContainmentJson,
			taskKind: input.taskKind
		});
	const sourceMetadataComplete =
		!requiresSourceContext ||
		normalized(input.subject).toLowerCase() !== 'english literature' ||
		metadataConfirmsSourceComplete(input.selfContainmentJson);
	const available = hasSourceContext && sourceMetadataComplete;
	return {
		available,
		requiresSourceContext,
		hasSourceContext,
		reason: available ? null : ENGLISH_SOURCE_CONTEXT_UNAVAILABLE_REASON
	};
}
