import { error } from '@sveltejs/kit';
import type {
	ExamPaper,
	ExamPaperAsset,
	ExamQuestion,
	ExamQuestionBlock,
	ExamQuestionPart,
	ExamResponse,
	ExamTableCell
} from '$lib/experiments/questions/types';
import { queryFirst, queryRows } from './db';

type PaperSummaryRow = {
	id: string;
	title: string | null;
	board: string | null;
	qualification: string | null;
	subject: string | null;
	subject_area: string | null;
	tier: string | null;
	paper: string | null;
	series: string | null;
	year: number | null;
	component_code: string | null;
	metadata_json: string;
	question_count: number;
};

type QuestionRenderingRow = {
	id: string;
	parent_source_question_ref: string | null;
	source_question_ref: string;
	display_order: number;
	marks: number | null;
	render_json: string;
};

type AssetRow = {
	id: string;
	source_label: string | null;
	r2_key: string | null;
	public_path: string | null;
	alt_text: string | null;
	metadata_json: string;
};

type AssetMetadata = {
	image_candidates?: Array<{
		width?: number;
		height?: number;
		x_ppi?: number;
		y_ppi?: number;
	}>;
};

export type QuestionExperimentPaperSummary = {
	id: string;
	slug: string;
	href: string;
	title: string;
	subtitle: string;
	questionCount: number;
};

export function sourceDocumentSlug(sourceDocumentId: string) {
	return sourceDocumentId.replace('-qp-', '-');
}

function parseJson<T>(raw: string, label: string): T {
	try {
		return JSON.parse(raw) as T;
	} catch (cause) {
		throw new Error(`Invalid JSON in ${label}`, { cause });
	}
}

function paperTitle(row: PaperSummaryRow) {
	return `${row.board ?? 'AQA'} ${row.qualification ?? 'GCSE'} ${row.subject ?? 'Combined Science'}: ${row.paper ?? row.component_code ?? 'Question paper'}`;
}

function paperSubtitle(row: PaperSummaryRow) {
	return [row.tier ? `${row.tier} Tier` : null, row.series].filter(Boolean).join(', ');
}

function paperSource(row: PaperSummaryRow) {
	const metadata = parseJson<{ aqa_original_filename?: string }>(
		row.metadata_json,
		'source document metadata'
	);
	return `D1/R2 render from ${metadata.aqa_original_filename ?? row.id}`;
}

