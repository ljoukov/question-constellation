#!/usr/bin/env node

// A fail-closed approval path for completed current-model imports whose transient
// work directories were removed. It never infers or regenerates model evidence:
// every phase is verified against its immutable Codex rollout before D1 writes.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { d1Batch, d1Rows } from './lib/d1-rest.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';
import { fingerprintPaperSittingContent } from '../src/lib/server/paperSittingContentFingerprint.js';
import {
	RECOVERED_PHASE_NAMES,
	extractSolvabilityReportPatch,
	sha256Bytes,
	validateLivePaperState,
	validateRecoveredPaperEvidence,
	validateRecoveredSolvabilityReport,
	verifyRecoveredPaperRollouts
} from './lib/recovered-paper-sitting-review.mjs';
import {
	assertMatchingPostImportContentFingerprint,
	isExactWithdrawnPaperSittingPredecessor,
	paperSittingReviewWriteStatement,
	validatePastPaperCatalogLink
} from './lib/paper-sitting-review.mjs';

const rootDir = process.cwd();
const recoveredEvidencePath = requiredPath('recovered-evidence');
const planPath = requiredPath('plan');
const cohortManifestPath = requiredPath('cohort-manifest');
const approvalManifestPath = path.resolve(
	rootDir,
	stringArg(
		'approval-manifest',
		'docs/release-evidence/recovered-paper-sitting-approval-manifest.json'
	)
);
const sessionsRoot = requiredPath('sessions-root');
const catalogPath = path.resolve(
	rootDir,
	stringArg('catalog', 'src/lib/pastPapers/gcsePastPaperData.json')
);
const outputPath = path.resolve(
	rootDir,
	stringArg('output', 'docs/release-evidence/recovered-paper-sitting-approvals.json')
);
const write = hasArg('write');
const reviewedBy = requiredStringArg('reviewed-by');

for (const [label, filePath] of [
	['approval manifest', approvalManifestPath],
	['past-paper catalog', catalogPath]
]) {
	if (!existsSync(filePath)) throw new Error(`Missing ${label}: ${relative(filePath)}.`);
}

const recoveredEvidence = readJson(recoveredEvidencePath);
const plan = readJson(planPath);
const cohortManifest = readJson(cohortManifestPath);
const approvalManifest = readJson(approvalManifestPath);
const catalog = readJson(catalogPath);
validateInputs();
const reviewColumns = await d1Rows('PRAGMA table_info(question_paper_sitting_reviews)');
invariant(
	reviewColumns.some((row) => row.name === 'approved_content_fingerprint'),
	'Paper-sitting content fingerprint schema is unavailable. Apply migrations 0022 and 0028 first.'
);

const recoveredById = new Map(
	(recoveredEvidence.papers ?? []).map((paper) => [paper.sourceDocumentId, paper])
);
const planRows = plan.planned ?? [];
const manifestRows = cohortManifest.rows ?? [];
const catalogEntries = (catalog.pages ?? []).flatMap((page) => page.entries ?? []);

