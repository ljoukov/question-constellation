import {
	englishPracticeEligibility,
	type EnglishSourceAssetEvidence,
	type EnglishSourceTaskKind
} from './englishPracticeEligibility';

export const ENGLISH_LITERATURE_VALIDATION_TASK_KINDS = [
	'poetry-comparison',
	'extract-comparison',
	'extract-and-wider',
	'whole-text-judgement',
	'single-text-analysis'
] as const;

export type EnglishLiteratureValidationTaskKind =
	(typeof ENGLISH_LITERATURE_VALIDATION_TASK_KINDS)[number];

export type EnglishLiteratureValidationAsset = EnglishSourceAssetEvidence & {
	needsHumanReview?: boolean | number | null;
};

export type EnglishLiteratureValidationMarkItem = {
	id: string;
	itemType: string;
	text: string;
	marks?: number | null;
	sourceRef?: string | null;
	sourceDocumentId?: string | null;
};

export type EnglishLiteratureValidationChecklistItem = {
	id: string;
	text: string;
	required?: boolean | number | null;
	markSchemeItemIds?: string[] | null;
	needsHumanReview?: boolean | number | null;
};

export type EnglishLiteratureValidationModelAnswer = {
	id: string;
	answerText: string;
	derivation?: string | null;
	supportingMarkSchemeItemIds?: string[] | null;
	needsHumanReview?: boolean | number | null;
};

export type EnglishLiteratureValidationExaminerGuidanceEvidence = {
	lines: string[];
	sourceDocumentId: string | null;
	sourceRef: string | null;
};

export type EnglishLiteratureValidationPrimaryChain = {
	id: string;
	status?: string | null;
	needsHumanReview?: boolean | number | null;
	linkNeedsHumanReview?: boolean | number | null;
	stepCount?: number | null;
};

export type EnglishLiteratureValidationRouteProbe = {
	checked: boolean;
	available: boolean;
	status?: number | null;
	location?: string | null;
	stepStatus?: number | null;
};

export type EnglishLiteratureValidationCandidate = {
	questionId: string;
	sourceDocumentId: string;
	sourceQuestionRef: string;
	promptText: string;
	contextText?: string | null;
	selfContainedPromptText?: string | null;
	selfContainmentJson?: string | null;
	status?: string | null;
	needsHumanReview?: boolean | number | null;
	board?: string | null;
	subject?: string | null;
	paper?: string | null;
	series?: string | null;
	topic?: string | null;
	metadataJson?: string | null;
	renderingOverlay?: unknown;
	overlayId?: string | null;
	overlayNeedsHumanReview?: boolean | number | null;
	assets?: EnglishLiteratureValidationAsset[] | null;
	markSchemeItems?: EnglishLiteratureValidationMarkItem[] | null;
	checklistItems?: EnglishLiteratureValidationChecklistItem[] | null;
	modelAnswers?: EnglishLiteratureValidationModelAnswer[] | null;
	primaryChain?: EnglishLiteratureValidationPrimaryChain | null;
	routeProbe?: EnglishLiteratureValidationRouteProbe | null;
};

export type EnglishLiteratureValidationCandidateAudit = {
	questionId: string;
	taskKind: EnglishLiteratureValidationTaskKind;
	sourceDocumentId: string;
	sourceQuestionRef: string;
	paper: string | null;
	series: string | null;
	topic: string | null;
	requiresSourceContext: boolean;
	hasSourceContext: boolean;
	sourceAssets: EnglishLiteratureValidationAsset[];
	selfContainmentEvidence: {
		status: string | null;
		requiredSourceCount: number | null;
		requiredAssetLabels: string[];
	};
	importedMarkSchemeItems: EnglishLiteratureValidationMarkItem[];
	rawMarkSchemeItemIds: string[];
	rawMarkSchemeItems: EnglishLiteratureValidationMarkItem[];
	checklistItemIds: string[];
	checklistItems: EnglishLiteratureValidationChecklistItem[];
	modelAnswerId: string | null;
	modelAnswer: EnglishLiteratureValidationModelAnswer | null;
	primaryChainId: string | null;
	examinerGuidanceEvidence: EnglishLiteratureValidationExaminerGuidanceEvidence[];
	blockingIssues: string[];
	warnings: string[];
};

export type EnglishLiteratureValidationPlan = {
	schemaVersion: 'english-literature-practice-validation-plan-v2';
	status: 'blocked' | 'route_probe_pending' | 'ready_for_browser_execution';
	requirements: ReturnType<typeof validationRequirements>;
	coverage: Array<{
		taskKind: EnglishLiteratureValidationTaskKind;
		candidateCount: number;
		eligibleCount: number;
		requiredCount: number;
		selectedCount: number;
		shortfall: number;
	}>;
	selectedQuestions: EnglishLiteratureValidationCandidateAudit[];
	blockedCandidates: EnglishLiteratureValidationCandidateAudit[];
	blockers: string[];
	execution: ReturnType<typeof buildExecutionMatrix>;
};

type JsonRecord = Record<string, unknown>;

const POSITIVE_MARK_ITEM_TYPES = new Set([
	'answer',
	'alternative_marking_point',
	'indicative_content',
	'level_descriptor',
	'mark',
	'marking_point',
	'working'
]);

