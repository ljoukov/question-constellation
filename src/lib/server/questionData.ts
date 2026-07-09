import { queryFirst, queryRows } from './db';

export type TransferDistance = 'start' | 'near' | 'stretch' | 'exam-transfer' | 'unclassified';

export type ExamMeta = {
	qualification: string;
	board: string;
	subject: string;
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
	meta: ExamMeta;
	transferDistance: TransferDistance;
	distanceLabel: string;
	constellationRole: string;
	modelAnswer: string;
	commonWeakAnswer: string;
	commonWeakExplanation: string;
	weakAnswerMissingStepIds: string[];
	checklist: MarkChecklistItem[];
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
};

export type Constellation = {
	id: string;
	title: string;
	summary: string;
	chainId: string;
	questionIds: string[];
};

export type NavigationData = {
	primaryQuestionId: string;
	primaryChainId: string;
	primaryPracticeQuestionId: string;
};

export type PublicQuestionData = {
	question: Question;
	chain: AnswerChain;
	constellation: Constellation;
	nextQuestion: Question;
};

export type AnswerChainPageData = {
	chain: AnswerChain;
	startQuestion: Question;
	questions: Question[];
	constellation: Constellation;
};

export type QuestionChainPageData = AnswerChainPageData & {
	question: Question;
	practiceQuestion: Question;
};

export type ConstellationPageData = AnswerChainPageData & {
	practiceQuestion: Question;
};

export type PracticePageData = {
	question: Question;
	chain: AnswerChain;
	constellation: Constellation;
	questions: Question[];
	nextQuestion: Question;
	englishPractice?: EnglishPracticeData | null;
};

export type EnglishPracticeCriterion = {
	id: string;
	title: string;
	detail: string;
	marks: number;
	found: string;
	missing: string;
	keywords: string[];
};

export type EnglishPracticeStage = {
	id: string;
	criterionId: string;
	title: string;
	shortTitle: string;
	revealedText: string;
	prompt: string;
	placeholder: string;
	goal: string;
};

export type EnglishPracticeData = {
	questionId: string;
	question: Question;
	sourceTitle: string;
	instructions: string[];
	criteria: EnglishPracticeCriterion[];
	stages: EnglishPracticeStage[];
	modelAnswer: string;
	weakAnswerText: string;
	weakAnswerExplanation: string;
	isExtended: boolean;
	stepLineCount: number;
	fullLineCount: number;
};

type QuestionRow = {
	id: string;
	source_question_ref: string;
	prompt_text: string;
	context_text: string | null;
	command_word: string | null;
	marks: number | null;
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

type EnglishQuestionMetadata = {
	title?: string;
	source?: string;
	stem?: string;
	instructions?: string[];
	sourceQuestionRef?: string;
};

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
	const metadata = parseJson<{ title?: string }>(row.metadata_json, {});
	if (metadata.title) return metadata.title;

	const lines = cleanPromptText(row.prompt_text)
		.split('\n')
		.map((part) => part.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.filter(
			(line) => !/^(?:choose (?:the )?answers? from the box|complete the sentence)\.?$/i.test(line)
		);

	const questionLine = lines.find((line) => line.endsWith('?'));
	const commandLine = lines.find((line) =>
		/^(?:explain|describe|give|state|calculate|determine|compare|name|suggest|evaluate|use|write|draw|measure|identify|what|which|why|how)\b/i.test(
			line
		)
	);
	const title = questionLine ?? commandLine ?? lines.at(-1) ?? row.id;
	return title.length > 120 ? `${title.slice(0, 117).trim()}...` : title;
}

function topicFromRow(row: QuestionRow): string {
	const topicPath = parseJson<string[]>(row.topic_path_json, []);
	if (topicPath.length > 0) return topicPath.join(': ');
	return row.subject_area ?? row.paper ?? 'GCSE science';
}

function cleanPromptText(text: string): string {
	return text
		.split(/\r?\n/)
		.filter((line) => !/^\s*\[\s*\d+\s*marks?\s*\]\s*$/i.test(line))
		.filter((line) => !/^\s*(?:figure|table)\s+\d+\s*$/i.test(line))
		.join('\n')
		.trim();
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
		commonOmission: row.common_omission ?? 'This link is easy to skip in a short answer.'
	}));
}

