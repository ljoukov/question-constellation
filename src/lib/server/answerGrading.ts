import { env } from '$env/dynamic/private';
import { getPracticePageData, type PracticePageData } from '$lib/server/questionData';
import { configureChatGptCodexProxy, type LlmStreamEvent, type LlmTextModelId } from '@ljoukov/llm';

const GRADING_MODEL: LlmTextModelId = 'chatgpt-gpt-5.3-codex-spark';
const GRADING_THINKING_LEVEL = 'medium';
const NONE = 'none';
const CHATGPT_CODEX_PROXY_ENV_KEYS = [
	'CHATGPT_CODEX_PROXY_URL',
	'CHATGPT_CODEX_PROXY_API_KEY'
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

	const explicitResult = readField(rawText, 'RESULT')?.toLowerCase();
	const result: QuestionGradeResult['result'] =
		explicitResult === 'correct' || explicitResult === 'partial' || explicitResult === 'incorrect'
			? explicitResult
			: awardedMarks >= maxMarks
				? 'correct'
				: awardedMarks === 0
					? 'incorrect'
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
	return data.chain.steps
		.map((step, index) => {
			const checklistItem = data.question.checklist.find((item) => item.stepId === step.id);
			return [
				`${index + 1}. id: ${step.id}`,
				`   chain link: ${step.label}`,
				`   mark/checklist point: ${checklistItem?.text ?? step.markEvidence}`
			].join('\n');
		})
		.join('\n');
}

function buildQuestionContext(data: PracticePageData): string {
	const parts = [
		data.question.context ? `Question context:\n${data.question.context}` : '',
		`Question prompt:\n${data.question.prompt}`,
		`Model answer:\n${data.question.modelAnswer}`,
		`Common weak answer:\n${data.question.commonWeakAnswer}`
	].filter(Boolean);
	return parts.join('\n\n');
}

export function buildGradePrompt(data: PracticePageData, studentAnswer: string): string {
	return [
		'You are grading one GCSE science free-text answer for an online practice question.',
		'Use the exact answer-chain step ids listed below. Do not invent ids.',
		'Select which listed steps are clearly present in the student answer and which are missing.',
		'Award marks for correct science ideas, not for exact wording. Keep feedback short and student-facing.',
		'',
		'Return plain text only, exactly in this field format:',
		'%RESULT%: correct|partial|incorrect',
		`%AWARDED_MARKS%: integer from 0 to ${data.question.meta.marks}`,
		`%MAX_MARKS%: ${data.question.meta.marks}`,
		`%PRESENT_STEP_IDS%: comma-separated exact ids from the list, or ${NONE}`,
		`%MISSING_STEP_IDS%: comma-separated exact ids from the list, or ${NONE}`,
		'%FEEDBACK%:',
		'Short Markdown feedback in 2-5 bullets. Mention what was present and the next repair move.',
		'',
		'Exam metadata:',
		`${data.question.meta.board} ${data.question.meta.qualification} ${data.question.meta.subject} ${data.question.meta.tier}`,
		`${data.question.meta.paper}; topic: ${data.question.meta.topic}; marks: ${data.question.meta.marks}`,
		'',
		buildQuestionContext(data),
		'',
		'Answer-chain steps to select from:',
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
	try {
		const data = await loadQuestionForGrading(questionId);
		stage = 'build_prompt';
		const prompt = buildGradePrompt(data, studentAnswer);
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
		stage = 'parse_result';
		return {
			...parseGradeResponse(finalText, data),
			thinkingMarkdown: lastMarkdownParagraph(finalThoughts),
			modelVersion: llmResult.modelVersion
		};
	} catch (error) {
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
