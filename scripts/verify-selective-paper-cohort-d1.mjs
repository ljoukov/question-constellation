#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { d1Rows } from './lib/d1-rest.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';
import { buildCanonicalPaperFingerprints } from './lib/paper-cohort-fingerprint.mjs';
import { estimateOfficialGradeableMarks } from '../src/lib/experiments/questions/paperSittingGradeabilityPolicy.js';
import { isUnsupportedPaperSittingResponseKind } from '../src/lib/experiments/questions/paperSittingResponsePolicy.js';
import { fingerprintPaperSittingContent } from '../src/lib/server/paperSittingContentFingerprint.js';

const DETERMINISTIC_RESPONSE_KINDS = new Set([
	'choice',
	'choice-table',
	'matching',
	'equation-blanks',
	'number-line',
	'image-label-zones'
]);

const rootDir = process.cwd();
const planPath = path.resolve(
	rootDir,
	stringArg('plan', 'tmp/current-model-paper-cohort/plan.json')
);
const outputPath = path.resolve(
	rootDir,
	stringArg('output', 'docs/release-evidence/selective-paper-cohort-d1-verification.json')
);

if (!existsSync(planPath)) throw new Error(`Missing cohort plan: ${relative(planPath)}.`);
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const sourceDocumentIds = (plan.planned ?? []).map((paper) => paper.sourceDocumentId);
if (sourceDocumentIds.length !== 20 || new Set(sourceDocumentIds).size !== 20) {
	throw new Error(
		`Expected 20 unique planned source documents; found ${sourceDocumentIds.length}.`
	);
}

const placeholders = sourceDocumentIds.map(() => '?').join(', ');
const questionRows = await d1Rows(
	`SELECT q.source_document_id AS sourceDocumentId,
	        COUNT(*) AS questions,
	        COALESCE(SUM(q.marks), 0) AS marks,
	        COUNT(DISTINCT q.source_question_ref) AS distinctRefs,
	        SUM(CASE WHEN q.status <> 'published' THEN 1 ELSE 0 END) AS unpublishedQuestions,
	        SUM(CASE WHEN q.needs_human_review <> 0 THEN 1 ELSE 0 END) AS reviewQuestions,
	        SUM(CASE WHEN NOT EXISTS (
	              SELECT 1 FROM question_rendering_overlays qro
	               WHERE qro.question_id = q.id AND qro.needs_human_review = 0
	            ) THEN 1 ELSE 0 END) AS missingOverlays,
	        SUM(CASE WHEN NOT EXISTS (
	              SELECT 1 FROM mark_scheme_items msi WHERE msi.question_id = q.id
	            ) THEN 1 ELSE 0 END) AS missingMarkScheme,
	        SUM(CASE WHEN NOT EXISTS (
	              SELECT 1 FROM mark_checklist_items mci WHERE mci.question_id = q.id
	            ) THEN 1 ELSE 0 END) AS missingChecklist,
	        SUM(CASE WHEN NOT EXISTS (
	              SELECT 1
	                FROM question_answer_chains qac
	                JOIN answer_chains ac ON ac.id = qac.answer_chain_id
	               WHERE qac.question_id = q.id
	                 AND qac.is_primary = 1
	                 AND qac.needs_human_review = 0
	                 AND ac.needs_human_review = 0
	                 AND EXISTS (
	                   SELECT 1 FROM answer_chain_steps acs
	                    WHERE acs.answer_chain_id = ac.id
	                 )
	            ) THEN 1 ELSE 0 END) AS missingPrimaryChain
	   FROM questions q
	  WHERE q.source_document_id IN (${placeholders})
	  GROUP BY q.source_document_id`,
	sourceDocumentIds
);