const RAW_SOURCE_REF_REJECTION =
	/^(?:guided[- ]rubric|generated|inferred|synthetic|seeded|placeholder)|\b(?:guided[- ]rubric|synthetic rubric)\b/i;

function normalized(value: unknown): string {
	return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function truthyFlag(value: unknown): boolean {
	return value === true || value === 1 || value === '1';
}

function parseRecord(value: string | null | undefined): JsonRecord {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as JsonRecord)
			: {};
	} catch {
		return {};
	}
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.map((item) => normalized(String(item))).filter(Boolean))];
}

function integerMetadata(record: JsonRecord, ...keys: string[]): number | null {
	for (const key of keys) {
		const value = Number(record[key]);
		if (Number.isInteger(value) && value >= 0) return value;
	}
	return null;
}

function metadataBoolean(record: JsonRecord, ...keys: string[]): boolean {
	return keys.some((key) => record[key] === true);
}

function metadataLabels(record: JsonRecord): string[] {
	return stringArray(record.required_asset_labels ?? record.requiredAssetLabels);
}

export function classifyEnglishLiteratureValidationTask({
	subject,
	promptText,
	contextText,
	paper
}: {
	subject?: string | null;
	promptText: string;
	contextText?: string | null;
	paper?: string | null;
}): EnglishSourceTaskKind {
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
	const asksJudgement = /\bhow far\b|\bto what extent\b|\bdo you agree\b/.test(prompt);

	if (isComparison && isPoetry) return 'poetry-comparison';
	if (isComparison && hasPrintedExtract) return 'extract-comparison';
	if (hasPrintedExtract && asksElsewhere) return 'extract-and-wider';
	if (asksJudgement) return 'whole-text-judgement';
	return 'single-text-analysis';
}

export function learnerFacingEnglishModelAnswer(value: string | null | undefined): string {
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

function isSubstantiveEnglishModelAnswer(value: string | null | undefined): boolean {
	const answer = learnerFacingEnglishModelAnswer(value);
	if (answer.length < 80) return false;
	if (
		/^(?:the|this|a|an)\s+(?:model\s+)?(?:answer|response|essay|candidate)\s+(?:should|would|could|may|must|needs? to|will)\b/i.test(
			answer
		) ||
		/^(?:include|use|analyse|discuss|refer to)\b/i.test(answer)
	) {
		return false;
	}
	return true;
}

function normalizedItemType(value: string): string {
	return value.toLowerCase().replace(/-/g, '_').trim();
}

function isRawPositiveMarkItem(item: EnglishLiteratureValidationMarkItem): boolean {
	const sourceRef = normalized(item.sourceRef);
	return (
		POSITIVE_MARK_ITEM_TYPES.has(normalizedItemType(item.itemType)) &&
		Boolean(sourceRef) &&
		!RAW_SOURCE_REF_REJECTION.test(sourceRef) &&
		Boolean(normalized(item.sourceDocumentId)) &&
		Boolean(normalized(item.text))
	);
}

function assetLabel(asset: EnglishLiteratureValidationAsset): string {
	return normalized(asset.sourceLabel ?? asset.altText).toLowerCase();
}

function matchingRequiredAsset(
	assets: EnglishLiteratureValidationAsset[],
	label: string
): EnglishLiteratureValidationAsset | null {
	const wanted = normalized(label).toLowerCase();
	return assets.find((asset) => assetLabel(asset) === wanted) ?? null;
}

function overlayBlocks(overlay: unknown): JsonRecord[] {
	if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) return [];
	const record = overlay as JsonRecord;
	return [record.stemBlocks, record.promptBlocks]
		.flatMap((value) => (Array.isArray(value) ? value : []))
		.filter((value): value is JsonRecord =>
			Boolean(value && typeof value === 'object' && !Array.isArray(value))
		);
}

function compactGuidanceLines(value: unknown): string[] {
	if (typeof value === 'string') return normalized(value) ? [normalized(value)] : [];
	if (Array.isArray(value)) return value.flatMap(compactGuidanceLines);
	if (!value || typeof value !== 'object') return [];
	return Object.entries(value as JsonRecord).flatMap(([key, nested]) =>
		compactGuidanceLines(nested).map((line) => `${key}: ${line}`)
	);
}

function firstNormalized(record: JsonRecord, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = normalized(record[key]);
		if (value) return value;
	}
	return null;
}

function examinerGuidanceEvidenceFromOverlay(
	overlay: unknown
): EnglishLiteratureValidationExaminerGuidanceEvidence[] {
	if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) return [];
	const metadataValue = (overlay as JsonRecord).metadata;
	if (!metadataValue || typeof metadataValue !== 'object' || Array.isArray(metadataValue))
		return [];
	const metadata = metadataValue as JsonRecord;
	const lines = compactGuidanceLines(
		metadata.examinerReportGuidance ?? metadata.examiner_report_guidance
	);
	if (lines.length === 0) return [];
	const provenanceValue =
		metadata.examinerReportProvenance ?? metadata.examiner_report_provenance ?? {};
	const provenance =
		provenanceValue && typeof provenanceValue === 'object' && !Array.isArray(provenanceValue)
			? (provenanceValue as JsonRecord)
			: {};
	return [
		{
			lines,
			sourceDocumentId:
				firstNormalized(
					provenance,
					'sourceDocumentId',
					'source_document_id',
					'documentId',
					'document_id'
				) ??
				firstNormalized(
					metadata,
					'examinerReportSourceDocumentId',
					'examiner_report_source_document_id'
				),
			sourceRef:
				firstNormalized(provenance, 'sourceRef', 'source_ref', 'locator') ??
				firstNormalized(metadata, 'examinerReportSourceRef', 'examiner_report_source_ref')
		}
	];
}

