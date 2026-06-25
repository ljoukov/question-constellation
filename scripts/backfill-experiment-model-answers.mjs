#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const wranglerPath = path.join(rootDir, 'wrangler.jsonc');
const DEFAULT_MODEL = 'chatgpt-gpt-5.5-fast';
const DEFAULT_THINKING_LEVEL = 'medium';
const experimentSourceDocumentIds = [
	'aqa-8464b1h-qp-jun18',
	'aqa-8464p1h-qp-jun18',
	'aqa-8464b1h-qp-jun19',
	'aqa-8464c1h-qp-nov21'
];

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const force = args.has('--force');
const noWrite = args.has('--no-write');
const batchSize = integerArg('batch-size', 5, 1);
const limit = optionalIntegerArg('limit', 1);
const model = stringArg('model', process.env.EXPERIMENT_MODEL_ANSWER_MODEL ?? DEFAULT_MODEL);
const thinkingLevel = stringArg(
	'thinking-level',
	process.env.EXPERIMENT_MODEL_ANSWER_THINKING_LEVEL ?? DEFAULT_THINKING_LEVEL
);
const outputPath = stringArg('output', '');
const inputPath = stringArg('input', '');

function integerArg(name, defaultValue, minValue) {
	const arg = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
	if (!arg) return defaultValue;
	const value = Number(arg.slice(name.length + 3));
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer greater than or equal to ${minValue}.`);
	}
	return value;
}

function optionalIntegerArg(name, minValue) {
	const arg = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
	if (!arg) return null;
	const value = Number(arg.slice(name.length + 3));
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer greater than or equal to ${minValue}.`);
	}
	return value;
}

function stringArg(name, defaultValue) {
	const arg = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
	return arg ? arg.slice(name.length + 3) : defaultValue;
}

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

function configureModelEnv() {
	process.env.CHATGPT_RESPONSES_WEBSOCKET_MODE = 'off';
	if (model.startsWith('gpt-')) {
		throw new Error('Use a chatgpt-* model to generate model answers.');
	}
}

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

function parseJson(raw, fallback) {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw);
	} catch {
		return fallback;
	}
}