const [
	assetRows,
	overlayRows,
	markingSourceRows,
	sourceDocumentRows,
	requiredAssetRows,
	canonicalFingerprints
] = await Promise.all([
	d1Rows(
		`SELECT q.source_document_id AS sourceDocumentId,
		        COUNT(*) AS questionAssets,
		        SUM(CASE WHEN qa.required = 1 THEN 1 ELSE 0 END) AS requiredAssets,
		        SUM(CASE WHEN REPLACE(LOWER(COALESCE(qa.role, '')), '_', '-')
		                       IN ('source-page', 'source-text', 'printed-extract')
		                 THEN 1 ELSE 0 END) AS sourceAssets,
		        SUM(CASE WHEN NULLIF(TRIM(qa.r2_key), '') IS NOT NULL
		                       AND NULLIF(TRIM(qa.public_path), '') IS NOT NULL
		                 THEN 1 ELSE 0 END) AS r2Assets,
		        SUM(CASE WHEN REPLACE(LOWER(COALESCE(qa.role, '')), '_', '-')
		                       IN ('source-page', 'source-text', 'printed-extract')
		                       AND NULLIF(TRIM(qa.r2_key), '') IS NOT NULL
		                       AND NULLIF(TRIM(qa.public_path), '') IS NOT NULL
		                 THEN 1 ELSE 0 END) AS deliveredSourceAssets,
		        SUM(CASE WHEN qa.required = 1
		                       AND (NULLIF(TRIM(qa.r2_key), '') IS NULL
		                            OR NULLIF(TRIM(qa.public_path), '') IS NULL)
		                 THEN 1 ELSE 0 END) AS missingRequiredAssetDelivery
		   FROM question_assets qa
		   JOIN questions q ON q.id = qa.question_id
		  WHERE q.source_document_id IN (${placeholders})
		  GROUP BY q.source_document_id`,
		sourceDocumentIds
	),
	d1Rows(
		`SELECT source_document_id AS sourceDocumentId,
		        COUNT(*) AS renderingOverlays,
		        SUM(CASE WHEN needs_human_review = 0 THEN 1 ELSE 0 END) AS readyRenderingOverlays
		   FROM question_rendering_overlays
		  WHERE source_document_id IN (${placeholders})
		  GROUP BY source_document_id`,
		sourceDocumentIds
	),
	d1Rows(
		`SELECT q.source_document_id AS sourceDocumentId,
		        COUNT(DISTINCT msi.source_document_id) AS markingSourceDocuments
		   FROM questions q
		   JOIN mark_scheme_items msi ON msi.question_id = q.id
		  WHERE q.source_document_id IN (${placeholders})
		  GROUP BY q.source_document_id`,
		sourceDocumentIds
	),
	d1Rows(
		`SELECT id AS sourceDocumentId, 1 AS questionSourceDocuments
		   FROM source_documents
		  WHERE id IN (${placeholders})`,
		sourceDocumentIds
	),
	d1Rows(
		`SELECT q.source_document_id AS sourceDocumentId,
		        qa.id, qa.r2_key AS r2Key, qa.file_path AS filePath
		   FROM question_assets qa
		   JOIN questions q ON q.id = qa.question_id
		  WHERE q.source_document_id IN (${placeholders})
		    AND qa.required = 1
		  ORDER BY q.source_document_id, qa.id`,
		sourceDocumentIds
	),
	buildCanonicalPaperFingerprints(sourceDocumentIds)
]);
const requiredAssetEvidence = await hashRequiredAssets(requiredAssetRows);

const illustrationRows = await d1Rows(
	`SELECT q.source_document_id AS sourceDocumentId,
	        COUNT(DISTINCT aci.id) AS primaryIllustrationPairs
	   FROM questions q
	   JOIN question_answer_chains qac
	     ON qac.question_id = q.id AND qac.is_primary = 1
	   JOIN answer_chain_illustrations aci
	     ON aci.answer_chain_id = qac.answer_chain_id
	    AND aci.is_primary = 1
	    AND aci.status = 'published'
	    AND aci.needs_human_review = 0
	    AND aci.public_path IS NOT NULL
	    AND aci.light_public_path IS NOT NULL
	  WHERE q.source_document_id IN (${placeholders})
	  GROUP BY q.source_document_id`,
	sourceDocumentIds
);

