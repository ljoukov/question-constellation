const FIELD_ALIASES = {
	canonicalChainText: ['canonicalChainText', 'canonical_chain_text'],
	stepText: ['stepText', 'step_text'],
	stepRole: ['stepRole', 'step_role'],
	commonOmission: ['commonOmission', 'common_omission']
};

const GENERIC_NUMBERS = new Set([
	'0',
	'1',
	'2',
	'0.5',
	'.5',
	'10',
	'100',
	'1000',
	'10^3',
	'10^6',
	'10^9',
	'10^-3',
	'10^-6',
	'10^-9'
]);
const NUMBER_PATTERN =
	/(?<![A-Za-z\\])(?:\d+(?:[.,]\d+)?|\.\d+)(?:\s*(?:\\times|x|\*|\u00d7)\s*10\s*\^?\s*[-+]?\d+)?/g;
const CALCULATION_WORD_PATTERN =
	/\b(?:calculate|calculation|rearrange|substitute|equation|solve|gradient|mean|range|percentage|ratio|convert|conversion|efficiency|uncertainty)\b/i;
const SUBSTITUTION_PATTERN =
	/\b(?:substitute|calculate|computed?|equals?|gives?|answer|result|round(?:ed)?)\b[\s\S]{0,140}(?:=|\\times|\*|\u00d7)\s*[-+]?(?:\d|\.\d)/i;
