const renderBlockFields = [
	'text',
	'html',
	'caption',
	'label',
	'title',
	'description',
	'formula',
	'latex',
	'columns',
	'rows',
	'items',
	'keyItems'
];

const examBookletFooterPatterns = [
	/\badditional page,?\s*if required\b/i,
	/\bwrite the question numbers? in the left[- ]hand margin\b/i,
	/\bthere are no questions(?: printed)? on this page\b/i,
	/\bdo not write (?:outside|on) (?:the|this) (?:box|page)\b/i,
	/\bend of questions\b/i,
	/(?:^|\n)\s*turn over\s*(?:\n|$)/i,
	/\bcopyright\s*(?:©|\(c\))\s*(?:20\d{2})?/i,
	/©\s*20\d{2}\s+(?:AQA|Pearson|OCR|WJEC|Eduqas)\b/i
];

/**
 * Cross-subject learner-surface checks shared by the legacy extractor audit and
 * the isolated Codex helper. These checks intentionally fail closed when the
 * response control or source context cannot be made faithful deterministically.
 */
export function learnerFacingExtractionIssues(question) {
	const renderedText = renderedLearnerText(question);
	const allSurfaceText = allLearnerSurfaceText(question);
	return [
		...referencedHypothesisIssues(question, renderedText),
		...equilibriumSourceIssues(question, renderedText),
		...equationCompletionResponseIssues(question, renderedText),
		...namedResponseFieldIssues(question, renderedText),
		...examBookletFooterIssues(allSurfaceText),
		...adjacentAssetIssues(question, renderedText)
	];
}

function referencedHypothesisIssues(question, renderedText) {
	if (!referencesExistingHypothesis(renderedText) || asksLearnerToCreateHypothesis(renderedText)) {
		return [];
	}
	if (containsExplicitHypothesisStatement(question, renderedText)) return [];
	return [
		issue({
			code: 'referenced_hypothesis_missing_statement',
			field: 'stemBlocks/leadBlocks/contextText',
			evidence: excerpt(renderedText, /\bhypothesis\b/i),
			message:
				'The task refers to an existing hypothesis, but the hypothesis itself is not learner-visible. Carry the exact source hypothesis into a rendered stem/lead block; selfContainedPromptText alone is not enough.'
		})
	];
}

function referencesExistingHypothesis(text) {
	return (
		/\b(?:their|the|this|that|students?'|scientists?'|researchers?'|investigation(?:'s)?)\s+hypothesis\b/i.test(
			text
		) ||
		/\bhypothesis\b[^.?\n]{0,90}\b(?:support(?:ed|s)?|correct|valid|accept(?:ed)?|reject(?:ed)?|conclusion)\b/i.test(
			text
		)
	);
}

function asksLearnerToCreateHypothesis(text) {
	return /\b(?:state|write|give|suggest|formulate|propose|devise)\b[^.?\n]{0,70}\b(?:a|the|their)?\s*hypothesis\b/i.test(
		text
	);
}

function containsExplicitHypothesisStatement(question, text) {
	if (
		/\bhypothesis\s+(?:was|is)\s+that\s+[^.?\n]{8,}/i.test(text) ||
		/\bhypothesis\s*[:\u2014-]\s*[^.?\n]{8,}/i.test(text) ||
		/\b(?:hypothesised|hypothesized|predicted)\s+that\s+[^.?\n]{8,}/i.test(text)
	) {
		return true;
	}
	return renderBlocks(question).some((block) => {
		const label = String(block?.label ?? block?.title ?? '').trim();
		if (!/^hypothesis$/i.test(label)) return false;
		const content = renderBlockFields
			.filter((field) => !['label', 'title'].includes(field))
			.map((field) => stringify(block?.[field]))
			.filter(Boolean)
			.join(' ')
			.trim();
		return content.split(/\s+/).filter(Boolean).length >= 2;
	});
}

function equilibriumSourceIssues(question, renderedText) {
	if (!requiresPressureEquilibriumSource(renderedText)) return [];
	if (containsReversibleEquation(question, renderedText)) return [];
	return [
		issue({
			code: 'equilibrium_pressure_missing_reversible_equation',
			field: 'stemBlocks/leadBlocks',
			evidence: excerpt(renderedText, /\bpressure\b/i),
			message:
				'A reaction-specific pressure/equilibrium task must show the exact reversible equation, including coefficients or other molecule-count evidence. Do not rely on a sibling question, the mark scheme, or a generic reaction summary.'
		})
	];
}

function requiresPressureEquilibriumSource(text) {
	return (
		/\bpressure\b/i.test(text) &&
		/\b(?:equilibrium|yield|position)\b/i.test(text) &&
		/\b(?:increase|decrease|change|effect|higher|lower|shift|move|alter|affect)\w*\b/i.test(text)
	);
}

