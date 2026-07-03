#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { blockingIssues, deterministicCandidateIssues } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const wranglerPath = path.join(rootDir, 'wrangler.jsonc');
const extractionRoot = path.resolve(
	rootDir,
	stringArg('input-root', 'data/vision-extracted/aqa-combined-science-trilogy-higher/physics')
);
const migrationPath = path.join(rootDir, 'migrations/0001_public_content.sql');

const args = new Set(process.argv.slice(2));
const paperArg = stringArg('paper', '');
const allPapers = args.has('--all');
const dryRun = args.has('--dry-run');
const checkExisting = args.has('--check-existing');
const allowSharedChainUpdates = args.has('--allow-shared-chain-updates');
const refreshSharedChainDefinitions = args.has('--refresh-shared-chain-definitions');
const applySchemaFlag = args.has('--apply-schema');
const recursive = args.has('--recursive');
const replaceAllSubject =
	args.has('--replace-all-subject') || args.has('--replace-all-physics') || allPapers;
const batchSize = integerArg('batch-size', 50, 1);
const maxSqlParams = 80;

if (!paperArg && !allPapers) {
	throw new Error('Pass --paper=<source_document_id> or --all.');
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function integerArg(name, defaultValue, minValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	if (!arg) return defaultValue;
	const value = Number(arg.slice(prefix.length));
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer >= ${minValue}.`);
	}
	return value;
}

function loadDotEnvFile(filePath) {
	if (!existsSync(filePath)) return;
	for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

const wranglerConfig = readWranglerConfig();
const databaseConfig = wranglerConfig.d1_databases?.find((db) => db.binding === 'QUESTION_DB');
const shouldQueryD1 = !dryRun || checkExisting;
const accountId = !shouldQueryD1
	? (process.env.CLOUDFLARE_ACCOUNT_ID ?? 'dry-run-account')
	: requiredEnv('CLOUDFLARE_ACCOUNT_ID');
const apiToken = !shouldQueryD1
	? (process.env.CLOUDFLARE_API_TOKEN ??
		process.env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN ??
		'dry-run-token')
	: requiredEnv('CLOUDFLARE_API_TOKEN', process.env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN ?? null);
const databaseId = !shouldQueryD1
	? (process.env.QUESTION_DB_DATABASE_ID ?? databaseConfig?.database_id ?? 'dry-run-database')
	: requiredEnv('QUESTION_DB_DATABASE_ID', databaseConfig?.database_id ?? null);
const d1QueryUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchD1WithRetry(options, label) {
	const maxAttempts = 4;
	let lastError = null;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			const response = await fetch(d1QueryUrl, options);
			if (response.status < 500 || attempt === maxAttempts) return response;
			lastError = new Error(`${label} failed with ${response.status} ${response.statusText}`);
		} catch (error) {
			lastError = error;
			if (attempt === maxAttempts) throw error;
		}
		await sleep(600 * attempt);
	}
	throw lastError ?? new Error(`${label} failed.`);
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function json(value, fallback) {
	return JSON.stringify(value ?? fallback);
}

function bool(value) {
	return value ? 1 : 0;
}

function slugify(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function shortHash(value) {
	return createHash('sha256')
		.update(String(value ?? ''))
		.digest('hex')
		.slice(0, 8);
}

function paramChunks(values) {
	const chunks = [];
	for (let index = 0; index < values.length; index += maxSqlParams) {
		chunks.push(values.slice(index, index + maxSqlParams));
	}
	return chunks;
}

function compareQuestionRefs(left, right) {
	const leftParts = String(left ?? '')
		.split('.')
		.map((part) => Number(part));
	const rightParts = String(right ?? '')
		.split('.')
		.map((part) => Number(part));
	const length = Math.max(leftParts.length, rightParts.length);
	for (let index = 0; index < length; index += 1) {
		const leftPart = leftParts[index] ?? -1;
		const rightPart = rightParts[index] ?? -1;
		if (leftPart !== rightPart) return leftPart - rightPart;
	}
	return String(left ?? '').localeCompare(String(right ?? ''));
}

function stableQuestionId(sourceDocumentId, sourceQuestionRef) {
	const paperSlug = sourceDocumentId.replace(/^aqa-/, '').replace('-qp-', '-');
	return `${paperSlug}-${slugify(sourceQuestionRef)}`;
}

function subjectAreaForPaper(paper) {
	return paper.sourceDocument?.subjectArea ?? paper.sourceDocument?.subject ?? 'Physics';
}

function subjectForPaper(paper) {
	return paper.sourceDocument?.subject ?? subjectAreaForPaper(paper);
}

function chainPrefixForSubject(subjectArea) {
	const slug = slugify(subjectArea || 'physics');
	if (slug === 'biology') return 'biology-chain';
	if (slug === 'chemistry') return 'chemistry-chain';
	if (slug === 'physics') return 'physics-chain';
	return `${slug}-chain`;
}

function normalizeTransferDistance(value) {
	const normalized = String(value ?? 'unclassified').replaceAll('-', '_');
	if (['start', 'near', 'stretch', 'exam_transfer', 'unclassified'].includes(normalized)) {
		return normalized;
	}
	return 'unclassified';
}

function correctAnswersObject(value) {
	if (!value) return null;
	const entries = [];
	if (Array.isArray(value)) {
		entries.push(
			...value
				.filter(
					(item) =>
						item &&
						typeof item.targetId === 'string' &&
						typeof item.correctAnswer === 'string' &&
						item.correctAnswer.trim()
				)
				.map((item) => [
					item.targetId,
					answerKeyValue(item.correctAnswer, item.aliases ?? item.acceptedAnswers ?? item.accepted)
				])
		);
	}
	if (!Array.isArray(value) && typeof value === 'object') {
		entries.push(
			...Object.entries(value)
				.map(([targetId, answer]) => [targetId, answerKeyValueFromRaw(answer)])
				.filter(([, answer]) => answer)
		);
	}
	if (entries.length === 0) return null;

	const answers = {};
	for (const [targetId, answer] of entries) {
		if (!answers[targetId]) {
			answers[targetId] = answer;
		} else if (Array.isArray(answers[targetId])) {
			answers[targetId].push(answer);
		} else if (typeof answers[targetId] === 'object' && !Array.isArray(answers[targetId])) {
			answers[targetId] = mergeAnswerKeyValues(answers[targetId], answer);
		} else if (typeof answer === 'object' && !Array.isArray(answer)) {
			answers[targetId] = mergeAnswerKeyValues(answerKeyValue(answers[targetId]), answer);
		} else {
			answers[targetId] = mergeAnswerKeyValues(answerKeyValue(answers[targetId]), answerKeyValue(answer));
		}
	}
	return answers;
}

function answerKeyValueFromRaw(value) {
	if (typeof value === 'string' || typeof value === 'number') return answerKeyValue(value);
	if (Array.isArray(value)) {
		return value
			.map(answerKeyValueFromRaw)
			.filter(Boolean)
			.reduce((merged, item) => mergeAnswerKeyValues(merged, item), null);
	}
	if (!value || typeof value !== 'object') return null;
	const answer = value.correctAnswer ?? value.answer ?? value.text ?? value.value;
	return answerKeyValue(answer, value.aliases ?? value.acceptedAnswers ?? value.accepted);
}

function answerKeyValue(answer, aliases = null) {
	const split = splitMachineAnswerAlternatives(answer);
	const canonical = split[0] ?? String(answer ?? '').trim();
	const combinedAliases = [...split.slice(1), ...aliasValues(aliases)].filter(
		(alias) => normalizedForExactMatch(alias) !== normalizedForExactMatch(canonical)
	);
	if (!canonical) return null;
	return combinedAliases.length
		? { correctAnswer: canonical, aliases: [...new Set(combinedAliases)] }
		: canonical;
}

function mergeAnswerKeyValues(left, right) {
	const leftObject = answerKeyObject(left);
	const rightObject = answerKeyObject(right);
	if (!leftObject) return rightObject;
	if (!rightObject) return leftObject;
	return {
		correctAnswer: leftObject.correctAnswer,
		aliases: [
			...new Set(
				[
					...(leftObject.aliases ?? []),
					rightObject.correctAnswer,
					...(rightObject.aliases ?? [])
				].filter(
					(alias) => normalizedForExactMatch(alias) !== normalizedForExactMatch(leftObject.correctAnswer)
				)
			)
		]
	};
}

function answerKeyObject(value) {
	if (!value) return null;
	if (typeof value === 'string' || typeof value === 'number') {
		return { correctAnswer: String(value).trim(), aliases: [] };
	}
	if (typeof value !== 'object' || Array.isArray(value)) return null;
	const correctAnswer = String(value.correctAnswer ?? value.answer ?? value.value ?? '').trim();
	return correctAnswer ? { correctAnswer, aliases: aliasValues(value.aliases) } : null;
}

function aliasValues(value) {
	if (typeof value === 'string') {
		return value
			.split(/\s*(?:\||;|\n)\s*/)
			.map((alias) => alias.trim())
			.filter(Boolean);
	}
	if (!Array.isArray(value)) return [];
	return value
		.map((alias) => (typeof alias === 'string' || typeof alias === 'number' ? String(alias).trim() : ''))
		.filter(Boolean);
}

function splitMachineAnswerAlternatives(value) {
	const text = String(value ?? '').trim();
	if (!text) return [];
	const parts = text
		.split(/\s+\bor\b\s+|\s+\|\s+/i)
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts.length < 2) return [text];
	if (parts.some((part) => part.length > 24 || /\b(?:allow|accept|ignore|reject)\b/i.test(part))) {
		return [text];
	}
	return parts;
}

function normalizedForExactMatch(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9.+-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function unorderedGroupsArray(value) {
	if (!Array.isArray(value)) return [];
	return value
		.map((group) => {
			if (!group || typeof group !== 'object') return null;
			const targetIds = Array.isArray(group.targetIds)
				? group.targetIds.filter((item) => typeof item === 'string' && item.trim())
				: [];
			const answers = Array.isArray(group.answers)
				? group.answers.filter((item) => typeof item === 'string' && item.trim())
				: [];
			if (targetIds.length < 2 || answers.length < 2) return null;
			return { targetIds, answers };
		})
		.filter(Boolean);
}

async function d1Query(sql, params = []) {
	const response = await fetchD1WithRetry(
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({ sql, params })
		},
		'D1 query'
	);
	const bodyText = await response.text();
	if (!response.ok) {
		throw new Error(`D1 query failed: ${response.status} ${response.statusText}: ${bodyText}`);
	}
	const body = JSON.parse(bodyText);
	if (!body.success) throw new Error(`D1 query failed: ${JSON.stringify(body.errors ?? body)}`);
	const result = Array.isArray(body.result) ? body.result[0] : body.result;
	if (result?.success === false) throw new Error(`D1 statement failed: ${JSON.stringify(result)}`);
	return result?.results ?? [];
}

async function executeBatch(statements, label) {
	if (dryRun) {
		console.log(`${label}: dry run, ${statements.length} statements`);
		return;
	}
	for (let index = 0; index < statements.length; index += batchSize) {
		const chunk = statements.slice(index, index + batchSize);
		const response = await fetchD1WithRetry(
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiToken}`,
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({ batch: chunk })
			},
			label
		);
		const bodyText = await response.text();
		if (!response.ok) {
			throw new Error(`${label} failed: ${response.status} ${response.statusText}: ${bodyText}`);
		}
		const body = JSON.parse(bodyText);
		if (!body.success) throw new Error(`${label} failed: ${JSON.stringify(body.errors ?? body)}`);
		for (const result of body.result ?? []) {
			if (result?.success === false) {
				throw new Error(`${label} statement failed: ${JSON.stringify(result)}`);
			}
		}
		console.log(
			`${label}: ${Math.min(index + chunk.length, statements.length)}/${statements.length}`
		);
	}
}

