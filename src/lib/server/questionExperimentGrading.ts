import { env } from '$env/dynamic/private';
import {
	configureLlmProcessEnv,
	QuestionGradeRuntimeError,
	type GradeStreamDelta
} from '$lib/server/answerGrading';
import { queryRows } from '$lib/server/db';
import { sourceDocumentIdForSlug } from '$lib/server/questionExperimentData';
import type {
	ExperimentGradeResponse,
	ExperimentGradeVerdict,
	ExperimentQuestionGradeResult
} from '$lib/experiments/questions/gradingTypes';
import type { LlmTextModelId, LlmThinkingLevel } from '@ljoukov/llm';

const DEFAULT_MODEL = 'chatgpt-gpt-5.3-codex-spark';
const DEFAULT_THINKING_LEVEL = 'medium';
const CHATGPT_CODEX_PROXY_URL = 'CHATGPT_CODEX_PROXY_URL';
const CHATGPT_CODEX_PROXY_API_KEY = 'CHATGPT_CODEX_PROXY_API_KEY';
const DETERMINISTIC_WARNING =
	'Checked deterministically from the imported response answer key; no LLM was used.';

type QuestionRow = {
	id: string;
	source_question_ref: string;
	parent_source_question_ref: string | null;
	display_order: number;
	prompt_text: string;
	self_contained_prompt_text: string | null;
	context_text: string | null;
	command_word: string | null;
	marks: number | null;
	board: string | null;
	qualification: string | null;
	subject: string | null;
	subject_area: string | null;
	tier: string | null;
	paper: string | null;
	series: string | null;
	year: number | null;
	topic_path_json: string;
	render_json: string | null;
};

type MarkSchemeRow = {
	id: string;
	display_order: number;
	item_type: string;
	text: string;
	marks: number | null;
	source_ref: string | null;
};

type ChecklistRow = {
	id: string;
	display_order: number;
	text: string;
	required: number;
	mark_scheme_item_ids_json: string;
};

type ModelAnswerRow = {
	answer_text: string;
	confidence: number | null;
};

type ChainRow = {
	id: string;
	title: string;
	canonical_chain_text: string;
	summary: string | null;
	fit_notes: string | null;
};

type ChainStepRow = {
	id: string;
	display_order: number;
	step_text: string;
	step_role: string;
	explanation: string | null;
	common_omission: string | null;
	evidence_json: string;
};

type ResponseAnswerKeyRow = {
	response_kind: string;
	target_id: string;
	correct_answer: string;
	display_order: number;
	aliases_json: string;
	metadata_json: string;
};

type GradeableQuestionContext = {
	question: QuestionRow;
	response: FixedResponse | null;
	responsePromptDetails: string | null;
	answerKeys: ResponseAnswerKeyRow[];
	markScheme: MarkSchemeRow[];
	checklist: ChecklistRow[];
	modelAnswer: string | null;
	chain: {
		id: string;
		title: string;
		canonicalText: string;
		summary: string | null;
		fitNotes: string | null;
		steps: Array<{
			id: string;
			text: string;
			role: string;
			evidence: string;
			commonOmission: string | null;
		}>;
	} | null;
	gradeable: boolean;
	gradeableMarks: number;
	warnings: string[];
};

type ParsedAnswerKey = {
	targetId: string;
	correctAnswer: string;
	aliases: string[];
	metadata: Record<string, unknown>;
	displayOrder: number;
};

type FixedResponse =
	| {
			kind: 'image-label-zones';
			zones: Array<{ id: string; label: string }>;
			correctAnswers: Record<string, string>;
			answerKeys: ParsedAnswerKey[];
	  }
	| {
			kind: 'choice';
			options: string[];
			maxSelections: number;
			answerKeys: ParsedAnswerKey[];
	  }
	| {
			kind: 'choice-table';
			columns: string[];
			rows: string[][];
			answerKeys: ParsedAnswerKey[];
	  }
	| {
			kind: 'matching';
			leftTitle: string | null;
			rightTitle: string | null;
			left: string[];
			right: string[];
			answerKeys: ParsedAnswerKey[];
	  }
	| {
			kind: 'equation-blanks';
			blanks: Array<{ id: string; label: string }>;
			unorderedGroups: Array<{ targetIds: string[]; answers: string[] }>;
			answerKeys: ParsedAnswerKey[];
	  }
	| {
			kind: 'number-line';
			label: string;
			prefix: string | null;
			unit: string | null;
			answerKeys: ParsedAnswerKey[];
	  }
	| {
			kind: 'labeled-lines';
			labels: string[];
			lineCount: number | null;
			choicePrompt: string | null;
			choiceOptions: string[];
			choiceLayout: 'vertical' | 'horizontal' | null;
			answerKeys: ParsedAnswerKey[];
	  };

type ExperimentThinkingLevel = LlmThinkingLevel | 'none';

type ModelGradePayload = {
	results?: Array<{
		ref?: string;
		questionId?: string;
		result?: 'correct' | 'partial' | 'incorrect';
		awardedMarks?: number;
		confidence?: 'high' | 'medium' | 'low';
		summary?: string;
		nextStep?: string;
		checklist?: Array<{
			id?: string;
			text?: string;
			verdict?: ExperimentGradeVerdict;
			explanation?: string;
		}>;
		chainSteps?: Array<{
			id?: string;
			verdict?: ExperimentGradeVerdict;
			explanation?: string;
		}>;
	}>;
};

type GradeChecklistItem = ExperimentQuestionGradeResult['checklist'][number];

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function normalizeRef(ref: string) {
	const cleaned = ref.trim().replace(/^q/i, '');
	const [main, subpart] = cleaned.split('.');
	const paddedMain = (main ?? '').padStart(2, '0');
	return subpart ? `${paddedMain}.${subpart}` : paddedMain;
}

function gradingModel(modelOverride?: string): LlmTextModelId {
	return (modelOverride || env.EXPERIMENT_GRADING_MODEL || DEFAULT_MODEL) as LlmTextModelId;
}

function selectedThinkingLevel(
	thinkingOverride?: ExperimentThinkingLevel
): LlmThinkingLevel | undefined {
	const value = thinkingOverride || env.EXPERIMENT_GRADING_THINKING_LEVEL || DEFAULT_THINKING_LEVEL;
	return value === 'none' ? undefined : (value as LlmThinkingLevel);
}

function platformEnvValue(platformEnv: unknown, key: string): string | undefined {
	if (!platformEnv || typeof platformEnv !== 'object') return undefined;
	const value = (platformEnv as Record<string, unknown>)[key];
	return typeof value === 'string' && value.trim() ? value : undefined;
}

function hasEnvValue(platformEnv: unknown, key: string) {
	return Boolean(
		platformEnvValue(platformEnv, key) ?? env[key as keyof typeof env] ?? process.env[key]
	);
}

function assertModelCredentialsAvailable(platformEnv: unknown, model: string) {
	if (model.startsWith('gpt-')) {
		throw new Error('Use chatgpt-* models for experiment grading.');
	}

	if (model.startsWith('chatgpt-') || model.startsWith('experimental-chatgpt-')) {
		if (
			hasEnvValue(platformEnv, CHATGPT_CODEX_PROXY_URL) &&
			hasEnvValue(platformEnv, CHATGPT_CODEX_PROXY_API_KEY)
		) {
			return;
		}
		throw new Error(
			'Vercel Codex proxy credentials are required for experiment grading with ChatGPT models.'
		);
	}
}

function textLooksLikeMarkingInstructions(text: string) {
	return [
		/\bIn a list of acceptable answers\b/i,
		/\bA bold and is used\b/i,
		/\bAlternative answers acceptable\b/i,
		/\bunderlined is essential\b/i,
		/\bMarking points\b/i,
		/\bthe number of marks emboldened\b/i,
		/\bEach of the following bullet points is a potential mark\b/i
	].some((pattern) => pattern.test(text));
}

function usefulText(text: string) {
	const trimmed = text.replace(/\s+/g, ' ').trim();
	if (!trimmed) return false;
	if (textLooksLikeMarkingInstructions(trimmed)) return false;
	return true;
}

function cleanMarkText(text: string) {
	return text
		.replace(/\b\d{1,2}\.\d+\b/g, '')
		.replace(/\b\d+\b\s*(?=AO[123]\b)/gi, '')
		.replace(/\b\d+\b\s*(?=\d(?:\.\d+){2,}\b)/g, '')
		.replace(/\bAO[123]\b/gi, '')
		.replace(/\b\d(?:\.\d+){2,}\b/g, '')
		.replace(/\b\d+\s*(?=;|$)/g, '')
		.replace(/\ballow\b.*$/i, '')
		.replace(/\s+/g, ' ')
		.replace(/^[;:\-\s]+|[;:\-\s]+$/g, '')
		.trim();
}

