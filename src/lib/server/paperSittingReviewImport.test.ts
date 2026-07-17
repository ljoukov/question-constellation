import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import {
	REQUIRED_PIPELINE_STEPS,
	derivePaperSittingReview,
	isExactWithdrawnPaperSittingPredecessor,
	paperSittingReviewWriteStatement,
	publishPaperSittingReview,
	validatePastPaperCatalogLink
} from '../../../scripts/lib/paper-sitting-review.mjs';

const sourceDocumentId = 'aqa-test-qp-jun25';
const approvedContentFingerprint = `paper-sitting-content-v1:${'a'.repeat(64)}`;

type CodexEvidence = {
	status: string;
	threadId?: string;
	model: string;
	thinkingLevel: string;
};
type SolvabilityResultFixture = {
	sourceQuestionRef: string;
	status: string;
	score: number;
	studentVisibleSolvable: boolean;
	markSchemeFits: boolean;
	missingContext?: unknown[];
	renderFindings?: unknown[];
	requiredRepairs: string[];
};
type SolvabilityReportFixture = {
	status: string;
	sourceDocumentId: string;
	minScore: number;
	questionCount: number;
	passed: number;
	failed: number;
	results: SolvabilityResultFixture[];
};
type ImportReadyPaperFixture = {
	sourceDocumentId: string;
	sourceDocument: {
		id: string;
		sourceUrl: string;
		paper?: string;
		title?: string;
		componentCode?: string;
	};
	markSchemeDocument: { id: string; sourceUrl: string; fileHash?: string };
	questions: Array<Record<string, unknown>>;
	extractionRun?: {
		publishableSubset: boolean;
		droppedUnpublishableSourceQuestionRefs: string[];
	};
};
type PipelineSection = { status: string; codex?: CodexEvidence; [key: string]: unknown };
type ReviewedSourceClosureFixture = {
	closureType: string;
	candidateMutation?: unknown;
	sourceDocuments: Record<string, { path: string; sha256: string }>;
	falsePositiveFindings?: unknown[];
	assertion: string;
	fieldRepairs?: unknown[];
	sourceAnchors?: unknown[];
	[key: string]: unknown;
};
type ProductionSummaryFixture = {
	status: string;
	startedAt: string;
	finishedAt: string;
	plan: { sourceDocumentId: string; importMode: string; solvabilityMode: string };
	steps: Array<{ label: string; status: string }>;
	extractionSummary: PipelineSection & { droppedExtractionQuestions: unknown[] };
	extractionJudgeSummary: PipelineSection & {
		plan: { allowedDroppedSourceQuestions: unknown[] };
		judgeReport: Record<string, unknown> & {
			checkedRefs?: string[];
			markTotal?: number;
			modelJudgePass?: boolean;
			reviewedSourceClosure?: ReviewedSourceClosureFixture;
		};
	};
	chainSummary: PipelineSection;
	solvabilitySummary: PipelineSection & {
		plan: {
			sourceDocumentId: string;
			questionCount: number;
			plannedRefs: string[];
			question: string | null;
			maxQuestions: number | null;
		};
		report: SolvabilityReportFixture;
	};
	importReady: {
		status: string;
		importMode: string;
		keptQuestions: number;
		droppedQuestions: number;
		importResults: Array<{
			sourceDocumentId: string;
			mode: string;
			questions: number;
			postImportContentFingerprintEvidence: {
				schemaVersion: string;
				producer: string;
				sourceDocumentId: string;
				importMode: string;
				capturedAt: string;
				contentFingerprint: string;
			};
		}>;
	};
};

function codexFixture(phase: string): CodexEvidence {
	return {
		status: 'passed',
		threadId: `thread-${phase}`,
		model: 'gpt-5.6-sol',
		thinkingLevel: 'max'
	};
}

