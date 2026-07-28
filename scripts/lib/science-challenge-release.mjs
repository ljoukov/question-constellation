import { createHash } from 'node:crypto';

import {
	SCIENCE_CHALLENGE_CODEX_SDK_MODEL,
	SCIENCE_CHALLENGE_CODEX_SDK_TRANSPORT,
	SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_MULTIPART_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './science-challenge-authoring-transport.mjs';

export const SCIENCE_CHALLENGE_RELEASE_SCHEMA = 'science-challenge-release/v1';
export const SCIENCE_CHALLENGE_PLAN_SCHEMA = 'science-challenge-plan/v2';
export const SCIENCE_CHALLENGE_BATCH_SCHEMA = 'science-challenge-batch/v1';
export const SCIENCE_QUESTION_ART_SCHEMA = 'science-question-art/v1';
export const SCIENCE_QUESTION_ART_MANIFEST_SCHEMA = 'science-question-art-manifest/v1';
export const SCIENCE_QUESTION_ART_DELIVERY_SCHEMA = 'science-question-art-r2-delivery/v1';
export const SCIENCE_QUESTION_ART_REVIEW_SCHEMA = 'science-question-art-review-summary/v2';
export const SCIENCE_QUESTION_ART_REVIEW_INPUT_SCHEMA = 'science-question-art-review-input/v2';
export const SCIENCE_CHALLENGE_PROMPT_VERSION = 'science-challenge-authoring-v3';
export const SCIENCE_CHALLENGE_NORMALIZATION_VERSION = 'science-challenge-output-normalization/v1';

export const SCIENCE_SUBJECTS = Object.freeze(['biology', 'chemistry', 'physics']);
export const CHALLENGE_ARCS = Object.freeze([
	'read-the-evidence',
	'complete-the-method',
	'connect-cause-to-effect',
	'mark-the-working',
	'track-the-forces'
]);
export const CHALLENGE_MECHANICS = Object.freeze(['missing-link', 'first-wrong-step']);
export const CHALLENGE_DIFFICULTIES = Object.freeze(['starter', 'standard', 'stretch']);
export const CHALLENGE_WEAK_ANSWER_KINDS = Object.freeze([
	'incomplete',
	'incorrect-claim',
	'wrong-value',
	'off-command'
]);
export const SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS = Object.freeze([
	'curriculumGrounded',
	'paperCalibrated',
	'scientificallyCorrect',
	'contextsDistinct',
	'selfContained',
	'flowCoherent',
	'choicesFair',
	'difficultyCalibrated',
	'learnerCopyClean',
	'artBriefsSafe',
	'heroTeaserSafe'
]);
export const SCIENCE_ART_REVIEW_BOOLEAN_FIELDS = Object.freeze([
	'scientificallyAccurate',
	'exactlyRelevant',
	'briefConsistentWithQuestion',
	'visibleNotationMatchesQuestion',
	'answerNeutral',
	'textClean',
	'themeConsistent',
	'visuallyPolished',
	'mobileSafe',
	'accessibleAlt'
]);
export const SCIENCE_ART_REVIEW_ISSUE_CATEGORIES = Object.freeze([
	'science',
	'relevance',
	'leakage',
	'text',
	'theme',
	'quality',
	'mobile',
	'accessibility',
	'duplication'
]);
export const SCIENCE_ART_REVIEW_ISSUE_SEVERITIES = Object.freeze(['major', 'minor']);
export const SCIENCE_ART_REVIEW_DISPOSITIONS = Object.freeze([
	'accept',
	'retain-with-annotation',
	'fresh-regenerate'
]);

const REVIEW_REBASE_PARENT_CHAIN_KIND = 'review-rebase-successor';
const REVIEW_REBASE_PARENT_CHAIN_HASH_FIELDS = Object.freeze([
	'reviewRebaseManifestSha256',
	'reviewRebaseId',
	'parentVerificationSha256',
	'parentRepairSha256',
	'reviewRebasePlanSha256',
	'reviewRebaseCandidateSetSha256',
	'reviewRebaseCollectionValidationSha256',
	'reviewRebaseCollectionRemediationSetSha256',
	'reviewRebaseCollectionRemediationTargetSetSha256',
	'firstVerificationSha256',
	'mutableTargetSetSha256',
	'successorObjectiveId',
	'successorExecutionId'
]);
const REVIEW_REBASE_SOURCE_HASH_FIELDS = Object.freeze([
	'reviewRebaseManifestSha256',
	'reviewRebaseId',
	'selectionSha256',
	'sourceCandidateSha256',
	'sourceValidationSha256',
	'rowOverrideSetSha256',
	'mutationSetSha256',
	'outputCandidateSha256',
	'outputValidationSha256',
	'parentVerificationSha256',
	'parentRepairSha256'
]);

export const SUBJECT_ART_THEMES = Object.freeze({
	biology: Object.freeze([
		'cells-practical',
		'biochemistry',
		'inheritance-reproduction',
		'regulation-immunity'
	]),
	chemistry: Object.freeze([
		'particles-bonding',
		'reactions-energy',
		'practical-analysis',
		'materials-industry'
	]),
	physics: Object.freeze([
		'forces-motion',
		'electricity-magnetism',
		'thermal-particles',
		'radiation-measurement'
	])
});

export function sha256(value) {
	return createHash('sha256')
		.update(Buffer.isBuffer(value) ? value : String(value))
		.digest('hex');
}

export function stableStringify(value, space = 2) {
	return JSON.stringify(sortJson(value), null, space);
}

export function canonicalHash(value) {
	return sha256(stableStringify(value, 0));
}

export function normalizeGeneratedChallengeBatch(value) {
	const normalized = structuredClone(value);
	if (!Array.isArray(normalized?.challenges)) return normalized;
	for (const entry of normalized.challenges) {
		const definition = entry?.definition;
		if (!definition || definition.questionPresentation === undefined) continue;
		if (definition.questionPresentation === null) {
			delete definition.questionPresentation;
			continue;
		}
		if (definition.questionPresentation.table === null) {
			delete definition.questionPresentation.table;
		}
	}
	return normalized;
}

export function sortJson(value) {
	if (Array.isArray(value)) return value.map(sortJson);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort(compareCodePoints)
			.map((key) => [key, sortJson(value[key])])
	);
}

function compareCodePoints(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}

export function slugify(value) {
	return String(value ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');
}

export function normalizeWhitespace(value) {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function validateIndependentContentReviewRow(review) {
	const issues = [];
	if (!isRecord(review)) return failed(['Review row must be an object.']);
	if (!nonEmpty(review.id)) issues.push('id is required.');
	for (const field of SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS) {
		if (typeof review[field] !== 'boolean') issues.push(`${field} must be boolean.`);
	}
	if (
		!Array.isArray(review.checkedCalculations) ||
		review.checkedCalculations.some((value) => !nonEmpty(value))
	) {
		issues.push('checkedCalculations must be an array of non-empty strings.');
	}
	const rowIssues = Array.isArray(review.issues) ? review.issues : null;
	if (!rowIssues) issues.push('issues must be an array.');
	else {
		for (const [index, issue] of rowIssues.entries()) {
			if (
				!isRecord(issue) ||
				!nonEmpty(issue.field) ||
				!nonEmpty(issue.category) ||
				!nonEmpty(issue.evidence) ||
				!nonEmpty(issue.repair)
			) {
				issues.push(`issues[${index}] is incomplete.`);
			}
		}
	}
	if (typeof review.accepted !== 'boolean') issues.push('accepted must be boolean.');
	const shouldAccept =
		SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.every((field) => review[field] === true) &&
		rowIssues?.length === 0;
	if (review.accepted !== shouldAccept) issues.push('accepted violates the hard gate.');
	if (!shouldAccept && rowIssues?.length === 0) {
		issues.push('A rejected review must include at least one concrete repair issue.');
	}
	return issues.length ? failed(issues) : passed();
}

export function validateIndependentArtReviewRow(review) {
	const issues = [];
	if (!isRecord(review)) return failed(['Review row must be an object.']);
	if (!nonEmpty(review.id)) issues.push('id is required.');
	for (const field of SCIENCE_ART_REVIEW_BOOLEAN_FIELDS) {
		if (typeof review[field] !== 'boolean') issues.push(`${field} must be boolean.`);
	}
	if (!Number.isInteger(review.score) || review.score < 0 || review.score > 20) {
		issues.push('score must be an integer from 0 to 20.');
	}
	if (!nonEmpty(review.visibleTakeaway)) issues.push('visibleTakeaway is required.');
	const rowIssues = Array.isArray(review.issues) ? review.issues : null;
	if (!rowIssues) issues.push('issues must be an array.');
	else {
		for (const [index, issue] of rowIssues.entries()) {
			if (
				!isRecord(issue) ||
				!SCIENCE_ART_REVIEW_ISSUE_CATEGORIES.includes(issue.category) ||
				!SCIENCE_ART_REVIEW_ISSUE_SEVERITIES.includes(issue.severity) ||
				!nonEmpty(issue.description) ||
				typeof issue.annotation !== 'string' ||
				typeof issue.regenerationInstruction !== 'string'
			) {
				issues.push(`issues[${index}] is incomplete or has an invalid category.`);
				continue;
			}
			if (
				issue.severity === 'major' &&
				(!nonEmpty(issue.regenerationInstruction) || nonEmpty(issue.annotation))
			) {
				issues.push(
					`issues[${index}] major defects require a fresh-regeneration instruction and no retain annotation.`
				);
			}
			if (
				issue.severity === 'minor' &&
				(!nonEmpty(issue.annotation) || nonEmpty(issue.regenerationInstruction))
			) {
				issues.push(
					`issues[${index}] minor defects require a retain annotation and must not request regeneration.`
				);
			}
		}
	}
	if (typeof review.accepted !== 'boolean') issues.push('accepted must be boolean.');
	if (!SCIENCE_ART_REVIEW_DISPOSITIONS.includes(review.disposition)) {
		issues.push('disposition is invalid.');
	}
	const majorIssues = rowIssues?.filter((issue) => issue?.severity === 'major') ?? [];
	const minorIssues = rowIssues?.filter((issue) => issue?.severity === 'minor') ?? [];
	const shouldAccept =
		SCIENCE_ART_REVIEW_BOOLEAN_FIELDS.every((field) => review[field] === true) &&
		review.score >= 18 &&
		majorIssues.length === 0;
	const expectedDisposition = !shouldAccept
		? 'fresh-regenerate'
		: minorIssues.length > 0
			? 'retain-with-annotation'
			: 'accept';
	if (review.accepted !== shouldAccept) issues.push('accepted violates the hard gate.');
	if (review.disposition !== expectedDisposition) {
		issues.push('disposition violates the severity gate.');
	}
	if (!shouldAccept && majorIssues.length === 0) {
		issues.push('A rejected review must include at least one concrete major regeneration issue.');
	}
	if (shouldAccept && majorIssues.length > 0) {
		issues.push('An accepted review must not contain a major issue.');
	}
	return issues.length ? failed(issues) : passed();
}

/**
 * Conservative deterministic guard for exact learner-facing notation.
 *
 * It deliberately reports only contradictions that can be established without visual or scientific
 * judgement. Missing notation is allowed because most art is intentionally text-free. Counts,
 * apparatus semantics and causal meaning remain mandatory independent-review gates.
 */
export function auditQuestionArtAuthority({ question, art }) {
	const issues = [];
	if (!nonEmpty(question) || !isRecord(art)) return passed();
	const visibleText = [
		art.scene,
		art.visualAnchor,
		art.altText,
		art.approvedMeaning,
		...(Array.isArray(art.accuracyConstraints) ? art.accuracyConstraints : [])
	]
		.filter(nonEmpty)
		.join(' ');

	const questionAlleles = alleleNotationBases(question);
	const artAlleles = alleleNotationBases(visibleText);
	for (const allele of artAlleles) {
		if (!questionAlleles.has(allele)) {
			issues.push(
				`Art introduces allele/genotype symbol ${allele}/${allele.toLowerCase()} that is absent from the authoritative question.`
			);
		}
	}

	const questionLabels = explicitObjectLabels(question);
	const artLabels = explicitObjectLabels(visibleText);
	for (const [object, labels] of artLabels) {
		const authoritative = questionLabels.get(object);
		if (!authoritative) continue;
		for (const label of labels) {
			if (!authoritative.has(label)) {
				issues.push(
					`Art labels ${object} ${label}, but the authoritative question uses ${[
						...authoritative
					].join('/')}.`
				);
			}
		}
	}

	const questionUnits = explicitUnits(question);
	const artUnits = explicitUnits(visibleText);
	if (questionUnits.size > 0) {
		for (const unit of artUnits) {
			if (!questionUnits.has(unit)) {
				issues.push(
					`Art introduces unit ${unit}, which is absent from the authoritative question.`
				);
			}
		}
	}

	const questionVariables = equationVariables(question);
	const artVariables = equationVariables(visibleText);
	for (const variable of artVariables) {
		if (!questionVariables.has(variable)) {
			issues.push(
				`Art introduces equation variable ${variable}, which is absent from the authoritative question.`
			);
		}
	}
	return issues.length ? failed(issues) : passed();
}

function alleleNotationBases(value) {
	const text = String(value ?? '');
	if (
		!/\b(?:allele|genotype|heterozygous|homozygous|punnett|carrier|genetic cross|inherit)\b/iu.test(
			text
		)
	) {
		return new Set();
	}
	const bases = new Set();
	const add = (token) => {
		if (!token) return;
		if (/^(?:XX|XY)$/u.test(token)) {
			bases.add(token);
			return;
		}
		if (token.length === 1 || token[0].toLowerCase() === token[1]?.toLowerCase()) {
			bases.add(token[0].toUpperCase());
		}
	};
	for (const match of text.matchAll(/\ballele\s+([A-Za-z])\b/gu)) add(match[1]);
	for (const match of text.matchAll(
		/\b([A-Za-z]{1,2})\s*×\s*([A-Za-z]{1,2})\b|\b([A-Za-z]{1,2})\s+[xX]\s+([A-Za-z]{1,2})\b/gu
	)) {
		add(match[1] ?? match[3]);
		add(match[2] ?? match[4]);
	}
	for (const match of text.matchAll(/\b([A-Z][a-z]|[A-Z]{2}|[a-z]{2}|XX|XY)\b/gu)) {
		add(match[1]);
	}
	for (const match of text.matchAll(/\b([A-Za-z])\s*\/\s*([A-Za-z])\b/gu)) {
		add(match[1]);
		add(match[2]);
	}
	return bases;
}

function explicitObjectLabels(value) {
	const labels = new Map();
	const pattern =
		/\b(sample|wire|point|position|container|beaker|test tube|bar|line|curve|component|resistor|lamp|cell)\s+([A-Z])\b/gu;
	for (const match of String(value ?? '').matchAll(pattern)) {
		const object = match[1].toLowerCase();
		const values = labels.get(object) ?? new Set();
		values.add(match[2]);
		labels.set(object, values);
	}
	return labels;
}

function explicitUnits(value) {
	const units = new Set();
	const pattern =
		/(?:°\s*C|\b(?:kg|mg|g|mol|dm³|dm3|cm³|cm3|m³|m3|km|cm|mm|ms|mV|kV|mA|kW|kJ|MJ|Pa|kPa|MPa|Hz|kHz|Bq|Gy|mSv|Sv|m\/s²|m\/s2|m\/s)\b)/gu;
	for (const match of String(value ?? '').matchAll(pattern)) {
		units.add(match[0].replace(/\s+/gu, '').replaceAll('3', '³').replaceAll('2', '²'));
	}
	return units;
}

function equationVariables(value) {
	const variables = new Set();
	const text = String(value ?? '');
	for (const match of text.matchAll(/\b([A-Za-z])\s*=/gu)) variables.add(match[1]);
	for (const match of text.matchAll(/=\s*([A-Za-z])\b/gu)) variables.add(match[1]);
	return variables;
}

export function wordCount(value) {
	const normalized = normalizeWhitespace(value);
	return normalized ? normalized.split(' ').length : 0;
}

export function validateChallengePlan(
	plan,
	{ sourceSnapshot, curriculumCatalog, curriculumEvidence } = {}
) {
	const issues = [];
	if (!isRecord(plan)) return failed(['Plan must be an object.']);
	if (plan.schemaVersion !== SCIENCE_CHALLENGE_PLAN_SCHEMA) {
		issues.push(`schemaVersion must be ${SCIENCE_CHALLENGE_PLAN_SCHEMA}.`);
	}
	if (!Array.isArray(plan.rows) || plan.rows.length === 0) {
		issues.push('rows must be a non-empty array.');
		return failed(issues);
	}
	const sourceById = new Map(sourceSnapshot?.questions?.map((row) => [row.id, row]) ?? []);
	const sourceIds = new Set(sourceById.keys());
	const componentIds = new Set([
		...(curriculumCatalog?.specifications?.flatMap((specification) =>
			specification.components?.map((component) => component.id)
		) ?? []),
		...(curriculumEvidence?.components?.map((component) => component.componentId) ?? [])
	]);
	if (!kebab(plan.planId)) issues.push('planId must be kebab-case.');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(plan.createdOn ?? ''))) {
		issues.push('createdOn must be YYYY-MM-DD.');
	}
	if (!sha256String(plan.baseCatalogContentSha256)) {
		issues.push('baseCatalogContentSha256 must bind the exact catalogue source.');
	}
	if (!Number.isInteger(plan.baseCatalogRecordCount) || plan.baseCatalogRecordCount < 0) {
		issues.push('baseCatalogRecordCount must be a non-negative integer.');
	}
	for (const field of [
		'targetFinalCatalogueRounds',
		'existingRoundCount',
		'generatedRoundCount',
		'generatedQuestionContextCount',
		'targetFinalQuestionContextCount',
		'uniqueIllustrationPairCount',
		'uniqueFinalIllustrationAssetCount'
	]) {
		if (field in plan) issues.push(`${field} is not part of the current plan schema.`);
	}
	const ids = new Set();
	const sourceQuestionIds = new Set();
	for (const [index, row] of plan.rows.entries()) {
		const prefix = `rows[${index}]`;
		if (!isRecord(row)) {
			issues.push(`${prefix} must be an object.`);
			continue;
		}
		if (!kebab(row.id)) issues.push(`${prefix}.id must be kebab-case.`);
		if (ids.has(row.id)) issues.push(`${prefix}.id duplicates ${row.id}.`);
		ids.add(row.id);
		if (!SCIENCE_SUBJECTS.includes(row.subject)) {
			issues.push(`${prefix}.subject is invalid.`);
		}
		for (const field of [
			'specificationId',
			'specificationSha256',
			'chapterId',
			'chapterCode',
			'chapterTitle',
			'shard'
		]) {
			if (!nonEmpty(row[field])) issues.push(`${prefix}.${field} is required.`);
		}
		if (!nonEmpty(row.curriculumComponentId)) {
			issues.push(`${prefix}.curriculumComponentId is required.`);
		} else if (componentIds.size && !componentIds.has(row.curriculumComponentId)) {
			issues.push(`${prefix}.curriculumComponentId is unknown.`);
		}
		if (!nonEmpty(row.calibrationQuestionId)) {
			issues.push(`${prefix}.calibrationQuestionId is required.`);
		} else {
			if (sourceQuestionIds.has(row.calibrationQuestionId)) {
				issues.push(`${prefix}.calibrationQuestionId is reused.`);
			}
			sourceQuestionIds.add(row.calibrationQuestionId);
			if (sourceIds.size && !sourceIds.has(row.calibrationQuestionId)) {
				issues.push(`${prefix}.calibrationQuestionId is absent from the source snapshot.`);
			}
			const source = sourceById.get(row.calibrationQuestionId);
			if (source?.contentSha256 && row.calibrationQuestionSha256 !== source.contentSha256) {
				issues.push(`${prefix}.calibrationQuestionSha256 differs from the source snapshot.`);
			}
		}
		if (!nonEmpty(row.calibrationQuestionSha256)) {
			issues.push(`${prefix}.calibrationQuestionSha256 is required.`);
		}
		if (!CHALLENGE_DIFFICULTIES.includes(row.difficulty)) {
			issues.push(`${prefix}.difficulty is invalid.`);
		}
		if (!CHALLENGE_ARCS.includes(row.arc)) issues.push(`${prefix}.arc is invalid.`);
		if (!CHALLENGE_MECHANICS.includes(row.mechanic)) {
			issues.push(`${prefix}.mechanic is invalid.`);
		}
		if (
			![
				'recall-or-selection',
				'explanation',
				'quantitative',
				'practical-or-data',
				'visual-or-model'
			].includes(row.taskShape)
		) {
			issues.push(`${prefix}.taskShape is invalid.`);
		}
	}
	return issues.length ? failed(issues) : passed();
}

