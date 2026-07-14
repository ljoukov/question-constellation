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

/** @param {string[]} questionIds */
export function invalidateQuestionPracticePayloadsStatement(questionIds) {
	return {
		sql: `DELETE FROM public_route_payloads
		      WHERE route_kind = 'question-practice-page'
		        AND id IN (
		          SELECT 'question-practice-page:question-practice-page-v3:' || CAST(value AS TEXT)
		          FROM json_each(?)
		        )`,
		params: [JSON.stringify(questionIds)]
	};
}
