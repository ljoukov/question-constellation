#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createServer } from 'vite';
import { d1Rows } from './lib/d1-rest.mjs';

const usage = `Usage:
node scripts/prepare-english-literature-practice-validation.mjs [options]

Options:
  --d1                         Read candidates from QUESTION_DB (default).
  --input=<snapshot.json>      Read candidates from a saved { candidates: [] } snapshot.
  --base-url=http://...        Probe real practice redirects without following them.
  --output=<plan.json>         Default: tmp/english-literature-practice-validation/plan.json
  --snapshot-output=<json>     Optionally save the read-only candidate snapshot.
  --minimum-per-kind=2         Default: 2 (10 questions across five task kinds).
  --require-ready              Exit non-zero unless all selection and route gates pass.
  --validate-completed=<json>  Validate a filled preflight/evidence JSON and exit.
  --help

This command performs SELECT queries and HTTP GET route probes only. It never invokes a
grading model and never writes D1.`;

const rootDir = process.cwd();

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(usage);
		return;
	}
	if (options.validateCompleted) {
		await validateCompletedEvidence(options);
		return;
	}

	const snapshot = options.input
		? await readSnapshot(options.input)
		: await readEnglishLiteratureCandidatesFromD1();
	if (options.baseUrl) await probePracticeRoutes(snapshot.candidates, options.baseUrl);

	const module = await loadValidationModule();
	let plan;
	try {
		plan = module.exports.buildEnglishLiteraturePracticeValidationPlan(snapshot.candidates, {
			minimumQuestionsPerTaskKind: options.minimumPerKind
		});
	} finally {
		await module.close();
	}

	const evidence = {
		schemaVersion: 'english-literature-practice-validation-preflight-v2',
		generatedAt: new Date().toISOString(),
		readOnly: true,
		modelCalls: 0,
		d1Writes: 0,
		dataSource: snapshot.dataSource,
		baseUrl: options.baseUrl ? safeBaseUrl(options.baseUrl) : null,
		candidateCount: snapshot.candidates.length,
		plan
	};
	await writeJson(options.output, evidence);
	if (options.snapshotOutput) {
		await writeJson(options.snapshotOutput, {
			schemaVersion: 'english-literature-practice-validation-candidates-v2',
			generatedAt: evidence.generatedAt,
			dataSource: snapshot.dataSource,
			candidates: snapshot.candidates
		});
	}

	console.log(
		JSON.stringify(
			{
				status: plan.status,
				candidateCount: snapshot.candidates.length,
				selectedQuestionCount: plan.selectedQuestions.length,
				coverage: plan.coverage,
				blockers: plan.blockers,
				output: path.relative(rootDir, options.output),
				modelCalls: 0,
				d1Writes: 0
			},
			null,
			2
		)
	);
	if (options.requireReady && plan.status !== 'ready_for_browser_execution') {
		process.exitCode = 1;
	}
}

async function validateCompletedEvidence(options) {
	const resolved = path.resolve(rootDir, options.validateCompleted);
	const parsed = JSON.parse(await readFile(resolved, 'utf8'));
	const plan = parsed.plan ?? parsed;
	const module = await loadValidationModule();
	let issues;
	try {
		issues = module.exports.validateCompletedEnglishLiteraturePracticeEvidence(plan);
	} finally {
		await module.close();
	}
	const report = {
		schemaVersion: 'english-literature-practice-validation-completion-check-v1',
		checkedAt: new Date().toISOString(),
		input: path.relative(rootDir, resolved),
		status: issues.length === 0 ? 'passed' : 'failed',
		issueCount: issues.length,
		issues,
		modelCalls: 0,
		d1Writes: 0
	};
	await writeJson(options.output, report);
	console.log(JSON.stringify(report, null, 2));
	if (issues.length > 0) process.exitCode = 1;
}

async function loadValidationModule() {
	const vite = await createServer({
		configFile: false,
		server: { middlewareMode: true },
		appType: 'custom',
		logLevel: 'silent'
	});
	try {
		return {
			exports: await vite.ssrLoadModule('/src/lib/englishLiteraturePracticeValidationPlan.ts'),
			close: () => vite.close()
		};
	} catch (error) {
		await vite.close();
		throw error;
	}
}