export function validateGeneratedChallenge(entry, { planRow, sourceQuestion, curriculum } = {}) {
	const issues = [];
	if (!isRecord(entry)) return failed(['Challenge entry must be an object.']);
	const definition = entry.definition;
	const grounding = entry.grounding;
	const art = entry.art;
	if (!isRecord(definition)) issues.push('definition must be an object.');
	if (!isRecord(grounding)) issues.push('grounding must be an object.');
	if (!isRecord(art)) issues.push('art must be an object.');
	if (issues.length) return failed(issues);

	const requiredStrings = [
		'id',
		'slug',
		'subject',
		'subjectArtTheme',
		'title',
		'topic',
		'hook',
		'arc',
		'mechanic',
		'difficulty',
		'previewQuestion',
		'metaDescription',
		'sourceQuestionId',
		'lastReviewed',
		'strongerAnswer',
		'weakAnswer',
		'weakAnswerKind',
		'showdownExplanation',
		'commandWordLesson',
		'diagnosisPrompt',
		'repairPrompt',
		'repairSuccess',
		'transferPromptLead',
		'transferExplanation',
		'memoryHandle'
	];
	for (const field of requiredStrings) {
		if (!nonEmpty(definition[field])) issues.push(`definition.${field} is required.`);
	}
	if (!kebab(definition.id)) issues.push('definition.id must be kebab-case.');
	if (!kebab(definition.slug)) issues.push('definition.slug must be kebab-case.');
	if (!SCIENCE_SUBJECTS.includes(definition.subject)) issues.push('definition.subject is invalid.');
	if (!SUBJECT_ART_THEMES[definition.subject]?.includes(definition.subjectArtTheme)) {
		issues.push('definition.subjectArtTheme is invalid for the subject.');
	}
	if (!CHALLENGE_ARCS.includes(definition.arc)) issues.push('definition.arc is invalid.');
	if (!CHALLENGE_MECHANICS.includes(definition.mechanic)) {
		issues.push('definition.mechanic is invalid.');
	}
	if (!CHALLENGE_DIFFICULTIES.includes(definition.difficulty)) {
		issues.push('definition.difficulty is invalid.');
	}
	if (!CHALLENGE_WEAK_ANSWER_KINDS.includes(definition.weakAnswerKind)) {
		issues.push('definition.weakAnswerKind is invalid.');
	}
	if (![1, 2, 3, 4, 5, 6].includes(definition.marks)) {
		issues.push('definition.marks must be an integer from 1 to 6.');
	}
	if (![2, 3, 4, 5, 6, 7, 8].includes(definition.estimatedMinutes)) {
		issues.push('definition.estimatedMinutes must be an integer from 2 to 8.');
	}
	if (definition.version !== 1) issues.push('definition.version must be 1.');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(definition.lastReviewed ?? ''))) {
		issues.push('definition.lastReviewed must be YYYY-MM-DD.');
	}
	const title = stringValue(definition.title);
	const previewQuestion = stringValue(definition.previewQuestion);
	const transferPromptLead = stringValue(definition.transferPromptLead);
	const hook = stringValue(definition.hook);
	const metaDescription = stringValue(definition.metaDescription);
	if (!/^\?$/.test(title.slice(-1)) || title.length > 88) {
		issues.push('definition.title must be a concise question ending in ?.');
	}
	if (previewQuestion.length < 24 || previewQuestion.length > 360) {
		issues.push('definition.previewQuestion must be 24-360 characters.');
	}
	if (transferPromptLead.length < 24 || transferPromptLead.length > 420) {
		issues.push('definition.transferPromptLead must be 24-420 characters.');
	}
	if (normalizeQuestion(previewQuestion) === normalizeQuestion(transferPromptLead)) {
		issues.push('Opening and transfer questions must be distinct.');
	}
	if (hook.length < 24 || hook.length > 180) {
		issues.push('definition.hook must be 24-180 characters.');
	}
	if (metaDescription.length < 90 || metaDescription.length > 169) {
		issues.push('definition.metaDescription must be 90-169 characters.');
	}
	if (!metaDescription.includes(`GCSE ${titleCase(definition.subject)}`)) {
		issues.push('definition.metaDescription must name the exact GCSE subject.');
	}
	if (!isRecord(definition.staticAnswers)) {
		issues.push('definition.staticAnswers must be an object.');
	} else {
		for (const answerId of ['a', 'b']) {
			if (!nonEmpty(definition.staticAnswers[answerId])) {
				issues.push(`definition.staticAnswers.${answerId} is required.`);
			}
		}
		if (nonEmpty(definition.staticAnswers.a) && nonEmpty(definition.staticAnswers.b)) {
			const shorter = Math.min(
				wordCount(definition.staticAnswers.a),
				wordCount(definition.staticAnswers.b)
			);
			const longer = Math.max(
				wordCount(definition.staticAnswers.a),
				wordCount(definition.staticAnswers.b)
			);
			if (!shorter || longer / shorter > 1.2) {
				issues.push('The two showdown answers must be within 20% word length.');
			}
		}
	}
	if (!['a', 'b'].includes(definition.strongerAnswer)) {
		issues.push('definition.strongerAnswer must be a or b.');
	}
	if (!['a', 'b'].includes(definition.weakAnswer)) {
		issues.push('definition.weakAnswer must be a or b.');
	}
	if (definition.strongerAnswer === definition.weakAnswer) {
		issues.push('strongerAnswer and weakAnswer must differ.');
	}
	for (const field of ['diagnosisChoices', 'repairChoices', 'transferChoices']) {
		validateChoices(definition[field], `definition.${field}`, issues);
	}
	if (
		!Array.isArray(definition.freeTextKeywordGroups) ||
		definition.freeTextKeywordGroups.length < 2
	) {
		issues.push('definition.freeTextKeywordGroups must contain at least two groups.');
	} else {
		for (const [index, group] of definition.freeTextKeywordGroups.entries()) {
			if (!Array.isArray(group) || group.length === 0 || group.some((term) => !nonEmpty(term))) {
				issues.push(`definition.freeTextKeywordGroups[${index}] must contain useful terms.`);
			}
		}
	}
	if (definition.questionPresentation !== undefined) {
		validateQuestionPresentation(definition.questionPresentation, issues);
	}
	for (const { path, value } of stringLeaves(definition, 'definition')) {
		if (hasInlineMarkAllocation(value)) {
			issues.push(`${path} includes an inline mark allocation; use definition.marks only.`);
		}
		if (path !== 'definition.mechanic' && hasLearnerFacingProductJargon(value)) {
			issues.push(`${path} includes internal product jargon.`);
		}
		if (referencesMissingVisual(value)) {
			issues.push(`${path} refers to unseen visual evidence.`);
		}
		if (asksLearnerToDraw(value)) {
			issues.push(`${path} asks the learner to draw.`);
		}
	}
	for (const field of [
		'curriculumComponentId',
		'specificationId',
		'specificationSha256',
		'calibrationQuestionId',
		'calibrationQuestionSha256'
	]) {
		if (!nonEmpty(grounding[field])) issues.push(`grounding.${field} is required.`);
	}
	if (
		nonEmpty(definition.sourceQuestionId) &&
		nonEmpty(grounding.calibrationQuestionId) &&
		definition.sourceQuestionId !== grounding.calibrationQuestionId
	) {
		issues.push('definition.sourceQuestionId differs from grounding.calibrationQuestionId.');
	}
	if (planRow) {
		if (definition.id !== planRow.id) issues.push('definition.id differs from the plan row.');
		if (definition.subject !== planRow.subject)
			issues.push('definition.subject differs from the plan row.');
		if (definition.difficulty !== planRow.difficulty)
			issues.push('definition.difficulty differs from the plan row.');
		if (definition.arc !== planRow.arc) issues.push('definition.arc differs from the plan row.');
		if (definition.mechanic !== planRow.mechanic)
			issues.push('definition.mechanic differs from the plan row.');
		if (grounding.curriculumComponentId !== planRow.curriculumComponentId) {
			issues.push('grounding.curriculumComponentId differs from the plan row.');
		}
		if (grounding.calibrationQuestionId !== planRow.calibrationQuestionId) {
			issues.push('grounding.calibrationQuestionId differs from the plan row.');
		}
		if (definition.sourceQuestionId !== planRow.calibrationQuestionId) {
			issues.push('definition.sourceQuestionId differs from the plan row.');
		}
	}
	if (sourceQuestion) {
		if (grounding.calibrationQuestionId !== sourceQuestion.id) {
			issues.push('grounding.calibrationQuestionId differs from source evidence.');
		}
		if (grounding.calibrationQuestionSha256 !== sourceQuestion.contentSha256) {
			issues.push('grounding.calibrationQuestionSha256 differs from source evidence.');
		}
	}
	if (curriculum) {
		if (grounding.curriculumComponentId !== curriculum.id) {
			issues.push('grounding.curriculumComponentId differs from curriculum evidence.');
		}
		if (grounding.specificationId !== curriculum.specificationId) {
			issues.push('grounding.specificationId differs from curriculum evidence.');
		}
		if (grounding.specificationSha256 !== curriculum.specificationSha256) {
			issues.push('grounding.specificationSha256 differs from curriculum evidence.');
		}
	}

	for (const context of ['opening', 'transfer']) {
		validateQuestionArt(art[context], context, definition, issues);
	}
	if (art.opening?.id === art.transfer?.id) {
		issues.push('Opening and transfer art ids must differ.');
	}
	if (
		normalizeWhitespace(art.opening?.scene).toLowerCase() ===
		normalizeWhitespace(art.transfer?.scene).toLowerCase()
	) {
		issues.push('Opening and transfer art scenes must be distinct.');
	}
	return issues.length ? failed(issues) : passed();
}

export function validateQuestionArt(value, context, definition, issues = []) {
	const prefix = `art.${context}`;
	if (!isRecord(value)) {
		issues.push(`${prefix} must be an object.`);
		return issues;
	}
	if (value.schemaVersion !== SCIENCE_QUESTION_ART_SCHEMA) {
		issues.push(`${prefix}.schemaVersion must be ${SCIENCE_QUESTION_ART_SCHEMA}.`);
	}
	if (!kebab(value.id)) issues.push(`${prefix}.id must be kebab-case.`);
	if (value.context !== context) issues.push(`${prefix}.context must be ${context}.`);
	for (const field of ['scene', 'visualAnchor', 'altText', 'approvedMeaning']) {
		if (!nonEmpty(value[field])) issues.push(`${prefix}.${field} is required.`);
	}
	if (!Array.isArray(value.accuracyConstraints) || value.accuracyConstraints.length < 2) {
		issues.push(`${prefix}.accuracyConstraints must contain at least two checks.`);
	} else if (value.accuracyConstraints.some((constraint) => !nonEmpty(constraint))) {
		issues.push(`${prefix}.accuracyConstraints must contain only non-empty strings.`);
	}
	if (!Array.isArray(value.forbiddenDetails) || value.forbiddenDetails.length < 2) {
		issues.push(`${prefix}.forbiddenDetails must contain at least two checks.`);
	} else if (value.forbiddenDetails.some((detail) => !nonEmpty(detail))) {
		issues.push(`${prefix}.forbiddenDetails must contain only non-empty strings.`);
	}
	if (normalizeWhitespace(value.altText).length > 320) {
		issues.push(`${prefix}.altText must be at most 320 characters.`);
	}
	if (/\b(correct answer|answer is|therefore|because|so the answer)\b/i.test(value.altText)) {
		issues.push(`${prefix}.altText must not disclose the answer.`);
	}
	const leakedConcepts = answerLeakageConcepts(value, context, definition);
	if (leakedConcepts.length) {
		issues.push(
			`${prefix} visible fields may reveal the correct choice through answer-unique concepts: ${leakedConcepts.join(
				', '
			)}.`
		);
	}
	const expectedId = `${definition.id}-${context}`;
	if (value.id !== expectedId) issues.push(`${prefix}.id must be ${expectedId}.`);
	const definitionQuestion =
		context === 'opening' ? definition?.previewQuestion : definition?.transferPromptLead;
	if (
		nonEmpty(value.question) &&
		nonEmpty(definitionQuestion) &&
		normalizeQuestion(value.question) !== normalizeQuestion(definitionQuestion)
	) {
		issues.push(
			`${prefix}.question must match the current learner-facing ${context} question exactly.`
		);
	}
	const authoritativeQuestion = nonEmpty(definitionQuestion) ? definitionQuestion : value.question;
	const authority = auditQuestionArtAuthority({
		question: authoritativeQuestion,
		art: value
	});
	for (const issue of authority.issues) {
		issues.push(`${prefix} conflicts with the learner-facing question: ${issue}`);
	}
	return issues;
}

