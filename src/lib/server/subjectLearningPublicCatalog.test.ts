import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getPublicRoutePayload: vi.fn()
}));

vi.mock('$lib/server/publicRoutePayloads', () => ({
	getPublicRoutePayload: mocks.getPublicRoutePayload
}));

import {
	SUBJECT_LEARNING_PUBLIC_CATALOG_ID,
	SUBJECT_LEARNING_PUBLIC_CATALOG_MAX_JSON_CHARACTERS,
	SUBJECT_LEARNING_PUBLIC_CATALOG_VERSION,
	getSubjectLearningPublicCatalog,
	parseSubjectLearningPublicCatalog
} from './subjectLearning';

function catalogFixture() {
	return {
		version: SUBJECT_LEARNING_PUBLIC_CATALOG_VERSION,
		boardAvailability: [{ subject: 'Biology', boards: ['AQA'] }],
		resumeQuestions: [
			{
				id: 'resume-question',
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Combined Science: Trilogy',
				subject_area: 'Biology',
				component_code: '8464/B/1H',
				tier: 'Higher',
				reviewedPrimaryMappingCount: 1,
				reviewedCurriculumMappings: [{ componentId: 'topic:cells', depth: 2 }]
			}
		],
		offerings: [
			{
				curriculum: {
					id: 'offering:biology',
					specificationId: 'specification:8464',
					board: 'AQA',
					qualification: 'GCSE',
					profileSubject: 'Biology',
					course: 'Combined Science',
					tier: 'Higher',
					specificationCode: '8464',
					specificationVersion: '1.1',
					specificationUrl: 'https://example.test/specification',
					label: 'AQA Combined Science Biology Higher',
					groups: [
						{
							title: 'Topics',
							kind: 'group',
							selectionMin: null,
							selectionMax: null,
							components: [{ id: 'topic:cells' }]
						}
					],
					topics: [
						{
							id: 'topic:cells',
							code: '4.1',
							title: 'Cell biology',
							paper: 'Paper 1',
							specUrl: 'https://example.test/specification'
						}
					]
				},
				recallCards: [
					{
						id: 'card:cells',
						topicId: 'recall:cells',
						topicComponentId: 'topic:cells',
						contentRevision: 1,
						contentHash: 'content-hash'
					}
				],
				questions: [
					{
						id: 'question:cells',
						title: 'Explain how a cell is adapted',
						marks: 4,
						curriculumComponentId: 'topic:cells',
						answerChainId: 'chain:cells',
						mappingKind: 'exact_topic',
						contentOrder: 184
					},
					{
						id: 'question:course',
						title: 'Apply the course method',
						marks: 3,
						curriculumComponentId: null,
						answerChainId: 'chain:course',
						mappingKind: 'course_only',
						contentOrder: 201
					}
				]
			}
		]
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('subject-learning public catalog contract', () => {
	it('accepts the strict current schema and preserves original content order', () => {
		const parsed = parseSubjectLearningPublicCatalog(catalogFixture());

		expect(parsed?.version).toBe(SUBJECT_LEARNING_PUBLIC_CATALOG_VERSION);
		expect(parsed?.offerings[0]?.questions.map((question) => question.contentOrder)).toEqual([
			184, 201
		]);
	});

	it('rejects stale versions and cross-offering topic references', () => {
		const stale = { ...catalogFixture(), version: 1 };
		expect(parseSubjectLearningPublicCatalog(stale)).toBeNull();

		const invalid = catalogFixture();
		invalid.offerings[0].questions[0].curriculumComponentId = 'topic:other-offering';
		expect(parseSubjectLearningPublicCatalog(invalid)).toBeNull();
	});

	it('rejects inconsistent course-only provenance and oversized payloads', () => {
		const inconsistent = catalogFixture();
		inconsistent.offerings[0].questions[1].curriculumComponentId = 'topic:cells';
		expect(parseSubjectLearningPublicCatalog(inconsistent)).toBeNull();

		const oversized = catalogFixture();
		oversized.offerings[0].questions[0].title = 'x'.repeat(
			SUBJECT_LEARNING_PUBLIC_CATALOG_MAX_JSON_CHARACTERS
		);
		expect(parseSubjectLearningPublicCatalog(oversized)).toBeNull();
	});

	it('loads exactly the named one-row payload and fails closed when it is absent', async () => {
		const fixture = catalogFixture();
		mocks.getPublicRoutePayload.mockResolvedValueOnce(fixture);
		await expect(getSubjectLearningPublicCatalog()).resolves.toEqual(fixture);
		expect(mocks.getPublicRoutePayload).toHaveBeenCalledOnce();
		expect(mocks.getPublicRoutePayload).toHaveBeenCalledWith(
			SUBJECT_LEARNING_PUBLIC_CATALOG_ID
		);

		mocks.getPublicRoutePayload.mockResolvedValueOnce(null);
		await expect(getSubjectLearningPublicCatalog()).rejects.toThrow('missing or invalid');
		expect(mocks.getPublicRoutePayload).toHaveBeenCalledTimes(2);
	});
});