const reviewTable = await d1Rows(
	"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'question_paper_sitting_reviews'"
);
const approvalRows = reviewTable.length
	? await d1Rows(
			`SELECT source_document_id AS sourceDocumentId,
			        CASE WHEN status = 'approved' THEN 1 ELSE 0 END AS approvedFullPaper,
			        status AS fullPaperReviewStatus,
			        expected_question_count AS approvedQuestionCount,
			        expected_total_marks AS approvedMarkTotal,
			        duration_minutes AS durationMinutes,
			        reviewed_at AS fullPaperReviewedAt,
			        approved_content_fingerprint AS approvedContentFingerprint
			   FROM question_paper_sitting_reviews
			  WHERE source_document_id IN (${placeholders})`,
			sourceDocumentIds
		)
	: [];
const approvalQuestionRows = reviewTable.length
	? await d1Rows(
			`SELECT review.source_document_id AS sourceDocumentId,
			        q.source_question_ref AS sourceQuestionRef,
			        q.marks,
			        LOWER(json_extract(qro.render_json, '$.response.kind')) AS responseKind,
			        (SELECT COALESCE(SUM(CASE WHEN msi.marks > 0 THEN msi.marks ELSE 0 END), 0)
			           FROM mark_scheme_items msi WHERE msi.question_id = q.id) AS markSchemeMarkTotal,
			        (SELECT COUNT(*) FROM mark_checklist_items mci
			          WHERE mci.question_id = q.id AND mci.required != 0) AS requiredChecklistCount,
			        (SELECT COUNT(*) FROM question_response_answer_keys qrak
			          WHERE qrak.question_id = q.id) AS responseAnswerKeyCount
			   FROM question_paper_sitting_reviews review
			   JOIN questions q ON q.source_document_id = review.source_document_id
			   LEFT JOIN question_rendering_overlays qro ON qro.id = (
			     SELECT candidate.id
			       FROM question_rendering_overlays candidate
			      WHERE candidate.question_id = q.id
			        AND candidate.overlay_version = review.overlay_version
			        AND candidate.needs_human_review = 0
			      ORDER BY candidate.updated_at DESC, candidate.id DESC
			      LIMIT 1
			   )
			  WHERE review.status = 'approved'
			    AND review.source_document_id IN (${placeholders})
			  ORDER BY review.source_document_id, q.display_order, q.source_question_ref`,
			sourceDocumentIds
		)
	: [];
const sittingQuestionRows = await d1Rows(
	`SELECT q.source_document_id AS sourceDocumentId,
	        q.source_question_ref AS sourceQuestionRef,
	        q.marks,
	        LOWER(json_extract(qro.render_json, '$.response.kind')) AS responseKind,
	        (SELECT COALESCE(SUM(CASE WHEN msi.marks > 0 THEN msi.marks ELSE 0 END), 0)
	           FROM mark_scheme_items msi WHERE msi.question_id = q.id) AS markSchemeMarkTotal,
	        (SELECT COUNT(*) FROM mark_checklist_items mci
	          WHERE mci.question_id = q.id AND mci.required != 0) AS requiredChecklistCount,
	        (SELECT COUNT(*) FROM question_response_answer_keys qrak
	          WHERE qrak.question_id = q.id) AS responseAnswerKeyCount
	   FROM questions q
	   LEFT JOIN question_rendering_overlays qro ON qro.id = (
	     SELECT candidate.id
	       FROM question_rendering_overlays candidate
	      WHERE candidate.question_id = q.id
	        AND candidate.needs_human_review = 0
	      ORDER BY candidate.updated_at DESC, candidate.id DESC
	      LIMIT 1
	   )
	  WHERE q.source_document_id IN (${placeholders})
	  ORDER BY q.source_document_id, q.display_order, q.source_question_ref`,
	sourceDocumentIds
);

