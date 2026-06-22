import { buildGradePrompt, parseGradeResponse } from './answerGrading';
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
