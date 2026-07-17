const CHAIN_MUTABLE_QUESTION_FIELDS = ['answerChain', 'chainResolution', 'commonWeakAnswers'];

export function preserveExtractionFactsForChainPhase(inputPaper, candidatePaper) {
	assertPaper(inputPaper, 'input extraction');
	assertPaper(candidatePaper, 'chain candidate');

	const inputQuestions = indexQuestions(inputPaper.questions, 'input extraction');
	const candidateQuestions = indexQuestions(candidatePaper.questions, 'chain candidate');
	const missingRefs = [...inputQuestions.keys()].filter((ref) => !candidateQuestions.has(ref));
	const extraRefs = [...candidateQuestions.keys()].filter((ref) => !inputQuestions.has(ref));
	if (missingRefs.length > 0 || extraRefs.length > 0) {
		throw new Error(
			`Chain candidate question refs differ from the input extraction: missing=${formatRefs(
				missingRefs
			)}, extra=${formatRefs(extraRefs)}.`
		);
	}

	const preservedPaper = cloneJson(inputPaper);
	preservedPaper.questions = inputPaper.questions.map((inputQuestion) => {
		const ref = questionRef(inputQuestion);
		const candidateQuestion = candidateQuestions.get(ref);
		const preservedQuestion = cloneJson(inputQuestion);
		for (const field of CHAIN_MUTABLE_QUESTION_FIELDS) {
			if (Object.hasOwn(candidateQuestion, field)) {
				preservedQuestion[field] = cloneJson(candidateQuestion[field]);
			}
		}
		return preservedQuestion;
	});
	return preservedPaper;
}

function assertPaper(value, label) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be a JSON object.`);
	}
	if (!Array.isArray(value.questions)) {
		throw new Error(`${label}.questions must be an array.`);
	}
}

function indexQuestions(questions, label) {
	const byRef = new Map();
	for (const question of questions) {
		const ref = questionRef(question);
		if (!ref) throw new Error(`${label} contains a question without sourceQuestionRef.`);
		if (byRef.has(ref)) throw new Error(`${label} contains duplicate question ref ${ref}.`);
		byRef.set(ref, question);
	}
	return byRef;
}

function questionRef(question) {
	return String(question?.sourceQuestionRef ?? '').trim();
}

function cloneJson(value) {
	if (value === undefined) return undefined;
	return JSON.parse(JSON.stringify(value));
}

function formatRefs(refs) {
	return refs.length > 0 ? refs.slice(0, 12).join(',') : 'none';
}
