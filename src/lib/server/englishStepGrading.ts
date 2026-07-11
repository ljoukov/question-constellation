import { configureLlmProcessEnv } from '$lib/server/answerGrading';
import {
	getPracticePageData,
	type EnglishPracticeData,
	type EnglishPracticeStage
} from '$lib/server/questionData';
import { type LlmStreamEvent, type LlmTextModelId } from '@ljoukov/llm';
import { z } from 'zod';

const STEP_GRADING_MODEL: LlmTextModelId = 'chatgpt-gpt-5.5-fast';
const STEP_GRADING_THINKING_LEVEL = 'medium';

export type EnglishStepCheck = {
	id: string;
	label: string;
	status: 'met' | 'not_yet';
	feedback: string;
};

export type EnglishStepGradeResult = {
	status: 'ok';
	decision: 'pass' | 'revise';
	stepId: string;
	checkedAnswer: string;
	checks: EnglishStepCheck[];
	nextImprovement: string;
	coachingNote: string;
	learnerModel: EnglishLearnerModel;
	confidence: number;
	model: string;
	modelVersion: string;
};

export type EnglishLearnerModel = {
	observedStrength: string;
	recurringNeed: string;
	nextStrategy: string;
};

export type EnglishLearnerAttempt = {
	stepId: string;
	stepTitle: string;
	answer: string;
	decision: 'pass' | 'revise';
	checks: EnglishStepCheck[];
	nextImprovement: string;
};

export type EnglishStepGradeDelta = {
	type: 'status';
	phase: 'calling' | 'thinking' | 'grading';
};

type StepCriterion = {
	id: string;
	label: string;
	description: string;
};

const rawStepResultSchema = z.object({
	decision: z.enum(['pass', 'revise']),
	checks: z
		.array(
			z.object({
				id: z.string().trim().min(1),
				label: z.string().trim().min(1),
				status: z.enum(['met', 'not_yet']),
				feedback: z.string().trim().min(1).max(500)
			})
		)
		.min(1)
		.max(8),
	nextImprovement: z.string().trim().min(1).max(600),
	coachingNote: z.string().trim().min(1).max(500),
	learnerModel: z.object({
		observedStrength: z.string().trim().min(1).max(300),
		recurringNeed: z.string().trim().min(1).max(300),
		nextStrategy: z.string().trim().min(1).max(300)
	}),
	confidence: z.number().min(0).max(1)
});

