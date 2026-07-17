import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnglishLiteratureSelections } from '$lib/englishLiteratureProfile';
import type { RecallCard } from '$lib/recall/aqaScienceRecall';
import { clearRecallCatalogCacheForTests } from './recallCatalog';

const mocks = vi.hoisted(() => ({
	executePersonalQuery: vi.fn(),
	getCurriculumOffering: vi.fn(),
	getLatestResumeActionsBySubject: vi.fn(),
	getLearnerProfileSettings: vi.fn(),
	queryPersonalFirst: vi.fn(),
	queryPersonalRows: vi.fn(),
	queryRows: vi.fn()
}));

vi.mock('./db', () => ({
	executePersonalQuery: mocks.executePersonalQuery,
	queryPersonalFirst: mocks.queryPersonalFirst,
	queryPersonalRows: mocks.queryPersonalRows,
	queryRows: mocks.queryRows
}));
vi.mock('./personalLearning', () => ({
	getLearnerProfileSettings: mocks.getLearnerProfileSettings
}));
vi.mock('./curriculumCatalog', () => ({
	getCurriculumOffering: mocks.getCurriculumOffering
}));
vi.mock('./learningResume', () => ({
	getLatestResumeActionsBySubject: mocks.getLatestResumeActionsBySubject
}));

import {
	CurriculumScopeValidationError,
	getRecallReviewEvidenceReceipt,
	getRecallReviewSnapshot,
	getSignedInLearningHome,
	getSignedInSubjectView,
	officialTopicForQuestion,
	recordEnglishStepAttemptEvidence,
	recordLearnerEvidence,
	recordQuestionAttemptEvidence,
	recordRecallReviewEvidence,
	recallCardsWithinLearnerScope,
	supportsTextPracticeRecommendation,
	validatedCurriculumScopeSelection
} from './subjectLearning';

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.getLatestResumeActionsBySubject.mockResolvedValue(new Map());
	clearRecallCatalogCacheForTests();
});

const topics = [
	{
		id: 'spec:4-1',
		code: '4.1',
		title: 'Cell biology',
		paper: 'Biology Paper 1',
		specUrl: 'https://example.test/spec'
	},
	{
		id: 'spec:4-3',
		code: '4.3',
		title: 'Infection and response',
		paper: 'Biology Paper 1',
		specUrl: 'https://example.test/spec'
	}
];

const testUser = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};

const emptyEnglishLiteratureSelections: EnglishLiteratureSelections = {
	board: 'OCR' as const,
	specificationCode: 'J352',
	modernText: null,
	nineteenthCenturyNovel: null,
	poetryCluster: null,
	shakespearePlay: null
};

function curriculumComponent(id: string, code: string, title: string, displayOrder: number) {
	return {
		id,
		code,
		title,
		kind: 'option',
		displayOrder,
		paper: null,
		subjectArea: null,
		optionGroupId: null,
		sourcePageStart: null,
		sourcePageEnd: null
	};
}

function curriculumOffering({
	subject,
	board = 'AQA',
	course = 'GCSE Subject',
	specificationCode,
	groups
}: {
	subject: string;
	board?: string;
	course?: 'Separate Science' | 'Combined Science' | 'GCSE Subject';
	specificationCode: string;
	groups: Array<{
		id: string;
		title: string;
		kind: string;
		displayOrder: number;
		selectionMin?: number;
		selectionMax?: number;
		components: ReturnType<typeof curriculumComponent>[];
	}>;
}) {
	return {
		id: `${board.toLowerCase()}-${specificationCode}:higher`,
		board,
		qualification: 'GCSE',
		profileSubject: subject,
		course,
		tier: 'Higher',
		label: `${board} GCSE ${subject}`,
		specification: {
			id: `${board.toLowerCase()}-${specificationCode}`,
			code: specificationCode,
			version: '1.0',
			title: `${board} GCSE ${subject}`,
			officialSourceUrl: 'https://example.test/specification',
			pdfUrl: 'https://example.test/specification.pdf',
			firstExamYear: 2018,
			lastExamYear: null
		},
		selectionTree: { groups },
		selectableComponentIds: groups.flatMap((group) =>
			group.components.map((component) => component.id)
		),
		snapshotHash: 'test-snapshot'
	};
}

function learnerSettings(
	subject: string,
	board: string,
	englishLiteratureSelections = emptyEnglishLiteratureSelections,
	course: 'Separate Science' | 'Combined Science' | 'GCSE Subject' = 'GCSE Subject'
) {
	return {
		profile: {
			uid: testUser.uid,
			email: testUser.email,
			name: testUser.name,
			photoUrl: null,
			selectedBoard: board,
			selectedQualification: 'GCSE',
			selectedSubject: subject,
			selectedTier: 'Higher',
			themePreference: 'auto'
		},
		subjects: [
			{
				subject,
				board,
				qualification: 'GCSE',
				course,
				tier: 'Higher',
				enabled: true,
				currentGrade: null,
				targetGrade: null
			}
		],
		subjectOptions: [subject],
		englishLiteratureSelections
	};
}

function mockBiologyGapSubject({
	selectedTopicIds,
	gaps,
	states = [],
	topicEvidence = [],
	attempts = []
}: {
	selectedTopicIds: string[];
	gaps: Array<Record<string, unknown>>;
	states?: Array<Record<string, unknown>>;
	topicEvidence?: Array<Record<string, unknown>>;
	attempts?: Array<Record<string, unknown>>;
}) {
	mocks.getLearnerProfileSettings.mockResolvedValue(
		learnerSettings('Biology', 'AQA', emptyEnglishLiteratureSelections, 'Combined Science')
	);
	mocks.getCurriculumOffering.mockResolvedValue(
		curriculumOffering({
			subject: 'Biology',
			course: 'Combined Science',
			specificationCode: '8464',
			groups: [
				{
					id: 'biology-chapters',
					title: 'Chapters',
					kind: 'group',
					displayOrder: 0,
					components: [
						curriculumComponent('biology-topic-4-1', '4.1', 'Cell biology', 0),
						curriculumComponent('biology-topic-4-3', '4.3', 'Infection and response', 1)
					]
				}
			]
		})
	);
	mocks.queryPersonalFirst.mockImplementation(async (sql: string) => {
		if (sql.includes('FROM user_subject_curriculum_scopes')) {
			return {
				user_id: testUser.uid,
				subject: 'Biology',
				board: 'AQA',
				qualification: 'GCSE',
				course: 'Combined Science',
				tier: 'Higher',
				specification_code: '8464',
				specification_version: '1.0',
				official_source_url: 'https://example.test/specification',
				scope_mode: 'selected',
				selected_component_ids_json: JSON.stringify(selectedTopicIds),
				updated_at: '2026-07-14 00:00:00'
			};
		}
		if (sql.includes('FROM user_recommendation_decisions')) return null;
		return null;
	});
	mocks.queryPersonalRows.mockImplementation(async (sql: string) => {
		if (sql.includes('FROM user_learner_component_states')) return states;
		if (sql.includes('FROM user_learning_evidence')) return topicEvidence;
		if (sql.includes('FROM user_question_attempts')) return attempts;
		if (sql.includes('FROM user_chain_gaps')) return gaps;
		return [];
	});
	mockGeneratedBiologyRecallCatalog();
}

function mockGeneratedBiologyRecallCatalog(
	offeringId = 'aqa-8464:higher',
	topicComponentId = 'biology-topic-4-1',
	topicCode = '4.1',
	topicTitle = 'Cell biology'
) {
	const answer = 'The nucleus contains the genetic material.';
	const base = {
		card_id: 'generated-biology-recall',
		concept_key: 'nucleus-genetic-material',
		subject: 'Biology',
		kind: 'fact',
		visual_cue: '🧬',
		front: 'What does the nucleus contain?',
		back: answer,
		reverse_front: null,
		reverse_back: null,
		explanation: 'The nucleus stores the cell’s genetic material.',
		memory_tip: null,
		content_revision: 1,
		content_hash: 'b'.repeat(64),
		provenance_json: '{}',
		offering_id: offeringId,
		curriculum_component_id: `${topicComponentId}-leaf`,
		topic_component_id: topicComponentId,
		target_code: `${topicCode}.1`,
		topic_code: topicCode,
		topic_title: topicTitle,
		source_url: 'https://example.test/specification',
		source_title: 'AQA GCSE Biology',
		choice_key: 'correct',
		choice_text: answer,
		choice_order: 0,
		is_correct: 1,
		choice_feedback: 'Yes. The nucleus stores genetic material.',
		choice_misconception: null
	};
	const choices = [
		base,
		{
			...base,
			choice_key: 'wrong-a',
			choice_text: 'It releases energy by respiration.',
			choice_order: 1,
			is_correct: 0,
			choice_feedback: 'That is the role of mitochondria.',
			choice_misconception: 'Confuses the nucleus with mitochondria.'
		},
		{
			...base,
			choice_key: 'wrong-b',
			choice_text: 'It controls movement into the cell.',
			choice_order: 2,
			is_correct: 0,
			choice_feedback: 'That is the role of the cell membrane.',
			choice_misconception: 'Confuses the nucleus with the cell membrane.'
		},
		{
			...base,
			choice_key: 'wrong-c',
			choice_text: 'It absorbs light for photosynthesis.',
			choice_order: 3,
			is_correct: 0,
			choice_feedback: 'That is the role of chloroplasts.',
			choice_misconception: 'Confuses the nucleus with chloroplasts.'
		}
	];
	mocks.queryRows.mockImplementation(async (sql: string) =>
		sql.includes('FROM recall_cards c') ? choices : []
	);
}