function usefulChecklist(rows: ChecklistRow[]) {
	return rows.filter((row) => usefulText(row.text));
}

function usefulMarkScheme(rows: MarkSchemeRow[]) {
	return rows.filter((row) => usefulText(row.text));
}

function usefulModelAnswer(value: string | null) {
	if (!value) return null;
	return usefulText(value) ? value : null;
}

function imageLabelAnswerKeyForQuestion(questionId: string) {
	const keys: Record<string, Record<string, string>> = {
		'8464p1h-jun18-01-1': {
			'blank-1': 'nucleus',
			'blank-2': 'electron',
			'blank-3': 'orbit',
			'blank-4': 'atom'
		}
	};
	return keys[questionId] ?? {};
}

function choiceMaxSelections(value: Record<string, unknown>, optionCount: number) {
	const explicit = value.maxSelections;
	if (typeof explicit !== 'number' || explicit < 1) return 1;
	if (optionCount > 1 && explicit >= optionCount) return 1;
	return explicit;
}

function stringValues(value: unknown) {
	if (typeof value === 'string' || typeof value === 'number') return [String(value)];
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item) : null))
		.filter((item): item is string => Boolean(item?.trim()));
}

function cleanAnswerKeyText(value: unknown) {
	if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
	return '';
}

function parseAliases(value: unknown): string[] {
	if (typeof value === 'string') {
		return value
			.split(/\s*(?:\||;|\n)\s*/)
			.map((alias) => alias.trim())
			.filter(Boolean);
	}
	if (!Array.isArray(value)) return [];
	return value
		.map((item) =>
			typeof item === 'string' || typeof item === 'number' ? String(item).trim() : ''
		)
		.filter(Boolean);
}

function parseMetadata(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function answerKeyFromObject(
	targetId: string,
	value: Record<string, unknown>,
	displayOrder: number
): ParsedAnswerKey | null {
	const correctAnswer =
		cleanAnswerKeyText(value.correctAnswer) ||
		cleanAnswerKeyText(value.answer) ||
		cleanAnswerKeyText(value.value);
	if (!targetId.trim() || !correctAnswer) return null;
	return {
		targetId: targetId.trim(),
		correctAnswer,
		aliases: parseAliases(value.aliases),
		metadata: parseMetadata(value.metadata),
		displayOrder
	};
}

function parseCorrectAnswers(value: unknown): ParsedAnswerKey[] {
	if (!value) return [];
	if (typeof value === 'string' || typeof value === 'number') {
		const correctAnswer = String(value).trim();
		return correctAnswer
			? [{ targetId: 'answer', correctAnswer, aliases: [], metadata: {}, displayOrder: 0 }]
			: [];
	}
	if (Array.isArray(value)) {
		return value
			.map((item, index) => {
				if (typeof item === 'string' || typeof item === 'number') {
					const correctAnswer = String(item).trim();
					return correctAnswer
						? {
								targetId: index === 0 ? 'answer' : `answer-${index + 1}`,
								correctAnswer,
								aliases: [],
								metadata: {},
								displayOrder: index
							}
						: null;
				}
				if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
				const candidate = item as Record<string, unknown>;
				const targetId =
					cleanAnswerKeyText(candidate.targetId) ||
					cleanAnswerKeyText(candidate.target_id) ||
					cleanAnswerKeyText(candidate.id) ||
					(index === 0 ? 'answer' : `answer-${index + 1}`);
				return answerKeyFromObject(targetId, candidate, index);
			})
			.filter((key): key is ParsedAnswerKey => Boolean(key));
	}
	if (typeof value === 'object') {
		return Object.entries(value as Record<string, unknown>)
			.flatMap(([targetId, rawValue], index) => {
				if (targetId === 'aliases' || targetId === 'metadata') return [];
				if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
					const candidate = answerKeyFromObject(
						targetId,
						rawValue as Record<string, unknown>,
						index
					);
					return candidate ? [candidate] : [];
				}
				const answers = stringValues(rawValue);
				if (answers.length === 0) return [];
				return answers.map((correctAnswer, answerIndex) => ({
					targetId:
						answers.length === 1
							? targetId.trim()
							: `${targetId.trim() || 'answer'}-${answerIndex + 1}`,
					correctAnswer,
					aliases: [],
					metadata: {},
					displayOrder: index + answerIndex
				}));
			})
			.filter((key) => key.targetId && key.correctAnswer);
	}
	return [];
}

function answerKeyRows(rows: ResponseAnswerKeyRow[]): ParsedAnswerKey[] {
	return rows
		.map((row) => ({
			targetId: row.target_id.trim(),
			correctAnswer: row.correct_answer.trim(),
			aliases: parseJson<string[]>(row.aliases_json, []).filter(
				(alias) => typeof alias === 'string' && alias.trim()
			),
			metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
			displayOrder: row.display_order
		}))
		.filter((row) => row.targetId && row.correctAnswer);
}

function mergeAnswerKeys(...groups: ParsedAnswerKey[][]) {
	const merged = new Map<string, ParsedAnswerKey>();
	for (const key of groups.flat()) {
		const previous = merged.get(key.targetId);
		merged.set(key.targetId, {
			...key,
			aliases: Array.from(new Set([...(previous?.aliases ?? []), ...key.aliases])),
			metadata: { ...(previous?.metadata ?? {}), ...key.metadata },
			displayOrder: previous ? Math.min(previous.displayOrder, key.displayOrder) : key.displayOrder
		});
	}
	return Array.from(merged.values()).sort(
		(left, right) =>
			left.displayOrder - right.displayOrder || left.targetId.localeCompare(right.targetId)
	);
}

function equationBlankUnorderedGroups(value: unknown) {
	if (!Array.isArray(value)) return [];
	return value
		.map((group) => {
			if (!group || typeof group !== 'object') return null;
			const candidate = group as Record<string, unknown>;
			const targetIds = Array.isArray(candidate.targetIds)
				? candidate.targetIds.filter(
						(item): item is string => typeof item === 'string' && item.trim().length > 0
					)
				: [];
			const answers = Array.isArray(candidate.answers)
				? candidate.answers.filter(
						(item): item is string => typeof item === 'string' && item.trim().length > 0
					)
				: [];
			return targetIds.length >= 2 && answers.length >= 2 ? { targetIds, answers } : null;
		})
		.filter((group): group is { targetIds: string[]; answers: string[] } => Boolean(group));
}

function responseFromRenderJson(raw: string | null): FixedResponse | null {
	const render = parseJson<{ response?: unknown }>(raw, {});
	const response = render.response;
	if (!response || typeof response !== 'object') return null;
	const value = response as Record<string, unknown>;
	const answerKeys = parseCorrectAnswers(value.correctAnswers);

	if (value.kind === 'image-label-zones' && Array.isArray(value.zones)) {
		const correctAnswers =
			value.correctAnswers && typeof value.correctAnswers === 'object'
				? (value.correctAnswers as Record<string, unknown>)
				: {};
		return {
			kind: 'image-label-zones',
			correctAnswers: Object.fromEntries(
				Object.entries(correctAnswers).filter(
					(entry): entry is [string, string] =>
						typeof entry[0] === 'string' && typeof entry[1] === 'string'
				)
			),
			answerKeys,
			zones: value.zones
				.map((zone) => {
					if (!zone || typeof zone !== 'object') return null;
					const candidate = zone as Record<string, unknown>;
					return typeof candidate.id === 'string' && typeof candidate.label === 'string'
						? { id: candidate.id, label: candidate.label }
						: null;
				})
				.filter((zone): zone is { id: string; label: string } => Boolean(zone))
		};
	}

	if (value.kind === 'choice' && Array.isArray(value.options)) {
		const options = value.options.filter((option): option is string => typeof option === 'string');
		return {
			kind: 'choice',
			options,
			maxSelections: choiceMaxSelections(value, options.length),
			answerKeys
		};
	}

	if (value.kind === 'choice-table' && Array.isArray(value.columns) && Array.isArray(value.rows)) {
		return {
			kind: 'choice-table',
			columns: value.columns.filter((column): column is string => typeof column === 'string'),
			rows: value.rows
				.filter((row): row is unknown[] => Array.isArray(row))
				.map((row) => row.filter((cell): cell is string => typeof cell === 'string')),
			answerKeys
		};
	}

	if (value.kind === 'matching' && Array.isArray(value.left) && Array.isArray(value.right)) {
		return {
			kind: 'matching',
			leftTitle: typeof value.leftTitle === 'string' ? value.leftTitle : null,
			rightTitle: typeof value.rightTitle === 'string' ? value.rightTitle : null,
			left: value.left.filter((item): item is string => typeof item === 'string'),
			right: value.right.filter((item): item is string => typeof item === 'string'),
			answerKeys
		};
	}

	if (value.kind === 'equation-blanks' && Array.isArray(value.segments)) {
		return {
			kind: 'equation-blanks',
			blanks: value.segments
				.map((segment) => {
					if (!segment || typeof segment !== 'object') return null;
					const candidate = segment as Record<string, unknown>;
					return candidate.kind === 'blank' &&
						typeof candidate.id === 'string' &&
						typeof candidate.label === 'string'
						? { id: candidate.id, label: candidate.label }
						: null;
				})
				.filter((blank): blank is { id: string; label: string } => Boolean(blank)),
			unorderedGroups: equationBlankUnorderedGroups(value.unorderedGroups),
			answerKeys
		};
	}

	if (value.kind === 'number-line' && typeof value.label === 'string') {
		return {
			kind: 'number-line',
			label: value.label,
			prefix: typeof value.prefix === 'string' ? value.prefix : null,
			unit: typeof value.unit === 'string' ? value.unit : null,
			answerKeys
		};
	}

	if (value.kind === 'labeled-lines' && Array.isArray(value.labels)) {
		return {
			kind: 'labeled-lines',
			labels: value.labels.filter((label): label is string => typeof label === 'string'),
			lineCount: typeof value.lineCount === 'number' ? value.lineCount : null,
			choicePrompt: typeof value.choicePrompt === 'string' ? value.choicePrompt : null,
			choiceOptions: Array.isArray(value.choiceOptions)
				? value.choiceOptions.filter((option): option is string => typeof option === 'string')
				: [],
			choiceLayout: value.choiceLayout === 'horizontal' ? 'horizontal' : null,
			answerKeys
		};
	}

	return null;
}

