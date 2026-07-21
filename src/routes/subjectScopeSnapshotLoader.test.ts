import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getSubjectLearningPublicCatalog: vi.fn(),
	saveSubjectCurriculumScope: vi.fn(),
	getLearnerProfileSettings: vi.fn(),
	updateEnglishLiteratureSelections: vi.fn()
}));

vi.mock('$lib/server/subjectLearning', () => ({
	CurriculumScopeValidationError: class CurriculumScopeValidationError extends Error {},
	getSubjectLearningPublicCatalog: mocks.getSubjectLearningPublicCatalog,
	saveSubjectCurriculumScope: mocks.saveSubjectCurriculumScope
}));

vi.mock('$lib/server/personalLearning', () => ({
	getLearnerProfileSettings: mocks.getLearnerProfileSettings,
	updateEnglishLiteratureSelections: mocks.updateEnglishLiteratureSelections
}));

import { actions, load } from './subjects/[subject]/content/+page.server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Ada Learner',
	photoUrl: null
};

const biology = {
	subject: 'Biology',
	board: 'AQA',
	qualification: 'GCSE',
	course: 'Biology',
	tier: 'All',
	href: '/subjects/biology',
	scope: {
		status: 'selected',
		unitPlural: 'topics',
		includedTopicIds: ['topic-cell-biology']
	}
};

const catalog = {
	version: 2,
	boardAvailability: [{ subject: 'Biology', boards: ['AQA'] }],
	resumeQuestions: [],
	offerings: [
		{
			curriculum: {
				id: 'offering-aqa-biology',
				specificationId: 'spec-aqa-biology',
				board: 'AQA',
				qualification: 'GCSE',
				profileSubject: 'Biology',
				course: 'Biology',
				tier: 'All',
				specificationCode: '8461',
				specificationVersion: 'v1.1',
				specificationUrl: 'https://www.aqa.org.uk/subjects/science/gcse/biology-8461',
				label: 'AQA GCSE Biology',
				groups: [
					{
						title: 'Subject topics',
						kind: 'coverage',
						selectionMin: null,
						selectionMax: null,
						components: [{ id: 'topic-cell-biology' }]
					}
				],
				topics: [
					{
						id: 'topic-cell-biology',
						code: '4.1',
						title: 'Cell biology',
						paper: 'Paper 1',
						specUrl: 'https://www.aqa.org.uk/subjects/science/gcse/biology-8461'
					}
				]
			},
			recallCards: [],
			questions: []
		}
	]
};

const literatureTopicDefinitions = [
	['modern', 'An Inspector Calls', 'Modern prose or drama'],
	['novel', 'A Christmas Carol', '19th century prose'],
	['poetry', 'Conflict', 'OCR Poetry Anthology thematic cluster'],
	['shakespeare', 'Macbeth', 'Shakespeare play']
] as const;
const literatureTopics = literatureTopicDefinitions.map(([id, title]) => ({
	id: `literature-${id}`,
	code: id,
	title,
	paper: id === 'modern' || id === 'novel' ? 'Paper 1' : 'Paper 2',
	specUrl: 'https://www.ocr.org.uk/qualifications/gcse/english-literature-j352-from-2015/'
}));
const literature = {
	subject: 'English Literature',
	board: 'OCR',
	qualification: 'GCSE',
	course: 'GCSE Subject',
	tier: 'Higher',
	href: '/subjects/english-literature',
	scope: {
		status: 'selected',
		unitPlural: 'set texts',
		includedTopicIds: literatureTopics.map((topic) => topic.id)
	}
};
const literatureCatalog = {
	version: 2,
	boardAvailability: [{ subject: 'English Literature', boards: ['OCR'] }],
	resumeQuestions: [],
	offerings: [
		{
			curriculum: {
				id: 'ocr-j352-higher',
				specificationId: 'ocr-j352',
				board: 'OCR',
				qualification: 'GCSE',
				profileSubject: 'English Literature',
				course: 'GCSE Subject',
				tier: 'Higher',
				specificationCode: 'J352',
				specificationVersion: '3.0',
				specificationUrl:
					'https://www.ocr.org.uk/qualifications/gcse/english-literature-j352-from-2015/',
				label: 'OCR GCSE English Literature',
				groups: literatureTopicDefinitions.map(([id, , title]) => ({
					title,
					kind: 'option_group',
					selectionMin: 1,
					selectionMax: 1,
					components: [{ id: `literature-${id}` }]
				})),
				topics: literatureTopics
			},
			recallCards: [],
			questions: []
		}
	]
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getSubjectLearningPublicCatalog.mockResolvedValue(catalog);
	mocks.getLearnerProfileSettings.mockResolvedValue({ subjects: [] });
});