async function readSnapshot(inputPath) {
	const resolved = path.resolve(rootDir, inputPath);
	const parsed = JSON.parse(await readFile(resolved, 'utf8'));
	const candidates = Array.isArray(parsed) ? parsed : parsed.candidates;
	if (!Array.isArray(candidates)) throw new Error(`${resolved} does not contain candidates[].`);
	return {
		dataSource: { kind: 'snapshot', path: path.relative(rootDir, resolved) },
		candidates
	};
}

async function readEnglishLiteratureCandidatesFromD1() {
	const [questionRows, assetRows, markRows, checklistRows, modelRows, chainRows] =
		await Promise.all([
			d1Rows(
				`SELECT q.id AS question_id,
				        q.source_document_id,
				        q.source_question_ref,
				        q.prompt_text,
				        q.context_text,
				        q.self_contained_prompt_text,
				        q.self_containment_json,
				        q.status,
				        q.needs_human_review,
				        q.board,
				        q.subject,
				        q.paper,
				        q.series,
				        q.topic_path_json,
				        q.metadata_json,
				        qro.id AS overlay_id,
				        qro.needs_human_review AS overlay_needs_human_review,
				        qro.render_json
				 FROM questions q
				 LEFT JOIN question_rendering_overlays qro
				   ON qro.id = (
				      SELECT candidate.id
				      FROM question_rendering_overlays candidate
				      WHERE candidate.question_id = q.id
				      ORDER BY candidate.needs_human_review ASC,
				               CASE candidate.provenance
				                 WHEN 'manual' THEN 0
				                 WHEN 'pdf-geometry' THEN 1
				                 WHEN 'vision-extracted' THEN 2
				                 ELSE 3
				               END,
				               candidate.overlay_version DESC
				      LIMIT 1
				   )
				 WHERE lower(COALESCE(q.subject, q.subject_area, '')) LIKE '%english literature%'
				   AND lower(COALESCE(q.board, '')) = 'ocr'
				 ORDER BY q.source_document_id, q.display_order, q.id`,
				[],
				{ rootDir, binding: 'QUESTION_DB' }
			),
			d1Rows(
				`SELECT qa.question_id, qa.id, qa.public_path, qa.role, qa.source_label,
				        qa.alt_text, qa.required, qa.needs_human_review
				 FROM question_assets qa
				 JOIN questions q ON q.id = qa.question_id
				 WHERE lower(COALESCE(q.subject, q.subject_area, '')) LIKE '%english literature%'
				   AND lower(COALESCE(q.board, '')) = 'ocr'
				 ORDER BY qa.question_id, qa.id`,
				[],
				{ rootDir, binding: 'QUESTION_DB' }
			),
			d1Rows(
				`SELECT m.question_id, m.id, m.item_type, m.text, m.marks,
				        m.source_ref, m.source_document_id
				 FROM mark_scheme_items m
				 JOIN questions q ON q.id = m.question_id
				 WHERE lower(COALESCE(q.subject, q.subject_area, '')) LIKE '%english literature%'
				   AND lower(COALESCE(q.board, '')) = 'ocr'
				 ORDER BY m.question_id, m.display_order, m.id`,
				[],
				{ rootDir, binding: 'QUESTION_DB' }
			),
			d1Rows(
				`SELECT c.question_id, c.id, c.text, c.required,
				        c.mark_scheme_item_ids_json, c.needs_human_review
				 FROM mark_checklist_items c
				 JOIN questions q ON q.id = c.question_id
				 WHERE lower(COALESCE(q.subject, q.subject_area, '')) LIKE '%english literature%'
				   AND lower(COALESCE(q.board, '')) = 'ocr'
				 ORDER BY c.question_id, c.display_order, c.id`,
				[],
				{ rootDir, binding: 'QUESTION_DB' }
			),
			d1Rows(
				`SELECT ma.question_id, ma.id, ma.answer_text, ma.derivation,
				        ma.supporting_mark_scheme_item_ids_json, ma.needs_human_review,
				        ma.confidence
				 FROM model_answers ma
				 JOIN questions q ON q.id = ma.question_id
				 WHERE lower(COALESCE(q.subject, q.subject_area, '')) LIKE '%english literature%'
				   AND lower(COALESCE(q.board, '')) = 'ocr'
				 ORDER BY ma.question_id, ma.needs_human_review, ma.confidence DESC, ma.id`,
				[],
				{ rootDir, binding: 'QUESTION_DB' }
			),
			d1Rows(
				`SELECT qac.question_id, ac.id, ac.status, ac.needs_human_review,
				        qac.needs_human_review AS link_needs_human_review,
				        qac.is_primary, qac.fit_confidence,
				        COUNT(acs.id) AS step_count
				 FROM question_answer_chains qac
				 JOIN answer_chains ac ON ac.id = qac.answer_chain_id
				 JOIN questions q ON q.id = qac.question_id
				 LEFT JOIN answer_chain_steps acs ON acs.answer_chain_id = ac.id
				 WHERE lower(COALESCE(q.subject, q.subject_area, '')) LIKE '%english literature%'
				   AND lower(COALESCE(q.board, '')) = 'ocr'
				 GROUP BY qac.question_id, ac.id, ac.status, ac.needs_human_review,
				          qac.needs_human_review, qac.is_primary, qac.fit_confidence
				 ORDER BY qac.question_id, qac.is_primary DESC,
				          qac.needs_human_review ASC, qac.fit_confidence DESC, ac.id`,
				[],
				{ rootDir, binding: 'QUESTION_DB' }
			)
		]);

	const assetsByQuestion = groupRows(assetRows, 'question_id');
	const marksByQuestion = groupRows(markRows, 'question_id');
	const checklistsByQuestion = groupRows(checklistRows, 'question_id');
	const modelsByQuestion = groupRows(modelRows, 'question_id');
	const chainsByQuestion = groupRows(chainRows, 'question_id');
	const candidates = questionRows.map((row) => ({
		questionId: row.question_id,
		sourceDocumentId: row.source_document_id,
		sourceQuestionRef: row.source_question_ref,
		promptText: row.prompt_text,
		contextText: row.context_text,
		selfContainedPromptText: row.self_contained_prompt_text,
		selfContainmentJson: row.self_containment_json,
		status: row.status,
		needsHumanReview: row.needs_human_review,
		board: row.board,
		subject: row.subject,
		paper: row.paper,
		series: row.series,
		topic: lastTopic(row.topic_path_json),
		metadataJson: row.metadata_json,
		overlayId: row.overlay_id,
		overlayNeedsHumanReview: row.overlay_needs_human_review,
		renderingOverlay: parseJson(row.render_json, null),
		assets: (assetsByQuestion.get(row.question_id) ?? []).map((asset) => ({
			id: asset.id,
			publicPath: asset.public_path,
			role: asset.role,
			sourceLabel: asset.source_label,
			altText: asset.alt_text,
			required: asset.required,
			needsHumanReview: asset.needs_human_review
		})),
		markSchemeItems: (marksByQuestion.get(row.question_id) ?? []).map((item) => ({
			id: item.id,
			itemType: item.item_type,
			text: item.text,
			marks: item.marks,
			sourceRef: item.source_ref,
			sourceDocumentId: item.source_document_id
		})),
		checklistItems: (checklistsByQuestion.get(row.question_id) ?? []).map((item) => ({
			id: item.id,
			text: item.text,
			required: item.required,
			markSchemeItemIds: parseJson(item.mark_scheme_item_ids_json, []),
			needsHumanReview: item.needs_human_review
		})),
		modelAnswers: (modelsByQuestion.get(row.question_id) ?? []).map((answer) => ({
			id: answer.id,
			answerText: answer.answer_text,
			derivation: answer.derivation,
			supportingMarkSchemeItemIds: parseJson(answer.supporting_mark_scheme_item_ids_json, []),
			needsHumanReview: answer.needs_human_review
		})),
		primaryChain: mapPrimaryChain(chainsByQuestion.get(row.question_id) ?? []),
		routeProbe: { checked: false, available: false }
	}));

	return {
		dataSource: {
			kind: 'QUESTION_DB',
			queries: 6,
			mode: 'select-only'
		},
		candidates
	};
}

