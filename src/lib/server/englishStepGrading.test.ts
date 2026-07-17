import type { EnglishPracticeData } from './questionData';
import {
	buildEnglishStepGradePrompt,
	criteriaForEnglishStep,
	parseEnglishStepGradeResponse
} from './englishStepGrading';
import { describe, expect, it } from 'vitest';

const taskStage = {
	id: 'task',
	criterionId: 'argument',
	title: 'Read the task',
	shortTitle: 'Task',
	revealedText: 'Build a line of argument that reaches into the wider text.',
	prompt: 'What exactly must your answer prove?',
	placeholder: 'Austen presents...',
	goal: 'Focus on Austen’s contrast between Bingley and Darcy.',
	successCriteria: [
		{
			id: 'exact-focus',
			label: 'Exact focus',
			description: 'Answers the precise comparison question.'
		}
	],
	hints: [{ title: 'Compare', text: 'Name both sides of the comparison.' }]
};

const evidenceStage = {
	id: 'evidence',
	criterionId: 'evidence',
	title: 'Choose first evidence',
	shortTitle: 'Evidence',
	revealedText: 'Choose a precise quotation or moment.',
	prompt: 'Which reference will anchor the point?',
	placeholder: 'The phrase...',
	goal: 'Use precise references to the extract and wider novel.',
	successCriteria: [
		{
			id: 'paired-references',
			label: 'Paired references',
			description: 'Uses evidence from both sides of the comparison.'
		}
	],
	hints: [{ title: 'Pair', text: 'Choose one reference for each side.' }]
};

const practice = {
	questionId: 'english-pride-prejudice-q03',
	question: {
		id: 'english-pride-prejudice-q03',
		sourceRef: 'Q03.0',
		title: 'Contrast Bingley and Darcy',
		prompt: 'Explore how Austen contrasts Mr Bingley with Mr Darcy, in this extract and elsewhere.',
		context: 'Bingley and Darcy have returned to Netherfield and visit Longbourn.',
		assets: [],
		renderingOverlay: null,
		practiceAvailable: true,
		meta: {
			qualification: 'GCSE',
			board: 'OCR',
			subject: 'English Literature',
			tier: 'Higher',
			paper: '19th century prose',
			topic: 'Pride and Prejudice',
			questionType: 'Explore',
			marks: 40
		},
		transferDistance: 'start',
		distanceLabel: 'start',
		constellationRole: 'First question',
		modelAnswer: 'Austen contrasts Bingley’s openness with Darcy’s reserve.',
		commonWeakAnswer: 'They are different.',
		commonWeakExplanation: 'This is too vague.',
		weakAnswerMissingStepIds: [],
		checklist: [],
		repairChain: [],
		practiceDraft: '',
		whyThisFits: ''
	},
	sourceTitle: 'OCR English Literature',
	sourcePaperUrl: null,
	instructions: [],
	criteria: [
		{
			id: 'argument',
			title: 'Argument',
			detail: 'Build a comparative argument.',
			marks: 10,
			found: '',
			missing: '',
			keywords: []
		}
	],
	stages: [taskStage, evidenceStage],
	taskKind: 'extract-and-wider',
	markSchemeItems: [
		{
			id: 'ms-1',
			itemType: 'level-descriptor',
			text: 'Use precise references and sustained analysis.',
			marks: 40,
			sourceRef: 'mark scheme page 12'
		}
	],
	examinerGuidance: [],
	modelAnswer: 'Austen contrasts Bingley’s openness with Darcy’s reserve.',
	weakAnswerText: 'They are different.',
	weakAnswerExplanation: 'This is too vague.',
	isExtended: true,
	stepLineCount: 5,
	fullLineCount: 18
} satisfies EnglishPracticeData;

describe('English step grading', () => {
	it('builds a prompt that limits judgment to the active step and includes passed work', () => {
		const prompt = buildEnglishStepGradePrompt({
			practice,
			stage: evidenceStage,
			stageIndex: 1,
			studentAnswer: 'Bingley speaks with open warmth at Longbourn.',
			stepAnswers: {
				task: 'Austen contrasts Bingley’s openness with Darcy’s reserve to explore social pride.'
			}
		});

		expect(prompt).toContain('Assess only the current step');
		expect(prompt).toContain('Current step: Evidence');
		expect(prompt).toContain('paired-references');
		expect(prompt).toContain('[level-descriptor] Use precise references and sustained analysis.');
		expect(prompt).toContain('No examiner-report guidance is available for this question.');
		expect(prompt).toContain('Task:\nAusten contrasts Bingley’s openness');
		expect(prompt).toContain('naming a thematic driver on each side');
		expect(prompt).toContain('A required-scope check is not met merely because');
		expect(prompt).toContain('materially misreads the supplied context');
	});

	it('uses the English Language coach role for Language questions', () => {
		const languagePractice: EnglishPracticeData = {
			...practice,
			question: {
				...practice.question,
				meta: { ...practice.question.meta, subject: 'English Language' }
			},
			modelAnswer: ''
		};
		const prompt = buildEnglishStepGradePrompt({
			practice: languagePractice,
			stage: taskStage,
			stageIndex: 0,
			studentAnswer: 'The writer presents the city as threatening.',
			stepAnswers: {}
		});

		expect(prompt).toContain('GCSE English Language step coach');
		expect(prompt).not.toContain('GCSE English Literature step coach');
		expect(prompt).toContain('No curated model answer is available');
	});

	it('requires every configured check before returning pass', () => {
		const criteria = criteriaForEnglishStep(taskStage);
		const raw = JSON.stringify({
			decision: 'pass',
			checks: criteria.map((criterion, index) => ({
				id: criterion.id,
				label: criterion.label,
				status: index === criteria.length - 1 ? 'not_yet' : 'met',
				feedback: index === criteria.length - 1 ? 'The writer’s purpose is not yet clear.' : 'Met.'
			})),
			nextImprovement: 'Explain what Austen reveals through the contrast.',
			coachingNote: 'You identify differences but need to make their significance explicit.',
			learnerModel: {
				observedStrength: 'Relevant focus',
				recurringNeed: 'Interpretive significance',
				nextStrategy: 'Use choice, implication, significance.'
			},
			confidence: 0.9
		});

		const result = parseEnglishStepGradeResponse(raw, taskStage, 'Student answer', 'test-model');
		expect(result.decision).toBe('revise');
		expect(result.checks).toHaveLength(criteria.length);
	});

	it('accepts fenced JSON and returns pass when all checks are met', () => {
		const criteria = criteriaForEnglishStep(taskStage);
		const raw = `\`\`\`json\n${JSON.stringify({
			decision: 'pass',
			checks: criteria.map((criterion) => ({
				id: criterion.id,
				label: criterion.label,
				status: 'met',
				feedback: 'Clearly met.'
			})),
			nextImprovement: 'Continue to evidence.',
			coachingNote: 'You now make a direct argument before selecting evidence.',
			learnerModel: {
				observedStrength: 'Direct argument',
				recurringNeed: 'Evidence selection',
				nextStrategy: 'Choose the shortest precise reference.'
			},
			confidence: 0.92
		})}\n\`\`\``;

		const result = parseEnglishStepGradeResponse(raw, taskStage, 'Student answer', 'test-model');
		expect(result.decision).toBe('pass');
	});
});
