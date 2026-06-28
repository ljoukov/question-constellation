import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { generateJson, loadLocalEnv } from '@ljoukov/llm';
import {
	answerChainSpecificityIssues,
	chainSpecificityIssueSummary
} from '../answer-chain-specificity.mjs';

export const DEFAULT_EXTRACTION_MODEL = 'chatgpt-gpt-5.5';
export const DEFAULT_THINKING_LEVEL = 'xhigh';
export const DEFAULT_LLM_TIMEOUT_MS = Number(
	process.env.EXTRACTION_LLM_TIMEOUT_MS ?? 10 * 60 * 1000
);
export const DEFAULT_LLM_MAX_ATTEMPTS = Number(process.env.EXTRACTION_LLM_MAX_ATTEMPTS ?? 3);
const LLM_LOG_RUN_ID = `${new Date().toISOString().replace(/[:.]/g, '-')}-pid${process.pid}`;
const LLM_LOG_TEXT_LIMIT = 8000;
let llmCallCounter = 0;
const sourcePdfPageTextCache = new Map();

async function mapWithConcurrency(values, limit, mapper) {
	const resolvedLimit = Math.max(1, Math.floor(Number(limit) || 1));
	const results = new Array(values.length);
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(resolvedLimit, values.length) }, async () => {
		while (nextIndex < values.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			results[currentIndex] = await mapper(values[currentIndex], currentIndex);
		}
	});
	await Promise.all(workers);
	return results;
}

const StepRoleSchema = z.enum([
	'given',
	'cause',
	'process',
	'link',
	'effect',
	'evidence',
	'method',
	'calculation',
	'conclusion'
]);

const PRODUCTION_EXTRACTION_CONTRACT = [
	'Production extraction contract:',
	'- Return import-shaped JSON with sourceDocument, markSchemeDocument, supportingDocuments, questions, render blocks, response objects, assets, markSchemeItems, markChecklist, written-response modelAnswer, answerChain, commonWeakAnswers, and review flags.',
	'- Extract every independently marked subquestion. Do not create question rows for unmarked parent stems.',
	'- Do not create learner-facing question rows for withdrawn questions, replacement notices, statistics-only rows, or source entries that lack the original prompt and positive marking criteria.',
	'- Preserve render structure in stemBlocks, leadBlocks, promptBlocks, response, afterResponseBlocks, and assets. Use response objects for choices, tick boxes, matching, equation blanks, image labels, and drawing boxes.',
	'- Use only app-supported response.kind values: none, lines, labeled-lines, number-line, choice, choice-table, matching, equation-blanks, asset-canvas, image-label-zones, drawing-box.',
	'- If response.kind is asset-canvas or image-label-zones, the referenced asset must exist in assets with a usable local file path, public path, or R2 key. Label-only assets are not enough for learner-facing rendering.',
	'- Every marked question must have a reusable answerChain, including simple recall and fixed-response questions.',
	'- An answerChain is a reusable reasoning or method pattern across questions, not a worked solution to this one question.',
	'- For simple recall and fixed-response questions, use a generic recall/discrimination chain. Do not put the exact answer or one-question fact as the chain id, title, or summary.',
	'- For fixed-response questions, put exact answers in response.correctAnswers, markSchemeItems, and markChecklist. Set modelAnswer to null unless the response is genuinely written prose.',
	'- Keep chain steps tightly mark-supported. Do not add biologically plausible or explanatory tail steps unless the mark scheme requires them.',
	'- Link answerChain step markSchemeItemIndexes only to positive marking points. Do not use ignore, reject, or do_not_accept guidance as step support.',
	'- Keep prompt-specific numbers, substitutions, intermediate values, final numeric answers, and one-question units out of answerChain title, canonicalChainText, summary, stepText, explanation, and commonOmission.',
	'- Put worked values in markSchemeItems, markChecklist, written-response modelAnswer, or response.correctAnswers only.',
	'- Formula constants and symbolic formulae are allowed in answerChain text when they are part of the reusable method.',
	'- Use only these answerChain stepRole values: given, cause, process, link, effect, evidence, method, calculation, conclusion.',
	'- For existing-chain compatibility, reuse an id when the ordered method is the same, keep the old id when clarifying wording for a compatible chain, and create a new id only for genuinely new mark-scoring reasoning.'
].join('\n');

export const StepSchema = z.object({
	stepText: z.string(),
	stepRole: StepRoleSchema,
	explanation: z.string().nullable(),
	commonOmission: z.string().nullable(),
	markSchemeItemIndexes: z.array(z.number())
});

export const AnswerChainSchema = z.object({
	id: z.string().nullable(),
	title: z.string(),
	canonicalChainText: z.string(),
	summary: z.string(),
	broadTopic: z.string().nullable().optional(),
	chainFamilyId: z.string().nullable().optional(),
	steps: z.array(StepSchema),
	confidence: z.number().min(0).max(1).nullable().optional(),
	needsHumanReview: z.boolean().optional(),
	reviewNotes: z.array(z.string()).nullable().optional()
});

const SourceDocumentSchema = z.object({
	id: z.string(),
	documentType: z.string().nullable().optional(),
	board: z.string().nullable().optional(),
	qualification: z.string().nullable().optional(),
	subject: z.string().nullable().optional(),
	tier: z.string().nullable().optional(),
	paper: z.string().nullable().optional(),
	componentCode: z.string().nullable().optional(),
	series: z.string().nullable().optional(),
	year: z.number().nullable().optional(),
	pageCount: z.number().nullable().optional(),
	sourcePath: z.string().nullable().optional(),
	fileHash: z.string().nullable().optional(),
	notes: z.array(z.string()).optional()
});

const MarkSchemeItemSchema = z.object({
	text: z.string(),
	marks: z.number().nullable(),
	kind: z.string().nullable().optional(),
	guidance: z.array(z.string()).nullable().optional()
});

const MarkChecklistItemSchema = z.object({
	text: z.string(),
	markSchemeItemIndexes: z.array(z.number()),
	required: z.boolean().optional()
});

const ModelAnswerSchema = z.object({
	answerText: z.string(),
	derivation: z.string().nullable().optional(),
	confidence: z.number().min(0).max(1).nullable().optional()
});

const CommonWeakAnswerSchema = z.object({
	weakAnswerText: z.string(),
	missingStepIndexes: z.array(z.number()),
	explanation: z.string(),
	confidence: z.number().min(0).max(1).nullable().optional()
});

const AssetDependencySchema = z.object({
	label: z.string().nullable(),
	role: z.string().nullable(),
	page: z.number().nullable(),
	filePath: z.string().nullable(),
	publicPath: z.string().nullable(),
	notes: z.string().nullable()
});

const ResponseSchema = z.object({
	kind: z.string(),
	instructions: z.string().nullable(),
	correctAnswers: z.array(z.string()),
	notes: z.string().nullable()
});

const RenderBlockSchema = z.object({
	kind: z.string(),
	text: z.string().nullable(),
	label: z.string().nullable()
});

const RenderSchema = z.object({
	blocks: z.array(RenderBlockSchema),
	notes: z.string().nullable()
});

const CoreQuestionSchema = z.object({
	sourceQuestionRef: z.string(),
	promptText: z.string(),
	marks: z.number().nullable(),
	commandWord: z.string().nullable(),
	markSchemeItems: z.array(MarkSchemeItemSchema),
	markChecklist: z.array(MarkChecklistItemSchema),
	modelAnswer: ModelAnswerSchema.nullable(),
	answerChain: AnswerChainSchema
});

export const LlmExtractionCandidateSchema = z.object({
	sourceDocumentId: z.string(),
	questions: z.array(CoreQuestionSchema)
});

export const ExtractionCandidateSchema = z.object({
	sourceDocumentId: z.string(),
	sourceDocument: SourceDocumentSchema.nullable().optional(),
	extractionRun: z
		.object({
			model: z.string().nullable().optional(),
			needsHumanReview: z.boolean().optional(),
			reviewFlags: z
				.array(
					z.object({
						code: z.string(),
						message: z.string(),
						severity: z.enum(['info', 'warning', 'error']).optional()
					})
				)
				.optional()
		})
		.optional(),
	questions: z.array(
		z.object({
			sourceQuestionRef: z.string(),
			parentQuestionRef: z.string().nullable().optional(),
			displayOrder: z.number().nullable().optional(),
			promptText: z.string(),
			selfContainedPromptText: z.string().nullable().optional(),
			contextText: z.string().nullable().optional(),
			marks: z.number().nullable(),
			commandWord: z.string().nullable(),
			topicPath: z.array(z.string()).optional(),
			specRef: z.string().nullable().optional(),
			pageStart: z.number().nullable().optional(),
			pageEnd: z.number().nullable().optional(),
			requiredAssets: z.array(AssetDependencySchema).optional(),
			response: ResponseSchema.nullable().optional(),
			render: RenderSchema.nullable().optional(),
			markSchemeItems: z.array(MarkSchemeItemSchema),
			markChecklist: z.array(MarkChecklistItemSchema),
			modelAnswer: ModelAnswerSchema.nullable(),
			answerChain: AnswerChainSchema,
			commonWeakAnswers: z.array(CommonWeakAnswerSchema).optional(),
			missingLinks: z.array(z.string()).optional(),
			extractionConfidence: z.number().min(0).max(1).nullable().optional(),
			needsHumanReview: z.boolean().optional(),
			reviewFlags: z
				.array(
					z.object({
						code: z.string(),
						message: z.string(),
						severity: z.enum(['info', 'warning', 'error']).optional()
					})
				)
				.optional()
		})
	)
});

function normalizeJudgeMatch(value) {
	if (!value || typeof value !== 'object') return value;
	return {
		...value,
		concept:
			value.concept ?? value.sourceQuestionRef ?? value.questionRef ?? value.value ?? 'match',
		matched: value.matched ?? value.match,
		note: value.note ?? value.notes ?? value.rationale ?? ''
	};
}

function normalizeJudgeValueMatch(value) {
	if (!value || typeof value !== 'object') return value;
	return {
		...value,
		value: value.value ?? value.sourceQuestionRef ?? value.questionRef ?? value.answer ?? 'value',
		matched: value.matched ?? value.match,
		note: value.note ?? value.notes ?? value.rationale ?? ''
	};
}

function normalizeForbiddenValueFinding(value) {
	if (!value || typeof value !== 'object') return value;
	return {
		...value,
		value: value.value ?? value.finding ?? value.sourceQuestionRef ?? 'finding',
		foundInAnswerChain: value.foundInAnswerChain ?? value.inAnswerChain ?? false,
		note: value.note ?? value.notes ?? value.rationale ?? ''
	};
}

export const JudgeSchema = z.object({
	verdict: z.enum(['pass', 'fail']),
	score: z.number().min(0).max(1),
	rationale: z.string(),
	conceptMatches: z.array(
		z.preprocess(
			normalizeJudgeMatch,
			z.object({ concept: z.string(), matched: z.boolean(), note: z.string() })
		)
	),
	forbiddenValueFindings: z.array(
		z.preprocess(
			normalizeForbiddenValueFinding,
			z.object({ value: z.string(), foundInAnswerChain: z.boolean(), note: z.string() })
		)
	),
	modelAnswerValueMatches: z.array(
		z.preprocess(
			normalizeJudgeValueMatch,
			z.object({ value: z.string(), matched: z.boolean(), note: z.string() })
		)
	),
	requiredRepairs: z.array(z.string())
});

export const SolvabilityJudgeSchema = z.object({
	verdict: z.enum(['pass', 'fail']),
	score: z.number().min(0).max(1),
	sourceQuestionRef: z.string(),
	studentVisibleSolvable: z.boolean(),
	attemptedAnswerFromVisibleContext: z.string(),
	markSchemeAlignment: z.enum(['matches', 'partially_matches', 'mismatch', 'not_applicable']),
	rationale: z.string(),
	missingContext: z.array(
		z.object({
			kind: z.enum([
				'text',
				'table',
				'image',
				'diagram',
				'previous_part',
				'response_area',
				'other'
			]),
			severity: z.enum(['blocking', 'warning']),
			description: z.string()
		})
	),
	mediaFindings: z.array(
		z.object({
			label: z.string(),
			status: z.enum(['present', 'missing', 'not_needed', 'unclear']),
			note: z.string()
		})
	),
	renderFindings: z.array(
		z.object({
			field: z.string(),
			severity: z.enum(['blocking', 'warning']),
			note: z.string()
		})
	),
	requiredRepairs: z.array(z.string())
});

export const ChainResolutionSchema = z.object({
	action: z.enum(['reuse_existing', 'update_existing', 'create_new', 'needs_review']),
	existingChainId: z.string().nullable(),
	compatibilityRationale: z.string(),
	identityStable: z.boolean().optional().default(false)
});

export const RepairSchema = z.object({
	questions: LlmExtractionCandidateSchema.shape.questions
});

export function normalizeRepairEnvelope(value) {
	if (value && typeof value === 'object' && Array.isArray(value.repairs)) {
		return {
			...value,
			repairs: value.repairs.map(normalizeRepairItem)
		};
	}
	if (Array.isArray(value)) return { repairs: value };
	if (!value || typeof value !== 'object' || Array.isArray(value.repairs)) return value;
	const repairs = [];
	for (const [sourceQuestionRef, repair] of Object.entries(value)) {
		if (!/^\d{2}\.\d{1,2}$/.test(sourceQuestionRef)) continue;
		if (!repair || typeof repair !== 'object' || Array.isArray(repair)) continue;
		repairs.push(
			normalizeRepairItem({
				...repair,
				sourceQuestionRef: String(repair.sourceQuestionRef ?? sourceQuestionRef)
			})
		);
	}
	if (repairs.length === 0) return value;
	return { ...value, repairs };
}

function normalizeRepairItem(repair) {
	if (!repair || typeof repair !== 'object' || Array.isArray(repair)) return repair;
	const normalized = { ...repair };
	if (!normalized.answerChain && normalized.currentAnswerChain) {
		normalized.answerChain = normalized.currentAnswerChain;
	}
	if (!normalized.chainResolution && normalized.currentChainResolution) {
		normalized.chainResolution = normalized.currentChainResolution;
	}
	delete normalized.currentAnswerChain;
	delete normalized.currentChainResolution;
	return normalized;
}

const FullChainRepairItemSchema = z.object({
	sourceQuestionRef: z.string(),
	answerChain: z.object({
		id: z.string().nullable(),
		title: z.string(),
		canonicalChainText: z.string(),
		summary: z.string(),
		broadTopic: z.string().nullable(),
		chainFamilyId: z.string().nullable(),
		steps: z.array(StepSchema),
		confidence: z.number(),
		needsHumanReview: z.boolean(),
		reviewNotes: z.array(z.string())
	}),
	chainResolution: ChainResolutionSchema.optional(),
	commonWeakAnswers: z
		.array(
			z.object({
				weakAnswerText: z.string(),
				missingStepIndexes: z.array(z.number()),
				explanation: z.string(),
				confidence: z.number()
			})
		)
		.nullable()
		.optional()
});

const FullChainRepairSchema = z.preprocess(
	normalizeRepairEnvelope,
	z.object({
		repairs: z.array(FullChainRepairItemSchema)
	})
);

const FullQuestionQualityRepairItemSchema = z.object({
	sourceQuestionRef: z.string(),
	selfContainedPromptText: z.string().nullable().optional(),
	contextText: z.string().nullable().optional(),
	response: createFullResponseSchema().nullable().optional(),
	assets: z.array(createLooseAssetSchema()).nullable().optional(),
	markSchemeItems: z
		.array(
			z.object({
				itemType: z.string(),
				text: z.string(),
				marks: z.number().nullable(),
				sourceRef: z.string(),
				confidence: z.number().nullable()
			})
		)
		.nullable()
		.optional(),
	needsHumanReview: z.boolean().nullable().optional(),
	reviewNotes: z.array(z.string()).nullable().optional(),
	answerChain: AnswerChainSchema.nullable().optional(),
	chainResolution: ChainResolutionSchema.nullable().optional(),
	markChecklist: z
		.array(
			z.object({
				text: z.string(),
				required: z.boolean(),
				markSchemeItemIndexes: z.array(z.number()),
				confidence: z.number().nullable(),
				needsHumanReview: z.boolean()
			})
		)
		.nullable()
		.optional(),
	modelAnswer: z
		.object({
			answerText: z.string(),
			confidence: z.number(),
			needsHumanReview: z.boolean()
		})
		.nullable()
		.optional(),
	commonWeakAnswers: z
		.array(
			z.object({
				weakAnswerText: z.string(),
				missingStepIndexes: z.array(z.number()),
				explanation: z.string(),
				confidence: z.number()
			})
		)
		.nullable()
		.optional()
});

const FullQuestionQualityRepairSchema = z.preprocess(
	normalizeRepairEnvelope,
	z.object({
		repairs: z.array(FullQuestionQualityRepairItemSchema)
	})
);

export function createRenderBlockSchema() {
	return z.object({
		kind: z.enum([
			'paragraph',
			'equation',
			'figure',
			'table',
			'structured-table',
			'ordered-list',
			'bullet-list',
			'key'
		]),
		text: z.string().nullable(),
		label: z.string().nullable(),
		assetLabel: z.string().nullable(),
		columns: z.array(z.string()).nullable(),
		rows: z.array(z.array(z.string())).nullable(),
		items: z.array(z.string()).nullable(),
		keyItems: z.array(z.object({ marker: z.string(), text: z.string() })).nullable(),
		compact: z.boolean().nullable(),
		wide: z.boolean().nullable()
	});
}

export function createFullResponseSchema() {
	return z.object({
		kind: z.enum([
			'none',
			'lines',
			'labeled-lines',
			'number-line',
			'choice',
			'choice-table',
			'matching',
			'asset-canvas',
			'drawing-box',
			'equation-blanks',
			'image-label-zones'
		]),
		count: z.number().nullable(),
		lineCount: z.number().nullable(),
		labels: z.array(z.string()).nullable(),
		label: z.string().nullable(),
		prefix: z.string().nullable(),
		unit: z.string().nullable(),
		options: z.array(z.string()).nullable(),
		layout: z.enum(['vertical', 'horizontal']).nullable(),
		columns: z.array(z.string()).nullable(),
		rows: z.array(z.array(z.string())).nullable(),
		leftTitle: z.string().nullable(),
		rightTitle: z.string().nullable(),
		left: z.array(z.string()).nullable(),
		right: z.array(z.string()).nullable(),
		assetLabel: z.string().nullable(),
		labelBank: z.array(z.string()).nullable(),
		segments: z
			.array(
				z.object({
					kind: z.enum(['text', 'math', 'blank']),
					text: z.string().nullable(),
					id: z.string().nullable(),
					label: z.string().nullable(),
					width: z.number().nullable()
				})
			)
			.nullable(),
		zones: z
			.array(
				z.object({
					id: z.string(),
					label: z.string(),
					x: z.number(),
					y: z.number(),
					width: z.number(),
					height: z.number()
				})
			)
			.nullable(),
		allowRepeats: z.boolean().nullable(),
		correctAnswers: z
			.array(z.object({ targetId: z.string(), correctAnswer: z.string() }))
			.nullable()
	});
}

function createLooseRenderBlockSchema() {
	return z
		.object({
			kind: z.string()
		})
		.passthrough();
}

function createLooseResponseSchema() {
	const correctAnswers = () =>
		z.array(z.object({ targetId: z.string(), correctAnswer: z.string() }));
	return z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('none') }).passthrough(),
		z.object({ kind: z.literal('lines') }).passthrough(),
		z.object({ kind: z.literal('labeled-lines') }).passthrough(),
		z.object({ kind: z.literal('drawing-box') }).passthrough(),
		z.object({ kind: z.literal('asset-canvas') }).passthrough(),
		z
			.object({
				kind: z.literal('choice'),
				options: z.array(z.string()),
				correctAnswers: correctAnswers()
			})
			.passthrough(),
		z.object({ kind: z.literal('choice-table'), correctAnswers: correctAnswers() }).passthrough(),
		z.object({ kind: z.literal('matching'), correctAnswers: correctAnswers() }).passthrough(),
		z
			.object({ kind: z.literal('equation-blanks'), correctAnswers: correctAnswers() })
			.passthrough(),
		z.object({ kind: z.literal('number-line'), correctAnswers: correctAnswers() }).passthrough(),
		z
			.object({ kind: z.literal('image-label-zones'), correctAnswers: correctAnswers() })
			.passthrough()
	]);
}

function normalizeCompactCorrectAnswer(value) {
	if (typeof value === 'string') {
		return { targetId: 'answer', correctAnswer: value };
	}
	if (!value || typeof value !== 'object') return value;
	const targetId =
		value.targetId ??
		value.id ??
		(Array.isArray(value.targetIds) ? value.targetIds.join('|') : undefined) ??
		'answer';
	const correctAnswer =
		value.correctAnswer ??
		value.answer ??
		value.text ??
		(Array.isArray(value.answers) ? value.answers.join(' | ') : undefined);
	return {
		targetId: String(targetId),
		correctAnswer: String(correctAnswer ?? '')
	};
}

function compactCorrectAnswerSchema() {
	return z.preprocess(
		normalizeCompactCorrectAnswer,
		z.object({ targetId: z.string(), correctAnswer: z.string() })
	);
}

