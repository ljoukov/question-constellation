#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';
import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';

const rootDir = process.cwd();
loadDefaultEnv(rootDir);

const usage = `Usage:
node scripts/run-codex-pdf-extraction.mjs \\
  --question-paper=<official-question-paper.pdf> \\
  --mark-scheme=<official-mark-scheme.pdf> \\
  --source-document-id=<stable-source-id>

Optional:
  --mark-scheme-document-id=<stable-mark-scheme-id>
  --supporting-document=<insert-or-examiner-report.pdf>
  --board=AQA
  --qualification=GCSE
  --subject=Biology|Chemistry|Physics
  --subject-area=Biology|Chemistry|Physics
  --tier=Higher
  --paper-label="Biology Paper 1"
  --component-code=84611H
  --series="November 2020"
  --year=2020
  --question-paper-title="Question paper (Higher) : Paper 1 - November 2020"
  --mark-scheme-title="Mark scheme (Higher) : Paper 1 - November 2020"
  --question-paper-url=<official-source-url>
  --mark-scheme-url=<official-source-url>
  --expected-marks=100
  --expected-questions=46
  --work-dir=tmp/codex-pdf-extraction/<source-id>
  --output=tmp/codex-pdf-extraction/<source-id>/normalized-extraction.json
  --summary=tmp/codex-pdf-extraction/<source-id>/codex-extraction-summary.json
  --model=gpt-5.5
  --thinking-level=high
  --timeout-ms=7200000
  --force
  --dry-run`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const sourceDocumentId = requiredStringArg('source-document-id');
const questionPaperPath = path.resolve(rootDir, requiredStringArg('question-paper'));
const markSchemePath = path.resolve(rootDir, requiredStringArg('mark-scheme'));
const markSchemeDocumentId = stringArg(
	'mark-scheme-document-id',
	sourceDocumentId.includes('-qp-')
		? sourceDocumentId.replace('-qp-', '-ms-')
		: `${sourceDocumentId}-mark-scheme`
);
const supportingDocumentPaths = repeatedStringArg('supporting-document').map((filePath) =>
	path.resolve(rootDir, filePath)
);
const workDir = path.resolve(
	rootDir,
	stringArg('work-dir', path.join('tmp/codex-pdf-extraction', sourceDocumentId))
);
const outputPath = path.resolve(
	rootDir,
	stringArg('output', path.join(workDir, 'normalized-extraction.json'))
);
const summaryPath = path.resolve(rootDir, stringArg('summary', path.join(workDir, 'codex-summary.json')));
const model = stringArg('model', 'gpt-5.5');
const thinkingLevel = stringArg('thinking-level', 'high');
const timeoutMs = integerArg('timeout-ms', 7_200_000, 1);
const expectedMarks = integerArg('expected-marks', 100, 1);
const expectedQuestions = integerArg('expected-questions', null, 1);
const dryRun = hasArg('dry-run');
const force = hasArg('force');

for (const filePath of [questionPaperPath, markSchemePath, ...supportingDocumentPaths]) {
	if (!existsSync(filePath)) throw new Error(`Input file does not exist: ${filePath}`);
}

const plan = {
	sourceDocumentId,
	questionPaperPath: relative(questionPaperPath),
	markSchemePath: relative(markSchemePath),
	supportingDocumentPaths: supportingDocumentPaths.map(relative),
	workDir: relative(workDir),
	outputPath: relative(outputPath),
	summaryPath: relative(summaryPath),
	model,
	thinkingLevel,
	expectedMarks,
	expectedQuestions
};

if (dryRun) {
	console.log(JSON.stringify({ status: 'dry-run', plan }, null, 2));
	process.exit(0);
}

prepareWorkDir();
const prompt = buildExtractionPrompt();
writeFileSync(path.join(workDir, 'prompt.md'), prompt);

const startedAt = new Date().toISOString();
let codexSummary = null;
try {
	codexSummary = await runCodexSdkTurn({
		prompt,
		workDir,
		eventsPath: path.join(workDir, 'events.jsonl'),
		lastMessagePath: path.join(workDir, 'last-message.txt'),
		summaryPath: path.join(workDir, 'codex-run-summary.json'),
		model,
		thinkingLevel,
		timeoutMs
	});
	const normalizedPath = ensureNormalizedExtraction();
	const validation = validateExtraction(normalizedPath);
	mkdirSync(path.dirname(outputPath), { recursive: true });
	copyFileSync(normalizedPath, outputPath);
	const summary = {
		status: 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		codex: codexSummary,
		validation,
		artifacts: artifacts(normalizedPath)
	};
	writeJson(summaryPath, summary);
	console.log(JSON.stringify(summary, null, 2));
} catch (error) {
	const summary = {
		status: 'failed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		codex: codexSummary,
		error: error instanceof Error ? error.message : String(error),
		artifacts: artifacts(path.join(workDir, 'normalized-extraction.json'))
	};
	writeJson(summaryPath, summary);
	console.error(JSON.stringify(summary, null, 2));
	process.exit(1);
}