function expectedStages(taskKind: EnglishLiteratureValidationTaskKind): string[] {
	if (taskKind === 'extract-and-wider') {
		return ['task', 'evidence', 'method', 'wider', 'full-answer'];
	}
	return ['task', 'evidence', 'method', 'develop', 'full-answer'];
}

function requiredSourceCount(value: string | null | undefined): number | null {
	return integerMetadata(parseRecord(value), 'required_source_count', 'requiredSourceCount');
}

function requiredSourceLabels(value: string | null | undefined): string[] {
	return metadataLabels(parseRecord(value));
}

function strictSourceIssues(
	candidate: EnglishLiteratureValidationCandidate,
	taskKind: EnglishLiteratureValidationTaskKind,
	requiresSourceContext: boolean
): string[] {
	if (!requiresSourceContext) return [];
	const issues: string[] = [];
	const metadata = parseRecord(candidate.selfContainmentJson);
	const status = normalized(metadata.status).toLowerCase().replace(/-/g, '_');
	const requiredSourceCount = integerMetadata(
		metadata,
		'required_source_count',
		'requiredSourceCount'
	);
	const completeBundle = metadataBoolean(
		metadata,
		'complete_source_bundle',
		'completeSourceBundle',
		'source_bundle_complete',
		'sourceBundleComplete'
	);
	const labels = metadataLabels(metadata);
	const assets = candidate.assets ?? [];
	const blocks = overlayBlocks(candidate.renderingOverlay);
	const visibleFigureIds = new Set(
		blocks
			.filter((block) => normalized(block.kind).toLowerCase() === 'figure')
			.map((block) => normalized(block.assetId))
			.filter(Boolean)
	);

	if (status !== 'source_complete') issues.push('self_containment_status_not_source_complete');
	if (!requiredSourceCount || requiredSourceCount < 1) {
		issues.push('required_source_count_missing');
	}
	if (taskKind === 'extract-comparison' && requiredSourceCount !== 2) {
		issues.push('two_extract_source_count_not_two');
	}
	if (taskKind === 'extract-and-wider' && requiredSourceCount !== 1) {
		issues.push('extract_and_wider_source_count_not_one');
	}
	if (taskKind === 'poetry-comparison' && requiredSourceCount !== 1 && requiredSourceCount !== 2) {
		issues.push('poetry_source_count_not_explicit');
	}
	if (labels.length === 0) issues.push('required_source_labels_missing');
	if (
		requiredSourceCount &&
		labels.length < requiredSourceCount &&
		!(labels.length === 1 && completeBundle)
	) {
		issues.push('required_source_label_count_mismatch');
	}

	const matchedAssets = labels
		.map((label) => matchingRequiredAsset(assets, label))
		.filter((asset): asset is EnglishLiteratureValidationAsset => Boolean(asset));
	if (matchedAssets.length !== labels.length) issues.push('required_source_asset_missing');
	for (const asset of matchedAssets) {
		if (!normalized(asset.id)) issues.push('source_asset_id_missing');
		if (!normalized(asset.publicPath)) issues.push('source_asset_public_path_missing');
		if (!normalized(asset.sourceLabel)) issues.push('source_asset_label_missing');
		if (!truthyFlag(asset.required)) issues.push('source_asset_not_required');
		if (truthyFlag(asset.needsHumanReview)) issues.push('source_asset_needs_review');
		if (!visibleFigureIds.has(normalized(asset.id))) issues.push('source_asset_hidden_by_overlay');
	}

	const presentSourceCount =
		requiredSourceCount && completeBundle && matchedAssets.length === 1
			? requiredSourceCount
			: matchedAssets.length;
	if (requiredSourceCount !== null && presentSourceCount !== requiredSourceCount) {
		issues.push('present_source_count_mismatch');
	}
	return [...new Set(issues)];
}