function mapPrimaryChain(rows) {
	const row = rows.find((candidate) => Number(candidate.is_primary) === 1) ?? rows[0];
	if (!row) return null;
	return {
		id: row.id,
		status: row.status,
		needsHumanReview: row.needs_human_review,
		linkNeedsHumanReview: row.link_needs_human_review,
		stepCount: Number(row.step_count) || 0
	};
}

async function probePracticeRoutes(candidates, baseUrl) {
	for (const candidate of candidates) {
		const url = new URL(`/questions/${encodeURIComponent(candidate.questionId)}/practice`, baseUrl);
		try {
			const response = await fetch(url, { redirect: 'manual' });
			const location = response.headers.get('location');
			const expectedPath = `/questions/${candidate.questionId}/practice/task`;
			const available = response.status === 307 && Boolean(location?.includes(expectedPath));
			let stepStatus = null;
			if (available && location) {
				const stepResponse = await fetch(new URL(location, baseUrl), { redirect: 'manual' });
				stepStatus = stepResponse.status;
			}
			candidate.routeProbe = {
				checked: true,
				available: available && stepStatus === 200,
				status: response.status,
				location,
				stepStatus
			};
		} catch (error) {
			candidate.routeProbe = {
				checked: true,
				available: false,
				status: null,
				location: error instanceof Error ? error.message : String(error),
				stepStatus: null
			};
		}
	}
}