const criteriaByStepId: Record<string, StepCriterion[]> = {
	task: [
		{
			id: 'direct-comparison',
			label: 'Direct comparison',
			description:
				'Answers the exact question with an explicit contrast between the named subjects.'
		},
		{
			id: 'arguable-idea',
			label: 'Arguable idea',
			description: 'Makes a clear interpretation rather than retelling the plot or listing traits.'
		},
		{
			id: 'whole-text-direction',
			label: 'Whole-text direction',
			description: 'Establishes an argument that can work in the extract and across the wider text.'
		},
		{
			id: 'writer-significance',
			label: 'Writer’s purpose',
			description: 'Indicates what the writer reveals or explores through the contrast.'
		}
	],
	evidence: [
		{
			id: 'precise-reference',
			label: 'Precise reference',
			description:
				'Uses a specific quotation, word, action, or moment rather than a broad plot reference.'
		},
		{
			id: 'relevant-evidence',
			label: 'Relevant evidence',
			description: 'Directly supports the argument established in the previous step.'
		},
		{
			id: 'accurate-evidence',
			label: 'Accurate evidence',
			description: 'Does not invent or materially misrepresent the text.'
		},
		{
			id: 'analysable-detail',
			label: 'Analysable detail',
			description: 'Contains a concrete word, choice, or behaviour that can be analysed next.'
		}
	],
	method: [
		{
			id: 'meaningful-method',
			label: 'Meaningful method',
			description:
				'Identifies a relevant choice in language, form, structure, narration, or characterisation.'
		},
		{
			id: 'close-analysis',
			label: 'Close analysis',
			description:
				'Explains how the chosen detail creates meaning rather than merely naming a technique.'
		},
		{
			id: 'specific-effect',
			label: 'Specific effect',
			description: 'Explains a precise reader impression or idea, not a generic effect statement.'
		},
		{
			id: 'argument-link',
			label: 'Argument link',
			description: 'Connects the analysis back to the central comparison or interpretation.'
		}
	],
	wider: [
		{
			id: 'specific-wider-moment',
			label: 'Specific wider moment',
			description: 'Identifies a precise event, quotation, or behaviour elsewhere in the text.'
		},
		{
			id: 'same-argument',
			label: 'Connected argument',
			description: 'Clearly connects the wider moment to the argument built in earlier steps.'
		},
		{
			id: 'develops-idea',
			label: 'Develops the idea',
			description:
				'Extends, qualifies, or complicates the interpretation rather than simply repeating it.'
		},
		{
			id: 'accurate-wider-reference',
			label: 'Accurate reference',
			description: 'Represents the wider text accurately and does not invent evidence.'
		}
	],
	'full-answer': [
		{
			id: 'sustained-argument',
			label: 'Sustained argument',
			description: 'Maintains a clear answer to the exact question across the response.'
		},
		{
			id: 'extract-evidence',
			label: 'Extract evidence',
			description: 'Uses precise and relevant evidence from the printed material.'
		},
		{
			id: 'wider-evidence',
			label: 'Wider-text evidence',
			description: 'Uses precise and relevant evidence from elsewhere in the text.'
		},
		{
			id: 'developed-analysis',
			label: 'Developed analysis',
			description: 'Analyses the writer’s methods and connects them to the argument.'
		},
		{
			id: 'controlled-response',
			label: 'Controlled response',
			description:
				'Organises and expresses ideas clearly, with relevant context integrated where useful.'
		}
	],
	'direct-answer': [
		{
			id: 'answers-command',
			label: 'Direct answer',
			description: 'Answers the exact command word without writing around the question.'
		},
		{
			id: 'clear-idea',
			label: 'Clear idea',
			description: 'States a specific, defensible idea rather than a vague assertion.'
		}
	],
	'explain-effect': [
		{
			id: 'valid-inference',
			label: 'Valid inference',
			description: 'Draws a defensible meaning or effect from the selected evidence.'
		},
		{
			id: 'evidence-link',
			label: 'Evidence link',
			description: 'Explains how the evidence supports that inference.'
		},
		{
			id: 'specific-explanation',
			label: 'Specific explanation',
			description: 'Develops the idea beyond a generic statement about the reader.'
		}
	],
	'choice-form': [
		{
			id: 'clear-choice',
			label: 'Clear task choice',
			description: 'Makes the selected task unambiguous.'
		},
		{
			id: 'appropriate-form',
			label: 'Appropriate form',
			description: 'Identifies the conventions and voice required by the selected form.'
		}
	],
	'audience-purpose': [
		{
			id: 'clear-audience',
			label: 'Clear audience',
			description: 'Identifies who the response must address.'
		},
		{
			id: 'clear-purpose',
			label: 'Clear purpose',
			description: 'Defines the intended effect or change in the audience.'
		},
		{
			id: 'suitable-direction',
			label: 'Suitable direction',
			description: 'Sets a convincing overall position or narrative direction.'
		}
	],
	structure: [
		{
			id: 'clear-sequence',
			label: 'Clear sequence',
			description: 'Plans a purposeful beginning, development, and ending.'
		},
		{
			id: 'developing-moves',
			label: 'Developing moves',
			description:
				'Each planned section advances the response rather than repeating the same point.'
		}
	],
	language: [
		{
			id: 'appropriate-tone',
			label: 'Appropriate tone',
			description: 'Fits the selected audience, purpose, and form.'
		},
		{
			id: 'purposeful-choice',
			label: 'Purposeful choice',
			description: 'Uses vocabulary or sentence structure deliberately for an identifiable effect.'
		},
		{
			id: 'controlled-sentence',
			label: 'Controlled sentence',
			description: 'Is clear, accurate, and suitable for a high-quality final response.'
		}
	],
	'full-response': [
		{
			id: 'fulfils-task',
			label: 'Fulfils the task',
			description: 'Sustains the selected form, audience, and purpose.'
		},
		{
			id: 'controlled-structure',
			label: 'Controlled structure',
			description: 'Develops ideas in a deliberate and coherent sequence.'
		},
		{
			id: 'effective-language',
			label: 'Effective language',
			description: 'Uses varied, purposeful language and sentence choices.'
		},
		{
			id: 'technical-accuracy',
			label: 'Technical accuracy',
			description: 'Controls spelling, punctuation, grammar, and paragraphing securely.'
		}
	]
};

