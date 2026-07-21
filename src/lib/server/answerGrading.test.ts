import {
	buildGradePrompt,
	configureLlmProcessEnv,
	deterministicChoiceGrade,
	deterministicExactOneMarkGrade,
	observePromiseResult,
	parseGradeResponse
} from './answerGrading';
import { env as privateEnv } from '$env/dynamic/private';
import type { PracticePageData } from './questionData';
import { describe, expect, it } from 'vitest';

const practiceData: PracticePageData = {
	question: {
		id: '8464p1h-jun22-01-4',
		sourceRef: 'Q01.4',
		title: 'Explain how using step-up transformers makes the network efficient.',
		prompt: 'Explain how using step-up transformers makes the network efficient.',
		context: 'Figure 1 shows some of the energy resources used to meet demand.',
		assets: [],
		renderingOverlay: null,
		practiceAvailable: true,
		meta: {
			qualification: 'GCSE',
			board: 'AQA',
			subject: 'Physics',
			tier: 'Higher',
			paper: 'Physics Paper 1',
			topic: 'Electricity',
			questionType: 'Explain',
			marks: 3
		},
		transferDistance: 'start',
		distanceLabel: 'start',
		constellationRole: 'First question',
		modelAnswer:
			'Step-up transformers increase potential difference, which decreases current for the same power, reducing energy lost by heating in cables.',
		commonWeakAnswer: 'It makes electricity faster.',
		commonWeakExplanation: 'This does not explain the lower current or reduced heating loss.',
		weakAnswerMissingStepIds: ['current', 'heating-loss'],
		checklist: [
			{ id: 'pd-check', text: 'Say that potential difference is increased.', stepId: 'pd' },
			{ id: 'current-check', text: 'Say that current decreases.', stepId: 'current' },
			{
				id: 'heating-check',
				text: 'Say that less energy is transferred by heating in cables.',
				stepId: 'heating-loss'
			}
		],
		checklistSource: 'official',
		repairChain: [],
		practiceDraft: '',
		whyThisFits: 'Uses the same electricity efficiency chain.'
	},
	chain: {
		id: 'transformer-efficiency',
		title: 'Transformer efficiency',
		canonicalText:
			'step-up transformer -> higher potential difference -> lower current -> less heating loss',
		concreteText:
			'step-up transformer -> higher potential difference -> lower current -> less heating loss',
		pageTitle: 'Same answer chain',
		summary: 'Explain why changing voltage affects energy loss.',
		steps: [
			{
				id: 'pd',
				short: 'higher potential difference',
				label: 'Step-up transformers increase potential difference',
				role: 'cause',
				explanation: '',
				markEvidence: '',
				commonOmission: ''
			},
			{
				id: 'current',
				short: 'lower current',
				label: 'For the same power, current decreases',
				role: 'link',
				explanation: '',
				markEvidence: '',
				commonOmission: ''
			},
			{
				id: 'heating-loss',
				short: 'less heating loss',
				label: 'Less energy is wasted heating the cables',
				role: 'effect',
				explanation: '',
				markEvidence: '',
				commonOmission: ''
			}
		],
		commonMissingLink: 'current',
		modelAnswer: '',
		illustration: null
	},
	constellation: {
		id: 'transformer-efficiency',
		title: 'Transformer efficiency',
		summary: '',
		chainId: 'transformer-efficiency',
		questionIds: ['8464p1h-jun22-01-4']
	},
	questions: [],
	nextQuestion: {} as PracticePageData['nextQuestion']
};

