import { getRequestEvent } from '$app/server';
import type { ChainIllustration } from '$lib/chains/chainIllustration';
import type { PaperMeasurement } from '$lib/experiments/questions/types';
import { englishPracticeEligibility } from '$lib/englishPracticeEligibility';
import { supportsLearnerPracticeInput } from '$lib/learning/practiceEligibility';
import { cleanLearnerQuestionText } from '$lib/learning/questionTextQuality.js';
import { questionAssetPublicPath } from '$lib/questionAssetPath';
import {
	QUESTION_PRACTICE_PAGE_CACHE_KIND,
	QUESTION_PRACTICE_PAGE_CACHE_VERSION
} from '$lib/questionPracticeCache.js';
import { storedQuestionTitle, storedQuestionTitleIssues } from '$lib/storedQuestionTitle.js';
import {
	getVersionedPublicRoutePayload,
	putPublicRoutePayload
} from '$lib/server/publicRoutePayloads';
import { getPublishedChainIllustration } from './chainIllustrations';
import { queryFirst, queryRows } from './db';

export type TransferDistance = 'start' | 'near' | 'stretch' | 'exam-transfer' | 'unclassified';

export type ExamMeta = {
	qualification: string;
	board: string;
	subject: string;
	subjectArea?: string;
	tier: string;
	paper: string;
	topic: string;
	questionType: string;
	marks: number;
};

export type ChainStep = {
	id: string;
	short: string;
	label: string;
	role:
		| 'given'
		| 'cause'
		| 'process'
		| 'link'
		| 'effect'
		| 'evidence'
		| 'method'
		| 'calculation'
		| 'conclusion';
	explanation: string;
	markEvidence: string;
	commonOmission: string;
};

export type MarkChecklistItem = {
	id: string;
	text: string;
	stepId: string;
};

export type RepairChainNode = {
	id: string;
	label: string;
	stepId: string | null;
	icon: 'target' | 'droplet' | 'oxygen' | 'atom' | 'zap';
};

export type QuestionAsset = {
	id: string;
	assetType: string;
	sourceLabel: string;
	publicPath: string;
	altText: string;
	required: boolean;
	role: string | null;
	paperWidthPx: number | null;
	paperHeightPx: number | null;
	paperMeasurement: PaperMeasurement | null;
};

export type QuestionRenderingOverlay = {
	id: string;
	version: string;
	provenance: string;
	confidence: number | null;
	needsHumanReview: boolean;
	stemBlocks: Array<Record<string, unknown>>;
	promptBlocks: Array<Record<string, unknown>>;
	responseInteraction: Record<string, unknown>;
	afterResponseBlocks: Array<Record<string, unknown>>;
	assets: Array<Record<string, unknown>>;
	layout: Record<string, unknown>;
	metadata: Record<string, unknown>;
};

export type Question = {
	id: string;
	sourceRef: string;
	title: string;
	prompt: string;
	context: string;
	assets: QuestionAsset[];
	renderingOverlay: QuestionRenderingOverlay | null;
	answerFormat?: string | null;
	practiceAvailable: boolean;
	practiceUnavailableReason?: string | null;
	meta: ExamMeta;
	transferDistance: TransferDistance;
	distanceLabel: string;
	constellationRole: string;
	modelAnswer: string;
	commonWeakAnswer: string;
	commonWeakExplanation: string;
	weakAnswerMissingStepIds: string[];
	checklist: MarkChecklistItem[];
	checklistSource?: 'official' | 'method';
	repairChain: RepairChainNode[];
	practiceDraft: string;
	whyThisFits: string;
};

export type AnswerChain = {
	id: string;
	title: string;
	canonicalText: string;
	concreteText: string;
	pageTitle: string;
	summary: string;
	steps: ChainStep[];
	commonMissingLink: string;
	modelAnswer: string;
	illustration: ChainIllustration | null;
};

export type Constellation = {
	id: string;
	title: string;
	summary: string;
	chainId: string;
	questionIds: string[];
};

export type QuestionPageData = {
	chain: AnswerChain;
	startQuestion: Question;
	questions: Question[];
	constellation: Constellation;
	question: Question;
	practiceQuestion: Question;
};

export type PracticePageData = {
	question: Question;
	chain: AnswerChain;
	constellation: Constellation;
	questions: Question[];
	nextQuestion: Question;
};

type EnglishPracticeCriterion = {
	id: string;
	title: string;
	detail: string;
	marks: number;
	found: string;
	missing: string;
	keywords: string[];
};

export type EnglishLiteratureTaskKind =
	| 'poetry-comparison'
	| 'extract-comparison'
	| 'extract-and-wider'
	| 'whole-text-judgement'
	| 'single-text-analysis'
	| 'other';

type QuestionRow = {
	id: string;
	source_question_ref: string;
	prompt_text: string;
	self_contained_prompt_text: string | null;
	context_text: string | null;
	command_word: string | null;
	marks: number | null;
	answer_format: string | null;
	board: string | null;
	qualification: string | null;
	subject: string | null;
	subject_area: string | null;
	tier: string | null;
	paper: string | null;
	topic_path_json: string;
	self_containment_json: string;
	metadata_json: string;
};

type ChainRow = {
	id: string;
	title: string;
	canonical_chain_text: string;
	summary: string | null;
	subject_area: string | null;
	broad_topic: string | null;
	metadata_json: string;
};

type ChainStepRow = {
	id: string;
	display_order: number;
	step_text: string;
	step_role: ChainStep['role'];
	explanation: string | null;
	common_omission: string | null;
	evidence_json: string;
};

type MembershipRow = {
	answer_chain_id: string;
	transfer_distance: string;
	display_order: number | null;
	fit_confidence: number | null;
	fit_notes: string | null;
	needs_human_review: number;
};

type AssetRow = {
	id: string;
	question_id?: string;
	asset_type: string;
	source_label: string | null;
	public_path: string | null;
	r2_key: string | null;
	alt_text: string | null;
	required: number;
	role: string | null;
	metadata_json: string;
};

type RenderingOverlayRow = {
	id: string;
	question_id?: string;
	overlay_version: string;
	provenance: string;
	confidence: number | null;
	needs_human_review: number;
	render_json: string;
};

type AssetMetadata = {
	image_candidates?: Array<{
		width?: number;
		height?: number;
		x_ppi?: number;
		y_ppi?: number;
	}>;
	paper_measurement?: {
		axis?: string;
		pixel_width?: number;
		pixels_per_millimetre?: number;
		instructions?: string;
		source_verified?: boolean;
	};
};

type ChecklistRow = {
	id: string;
	question_id?: string;
	text: string;
	display_order: number;
};

type ModelAnswerRow = {
	question_id?: string;
	answer_text: string;
};

type WeakAnswerRow = {
	question_id?: string;
	weak_answer_text: string;
	explanation: string | null;
	missing_chain_step_ids_json: string;
};

type ConstellationRow = {
	id: string;
	title: string;
	summary: string | null;
	answer_chain_id: string;
};

type QuestionChainSeedRow = QuestionRow &
	MembershipRow & {
		chain_id: string;
		chain_title: string;
		chain_canonical_chain_text: string;
		chain_summary: string | null;
		chain_subject_area: string | null;
		chain_broad_topic: string | null;
		chain_metadata_json: string;
	};

