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
  --subject=Biology|Chemistry|Physics|Computer Science|Geography|History
  --subject-area=Biology|Chemistry|Physics|Computer Science|Geography|History
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
const expectedMarks = integerArg('expected-marks', null, 1);
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
			docType: supportingDocumentType(filePath),
			title: path.basename(filePath),
			path: `supporting-${String(index + 1).padStart(2, '0')}.pdf`,
			originalPath: filePath
		}))
	};
}

function supportingDocumentType(filePath) {
	const basename = path.basename(filePath).toLowerCase();
	if (/\bwre\b|examiner|examiners|report/.test(basename)) return 'examiner_report';
	if (/\bins\b|insert|preliminary/.test(basename)) return 'insert';
	return 'supporting_document';
}

function buildExtractionPrompt() {
	const fragileLineNote =
		sourceDocumentId === 'aqa-computer-science-2024-june-paper-2-computing-concepts-qp'
			? [
					'',
					'Known fragile checks for Computer Science 2024 Paper 2: verify response controls and figure crops from rendered pages before final validation.',
					'Exact line-count expectations from rendered source/judge evidence are: 02.1 = 2, 02.2 = 5, 05.3 = 7, 06.0 = 7, 07.3 = 2, 08.1 = 15 total with 5 lines each for Control unit / Clock / Cache, 08.2 = 6 total with 2 lines each for responses 1, 2, and 3, 09.1 = 2, 09.2 = 10, 11.0 = 12, 12.0 = 24, 13.1 = 4, 13.2 = 34 across pages 20 and 21, 14.0 = 6 total with 3 lines for SMTP and 3 for IMAP, 15.0 = 6, 16.0 = 8, 17.0 = 10 total with one name line plus four description lines for each of two malware entries, 18.1 = 4, 18.2 = 6, 18.3 = 4, 18.6 = 6, 19.1 = 4, and 19.2 = 14 total with 7 lines for CAPTCHA and 7 for Email confirmations. If your extraction undercounts any visible ruled lines, repair before validation.',
					'For Figure 2 on pages 6 and 8, crop the complete four-image figure including Images A, B, C, and D with labels and all grid edges. At 180 DPI, use a generous figure-only crop about x=270, y=230, width=1050, height=780, then inspect the crop. Do not use a 900x650 crop; it clips the right/lower figure content.',
					'For Figure 8 on page 26, crop the complete database figure including Film, Performance, and Actor tables and all Actor rows. A crop ending before Tom Hanks and Lea Thompson is incomplete; use a taller crop such as x=340, y=410, width=980, height=1400, then inspect it.',
					'For the Q07 logic/Huffman figures, crop complete figure-only surfaces: Figure 5 on page 12 should include the title, header, all eight truth-table rows, final row and bottom table border; use about x=250, y=245, width=1100, height=820 at 180 DPI, then inspect. Figure 6 on page 13 must include the complete circuit, right-side output line and Q label; use about x=315, y=270, width=1010, height=610, then inspect. Figure 7 on page 16 must include the complete Huffman tree including the full rightmost P leaf; use about x=315, y=245, width=930, height=660, then inspect.',
					'Do not put solved or derived facts into learner-visible prompts. For Q05.3, do not state that Image D is 8 by 5 pixels, uses three colours, or needs 2 bits per pixel in contextText/stemBlocks/selfContainedPromptText; provide Figure 2 and ask the official calculation. For Q06.0, do not add "decimal megabytes" or "as in the paper" to learner-facing text. For Q07.1, do not name Figure 4 as an OR gate in learner-facing text. For Q07.3, do not name the NOT, AND, or OR gates in learner-facing text; attach/render Figure 6 and keep the answer in markSchemeItems/modelAnswer only.',
					'Represent Figure 1 for Q04.1/Q04.2 as a structured code block containing 00110011 instead of attaching a screenshot asset. For Q05.4, carry forward the repeated Figure 2/Image D context as well as Figure 3. For Q07.2, the learner label bank must be AND, XOR, NOT and the key must be box-X = AND, box-Y = XOR, box-Z = NOT. For Q18.5 and Q18.7, structured SQL code blocks are sufficient; if you attach SQL skeleton crops, they must be tight skeleton-only crops and not include neighboring prompt text or response lines.',
					'For Q07.1, preserve the official truth-table answer options A-D as renderable tables, not prose summaries. Option A is the unusual printed two-column A/B table with rows 0 1 and 1 0; options B-D are A/B/Q tables with four rows each. Use multi-line choice option strings or structured table blocks, but the learner-visible view must show the table data and lozenge choices faithfully.',
					'For Q03.0 and Q09.1, preserve the official partial-mark split as separate 1-mark positive rows, not one collapsed 2-mark row. Q03.0 is credited as separate binary parts 11010 and 101, and the complete model answer must be 11010101. Q09.1 is credited as separate parts A and DDED. For Q13.2, include the official level mark bands as ranges 5-6, 3-4, and 1-2, not only representative 6/4/2 marks.'
				].join('\n')
			: sourceDocumentId === 'aqa-84611h-qp-nov20'
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
	const expectedMarkLine =
		expectedMarks === null
			? 'Infer the exact mark total from the official question paper and mark scheme; investigate and explain/fix any mismatch between question marks and mark-scheme total.'
			: `Expected mark total: ${expectedMarks}.`;
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
- ${expectedMarkLine}
- Omit withdrawn questions, replacement notices, statistics-only rows, mean-mark rows, and anything lacking the original prompt plus positive marking criteria.
- If supporting documents include examiner reports, examiners' reports, or similar mark/commentary reports, use them as secondary evidence for common traps, common weak answers, grading warnings, and hint explanations. Do not treat report comments as replacement mark-scheme points; keep positive credit grounded in the mark scheme. For each report-derived trap, cite it in provenance/review notes where possible and put the student-facing distilled trap in commonWeakAnswers.explanation.
- Every atomic question must be usable as a learner-facing question. When the printed prompt uses referential wording such as "this investigation", "these data", "the mAbs", "the anomalous result", "other factors", "the sample", "the treatment", "the graph", "Figure/Table is repeated", or similar, include the exact surrounding parent/source stem that defines the reference in contextText, stemBlocks, and selfContainedPromptText.
- For multipart questions, do not rely on a later renderer or judge to rediscover parent context from the PDF. Carry the exact source setup forward to every subpart that needs it, especially investigation descriptions, study/survey setup, graph/table captions and units, figure definitions, named treatments/organisms, and preceding sentences that define abbreviations.
- If an atomic question depends on a figure, image, graph, table, source extract, or data grid printed earlier in the same parent question, carry that earlier dependency forward even when it is not repeated on the same page. This is especially important for prompts like "Image D", "the image", "the graph", "the source", "these data", or "the table" where a later figure encodes data derived from an earlier figure.
- Do not duplicate learner-visible setup between any rendered blocks. Put shared setup, figure/table introductions, and source context in stemBlocks/leadBlocks/contextText; keep promptBlocks to the marked instruction/question only. For table blocks, put table captions and data in the table block but do not prepend the same paragraph already present in a neighboring paragraph block. selfContainedPromptText may repeat context for standalone grading, but rendered blocks must not repeat the same sentence.
- For fixed responses, store exact answers only in response.correctAnswers, markSchemeItems, markChecklist, or modelAnswer as appropriate.
- selfContainedPromptText must make the question standalone without revealing the answer. For equation-blanks, fill-in blanks, graph/table selection, calculation, fixed-choice, logic-gate, diagram-interpretation, and other keyed responses, never place the completed answer, selected option, gate/function name, derived dimensions, calculated intermediate values, or mark-scheme-derived facts in selfContainedPromptText or learner-visible prompt/context blocks. Learner-visible blocks should preserve official source evidence and task wording; put solved facts only in response.correctAnswers, markSchemeItems, markChecklist, or modelAnswer.
- For Computer Science code, SQL, pseudo-code, database, Boolean logic, Huffman/tree/graph, circuit, and truth-table questions, treat the printed code/diagram/skeleton as learner-visible source evidence, not as disposable prose. Reproduce exact visible labels, placeholder letters, line breaks, indentation, brackets, punctuation, table headers, and target positions in stemBlocks/promptBlocks/response metadata. Verify these surfaces from rendered pages or embedded images before final JSON.
- For SQL/program/code skeleton questions with labels such as A, B, C or numbered blanks, the learner-visible blocks must show where each label sits in the official skeleton. Do not flatten a labelled skeleton into a generic sentence like "INSERT INTO ( )", and do not rename official labels to generic "first/second/third" fields.
- Prefer faithful structured code/table blocks over extra screenshot assets for simple printed code, SQL skeletons, bit patterns, and small one-line figures. If the structured block fully represents the learner-visible source, omit the image asset. Only attach a screenshot asset when the crop has been visually checked to contain exactly the figure/skeleton and no neighboring prompt text, answer lines, or adjacent question material.
- For Boolean expressions, logic formulae, overbars, subscripts/superscripts, set notation, mathematical fractions, units, and chemical equations, use faithful notation in learner-visible text and model answers. Prefer LaTeX where it prevents ambiguity, for example \`\\overline{A} + B \\cdot C\`; do not use ambiguous plain text such as "A-bar" when the paper shows a NOT bar.
- Use only app response kinds: none, lines, labeled-lines, number-line, choice, choice-table, matching, equation-blanks, asset-canvas, image-label-zones, drawing-box.
- For response.kind "lines" and every labeled-lines field, count the number of visible ruled horizontal writing lines in the answer area from rendered pages. Do not infer line counts from marks or command words, including one-mark "state" questions. Do not count the gaps between rules and do not subtract one from the number of rules; a learner can write on each visible rule. Use rendered-page crops and bash pdf-tools.sh line-count for every written response with visible ruled lines, then inspect the crop to exclude prompt/table/box borders. Put brief line-count evidence in response.lineCountEvidence or the field's lineCountEvidence.
- For labeled written responses, count each visible ruled line available for the learner, including the first line beside/after a printed label and any separate "Name" line before a description field. Do not halve or compress line counts because the response has sublabels.
- For long written responses, always check whether the response space continues on the next page. If the answer area spans pages, set pageEnd to the final response page and sum the visible ruled lines across every page; do not stop at the first page or first crop.
- For response.kind "equation-blanks", every visible blank segment must have a matching response.correctAnswers target. If two same-side reactants can be in either order, still key both visible blank ids and represent order flexibility explicitly; do not leave an unkeyed blank.
- For source-paper instructions such as "draw a ring around" or "circle" a value in a printed table, prefer a structural table block plus a fixed response (choice or choice-table) whose answer key names the selected cell/value. Do not use asset-canvas for tables that can be represented structurally. If a table absolutely must be an image response surface, the crop must include the complete table data and validation/judging must prove it renders.
- Mark schemes must be granular enough for grading. Do not compress an official "any two", "any three", or "give two/three" mark scheme into one row. Emit one positive markSchemeItems row per independently awardable mark, normally with marks: 1, and point the matching checklist row(s) at those separate indexes. Put allow/accept/reject/guidance in additional non-positive rows only when useful.
- For markChecklist.required, true means every full-credit answer must satisfy that row. If the official mark scheme says "any one", "any two", "any three", "or", or otherwise lists alternative credited points, do not mark every alternative as required. Either set alternative checklist rows to required=false or use required=true only for the number of mandatory slots/steps that every full-credit answer needs. A question must not have more required checklist rows than its mark value.
- If learner-facing text, contextText, stemBlocks, leadBlocks, or promptBlocks mention "Figure N", "Fig N", or "Table N", the question must also include that dependency in a renderable way. Figures need a matching assets[] entry with a real filePath/publicPath/r2Key. Tables can be a structural table block with the same label or a real asset. Attach the same figure/table dependency to every atomic subquestion that refers to it; do not rely on another question row to supply it.
- For source tables represented structurally, use block kind "structured-table" when there is no column header row, or "table" only with a non-empty columns array and string rows. Do not emit "table" with null/empty columns.
- Use image-label-zones only when the response surface is a real extracted/rendered image asset with assetLabel, label bank, target zones, and correctAnswers. Do not point image-label-zones at a structured table or label-only asset; use a text/choice response plus the structured table context instead, or mark the question for review if faithful interaction is impossible.
- Every figure or response asset used by a renderer must have a local file path that can be uploaded to R2, or an existing publicPath/r2Key. A local-only file path is acceptable in extraction JSON, but validation/import will fail unless the production pipeline derives/uploads the matching R2 object before deployment checks.
- Figure and response-surface assets must be complete learner-visible crops from rendered pages or faithful embedded images. Preserve all required axes, scales, legends, graph keys, figure keys, labels, option text, leaf labels, node labels, arrows, captions, and full diagram/graph extents. Do not use a crop that only shows part of a graph/tree/circuit/diagram, omits an x-axis or key, clips right-side or bottom labels, loses a figure key that the question depends on, or includes surrounding prompt/answer text from the next question. A figure asset should contain the figure, caption/label, and required key/axes/labels only. When embedded images omit keys/captions/axes/labels, create a rendered-page crop that is generous within the figure boundary but stops before unrelated source text. After cropping, use identify or direct image inspection to check that the crop dimensions and visible content plausibly include the whole figure.
- Chemistry equations, ionic formulae, state symbols, subscripts/superscripts, charges, physics formulae, fractions, units, rearranged equations, Computer Science Boolean expressions, SQL/program code, binary/hex values, and database/table notation must be verified visually through rendered pages or embedded-image inspection, not trusted to OCR/plain text alone.
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
- node helper.mjs validate-extraction --input=normalized-extraction.json${
		expectedMarks === null ? '' : ` --expected-marks=${expectedMarks}`
	}${
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
		'--output=validation.json'
	];
	if (expectedMarks !== null) args.push(`--expected-marks=${expectedMarks}`);
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