const byId = new Map(questionRows.map((row) => [row.sourceDocumentId, row]));
const assetsById = new Map(assetRows.map((row) => [row.sourceDocumentId, row]));
const overlaysById = new Map(overlayRows.map((row) => [row.sourceDocumentId, row]));
const markingSourcesById = new Map(markingSourceRows.map((row) => [row.sourceDocumentId, row]));
const sourceDocumentsById = new Map(sourceDocumentRows.map((row) => [row.sourceDocumentId, row]));
const requiredAssetsById = new Map();
for (const asset of requiredAssetEvidence) {
	const values = requiredAssetsById.get(asset.sourceDocumentId) ?? [];
	values.push(asset);
	requiredAssetsById.set(asset.sourceDocumentId, values);
}
const illustrationsById = new Map(
	illustrationRows.map((row) => [row.sourceDocumentId, Number(row.primaryIllustrationPairs ?? 0)])
);
const approvalsById = new Map(approvalRows.map((row) => [row.sourceDocumentId, row]));
const liveContentFingerprints = new Map(
	await Promise.all(
		sourceDocumentIds.map(async (sourceDocumentId) => [
			sourceDocumentId,
			await fingerprintPaperSittingContent({
				sourceDocumentId,
				query: (sql, params) => d1Rows(sql, params)
			})
		])
	)
);
const approvalQuestionsById = new Map();
for (const row of approvalQuestionRows) {
	const values = approvalQuestionsById.get(row.sourceDocumentId) ?? [];
	values.push(row);
	approvalQuestionsById.set(row.sourceDocumentId, values);
}
const sittingQuestionsById = new Map();
for (const row of sittingQuestionRows) {
	const values = sittingQuestionsById.get(row.sourceDocumentId) ?? [];
	values.push(row);
	sittingQuestionsById.set(row.sourceDocumentId, values);
}
const verifiedAt = new Date().toISOString();
const rows = sourceDocumentIds.map((sourceDocumentId) => {
	const row = byId.get(sourceDocumentId) ?? {};
	const assets = assetsById.get(sourceDocumentId) ?? {};
	const overlays = overlaysById.get(sourceDocumentId) ?? {};
	const markingSources = markingSourcesById.get(sourceDocumentId) ?? {};
	const sourceDocuments = sourceDocumentsById.get(sourceDocumentId) ?? {};
	const paperRequiredAssets = requiredAssetsById.get(sourceDocumentId) ?? [];
	const diagnostics = {
		unpublishedQuestions: number(row.unpublishedQuestions),
		reviewQuestions: number(row.reviewQuestions),
		missingOverlays: number(row.missingOverlays),
		missingMarkScheme: number(row.missingMarkScheme),
		missingChecklist: number(row.missingChecklist),
		missingPrimaryChain: number(row.missingPrimaryChain),
		missingRequiredAssetDelivery: number(assets.missingRequiredAssetDelivery),
		missingQuestionSourceDocument:
			number(row.questions) > 0 && number(sourceDocuments.questionSourceDocuments) === 0 ? 1 : 0,
		missingMarkingSourceDocument:
			number(row.questions) > 0 && number(markingSources.markingSourceDocuments) === 0 ? 1 : 0,
		missingRequiredAssetHash: paperRequiredAssets.filter((asset) => !asset.sha256).length
	};
	const approval = approvalsById.get(sourceDocumentId) ?? null;
	const liveContentFingerprint = liveContentFingerprints.get(sourceDocumentId) ?? null;
	const approvedQuestions = approvalQuestionsById.get(sourceDocumentId) ?? [];
	const sittingQuestions = sittingQuestionsById.get(sourceDocumentId) ?? [];
	const approvedUnsupportedResponses = approvedQuestions.filter(
		(question) =>
			number(question.marks) > 0 && isUnsupportedPaperSittingResponseKind(question.responseKind)
	).length;
	const approvedIncompleteGradingQuestions = approvedQuestions.filter(
		(question) => !fullyGradeableQuestion(question)
	).length;
	diagnostics.approvedUnsupportedResponses = approvedUnsupportedResponses;
	diagnostics.approvedIncompleteGradingQuestions = approvedIncompleteGradingQuestions;
	diagnostics.approvedContentFingerprintMismatch = approval?.approvedFullPaper
		? !/^paper-sitting-content-v1:[a-f0-9]{64}$/.test(
				String(approval.approvedContentFingerprint ?? '')
			) || approval.approvedContentFingerprint !== liveContentFingerprint
			? 1
			: 0
		: 0;
	const paperSittingDiagnostics = {
		unsupportedResponses: sittingQuestions.filter(
			(question) =>
				number(question.marks) > 0 && isUnsupportedPaperSittingResponseKind(question.responseKind)
		).length,
		incompleteGradingQuestions: sittingQuestions.filter(
			(question) => !fullyGradeableQuestion(question)
		).length
	};
	return {
		sourceDocumentId,
		verifiedAt,
		questions: number(row.questions),
		marks: number(row.marks),
		distinctRefs: number(row.distinctRefs),
		missingEvidence: Object.values(diagnostics).reduce((total, value) => total + value, 0),
		approvedFullPaper: approval ? Boolean(Number(approval.approvedFullPaper)) : null,
		fullPaperReviewStatus: approval?.fullPaperReviewStatus ?? null,
		approvedQuestionCount: approval ? number(approval.approvedQuestionCount) : null,
		approvedMarkTotal: approval ? number(approval.approvedMarkTotal) : null,
		durationMinutes: approval ? number(approval.durationMinutes) : null,
		fullPaperReviewedAt: approval?.fullPaperReviewedAt ?? null,
		approvedContentFingerprint: approval?.approvedContentFingerprint ?? null,
		liveContentFingerprint,
		primaryIllustrationPairs: illustrationsById.get(sourceDocumentId) ?? 0,
		questionSourceDocuments: number(sourceDocuments.questionSourceDocuments),
		markingSourceDocuments: number(markingSources.markingSourceDocuments),
		questionAssets: number(assets.questionAssets),
		requiredAssets: number(assets.requiredAssets),
		sourceAssets: number(assets.sourceAssets),
		deliveredSourceAssets: number(assets.deliveredSourceAssets),
		r2Assets: number(assets.r2Assets),
		renderingOverlays: number(overlays.renderingOverlays),
		readyRenderingOverlays: number(overlays.readyRenderingOverlays),
		requiredAssetEvidence: paperRequiredAssets.map(({ id, r2Key, sha256, hashSource }) => ({
			id,
			r2Key,
			sha256,
			hashSource
		})),
		canonicalRowFingerprint: canonicalFingerprints.get(sourceDocumentId) ?? null,
		diagnostics,
		paperSittingDiagnostics
	};
});

