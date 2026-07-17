/**
 * @typedef {{
 *   stepText?: unknown,
 *   step_text?: unknown,
 *   stepRole?: unknown,
 *   step_role?: unknown,
 *   explanation?: unknown,
 *   commonOmission?: unknown,
 *   common_omission?: unknown
 * }} SharedChainStepInput
 *
 * @typedef {{
 *   title?: unknown,
 *   canonicalChainText?: unknown,
 *   canonical_chain_text?: unknown,
 *   summary?: unknown,
 *   steps?: SharedChainStepInput[] | null
 * }} SharedChainDefinitionInput
 *
 * @typedef {{
 *   title: string,
 *   canonicalChainText: string,
 *   summary: string,
 *   steps: Array<{
 *     stepText: string,
 *     stepRole: string,
 *     explanation: string,
 *     commonOmission: string
 *   }>
 * }} NormalizedSharedChainDefinition
 */

/**
 * A published/shared chain is safe to reuse only when every incoming action
 * preserves the existing definition and the complete learner-visible
 * definition is byte-for-byte equivalent after normalization.
 *
 * @param {{actions: unknown, definitionUnchanged: unknown}} input
 */
export function sharedChainReuseIsSafe({ actions, definitionUnchanged }) {
	return (
		Array.isArray(actions) &&
		actions.length > 0 &&
		actions.every((action) => action === 'reuse_existing' || action === 'update_existing') &&
		definitionUnchanged === true
	);
}

/**
 * Collect one normalized definition per incoming chain id. Repeated uses are
 * valid only when every occurrence has the same complete learner-visible
 * definition after whitespace normalization.
 *
 * @param {Array<{chainId: unknown, definition: SharedChainDefinitionInput | null | undefined, source?: unknown}>} entries
 * @returns {Map<string, NormalizedSharedChainDefinition>}
 */
export function collectConsistentIncomingChainDefinitions(entries) {
	const definitions = new Map();
	const firstSources = new Map();
	for (const entry of Array.isArray(entries) ? entries : []) {
		const chainId = String(entry?.chainId ?? '').trim();
		if (!chainId) throw new Error('Incoming answer chain has no stable id.');
		const definition = normalizeSharedChainDefinition(entry?.definition);
		const previous = definitions.get(chainId);
		if (previous && !sharedChainDefinitionsEqual(previous, definition)) {
			const firstSource = firstSources.get(chainId);
			const currentSource = String(entry?.source ?? '').trim();
			const sourceDetail =
				firstSource || currentSource
					? ` (${[firstSource, currentSource].filter(Boolean).join(' versus ')})`
					: '';
			throw new Error(
				`Incoming answer chain ${chainId} has divergent learner-visible definitions${sourceDetail}.`
			);
		}
		if (!previous) {
			definitions.set(chainId, definition);
			firstSources.set(chainId, String(entry?.source ?? '').trim());
		}
	}
	return definitions;
}

/**
 * @param {NormalizedSharedChainDefinition | null | undefined} left
 * @param {NormalizedSharedChainDefinition | null | undefined} right
 */
export function sharedChainDefinitionsEqual(left, right) {
	if (!left || !right) return false;
	return JSON.stringify(left) === JSON.stringify(right);
}

/** @param {SharedChainDefinitionInput | null | undefined} chain */
export function normalizeSharedChainDefinition(chain) {
	return {
		title: normalizeChainText(chain?.title),
		canonicalChainText: normalizeChainText(
			chain?.canonicalChainText ?? chain?.canonical_chain_text
		),
		summary: normalizeChainText(chain?.summary),
		steps: (Array.isArray(chain?.steps) ? chain.steps : []).map(normalizeSharedChainStep)
	};
}

/** @param {SharedChainStepInput | null | undefined} step */
export function normalizeSharedChainStep(step) {
	return {
		stepText: normalizeChainText(step?.stepText ?? step?.step_text),
		stepRole: normalizeChainText(step?.stepRole ?? step?.step_role),
		explanation: normalizeChainText(step?.explanation),
		commonOmission: normalizeChainText(step?.commonOmission ?? step?.common_omission)
	};
}

/** @param {unknown} value */
function normalizeChainText(value) {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim();
}