export function auditEnglishLiteratureValidationCandidate(
	candidate: EnglishLiteratureValidationCandidate
): EnglishLiteratureValidationCandidateAudit {
	const classified = classifyEnglishLiteratureValidationTask({
		subject: candidate.subject,
		promptText: candidate.promptText,
		contextText: candidate.contextText,
		paper: candidate.paper
	});
	if (classified === 'other') {
		throw new Error(`${candidate.questionId} is not an English Literature task.`);
	}
	const taskKind = classified as EnglishLiteratureValidationTaskKind;
	const blockingIssues: string[] = [];
	const warnings: string[] = [];
	if (normalized(candidate.status).toLowerCase() !== 'published') {
		blockingIssues.push('question_not_published');
	}
	if (truthyFlag(candidate.needsHumanReview)) blockingIssues.push('question_needs_review');
	if (!normalized(candidate.overlayId)) blockingIssues.push('reviewed_overlay_missing');
	if (truthyFlag(candidate.overlayNeedsHumanReview)) blockingIssues.push('overlay_needs_review');

	const eligibility = englishPracticeEligibility({
		subject: candidate.subject,
		prompt: candidate.promptText,
		context: candidate.contextText,
		selfContainedPrompt: candidate.selfContainedPromptText,
		selfContainmentJson: candidate.selfContainmentJson,
		assets: candidate.assets,
		renderingOverlay: candidate.renderingOverlay,
		taskKind,
		reviewed:
			!truthyFlag(candidate.needsHumanReview) && !truthyFlag(candidate.overlayNeedsHumanReview)
	});
	if (!eligibility.available) blockingIssues.push('runtime_practice_source_gate_failed');
	blockingIssues.push(
		...strictSourceIssues(candidate, taskKind, eligibility.requiresSourceContext)
	);

	const rawMarkItems = (candidate.markSchemeItems ?? []).filter(isRawPositiveMarkItem);
	if (rawMarkItems.length === 0) blockingIssues.push('raw_mark_scheme_evidence_missing');
	const rawMarkIds = new Set(rawMarkItems.map((item) => item.id));
	const checklistItems = candidate.checklistItems ?? [];
	if (checklistItems.length === 0) blockingIssues.push('reviewed_checklist_missing');
	for (const item of checklistItems) {
		if (truthyFlag(item.needsHumanReview)) blockingIssues.push('checklist_item_needs_review');
		if (!normalized(item.text)) blockingIssues.push('checklist_item_text_missing');
		const links = item.markSchemeItemIds ?? [];
		if (links.length === 0 || !links.some((id) => rawMarkIds.has(id))) {
			blockingIssues.push('checklist_not_grounded_in_raw_mark_row');
		}
	}

	const modelAnswer = (candidate.modelAnswers ?? []).find((answer) => {
		if (truthyFlag(answer.needsHumanReview)) return false;
		if (!isSubstantiveEnglishModelAnswer(answer.answerText)) return false;
		if (
			!['source', 'generated_from_mark_scheme', 'human_reviewed'].includes(
				normalized(answer.derivation).toLowerCase()
			)
		) {
			return false;
		}
		const support = answer.supportingMarkSchemeItemIds ?? [];
		return support.length > 0 && support.every((id) => rawMarkIds.has(id));
	});
	if (!modelAnswer) blockingIssues.push('reviewed_source_grounded_model_answer_missing');

	const examinerGuidanceEvidence = examinerGuidanceEvidenceFromOverlay(candidate.renderingOverlay);
	for (const evidence of examinerGuidanceEvidence) {
		if (!evidence.sourceDocumentId || !evidence.sourceRef) {
			blockingIssues.push('examiner_guidance_provenance_missing');
		}
	}

	const primaryChain = candidate.primaryChain;
	if (!primaryChain) {
		blockingIssues.push('primary_chain_missing');
	} else {
		if (!['published', 'reviewed'].includes(normalized(primaryChain.status).toLowerCase())) {
			blockingIssues.push('primary_chain_not_reviewed_or_published');
		}
		if (
			truthyFlag(primaryChain.needsHumanReview) ||
			truthyFlag(primaryChain.linkNeedsHumanReview)
		) {
			blockingIssues.push('primary_chain_needs_review');
		}
		if (!primaryChain.stepCount || primaryChain.stepCount < 1) {
			blockingIssues.push('primary_chain_steps_missing');
		}
	}

	if (!candidate.routeProbe?.checked) {
		warnings.push('practice_route_not_probed');
	} else if (!candidate.routeProbe.available) {
		blockingIssues.push('practice_route_unavailable');
	}

	return {
		questionId: candidate.questionId,
		taskKind,
		sourceDocumentId: candidate.sourceDocumentId,
		sourceQuestionRef: candidate.sourceQuestionRef,
		paper: normalized(candidate.paper) || null,
		series: normalized(candidate.series) || null,
		topic: normalized(candidate.topic) || null,
		requiresSourceContext: eligibility.requiresSourceContext,
		hasSourceContext: eligibility.hasSourceContext,
		sourceAssets: (candidate.assets ?? [])
			.filter((asset) => truthyFlag(asset.required))
			.map((asset) => ({ ...asset })),
		selfContainmentEvidence: {
			status: normalized(parseRecord(candidate.selfContainmentJson).status) || null,
			requiredSourceCount: requiredSourceCount(candidate.selfContainmentJson),
			requiredAssetLabels: requiredSourceLabels(candidate.selfContainmentJson)
		},
		importedMarkSchemeItems: (candidate.markSchemeItems ?? []).map((item) => ({ ...item })),
		rawMarkSchemeItemIds: rawMarkItems.map((item) => item.id),
		rawMarkSchemeItems: rawMarkItems.map((item) => ({ ...item })),
		checklistItemIds: checklistItems.map((item) => item.id),
		checklistItems: checklistItems.map((item) => ({
			...item,
			markSchemeItemIds: [...(item.markSchemeItemIds ?? [])]
		})),
		modelAnswerId: modelAnswer?.id ?? null,
		modelAnswer: modelAnswer
			? {
					...modelAnswer,
					supportingMarkSchemeItemIds: [...(modelAnswer.supportingMarkSchemeItemIds ?? [])]
				}
			: null,
		primaryChainId: primaryChain?.id ?? null,
		examinerGuidanceEvidence,
		blockingIssues: [...new Set(blockingIssues)],
		warnings: [...new Set(warnings)]
	};
}

