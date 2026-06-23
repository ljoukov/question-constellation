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

const DEFAULT_MODEL = 'gpt-5.5-fast';
const DEFAULT_THINKING_LEVEL = 'medium';

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

type FixedResponse =
	| {
			kind: 'image-label-zones';
			zones: Array<{ id: string; label: string }>;
			correctAnswers: Record<string, string>;
	  }
	| {
			kind: 'choice';
			options: string[];
	  }
	| {
			kind: 'choice-table';
			columns: string[];
			rows: string[][];
	  }
	| {
			kind: 'matching';
			leftTitle: string | null;
			rightTitle: string | null;
			left: string[];
			right: string[];
	  }
	| {
			kind: 'equation-blanks';
			blanks: Array<{ id: string; label: string }>;
	  }
	| {
			kind: 'number-line';
			label: string;
			prefix: string | null;
			unit: string | null;
	  }
	| {
			kind: 'labeled-lines';
			labels: string[];
			lineCount: number | null;
	  };

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

function gradingModel(): LlmTextModelId {
	return (env.EXPERIMENT_GRADING_MODEL || DEFAULT_MODEL) as LlmTextModelId;
}

function thinkingLevel(): LlmThinkingLevel {
	return (env.EXPERIMENT_GRADING_THINKING_LEVEL || DEFAULT_THINKING_LEVEL) as LlmThinkingLevel;
}

function platformEnvValue(platformEnv: unknown, key: string): string | undefined {
	if (!platformEnv || typeof platformEnv !== 'object') return undefined;
	const value = (platformEnv as Record<string, unknown>)[key];
	return typeof value === 'string' && value.trim() ? value : undefined;
}

function hasEnvValue(platformEnv: unknown, key: string) {
	return Boolean(platformEnvValue(platformEnv, key) ?? env[key as keyof typeof env]);
}

