import { env } from '$env/dynamic/private';
import { getPracticePageData, type PracticePageData } from '$lib/server/questionData';
import { configureChatGptCodexProxy, type LlmStreamEvent, type LlmTextModelId } from '@ljoukov/llm';
import { startModelAnalytics } from '$lib/server/analytics';

const GRADING_MODEL: LlmTextModelId = 'chatgpt-gpt-5.5-fast';
const GRADING_THINKING_LEVEL = 'medium';
const NONE = 'none';
const CHATGPT_CODEX_PROXY_ENV_KEYS = [
	'CHATGPT_CODEX_PROXY_URL',
	'CHATGPT_CODEX_PROXY_API_KEY'
] as const;

const QUESTION_GUIDANCE_KEYS = [
	['gradingProfile', 'Grading profile'],
	['ocrSectionBMarking', 'OCR Section B marking rules'],
	['markSchemeGuidance', 'Mark-scheme indicative credit'],
	['examinerReportGuidance', 'Examiner-report guidance']
] as const;

export type QuestionGradeStage =
	| 'load_question'
	| 'build_prompt'
	| 'configure_llm_env'
	| 'import_llm'
	| 'start_stream'
	| 'stream_events'
	| 'collect_result'
	| 'parse_result';

export class QuestionGradeRuntimeError extends Error {
	readonly stage: QuestionGradeStage;
	override readonly cause: unknown;

	constructor(stage: QuestionGradeStage, cause: unknown) {
		const causeMessage = cause instanceof Error ? cause.message : String(cause);
		super(`Question grading failed during ${stage}: ${causeMessage}`, { cause });
		this.name = 'QuestionGradeRuntimeError';
		this.stage = stage;
		this.cause = cause;
	}
}

export type GradeStreamDelta =
	| { type: 'status'; phase: 'calling' | 'thinking' | 'grading' }
	| { type: 'thought'; delta: string }
	| { type: 'text'; delta: string };

export type QuestionGradeResult = {
	status: 'ok';
	result: 'correct' | 'partial' | 'incorrect';
	awardedMarks: number;
	maxMarks: number;
	presentStepIds: string[];
	missingStepIds: string[];
	feedbackMarkdown: string;
	thinkingMarkdown: string | null;
	model: string;
	modelVersion: string;
};

function getPlatformEnvValue(platformEnv: unknown, key: string): string | undefined {
	if (!platformEnv || typeof platformEnv !== 'object') return undefined;
	const value = (platformEnv as Record<string, unknown>)[key];
	return typeof value === 'string' && value.trim() ? value : undefined;
}

function modelUsesCodexProxy(model: string): boolean {
	return model.startsWith('chatgpt-') || model.startsWith('experimental-chatgpt-');
}

function getRuntimeEnvValue(platformEnv: unknown, key: string): string | undefined {
	return getPlatformEnvValue(platformEnv, key) ?? env[key as keyof typeof env] ?? process.env[key];
}

function setProcessEnvFromRuntime(platformEnv: unknown, key: string): void {
	const value = getRuntimeEnvValue(platformEnv, key);
	if (value) process.env[key] = value;
}

function hasCodexProxyConfig(platformEnv?: unknown): boolean {
	const hasUrl = Boolean(getRuntimeEnvValue(platformEnv, 'CHATGPT_CODEX_PROXY_URL'));
	const hasKey = Boolean(getRuntimeEnvValue(platformEnv, 'CHATGPT_CODEX_PROXY_API_KEY'));
	return hasUrl && hasKey;
}

export function configureLlmProcessEnv(platformEnv?: unknown, model: string = GRADING_MODEL): void {
	if (modelUsesCodexProxy(model)) {
		if (!hasCodexProxyConfig(platformEnv)) {
			throw new Error('Vercel Codex proxy credentials are required for ChatGPT grading.');
		}
		configureChatGptCodexProxy({
			url: getRuntimeEnvValue(platformEnv, 'CHATGPT_CODEX_PROXY_URL') ?? '',
			apiKey: getRuntimeEnvValue(platformEnv, 'CHATGPT_CODEX_PROXY_API_KEY') ?? ''
		});
		for (const key of CHATGPT_CODEX_PROXY_ENV_KEYS) {
			setProcessEnvFromRuntime(platformEnv, key);
		}
	}
	process.env.CHATGPT_RESPONSES_WEBSOCKET_MODE = 'off';
}

function clampMark(value: number, maxMarks: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(maxMarks, Math.round(value)));
}