describe('official curriculum question resolution', () => {
	it('prefers a reviewed selectable mapping over looser text evidence', () => {
		expect(
			officialTopicForQuestion(topics, {
				curriculum_component_id: 'spec:4-3',
				spec_ref: '4.1.2',
				topic_path_json: JSON.stringify(['Cell biology'])
			})
		).toEqual(topics[1]);
	});

	it('falls back from a descendant specification reference to its selectable chapter', () => {
		expect(
			officialTopicForQuestion(topics, {
				curriculum_component_id: null,
				spec_ref: '4.3.1.7',
				topic_path_json: '[]'
			})
		).toEqual(topics[1]);
	});

	it('uses a clear topic-path match only when no reviewed mapping or spec reference resolves', () => {
		expect(
			officialTopicForQuestion(topics, {
				curriculum_component_id: null,
				spec_ref: null,
				topic_path_json: JSON.stringify(['Biology', 'Infection and response'])
			})
		).toEqual(topics[1]);
	});

	it('does not treat generic section wording as an official topic match', () => {
		expect(
			officialTopicForQuestion(
				[
					...topics,
					{
						id: 'spec:3-1',
						code: '3.1',
						title: 'Section A: The challenge of natural hazards',
						paper: 'Paper 1',
						specUrl: 'https://example.test/spec'
					}
				],
				{
					curriculum_component_id: null,
					spec_ref: null,
					topic_path_json: JSON.stringify(['Paper 1', 'Section A'])
				}
			)
		).toBeNull();
	});
});

describe('curriculum scope selection validation', () => {
	const groups = [
		{
			kind: 'option_group',
			title: 'Choose a text',
			selectionMin: 1,
			selectionMax: 1,
			components: [{ id: 'spec:4-1' }, { id: 'spec:4-3' }]
		}
	];

	it('stores no stale selected ids for ordinary whole-course mode', () => {
		expect(
			validatedCurriculumScopeSelection(
				{ mode: 'all', selectedTopicIds: ['not-in-the-specification'] },
				topics,
				[{ title: 'Chapters', components: groups[0].components }],
				'topic'
			)
		).toEqual([]);
	});

	it('requires an explicit choice for official course-option groups', () => {
		expect(() =>
			validatedCurriculumScopeSelection(
				{ mode: 'all', selectedTopicIds: [] },
				topics,
				groups,
				'course option'
			)
		).toThrow(CurriculumScopeValidationError);
		expect(() =>
			validatedCurriculumScopeSelection(
				{ mode: 'selected', selectedTopicIds: [] },
				topics,
				groups,
				'course option'
			)
		).toThrow(CurriculumScopeValidationError);
	});

	it('requires a valid choice in every official option group', () => {
		const multipleGroups = [
			groups[0],
			{
				kind: 'option_group',
				title: 'Choose a second text',
				selectionMin: 1,
				selectionMax: 1,
				components: [{ id: 'spec:second-a' }, { id: 'spec:second-b' }]
			}
		];
		const multipleTopics = [...topics, { id: 'spec:second-a' }, { id: 'spec:second-b' }];

		expect(() =>
			validatedCurriculumScopeSelection(
				{ mode: 'selected', selectedTopicIds: ['spec:4-1'] },
				multipleTopics,
				multipleGroups,
				'course option'
			)
		).toThrow('Choose one option from Choose a second text.');
		expect(
			validatedCurriculumScopeSelection(
				{ mode: 'selected', selectedTopicIds: ['spec:4-1', 'spec:second-a'] },
				multipleTopics,
				multipleGroups,
				'course option'
			)
		).toEqual(['spec:4-1', 'spec:second-a']);
	});

	it('rejects unknown and over-limit selections in selected mode', () => {
		expect(() =>
			validatedCurriculumScopeSelection(
				{ mode: 'selected', selectedTopicIds: ['not-in-the-specification'] },
				topics,
				groups,
				'topic'
			)
		).toThrow('not in this official specification');
		expect(() =>
			validatedCurriculumScopeSelection(
				{ mode: 'selected', selectedTopicIds: ['spec:4-1', 'spec:4-3'] },
				topics,
				groups,
				'topic'
			)
		).toThrow('Choose one option from Choose a text.');
	});
});

describe('signed-in home resume action', () => {
	it('puts the latest compatible unfinished answer first and keeps the ranked action available', async () => {
		mocks.getLearnerProfileSettings.mockResolvedValue(
			learnerSettings('Biology', 'AQA', emptyEnglishLiteratureSelections, 'Combined Science')
		);
		mocks.getCurriculumOffering.mockResolvedValue(
			curriculumOffering({
				subject: 'Biology',
				course: 'Combined Science',
				specificationCode: '8464',
				groups: [
					{
						id: 'biology-chapters',
						title: 'Chapters',
						kind: 'group',
						displayOrder: 0,
						components: [curriculumComponent('biology-topic-4-1', '4.1', 'Cell biology', 0)]
					}
				]
			})
		);
		mocks.queryPersonalFirst.mockImplementation(async (sql: string) => {
			if (sql.includes('FROM user_subject_curriculum_scopes')) {
				return {
					user_id: testUser.uid,
					subject: 'Biology',
					board: 'AQA',
					qualification: 'GCSE',
					course: 'Combined Science',
					tier: 'Higher',
					specification_code: '8464',
					specification_version: '1.0',
					official_source_url: 'https://example.test/specification',
					scope_mode: 'all',
					selected_component_ids_json: '[]',
					updated_at: '2026-07-14 00:00:00'
				};
			}
			if (sql.includes("datetime('now', '-7 days')")) {
				return { attempt_count: 2, recall_count: 3, closed_gap_count: 1 };
			}
			return null;
		});
		mocks.queryPersonalRows.mockResolvedValue([]);
		mockGeneratedBiologyRecallCatalog();
		mocks.getLatestResumeActionsBySubject.mockResolvedValue(
			new Map([
				[
					'Biology',
					{
						id: 'resume:question-1',
						kind: 'resume',
						eyebrow: 'Unfinished answer',
						title: 'Continue your Biology answer',
						detail: 'Your latest unfinished response is saved on this question.',
						reason:
							'Carry on from the exact point you reached instead of starting another activity.',
						durationMinutes: null,
						href: '/questions/question-1/practice',
						available: true
					}
				]
			])
		);

		const home = await getSignedInLearningHome(testUser);

		expect(home.subjects[0]?.nextAction).toMatchObject({
			id: 'resume:question-1',
			kind: 'resume',
			href: '/questions/question-1/practice'
		});
		expect(home.subjects[0]?.alternatives).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'recall:biology-topic-4-1', kind: 'recall' })
			])
		);
		expect(home.weeklySummary).toEqual({
			attemptCount: 2,
			recallCount: 3,
			closedGapCount: 1
		});
		expect(mocks.getLatestResumeActionsBySubject).toHaveBeenCalledWith(
			testUser.uid,
			expect.arrayContaining([expect.objectContaining({ subject: 'Biology', enabled: true })]),
			expect.any(Map)
		);
		const resumeScopes = mocks.getLatestResumeActionsBySubject.mock.calls[0]?.[2] as Map<
			string,
			Set<string>
		>;
		expect(resumeScopes.get('Biology')).toEqual(new Set(['biology-topic-4-1']));
	});

	it('keeps resume disabled until all English Literature course texts are configured', async () => {
		mocks.getLearnerProfileSettings.mockResolvedValue(
			learnerSettings('English Literature', 'OCR', {
				board: 'OCR',
				specificationCode: 'J352',
				modernText: null,
				nineteenthCenturyNovel: null,
				poetryCluster: null,
				shakespearePlay: 'Macbeth'
			})
		);
		mocks.getCurriculumOffering.mockResolvedValue(
			curriculumOffering({
				subject: 'English Literature',
				board: 'OCR',
				specificationCode: 'J352',
				groups: [
					{
						id: 'english-texts',
						title: 'Course texts',
						kind: 'option_group',
						displayOrder: 0,
						selectionMin: 4,
						selectionMax: 4,
						components: [
							curriculumComponent('ocr-j352:macbeth', '02', 'Macbeth', 0),
							curriculumComponent('ocr-j352:animal-farm', '01', 'Animal Farm', 1),
							curriculumComponent('ocr-j352:conflict', '01', 'Conflict', 2),
							curriculumComponent('ocr-j352:jekyll-and-hyde', '02', 'Jekyll and Hyde', 3)
						]
					}
				]
			})
		);
		mocks.queryPersonalFirst.mockResolvedValue({
			attempt_count: 0,
			recall_count: 0,
			closed_gap_count: 0
		});
		mocks.queryPersonalRows.mockResolvedValue([]);
		mocks.queryRows.mockResolvedValue([]);

		const home = await getSignedInLearningHome(testUser);

		expect(home.subjects[0]?.scope).toMatchObject({
			status: 'not_set',
			includedTopicIds: ['ocr-j352:macbeth']
		});
		const resumeScopes = mocks.getLatestResumeActionsBySubject.mock.calls[0]?.[2] as Map<
			string,
			Set<string>
		>;
		expect(resumeScopes.get('English Literature')).toEqual(new Set());
	});
});

