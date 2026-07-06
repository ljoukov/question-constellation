#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';

const rootDir = process.cwd();
loadDefaultEnv(rootDir);

const usage = `Usage:
node scripts/run-codex-extraction-judge.mjs \\
  --candidate=<normalized-extraction.json> \\
  --question-paper=<official-question-paper.pdf> \\
  --mark-scheme=<official-mark-scheme.pdf> \\
  --source-document-id=<stable-source-id>

Optional:
  --work-dir=tmp/codex-extraction-judge/<source-id>
  --output=tmp/codex-extraction-judge/<source-id>/judge-report.json
  --summary=tmp/codex-extraction-judge/<source-id>/codex-judge-summary.json
  --expected-marks=<n>
  --expected-questions=46
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
const candidatePath = path.resolve(rootDir, requiredStringArg('candidate'));
const questionPaperPath = path.resolve(rootDir, requiredStringArg('question-paper'));
const markSchemePath = path.resolve(rootDir, requiredStringArg('mark-scheme'));
const workDir = path.resolve(
	rootDir,
	stringArg('work-dir', path.join('tmp/codex-extraction-judge', sourceDocumentId))
);
const outputPath = path.resolve(
	rootDir,
	stringArg('output', path.join(workDir, 'judge-report.json'))
);
const summaryPath = path.resolve(
	rootDir,
	stringArg('summary', path.join(workDir, 'codex-judge-summary.json'))
);
const model = stringArg('model', 'gpt-5.5');
const thinkingLevel = stringArg('thinking-level', 'high');
const timeoutMs = integerArg('timeout-ms', 7_200_000, 1);
const expectedMarks = integerArg('expected-marks', null, 1);
const expectedQuestions = integerArg('expected-questions', null, 1);
const dryRun = hasArg('dry-run');
const force = hasArg('force');

for (const filePath of [candidatePath, questionPaperPath, markSchemePath]) {
	if (!existsSync(filePath)) throw new Error(`Input file does not exist: ${filePath}`);
}

const candidate = readJson(candidatePath);
const allowedDroppedSourceQuestions = allowedDroppedSourceQuestionsFor(candidate);

const plan = {
	sourceDocumentId,
	candidatePath: relative(candidatePath),
	questionPaperPath: relative(questionPaperPath),
	markSchemePath: relative(markSchemePath),
	workDir: relative(workDir),
	outputPath: relative(outputPath),
	summaryPath: relative(summaryPath),
	model,
	thinkingLevel,
	expectedMarks,
	expectedQuestions,
	allowedDroppedSourceQuestions
};

if (dryRun) {
	console.log(JSON.stringify({ status: 'dry-run', plan }, null, 2));
	process.exit(0);
}

prepareWorkDir();
const prompt = buildPrompt();
writeFileSync(path.join(workDir, 'prompt.md'), prompt);

const startedAt = new Date().toISOString();
let codexSummary = null;
try {
	const mechanicalValidation = validateCandidateMechanically();
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
	const judgeReportPath = path.join(workDir, 'judge-report.json');
	if (!existsSync(judgeReportPath)) throw new Error('Codex judge did not write judge-report.json.');
	const judgeReport = readJson(judgeReportPath);
	const status = judgePassed(judgeReport) ? 'passed' : 'failed';
	mkdirSync(path.dirname(outputPath), { recursive: true });
	copyFileSync(judgeReportPath, outputPath);
	const summary = {
		status,
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		mechanicalValidation,
		codex: codexSummary,
		judgeReport,
		artifacts: artifacts()
	};
	writeJson(summaryPath, summary);
	console.log(JSON.stringify(summary, null, 2));
	if (status !== 'passed') process.exit(1);
} catch (error) {
	const summary = {
		status: 'failed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		codex: codexSummary,
		error: error instanceof Error ? error.message : String(error),
		artifacts: artifacts()
	};
	writeJson(summaryPath, summary);
	console.error(JSON.stringify(summary, null, 2));
	process.exit(1);
}

function prepareWorkDir() {
	if (existsSync(workDir)) {
		if (!force) throw new Error(`Work dir already exists; pass --force: ${relative(workDir)}`);
		rmSync(workDir, { recursive: true, force: true });
	}
	mkdirSync(workDir, { recursive: true });
	copyFileSync(questionPaperPath, path.join(workDir, 'question-paper.pdf'));
	copyFileSync(markSchemePath, path.join(workDir, 'mark-scheme.pdf'));
	copyFileSync(
		path.join(rootDir, 'scripts/codex-import-helper.mjs'),
		path.join(workDir, 'helper.mjs')
	);
	copyFileSync(
		path.join(rootDir, 'scripts/answer-chain-specificity.mjs'),
		path.join(workDir, 'answer-chain-specificity.mjs')
	);
	copyFileSync(
		path.join(rootDir, 'scripts/codex-pdf-tools.sh'),
		path.join(workDir, 'pdf-tools.sh')
	);
	writeJson(
		path.join(workDir, 'candidate.json'),
		candidateWithLocalAssets(structuredClone(candidate))
	);
}

function validateCandidateMechanically() {
	const args = [
		'helper.mjs',
		'validate-extraction',
		'--input=candidate.json',
		'--output=mechanical-validation.json'
	];
	if (expectedMarks !== null) args.push(`--expected-marks=${expectedMarks}`);
	if (expectedQuestions !== null) args.push(`--expected-questions=${expectedQuestions}`);
	const result = spawnSync(process.execPath, args, {
		cwd: workDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 64 * 1024 * 1024
	});
	if (result.status !== 0) {
		throw new Error(
			`mechanical validation failed with exit code ${result.status ?? result.signal}.\n${result.stdout}\n${result.stderr}`
		);
	}
	return readJson(path.join(workDir, 'mechanical-validation.json'));
}

function buildPrompt() {
	const expectedQuestionLine =
		expectedQuestions === null
			? allowedDroppedSourceQuestions.length > 0
				? 'Confirm the candidate question count matches the whole official paper after subtracting audited unpublishable-source hold-outs.'
				: 'Confirm the candidate question count matches the whole official paper.'
			: `Confirm the candidate contains exactly ${expectedQuestions} atomic questions.`;
	const expectedMarkLine =
		expectedMarks === null
			? allowedDroppedSourceQuestions.length > 0
				? 'Confirm the candidate mark total matches the whole official paper and official mark scheme after subtracting audited unpublishable-source hold-outs.'
				: 'Confirm the candidate mark total matches the whole official paper and official mark scheme.'
			: `Confirm the candidate mark total is exactly ${expectedMarks}.`;
	const allowedDroppedLine =
		allowedDroppedSourceQuestions.length > 0
			? [
					'',
					`Candidate declares audited unpublishable-source hold-outs: ${allowedDroppedSourceQuestions
						.map((item) => `${item.sourceQuestionRef} (${item.reasons.join(', ')})`)
						.join('; ')}.`,
					'Do not fail merely because these held-out refs are absent from candidate.questions or totals. Independently verify that the official public PDF really withholds the learner source and no supplied official supporting PDF contains a renderable source. Record them in findings as held out/not applicable, not as required repairs. Still fail any missing question that is not listed here, any held-out ref whose source is actually available, or any attempt to fabricate answer-key-derived learner source content.'
				].join('\n')
			: '';
	const history2020Paper2SectionAIds = new Set([
		'aqa-history-2020-june-paper-2-section-a-option-a-britain-health-and-the-people-c1000-to-the-present-day-qp',
		'aqa-history-2020-june-paper-2-section-a-option-b-britain-power-and-the-people-c1170-to-the-present-day-qp',
		'aqa-history-2020-june-paper-2-section-a-option-c-britain-migration-empires-and-the-people-c790-to-the-present-day-qp'
	]);
	const history2020Paper2SectionBIds = new Set([
		'aqa-history-2020-june-paper-2-section-b-option-a-norman-england-c1066-c1100-qp',
		'aqa-history-2020-june-paper-2-section-b-option-b-medieval-england-the-reign-of-edward-i-1272-1307-qp',
		'aqa-history-2020-june-paper-2-section-b-option-c-elizabethan-england-c1568-1603-qp',
		'aqa-history-2020-june-paper-2-section-b-option-d-restoration-england-1660-1685-qp'
	]);
	const sourceSpecificLine = [
		sourceDocumentId === 'aqa-84611h-qp-nov20'
			? 'For Biology Nov 2020, explicitly verify Q07.1 has 7 visible ruled answer lines and Q07.3 has 16 visible ruled answer lines.'
			: null,
		sourceDocumentId === 'aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp'
			? 'For Geography 2022 Paper 1 Q02.3, the question-paper option B says "The trees drop their dead leaves because of lower temperatures in winter" while the mark scheme key abbreviates this as "The trees drop their leaves...". This is not a defect if response.options preserve the question-paper wording and the answer key still identifies option B / the corresponding mark-scheme wording.'
			: null,
		sourceDocumentId === 'aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp'
			? 'For Geography 2023 Paper 1 Q02.1 and Q02.3, Figure 7 may be missing from the public PDF because of third-party copyright. Do not require an image asset if candidate.json provides a learner-visible structured-table substitute labelled "Figure 7" that is sufficient to identify Large water plant as producer and reason that trout loss may increase aquatic insects/crayfish or stop humans eating trout. Treat provenance wording as valid only in reviewNotes, not in learner-visible blocks.'
			: null,
		sourceDocumentId ===
		'aqa-history-2020-june-paper-1-section-b-option-a-conflict-and-tension-the-first-world-war-1894-1918-qp'
			? 'For History 2020 Paper 1 Section B Option A First World War, known rendered-page line-count guardrails are: 01.0 = 22; 02.0 = 76 total with 23 lines on page 3, 26 lines on page 4, and 27 lines on page 5; 03.0 = 51 total with 25 lines on page 6 and 26 lines on page 7; 04.0 = 103 total with 23 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Independently inspect the rendered pages, but do not drop the first full-width ruled line below the prompt/mark allocation or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2020-june-paper-1-section-b-option-d-conflict-and-tension-in-asia-1950-1975-qp'
			? 'For History 2020 Paper 1 Section B Option D Asia, known rendered-page line-count guardrails are: 01.0 = 22; 02.0 = 73 total with 22 lines on page 3, 26 lines on page 4, and 25 lines on page 5; 03.0 = 48 total with 23 lines on page 6 and 25 lines on page 7; 04.0 = 101 total with 23 lines on page 8, 26 lines on page 9, 26 lines on page 10, and 26 lines on page 11. Independently inspect the rendered pages, but do not drop the ruled line beside/after "Extra space", continuation-page top lines, or the final inner ruled line above the page-frame border.'
			: null,
		history2020Paper2SectionAIds.has(sourceDocumentId)
			? 'For History 2020 Paper 2 Section A options, known rendered-page line-count guardrails are: 01.1 = 49 total with 22 lines on page 2 and 27 lines on page 3; 02.1 = 52 total with 25 lines on page 4 and 27 lines on page 5; 03.1 = 52 total with 25 lines on page 6 and 27 lines on page 7; 04.1 = 101 total with 22 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 25 lines on page 11. Independently inspect the rendered pages, but do not drop the first full-width ruled line below the prompt, the ruled line beside/after "Extra space", continuation-page top lines, or the final inner ruled line above the page-frame border.'
			: null,
		history2020Paper2SectionBIds.has(sourceDocumentId)
			? 'For History 2020 Paper 2 Section B options, known rendered-page line-count guardrails are: 01.1 = 48 total with 21 lines on page 2 and 27 lines on page 3; 02.1 = 50 total with 23 lines on page 4 and 27 lines on page 5; 03.1 = 49 total with 22 lines on page 6 and 27 lines on page 7; 04.1 = 98 total with 19 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 25 lines on page 11. Independently inspect the rendered pages, but do not drop the first full-width ruled line below the prompt, the ruled line beside/after "Extra space", continuation-page top lines, or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2021-june-paper-1-section-a-option-a-america-1840-1895-expansion-and-consolidation-qp'
			? 'For History 2021 Paper 1 Section A Option A America, known rendered-page line-count guardrails are: 01.1 = 22; 02.1 = 23; 03.1 = 50 total with 23 lines on page 4 and 27 lines on page 5; 04.1 = 23; 05.1 = 50 total with 23 lines on page 7 and 27 lines on page 8; 06.1 = 76 total with 22 lines on page 9, 27 lines on page 10, and 27 lines on page 11. Independently inspect the rendered pages, but do not drop the ruled line beside/after "Extra space", continuation-page top lines, or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2021-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp'
			? 'For History 2021 Paper 1 Section A Option B Germany, known rendered-page line-count guardrails are: 01.1 = 22; 02.1 = 24; 03.1 = 50 total with 23 lines on page 4 and 27 lines on page 5; 04.1 = 24; 05.1 = 51 total with 24 lines on page 7 and 27 lines on page 8; 06.1 = 76 total with 23 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Independently inspect the rendered pages, but do not drop the ruled line beside/after "Extra space", continuation-page top lines, or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2021-june-paper-1-section-a-option-c-russia-1894-1945-tsardom-and-communism-qp'
			? 'For History 2021 Paper 1 Section A Option C Russia, known rendered-page line-count guardrails are: 01.0 = 22; 02.0 = 24; 03.0 = 51 total with 24 lines on page 4 and 27 lines on page 5; 04.0 = 23; 05.0 = 51 total with 24 lines on page 7 and 27 lines on page 8; 06.0 = 73 total with 20 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Independently inspect the rendered pages, but do not drop the ruled line beside/after "Extra space", continuation-page top lines, or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2021-june-paper-1-section-a-option-d-america-1920-1973-opportunity-and-inequality-qp'
			? 'For History 2021 Paper 1 Section A Option D America, known rendered-page line-count guardrails are: 01.1 = 21; 02.1 = 23; 03.1 = 49 total with 22 lines on page 4 and 27 lines on page 5; 04.1 = 23; 05.1 = 50 total with 23 lines on page 7 and 27 lines on page 8; 06.1 = 73 total with 20 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Independently inspect the rendered pages, but do not drop the ruled line beside/after "Extra space", continuation-page top lines, or the final inner ruled line above the page-frame border. For Q01.1-Q03.1, also verify that complete learner-visible Interpretation A and Interpretation B text is present in candidate blocks or a readable asset.'
			: null,
		sourceDocumentId ===
		'aqa-history-2022-june-paper-1-section-a-option-a-america-1840-1895-expansion-and-consolidation-qp'
			? 'For History 2022 Paper 1 Section A Option A America, known rendered-page line-count guardrails are: 01.1 = 21; 02.1 = 22; 03.1 = 49 total with 23 lines on page 4 and 26 lines on page 5; 04.1 = 23; 05.1 = 49 total with 23 lines on page 7 and 26 lines on page 8; 06.1 = 71 total with 20 lines on page 9, 25 lines on page 10, and 26 lines on page 11. Independently inspect the rendered pages, but do not drop the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2022-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp'
			? 'For History 2022 Paper 1 Section A Option B Germany, known rendered-page line-count guardrails are: 01.1 = 21; 02.1 = 23; 03.1 = 49 total with 23 lines on page 4 and 26 lines on page 5; 04.1 = 24; 05.1 = 50 total with 24 lines on page 7 and 26 lines on page 8; 06.1 = 72 total with 21 lines on page 9, 26 lines on page 10, and 25 lines on page 11. Independently inspect the rendered pages, but do not drop the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2022-june-paper-1-section-a-option-c-russia-1894-1945-tsardom-and-communism-qp'
			? 'For History 2022 Paper 1 Section A Option C Russia, known rendered-page line-count guardrails are: 01.1 = 22; 02.1 = 22; 03.1 = 46 total with 20 lines on page 4 and 26 lines on page 5; 04.1 = 22; 05.1 = 47 total with 21 lines on page 7 and 26 lines on page 8; 06.1 = 70 total with 18 lines on page 9, 26 lines on page 10, and 26 lines on page 11. Independently inspect the rendered pages, but do not drop the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2022-june-paper-1-section-a-option-d-america-1920-1973-opportunity-and-inequality-qp'
			? 'For History 2022 Paper 1 Section A Option D America, known rendered-page line-count guardrails are: 01.1 = 22; 02.1 = 24; 03.1 = 48 total with 22 lines on page 4 and 26 lines on page 5; 04.1 = 25; 05.1 = 50 total with 24 lines on page 7 and 26 lines on page 8; 06.1 = 74 total with 21 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Independently inspect the rendered pages, but do not drop the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2021-june-paper-1-section-b-option-a-conflict-and-tension-the-first-world-war-1894-1918-qp'
			? 'For History 2021 Paper 1 Section B Option A First World War, known rendered-page line-count guardrails are: 01.0 = 21; 02.0 = 76 total with 23 lines on page 3, 26 lines on page 4, and 27 lines on page 5; 03.0 = 51 total with 25 lines on page 6 and 26 lines on page 7; 04.0 = 102 total with 22 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Independently inspect the rendered pages, but do not drop the first full-width ruled line below the prompt/mark allocation, continuation-page top lines, or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2022-june-paper-1-section-b-option-a-conflict-and-tension-the-first-world-war-1894-1918-qp'
			? 'For History 2022 Paper 1 Section B Option A First World War, known rendered-page line-count guardrails are: 01.0 = 23; 02.0 = 74 total with 23 lines on page 3, 27 lines on page 4, and 24 lines on page 5; 03.0 = 48 total with 24 lines on page 6 and 24 lines on page 7; 04.0 = 101 total with 23 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 24 lines on page 11. Independently inspect the rendered pages, but do not drop the first full-width ruled line below the prompt/mark allocation, continuation-page top lines, lines beside/after "Extra space", or the final inner ruled line above the page-frame border. Also verify Source A/B assets render and Source C text is learner-visible.'
			: null,
		sourceDocumentId ===
		'aqa-history-2021-june-paper-1-section-b-option-b-conflict-and-tension-the-inter-war-years-1918-1939-qp'
			? 'For History 2021 Paper 1 Section B Option B Inter-war Years, known rendered-page line-count guardrails are: 01.1 = 22; 02.1 = 77 total with 23 lines on page 3, 27 lines on page 4, and 27 lines on page 5; 03.1 = 52 total with 25 lines on page 6 and 27 lines on page 7; 04.1 = 103 total with 22 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 27 lines on page 11. Independently inspect the rendered pages, but do not drop the first full-width ruled line below the prompt/mark allocation, continuation-page top lines, or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2021-june-paper-1-section-b-option-c-conflict-and-tension-between-east-and-west-1945-1972-qp'
			? 'For History 2021 Paper 1 Section B Option C East and West, known rendered-page line-count guardrails are: 01.0 = 22; 02.0 = 76 total with 23 lines on page 3, 26 lines on page 4, and 27 lines on page 5; 03.0 = 52 total with 25 lines on page 6 and 27 lines on page 7; 04.0 = 102 total with 21 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 27 lines on page 11. Independently inspect the rendered pages, but do not drop the first full-width ruled line below the prompt/mark allocation, continuation-page top lines, or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2021-june-paper-1-section-b-option-d-conflict-and-tension-in-asia-1950-1975-qp'
			? 'For History 2021 Paper 1 Section B Option D Asia, known rendered-page line-count guardrails are: 01.0 = 22; 02.0 = 77 total with 23 lines on page 3, 26 lines on page 4, and 28 lines on page 5; 03.0 = 51 total with 25 lines on page 6 and 26 lines on page 7; 04.0 = 103 total with 23 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Independently inspect the rendered pages, but do not drop the first full-width ruled line below the prompt/mark allocation, continuation-page top lines, the ruled line beside/after "Extra space", or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2021-june-paper-2-section-a-option-c-britain-migration-empires-and-the-people-c790-to-the-present-day-qp'
			? 'For History 2021 Paper 2 Section A Option C Migration, known rendered-page line-count guardrails are: 01.1 = 47 total with 20 lines on page 2 and 27 lines on page 3; 02.1 = 48 total with 21 lines on page 4 and 27 lines on page 5; 03.1 = 47 total with 20 lines on page 6 and 27 lines on page 7; 04.1 = 97 total with 18 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 25 lines on page 11. Independently inspect the rendered pages, but do not drop the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", or the final inner ruled line above the page-frame border, and do not count outer page-frame borders as writable lines.'
			: null,
		sourceDocumentId ===
		'aqa-history-2021-june-paper-2-section-b-option-b-medieval-england-the-reign-of-edward-i-1272-1307-qp'
			? 'For History 2021 Paper 2 Section B Option B Medieval England, known rendered-page line-count guardrails are: 01.1 = 48 total with 22 lines on page 2 and 26 lines on page 3; 02.1 = 51 total with 25 lines on page 4 and 26 lines on page 5; 03.1 = 51 total with 25 lines on page 6 and 26 lines on page 7; 04.1 = 96 total with 22 lines on page 8, 26 lines on page 9, 26 lines on page 10, and 22 lines on page 11. Independently inspect the rendered pages, but do not reuse the 2020 Section B pattern and do not drop the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", or the final inner ruled line above the page-frame border.'
			: null,
		sourceDocumentId ===
		'aqa-history-2021-june-paper-2-section-b-option-d-restoration-england-1660-1685-qp'
			? 'For History 2021 Paper 2 Section B Option D Restoration England, known rendered-page line-count guardrails are: 01.1 = 48 total with 21 lines on page 2 and 27 lines on page 3; 02.1 = 52 total with 25 lines on page 4 and 27 lines on page 5; 03.1 = 52 total with 25 lines on page 6 and 27 lines on page 7; 04.1 = 97 total with 20 lines on page 8, 26 lines on page 9, 26 lines on page 10, and 25 lines on page 11. Independently inspect the rendered pages, but do not reuse the 2020 Section B pattern and do not drop the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", or the final inner ruled line above the page-frame border.'
			: null
	]
		.filter(Boolean)
		.join('\n');
	const historyJudgeLine = sourceDocumentId?.startsWith('aqa-history-')
		? [
				'',
				'History answer-book line counts: count every visible ruled learner-writing line inside the response box, including the first full-width ruled line immediately below the prompt/mark allocation, the ruled line beside/after an "Extra space" label, and the final inner ruled line above the page-frame/footer. Exclude only outer page-frame borders, mark-box borders, and non-writable printed separators. For long responses, inspect every continuation page and report page-by-page counts before summing. If helper guardrails name an expected count for this source, use rendered-page evidence and this convention before declaring that count wrong.'
			].join('\n')
		: '';
	return `You are an independent GCSE extraction and learner-rendering judge. You did not create candidate.json.