function groupRows(rows, key) {
	const grouped = new Map();
	for (const row of rows) {
		const value = row[key];
		if (!grouped.has(value)) grouped.set(value, []);
		grouped.get(value).push(row);
	}
	return grouped;
}

function parseJson(value, fallback) {
	if (typeof value !== 'string' || !value.trim()) return fallback;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
}

function lastTopic(value) {
	const topics = parseJson(value, []);
	return Array.isArray(topics) && topics.length > 0 ? String(topics.at(-1)) : null;
}

function safeBaseUrl(value) {
	const url = new URL(value);
	url.username = '';
	url.password = '';
	url.search = '';
	url.hash = '';
	return url.toString().replace(/\/$/, '');
}

async function writeJson(outputPath, value) {
	const resolved = path.resolve(rootDir, outputPath);
	await mkdir(path.dirname(resolved), { recursive: true });
	await writeFile(resolved, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(args) {
	const options = {
		help: false,
		input: null,
		baseUrl: null,
		output: path.resolve(rootDir, 'tmp/english-literature-practice-validation/plan.json'),
		snapshotOutput: null,
		minimumPerKind: 2,
		requireReady: false,
		validateCompleted: null
	};
	for (const argument of args) {
		if (argument === '--help' || argument === '-h') options.help = true;
		else if (argument === '--d1') options.input = null;
		else if (argument.startsWith('--input=')) options.input = argument.slice('--input='.length);
		else if (argument.startsWith('--base-url=')) {
			options.baseUrl = argument.slice('--base-url='.length);
		} else if (argument.startsWith('--output=')) {
			options.output = path.resolve(rootDir, argument.slice('--output='.length));
		} else if (argument.startsWith('--snapshot-output=')) {
			options.snapshotOutput = path.resolve(rootDir, argument.slice('--snapshot-output='.length));
		} else if (argument.startsWith('--minimum-per-kind=')) {
			options.minimumPerKind = Number(argument.slice('--minimum-per-kind='.length));
		} else if (argument === '--require-ready') options.requireReady = true;
		else if (argument.startsWith('--validate-completed=')) {
			options.validateCompleted = argument.slice('--validate-completed='.length);
		} else throw new Error(`Unknown option: ${argument}`);
	}
	if (!Number.isInteger(options.minimumPerKind) || options.minimumPerKind < 2) {
		throw new Error('--minimum-per-kind must be an integer of at least 2.');
	}
	return options;
}

await main();
