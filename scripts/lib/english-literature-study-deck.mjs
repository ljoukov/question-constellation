/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Offline import tooling validates unknown JSON at runtime.
import { createHash } from 'node:crypto';

export const ENGLISH_LITERATURE_SOURCE_PLAN_SCHEMA = 'ocr-j352-literature-source-plan-v1';
export const ENGLISH_LITERATURE_PROMPT_VERSION = 'ocr-j352-literature-study-deck-compiler-v4';
export const ENGLISH_LITERATURE_MODEL = 'gpt-5.6-sol';
export const ENGLISH_LITERATURE_THINKING_LEVEL = 'max';
export const ENGLISH_LITERATURE_MODES = Object.freeze(['plot', 'quotation', 'method']);
export const ENGLISH_LITERATURE_CUES = Object.freeze([
	'📖',
	'🧭',
	'🧵',
	'🎭',
	'💬',
	'🔎',
	'🪞',
	'⚖️',
	'👑',
	'🌹',
	'🔥',
	'🌙',
	'⏳',
	'🏛️',
	'🗝️'
]);

const REQUIRED_MODES = Object.freeze(['plot', 'quotation']);
const SOURCE_KINDS = new Set([
	'primary-text',
	'secondary-source',
	'supporting-document',
	'curriculum-specification'
]);
const RETRIEVAL_TYPES = new Set([
	'public-domain-text',
	'public-domain-anthology-pdf',
	'copyrighted-web-synopsis',
	'licensed-web-synopsis',
	'official-resource-pdf'
]);
const STATUS_VALUES = new Set(['ready', 'withheld']);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OFFICIAL_BOARD = 'OCR';
const OFFICIAL_QUALIFICATION = 'GCSE';
const OFFICIAL_SUBJECT = 'English Literature';

export class EnglishLiteratureSourcePlanError extends Error {
	/** @param {string[]} issues */
	constructor(issues) {
		super(`English Literature source plan is invalid:\n- ${issues.join('\n- ')}`);
		this.name = 'EnglishLiteratureSourcePlanError';
		this.issues = issues;
	}
}

/**
 * The plan must enumerate every selectable OCR J352 text/cluster exactly once.
 * Planned withholding is data, not an implicit absence.
 *
 * @param {unknown} input
 * @param {any} curriculumCatalog
 */