function artifactFixture(): ImportReadyPaperFixture {
	return {
		sourceDocumentId,
		sourceDocument: {
			id: sourceDocumentId,
			sourceUrl: 'https://example.test/question-paper.pdf'
		},
		markSchemeDocument: {
			id: 'aqa-test-ms-jun25',
			sourceUrl: 'https://example.test/mark-scheme.pdf'
		},
		questions: [
			{
				sourceQuestionRef: '01.1',
				marks: 2,
				needsHumanReview: false,
				response: { kind: 'lines', count: 2 },
				markSchemeItems: [
					{ itemType: 'mark', marks: 1, text: 'First marking point.' },
					{ itemType: 'mark', marks: 1, text: 'Second marking point.' }
				],
				markChecklist: [
					{ text: 'First marking point.', required: true },
					{ text: 'Second marking point.', required: true }
				]
			},
			{
				sourceQuestionRef: '02.1',
				marks: 3,
				needsHumanReview: false,
				response: { kind: 'lines', count: 3 },
				markSchemeItems: [
					{ itemType: 'mark', marks: 1, text: 'First marking point.' },
					{ itemType: 'mark', marks: 1, text: 'Second marking point.' },
					{ itemType: 'mark', marks: 1, text: 'Third marking point.' }
				],
				markChecklist: [
					{ text: 'First marking point.', required: true },
					{ text: 'Second marking point.', required: true },
					{ text: 'Third marking point.', required: true }
				]
			}
		]
	};
}

function reportFixture(): SolvabilityReportFixture {
	return {
		status: 'passed',
		sourceDocumentId,
		minScore: 0.8,
		questionCount: 2,
		passed: 2,
		failed: 0,
		results: ['01.1', '02.1'].map((sourceQuestionRef) => ({
			sourceQuestionRef,
			status: 'passed',
			score: 0.94,
			studentVisibleSolvable: true,
			markSchemeFits: true,
			missingContext: [],
			renderFindings: [],
			requiredRepairs: [] as string[]
		}))
	};
}

function summaryFixture(): ProductionSummaryFixture {
	return {
		status: 'passed',
		startedAt: '2025-06-03T09:00:00.000Z',
		finishedAt: '2025-06-03T10:00:00.000Z',
		plan: {
			sourceDocumentId,
			importMode: 'write',
			solvabilityMode: 'codex'
		},
		steps: REQUIRED_PIPELINE_STEPS.map((label: string) => ({ label, status: 'passed' })),
		extractionSummary: {
			status: 'passed',
			codex: codexFixture('extraction'),
			droppedExtractionQuestions: []
		},
		extractionJudgeSummary: {
			status: 'passed',
			codex: codexFixture('extraction-judge'),
			plan: { allowedDroppedSourceQuestions: [] },
			judgeReport: {
				status: 'passed',
				verdict: 'pass',
				score: 0.94,
				questionCount: 2,
				markTotal: 5,
				checkedRefs: ['01.1', '02.1'],
				requiredRepairs: []
			}
		},
		chainSummary: { status: 'passed', codex: codexFixture('answer-chains') },
		solvabilitySummary: {
			status: 'passed',
			codex: codexFixture('solvability'),
			plan: {
				sourceDocumentId,
				questionCount: 2,
				plannedRefs: ['01.1', '02.1'],
				question: null,
				maxQuestions: null
			},
			report: reportFixture()
		},
		importReady: {
			status: 'passed',
			importMode: 'write',
			keptQuestions: 2,
			droppedQuestions: 0,
			importResults: [
				{
					sourceDocumentId,
					mode: 'write',
					questions: 2,
					postImportContentFingerprintEvidence: {
						schemaVersion: 'production-import-post-write-content-fingerprint-v1',
						producer: 'scripts/run-codex-production-import-pipeline.mjs',
						sourceDocumentId,
						importMode: 'write',
						capturedAt: '2025-06-03T09:59:00.000Z',
						contentFingerprint: approvedContentFingerprint
					}
				}
			]
		}
	};
}

