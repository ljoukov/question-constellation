/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Import tooling validates unknown JSON explicitly at runtime.
import { createHash } from 'node:crypto';
import path from 'node:path';

export const STUDY_CARD_SCHEMA_VERSION = 'standard-study-deck-v1';
export const STUDY_CARD_IMPORT_OWNER = 'study-card-import/v1';
export const STUDY_CARD_MAPPING_SOURCE = 'standard-study-deck-v1';

export const STUDY_CARD_BOARDS = Object.freeze(['AQA', 'OCR']);
export const STUDY_CARD_SUBJECTS = Object.freeze([
	'Biology',
	'Chemistry',
	'Physics',
	'Computer Science',
	'Geography',
	'History',
	'English Language',
	'English Literature'
]);
export const STUDY_CARD_KINDS = Object.freeze([
	'definition',
	'formula',
	'process',
	'test-result',
	'unit',
	'practical',
	'fact',
	'comparison',
	'case-study',
	'chronology',
	'cause-consequence',
	'interpretation',
	'technique',
	'structure',
	'method',
	'plot',
	'quotation',
	'character',
	'theme',
	'context'
]);
export const STUDY_CARD_SOURCE_KINDS = Object.freeze([
	'curriculum-specification',
	'question-paper',
	'mark-scheme',
	'examiner-report',
	'supporting-document',
	'official-web-page',
	'primary-text',
	'secondary-source',
	'original-synthesis'
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHOICE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AQA_SUBJECTS = new Set([
	'Biology',
	'Chemistry',
	'Physics',
	'Computer Science',
	'Geography',
	'History'
]);
const OCR_SUBJECTS = new Set(['English Language', 'English Literature']);
const CORE_SUPPORTS = Object.freeze(['front', 'back', 'explanation']);
const SUPPORT_PATTERN =
	/^(front|back|reverse|explanation|memoryTip|choice:[a-z0-9]+(?:-[a-z0-9]+)*:(?:feedback|misconception))$/;

export class StudyCardArtifactValidationError extends Error {
	/** @param {string[]} issues */
	constructor(issues) {
		super(`Study-card artifact validation failed:\n- ${issues.join('\n- ')}`);
		this.name = 'StudyCardArtifactValidationError';
		this.issues = issues;
	}
}

/**
 * Validate the exact accepted artifact contract and return a canonical form.
 * Derived database-only fields (child ids, order, hashes and mapping owner)
 * are added only after the accepted fields pass validation.
 *
 * @param {unknown} input
 */
export function validateStudyCardBundle(input) {
	const issues = [];
	const root = record(input, 'artifact', issues);
	keys(root, 'artifact', ['schemaVersion', 'release', 'cards', 'coverage'], [], issues);
	const schemaVersion = boundedText(root.schemaVersion, 'schemaVersion', 1, 80, issues);
	if (schemaVersion && schemaVersion !== STUDY_CARD_SCHEMA_VERSION) {
		issues.push(`schemaVersion must equal ${STUDY_CARD_SCHEMA_VERSION}`);
	}

	const release = normalizeRelease(root.release, issues);
	const rawCards = array(root.cards, 'cards', issues);
	const cards = rawCards.map((card, index) => normalizeCard(card, index, release, issues));
	validateSupplementalRunCards(release, cards, issues);
	const rawCoverage = array(root.coverage, 'coverage', issues);
	if (rawCoverage.length < 1) issues.push('coverage must contain at least one row');
	const coverage = rawCoverage.map((row, index) => normalizeCoverage(row, index, issues));

	unique(
		cards.map((card) => card.id),
		'card id',
		issues
	);
	unique(
		cards.map((card) => `${card.board}:${card.subject}:${card.conceptKey}`),
		'board/subject/concept identity',
		issues
	);
	unique(
		cards.flatMap((card) => card.choices.map((choice) => choice.id)),
		'choice id',
		issues
	);
	unique(
		cards.flatMap((card) => card.sources.map((source) => source.id)),
		'source id',
		issues
	);
	unique(
		coverage.map((row) => `${row.offeringId}:${row.topicComponentId}`),
		'coverage offering/topic identity',
		issues
	);

	validateCoverage(cards, coverage, issues);
	for (const card of cards) {
		const expectedHash = hashStudyCardContent(card);
		card.contentHash = expectedHash;
	}

	if (issues.length) throw new StudyCardArtifactValidationError(issues);
	return {
		schemaVersion: STUDY_CARD_SCHEMA_VERSION,
		release,
		cards: cards.sort((left, right) => left.id.localeCompare(right.id)),
		coverage: coverage.sort(compareCoverage)
	};
}

/** @param {unknown} input @param {string[]} issues */
function normalizeRelease(input, issues) {
	const raw = record(input, 'release', issues);
	keys(
		raw,
		'release',
		[
			'id',
			'promptVersion',
			'generator',
			'reviewer',
			'startedAt',
			'finishedAt',
			'sourceManifestHash',
			'artifactPath'
		],
		['supplementalRuns'],
		issues
	);
	const id = boundedText(raw.id, 'release.id', 1, 120, issues);
	if (id && !SLUG_PATTERN.test(id)) issues.push('release.id must be a kebab-case slug');
	const promptVersion = boundedText(raw.promptVersion, 'release.promptVersion', 1, 120, issues);
	const generator = normalizeModelRun(raw.generator, 'release.generator', false, issues);
	const reviewer = normalizeModelRun(raw.reviewer, 'release.reviewer', true, issues);
	if (generator.runId && reviewer.runId && generator.runId === reviewer.runId) {
		issues.push('release generator and reviewer runId values must differ');
	}
	const startedAt = isoTimestamp(raw.startedAt, 'release.startedAt', issues);
	const finishedAt = isoTimestamp(raw.finishedAt, 'release.finishedAt', issues);
	if (startedAt && finishedAt && Date.parse(finishedAt) < Date.parse(startedAt)) {
		issues.push('release.finishedAt must not precede release.startedAt');
	}
	const sourceManifestHash = sha256Text(
		raw.sourceManifestHash,
		'release.sourceManifestHash',
		issues
	);
	const artifactPath = boundedText(raw.artifactPath, 'release.artifactPath', 1, 500, issues);
	const expectedPath = id ? expectedStudyCardArtifactRelativePath(id) : '';
	if (artifactPath && expectedPath && artifactPath !== expectedPath) {
		issues.push(`release.artifactPath must equal ${expectedPath}`);
	}
	const hasSupplementalRuns = Object.hasOwn(raw, 'supplementalRuns');
	const supplementalRuns = hasSupplementalRuns
		? array(raw.supplementalRuns, 'release.supplementalRuns', issues).map((run, index) =>
				normalizeSupplementalRun(run, index, issues)
			)
		: [];
	if (hasSupplementalRuns && supplementalRuns.length < 1) {
		issues.push('release.supplementalRuns must contain at least one row when present');
	}
	for (const [index, run] of supplementalRuns.entries()) {
		if (startedAt && run.startedAt && Date.parse(run.startedAt) < Date.parse(startedAt)) {
			issues.push(`release.supplementalRuns[${index}].startedAt precedes release.startedAt`);
		}
		if (finishedAt && run.finishedAt && Date.parse(run.finishedAt) > Date.parse(finishedAt)) {
			issues.push(`release.supplementalRuns[${index}].finishedAt exceeds release.finishedAt`);
		}
	}
	return {
		id,
		promptVersion,
		generator,
		reviewer,
		startedAt,
		finishedAt,
		sourceManifestHash,
		artifactPath,
		...(hasSupplementalRuns ? { supplementalRuns } : {})
	};
}

/** @param {unknown} input @param {number} index @param {string[]} issues */
function normalizeSupplementalRun(input, index, issues) {
	const label = `release.supplementalRuns[${index}]`;
	const raw = record(input, label, issues);
	keys(
		raw,
		label,
		['purpose', 'promptVersion', 'cardIds', 'generator', 'reviewer', 'startedAt', 'finishedAt'],
		[],
		issues
	);
	const purpose = boundedText(raw.purpose, `${label}.purpose`, 1, 80, issues);
	if (purpose && purpose !== 'targeted-card-repair') {
		issues.push(`${label}.purpose must equal targeted-card-repair`);
	}
	const promptVersion = boundedText(raw.promptVersion, `${label}.promptVersion`, 1, 120, issues);
	const cardIds = array(raw.cardIds, `${label}.cardIds`, issues).map((value, cardIndex) => {
		const cardId = boundedText(value, `${label}.cardIds[${cardIndex}]`, 1, 160, issues);
		if (cardId && !SLUG_PATTERN.test(cardId)) {
			issues.push(`${label}.cardIds[${cardIndex}] must be a kebab-case slug`);
		}
		return cardId;
	});
	if (cardIds.length < 1) issues.push(`${label}.cardIds must contain at least one card id`);
	unique(cardIds, `${label} card id`, issues);
	const generator = normalizeModelRun(raw.generator, `${label}.generator`, false, issues);
	const reviewer = normalizeModelRun(raw.reviewer, `${label}.reviewer`, true, issues);
	if (generator.runId && reviewer.runId && generator.runId === reviewer.runId) {
		issues.push(`${label} generator and reviewer runId values must differ`);
	}
	const startedAt = isoTimestamp(raw.startedAt, `${label}.startedAt`, issues);
	const finishedAt = isoTimestamp(raw.finishedAt, `${label}.finishedAt`, issues);
	if (startedAt && finishedAt && Date.parse(finishedAt) < Date.parse(startedAt)) {
		issues.push(`${label}.finishedAt must not precede startedAt`);
	}
	return {
		purpose: 'targeted-card-repair',
		promptVersion,
		cardIds,
		generator,
		reviewer,
		startedAt,
		finishedAt
	};
}

/** @param {any} release @param {any[]} cards @param {string[]} issues */
function validateSupplementalRunCards(release, cards, issues) {
	const cardIds = new Set(cards.map((card) => card.id));
	const claimedCardIds = new Set();
	for (const [runIndex, run] of (release.supplementalRuns ?? []).entries()) {
		for (const [cardIndex, cardId] of run.cardIds.entries()) {
			if (!cardIds.has(cardId)) {
				issues.push(
					`release.supplementalRuns[${runIndex}].cardIds[${cardIndex}] does not identify a card in this artifact`
				);
			}
			if (claimedCardIds.has(cardId)) {
				issues.push(
					`release.supplementalRuns[${runIndex}].cardIds[${cardIndex}] is already claimed by another supplemental generator run`
				);
			}
			claimedCardIds.add(cardId);
		}
	}
}

/** @param {unknown} input @param {string} label @param {boolean} reviewer @param {string[]} issues */
function normalizeModelRun(input, label, reviewer, issues) {
	const raw = record(input, label, issues);
	keys(
		raw,
		label,
		reviewer
			? ['model', 'thinkingLevel', 'runId', 'independentTurn']
			: ['model', 'thinkingLevel', 'runId'],
		[],
		issues
	);
	const model = boundedText(raw.model, `${label}.model`, 1, 120, issues);
	const thinkingLevel = boundedText(raw.thinkingLevel, `${label}.thinkingLevel`, 1, 40, issues);
	const runId = boundedText(raw.runId, `${label}.runId`, 1, 160, issues);
	if (reviewer) {
		if (raw.independentTurn !== true) issues.push(`${label}.independentTurn must be true`);
		return { model, thinkingLevel, runId, independentTurn: true };
	}
	return { model, thinkingLevel, runId };
}

/** @param {unknown} input @param {number} index @param {any} release @param {string[]} issues */
function normalizeCard(input, index, release, issues) {
	const label = `cards[${index}]`;
	const raw = record(input, label, issues);
	keys(
		raw,
		label,
		[
			'id',
			'conceptKey',
			'board',
			'qualification',
			'subject',
			'kind',
			'visualCue',
			'front',
			'back',
			'explanation',
			'contentRevision',
			'choices',
			'sources',
			'targets'
		],
		['reverseFront', 'reverseBack', 'memoryTip'],
		issues
	);
	const id = boundedText(raw.id, `${label}.id`, 1, 160, issues);
	if (id && !SLUG_PATTERN.test(id)) issues.push(`${label}.id must be a kebab-case slug`);
	const conceptKey = boundedText(raw.conceptKey, `${label}.conceptKey`, 1, 100, issues);
	if (conceptKey && !SLUG_PATTERN.test(conceptKey)) {
		issues.push(`${label}.conceptKey must be a kebab-case slug`);
	}
	const board = boundedText(raw.board, `${label}.board`, 1, 20, issues);
	if (board && !STUDY_CARD_BOARDS.includes(board)) issues.push(`${label}.board is unsupported`);
	const qualification = boundedText(raw.qualification, `${label}.qualification`, 1, 40, issues);
	if (qualification && qualification !== 'GCSE') issues.push(`${label}.qualification must be GCSE`);
	const subject = boundedText(raw.subject, `${label}.subject`, 1, 80, issues);
	if (subject && !STUDY_CARD_SUBJECTS.includes(subject))
		issues.push(`${label}.subject is unsupported`);
	if (board && subject && !validBoardSubject(board, subject)) {
		issues.push(`${label} uses unsupported board/subject pairing ${board}/${subject}`);
	}
	const kind = boundedText(raw.kind, `${label}.kind`, 1, 40, issues);
	if (kind && !STUDY_CARD_KINDS.includes(kind)) issues.push(`${label}.kind is unsupported`);
	const visualCue = boundedText(raw.visualCue, `${label}.visualCue`, 1, 16, issues);
	const front = boundedText(raw.front, `${label}.front`, 8, 240, issues);
	const back = boundedText(raw.back, `${label}.back`, 1, 700, issues);
	const reverseFront = nullableText(raw.reverseFront, `${label}.reverseFront`, 4, 240, issues);
	const reverseBack = nullableText(raw.reverseBack, `${label}.reverseBack`, 1, 700, issues);
	if ((reverseFront === null) !== (reverseBack === null)) {
		issues.push(`${label}.reverseFront and reverseBack must both be present or both be null`);
	}
	const explanation = boundedText(raw.explanation, `${label}.explanation`, 12, 1200, issues);
	const memoryTip = nullableText(raw.memoryTip, `${label}.memoryTip`, 8, 180, issues);
	const contentRevision = integer(raw.contentRevision, `${label}.contentRevision`, 1, issues);

	const choices = array(raw.choices, `${label}.choices`, issues).map((choice, choiceIndex) =>
		normalizeChoice(choice, label, id, choiceIndex, issues)
	);
	if (choices.length < 3 || choices.length > 4) {
		issues.push(`${label}.choices must contain three or four rows`);
	}
	unique(
		choices.map((choice) => choice.choiceKey),
		`${label} choice key`,
		issues
	);
	unique(
		choices.map((choice) => normalizeComparable(choice.text)),
		`${label} choice text`,
		issues
	);
	const correct = choices.filter((choice) => choice.isCorrect);
	if (correct.length !== 1) issues.push(`${label}.choices must contain exactly one correct row`);
	if (correct.length === 1 && back && !sameText(correct[0].text, back)) {
		issues.push(`${label} correct choice text must equal back`);
	}

	const sources = array(raw.sources, `${label}.sources`, issues).map((source, sourceIndex) =>
		normalizeSource(source, label, id, sourceIndex, issues)
	);
	if (sources.length < 1) issues.push(`${label}.sources must contain at least one row`);
	const supported = new Set(sources.flatMap((source) => source.supports));
	for (const field of CORE_SUPPORTS) {
		if (!supported.has(field)) issues.push(`${label}.sources do not support ${field}`);
	}
	if (memoryTip && !supported.has('memoryTip')) {
		issues.push(`${label}.sources do not support memoryTip`);
	}
	if (reverseFront && !supported.has('reverse')) {
		issues.push(`${label}.sources do not support reverse`);
	}

	const targets = array(raw.targets, `${label}.targets`, issues).map((target, targetIndex) =>
		normalizeTarget(target, label, targetIndex, issues)
	);
	if (targets.length < 1) issues.push(`${label}.targets must contain at least one row`);
	unique(
		targets.map(
			(target) => `${target.offeringId}:${target.curriculumComponentId}:${target.topicComponentId}`
		),
		`${label} target identity`,
		issues
	);
	unique(
		targets.map((target) => `${target.offeringId}:${target.topicComponentId}`),
		`${label} offering/topic target`,
		issues
	);
	if (targets.filter((target) => target.isPrimary && target.reviewed).length !== 1) {
		issues.push(`${label}.targets must contain exactly one reviewed primary row`);
	}
	if (targets.some((target) => !target.reviewed)) {
		issues.push(`${label}.targets may not contain an unreviewed row`);
	}

	const normalized = {
		id,
		conceptKey,
		board,
		qualification,
		subject,
		kind,
		visualCue,
		front,
		back,
		reverseFront,
		reverseBack,
		explanation,
		memoryTip,
		contentRevision,
		contentHash: '',
		choices: choices.sort((left, right) => left.displayOrder - right.displayOrder),
		sources: sources.sort((left, right) => left.id.localeCompare(right.id)),
		targets: targets.sort(compareTargets),
		provenance: {
			schemaVersion: STUDY_CARD_SCHEMA_VERSION,
			releaseId: release.id,
			promptVersion: release.promptVersion,
			generator: release.generator,
			reviewer: release.reviewer,
			sourceManifestHash: release.sourceManifestHash,
			artifactPath: release.artifactPath,
			...(release.supplementalRuns?.some((run) => run.cardIds.includes(id))
				? {
						supplementalRuns: release.supplementalRuns.filter((run) => run.cardIds.includes(id))
					}
				: {})
		}
	};
	return normalized;
}

/** @param {unknown} input @param {string} cardLabel @param {string} cardId @param {number} index @param {string[]} issues */
function normalizeChoice(input, cardLabel, cardId, index, issues) {
	const label = `${cardLabel}.choices[${index}]`;
	const raw = record(input, label, issues);
	keys(raw, label, ['key', 'text', 'isCorrect', 'feedback'], ['misconception'], issues);
	const choiceKey = boundedText(raw.key, `${label}.key`, 1, 80, issues);
	if (choiceKey && !CHOICE_KEY_PATTERN.test(choiceKey)) {
		issues.push(`${label}.key must be a kebab-case slug`);
	}
	const text = boundedText(raw.text, `${label}.text`, 1, 700, issues);
	const isCorrect = boolean(raw.isCorrect, `${label}.isCorrect`, issues);
	const feedback = boundedText(raw.feedback, `${label}.feedback`, 4, 700, issues);
	const misconception = nullableText(raw.misconception, `${label}.misconception`, 4, 500, issues);
	if (isCorrect && misconception !== null) {
		issues.push(`${label}.misconception must be absent for the correct choice`);
	}
	if (!isCorrect && misconception === null) {
		issues.push(`${label}.misconception is required for a distractor`);
	}
	return {
		id: `${cardId}:choice:${choiceKey || index + 1}`,
		displayOrder: index,
		choiceKey,
		text,
		isCorrect,
		feedback,
		misconception
	};
}

/** @param {unknown} input @param {string} cardLabel @param {string} cardId @param {number} index @param {string[]} issues */
function normalizeSource(input, cardLabel, cardId, index, issues) {
	const label = `${cardLabel}.sources[${index}]`;
	const raw = record(input, label, issues);
	keys(
		raw,
		label,
		['kind', 'url', 'title', 'locator', 'excerpt', 'sourceHash', 'rightsBasis', 'supports'],
		[],
		issues
	);
	const sourceKind = boundedText(raw.kind, `${label}.kind`, 1, 80, issues);
	if (sourceKind && !STUDY_CARD_SOURCE_KINDS.includes(sourceKind)) {
		issues.push(`${label}.kind is unsupported`);
	}
	const sourceUrl = httpsUrl(raw.url, `${label}.url`, issues);
	const sourceTitle = boundedText(raw.title, `${label}.title`, 1, 500, issues);
	const sourceLocator = boundedText(raw.locator, `${label}.locator`, 1, 300, issues);
	const sourceExcerpt = boundedText(raw.excerpt, `${label}.excerpt`, 1, 2000, issues);
	const sourceHash = sha256Text(raw.sourceHash, `${label}.sourceHash`, issues);
	const rightsBasis = boundedText(raw.rightsBasis, `${label}.rightsBasis`, 4, 240, issues);
	const supports = array(raw.supports, `${label}.supports`, issues).map((value, supportIndex) => {
		const support = boundedText(value, `${label}.supports[${supportIndex}]`, 1, 120, issues);
		if (support && !SUPPORT_PATTERN.test(support)) {
			issues.push(`${label}.supports[${supportIndex}] is unsupported`);
		}
		return support;
	});
	if (supports.length < 1) issues.push(`${label}.supports must contain at least one field`);
	unique(supports, `${label} supported field`, issues);
	return {
		id: `${cardId}:source:${index + 1}`,
		sourceKind,
		sourceUrl,
		sourceTitle,
		sourceLocator,
		sourceExcerpt,
		sourceHash,
		rightsBasis,
		supports: [...supports].sort()
	};
}

/** @param {unknown} input @param {string} cardLabel @param {number} index @param {string[]} issues */
function normalizeTarget(input, cardLabel, index, issues) {
	const label = `${cardLabel}.targets[${index}]`;
	const raw = record(input, label, issues);
	keys(
		raw,
		label,
		[
			'offeringId',
			'curriculumComponentId',
			'topicComponentId',
			'isPrimary',
			'confidence',
			'reviewed'
		],
		[],
		issues
	);
	return {
		offeringId: boundedText(raw.offeringId, `${label}.offeringId`, 1, 200, issues),
		curriculumComponentId: boundedText(
			raw.curriculumComponentId,
			`${label}.curriculumComponentId`,
			1,
			240,
			issues
		),
		topicComponentId: boundedText(
			raw.topicComponentId,
			`${label}.topicComponentId`,
			1,
			240,
			issues
		),
		isPrimary: boolean(raw.isPrimary, `${label}.isPrimary`, issues),
		confidence: boundedNumber(raw.confidence, `${label}.confidence`, 0, 1, issues),
		reviewed: boolean(raw.reviewed, `${label}.reviewed`, issues),
		mappingSource: STUDY_CARD_MAPPING_SOURCE
	};
}

/** @param {unknown} input @param {number} index @param {string[]} issues */
function normalizeCoverage(input, index, issues) {
	const label = `coverage[${index}]`;
	const raw = record(input, label, issues);
	keys(raw, label, ['offeringId', 'topicComponentId', 'status', 'cardCount'], ['reason'], issues);
	const offeringId = boundedText(raw.offeringId, `${label}.offeringId`, 1, 200, issues);
	const topicComponentId = boundedText(
		raw.topicComponentId,
		`${label}.topicComponentId`,
		1,
		240,
		issues
	);
	const status = boundedText(raw.status, `${label}.status`, 1, 20, issues);
	if (status && !['ready', 'withheld'].includes(status))
		issues.push(`${label}.status is unsupported`);
	const cardCount = integer(raw.cardCount, `${label}.cardCount`, 0, issues);
	const reason = nullableText(raw.reason, `${label}.reason`, 4, 500, issues);
	if (status === 'ready' && (reason !== null || cardCount < 1)) {
		issues.push(`${label} ready coverage requires cardCount > 0 and no reason`);
	}
	if (status === 'withheld' && (reason === null || cardCount !== 0)) {
		issues.push(`${label} withheld coverage requires cardCount 0 and a reason`);
	}
	return { offeringId, topicComponentId, status, cardCount, reason, reviewed: true };
}

/** @param {any[]} cards @param {any[]} coverage @param {string[]} issues */
function validateCoverage(cards, coverage, issues) {
	const coverageByKey = new Map(
		coverage.map((row) => [`${row.offeringId}:${row.topicComponentId}`, row])
	);
	const cardsByCoverage = new Map();
	for (const card of cards) {
		for (const target of card.targets) {
			const key = `${target.offeringId}:${target.topicComponentId}`;
			if (!coverageByKey.has(key)) {
				issues.push(`${card.id} target ${key} has no explicit coverage row`);
			} else if (coverageByKey.get(key).status !== 'ready') {
				issues.push(`${card.id} target ${key} points at withheld coverage`);
			}
			if (!cardsByCoverage.has(key)) cardsByCoverage.set(key, new Set());
			cardsByCoverage.get(key).add(card.id);
		}
	}
	for (const row of coverage) {
		const key = `${row.offeringId}:${row.topicComponentId}`;
		const actual = cardsByCoverage.get(key)?.size ?? 0;
		if (row.cardCount !== actual) {
			issues.push(`coverage ${key} declares ${row.cardCount} card(s), found ${actual}`);
		}
	}
}

/**
 * Hash every learner-visible, source and targeting field for immutable card
 * identity. Derived ids and release-wide provenance are intentionally omitted.
 *
 * @param {any} card
 */
export function hashStudyCardContent(card) {
	return sha256(
		stableStringify({
			conceptKey: card.conceptKey,
			board: card.board,
			qualification: card.qualification,
			subject: card.subject,
			kind: card.kind,
			visualCue: card.visualCue,
			front: card.front,
			back: card.back,
			reverseFront: card.reverseFront ?? null,
			reverseBack: card.reverseBack ?? null,
			explanation: card.explanation,
			memoryTip: card.memoryTip ?? null,
			contentRevision: card.contentRevision,
			choices: (card.choices ?? []).map((choice) => ({
				key: choice.choiceKey ?? choice.key,
				text: choice.text,
				isCorrect: Boolean(choice.isCorrect),
				feedback: choice.feedback,
				misconception: choice.misconception ?? null
			})),
			sources: (card.sources ?? []).map((source) => ({
				kind: source.sourceKind ?? source.kind,
				url: source.sourceUrl ?? source.url,
				title: source.sourceTitle ?? source.title,
				locator: source.sourceLocator ?? source.locator,
				excerpt: source.sourceExcerpt ?? source.excerpt,
				sourceHash: source.sourceHash,
				rightsBasis: source.rightsBasis,
				supports: [...(source.supports ?? [])].sort()
			})),
			targets: (card.targets ?? []).map((target) => ({
				offeringId: target.offeringId,
				curriculumComponentId: target.curriculumComponentId,
				topicComponentId: target.topicComponentId,
				isPrimary: Boolean(target.isPrimary),
				confidence: target.confidence,
				reviewed: Boolean(target.reviewed)
			}))
		})
	);
}

/** @param {any} bundle */
export function hashStudyCardArtifact(bundle) {
	return sha256(stableStringify(artifactContractValue(bundle)));
}

/** @param {any} bundle */
function artifactContractValue(bundle) {
	return {
		schemaVersion: bundle.schemaVersion,
		release: bundle.release,
		cards: bundle.cards.map((card) => ({
			id: card.id,
			conceptKey: card.conceptKey,
			board: card.board,
			qualification: card.qualification,
			subject: card.subject,
			kind: card.kind,
			visualCue: card.visualCue,
			front: card.front,
			back: card.back,
			...(card.reverseFront === null ? {} : { reverseFront: card.reverseFront }),
			...(card.reverseBack === null ? {} : { reverseBack: card.reverseBack }),
			explanation: card.explanation,
			...(card.memoryTip === null ? {} : { memoryTip: card.memoryTip }),
			contentRevision: card.contentRevision,
			choices: card.choices.map((choice) => ({
				key: choice.choiceKey,
				text: choice.text,
				isCorrect: choice.isCorrect,
				feedback: choice.feedback,
				...(choice.misconception === null ? {} : { misconception: choice.misconception })
			})),
			sources: card.sources.map((source) => ({
				kind: source.sourceKind,
				url: source.sourceUrl,
				title: source.sourceTitle,
				locator: source.sourceLocator,
				excerpt: source.sourceExcerpt,
				sourceHash: source.sourceHash,
				rightsBasis: source.rightsBasis,
				supports: source.supports
			})),
			targets: card.targets.map((target) => ({
				offeringId: target.offeringId,
				curriculumComponentId: target.curriculumComponentId,
				topicComponentId: target.topicComponentId,
				isPrimary: target.isPrimary,
				confidence: target.confidence,
				reviewed: target.reviewed
			}))
		})),
		coverage: bundle.coverage.map((row) => ({
			offeringId: row.offeringId,
			topicComponentId: row.topicComponentId,
			status: row.status,
			cardCount: row.cardCount,
			...(row.reason === null ? {} : { reason: row.reason })
		}))
	};
}

/** @param {string} releaseId */
export function expectedStudyCardArtifactRelativePath(releaseId) {
	return `data/study-cards/releases/${releaseId}/accepted-study-cards.json`;
}

/** @param {{rootDir:string,releaseId:string}} input */
export function expectedStudyCardArtifactPath({ rootDir, releaseId }) {
	return path.resolve(rootDir, expectedStudyCardArtifactRelativePath(releaseId));
}

/** @param {unknown} value */
export function stableStringify(value) {
	return JSON.stringify(sortJson(value));
}

/** @param {unknown} value @returns {unknown} */
function sortJson(value) {
	if (Array.isArray(value)) return value.map(sortJson);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, sortJson(value[key])])
	);
}

