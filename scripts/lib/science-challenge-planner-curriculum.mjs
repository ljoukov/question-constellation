const MIN_SUBSTANTIVE_BODY_WORDS = 12;
const MIN_SUBSTANTIVE_BODY_CHARACTERS = 50;

const NON_SUBSTANTIVE_LINE_PATTERNS = Object.freeze([
	/^(?:content|key opportunities for(?: skills)?|skills development)$/u,
	/^content key opportunities for(?: skills)?(?: development)?$/u,
	/^(?:\d+\s+)?visit aqa org uk\b.*$/u,
	/^aqa education\b.*$/u,
	/^copyright\b.*$/u,
	/^gcse (?:biology|chemistry|physics)\b.*(?:specification|version)\b.*$/u,
	/^version \d+\b.*$/u,
	/^page \d+$/u,
	/^\d+$/u
]);

export function trueCurriculumTopicLeaves(components) {
	const componentById = validatedComponentIndex(components);
	const parentIds = new Set();
	for (const component of components) {
		const parentId = nonEmptyString(component.parentId);
		if (!parentId) continue;
		if (!componentById.has(parentId)) {
			throw new Error(`Curriculum component ${component.id} refers to missing parent ${parentId}.`);
		}
		parentIds.add(parentId);
	}
	return components.filter(
		(component) => component.kind === 'topic' && !parentIds.has(component.id)
	);
}

export function substantiveCurriculumEvidenceBody(component, sourceText) {
	assertComponentIdentity(component);
	const heading = normalizeEvidenceLine(`${component.code} ${component.title}`);
	const normalizedText = String(sourceText ?? '')
		.split(/\r?\n/u)
		.map(normalizeEvidenceLine)
		.filter((normalized) => {
			return (
				normalized &&
				normalized !== heading &&
				!NON_SUBSTANTIVE_LINE_PATTERNS.some((pattern) => pattern.test(normalized))
			);
		})
		.join(' ')
		.replace(/\s+/gu, ' ')
		.trim();
	if (normalizedText === heading) return '';
	if (normalizedText.startsWith(`${heading} `)) {
		return normalizedText.slice(heading.length + 1).trim();
	}
	return normalizedText;
}

export function assertSubstantiveCurriculumEvidence(component, sourceText) {
	const body = substantiveCurriculumEvidenceBody(component, sourceText);
	const wordCount = body.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
	const characterCount = body.replace(/\s+/gu, '').length;
	if (wordCount < MIN_SUBSTANTIVE_BODY_WORDS || characterCount < MIN_SUBSTANTIVE_BODY_CHARACTERS) {
		throw new Error(
			`Curriculum component ${component.id} has no substantive source evidence beyond its heading ` +
				`(${wordCount} body words and ${characterCount} non-space body characters).`
		);
	}
	return body;
}

function validatedComponentIndex(components) {
	if (!Array.isArray(components)) {
		throw new TypeError('Curriculum components must be an array.');
	}
	const componentById = new Map();
	for (const component of components) {
		assertComponentIdentity(component);
		if (componentById.has(component.id)) {
			throw new Error(`Curriculum components duplicate id ${component.id}.`);
		}
		componentById.set(component.id, component);
	}
	return componentById;
}

function assertComponentIdentity(component) {
	if (!component || typeof component !== 'object' || Array.isArray(component)) {
		throw new TypeError('Curriculum component must be an object.');
	}
	for (const field of ['id', 'code', 'title']) {
		if (!nonEmptyString(component[field])) {
			throw new Error(`Curriculum component ${field} must be a non-empty string.`);
		}
	}
}

function nonEmptyString(value) {
	return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeEvidenceLine(value) {
	return String(value ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, ' ')
		.trim();
}