const preflightPapers = [];
for (const policy of approvalManifest.papers) {
	const recoveredPaper = recoveredById.get(policy.sourceDocumentId);
	validateRecoveredPaperEvidence({ recoveredPaper, policy });
	const planIndex = planRows.findIndex((row) => row.sourceDocumentId === policy.sourceDocumentId);
	invariant(planIndex >= 0, `${policy.sourceDocumentId} is not in the exact cohort plan.`);
	const manifestRow = manifestRows[planIndex];
	invariant(manifestRow, `${policy.sourceDocumentId} has no aligned cohort manifest row.`);
	invariant(
		normalizeComponent(manifestRow.component) === normalizeComponent(policy.componentCode),
		`${policy.sourceDocumentId} approval component does not match the cohort manifest.`
	);
	validateOfficialDuration(policy);

	const rollouts = verifyRecoveredPaperRollouts({ recoveredPaper, sessionsRoot });
	const recoveredReport = extractSolvabilityReportPatch(rollouts.solvability.records);
	const live = await loadLivePaper(policy.sourceDocumentId);
	const paperState = validateLivePaperState({
		sourceDocumentId: policy.sourceDocumentId,
		questionRows: live.questionRows,
		expectedQuestionCount: policy.expectedQuestionCount,
		expectedMarkTotal: policy.expectedMarkTotal
	});
	validateRecoveredSolvabilityReport({
		report: recoveredReport.report,
		sourceDocumentId: policy.sourceDocumentId,
		expectedRefs: paperState.refs
	});
	const sourceIdentity = validateSourceIdentity({ policy, manifestRow, live });
	const catalogEntry = validateCatalog({ policy, live });
	invariant(
		live.existingReviews.length <= 1,
		`${policy.sourceDocumentId} has duplicate sitting reviews.`
	);
	const existingReview = live.existingReviews[0] ?? null;
	if (existingReview) {
		invariant(
			existingReview.status === 'withdrawn',
			`${policy.sourceDocumentId} already has a non-withdrawn sitting review; refusing an implicit replacement.`
		);
	}
	const approvedContentFingerprint = await fingerprintPaperSittingContent({
		sourceDocumentId: policy.sourceDocumentId,
		query: (sql, params) => d1Rows(sql, params)
	});
	assertMatchingPostImportContentFingerprint(
		recoveredPaper.import?.postImportContentFingerprintEvidence,
		approvedContentFingerprint,
		policy.sourceDocumentId
	);

	const reviewedAt = new Date().toISOString();
	const record = {
		source_document_id: policy.sourceDocumentId,
		past_paper_entry_id: policy.pastPaperEntryId,
		scope: 'complete_official_paper',
		overlay_version: paperState.overlayVersion,
		expected_question_count: paperState.questionCount,
		expected_total_marks: paperState.markTotal,
		duration_minutes: policy.durationMinutes,
		question_refs_json: JSON.stringify(paperState.refs),
		solvability_report_json: recoveredReport.bytes.toString('utf8'),
		approved_content_fingerprint: approvedContentFingerprint,
		status: 'approved',
		reviewed_by: reviewedBy,
		reviewed_at: reviewedAt
	};
	if (existingReview) {
		invariant(
			isExactWithdrawnPaperSittingPredecessor(existingReview, record),
			`${policy.sourceDocumentId} withdrawn review is not the exact pre-fingerprint predecessor.`
		);
	}
	preflightPapers.push({
		policy,
		recoveredPaper,
		rollouts,
		recoveredReport,
		live,
		paperState,
		sourceIdentity,
		catalogEntry,
		existingReview,
		record
	});
}

const statements = preflightPapers.map(({ record, existingReview }) =>
	paperSittingReviewWriteStatement(record, { replace: Boolean(existingReview) })
);
if (write) await d1Batch(statements);

const reviewRows = write
	? await d1Rows(
			`SELECT source_document_id, past_paper_entry_id, scope, overlay_version,
		            expected_question_count, expected_total_marks, duration_minutes,
		            question_refs_json, solvability_report_json, approved_content_fingerprint,
		            status, reviewed_by, reviewed_at
		       FROM question_paper_sitting_reviews
		      WHERE source_document_id IN (${preflightPapers.map(() => '?').join(', ')})`,
			preflightPapers.map(({ policy }) => policy.sourceDocumentId)
		)
	: [];
const reviewsById = new Map(reviewRows.map((row) => [row.source_document_id, row]));
if (write) {
	for (const { record } of preflightPapers)
		validateWrittenReview(record, reviewsById.get(record.source_document_id));
}