function d1Fixture() {
	return [
		{
			source_document_id: sourceDocumentId,
			doc_type: 'question_paper',
			id: 'q-1',
			source_question_ref: '01.1',
			marks: 2,
			status: 'published',
			question_needs_human_review: 0,
			question_updated_at: '2025-06-02 08:00:00',
			overlay_id: 'overlay-1',
			overlay_version: 'v3',
			overlay_needs_human_review: 0,
			overlay_updated_at: '2025-06-02 08:05:00',
			required_asset_review_issues: 0
		},
		{
			source_document_id: sourceDocumentId,
			doc_type: 'question_paper',
			id: 'q-2',
			source_question_ref: '02.1',
			marks: 3,
			status: 'published',
			question_needs_human_review: 0,
			question_updated_at: '2025-06-02 08:00:00',
			overlay_id: 'overlay-2',
			overlay_version: 'v3',
			overlay_needs_human_review: 0,
			overlay_updated_at: '2025-06-02 08:05:00',
			required_asset_review_issues: 0
		}
	];
}

function derive(overrides: Record<string, unknown> = {}) {
	return derivePaperSittingReview({
		productionSummary: summaryFixture(),
		importReadyPaper: artifactFixture(),
		d1Questions: d1Fixture(),
		durationMinutes: 60,
		reviewedBy: 'production-run:test-2025',
		pastPaperEntryId: 'aqa-test-2025-june-paper-1',
		approvedContentFingerprint,
		...overrides
	});
}

