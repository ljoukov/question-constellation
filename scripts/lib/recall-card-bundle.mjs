import { createHash } from 'node:crypto';

import { isApprovedRecallVisualCueForSubject } from '../../src/lib/recall/visualCues.js';
import { recallCompanionArtifactIssues } from './recall-card-artifacts.mjs';

/** @typedef {Record<string, any>} AnyRecord */

export const RECALL_BUNDLE_SCHEMA_VERSION = 'recall-card-bundle-v2';
export const RECALL_PROMPT_VERSION = 'recall-card-compiler-v9';
export const RECALL_IMPORTABLE_PROMPT_VERSIONS = Object.freeze([
	'recall-card-compiler-v5',
	'recall-card-compiler-v6',
	'recall-card-compiler-v7',
	'recall-card-compiler-v8',
	RECALL_PROMPT_VERSION
]);
export const RECALL_MAPPING_SOURCE = 'recall-card-compiler-v2';
export const RECALL_IMPORT_OWNER = 'recall-card-import/v1';

export const RECALL_CARD_KINDS = Object.freeze([
	'definition',
	'formula',
	'process',
	'test-result',
	'unit',
	'practical',
	'fact',
	'comparison'
]);

export const RECALL_REVIEW_CHECKS = Object.freeze([
	'singleConcept',
	'officialEvidenceGrounded',
	'correctAnswerExact',
	'distractorsDiagnostic',
	'feedbackUseful',
	'concise',
	'reverseSafe',
	'memoryTipGrounded',
	'targetMappingCorrect'
]);

const SUPPORTED_EVIDENCE_CLAIMS = new Set(['front', 'back', 'reverse', 'explanation', 'memoryTip']);
const SUBJECT_PREFIX = Object.freeze({ Biology: 'bio', Chemistry: 'chem', Physics: 'phys' });
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class RecallCardBundleValidationError extends Error {
	/** @param {string[]} issues */
	constructor(issues) {
		super(`Recall card bundle validation failed:\n- ${issues.join('\n- ')}`);
		this.name = 'RecallCardBundleValidationError';
		this.issues = issues;
	}
}

/**
 * JSON schema passed to the generator. All nullable fields are required so the
 * Codex structured-output contract stays strict and deterministic.
 */
export const RECALL_GENERATION_OUTPUT_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: ['cards'],
	properties: {
		cards: {
			type: 'array',
			minItems: 1,
			maxItems: 20,
			items: {
				type: 'object',
				additionalProperties: false,
				required: [
					'id',
					'conceptKey',
					'kind',
					'visualCue',
					'front',
					'back',
					'reverseFront',
					'reverseBack',
					'explanation',
					'memoryTip',
					'choices',
					'evidence'
				],
				properties: {
					id: { type: 'string' },
					conceptKey: { type: 'string' },
					kind: { type: 'string', enum: [...RECALL_CARD_KINDS] },
					visualCue: { type: 'string' },
					front: { type: 'string' },
					back: { type: 'string' },
					reverseFront: { type: ['string', 'null'] },
					reverseBack: { type: ['string', 'null'] },
					explanation: { type: 'string' },
					memoryTip: { type: ['string', 'null'] },
					choices: {
						type: 'array',
						minItems: 4,
						maxItems: 4,
						items: {
							type: 'object',
							additionalProperties: false,
							required: ['choiceKey', 'text', 'isCorrect', 'feedback', 'misconception'],
							properties: {
								choiceKey: { type: 'string' },
								text: { type: 'string' },
								isCorrect: { type: 'boolean' },
								feedback: { type: 'string' },
								misconception: { type: ['string', 'null'] }
							}
						}
					},
					evidence: {
						type: 'object',
						additionalProperties: false,
						required: ['sourceExcerpt', 'supports'],
						properties: {
							sourceExcerpt: { type: 'string' },
							supports: {
								type: 'array',
								minItems: 1,
								items: { type: 'string' }
							}
						}
					}
				}
			}
		}
	}
});

const reviewProperties = Object.fromEntries(
	RECALL_REVIEW_CHECKS.map((name) => [name, { type: 'boolean' }])
);

export const RECALL_FULL_REVIEW_OUTPUT_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: ['reviews'],
	properties: {
		reviews: {
			type: 'array',
			minItems: 1,
			maxItems: 20,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['cardId', 'accepted', 'reason', 'checks', 'issues'],
				properties: {
					cardId: { type: 'string' },
					accepted: { type: 'boolean' },
					reason: { type: 'string' },
					checks: {
						type: 'object',
						additionalProperties: false,
						required: [...RECALL_REVIEW_CHECKS],
						properties: reviewProperties
					},
					issues: { type: 'array', items: { type: 'string' } }
				}
			}
		}
	}
});

export const RECALL_CUE_REVIEW_OUTPUT_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: ['reviews'],
	properties: {
		reviews: {
			type: 'array',
			minItems: 1,
			maxItems: 20,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['cardId', 'accepted', 'reason', 'replacementCue'],
				properties: {
					cardId: { type: 'string' },
					accepted: { type: 'boolean' },
					reason: { type: 'string' },
					replacementCue: { type: 'string' }
				}
			}
		}
	}
});

