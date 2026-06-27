import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
	'- Preserve render structure in stemBlocks, leadBlocks, promptBlocks, response, afterResponseBlocks, and assets. Use response objects for choices, tick boxes, matching, equation blanks, image labels, and drawing boxes.',
	'- Use only app-supported response.kind values: none, lines, labeled-lines, number-line, choice, choice-table, matching, equation-blanks, asset-canvas, image-label-zones, drawing-box.',
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

export const JudgeSchema = z.object({
	verdict: z.enum(['pass', 'fail']),
	score: z.number().min(0).max(1),
	rationale: z.string(),
	conceptMatches: z.array(
		z.object({ concept: z.string(), matched: z.boolean(), note: z.string() })
	),
	forbiddenValueFindings: z.array(
		z.object({ value: z.string(), foundInAnswerChain: z.boolean(), note: z.string() })
	),
	modelAnswerValueMatches: z.array(
		z.object({ value: z.string(), matched: z.boolean(), note: z.string() })
	),
	requiredRepairs: z.array(z.string())
});

export const ChainResolutionSchema = z.object({
	action: z.enum(['reuse_existing', 'update_existing', 'create_new', 'needs_review']),
	existingChainId: z.string().nullable(),
	compatibilityRationale: z.string(),
	identityStable: z.boolean()
});

export const RepairSchema = z.object({
	questions: LlmExtractionCandidateSchema.shape.questions
});

const FullChainRepairSchema = z.object({
	repairs: z.array(
		z.object({
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
				.optional()
		})
	)
});

const FullQuestionQualityRepairSchema = z.object({
	repairs: z.array(
		z.object({
			sourceQuestionRef: z.string(),
			selfContainedPromptText: z.string().nullable().optional(),
			contextText: z.string().nullable().optional(),
			response: createFullResponseSchema().nullable().optional(),
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
		})
	)
});

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
		extractedAt: z.string().nullable().optional()
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

const CompactMarkSchemeItemSchema = z.object({
	itemType: z.string(),
	text: z.string(),
	marks: z.number().nullable(),
	sourceRef: z.string().nullable(),
	confidence: z.number().nullable()
});

const CompactMarkChecklistItemSchema = z.object({
	text: z.string(),
	required: z.boolean(),
	markSchemeItemIndexes: z.array(z.number()),
	confidence: z.number().nullable(),
	needsHumanReview: z.boolean()
});

const CompactModelAnswerSchema = z
	.object({
		answerText: z.string(),
		confidence: z.number().nullable(),
		needsHumanReview: z.boolean()
	})
	.nullable();

export const LlmCompactFullPaperExtractionSchema = z.object({
	questions: z.array(
		z.object({
			id: z.string().nullable(),
			sourceQuestionRef: z.string(),
			parentSourceQuestionRef: z.string().nullable(),
			promptText: z.string(),
			selfContainedPromptText: z.string().nullable(),
			contextText: z.string().nullable(),
			commandWord: z.string().nullable(),
			marks: z.number().nullable(),
			pageStart: z.number().nullable(),
			pageEnd: z.number().nullable(),
			topicPath: z.array(z.string()),
			specRef: z.string().nullable(),
			response: createFullResponseSchema(),
			markSchemeItems: z.array(CompactMarkSchemeItemSchema),
			markChecklist: z.array(CompactMarkChecklistItemSchema),
			modelAnswer: CompactModelAnswerSchema,
			extractionConfidence: z.number().nullable(),
			needsHumanReview: z.boolean(),
			reviewNotes: z.array(z.string())
		})
	)
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
		repairRefs: repairs?.map((repair) => repair?.sourceQuestionRef).filter(Boolean).slice(0, 80)
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
	const { value } = await generateJsonWithTimeout({
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
	}, `extract-candidate:${sourceDocumentId}`);
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
	forceChunkCache = false,
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
			refs.add(`${compact[1]}.${compact[2]}`);
			continue;
		}
		const spaced = line.match(/^\s*(\d)\s+(\d)\s*\.\s*(\d{1,2})\b/);
		if (spaced) refs.add(`${spaced[1]}${spaced[2]}.${spaced[3]}`);
	}
	return [...refs].sort(compareQuestionRefs);
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

