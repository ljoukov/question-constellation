#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
	QUESTION_CARD_TITLE_CONTRACT,
	questionCardTitleIssues
} from '../src/lib/questionCardTitle.js';
import { d1Query, d1Rows } from './lib/d1-rest.mjs';
import { decodePublicRoutePayload } from './lib/physics-question-id-reconciliation.mjs';
import { materializePublicRoutePayloads } from './materialize-public-route-payloads.mjs';

const rootDir = process.cwd();
const write = process.argv.includes('--write');
const inputArg = process.argv.find((argument) => argument.startsWith('--input='));
const inputPath = path.resolve(
	rootDir,
	inputArg?.slice('--input='.length) ?? 'data/repairs/question-card-titles-2026-07-16.json'
);
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
if (input.contract !== QUESTION_CARD_TITLE_CONTRACT) {
	throw new Error(`Repair contract must be ${QUESTION_CARD_TITLE_CONTRACT}.`);
}
if (!String(input.provenance ?? '').trim()) throw new Error('Repair provenance is required.');
if (!Array.isArray(input.repairs) || input.repairs.length === 0) {
	throw new Error('At least one title repair is required.');
}

const ids = input.repairs.map((repair) => String(repair.questionId ?? '').trim());
if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
	throw new Error('Every repair needs a unique questionId.');
}
const placeholders = ids.map(() => '?').join(', ');
const rows = await d1Rows(
	`SELECT q.id, q.prompt_text, q.self_contained_prompt_text, q.metadata_json,
	        (SELECT ma.answer_text FROM model_answers ma
	          WHERE ma.question_id = q.id AND ma.needs_human_review = 0
	          ORDER BY ma.confidence DESC LIMIT 1) AS answer_text
	   FROM questions q
	  WHERE q.id IN (${placeholders})`,
	ids,
	{ rootDir }
);
const rowById = new Map(rows.map((row) => [row.id, row]));
const plan = input.repairs.map((repair) => {
	const row = rowById.get(repair.questionId);
	if (!row) throw new Error(`Question not found: ${repair.questionId}`);
	const title = String(repair.title ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	const issues = questionCardTitleIssues(title, {
		promptText: [row.prompt_text, row.self_contained_prompt_text].filter(Boolean).join('\n'),
		answerText: row.answer_text
	});
	if (issues.length) {
		throw new Error(`${row.id} title is not publication-ready: ${issues.join(', ')}`);
	}
	const metadata = parseJson(row.metadata_json, {});
	const currentTitle =
		typeof metadata.card_title === 'string' && metadata.card_title.trim()
			? metadata.card_title.trim()
			: null;
	if (currentTitle && currentTitle !== title) {
		const currentIssues = questionCardTitleIssues(currentTitle, {
			promptText: [row.prompt_text, row.self_contained_prompt_text].filter(Boolean).join('\n'),
			answerText: row.answer_text
		});
		if (currentIssues.length === 0) {
			throw new Error(`${row.id} already has a different reviewed card title: ${currentTitle}`);
		}
	}
	return {
		questionId: row.id,
		from: currentTitle,
		to: title,
		metadata: {
			...metadata,
			title,
			card_title: title,
			card_title_contract: QUESTION_CARD_TITLE_CONTRACT,
			card_title_provenance: input.provenance
		}
	};
});

const chainRows = await d1Rows(
	`SELECT DISTINCT answer_chain_id
	   FROM question_answer_chains
	  WHERE question_id IN (${placeholders})
	    AND needs_human_review = 0`,
	ids,
	{ rootDir }
);
const ownedChainIds = chainRows
	.map((row) => row.answer_chain_id)
	.filter(Boolean)
	.sort();

if (!write) {
	console.log(
		JSON.stringify(
			{
				status: 'dry_run',
				input: path.relative(rootDir, inputPath),
				changes: plan.map(({ metadata: _metadata, ...change }) => change),
				ownedChainIds,
				note: 'Pass --write to update D1 and rematerialize the affected public routes.'
			},
			null,
			2
		)
	);
	process.exit(0);
}

for (const repair of plan) {
	await d1Query(
		`UPDATE questions
		    SET metadata_json = ?, updated_at = CURRENT_TIMESTAMP
		  WHERE id = ?`,
		[JSON.stringify(repair.metadata), repair.questionId],
		{ rootDir }
	);
}

await materializePublicRoutePayloads({ rootDir, ownedChainIds });

const verifiedRows = await d1Rows(
	`SELECT id, metadata_json FROM questions WHERE id IN (${placeholders})`,
	ids,
	{ rootDir }
);
const verifiedById = new Map(verifiedRows.map((row) => [row.id, parseJson(row.metadata_json, {})]));
for (const repair of plan) {
	const metadata = verifiedById.get(repair.questionId);
	if (
		metadata?.card_title !== repair.to ||
		metadata?.card_title_contract !== QUESTION_CARD_TITLE_CONTRACT ||
		metadata?.card_title_provenance !== input.provenance
	) {
		throw new Error(`Post-write title verification failed for ${repair.questionId}.`);
	}
}

const [browseRow] = await d1Rows(
	`SELECT payload_json FROM public_route_payloads WHERE id = 'chains:browse'`,
	[],
	{ rootDir }
);
const browseTitles = new Map(
	(decodePublicRoutePayload(String(browseRow?.payload_json)).value.questions ?? []).map(
		(question) => [question.id, question.title]
	)
);
const omittedFromBrowse = [];
for (const repair of plan) {
	if (!browseTitles.has(repair.questionId)) {
		omittedFromBrowse.push(repair.questionId);
		continue;
	}
	if (browseTitles.get(repair.questionId) !== repair.to) {
		throw new Error(`Materialized title verification failed for ${repair.questionId}.`);
	}
}

console.log(
	JSON.stringify(
		{
			status: 'written',
			changes: plan.map(({ metadata: _metadata, ...change }) => change),
			ownedChainIds,
			materializedBrowseVerified: plan.length - omittedFromBrowse.length,
			omittedFromBrowse
		},
		null,
		2
	)
);

function parseJson(raw, fallback) {
	try {
		return raw ? JSON.parse(raw) : fallback;
	} catch {
		return fallback;
	}
}
