#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const summaryPath = path.resolve(
	rootDir,
	stringArg('summary', path.join(workDir, 'codex-summary.json'))
);
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
		copyFileSync(
			filePath,
			path.join(workDir, `supporting-${String(index + 1).padStart(2, '0')}.pdf`)
		);
	});
	copyFileSync(
		path.join(rootDir, 'scripts/codex-import-helper.mjs'),
		path.join(workDir, 'helper.mjs')
	);
	copyFileSync(
		path.join(rootDir, 'scripts/codex-pdf-tools.sh'),
		path.join(workDir, 'pdf-tools.sh')
	);
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
			? [
					'',
					'Known fragile checks for Biology Paper 1 November 2020: verify response controls and figure crops from rendered pages before final validation.',
					'Exact line-count expectations from rendered source/judge evidence are: 01.2 = 4, 01.3 = 4 including the final X answer line, 01.5 = 2, 01.6 = 2, 01.7 = 1, 01.8 = 2, 02.1 = 4, 02.3 = 14, 02.4 = 1, 02.5 = 6 with one Name of process line plus five Explanation lines, 03.1 = 2, 03.2 = 6, 03.3 = 5 including the final Ratio = 1 : line, 03.4 = 1, 03.6 = 8 total with Stage 1 = 4 / Stage 2 = 2 / Stage 3 = 2, 04.2 = 7, 04.3 = 2, 04.4 = 6, 04.5 = 4, 04.6 = 4, 04.7 = 6, 04.8 = 2, 05.1 = 1, 05.2 = 2, 05.3 = 1, 05.4 = 12 total across the two reason/explanation fields, 05.5 = 5, 05.6 = 5, 06.1 = 4, 06.2 = 5 including the final Percentage decrease answer line, 06.3 = 5 including the final Relative risk answer line, 06.4 = 6, 06.5 = 4, 06.6 = 2, 06.7 = 10, 07.1 = 7, 07.2 = 4, 07.3 = 16, and 07.4 = 3. If your extraction undercounts any visible ruled lines, repair before validation.',
					'Also verify Q01.1 has a keyed answer for every visible equation blank, but selfContainedPromptText must not reveal the completed equation; it should ask the learner to complete the word equation and leave the blanks in the response control. Preserve Table 1 with the official superheader/unit "Rate of photosynthesis in cm3/hour" wherever it renders, and include the printed final-answer unit in Q01.3 as "X = ... cm3/hour". Verify Q02.4 mark-scheme/checklist/model grading support includes the official allowed answer "diffusion" as well as osmosis. For Q01.4, do not use an asset-canvas table crop; use the structural Table 1 plus a choice/choice-table response for the anomalous value.',
					'Verify Figure 2 includes the complete Mesophyll cell label, Figure 3 includes the full Capillary label, Figure 4 includes the full key including Water molecules and Nitrate ions, Figure 5 includes complete bacterial/liver/mesophyll cell diagrams and scale bars, Figure 6 includes the full cell-cycle chart and Stage 1 label, Figure 9 includes the full Nodules label and arrows, and both Figure 10 uses include the full graph key below the graph plus axes, curve labels/legend, and complete graph extent.',
					'Use precise figure-only crops: a crop must not include the following source prompt, mark label, answer lines, or unrelated question text. If an embedded image includes the complete figure/key/axes, prefer it. If you must render-crop, keep the crop inside the figure boundary while preserving labels/keys. At the 180 DPI render used by pdf-tools, good approximate clean crop sizes are Figure 2 about 1000x560, Figure 4 about 1130x650, Figure 5 about 1240x520, and repeated Figure 10 about 1000x1000. For this paper, do not make Figure 2 taller than needed for the Stomata label, do not include Q02.2 text; do not include Q02.4 text in Figure 4; do not include Q03.1 text in Figure 5; and do not include Q06.4 prompt text in the repeated Figure 10 crop.',
					'For 03.1, 03.2, 06.1, 06.4, and 06.5, split the official any-two/any-three mark scheme into independently awardable 1-mark rows. For Q06.5 and Q06.6, carry the visible Million Women survey setup into contextText/stemBlocks/selfContainedPromptText, including the 15-year duration, the two 400 000-person groups / 800 000 total cohort, the exclusion of existing liver disease, and the alcohol-consumption controlled-factor context. For Q01.9, preserve the graph plotting mark scheme exactly: all mean points plotted correctly earns 2 marks, and 3 or 4 correct plots earns 1 mark; do not change this to two correct points.',
					'For Q02.3, Q06.7, and Q07.3, include the official level-of-response mark bands/descriptors as markSchemeItems/guidance, including Level 1 and Level 2, alongside the indicative content; do not replace level descriptors with isolated one-mark rows.'
				].join('\n')
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
Do not create a custom generator script, extraction synthesizer, or new program that writes the extraction JSON. Write extraction.json directly from the source-derived records in this Codex run, then use only helper.mjs for normalization and validation. Small PDF/image observation artifacts and figure crops are fine.