describe('subject scope loader', () => {
	it('uses the one-row parent snapshot plus one point-read public catalog', async () => {
		const parent = vi.fn().mockResolvedValue({
			homeSnapshot: { subjectViews: [biology] },
			homeSnapshotShouldRefresh: false
		});

		const result = await load({
			locals: { user },
			params: { subject: 'biology' },
			url: new URL('http://localhost/subjects/biology/content'),
			parent
		} as never);

		expect(parent).toHaveBeenCalledOnce();
		expect(mocks.getSubjectLearningPublicCatalog).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			subject: biology,
			curriculum: {
				label: 'AQA GCSE Biology',
				groups: [
					{
						components: [{ id: 'topic-cell-biology', title: 'Cell biology' }]
					}
				]
			}
		});
	});

	it('fails cheaply while an empty legacy snapshot is being rebuilt', async () => {
		const parent = vi.fn().mockResolvedValue({
			homeSnapshot: { subjectViews: [] },
			homeSnapshotShouldRefresh: true
		});

		await expect(
			load({
				locals: { user },
				params: { subject: 'biology' },
				url: new URL('http://localhost/subjects/biology/content'),
				parent
			} as never)
		).rejects.toMatchObject({ status: 503 });

		expect(parent).toHaveBeenCalledOnce();
		expect(mocks.getSubjectLearningPublicCatalog).not.toHaveBeenCalled();
	});

	it('hosts OCR English Literature set-text choices on the canonical subject-content route', async () => {
		mocks.getSubjectLearningPublicCatalog.mockResolvedValue(literatureCatalog);
		const parent = vi.fn().mockResolvedValue({
			homeSnapshot: { subjectViews: [literature] },
			homeSnapshotShouldRefresh: false
		});

		const result = await load({
			locals: { user },
			params: { subject: 'english-literature' },
			url: new URL('http://localhost/subjects/english-literature/content'),
			parent
		} as never);
		if (!result) throw new Error('Expected the English Literature subject-content page data.');

		expect(result).toMatchObject({
			subject: literature,
			curriculum: {
				label: 'OCR GCSE English Literature'
			}
		});
		expect(result.curriculum.groups).toHaveLength(4);
		expect(result.curriculum.groups).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'option_group', selectionMin: 1, selectionMax: 1 })
			])
		);
	});

	it('saves OCR set texts through the canonical subject-content action', async () => {
		mocks.getSubjectLearningPublicCatalog.mockResolvedValue(literatureCatalog);
		mocks.getLearnerProfileSettings.mockResolvedValue({
			subjects: [{ ...literature, enabled: true }]
		});
		const form = new FormData();
		form.set('scopeMode', 'selected');
		for (const topic of literatureTopics) form.append('topicId', topic.id);

		await expect(
			actions.default?.({
				locals: { user },
				params: { subject: 'english-literature' },
				request: new Request('http://localhost/subjects/english-literature/content', {
					method: 'POST',
					body: form
				})
			} as never)
		).rejects.toMatchObject({ status: 303, location: '/subjects/english-literature' });

		expect(mocks.updateEnglishLiteratureSelections).toHaveBeenCalledWith({
			userId: user.uid,
			selections: {
				modernText: 'An Inspector Calls',
				nineteenthCenturyNovel: 'A Christmas Carol',
				poetryCluster: 'Conflict',
				shakespearePlay: 'Macbeth'
			}
		});
		expect(mocks.saveSubjectCurriculumScope).not.toHaveBeenCalled();
	});
});