function validationRequirements() {
	return {
		learnerProfile: 'Capable GCSE Grade 5-6 learner aiming for Grades 8-9',
		minimumQuestionCount: 10,
		minimumQuestionsPerTaskKind: 2,
		taskKinds: [...ENGLISH_LITERATURE_VALIDATION_TASK_KINDS],
		runtimeSourceStatusContract:
			'source-dependent practice eligibility must require self_containment_json.status=source_complete after the replacement migration sequence',
		inputProfiles: [
			'blank',
			'irrelevant',
			'plausible-but-vague',
			'partially-successful',
			'feedback-driven-retry',
			'secure'
		],
		replayCountPerTaskKind: 4,
		viewports: [
			{ id: 'mobile', width: 390, height: 844 },
			{ id: 'desktop', width: 1440, height: 900 }
		],
		themes: ['light', 'dark'],
		browserChecks: [
			'later stages remain locked before the active step passes',
			'passed stages remain reviewable',
			'editing an earlier answer invalidates downstream passes',
			'reset clears the staged attempt',
			'direct practice URL redirects to the task stage'
		],
		groundingChecks: [
			'feedback cites learner text',
			'every configured success criterion is checked independently',
			'only the missing move is taught',
			'a repaired weakness is acknowledged on retry',
			'indicative content is treated as optional examples',
			'quotations are neither invented nor silently corrected',
			'examiner guidance is used only when imported for the exact question'
		]
	};
}

function selectWithDiversity(
	rows: EnglishLiteratureValidationCandidateAudit[],
	count: number
): EnglishLiteratureValidationCandidateAudit[] {
	const remaining = [...rows].sort((left, right) =>
		left.questionId.localeCompare(right.questionId)
	);
	const selected: EnglishLiteratureValidationCandidateAudit[] = [];
	while (selected.length < count && remaining.length > 0) {
		const sourceIds = new Set(selected.map((row) => row.sourceDocumentId));
		const papers = new Set(selected.map((row) => row.paper).filter(Boolean));
		const topics = new Set(selected.map((row) => row.topic).filter(Boolean));
		remaining.sort((left, right) => {
			const score = (row: EnglishLiteratureValidationCandidateAudit) =>
				(sourceIds.has(row.sourceDocumentId) ? 0 : 100) +
				(row.paper && !papers.has(row.paper) ? 20 : 0) +
				(row.topic && !topics.has(row.topic) ? 5 : 0) +
				(row.warnings.length === 0 ? 1 : 0);
			return score(right) - score(left) || left.questionId.localeCompare(right.questionId);
		});
		selected.push(remaining.shift()!);
	}
	return selected;
}

