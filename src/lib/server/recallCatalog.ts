import { isScienceLearnerSubject } from '$lib/learning/subjects';
import {
	recallCards as curatedRecallCards,
	recallCurriculumTopics,
	recallKindLabels,
	type RecallCard,
	type RecallCardDefinition,
	type RecallCardKind,
	type RecallRuntimeSubject,
	type RecallSubject
} from '$lib/recall/aqaScienceRecall';
import { isApprovedRecallVisualCueForSubject } from '$lib/recall/visualCues.js';
import { queryRows } from './db';
import { studyCardRuntimeCatalogQuery } from './studyCardCatalogQuery';

type StudyCardCatalogRow = {
	id: string;
	release_id: string;
	concept_key: string;
	board: 'AQA' | 'OCR';
	qualification: 'GCSE';
	subject: RecallRuntimeSubject;
	kind: RecallCardKind;
	emoji: string;
	front: string;
	back: string;
	reverse_front: string | null;
	reverse_back: string | null;
	explanation: string;
	memory_tip: string | null;
	content_revision: number;
	content_hash: string;
	offering_id: string;
	curriculum_component_id: string;
	topic_component_id: string;
	target_code: string;
	topic_code: string;
	topic_title: string;
	topic_paper: string | null;
	source_kind: string | null;
	source_url: string | null;
	source_title: string | null;
	source_locator: string | null;
	rights_basis: string | null;
	choices_json: string;
};

type RecallCatalogRow = {
	card_id: string;
	concept_key: string;
	board: 'AQA' | 'OCR';
	subject: RecallRuntimeSubject;
	kind: RecallCardKind;
	visual_cue: string;
	front: string;
	back: string;
	reverse_front: string | null;
	reverse_back: string | null;
	explanation: string;
	memory_tip: string | null;
	content_revision: number;
	content_hash: string;
	generation_prompt_version?: string;
	provenance_json: string;
	choice_key: string;
	choice_text: string;
	choice_order: number;
	is_correct: number;
	choice_feedback: string;
	choice_misconception: string | null;
	offering_id: string;
	curriculum_component_id: string;
	topic_component_id: string;
	target_code: string;
	topic_code: string;
	topic_title: string;
	topic_paper: string | null;
	source_url: string;
	source_title: string;
	source_kind?: string;
	source_locator?: string;
	rights_basis?: string;
	catalog_source?: 'standard-study-card';
};

type StudyCardChoice = {
	key: string;
	text: string;
	isCorrect: boolean;
	feedback: string;
	misconception: string | null;
};

export const SUPPORTED_RECALL_BUNDLE_SCHEMA_VERSION = 'recall-card-bundle-v2';
export const SUPPORTED_RECALL_PROMPT_VERSION = 'recall-card-compiler-v10';
export const SUPPORTED_RECALL_MEMORY_TIP_ENRICHMENT_SCHEMA_VERSION =
	'recall-memory-tip-enrichment-v1';
export const SUPPORTED_RECALL_MEMORY_TIP_ENRICHMENT_PROMPT_VERSION =
	'recall-memory-tip-enricher-v1';
export const IMPORTABLE_RECALL_PROMPT_VERSIONS = [
	'recall-card-compiler-v5',
	'recall-card-compiler-v6',
	'recall-card-compiler-v7',
	'recall-card-compiler-v8',
	'recall-card-compiler-v9',
	SUPPORTED_RECALL_PROMPT_VERSION
] as const;
export const RECALL_CATALOG_CACHE_TTL_MS = 30_000;