function buildAnswerChain(row: ChainRow, steps: ChainStep[]): AnswerChain {
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
		modelAnswer: steps.map((step) => step.short).join(' -> ')
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

	return buildAnswerChain(row, await getChainSteps(row.id));
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
		`SELECT q.id, q.source_question_ref, q.prompt_text, q.context_text, q.command_word, q.marks,
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
	if (!row.public_path) return null;
	const paperSize = paperAssetSize(row.metadata_json);

	return {
		id: row.id,
		assetType: row.asset_type,
		sourceLabel: row.source_label ?? 'Source image',
		publicPath: row.public_path,
		altText: row.alt_text ?? row.source_label ?? 'Question paper image',
		required: Boolean(row.required),
		role: row.role,
		...paperSize
	};
}

async function getQuestionAssets(questionId: string): Promise<QuestionAsset[]> {
	const rows = await queryRows<AssetRow>(
		`SELECT id, asset_type, source_label, public_path, alt_text, required, role, metadata_json
		 FROM question_assets
		 WHERE question_id = ?
		 ORDER BY required DESC, source_label, id`,
		[questionId]
	);

	return rows.map(questionAssetFromRow).filter((asset): asset is QuestionAsset => Boolean(asset));
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

async function getModelAnswer(questionId: string, chain: AnswerChain): Promise<string> {
	const row = await queryFirst<ModelAnswerRow>(
		`SELECT answer_text
		 FROM model_answers
		 WHERE question_id = ?
		 ORDER BY confidence DESC
		 LIMIT 1`,
		[questionId]
	);

	return row?.answer_text ?? chain.modelAnswer;
}

function modelAnswerFromRow(row: ModelAnswerRow | null, chain: AnswerChain): string {
	return row?.answer_text ?? chain.modelAnswer;
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
		 ORDER BY display_order`,
		[questionId]
	);
}

function checklistLooksUseful(rows: ChecklistRow[]): boolean {
	return rows.length > 1 && rows.every((row) => !/\bAO\d\b/.test(row.text));
}

function checklistFromRows(rows: ChecklistRow[], chain: AnswerChain): MarkChecklistItem[] {
	if (!checklistLooksUseful(rows)) return checklistFromSteps(chain);

	return rows.map((row, index) => ({
		id: row.id,
		text: row.text,
		stepId: chain.steps[Math.min(index, chain.steps.length - 1)]?.id ?? chain.steps[0]?.id ?? row.id
	}));
}