export function validateGeneratedChallengeCollection(entries, { existingDefinitions = [] } = {}) {
	const issues = [];
	if (!Array.isArray(entries)) return failed(['Challenge collection must be an array.']);
	const titleOwner = new Map();
	for (const item of existingDefinitions) {
		const definition = item?.definition ?? item;
		const titleKey = normalizeQuestion(definition?.title);
		if (titleKey && !titleOwner.has(titleKey)) {
			titleOwner.set(titleKey, definition?.id ?? 'existing challenge');
		}
	}
	for (const entry of entries) {
		const definition = entry?.definition ?? {};
		const id = definition.id ?? 'challenge with missing id';
		const titleKey = normalizeQuestion(definition.title);
		if (titleKey && titleOwner.has(titleKey)) {
			issues.push(
				`${id}: definition.title duplicates ${titleOwner.get(titleKey)}: "${normalizeWhitespace(
					definition.title
				)}".`
			);
		} else if (titleKey) {
			titleOwner.set(titleKey, id);
		}
	}

	for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
		const left = entries[leftIndex];
		const leftComponentId = left?.grounding?.curriculumComponentId;
		const leftId = left?.definition?.id;
		if (!nonEmpty(leftComponentId) || !nonEmpty(leftId)) continue;
		for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
			const right = entries[rightIndex];
			if (right?.grounding?.curriculumComponentId !== leftComponentId) continue;
			const rightId = right?.definition?.id;
			if (!nonEmpty(rightId) || rightId === leftId) continue;
			for (const leftContext of challengeContexts(left)) {
				for (const rightContext of challengeContexts(right)) {
					const similarity = challengeContextSimilarity(leftContext.text, rightContext.text);
					if (!similarity?.tooSimilar) continue;
					issues.push(
						`${rightId}:${rightContext.context} is too similar to ${leftId}:${leftContext.context} in curriculum component ${leftComponentId} (token ${formatSimilarity(
							similarity.tokenJaccard
						)}, bigram ${formatSimilarity(similarity.bigramJaccard)}).`
					);
				}
			}
		}
	}
	return issues.length ? failed(issues) : passed();
}

export function validateRelease(release, options = {}) {
	const issues = [];
	if (!isRecord(release)) return failed(['Release must be an object.']);
	if (release.schemaVersion !== SCIENCE_CHALLENGE_RELEASE_SCHEMA) {
		issues.push(`schemaVersion must be ${SCIENCE_CHALLENGE_RELEASE_SCHEMA}.`);
	}
	if (!isRecord(release.release)) {
		issues.push('release metadata must be an object.');
	} else {
		validateReleaseMetadata(release.release, issues);
	}
	validateReleaseCoverage(release.coverage, release, issues, options.expectedCount);
	validateReleaseLineage(release.lineage, release, issues);
	if (!Array.isArray(release.challenges)) {
		issues.push('challenges must be an array.');
		return failed(issues);
	}
	issues.push(...validateGeneratedChallengeCollection(release.challenges).issues);
	const ids = new Set();
	const slugs = new Set();
	const artIds = new Set();
	const questionContexts = new Set();
	const artScenes = new Set();
	for (const [index, entry] of release.challenges.entries()) {
		const result = validateGeneratedChallenge(entry, options.forEntry?.(entry, index) ?? {});
		for (const issue of result.issues) issues.push(`challenges[${index}]: ${issue}`);
		const definition = entry?.definition ?? {};
		for (const [set, value, label] of [
			[ids, definition.id, 'id'],
			[slugs, `${definition.subject}/${definition.slug}`, 'route'],
			[questionContexts, normalizeQuestion(definition.previewQuestion), 'question context'],
			[questionContexts, normalizeQuestion(definition.transferPromptLead), 'question context']
		]) {
			if (set.has(value)) issues.push(`challenges[${index}] duplicates ${label} ${String(value)}.`);
			set.add(value);
		}
		for (const art of [entry?.art?.opening, entry?.art?.transfer]) {
			if (!art?.id) continue;
			if (artIds.has(art.id)) issues.push(`challenges[${index}] reuses art id ${art.id}.`);
			artIds.add(art.id);
			const scene = normalizeWhitespace(art.scene).toLowerCase();
			if (scene && artScenes.has(scene)) {
				issues.push(`challenges[${index}] reuses an illustration scene.`);
			}
			if (scene) artScenes.add(scene);
		}
	}
	if (options.expectedCount !== undefined && release.challenges.length !== options.expectedCount) {
		issues.push(
			`Expected ${options.expectedCount} challenges, found ${release.challenges.length}.`
		);
	}
	if (artIds.size !== release.challenges.length * 2) {
		issues.push('Every challenge context must have one globally unique art id.');
	}
	return issues.length ? failed(issues) : passed();
}

function validateReleaseCoverage(coverage, release, issues, expectedCount) {
	if (!isRecord(coverage) || coverage.schemaVersion !== 'science-challenge-coverage/v2') {
		issues.push('coverage must use science-challenge-coverage/v2.');
		return;
	}
	const generatedRounds = release.challenges?.length ?? expectedCount;
	const existingRounds = coverage.existingRounds;
	for (const [field, expected] of [
		['generatedRounds', generatedRounds],
		['generatedQuestionContexts', generatedRounds * 2],
		['finalRounds', existingRounds + generatedRounds],
		['finalQuestionContexts', (existingRounds + generatedRounds) * 2]
	]) {
		if (coverage[field] !== expected) issues.push(`coverage.${field} must be ${expected}.`);
	}
	if (!Number.isInteger(existingRounds) || existingRounds < 0) {
		issues.push('coverage.existingRounds must be a non-negative integer.');
	}
	const expectedDimensions = [
		'subject',
		'chapterId',
		'curriculumComponentId',
		'difficulty',
		'taskShape',
		'arc',
		'mechanic'
	];
	if (!isRecord(coverage.dimensions)) {
		issues.push('coverage.dimensions must be an object.');
	} else {
		for (const dimension of expectedDimensions) {
			const counts = coverage.dimensions[dimension];
			if (
				!isRecord(counts) ||
				Object.values(counts).some((count) => !Number.isInteger(count) || count < 1) ||
				Object.values(counts).reduce((sum, count) => sum + count, 0) !== generatedRounds
			) {
				issues.push(`coverage.dimensions.${dimension} must sum to ${generatedRounds}.`);
			}
		}
	}
	if (release.release?.coverageSha256 !== canonicalHash(coverage)) {
		issues.push('release.coverageSha256 differs from coverage.');
	}
}

