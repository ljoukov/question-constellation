export const UNSUPPORTED_PAPER_SITTING_RESPONSE_KINDS = new Set([
	'none',
	'asset-canvas',
	'drawing-box'
]);

/** @param {unknown} kind */
export function isUnsupportedPaperSittingResponseKind(kind) {
	return typeof kind === 'string' && UNSUPPORTED_PAPER_SITTING_RESPONSE_KINDS.has(kind);
}
