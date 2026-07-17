import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ExamPaper } from '$lib/experiments/questions/types';
import {
	evaluatePaperSittingReadiness,
	type PaperSittingQuestionAuditRow,
	type PaperSittingReviewRow
} from './paperSittingReadiness';
import type { ExperimentPaperGradeability } from './questionExperimentGrading';

const sourceDocumentId = 'aqa-test-qp-jun25';
const contentFingerprint = `paper-sitting-content-v1:${'a'.repeat(64)}`;

function paperFixture(): ExamPaper {
	return {
		id: 'aqa-test-jun25',
		title: 'AQA GCSE Test: Paper 1',
		subtitle: 'June 2025',
		source: 'Fixture',
		assets: {},
		questions: [
			{
				ref: '01',
				blocks: [],
				parts: [
					{
						questionId: 'q-1',
						ref: '01.1',
						marks: 2,
						blocks: [],
						response: { kind: 'lines', count: 2 }
					}
				]
			},
			{
				ref: '02',
				blocks: [],
				parts: [
					{
						questionId: 'q-2',
						ref: '02.1',
						marks: 3,
						blocks: [],
						response: { kind: 'choice', options: ['A', 'B'] }
					}
				]
			}
		]
	};
}

function questionsFixture(): PaperSittingQuestionAuditRow[] {
	return [
		{
			id: 'q-1',
			source_question_ref: '01.1',
			marks: 2,
			status: 'published',
			question_needs_human_review: 0,
			question_updated_at: '2025-06-01 10:00:00',
			overlay_id: 'overlay-1',
			overlay_version: 'v1',
			overlay_updated_at: '2025-06-02 10:00:00',
			required_asset_review_issues: 0
		},
		{
			id: 'q-2',
			source_question_ref: '02.1',
			marks: 3,
			status: 'published',
			question_needs_human_review: 0,
			question_updated_at: '2025-06-01 10:00:00',
			overlay_id: 'overlay-2',
			overlay_version: 'v1',
			overlay_updated_at: '2025-06-02 10:00:00',
			required_asset_review_issues: 0
		}
	];
}

function solvabilityReport(refs = ['01.1', '02.1']) {
	return {
		status: 'passed',
		sourceDocumentId,
		minScore: 0.8,
		questionCount: refs.length,
		passed: refs.length,
		failed: 0,
		results: refs.map((sourceQuestionRef) => ({
			sourceQuestionRef,
			status: 'passed',
			score: 0.92,
			studentVisibleSolvable: true,
			markSchemeFits: true,
			missingContext: [],
			renderFindings: [],
			requiredRepairs: [] as string[]
		}))
	};
}

function reviewFixture(): PaperSittingReviewRow {
	return {
		source_document_id: sourceDocumentId,
		past_paper_entry_id: 'aqa-test-2025-june-paper-1',
		scope: 'complete_official_paper',
		overlay_version: 'v1',
		expected_question_count: 2,
		expected_total_marks: 5,
		duration_minutes: 60,
		question_refs_json: JSON.stringify(['01.1', '02.1']),
		solvability_report_json: JSON.stringify(solvabilityReport()),
		approved_content_fingerprint: contentFingerprint,
		status: 'approved',
		reviewed_at: '2025-06-03T10:00:00.000Z'
	};
}

function gradeabilityFixture(): ExperimentPaperGradeability {
	return {
		refs: ['01.1', '02.1'],
		maxMarks: 5,
		gradeableMarks: 5,
		fullyGradeable: true
	};
}

function evaluate({
	review = reviewFixture(),
	questions = questionsFixture(),
	paper = paperFixture(),
	gradeability = gradeabilityFixture(),
	approvedContentFingerprint = contentFingerprint
}: {
	review?: PaperSittingReviewRow | null;
	questions?: PaperSittingQuestionAuditRow[];
	paper?: ExamPaper;
	gradeability?: ExperimentPaperGradeability;
	approvedContentFingerprint?: string;
} = {}) {
	return evaluatePaperSittingReadiness({
		sourceDocumentId,
		review,
		questions,
		paper,
		gradeability,
		contentFingerprint: approvedContentFingerprint
	});
}

describe('full-paper sitting readiness', () => {
	it('approves an exact, reviewed, solvable and fully gradeable paper inventory', () => {
		expect(evaluate()).toEqual({
			available: true,
			reason: null,
			inventoryQuestionCount: 2,
			renderedQuestionCount: 2,
			eligiblePartCount: 2,
			totalMarks: 5,
			durationMinutes: 60,
			reviewedAt: '2025-06-03T10:00:00.000Z',
			approvedContentFingerprint: contentFingerprint
		});
	});

	it('fails closed when any exact live content fingerprint differs from approval', () => {
		expect(
			evaluate({
				approvedContentFingerprint: `paper-sitting-content-v1:${'b'.repeat(64)}`
			}).reason
		).toBe('content_changed_since_review');
	});

	it('does not infer full-paper readiness when the explicit review is absent', () => {
		expect(evaluate({ review: null }).reason).toBe('review_missing');
	});

	it('does not let a one-question overlay masquerade as a complete two-question paper', () => {
		const questions = questionsFixture();
		questions[1] = { ...questions[1], overlay_id: null, overlay_version: null };
		const paper = paperFixture();
		paper.questions = paper.questions.slice(0, 1);
		const review = {
			...reviewFixture(),
			expected_question_count: 1,
			expected_total_marks: 2,
			question_refs_json: JSON.stringify(['01.1']),
			solvability_report_json: JSON.stringify(solvabilityReport(['01.1']))
		};

		expect(evaluate({ questions, paper, review }).reason).toBe('inventory_mismatch');
	});

	it('requires a passing learner-visible solvability result for every inventory ref', () => {
		const report = solvabilityReport();
		report.results[1] = {
			...report.results[1],
			status: 'failed',
			studentVisibleSolvable: false,
			requiredRepairs: ['Restore the missing source figure.']
		};
		const review = { ...reviewFixture(), solvability_report_json: JSON.stringify(report) };

		expect(evaluate({ review }).reason).toBe('solvability_failed');
	});

	it('fails closed when a stored solvability result omits its finding arrays', () => {
		const report = structuredClone(solvabilityReport()) as unknown as {
			results: Array<{ missingContext?: string[] }>;
		};
		delete report.results[0].missingContext;
		const review = { ...reviewFixture(), solvability_report_json: JSON.stringify(report) };

		expect(evaluate({ review }).reason).toBe('solvability_failed');
	});

	it('withdraws readiness when the rendering changes after review', () => {
		const questions = questionsFixture();
		questions[0] = { ...questions[0], overlay_updated_at: '2025-06-04 10:00:00' };
		expect(evaluate({ questions }).reason).toBe('review_stale');
	});

	it('requires every required asset to remain reviewed and delivered', () => {
		const questions = questionsFixture();
		questions[0] = { ...questions[0], required_asset_review_issues: 1 };
		expect(evaluate({ questions }).reason).toBe('required_asset_not_reviewed');

		const source = readFileSync(new URL('./paperSittingReadiness.ts', import.meta.url), 'utf8');
		expect(source).toContain("NULLIF(TRIM(qa.r2_key), '') IS NULL");
		expect(source).toContain("NULLIF(TRIM(qa.public_path), '') IS NULL");
	});

	it('requires grading coverage for all marks before advertising the sitting', () => {
		expect(
			evaluate({
				gradeability: {
					...gradeabilityFixture(),
					gradeableMarks: 2,
					fullyGradeable: false
				}
			}).reason
		).toBe('grading_incomplete');
	});
});