function validateReleaseLineage(lineage, release, issues) {
	if (!isRecord(lineage) || lineage.schemaVersion !== 'science-challenge-release-lineage/v1') {
		issues.push('lineage must use science-challenge-release-lineage/v1.');
		return;
	}
	const effectiveCohortBinding = lineage.effectiveCohort;
	const parentChainValidation = validateReviewRebaseParentChain(
		effectiveCohortBinding?.parentChain,
		'lineage.effectiveCohort.parentChain',
		issues
	);
	if (!Array.isArray(lineage.content) || lineage.content.length === 0) {
		issues.push('lineage.content must contain authoring shard provenance.');
	} else {
		const shardIds = new Set();
		for (const [index, shard] of lineage.content.entries()) {
			const prefix = `lineage.content[${index}]`;
			if (
				!isRecord(shard) ||
				!nonEmpty(shard.shardId) ||
				!nonEmpty(shard.candidatePath) ||
				!sha256String(shard.candidateSha256) ||
				!nonEmpty(shard.validationPath) ||
				!sha256String(shard.validationSha256) ||
				!Array.isArray(shard.runSummaries)
			) {
				issues.push(`${prefix} is incomplete.`);
				continue;
			}
			if (shardIds.has(shard.shardId)) issues.push(`${prefix} duplicates a shard id.`);
			shardIds.add(shard.shardId);
			if (Object.hasOwn(shard, 'continuation')) {
				issues.push(`${prefix}.continuation is not part of the release lineage schema.`);
			}
			const multipartSalvageBound = validateMultipartPlanSalvageLineage(
				shard.salvage,
				shard,
				prefix,
				issues
			);
			const descendantRemapBound = validateDescendantRemapLineage(
				shard.descendantRemap,
				shard,
				prefix,
				issues
			);
			const difficultyPlanAdjustmentBound = validateDifficultyPlanAdjustmentLineage(
				shard.difficultyPlanAdjustment,
				shard,
				prefix,
				issues
			);
			const reviewRebaseSourceValidation = validateReviewRebaseSourceLineage(
				shard.reviewRebaseSource,
				shard,
				parentChainValidation,
				prefix,
				issues
			);
			const exceptionalLineageCount =
				Number(shard.salvage !== undefined && shard.salvage !== null) +
				Number(shard.descendantRemap !== undefined && shard.descendantRemap !== null) +
				Number(
					shard.difficultyPlanAdjustment !== undefined && shard.difficultyPlanAdjustment !== null
				);
			const competingExceptionalLineage = exceptionalLineageCount > 1;
			if (competingExceptionalLineage) {
				issues.push(`${prefix} cannot combine multiple exceptional recovery provenances.`);
			}
			const competingReviewRebaseSource =
				reviewRebaseSourceValidation.present &&
				(shard.runSummaries.length > 0 || exceptionalLineageCount > 0);
			if (competingReviewRebaseSource) {
				issues.push(
					`${prefix}.reviewRebaseSource must be mutually exclusive with run summaries and exceptional recovery provenance.`
				);
			}
			const exceptionalCandidateBound =
				!competingExceptionalLineage &&
				!competingReviewRebaseSource &&
				(Number(multipartSalvageBound) +
						Number(descendantRemapBound) +
					Number(difficultyPlanAdjustmentBound) ===
					1 ||
					reviewRebaseSourceValidation.valid);
			if (shard.runSummaries.length === 0 && !exceptionalCandidateBound) {
				issues.push(`${prefix} is incomplete.`);
			}
			for (const run of shard.runSummaries) {
				const repairRun = run?.kind === 'independent-verification-repair';
				const ordinaryRun = ['generation', 'deterministic-repair'].includes(run?.kind);
				const transport = run?.transport;
				const responseMode = run?.responseMode;
				const noMultipartFields =
					(run?.modelVersions === undefined || run.modelVersions === null) &&
					(run?.directPartSize === undefined || run.directPartSize === null) &&
					(run?.rowIds === undefined || run.rowIds === null) &&
					(run?.parts === undefined || run.parts === null);
				const codexSdkRun =
					transport === SCIENCE_CHALLENGE_CODEX_SDK_TRANSPORT &&
					(responseMode === undefined || responseMode === null) &&
					run?.model === SCIENCE_CHALLENGE_CODEX_SDK_MODEL &&
					(run?.provider === undefined || run.provider === null) &&
					(run?.transportVersion === undefined || run.transportVersion === null) &&
					(run?.requestPath === undefined || run.requestPath === null) &&
					(run?.requestSha256 === undefined || run.requestSha256 === null) &&
					(run?.thoughtsPath === undefined || run.thoughtsPath === null) &&
					(run?.thoughtsSha256 === undefined || run.thoughtsSha256 === null) &&
					(run?.resultMetadataPath === undefined || run.resultMetadataPath === null) &&
					(run?.resultMetadataSha256 === undefined || run.resultMetadataSha256 === null) &&
					noMultipartFields;
				const directStructuredJsonRun =
					transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT &&
					responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON &&
					run?.providerSchemaApplied === true &&
					run?.transportVersion === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION &&
					run?.provider === SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER &&
					run?.model === SCIENCE_CHALLENGE_DIRECT_JSON_MODEL &&
					nonEmpty(run?.modelVersion) &&
					nonEmpty(run?.requestPath) &&
					sha256String(run?.requestSha256) &&
					nonEmpty(run?.thoughtsPath) &&
					sha256String(run?.thoughtsSha256) &&
					nonEmpty(run?.resultMetadataPath) &&
					sha256String(run?.resultMetadataSha256) &&
					noMultipartFields;
				const directPromptJsonRun =
					transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT &&
					responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
					run?.providerSchemaApplied === false &&
					run?.transportVersion === SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION &&
					run?.provider === SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER &&
					run?.model === SCIENCE_CHALLENGE_DIRECT_JSON_MODEL &&
					nonEmpty(run?.modelVersion) &&
					nonEmpty(run?.requestPath) &&
					sha256String(run?.requestSha256) &&
					nonEmpty(run?.thoughtsPath) &&
					sha256String(run?.thoughtsSha256) &&
					nonEmpty(run?.resultMetadataPath) &&
					sha256String(run?.resultMetadataSha256) &&
					noMultipartFields;
				const directStructuredMultipartRun =
					transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT &&
					responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON &&
					run?.providerSchemaApplied === true &&
					run?.transportVersion === SCIENCE_CHALLENGE_DIRECT_MULTIPART_TRANSPORT_VERSION &&
					run?.provider === SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER &&
					run?.model === SCIENCE_CHALLENGE_DIRECT_JSON_MODEL &&
					run?.modelVersion === null &&
					(run?.requestPath === undefined || run.requestPath === null) &&
					(run?.requestSha256 === undefined || run.requestSha256 === null) &&
					(run?.thoughtsPath === undefined || run.thoughtsPath === null) &&
					(run?.thoughtsSha256 === undefined || run.thoughtsSha256 === null) &&
					(run?.resultMetadataPath === undefined || run.resultMetadataPath === null) &&
					(run?.resultMetadataSha256 === undefined || run.resultMetadataSha256 === null) &&
					validMultipartLineageShape(run);
				const directPromptMultipartRun =
					transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT &&
					responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
					run?.providerSchemaApplied === false &&
					run?.transportVersion ===
						SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION &&
					run?.provider === SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER &&
					run?.model === SCIENCE_CHALLENGE_DIRECT_JSON_MODEL &&
					run?.modelVersion === null &&
					(run?.requestPath === undefined || run.requestPath === null) &&
					(run?.requestSha256 === undefined || run.requestSha256 === null) &&
					(run?.thoughtsPath === undefined || run.thoughtsPath === null) &&
					(run?.thoughtsSha256 === undefined || run.thoughtsSha256 === null) &&
					(run?.resultMetadataPath === undefined || run.resultMetadataPath === null) &&
					(run?.resultMetadataSha256 === undefined || run.resultMetadataSha256 === null) &&
					validMultipartLineageShape(run);
				const directMultipartRun =
					directStructuredMultipartRun || directPromptMultipartRun;
				const validThinkingLevel =
					run?.thinkingLevel === 'max' ||
					((directPromptJsonRun || directPromptMultipartRun) && run?.thinkingLevel === 'high');
				if (
					!isRecord(run) ||
					(!repairRun && !ordinaryRun) ||
					(!codexSdkRun &&
						!directStructuredJsonRun &&
						!directPromptJsonRun &&
						!directMultipartRun) ||
					!Number.isInteger(run.attempt) ||
					run.attempt < 1 ||
					!nonEmpty(run.path) ||
					!sha256String(run.sha256) ||
					!nonEmpty(run.eventLogPath) ||
					!sha256String(run.eventLogSha256) ||
					!nonEmpty(run.lastMessagePath) ||
					!sha256String(run.lastMessageSha256) ||
					!nonEmpty(run.promptPath) ||
					!sha256String(run.promptSha256) ||
					!nonEmpty(run.candidatePath) ||
					!sha256String(run.candidateSha256) ||
					!nonEmpty(run.validationPath) ||
					!sha256String(run.validationSha256) ||
					run.validationStatus !== 'passed' ||
					!sha256String(run.inputSha256) ||
					!sha256String(run.rawCandidateSha256) ||
					run.normalizationVersion !== SCIENCE_CHALLENGE_NORMALIZATION_VERSION ||
					!validThinkingLevel ||
					run.status !== 'passed' ||
					run.toolFree !== true ||
					(repairRun &&
						(!isRecord(run.repairEvidence) ||
							!nonEmpty(run.repairEvidence.verificationSummaryPath) ||
							!sha256String(run.repairEvidence.verificationSummarySha256) ||
							!nonEmpty(run.repairEvidence.priorCandidatePath) ||
							!sha256String(run.repairEvidence.priorCandidateSha256))) ||
					(!repairRun && run.repairEvidence !== null)
				) {
					issues.push(`${prefix} contains invalid authoring run provenance.`);
				}
				if (directMultipartRun) validateMultipartLineageRun(run, prefix, issues);
			}
			if (
				!exceptionalCandidateBound &&
				!shard.runSummaries.some(
					(run) =>
						run?.candidateSha256 === shard.candidateSha256 &&
						run?.validationSha256 === shard.validationSha256 &&
						run?.validationStatus === 'passed' &&
						run?.toolFree === true
				)
			) {
				issues.push(`${prefix} has no run bound to its accepted candidate and validation.`);
			}
		}
	}
	if (!Array.isArray(lineage.art)) {
		issues.push('lineage.art must be an array.');
	} else if (release.release?.status === 'accepted') {
		const expectedArtContexts = (release.challenges?.length ?? 0) * 2;
		if (lineage.art.length !== expectedArtContexts) {
			issues.push(
				`Accepted lineage.art must contain exactly ${expectedArtContexts} generated contexts.`
			);
		} else {
			const ids = new Set();
			for (const [index, item] of lineage.art.entries()) {
				const prefix = `lineage.art[${index}]`;
				if (
					!isRecord(item) ||
					!nonEmpty(item.id) ||
					!sha256String(item.specSha256) ||
					!isRecord(item.outputs?.dark) ||
					!isRecord(item.outputs?.light) ||
					!Array.isArray(item.matchingJobs) ||
					item.matchingJobs.length === 0
				) {
					issues.push(`${prefix} is incomplete.`);
					continue;
				}
				if (ids.has(item.id)) issues.push(`${prefix} duplicates an art id.`);
				ids.add(item.id);
				for (const theme of ['dark', 'light']) {
					const output = item.outputs[theme];
					if (
						!nonEmpty(output.path) ||
						!sha256String(output.sha256) ||
						output.width !== 960 ||
						output.height !== 540
					) {
						issues.push(`${prefix}.outputs.${theme} is invalid.`);
					}
				}
				for (const job of item.matchingJobs) {
					const validReviewRepair =
						sha256String(job?.repairReviewSha256) && job?.repairPerceptualAuditSha256 === null;
					const validPerceptualRepair =
						job?.repairReviewSha256 === null && sha256String(job?.repairPerceptualAuditSha256);
					const ordinary =
						job?.repairReviewSha256 === null && job?.repairPerceptualAuditSha256 === null;
					const repaired = validReviewRepair || validPerceptualRepair;
					const requiredArtifacts = [
						'spec',
						'darkPrompt',
						'lightPrompt',
						'darkMaster',
						'lightMaster',
						'darkNormalized',
						'lightNormalized'
					];
					if (
						!isRecord(job) ||
						!nonEmpty(job.path) ||
						!sha256String(job.sha256) ||
						job.imageModel !== 'chatgpt-gpt-image-2' ||
						!Number.isInteger(job.attempt) ||
						job.attempt < 1 ||
						!(ordinary || repaired) ||
						!nonEmpty(job.finishedAt) ||
						Number.isNaN(Date.parse(job.finishedAt)) ||
						(repaired && !nonEmpty(job.repairEvidencePath)) ||
						(ordinary && job.repairEvidencePath !== null) ||
						!isRecord(job.generationArtifacts) ||
						requiredArtifacts.some((key) => {
							const artifact = job.generationArtifacts?.[key];
							return (
								!isRecord(artifact) ||
								!nonEmpty(artifact.path) ||
								!sha256String(artifact.sha256) ||
								!Number.isInteger(artifact.size) ||
								artifact.size < 1
							);
						})
					) {
						issues.push(`${prefix} contains invalid image-generation job provenance.`);
					}
				}
			}
		}
	}
	if (lineage.recovery !== undefined) {
		issues.push('lineage.recovery is not part of the release lineage schema.');
	}
	const shardRemaps = lineage.content
		.map((shard) => shard.descendantRemap)
		.filter((value) => value !== null && value !== undefined);
	if (lineage.descendantRemaps !== undefined && !Array.isArray(lineage.descendantRemaps)) {
		issues.push('lineage.descendantRemaps must be an array when present.');
	} else if (lineage.descendantRemaps !== undefined) {
		if (canonicalHash(shardRemaps) !== canonicalHash(lineage.descendantRemaps)) {
			issues.push('lineage.descendantRemaps differs from content shard remap lineage.');
		}
	} else if (shardRemaps.length > 0) {
		issues.push('lineage.descendantRemaps is required when a content shard uses a remap.');
	}
	const shardDifficultyAdjustments = lineage.content
		.map((shard) => shard.difficultyPlanAdjustment)
		.filter((value) => value !== null && value !== undefined);
	if (
		lineage.difficultyPlanAdjustments !== undefined &&
		!Array.isArray(lineage.difficultyPlanAdjustments)
	) {
		issues.push('lineage.difficultyPlanAdjustments must be an array when present.');
	} else if (lineage.difficultyPlanAdjustments !== undefined) {
		if (
			canonicalHash(shardDifficultyAdjustments) !== canonicalHash(lineage.difficultyPlanAdjustments)
		) {
			issues.push(
				'lineage.difficultyPlanAdjustments differs from content shard difficulty lineage.'
			);
		}
	} else if (shardDifficultyAdjustments.length > 0) {
		issues.push(
			'lineage.difficultyPlanAdjustments is required when a content shard uses an adjustment.'
		);
	}
	if (
		lineage.curriculumRemapVerifierInput !== null &&
		lineage.curriculumRemapVerifierInput !== undefined &&
		(!isRecord(lineage.curriculumRemapVerifierInput) ||
			!sha256String(lineage.curriculumRemapVerifierInput.sha256) ||
			!sha256String(lineage.curriculumRemapVerifierInput.basePlanSha256) ||
			!sha256String(lineage.curriculumRemapVerifierInput.effectivePlanSha256) ||
			!sha256String(lineage.curriculumRemapVerifierInput.proposalSetSha256) ||
			!sha256String(lineage.curriculumRemapVerifierInput.manifestSetSha256) ||
			(release.release?.status === 'accepted'
				? !sha256String(lineage.curriculumRemapVerifierInput.decisionSetSha256)
				: lineage.curriculumRemapVerifierInput.decisionSetSha256 !== null))
	) {
		issues.push('lineage.curriculumRemapVerifierInput is invalid.');
	}
	const validEffectiveCohortBinding =
		isRecord(effectiveCohortBinding) &&
		parentChainValidation.valid &&
		sha256String(effectiveCohortBinding.manifestSha256) &&
		sha256String(effectiveCohortBinding.basePlanSha256) &&
		sha256String(effectiveCohortBinding.effectivePlanSha256) &&
		sha256String(effectiveCohortBinding.candidateSetSha256) &&
		Number.isSafeInteger(effectiveCohortBinding.candidateCount) &&
		effectiveCohortBinding.candidateCount >= 1 &&
		sha256String(effectiveCohortBinding.remapManifestSetSha256) &&
		Number.isSafeInteger(effectiveCohortBinding.difficultyAdjustmentCount) &&
		effectiveCohortBinding.difficultyAdjustmentCount >= 0 &&
		sha256String(effectiveCohortBinding.difficultyAdjustmentManifestSetSha256) &&
		sha256String(effectiveCohortBinding.recoverySetSha256) &&
		release.release?.effectiveCohortManifestSha256 === effectiveCohortBinding.manifestSha256 &&
		release.release?.effectiveCohortCandidateSetSha256 ===
			effectiveCohortBinding.candidateSetSha256 &&
		release.release?.basePlanSha256 === effectiveCohortBinding.basePlanSha256 &&
		release.release?.effectivePlanSha256 === effectiveCohortBinding.effectivePlanSha256 &&
		release.release?.recoverySetSha256 === effectiveCohortBinding.recoverySetSha256;
	if (
		(effectiveCohortBinding !== null && effectiveCohortBinding !== undefined) ||
		shardRemaps.length > 0 ||
		shardDifficultyAdjustments.length > 0
	) {
		if (!validEffectiveCohortBinding) {
			issues.push('lineage.effectiveCohort is invalid or differs from release metadata.');
		}
	}
	const contentParentLineageSha256 = release.release?.contentParentLineageSha256;
	const contentParentLineageDeclared =
		isRecord(release.release) &&
		Object.prototype.hasOwnProperty.call(release.release, 'contentParentLineageSha256');
	if (release.release?.status === 'accepted') {
		if (
			parentChainValidation.present &&
			contentParentLineageSha256 !== canonicalHash(parentChainValidation.value)
		) {
			issues.push(
				'release.contentParentLineageSha256 must equal the canonical hash of lineage.effectiveCohort.parentChain.'
			);
		} else if (!parentChainValidation.present && contentParentLineageDeclared) {
			issues.push(
				'release.contentParentLineageSha256 is forbidden without review-rebase ancestry.'
			);
		}
	}
	if (shardRemaps.length > 0) {
		const remapBinding = lineage.curriculumRemapVerifierInput;
		const composedRemapPlan =
			validEffectiveCohortBinding &&
			effectiveCohortBinding.basePlanSha256 === remapBinding?.basePlanSha256 &&
			effectiveCohortBinding.effectivePlanSha256 === remapBinding?.effectivePlanSha256 &&
			effectiveCohortBinding.remapManifestSetSha256 === remapBinding?.manifestSetSha256;
		if (
			!isRecord(remapBinding) ||
			release.release?.basePlanSha256 !== remapBinding.basePlanSha256 ||
			release.release?.effectivePlanSha256 !== remapBinding.effectivePlanSha256 ||
			release.release?.curriculumRemapVerifierInputSha256 !== remapBinding.sha256 ||
			release.release?.descendantRemapManifestSetSha256 !== remapBinding.manifestSetSha256 ||
			release.release?.curriculumRemapDecisionSetSha256 !== remapBinding.decisionSetSha256 ||
			shardRemaps.some(
				(remap) =>
					remap.basePlanSha256 !== remapBinding.basePlanSha256 ||
					(!composedRemapPlan && remap.effectivePlanSha256 !== remapBinding.effectivePlanSha256)
			)
		) {
			issues.push('release descendant-remap bindings differ from lineage.');
		}
	} else if (
		lineage.curriculumRemapVerifierInput !== null &&
		lineage.curriculumRemapVerifierInput !== undefined
	) {
		issues.push('lineage claims a curriculum remap verifier input without a shard remap.');
	}
	if (shardDifficultyAdjustments.length > 0) {
		const adjustmentBinding = lineage.difficultyPlanAdjustment;
		const acceptedRelease = release.release?.status === 'accepted';
		if (
			!isRecord(adjustmentBinding) ||
			!sha256String(adjustmentBinding.verifierInputSha256) ||
			!sha256String(adjustmentBinding.adjustmentManifestSetSha256) ||
			!sha256String(adjustmentBinding.recoverySetSha256) ||
			!validEffectiveCohortBinding ||
			effectiveCohortBinding.difficultyAdjustmentManifestSetSha256 !==
				adjustmentBinding.adjustmentManifestSetSha256 ||
			effectiveCohortBinding.recoverySetSha256 !== adjustmentBinding.recoverySetSha256 ||
			(acceptedRelease
				? !Number.isSafeInteger(adjustmentBinding.acceptedDecisionCount) ||
					adjustmentBinding.acceptedDecisionCount < 1 ||
					!sha256String(adjustmentBinding.decisionSetSha256)
				: adjustmentBinding.acceptedDecisionCount !== null ||
					adjustmentBinding.decisionSetSha256 !== null) ||
			release.release?.difficultyPlanAdjustmentVerifierInputSha256 !==
				adjustmentBinding.verifierInputSha256 ||
			release.release?.difficultyAdjustmentManifestSetSha256 !==
				adjustmentBinding.adjustmentManifestSetSha256 ||
			release.release?.recoverySetSha256 !== adjustmentBinding.recoverySetSha256 ||
			release.release?.difficultyPlanAdjustmentDecisionCount !==
				adjustmentBinding.acceptedDecisionCount ||
			release.release?.difficultyPlanAdjustmentDecisionSetSha256 !==
				adjustmentBinding.decisionSetSha256
		) {
			issues.push('release difficulty-plan adjustment bindings differ from lineage.');
		}
	} else if (
		lineage.difficultyPlanAdjustment !== null &&
		lineage.difficultyPlanAdjustment !== undefined
	) {
		issues.push(
			'lineage claims a difficulty-plan adjustment verifier input without shard lineage.'
		);
	}
	if (release.release?.lineageSha256 !== canonicalHash(lineage)) {
		issues.push('release.lineageSha256 differs from lineage.');
	}
	if (release.release?.contentGenerationLineageSha256 !== canonicalHash(lineage.content)) {
		issues.push('release.contentGenerationLineageSha256 differs from lineage.content.');
	}
	if (
		release.release?.status === 'accepted' &&
		release.release?.artGenerationLineageSha256 !== canonicalHash(lineage.art)
	) {
		issues.push('release.artGenerationLineageSha256 differs from lineage.art.');
	}
}

function validateReviewRebaseParentChain(value, prefix, issues) {
	if (value === null || value === undefined) {
		return { present: false, valid: true, value: null };
	}
	if (!isRecord(value)) {
		issues.push(`${prefix} must be an object when present.`);
		return { present: true, valid: false, value };
	}
	let valid = true;
	if (!exactObjectKeys(value, ['kind', ...REVIEW_REBASE_PARENT_CHAIN_HASH_FIELDS])) {
		issues.push(`${prefix} must contain the exact review-rebase successor fields.`);
		valid = false;
	}
	if (value.kind !== REVIEW_REBASE_PARENT_CHAIN_KIND) {
		issues.push(`${prefix}.kind must be ${REVIEW_REBASE_PARENT_CHAIN_KIND}.`);
		valid = false;
	}
	for (const field of REVIEW_REBASE_PARENT_CHAIN_HASH_FIELDS) {
		if (!sha256String(value[field])) {
			issues.push(`${prefix}.${field} must be a lowercase SHA-256 hash.`);
			valid = false;
		}
	}
	return { present: true, valid, value };
}

