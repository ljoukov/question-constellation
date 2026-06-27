#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
	blockingIssues,
	DEFAULT_EXTRACTION_MODEL,
	DEFAULT_THINKING_LEVEL,
	deterministicCandidateIssues,
	evaluateCandidate,
	extractFullPaperFromPdfSet,
	parsePageSelection,
	readJson,
	repairFullPaperAnswerChains,
	setupLlmEnv,
	writeJson
} from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/extract-paper-llm.mjs \\
  --question-paper=<question-paper.pdf> \\
  --mark-scheme=<mark-scheme.pdf> \\
  --source-document-id=<stable-source-id> \\
  --output=<candidate.json>

Preset:
node scripts/extract-paper-llm.mjs --preset=aqa-physics --paper=<source-id-or-component>
node scripts/extract-paper-llm.mjs --preset=aqa-physics --all
node scripts/extract-paper-llm.mjs --preset=aqa-separate-science --subject=<biology|chemistry|physics|all> --paper=<source-id-or-component>
node scripts/extract-paper-llm.mjs --preset=aqa-separate-science --all

Optional:
  --question-pages=1-3
  --mark-scheme-pages=4-5
  --supporting-document=<examiner-report-or-insert.pdf>
  --existing-chains=<json-or-md>
  --chunk-pages=6
  --expected-question-count=1
  --repair-attempts=1
  --judge-fixture=<golden-fixture.json>
  --skip-judge
  --dry-run
  --force
  --force-chunks
  --force-render
  --mark-scheme-image-mode=none|all
  --media-resolution=auto|low|medium|high|original
  --write-eval=<evaluation.json>
  --model=chatgpt-gpt-5.5
  --thinking-level=xhigh
  --repair-batch-size=1
  --llm-timeout-ms=600000
  --llm-max-attempts=2`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

setupLlmEnv();

const preset = stringArg('preset', '');
const model = stringArg('model', process.env.EXTRACTION_PIPELINE_MODEL ?? DEFAULT_EXTRACTION_MODEL);
const judgeModel = stringArg('judge-model', process.env.EXTRACTION_PIPELINE_JUDGE_MODEL ?? model);
const thinkingLevel = stringArg(
	'thinking-level',
	process.env.EXTRACTION_PIPELINE_THINKING_LEVEL ?? DEFAULT_THINKING_LEVEL
);
const dpi = integerArg('dpi', 160, 90);
const chunkPages = integerArg('chunk-pages', 6, 1);
const forceRender = hasArg('force-render') || hasArg('force');
const forceOutput = hasArg('force');
const forceChunkCache = hasArg('force-chunks');
const dryRun = hasArg('dry-run');
const markSchemeImageMode = stringArg('mark-scheme-image-mode', 'none');
if (!['none', 'all'].includes(markSchemeImageMode)) {
	throw new Error('--mark-scheme-image-mode must be none or all.');
}
const mediaResolution = stringArg('media-resolution', 'auto');
if (!['auto', 'low', 'medium', 'high', 'original'].includes(mediaResolution)) {
	throw new Error('--media-resolution must be auto, low, medium, high, or original.');
}
const questionPages = parsePageSelection(stringArg('question-pages', ''));
const markSchemePages = parsePageSelection(stringArg('mark-scheme-pages', ''));
const expectedQuestionCount = optionalIntegerArg('expected-question-count');
const repairAttempts = integerArg('repair-attempts', 0, 0);
const repairBatchSize = integerArg('repair-batch-size', 1, 1);
const llmTimeoutMs = optionalIntegerArg('llm-timeout-ms');
const llmMaxAttempts = optionalIntegerArg('llm-max-attempts');
const judgeFixturePath = stringArg('judge-fixture', '');
const writeEvalPath = stringArg('write-eval', '');
const extraInstructionsPath = stringArg('instructions', '');
const runJudge = !hasArg('skip-judge');
const supportingDocumentPaths = repeatedStringArg('supporting-document');
const existingChainsPath = stringArg('existing-chains', '');
const extractionSpec = readFileSync(path.join(rootDir, 'docs/extraction-spec.md'), 'utf8');
const extraInstructions = extraInstructionsPath ? readFileSync(extraInstructionsPath, 'utf8') : '';
const explicitExistingChainsText = existingChainsPath
	? readExistingChainsText(existingChainsPath)
	: '';

if (llmTimeoutMs) process.env.EXTRACTION_LLM_TIMEOUT_MS = String(llmTimeoutMs);
if (llmMaxAttempts) process.env.EXTRACTION_LLM_MAX_ATTEMPTS = String(llmMaxAttempts);

if (preset) {
	await runPreset(preset);
} else {
	await runGeneric();
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function repeatedStringArg(name) {
	const prefix = `--${name}=`;
	return process.argv
		.filter((candidate) => candidate.startsWith(prefix))
		.map((candidate) => candidate.slice(prefix.length))
		.filter(Boolean);
}

function requiredStringArg(name) {
	const value = stringArg(name, '');
	if (!value) throw new Error(`Pass --${name}=...\n\n${usage}`);
	return value;
}

function integerArg(name, defaultValue, minValue) {
	const value = stringArg(name, '');
	if (!value) return defaultValue;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minValue) {
		throw new Error(`--${name} must be an integer >= ${minValue}.`);
	}
	return parsed;
}

function optionalIntegerArg(name) {
	const value = stringArg(name, '');
	if (!value) return null;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(`--${name} must be a positive integer.`);
	}
	return parsed;
}

function readExistingChainsText(filePath) {
	if (!existsSync(filePath)) throw new Error(`Missing existing chains file: ${filePath}`);
	const raw = readFileSync(filePath, 'utf8');
	if (!filePath.endsWith('.json')) return raw.slice(0, 70000);
	const parsed = JSON.parse(raw);
	const chains = Array.isArray(parsed)
		? parsed
		: Array.isArray(parsed.answerChains)
			? parsed.answerChains
			: Array.isArray(parsed.answer_chains)
				? parsed.answer_chains
				: Array.isArray(parsed.questions)
					? parsed.questions.map((question) => question.answerChain).filter(Boolean)
					: parsed;
	return JSON.stringify(chains, null, 2).slice(0, 70000);
}

function assertInputFiles(filePaths, label) {
	for (const filePath of filePaths) {
		if (!existsSync(filePath)) throw new Error(`Missing ${label}: ${filePath}`);
	}
}

async function runGeneric() {
	const questionPaperPath = requiredStringArg('question-paper');
	const markSchemePath = requiredStringArg('mark-scheme');
	const sourceDocumentId = requiredStringArg('source-document-id');
	const outputPath = requiredStringArg('output');
	const markSchemeDocumentId = stringArg(
		'mark-scheme-document-id',
		sourceDocumentId.includes('-qp-')
			? sourceDocumentId.replace('-qp-', '-ms-')
			: `${sourceDocumentId}-mark-scheme`
	);
	assertInputFiles([questionPaperPath, markSchemePath, ...supportingDocumentPaths], 'input PDF');
	await runOne({
		questionPaperPath,
		markSchemePath,
		supportingDocumentPaths,
		sourceDocumentId,
		markSchemeDocumentId,
		outputPath,
		outputRoot: stringArg(
			'work-dir',
			path.join(rootDir, 'tmp/llm-extraction-pipeline', sourceDocumentId)
		),
		existingChainsText: explicitExistingChainsText,
		presetInstructions: ''
	});
}

async function runPreset(name) {
	if (name === 'aqa-physics') {
		await runAqaPhysicsPreset();
		return;
	}
	if (name === 'aqa-separate-science') {
		await runAqaSeparateSciencePreset();
		return;
	}
	throw new Error(`Unknown preset: ${name}`);
}

function refsNeedingRepair(candidate, evaluation) {
	const deterministic = deterministicCandidateIssues(candidate);
	const blocking = blockingIssues(deterministic);
	const refs = new Set(blocking.map((issue) => issue.sourceQuestionRef).filter(Boolean));
	if (refs.size > 0) return [...refs];
	const judgeRepairs = JSON.stringify(evaluation?.judge?.requiredRepairs ?? []);
	for (const question of candidate.questions ?? []) {
		if (judgeRepairs.includes(question.sourceQuestionRef)) refs.add(question.sourceQuestionRef);
	}
	if (refs.size > 0) return [...refs];
	return (candidate.questions ?? []).map((question) => question.sourceQuestionRef).filter(Boolean);
}

function chunks(values, size) {
	const result = [];
	for (let index = 0; index < values.length; index += size) {
		result.push(values.slice(index, index + size));
	}
	return result;
}

function filterDeterministicIssuesForRefs(deterministicIssues, refs) {
	const allowed = new Set(refs);
	return (deterministicIssues ?? []).filter((finding) => allowed.has(finding.sourceQuestionRef));
}

async function repairFailedQuestionBatches({
	model,
	thinkingLevel,
	candidate,
	evaluation,
	judge,
	existingChainsText,
	repairCacheDir
}) {
	let repaired = candidate;
	const refs = refsNeedingRepair(candidate, evaluation);
	for (const batchRefs of chunks(refs, repairBatchSize)) {
		const refsToRepair = [];
		for (const ref of batchRefs) {
			const cachePath = path.join(repairCacheDir, `repair-${slugify(ref)}.json`);
			if (existsSync(cachePath)) {
				console.error(`[extract-cli] repair cache ${ref}`);
				repaired = applyQuestionRepair(repaired, readJson(cachePath));
			} else {
				refsToRepair.push(ref);
			}
		}
		if (refsToRepair.length === 0) continue;
		console.error(`[extract-cli] repairing refs ${refsToRepair.join(', ')}`);
		repaired = await repairFullPaperAnswerChains({
			model,
			thinkingLevel,
			candidate: repaired,
			deterministicIssues: filterDeterministicIssuesForRefs(
				deterministicCandidateIssues(repaired),
				refsToRepair
			),
			judge,
			existingChainsText,
			sourceQuestionRefs: refsToRepair
		});
		for (const ref of refsToRepair) {
			const question = repaired.questions.find(
				(candidateQuestion) => candidateQuestion.sourceQuestionRef === ref
			);
			if (!question) continue;
			writeJson(path.join(repairCacheDir, `repair-${slugify(ref)}.json`), {
				sourceQuestionRef: ref,
				answerChain: question.answerChain,
				chainResolution: question.chainResolution ?? null,
				commonWeakAnswers: question.commonWeakAnswers ?? []
			});
		}
	}
	return repaired;
}

function applyQuestionRepair(candidate, repair) {
	return {
		...candidate,
		questions: candidate.questions.map((question) => {
			if (question.sourceQuestionRef !== repair.sourceQuestionRef) return question;
			return {
				...question,
				answerChain: repair.answerChain ?? question.answerChain,
				chainResolution: repair.chainResolution ?? question.chainResolution,
				commonWeakAnswers: repair.commonWeakAnswers ?? question.commonWeakAnswers
			};
		})
	};
}

async function runAqaPhysicsPreset() {
	const papers = discoverAqaPhysicsPapers();
	const paperArg = stringArg('paper', '');
	const all = hasArg('all');
	if (!paperArg && !all) throw new Error('Pass --paper=<source-id-or-component> or --all.');
	const selected = all
		? papers
		: papers.filter(
				(paper) => paper.sourceDocumentId === paperArg || paper.componentCode === paperArg
			);
	if (!selected.length) throw new Error(`No AQA Physics paper matched ${paperArg}.`);
	const taxonomyPath = path.join(rootDir, 'docs/physics-chain-family-taxonomy.md');
	const taxonomyText = existsSync(taxonomyPath) ? readFileSync(taxonomyPath, 'utf8') : '';
	const outputRoot = stringArg(
		'output-root',
		path.join(rootDir, 'data/vision-extracted/aqa-combined-science-trilogy-higher/physics')
	);
	for (const paper of selected) {
		await runOne({
			questionPaperPath: paper.questionPaperPath,
			markSchemePath: paper.markSchemePath,
			supportingDocumentPaths,
			sourceDocumentId: paper.sourceDocumentId,
			markSchemeDocumentId: paper.markSchemeDocumentId,
			outputPath: stringArg('output', path.join(outputRoot, `${paper.sourceDocumentId}.json`)),
			outputRoot: path.join(rootDir, 'tmp/llm-extraction-pipeline/aqa-physics'),
			existingChainsText: [taxonomyText, explicitExistingChainsText].filter(Boolean).join('\n\n'),
			presetInstructions: [
				'Preset metadata:',
				'Board: AQA',
				'Qualification: GCSE',
				'Subject: Combined Science',
				'Subject area: Physics',
				'Tier: Higher',
				`Paper: ${paper.paper}`,
				`Component code: ${paper.componentCode}`,
				`Series: ${paper.series}`,
				`Year: ${paper.year}`
			].join('\n'),
			assetManifest: assetManifest(paper.sourceDocumentId),
			assetManifestText: compactAssetManifestText(assetManifest(paper.sourceDocumentId)),
			documentMetadata: {
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Combined Science',
				subjectArea: 'Physics',
				tier: 'Higher',
				paper: paper.paper,
				componentCode: paper.componentCode,
				series: paper.series,
				year: paper.year,
				questionPaperTitle: titleForQuestionPaper(paper.componentCode, paper.series),
				markSchemeTitle: titleForMarkScheme(paper.componentCode, paper.series)
			}
		});
	}
}

async function runAqaSeparateSciencePreset() {
	const subjectArg = stringArg('subject', 'all').toLowerCase();
	const papers = discoverAqaSeparateSciencePapers().filter(
		(paper) => subjectArg === 'all' || paper.subjectArea.toLowerCase() === subjectArg
	);
	const paperArg = stringArg('paper', '');
	const all = hasArg('all');
	if (!paperArg && !all) {
		throw new Error('Pass --paper=<source-id-or-component>, --all, and optionally --subject=...');
	}
	const selected = all
		? papers
		: papers.filter(
				(paper) => paper.sourceDocumentId === paperArg || paper.componentCode === paperArg
			);
	if (!selected.length) throw new Error(`No AQA Separate Science paper matched ${paperArg}.`);
	const outputRoot = stringArg(
		'output-root',
		path.join(rootDir, 'data/vision-extracted/aqa-separate-science-higher')
	);
	for (const paper of selected) {
		const taxonomyText = taxonomyForSubject(paper.subjectArea);
		const subjectSlug = slugify(paper.subjectArea);
		await runOne({
			questionPaperPath: paper.questionPaperPath,
			markSchemePath: paper.markSchemePath,
			supportingDocumentPaths: [...paper.supportingDocumentPaths, ...supportingDocumentPaths],
			sourceDocumentId: paper.sourceDocumentId,
			markSchemeDocumentId: paper.markSchemeDocumentId,
			outputPath: stringArg(
				'output',
				path.join(outputRoot, subjectSlug, `${paper.sourceDocumentId}.json`)
			),
			outputRoot: path.join(rootDir, 'tmp/llm-extraction-pipeline/aqa-separate-science'),
			existingChainsText: [taxonomyText, explicitExistingChainsText].filter(Boolean).join('\n\n'),
			presetInstructions: [
				'Preset metadata:',
				'Board: AQA',
				'Qualification: GCSE',
				`Subject: ${paper.subject}`,
				`Subject area: ${paper.subjectArea}`,
				'Tier: Higher',
				`Paper: ${paper.paper}`,
				`Component code: ${paper.componentCode}`,
				`Series: ${paper.series}`,
				`Year: ${paper.year}`,
				'This is AQA Separate Science, not Combined Science Trilogy.'
			].join('\n'),
			documentMetadata: {
				board: 'AQA',
				qualification: 'GCSE',
				subject: paper.subject,
				subjectArea: paper.subjectArea,
				tier: 'Higher',
				paper: paper.paper,
				componentCode: paper.componentCode,
				series: paper.series,
				year: paper.year,
				questionPaperTitle: paper.questionPaperTitle,
				markSchemeTitle: paper.markSchemeTitle,
				questionPaper: { sourceUrl: paper.questionPaperUrl },
				markScheme: { sourceUrl: paper.markSchemeUrl },
				supportingDocuments: paper.supportingDocuments
			}
		});
	}
}

async function runOne({
	questionPaperPath,
	markSchemePath,
	supportingDocumentPaths,
	sourceDocumentId,
	markSchemeDocumentId,
	outputPath,
	outputRoot,
	existingChainsText,
	presetInstructions,
	assetManifest = [],
	assetManifestText = '',
	documentMetadata = {}
}) {
	if (existsSync(outputPath) && !forceOutput) {
		console.log(`skip existing ${path.relative(rootDir, outputPath)}; pass --force to overwrite`);
		return;
	}
	if (dryRun) {
		console.log(
			JSON.stringify(
				{
					sourceDocumentId,
					markSchemeDocumentId,
					questionPaperPath,
					markSchemePath,
					supportingDocumentPaths,
					outputPath,
					model,
					judgeModel,
					thinkingLevel,
					runJudge
				},
				null,
				2
			)
		);
		return;
	}
	console.error(
		`[extract-cli] ${sourceDocumentId}: extracting ${path.relative(rootDir, questionPaperPath)}`
	);
	let candidate = await extractFullPaperFromPdfSet({
		rootDir,
		questionPaperPath,
		markSchemePath,
		supportingDocumentPaths,
		sourceDocumentId,
		markSchemeDocumentId,
		outputRoot,
		dpi,
		forceRender,
		forceChunkCache,
		questionPages,
		markSchemePages,
		chunkPages,
		model,
		thinkingLevel,
		markSchemeImageMode,
		mediaResolution,
		extractionSpec,
		existingChainsText,
		extraInstructions: [presetInstructions, extraInstructions].filter(Boolean).join('\n\n'),
		expectedQuestionCount,
		assetManifest,
		assetManifestText,
		documentMetadata
	});
	console.error(
		`[extract-cli] ${sourceDocumentId}: extracted ${candidate.questions.length} questions`
	);
	console.error(`[extract-cli] ${sourceDocumentId}: evaluating`);
	let evaluation = await evaluateCandidate({
		candidate,
		fixture: judgeFixturePath ? readJson(judgeFixturePath) : null,
		judgeModel,
		thinkingLevel,
		runJudge
	});
	for (let attempt = 0; evaluation.status !== 'passed' && attempt < repairAttempts; attempt += 1) {
		console.error(`[extract-cli] ${sourceDocumentId}: repairing attempt ${attempt + 1}`);
		candidate = await repairFailedQuestionBatches({
			model,
			thinkingLevel,
			candidate,
				evaluation,
				judge: evaluation.judge,
				existingChainsText,
				repairCacheDir: path.join(outputRoot, sourceDocumentId, 'repairs')
			});
		evaluation = await evaluateCandidate({
			candidate,
			fixture: judgeFixturePath ? readJson(judgeFixturePath) : null,
			judgeModel,
			thinkingLevel,
			runJudge
		});
	}
	console.error(`[extract-cli] ${sourceDocumentId}: writing ${path.relative(rootDir, outputPath)}`);
	writeJson(outputPath, candidate);
	if (writeEvalPath) writeJson(writeEvalPath, evaluation);
	console.log(
		JSON.stringify(
			{
				status: evaluation.status,
				output: path.relative(rootDir, outputPath),
				evaluation: writeEvalPath ? path.relative(rootDir, writeEvalPath) : null,
				sourceDocumentId,
				questions: candidate.questions.length,
				supportingDocuments: supportingDocumentPaths.length,
				model,
				judgeModel,
				thinkingLevel,
				runJudge,
				deterministicBlockingIssues: evaluation.deterministicBlockingIssues.length,
				mechanicalErrors: evaluation.mechanicalErrors.length,
				judgeVerdict: evaluation.judge?.verdict ?? null,
				judgeScore: evaluation.judge?.score ?? null
			},
			null,
			2
		)
	);
	if (evaluation.status !== 'passed') process.exit(1);
}

function parsePaperFilename(fileName) {
	const match = fileName.match(/^AQA-(8464P[12]H)-QP-([A-Z]{3}\d{2})\.PDF$/i);
	if (!match) return null;
	const componentCode = match[1].toUpperCase();
	const seriesCode = match[2].toUpperCase();
	return {
		componentCode,
		seriesCode,
		sourceDocumentId: `aqa-${componentCode.toLowerCase()}-qp-${seriesCode.toLowerCase()}`
	};
}

function parseSeries(seriesCode) {
	const monthCode = seriesCode.slice(0, 3).toUpperCase();
	const year = 2000 + Number(seriesCode.slice(3));
	const month = monthCode === 'JUN' ? 'June' : monthCode === 'NOV' ? 'November' : monthCode;
	return { month, year, series: `${month} ${year}` };
}

function paperLabel(componentCode) {
	return componentCode.includes('P1') ? 'Physics Paper 1' : 'Physics Paper 2';
}

function slugify(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function titleForQuestionPaper(componentCode, series) {
	return `Question paper (Higher): ${paperLabel(componentCode)} - ${series}`;
}

function titleForMarkScheme(componentCode, series) {
	return `Mark scheme (Higher): ${paperLabel(componentCode)} - ${series}`;
}

function discoverAqaPhysicsPapers() {
	const dataRoot = path.join(rootDir, 'data/aqa-combined-science-trilogy-higher');
	const questionPaperDir = path.join(dataRoot, 'question-papers');
	const markSchemeDir = path.join(dataRoot, 'mark-schemes');
	const files = new Set(readdirSync(markSchemeDir));
	return readdirSync(questionPaperDir)
		.sort()
		.map((fileName) => {
			const parsed = parsePaperFilename(fileName);
			if (!parsed) return null;
			const markSchemeFile =
				[
					`AQA-${parsed.componentCode}-MS-${parsed.seriesCode}.PDF`,
					`AQA-${parsed.componentCode}-W-MS-${parsed.seriesCode}.PDF`
				].find((candidate) => files.has(candidate)) ?? null;
			if (!markSchemeFile) return null;
			const { series, year } = parseSeries(parsed.seriesCode);
			return {
				...parsed,
				questionPaperPath: path.join(questionPaperDir, fileName),
				markSchemePath: path.join(markSchemeDir, markSchemeFile),
				markSchemeDocumentId: parsed.sourceDocumentId.replace('-qp-', '-ms-'),
				paper: paperLabel(parsed.componentCode),
				series,
				year
			};
		})
		.filter(Boolean);
}

function discoverAqaSeparateSciencePapers() {
	const dataRoot = path.join(rootDir, 'data/aqa-separate-science-higher');
	const manifestPath = path.join(dataRoot, 'manifest.json');
	if (!existsSync(manifestPath)) {
		throw new Error(
			`Missing AQA Separate Science manifest at ${path.relative(rootDir, manifestPath)}. Run pnpm run download:aqa-separate-science first.`
		);
	}
	const manifest = readJson(manifestPath);
	const questionPaperDir = path.join(dataRoot, 'question-papers');
	const markSchemeDir = path.join(dataRoot, 'mark-schemes');
	const supportingDir = path.join(dataRoot, 'supporting-documents');
	return (manifest.rows ?? []).map((row) => ({
		sourceDocumentId: row.source_document_id,
		markSchemeDocumentId: row.mark_scheme_document_id,
		componentCode: row.component,
		questionPaperPath: path.join(questionPaperDir, row.question_paper.filename),
		markSchemePath: path.join(markSchemeDir, row.mark_scheme.filename),
		supportingDocumentPaths: (row.supporting_documents ?? []).map((document) =>
			path.join(supportingDir, document.filename)
		),
		subject: row.subject,
		subjectArea: row.subject_area ?? row.subject,
		paper: row.paper,
		series: row.series,
		year: row.year,
		questionPaperTitle: row.question_paper.title,
		markSchemeTitle: row.mark_scheme.title,
		questionPaperUrl: row.question_paper.url,
		markSchemeUrl: row.mark_scheme.url,
		supportingDocuments: (row.supporting_documents ?? []).map((document) => ({
			docType: document.filename.includes('-INS-') ? 'insert' : 'supporting_document',
			title: document.title,
			sourceUrl: document.url
		}))
	}));
}

function taxonomyForSubject(subjectArea) {
	const fileName = `${slugify(subjectArea)}-chain-family-taxonomy.md`;
	const filePath = path.join(rootDir, 'docs', fileName);
	return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function assetManifest(sourceDocumentId) {
	const dir = path.join(
		rootDir,
		'data/aqa-combined-science-trilogy-higher/assets/question-papers',
		sourceDocumentId
	);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((fileName) => /\.(png|jpe?g|webp)$/i.test(fileName))
		.sort()
		.map((fileName) => {
			const page = Number(fileName.match(/^image-(\d{3})-/i)?.[1] ?? 0) || null;
			const filePath = path.join(dir, fileName);
			return {
				page,
				fileName,
				filePath: path.relative(rootDir, filePath).split(path.sep).join('/'),
				publicPath: `/images/papers/${sourceDocumentId}/${fileName}`,
				r2Key: `images/papers/${sourceDocumentId}/${fileName}`
			};
		});
}

function compactAssetManifestText(assets) {
	if (!assets.length) return 'No extracted local image assets found for this paper.';
	return assets
		.map(
			(asset) =>
				`page ${asset.page ?? 'unknown'}: ${asset.fileName} -> ${asset.publicPath} (${asset.r2Key})`
		)
		.join('\n');
}