const VARIABLE_ASSIGNMENT_PATTERN =
	/(?:^|[\s$,(])(?:[A-Za-z](?:_\{?[A-Za-z0-9]+\}?|_[A-Za-z0-9]+)?|E_\{?e\}?|\\Delta\s*[A-Za-z]+)\s*=\s*[-+]?(?:\d|\.\d)(?!\s*[A-Za-z_])/i;
const CONCRETE_UNIT_PATTERN =
	/(?:\d+(?:\.\d+)?|\.\d+)\s*(?:%|\\mathrm|\\text|J\b|N\b|kg\b|g\b|m\b|cm\b|mm\b|s\b|A\b|V\b|W\b|Hz\b|Pa\b|kPa\b|N\/m\b)/i;
const HALF_COEFFICIENT_SOURCE = String.raw`(?:\\frac\s*\{\s*1\s*\}\s*\{\s*2\s*\}|1\s*\/\s*2|0\.5|\.5|½)`;
const OPTIONAL_MULTIPLY_SOURCE = String.raw`(?:\s*(?:\\times|[x*×·])\s*|\s*)`;
const SQUARED_SOURCE = String.raw`(?:\^\s*\{?\s*2\s*\}?|²|\s+squared)`;
const REUSABLE_SYMBOLIC_FORMULA_PATTERNS = [
	new RegExp(
		String.raw`\bE(?:\s*_\s*\{?\s*e\s*\}?|e)?\s*=\s*${HALF_COEFFICIENT_SOURCE}${OPTIONAL_MULTIPLY_SOURCE}k${OPTIONAL_MULTIPLY_SOURCE}e\s*${SQUARED_SOURCE}`,
		'gi'
	),
	new RegExp(
		String.raw`\bE(?:\s*_\s*\{?\s*k\s*\}?|k)?\s*=\s*${HALF_COEFFICIENT_SOURCE}${OPTIONAL_MULTIPLY_SOURCE}m${OPTIONAL_MULTIPLY_SOURCE}v\s*${SQUARED_SOURCE}`,
		'gi'
	),
	/\bf\s*=\s*1\s*\/\s*T\b/gi,
	/\bT\s*=\s*1\s*\/\s*f\b/gi
];
const PHOTOSYNTHESIS_EQUATION_PATTERN =
	/6\s*C\s*O\s*(?:_?\s*\{?\s*2\s*\}?|₂)\s*\+\s*6\s*H\s*(?:_?\s*\{?\s*2\s*\}?|₂)\s*O\s*(?:->|→|=|\\rightarrow|\\to)\s*C\s*(?:_?\s*\{?\s*6\s*\}?|₆)\s*H\s*(?:_?\s*\{?\s*12\s*\}?|₁₂)\s*O\s*(?:_?\s*\{?\s*6\s*\}?|₆)\s*\+\s*6\s*O\s*(?:_?\s*\{?\s*2\s*\}?|₂)/gi;

function firstPresent(object, keys) {
	for (const key of keys) {
		if (object?.[key] !== undefined && object[key] !== null) return object[key];
	}
	return null;
}

function stringValue(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumberToken(value) {
	return value
		.replace(/\s+/g, '')
		.replace(/,/g, '')
		.replace(/\u00d7/g, 'x')
		.toLowerCase();
}

function maskReusableSymbolicFormulae(text) {
	let masked = String(text ?? '');
	for (const pattern of REUSABLE_SYMBOLIC_FORMULA_PATTERNS) {
		masked = masked.replace(pattern, ' reusable symbolic formula ');
	}
	return masked;
}

function textForNumberAudit(text) {
	return maskReusableSymbolicFormulae(text)
		.replace(/_\{?[A-Za-z]?\d+\}?/g, '_n')
		.replace(/\b([A-Za-z])(\d+)\b/g, '$1_n');
}

function textForFieldAudit(field) {
	const text = textForNumberAudit(field.text);
	if (field.path === 'id') return text.replace(/-[0-9a-f]{8,}$/i, '');
	return text;
}

function reusableNumericFactOnly(text, numbers) {
	if (!/\balpha(?:\s+particle|\s+decay)?\b[\s\S]{0,120}\b(?:mass\s+number\s+)?4\b/i.test(text)) {
		return false;
	}
	return numbers.every((token) => normalizeNumberToken(token) === '4');
}

function fixedPhotosynthesisEquationOnly(text) {
	PHOTOSYNTHESIS_EQUATION_PATTERN.lastIndex = 0;
	if (!PHOTOSYNTHESIS_EQUATION_PATTERN.test(text)) return false;
	PHOTOSYNTHESIS_EQUATION_PATTERN.lastIndex = 0;
	const remainingText = text.replace(PHOTOSYNTHESIS_EQUATION_PATTERN, ' ');
	return concreteNumbers(remainingText).length === 0;
}

function reusableCalculationConstantOnly(text, numbers) {
	const normalizedNumbers = numbers.map(normalizeNumberToken);
	if (
		normalizedNumbers.every((token) => token === '16') &&
		/\b(?:hex|hexadecimal|base\s*16|divide\s+by\s+16|remainders?|hex\s+digits?)\b/i.test(text)
	) {
		return true;
	}
	if (
		normalizedNumbers.every((token) => token === '8') &&
		/\b(?:bits?|bytes?|bit\s*depth|byte\s+conversion)\b/i.test(text)
	) {
		return true;
	}
	return false;
}

function numberTokens(text) {
	return Array.from(textForNumberAudit(text).matchAll(NUMBER_PATTERN)).map((match) => match[0]);
}

function concreteNumbers(text) {
	return numberTokens(text).filter((token) => !GENERIC_NUMBERS.has(normalizeNumberToken(token)));
}

function chainTextForClassification(chain, context = {}) {
	const steps = chain?.steps ?? [];
	return [
		chain?.title,
		firstPresent(chain, FIELD_ALIASES.canonicalChainText),
		chain?.summary,
		context.commandWord,
		...steps.flatMap((step) => [
			firstPresent(step, FIELD_ALIASES.stepText),
			firstPresent(step, FIELD_ALIASES.stepRole),
			step?.explanation,
			firstPresent(step, FIELD_ALIASES.commonOmission)
		])
	]
		.filter(Boolean)
		.join(' ');
}

function isCalculationLike(chain, context = {}) {
	return CALCULATION_WORD_PATTERN.test(chainTextForClassification(chain, context));
}

function chainFields(chain) {
	const fields = [];
	for (const [name, value] of [
		['title', chain?.title],
		['canonical_chain_text', firstPresent(chain, FIELD_ALIASES.canonicalChainText)],
		['summary', chain?.summary]
	]) {
		const text = stringValue(value);
		if (text) fields.push({ path: name, text, core: true });
	}

	for (const [index, step] of (chain?.steps ?? []).entries()) {
		for (const [name, value, core] of [
			['step_text', firstPresent(step, FIELD_ALIASES.stepText), true],
			['explanation', step?.explanation, false],
			['common_omission', firstPresent(step, FIELD_ALIASES.commonOmission), false]
		]) {
			const text = stringValue(value);
			if (text) fields.push({ path: `steps[${index}].${name}`, text, core });
		}
	}

	return fields;
}

export function answerChainSpecificityIssues(chain, context = {}) {
	if (!chain) return [];
	const issues = [];
	const calculationLike = isCalculationLike(chain, context);

	for (const field of chainFields(chain)) {
		const auditText = textForFieldAudit(field);
		const numbers = concreteNumbers(auditText);
		const hasConcreteUnit = CONCRETE_UNIT_PATTERN.test(auditText);
		const hasVariableAssignment = VARIABLE_ASSIGNMENT_PATTERN.test(auditText);
		const hasSubstitution =
			hasVariableAssignment ||
			(SUBSTITUTION_PATTERN.test(auditText) && (numbers.length > 0 || hasConcreteUnit));
		const shouldWarnForReusableFact = reusableNumericFactOnly(auditText, numbers);
		const usesReusableCalculationConstant = reusableCalculationConstantOnly(auditText, numbers);
		const usesFixedScientificEquation = fixedPhotosynthesisEquationOnly(auditText);

		if (hasSubstitution) {
			issues.push({
				severity: 'error',
				code: 'chain_numeric_substitution',
				field: field.path,
				evidence: field.text,
				message:
					'Answer-chain text includes numeric substitution or a calculated result. Put solved values in model answers or checklist evidence, not reusable chain steps.'
			});
			continue;
		}

		if (
			numbers.length > 0 &&
			calculationLike &&
			!shouldWarnForReusableFact &&
			!usesReusableCalculationConstant &&
			!usesFixedScientificEquation
		) {
			issues.push({
				severity: 'error',
				code: 'chain_prompt_specific_number',
				field: field.path,
				evidence: field.text,
				numbers,
				message:
					'Calculation-chain text includes concrete numeric values. Use variables and generic method wording instead.'
			});
			continue;
		}

		if (
			numbers.length > 0 &&
			(field.core || hasConcreteUnit) &&
			!usesReusableCalculationConstant &&
			!usesFixedScientificEquation
		) {
			issues.push({
				severity: 'warning',
				code: 'chain_numeric_review',
				field: field.path,
				evidence: field.text,
				numbers,
				message:
					'Answer-chain text contains numeric values. Check that these are reusable facts or formula constants, not one-question solution values.'
			});
		}
	}

	return issues;
}

export function blockingAnswerChainSpecificityIssues(chain, context = {}) {
	return answerChainSpecificityIssues(chain, context).filter((issue) => issue.severity === 'error');
}

export function chainSpecificityIssueSummary(issues, limit = 8) {
	return issues
		.slice(0, limit)
		.map((issue) => `${issue.code} at ${issue.field}: ${issue.evidence}`)
		.join('; ');
}