function mergeResponseAnswerKey(
	questionId: string,
	response: FixedResponse | null,
	rows: ResponseAnswerKeyRow[]
): FixedResponse | null {
	if (!response) return response;
	const rowKeys = answerKeyRows(rows);
	const answerKeys = mergeAnswerKeys(response.answerKeys, rowKeys);
	if (response.kind !== 'image-label-zones') {
		return {
			...response,
			answerKeys
		};
	}
	const rowAnswers = Object.fromEntries(rowKeys.map((row) => [row.targetId, row.correctAnswer]));
	const embeddedAnswers = Object.fromEntries(
		response.answerKeys.map((row) => [row.targetId, row.correctAnswer])
	);
	return {
		...response,
		answerKeys,
		correctAnswers: {
			...imageLabelAnswerKeyForQuestion(questionId),
			...response.correctAnswers,
			...embeddedAnswers,
			...rowAnswers
		}
	};
}

function imageLabelResponseNeedsAnswerKey(response: FixedResponse | null) {
	if (response?.kind !== 'image-label-zones') return false;
	return (
		response.zones.length === 0 ||
		response.zones.some((zone) => !response.correctAnswers[zone.id]?.trim())
	);
}

function canGradeDeterministically(response: FixedResponse | null): response is FixedResponse {
	if (!response) return false;
	if (response.kind === 'image-label-zones') return !imageLabelResponseNeedsAnswerKey(response);
	return response.answerKeys.length > 0;
}

function responseNeedsDeterministicAnswerKey(response: FixedResponse | null) {
	if (!response) return false;
	if (response.kind === 'labeled-lines') return false;
	if (response.kind === 'image-label-zones') return imageLabelResponseNeedsAnswerKey(response);
	return response.answerKeys.length === 0;
}

function shouldUseLlmGrading(context: GradeableQuestionContext) {
	return (
		context.response === null ||
		(context.response.kind === 'labeled-lines' && context.response.answerKeys.length === 0)
	);
}

function responsePromptDetails(response: FixedResponse | null) {
	if (!response) return null;
	if (response.kind === 'choice') {
		return [
			response.maxSelections === 1
				? 'The learner selects one option.'
				: `The learner selects ${response.maxSelections} options.`,
			'Options:',
			...response.options.map((option) => `- ${option}`)
		]
			.filter(Boolean)
			.join('\n');
	}
	if (response.kind === 'choice-table') {
		return [
			'The learner selects one row from this table.',
			`Columns: ${response.columns.join(' | ')}`,
			'Rows:',
			...response.rows.map((row) => `- ${row.join(' | ')}`)
		].join('\n');
	}
	if (response.kind === 'matching') {
		return [
			'The learner matches items from left to right.',
			`Left${response.leftTitle ? ` (${response.leftTitle})` : ''}: ${response.left.join(' | ')}`,
			`Right${response.rightTitle ? ` (${response.rightTitle})` : ''}: ${response.right.join(' | ')}`
		].join('\n');
	}
	if (response.kind === 'equation-blanks') {
		return [
			'The learner fills equation blanks.',
			'Blanks:',
			...response.blanks.map((blank) => `- ${blank.id}: ${blank.label}`)
		].join('\n');
	}
	if (response.kind === 'number-line') {
		return [
			'The learner enters a number.',
			`Label: ${response.label}`,
			response.prefix ? `Prefix: ${response.prefix}` : null,
			response.unit ? `Unit: ${response.unit}` : null
		]
			.filter(Boolean)
			.join('\n');
	}
	if (response.kind === 'labeled-lines') {
		return [
			'The learner fills labelled written answer fields.',
			'Fields:',
			...response.labels.map((label) => `- ${label}`)
		].join('\n');
	}
	return [
		'The learner places labels on image targets.',
		'Targets:',
		...response.zones.map((zone) => `- ${zone.id}: ${zone.label}`)
	].join('\n');
}

function evidenceSummary(raw: string) {
	const evidence = parseJson<Array<Record<string, unknown>>>(raw, []);
	const summaries = evidence
		.map((item) => item.evidence_summary ?? item.evidence_excerpt)
		.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
		.slice(0, 3);
	return summaries.join(' ');
}

function estimateGradeableMarks({
	maxMarks,
	markScheme,
	checklist,
	modelAnswer,
	chain,
	answerKeys
}: {
	maxMarks: number;
	markScheme: MarkSchemeRow[];
	checklist: ChecklistRow[];
	modelAnswer: string | null;
	chain: GradeableQuestionContext['chain'];
	answerKeys: ResponseAnswerKeyRow[];
}) {
	if (maxMarks <= 0) return 0;

	let evidenceMarks = 0;

	if (chain?.steps.length || (modelAnswer && markScheme.length === 0 && checklist.length === 0)) {
		evidenceMarks = maxMarks;
	}

	if (checklist.length > 0) {
		const checklistMarks = checklist.reduce((sum, item) => sum + (item.required ? 1 : 0), 0);
		evidenceMarks = Math.max(evidenceMarks, checklistMarks || checklist.length);
	}

	if (markScheme.length > 0) {
		const explicitMarkTotal = markScheme.reduce((sum, item) => sum + (item.marks ?? 0), 0);
		evidenceMarks = Math.max(evidenceMarks, explicitMarkTotal || markScheme.length);
	}

	if (answerKeys.length > 0) {
		evidenceMarks = Math.max(evidenceMarks, maxMarks);
	}

	return Math.min(maxMarks, evidenceMarks);
}

async function getTargetQuestions(sourceDocumentId: string, ref: string) {
	const normalized = normalizeRef(ref);
	const hasSubpart = normalized.includes('.');
	const rows = await queryRows<QuestionRow>(
		`SELECT q.id, q.source_question_ref, q.parent_source_question_ref, q.display_order,
		        q.prompt_text, q.self_contained_prompt_text, q.context_text, q.command_word, q.marks,
		        q.board, q.qualification, q.subject, q.subject_area, q.tier, q.paper, q.series, q.year,
		        q.topic_path_json, qro.render_json
		 FROM questions q
		 LEFT JOIN question_rendering_overlays qro ON qro.question_id = q.id
		 WHERE q.source_document_id = ?
		   AND ${
					hasSubpart
						? 'q.source_question_ref = ?'
						: '(q.parent_source_question_ref = ? OR q.source_question_ref = ?)'
				}
		 ORDER BY q.display_order, q.source_question_ref`,
		hasSubpart ? [sourceDocumentId, normalized] : [sourceDocumentId, normalized, normalized]
	);
	return rows;
}

