import { describe, expect, it } from 'vitest';

import { resolveOfficialRecallEvidence } from '../../../scripts/lib/recall-curriculum-evidence.mjs';

describe('official recall curriculum evidence', () => {
	it('resolves exact PDF scope and reviewed offering targets without model-authored IDs', () => {
		const evidence = resolveOfficialRecallEvidence({
			catalog: catalogFixture(),
			catalogPath: 'data/curricula/curriculum-catalog.json',
			specificationId: 'aqa-8464',
			componentId: 'aqa-8464-vaccination',
			subject: 'Biology',
			offeringIds: ['aqa-8464-biology-foundation', 'aqa-8464-biology-higher'],
			primaryOfferingId: 'aqa-8464-biology-higher',
			pageText:
				'Vaccination introduces a harmless form of a pathogen. White blood cells make antibodies, and memory cells remain to respond rapidly on later exposure.'
		});

		expect(evidence.subject).toBe('Biology');
		expect(evidence.pageStart).toBe(37);
		expect(evidence.pageEnd).toBe(37);
		expect(evidence.topicComponent.id).toBe('aqa-8464-infection');
		expect(evidence.targets).toEqual([
			{
				offeringId: 'aqa-8464-biology-foundation',
				curriculumComponentId: 'aqa-8464-vaccination',
				topicComponentId: 'aqa-8464-infection',
				isPrimary: false,
				confidence: 1,
				reviewed: true,
				mappingSource: 'recall-card-compiler-v2'
			},
			{
				offeringId: 'aqa-8464-biology-higher',
				curriculumComponentId: 'aqa-8464-vaccination',
				topicComponentId: 'aqa-8464-infection',
				isPrimary: true,
				confidence: 1,
				reviewed: true,
				mappingSource: 'recall-card-compiler-v2'
			}
		]);
		expect(evidence.fingerprint).toMatch(/^[a-f0-9]{64}$/);
	});

	it('requires explicit tier scope and blocks Foundation when the source is HT-only', () => {
		const common = {
			catalog: catalogFixture(),
			catalogPath: 'catalog.json',
			specificationId: 'aqa-8464',
			componentId: 'aqa-8464-vaccination',
			subject: 'Biology'
		};
		expect(() =>
			resolveOfficialRecallEvidence({
				...common,
				pageText:
					'Vaccination introduces a harmless form of a pathogen. White blood cells make antibodies, and memory cells remain to respond rapidly on later exposure.'
			})
		).toThrow(/explicit --offering-id/);
		expect(() =>
			resolveOfficialRecallEvidence({
				...common,
				offeringIds: ['aqa-8464-biology-foundation'],
				pageText:
					'HT only: Vaccination introduces a harmless form of a pathogen. White blood cells make antibodies, and memory cells remain to respond rapidly on later exposure.'
			})
		).toThrow(/Higher-tier-only material/);
	});

	it('rejects broad chapters, subject drift and incompatible offerings', () => {
		const common = {
			catalog: catalogFixture(),
			catalogPath: 'catalog.json',
			specificationId: 'aqa-8464',
			pageText:
				'Vaccination introduces a harmless form of a pathogen. White blood cells make antibodies, and memory cells remain to respond rapidly on later exposure.'
		};
		expect(() =>
			resolveOfficialRecallEvidence({
				...common,
				componentId: 'aqa-8464-infection',
				subject: 'Biology'
			})
		).toThrow(/focused topic or section/);
		expect(() =>
			resolveOfficialRecallEvidence({
				...common,
				componentId: 'aqa-8464-vaccination',
				subject: 'Physics'
			})
		).toThrow(/does not match/);
		expect(() =>
			resolveOfficialRecallEvidence({
				...common,
				componentId: 'aqa-8464-vaccination',
				subject: 'Biology',
				offeringIds: ['aqa-8464-physics-higher']
			})
		).toThrow(/does not cover/);
	});
});

function catalogFixture() {
	const root = {
		id: 'aqa-8464-root',
		parentId: null,
		code: 'root',
		title: 'Combined Science',
		kind: 'specification',
		selectable: false,
		subjectArea: null,
		tier: [],
		sourcePageStart: 1,
		sourcePageEnd: 200
	};
	const biology = {
		id: 'aqa-8464-biology',
		parentId: root.id,
		code: '4',
		title: 'Biology',
		kind: 'subject_area',
		selectable: false,
		subjectArea: 'Biology',
		tier: ['Foundation', 'Higher'],
		sourcePageStart: 20,
		sourcePageEnd: 80
	};
	const infection = {
		id: 'aqa-8464-infection',
		parentId: biology.id,
		code: '4.3',
		title: 'Infection and response',
		kind: 'chapter',
		selectable: true,
		subjectArea: 'Biology',
		tier: ['Foundation', 'Higher'],
		sourcePageStart: 34,
		sourcePageEnd: 41
	};
	const vaccination = {
		id: 'aqa-8464-vaccination',
		parentId: infection.id,
		code: '4.3.1.7',
		title: 'Vaccination',
		kind: 'topic',
		selectable: false,
		subjectArea: 'Biology',
		tier: ['Foundation', 'Higher'],
		sourcePageStart: 37,
		sourcePageEnd: 37
	};
	return {
		schemaVersion: 2,
		specifications: [
			{
				id: 'aqa-8464',
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Combined Science: Trilogy',
				course: 'Combined Science',
				specificationCode: '8464',
				version: '1.1',
				title: 'AQA GCSE Combined Science',
				landingUrl: 'https://www.aqa.org.uk/specification',
				pdfUrl: 'https://www.aqa.org.uk/specification.pdf',
				localPath: 'data/curricula/specification.pdf',
				sha256: 'a'.repeat(64),
				components: [root, biology, infection, vaccination]
			}
		],
		offerings: [
			{
				id: 'aqa-8464-biology-foundation',
				specificationId: 'aqa-8464',
				profileSubject: 'Biology',
				tier: 'Foundation',
				rootComponentId: biology.id,
				selectableComponentIds: [infection.id]
			},
			{
				id: 'aqa-8464-biology-higher',
				specificationId: 'aqa-8464',
				profileSubject: 'Biology',
				tier: 'Higher',
				rootComponentId: biology.id,
				selectableComponentIds: [infection.id]
			},
			{
				id: 'aqa-8464-physics-higher',
				specificationId: 'aqa-8464',
				profileSubject: 'Physics',
				tier: 'Higher',
				rootComponentId: root.id,
				selectableComponentIds: []
			}
		]
	};
}
