/** Retire payloads for the removed `/practice/:chain/:ref` route family. */
export function deleteLegacyPracticePayloadsStatement() {
	return {
		sql: `DELETE FROM public_route_payloads
		      WHERE route_kind = 'practice'`,
		params: []
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
