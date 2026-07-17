import { createHash } from 'node:crypto';
import path from 'node:path';

import {
	expectedStudyCardArtifactRelativePath,
	STUDY_CARD_KINDS,
	STUDY_CARD_SOURCE_KINDS
} from './study-card-artifact.mjs';
import {
	isKebabCaseStudyCardKey,
	standardStudyCardMemoryTipIssue,
	standardStudyCardSourceExcerptIssue
} from './standard-study-card-compiler.mjs';

export const SUPPLEMENTAL_RECOVERY_SCHEMA_VERSION =
	'standard-study-card-supplemental-source-recovery-v1';
export const SUPPLEMENTAL_RECOVERY_PROMPT_VERSION =
	'standard-study-card-supplemental-source-recovery-v1';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SUPPORT_PATTERN =
	/^(front|back|reverse|explanation|memoryTip|choice:[a-z0-9]+(?:-[a-z0-9]+)*:(?:feedback|misconception))$/;

/**
 * Keep the expensive path impossible to enter accidentally. A plain command is
 * always preflight-only; model use needs both a terminal queue and the exact
 * recovery id repeated on the command line.
 *
 * @param {{generate:boolean, confirmRecovery:string|null, recoveryId:string, queueTerminal:boolean, activeJobCount:number}} input
 */
export function supplementalRecoveryModelGate(input) {
	if (!input.generate) return { allowed: false, reason: 'preflight-only' };
	if (input.confirmRecovery !== input.recoveryId) {
		throw new Error(
			`Model launch requires --confirm-recovery=${input.recoveryId}; preflight alone never launches a model.`
		);
	}
	if (!input.queueTerminal) {
		throw new Error(
			`The descendant queue is not terminal (${input.activeJobCount} queued/running job(s)); supplemental recovery is gated.`
		);
	}
	return { allowed: true, reason: null };
}

/**
 * Validate the durable, no-model-cost recovery plan before any local files are
 * opened. The plan intentionally pins one failed identity and every external
 * source byte used to repair it.
 *
 * @param {unknown} value
 */