async function getQuestionEvidence(questionId: string) {
	const [markScheme, checklist, modelAnswerRows, chainRows, responseAnswerKeys] = await Promise.all(
		[
			queryRows<MarkSchemeRow>(
				`SELECT id, display_order, item_type, text, marks, source_ref
			 FROM mark_scheme_items
			 WHERE question_id = ?
			 ORDER BY display_order`,
				[questionId]
			),
			queryRows<ChecklistRow>(
				`SELECT id, display_order, text, required, mark_scheme_item_ids_json
			 FROM mark_checklist_items
			 WHERE question_id = ?
			 ORDER BY display_order`,
				[questionId]
			),
			queryRows<ModelAnswerRow>(
				`SELECT answer_text, confidence
			 FROM model_answers
			 WHERE question_id = ?
			 ORDER BY COALESCE(confidence, 0) DESC
			 LIMIT 1`,
				[questionId]
			),
			queryRows<ChainRow>(
				`SELECT ac.id, ac.title, ac.canonical_chain_text, ac.summary, qac.fit_notes
			 FROM question_answer_chains qac
			 JOIN answer_chains ac ON ac.id = qac.answer_chain_id
			 WHERE qac.question_id = ?
			   AND qac.needs_human_review = 0
			   AND ac.needs_human_review = 0
			   AND ac.status = 'published'
			 ORDER BY qac.is_primary DESC, COALESCE(qac.fit_confidence, 0) DESC
			 LIMIT 1`,
				[questionId]
			),
			queryRows<ResponseAnswerKeyRow>(
				`SELECT response_kind, target_id, correct_answer, display_order, aliases_json, metadata_json
			 FROM question_response_answer_keys
			 WHERE question_id = ?
			 ORDER BY display_order, target_id`,
				[questionId]
			)
		]
	);

	const chainRow = chainRows[0];
	const stepRows = chainRow
		? await queryRows<ChainStepRow>(
				`SELECT id, display_order, step_text, step_role, explanation, common_omission, evidence_json
				 FROM answer_chain_steps
				 WHERE answer_chain_id = ?
				 ORDER BY display_order`,
				[chainRow.id]
			)
		: [];

	return {
		markScheme: usefulMarkScheme(markScheme),
		checklist: usefulChecklist(checklist),
		modelAnswer: usefulModelAnswer(modelAnswerRows[0]?.answer_text ?? null),
		chain: chainRow
			? {
					id: chainRow.id,
					title: chainRow.title,
					canonicalText: chainRow.canonical_chain_text,
					summary: chainRow.summary,
					fitNotes: chainRow.fit_notes,
					steps: stepRows.map((row) => ({
						id: row.id,
						text: row.step_text,
						role: row.step_role,
						evidence: evidenceSummary(row.evidence_json),
						commonOmission: row.common_omission
					}))
				}
			: null,
		rawMarkSchemeCount: markScheme.length,
		rawChecklistCount: checklist.length,
		responseAnswerKeys
	};
}

async function getGradeContexts(
	paperSlug: string,
	ref: string
): Promise<GradeableQuestionContext[]> {
	const sourceDocumentId = await sourceDocumentIdForSlug(paperSlug);
	if (!sourceDocumentId) {
		throw new Error(`Question paper not found: ${paperSlug}`);
	}

	const questions = await getTargetQuestions(sourceDocumentId, ref);
	if (questions.length === 0) {
		throw new Error(`Question ref not found: ${paperSlug}/${ref}`);
	}

	return await Promise.all(
		questions.map(async (question) => {
			const evidence = await getQuestionEvidence(question.id);
			const response = mergeResponseAnswerKey(
				question.id,
				responseFromRenderJson(question.render_json),
				evidence.responseAnswerKeys
			);
			const warnings: string[] = [];
			if (evidence.rawMarkSchemeCount > 0 && evidence.markScheme.length === 0) {
				warnings.push(
					'The extracted mark-scheme row for this subpart looks like marking guidance, not a scoring point.'
				);
			}
			if (evidence.rawChecklistCount > 0 && evidence.checklist.length === 0) {
				warnings.push('The extracted checklist for this subpart is not usable yet.');
			}
			if (!evidence.chain) {
				warnings.push('No answer chain is linked to this subpart in D1 yet.');
			}
			if (imageLabelResponseNeedsAnswerKey(response)) {
				warnings.push(
					'This label question is missing a complete imported answer key, so it cannot be checked automatically yet.'
				);
			} else if (responseNeedsDeterministicAnswerKey(response)) {
				warnings.push(
					'No structured response answer key is stored for this fixed-response interaction yet.'
				);
			}

			const hasEvidence =
				evidence.markScheme.length > 0 ||
				evidence.checklist.length > 0 ||
				Boolean(evidence.modelAnswer) ||
				Boolean(evidence.chain?.steps.length);
			const gradeable =
				hasEvidence ||
				canGradeDeterministically(response) ||
				(Boolean(response) && evidence.responseAnswerKeys.length > 0);
			const maxMarks = question.marks ?? 0;
			const gradeableMarks = gradeable
				? canGradeDeterministically(response)
					? Math.min(
							maxMarks,
							response.kind === 'image-label-zones'
								? response.zones.length
								: Math.max(1, response.answerKeys.length)
						)
					: maxMarks ||
						estimateGradeableMarks({
							maxMarks,
							markScheme: evidence.markScheme,
							checklist: evidence.checklist,
							modelAnswer: evidence.modelAnswer,
							chain: evidence.chain,
							answerKeys: evidence.responseAnswerKeys
						})
				: 0;

			if (gradeableMarks > 0 && maxMarks > gradeableMarks) {
				warnings.push(
					`Only ${gradeableMarks} of ${maxMarks} marks currently have usable extracted grading evidence.`
				);
			}

			return {
				question,
				response,
				responsePromptDetails: responsePromptDetails(response),
				answerKeys: evidence.responseAnswerKeys,
				markScheme: evidence.markScheme,
				checklist: evidence.checklist,
				modelAnswer: evidence.modelAnswer,
				chain: evidence.chain,
				gradeable,
				gradeableMarks,
				warnings
			};
		})
	);
}

function structuredAnswerKeyPromptDetails(rows: ResponseAnswerKeyRow[]) {
	if (rows.length === 0) return null;
	return rows
		.map((row) => {
			const aliases = parseJson<string[]>(row.aliases_json, []).filter(Boolean);
			const metadata = parseJson<Record<string, unknown>>(row.metadata_json, {});
			const parts = [
				`target=${row.target_id}`,
				`correct=${row.correct_answer}`,
				aliases.length ? `aliases=${aliases.join(' | ')}` : null,
				Object.keys(metadata).length ? `notes=${JSON.stringify(metadata)}` : null
			].filter(Boolean);
			return `- ${parts.join('; ')}`;
		})
		.join('\n');
}

function contextPrompt(context: GradeableQuestionContext) {
	const q = context.question;
	const answerKeyDetails = structuredAnswerKeyPromptDetails(context.answerKeys);
	const lines = [
		`REF: ${q.source_question_ref}`,
		`QUESTION_ID: ${q.id}`,
		`PAPER_MARKS: ${q.marks ?? 0}`,
		`GRADEABLE_MARKS_FROM_SUPPLIED_EVIDENCE: ${context.gradeableMarks}`,
		`MANDATORY_MARK_ROW_COUNT: ${context.gradeableMarks}`,
		`COMMAND: ${q.command_word ?? 'question'}`,
		`PAPER: ${q.board ?? 'AQA'} ${q.qualification ?? 'GCSE'} ${q.subject ?? 'Combined Science'} ${q.tier ?? 'Higher'} ${q.paper ?? ''} ${q.series ?? ''}`,
		q.context_text ? `CONTEXT:\n${q.context_text}` : null,
		`PROMPT:\n${q.self_contained_prompt_text ?? q.prompt_text}`,
		context.responsePromptDetails ? `RESPONSE_FORMAT:\n${context.responsePromptDetails}` : null,
		answerKeyDetails ? `STRUCTURED_ANSWER_KEYS:\n${answerKeyDetails}` : null
	].filter(Boolean);

	if (context.markScheme.length) {
		lines.push(
			'MARK_SCHEME_ITEMS:',
			...context.markScheme.map(
				(item) =>
					`- ${item.id}: ${item.text}${item.marks ? ` (${item.marks} mark${item.marks === 1 ? '' : 's'})` : ''}`
			)
		);
	}

	if (context.checklist.length) {
		lines.push(
			'STUDENT_CHECKLIST_ITEMS:',
			...context.checklist.map((item) => `- ${item.id}: ${item.text}`)
		);
	}

	if (context.modelAnswer) {
		lines.push('MODEL_ANSWER:', context.modelAnswer);
	}

	if (context.chain) {
		lines.push(
			`ANSWER_CHAIN: ${context.chain.title}`,
			`CANONICAL_CHAIN: ${context.chain.canonicalText}`,
			'CHAIN_STEPS:',
			...context.chain.steps.map((step) =>
				[
					`- ${step.id}: ${step.text}`,
					`  role: ${step.role}`,
					step.evidence ? `  evidence: ${step.evidence}` : null,
					step.commonOmission ? `  common omission: ${step.commonOmission}` : null
				]
					.filter(Boolean)
					.join('\n')
			)
		);
	}

	return lines.join('\n');
}