const runtimeCatalogBySubject = Object.freeze({
	Biology: {
		board: 'AQA',
		offeringId: 'aqa-gcse-biology-8461-v1.0:higher'
	},
	Chemistry: {
		board: 'AQA',
		offeringId: 'aqa-gcse-chemistry-8462-v1.1:higher'
	},
	Physics: {
		board: 'AQA',
		offeringId: 'aqa-gcse-physics-8463-v1.1:higher'
	},
	'Computer Science': {
		board: 'AQA',
		offeringId: 'aqa-gcse-computer-science-8525-v1.3-2027:higher'
	},
	Geography: {
		board: 'AQA',
		offeringId: 'aqa-gcse-geography-8035-v1.1:higher'
	},
	History: {
		board: 'AQA',
		offeringId: 'aqa-gcse-history-8145-v1.3:higher'
	},
	'English Language': {
		board: 'OCR',
		offeringId: 'ocr-gcse-english-language-j351-v2.0:higher'
	},
	'English Literature': {
		board: 'OCR',
		offeringId: 'ocr-gcse-english-literature-j352-v3.0:higher'
	}
} satisfies Record<RecallRuntimeSubject, { board: 'AQA' | 'OCR'; offeringId: string }>);

const staticSeparateHigherOffering = Object.freeze({
	Biology: {
		offeringId: 'aqa-gcse-biology-8461-v1.0:higher',
		specificationId: 'aqa-gcse-biology-8461-v1.0'
	},
	Chemistry: {
		offeringId: 'aqa-gcse-chemistry-8462-v1.1:higher',
		specificationId: 'aqa-gcse-chemistry-8462-v1.1'
	},
	Physics: {
		offeringId: 'aqa-gcse-physics-8463-v1.1:higher',
		specificationId: 'aqa-gcse-physics-8463-v1.1'
	}
} satisfies Record<RecallSubject, { offeringId: string; specificationId: string }>);

export const STATIC_RECALL_CATALOG_VERSION = 'aqa-separate-science-higher-v2';

const catalogSql = `WITH imported_memory_tip_enrichments AS (
  SELECT enrichment.*
  FROM recall_card_memory_tip_enrichments enrichment
  JOIN recall_memory_tip_enrichment_runs enrichment_run
    ON enrichment_run.id = enrichment.enrichment_run_id
  WHERE enrichment.status = 'published'
    AND enrichment.needs_human_review = 0
    AND enrichment.import_owner = 'recall-memory-tip-enrichment-import/v1'
    AND enrichment_run.status = 'imported'
    AND enrichment_run.import_owner = 'recall-memory-tip-enrichment-import/v1'
    AND enrichment_run.schema_version = ?
    AND enrichment_run.prompt_version = ?
    AND enrichment_run.artifact_path =
      'data/recall/enrichments/' || enrichment_run.id || '/accepted-enrichments.json'
)
SELECT c.id AS card_id,
       c.concept_key,
       'AQA' AS board,
       c.subject,
       c.kind,
       c.visual_cue,
       c.front,
       c.back,
       c.reverse_front,
       c.reverse_back,
       c.explanation,
       COALESCE(memory_tip_enrichment.memory_tip, c.memory_tip) AS memory_tip,
       COALESCE(
         memory_tip_enrichment.effective_content_revision,
         c.content_revision
       ) AS content_revision,
       COALESCE(memory_tip_enrichment.effective_content_hash, c.content_hash) AS content_hash,
       generation_run.prompt_version AS generation_prompt_version,
       c.provenance_json,
       ch.choice_key,
       ch.text AS choice_text,
       ch.display_order AS choice_order,
       ch.is_correct,
       ch.feedback AS choice_feedback,
       ch.misconception AS choice_misconception,
       target.offering_id,
       target.curriculum_component_id,
       target.topic_component_id,
       target_component.code AS target_code,
       topic_component.code AS topic_code,
       topic_component.title AS topic_title,
       NULL AS topic_paper,
       specification.landing_url AS source_url,
       specification.title AS source_title
FROM recall_cards c
JOIN recall_generation_runs generation_run
  ON generation_run.id = c.generation_run_id
LEFT JOIN imported_memory_tip_enrichments memory_tip_enrichment
  ON memory_tip_enrichment.card_id = c.id
 AND NULLIF(trim(c.memory_tip), '') IS NULL
 AND memory_tip_enrichment.base_generation_run_id = c.generation_run_id
 AND memory_tip_enrichment.base_content_revision = c.content_revision
 AND memory_tip_enrichment.base_content_hash = c.content_hash
 AND memory_tip_enrichment.base_source_fingerprint = c.source_fingerprint
 AND memory_tip_enrichment.base_artifact_hash = generation_run.artifact_hash
 AND memory_tip_enrichment.base_artifact_path = generation_run.artifact_path
 AND memory_tip_enrichment.effective_hash_version =
     'recall-memory-tip-effective-content-v1'
JOIN recall_card_choices ch
  ON ch.card_id = c.id
JOIN recall_card_curriculum_targets target
  ON target.card_id = c.id
 AND target.reviewed = 1
JOIN curriculum_offerings offering
  ON offering.id = target.offering_id
JOIN curriculum_components target_component
  ON target_component.id = target.curriculum_component_id
 AND target_component.specification_id = offering.specification_id
JOIN curriculum_components topic_component
  ON topic_component.id = target.topic_component_id
 AND topic_component.specification_id = offering.specification_id
JOIN curriculum_specifications specification
  ON specification.id = offering.specification_id
WHERE c.status = 'published'
  AND c.needs_human_review = 0
  AND c.import_owner = 'recall-card-import/v1'
  AND generation_run.status = 'imported'
  AND generation_run.import_owner = 'recall-card-import/v1'
  AND generation_run.schema_version = ?
  AND generation_run.prompt_version IN (${IMPORTABLE_RECALL_PROMPT_VERSIONS.map(() => '?').join(', ')})
  AND c.source_fingerprint = generation_run.source_fingerprint
  AND generation_run.artifact_path =
      'data/recall/generated/' || generation_run.id || '/accepted-cards.json'
  AND c.subject = ?
  AND target.offering_id = ?
ORDER BY c.subject, c.id, ch.display_order`;