/** @param {unknown} value */
export function parseRecallJsonOutput(value) {
	if (typeof value !== 'string' || !value.trim()) {
		throw new RecallCardBundleValidationError(['model returned no JSON']);
	}
	try {
		return JSON.parse(value);
	} catch (error) {
		throw new RecallCardBundleValidationError([
			`model returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
		]);
	}
}

/**
 * Validate and normalize a generator response against exact official source
 * text. This is deliberately stricter than the structured-output schema.
 *
 * @param {unknown} input
 * @param {{subject: string, pageText: string, expectedCount?: number}} context
 */
export function validateRecallCandidateBatch(input, { subject, pageText, expectedCount }) {
	/** @type {string[]} */
	const issues = [];
	if (!isRecord(input)) throw new RecallCardBundleValidationError(['output must be an object']);
	if (!Array.isArray(input.cards)) {
		throw new RecallCardBundleValidationError(['cards must be an array']);
	}
	if (expectedCount !== undefined && input.cards.length !== expectedCount) {
		issues.push(`cards must contain exactly ${expectedCount} item(s)`);
	}
	if (input.cards.length < 1 || input.cards.length > 20) {
		issues.push('cards must contain between 1 and 20 items');
	}
	if (!Object.hasOwn(SUBJECT_PREFIX, subject)) issues.push(`unsupported subject ${subject}`);

	const cards = input.cards.map((raw, index) =>
		normalizeCandidate(raw, index, { subject, pageText, issues })
	);
	unique(
		cards.map((card) => card.id),
		'card id',
		issues
	);
	unique(
		cards.map((card) => card.conceptKey),
		'concept key',
		issues
	);
	if (issues.length) throw new RecallCardBundleValidationError(issues);
	return { cards };
}

/** @param {any} raw @param {number} index @param {any} context */
function normalizeCandidate(raw, index, { subject, pageText, issues }) {
	const label = `cards[${index}]`;
	if (!isRecord(raw)) {
		issues.push(`${label} must be an object`);
		raw = {};
	}
	const subjectPrefix = /** @type {Record<string, string>} */ (SUBJECT_PREFIX)[subject];
	const id = boundedText(raw.id, `${label}.id`, 80, issues);
	const conceptKey = boundedText(raw.conceptKey, `${label}.conceptKey`, 64, issues);
	if (id && (!SLUG_PATTERN.test(id) || !id.startsWith(`${subjectPrefix}-`))) {
		issues.push(`${label}.id must be a stable kebab-case ${subjectPrefix}- slug`);
	}
	if (conceptKey && !SLUG_PATTERN.test(conceptKey)) {
		issues.push(`${label}.conceptKey must be a stable kebab-case slug`);
	}
	const kind = boundedText(raw.kind, `${label}.kind`, 32, issues);
	if (kind && !RECALL_CARD_KINDS.includes(kind)) issues.push(`${label}.kind is unsupported`);
	const visualCue = boundedText(raw.visualCue, `${label}.visualCue`, 8, issues);
	if (visualCue && !isApprovedRecallVisualCueForSubject(visualCue, subject)) {
		issues.push(`${label}.visualCue is not approved for ${subject}`);
	}
	const front = boundedText(raw.front, `${label}.front`, 140, issues, 8);
	const back = boundedText(raw.back, `${label}.back`, 180, issues, 1);
	const explanation = boundedText(raw.explanation, `${label}.explanation`, 360, issues, 12);
	const memoryTip = nullableBoundedText(raw.memoryTip, `${label}.memoryTip`, 180, issues, 8);
	const reverseFront = nullableBoundedText(
		raw.reverseFront,
		`${label}.reverseFront`,
		140,
		issues,
		4
	);
	const reverseBack = nullableBoundedText(raw.reverseBack, `${label}.reverseBack`, 180, issues, 1);
	if ((reverseFront === null) !== (reverseBack === null)) {
		issues.push(`${label}.reverseFront and reverseBack must both be null or both be text`);
	}
	if (reverseFront && sameText(reverseFront, front)) {
		issues.push(`${label}.reverseFront must not repeat front`);
	}
	if (reverseBack && sameText(reverseBack, back)) {
		issues.push(`${label}.reverseBack must not repeat back`);
	}
	if (front && /\b(choose|select|click|tap)\b/i.test(front)) {
		issues.push(`${label}.front must work for free recall and must not mention answer controls`);
	}
	if (front && back && sameText(front, back)) issues.push(`${label}.front and back repeat`);
	if (back && explanation && sameText(back, explanation)) {
		issues.push(`${label}.explanation must add understanding rather than repeat back`);
	}

	const choices = normalizeChoices(raw.choices, label, back, issues);
	const evidence = normalizeCandidateEvidence(
		raw.evidence,
		label,
		pageText,
		memoryTip,
		Boolean(reverseFront && reverseBack),
		choices,
		issues
	);
	return {
		id,
		conceptKey,
		kind,
		visualCue,
		front,
		back,
		reverseFront,
		reverseBack,
		explanation,
		memoryTip,
		choices,
		evidence
	};
}

/** @param {unknown} input @param {string} label @param {string} back @param {string[]} issues */
function normalizeChoices(input, label, back, issues) {
	if (!Array.isArray(input) || input.length !== 4) {
		issues.push(`${label}.choices must contain exactly four choices`);
		return [];
	}
	const choices = input.map((raw, index) => {
		const choiceLabel = `${label}.choices[${index}]`;
		if (!isRecord(raw)) {
			issues.push(`${choiceLabel} must be an object`);
			raw = {};
		}
		const choiceKey = boundedText(raw.choiceKey, `${choiceLabel}.choiceKey`, 48, issues);
		if (choiceKey && !SLUG_PATTERN.test(choiceKey)) {
			issues.push(`${choiceLabel}.choiceKey must be kebab-case`);
		}
		const text = boundedText(raw.text, `${choiceLabel}.text`, 180, issues, 1);
		if (typeof raw.isCorrect !== 'boolean') {
			issues.push(`${choiceLabel}.isCorrect must be boolean`);
		}
		const isCorrect = raw.isCorrect === true;
		const feedback = boundedText(raw.feedback, `${choiceLabel}.feedback`, 220, issues, 6);
		const misconception = nullableBoundedText(
			raw.misconception,
			`${choiceLabel}.misconception`,
			160,
			issues,
			3
		);
		if (isCorrect && misconception !== null) {
			issues.push(`${choiceLabel}.misconception must be null for the correct choice`);
		}
		if (!isCorrect && misconception === null) {
			issues.push(`${choiceLabel}.misconception is required for each distractor`);
		}
		return { choiceKey, text, isCorrect, feedback, misconception };
	});
	unique(
		choices.map((choice) => choice.choiceKey),
		`${label} choice key`,
		issues
	);
	unique(
		choices.map((choice) => normalizeText(choice.text)),
		`${label} normalized choice text`,
		issues
	);
	const correct = choices.filter((choice) => choice.isCorrect);
	if (correct.length !== 1) issues.push(`${label}.choices must contain exactly one correct answer`);
	if (correct.length === 1 && !exactText(correct[0].text, back)) {
		issues.push(`${label} correct choice text must exactly match back`);
	}
	return choices;
}

/** @param {unknown} raw @param {string} label @param {string} pageText @param {string|null} memoryTip @param {boolean} hasReverse @param {any[]} choices @param {string[]} issues */
function normalizeCandidateEvidence(raw, label, pageText, memoryTip, hasReverse, choices, issues) {
	const evidenceRecord = isRecord(raw) ? raw : {};
	if (!isRecord(raw)) {
		issues.push(`${label}.evidence must be an object`);
	}
	// PDF excerpts are authored across lines, while the durable evidence contract
	// permits whitespace-only collapse. Keep the raw model output in the companion
	// artifact, but canonicalise its excerpt to one line before deterministic
	// validation and hashing. Other control characters still fail boundedText.
	const sourceExcerptInput =
		typeof evidenceRecord.sourceExcerpt === 'string'
			? evidenceRecord.sourceExcerpt.replace(/[\t\n\r\f\v ]+/g, ' ').trim()
			: evidenceRecord.sourceExcerpt;
	const sourceExcerpt = boundedText(
		sourceExcerptInput,
		`${label}.evidence.sourceExcerpt`,
		1400,
		issues,
		12
	);
	if (
		sourceExcerpt &&
		!normalizeEvidenceText(pageText).includes(normalizeEvidenceText(sourceExcerpt))
	) {
		issues.push(
			`${label}.evidence.sourceExcerpt is not an exact quote from the supplied PDF pages`
		);
	}
	if (!Array.isArray(evidenceRecord.supports) || evidenceRecord.supports.length === 0) {
		issues.push(`${label}.evidence.supports must be a non-empty array`);
	}
	const supports = Array.isArray(evidenceRecord.supports)
		? /** @type {unknown[]} */ (evidenceRecord.supports).map((value, index) => {
				const support = boundedText(value, `${label}.evidence.supports[${index}]`, 100, issues);
				if (support && !isSupportedEvidenceClaim(support)) {
					issues.push(`${label}.evidence.supports[${index}] is unsupported`);
				}
				return support;
			})
		: [];
	unique(supports, `${label} evidence support`, issues);
	const requiredSupports = [
		'front',
		'back',
		'explanation',
		...(hasReverse ? ['reverse'] : []),
		...choices.flatMap((choice) => [
			`choice:${choice.choiceKey}:feedback`,
			...(choice.isCorrect ? [] : [`choice:${choice.choiceKey}:misconception`])
		])
	];
	for (const required of requiredSupports) {
		if (!supports.includes(required))
			issues.push(`${label}.evidence.supports must include ${required}`);
	}
	if (memoryTip && !supports.includes('memoryTip')) {
		issues.push(`${label}.evidence.supports must include memoryTip when a tip is present`);
	}
	return { sourceExcerpt, supports };
}

/** @param {unknown} input @param {string[]} cardIds */
export function validateRecallFullReviews(input, cardIds) {
	/** @type {string[]} */
	const issues = [];
	if (!isRecord(input) || !Array.isArray(input.reviews)) {
		throw new RecallCardBundleValidationError(['full reviewer output must contain reviews']);
	}
	const reviews = input.reviews.map((raw, index) => {
		const label = `reviews[${index}]`;
		if (!isRecord(raw)) {
			issues.push(`${label} must be an object`);
			raw = {};
		}
		const cardId = boundedText(raw.cardId, `${label}.cardId`, 80, issues);
		const reason = boundedText(raw.reason, `${label}.reason`, 320, issues, 5);
		if (typeof raw.accepted !== 'boolean') issues.push(`${label}.accepted must be boolean`);
		const accepted = raw.accepted === true;
		/** @type {Record<string, boolean>} */
		const checks = {};
		if (!isRecord(raw.checks)) issues.push(`${label}.checks must be an object`);
		for (const name of RECALL_REVIEW_CHECKS) {
			const value = isRecord(raw.checks) ? raw.checks[name] : undefined;
			if (typeof value !== 'boolean') issues.push(`${label}.checks.${name} must be boolean`);
			checks[name] = value === true;
		}
		const reviewIssues = Array.isArray(raw.issues)
			? /** @type {unknown[]} */ (raw.issues).map((value, issueIndex) =>
					boundedText(value, `${label}.issues[${issueIndex}]`, 240, issues, 3)
				)
			: (issues.push(`${label}.issues must be an array`), []);
		if (accepted && Object.values(checks).some((value) => !value)) {
			issues.push(`${label} cannot be accepted while a review check is false`);
		}
		if (accepted && reviewIssues.length) {
			issues.push(`${label} cannot be accepted with unresolved issues`);
		}
		return { cardId, accepted, reason, checks, issues: reviewIssues };
	});
	validateReviewIdSet(reviews, cardIds, issues, 'full reviewer');
	if (issues.length) throw new RecallCardBundleValidationError(issues);
	return { reviews };
}

/** @param {unknown} input @param {Array<{id:string, subject?:string, visualCue?:string}>} cards @param {string} subject */
export function validateRecallCueReviews(input, cards, subject) {
	/** @type {string[]} */
	const issues = [];
	if (!isRecord(input) || !Array.isArray(input.reviews)) {
		throw new RecallCardBundleValidationError(['cue reviewer output must contain reviews']);
	}
	const byId = new Map(cards.map((card) => [card.id, card]));
	const reviews = input.reviews.map((raw, index) => {
		const label = `reviews[${index}]`;
		if (!isRecord(raw)) {
			issues.push(`${label} must be an object`);
			raw = {};
		}
		const cardId = boundedText(raw.cardId, `${label}.cardId`, 80, issues);
		const reason = boundedText(raw.reason, `${label}.reason`, 320, issues, 5);
		if (typeof raw.accepted !== 'boolean') issues.push(`${label}.accepted must be boolean`);
		const accepted = raw.accepted === true;
		const replacementCue = boundedText(raw.replacementCue, `${label}.replacementCue`, 8, issues);
		if (replacementCue && !isApprovedRecallVisualCueForSubject(replacementCue, subject)) {
			issues.push(`${label}.replacementCue is not approved for ${subject}`);
		}
		const card = byId.get(cardId);
		if (accepted && card && replacementCue !== card.visualCue) {
			issues.push(`${label}.replacementCue must equal the accepted card cue`);
		}
		return { cardId, accepted, reason, replacementCue };
	});
	validateReviewIdSet(
		reviews,
		cards.map((card) => card.id),
		issues,
		'cue reviewer'
	);
	if (issues.length) throw new RecallCardBundleValidationError(issues);
	return { reviews };
}

/** @param {Array<{cardId:string}>} reviews @param {string[]} cardIds @param {string[]} issues @param {string} label */
function validateReviewIdSet(reviews, cardIds, issues, label) {
	unique(
		reviews.map((review) => review.cardId),
		`${label} card id`,
		issues
	);
	const actual = new Set(reviews.map((review) => review.cardId));
	for (const id of cardIds) if (!actual.has(id)) issues.push(`${label} omitted ${id}`);
	for (const id of actual)
		if (!cardIds.includes(id)) issues.push(`${label} returned unknown ${id}`);
}

/**
 * Compile only cards independently accepted by both reviewers. Evidence and
 * curriculum targets come from the deterministic loader, never from model IDs.
 *
 * @param {{
 *  candidates: {cards:AnyRecord[]}, fullReviews:{reviews:AnyRecord[]}, cueReviews:{reviews:AnyRecord[]},
 *  evidence:AnyRecord, run:AnyRecord, companionArtifacts?:AnyRecord
 * }} input
 */
export function compileRecallCardBundle({
	candidates,
	fullReviews,
	cueReviews,
	evidence,
	run,
	companionArtifacts
}) {
	const fullById = new Map(fullReviews.reviews.map((review) => [review.cardId, review]));
	const cueById = new Map(cueReviews.reviews.map((review) => [review.cardId, review]));
	const acceptedCards = [];
	const rejectedCards = [];
	for (const candidate of candidates.cards) {
		const fullReview = fullById.get(candidate.id);
		const cueReview = cueById.get(candidate.id);
		if (!fullReview?.accepted || !cueReview?.accepted) {
			rejectedCards.push({
				id: candidate.id,
				fullReview: fullReview ?? null,
				cueReview: cueReview ?? null
			});
			continue;
		}
		const evidenceRow = {
			id: `${candidate.id}:official-curriculum`,
			sourceKind: 'curriculum_component',
			specificationId: evidence.specification.id,
			curriculumComponentId: evidence.component.id,
			pageStart: evidence.pageStart,
			pageEnd: evidence.pageEnd,
			sourceExcerpt: candidate.evidence.sourceExcerpt,
			sourceFileHash: evidence.specification.sha256,
			excerptHash: sha256(normalizeEvidenceText(candidate.evidence.sourceExcerpt)),
			supports: candidate.evidence.supports
		};
		const candidateChoices = /** @type {AnyRecord[]} */ (candidate.choices);
		const evidenceTargets = /** @type {AnyRecord[]} */ (evidence.targets);
		const card = {
			id: candidate.id,
			conceptKey: candidate.conceptKey,
			board: evidence.specification.board,
			qualification: evidence.specification.qualification,
			subject: evidence.subject,
			kind: candidate.kind,
			visualCue: candidate.visualCue,
			front: candidate.front,
			back: candidate.back,
			reverseFront: candidate.reverseFront,
			reverseBack: candidate.reverseBack,
			explanation: candidate.explanation,
			memoryTip: candidate.memoryTip,
			choices: candidateChoices.map((choice, displayOrder) => ({
				id: `${candidate.id}:${choice.choiceKey}`,
				displayOrder,
				...choice
			})),
			evidence: [evidenceRow],
			targets: evidenceTargets.map((target) => ({ ...target })),
			contentRevision: 1,
			contentHash: '',
			provenance: {
				schemaVersion: RECALL_BUNDLE_SCHEMA_VERSION,
				promptVersion: RECALL_PROMPT_VERSION,
				generationRunId: run.id,
				generatedAt: run.finishedAt,
				generator: run.generator,
				fullReviewer: run.fullReviewer,
				cueReviewer: run.cueReviewer,
				fullReview,
				cueReview
			}
		};
		card.contentHash = hashRecallCardContent(card);
		acceptedCards.push(card);
	}
	const bundle = {
		schemaVersion: RECALL_BUNDLE_SCHEMA_VERSION,
		promptVersion: RECALL_PROMPT_VERSION,
		run,
		companionArtifacts,
		source: {
			catalogSchemaVersion: evidence.catalogSchemaVersion,
			catalogPath: evidence.catalogPath,
			fingerprint: evidence.fingerprint,
			specification: evidence.specification,
			component: evidence.component,
			topicComponent: evidence.topicComponent,
			pageStart: evidence.pageStart,
			pageEnd: evidence.pageEnd
		},
		cards: acceptedCards
	};
	validateRecallCardBundle(bundle);
	return { bundle, rejectedCards };
}

/** @param {unknown} input */
export function validateRecallCardBundle(input) {
	/** @type {string[]} */
	const issues = [];
	if (!isRecord(input)) throw new RecallCardBundleValidationError(['bundle must be an object']);
	if (input.schemaVersion !== RECALL_BUNDLE_SCHEMA_VERSION) {
		issues.push(
			`unsupported schemaVersion ${input.schemaVersion ?? '(missing)'}; v1 artifacts predate granular choice evidence and must be regenerated as ${RECALL_BUNDLE_SCHEMA_VERSION}`
		);
	}
	if (!RECALL_IMPORTABLE_PROMPT_VERSIONS.includes(input.promptVersion)) {
		issues.push(
			`unsupported promptVersion ${input.promptVersion ?? '(missing)'}; importable versions are ${RECALL_IMPORTABLE_PROMPT_VERSIONS.join(', ')}`
		);
	}
	if (!isRecord(input.run) || !boundedText(input.run.id, 'run.id', 120, issues)) {
		issues.push('run metadata is required');
	} else {
		if (!SLUG_PATTERN.test(input.run.id)) issues.push('run.id must be a stable kebab-case slug');
		const expectedRunSuffix =
			typeof input.promptVersion === 'string'
				? input.promptVersion.replace(/^recall-card-/, '')
				: null;
		if (expectedRunSuffix && !input.run.id.endsWith(`-${expectedRunSuffix}`)) {
			issues.push(`run.id must end with -${expectedRunSuffix} for ${input.promptVersion}`);
		}
		for (const timestamp of ['startedAt', 'finishedAt']) {
			if (
				typeof input.run[timestamp] !== 'string' ||
				!Number.isFinite(Date.parse(input.run[timestamp]))
			) {
				issues.push(`run.${timestamp} must be an ISO timestamp`);
			}
		}
		if (
			Number.isFinite(Date.parse(input.run.startedAt)) &&
			Number.isFinite(Date.parse(input.run.finishedAt)) &&
			Date.parse(input.run.finishedAt) < Date.parse(input.run.startedAt)
		) {
			issues.push('run.finishedAt must not precede startedAt');
		}
		for (const stage of ['generator', 'fullReviewer', 'cueReviewer']) {
			const model = input.run[stage];
			if (model?.model !== 'gpt-5.6-sol' || model?.thinkingLevel !== 'max') {
				issues.push(`run.${stage} must use gpt-5.6-sol with max reasoning`);
			}
		}
		for (const stage of ['fullReviewer', 'cueReviewer']) {
			if (input.run[stage]?.independentTurn !== true) {
				issues.push(`run.${stage} must record an independent turn`);
			}
		}
		if (
			promptVersionRequiresCompanionArtifacts(input.promptVersion) &&
			typeof input.run.cueReviewer?.replacementReviewRun !== 'boolean'
		) {
			issues.push('run.cueReviewer.replacementReviewRun must be boolean');
		}
	}
	const replacementReviewRun = input.run?.cueReviewer?.replacementReviewRun === true;
	for (const issue of recallCompanionArtifactIssues(input.companionArtifacts, {
		replacementReviewRun,
		required: promptVersionRequiresCompanionArtifacts(input.promptVersion)
	})) {
		issues.push(issue);
	}
	if (!isRecord(input.source)) {
		issues.push('source metadata is required');
	} else {
		if (!SHA256_PATTERN.test(input.source.fingerprint ?? '')) {
			issues.push('source.fingerprint must be a SHA-256 hash');
		}
		if (!isRecord(input.source.specification)) issues.push('source.specification is required');
		if (!isRecord(input.source.component)) issues.push('source.component is required');
		if (!isRecord(input.source.topicComponent)) issues.push('source.topicComponent is required');
	}
	if (!Array.isArray(input.cards) || input.cards.length === 0) {
		issues.push('accepted bundle must contain at least one card');
	}
	const cards = Array.isArray(input.cards) ? input.cards : [];
	for (const [index, card] of cards.entries()) validateCompiledCard(card, index, input, issues);
	unique(
		cards.map((card) => card.id),
		'bundle card id',
		issues
	);
	unique(
		cards.map((card) => `${card.subject}:${card.conceptKey}`),
		'bundle concept',
		issues
	);
	if (issues.length) throw new RecallCardBundleValidationError(issues);
	return input;
}

/** @param {unknown} promptVersion */
function promptVersionRequiresCompanionArtifacts(promptVersion) {
	const match = /^recall-card-compiler-v(\d+)$/.exec(String(promptVersion ?? ''));
	return match ? Number(match[1]) >= 7 : false;
}

/** @param {any} card @param {number} index @param {any} bundle @param {string[]} issues */
function validateCompiledCard(card, index, bundle, issues) {
	const label = `cards[${index}]`;
	if (!isRecord(card)) {
		issues.push(`${label} must be an object`);
		return;
	}
	const choices = Array.isArray(card.choices) ? /** @type {AnyRecord[]} */ (card.choices) : [];
	const evidenceRows = Array.isArray(card.evidence)
		? /** @type {AnyRecord[]} */ (card.evidence)
		: [];
	const targets = Array.isArray(card.targets) ? /** @type {AnyRecord[]} */ (card.targets) : [];
	if (!Object.hasOwn(SUBJECT_PREFIX, card.subject)) issues.push(`${label}.subject is unsupported`);
	if (card.board !== 'AQA' || card.qualification !== 'GCSE') {
		issues.push(`${label} must be AQA GCSE`);
	}
	if (!isApprovedRecallVisualCueForSubject(card.visualCue, card.subject)) {
		issues.push(`${label}.visualCue is not approved for ${card.subject}`);
	}
	if (!RECALL_CARD_KINDS.includes(card.kind)) issues.push(`${label}.kind is unsupported`);
	const prefix = /** @type {Record<string, string>} */ (SUBJECT_PREFIX)[card.subject];
	if (!SLUG_PATTERN.test(card.id ?? '') || (prefix && !card.id.startsWith(`${prefix}-`))) {
		issues.push(`${label}.id is not a stable subject-prefixed slug`);
	}
	if (!SLUG_PATTERN.test(card.conceptKey ?? '')) issues.push(`${label}.conceptKey is invalid`);
	boundedText(card.front, `${label}.front`, 140, issues, 8);
	boundedText(card.back, `${label}.back`, 180, issues, 1);
	boundedText(card.explanation, `${label}.explanation`, 360, issues, 12);
	if (card.memoryTip !== null) boundedText(card.memoryTip, `${label}.memoryTip`, 180, issues, 8);
	if ((card.reverseFront === null) !== (card.reverseBack === null)) {
		issues.push(`${label}.reverseFront and reverseBack must be a complete pair`);
	}
	if (card.reverseFront !== null) {
		boundedText(card.reverseFront, `${label}.reverseFront`, 140, issues, 4);
		boundedText(card.reverseBack, `${label}.reverseBack`, 180, issues, 1);
		if (sameText(card.reverseFront, card.front) || sameText(card.reverseBack, card.back)) {
			issues.push(`${label}.reverse pair must be distinct from the forward card`);
		}
	}
	if (sameText(card.back, card.explanation)) {
		issues.push(`${label}.explanation must not repeat back`);
	}
	if (!Number.isInteger(card.contentRevision) || card.contentRevision < 1) {
		issues.push(`${label}.contentRevision must be a positive integer`);
	}
	if (!SHA256_PATTERN.test(card.contentHash ?? '')) issues.push(`${label}.contentHash is invalid`);
	if (card.contentHash && card.contentHash !== hashRecallCardContent(card)) {
		issues.push(`${label}.contentHash does not match card content`);
	}
	if (choices.length !== 4) {
		issues.push(`${label}.choices must contain four items`);
	} else {
		if (choices.filter((choice) => choice.isCorrect).length !== 1) {
			issues.push(`${label}.choices must contain one correct item`);
		}
		const correct = choices.find((choice) => choice.isCorrect);
		if (!correct || !exactText(correct.text, card.back)) {
			issues.push(`${label} correct choice must equal back`);
		}
		unique(
			choices.map((choice) => normalizeText(choice.text)),
			`${label} choice text`,
			issues
		);
		for (const [choiceIndex, choice] of choices.entries()) {
			if (!SLUG_PATTERN.test(choice.choiceKey ?? '')) {
				issues.push(`${label}.choices[${choiceIndex}].choiceKey is invalid`);
			}
			boundedText(choice.text, `${label}.choices[${choiceIndex}].text`, 180, issues);
			boundedText(choice.feedback, `${label}.choices[${choiceIndex}].feedback`, 220, issues, 6);
			if (choice.isCorrect && choice.misconception !== null) {
				issues.push(`${label}.choices[${choiceIndex}] correct choice has a misconception`);
			}
			if (!choice.isCorrect) {
				boundedText(
					choice.misconception,
					`${label}.choices[${choiceIndex}].misconception`,
					160,
					issues,
					3
				);
			}
		}
		unique(
			choices.map((choice) => choice.choiceKey),
			`${label} choice key`,
			issues
		);
		const displayOrders = choices.map((choice) => choice.displayOrder);
		if (displayOrders.some((value, choiceIndex) => value !== choiceIndex)) {
			issues.push(`${label}.choices displayOrder must be exactly 0, 1, 2, 3`);
		}
	}
	if (evidenceRows.length === 0) {
		issues.push(`${label}.evidence is required`);
	} else {
		for (const [evidenceIndex, row] of evidenceRows.entries()) {
			if (row.sourceKind !== 'curriculum_component') {
				issues.push(`${label}.evidence[${evidenceIndex}].sourceKind is unsupported`);
			}
			boundedText(
				row.sourceExcerpt,
				`${label}.evidence[${evidenceIndex}].sourceExcerpt`,
				1400,
				issues,
				12
			);
			if (!SHA256_PATTERN.test(row.sourceFileHash ?? '')) {
				issues.push(`${label}.evidence[${evidenceIndex}].sourceFileHash is invalid`);
			}
			if (!SHA256_PATTERN.test(row.excerptHash ?? '')) {
				issues.push(`${label}.evidence[${evidenceIndex}].excerptHash is invalid`);
			}
			if (row.excerptHash !== sha256(normalizeEvidenceText(row.sourceExcerpt))) {
				issues.push(`${label}.evidence[${evidenceIndex}].excerptHash does not match its quote`);
			}
			if (!Array.isArray(row.supports) || row.supports.length === 0) {
				issues.push(`${label}.evidence[${evidenceIndex}].supports is required`);
			} else {
				const requiredSupports = [
					'front',
					'back',
					'explanation',
					...(card.reverseFront !== null ? ['reverse'] : []),
					...choices.flatMap((choice) => [
						`choice:${choice.choiceKey}:feedback`,
						...(choice.isCorrect ? [] : [`choice:${choice.choiceKey}:misconception`])
					])
				];
				for (const required of requiredSupports) {
					if (!row.supports.includes(required)) {
						issues.push(`${label}.evidence[${evidenceIndex}].supports must include ${required}`);
					}
				}
				if (card.memoryTip && !row.supports.includes('memoryTip')) {
					issues.push(`${label}.evidence[${evidenceIndex}] does not support memoryTip`);
				}
			}
			if (isRecord(bundle.source?.specification)) {
				if (row.specificationId !== bundle.source.specification.id) {
					issues.push(
						`${label}.evidence[${evidenceIndex}] specification differs from bundle source`
					);
				}
				if (row.sourceFileHash !== bundle.source.specification.sha256) {
					issues.push(`${label}.evidence[${evidenceIndex}] file hash differs from bundle source`);
				}
			}
			if (row.curriculumComponentId !== bundle.source?.component?.id) {
				issues.push(`${label}.evidence[${evidenceIndex}] component differs from bundle source`);
			}
			if (row.pageStart !== bundle.source?.pageStart || row.pageEnd !== bundle.source?.pageEnd) {
				issues.push(`${label}.evidence[${evidenceIndex}] page range differs from bundle source`);
			}
		}
	}
	if (targets.length === 0) {
		issues.push(`${label}.targets is required`);
	} else {
		if (targets.filter((target) => target.reviewed && target.isPrimary).length !== 1) {
			issues.push(`${label}.targets must contain exactly one reviewed primary target`);
		}
		if (targets.some((target) => !target.reviewed)) {
			issues.push(`${label}.targets cannot contain an unreviewed mapping`);
		}
		for (const [targetIndex, target] of targets.entries()) {
			if (target.curriculumComponentId !== bundle.source?.component?.id) {
				issues.push(`${label}.targets[${targetIndex}] component differs from bundle source`);
			}
			if (target.topicComponentId !== bundle.source?.topicComponent?.id) {
				issues.push(`${label}.targets[${targetIndex}] topic differs from bundle source`);
			}
			if (target.confidence !== 1 || target.mappingSource !== RECALL_MAPPING_SOURCE) {
				issues.push(`${label}.targets[${targetIndex}] is not an exact compiler-reviewed mapping`);
			}
		}
	}
	if (card.provenance?.generationRunId !== bundle.run?.id) {
		issues.push(`${label}.provenance generation run differs from bundle`);
	}
	if (card.provenance?.promptVersion !== bundle.promptVersion) {
		issues.push(`${label}.provenance prompt version differs from bundle`);
	}
}

/** @param {any} card */
export function hashRecallCardContent(card) {
	const choices = /** @type {AnyRecord[]} */ (card.choices);
	const evidenceRows = /** @type {AnyRecord[]} */ (card.evidence);
	const targets = /** @type {AnyRecord[]} */ (card.targets);
	return sha256(
		stableStringify({
			id: card.id,
			conceptKey: card.conceptKey,
			board: card.board,
			qualification: card.qualification,
			subject: card.subject,
			kind: card.kind,
			visualCue: card.visualCue,
			front: card.front,
			back: card.back,
			reverseFront: card.reverseFront,
			reverseBack: card.reverseBack,
			explanation: card.explanation,
			memoryTip: card.memoryTip,
			choices: choices.map((choice) => ({
				displayOrder: choice.displayOrder,
				choiceKey: choice.choiceKey,
				text: choice.text,
				isCorrect: choice.isCorrect,
				feedback: choice.feedback,
				misconception: choice.misconception
			})),
			evidence: evidenceRows.map((row) => ({
				specificationId: row.specificationId,
				curriculumComponentId: row.curriculumComponentId,
				pageStart: row.pageStart,
				pageEnd: row.pageEnd,
				sourceExcerpt: row.sourceExcerpt,
				sourceFileHash: row.sourceFileHash,
				supports: row.supports
			})),
			targets: targets.map((target) => ({
				offeringId: target.offeringId,
				curriculumComponentId: target.curriculumComponentId,
				topicComponentId: target.topicComponentId,
				isPrimary: target.isPrimary,
				confidence: target.confidence,
				reviewed: target.reviewed,
				mappingSource: target.mappingSource
			}))
		})
	);
}

/** Canonical artifact identity is independent of JSON indentation or key order. @param {unknown} bundle */
export function hashRecallArtifact(bundle) {
	validateRecallCardBundle(bundle);
	return sha256(stableStringify(bundle));
}

/** @param {string} text */
export function normalizeEvidenceText(text) {
	return String(text ?? '')
		.replace(/\u00ad/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** @param {unknown} value @returns {string} */
export function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
	if (isRecord(value)) {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

/** @param {string|Buffer} value */
export function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @param {string} label @param {number} max @param {string[]} issues @param {number} [min] */
function boundedText(value, label, max, issues, min = 1) {
	if (typeof value !== 'string' || value !== value.trim() || value.length < min) {
		issues.push(`${label} must be trimmed text with at least ${min} character(s)`);
		return typeof value === 'string' ? value.trim() : '';
	}
	if (value.length > max) issues.push(`${label} must be at most ${max} characters`);
	if (/\p{Cc}/u.test(value)) issues.push(`${label} must not contain control characters`);
	return value;
}

/** @param {unknown} value @param {string} label @param {number} max @param {string[]} issues @param {number} min */
function nullableBoundedText(value, label, max, issues, min) {
	if (value === null) return null;
	return boundedText(value, label, max, issues, min);
}

/** @param {string[]} values @param {string} label @param {string[]} issues */
function unique(values, label, issues) {
	const seen = new Set();
	for (const value of values) {
		if (seen.has(value)) issues.push(`${label} must be unique: ${value}`);
		seen.add(value);
	}
}

/** @param {unknown} a @param {unknown} b */
function sameText(a, b) {
	return normalizeText(a) === normalizeText(b);
}

/** @param {unknown} a @param {unknown} b */
function exactText(a, b) {
	return String(a ?? '').trim() === String(b ?? '').trim();
}

/** @param {unknown} value */
function normalizeText(value) {
	return String(value ?? '')
		.normalize('NFKC')
		.toLocaleLowerCase('en-GB')
		.replace(/\s+/g, ' ')
		.trim();
}

/** @param {string} value */
function isSupportedEvidenceClaim(value) {
	return (
		SUPPORTED_EVIDENCE_CLAIMS.has(value) ||
		/^choice:[a-z0-9]+(?:-[a-z0-9]+)*:(?:feedback|misconception)$/.test(value)
	);
}