function buildPrompt(contexts: GradeableQuestionContext[], answers: Record<string, string>) {
	return [
		'You are grading GCSE Combined Science answers for Question Constellation.',
		'Grade only from the supplied D1 mark scheme, checklist, model answer, structured answer keys, and answer-chain evidence.',
		'Never award more than GRADEABLE_MARKS_FROM_SUPPLIED_EVIDENCE for a question.',
		'Do not use generic textbook expectations unless they are needed to interpret a supplied marking point.',
		'Award credit for scientifically equivalent wording, but do not credit missing causal links.',
		'For answer-chain questions, mark chain steps as credited only when the student clearly includes that reasoning link.',
		'Keep feedback concise but readable.',
		'Write summary as a neutral marking note, not as direct address. Prefer "The answer..." over "you/your".',
		'For incorrect answers, summary should be at most eight words, or an empty string if checklist items carry the useful feedback.',
		'Do not write phrases such as "expected marking point", "credit is given", "no credit awarded", or "the answer should".',
		'For correct or partial answers, nextStep may be one short improvement sentence, also without "you/your".',
		'Return checklist as a readable mark breakdown with exactly MANDATORY_MARK_ROW_COUNT rows unless the mark scheme explicitly combines marks.',
		'If supplied extracted evidence has fewer rows than PAPER_MARKS, infer the remaining mark rows from the question wording and supplied mark-scheme meaning. Do not omit a missed mark row.',
		'Checklist item text must be a clean marking point, without question numbers, AO codes, spec codes, or examiner notation.',
		'Checklist explanations should be short plain-English reasons, at most one sentence.',
		'For selected-response questions, use RESPONSE_FORMAT to understand what the submitted answer means.',
		'For fixed-response questions, STRUCTURED_ANSWER_KEYS are source-grounded correct answers. Use aliases and notes when supplied.',
		'If the number of structured answer keys differs from the marks, return one readable row per answer key when that is clearer, but awardedMarks must follow the mark scheme.',
		'If a mark-scheme item is only a letter such as A, B, C, or D, grade by the selected option exactly. Do not invent a scientific explanation for a letter-only key; a checklist row such as "Correct option: B" is enough.',
		'',
		'Return valid JSON only. No Markdown fences.',
		'Shape:',
		'{ "results": [ { "ref": string, "questionId": string, "result": "correct|partial|incorrect", "awardedMarks": number, "confidence": "high|medium|low", "summary": string, "nextStep": string, "checklist": [ { "id": string, "text": string, "verdict": "credited|missed|uncertain", "explanation": string } ], "chainSteps": [ { "id": string, "verdict": "credited|missed|uncertain", "explanation": string } ] } ] }',
		'For 2-mark explanation questions, checklist should contain two short rows: the gained marking point and the missing marking point.',
		'awardedMarks must equal the count of credited checklist rows unless the supplied mark scheme explicitly says otherwise or fixed-response keys combine into fewer marks.',
		'',
		'QUESTIONS:',
		contexts.map(contextPrompt).join('\n\n---\n\n'),
		'',
		'STUDENT_ANSWERS:',
		...contexts.map((context) => {
			const ref = context.question.source_question_ref;
			return `REF: ${ref}\nQUESTION_ID: ${context.question.id}\nANSWER:\n${answers[ref]?.trim() ?? ''}`;
		})
	].join('\n');
}

function parseModelJson(rawText: string): ModelGradePayload {
	const trimmed = rawText.trim();
	try {
		return JSON.parse(trimmed) as ModelGradePayload;
	} catch {
		const start = trimmed.indexOf('{');
		const end = trimmed.lastIndexOf('}');
		if (start >= 0 && end > start) {
			return JSON.parse(trimmed.slice(start, end + 1)) as ModelGradePayload;
		}
		throw new Error('Model did not return parseable JSON.');
	}
}

function clampMarks(value: unknown, maxMarks: number) {
	const numeric = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(numeric)) return 0;
	return Math.max(0, Math.min(maxMarks, Math.round(numeric)));
}

function normalizeVerdict(value: unknown): ExperimentGradeVerdict {
	return value === 'credited' || value === 'missed' || value === 'uncertain' ? value : 'uncertain';
}

function resultFromMarks(awardedMarks: number, maxMarks: number) {
	if (awardedMarks >= maxMarks) return 'correct';
	if (awardedMarks <= 0) return 'incorrect';
	return 'partial';
}

function neutralizeFeedbackText(text: string) {
	return text
		.replace(/\b[Tt]he expected marking point is that\s*/g, '')
		.replace(/\b[Ee]xpected marking point:\s*/g, '')
		.replace(/\b[Cc]redit is given (because|for)\s*/g, '')
		.replace(/\b[Nn]o credit awarded because\s*/g, '')
		.replace(/\b[Tt]he answer should\s*/g, '')
		.replace(/\b[Yy]our answer\b/g, 'The answer')
		.replace(/\b[Yy]ou\b/g, 'The answer')
		.replace(/\b[Yy]our\b/g, 'the')
		.replace(/\s+/g, ' ')
		.trim();
}

function modelAnswerMarkRows(modelAnswer: string | null, maxRows: number) {
	if (!modelAnswer || maxRows <= 0) return [];
	const normalized = modelAnswer.replace(/\s+/g, ' ').trim();
	if (!normalized) return [];
	const sentences =
		normalized
			.match(/[^.!?]+[.!?]?/g)
			?.map((sentence) => sentence.trim())
			.filter(Boolean) ?? [];
	if (sentences.length >= maxRows) return sentences.slice(0, maxRows);
	return normalized
		.split(/\s*;\s*/)
		.map((part) => part.trim())
		.filter(Boolean)
		.slice(0, maxRows);
}

function contentTokens(text: string) {
	const stopWords = new Set([
		'a',
		'an',
		'and',
		'are',
		'as',
		'at',
		'be',
		'by',
		'for',
		'from',
		'have',
		'in',
		'is',
		'it',
		'of',
		'or',
		'so',
		'that',
		'the',
		'this',
		'to',
		'with'
	]);
	return new Set(
		text
			.toLowerCase()
			.match(/[a-z0-9]+/g)
			?.filter((token) => token.length > 2 && !stopWords.has(token)) ?? []
	);
}

function tokenOverlap(left: string, right: string) {
	const leftTokens = contentTokens(left);
	const rightTokens = contentTokens(right);
	if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
	let shared = 0;
	for (const token of leftTokens) {
		if (rightTokens.has(token)) shared += 1;
	}
	return shared / Math.min(leftTokens.size, rightTokens.size);
}

function completeChecklistRows({
	context,
	rows,
	awardedMarks,
	gradeableMarks,
	nextStep
}: {
	context: GradeableQuestionContext;
	rows: GradeChecklistItem[];
	awardedMarks: number;
	gradeableMarks: number;
	nextStep: string;
}): GradeChecklistItem[] {
	const expectedRowCount = Math.max(gradeableMarks, context.answerKeys.length);
	const cleanedRows = rows.filter((row) => row.text.trim()).slice(0, expectedRowCount);
	const modelRows = modelAnswerMarkRows(context.modelAnswer, expectedRowCount);
	if (modelRows.length < gradeableMarks) return cleanedRows;

	const usedRows = new Set<number>();
	const provisional = modelRows.map((text, index): GradeChecklistItem => {
		let bestIndex = -1;
		let bestScore = 0;
		for (const [rowIndex, row] of cleanedRows.entries()) {
			if (usedRows.has(rowIndex)) continue;
			const score = Math.max(
				tokenOverlap(text, row.text),
				tokenOverlap(text, `${row.text} ${row.explanation}`)
			);
			if (score > bestScore) {
				bestScore = score;
				bestIndex = rowIndex;
			}
		}
		if (bestIndex >= 0 && bestScore >= 0.45) {
			usedRows.add(bestIndex);
			const match = cleanedRows[bestIndex];
			return {
				...match,
				text,
				explanation: neutralizeFeedbackText(match.explanation)
			};
		}
		return {
			id: `${context.question.id}-model-answer-check-${index + 1}`,
			text,
			verdict: 'uncertain',
			explanation: ''
		};
	});

	const targetCredited = Math.min(awardedMarks, expectedRowCount);
	const targetMissed = Math.max(0, expectedRowCount - targetCredited);
	let credited = provisional.filter((row) => row.verdict === 'credited').length;
	let missed = provisional.filter((row) => row.verdict === 'missed').length;

	return provisional.map((row) => {
		if (row.verdict === 'credited') {
			return {
				...row,
				explanation: row.explanation || 'Included in the answer.'
			};
		}
		if (row.verdict === 'missed') {
			return {
				...row,
				explanation: row.explanation || 'Missing from the answer.'
			};
		}

		const nextStepMatch = nextStep ? tokenOverlap(row.text, nextStep) >= 0.35 : false;
		if (nextStepMatch && missed < targetMissed) {
			missed += 1;
			return {
				...row,
				verdict: 'missed',
				explanation: 'Missing from the answer.'
			};
		}
		if (credited < targetCredited) {
			credited += 1;
			return {
				...row,
				verdict: 'credited',
				explanation: 'Included in the answer.'
			};
		}
		if (missed < targetMissed) {
			missed += 1;
			return {
				...row,
				verdict: 'missed',
				explanation: 'Missing from the answer.'
			};
		}
		return {
			...row,
			explanation: row.explanation || 'Needs review against the mark scheme.'
		};
	});
}

