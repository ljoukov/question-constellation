#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const rootDir = process.cwd();
const corpusDir = path.join(rootDir, 'data/aqa-combined-science-trilogy-higher');
const outputDir = path.join(
	rootDir,
	'data/extracted-questions/aqa-combined-science-trilogy-higher'
);
const baselineDir = path.join(outputDir, 'baseline');
const semanticDir = path.join(outputDir, 'semantic-chains');
const questionPdfDir = path.join(corpusDir, 'question-papers');
const markSchemePdfDir = path.join(corpusDir, 'mark-schemes');
const questionTextDir = path.join(corpusDir, 'text/question-papers');
const markSchemeTextDir = path.join(corpusDir, 'text/mark-schemes');
const assetRootDir = path.join(corpusDir, 'assets/question-papers');

const manifestPath = path.join(corpusDir, 'manifest.json');
let manifest;
const now = new Date().toISOString();

const commandWords = [
	'calculate',
	'choose',
	'compare',
	'complete',
	'define',
	'describe',
	'determine',
	'draw',
	'evaluate',
	'explain',
	'give',
	'identify',
	'label',
	'name',
	'plot',
	'predict',
	'show',
	'sketch',
	'suggest',
	'state',
	'tick',
	'use',
	'what',
	'which',
	'why',
	'write'
];

function shasum(filePath) {
	const hash = crypto.createHash('sha256');
	hash.update(readFileSync(filePath));
	return `sha256:${hash.digest('hex')}`;
}

function fileHashIfExists(filePath) {
	return existsSync(filePath) ? shasum(filePath) : null;
}

