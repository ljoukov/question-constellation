import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	CURRICULUM_IMPORT_OWNER,
	REVIEWED_QUESTION_MAPPING_SCHEMA_VERSION,
	buildQuestionCurriculumMappingEvidence,
	questionCurriculumMappingEvidenceHash,
	sha256Stable,
	validateReviewedQuestionCurriculumMappingArtifact
} from '../../../scripts/lib/curriculum-catalog.mjs';

const sourceSpecificationId = 'aqa-gcse-computer-science-8525-v1.2-2026';
const currentSpecificationId = 'aqa-gcse-computer-science-8525-v1.3-2027';
type ArtifactMappingFixture = ReturnType<typeof artifact>['mappings'][number];
type MutableArtifactFixture = Omit<ReturnType<typeof artifact>, 'scope' | 'mappings'> & {
	scope: ReturnType<typeof artifact>['scope'] & { questionIds?: string[] };
	mappings: Array<
		Omit<ArtifactMappingFixture, 'withheldTargets'> & {
			withheldTargets: Array<{ specificationId: string; reason: string }>;
		}
	>;
};
type LoadedLedgerEntry = {
	questionId: string;
	evidenceHash: string;
	targets: Array<{
		specificationId: string;
		curriculumCode: string;
	}>;
	withheldTargets: Array<{ specificationId: string }>;
	evidence: {
		sourceDocument: { fileHash: string };
		question: { sourceQuestionRef: string };
		markSchemeItems: Array<{
			sourceDocumentId: string;
			sourceDocument: { id: string; fileHash: string };
		}>;
	};
};
type LoadedReviewedLedger = {
	scope: { questionCount: number; questionIds: string[] };
	mappings: LoadedLedgerEntry[];
	withheldQuestions: LoadedLedgerEntry[];
};