function notGradeableResult(context: GradeableQuestionContext): ExperimentQuestionGradeResult {
	const marks = context.question.marks ?? 0;
	return {
		questionId: context.question.id,
		ref: context.question.source_question_ref,
		status: 'not_gradeable',
		result: 'ungraded',
		awardedMarks: null,
		maxMarks: marks,
		gradeableMarks: 0,
		confidence: 'low',
		summary: 'This subpart is missing the mark-scheme evidence needed for automatic checking.',
		nextStep:
			'Use the printed mark scheme for now, or re-import this subpart with corrected mark-scheme extraction.',
		checklist: [],
		chain: null,
		modelAnswer: null,
		warnings: context.warnings
	};
}

function answerMap(rawAnswer: string) {
	const entries = new Map<string, string>();
	for (const line of rawAnswer.split(/\r?\n/)) {
		const match = /^([^:]+):\s*(.*)$/.exec(line.trim());
		if (!match) continue;
		entries.set(normalizedAnswer(match[1]), match[2].trim());
	}
	return entries;
}

function arrowAnswerMap(rawAnswer: string) {
	const entries = new Map<string, string>();
	for (const line of rawAnswer.split(/\r?\n/)) {
		const match = /^(.+?)\s*->\s*(.*)$/.exec(line.trim());
		if (!match) continue;
		entries.set(normalizedAnswer(match[1]), match[2].trim());
	}
	return entries;
}

function normalizedAnswer(value: string) {
	return value
		.normalize('NFKC')
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/\\mathrm\{([^}]*)\}/g, '$1')
		.replace(/\\text\{([^}]*)\}/g, '$1')
		.replace(/\\times/g, '×')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function normalizedTableRow(value: string) {
	return normalizedAnswer(value).replace(/\s*\|\s*/g, ' | ');
}