function compactAssetLabelFields() {
	return {
		assetLabel: z.string().nullable().optional(),
		label: z.string().nullable().optional(),
		sourceLabel: z.string().nullable().optional(),
		instructions: z.string().nullable().optional()
	};
}

function createCompactResponseSchema() {
	const correctAnswers = () => z.array(compactCorrectAnswerSchema()).optional();
	const equationSegment = z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('text'), text: z.string() }).strict(),
		z.object({ kind: z.literal('math'), text: z.string() }).strict(),
		z
			.object({
				kind: z.literal('blank'),
				id: z.string(),
				label: z.string().nullable().optional(),
				width: z.number().nullable().optional()
			})
			.strict()
	]);
	return z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('none') }).strict(),
		z
			.object({
				kind: z.literal('lines'),
				count: z.number().nullable().optional(),
				lineCount: z.number().nullable().optional()
			})
			.strict(),
		z
			.object({
				kind: z.literal('labeled-lines'),
				count: z.number().nullable().optional(),
				lineCount: z.number().nullable().optional(),
				labels: z.array(z.string()).nullable().optional()
			})
			.strict(),
		z
			.object({ kind: z.literal('drawing-box'), instructions: z.string().nullable().optional() })
			.strict(),
		z
			.object({
				kind: z.literal('asset-canvas'),
				correctAnswers: correctAnswers(),
				...compactAssetLabelFields()
			})
			.strict(),
		z
			.object({
				kind: z.literal('choice'),
				options: z.array(z.string()).max(8),
				correctAnswers: correctAnswers()
			})
			.strict(),
		z
			.object({
				kind: z.literal('choice-table'),
				columns: z.array(z.string()).nullable().optional(),
				rows: z.array(z.array(z.string())).nullable().optional(),
				correctAnswers: correctAnswers()
			})
			.strict(),
		z.object({ kind: z.literal('matching'), correctAnswers: correctAnswers() }).strict(),
		z
			.object({
				kind: z.literal('equation-blanks'),
				segments: z.array(equationSegment),
				correctAnswers: correctAnswers(),
				unorderedGroups: z
					.array(
						z.object({
							targetIds: z.array(z.string()),
							answers: z.array(z.string())
						})
					)
					.nullable()
					.optional()
			})
			.strict(),
		z.object({ kind: z.literal('number-line'), correctAnswers: correctAnswers() }).strict(),
		z
			.object({
				kind: z.literal('image-label-zones'),
				correctAnswers: correctAnswers(),
				...compactAssetLabelFields()
			})
			.strict()
	]);
}

const CompactRenderBlockSchema = z
	.object({
		kind: z.enum([
			'paragraph',
			'equation',
			'table',
			'structured-table',
			'ordered-list',
			'bullet-list',
			'key'
		]),
		text: z.string().nullable().optional(),
		label: z.string().nullable().optional(),
		assetLabel: z.string().nullable().optional(),
		columns: z.array(z.string()).nullable().optional(),
		rows: z.array(z.array(z.string())).nullable().optional(),
		items: z.array(z.string()).nullable().optional(),
		keyItems: z
			.array(z.object({ marker: z.string(), text: z.string() }))
			.nullable()
			.optional(),
		compact: z.boolean().nullable().optional(),
		wide: z.boolean().nullable().optional()
	})
	.strict();

function createLooseAssetSchema() {
	return z
		.object({
			sourceLabel: z.string()
		})
		.passthrough();
}

export const FullPaperExtractionSchema = z.object({
	sourceDocumentId: z.string().nullable().optional(),
	extractionRun: z.object({
		agentVersion: z.string(),
		needsHumanReview: z.boolean(),
		reviewNotes: z.array(z.string()),
		source: z.string().nullable().optional(),
		model: z.string().nullable().optional(),
		dpi: z.number().nullable().optional(),
		extractedAt: z.string().nullable().optional(),
		pageSelection: z
			.object({
				questionPages: z.array(z.number()).optional(),
				markSchemePages: z.array(z.number()).optional(),
				chunkPages: z.number().nullable().optional(),
				contextPages: z.number().nullable().optional(),
				chunkConcurrency: z.number().nullable().optional(),
				extractionGranularity: z.string().nullable().optional()
			})
			.optional()
	}),
	sourceDocument: z.object({
		id: z.string(),
		title: z.string(),
		pageCount: z.number(),
		docType: z.string().nullable().optional(),
		board: z.string().nullable().optional(),
		qualification: z.string().nullable().optional(),
		subject: z.string().nullable().optional(),
		subjectArea: z.string().nullable().optional(),
		tier: z.string().nullable().optional(),
		paper: z.string().nullable().optional(),
		componentCode: z.string().nullable().optional(),
		series: z.string().nullable().optional(),
		year: z.number().nullable().optional(),
		filePath: z.string().nullable().optional(),
		fileHash: z.string().nullable().optional(),
		metadata: z
			.object({
				originalFilename: z.string().nullable().optional(),
				notes: z.array(z.string()).optional()
			})
			.nullable()
			.optional()
	}),
	markSchemeDocument: z.object({
		id: z.string(),
		title: z.string(),
		pageCount: z.number(),
		docType: z.string().nullable().optional(),
		board: z.string().nullable().optional(),
		qualification: z.string().nullable().optional(),
		subject: z.string().nullable().optional(),
		subjectArea: z.string().nullable().optional(),
		tier: z.string().nullable().optional(),
		paper: z.string().nullable().optional(),
		componentCode: z.string().nullable().optional(),
		series: z.string().nullable().optional(),
		year: z.number().nullable().optional(),
		filePath: z.string().nullable().optional(),
		fileHash: z.string().nullable().optional(),
		metadata: z
			.object({
				originalFilename: z.string().nullable().optional(),
				notes: z.array(z.string()).optional()
			})
			.nullable()
			.optional()
	}),
	supportingDocuments: z
		.array(
			z.object({
				id: z.string(),
				docType: z.string(),
				title: z.string(),
				pageCount: z.number(),
				filePath: z.string().nullable(),
				fileHash: z.string().nullable(),
				metadata: z
					.object({
						originalFilename: z.string().nullable().optional(),
						notes: z.array(z.string()).optional()
					})
					.nullable()
					.optional()
			})
		)
		.optional(),
	questions: z.array(
		z.object({
			id: z.string().nullable(),
			sourceQuestionRef: z.string(),
			parentSourceQuestionRef: z.string().nullable(),
			displayOrder: z.number(),
			promptText: z.string(),
			selfContainedPromptText: z.string().nullable(),
			contextText: z.string().nullable(),
			commandWord: z.string().nullable(),
			marks: z.number().nullable(),
			pageStart: z.number(),
			pageEnd: z.number(),
			topicPath: z.array(z.string()),
			specRef: z.string().nullable(),
			stemBlocks: z.array(createLooseRenderBlockSchema()),
			leadBlocks: z.array(createLooseRenderBlockSchema()),
			promptBlocks: z.array(createLooseRenderBlockSchema()),
			response: createLooseResponseSchema(),
			afterResponseBlocks: z.array(createLooseRenderBlockSchema()),
			assets: z.array(createLooseAssetSchema()),
			markSchemeItems: z.array(
				z.object({
					itemType: z.string(),
					text: z.string(),
					marks: z.number().nullable(),
					sourceRef: z.string(),
					confidence: z.number().nullable()
				})
			),
			markChecklist: z.array(
				z.object({
					text: z.string(),
					required: z.boolean(),
					markSchemeItemIndexes: z.array(z.number()),
					confidence: z.number().nullable(),
					needsHumanReview: z.boolean()
				})
			),
			modelAnswer: z
				.object({
					answerText: z.string(),
					confidence: z.number(),
					needsHumanReview: z.boolean()
				})
				.nullable(),
			answerChain: z.object({
				id: z.string().nullable(),
				title: z.string(),
				canonicalChainText: z.string(),
				summary: z.string(),
				broadTopic: z.string().nullable(),
				chainFamilyId: z.string().nullable(),
				steps: z.array(StepSchema),
				confidence: z.number(),
				needsHumanReview: z.boolean(),
				reviewNotes: z.array(z.string())
			}),
			chainResolution: ChainResolutionSchema.optional(),
			commonWeakAnswers: z.array(
				z.object({
					weakAnswerText: z.string(),
					missingStepIndexes: z.array(z.number()),
					explanation: z.string(),
					confidence: z.number()
				})
			),
			extractionConfidence: z.number(),
			needsHumanReview: z.boolean(),
			reviewNotes: z.array(z.string())
		})
	),
	localAssetManifest: z
		.array(
			z.object({
				page: z.number().nullable(),
				fileName: z.string(),
				filePath: z.string(),
				publicPath: z.string(),
				r2Key: z.string()
			})
		)
		.optional()
});

export const LlmFullPaperExtractionSchema = z.object({
	extractionRun: z.object({
		agentVersion: z.string(),
		needsHumanReview: z.boolean(),
		reviewNotes: z.array(z.string())
	}),
	sourceDocument: z.object({
		id: z.string(),
		title: z.string(),
		pageCount: z.number()
	}),
	markSchemeDocument: z.object({
		id: z.string(),
		title: z.string(),
		pageCount: z.number()
	}),
	questions: z.array(
		z.object({
			id: z.string().nullable(),
			sourceQuestionRef: z.string(),
			parentSourceQuestionRef: z.string().nullable(),
			displayOrder: z.number(),
			promptText: z.string(),
			selfContainedPromptText: z.string().nullable(),
			contextText: z.string().nullable(),
			commandWord: z.string().nullable(),
			marks: z.number().nullable(),
			pageStart: z.number(),
			pageEnd: z.number(),
			topicPath: z.array(z.string()),
			specRef: z.string().nullable(),
			stemBlocks: z.array(createLooseRenderBlockSchema()),
			leadBlocks: z.array(createLooseRenderBlockSchema()),
			promptBlocks: z.array(createLooseRenderBlockSchema()),
			response: createLooseResponseSchema(),
			afterResponseBlocks: z.array(createLooseRenderBlockSchema()),
			assets: z.array(createLooseAssetSchema()),
			markSchemeItems: z.array(
				z.object({
					itemType: z.string(),
					text: z.string(),
					marks: z.number().nullable(),
					sourceRef: z.string(),
					confidence: z.number().nullable()
				})
			),
			markChecklist: z.array(
				z.object({
					text: z.string(),
					required: z.boolean(),
					markSchemeItemIndexes: z.array(z.number()),
					confidence: z.number().nullable(),
					needsHumanReview: z.boolean()
				})
			),
			modelAnswer: z
				.object({
					answerText: z.string(),
					confidence: z.number(),
					needsHumanReview: z.boolean()
				})
				.nullable(),
			answerChain: z.object({
				id: z.string().nullable(),
				title: z.string(),
				canonicalChainText: z.string(),
				summary: z.string(),
				broadTopic: z.string().nullable(),
				chainFamilyId: z.string().nullable(),
				steps: z.array(StepSchema),
				confidence: z.number(),
				needsHumanReview: z.boolean(),
				reviewNotes: z.array(z.string())
			}),
			chainResolution: ChainResolutionSchema.optional(),
			commonWeakAnswers: z.array(
				z.object({
					weakAnswerText: z.string(),
					missingStepIndexes: z.array(z.number()),
					explanation: z.string(),
					confidence: z.number()
				})
			),
			extractionConfidence: z.number(),
			needsHumanReview: z.boolean(),
			reviewNotes: z.array(z.string())
		})
	)
});

function normalizeCompactMarkSchemeItem(value) {
	if (!value || typeof value !== 'object') return value;
	const text =
		value.text ?? value.criterion ?? value.description ?? value.answer ?? value.markingPoint;
	const marks = value.marks ?? value.mark;
	const itemType = value.itemType ?? value.kind ?? null;
	const sourceRef = value.sourceRef ?? value.ref ?? value.source ?? null;
	const output = {
		...value,
		itemType,
		text,
		marks,
		sourceRef
	};
	if (value.markSchemeNote && text) output.text = `${text} ${value.markSchemeNote}`;
	return output;
}

const CompactMarkSchemeItemSchema = z.preprocess(
	normalizeCompactMarkSchemeItem,
	z.object({
		itemType: z.string().nullable().optional(),
		text: z.string(),
		marks: z.number().nullable().optional(),
		sourceRef: z.string().nullable().optional(),
		confidence: z.number().nullable().optional()
	})
);

function normalizeCompactChecklistItem(value) {
	if (typeof value === 'string') {
		return {
			text: value,
			required: true,
			markSchemeItemIndexes: [],
			confidence: 0.8,
			needsHumanReview: false
		};
	}
	return value;
}

const CompactMarkChecklistItemSchema = z.preprocess(
	normalizeCompactChecklistItem,
	z
		.object({
			text: z.string().nullable().optional(),
			required: z.boolean().nullable().optional(),
			markSchemeItemIndexes: z.array(z.number()).nullable().optional(),
			confidence: z.number().nullable().optional(),
			needsHumanReview: z.boolean().nullable().optional()
		})
		.strict()
);

const CompactReviewNoteSchema = z.union([
	z.string(),
	z
		.object({
			text: z.string().nullable().optional(),
			description: z.string().nullable().optional(),
			note: z.string().nullable().optional(),
			severity: z.string().nullable().optional()
		})
		.passthrough()
]);

const CompactModelAnswerSchema = z.union([
	z
		.object({
			answerText: z.string(),
			confidence: z.number().nullable().optional(),
			needsHumanReview: z.boolean().nullable().optional()
		})
		.nullable(),
	z.string()
]);

function normalizeCompactQuestion(value) {
	if (!value || typeof value !== 'object') return value;
	const sourceQuestionRef =
		value.sourceQuestionRef ?? value.questionNumber ?? value.ref ?? value.sourceRef;
	const sourcePages = Array.isArray(value.sourcePages) ? value.sourcePages : [];
	const pageStart = value.pageStart ?? sourcePages[0];
	const pageEnd = value.pageEnd ?? sourcePages[sourcePages.length - 1] ?? pageStart;
	const reviewNotes = value.reviewNotes ?? value.reviewFlags ?? [];
	return {
		...value,
		sourceQuestionRef,
		parentSourceQuestionRef:
			value.parentSourceQuestionRef ?? value.parentQuestionNumber ?? value.parentRef ?? null,
		pageStart,
		pageEnd,
		extractionConfidence: value.extractionConfidence ?? value.confidence,
		reviewNotes
	};
}

const CompactQuestionSchema = z.preprocess(
	normalizeCompactQuestion,
	z.object({
		id: z.string().nullable().optional(),
		sourceQuestionRef: z.string(),
		parentSourceQuestionRef: z.string().nullable().optional(),
		promptText: z.string(),
		selfContainedPromptText: z.string().nullable().optional(),
		contextText: z.string().nullable().optional(),
		contextBlocks: z.array(CompactRenderBlockSchema).nullable().optional(),
		commandWord: z.string().nullable().optional(),
		marks: z.number().nullable().optional(),
		pageStart: z.number().nullable().optional(),
		pageEnd: z.number().nullable().optional(),
		response: createCompactResponseSchema().optional(),
		markSchemeItems: z.array(CompactMarkSchemeItemSchema),
		markChecklist: z.array(CompactMarkChecklistItemSchema),
		modelAnswer: CompactModelAnswerSchema.optional(),
		extractionConfidence: z.number().nullable().optional(),
		needsHumanReview: z.boolean().nullable().optional(),
		reviewNotes: z.array(CompactReviewNoteSchema).nullable().optional()
	})
);

export const LlmCompactFullPaperExtractionSchema = z.object({
	questions: z.array(CompactQuestionSchema)
});

function llmLoggingEnabled() {
	return !['0', 'false', 'off', 'no'].includes(
		String(process.env.EXTRACTION_LLM_LOG ?? '1').toLowerCase()
	);
}

function llmLogDir() {
	return process.env.EXTRACTION_LLM_LOG_DIR || path.join(process.cwd(), 'tmp/llm-extraction-logs');
}

function llmLogPath() {
	return path.join(llmLogDir(), `${process.env.EXTRACTION_RUN_ID || LLM_LOG_RUN_ID}.jsonl`);
}

function truncateForLog(text, limit = LLM_LOG_TEXT_LIMIT) {
	const value = String(text ?? '');
	if (value.length <= limit) return value;
	return `${value.slice(0, limit)}...[truncated ${value.length - limit} chars]`;
}

function appendLlmLog(record) {
	if (!llmLoggingEnabled()) return;
	const filePath = llmLogPath();
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(
		filePath,
		`${JSON.stringify({ timestamp: new Date().toISOString(), runId: process.env.EXTRACTION_RUN_ID || LLM_LOG_RUN_ID, ...record })}\n`,
		{ flag: 'a' }
	);
}

function estimateBase64Bytes(value) {
	if (typeof value !== 'string') return null;
	return Math.floor((value.length * 3) / 4);
}

function summarizeLlmInput(input) {
	const summary = {
		mode: typeof input === 'string' ? 'string' : 'messages',
		messageCount: Array.isArray(input) ? input.length : null,
		textChars: 0,
		textPreviews: [],
		imageCount: 0,
		inlineDataBytes: 0,
		images: [],
		partTypes: {}
	};

	function countPartType(type) {
		const key = type || 'unknown';
		summary.partTypes[key] = (summary.partTypes[key] ?? 0) + 1;
	}

	function addText(role, text) {
		const value = String(text ?? '');
		summary.textChars += value.length;
		if (summary.textPreviews.length < 12 && value.trim()) {
			summary.textPreviews.push({
				role: role ?? null,
				chars: value.length,
				text: truncateForLog(value.replace(/\s+/g, ' ').trim(), 500)
			});
		}
	}

	function addImage(part) {
		summary.imageCount += 1;
		const base64Chars = typeof part.data === 'string' ? part.data.length : null;
		const byteEstimate = estimateBase64Bytes(part.data);
		if (byteEstimate) summary.inlineDataBytes += byteEstimate;
		if (summary.images.length < 80) {
			summary.images.push({
				filename: part.filename ?? null,
				mimeType: part.mimeType ?? null,
				base64Chars,
				byteEstimate
			});
		}
	}

	function visitContent(content, role = null) {
		if (typeof content === 'string') {
			addText(role, content);
			return;
		}
		if (!Array.isArray(content)) return;
		for (const part of content) {
			if (!part || typeof part !== 'object') continue;
			countPartType(part.type);
			if (part.type === 'text') addText(role, part.text);
			else if (part.type === 'inlineData') addImage(part);
		}
	}

	if (typeof input === 'string') addText(null, input);
	else if (Array.isArray(input)) {
		for (const message of input) visitContent(message?.content, message?.role);
	}
	return summary;
}

function summarizeOutputValue(value) {
	if (!value || typeof value !== 'object') return { type: typeof value };
	const questions = Array.isArray(value.questions) ? value.questions : null;
	const repairs = Array.isArray(value.repairs) ? value.repairs : null;
	return {
		keys: Object.keys(value).slice(0, 30),
		questionCount: questions?.length ?? null,
		sourceQuestionRefs: questions
			?.map((question) => question?.sourceQuestionRef)
			.filter(Boolean)
			.slice(0, 80),
		repairCount: repairs?.length ?? null,
		repairRefs: repairs
			?.map((repair) => repair?.sourceQuestionRef)
			.filter(Boolean)
			.slice(0, 80)
	};
}

function sanitizeUnknownForLog(value, depth = 0) {
	if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
	if (typeof value === 'string') return truncateForLog(value, depth === 0 ? 4000 : 1200);
	if (Array.isArray(value)) {
		if (depth > 3) return `[array length ${value.length}]`;
		return value.slice(0, 30).map((entry) => sanitizeUnknownForLog(entry, depth + 1));
	}
	if (typeof value !== 'object') return String(value);
	if (depth > 3) return '[object]';
	const output = {};
	for (const [key, entry] of Object.entries(value).slice(0, 40)) {
		if (key === 'data' && typeof entry === 'string') {
			output[key] = `[omitted base64 ${entry.length} chars]`;
		} else {
			output[key] = sanitizeUnknownForLog(entry, depth + 1);
		}
	}
	return output;
}

function sanitizeLlmEvent(event) {
	if (!event || typeof event !== 'object') return event;
	if (event.type === 'delta') {
		return {
			type: 'delta',
			channel: event.channel,
			textChars: typeof event.text === 'string' ? event.text.length : null,
			text: truncateForLog(event.text)
		};
	}
	if (event.type === 'usage') {
		return {
			type: 'usage',
			usage: event.usage,
			costUsd: event.costUsd,
			modelVersion: event.modelVersion
		};
	}
	if (event.type === 'model') return event;
	if (event.type === 'blocked') return event;
	if (event.type === 'tool_call') {
		return {
			...event,
			input: sanitizeUnknownForLog(event.input),
			output: sanitizeUnknownForLog(event.output)
		};
	}
	return sanitizeUnknownForLog(event);
}

function summarizeLlmError(error) {
	if (!error || typeof error !== 'object') return String(error);
	const attempts = Array.isArray(error.attempts)
		? error.attempts.map((attempt) => ({
				attempt: attempt.attempt ?? null,
				rawTextChars: typeof attempt.rawText === 'string' ? attempt.rawText.length : null,
				rawTextPreview: truncateForLog(attempt.rawText, 2000),
				error:
					attempt.error instanceof Error
						? { name: attempt.error.name, message: attempt.error.message }
						: sanitizeUnknownForLog(attempt.error)
			}))
		: null;
	return {
		name: error.name ?? 'Error',
		message: error.message ?? String(error),
		attempts
	};
}

