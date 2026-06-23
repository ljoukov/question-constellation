#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const wranglerPath = path.join(rootDir, 'wrangler.jsonc');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

const experimentSourceDocumentIds = [
	'aqa-8464b1h-qp-jun18',
	'aqa-8464p1h-qp-jun18',
	'aqa-8464b1h-qp-jun19',
	'aqa-8464c1h-qp-nov21'
];

const repairs = [
	{
		questionId: '8464b1h-jun18-01-1',
		sourceDocumentId: 'aqa-8464b1h-qp-jun18',
		sourceRef: '01.1',
		markSchemeItems: [
			{
				text: 'Nucleus matches eukaryotic cells; permanent vacuole matches plant cells only; plasmid matches prokaryotic cells. Award 2 marks for all three correct links, or 1 mark for one or two correct links.',
				marks: 2
			}
		],
		checklistItems: [
			'Nucleus matched to eukaryotic cells.',
			'Permanent vacuole matched to plant cells only.',
			'Plasmid matched to prokaryotic cells.'
		],
		answerKeys: [
			{
				targetId: 'Nucleus',
				correctAnswer: 'Eukaryotic cells',
				metadata: {
					scoring: '2 marks for all three correct links; 1 mark for one or two correct links'
				}
			},
			{
				targetId: 'Permanent vacuole',
				correctAnswer: 'Plant cells only',
				metadata: {
					scoring: '2 marks for all three correct links; 1 mark for one or two correct links'
				}
			},
			{
				targetId: 'Plasmid',
				correctAnswer: 'Prokaryotic cells',
				metadata: {
					scoring: '2 marks for all three correct links; 1 mark for one or two correct links'
				}
			}
		]
	},
	{
		questionId: '8464b1h-jun18-01-2',
		sourceDocumentId: 'aqa-8464b1h-qp-jun18',
		sourceRef: '01.2',
		markSchemeItems: [
			{
				text: 'The correct row is Structure A = vacuole, Structure B = ribosome, Structure C = cell wall.',
				marks: 1
			}
		],
		checklistItems: ['Selected row: vacuole, ribosome, cell wall.'],
		answerKeys: [
			{
				targetId: 'answer',
				correctAnswer: 'Vacuole | Ribosome | Cell wall',
				aliases: ['vacuole | ribosome | cell wall']
			}
		]
	},
	{
		questionId: '8464b1h-jun18-06-3',
		sourceDocumentId: 'aqa-8464b1h-qp-jun18',
		sourceRef: '06.3',
		markSchemeItems: [
			{
				text: 'Mass = 6 x 10^-12 g.',
				marks: 1
			}
		],
		checklistItems: ['Mass is 6 x 10^-12 g.'],
		answerKeys: [
			{
				targetId: 'answer',
				correctAnswer: '6 x 10^-12',
				aliases: ['6e-12', '6 × 10^-12', '6 × 10−12', '0.000000000006', '6 x 10^-12 g'],
				metadata: { unit: 'g' }
			}
		]
	},
	{
		questionId: '8464c1h-nov21-06-4',
		sourceDocumentId: 'aqa-8464c1h-qp-nov21',
		sourceRef: '06.4',
		renderResponse: {
			kind: 'labeled-lines',
			labels: ['Formula of iron oxide', 'Balanced symbol equation'],
			lineCount: 1
		},
		markSchemeItems: [
			{
				text: 'The ratio is Fe:O2 = 3:2, or Fe:O = 3:4.',
				marks: 1
			},
			{
				text: 'The formula of iron oxide is Fe3O4.',
				marks: 1
			},
			{
				text: 'The balanced symbol equation is 3 Fe + 2 O2 -> Fe3O4.',
				marks: 2
			}
		],
		checklistItems: [
			'Uses the ratio Fe:O2 = 3:2, or Fe:O = 3:4.',
			'Formula of iron oxide is Fe3O4.',
			'Equation includes Fe, O2 and Fe3O4.',
			'Equation is balanced as 3 Fe + 2 O2 -> Fe3O4.'
		],
		answerKeys: [
			{
				targetId: 'Formula of iron oxide',
				correctAnswer: 'Fe3O4',
				aliases: ['Fe3O4', 'Fe₃O₄']
			},
			{
				targetId: 'Balanced symbol equation',
				correctAnswer: '3 Fe + 2 O2 -> Fe3O4',
				aliases: [
					'3Fe + 2O2 -> Fe3O4',
					'3 Fe + 2 O2 → Fe3O4',
					'3Fe + 2O₂ -> Fe₃O₄',
					'6 Fe + 4 O2 -> 2 Fe3O4'
				],
				metadata: { allow_multiples: true }
			}
		]
	},
	{
		questionId: '8464c1h-nov21-07-2',
		sourceDocumentId: 'aqa-8464c1h-qp-nov21',
		sourceRef: '07.2',
		markSchemeItems: [
			{
				text: 'Energy released = 2120 kJ/mol.',
				marks: 1
			}
		],
		checklistItems: ['Energy released is 2120 kJ/mol.'],
		answerKeys: [
			{
				targetId: 'answer',
				correctAnswer: '2120',
				aliases: ['2120 kJ/mol'],
				metadata: { unit: 'kJ/mol' }
			}
		]
	}
];