function buildExecutionMatrix(selected: EnglishLiteratureValidationCandidateAudit[]) {
	const byTask = new Map(
		ENGLISH_LITERATURE_VALIDATION_TASK_KINDS.map((kind) => [
			kind,
			selected.filter((row) => row.taskKind === kind)
		])
	);
	const representative = (kind: EnglishLiteratureValidationTaskKind) => byTask.get(kind)?.[0];
	const partial = representative('whole-text-judgement');
	const scenarios = [
		{ id: 'input-blank', profile: 'blank', taskKind: 'poetry-comparison' },
		{ id: 'input-irrelevant', profile: 'irrelevant', taskKind: 'extract-comparison' },
		{
			id: 'input-vague',
			profile: 'plausible-but-vague',
			taskKind: 'extract-and-wider'
		},
		{
			id: 'input-partial',
			profile: 'partially-successful',
			taskKind: 'whole-text-judgement'
		},
		{
			id: 'input-retry',
			profile: 'feedback-driven-retry',
			taskKind: 'whole-text-judgement',
			priorScenarioId: 'input-partial'
		},
		{ id: 'input-secure', profile: 'secure', taskKind: 'single-text-analysis' }
	].map((scenario) => ({
		...scenario,
		questionId:
			scenario.id === 'input-retry'
				? (partial?.questionId ?? null)
				: (representative(scenario.taskKind as EnglishLiteratureValidationTaskKind)?.questionId ??
					null),
		stageId: 'task',
		exactInput: null as string | null,
		result: {
			submissionOutcome: null as 'client-blocked' | 'graded' | null,
			modelCallObserved: null as boolean | null,
			checkControlDisabled: null as boolean | null,
			decision: null as 'pass' | 'revise' | null,
			checks: [] as Array<{
				id: string;
				status: 'met' | 'not_yet';
				feedback: string;
				learnerEvidence: string;
			}>,
			nextImprovement: null as string | null,
			coachingNote: null as string | null,
			activeStageAfter: null as string | null,
			unlockedStageIds: [] as string[],
			feedbackCitesLearnerText: null as boolean | null,
			isolatesOnlyMissingMove: null as boolean | null,
			movedGoalposts: null as boolean | null,
			acknowledgedRepairedWeakness: null as boolean | null
		}
	}));

	const replays = ENGLISH_LITERATURE_VALIDATION_TASK_KINDS.flatMap((taskKind) =>
		Array.from({ length: 4 }, (_, index) => ({
			groupId: `replay-${taskKind}`,
			variant: index + 1,
			taskKind,
			questionId: representative(taskKind)?.questionId ?? null,
			stageId: 'task',
			exactInput: null as string | null,
			decision: null as 'pass' | 'revise' | null,
			missingSkill: null as string | null,
			passThreshold: null as string | null,
			nextAction: null as string | null
		}))
	);

	const layouts = selected.flatMap((question) =>
		['mobile', 'desktop'].flatMap((viewport) =>
			['light', 'dark'].map((theme) => ({
				questionId: question.questionId,
				taskKind: question.taskKind,
				viewport,
				theme,
				sourceReadable: null as boolean | null,
				noClipping: null as boolean | null,
				noOverflow: null as boolean | null,
				stableHeight: null as boolean | null,
				feedbackReadable: null as boolean | null,
				screenshot: null as string | null,
				notes: null as string | null
			}))
		)
	);

	return {
		questionAudits: selected.map((question) => ({
			questionId: question.questionId,
			taskKind: question.taskKind,
			stageContract: expectedStages(question.taskKind).map((stageId) => ({
				stageId,
				observedTitle: null as string | null,
				observedGoal: null as string | null,
				observedSuccessCriteria: [] as Array<{
					id: string;
					label: string;
					description: string;
				}>,
				observedHints: [] as Array<{ title: string; text: string }>,
				criterionChecks: [] as Array<{
					criterionId: string;
					probeInput: string;
					observedStatus: 'met' | 'not_yet';
					feedback: string;
					learnerEvidence: string;
					independentlyVerified: boolean;
				}>,
				fitsExactQuestion: null as boolean | null,
				notes: null as string | null
			})),
			sourceGrounding: {
				sourceAssets: question.sourceAssets,
				selfContainmentEvidence: question.selfContainmentEvidence,
				rawMarkSchemeItemIds: question.rawMarkSchemeItemIds,
				importedMarkSchemeItems: question.importedMarkSchemeItems,
				rawMarkSchemeItems: question.rawMarkSchemeItems,
				checklistItemIds: question.checklistItemIds,
				checklistItems: question.checklistItems,
				modelAnswerId: question.modelAnswerId,
				modelAnswer: question.modelAnswer,
				primaryChainId: question.primaryChainId,
				examinerGuidanceEvidence: question.examinerGuidanceEvidence,
				examinerGuidanceObserved: null as boolean | null,
				runtimeMarkRowsMatch: null as boolean | null,
				runtimeSourceAssetsMatch: null as boolean | null,
				runtimeExaminerGuidanceMatches: null as boolean | null,
				runtimeModelAnswerMatches: null as boolean | null,
				verified: null as boolean | null
			},
			navigation: {
				directPracticeRedirectsToTask: null as boolean | null,
				laterStageLockedBeforePass: null as boolean | null,
				passedStageReviewable: null as boolean | null,
				editingEarlierStageInvalidatesDownstream: null as boolean | null,
				resetClearsAttempt: null as boolean | null,
				notes: null as string | null
			}
		})),
		scenarios,
		replays,
		layouts,
		releaseDecision: {
			status: null as 'passed' | 'failed' | null,
			blockingFindings: [],
			notes: null as string | null
		}
	};
}

export function buildEnglishLiteraturePracticeValidationPlan(
	candidates: EnglishLiteratureValidationCandidate[],
	options: { minimumQuestionsPerTaskKind?: number } = {}
): EnglishLiteratureValidationPlan {
	const minimumQuestionsPerTaskKind = options.minimumQuestionsPerTaskKind ?? 2;
	const audits = candidates.map(auditEnglishLiteratureValidationCandidate);
	const eligible = audits.filter((row) => row.blockingIssues.length === 0);
	const selectedQuestions = ENGLISH_LITERATURE_VALIDATION_TASK_KINDS.flatMap((taskKind) =>
		selectWithDiversity(
			eligible.filter((row) => row.taskKind === taskKind),
			minimumQuestionsPerTaskKind
		)
	);
	const coverage = ENGLISH_LITERATURE_VALIDATION_TASK_KINDS.map((taskKind) => {
		const selectedCount = selectedQuestions.filter((row) => row.taskKind === taskKind).length;
		return {
			taskKind,
			candidateCount: audits.filter((row) => row.taskKind === taskKind).length,
			eligibleCount: eligible.filter((row) => row.taskKind === taskKind).length,
			requiredCount: minimumQuestionsPerTaskKind,
			selectedCount,
			shortfall: Math.max(0, minimumQuestionsPerTaskKind - selectedCount)
		};
	});
	const blockers = coverage
		.filter((row) => row.shortfall > 0)
		.map(
			(row) =>
				`${row.taskKind} has ${row.eligibleCount} eligible question(s); ${row.requiredCount} required.`
		);
	const uniqueSourceDocuments = new Set(selectedQuestions.map((row) => row.sourceDocumentId));
	if (selectedQuestions.length >= 10 && uniqueSourceDocuments.size < 2) {
		blockers.push('The selected set does not span at least two source papers.');
	}
	const routeProbePending = selectedQuestions.some((row) =>
		row.warnings.includes('practice_route_not_probed')
	);
	const status =
		blockers.length > 0
			? 'blocked'
			: routeProbePending
				? 'route_probe_pending'
				: 'ready_for_browser_execution';

	return {
		schemaVersion: 'english-literature-practice-validation-plan-v2',
		status,
		requirements: {
			...validationRequirements(),
			minimumQuestionCount:
				minimumQuestionsPerTaskKind * ENGLISH_LITERATURE_VALIDATION_TASK_KINDS.length,
			minimumQuestionsPerTaskKind
		},
		coverage,
		selectedQuestions,
		blockedCandidates: audits.filter((row) => row.blockingIssues.length > 0),
		blockers,
		execution: buildExecutionMatrix(selectedQuestions)
	};
}