function normalizeListField(value: string | undefined, allowedIds: Set<string>): string[] {
	if (!value) return [];
	const trimmed = value.trim();
	if (!trimmed || trimmed.toLowerCase() === NONE) return [];

	const seen = new Set<string>();
	const selected: string[] = [];
	for (const item of trimmed.split(/[,\n]/)) {
		const id = item.trim();
		if (!allowedIds.has(id) || seen.has(id)) continue;
		seen.add(id);
		selected.push(id);
	}
	return selected;
}

function readField(rawText: string, field: string): string | undefined {
	const match = rawText.match(new RegExp(`^%${field}%:\\s*(.*)$`, 'im'));
	return match?.[1]?.trim();
}

function readFeedback(rawText: string): string {
	const match = rawText.match(/^%FEEDBACK%:\s*([\s\S]*)$/im);
	const feedback = match?.[1]?.trim();
	if (feedback) return feedback;

	const fallback = rawText
		.replace(/^%RESULT%:.*$/gim, '')
		.replace(/^%AWARDED_MARKS%:.*$/gim, '')
		.replace(/^%MAX_MARKS%:.*$/gim, '')
		.replace(/^%PRESENT_STEP_IDS%:.*$/gim, '')
		.replace(/^%MISSING_STEP_IDS%:.*$/gim, '')
		.replace(/^%FEEDBACK%:/gim, '')
		.trim();
	return fallback || 'Your answer has been checked against the answer chain.';
}

function lastMarkdownParagraph(value: string): string | null {
	const paragraphs = value
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);
	return paragraphs.at(-1) ?? null;
}

export function parseGradeResponse(rawText: string, data: PracticePageData): QuestionGradeResult {
	const allowedIds = new Set(data.chain.steps.map((step) => step.id));
	const maxMarks = data.question.meta.marks;
	const awardedMarks = clampMark(
		Number.parseInt(readField(rawText, 'AWARDED_MARKS') ?? '', 10),
		maxMarks
	);
	let presentStepIds = normalizeListField(readField(rawText, 'PRESENT_STEP_IDS'), allowedIds);
	let missingStepIds = normalizeListField(readField(rawText, 'MISSING_STEP_IDS'), allowedIds);

	if (presentStepIds.length === 0 && missingStepIds.length === 0) {
		missingStepIds = data.chain.steps.map((step) => step.id);
	}
	if (missingStepIds.length === 0 && presentStepIds.length > 0) {
		const present = new Set(presentStepIds);
		missingStepIds = data.chain.steps.map((step) => step.id).filter((id) => !present.has(id));
	}
	if (presentStepIds.length === 0 && missingStepIds.length > 0) {
		const missing = new Set(missingStepIds);
		presentStepIds = data.chain.steps.map((step) => step.id).filter((id) => !missing.has(id));
	}

	const correctThreshold = Math.ceil(maxMarks * 0.85);
	const result: QuestionGradeResult['result'] =
		awardedMarks <= 0
			? 'incorrect'
			: awardedMarks >= correctThreshold && missingStepIds.length === 0
				? 'correct'
				: 'partial';

	return {
		status: 'ok',
		result,
		awardedMarks,
		maxMarks,
		presentStepIds,
		missingStepIds,
		feedbackMarkdown: readFeedback(rawText),
		thinkingMarkdown: null,
		model: GRADING_MODEL,
		modelVersion: GRADING_MODEL
	};
}

function stepSelectionList(data: PracticePageData): string {
	const isEnglish = isEnglishPracticeQuestion(data);
	return data.chain.steps
		.map((step, index) => {
			const checklistItem = data.question.checklist.find((item) => item.stepId === step.id);
			return [
				`${index + 1}. id: ${step.id}`,
				`   ${isEnglish ? 'diagnostic criterion' : 'chain link'}: ${step.label}`,
				`   mark/checklist point: ${checklistItem?.text ?? step.markEvidence}`
			].join('\n');
		})
		.join('\n');
}