function assetWidth(metadataJson: string) {
	const metadata = parseJson<AssetMetadata>(metadataJson, 'asset metadata');
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

function assetSrc(publicPath: string | null, r2Key: string | null) {
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

function fallbackLineCount(marks: number | null) {
	if (!marks || marks < 1) return 1;
	return Math.min(6, Math.max(1, Math.ceil(marks)));
}

function assertNever(value: never): never {
	throw new Error(`Unsupported question renderer value: ${JSON.stringify(value)}`);
}

function blockFromJson(value: Record<string, unknown>): ExamQuestionBlock {
	if (value.kind === 'paragraph' && typeof value.text === 'string') {
		return { kind: 'paragraph', text: value.text };
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
		return { kind: 'ordered-list', items: value.items as string[] };
	}
	if (value.kind === 'bullet-list' && Array.isArray(value.items)) {
		return { kind: 'bullet-list', items: value.items as string[] };
	}
	if (value.kind === 'key' && Array.isArray(value.items)) {
		return {
			kind: 'key',
			items: value.items as Array<{ marker: string; text: string }>
		};
	}
	return assertNever(value as never);
}

function structuredRowsFromJson(rows: unknown[]): ExamTableCell[][] {
	return rows.map((row) => {
		if (!Array.isArray(row)) return [];
		return row.map((cell) => {
			if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
				const value = cell as Record<string, unknown>;
				return {
					text: String(value.text ?? ''),
					header: value.header === true,
					colspan: typeof value.colspan === 'number' ? value.colspan : undefined,
					rowspan: typeof value.rowspan === 'number' ? value.rowspan : undefined,
					align:
						value.align === 'left' || value.align === 'center' || value.align === 'right'
							? value.align
							: undefined
				};
			}
			return { text: String(cell ?? '') };
		});
	});
}

function blocksFromValue(value: unknown, label: string) {
	if (!Array.isArray(value)) {
		throw new Error(`Invalid renderer blocks in ${label}.`);
	}
	return value.map((block) => blockFromJson(block as Record<string, unknown>));
}

function choiceMaxSelections(value: Record<string, unknown>, optionCount: number) {
	const explicit = value.maxSelections;
	if (typeof explicit !== 'number' || explicit < 1) return undefined;
	if (optionCount > 1 && explicit >= optionCount) return undefined;
	return explicit;
}

function equationBlankUnorderedGroups(value: unknown) {
	if (!Array.isArray(value)) return undefined;
	const groups = value
		.map((group) => {
			if (!group || typeof group !== 'object') return null;
			const candidate = group as Record<string, unknown>;
			const targetIds = Array.isArray(candidate.targetIds)
				? candidate.targetIds.filter(
						(item): item is string => typeof item === 'string' && item.trim().length > 0
					)
				: [];
			const answers = Array.isArray(candidate.answers)
				? candidate.answers.filter(
						(item): item is string => typeof item === 'string' && item.trim().length > 0
					)
				: [];
			return targetIds.length >= 2 && answers.length >= 2 ? { targetIds, answers } : null;
		})
		.filter((group): group is { targetIds: string[]; answers: string[] } => Boolean(group));
	return groups.length ? groups : undefined;
}

function responseFromValue(raw: unknown): ExamResponse {
	const value = raw as Record<string, unknown>;
	if (value.kind === 'none') return { kind: 'none' };
	if (value.kind === 'lines' && typeof value.count === 'number') {
		return { kind: 'lines', count: value.count };
	}
	if (value.kind === 'labeled-lines') {
		const fields = labeledLineFields(value.fields);
		const labels = Array.isArray(value.labels)
			? (value.labels as string[]).filter((label) => typeof label === 'string')
			: fields.map((field) => field.label);
		if (labels.length === 0) {
			return {
				kind: 'lines',
				count: typeof value.lineCount === 'number' ? value.lineCount : 1
			};
		}
		return {
			kind: 'labeled-lines',
			labels,
			fields: fields.length ? fields : undefined,
			lineCount: typeof value.lineCount === 'number' ? value.lineCount : undefined,
			choicePrompt: typeof value.choicePrompt === 'string' ? value.choicePrompt : undefined,
			choiceOptions: Array.isArray(value.choiceOptions)
				? (value.choiceOptions as string[]).filter((option) => typeof option === 'string')
				: undefined,
			choiceLayout: value.choiceLayout === 'horizontal' ? 'horizontal' : undefined,
			correctAnswers:
				value.correctAnswers && typeof value.correctAnswers === 'object'
					? (value.correctAnswers as Record<string, string>)
					: undefined
		};
	}
	if (value.kind === 'choice' && Array.isArray(value.options)) {
		const options = value.options as string[];
		const maxSelections = choiceMaxSelections(value, options.length);
		return {
			kind: 'choice',
			options,
			layout: value.layout === 'horizontal' ? 'horizontal' : 'vertical',
			...(maxSelections ? { maxSelections } : {})
		};
	}
	if (value.kind === 'choice-table' && Array.isArray(value.columns) && Array.isArray(value.rows)) {
		return {
			kind: 'choice-table',
			columns: value.columns as string[],
			rows: value.rows as string[][]
		};
	}
	if (value.kind === 'matching' && Array.isArray(value.left) && Array.isArray(value.right)) {
		return {
			kind: 'matching',
			leftTitle: typeof value.leftTitle === 'string' ? value.leftTitle : null,
			rightTitle: typeof value.rightTitle === 'string' ? value.rightTitle : null,
			left: value.left as string[],
			right: value.right as string[]
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
			segments: value.segments as ExamResponse extends {
				kind: 'equation-blanks';
				segments: infer S;
			}
				? S
				: never,
			unorderedGroups: equationBlankUnorderedGroups(value.unorderedGroups)
		};
	}
	if (value.kind === 'asset-canvas' && typeof value.assetId === 'string') {
		return {
			kind: 'asset-canvas',
			assetId: value.assetId,
			label: typeof value.label === 'string' ? value.label : undefined,
			width: typeof value.width === 'number' ? value.width : undefined,
			labelBank: Array.isArray(value.labelBank) ? (value.labelBank as string[]) : undefined
		};
	}
	if (value.kind === 'drawing-box') {
		return {
			kind: 'drawing-box',
			label: typeof value.label === 'string' ? value.label : undefined,
			width: typeof value.width === 'number' ? value.width : undefined,
			height: typeof value.height === 'number' ? value.height : undefined
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
			labels: value.labels as string[],
			allowRepeats: value.allowRepeats === true,
			correctAnswers:
				value.correctAnswers && typeof value.correctAnswers === 'object'
					? (value.correctAnswers as Record<string, string>)
					: undefined,
			zones: value.zones as Array<{
				id: string;
				label: string;
				x: number;
				y: number;
				width: number;
				height: number;
			}>,
			width: typeof value.width === 'number' ? value.width : undefined
		};
	}
	return assertNever(value as never);
}

function labeledLineFields(raw: unknown): Array<{ label: string; lineCount?: number }> {
	if (!Array.isArray(raw)) return [];
	const fields: Array<{ label: string; lineCount?: number }> = [];
	for (const field of raw) {
		if (!field || typeof field !== 'object') continue;
		const candidate = field as Record<string, unknown>;
		if (typeof candidate.label !== 'string' || !candidate.label.trim()) continue;
		const normalized: { label: string; lineCount?: number } = { label: candidate.label };
		if (typeof candidate.lineCount === 'number') normalized.lineCount = candidate.lineCount;
		fields.push(normalized);
	}
	return fields;
}

function responseForPart(raw: unknown, marks: number | null): ExamResponse {
	const response = responseFromValue(raw ?? { kind: 'lines', count: fallbackLineCount(marks) });
	if (response.kind === 'none' && (marks ?? 0) > 0) {
		return { kind: 'lines', count: fallbackLineCount(marks) };
	}
	return response;
}

type RenderObject = {
	stemBlocks?: unknown;
	leadBlocks?: unknown;
	promptBlocks?: unknown;
	response?: unknown;
	afterResponseBlocks?: unknown;
};

function renderObjectFromJson(raw: string, questionId: string): RenderObject {
	const value = parseJson<Record<string, unknown>>(raw, `${questionId} render object`);
	if (!value || typeof value !== 'object') {
		throw new Error(`Invalid renderer object for ${questionId}.`);
	}
	return value;
}

async function paperSummaries() {
	const rows = await queryRows<PaperSummaryRow>(
		`SELECT sd.id, sd.title, sd.board, sd.qualification, sd.subject, sd.subject_area,
		        sd.tier, sd.paper, sd.series, sd.year, sd.component_code, sd.metadata_json,
		        COUNT(q.id) AS question_count
		 FROM source_documents sd
		 JOIN questions q ON q.source_document_id = sd.id
		 JOIN question_rendering_overlays qro ON qro.question_id = q.id
		 WHERE sd.doc_type = 'question_paper'
		 GROUP BY sd.id
		 ORDER BY sd.year, sd.subject_area, sd.paper, sd.component_code`
	);

	return rows.map((row): QuestionExperimentPaperSummary => {
		const slug = sourceDocumentSlug(row.id);
		return {
			id: row.id,
			slug,
			href: `/experiments/questions/${slug}`,
			title: paperTitle(row),
			subtitle: paperSubtitle(row),
			questionCount: row.question_count
		};
	});
}

export async function getQuestionExperimentPapers() {
	return paperSummaries();
}

export async function sourceDocumentIdForSlug(slug: string) {
	const sourceDocumentId = slug.includes('-qp-')
		? slug
		: slug.replace(/-(jun|nov)(\d{2})$/, '-qp-$1$2');
	const row = await queryFirst<{ id: string }>(
		`SELECT sd.id
		 FROM source_documents sd
		 WHERE sd.id = ?
		   AND EXISTS (
			SELECT 1
			FROM questions q
			JOIN question_rendering_overlays qro ON qro.question_id = q.id
			WHERE q.source_document_id = sd.id
		   )
		 LIMIT 1`,
		[sourceDocumentId]
	);
	return row?.id ?? null;
}

async function getPaperSummary(sourceDocumentId: string) {
	const rows = await queryRows<PaperSummaryRow>(
		`SELECT sd.id, sd.title, sd.board, sd.qualification, sd.subject, sd.subject_area,
		        sd.tier, sd.paper, sd.series, sd.year, sd.component_code, sd.metadata_json,
		        COUNT(q.id) AS question_count
		 FROM source_documents sd
		 JOIN questions q ON q.source_document_id = sd.id
		 JOIN question_rendering_overlays qro ON qro.question_id = q.id
		 WHERE sd.id = ?
		 GROUP BY sd.id`,
		[sourceDocumentId]
	);
	return rows[0] ?? null;
}

async function getPaperAssets(sourceDocumentId: string) {
	const rows = await queryRows<AssetRow>(
		`SELECT qa.id, qa.source_label, qa.r2_key, qa.public_path, qa.alt_text, qa.metadata_json
		 FROM question_assets qa
		 JOIN questions q ON q.id = qa.question_id
		 WHERE q.source_document_id = ?
		   AND (qa.public_path IS NOT NULL OR qa.r2_key IS NOT NULL)
		 ORDER BY qa.source_label, qa.id`,
		[sourceDocumentId]
	);

	const assets: Record<string, ExamPaperAsset> = {};
	for (const row of rows) {
		assets[row.id] = {
			id: row.id,
			label: row.source_label ?? 'Source image',
			src: assetSrc(row.public_path, row.r2_key),
			alt: row.alt_text ?? row.source_label ?? 'Question image',
			width: assetWidth(row.metadata_json)
		};
	}
	return assets;
}

async function getQuestionRows(sourceDocumentId: string) {
	return queryRows<QuestionRenderingRow>(
		`SELECT q.id, q.parent_source_question_ref, q.source_question_ref, q.display_order, q.marks,
		        qro.render_json
		 FROM questions q
		 JOIN question_rendering_overlays qro ON qro.question_id = q.id
		 WHERE q.source_document_id = ?
		 ORDER BY q.display_order, q.source_question_ref`,
		[sourceDocumentId]
	);
}

function mainQuestionRef(partRef: string, parentRef: string | null) {
	return parentRef ?? partRef.split('.')[0] ?? partRef;
}

function buildQuestions(rows: QuestionRenderingRow[]) {
	const questions = new Map<string, ExamQuestion>();

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

		const part: ExamQuestionPart = {
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
		};
		question.parts.push(part);
	}

	return Array.from(questions.values());
}

function referencedAssetIds(questions: ExamQuestion[]) {
	const ids = new Set<string>();
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

export async function getQuestionExperimentPaper(slug: string): Promise<ExamPaper> {
	const sourceDocumentId = await sourceDocumentIdForSlug(slug);
	if (!sourceDocumentId) error(404, `Question paper not found: ${slug}`);

	const summary = await getPaperSummary(sourceDocumentId);
	if (!summary) error(404, `Question paper not found: ${slug}`);

	const [assets, rows] = await Promise.all([
		getPaperAssets(sourceDocumentId),
		getQuestionRows(sourceDocumentId)
	]);

	if (rows.length !== summary.question_count) {
		throw new Error(
			`Question paper ${sourceDocumentId} has ${summary.question_count} questions but ${rows.length} renderable rows.`
		);
	}

	const questions = buildQuestions(rows);
	for (const assetId of referencedAssetIds(questions)) {
		if (!assets[assetId]) {
			throw new Error(`Question paper ${sourceDocumentId} references missing R2 asset ${assetId}.`);
		}
	}

	return {
		id: sourceDocumentSlug(sourceDocumentId),
		title: paperTitle(summary),
		subtitle: paperSubtitle(summary),
		source: paperSource(summary),
		assets,
		questions
	};
}