export type RecallCatalogScope = {
	subject: RecallRuntimeSubject;
	offeringId: string;
	topicComponentId?: string | null;
};

export function recallBoardForSubject(subject: RecallRuntimeSubject): 'AQA' | 'OCR' {
	return runtimeCatalogBySubject[subject].board;
}

export function defaultRecallCatalogScope(subject: RecallRuntimeSubject): RecallCatalogScope {
	return {
		subject,
		offeringId: runtimeCatalogBySubject[subject].offeringId
	};
}

type CatalogCacheEntry = { expiresAt: number; promise: Promise<RecallCard[]> };

const catalogCache = new Map<string, CatalogCacheEntry>();
const canonicalChoiceKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const canonicalContentHashPattern = /^[a-f0-9]{64}$/;
const runtimeCardKinds = new Set<RecallCardKind>(Object.keys(recallKindLabels) as RecallCardKind[]);

function isCanonicalChoiceKey(value: string): boolean {
	return value.length <= 80 && canonicalChoiceKeyPattern.test(value);
}

function isValidMemoryTip(value: string | null, maximumLength: number): boolean {
	if (value === null || value.trim() === '') return true;
	return (
		value === value.trim() &&
		value.length >= 8 &&
		value.length <= maximumLength &&
		!/[\u0000-\u001f\u007f]/.test(value)
	);
}