function slugify(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function rel(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function readPdfPageCount(filePath) {
	const info = execFileSync('pdfinfo', [filePath], { encoding: 'utf8' });
	const match = info.match(/^Pages:\s+(\d+)/m);
	return match ? Number(match[1]) : null;
}

function assertCommandAvailable(command) {
	try {
		execFileSync(command, ['-v'], { stdio: 'ignore' });
	} catch {
		throw new Error(
			`Required command "${command}" was not found. Install Poppler utilities before running extraction.`
		);
	}
}

function assertPathExists(filePath, description) {
	if (!existsSync(filePath)) {
		throw new Error(`${description} was not found at ${rel(filePath)}.`);
	}
}

function assertInputsAvailable() {
	assertCommandAvailable('pdfinfo');
	assertCommandAvailable('pdfimages');
	assertPathExists(manifestPath, 'AQA manifest');
	assertPathExists(questionPdfDir, 'Question-paper PDF directory');
	assertPathExists(markSchemePdfDir, 'Mark-scheme PDF directory');
	assertPathExists(questionTextDir, 'Question-paper text directory');
	assertPathExists(markSchemeTextDir, 'Mark-scheme text directory');
}

function parsePages(textPath) {
	const raw = readFileSync(textPath, 'utf8').replace(/\r/g, '');
	return raw.split('\f').map((text, index) => ({
		page: index + 1,
		lines: text.split('\n')
	}));
}

function cleanLine(line) {
	let text = line.replaceAll('\u0000', '').trim();
	text = text.replace(/\s{2,}box$/i, '').trim();
	text = text.replace(/\bEND OF QUESTIONS\b.*$/i, '').trim();
	text = text.replace(/\bThere are no questions printed on this page\b.*$/i, '').trim();
	text = text.replace(/\bDO NOT WRITE ON THIS PAGE\b.*$/i, '').trim();
	text = text.replace(/\bANSWER IN THE SPACES PROVIDED\b.*$/i, '').trim();
	text = text.replace(/\s+\d+\s+outside the$/i, '').trim();
	text = text.replace(/\s+outside the$/i, '').trim();

	if (!text) return '';
	if (/^do not write$/i.test(text)) return '';
	if (/^outside the$/i.test(text)) return '';
	if (/^box$/i.test(text)) return '';
	if (/^answer in the spaces provided$/i.test(text)) return '';
	if (/^there are no questions printed on this page$/i.test(text)) return '';
	if (/^turn over/i.test(text)) return '';
	if (/^\*\d+\*$/.test(text)) return '';
	if (/^ib\/m\//i.test(text)) return '';
	if (/^gcse combined science/i.test(text)) return '';
	if (/^mark scheme/i.test(text)) return '';
	if (/^question \d+ continues/i.test(text)) return '';
	if (/^blank page$/i.test(text)) return '';
	if (/^\d+$/.test(text) && Number(text) > 0 && Number(text) < 100) return '';

	return text;
}

function flattenPages(pages) {
	const flattened = [];
	for (const page of pages) {
		for (const line of page.lines) {
			const text = cleanLine(line);
			if (text) flattened.push({ page: page.page, text });
		}
	}
	return flattened;
}

function normalizeRef(parent, child) {
	const parentRef = parent.replace(/\s+/g, '').padStart(2, '0');
	const childRef = child.replace(/\s+/g, '');
	return `${parentRef}.${childRef}`;
}

function matchSubQuestion(line) {
	const match = line.match(/^\s*((?:\d\s*){2})\s*\.\s*((?:\d\s*){1,2})(?:\s+|$)(.*)$/);
	if (!match) return null;
	return {
		parent: match[1].replace(/\s+/g, '').padStart(2, '0'),
		ref: normalizeRef(match[1], match[2]),
		rest: match[3].trim()
	};
}

function matchParentQuestion(line) {
	if (matchSubQuestion(line)) return null;
	const match = line.match(/^\s*((?:\d\s*){2})(?:\s{2,}|\t+)(.+)$/);
	if (!match) return null;
	const parent = match[1].replace(/\s+/g, '').padStart(2, '0');
	const rest = match[2].trim();
	if (!rest || /^\d+$/.test(rest)) return null;
	return { parent, rest };
}

function formatLines(lines) {
	return lines
		.map((line) => (typeof line === 'string' ? line : line.text))
		.map((line) => line.trim())
		.filter(Boolean)
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function combineUniqueBlocks(blocks) {
	const seen = new Set();
	const unique = [];
	for (const block of blocks) {
		const text = formatLines([block]);
		if (!text || seen.has(text)) continue;
		seen.add(text);
		unique.push(text);
	}
	return unique.join('\n\n');
}

function isContextIntro(line) {
	return (
		/^(Figure|Table)\s+\d+\b/i.test(line) ||
		/^(A|An|The)\s+(student|scientist|teacher|doctor|farmer|engineer|manufacturer|company|person|patient|athlete|boy|girl|child|group|class)\b/i.test(
			line
		) ||
		/^This is the method used\b/i.test(line) ||
		/^This is the method\b/i.test(line)
	);
}

function looksLikeQuestionText(text) {
	const lower = text.toLowerCase();
	return (
		text.includes('?') ||
		commandWords.some(
			(word) => lower.startsWith(word + ' ') || lower.includes('\n' + word + ' ')
		) ||
		/\btick\b/i.test(text) ||
		/\bmarks?\]/i.test(text)
	);
}

function splitTrailingContext(lines) {
	if (lines.length < 4) return { ownLines: lines, trailingLines: [] };
	for (let index = 2; index < lines.length; index += 1) {
		if (!isContextIntro(lines[index])) continue;
		const before = formatLines(lines.slice(0, index));
		const after = formatLines(lines.slice(index));
		if (!before || !after) continue;
		if (looksLikeQuestionText(before)) {
			return {
				ownLines: lines.slice(0, index),
				trailingLines: lines.slice(index)
			};
		}
	}
	return { ownLines: lines, trailingLines: [] };
}

function extractMarks(text) {
	const match = text.match(/\[(\d+)\s+marks?\]/i);
	return match ? Number(match[1]) : null;
}

function extractCommandWord(text) {
	const normalized = text
		.replace(/\[[^\]]*marks?\]/gi, '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	for (const line of normalized) {
		if (/^(Figure|Table)\s+\d+\b/i.test(line)) continue;
		const first = line.match(/[A-Za-z]+/);
		if (!first) continue;
		const word = first[0].toLowerCase();
		if (commandWords.includes(word)) return word[0].toUpperCase() + word.slice(1);
	}
	return null;
}

function extractConstraints(text) {
	const constraints = [];
	const patterns = [
		/\bUse Figure \d+\b/gi,
		/\bUse Figures \d+(?:\s*(?:,|and)\s*\d+)+\b/g,
		/\bUse Table \d+\b/gi,
		/\bUse Tables \d+(?:\s*(?:,|and)\s*\d+)+\b/g,
		/\bDo not refer to [^\n.]+[.]?/gi,
		/\bGive your answer [^\n.]+[.]?/gi,
		/\bShow your working[.]?/gi,
		/\bTick \([^)]+\) [^\n.]+[.]?/gi
	];
	for (const pattern of patterns) {
		for (const match of text.matchAll(pattern)) {
			const value = match[0].trim();
			if (!constraints.includes(value)) constraints.push(value);
		}
	}
	return constraints;
}

function extractVisualRefs(text) {
	const refs = [];
	for (const match of text.matchAll(/\b(Figure|Table)\s+(\d+)\b/gi)) {
		const kind = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
		const number = match[2];
		const label = `${kind} ${number}`;
		if (!refs.some((ref) => ref.label === label)) refs.push({ kind, number, label });
	}
	for (const match of text.matchAll(/\b(Figures|Tables)\s+(\d+(?:\s*(?:,|and)\s*\d+)+)\b/g)) {
		const kind = match[1] === 'Figures' ? 'Figure' : 'Table';
		for (const number of match[2].match(/\d+/g) ?? []) {
			const label = `${kind} ${number}`;
			if (!refs.some((ref) => ref.label === label)) refs.push({ kind, number, label });
		}
	}
	return refs;
}

function promptNeedsContext(promptText) {
	return /\b(this|these|those|the student|the scientist|the method|the investigation|the results|the apparatus|the graph|the table|the figure|process [A-Z]|part [A-Z]|substance [A-Z]|sample [A-Z]|indicator [A-Z])\b/i.test(
		promptText
	);
}

function promptNeedsAsset(promptText, leadingContext) {
	if (/\b(Figure|Table)\s+\d+\b/i.test(promptText)) return true;
	if (/\b(Process|Part|Substance|Sample|Indicator)\s+[A-Z]\b/.test(promptText)) {
		return /\bFigure\s+\d+\b/i.test(leadingContext);
	}
	return false;
}

function parentStemNeeded(parentStem, promptText) {
	if (!parentStem) return false;
	if (/^This question is about\b/i.test(parentStem)) return false;
	const parentWords = new Set(
		parentStem
			.toLowerCase()
			.match(/[a-z][a-z-]{5,}/g)
			?.filter((word) => !['question', 'figure', 'table', 'student', 'scientist'].includes(word)) ??
			[]
	);
	const promptWords = new Set(promptText.toLowerCase().match(/[a-z][a-z-]{5,}/g) ?? []);
	for (const word of parentWords) {
		if (promptWords.has(word)) return true;
	}
	return false;
}

function inferAssetType(ref, contextText) {
	if (ref.kind === 'Table') return 'table';
	if (/\bgraph\b|\bresults\b|\bplotted\b|\bcurve\b|\baxis\b/i.test(contextText)) return 'graph';
	if (/\bapparatus\b|\bset up\b|\bmethod\b|\bcircuit\b/i.test(contextText)) return 'diagram';
	return 'diagram';
}

function inferAssetRole(ref, contextText) {
	const lower = contextText.toLowerCase();
	if (/\b(complete|draw|plot|sketch|label)\s+(on\s+)?figure\b/.test(lower)) return 'answer_canvas';
	if (/\b(use|using)\s+figure\b/.test(lower) || /\bfrom figure\b/.test(lower)) return 'read_data';
	if (/\b(process|part|substance|sample|indicator)\s+[a-z]\b/.test(lower)) return 'identify_label';
	if (ref.kind === 'Table') return 'read_data';
	return 'context';
}

function isQuestionRelevantImage(image) {
	if (!image.file_path) return false;
	if (image.width < 220 || image.height < 140) return false;
	const ratio = image.width / image.height;
	if (ratio > 14 || ratio < 0.08) return false;
	return true;
}

function r2KeyForAssetPath(filePath) {
	const prefix = 'data/aqa-combined-science-trilogy-higher/assets/question-papers/';
	if (!filePath?.startsWith(prefix)) return null;
	return `images/papers/${filePath.slice(prefix.length)}`;
}

function buildFigurePageMap(flattened) {
	const map = new Map();
	for (const line of flattened) {
		for (const ref of extractVisualRefs(line.text)) {
			if (!map.has(ref.label)) map.set(ref.label, line.page);
			if (new RegExp(`^${ref.label}$`, 'i').test(line.text)) map.set(ref.label, line.page);
		}
	}
	return map;
}

function parseImageList(pdfPath) {
	const output = execFileSync('pdfimages', ['-list', pdfPath], { encoding: 'utf8' });
	const rows = [];
	for (const line of output.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('page') || trimmed.startsWith('-')) continue;
		const parts = trimmed.split(/\s+/);
		if (parts.length < 15) continue;
		rows.push({
			page: Number(parts[0]),
			num: Number(parts[1]),
			type: parts[2],
			width: Number(parts[3]),
			height: Number(parts[4]),
			color: parts[5],
			components: Number(parts[6]),
			bitsPerComponent: Number(parts[7]),
			encoding: parts[8],
			objectId: `${parts[10]} ${parts[11]}`,
			xPpi: Number(parts[12]),
			yPpi: Number(parts[13]),
			file_path: null
		});
	}
	return rows;
}

