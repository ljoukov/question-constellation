#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const rootDir = process.cwd();
const extractionRoot = path.join(
	rootDir,
	'data/extracted-questions/aqa-combined-science-trilogy-higher'
);
const baselinePath = path.join(extractionRoot, 'baseline/all-papers.json');
const semanticDir = path.join(extractionRoot, 'semantic-chains');
const migrationPath = path.join(rootDir, 'migrations/0001_public_content.sql');
const wranglerPath = path.join(rootDir, 'wrangler.jsonc');
const experimentModelAnswersPath = path.join(
	rootDir,
	'data/model-answers/experiment-written-model-answers.json'
);
const experimentSourceDocumentIds = new Set([
	'aqa-8464b1h-qp-jun18',
	'aqa-8464b1h-qp-jun19',
	'aqa-8464c1h-qp-nov21',
	'aqa-8464p1h-qp-jun18'
]);

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const schemaOnly = args.has('--schema-only');
const skipSchema = args.has('--skip-schema');
const includeExperimentPapers = !args.has('--no-experiment-papers');
const onlyExperimentPapers = args.has('--only-experiment-papers');
const batchSize = integerArg('batch-size', 50, 1);

function integerArg(name, defaultValue, minValue) {
	const arg = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
	if (!arg) return defaultValue;
	const value = Number(arg.slice(name.length + 3));
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer greater than or equal to ${minValue}.`);
	}
	return value;
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

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readOptionalJson(filePath, fallback) {
	return existsSync(filePath) ? readJson(filePath) : fallback;
}

function readWranglerConfig() {
	const raw = readFileSync(wranglerPath, 'utf8')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/\/\*[\s\S]*?\*\//g, '');
	return JSON.parse(raw);
}

function requiredEnv(name, fallback = null) {
	const value = process.env[name] ?? fallback;
	if (!value) {
		throw new Error(`${name} is required for D1 REST import.`);
	}
	return value;
}

const wranglerConfig = readWranglerConfig();
const databaseConfig = wranglerConfig.d1_databases?.find((db) => db.binding === 'QUESTION_DB');
const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
const apiToken = requiredEnv(
	'CLOUDFLARE_API_TOKEN',
	process.env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN ?? null
);
const databaseId = requiredEnv('QUESTION_DB_DATABASE_ID', databaseConfig?.database_id ?? null);
const d1QueryUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

function json(value, fallback) {
	return JSON.stringify(value ?? fallback);
}

function bool(value) {
	return value ? 1 : 0;
}

function normalizeTransferDistance(value) {
	const normalized = String(value ?? 'unclassified').replaceAll('-', '_');
	if (normalized === 'exam_transfer') return 'exam_transfer';
	if (['start', 'near', 'stretch', 'unclassified'].includes(normalized)) return normalized;
	return 'unclassified';
}

function firstText(...values) {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return null;
}

function extractMarks(text) {
	const match = String(text ?? '').match(/\[(\d+)\s+marks?\]/i);
	return match ? Number(match[1]) : null;
}

const reviewedExperimentModelAnswers = new Map(
	(readOptionalJson(experimentModelAnswersPath, { answers: [] }).answers ?? []).map((answer) => [
		answer.questionId,
		answer
	])
);

function studentFacingModelAnswer(text) {
	const value = String(text ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!value) return null;
	if (
		[
			/^\d+(?:\.\d+)+$/,
			/\bAO[123](?:\/\d+)?\b/i,
			/\bSpec\.?\s*Ref\b/i,
			/\bQuestion\s+Answers\s+Extra information\b/i,
			/\bA bold and is used\b/i,
			/\bAlternative answers acceptable\b/i,
			/\bMarking procedure\b/i,
			/\bMarking of lists\b/i,
			/\bErrors carried forward\b/i
		].some((pattern) => pattern.test(value))
	) {
		return null;
	}
	return value;
}

function modelAnswerForImport(question, renderingOverlay) {
	const reviewed = reviewedExperimentModelAnswers.get(question.id);
	if (reviewed?.answerText) {
		return {
			answer_text: reviewed.answerText,
			derivation: reviewed.derivation ?? 'generated_from_mark_scheme',
			confidence: reviewed.confidence ?? 0.86,
			needs_human_review: false,
			supporting_mark_scheme_item_ids: []
		};
	}

	const responseKind = renderingOverlay?.response?.kind;
	if (responseKind && responseKind !== 'lines' && responseKind !== 'labeled-lines') {
		return null;
	}
	if (!question.marks || question.marks <= 0) return null;

	const answerText = studentFacingModelAnswer(question.model_answer?.answer_text);
	if (!answerText) return null;

	return {
		...question.model_answer,
		answer_text: answerText,
		derivation: question.model_answer?.derivation ?? 'generated_from_mark_scheme'
	};
}

function titleFromQuestion(question) {
	const text =
		firstText(question.prompt_text, question.self_contained_prompt_text, question.id) ??
		question.id;
	const cleaned = text
		.replace(/\[[^\]]*marks?\]/gi, '')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line && !/^figure\s+\d+$/i.test(line) && !/^table\s+\d+$/i.test(line))
		.at(-1);
	const base = cleaned || text.replace(/\s+/g, ' ');
	return base.length > 96 ? `${base.slice(0, 93).trim()}...` : base;
}

function contextText(question) {
	const parts = [];
	if (question.parent_stem) parts.push(question.parent_stem);
	for (const block of question.context_blocks ?? []) {
		if (block?.kind === 'parent_stem') continue;
		if (block?.text && block.text.length <= 1200) parts.push(block.text);
	}
	if (
		question.self_containment?.added_context &&
		question.self_containment.added_context.length <= 1200
	) {
		parts.push(question.self_containment.added_context);
	}
	return Array.from(new Set(parts.map((part) => part.trim()).filter(Boolean))).join('\n\n');
}

function stripMarkBrackets(text) {
	return stripNonQuestionBoilerplate(String(text ?? ''))
		.replace(/^\s*\[\s*\d+(?:\.\d+)?\s*marks?\s*\]\s*$/gim, '')
		.replace(/\s*\[\s*\d+(?:\.\d+)?\s*marks?\s*\]\s*/gi, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function stripNonQuestionBoilerplate(text) {
	return text
		.replace(/\n?\s*Copyright information[\s\S]*$/i, '')
		.replace(/\n?\s*END\s+OF\s+QUESTIONS[\s\S]*$/i, '')
		.replace(/\n?\s*There are no questions printed on this page[\s\S]*$/i, '');
}

function formulaPartToTex(formula) {
	const parts = Array.from(formula.matchAll(/([A-Z][a-z]?)(\d*)/g));
	if (parts.length === 0) return formula;
	return parts.map(([, element, count]) => `${element}${count ? `_{${count}}` : ''}`).join('');
}

function formulaTokenToTex(token) {
	const match = token.match(/^(\d*)((?:[A-Z][a-z]?\d*)+)(\([a-z]\))?$/);
	if (!match) return token;
	const [, coefficient, formula, state] = match;
	if (!/\d/.test(formula) && !/[A-Z][a-z]?[A-Z]/.test(formula)) return token;
	return `${coefficient ?? ''}\\mathrm{${formulaPartToTex(formula)}}${state ?? ''}`;
}

function chemicalEquationToTex(line) {
	const normalized = line
		.replaceAll('', ' -> ')
		.replaceAll('→', ' -> ')
		.replaceAll('⟶', ' -> ')
		.replaceAll('<=>', ' <=> ')
		.replace(/\s+/g, ' ')
		.trim();

	return normalized
		.split(/(\s+|\+|<=>|->|=)/)
		.map((token) => {
			if (token === '->') return '\\rightarrow';
			if (token === '<=>') return '\\rightleftharpoons';
			if (/^\s+$/.test(token) || token === '+' || token === '=') return token;
			return formulaTokenToTex(token);
		})
		.join('')
		.replace(/\s+/g, ' ')
		.trim();
}

function isLikelyChemicalEquation(line) {
	const normalized = line.trim();
	if (!/(?:|→|⟶|->|<=>)/.test(normalized)) return false;
	return /(?:[A-Z][a-z]?\d*){2,}/.test(normalized);
}

function withInlineUnits(value) {
	return value
		.replace(/\bmol\/dm3\b/g, '$\\mathrm{mol/dm^3}$')
		.replace(/\bkg\/m3\b/g, '$\\mathrm{kg/m^3}$')
		.replace(/\bm\/s2\b/g, '$\\mathrm{m/s^2}$')
		.replace(/\bcm3\b/g, '$\\mathrm{cm^3}$')
		.replace(/\bdm3\b/g, '$\\mathrm{dm^3}$')
		.replace(/\bmm3\b/g, '$\\mathrm{mm^3}$')
		.replace(/\bm2\b/g, '$\\mathrm{m^2}$')
		.replace(/\b10([–-]\d+)\b/g, (_match, exponent) => `$10^{${exponent.replace('–', '-')}}$`);
}

function withInlineMath(value) {
	return value
		.split(/\r?\n/)
		.map((line) =>
			isLikelyChemicalEquation(line) ? `$${chemicalEquationToTex(line)}$` : withInlineUnits(line)
		)
		.join('\n');
}

function paragraphText(lines) {
	return withInlineMath(
		lines
			.map((line) => line.trim())
			.filter(Boolean)
			.join(' ')
			.replace(/\s+([,.;:?!])/g, '$1')
			.trim()
	);
}

function paragraphBlock(lines) {
	const text = paragraphText(Array.isArray(lines) ? lines : [lines]);
	return text ? { kind: 'paragraph', text } : null;
}

function textBlocks(text, question = null) {
	return blocksFromSourceText(stripMarkBrackets(text), question);
}

function sourceConstraintText(question) {
	return [
		question.prompt_text,
		question.full_prompt_text,
		...(question.source_constraints ?? []),
		...(question.structured_constraints ?? []).map((constraint) =>
			typeof constraint === 'string' ? constraint : JSON.stringify(constraint)
		)
	]
		.filter(Boolean)
		.join('\n');
}

function promptLinesAfterInstruction(prompt, instructionPattern) {
	const lines = stripMarkBrackets(prompt)
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const index = lines.findIndex((line) => instructionPattern.test(line));
	if (index < 0) return [];
	return lines
		.slice(index + 1)
		.filter((line) => !/^(?:figure|table)\s+\d+$/i.test(line))
		.filter((line) => !/^\[?\d+(?:\.\d+)?\s*marks?\]?$/i.test(line));
}

function splitPaperColumns(line) {
	return line
		.split(/\s{2,}/)
		.map((part) => part.trim())
		.filter(Boolean);
}

function stripListMarker(line) {
	return line.replace(/^\s*(?:[-•]\s*)/, '').trim();
}

function cleanPromptLines(text) {
	return stripMarkBrackets(text)
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.filter((line) => !/^\[?\d+(?:\.\d+)?\s*marks?\]?$/i.test(line));
}

function mergeBrokenReferenceLines(lines) {
	const merged = [];
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const next = lines[index + 1];
		if (
			next &&
			/\b(?:shown|given|provided|listed)\s+in$/i.test(line) &&
			/^(?:Figure|Table)\s+\d+$/i.test(next)
		) {
			merged.push(`${line} ${next}`);
			index += 1;
			continue;
		}
		merged.push(line);
	}
	return merged;
}

function parseMarkdownTable(markdown, label) {
	const lines = String(markdown ?? '')
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.startsWith('|') && line.endsWith('|'));
	if (lines.length < 3) return null;

	const split = (line) =>
		line
			.slice(1, -1)
			.split('|')
			.map((cell) => cell.trim())
			.filter((cell) => cell.length > 0);
	const columns = split(lines[0]).map(withInlineMath);
	const rows = lines
		.slice(2)
		.map(split)
		.filter((row) => row.length)
		.map((row) => row.map(withInlineMath));
	if (!columns.length || !rows.length) return null;
	return { kind: 'table', label, columns, rows, compact: rows.length <= 5 };
}

function tableBlockFromExtractedTable(table) {
	const fromMarkdown = parseMarkdownTable(table?.markdown, table?.source_label ?? null);
	if (fromMarkdown) return fromMarkdown;

	const rows = table?.rows;
	if (!Array.isArray(rows) || rows.length === 0) return null;

	if (rows.every((row) => Array.isArray(row))) {
		const width = Math.max(...rows.map((row) => row.length));
		if (width < 2) return null;
		return {
			kind: 'table',
			label: table.source_label ?? undefined,
			columns: Array.from({ length: width }, (_value, index) => `Column ${index + 1}`),
			rows: rows.map((row) => row.map((cell) => withInlineMath(String(cell ?? '')))),
			compact: rows.length <= 5
		};
	}

	if (rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
		const columns = Object.keys(rows[0]);
		return {
			kind: 'table',
			label: table.source_label ?? undefined,
			columns: columns.map(withInlineMath),
			rows: rows.map((row) => columns.map((column) => withInlineMath(String(row[column] ?? '')))),
			compact: rows.length <= 5
		};
	}

	return null;
}

function extractedTableByLabel(question) {
	const tables = new Map();
	for (const table of question?.tables ?? []) {
		if (!table?.source_label) continue;
		const block = tableBlockFromExtractedTable(table);
		if (block) tables.set(table.source_label.toLowerCase(), block);
	}
	return tables;
}

function sourceDocumentAssetByLabel(question, label) {
	const key = `${question.source_document_id}:${label.toLowerCase()}`;
	return sourceDocumentAssetsByLabel.get(key) ?? null;
}

function assetByLabel(question, label) {
	const fromQuestion = (question.assets ?? []).find(
		(asset) => asset.source_label?.toLowerCase() === label.toLowerCase() && asset.public_path
	);
	if (fromQuestion) return fromQuestion;

	const fromSourceDocument = sourceDocumentAssetByLabel(question, label);
	if (fromSourceDocument) return fromSourceDocument;

	if (!/^Figure\s+\d+$/i.test(label)) return null;
	const pages = [question.page_start, question.page_end].filter(Number.isFinite);
	for (const page of pages) {
		const pageAssets =
			sourceDocumentAssetsByPage.get(`${question.source_document_id}:${page}`) ?? [];
		const image = pageAssets.find((asset) => asset.public_path && asset.asset_type !== 'graph');
		if (image) return image;
	}
	return null;
}

function figureBlockForLine(question, line) {
	const match = line.match(/^(Figure\s+\d+)$/i);
	if (!match) return null;
	const asset = assetByLabel(question, match[1]);
	if (!asset?.id || !asset.public_path) return null;
	return {
		kind: 'figure',
		assetId: asset.id,
		label: match[1]
	};
}

function figureBlockForLabel(question, label) {
	const asset = assetByLabel(question, label);
	if (!asset?.id || !asset.public_path) return null;
	return {
		kind: 'figure',
		assetId: asset.id,
		label
	};
}

function splitInlineFigureLine(question, line) {
	if (!question) return null;
	const label = line.match(/\b(Figure\s+\d+)\b/i)?.[1];
	if (!label || !figureBlockForLabel(question, label)) return null;
	const match = line.match(/^(.+\bFigure\s+\d+\b.+?\.)(?:\s+(.+))?$/i);
	if (!match) return null;
	const before = match[1]?.trim();
	const after = match[2]?.trim();
	if (!before || !/\bFigure\s+\d+\b/i.test(before)) return null;
	if (after && !isPromptStartLine(after)) return null;
	return { before, after: after ?? null, label };
}

function isTableLabelLine(line) {
	return /^(Table\s+\d+)$/i.test(line);
}

function tableLabelFromLine(line) {
	const match = line.match(/^(Table\s+\d+)$/i);
	return match ? match[1] : null;
}

function numericTableCell(value) {
	return /^[+–-]?\d+(?:\.\d+)?%?$/.test(value.trim());
}

function splitFlatTableDataRow(line) {
	const parts = splitPaperColumns(line);
	if (parts.length < 2) return null;
	if (!numericTableCell(parts[0]) || !numericTableCell(parts.at(-1) ?? '')) return null;
	return parts;
}

function tableColumnsFromFlatHeader(headerLines, width) {
	const lines = headerLines.map((line) => line.trim()).filter(Boolean);
	if (!lines.length) {
		return Array.from({ length: width }, (_value, index) => `Column ${index + 1}`);
	}

	if (width === 2) {
		const firstParts = splitPaperColumns(lines[0]);
		if (firstParts.length === 2) {
			const columns = [...firstParts];
			for (const line of lines.slice(1)) {
				const parts = splitPaperColumns(line);
				if (parts.length === 2) {
					columns[0] = `${columns[0]} ${parts[0]}`;
					columns[1] = `${columns[1]} ${parts[1]}`;
				} else if (parts.length === 1) {
					if (/^(?:in|per)\b/i.test(parts[0]) || /(?:\/|cm3|dm3|m2|m3)$/i.test(parts[0])) {
						columns[0] = `${columns[0]} ${parts[0]}`;
					} else {
						columns[1] = `${columns[1]} ${parts[0]}`;
					}
				}
			}
			return columns.map(withInlineMath);
		}

		if (lines.every((line) => splitPaperColumns(line).length === 1) && lines.length >= 2) {
			const columns = [lines[0], lines[1]];
			for (const line of lines.slice(2)) {
				if (/^(?:in|per)\b/i.test(line) || /(?:\/|cm3|dm3|m2|m3)$/i.test(line)) {
					columns[0] = `${columns[0]} ${line}`;
				} else {
					columns[1] = `${columns[1]} ${line}`;
				}
			}
			return columns.map(withInlineMath);
		}
	}

	const firstParts = splitPaperColumns(lines[0]);
	if (firstParts.length === width) return firstParts.map(withInlineMath);

	return Array.from({ length: width }, (_value, index) =>
		withInlineMath(lines[index] ?? `Column ${index + 1}`)
	);
}

function normalizeFlatTableRow(row, width) {
	if (row.length === width) return row;
	if (width === 2 && row.length > 2) return [row[0], row.slice(1).join(' ')];
	return Array.from({ length: width }, (_value, index) => row[index] ?? '');
}

function parseFlatTableAfterLabel(label, lines, startIndex) {
	const headerLines = [];
	const dataRows = [];
	let consumed = 1;

	for (let index = startIndex + 1; index < lines.length; index += 1) {
		const line = lines[index];
		if (isTableLabelLine(line) || /^Figure\s+\d+$/i.test(line)) break;
		if (dataRows.length > 0 && isPromptStartLine(line)) break;

		const dataRow = splitFlatTableDataRow(line);
		if (dataRow) {
			dataRows.push(dataRow);
			consumed += 1;
			continue;
		}

		if (dataRows.length > 0) break;
		if (isPromptStartLine(line) && headerLines.length === 0) break;

		headerLines.push(line);
		consumed += 1;
	}

	if (dataRows.length < 2) return null;

	const width = Math.max(...dataRows.map((row) => row.length));
	if (width < 2) return null;
	return {
		block: {
			kind: 'table',
			label,
			columns: tableColumnsFromFlatHeader(headerLines, width),
			rows: dataRows.map((row) => normalizeFlatTableRow(row, width).map(withInlineMath)),
			compact: dataRows.length <= 5
		},
		consumed
	};
}

function tableBlockAtLine(question, line, lines, index) {
	const label = tableLabelFromLine(line);
	if (!label) return null;

	const extracted = extractedTableByLabel(question).get(label.toLowerCase());
	if (extracted) {
		let consumed = 1;
		for (let next = index + 1; next < lines.length; next += 1) {
			if (
				isPromptStartLine(lines[next]) ||
				isTableLabelLine(lines[next]) ||
				/^Figure\s+\d+$/i.test(lines[next])
			) {
				break;
			}
			consumed += 1;
		}
		return { block: extracted, consumed };
	}

	return parseFlatTableAfterLabel(label, lines, index);
}

function inverseSquareEquationBlock(lines, index) {
	const line = lines[index]?.replace(/\s+/g, '');
	const next = lines[index + 1]?.replace(/\s+/g, '');
	if (line === 'I∝' && next === 'd2') {
		return { block: { kind: 'equation', text: 'I \\propto \\frac{1}{d^2}' }, consumed: 2 };
	}
	if (/^I\s*∝\s*1\s*\/\s*d(?:2|²)$/i.test(lines[index] ?? '')) {
		return { block: { kind: 'equation', text: 'I \\propto \\frac{1}{d^2}' }, consumed: 1 };
	}
	return null;
}

function flushParagraph(blocks, paragraphLines) {
	const block = paragraphBlock(paragraphLines);
	if (block) blocks.push(block);
	paragraphLines.length = 0;
}

function blocksFromSourceText(text, question) {
	const lines = mergeBrokenReferenceLines(cleanPromptLines(text));
	const blocks = [];
	const paragraphLines = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const equation = inverseSquareEquationBlock(lines, index);
		if (equation) {
			flushParagraph(blocks, paragraphLines);
			blocks.push(equation.block);
			index += equation.consumed - 1;
			continue;
		}

		const figureBlock = question ? figureBlockForLine(question, line) : null;
		if (figureBlock) {
			flushParagraph(blocks, paragraphLines);
			blocks.push(figureBlock);
			continue;
		}

		const table = question ? tableBlockAtLine(question, line, lines, index) : null;
		if (table) {
			flushParagraph(blocks, paragraphLines);
			blocks.push(table.block);
			index += table.consumed - 1;
			continue;
		}

		const inlineFigure = splitInlineFigureLine(question, line);
		if (inlineFigure) {
			paragraphLines.push(inlineFigure.before);
			flushParagraph(blocks, paragraphLines);
			const nextLineHasSameFigure =
				lines[index + 1]?.toLowerCase() === inlineFigure.label.toLowerCase();
			if (!nextLineHasSameFigure) {
				const block = figureBlockForLabel(question, inlineFigure.label);
				if (block) blocks.push(block);
			}
			if (inlineFigure.after) paragraphLines.push(inlineFigure.after);
			continue;
		}

		if (/^\d+\.\s+/.test(line)) {
			flushParagraph(blocks, paragraphLines);
			const items = [];
			while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
				items.push(withInlineMath(lines[index].replace(/^\d+\.\s+/, '').trim()));
				index += 1;
			}
			index -= 1;
			blocks.push({ kind: 'ordered-list', items });
			continue;
		}

		if (/^•\s+/.test(line)) {
			flushParagraph(blocks, paragraphLines);
			const items = [];
			while (index < lines.length && /^•\s+/.test(lines[index])) {
				items.push(withInlineMath(lines[index].replace(/^•\s+/, '').trim()));
				index += 1;
			}
			index -= 1;
			blocks.push({ kind: 'bullet-list', items });
			continue;
		}

		paragraphLines.push(line);
	}

	flushParagraph(blocks, paragraphLines);
	return blocks;
}

function isPromptStartLine(line) {
	return /^(?:Calculate|Choose|Compare|Complete|Describe|Determine|Draw|Evaluate|Explain|Give|Identify|Label|Name|Plot|Predict|Show|Sketch|Suggest|State|Tick|Use|What|Which|Why|Write)\b/i.test(
		line
	);
}

function promptSourceText(question) {
	const prompt = firstText(question.prompt_text);
	const selfContained = firstText(question.self_contained_prompt_markdown);
	if (prompt && extractMarks(prompt) !== null) return prompt;
	if (selfContained && extractMarks(selfContained) !== null) return selfContained;
	return (
		firstText(prompt, question.self_contained_prompt_text, question.full_prompt_text) ?? question.id
	);
}

function removeParentStemPrefix(text, question) {
	const parent = firstText(question.parent_stem);
	if (!parent) return text;
	const trimmed = text.trim();
	if (trimmed.startsWith(parent)) return trimmed.slice(parent.length).trim();
	return trimmed;
}

function removeResponseLinesFromPrompt(text, response) {
	const lines = cleanPromptLines(text);
	if (!lines.length) return '';

	if (response.kind === 'choice' || response.kind === 'choice-table') {
		const index = lines.findIndex((line) => /\b(?:tick|choose)\b.*\b(?:one box|one)\b/i.test(line));
		if (index >= 0) return lines.slice(0, index + 1).join('\n');
	}

	if (response.kind === 'matching') {
		const index = lines.findIndex((line) => /\bdraw\s+(?:one\s+)?lines?\s+from\b/i.test(line));
		if (index >= 0) return lines.slice(0, index + 1).join('\n');
	}

	if (
		(response.kind === 'asset-canvas' && response.labelBank?.length) ||
		(response.kind === 'image-label-zones' && response.labels?.length)
	) {
		const index = lines.findIndex((line) => /\bchoose the answers from the box\b/i.test(line));
		if (index >= 0) return lines.slice(0, index + 1).join('\n');
	}

	if (response.kind === 'number-line' || response.kind === 'equation-blanks') {
		return lines.filter((line) => !isAnswerLine(line)).join('\n');
	}

	return lines.join('\n');
}

function isAnswerLine(line) {
	return (
		/_{3,}/.test(line) || /^[A-Z][A-Za-z0-9 ()/%µ-]{0,40}\s*=\s*(?:×|x)?\s*[\w/%µ]*$/i.test(line)
	);
}

function extractChoiceInteraction(question, sourceText) {
	const text = sourceConstraintText(question);
	if (
		!/\btick\b[\s\S]{0,20}\bone box\b/i.test(text) &&
		!/\bchoose\b[\s\S]{0,30}\bone\b/i.test(text)
	) {
		return null;
	}

	const optionLines = promptLinesAfterInstruction(
		sourceText ?? question.prompt_text ?? '',
		/\b(?:tick|choose)\b.*\b(?:one box|one)\b/i
	).map(stripListMarker);
	const splitRows = optionLines.map(splitPaperColumns).filter((row) => row.length > 0);
	const tableWidth = splitRows[0]?.length ?? 0;

	if (
		splitRows.length >= 2 &&
		tableWidth > 1 &&
		splitRows.slice(1).every((row) => row.length === tableWidth)
	) {
		return {
			kind: 'choice-table',
			mode: 'single',
			columns: splitRows[0].map(withInlineMath),
			rows: splitRows.slice(1).map((row) => row.map(withInlineMath)),
			provenance: 'prompt-text-heuristic'
		};
	}

	if (splitRows.length === 1 && splitRows[0].length > 1) {
		return {
			kind: 'choice',
			mode: 'single',
			options: splitRows[0].map(withInlineMath),
			layout: 'horizontal',
			provenance: 'prompt-text-heuristic'
		};
	}

	return {
		kind: 'choice',
		mode: 'single',
		options: optionLines.map(withInlineMath),
		layout: 'vertical',
		provenance: optionLines.length > 0 ? 'prompt-text-heuristic' : 'constraint-only'
	};
}

function extractMatchingInteraction(question, sourceText) {
	const prompt = stripMarkBrackets(sourceText ?? question.prompt_text ?? '');
	if (!/\bdraw\s+(?:one\s+)?lines?\s+from\b/i.test(prompt)) return null;

	const optionLines = promptLinesAfterInstruction(prompt, /\bdraw\s+(?:one\s+)?lines?\s+from\b/i);
	const rows = optionLines.map(splitPaperColumns).filter((parts) => parts.length >= 2);

	if (rows.length < 2) {
		return {
			kind: 'matching',
			leftTitle: null,
			rightTitle: null,
			left: [],
			right: [],
			provenance: 'constraint-only'
		};
	}

	const left = rows
		.map((parts) => parts[0])
		.filter(Boolean)
		.map(withInlineMath);
	const right = rows
		.map((parts) => parts.at(-1))
		.filter(Boolean)
		.map(withInlineMath);
	const headingText = optionLines.join(' ');

	return {
		kind: 'matching',
		leftTitle: /cell structure/i.test(headingText) ? 'Cell Structure' : null,
		rightTitle: /type of cell|structure is found/i.test(headingText)
			? 'Type of cell where the structure is found'
			: null,
		left,
		right,
		provenance: left.length > 0 && right.length > 0 ? 'prompt-text-heuristic' : 'constraint-only'
	};
}

function extractEquationBlankInteraction(question, sourceText) {
	const prompt = stripMarkBrackets(sourceText ?? question.prompt_text ?? '');
	if (!/_{3,}/.test(prompt)) return null;

	const line = prompt
		.split(/\r?\n/)
		.map((candidate) => candidate.trim())
		.find((candidate) => /_{3,}/.test(candidate));
	if (!line) return null;
	const blankCount = Array.from(line.matchAll(/_{3,}/g)).length;
	if (blankCount < 2) return null;

	const segments = [];
	let blankIndex = 1;
	let cursor = 0;
	for (const match of line.matchAll(/_{3,}/g)) {
		const start = match.index ?? 0;
		if (start > cursor) {
			segments.push({ kind: 'text', text: line.slice(cursor, start) });
		}
		segments.push({
			kind: 'blank',
			id: `blank-${blankIndex}`,
			label: `Blank ${blankIndex}`,
			width: Math.max(80, match[0].length * 9)
		});
		blankIndex += 1;
		cursor = start + match[0].length;
	}
	if (cursor < line.length) {
		segments.push({ kind: 'text', text: line.slice(cursor) });
	}

	return {
		kind: 'equation-blanks',
		segments,
		provenance: 'prompt-text-heuristic'
	};
}

function extractLabelBank(question) {
	const prompt = stripMarkBrackets(question.prompt_text ?? '');
	if (!/\bchoose the answers from the box\b/i.test(prompt)) return [];
	const optionLines = promptLinesAfterInstruction(prompt, /\bchoose the answers from the box\b/i);
	return optionLines.flatMap(splitPaperColumns);
}

function assetImageWidth(asset) {
	const candidates = asset?.metadata?.image_candidates;
	const width = Array.isArray(candidates) ? candidates[0]?.width : null;
	return Number.isFinite(width) ? width : undefined;
}

function detectHorizontalAnswerLineZones(asset) {
	if (!asset?.file_path) return [];
	const filePath = path.isAbsolute(asset.file_path)
		? asset.file_path
		: path.join(rootDir, asset.file_path);
	if (!existsSync(filePath)) return [];

	const script = `
import json
import sys
from PIL import Image
img = Image.open(sys.argv[1]).convert("L")
w, h = img.size
pix = img.load()
segments = []
for y in range(h):
    x = 0
    while x < w:
        while x < w and pix[x, y] >= 80:
            x += 1
        start = x
        while x < w and pix[x, y] < 80:
            x += 1
        end = x
        if end - start >= max(180, int(w * 0.13)):
            segments.append((y, start, end))
clusters = []
for y, start, end in segments:
    for cluster in clusters:
        if abs(cluster["y"] - y) <= 4 and not (end < cluster["start"] - 20 or start > cluster["end"] + 20):
            cluster["ys"].append(y)
            cluster["start"] = min(cluster["start"], start)
            cluster["end"] = max(cluster["end"], end)
            cluster["y"] = sum(cluster["ys"]) / len(cluster["ys"])
            break
    else:
        clusters.append({"ys": [y], "y": y, "start": start, "end": end})
zones = []
for index, cluster in enumerate(sorted(clusters, key=lambda item: (item["y"], item["start"]))):
    line_width = cluster["end"] - cluster["start"]
    line_height = max(cluster["ys"]) - min(cluster["ys"]) + 1
    if line_width < max(180, int(w * 0.13)) or line_height > 8:
        continue
    zone_height = max(36, int(h * 0.075))
    y0 = int(cluster["y"] - zone_height * 1.05)
    zones.append({
        "id": f"blank-{len(zones) + 1}",
        "label": f"Blank {len(zones) + 1}",
        "x": round(cluster["start"] / w, 4),
        "y": round(y0 / h, 4),
        "width": round(line_width / w, 4),
        "height": round(zone_height / h, 4)
    })
print(json.dumps({"width": w, "height": h, "zones": zones}))
`;

	try {
		const raw = execFileSync('python3', ['-c', script, filePath], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		});
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed.zones) ? parsed.zones : [];
	} catch {
		return [];
	}
}

function extractImageLabelZonesInteraction(question, sourceText) {
	const labels = extractLabelBank(question);
	if (!labels.length) return null;
	const prompt = sourceText ?? question.prompt_text ?? '';
	if (!/\bwrite\s+the\s+labels?\s+on\s+figure\b/i.test(prompt)) return null;
	const figureLabel = prompt.match(/\b(Figure\s+\d+)\b/i)?.[1];
	const asset = figureLabel
		? assetByLabel(question, figureLabel)
		: question.assets?.find((item) => item.public_path);
	if (!asset?.id || !asset.public_path) return null;
	const zones = detectHorizontalAnswerLineZones(asset);
	if (!zones.length) return null;
	const correctAnswers = knownImageLabelZoneAnswers(question.id);
	return {
		kind: 'image-label-zones',
		assetId: asset.id,
		labels: labels.map(withInlineMath),
		zones,
		width: assetImageWidth(asset),
		allowRepeats: true,
		...(correctAnswers ? { correctAnswers } : {}),
		provenance: 'image-line-detection'
	};
}

function knownImageLabelZoneAnswers(questionId) {
	const keys = {
		'8464p1h-jun18-01-1': {
			'blank-1': 'nucleus',
			'blank-2': 'electron',
			'blank-3': 'orbit',
			'blank-4': 'atom'
		}
	};
	return keys[questionId] ?? null;
}

function extractAssetCanvasInteraction(question, sourceText) {
	const labels = extractLabelBank(question);
	const prompt = sourceText ?? question.prompt_text ?? '';
	const answerCanvas =
		(question.assets ?? []).find(
			(candidate) =>
				candidate.public_path &&
				candidate.role === 'answer_canvas' &&
				candidate.asset_type !== 'table'
		) ??
		(question.assets ?? []).find(
			(candidate) => candidate.public_path && candidate.role === 'answer_canvas'
		);
	const labelAsset =
		(question.assets ?? []).find((candidate) => candidate.public_path && candidate.required) ??
		question.assets?.find((candidate) => candidate.public_path);
	const asset = labels.length > 0 ? labelAsset : answerCanvas;
	if (!asset?.public_path) return null;
	if (!/\b(?:write|label|complete|draw|plot)\b[\s\S]{0,80}\b(?:figure|graph)\b/i.test(prompt)) {
		return null;
	}

	return {
		kind: 'asset-canvas',
		assetId: asset.id,
		labelBank: labels.length ? labels : undefined,
		placement: 'free',
		zoneProvenance: 'missing',
		provenance: 'prompt-text-heuristic'
	};
}

function extractNumberLineInteraction(question, sourceText) {
	const lines = cleanPromptLines(sourceText ?? question.prompt_text ?? '');
	const line = [...lines].reverse().find(isAnswerLine);
	if (!line) return null;
	if (/_{3,}/.test(line) && Array.from(line.matchAll(/_{3,}/g)).length > 1) return null;

	const magnification = line.match(/^(Magnification\s*=)\s*(?:×|x)?\s*_*$/i);
	if (magnification) {
		return {
			kind: 'number-line',
			label: magnification[1],
			prefix: '×',
			provenance: 'prompt-text-heuristic'
		};
	}

	const match = line.match(/^(.{1,44}?=)\s*(?:_{2,})?\s*([A-Za-zµ/%0-9]+(?:\/[A-Za-z0-9]+)?)?$/);
	if (!match) return null;
	return {
		kind: 'number-line',
		label: withInlineMath(match[1].trim()),
		unit: match[2] ? withInlineMath(match[2].trim()) : undefined,
		provenance: 'prompt-text-heuristic'
	};
}

function extractLabeledLinesInteraction(question, sourceText) {
	const text = sourceText ?? question.prompt_text ?? '';
	if (/two advantages and two disadvantages/i.test(text)) {
		return {
			kind: 'labeled-lines',
			labels: ['Advantage 1', 'Advantage 2', 'Disadvantage 1', 'Disadvantage 2'],
			lineCount: 2,
			provenance: 'prompt-text-heuristic'
		};
	}
	if (
		/one advantage and one disadvantage/i.test(text) ||
		/advantage\s*\n\s*disadvantage/i.test(text)
	) {
		return {
			kind: 'labeled-lines',
			labels: ['Advantage', 'Disadvantage'],
			lineCount: 2,
			provenance: 'prompt-text-heuristic'
		};
	}
	return null;
}

function fallbackLineCount(question) {
	if (Number.isFinite(question.marks) && question.marks > 0) {
		return Math.max(1, Math.min(8, Number(question.marks)));
	}
	return 1;
}

function responseInteraction(question, sourceText) {
	return (
		extractImageLabelZonesInteraction(question, sourceText) ??
		extractAssetCanvasInteraction(question, sourceText) ??
		extractEquationBlankInteraction(question, sourceText) ??
		extractMatchingInteraction(question, sourceText) ??
		extractChoiceInteraction(question, sourceText) ??
		extractNumberLineInteraction(question, sourceText) ??
		extractLabeledLinesInteraction(question, sourceText) ?? {
			kind: 'lines',
			count: fallbackLineCount(question),
			lineCountSource: 'marks-fallback'
		}
	);
}

function responseAssetId(response) {
	if (response.kind === 'asset-canvas' || response.kind === 'image-label-zones') {
		return response.assetId;
	}
	return null;
}

function removeResponseOwnedFigures(blocks, response) {
	const assetId = responseAssetId(response);
	if (!assetId) return blocks;
	return blocks.filter((block) => !(block.kind === 'figure' && block.assetId === assetId));
}

function renderingOverlayForQuestion(question) {
	const requiredAssets = (question.assets ?? [])
		.filter((asset) => asset.required)
		.map((asset) => ({
			id: asset.id,
			role: asset.role ?? null,
			sourceLabel: asset.source_label ?? null,
			publicPath: asset.public_path ?? null,
			assetType: asset.asset_type ?? 'image'
		}));

	const sourceText = removeParentStemPrefix(promptSourceText(question), question);
	const response = responseInteraction(question, sourceText);
	const cleanedPromptText = removeResponseLinesFromPrompt(sourceText, response);
	const stemBlocks = question.parent_stem ? textBlocks(question.parent_stem, question) : [];
	const promptBlocks = blocksFromSourceText(cleanedPromptText, question);

	return {
		version: 'v2',
		provenance: 'structured-extraction-overlay',
		stemBlocks: removeResponseOwnedFigures(stemBlocks, response),
		leadBlocks: [],
		promptBlocks: removeResponseOwnedFigures(promptBlocks, response),
		response,
		afterResponseBlocks: [],
		assets: requiredAssets,
		layout: {
			paperTextPx: 15,
			sourcePageStart: question.page_start ?? null,
			sourcePageEnd: question.page_end ?? null
		},
		metadata: {
			source: 'baseline-fallback',
			source_constraints: question.source_constraints ?? [],
			structured_constraints: question.structured_constraints ?? [],
			answer_format: question.answer_format ?? null,
			visual_dependency: question.visual_dependency ?? 'none',
			tables: question.tables ?? [],
			context_blocks: question.context_blocks ?? []
		}
	};
}

function evidenceForStep(step) {
	return step.supporting_evidence ?? step.mark_support ?? step.mark_scheme_support ?? [];
}

function collectQuestionMemberships(semanticFiles) {
	const memberships = new Map();

	function upsert(questionId, chainId, patch = {}) {
		if (!questionId || !chainId) return;
		const key = `${questionId}:${chainId}`;
		const existing = memberships.get(key) ?? {
			question_id: questionId,
			answer_chain_id: chainId,
			is_primary: 1,
			transfer_distance: 'unclassified',
			display_order: null,
			fit_confidence: null,
			fit_notes: null,
			needs_human_review: 0,
			review_notes: [],
			metadata: {}
		};
		memberships.set(key, {
			...existing,
			...patch,
			review_notes: [
				...(existing.review_notes ?? []),
				...(patch.review_notes ?? []),
				...(patch.question_review_notes ?? [])
			].filter(Boolean),
			metadata: { ...(existing.metadata ?? {}), ...(patch.metadata ?? {}) }
		});
	}

	for (const semantic of semanticFiles) {
		const chainIds = new Set((semantic.answer_chain_candidates ?? []).map((chain) => chain.id));

		for (const chain of semantic.answer_chain_candidates ?? []) {
			for (const [index, question] of (chain.supporting_questions ?? []).entries()) {
				upsert(question.question_id, chain.id, {
					transfer_distance: normalizeTransferDistance(question.transfer_distance),
					display_order: question.display_order ?? index + 1,
					fit_confidence: question.fit_confidence ?? null,
					fit_notes:
						question.fit_rationale ?? question.rationale ?? question.prompt_summary ?? null,
					needs_human_review: bool(
						question.needs_human_review ?? question.needs_human_review_from_baseline
					),
					review_notes: question.review_notes ?? question.question_review_notes ?? [],
					metadata: { source: 'answer_chain.supporting_questions', raw: question }
				});
			}
			for (const [index, question] of (chain.constellation_questions ?? []).entries()) {
				upsert(question.question_id, chain.id, {
					transfer_distance: normalizeTransferDistance(question.transfer_distance),
					display_order: question.display_order ?? index + 1,
					fit_confidence: question.fit_confidence ?? null,
					fit_notes: question.fit_rationale ?? question.rationale ?? null,
					needs_human_review: bool(question.needs_human_review),
					review_notes: question.review_notes ?? [],
					metadata: { source: 'answer_chain.constellation_questions', raw: question }
				});
			}
		}

		for (const constellation of semantic.constellation_candidates ?? []) {
			const chainId =
				constellation.answer_chain_id ??
				constellation.answer_chain_candidate_id ??
				constellation.chain_id;
			if (!chainId || !chainIds.has(chainId)) continue;
			const questions = constellation.questions ?? constellation.member_questions ?? [];
			for (const [index, question] of questions.entries()) {
				upsert(question.question_id, chainId, {
					transfer_distance: normalizeTransferDistance(question.transfer_distance),
					display_order: question.display_order ?? index + 1,
					fit_confidence: question.fit_confidence ?? question.confidence ?? null,
					fit_notes: question.rationale ?? question.fit_rationale ?? null,
					needs_human_review: bool(question.needs_human_review),
					review_notes: question.review_notes ?? [],
					metadata: { source: 'constellation.questions', raw: question }
				});
			}
		}

		const autoMatches = semantic.backlog?.auto_matched_candidate_questions_by_chain ?? {};
		for (const [chainId, questions] of Object.entries(autoMatches)) {
			for (const [index, question] of (questions ?? []).entries()) {
				upsert(question.question_id ?? question.id, chainId, {
					transfer_distance: normalizeTransferDistance(question.transfer_distance),
					display_order: question.display_order ?? 1000 + index,
					fit_confidence: question.fit_confidence ?? question.confidence ?? null,
					fit_notes:
						question.rationale ?? question.fit_rationale ?? 'Auto-matched chain candidate.',
					needs_human_review: bool(question.needs_human_review ?? true),
					review_notes: question.review_notes ?? [
						'Auto-matched candidate; review before publishing.'
					],
					metadata: { source: 'backlog.auto_matched_candidate_questions_by_chain', raw: question }
				});
			}
		}
	}

	return Array.from(memberships.values());
}

function splitSqlStatements(sql) {
	return sql
		.split(';')
		.map((statement) => statement.trim())
		.filter((statement) => statement && !statement.startsWith('--'));
}

async function executeBatch(statements, label) {
	if (statements.length === 0 || dryRun) return;

	for (let index = 0; index < statements.length; index += batchSize) {
		const batch = statements.slice(index, index + batchSize);
		const response = await fetch(d1QueryUrl, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({ batch })
		});
		const bodyText = await response.text();
		if (!response.ok) {
			throw new Error(
				`D1 batch failed (${label} ${index + 1}-${index + batch.length}): ${response.status} ${response.statusText}: ${bodyText}`
			);
		}
		const body = JSON.parse(bodyText);
		if (!body.success) {
			throw new Error(
				`D1 batch failed (${label} ${index + 1}-${index + batch.length}): ${JSON.stringify(body.errors ?? body)}`
			);
		}
		const failed = (body.result ?? []).find((result) => result?.success === false);
		if (failed) {
			throw new Error(
				`D1 batch statement failed (${label} ${index + 1}-${index + batch.length}): ${JSON.stringify(failed)}`
			);
		}
		console.log(
			`${label}: ${Math.min(index + batch.length, statements.length)}/${statements.length}`
		);
	}
}

async function applySchema() {
	const sql = readFileSync(migrationPath, 'utf8');
	await executeBatch(
		splitSqlStatements(sql).map((statement) => ({ sql: statement })),
		'schema'
	);
}

async function clearPublicTables() {
	const tables = [
		'constellation_questions',
		'constellations',
		'common_weak_answers',
		'question_answer_chains',
		'cross_subject_chain_family_members',
		'cross_subject_chain_families',
		'chain_family_members',
		'chain_families',
		'answer_chain_steps',
		'answer_chains',
		'model_answers',
		'mark_checklist_items',
		'mark_scheme_items',
		'question_response_answer_keys',
		'question_rendering_overlays',
		'question_assets',
		'questions',
		'source_documents',
		'content_imports'
	];
	await executeBatch(
		tables.map((table) => ({ sql: `DELETE FROM ${table}` })),
		'clear'
	);
}

function insertStatement(table, columns, values) {
	const placeholders = columns.map(() => '?').join(', ');
	return {
		sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
		params: values
	};
}

function stableSqlId(value) {
	return String(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function responseAnswerKeyOrder(response, targetId, fallbackOrder) {
	if (response.kind === 'image-label-zones') {
		const zoneIndex = (response.zones ?? []).findIndex((zone) => zone.id === targetId);
		return zoneIndex >= 0 ? zoneIndex + 1 : fallbackOrder;
	}

	if (response.kind === 'matching') {
		const leftIndex = (response.left ?? []).findIndex((left) => left === targetId);
		return leftIndex >= 0 ? leftIndex + 1 : fallbackOrder;
	}

	if (response.kind === 'equation-blanks') {
		const blankIndex = (response.segments ?? []).findIndex(
			(segment) => segment?.kind === 'blank' && segment.id === targetId
		);
		return blankIndex >= 0 ? blankIndex + 1 : fallbackOrder;
	}

	if (response.kind === 'choice' || response.kind === 'choice-table') {
		return targetId === 'answer' ? 1 : fallbackOrder;
	}

	return fallbackOrder;
}

function insertResponseAnswerKeyStatements(insertStatements, question, renderingOverlay) {
	const response = renderingOverlay?.response;
	if (!response || !response.correctAnswers || typeof response.correctAnswers !== 'object') {
		return;
	}

	for (const [index, [targetId, correctAnswer]] of Object.entries(
		response.correctAnswers
	).entries()) {
		if (!targetId || typeof correctAnswer !== 'string' || !correctAnswer.trim()) continue;
		insertStatements.push(
			insertStatement(
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
					`${question.id}-response-key-${stableSqlId(targetId)}`,
					question.id,
					response.kind,
					targetId,
					correctAnswer.trim(),
					responseAnswerKeyOrder(response, targetId, index + 1),
					json([], []),
					json({ source: 'rendering_overlay_correct_answers' }, {})
				]
			)
		);
	}
}

function semanticChainIdForConstellation(constellation) {
	return (
		constellation.answer_chain_id ??
		constellation.answer_chain_candidate_id ??
		constellation.chain_id
	);
}

const baseline = readJson(baselinePath);
const semanticFiles = ['biology', 'chemistry', 'physics'].map((subject) =>
	readJson(path.join(semanticDir, `${subject}.json`))
);
const allQuestions = new Map((baseline.questions ?? []).map((question) => [question.id, question]));
const sourceDocuments = new Map((baseline.source_documents ?? []).map((doc) => [doc.id, doc]));
const chains = semanticFiles.flatMap((semantic) => semantic.answer_chain_candidates ?? []);
const chainIds = new Set(chains.map((chain) => chain.id));
const constellations = semanticFiles.flatMap((semantic) => semantic.constellation_candidates ?? []);
const memberships = collectQuestionMemberships(semanticFiles).filter(
	(membership) =>
		allQuestions.has(membership.question_id) && chainIds.has(membership.answer_chain_id)
);
const chainedQuestionIds = new Set(memberships.map((membership) => membership.question_id));
const experimentQuestionIds = new Set(
	(baseline.questions ?? [])
		.filter((question) => experimentSourceDocumentIds.has(question.source_document_id))
		.map((question) => question.id)
);
const importedQuestionIds = new Set(
	(baseline.questions ?? [])
		.filter((question) => {
			if (onlyExperimentPapers) return experimentQuestionIds.has(question.id);
			return (
				chainedQuestionIds.has(question.id) ||
				(includeExperimentPapers && experimentQuestionIds.has(question.id))
			);
		})
		.map((question) => question.id)
);
const importedQuestions = (baseline.questions ?? []).filter((question) =>
	importedQuestionIds.has(question.id)
);
const sourceDocumentAssetsByLabel = new Map();
const sourceDocumentAssetsByPage = new Map();
for (const question of importedQuestions) {
	for (const asset of question.assets ?? []) {
		if (!asset.source_label || !asset.public_path) continue;
		const key = `${question.source_document_id}:${asset.source_label.toLowerCase()}`;
		if (!sourceDocumentAssetsByLabel.has(key)) sourceDocumentAssetsByLabel.set(key, asset);
		if (Number.isFinite(asset.page_number)) {
			const pageKey = `${question.source_document_id}:${asset.page_number}`;
			const assets = sourceDocumentAssetsByPage.get(pageKey) ?? [];
			if (!assets.some((existing) => existing.id === asset.id)) assets.push(asset);
			sourceDocumentAssetsByPage.set(pageKey, assets);
		}
	}
}
const importedMemberships = memberships.filter((membership) =>
	importedQuestionIds.has(membership.question_id)
);
const neededSourceDocumentIds = new Set(
	importedQuestions.map((question) => question.source_document_id).filter(Boolean)
);
const importedConstellations = constellations.filter((constellation) =>
	chains.some((chain) => chain.id === semanticChainIdForConstellation(constellation))
);

console.log(
	JSON.stringify(
		{
			database_id: databaseId,
			dry_run: dryRun,
			schema_only: schemaOnly,
			include_experiment_papers: includeExperimentPapers,
			only_experiment_papers: onlyExperimentPapers,
			chains: chains.length,
			chain_families: chains.length,
			constellations: importedConstellations.length,
			chained_questions: chainedQuestionIds.size,
			experiment_paper_questions: experimentQuestionIds.size,
			imported_questions: importedQuestionIds.size,
			imported_memberships: importedMemberships.length,
			rendering_overlays: importedQuestionIds.size,
			question_assets: importedQuestions.reduce(
				(count, question) => count + (question.assets?.length ?? 0),
				0
			)
		},
		null,
		2
	)
);

if (!skipSchema) {
	await applySchema();
}

if (!schemaOnly) {
	await clearPublicTables();
	const insertStatements = [];

	for (const sourceDocumentId of neededSourceDocumentIds) {
		const doc = sourceDocuments.get(sourceDocumentId);
		if (!doc) continue;
		insertStatements.push(
			insertStatement(
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
					doc.doc_type,
					doc.board ?? null,
					doc.qualification ?? null,
					doc.subject ?? null,
					doc.subject_area ?? null,
					doc.tier ?? null,
					doc.paper ?? null,
					doc.component_code ?? null,
					doc.series ?? null,
					doc.year ?? null,
					doc.title ?? null,
					doc.source_url ?? null,
					doc.file_path ?? null,
					doc.file_hash ?? null,
					doc.page_count ?? null,
					json(doc.metadata, {})
				]
			)
		);
	}

	for (const question of importedQuestions) {
		const prompt = firstText(
			question.prompt_text,
			question.self_contained_prompt_text,
			question.full_prompt_text
		);
		insertStatements.push(
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
					question.id,
					question.source_document_id,
					question.parent_source_question_ref ?? null,
					question.source_question_ref,
					question.id,
					question.display_order ?? 0,
					prompt,
					question.self_contained_prompt_text ?? null,
					contextText(question) || null,
					question.command_word ?? null,
					question.marks ?? null,
					question.board ?? null,
					question.qualification ?? null,
					question.subject ?? null,
					question.subject_area ?? null,
					question.tier ?? null,
					question.paper ?? null,
					question.component_code ?? null,
					question.series ?? null,
					question.year ?? null,
					json(question.topic_path, []),
					question.spec_ref ?? null,
					question.page_start ?? null,
					question.page_end ?? null,
					question.answer_format ?? null,
					json(question.source_constraints, []),
					json(question.self_containment, {}),
					question.question_segmentation_confidence ?? null,
					bool(question.needs_human_review),
					json(question.review_notes, []),
					question.status ?? 'draft',
					json(
						{
							title: titleFromQuestion(question),
							figure_refs: question.figure_refs ?? [],
							table_refs: question.table_refs ?? [],
							visual_dependency: question.visual_dependency ?? 'none',
							full_prompt_text: question.full_prompt_text ?? null,
							structured_constraints: question.structured_constraints ?? []
						},
						{}
					)
				]
			)
		);

		const renderingOverlay = renderingOverlayForQuestion(question);
		insertStatements.push(
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
					`${question.id}-render-v1`,
					question.id,
					question.source_document_id,
					question.source_question_ref,
					renderingOverlay.version,
					renderingOverlay.provenance,
					question.question_segmentation_confidence ?? null,
					bool(question.needs_human_review ?? true),
					json(renderingOverlay, {})
				]
			)
		);
		insertResponseAnswerKeyStatements(insertStatements, question, renderingOverlay);

		for (const [index, asset] of (question.assets ?? []).entries()) {
			insertStatements.push(
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
						asset.id ?? `${question.id}-asset-${index + 1}`,
						question.id,
						asset.asset_type ?? 'image',
						asset.source_label ?? null,
						bool(asset.required),
						asset.role ?? null,
						asset.page_number ?? null,
						json(asset.bbox, null),
						asset.alt_text ?? null,
						asset.extracted_text ?? null,
						asset.file_path ?? null,
						asset.r2_key ?? null,
						asset.public_path ?? null,
						asset.extraction_confidence ?? null,
						bool(asset.needs_human_review),
						json(asset.metadata, {})
					]
				)
			);
		}

		for (const [index, item] of (question.mark_scheme_items ?? []).entries()) {
			insertStatements.push(
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
						`${question.id}-ms-${index + 1}`,
						question.id,
						item.source_document_id ?? null,
						index + 1,
						item.item_type ?? 'mark',
						item.text,
						item.marks ?? null,
						item.source_ref ?? null,
						item.confidence ?? null,
						json(item.metadata, {})
					]
				)
			);
		}

		for (const [index, item] of (question.mark_checklist ?? []).entries()) {
			const markSchemeItemIds = (item.mark_scheme_item_indexes ?? []).map(
				(itemIndex) => `${question.id}-ms-${Number(itemIndex) + 1}`
			);
			insertStatements.push(
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
						`${question.id}-check-${index + 1}`,
						question.id,
						index + 1,
						item.text,
						bool(item.required ?? true),
						json(markSchemeItemIds, []),
						item.confidence ?? null,
						bool(item.needs_human_review)
					]
				)
			);
		}

		const modelAnswer = modelAnswerForImport(question, renderingOverlay);
		if (modelAnswer?.answer_text) {
			insertStatements.push(
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
						`${question.id}-model-answer`,
						question.id,
						modelAnswer.answer_text,
						modelAnswer.derivation ?? 'generated_from_mark_scheme',
						json(modelAnswer.supporting_mark_scheme_item_ids, []),
						modelAnswer.confidence ?? null,
						bool(modelAnswer.needs_human_review)
					]
				)
			);
		}
	}

	for (const chain of chains) {
		insertStatements.push(
			insertStatement(
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
					chain.id,
					chain.id,
					chain.title,
					chain.canonical_chain_text,
					'Combined Science',
					chain.subject_area ?? null,
					chain.broad_topic_metadata ?? null,
					chain.why_questions_share_chain ?? chain.why_same_chain ?? null,
					'extraction_agent',
					chain.confidence ?? null,
					bool(chain.needs_human_review),
					json(chain.review_notes, []),
					chain.status ?? 'draft',
					json(
						{
							why_questions_share_chain:
								chain.why_questions_share_chain ?? chain.why_same_chain ?? null,
							why_not_keyword_grouping:
								chain.why_not_keyword_grouping ?? chain.why_not_keyword_group ?? null,
							why_similar_questions_excluded: chain.why_similar_questions_excluded ?? null,
							excluded_similar_questions: chain.excluded_similar_questions ?? []
						},
						{}
					)
				]
			)
		);

		for (const [index, step] of (chain.steps ?? []).entries()) {
			insertStatements.push(
				insertStatement(
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
						`${chain.id}-step-${index + 1}`,
						chain.id,
						index + 1,
						step.step_text,
						step.step_role ?? 'link',
						step.explanation ?? null,
						step.common_omission ?? null,
						json(step.supported_by_mark_scheme_item_ids, []),
						json(evidenceForStep(step), [])
					]
				)
			);
		}

		const familyId = `${chain.id}-family`;
		const familySummary = chain.why_questions_share_chain ?? chain.why_same_chain ?? null;
		insertStatements.push(
			insertStatement(
				'chain_families',
				[
					'id',
					'slug',
					'title',
					'subject',
					'subject_area',
					'family_scope',
					'summary',
					'status',
					'confidence',
					'needs_human_review',
					'review_notes_json',
					'metadata_json'
				],
				[
					familyId,
					familyId,
					chain.title,
					'Combined Science',
					chain.subject_area ?? null,
					'subject',
					familySummary,
					chain.status ?? 'draft',
					chain.confidence ?? null,
					bool(chain.needs_human_review),
					json(chain.review_notes, []),
					json(
						{
							source: 'semantic-chain-candidate',
							answer_chain_id: chain.id,
							canonical_chain_text: chain.canonical_chain_text,
							broad_topic_metadata: chain.broad_topic_metadata ?? null,
							why_questions_share_chain: familySummary,
							why_similar_questions_excluded: chain.why_similar_questions_excluded ?? null,
							excluded_similar_questions: chain.excluded_similar_questions ?? []
						},
						{}
					)
				]
			),
			insertStatement(
				'chain_family_members',
				[
					'id',
					'chain_family_id',
					'answer_chain_id',
					'display_order',
					'role',
					'rationale',
					'confidence',
					'metadata_json'
				],
				[
					`${familyId}--${chain.id}`,
					familyId,
					chain.id,
					1,
					'primary',
					familySummary,
					chain.confidence ?? null,
					json({ source: 'semantic-chain-candidate' }, {})
				]
			)
		);
	}

	for (const membership of importedMemberships) {
		insertStatements.push(
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
					`${membership.question_id}--${membership.answer_chain_id}`,
					membership.question_id,
					membership.answer_chain_id,
					bool(membership.is_primary),
					membership.fit_confidence ?? null,
					membership.fit_notes ?? null,
					normalizeTransferDistance(membership.transfer_distance),
					membership.display_order ?? null,
					bool(membership.needs_human_review),
					json(membership.review_notes, []),
					json(membership.metadata, {})
				]
			)
		);
	}

	for (const constellation of importedConstellations) {
		const chainId = semanticChainIdForConstellation(constellation);
		insertStatements.push(
			insertStatement(
				'constellations',
				[
					'id',
					'slug',
					'title',
					'answer_chain_id',
					'board',
					'qualification',
					'subject',
					'subject_area',
					'tier',
					'paper',
					'topic_path_json',
					'summary',
					'confidence',
					'needs_human_review',
					'review_notes_json',
					'status',
					'metadata_json'
				],
				[
					constellation.id,
					constellation.id,
					constellation.title,
					chainId,
					'AQA',
					'GCSE',
					'Combined Science',
					constellation.subject_area ?? null,
					'Higher',
					null,
					json([], []),
					constellation.why_questions_share_chain ?? constellation.why_same_chain ?? null,
					constellation.confidence ?? null,
					bool(constellation.needs_human_review),
					json(constellation.review_notes, []),
					constellation.status ?? 'draft',
					json(
						{
							why_not_keyword_grouping:
								constellation.why_not_keyword_grouping ??
								constellation.why_not_keyword_group ??
								null,
							why_similar_questions_excluded: constellation.why_similar_questions_excluded ?? null,
							excluded_similar_questions: constellation.excluded_similar_questions ?? []
						},
						{}
					)
				]
			)
		);

		const questions = constellation.questions ?? constellation.member_questions ?? [];
		for (const [index, question] of questions.entries()) {
			if (!importedQuestionIds.has(question.question_id)) continue;
			insertStatements.push(
				insertStatement(
					'constellation_questions',
					[
						'id',
						'constellation_id',
						'question_id',
						'display_order',
						'transfer_distance',
						'role',
						'rationale',
						'confidence',
						'needs_human_review',
						'metadata_json'
					],
					[
						`${constellation.id}--${question.question_id}`,
						constellation.id,
						question.question_id,
						question.display_order ?? index + 1,
						normalizeTransferDistance(question.transfer_distance),
						normalizeTransferDistance(question.transfer_distance) === 'start'
							? 'start'
							: 'practice',
						question.rationale ?? question.fit_rationale ?? null,
						question.fit_confidence ?? question.confidence ?? null,
						bool(question.needs_human_review),
						json({ raw: question }, {})
					]
				)
			);
		}
	}

	for (const question of importedQuestions) {
		for (const [index, weakAnswer] of (question.common_weak_answers ?? []).entries()) {
			if (!weakAnswer.weak_answer_text) continue;
			insertStatements.push(
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
						`${question.id}-weak-${index + 1}`,
						question.id,
						null,
						weakAnswer.weak_answer_text,
						json(weakAnswer.missing_step_indexes ?? [], []),
						null,
						'agent',
						weakAnswer.confidence ?? null,
						bool(weakAnswer.needs_human_review)
					]
				)
			);
		}
	}

	insertStatements.push(
		insertStatement(
			'content_imports',
			['id', 'source', 'question_count', 'chain_count', 'constellation_count', 'metadata_json'],
			[
				`chained-aqa-${new Date().toISOString()}`,
				'data/extracted-questions/aqa-combined-science-trilogy-higher/semantic-chains',
				importedQuestionIds.size,
				chains.length,
				importedConstellations.length,
				json(
					{
						baseline_file: path.relative(rootDir, baselinePath),
						semantic_files: ['biology.json', 'chemistry.json', 'physics.json'].map((file) =>
							path.relative(rootDir, path.join(semanticDir, file))
						),
						imported_chained_question_count: chainedQuestionIds.size,
						imported_experiment_paper_question_count: experimentQuestionIds.size,
						imported_membership_count: importedMemberships.length,
						rendering_overlay_count: importedQuestionIds.size,
						experiment_source_document_ids: Array.from(experimentSourceDocumentIds),
						cross_subject_chain_family_count: 0
					},
					{}
				)
			]
		)
	);

	await executeBatch(insertStatements, 'insert');
}

console.log('Import complete.');