function loadDotEnvFile(filePath) {
	if (!existsSync(filePath)) return;
	const raw = readFileSync(filePath, 'utf8');
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;
		const [, key, rawValue] = match;
		if (process.env[key] !== undefined) continue;
		let value = rawValue.trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] = value;
	}
}

loadDotEnvFile(path.join(rootDir, '.env'));
loadDotEnvFile(path.join(rootDir, '.env.local'));

function readWranglerConfig() {
	const raw = readFileSync(wranglerPath, 'utf8')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/\/\*[\s\S]*?\*\//g, '');
	return JSON.parse(raw);
}

function requiredEnv(name, fallback = null) {
	const value = process.env[name] ?? fallback;
	if (!value) throw new Error(`${name} is required.`);
	return value;
}

function localApiToken() {
	return process.env.CLOUDFLARE_API_TOKEN ?? process.env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN;
}

const wranglerConfig = readWranglerConfig();
const databaseConfig = wranglerConfig.d1_databases?.find((db) => db.binding === 'QUESTION_DB');
const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
const apiToken = requiredEnv('CLOUDFLARE_API_TOKEN', localApiToken() ?? null);
const databaseId = requiredEnv('QUESTION_DB_DATABASE_ID', databaseConfig?.database_id ?? null);
const d1QueryUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