const englishPracticeData: PracticePageData = {
	...practiceData,
	question: {
		...practiceData.question,
		id: 'english-lit-romeo-juliet-fate-guided',
		sourceRef: 'Q4*',
		title: 'How Shakespeare presents fate in Romeo and Juliet',
		prompt:
			'Explore the ways in which Shakespeare presents fate in this tragedy. Refer to this extract which is the Prologue and elsewhere in the play.',
		context: "A pair of star-cross'd lovers take their life.",
		renderingOverlay: {
			id: 'english-overlay',
			version: 'v1',
			provenance: 'manual',
			confidence: 0.82,
			needsHumanReview: false,
			stemBlocks: [],
			promptBlocks: [],
			responseInteraction: { kind: 'extended_text', marks: 40 },
			afterResponseBlocks: [],
			assets: [],
			layout: {},
			metadata: {
				gradingProfile: 'ocr-gcse-english-literature-section-b-shakespeare-extract',
				ocrSectionBMarking: {
					contentMarks: 36,
					spagMarks: 4,
					extractQuestionCaps: [
						'If the answer does not move beyond the Prologue extract, the content mark should not normally move beyond Level 3.'
					]
				},
				examinerReportGuidance: {
					commonWeaknesses: [
						'Weaker answers retold the plot or inserted quotations randomly.',
						'Weaker answers bolted on general context without linking it to fate.'
					]
				}
			}
		},
		meta: {
			qualification: 'GCSE',
			board: 'OCR',
			subject: 'English Literature',
			tier: '',
			paper: 'J352/02 Exploring poetry and Shakespeare',
			topic: 'English Literature: Romeo and Juliet: fate',
			questionType: 'Explore',
			marks: 40
		},
		modelAnswer:
			"Shakespeare presents fate as a force shaping the tragedy from the Prologue through Romeo's later struggle against the stars.",
		commonWeakAnswer: 'Romeo and Juliet are unlucky because their families argue and they die.',
		commonWeakExplanation:
			'This retells the tragedy but does not analyse Shakespeare methods or link the extract to the wider play.',
		checklist: [
			{
				id: 'claim-check',
				text: 'AO1: task-focused argument about fate.',
				stepId: 'english-chain-romeo-juliet-fate-step-claim'
			},
			{
				id: 'method-check',
				text: "AO2: analysis of Shakespeare's methods.",
				stepId: 'english-chain-romeo-juliet-fate-step-method'
			}
		]
	},
	chain: {
		...practiceData.chain,
		id: 'english-chain-romeo-juliet-fate',
		title: 'Romeo and Juliet fate paragraph',
		canonicalText: 'claim -> evidence -> method -> wider play -> context',
		steps: [
			{
				id: 'english-chain-romeo-juliet-fate-step-claim',
				short: 'claim',
				label: 'Make a clear claim about fate in the tragedy',
				role: 'conclusion',
				explanation: '',
				markEvidence: 'AO1 argument',
				commonOmission: ''
			},
			{
				id: 'english-chain-romeo-juliet-fate-step-method',
				short: 'method',
				label: "Explain Shakespeare's method and effect",
				role: 'method',
				explanation: '',
				markEvidence: 'AO2 method',
				commonOmission: ''
			},
			{
				id: 'english-chain-romeo-juliet-fate-step-context',
				short: 'context',
				label: 'Use context and expression to sharpen the argument',
				role: 'link',
				explanation: '',
				markEvidence: 'AO3/AO4 context and expression',
				commonOmission: ''
			}
		]
	}
};

const choicePracticeData: PracticePageData = {
	...practiceData,
	question: {
		...practiceData.question,
		id: '8464b1h-jun24-04-6',
		prompt: 'Which tissue in the cut stem will differentiate into new root cells?',
		renderingOverlay: {
			id: 'plant-choice-overlay',
			version: 'manual-v1',
			provenance: 'manual',
			confidence: 1,
			needsHumanReview: false,
			stemBlocks: [],
			promptBlocks: [],
			responseInteraction: {
				kind: 'choice',
				options: ['Epidermis', 'Meristem', 'Mesophyll', 'Phloem'],
				maxSelections: 1,
				correctAnswers: { answer: 'Meristem' }
			},
			afterResponseBlocks: [],
			assets: [],
			layout: {},
			metadata: {}
		},
		meta: { ...practiceData.question.meta, marks: 1 },
		modelAnswer: 'Plant stem cells -> Meristem tissue'
	},
	chain: {
		...practiceData.chain,
		steps: practiceData.chain.steps.slice(0, 2)
	}
};

