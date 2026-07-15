#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { d1Batch, d1Rows } from './lib/d1-rest.mjs';
import { explicitChainedQuestionResponse } from './lib/chained-question-response.mjs';
import { invalidateQuestionPracticePayloadsStatement } from './lib/public-route-materialization-scope.mjs';
import { applyScopedQuestionRepairs } from './lib/scoped-chained-content-repairs.mjs';
import { materializePublicRoutePayloads } from './materialize-public-route-payloads.mjs';

const REPAIR_OWNER = 'manual-scoped-response-repair/v1';

function stringArg(name, defaultValue = '') {
	const prefix = `--${name}=`;
	const value = process.argv.find((candidate) => candidate.startsWith(prefix));
	return value ? value.slice(prefix.length) : defaultValue;
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function promptBlocks(prompt) {
	return String(prompt ?? '')
		.replace(/^\s*\[\d+\s+marks?\]\s*$/gim, '')
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
		.filter(Boolean)
		.map((text) => ({ kind: 'paragraph', text }));
}

function renderOverlay(question, response) {
	return {
		version: 'manual-v1',
		provenance: 'manual',
		stemBlocks: [],
		leadBlocks: [],
		promptBlocks: promptBlocks(question.prompt_text),
		response,
		afterResponseBlocks: [],
		assets: [],
		layout: {
			paperTextPx: 15,
			sourcePageStart: question.page_start ?? null,
			sourcePageEnd: question.page_end ?? null
		},
		metadata: {
			import_owner: REPAIR_OWNER,
			source: 'reviewed-source-question-and-mark-scheme',
			review_notes: question.review_notes ?? []
		}
	};
}

function repairStatements(question, response) {
	const overlay = renderOverlay(question, response);
	const markSchemeItems = question.mark_scheme_items ?? [];
	const checklist = question.mark_checklist ?? [];
	const answerKeys = Object.entries(response.correctAnswers ?? {});
	if (!answerKeys.length) {
		throw new Error(`${question.id} fixed response is missing a deterministic answer key.`);
	}

	const statements = [
		{
			sql: `UPDATE questions
			      SET prompt_text = ?, self_contained_prompt_text = ?, context_text = NULL,
			          answer_format = ?, source_constraints_json = ?,
			          metadata_json = json_set(
			            COALESCE(metadata_json, '{}'),
			            '$.title', ?,
			            '$.card_title', ?,
			            '$.full_prompt_text', ?,
			            '$.structured_constraints', json(?)
			          ),
			          extraction_confidence = ?, needs_human_review = 0,
			          review_notes_json = ?, updated_at = CURRENT_TIMESTAMP
			      WHERE id = ? AND source_document_id = ? AND source_question_ref = ?`,
			params: [
				question.prompt_text,
				question.self_contained_prompt_text ?? question.prompt_text,
				response.kind,
				JSON.stringify(question.source_constraints ?? []),
				question.card_title,
				question.card_title,
				question.full_prompt_text ?? question.prompt_text,
				JSON.stringify(question.structured_constraints ?? []),
				question.question_segmentation_confidence ?? 1,
				JSON.stringify(question.review_notes ?? []),
				question.id,
				question.source_document_id,
				question.source_question_ref
			]
		},
		{
			sql: `INSERT INTO question_rendering_overlays
			      (id, question_id, source_document_id, source_question_ref, overlay_version,
			       provenance, confidence, needs_human_review, render_json, updated_at)
			      VALUES (?, ?, ?, ?, 'manual-v1', 'manual', 1, 0, ?, CURRENT_TIMESTAMP)
			      ON CONFLICT(question_id, overlay_version) DO UPDATE SET
			        source_document_id = excluded.source_document_id,
			        source_question_ref = excluded.source_question_ref,
			        provenance = excluded.provenance,
			        confidence = excluded.confidence,
			        needs_human_review = excluded.needs_human_review,
			        render_json = excluded.render_json,
			        updated_at = CURRENT_TIMESTAMP`,
			params: [
				`${question.id}-render-manual-v1`,
				question.id,
				question.source_document_id,
				question.source_question_ref,
				JSON.stringify(overlay)
			]
		},
		{
			sql: 'DELETE FROM question_response_answer_keys WHERE question_id = ?',
			params: [question.id]
		},
		{
			sql: 'DELETE FROM mark_scheme_items WHERE question_id = ?',
			params: [question.id]
		},
		{
			sql: 'DELETE FROM mark_checklist_items WHERE question_id = ?',
			params: [question.id]
		},
		{
			sql: 'DELETE FROM model_answers WHERE question_id = ?',
			params: [question.id]
		}
	];

	for (const [index, [targetId, correctAnswer]] of answerKeys.entries()) {
		statements.push({
			sql: `INSERT INTO question_response_answer_keys
			      (id, question_id, response_kind, target_id, correct_answer, display_order,
			       aliases_json, metadata_json, updated_at)
			      VALUES (?, ?, ?, ?, ?, ?, '[]', ?, CURRENT_TIMESTAMP)`,
			params: [
				`${question.id}-response-key-${targetId}`,
				question.id,
				response.kind,
				targetId,
				correctAnswer,
				index + 1,
				JSON.stringify({ source: 'reviewed-official-mark-scheme', import_owner: REPAIR_OWNER })
			]
		});
	}

	for (const [index, item] of markSchemeItems.entries()) {
		statements.push({
			sql: `INSERT INTO mark_scheme_items
			      (id, question_id, source_document_id, display_order, item_type, text, marks,
			       source_ref, confidence, metadata_json)
			      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			params: [
				`${question.id}-ms-${index + 1}`,
				question.id,
				question.source_document_id,
				index + 1,
				item.item_type ?? 'answer',
				item.text,
				item.marks ?? 1,
				item.source_ref ?? null,
				item.confidence ?? 1,
				JSON.stringify({ ...(item.metadata ?? {}), import_owner: REPAIR_OWNER })
			]
		});
	}

	for (const [index, item] of checklist.entries()) {
		const markIds = (item.mark_scheme_item_indexes ?? []).map(
			(markIndex) => `${question.id}-ms-${Number(markIndex) + 1}`
		);
		statements.push({
			sql: `INSERT INTO mark_checklist_items
			      (id, question_id, display_order, text, required, mark_scheme_item_ids_json,
			       confidence, needs_human_review)
			      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			params: [
				`${question.id}-check-${index + 1}`,
				question.id,
				index + 1,
				item.text,
				item.required === false ? 0 : 1,
				JSON.stringify(markIds),
				item.confidence ?? 1,
				item.needs_human_review ? 1 : 0
			]
		});
	}

	statements.push(invalidateQuestionPracticePayloadsStatement([question.id]));
	return statements;
}

export async function repairScopedQuestionResponse({
	rootDir = process.cwd(),
	questionId,
	dryRun = false
}) {
	if (!questionId) throw new Error('Pass --question-id=<id>.');
	const baseline = readJson(
		path.join(
			rootDir,
			'data/extracted-questions/aqa-combined-science-trilogy-higher/baseline/all-papers.json'
		)
	);
	const repair = readJson(
		path.join(rootDir, 'scripts/repairs/illustrated-science-question-fixes.json')
	);
	const question = applyScopedQuestionRepairs(baseline.questions ?? [], repair).find(
		(candidate) => candidate.id === questionId
	);
	if (!question) throw new Error(`Question ${questionId} is not in the scoped repair source.`);
	const response = explicitChainedQuestionResponse(question);
	if (!response || response.kind === 'lines' || response.kind === 'none') {
		throw new Error(`${questionId} does not have a reviewed structured response.`);
	}

	const rows = await d1Rows(
		`SELECT q.id, q.source_document_id, q.source_question_ref,
		        GROUP_CONCAT(DISTINCT qac.answer_chain_id) AS chain_ids
		   FROM questions q
		   LEFT JOIN question_answer_chains qac ON qac.question_id = q.id
		  WHERE q.id = ?
		  GROUP BY q.id`,
		[questionId],
		{ rootDir }
	);
	const stored = rows[0];
	if (!stored) throw new Error(`Question ${questionId} does not exist in D1.`);
	if (
		stored.source_document_id !== question.source_document_id ||
		stored.source_question_ref !== question.source_question_ref
	) {
		throw new Error(`${questionId} D1 source identity does not match the reviewed repair.`);
	}

	const summary = {
		questionId,
		dryRun,
		responseKind: response.kind,
		options: response.options ?? [],
		correctAnswers: response.correctAnswers ?? {},
		chainIds: String(stored.chain_ids ?? '')
			.split(',')
			.filter(Boolean)
	};
	if (dryRun) return summary;

	await d1Batch(repairStatements(question, response), { rootDir });
	if (summary.chainIds.length) {
		await materializePublicRoutePayloads({
			rootDir,
			dryRun: false,
			batchSize: 25,
			ownedChainIds: summary.chainIds
		});
	}

	const verification = await d1Rows(
		`SELECT q.prompt_text, q.answer_format,
		        json_extract(qro.render_json, '$.response.kind') AS response_kind,
		        json_extract(qro.render_json, '$.response.options') AS options_json,
		        k.correct_answer,
		        (SELECT COUNT(*) FROM model_answers ma WHERE ma.question_id = q.id) AS model_answers,
		        (SELECT COUNT(*) FROM public_route_payloads p
		          WHERE p.route_kind = 'question-practice-page'
		            AND p.route_path = '/questions/' || q.id || '/practice') AS stale_page_payloads
		   FROM questions q
		   JOIN question_rendering_overlays qro ON qro.question_id = q.id
		   JOIN question_response_answer_keys k ON k.question_id = q.id
		  WHERE q.id = ? AND qro.overlay_version = 'manual-v1'`,
		[questionId],
		{ rootDir }
	);
	const result = verification[0];
	if (
		!result ||
		result.answer_format !== response.kind ||
		result.response_kind !== response.kind ||
		result.correct_answer !== Object.values(response.correctAnswers ?? {})[0] ||
		Number(result.model_answers) !== 0 ||
		Number(result.stale_page_payloads) !== 0
	) {
		throw new Error(`Post-repair verification failed: ${JSON.stringify(result ?? null)}`);
	}

	return { ...summary, verification: result };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	repairScopedQuestionResponse({
		rootDir: process.cwd(),
		questionId: stringArg('question-id'),
		dryRun: process.argv.includes('--dry-run')
	})
		.then((result) => console.log(JSON.stringify(result, null, 2)))
		.catch((error) => {
			console.error(error);
			process.exitCode = 1;
		});
}