describe('signed-in subject action integrity', () => {
	it('does not recommend a text answer for a missing direct-manipulation diagram', () => {
		expect(
			supportsTextPracticeRecommendation({
				answer_format: null,
				prompt_text:
					'Determine the probability. Complete the Punnett square diagram and identify the offspring genotype.',
				self_contained_prompt_text: null,
				subject: 'Biology',
				context_text: null,
				self_containment_json: null,
				reviewed_source_assets_json: null,
				reviewed_render_json: null
			})
		).toBe(false);
		expect(
			supportsTextPracticeRecommendation({
				answer_format: 'lines',
				prompt_text: 'Explain why a higher potential difference reduces energy loss.',
				self_contained_prompt_text: null,
				subject: 'Physics',
				context_text: null,
				self_containment_json: null,
				reviewed_source_assets_json: null,
				reviewed_render_json: null
			})
		).toBe(true);
		expect(
			supportsTextPracticeRecommendation({
				answer_format: null,
				prompt_text: 'Tick (✓) one box. Which tissue forms new root cells?',
				self_contained_prompt_text: null,
				response_kind: null,
				subject: 'Biology',
				context_text: null,
				self_containment_json: null,
				reviewed_source_assets_json: null,
				reviewed_render_json: null
			})
		).toBe(false);
		expect(
			supportsTextPracticeRecommendation({
				answer_format: null,
				prompt_text: 'Tick (✓) one box. Which tissue forms new root cells?',
				self_contained_prompt_text: null,
				response_kind: 'choice',
				subject: 'Biology',
				context_text: null,
				self_containment_json: null,
				reviewed_source_assets_json: null,
				reviewed_render_json: null
			})
		).toBe(true);
	});

	it('does not recommend source-dependent English until the reviewed source is present', () => {
		const sourceTask = {
			subject: 'English Language',
			answer_format: 'lines',
			prompt_text: 'Look again at lines 10-28. Explore how the writer uses language.',
			self_contained_prompt_text: null,
			context_text: 'The relevant source is Text 2 from the insert.',
			self_containment_json: JSON.stringify({ status: 'self_contained' }),
			reviewed_source_assets_json: '[]',
			reviewed_render_json: null
		};

		expect(supportsTextPracticeRecommendation(sourceTask)).toBe(false);
		expect(
			supportsTextPracticeRecommendation({
				...sourceTask,
				reviewed_source_assets_json: JSON.stringify([
					{
						publicPath: '/images/papers/source.png',
						role: 'source-page',
						required: true
					}
				])
			})
		).toBe(true);
	});

	it('matches a reviewed Literature figure to its exact serialized question-asset id', () => {
		const sourceTask = {
			subject: 'English Literature',
			answer_format: 'lines',
			prompt_text:
				'Starting with this extract, explore how Shakespeare presents guilt in the play.',
			self_contained_prompt_text: null,
			context_text: null,
			self_containment_json: JSON.stringify({
				status: 'source_complete',
				requires_assets: true,
				required_source_count: 1,
				required_asset_labels: ['Macbeth extract']
			}),
			reviewed_source_assets_json: JSON.stringify([
				{
					id: 'macbeth-extract',
					publicPath: '/images/papers/macbeth-extract.png',
					role: 'source-page',
					sourceLabel: 'Macbeth extract',
					required: true
				}
			]),
			reviewed_render_json: JSON.stringify({
				stemBlocks: [{ kind: 'figure', assetId: 'macbeth-extract' }],
				promptBlocks: [
					{
						kind: 'paragraph',
						text: 'Starting with this extract, explore how Shakespeare presents guilt.'
					}
				]
			})
		};

		expect(supportsTextPracticeRecommendation(sourceTask)).toBe(true);
		expect(
			supportsTextPracticeRecommendation({
				...sourceTask,
				reviewed_source_assets_json: JSON.stringify([
					{
						publicPath: '/images/papers/macbeth-extract.png',
						role: 'source-page',
						sourceLabel: 'Macbeth extract',
						required: true
					}
				])
			})
		).toBe(false);
	});

	it('names a recall recommendation with the topic first', async () => {
		mocks.getLearnerProfileSettings.mockResolvedValue(
			learnerSettings('Biology', 'AQA', emptyEnglishLiteratureSelections, 'Combined Science')
		);
		mocks.getCurriculumOffering.mockResolvedValue(
			curriculumOffering({
				subject: 'Biology',
				course: 'Combined Science',
				specificationCode: '8464',
				groups: [
					{
						id: 'biology-chapters',
						title: 'Chapters',
						kind: 'group',
						displayOrder: 0,
						components: [curriculumComponent('biology-topic-4-1', '4.1', 'Cell biology', 0)]
					}
				]
			})
		);
		mocks.queryPersonalFirst.mockResolvedValue({
			user_id: testUser.uid,
			subject: 'Biology',
			board: 'AQA',
			qualification: 'GCSE',
			course: 'Combined Science',
			tier: 'Higher',
			specification_code: '8464',
			specification_version: '1.0',
			official_source_url: 'https://example.test/specification',
			scope_mode: 'all',
			selected_component_ids_json: '[]',
			updated_at: '2026-07-14 00:00:00'
		});
		mocks.queryPersonalRows.mockResolvedValue([]);
		mockGeneratedBiologyRecallCatalog();

		const view = await getSignedInSubjectView(testUser, 'Biology');

		expect(view?.nextAction).toMatchObject({
			kind: 'recall',
			title: 'Cell biology recall',
			available: true
		});
		expect(view?.nextAction.title).not.toBe('Recall Cell biology');
	});

	it('counts one exam attempt once when it also updates several chain steps', async () => {
		mockBiologyGapSubject({
			selectedTopicIds: ['biology-topic-4-3'],
			states: [
				{
					curriculum_component_id: 'biology-topic-4-3',
					component_kind: 'answer_chain',
					component_id: 'vaccine-chain',
					state: 'developing',
					uncertainty: 'high',
					evidence_count: 2,
					next_check_at: null
				},
				...Array.from({ length: 4 }, (_, index) => ({
					curriculum_component_id: 'biology-topic-4-3',
					component_kind: 'chain_step',
					component_id: `vaccine-step-${index + 1}`,
					state: 'developing' as const,
					uncertainty: 'high' as const,
					evidence_count: 2,
					next_check_at: null
				}))
			],
			topicEvidence: [{ curriculum_component_id: 'biology-topic-4-3', evidence_count: 2 }],
			gaps: []
		});

		const view = await getSignedInSubjectView(testUser, 'Biology');
		const infection = view?.topics.find((topic) => topic.id === 'biology-topic-4-3');

		expect(infection).toMatchObject({
			state: 'developing',
			evidenceCount: 2
		});
		const evidenceQuery = mocks.queryPersonalRows.mock.calls.find(([sql]) =>
			String(sql).includes('FROM user_learning_evidence')
		)?.[0];
		expect(evidenceQuery).toContain('COUNT(DISTINCT CASE');
	});

	it('shows checked-answer marks without predicting a GCSE grade', async () => {
		mockBiologyGapSubject({
			selectedTopicIds: ['biology-topic-4-1', 'biology-topic-4-3'],
			gaps: [],
			attempts: [
				{
					id: 'attempt-1',
					question_id: 'q-1',
					answer_chain_id: 'chain-1',
					result: 'correct',
					awarded_marks: 4,
					max_marks: 4,
					independent: 1,
					topic_path_json: JSON.stringify(['Cell biology']),
					created_at: '2026-07-16 10:00:00'
				},
				{
					id: 'attempt-2',
					question_id: 'q-2',
					answer_chain_id: 'chain-2',
					result: 'partial',
					awarded_marks: 3,
					max_marks: 4,
					independent: 1,
					topic_path_json: JSON.stringify(['Infection and response']),
					created_at: '2026-07-16 09:00:00'
				},
				{
					id: 'attempt-3',
					question_id: 'q-3',
					answer_chain_id: 'chain-3',
					result: 'partial',
					awarded_marks: 2,
					max_marks: 4,
					independent: 1,
					topic_path_json: JSON.stringify(['Cell biology']),
					created_at: '2026-07-16 08:00:00'
				},
				{
					id: 'assisted-attempt',
					question_id: 'q-assisted',
					answer_chain_id: 'chain-4',
					result: 'correct',
					awarded_marks: 9,
					max_marks: 9,
					independent: 0,
					topic_path_json: JSON.stringify(['Cell biology']),
					created_at: '2026-07-16 11:00:00'
				}
			]
		});

		const view = await getSignedInSubjectView(testUser, 'Biology');

		expect(view?.progress.checkedAnswerPerformance).toMatchObject({
			label: 'Checked-answer mark rate',
			value: '9/12 marks · 75%'
		});
		expect(view?.progress.checkedAnswerPerformance.detail).toContain(
			'3 independent checked questions across 2 of 2'
		);
		expect(view?.progress.checkedAnswerPerformance.detail).toContain(
			'cannot convert this question sample to a GCSE grade'
		);
	});

	it('reuses an exact next-action snapshot and dismisses it when only learner state changes', async () => {
		mocks.getLearnerProfileSettings.mockResolvedValue(
			learnerSettings('Biology', 'AQA', emptyEnglishLiteratureSelections, 'Combined Science')
		);
		mocks.getCurriculumOffering.mockResolvedValue(
			curriculumOffering({
				subject: 'Biology',
				course: 'Combined Science',
				specificationCode: '8464',
				groups: [
					{
						id: 'biology-chapters',
						title: 'Chapters',
						kind: 'group',
						displayOrder: 0,
						components: [curriculumComponent('biology-topic-4-1', '4.1', 'Cell biology', 0)]
					}
				]
			})
		);
		let currentRecommendation: Record<string, unknown> | null = null;
		mocks.queryPersonalFirst.mockImplementation(async (sql: string) => {
			if (sql.includes('FROM user_subject_curriculum_scopes')) {
				return {
					user_id: testUser.uid,
					subject: 'Biology',
					board: 'AQA',
					qualification: 'GCSE',
					course: 'Combined Science',
					tier: 'Higher',
					specification_code: '8464',
					specification_version: '1.0',
					official_source_url: 'https://example.test/specification',
					scope_mode: 'all',
					selected_component_ids_json: '[]',
					updated_at: '2026-07-14 00:00:00'
				};
			}
			if (sql.includes('FROM user_recommendation_decisions')) {
				return currentRecommendation;
			}
			return null;
		});
		mocks.queryPersonalRows.mockResolvedValue([]);
		mockGeneratedBiologyRecallCatalog();

		await getSignedInSubjectView(testUser, 'Biology');
		const storedDecision = mocks.executePersonalQuery.mock.calls.find(([sql]) =>
			String(sql).includes('INSERT INTO user_recommendation_decisions')
		);
		expect(storedDecision).toBeDefined();
		const storedParams = storedDecision?.[1] as unknown[];
		currentRecommendation = {
			id: 'current-recommendation',
			selected_action_id: 'recall:biology-topic-4-1',
			reason_text: 'This exact recommendation is still current.',
			decision_source: 'llm',
			valid_until: '2099-01-01 00:00:00',
			curriculum_scope_snapshot_json: storedParams[5],
			learner_state_snapshot_json: storedParams[6],
			candidate_actions_json: storedParams[7]
		};
		mocks.executePersonalQuery.mockClear();

		const unchangedView = await getSignedInSubjectView(testUser, 'Biology');

		expect(unchangedView?.nextAction.reason).toBe('This exact recommendation is still current.');
		expect(mocks.executePersonalQuery).not.toHaveBeenCalled();

		currentRecommendation = {
			...currentRecommendation,
			id: 'stale-recommendation',
			reason_text: 'Based on old evidence.',
			learner_state_snapshot_json: '[{"evidenceCount":99}]'
		};

		const refreshedView = await getSignedInSubjectView(testUser, 'Biology');

		expect(refreshedView?.nextAction.reason).not.toBe('Based on old evidence.');
		expect(mocks.executePersonalQuery).toHaveBeenCalledWith(
			expect.stringContaining('WHERE user_id = ? AND subject = ?'),
			[testUser.uid, 'Biology']
		);
	});

	it('recommends a confirmed in-scope gap and encodes its direct practice route', async () => {
		mockBiologyGapSubject({
			selectedTopicIds: ['biology-topic-4-3'],
			states: [
				{
					curriculum_component_id: 'biology-topic-4-3',
					component_kind: 'chain_step',
					component_id: 'antibody-memory-step',
					state: 'developing',
					uncertainty: 'high',
					evidence_count: 2,
					next_check_at: null
				}
			],
			gaps: [
				{
					id: 'confirmed gap/1',
					answer_chain_id: 'vaccine-chain',
					chain_step_id: 'antibody-memory-step',
					step_text: 'memory cells trigger a faster antibody response',
					chain_title: 'How vaccination protects',
					evidence_count: 2,
					distinct_item_count: 2,
					gap_band: 'medium_gap',
					status: 'active',
					source_question_id: 'question-2',
					topic_path_json: JSON.stringify(['Infection and response']),
					updated_at: '2026-07-14 00:00:00'
				}
			]
		});

		const view = await getSignedInSubjectView(testUser, 'Biology');

		expect(view?.nextAction).toMatchObject({
			id: 'gap:confirmed gap/1',
			kind: 'close_gap',
			href: '/gaps/confirmed%20gap%2F1',
			available: true
		});
		expect(view?.nextAction.reason).toContain('2 different checked questions');
	});

	it('does not offer gap practice after evidence from only one distinct item', async () => {
		mockBiologyGapSubject({
			selectedTopicIds: ['biology-topic-4-3'],
			states: [
				{
					curriculum_component_id: 'biology-topic-4-3',
					component_kind: 'chain_step',
					component_id: 'antibody-memory-step',
					state: 'developing',
					uncertainty: 'high',
					evidence_count: 1,
					next_check_at: null
				}
			],
			gaps: [
				{
					id: 'unconfirmed-gap',
					answer_chain_id: 'vaccine-chain',
					chain_step_id: 'antibody-memory-step',
					step_text: 'memory cells trigger a faster antibody response',
					chain_title: 'How vaccination protects',
					evidence_count: 1,
					distinct_item_count: 1,
					gap_band: 'medium_gap',
					status: 'active',
					source_question_id: 'question-1',
					topic_path_json: JSON.stringify(['Infection and response']),
					updated_at: '2026-07-14 00:00:00'
				}
			]
		});

		const view = await getSignedInSubjectView(testUser, 'Biology');
		const gapAlternative = view?.alternatives.find((action) => action.kind === 'close_gap');

		expect(view?.nextAction.id).not.toBe('gap:unconfirmed-gap');
		expect(gapAlternative).toMatchObject({
			id: 'unavailable:close_gap',
			available: false,
			reason: 'No repeated knowledge gap is confirmed yet.'
		});
		expect(JSON.stringify(view)).not.toContain('/gaps/unconfirmed-gap');
	});

	it('excludes a confirmed gap that belongs to a chapter outside the selected scope', async () => {
		mockBiologyGapSubject({
			selectedTopicIds: ['biology-topic-4-1'],
			gaps: [
				{
					id: 'out-of-scope-gap',
					answer_chain_id: 'vaccine-chain',
					chain_step_id: 'antibody-memory-step',
					step_text: 'memory cells trigger a faster antibody response',
					chain_title: 'How vaccination protects',
					evidence_count: 3,
					distinct_item_count: 3,
					gap_band: 'large_gap',
					status: 'active',
					source_question_id: 'question-3',
					topic_path_json: JSON.stringify(['Infection and response']),
					updated_at: '2026-07-14 00:00:00'
				}
			]
		});

		const view = await getSignedInSubjectView(testUser, 'Biology');

		expect(view?.nextAction).toMatchObject({
			kind: 'recall',
			title: 'Cell biology recall'
		});
		expect(JSON.stringify(view)).not.toContain('out-of-scope-gap');
	});

	it('keeps recall available even when a chapter has evidence and nothing is due', async () => {
		mockBiologyGapSubject({
			selectedTopicIds: ['biology-topic-4-1'],
			states: [
				{
					curriculum_component_id: 'biology-topic-4-1',
					component_kind: 'curriculum_topic',
					component_id: 'biology-topic-4-1',
					state: 'secure',
					uncertainty: 'low',
					evidence_count: 4,
					next_check_at: null
				}
			],
			gaps: []
		});

		const view = await getSignedInSubjectView(testUser, 'Biology');
		const recallAction = [view?.nextAction, ...(view?.alternatives ?? [])].find(
			(action) => action?.id === 'recall:biology-topic-4-1'
		);

		expect(recallAction).toMatchObject({
			kind: 'recall',
			available: true,
			title: 'Cell biology recall'
		});
		expect(recallAction?.href).toContain('activity=flashcards');
		expect(recallAction?.href).toContain('mode=mixed');
	});

	it('keeps a 1–3-mark written check visible alongside standard study cards', async () => {
		mockBiologyGapSubject({
			selectedTopicIds: ['biology-topic-4-1'],
			gaps: []
		});
		const recallQuery = mocks.queryRows.getMockImplementation();
		mocks.queryRows.mockImplementation(async (sql: string, ...args: unknown[]) => {
			if (sql.includes('FROM recall_cards c')) return recallQuery?.(sql, ...args) ?? [];
			if (sql.includes('WITH RECURSIVE candidate_questions')) {
				return [
					{
						id: 'cell-membrane-short-check',
						subject: 'Combined Science: Trilogy',
						prompt_text: 'State one function of the cell membrane.',
						self_contained_prompt_text: null,
						context_text: null,
						self_containment_json: null,
						reviewed_source_assets_json: '[]',
						reviewed_render_json: null,
						metadata_json: JSON.stringify({ card_title: 'Cell membrane function' }),
						source_question_ref: '01.1',
						marks: 1,
						answer_format: 'lines',
						response_kind: 'lines',
						paper: 'Paper 1',
						topic_path_json: JSON.stringify(['Cell biology']),
						spec_ref: '4.1',
						curriculum_component_id: 'biology-topic-4-1',
						answer_chain_id: 'cell-membrane-chain',
						chain_title: 'Cell membrane recall',
						transfer_distance: 'start',
						step_count: 1,
						reviewed_answer_text: 'It controls movement into and out of the cell.'
					}
				];
			}
			return [];
		});

		const view = await getSignedInSubjectView(testUser, 'Biology');
		const visibleActions = [view?.nextAction, ...(view?.alternatives ?? [])].filter(
			(action) => action?.available
		);

		expect(visibleActions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'recall:biology-topic-4-1', kind: 'recall' }),
				expect.objectContaining({
					id: 'quick:cell-membrane-short-check',
					kind: 'recall',
					eyebrow: 'Quick exam check',
					detail: '1-mark question · answer from memory, then check it.'
				})
			])
		);
		expect(JSON.stringify(view)).not.toContain('short exam check—selected automatically');
	});

	it('offers a course-scoped selection check instead of a dead end or the generic chain browser', async () => {
		mocks.getLearnerProfileSettings.mockResolvedValue(learnerSettings('Geography', 'AQA'));
		mocks.getCurriculumOffering.mockResolvedValue(
			curriculumOffering({
				subject: 'Geography',
				specificationCode: '8035',
				groups: [
					{
						id: 'geography-topics',
						title: 'Topics',
						kind: 'group',
						displayOrder: 0,
						components: [
							curriculumComponent('geography-topic-1', '3.1', 'Natural hazards', 0),
							curriculumComponent('geography-topic-2', '3.2', 'Urban issues', 1)
						]
					}
				]
			})
		);
		mocks.queryPersonalFirst.mockResolvedValue({
			user_id: testUser.uid,
			subject: 'Geography',
			board: 'AQA',
			qualification: 'GCSE',
			course: 'GCSE Subject',
			tier: 'Higher',
			specification_code: '8035',
			specification_version: '1.0',
			official_source_url: 'https://example.test/specification',
			scope_mode: 'selected',
			selected_component_ids_json: '["geography-topic-1"]',
			updated_at: '2026-07-14 00:00:00'
		});
		mocks.queryPersonalRows.mockResolvedValue([]);
		mocks.queryRows.mockResolvedValue([]);

		const view = await getSignedInSubjectView(testUser, 'Geography');

		expect(view?.nextAction).toMatchObject({
			id: 'scope-adjust:Geography',
			kind: 'scope',
			title: 'Review your sections',
			available: true,
			href: '/subjects/geography/scope'
		});
		expect(view?.nextAction.detail).toContain('Add more only if your class has covered it');
		expect(JSON.stringify(view)).not.toContain('/chains');
	});

	it('uses the canonical OCR Literature profile choices when course setup is incomplete', async () => {
		const groups = [
			['modern', 'An Inspector Calls'],
			['novel', 'A Christmas Carol'],
			['poetry', 'Conflict'],
			['shakespeare', 'Macbeth']
		].map(([id, title], index) => ({
			id: `literature-${id}`,
			title: `${title} choices`,
			kind: 'option_group',
			displayOrder: index,
			selectionMin: 1,
			selectionMax: 1,
			components: [curriculumComponent(`literature-${id}-${index}`, `${index + 1}`, title, index)]
		}));
		mocks.getCurriculumOffering.mockResolvedValue(
			curriculumOffering({
				subject: 'English Literature',
				board: 'OCR',
				specificationCode: 'J352',
				groups
			})
		);
		mocks.getLearnerProfileSettings.mockResolvedValue(
			learnerSettings('English Literature', 'OCR', {
				...emptyEnglishLiteratureSelections,
				modernText: 'An Inspector Calls',
				nineteenthCenturyNovel: 'A Christmas Carol',
				poetryCluster: 'Conflict'
			})
		);
		mocks.queryPersonalRows.mockResolvedValue([]);

		const view = await getSignedInSubjectView(testUser, 'English Literature');

		expect(view?.scope).toMatchObject({
			status: 'not_set',
			label: '3 of 4 course texts selected',
			includedCount: 3,
			totalCount: 4,
			href: '/profile#profile-english-literature-course-texts'
		});
		expect(view?.nextAction).toMatchObject({
			kind: 'scope',
			title: 'Finish your English Literature course texts',
			detail: '3 of 4 selected. Practice will only use those choices.',
			href: '/profile#profile-english-literature-course-texts',
			available: true
		});
		expect(mocks.queryPersonalFirst).not.toHaveBeenCalled();
		expect(mocks.queryRows).toHaveBeenCalled();
	});

	it('treats four OCR Literature profile choices as the selected official course scope', async () => {
		const groups = [
			['modern', 'An Inspector Calls'],
			['novel', 'A Christmas Carol'],
			['poetry', 'Conflict'],
			['shakespeare', 'Macbeth']
		].map(([id, title], index) => ({
			id: `literature-${id}`,
			title: `${title} choices`,
			kind: 'option_group',
			displayOrder: index,
			selectionMin: 1,
			selectionMax: 1,
			components: [curriculumComponent(`literature-${id}-${index}`, `${index + 1}`, title, index)]
		}));
		mocks.getCurriculumOffering.mockResolvedValue(
			curriculumOffering({
				subject: 'English Literature',
				board: 'OCR',
				specificationCode: 'J352',
				groups
			})
		);
		mocks.getLearnerProfileSettings.mockResolvedValue(
			learnerSettings('English Literature', 'OCR', {
				...emptyEnglishLiteratureSelections,
				modernText: 'An Inspector Calls',
				nineteenthCenturyNovel: 'A Christmas Carol',
				poetryCluster: 'Conflict',
				shakespearePlay: 'Macbeth'
			})
		);
		mocks.queryPersonalRows.mockResolvedValue([]);
		mocks.queryRows.mockResolvedValue([]);

		const view = await getSignedInSubjectView(testUser, 'English Literature');

		expect(view?.scope).toMatchObject({
			status: 'selected',
			label: '4 course texts selected',
			includedCount: 4,
			totalCount: 4,
			href: '/profile#profile-english-literature-course-texts'
		});
		expect(view?.nextAction).toMatchObject({
			id: 'english-literature:choose-question',
			kind: 'subject',
			title: 'Choose an essay question',
			available: true,
			href: '/english-literature'
		});
		expect(view?.href).toBe('/english-literature');
		expect(view?.nextAction.detail).toContain('four course texts');
		expect(JSON.stringify(view)).not.toContain('/chains');
		expect(mocks.queryPersonalFirst).not.toHaveBeenCalled();
		expect(mocks.queryRows).toHaveBeenCalled();
	});

	it('keeps Literature recall inside the learner’s four selected course texts', async () => {
		const selectedTitles = ['An Inspector Calls', 'A Christmas Carol', 'Conflict', 'Macbeth'];
		const allTitles = [...selectedTitles, 'Animal Farm'];
		const groups = allTitles.map((title, index) => ({
			id: `literature-${index}`,
			title: `${title} choices`,
			kind: 'option_group',
			displayOrder: index,
			selectionMin: 1,
			selectionMax: 1,
			components: [curriculumComponent(`literature-text-${index}`, `${index + 1}`, title, index)]
		}));
		const offering = curriculumOffering({
			subject: 'English Literature',
			board: 'OCR',
			specificationCode: 'J352',
			groups
		});
		mocks.getCurriculumOffering.mockResolvedValue(offering);
		mocks.queryPersonalFirst.mockImplementation(async (sql: string) => {
			if (sql.includes('FROM user_profile_subjects')) {
				return {
					board: 'OCR',
					qualification: 'GCSE',
					course: 'GCSE Subject',
					tier: 'Higher'
				};
			}
			if (sql.includes('FROM user_english_literature_selections')) {
				return {
					modern_text: selectedTitles[0],
					nineteenth_century_novel: selectedTitles[1],
					poetry_cluster: selectedTitles[2],
					shakespeare_play: selectedTitles[3]
				};
			}
			return null;
		});
		const cards = allTitles.map(
			(title, index) =>
				({
					id: `literature-card-${index}`,
					board: 'OCR',
					qualification: 'GCSE',
					subject: 'English Literature',
					topicId: `literature-text-${index}`,
					topicTitle: title,
					specRef: `${index + 1}.1`,
					kind: 'theme',
					visualCue: '📖',
					front: `What matters in ${title}?`,
					back: `A reviewed idea from ${title}.`,
					distractors: ['A first misconception.', 'A second misconception.'],
					choiceKeys: {
						[`A reviewed idea from ${title}.`]: 'correct',
						'A first misconception.': 'wrong-one',
						'A second misconception.': 'wrong-two'
					},
					sourceUrl: 'https://example.test/source',
					sourceTitle: title,
					offeringId: offering.id,
					curriculumComponentId: `literature-leaf-${index}`,
					topicComponentId: `literature-text-${index}`,
					contentRevision: 1,
					contentHash: String(index + 1).repeat(64)
				}) satisfies RecallCard
		);

		const scoped = await recallCardsWithinLearnerScope(testUser.uid, 'English Literature', cards);

		expect(scoped.map((card) => card.topicTitle)).toEqual(selectedTitles);
		expect(scoped).toHaveLength(4);
	});
});