function compactPromptValue(value: unknown): string {
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function buildQuestionSpecificGuidance(data: PracticePageData): string {
	const metadata = data.question.renderingOverlay?.metadata;
	if (!metadata) return '';

	return QUESTION_GUIDANCE_KEYS.map(([key, label]) => {
		const value = metadata[key];
		if (value === undefined || value === null || value === '') return '';
		return `${label}:\n${compactPromptValue(value)}`;
	})
		.filter(Boolean)
		.join('\n\n');
}

function isEnglishLiteratureExtendedResponse(data: PracticePageData): boolean {
	const profile = data.question.renderingOverlay?.metadata?.gradingProfile;
	return (
		/english literature/i.test(data.question.meta.subject) ||
		(typeof profile === 'string' && /english-literature/i.test(profile))
	);
}

function isEnglishPracticeQuestion(data: PracticePageData): boolean {
	const profile = data.question.renderingOverlay?.metadata?.gradingProfile;
	return (
		/english/i.test(data.question.meta.subject) ||
		/english/i.test(data.question.meta.paper) ||
		(typeof profile === 'string' && /english/i.test(profile))
	);
}

function buildGradingMethod(data: PracticePageData): string {
	const isEnglish = isEnglishPracticeQuestion(data);
	const englishCapRule =
		data.question.meta.marks === 40
			? '- For this 40-mark OCR Shakespeare extract question, no meaningful wider-play reference means a maximum of 22/40; only brief or name-dropped wider reference means a maximum of 28/40. If you mention one of these caps in feedback, the awarded mark must obey it.'
			: '- Convert any question-specific extract or wider-text cap into a hard ceiling on the awarded mark. If you mention a cap in feedback, the awarded mark must obey it.';
	const generalMethod = [
		'Grading method:',
		'1. Read the student answer as a whole before selecting steps.',
		'2. Award marks for correct exam-relevant ideas, not exact wording.',
		`3. Treat the listed ${isEnglish ? 'diagnostic criteria' : 'answer-chain steps'} as diagnostic categories for the UI. They are not automatically equal mark buckets.`,
		`4. Mark a ${isEnglish ? 'criterion' : 'step'} present only when the answer makes that move clearly enough to earn credit; mark it missing when absent, vague, or only named without use.`,
		'5. Credit valid alternative wording or a different defensible interpretation when it fits the mark scheme.'
	];

	if (!isEnglishLiteratureExtendedResponse(data)) return generalMethod.join('\n');

	return [
		...generalMethod,
		'',
		'English Literature extended-response rules:',
		'- Apply the OCR level descriptors holistically first, then choose the total mark.',
		'- The mark is out of the full question total, including SPaG/AO4 when the question includes it.',
		'- Do not require every example from the model answer or indicative content; they are possible routes, not a checklist.',
		'- Reward a controlled argument, precise references, analysis of language/form/structure, wider-text links, relevant context, and clear expression.',
		'- Be alert to OCR caps: an extract-only answer should not normally go beyond Level 3 content, and a brief wider-text reference should not normally go beyond Level 4 content.',
		englishCapRule,
		'- Do not reward plot retelling, unsupported assertions, bolted-on context, or confused context just because it contains relevant names.',
		'- If the answer is nearly good, feedback should tell the student what to tighten. If it is very weak, give one concrete next sentence or reference to add.'
	].join('\n');
}

function buildQuestionContext(data: PracticePageData): string {
	const parts = [
		data.question.context ? `Question context:\n${data.question.context}` : '',
		`Question prompt:\n${data.question.prompt}`,
		`Model answer:\n${data.question.modelAnswer}`,
		`Common weak answer:\n${data.question.commonWeakAnswer}`,
		data.question.commonWeakExplanation
			? `Why that weak answer fails:\n${data.question.commonWeakExplanation}`
			: ''
	].filter(Boolean);
	return parts.join('\n\n');
}

export function buildGradePrompt(data: PracticePageData, studentAnswer: string): string {
	const questionSpecificGuidance = buildQuestionSpecificGuidance(data);
	const isEnglish = isEnglishPracticeQuestion(data);
	return [
		'You are grading one GCSE free-text answer for an online practice question.',
		`Use the exact ${isEnglish ? 'diagnostic criterion' : 'answer-chain step'} ids listed below. Do not invent ids.`,
		'Your job is to give fair examiner-style feedback, not to write a chatty tutor response.',
		'',
		buildGradingMethod(data),
		'',
		'Return plain text only, exactly in this field format:',
		'%RESULT%: correct|partial|incorrect',
		`%AWARDED_MARKS%: integer from 0 to ${data.question.meta.marks}`,
		`%MAX_MARKS%: ${data.question.meta.marks}`,
		`%PRESENT_STEP_IDS%: comma-separated exact ids from the list, or ${NONE}`,
		`%MISSING_STEP_IDS%: comma-separated exact ids from the list, or ${NONE}`,
		'%FEEDBACK%:',
		'Short Markdown feedback in 3-5 bullets. Include the mark reason, what already earns credit, and the highest-value next repair.',
		'When helpful, include one improved sentence that stays close to the student answer rather than a full replacement essay.',
		'Use "correct" only for a secure high-scoring answer with no missing diagnostic step, "partial" for any meaningful credit below that or with any missing step, and "incorrect" for no meaningful credit.',
		'',
		'Exam metadata:',
		`${data.question.meta.board} ${data.question.meta.qualification} ${data.question.meta.subject} ${data.question.meta.tier}`,
		`${data.question.meta.paper}; topic: ${data.question.meta.topic}; marks: ${data.question.meta.marks}`,
		'',
		buildQuestionContext(data),
		questionSpecificGuidance
			? `\nQuestion-specific OCR guidance:\n${questionSpecificGuidance}`
			: '',
		'',
		`${isEnglish ? 'Diagnostic criteria' : 'Answer-chain steps'} to select from:`,
		stepSelectionList(data),
		'',
		'Student answer:',
		studentAnswer
	].join('\n');
}

export async function loadQuestionForGrading(questionId: string): Promise<PracticePageData> {
	return await getPracticePageData(questionId);
}

export async function gradeQuestionAnswerStreaming({
	questionId,
	studentAnswer,
	platformEnv,
	signal,
	onDelta
}: {
	questionId: string;
	studentAnswer: string;
	platformEnv?: unknown;
	signal?: AbortSignal;
	onDelta?: (delta: GradeStreamDelta) => void;
}): Promise<QuestionGradeResult> {
	let stage: QuestionGradeStage = 'load_question';
	let modelAnalytics: ReturnType<typeof startModelAnalytics> | null = null;
	try {
		const data = await loadQuestionForGrading(questionId);
		stage = 'build_prompt';
		const prompt = buildGradePrompt(data, studentAnswer);
		modelAnalytics = startModelAnalytics({
			feature: 'question_answer_grading',
			model: GRADING_MODEL,
			thinkingLevel: GRADING_THINKING_LEVEL,
			prompt,
			modelInput: { questionId, studentAnswer }
		});
		stage = 'configure_llm_env';
		configureLlmProcessEnv(platformEnv, GRADING_MODEL);
		onDelta?.({ type: 'status', phase: 'calling' });

		stage = 'import_llm';
		const { streamText } = await import('@ljoukov/llm');
		stage = 'start_stream';
		const call = streamText({
			model: GRADING_MODEL,
			input: prompt,
			thinkingLevel: GRADING_THINKING_LEVEL,
			signal,
			telemetry: false
		});

		let rawText = '';
		let thoughtText = '';
		let sawThought = false;
		let sawResponse = false;

		stage = 'stream_events';
		for await (const event of call.events) {
			handleStreamEvent(event, {
				onThought(text) {
					thoughtText += text;
					if (!sawThought) {
						sawThought = true;
						onDelta?.({ type: 'status', phase: 'thinking' });
					}
					onDelta?.({ type: 'thought', delta: text });
				},
				onResponse(text) {
					rawText += text;
					if (!sawResponse) {
						sawResponse = true;
						onDelta?.({ type: 'status', phase: 'grading' });
					}
					onDelta?.({ type: 'text', delta: text });
				}
			});
		}

		stage = 'collect_result';
		const llmResult = await call.result;
		const finalText = rawText.trim() ? rawText : llmResult.text;
		const finalThoughts = thoughtText.trim() ? thoughtText : llmResult.thoughts;
		modelAnalytics.complete({
			modelVersion: llmResult.modelVersion,
			output: finalText,
			reasoning: finalThoughts,
			usage: llmResult.usage,
			costUsd: llmResult.costUsd,
			metadata: { questionId }
		});
		stage = 'parse_result';
		return {
			...parseGradeResponse(finalText, data),
			thinkingMarkdown: lastMarkdownParagraph(finalThoughts),
			modelVersion: llmResult.modelVersion
		};
	} catch (error) {
		modelAnalytics?.fail(error, { metadata: { questionId, stage } });
		throw new QuestionGradeRuntimeError(stage, error);
	}
}

function handleStreamEvent(
	event: LlmStreamEvent,
	handlers: { onThought: (text: string) => void; onResponse: (text: string) => void }
): void {
	if (event.type !== 'delta') return;
	if (event.channel === 'thought') {
		handlers.onThought(event.text);
		return;
	}
	if (event.channel === 'response') {
		handlers.onResponse(event.text);
	}
}