function extractPdfImages(pdfPath, docId) {
	const rows = parseImageList(pdfPath);
	if (!rows.length) return rows;

	const docAssetDir = path.join(assetRootDir, docId);
	rmSync(docAssetDir, { recursive: true, force: true });
	mkdirSync(docAssetDir, { recursive: true });
	execFileSync('pdfimages', ['-all', '-p', pdfPath, path.join(docAssetDir, 'image')], {
		stdio: 'ignore'
	});
	const files = readdirSync(docAssetDir).sort();
	for (const row of rows) {
		const prefix = `image-${String(row.page).padStart(3, '0')}-${String(row.num).padStart(3, '0')}`;
		const file = files.find((candidate) => candidate.startsWith(prefix + '.'));
		if (file) row.file_path = rel(path.join(docAssetDir, file));
	}
	return rows;
}

function getImagesByPage(imageRows) {
	const byPage = new Map();
	for (const row of imageRows.filter(isQuestionRelevantImage)) {
		if (!byPage.has(row.page)) byPage.set(row.page, []);
		byPage.get(row.page).push(row);
	}
	return byPage;
}

function parseSourceMeta(row) {
	const component = row.component;
	const subjectArea = row.subject;
	const paperNumber = /Paper 2/i.test(row.paper) ? 2 : 1;
	const paper = `${subjectArea} Paper ${paperNumber}`;
	const seriesCode = row.series_code.toLowerCase();
	return {
		component,
		componentLower: component.toLowerCase(),
		subjectArea,
		paper,
		series: row.series,
		seriesCode,
		year: Number(row.series.match(/\d{4}/)?.[0] ?? '0')
	};
}

function sourceDocumentForPdf({ id, docType, meta, source, pdfPath, title }) {
	return {
		id,
		doc_type: docType,
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Combined Science',
		tier: 'Higher',
		subject_area: meta.subjectArea,
		paper: meta.paper,
		series: meta.series,
		year: meta.year,
		component_code: meta.component,
		source_url: source?.url ?? null,
		file_path: rel(pdfPath),
		file_hash: fileHashIfExists(pdfPath),
		page_count: existsSync(pdfPath) ? readPdfPageCount(pdfPath) : null,
		title: title ?? source?.title ?? null,
		metadata: {
			series_code: meta.seriesCode.toUpperCase(),
			aqa_original_filename: source?.aqa_original_filename ?? source?.filename ?? null,
			resource_id: source?.resource_id ?? null,
			sha1hash: source?.sha1hash ?? null,
			size: source?.size ?? null
		}
	};
}

function extractParentStems(flattened, starts) {
	const stems = new Map();
	for (let index = 0; index < flattened.length; index += 1) {
		const parent = matchParentQuestion(flattened[index].text);
		if (!parent) continue;
		const nextSub = starts.find((start) => start.index > index && start.parent === parent.parent);
		const end = nextSub ? nextSub.index : index + 1;
		const lines = [parent.rest];
		for (let lineIndex = index + 1; lineIndex < end; lineIndex += 1) {
			const text = flattened[lineIndex].text;
			if (matchParentQuestion(text) || matchSubQuestion(text)) break;
			lines.push(text);
		}
		const stem = formatLines(lines);
		if (stem) stems.set(parent.parent, stem);
	}
	return stems;
}

function getTextLinesBetween(flattened, start, end) {
	return flattened.slice(start, end).map((line) => line.text);
}

function makeAssetRefs({
	questionId,
	refs,
	figurePageMap,
	imagesByPage,
	contextText,
	questionPage
}) {
	const assets = [];
	for (const ref of refs) {
		const page = figurePageMap.get(ref.label) ?? questionPage;
		const images = imagesByPage.get(page) ?? [];
		const candidates = images.map((image) => ({
			page_number: image.page,
			image_number: image.num,
			file_path: image.file_path,
			width: image.width,
			height: image.height,
			encoding: image.encoding,
			object_id: image.objectId,
			x_ppi: image.xPpi,
			y_ppi: image.yPpi
		}));
		const uniqueImage = images.length === 1 ? images[0] : null;
		const r2Key = r2KeyForAssetPath(uniqueImage?.file_path);
		assets.push({
			id: `${questionId}-${slugify(ref.label)}`,
			asset_type: inferAssetType(ref, contextText),
			source_label: ref.label,
			required: true,
			role: inferAssetRole(ref, contextText),
			page_number: page,
			file_path: uniqueImage?.file_path ?? null,
			storage_key: r2Key,
			r2_key: r2Key,
			public_path: r2Key ? `/${r2Key}` : null,
			alt_text: `${ref.label} from the source question paper.`,
			extracted_text: null,
			extraction_confidence: uniqueImage ? 0.84 : images.length > 1 ? 0.62 : 0.35,
			needs_human_review: !uniqueImage,
			metadata: {
				mapping: uniqueImage ? 'single_image_on_referenced_page' : 'page_level_reference',
				image_candidate_count: images.length,
				image_candidates: candidates
			}
		});
	}
	return assets;
}