export function setupLlmEnv() {
	loadLocalEnv();
	process.env.CHATGPT_RESPONSES_WEBSOCKET_MODE = 'off';
	process.env.CHATGPT_RESPONSES_EXPERIMENTAL_HEADER = 'off';
}

async function generateJsonWithTimeout(options, label = 'LLM call', timeoutMs = null) {
	const resolvedTimeoutMs = Number(process.env.EXTRACTION_LLM_TIMEOUT_MS ?? DEFAULT_LLM_TIMEOUT_MS);
	const resolvedMaxAttempts = Number(
		process.env.EXTRACTION_LLM_MAX_ATTEMPTS ?? DEFAULT_LLM_MAX_ATTEMPTS
	);
	const activeTimeoutMs = timeoutMs ?? resolvedTimeoutMs;
	const sourceOnEvent = options.onEvent;
	const maxCalls = Number(process.env.EXTRACTION_LLM_MAX_CALLS ?? 0);
	if (maxCalls > 0 && llmCallCounter >= maxCalls) {
		throw new Error(
			`LLM call budget exceeded before ${label}: ${llmCallCounter}/${maxCalls} calls already started.`
		);
	}
	const callId = `${String(++llmCallCounter).padStart(4, '0')}-${label
		.replace(/[^a-zA-Z0-9_.:-]+/g, '-')
		.slice(0, 100)}`;
	const startedAtMs = Date.now();
	const eventTotals = {
		thoughtChars: 0,
		responseChars: 0,
		streamEventCount: 0,
		usage: null,
		costUsd: null,
		modelVersion: null,
		blocked: false
	};
	const onEvent = (event) => {
		eventTotals.streamEventCount += 1;
		if (event?.type === 'delta' && event.channel === 'thought') {
			eventTotals.thoughtChars += event.text?.length ?? 0;
		} else if (event?.type === 'delta' && event.channel === 'response') {
			eventTotals.responseChars += event.text?.length ?? 0;
		} else if (event?.type === 'usage') {
			eventTotals.usage = event.usage ?? null;
			eventTotals.costUsd = event.costUsd ?? null;
			eventTotals.modelVersion = event.modelVersion ?? eventTotals.modelVersion;
		} else if (event?.type === 'model') {
			eventTotals.modelVersion = event.modelVersion ?? eventTotals.modelVersion;
		} else if (event?.type === 'blocked') {
			eventTotals.blocked = true;
		}
		appendLlmLog({
			type: 'llm_call_event',
			callId,
			label,
			event: sanitizeLlmEvent(event)
		});
		sourceOnEvent?.(event);
	};
	const request = {
		maxAttempts: resolvedMaxAttempts,
		...options,
		onEvent
	};
	appendLlmLog({
		type: 'llm_call_started',
		callId,
		label,
		model: request.model,
		thinkingLevel: request.thinkingLevel ?? null,
		mediaResolution: request.mediaResolution ?? null,
		timeoutMs: activeTimeoutMs,
		maxAttempts: request.maxAttempts,
		telemetry: request.telemetry ?? null,
		input: summarizeLlmInput(request.input)
	});
	let controller = null;
	let timeout = null;
	if (activeTimeoutMs && activeTimeoutMs > 0) {
		controller = new AbortController();
		timeout = setTimeout(() => {
			controller.abort(new Error(`${label} timed out after ${activeTimeoutMs}ms.`));
		}, activeTimeoutMs);
		request.signal = controller.signal;
	}
	try {
		const result = await generateJson(request);
		appendLlmLog({
			type: 'llm_call_completed',
			callId,
			label,
			ok: true,
			durationMs: Date.now() - startedAtMs,
			model: result.result?.model ?? request.model,
			provider: result.result?.provider ?? null,
			modelVersion: result.result?.modelVersion ?? eventTotals.modelVersion,
			blocked: result.result?.blocked ?? eventTotals.blocked,
			usage: result.result?.usage ?? eventTotals.usage,
			costUsd: result.result?.costUsd ?? eventTotals.costUsd,
			rawTextChars: result.rawText?.length ?? null,
			outputTextChars: result.result?.text?.length ?? eventTotals.responseChars,
			thoughtChars: result.result?.thoughts?.length ?? eventTotals.thoughtChars,
			streamEventCount: eventTotals.streamEventCount,
			value: summarizeOutputValue(result.value)
		});
		return result;
	} catch (error) {
		appendLlmLog({
			type: 'llm_call_completed',
			callId,
			label,
			ok: false,
			durationMs: Date.now() - startedAtMs,
			model: request.model,
			modelVersion: eventTotals.modelVersion,
			usage: eventTotals.usage,
			costUsd: eventTotals.costUsd,
			thoughtChars: eventTotals.thoughtChars,
			outputTextChars: eventTotals.responseChars,
			streamEventCount: eventTotals.streamEventCount,
			error: summarizeLlmError(error)
		});
		throw error;
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

export function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function pdfPageCount(filePath) {
	const raw = execFileSync('pdfinfo', [filePath], { encoding: 'utf8' });
	const match = raw.match(/^Pages:\s+(\d+)/m);
	if (!match) throw new Error(`Could not read PDF page count from ${filePath}.`);
	return Number(match[1]);
}

export function pdfText(filePath, maxChars = 140000, pages = []) {
	try {
		const args = ['-layout', '-nopgbrk'];
		if (pages.length) {
			args.push('-f', String(Math.min(...pages)), '-l', String(Math.max(...pages)));
		}
		args.push(filePath, '-');
		const raw = execFileSync('pdftotext', args, {
			encoding: 'utf8',
			maxBuffer: 32 * 1024 * 1024
		});
		return raw
			.replace(/\r/g, '')
			.replace(/[ \t]+\n/g, '\n')
			.slice(0, maxChars);
	} catch {
		return '';
	}
}

export function fileHash(filePath) {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function renderCacheDir(outputDir, pdfPath, prefix, dpi) {
	const hash = fileHash(pdfPath).slice(0, 16);
	return path.join(outputDir, `${prefix}-dpi${dpi}-${hash}`);
}

export function renderPdfPages({ pdfPath, outputDir, prefix, dpi = 160, force = false }) {
	const pageCount = pdfPageCount(pdfPath);
	const cacheDir = renderCacheDir(outputDir, pdfPath, prefix, dpi);
	mkdirSync(cacheDir, { recursive: true });
	const existing = imageFiles(cacheDir);
	if (!force && existing.length === pageCount) return existing;
	execFileSync('pdftoppm', ['-r', String(dpi), '-png', pdfPath, path.join(cacheDir, prefix)], {
		stdio: ['ignore', 'pipe', 'pipe']
	});
	const rendered = imageFiles(cacheDir);
	if (rendered.length !== pageCount) {
		throw new Error(`Rendered ${rendered.length} pages for ${pdfPath}, expected ${pageCount}.`);
	}
	return rendered;
}

export function imageFiles(dir) {
	return readdirSync(dir)
		.filter((fileName) => fileName.endsWith('.png'))
		.sort((a, b) => renderedPageNumber(a) - renderedPageNumber(b) || a.localeCompare(b))
		.map((fileName) => path.join(dir, fileName));
}

function renderedPageNumber(fileName) {
	const match = path.basename(fileName).match(/-(\d+)\.png$/);
	return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function imagePart(filePath) {
	return {
		type: 'inlineData',
		mimeType: 'image/png',
		data: readFileSync(filePath).toString('base64'),
		filename: path.basename(filePath)
	};
}

export function selectPages(files, pages = []) {
	if (!pages.length) return files;
	const wanted = new Set(pages);
	return files.filter((filePath) => {
		const match = path.basename(filePath).match(/-(\d+)\.png$/);
		return match ? wanted.has(Number(match[1])) : false;
	});
}

export function parsePageSelection(value) {
	if (!value) return [];
	const pages = new Set();
	for (const part of value.split(',')) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const range = trimmed.match(/^(\d+)-(\d+)$/);
		if (range) {
			const start = Number(range[1]);
			const end = Number(range[2]);
			for (let page = start; page <= end; page += 1) pages.add(page);
			continue;
		}
		const page = Number(trimmed);
		if (!Number.isInteger(page) || page < 1) throw new Error(`Invalid page selection: ${value}`);
		pages.add(page);
	}
	return [...pages].sort((a, b) => a - b);
}

export function escapePdfText(value) {
	return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function writeSimplePdf(filePath, title, lines) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	const textLines = [title, '', ...lines];
	const stream = [
		'BT',
		'/F1 12 Tf',
		'72 760 Td',
		'14 TL',
		...textLines.flatMap((line, index) => [index === 0 ? '' : 'T*', `(${escapePdfText(line)}) Tj`]),
		'ET'
	]
		.filter(Boolean)
		.join('\n');
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
		`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`
	];
	let pdf = '%PDF-1.4\n';
	const offsets = [0];
	for (const [index, object] of objects.entries()) {
		offsets.push(Buffer.byteLength(pdf, 'utf8'));
		pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
	}
	const xrefOffset = Buffer.byteLength(pdf, 'utf8');
	pdf += `xref\n0 ${objects.length + 1}\n`;
	pdf += '0000000000 65535 f \n';
	for (let index = 1; index <= objects.length; index += 1) {
		pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
	writeFileSync(filePath, pdf);
}

export function buildExtractionPrompt({
	sourceDocumentId,
	extractionSpec,
	extraInstructions = '',
	expectedQuestionCount = null
}) {
	return [
		'Extract GCSE science question-paper and mark-scheme page images into the required JSON schema.',
		'Use the exact camelCase field names from the schema. Do not return snake_case aliases.',
		'Use the question paper images and mark scheme images as the source of truth.',
		`Use sourceDocumentId: ${sourceDocumentId}`,
		expectedQuestionCount ? `Return exactly ${expectedQuestionCount} atomic question(s).` : '',
		'For each atomic question, align mark-scheme evidence, a student-facing checklist, a written-response model answer or fixed-response answer key, and a reusable answerChain.',
		'Use only these answerChain stepRole values: given, cause, process, link, effect, evidence, method, calculation, conclusion.',
		'The answerChain is a reusable reasoning or method pattern across questions. It is not a worked solution to this one question.',
		'For calculation questions, keep prompt-specific numbers, substitutions, intermediate values, final numeric answers, and one-question units in written-response modelAnswer, response.correctAnswers, markChecklist, and markSchemeItems only. Do not put them in answerChain title, canonicalChainText, summary, stepText, explanation, or commonOmission.',
		'Formula constants and symbolic formulae are allowed in answerChain text when they are part of the reusable method.',
		extraInstructions,
		'',
		'Project extraction contract excerpt:',
		extractionSpec
	]
		.filter(Boolean)
		.join('\n');
}

export function normalizeCandidate(candidate, { sourceDocumentId, model = null } = {}) {
	const normalized = {
		...candidate,
		sourceDocumentId: candidate.sourceDocumentId ?? sourceDocumentId,
		sourceDocument: candidate.sourceDocument ?? {
			id: candidate.sourceDocumentId ?? sourceDocumentId,
			documentType: 'question_paper',
			board: null,
			qualification: null,
			subject: null,
			tier: null,
			paper: null,
			componentCode: null,
			series: null,
			year: null,
			pageCount: null,
			sourcePath: null,
			fileHash: null,
			notes: []
		},
		extractionRun: candidate.extractionRun ?? {
			model,
			needsHumanReview: false,
			reviewFlags: []
		},
		questions: (candidate.questions ?? []).map((question, index) => ({
			displayOrder: index + 1,
			selfContainedPromptText: question.selfContainedPromptText ?? question.promptText,
			topicPath: question.topicPath ?? [],
			requiredAssets: question.requiredAssets ?? [],
			commonWeakAnswers: question.commonWeakAnswers ?? [],
			missingLinks: question.missingLinks ?? [],
			needsHumanReview: question.needsHumanReview ?? false,
			reviewFlags: question.reviewFlags ?? [],
			...question
		}))
	};
	return ExtractionCandidateSchema.parse(normalized);
}

export async function extractCandidateFromImages({
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	mediaResolution = 'auto',
	sourceDocumentId,
	questionImages,
	markSchemeImages,
	extractionSpec,
	extraInstructions = '',
	expectedQuestionCount = null
}) {
	const prompt = buildExtractionPrompt({
		sourceDocumentId,
		extractionSpec,
		extraInstructions,
		expectedQuestionCount
	});
	const { value } = await generateJsonWithTimeout(
		{
			model,
			thinkingLevel,
			mediaResolution,
			telemetry: false,
			input: [
				{
					role: 'system',
					content:
						'You are a careful GCSE science extraction engine. Return source-grounded JSON only.'
				},
				{
					role: 'user',
					content: [
						{ type: 'text', text: prompt },
						{ type: 'text', text: 'QUESTION PAPER PAGE IMAGES FOLLOW, IN ORDER.' },
						...questionImages.map(imagePart),
						{ type: 'text', text: 'MARK SCHEME PAGE IMAGES FOLLOW, IN ORDER.' },
						...markSchemeImages.map(imagePart)
					]
				}
			],
			schema: LlmExtractionCandidateSchema
		},
		`extract-candidate:${sourceDocumentId}`
	);
	return normalizeCandidate(value, { sourceDocumentId, model });
}

export async function extractCandidateFromPdfPair({
	rootDir = process.cwd(),
	questionPaperPath,
	markSchemePath,
	sourceDocumentId,
	outputRoot = path.join(rootDir, 'tmp/llm-extraction-pipeline'),
	dpi = 160,
	forceRender = false,
	questionPages = [],
	markSchemePages = [],
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	extractionSpec,
	extraInstructions = '',
	expectedQuestionCount = null
}) {
	const questionImages = selectPages(
		renderPdfPages({
			pdfPath: questionPaperPath,
			outputDir: path.join(outputRoot, sourceDocumentId, 'question-paper'),
			prefix: 'question-paper',
			dpi,
			force: forceRender
		}),
		questionPages
	);
	const markSchemeImages = selectPages(
		renderPdfPages({
			pdfPath: markSchemePath,
			outputDir: path.join(outputRoot, sourceDocumentId, 'mark-scheme'),
			prefix: 'mark-scheme',
			dpi,
			force: forceRender
		}),
		markSchemePages
	);
	if (!questionImages.length) throw new Error('No question-paper images selected.');
	if (!markSchemeImages.length) throw new Error('No mark-scheme images selected.');
	return extractCandidateFromImages({
		model,
		thinkingLevel,
		sourceDocumentId,
		questionImages,
		markSchemeImages,
		extractionSpec,
		extraInstructions,
		expectedQuestionCount
	});
}

export function compareQuestionRefs(left, right) {
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

export function questionRefsFromText(text) {
	const refs = new Set();
	const raw = String(text ?? '');
	for (const line of raw.split(/\r?\n/)) {
		const compact = line.match(/^\s*(\d{2})\s*\.\s*(\d{1,2})\b/);
		if (compact) {
			const ref = normalizedQuestionRef(compact[1], compact[2]);
			if (ref) refs.add(ref);
			continue;
		}
		const spaced = line.match(/^\s*(\d)\s+(\d)\s*\.\s*(\d{1,2})\b/);
		if (spaced) {
			const ref = normalizedQuestionRef(`${spaced[1]}${spaced[2]}`, spaced[3]);
			if (ref) refs.add(ref);
		}
	}
	return [...refs].sort(compareQuestionRefs);
}

function normalizedQuestionRef(parent, child) {
	const parentNumber = Number(parent);
	const childNumber = Number(child);
	if (!Number.isInteger(parentNumber) || parentNumber <= 0) return null;
	if (!Number.isInteger(childNumber) || childNumber <= 0) return null;
	if (childNumber > 20) return null;
	return `${String(parentNumber).padStart(2, '0')}.${childNumber}`;
}

export function markSchemeTextExcerptForRefs(markSchemeText, refs, windowLines = 55) {
	const wantedRefs = [...new Set(refs ?? [])];
	const text = String(markSchemeText ?? '');
	if (wantedRefs.length === 0) return text.slice(0, 30000);
	const lines = text.split(/\r?\n/);
	const wanted = new Set(wantedRefs);
	const selected = new Set();
	for (const [index, line] of lines.entries()) {
		const lineRefs = questionRefsFromText(line);
		if (!lineRefs.some((ref) => wanted.has(ref))) continue;
		const start = Math.max(0, index - 8);
		const end = Math.min(lines.length, index + windowLines);
		for (let lineIndex = start; lineIndex < end; lineIndex += 1) selected.add(lineIndex);
	}
	if (selected.size === 0) return text.slice(0, 30000);
	return [...selected]
		.sort((a, b) => a - b)
		.map((index) => lines[index])
		.join('\n')
		.slice(0, 30000);
}

export function pageNumberFromRenderedPath(filePath) {
	const match = path.basename(filePath).match(/-(\d+)\.png$/);
	return match ? Number(match[1]) : null;
}

export function chunkImages(images, chunkPages = 6, contextPages = 2) {
	const chunks = [];
	for (let start = 0; start < images.length; start += chunkPages) {
		const priorContextImages =
			contextPages > 0 ? images.slice(Math.max(0, start - contextPages), start) : [];
		const coreImages = images.slice(start, Math.min(start + chunkPages, images.length));
		const lookaheadImages =
			start + chunkPages < images.length
				? images.slice(start + chunkPages, start + chunkPages + 1)
				: [];
		chunks.push({
			index: chunks.length,
			total: 0,
			priorContextImages,
			coreImages,
			lookaheadImages,
			images: [...priorContextImages, ...coreImages, ...lookaheadImages],
			priorContextPages: priorContextImages.map(pageNumberFromRenderedPath),
			corePages: coreImages.map(pageNumberFromRenderedPath),
			lookaheadPages: lookaheadImages.map(pageNumberFromRenderedPath)
		});
	}
	return chunks.map((chunk) => ({ ...chunk, total: chunks.length }));
}

function sourceDocumentPrompt(doc) {
	return [
		`id: ${doc.id}`,
		`type: ${doc.docType}`,
		`title: ${doc.title}`,
		`file: ${doc.fileName ?? path.basename(doc.path)}`,
		doc.pages?.length ? `pages included: ${doc.pages.join(', ')}` : null
	]
		.filter(Boolean)
		.join('; ');
}

function questionPaperImageParts(chunk) {
	if (!chunk) return [];
	const parts = [];
	for (const image of chunk.priorContextImages ?? []) {
		parts.push({
			type: 'text',
			text: `PRIOR CONTEXT QUESTION PAPER PAGE ${pageNumberFromRenderedPath(image)}. Use only for parent stems, previous subpart values, tables, figures, and diagrams needed by core-page questions. Do not start or extract any question whose own number/prompt begins on this page.`
		});
		parts.push(imagePart(image));
	}
	for (const image of chunk.coreImages ?? chunk.images ?? []) {
		parts.push({
			type: 'text',
			text: `CORE QUESTION PAPER PAGE ${pageNumberFromRenderedPath(image)}. Extract atomic subquestions whose own number/prompt starts on this page.`
		});
		parts.push(imagePart(image));
	}
	for (const image of chunk.lookaheadImages ?? []) {
		parts.push({
			type: 'text',
			text: `LOOKAHEAD QUESTION PAPER PAGE ${pageNumberFromRenderedPath(image)}. Use only to finish an atomic subquestion that started on a core page. Do not start or extract sibling subquestions from this page.`
		});
		parts.push(imagePart(image));
	}
	return parts;
}

function compactNumber(value, fallback = null) {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function compactConfidence(value, fallback = 0.82) {
	const numeric = compactNumber(value, fallback);
	return Math.max(0, Math.min(1, numeric));
}

function compactResponse(response, marks) {
	const kind = response?.kind ?? (marks ? 'lines' : 'none');
	const output = { kind };
	for (const [key, value] of Object.entries(response ?? {})) {
		if (key === 'kind' || value === null || value === undefined) continue;
		if (Array.isArray(value) && value.length === 0) continue;
		output[key] = value;
	}
	if (kind === 'lines' && output.count === undefined && output.lineCount === undefined) {
		output.count = Math.max(1, marks ?? 1);
	}
	if (kind === 'choice') {
		output.options ??= [];
		output.correctAnswers ??= [];
	}
	if (
		['choice-table', 'matching', 'equation-blanks', 'number-line', 'image-label-zones'].includes(
			kind
		)
	) {
		output.correctAnswers ??= [];
	}
	if (Array.isArray(output.correctAnswers)) {
		output.correctAnswers = output.correctAnswers.map((answer) =>
			typeof answer === 'string' ? { targetId: 'answer', correctAnswer: answer } : answer
		);
	}
	return output;
}

function compactModelAnswer(value) {
	if (!value) return null;
	if (typeof value === 'string') {
		const answerText = value.trim();
		return answerText
			? {
					answerText,
					confidence: 0.8,
					needsHumanReview: false
				}
			: null;
	}
	if (!value.answerText) return null;
	return {
		answerText: value.answerText,
		confidence: compactConfidence(value.confidence),
		needsHumanReview: value.needsHumanReview === true
	};
}

function compactChecklistText(item) {
	return String(item?.text ?? item?.item ?? item?.description ?? '').trim();
}

function compactReviewNotes(notes) {
	return (notes ?? [])
		.map((note) => {
			if (typeof note === 'string') return note.trim();
			const text = String(note?.text ?? note?.description ?? note?.note ?? '').trim();
			if (text && note?.severity) return `${note.severity}: ${text}`;
			return text;
		})
		.filter(Boolean);
}

function paragraphBlock(text) {
	const normalized = String(text ?? '').trim();
	return normalized ? [{ kind: 'paragraph', text: normalized }] : [];
}

function compactRenderBlocks(blocks) {
	return (blocks ?? [])
		.map((block) => {
			if (!block || typeof block !== 'object') return null;
			const output = {
				kind: block.kind,
				text: block.text ?? null,
				label: block.label ?? null,
				assetLabel: block.assetLabel ?? null,
				columns: block.columns ?? null,
				rows: block.rows ?? null,
				items: block.items ?? null,
				keyItems: block.keyItems ?? null,
				compact: block.compact ?? null,
				wide: block.wide ?? null
			};
			return Object.fromEntries(
				Object.entries(output).filter(([, value]) => value !== null && value !== undefined)
			);
		})
		.filter(Boolean);
}

function normalizeStructuredTableSelectionResponse(response, stemBlocks) {
	if (!response || response.kind !== 'asset-canvas') return response;
	const labels = [
		response.assetLabel,
		response.sourceLabel,
		response.assetId,
		...(Array.isArray(response.assets) ? response.assets : [])
	]
		.filter((value) => typeof value === 'string' && value.trim())
		.map((value) => value.trim());
	const tableBlock = stemBlocks.find(
		(block) =>
			['table', 'structured-table'].includes(String(block?.kind ?? '')) &&
			labels.some((label) => assetMatchesLabel(block, label))
	);
	if (!tableBlock) return response;
	const tableRows = structuredTableSelectionRows(tableBlock);
	if (!tableRows.length) return response;
	const answerText = responseCorrectAnswerTexts(response)[0] ?? '';
	const answerRow = tableRows.find((row) => tableSelectionRowMatchesAnswer(row, answerText));
	if (!answerRow) return response;
	return {
		kind: 'choice-table',
		columns: ['Source row', 'Source column', 'Value'],
		rows: tableRows,
		correctAnswers: [
			{
				targetId: 'answer',
				correctAnswer: answerRow.join(' | ')
			}
		]
	};
}

function normalizeEquationBlankOrderingResponse(response, markSchemeItems) {
	if (!response || response.kind !== 'equation-blanks') return response;
	if (Array.isArray(response.unorderedGroups) && response.unorderedGroups.length) return response;
	const source = (markSchemeItems ?? []).map((item) => item.text).join('\n');
	if (!/\b(?:either|any)\s+order\b/i.test(source)) return response;
	const alternatives = (response.correctAnswers ?? [])
		.map((answer) => ({
			targetId: answer.targetId,
			answers: splitAlternativeAnswer(answer.correctAnswer)
		}))
		.filter((item) => item.targetId && item.answers.length > 1);
	for (let leftIndex = 0; leftIndex < alternatives.length; leftIndex += 1) {
		for (let rightIndex = leftIndex + 1; rightIndex < alternatives.length; rightIndex += 1) {
			const left = alternatives[leftIndex];
			const right = alternatives[rightIndex];
			if (!sameTextSet(left.answers, right.answers)) continue;
			const answerByTargetId = new Map(
				[left.targetId, right.targetId].map((targetId, index) => [
					targetId,
					left.answers[index] ?? left.answers[0]
				])
			);
			return {
				...response,
				correctAnswers: (response.correctAnswers ?? []).map((answer) =>
					answerByTargetId.has(answer.targetId)
						? {
								...answer,
								correctAnswer: answerByTargetId.get(answer.targetId)
							}
						: answer
				),
				unorderedGroups: [
					{
						targetIds: [left.targetId, right.targetId],
						answers: left.answers
					}
				]
			};
		}
	}
	return response;
}

function splitAlternativeAnswer(value) {
	return String(value ?? '')
		.split(/\s+(?:or|\/)\s+|\s*\|\s*/i)
		.map((part) => part.trim())
		.filter(Boolean);
}

function sameTextSet(left, right) {
	const leftSet = new Set((left ?? []).map(normalizedForExactMatch).filter(Boolean));
	const rightSet = new Set((right ?? []).map(normalizedForExactMatch).filter(Boolean));
	if (leftSet.size !== rightSet.size) return false;
	for (const value of leftSet) {
		if (!rightSet.has(value)) return false;
	}
	return true;
}

function normalizeCalculationWorkingResponse(response, question) {
	if (!response || response.kind !== 'equation-blanks') return response;
	if (Number(question.marks ?? 0) < 2) return response;
	const markText = (question.markSchemeItems ?? [])
		.map((item) => `${item.itemType}\n${item.text}`)
		.join('\n');
	if (!/\b(?:method|calculation|divid|add|sum|substitut|working)\b/i.test(markText))
		return response;
	const finalLine = responseToFinalAnswerLabel(response);
	return {
		kind: 'labeled-lines',
		count: 4,
		labels: ['Working', 'Working', 'Working', finalLine].filter(Boolean)
	};
}

function responseToFinalAnswerLabel(response) {
	const text = (response.segments ?? [])
		.map((segment) => {
			if (segment.kind === 'blank') return '_____';
			return segment.text ?? '';
		})
		.join('')
		.trim();
	return text || 'Final answer';
}

function normalizeQuestionResponseForExtraction(question) {
	let response = question.response;
	response = normalizeStructuredTableSelectionResponse(response, question.stemBlocks ?? []);
	response = normalizeEquationBlankOrderingResponse(response, question.markSchemeItems ?? []);
	response = normalizeCalculationWorkingResponse(response, question);
	return response;
}

function structuredTableSelectionRows(block) {
	const columns = Array.isArray(block?.columns) ? block.columns : [];
	const rows = Array.isArray(block?.rows) ? block.rows : [];
	if (columns.length < 2 || rows.length === 0) return [];
	const rowHeader = columns[0] || 'Row';
	return rows.flatMap((row) => {
		if (!Array.isArray(row) || row.length < 2) return [];
		const rowLabel = String(row[0] ?? '').trim();
		return row.slice(1).flatMap((cell, index) => {
			const value = String(cell ?? '').trim();
			const column = String(columns[index + 1] ?? `Column ${index + 2}`).trim();
			if (!rowLabel || !value || !column) return [];
			return [[`${rowHeader}: ${rowLabel}`, column, value]];
		});
	});
}

function tableSelectionRowMatchesAnswer(row, answerText) {
	const normalizedAnswer = normalizedForExactMatch(answerText);
	const value = normalizedForExactMatch(row[2]);
	if (value && normalizedAnswer.includes(value)) return true;
	const rowValue = normalizedForExactMatch(
		String(row[0] ?? '')
			.split(':')
			.pop()
	);
	const column = normalizedForExactMatch(row[1]);
	return Boolean(
		rowValue && column && normalizedAnswer.includes(rowValue) && normalizedAnswer.includes(column)
	);
}

function placeholderAnswerChain(question) {
	return {
		id: null,
		title: 'Reusable chain pending repair',
		canonicalChainText:
			'Create a reusable reasoning or method pattern from the positive mark-scheme evidence.',
		summary: 'Temporary chain placeholder for text-only repair.',
		broadTopic: question.topicPath?.[0] ?? null,
		chainFamilyId: null,
		steps: [
			{
				stepText: 'Create a reusable answer-chain step from positive mark-scheme evidence.',
				stepRole: 'method',
				explanation: null,
				commonOmission: null,
				markSchemeItemIndexes: []
			}
		],
		confidence: 0.1,
		needsHumanReview: true,
		reviewNotes: ['Placeholder generated by factual vision extraction; run text-only chain repair.']
	};
}

function compactQuestionToFull(question, index, chunk) {
	const promptText =
		question.promptText || question.selfContainedPromptText || question.sourceQuestionRef;
	const pageStart = compactNumber(question.pageStart, chunk?.corePages?.[0] ?? 1);
	const pageEnd = compactNumber(question.pageEnd, pageStart);
	const markSchemeItems = (question.markSchemeItems ?? []).map((item) => ({
		itemType: item.itemType || 'mark',
		text: item.text,
		marks: compactNumber(item.marks, null),
		sourceRef: item.sourceRef || question.sourceQuestionRef,
		confidence: compactConfidence(item.confidence)
	}));
	const stemBlocks = [
		...paragraphBlock(question.contextText),
		...compactRenderBlocks(question.contextBlocks)
	];
	const response = normalizeQuestionResponseForExtraction({
		...question,
		marks: compactNumber(question.marks, null),
		stemBlocks,
		response: compactResponse(question.response, compactNumber(question.marks, null)),
		markSchemeItems
	});
	return {
		id: question.id ?? null,
		sourceQuestionRef: question.sourceQuestionRef,
		parentSourceQuestionRef: question.parentSourceQuestionRef ?? null,
		displayOrder: index + 1,
		promptText,
		selfContainedPromptText: question.selfContainedPromptText || promptText,
		contextText: question.contextText ?? null,
		commandWord: question.commandWord ?? null,
		marks: compactNumber(question.marks, null),
		pageStart,
		pageEnd,
		topicPath: question.topicPath ?? [],
		specRef: question.specRef ?? null,
		stemBlocks,
		leadBlocks: [],
		promptBlocks: paragraphBlock(promptText),
		response,
		afterResponseBlocks: [],
		assets: [],
		markSchemeItems,
		markChecklist: (question.markChecklist ?? []).map((item) => ({
			text: compactChecklistText(item),
			required: item.required !== false,
			markSchemeItemIndexes: item.markSchemeItemIndexes ?? [],
			confidence: compactConfidence(item.confidence),
			needsHumanReview: item.needsHumanReview === true
		})),
		modelAnswer: compactModelAnswer(question.modelAnswer),
		answerChain: placeholderAnswerChain(question),
		chainResolution: {
			action: 'needs_review',
			existingChainId: null,
			compatibilityRationale:
				'Vision extraction intentionally defers answer-chain creation to text-only repair.',
			identityStable: false
		},
		commonWeakAnswers: [],
		extractionConfidence: compactConfidence(question.extractionConfidence),
		needsHumanReview: question.needsHumanReview === true,
		reviewNotes: compactReviewNotes(question.reviewNotes)
	};
}

export function expandCompactFullPaperExtraction({
	value,
	sourceDocumentId,
	markSchemeDocumentId,
	questionPaper,
	markScheme,
	chunk
}) {
	const parsedValue = LlmCompactFullPaperExtractionSchema.parse(value);
	return LlmFullPaperExtractionSchema.parse({
		extractionRun: {
			agentVersion: 'llm-extraction-pipeline-v2-compact',
			needsHumanReview: (parsedValue.questions ?? []).some((question) => question.needsHumanReview),
			reviewNotes: []
		},
		sourceDocument: {
			id: sourceDocumentId,
			title: questionPaper.title,
			pageCount: questionPaper.pageCount
		},
		markSchemeDocument: {
			id: markSchemeDocumentId,
			title: markScheme.title,
			pageCount: markScheme.pageCount
		},
		questions: (parsedValue.questions ?? []).map((question, index) =>
			compactQuestionToFull(question, index, chunk)
		)
	});
}

function extractionSpecPrompt(extractionSpec) {
	void extractionSpec;
	return [
		'Vision-stage extraction contract: extract factual source evidence only. Do not generate answerChain fields in this stage.',
		'Recover learner-visible prompt/context, response controls, required images/tables/graphs, positive mark-scheme evidence, checklist items, answer keys or model answers, provenance, confidence, and review flags.',
		'Do not return specification references, assessment objectives, or topic taxonomy; the script sets topicPath to [] and specRef to null in this phase.',
		'Keep exact values, table entries, answer keys, and worked values in response.correctAnswers, markSchemeItems, markChecklist, or modelAnswer.'
	].join('\n');
}

export function buildFullPaperPrompt({
	sourceDocumentId,
	markSchemeDocumentId,
	questionPaper,
	markScheme,
	supportingDocuments = [],
	chunk,
	targetQuestionRef = null,
	extractionSpec,
	extraInstructions = '',
	expectedQuestionCount = null,
	assetManifestText = ''
}) {
	return [
		'Extract this GCSE exam paper into the compact Question Constellation extraction JSON schema.',
		'Return source-grounded atomic question data: prompt, response shape, mark scheme items, checklist, written-response model answers or fixed-response answer keys, and review flags. Do not generate answerChain fields in this vision stage; the script creates placeholders and runs text-only chain repair from your evidence.',
		'Use the exact camelCase field names from the schema. Do not return snake_case aliases.',
		`Use sourceDocument.id: ${sourceDocumentId}`,
		`Use markSchemeDocument.id: ${markSchemeDocumentId}`,
		expectedQuestionCount ? `Return exactly ${expectedQuestionCount} atomic question(s).` : '',
		chunk
			? [
					`This is chunk ${chunk.index + 1} of ${chunk.total}. Extract only atomic marked questions whose own question/subquestion number and prompt begin on core question-paper pages ${chunk.corePages.join(', ')}.`,
					chunk.priorContextPages?.length
						? `Prior context pages ${chunk.priorContextPages.join(', ')} are context only. Use them to recover parent stems, previous subpart values, tables, figures, and diagrams required to make core-page questions learner-visible and self-contained. Do not extract questions whose own number/prompt begins on a prior context page.`
						: 'No prior context pages are supplied for this chunk.',
					chunk.lookaheadPages.length
						? `Lookahead pages ${chunk.lookaheadPages.join(', ')} are context only. Use them only to finish the same atomic subquestion that began on a core page. Do not extract sibling subquestions, later subquestion numbers, or a whole parent question merely because the parent stem began on a core page.`
						: 'No lookahead pages are supplied for this chunk.',
					'If an atomic subquestion number/prompt first appears on a lookahead page, omit it from this chunk; it belongs to the next chunk.'
				].join(' ')
			: null,
		targetQuestionRef
			? `Target question: extract exactly sourceQuestionRef ${targetQuestionRef}. Do not extract any other subquestion from these pages.`
			: null,
		'Use the question paper page images and mark scheme text as source of truth. If mark scheme page images are supplied, use them to resolve tables or layout that text extraction may have flattened. Use supporting documents only to clarify examiner guidance, accepted alternatives, common mistakes, and review flags; never let them override the official question paper or mark scheme.',
		'Extract every independently marked subquestion. Do not create rows for unmarked parent stems. Carry parent context into contextText/selfContainedPromptText where needed.',
		'Do not extract withdrawn questions, replacement notices, statistics-only rows, or mean-mark/max-mark lines as learner-facing questions. If the official materials do not include the original prompt and positive marking criteria, omit that subquestion rather than inventing a placeholder prompt, response, or answer chain.',
		'Return compact source-grounded question data. No extra JSON keys. Checklist items should be one short sentence each. Mark-scheme items should be concise positive marking evidence, not long explanations. The script deterministically adds source-document metadata and render defaults. Preserve visible prompt text in promptText/contextText and use contextBlocks plus response objects for tables, MCQ/tick boxes/matching/equation blanks/image labels/drawing boxes/written lines.',
		'Do not put answers from previous subquestions into learner-visible promptText or promptBlocks. If a later subquestion is ambiguous outside the original sequence, put resolved context only in selfContainedPromptText/contextText for standalone grading and keep promptBlocks faithful to the printed prompt.',
		'Use only these response.kind values: none, lines, labeled-lines, number-line, choice, choice-table, matching, equation-blanks, asset-canvas, image-label-zones, drawing-box. For tick-one or multiple-choice boxes, use kind "choice" with options and response.correctAnswers.',
		'For equation-blanks, always include response.segments with text/math/blank segments in visible order, and make each correctAnswers targetId match a blank segment id.',
		'When two or more equation blanks accept a set of answers in any order, add response.unorderedGroups with targetIds and answers so the grader does not accept duplicate entries as correct.',
		'For calculation questions with visible working lines and a final answer blank, use response.kind "labeled-lines" with labels for the working space and final answer line. Keep the exact calculation and final value in modelAnswer and markChecklist.',
		'For source tables needed by a core question, include a contextBlocks item with kind "structured-table", label such as "Table 1", columns, and rows. Include the full table when the learner must inspect, calculate from, compare, or mark a value in it.',
		'For table selection or ring-the-value responses, keep the source table in contextBlocks and use response.kind "choice-table" with selectable rows for the relevant source-table cells. Set response.correctAnswers targetId "answer" to the exact selected row string joined with " | ". Do not use asset-canvas for a table that can be represented structurally.',
		'For graph drawing, label-on-image, diagram marking, or any response where the answer surface is a source visual that cannot be represented as a structured table, use asset-canvas or image-label-zones with compact correctAnswers and a usable asset from the local asset manifest. If no usable asset exists, mark the question needsHumanReview and include a blocking review note.',
		'Preserve exact answer strings, worked values, table entries, and one-question facts in response.correctAnswers, markChecklist, and modelAnswer. Text-only chain repair depends on this evidence to create reusable answer chains later.',
		'For markSchemeItems, include the positive credit/marking rows only. Do not create separate markSchemeItems for ignore, reject, do-not-accept, guidance, or allowance text unless the row is itself a positive alternative answer route. Fold essential allowances into the checklist text if needed.',
		'Keep contextText minimal. Do not copy a whole table into contextText; use a structured-table contextBlocks item instead. Include only values needed to answer a text-only subquestion; for table/graph response surfaces, use an asset-style response and concise correctAnswers.',
		'Do not return assessment objectives, specification references, or topic taxonomy. The script sets topicPath [] and specRef null for PDF extraction.',
		'',
		'Question paper:',
		sourceDocumentPrompt(questionPaper),
		'Mark scheme:',
		sourceDocumentPrompt(markScheme),
		supportingDocuments.length
			? ['Supporting documents:', ...supportingDocuments.map(sourceDocumentPrompt)].join('\n')
			: 'Supporting documents: none',
		assetManifestText ? ['Local asset manifest:', assetManifestText].join('\n') : null,
		extraInstructions,
		'',
		'Project extraction contract:',
		extractionSpecPrompt(extractionSpec)
	]
		.filter(Boolean)
		.join('\n');
}

export async function extractFullPaperChunk({
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	mediaResolution = 'auto',
	sourceDocumentId,
	markSchemeDocumentId,
	questionPaper,
	markScheme,
	supportingDocuments = [],
	chunk,
	markSchemeImages,
	markSchemeText = '',
	supportingImages = [],
	extractionSpec,
	extraInstructions = '',
	expectedQuestionCount = null,
	assetManifestText = '',
	targetQuestionRef = null
}) {
	const prompt = buildFullPaperPrompt({
		sourceDocumentId,
		markSchemeDocumentId,
		questionPaper,
		markScheme,
		supportingDocuments,
		chunk,
		targetQuestionRef,
		extractionSpec,
		extraInstructions,
		expectedQuestionCount,
		assetManifestText
	});
	const content = [
		{ type: 'text', text: prompt },
		{ type: 'text', text: 'QUESTION PAPER PAGE IMAGES FOLLOW, IN ORDER.' },
		...questionPaperImageParts(chunk),
		{
			type: 'text',
			text: `MARK SCHEME TEXT FOLLOWS, EXTRACTED FROM THE OFFICIAL MARK SCHEME PDF.\n\n${markSchemeText || 'No mark scheme text was extracted; use any supplied mark scheme page images.'}`
		}
	];
	if (markSchemeImages.length) {
		content.push(
			{ type: 'text', text: 'MARK SCHEME PAGE IMAGES FOLLOW, IN ORDER.' },
			...markSchemeImages.map(imagePart)
		);
	}
	if (supportingImages.length) {
		content.push(
			{ type: 'text', text: 'SUPPORTING DOCUMENT PAGE IMAGES FOLLOW, GROUPED BY FILENAME.' },
			...supportingImages
		);
	}
	const { value } = await generateJsonWithTimeout(
		{
			model,
			thinkingLevel,
			mediaResolution,
			telemetry: false,
			input: [
				{
					role: 'system',
					content:
						'You are a careful GCSE exam extraction engine. Return compact, source-grounded JSON for grading, import, and answer-chain practice.'
				},
				{ role: 'user', content }
			],
			schema: LlmCompactFullPaperExtractionSchema
		},
		`extract-full-paper:${sourceDocumentId}:${targetQuestionRef ?? 'all'}`
	);
	return expandCompactFullPaperExtraction({
		value,
		sourceDocumentId,
		markSchemeDocumentId,
		questionPaper,
		markScheme,
		chunk
	});
}

export function mergeFullPaperChunks(values) {
	if (values.length === 0) throw new Error('No extraction chunks to merge.');
	const questionsByRef = new Map();
	for (const value of values) {
		for (const question of value.questions ?? []) {
			if (!question.sourceQuestionRef) continue;
			const normalizedQuestion = normalizeExtractedQuestionResponse(question);
			const existing = questionsByRef.get(question.sourceQuestionRef);
			if (
				!existing ||
				(normalizedQuestion.extractionConfidence ?? 0) > (existing.extractionConfidence ?? 0)
			) {
				questionsByRef.set(question.sourceQuestionRef, normalizedQuestion);
			}
		}
	}
	const questions = Array.from(questionsByRef.values())
		.sort((a, b) => compareQuestionRefs(a.sourceQuestionRef, b.sourceQuestionRef))
		.map((question, index) => ({ ...question, displayOrder: index + 1 }));
	const runReviewNotes = mergeRunReviewNotes(values);
	return {
		...values[0],
		questions,
		extractionRun: {
			...values[0].extractionRun,
			needsHumanReview: questions.some(questionHasHumanReviewFlag) || runReviewNotes.length > 0,
			reviewNotes: runReviewNotes,
			chunkCount: values.length
		}
	};
}

function mergeRunReviewNotes(values) {
	return [
		...new Set(
			values
				.flatMap((value) => value.extractionRun?.reviewNotes ?? [])
				.map((note) => String(note ?? '').trim())
				.filter(Boolean)
				.filter((note) => !chunkWindowReviewNote(note))
		)
	];
}

function chunkWindowReviewNote(note) {
	return (
		/\bchunk\b/i.test(note) &&
		/\b(?:core|lookahead|page|pages|extracted|extraction|atomic|subquestion)\b/i.test(note)
	);
}

function normalizeExtractedQuestionResponse(question) {
	const response = normalizeQuestionResponseForExtraction(question);
	return response === question.response ? question : { ...question, response };
}

function questionHasHumanReviewFlag(question) {
	if (question.needsHumanReview) return true;
	if (question.modelAnswer?.needsHumanReview) return true;
	if ((question.assets ?? []).some((asset) => asset?.needsHumanReview)) return true;
	if ((question.markChecklist ?? []).some((item) => item?.needsHumanReview)) return true;
	return false;
}

export function validateReusableAnswerChains(candidate) {
	const blocking = blockingIssues(deterministicCandidateIssues(candidate));
	if (blocking.length > 0) {
		throw new Error(
			`Extracted answer chains failed reusable-chain quality checks (${blocking.length}). ` +
				chainSpecificityIssueSummary(blocking, 8)
		);
	}
}

function relativePath(rootDir, filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function cacheSafeName(value) {
	return String(value ?? 'all')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function sha256WithPrefix(filePath) {
	return `sha256:${fileHash(filePath)}`;
}

function sourceDocumentMetadata(doc) {
	return {
		board: doc.board ?? null,
		qualification: doc.qualification ?? null,
		subject: doc.subject ?? null,
		subjectArea: doc.subjectArea ?? null,
		tier: doc.tier ?? null,
		paper: doc.paper ?? null,
		componentCode: doc.componentCode ?? null,
		series: doc.series ?? null,
		year: doc.year ?? null,
		sourceUrl: doc.sourceUrl ?? null
	};
}

export function enrichFullPaperExtraction({
	value,
	rootDir = process.cwd(),
	model,
	dpi,
	pageSelection = null,
	questionPaper,
	markScheme,
	supportingDocuments = [],
	assetManifest = []
}) {
	const enriched = {
		...value,
		sourceDocumentId: questionPaper.id,
		extractionRun: {
			...value.extractionRun,
			source: 'llm-scripted-pdf-page-images',
			model,
			dpi,
			pageSelection,
			extractedAt: new Date().toISOString()
		},
		sourceDocument: {
			...value.sourceDocument,
			id: questionPaper.id,
			docType: 'question_paper',
			title: questionPaper.title,
			pageCount: questionPaper.pageCount,
			...sourceDocumentMetadata(questionPaper),
			filePath: relativePath(rootDir, questionPaper.path),
			fileHash: sha256WithPrefix(questionPaper.path),
			metadata: { originalFilename: path.basename(questionPaper.path), notes: [] }
		},
		markSchemeDocument: {
			...value.markSchemeDocument,
			id: markScheme.id,
			docType: 'mark_scheme',
			title: markScheme.title,
			pageCount: markScheme.pageCount,
			...sourceDocumentMetadata(markScheme),
			filePath: relativePath(rootDir, markScheme.path),
			fileHash: sha256WithPrefix(markScheme.path),
			metadata: { originalFilename: path.basename(markScheme.path), notes: [] }
		},
		supportingDocuments: supportingDocuments.map((doc) => ({
			id: doc.id,
			docType: doc.docType,
			title: doc.title,
			pageCount: doc.pageCount,
			...sourceDocumentMetadata(doc),
			filePath: relativePath(rootDir, doc.path),
			fileHash: sha256WithPrefix(doc.path),
			metadata: { originalFilename: path.basename(doc.path), notes: [] }
		})),
		localAssetManifest: filterReferencedAssetManifest(assetManifest, value.questions)
	};
	return FullPaperExtractionSchema.parse(sanitizeAnswerChainEvidenceIndexes(enriched));
}

function filterReferencedAssetManifest(assetManifest, questions) {
	const labels = new Set();
	for (const question of questions ?? []) {
		for (const label of collectResponseAssetLabels(question.response)) labels.add(label);
		for (const asset of question.assets ?? []) {
			const label = renderBlockAssetLabel(asset);
			if (label) labels.add(label);
		}
		for (const { block } of questionRenderBlocks(question)) {
			if (!isMediaRenderBlock(block)) continue;
			const label = renderBlockAssetLabel(block);
			if (label) labels.add(label);
		}
	}
	const wanted = [...labels].filter(Boolean);
	if (!wanted.length) return [];
	return (assetManifest ?? []).filter((asset) =>
		wanted.some((label) => assetMatchesLabel(asset, label))
	);
}

export async function extractFullPaperFromPdfSet({
	rootDir = process.cwd(),
	questionPaperPath,
	markSchemePath,
	supportingDocumentPaths = [],
	sourceDocumentId,
	markSchemeDocumentId = `${sourceDocumentId}-mark-scheme`,
	outputRoot = path.join(rootDir, 'tmp/llm-extraction-pipeline'),
	dpi = 160,
	forceRender = false,
	forceChunkCache = false,
	questionPages = [],
	markSchemePages = [],
	chunkPages = 6,
	contextPages = 2,
	chunkConcurrency = 1,
	extractionGranularity = 'chunk',
	markSchemeImageMode = 'none',
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	mediaResolution = 'auto',
	extractionSpec,
	extraInstructions = '',
	expectedQuestionCount = null,
	assetManifest = [],
	assetManifestText = '',
	documentMetadata = {}
}) {
	const sharedDocumentMetadata = {
		board: documentMetadata.board ?? null,
		qualification: documentMetadata.qualification ?? null,
		subject: documentMetadata.subject ?? null,
		subjectArea: documentMetadata.subjectArea ?? null,
		tier: documentMetadata.tier ?? null,
		paper: documentMetadata.paper ?? null,
		componentCode: documentMetadata.componentCode ?? null,
		series: documentMetadata.series ?? null,
		year: documentMetadata.year ?? null
	};
	const questionPaper = {
		...sharedDocumentMetadata,
		...(documentMetadata.questionPaper ?? {}),
		id: sourceDocumentId,
		docType: 'question_paper',
		path: questionPaperPath,
		title: documentMetadata.questionPaperTitle ?? path.basename(questionPaperPath),
		fileName: path.basename(questionPaperPath),
		pageCount: pdfPageCount(questionPaperPath)
	};
	const markScheme = {
		...sharedDocumentMetadata,
		...(documentMetadata.markScheme ?? {}),
		id: markSchemeDocumentId,
		docType: 'mark_scheme',
		path: markSchemePath,
		title: documentMetadata.markSchemeTitle ?? path.basename(markSchemePath),
		fileName: path.basename(markSchemePath),
		pageCount: pdfPageCount(markSchemePath)
	};
	const supportingDocuments = supportingDocumentPaths.map((filePath, index) => ({
		...sharedDocumentMetadata,
		...(documentMetadata.supportingDocuments?.[index] ?? {}),
		id: `${sourceDocumentId}-support-${index + 1}`,
		docType: documentMetadata.supportingDocuments?.[index]?.docType ?? 'supporting_document',
		path: filePath,
		title: path.basename(filePath),
		fileName: path.basename(filePath),
		pageCount: pdfPageCount(filePath)
	}));
	const questionImages = selectPages(
		renderPdfPages({
			pdfPath: questionPaperPath,
			outputDir: path.join(outputRoot, sourceDocumentId, 'question-paper'),
			prefix: 'question-paper',
			dpi,
			force: forceRender
		}),
		questionPages
	);
	const markSchemeText = pdfText(markSchemePath, 140000, markSchemePages);
	const includeMarkSchemeImages = markSchemeImageMode === 'all' || !markSchemeText.trim();
	const markSchemeImages = includeMarkSchemeImages
		? selectPages(
				renderPdfPages({
					pdfPath: markSchemePath,
					outputDir: path.join(outputRoot, sourceDocumentId, 'mark-scheme'),
					prefix: 'mark-scheme',
					dpi,
					force: forceRender
				}),
				markSchemePages
			)
		: [];
	const supportingImages = [];
	for (const doc of supportingDocuments) {
		const images = renderPdfPages({
			pdfPath: doc.path,
			outputDir: path.join(outputRoot, sourceDocumentId, doc.id),
			prefix: doc.id,
			dpi,
			force: forceRender
		});
		supportingImages.push({ type: 'text', text: `SUPPORTING DOCUMENT ${doc.fileName}` });
		supportingImages.push(...images.map(imagePart));
	}
	if (!questionImages.length) throw new Error('No question-paper images selected.');
	if (!markSchemeImages.length && !markSchemeText.trim()) {
		throw new Error('No mark-scheme images or text selected.');
	}
	if (!['chunk', 'question'].includes(extractionGranularity)) {
		throw new Error('extractionGranularity must be chunk or question.');
	}
	const chunks = chunkImages(questionImages, chunkPages, contextPages);
	const chunkCacheDir = path.join(outputRoot, sourceDocumentId, 'chunks');
	console.error(
		`[extract] ${sourceDocumentId}: question_pages=${questionImages.length} mark_scheme_pages=${markScheme.pageCount} mark_scheme_text_chars=${markSchemeText.length} mark_scheme_images=${markSchemeImages.length} chunks=${chunks.length}`
	);
	if (forceChunkCache && existsSync(chunkCacheDir)) {
		rmSync(chunkCacheDir, { recursive: true, force: true });
	}
	const values = await mapWithConcurrency(chunks, chunkConcurrency, async (chunk) => {
		const contextKey = chunk.priorContextPages.length
			? `ctx-${chunk.priorContextPages.join('-')}`
			: 'ctx-none';
		const pageKey = chunk.corePages.length
			? `${contextKey}-core-${chunk.corePages.join('-')}`
			: `${contextKey}-index-${chunk.index + 1}`;
		const chunkCachePath = path.join(
			chunkCacheDir,
			`chunk-${String(chunk.index + 1).padStart(3, '0')}-pages-${pageKey}.json`
		);
		if (!forceChunkCache && existsSync(chunkCachePath)) {
			console.error(
				`[extract] ${sourceDocumentId}: chunk ${chunk.index + 1}/${chunk.total} using cache ${relativePath(rootDir, chunkCachePath)}`
			);
			return LlmFullPaperExtractionSchema.parse(readJson(chunkCachePath));
		}
		const coreQuestionText = pdfText(questionPaper.path, 20000, chunk.corePages);
		const coreQuestionRefs = questionRefsFromText(coreQuestionText);
		const chunkMarkSchemeText = markSchemeTextExcerptForRefs(markSchemeText, coreQuestionRefs);
		console.error(
			`[extract] ${sourceDocumentId}: chunk ${chunk.index + 1}/${chunk.total} question_pages=${chunk.images.map(pageNumberFromRenderedPath).join(',')} core_refs=${coreQuestionRefs.join(',') || 'none'} mark_scheme_text_chars=${chunkMarkSchemeText.length}`
		);
		const targetQuestionRefs =
			extractionGranularity === 'question' && coreQuestionRefs.length ? coreQuestionRefs : [null];
		const chunkValues = [];
		for (const targetQuestionRef of targetQuestionRefs) {
			const targetCachePath = path.join(
				chunkCacheDir,
				`chunk-${String(chunk.index + 1).padStart(3, '0')}-pages-${pageKey}-target-${cacheSafeName(targetQuestionRef)}.json`
			);
			if (!forceChunkCache && existsSync(targetCachePath)) {
				console.error(
					`[extract] ${sourceDocumentId}: chunk ${chunk.index + 1}/${chunk.total} target_ref=${targetQuestionRef ?? 'all'} using cache ${relativePath(rootDir, targetCachePath)}`
				);
				chunkValues.push(LlmFullPaperExtractionSchema.parse(readJson(targetCachePath)));
				continue;
			}
			const targetMarkSchemeText = targetQuestionRef
				? markSchemeTextExcerptForRefs(markSchemeText, [targetQuestionRef])
				: chunkMarkSchemeText;
			console.error(
				`[extract] ${sourceDocumentId}: chunk ${chunk.index + 1}/${chunk.total} target_ref=${targetQuestionRef ?? 'all'} mark_scheme_text_chars=${targetMarkSchemeText.length}`
			);
			const targetValue = await extractFullPaperChunk({
				model,
				thinkingLevel,
				mediaResolution,
				sourceDocumentId,
				markSchemeDocumentId,
				questionPaper: { ...questionPaper, pages: chunk.images.map(pageNumberFromRenderedPath) },
				markScheme: {
					...markScheme,
					pages: markSchemeImages.length
						? markSchemeImages.map(pageNumberFromRenderedPath)
						: Array.from({ length: markScheme.pageCount }, (_, index) => index + 1)
				},
				supportingDocuments,
				chunk,
				markSchemeImages,
				markSchemeText: targetMarkSchemeText,
				supportingImages,
				extractionSpec,
				extraInstructions,
				expectedQuestionCount: targetQuestionRef
					? 1
					: chunks.length === 1
						? expectedQuestionCount
						: null,
				assetManifestText,
				targetQuestionRef
			});
			writeJson(targetCachePath, targetValue);
			chunkValues.push(targetValue);
		}
		const value = mergeFullPaperChunks(chunkValues);
		writeJson(chunkCachePath, value);
		return value;
	});
	return enrichFullPaperExtraction({
		value: mergeFullPaperChunks(values),
		rootDir,
		model,
		dpi,
		pageSelection: {
			questionPages: questionImages.map(pageNumberFromRenderedPath),
			markSchemePages: markSchemePages.length
				? markSchemePages
				: Array.from({ length: markScheme.pageCount }, (_, index) => index + 1),
			chunkPages,
			contextPages,
			chunkConcurrency,
			extractionGranularity
		},
		questionPaper,
		markScheme,
		supportingDocuments,
		assetManifest
	});
}

export function deterministicCandidateIssues(candidate, options = {}) {
	const includeAnswerChainIssues = options.includeAnswerChainIssues !== false;
	const findings = [];
	for (const question of candidate.questions ?? []) {
		const issues = [
			...(includeAnswerChainIssues
				? [
						...answerChainIdentityIssues(question),
						...answerChainSpecificityIssues(question.answerChain, {
							commandWord: question.commandWord
						}),
						...answerChainEvidenceIssues(question),
						...fixedResponseChainSpecificityIssues(question)
					]
				: []),
			...fixedResponseModelAnswerIssues(question),
			...writtenResponseModelAnswerIssues(question),
			...responseKeyIssues(question),
			...responseControlCompletenessIssues(question),
			...responseAssetCompletenessIssues(question),
			...renderBlockAssetCompletenessIssues(question),
			...referencedMediaAssetConsistencyIssues(question),
			...sourceDocumentMediaAssetConsistencyIssues(question, candidate.sourceDocument),
			...referencedMediaCompletenessIssues(question),
			...copyrightPlaceholderMediaIssues(question),
			...withdrawnOrStatisticsOnlyQuestionIssues(question),
			...questionGradingEvidenceIssues(question, {
				includeAnswerChainEvidence: includeAnswerChainIssues
			})
		];
		if (!issues.length) continue;
		findings.push({
			sourceQuestionRef: question.sourceQuestionRef,
			chainId: question.answerChain?.id ?? null,
			issues
		});
	}
	return findings;
}

function answerChainIdentityIssues(question) {
	if (question.marks === null || question.marks === undefined || Number(question.marks) <= 0) {
		return [];
	}
	if (String(question.answerChain?.id ?? '').trim()) return [];
	return [
		{
			severity: 'error',
			code: 'answer_chain_missing_stable_id',
			field: 'answerChain.id',
			evidence: question.sourceQuestionRef,
			message:
				'Every published marked question needs a stable answerChain.id so extraction can reuse, update, and preserve chain identity across papers.'
		}
	];
}

function normalizedForExactMatch(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalizedSlugForExactMatch(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function chainIdentityFields(chain) {
	return [
		['answerChain.id', chain?.id],
		['answerChain.title', chain?.title],
		['answerChain.canonicalChainText', chain?.canonicalChainText],
		['answerChain.summary', chain?.summary]
	].filter(([, value]) => typeof value === 'string' && value.trim());
}

function reusableChainTextFields(chain) {
	return [
		...chainIdentityFields(chain),
		...(chain?.steps ?? []).flatMap((step, index) => [
			[`answerChain.steps[${index}].stepText`, step?.stepText],
			[`answerChain.steps[${index}].explanation`, step?.explanation],
			[`answerChain.steps[${index}].commonOmission`, step?.commonOmission]
		])
	].filter(([, value]) => typeof value === 'string' && value.trim());
}

function responseCorrectAnswerTexts(response) {
	const answers = response?.correctAnswers;
	if (!answers) return [];
	if (Array.isArray(answers)) {
		return answers
			.map((answer) => answer?.correctAnswer)
			.filter((answer) => typeof answer === 'string' && answer.trim());
	}
	if (typeof answers === 'object') {
		return Object.values(answers)
			.flatMap((answer) => (Array.isArray(answer) ? answer : [answer]))
			.filter((answer) => typeof answer === 'string' && answer.trim());
	}
	return [];
}

function exactFixedAnswerTexts(question) {
	const responseKind = question.response?.kind;
	if (!fixedResponseKinds().has(responseKind)) {
		return [];
	}
	const values = [
		...responseCorrectAnswerTexts(question.response),
		question.modelAnswer?.answerText
	].filter((value) => typeof value === 'string' && value.trim());
	return [...new Set(values.map((value) => value.trim()))].filter((value) => {
		const normalized = normalizedForExactMatch(value);
		return normalized.length >= 4 && normalized.split(' ').length <= 6;
	});
}

function fixedResponseChainSpecificityIssues(question) {
	const chain = question.answerChain;
	if (!chain) return [];
	const issues = [];
	for (const answer of exactFixedAnswerTexts(question)) {
		const normalizedAnswer = normalizedForExactMatch(answer);
		const answerSlug = normalizedSlugForExactMatch(answer);
		for (const [field, value] of reusableChainTextFields(chain)) {
			const normalizedField = normalizedForExactMatch(value);
			const fieldSlug = normalizedSlugForExactMatch(value);
			if (
				normalizedField.includes(normalizedAnswer) ||
				(answerSlug && fieldSlug.includes(answerSlug))
			) {
				issues.push({
					severity: 'error',
					code: 'chain_exact_fixed_answer_text',
					field,
					evidence: value,
					message:
						'Fixed-response answer-chain text includes the exact correct answer. Use a generic recall/discrimination chain and keep exact answers in grading fields.'
				});
			}
		}
	}
	return issues;
}

function fixedResponseModelAnswerIssues(question) {
	if (exactFixedAnswerTexts(question).length === 0 || !question.modelAnswer?.answerText) return [];
	if (fixedResponseModelAnswerDuplicatesAnswerKey(question)) return [];
	return [
		{
			severity: 'warning',
			code: 'fixed_response_model_answer_review',
			field: 'modelAnswer.answerText',
			evidence: question.modelAnswer.answerText,
			message:
				'Fixed-response questions should usually store correctAnswers/answer keys rather than a modelAnswer row.'
		}
	];
}

function fixedResponseModelAnswerDuplicatesAnswerKey(question) {
	const modelAnswer = normalizedForExactMatch(question.modelAnswer?.answerText);
	if (!modelAnswer) return false;
	const answers = responseCorrectAnswerTexts(question.response)
		.map(normalizedForExactMatch)
		.filter(Boolean);
	if (answers.length === 0) return false;
	if (answers.some((answer) => modelAnswer === answer)) return true;
	const joinedAnswers = normalizedForExactMatch(answers.join(' '));
	if (joinedAnswers && (modelAnswer === joinedAnswers || modelAnswer.includes(joinedAnswers))) {
		return true;
	}
	const longEnoughAnswers = answers.filter((answer) => answer.length >= 2);
	if (
		longEnoughAnswers.length > 0 &&
		modelAnswer.length <= 160 &&
		longEnoughAnswers.every(
			(answer) => modelAnswer.includes(answer) || answer.includes(modelAnswer)
		)
	) {
		return true;
	}
	const coreAnswers = responseCorrectAnswerTexts(question.response)
		.map(normalizedCoreFixedAnswerText)
		.filter((answer) => answer.length >= 2);
	return (
		coreAnswers.length > 0 &&
		modelAnswer.length <= 200 &&
		coreAnswers.every((answer) => modelAnswer.includes(answer) || answer.includes(modelAnswer))
	);
}

function normalizedCoreFixedAnswerText(value) {
	return normalizedForExactMatch(
		String(value ?? '')
			.replace(/\([^)]*\)/g, ' ')
			.replace(/\b(?:or|allow|accept|ignore|do not accept)\b.*$/i, ' ')
	);
}

function writtenResponseModelAnswerIssues(question) {
	const kind = question.response?.kind;
	if (
		question.marks === null ||
		question.marks === undefined ||
		!['lines', 'labeled-lines'].includes(kind) ||
		String(question.modelAnswer?.answerText ?? '').trim()
	) {
		return [];
	}
	return [
		{
			severity: 'error',
			code: 'written_response_missing_model_answer',
			field: 'modelAnswer.answerText',
			evidence: kind,
			message:
				'Written-response questions need a source-grounded modelAnswer. Fixed-response questions should keep exact answers in response.correctAnswers instead.'
		}
	];
}

function supportedResponseKinds() {
	return new Set([
		'none',
		'lines',
		'labeled-lines',
		'number-line',
		'choice',
		'choice-table',
		'matching',
		'equation-blanks',
		'asset-canvas',
		'image-label-zones',
		'drawing-box'
	]);
}

function fixedResponseKinds() {
	return new Set([
		'choice',
		'choice-table',
		'matching',
		'equation-blanks',
		'number-line',
		'image-label-zones'
	]);
}

function responseKeyIssues(question) {
	const kind = question.response?.kind;
	const issues = [];
	if (!supportedResponseKinds().has(kind)) {
		issues.push({
			severity: 'error',
			code: 'unsupported_response_kind',
			field: 'response.kind',
			evidence: kind ?? 'missing',
			message:
				'Response kind is not one of the app-supported interaction types. Use choice, matching, equation-blanks, number-line, image-label-zones, lines, labeled-lines, drawing-box, asset-canvas, or none.'
		});
	}
	if (
		fixedResponseKinds().has(kind) &&
		responseCorrectAnswerTexts(question.response).length === 0
	) {
		issues.push({
			severity: 'error',
			code: 'fixed_response_missing_answer_key',
			field: 'response.correctAnswers',
			evidence: kind,
			message:
				'Fixed-response questions need response.correctAnswers so the UI/import path can store a deterministic answer key.'
		});
	}
	return issues;
}

function responseControlCompletenessIssues(question) {
	const response = question.response;
	if (!response || response.kind !== 'equation-blanks') return [];
	const segments = Array.isArray(response.segments) ? response.segments : [];
	const hasBlankSegment = segments.some((segment) => segment?.kind === 'blank' && segment?.id);
	const hasStructuredSlots = ['blanks', 'fields', 'items', 'zones'].some(
		(key) => Array.isArray(response[key]) && response[key].length > 0
	);
	if (hasBlankSegment || hasStructuredSlots) return [];
	return [
		{
			severity: 'warning',
			code: 'response_control_missing_slots',
			field: 'response',
			evidence: question.sourceQuestionRef,
			message:
				'equation-blanks responses need visible blank segments or structured slot definitions. Treat as import-blocking with --fail-on-warnings until the learner can enter answers in the intended places.'
		}
	];
}

function responseAssetCompletenessIssues(question) {
	const kind = question.response?.kind;
	if (!['asset-canvas', 'image-label-zones'].includes(kind)) return [];
	const labels = [...collectResponseAssetLabels(question.response)];
	if (labels.length === 0) {
		return [
			{
				severity: 'error',
				code: 'response_asset_missing_label',
				field: 'response',
				evidence: kind,
				message: `${kind} response must identify the graph, diagram, or image asset it renders.`
			}
		];
	}
	const issues = [];
	for (const label of labels) {
		const matchingAssets = (question.assets ?? []).filter((candidate) =>
			assetMatchesLabel(candidate, label)
		);
		const asset =
			matchingAssets.find((candidate) => assetHasUsableReference(candidate)) ?? matchingAssets[0];
		if (!asset && questionHasStructuredTableSurface(question, label)) {
			continue;
		}
		if (!asset) {
			issues.push({
				severity: 'error',
				code: 'response_asset_missing_asset',
				field: 'assets',
				evidence: label,
				message: `${kind} response references ${label}, but no matching question asset was extracted.`
			});
			continue;
		}
		if (!assetHasUsableReference(asset)) {
			issues.push({
				severity: 'error',
				code: 'response_asset_label_only',
				field: 'assets',
				evidence: label,
				message: `${kind} response asset ${label} is label-only. It needs a filePath, publicPath, or r2Key so the learner can see the required media.`
			});
			continue;
		}
		const mismatch = mediaAssetPageLabelMismatch(asset, label);
		if (mismatch) issues.push(mismatch);
	}
	return issues;
}

function renderBlockAssetCompletenessIssues(question) {
	const issues = [];
	for (const { field, block } of questionRenderBlocks(question)) {
		if (!isMediaRenderBlock(block)) continue;
		if (assetHasUsableReference(block)) continue;
		const label = renderBlockAssetLabel(block) ?? inferMediaLabelFromQuestionText(question);
		if (!label) {
			issues.push({
				severity: 'error',
				code: 'media_block_missing_label',
				field,
				evidence: block?.kind ?? 'media',
				message:
					'Figure, image, and assetRef render blocks need an asset label or concrete file reference. Remove empty placeholder media blocks or attach the source asset.'
			});
			continue;
		}
		const matchingAssets = (question.assets ?? []).filter((candidate) =>
			assetMatchesLabel(candidate, label)
		);
		const asset =
			matchingAssets.find((candidate) => assetHasUsableReference(candidate)) ?? matchingAssets[0];
		if (!asset) {
			issues.push({
				severity: 'error',
				code: 'media_block_missing_asset',
				field,
				evidence: label,
				message: `Render block references ${label}, but no matching question asset was extracted.`
			});
			continue;
		}
		if (!assetHasUsableReference(asset)) {
			issues.push({
				severity: 'error',
				code: 'media_block_label_only',
				field,
				evidence: label,
				message: `Render block asset ${label} is label-only. It needs a filePath, publicPath, or r2Key so the learner can see the media.`
			});
			continue;
		}
		const mismatch = mediaAssetPageLabelMismatch(asset, label, field);
		if (mismatch) issues.push(mismatch);
	}
	return issues;
}

function referencedMediaCompletenessIssues(question) {
	const labels = referencedMediaLabelsFromQuestion(question);
	if (labels.length === 0) return [];
	const issues = [];
	for (const label of labels) {
		if (questionHasConcreteMediaAsset(question, label)) continue;
		if (!mediaReferenceNeedsVisualContext(question, label)) continue;
		issues.push({
			severity: 'warning',
			code: 'referenced_media_missing_asset',
			field: 'questions.assets',
			evidence: label,
			message:
				'Learner-facing question text references a figure, graph, diagram, or image without a concrete media asset. Treat as import-blocking with --fail-on-warnings unless a reviewer verifies the text is a complete substitute.'
		});
	}
	return issues;
}

function referencedMediaAssetConsistencyIssues(question) {
	const issues = [];
	for (const label of referencedMediaLabelsFromQuestion(question)) {
		for (const asset of question.assets ?? []) {
			if (!assetMatchesLabel(asset, label) || !assetHasUsableReference(asset)) continue;
			const mismatch = mediaAssetPageLabelMismatch(asset, label);
			if (mismatch) issues.push(mismatch);
		}
	}
	return issues;
}

function sourceDocumentMediaAssetConsistencyIssues(question, sourceDocument) {
	const issues = [];
	for (const [index, asset] of (question.assets ?? []).entries()) {
		const mismatch = mediaAssetSourcePageMismatch({
			sourceDocument,
			asset,
			field: `assets[${index}]`
		});
		if (mismatch) issues.push(mismatch);
	}
	return issues;
}

function mediaAssetSourcePageMismatch({ sourceDocument, asset, field }) {
	const label = renderBlockAssetLabel(asset);
	const expected = figureNumber(label);
	const pageNumber = Number(asset?.pageNumber);
	if (!expected || !Number.isInteger(pageNumber) || pageNumber < 1) return null;
	const sourcePath = sourceDocument?.filePath;
	if (!sourcePath || !sourcePathExists(sourcePath)) return null;
	const text = sourcePdfPageText(sourcePath, pageNumber);
	if (!text) return null;
	const expectedPattern = new RegExp(`\\b(?:figure|fig\\.?)\\s*${escapeRegExp(expected)}\\b`, 'i');
	if (expectedPattern.test(text)) return null;
	return {
		severity: 'error',
		code: 'media_asset_page_label_mismatch',
		field,
		evidence: `${label} page ${pageNumber}`,
		message:
			'Media asset pageNumber does not appear to contain the referenced figure label in the source PDF.'
	};
}

function sourcePathExists(sourcePath) {
	const resolved = path.isAbsolute(sourcePath)
		? sourcePath
		: path.resolve(process.cwd(), sourcePath);
	return existsSync(sourcePath) || existsSync(resolved);
}

function sourcePdfPageText(sourcePath, pageNumber) {
	const resolved = path.isAbsolute(sourcePath)
		? sourcePath
		: path.resolve(process.cwd(), sourcePath);
	const actualPath = existsSync(sourcePath) ? sourcePath : resolved;
	const key = `${actualPath}:${pageNumber}`;
	if (sourcePdfPageTextCache.has(key)) return sourcePdfPageTextCache.get(key);
	let text;
	try {
		text = pdfText(actualPath, 20000, [pageNumber]);
	} catch {
		text = '';
	}
	sourcePdfPageTextCache.set(key, text);
	return text;
}

function copyrightPlaceholderMediaIssues(question) {
	const text = learnerFacingQuestionText(question);
	if (
		!/\b(?:cannot be reproduced|not reproduced|third[- ]party copyright|copyright restrictions?)\b/i.test(
			text
		)
	) {
		return [];
	}
	const labels = referencedMediaLabelsFromQuestion(question);
	return [
		{
			severity: 'error',
			code: 'media_copyright_placeholder',
			field: 'questions.contextText',
			evidence: labels.join(', ') || text.slice(0, 160),
			message:
				'The learner-facing extraction references media that the public paper replaces with a copyright placeholder. Exclude the question or provide a legitimate usable substitute before import.'
		}
	];
}

function questionRenderBlocks(question) {
	return ['stemBlocks', 'leadBlocks', 'promptBlocks', 'afterResponseBlocks'].flatMap((field) =>
		(question[field] ?? []).map((block, index) => ({
			field: `${field}[${index}]`,
			block
		}))
	);
}

function isMediaRenderBlock(block) {
	if (!block || typeof block !== 'object') return false;
	const kind = String(block.kind ?? '');
	return [
		'figure',
		'image',
		'assetRef',
		'assetReference',
		'imageFigure',
		'imageBlock',
		'figure-placeholder',
		'figure-reference'
	].includes(kind);
}

function renderBlockAssetLabel(block) {
	const value =
		block?.assetLabel ??
		block?.sourceLabel ??
		block?.label ??
		block?.assetId ??
		block?.id ??
		block?.altText;
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function inferMediaLabelFromQuestionText(question) {
	const text = [
		question.promptText,
		question.selfContainedPromptText,
		question.contextText,
		...(question.reviewNotes ?? [])
	]
		.filter(Boolean)
		.join('\n');
	const match = text.match(/\b(figure|fig\.?|table|graph|diagram|image)\s+(\d+[A-Za-z]?)\b/i);
	if (!match) return null;
	const prefix = /^fig/i.test(match[1]) ? 'Figure' : titleCase(match[1]);
	return `${prefix} ${match[2]}`;
}

function learnerFacingQuestionText(question) {
	return [
		question.promptText,
		question.selfContainedPromptText,
		question.contextText,
		...(question.stemBlocks ?? []).map(blockText),
		...(question.leadBlocks ?? []).map(blockText),
		...(question.promptBlocks ?? []).map(blockText),
		...(question.afterResponseBlocks ?? []).map(blockText)
	]
		.filter(Boolean)
		.join('\n');
}

function blockText(block) {
	if (!block || typeof block !== 'object') return '';
	return [
		block.text,
		block.html,
		block.caption,
		block.label,
		block.altText,
		block.title,
		block.description
	]
		.filter((value) => typeof value === 'string' && value.trim())
		.join('\n');
}

function referencedMediaLabelsFromQuestion(question) {
	const labels = new Set();
	const text = learnerFacingQuestionText(question);
	for (const match of text.matchAll(
		/\b(figure|fig\.?|table|graph|diagram|image)\s+(\d+[A-Za-z]?)\b/gi
	)) {
		const prefix = /^fig/i.test(match[1]) ? 'Figure' : titleCase(match[1]);
		labels.add(`${prefix} ${match[2]}`);
	}
	for (const { block } of questionRenderBlocks(question)) {
		if (!isMediaRenderBlock(block)) continue;
		const label = renderBlockAssetLabel(block);
		if (label) labels.add(label);
	}
	for (const label of collectResponseAssetLabels(question.response)) labels.add(label);
	return [...labels];
}

function questionHasConcreteMediaAsset(question, label) {
	if (
		(question.assets ?? []).some(
			(asset) =>
				assetMatchesLabel(asset, label) &&
				assetHasUsableReference(asset) &&
				!mediaAssetPageLabelMismatch(asset, label)
		)
	) {
		return true;
	}
	if (questionHasStructuredTableSurface(question, label)) return true;
	return questionRenderBlocks(question).some(
		({ block }) =>
			assetMatchesLabel(block, label) &&
			(assetHasUsableReference(block) || assetHasUsableReference(block?.asset)) &&
			!mediaAssetPageLabelMismatch(block, label) &&
			!mediaAssetPageLabelMismatch(block?.asset, label)
	);
}

function questionHasStructuredTableSurface(question, label) {
	if (!/\btable\b/i.test(String(label ?? ''))) return false;
	return questionRenderBlocks(question).some(({ block }) =>
		structuredTableBlockMatches(block, label)
	);
}

function structuredTableBlockMatches(block, label) {
	if (!block || typeof block !== 'object') return false;
	if (!['table', 'structured-table'].includes(String(block.kind ?? ''))) return false;
	if (!assetMatchesLabel(block, label)) return false;
	const rows = Array.isArray(block.rows) ? block.rows : [];
	const hasRows = rows.some(
		(row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim())
	);
	const hasColumns = Array.isArray(block.columns)
		? block.columns.some((column) => String(column ?? '').trim())
		: false;
	return hasRows && hasColumns;
}

function mediaAssetPageLabelMismatch(asset, label, field = 'assets') {
	if (!asset || !label) return null;
	const expected = figureNumber(label);
	if (!expected) return null;
	const values = [
		asset.sourceLabel,
		asset.label,
		asset.assetLabel,
		asset.altText,
		asset.id,
		asset.assetId,
		asset.filePath,
		asset.publicPath,
		asset.r2Key
	].filter((value) => typeof value === 'string' && value.trim());
	for (const value of values) {
		const actual = figureNumber(value);
		if (actual && actual !== expected) {
			return {
				severity: 'error',
				code: 'media_asset_label_mismatch',
				field,
				evidence: `${label} -> ${value}`,
				message:
					'Media asset metadata or path appears to point to a different numbered figure than the learner-facing reference.'
			};
		}
	}
	return null;
}

function figureNumber(value) {
	const match = String(value ?? '').match(/\b(?:figure|fig\.?)\s*[-_ ]*(\d+[A-Za-z]?)\b/i);
	return match ? match[1].toLowerCase() : null;
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mediaReferenceNeedsVisualContext(question, label) {
	const text = learnerFacingQuestionText(question);
	const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const labelPattern = escapedLabel
		.replace(/figure/i, '(?:figure|fig\\.?)')
		.replace(/table/i, 'table');
	const aroundLabel = new RegExp(
		`(?:use|using|in|from|shown? in|shows?|complete|label|plot|draw|name|identify|results? in|part)\\b[^.\\n]{0,100}\\b${labelPattern}\\b|\\b${labelPattern}\\b[^.\\n]{0,100}\\b(?:shows?|complete|label|plot|draw|name|identify|results?|part)`,
		'i'
	);
	return (
		['asset-canvas', 'image-label-zones'].includes(question.response?.kind) ||
		aroundLabel.test(text)
	);
}

function titleCase(value) {
	const text = String(value ?? '').toLowerCase();
	return text ? text[0].toUpperCase() + text.slice(1) : text;
}

export function positiveMarkSchemeItem(item) {
	const itemType = String(item?.itemType ?? '')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.toLowerCase()
		.replace(/[_-]+/g, ' ');
	const text = String(item?.text ?? '').toLowerCase();
	const source = `${itemType}\n${text}`;
	if (
		/\b(?:withdraw|withdrawn|statistics?|mean mark|max(?:imum)? mark|notice)\b/.test(source) ||
		/\b(?:rubric|guidance|ignore|reject|do not accept|do not credit)\b/.test(itemType)
	) {
		return false;
	}
	if (
		/\b(?:allow|accept|alternative)\b/.test(itemType) &&
		!/\b(?:credit|marking point|answer|alternative marking point|allowance|acceptable|award|positive)\b/.test(
			itemType
		)
	) {
		return false;
	}
	return /\b(?:marking point|answer|credit|mark|method|calculation|point|indicative|indicative content|level|max|allowance|acceptable|award|positive)\b/.test(
		itemType
	);
}

function hasUsableGradingEvidence(question, options = {}) {
	const includeAnswerChainEvidence = options.includeAnswerChainEvidence !== false;
	const markSchemeItems = question.markSchemeItems ?? [];
	const hasPositiveMarkRows = markSchemeItems.some(positiveMarkSchemeItem);
	const hasChecklist = (question.markChecklist ?? []).some((item) =>
		String(item?.text ?? '').trim()
	);
	const hasModelAnswer = String(question.modelAnswer?.answerText ?? '').trim().length > 0;
	const hasAnswerKeys = responseCorrectAnswerTexts(question.response).length > 0;
	const hasChainEvidence =
		includeAnswerChainEvidence &&
		(question.answerChain?.steps ?? []).some((step) =>
			(step.markSchemeItemIndexes ?? []).some((itemIndex) =>
				positiveMarkSchemeItem(markSchemeItems[itemIndex])
			)
		);
	return hasPositiveMarkRows || hasChecklist || hasModelAnswer || hasAnswerKeys || hasChainEvidence;
}

function questionGradingEvidenceIssues(question, options = {}) {
	if (question.marks === null || question.marks === undefined || Number(question.marks) <= 0) {
		return [];
	}
	if (hasUsableGradingEvidence(question, options)) return [];
	return [
		{
			severity: 'error',
			code: 'question_missing_grading_evidence',
			field:
				'questions.markSchemeItems/markChecklist/modelAnswer/response.correctAnswers/answerChain',
			evidence: question.sourceQuestionRef,
			message:
				'Marked learner-facing questions need positive marking evidence. Omit withdrawn/statistics-only rows or recover the original prompt and mark scheme before import.'
		}
	];
}

function withdrawnOrStatisticsOnlyQuestionIssues(question) {
	const markSchemeItems = question.markSchemeItems ?? [];
	if (markSchemeItems.some(positiveMarkSchemeItem)) return [];
	const text = [
		question.promptText,
		question.selfContainedPromptText,
		question.contextText,
		...(question.reviewNotes ?? []),
		...(question.markChecklist ?? []).map((item) => item?.text),
		question.modelAnswer?.answerText,
		question.answerChain?.title,
		question.answerChain?.canonicalChainText,
		question.answerChain?.summary,
		...(question.answerChain?.reviewNotes ?? []),
		...markSchemeItems.flatMap((item) => [item?.itemType, item?.text, item?.sourceRef])
	]
		.filter(Boolean)
		.join('\n')
		.toLowerCase();
	if (
		!/\b(?:withdrawn?|no replacement|statistics?|mean mark|maximum mark|max mark|no official marking criterion|no positive marking criterion)\b/.test(
			text
		)
	) {
		return [];
	}
	return [
		{
			severity: 'error',
			code: 'question_withdrawn_or_statistics_only',
			field: 'questions',
			evidence: question.sourceQuestionRef,
			message:
				'Withdrawn questions, replacement notices, and statistics-only rows are not learner-facing extracted questions. Omit the row or recover the original prompt and positive marking criteria.'
		}
	];
}

export function sanitizeAnswerChainEvidenceIndexes(candidate) {
	let changed = false;
	const questions = (candidate.questions ?? []).map((question) => {
		if (!question.answerChain) return question;
		const markSchemeItems = question.markSchemeItems ?? [];
		let questionChanged = false;
		const steps = (question.answerChain.steps ?? []).map((step) => {
			const originalIndexes = step.markSchemeItemIndexes ?? [];
			const filteredIndexes = originalIndexes.filter((itemIndex) => {
				const item = markSchemeItems[itemIndex];
				return item && positiveMarkSchemeItem(item);
			});
			if (
				filteredIndexes.length !== originalIndexes.length ||
				filteredIndexes.some((itemIndex, index) => itemIndex !== originalIndexes[index])
			) {
				questionChanged = true;
			}
			return questionChanged ? { ...step, markSchemeItemIndexes: filteredIndexes } : step;
		});
		if (!questionChanged) return question;
		changed = true;
		return {
			...question,
			answerChain: {
				...question.answerChain,
				steps
			}
		};
	});
	return changed ? { ...candidate, questions } : candidate;
}

function answerChainEvidenceIssues(question) {
	const chain = question.answerChain;
	if (!chain) return [];
	const issues = [];
	const markSchemeItems = question.markSchemeItems ?? [];
	for (const [stepIndex, step] of (chain.steps ?? []).entries()) {
		const field = `answerChain.steps[${stepIndex}].markSchemeItemIndexes`;
		const indexes = step.markSchemeItemIndexes ?? [];
		if (step.stepRole !== 'given' && indexes.length === 0) {
			issues.push({
				severity: 'error',
				code: 'chain_step_missing_positive_evidence',
				field,
				evidence: step.stepText,
				message:
					'A non-given answer-chain step has no positive mark-scheme support. Remove unsupported tail steps or link the step to a positive marking point.'
			});
		}
		for (const itemIndex of indexes) {
			const item = markSchemeItems[itemIndex];
			if (!item) {
				issues.push({
					severity: 'error',
					code: 'chain_step_missing_mark_scheme_item',
					field,
					evidence: `${step.stepText} -> markSchemeItems[${itemIndex}]`,
					message: 'Answer-chain steps must reference existing positive mark-scheme items only.'
				});
				continue;
			}
			if (positiveMarkSchemeItem(item)) continue;
			issues.push({
				severity: 'error',
				code: 'chain_step_non_positive_evidence',
				field,
				evidence: `${step.stepText} -> ${item.itemType}: ${item.text}`,
				message:
					'Answer-chain steps must not use allow, accept, guidance, ignore, reject, or do-not-accept rows as positive support.'
			});
		}
	}
	return issues;
}

export function blockingIssues(findings) {
	return findings.flatMap((finding) =>
		finding.issues
			.filter((issue) => issue.severity === 'error')
			.map((issue) => ({ ...issue, sourceQuestionRef: finding.sourceQuestionRef }))
	);
}

function chainFieldEntries(chain) {
	return [
		['answerChain.title', chain?.title],
		['answerChain.canonicalChainText', chain?.canonicalChainText],
		['answerChain.summary', chain?.summary],
		...(chain?.steps ?? []).flatMap((step, index) => [
			[`answerChain.steps[${index}].stepText`, step?.stepText],
			[`answerChain.steps[${index}].explanation`, step?.explanation],
			[`answerChain.steps[${index}].commonOmission`, step?.commonOmission]
		])
	].filter(([, value]) => typeof value === 'string' && value.trim());
}

function textIncludesValue(text, value) {
	return String(text ?? '')
		.toLowerCase()
		.includes(String(value).toLowerCase());
}

export function mechanicalGoldenChecks(fixture, candidate) {
	const errors = [];
	const expected = fixture.expected ?? {};
	if ((candidate.questions ?? []).length !== 1) {
		errors.push(`Expected exactly one question, got ${(candidate.questions ?? []).length}.`);
	}
	if (candidate.sourceDocumentId !== fixture.sourceDocumentId) {
		errors.push(
			`Expected sourceDocumentId ${fixture.sourceDocumentId}, got ${candidate.sourceDocumentId}.`
		);
	}
	const question = candidate.questions?.[0];
	if (!question) return errors;
	if (question.sourceQuestionRef !== expected.sourceQuestionRef) {
		errors.push(
			`Expected sourceQuestionRef ${expected.sourceQuestionRef}, got ${question.sourceQuestionRef}.`
		);
	}
	for (const [field, text] of chainFieldEntries(question.answerChain)) {
		for (const value of expected.answerChainForbiddenValues ?? []) {
			if (textIncludesValue(text, value)) {
				errors.push(`Forbidden value ${value} appears in ${field}: ${text}`);
			}
		}
	}
	const modelAnswerText = question.modelAnswer?.answerText ?? '';
	for (const value of expected.modelAnswerShouldIncludeValues ?? []) {
		if (!textIncludesValue(modelAnswerText, value)) {
			errors.push(`Model answer is missing expected worked value ${value}.`);
		}
	}
	const checklistText = (question.markChecklist ?? []).map((item) => item.text).join('\n');
	for (const value of expected.checklistShouldIncludeValues ?? []) {
		if (!textIncludesValue(checklistText, value)) {
			errors.push(`Mark checklist is missing expected worked value ${value}.`);
		}
	}
	return errors;
}

export async function judgeCandidate({
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	fixture,
	candidate,
	deterministicIssues
}) {
	const { value } = await generateJsonWithTimeout(
		{
			model,
			thinkingLevel,
			telemetry: false,
			input: [
				{
					role: 'system',
					content:
						'You are an independent verifier for GCSE answer-chain extraction quality. You did not generate the candidate. Judge conceptual correctness against the golden specification.'
				},
				{
					role: 'user',
					content: [
						'Golden fixture:',
						JSON.stringify(fixture, null, 2),
						'',
						'Candidate extraction:',
						JSON.stringify(candidate, null, 2),
						'',
						'Deterministic specificity issues:',
						JSON.stringify(deterministicIssues, null, 2),
						'',
						'Pass only if the answerChain is reusable method wording, covers the expected concepts, avoids forbidden worked values in chain fields, and keeps worked values in model/checklist evidence.'
					].join('\n')
				}
			],
			schema: JudgeSchema
		},
		`judge-golden:${fixture?.sourceDocumentId ?? candidate?.sourceDocumentId ?? 'candidate'}`
	);
	return value;
}

export async function judgeCandidateAgainstRubric({
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	candidate,
	deterministicIssues
}) {
	const { value } = await generateJsonWithTimeout(
		{
			model,
			thinkingLevel,
			telemetry: false,
			input: [
				{
					role: 'system',
					content:
						'You are an independent verifier for GCSE question extraction quality. You did not generate the candidate. Judge the candidate against the product rule that answer chains are reusable reasoning or method patterns, not one-question worked solutions.'
				},
				{
					role: 'user',
					content: [
						'Candidate extraction:',
						JSON.stringify(candidate, null, 2),
						'',
						'Deterministic specificity issues:',
						JSON.stringify(deterministicIssues, null, 2),
						'',
						'Judge every question. Pass only if each answerChain is source-grounded, reusable across changed numbers or nearby contexts, aligned to markSchemeItems and markChecklist, and not just a topic label or worked numeric solution.',
						'Also check that markChecklist and the relevant answer field keep the source-specific values needed to answer the question. For fixed-response kinds with response.correctAnswers, do not fail merely because modelAnswer is null. For written-response kinds such as lines or labeled-lines, modelAnswer must be non-null and source-grounded.',
						'Use score from 0 to 1. Return requiredRepairs for any chain that is too broad, too topic-like, too numeric, unsupported by mark evidence, or missing important method links.',
						'Return exactly the requested JSON object shape with only these top-level keys: verdict, score, rationale, conceptMatches, forbiddenValueFindings, modelAnswerValueMatches, requiredRepairs. Do not return overallPass, perQuestionJudgement, questionJudgements, summary, markdown, or nested alternate judge formats.'
					].join('\n')
				}
			],
			schema: JudgeSchema
		},
		`judge-rubric:${candidate?.sourceDocumentId ?? 'candidate'}`
	);
	return value;
}

export async function judgeExtractionAgainstRubric({
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	candidate,
	deterministicIssues
}) {
	const sourceEvidenceParts = extractionJudgeSourceEvidenceParts(candidate);
	const { value } = await generateJsonWithTimeout(
		{
			model,
			thinkingLevel,
			telemetry: false,
			input: [
				{
					role: 'system',
					content:
						'You are an independent verifier for GCSE PDF-to-question extraction quality. You did not generate the candidate. Judge only whether the extracted learner-facing question data is complete, source-grounded, renderable, and gradable. Do not judge answer-chain quality in this pass.'
				},
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: [
								'Candidate extraction:',
								JSON.stringify(candidate, null, 2),
								'',
								'Deterministic extraction issues:',
								JSON.stringify(deterministicIssues, null, 2),
								'',
								'If candidate.extractionRun.pageSelection.questionPages is present, judge completeness only for those selected question-paper pages. If pageSelection is absent, judge the whole source paper.',
								'Use the supplied source page text and images as ground truth for learner-facing wording and visual context. Do not invent missing wording, figures, or instructions from answer formatting or mark-scheme expectations; fail only when the defect is visible in the supplied source evidence or candidate data.',
								'Judge every question. Pass only if each extracted question has the required parent context, prompt text, response controls or answer space, required images/assets/tables/graphs, positive mark-scheme evidence, checklist or answer key/model answer, and source provenance needed for a student to answer it and for the app to render it.',
								'Ignore answerChain.id, answerChain.steps, chainResolution, and placeholder chain review notes. Chain grouping is a separate text-only phase after PDF extraction.',
								'Fail if any question is missing a needed figure, table, graph, previous-part value, response control, correct answer key, written model answer, or positive mark-scheme evidence; if a copyright placeholder or fallback full-page asset makes the learner-facing item unpublishable; or if review flags indicate unresolved source/render uncertainty.',
								'Return requiredRepairs for extraction defects only. Use score from 0 to 1. Return exactly the requested JSON object shape with only these top-level keys: verdict, score, rationale, conceptMatches, forbiddenValueFindings, modelAnswerValueMatches, requiredRepairs.'
							].join('\n')
						},
						...sourceEvidenceParts
					]
				}
			],
			schema: JudgeSchema
		},
		`judge-extraction:${candidate?.sourceDocument?.id ?? candidate?.sourceDocumentId ?? 'candidate'}`
	);
	return value;
}

function extractionJudgeSourceEvidenceParts(candidate) {
	const sourcePath = candidate?.sourceDocument?.filePath;
	if (!sourcePath) return [];
	const resolvedPath = path.isAbsolute(sourcePath)
		? sourcePath
		: path.resolve(process.cwd(), sourcePath);
	if (!existsSync(resolvedPath)) return [];
	const pages = candidate?.extractionRun?.pageSelection?.questionPages ?? [];
	const sourceId = candidate?.sourceDocument?.id ?? candidate?.sourceDocumentId ?? 'source';
	const parts = [
		{
			type: 'text',
			text: [
				'Source question-paper text for selected pages:',
				pdfText(resolvedPath, 50000, pages)
			].join('\n')
		}
	];
	try {
		const rendered = selectPages(
			renderPdfPages({
				pdfPath: resolvedPath,
				outputDir: path.join(process.cwd(), 'tmp/llm-extraction-judge-pages', sourceId),
				prefix: 'question-page',
				dpi: 90,
				force: false
			}),
			pages
		);
		if (rendered.length) {
			parts.push({ type: 'text', text: 'Source question-paper page images for selected pages:' });
			parts.push(...rendered.map(imagePart));
		}
	} catch {
		parts.push({
			type: 'text',
			text: 'Source question-paper page images could not be rendered for this judge call.'
		});
	}
	return parts;
}

export async function repairCandidateAnswerChains({
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	candidate,
	deterministicIssues,
	judge = null
}) {
	const { value } = await generateJsonWithTimeout(
		{
			model,
			thinkingLevel,
			telemetry: false,
			input: [
				{
					role: 'system',
					content:
						'You repair GCSE extraction JSON. Preserve source-grounded prompt, mark scheme, checklist, and model answer evidence. Only rewrite answerChain fields unless a checklist/model answer value is clearly missing from the provided mark scheme.'
				},
				{
					role: 'user',
					content: [
						'Candidate extraction:',
						JSON.stringify(candidate, null, 2),
						'',
						'Deterministic specificity issues:',
						JSON.stringify(deterministicIssues, null, 2),
						'',
						'Judge feedback:',
						JSON.stringify(judge, null, 2),
						'',
						'Return the repaired questions array. The repaired answerChain text must be reusable method wording and must not include prompt-specific numeric values.'
					].join('\n')
				}
			],
			schema: RepairSchema
		},
		`repair-candidate-chains:${candidate?.sourceDocumentId ?? 'candidate'}`
	);
	return sanitizeAnswerChainEvidenceIndexes({ ...candidate, questions: value.questions });
}

export async function repairFullPaperAnswerChains({
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	candidate,
	deterministicIssues,
	judge = null,
	existingChainsText = '',
	sourceQuestionRefs = null
}) {
	const allowedRefs = sourceQuestionRefs ? new Set(sourceQuestionRefs) : null;
	const repairTasks = (candidate.questions ?? [])
		.filter((question) => !allowedRefs || allowedRefs.has(question.sourceQuestionRef))
		.map((question) => ({
			sourceQuestionRef: question.sourceQuestionRef,
			commandWord: question.commandWord,
			marks: question.marks,
			promptText: question.promptText,
			markSchemeItems: question.markSchemeItems,
			markChecklist: question.markChecklist,
			modelAnswer: question.modelAnswer,
			currentAnswerChain: question.answerChain,
			currentChainResolution: question.chainResolution ?? null,
			commonWeakAnswers: question.commonWeakAnswers ?? []
		}));
	if (repairTasks.length === 0) return sanitizeAnswerChainEvidenceIndexes(candidate);
	const { value } = await generateJsonWithTimeout(
		{
			model,
			thinkingLevel,
			telemetry: false,
			input: [
				{
					role: 'system',
					content:
						'You repair answer-chain fields inside a GCSE extraction. Preserve all source extraction, render, response, mark scheme, checklist, and model answer evidence. Return only JSON with a repairs array; each repair must include sourceQuestionRef and answerChain.'
				},
				{
					role: 'user',
					content: [
						'Existing chain compatibility context:',
						existingChainsText || 'None supplied.',
						'',
						'Questions and current chains:',
						JSON.stringify(repairTasks, null, 2),
						'',
						'Deterministic specificity issues:',
						JSON.stringify(deterministicIssues, null, 2),
						'',
						'Judge feedback:',
						JSON.stringify(judge, null, 2),
						'',
						'This is the text-only answer-chain grouping and reconciliation phase after PDF extraction. Some current chains may be placeholders with id null; replace those placeholders with stable reusable answerChain ids and method wording.',
						'For every listed question, decide whether the reusable mark-scoring method should reuse an existing chain id, update/clarify an existing compatible chain while keeping its id, create a genuinely new chain id, or remain needs_review when the source evidence is insufficient.',
						'Repair every listed chain that is missing a stable id, too numeric, too topic-like, unsupported, or missing reusable method links. Keep prompt-specific worked values out of answerChain fields. Use markSchemeItemIndexes only for positive marking points; never point answer-chain steps at ignore, reject, do-not-accept, do-not-credit, or guidance rows. If an existing chain id remains compatible, keep that id for compatibility.',
						'Return shape exactly: {"repairs":[{"sourceQuestionRef":"...","answerChain":{...},"chainResolution":{... optional ...},"commonWeakAnswers":[... optional ...]}]}. Do not return currentAnswerChain or currentChainResolution.',
						'If an issue code is chain_exact_fixed_answer_text, remove the exact fixed answer from every answerChain field, including title, canonicalChainText, summary, stepText, explanation, and commonOmission. For fixed-response recall, write a generic chain such as identifying the required category of term, placing it in the correct response position, and checking it matches the source cue; keep the actual answer words only in response.correctAnswers, markSchemeItems, markChecklist, or modelAnswer.'
					].join('\n')
				}
			],
			schema: FullChainRepairSchema
		},
		`repair-full-paper-chains:${candidate?.sourceDocument?.id ?? candidate?.sourceDocumentId ?? 'candidate'}:${sourceQuestionRefs?.join(',') ?? 'all'}`
	);
	const repairsByRef = new Map(value.repairs.map((repair) => [repair.sourceQuestionRef, repair]));
	return sanitizeAnswerChainEvidenceIndexes({
		...candidate,
		questions: candidate.questions.map((question) => {
			const repair = repairsByRef.get(question.sourceQuestionRef);
			if (!repair) return question;
			return {
				...question,
				answerChain: repair.answerChain,
				chainResolution: repair.chainResolution ?? question.chainResolution,
				commonWeakAnswers: repair.commonWeakAnswers ?? question.commonWeakAnswers
			};
		})
	});
}

export async function repairFullPaperQuestionQuality({
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	candidate,
	deterministicIssues,
	judge = null,
	existingChainsText = '',
	sourceQuestionRefs = null
}) {
	const allowedRefs = sourceQuestionRefs ? new Set(sourceQuestionRefs) : null;
	const repairTasks = (candidate.questions ?? [])
		.filter((question) => !allowedRefs || allowedRefs.has(question.sourceQuestionRef))
		.map((question) => ({
			sourceQuestionRef: question.sourceQuestionRef,
			commandWord: question.commandWord,
			marks: question.marks,
			promptText: question.promptText,
			selfContainedPromptText: question.selfContainedPromptText,
			contextText: question.contextText,
			response: question.response,
			render: question.render,
			assets: question.assets,
			markSchemeItems: question.markSchemeItems,
			markChecklist: question.markChecklist,
			modelAnswer: question.modelAnswer,
			currentAnswerChain: question.answerChain,
			currentChainResolution: question.chainResolution ?? null,
			commonWeakAnswers: question.commonWeakAnswers ?? [],
			needsHumanReview: question.needsHumanReview,
			reviewNotes: question.reviewNotes ?? []
		}));
	if (repairTasks.length === 0) return sanitizeAnswerChainEvidenceIndexes(candidate);
	const { value } = await generateJsonWithTimeout(
		{
			model,
			thinkingLevel,
			telemetry: false,
			input: [
				{
					role: 'system',
					content:
						'You repair GCSE extraction quality for a small set of failed questions. Preserve source prompt, response schema, mark-scheme rows, source refs, and assets unless the supplied evidence clearly shows a repair. Return only JSON with a repairs array; each repair must include sourceQuestionRef and only changed question-quality, grading, model-answer, weak-answer, review-flag, and answer-chain fields.'
				},
				{
					role: 'user',
					content: [
						PRODUCTION_EXTRACTION_CONTRACT,
						'',
						'Existing chain compatibility context:',
						existingChainsText || 'None supplied.',
						'',
						'Failed questions and current extraction fields:',
						JSON.stringify(repairTasks, null, 2),
						'',
						'Deterministic issues:',
						JSON.stringify(deterministicIssues, null, 2),
						'',
						'Judge feedback:',
						JSON.stringify(judge, null, 2),
						'',
						'Repair only fields that are actually defective. You may update selfContainedPromptText, contextText, response.correctAnswers, markChecklist, modelAnswer, commonWeakAnswers, and answerChain when judge feedback shows missing source-specific grading evidence or a bad chain.',
						'When a question depends on a table, graph, source image, or earlier context, keep the exact one-question values in selfContainedPromptText, contextText, response.correctAnswers, markChecklist, or modelAnswer. Do not put those values in answerChain fields.',
						'If answerChain evidence points at allow, accept, guidance, ignore, reject, alternative, or do-not-credit rows, remove those indexes or re-map to positive marking points only.',
						'Positive marking points are markSchemeItems whose itemType is a direct mark/answer/marking_point. Rows labelled allow, accept, guidance, alternative, ignore, reject, or do-not-credit are not positive step evidence. If judge feedback suggests using one of those rows as answerChain evidence, ignore that part of the feedback and merge, delete, or remap the step to a direct positive mark row instead.',
						'If a row labelled allow/accept actually contains a complete independently credited alternative answer route, you may repair only its itemType to alternative_marking_point while preserving text, marks, sourceRef, and confidence.',
						'If a checklist item describes one option among accepted alternatives, do not mark every alternative required=true as though all must be present. Represent alternatives with required=false wording that says any one accepted route earns credit.',
						'Keep exact answer strings, worked values, table entries, and one-question facts in response.correctAnswers, markChecklist, and modelAnswer, not in answerChain fields.',
						'You may clear needsHumanReview only when every previous review note is resolved by concrete fields in the repaired extraction and no required media/context/copyright/response-control uncertainty remains. If any source figure, crop, table, graph, earlier context, answer area, or copyright placeholder is still uncertain, keep needsHumanReview true and keep a concise blocking review note.',
						'If you clear needsHumanReview, replace reviewNotes with only unresolved non-blocking notes, or [] when there are none. Do not clear review-marked fallback full-page assets unless the full page is intentionally the learner-visible asset and deterministic media checks can still pass.'
					].join('\n')
				}
			],
			schema: FullQuestionQualityRepairSchema
		},
		`repair-full-paper-quality:${candidate?.sourceDocumentId ?? 'candidate'}:${sourceQuestionRefs?.join(',') ?? 'all'}`
	);
	const repairsByRef = new Map(value.repairs.map((repair) => [repair.sourceQuestionRef, repair]));
	return sanitizeAnswerChainEvidenceIndexes({
		...candidate,
		questions: candidate.questions.map((question) => {
			const repair = repairsByRef.get(question.sourceQuestionRef);
			if (!repair) return question;
			return {
				...question,
				selfContainedPromptText:
					repair.selfContainedPromptText !== undefined
						? repair.selfContainedPromptText
						: question.selfContainedPromptText,
				contextText: repair.contextText !== undefined ? repair.contextText : question.contextText,
				response: repair.response ?? question.response,
				assets: repair.assets ?? question.assets,
				markSchemeItems: repair.markSchemeItems ?? question.markSchemeItems,
				answerChain: repair.answerChain ?? question.answerChain,
				chainResolution: repair.chainResolution ?? question.chainResolution,
				markChecklist: repair.markChecklist ?? question.markChecklist,
				modelAnswer: repair.modelAnswer ?? question.modelAnswer,
				commonWeakAnswers: repair.commonWeakAnswers ?? question.commonWeakAnswers,
				needsHumanReview:
					repair.needsHumanReview !== undefined && repair.needsHumanReview !== null
						? repair.needsHumanReview
						: question.needsHumanReview,
				reviewNotes:
					repair.reviewNotes !== undefined && repair.reviewNotes !== null
						? repair.reviewNotes
						: question.reviewNotes
			};
		})
	});
}

function sourceQuestionGroupRef(question) {
	const ref = question?.sourceQuestionRef ?? '';
	return (
		question?.parentSourceQuestionRef ?? question?.parentQuestionRef ?? ref.split('.')[0] ?? ref
	);
}

function orderQuestionsForRendering(questions) {
	return [...questions].sort((a, b) => {
		const displayDiff = (a.displayOrder ?? 999999) - (b.displayOrder ?? 999999);
		if (displayDiff !== 0) return displayDiff;
		return compareQuestionRefs(a.sourceQuestionRef, b.sourceQuestionRef);
	});
}

function stripHtml(value) {
	return String(value ?? '')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function compactUnknown(value, depth = 0) {
	if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
	if (typeof value === 'string') return value.length > 800 ? `${value.slice(0, 800)}...` : value;
	if (Array.isArray(value)) {
		if (depth > 2) return `[array length ${value.length}]`;
		return value.slice(0, 20).map((entry) => compactUnknown(entry, depth + 1));
	}
	if (typeof value !== 'object') return String(value);
	if (depth > 2) return '[object]';
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => key !== 'data')
			.slice(0, 25)
			.map(([key, entry]) => [key, compactUnknown(entry, depth + 1)])
	);
}

function tableRowsToText(rows) {
	return (rows ?? [])
		.map((row) => {
			if (!Array.isArray(row)) return String(row ?? '');
			return row
				.map((cell) => {
					if (cell && typeof cell === 'object') {
						return stripHtml(
							cell.text ?? cell.html ?? cell.value ?? JSON.stringify(compactUnknown(cell))
						);
					}
					return stripHtml(cell);
				})
				.join(' | ');
		})
		.join('\n');
}

function blockLabel(block) {
	return (
		block?.label ??
		block?.sourceLabel ??
		block?.assetLabel ??
		block?.assetId ??
		block?.id ??
		block?.altText ??
		null
	);
}

function blockToLearnerText(block) {
	if (!block || typeof block !== 'object') return String(block ?? '');
	const kind = block.kind ?? 'unknown';
	if (['paragraph', 'text', 'textBlock', 'textBlockHtml'].includes(kind)) {
		return stripHtml(block.text ?? block.html ?? block.value ?? '');
	}
	if (kind === 'equation') return `Equation: ${stripHtml(block.text ?? block.html ?? '')}`;
	if (kind === 'bullet-list' || kind === 'bulletList') {
		return (block.items ?? []).map((item) => `- ${stripHtml(item)}`).join('\n');
	}
	if (kind === 'ordered-list' || kind === 'orderedList') {
		return (block.items ?? []).map((item, index) => `${index + 1}. ${stripHtml(item)}`).join('\n');
	}
	if (kind === 'key') {
		return (block.items ?? [])
			.map(
				(item) => `${item.marker ?? item.label ?? ''}: ${stripHtml(item.text ?? item.value ?? '')}`
			)
			.join('\n');
	}
	if (kind === 'table' || kind === 'structured-table') {
		const label = block.label ? `${block.label}\n` : '';
		const columns = Array.isArray(block.columns) ? `${block.columns.join(' | ')}\n` : '';
		return `${label}${columns}${tableRowsToText(block.rows)}`.trim();
	}
	if (['figure', 'image', 'assetRef'].includes(kind)) {
		const label = blockLabel(block) ?? 'unlabelled media';
		const alt = stripHtml(block.altText ?? block.caption ?? block.text ?? '');
		return `[${kind}: ${label}${alt ? ` - ${alt}` : ''}]`;
	}
	return `[unsupported block ${kind}: ${JSON.stringify(compactUnknown(block))}]`;
}

function responseToLearnerText(response) {
	if (!response || typeof response !== 'object') return 'No response control extracted.';
	const kind = response.kind ?? 'unknown';
	if (kind === 'none') return 'No student response field.';
	if (kind === 'lines') return `Answer lines: ${response.count ?? 'unspecified'} line(s).`;
	if (kind === 'labeled-lines') {
		return `Labelled answer lines: ${(response.labels ?? []).join(', ') || 'no labels'}.`;
	}
	if (kind === 'choice') {
		return `Choice options:\n${(response.options ?? []).map((option) => `- ${option}`).join('\n')}`;
	}
	if (kind === 'choice-table') {
		return `Choice table:\n${tableRowsToText([response.columns ?? [], ...(response.rows ?? [])])}`;
	}
	if (kind === 'matching') {
		return [
			`Matching response.`,
			`Left: ${(response.left ?? []).join(', ')}`,
			`Right: ${(response.right ?? []).join(', ')}`
		].join('\n');
	}
	if (kind === 'equation-blanks') {
		return `Equation blanks: ${(response.segments ?? [])
			.map((segment) =>
				segment.kind === 'blank' ? `[blank:${segment.id ?? segment.label ?? ''}]` : segment.text
			)
			.join('')}`;
	}
	if (kind === 'number-line') return `Number-line response: ${response.label ?? ''}`;
	if (kind === 'asset-canvas') {
		return `Student draws or annotates on asset canvas: ${
			response.assetLabel ?? response.label ?? response.assetId ?? 'unlabelled asset'
		}.`;
	}
	if (kind === 'image-label-zones') {
		return `Image label zones on ${response.assetLabel ?? response.label ?? response.assetId ?? 'image'} using labels ${(response.labels ?? []).join(', ')}.`;
	}
	if (kind === 'drawing-box') return `Drawing box: ${response.label ?? 'unlabelled'}.`;
	return `Response control ${kind}: ${JSON.stringify(compactUnknown(response))}`;
}

function assetLabel(asset) {
	return (
		asset?.sourceLabel ??
		asset?.label ??
		asset?.assetLabel ??
		asset?.altText ??
		asset?.id ??
		asset?.assetId ??
		asset?.filePath ??
		asset?.publicPath ??
		null
	);
}

function collectBlockAssetLabels(blocks) {
	const labels = new Set();
	for (const block of blocks ?? []) {
		if (!block || typeof block !== 'object') continue;
		if (['figure', 'image', 'assetRef'].includes(block.kind)) {
			const label = blockLabel(block);
			if (label) labels.add(String(label));
		}
	}
	return labels;
}

function collectResponseAssetLabels(response) {
	const labels = new Set();
	if (!response || typeof response !== 'object') return labels;
	if (['asset-canvas', 'image-label-zones'].includes(response.kind)) {
		const primaryLabels = [
			response.assetLabel,
			response.assetId,
			response.sourceLabel,
			...(Array.isArray(response.assets) ? response.assets : [])
		].filter((value) => typeof value === 'string' && value.trim());
		const values = primaryLabels.length ? primaryLabels : [response.label];
		for (const value of values) {
			if (value) labels.add(String(value));
		}
	}
	return labels;
}

function questionLearnerSection(question, targetRef) {
	const stemBlocks =
		question.stemBlocks ?? question.render?.stemBlocks ?? question.render?.blocks ?? [];
	const leadBlocks = question.leadBlocks ?? question.render?.leadBlocks ?? [];
	const promptBlocks = question.promptBlocks ?? question.render?.promptBlocks ?? [];
	const afterResponseBlocks =
		question.afterResponseBlocks ?? question.render?.afterResponseBlocks ?? [];
	const response = question.response ?? question.render?.response ?? null;
	const allBlocks = [...stemBlocks, ...leadBlocks, ...promptBlocks, ...afterResponseBlocks];
	const referencedAssets = new Set([
		...collectBlockAssetLabels(allBlocks),
		...collectResponseAssetLabels(response),
		...(question.assets ?? []).map(assetLabel).filter(Boolean).map(String)
	]);
	return {
		sourceQuestionRef: question.sourceQuestionRef,
		role: question.sourceQuestionRef === targetRef ? 'target' : 'prior_context',
		marks: question.marks ?? null,
		commandWord: question.commandWord ?? null,
		promptText: question.promptText ?? '',
		selfContainedPromptText: question.selfContainedPromptText ?? null,
		contextText: question.contextText ?? null,
		blocks: {
			stem: stemBlocks.map(blockToLearnerText).filter(Boolean),
			lead: leadBlocks.map(blockToLearnerText).filter(Boolean),
			prompt: promptBlocks.map(blockToLearnerText).filter(Boolean),
			afterResponse: afterResponseBlocks.map(blockToLearnerText).filter(Boolean)
		},
		response: responseToLearnerText(response),
		referencedAssets: [...referencedAssets]
	};
}

function normalizeAssetKey(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function assetMatchesLabel(asset, label) {
	const wanted = normalizeAssetKey(label);
	if (!wanted) return false;
	return [
		asset?.sourceLabel,
		asset?.label,
		asset?.assetLabel,
		asset?.altText,
		asset?.id,
		asset?.assetId,
		asset?.filePath,
		asset?.publicPath
	].some((value) => {
		const normalized = normalizeAssetKey(value);
		return (
			normalized.length > 0 &&
			(normalized === wanted || normalized.includes(wanted) || wanted.includes(normalized))
		);
	});
}

function assetHasUsableReference(asset) {
	return (
		Boolean(
			asset?.filePath ||
			asset?.sourcePath ||
			asset?.localPath ||
			asset?.path ||
			asset?.publicPath ||
			asset?.r2Key
		) || pathCandidatesForAsset(asset).some((candidatePath) => existsSync(candidatePath))
	);
}

function pathCandidatesForAsset(asset) {
	const rawValues = [
		asset?.filePath,
		asset?.sourcePath,
		asset?.localPath,
		asset?.path,
		asset?.publicPath,
		asset?.r2Key
	].filter(Boolean);
	const candidates = [];
	for (const rawValue of rawValues) {
		const value = String(rawValue);
		if (/^(?:https?:|data:|blob:)/i.test(value)) continue;
		const withoutSlash = value.replace(/^\//, '');
		candidates.push(path.resolve(process.cwd(), value));
		candidates.push(path.resolve(process.cwd(), withoutSlash));
		if (withoutSlash.startsWith('images/')) {
			candidates.push(path.resolve(process.cwd(), 'data', withoutSlash));
		}
		if (withoutSlash.startsWith('papers/')) {
			candidates.push(
				path.resolve(
					process.cwd(),
					'data',
					'aqa-combined-science-trilogy-higher',
					'assets',
					withoutSlash
				)
			);
		}
	}
	return [...new Set(candidates)];
}

function mimeTypeForFile(filePath) {
	const ext = path.extname(filePath).toLowerCase();
	if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
	if (ext === '.webp') return 'image/webp';
	if (ext === '.gif') return 'image/gif';
	return 'image/png';
}

function inlineDataForAsset(asset, label) {
	for (const filePath of pathCandidatesForAsset(asset)) {
		if (!existsSync(filePath)) continue;
		return {
			type: 'inlineData',
			mimeType: mimeTypeForFile(filePath),
			filename: path.basename(filePath),
			data: readFileSync(filePath).toString('base64'),
			_label: label
		};
	}
	return null;
}

function markEvidenceForQuestion(question) {
	return {
		markSchemeItems: question.markSchemeItems ?? [],
		markChecklist: question.markChecklist ?? [],
		modelAnswer: question.modelAnswer ?? null,
		responseCorrectAnswers: question.response?.correctAnswers ?? []
	};
}

export function buildLearnerVisibleQuestionContext(candidate, sourceQuestionRef, options = {}) {
	const includePriorContext = options.includePriorContext !== false;
	const attachImages = options.attachImages !== false;
	const maxImages = options.maxImages ?? 6;
	const questions = orderQuestionsForRendering(candidate.questions ?? []);
	const target = questions.find((question) => question.sourceQuestionRef === sourceQuestionRef);
	if (!target) throw new Error(`Question ${sourceQuestionRef} not found in candidate.`);
	const groupRef = sourceQuestionGroupRef(target);
	const grouped = questions.filter((question) => sourceQuestionGroupRef(question) === groupRef);
	const targetIndex = grouped.findIndex(
		(question) => question.sourceQuestionRef === sourceQuestionRef
	);
	const visibleQuestions = includePriorContext ? grouped.slice(0, targetIndex + 1) : [target];
	const sections = visibleQuestions.map((question) =>
		questionLearnerSection(question, sourceQuestionRef)
	);
	const assets = visibleQuestions.flatMap((question) => question.assets ?? []);
	const requiredAssetLabels = [...new Set(sections.flatMap((section) => section.referencedAssets))];
	const media = [];
	const inlineImages = [];
	for (const label of requiredAssetLabels) {
		const matchingAsset =
			assets.find((asset) => assetMatchesLabel(asset, label) && assetHasUsableReference(asset)) ??
			assets.find((asset) => assetMatchesLabel(asset, label));
		const inlineData =
			attachImages && matchingAsset && inlineImages.length < maxImages
				? inlineDataForAsset(matchingAsset, label)
				: null;
		if (inlineData) {
			inlineImages.push(inlineData);
		}
		media.push({
			label,
			present: Boolean(matchingAsset),
			hasInlineImage: Boolean(inlineData),
			asset: matchingAsset ? compactUnknown(matchingAsset) : null
		});
	}
	return {
		sourceDocument: candidate.sourceDocument ?? {
			id: candidate.sourceDocumentId ?? null
		},
		markSchemeDocument: candidate.markSchemeDocument ?? null,
		targetRef: sourceQuestionRef,
		parentGroupRef: groupRef,
		includedSourceQuestionRefs: visibleQuestions.map((question) => question.sourceQuestionRef),
		targetQuestion: {
			sourceQuestionRef: target.sourceQuestionRef,
			promptText: target.promptText ?? '',
			selfContainedPromptText: target.selfContainedPromptText ?? null,
			contextText: target.contextText ?? null,
			marks: target.marks ?? null,
			commandWord: target.commandWord ?? null,
			pageStart: target.pageStart ?? null,
			pageEnd: target.pageEnd ?? null
		},
		studentVisibleContext: {
			sections,
			media
		},
		targetAnswerKey: markEvidenceForQuestion(target),
		inlineImages
	};
}

export async function judgeQuestionSolvability({
	candidate,
	sourceQuestionRef,
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	minJudgeScore = 0.8,
	attachImages = true,
	includePriorContext = true
}) {
	const context = buildLearnerVisibleQuestionContext(candidate, sourceQuestionRef, {
		attachImages,
		includePriorContext
	});
	const contextForJson = { ...context, inlineImages: undefined };
	const content = [
		{
			type: 'text',
			text: [
				'Assembled learner-visible extraction context:',
				JSON.stringify(contextForJson, null, 2),
				'',
				'Task:',
				'1. Decide whether a student can answer the target question from the assembled learner-visible context alone.',
				'2. Treat previous subparts in the same parent group as visible context, but do not use the answer key to decide solvability.',
				'3. If the target refers to a figure, table, diagram, graph, answer space, or previous subpart and that information is absent or only a label with no usable content, fail with blocking missingContext.',
				'4. If attached images are provided, inspect them as part of the learner-visible context. If an image is needed but not attached or not described in text/tables, fail.',
				'5. After forming an attempted answer from visible context, compare it with targetAnswerKey and report whether the mark scheme fits the extracted question.',
				'6. This is an end-user extraction/rendering validation. Do not judge answer-chain reusability here except where it affects the visible question.'
			].join('\n')
		},
		...context.inlineImages.map((image) => ({
			type: 'text',
			text: `Attached learner-visible image for ${image._label ?? image.filename}.`
		})),
		...context.inlineImages.map((image) => {
			const imagePart = { ...image };
			delete imagePart._label;
			return imagePart;
		})
	];
	const { value } = await generateJsonWithTimeout(
		{
			model,
			thinkingLevel,
			telemetry: false,
			input: [
				{
					role: 'system',
					content:
						'You are an independent GCSE question extraction verifier. You did not generate the extraction. Judge whether the learner-facing assembled question is complete and answerable, including parent context, prior subparts, tables, diagrams, images, and response controls.'
				},
				{
					role: 'user',
					content
				}
			],
			schema: SolvabilityJudgeSchema
		},
		`judge-solvability:${candidate?.sourceDocument?.id ?? candidate?.sourceDocumentId ?? 'candidate'}:${sourceQuestionRef}`
	);
	const blockingFindings = [
		...(value.missingContext ?? []),
		...(value.renderFindings ?? [])
	].filter((finding) => finding.severity === 'blocking');
	const passed =
		value.verdict === 'pass' &&
		value.score >= minJudgeScore &&
		value.studentVisibleSolvable &&
		blockingFindings.length === 0;
	return {
		status: passed ? 'passed' : 'failed',
		sourceQuestionRef,
		minJudgeScore,
		includedSourceQuestionRefs: context.includedSourceQuestionRefs,
		media: context.studentVisibleContext.media,
		judge: value
	};
}

export async function evaluateCandidate({
	candidate,
	fixture = null,
	judgeModel = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	minJudgeScore = 0.8,
	runJudge = true,
	evaluationMode = 'full'
}) {
	if (!['extraction', 'full'].includes(evaluationMode)) {
		throw new Error('evaluationMode must be extraction or full.');
	}
	const deterministicIssues = deterministicCandidateIssues(candidate, {
		includeAnswerChainIssues: evaluationMode !== 'extraction'
	});
	const blocking = blockingIssues(deterministicIssues);
	const mechanicalErrors = fixture ? mechanicalGoldenChecks(fixture, candidate) : [];
	const judge = runJudge
		? fixture
			? await judgeCandidate({
					model: judgeModel,
					thinkingLevel,
					fixture,
					candidate,
					deterministicIssues
				})
			: evaluationMode === 'extraction'
				? await judgeExtractionAgainstRubric({
						model: judgeModel,
						thinkingLevel,
						candidate,
						deterministicIssues
					})
				: await judgeCandidateAgainstRubric({
						model: judgeModel,
						thinkingLevel,
						candidate,
						deterministicIssues
					})
		: null;
	const passed =
		blocking.length === 0 &&
		mechanicalErrors.length === 0 &&
		(!judge || (judge.verdict === 'pass' && judge.score >= minJudgeScore));
	return {
		status: passed ? 'passed' : 'failed',
		evaluationMode,
		mechanicalErrors,
		deterministicBlockingIssues: blocking.map((issue) => ({
			code: issue.code,
			field: issue.field,
			evidence: issue.evidence,
			sourceQuestionRef: issue.sourceQuestionRef
		})),
		deterministicSummary: chainSpecificityIssueSummary(blocking, 6),
		judge
	};
}

export async function runGoldenPdfEval({
	rootDir = process.cwd(),
	fixturePath,
	outputRoot,
	model = DEFAULT_EXTRACTION_MODEL,
	judgeModel = model,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	minJudgeScore = 0.8,
	repairAttempts = 0
}) {
	const fixture = readJson(fixturePath);
	const workDir = outputRoot ?? path.join(rootDir, 'tmp/extraction-pipeline-golden');
	const questionPdf = path.join(workDir, 'question-paper.pdf');
	const markSchemePdf = path.join(workDir, 'mark-scheme.pdf');
	writeSimplePdf(questionPdf, fixture.questionPaper.title, fixture.questionPaper.lines);
	writeSimplePdf(markSchemePdf, fixture.markScheme.title, fixture.markScheme.lines);
	const extractionSpec = readFileSync(path.join(rootDir, 'docs/extraction-spec.md'), 'utf8');
	let candidate = await extractFullPaperFromPdfSet({
		rootDir,
		questionPaperPath: questionPdf,
		markSchemePath: markSchemePdf,
		sourceDocumentId: fixture.sourceDocumentId,
		markSchemeDocumentId: `${fixture.sourceDocumentId}-mark-scheme`,
		outputRoot: workDir,
		forceRender: true,
		model,
		thinkingLevel,
		extractionSpec,
		expectedQuestionCount: 1,
		documentMetadata: {
			questionPaperTitle: fixture.questionPaper.title,
			markSchemeTitle: fixture.markScheme.title
		}
	});
	let evaluation = await evaluateCandidate({
		candidate,
		fixture,
		judgeModel,
		thinkingLevel,
		minJudgeScore
	});
	for (let attempt = 0; evaluation.status !== 'passed' && attempt < repairAttempts; attempt += 1) {
		candidate = await repairFullPaperAnswerChains({
			model,
			thinkingLevel,
			candidate,
			deterministicIssues: deterministicCandidateIssues(candidate),
			judge: evaluation.judge
		});
		evaluation = await evaluateCandidate({
			candidate,
			fixture,
			judgeModel,
			thinkingLevel,
			minJudgeScore
		});
	}
	return { fixture, candidate: FullPaperExtractionSchema.parse(candidate), evaluation };
}
