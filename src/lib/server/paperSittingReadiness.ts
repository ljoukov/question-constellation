import {
	answerablePaperParts,
	unsafePaperGradingPartRefs
} from '$lib/experiments/questions/paperSitting';
import type { ExamPaper } from '$lib/experiments/questions/types';
import { queryFirst, queryRows, type SqlParam } from './db';
import {
	getQuestionExperimentPaper,
	sourceDocumentIdForSlug,
	sourceDocumentSlug
} from './questionExperimentData';
import {
	getExperimentPaperGradeability,
	type ExperimentPaperGradeability
} from './questionExperimentGrading';
import { fingerprintPaperSittingContent } from './paperSittingContentFingerprint.js';

export type PaperSittingUnavailableReason =
	| 'review_missing'
	| 'review_not_approved'
	| 'not_complete_official_paper'
	| 'inventory_mismatch'
	| 'question_not_reviewed'
	| 'overlay_missing'
	| 'overlay_version_mismatch'
	| 'review_stale'
	| 'content_changed_since_review'
	| 'required_asset_not_reviewed'
	| 'solvability_failed'
	| 'renderer_incomplete'
	| 'unsupported_response'
	| 'marks_mismatch'
	| 'grading_incomplete';

export type PaperSittingAvailability = {
	available: boolean;
	reason: PaperSittingUnavailableReason | null;
	inventoryQuestionCount: number;
	renderedQuestionCount: number;
	eligiblePartCount: number;
	totalMarks: number;
	durationMinutes: number | null;
	reviewedAt: string | null;
	approvedContentFingerprint: string | null;
};

export type PaperSittingReviewRow = {
	source_document_id: string;
	past_paper_entry_id: string | null;
	scope: string;
	overlay_version: string;
	expected_question_count: number;
	expected_total_marks: number;
	duration_minutes: number;
	question_refs_json: string;
	solvability_report_json: string;
	approved_content_fingerprint: string | null;
	status: string;
	reviewed_at: string;
};

export type PaperSittingQuestionAuditRow = {
	id: string;
	source_question_ref: string;
	marks: number | null;
	status: string;
	question_needs_human_review: number;
	question_updated_at: string;
	overlay_id: string | null;
	overlay_version: string | null;
	overlay_updated_at: string | null;
	required_asset_review_issues: number;
};

type SolvabilityFinding = {
	severity?: unknown;
};

type SolvabilityResult = {
	sourceQuestionRef?: unknown;
	status?: unknown;
	score?: unknown;
	studentVisibleSolvable?: unknown;
	markSchemeFits?: unknown;
	missingContext?: unknown;
	renderFindings?: unknown;
	requiredRepairs?: unknown;
};

type SolvabilityReport = {
	status?: unknown;
	sourceDocumentId?: unknown;
	minScore?: unknown;
	questionCount?: unknown;
	passed?: unknown;
	failed?: unknown;
	results?: unknown;
};

function unavailable(
	reason: PaperSittingUnavailableReason,
	{
		inventoryQuestionCount = 0,
		renderedQuestionCount = 0,
		eligiblePartCount = 0,
		totalMarks = 0,
		durationMinutes = null,
		reviewedAt = null,
		approvedContentFingerprint = null
	}: Partial<Omit<PaperSittingAvailability, 'available' | 'reason'>> = {}
): PaperSittingAvailability {
	return {
		available: false,
		reason,
		inventoryQuestionCount,
		renderedQuestionCount,
		eligiblePartCount,
		totalMarks,
		durationMinutes,
		reviewedAt,
		approvedContentFingerprint
	};
}

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return null;
	}
}

function stringArray(raw: string) {
	const value = parseJson(raw);
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
	return value as string[];
}

function sameRefs(left: string[], right: string[]) {
	if (left.length !== right.length) return false;
	const normalizedLeft = [...new Set(left)].sort((a, b) =>
		a.localeCompare(b, undefined, { numeric: true })
	);
	const normalizedRight = [...new Set(right)].sort((a, b) =>
		a.localeCompare(b, undefined, { numeric: true })
	);
	return (
		normalizedLeft.length === left.length &&
		normalizedRight.length === right.length &&
		normalizedLeft.every((ref, index) => ref === normalizedRight[index])
	);
}

function blockingFindings(value: unknown) {
	if (!Array.isArray(value)) return [];
	return (value as SolvabilityFinding[]).filter(
		(finding) => String(finding?.severity ?? '').toLowerCase() === 'blocking'
	);
}