export function validateEnglishLiteratureSourcePlan(input, curriculumCatalog) {
	const issues = [];
	const plan = record(input, 'source plan', issues);
	exactKeys(
		plan,
		'source plan',
		['schemaVersion', 'specificationId', 'offeringId', 'topics'],
		issues
	);
	if (plan.schemaVersion !== ENGLISH_LITERATURE_SOURCE_PLAN_SCHEMA) {
		issues.push(`schemaVersion must equal ${ENGLISH_LITERATURE_SOURCE_PLAN_SCHEMA}`);
	}
	const catalog = record(curriculumCatalog, 'curriculum catalog', issues);
	const specifications = array(catalog.specifications, 'curriculum catalog specifications', issues);
	const offerings = array(catalog.offerings, 'curriculum catalog offerings', issues);
	const specification = specifications.find((entry) => entry?.id === plan.specificationId);
	const offering = offerings.find((entry) => entry?.id === plan.offeringId);
	if (!specification)
		issues.push(`specification ${String(plan.specificationId)} is not in the catalog`);
	if (!offering) issues.push(`offering ${String(plan.offeringId)} is not in the catalog`);
	if (specification) {
		if (specification.board !== OFFICIAL_BOARD) issues.push('specification board must be OCR');
		if (specification.qualification !== OFFICIAL_QUALIFICATION) {
			issues.push('specification qualification must be GCSE');
		}
		if (specification.subject !== OFFICIAL_SUBJECT) {
			issues.push('specification subject must be English Literature');
		}
	}
	if (offering) {
		if (offering.specificationId !== plan.specificationId) {
			issues.push('offering does not belong to the planned specification');
		}
		if (offering.profileSubject !== OFFICIAL_SUBJECT) {
			issues.push('offering profile subject must be English Literature');
		}
	}

	const rawTopics = array(plan.topics, 'topics', issues);
	const catalogTopicIds = new Set(offering?.selectableComponentIds ?? []);
	const catalogComponents = new Map(
		(specification?.components ?? []).map((component) => [component.id, component])
	);
	const seenTopics = new Set();
	const seenSources = new Set();
	const seenEvidence = new Set();
	const topics = rawTopics.map((rawTopic, topicIndex) => {
		const label = `topics[${topicIndex}]`;
		const topic = record(rawTopic, label, issues);
		exactKeys(
			topic,
			label,
			['topicComponentId', 'title', 'coverage', 'sources', 'evidence'],
			issues
		);
		const topicComponentId = text(topic.topicComponentId, `${label}.topicComponentId`, issues);
		const title = text(topic.title, `${label}.title`, issues);
		if (seenTopics.has(topicComponentId)) issues.push(`${label}.topicComponentId is duplicated`);
		seenTopics.add(topicComponentId);
		if (!catalogTopicIds.has(topicComponentId)) {
			issues.push(`${label}.topicComponentId is not selectable in the offering`);
		}
		if (catalogComponents.get(topicComponentId)?.title !== title) {
			issues.push(`${label}.title does not exactly match the curriculum catalog`);
		}

		const coverage = normalizeCoverage(topic.coverage, label, issues);
		const sources = array(topic.sources, `${label}.sources`, issues).map(
			(rawSource, sourceIndex) => {
				const sourceLabel = `${label}.sources[${sourceIndex}]`;
				const source = record(rawSource, sourceLabel, issues);
				exactKeys(
					source,
					sourceLabel,
					['id', 'kind', 'retrievalType', 'url', 'title', 'rightsBasis'],
					issues,
					['verificationAnchors']
				);
				const id = text(source.id, `${sourceLabel}.id`, issues);
				if (!SLUG_PATTERN.test(id)) issues.push(`${sourceLabel}.id must be kebab-case`);
				if (seenSources.has(id)) issues.push(`${sourceLabel}.id is duplicated across topics`);
				seenSources.add(id);
				const kind = text(source.kind, `${sourceLabel}.kind`, issues);
				const retrievalType = text(source.retrievalType, `${sourceLabel}.retrievalType`, issues);
				if (!SOURCE_KINDS.has(kind)) issues.push(`${sourceLabel}.kind is unsupported`);
				if (!RETRIEVAL_TYPES.has(retrievalType)) {
					issues.push(`${sourceLabel}.retrievalType is unsupported`);
				}
				if (
					['public-domain-text', 'public-domain-anthology-pdf'].includes(retrievalType) &&
					kind !== 'primary-text'
				) {
					issues.push(`${sourceLabel} public-domain text must be a primary-text source`);
				}
				if (
					['copyrighted-web-synopsis', 'licensed-web-synopsis'].includes(retrievalType) &&
					kind !== 'secondary-source'
				) {
					issues.push(`${sourceLabel} web synopsis must be a secondary-source`);
				}
				if (
					retrievalType === 'official-resource-pdf' &&
					!['supporting-document', 'curriculum-specification'].includes(kind)
				) {
					issues.push(
						`${sourceLabel} official resource must be a supporting-document or curriculum-specification`
					);
				}
				const url = httpsUrl(source.url, `${sourceLabel}.url`, issues);
				const verificationAnchors = optionalTextArray(
					source.verificationAnchors,
					`${sourceLabel}.verificationAnchors`,
					issues
				);
				return {
					id,
					kind,
					retrievalType,
					url,
					title: text(source.title, `${sourceLabel}.title`, issues),
					rightsBasis: text(source.rightsBasis, `${sourceLabel}.rightsBasis`, issues),
					verificationAnchors
				};
			}
		);
		const sourceById = new Map(sources.map((source) => [source.id, source]));
		const evidence = array(topic.evidence, `${label}.evidence`, issues).map(
			(rawEvidence, evidenceIndex) => {
				const evidenceLabel = `${label}.evidence[${evidenceIndex}]`;
				const row = record(rawEvidence, evidenceLabel, issues);
				const optional = ['anchor', 'approvedExcerpt', 'requiredAnswer'];
				exactKeys(row, evidenceLabel, ['id', 'mode', 'sourceId', 'locator'], issues, optional);
				const id = text(row.id, `${evidenceLabel}.id`, issues);
				if (!SLUG_PATTERN.test(id)) issues.push(`${evidenceLabel}.id must be kebab-case`);
				if (seenEvidence.has(id)) issues.push(`${evidenceLabel}.id is duplicated`);
				seenEvidence.add(id);
				const mode = text(row.mode, `${evidenceLabel}.mode`, issues);
				if (!ENGLISH_LITERATURE_MODES.includes(mode)) {
					issues.push(`${evidenceLabel}.mode is unsupported`);
				}
				const sourceId = text(row.sourceId, `${evidenceLabel}.sourceId`, issues);
				const source = sourceById.get(sourceId);
				if (!source) issues.push(`${evidenceLabel}.sourceId is not declared by this topic`);
				const anchor = optionalText(row.anchor, `${evidenceLabel}.anchor`, issues);
				const approvedExcerpt = optionalText(
					row.approvedExcerpt,
					`${evidenceLabel}.approvedExcerpt`,
					issues
				);
				const requiredAnswer = optionalText(
					row.requiredAnswer,
					`${evidenceLabel}.requiredAnswer`,
					issues
				);
				if (['public-domain-text', 'public-domain-anthology-pdf'].includes(source?.retrievalType)) {
					if (!anchor || approvedExcerpt) {
						issues.push(`${evidenceLabel} public-domain evidence requires anchor only`);
					}
					if (mode === 'quotation' && !requiredAnswer) {
						issues.push(`${evidenceLabel} quotation requires an exact requiredAnswer`);
					}
				}
				if (['copyrighted-web-synopsis', 'licensed-web-synopsis'].includes(source?.retrievalType)) {
					if (!approvedExcerpt || anchor || requiredAnswer) {
						issues.push(
							`${evidenceLabel} web synopsis requires approvedExcerpt and forbids anchor/requiredAnswer`
						);
					}
					if (mode !== 'plot') {
						issues.push(`${evidenceLabel} web synopsis may support plot only`);
					}
					if (wordCount(approvedExcerpt ?? '') > 20) {
						issues.push(`${evidenceLabel}.approvedExcerpt exceeds the 20-word source cap`);
					}
				}
				if (source?.retrievalType === 'official-resource-pdf') {
					if (!approvedExcerpt || anchor || requiredAnswer) {
						issues.push(
							`${evidenceLabel} official resource requires approvedExcerpt and forbids anchor/requiredAnswer`
						);
					}
					if (!['plot', 'method'].includes(mode)) {
						issues.push(`${evidenceLabel} official resource may support plot or method only`);
					}
					if (wordCount(approvedExcerpt ?? '') > 20) {
						issues.push(`${evidenceLabel}.approvedExcerpt exceeds the 20-word source cap`);
					}
				}
				return {
					id,
					mode,
					sourceId,
					locator: text(row.locator, `${evidenceLabel}.locator`, issues),
					anchor,
					approvedExcerpt,
					requiredAnswer
				};
			}
		);

		for (const mode of coverageModes(coverage)) {
			const rows = evidence.filter((entry) => entry.mode === mode);
			if (coverage[mode].status === 'ready' && rows.length !== coverage[mode].expectedCardCount) {
				issues.push(
					`${label}.${mode} declares ${coverage[mode].expectedCardCount} card(s), found ${rows.length} evidence row(s)`
				);
			}
			if (coverage[mode].status === 'withheld' && rows.length !== coverage[mode].partialCardCount) {
				issues.push(
					`${label}.${mode} is withheld with ${coverage[mode].partialCardCount} approved partial card(s), found ${rows.length} evidence row(s)`
				);
			}
		}
		if (evidence.length === 0 && sources.length !== 0) {
			issues.push(`${label} has sources but no usable evidence`);
		}
		return { topicComponentId, title, coverage, sources, evidence };
	});

	for (const topicId of catalogTopicIds) {
		if (!seenTopics.has(topicId))
			issues.push(`selectable topic ${topicId} is missing from the plan`);
	}
	for (const topicId of seenTopics) {
		if (!catalogTopicIds.has(topicId))
			issues.push(`planned topic ${topicId} is outside the offering`);
	}
	if (issues.length) throw new EnglishLiteratureSourcePlanError(issues);
	return {
		schemaVersion: ENGLISH_LITERATURE_SOURCE_PLAN_SCHEMA,
		specificationId: plan.specificationId,
		offeringId: plan.offeringId,
		topics
	};
}