const reportRoot = path.join(path.dirname(outputPath), 'recovered-solvability-reports');
mkdirSync(reportRoot, { recursive: true });
const generatedAt = new Date().toISOString();
const papers = preflightPapers.map((paper) => {
	const reportPath = path.join(reportRoot, `${paper.policy.sourceDocumentId}.json`);
	writeFileSync(reportPath, paper.recoveredReport.bytes);
	const phaseEvidence = Object.fromEntries(
		RECOVERED_PHASE_NAMES.map((phaseName) => {
			const rollout = paper.rollouts[phaseName];
			return [
				phaseName,
				{
					status: rollout.status,
					rolloutPath: path.relative(sessionsRoot, rollout.path).split(path.sep).join('/'),
					sha256: rollout.sha256,
					bytes: rollout.bytes,
					sessionId: rollout.sessionId,
					turnId: rollout.turnId,
					model: rollout.model,
					thinkingLevel: rollout.thinkingLevel,
					startedAt: rollout.startedAt,
					finishedAt: rollout.finishedAt
				}
			];
		})
	);
	return {
		sourceDocumentId: paper.policy.sourceDocumentId,
		status: write ? 'approved' : 'would_approve',
		completePaperIdentity: {
			componentCode: paper.policy.componentCode,
			board: paper.live.questionDocument.board,
			qualification: paper.live.questionDocument.qualification,
			tier: paper.live.questionDocument.tier,
			series: paper.live.questionDocument.series,
			durationMinutes: paper.policy.durationMinutes,
			pastPaperEntryId: paper.policy.pastPaperEntryId,
			catalogSubject: paper.catalogEntry.subject,
			catalogPaper: paper.catalogEntry.paper
		},
		sourceIdentity: paper.sourceIdentity,
		archivedCurrentModelPhases: phaseEvidence,
		recoveredSolvabilityReport: {
			path: relative(reportPath),
			sha256: paper.recoveredReport.sha256,
			bytes: paper.recoveredReport.bytes.length,
			patchToolCallId: paper.recoveredReport.toolCallId,
			questionCount: paper.recoveredReport.report.questionCount,
			passed: paper.recoveredReport.report.passed,
			failed: paper.recoveredReport.report.failed,
			minScore: paper.recoveredReport.report.minScore
		},
		liveD1: liveEvidence(paper),
		review: {
			action: write
				? paper.existingReview
					? 'replaced_withdrawn_and_verified'
					: 'inserted_and_verified'
				: paper.existingReview
					? 'would_replace_withdrawn'
					: 'would_insert',
			status: paper.record.status,
			scope: paper.record.scope,
			overlayVersion: paper.record.overlay_version,
			questionCount: paper.record.expected_question_count,
			markTotal: paper.record.expected_total_marks,
			durationMinutes: paper.record.duration_minutes,
			reviewedBy: paper.record.reviewed_by,
			reviewedAt: paper.record.reviewed_at,
			approvedContentFingerprint: paper.record.approved_content_fingerprint,
			solvabilityReportSha256: sha256Bytes(
				Buffer.from(paper.record.solvability_report_json, 'utf8')
			)
		}
	};
});

const output = {
	schemaVersion: 'recovered-paper-sitting-approval-evidence-v1',
	status: 'passed',
	mode: write ? 'write' : 'dry-run',
	generatedAt,
	cohortId: approvalManifest.cohortId,
	basis:
		'Approvals recovered without rerunning models: exact immutable current-model rollouts, byte-stable report reconstruction, official PDF/catalog identity, and live D1 state all passed fail-closed gates.',
	inputs: {
		recoveredEvidence: artifact(recoveredEvidencePath),
		plan: artifact(planPath),
		cohortManifest: artifact(cohortManifestPath),
		approvalManifest: artifact(approvalManifestPath),
		pastPaperCatalog: artifact(catalogPath),
		sessionsRoot: path.resolve(sessionsRoot),
		expectedModel: approvalManifest.model,
		expectedThinkingLevel: approvalManifest.thinkingLevel
	},
	counts: {
		papers: papers.length,
		approved: write ? papers.length : 0,
		wouldApprove: write ? 0 : papers.length,
		questions: papers.reduce((total, paper) => total + paper.review.questionCount, 0),
		marks: papers.reduce((total, paper) => total + paper.review.markTotal, 0),
		rollouts: papers.length * RECOVERED_PHASE_NAMES.length
	},
	papers
};
writeJson(outputPath, output);
console.log(
	JSON.stringify(
		{
			status: output.status,
			mode: output.mode,
			output: relative(outputPath),
			sha256: sha256File(outputPath),
			counts: output.counts
		},
		null,
		2
	)
);