export function criteriaForEnglishStep(stage: EnglishPracticeStage): StepCriterion[] {
	if (stage.successCriteria?.length > 0) return stage.successCriteria;
	return (
		criteriaByStepId[stage.id] ?? [
			{
				id: 'meets-step-goal',
				label: 'Meets this step’s goal',
				description: stage.goal
			},
			{
				id: 'specific-and-developed',
				label: 'Specific and developed',
				description: 'Gives a precise, developed response rather than a vague or token answer.'
			}
		]
	);
}

function stripCodeFence(text: string) {
	const trimmed = text.trim();
	const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	return match?.[1]?.trim() ?? trimmed;
}

export function parseEnglishStepGradeResponse(
	rawText: string,
	stage: EnglishPracticeStage,
	checkedAnswer: string,
	modelVersion: string
): EnglishStepGradeResult {
	const parsed = rawStepResultSchema.parse(JSON.parse(stripCodeFence(rawText)));
	const suppliedChecks = new Map(parsed.checks.map((check) => [check.id, check]));
	const checks = criteriaForEnglishStep(stage).map<EnglishStepCheck>((criterion) => {
		const supplied = suppliedChecks.get(criterion.id);
		return {
			id: criterion.id,
			label: criterion.label,
			status: supplied?.status ?? 'not_yet',
			feedback:
				supplied?.feedback ??
				`This response does not yet show ${criterion.label.toLowerCase()} clearly enough.`
		};
	});
	const allChecksMet = checks.every((check) => check.status === 'met');

	return {
		status: 'ok',
		decision: parsed.decision === 'pass' && allChecksMet ? 'pass' : 'revise',
		stepId: stage.id,
		checkedAnswer,
		checks,
		nextImprovement: parsed.nextImprovement,
		coachingNote: parsed.coachingNote,
		learnerModel: parsed.learnerModel,
		confidence: parsed.confidence,
		model: STEP_GRADING_MODEL,
		modelVersion
	};
}

function buildLearnerHistory(attemptHistory: EnglishLearnerAttempt[]) {
	if (attemptHistory.length === 0)
		return 'No earlier checks. Base the learner model only on this response.';
	return attemptHistory
		.slice(-12)
		.map((attempt, index) => {
			const met = attempt.checks
				.filter((check) => check.status === 'met')
				.map((check) => check.label)
				.join(', ');
			const notYet = attempt.checks
				.filter((check) => check.status === 'not_yet')
				.map((check) => check.label)
				.join(', ');
			return [
				`Attempt ${index + 1}: ${attempt.stepTitle} (${attempt.decision})`,
				`Response: ${attempt.answer}`,
				`Met: ${met || 'none'}`,
				`Not yet: ${notYet || 'none'}`,
				`Previous next action: ${attempt.nextImprovement}`
			].join('\n');
		})
		.join('\n\n');
}

function buildMarkSchemeEvidence(practice: EnglishPracticeData) {
	if (!practice.markSchemeItems?.length) {
		return 'No raw mark-scheme rows are available. Do not pretend to verify details that are not in the supplied bundle.';
	}
	return practice.markSchemeItems
		.slice(0, 24)
		.map(
			(item, index) =>
				`${index + 1}. [${item.itemType}] ${item.text}${item.sourceRef ? ` (${item.sourceRef})` : ''}`
		)
		.join('\n');
}

function buildExaminerGuidance(practice: EnglishPracticeData) {
	if (!practice.examinerGuidance?.length) {
		return 'No examiner-report guidance is available for this question. Do not claim that an examiner report says anything.';
	}
	return practice.examinerGuidance.map((line) => `- ${line}`).join('\n');
}

function buildPreviousStepContext(
	practice: EnglishPracticeData,
	stageIndex: number,
	stepAnswers: Record<string, string>
) {
	const previous = practice.stages
		.slice(0, stageIndex)
		.map((stage) => {
			const answer = stepAnswers[stage.id]?.trim();
			return answer ? `${stage.shortTitle}:\n${answer}` : '';
		})
		.filter(Boolean);
	return previous.length > 0 ? previous.join('\n\n') : 'No previous steps.';
}