function extractQuestionsForPaper(row, imageRows) {
	const meta = parseSourceMeta(row);
	const qp = row.question_paper;
	const pdfPath = path.join(questionPdfDir, qp.filename);
	const textPath = path.join(questionTextDir, qp.filename.replace(/\.PDF$/i, '.txt'));
	const pages = parsePages(textPath);
	const flattened = flattenPages(pages);
	const starts = flattened
		.map((line, index) => ({ ...matchSubQuestion(line.text), index, page: line.page }))
		.filter((line) => line.ref);
	const parentStarts = flattened
		.map((line, index) => ({ ...matchParentQuestion(line.text), index }))
		.filter((line) => line.parent);
	const parentStems = extractParentStems(flattened, starts);
	const figurePageMap = buildFigurePageMap(flattened);
	const imagesByPage = getImagesByPage(imageRows);
	const questions = [];
	const activeContexts = new Map();
	let pendingContext = new Map();

	for (let startIndex = 0; startIndex < starts.length; startIndex += 1) {
		const start = starts[startIndex];
		const nextStart = starts[startIndex + 1];
		const nextParent = parentStarts.find(
			(parent) => parent.index > start.index && parent.parent !== start.parent
		);
		const end = Math.min(
			nextStart ? nextStart.index : flattened.length,
			nextParent?.index ?? flattened.length
		);
		const rawLines = [start.rest, ...getTextLinesBetween(flattened, start.index + 1, end)].filter(
			Boolean
		);
		const { ownLines, trailingLines } = splitTrailingContext(rawLines);
		const promptText = formatLines(ownLines);
		if (!promptText) continue;

		const parentStem = parentStems.get(start.parent) ?? null;
		const leadingContext = formatLines(pendingContext.get(start.parent) ?? []);
		const activeContext = activeContexts.get(start.parent) ?? '';
		const ownVisualRefs = extractVisualRefs(promptText);
		const leadingVisualRefs = extractVisualRefs(leadingContext);
		const directNeedsAsset = promptNeedsAsset(promptText, leadingContext);
		const needsParentStem = parentStemNeeded(parentStem, promptText);
		const needsSharedContext =
			promptNeedsContext(promptText) ||
			(leadingContext && directNeedsAsset) ||
			(parentStem && /\b(it|they|this|these)\b/i.test(promptText));
		const needsContext = needsSharedContext || needsParentStem;
		const contextForSelf = needsSharedContext
			? combineUniqueBlocks([activeContext, leadingContext].filter(Boolean))
			: '';
		const addedContextForMetadata = combineUniqueBlocks([
			needsParentStem ? parentStem : '',
			contextForSelf
		]);

		let visualRefs = [...ownVisualRefs];
		if (directNeedsAsset) {
			for (const ref of leadingVisualRefs) {
				if (!visualRefs.some((existing) => existing.label === ref.label)) visualRefs.push(ref);
			}
		}
		const contextTextForAssets = [parentStem, contextForSelf, promptText]
			.filter(Boolean)
			.join('\n\n');
		const displayOrder = questions.length + 1;
		const questionId = `${meta.componentLower}-${meta.seriesCode}-${start.ref.replace('.', '-')}`;
		const pageValues = flattened.slice(start.index, end).map((line) => line.page);
		const pageStart = Math.min(...pageValues);
		const pageEnd = Math.max(...pageValues);
		const assets = makeAssetRefs({
			questionId,
			refs: visualRefs,
			figurePageMap,
			imagesByPage,
			contextText: contextTextForAssets,
			questionPage: pageStart
		});
		const figureRefs = assets
			.filter((asset) => asset.source_label.startsWith('Figure '))
			.map((asset) => asset.source_label);
		const tableRefs = assets
			.filter((asset) => asset.source_label.startsWith('Table '))
			.map((asset) => asset.source_label);
		const visualDependency =
			assets.length === 0
				? 'none'
				: assets.some((asset) => asset.role === 'answer_canvas')
					? 'answer_canvas'
					: assets.some((asset) => asset.required)
						? 'required'
						: 'contextual';
		const priorQuestionRefs = Array.from(
			promptText.matchAll(/\b(?:Question|question)\s+(\d{1,2}\.\d{1,2})\b/g)
		).map((match) => match[1].padStart(4, '0').replace(/^0?(\d)\./, '0$1.'));

		const selfContainedParts = [parentStem, contextForSelf, promptText].filter(Boolean);
		const selfContainedPromptText = formatLines(selfContainedParts);
		const needsAssets = assets.length > 0;
		const selfContainmentStatus =
			needsContext && needsAssets
				? 'requires_context_and_assets'
				: needsAssets
					? 'requires_assets'
					: needsContext
						? 'requires_context'
						: 'self_contained';
		const reviewNotes = [];
		if (needsContext)
			reviewNotes.push('prompt depends on prior stem/context; self-contained wording generated');
		if (needsAssets)
			reviewNotes.push('prompt references visual/table asset; verify extracted asset mapping');
		if (assets.some((asset) => asset.needs_human_review)) {
			reviewNotes.push('asset mapping is page-level or ambiguous');
		}
		if (priorQuestionRefs.length) {
			reviewNotes.push(
				'prompt references a prior question or prior answer; rewrite or review manually'
			);
		}

		const question = {
			source_question_ref: start.ref,
			parent_source_question_ref: start.parent,
			display_order: displayOrder,
			prompt_text: promptText,
			parent_stem: parentStem,
			full_prompt_text: selfContainedPromptText,
			self_contained_prompt_text: selfContainedPromptText,
			self_contained_prompt_markdown: selfContainedPromptText,
			self_containment: {
				status: selfContainmentStatus,
				is_self_contained: selfContainmentStatus === 'self_contained',
				requires_context: needsContext,
				requires_assets: needsAssets,
				added_context: addedContextForMetadata || null,
				required_asset_labels: assets.map((asset) => asset.source_label),
				rationale:
					selfContainmentStatus === 'self_contained'
						? 'Prompt can be practised without prior paper context.'
						: 'Prompt uses prior context and/or source visual material from the paper.',
				confidence: assets.some((asset) => asset.needs_human_review) ? 0.68 : 0.78
			},
			command_word: extractCommandWord(promptText),
			marks: extractMarks(promptText),
			page_start: pageStart,
			page_end: pageEnd,
			answer_format: null,
			source_constraints: extractConstraints(promptText),
			structured_constraints: extractConstraints(promptText),
			context_blocks: [
				...(parentStem ? [{ kind: 'parent_stem', text: parentStem, required: true }] : []),
				...(contextForSelf
					? [{ kind: 'prior_context', text: contextForSelf, required: needsContext }]
					: [])
			],
			dependencies: priorQuestionRefs.map((ref) => ({
				type: 'prior_question',
				source_question_ref: ref,
				requires_prior_answer: true,
				needs_human_review: true
			})),
			figure_refs: figureRefs,
			table_refs: tableRefs,
			visual_dependency: visualDependency,
			assets,
			asset_dependencies: assets.map((asset) => ({
				asset_id: asset.id,
				source_label: asset.source_label,
				kind: asset.asset_type,
				required: asset.required,
				role: asset.role,
				source_page: asset.page_number,
				file_path: asset.file_path,
				storage_key: asset.storage_key,
				r2_key: asset.r2_key,
				public_path: asset.public_path,
				alt_text: asset.alt_text,
				extraction_confidence: asset.extraction_confidence,
				needs_human_review: asset.needs_human_review
			})),
			tables: assets
				.filter((asset) => asset.asset_type === 'table')
				.map((asset) => ({
					source_label: asset.source_label,
					page_number: asset.page_number,
					markdown: null,
					rows: null,
					needs_human_review: true
				})),
			question_segmentation_confidence: trailingLines.length ? 0.78 : 0.84,
			needs_human_review: reviewNotes.length > 0,
			review_notes: reviewNotes,
			id: questionId,
			source_document_id: `aqa-${meta.componentLower}-qp-${meta.seriesCode}`,
			board: 'AQA',
			qualification: 'GCSE',
			subject: 'Combined Science',
			tier: 'Higher',
			subject_area: meta.subjectArea,
			paper: meta.paper,
			component_code: meta.component,
			series: meta.series,
			year: meta.year,
			topic_path: [],
			spec_ref: null,
			mark_scheme_items: [],
			mark_checklist: [],
			model_answer: null,
			answer_chain: defaultAnswerChain(promptText),
			common_weak_answers: [],
			constellation_candidates: [],
			status: 'draft'
		};
		questions.push(question);

		if (leadingContext) {
			activeContexts.set(
				start.parent,
				combineUniqueBlocks([activeContext, leadingContext].filter(Boolean))
			);
		}
		if (trailingLines.length) {
			pendingContext.set(start.parent, trailingLines);
			activeContexts.set(
				start.parent,
				combineUniqueBlocks([activeContexts.get(start.parent) ?? '', formatLines(trailingLines)])
			);
		} else {
			pendingContext.set(start.parent, []);
		}
	}

	return { questions, meta, pdfPath };
}

