#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { d1Query, d1Rows } from './lib/d1-rest.mjs';
import { fingerprintPaperSittingContent } from '../src/lib/server/paperSittingContentFingerprint.js';
import {
	derivePaperSittingReview,
	publishPaperSittingReview,
	validatePastPaperCatalogLink
} from './lib/paper-sitting-review.mjs';

const rootDir = process.cwd();
const usage = `Usage:
node scripts/approve-paper-sitting.mjs \\
  --summary=tmp/codex-production-import/<source-id>/codex-production-import-summary.json \\
  --duration-minutes=105 \\
  --reviewed-by=<operator-or-pipeline-review-id> \\
  --past-paper-entry-id=<stable-entry-id-from-gcsePastPaperData.json>

Optional:
  --paper-artifact=<exact-import-ready-paper.json>
  --write       insert the approved review after every check passes (default is dry-run)
  --replace     explicitly replace a different existing review
  --dry-run     verify and print the proposed action without writing (default)

Migrations 0022_question_paper_sitting_reviews.sql and
0028_paper_sitting_content_fingerprint.sql must be applied first. The command refuses
partial imports, dropped questions, non-write pipeline summaries, incomplete or failed Codex
solvability results, stale D1 content, missing reviewed overlays, and marks/inventory mismatches.`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const summaryPath = path.resolve(rootDir, requiredStringArg('summary'));
const durationMinutes = positiveIntegerArg('duration-minutes');
const reviewedBy = requiredStringArg('reviewed-by');
const pastPaperEntryId = requiredStringArg('past-paper-entry-id');
const write = hasArg('write');
const explicitDryRun = hasArg('dry-run');
const replace = hasArg('replace');

if (write && explicitDryRun) throw new Error('Use either --write or --dry-run, not both.');
if (!existsSync(summaryPath)) throw new Error(`Production summary does not exist: ${summaryPath}`);

const productionSummary = readJson(summaryPath);
const sourceDocumentId = String(productionSummary?.plan?.sourceDocumentId ?? '').trim();
if (!sourceDocumentId) throw new Error('Production summary has no plan.sourceDocumentId.');
const artifactPath = path.resolve(
	rootDir,
	stringArg(
		'paper-artifact',
		path.join(String(productionSummary?.plan?.importReadyRoot ?? ''), `${sourceDocumentId}.json`)
	)
);
if (!existsSync(artifactPath)) {
	throw new Error(`Exact import-ready paper artifact does not exist: ${artifactPath}`);
}
const importReadyPaper = readJson(artifactPath);
const pastPaperCatalogPath = path.join(rootDir, 'src/lib/pastPapers/gcsePastPaperData.json');
if (!existsSync(pastPaperCatalogPath)) {
	throw new Error(`Past-paper catalog does not exist: ${relative(pastPaperCatalogPath)}`);
}
validatePastPaperCatalogLink({
	catalog: readJson(pastPaperCatalogPath),
	pastPaperEntryId,
	importReadyPaper
});

const schemaRows = await d1Rows(
	"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'question_paper_sitting_reviews'"
);
if (schemaRows.length !== 1) {
	throw new Error(
		'question_paper_sitting_reviews is unavailable. Apply migration 0022 before approval.'
	);
}
const reviewColumns = await d1Rows('PRAGMA table_info(question_paper_sitting_reviews)');
if (!reviewColumns.some((row) => row.name === 'approved_content_fingerprint')) {
	throw new Error(
		'question_paper_sitting_reviews has no content fingerprint column. Apply migration 0028 before approval.'
	);
}

const d1Questions = await d1Rows(
	`SELECT sd.id AS source_document_id, sd.doc_type,
	        q.id, q.source_question_ref, q.marks, q.status,
	        q.needs_human_review AS question_needs_human_review,
	        q.updated_at AS question_updated_at,
	        qro.id AS overlay_id, qro.overlay_version,
	        qro.needs_human_review AS overlay_needs_human_review,
	        qro.updated_at AS overlay_updated_at,
	        (SELECT COUNT(*)
	           FROM question_assets qa
	          WHERE qa.question_id = q.id
	            AND qa.required = 1
	            AND (
	              qa.needs_human_review != 0
	              OR NULLIF(TRIM(qa.r2_key), '') IS NULL
	              OR NULLIF(TRIM(qa.public_path), '') IS NULL
	            )) AS required_asset_review_issues
	 FROM source_documents sd
	 JOIN questions q ON q.source_document_id = sd.id
	 LEFT JOIN question_rendering_overlays qro
	   ON qro.id = (
	     SELECT candidate.id
	       FROM question_rendering_overlays candidate
	      WHERE candidate.question_id = q.id
	        AND candidate.needs_human_review = 0
	      ORDER BY candidate.updated_at DESC, candidate.overlay_version DESC
	      LIMIT 1
	   )
	 WHERE sd.id = ?
	 ORDER BY q.display_order, q.source_question_ref`,
	[sourceDocumentId]
);

const approvedContentFingerprint = await fingerprintPaperSittingContent({
	sourceDocumentId,
	query: (sql, params) => d1Rows(sql, params)
});

const record = derivePaperSittingReview({
	productionSummary,
	importReadyPaper,
	d1Questions,
	durationMinutes,
	reviewedBy,
	pastPaperEntryId,
	approvedContentFingerprint
});
const existingRows = await d1Rows(
	`SELECT source_document_id, past_paper_entry_id, scope, overlay_version,
	        expected_question_count, expected_total_marks, duration_minutes,
	        question_refs_json, solvability_report_json, approved_content_fingerprint,
	        status, reviewed_by, reviewed_at
	 FROM question_paper_sitting_reviews
	 WHERE source_document_id = ?
	 LIMIT 1`,
	[sourceDocumentId]
);
const result = await publishPaperSittingReview({
	record,
	existing: existingRows[0] ?? null,
	write,
	replace,
	execute: async (sql, params) => {
		await d1Query(sql, params);
	}
});

console.log(
	JSON.stringify(
		{
			status: 'passed',
			mode: write ? 'write' : 'dry-run',
			action: result.action,
			written: result.written,
			sourceDocumentId,
			summary: relative(summaryPath),
			paperArtifact: relative(artifactPath),
			pastPaperEntryId: record.past_paper_entry_id,
			overlayVersion: record.overlay_version,
			questionCount: record.expected_question_count,
			totalMarks: record.expected_total_marks,
			durationMinutes: record.duration_minutes,
			reviewedBy: record.reviewed_by,
			reviewedAt: record.reviewed_at,
			approvedContentFingerprint: record.approved_content_fingerprint
		},
		null,
		2
	)
);

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, fallback = '') {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : fallback;
}

function requiredStringArg(name) {
	const value = stringArg(name, '').trim();
	if (!value) throw new Error(`--${name} is required.`);
	return value;
}

function positiveIntegerArg(name) {
	const value = Number(requiredStringArg(name));
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`--${name} must be a positive integer.`);
	}
	return value;
}

function relative(filePath) {
	return path.relative(rootDir, filePath) || '.';
}