Files in this clean work directory:
- candidate.json: normalized extraction JSON to judge
- question-paper.pdf: official question paper
- mark-scheme.pdf: official mark scheme
- assets/: local copies of candidate assets referenced by candidate.json, when the original asset files existed
- helper.mjs: deterministic JSON validator
- pdf-tools.sh: shell helper for PDF text, rendered pages, crops, embedded images, contact sheets, and line counting

Do not inspect the repository, previous extraction workdirs, benchmark artifacts, git history, or the web. Start only from these files.

Task:
1. Mechanically confirm candidate.json is a whole-paper extraction for ${sourceDocumentId}. ${expectedQuestionLine} ${expectedMarkLine}
2. Independently compare candidate questions against the official question-paper PDF and mark-scheme PDF.
3. Judge extraction quality only: learner-facing wording/context, page references, response controls, answer-line counts, required figures/tables/assets, formula/equation rendering, positive mark-scheme alignment, answer keys/model answers, and whether each question is answerable from the assembled app-visible context.
4. Do not judge answer-chain style or chain quality. Chain reconciliation is a separate workflow.
5. Use PDF text layer for exact text, rendered pages/contact sheets for layout, embedded image extraction for figures/tables, and visual inspection for equations/formulae/line counts. OCR is fallback only.
6. Fail real defects, including missing renderable assets for mentioned figures, missing table data, duplicated learner-visible setup text, wrong response-line counts, wrong fixed-response answer keys, missing model answers for written questions, or mark-scheme rows that do not support grading.
7. For fixed-response or multiple-choice questions, judge learner-visible option text against the question paper, not against shortened mark-scheme wording. The mark scheme determines which option is correct; the question paper determines exactly what text the learner sees. Do not fail merely because a correct option's paper wording contains extra words that the mark scheme omits, as long as the selected option and grading evidence are aligned.
8. The current extraction schema uses candidate.questions[].pageStart and pageEnd for source page references, plus markSchemeItems, markChecklist, response.correctAnswers, and modelAnswer for grading support. Legacy question.pageRefs may be absent/null; do not fail for missing pageRefs when pageStart/pageEnd are present and correct. For written questions, a modelAnswer object with answerText is a valid model answer. Legacy fields named answer or markScheme may be absent/null; do not fail because those legacy fields are null when markSchemeItems/markChecklist/modelAnswer or response.correctAnswers contain the required support.
9. The assembled learner-visible context is candidate.contextText, candidate.stemBlocks, candidate.leadBlocks, candidate.promptBlocks, candidate.afterResponseBlocks, candidate.response, and candidate.assets together. Inspect labelled structured-table/table/key/equation blocks before declaring a referenced Figure/Table missing. A complete structured block is a renderable source surface; do not require a PNG asset for simple source tables, keys, code, SQL skeletons, food webs, or other source material that is faithfully represented structurally.
10. If a public PDF withholds a learner source for copyright, pass a neutral structured substitute only when it is learner-visible, labelled with the official Figure/Table/source label, sufficient to answer without the original image, supported by official mark-scheme/examiner evidence, and free of provenance phrases such as "reconstructed", "mark scheme evidence", or "source unavailable" in the learner-visible blocks. Provenance belongs in reviewNotes.
11. If candidate.extractionRun.droppedUnpublishableSourceQuestionRefs records an audited hold-out, do not require a neutral substitute when official evidence would reveal the answer key rather than provide learner source evidence.
${allowedDroppedLine}
${sourceSpecificLine}
${historyJudgeLine}