type QuestionChainSeed = {
	row: QuestionRow;
	membership: MembershipRow;
	chainRow: ChainRow;
};

type QuestionSupplement = {
	assets: QuestionAsset[];
	renderingOverlay: QuestionRenderingOverlay | null;
	checklistRows: ChecklistRow[];
	modelAnswerRow: ModelAnswerRow | null;
	weakAnswerRow: WeakAnswerRow | null;
};

type QuestionChainContext = {
	row: QuestionRow;
	membership: MembershipRow;
	chain: AnswerChain;
	question: Question;
	questions: Question[];
	constellation: Constellation;
	nextQuestion: Question;
};

function questionPracticeRoutePayloadId(questionId: string): string {
	return `${QUESTION_PRACTICE_PAGE_CACHE_KIND}:${QUESTION_PRACTICE_PAGE_CACHE_VERSION}:${questionId}`;
}

function questionPracticeRoutePath(questionId: string): string {
	return `/questions/${encodeURIComponent(questionId)}/practice`;
}

function looksLikePracticePageData(value: unknown): value is PracticePageData {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as PracticePageData;
	const illustration = candidate.chain?.illustration;
	const hasCompleteIllustrationPair =
		!illustration || Boolean(illustration.src && illustration.lightSrc);
	const hasSafeQuestionTitles =
		Boolean(candidate.question && hasSafeQuestionCardTitle(candidate.question)) &&
		Array.isArray(candidate.questions) &&
		candidate.questions.every(hasSafeQuestionCardTitle);
	return Boolean(
		candidate.question?.id &&
		candidate.chain?.id &&
		candidate.constellation?.id &&
		hasCompleteIllustrationPair &&
		hasSafeQuestionTitles
	);
}

async function getCachedPracticePageData(questionId: string): Promise<PracticePageData | null> {
	const cached = await getVersionedPublicRoutePayload<unknown>(
		questionPracticeRoutePayloadId(questionId),
		QUESTION_PRACTICE_PAGE_CACHE_VERSION
	);
	return looksLikePracticePageData(cached) ? cached : null;
}

async function putCachedPracticePageData(
	lookupQuestionId: string,
	data: PracticePageData
): Promise<void> {
	const lookupIds = uniqueQuestionIds([lookupQuestionId, data.question.id]);
	await Promise.all(
		lookupIds.map((questionId) =>
			putPublicRoutePayload({
				id: questionPracticeRoutePayloadId(questionId),
				routeKind: QUESTION_PRACTICE_PAGE_CACHE_KIND,
				routePath: questionPracticeRoutePath(questionId),
				payload: data,
				sourceVersion: QUESTION_PRACTICE_PAGE_CACHE_VERSION
			})
		)
	);
}