describe('reviewed question curriculum mapping artifacts', () => {
	it('maps explicit 8525 evidence to source and current specifications while withholding 8520', () => {
		const sourceQuestion = question('q-8525', 'source-paper', '85252', 2024);
		const legacyQuestion = question('q-8520', 'legacy-paper', '85202', 2021);
		const result = validateReviewedQuestionCurriculumMappingArtifact(
			artifact(sourceQuestion, legacyQuestion),
			{ questions: [sourceQuestion, legacyQuestion], snapshot: snapshot() as never }
		);

		expect(result.counts).toEqual({
			scopeQuestions: 2,
			mappedQuestions: 1,
			mappingRows: 2,
			withheldQuestions: 1,
			withheldTargets: 0
		});
		expect(result.mappings).toEqual([
			expect.objectContaining({
				questionId: 'q-8525',
				specificationId: sourceSpecificationId,
				curriculumComponentId: `${sourceSpecificationId}:3-3`,
				mappingSource: `${CURRICULUM_IMPORT_OWNER}:reviewed_artifact`,
				reviewed: true
			}),
			expect.objectContaining({
				questionId: 'q-8525',
				specificationId: currentSpecificationId,
				curriculumComponentId: `${currentSpecificationId}:3-3`
			})
		]);
		expect(result.withheld).toEqual([
			expect.objectContaining({
				questionId: 'q-8520',
				sourceClassification: 'aqa-gcse-computer-science-8520-legacy'
			})
		]);
	});

	it('requires each reviewed 8525 question to map or explicitly withhold every declared target', () => {
		const sourceQuestion = question('q-8525', 'source-paper', '85252', 2023);
		const legacyQuestion = question('q-8520', 'legacy-paper', '85202', 2021);
		const input: MutableArtifactFixture = artifact(sourceQuestion, legacyQuestion);
		input.mappings[0].targets = [input.mappings[0].targets[0]];
		input.mappings[0].withheldTargets = [
			{
				specificationId: currentSpecificationId,
				reason: 'The current specification removed this exact assessed content.'
			}
		];

		const result = validateReviewedQuestionCurriculumMappingArtifact(input, {
			questions: [sourceQuestion, legacyQuestion],
			snapshot: snapshot() as never
		});
		expect(result.mappings).toHaveLength(1);
		expect(result.targetWithholdings).toEqual([
			expect.objectContaining({
				questionId: 'q-8525',
				specificationId: currentSpecificationId
			})
		]);
	});

	it('fails closed on evidence drift, stale targets, and incomplete scope coverage', () => {
		const sourceQuestion = question('q-8525', 'source-paper', '85252', 2024);
		const legacyQuestion = question('q-8520', 'legacy-paper', '85202', 2021);
		const input = artifact(sourceQuestion, legacyQuestion);

		const changedQuestion = { ...sourceQuestion, prompt_text: 'Changed prompt' };
		expect(() =>
			validateReviewedQuestionCurriculumMappingArtifact(input, {
				questions: [changedQuestion, legacyQuestion],
				snapshot: snapshot() as never
			})
		).toThrow(/evidence no longer matches stored prompt\/chain\/mark evidence/);

		const changedMarkSchemeSource = structuredClone(sourceQuestion);
		const changedMarkItems = JSON.parse(changedMarkSchemeSource.mapping_evidence_mark_scheme_json);
		changedMarkItems[0].sourceDocumentHash = 'sha256:changed-mark-scheme';
		changedMarkSchemeSource.mapping_evidence_mark_scheme_json = JSON.stringify(changedMarkItems);
		expect(() =>
			validateReviewedQuestionCurriculumMappingArtifact(input, {
				questions: [changedMarkSchemeSource, legacyQuestion],
				snapshot: snapshot() as never
			})
		).toThrow(/evidence no longer matches stored prompt\/chain\/mark evidence/);

		const staleTarget = structuredClone(input);
		staleTarget.mappings[0].targets[1].curriculumComponentId = 'removed-component';
		expect(() =>
			validateReviewedQuestionCurriculumMappingArtifact(staleTarget, {
				questions: [sourceQuestion, legacyQuestion],
				snapshot: snapshot() as never
			})
		).toThrow(/component is stale or belongs to another specification/);

		const incomplete = structuredClone(input);
		incomplete.withheldQuestions = [];
		expect(() =>
			validateReviewedQuestionCurriculumMappingArtifact(incomplete, {
				questions: [sourceQuestion, legacyQuestion],
				snapshot: snapshot() as never
			})
		).toThrow(/artifact does not account for in-scope question q-8520/);
	});

	it('supports exact question-id scopes and artifacts with only mappings or withholdings', () => {
		const sourceQuestion = question('q-8525', 'source-paper', '85252', 2024);
		const legacyQuestion = question('q-8520', 'legacy-paper', '85202', 2021);
		const mappedOnly: MutableArtifactFixture = artifact(sourceQuestion, legacyQuestion);
		mappedOnly.scope.sourceDocumentIds = ['source-paper'];
		mappedOnly.scope.questionIds = ['q-8525'];
		mappedOnly.scope.questionCount = 1;
		mappedOnly.withheldQuestions = [];

		const mappedResult = validateReviewedQuestionCurriculumMappingArtifact(mappedOnly, {
			questions: [sourceQuestion, legacyQuestion],
			snapshot: snapshot() as never
		});
		expect(mappedResult.counts.mappedQuestions).toBe(1);
		expect(mappedResult.counts.withheldQuestions).toBe(0);

		const withheldOnly: MutableArtifactFixture = artifact(sourceQuestion, legacyQuestion);
		withheldOnly.scope.sourceDocumentIds = ['legacy-paper'];
		withheldOnly.scope.questionIds = ['q-8520'];
		withheldOnly.scope.questionCount = 1;
		withheldOnly.mappings = [];
		const withheldResult = validateReviewedQuestionCurriculumMappingArtifact(withheldOnly, {
			questions: [sourceQuestion, legacyQuestion],
			snapshot: snapshot() as never
		});
		expect(withheldResult.counts.mappedQuestions).toBe(0);
		expect(withheldResult.counts.withheldQuestions).toBe(1);

		const driftedPaper = {
			...sourceQuestion,
			mapping_evidence_source_document_hash: 'sha256:changed-paper'
		};
		expect(() =>
			validateReviewedQuestionCurriculumMappingArtifact(mappedOnly, {
				questions: [driftedPaper, legacyQuestion],
				snapshot: snapshot() as never
			})
		).toThrow(/evidence no longer matches/);
	});

	it('keeps the checked-in CS ledger internally complete and evidence hashed', () => {
		const input = JSON.parse(
			readFileSync(
				path.join(
					process.cwd(),
					'data/curricula/question-mappings/aqa-computer-science-8525-reviewed-v1.json'
				),
				'utf8'
			)
		) as LoadedReviewedLedger;
		expect(input.scope.questionCount).toBe(228);
		expect(input.mappings).toHaveLength(163);
		expect(input.withheldQuestions).toHaveLength(65);
		expect(input.mappings.flatMap((entry) => entry.targets)).toHaveLength(325);
		expect(input.mappings.flatMap((entry) => entry.withheldTargets)).toHaveLength(1);
		expect(
			input.mappings.filter((entry) =>
				entry.targets.some((target) => target.specificationId === currentSpecificationId)
			)
		).toHaveLength(162);
		for (const entry of [...input.mappings, ...input.withheldQuestions]) {
			expect(entry.evidenceHash).toBe(sha256Stable(entry.evidence));
		}
		const removedTopology = input.mappings.find(
			(entry) =>
				entry.questionId === 'computer-science-2023-june-paper-2-computing-concepts-qp-13-3'
		);
		expect(removedTopology?.targets).toHaveLength(1);
		expect(removedTopology?.withheldTargets[0]).toEqual(
			expect.objectContaining({ specificationId: currentSpecificationId })
		);
	});

	it('keeps the residual reviewed ledgers complete and internally hashed', () => {
		const expected = [
			['aqa-biology-8461-missing-spec-ref-reviewed-v1.json', 13, 0, 13],
			['aqa-biology-8461-paper-2-missing-spec-ref-reviewed-v1.json', 43, 39, 4],
			['aqa-combined-physics-missing-spec-ref-reviewed-v1.json', 34, 26, 8],
			['aqa-physics-8463-paper-1-missing-spec-ref-reviewed-v1.json', 43, 39, 4],
			['ocr-english-literature-j352-options-reviewed-v1.json', 72, 68, 4]
		] as const;
		for (const [filename, scopeQuestions, mappedQuestions, withheldQuestions] of expected) {
			const input = JSON.parse(
				readFileSync(path.join(process.cwd(), 'data/curricula/question-mappings', filename), 'utf8')
			) as LoadedReviewedLedger;
			expect(input.scope.questionCount).toBe(scopeQuestions);
			expect(input.scope.questionIds).toHaveLength(scopeQuestions);
			expect(input.mappings).toHaveLength(mappedQuestions);
			expect(input.withheldQuestions).toHaveLength(withheldQuestions);
			for (const entry of [...input.mappings, ...input.withheldQuestions]) {
				expect(entry.evidenceHash).toBe(sha256Stable(entry.evidence));
				expect(entry.evidence.sourceDocument.fileHash).toMatch(/^sha256:/);
				for (const markItem of entry.evidence.markSchemeItems) {
					expect(markItem.sourceDocument.id).toBe(markItem.sourceDocumentId);
					expect(markItem.sourceDocument.fileHash).toMatch(/^sha256:/);
				}
			}
		}

		const physics = JSON.parse(
			readFileSync(
				path.join(
					process.cwd(),
					'data/curricula/question-mappings/aqa-physics-8463-paper-1-missing-spec-ref-reviewed-v1.json'
				),
				'utf8'
			)
		) as LoadedReviewedLedger;
		expect(
			Object.fromEntries(
				['4.1', '4.2', '4.3', '4.4'].map((code) => [
					code,
					physics.mappings.filter((entry) => entry.targets[0].curriculumCode === code).length
				])
			)
		).toEqual({ '4.1': 9, '4.2': 16, '4.3': 7, '4.4': 7 });
		expect(
			physics.withheldQuestions.map((entry) => entry.evidence.question.sourceQuestionRef)
		).toEqual(['02.5', '07.1', '07.3', '07.4']);
	});
});