const exactOneMarkPracticeData: PracticePageData = {
	...practiceData,
	question: {
		...practiceData.question,
		id: '84632h-jun24-02-2',
		modelAnswer: 'W = F × s',
		meta: { ...practiceData.question.meta, marks: 1 },
		checklistSource: 'official',
		renderingOverlay: {
			id: 'work-equation-overlay',
			version: 'v1',
			provenance: 'manual',
			confidence: 1,
			needsHumanReview: false,
			stemBlocks: [],
			promptBlocks: [],
			responseInteraction: { kind: 'lines', count: 1 },
			afterResponseBlocks: [],
			assets: [],
			layout: {},
			metadata: {}
		}
	}
};

describe('answer grading prompt and parser', () => {
	it('grades an exact fixed choice deterministically without model output', () => {
		const correct = deterministicChoiceGrade(choicePracticeData, 'Meristem');
		expect(correct).toMatchObject({
			result: 'correct',
			awardedMarks: 1,
			maxMarks: 1,
			presentStepIds: [],
			missingStepIds: [],
			model: 'deterministic',
			modelVersion: 'fixed-choice-v1'
		});
		expect(correct?.feedbackMarkdown).toContain('Correct answer: **Meristem**');

		const wrong = deterministicChoiceGrade(choicePracticeData, 'Phloem');
		expect(wrong).toMatchObject({
			result: 'incorrect',
			awardedMarks: 0,
			maxMarks: 1,
			presentStepIds: [],
			missingStepIds: [],
			model: 'deterministic'
		});
		expect(wrong?.feedbackMarkdown).toContain('Not quite');
	});

	it('does not display full marks for an incomplete multi-select answer', () => {
		const multiSelect = structuredClone(choicePracticeData);
		multiSelect.question.renderingOverlay!.responseInteraction = {
			kind: 'choice',
			options: ['A', 'B', 'C'],
			maxSelections: 2,
			correctAnswers: [
				{ targetId: 'first', correctAnswer: 'A' },
				{ targetId: 'second', correctAnswer: 'B' }
			]
		};
		const incomplete = deterministicChoiceGrade(multiSelect, 'A');
		expect(incomplete).toMatchObject({
			result: 'incorrect',
			awardedMarks: 0,
			maxMarks: 1
		});

		multiSelect.question.meta.marks = 2;
		const duplicated = deterministicChoiceGrade(multiSelect, 'A\nB\nB');
		expect(duplicated).toMatchObject({
			result: 'partial',
			awardedMarks: 1,
			maxMarks: 2
		});
	});

	it('grades an exact official one-mark equation without a model call', () => {
		expect(deterministicExactOneMarkGrade(exactOneMarkPracticeData, 'W=F*s')).toMatchObject({
			result: 'correct',
			awardedMarks: 1,
			maxMarks: 1,
			model: 'deterministic',
			modelVersion: 'exact-one-mark-v1'
		});
		expect(deterministicExactOneMarkGrade(exactOneMarkPracticeData, 'W = F · s')).toMatchObject({
			result: 'correct',
			awardedMarks: 1
		});
	});

	it('does not guess when an official one-mark response is not an exact match', () => {
		expect(deterministicExactOneMarkGrade(exactOneMarkPracticeData, 'W = F / s')).toBeNull();
		expect(
			deterministicExactOneMarkGrade(
				{
					...exactOneMarkPracticeData,
					question: { ...exactOneMarkPracticeData.question, modelAnswer: '23' }
				},
				'2*3'
			)
		).toBeNull();
		expect(
			deterministicExactOneMarkGrade(
				{
					...exactOneMarkPracticeData,
					question: {
						...exactOneMarkPracticeData.question,
						meta: { ...exactOneMarkPracticeData.question.meta, marks: 2 }
					}
				},
				'W=F*s'
			)
		).toBeNull();
	});

	it('observes a rejected stream result without converting it to success', async () => {
		const error = new Error('usage limit reached');
		await expect(observePromiseResult(Promise.reject(error))).resolves.toEqual({
			ok: false,
			error
		});
	});

	it('builds a selection-oriented prompt from real question fields', () => {
		const prompt = buildGradePrompt(
			practiceData,
			'It increases the potential difference so less current flows and less energy is lost as heat.'
		);

		expect(prompt).toContain('%PRESENT_STEP_IDS%');
		expect(prompt).toContain('id: current');
		expect(prompt).toContain('Physics Paper 1');
		expect(prompt).toContain('Student answer:');
		expect(prompt).toContain('Official mark-scheme points');
		expect(prompt).toContain('Say that current decreases.');
		expect(prompt).toContain('do not treat their order as a mapping to chain-step ids');
	});

	it('includes OCR English Literature level guidance without making steps rigid mark buckets', () => {
		const prompt = buildGradePrompt(
			englishPracticeData,
			'Shakespeare presents fate through the Prologue because the lovers are star-crossed.'
		);

		expect(prompt).toContain('English Literature extended-response rules');
		expect(prompt).toContain('not automatically equal mark buckets');
		expect(prompt).toContain('extract-only answer should not normally go beyond Level 3');
		expect(prompt).toContain('Question-specific OCR guidance');
		expect(prompt).toContain('retold the plot');
		expect(prompt).toContain('When helpful, include one improved sentence');
	});

	it('parses sentinel grading fields and ignores unknown step ids', () => {
		const result = parseGradeResponse(
			[
				'%RESULT%: partial',
				'%AWARDED_MARKS%: 2',
				'%MAX_MARKS%: 3',
				'%PRESENT_STEP_IDS%: pd,current,not-a-real-id',
				'%MISSING_STEP_IDS%: heating-loss',
				'%FEEDBACK%:',
				'- You included the voltage and current links.',
				'- Add the heating-loss link.'
			].join('\n'),
			practiceData
		);

		expect(result.result).toBe('partial');
		expect(result.awardedMarks).toBe(2);
		expect(result.presentStepIds).toEqual(['pd', 'current']);
		expect(result.missingStepIds).toEqual(['heating-loss']);
		expect(result.feedbackMarkdown).toContain('heating-loss');
	});

	it('makes present and missing steps disjoint when the grader overlaps them', () => {
		const result = parseGradeResponse(
			[
				'%AWARDED_MARKS%: 1',
				'%PRESENT_STEP_IDS%: pd,current',
				'%MISSING_STEP_IDS%: current,heating-loss',
				'%FEEDBACK%: Add the missing links.'
			].join('\n'),
			practiceData
		);

		expect(result.presentStepIds).toEqual(['pd']);
		expect(result.missingStepIds).toEqual(['current', 'heating-loss']);
	});

	it('does not infer per-step evidence when a low-mark answer cannot assess every chain link', () => {
		const result = parseGradeResponse(
			[
				'%AWARDED_MARKS%: 1',
				'%PRESENT_STEP_IDS%: pd',
				'%MISSING_STEP_IDS%: current,heating-loss',
				'%FEEDBACK%: The one-mark answer is correct.'
			].join('\n'),
			{
				...practiceData,
				question: {
					...practiceData.question,
					meta: { ...practiceData.question.meta, marks: 1 }
				}
			}
		);

		expect(result.result).toBe('correct');
		expect(result.presentStepIds).toEqual([]);
		expect(result.missingStepIds).toEqual([]);
	});

	it('treats an omitted step as missing when both lists are otherwise populated', () => {
		const result = parseGradeResponse(
			[
				'%AWARDED_MARKS%: 1',
				'%PRESENT_STEP_IDS%: pd',
				'%MISSING_STEP_IDS%: heating-loss',
				'%FEEDBACK%: Add the missing links.'
			].join('\n'),
			practiceData
		);

		expect(result.presentStepIds).toEqual(['pd']);
		expect(result.missingStepIds).toEqual(['current', 'heating-loss']);
	});

	it('downgrades inconsistent correct labels when a diagnostic step is still missing', () => {
		const result = parseGradeResponse(
			[
				'%RESULT%: correct',
				'%AWARDED_MARKS%: 31',
				'%MAX_MARKS%: 40',
				'%PRESENT_STEP_IDS%: english-chain-romeo-juliet-fate-step-claim',
				'%MISSING_STEP_IDS%: english-chain-romeo-juliet-fate-step-context',
				'%FEEDBACK%:',
				'- Strong but missing context.'
			].join('\n'),
			englishPracticeData
		);

		expect(result.result).toBe('partial');
		expect(result.awardedMarks).toBe(31);
		expect(result.missingStepIds).toEqual([
			'english-chain-romeo-juliet-fate-step-method',
			'english-chain-romeo-juliet-fate-step-context'
		]);
	});
});