async function getChecklist(questionId: string, chain: AnswerChain): Promise<MarkChecklistItem[]> {
	return checklistFromRows(await getStoredChecklist(questionId), chain);
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

async function getWeakAnswer(
	questionId: string,
	chain: AnswerChain
): Promise<{
	text: string;
	explanation: string;
	missingStepIds: string[];
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
		          CASE
		            WHEN missing_chain_step_ids_json IS NOT NULL
		              AND missing_chain_step_ids_json <> '[]' THEN 0
		            ELSE 1
		          END,
		          COALESCE(confidence, 0) DESC,
		          LENGTH(COALESCE(explanation, '')) DESC,
		          id
		 LIMIT 1`,
		[questionId]
	);
	return weakAnswerFromRow(row, chain);
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
			`SELECT question_id, id, asset_type, source_label, public_path, alt_text, required, role, metadata_json
			 FROM question_assets
			 WHERE question_id IN (${placeholders})
			 ORDER BY question_id, required DESC, source_label, id`,
			ids
		),
		queryRows<RenderingOverlayRow & { question_id: string }>(
			`SELECT question_id, id, overlay_version, provenance, confidence, needs_human_review,
			        render_json
			 FROM question_rendering_overlays
			 WHERE question_id IN (${placeholders})
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
			 ORDER BY question_id, COALESCE(confidence, 0) DESC, id`,
			ids
		),
		queryRows<ChecklistRow & { question_id: string }>(
			`SELECT question_id, id, text, display_order
			 FROM mark_checklist_items
			 WHERE question_id IN (${placeholders})
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

function englishQuestionKind(row: QuestionRow): 'literature' | 'writing' | 'reading' {
	const subject = row.subject ?? '';
	const prompt = row.prompt_text.toLowerCase();
	if (/literature/i.test(subject)) return 'literature';
	if (
		(row.marks ?? 0) >= 10 &&
		/\b(?:write|letter|speech|article|argue|advise|account|story|description)\b/.test(prompt)
	) {
		return 'writing';
	}
	return 'reading';
}

function criterionAt(
	criteria: EnglishPracticeCriterion[],
	index: number
): EnglishPracticeCriterion {
	return criteria[Math.min(index, criteria.length - 1)] ?? criteria[0];
}

function buildEnglishStages(
	row: QuestionRow,
	question: Question,
	criteria: EnglishPracticeCriterion[]
): EnglishPracticeStage[] {
	const marks = row.marks ?? 0;
	const kind = englishQuestionKind(row);
	const hasExtractOrSource = Boolean(question.context.trim());
	const asksWider = /\belsewhere\b|\bwider\b|\bwhole\s+play\b|\bat least two\b|\bcompare\b/i.test(
		row.prompt_text
	);

	if (marks <= 2) {
		const criterion = criterionAt(criteria, 0);
		return [
			{
				id: 'direct-answer',
				criterionId: criterion.id,
				title: 'Answer directly',
				shortTitle: 'Answer',
				revealedText:
					'This is a short-answer item. Give only the word, phrase or point the question asks for.',
				prompt: 'What is the exact answer?',
				placeholder: 'The answer is...',
				goal: criterion.detail
			}
		];
	}

	if (kind === 'writing') {
		return [
			{
				id: 'choice-form',
				criterionId: criterionAt(criteria, 0).id,
				title: 'Choose the task and form',
				shortTitle: 'Form',
				revealedText:
					'Choose one task, then keep the form clear from the first line: speech, letter, article, account or story.',
				prompt: 'Which task are you answering, and what form should it sound like?',
				placeholder: 'I am answering the ... task, so my response should...',
				goal: criterionAt(criteria, 0).detail
			},
			{
				id: 'audience-purpose',
				criterionId: criterionAt(criteria, 1).id,
				title: 'Set audience and purpose',
				shortTitle: 'Purpose',
				revealedText:
					'High marks come from writing that has a clear audience, purpose and direction, not just a list of points.',
				prompt: 'What do you want the reader or listener to think by the end?',
				placeholder: 'By the end, the reader should...',
				goal: criterionAt(criteria, 1).detail
			},
			{
				id: 'structure',
				criterionId: criterionAt(criteria, 2).id,
				title: 'Plan the structure',
				shortTitle: 'Structure',
				revealedText:
					'Plan a beginning, development and ending so the response feels controlled rather than repetitive.',
				prompt: 'What are your main sections or paragraph moves?',
				placeholder: 'First..., then..., finally...',
				goal: criterionAt(criteria, 2).detail
			},
			{
				id: 'language',
				criterionId: criterionAt(criteria, 3).id,
				title: 'Choose language for effect',
				shortTitle: 'Language',
				revealedText:
					'Select vocabulary, sentence shapes and rhetorical choices that fit the form and purpose.',
				prompt: 'Write one sentence that shows the tone you want.',
				placeholder: 'One effective sentence could be...',
				goal: criterionAt(criteria, 3).detail
			},
			{
				id: 'full-response',
				criterionId: criterionAt(criteria, criteria.length - 1).id,
				title: 'Build the full response',
				shortTitle: 'Full',
				revealedText:
					'Now write the response with clear organisation, purposeful language and controlled accuracy.',
				prompt: 'Turn the plan into the response.',
				placeholder: 'Write the response...',
				goal: criterionAt(criteria, criteria.length - 1).detail
			}
		];
	}

	if (kind === 'literature') {
		return [
			{
				id: 'task',
				criterionId: criterionAt(criteria, 0).id,
				title: 'Read the task',
				shortTitle: 'Task',
				revealedText: asksWider
					? 'This question needs a line of argument that uses the printed material and reaches into the wider text.'
					: 'This question needs a line of argument that answers the exact wording, not a plot summary.',
				prompt: 'What exactly must your answer prove?',
				placeholder: 'The writer presents...',
				goal: criterionAt(criteria, 0).detail
			},
			{
				id: 'evidence',
				criterionId: criterionAt(criteria, 1).id,
				title: hasExtractOrSource ? 'Choose first evidence' : 'Choose evidence',
				shortTitle: 'Evidence',
				revealedText: hasExtractOrSource
					? 'Start with one precise word, phrase or moment from the source on the left.'
					: 'Use a precise reference rather than a broad memory of what happens.',
				prompt: 'Which quotation or precise reference will anchor the point?',
				placeholder: 'The phrase or moment I will use is...',
				goal: criterionAt(criteria, 1).detail
			},
			{
				id: 'method',
				criterionId: criterionAt(criteria, 2).id,
				title: 'Explain the method',
				shortTitle: 'Method',
				revealedText:
					'Move from evidence to method: language, imagery, form, structure, stagecraft or audience effect.',
				prompt: 'What does the writer make the audience understand or feel?',
				placeholder: 'This suggests...',
				goal: criterionAt(criteria, 2).detail
			},
			{
				id: 'wider',
				criterionId: criterionAt(criteria, 3).id,
				title: asksWider ? 'Open the wider question' : 'Develop the idea',
				shortTitle: asksWider ? 'Wider' : 'Develop',
				revealedText: asksWider
					? 'Bring in another moment from the text so the answer does not stay trapped in one extract.'
					: 'Develop the idea with another precise moment or a more detailed interpretation.',
				prompt: asksWider
					? 'Where else in the text can you connect this idea?'
					: 'How can this point be developed further?',
				placeholder: asksWider ? 'Elsewhere...' : 'This develops because...',
				goal: criterionAt(criteria, 3).detail
			},
			{
				id: 'full-answer',
				criterionId: criterionAt(criteria, criteria.length - 1).id,
				title: 'Build the full answer',
				shortTitle: 'Essay',
				revealedText:
					'Join the argument, evidence, method and wider connection into a developed answer.',
				prompt: 'Turn your notes into a developed paragraph or answer.',
				placeholder: 'The writer presents...',
				goal: criterionAt(criteria, criteria.length - 1).detail
			}
		];
	}

	const stages: EnglishPracticeStage[] = [
		{
			id: 'direct-answer',
			criterionId: criterionAt(criteria, 0).id,
			title: 'Answer the question',
			shortTitle: 'Answer',
			revealedText: 'Start by answering the exact command word. Do not write around the question.',
			prompt: 'What is your direct answer?',
			placeholder: 'The answer is...',
			goal: criterionAt(criteria, 0).detail
		}
	];

	if (marks >= 4) {
		stages.push({
			id: 'evidence',
			criterionId: criterionAt(criteria, 1).id,
			title: 'Use the source',
			shortTitle: 'Evidence',
			revealedText:
				'Use a precise word, phrase or detail from the source so the answer can earn explanation marks.',
			prompt: 'Which evidence from the source supports your answer?',
			placeholder: 'The source says...',
			goal: criterionAt(criteria, 1).detail
		});
	}

	if (marks >= 6) {
		stages.push({
			id: 'explain-effect',
			criterionId: criterionAt(criteria, 2).id,
			title: 'Explain the effect',
			shortTitle: 'Effect',
			revealedText:
				'Higher-mark reading answers need inference or effect, not only copied evidence.',
			prompt: 'What does that evidence suggest, imply or make the reader think?',
			placeholder: 'This suggests...',
			goal: criterionAt(criteria, 2).detail
		});
	}

	return stages;
}

async function getStandaloneModelAnswer(questionId: string, fallback: string): Promise<string> {
	const row = await queryFirst<ModelAnswerRow>(
		`SELECT answer_text
		 FROM model_answers
		 WHERE question_id = ?
		   AND needs_human_review = 0
		 ORDER BY COALESCE(confidence, 0) DESC
		 LIMIT 1`,
		[questionId]
	);

	return row?.answer_text ?? fallback;
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
		pageTitle: 'English guided practice',
		summary: 'Use these criteria to build and check this answer.',
		steps,
		commonMissingLink:
			weakAnswer.explanation ||
			criteria[0]?.missing ||
			'Answer the exact question before checking.',
		modelAnswer
	};
}

function sourceTitleFromRow(row: QuestionRow): string {
	const metadata = parseJson<EnglishQuestionMetadata>(row.metadata_json, {});
	return (
		metadata.source ?? row.paper ?? `${row.board ?? 'OCR'} ${row.qualification ?? 'GCSE'} English`
	);
}

async function getEnglishPracticePageDataFromRow(row: QuestionRow): Promise<PracticePageData> {
	const checklistRows = await getStoredChecklist(row.id);
	const criteria = buildEnglishCriteria(row, checklistRows);
	const weakAnswer = await getStandaloneWeakAnswer(row.id);
	const modelAnswer = await getStandaloneModelAnswer(
		row.id,
		criteria.map((criterion) => criterion.detail).join(' ')
	);
	const metadata = parseJson<EnglishQuestionMetadata>(row.metadata_json, {});
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
	const stages = buildEnglishStages(row, question, criteria);
	const marks = row.marks ?? criteria.length;

	const englishPractice: EnglishPracticeData = {
		questionId: row.id,
		question,
		sourceTitle: sourceTitleFromRow(row),
		instructions: Array.isArray(metadata.instructions)
			? metadata.instructions.filter((instruction) => instruction.trim().length > 0)
			: [],
		criteria,
		stages,
		modelAnswer,
		weakAnswerText: weakAnswer.text,
		weakAnswerExplanation: weakAnswer.explanation,
		isExtended: marks >= 10,
		stepLineCount: marks >= 20 ? 5 : marks >= 6 ? 4 : 3,
		fullLineCount: marks >= 30 ? 18 : marks >= 10 ? 12 : marks >= 6 ? 8 : 4
	};

	return {
		question,
		chain,
		constellation: {
			id: `${row.id}-english-practice`,
			title: question.title,
			summary: 'Guided English answer practice for this question.',
			chainId: chain.id,
			questionIds: [question.id]
		},
		questions: [question],
		nextQuestion: question,
		englishPractice
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
	const checklist = checklistFromRows(supplement.checklistRows, chain);
	const weakAnswer = weakAnswerFromRow(supplement.weakAnswerRow, chain);

	return {
		id: row.id,
		sourceRef: `Q${row.source_question_ref}`,
		title: titleFromQuestion(row),
		prompt: cleanPromptText(row.prompt_text),
		context: displayContextFromRow(row),
		assets: supplement.assets,
		renderingOverlay: supplement.renderingOverlay,
		meta: {
			qualification: row.qualification ?? 'GCSE',
			board: row.board ?? 'AQA',
			subject: row.subject ?? 'Combined Science',
			tier: row.tier ?? 'Higher',
			paper: row.paper ?? 'Question paper',
			topic: topicFromRow(row),
			questionType: row.command_word ?? 'Question',
			marks: row.marks ?? checklist.length
		},
		transferDistance,
		distanceLabel: distanceLabel(transferDistance),
		constellationRole: constellationRole(transferDistance),
		modelAnswer: modelAnswerFromRow(supplement.modelAnswerRow, chain),
		commonWeakAnswer: weakAnswer.text,
		commonWeakExplanation: weakAnswer.explanation,
		weakAnswerMissingStepIds: weakAnswer.missingStepIds,
		checklist,
		repairChain: repairChainFromSteps(chain),
		practiceDraft: weakAnswer.text,
		whyThisFits: membership.fit_notes ?? chain.summary
	};
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
		`SELECT id, source_question_ref, prompt_text, context_text, command_word, marks, board,
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
		`SELECT q.id, q.source_question_ref, q.prompt_text, q.context_text, q.command_word, q.marks,
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
	return await hydrateQuestions(rows, chain);
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

async function getQuestionChainContext(
	questionId: string,
	initialSeed?: QuestionChainSeed
): Promise<QuestionChainContext> {
	const seed = initialSeed ?? (await getQuestionChainSeed(questionId));
	const [steps, questionRows, constellationRow] = await Promise.all([
		getChainSteps(seed.chainRow.id),
		getQuestionRowsForChain(seed.chainRow.id),
		getConstellationRowForChain(seed.chainRow.id)
	]);
	const chain = buildAnswerChain(seed.chainRow, steps);
	const supplements = await getQuestionSupplements(questionRows.map((row) => row.id));
	const questions = hydrateQuestionsFromSupplements(questionRows, chain, supplements);
	const question =
		questions.find((candidate) => candidate.id === seed.row.id) ??
		hydrateQuestionFromSupplement(
			seed.row,
			chain,
			seed.membership,
			supplements.get(seed.row.id) ?? emptyQuestionSupplement()
		);
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

export async function getNavigationData(): Promise<NavigationData> {
	const row = await queryFirst<{
		primaryQuestionId: string;
		primaryChainId: string;
		primaryPracticeQuestionId: string;
	}>(
		`WITH primary_question AS (
			SELECT q.id AS question_id, qac.answer_chain_id
			FROM question_answer_chains qac
			JOIN questions q ON q.id = qac.question_id
			JOIN answer_chains ac ON ac.id = qac.answer_chain_id
			WHERE qac.transfer_distance = 'start'
			  AND qac.needs_human_review = 0
			  AND q.needs_human_review = 0
			  AND q.status = 'published'
			  AND ac.needs_human_review = 0
			  AND ac.status = 'published'
			ORDER BY qac.needs_human_review ASC, COALESCE(qac.fit_confidence, 0) DESC, q.id
			LIMIT 1
		)
		SELECT
			pq.question_id AS primaryQuestionId,
			pq.answer_chain_id AS primaryChainId,
			COALESCE((
				SELECT q2.id
				FROM question_answer_chains qac2
				JOIN questions q2 ON q2.id = qac2.question_id
				WHERE qac2.answer_chain_id = pq.answer_chain_id
				  AND q2.id != pq.question_id
				  AND qac2.needs_human_review = 0
				  AND q2.needs_human_review = 0
				  AND q2.status = 'published'
				ORDER BY CASE qac2.transfer_distance WHEN 'near' THEN 0 WHEN 'stretch' THEN 1 ELSE 2 END,
				         COALESCE(qac2.display_order, 999)
				LIMIT 1
			), pq.question_id) AS primaryPracticeQuestionId
		FROM primary_question pq`
	);

	if (!row) {
		throw new Error('No chained questions have been imported into D1.');
	}

	return row;
}

export async function getPublicQuestionData(questionId: string): Promise<PublicQuestionData> {
	const context = await getQuestionChainContext(questionId);

	return {
		question: context.question,
		chain: context.chain,
		constellation: context.constellation,
		nextQuestion: context.nextQuestion
	};
}

export async function getAnswerChainPageData(chainId: string): Promise<AnswerChainPageData> {
	const chain = await getChain(chainId);
	const questions = await getQuestionsForChain(chain);
	if (questions.length === 0) throw new Error(`No questions for chain: ${chainId}`);
	const constellation = await getConstellationForChain(chain, questions);

	return {
		chain,
		startQuestion: questions[0],
		questions,
		constellation
	};
}

export async function getQuestionChainPageData(questionId: string): Promise<QuestionChainPageData> {
	const context = await getQuestionChainContext(questionId);

	return {
		chain: context.chain,
		startQuestion: context.questions[0],
		questions: context.questions,
		constellation: context.constellation,
		question: context.question,
		practiceQuestion: context.nextQuestion
	};
}

export async function getConstellationPageData(chainId: string): Promise<ConstellationPageData> {
	const data = await getAnswerChainPageData(chainId);
	return {
		...data,
		practiceQuestion: data.questions[1] ?? data.questions[0]
	};
}

export async function getPracticePageData(questionId: string): Promise<PracticePageData> {
	const seed = await getQuestionChainSeed(questionId).catch(() => null);
	const row = seed?.row ?? (await getQuestionRow(questionId));
	if (isEnglishQuestionRow(row)) {
		return await getEnglishPracticePageDataFromRow(row);
	}

	const context = await getQuestionChainContext(questionId, seed ?? undefined);

	return {
		question: context.question,
		chain: context.chain,
		constellation: context.constellation,
		questions: context.questions,
		nextQuestion: context.nextQuestion
	};
}