export function validateSupplementalRecoveryPlan(value) {
	const plan = requiredRecord(value, 'plan');
	const allowedKeys = new Set([
		'schemaVersion',
		'recoveryId',
		'promptVersion',
		'batchId',
		'specificationId',
		'subject',
		'baseWorkDir',
		'artifactPath',
		'queueStatePath',
		'model',
		'thinkingLevel',
		'expectedBase',
		'baseTraceFiles',
		'requiredIdentity',
		'allowedVisualCues',
		'retrieval',
		'answerSourceId',
		'sources'
	]);
	for (const key of Object.keys(plan)) {
		if (!allowedKeys.has(key)) throw new Error(`plan.${key} is not allowed.`);
	}

	if (plan.schemaVersion !== SUPPLEMENTAL_RECOVERY_SCHEMA_VERSION) {
		throw new Error(`plan.schemaVersion must equal ${SUPPLEMENTAL_RECOVERY_SCHEMA_VERSION}.`);
	}
	const recoveryId = slugText(plan.recoveryId, 'plan.recoveryId');
	const promptVersion = text(plan.promptVersion, 'plan.promptVersion');
	if (promptVersion !== SUPPLEMENTAL_RECOVERY_PROMPT_VERSION) {
		throw new Error(`plan.promptVersion must equal ${SUPPLEMENTAL_RECOVERY_PROMPT_VERSION}.`);
	}
	const batchId = slugText(plan.batchId, 'plan.batchId');
	const artifactPath = relativePathText(plan.artifactPath, 'plan.artifactPath');
	const expectedArtifactPath = expectedStudyCardArtifactRelativePath(batchId);
	if (artifactPath !== expectedArtifactPath) {
		throw new Error(`plan.artifactPath must equal ${expectedArtifactPath}.`);
	}
	const specificationId = text(plan.specificationId, 'plan.specificationId');
	const subject = text(plan.subject, 'plan.subject');
	const baseWorkDir = relativePathText(plan.baseWorkDir, 'plan.baseWorkDir');
	const queueStatePath = relativePathText(plan.queueStatePath, 'plan.queueStatePath');
	if (plan.model !== 'gpt-5.6-sol' || plan.thinkingLevel !== 'max') {
		throw new Error('Supplemental recovery requires gpt-5.6-sol/max.');
	}

	const expectedBaseRaw = requiredRecord(plan.expectedBase, 'plan.expectedBase');
	const expectedBase = {
		candidateCount: positiveInteger(
			expectedBaseRaw.candidateCount,
			'plan.expectedBase.candidateCount'
		),
		acceptedCount: positiveInteger(
			expectedBaseRaw.acceptedCount,
			'plan.expectedBase.acceptedCount'
		),
		rejectedCount: positiveInteger(
			expectedBaseRaw.rejectedCount,
			'plan.expectedBase.rejectedCount'
		),
		generatorRunId: text(expectedBaseRaw.generatorRunId, 'plan.expectedBase.generatorRunId'),
		reviewerRunId: text(expectedBaseRaw.reviewerRunId, 'plan.expectedBase.reviewerRunId')
	};
	if (expectedBase.acceptedCount + expectedBase.rejectedCount !== expectedBase.candidateCount) {
		throw new Error('plan.expectedBase accepted and rejected counts must sum to candidateCount.');
	}
	if (expectedBase.rejectedCount !== 1) {
		throw new Error('Supplemental recovery is deliberately limited to one rejected identity.');
	}
	if (expectedBase.generatorRunId === expectedBase.reviewerRunId) {
		throw new Error('The preserved generator and reviewer must be independent turns.');
	}

	const baseTraceFilesRaw = requiredRecord(plan.baseTraceFiles, 'plan.baseTraceFiles');
	const requiredBaseFiles = [
		'plan.json',
		'source-evidence.json',
		'candidate-cards.json',
		'review.json',
		'generation/codex-run-summary.json',
		'review/codex-run-summary.json'
	];
	/** @type {Record<string, string>} */
	const baseTraceFiles = {};
	for (const [fileName, hash] of Object.entries(baseTraceFilesRaw)) {
		const relativeName = relativePathText(fileName, `plan.baseTraceFiles.${fileName}`);
		baseTraceFiles[relativeName] = sha256Text(hash, `plan.baseTraceFiles.${fileName}`);
	}
	for (const fileName of requiredBaseFiles) {
		if (!baseTraceFiles[fileName]) {
			throw new Error(`plan.baseTraceFiles must pin ${fileName}.`);
		}
	}

	const identityRaw = requiredRecord(plan.requiredIdentity, 'plan.requiredIdentity');
	const identityFields = /** @type {const} */ ([
		'id',
		'conceptKey',
		'topicComponentId',
		'curriculumComponentId'
	]);
	const requiredIdentity = Object.fromEntries(
		identityFields.map((field) => [
			field,
			field === 'id' || field === 'conceptKey'
				? slugText(identityRaw[field], `plan.requiredIdentity.${field}`)
				: text(identityRaw[field], `plan.requiredIdentity.${field}`)
		])
	);

	if (!Array.isArray(plan.allowedVisualCues) || plan.allowedVisualCues.length < 1) {
		throw new Error('plan.allowedVisualCues must contain at least one cue.');
	}
	const allowedVisualCues = plan.allowedVisualCues.map((cue, index) =>
		text(cue, `plan.allowedVisualCues[${index}]`)
	);
	if (new Set(allowedVisualCues).size !== allowedVisualCues.length) {
		throw new Error('plan.allowedVisualCues must be unique.');
	}

	const retrievalRaw = requiredRecord(plan.retrieval, 'plan.retrieval');
	const retrieval = {
		kind: text(retrievalRaw.kind, 'plan.retrieval.kind'),
		front: text(retrievalRaw.front, 'plan.retrieval.front'),
		back: text(retrievalRaw.back, 'plan.retrieval.back'),
		reverseFront: nullableText(retrievalRaw.reverseFront, 'plan.retrieval.reverseFront'),
		reverseBack: nullableText(retrievalRaw.reverseBack, 'plan.retrieval.reverseBack'),
		memoryTip: nullableText(retrievalRaw.memoryTip, 'plan.retrieval.memoryTip')
	};
	if (!STUDY_CARD_KINDS.includes(retrieval.kind)) {
		throw new Error(`plan.retrieval.kind ${retrieval.kind} is unsupported.`);
	}
	if (retrieval.memoryTip !== null) {
		throw new Error('This narrow recovery pins memoryTip to null.');
	}

	if (!Array.isArray(plan.sources) || plan.sources.length < 1) {
		throw new Error('plan.sources must contain at least one source.');
	}
	const sources = plan.sources.map((source, index) => validateSource(source, index));
	if (new Set(sources.map((source) => source.id)).size !== sources.length) {
		throw new Error('plan.sources ids must be unique.');
	}
	const answerSourceId = slugText(plan.answerSourceId, 'plan.answerSourceId');
	const answerSource = sources.find((source) => source.id === answerSourceId);
	if (!answerSource) throw new Error('plan.answerSourceId must identify one pinned source.');
	if (answerSource.kind !== 'mark-scheme') {
		throw new Error('The answer evidence for this recovery must be a mark scheme.');
	}
	for (const support of ['front', 'back', 'explanation']) {
		if (!answerSource.supports.includes(support)) {
			throw new Error(`The answer source must support ${support}.`);
		}
	}

	return {
		schemaVersion: SUPPLEMENTAL_RECOVERY_SCHEMA_VERSION,
		recoveryId,
		promptVersion,
		batchId,
		specificationId,
		subject,
		baseWorkDir,
		artifactPath,
		queueStatePath,
		model: 'gpt-5.6-sol',
		thinkingLevel: 'max',
		expectedBase,
		baseTraceFiles,
		requiredIdentity,
		allowedVisualCues,
		retrieval,
		answerSourceId,
		sources
	};
}