function defaultAnswerChain(promptText) {
	const command = extractCommandWord(promptText)?.toLowerCase();
	if (!['explain', 'describe', 'compare', 'evaluate', 'suggest'].includes(command ?? '')) {
		return {
			title: 'No rich answer-chain candidate',
			canonical_chain_text: null,
			steps: [],
			confidence: 0.3,
			status: 'no_chain_candidate',
			needs_human_review: true,
			grouping_notes: 'Recall, graph-reading, calculation, or insufficient mark-scheme evidence.'
		};
	}
	return {
		title: 'Draft mark-scoring reasoning chain',
		canonical_chain_text:
			'question condition -> relevant scientific mechanism -> linked consequence -> mark-scoring conclusion',
		steps: [
			{
				step_text: 'Use the specific condition or evidence in the question.',
				step_role: 'given',
				common_omission: 'Gives generic science facts without using the question context.',
				mark_scheme_item_indexes: []
			},
			{
				step_text: 'State the relevant scientific mechanism or relationship.',
				step_role: 'process',
				common_omission: 'Names the topic but misses the mechanism that earns the mark.',
				mark_scheme_item_indexes: []
			},
			{
				step_text: 'Connect the mechanism to the requested effect, explanation, or conclusion.',
				step_role: 'effect',
				common_omission: 'Does not complete the causal link required by the command word.',
				mark_scheme_item_indexes: []
			}
		],
		confidence: 0.42,
		status: 'draft',
		needs_human_review: true,
		grouping_notes:
			'Baseline generic chain; semantic-chain overlay should replace before publishing.'
	};
}

function matchMarkSchemeRef(line) {
	const compact = line.replace(/\s+/g, '');
	const match = compact.match(/^0?(\d{1,2})\.(\d{1,2})(?!\d)/);
	if (!match) return null;
	return `${match[1].padStart(2, '0')}.${match[2]}`;
}

function extractMarkSchemeBlocks(textPath, validRefs) {
	if (!existsSync(textPath)) return new Map();
	const pages = parsePages(textPath);
	const flattened = flattenPages(pages);
	const starts = [];
	for (let index = 0; index < flattened.length; index += 1) {
		const ref = matchMarkSchemeRef(flattened[index].text);
		if (ref && validRefs.has(ref)) starts.push({ ref, index, page: flattened[index].page });
	}
	const blocks = new Map();
	for (let index = 0; index < starts.length; index += 1) {
		const start = starts[index];
		const next = starts[index + 1];
		const end = next ? next.index : Math.min(flattened.length, start.index + 80);
		const text = formatLines(flattened.slice(start.index, end));
		if (!blocks.has(start.ref) && text) {
			blocks.set(start.ref, {
				item_type: 'mark',
				text,
				marks: null,
				source_ref: `MS ${start.ref}`,
				confidence: 0.66,
				metadata: {
					page_start: start.page,
					raw_block: true
				}
			});
		}
	}
	return blocks;
}

function checklistFromMarkItem(item) {
	const lines = item.text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.filter((line) => !/^AO\s*\/?/i.test(line))
		.filter((line) => !/^Question Answers/i.test(line))
		.slice(0, 5);
	return {
		text: lines.join('; ').slice(0, 260),
		required: true,
		mark_scheme_item_indexes: [0],
		confidence: 0.52,
		needs_human_review: true
	};
}