describe('question-attempt learner evidence attribution', () => {
	function mockCombinedBiologyAttempt() {
		mocks.getLearnerProfileSettings.mockResolvedValue(
			learnerSettings('Biology', 'AQA', emptyEnglishLiteratureSelections, 'Combined Science')
		);
		mocks.getCurriculumOffering.mockResolvedValue(
			curriculumOffering({
				subject: 'Biology',
				course: 'Combined Science',
				specificationCode: '8464',
				groups: [
					{
						id: 'biology-chapters',
						title: 'Chapters',
						kind: 'group',
						displayOrder: 0,
						components: [curriculumComponent('biology-topic-4-1', '4.1', 'Cell biology', 0)]
					}
				]
			})
		);
		mocks.queryPersonalFirst.mockImplementation(async (sql: string, params: unknown[]) =>
			sql.includes('INSERT INTO user_learning_evidence') ? { id: params[0] } : null
		);
		mocks.queryPersonalRows.mockResolvedValue([]);
		mocks.queryRows.mockImplementation(async (sql: string) => {
			if (sql.includes('FROM questions q')) {
				return [
					{
						id: 'combined-biology-question',
						board: 'AQA',
						qualification: 'GCSE',
						subject: 'Combined Science: Trilogy',
						subject_area: 'Biology',
						component_code: '8464/1H',
						tier: 'Higher',
						spec_ref: '4.1',
						topic_path_json: JSON.stringify(['Cell biology']),
						marks: 4,
						answer_chain_id: 'chain-1',
						transfer_distance: 'near'
					}
				];
			}
			if (sql.includes('FROM answer_chain_steps')) {
				return [
					{ id: 'step-1', step_text: 'First link' },
					{ id: 'step-2', step_text: 'Second link' }
				];
			}
			return [];
		});
	}

	it('does not write evidence when the public question belongs to a different science course', async () => {
		mocks.queryRows.mockResolvedValue([
			{
				id: 'separate-biology-question',
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Biology',
				subject_area: 'Biology',
				component_code: '8461/1H',
				tier: 'Higher',
				spec_ref: '4.1',
				topic_path_json: JSON.stringify(['Cell biology']),
				marks: 4,
				answer_chain_id: 'chain-1',
				transfer_distance: 'near'
			}
		]);
		mocks.getLearnerProfileSettings.mockResolvedValue({
			subjects: [
				{
					subject: 'Biology',
					board: 'AQA',
					qualification: 'GCSE',
					course: 'Combined Science',
					tier: 'Higher',
					enabled: true
				}
			]
		});

		await recordQuestionAttemptEvidence({
			user: {
				uid: 'learner-1',
				email: 'learner-1@example.test',
				name: 'Learner',
				photoUrl: null
			},
			attemptId: 'attempt-1',
			questionId: 'separate-biology-question',
			result: {
				status: 'ok',
				result: 'partial',
				awardedMarks: 2,
				maxMarks: 4,
				presentStepIds: ['step-1'],
				missingStepIds: ['step-2'],
				feedbackMarkdown: 'Add the missing link.',
				thinkingMarkdown: null,
				model: 'test-model',
				modelVersion: 'test-version'
			}
		});

		expect(mocks.getCurriculumOffering).not.toHaveBeenCalled();
		expect(mocks.executePersonalQuery).not.toHaveBeenCalled();
	});

	it('moves a successfully rewritten same-question gap to awaiting check without closing it', async () => {
		mockCombinedBiologyAttempt();

		await recordQuestionAttemptEvidence({
			user: testUser,
			attemptId: 'rewrite-attempt',
			questionId: 'combined-biology-question',
			result: {
				status: 'ok',
				result: 'correct',
				awardedMarks: 4,
				maxMarks: 4,
				presentStepIds: ['step-1', 'step-2'],
				missingStepIds: [],
				feedbackMarkdown: 'Both links are now present.',
				thinkingMarkdown: null,
				model: 'test-model',
				modelVersion: 'test-version'
			},
			assistance: { feedbackRewrite: true }
		});

		const gapUpdates = mocks.executePersonalQuery.mock.calls.filter(([sql]) =>
			String(sql).includes('UPDATE user_chain_gaps')
		);
		expect(gapUpdates).toHaveLength(2);
		for (const [sql, params] of gapUpdates) {
			expect(sql).toContain("SET status = 'awaiting_check'");
			expect(sql).not.toContain("SET status = 'closed'");
			expect(sql).toContain("COALESCE(source_question_id, '') = ?");
			expect(params.at(-1)).toBe('combined-biology-question');
		}
	});

	it('only closes an independently demonstrated gap from a different source question', async () => {
		mockCombinedBiologyAttempt();

		await recordQuestionAttemptEvidence({
			user: testUser,
			attemptId: 'independent-attempt',
			questionId: 'combined-biology-question',
			result: {
				status: 'ok',
				result: 'correct',
				awardedMarks: 4,
				maxMarks: 4,
				presentStepIds: ['step-1'],
				missingStepIds: ['step-2'],
				feedbackMarkdown: 'The first link transferred.',
				thinkingMarkdown: null,
				model: 'test-model',
				modelVersion: 'test-version'
			}
		});

		const gapUpdates = mocks.executePersonalQuery.mock.calls.filter(([sql]) =>
			String(sql).includes('UPDATE user_chain_gaps')
		);
		expect(gapUpdates).toHaveLength(1);
		expect(gapUpdates[0][0]).toContain("SET status = 'closed'");
		expect(gapUpdates[0][0]).toContain("COALESCE(source_question_id, '') <> ?");
		expect(gapUpdates[0][1].at(-1)).toBe('combined-biology-question');
	});

	it('records pasted constructed answers as assisted evidence and never closes a gap', async () => {
		mockCombinedBiologyAttempt();

		await recordQuestionAttemptEvidence({
			user: testUser,
			attemptId: 'pasted-attempt',
			questionId: 'combined-biology-question',
			result: {
				status: 'ok',
				result: 'correct',
				awardedMarks: 4,
				maxMarks: 4,
				presentStepIds: ['step-1', 'step-2'],
				missingStepIds: [],
				feedbackMarkdown: 'Both links are present.',
				thinkingMarkdown: null,
				model: 'test-model',
				modelVersion: 'test-version'
			},
			assistance: {
				externalInputDetected: true,
				externalInputSources: ['paste']
			}
		});

		const gapUpdates = mocks.executePersonalQuery.mock.calls.filter(([sql]) =>
			String(sql).includes('UPDATE user_chain_gaps')
		);
		expect(gapUpdates).toHaveLength(0);
		const evidenceWrites = mocks.queryPersonalFirst.mock.calls.filter(([sql]) =>
			String(sql).includes('INSERT INTO user_learning_evidence')
		);
		expect(evidenceWrites).toHaveLength(3);
		for (const [, params] of evidenceWrites) {
			expect(params[13]).toBe(0);
			expect(JSON.parse(String(params[23]))).toMatchObject({
				assistance: {
					externalInputDetected: true,
					externalInputSources: ['paste']
				}
			});
		}
	});

	it('records a deterministic fixed-choice answer as recognition evidence', async () => {
		mockCombinedBiologyAttempt();

		await recordQuestionAttemptEvidence({
			user: testUser,
			attemptId: 'fixed-choice-attempt',
			questionId: 'combined-biology-question',
			result: {
				status: 'ok',
				result: 'correct',
				awardedMarks: 1,
				maxMarks: 1,
				presentStepIds: [],
				missingStepIds: [],
				feedbackMarkdown: '',
				thinkingMarkdown: null,
				model: 'deterministic',
				modelVersion: 'fixed-choice-v1'
			}
		});

		const evidenceWrites = mocks.queryPersonalFirst.mock.calls.filter(([sql]) =>
			String(sql).includes('INSERT INTO user_learning_evidence')
		);
		expect(evidenceWrites).toHaveLength(1);
		expect(evidenceWrites[0][1][11]).toBe('multiple_choice');
	});

	it('attributes an exact-profile humanities answer to its official curriculum topic', async () => {
		mocks.getLearnerProfileSettings.mockResolvedValue(learnerSettings('Geography', 'AQA'));
		mocks.getCurriculumOffering.mockResolvedValue(
			curriculumOffering({
				subject: 'Geography',
				specificationCode: '8035',
				groups: [
					{
						id: 'geography-sections',
						title: 'Sections',
						kind: 'group',
						displayOrder: 0,
						components: [curriculumComponent('geography-topic-3-1', '3.1', 'Natural hazards', 0)]
					}
				]
			})
		);
		mocks.queryPersonalFirst.mockImplementation(async (sql: string, params: unknown[]) =>
			sql.includes('INSERT INTO user_learning_evidence') ? { id: params[0] } : null
		);
		mocks.queryPersonalRows.mockResolvedValue([]);
		mocks.queryRows.mockImplementation(async (sql: string) => {
			if (sql.includes('FROM questions q')) {
				return [
					{
						id: 'geography-question',
						board: 'AQA',
						qualification: 'GCSE',
						subject: 'Geography',
						subject_area: 'Geography',
						component_code: '8035/1',
						tier: 'Untiered',
						spec_ref: '3.1.1',
						topic_path_json: JSON.stringify(['Natural hazards']),
						marks: 3,
						answer_chain_id: 'geography-chain',
						transfer_distance: 'near'
					}
				];
			}
			if (sql.includes('FROM answer_chain_steps')) {
				return [{ id: 'geography-step', step_text: 'Connect the process to its effect' }];
			}
			return [];
		});

		await recordQuestionAttemptEvidence({
			user: testUser,
			attemptId: 'geography-attempt',
			questionId: 'geography-question',
			result: {
				status: 'ok',
				result: 'correct',
				awardedMarks: 3,
				maxMarks: 3,
				presentStepIds: ['geography-step'],
				missingStepIds: [],
				feedbackMarkdown: 'The causal link is explicit.',
				thinkingMarkdown: null,
				model: 'test-model',
				modelVersion: 'test-version'
			}
		});

		const evidenceWrite = mocks.queryPersonalFirst.mock.calls.find(([sql]) =>
			String(sql).includes('INSERT INTO user_learning_evidence')
		);
		expect(evidenceWrite?.[1]).toMatchObject({
			1: testUser.uid,
			2: 'Geography',
			3: 'AQA',
			4: 'GCSE',
			7: 'geography-topic-3-1',
			16: 'geography-question'
		});
	});
});