Useful commands:
- bash pdf-tools.sh pdf-info --pdf=question-paper.pdf --output=question-paper.info.txt
- bash pdf-tools.sh pdftotext-pages --pdf=question-paper.pdf --pages=1-36 --output=question-paper.pages.txt
- bash pdf-tools.sh pdftotext-pages --pdf=mark-scheme.pdf --pages=1-30 --output=mark-scheme.pages.txt
- bash pdf-tools.sh render-pages --pdf=question-paper.pdf --pages=1-36 --dpi=140 --output-dir=qp-pages
- bash pdf-tools.sh contact-sheet --glob='qp-pages/*.png' --output=qp-contact.jpg --thumb=170x240 --columns=6
- bash pdf-tools.sh extract-embedded-images --pdf=question-paper.pdf --output-dir=qp-images --manifest=qp-images.txt
- bash pdf-tools.sh crop-page --pdf=question-paper.pdf --page=3 --bbox=x1,y1,x2,y2 --dpi=180 --output=q-page-crop.png
- node helper.mjs validate-extraction --input=candidate.json${
		expectedMarks === null ? '' : ` --expected-marks=${expectedMarks}`
	}${
		expectedQuestions === null ? '' : ` --expected-questions=${expectedQuestions}`
	} --output=mechanical-validation.json

