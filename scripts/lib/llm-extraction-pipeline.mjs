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

export const DEFAULT_EXTRACTION_MODEL = 'chatgpt-gpt-5.5-fast';
export const DEFAULT_THINKING_LEVEL = 'xhigh';

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

export const RepairSchema = z.object({
	questions: LlmExtractionCandidateSchema.shape.questions
});

export function setupLlmEnv() {
	loadLocalEnv();
	process.env.CHATGPT_RESPONSES_WEBSOCKET_MODE = 'off';
	process.env.CHATGPT_RESPONSES_EXPERIMENTAL_HEADER = 'off';
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
		'For each atomic question, align mark-scheme evidence, a student-facing checklist, a concise model answer, and a reusable answerChain.',
		'Use only these answerChain stepRole values: given, cause, process, link, effect, evidence, method, calculation, conclusion.',
		'The answerChain is a reusable reasoning or method pattern across questions. It is not a worked solution to this one question.',
		'For calculation questions, keep prompt-specific numbers, substitutions, intermediate values, final numeric answers, and one-question units in modelAnswer, markChecklist, and markSchemeItems only. Do not put them in answerChain title, canonicalChainText, summary, stepText, explanation, or commonOmission.',
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
	const { value } = await generateJson({
		model,
		thinkingLevel,
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
	});
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

export function deterministicCandidateIssues(candidate) {
	const findings = [];
	for (const question of candidate.questions ?? []) {
		const issues = answerChainSpecificityIssues(question.answerChain, {
			commandWord: question.commandWord
		});
		if (!issues.length) continue;
		findings.push({
			sourceQuestionRef: question.sourceQuestionRef,
			chainId: question.answerChain?.id ?? null,
			issues
		});
	}
	return findings;
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
	const { value } = await generateJson({
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
	});
	return value;
}

export async function judgeCandidateAgainstRubric({
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	candidate,
	deterministicIssues
}) {
	const { value } = await generateJson({
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
					'Also check that modelAnswer and markChecklist keep the source-specific worked values needed to answer the question.',
					'Use score from 0 to 1. Return requiredRepairs for any chain that is too broad, too topic-like, too numeric, unsupported by mark evidence, or missing important method links.'
				].join('\n')
			}
		],
		schema: JudgeSchema
	});
	return value;
}

export async function repairCandidateAnswerChains({
	model = DEFAULT_EXTRACTION_MODEL,
	thinkingLevel = DEFAULT_THINKING_LEVEL,
	candidate,
	deterministicIssues,
	judge = null
}) {
	const { value } = await generateJson({
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
	});
	return { ...candidate, questions: value.questions };
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
	let candidate = await extractCandidateFromPdfPair({
		rootDir,
		questionPaperPath: questionPdf,
		markSchemePath: markSchemePdf,
		sourceDocumentId: fixture.sourceDocumentId,
		outputRoot: workDir,
		forceRender: true,
		model,
		thinkingLevel,
		extractionSpec,
		expectedQuestionCount: 1
	});
	let evaluation = await evaluateCandidate({
		candidate,
		fixture,
		judgeModel,
		thinkingLevel,
		minJudgeScore
	});
	for (let attempt = 0; evaluation.status !== 'passed' && attempt < repairAttempts; attempt += 1) {
		candidate = await repairCandidateAnswerChains({
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
	return { fixture, candidate: ExtractionCandidateSchema.parse(candidate), evaluation };
}
