import { isDeepStrictEqual } from 'node:util';

/**
 * Supporting-document identity is an ordered contract. Extra fields, a
 * missing row, a reordered row, or a historical type guess are all different
 * evidence and must invalidate phase reuse.
 *
 * @param {unknown} actual
 * @param {unknown} expected
 */
export function exactSupportingDocumentMetadataMatches(actual, expected) {
	return Array.isArray(actual) && Array.isArray(expected) && isDeepStrictEqual(actual, expected);
}