function validateReviewRebaseSourceLineage(value, shard, parentChainValidation, prefix, issues) {
	if (value === null || value === undefined) {
		return { present: false, valid: false };
	}
	const sourcePrefix = `${prefix}.reviewRebaseSource`;
	if (!isRecord(value)) {
		issues.push(`${sourcePrefix} must be an object when present.`);
		return { present: true, valid: false };
	}
	let valid = true;
	const expectedKeys = [
		'kind',
		...REVIEW_REBASE_SOURCE_HASH_FIELDS,
		'shardId',
		'sourceValidations'
	];
	if (!exactObjectKeys(value, expectedKeys)) {
		issues.push(`${sourcePrefix} must contain the exact review-rebase selection fields.`);
		valid = false;
	}
	if (value.kind !== 'review-rebase-selection') {
		issues.push(`${sourcePrefix}.kind must be review-rebase-selection.`);
		valid = false;
	}
	for (const field of REVIEW_REBASE_SOURCE_HASH_FIELDS) {
		if (!sha256String(value[field])) {
			issues.push(`${sourcePrefix}.${field} must be a lowercase SHA-256 hash.`);
			valid = false;
		}
	}
	if (value.shardId !== shard.shardId) {
		issues.push(`${sourcePrefix}.shardId differs from the enclosing content shard.`);
		valid = false;
	}
	if (
		value.outputCandidateSha256 !== shard.candidateSha256 ||
		value.outputValidationSha256 !== shard.validationSha256
	) {
		issues.push(`${sourcePrefix} output hashes differ from the enclosing content shard.`);
		valid = false;
	}
	const parentChain = parentChainValidation.value;
	if (
		!parentChainValidation.present ||
		!parentChainValidation.valid ||
		value.reviewRebaseManifestSha256 !== parentChain?.reviewRebaseManifestSha256 ||
		value.reviewRebaseId !== parentChain?.reviewRebaseId ||
		value.parentVerificationSha256 !== parentChain?.parentVerificationSha256 ||
		value.parentRepairSha256 !== parentChain?.parentRepairSha256
	) {
		issues.push(`${sourcePrefix} differs from the effective-cohort review-rebase parent chain.`);
		valid = false;
	}
	if (!Array.isArray(value.sourceValidations) || value.sourceValidations.length === 0) {
		issues.push(`${sourcePrefix}.sourceValidations must contain selected source evidence.`);
		return { present: true, valid: false };
	}
	const seenChallengeIds = new Set();
	let baseSourceCount = 0;
	for (const [index, source] of value.sourceValidations.entries()) {
		const validationPrefix = `${sourcePrefix}.sourceValidations[${index}]`;
		if (
			!isRecord(source) ||
			!exactObjectKeys(source, [
				'challengeId',
				'candidatePath',
				'candidateSha256',
				'validationPath',
				'validationSha256',
				'thinkingLevel'
			])
		) {
			issues.push(`${validationPrefix} must contain the exact selected-validation fields.`);
			valid = false;
			continue;
		}
		const challengeId = source.challengeId;
		if (challengeId === null) {
			baseSourceCount += 1;
		} else if (!nonEmpty(challengeId)) {
			issues.push(`${validationPrefix}.challengeId must be null or a non-empty string.`);
			valid = false;
		}
		const challengeKey = challengeId === null ? '<base>' : challengeId;
		if (seenChallengeIds.has(challengeKey)) {
			issues.push(`${validationPrefix}.challengeId duplicates selected source evidence.`);
			valid = false;
		}
		seenChallengeIds.add(challengeKey);
		if (
			!nonEmpty(source.candidatePath) ||
			!sha256String(source.candidateSha256) ||
			!nonEmpty(source.validationPath) ||
			!sha256String(source.validationSha256)
		) {
			issues.push(`${validationPrefix} has invalid source artifact bindings.`);
			valid = false;
		}
		if (!['high', 'max'].includes(source.thinkingLevel)) {
			issues.push(`${validationPrefix}.thinkingLevel must be high or max.`);
			valid = false;
		}
		if (
			challengeId === null &&
			(source.candidateSha256 !== value.sourceCandidateSha256 ||
				source.validationSha256 !== value.sourceValidationSha256)
		) {
			issues.push(`${validationPrefix} differs from the selected base source hashes.`);
			valid = false;
		}
	}
	if (baseSourceCount !== 1) {
		issues.push(`${sourcePrefix}.sourceValidations must contain exactly one base source.`);
		valid = false;
	}
	return { present: true, valid };
}

function validMultipartLineageShape(run) {
	return (
		Number.isInteger(run?.directPartSize) &&
		run.directPartSize >= 1 &&
		Array.isArray(run?.modelVersions) &&
		run.modelVersions.length > 0 &&
		run.modelVersions.every(nonEmpty) &&
		canonicalHash(run.modelVersions) ===
			canonicalHash([...new Set(run.modelVersions)].sort(compareCodePoints)) &&
		Array.isArray(run?.rowIds) &&
		run.rowIds.length > run.directPartSize &&
		run.rowIds.every(nonEmpty) &&
		new Set(run.rowIds).size === run.rowIds.length &&
		Array.isArray(run?.parts) &&
		run.parts.length === Math.ceil(run.rowIds.length / run.directPartSize) &&
		run.parts.length >= 2
	);
}

function validateDescendantRemapLineage(remap, shard, prefix, issues) {
	if (remap === undefined || remap === null) return false;
	const valid =
		isRecord(remap) &&
		remap.schemaVersion === 'science-challenge-verifier-directed-descendant-remap-evidence/v1' &&
		remap.disposition === 'deterministic-verifier-directed-descendant-remap' &&
		nonEmpty(remap.manifestPath) &&
		sha256String(remap.manifestSha256) &&
		sha256String(remap.manifestFileSha256) &&
		normalizeLineagePath(remap.candidatePath) === normalizeLineagePath(shard.candidatePath) &&
		remap.candidateSha256 === shard.candidateSha256 &&
		sha256String(remap.candidateFileSha256) &&
		normalizeLineagePath(remap.validationPath) === normalizeLineagePath(shard.validationPath) &&
		remap.validationSha256 === shard.validationSha256 &&
		sha256String(remap.validationFileSha256) &&
		nonEmpty(remap.effectivePlanPath) &&
		sha256String(remap.effectivePlanSha256) &&
		sha256String(remap.effectivePlanFileSha256) &&
		nonEmpty(remap.provenancePath) &&
		sha256String(remap.provenanceSha256) &&
		sha256String(remap.provenanceFileSha256) &&
		sha256String(remap.basePlanSha256) &&
		sha256String(remap.remapSha256) &&
		remap.sourceAttemptStatus === 'failed' &&
		isRecord(remap.sourceAttempt) &&
		Number.isInteger(remap.sourceAttempt.attempt) &&
		remap.sourceAttempt.attempt >= 1 &&
		remap.sourceAttempt.attempt <= 4 &&
		remap.sourceAttempt.status === 'failed' &&
		isRecord(remap.execution) &&
		sha256String(remap.execution.executionId) &&
		isRecord(remap.execution.identity) &&
		Array.isArray(remap.execution.claims) &&
		remap.execution.claims.length === 4 &&
		remap.execution.claims.every(
			(claim, index) =>
				claim?.attempt === index + 1 &&
				nonEmpty(claim.path) &&
				sha256String(claim.sha256) &&
				sha256String(claim.fileSha256)
		);
	if (!valid) {
		issues.push(`${prefix} contains invalid verifier-directed descendant-remap provenance.`);
		return false;
	}
	return true;
}

function validateDifficultyPlanAdjustmentLineage(adjustment, shard, prefix, issues) {
	if (adjustment === undefined || adjustment === null) return false;
	const adjustmentHashBound =
		(sha256String(adjustment.adjustmentSha256) &&
			adjustment.adjustmentCount === undefined &&
			adjustment.adjustmentSetSha256 === undefined) ||
		(sha256String(adjustment.adjustmentSetSha256) &&
			Number.isSafeInteger(adjustment.adjustmentCount) &&
			adjustment.adjustmentCount >= 1 &&
			adjustment.adjustmentSha256 === undefined);
	const valid =
		isRecord(adjustment) &&
		adjustment.schemaVersion ===
			'science-challenge-verifier-directed-difficulty-plan-adjustment-evidence/v1' &&
		[
			'deterministic-verifier-directed-difficulty-plan-adjustment',
			'deterministic-verifier-directed-difficulty-plan-adjustment-set'
		].includes(adjustment.disposition) &&
		nonEmpty(adjustment.manifestPath) &&
		sha256String(adjustment.manifestSha256) &&
		sha256String(adjustment.manifestFileSha256) &&
		normalizeLineagePath(adjustment.candidatePath) === normalizeLineagePath(shard.candidatePath) &&
		adjustment.candidateSha256 === shard.candidateSha256 &&
		sha256String(adjustment.candidateFileSha256) &&
		normalizeLineagePath(adjustment.validationPath) ===
			normalizeLineagePath(shard.validationPath) &&
		adjustment.validationSha256 === shard.validationSha256 &&
		sha256String(adjustment.validationFileSha256) &&
		nonEmpty(adjustment.effectivePlanPath) &&
		sha256String(adjustment.effectivePlanSha256) &&
		sha256String(adjustment.effectivePlanFileSha256) &&
		nonEmpty(adjustment.provenancePath) &&
		sha256String(adjustment.provenanceSha256) &&
		sha256String(adjustment.provenanceFileSha256) &&
		sha256String(adjustment.basePlanSha256) &&
		adjustmentHashBound &&
		adjustment.sourceAttemptStatus === 'failed' &&
		isRecord(adjustment.sourceAttempt) &&
		Number.isInteger(adjustment.sourceAttempt.attempt) &&
		adjustment.sourceAttempt.attempt >= 1 &&
		adjustment.sourceAttempt.attempt <= 4 &&
		adjustment.sourceAttempt.status === 'failed' &&
		isRecord(adjustment.execution) &&
		sha256String(adjustment.execution.executionId) &&
		isRecord(adjustment.execution.identity) &&
		Array.isArray(adjustment.execution.claims) &&
		adjustment.execution.claims.length === 4 &&
		adjustment.execution.claims.every(
			(claim, index) =>
				claim?.attempt === index + 1 &&
				nonEmpty(claim.path) &&
				sha256String(claim.sha256) &&
				sha256String(claim.fileSha256)
		);
	if (!valid) {
		issues.push(
			`${prefix} contains invalid verifier-directed difficulty-plan-adjustment provenance.`
		);
		return false;
	}
	return true;
}

function validateMultipartPlanSalvageLineage(salvage, shard, prefix, issues) {
	if (salvage === undefined || salvage === null) return false;
	const pathways = new Set([
		'failed-merge-id-and-difficulty',
		'merged-candidate-plan-difficulty'
	]);
	const pathway = salvage?.salvagePathway;
	const execution = salvage?.execution;
	const identity = execution?.identity;
	const claims = execution?.claims;
	const sourceAttempt = salvage?.sourceAttempt;
	const repairEvidence = salvage?.repairEvidence;
	const artifactRoot = lineageDirectory(salvage?.manifestPath);
	const expectedArtifactRoot = /(^|\/)verification-repair-[a-f0-9]{12}-multipart-plan-salvage$/;
	const exactArtifactPaths =
		expectedArtifactRoot.test(artifactRoot) &&
		normalizeLineagePath(salvage?.manifestPath) === `${artifactRoot}/manifest.json` &&
		normalizeLineagePath(salvage?.candidatePath) === `${artifactRoot}/candidate.json` &&
		normalizeLineagePath(salvage?.validationPath) === `${artifactRoot}/validation.json` &&
		normalizeLineagePath(salvage?.candidatePath) === normalizeLineagePath(shard.candidatePath) &&
		normalizeLineagePath(salvage?.validationPath) === normalizeLineagePath(shard.validationPath);
	const sourceCandidateExpected = pathway === 'merged-candidate-plan-difficulty';
	const exactSourceCandidate = sourceCandidateExpected
		? nonEmpty(sourceAttempt?.candidatePath) &&
			sha256String(sourceAttempt?.candidateSha256) &&
			sha256String(sourceAttempt?.candidateFileSha256)
		: sourceAttempt?.candidatePath === null &&
			sourceAttempt?.candidateSha256 === null &&
			sourceAttempt?.candidateFileSha256 === null;
	const exactClaims =
		Array.isArray(claims) &&
		claims.length === 4 &&
		claims.every(
			(claim, index) =>
				isRecord(claim) &&
				claim.attempt === index + 1 &&
				nonEmpty(claim.path) &&
				sha256String(claim.sha256) &&
				sha256String(claim.byteSha256)
		);
	const exactIdentity =
		isRecord(identity) &&
		identity.schemaVersion === 'science-challenge-verification-repair-execution/v2' &&
		sha256String(identity.planSha256) &&
		sha256String(identity.verificationSha256) &&
		sha256String(identity.priorCandidateSetSha256) &&
		sha256String(identity.objectiveId) &&
			identity.model === SCIENCE_CHALLENGE_DIRECT_JSON_MODEL &&
			identity.transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT &&
			identity.responseMode === sourceAttempt?.responseMode &&
		['max', 'high'].includes(identity.thinkingLevel) &&
		Number.isInteger(identity.directPartSize) &&
		identity.directPartSize >= 1 &&
		sha256String(identity.executionId) &&
		identity.executionId === execution?.executionId;
	const exactSourceAttempt =
		isRecord(sourceAttempt) &&
		Number.isInteger(sourceAttempt.attempt) &&
		sourceAttempt.attempt >= 1 &&
		sourceAttempt.attempt <= 4 &&
		sourceAttempt.status === 'failed' &&
		validLineageFileBinding(sourceAttempt, 'runSummary') &&
		validLineageFileBinding(sourceAttempt, 'validation') &&
		nonEmpty(sourceAttempt.eventLogPath) &&
		sha256String(sourceAttempt.eventLogSha256) &&
		nonEmpty(sourceAttempt.lastMessagePath) &&
		sha256String(sourceAttempt.lastMessageSha256) &&
		nonEmpty(sourceAttempt.promptPath) &&
		sha256String(sourceAttempt.promptSha256) &&
		exactSourceCandidate &&
		validMultipartSalvageSourceParts(sourceAttempt, pathway);
	const exactRepairEvidence =
		isRecord(repairEvidence) &&
		validLineageFileBinding(repairEvidence, 'verificationSummary') &&
		validLineageFileBinding(repairEvidence, 'priorCandidate') &&
		validLineageFileBinding(repairEvidence, 'priorValidation');
	const exactSourceSelection = validMultipartSalvageSourceSelection({
		salvage,
		shard,
		pathway,
		identity,
		sourceAttempt
	});
	const valid =
		isRecord(salvage) &&
		salvage.schemaVersion === 'science-challenge-multipart-plan-salvage-evidence/v2' &&
		pathways.has(pathway) &&
		exactArtifactPaths &&
		sha256String(salvage.manifestSha256) &&
		sha256String(salvage.manifestFileSha256) &&
		salvage.candidateSha256 === shard.candidateSha256 &&
		sha256String(salvage.candidateFileSha256) &&
		salvage.validationSha256 === shard.validationSha256 &&
		sha256String(salvage.validationFileSha256) &&
		isRecord(execution) &&
		sha256String(execution.executionId) &&
		exactIdentity &&
		nonEmpty(execution.objectivePath) &&
		sha256String(execution.objectiveSha256) &&
		sha256String(execution.objectiveByteSha256) &&
		exactClaims &&
		exactSourceAttempt &&
		exactRepairEvidence &&
		exactSourceSelection &&
		validMultipartSalvageCorrections(salvage.corrections, pathway) &&
		sha256String(salvage.salvageSourceSha256);
	if (!valid) {
		issues.push(`${prefix} contains invalid exhausted multipart plan salvage provenance.`);
		return false;
	}
	return true;
}

