#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
	deriveQuestionCardTitle,
	questionCardTitleIssues,
	QUESTION_CARD_TITLE_CONTRACT
} from '../src/lib/questionCardTitle.js';
import { d1Batch, d1Query, d1Rows } from './lib/d1-rest.mjs';

const rootDir = process.cwd();
const repairPath = path.join(rootDir, 'scripts/repairs/illustrated-science-question-fixes.json');
const questionIds = process.argv
	.filter((argument) => argument.startsWith('--question-id='))
	.map((argument) => argument.slice('--question-id='.length).trim())
	.filter(Boolean);
const chainIds = process.argv
	.filter((argument) => argument.startsWith('--chain-id='))
	.map((argument) => argument.slice('--chain-id='.length).trim())
	.filter(Boolean);
const dryRun = process.argv.includes('--dry-run');
const skipPayloads = process.argv.includes('--skip-payloads');
const personalBinding = 'PERSONAL_DB';

if (!questionIds.length && !chainIds.length) {
	throw new Error(
		'Pass one or more --question-id=<id> or --chain-id=<id> values. This command intentionally has no whole-bank default.'
	);
}

const repair = JSON.parse(readFileSync(repairPath, 'utf8'));
const questionsById = new Map(
	(repair.questions ?? []).map((question) => [String(question.id), question])
);
const selected = questionIds.map((id) => {
	const question = questionsById.get(id);
	if (!question) throw new Error(`${id} is not present in ${path.relative(rootDir, repairPath)}.`);
	return normalizeScopedQuestion(question);
});
const chainsById = new Map((repair.chains ?? []).map((chain) => [String(chain.id), chain]));
const selectedChains = chainIds.map((id) => {
	const chain = chainsById.get(id);
	if (!chain) throw new Error(`${id} is not present in ${path.relative(rootDir, repairPath)}.`);
	return normalizeScopedChain(chain);
});

if (dryRun) {
	console.log(
		JSON.stringify(
			{
				status: 'validated',
				dryRun: true,
				questions: selected.map(questionSummary),
				chains: selectedChains.map(chainSummary)
			},
			null,
			2
		)
	);
	process.exit(0);
}

for (const question of selected) await replaceQuestionContent(question);
for (const chain of selectedChains) await replaceChainContent(chain);
const payloadsUpdated = skipPayloads
	? 0
	: await patchScopedPracticePayloads(selected, selectedChains);
const personalGapSnapshotsUpdated = await patchScopedPersonalGapSnapshots(selected);

const stored = selected.length
	? await d1Rows(
			`SELECT id, prompt_text, context_text, self_contained_prompt_text, metadata_json
			 FROM questions
			 WHERE id IN (${selected.map(() => '?').join(', ')})
			 ORDER BY id`,
			selected.map((question) => question.id),
			{ rootDir }
		)
	: [];
const storedChains = selectedChains.length
	? await d1Rows(
			`SELECT id, canonical_chain_text, summary
			 FROM answer_chains
			 WHERE id IN (${selectedChains.map(() => '?').join(', ')})
			 ORDER BY id`,
			selectedChains.map((chain) => chain.id),
			{ rootDir }
		)
	: [];

console.log(
	JSON.stringify(
		{
			status: 'updated',
			dryRun: false,
			practicePayloadsUpdated: payloadsUpdated,
			personalGapSnapshotsUpdated,
			questions: stored.map((row) => ({
				id: row.id,
				title: parseJson(row.metadata_json, {}).title,
				promptText: row.prompt_text,
				contextText: row.context_text,
				selfContainedPromptText: row.self_contained_prompt_text
			})),
			chains: storedChains
		},
		null,
		2
	)
);