function question(id: string, sourceDocumentId: string, componentCode: string, year: number) {
	const row = {
		id,
		status: 'published',
		needs_human_review: 0,
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Computer Science',
		subject_area: 'Computer Science',
		source_document_id: sourceDocumentId,
		source_question_ref: '01.1',
		component_code: componentCode,
		spec_ref: null,
		topic_path_json: '[]',
		year,
		prompt_text: `Prompt for ${id}`,
		self_contained_prompt_text: `Prompt for ${id}`,
		context_text: null,
		marks: 1,
		mapping_evidence_mark_scheme_json: JSON.stringify([
			{
				id: `${id}-mark-1`,
				sourceDocumentId: `${sourceDocumentId}-mark-scheme`,
				displayOrder: 1,
				itemType: 'mark',
				text: `Credit for ${id}`,
				marks: 1,
				sourceRef: 'MS p1',
				sourceDocumentDocType: 'mark_scheme',
				sourceDocumentTitle: `Mark scheme for ${id}`,
				sourceDocumentUrl: 'https://www.aqa.org.uk/mark-scheme.pdf',
				sourceDocumentHash: `sha256:${id}-mark-scheme`
			}
		]),
		mapping_evidence_answer_chain_id: `${id}-chain`,
		mapping_evidence_answer_chain_title: 'Evidence chain',
		mapping_evidence_answer_chain_text: 'given -> answer',
		mapping_evidence_chain_fit_notes: 'Reviewed fit.',
		mapping_evidence_source_document_type: 'question_paper',
		mapping_evidence_source_document_board: 'AQA',
		mapping_evidence_source_document_qualification: 'GCSE',
		mapping_evidence_source_document_subject: 'Computer Science',
		mapping_evidence_source_document_subject_area: 'Computer Science',
		mapping_evidence_source_document_tier: null,
		mapping_evidence_source_document_paper: 'Paper',
		mapping_evidence_source_document_component_code: componentCode,
		mapping_evidence_source_document_series: String(year),
		mapping_evidence_source_document_year: year,
		mapping_evidence_source_document_title: `Paper for ${id}`,
		mapping_evidence_source_document_url: 'https://www.aqa.org.uk/paper.pdf',
		mapping_evidence_source_document_hash: `sha256:${id}-paper`,
		mapping_evidence_source_document_page_count: 10
	};
	return row;
}