function validSolvabilityReport(raw: string, sourceDocumentId: string, expectedRefs: string[]) {
	const report = parseJson(raw) as SolvabilityReport | null;
	if (!report || report.status !== 'passed' || report.sourceDocumentId !== sourceDocumentId) {
		return false;
	}
	const minScore = Number(report.minScore);
	const results = Array.isArray(report.results) ? (report.results as SolvabilityResult[]) : [];
	if (!Number.isFinite(minScore) || minScore < 0.8) return false;
	if (Number(report.questionCount) !== expectedRefs.length) return false;
	if (Number(report.passed) !== expectedRefs.length || Number(report.failed) !== 0) return false;
	const resultRefs = results.map((result) => String(result.sourceQuestionRef ?? ''));
	if (!sameRefs(resultRefs, expectedRefs)) return false;

	return results.every(
		(result) =>
			result.status === 'passed' &&
			Number(result.score) >= minScore &&
			result.studentVisibleSolvable === true &&
			result.markSchemeFits === true &&
			Array.isArray(result.missingContext) &&
			Array.isArray(result.renderFindings) &&
			Array.isArray(result.requiredRepairs) &&
			result.requiredRepairs.length === 0 &&
			blockingFindings(result.missingContext).length === 0 &&
			blockingFindings(result.renderFindings).length === 0
	);
}