export function buildEnglishStepGradePrompt({
	practice,
	stage,
	stageIndex,
	studentAnswer,
	stepAnswers,
	attemptHistory = []
}: {
	practice: EnglishPracticeData;
	stage: EnglishPracticeStage;
	stageIndex: number;
	studentAnswer: string;
	stepAnswers: Record<string, string>;
	attemptHistory?: EnglishLearnerAttempt[];
}) {
	const criteria = criteriaForEnglishStep(stage);
	const passingStandard = practice.isExtended
		? 'The standard is a secure Grade 7-quality execution of this particular skill.'
		: 'The standard is a clear response that would earn full credit for this short-answer step.';
	return [
		'You are a rigorous, encouraging GCSE English Literature step coach for a capable Grade 5-6 learner aiming for Grades 8-9.',
		'',
		'GROUNDING AND FAIRNESS',
		'Assess only the current step. Do not penalise the student for material that belongs to a later step.',
		'Use only the supplied question, context, imported mark scheme, available examiner guidance, model direction, and previous responses.',
		'Indicative-content examples are possible routes, not a compulsory checklist. Credit other defensible interpretations.',
		'Accept any defensible interpretation supported by the supplied material. Never require exact model wording.',
		'Never invent or silently repair a quotation. If the supplied bundle cannot verify a plausible reference, say it is not contradicted by the bundle rather than claiming it is verified.',
		'For comparison questions, a meaningful similarity, difference, or combination can pass. Never require contrast when the question only says compare.',
		'Do not require author or text names when “first/second” or “one/the other” unambiguously distinguishes both supplied texts. Naming them may be suggested as polish, but it is not a pass gate.',
		'',
		'PASS CALIBRATION',
		passingStandard,
		'Pass only when every listed check is clearly met. A vague, partial, unsupported, generic, or merely named idea does not pass.',
		'For a Task step, a broad moral such as "conflict is bad" or "forgiveness heals people" is not yet an interpretive argument unless the learner adds a precise, arguable insight about what the writer reveals.',
		'Judge each check independently. If three checks are met and one is missing, mark only that one not_yet.',
		'Once every check is clearly met, return pass even if the response could still be polished. Do not move the goalposts between retries.',
		'',
		'EDUCATIONAL FEEDBACK',
		'For every check, name the exact evidence in the student response that met it, or state the precise missing move.',
		'Give one highest-value next improvement that the learner can perform immediately.',
		'Do not write a complete replacement response. Preserve ownership: prefer a question, micro-edit, or short sentence frame tied to the learner’s own words.',
		'Use previous attempts to notice recurring skill patterns, but never label intelligence, ability, motivation, or personality.',
		'If there are no earlier checks, coachingNote must describe a current focus and must not call anything recurring.',
		'If the learner fixed earlier feedback, acknowledge that exact improvement in coachingNote.',
		'If a need recurs, name the recurring move and give one reusable strategy.',
		'',
		'CALIBRATION EXAMPLES',
		'Example 1 — comparison task response: "Both poems show conflict is bad."',
		'Outcome: revise. Exact focus may be partly present, but both texts are grouped vaguely, the comparative relationship is undeveloped, and no interpretation explains what the writers reveal.',
		'Useful next action: ask the learner to name what each poem emphasises and connect the relationship to the exact question. Do not supply a finished thesis.',
		'',
		'Example 2 — comparison task response: "Both speakers demand change, but the first makes peace sound communal while the second presents resistance as an urgent personal duty."',
		'Outcome: pass when those are the configured checks. It gives both texts, a clear comparative relationship and interpretive significance. Do not fail it merely because evidence comes later.',
		'',
		'Example 3 — method response: "The inclusive pronoun makes the reader feel involved and shows shared responsibility."',
		'If the current step requires analysis in both texts, mark close analysis and precise effect met, but mark the second-text method and method comparison not_yet. The next action should request only the missing comparative clause.',
		'',
		'Return JSON only, with exactly this shape:',
		'{',
		'  "decision": "pass" | "revise",',
		'  "checks": [',
		'    { "id": "exact-check-id", "label": "short label", "status": "met" | "not_yet", "feedback": "one specific sentence" }',
		'  ],',
		'  "nextImprovement": "one concrete action",',
		'  "coachingNote": "one evidence-based sentence about improvement or a reusable pattern",',
		'  "learnerModel": {',
		'    "observedStrength": "one demonstrated strength",',
		'    "recurringNeed": "one demonstrated need, or the current need if history is short",',
		'    "nextStrategy": "one reusable strategy"',
		'  },',
		'  "confidence": 0.0',
		'}',
		'',
		`Question: ${practice.question.prompt}`,
		practice.question.context ? `Question context:\n${practice.question.context}` : '',
		`Exam context: ${practice.question.meta.board} ${practice.question.meta.qualification} ${practice.question.meta.subject}; ${practice.question.meta.paper}; ${practice.question.meta.marks} marks.`,
		`Question task type: ${practice.taskKind ?? 'other'}`,
		'',
		'IMPORTED MARK-SCHEME EVIDENCE',
		buildMarkSchemeEvidence(practice),
		'',
		'IMPORTED EXAMINER-REPORT GUIDANCE',
		buildExaminerGuidance(practice),
		'',
		`Current step: ${stage.shortTitle} (${stage.title})`,
		`Step instruction: ${stage.revealedText}`,
		`Step prompt: ${stage.prompt}`,
		`Step goal from the curated mark guidance: ${stage.goal}`,
		'',
		'Checks that must all be returned using these exact ids:',
		...criteria.map(
			(criterion) => `- ${criterion.id} | ${criterion.label}: ${criterion.description}`
		),
		'',
		'Previous passed responses:',
		buildPreviousStepContext(practice, stageIndex, stepAnswers),
		'',
		'Learner check history:',
		buildLearnerHistory(attemptHistory),
		'',
		`Curated model direction:\n${practice.modelAnswer}`,
		practice.weakAnswerText ? `Common weak answer:\n${practice.weakAnswerText}` : '',
		practice.weakAnswerExplanation
			? `Why the weak answer fails:\n${practice.weakAnswerExplanation}`
			: '',
		'',
		'Student response for the current step:',
		studentAnswer
	]
		.filter(Boolean)
		.join('\n');
}