async function d1Query(sql, params = []) {
	const response = await fetch(d1QueryUrl, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiToken}`,
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify({ sql, params })
	});
	const bodyText = await response.text();
	if (!response.ok) {
		throw new Error(`D1 query failed: ${response.status} ${response.statusText}: ${bodyText}`);
	}
	const body = JSON.parse(bodyText);
	if (!body.success) {
		throw new Error(`D1 query failed: ${JSON.stringify(body.errors ?? body)}`);
	}
	const result = Array.isArray(body.result) ? body.result[0] : body.result;
	if (result?.success === false) {
		throw new Error(`D1 statement failed: ${JSON.stringify(result)}`);
	}
	return result?.results ?? [];
}

function placeholders(count) {
	return Array.from({ length: count }, () => '?').join(', ');
}

async function getAuditRows() {
	return await d1Query(
		`SELECT q.source_document_id, q.source_question_ref, q.id, q.marks,
		        COALESCE(json_extract(qro.render_json, '$.response.kind'), 'missing') AS response_kind,
		        COUNT(DISTINCT m.id) AS mark_rows,
		        COUNT(DISTINCT c.id) AS checklist_rows,
		        COUNT(DISTINCT ma.id) AS model_answers,
		        COUNT(DISTINCT k.id) AS answer_keys
		   FROM questions q
		   LEFT JOIN question_rendering_overlays qro ON qro.question_id = q.id
		   LEFT JOIN mark_scheme_items m ON m.question_id = q.id
		   LEFT JOIN mark_checklist_items c ON c.question_id = q.id
		   LEFT JOIN model_answers ma ON ma.question_id = q.id
		   LEFT JOIN question_response_answer_keys k ON k.question_id = q.id
		  WHERE q.source_document_id IN (${placeholders(experimentSourceDocumentIds.length)})
		  GROUP BY q.id
		  ORDER BY q.source_document_id, q.display_order`,
		experimentSourceDocumentIds
	);
}

function summarizeAudit(rows) {
	const missing = rows.filter(
		(row) =>
			Number(row.mark_rows) === 0 &&
			Number(row.checklist_rows) === 0 &&
			Number(row.model_answers) === 0 &&
			Number(row.answer_keys) === 0
	);
	const byPaper = new Map();
	for (const row of rows) {
		const paper = row.source_document_id;
		const current = byPaper.get(paper) ?? { questions: 0, missing: 0 };
		current.questions += 1;
		if (missing.includes(row)) current.missing += 1;
		byPaper.set(paper, current);
	}
	return {
		total_questions: rows.length,
		missing_usable_grading_evidence: missing.length,
		by_paper: Object.fromEntries(byPaper),
		missing_questions: missing.map((row) => ({
			id: row.id,
			paper: row.source_document_id,
			ref: row.source_question_ref,
			marks: row.marks,
			response_kind: row.response_kind
		}))
	};
}

async function assertRepairQuestionsExist() {
	const rows = await d1Query(
		`SELECT id, source_document_id, source_question_ref
		   FROM questions
		  WHERE id IN (${placeholders(repairs.length)})`,
		repairs.map((repair) => repair.questionId)
	);
	const found = new Set(rows.map((row) => row.id));
	const missing = repairs.filter((repair) => !found.has(repair.questionId));
	if (missing.length) {
		throw new Error(
			`Repair target questions not found in D1: ${missing.map((row) => row.questionId).join(', ')}`
		);
	}
}

function json(value) {
	return JSON.stringify(value ?? null);
}

function repairId(questionId, kind, index) {
	return `${questionId}-grading-repair-${kind}-${index + 1}`;
}

async function upsertMarkSchemeItem(repair, item, index) {
	await d1Query(
		`INSERT OR REPLACE INTO mark_scheme_items
		 (id, question_id, source_document_id, display_order, item_type, text, marks, source_ref, confidence, metadata_json)
		 VALUES (?, ?, NULL, ?, 'mark', ?, ?, ?, 0.98, ?)`,
		[
			repairId(repair.questionId, 'ms', index),
			repair.questionId,
			index + 1,
			item.text,
			item.marks,
			repair.sourceRef,
			json({ source: 'targeted_official_mark_scheme_repair' })
		]
	);
}

async function upsertChecklistItem(repair, text, index) {
	await d1Query(
		`INSERT OR REPLACE INTO mark_checklist_items
		 (id, question_id, display_order, text, required, mark_scheme_item_ids_json, confidence, needs_human_review)
		 VALUES (?, ?, ?, ?, 1, ?, 0.98, 0)`,
		[
			repairId(repair.questionId, 'check', index),
			repair.questionId,
			index + 1,
			text,
			json([repairId(repair.questionId, 'ms', Math.min(index, repair.markSchemeItems.length - 1))])
		]
	);
}

async function upsertAnswerKey(repair, key, index) {
	const responseKind =
		repair.renderResponse?.kind ??
		(
			await d1Query(
				`SELECT json_extract(render_json, '$.response.kind') AS response_kind
				   FROM question_rendering_overlays
				  WHERE question_id = ?
				  LIMIT 1`,
				[repair.questionId]
			)
		)[0]?.response_kind ??
		'unknown';
	await d1Query(
		`INSERT OR REPLACE INTO question_response_answer_keys
		 (id, question_id, response_kind, target_id, correct_answer, display_order, aliases_json, metadata_json, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		[
			`${repair.questionId}-response-key-${key.targetId.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'answer'}`,
			repair.questionId,
			responseKind,
			key.targetId,
			key.correctAnswer,
			index + 1,
			json(key.aliases ?? []),
			json({ source: 'targeted_official_mark_scheme_repair', ...(key.metadata ?? {}) })
		]
	);
}

async function updateRenderResponse(repair) {
	if (!repair.renderResponse) return;
	const rows = await d1Query(
		`SELECT id, render_json
		   FROM question_rendering_overlays
		  WHERE question_id = ?
		  LIMIT 1`,
		[repair.questionId]
	);
	const row = rows[0];
	if (!row) throw new Error(`No render overlay found for ${repair.questionId}`);
	const render = JSON.parse(row.render_json);
	render.response = repair.renderResponse;
	await d1Query(
		`UPDATE question_rendering_overlays
		    SET render_json = ?, updated_at = CURRENT_TIMESTAMP
		  WHERE id = ?`,
		[JSON.stringify(render), row.id]
	);
}

async function applyRepair(repair) {
	await updateRenderResponse(repair);
	for (const [index, item] of repair.markSchemeItems.entries()) {
		await upsertMarkSchemeItem(repair, item, index);
	}
	for (const [index, item] of repair.checklistItems.entries()) {
		await upsertChecklistItem(repair, item, index);
	}
	for (const [index, key] of repair.answerKeys.entries()) {
		await upsertAnswerKey(repair, key, index);
	}
}

const before = summarizeAudit(await getAuditRows());
console.log(
	JSON.stringify(
		{ dry_run: dryRun, before, repairs: repairs.map((repair) => repair.questionId) },
		null,
		2
	)
);

if (!dryRun) {
	await assertRepairQuestionsExist();
	for (const repair of repairs) {
		await applyRepair(repair);
		console.log(`repaired ${repair.questionId}`);
	}
}

const after = summarizeAudit(await getAuditRows());
console.log(JSON.stringify({ dry_run: dryRun, after }, null, 2));

if (!dryRun && after.missing_usable_grading_evidence > 0) {
	process.exitCode = 1;
}