/** @param {unknown} input @param {string} topicLabel @param {string[]} issues */
function normalizeCoverage(input, topicLabel, issues) {
	const coverage = record(input, `${topicLabel}.coverage`, issues);
	exactKeys(coverage, `${topicLabel}.coverage`, REQUIRED_MODES, issues, ['method']);
	return Object.fromEntries(
		ENGLISH_LITERATURE_MODES.filter((mode) => mode in coverage).map((mode) => {
			const label = `${topicLabel}.coverage.${mode}`;
			const row = record(coverage[mode], label, issues);
			exactKeys(row, label, ['status', 'expectedCardCount'], issues, [
				'reason',
				'partialCardCount'
			]);
			const status = text(row.status, `${label}.status`, issues);
			if (!STATUS_VALUES.has(status)) issues.push(`${label}.status is unsupported`);
			const expectedCardCount = nonnegativeInteger(
				row.expectedCardCount,
				`${label}.expectedCardCount`,
				issues
			);
			const reason = optionalText(row.reason, `${label}.reason`, issues);
			const partialCardCount = nonnegativeInteger(
				row.partialCardCount ?? 0,
				`${label}.partialCardCount`,
				issues
			);
			if (status === 'ready' && (expectedCardCount < 1 || reason || partialCardCount !== 0)) {
				issues.push(`${label} ready coverage requires cards and no reason`);
			}
			if (status === 'withheld' && (expectedCardCount !== 0 || !reason)) {
				issues.push(`${label} withheld coverage requires zero cards and a reason`);
			}
			return [mode, { status, expectedCardCount, partialCardCount, reason }];
		})
	);
}