describe('paper sitting approval derivation', () => {
	it('derives approval only from an exact complete write run, solvability report and D1 inventory', () => {
		const record = derive();
		expect(record).toMatchObject({
			source_document_id: sourceDocumentId,
			past_paper_entry_id: 'aqa-test-2025-june-paper-1',
			scope: 'complete_official_paper',
			overlay_version: 'v3',
			expected_question_count: 2,
			expected_total_marks: 5,
			duration_minutes: 60,
			approved_content_fingerprint: approvedContentFingerprint,
			status: 'approved',
			reviewed_by: 'production-run:test-2025',
			reviewed_at: '2025-06-03T10:00:00.000Z'
		});
		expect(JSON.parse(record.question_refs_json)).toEqual(['01.1', '02.1']);
	});

	it('fails closed when an approval is not linked to a public past-paper entry', () => {
		expect(() => derive({ pastPaperEntryId: null })).toThrow(/pastPaperEntryId is required/);
	});

	it('requires the exact live-content fingerprint before deriving an approval', () => {
		expect(() => derive({ approvedContentFingerprint: null })).toThrow(
			/approvedContentFingerprint/
		);
		expect(() =>
			derive({ approvedContentFingerprint: 'paper-sitting-content-v1:not-a-hash' })
		).toThrow(/approvedContentFingerprint/);
	});

	it('rejects live D1 content mutated after the exact import fingerprint was captured', () => {
		const productionSummary = summaryFixture();
		productionSummary.importReady.importResults[0].postImportContentFingerprintEvidence.contentFingerprint =
			`paper-sitting-content-v1:${'b'.repeat(64)}`;
		expect(() => derive({ productionSummary })).toThrow(
			/live D1 content fingerprint does not match the exact post-import content fingerprint/i
		);
	});

	it('rejects a write summary that did not capture an exact post-import fingerprint', () => {
		const productionSummary = summaryFixture();
		delete (
			productionSummary.importReady.importResults[0] as Partial<
				ProductionSummaryFixture['importReady']['importResults'][number]
			>
		).postImportContentFingerprintEvidence;
		expect(() => derive({ productionSummary })).toThrow(
			/approvedContentFingerprint|post-import content fingerprint/
		);
	});

	it('rejects duplicate or extra import results instead of selecting the first match', () => {
		const productionSummary = summaryFixture();
		productionSummary.importReady.importResults.push({
			...productionSummary.importReady.importResults[0]
		});
		expect(() => derive({ productionSummary })).toThrow(
			/exactly one matching D1 write result/
		);
	});

	it('requires the dedicated post-import fingerprint pipeline step', () => {
		const productionSummary = summaryFixture();
		productionSummary.steps = productionSummary.steps.filter(
			(step) => step.label !== 'exact post-import D1 content fingerprint'
		);
		expect(() => derive({ productionSummary })).toThrow(
			/missing an accepted exact post-import D1 content fingerprint step/
		);
	});

	it.each([
		['extractionSummary', 'Codex PDF extraction'],
		['extractionJudgeSummary', 'independent Codex extraction judge'],
		['chainSummary', 'Codex answer-chain reconciliation'],
		['solvabilitySummary', 'Codex solvability judge']
	] as const)('rejects an arbitrary model or thinking level for %s', (field, label) => {
		const wrongModel = summaryFixture();
		wrongModel[field].codex!.model = 'gpt-5.5';
		expect(() => derive({ productionSummary: wrongModel })).toThrow(
			new RegExp(`${label} must use exact gpt-5\\.6-sol/max`, 'i')
		);

		const wrongThinking = summaryFixture();
		wrongThinking[field].codex!.thinkingLevel = 'high';
		expect(() => derive({ productionSummary: wrongThinking })).toThrow(
			new RegExp(`${label} must use exact gpt-5\\.6-sol/max`, 'i')
		);
	});

	it.each(['none', 'asset-canvas', 'drawing-box'])(
		'rejects a marked %s response that the full-paper grader cannot safely score',
		(kind) => {
			const importReadyPaper = artifactFixture();
			importReadyPaper.questions[0].response = { kind };
			expect(() => derive({ importReadyPaper })).toThrow(
				new RegExp(`unsupported full-paper response kind ${kind}`)
			);
		}
	);

	it('rejects a four-mark response backed by only one one-mark source row', () => {
		const importReadyPaper = artifactFixture();
		importReadyPaper.questions[0] = {
			...importReadyPaper.questions[0],
			marks: 4,
			markSchemeItems: [{ itemType: 'mark', marks: 1, text: 'Only one marking point.' }],
			markChecklist: [{ text: 'Only one marking point.', required: true }]
		};
		importReadyPaper.questions[1].marks = 1;
		const productionSummary = summaryFixture();
		productionSummary.extractionJudgeSummary.judgeReport.markTotal = 5;
		expect(() => derive({ importReadyPaper, productionSummary })).toThrow(
			/grading evidence for only 1 of 4 marks/
		);
	});

	it('proves the catalog link against both official source URLs', () => {
		const catalog = {
			pages: [
				{
					entries: [
						{
							id: 'aqa-test-2025-june-paper-1',
							documents: [
								{
									type: 'questionPaper',
									url: 'https://example.test/question-paper.pdf'
								},
								{
									type: 'markScheme',
									url: 'https://example.test/mark-scheme.pdf'
								}
							]
						}
					]
				}
			]
		};
		expect(
			validatePastPaperCatalogLink({
				catalog,
				pastPaperEntryId: 'aqa-test-2025-june-paper-1',
				importReadyPaper: artifactFixture()
			}).id
		).toBe('aqa-test-2025-june-paper-1');
		expect(() =>
			validatePastPaperCatalogLink({
				catalog,
				pastPaperEntryId: 'missing-entry',
				importReadyPaper: artifactFixture()
			})
		).toThrow(/was not found exactly once/);
		const wrongPaper = artifactFixture();
		wrongPaper.sourceDocument.sourceUrl = 'https://example.test/different-question-paper.pdf';
		expect(() =>
			validatePastPaperCatalogLink({
				catalog,
				pastPaperEntryId: 'aqa-test-2025-june-paper-1',
				importReadyPaper: wrongPaper
			})
		).toThrow(/does not match the imported question-paper source URL/);
	});

	it('accepts only exact trusted fingerprints or hashes when official URL hosts differ', () => {
		const questionFingerprint = 'a'.repeat(40);
		const markSchemeHash = 'b'.repeat(64);
		const catalog = {
			pages: [
				{
					entries: [
						{
							id: 'aqa-test-2025-june-paper-1',
							documents: [
								{
									type: 'questionPaper',
									url: `https://cdn.sanity.io/files/example/${questionFingerprint}.pdf`
								},
								{
									type: 'markScheme',
									url: 'https://catalog.example.test/mark-scheme.pdf',
									sha256: markSchemeHash
								}
							]
						}
					]
				}
			]
		};
		const artifact = artifactFixture();
		artifact.sourceDocument.sourceUrl = `https://www.aqa.org.uk/files/document/${questionFingerprint}.pdf`;
		artifact.markSchemeDocument.sourceUrl = 'https://aqa.example.test/mark-scheme.pdf';
		artifact.markSchemeDocument.fileHash = `sha256:${markSchemeHash}`;

		expect(
			validatePastPaperCatalogLink({
				catalog,
				pastPaperEntryId: 'aqa-test-2025-june-paper-1',
				importReadyPaper: artifact
			}).id
		).toBe('aqa-test-2025-june-paper-1');

		artifact.sourceDocument.sourceUrl = `https://www.aqa.org.uk/files/document/${'c'.repeat(40)}.pdf`;
		expect(() =>
			validatePastPaperCatalogLink({
				catalog,
				pastPaperEntryId: 'aqa-test-2025-june-paper-1',
				importReadyPaper: artifact
			})
		).toThrow(/document fingerprint/);
	});

	it('accepts expensive phases reused from independently passed Codex threads', () => {
		const summary = summaryFixture();
		summary.steps = summary.steps.map((step: { label: string; status: string }) => ({
			...step,
			status: [
				'Codex PDF extraction',
				'independent Codex extraction judge',
				'Codex answer-chain reconciliation',
				'Codex solvability judge'
			].includes(step.label)
				? 'reused'
				: step.status
		}));
		for (const field of [
			'extractionSummary',
			'extractionJudgeSummary',
			'chainSummary',
			'solvabilitySummary'
		] as const) {
			summary[field].codex = {
				status: 'passed',
				threadId: `thread-${field}`,
				model: 'gpt-5.6-sol',
				thinkingLevel: 'max'
			};
		}
		expect(derive({ productionSummary: summary }).source_document_id).toBe(sourceDocumentId);

		delete summary.chainSummary.codex?.threadId;
		expect(() => derive({ productionSummary: summary })).toThrow(/no independently passed Codex/);
	});

	it('accepts a strictly evidenced source-reviewed closure without calling it a model pass', () => {
		const summary = summaryFixture();
		const hash = 'a'.repeat(64);
		summary.steps = summary.steps.map((step: { label: string; status: string }) => ({
			...step,
			status: step.label === 'independent Codex extraction judge' ? 'reused' : step.status
		}));
		summary.extractionJudgeSummary = {
			status: 'passed_after_reviewed_source_closure',
			modelJudgePass: false,
			codex: codexFixture('failed-extraction-judge-audit'),
			plan: { allowedDroppedSourceQuestions: [] },
			judgeReport: {
				status: 'passed_after_reviewed_source_closure',
				verdict: 'reviewed_source_closure',
				modelJudgePass: false,
				questionCount: 2,
				markTotal: 5,
				checkedRefs: ['01.1', '02.1'],
				requiredRepairs: [],
				reviewedSourceClosure: {
					status: 'passed',
					closureType: 'human_source_reviewed_after_failed_model_audits',
					modelJudgePass: false,
					outputArtifact: { path: 'raw/test.json', sha256: hash },
					deterministicValidation: {
						path: 'validation.json',
						sha256: hash,
						status: 'passed',
						questionCount: 2,
						markTotal: 5,
						blockingIssues: 0
					},
					sourceDocuments: {
						questionPaper: { path: 'qp.pdf', sha256: hash },
						markScheme: { path: 'ms.pdf', sha256: hash }
					},
					modelAudits: [
						{
							executionStatus: 'passed',
							verdict: 'fail',
							threadId: 'thread-failed-audit',
							model: 'gpt-5.6-sol',
							thinkingLevel: 'max',
							checkedRefs: 2,
							questionCount: 2,
							markTotal: 5,
							requiredRepairs: [{ sourceQuestionRef: '01.1', repair: 'Fix exact row.' }],
							report: { path: 'failed-report.json', sha256: hash }
						}
					],
					fieldRepairs: [
						{
							sourceQuestionRef: '01.1',
							field: 'response.unit',
							beforeSha256: 'b'.repeat(64),
							afterSha256: 'c'.repeat(64)
						}
					],
					sourceAnchors: [{ sourceQuestionRef: '01.1', markSchemePage: 4 }],
					assertion: 'No third model-judge pass is claimed.'
				}
			}
		};

		expect(derive({ productionSummary: summary }).source_document_id).toBe(sourceDocumentId);
		const modelAudit = summary.extractionJudgeSummary.judgeReport.reviewedSourceClosure!
			.modelAudits as Array<Record<string, unknown>>;
		modelAudit[0].thinkingLevel = 'high';
		expect(() => derive({ productionSummary: summary })).toThrow(
			/source-reviewed closure contains an incomplete or non-failed model audit/i
		);
		modelAudit[0].thinkingLevel = 'max';
		const closure = summary.extractionJudgeSummary.judgeReport.reviewedSourceClosure!;
		closure.closureType = 'human_source_reviewed_false_positive';
		closure.candidateMutation = {
			before: { path: 'raw/test.json', sha256: hash, canonicalJsonSha256: hash },
			after: { path: 'raw/test.json', sha256: hash, canonicalJsonSha256: hash },
			changedPaths: [],
			unchanged: true
		};
		closure.sourceDocuments.examinerReport = { path: 'examiner-report.pdf', sha256: hash };
		closure.falsePositiveFindings = [
			{
				sourceQuestionRef: '01.1',
				disposition: 'false_positive_no_candidate_change',
				officialSource: { physicalPdfPage: 7, anchors: ['Exact official source anchor'] }
			}
		];
		closure.assertion = 'No model-judge pass is claimed.';
		delete closure.fieldRepairs;
		delete closure.sourceAnchors;
		expect(derive({ productionSummary: summary }).source_document_id).toBe(sourceDocumentId);
		summary.extractionJudgeSummary.judgeReport.modelJudgePass = true;
		expect(() => derive({ productionSummary: summary })).toThrow(/not a model judge pass/);
	});

	it('rejects a pipeline artifact that dropped source questions', () => {
		const summary = summaryFixture();
		summary.importReady.droppedQuestions = 1;
		expect(() => derive({ productionSummary: summary })).toThrow(/Partial import-ready subsets/);
	});

	it('rejects extraction hold-outs even when the later import-ready subset reports no drops', () => {
		const summary = summaryFixture();
		summary.extractionSummary.droppedExtractionQuestions = [
			{ sourceQuestionRef: '03.1', reasons: ['known_unresolved_copyright_source'] }
		];
		expect(() => derive({ productionSummary: summary })).toThrow(/held out source questions/);

		const importReadyPaper = artifactFixture();
		Object.assign(importReadyPaper, {
			extractionRun: {
				publishableSubset: true,
				droppedUnpublishableSourceQuestionRefs: ['03.1']
			}
		});
		expect(() => derive({ importReadyPaper })).toThrow(/publishable subset/);
	});

	it('rejects an official section or option booklet as a complete paper sitting', () => {
		const importReadyPaper = artifactFixture();
		importReadyPaper.sourceDocument = {
			...importReadyPaper.sourceDocument,
			paper: 'Paper 1 Section A Option B: Germany, 1890–1945',
			title: 'Question paper: Paper 1 Section A Option B - June 2024'
		};

		expect(() => derive({ importReadyPaper })).toThrow(/section or option booklet/);
	});

	it('rejects OCR English papers until learner-selected alternatives are routed', () => {
		const importReadyPaper = artifactFixture();
		importReadyPaper.sourceDocument = {
			...importReadyPaper.sourceDocument,
			componentCode: 'J352/01',
			paper: 'Exploring modern and literary heritage texts'
		};

		expect(() => derive({ importReadyPaper })).toThrow(/learner-selected alternatives/);
	});

	it('requires the independent extraction judge to review every exact ref and mark', () => {
		const summary = summaryFixture();
		summary.extractionJudgeSummary.judgeReport.checkedRefs = ['01.1'];
		expect(() => derive({ productionSummary: summary })).toThrow(/did not check every/);

		summary.extractionJudgeSummary.judgeReport.checkedRefs = ['01.1', '02.1'];
		summary.extractionJudgeSummary.judgeReport.markTotal = 4;
		expect(() => derive({ productionSummary: summary })).toThrow(/counts do not match/);
	});

	it('rejects incomplete per-question solvability', () => {
		const summary = summaryFixture();
		summary.solvabilitySummary.report.results[1] = {
			...summary.solvabilitySummary.report.results[1],
			status: 'failed',
			studentVisibleSolvable: false,
			requiredRepairs: ['Restore a figure.']
		};
		expect(() => derive({ productionSummary: summary })).toThrow(/Solvability failed|Not every/);
	});

	it('rejects malformed solvability results that omit finding arrays', () => {
		const summary = summaryFixture();
		delete summary.solvabilitySummary.report.results[0].renderFindings;
		expect(() => derive({ productionSummary: summary })).toThrow(
			/malformed solvability finding arrays/
		);
	});

	it('rejects a filtered solvability run even if its report was hand-expanded', () => {
		const summary = summaryFixture();
		summary.solvabilitySummary.plan.maxQuestions = 1;
		expect(() => derive({ productionSummary: summary })).toThrow(/Filtered Codex solvability/);
	});

	it('rejects D1 marks or overlay inventory that differs from the imported artifact', () => {
		const d1Questions = d1Fixture() as Array<Record<string, unknown>>;
		d1Questions[1] = { ...d1Questions[1], marks: 2 };
		expect(() => derive({ d1Questions })).toThrow(/D1 total marks/);

		d1Questions[1] = { ...d1Fixture()[1], overlay_id: null };
		expect(() => derive({ d1Questions })).toThrow(/no reviewed current rendering overlay/);
	});
});