/**
 * Deterministically validate the single model-generated replacement before it
 * is shown to a fresh reviewer.
 *
 * @param {unknown} value
 * @param {ReturnType<typeof validateSupplementalRecoveryPlan>} plan
 */
export function validateSupplementalReplacementCard(value, plan) {
	const card = requiredRecord(value, 'replacement');
	const identityFields = /** @type {const} */ ([
		'id',
		'conceptKey',
		'topicComponentId',
		'curriculumComponentId'
	]);
	for (const field of identityFields) {
		if (card[field] !== plan.requiredIdentity[field]) {
			throw new Error(`replacement.${field} changed the preserved identity.`);
		}
	}
	const retrievalFields = /** @type {const} */ ([
		'kind',
		'front',
		'back',
		'reverseFront',
		'reverseBack',
		'memoryTip'
	]);
	for (const field of retrievalFields) {
		if (card[field] !== plan.retrieval[field]) {
			throw new Error(`replacement.${field} differs from the pinned retrieval contract.`);
		}
	}
	const visualCue = text(card.visualCue, 'replacement.visualCue');
	if (!plan.allowedVisualCues.includes(visualCue)) {
		throw new Error('replacement.visualCue is outside the pinned subject allowlist.');
	}
	text(card.explanation, 'replacement.explanation');
	const answerSource = plan.sources.find((source) => source.id === plan.answerSourceId);
	if (!answerSource)
		throw new Error('replacement answer source is missing from the validated plan.');
	if (card.sourceExcerpt !== answerSource.excerpt) {
		throw new Error('replacement.sourceExcerpt differs from the pinned exact mark-scheme excerpt.');
	}
	if (card.sourceLocator !== answerSource.locator) {
		throw new Error('replacement.sourceLocator differs from the pinned mark-scheme locator.');
	}
	const sourceIssue = standardStudyCardSourceExcerptIssue(answerSource.excerpt, card.sourceExcerpt);
	if (sourceIssue) throw new Error(`replacement.sourceExcerpt ${sourceIssue}.`);
	const memoryTipIssue = standardStudyCardMemoryTipIssue(card.memoryTip);
	if (memoryTipIssue) throw new Error(`replacement.${memoryTipIssue}.`);

	if (!Array.isArray(card.choices) || card.choices.length < 3 || card.choices.length > 4) {
		throw new Error('replacement.choices must contain three or four choices.');
	}
	const choiceKeys = new Set();
	const choiceText = new Set();
	let correctCount = 0;
	for (const [index, rawChoice] of card.choices.entries()) {
		const choice = requiredRecord(rawChoice, `replacement.choices[${index}]`);
		const choiceKey = text(choice.key, `replacement.choices[${index}].key`);
		if (!isKebabCaseStudyCardKey(choiceKey)) {
			throw new Error(`replacement.choices[${index}].key must be lowercase kebab-case.`);
		}
		const normalizedKey = choiceKey.toLowerCase();
		if (choiceKeys.has(normalizedKey)) throw new Error('replacement choice keys must be unique.');
		choiceKeys.add(normalizedKey);
		const choiceValue = text(choice.text, `replacement.choices[${index}].text`);
		const normalizedText = choiceValue.toLowerCase();
		if (choiceText.has(normalizedText)) throw new Error('replacement choice text must be unique.');
		choiceText.add(normalizedText);
		text(choice.feedback, `replacement.choices[${index}].feedback`);
		if (choice.isCorrect === true) {
			correctCount += 1;
			if (choiceValue !== plan.retrieval.back) {
				throw new Error('The correct replacement choice must exactly equal the pinned back.');
			}
			if (choice.misconception !== null) {
				throw new Error('The correct replacement choice misconception must be null.');
			}
		} else {
			if (choice.isCorrect !== false) {
				throw new Error(`replacement.choices[${index}].isCorrect must be boolean.`);
			}
			text(choice.misconception, `replacement.choices[${index}].misconception`);
		}
	}
	if (correctCount !== 1) throw new Error('replacement must contain exactly one correct choice.');
	return card;
}