function prepareWorkDir() {
	if (existsSync(workDir)) {
		if (!force) {
			throw new Error(`Work dir already exists; pass --force to replace it: ${relative(workDir)}`);
		}
		rmSync(workDir, { recursive: true, force: true });
	}
	mkdirSync(workDir, { recursive: true });
	copyFileSync(questionPaperPath, path.join(workDir, 'question-paper.pdf'));
	copyFileSync(markSchemePath, path.join(workDir, 'mark-scheme.pdf'));
	supportingDocumentPaths.forEach((filePath, index) => {
		copyFileSync(filePath, path.join(workDir, `supporting-${String(index + 1).padStart(2, '0')}.pdf`));
	});
	copyFileSync(path.join(rootDir, 'scripts/codex-import-helper.mjs'), path.join(workDir, 'helper.mjs'));
	writeJson(path.join(workDir, 'metadata.json'), metadata());
}

function metadata() {
	const common = {
		board: stringArg('board', 'AQA'),
		qualification: stringArg('qualification', 'GCSE'),
		subject: stringArg('subject', ''),
		subjectArea: stringArg('subject-area', stringArg('subject', '')),
		tier: stringArg('tier', 'Higher'),
		paper: stringArg('paper-label', ''),
		componentCode: stringArg('component-code', ''),
		series: stringArg('series', ''),
		year: integerArg('year', null, 0)
	};
	return {
		sourceDocumentId,
		markSchemeDocumentId,
		codexModel: model,
		questionPaper: {
			id: sourceDocumentId,
			docType: 'question_paper',
			...common,
			title: stringArg('question-paper-title', sourceDocumentId),
			sourceUrl: stringArg('question-paper-url', ''),
			path: 'question-paper.pdf',
			originalPath: questionPaperPath
		},
		markScheme: {
			id: markSchemeDocumentId,
			docType: 'mark_scheme',
			...common,
			title: stringArg('mark-scheme-title', markSchemeDocumentId),
			sourceUrl: stringArg('mark-scheme-url', ''),
			path: 'mark-scheme.pdf',
			originalPath: markSchemePath
		},
		supportingDocuments: supportingDocumentPaths.map((filePath, index) => ({
			id: `${sourceDocumentId}-support-${index + 1}`,
			docType: 'supporting_document',
			title: path.basename(filePath),
			path: `supporting-${String(index + 1).padStart(2, '0')}.pdf`,
			originalPath: filePath
		}))
	};
}

