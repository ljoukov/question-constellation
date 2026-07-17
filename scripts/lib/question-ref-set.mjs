export function exactQuestionRefSetMatches({ checkedRefs, questions, additionalRefs = [] }) {
	if (!Array.isArray(checkedRefs) || !Array.isArray(questions) || !Array.isArray(additionalRefs)) {
		return false;
	}
	const actual = checkedRefs.map(String).sort();
	const expected = [
		...questions.map((question) => String(question?.sourceQuestionRef ?? '')),
		...additionalRefs.map(String)
	].sort();
	return (
		actual.length === expected.length &&
		actual.every((sourceQuestionRef, index) =>
			Boolean(sourceQuestionRef && sourceQuestionRef === expected[index])
		)
	);
}