function splitSqlStatements(sql) {
	const statements = [];
	let current = '';
	let inSingle = false;
	let inDouble = false;
	for (let index = 0; index < sql.length; index += 1) {
		const char = sql[index];
		const next = sql[index + 1];
		if (char === "'" && !inDouble) {
			current += char;
			if (inSingle && next === "'") {
				current += next;
				index += 1;
			} else {
				inSingle = !inSingle;
			}
			continue;
		}
		if (char === '"' && !inSingle) inDouble = !inDouble;
		if (char === ';' && !inSingle && !inDouble) {
			const statement = current.trim();
			if (statement) statements.push(statement);
			current = '';
			continue;
		}
		current += char;
	}
	const statement = current.trim();
	if (statement) statements.push(statement);
	return statements;
}

async function applySchema() {
	const sql = readFileSync(migrationPath, 'utf8');
	await executeBatch(
		splitSqlStatements(sql).map((statement) => ({ sql: statement })),
		'schema'
	);
}

function insertStatement(table, columns, values) {
	const placeholders = columns.map(() => '?').join(', ');
	return {
		sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
		params: values
	};
}

function upsertStatement(table, columns, values, conflictColumn = 'id') {
	const placeholders = columns.map(() => '?').join(', ');
	const updates = columns
		.filter((column) => column !== conflictColumn)
		.map((column) => `${column}=excluded.${column}`)
		.join(', ');
	return {
		sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${conflictColumn}) DO UPDATE SET ${updates}`,
		params: values
	};
}

function sourceDocumentStatement(doc) {
	return upsertStatement(
		'source_documents',
		[
			'id',
			'doc_type',
			'board',
			'qualification',
			'subject',
			'subject_area',
			'tier',
			'paper',
			'component_code',
			'series',
			'year',
			'title',
			'source_url',
			'file_path',
			'file_hash',
			'page_count',
			'metadata_json'
		],
		[
			doc.id,
			doc.docType,
			doc.board ?? 'AQA',
			doc.qualification ?? 'GCSE',
			doc.subject ?? doc.subjectArea ?? null,
			doc.subjectArea ?? doc.subject ?? null,
			doc.tier ?? 'Higher',
			doc.paper ?? null,
			doc.componentCode ?? null,
			doc.series ?? null,
			doc.year ?? null,
			doc.title ?? null,
			doc.sourceUrl ?? null,
			doc.filePath ?? null,
			doc.fileHash ?? null,
			doc.pageCount ?? null,
			json(doc.metadata, {})
		]
	);
}

function normalizeBlock(block, assetIdsByLabel, reviewNotes) {
	const kind = block?.kind;
	if (kind === 'paragraph' && block.text) return { kind: 'paragraph', text: block.text };
	if (kind === 'equation' && block.text) return { kind: 'equation', text: block.text };
	if (kind === 'ordered-list') return { kind: 'ordered-list', items: block.items ?? [] };
	if (kind === 'bullet-list') return { kind: 'bullet-list', items: block.items ?? [] };
	if (kind === 'key') return { kind: 'key', items: normalizedKeyItems(block, reviewNotes) };
	if (kind === 'table') {
		const columns = Array.isArray(block.columns)
			? block.columns.map((cell) => String(cell ?? ''))
			: [];
		if (columns.length === 0) {
			return {
				kind: 'structured-table',
				label: block.label ?? undefined,
				rows: structuredTableRows(block.rows),
				compact: block.compact === true,
				wide: block.wide === true
			};
		}
		return {
			kind: 'table',
			label: block.label ?? undefined,
			columns,
			rows: plainTableRows(block.rows),
			compact: block.compact === true
		};
	}
	if (kind === 'structured-table') {
		if (Array.isArray(block.columns) && block.columns.length > 0) {
			return {
				kind: 'table',
				label: block.label ?? undefined,
				columns: block.columns.map((cell) => String(cell ?? '')),
				rows: plainTableRows(block.rows),
				compact: block.compact === true
			};
		}
		return {
			kind: 'structured-table',
			label: block.label ?? undefined,
			rows: structuredTableRows(block.rows),
			compact: block.compact === true,
			wide: block.wide === true
		};
	}
	if (kind === 'figure') {
		const label = block.assetLabel ?? block.label;
		const visibleLabel = block.label ?? label;
		const assetId =
			assetIdsByLabel.get(String(label ?? '').toLowerCase()) ??
			assetIdsByLabel.get(String(visibleLabel ?? '').toLowerCase());
		if (!assetId) {
			reviewNotes.push(`Missing asset mapping for ${label ?? 'unlabelled figure'}.`);
			return {
				kind: 'figure',
				assetId: `missing-${slugify(label ?? 'figure')}`,
				label: label ?? 'Figure'
			};
		}
		return { kind: 'figure', assetId, label: visibleLabel ?? undefined };
	}
	return null;
}

function plainTableRows(rows) {
	return Array.isArray(rows)
		? rows.filter((row) => Array.isArray(row)).map((row) => row.map((cell) => String(cell ?? '')))
		: [];
}

function structuredTableRows(rows) {
	return Array.isArray(rows)
		? rows
				.filter((row) => Array.isArray(row))
				.map((row) =>
					row.map((cell) => {
						if (cell && typeof cell === 'object' && typeof cell.text === 'string') return cell;
						return { text: String(cell ?? '') };
					})
				)
		: [];
}

function normalizedKeyItems(block, reviewNotes) {
	const rawItems = Array.isArray(block.keyItems)
		? block.keyItems
		: Array.isArray(block.items)
			? block.items
			: [];
	const items = [];
	for (const [index, item] of rawItems.entries()) {
		if (typeof item === 'string') {
			const text = item.trim();
			if (text) items.push({ marker: String(items.length + 1), text });
			continue;
		}
		if (!item || typeof item !== 'object') continue;
		const marker = String(item.marker ?? item.term ?? item.label ?? item.key ?? '').trim();
		const text = String(item.text ?? item.definition ?? item.value ?? item.answer ?? '').trim();
		if (marker && text) {
			items.push({ marker, text });
			continue;
		}
		if (text) {
			items.push({ marker: String(items.length + 1), text });
			continue;
		}
		reviewNotes.push(`Dropped malformed key item ${index + 1}.`);
	}
	return items;
}

function compactBlockList(blocks, assetIdsByLabel, reviewNotes) {
	return (blocks ?? [])
		.map((block) => normalizeBlock(block, assetIdsByLabel, reviewNotes))
		.filter(Boolean);
}

function normalizedBankText(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

function responseBankItems(response) {
	if (response.kind === 'image-label-zones') return response.labels ?? [];
	if (response.kind === 'choice') return response.options ?? response.choiceOptions ?? [];
	if (response.kind === 'matching') return [...(response.left ?? []), ...(response.right ?? [])];
	if (response.kind === 'asset-canvas') return response.labelBank ?? [];
	return [];
}

function sameTextSet(left, right) {
	const normalizedLeft = left.map(normalizedBankText).filter(Boolean).sort();
	const normalizedRight = right.map(normalizedBankText).filter(Boolean).sort();
	return (
		normalizedLeft.length > 0 &&
		normalizedLeft.length === normalizedRight.length &&
		normalizedLeft.every((item, index) => item === normalizedRight[index])
	);
}

function removeRedundantResponseBankBlocks(blocks, response) {
	const bank = responseBankItems(response);
	if (bank.length === 0) return blocks;
	return blocks.filter((block) => {
		if (block.kind === 'key')
			return !sameTextSet(
				block.items.map((item) => item.text),
				bank
			);
		if (block.kind === 'bullet-list' || block.kind === 'ordered-list') {
			return !sameTextSet(block.items, bank);
		}
		return true;
	});
}

function fallbackDigitalLineCount(marks) {
	const numericMarks = Number(marks);
	if (!Number.isFinite(numericMarks) || numericMarks < 1) return 1;
	if (numericMarks >= 40) return 16;
	if (numericMarks >= 20) return 10;
	return Math.min(8, Math.max(1, Math.ceil(numericMarks / 2)));
}

function positiveLineCount(response, marks) {
	const count = Number(response.count ?? response.lineCount);
	if (Number.isFinite(count) && count >= 1) return count;
	return fallbackDigitalLineCount(marks);
}

function normalizeResponse(response, assetIdsByLabel, reviewNotes, question = null) {
	if (!response?.kind) return { kind: 'none' };
	const correctAnswers = correctAnswersObject(response.correctAnswers);
	if (response.kind === 'lines')
		return { kind: 'lines', count: positiveLineCount(response, question?.marks) };
	if (response.kind === 'labeled-lines') {
		return {
			kind: 'labeled-lines',
			labels:
				response.labels ??
				(response.fields ?? [])
					.map((field) => field?.label)
					.filter((label) => typeof label === 'string' && label.trim()),
			fields: Array.isArray(response.fields)
				? response.fields
						.filter((field) => field?.label)
						.map((field) => ({
							label: String(field.label),
							...(Number.isFinite(Number(field.lineCount))
								? { lineCount: Number(field.lineCount) }
								: {})
						}))
				: undefined,
			lineCount: response.lineCount ?? undefined,
			...(response.choicePrompt ? { choicePrompt: response.choicePrompt } : {}),
			...(Array.isArray(response.choiceOptions) && response.choiceOptions.length
				? { choiceOptions: response.choiceOptions }
				: {}),
			...(response.choiceLayout ? { choiceLayout: response.choiceLayout } : {}),
			...(correctAnswers ? { correctAnswers } : {})
		};
	}
	if (response.kind === 'number-line') {
		return {
			kind: 'number-line',
			label: response.label ?? '',
			prefix: response.prefix ?? undefined,
			unit: response.unit ?? undefined,
			...(correctAnswers ? { correctAnswers } : {})
		};
	}
	if (response.kind === 'choice') {
		return {
			kind: 'choice',
			options: response.options ?? response.choiceOptions ?? [],
			layout: response.layout ?? 'vertical',
			...(response.maxSelections && response.maxSelections > 1
				? { maxSelections: response.maxSelections }
				: {}),
			...(correctAnswers ? { correctAnswers } : {})
		};
	}
	if (response.kind === 'choice-table') {
		return {
			kind: 'choice-table',
			columns: response.columns ?? [],
			rows: response.rows ?? [],
			...(correctAnswers ? { correctAnswers } : {})
		};
	}
	if (response.kind === 'matching') {
		return {
			kind: 'matching',
			leftTitle: response.leftTitle ?? null,
			rightTitle: response.rightTitle ?? null,
			left: response.left ?? [],
			right: response.right ?? [],
			...(correctAnswers ? { correctAnswers } : {})
		};
	}
	if (response.kind === 'equation-blanks') {
		const unorderedGroups = unorderedGroupsArray(response.unorderedGroups);
		return {
			kind: 'equation-blanks',
			segments: (response.segments ?? []).map((segment) => ({
				kind: segment.kind,
				...(segment.text ? { text: segment.text } : {}),
				...(segment.id ? { id: segment.id } : {}),
				...(segment.label ? { label: segment.label } : {}),
				...(segment.width ? { width: segment.width } : {})
			})),
			...(unorderedGroups.length ? { unorderedGroups } : {}),
			...(correctAnswers ? { correctAnswers } : {})
		};
	}
	if (response.kind === 'asset-canvas' || response.kind === 'image-label-zones') {
		const assetId = assetIdsByLabel.get(String(response.assetLabel ?? '').toLowerCase());
		if (!assetId) reviewNotes.push(`Missing response asset mapping for ${response.assetLabel}.`);
		if (response.kind === 'asset-canvas') {
			return {
				kind: 'asset-canvas',
				assetId: assetId ?? `missing-${slugify(response.assetLabel ?? 'asset')}`,
				labelBank: response.labelBank ?? undefined
			};
		}
		return {
			kind: 'image-label-zones',
			assetId: assetId ?? `missing-${slugify(response.assetLabel ?? 'asset')}`,
			labels: response.labels ?? response.labelBank ?? [],
			zones: response.zones ?? [],
			allowRepeats: response.allowRepeats === true,
			...(correctAnswers ? { correctAnswers } : {})
		};
	}
	if (response.kind === 'drawing-box') {
		const grid = drawingBoxGrid(response.grid);
		const width = response.width ?? 420;
		return {
			kind: 'drawing-box',
			label: response.label ?? 'Drawing answer',
			width,
			height:
				response.height ??
				(grid ? Math.max(120, Math.round((width * grid.rows) / grid.columns)) : 180),
			...(grid ? { grid } : {}),
			...(Array.isArray(response.rowLabels) ? { rowLabels: response.rowLabels } : {}),
			...(Array.isArray(response.columnLabels)
				? { columnLabels: response.columnLabels }
				: {})
		};
	}
	return { kind: 'none' };
}

function drawingBoxGrid(value) {
	const rows = Number(value?.rows);
	const columns = Number(value?.columns);
	if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1) {
		return null;
	}
	return { rows, columns };
}

function nonEmptyString(value) {
	const text = String(value ?? '').trim();
	return text ? text : null;
}

function localAssetFileName(asset, filePath) {
	const explicit = nonEmptyString(asset.localAssetFileName ?? asset.fileName);
	if (explicit) return path.basename(explicit);
	if (!filePath || /^[a-z][a-z0-9+.-]*:/i.test(String(filePath))) return null;
	const baseName = path.basename(String(filePath));
	return baseName && baseName !== '.' ? baseName : null;
}

function assetDeliveryPaths(asset, sourceDocumentId, filePath) {
	const r2Key = nonEmptyString(asset.r2Key ?? asset.r2_key);
	const publicPath = nonEmptyString(asset.publicPath ?? asset.public_path);
	if (r2Key || publicPath) return { r2Key, publicPath };
	const fileName = localAssetFileName(asset, filePath);
	if (!fileName) return { r2Key: null, publicPath: null };
	return {
		r2Key: `images/papers/${sourceDocumentId}/${fileName}`,
		publicPath: `/images/papers/${sourceDocumentId}/${fileName}`
	};
}

function assetStatements(question, questionId, sourceDocumentId) {
	const statements = [];
	const assetIdsByLabel = new Map();
	for (const [index, asset] of (question.assets ?? []).entries()) {
		const label = asset.sourceLabel || `Asset ${index + 1}`;
		const id = `${questionId}-asset-${slugify(label) || index + 1}`;
		const localFileName = asset.localAssetFileName;
		const filePath =
			asset.filePath ??
			(localFileName
				? `data/aqa-combined-science-trilogy-higher/assets/question-papers/${sourceDocumentId}/${localFileName}`
				: null);
		const delivery = assetDeliveryPaths(asset, sourceDocumentId, filePath);
		if (delivery.r2Key || delivery.publicPath) assetIdsByLabel.set(label.toLowerCase(), id);
		statements.push(
			insertStatement(
				'question_assets',
				[
					'id',
					'question_id',
					'asset_type',
					'source_label',
					'required',
					'role',
					'page_number',
					'bbox_json',
					'alt_text',
					'extracted_text',
					'file_path',
					'r2_key',
					'public_path',
					'extraction_confidence',
					'needs_human_review',
					'metadata_json'
				],
				[
					id,
					questionId,
					asset.assetType ?? 'diagram',
					label,
					bool(asset.required ?? true),
					asset.role ?? 'context',
					asset.pageNumber ?? null,
					null,
					asset.altText ?? label,
					null,
					filePath,
					delivery.r2Key,
					delivery.publicPath,
					asset.needsHumanReview ? 0.72 : 0.9,
					bool(asset.needsHumanReview),
					json(
						{
							provenance: 'llm-vision-extracted',
							review_notes: asset.reviewNotes ?? []
						},
						{}
					)
				]
			)
		);
	}
	return { statements, assetIdsByLabel };
}

function responseAnswerKeyOrder(response, targetId, fallbackOrder) {
	if (response.kind === 'matching') {
		const index = (response.left ?? []).findIndex((item) => item === targetId);
		return index >= 0 ? index + 1 : fallbackOrder;
	}
	if (response.kind === 'equation-blanks') {
		const index = (response.segments ?? []).findIndex(
			(segment) => segment.kind === 'blank' && segment.id === targetId
		);
		return index >= 0 ? index + 1 : fallbackOrder;
	}
	if (response.kind === 'image-label-zones') {
		const index = (response.zones ?? []).findIndex((zone) => zone.id === targetId);
		return index >= 0 ? index + 1 : fallbackOrder;
	}
	return targetId === 'answer' && fallbackOrder === 1 ? 1 : fallbackOrder;
}

function responseAnswerKeyStatements(questionId, response) {
	if (!response.correctAnswers || typeof response.correctAnswers !== 'object') return [];
	const rows = [];
	for (const [targetId, rawAnswers] of Object.entries(response.correctAnswers)) {
		const answers = Array.isArray(rawAnswers) ? rawAnswers : [rawAnswers];
		for (const rawAnswer of answers) {
			const parsed = answerKeyObject(rawAnswer);
			if (!parsed?.correctAnswer) continue;
			rows.push({
				targetId,
				answer: parsed.correctAnswer,
				aliases: parsed.aliases ?? []
			});
		}
	}
	const targetCounts = new Map();
	for (const row of rows) {
		targetCounts.set(row.targetId, (targetCounts.get(row.targetId) ?? 0) + 1);
	}
	const seenTargets = new Map();
	return rows.map(({ targetId, answer, aliases }, index) => {
		const seenCount = (seenTargets.get(targetId) ?? 0) + 1;
		seenTargets.set(targetId, seenCount);
		const storedTargetId = targetCounts.get(targetId) > 1 ? `${targetId}-${seenCount}` : targetId;
		return insertStatement(
			'question_response_answer_keys',
			[
				'id',
				'question_id',
				'response_kind',
				'target_id',
				'correct_answer',
				'display_order',
				'aliases_json',
				'metadata_json'
			],
			[
				`${questionId}-response-key-${slugify(storedTargetId)}`,
				questionId,
				response.kind,
				storedTargetId,
				answer,
				responseAnswerKeyOrder(response, targetId, index + 1),
				json(aliases, []),
				json({ source: 'llm-vision-extracted' }, {})
			]
		);
	});
}

function validateRendererBlock(block, location, availableAssetIds) {
	const issues = [];
	if (block.kind === 'paragraph' || block.kind === 'equation') {
		if (typeof block.text !== 'string') issues.push(`${location} text must be a string`);
		return issues;
	}
	if (block.kind === 'figure') {
		if (typeof block.assetId !== 'string') {
			issues.push(`${location} figure assetId must be a string`);
		} else if (!availableAssetIds.has(block.assetId)) {
			issues.push(`${location} references unavailable asset ${block.assetId}`);
		}
		return issues;
	}
	if (block.kind === 'table') {
		if (!Array.isArray(block.columns) || !block.columns.every((cell) => typeof cell === 'string')) {
			issues.push(`${location} table columns must be strings`);
		}
		if (
			!Array.isArray(block.rows) ||
			!block.rows.every(
				(row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string')
			)
		) {
			issues.push(`${location} table rows must be string arrays`);
		}
		return issues;
	}
	if (block.kind === 'structured-table') {
		if (
			!Array.isArray(block.rows) ||
			!block.rows.every(
				(row) =>
					Array.isArray(row) &&
					row.every((cell) => cell && typeof cell === 'object' && typeof cell.text === 'string')
			)
		) {
			issues.push(`${location} structured-table rows must contain text cell objects`);
		}
		return issues;
	}
	if (block.kind === 'ordered-list' || block.kind === 'bullet-list') {
		if (!Array.isArray(block.items) || !block.items.every((item) => typeof item === 'string')) {
			issues.push(`${location} list items must be strings`);
		}
		return issues;
	}
	if (block.kind === 'key') {
		if (
			!Array.isArray(block.items) ||
			!block.items.every(
				(item) =>
					item &&
					typeof item === 'object' &&
					typeof item.marker === 'string' &&
					typeof item.text === 'string'
			)
		) {
			issues.push(`${location} key items must have marker and text`);
		}
		return issues;
	}
	issues.push(`${location} has unsupported block kind ${block.kind ?? 'missing'}`);
	return issues;
}

function validateRendererResponse(response, location, availableAssetIds) {
	const issues = [];
	if (response.kind === 'none') return issues;
	if (response.kind === 'lines') {
		if (typeof response.count !== 'number' || response.count < 1) {
			issues.push(`${location} lines response needs a positive count`);
		}
		return issues;
	}
	if (response.kind === 'labeled-lines') {
		if (
			!Array.isArray(response.labels) ||
			!response.labels.every((label) => typeof label === 'string')
		) {
			issues.push(`${location} labeled-lines labels must be strings`);
		}
		return issues;
	}
	if (response.kind === 'number-line') {
		if (typeof response.label !== 'string')
			issues.push(`${location} number-line label must be a string`);
		return issues;
	}
	if (response.kind === 'choice') {
		if (
			!Array.isArray(response.options) ||
			!response.options.every((option) => typeof option === 'string')
		) {
			issues.push(`${location} choice options must be strings`);
		}
		return issues;
	}
	if (response.kind === 'choice-table') {
		if (
			!Array.isArray(response.columns) ||
			!response.columns.every((column) => typeof column === 'string')
		) {
			issues.push(`${location} choice-table columns must be strings`);
		}
		if (
			!Array.isArray(response.rows) ||
			!response.rows.every(
				(row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string')
			)
		) {
			issues.push(`${location} choice-table rows must be string arrays`);
		}
		return issues;
	}
	if (response.kind === 'matching') {
		if (!Array.isArray(response.left) || !response.left.every((item) => typeof item === 'string')) {
			issues.push(`${location} matching left values must be strings`);
		}
		if (
			!Array.isArray(response.right) ||
			!response.right.every((item) => typeof item === 'string')
		) {
			issues.push(`${location} matching right values must be strings`);
		}
		return issues;
	}
	if (response.kind === 'equation-blanks') {
		if (!Array.isArray(response.segments))
			issues.push(`${location} equation-blanks segments must be an array`);
		return issues;
	}
	if (response.kind === 'asset-canvas') {
		if (typeof response.assetId !== 'string') {
			issues.push(`${location} asset-canvas assetId must be a string`);
		} else if (!availableAssetIds.has(response.assetId)) {
			issues.push(`${location} references unavailable asset ${response.assetId}`);
		}
		return issues;
	}
	if (response.kind === 'drawing-box') {
		const grid = drawingBoxGrid(response.grid);
		if (response.grid && !grid) {
			issues.push(`${location} drawing-box grid must have positive integer rows and columns`);
		}
		if (grid && Array.isArray(response.rowLabels) && response.rowLabels.length !== grid.rows) {
			issues.push(`${location} drawing-box rowLabels must match grid.rows`);
		}
		if (
			grid &&
			Array.isArray(response.columnLabels) &&
			response.columnLabels.length !== grid.columns
		) {
			issues.push(`${location} drawing-box columnLabels must match grid.columns`);
		}
		return issues;
	}
	if (response.kind === 'image-label-zones') {
		if (typeof response.assetId !== 'string') {
			issues.push(`${location} image-label-zones assetId must be a string`);
		} else if (!availableAssetIds.has(response.assetId)) {
			issues.push(`${location} references unavailable asset ${response.assetId}`);
		}
		if (!Array.isArray(response.labels) || response.labels.length === 0) {
			issues.push(`${location} image-label-zones needs at least one label`);
		}
		if (!Array.isArray(response.zones) || response.zones.length === 0) {
			issues.push(`${location} image-label-zones needs at least one target zone`);
		}
		return issues;
	}
	issues.push(`${location} has unsupported response kind ${response.kind ?? 'missing'}`);
	return issues;
}

function validateRenderJsonForApp(renderJson, question, availableAssetIds) {
	const issues = [];
	for (const section of ['stemBlocks', 'leadBlocks', 'promptBlocks', 'afterResponseBlocks']) {
		const blocks = renderJson[section];
		if (!Array.isArray(blocks)) {
			issues.push(`${section} must be an array`);
			continue;
		}
		for (const [index, block] of blocks.entries()) {
			issues.push(...validateRendererBlock(block, `${section}[${index}]`, availableAssetIds));
		}
	}
	issues.push(...validateRendererResponse(renderJson.response, 'response', availableAssetIds));
	if (issues.length) {
		throw new Error(
			`Question ${question.sourceQuestionRef} produces app-incompatible render_json: ${issues.join('; ')}`
		);
	}
}

function chainIdFor(answerChain, subjectArea = null) {
	if (answerChain.id) return answerChain.id;
	const base = slugify(answerChain.title || answerChain.canonicalChainText).slice(0, 70);
	return `${chainPrefixForSubject(subjectArea)}-${base}-${shortHash(answerChain.canonicalChainText)}`;
}

function addQuestionStatements(statements, paper, question, chainUseCount, options = {}) {
	const sourceDocumentId = paper.sourceDocument.id;
	const subjectArea = subjectAreaForPaper(paper);
	const subject = subjectForPaper(paper);
	const questionId = question.id || stableQuestionId(sourceDocumentId, question.sourceQuestionRef);
	const reviewNotes = [...(question.reviewNotes ?? [])];
	const { statements: assetRows, assetIdsByLabel } = assetStatements(
		question,
		questionId,
		sourceDocumentId
	);
	statements.push(
		insertStatement(
			'questions',
			[
				'id',
				'source_document_id',
				'parent_source_question_ref',
				'source_question_ref',
				'slug',
				'display_order',
				'prompt_text',
				'self_contained_prompt_text',
				'context_text',
				'command_word',
				'marks',
				'board',
				'qualification',
				'subject',
				'subject_area',
				'tier',
				'paper',
				'component_code',
				'series',
				'year',
				'topic_path_json',
				'spec_ref',
				'page_start',
				'page_end',
				'answer_format',
				'source_constraints_json',
				'self_containment_json',
				'extraction_confidence',
				'needs_human_review',
				'review_notes_json',
				'status',
				'metadata_json'
			],
			[
				questionId,
				sourceDocumentId,
				question.parentSourceQuestionRef ?? null,
				question.sourceQuestionRef,
				questionId,
				question.displayOrder,
				question.promptText,
				question.selfContainedPromptText ?? null,
				question.contextText ?? null,
				question.commandWord ?? null,
				question.marks ?? null,
				paper.sourceDocument.board ?? 'AQA',
				paper.sourceDocument.qualification ?? 'GCSE',
				subject,
				subjectArea,
				paper.sourceDocument.tier ?? 'Higher',
				paper.sourceDocument.paper ?? null,
				paper.sourceDocument.componentCode ?? null,
				paper.sourceDocument.series ?? null,
				paper.sourceDocument.year ?? null,
				json(question.topicPath, []),
				question.specRef ?? null,
				question.pageStart ?? null,
				question.pageEnd ?? null,
				question.response?.kind ?? null,
				json([], []),
				json(
					{
						status: question.selfContainedPromptText ? 'self_contained' : 'contextual',
						required_asset_labels: (question.assets ?? []).map((asset) => asset.sourceLabel)
					},
					{}
				),
				question.extractionConfidence ?? null,
				bool(question.needsHumanReview),
				json(reviewNotes, []),
				question.needsHumanReview ? 'draft' : 'published',
				json(
					{
						source: 'llm-vision-extracted',
						visual_review_required: question.needsHumanReview,
						parent_source_question_ref: question.parentSourceQuestionRef ?? null
					},
					{}
				)
			]
		),
		...assetRows
	);

	const response = normalizeResponse(question.response, assetIdsByLabel, reviewNotes, question);
	const stemBlocks = compactBlockList(question.stemBlocks, assetIdsByLabel, reviewNotes);
	const leadBlocks = compactBlockList(question.leadBlocks, assetIdsByLabel, reviewNotes);
	const promptBlocks = removeRedundantResponseBankBlocks(
		compactBlockList(question.promptBlocks, assetIdsByLabel, reviewNotes),
		response
	);
	const afterResponseBlocks = compactBlockList(
		question.afterResponseBlocks,
		assetIdsByLabel,
		reviewNotes
	);
	const renderJson = {
		version: 'v3',
		provenance: 'vision-extracted',
		stemBlocks,
		leadBlocks,
		promptBlocks,
		response,
		afterResponseBlocks,
		assets: (question.assets ?? []).map((asset) => ({
			sourceLabel: asset.sourceLabel,
			publicPath: asset.publicPath,
			required: asset.required,
			role: asset.role
		})),
		layout: {
			paperTextPx: 15,
			sourcePageStart: question.pageStart ?? null,
			sourcePageEnd: question.pageEnd ?? null
		},
		metadata: {
			source: 'llm-vision-original-pdf-page-images',
			review_notes: reviewNotes
		}
	};
	validateRenderJsonForApp(renderJson, question, new Set(assetIdsByLabel.values()));
	statements.push(
		insertStatement(
			'question_rendering_overlays',
			[
				'id',
				'question_id',
				'source_document_id',
				'source_question_ref',
				'overlay_version',
				'provenance',
				'confidence',
				'needs_human_review',
				'render_json'
			],
			[
				`${questionId}-render-v3`,
				questionId,
				sourceDocumentId,
				question.sourceQuestionRef,
				'v3',
				'vision-extracted',
				question.extractionConfidence ?? null,
				bool(question.needsHumanReview || reviewNotes.length > (question.reviewNotes ?? []).length),
				json(renderJson, {})
			]
		),
		...responseAnswerKeyStatements(questionId, response)
	);

	const markSchemeItemIds = [];
	for (const [index, item] of (question.markSchemeItems ?? []).entries()) {
		const id = `${questionId}-ms-${index + 1}`;
		markSchemeItemIds.push(id);
		statements.push(
			insertStatement(
				'mark_scheme_items',
				[
					'id',
					'question_id',
					'source_document_id',
					'display_order',
					'item_type',
					'text',
					'marks',
					'source_ref',
					'confidence',
					'metadata_json'
				],
				[
					id,
					questionId,
					paper.markSchemeDocument.id,
					index + 1,
					item.itemType ?? 'mark',
					item.text,
					item.marks ?? null,
					item.sourceRef ?? null,
					item.confidence ?? null,
					json({ source: 'llm-vision-extracted' }, {})
				]
			)
		);
	}

	for (const [index, item] of (question.markChecklist ?? []).entries()) {
		statements.push(
			insertStatement(
				'mark_checklist_items',
				[
					'id',
					'question_id',
					'display_order',
					'text',
					'required',
					'mark_scheme_item_ids_json',
					'confidence',
					'needs_human_review'
				],
				[
					`${questionId}-check-${index + 1}`,
					questionId,
					index + 1,
					item.text,
					bool(item.required ?? true),
					json(
						(item.markSchemeItemIndexes ?? [])
							.map((itemIndex) => markSchemeItemIds[itemIndex])
							.filter(Boolean),
						[]
					),
					item.confidence ?? null,
					bool(item.needsHumanReview)
				]
			)
		);
	}

	if (question.modelAnswer?.answerText) {
		statements.push(
			insertStatement(
				'model_answers',
				[
					'id',
					'question_id',
					'answer_text',
					'derivation',
					'supporting_mark_scheme_item_ids_json',
					'confidence',
					'needs_human_review'
				],
				[
					`${questionId}-model-answer`,
					questionId,
					question.modelAnswer.answerText,
					'generated_from_mark_scheme',
					json(markSchemeItemIds, []),
					question.modelAnswer.confidence ?? null,
					bool(question.modelAnswer.needsHumanReview)
				]
			)
		);
	}

	if (question.answerChain) {
		const chain = question.answerChain;
		const chainId = chainIdFor(chain, subjectArea);
		const reuseExistingChainDefinition = options.reuseExistingChainIds?.has(chainId) === true;
		const currentUseCount = chainUseCount.get(chainId) ?? 0;
		chainUseCount.set(chainId, currentUseCount + 1);
		if (!reuseExistingChainDefinition) {
			statements.push(
				upsertStatement(
					'answer_chains',
					[
						'id',
						'slug',
						'title',
						'canonical_chain_text',
						'subject',
						'subject_area',
						'broad_topic',
						'summary',
						'created_by',
						'confidence',
						'needs_human_review',
						'review_notes_json',
						'status',
						'metadata_json'
					],
					[
						chainId,
						chainId,
						chain.title,
						chain.canonicalChainText,
						subject,
						subjectArea,
						chain.broadTopic ?? null,
						chain.summary ?? null,
						'extraction_agent',
						chain.confidence ?? null,
						bool(chain.needsHumanReview),
						json(chain.reviewNotes, []),
						chain.needsHumanReview ? 'draft' : 'published',
						json(
							{
								source: 'llm-vision-extracted',
								chain_family_id: chain.chainFamilyId ?? null
							},
							{}
						)
					]
				)
			);

			for (const [index, step] of (chain.steps ?? []).entries()) {
				statements.push(
					upsertStatement(
						'answer_chain_steps',
						[
							'id',
							'answer_chain_id',
							'display_order',
							'step_text',
							'step_role',
							'explanation',
							'common_omission',
							'supported_by_mark_scheme_item_ids_json',
							'evidence_json'
						],
						[
							`${chainId}-step-${index + 1}`,
							chainId,
							index + 1,
							step.stepText,
							step.stepRole ?? 'link',
							step.explanation ?? null,
							step.commonOmission ?? null,
							json(
								(step.markSchemeItemIndexes ?? [])
									.map((itemIndex) => markSchemeItemIds[itemIndex])
									.filter(Boolean),
								[]
							),
							json([], [])
						]
					)
				);
			}
		}

		statements.push(
			insertStatement(
				'question_answer_chains',
				[
					'id',
					'question_id',
					'answer_chain_id',
					'is_primary',
					'fit_confidence',
					'fit_notes',
					'transfer_distance',
					'display_order',
					'needs_human_review',
					'review_notes_json',
					'metadata_json'
				],
				[
					`${questionId}--${chainId}`,
					questionId,
					chainId,
					1,
					chain.confidence ?? null,
					chain.summary ?? null,
					normalizeTransferDistance(currentUseCount === 0 ? 'start' : 'near'),
					question.displayOrder,
					bool(chain.needsHumanReview),
					json(chain.reviewNotes, []),
					json({ source: 'llm-vision-extracted' }, {})
				]
			)
		);

		for (const [index, weakAnswer] of (question.commonWeakAnswers ?? []).entries()) {
			statements.push(
				insertStatement(
					'common_weak_answers',
					[
						'id',
						'question_id',
						'answer_chain_id',
						'weak_answer_text',
						'missing_chain_step_ids_json',
						'explanation',
						'source',
						'confidence',
						'needs_human_review'
					],
					[
						`${questionId}-weak-${index + 1}`,
						questionId,
						chainId,
						weakAnswer.weakAnswerText,
						json(
							(weakAnswer.missingStepIndexes ?? []).map(
								(stepIndex) => `${chainId}-step-${stepIndex + 1}`
							),
							[]
						),
						weakAnswer.explanation ?? null,
						'agent',
						weakAnswer.confidence ?? null,
						0
					]
				)
			);
		}
	}
}

function loadPapers() {
	if (!existsSync(extractionRoot)) {
		throw new Error(
			`No vision extraction directory found at ${path.relative(rootDir, extractionRoot)}.`
		);
	}
	const files = listExtractionFiles(extractionRoot, recursive)
		.filter((fileName) => fileName.endsWith('.json'))
		.sort();
	const papers = files.map((fileName) => ({
		fileName,
		paper: readJson(path.join(extractionRoot, fileName))
	}));
	const selected = allPapers
		? papers
		: papers.filter(({ fileName, paper }) => paperMatchesSelection(fileName, paper));
	if (!selected.length) throw new Error(`No extracted paper matched ${paperArg}.`);
	return selected.map(({ paper }) => paper);
}

function listExtractionFiles(dir, includeNested) {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		if (entry.isFile()) files.push(entry.name);
		if (includeNested && entry.isDirectory()) {
			for (const nested of listExtractionFiles(path.join(dir, entry.name), true)) {
				files.push(path.join(entry.name, nested));
			}
		}
	}
	return files;
}

function paperMatchesSelection(fileName, paper) {
	const baseName = path.basename(fileName);
	if (
		baseName === `${paperArg}.json` ||
		baseName.startsWith(`${paperArg}.`) ||
		fileName === `${paperArg}.json`
	) {
		return true;
	}
	const sourceDocumentId = paper?.sourceDocument?.id ?? paper?.sourceDocumentId ?? '';
	return sourceDocumentId === paperArg || sourceDocumentId.includes(paperArg);
}

function validateExtractedPapers(papers) {
	const missingChains = [];
	const qualityIssues = [];
	const humanReviewIssues = [];
	for (const paper of papers) {
		for (const question of paper.questions ?? []) {
			if (question.marks !== null && question.marks !== undefined && !question.answerChain) {
				missingChains.push(`${paper.sourceDocument.id} ${question.sourceQuestionRef}`);
			}
			if (question.needsHumanReview || question.answerChain?.needsHumanReview) {
				humanReviewIssues.push(`${paper.sourceDocument.id} ${question.sourceQuestionRef}`);
			}
			for (const asset of question.assets ?? []) {
				if (asset?.needsHumanReview) {
					humanReviewIssues.push(
						`${paper.sourceDocument.id} ${question.sourceQuestionRef} asset ${asset.sourceLabel ?? asset.label ?? asset.assetId ?? 'unknown'}`
					);
				}
			}
		}
		for (const issue of blockingIssues(deterministicCandidateIssues(paper))) {
			qualityIssues.push(
				`${paper.sourceDocument.id} ${issue.sourceQuestionRef ?? 'unknown-ref'}: ${issue.code} at ${issue.field}: ${issue.evidence}`
			);
		}
	}
	if (missingChains.length > 0) {
		throw new Error(
			`Vision extraction is missing answer chains for ${missingChains.length} marked questions. ` +
				`Re-run extraction with repair attempts, then import again. Examples: ${missingChains
					.slice(0, 12)
					.join(', ')}`
		);
	}
	if (qualityIssues.length > 0) {
		throw new Error(
			`Vision extraction has ${qualityIssues.length} blocking reusable-chain or response-key quality issues. ` +
				`Re-run extraction with repair attempts, then import again. Examples: ${qualityIssues
					.slice(0, 8)
					.join(' | ')}`
		);
	}
	if (humanReviewIssues.length > 0) {
		throw new Error(
			`Vision extraction has ${humanReviewIssues.length} questions or assets marked needsHumanReview. ` +
				`Review and clear those flags before import. Examples: ${humanReviewIssues
					.slice(0, 12)
					.join(', ')}`
		);
	}
}

async function questionIdsForSourceDocuments(sourceDocumentIds) {
	if (!sourceDocumentIds.length) return [];
	const placeholders = sourceDocumentIds.map(() => '?').join(', ');
	const rows = await d1Query(
		`SELECT id FROM questions WHERE source_document_id IN (${placeholders})`,
		sourceDocumentIds
	);
	return rows.map((row) => row.id);
}

async function chainIdsForSourceDocuments(sourceDocumentIds) {
	if (!sourceDocumentIds.length) return [];
	const placeholders = sourceDocumentIds.map(() => '?').join(', ');
	const rows = await d1Query(
		`SELECT DISTINCT qac.answer_chain_id AS id
		   FROM questions q
		   JOIN question_answer_chains qac ON qac.question_id = q.id
		  WHERE q.source_document_id IN (${placeholders})`,
		sourceDocumentIds
	);
	return rows.map((row) => row.id).filter(Boolean);
}

async function existingReplacementPlan(papers) {
	const sourceDocumentIds = papers.map((paper) => paper.sourceDocument.id);
	const incomingQuestionIds = papers.flatMap((paper) =>
		(paper.questions ?? []).map((question) =>
			stableQuestionId(paper.sourceDocument.id, question.sourceQuestionRef)
		)
	);
	const incomingChainActions = incomingChainActionsForPapers(papers);
	const incomingChainDefinitions = incomingChainDefinitionsForPapers(papers);
	const incomingChainIds = [
		...new Set(
			papers.flatMap((paper) =>
				(paper.questions ?? [])
					.map((question) => question.answerChain)
					.filter(Boolean)
					.map((chain) => chainIdFor(chain, subjectAreaForPaper(paper)))
			)
		)
	];
	const sourcePlaceholders = sourceDocumentIds.map(() => '?').join(', ');
	const existingSourceDocuments = sourceDocumentIds.length
		? await d1Query(
				`SELECT id, doc_type, title, subject_area, component_code, series
				   FROM source_documents
				  WHERE id IN (${sourcePlaceholders})
				  ORDER BY id`,
				sourceDocumentIds
			)
		: [];
	const existingQuestionRows = sourceDocumentIds.length
		? await d1Query(
				`SELECT source_document_id, COUNT(*) AS questions
				   FROM questions
				  WHERE source_document_id IN (${sourcePlaceholders})
				  GROUP BY source_document_id
				  ORDER BY source_document_id`,
				sourceDocumentIds
			)
		: [];
	const existingPaperChainIds = await chainIdsForSourceDocuments(sourceDocumentIds);
	const questionIdCollisions =
		incomingQuestionIds.length && sourceDocumentIds.length
			? await d1Query(
					`SELECT id, source_document_id, source_question_ref
					   FROM questions
					  WHERE id IN (${incomingQuestionIds.map(() => '?').join(', ')})
					    AND source_document_id NOT IN (${sourcePlaceholders})
					  ORDER BY id`,
					[...incomingQuestionIds, ...sourceDocumentIds]
				)
			: [];
	const rawSharedIncomingChains =
		incomingChainIds.length && sourceDocumentIds.length
			? await d1Query(
					`SELECT ac.id,
					        ac.title,
					        COUNT(DISTINCT qac.question_id) AS linked_questions,
					        SUM(CASE WHEN q.source_document_id IN (${sourcePlaceholders}) THEN 1 ELSE 0 END) AS selected_links,
					        GROUP_CONCAT(DISTINCT q.source_document_id) AS linked_source_document_ids
					   FROM answer_chains ac
					   LEFT JOIN question_answer_chains qac ON qac.answer_chain_id = ac.id
					   LEFT JOIN questions q ON q.id = qac.question_id
					  WHERE ac.id IN (${incomingChainIds.map(() => '?').join(', ')})
					  GROUP BY ac.id
					 HAVING linked_questions > selected_links
					  ORDER BY ac.id`,
					[...sourceDocumentIds, ...incomingChainIds]
				)
			: [];
	const existingSharedChainDefinitions = await existingChainDefinitions(
		rawSharedIncomingChains.map((row) => row.id)
	);
	const sharedIncomingChains = rawSharedIncomingChains.map((row) => {
		const actions = [...(incomingChainActions.get(row.id) ?? new Set())].sort();
		const existingDefinition = existingSharedChainDefinitions.get(row.id) ?? null;
		const incomingDefinition = incomingChainDefinitions.get(row.id) ?? null;
		const definitionUnchanged = chainDefinitionsEqual(existingDefinition, incomingDefinition);
		const safeReuseOnly =
			(actions.length === 1 && actions[0] === 'reuse_existing') ||
			(actions.every((action) => ['reuse_existing', 'update_existing'].includes(action)) &&
				definitionUnchanged);
		return {
			...row,
			incoming_actions: actions,
			safe_existing_definition_unchanged: definitionUnchanged,
			safe_reuse_only: safeReuseOnly
		};
	});
	const unsafeSharedIncomingChains = sharedIncomingChains.filter((row) => !row.safe_reuse_only);
	return {
		sourceDocumentIds,
		existingSourceDocuments,
		existingQuestionRows,
		existingPaperChainIds,
		incomingQuestionCount: incomingQuestionIds.length,
		incomingChainCount: incomingChainIds.length,
		questionIdCollisions,
		sharedIncomingChains,
		unsafeSharedIncomingChains,
		allowSharedChainUpdates,
		safeToReplace:
			questionIdCollisions.length === 0 &&
			(allowSharedChainUpdates || unsafeSharedIncomingChains.length === 0)
	};
}

async function existingChainDefinitions(chainIds) {
	if (!chainIds.length) return new Map();
	const rows = await d1Query(
		`SELECT id, title, canonical_chain_text, summary
		   FROM answer_chains
		  WHERE id IN (${chainIds.map(() => '?').join(', ')})`,
		chainIds
	);
	const stepRows = await d1Query(
		`SELECT answer_chain_id, display_order, step_text, step_role, explanation, common_omission
		   FROM answer_chain_steps
		  WHERE answer_chain_id IN (${chainIds.map(() => '?').join(', ')})
		  ORDER BY answer_chain_id, display_order`,
		chainIds
	);
	const definitions = new Map(
		rows.map((row) => [
			row.id,
			normalizeChainDefinition({
				title: row.title,
				canonicalChainText: row.canonical_chain_text,
				summary: row.summary,
				steps: []
			})
		])
	);
	for (const step of stepRows) {
		const definition = definitions.get(step.answer_chain_id);
		if (!definition) continue;
		definition.steps.push(
			normalizeChainStep({
				stepText: step.step_text,
				stepRole: step.step_role,
				explanation: step.explanation,
				commonOmission: step.common_omission
			})
		);
	}
	return definitions;
}

function incomingChainDefinitionsForPapers(papers) {
	const definitions = new Map();
	for (const paper of papers) {
		const subjectArea = subjectAreaForPaper(paper);
		for (const question of paper.questions ?? []) {
			const chain = question.answerChain;
			if (!chain) continue;
			const chainId = chainIdFor(chain, subjectArea);
			if (!definitions.has(chainId)) definitions.set(chainId, normalizeChainDefinition(chain));
		}
	}
	return definitions;
}

function chainDefinitionsEqual(existingDefinition, incomingDefinition) {
	if (!existingDefinition || !incomingDefinition) return false;
	return JSON.stringify(existingDefinition) === JSON.stringify(incomingDefinition);
}

function normalizeChainDefinition(chain) {
	return {
		title: normalizeChainText(chain?.title),
		canonicalChainText: normalizeChainText(chain?.canonicalChainText ?? chain?.canonical_chain_text),
		summary: normalizeChainText(chain?.summary),
		steps: (chain?.steps ?? []).map(normalizeChainStep)
	};
}

function normalizeChainStep(step) {
	return {
		stepText: normalizeChainText(step?.stepText ?? step?.step_text),
		stepRole: normalizeChainText(step?.stepRole ?? step?.step_role),
		explanation: normalizeChainText(step?.explanation),
		commonOmission: normalizeChainText(step?.commonOmission ?? step?.common_omission)
	};
}

function normalizeChainText(value) {
	return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function incomingChainActionsForPapers(papers) {
	const actionsByChainId = new Map();
	for (const paper of papers) {
		const subjectArea = subjectAreaForPaper(paper);
		for (const question of paper.questions ?? []) {
			if (!question.answerChain) continue;
			const chainId = chainIdFor(question.answerChain, subjectArea);
			if (!actionsByChainId.has(chainId)) actionsByChainId.set(chainId, new Set());
			actionsByChainId.get(chainId).add(question.chainResolution?.action ?? 'unknown');
		}
	}
	return actionsByChainId;
}

async function clearRowsForPapers(papers, options = {}) {
	const reuseExistingChainIds = options.reuseExistingChainIds ?? new Set();
	const sourceDocumentIds = papers.map((paper) => paper.sourceDocument.id);
	const subjectAreas = [...new Set(papers.map(subjectAreaForPaper).filter(Boolean))];
	const chainPrefixes = subjectAreas.map(chainPrefixForSubject);
	const questionIds = await questionIdsForSourceDocuments(sourceDocumentIds);
	const existingPaperChainIds = replaceAllSubject
		? []
		: await chainIdsForSourceDocuments(sourceDocumentIds);
	const extractedChainIds = [
		...new Set(
			papers.flatMap((paper) =>
				(paper.questions ?? [])
					.map((question) => question.answerChain)
					.filter(Boolean)
					.map((chain) => chainIdFor(chain, subjectAreaForPaper(paper)))
					.filter((chainId) => !reuseExistingChainIds.has(chainId))
			)
		)
	];
	const chainIds = replaceAllSubject
		? (
				await d1Query(
					[
						`SELECT id FROM answer_chains WHERE subject_area IN (${subjectAreas.map(() => '?').join(', ')})`,
						...chainPrefixes.map(() => `id LIKE ?`)
					].join(' OR '),
					[...subjectAreas, ...chainPrefixes.map((prefix) => `${prefix}-%`)]
				)
			).map((row) => row.id)
		: [];
	const statements = [];
	if (questionIds.length) {
		for (const ids of paramChunks(questionIds)) {
			const quoted = ids.map(() => '?').join(', ');
			for (const table of [
				'constellation_questions',
				'common_weak_answers',
				'question_answer_chains',
				'model_answers',
				'mark_checklist_items',
				'mark_scheme_items',
				'question_response_answer_keys',
				'question_rendering_overlays',
				'question_assets'
			]) {
				statements.push({
					sql: `DELETE FROM ${table} WHERE question_id IN (${quoted})`,
					params: ids
				});
			}
			statements.push({ sql: `DELETE FROM questions WHERE id IN (${quoted})`, params: ids });
		}
	}
	if (!replaceAllSubject && extractedChainIds.length) {
		const chainIdsToReplace = extractedChainIds.filter(
			(chainId) => !reuseExistingChainIds.has(chainId)
		);
		for (const ids of paramChunks(chainIdsToReplace)) {
			const quoted = ids.map(() => '?').join(', ');
			statements.push({
				sql: `DELETE FROM answer_chain_steps WHERE answer_chain_id IN (${quoted})`,
				params: ids
			});
		}
	}
	if (!replaceAllSubject && existingPaperChainIds.length) {
		for (const ids of paramChunks(existingPaperChainIds)) {
			const quoted = ids.map(() => '?').join(', ');
			statements.push(
				{
					sql: `DELETE FROM constellation_questions WHERE constellation_id IN (SELECT c.id FROM constellations c WHERE c.answer_chain_id IN (${quoted}) AND NOT EXISTS (SELECT 1 FROM question_answer_chains qac WHERE qac.answer_chain_id = c.answer_chain_id))`,
					params: ids
				},
				{
					sql: `DELETE FROM constellations WHERE answer_chain_id IN (${quoted}) AND NOT EXISTS (SELECT 1 FROM question_answer_chains qac WHERE qac.answer_chain_id = constellations.answer_chain_id)`,
					params: ids
				},
				{
					sql: `DELETE FROM chain_family_members WHERE answer_chain_id IN (${quoted}) AND NOT EXISTS (SELECT 1 FROM question_answer_chains qac WHERE qac.answer_chain_id = chain_family_members.answer_chain_id)`,
					params: ids
				},
				{
					sql: `DELETE FROM cross_subject_chain_family_members WHERE answer_chain_id IN (${quoted}) AND NOT EXISTS (SELECT 1 FROM question_answer_chains qac WHERE qac.answer_chain_id = cross_subject_chain_family_members.answer_chain_id)`,
					params: ids
				},
				{
					sql: `DELETE FROM answer_chain_steps WHERE answer_chain_id IN (${quoted}) AND NOT EXISTS (SELECT 1 FROM question_answer_chains qac WHERE qac.answer_chain_id = answer_chain_steps.answer_chain_id)`,
					params: ids
				},
				{
					sql: `DELETE FROM common_weak_answers WHERE answer_chain_id IN (${quoted}) AND NOT EXISTS (SELECT 1 FROM question_answer_chains qac WHERE qac.answer_chain_id = common_weak_answers.answer_chain_id)`,
					params: ids
				},
				{
					sql: `DELETE FROM answer_chains WHERE id IN (${quoted}) AND NOT EXISTS (SELECT 1 FROM question_answer_chains qac WHERE qac.answer_chain_id = answer_chains.id)`,
					params: ids
				}
			);
		}
	}
	if (replaceAllSubject && chainIds.length) {
		for (const ids of paramChunks(chainIds)) {
			const quoted = ids.map(() => '?').join(', ');
			statements.push(
				{
					sql: `DELETE FROM constellation_questions WHERE constellation_id IN (SELECT id FROM constellations WHERE answer_chain_id IN (${quoted}))`,
					params: ids
				},
				{ sql: `DELETE FROM constellations WHERE answer_chain_id IN (${quoted})`, params: ids },
				{
					sql: `DELETE FROM chain_family_members WHERE answer_chain_id IN (${quoted})`,
					params: ids
				},
				{ sql: `DELETE FROM answer_chain_steps WHERE answer_chain_id IN (${quoted})`, params: ids },
				{
					sql: `DELETE FROM common_weak_answers WHERE answer_chain_id IN (${quoted})`,
					params: ids
				},
				{
					sql: `DELETE FROM question_answer_chains WHERE answer_chain_id IN (${quoted})`,
					params: ids
				},
				{ sql: `DELETE FROM answer_chains WHERE id IN (${quoted})`, params: ids }
			);
		}
		statements.push({
			sql: [
				`DELETE FROM chain_families WHERE subject_area IN (${subjectAreas.map(() => '?').join(', ')})`,
				...chainPrefixes.map(() => `id LIKE ?`)
			].join(' OR '),
			params: [...subjectAreas, ...chainPrefixes.map((prefix) => `${prefix}-%`)]
		});
	}
	if (replaceAllSubject) {
		statements.push({
			sql: `DELETE FROM source_documents WHERE subject_area IN (${subjectAreas.map(() => '?').join(', ')}) AND doc_type IN ('mark_scheme', 'supporting_document', 'examiner_report', 'insert')`,
			params: subjectAreas
		});
	}
	await executeBatch(statements, 'clear');
}

async function audit(papers) {
	const sourceDocumentIds = papers.map((paper) => paper.sourceDocument.id);
	const placeholders = sourceDocumentIds.map(() => '?').join(', ');
	const coverage = await d1Query(
		`SELECT q.source_document_id,
		        COUNT(DISTINCT q.id) AS questions,
		        COUNT(DISTINCT qro.id) AS overlays,
		        COUNT(DISTINCT m.id) AS mark_items,
		        COUNT(DISTINCT c.id) AS checklist_items,
		        COUNT(DISTINCT ma.id) AS model_answers,
		        COUNT(DISTINCT k.id) AS answer_keys,
		        COUNT(DISTINCT qac.answer_chain_id) AS chains
		   FROM questions q
		   LEFT JOIN question_rendering_overlays qro ON qro.question_id = q.id
		   LEFT JOIN mark_scheme_items m ON m.question_id = q.id
		   LEFT JOIN mark_checklist_items c ON c.question_id = q.id
		   LEFT JOIN model_answers ma ON ma.question_id = q.id
		   LEFT JOIN question_response_answer_keys k ON k.question_id = q.id
		   LEFT JOIN question_answer_chains qac ON qac.question_id = q.id
		  WHERE q.source_document_id IN (${placeholders})
		  GROUP BY q.source_document_id
		  ORDER BY q.source_document_id`,
		sourceDocumentIds
	);
	const missing = await d1Query(
		`SELECT q.source_document_id, q.source_question_ref, q.id, q.marks,
		        COALESCE(json_extract(qro.render_json, '$.response.kind'), 'missing') AS response_kind,
		        COUNT(DISTINCT m.id) AS mark_rows,
		        COUNT(DISTINCT c.id) AS checklist_rows,
		        COUNT(DISTINCT ma.id) AS model_answers,
		        COUNT(DISTINCT k.id) AS answer_keys,
		        COUNT(DISTINCT qac.answer_chain_id) AS chains
		   FROM questions q
		   LEFT JOIN question_rendering_overlays qro ON qro.question_id = q.id
		   LEFT JOIN mark_scheme_items m ON m.question_id = q.id
		   LEFT JOIN mark_checklist_items c ON c.question_id = q.id
		   LEFT JOIN model_answers ma ON ma.question_id = q.id
		   LEFT JOIN question_response_answer_keys k ON k.question_id = q.id
		   LEFT JOIN question_answer_chains qac ON qac.question_id = q.id
		  WHERE q.source_document_id IN (${placeholders})
		  GROUP BY q.id
		 HAVING mark_rows = 0
		    OR checklist_rows = 0
		    OR (
		        model_answers = 0
		        AND answer_keys = 0
		        AND response_kind NOT IN ('asset-canvas', 'drawing-box')
		    )
		    OR chains = 0
		  ORDER BY q.source_document_id, q.display_order`,
		sourceDocumentIds
	);
	console.log(JSON.stringify({ coverage, missing_grading_evidence: missing }, null, 2));
	if (missing.length > 0) {
		throw new Error(`${missing.length} imported questions still lack usable grading evidence.`);
	}
}

const papers = loadPapers();
validateExtractedPapers(papers);
const importedSubjectAreas = [...new Set(papers.map(subjectAreaForPaper).filter(Boolean))];
const replacementPlan = checkExisting ? await existingReplacementPlan(papers) : null;
if (replacementPlan && !replacementPlan.safeToReplace) {
	console.log(JSON.stringify({ d1_existing_replacement_plan: replacementPlan }, null, 2));
	throw new Error(
		'D1 replacement check found conflicts. Resolve question ID collisions or pass --allow-shared-chain-updates only after cross-paper chain validation.'
	);
}
const reuseExistingChainIds = new Set(
	replacementPlan
		? replacementPlan.sharedIncomingChains
				.filter((chain) => chain.safe_reuse_only && !refreshSharedChainDefinitions)
				.map((chain) => chain.id)
		: []
);

console.log(
	JSON.stringify(
		{
			database_id: databaseId,
			source: path.relative(rootDir, extractionRoot),
			papers: papers.map((paper) => paper.sourceDocument.id),
			subject_areas: importedSubjectAreas,
			questions: papers.reduce((sum, paper) => sum + paper.questions.length, 0),
			replace_all_subject: replaceAllSubject,
			dry_run: dryRun,
			check_existing: checkExisting,
			refresh_shared_chain_definitions: refreshSharedChainDefinitions,
			d1_existing_replacement_plan: replacementPlan
		},
		null,
		2
	)
);

if (applySchemaFlag) await applySchema();
if (dryRun) {
	console.log('clear: dry run, skipped database deletes');
} else {
	await clearRowsForPapers(papers, { reuseExistingChainIds });
}

const statements = [];
const chainUseCount = new Map();
for (const paper of papers) {
	statements.push(sourceDocumentStatement(paper.sourceDocument));
	statements.push(sourceDocumentStatement(paper.markSchemeDocument));
	for (const supportingDocument of paper.supportingDocuments ?? []) {
		statements.push(sourceDocumentStatement(supportingDocument));
	}
	const questions = [...paper.questions]
		.sort((a, b) => compareQuestionRefs(a.sourceQuestionRef, b.sourceQuestionRef))
		.map((question, index) => ({ ...question, displayOrder: index + 1 }));
	for (const question of questions) {
		addQuestionStatements(statements, paper, question, chainUseCount, { reuseExistingChainIds });
	}
}

statements.push(
	insertStatement(
		'content_imports',
		['id', 'source', 'question_count', 'chain_count', 'constellation_count', 'metadata_json'],
		[
			`vision-extracted-${new Date().toISOString()}`,
			path.relative(rootDir, extractionRoot),
			papers.reduce((sum, paper) => sum + paper.questions.length, 0),
			chainUseCount.size,
			0,
			json(
				{
					vision_extracted: true,
					source_document_ids: papers.map((paper) => paper.sourceDocument.id),
					experiment_source_document_ids: papers.map((paper) => paper.sourceDocument.id),
					subject_areas: importedSubjectAreas,
					imported_at: new Date().toISOString(),
					replace_all_subject: replaceAllSubject
				},
				{}
			)
		]
	)
);

await executeBatch(statements, 'insert');
if (!dryRun) await audit(papers);

console.log('Vision extraction import complete.');