/** @param {unknown} input @param {number} index */
function validateSource(input, index) {
	const label = `plan.sources[${index}]`;
	const source = requiredRecord(input, label);
	const id = slugText(source.id, `${label}.id`);
	const kind = text(source.kind, `${label}.kind`);
	if (!STUDY_CARD_SOURCE_KINDS.includes(kind)) {
		throw new Error(`${label}.kind ${kind} is unsupported.`);
	}
	const url = text(source.url, `${label}.url`);
	let parsedUrl;
	try {
		parsedUrl = new URL(url);
	} catch {
		throw new Error(`${label}.url must be an absolute URL.`);
	}
	if (parsedUrl.protocol !== 'https:') throw new Error(`${label}.url must use HTTPS.`);
	const title = text(source.title, `${label}.title`);
	const localPath = relativePathText(source.localPath, `${label}.localPath`);
	const sha256 = sha256Text(source.sha256, `${label}.sha256`);
	const pdfPage = positiveInteger(source.pdfPage, `${label}.pdfPage`);
	const pageTextSha256 = sha256Text(source.pageTextSha256, `${label}.pageTextSha256`);
	const locator = text(source.locator, `${label}.locator`);
	if (!locator.includes(`page ${pdfPage}`)) {
		throw new Error(`${label}.locator must name pinned PDF page ${pdfPage}.`);
	}
	const excerpt = text(source.excerpt, `${label}.excerpt`);
	if (excerpt.length > 400) throw new Error(`${label}.excerpt exceeds 400 characters.`);
	const rightsBasis = text(source.rightsBasis, `${label}.rightsBasis`);
	if (!Array.isArray(source.supports) || source.supports.length < 1) {
		throw new Error(`${label}.supports must contain at least one field.`);
	}
	const supports = source.supports.map((support, supportIndex) => {
		const value = text(support, `${label}.supports[${supportIndex}]`);
		if (!SUPPORT_PATTERN.test(value)) throw new Error(`${label}.supports contains ${value}.`);
		return value;
	});
	if (new Set(supports).size !== supports.length) {
		throw new Error(`${label}.supports must be unique.`);
	}
	return {
		id,
		kind,
		url,
		title,
		localPath,
		sha256,
		pdfPage,
		pageTextSha256,
		locator,
		excerpt,
		rightsBasis,
		supports
	};
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function requiredRecord(value, label) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @param {string} label @returns {string} */
function text(value, label) {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
	return value;
}

/** @param {unknown} value @param {string} label @returns {string | null} */
function nullableText(value, label) {
	return value === null ? null : text(value, label);
}

/** @param {unknown} value @param {string} label @returns {string} */
function slugText(value, label) {
	const result = text(value, label);
	if (!SLUG_PATTERN.test(result)) throw new Error(`${label} must be a kebab-case slug.`);
	return result;
}

/** @param {unknown} value @param {string} label @returns {string} */
function sha256Text(value, label) {
	const result = text(value, label);
	if (!SHA256_PATTERN.test(result)) throw new Error(`${label} must be a lowercase SHA-256 hash.`);
	return result;
}

/** @param {unknown} value @param {string} label @returns {string} */
function relativePathText(value, label) {
	const result = text(value, label);
	if (path.isAbsolute(result) || result.split(/[\\/]/).includes('..')) {
		throw new Error(`${label} must be a repository-relative path without parent traversal.`);
	}
	return result;
}

/** @param {unknown} value @param {string} label @returns {number} */
function positiveInteger(value, label) {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
		throw new Error(`${label} must be a positive integer.`);
	return value;
}

/** @param {string | Buffer} value */
export function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

/** @param {unknown} value @returns {string} */
export function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	if (value && typeof value === 'object') {
		const record = /** @type {Record<string, unknown>} */ (value);
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
			.join(',')}}`;
	}
	return /** @type {string} */ (JSON.stringify(value));
}