function normalized(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function topicIdFor(row: RecallCatalogRow): string | null {
	if (row.catalog_source === 'standard-study-card') {
		return row.topic_component_id.trim() || null;
	}
	return (
		recallCurriculumTopics.find(
			(topic) =>
				topic.subject === row.subject && normalized(topic.title) === normalized(row.topic_title)
		)?.id ??
		recallCurriculumTopics.find(
			(topic) => topic.subject === row.subject && topic.specRef === row.topic_code
		)?.id ??
		null
	);
}

function parseProvenance(value: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function learnerSourceKind(value: string | undefined): RecallCardDefinition['sourceKind'] {
	if (value === 'primary-text') return 'primary_text';
	if (value === 'secondary-source') return 'licensed_summary';
	if (value === 'original-synthesis') return 'original_synthesis';
	if (value === 'curriculum-specification' || value === 'official-web-page') {
		return 'official_specification';
	}
	return 'official_exam_material';
}

function hydrateCatalogRows(rows: RecallCatalogRow[]): RecallCard[] {
	const grouped = new Map<string, RecallCatalogRow[]>();
	for (const row of rows) {
		const existing = grouped.get(row.card_id);
		if (existing) existing.push(row);
		else grouped.set(row.card_id, [row]);
	}

	const cards: RecallCard[] = [];
	for (const cardRows of grouped.values()) {
		const row = cardRows[0];
		const topicId = topicIdFor(row);
		const orderedChoices = [...cardRows].sort((a, b) => a.choice_order - b.choice_order);
		const correctChoices = orderedChoices.filter((choice) => choice.is_correct === 1);
		const normalizedChoices = new Set(
			orderedChoices.map((choice) => normalized(choice.choice_text))
		);
		const choiceKeySet = new Set(orderedChoices.map((choice) => choice.choice_key));
		const permitsVariableChoiceCount =
			row.catalog_source === 'standard-study-card' ||
			row.generation_prompt_version === SUPPORTED_RECALL_PROMPT_VERSION;
		const validChoiceCount = permitsVariableChoiceCount
			? orderedChoices.length === 3 || orderedChoices.length === 4
			: orderedChoices.length === 4;
		const expectedBoard = runtimeCatalogBySubject[row.subject]?.board;
		const rowBoard =
			row.catalog_source === 'standard-study-card' ? row.board : (row.board ?? 'AQA');
		const staticTopic = recallCurriculumTopics.find((topic) => topic.id === topicId);
		if (
			!topicId ||
			!expectedBoard ||
			rowBoard !== expectedBoard ||
			!runtimeCardKinds.has(row.kind) ||
			!row.front?.trim() ||
			!row.back?.trim() ||
			!row.explanation?.trim() ||
			!row.offering_id?.trim() ||
			!row.curriculum_component_id?.trim() ||
			!row.topic_component_id?.trim() ||
			!row.target_code?.trim() ||
			!row.topic_title?.trim() ||
			!/^https:\/\//.test(row.source_url) ||
			!row.source_title?.trim() ||
			!isApprovedRecallVisualCueForSubject(row.visual_cue, row.subject) ||
			!isValidMemoryTip(row.memory_tip, row.catalog_source ? 240 : 180) ||
			!Number.isInteger(row.content_revision) ||
			row.content_revision < 1 ||
			!canonicalContentHashPattern.test(row.content_hash) ||
			!validChoiceCount ||
			orderedChoices.some((choice, index) => choice.choice_order !== index) ||
			correctChoices.length !== 1 ||
			correctChoices[0]?.choice_text.trim() !== row.back.trim() ||
			normalizedChoices.size !== orderedChoices.length ||
			choiceKeySet.size !== orderedChoices.length ||
			orderedChoices.some(
				(choice) => !isCanonicalChoiceKey(choice.choice_key) || !choice.choice_feedback.trim()
			) ||
			orderedChoices.some((choice) =>
				choice.is_correct === 1
					? Boolean(choice.choice_misconception?.trim())
					: !choice.choice_misconception?.trim()
			)
		) {
			continue;
		}

		const choiceKeys = Object.fromEntries(
			orderedChoices.map((choice) => [choice.choice_text, choice.choice_key])
		);
		const choiceFeedback = Object.fromEntries(
			orderedChoices.map((choice) => [choice.choice_text, choice.choice_feedback])
		);
		const choiceMisconceptions = Object.fromEntries(
			orderedChoices.flatMap((choice) =>
				choice.choice_misconception?.trim()
					? [[choice.choice_text, choice.choice_misconception.trim()]]
					: []
			)
		);
		const provenance = parseProvenance(row.provenance_json);

		cards.push({
			id: row.card_id,
			board: rowBoard,
			qualification: 'GCSE',
			subject: row.subject,
			topicId,
			topicTitle: row.topic_title,
			topicPaper: row.topic_paper?.trim() || staticTopic?.paper || 'GCSE',
			specRef: row.target_code,
			kind: row.kind,
			visualCue: row.visual_cue,
			front: row.front,
			back: row.back,
			reverseFront: row.reverse_front?.trim() || undefined,
			reverseBack: row.reverse_back?.trim() || undefined,
			distractors: orderedChoices
				.filter((choice) => choice.is_correct !== 1)
				.map((choice) => choice.choice_text),
			explanation: row.explanation,
			memoryTip: row.memory_tip?.trim() || undefined,
			choiceFeedback,
			choiceMisconceptions,
			choiceKeys,
			offeringId: row.offering_id,
			curriculumComponentId: row.curriculum_component_id,
			topicComponentId: row.topic_component_id,
			contentRevision: row.content_revision,
			contentHash: row.content_hash,
			sourceUrl: row.source_url,
			sourceTitle:
				typeof provenance.sourceTitle === 'string' && provenance.sourceTitle.trim()
					? provenance.sourceTitle.trim()
					: row.source_title,
			sourceKind: learnerSourceKind(row.source_kind ?? 'curriculum-specification'),
			sourceLocator: row.source_locator?.trim() || undefined,
			rightsBasis: row.rights_basis?.trim() || undefined
		});
	}
	return cards;
}

function parseStudyCardChoices(value: unknown): StudyCardChoice[] | null {
	if (typeof value !== 'string') return null;
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!Array.isArray(parsed) || (parsed.length !== 3 && parsed.length !== 4)) return null;
		const choices: StudyCardChoice[] = [];
		for (const candidate of parsed) {
			if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
			const row = candidate as Record<string, unknown>;
			if (
				typeof row.key !== 'string' ||
				typeof row.text !== 'string' ||
				typeof row.isCorrect !== 'boolean' ||
				typeof row.feedback !== 'string' ||
				!(row.misconception === null || typeof row.misconception === 'string')
			) {
				return null;
			}
			choices.push({
				key: row.key,
				text: row.text,
				isCorrect: row.isCorrect,
				feedback: row.feedback,
				misconception: row.misconception
			});
		}
		return choices;
	} catch {
		return null;
	}
}