function cleanExistingModelAnswer(text) {
	return String(text ?? '')
		.replace(/\b\d{1,2}\.\d+\b/g, '')
		.replace(/\bAO[123](?:\/\d+)?\b/gi, '')
		.replace(/\b\d(?:\.\d+){2,}\b/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function modelAnswerLooksClean(text) {
	const cleaned = cleanExistingModelAnswer(text);
	if (cleaned.length < 12) return false;
	return ![
		/^\d+(?:\.\d+)+$/,
		/\bAO[123]\b/i,
		/\bSpec\.?\s*Ref\b/i,
		/\bQuestion\s+Answers\s+Extra information\b/i,
		/\bA bold and is used\b/i,
		/\bAlternative answers acceptable\b/i,
		/\bMarking procedure\b/i,
		/\bMarking of lists\b/i,
		/\bInterpretation of ['"]?it['"]?\b/i,
		/\bErrors carried forward\b/i,
		/\ballow\b.*\bignore\b/i,
		/\b\d{1,2}\.\d+\s+.*\s+1\s+AO/i
	].some((pattern) => pattern.test(text));
}

function generatedAnswerLooksValid(text) {
	const trimmed = String(text ?? '').trim();
	if (!trimmed) return false;
	return ![
		/^\d+(?:\.\d+)+$/,
		/\bAO[123](?:\/\d+)?\b/i,
		/\bSpec\.?\s*Ref\b/i,
		/\bQuestion\s+Answers\s+Extra information\b/i,
		/\bA bold and is used\b/i,
		/\bAlternative answers acceptable\b/i,
		/\bMarking procedure\b/i,
		/\bMarking of lists\b/i,
		/\bInterpretation of ['"]?it['"]?\b/i,
		/\bErrors carried forward\b/i,
		/\bPhonetic spelling\b/i,
		/\bBrackets\b.*\bare used\b/i,
		/\bignore\b/i,
		/\breject\b/i,
		/\bdo not accept\b/i,
		/\b\d{1,2}\.\d+\s+.*\s+1\s+AO/i
	].some((pattern) => pattern.test(trimmed));
}

function sourceContext(question) {
	const render = parseJson(question.render_json, {});
	const blocks = [
		...(Array.isArray(render.stemBlocks) ? render.stemBlocks : []),
		...(Array.isArray(render.leadBlocks) ? render.leadBlocks : []),
		...(Array.isArray(render.promptBlocks) ? render.promptBlocks : [])
	]
		.map((block) => block?.text)
		.filter(Boolean);
	return [...new Set(blocks)].join('\n');
}

function questionPrompt(question) {
	return [
		question.context_text,
		question.self_contained_prompt_text,
		question.prompt_text,
		sourceContext(question)
	]
		.filter(Boolean)
		.join('\n')
		.replace(/\s+\n/g, '\n')
		.trim();
}

function buildGenerationPrompt(batch) {
	return [
		'Generate source-grounded model answers for GCSE Combined Science written-response questions.',
		'Only use the supplied question, mark scheme, checklist, and existing extracted answer fragments.',
		'Each model answer must be concise, student-facing, and sufficient for full marks.',
		'Do not include question numbers, AO codes, specification references, examiner instructions, mark counts, or standalone examiner guidance such as "allow", "ignore", "accept", or "reject".',
		'If the supplied mark scheme or checklist contains generic examiner guidance rather than the answer, ignore that guidance and answer the actual question from the prompt and GCSE science.',
		'Never return a specification reference such as "4.4.1.1" as a model answer.',
		'Do not write explanations about the marking process. Return only answer text.',
		'If the question is a method question, include the ordered practical steps needed for full marks.',
		'If the question asks for two or more points, include the required number of distinct points.',
		'Return valid JSON only, with this shape:',
		'{ "answers": [ { "questionId": string, "modelAnswer": string, "confidence": number } ] }',
		'',
		'QUESTIONS:',
		batch
			.map((question) =>
				[
					`QUESTION_ID: ${question.id}`,
					`REF: ${question.source_question_ref}`,
					`PAPER: ${question.source_document_id}`,
					`MARKS: ${question.marks ?? 0}`,
					`COMMAND: ${question.command_word ?? ''}`,
					`QUESTION:\n${questionPrompt(question)}`,
					question.markScheme.length
						? ['MARK_SCHEME:', ...question.markScheme.map((item) => `- ${item.text}`)].join('\n')
						: null,
					question.checklist.length
						? ['CHECKLIST:', ...question.checklist.map((item) => `- ${item.text}`)].join('\n')
						: null,
					question.existingAnswer
						? `EXISTING_EXTRACTED_ANSWER_FRAGMENT:\n${question.existingAnswer}`
						: null
				]
					.filter(Boolean)
					.join('\n')
			)
			.join('\n\n---\n\n')
	].join('\n');
}

function parseModelJson(rawText) {
	const trimmed = rawText.trim();
	try {
		return JSON.parse(trimmed);
	} catch {
		const start = trimmed.indexOf('{');
		const end = trimmed.lastIndexOf('}');
		if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
		throw new Error(`Model did not return JSON: ${trimmed.slice(0, 400)}`);
	}
}

function normalizeGeneratedAnswer(value) {
	return String(value ?? '')
		.replace(/\b\d{1,2}\.\d+\b/g, '')
		.replace(/\bAO[123](?:\/\d+)?\b/gi, '')
		.replace(/\b\d(?:\.\d+){2,}\b/g, '')
		.replace(/\s+/g, ' ')
		.replace(/^[;:\-\s]+|[;:\-\s]+$/g, '')
		.trim();
}

async function generateAnswers(batch) {
	const { streamText } = await import('@ljoukov/llm');
	const call = streamText({
		model,
		input: buildGenerationPrompt(batch),
		thinkingLevel,
		telemetry: false
	});
	let rawText = '';
	for await (const event of call.events) {
		if (event.type === 'delta' && event.channel === 'response') rawText += event.text;
	}
	const result = await call.result;
	const parsed = parseModelJson(rawText.trim() || result.text);
	const answers = Array.isArray(parsed.answers) ? parsed.answers : [];
	return new Map(
		answers
			.map((answer) => {
				const modelAnswer = normalizeGeneratedAnswer(answer.modelAnswer);
				if (!generatedAnswerLooksValid(modelAnswer)) {
					throw new Error(
						`Generated invalid model answer for ${answer.questionId}: ${modelAnswer}`
					);
				}
				return [
					answer.questionId,
					{
						modelAnswer,
						confidence:
							typeof answer.confidence === 'number'
								? Math.max(0, Math.min(1, answer.confidence))
								: 0.86
					}
				];
			})
			.filter(([, answer]) => answer.modelAnswer.length > 0)
	);
}

async function loadQuestions() {
	const documentPlaceholders = placeholders(experimentSourceDocumentIds.length);
	const questions = await d1Query(
		`SELECT q.id, q.source_document_id, q.source_question_ref, q.display_order,
		        q.prompt_text, q.self_contained_prompt_text, q.context_text, q.command_word, q.marks,
		        qro.render_json, ma.answer_text AS existing_answer
		 FROM questions q
		 JOIN question_rendering_overlays qro ON qro.question_id = q.id
		 LEFT JOIN model_answers ma ON ma.question_id = q.id
		 WHERE q.source_document_id IN (${documentPlaceholders})
		   AND json_extract(qro.render_json, '$.response.kind') IN ('lines', 'labeled-lines')
		   AND COALESCE(q.marks, 0) > 0
		 ORDER BY q.source_document_id, q.display_order, q.source_question_ref`,
		experimentSourceDocumentIds
	);
	const ids = questions.map((question) => question.id);
	if (ids.length === 0) return [];

	const markSchemeRows = await d1Query(
		`SELECT question_id, display_order, text
		 FROM mark_scheme_items
		 WHERE question_id IN (${placeholders(ids.length)})
		 ORDER BY question_id, display_order`,
		ids
	);
	const checklistRows = await d1Query(
		`SELECT question_id, display_order, text
		 FROM mark_checklist_items
		 WHERE question_id IN (${placeholders(ids.length)})
		 ORDER BY question_id, display_order`,
		ids
	);

	const markSchemeByQuestion = Map.groupBy(markSchemeRows, (row) => row.question_id);
	const checklistByQuestion = Map.groupBy(checklistRows, (row) => row.question_id);
	return questions.map((question) => ({
		...question,
		markScheme: markSchemeByQuestion.get(question.id) ?? [],
		checklist: checklistByQuestion.get(question.id) ?? [],
		existingAnswer: question.existing_answer ?? ''
	}));
}

async function upsertModelAnswer(question, generated) {
	await d1Query(
		`INSERT INTO model_answers (
		   id, question_id, answer_text, derivation, supporting_mark_scheme_item_ids_json,
		   confidence, needs_human_review, updated_at
		 ) VALUES (?, ?, ?, 'generated_from_mark_scheme', '[]', ?, 0, CURRENT_TIMESTAMP)
		 ON CONFLICT(id) DO UPDATE SET
		   answer_text = excluded.answer_text,
		   derivation = excluded.derivation,
		   confidence = excluded.confidence,
		   needs_human_review = excluded.needs_human_review,
		   updated_at = CURRENT_TIMESTAMP`,
		[`${question.id}-model-answer`, question.id, generated.modelAnswer, generated.confidence]
	);
}

function chunk(items, size) {
	const chunks = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

if (inputPath) {
	const input = JSON.parse(readFileSync(inputPath, 'utf8'));
	const records = Array.isArray(input.answers) ? input.answers : input;
	if (!Array.isArray(records)) {
		throw new Error(`Invalid model-answer input file: ${inputPath}`);
	}
	let completed = 0;
	for (const record of records) {
		if (!record.questionId || !record.answerText) {
			throw new Error(`Invalid model-answer record: ${JSON.stringify(record)}`);
		}
		if (!generatedAnswerLooksValid(record.answerText)) {
			throw new Error(`Invalid model answer for ${record.questionId}: ${record.answerText}`);
		}
		if (!noWrite && !dryRun) {
			await upsertModelAnswer(
				{ id: record.questionId },
				{
					modelAnswer: record.answerText,
					confidence:
						typeof record.confidence === 'number'
							? Math.max(0, Math.min(1, record.confidence))
							: 0.86
				}
			);
		}
		completed += 1;
		console.log(`model answers: ${completed}/${records.length} ${record.questionId}`);
	}
	process.exit(0);
}

configureModelEnv();

const allQuestions = await loadQuestions();
const targetQuestions = allQuestions
	.filter((question) => force || !modelAnswerLooksClean(question.existingAnswer))
	.slice(0, limit ?? undefined);

console.log(
	JSON.stringify(
		{
			model,
			thinkingLevel,
			freeTextQuestions: allQuestions.length,
			targetQuestions: targetQuestions.length,
			force,
			dryRun,
			noWrite,
			outputPath: outputPath || null
		},
		null,
		2
	)
);

if (dryRun || targetQuestions.length === 0) {
	process.exit(0);
}

let completed = 0;
const generatedRecords = [];
for (const batch of chunk(targetQuestions, batchSize)) {
	const generatedByQuestion = await generateAnswers(batch);
	for (const question of batch) {
		const generated = generatedByQuestion.get(question.id);
		if (!generated) {
			throw new Error(`Model did not return an answer for ${question.id}.`);
		}
		generatedRecords.push({
			questionId: question.id,
			sourceDocumentId: question.source_document_id,
			ref: question.source_question_ref,
			marks: question.marks,
			prompt: questionPrompt(question),
			modelAnswer: generated.modelAnswer,
			confidence: generated.confidence
		});
		if (!noWrite) {
			await upsertModelAnswer(question, generated);
		}
		completed += 1;
		console.log(
			`model answers: ${completed}/${targetQuestions.length} ${question.id} (${generated.modelAnswer.length} chars)`
		);
	}
}

if (outputPath) {
	writeFileSync(outputPath, `${JSON.stringify(generatedRecords, null, 2)}\n`);
}