function artifact(
	sourceQuestion: ReturnType<typeof question>,
	legacyQuestion: ReturnType<typeof question>
) {
	return {
		schemaVersion: REVIEWED_QUESTION_MAPPING_SCHEMA_VERSION,
		id: 'test-reviewed-artifact',
		importOwner: CURRICULUM_IMPORT_OWNER,
		specificationSources: [
			{ specificationId: sourceSpecificationId, version: '1.2', fileHash: 'source-hash' },
			{ specificationId: currentSpecificationId, version: '1.3', fileHash: 'current-hash' }
		],
		scope: {
			board: 'AQA',
			qualification: 'GCSE',
			subject: 'Computer Science',
			sourceDocumentIds: ['source-paper', 'legacy-paper'],
			questionCount: 2
		},
		mappings: [
			{
				questionId: sourceQuestion.id,
				sourceSpecificationId,
				evidenceHash: questionCurriculumMappingEvidenceHash(sourceQuestion),
				evidence: buildQuestionCurriculumMappingEvidence(sourceQuestion),
				targets: [
					{
						specificationId: sourceSpecificationId,
						curriculumComponentId: `${sourceSpecificationId}:3-3`,
						curriculumCode: '3.3',
						confidence: 1,
						reviewNote: 'Source specification review.'
					},
					{
						specificationId: currentSpecificationId,
						curriculumComponentId: `${currentSpecificationId}:3-3`,
						curriculumCode: '3.3',
						confidence: 1,
						reviewNote: 'Cross-version review.'
					}
				],
				withheldTargets: []
			}
		],
		withheldQuestions: [
			{
				questionId: legacyQuestion.id,
				sourceClassification: 'aqa-gcse-computer-science-8520-legacy',
				reason: 'Legacy qualification deliberately withheld.',
				evidenceHash: questionCurriculumMappingEvidenceHash(legacyQuestion),
				evidence: buildQuestionCurriculumMappingEvidence(legacyQuestion)
			}
		]
	};
}

function snapshot() {
	return {
		specifications: [
			{
				id: sourceSpecificationId,
				version: '1.2',
				fileHash: 'source-hash',
				specificationCode: '8525',
				firstExamYear: 2022,
				lastExamYear: 2026
			},
			{
				id: currentSpecificationId,
				version: '1.3',
				fileHash: 'current-hash',
				specificationCode: '8525',
				firstExamYear: 2027,
				lastExamYear: null
			}
		],
		components: [
			{
				id: `${sourceSpecificationId}:3-3`,
				specificationId: sourceSpecificationId,
				code: '3.3',
				selectable: true
			},
			{
				id: `${currentSpecificationId}:3-3`,
				specificationId: currentSpecificationId,
				code: '3.3',
				selectable: true
			}
		]
	};
}