function studyRowsAsRecallRows(rows: StudyCardCatalogRow[]): RecallCatalogRow[] {
	return rows.flatMap((row) => {
		const choices = parseStudyCardChoices(row?.choices_json);
		const sourceUrl = row?.source_url;
		const sourceTitle = row?.source_title;
		if (
			!choices ||
			(row.board !== 'AQA' && row.board !== 'OCR') ||
			row.qualification !== 'GCSE' ||
			!runtimeCatalogBySubject[row.subject] ||
			!runtimeCardKinds.has(row.kind) ||
			typeof sourceUrl !== 'string' ||
			typeof sourceTitle !== 'string'
		) {
			return [];
		}
		return choices.map((choice, choiceOrder) => ({
			card_id: row.id,
			concept_key: row.concept_key,
			board: row.board,
			subject: row.subject,
			kind: row.kind,
			visual_cue: row.emoji,
			front: row.front,
			back: row.back,
			reverse_front: row.reverse_front,
			reverse_back: row.reverse_back,
			explanation: row.explanation,
			memory_tip: row.memory_tip,
			content_revision: row.content_revision,
			content_hash: row.content_hash,
			provenance_json: '{}',
			choice_key: choice.key,
			choice_text: choice.text,
			choice_order: choiceOrder,
			is_correct: choice.isCorrect ? 1 : 0,
			choice_feedback: choice.feedback,
			choice_misconception: choice.misconception,
			offering_id: row.offering_id,
			curriculum_component_id: row.curriculum_component_id,
			topic_component_id: row.topic_component_id,
			target_code: row.target_code,
			topic_code: row.topic_code,
			topic_title: row.topic_title,
			topic_paper: row.topic_paper,
			source_url: sourceUrl,
			source_title: sourceTitle,
			source_kind: row.source_kind ?? undefined,
			source_locator: row.source_locator ?? undefined,
			rights_basis: row.rights_basis ?? undefined,
			catalog_source: 'standard-study-card' as const
		}));
	});
}