function normalizeScopedQuestion(question) {
	const promptText = firstText(question.prompt_text, question.self_contained_prompt_text);
	const contextText = firstText(
		question.parent_stem,
		...(question.context_blocks ?? []).map((block) => block?.text)
	);
	const selfContainedPromptText = firstText(
		question.self_contained_prompt_text,
		question.full_prompt_text,
		promptText
	);
	const answerText = [
		question.model_answer?.answer_text,
		...(question.mark_scheme_items ?? []).map((item) => item?.text),
		...(question.mark_checklist ?? []).map((item) => item?.text)
	]
		.filter((value) => typeof value === 'string' && value.trim())
		.join('\n');
	const cardTitle = deriveQuestionCardTitle({
		cardTitle: question.card_title ?? question.cardTitle,
		promptText,
		selfContainedPromptText,
		answerText,
		fallback: question.source_question_ref
	});
	const titleIssues = questionCardTitleIssues(cardTitle, {
		promptText: [promptText, selfContainedPromptText].filter(Boolean).join('\n'),
		answerText
	});
	if (titleIssues.length) {
		throw new Error(`${question.id} has an invalid card title: ${titleIssues.join(', ')}.`);
	}
	if (/\n\s*\[\d+\s+marks?\]\s*\n\S/i.test(promptText)) {
		throw new Error(`${question.id} prompt text continues after its mark boundary.`);
	}
	const markSchemeItems = (question.mark_scheme_items ?? []).map((item, index) => {
		if (!String(item.text ?? '').trim())
			throw new Error(`${question.id} mark row ${index} is empty.`);
		if (!(Number(item.marks) > 0)) {
			throw new Error(`${question.id} mark row ${index} is not a positive granular mark.`);
		}
		if (!(Number(item.confidence) >= 0.8)) {
			throw new Error(`${question.id} mark row ${index} has low confidence.`);
		}
		return item;
	});
	if (!markSchemeItems.length) throw new Error(`${question.id} has no mark-scheme items.`);
	const markChecklist = (question.mark_checklist ?? []).map((item, index) => {
		const indexes = (item.mark_scheme_item_indexes ?? []).map(Number);
		if (!indexes.length || indexes.some((itemIndex) => !markSchemeItems[itemIndex])) {
			throw new Error(`${question.id} checklist row ${index} cites a missing mark row.`);
		}
		if (item.needs_human_review || Number(item.confidence) < 0.8) {
			throw new Error(`${question.id} checklist row ${index} is not publication-ready.`);
		}
		return { ...item, mark_scheme_item_indexes: indexes };
	});
	const modelAnswer = question.model_answer;
	if (
		!modelAnswer?.answer_text ||
		modelAnswer.needs_human_review ||
		Number(modelAnswer.confidence) < 0.8
	) {
		throw new Error(`${question.id} model answer is not publication-ready.`);
	}
	const supportingIndexes = (
		modelAnswer.supporting_mark_scheme_item_indexes ?? markSchemeItems.map((_, index) => index)
	).map(Number);
	if (supportingIndexes.some((itemIndex) => !markSchemeItems[itemIndex])) {
		throw new Error(`${question.id} model answer cites a missing mark row.`);
	}
	return {
		...question,
		promptText,
		contextText,
		selfContainedPromptText,
		cardTitle,
		markSchemeItems,
		markChecklist,
		modelAnswer: { ...modelAnswer, supportingIndexes }
	};
}

function normalizeScopedChain(chain) {
	if (!String(chain.canonical_chain_text ?? '').trim()) {
		throw new Error(`${chain.id} has no canonical chain text.`);
	}
	if (/p\s*\.\s*d\s*\./i.test(`${chain.canonical_chain_text} ${chain.summary ?? ''}`)) {
		throw new Error(`${chain.id} still contains unexplained p.d. shorthand.`);
	}
	const steps = (chain.steps ?? []).map((step, index) => {
		if (!String(step.id ?? '').trim() || !String(step.step_text ?? '').trim()) {
			throw new Error(`${chain.id} step ${index + 1} is incomplete.`);
		}
		if (/p\s*\.\s*d\s*\./i.test(step.step_text)) {
			throw new Error(`${chain.id} step ${index + 1} contains unexplained shorthand.`);
		}
		return step;
	});
	if (steps.length < 2 || steps.length > 5) {
		throw new Error(`${chain.id} must contain 2-5 scoped steps.`);
	}
	return {
		...chain,
		canonicalChainText: String(chain.canonical_chain_text).trim(),
		summary: String(chain.summary ?? '').trim(),
		steps
	};
}