function validMultipartSalvageSourceSelection({
	salvage,
	shard,
	pathway,
	identity,
	sourceAttempt
}) {
	const selection = salvage?.sourceSelection;
	const sources = selection?.eligibleSources;
	const allowedPathways = new Set([
		'failed-merge-id-and-difficulty',
		'merged-candidate-plan-difficulty'
	]);
	if (
		!isRecord(selection) ||
		!exactObjectKeys(selection, [
			'approval',
			'eligibleSources',
			'eligibleSourcesSha256',
			'policy',
			'schemaVersion',
			'selectedAttempt',
			'selectedCandidateSha256'
		]) ||
		selection.schemaVersion !== 'science-challenge-multipart-plan-salvage-source-selection/v1' ||
		!Array.isArray(sources) ||
		sources.length < 1 ||
		new Set(sources.map((source) => source?.attempt)).size !== sources.length ||
		sources.some((source, index) => index > 0 && source?.attempt <= sources[index - 1]?.attempt) ||
		selection.eligibleSourcesSha256 !== canonicalHash(sources) ||
		selection.selectedCandidateSha256 !== salvage.candidateSha256 ||
		salvage.sourceSelectionSha256 !== canonicalHash(selection)
	) {
		return false;
	}
	const sourceKeys = [
		'attempt',
		'correctionsSha256',
		'deterministicValidationSha256',
		'recoveredCandidateSha256',
		'repairValidationSha256',
		'runSummarySha256',
		'salvagePathway',
		'salvageSourceSha256',
		'sourceCandidateSha256',
		'sourceValidationSha256'
	];
	if (
		sources.some(
			(source) =>
				!isRecord(source) ||
				!exactObjectKeys(source, sourceKeys) ||
				!Number.isInteger(source.attempt) ||
				source.attempt < 1 ||
				source.attempt > 4 ||
				!sha256String(source.runSummarySha256) ||
				!sha256String(source.sourceValidationSha256) ||
				!(source.sourceCandidateSha256 === null || sha256String(source.sourceCandidateSha256)) ||
				!allowedPathways.has(source.salvagePathway) ||
				!sha256String(source.salvageSourceSha256) ||
				!sha256String(source.correctionsSha256) ||
				!sha256String(source.recoveredCandidateSha256) ||
				!sha256String(source.deterministicValidationSha256) ||
				!sha256String(source.repairValidationSha256)
		)
	) {
		return false;
	}
	const selected = sources.find((source) => source.attempt === selection.selectedAttempt);
	if (
		!selected ||
		selection.selectedAttempt !== sourceAttempt?.attempt ||
		selected.recoveredCandidateSha256 !== selection.selectedCandidateSha256 ||
		selected.salvagePathway !== pathway ||
		selected.runSummarySha256 !== sourceAttempt?.runSummarySha256 ||
		selected.sourceValidationSha256 !== sourceAttempt?.validationSha256 ||
		selected.sourceCandidateSha256 !== sourceAttempt?.candidateSha256 ||
		selected.salvageSourceSha256 !== salvage.salvageSourceSha256 ||
		selected.correctionsSha256 !== canonicalHash(salvage.corrections)
	) {
		return false;
	}
	if (selection.policy === 'sole-helper-approved-source') {
		return sources.length === 1 && selection.approval === null;
	}
	if (
		selection.policy !== 'explicit-terminal-attempt-for-fresh-full-cohort-verification' ||
		sources.length < 2 ||
		selection.selectedAttempt !== 4
	) {
		return false;
	}
	const approval = selection.approval;
	return (
		isRecord(approval) &&
		exactObjectKeys(approval, [
			'decision',
			'eligibleSourcesSha256',
			'executionId',
			'objectiveId',
			'repairSha256',
			'schemaVersion',
			'selectedAttempt',
			'selectedCandidateSha256',
			'shardId'
		]) &&
		approval.schemaVersion === 'science-challenge-multipart-plan-salvage-source-approval/v1' &&
		approval.decision === 'select-terminal-attempt-for-fresh-full-cohort-verification' &&
		approval.shardId === shard?.shardId &&
		approval.repairSha256 === identity?.verificationSha256 &&
		approval.objectiveId === identity?.objectiveId &&
		approval.executionId === identity?.executionId &&
		approval.eligibleSourcesSha256 === selection.eligibleSourcesSha256 &&
		approval.selectedAttempt === selection.selectedAttempt &&
		approval.selectedCandidateSha256 === selection.selectedCandidateSha256
	);
}

function exactObjectKeys(value, expectedKeys) {
	return (
		isRecord(value) &&
		canonicalHash(Object.keys(value).sort(compareCodePoints)) ===
			canonicalHash([...expectedKeys].sort(compareCodePoints))
	);
}

function validMultipartSalvageSourceParts(sourceAttempt, pathway) {
	const parts = sourceAttempt?.parts;
	if (!Array.isArray(parts) || parts.length < 2) return false;
	const responseMode = sourceAttempt.responseMode;
	if (
		responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON &&
		responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
	) {
		return false;
	}
	if (
		sourceAttempt.providerSchemaApplied !==
		(responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON)
	) {
		return false;
	}
	const expectedTransportVersion =
		responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
			? SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION
			: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION;
	let cursor = 0;
	const observedRows = new Set();
	for (const [index, part] of parts.entries()) {
		const partId = `part-${String(index + 1).padStart(2, '0')}`;
		const expectedStatus = 'passed';
		if (
			!isRecord(part) ||
			part.partId !== partId ||
			part.index !== index + 1 ||
			part.start !== cursor ||
			!Number.isInteger(part.end) ||
			part.end <= cursor ||
			!Array.isArray(part.rowIds) ||
			part.rowIds.length !== part.end - cursor ||
			part.rowIds.some((rowId) => !nonEmpty(rowId) || observedRows.has(rowId)) ||
			!sha256String(part.inputSha256) ||
			!sha256String(part.responseSchemaSha256) ||
			part.responseMode !== sourceAttempt.responseMode ||
			part.providerSchemaApplied !== sourceAttempt.providerSchemaApplied ||
			part.transportVersion !== expectedTransportVersion ||
			part.status !== expectedStatus ||
			part.provider !== SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER ||
			part.model !== SCIENCE_CHALLENGE_DIRECT_JSON_MODEL ||
			!nonEmpty(part.modelVersion) ||
			!['max', 'high'].includes(part.thinkingLevel) ||
			(responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
				part.thinkingLevel !== 'max') ||
			!isRecord(part.usage) ||
			!Number.isFinite(part.costUsd) ||
			part.costUsd < 0 ||
			!validMultipartPartFileBindings(part, partId)
		) {
			return false;
		}
		for (const rowId of part.rowIds) observedRows.add(rowId);
		cursor = part.end;
	}
	return observedRows.size === cursor;
}

function validMultipartPartFileBindings(part, partId) {
	for (const [pathField, hashField, filename] of [
		['promptPath', 'promptSha256', 'prompt.txt'],
		['requestPath', 'requestSha256', 'request.json'],
		['eventLogPath', 'eventLogSha256', 'events.jsonl'],
		['rawOutputPath', 'rawOutputSha256', 'last-message.json'],
		['thoughtsPath', 'thoughtsSha256', 'thoughts.txt'],
		['resultMetadataPath', 'resultMetadataSha256', 'result-metadata.json'],
		['runSummaryPath', 'runSummarySha256', 'run-summary.json']
	]) {
		if (
			!nonEmpty(part[pathField]) ||
			!normalizeLineagePath(part[pathField]).endsWith(`/parts/${partId}/${filename}`) ||
			!sha256String(part[hashField])
		) {
			return false;
		}
	}
	return sha256String(part.rawCandidateSha256);
}

function validMultipartSalvageCorrections(corrections, pathway) {
	if (!Array.isArray(corrections) || corrections.length === 0) return false;
	const validBase = corrections.every(
		(correction) =>
			isRecord(correction) &&
			nonEmpty(correction.kind) &&
			nonEmpty(correction.path) &&
			Number.isInteger(correction.absoluteRowIndex) &&
			correction.absoluteRowIndex >= 0 &&
			sha256String(correction.sourceChallengeSha256)
	);
	if (!validBase) return false;
	if (pathway === 'failed-merge-id-and-difficulty') {
		const id = corrections.filter((correction) => correction.kind === 'definition.id');
		const difficulty = corrections.filter(
			(correction) => correction.kind === 'definition.difficulty'
		);
		return (
			corrections.length === 2 &&
			id.length === 1 &&
			difficulty.length === 1 &&
			nonEmpty(id[0].partId) &&
			Number.isInteger(id[0].rowIndex) &&
			id[0].rowIndex >= 1 &&
			nonEmpty(id[0].from) &&
			nonEmpty(id[0].to) &&
			Number.isInteger(id[0].editDistance) &&
			id[0].editDistance >= 1 &&
			id[0].editDistance <= 2 &&
			nonEmpty(difficulty[0].from) &&
			nonEmpty(difficulty[0].to)
		);
	}
	if (pathway === 'merged-candidate-plan-difficulty') {
		return corrections.every(
			(correction) =>
				correction.kind === 'definition.difficulty' &&
				nonEmpty(correction.from) &&
				nonEmpty(correction.to) &&
				sha256String(correction.recoveredChallengeSha256)
		);
	}
	return corrections.every(
		(correction) =>
			correction.kind === 'definition.questionPresentation' &&
			nonEmpty(correction.partId) &&
			Number.isInteger(correction.rowIndex) &&
			correction.rowIndex >= 1 &&
			correction.from === 'omitted' &&
			correction.to === null &&
			sha256String(correction.recoveredRawChallengeSha256)
	);
}

function validLineageFileBinding(record, field) {
	return (
		nonEmpty(record?.[`${field}Path`]) &&
		sha256String(record?.[`${field}Sha256`]) &&
		sha256String(record?.[`${field}FileSha256`])
	);
}

function lineageDirectory(value) {
	const normalized = normalizeLineagePath(value);
	const separator = normalized.lastIndexOf('/');
	return separator > 0 ? normalized.slice(0, separator) : '';
}

function validateMultipartLineageRun(run, prefix, issues) {
	const expectedPartResponseMode = run.responseMode;
	const expectedPartTransportVersion =
		run.responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
			? SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION
			: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION;
	const expectedProviderSchemaApplied =
		run.responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON;
	let cursor = 0;
	const observedRowIds = [];
	const observedModelVersions = [];
	const usages = [];
	for (const [index, part] of run.parts.entries()) {
		const partId = `part-${String(index + 1).padStart(2, '0')}`;
		const partPrefix = `${prefix}.${partId}`;
		const expectedEnd = Math.min(run.rowIds.length, cursor + run.directPartSize);
		const expectedRows = run.rowIds.slice(cursor, expectedEnd);
		const exactPartition =
			isRecord(part) &&
			part.partId === partId &&
			part.index === index + 1 &&
			part.start === cursor &&
			part.end === expectedEnd &&
			canonicalHash(part.rowIds ?? null) === canonicalHash(expectedRows);
		const evidenceFields = [
			['promptPath', 'promptSha256', 'prompt.txt'],
			['requestPath', 'requestSha256', 'request.json'],
			['eventLogPath', 'eventLogSha256', 'events.jsonl'],
			['rawOutputPath', 'rawOutputSha256', 'last-message.json'],
			['thoughtsPath', 'thoughtsSha256', 'thoughts.txt'],
			['resultMetadataPath', 'resultMetadataSha256', 'result-metadata.json'],
			['runSummaryPath', 'runSummarySha256', 'run-summary.json']
		];
		const exactEvidence =
			isRecord(part) &&
			evidenceFields.every(
				([pathField, hashField, filename]) =>
					nonEmpty(part[pathField]) &&
					normalizeLineagePath(part[pathField]).endsWith(`/parts/${partId}/${filename}`) &&
					sha256String(part[hashField])
			);
		const exactModel =
			isRecord(part) &&
			part.responseMode === expectedPartResponseMode &&
			part.providerSchemaApplied === expectedProviderSchemaApplied &&
			part.transportVersion === expectedPartTransportVersion &&
			part.status === 'passed' &&
			part.provider === SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER &&
			part.model === SCIENCE_CHALLENGE_DIRECT_JSON_MODEL &&
			nonEmpty(part.modelVersion) &&
			run.modelVersions.includes(part.modelVersion) &&
			part.thinkingLevel === run.thinkingLevel &&
			Number.isFinite(part.costUsd) &&
			part.costUsd >= 0 &&
			isRecord(part.usage);
		if (
			!exactPartition ||
			!exactEvidence ||
			!exactModel ||
			!sha256String(part?.inputSha256) ||
			!sha256String(part?.responseSchemaSha256) ||
			!sha256String(part?.rawCandidateSha256)
		) {
			issues.push(`${partPrefix} contains invalid or reordered multipart evidence.`);
		}
		observedRowIds.push(...(Array.isArray(part?.rowIds) ? part.rowIds : []));
		if (nonEmpty(part?.modelVersion)) observedModelVersions.push(part.modelVersion);
		if (isRecord(part?.usage)) usages.push(part.usage);
		cursor = expectedEnd;
	}
	if (
		cursor !== run.rowIds.length ||
		canonicalHash(observedRowIds) !== canonicalHash(run.rowIds) ||
		canonicalHash([...new Set(observedModelVersions)].sort(compareCodePoints)) !==
			canonicalHash(run.modelVersions) ||
		canonicalHash(aggregateLineageUsage(usages)) !== canonicalHash(run.usage ?? null)
	) {
		issues.push(`${prefix} multipart parts do not exhaust or aggregate to the root run.`);
	}
}

function aggregateLineageUsage(values) {
	const totals = {};
	for (const value of values) {
		for (const [field, count] of Object.entries(value ?? {})) {
			if (Number.isInteger(count) && count >= 0) totals[field] = (totals[field] ?? 0) + count;
		}
	}
	return totals;
}

function normalizeLineagePath(value) {
	return String(value ?? '').replaceAll('\\', '/');
}

export function validateQuestionArtManifest(manifest, { expectedCount } = {}) {
	const issues = [];
	if (!isRecord(manifest)) return failed(['Art manifest must be an object.']);
	if (manifest.schemaVersion !== SCIENCE_QUESTION_ART_MANIFEST_SCHEMA) {
		issues.push(`schemaVersion must be ${SCIENCE_QUESTION_ART_MANIFEST_SCHEMA}.`);
	}
	if (!kebab(manifest.releaseId)) issues.push('releaseId must be kebab-case.');
	if (manifest.width !== 960 || manifest.height !== 540) {
		issues.push('Art manifest dimensions must be 960x540.');
	}
	if (!Array.isArray(manifest.specs)) {
		issues.push('specs must be an array.');
		return failed(issues);
	}
	if (expectedCount !== undefined && manifest.specs.length !== expectedCount) {
		issues.push(`Expected ${expectedCount} art specs, found ${manifest.specs.length}.`);
	}
	const ids = new Set();
	const outputs = new Set();
	const questions = new Set();
	const scenes = new Set();
	const contextsByChallenge = new Map();
	const pairPolicy =
		manifest.cohort?.pairPolicy === 'one-pair-per-challenge'
			? 'one-pair-per-challenge'
			: 'opening-and-transfer';
	for (const [index, spec] of manifest.specs.entries()) {
		const prefix = `specs[${index}]`;
		if (!isRecord(spec)) {
			issues.push(`${prefix} must be an object.`);
			continue;
		}
		if (!kebab(spec.challengeId)) issues.push(`${prefix}.challengeId must be kebab-case.`);
		if (!SCIENCE_SUBJECTS.includes(spec.subject)) issues.push(`${prefix}.subject is invalid.`);
		if (!['opening', 'transfer'].includes(spec.context))
			issues.push(`${prefix}.context is invalid.`);
		if (!nonEmpty(spec.question)) issues.push(`${prefix}.question is required.`);
		validateQuestionArt(spec, spec.context, { id: spec.challengeId }, issues);
		if (ids.has(spec.id)) issues.push(`${prefix} duplicates art id ${String(spec.id)}.`);
		ids.add(spec.id);
		const question = normalizeQuestion(spec.question);
		if (question && questions.has(question))
			issues.push(`${prefix} duplicates a question context.`);
		if (question) questions.add(question);
		const scene = normalizeWhitespace(spec.scene).toLowerCase();
		if (scene && scenes.has(scene)) issues.push(`${prefix} duplicates an illustration scene.`);
		if (scene) scenes.add(scene);
		const contexts = contextsByChallenge.get(spec.challengeId) ?? [];
		contexts.push(spec.context);
		contextsByChallenge.set(spec.challengeId, contexts);
		for (const theme of ['dark', 'light']) {
			const outputPath = spec.output?.[`${theme}Path`];
			const expectedPath = scienceQuestionArtLocalPath(manifest.releaseId, spec.id, theme);
			if (outputPath !== expectedPath) issues.push(`${prefix}.output.${theme}Path is invalid.`);
			if (outputs.has(outputPath))
				issues.push(`${prefix} duplicates output path ${String(outputPath)}.`);
			outputs.add(outputPath);
		}
	}
	for (const [challengeId, contexts] of contextsByChallenge) {
		if (pairPolicy === 'one-pair-per-challenge') {
			if (contexts.length !== 1 || contexts[0] !== 'opening') {
				issues.push(`${challengeId} must have exactly one opening art spec.`);
			}
		} else if (
			contexts.length !== 2 ||
			new Set(contexts).size !== 2 ||
			!contexts.includes('opening') ||
			!contexts.includes('transfer')
		) {
			issues.push(`${challengeId} must have exactly one opening and one transfer art spec.`);
		}
	}
	if (outputs.size !== manifest.specs.length * 2) {
		issues.push('Every art spec must have two globally unique output paths.');
	}
	return issues.length ? failed(issues) : passed();
}

export function scienceQuestionArtLocalPath(releaseId, artId, theme) {
	return `tmp/science-challenges/${releaseId}/art-assets/${artId}-${theme}-v1.webp`;
}

export function scienceQuestionArtR2Key(releaseId, artId, theme, assetSha256) {
	return `images/challenges/${releaseId}/${artId}-${theme}-${assetSha256.slice(0, 16)}.webp`;
}

export function scienceQuestionArtPublicPath(releaseId, artId, theme, assetSha256) {
	return `/${scienceQuestionArtR2Key(releaseId, artId, theme, assetSha256)}`;
}