function buildExtractionPrompt() {
	const fragileLineNote =
		sourceDocumentId === 'aqa-84611h-qp-nov20'
			? '\nKnown fragile check: for Biology Paper 1 November 2020, verify Q07 answer-line counts visually, especially 07.1 and 07.3, before final validation.'
			: '';
	const expectedQuestionLine =
		expectedQuestions === null
			? 'Infer the exact atomic question count from the official question paper and mark scheme.'
			: `The expected atomic question count is ${expectedQuestions}; investigate and explain/fix any mismatch.`;
	return `You are running an official-PDF GCSE extraction in an isolated work directory.

Inputs in this directory:
- question-paper.pdf: official question paper
- mark-scheme.pdf: official mark scheme
- supporting-XX.pdf files if present
- helper.mjs: deterministic helper operations and validation
- metadata.json: stable document metadata

Do not run git, do not inspect the repository, do not use the web, and do not assume any precomputed question-paper.txt, mark-scheme.txt, OCR dump, or historical benchmark text exists. Start from the PDFs. You may create local working text/layout/image artifacts from the PDFs as observations.

Task: extract the whole paper into structured JSON for downstream import. Focus only on question extraction and mark-scheme extraction/alignment. Do not create final answer chains; leave answerChain absent or placeholder-like. A separate Codex run will reconcile answer chains.

Required extraction coverage:
- Atomic sourceQuestionRef values, parentSourceQuestionRef, displayOrder, pageStart/pageEnd, marks, command words, prompt text, self-contained prompt text, context/stem/lead/prompt blocks, response controls, response-line counts, assets, figure/table dependencies, formulae/equations, markSchemeItems, markChecklist, modelAnswer or fixed response answer keys, review flags, and provenance notes.
- ${expectedQuestionLine}
- Expected mark total: ${expectedMarks}.
- Omit withdrawn questions, replacement notices, statistics-only rows, mean-mark rows, and anything lacking the original prompt plus positive marking criteria.
- Every atomic question must be usable as a learner-facing question. When the printed prompt uses referential wording such as "this investigation", "these data", "the mAbs", "the anomalous result", "other factors", "the sample", "the treatment", "the graph", "Figure/Table is repeated", or similar, include the exact surrounding parent/source stem that defines the reference in contextText, stemBlocks, and selfContainedPromptText.
- For multipart questions, do not rely on a later renderer or judge to rediscover parent context from the PDF. Carry the exact source setup forward to every subpart that needs it, especially investigation descriptions, study/survey setup, graph/table captions and units, figure definitions, named treatments/organisms, and preceding sentences that define abbreviations.
- For fixed responses, store exact answers only in response.correctAnswers, markSchemeItems, markChecklist, or modelAnswer as appropriate.
- Use only app response kinds: none, lines, labeled-lines, number-line, choice, choice-table, matching, equation-blanks, asset-canvas, image-label-zones, drawing-box.
- Chemistry equations, ionic formulae, state symbols, subscripts/superscripts, charges, physics formulae, fractions, units, and rearranged equations must be verified visually through rendered pages or embedded-image inspection, not trusted to OCR/plain text alone.
- OCR is fallback only. Prefer PDF text layer for exact printed text, rendered pages/contact sheets for layout, embedded-image extraction for figures/tables, and geometry/rendered checks for answer lines.
${fragileLineNote}

Useful helper commands:
- node helper.mjs pdf-info --pdf=question-paper.pdf --output=question-paper.info.json
- node helper.mjs pdftotext-pages --pdf=question-paper.pdf --pages=2-4 --output=qp-pages-2-4.txt
- node helper.mjs render-pages --pdf=question-paper.pdf --pages=1-4 --dpi=180 --output-dir=qp-pages
- node helper.mjs extract-embedded-images --pdf=question-paper.pdf --output-dir=qp-images --manifest=qp-images.json
- node helper.mjs contact-sheet --glob='qp-pages/*.png' --output=qp-contact.jpg --thumb=220x310 --columns=4
- node helper.mjs line-count --image=qp-pages/page-03.png --crop=x,y,width,height --output=q-lines.json
- node helper.mjs normalize-extraction --input=extraction.json --output=normalized-extraction.json --metadata=metadata.json
- node helper.mjs validate-extraction --input=normalized-extraction.json --expected-marks=${expectedMarks}${
		expectedQuestions === null ? '' : ` --expected-questions=${expectedQuestions}`
	} --output=validation.json

Write extraction.json first. Then run normalize-extraction and validate-extraction. If validation fails, repair extraction.json or normalized-extraction.json and rerun validation until validation.json passes or a genuine source defect remains. A passing run should leave:
- extraction.json
- normalized-extraction.json
- validation.json

Finish with a concise final message listing question count, mark total, any unresolved review refs, and artifact paths.`;
}

function ensureNormalizedExtraction() {
	const normalizedPath = path.join(workDir, 'normalized-extraction.json');
	if (existsSync(normalizedPath)) return normalizedPath;
	if (!existsSync(path.join(workDir, 'extraction.json'))) {
		throw new Error('Codex did not write extraction.json.');
	}
	runHelper([
		'normalize-extraction',
		'--input=extraction.json',
		'--output=normalized-extraction.json',
		'--metadata=metadata.json'
	]);
	return normalizedPath;
}

function validateExtraction(normalizedPath) {
	const args = [
		'validate-extraction',
		`--input=${path.basename(normalizedPath)}`,
		`--expected-marks=${expectedMarks}`,
		'--output=validation.json'
	];
	if (expectedQuestions !== null) args.push(`--expected-questions=${expectedQuestions}`);
	runHelper(args);
	return readJson(path.join(workDir, 'validation.json'));
}

function runHelper(args) {
	const result = spawnSync(process.execPath, ['helper.mjs', ...args], {
		cwd: workDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 64 * 1024 * 1024
	});
	if (result.status !== 0) {
		throw new Error(
			`helper ${args[0]} failed with exit code ${result.status ?? result.signal}.\n${result.stdout}\n${result.stderr}`
		);
	}
	if (result.stdout.trim()) process.stderr.write(result.stdout);
	if (result.stderr.trim()) process.stderr.write(result.stderr);
}

function artifacts(normalizedPath) {
	return {
		workDir: relative(workDir),
		events: relative(path.join(workDir, 'events.jsonl')),
		prompt: relative(path.join(workDir, 'prompt.md')),
		rawExtraction: relative(path.join(workDir, 'extraction.json')),
		normalizedExtraction: relative(normalizedPath),
		validation: relative(path.join(workDir, 'validation.json')),
		output: relative(outputPath),
		summary: relative(summaryPath)
	};
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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
	const raw = stringArg(name, '');
	if (!raw) return defaultValue;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer >= ${minValue}.`);
	}
	return value;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}