function missingStandardCatalogTable(cause: unknown): boolean {
	const message = cause instanceof Error ? cause.message : String(cause);
	return /no such table:\s*study_(?:card_releases|cards|card_choices|card_sources|card_targets|deck_coverage)/i.test(
		message
	);
}

function missingLegacyCatalogTable(cause: unknown): boolean {
	const message = cause instanceof Error ? cause.message : String(cause);
	return /no such table:\s*recall_(?:generation_runs|cards|card_choices|card_curriculum_targets|memory_tip_enrichment_runs|card_memory_tip_enrichments)/i.test(
		message
	);
}

async function readStandardStudyCards(scope: RecallCatalogScope): Promise<RecallCard[]> {
	try {
		const rows = await queryRows<StudyCardCatalogRow>(studyCardRuntimeCatalogQuery, [
			recallBoardForSubject(scope.subject),
			scope.subject,
			scope.offeringId,
			scope.topicComponentId?.trim() || null
		]);
		return Array.isArray(rows) ? hydrateCatalogRows(studyRowsAsRecallRows(rows)) : [];
	} catch (cause) {
		if (missingStandardCatalogTable(cause)) return [];
		throw cause;
	}
}

async function readGeneratedRecallCards(scope: RecallCatalogScope): Promise<RecallCard[]> {
	if (!isScienceLearnerSubject(scope.subject)) return [];
	try {
		const rows = await queryRows<RecallCatalogRow>(catalogSql, [
			SUPPORTED_RECALL_MEMORY_TIP_ENRICHMENT_SCHEMA_VERSION,
			SUPPORTED_RECALL_MEMORY_TIP_ENRICHMENT_PROMPT_VERSION,
			SUPPORTED_RECALL_BUNDLE_SCHEMA_VERSION,
			...IMPORTABLE_RECALL_PROMPT_VERSIONS,
			scope.subject,
			scope.offeringId
		]);
		const cards = Array.isArray(rows) ? hydrateCatalogRows(rows) : [];
		return scope.topicComponentId
			? cards.filter((card) => card.topicComponentId === scope.topicComponentId)
			: cards;
	} catch (cause) {
		// A fresh local database may not have applied 0018/0020 yet. Production and
		// configured local D1 environments must surface every other failure.
		if (missingLegacyCatalogTable(cause)) return [];
		throw cause;
	}
}

