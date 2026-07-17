import { isDeepStrictEqual } from 'node:util';
import { exactJsonArtifactMatches } from './phase-input-binding.mjs';

export const EXISTING_CHAIN_CONTEXT_MODEL_SNAPSHOT_SCHEMA =
	'existing-chain-context-model-snapshot-v1';

/**
 * @param {{source: any, snapshot: any, generation?: any}} evidence
 */
export function existingChainContextSnapshotDerivation({ source, snapshot, generation = null }) {
	return {
		schemaVersion: EXISTING_CHAIN_CONTEXT_MODEL_SNAPSHOT_SCHEMA,
		source,
		snapshot,
		generation
	};
}

/**
 * @param {{source: any, snapshot: any, derivation: any, generation?: any}} evidence
 */
export function exactExistingChainContextSnapshotEvidenceMatches({
	source,
	snapshot,
	derivation,
	generation = null
}) {
	return (
		Boolean(source?.path) &&
		Boolean(snapshot?.path) &&
		exactJsonArtifactMatches(source, snapshot) &&
		isDeepStrictEqual(
			derivation,
			existingChainContextSnapshotDerivation({ source, snapshot, generation })
		)
	);
}