function attachMarkSchemes(questionsByComponentSeries, row) {
	const meta = parseSourceMeta(row);
	const key = `${meta.componentLower}-${meta.seriesCode}`;
	const questions = questionsByComponentSeries.get(key) ?? [];
	if (!questions.length || !row.mark_scheme?.filename) return;
	const textPath = path.join(
		markSchemeTextDir,
		row.mark_scheme.filename.replace(/\.PDF$/i, '.txt')
	);
	const blocks = extractMarkSchemeBlocks(
		textPath,
		new Set(questions.map((question) => question.source_question_ref))
	);
	for (const question of questions) {
		const item = blocks.get(question.source_question_ref);
		if (!item) {
			question.needs_human_review = true;
			question.review_notes.push('no mark-scheme block matched for this subquestion');
			continue;
		}
		question.mark_scheme_items = [item];
		question.mark_checklist = [checklistFromMarkItem(item)];
		question.model_answer = {
			answer_text: question.mark_checklist[0].text,
			derivation: 'generated_from_mark_scheme',
			confidence: 0.45,
			needs_human_review: true
		};
		if (question.answer_chain.status === 'draft') {
			question.answer_chain.steps = question.answer_chain.steps.map((step, index) =>
				index === 0 ? step : { ...step, mark_scheme_item_indexes: [0] }
			);
		}
	}
}

function makeBaselinePayload({ subjectArea, questions, sourceDocuments }) {
	const selectedQuestions =
		subjectArea === 'all' ? questions : questions.filter((q) => q.subject_area === subjectArea);
	const sourceIds = new Set(selectedQuestions.map((q) => q.source_document_id));
	for (const question of selectedQuestions) {
		const msId = question.source_document_id.replace('-qp-', '-ms-');
		if (sourceDocuments.some((doc) => doc.id === msId)) sourceIds.add(msId);
	}
	const selectedSourceDocuments =
		subjectArea === 'all'
			? sourceDocuments
			: sourceDocuments.filter((doc) => sourceIds.has(doc.id) || doc.subject_area === subjectArea);
	const needsHumanReview = selectedQuestions.filter((q) => q.needs_human_review).length;
	return {
		extraction_run: {
			id: `aqa-combined-science-trilogy-higher-${subjectArea}-baseline-${now.slice(0, 10)}`,
			agent_name: 'codex-local-aqa-extractor',
			agent_version: 'self-contained-assets-v2',
			started_at: now,
			completed_at: now,
			status: needsHumanReview ? 'review_required' : 'completed',
			source_document_ids: selectedSourceDocuments.map((doc) => doc.id),
			needs_human_review: needsHumanReview > 0,
			review_notes: [
				'Question prompts were segmented from local pdftotext output and paired with raw mark-scheme blocks.',
				'Visual assets were extracted from PDF image XObjects and attached by referenced page/figure label.',
				'Self-contained prompt text is generated conservatively; questions with context or asset dependencies remain review flagged.'
			]
		},
		source_documents: selectedSourceDocuments,
		questions: selectedQuestions,
		summary: {
			question_count: selectedQuestions.length,
			source_document_count: selectedSourceDocuments.length,
			questions_by_subject_area: countBy(selectedQuestions, (q) => q.subject_area),
			questions_with_mark_scheme_items: selectedQuestions.filter(
				(q) => q.mark_scheme_items.length > 0
			).length,
			questions_needing_human_review: needsHumanReview,
			questions_requiring_context: selectedQuestions.filter(
				(q) => q.self_containment.requires_context
			).length,
			questions_requiring_assets: selectedQuestions.filter(
				(q) => q.self_containment.requires_assets
			).length,
			extracted_asset_references: selectedQuestions.reduce((sum, q) => sum + q.assets.length, 0)
		}
	};
}