/** @param {string} value */
function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function sha256Text(value, label, issues) {
	const normalized = boundedText(value, label, 64, 64, issues).toLowerCase();
	if (normalized && !SHA256_PATTERN.test(normalized))
		issues.push(`${label} must be lowercase SHA-256`);
	return normalized;
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function httpsUrl(value, label, issues) {
	const normalized = boundedText(value, label, 9, 1000, issues);
	if (!normalized) return normalized;
	try {
		if (new URL(normalized).protocol !== 'https:') issues.push(`${label} must use https`);
	} catch {
		issues.push(`${label} must be an absolute https URL`);
	}
	return normalized;
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function isoTimestamp(value, label, issues) {
	const normalized = boundedText(value, label, 20, 40, issues);
	if (normalized && (!Number.isFinite(Date.parse(normalized)) || !normalized.endsWith('Z'))) {
		issues.push(`${label} must be an ISO-8601 UTC timestamp`);
	}
	return normalized;
}

/** @param {unknown} value @param {string} label @param {number} min @param {number} max @param {string[]} issues */
function boundedText(value, label, min, max, issues) {
	if (typeof value !== 'string') {
		issues.push(`${label} must be text`);
		return '';
	}
	const normalized = value.trim();
	if (value !== normalized) issues.push(`${label} must be trimmed`);
	if (normalized.length < min || normalized.length > max) {
		issues.push(`${label} must contain between ${min} and ${max} characters`);
	}
	// Newlines and tabs are legitimate in exact source excerpts and structured
	// learner-facing answers. Reject the non-printing controls that can corrupt
	// JSON/D1 or obscure content, while preserving ordinary text layout.
	if ([...normalized].some((character) => isUnsafeTextControl(character))) {
		issues.push(`${label} contains unsafe control characters`);
	}
	return normalized;
}

/** @param {string} character */
function isUnsafeTextControl(character) {
	const code = character.charCodeAt(0);
	return (
		(code >= 0 && code <= 8) ||
		code === 11 ||
		code === 12 ||
		(code >= 14 && code <= 31) ||
		(code >= 127 && code <= 159)
	);
}

/** @param {unknown} value @param {string} label @param {number} min @param {number} max @param {string[]} issues */
function nullableText(value, label, min, max, issues) {
	if (value === undefined || value === null || value === '') return null;
	return boundedText(value, label, min, max, issues);
}

/** @param {unknown} value @param {string} label @param {number} min @param {string[]} issues */
function integer(value, label, min, issues) {
	if (!Number.isInteger(value) || value < min) {
		issues.push(`${label} must be an integer greater than or equal to ${min}`);
		return min;
	}
	return value;
}

/** @param {unknown} value @param {string} label @param {number} min @param {number} max @param {string[]} issues */
function boundedNumber(value, label, min, max, issues) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
		issues.push(`${label} must be a number between ${min} and ${max}`);
		return min;
	}
	return value;
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function boolean(value, label, issues) {
	if (typeof value !== 'boolean') {
		issues.push(`${label} must be boolean`);
		return false;
	}
	return value;
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function array(value, label, issues) {
	if (!Array.isArray(value)) {
		issues.push(`${label} must be an array`);
		return [];
	}
	return value;
}

/** @param {unknown} value @param {string} label @param {string[]} issues */
function record(value, label, issues) {
	if (!isRecord(value)) {
		issues.push(`${label} must be an object`);
		return {};
	}
	return value;
}

/** @param {Record<string, any>} value @param {string} label @param {string[]} required @param {string[]} optional @param {string[]} issues */
function keys(value, label, required, optional, issues) {
	const allowed = new Set([...required, ...optional]);
	for (const key of required) {
		if (!Object.hasOwn(value, key)) issues.push(`${label}.${key} is required`);
	}
	for (const key of Object.keys(value)) {
		if (!allowed.has(key))
			issues.push(`${label}.${key} is not allowed by ${STUDY_CARD_SCHEMA_VERSION}`);
	}
}

/** @param {unknown} value */
function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {string[]} values @param {string} label @param {string[]} issues */
function unique(values, label, issues) {
	const seen = new Set();
	for (const value of values) {
		if (!value) continue;
		if (seen.has(value)) issues.push(`duplicate ${label}: ${value}`);
		seen.add(value);
	}
}

/** @param {string} board @param {string} subject */
function validBoardSubject(board, subject) {
	return (
		(board === 'AQA' && AQA_SUBJECTS.has(subject)) || (board === 'OCR' && OCR_SUBJECTS.has(subject))
	);
}

/** @param {unknown} value */
function normalizeComparable(value) {
	return String(value ?? '')
		.normalize('NFKC')
		.trim()
		.toLocaleLowerCase('en-GB')
		.replace(/\s+/g, ' ');
}

/** @param {unknown} left @param {unknown} right */
function sameText(left, right) {
	return normalizeComparable(left) === normalizeComparable(right);
}

/** @param {any} left @param {any} right */
function compareTargets(left, right) {
	return (
		left.offeringId.localeCompare(right.offeringId) ||
		left.topicComponentId.localeCompare(right.topicComponentId) ||
		left.curriculumComponentId.localeCompare(right.curriculumComponentId)
	);
}

/** @param {any} left @param {any} right */
function compareCoverage(left, right) {
	return (
		left.offeringId.localeCompare(right.offeringId) ||
		left.topicComponentId.localeCompare(right.topicComponentId)
	);
}