describe('unsupported paper-sitting approval cleanup migration', () => {
	it('withdraws unsafe reviewed papers while preserving a fully text-gradeable approval', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(`
			PRAGMA foreign_keys = ON;
			CREATE TABLE source_documents (id TEXT PRIMARY KEY);
			CREATE TABLE questions (
				id TEXT PRIMARY KEY,
				source_document_id TEXT NOT NULL,
				marks INTEGER NOT NULL
			);
			CREATE TABLE question_rendering_overlays (
				id TEXT PRIMARY KEY,
				question_id TEXT NOT NULL,
				overlay_version TEXT NOT NULL,
				needs_human_review INTEGER NOT NULL,
				render_json TEXT NOT NULL
			);
		`);
		db.exec(
			readFileSync(
				new URL('../../../migrations/0022_question_paper_sitting_reviews.sql', import.meta.url),
				'utf8'
			)
		);
		const insertReview = db.prepare(`
			INSERT INTO question_paper_sitting_reviews (
				source_document_id, past_paper_entry_id, scope, overlay_version,
				expected_question_count, expected_total_marks, duration_minutes,
				question_refs_json, solvability_report_json, status, reviewed_by, reviewed_at
			) VALUES (?, ?, 'complete_official_paper', 'v1', 1, 1, 60, '["01.1"]', '{}', 'approved', 'test', '2025-01-01T00:00:00.000Z')
		`);
		const insertQuestion = db.prepare(
			'INSERT INTO questions (id, source_document_id, marks) VALUES (?, ?, 1)'
		);
		const insertOverlay = db.prepare(`
			INSERT INTO question_rendering_overlays (
				id, question_id, overlay_version, needs_human_review, render_json
			) VALUES (?, ?, 'v1', 0, ?)
		`);
		for (const [paperId, kind] of [
			['safe-paper', 'lines'],
			['canvas-paper', 'asset-canvas'],
			['drawing-paper', 'drawing-box'],
			['none-paper', 'none']
		] as const) {
			db.prepare('INSERT INTO source_documents (id) VALUES (?)').run(paperId);
			insertReview.run(paperId, `${paperId}-entry`);
			insertQuestion.run(`${paperId}-q`, paperId);
			insertOverlay.run(
				`${paperId}-overlay`,
				`${paperId}-q`,
				JSON.stringify({ response: { kind } })
			);
		}

		db.exec(
			readFileSync(
				new URL(
					'../../../migrations/0026_withdraw_unsupported_paper_sittings.sql',
					import.meta.url
				),
				'utf8'
			)
		);

		expect(
			db
				.prepare(
					'SELECT source_document_id, status FROM question_paper_sitting_reviews ORDER BY source_document_id'
				)
				.all()
		).toEqual([
			{ source_document_id: 'canvas-paper', status: 'withdrawn' },
			{ source_document_id: 'drawing-paper', status: 'withdrawn' },
			{ source_document_id: 'none-paper', status: 'withdrawn' },
			{ source_document_id: 'safe-paper', status: 'approved' }
		]);
		db.close();
	});
});