export function chunkImages(images, chunkPages = 6) {
	const chunks = [];
	for (let start = 0; start < images.length; start += chunkPages) {
		const coreImages = images.slice(start, Math.min(start + chunkPages, images.length));
		const lookaheadImages =
			start + chunkPages < images.length
				? images.slice(start + chunkPages, start + chunkPages + 1)
				: [];
		chunks.push({
			index: chunks.length,
			total: 0,
			coreImages,
			lookaheadImages,
			images: [...coreImages, ...lookaheadImages],
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
		['choice-table', 'matching', 'equation-blanks', 'number-line', 'image-label-zones'].includes(kind)
	) {
		output.correctAnswers ??= [];
	}
	return output;
}

function paragraphBlock(text) {
	const normalized = String(text ?? '').trim();
	return normalized ? [{ kind: 'paragraph', text: normalized }] : [];
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
	const promptText = question.promptText || question.selfContainedPromptText || question.sourceQuestionRef;
	const pageStart = compactNumber(question.pageStart, chunk?.corePages?.[0] ?? 1);
	const pageEnd = compactNumber(question.pageEnd, pageStart);
	const markSchemeItems = (question.markSchemeItems ?? []).map((item) => ({
		itemType: item.itemType || 'mark',
		text: item.text,
		marks: compactNumber(item.marks, null),
		sourceRef: item.sourceRef || question.sourceQuestionRef,
		confidence: compactConfidence(item.confidence)
	}));
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
		stemBlocks: paragraphBlock(question.contextText),
		leadBlocks: [],
		promptBlocks: paragraphBlock(promptText),
		response: compactResponse(question.response, compactNumber(question.marks, null)),
		afterResponseBlocks: [],
		assets: [],
		markSchemeItems,
		markChecklist: (question.markChecklist ?? []).map((item) => ({
			text: item.text,
			required: item.required !== false,
			markSchemeItemIndexes: item.markSchemeItemIndexes ?? [],
			confidence: compactConfidence(item.confidence),
			needsHumanReview: item.needsHumanReview === true
		})),
		modelAnswer: question.modelAnswer?.answerText
			? {
					answerText: question.modelAnswer.answerText,
					confidence: compactConfidence(question.modelAnswer.confidence),
					needsHumanReview: question.modelAnswer.needsHumanReview === true
				}
			: null,
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
		reviewNotes: question.reviewNotes ?? []
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
	return LlmFullPaperExtractionSchema.parse({
		extractionRun: {
			agentVersion: 'llm-extraction-pipeline-v2-compact',
			needsHumanReview: (value.questions ?? []).some((question) => question.needsHumanReview),
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
		questions: (value.questions ?? []).map((question, index) =>
			compactQuestionToFull(question, index, chunk)
		)
	});
}

function extractionSpecPrompt(extractionSpec) {
	const relevantHeadings = [
		'The reusable extraction entry points are scripts and library functions',
		'For normal PDFs, the CLI runs an independent rubric judge',
		'The production output shape is the import-shaped JSON'
	];
	const snippets = [];
	for (const heading of relevantHeadings) {
		const index = extractionSpec.indexOf(heading);
		if (index < 0) continue;
		snippets.push(extractionSpec.slice(index, index + 1400));
	}
	const excerpt = snippets.join('\n\n---\n\n').slice(0, 3500);
	return [
		'Vision-stage extraction contract: extract factual source evidence only. Do not generate answerChain fields in this stage.',
		excerpt ? `\nSpec excerpts:\n${excerpt}` : ''
	]
		.filter(Boolean)
		.join('\n');
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
	existingChainsText = '',
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
					chunk.lookaheadPages.length ?
						`Lookahead pages ${chunk.lookaheadPages.join(', ')} are context only. Use them only to finish the same atomic subquestion that began on a core page. Do not extract sibling subquestions, later subquestion numbers, or a whole parent question merely because the parent stem began on a core page.`
					:	'No lookahead pages are supplied for this chunk.',
					'If an atomic subquestion number/prompt first appears on a lookahead page, omit it from this chunk; it belongs to the next chunk.'
				].join(' ')
			: null,
		targetQuestionRef
			? `Target question: extract exactly sourceQuestionRef ${targetQuestionRef}. Do not extract any other subquestion from these pages.`
			: null,
		'Use the question paper page images and mark scheme text as source of truth. If mark scheme page images are supplied, use them to resolve tables or layout that text extraction may have flattened. Use supporting documents only to clarify examiner guidance, accepted alternatives, common mistakes, and review flags; never let them override the official question paper or mark scheme.',
		'Extract every independently marked subquestion. Do not create rows for unmarked parent stems. Carry parent context into contextText/selfContainedPromptText where needed.',
		'Return compact source-grounded question data. The script deterministically adds source-document metadata and render defaults. Preserve visible prompt text in promptText/contextText and use response objects for MCQ/tick boxes/matching/equation blanks/image labels/drawing boxes/written lines.',
		'Use only these response.kind values: none, lines, labeled-lines, number-line, choice, choice-table, matching, equation-blanks, asset-canvas, image-label-zones, drawing-box. For tick-one or multiple-choice boxes, use kind "choice" with options and response.correctAnswers.',
		'Preserve exact answer strings, worked values, table entries, and one-question facts in response.correctAnswers, markChecklist, and modelAnswer. Text-only chain repair depends on this evidence to create reusable answer chains later.',
		'',
		'Question paper:',
		sourceDocumentPrompt(questionPaper),
		'Mark scheme:',
		sourceDocumentPrompt(markScheme),
		supportingDocuments.length
			? ['Supporting documents:', ...supportingDocuments.map(sourceDocumentPrompt)].join('\n')
			: 'Supporting documents: none',
		assetManifestText ? ['Local asset manifest:', assetManifestText].join('\n') : null,
		existingChainsText
			? ['Existing answer chains for compatibility decisions:', existingChainsText].join('\n')
			: 'Existing answer chains: none supplied; create stable ids for genuinely new chains.',
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
	existingChainsText = '',
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
		existingChainsText,
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
	const { value } = await generateJsonWithTimeout({
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
		}, `extract-full-paper:${sourceDocumentId}:${targetQuestionRef ?? 'all'}`);
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
			const existing = questionsByRef.get(question.sourceQuestionRef);
			if (
				!existing ||
				(question.extractionConfidence ?? 0) > (existing.extractionConfidence ?? 0)
			) {
				questionsByRef.set(question.sourceQuestionRef, question);
			}
		}
	}
	return {
		...values[0],
		questions: Array.from(questionsByRef.values())
			.sort((a, b) => compareQuestionRefs(a.sourceQuestionRef, b.sourceQuestionRef))
			.map((question, index) => ({ ...question, displayOrder: index + 1 })),
		extractionRun: {
			...values[0].extractionRun,
			needsHumanReview: values.some((value) => value.extractionRun?.needsHumanReview),
			reviewNotes: values.flatMap((value) => value.extractionRun?.reviewNotes ?? []),
			chunkCount: values.length
		}
	};
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
		localAssetManifest: assetManifest
	};
	return FullPaperExtractionSchema.parse(sanitizeAnswerChainEvidenceIndexes(enriched));
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
	markSchemeImageMode = 'none',
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	mediaResolution = 'auto',
	extractionSpec,
	existingChainsText = '',
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
	const chunks = chunkImages(questionImages, chunkPages);
	const chunkCacheDir = path.join(outputRoot, sourceDocumentId, 'chunks');
	console.error(
		`[extract] ${sourceDocumentId}: question_pages=${questionImages.length} mark_scheme_pages=${markScheme.pageCount} mark_scheme_text_chars=${markSchemeText.length} mark_scheme_images=${markSchemeImages.length} chunks=${chunks.length}`
	);
	const values = [];
	for (const chunk of chunks) {
		const pageKey = chunk.corePages.length ? chunk.corePages.join('-') : `index-${chunk.index + 1}`;
		const chunkCachePath = path.join(
			chunkCacheDir,
			`chunk-${String(chunk.index + 1).padStart(3, '0')}-pages-${pageKey}.json`
		);
		if (!forceChunkCache && existsSync(chunkCachePath)) {
			console.error(
				`[extract] ${sourceDocumentId}: chunk ${chunk.index + 1}/${chunk.total} using cache ${relativePath(rootDir, chunkCachePath)}`
			);
			values.push(LlmFullPaperExtractionSchema.parse(readJson(chunkCachePath)));
			continue;
		}
			const coreQuestionText = pdfText(questionPaper.path, 20000, chunk.corePages);
			const coreQuestionRefs = questionRefsFromText(coreQuestionText);
			const chunkMarkSchemeText = markSchemeTextExcerptForRefs(markSchemeText, coreQuestionRefs);
			console.error(
				`[extract] ${sourceDocumentId}: chunk ${chunk.index + 1}/${chunk.total} question_pages=${chunk.images.map(pageNumberFromRenderedPath).join(',')} core_refs=${coreQuestionRefs.join(',') || 'none'} mark_scheme_text_chars=${chunkMarkSchemeText.length}`
			);
			const targetQuestionRefs = coreQuestionRefs.length ? coreQuestionRefs : [null];
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
						existingChainsText,
						extraInstructions,
						expectedQuestionCount: targetQuestionRef ? 1 : expectedQuestionCount,
						assetManifestText,
						targetQuestionRef
					});
				writeJson(targetCachePath, targetValue);
				chunkValues.push(targetValue);
			}
			const value = mergeFullPaperChunks(chunkValues);
			writeJson(chunkCachePath, value);
			values.push(value);
		}
	return enrichFullPaperExtraction({
		value: mergeFullPaperChunks(values),
		rootDir,
		model,
		dpi,
		questionPaper,
		markScheme,
		supportingDocuments,
		assetManifest
	});
}