export function validateCompletedEnglishLiteraturePracticeEvidence(
	plan: EnglishLiteratureValidationPlan
): string[] {
	const issues: string[] = [];
	if (plan.status !== 'ready_for_browser_execution') {
		issues.push('selection_plan_not_ready_for_browser_execution');
	}
	for (const audit of plan.execution.questionAudits) {
		for (const stage of audit.stageContract) {
			if (!normalized(stage.observedTitle))
				issues.push(`${audit.questionId}:${stage.stageId}:title_missing`);
			if (!normalized(stage.observedGoal))
				issues.push(`${audit.questionId}:${stage.stageId}:goal_missing`);
			if (stage.observedSuccessCriteria.length === 0) {
				issues.push(`${audit.questionId}:${stage.stageId}:criteria_missing`);
			}
			if (stage.observedHints.length === 0)
				issues.push(`${audit.questionId}:${stage.stageId}:hints_missing`);
			if (stage.fitsExactQuestion !== true) {
				issues.push(`${audit.questionId}:${stage.stageId}:question_fit_not_confirmed`);
			}
			const criterionIds = new Set(stage.observedSuccessCriteria.map((criterion) => criterion.id));
			const checkedCriterionIds = new Set(stage.criterionChecks.map((check) => check.criterionId));
			for (const criterionId of criterionIds) {
				if (!checkedCriterionIds.has(criterionId)) {
					issues.push(
						`${audit.questionId}:${stage.stageId}:${criterionId}:independent_check_missing`
					);
				}
			}
			for (const check of stage.criterionChecks) {
				if (!criterionIds.has(check.criterionId)) {
					issues.push(
						`${audit.questionId}:${stage.stageId}:${check.criterionId}:unknown_criterion`
					);
				}
				if (!normalized(check.probeInput)) {
					issues.push(
						`${audit.questionId}:${stage.stageId}:${check.criterionId}:probe_input_missing`
					);
				}
				if (!normalized(check.feedback) || !normalized(check.learnerEvidence)) {
					issues.push(
						`${audit.questionId}:${stage.stageId}:${check.criterionId}:probe_evidence_missing`
					);
				}
				if (check.independentlyVerified !== true) {
					issues.push(`${audit.questionId}:${stage.stageId}:${check.criterionId}:not_verified`);
				}
			}
		}
		if (audit.sourceGrounding.verified !== true) {
			issues.push(`${audit.questionId}:source_grounding_not_verified`);
		}
		for (const key of [
			'runtimeMarkRowsMatch',
			'runtimeSourceAssetsMatch',
			'runtimeExaminerGuidanceMatches',
			'runtimeModelAnswerMatches'
		] as const) {
			if (audit.sourceGrounding[key] !== true) {
				issues.push(`${audit.questionId}:source_grounding:${key}`);
			}
		}
		for (const evidence of audit.sourceGrounding.examinerGuidanceEvidence) {
			if (!evidence.sourceDocumentId || !evidence.sourceRef || evidence.lines.length === 0) {
				issues.push(`${audit.questionId}:examiner_guidance_provenance_incomplete`);
			}
		}
		for (const [key, value] of Object.entries(audit.navigation)) {
			if (key !== 'notes' && value !== true) issues.push(`${audit.questionId}:navigation:${key}`);
		}
	}
	for (const scenario of plan.execution.scenarios) {
		if (typeof scenario.exactInput !== 'string') issues.push(`${scenario.id}:exact_input_missing`);
		if (scenario.profile !== 'blank' && !normalized(scenario.exactInput)) {
			issues.push(`${scenario.id}:exact_input_missing`);
		}
		if (scenario.profile === 'blank') {
			if (scenario.exactInput !== '') issues.push(`${scenario.id}:blank_input_not_empty`);
			if (scenario.result.submissionOutcome !== 'client-blocked') {
				issues.push(`${scenario.id}:blank_input_not_client_blocked`);
			}
			if (scenario.result.modelCallObserved !== false) {
				issues.push(`${scenario.id}:blank_input_triggered_or_did_not_audit_model_call`);
			}
			if (scenario.result.checkControlDisabled !== true) {
				issues.push(`${scenario.id}:blank_check_control_not_disabled`);
			}
			if (scenario.result.decision || scenario.result.checks.length > 0) {
				issues.push(`${scenario.id}:blank_input_has_fabricated_grading_result`);
			}
			if (scenario.result.activeStageAfter !== scenario.stageId) {
				issues.push(`${scenario.id}:blank_input_changed_active_stage`);
			}
			continue;
		}
		if (scenario.result.submissionOutcome !== 'graded') {
			issues.push(`${scenario.id}:graded_submission_not_observed`);
		}
		if (scenario.result.modelCallObserved !== true) {
			issues.push(`${scenario.id}:model_call_not_observed`);
		}
		if (!scenario.result.decision) issues.push(`${scenario.id}:decision_missing`);
		if (scenario.result.checks.length === 0) issues.push(`${scenario.id}:checks_missing`);
		const questionAudit = plan.execution.questionAudits.find(
			(audit) => audit.questionId === scenario.questionId
		);
		const stageAudit = questionAudit?.stageContract.find(
			(stage) => stage.stageId === scenario.stageId
		);
		const expectedCriterionIds = new Set(
			stageAudit?.observedSuccessCriteria.map((criterion) => criterion.id) ?? []
		);
		const actualCriterionIds = new Set(scenario.result.checks.map((check) => check.id));
		for (const criterionId of expectedCriterionIds) {
			if (!actualCriterionIds.has(criterionId)) {
				issues.push(`${scenario.id}:${criterionId}:configured_check_missing`);
			}
		}
		for (const criterionId of actualCriterionIds) {
			if (!expectedCriterionIds.has(criterionId)) {
				issues.push(`${scenario.id}:${criterionId}:unexpected_check`);
			}
		}
		for (const check of scenario.result.checks) {
			if (!normalized(check.feedback) || !normalized(check.learnerEvidence)) {
				issues.push(`${scenario.id}:${check.id}:check_evidence_missing`);
			}
		}
		if (!normalized(scenario.result.nextImprovement)) {
			issues.push(`${scenario.id}:next_improvement_missing`);
		}
		if (!normalized(scenario.result.coachingNote)) {
			issues.push(`${scenario.id}:coaching_note_missing`);
		}
		if (!normalized(scenario.result.activeStageAfter)) {
			issues.push(`${scenario.id}:active_stage_after_missing`);
		}
		if (scenario.result.feedbackCitesLearnerText !== true) {
			issues.push(`${scenario.id}:feedback_does_not_cite_learner_text`);
		}
		if (scenario.result.isolatesOnlyMissingMove !== true) {
			issues.push(`${scenario.id}:feedback_does_not_isolate_missing_move`);
		}
		if (scenario.result.movedGoalposts !== false) {
			issues.push(`${scenario.id}:goalposts_changed_or_not_checked`);
		}
		if (
			scenario.profile === 'feedback-driven-retry' &&
			scenario.result.acknowledgedRepairedWeakness !== true
		) {
			issues.push(`${scenario.id}:repaired_weakness_not_acknowledged`);
		}
		if (
			['irrelevant', 'plausible-but-vague', 'partially-successful'].includes(scenario.profile) &&
			scenario.result.decision !== 'revise'
		) {
			issues.push(`${scenario.id}:unexpected_non_revise_decision`);
		}
		if (scenario.profile === 'secure' && scenario.result.decision !== 'pass') {
			issues.push(`${scenario.id}:secure_input_did_not_pass`);
		}
		if (
			scenario.result.decision === 'pass' &&
			!scenario.result.unlockedStageIds.some((stageId) => stageId !== scenario.stageId)
		) {
			issues.push(`${scenario.id}:pass_did_not_unlock_next_stage`);
		}
	}
	for (const replay of plan.execution.replays) {
		if (!normalized(replay.exactInput))
			issues.push(`${replay.groupId}:${replay.variant}:input_missing`);
		for (const key of ['decision', 'missingSkill', 'passThreshold', 'nextAction'] as const) {
			if (!normalized(replay[key]))
				issues.push(`${replay.groupId}:${replay.variant}:${key}_missing`);
		}
	}
	for (const taskKind of ENGLISH_LITERATURE_VALIDATION_TASK_KINDS) {
		const rows = plan.execution.replays.filter((row) => row.taskKind === taskKind);
		if (rows.length !== 4) issues.push(`replay-${taskKind}:expected_four_variants`);
		for (const key of ['missingSkill', 'passThreshold', 'nextAction'] as const) {
			const values = new Set(rows.map((row) => normalized(row[key])).filter(Boolean));
			if (values.size > 1) issues.push(`replay-${taskKind}:${key}_inconsistent`);
		}
	}
	for (const layout of plan.execution.layouts) {
		for (const key of [
			'sourceReadable',
			'noClipping',
			'noOverflow',
			'stableHeight',
			'feedbackReadable'
		] as const) {
			if (layout[key] !== true) {
				issues.push(`${layout.questionId}:${layout.viewport}:${layout.theme}:${key}`);
			}
		}
		if (!normalized(layout.screenshot)) {
			issues.push(`${layout.questionId}:${layout.viewport}:${layout.theme}:screenshot_missing`);
		}
	}
	if (plan.execution.releaseDecision.status !== 'passed') {
		issues.push('release_decision_not_passed');
	}
	if (plan.execution.releaseDecision.blockingFindings.length > 0) {
		issues.push('release_decision_has_blocking_findings');
	}
	return [...new Set(issues)];
}