describe('recall learner evidence', () => {
	it('repairs derived state on an idempotent retry and rejects an evidence-id collision', async () => {
		const evidenceRow = {
			id: 'recall_review-retry',
			evidence_kind: 'flashcard_self_rating',
			outcome: 'correct',
			occurred_at: '2026-07-15T00:00:00.000Z',
			source_item_id: 'card-1',
			independent: 0,
			supersedes_evidence_id: null
		};
		mocks.queryPersonalRows.mockResolvedValue([evidenceRow]);
		mocks.queryPersonalFirst.mockImplementation(async (sql: string) => {
			if (sql.includes('INSERT INTO user_learning_evidence')) return null;
			if (sql.includes('matches_write')) return { matches_write: 1 };
			return null;
		});

		const input = {
			id: evidenceRow.id,
			user: testUser,
			subject: 'Biology' as const,
			course: 'Combined Science',
			tier: 'Higher',
			topic: topics[0],
			curriculumComponentId: 'spec:4-1-1',
			componentKind: 'recall_card',
			componentId: `card-1@1:${'a'.repeat(64)}`,
			componentTitle: 'Card one',
			evidenceKind: 'flashcard_self_rating' as const,
			outcome: 'correct' as const,
			independent: false,
			sourceItemId: 'card-1',
			sourceSessionId: 'session-1'
		};

		await recordLearnerEvidence(input);

		expect(
			mocks.queryPersonalFirst.mock.calls.some(([sql]) => String(sql).includes('matches_write'))
		).toBe(true);
		const canonicalFence = mocks.queryPersonalFirst.mock.calls.find(([sql]) =>
			String(sql).includes('matches_write')
		)?.[0];
		expect(canonicalFence).toContain('independent = ?');
		expect(canonicalFence).toContain('awarded_marks');
		expect(canonicalFence).toContain('max_marks');
		expect(canonicalFence).toContain('response_duration_ms');
		expect(canonicalFence).toContain('metadata_json = ?');
		const stateWrite = mocks.executePersonalQuery.mock.calls.find(([sql]) =>
			String(sql).includes('INSERT INTO user_learner_component_states')
		);
		expect(stateWrite?.[0]).toContain(
			'excluded.evidence_count > user_learner_component_states.evidence_count'
		);

		mocks.executePersonalQuery.mockClear();
		mocks.queryPersonalFirst.mockImplementation(async (sql: string) => {
			if (sql.includes('INSERT INTO user_learning_evidence')) return null;
			if (sql.includes('matches_write')) return { matches_write: 0 };
			return null;
		});
		await expect(recordLearnerEvidence(input)).rejects.toThrow(
			'already belongs to a different write'
		);
		expect(mocks.executePersonalQuery).not.toHaveBeenCalled();
	});

	it('stores the exact leaf target while rolling learner state up to its official topic', async () => {
		mocks.getLearnerProfileSettings.mockResolvedValue(
			learnerSettings('Biology', 'AQA', emptyEnglishLiteratureSelections, 'Separate Science')
		);
		mocks.getCurriculumOffering.mockResolvedValue(
			curriculumOffering({
				subject: 'Biology',
				course: 'Separate Science',
				specificationCode: '8461',
				groups: [
					{
						id: 'biology-chapters',
						title: 'Chapters',
						kind: 'group',
						displayOrder: 0,
						components: [curriculumComponent('aqa-8461:4-3', '4.3', 'Infection and response', 0)]
					}
				]
			})
		);
		mocks.queryPersonalFirst.mockResolvedValue({ id: 'recall_review-1' });
		mocks.queryPersonalRows.mockResolvedValue([]);
		mocks.executePersonalQuery.mockResolvedValue(undefined);

		const card = {
			id: 'vaccination-memory-response',
			board: 'AQA',
			qualification: 'GCSE',
			subject: 'Biology',
			topicId: 'biology-infection-response',
			specRef: '4.3.1.7',
			kind: 'process',
			visualCue: '💉',
			front: 'What happens after vaccination?',
			back: 'Memory cells trigger a faster specific antibody response.',
			distractors: ['A', 'B', 'C'],
			explanation: 'Memory cells remain after the first exposure.',
			sourceUrl: 'https://example.test/specification',
			sourceTitle: 'AQA GCSE Biology',
			offeringId: 'aqa-8461:higher',
			curriculumComponentId: 'aqa-8461:4-3-1-7',
			topicComponentId: 'aqa-8461:4-3',
			contentRevision: 2,
			contentHash: 'a'.repeat(64),
			choiceKeys: {
				'Memory cells trigger a faster specific antibody response.': 'correct',
				A: 'wrong-a',
				B: 'wrong-b',
				C: 'wrong-c'
			},
			choiceMisconceptions: { A: 'Confuses antibodies with red blood cells.' }
		} satisfies RecallCard;

		await recordRecallReviewEvidence({
			user: testUser,
			reviewId: 'review-1',
			card,
			grade: 'again',
			mode: 'recognise',
			selectedChoice: {
				key: 'wrong-a',
				text: 'A',
				isCorrect: false,
				misconception: 'Confuses antibodies with red blood cells.'
			},
			statementChoice: null,
			selectedTruth: null,
			sourceSessionId: 'session-1',
			responseDurationMs: 8_000,
			createdAt: Date.UTC(2026, 6, 15)
		});

		const evidenceWrite = mocks.queryPersonalFirst.mock.calls.find(([sql]) =>
			String(sql).includes('INSERT INTO user_learning_evidence')
		);
		expect(evidenceWrite).toBeDefined();
		const evidenceParams = evidenceWrite![1] as unknown[];
		expect(evidenceParams[7]).toBe(card.curriculumComponentId);
		expect(evidenceParams[8]).toBe('recall_card');
		expect(evidenceParams[9]).toBe(`${card.id}@${card.contentRevision}:${card.contentHash}`);
		expect(evidenceParams[12]).toBe('incorrect');
		expect(JSON.parse(String(evidenceParams[23]))).toMatchObject({
			offeringId: card.offeringId,
			curriculumComponentId: card.curriculumComponentId,
			topicComponentId: card.topicComponentId,
			contentRevision: card.contentRevision,
			contentHash: card.contentHash,
			selectedChoiceKey: 'wrong-a',
			selectedChoiceCorrect: false,
			selectedChoiceMisconception: 'Confuses antibodies with red blood cells.'
		});

		const stateEvidenceRead = mocks.queryPersonalRows.mock.calls.find(([sql]) =>
			String(sql).includes('FROM user_learning_evidence')
		);
		expect(stateEvidenceRead?.[1]).toEqual([
			testUser.uid,
			'Biology',
			'Separate Science',
			'Higher',
			card.curriculumComponentId,
			'recall_card',
			`${card.id}@${card.contentRevision}:${card.contentHash}`
		]);

		const stateWrite = mocks.executePersonalQuery.mock.calls.find(([sql]) =>
			String(sql).includes('INSERT INTO user_learner_component_states')
		);
		expect((stateWrite?.[1] as unknown[])[6]).toBe(card.topicComponentId);
	});

	it('reads an idempotency receipt only inside the authenticated learner partition', async () => {
		mocks.queryPersonalFirst.mockResolvedValue({
			source_item_id: 'card-1',
			source_session_id: 'session-1',
			response_duration_ms: 4_000,
			occurred_at: '2026-07-15T00:00:00.000Z',
			metadata_json: JSON.stringify({
				contentRevision: 2,
				contentHash: 'a'.repeat(64),
				grade: 'again',
				mode: 'recognise',
				selectedChoiceKey: 'wrong-a'
			})
		});

		await expect(getRecallReviewEvidenceReceipt(testUser.uid, 'review-1')).resolves.toEqual({
			cardId: 'card-1',
			contentRevision: 2,
			contentHash: 'a'.repeat(64),
			grade: 'again',
			mode: 'recognise',
			selectedChoiceKey: 'wrong-a',
			sourceSessionId: 'session-1',
			responseDurationMs: 4_000,
			createdAt: Date.UTC(2026, 6, 15)
		});
		const [sql, params] = mocks.queryPersonalFirst.mock.calls.at(-1)!;
		expect(String(sql)).toContain('WHERE user_id = ? AND id = ?');
		expect(params).toEqual([testUser.uid, 'recall_review-1']);
	});

	it('returns choice diagnostics only for the current canonical card content', async () => {
		mocks.getLearnerProfileSettings.mockResolvedValue(
			learnerSettings('Biology', 'AQA', emptyEnglishLiteratureSelections, 'Separate Science')
		);
		const card = {
			id: 'cell-location',
			board: 'AQA',
			qualification: 'GCSE',
			subject: 'Biology',
			topicId: 'biology-cell-biology',
			specRef: '4.1.1',
			kind: 'fact',
			visualCue: '🧬',
			front: 'Where is genetic material enclosed?',
			back: 'Nucleus',
			distractors: ['Cytoplasm'],
			choiceKeys: { Nucleus: 'correct', Cytoplasm: 'wrong-location' },
			sourceUrl: 'https://example.test/specification',
			sourceTitle: 'AQA GCSE Biology',
			offeringId: 'aqa-8461:higher',
			curriculumComponentId: 'aqa-8461:4-1-1',
			topicComponentId: 'aqa-8461:4-1',
			contentRevision: 2,
			contentHash: 'a'.repeat(64)
		} satisfies RecallCard;
		mocks.queryPersonalRows.mockImplementation(async (sql: string) => {
			if (sql.includes('FROM user_recall_card_reviews')) {
				return [
					{
						card_id: card.id,
						topic_id: card.topicId,
						last_grade: 'again',
						seen_count: 3,
						correct_count: 1,
						interval_days: 0,
						due_at: '2026-07-15 00:00:00',
						content_revision: card.contentRevision,
						content_hash: card.contentHash,
						updated_at: '2026-07-15 00:00:00'
					}
				];
			}
			if (sql.includes('WITH choice_counts')) {
				return [
					{
						card_id: card.id,
						content_revision: card.contentRevision,
						content_hash: card.contentHash,
						wrong_choice_count: 3,
						repeated_misconception_count: 2
					},
					{
						card_id: card.id,
						content_revision: 1,
						content_hash: 'retired-content',
						wrong_choice_count: 20,
						repeated_misconception_count: 20
					}
				];
			}
			return [];
		});

		await expect(getRecallReviewSnapshot(testUser, 'Biology', [card])).resolves.toEqual([
			expect.objectContaining({
				card_id: card.id,
				wrong_choice_count: 3,
				repeated_misconception_count: 2
			})
		]);
		expect(
			mocks.queryPersonalRows.mock.calls.every(([, params]) => params[0] === testUser.uid)
		).toBe(true);
	});
});