async function sha256(value: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function staticCardContent(card: RecallCardDefinition): string {
	return JSON.stringify({
		version: STATIC_RECALL_CATALOG_VERSION,
		id: card.id,
		topicId: card.topicId,
		specRef: card.specRef,
		kind: card.kind,
		visualCue: card.visualCue,
		front: card.front,
		back: card.back,
		reverseFront: card.reverseFront ?? null,
		reverseBack: card.reverseBack ?? null,
		distractors: card.distractors ?? [],
		explanation: card.explanation ?? null,
		memoryTip: card.memoryTip ?? null,
		choiceFeedback: card.choiceFeedback ?? {},
		choiceMisconceptions: card.choiceMisconceptions ?? {},
		sourceUrl: card.sourceUrl,
		sourceTitle: card.sourceTitle
	});
}

function curriculumComponentId(specificationId: string, specRef: string): string {
	return `${specificationId}:${specRef.replaceAll('.', '-')}`;
}

async function staticFallbackCards(scope: RecallCatalogScope): Promise<RecallCard[]> {
	if (!isScienceLearnerSubject(scope.subject)) return [];
	const fallback = staticSeparateHigherOffering[scope.subject];
	if (scope.offeringId !== fallback.offeringId) return [];
	const definitions = curatedRecallCards.filter((card) => card.subject === scope.subject);
	const hydrated = await Promise.all(
		definitions.map(async (card) => {
			const topic = recallCurriculumTopics.find(
				(entry) => entry.subject === card.subject && entry.id === card.topicId
			);
			if (!topic) throw new Error(`Static recall card ${card.id} has no curriculum topic.`);
			const choiceKeys = Object.fromEntries([
				[card.back, 'correct'],
				...(card.distractors ?? []).map(
					(choice, index) => [choice, `distractor-${index + 1}`] as const
				)
			]);
			return {
				...card,
				topicTitle: topic.title,
				topicPaper: topic.paper,
				choiceKeys,
				offeringId: fallback.offeringId,
				curriculumComponentId: curriculumComponentId(fallback.specificationId, card.specRef),
				topicComponentId: curriculumComponentId(fallback.specificationId, topic.specRef),
				contentRevision: 1,
				contentHash: await sha256(staticCardContent(card))
			} satisfies RecallCard;
		})
	);
	return scope.topicComponentId
		? hydrated.filter((card) => card.topicComponentId === scope.topicComponentId)
		: hydrated;
}

function mergePublishedRecallCards(catalogs: readonly (readonly RecallCard[])[]): RecallCard[] {
	const seenIds = new Set<string>();
	const seenContent = new Set<string>();
	const merged: RecallCard[] = [];
	for (const card of catalogs.flat()) {
		const contentKey = `${normalized(card.front)}\u0000${normalized(card.back)}`;
		if (seenIds.has(card.id) || seenContent.has(contentKey)) continue;
		seenIds.add(card.id);
		seenContent.add(contentKey);
		merged.push(card);
	}
	return merged;
}

export async function getRecallCards(scope?: RecallCatalogScope): Promise<RecallCard[]> {
	if (!scope) return [];
	const key = `${scope.subject}|${scope.offeringId}|${scope.topicComponentId?.trim() || '*'}`;
	const now = Date.now();
	const current = catalogCache.get(key);
	if (current && current.expiresAt > now) return await current.promise;

	const promise = (async () => {
		const [standard, generated, fallback] = await Promise.all([
			readStandardStudyCards(scope),
			readGeneratedRecallCards(scope),
			staticFallbackCards(scope)
		]);
		// Standard releases are the cross-subject runtime catalog. Legacy reviewed
		// science cards and the exact Separate-Higher static bank remain overlays,
		// with earlier sources winning only exact identity/content collisions.
		return mergePublishedRecallCards([standard, generated, fallback]);
	})();
	const entry = { expiresAt: now + RECALL_CATALOG_CACHE_TTL_MS, promise };
	catalogCache.set(key, entry);
	try {
		return await promise;
	} catch (cause) {
		if (catalogCache.get(key) === entry) catalogCache.delete(key);
		throw cause;
	}
}

export async function getRecallCardById(
	cardId: string,
	scope: RecallCatalogScope
): Promise<RecallCard | null> {
	return (await getRecallCards(scope)).find((card) => card.id === cardId) ?? null;
}

export function recallReviewMatchesCard(
	card: RecallCard,
	review: { content_revision: number | null; content_hash: string | null }
): boolean {
	return (
		review.content_hash === card.contentHash && review.content_revision === card.contentRevision
	);
}

export function recallEvidenceComponentId(card: RecallCard): string {
	return `${card.id}@${card.contentRevision}:${card.contentHash}`;
}

export function clearRecallCatalogCacheForTests(): void {
	catalogCache.clear();
}

export const recallCatalogQueryForTests = catalogSql;