async function replaceQuestionContent(question) {
	const existingRows = await d1Rows(
		`SELECT metadata_json FROM questions WHERE id = ? LIMIT 1`,
		[question.id],
		{ rootDir }
	);
	if (!existingRows.length) throw new Error(`${question.id} is not present in D1.`);
	const metadata = {
		...parseJson(existingRows[0].metadata_json, {}),
		title: question.cardTitle,
		card_title: question.cardTitle,
		card_title_contract: QUESTION_CARD_TITLE_CONTRACT,
		card_title_source: 'curated_atomic_import',
		full_prompt_text: question.full_prompt_text ?? question.selfContainedPromptText,
		figure_refs: question.figure_refs ?? [],
		table_refs: question.table_refs ?? [],
		visual_dependency: question.visual_dependency ?? 'none',
		structured_constraints: question.structured_constraints ?? []
	};
	await d1Query(
		`UPDATE questions
		 SET prompt_text = ?, context_text = ?, self_contained_prompt_text = ?,
		     metadata_json = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE id = ?`,
		[
			question.promptText,
			question.contextText,
			question.selfContainedPromptText,
			JSON.stringify(metadata),
			question.id
		],
		{ rootDir }
	);

	await d1Query(`DELETE FROM mark_checklist_items WHERE question_id = ?`, [question.id], {
		rootDir
	});
	await d1Query(`DELETE FROM model_answers WHERE question_id = ?`, [question.id], { rootDir });
	await d1Query(`DELETE FROM mark_scheme_items WHERE question_id = ?`, [question.id], { rootDir });

	const markIds = [];
	for (const [index, item] of question.markSchemeItems.entries()) {
		const id = `${question.id}-ms-${index + 1}`;
		markIds.push(id);
		await d1Query(
			`INSERT INTO mark_scheme_items (
			   id, question_id, source_document_id, display_order, item_type, text,
			   marks, source_ref, confidence, metadata_json
			 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				id,
				question.id,
				item.source_document_id ?? null,
				index + 1,
				item.item_type ?? 'mark',
				item.text,
				item.marks,
				item.source_ref ?? null,
				item.confidence,
				JSON.stringify(item.metadata ?? {})
			],
			{ rootDir }
		);
	}

	for (const [index, item] of question.markChecklist.entries()) {
		await d1Query(
			`INSERT INTO mark_checklist_items (
			   id, question_id, display_order, text, required,
			   mark_scheme_item_ids_json, confidence, needs_human_review
			 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				`${question.id}-check-${index + 1}`,
				question.id,
				index + 1,
				item.text,
				item.required === false ? 0 : 1,
				JSON.stringify(item.mark_scheme_item_indexes.map((itemIndex) => markIds[itemIndex])),
				item.confidence,
				0
			],
			{ rootDir }
		);
	}

	await d1Query(
		`INSERT INTO model_answers (
		   id, question_id, answer_text, derivation,
		   supporting_mark_scheme_item_ids_json, confidence, needs_human_review
		 ) VALUES (?, ?, ?, ?, ?, ?, 0)`,
		[
			`${question.id}-model-answer`,
			question.id,
			question.modelAnswer.answer_text,
			question.modelAnswer.derivation ?? 'generated_from_mark_scheme',
			JSON.stringify(question.modelAnswer.supportingIndexes.map((itemIndex) => markIds[itemIndex])),
			question.modelAnswer.confidence
		],
		{ rootDir }
	);
}

async function replaceChainContent(chain) {
	const rows = await d1Rows(`SELECT id FROM answer_chains WHERE id = ? LIMIT 1`, [chain.id], {
		rootDir
	});
	if (!rows.length) throw new Error(`${chain.id} is not present in D1.`);
	await d1Query(
		`UPDATE answer_chains
		 SET canonical_chain_text = ?, summary = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE id = ?`,
		[chain.canonicalChainText, chain.summary, chain.id],
		{ rootDir }
	);
	for (const [index, step] of chain.steps.entries()) {
		const result = await d1Query(
			`UPDATE answer_chain_steps
			 SET step_text = ?
			 WHERE id = ? AND answer_chain_id = ? AND display_order = ?`,
			[step.step_text, step.id, chain.id, index + 1],
			{ rootDir }
		);
		if (Number(result.meta?.changes ?? 0) !== 1) {
			throw new Error(`${chain.id} step ${step.id} did not update exactly one D1 row.`);
		}
	}
}

async function patchScopedPracticePayloads(questions, chains) {
	const questionById = new Map(questions.map((question) => [question.id, question]));
	const chainById = new Map(chains.map((chain) => [chain.id, chain]));
	const rows = await d1Rows(
		`SELECT id, payload_json FROM public_route_payloads WHERE route_kind = 'practice'`,
		[],
		{ rootDir }
	);
	let updated = 0;
	for (const row of rows) {
		const decoded = decodePayload(row.payload_json);
		const chainQuestions = decoded.value?.chain?.questions;
		if (!Array.isArray(chainQuestions)) continue;
		const chainSource = chainById.get(decoded.value?.chain?.id);
		const affected =
			Boolean(chainSource) || chainQuestions.some((question) => questionById.has(question.id));
		if (!affected) continue;
		if (chainSource) {
			decoded.value.chain.summary = chainSource.summary;
			decoded.value.chain.steps = chainSource.steps.map((step) => step.step_text);
		}

		for (const question of chainQuestions) {
			const source = questionById.get(question.id);
			if (!source) continue;
			question.title = source.cardTitle;
			question.teaser = truncate(cleanPromptText(source.promptText), 132);
		}
		for (const paperQuestion of decoded.value?.paper?.questions ?? []) {
			const parentText = new Set(
				(paperQuestion.blocks ?? []).map((block) => normalizedBlockText(block)).filter(Boolean)
			);
			for (const part of paperQuestion.parts ?? []) {
				const source = questionById.get(part.questionId);
				if (!source) continue;
				part.stemBlocks = (part.stemBlocks ?? []).filter(
					(block) => !parentText.has(normalizedBlockText(block))
				);
				part.leadBlocks = removeDuplicateBlocks(part.leadBlocks ?? [], part.stemBlocks);
				part.blocks = [{ kind: 'paragraph', text: cleanPromptText(source.promptText) }];
				part.afterResponseBlocks = removeDuplicateBlocks(part.afterResponseBlocks ?? [], [
					...(part.stemBlocks ?? []),
					...(part.leadBlocks ?? []),
					...part.blocks
				]);
			}
		}

		await d1Query(
			`UPDATE public_route_payloads
			 SET payload_json = ?, source_version = ?, updated_at = CURRENT_TIMESTAMP
			 WHERE id = ?`,
			[encodePayload(decoded.value, decoded.compressed), new Date().toISOString(), row.id],
			{ rootDir }
		);
		updated += 1;
	}
	return updated;
}