function timestamp(value: string | null) {
	if (!value) return Number.NaN;
	const normalized = /(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value.replace(' ', 'T')}Z`;
	return Date.parse(normalized);
}

export function evaluatePaperSittingReadiness({
	sourceDocumentId,
	review,
	questions,
	paper,
	gradeability,
	contentFingerprint
}: {
	sourceDocumentId: string;
	review: PaperSittingReviewRow | null;
	questions: PaperSittingQuestionAuditRow[];
	paper: ExamPaper;
	gradeability: ExperimentPaperGradeability;
	contentFingerprint: string;
}): PaperSittingAvailability {
	const renderedQuestionCount = paper.questions.flatMap((question) => question.parts).length;
	const answerableParts = answerablePaperParts(paper);
	const totalMarks = answerableParts.reduce((sum, { part }) => sum + part.marks, 0);
	const base = {
		inventoryQuestionCount: questions.length,
		renderedQuestionCount,
		eligiblePartCount: answerableParts.length,
		totalMarks,
		durationMinutes: review?.duration_minutes ?? null,
		reviewedAt: review?.reviewed_at ?? null,
		approvedContentFingerprint: review?.approved_content_fingerprint ?? null
	};

	if (!review) return unavailable('review_missing', base);
	if (review.status !== 'approved') return unavailable('review_not_approved', base);
	if (review.scope !== 'complete_official_paper') {
		return unavailable('not_complete_official_paper', base);
	}
	if (
		!review.approved_content_fingerprint ||
		review.approved_content_fingerprint !== contentFingerprint
	) {
		return unavailable('content_changed_since_review', base);
	}

	const questionRefs = questions.map((question) => question.source_question_ref);
	const reviewedRefs = stringArray(review.question_refs_json);
	if (
		questions.length === 0 ||
		review.expected_question_count !== questions.length ||
		!reviewedRefs ||
		!sameRefs(reviewedRefs, questionRefs)
	) {
		return unavailable('inventory_mismatch', base);
	}
	if (
		questions.some(
			(question) => question.status !== 'published' || question.question_needs_human_review !== 0
		)
	) {
		return unavailable('question_not_reviewed', base);
	}
	if (questions.some((question) => !question.overlay_id)) {
		return unavailable('overlay_missing', base);
	}
	if (questions.some((question) => question.overlay_version !== review.overlay_version)) {
		return unavailable('overlay_version_mismatch', base);
	}
	const reviewedAt = timestamp(review.reviewed_at);
	if (
		!Number.isFinite(reviewedAt) ||
		questions.some(
			(question) =>
				timestamp(question.question_updated_at) > reviewedAt ||
				timestamp(question.overlay_updated_at) > reviewedAt
		)
	) {
		return unavailable('review_stale', base);
	}
	if (questions.some((question) => question.required_asset_review_issues > 0)) {
		return unavailable('required_asset_not_reviewed', base);
	}
	if (!validSolvabilityReport(review.solvability_report_json, sourceDocumentId, questionRefs)) {
		return unavailable('solvability_failed', base);
	}

	const renderedRefs = paper.questions.flatMap((question) =>
		question.parts.map((part) => part.ref)
	);
	if (!sameRefs(renderedRefs, questionRefs)) {
		return unavailable('renderer_incomplete', base);
	}
	if (unsafePaperGradingPartRefs(paper).length > 0) {
		return unavailable('unsupported_response', base);
	}
	if (
		review.expected_total_marks !== totalMarks ||
		questions.reduce((sum, question) => sum + (question.marks ?? 0), 0) !== totalMarks
	) {
		return unavailable('marks_mismatch', base);
	}
	if (
		!gradeability.fullyGradeable ||
		!sameRefs(gradeability.refs, questionRefs) ||
		gradeability.maxMarks !== totalMarks ||
		gradeability.gradeableMarks !== totalMarks
	) {
		return unavailable('grading_incomplete', base);
	}

	return {
		available: true,
		reason: null,
		...base,
		durationMinutes: review.duration_minutes,
		reviewedAt: review.reviewed_at,
		approvedContentFingerprint: contentFingerprint
	};
}

function isMissingReviewTableError(error: unknown) {
	return /no such table:\s*question_paper_sitting_reviews/i.test(
		error instanceof Error ? error.message : String(error)
	);
}

async function reviewForSourceDocument(sourceDocumentId: string) {
	try {
		return await queryFirst<PaperSittingReviewRow>(
			`SELECT source_document_id, past_paper_entry_id, scope, overlay_version,
			        expected_question_count, expected_total_marks, duration_minutes,
			        question_refs_json, solvability_report_json, approved_content_fingerprint,
			        status, reviewed_at
			 FROM question_paper_sitting_reviews
			 WHERE source_document_id = ?
			 LIMIT 1`,
			[sourceDocumentId]
		);
	} catch (error) {
		if (isMissingReviewTableError(error)) return null;
		throw error;
	}
}

async function questionAuditRows(sourceDocumentId: string) {
	return queryRows<PaperSittingQuestionAuditRow>(
		`SELECT q.id, q.source_question_ref, q.marks, q.status,
		        q.needs_human_review AS question_needs_human_review,
		        q.updated_at AS question_updated_at,
		        qro.id AS overlay_id, qro.overlay_version, qro.updated_at AS overlay_updated_at,
		        (SELECT COUNT(*)
		           FROM question_assets qa
		          WHERE qa.question_id = q.id
		            AND qa.required = 1
		            AND (
		              qa.needs_human_review != 0
		              OR NULLIF(TRIM(qa.r2_key), '') IS NULL
		              OR NULLIF(TRIM(qa.public_path), '') IS NULL
		            )) AS required_asset_review_issues
		 FROM questions q
		 LEFT JOIN question_rendering_overlays qro
		   ON qro.id = (
		     SELECT candidate.id
		       FROM question_rendering_overlays candidate
		      WHERE candidate.question_id = q.id
		        AND candidate.needs_human_review = 0
		      ORDER BY candidate.updated_at DESC, candidate.overlay_version DESC
		      LIMIT 1
		   )
		 WHERE q.source_document_id = ?
		 ORDER BY q.display_order, q.source_question_ref`,
		[sourceDocumentId]
	);
}

export async function getQuestionExperimentPaperSittingAvailability(
	paper: ExamPaper,
	sourceDocumentIdOverride?: string
) {
	const sourceDocumentId = sourceDocumentIdOverride ?? (await sourceDocumentIdForSlug(paper.id));
	if (!sourceDocumentId) return unavailable('review_missing');
	const [review, questions] = await Promise.all([
		reviewForSourceDocument(sourceDocumentId),
		questionAuditRows(sourceDocumentId)
	]);
	if (!review) {
		return unavailable('review_missing', {
			inventoryQuestionCount: questions.length,
			renderedQuestionCount: paper.questions.flatMap((question) => question.parts).length,
			eligiblePartCount: answerablePaperParts(paper).length,
			totalMarks: answerablePaperParts(paper).reduce((sum, { part }) => sum + part.marks, 0)
		});
	}
	const contentFingerprint = await fingerprintPaperSittingContent({
		sourceDocumentId,
		query: (sql: string, params: SqlParam[]) => queryRows(sql, params)
	});
	const assumedGradeability: ExperimentPaperGradeability = {
		refs: questions.map((question) => question.source_question_ref),
		maxMarks: answerablePaperParts(paper).reduce((sum, { part }) => sum + part.marks, 0),
		gradeableMarks: answerablePaperParts(paper).reduce((sum, { part }) => sum + part.marks, 0),
		fullyGradeable: true
	};
	const structural = evaluatePaperSittingReadiness({
		sourceDocumentId,
		review,
		questions,
		paper,
		gradeability: assumedGradeability,
		contentFingerprint
	});
	if (!structural.available) return structural;

	const gradeability = await getExperimentPaperGradeability(
		paper.id,
		paper.questions.map((question) => question.ref)
	);
	return evaluatePaperSittingReadiness({
		sourceDocumentId,
		review,
		questions,
		paper,
		gradeability,
		contentFingerprint
	});
}

export async function getSittablePaperForPastPaperEntry(pastPaperEntryId: string) {
	let row: { source_document_id: string } | null;
	try {
		row = await queryFirst<{ source_document_id: string }>(
			`SELECT source_document_id
			 FROM question_paper_sitting_reviews
			 WHERE past_paper_entry_id = ?
			   AND status = 'approved'
			 LIMIT 1`,
			[pastPaperEntryId]
		);
	} catch (error) {
		if (isMissingReviewTableError(error)) return null;
		throw error;
	}
	if (!row) return null;

	const paper = await getQuestionExperimentPaper(sourceDocumentSlug(row.source_document_id));
	const availability = await getQuestionExperimentPaperSittingAvailability(
		paper,
		row.source_document_id
	);
	if (!availability.available) return null;
	return { paper, availability };
}