Task: extract the whole paper into structured JSON for downstream import. Focus only on question extraction and mark-scheme extraction/alignment. Do not create final answer chains; leave answerChain absent or placeholder-like. A separate Codex run will reconcile answer chains.

Required extraction coverage:
- Atomic sourceQuestionRef values, parentSourceQuestionRef, displayOrder, pageStart/pageEnd, marks, command words, prompt text, self-contained prompt text, context/stem/lead/prompt blocks, response controls, response-line counts, assets, figure/table dependencies, formulae/equations, markSchemeItems, markChecklist, modelAnswer or fixed response answer keys, review flags, and provenance notes.
- ${expectedQuestionLine}
- Expected mark total: ${expectedMarks}.
- Omit withdrawn questions, replacement notices, statistics-only rows, mean-mark rows, and anything lacking the original prompt plus positive marking criteria.
- Every atomic question must be usable as a learner-facing question. When the printed prompt uses referential wording such as "this investigation", "these data", "the mAbs", "the anomalous result", "other factors", "the sample", "the treatment", "the graph", "Figure/Table is repeated", or similar, include the exact surrounding parent/source stem that defines the reference in contextText, stemBlocks, and selfContainedPromptText.
- For multipart questions, do not rely on a later renderer or judge to rediscover parent context from the PDF. Carry the exact source setup forward to every subpart that needs it, especially investigation descriptions, study/survey setup, graph/table captions and units, figure definitions, named treatments/organisms, and preceding sentences that define abbreviations.
- Do not duplicate learner-visible setup between any rendered blocks. Put shared setup, figure/table introductions, and source context in stemBlocks/leadBlocks/contextText; keep promptBlocks to the marked instruction/question only. For table blocks, put table captions and data in the table block but do not prepend the same paragraph already present in a neighboring paragraph block. selfContainedPromptText may repeat context for standalone grading, but rendered blocks must not repeat the same sentence.
- For fixed responses, store exact answers only in response.correctAnswers, markSchemeItems, markChecklist, or modelAnswer as appropriate.
- selfContainedPromptText must make the question standalone without revealing the answer. For equation-blanks, fill-in blanks, graph/table selection, and other keyed responses, never place the completed answer or selected option in selfContainedPromptText or learner-visible prompt/context blocks.
- Use only app response kinds: none, lines, labeled-lines, number-line, choice, choice-table, matching, equation-blanks, asset-canvas, image-label-zones, drawing-box.
- For response.kind "lines" and every labeled-lines field, count the number of visible ruled horizontal writing lines in the answer area from rendered pages. Do not infer line counts from marks. Do not count the gaps between rules and do not subtract one from the number of rules; a learner can write on each visible rule. Use rendered-page crops and bash pdf-tools.sh line-count for every multi-line written response, then inspect the crop to exclude prompt/table/box borders.
- For response.kind "equation-blanks", every visible blank segment must have a matching response.correctAnswers target. If two same-side reactants can be in either order, still key both visible blank ids and represent order flexibility explicitly; do not leave an unkeyed blank.
- For source-paper instructions such as "draw a ring around" or "circle" a value in a printed table, prefer a structural table block plus a fixed response (choice or choice-table) whose answer key names the selected cell/value. Do not use asset-canvas for tables that can be represented structurally. If a table absolutely must be an image response surface, the crop must include the complete table data and validation/judging must prove it renders.
- Mark schemes must be granular enough for grading. Do not compress an official "any two", "any three", or "give two/three" mark scheme into one row. Emit one positive markSchemeItems row per independently awardable mark, normally with marks: 1, and point the matching checklist row(s) at those separate indexes. Put allow/accept/reject/guidance in additional non-positive rows only when useful.
- For markChecklist.required, true means every full-credit answer must satisfy that row. If the official mark scheme says "any one", "any two", "any three", "or", or otherwise lists alternative credited points, do not mark every alternative as required. Either set alternative checklist rows to required=false or use required=true only for the number of mandatory slots/steps that every full-credit answer needs. A question must not have more required checklist rows than its mark value.
- If learner-facing text, contextText, stemBlocks, leadBlocks, or promptBlocks mention "Figure N", "Fig N", or "Table N", the question must also include that dependency in a renderable way. Figures need a matching assets[] entry with a real filePath/publicPath/r2Key. Tables can be a structural table block with the same label or a real asset. Attach the same figure/table dependency to every atomic subquestion that refers to it; do not rely on another question row to supply it.
- For source tables represented structurally, use block kind "structured-table" when there is no column header row, or "table" only with a non-empty columns array and string rows. Do not emit "table" with null/empty columns.
- Use image-label-zones only when the response surface is a real extracted/rendered image asset with assetLabel, label bank, target zones, and correctAnswers. Do not point image-label-zones at a structured table or label-only asset; use a text/choice response plus the structured table context instead, or mark the question for review if faithful interaction is impossible.
- Every figure or response asset used by a renderer must have a local file path that can be uploaded to R2, or an existing publicPath/r2Key. A local-only file path is acceptable in extraction JSON, but validation/import will fail unless the production pipeline derives/uploads the matching R2 object before deployment checks.
- Figure and response-surface assets must be complete learner-visible crops from rendered pages or faithful embedded images. Preserve all required axes, scales, legends, graph keys, figure keys, labels, option text, and full diagram/graph extents. Do not use a crop that only shows part of a graph, omits an x-axis or key, clips right-side labels, loses a figure key that the question depends on, or includes surrounding prompt/answer text from the next question. A figure asset should contain the figure, caption/label, and required key/axes only. When embedded images omit keys/captions/axes, create a rendered-page crop that is generous within the figure boundary but stops before unrelated source text.
- Chemistry equations, ionic formulae, state symbols, subscripts/superscripts, charges, physics formulae, fractions, units, and rearranged equations must be verified visually through rendered pages or embedded-image inspection, not trusted to OCR/plain text alone.
- OCR is fallback only. Prefer PDF text layer for exact printed text, rendered pages/contact sheets for layout, embedded-image extraction for figures/tables, and geometry/rendered checks for answer lines.
${fragileLineNote}

Useful PDF observation commands. Use the shell helper for commands that call system PDF/image tools; the Codex sandbox can run those tools directly more reliably than nested Node child_process calls:
- bash pdf-tools.sh pdf-info --pdf=question-paper.pdf --output=question-paper.info.txt
- bash pdf-tools.sh pdftotext-pages --pdf=question-paper.pdf --pages=2-4 --output=qp-pages-2-4.txt
- bash pdf-tools.sh render-pages --pdf=question-paper.pdf --pages=1-4 --dpi=180 --output-dir=qp-pages
- bash pdf-tools.sh extract-embedded-images --pdf=question-paper.pdf --output-dir=qp-images --manifest=qp-images.txt
- bash pdf-tools.sh contact-sheet --glob='qp-pages/*.png' --output=qp-contact.jpg --thumb=220x310 --columns=4
- bash pdf-tools.sh crop --image=qp-pages/page-03.png --crop=x,y,width,height --output=q-crop.png
- bash pdf-tools.sh line-count --image=qp-pages/page-03.png --crop=x,y,width,height --output=q-lines.json

Useful JSON normalization and validation commands:
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