function containsReversibleEquation(question, renderedText) {
	const equationText = [renderedText, ...renderBlocks(question).map(blockEquationText)].join('\n');
	const arrowPattern =
		/(?:\u21cc|\u21c4|\u2194|<=>|\\rightleftharpoons|\\leftrightharpoons|\\rightleftarrows)/i;
	const match = arrowPattern.exec(equationText);
	if (!match) return false;
	const lineStart = equationText.lastIndexOf('\n', match.index - 1) + 1;
	const nextLineBreak = equationText.indexOf('\n', match.index + match[0].length);
	const lineEnd = nextLineBreak === -1 ? equationText.length : nextLineBreak;
	const before = equationText.slice(lineStart, match.index).trim();
	const after = equationText.slice(match.index + match[0].length, lineEnd).trim();
	return hasChemicalEquationSide(before) && hasChemicalEquationSide(after);
}

function hasChemicalEquationSide(value) {
	const normalized = String(value ?? '')
		.replace(/\\(?:mathrm|text)\{([^}]*)\}/g, '$1')
		.replace(/[{}$]/g, '')
		.replace(/\\_/g, '_');
	return /(?:\b\d+\s*)?(?:(?:[A-Z][a-z]?){2,}|[A-Z][a-z]?(?:_?\d|[₀-₉])|[A-Z][a-z]?\s*\((?:s|l|g|aq)\))/.test(
		normalized
	);
}

function equationCompletionResponseIssues(question, renderedText) {
	if (!asksToCompleteEquation(renderedText) || question?.response?.kind === 'equation-blanks') {
		return [];
	}
	return [
		issue({
			code: 'equation_completion_requires_equation_blanks',
			field: 'response.kind',
			evidence: String(question?.response?.kind ?? 'missing'),
			message:
				'An equation-completion task needs response.kind="equation-blanks" with the printed equation segments, keyed blank ids, and correctAnswers. Generic ruled lines lose the actual input surface.'
		})
	];
}

function asksToCompleteEquation(text) {
	return (
		/\b(?:complete|finish|fill\s+in|balance)\b[^.?\n]{0,100}\b(?:word|symbol|balanced|chemical|ionic)?\s*equation\b/i.test(
			text
		) ||
		/\b(?:word|symbol|balanced|chemical|ionic)?\s*equation\b[^.?\n]{0,60}\b(?:complete|finish|fill\s+in|balance)\b/i.test(
			text
		)
	);
}

function namedResponseFieldIssues(question, renderedText) {
	if (!requiresMultipleNamedFields(question, renderedText)) return [];
	if (question?.response?.kind === 'labeled-lines') return [];
	return [
		issue({
			code: 'multiple_named_fields_require_labeled_lines',
			field: 'response.kind',
			evidence: String(question?.response?.kind ?? 'missing'),
			message:
				'A task with multiple separately named written fields (for example Test and Result) needs response.kind="labeled-lines" with one faithful field per printed label, not one generic textarea.'
		})
	];
}

function requiresMultipleNamedFields(question, text) {
	const response = question?.response ?? {};
	const responseMayRepresentWrittenFields =
		!response.kind || ['lines', 'labeled-lines'].includes(response.kind);
	if (
		responseMayRepresentWrittenFields &&
		Array.isArray(response.fields) &&
		response.fields.length >= 2
	)
		return true;
	if (
		responseMayRepresentWrittenFields &&
		Array.isArray(response.labels) &&
		response.labels.length >= 2
	)
		return true;
	return (
		/\btest\s*:\s*[^\n]{0,120}\b(?:result|observation)\s*:/i.test(text) ||
		/\b(?:give|state|write|name|identify)\b[^.?\n]{0,100}\btest\b[^.?\n]{0,70}\b(?:and|,)\s*(?:the\s+)?(?:result|observation)\b/i.test(
			text
		) ||
		/\b(?:give|state|write|name|identify|describe)\b[^.?\n]{0,100}\btest\b[^.?\n]{0,100}\b(?:give|state|write|name|identify|describe)\b[^.?\n]{0,70}\b(?:result|observation)\b/i.test(
			text
		)
	);
}

function examBookletFooterIssues(text) {
	const pattern = examBookletFooterPatterns.find((candidate) => candidate.test(text));
	if (!pattern) return [];
	return [
		issue({
			code: 'exam_booklet_footer_in_learner_content',
			field: 'promptText/selfContainedPromptText/contextText/renderBlocks',
			evidence: excerpt(text, pattern),
			message:
				'Exam-booklet furniture or footer text leaked into the question. Strip Additional page, margin instructions, copyright/footer, turn-over, and end-of-paper material before import.'
		})
	];
}

