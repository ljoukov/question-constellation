import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getSubjectLearningPublicCatalog: vi.fn(),
	saveSubjectCurriculumScope: vi.fn()
}));

vi.mock('$lib/server/subjectLearning', () => ({
	CurriculumScopeValidationError: class CurriculumScopeValidationError extends Error {},
	getSubjectLearningPublicCatalog: mocks.getSubjectLearningPublicCatalog,
	saveSubjectCurriculumScope: mocks.saveSubjectCurriculumScope
}));

import { load } from './subjects/[subject]/scope/+page.server';

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
						title: 'Course topics',
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

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getSubjectLearningPublicCatalog.mockResolvedValue(catalog);
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
			url: new URL('http://localhost/subjects/biology/scope'),
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
				url: new URL('http://localhost/subjects/biology/scope'),
				parent
			} as never)
		).rejects.toMatchObject({ status: 503 });

		expect(parent).toHaveBeenCalledOnce();
		expect(mocks.getSubjectLearningPublicCatalog).not.toHaveBeenCalled();
	});
});