function handleStreamEvent(
	event: LlmStreamEvent,
	handlers: { onThought: (text: string) => void; onResponse: (text: string) => void }
) {
	if (event.type !== 'delta') return;
	if (event.channel === 'thought') handlers.onThought(event.text);
	if (event.channel === 'response') handlers.onResponse(event.text);
}

export async function gradeEnglishPracticeStepStreaming({
	questionId,
	stepId,
	studentAnswer,
	stepAnswers,
	attemptHistory,
	platformEnv,
	signal,
	onDelta
}: {
	questionId: string;
	stepId: string;
	studentAnswer: string;
	stepAnswers: Record<string, string>;
	attemptHistory: EnglishLearnerAttempt[];
	platformEnv?: unknown;
	signal?: AbortSignal;
	onDelta?: (delta: EnglishStepGradeDelta) => void;
}): Promise<EnglishStepGradeResult> {
	const data = await getPracticePageData(questionId);
	const practice = data.englishPractice;
	if (!practice) throw new Error('This question does not have English step-by-step practice.');

	const stageIndex = practice.stages.findIndex((stage) => stage.id === stepId);
	if (stageIndex < 0) throw new Error(`Unknown English practice step: ${stepId}`);
	const stage = practice.stages[stageIndex];
	const prompt = buildEnglishStepGradePrompt({
		practice,
		stage,
		stageIndex,
		studentAnswer,
		stepAnswers,
		attemptHistory
	});

	configureLlmProcessEnv(platformEnv, STEP_GRADING_MODEL);
	onDelta?.({ type: 'status', phase: 'calling' });
	const { streamText } = await import('@ljoukov/llm');
	const call = streamText({
		model: STEP_GRADING_MODEL,
		input: prompt,
		thinkingLevel: STEP_GRADING_THINKING_LEVEL,
		signal,
		telemetry: false
	});

	let rawText = '';
	let sawThought = false;
	let sawResponse = false;
	for await (const event of call.events) {
		handleStreamEvent(event, {
			onThought() {
				if (sawThought) return;
				sawThought = true;
				onDelta?.({ type: 'status', phase: 'thinking' });
			},
			onResponse(text) {
				rawText += text;
				if (sawResponse) return;
				sawResponse = true;
				onDelta?.({ type: 'status', phase: 'grading' });
			}
		});
	}

	const llmResult = await call.result;
	return parseEnglishStepGradeResponse(
		rawText.trim() || llmResult.text,
		stage,
		studentAnswer,
		llmResult.modelVersion
	);
}
