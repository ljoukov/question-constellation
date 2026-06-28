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

export type MemoryEntry = {
	id: string;
	chainId: string;
	savedFromQuestionId: string;
	lastPractisedQuestionId: string;
	nextReviewQuestionId: string;
	mastery: 'new' | 'building' | 'secure';
	lastSavedLabel: string;
	reviewLabel: string;
	attemptedQuestionIds: string[];
	recurringMissingStepId: string;
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
	memoryEntry: MemoryEntry;
};

export type ThinkingMemoryPageData = {
	entries: Array<
		MemoryEntry & {
			chain: AnswerChain;
			savedFromQuestion: Question;
			lastPractisedQuestion: Question;
			nextReviewQuestion: Question;
			recurringMissingStep: ChainStep;
		}
	>;
	selected: MemoryEntry & {
		chain: AnswerChain;
		savedFromQuestion: Question;
		lastPractisedQuestion: Question;
		nextReviewQuestion: Question;
		recurringMissingStep: ChainStep;
	};
	questions: Question[];
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
	text: string;
	display_order: number;
};

type ModelAnswerRow = {
	answer_text: string;
};

type WeakAnswerRow = {
	weak_answer_text: string;
	missing_chain_step_ids_json: string;
};

type ConstellationRow = {
	id: string;
	title: string;
	summary: string | null;
	answer_chain_id: string;
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

async function getChain(chainId: string): Promise<AnswerChain> {
	const row = await queryFirst<ChainRow>(
		`SELECT id, title, canonical_chain_text, summary, subject_area, broad_topic, metadata_json
		 FROM answer_chains
		 WHERE (id = ? OR slug = ?)
		   AND needs_human_review = 0
		   AND status = 'published'`,
		[chainId, chainId]
	);
	if (!row) throw new Error(`Answer chain not found: ${chainId}`);

	const steps = await getChainSteps(row.id);
	const commonMissingLink =
		steps.find((step) => step.commonOmission)?.commonOmission ??
		'Students often name the topic but miss one of the middle reasoning links.';

	return {
		id: row.id,
		title: row.title,
		canonicalText: row.canonical_chain_text,
		concreteText: row.canonical_chain_text,
		pageTitle: 'Same answer chain',
		summary:
			row.summary ??
			`Use this chain when a ${row.subject_area ?? 'science'} question asks for the same ordered reasoning links.`,
		steps,
		commonMissingLink,
		modelAnswer: steps.map((step) => step.short).join(' -> ')
	};
}

async function getPrimaryMembership(questionId: string): Promise<MembershipRow> {
	const row = await queryFirst<MembershipRow>(
		`SELECT qac.answer_chain_id, qac.transfer_distance, qac.display_order, qac.fit_confidence,
		        qac.fit_notes, qac.needs_human_review
		 FROM question_answer_chains qac
		 JOIN answer_chains ac ON ac.id = qac.answer_chain_id
		 WHERE question_id = ?
		   AND qac.needs_human_review = 0
		   AND ac.needs_human_review = 0
		   AND ac.status = 'published'
		 ORDER BY is_primary DESC, COALESCE(fit_confidence, 0) DESC
		 LIMIT 1`,
		[questionId]
	);
	if (!row) throw new Error(`Question has no answer chain: ${questionId}`);
	return row;
}

async function getQuestionAssets(questionId: string): Promise<QuestionAsset[]> {
	const rows = await queryRows<AssetRow>(
		`SELECT id, asset_type, source_label, public_path, alt_text, required, role, metadata_json
		 FROM question_assets
		 WHERE question_id = ?
		 ORDER BY required DESC, source_label, id`,
		[questionId]
	);

	return rows
		.filter((row) => row.public_path)
		.map((row) => {
			const paperSize = paperAssetSize(row.metadata_json);

			return {
				id: row.id,
				assetType: row.asset_type,
				sourceLabel: row.source_label ?? 'Source image',
				publicPath: row.public_path ?? '',
				altText: row.alt_text ?? row.source_label ?? 'Question paper image',
				required: Boolean(row.required),
				role: row.role,
				...paperSize
			};
		});
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

async function getChecklist(questionId: string, chain: AnswerChain): Promise<MarkChecklistItem[]> {
	const rows = await getStoredChecklist(questionId);
	if (!checklistLooksUseful(rows)) return checklistFromSteps(chain);

	return rows.map((row, index) => ({
		id: row.id,
		text: row.text,
		stepId: chain.steps[Math.min(index, chain.steps.length - 1)]?.id ?? chain.steps[0]?.id ?? row.id
	}));
}

async function getWeakAnswer(
	questionId: string,
	chain: AnswerChain
): Promise<{
	text: string;
	missingStepIds: string[];
}> {
	const row = await queryFirst<WeakAnswerRow>(
		`SELECT weak_answer_text, missing_chain_step_ids_json
		 FROM common_weak_answers
		 WHERE question_id = ?
		 ORDER BY confidence DESC
		 LIMIT 1`,
		[questionId]
	);

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
			missingStepIds:
				missingStepIds.length > 0 ? missingStepIds : chain.steps.slice(1).map((step) => step.id)
		};
	}

	const missingStepIds = chain.steps
		.slice(Math.max(1, chain.steps.length - 2))
		.map((step) => step.id);
	return {
		text: 'Names the topic but skips the middle reasoning links.',
		missingStepIds
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

async function hydrateQuestion(
	row: QuestionRow,
	chain: AnswerChain,
	membership: MembershipRow
): Promise<Question> {
	const transferDistance = distanceFromDb(membership.transfer_distance);
	const checklist = await getChecklist(row.id, chain);
	const weakAnswer = await getWeakAnswer(row.id, chain);

	return {
		id: row.id,
		sourceRef: `Q${row.source_question_ref}`,
		title: titleFromQuestion(row),
		prompt: cleanPromptText(row.prompt_text),
		context: displayContextFromRow(row),
		assets: await getQuestionAssets(row.id),
		renderingOverlay: await getQuestionRenderingOverlay(row.id),
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
		modelAnswer: await getModelAnswer(row.id, chain),
		commonWeakAnswer: weakAnswer.text,
		weakAnswerMissingStepIds: weakAnswer.missingStepIds,
		checklist,
		repairChain: repairChainFromSteps(chain),
		practiceDraft: weakAnswer.text,
		whyThisFits: membership.fit_notes ?? chain.summary
	};
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

async function getQuestionsForChain(chain: AnswerChain): Promise<Question[]> {
	const rows = await queryRows<QuestionRow & MembershipRow>(
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
		[chain.id]
	);

	return await Promise.all(rows.map((row) => hydrateQuestion(row, chain, row)));
}

async function getConstellationForChain(
	chain: AnswerChain,
	questions: Question[]
): Promise<Constellation> {
	const row = await queryFirst<ConstellationRow>(
		`SELECT id, title, summary, answer_chain_id
		 FROM constellations
		 WHERE answer_chain_id = ?
		 ORDER BY confidence DESC
		 LIMIT 1`,
		[chain.id]
	);

	return {
		id: row?.id ?? chain.id,
		title: row?.title ?? chain.title,
		summary:
			row?.summary ??
			`${questions.length} chained questions that use the same answer-chain structure.`,
		chainId: chain.id,
		questionIds: questions.map((question) => question.id)
	};
}

function nextQuestionAfter(questions: Question[], questionId: string): Question {
	const index = questions.findIndex((question) => question.id === questionId);
	return questions[(index + 1 + questions.length) % questions.length] ?? questions[0];
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
	const row = await getQuestionRow(questionId);
	const membership = await getPrimaryMembership(row.id);
	const chain = await getChain(membership.answer_chain_id);
	const questions = await getQuestionsForChain(chain);
	const question = await hydrateQuestion(row, chain, membership);
	const constellation = await getConstellationForChain(chain, questions);

	return {
		question,
		chain,
		constellation,
		nextQuestion: nextQuestionAfter(questions, question.id)
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
	const publicData = await getPublicQuestionData(questionId);
	const questions = await getQuestionsForChain(publicData.chain);

	return {
		chain: publicData.chain,
		startQuestion: questions[0],
		questions,
		constellation: publicData.constellation,
		question: publicData.question,
		practiceQuestion: publicData.nextQuestion
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
	const publicData = await getPublicQuestionData(questionId);
	const questions = await getQuestionsForChain(publicData.chain);
	const nextQuestion = nextQuestionAfter(questions, publicData.question.id);

	return {
		question: publicData.question,
		chain: publicData.chain,
		constellation: publicData.constellation,
		questions,
		nextQuestion,
		memoryEntry: {
			id: `memory-${publicData.chain.id}`,
			chainId: publicData.chain.id,
			savedFromQuestionId: publicData.question.id,
			lastPractisedQuestionId: publicData.question.id,
			nextReviewQuestionId: nextQuestion.id,
			mastery: 'building',
			lastSavedLabel: 'Ready to save after repair',
			reviewLabel: 'Review next',
			attemptedQuestionIds: [publicData.question.id],
			recurringMissingStepId: publicData.chain.steps[1]?.id ?? publicData.chain.steps[0]?.id
		}
	};
}

async function hydrateMemoryEntry(entry: MemoryEntry) {
	const chain = await getChain(entry.chainId);
	const recurringMissingStep =
		chain.steps.find((step) => step.id === entry.recurringMissingStepId) ?? chain.steps[0];

	return {
		...entry,
		chain,
		savedFromQuestion: (await getPublicQuestionData(entry.savedFromQuestionId)).question,
		lastPractisedQuestion: (await getPublicQuestionData(entry.lastPractisedQuestionId)).question,
		nextReviewQuestion: (await getPublicQuestionData(entry.nextReviewQuestionId)).question,
		recurringMissingStep
	};
}

export async function getThinkingMemoryPageData(): Promise<ThinkingMemoryPageData> {
	const rows = await queryRows<{
		chain_id: string;
		start_question_id: string;
		next_question_id: string;
		recurring_step_id: string;
	}>(
		`SELECT ac.id AS chain_id,
		        MIN(CASE WHEN qac.transfer_distance = 'start' THEN qac.question_id ELSE NULL END) AS start_question_id,
		        MIN(CASE WHEN qac.transfer_distance != 'start' THEN qac.question_id ELSE NULL END) AS next_question_id,
		        MIN(acs.id) AS recurring_step_id
		 FROM answer_chains ac
		 JOIN question_answer_chains qac ON qac.answer_chain_id = ac.id
		 JOIN answer_chain_steps acs ON acs.answer_chain_id = ac.id
		 JOIN questions q ON q.id = qac.question_id
		 WHERE ac.needs_human_review = 0
		   AND ac.status = 'published'
		   AND qac.needs_human_review = 0
		   AND q.needs_human_review = 0
		   AND q.status = 'published'
		 GROUP BY ac.id
		 ORDER BY COALESCE(ac.confidence, 0) DESC, ac.id
		 LIMIT 8`
	);

	const entries = await Promise.all(
		rows
			.filter((row) => row.start_question_id)
			.map((row, index): MemoryEntry => {
				const nextQuestionId = row.next_question_id ?? row.start_question_id;
				return {
					id: `memory-${row.chain_id}`,
					chainId: row.chain_id,
					savedFromQuestionId: row.start_question_id,
					lastPractisedQuestionId: row.start_question_id,
					nextReviewQuestionId: nextQuestionId,
					mastery: index % 3 === 0 ? 'building' : index % 3 === 1 ? 'new' : 'secure',
					lastSavedLabel: 'Available chain',
					reviewLabel: index === 0 ? 'Review today' : 'Practice transfer',
					attemptedQuestionIds: [row.start_question_id],
					recurringMissingStepId: row.recurring_step_id
				};
			})
			.map(hydrateMemoryEntry)
	);

	if (entries.length === 0) {
		throw new Error('No answer chains have been imported into D1.');
	}

	return {
		entries,
		selected: entries[0],
		questions: entries.map((entry) => entry.nextReviewQuestion)
	};
}