function schedulePracticePageCacheWrite(questionId: string, data: PracticePageData): void {
	const write = putCachedPracticePageData(questionId, data).catch((error) => {
		console.warn('[practice-page-cache] failed to write public payload', {
			error,
			questionId,
			canonicalQuestionId: data.question.id
		});
	});

	try {
		const ctx = getRequestEvent().platform?.ctx;
		if (ctx) {
			ctx.waitUntil(write);
		}
	} catch {
		// Outside a request event, let the cache write run without blocking callers.
	}
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

const GCSE_QUESTION_TEXT_CSS_PX = 16;
const GCSE_PAPER_BODY_TEXT_PT = 12;
const GCSE_PAPER_CSS_PX_PER_INCH = (GCSE_QUESTION_TEXT_CSS_PX / GCSE_PAPER_BODY_TEXT_PT) * 72;

function paperAssetSize(
	metadataJson: string
): Pick<QuestionAsset, 'paperWidthPx' | 'paperHeightPx'> {
	const metadata = parseJson<AssetMetadata>(metadataJson, {});
	const candidate = metadata.image_candidates?.find(
		(item) =>
			typeof item.width === 'number' &&
			typeof item.height === 'number' &&
			typeof item.x_ppi === 'number' &&
			typeof item.y_ppi === 'number' &&
			item.x_ppi > 0 &&
			item.y_ppi > 0
	);

	if (!candidate?.width || !candidate.height || !candidate.x_ppi || !candidate.y_ppi) {
		return { paperWidthPx: null, paperHeightPx: null };
	}

	return {
		paperWidthPx: Math.round((candidate.width / candidate.x_ppi) * GCSE_PAPER_CSS_PX_PER_INCH),
		paperHeightPx: Math.round((candidate.height / candidate.y_ppi) * GCSE_PAPER_CSS_PX_PER_INCH)
	};
}

function paperAssetMeasurement(metadataJson: string): PaperMeasurement | null {
	const metadata = parseJson<AssetMetadata>(metadataJson, {});
	const measurement = metadata.paper_measurement;
	if (
		measurement?.axis !== 'horizontal' ||
		measurement.source_verified !== true ||
		!Number.isFinite(measurement.pixel_width) ||
		Number(measurement.pixel_width) <= 0 ||
		!Number.isFinite(measurement.pixels_per_millimetre) ||
		Number(measurement.pixels_per_millimetre) <= 0
	) {
		return null;
	}
	return {
		axis: 'horizontal',
		pixelWidth: Number(measurement.pixel_width),
		pixelsPerMillimetre: Number(measurement.pixels_per_millimetre),
		instructions:
			typeof measurement.instructions === 'string' ? measurement.instructions : undefined
	};
}

function distanceFromDb(value: string | null | undefined): TransferDistance {
	if (value === 'exam_transfer' || value === 'exam-transfer') return 'exam-transfer';
	if (value === 'start' || value === 'near' || value === 'stretch') return value;
	return 'unclassified';
}

function distanceLabel(distance: TransferDistance): string {
	if (distance === 'exam-transfer') return 'exam transfer';
	if (distance === 'unclassified') return 'practice';
	return distance;
}

function constellationRole(distance: TransferDistance): string {
	if (distance === 'start') return 'First question';
	if (distance === 'near') return 'Nearby practice';
	if (distance === 'stretch') return 'Less obvious transfer';
	if (distance === 'exam-transfer') return 'Exam transfer';
	return 'Practice';
}

function shortStepText(text: string): string {
	return text.replace(/\.$/, '').replace(/^The /, '').replace(/^A /, '').replace(/^An /, '');
}

function iconForStep(text: string, role: string): RepairChainNode['icon'] {
	const lower = `${text} ${role}`.toLowerCase();
	if (lower.includes('oxygen')) return 'oxygen';
	if (lower.includes('water') || lower.includes('blood') || lower.includes('solution'))
		return 'droplet';
	if (
		lower.includes('energy') ||
		lower.includes('heating') ||
		lower.includes('power') ||
		lower.includes('potential difference') ||
		lower.includes('current')
	)
		return 'zap';
	if (lower.includes('respiration') || lower.includes('enzyme') || lower.includes('atom'))
		return 'atom';
	return 'target';
}

function titleFromQuestion(row: QuestionRow): string {
	return storedQuestionTitle({
		id: row.id,
		subject: row.subject,
		metadataJson: row.metadata_json,
		promptText: row.prompt_text,
		selfContainedPromptText: row.self_contained_prompt_text,
		topicPathJson: row.topic_path_json
	});
}

function topicFromRow(row: QuestionRow): string {
	const topicPath = parseJson<string[]>(row.topic_path_json, []);
	if (topicPath.length > 0) return topicPath.join(': ');
	return row.subject_area ?? row.paper ?? 'GCSE science';
}

export function cleanPromptText(text: string): string {
	return cleanLearnerQuestionText(text);
}

function questionReferencesSourceAsset(text: string): boolean {
	return /\b(?:figure|table)\s+\d+\b/i.test(text);
}

function displayContextFromRow(row: QuestionRow): string {
	const context = row.context_text?.trim();
	if (!context) return '';

	const selfContainment = parseJson<{
		is_self_contained?: boolean;
		requires_context?: boolean;
		requires_assets?: boolean;
	}>(row.self_containment_json, {});

	const displayContext = cleanPromptText(context);

	if (selfContainment.requires_context || selfContainment.requires_assets) return displayContext;
	if (questionReferencesSourceAsset(row.prompt_text)) return displayContext;

	return selfContainment.is_self_contained ? '' : displayContext;
}

function markEvidenceFromStep(row: ChainStepRow): string {
	const evidence = parseJson<Array<Record<string, unknown>>>(row.evidence_json, []);
	const firstEvidence = evidence[0];
	const summary =
		(firstEvidence?.evidence_summary as string | undefined) ??
		(firstEvidence?.evidence_excerpt as string | undefined);
	return summary ?? 'Supported by the extracted mark-scheme evidence for this chain.';
}

async function getChainSteps(chainId: string): Promise<ChainStep[]> {
	const rows = await queryRows<ChainStepRow>(
		`SELECT id, display_order, step_text, step_role, explanation, common_omission, evidence_json
		 FROM answer_chain_steps
		 WHERE answer_chain_id = ?
		 ORDER BY display_order`,
		[chainId]
	);

	return rows.map((row) => ({
		id: row.id,
		short: shortStepText(row.step_text),
		label: row.step_text,
		role: row.step_role,
		explanation: row.explanation ?? row.step_text,
		markEvidence: markEvidenceFromStep(row),
		commonOmission: row.common_omission ?? 'This idea is easy to skip in a short answer.'
	}));
}

function buildAnswerChain(
	row: ChainRow,
	steps: ChainStep[],
	illustration: ChainIllustration | null
): AnswerChain {
	const commonMissingLink =
		steps.find((step) => step.commonOmission)?.commonOmission ??
		'Students often name the topic but miss one of the middle reasoning steps.';

	return {
		id: row.id,
		title: row.title,
		canonicalText: row.canonical_chain_text,
		concreteText: row.canonical_chain_text,
		pageTitle: 'Same method',
		summary:
			row.summary ??
			`Use this method when a ${row.subject_area ?? 'science'} question asks for the same ordered reasoning steps.`,
		steps,
		commonMissingLink,
		modelAnswer: steps.map((step) => step.short).join(' -> '),
		illustration
	};
}

async function getChain(chainId: string): Promise<AnswerChain> {
	const row = await queryFirst<ChainRow>(
		`SELECT id, title, canonical_chain_text, summary, subject_area, broad_topic, metadata_json
		 FROM answer_chains
		 WHERE (id = ? OR slug = ?)
		   AND needs_human_review = 0
		   AND status = 'published'`,
		[chainId, chainId]
	);
	if (!row) throw new Error(`Method not found: ${chainId}`);

	const [steps, illustration] = await Promise.all([
		getChainSteps(row.id),
		getPublishedChainIllustration(row.id)
	]);
	return buildAnswerChain(row, steps, illustration);
}

function seedFromRow(row: QuestionChainSeedRow): QuestionChainSeed {
	return {
		row,
		membership: {
			answer_chain_id: row.answer_chain_id,
			transfer_distance: row.transfer_distance,
			display_order: row.display_order,
			fit_confidence: row.fit_confidence,
			fit_notes: row.fit_notes,
			needs_human_review: row.needs_human_review
		},
		chainRow: {
			id: row.chain_id,
			title: row.chain_title,
			canonical_chain_text: row.chain_canonical_chain_text,
			summary: row.chain_summary,
			subject_area: row.chain_subject_area,
			broad_topic: row.chain_broad_topic,
			metadata_json: row.chain_metadata_json
		}
	};
}

async function getQuestionChainSeed(questionId: string): Promise<QuestionChainSeed> {
	const row = await queryFirst<QuestionChainSeedRow>(
		`SELECT q.id, q.source_question_ref, q.prompt_text, q.self_contained_prompt_text,
		        q.context_text, q.command_word, q.marks, q.answer_format,
		        q.board, q.qualification, q.subject, q.subject_area, q.tier, q.paper,
		        q.topic_path_json, q.self_containment_json, q.metadata_json,
		        qac.answer_chain_id, qac.transfer_distance, qac.display_order, qac.fit_confidence,
		        qac.fit_notes, qac.needs_human_review,
		        ac.id AS chain_id,
		        ac.title AS chain_title,
		        ac.canonical_chain_text AS chain_canonical_chain_text,
		        ac.summary AS chain_summary,
		        ac.subject_area AS chain_subject_area,
		        ac.broad_topic AS chain_broad_topic,
		        ac.metadata_json AS chain_metadata_json
		 FROM questions q
		 JOIN question_answer_chains qac ON qac.question_id = q.id
		 JOIN answer_chains ac ON ac.id = qac.answer_chain_id
		 WHERE (q.id = ? OR q.slug = ?)
		   AND q.needs_human_review = 0
		   AND q.status = 'published'
		   AND qac.needs_human_review = 0
		   AND ac.needs_human_review = 0
		   AND ac.status = 'published'
		 ORDER BY qac.is_primary DESC, COALESCE(qac.fit_confidence, 0) DESC
		 LIMIT 1`,
		[questionId, questionId]
	);
	if (!row) throw new Error(`Question has no answer chain: ${questionId}`);
	return seedFromRow(row);
}

function questionIdPlaceholders(questionIds: string[]): string {
	return questionIds.map(() => '?').join(', ');
}

function uniqueQuestionIds(questionIds: string[]): string[] {
	return [...new Set(questionIds.filter(Boolean))];
}

function emptyQuestionSupplement(): QuestionSupplement {
	return {
		assets: [],
		renderingOverlay: null,
		checklistRows: [],
		modelAnswerRow: null,
		weakAnswerRow: null
	};
}

function ensureQuestionSupplement(
	supplements: Map<string, QuestionSupplement>,
	questionId: string
): QuestionSupplement {
	const existing = supplements.get(questionId);
	if (existing) return existing;
	const created = emptyQuestionSupplement();
	supplements.set(questionId, created);
	return created;
}

function questionAssetFromRow(row: AssetRow): QuestionAsset | null {
	const publicPath = questionAssetPublicPath(row.public_path, row.r2_key);
	if (!publicPath) return null;
	const paperSize = paperAssetSize(row.metadata_json);

	return {
		id: row.id,
		assetType: row.asset_type,
		sourceLabel: row.source_label ?? 'Source image',
		publicPath,
		altText: row.alt_text ?? row.source_label ?? 'Question paper image',
		required: Boolean(row.required),
		role: row.role,
		...paperSize,
		paperMeasurement: paperAssetMeasurement(row.metadata_json)
	};
}

function renderingOverlayFromRow(row: RenderingOverlayRow): QuestionRenderingOverlay {
	const renderObject = parseJson<Record<string, unknown>>(row.render_json, {});

	return {
		id: row.id,
		version: row.overlay_version,
		provenance: row.provenance,
		confidence: row.confidence,
		needsHumanReview: Boolean(row.needs_human_review),
		stemBlocks: Array.isArray(renderObject.stemBlocks) ? renderObject.stemBlocks : [],
		promptBlocks: Array.isArray(renderObject.promptBlocks) ? renderObject.promptBlocks : [],
		responseInteraction:
			renderObject.response && typeof renderObject.response === 'object'
				? (renderObject.response as Record<string, unknown>)
				: { kind: 'lines', count: 1 },
		afterResponseBlocks: Array.isArray(renderObject.afterResponseBlocks)
			? renderObject.afterResponseBlocks
			: [],
		assets: Array.isArray(renderObject.assets) ? renderObject.assets : [],
		layout:
			renderObject.layout && typeof renderObject.layout === 'object'
				? (renderObject.layout as Record<string, unknown>)
				: {},
		metadata:
			renderObject.metadata && typeof renderObject.metadata === 'object'
				? (renderObject.metadata as Record<string, unknown>)
				: {}
	};
}

export async function getQuestionRenderingOverlay(
	questionId: string
): Promise<QuestionRenderingOverlay | null> {
	const row = await queryFirst<RenderingOverlayRow>(
		`SELECT id, overlay_version, provenance, confidence, needs_human_review,
		        render_json
		 FROM question_rendering_overlays
		 WHERE question_id = ?
		   AND needs_human_review = 0
		 ORDER BY CASE provenance
			WHEN 'manual' THEN 0
			WHEN 'pdf-geometry' THEN 1
			WHEN 'vision-extracted' THEN 2
			ELSE 3
		 END, overlay_version DESC
		 LIMIT 1`,
		[questionId]
	);
	if (!row) return null;
	return renderingOverlayFromRow(row);
}

export function learnerFacingModelAnswer(value: string | null | undefined): string {
	const answer = value?.replace(/\s+/g, ' ').trim() ?? '';
	if (!answer) return '';
	if (/\bAO\d\b/i.test(answer)) return '';
	if (/^(?:allow|accept|ignore|reject|credit|do not accept)\b/i.test(answer)) return '';
	if (/^\d+(?:\.\d+)+\s+.*\b(?:AO\d|mark)\b/i.test(answer)) return '';
	if (
		/^(?:there is no|no single)\s+(?:single\s+)?(?:fixed\s+)?model answer\b/i.test(answer) ||
		/^answers?\s+(?:will|may|can)\s+vary\b/i.test(answer) ||
		/^a\s+(?:strong|high[- ]level|high[- ]scoring)\s+(?:written\s+)?response\s+(?:would|should|could|may)\b/i.test(
			answer
		)
	) {
		return '';
	}
	return answer;
}

function modelAnswerFromRow(row: ModelAnswerRow | null): string {
	return learnerFacingModelAnswer(row?.answer_text);
}

function checklistFromSteps(chain: AnswerChain): MarkChecklistItem[] {
	return chain.steps.map((step) => ({
		id: `${step.id}-check`,
		text: step.label,
		stepId: step.id
	}));
}

async function getStoredChecklist(questionId: string): Promise<ChecklistRow[]> {
	return await queryRows<ChecklistRow>(
		`SELECT id, text, display_order
		 FROM mark_checklist_items
		 WHERE question_id = ?
		   AND needs_human_review = 0
		 ORDER BY display_order`,
		[questionId]
	);
}

function checklistLooksUseful(rows: ChecklistRow[]): boolean {
	return (
		rows.length > 0 &&
		rows.every((row) => row.text.trim().length > 0 && !/\bAO\d\b/i.test(row.text))
	);
}

function checklistFromRows(
	rows: ChecklistRow[],
	chain: AnswerChain
): { items: MarkChecklistItem[]; source: 'official' | 'method' } {
	if (!checklistLooksUseful(rows)) {
		return { items: checklistFromSteps(chain), source: 'method' };
	}

	return {
		items: rows.map((row) => ({
			id: row.id,
			text: row.text,
			// Official mark-scheme rows and explanatory chain steps are different
			// structures. Keep the row id until the importer supplies an explicit link.
			stepId: row.id
		})),
		source: 'official'
	};
}

function weakAnswerFromRow(
	row: WeakAnswerRow | null,
	chain: AnswerChain
): {
	text: string;
	explanation: string;
	missingStepIds: string[];
} {
	if (row) {
		const rawMissing = parseJson<Array<string | number>>(row.missing_chain_step_ids_json, []);
		const missingStepIds = rawMissing
			.map((item) =>
				typeof item === 'number'
					? chain.steps[item]?.id
					: chain.steps.find((step) => step.id === item)?.id
			)
			.filter((item): item is string => Boolean(item));

		return {
			text: row.weak_answer_text,
			explanation: row.explanation?.replace(/\s+/g, ' ').trim() ?? '',
			missingStepIds:
				missingStepIds.length > 0 ? missingStepIds : chain.steps.slice(1).map((step) => step.id)
		};
	}

	const missingStepIds = chain.steps
		.slice(Math.max(1, chain.steps.length - 2))
		.map((step) => step.id);
	return {
		text: 'Names the topic but skips the middle reasoning links.',
		explanation: '',
		missingStepIds
	};
}

async function getQuestionSupplements(
	questionIds: string[]
): Promise<Map<string, QuestionSupplement>> {
	const ids = uniqueQuestionIds(questionIds);
	const supplements = new Map(ids.map((id) => [id, emptyQuestionSupplement()] as const));
	if (ids.length === 0) return supplements;

	const placeholders = questionIdPlaceholders(ids);
	const [assetRows, overlayRows, modelRows, checklistRows, weakRows] = await Promise.all([
		queryRows<AssetRow & { question_id: string }>(
			`SELECT question_id, id, asset_type, source_label, public_path, r2_key, alt_text, required, role, metadata_json
			 FROM question_assets
			 WHERE question_id IN (${placeholders})
			   AND needs_human_review = 0
			 ORDER BY question_id, required DESC, source_label, id`,
			ids
		),
		queryRows<RenderingOverlayRow & { question_id: string }>(
			`SELECT question_id, id, overlay_version, provenance, confidence, needs_human_review,
			        render_json
			 FROM question_rendering_overlays
			 WHERE question_id IN (${placeholders})
			   AND needs_human_review = 0
			 ORDER BY question_id,
				CASE provenance
					WHEN 'manual' THEN 0
					WHEN 'pdf-geometry' THEN 1
					WHEN 'vision-extracted' THEN 2
					ELSE 3
				END, overlay_version DESC`,
			ids
		),
		queryRows<ModelAnswerRow & { question_id: string }>(
			`SELECT question_id, answer_text
			 FROM model_answers
			 WHERE question_id IN (${placeholders})
			   AND needs_human_review = 0
			 ORDER BY question_id, COALESCE(confidence, 0) DESC, id`,
			ids
		),
		queryRows<ChecklistRow & { question_id: string }>(
			`SELECT question_id, id, text, display_order
			 FROM mark_checklist_items
			 WHERE question_id IN (${placeholders})
			   AND needs_human_review = 0
			 ORDER BY question_id, display_order`,
			ids
		),
		queryRows<WeakAnswerRow & { question_id: string }>(
			`SELECT question_id, weak_answer_text, explanation, missing_chain_step_ids_json
			 FROM common_weak_answers
			 WHERE question_id IN (${placeholders})
			   AND needs_human_review = 0
			 ORDER BY question_id,
				CASE
					WHEN explanation IS NOT NULL AND TRIM(explanation) <> '' THEN 0
					ELSE 1
				END,
				CASE
					WHEN missing_chain_step_ids_json IS NOT NULL
						AND missing_chain_step_ids_json <> '[]' THEN 0
					ELSE 1
				END,
				COALESCE(confidence, 0) DESC,
				LENGTH(COALESCE(explanation, '')) DESC,
				id`,
			ids
		)
	]);

	for (const row of assetRows) {
		const asset = questionAssetFromRow(row);
		if (!asset) continue;
		ensureQuestionSupplement(supplements, row.question_id).assets.push(asset);
	}
	for (const row of overlayRows) {
		const supplement = ensureQuestionSupplement(supplements, row.question_id);
		supplement.renderingOverlay ??= renderingOverlayFromRow(row);
	}
	for (const row of modelRows) {
		const supplement = ensureQuestionSupplement(supplements, row.question_id);
		supplement.modelAnswerRow ??= row;
	}
	for (const row of checklistRows) {
		ensureQuestionSupplement(supplements, row.question_id).checklistRows.push(row);
	}
	for (const row of weakRows) {
		const supplement = ensureQuestionSupplement(supplements, row.question_id);
		supplement.weakAnswerRow ??= row;
	}

	return supplements;
}

function isEnglishQuestionRow(
	row: Pick<QuestionRow, 'subject' | 'subject_area' | 'paper'>
): boolean {
	return [row.subject, row.subject_area, row.paper].some((value) => /english/i.test(value ?? ''));
}

export async function isEnglishQuestion(questionId: string): Promise<boolean> {
	try {
		return isEnglishQuestionRow(await getQuestionRow(questionId));
	} catch {
		return false;
	}
}

function cleanChecklistLabel(value: string): string {
	const cleaned = value
		.replace(/\s+/g, ' ')
		.replace(/^AO\d(?:\/AO\d)?:\s*/i, '')
		.trim();
	return cleaned ? `${cleaned[0].toUpperCase()}${cleaned.slice(1)}` : cleaned;
}

function truncateSentence(value: string, limit = 92): string {
	const cleaned = cleanChecklistLabel(value);
	if (cleaned.length <= limit) return cleaned;
	return `${cleaned.slice(0, limit - 3).trim()}...`;
}

function keywordCandidates(value: string): string[] {
	const stopWords = new Set([
		'about',
		'against',
		'answer',
		'available',
		'because',
		'between',
		'clear',
		'clearly',
		'could',
		'credit',
		'developed',
		'enough',
		'explain',
		'explains',
		'explores',
		'from',
		'ideas',
		'including',
		'into',
		'marks',
		'rather',
		'relevant',
		'should',
		'than',
		'that',
		'their',
		'there',
		'these',
		'this',
		'uses',
		'with',
		'write',
		'writes'
	]);
	return [...new Set(value.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [])]
		.filter((word) => !stopWords.has(word))
		.slice(0, 12);
}

function distributeMarks(totalMarks: number, count: number): number[] {
	if (count <= 0) return [];
	const base = Math.max(1, Math.floor(totalMarks / count));
	const marks = Array.from({ length: count }, () => base);
	let remainder = Math.max(0, totalMarks - base * count);
	for (let index = 0; index < marks.length && remainder > 0; index += 1) {
		marks[index] += 1;
		remainder -= 1;
	}
	return marks;
}

function genericEnglishChecklist(row: QuestionRow): ChecklistRow[] {
	const prompt = row.prompt_text.toLowerCase();
	const subject = row.subject ?? '';
	const literature = /literature/i.test(subject);
	const writingTask =
		/writing|write|letter|speech|article|argue|advise|account|description|story/.test(prompt) &&
		(row.marks ?? 0) >= 10;

	if (literature) {
		return [
			{
				id: `${row.id}-criterion-argument`,
				text: 'Clear, task-focused argument that answers the exact literature question.',
				display_order: 1
			},
			{
				id: `${row.id}-criterion-evidence`,
				text: 'Precise textual references from the extract, poem or wider text.',
				display_order: 2
			},
			{
				id: `${row.id}-criterion-method`,
				text: "Analysis of the writer's language, form, structure or dramatic methods.",
				display_order: 3
			},
			{
				id: `${row.id}-criterion-wider`,
				text: 'Meaningful connection to the wider text or second poem where the question requires it.',
				display_order: 4
			},
			{
				id: `${row.id}-criterion-expression`,
				text: 'Relevant context and controlled expression for SPaG credit.',
				display_order: 5
			}
		];
	}

	if (writingTask) {
		return [
			{
				id: `${row.id}-criterion-form`,
				text: 'Sustains the required form, audience and purpose.',
				display_order: 1
			},
			{
				id: `${row.id}-criterion-content`,
				text: 'Develops relevant ideas with a clear line of argument or description.',
				display_order: 2
			},
			{
				id: `${row.id}-criterion-structure`,
				text: 'Organises ideas clearly with paragraphs and deliberate structure.',
				display_order: 3
			},
			{
				id: `${row.id}-criterion-language`,
				text: 'Uses vocabulary and sentence choices for effect.',
				display_order: 4
			},
			{
				id: `${row.id}-criterion-accuracy`,
				text: 'Controls spelling, punctuation and grammar.',
				display_order: 5
			}
		];
	}

	return [
		{
			id: `${row.id}-criterion-answer`,
			text:
				(row.marks ?? 0) <= 2
					? 'Gives the exact word, phrase or point required by the question.'
					: 'Answers the question directly with relevant evidence from the source.',
			display_order: 1
		}
	];
}

function buildEnglishCriteria(
	row: QuestionRow,
	checklistRows: ChecklistRow[]
): EnglishPracticeCriterion[] {
	const rows = checklistRows.length > 0 ? checklistRows : genericEnglishChecklist(row);
	const markValues = distributeMarks(row.marks ?? rows.length, rows.length);

	return rows.map((item, index) => {
		const detail = cleanChecklistLabel(item.text);
		const title = truncateSentence(detail, 74);
		return {
			id: item.id || `${row.id}-criterion-${index + 1}`,
			title,
			detail,
			marks: markValues[index] ?? 1,
			found: `You cover this focus: ${detail}`,
			missing: `Add this focus: ${detail}`,
			keywords: keywordCandidates(detail)
		};
	});
}

export function classifyEnglishLiteratureTask({
	subject,
	promptText,
	contextText,
	paper
}: {
	subject: string | null | undefined;
	promptText: string;
	contextText?: string | null;
	paper?: string | null;
}): EnglishLiteratureTaskKind {
	if (!/literature/i.test(subject ?? '')) return 'other';
	const prompt = promptText.toLowerCase();
	const context = contextText?.toLowerCase() ?? '';
	const taskText = `${prompt} ${context}`;
	const isComparison = /\bcompare\b|\bboth (?:poems|texts|extracts)\b/.test(prompt);
	const isPoetry = /\bpoem|\bpoetry|\banthology\b/.test(`${prompt} ${context} ${paper ?? ''}`);
	const hasPrintedExtract =
		/\bthis extract\b|\bthese two extracts\b|\bprinted extract/.test(taskText) ||
		/\bstarting with (?:this|the) (?:moment|passage|scene|section|episode)\b/.test(taskText) ||
		/\b(?:this|the) (?:moment|passage|scene|section|episode) (?:above|below)\b/.test(taskText) ||
		/\brefer(?:ring)? to (?:act|scene|chapter|lines?)\b[\s\S]*\belsewhere\b/.test(taskText);
	const asksElsewhere =
		/\belsewhere\b|\bwider text\b|\brest of (?:the|your) (?:text|play|novel)\b|\b(?:text|play|novel) as a whole\b/.test(
			taskText
		);
	// “Explore at least two moments” is an evidence-scope instruction used by
	// both discursive judgements and ordinary whole-text analysis. It does not,
	// by itself, ask the learner to evaluate a proposition. Reserve the
	// judgement scaffold for an explicit evaluative command.
	const asksJudgement = /\bhow far\b|\bto what extent\b|\bdo you agree\b/.test(prompt);

	if (isComparison && isPoetry) return 'poetry-comparison';
	if (isComparison && hasPrintedExtract) return 'extract-comparison';
	if (hasPrintedExtract && asksElsewhere) return 'extract-and-wider';
	if (asksJudgement) return 'whole-text-judgement';
	return 'single-text-analysis';
}

function englishLiteratureTaskKind(row: QuestionRow): EnglishLiteratureTaskKind {
	return classifyEnglishLiteratureTask({
		subject: row.subject,
		promptText: row.prompt_text,
		contextText: row.context_text,
		paper: row.paper
	});
}

async function getStandaloneModelAnswer(questionId: string): Promise<string> {
	const row = await queryFirst<ModelAnswerRow>(
		`SELECT answer_text
		 FROM model_answers
		 WHERE question_id = ?
		   AND needs_human_review = 0
		 ORDER BY COALESCE(confidence, 0) DESC
		 LIMIT 1`,
		[questionId]
	);

	return learnerFacingModelAnswer(row?.answer_text);
}

async function getStandaloneWeakAnswer(questionId: string): Promise<{
	text: string;
	explanation: string;
}> {
	const row = await queryFirst<WeakAnswerRow>(
		`SELECT weak_answer_text, explanation, missing_chain_step_ids_json
		 FROM common_weak_answers
		 WHERE question_id = ?
		   AND needs_human_review = 0
		 ORDER BY CASE
		            WHEN explanation IS NOT NULL AND TRIM(explanation) <> '' THEN 0
		            ELSE 1
		          END,
		          COALESCE(confidence, 0) DESC,
		          id
		 LIMIT 1`,
		[questionId]
	);

	return {
		text: row?.weak_answer_text ?? 'A vague answer that does not meet the mark focus.',
		explanation: row?.explanation?.replace(/\s+/g, ' ').trim() ?? ''
	};
}

function roleForEnglishCriterion(text: string): ChainStep['role'] {
	const lower = text.toLowerCase();
	if (/\bevidence|reference|quotation|source|extract\b/.test(lower)) return 'evidence';
	if (/\bmethod|language|structure|form|effect|analyse|analysis\b/.test(lower)) return 'method';
	if (/\bcontext|expression|spag|spelling|punctuation|grammar\b/.test(lower)) return 'conclusion';
	return 'link';
}

function buildEnglishDiagnosticChain(
	row: QuestionRow,
	criteria: EnglishPracticeCriterion[],
	modelAnswer: string,
	weakAnswer: { text: string; explanation: string }
): AnswerChain {
	const steps = criteria.map<ChainStep>((criterion) => ({
		id: criterion.id,
		short: criterion.title,
		label: criterion.detail,
		role: roleForEnglishCriterion(criterion.detail),
		explanation: criterion.missing,
		markEvidence: criterion.detail,
		commonOmission: criterion.missing
	}));

	return {
		id: `${row.id}-english-mark-focus`,
		title: 'Mark focus for this English question',
		canonicalText: criteria.map((criterion) => criterion.title).join(' -> '),
		concreteText: criteria.map((criterion) => criterion.detail).join('\n'),
		pageTitle: 'English answer practice',
		summary: 'Use these criteria to build and check this answer.',
		steps,
		commonMissingLink:
			weakAnswer.explanation ||
			criteria[0]?.missing ||
			'Answer the exact question before checking.',
		modelAnswer,
		illustration: null
	};
}

async function getEnglishPracticeQuestionFromRow(row: QuestionRow) {
	const [checklistRows, weakAnswer] = await Promise.all([
		getStoredChecklist(row.id),
		getStandaloneWeakAnswer(row.id)
	]);
	const criteria = buildEnglishCriteria(row, checklistRows);
	const modelAnswer = await getStandaloneModelAnswer(row.id);
	const chain = buildEnglishDiagnosticChain(row, criteria, modelAnswer, weakAnswer);
	const membership: MembershipRow = {
		answer_chain_id: chain.id,
		transfer_distance: 'unclassified',
		display_order: 0,
		fit_confidence: 1,
		fit_notes: chain.summary,
		needs_human_review: 0
	};
	const question = await hydrateQuestion(row, chain, membership);
	if (!question.practiceAvailable) {
		throw new Error(
			question.practiceUnavailableReason ??
				`English practice is unavailable for question ${question.id}.`
		);
	}
	return { question, chain };
}

async function getRelatedEnglishPracticeQuestion(
	row: QuestionRow,
	currentQuestion: Question
): Promise<Question> {
	const topicPath = parseJson<unknown[]>(row.topic_path_json, []);
	const work = [...topicPath]
		.reverse()
		.find(
			(value): value is string =>
				typeof value === 'string' &&
				value.trim().length > 0 &&
				!/^(?:english literature|section [a-z]|modern (?:drama|prose or drama)|poetry|shakespeare)$/i.test(
					value.trim()
				)
		);
	if (!work) return currentQuestion;

	const candidates = await queryRows<{ id: string }>(
		`SELECT candidate.id
		 FROM questions candidate
		 WHERE candidate.id <> ?
		   AND candidate.needs_human_review = 0
		   AND candidate.status = 'published'
		   AND COALESCE(candidate.board, '') = COALESCE(?, '')
		   AND COALESCE(candidate.qualification, '') = COALESCE(?, '')
		   AND COALESCE(candidate.subject, candidate.subject_area, '') = COALESCE(?, ?)
		   AND EXISTS (
		     SELECT 1
		     FROM json_each(candidate.topic_path_json) topic
		     WHERE LOWER(TRIM(CAST(topic.value AS TEXT))) = LOWER(?)
		   )
		 ORDER BY CASE
		            WHEN COALESCE(candidate.paper, '') = COALESCE(?, '') THEN 0
		            ELSE 1
		          END,
		          ABS(COALESCE(candidate.marks, 0) - ?),
		          candidate.id
		 LIMIT 12`,
		[
			row.id,
			row.board,
			row.qualification,
			row.subject,
			row.subject_area,
			work.trim(),
			row.paper,
			row.marks ?? 0
		]
	);

	for (const candidate of candidates) {
		try {
			const candidateRow = await getQuestionRow(candidate.id);
			return (await getEnglishPracticeQuestionFromRow(candidateRow)).question;
		} catch {
			// Skip candidates that do not have a complete, reviewed practice surface.
		}
	}
	return currentQuestion;
}

async function getEnglishPracticePageDataFromRow(row: QuestionRow): Promise<PracticePageData> {
	const { question, chain } = await getEnglishPracticeQuestionFromRow(row);
	const nextQuestion = await getRelatedEnglishPracticeQuestion(row, question);

	return {
		question,
		chain,
		constellation: {
			id: `${row.id}-english-practice`,
			title: question.title,
			summary: 'English answer practice for this question.',
			chainId: chain.id,
			questionIds: [question.id]
		},
		questions: [question],
		nextQuestion
	};
}

function repairChainFromSteps(chain: AnswerChain): RepairChainNode[] {
	return chain.steps.map((step) => ({
		id: `${step.id}-node`,
		label: step.short,
		stepId: step.id,
		icon: iconForStep(step.label, step.role)
	}));
}

function hydrateQuestionFromSupplement(
	row: QuestionRow,
	chain: AnswerChain,
	membership: MembershipRow,
	supplement: QuestionSupplement
): Question {
	const transferDistance = distanceFromDb(membership.transfer_distance);
	const checklistPresentation = checklistFromRows(supplement.checklistRows, chain);
	const checklist = checklistPresentation.items;
	const weakAnswer = weakAnswerFromRow(supplement.weakAnswerRow, chain);

	const question: Question = {
		id: row.id,
		sourceRef: `Q${row.source_question_ref}`,
		title: titleFromQuestion(row),
		prompt: cleanPromptText(row.prompt_text),
		context: displayContextFromRow(row),
		assets: supplement.assets,
		renderingOverlay: supplement.renderingOverlay,
		answerFormat: row.answer_format,
		practiceAvailable: false,
		practiceUnavailableReason: null,
		meta: {
			qualification: row.qualification ?? 'GCSE',
			board: row.board ?? 'AQA',
			subject: row.subject ?? 'Combined Science',
			subjectArea: row.subject_area ?? undefined,
			tier: row.tier ?? 'Higher',
			paper: row.paper ?? 'Question paper',
			topic: topicFromRow(row),
			questionType: row.command_word ?? 'Question',
			marks: row.marks ?? checklist.length
		},
		transferDistance,
		distanceLabel: distanceLabel(transferDistance),
		constellationRole: constellationRole(transferDistance),
		modelAnswer: modelAnswerFromRow(supplement.modelAnswerRow),
		commonWeakAnswer: weakAnswer.text,
		commonWeakExplanation: weakAnswer.explanation,
		weakAnswerMissingStepIds: weakAnswer.missingStepIds,
		checklist,
		checklistSource: checklistPresentation.source,
		repairChain: repairChainFromSteps(chain),
		practiceDraft: weakAnswer.text,
		whyThisFits: membership.fit_notes ?? chain.summary
	};
	const safeQuestionTitle = hasSafeQuestionCardTitle(question);
	if (isEnglishQuestionRow(row)) {
		const eligibility = englishPracticeEligibility({
			subject: row.subject ?? row.subject_area,
			prompt: row.prompt_text,
			context: row.context_text,
			selfContainedPrompt: row.self_contained_prompt_text,
			selfContainmentJson: row.self_containment_json,
			assets: question.assets,
			renderingOverlay: question.renderingOverlay,
			taskKind: englishLiteratureTaskKind(row),
			reviewed: true
		});
		question.practiceAvailable = eligibility.available && safeQuestionTitle;
		question.practiceUnavailableReason = eligibility.reason;
		if (!safeQuestionTitle && !question.practiceUnavailableReason) {
			question.practiceUnavailableReason =
				'This practice task is unavailable because its learner-facing title has not completed review yet.';
		}
	} else {
		const responseInteraction = question.renderingOverlay?.responseInteraction;
		question.practiceAvailable =
			supportsLearnerPracticeInput({
				answerFormat: question.answerFormat,
				prompt: question.prompt,
				context: question.context,
				responseKind:
					typeof responseInteraction?.kind === 'string' ? responseInteraction.kind : null,
				responseHasWrittenFields:
					responseInteraction?.kind === 'asset-canvas' &&
					(Boolean(Number(responseInteraction.lineCount) > 0) ||
						typeof responseInteraction.answerLabel === 'string'),
				hasReferencedSourceMaterial: questionHasReferencedSourceMaterial(question)
			}) && safeQuestionTitle;
		if (!question.practiceAvailable) {
			question.practiceUnavailableReason =
				'This question can be viewed, but its original response format is not available for practice yet.';
		}
	}
	return question;
}

function questionHasReferencedSourceMaterial(question: Question): boolean {
	if (question.assets.length > 0) return true;
	return [
		...(question.renderingOverlay?.stemBlocks ?? []),
		...(question.renderingOverlay?.promptBlocks ?? [])
	].some((block) => {
		const kind = typeof block.kind === 'string' ? block.kind : '';
		return ['figure', 'table', 'structured-table', 'key'].includes(kind);
	});
}

async function hydrateQuestion(
	row: QuestionRow,
	chain: AnswerChain,
	membership: MembershipRow
): Promise<Question> {
	const supplements = await getQuestionSupplements([row.id]);
	return hydrateQuestionFromSupplement(
		row,
		chain,
		membership,
		supplements.get(row.id) ?? emptyQuestionSupplement()
	);
}

async function getQuestionRow(questionId: string): Promise<QuestionRow> {
	const row = await queryFirst<QuestionRow>(
		`SELECT id, source_question_ref, prompt_text, self_contained_prompt_text,
		        context_text, command_word, marks, answer_format, board,
		        qualification, subject, subject_area, tier, paper, topic_path_json,
		        self_containment_json, metadata_json
		 FROM questions
		 WHERE (id = ? OR slug = ?)
		   AND needs_human_review = 0
		   AND status = 'published'`,
		[questionId, questionId]
	);
	if (!row) throw new Error(`Question not found: ${questionId}`);
	return row;
}

async function hydrateQuestions(
	rows: Array<QuestionRow & MembershipRow>,
	chain: AnswerChain
): Promise<Question[]> {
	const supplements = await getQuestionSupplements(rows.map((row) => row.id));
	return hydrateQuestionsFromSupplements(rows, chain, supplements);
}

function hydrateQuestionsFromSupplements(
	rows: Array<QuestionRow & MembershipRow>,
	chain: AnswerChain,
	supplements: Map<string, QuestionSupplement>
): Question[] {
	return rows.map((row) =>
		hydrateQuestionFromSupplement(
			row,
			chain,
			row,
			supplements.get(row.id) ?? emptyQuestionSupplement()
		)
	);
}

async function getQuestionRowsForChain(
	chainId: string
): Promise<Array<QuestionRow & MembershipRow>> {
	return await queryRows<QuestionRow & MembershipRow>(
		`SELECT q.id, q.source_question_ref, q.prompt_text, q.self_contained_prompt_text,
		        q.context_text, q.command_word, q.marks, q.answer_format,
		        q.board, q.qualification, q.subject, q.subject_area, q.tier, q.paper,
		        q.topic_path_json, q.self_containment_json, q.metadata_json,
		        qac.answer_chain_id, qac.transfer_distance, qac.display_order, qac.fit_confidence,
		        qac.fit_notes, qac.needs_human_review
		 FROM question_answer_chains qac
		 JOIN questions q ON q.id = qac.question_id
		 WHERE qac.answer_chain_id = ?
		   AND qac.needs_human_review = 0
		   AND q.needs_human_review = 0
		   AND q.status = 'published'
		 ORDER BY CASE qac.transfer_distance
			WHEN 'start' THEN 0
			WHEN 'near' THEN 1
			WHEN 'stretch' THEN 2
			WHEN 'exam_transfer' THEN 3
			ELSE 4
		 END, COALESCE(qac.display_order, 999), q.year, q.source_question_ref`,
		[chainId]
	);
}

async function getQuestionsForChain(chain: AnswerChain): Promise<Question[]> {
	const rows = await getQuestionRowsForChain(chain.id);
	return (await hydrateQuestions(rows, chain)).filter(hasSafeQuestionCardTitle);
}

function buildConstellationForChain(
	chain: AnswerChain,
	questions: Question[],
	row: ConstellationRow | null
): Constellation {
	return {
		id: row?.id ?? chain.id,
		title: row?.title ?? chain.title,
		summary: row?.summary ?? `${questions.length} questions that use the same mark-scoring method.`,
		chainId: chain.id,
		questionIds: questions.map((question) => question.id)
	};
}

async function getConstellationRowForChain(chainId: string): Promise<ConstellationRow | null> {
	return await queryFirst<ConstellationRow>(
		`SELECT id, title, summary, answer_chain_id
		 FROM constellations
		 WHERE answer_chain_id = ?
		 ORDER BY confidence DESC
		 LIMIT 1`,
		[chainId]
	);
}

async function getConstellationForChain(
	chain: AnswerChain,
	questions: Question[]
): Promise<Constellation> {
	return buildConstellationForChain(chain, questions, await getConstellationRowForChain(chain.id));
}

function nextQuestionAfter(questions: Question[], questionId: string): Question {
	const index = questions.findIndex((question) => question.id === questionId);
	return questions[(index + 1 + questions.length) % questions.length] ?? questions[0];
}

function nextPracticeQuestionAfter(questions: Question[], questionId: string): Question {
	const eligibleQuestions = questions.filter((question) => question.practiceAvailable);
	if (eligibleQuestions.length === 0) {
		return questions.find((question) => question.id === questionId) ?? questions[0];
	}
	const currentIndex = eligibleQuestions.findIndex((question) => question.id === questionId);
	if (currentIndex < 0) return eligibleQuestions[0];
	return eligibleQuestions[(currentIndex + 1) % eligibleQuestions.length] ?? eligibleQuestions[0];
}

function hasSafeQuestionCardTitle(question: Question): boolean {
	return (
		storedQuestionTitleIssues({
			title: question.title,
			subject: question.meta.subjectArea ?? question.meta.subject,
			promptText: question.prompt,
			answerText: question.modelAnswer
		}).length === 0
	);
}

async function getQuestionChainContext(
	questionId: string,
	initialSeed?: QuestionChainSeed
): Promise<QuestionChainContext> {
	const seed = initialSeed ?? (await getQuestionChainSeed(questionId));
	const [steps, questionRows, constellationRow, illustration] = await Promise.all([
		getChainSteps(seed.chainRow.id),
		getQuestionRowsForChain(seed.chainRow.id),
		getConstellationRowForChain(seed.chainRow.id),
		getPublishedChainIllustration(seed.chainRow.id)
	]);
	const chain = buildAnswerChain(seed.chainRow, steps, illustration);
	const supplements = await getQuestionSupplements(questionRows.map((row) => row.id));
	const questions = hydrateQuestionsFromSupplements(questionRows, chain, supplements).filter(
		hasSafeQuestionCardTitle
	);
	const question =
		questions.find((candidate) => candidate.id === seed.row.id) ??
		hydrateQuestionFromSupplement(
			seed.row,
			chain,
			seed.membership,
			supplements.get(seed.row.id) ?? emptyQuestionSupplement()
		);
	if (!hasSafeQuestionCardTitle(question)) {
		throw new Error(`Question does not have a reviewed learner-facing title: ${question.id}`);
	}
	const constellation = buildConstellationForChain(chain, questions, constellationRow);

	return {
		row: seed.row,
		membership: seed.membership,
		chain,
		question,
		questions,
		constellation,
		nextQuestion: nextQuestionAfter(questions, question.id)
	};
}

export async function getQuestionPageData(questionId: string): Promise<QuestionPageData> {
	const context = await getQuestionChainContext(questionId);

	return {
		chain: context.chain,
		startQuestion: context.questions[0],
		questions: context.questions,
		constellation: context.constellation,
		question: context.question,
		practiceQuestion: nextPracticeQuestionAfter(context.questions, context.question.id)
	};
}

async function getFreshPracticePageData(questionId: string): Promise<PracticePageData> {
	const seed = await getQuestionChainSeed(questionId).catch(() => null);
	const row = seed?.row ?? (await getQuestionRow(questionId));
	if (isEnglishQuestionRow(row)) {
		return await getEnglishPracticePageDataFromRow(row);
	}

	const context = await getQuestionChainContext(questionId, seed ?? undefined);
	const questions = context.questions.filter((candidate) => candidate.practiceAvailable);
	const question = questions.find((candidate) => candidate.id === context.question.id);
	if (!question) {
		throw new Error(`Question does not have a reviewed learner input: ${context.question.id}`);
	}

	return {
		question,
		chain: context.chain,
		constellation: {
			...context.constellation,
			questionIds: questions.map((candidate) => candidate.id)
		},
		questions,
		nextQuestion: nextQuestionAfter(questions, question.id)
	};
}

export async function getPracticePageData(questionId: string): Promise<PracticePageData> {
	const cached = await getCachedPracticePageData(questionId).catch(() => null);
	if (cached) return cached;

	const data = await getFreshPracticePageData(questionId);
	schedulePracticePageCacheWrite(questionId, data);
	return data;
}
