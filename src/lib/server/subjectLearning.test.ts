import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnglishLiteratureSelections } from '$lib/englishLiteratureProfile';

const mocks = vi.hoisted(() => ({
	executePersonalQuery: vi.fn(),
	getCurriculumOffering: vi.fn(),
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

import {
	CurriculumScopeValidationError,
	getSignedInSubjectView,
	officialTopicForQuestion,
	recordQuestionAttemptEvidence,
	supportsTextPracticeRecommendation,
	validatedCurriculumScopeSelection
} from './subjectLearning';

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
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
	topicEvidence = []
}: {
	selectedTopicIds: string[];
	gaps: Array<Record<string, unknown>>;
	states?: Array<Record<string, unknown>>;
	topicEvidence?: Array<Record<string, unknown>>;
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
		if (sql.includes('FROM user_chain_gaps')) return gaps;
		return [];
	});
	mocks.queryRows.mockResolvedValue([]);
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

describe('signed-in subject action integrity', () => {
	it('does not recommend a text answer for a missing direct-manipulation diagram', () => {
		expect(
			supportsTextPracticeRecommendation({
				answer_format: null,
				prompt_text:
					'Determine the probability. Complete the Punnett square diagram and identify the offspring genotype.',
				self_contained_prompt_text: null
			})
		).toBe(false);
		expect(
			supportsTextPracticeRecommendation({
				answer_format: 'lines',
				prompt_text: 'Explain why a higher potential difference reduces energy loss.',
				self_contained_prompt_text: null
			})
		).toBe(true);
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
		mocks.queryRows.mockResolvedValue([]);

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
		mocks.queryRows.mockResolvedValue([]);

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

	it('uses a quiet course-scoped unavailable state instead of the generic chain browser', async () => {
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
						components: [curriculumComponent('geography-topic-1', '3.1', 'Natural hazards', 0)]
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
			scope_mode: 'all',
			selected_component_ids_json: '[]',
			updated_at: '2026-07-14 00:00:00'
		});
		mocks.queryPersonalRows.mockResolvedValue([]);
		mocks.queryRows.mockResolvedValue([]);

		const view = await getSignedInSubjectView(testUser, 'Geography');

		expect(view?.nextAction).toMatchObject({
			id: 'scope-unavailable:Geography',
			available: false,
			href: '/subjects/geography/scope'
		});
		expect(view?.nextAction.detail).toContain('AQA · GCSE');
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
		expect(mocks.queryRows).not.toHaveBeenCalled();
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
			id: 'scope-unavailable:English Literature',
			available: false,
			href: '/profile#profile-english-literature-course-texts'
		});
		expect(view?.nextAction.detail).toContain('selected course texts');
		expect(JSON.stringify(view)).not.toContain('/chains');
		expect(mocks.queryPersonalFirst).not.toHaveBeenCalled();
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
		mocks.queryPersonalFirst.mockResolvedValue(null);
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
});