function validateInputs() {
	invariant(
		recoveredEvidence.schemaVersion === 'selective-paper-recovered-rollout-evidence-v1',
		'Unsupported recovered evidence schema.'
	);
	invariant(
		approvalManifest.schemaVersion === 'recovered-paper-sitting-approval-manifest-v1',
		'Unsupported recovered approval manifest schema.'
	);
	invariant(
		approvalManifest.model === 'gpt-5.6-sol',
		'Recovery requires exact gpt-5.6-sol evidence.'
	);
	invariant(
		approvalManifest.thinkingLevel === 'max',
		'Recovery requires exact max-thinking evidence.'
	);
	invariant(
		Array.isArray(approvalManifest.papers) && approvalManifest.papers.length > 0,
		'No recovery papers configured.'
	);
	const ids = approvalManifest.papers.map((paper) => paper.sourceDocumentId);
	invariant(
		new Set(ids).size === ids.length,
		'Recovered approval manifest has duplicate source ids.'
	);
	invariant(
		(plan.planned ?? []).length === 20,
		'Recovery must use the exact 20-paper cohort plan.'
	);
	invariant(
		(cohortManifest.rows ?? []).length === 20,
		'Recovery must use the exact 20-paper cohort manifest.'
	);
}

function validateOfficialDuration(policy) {
	const component = normalizeComponent(policy.componentCode);
	const combined = /^8464[BCP][12]H$/.test(component);
	const separate = /^846[123][12]H$/.test(component);
	invariant(
		combined || separate,
		`${policy.sourceDocumentId} is not an approved complete science-paper component.`
	);
	const expected = combined ? 75 : 105;
	invariant(
		Number(policy.durationMinutes) === expected,
		`${policy.sourceDocumentId} duration must be ${expected} minutes for ${component}.`
	);
}

async function loadLivePaper(sourceDocumentId) {
	const [questionRows, questionDocuments, markingDocuments, existingReviews] = await Promise.all([
		d1Rows(
			`SELECT q.id, q.source_question_ref, q.display_order, q.marks, q.status,
		            q.needs_human_review, q.component_code, q.updated_at,
		            qro.id AS overlay_id, qro.overlay_version,
		            qro.needs_human_review AS overlay_needs_human_review,
		            qro.updated_at AS overlay_updated_at, qro.render_json,
		            (SELECT COUNT(*) FROM mark_scheme_items msi WHERE msi.question_id = q.id) AS mark_scheme_count,
		            (SELECT COALESCE(SUM(CASE WHEN msi.marks > 0 THEN msi.marks ELSE 0 END), 0)
		               FROM mark_scheme_items msi WHERE msi.question_id = q.id) AS mark_scheme_mark_total,
		            (SELECT COUNT(*) FROM mark_checklist_items mci WHERE mci.question_id = q.id) AS checklist_count,
		            (SELECT COUNT(*) FROM mark_checklist_items mci
		              WHERE mci.question_id = q.id AND mci.required != 0) AS required_checklist_count,
		            (SELECT COUNT(*) FROM mark_checklist_items mci WHERE mci.question_id = q.id AND mci.needs_human_review != 0) AS checklist_review_issues,
		            (SELECT COUNT(*) FROM model_answers ma WHERE ma.question_id = q.id AND ma.needs_human_review = 0 AND ma.confidence IS NOT NULL) AS model_answer_count,
		            (SELECT COUNT(*) FROM model_answers ma WHERE ma.question_id = q.id AND (ma.needs_human_review != 0 OR ma.confidence IS NULL)) AS model_answer_review_issues,
		            (SELECT COUNT(*) FROM question_assets qa WHERE qa.question_id = q.id AND qa.needs_human_review != 0) AS asset_review_issues,
		            (SELECT COUNT(*) FROM question_assets qa WHERE qa.question_id = q.id AND (NULLIF(TRIM(qa.r2_key), '') IS NULL OR NULLIF(TRIM(qa.public_path), '') IS NULL)) AS missing_asset_delivery,
		            (SELECT COUNT(*)
		               FROM question_answer_chains qac
		               JOIN answer_chains ac ON ac.id = qac.answer_chain_id
		              WHERE qac.question_id = q.id AND qac.is_primary = 1
		                AND qac.needs_human_review = 0 AND ac.needs_human_review = 0
		                AND ac.status = 'published'
		                AND EXISTS (SELECT 1 FROM answer_chain_steps acs WHERE acs.answer_chain_id = ac.id)) AS primary_chain_count
		       FROM questions q
		       LEFT JOIN question_rendering_overlays qro ON qro.id = (
		         SELECT candidate.id FROM question_rendering_overlays candidate
		          WHERE candidate.question_id = q.id AND candidate.needs_human_review = 0
		          ORDER BY candidate.updated_at DESC, candidate.overlay_version DESC LIMIT 1
		       )
		      WHERE q.source_document_id = ?
		      ORDER BY q.display_order, q.source_question_ref`,
			[sourceDocumentId]
		),
		d1Rows('SELECT * FROM source_documents WHERE id = ?', [sourceDocumentId]),
		d1Rows(
			`SELECT DISTINCT sd.*
		       FROM questions q
		       JOIN mark_scheme_items msi ON msi.question_id = q.id
		       JOIN source_documents sd ON sd.id = msi.source_document_id
		      WHERE q.source_document_id = ?`,
			[sourceDocumentId]
		),
		d1Rows('SELECT * FROM question_paper_sitting_reviews WHERE source_document_id = ?', [
			sourceDocumentId
		])
	]);
	invariant(
		questionDocuments.length === 1,
		`${sourceDocumentId} must have exactly one question source document.`
	);
	invariant(
		markingDocuments.length === 1,
		`${sourceDocumentId} must have exactly one marking source document.`
	);
	return {
		questionRows,
		questionDocument: questionDocuments[0],
		markingDocument: markingDocuments[0],
		existingReviews
	};
}