const output = {
	schemaVersion: 'selective-paper-cohort-d1-verification-v3',
	status: rows.every(
		(row) =>
			row.questions > 0 &&
			row.questions === row.distinctRefs &&
			row.marks > 0 &&
			row.missingEvidence === 0
	)
		? 'passed'
		: 'incomplete',
	verifiedAt,
	plan: relative(planPath),
	reviewTableAvailable: reviewTable.length === 1,
	counts: {
		plannedPapers: sourceDocumentIds.length,
		presentPapers: rows.filter((row) => row.questions > 0).length,
		questions: rows.reduce((total, row) => total + row.questions, 0),
		marks: rows.reduce((total, row) => total + row.marks, 0),
		missingEvidence: rows.reduce((total, row) => total + row.missingEvidence, 0),
		approvedFullPapers: rows.filter((row) => row.approvedFullPaper).length,
		primaryIllustrationPairs: rows.reduce((total, row) => total + row.primaryIllustrationPairs, 0),
		questionSourceDocuments: rows.reduce((total, row) => total + row.questionSourceDocuments, 0),
		markingSourceDocuments: rows.reduce((total, row) => total + row.markingSourceDocuments, 0),
		questionAssets: rows.reduce((total, row) => total + row.questionAssets, 0),
		sourceAssets: rows.reduce((total, row) => total + row.sourceAssets, 0),
		deliveredSourceAssets: rows.reduce((total, row) => total + row.deliveredSourceAssets, 0),
		r2Assets: rows.reduce((total, row) => total + row.r2Assets, 0),
		renderingOverlays: rows.reduce((total, row) => total + row.renderingOverlays, 0),
		readyRenderingOverlays: rows.reduce((total, row) => total + row.readyRenderingOverlays, 0)
	},
	rows
};