export function validateQuestionArtDeliveryManifest(delivery, { artManifest, expectedCount } = {}) {
	const issues = [];
	if (!isRecord(delivery)) return failed(['Art delivery manifest must be an object.']);
	if (delivery.schemaVersion !== SCIENCE_QUESTION_ART_DELIVERY_SCHEMA) {
		issues.push(`schemaVersion must be ${SCIENCE_QUESTION_ART_DELIVERY_SCHEMA}.`);
	}
	if (!kebab(delivery.releaseId)) issues.push('releaseId must be kebab-case.');
	if (delivery.bucket !== 'question-constellation') {
		issues.push('bucket must be question-constellation.');
	}
	if (!sha256String(delivery.sourceManifestSha256)) {
		issues.push('sourceManifestSha256 must be a lowercase SHA-256 hash.');
	}
	if (!sha256String(delivery.assetInventorySha256)) {
		issues.push('assetInventorySha256 must be a lowercase SHA-256 hash.');
	}
	if (!Array.isArray(delivery.objects)) {
		issues.push('objects must be an array.');
		return failed(issues);
	}
	if (delivery.objectCount !== delivery.objects.length) {
		issues.push('objectCount must match objects.length.');
	}
	if (expectedCount !== undefined && delivery.objects.length !== expectedCount) {
		issues.push(`Expected ${expectedCount} delivery objects, found ${delivery.objects.length}.`);
	}
	if (artManifest) {
		const sourceValidation = validateQuestionArtManifest(artManifest);
		if (sourceValidation.status !== 'passed') {
			issues.push(...sourceValidation.issues.map((issue) => `source art manifest: ${issue}`));
		}
		if (delivery.releaseId !== artManifest.releaseId) {
			issues.push('releaseId differs from the source art manifest.');
		}
		if (delivery.sourceManifestSha256 !== canonicalHash(artManifest)) {
			issues.push('sourceManifestSha256 differs from the source art manifest.');
		}
	}
	const objectIds = new Set();
	const keys = new Set();
	const publicPaths = new Set();
	const bySpecTheme = new Map();
	for (const [index, object] of delivery.objects.entries()) {
		const prefix = `objects[${index}]`;
		if (!isRecord(object)) {
			issues.push(`${prefix} must be an object.`);
			continue;
		}
		if (!kebab(object.id)) issues.push(`${prefix}.id must be kebab-case.`);
		if (!kebab(object.artId)) issues.push(`${prefix}.artId must be kebab-case.`);
		if (!kebab(object.challengeId)) issues.push(`${prefix}.challengeId must be kebab-case.`);
		if (!SCIENCE_SUBJECTS.includes(object.subject)) issues.push(`${prefix}.subject is invalid.`);
		if (!['opening', 'transfer'].includes(object.context))
			issues.push(`${prefix}.context is invalid.`);
		if (!['dark', 'light'].includes(object.theme)) issues.push(`${prefix}.theme is invalid.`);
		if (!sha256String(object.sha256)) issues.push(`${prefix}.sha256 is invalid.`);
		if (!Number.isInteger(object.size) || object.size < 1)
			issues.push(`${prefix}.size is invalid.`);
		if (object.contentType !== 'image/webp')
			issues.push(`${prefix}.contentType must be image/webp.`);
		if (object.cacheControl !== 'public, max-age=31536000, immutable') {
			issues.push(`${prefix}.cacheControl is invalid.`);
		}
		if (object.id !== `${object.artId}-${object.theme}`) {
			issues.push(`${prefix}.id must identify its art context and theme.`);
		}
		const expectedLocalPath = scienceQuestionArtLocalPath(
			delivery.releaseId,
			object.artId,
			object.theme
		);
		if (object.localPath !== expectedLocalPath) issues.push(`${prefix}.localPath is invalid.`);
		const expectedKey = sha256String(object.sha256)
			? scienceQuestionArtR2Key(delivery.releaseId, object.artId, object.theme, object.sha256)
			: '';
		if (object.r2Key !== expectedKey) issues.push(`${prefix}.r2Key is invalid.`);
		if (object.publicPath !== `/${expectedKey}`) issues.push(`${prefix}.publicPath is invalid.`);
		if (objectIds.has(object.id))
			issues.push(`${prefix} duplicates object id ${String(object.id)}.`);
		if (keys.has(object.r2Key)) issues.push(`${prefix} duplicates R2 key ${String(object.r2Key)}.`);
		if (publicPaths.has(object.publicPath)) {
			issues.push(`${prefix} duplicates public path ${String(object.publicPath)}.`);
		}
		objectIds.add(object.id);
		keys.add(object.r2Key);
		publicPaths.add(object.publicPath);
		bySpecTheme.set(`${object.artId}:${object.theme}`, object);
	}
	if (artManifest) {
		const inventory = [];
		for (const spec of artManifest.specs) {
			const dark = bySpecTheme.get(`${spec.id}:dark`);
			const light = bySpecTheme.get(`${spec.id}:light`);
			for (const [theme, object] of [
				['dark', dark],
				['light', light]
			]) {
				if (!object) {
					issues.push(`Missing ${theme} delivery object for ${spec.id}.`);
					continue;
				}
				if (
					object.challengeId !== spec.challengeId ||
					object.subject !== spec.subject ||
					object.context !== spec.context ||
					object.localPath !== spec.output[`${theme}Path`]
				) {
					issues.push(`${spec.id} ${theme} delivery metadata differs from its art spec.`);
				}
			}
			if (dark && light) {
				inventory.push({
					id: spec.id,
					darkSha256: dark.sha256,
					lightSha256: light.sha256
				});
			}
		}
		if (delivery.assetInventorySha256 !== canonicalHash(inventory)) {
			issues.push('assetInventorySha256 differs from the delivery objects.');
		}
	}
	return issues.length ? failed(issues) : passed();
}

export function challengeBatchOutputSchema(expectedCount) {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['schemaVersion', 'challenges'],
		properties: {
			schemaVersion: { type: 'string', const: SCIENCE_CHALLENGE_BATCH_SCHEMA },
			challenges: {
				type: 'array',
				minItems: expectedCount,
				maxItems: expectedCount,
				items: generatedChallengeSchema()
			}
		}
	};
}

function generatedChallengeSchema() {
	const nonEmptyString = { type: 'string', minLength: 1 };
	const choice = {
		type: 'object',
		additionalProperties: false,
		required: ['id', 'text', 'feedback', 'correct'],
		properties: {
			id: nonEmptyString,
			text: nonEmptyString,
			feedback: nonEmptyString,
			correct: { type: 'boolean' }
		}
	};
	const questionArt = {
		type: 'object',
		additionalProperties: false,
		required: [
			'schemaVersion',
			'id',
			'context',
			'scene',
			'visualAnchor',
			'altText',
			'approvedMeaning',
			'accuracyConstraints',
			'forbiddenDetails'
		],
		properties: {
			schemaVersion: { type: 'string', const: SCIENCE_QUESTION_ART_SCHEMA },
			id: nonEmptyString,
			context: { type: 'string', enum: ['opening', 'transfer'] },
			scene: nonEmptyString,
			visualAnchor: nonEmptyString,
			altText: nonEmptyString,
			approvedMeaning: nonEmptyString,
			accuracyConstraints: { type: 'array', minItems: 2, items: nonEmptyString },
			forbiddenDetails: { type: 'array', minItems: 2, items: nonEmptyString }
		}
	};
	return {
		type: 'object',
		additionalProperties: false,
		required: ['definition', 'grounding', 'art'],
		properties: {
			definition: {
				type: 'object',
				additionalProperties: false,
				required: [
					'id',
					'slug',
					'subject',
					'subjectArtTheme',
					'title',
					'topic',
					'hook',
					'arc',
					'mechanic',
					'difficulty',
					'marks',
					'estimatedMinutes',
					'previewQuestion',
					'questionPresentation',
					'metaDescription',
					'sourceQuestionId',
					'lastReviewed',
					'version',
					'staticAnswers',
					'strongerAnswer',
					'weakAnswer',
					'weakAnswerKind',
					'showdownExplanation',
					'commandWordLesson',
					'diagnosisPrompt',
					'diagnosisChoices',
					'repairPrompt',
					'repairChoices',
					'freeTextKeywordGroups',
					'repairSuccess',
					'transferPromptLead',
					'transferChoices',
					'transferExplanation',
					'memoryHandle'
				],
				properties: {
					id: nonEmptyString,
					slug: nonEmptyString,
					subject: { type: 'string', enum: SCIENCE_SUBJECTS },
					subjectArtTheme: {
						type: 'string',
						enum: Object.values(SUBJECT_ART_THEMES).flat()
					},
					title: nonEmptyString,
					topic: nonEmptyString,
					hook: nonEmptyString,
					arc: { type: 'string', enum: CHALLENGE_ARCS },
					mechanic: { type: 'string', enum: CHALLENGE_MECHANICS },
					difficulty: { type: 'string', enum: CHALLENGE_DIFFICULTIES },
					marks: { type: 'integer', minimum: 1, maximum: 6 },
					estimatedMinutes: { type: 'integer', minimum: 2, maximum: 8 },
					previewQuestion: nonEmptyString,
					questionPresentation: questionPresentationSchema(),
					metaDescription: nonEmptyString,
					sourceQuestionId: nonEmptyString,
					lastReviewed: nonEmptyString,
					version: { type: 'integer', const: 1 },
					staticAnswers: {
						type: 'object',
						additionalProperties: false,
						required: ['a', 'b'],
						properties: { a: nonEmptyString, b: nonEmptyString }
					},
					strongerAnswer: { type: 'string', enum: ['a', 'b'] },
					weakAnswer: { type: 'string', enum: ['a', 'b'] },
					weakAnswerKind: { type: 'string', enum: CHALLENGE_WEAK_ANSWER_KINDS },
					showdownExplanation: nonEmptyString,
					commandWordLesson: nonEmptyString,
					diagnosisPrompt: nonEmptyString,
					diagnosisChoices: { type: 'array', minItems: 3, maxItems: 3, items: choice },
					repairPrompt: nonEmptyString,
					repairChoices: { type: 'array', minItems: 3, maxItems: 3, items: choice },
					freeTextKeywordGroups: {
						type: 'array',
						minItems: 2,
						items: { type: 'array', minItems: 1, items: nonEmptyString }
					},
					repairSuccess: nonEmptyString,
					transferPromptLead: nonEmptyString,
					transferChoices: { type: 'array', minItems: 3, maxItems: 3, items: choice },
					transferExplanation: nonEmptyString,
					memoryHandle: nonEmptyString
				}
			},
			grounding: {
				type: 'object',
				additionalProperties: false,
				required: [
					'curriculumComponentId',
					'specificationId',
					'specificationSha256',
					'calibrationQuestionId',
					'calibrationQuestionSha256'
				],
				properties: {
					curriculumComponentId: nonEmptyString,
					specificationId: nonEmptyString,
					specificationSha256: nonEmptyString,
					calibrationQuestionId: nonEmptyString,
					calibrationQuestionSha256: nonEmptyString
				}
			},
			art: {
				type: 'object',
				additionalProperties: false,
				required: ['opening', 'transfer'],
				properties: { opening: questionArt, transfer: questionArt }
			}
		}
	};
}

function questionPresentationSchema() {
	const string = { type: 'string', minLength: 1 };
	return {
		anyOf: [
			{ type: 'null' },
			{
				type: 'object',
				additionalProperties: false,
				required: ['lead', 'task', 'table'],
				properties: {
					lead: string,
					task: string,
					table: {
						anyOf: [
							{ type: 'null' },
							{
								type: 'object',
								additionalProperties: false,
								required: ['caption', 'columns', 'rows'],
								properties: {
									caption: string,
									columns: { type: 'array', minItems: 2, maxItems: 2, items: string },
									rows: {
										type: 'array',
										minItems: 2,
										maxItems: 8,
										items: { type: 'array', minItems: 2, maxItems: 2, items: string }
									}
								}
							}
						]
					}
				}
			}
		]
	};
}

function validateChoices(value, prefix, issues) {
	if (!Array.isArray(value) || value.length !== 3) {
		issues.push(`${prefix} must contain exactly three choices.`);
		return;
	}
	if (value.filter((choice) => choice?.correct === true).length !== 1) {
		issues.push(`${prefix} must contain exactly one correct choice.`);
	}
	const ids = new Set();
	for (const [index, choice] of value.entries()) {
		if (!isRecord(choice)) {
			issues.push(`${prefix}[${index}] must be an object.`);
			continue;
		}
		if (!kebab(choice.id)) issues.push(`${prefix}[${index}].id must be kebab-case.`);
		if (ids.has(choice.id)) issues.push(`${prefix}[${index}].id is duplicated.`);
		ids.add(choice.id);
		if (!nonEmpty(choice.text)) issues.push(`${prefix}[${index}].text is required.`);
		if (!nonEmpty(choice.feedback)) issues.push(`${prefix}[${index}].feedback is required.`);
		if (typeof choice.correct !== 'boolean') {
			issues.push(`${prefix}[${index}].correct must be boolean.`);
		}
	}
	const lengths = value.map((choice) => wordCount(choice?.text));
	const shortest = Math.min(...lengths);
	const longest = Math.max(...lengths);
	if (!shortest || longest / shortest > 1.8) {
		issues.push(`${prefix} choices are too imbalanced in length.`);
	}
}

function validateQuestionPresentation(value, issues) {
	if (value === null) {
		issues.push('definition.questionPresentation must be omitted when no presentation is needed.');
		return;
	}
	if (!isRecord(value) || !nonEmpty(value.lead) || !nonEmpty(value.task)) {
		issues.push('definition.questionPresentation must contain lead and task.');
		return;
	}
	if (value.table === null) {
		issues.push('definition.questionPresentation.table must be omitted when no table is needed.');
		return;
	}
	if (value.table !== undefined && value.table !== null) {
		if (!isRecord(value.table) || !nonEmpty(value.table.caption)) {
			issues.push('definition.questionPresentation.table is invalid.');
		}
		if (
			!Array.isArray(value.table?.columns) ||
			value.table.columns.length !== 2 ||
			value.table.columns.some((column) => !nonEmpty(column))
		) {
			issues.push('definition.questionPresentation.table.columns must contain two labels.');
		}
		if (
			!Array.isArray(value.table?.rows) ||
			value.table.rows.length < 2 ||
			value.table.rows.length > 8 ||
			value.table.rows.some(
				(row) => !Array.isArray(row) || row.length !== 2 || row.some((cell) => !nonEmpty(cell))
			)
		) {
			issues.push(
				'definition.questionPresentation.table.rows must contain 2-8 complete two-cell rows.'
			);
		}
	}
}