function splitSubmittedLines(rawAnswer: string) {
	return rawAnswer
		.split(/\r?\n/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function splitExpectedFixedAnswers(rawAnswer: string) {
	return rawAnswer
		.split(/\r?\n|;/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function numberFromUnknown(value: unknown) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value !== 'string') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function metadataNumber(metadata: Record<string, unknown>, names: string[]) {
	for (const name of names) {
		const value = numberFromUnknown(metadata[name]);
		if (value !== null) return value;
	}
	return null;
}

function numericValue(value: string) {
	const normalized = value
		.normalize('NFKC')
		.replace(/,/g, '')
		.replace(/−/g, '-')
		.replace(/\\times|×|x/g, 'e')
		.replace(/\s*10\s*\^\s*\{?\s*([+-]?\d+)\s*\}?/gi, '$1')
		.replace(/\s+/g, '');
	const scientific = normalized.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
	if (!scientific) return null;
	const parsed = Number(scientific[0]);
	return Number.isFinite(parsed) ? parsed : null;
}

function textMatchesWithNumericTolerance(
	submitted: string,
	expected: string,
	metadata: Record<string, unknown>
) {
	if (normalizedAnswer(submitted) === normalizedAnswer(expected)) return true;
	const submittedNumber = numericValue(submitted);
	const expectedNumber = numericValue(expected);
	if (submittedNumber === null || expectedNumber === null) return false;
	const absoluteTolerance =
		metadataNumber(metadata, ['absoluteTolerance', 'absTolerance', 'tolerance']) ?? 0;
	const relativeTolerance = metadataNumber(metadata, ['relativeTolerance', 'relTolerance']) ?? 0;
	const allowed =
		absoluteTolerance ||
		Math.abs(expectedNumber) * relativeTolerance ||
		Math.max(1, Math.abs(expectedNumber)) * 1e-9;
	return Math.abs(submittedNumber - expectedNumber) <= allowed;
}

function optionTextForLetter(answer: string, options: string[]) {
	const normalized = answer.trim().replace(/[).:]/g, '').toUpperCase();
	if (!/^[A-Z]$/.test(normalized)) return null;
	const index = normalized.charCodeAt(0) - 65;
	return options[index] ?? null;
}

function answerMatchesKey(
	submitted: string,
	key: ParsedAnswerKey,
	options: string[] | null = null,
	tableRow = false
) {
	const candidates = [key.correctAnswer, ...key.aliases].filter(Boolean);
	for (const candidate of candidates) {
		const optionCandidate = options ? optionTextForLetter(candidate, options) : null;
		const expectedValues = optionCandidate ? [candidate, optionCandidate] : [candidate];
		if (
			expectedValues.some((expected) =>
				tableRow
					? normalizedTableRow(submitted) === normalizedTableRow(expected)
					: textMatchesWithNumericTolerance(submitted, expected, key.metadata)
			)
		) {
			return true;
		}
	}
	return false;
}

function deterministicChecklistResult({
	context,
	items,
	summaryNoun,
	nextStep
}: {
	context: GradeableQuestionContext;
	items: Array<{ id: string; text: string; credited: boolean; explanation: string }>;
	summaryNoun: string;
	nextStep: string;
}): ExperimentQuestionGradeResult {
	const maxMarks = context.question.marks ?? 0;
	const gradeableMarks = Math.min(maxMarks, Math.max(1, items.length));
	const creditedCount = items.filter((item) => item.credited).length;
	const awardedMarks =
		items.length === 0
			? 0
			: items.length === gradeableMarks
				? creditedCount
				: Math.round((creditedCount / items.length) * gradeableMarks);
	const checklist = items.map((item) => ({
		id: item.id,
		text: item.text,
		verdict: item.credited ? ('credited' as const) : ('missed' as const),
		explanation: item.explanation
	}));

	return {
		questionId: context.question.id,
		ref: context.question.source_question_ref,
		status: 'graded',
		result: resultFromMarks(awardedMarks, gradeableMarks),
		awardedMarks,
		maxMarks,
		gradeableMarks,
		confidence: 'high',
		summary:
			awardedMarks === gradeableMarks
				? `All ${summaryNoun} are correct.`
				: awardedMarks === 0
					? `No ${summaryNoun} were credited.`
					: `${awardedMarks} of ${gradeableMarks} mark${gradeableMarks === 1 ? '' : 's'} credited.`,
		nextStep: awardedMarks === gradeableMarks ? 'No changes needed.' : nextStep,
		checklist,
		chain: null,
		modelAnswer: null,
		warnings: [DETERMINISTIC_WARNING, ...context.warnings]
	};
}

function matchingKeyItems(response: Extract<FixedResponse, { kind: 'matching' }>) {
	const directKeys = response.answerKeys.filter(
		(key) => normalizedAnswer(key.targetId) !== 'answer'
	);
	if (directKeys.length > 0) return directKeys;
	return response.answerKeys.flatMap((key) => {
		const entries = Array.from(arrowAnswerMap(key.correctAnswer));
		return entries.map(([targetId, correctAnswer], index) => ({
			...key,
			targetId,
			correctAnswer,
			displayOrder: index
		}));
	});
}

function keyForTarget(keys: ParsedAnswerKey[], targetIds: string[]) {
	const normalizedTargets = new Set(targetIds.map(normalizedAnswer));
	return keys.find((key) => normalizedTargets.has(normalizedAnswer(key.targetId))) ?? null;
}

function equationBlankSubmittedAnswer(
	submitted: Map<string, string>,
	blank: { id: string; label: string }
) {
	return (
		submitted.get(normalizedAnswer(blank.id)) ?? submitted.get(normalizedAnswer(blank.label)) ?? ''
	);
}

function unorderedEquationBlankItems(
	response: Extract<FixedResponse, { kind: 'equation-blanks' }>,
	submitted: Map<string, string>
) {
	const items: Array<{ id: string; text: string; credited: boolean; explanation: string }> = [];
	const groupedBlankIds = new Set<string>();
	for (const group of response.unorderedGroups) {
		const groupTargetIds = new Set(group.targetIds.map(normalizedAnswer));
		const blanks = response.blanks.filter(
			(blank) =>
				groupTargetIds.has(normalizedAnswer(blank.id)) ||
				groupTargetIds.has(normalizedAnswer(blank.label))
		);
		if (blanks.length < 2) continue;
		const usedAnswerIndexes = new Set<number>();
		for (const blank of blanks) {
			groupedBlankIds.add(normalizedAnswer(blank.id));
			const submittedAnswer = equationBlankSubmittedAnswer(submitted, blank);
			const matchedIndex = group.answers.findIndex(
				(answer, index) =>
					!usedAnswerIndexes.has(index) &&
					textMatchesWithNumericTolerance(submittedAnswer, answer, {})
			);
			const credited = matchedIndex >= 0;
			if (credited) usedAnswerIndexes.add(matchedIndex);
			items.push({
				id: blank.id,
				text: group.answers.join(' / '),
				credited,
				explanation: credited
					? 'This blank matches one unused answer from the unordered answer group.'
					: `${blank.label} should be one of ${group.answers.join(' / ')}, without reusing an answer.`
			});
		}
	}
	return { items, groupedBlankIds };
}

function deterministicFixedAnswerResult(
	context: GradeableQuestionContext,
	rawAnswer: string
): ExperimentQuestionGradeResult | null {
	const response = context.response;
	if (!response) return null;
	if (!canGradeDeterministically(response)) return notGradeableResult(context);

	if (response.kind === 'choice') {
		const expectedKeys =
			response.maxSelections > 1 && response.answerKeys.length === 1
				? response.answerKeys.flatMap((key) =>
						splitExpectedFixedAnswers(key.correctAnswer).map((correctAnswer, index) => ({
							...key,
							targetId: `${key.targetId}-${index + 1}`,
							correctAnswer,
							displayOrder: key.displayOrder + index
						}))
					)
				: response.answerKeys;
		const selected = splitSubmittedLines(rawAnswer);
		const items = expectedKeys.map((key, index) => {
			const credited = selected.some((answer) => answerMatchesKey(answer, key, response.options));
			return {
				id: key.targetId || `choice-${index + 1}`,
				text: key.correctAnswer,
				credited,
				explanation: credited
					? 'This selected option matches the answer key.'
					: `The expected option is ${key.correctAnswer}.`
			};
		});
		return deterministicChecklistResult({
			context,
			items,
			summaryNoun: 'selected options',
			nextStep: 'Check the selected option against the question.'
		});
	}

	if (response.kind === 'choice-table') {
		const key = response.answerKeys[0];
		const items = [
			{
				id: key.targetId,
				text: key.correctAnswer,
				credited: answerMatchesKey(rawAnswer, key, null, true),
				explanation: answerMatchesKey(rawAnswer, key, null, true)
					? 'This selected row matches the answer key.'
					: `The expected row is ${key.correctAnswer}.`
			}
		];
		return deterministicChecklistResult({
			context,
			items,
			summaryNoun: 'selected rows',
			nextStep: 'Check the selected row against the table headings.'
		});
	}

	if (response.kind === 'matching') {
		const submitted = arrowAnswerMap(rawAnswer);
		const items = matchingKeyItems(response).map((key) => {
			const submittedAnswer = submitted.get(normalizedAnswer(key.targetId)) ?? '';
			const credited = answerMatchesKey(submittedAnswer, key, response.right);
			return {
				id: key.targetId,
				text: `${key.targetId} -> ${key.correctAnswer}`,
				credited,
				explanation: credited
					? 'This match is correct.'
					: `${key.targetId} should match ${key.correctAnswer}.`
			};
		});
		return deterministicChecklistResult({
			context,
			items,
			summaryNoun: 'matches',
			nextStep: 'Check the missed links in the matching question.'
		});
	}

	if (response.kind === 'equation-blanks') {
		const submitted = answerMap(rawAnswer);
		const unordered = unorderedEquationBlankItems(response, submitted);
		const items = [
			...unordered.items,
			...response.blanks
				.filter((blank) => !unordered.groupedBlankIds.has(normalizedAnswer(blank.id)))
				.map((blank) => {
					const key = keyForTarget(response.answerKeys, [blank.id, blank.label]);
					if (!key) return null;
					const submittedAnswer = equationBlankSubmittedAnswer(submitted, blank);
					const credited = answerMatchesKey(submittedAnswer, key);
					return {
						id: blank.id,
						text: key.correctAnswer,
						credited,
						explanation: credited
							? 'This blank matches the answer key.'
							: `${blank.label} should be ${key.correctAnswer}.`
					};
				})
				.filter((item): item is NonNullable<typeof item> => Boolean(item))
		];
		return deterministicChecklistResult({
			context,
			items,
			summaryNoun: 'blanks',
			nextStep: 'Check the missed blank values.'
		});
	}

	if (response.kind === 'number-line') {
		const key =
			keyForTarget(response.answerKeys, ['answer', response.label]) ?? response.answerKeys[0];
		const credited = answerMatchesKey(rawAnswer, key);
		return deterministicChecklistResult({
			context,
			items: [
				{
					id: key.targetId,
					text: key.correctAnswer,
					credited,
					explanation: credited
						? 'This number matches the answer key.'
						: `The expected answer is ${key.correctAnswer}.`
				}
			],
			summaryNoun: 'answers',
			nextStep: 'Check the value, unit, and rounding.'
		});
	}

	if (response.kind === 'labeled-lines') {
		const submitted = answerMap(rawAnswer);
		const directAnswerKey = keyForTarget(response.answerKeys, ['answer']);
		const items = directAnswerKey
			? [
					{
						id: directAnswerKey.targetId,
						text: directAnswerKey.correctAnswer,
						credited: answerMatchesKey(rawAnswer, directAnswerKey),
						explanation: answerMatchesKey(rawAnswer, directAnswerKey)
							? 'This answer matches the answer key.'
							: `The expected answer is ${directAnswerKey.correctAnswer}.`
					}
				]
			: response.labels
					.map((label) => {
						const key = keyForTarget(response.answerKeys, [label]);
						if (!key) return null;
						const submittedAnswer = submitted.get(normalizedAnswer(label)) ?? '';
						const credited = answerMatchesKey(submittedAnswer, key);
						return {
							id: label,
							text: key.correctAnswer,
							credited,
							explanation: credited
								? 'This labelled answer matches the key.'
								: `${label} should be ${key.correctAnswer}.`
						};
					})
					.filter((item): item is NonNullable<typeof item> => Boolean(item));
		return deterministicChecklistResult({
			context,
			items,
			summaryNoun: 'answers',
			nextStep: 'Check the missed labelled answer values.'
		});
	}

	const answers = answerMap(rawAnswer);
	const maxMarks = context.question.marks ?? 0;
	const gradeableMarks = Math.min(maxMarks, response.zones.length);
	const checklist = response.zones.map((zone) => {
		const submitted =
			answers.get(zone.id.toLowerCase()) ?? answers.get(zone.label.toLowerCase()) ?? '';
		const correctAnswer = response.correctAnswers[zone.id] ?? '';
		const credited = normalizedAnswer(submitted) === normalizedAnswer(correctAnswer);
		return {
			id: zone.id,
			text: correctAnswer,
			verdict: credited ? ('credited' as const) : ('missed' as const),
			explanation: credited
				? 'This label is in the right place.'
				: `This label should be ${correctAnswer}.`
		};
	});
	const awardedMarks = checklist.filter((item) => item.verdict === 'credited').length;

	return {
		questionId: context.question.id,
		ref: context.question.source_question_ref,
		status: 'graded',
		result: resultFromMarks(awardedMarks, gradeableMarks),
		awardedMarks,
		maxMarks,
		gradeableMarks,
		confidence: 'high',
		summary:
			awardedMarks === gradeableMarks
				? 'All labels are correct.'
				: awardedMarks === 0
					? 'None of the labels are in the right place.'
					: `${awardedMarks} of ${gradeableMarks} label${gradeableMarks === 1 ? '' : 's'} ${
							awardedMarks === 1 ? 'is' : 'are'
						} correct.`,
		nextStep:
			awardedMarks === gradeableMarks
				? 'No changes needed.'
				: 'Check the missed labels against the diagram.',
		checklist,
		chain: null,
		modelAnswer: null,
		warnings: [DETERMINISTIC_WARNING, ...context.warnings]
	};
}

function unansweredResult(context: GradeableQuestionContext): ExperimentQuestionGradeResult {
	const marks = context.question.marks ?? 0;
	return {
		questionId: context.question.id,
		ref: context.question.source_question_ref,
		status: 'unanswered',
		result: 'ungraded',
		awardedMarks: null,
		maxMarks: marks,
		gradeableMarks: context.gradeable ? context.gradeableMarks : 0,
		confidence: 'low',
		summary: 'No answer was submitted for this subpart.',
		nextStep: 'Write an answer in the response space, then submit again.',
		checklist: [],
		chain: null,
		modelAnswer: null,
		warnings: []
	};
}

function mergeModelResult(
	context: GradeableQuestionContext,
	modelResult: NonNullable<ModelGradePayload['results']>[number] | undefined
): ExperimentQuestionGradeResult {
	const maxMarks = context.question.marks ?? 0;
	const gradeableMarks = context.gradeableMarks || maxMarks;
	const awardedMarks = clampMarks(modelResult?.awardedMarks, gradeableMarks);
	const checklistById = new Map((modelResult?.checklist ?? []).map((item) => [item.id, item]));
	const chainById = new Map((modelResult?.chainSteps ?? []).map((item) => [item.id, item]));
	const result =
		modelResult?.result === 'correct' ||
		modelResult?.result === 'partial' ||
		modelResult?.result === 'incorrect'
			? modelResult.result
			: resultFromMarks(awardedMarks, gradeableMarks);
	const summary = neutralizeFeedbackText(
		modelResult?.summary?.trim() || 'Checked against the extracted mark scheme.'
	);
	const nextStep =
		result === 'incorrect'
			? ''
			: neutralizeFeedbackText(
					modelResult?.nextStep?.trim() || 'Add the missing marking point or chain link.'
				);
	const modelChecklist = modelResult?.checklist ?? [];
	const modelChecklistRows = modelChecklist
		.map((item, index) => {
			const text = cleanMarkText(item.text?.trim() || item.explanation?.trim() || '');
			if (!text) return null;
			return {
				id: item.id || `${context.question.id}-model-check-${index + 1}`,
				text,
				verdict: normalizeVerdict(item.verdict),
				explanation: neutralizeFeedbackText(item.explanation?.trim() || text)
			};
		})
		.filter((item): item is NonNullable<typeof item> => Boolean(item));
	const contextChecklistRows = context.checklist.map((item) => {
		const grade = checklistById.get(item.id);
		return {
			id: item.id,
			text: cleanMarkText(grade?.text?.trim() || item.text) || cleanMarkText(item.text),
			verdict: normalizeVerdict(grade?.verdict),
			explanation: neutralizeFeedbackText(
				grade?.explanation?.trim() || 'Compared with this marking point.'
			)
		};
	});
	const checklist = completeChecklistRows({
		context,
		rows: modelChecklistRows.length ? modelChecklistRows : contextChecklistRows,
		awardedMarks,
		gradeableMarks,
		nextStep
	});

	return {
		questionId: context.question.id,
		ref: context.question.source_question_ref,
		status: 'graded',
		result,
		awardedMarks,
		maxMarks,
		gradeableMarks,
		confidence: modelResult?.confidence ?? 'medium',
		summary,
		nextStep,
		checklist,
		chain: context.chain
			? {
					id: context.chain.id,
					title: context.chain.title,
					canonicalText: context.chain.canonicalText,
					steps: context.chain.steps.map((step) => {
						const grade = chainById.get(step.id);
						return {
							id: step.id,
							text: step.text,
							role: step.role,
							verdict: normalizeVerdict(grade?.verdict),
							explanation: grade?.explanation?.trim() || 'Compared with this answer-chain link.'
						};
					})
				}
			: null,
		modelAnswer: context.modelAnswer,
		warnings: context.warnings
	};
}

export async function gradeExperimentQuestionAnswers({
	paperSlug,
	ref,
	answers,
	platformEnv,
	signal,
	onDelta,
	includeDebugPrompt = false,
	modelOverride,
	thinkingLevelOverride
}: {
	paperSlug: string;
	ref: string;
	answers: Record<string, string>;
	platformEnv?: unknown;
	signal?: AbortSignal;
	onDelta?: (delta: GradeStreamDelta) => void;
	includeDebugPrompt?: boolean;
	modelOverride?: string;
	thinkingLevelOverride?: ExperimentThinkingLevel;
}): Promise<ExperimentGradeResponse> {
	const contexts = await getGradeContexts(paperSlug, ref);
	const answered = contexts.filter((context) =>
		answers[context.question.source_question_ref]?.trim()
	);
	const gradeable = answered.filter((context) => context.gradeable);
	const notGradeable = answered.filter((context) => !context.gradeable);
	const unanswered = contexts.filter(
		(context) => !answers[context.question.source_question_ref]?.trim()
	);

	let modelResults: ModelGradePayload['results'] = [];
	let modelName = 'deterministic';
	let modelVersion = 'deterministic';
	let modelThinkingLevel: string | undefined;
	let modelUsage: ExperimentGradeResponse['usage'] | undefined;
	let modelCostUsd: number | undefined;
	let debugPrompt: string | undefined;
	const deterministicResults = new Map<string, ExperimentQuestionGradeResult>();
	for (const context of answered) {
		const fixedResult = deterministicFixedAnswerResult(
			context,
			answers[context.question.source_question_ref]?.trim() ?? ''
		);
		if (fixedResult) {
			deterministicResults.set(context.question.id, fixedResult);
		}
	}

	const llmGradeable = gradeable.filter(
		(context) => !deterministicResults.has(context.question.id) && shouldUseLlmGrading(context)
	);

	if (llmGradeable.length > 0) {
		try {
			const model = gradingModel(modelOverride);
			const thinking = selectedThinkingLevel(thinkingLevelOverride);
			modelName = model;
			modelThinkingLevel = thinking ?? 'none';
			assertModelCredentialsAvailable(platformEnv, model);
			configureLlmProcessEnv(platformEnv, model);
			onDelta?.({ type: 'status', phase: 'calling' });
			const { streamText } = await import('@ljoukov/llm');
			const prompt = buildPrompt(llmGradeable, answers);
			if (includeDebugPrompt) debugPrompt = prompt;
			const call = streamText({
				model,
				input: prompt,
				...(thinking ? { thinkingLevel: thinking } : {}),
				signal,
				telemetry: false
			});

			let rawText = '';
			let sawThought = true;
			let sawResponse = false;
			onDelta?.({ type: 'status', phase: 'thinking' });
			for await (const event of call.events) {
				if (event.type !== 'delta') continue;
				if (event.channel === 'thought') {
					if (!sawThought) {
						sawThought = true;
						onDelta?.({ type: 'status', phase: 'thinking' });
					}
					onDelta?.({ type: 'thought', delta: event.text });
					continue;
				}
				if (event.channel === 'response') {
					rawText += event.text;
					if (!sawResponse) {
						sawResponse = true;
						onDelta?.({ type: 'status', phase: 'grading' });
					}
					onDelta?.({ type: 'text', delta: event.text });
				}
			}
			const result = await call.result;
			modelVersion = result.modelVersion;
			modelUsage = result.usage;
			modelCostUsd = result.costUsd;
			modelResults = parseModelJson(rawText.trim() || result.text).results ?? [];
		} catch (error) {
			throw new QuestionGradeRuntimeError('stream_events', error);
		}
	} else if (answered.length > 0) {
		onDelta?.({ type: 'status', phase: 'grading' });
	}

	const modelByQuestion = new Map(
		modelResults.map((result) => [result.questionId ?? result.ref ?? '', result])
	);

	const results = [
		...gradeable.map((context) => {
			const deterministicResult = deterministicResults.get(context.question.id);
			if (deterministicResult) return deterministicResult;
			if (!shouldUseLlmGrading(context)) return notGradeableResult(context);
			return mergeModelResult(
				context,
				modelByQuestion.get(context.question.id) ??
					modelByQuestion.get(context.question.source_question_ref)
			);
		}),
		...notGradeable.map(
			(context) => deterministicResults.get(context.question.id) ?? notGradeableResult(context)
		),
		...unanswered.map(unansweredResult)
	].sort((a, b) => {
		const left =
			contexts.find((context) => context.question.id === a.questionId)?.question.display_order ?? 0;
		const right =
			contexts.find((context) => context.question.id === b.questionId)?.question.display_order ?? 0;
		return left - right;
	});

	const totals = results.reduce(
		(total, result) => {
			total.maxMarks += result.maxMarks;
			if (result.status === 'graded' && result.awardedMarks !== null) {
				total.awardedMarks += result.awardedMarks;
				total.gradeableMarks += result.gradeableMarks;
				total.ungradedMarks += Math.max(0, result.maxMarks - result.gradeableMarks);
			} else {
				total.gradeableMarks += result.gradeableMarks;
				total.ungradedMarks += Math.max(0, result.maxMarks - result.gradeableMarks);
			}
			return total;
		},
		{ awardedMarks: 0, maxMarks: 0, gradeableMarks: 0, ungradedMarks: 0 }
	);

	return {
		status: 'ok',
		paperSlug,
		ref,
		model: modelName,
		modelVersion,
		...(modelThinkingLevel ? { thinkingLevel: modelThinkingLevel } : {}),
		...(modelUsage ? { usage: modelUsage } : {}),
		...(typeof modelCostUsd === 'number' ? { costUsd: modelCostUsd } : {}),
		totals,
		results,
		...(debugPrompt ? { debugPrompt } : {})
	};
}
