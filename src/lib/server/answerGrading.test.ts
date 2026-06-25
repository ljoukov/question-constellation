import { buildGradePrompt, configureLlmProcessEnv, parseGradeResponse } from './answerGrading';
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
		modelAnswer: ''
	},
	constellation: {
		id: 'transformer-efficiency',
		title: 'Transformer efficiency',
		summary: '',
		chainId: 'transformer-efficiency',
		questionIds: ['8464p1h-jun22-01-4']
	},
	questions: [],
	nextQuestion: {} as PracticePageData['nextQuestion'],
	memoryEntry: {} as PracticePageData['memoryEntry']
};

describe('answer grading prompt and parser', () => {
	it('builds a selection-oriented prompt from real question fields', () => {
		const prompt = buildGradePrompt(
			practiceData,
			'It increases the potential difference so less current flows and less energy is lost as heat.'
		);

		expect(prompt).toContain('%PRESENT_STEP_IDS%');
		expect(prompt).toContain('id: current');
		expect(prompt).toContain('Physics Paper 1');
		expect(prompt).toContain('Student answer:');
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