describe('paper sitting approval dry-run, write and idempotency', () => {
	it('executes the migration and generated insert statement in SQLite', () => {
		const db = new DatabaseSync(':memory:');
		db.exec('PRAGMA foreign_keys = ON; CREATE TABLE source_documents (id TEXT PRIMARY KEY);');
		db.exec(
			readFileSync(
				new URL('../../../migrations/0022_question_paper_sitting_reviews.sql', import.meta.url),
				'utf8'
			)
		);
		db.exec(
			readFileSync(
				new URL('../../../migrations/0028_paper_sitting_content_fingerprint.sql', import.meta.url),
				'utf8'
			)
		);
		db.prepare('INSERT INTO source_documents (id) VALUES (?)').run(sourceDocumentId);
		const record = derive();
		const statement = paperSittingReviewWriteStatement(record);
		db.prepare(statement.sql).run(...statement.params);

		expect(db.prepare('SELECT status FROM question_paper_sitting_reviews').get()).toMatchObject({
			status: 'approved'
		});
		db.close();
	});

	it('dry-runs without executing D1 and writes once when explicitly requested', async () => {
		const record = derive();
		const execute = vi.fn().mockResolvedValue(undefined);
		expect(await publishPaperSittingReview({ record, write: false, execute })).toEqual({
			action: 'would_insert',
			written: false
		});
		expect(execute).not.toHaveBeenCalled();

		expect(await publishPaperSittingReview({ record, write: true, execute })).toEqual({
			action: 'insert',
			written: true
		});
		expect(execute).toHaveBeenCalledOnce();
		expect(execute.mock.calls[0][0]).toContain('INSERT INTO question_paper_sitting_reviews');
	});

	it('is a no-op for the same review and requires --replace for different content', async () => {
		const record = derive();
		const execute = vi.fn().mockResolvedValue(undefined);
		expect(
			await publishPaperSittingReview({ record, existing: { ...record }, write: true, execute })
		).toEqual({ action: 'noop', written: false });
		expect(execute).not.toHaveBeenCalled();

		const existing = { ...record, duration_minutes: 90 };
		await expect(
			publishPaperSittingReview({ record, existing, write: true, execute })
		).rejects.toThrow(/--replace/);
		expect(
			await publishPaperSittingReview({
				record,
				existing,
				write: true,
				replace: true,
				execute
			})
		).toEqual({ action: 'replace', written: true });
		expect(execute.mock.calls.at(-1)?.[0]).toContain('ON CONFLICT(source_document_id)');

		await expect(
			publishPaperSittingReview({
				record,
				existing: {
					...record,
					approved_content_fingerprint: `paper-sitting-content-v1:${'b'.repeat(64)}`
				},
				write: true,
				execute
			})
		).rejects.toThrow(/--replace/);
	});

	it('allows batch recovery to replace only the exact withdrawn pre-fingerprint review', () => {
		const record = derive();
		const predecessor = {
			...record,
			status: 'withdrawn',
			approved_content_fingerprint: null,
			reviewed_by: 'earlier-reviewer',
			reviewed_at: '2025-06-03T10:00:00.000Z'
		};
		expect(isExactWithdrawnPaperSittingPredecessor(predecessor, record)).toBe(true);
		expect(
			isExactWithdrawnPaperSittingPredecessor(
				{ ...predecessor, expected_total_marks: record.expected_total_marks - 1 },
				record
			)
		).toBe(false);
		expect(
			isExactWithdrawnPaperSittingPredecessor({ ...predecessor, status: 'approved' }, record)
		).toBe(false);
		expect(
			isExactWithdrawnPaperSittingPredecessor(
				{ ...predecessor, approved_content_fingerprint: approvedContentFingerprint },
				record
			)
		).toBe(false);
	});
});