/**
 * Prepare bounded evidence windows and immutable hashes from downloaded source
 * snapshots. The returned object deliberately omits full source bodies.
 *
 * @param {ReturnType<typeof validateEnglishLiteratureSourcePlan>} plan
 * @param {Map<string,{body:string,contentType?:string}>|Record<string,{body:string,contentType?:string}>} snapshots
 */
export function prepareEnglishLiteratureEvidence(plan, snapshots) {
	const issues = [];
	const snapshotById = snapshots instanceof Map ? snapshots : new Map(Object.entries(snapshots));
	const topics = plan.topics.map((topic) => {
		const sourceById = new Map();
		for (const source of topic.sources) {
			const snapshot = snapshotById.get(source.id);
			if (!snapshot || typeof snapshot.body !== 'string') {
				issues.push(`${source.id} has no downloaded source snapshot`);
				continue;
			}
			const text = normalizeSourceSnapshot(snapshot.body, {
				contentType: snapshot.contentType,
				html: ['copyrighted-web-synopsis', 'licensed-web-synopsis'].includes(source.retrievalType)
			});
			if (text.length < 40) issues.push(`${source.id} normalized to too little source text`);
			for (const verificationAnchor of source.verificationAnchors) {
				if (!text.includes(normalizeInlineText(verificationAnchor))) {
					issues.push(`${source.id} verification anchor is not verbatim: ${verificationAnchor}`);
				}
			}
			sourceById.set(source.id, {
				...source,
				sourceHash: sha256(text),
				text
			});
		}
		const evidence = topic.evidence.map((row) => {
			const source = sourceById.get(row.sourceId);
			if (!source) return { ...row, excerpt: '', source: null };
			let excerpt = '';
			if (!['public-domain-text', 'public-domain-anthology-pdf'].includes(source.retrievalType)) {
				excerpt = normalizeInlineText(row.approvedExcerpt ?? '');
				if (!source.text.includes(excerpt)) {
					issues.push(`${row.id} approved excerpt is not verbatim in ${source.id}`);
				}
				if (wordCount(excerpt) > 20) {
					issues.push(`${row.id} exceeds the copyrighted-source word cap`);
				}
			} else {
				const anchor = normalizeInlineText(row.anchor ?? '');
				const index = source.text.indexOf(anchor);
				if (index < 0) {
					issues.push(`${row.id} anchor is not verbatim in ${source.id}`);
				} else {
					excerpt = boundedContext(source.text, index, anchor.length, 700);
				}
				if (row.requiredAnswer && !excerpt.includes(normalizeInlineText(row.requiredAnswer))) {
					issues.push(`${row.id} exact quotation answer is absent from its evidence window`);
				}
			}
			return {
				id: row.id,
				mode: row.mode,
				topicComponentId: topic.topicComponentId,
				sourceId: row.sourceId,
				locator: row.locator,
				requiredAnswer: row.requiredAnswer ? normalizeInlineText(row.requiredAnswer) : null,
				excerpt,
				source: source
					? {
							id: source.id,
							kind: source.kind,
							retrievalType: source.retrievalType,
							url: source.url,
							title: source.title,
							rightsBasis: source.rightsBasis,
							sourceHash: source.sourceHash
						}
					: null
			};
		});
		const sources = topic.sources.map((source) => ({
			...source,
			sourceHash: sourceById.get(source.id)?.sourceHash ?? null
		}));
		return { ...topic, sources, evidence };
	});
	if (issues.length) throw new EnglishLiteratureSourcePlanError(issues);
	return {
		schemaVersion: plan.schemaVersion,
		specificationId: plan.specificationId,
		offeringId: plan.offeringId,
		topics
	};
}