function countBy(items, keyFn) {
	return items.reduce((counts, item) => {
		const key = keyFn(item) ?? 'Unknown';
		counts[key] = (counts[key] ?? 0) + 1;
		return counts;
	}, {});
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function textForQuestion(question) {
	return [
		question.self_contained_prompt_text,
		...question.mark_scheme_items.map((item) => item.text)
	]
		.join('\n')
		.toLowerCase();
}

const chainRules = {
	'bio-chain-enzyme-condition-active-site-substrate-rate': (text) =>
		all(text, ['enzyme', 'active site']) &&
		any(text, ['denature', 'substrate no longer', 'no longer fit']),
	'bio-chain-delivery-oxygen-respiration-energy-symptom': (text) =>
		all(text, ['oxygen', 'respiration']) && any(text, ['energy', 'pain', 'muscle', 'breath']),
	'bio-chain-cell-cycle-dna-chromosomes-identical-cells': (text) =>
		all(text, ['cell cycle', 'dna']) && any(text, ['chromosome', 'nucleus', 'identical']),
	'bio-chain-quadrat-unbiased-placement-count-repeat-representative': (text) =>
		all(text, ['quadrat']) && any(text, ['random', 'repeat', 'mean', 'representative']),
	'bio-chain-punnett-gametes-offspring-phenotype-probability': (text) =>
		all(text, ['genotype']) && any(text, ['gamete', 'punnett', 'phenotype', 'probability']),
	'bio-chain-mutation-code-amino-acids-protein-function': (text) =>
		all(text, ['mutation']) && any(text, ['amino acid', 'protein', 'enzyme', 'base sequence']),
	'bio-chain-ivf-eggs-fertilisation-embryo-transfer': (text) =>
		all(text, ['ivf']) || all(text, ['egg', 'embryo', 'uterus']),
	'bio-chain-blood-glucose-feedback-insulin-glucagon': (text) =>
		all(text, ['blood glucose']) && any(text, ['insulin', 'glucagon', 'glycogen']),
	'bio-chain-adrenaline-delivery-respiration-response': (text) =>
		all(text, ['adrenaline']) && any(text, ['heart', 'glucose', 'oxygen', 'respiration']),
	'bio-chain-synapse-chemical-diffusion-impulse-response': (text) =>
		all(text, ['synapse']) && any(text, ['diffuse', 'receptor', 'impulse', 'neurotransmitter']),
	'bio-chain-food-test-reagent-treatment-colour': (text) =>
		any(text, ['benedict', 'biuret', 'iodine', 'sudan iii', 'ethanol']) &&
		any(text, ['colour', 'test']),
	'chem-chain-alloy-hardness-distorted-layers': (text) =>
		all(text, ['alloy']) && any(text, ['different sized', 'layers', 'harder']),
	'chem-chain-crude-oil-fractional-distillation': (text) =>
		all(text, ['crude oil']) && any(text, ['fractional distillation', 'vaporise', 'condense']),
	'chem-chain-temperature-rate-particle-collisions': (text) =>
		all(text, ['temperature', 'rate']) && any(text, ['collision', 'energy', 'faster']),
	'chem-chain-delocalised-electrons-electrical-conduction': (text) =>
		all(text, ['delocalised electron']) && any(text, ['conduct', 'charge', 'current']),
	'chem-chain-alkene-bromine-water-test': (text) =>
		all(text, ['bromine water']) && any(text, ['alkene', 'decolourise', 'orange']),
	'chem-chain-chromatography-insoluble-does-not-move': (text) =>
		all(text, ['chromatography', 'insoluble']) &&
		any(text, ['start line', 'solvent', 'does not move']),
	'chem-chain-chromatography-rf-relationship': (text) =>
		all(text, ['chromatogram']) && any(text, ['rf', 'distance moved']),
	'physics-chain-grid-transformer-efficiency': (text) =>
		all(text, ['transformer']) && any(text, ['current', 'heating', 'power loss', 'efficient']),
	'physics-chain-gas-particle-collisions-pressure-power': (text) =>
		all(text, ['gas', 'particle']) && any(text, ['collision', 'pressure']),
	'physics-chain-half-life-activity-change': (text) =>
		all(text, ['half-life']) && any(text, ['activity', 'count rate', 'radioactive']),
	'physics-chain-wave-frequency-wavelength-practical-method': (text) =>
		all(text, ['frequency', 'wavelength']) && any(text, ['wave', 'oscillation', 'vibration']),
	'physics-chain-radiation-absorber-inference': (text) =>
		all(text, ['absorber']) && any(text, ['count rate', 'radiation', 'alpha', 'beta', 'gamma']),
	'physics-chain-motor-effect-force-change': (text) =>
		all(text, ['motor effect']) && any(text, ['force', 'current', 'magnetic field']),
	'physics-chain-left-hand-rule-force-direction': (text) =>
		all(text, ['fleming']) && any(text, ['left hand', 'force direction', 'current direction'])
};

function all(text, needles) {
	return needles.every((needle) => text.includes(needle));
}

function any(text, needles) {
	return needles.some((needle) => text.includes(needle));
}

function updateSemanticFile(subjectId, baselinePayload) {
	const filePath = path.join(semanticDir, `${subjectId}.json`);
	if (!existsSync(filePath)) return null;
	const payload = JSON.parse(readFileSync(filePath, 'utf8'));
	const baselineFile = `data/extracted-questions/aqa-combined-science-trilogy-higher/baseline/${subjectId}.json`;
	const baselineHash = fileHashIfExists(path.join(rootDir, baselineFile));
	const questionById = new Map(baselinePayload.questions.map((q) => [q.id, q]));
	const coveredIds = new Set();
	const autoMatches = {};

	for (const chain of payload.answer_chain_candidates ?? []) {
		const existingIds = new Set((chain.supporting_questions ?? []).map((q) => q.question_id));
		for (const support of chain.supporting_questions ?? []) {
			const question = questionById.get(support.question_id);
			if (!question) continue;
			coveredIds.add(question.id);
			support.needs_human_review =
				support.needs_human_review || question.needs_human_review || question.assets.length > 0;
			support.question_review_notes = Array.from(
				new Set([...(support.question_review_notes ?? []), ...question.review_notes])
			);
			support.prompt_excerpt = question.self_contained_prompt_text.slice(0, 360);
		}
		const rule = chainRules[chain.id];
		if (!rule) continue;
		const matches = baselinePayload.questions
			.filter((question) => !existingIds.has(question.id))
			.filter((question) => rule(textForQuestion(question)))
			.slice(0, 12)
			.map((question) => ({
				question_id: question.id,
				source_question_ref: question.source_question_ref,
				paper: question.paper,
				component_code: question.component_code,
				series: question.series,
				marks: question.marks,
				transfer_distance: 'unclassified',
				fit_confidence: 0.76,
				needs_human_review: true,
				question_review_notes: [
					'auto-matched during data refresh; review semantic fit before publishing',
					...question.review_notes
				],
				prompt_excerpt: question.self_contained_prompt_text.slice(0, 360),
				mark_scheme_item_index: question.mark_scheme_items.length ? 0 : null,
				mark_scheme_source_ref: question.mark_scheme_items[0]?.source_ref ?? null,
				mark_scheme_item_id: null
			}));
		if (matches.length) {
			autoMatches[chain.id] = matches;
		}
	}

	payload.source_baseline = {
		file: baselineFile,
		file_hash: baselineHash,
		question_count: baselinePayload.questions.length,
		questions_with_mark_scheme_items: baselinePayload.summary.questions_with_mark_scheme_items,
		questions_needing_human_review: baselinePayload.summary.questions_needing_human_review,
		questions_requiring_context: baselinePayload.summary.questions_requiring_context,
		questions_requiring_assets: baselinePayload.summary.questions_requiring_assets,
		notes: [
			'Baseline regenerated with self-contained prompt metadata and extracted PDF image assets.',
			'Auto-matched chain candidates are review suggestions, not published constellation memberships.'
		]
	};
	payload.backlog = {
		...(payload.backlog ?? {}),
		covered_question_count: coveredIds.size,
		covered_question_ids: Array.from(coveredIds).sort(),
		uncurated_question_count: Math.max(0, baselinePayload.questions.length - coveredIds.size),
		auto_matched_candidate_questions_by_chain: autoMatches
	};
	payload.summary = {
		...(payload.summary ?? {}),
		covered_question_count: coveredIds.size,
		uncurated_question_count: Math.max(0, baselinePayload.questions.length - coveredIds.size),
		auto_matched_candidate_question_count: Object.values(autoMatches).reduce(
			(sum, matches) => sum + matches.length,
			0
		)
	};
	payload.semantic_grouping_run = {
		...(payload.semantic_grouping_run ?? {}),
		completed_at: now,
		status: 'review_required',
		baseline_file: baselineFile,
		baseline_file_hash: baselineHash,
		needs_human_review: true
	};
	writeJson(filePath, payload);
	return payload;
}

function main() {
	assertInputsAvailable();
	manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

	mkdirSync(baselineDir, { recursive: true });
	mkdirSync(semanticDir, { recursive: true });
	rmSync(assetRootDir, { recursive: true, force: true });
	mkdirSync(assetRootDir, { recursive: true });

	const sourceDocuments = [];
	const questions = [];
	const questionsByComponentSeries = new Map();

	for (const row of manifest.rows.filter((entry) => entry.question_paper?.filename)) {
		const meta = parseSourceMeta(row);
		const qpPath = path.join(questionPdfDir, row.question_paper.filename);
		const msPath = path.join(markSchemePdfDir, row.mark_scheme.filename);
		const qpId = `aqa-${meta.componentLower}-qp-${meta.seriesCode}`;
		const msId = `aqa-${meta.componentLower}-ms-${meta.seriesCode}`;
		const imageRows = extractPdfImages(qpPath, qpId);
		const { questions: extractedQuestions } = extractQuestionsForPaper(row, imageRows);
		sourceDocuments.push(
			sourceDocumentForPdf({
				id: qpId,
				docType: 'question_paper',
				meta,
				source: row.question_paper,
				pdfPath: qpPath,
				title: row.question_paper.title
			})
		);
		sourceDocuments.push(
			sourceDocumentForPdf({
				id: msId,
				docType: 'mark_scheme',
				meta,
				source: row.mark_scheme,
				pdfPath: msPath,
				title: row.mark_scheme.title
			})
		);
		questions.push(...extractedQuestions);
		questionsByComponentSeries.set(`${meta.componentLower}-${meta.seriesCode}`, extractedQuestions);
	}

	for (const row of manifest.rows.filter((entry) => entry.question_paper?.filename)) {
		attachMarkSchemes(questionsByComponentSeries, row);
	}

	const allBaseline = makeBaselinePayload({ subjectArea: 'all', questions, sourceDocuments });
	const biologyBaseline = makeBaselinePayload({
		subjectArea: 'Biology',
		questions,
		sourceDocuments
	});
	const chemistryBaseline = makeBaselinePayload({
		subjectArea: 'Chemistry',
		questions,
		sourceDocuments
	});
	const physicsBaseline = makeBaselinePayload({
		subjectArea: 'Physics',
		questions,
		sourceDocuments
	});

	writeJson(path.join(baselineDir, 'all-papers.json'), allBaseline);
	writeJson(path.join(baselineDir, 'biology.json'), biologyBaseline);
	writeJson(path.join(baselineDir, 'chemistry.json'), chemistryBaseline);
	writeJson(path.join(baselineDir, 'physics.json'), physicsBaseline);

	updateSemanticFile('biology', biologyBaseline);
	updateSemanticFile('chemistry', chemistryBaseline);
	updateSemanticFile('physics', physicsBaseline);

	const semanticFiles = ['biology', 'chemistry', 'physics']
		.map((subjectId) => path.join(semanticDir, `${subjectId}.json`))
		.map((filePath) => JSON.parse(readFileSync(filePath, 'utf8')));
	const index = {
		description:
			'Local draft extraction outputs for AQA GCSE Combined Science: Trilogy Higher papers. Baseline files contain atomic question extraction with self-contained prompt metadata and PDF image asset references; semantic-chain files contain curated answer-chain overlays and review-needed auto-match suggestions.',
		baseline_files: {
			all_papers:
				'data/extracted-questions/aqa-combined-science-trilogy-higher/baseline/all-papers.json',
			biology: 'data/extracted-questions/aqa-combined-science-trilogy-higher/baseline/biology.json',
			chemistry:
				'data/extracted-questions/aqa-combined-science-trilogy-higher/baseline/chemistry.json',
			physics: 'data/extracted-questions/aqa-combined-science-trilogy-higher/baseline/physics.json'
		},
		semantic_chain_files: {
			biology:
				'data/extracted-questions/aqa-combined-science-trilogy-higher/semantic-chains/biology.json',
			chemistry:
				'data/extracted-questions/aqa-combined-science-trilogy-higher/semantic-chains/chemistry.json',
			physics:
				'data/extracted-questions/aqa-combined-science-trilogy-higher/semantic-chains/physics.json'
		},
		counts: {
			baseline_questions_total: allBaseline.summary.question_count,
			baseline_questions_by_subject_area: allBaseline.summary.questions_by_subject_area,
			baseline_questions_requiring_context: allBaseline.summary.questions_requiring_context,
			baseline_questions_requiring_assets: allBaseline.summary.questions_requiring_assets,
			extracted_asset_references: allBaseline.summary.extracted_asset_references,
			semantic_answer_chain_candidates_total: semanticFiles.reduce(
				(sum, file) => sum + (file.answer_chain_candidates?.length ?? 0),
				0
			),
			semantic_constellation_candidates_total: semanticFiles.reduce(
				(sum, file) => sum + (file.constellation_candidates?.length ?? 0),
				0
			),
			semantic_auto_matched_candidate_questions_total: semanticFiles.reduce(
				(sum, file) => sum + (file.summary?.auto_matched_candidate_question_count ?? 0),
				0
			),
			semantic_curated_questions_total: semanticFiles.reduce(
				(sum, file) => sum + (file.backlog?.covered_question_count ?? 0),
				0
			),
			semantic_uncurated_questions_total: semanticFiles.reduce(
				(sum, file) => sum + (file.backlog?.uncurated_question_count ?? 0),
				0
			)
		},
		review_policy:
			'Semantic chains are draft evidence-backed candidates. Do not publish constellations until human review confirms prompt extraction, visual assets, self-contained wording, and mark-scheme alignment.'
	};
	writeJson(path.join(outputDir, 'index.json'), index);

	console.log(
		JSON.stringify(
			{
				questions: allBaseline.summary.question_count,
				source_documents: allBaseline.summary.source_document_count,
				requires_context: allBaseline.summary.questions_requiring_context,
				requires_assets: allBaseline.summary.questions_requiring_assets,
				asset_references: allBaseline.summary.extracted_asset_references
			},
			null,
			2
		)
	);
}

main();