function validateSourceIdentity({ policy, manifestRow, live }) {
	const questionDocument = live.questionDocument;
	const markingDocument = live.markingDocument;
	for (const [label, document, expectedType] of [
		['question paper', questionDocument, 'question_paper'],
		['mark scheme', markingDocument, 'mark_scheme']
	]) {
		invariant(
			document.doc_type === expectedType,
			`${policy.sourceDocumentId} ${label} has the wrong type.`
		);
		invariant(document.board === 'AQA', `${policy.sourceDocumentId} ${label} is not AQA.`);
		invariant(
			document.qualification === 'GCSE',
			`${policy.sourceDocumentId} ${label} is not GCSE.`
		);
		invariant(
			document.tier === 'Higher',
			`${policy.sourceDocumentId} ${label} is not Higher tier.`
		);
		invariant(
			normalizeComponent(document.component_code) === normalizeComponent(policy.componentCode),
			`${policy.sourceDocumentId} ${label} component mismatch.`
		);
		invariant(
			document.series === 'June 2024',
			`${policy.sourceDocumentId} ${label} series mismatch.`
		);
	}
	const questionPdf = verifyLocalPdf(
		manifestRow.question_paper,
		questionDocument,
		'question paper'
	);
	const markSchemePdf = verifyLocalPdf(manifestRow.mark_scheme, markingDocument, 'mark scheme');
	invariant(
		live.questionRows.every(
			(row) => normalizeComponent(row.component_code) === normalizeComponent(policy.componentCode)
		),
		`${policy.sourceDocumentId} live question component mismatch.`
	);
	return {
		questionDocumentId: questionDocument.id,
		questionDocumentUrl: questionDocument.source_url,
		questionDocumentSha256: questionPdf.sha256,
		questionDocumentPath: questionPdf.path,
		markingDocumentId: markingDocument.id,
		markingDocumentUrl: markingDocument.source_url,
		markingDocumentSha256: markSchemePdf.sha256,
		markingDocumentPath: markSchemePdf.path
	};
}