function assertModelCredentialsAvailable(platformEnv: unknown, model: string) {
	if (model.startsWith('gpt-')) {
		if (hasEnvValue(platformEnv, 'OPENAI_API_KEY')) return;
		throw new Error('OPENAI_API_KEY is required for experiment grading with OpenAI API models.');
	}

	if (model.startsWith('chatgpt-') || model.startsWith('experimental-chatgpt-')) {
		if (
			hasEnvValue(platformEnv, 'CHATGPT_AUTH_TOKEN_PROVIDER_URL') &&
			(hasEnvValue(platformEnv, 'CHATGPT_AUTH_TOKEN_PROVIDER_API_KEY') ||
				hasEnvValue(platformEnv, 'CHATGPT_AUTH_API_KEY'))
		) {
			return;
		}
		throw new Error(
			'ChatGPT token-provider credentials are required for experiment grading with ChatGPT models.'
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

function responseFromRenderJson(raw: string | null): FixedResponse | null {
	const render = parseJson<{ response?: unknown }>(raw, {});
	const response = render.response;
	if (!response || typeof response !== 'object') return null;
	const value = response as Record<string, unknown>;

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
		return {
			kind: 'choice',
			options: value.options.filter((option): option is string => typeof option === 'string')
		};
	}

	if (value.kind === 'choice-table' && Array.isArray(value.columns) && Array.isArray(value.rows)) {
		return {
			kind: 'choice-table',
			columns: value.columns.filter((column): column is string => typeof column === 'string'),
			rows: value.rows
				.filter((row): row is unknown[] => Array.isArray(row))
				.map((row) => row.filter((cell): cell is string => typeof cell === 'string'))
		};
	}

	if (value.kind === 'matching' && Array.isArray(value.left) && Array.isArray(value.right)) {
		return {
			kind: 'matching',
			leftTitle: typeof value.leftTitle === 'string' ? value.leftTitle : null,
			rightTitle: typeof value.rightTitle === 'string' ? value.rightTitle : null,
			left: value.left.filter((item): item is string => typeof item === 'string'),
			right: value.right.filter((item): item is string => typeof item === 'string')
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
				.filter((blank): blank is { id: string; label: string } => Boolean(blank))
		};
	}

	if (value.kind === 'number-line' && typeof value.label === 'string') {
		return {
			kind: 'number-line',
			label: value.label,
			prefix: typeof value.prefix === 'string' ? value.prefix : null,
			unit: typeof value.unit === 'string' ? value.unit : null
		};
	}

	if (value.kind === 'labeled-lines' && Array.isArray(value.labels)) {
		return {
			kind: 'labeled-lines',
			labels: value.labels.filter((label): label is string => typeof label === 'string'),
			lineCount: typeof value.lineCount === 'number' ? value.lineCount : null
		};
	}

	return null;
}

function mergeResponseAnswerKey(
	questionId: string,
	response: FixedResponse | null,
	rows: ResponseAnswerKeyRow[]
): FixedResponse | null {
	if (response?.kind !== 'image-label-zones') return response;
	const rowAnswers = Object.fromEntries(
		rows
			.filter((row) => row.correct_answer.trim())
			.map((row) => [row.target_id, row.correct_answer.trim()])
	);
	return {
		...response,
		correctAnswers: {
			...imageLabelAnswerKeyForQuestion(questionId),
			...response.correctAnswers,
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

function canGradeDeterministically(
	response: FixedResponse | null
): response is Extract<FixedResponse, { kind: 'image-label-zones' }> {
	return response?.kind === 'image-label-zones' && !imageLabelResponseNeedsAnswerKey(response);
}

function responsePromptDetails(response: FixedResponse | null) {
	if (!response) return null;
	if (response.kind === 'choice') {
		return [
			'The learner selects one option.',
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
					'This label question is missing a complete imported answer key, so it will be checked from mark-scheme evidence.'
				);
			} else if (
				response &&
				!canGradeDeterministically(response) &&
				evidence.responseAnswerKeys.length === 0
			) {
				warnings.push('No structured response answer key is stored for this interaction yet.');
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
					? Math.min(maxMarks, response.zones.length)
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
		entries.set(match[1].trim().toLowerCase(), match[2].trim());
	}
	return entries;
}

function normalizedAnswer(value: string) {
	return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function deterministicFixedAnswerResult(
	context: GradeableQuestionContext,
	rawAnswer: string
): ExperimentQuestionGradeResult | null {
	const response = context.response;
	if (response?.kind !== 'image-label-zones') return null;
	if (imageLabelResponseNeedsAnswerKey(response)) return notGradeableResult(context);

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
		warnings: ['Checked deterministically from the imported response answer key; no LLM was used.']
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
	includeDebugPrompt = false
}: {
	paperSlug: string;
	ref: string;
	answers: Record<string, string>;
	platformEnv?: unknown;
	signal?: AbortSignal;
	onDelta?: (delta: GradeStreamDelta) => void;
	includeDebugPrompt?: boolean;
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
	let debugPrompt: string | undefined;
	const deterministicResults = new Map<string, ExperimentQuestionGradeResult>();
	const fixedAnswered = answered.filter((context) => canGradeDeterministically(context.response));
	for (const context of fixedAnswered) {
		const fixedResult = deterministicFixedAnswerResult(
			context,
			answers[context.question.source_question_ref]?.trim() ?? ''
		);
		if (fixedResult) {
			deterministicResults.set(context.question.id, fixedResult);
		}
	}

	const llmGradeable = gradeable.filter(
		(context) => !deterministicResults.has(context.question.id)
	);

	if (llmGradeable.length > 0) {
		try {
			modelName = gradingModel();
			assertModelCredentialsAvailable(platformEnv, gradingModel());
			configureLlmProcessEnv(platformEnv);
			onDelta?.({ type: 'status', phase: 'calling' });
			const { streamText } = await import('@ljoukov/llm');
			const prompt = buildPrompt(llmGradeable, answers);
			if (includeDebugPrompt) debugPrompt = prompt;
			const call = streamText({
				model: gradingModel(),
				input: prompt,
				thinkingLevel: thinkingLevel(),
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
		totals,
		results,
		...(debugPrompt ? { debugPrompt } : {})
	};
}