Write exactly one JSON file named judge-report.json with this shape:
{
  "status": "passed" or "failed",
  "verdict": "pass" or "fail",
  "score": number from 0 to 1,
  "questionCount": number,
  "markTotal": number,
  "checkedRefs": ["01.1"],
  "lineCountFindings": [{"sourceQuestionRef":"07.1","candidate":7,"expected":7,"status":"passed","evidence":"..."}],
  "renderabilityFindings": [],
  "solvabilityFindings": [],
  "markSchemeFindings": [],
  "requiredRepairs": [],
  "rationale": "concise summary"
}

Set status/verdict to failed/fail if any requiredRepairs are needed. Finish with a concise final message listing verdict, score, checked refs count, and required repair count.`;
}

function candidateWithLocalAssets(candidate) {
	const assetsDir = path.join(workDir, 'assets');
	mkdirSync(assetsDir, { recursive: true });
	const remapped = new Map();
	const usedNames = new Set();
	function remap(filePath) {
		if (!filePath) return filePath;
		const value = String(filePath);
		if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
		const sourcePath = path.isAbsolute(value) ? value : path.resolve(rootDir, value);
		if (!existsSync(sourcePath)) return value;
		if (!remapped.has(sourcePath)) {
			const parsed = path.parse(sourcePath);
			let fileName = path.basename(sourcePath);
			let suffix = 1;
			while (usedNames.has(fileName)) {
				fileName = `${parsed.name}-${suffix}${parsed.ext}`;
				suffix += 1;
			}
			usedNames.add(fileName);
			const localPath = path.join(assetsDir, fileName);
			copyFileSync(sourcePath, localPath);
			remapped.set(sourcePath, path.join('assets', fileName));
		}
		return remapped.get(sourcePath);
	}
	for (const question of candidate.questions ?? []) {
		for (const asset of question.assets ?? []) {
			asset.filePath = remap(asset.filePath ?? asset.file ?? asset.localPath ?? null);
		}
		for (const block of [
			...(question.stemBlocks ?? []),
			...(question.leadBlocks ?? []),
			...(question.promptBlocks ?? []),
			...(question.afterResponseBlocks ?? [])
		]) {
			if (block && typeof block === 'object') {
				block.filePath = remap(block.filePath ?? block.file ?? block.localPath ?? null);
			}
		}
	}
	for (const asset of candidate.localAssetManifest ?? []) {
		asset.filePath = remap(asset.filePath ?? asset.file ?? asset.localPath ?? asset.path ?? null);
	}
	return candidate;
}

function allowedDroppedSourceQuestionsFor(candidate) {
	const dropped = Array.isArray(candidate?.extractionRun?.droppedUnpublishableSourceQuestions)
		? candidate.extractionRun.droppedUnpublishableSourceQuestions
		: [];
	const fromRefs = Array.isArray(candidate?.extractionRun?.droppedUnpublishableSourceQuestionRefs)
		? candidate.extractionRun.droppedUnpublishableSourceQuestionRefs.map((ref) => ({
				sourceQuestionRef: ref,
				reasons: ['known_unresolved_copyright_source']
			}))
		: [];
	const byRef = new Map();
	for (const item of [...dropped, ...fromRefs]) {
		const sourceQuestionRef = String(item?.sourceQuestionRef ?? '').trim();
		if (!sourceQuestionRef) continue;
		const reasons = (item?.reasons ?? [])
			.map((reason) => String(reason ?? '').trim())
			.filter(Boolean);
		if (!reasons.includes('known_unresolved_copyright_source')) continue;
		byRef.set(sourceQuestionRef, {
			sourceQuestionRef,
			reasons: [...new Set(reasons)]
		});
	}
	return [...byRef.values()];
}

function judgePassed(report) {
	const requiredRepairs = Array.isArray(report?.requiredRepairs) ? report.requiredRepairs : [];
	return (
		report?.status === 'passed' &&
		report?.verdict === 'pass' &&
		Number(report?.score ?? 0) >= 0.8 &&
		requiredRepairs.length === 0
	);
}

function artifacts() {
	return {
		workDir: relative(workDir),
		prompt: relative(path.join(workDir, 'prompt.md')),
		events: relative(path.join(workDir, 'events.jsonl')),
		mechanicalValidation: relative(path.join(workDir, 'mechanical-validation.json')),
		judgeReport: relative(path.join(workDir, 'judge-report.json')),
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