/** @param {string} body @param {{contentType?:string,html?:boolean}} options */
export function normalizeSourceSnapshot(body, { contentType = '', html = false } = {}) {
	let value = String(body ?? '').replaceAll(String.fromCodePoint(0), '');
	if (html || /html/i.test(contentType)) {
		value = value
			.replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
			.replace(/<!--([\s\S]*?)-->/g, ' ')
			.replace(/<[^>]+>/g, ' ');
		value = decodeHtmlEntities(value);
	}
	return normalizeInlineText(value);
}

/** @param {string} value */
export function normalizeInlineText(value) {
	return String(value ?? '')
		.normalize('NFC')
		.replace(/\s+/gu, ' ')
		.trim();
}

/** @param {ReturnType<typeof validateEnglishLiteratureSourcePlan>} plan */
export function englishLiteratureCoverageMatrix(plan) {
	return plan.topics.flatMap((topic) =>
		coverageModes(topic.coverage).map((mode) => ({
			offeringId: plan.offeringId,
			topicComponentId: topic.topicComponentId,
			topicTitle: topic.title,
			mode,
			status: topic.coverage[mode].status,
			expectedCardCount: topic.coverage[mode].expectedCardCount,
			partialCardCount: topic.coverage[mode].partialCardCount,
			reason: topic.coverage[mode].reason
		}))
	);
}

/** @param {Record<string,unknown>} coverage */
export function coverageModes(coverage) {
	return ENGLISH_LITERATURE_MODES.filter((mode) => mode in coverage);
}

/**
 * Collapse rights-aware per-mode provenance into the standard topic coverage
 * consumed by D1. A planned-withheld mode may retain lawful partial cards when
 * another mode makes the topic ready and every retained card passed review.
 */
export function buildEnglishLiteraturePostReviewCoverage(sourcePlan, independentlyAccepted) {
	const acceptedByEvidence = new Map(independentlyAccepted.map((card) => [card.evidenceId, card]));
	const modeMatrix = [];
	const standardCoverage = [];
	const acceptedCards = [];
	const unexpectedWithheld = [];
	for (const topic of sourcePlan.topics) {
		const failures = [];
		for (const mode of coverageModes(topic.coverage)) {
			const planned = topic.coverage[mode];
			const evidence = topic.evidence.filter((row) => row.mode === mode);
			const acceptedCount = evidence.filter((row) => acceptedByEvidence.has(row.id)).length;
			if (planned.status === 'withheld') {
				modeMatrix.push({
					offeringId: sourcePlan.offeringId,
					topicComponentId: topic.topicComponentId,
					topicTitle: topic.title,
					mode,
					status: 'withheld',
					cardCount: acceptedCount,
					reason: planned.reason
				});
			} else if (acceptedCount === planned.expectedCardCount) {
				modeMatrix.push({
					offeringId: sourcePlan.offeringId,
					topicComponentId: topic.topicComponentId,
					topicTitle: topic.title,
					mode,
					status: 'ready',
					cardCount: acceptedCount,
					reason: null
				});
			} else {
				const reason = `Only ${acceptedCount} of ${planned.expectedCardCount} ${mode} cards passed independent review.`;
				failures.push(reason);
				modeMatrix.push({
					offeringId: sourcePlan.offeringId,
					topicComponentId: topic.topicComponentId,
					topicTitle: topic.title,
					mode,
					status: 'withheld',
					cardCount: 0,
					reason
				});
			}
		}
		const plannedReady = coverageModes(topic.coverage).some(
			(mode) => topic.coverage[mode].status === 'ready'
		);
		if (failures.length) {
			unexpectedWithheld.push({
				topicComponentId: topic.topicComponentId,
				reasons: failures
			});
			standardCoverage.push({
				offeringId: sourcePlan.offeringId,
				topicComponentId: topic.topicComponentId,
				status: 'withheld',
				cardCount: 0,
				reason: failures.join(' ')
			});
		} else if (plannedReady) {
			const cards = topic.evidence.flatMap((row) => {
				const card = acceptedByEvidence.get(row.id);
				return card ? [card] : [];
			});
			acceptedCards.push(...cards);
			standardCoverage.push({
				offeringId: sourcePlan.offeringId,
				topicComponentId: topic.topicComponentId,
				status: 'ready',
				cardCount: cards.length,
				reason: null
			});
		} else {
			const reasons = coverageModes(topic.coverage).map(
				(mode) => `${mode}: ${topic.coverage[mode].reason}`
			);
			standardCoverage.push({
				offeringId: sourcePlan.offeringId,
				topicComponentId: topic.topicComponentId,
				status: 'withheld',
				cardCount: 0,
				reason: reasons.join(' ')
			});
		}
	}
	return { modeMatrix, standardCoverage, acceptedCards, unexpectedWithheld };
}