function adjacentAssetIssues(question, renderedText) {
	const issues = [];
	const pageStart = Number(question?.pageStart);
	const pageEnd = Number(question?.pageEnd);
	const referencedLabels = learnerSurfaceLabels(question, renderedText);
	for (const [index, asset] of (question?.assets ?? []).entries()) {
		if (asset?.needsHumanReview === true) {
			issues.push(
				issue({
					code: 'asset_dependency_needs_review',
					field: `assets[${index}].needsHumanReview`,
					evidence: assetLabel(asset) || String(index),
					message:
						'An asset dependency is still review-marked. Verify that it is the exact relevant source crop for this atomic question before publication.'
				})
			);
		}
		const assetPage = Number(asset?.pageNumber ?? asset?.page);
		if (
			!Number.isInteger(assetPage) ||
			!Number.isInteger(pageStart) ||
			!Number.isInteger(pageEnd) ||
			(assetPage >= pageStart && assetPage <= pageEnd)
		) {
			continue;
		}
		const label = assetLabel(asset);
		if (label && [...referencedLabels].some((candidate) => labelsMatch(candidate, label))) continue;
		issues.push(
			issue({
				code: 'adjacent_asset_not_bound_to_learner_surface',
				field: `assets[${index}]`,
				evidence: `${label || 'unlabelled asset'} from page ${assetPage}; question pages ${pageStart}-${pageEnd}`,
				message:
					'An asset carried from an adjacent page is not explicitly referenced by this question, a rendered block, or its response control. Remove the unrelated asset or bind the verified dependency to the learner-visible surface.'
			})
		);
	}
	return issues;
}

function learnerSurfaceLabels(question, renderedText) {
	const labels = new Set();
	for (const match of renderedText.matchAll(
		/\b(?:figure|fig\.?|table|graph|diagram|image)\s+\d+[A-Za-z]?\b/gi
	)) {
		labels.add(match[0]);
	}
	for (const block of renderBlocks(question)) {
		for (const value of [block?.label, block?.assetLabel, block?.sourceLabel, block?.assetId]) {
			if (String(value ?? '').trim()) labels.add(String(value).trim());
		}
	}
	const response = question?.response ?? {};
	for (const value of [
		response.assetLabel,
		response.sourceLabel,
		response.assetId,
		...(Array.isArray(response.assets) ? response.assets : [])
	]) {
		if (String(value ?? '').trim()) labels.add(String(value).trim());
	}
	return labels;
}

function assetLabel(asset) {
	return String(
		asset?.sourceLabel ?? asset?.assetLabel ?? asset?.label ?? asset?.assetId ?? asset?.id ?? ''
	).trim();
}

function labelsMatch(left, right) {
	const normalize = (value) =>
		String(value ?? '')
			.toLowerCase()
			.replace(/\bfig\.?\s*/g, 'figure ')
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();
	const a = normalize(left);
	const b = normalize(right);
	return Boolean(a && b && (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `)));
}

function renderedLearnerText(question) {
	return [
		question?.promptText,
		question?.contextText,
		...renderBlocks(question).map(renderBlockText)
	]
		.map(stringify)
		.filter(Boolean)
		.join('\n');
}

function allLearnerSurfaceText(question) {
	return [question?.selfContainedPromptText, renderedLearnerText(question)]
		.map(stringify)
		.filter(Boolean)
		.join('\n');
}

function renderBlocks(question) {
	return ['stemBlocks', 'leadBlocks', 'promptBlocks', 'afterResponseBlocks'].flatMap((field) =>
		Array.isArray(question?.[field]) ? question[field] : []
	);
}

function renderBlockText(block) {
	return renderBlockFields
		.map((field) => stringify(block?.[field]))
		.filter(Boolean)
		.join(' ');
}

function blockEquationText(block) {
	return [block?.text, block?.formula, block?.latex, block?.html]
		.map(stringify)
		.filter(Boolean)
		.join(' ');
}

function stringify(value) {
	if (value === null || value === undefined) return '';
	if (['string', 'number', 'boolean'].includes(typeof value)) return String(value);
	if (Array.isArray(value)) return value.map(stringify).filter(Boolean).join(' ');
	if (typeof value === 'object')
		return Object.values(value).map(stringify).filter(Boolean).join(' ');
	return '';
}

function excerpt(text, pattern) {
	const value = String(text ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	const match = pattern.exec(value);
	if (!match) return value.slice(0, 220);
	const start = Math.max(0, match.index - 70);
	return value.slice(start, start + 220);
}

function issue({ code, field, evidence, message }) {
	return { severity: 'error', code, field, evidence, message };
}