writeJson(outputPath, output);
console.log(
	JSON.stringify(
		{
			status: output.status,
			output: relative(outputPath),
			reviewTableAvailable: output.reviewTableAvailable,
			counts: output.counts
		},
		null,
		2
	)
);

function number(value) {
	const parsed = Number(value ?? 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function fullyGradeableQuestion(question) {
	const marks = number(question.marks);
	if (marks <= 0) return true;
	const responseKind = String(question.responseKind ?? '');
	const gradeableMarks = DETERMINISTIC_RESPONSE_KINDS.has(responseKind)
		? Math.min(marks, number(question.responseAnswerKeyCount))
		: estimateOfficialGradeableMarks({
				maxMarks: marks,
				markScheme: [{ marks: number(question.markSchemeMarkTotal) }],
				checklist: Array.from({ length: number(question.requiredChecklistCount) }, () => ({
					required: true
				})),
				answerKeys: []
			});
	return gradeableMarks >= marks;
}

async function hashRequiredAssets(rows) {
	const hashesByKey = new Map();
	for (const row of rows) {
		if (!row.r2Key) continue;
		const resolved = resolveExistingAssetPath(row.filePath);
		if (!resolved) continue;
		const sha256 = createHash('sha256').update(readFileSync(resolved)).digest('hex');
		const previous = hashesByKey.get(row.r2Key);
		if (previous?.sha256 && previous.sha256 !== sha256) {
			throw new Error(`Required asset ${row.r2Key} has conflicting local bytes.`);
		}
		hashesByKey.set(row.r2Key, { sha256, hashSource: 'local-file' });
	}
	const missingKeys = [
		...new Set(rows.map((row) => row.r2Key).filter((key) => key && !hashesByKey.has(key)))
	];
	await mapLimit(missingKeys, 4, async (key) => {
		const remote = await fetchR2Object(key);
		hashesByKey.set(key, { sha256: remote.sha256, hashSource: 'remote-r2-baseline' });
	});
	return rows.map((row) => ({
		sourceDocumentId: row.sourceDocumentId,
		id: row.id,
		r2Key: row.r2Key,
		sha256: hashesByKey.get(row.r2Key)?.sha256 ?? null,
		hashSource: hashesByKey.get(row.r2Key)?.hashSource ?? null
	}));
}

function resolveExistingAssetPath(filePath) {
	if (!filePath) return null;
	const candidates = [
		path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath),
		path.resolve(
			rootDir,
			String(filePath).replace(/^.*?\/(tmp\/current-model-paper-cohort\/)/, '$1')
		)
	];
	return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function fetchR2Object(key) {
	return new Promise((resolve, reject) => {
		const child = spawn(
			'corepack',
			[
				'pnpm',
				'exec',
				'wrangler',
				'r2',
				'object',
				'get',
				`question-constellation/${key}`,
				'--remote',
				'--pipe'
			],
			{ cwd: rootDir, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
		);
		const hash = createHash('sha256');
		let bytes = 0;
		let stderr = '';
		child.stdout.on('data', (chunk) => {
			hash.update(chunk);
			bytes += chunk.length;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk.toString();
		});
		child.once('error', reject);
		child.once('close', (code) => {
			if (code !== 0) reject(new Error(stderr.trim() || `wrangler exited ${code}`));
			else if (bytes <= 0) reject(new Error(`R2 returned an empty object for ${key}`));
			else resolve({ bytes, sha256: hash.digest('hex') });
		});
	});
}

async function mapLimit(values, concurrency, mapper) {
	const results = new Array(values.length);
	let cursor = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, values.length) }, async () => {
			while (cursor < values.length) {
				const index = cursor;
				cursor += 1;
				results[index] = await mapper(values[index], index);
			}
		})
	);
	return results;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function stringArg(name, fallback) {
	const prefix = `--${name}=`;
	const argument = process.argv.find((candidate) => candidate.startsWith(prefix));
	return argument ? argument.slice(prefix.length) : fallback;
}