export function deterministicCandidateIssues(candidate) {
	const findings = [];
	for (const question of candidate.questions ?? []) {
		const issues = [
			...answerChainSpecificityIssues(question.answerChain, {
				commandWord: question.commandWord
			}),
			...answerChainEvidenceIssues(question),
			...fixedResponseChainSpecificityIssues(question),
			...fixedResponseModelAnswerIssues(question),
			...writtenResponseModelAnswerIssues(question),
			...responseKeyIssues(question)
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

function positiveMarkSchemeItem(item) {
	return !/\b(allow|accept|guidance|alternative|ignore|reject|do[_ -]?not[_ -]?accept|do[_ -]?not[_ -]?credit)\b/i.test(
		String(item?.itemType ?? '')
	);
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
					message:
						'Answer-chain steps must reference existing positive mark-scheme items only.'
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
	const { value } = await generateJsonWithTimeout({
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
	}, `judge-golden:${fixture?.sourceDocumentId ?? candidate?.sourceDocumentId ?? 'candidate'}`);
	return value;
}

export async function judgeCandidateAgainstRubric({
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	candidate,
	deterministicIssues
}) {
	const { value } = await generateJsonWithTimeout({
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
	}, `judge-rubric:${candidate?.sourceDocumentId ?? 'candidate'}`);
	return value;
}

export async function repairCandidateAnswerChains({
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	candidate,
	deterministicIssues,
	judge = null
}) {
	const { value } = await generateJsonWithTimeout({
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
	}, `repair-candidate-chains:${candidate?.sourceDocumentId ?? 'candidate'}`);
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
	const { value } = await generateJsonWithTimeout({
		model,
		thinkingLevel,
		telemetry: false,
		input: [
			{
				role: 'system',
				content:
					'You repair answer-chain fields inside a GCSE extraction. Preserve all source extraction, render, response, mark scheme, checklist, and model answer evidence. Return only chain repairs keyed by sourceQuestionRef.'
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
					'Repair every listed chain that is too numeric, too topic-like, unsupported, or missing reusable method links. Keep prompt-specific worked values out of answerChain fields. Use markSchemeItemIndexes only for positive marking points; never point answer-chain steps at ignore, reject, do-not-accept, do-not-credit, or guidance rows. If an existing chain id remains compatible, keep that id for compatibility.',
					'If an issue code is chain_exact_fixed_answer_text, remove the exact fixed answer from every answerChain field, including title, canonicalChainText, summary, stepText, explanation, and commonOmission. For fixed-response recall, write a generic chain such as identifying the required category of term, placing it in the correct response position, and checking it matches the source cue; keep the actual answer words only in response.correctAnswers, markSchemeItems, markChecklist, or modelAnswer.'
				].join('\n')
			}
		],
		schema: FullChainRepairSchema
	}, `repair-full-paper-chains:${candidate?.sourceDocumentId ?? 'candidate'}:${sourceQuestionRefs?.join(',') ?? 'all'}`);
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
			markSchemeItems: question.markSchemeItems,
			markChecklist: question.markChecklist,
			modelAnswer: question.modelAnswer,
			currentAnswerChain: question.answerChain,
			currentChainResolution: question.chainResolution ?? null,
			commonWeakAnswers: question.commonWeakAnswers ?? []
		}));
	if (repairTasks.length === 0) return sanitizeAnswerChainEvidenceIndexes(candidate);
	const { value } = await generateJsonWithTimeout({
		model,
		thinkingLevel,
		telemetry: false,
		input: [
			{
				role: 'system',
				content:
					'You repair GCSE extraction quality for a small set of failed questions. Preserve source prompt, response schema, mark-scheme rows, source refs, and assets. Return only changed grading, model-answer, weak-answer, and answer-chain fields keyed by sourceQuestionRef.'
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
					'Keep exact answer strings, worked values, table entries, and one-question facts in response.correctAnswers, markChecklist, and modelAnswer, not in answerChain fields.'
				].join('\n')
			}
		],
		schema: FullQuestionQualityRepairSchema
	}, `repair-full-paper-quality:${candidate?.sourceDocumentId ?? 'candidate'}:${sourceQuestionRefs?.join(',') ?? 'all'}`);
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
				markSchemeItems: repair.markSchemeItems ?? question.markSchemeItems,
				answerChain: repair.answerChain ?? question.answerChain,
				chainResolution: repair.chainResolution ?? question.chainResolution,
				markChecklist: repair.markChecklist ?? question.markChecklist,
				modelAnswer: repair.modelAnswer ?? question.modelAnswer,
				commonWeakAnswers: repair.commonWeakAnswers ?? question.commonWeakAnswers
			};
		})
	});
}

export async function evaluateCandidate({
	candidate,
	fixture = null,
	judgeModel = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	minJudgeScore = 0.8,
	runJudge = true
}) {
	const deterministicIssues = deterministicCandidateIssues(candidate);
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
