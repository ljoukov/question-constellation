#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { subjectSymbol } from '../src/lib/subjectSymbols.js';
import { d1Config, d1Rows } from './lib/d1-rest.mjs';

const DEFAULT_BATCH_SIZE = 50;

function integerArg(name, defaultValue, minValue) {
	const arg = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
	if (!arg) return defaultValue;
	const value = Number(arg.slice(name.length + 3));
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer greater than or equal to ${minValue}.`);
	}
	return value;
}

function parseJson(raw, fallback) {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw);
	} catch {
		return fallback;
	}
}

function chunk(values, size) {
	const out = [];
	for (let index = 0; index < values.length; index += size) {
		out.push(values.slice(index, index + size));
	}
	return out;
}

function groupBy(values, keyFor) {
	const groups = new Map();
	for (const value of values) {
		const key = keyFor(value);
		const existing = groups.get(key);
		if (existing) existing.push(value);
		else groups.set(key, [value]);
	}
	return groups;
}

function sourceDocumentSlug(sourceDocumentId) {
	return sourceDocumentId.replace('-qp-', '-');
}

function practiceRoutePayloadId(chainId, ref) {
	return `practice:${chainId}:${ref}`;
}

const EXPLORABLE_CHAINS_PAYLOAD_ID = 'chains:explorable';
const HOME_PUBLIC_SUMMARY_PAYLOAD_ID = 'home:public-summary';

function practiceRoutePath(chainId, ref) {
	return `/practice/${encodeURIComponent(chainId)}/${encodeURIComponent(ref)}`;
}

function cleanPromptText(text) {
	return String(text ?? '')
		.replace(/\*\*/g, '')
		.split(/\r?\n/)
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.filter((line) => !/^\[\s*\d+\s*marks?\s*\]$/i.test(line))
		.filter((line) => !/^(?:figure|table)\s+\d+$/i.test(line))
		.join(' ')
		.trim();
}

function mathOpenerAt(value, index) {
	if (value.startsWith('$$', index)) return { open: '$$', close: '$$' };
	if (value.startsWith('\\[', index)) return { open: '\\[', close: '\\]' };
	if (value.startsWith('\\(', index)) return { open: '\\(', close: '\\)' };
	if (value[index] === '$' && value[index - 1] !== '\\') return { open: '$', close: '$' };
	return null;
}

function mathAwareCutIndex(value, limit) {
	let activeMath = null;
	let lastSafeBoundary = -1;
	let index = 0;

	while (index < limit) {
		if (activeMath) {
			if (value.startsWith(activeMath.close, index)) {
				index += activeMath.close.length;
				activeMath = null;
				continue;
			}
			index += 1;
			continue;
		}

		const opener = mathOpenerAt(value, index);
		if (opener) {
			activeMath = { close: opener.close, start: index };
			index += opener.open.length;
			continue;
		}

		if (/[\s,.;:!?)]/.test(value[index])) lastSafeBoundary = index;
		index += 1;
	}

	if (activeMath) return activeMath.start;
	return lastSafeBoundary > Math.floor(limit * 0.55) ? lastSafeBoundary : limit;
}

function truncateRichText(text, maxLength) {
	const normalized = String(text ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	if (normalized.length <= maxLength) return normalized;

	const limit = Math.max(1, maxLength - 3);
	const cutIndex = mathAwareCutIndex(normalized, limit);
	const snippet =
		normalized
			.slice(0, cutIndex)
			.trimEnd()
			.replace(/[,:;([{]+$/, '')
			.trimEnd() ||
		normalized
			.slice(0, limit)
			.replace(/\s+\S*$/, '')
			.trimEnd();

	return `${snippet}...`;
}

function sentenceTitle(text, fallback) {
	const cleaned = cleanPromptText(text);
	const sentence =
		cleaned.match(
			/(?:Explain|Calculate|Determine|Describe|Give|State|What|Which|Why|How|Name|Suggest|Compare|Draw|Complete|Use)\b[^.?!]*(?:[.?!]|$)/i
		)?.[0] ??
		cleaned.split(/(?<=[.?!])\s+/)[0] ??
		fallback;
	const normalized = sentence.replace(/\s+/g, ' ').trim() || fallback;
	return truncateRichText(normalized, 74);
}

function teaserFromPrompt(text) {
	return truncateRichText(cleanPromptText(text), 132);
}

function titleFromQuestion(row) {
	const metadata = parseJson(row.metadata_json, {});
	if (metadata.title) return metadata.title;
	return sentenceTitle(row.prompt_text, row.source_question_ref);
}

function topicFromRow(row) {
	const topicPath = parseJson(row.topic_path_json, []);
	return topicPath.at(-1) ?? row.subject_area ?? row.paper ?? 'GCSE science';
}

function subjectName(row) {
	return row.subject_area ?? row.subject ?? 'Science';
}

function subjectAccent(subject) {
	const lower = subject.toLowerCase();
	if (lower.includes('chemistry')) return 'amber';
	if (lower.includes('physics')) return 'blue';
	if (lower.includes('computer')) return 'blue';
	if (lower.includes('history')) return 'amber';
	return 'green';
}

function distanceLabel(value) {
	if (value === 'start') return 'Start here';
	if (value === 'near') return 'Similar';
	if (value === 'stretch') return 'Challenge';
	if (value === 'exam_transfer' || value === 'exam-transfer') return 'New context';
	return 'Small change';
}

function questionSortRank(value) {
	if (value === 'start') return 0;
	if (value === 'near') return 1;
	if (value === 'stretch') return 2;
	if (value === 'exam_transfer' || value === 'exam-transfer') return 3;
	return 4;
}

function sortQuestions(a, b) {
	return (
		questionSortRank(a.transfer_distance) - questionSortRank(b.transfer_distance) ||
		(a.display_order ?? 9999) - (b.display_order ?? 9999) ||
		(a.year ?? 0) - (b.year ?? 0) ||
		a.source_question_ref.localeCompare(b.source_question_ref)
	);
}

function paperLabel(row) {
	return [
		row.source_board ?? 'AQA',
		row.source_qualification ?? row.subject ?? 'GCSE',
		row.source_subject ?? row.subject_area ?? row.subject ?? 'Science',
		row.source_tier ? `${row.source_tier} Tier` : null,
		row.source_paper ?? row.source_component_code ?? row.paper,
		row.source_series ?? (row.source_year ? String(row.source_year) : null)
	]
		.filter(Boolean)
		.join(' · ');
}

function fallbackSteps(canonicalText) {
	const parts = String(canonicalText ?? '')
		.split(/\s*(?:->|=>)\s*/)
		.map((part) => part.trim())
		.filter(Boolean);
	return parts.length > 1 ? parts : [canonicalText];
}

function cleanSingleLine(text) {
	return String(text ?? '')
		.replace(/\s+/g, ' ')
		.trim();
}

function questionHintFromWeakAnswer(row, steps) {
	const explanation = row.weak_answer_explanation
		? cleanSingleLine(row.weak_answer_explanation)
		: '';
	if (explanation) return truncateRichText(`Avoid the common trap: ${explanation}`, 180);

	const missingStepRefs = parseJson(row.weak_missing_chain_step_ids_json, []);
	const missingSteps = missingStepRefs
		.map((item) => {
			if (typeof item === 'number') return steps[item]?.step_text;
			return steps.find((step) => step.id === item)?.step_text;
		})
		.filter(Boolean)
		.map((item) => item.replace(/\.$/, ''));

	if (missingSteps.length > 0) {
		return truncateRichText(`Focus on this link: ${missingSteps.join(' -> ')}`, 160);
	}

	const weakAnswer = row.weak_answer_text ? cleanSingleLine(row.weak_answer_text) : '';
	if (weakAnswer)
		return truncateRichText(`Do not stop at "${weakAnswer}". Use the full chain.`, 160);
	return null;
}

function toQuestionTeaser(row, steps) {
	return {
		id: row.id,
		ref: row.source_question_ref,
		sourceRef: row.source_question_ref,
		paperSlug: sourceDocumentSlug(row.source_document_id),
		paperLabel: paperLabel(row),
		title: titleFromQuestion(row),
		teaser: teaserFromPrompt(row.prompt_text),
		hint: questionHintFromWeakAnswer(row, steps),
		label: distanceLabel(row.transfer_distance),
		marks: row.marks,
		command: row.command_word ?? 'Question'
	};
}

function buildLearningChain(row, steps, questions) {
	const sortedQuestions = [...questions].sort(sortQuestions);
	const firstQuestion = sortedQuestions[0];
	if (!firstQuestion) return null;

	const subject = subjectName(row);
	const stepTexts = steps.length
		? [...steps]
				.sort((a, b) => a.display_order - b.display_order)
				.map((step) => step.step_text.replace(/\.$/, ''))
		: fallbackSteps(row.canonical_chain_text);

	return {
		id: row.id,
		title: row.title,
		subject,
		topic: row.broad_topic ?? topicFromRow(firstQuestion),
		symbol: subjectSymbol(subject),
		paperSlug: sourceDocumentSlug(firstQuestion.source_document_id),
		paperLabel: `${subject} · ${row.question_count} questions`,
		summary:
			row.summary ??
			`Practise ${sortedQuestions.length} questions that use the same thinking chain.`,
		steps: stepTexts,
		weakLink:
			steps.find((step) => step.common_omission)?.common_omission ??
			'Use each link in the chain before jumping to the final answer.',
		primaryRef: firstQuestion.id,
		accent: subjectAccent(subject),
		questions: sortedQuestions.map((question) => toQuestionTeaser(question, steps))
	};
}

function buildHomePublicSummary(chains) {
	const subjects = new Set(chains.map((chain) => chain.subject).filter(Boolean));
	return {
		featuredChains: chains.slice(0, 3),
		stats: {
			chainCount: chains.length,
			questionCount: chains.reduce((total, chain) => total + chain.questions.length, 0),
			subjectCount: subjects.size
		}
	};
}

function paperTitle(row) {
	return `${row.board ?? 'AQA'} ${row.qualification ?? 'GCSE'} ${row.subject ?? 'Combined Science'}: ${row.paper ?? row.component_code ?? 'Question paper'}`;
}

function paperSubtitle(row) {
	return [row.tier ? `${row.tier} Tier` : null, row.series].filter(Boolean).join(', ');
}

function paperSource(row) {
	const metadata = parseJson(row.metadata_json, {});
	return `D1/R2 render from ${metadata.aqa_original_filename ?? row.id}`;
}

function assetWidth(metadataJson) {
	const metadata = parseJson(metadataJson, {});
	const candidate = metadata.image_candidates?.find(
		(item) =>
			typeof item.width === 'number' &&
			typeof item.height === 'number' &&
			typeof item.x_ppi === 'number' &&
			typeof item.y_ppi === 'number' &&
			item.x_ppi > 0 &&
			item.y_ppi > 0
	);
	if (!candidate?.width || !candidate.x_ppi) return undefined;
	return Math.round((candidate.width / candidate.x_ppi) * 96);
}

function assetSrc(publicPath, r2Key) {
	const rawPath = publicPath || (r2Key ? `/${r2Key}` : '');
	if (!rawPath) return '';
	if (/^(?:https?:|data:|blob:)/i.test(rawPath)) return rawPath;
	if (rawPath.startsWith('/images/')) return rawPath;
	if (rawPath.startsWith('images/')) return `/${rawPath}`;
	if (rawPath.startsWith('/papers/')) return `/images${rawPath}`;
	if (rawPath.startsWith('papers/')) return `/images/${rawPath}`;

	const localAssetPrefix = 'data/aqa-combined-science-trilogy-higher/assets/question-papers/';
	const normalizedPath = rawPath.replace(/^\//, '');
	if (normalizedPath.startsWith(localAssetPrefix)) {
		return `/images/papers/${normalizedPath.slice(localAssetPrefix.length)}`;
	}

	return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
}

function fallbackLineCount(marks) {
	if (!marks || marks < 1) return 1;
	return Math.min(6, Math.max(1, Math.ceil(marks)));
}

function blockFromJson(value) {
	if (value.kind === 'paragraph' && typeof value.text === 'string') {
		return { kind: 'paragraph', text: value.text };
	}
	if (
		(value.type === 'text' || value.type === 'paragraph' || value.type === 'marks') &&
		typeof value.text === 'string'
	) {
		return { kind: 'paragraph', text: value.text };
	}
	if (value.type === 'extract' && Array.isArray(value.lines)) {
		return { kind: 'paragraph', text: value.lines.join('\n') };
	}
	if (value.type === 'list' && Array.isArray(value.items)) {
		return { kind: 'bullet-list', items: value.items };
	}
	if (
		(value.kind === 'equation' || value.kind === 'formula' || value.kind === 'math') &&
		typeof value.text === 'string'
	) {
		return { kind: 'equation', text: value.text };
	}
	if (value.kind === 'figure' && typeof value.assetId === 'string') {
		return {
			kind: 'figure',
			assetId: value.assetId,
			label: typeof value.label === 'string' ? value.label : undefined,
			width: typeof value.width === 'number' ? value.width : undefined
		};
	}
	if (
		value.kind === 'table' &&
		Array.isArray(value.columns) &&
		Array.isArray(value.rows) &&
		value.columns.every((item) => typeof item === 'string') &&
		value.rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'))
	) {
		return {
			kind: 'table',
			label: typeof value.label === 'string' ? value.label : undefined,
			columns: value.columns,
			rows: value.rows,
			compact: value.compact === true
		};
	}
	if (value.kind === 'structured-table' && Array.isArray(value.rows)) {
		return {
			kind: 'structured-table',
			label: typeof value.label === 'string' ? value.label : undefined,
			rows: structuredRowsFromJson(value.rows),
			compact: value.compact === true,
			wide: value.wide === true
		};
	}
	if (value.kind === 'ordered-list' && Array.isArray(value.items)) {
		return { kind: 'ordered-list', items: value.items };
	}
	if (value.kind === 'bullet-list' && Array.isArray(value.items)) {
		return { kind: 'bullet-list', items: value.items };
	}
	if (value.kind === 'key' && Array.isArray(value.items)) {
		return { kind: 'key', items: value.items };
	}
	throw new Error(`Unsupported question renderer value: ${JSON.stringify(value)}`);
}

function structuredRowsFromJson(rows) {
	return rows.map((row) => {
		if (!Array.isArray(row)) return [];
		return row.map((cell) => {
			if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
				return {
					text: String(cell.text ?? ''),
					header: cell.header === true,
					colspan: typeof cell.colspan === 'number' ? cell.colspan : undefined,
					rowspan: typeof cell.rowspan === 'number' ? cell.rowspan : undefined,
					align:
						cell.align === 'left' || cell.align === 'center' || cell.align === 'right'
							? cell.align
							: undefined
				};
			}
			return { text: String(cell ?? '') };
		});
	});
}

function blocksFromValue(value, label) {
	if (!Array.isArray(value)) throw new Error(`Invalid renderer blocks in ${label}.`);
	return value.map((block) => blockFromJson(block));
}

function labeledLineFields(raw) {
	if (!Array.isArray(raw)) return [];
	const fields = [];
	for (const field of raw) {
		if (!field || typeof field !== 'object') continue;
		if (typeof field.label !== 'string' || !field.label.trim()) continue;
		const normalized = { label: field.label };
		if (typeof field.lineCount === 'number') normalized.lineCount = field.lineCount;
		fields.push(normalized);
	}
	return fields;
}

function choiceMaxSelections(value, optionCount) {
	const explicit = value.maxSelections;
	if (typeof explicit !== 'number' || explicit < 1) return undefined;
	if (optionCount > 1 && explicit >= optionCount) return undefined;
	return explicit;
}

function equationBlankUnorderedGroups(value) {
	if (!Array.isArray(value)) return undefined;
	const groups = value
		.map((group) => {
			if (!group || typeof group !== 'object') return null;
			const targetIds = Array.isArray(group.targetIds)
				? group.targetIds.filter((item) => typeof item === 'string' && item.trim().length > 0)
				: [];
			const answers = Array.isArray(group.answers)
				? group.answers.filter((item) => typeof item === 'string' && item.trim().length > 0)
				: [];
			return targetIds.length >= 2 && answers.length >= 2 ? { targetIds, answers } : null;
		})
		.filter(Boolean);
	return groups.length ? groups : undefined;
}

function responseFromValue(raw) {
	const value = raw ?? {};
	if (value.kind === 'none') return { kind: 'none' };
	if (value.kind === 'extended_text') {
		return { kind: 'lines', count: value.suggestedLines ?? fallbackLineCount(value.marks) };
	}
	if (value.kind === 'lines' && typeof value.count === 'number')
		return { kind: 'lines', count: value.count };
	if (value.kind === 'labeled-lines') {
		const fields = labeledLineFields(value.fields);
		const labels = Array.isArray(value.labels)
			? value.labels.filter((label) => typeof label === 'string')
			: fields.map((field) => field.label);
		if (labels.length === 0) {
			return { kind: 'lines', count: typeof value.lineCount === 'number' ? value.lineCount : 1 };
		}
		return {
			kind: 'labeled-lines',
			labels,
			fields: fields.length ? fields : undefined,
			lineCount: typeof value.lineCount === 'number' ? value.lineCount : undefined,
			choicePrompt: typeof value.choicePrompt === 'string' ? value.choicePrompt : undefined,
			choiceOptions: Array.isArray(value.choiceOptions)
				? value.choiceOptions.filter((option) => typeof option === 'string')
				: undefined,
			choiceLayout: value.choiceLayout === 'horizontal' ? 'horizontal' : undefined,
			correctAnswers:
				value.correctAnswers && typeof value.correctAnswers === 'object'
					? value.correctAnswers
					: undefined
		};
	}
	if (value.kind === 'choice' && Array.isArray(value.options)) {
		const maxSelections = choiceMaxSelections(value, value.options.length);
		return {
			kind: 'choice',
			options: value.options,
			layout: value.layout === 'horizontal' ? 'horizontal' : 'vertical',
			...(maxSelections ? { maxSelections } : {})
		};
	}
	if (value.kind === 'choice-table' && Array.isArray(value.columns) && Array.isArray(value.rows)) {
		return { kind: 'choice-table', columns: value.columns, rows: value.rows };
	}
	if (value.kind === 'matching' && Array.isArray(value.left) && Array.isArray(value.right)) {
		return {
			kind: 'matching',
			leftTitle: typeof value.leftTitle === 'string' ? value.leftTitle : null,
			rightTitle: typeof value.rightTitle === 'string' ? value.rightTitle : null,
			left: value.left,
			right: value.right
		};
	}
	if (value.kind === 'number-line' && typeof value.label === 'string') {
		return {
			kind: 'number-line',
			label: value.label,
			prefix: typeof value.prefix === 'string' ? value.prefix : undefined,
			unit: typeof value.unit === 'string' ? value.unit : undefined
		};
	}
	if (value.kind === 'equation-blanks' && Array.isArray(value.segments)) {
		return {
			kind: 'equation-blanks',
			segments: value.segments,
			unorderedGroups: equationBlankUnorderedGroups(value.unorderedGroups)
		};
	}
	if (value.kind === 'asset-canvas' && typeof value.assetId === 'string') {
		return {
			kind: 'asset-canvas',
			assetId: value.assetId,
			label: typeof value.label === 'string' ? value.label : undefined,
			width: typeof value.width === 'number' ? value.width : undefined,
			labelBank: Array.isArray(value.labelBank) ? value.labelBank : undefined
		};
	}
	if (value.kind === 'drawing-box') {
		const rows = Number(value.grid?.rows);
		const columns = Number(value.grid?.columns);
		const grid =
			Number.isInteger(rows) && rows > 0 && Number.isInteger(columns) && columns > 0
				? { rows, columns }
				: undefined;
		const rowLabels = Array.isArray(value.rowLabels)
			? value.rowLabels.filter((label) => typeof label === 'string')
			: undefined;
		const columnLabels = Array.isArray(value.columnLabels)
			? value.columnLabels.filter((label) => typeof label === 'string')
			: undefined;
		return {
			kind: 'drawing-box',
			label: typeof value.label === 'string' ? value.label : undefined,
			width: typeof value.width === 'number' ? value.width : undefined,
			height: typeof value.height === 'number' ? value.height : undefined,
			grid,
			rowLabels: rowLabels?.length ? rowLabels : undefined,
			columnLabels: columnLabels?.length ? columnLabels : undefined
		};
	}
	if (
		value.kind === 'image-label-zones' &&
		typeof value.assetId === 'string' &&
		Array.isArray(value.labels) &&
		Array.isArray(value.zones)
	) {
		return {
			kind: 'image-label-zones',
			assetId: value.assetId,
			labels: value.labels,
			allowRepeats: value.allowRepeats === true,
			correctAnswers:
				value.correctAnswers && typeof value.correctAnswers === 'object'
					? value.correctAnswers
					: undefined,
			zones: value.zones,
			width: typeof value.width === 'number' ? value.width : undefined
		};
	}
	throw new Error(`Unsupported response renderer value: ${JSON.stringify(value)}`);
}

function responseForPart(raw, marks) {
	const response = responseFromValue(raw ?? { kind: 'lines', count: fallbackLineCount(marks) });
	if (response.kind === 'none' && (marks ?? 0) > 0) {
		return { kind: 'lines', count: fallbackLineCount(marks) };
	}
	return response;
}

function renderObjectFromJson(raw, questionId) {
	const value = parseJson(raw, null);
	if (!value || typeof value !== 'object') {
		throw new Error(`Invalid renderer object for ${questionId}.`);
	}
	return value;
}

function mainQuestionRef(partRef, parentRef) {
	return parentRef ?? partRef.split('.')[0] ?? partRef;
}

function buildQuestions(rows) {
	const questions = new Map();

	for (const row of rows) {
		const ref = mainQuestionRef(row.source_question_ref, row.parent_source_question_ref);
		const render = renderObjectFromJson(row.render_json, row.id);
		let question = questions.get(ref);
		if (!question) {
			question = {
				ref,
				blocks: blocksFromValue(render.stemBlocks ?? [], `${row.id} stem blocks`),
				parts: []
			};
			questions.set(ref, question);
		}

		question.parts.push({
			questionId: row.id,
			ref: row.source_question_ref,
			marks: row.marks ?? 0,
			stemBlocks: blocksFromValue(render.stemBlocks ?? [], `${row.id} stem blocks`),
			leadBlocks: blocksFromValue(render.leadBlocks ?? [], `${row.id} lead blocks`),
			blocks: blocksFromValue(render.promptBlocks ?? [], `${row.id} prompt blocks`),
			response: responseForPart(render.response, row.marks),
			afterResponseBlocks: blocksFromValue(
				render.afterResponseBlocks ?? [],
				`${row.id} after-response blocks`
			)
		});
	}

	return Array.from(questions.values());
}

function textFromBlock(block) {
	if (block.kind === 'paragraph' || block.kind === 'equation') return block.text;
	if (block.kind === 'figure') return block.label ?? '';
	if (block.kind === 'table' || block.kind === 'structured-table') return block.label ?? '';
	if (block.kind === 'key') return block.items.map((item) => item.text).join(' ');
	if (block.kind === 'ordered-list' || block.kind === 'bullet-list') return block.items.join(' ');
	return '';
}

function normalizeVisualLabel(label) {
	return label
		.replace(/\bfig\.?\s+/i, 'Figure ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function referencedVisualLabels(blocks) {
	const labels = new Set();
	for (const block of blocks) {
		const text = textFromBlock(block);
		for (const match of text.matchAll(/\b(?:Figure|Fig\.?|Table)\s+\d+\b/gi)) {
			labels.add(normalizeVisualLabel(match[0]));
		}
	}
	return labels;
}

function blockVisualLabel(block) {
	if (block.kind !== 'figure' && block.kind !== 'table' && block.kind !== 'structured-table') {
		return null;
	}
	return block.label ? normalizeVisualLabel(block.label) : null;
}

function blockKey(block) {
	if (block.kind === 'figure') return `figure:${block.label ?? block.assetId}`;
	if (block.kind === 'table' || block.kind === 'structured-table') {
		return `${block.kind}:${block.label ?? ''}:${JSON.stringify(block)}`;
	}
	return `${block.kind}:${JSON.stringify(block)}`;
}

function blockAssetKey(block) {
	if (block.kind === 'figure') return `asset:${block.assetId}`;
	return null;
}

function responseAssetKey(response) {
	if (response.kind === 'asset-canvas' || response.kind === 'image-label-zones') {
		return `asset:${response.assetId}`;
	}
	return null;
}

function addBlockKeys(seen, block) {
	seen.add(blockKey(block));
	const assetKey = blockAssetKey(block);
	if (assetKey) seen.add(assetKey);
}

function hasBlockKeys(seen, block) {
	const assetKey = blockAssetKey(block);
	return seen.has(blockKey(block)) || Boolean(assetKey && seen.has(assetKey));
}

function uniqueBlocks(blocks) {
	const seen = new Set();
	return blocks.filter((block) => {
		const key = blockKey(block);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function partBlocks(part) {
	return [...(part.leadBlocks ?? []), ...part.blocks, ...(part.afterResponseBlocks ?? [])];
}

function addRenderedPartKeys(seen, part) {
	for (const block of partBlocks(part)) addBlockKeys(seen, block);
	const assetKey = responseAssetKey(part.response);
	if (assetKey) seen.add(assetKey);
}

function visualDependencyBlocks(question, selectedPart) {
	const selectedBlocks = partBlocks(selectedPart);
	const neededLabels = referencedVisualLabels([...question.blocks, ...selectedBlocks]);
	if (neededLabels.size === 0) return [];

	for (const block of [...question.blocks, ...selectedBlocks]) {
		const label = blockVisualLabel(block);
		if (label) neededLabels.delete(label);
	}
	if (neededLabels.size === 0) return [];

	const dependencies = [];
	const seenLabels = new Set();
	for (const part of question.parts) {
		if (part.ref === selectedPart.ref) continue;
		for (const block of partBlocks(part)) {
			const label = blockVisualLabel(block);
			if (!label || !neededLabels.has(label) || seenLabels.has(label)) continue;
			dependencies.push(block);
			seenLabels.add(label);
		}
	}
	return dependencies;
}

function resolvePartDependencies(question, part, seen) {
	const dependencies = visualDependencyBlocks(question, part);
	const partResponseAssetKey = responseAssetKey(part.response);
	if (partResponseAssetKey) seen.add(partResponseAssetKey);

	const supportBlocks = [...dependencies, ...(part.stemBlocks ?? [])].filter((block) => {
		if (hasBlockKeys(seen, block)) return false;
		addBlockKeys(seen, block);
		return true;
	});

	const resolvedPart = supportBlocks.length
		? { ...part, leadBlocks: [...supportBlocks, ...(part.leadBlocks ?? [])] }
		: part;
	addRenderedPartKeys(seen, resolvedPart);
	return resolvedPart;
}

function resolveQuestionDependencies(question) {
	const seen = new Set();
	for (const block of question.blocks) addBlockKeys(seen, block);
	return {
		...question,
		parts: question.parts.map((part) => resolvePartDependencies(question, part, seen))
	};
}

function inheritedStemBlocks(question, partIndex) {
	return uniqueBlocks(question.parts.slice(0, partIndex).flatMap((part) => part.stemBlocks ?? []));
}

function focusPaperByRef(paper, ref) {
	for (const question of paper.questions) {
		if (question.ref === ref) {
			return {
				...paper,
				title: `${paper.title} Question ${question.ref}`,
				questions: [resolveQuestionDependencies(question)]
			};
		}

		const partIndex = question.parts.findIndex((candidate) => candidate.ref === ref);
		const part = partIndex >= 0 ? question.parts[partIndex] : undefined;
		if (part) {
			const responseKey = responseAssetKey(part.response);
			const sharedStemBlocks =
				(part.stemBlocks ?? []).length > 0 ? [] : inheritedStemBlocks(question, partIndex);
			const stemBlocks = responseKey
				? [...sharedStemBlocks, ...(part.stemBlocks ?? [])].filter(
						(block) => blockAssetKey(block) !== responseKey
					)
				: [...sharedStemBlocks, ...(part.stemBlocks ?? [])];
			const focusedQuestionBase = { ...question, blocks: uniqueBlocks(stemBlocks), parts: [part] };
			const seen = new Set();
			for (const block of focusedQuestionBase.blocks) addBlockKeys(seen, block);
			const resolvedPart = resolvePartDependencies(question, part, seen);
			return {
				...paper,
				title: `${paper.title} Question ${part.ref}`,
				questions: [{ ...focusedQuestionBase, parts: [resolvedPart] }]
			};
		}
	}

	return null;
}

function referencedAssetIds(questions) {
	const ids = new Set();
	for (const question of questions) {
		for (const block of question.blocks) {
			if (block.kind === 'figure') ids.add(block.assetId);
		}
		for (const part of question.parts) {
			for (const block of [
				...(part.stemBlocks ?? []),
				...(part.leadBlocks ?? []),
				...part.blocks,
				...(part.afterResponseBlocks ?? [])
			]) {
				if (block.kind === 'figure') ids.add(block.assetId);
			}
			if (part.response.kind === 'asset-canvas' || part.response.kind === 'image-label-zones') {
				ids.add(part.response.assetId);
			}
		}
	}
	return ids;
}

function trimPaperAssets(paper) {
	const assetIds = referencedAssetIds(paper.questions);
	if (assetIds.size === 0) return { ...paper, assets: {} };
	return {
		...paper,
		assets: Object.fromEntries(
			Object.entries(paper.assets).filter(([assetId]) => assetIds.has(assetId))
		)
	};
}

async function executeBatch(statements, label, { rootDir, dryRun, batchSize }) {
	if (statements.length === 0) return;
	if (dryRun) {
		console.log(`${label}: dry run, ${statements.length} statements`);
		return;
	}

	const { accountId, apiToken, databaseId } = d1Config(rootDir);
	const d1QueryUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
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

function upsertPayloadStatement({ id, routeKind, routePath, payload, sourceVersion }) {
	return {
		sql: `INSERT INTO public_route_payloads
		      (id, route_kind, route_path, payload_json, source_version, updated_at)
		      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		      ON CONFLICT(id) DO UPDATE SET
		        route_kind = excluded.route_kind,
		        route_path = excluded.route_path,
		        payload_json = excluded.payload_json,
		        source_version = excluded.source_version,
		        updated_at = CURRENT_TIMESTAMP`,
		params: [id, routeKind, routePath, JSON.stringify(payload), sourceVersion ?? null]
	};
}

async function fetchSubjectNavigation({ rootDir }) {
	return await d1Rows(
		`WITH ranked_subject_questions AS (
			SELECT
				q.subject_area AS subject,
				q.id AS questionId,
				COUNT(*) OVER (PARTITION BY q.subject_area) AS questionCount,
				ROW_NUMBER() OVER (
					PARTITION BY q.subject_area
					ORDER BY
						CASE qac.transfer_distance
							WHEN 'start' THEN 0
							WHEN 'near' THEN 1
							WHEN 'stretch' THEN 2
							WHEN 'exam_transfer' THEN 3
							ELSE 4
						END,
						qac.needs_human_review ASC,
						COALESCE(qac.fit_confidence, 0) DESC,
						q.id
				) AS rowNumber
			FROM question_answer_chains qac
			JOIN questions q ON q.id = qac.question_id
			JOIN answer_chains ac ON ac.id = qac.answer_chain_id
			WHERE q.subject_area IS NOT NULL AND q.subject_area != ''
			  AND qac.needs_human_review = 0
			  AND q.needs_human_review = 0
			  AND q.status = 'published'
			  AND ac.needs_human_review = 0
			  AND ac.status = 'published'
		)
		SELECT subject, questionId, questionCount
		FROM ranked_subject_questions
		WHERE rowNumber = 1
		ORDER BY CASE subject
			WHEN 'Biology' THEN 0
			WHEN 'Chemistry' THEN 1
			WHEN 'Physics' THEN 2
			ELSE 3
		END, subject`,
		[],
		{ rootDir }
	);
}

async function fetchPublicChains({ rootDir }) {
	const [chainRows, stepRows, questionRows] = await Promise.all([
		d1Rows(
			`SELECT ac.id, ac.title, ac.canonical_chain_text, ac.subject, ac.subject_area,
			        ac.broad_topic, ac.summary, ac.confidence, ac.needs_human_review,
			        COUNT(DISTINCT q.id) AS question_count
			 FROM answer_chains ac
			 JOIN question_answer_chains qac ON qac.answer_chain_id = ac.id
			 JOIN questions q ON q.id = qac.question_id
			 WHERE ac.needs_human_review = 0
			   AND ac.status = 'published'
			   AND qac.needs_human_review = 0
			   AND q.needs_human_review = 0
			   AND q.status = 'published'
			   AND EXISTS (
				SELECT 1
				FROM question_rendering_overlays qro
				WHERE qro.question_id = q.id
			   )
			 GROUP BY ac.id
			 HAVING question_count > 0
			 ORDER BY ac.needs_human_review ASC,
			          CASE WHEN question_count > 1 THEN 0 ELSE 1 END,
			          COALESCE(ac.confidence, 0) DESC,
			          question_count DESC,
			          ac.subject_area,
			          ac.title`,
			[],
			{ rootDir }
		),
		d1Rows(
			`SELECT id, answer_chain_id, display_order, step_text, common_omission
			 FROM answer_chain_steps
			 ORDER BY answer_chain_id, display_order`,
			[],
			{ rootDir }
		),
		d1Rows(
			`SELECT qac.answer_chain_id, qac.transfer_distance, qac.display_order,
			        q.id, q.source_document_id, q.source_question_ref, q.prompt_text,
			        q.command_word, q.marks, q.subject, q.subject_area, q.paper,
			        q.series, q.year, q.topic_path_json, q.metadata_json,
			        sd.board AS source_board, sd.qualification AS source_qualification,
			        sd.subject AS source_subject, sd.tier AS source_tier,
			        sd.paper AS source_paper, sd.series AS source_series,
			        sd.year AS source_year, sd.component_code AS source_component_code,
			        cwa.weak_answer_text AS weak_answer_text,
			        cwa.explanation AS weak_answer_explanation,
			        cwa.missing_chain_step_ids_json AS weak_missing_chain_step_ids_json
			 FROM question_answer_chains qac
			 JOIN questions q ON q.id = qac.question_id
			 LEFT JOIN source_documents sd ON sd.id = q.source_document_id
			 LEFT JOIN common_weak_answers cwa
			   ON cwa.question_id = q.id
			  AND cwa.needs_human_review = 0
			  AND cwa.id = (
				SELECT cwa2.id
				FROM common_weak_answers cwa2
				WHERE cwa2.question_id = q.id
				  AND cwa2.needs_human_review = 0
				ORDER BY CASE
				           WHEN cwa2.explanation IS NOT NULL AND TRIM(cwa2.explanation) <> '' THEN 0
				           ELSE 1
				         END,
				         CASE
				           WHEN cwa2.missing_chain_step_ids_json IS NOT NULL
				             AND cwa2.missing_chain_step_ids_json <> '[]' THEN 0
				           ELSE 1
				         END,
				         COALESCE(cwa2.confidence, 0) DESC,
				         LENGTH(COALESCE(cwa2.explanation, '')) DESC,
				         cwa2.id
				LIMIT 1
			  )
			 WHERE qac.needs_human_review = 0
			   AND q.needs_human_review = 0
			   AND q.status = 'published'
			   AND EXISTS (
				SELECT 1
				FROM question_rendering_overlays qro
				WHERE qro.question_id = q.id
			   )
			 ORDER BY qac.answer_chain_id,
			          CASE qac.transfer_distance
			            WHEN 'start' THEN 0
			            WHEN 'near' THEN 1
			            WHEN 'stretch' THEN 2
			            WHEN 'exam_transfer' THEN 3
			            ELSE 4
			          END,
			          COALESCE(qac.display_order, 9999),
			          q.year,
			          q.source_question_ref`,
			[],
			{ rootDir }
		)
	]);

	const stepsByChain = groupBy(stepRows, (step) => step.answer_chain_id);
	const questionsByChain = groupBy(questionRows, (question) => question.answer_chain_id);
	const chains = chainRows
		.map((chain) =>
			buildLearningChain(
				chain,
				stepsByChain.get(chain.id) ?? [],
				questionsByChain.get(chain.id) ?? []
			)
		)
		.filter(Boolean);
	const questionRowsById = new Map(questionRows.map((question) => [question.id, question]));
	return { chains, questionRowsById };
}

async function fetchPapersForQuestions({ rootDir, sourceDocumentIds }) {
	const summaries = [];
	const assets = [];
	const questionRows = [];
	for (const ids of chunk(sourceDocumentIds, 80)) {
		const placeholders = ids.map(() => '?').join(', ');
		summaries.push(
			...(await d1Rows(
				`SELECT sd.id, sd.title, sd.board, sd.qualification, sd.subject, sd.subject_area,
				        sd.tier, sd.paper, sd.series, sd.year, sd.component_code, sd.metadata_json,
				        COUNT(q.id) AS question_count
				 FROM source_documents sd
				 JOIN questions q ON q.source_document_id = sd.id
				 JOIN question_rendering_overlays qro ON qro.question_id = q.id
				 WHERE sd.id IN (${placeholders})
				 GROUP BY sd.id`,
				ids,
				{ rootDir }
			))
		);
		assets.push(
			...(await d1Rows(
				`SELECT q.source_document_id, qa.id, qa.source_label, qa.r2_key, qa.public_path,
				        qa.alt_text, qa.metadata_json
				 FROM question_assets qa
				 JOIN questions q ON q.id = qa.question_id
				 WHERE q.source_document_id IN (${placeholders})
				   AND (qa.public_path IS NOT NULL OR qa.r2_key IS NOT NULL)
				 ORDER BY q.source_document_id, qa.source_label, qa.id`,
				ids,
				{ rootDir }
			))
		);
		questionRows.push(
			...(await d1Rows(
				`SELECT q.source_document_id, q.id, q.parent_source_question_ref,
				        q.source_question_ref, q.display_order, q.marks, qro.render_json
				 FROM questions q
				 JOIN question_rendering_overlays qro ON qro.question_id = q.id
				 WHERE q.source_document_id IN (${placeholders})
				 ORDER BY q.source_document_id, q.display_order, q.source_question_ref`,
				ids,
				{ rootDir }
			))
		);
	}

	const assetsByDocument = new Map();
	for (const row of assets) {
		const documentAssets = assetsByDocument.get(row.source_document_id) ?? {};
		documentAssets[row.id] = {
			id: row.id,
			label: row.source_label ?? 'Source image',
			src: assetSrc(row.public_path, row.r2_key),
			alt: row.alt_text ?? row.source_label ?? 'Question image',
			width: assetWidth(row.metadata_json)
		};
		assetsByDocument.set(row.source_document_id, documentAssets);
	}

	const questionRowsByDocument = groupBy(questionRows, (row) => row.source_document_id);
	return new Map(
		summaries.map((summary) => [
			summary.id,
			{
				id: sourceDocumentSlug(summary.id),
				title: paperTitle(summary),
				subtitle: paperSubtitle(summary),
				source: paperSource(summary),
				assets: assetsByDocument.get(summary.id) ?? {},
				questions: buildQuestions(questionRowsByDocument.get(summary.id) ?? [])
			}
		])
	);
}

export async function materializePublicRoutePayloads({
	rootDir = process.cwd(),
	dryRun = false,
	batchSize = DEFAULT_BATCH_SIZE
} = {}) {
	const sourceVersion = new Date().toISOString();
	const subjectNavigation = await fetchSubjectNavigation({ rootDir });
	const { chains, questionRowsById } = await fetchPublicChains({ rootDir });
	const sourceDocumentIds = [
		...new Set(
			[...questionRowsById.values()].map((question) => question.source_document_id).filter(Boolean)
		)
	].sort();
	const papersByDocument = await fetchPapersForQuestions({ rootDir, sourceDocumentIds });

	const statements = [
		{
			sql: `DELETE FROM public_route_payloads WHERE route_kind IN ('layout', 'practice', 'chains', 'home')`
		},
		upsertPayloadStatement({
			id: 'layout:subject-navigation',
			routeKind: 'layout',
			routePath: '/__layout/subject-navigation',
			payload: subjectNavigation,
			sourceVersion
		}),
		upsertPayloadStatement({
			id: EXPLORABLE_CHAINS_PAYLOAD_ID,
			routeKind: 'chains',
			routePath: '/chains',
			payload: chains,
			sourceVersion
		}),
		upsertPayloadStatement({
			id: HOME_PUBLIC_SUMMARY_PAYLOAD_ID,
			routeKind: 'home',
			routePath: '/',
			payload: buildHomePublicSummary(chains),
			sourceVersion
		})
	];

	let practicePayloadCount = 0;
	for (const chain of chains) {
		const aliasCounts = new Map();
		for (const question of chain.questions) {
			for (const alias of [question.ref, question.sourceRef].filter(Boolean)) {
				aliasCounts.set(alias, (aliasCounts.get(alias) ?? 0) + 1);
			}
		}

		for (const question of chain.questions) {
			const sourceRow = questionRowsById.get(question.id);
			if (!sourceRow) continue;
			const paper = papersByDocument.get(sourceRow.source_document_id);
			if (!paper) continue;
			const focusedPaper = focusPaperByRef(paper, question.sourceRef ?? question.ref);
			if (!focusedPaper) continue;

			const payload = {
				chain,
				initialRef: question.id ?? question.ref,
				paper: trimPaperAssets(focusedPaper)
			};
			const refs = [
				...new Set([
					question.id,
					...[question.ref, question.sourceRef].filter((alias) => aliasCounts.get(alias) === 1)
				])
			];
			for (const ref of refs) {
				statements.push(
					upsertPayloadStatement({
						id: practiceRoutePayloadId(chain.id, ref),
						routeKind: 'practice',
						routePath: practiceRoutePath(chain.id, ref),
						payload,
						sourceVersion
					})
				);
				practicePayloadCount += 1;
			}
		}
	}

	await executeBatch(statements, 'materialize public routes', { rootDir, dryRun, batchSize });
	const summary = {
		subject_navigation_items: subjectNavigation.length,
		chains: chains.length,
		source_documents: sourceDocumentIds.length,
		practice_payloads: practicePayloadCount,
		statements: statements.length,
		dry_run: dryRun
	};
	console.log(JSON.stringify(summary, null, 2));
	return summary;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	const rootDir = process.cwd();
	const dryRun = process.argv.includes('--dry-run');
	const batchSize = integerArg('batch-size', DEFAULT_BATCH_SIZE, 1);
	materializePublicRoutePayloads({ rootDir, dryRun, batchSize }).catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