async function patchScopedPersonalGapSnapshots(questions) {
	if (!questions.length) return 0;
	const questionIds = questions.map((question) => question.id);
	const publicRows = await d1Rows(
		`SELECT id, prompt_text, context_text, metadata_json
		 FROM questions
		 WHERE id IN (${questionIds.map(() => '?').join(', ')})`,
		questionIds,
		{ rootDir }
	);
	const publicById = new Map(publicRows.map((row) => [String(row.id), row]));
	const gapRows = await d1Rows(
		`SELECT id, source_question_id, source_metadata_json
		 FROM user_chain_gaps
		 WHERE source_question_id IN (${questionIds.map(() => '?').join(', ')})`,
		questionIds,
		{ rootDir, binding: personalBinding }
	);
	const statements = gapRows.map((gap) => {
		const question = publicById.get(String(gap.source_question_id));
		if (!question) {
			throw new Error(`Personal gap ${gap.id} points at a missing scoped public question.`);
		}
		const publicMetadata = parseJson(question.metadata_json, {});
		const title = firstText(publicMetadata.card_title, publicMetadata.title, question.id);
		const snapshotMetadata = {
			...parseJson(gap.source_metadata_json, {}),
			title
		};
		return {
			sql: `UPDATE user_chain_gaps
			      SET source_question_title = ?, source_prompt_text = ?,
			          source_context_text = ?, source_metadata_json = ?
			      WHERE id = ? AND source_question_id = ?`,
			params: [
				title,
				cleanPromptText(question.prompt_text),
				cleanPromptText(question.context_text),
				JSON.stringify(snapshotMetadata),
				gap.id,
				gap.source_question_id
			]
		};
	});
	await d1Batch(statements, { rootDir, binding: personalBinding });
	return statements.length;
}

function decodePayload(raw) {
	const parsed = JSON.parse(raw);
	if (parsed?.__qcPayloadEncoding === 'gzip-base64' && typeof parsed.data === 'string') {
		return {
			value: JSON.parse(gunzipSync(Buffer.from(parsed.data, 'base64')).toString('utf8')),
			compressed: true
		};
	}
	return { value: parsed, compressed: false };
}

function encodePayload(value, compressed) {
	const raw = JSON.stringify(value);
	if (!compressed) return raw;
	return JSON.stringify({
		__qcPayloadEncoding: 'gzip-base64',
		data: gzipSync(Buffer.from(raw)).toString('base64')
	});
}

function cleanPromptText(value) {
	return String(value ?? '')
		.replace(/^\s*\[\s*\d+(?:\.\d+)?\s*marks?\s*\]\s*$/gim, '')
		.split(/\r?\n/)
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.join(' ')
		.trim();
}

function normalizedBlockText(block) {
	return String(block?.text ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function removeDuplicateBlocks(blocks, previousBlocks) {
	const seen = new Set((previousBlocks ?? []).map(normalizedBlockText).filter(Boolean));
	return blocks.filter((block) => {
		const text = normalizedBlockText(block);
		if (!text || seen.has(text)) return false;
		seen.add(text);
		return true;
	});
}

function truncate(value, maxLength) {
	if (value.length <= maxLength) return value;
	const cut = value
		.slice(0, maxLength - 3)
		.replace(/\s+\S*$/, '')
		.trimEnd();
	return `${cut || value.slice(0, maxLength - 3)}...`;
}

function firstText(...values) {
	return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
}

function parseJson(value, fallback) {
	try {
		return JSON.parse(String(value ?? ''));
	} catch {
		return fallback;
	}
}

function questionSummary(question) {
	return {
		id: question.id,
		sourceDocumentId: question.source_document_id,
		sourceQuestionRef: question.source_question_ref,
		cardTitle: question.cardTitle,
		markSchemeItems: question.markSchemeItems.length,
		checklistItems: question.markChecklist.length
	};
}

function chainSummary(chain) {
	return {
		id: chain.id,
		canonicalChainText: chain.canonicalChainText,
		steps: chain.steps.map((step) => step.step_text)
	};
}