describe('configureLlmProcessEnv', () => {
	const trackedKeys = [
		'CHATGPT_CODEX_PROXY_URL',
		'CHATGPT_CODEX_PROXY_API_KEY',
		'CHATGPT_RESPONSES_WEBSOCKET_MODE'
	] as const;

	type TrackedKey = (typeof trackedKeys)[number];
	type EnvSnapshot = {
		private: Record<TrackedKey, string | undefined>;
		process: Record<TrackedKey, string | undefined>;
	};

	function snapshotEnv(): EnvSnapshot {
		const mutableEnv = process.env as Record<string, string | undefined>;
		const mutablePrivateEnv = privateEnv as Record<string, string | undefined>;
		return {
			private: Object.fromEntries(
				trackedKeys.map((key) => [key, mutablePrivateEnv[key]])
			) as Record<TrackedKey, string | undefined>,
			process: Object.fromEntries(trackedKeys.map((key) => [key, mutableEnv[key]])) as Record<
				TrackedKey,
				string | undefined
			>
		};
	}

	function restoreEnv(snapshot: EnvSnapshot) {
		const mutableEnv = process.env as Record<string, string | undefined>;
		const mutablePrivateEnv = privateEnv as Record<string, string | undefined>;
		for (const key of trackedKeys) {
			const processValue = snapshot.process[key];
			if (processValue === undefined) {
				delete mutableEnv[key];
			} else {
				mutableEnv[key] = processValue;
			}

			const privateValue = snapshot.private[key];
			if (privateValue === undefined) {
				delete mutablePrivateEnv[key];
			} else {
				mutablePrivateEnv[key] = privateValue;
			}
		}
	}

	function clearEnv(key: TrackedKey) {
		delete (process.env as Record<string, string | undefined>)[key];
		delete (privateEnv as Record<string, string | undefined>)[key];
	}

	it('copies explicit ChatGPT Codex proxy env for ChatGPT models', () => {
		const snapshot = snapshotEnv();
		try {
			configureLlmProcessEnv(
				{
					CHATGPT_CODEX_PROXY_URL: 'https://codex-proxy.example.test',
					CHATGPT_CODEX_PROXY_API_KEY: 'chatgpt-proxy-key'
				},
				'chatgpt-gpt-5.5-fast'
			);

			expect(process.env.CHATGPT_CODEX_PROXY_URL).toBe('https://codex-proxy.example.test');
			expect(process.env.CHATGPT_CODEX_PROXY_API_KEY).toBe('chatgpt-proxy-key');
			expect(process.env.CHATGPT_RESPONSES_WEBSOCKET_MODE).toBe('off');
		} finally {
			restoreEnv(snapshot);
		}
	});

	it('throws when ChatGPT Codex proxy env is incomplete', () => {
		const snapshot = snapshotEnv();
		try {
			clearEnv('CHATGPT_CODEX_PROXY_URL');
			clearEnv('CHATGPT_CODEX_PROXY_API_KEY');

			expect(() =>
				configureLlmProcessEnv(
					{ CHATGPT_CODEX_PROXY_URL: 'https://codex-proxy.example.test' },
					'chatgpt-gpt-5.5-fast'
				)
			).toThrow('Vercel Codex proxy credentials are required for ChatGPT grading.');
		} finally {
			restoreEnv(snapshot);
		}
	});

	it('does not require ChatGPT Codex proxy env for other model families', () => {
		const snapshot = snapshotEnv();
		try {
			clearEnv('CHATGPT_CODEX_PROXY_URL');
			clearEnv('CHATGPT_CODEX_PROXY_API_KEY');

			configureLlmProcessEnv(undefined, 'local-test-model');

			expect(process.env.CHATGPT_CODEX_PROXY_URL).toBeUndefined();
			expect(process.env.CHATGPT_CODEX_PROXY_API_KEY).toBeUndefined();
			expect(process.env.CHATGPT_RESPONSES_WEBSOCKET_MODE).toBe('off');
		} finally {
			restoreEnv(snapshot);
		}
	});
});