/** @param {ReturnType<typeof prepareEnglishLiteratureEvidence>} prepared */
export function sourceManifestValue(prepared) {
	return {
		schemaVersion: prepared.schemaVersion,
		specificationId: prepared.specificationId,
		offeringId: prepared.offeringId,
		topics: prepared.topics.map((topic) => ({
			topicComponentId: topic.topicComponentId,
			title: topic.title,
			coverage: topic.coverage,
			sources: topic.sources,
			evidence: topic.evidence.map((row) => ({
				id: row.id,
				mode: row.mode,
				sourceId: row.sourceId,
				locator: row.locator,
				requiredAnswer: row.requiredAnswer,
				excerpt: row.excerpt
			}))
		}))
	};
}

/** @param {unknown} value */
export function stableJson(value) {
	return JSON.stringify(sortJson(value));
}

/** @param {string|Buffer} value */
export function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function boundedContext(text, index, anchorLength, radius) {
	let start = Math.max(0, index - radius);
	let end = Math.min(text.length, index + anchorLength + radius);
	if (start > 0) {
		const boundary = text.lastIndexOf(' ', start);
		if (boundary >= 0) start = boundary + 1;
	}
	if (end < text.length) {
		const boundary = text.indexOf(' ', end);
		if (boundary >= 0) end = boundary;
	}
	return text.slice(start, end).trim();
}

function decodeHtmlEntities(value) {
	return value
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&quot;/gi, '"')
		.replace(/&apos;|&#39;/gi, "'")
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>');
}

function wordCount(value) {
	return normalizeInlineText(value).split(/\s+/u).filter(Boolean).length;
}

function sortJson(value) {
	if (Array.isArray(value)) return value.map(sortJson);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, sortJson(value[key])])
	);
}

function record(value, label, issues) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		issues.push(`${label} must be an object`);
		return {};
	}
	return value;
}

function array(value, label, issues) {
	if (!Array.isArray(value)) {
		issues.push(`${label} must be an array`);
		return [];
	}
	return value;
}

function text(value, label, issues) {
	if (typeof value !== 'string' || value.trim() === '') {
		issues.push(`${label} must be non-empty text`);
		return '';
	}
	if (value !== value.trim()) issues.push(`${label} must be trimmed`);
	return value.trim();
}

function optionalText(value, label, issues) {
	if (value === undefined || value === null || value === '') return null;
	return text(value, label, issues);
}

function optionalTextArray(value, label, issues) {
	if (value === undefined || value === null) return [];
	const values = array(value, label, issues).map((entry, index) =>
		text(entry, `${label}[${index}]`, issues)
	);
	if (values.length === 0) issues.push(`${label} must not be empty when present`);
	if (new Set(values).size !== values.length) issues.push(`${label} must not contain duplicates`);
	return values;
}

function nonnegativeInteger(value, label, issues) {
	if (!Number.isInteger(value) || value < 0) {
		issues.push(`${label} must be a non-negative integer`);
		return 0;
	}
	return value;
}

function httpsUrl(value, label, issues) {
	const normalized = text(value, label, issues);
	try {
		if (new URL(normalized).protocol !== 'https:') issues.push(`${label} must use HTTPS`);
	} catch {
		issues.push(`${label} must be an absolute URL`);
	}
	return normalized;
}

function exactKeys(value, label, required, issues, optional = []) {
	for (const key of required) {
		if (!(key in value)) issues.push(`${label}.${key} is required`);
	}
	const allowed = new Set([...required, ...optional]);
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) issues.push(`${label}.${key} is not allowed`);
	}
}