function validateReleaseMetadata(metadata, issues) {
	for (const field of [
		'id',
		'status',
		'promptVersion',
		'model',
		'thinkingLevel',
		'planSha256',
		'sourceSnapshotSha256',
		'curriculumEvidenceSha256',
		'artManifestSha256',
		'coverageSha256',
		'lineageSha256',
		'contentGenerationLineageSha256',
		'materializedAt'
	]) {
		if (!nonEmpty(metadata[field])) issues.push(`release.${field} is required.`);
	}
	if (!['candidate', 'accepted'].includes(metadata.status)) {
		issues.push('release.status must be candidate or accepted.');
	}
	if (metadata.promptVersion !== SCIENCE_CHALLENGE_PROMPT_VERSION) {
		issues.push(`release.promptVersion must be ${SCIENCE_CHALLENGE_PROMPT_VERSION}.`);
	}
	for (const field of [
		'planSha256',
		'sourceSnapshotSha256',
		'curriculumEvidenceSha256',
		'artManifestSha256',
		'runtimeSha256',
		'coverageSha256',
		'lineageSha256',
		'contentGenerationLineageSha256',
		'contentParentLineageSha256',
		'basePlanSha256',
		'effectivePlanSha256',
		'effectiveCohortManifestSha256',
		'effectiveCohortCandidateSetSha256',
		'curriculumCatalogSha256',
		'curriculumRemapVerifierInputSha256',
		'descendantRemapManifestSetSha256',
		'curriculumRemapDecisionSetSha256',
		'difficultyPlanAdjustmentVerifierInputSha256',
		'difficultyAdjustmentManifestSetSha256',
		'recoverySetSha256',
		'difficultyPlanAdjustmentDecisionSetSha256'
	]) {
		if (nonEmpty(metadata[field]) && !/^[a-f0-9]{64}$/.test(metadata[field])) {
			issues.push(`release.${field} must be a lowercase SHA-256 hash.`);
		}
	}
	if (
		metadata.status === 'candidate' &&
		Object.prototype.hasOwnProperty.call(metadata, 'contentParentLineageSha256')
	) {
		issues.push('candidate release must not bind contentParentLineageSha256.');
	}
	for (const field of ['shortRecallBundleSha256', 'shortRecallReviewSha256']) {
		if (
			metadata[field] !== null &&
			metadata[field] !== undefined &&
			!sha256String(metadata[field])
		) {
			issues.push(`release.${field} must be a lowercase SHA-256 hash.`);
		}
	}
	const remapHashes = [
		'curriculumRemapVerifierInputSha256',
		'descendantRemapManifestSetSha256',
		'curriculumRemapDecisionSetSha256'
	];
	const remapHashCount = remapHashes.filter(
		(field) => metadata[field] !== null && metadata[field] !== undefined
	).length;
	if (
		metadata.status === 'accepted' &&
		remapHashCount !== 0 &&
		remapHashCount !== remapHashes.length
	) {
		issues.push('accepted release descendant-remap hashes must be absent or present together.');
	}
	if (
		metadata.status === 'candidate' &&
		remapHashCount !== 0 &&
		!(
			remapHashCount === 2 &&
			metadata.curriculumRemapVerifierInputSha256 &&
			metadata.descendantRemapManifestSetSha256 &&
			metadata.curriculumRemapDecisionSetSha256 === null
		)
	) {
		issues.push('candidate descendant-remap hashes are incomplete or inconsistent.');
	}
	const difficultySpecificHashes = [
		'difficultyPlanAdjustmentVerifierInputSha256',
		'difficultyAdjustmentManifestSetSha256',
		'difficultyPlanAdjustmentDecisionSetSha256'
	];
	const difficultyHashCount = difficultySpecificHashes.filter(
		(field) => metadata[field] !== null && metadata[field] !== undefined
	).length;
	const difficultyCount = metadata.difficultyPlanAdjustmentDecisionCount;
	if (
		metadata.status === 'accepted' &&
		((difficultyHashCount === 0 && difficultyCount !== null && difficultyCount !== undefined) ||
			(difficultyHashCount !== 0 &&
				(difficultyHashCount !== difficultySpecificHashes.length ||
					!sha256String(metadata.recoverySetSha256) ||
					!Number.isSafeInteger(difficultyCount) ||
					difficultyCount < 1)))
	) {
		issues.push(
			'accepted release difficulty-plan adjustment hashes and decision count must be absent or present together.'
		);
	}
	if (
		metadata.status === 'candidate' &&
		(difficultyHashCount !== 0 || (difficultyCount !== null && difficultyCount !== undefined)) &&
		!(
			difficultyHashCount === 2 &&
			metadata.difficultyPlanAdjustmentVerifierInputSha256 &&
			metadata.difficultyAdjustmentManifestSetSha256 &&
			metadata.recoverySetSha256 &&
			metadata.difficultyPlanAdjustmentDecisionSetSha256 === null &&
			difficultyCount === null
		)
	) {
		issues.push(
			'candidate release difficulty-plan adjustment hashes are incomplete or inconsistent.'
		);
	}
	if (nonEmpty(metadata.materializedAt) && Number.isNaN(Date.parse(metadata.materializedAt))) {
		issues.push('release.materializedAt must be an ISO date-time.');
	}
	if (metadata.status === 'accepted') {
		for (const field of [
			'contentVerificationSha256',
			'verifierDispatchLedgerSha256',
			'artReviewSha256',
			'artPerceptualAuditSha256',
			'artDeliveryManifestSha256',
			'runtimeSha256',
			'shortRecallBundleSha256',
			'shortRecallReviewSha256',
			'artGenerationLineageSha256',
			'provenanceArchiveSha256'
		]) {
			if (!nonEmpty(metadata[field]) || !/^[a-f0-9]{64}$/.test(metadata[field])) {
				issues.push(`release.${field} must bind an accepted review.`);
			}
		}
	}
}

const CONTEXT_SIMILARITY_STOP_WORDS = new Set(
	[
		'a',
		'an',
		'the',
		'this',
		'that',
		'these',
		'those',
		'is',
		'are',
		'was',
		'were',
		'be',
		'been',
		'being',
		'has',
		'have',
		'had',
		'having',
		'to',
		'of',
		'in',
		'on',
		'at',
		'by',
		'for',
		'from',
		'with',
		'without',
		'into',
		'onto',
		'over',
		'under',
		'above',
		'below',
		'and',
		'or',
		'but',
		'if',
		'then',
		'than',
		'as',
		'it',
		'its',
		'their',
		'there',
		'here',
		'which',
		'what',
		'why',
		'how',
		'when',
		'where',
		'who',
		'whose',
		'do',
		'does',
		'did',
		'doing',
		'use',
		'uses',
		'used',
		'using',
		'may',
		'might',
		'can',
		'could',
		'should',
		'would',
		'will',
		'shall',
		'must',
		'most',
		'more',
		'less',
		'very',
		'only',
		'also',
		'both',
		'each',
		'every',
		'some',
		'any',
		'one',
		'two',
		'three',
		'same',
		'different',
		'given',
		'show',
		'shows',
		'shown',
		'explain',
		'explains',
		'explaining',
		'calculate',
		'calculates',
		'calculating',
		'state',
		'states',
		'stating',
		'identify',
		'identifies',
		'identifying',
		'choose',
		'chooses',
		'choosing',
		'complete',
		'completes',
		'completing',
		'determine',
		'determines',
		'determining',
		'describe',
		'describes',
		'describing',
		'compare',
		'compares',
		'comparing',
		'correctly',
		'correct',
		'best',
		'statement',
		'option',
		'answer',
		'question',
		'before',
		'after',
		'another',
		'first',
		'second',
		'student',
		'pupil',
		'class',
		'team',
		'researcher',
		'scientist'
	].map((word) => normalizeConceptWord(word))
);

const ANSWER_CONCEPT_STOP_WORDS = new Set(
	[
		...CONTEXT_SIMILARITY_STOP_WORDS,
		'stage',
		'setup',
		'scene',
		'still',
		'life',
		'tactile',
		'editorial',
		'polished',
		'text',
		'free',
		'answer',
		'neutral',
		'central',
		'compact',
		'row',
		'set',
		'pair',
		'material',
		'materials',
		'object',
		'objects',
		'model',
		'models',
		'sample',
		'samples',
		'specimen',
		'specimens',
		'apparatus',
		'clean',
		'clear',
		'closed',
		'sealed',
		'capped',
		'unbranded',
		'identical',
		'appropriate',
		'intact',
		'visible',
		'visibly',
		'no',
		'not',
		'outcome',
		'result',
		'final',
		'preferred',
		'starting',
		'establish',
		'establishes',
		'establishing',
		'frame',
		'frames',
		'framing',
		'context',
		'depict',
		'depicts',
		'depicting',
		'make',
		'makes',
		'made',
		'making',
		'give',
		'gives',
		'giving'
	].map((word) => normalizeConceptWord(word))
);

function stringLeaves(value, prefix) {
	const leaves = [];
	const visit = (current, path) => {
		if (typeof current === 'string') {
			leaves.push({ path, value: current });
			return;
		}
		if (Array.isArray(current)) {
			for (const [index, item] of current.entries()) visit(item, `${path}[${index}]`);
			return;
		}
		if (isRecord(current)) {
			for (const [key, item] of Object.entries(current)) visit(item, `${path}.${key}`);
		}
	};
	visit(value, prefix);
	return leaves;
}

function challengeContexts(entry) {
	return [
		{ context: 'opening', text: stringValue(entry?.definition?.previewQuestion) },
		{ context: 'transfer', text: stringValue(entry?.definition?.transferPromptLead) }
	];
}

function challengeContextSimilarity(left, right) {
	const leftTokens = conceptSequence(left, CONTEXT_SIMILARITY_STOP_WORDS, {
		excludeNumbers: true
	});
	const rightTokens = conceptSequence(right, CONTEXT_SIMILARITY_STOP_WORDS, {
		excludeNumbers: true
	});
	if (leftTokens.length < 5 || rightTokens.length < 5) return null;
	const tokenJaccard = jaccard(leftTokens, rightTokens);
	const bigramJaccard = jaccard(wordBigrams(leftTokens), wordBigrams(rightTokens));
	return {
		tokenJaccard,
		bigramJaccard,
		tooSimilar: tokenJaccard >= 0.5 || bigramJaccard >= 0.25
	};
}

function answerLeakageConcepts(art, context, definition) {
	const answer = answerComparison(context, definition);
	if (!answer || !isRecord(art)) return [];
	const correctSequence = conceptSequence(answer.correct, ANSWER_CONCEPT_STOP_WORDS);
	const correctTokens = new Set(correctSequence);
	const promptTokens = new Set(conceptSequence(answer.prompt, ANSWER_CONCEPT_STOP_WORDS));
	const distractorTokens = new Set(
		answer.distractors.flatMap((text) => conceptSequence(text, ANSWER_CONCEPT_STOP_WORDS))
	);
	// These fields describe what will actually be visible. Authorial meaning and
	// forbidden-detail prose are intentionally excluded because they often name
	// an answer only to prohibit it.
	const visibleFields = [art.scene, art.visualAnchor, art.altText].filter(nonEmpty);
	const visibleTokens = new Set(
		visibleFields.flatMap((text) => conceptSequence(text, ANSWER_CONCEPT_STOP_WORDS))
	);
	const novelCorrectTokens = [...correctTokens].filter(
		(token) => visibleTokens.has(token) && !promptTokens.has(token)
	);
	const answerUniqueTokens = novelCorrectTokens.filter((token) => !distractorTokens.has(token));
	if (answerUniqueTokens.length >= 2) return answerUniqueTokens.sort(compareCodePoints);

	const correctPairs = new Set(wordBigrams(correctSequence, { unordered: true }));
	const visiblePairs = new Set(
		visibleFields.flatMap((text) =>
			wordBigrams(conceptSequence(text, ANSWER_CONCEPT_STOP_WORDS), { unordered: true })
		)
	);
	const pairTokens = [];
	for (const pair of correctPairs) {
		if (!visiblePairs.has(pair)) continue;
		const tokens = pair.split('|');
		if (!tokens.some((token) => answerUniqueTokens.includes(token))) continue;
		pairTokens.push(...tokens);
	}
	return [...new Set(pairTokens)].sort(compareCodePoints);
}

function answerComparison(context, definition) {
	if (!isRecord(definition)) return null;
	if (context === 'opening') {
		const strongerAnswer = definition.staticAnswers?.[definition.strongerAnswer];
		const weakerAnswer = definition.staticAnswers?.[definition.weakAnswer];
		if (!nonEmpty(strongerAnswer) || !nonEmpty(weakerAnswer)) return null;
		return {
			prompt: definition.previewQuestion,
			correct: strongerAnswer,
			distractors: [weakerAnswer]
		};
	}
	if (context === 'transfer' && Array.isArray(definition.transferChoices)) {
		const correct = definition.transferChoices.find((choice) => choice?.correct === true);
		const distractors = definition.transferChoices
			.filter((choice) => choice?.correct === false)
			.map((choice) => choice.text)
			.filter(nonEmpty);
		if (!nonEmpty(correct?.text) || distractors.length === 0) return null;
		return {
			prompt: definition.transferPromptLead,
			correct: correct.text,
			distractors
		};
	}
	return null;
}

function conceptSequence(value, stopWords, { excludeNumbers = false } = {}) {
	return (
		String(value ?? '')
			.toLowerCase()
			.match(/[a-z0-9]+/g) ?? []
	)
		.map(normalizeConceptWord)
		.filter(
			(token) =>
				token.length > 1 && (!excludeNumbers || !/^\d/.test(token)) && !stopWords.has(token)
		);
}

function normalizeConceptWord(value) {
	const token = String(value ?? '').toLowerCase();
	if (token.length > 6 && token.endsWith('tion')) return token.slice(0, -3);
	if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
	if (token.length > 5 && token.endsWith('ing')) {
		let root = token.slice(0, -3);
		if (root.endsWith('tt')) root = root.slice(0, -1);
		if (root.endsWith('chang')) root = `${root}e`;
		return root;
	}
	if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
	if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
	if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
	return token;
}

function wordBigrams(tokens, { unordered = false } = {}) {
	const bigrams = [];
	for (let index = 0; index < tokens.length - 1; index += 1) {
		const pair = [tokens[index], tokens[index + 1]];
		if (unordered) pair.sort(compareCodePoints);
		bigrams.push(pair.join('|'));
	}
	return bigrams;
}

function jaccard(left, right) {
	const leftSet = new Set(left);
	const rightSet = new Set(right);
	const intersection = [...leftSet].filter((value) => rightSet.has(value)).length;
	const union = leftSet.size + rightSet.size - intersection;
	return union ? intersection / union : 0;
}

function formatSimilarity(value) {
	return Number(value ?? 0).toFixed(3);
}

function referencesMissingVisual(value) {
	const text = String(value ?? '');
	const visual =
		'(?:diagram|drawing|figure|graph|chart|micrograph|photograph|apparatus|setup|circuit\\s+diagram|map)';
	const standaloneVisual =
		'(?:diagram|drawing|figure|graph|chart|micrograph|photograph|circuit\\s+diagram|map)';
	return new RegExp(
		[
			`\\b(?:a|an|the|this|that|above|below|following)\\s+${visual}\\s+(?:shows?|illustrates?|displays?|gives?|represents?|contains?|has)\\b`,
			`\\b(?:the|this|that|above|below|following)\\s+${standaloneVisual}\\b`,
			`\\b(?:shown|displayed|labelled|marked|plotted)\\s+(?:above|below|in|on|by)\\s+(?:a|an|the|this|that)?\\s*${visual}\\b`,
			`\\b(?:use|study|inspect|refer\\s+to|look\\s+at|according\\s+to|from)\\s+(?:a|an|the|this|that|above|below|following)?\\s*${visual}\\b`,
			'\\b(?:a|an|the|this|that|above|below|following)\\s+image\\s+(?:shows?|illustrates?|displays?|gives?|represents?|contains?|has)\\b',
			'\\b(?:this|that|following)\\s+image\\b',
			'\\b(?:shown|displayed|labelled|marked)\\s+(?:above|below|in|on|by)\\s+(?:a|an|the|this|that)?\\s*image\\b',
			'\\b(?:use|study|inspect|refer\\s+to|look\\s+at|according\\s+to)\\s+(?:a|an|the|this|that|above|below|following)?\\s*image\\b'
		].join('|'),
		'i'
	).test(text);
}

function hasInlineMarkAllocation(value) {
	return /\b(?:[1-6]|one|two|three|four|five|six)\s+marks?\b/i.test(String(value ?? ''));
}

function hasLearnerFacingProductJargon(value) {
	return [
		/\banswer[\s-]+chains?\b/i,
		/\bmissing[\s-]+links?\b/i,
		/\brepair[\s-]+chains?\b/i,
		/\bclose\s+the\s+gap\b/i,
		/\bpractise\s+this\s+step\b/i,
		/\bconstellations?\b/i
	].some((pattern) => pattern.test(String(value ?? '')));
}

function asksLearnerToDraw(value) {
	const text = String(value ?? '');
	return [
		/\b(?:draw|sketch)\s+(?:a|an|the|this)?\s*(?:diagram|graph|circuit(?:\s+diagram)?|line|ray|structure|axes|curve)\b/i,
		/\b(?:complete|label|annotate)\s+(?:a|an|the|this)?\s*(?:diagram|graph|circuit\s+diagram|ray\s+diagram|axes|curve)\b/i,
		/\bplot\s+(?:a|an|the|this)?\s*(?:graph|line|curve|axes)\b/i
	].some((pattern) => pattern.test(text));
}

function passed() {
	return { status: 'passed', issues: [] };
}

function failed(issues) {
	return { status: 'failed', issues };
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function kebab(value) {
	return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function sha256String(value) {
	return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function titleCase(value) {
	const text = String(value ?? '');
	return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function stringValue(value) {
	return typeof value === 'string' ? value : '';
}

function normalizeQuestion(value) {
	return normalizeWhitespace(value)
		.toLowerCase()
		.replace(/[\s?.!,;:]+$/g, '');
}