describe('English guided-practice learner evidence', () => {
	it('stores one idempotent stage result plus reusable skill evidence on the official curriculum', async () => {
		mocks.getLearnerProfileSettings.mockResolvedValue(
			learnerSettings('English Literature', 'OCR', {
				board: 'OCR',
				specificationCode: 'J352',
				modernText: 'An Inspector Calls',
				nineteenthCenturyNovel: 'A Christmas Carol',
				poetryCluster: 'Conflict',
				shakespearePlay: 'Macbeth'
			})
		);
		mocks.getCurriculumOffering.mockResolvedValue(
			curriculumOffering({
				subject: 'English Literature',
				board: 'OCR',
				specificationCode: 'J352',
				groups: [
					{
						id: 'course-texts',
						title: 'Course texts',
						kind: 'option_group',
						displayOrder: 0,
						components: [curriculumComponent('ocr-macbeth', '02-macbeth', 'Macbeth', 0)]
					}
				]
			})
		);
		mocks.queryRows.mockImplementation(async (sql: string) => {
			if (sql.includes('FROM questions q')) {
				return [
					{
						id: 'ocr-macbeth-question',
						board: 'OCR',
						qualification: 'GCSE',
						subject: 'English Literature',
						subject_area: 'English Literature',
						component_code: 'J352/02',
						tier: null,
						spec_ref: '02-macbeth',
						topic_path_json: JSON.stringify(['Macbeth']),
						marks: 40,
						answer_chain_id: 'english-chain-1',
						transfer_distance: 'start'
					}
				];
			}
			if (sql.includes('mapped_ancestors')) {
				return [{ curriculum_component_id: 'ocr-macbeth' }];
			}
			return [];
		});
		const insertedEvidenceIds = new Set<string>();
		mocks.queryPersonalFirst.mockImplementation(async (sql: string, params: unknown[]) => {
			if (sql.includes('INSERT INTO user_learning_evidence')) {
				const id = String(params[0]);
				if (insertedEvidenceIds.has(id)) return null;
				insertedEvidenceIds.add(id);
				return { id };
			}
			if (sql.includes('matches_write')) return { matches_write: 1 };
			return null;
		});
		mocks.queryPersonalRows.mockResolvedValue([]);

		const result = {
			status: 'ok' as const,
			decision: 'revise' as const,
			stepId: 'method',
			stepTitle: 'Analyse the writer’s method',
			checkedAnswer: 'The violent verb shows Macbeth becoming more ruthless.',
			checks: [
				{
					id: 'meaningful-method',
					label: 'Meaningful method',
					status: 'met' as const,
					feedback: 'The response identifies the violent verb.'
				},
				{
					id: 'argument-link',
					label: 'Argument link',
					status: 'not_yet' as const,
					feedback: 'Connect this change to the central argument.'
				}
			],
			nextImprovement: 'Link the verb to the argument about ambition.',
			coachingNote: 'Method selection is precise; the argument link is still inconsistent.',
			learnerModel: {
				observedStrength: 'Precise method selection',
				recurringNeed: 'Argument links',
				nextStrategy: 'End each method point by returning to the thesis.'
			},
			confidence: 0.9,
			model: 'test-model',
			modelVersion: 'test-version'
		};

		for (let run = 0; run < 2; run += 1) {
			await recordEnglishStepAttemptEvidence({
				user: testUser,
				checkId: 'english-step-check-1',
				questionId: 'ocr-macbeth-question',
				stepId: 'method',
				result,
				hintOpened: true,
				assistance: {
					externalInputDetected: true,
					externalInputSources: ['drop']
				},
				sourceSessionId: 'english-session-1',
				responseDurationMs: 42_000
			});
		}

		expect([...insertedEvidenceIds]).toEqual([
			'english_english-step-check-1',
			'english_english-step-check-1_meaningful-method',
			'english_english-step-check-1_argument-link'
		]);
		const evidenceWrites = mocks.queryPersonalFirst.mock.calls.filter(([sql]) =>
			String(sql).includes('INSERT INTO user_learning_evidence')
		);
		const stageWrite = evidenceWrites[0][1] as unknown[];
		expect(stageWrite.slice(2, 11)).toEqual([
			'English Literature',
			'OCR',
			'GCSE',
			'GCSE Subject',
			'Higher',
			'ocr-macbeth',
			'english_practice_step',
			'english-chain-1:method',
			'Analyse the writer’s method'
		]);
		expect(JSON.parse(String(stageWrite[23]))).toMatchObject({
			guided: true,
			hintOpened: true,
			assistance: {
				externalInputDetected: true,
				externalInputSources: ['drop']
			},
			learnerModel: {
				recurringNeed: 'Argument links'
			}
		});
		const stateWrites = mocks.executePersonalQuery.mock.calls.filter(([sql]) =>
			String(sql).includes('INSERT INTO user_learner_component_states')
		);
		expect(stateWrites).toHaveLength(6);
		for (const [sql, params] of stateWrites) {
			expect((String(sql).match(/\?/g) ?? []).length).toBe((params as unknown[]).length);
			expect((params as unknown[]).slice(1, 4)).toEqual(['English Literature', 'OCR', 'GCSE']);
		}
	});
});