function verifyLocalPdf(manifestDocument, liveDocument, label) {
	const localPath = path.resolve(rootDir, String(manifestDocument?.local_path ?? ''));
	invariant(existsSync(localPath), `Cohort ${label} PDF is missing: ${relative(localPath)}.`);
	invariant(
		path.extname(localPath).toLowerCase() === '.pdf',
		`Cohort ${label} source is not a PDF.`
	);
	const sha256 = sha256File(localPath);
	const liveHash = String(liveDocument.file_hash ?? '')
		.toLowerCase()
		.replace(/^sha256:/, '');
	invariant(sha256 === liveHash, `Live D1 ${label} SHA-256 does not match the cohort PDF.`);
	invariant(
		liveDocument.source_url === manifestDocument.url,
		`Live D1 ${label} URL does not match the cohort manifest.`
	);
	return { path: relative(localPath), sha256 };
}

function validateCatalog({ policy, live }) {
	const syntheticArtifact = {
		sourceDocument: {
			sourceUrl: live.questionDocument.source_url,
			fileHash: live.questionDocument.file_hash
		},
		markSchemeDocument: {
			sourceUrl: live.markingDocument.source_url,
			fileHash: live.markingDocument.file_hash
		}
	};
	const entry = validatePastPaperCatalogLink({
		catalog,
		pastPaperEntryId: policy.pastPaperEntryId,
		importReadyPaper: syntheticArtifact
	});
	invariant(entry.boardId === 'aqa', `${policy.sourceDocumentId} catalog entry is not AQA.`);
	invariant(Number(entry.year) === 2024, `${policy.sourceDocumentId} catalog year mismatch.`);
	invariant(entry.series === 'June', `${policy.sourceDocumentId} catalog series mismatch.`);
	invariant(entry.tier === 'Higher', `${policy.sourceDocumentId} catalog tier mismatch.`);
	invariant(
		catalogEntries.filter((candidate) => candidate.id === entry.id).length === 1,
		`${entry.id} is not unique.`
	);
	return entry;
}

function liveEvidence(paper) {
	const rows = paper.live.questionRows;
	return {
		status: 'passed',
		questionCount: paper.paperState.questionCount,
		markTotal: paper.paperState.markTotal,
		refsSha256: paper.paperState.refsSha256,
		overlayVersion: paper.paperState.overlayVersion,
		markSchemeRows: sum(rows, 'mark_scheme_count'),
		markChecklistRows: sum(rows, 'checklist_count'),
		reviewedModelAnswers: sum(rows, 'model_answer_count'),
		cleanPrimaryChains: sum(rows, 'primary_chain_count'),
		assetReviewIssues: sum(rows, 'asset_review_issues'),
		missingAssetDelivery: sum(rows, 'missing_asset_delivery'),
		gradingReviewIssues:
			sum(rows, 'checklist_review_issues') + sum(rows, 'model_answer_review_issues')
	};
}

function validateWrittenReview(expected, actual) {
	invariant(actual, `${expected.source_document_id} approval row was not written.`);
	for (const [column, value] of Object.entries(expected)) {
		invariant(
			actual[column] === value,
			`${expected.source_document_id} written ${column} mismatch.`
		);
	}
}

function sum(rows, field) {
	return rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
}

function normalizeComponent(value) {
	return String(value ?? '')
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '');
}

function artifact(filePath) {
	return { path: relative(filePath), sha256: sha256File(filePath) };
}

function sha256File(filePath) {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function invariant(condition, message) {
	if (!condition) throw new Error(message);
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, fallback = '') {
	const prefix = `--${name}=`;
	const argument = process.argv.find((candidate) => candidate.startsWith(prefix));
	return argument ? argument.slice(prefix.length) : fallback;
}

function requiredStringArg(name) {
	const value = stringArg(name).trim();
	if (!value) throw new Error(`--${name}=<value> is required.`);
	return value;
}

function requiredPath(name) {
	const filePath = path.resolve(rootDir, requiredStringArg(name));
	if (!existsSync(filePath)) throw new Error(`--${name} does not exist: ${relative(filePath)}.`);
	return filePath;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}
