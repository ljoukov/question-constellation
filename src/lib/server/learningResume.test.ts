import { describe, expect, it } from 'vitest';
import type { SavedPracticeDraft } from '$lib/practiceDrafts';
import type { LearnerSubject } from '$lib/server/personalLearning';
import { latestResumeActionsBySubject, type ResumeQuestionRow } from './learningResume';

const subjects: LearnerSubject[] = [
	{
		subject: 'Biology',
		board: 'AQA',
		qualification: 'GCSE',
		course: 'Combined Science',
		tier: 'Higher',
		enabled: true,
		currentGrade: null,
		targetGrade: null
	},
	{
		subject: 'English Literature',
		board: 'OCR',
		qualification: 'GCSE',
		course: 'GCSE Subject',
		tier: 'Higher',
		enabled: true,
		currentGrade: null,
		targetGrade: null
	}
];

function scienceDraft(
	questionId: string,
	clientUpdatedAt: number,
	answerText = 'My unfinished answer'
): SavedPracticeDraft {
	return {
		questionId,
		draftKind: 'science-practice',
		answerText,
		payload: { answerText, view: 'attempt' },
		clientUpdatedAt,
		updatedAt: '2026-07-16 12:00:00'
	};
}

function englishDraft(questionId: string, clientUpdatedAt: number): SavedPracticeDraft {
	return {
		questionId,
		draftKind: 'english-guided',
		answerText: '',
		payload: {
			stepAnswers: { thesis: 'The writer presents conflict as corrosive.' },
			stepResults: {}
		},
		clientUpdatedAt,
		updatedAt: '2026-07-16 12:00:00'
	};
}

function question(id: string, overrides: Partial<ResumeQuestionRow> = {}): ResumeQuestionRow {
	return {
		id,
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Combined Science: Trilogy',
		subject_area: 'Biology',
		component_code: '8464/B/1H',
		tier: 'Higher',
		reviewedPrimaryMappingCount: 1,
		reviewedCurriculumMappings: [{ componentId: 'biology:cell-biology', depth: 2 }],
		...overrides
	};
}

const fullTopicScopes = new Map<string, ReadonlySet<string>>([
	['Biology', new Set(['biology:cell-biology', 'biology:infection'])],
	['English Literature', new Set(['ocr-j352:macbeth', 'ocr-j352:romeo-and-juliet'])]
]);

describe('latestResumeActionsBySubject', () => {
	it('chooses the newest unfinished draft for each exact enabled profile', () => {
		const actions = latestResumeActionsBySubject(
			subjects,
			[
				scienceDraft('biology-old', 10),
				englishDraft('literature', 30),
				scienceDraft('biology-new', 20)
			],
			[
				question('biology-old'),
				question('biology-new'),
				question('literature', {
					board: 'OCR',
					subject: 'English Literature',
					subject_area: 'English Literature',
					component_code: 'J352/01',
					tier: null,
					reviewedCurriculumMappings: [{ componentId: 'ocr-j352:macbeth', depth: 3 }]
				})
			],
			fullTopicScopes
		);

		expect(actions.get('Biology')).toMatchObject({
			kind: 'resume',
			href: '/questions/biology-new/practice'
		});
		expect(actions.get('English Literature')).toMatchObject({
			kind: 'resume',
			href: '/questions/literature/practice'
		});
	});

	it('rejects completed, empty, wrong-board, wrong-course and wrong-tier drafts', () => {
		const completedEnglish = englishDraft('completed-english', 50);
		completedEnglish.payload = {
			stepAnswers: { thesis: 'A complete response' },
			stepResults: {
				thesis: {
					decision: 'pass',
					checkedAnswer: 'A complete response'
				}
			}
		};
		const actions = latestResumeActionsBySubject(
			subjects,
			[
				completedEnglish,
				scienceDraft('empty', 40, ''),
				scienceDraft('wrong-board', 30),
				scienceDraft('wrong-course', 20),
				scienceDraft('wrong-tier', 10)
			],
			[
				question('completed-english', {
					board: 'OCR',
					subject: 'English Literature',
					subject_area: 'English Literature',
					component_code: 'J352/01',
					tier: null,
					reviewedCurriculumMappings: [{ componentId: 'ocr-j352:macbeth', depth: 3 }]
				}),
				question('empty'),
				question('wrong-board', { board: 'Edexcel' }),
				question('wrong-course', {
					subject: 'Biology',
					component_code: '8461/1H'
				}),
				question('wrong-tier', { tier: 'Foundation' })
			],
			fullTopicScopes
		);

		expect(actions.size).toBe(0);
	});

	it('skips a newer science draft outside a narrowed topic scope', () => {
		const actions = latestResumeActionsBySubject(
			subjects,
			[scienceDraft('cell-draft', 30), scienceDraft('infection-draft', 20)],
			[
				question('cell-draft'),
				question('infection-draft', {
					reviewedCurriculumMappings: [{ componentId: 'biology:infection', depth: 2 }]
				})
			],
			new Map([['Biology', new Set(['biology:infection'])]])
		);

		expect(actions.get('Biology')).toMatchObject({
			id: 'resume:infection-draft',
			href: '/questions/infection-draft/practice'
		});
	});

	it('does not resume Macbeth after the learner replaces it with Romeo and Juliet', () => {
		const actions = latestResumeActionsBySubject(
			subjects,
			[englishDraft('macbeth-draft', 40), englishDraft('romeo-draft', 30)],
			[
				question('macbeth-draft', {
					board: 'OCR',
					subject: 'English Literature',
					subject_area: 'English Literature',
					component_code: 'J352/02',
					tier: null,
					reviewedCurriculumMappings: [{ componentId: 'ocr-j352:macbeth', depth: 3 }]
				}),
				question('romeo-draft', {
					board: 'OCR',
					subject: 'English Literature',
					subject_area: 'English Literature',
					component_code: 'J352/02',
					tier: null,
					reviewedCurriculumMappings: [{ componentId: 'ocr-j352:romeo-and-juliet', depth: 3 }]
				})
			],
			new Map([['English Literature', new Set(['ocr-j352:romeo-and-juliet'])]])
		);

		expect(actions.get('English Literature')).toMatchObject({
			id: 'resume:romeo-draft',
			href: '/questions/romeo-draft/practice'
		});
	});

	it('fails closed for a missing or ambiguous reviewed mapping', () => {
		const actions = latestResumeActionsBySubject(
			subjects,
			[scienceDraft('ambiguous', 20), scienceDraft('missing', 10)],
			[
				question('ambiguous', {
					reviewedPrimaryMappingCount: 2,
					reviewedCurriculumMappings: [
						{ componentId: 'biology:cell-biology', depth: 2 },
						{ componentId: 'biology:infection', depth: 2 }
					]
				}),
				question('missing', { reviewedCurriculumMappings: [] })
			],
			new Map([['Biology', new Set(['biology:cell-biology', 'biology:infection'])]])
		);

		expect(actions.size).toBe(0);
	});

	it('fails closed when only one branch of an ambiguous primary mapping is in scope', () => {
		const actions = latestResumeActionsBySubject(
			subjects,
			[scienceDraft('ambiguous', 20)],
			[
				question('ambiguous', {
					reviewedPrimaryMappingCount: 2,
					reviewedCurriculumMappings: [
						{ componentId: 'biology:cell-biology', depth: 2 },
						{ componentId: 'biology:infection', depth: 2 }
					]
				})
			],
			new Map([['Biology', new Set(['biology:cell-biology'])]])
		);

		expect(actions.size).toBe(0);
	});
});
