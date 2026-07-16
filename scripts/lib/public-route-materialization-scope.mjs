/**
 * @param {string[]} chainIds
 * @param {string[]} retainedPayloadIds
 */
export function deleteStalePracticePayloadsStatement(chainIds, retainedPayloadIds) {
	return {
		sql: `DELETE FROM public_route_payloads
		      WHERE route_kind = 'practice'
		        AND EXISTS (
		          SELECT 1 FROM json_each(?) AS owned_chain
		          WHERE instr(
		            public_route_payloads.id,
		            'practice:' || CAST(owned_chain.value AS TEXT) || ':'
		          ) = 1
		        )
		        AND id NOT IN (SELECT CAST(value AS TEXT) FROM json_each(?))`,
		params: [JSON.stringify(chainIds), JSON.stringify(retainedPayloadIds)]
	};
}

/**
 * A full materialization owns the complete legacy `/practice/:chain/:ref`
 * namespace. Remove anything the current reviewed data did not reproduce,
 * including payloads for chains that are no longer publication-eligible.
 *
 * @param {string[]} retainedPayloadIds
 */
export function deleteAllStalePracticePayloadsStatement(retainedPayloadIds) {
	return {
		sql: `DELETE FROM public_route_payloads
		      WHERE route_kind = 'practice'
		        AND id NOT IN (SELECT CAST(value AS TEXT) FROM json_each(?))`,
		params: [JSON.stringify(retainedPayloadIds)]
	};
}

/** @param {string} currentSourceVersion */
export function deleteStaleQuestionPracticePayloadVersionsStatement(currentSourceVersion) {
	return {
		sql: `DELETE FROM public_route_payloads
		      WHERE route_kind = 'question-practice-page'
		        AND (source_version IS NULL OR source_version <> ?)`,
		params: [currentSourceVersion]
	};
}

/** @param {string[]} questionIds */
export function invalidateQuestionPracticePayloadsStatement(questionIds) {
	return {
		sql: `DELETE FROM public_route_payloads
		      WHERE route_kind = 'question-practice-page'
		        AND route_path IN (
		          SELECT '/questions/' || CAST(value AS TEXT) || '/practice'
		          FROM json_each(?)
		        )`,
		params: [JSON.stringify(questionIds)]
	};
}
