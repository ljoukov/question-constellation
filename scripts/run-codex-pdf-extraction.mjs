#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { copyCodexImportHelperBundle } from './lib/codex-import-helper-bundle.mjs';
import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import { deterministicCandidateIssues } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
loadDefaultEnv(rootDir);

const computerScience2021Paper2SourceDocumentIds = new Set([
	'aqa-computer-science-2021-june-paper-2-written-assessment-qp',
	'aqa-computer-science-2021-november-paper-2-written-assessment-qp'
]);
const computerScience2021Paper1SourceDocumentIds = new Set([
	'aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp',
	'aqa-computer-science-2021-november-paper-1-computational-thinking-and-problem-solving-qp'
]);

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
  --model=gpt-5.6-sol
  --thinking-level=max
  --timeout-ms=7200000
  --allow-unpublishable-source-drops
  --reuse-existing-extraction
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
const model = stringArg('model', 'gpt-5.6-sol');
const thinkingLevel = stringArg('thinking-level', 'max');
const timeoutMs = integerArg('timeout-ms', 7_200_000, 1);
const expectedMarks = integerArg('expected-marks', null, 1);
const expectedQuestions = integerArg('expected-questions', null, 1);
const dryRun = hasArg('dry-run');
const force = hasArg('force');
const allowUnpublishableSourceDrops = hasArg('allow-unpublishable-source-drops');
const reuseExistingExtraction = hasArg('reuse-existing-extraction');

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
	expectedQuestions,
	reuseExistingExtraction
};

if (dryRun) {
	console.log(JSON.stringify({ status: 'dry-run', plan }, null, 2));
	process.exit(0);
}

let prompt = null;
if (reuseExistingExtraction) {
	if (!existsSync(workDir)) {
		throw new Error(`Cannot reuse missing work dir: ${relative(workDir)}`);
	}
} else {
	prepareWorkDir();
	prompt = buildExtractionPrompt();
	writeFileSync(path.join(workDir, 'prompt.md'), prompt);
}

const startedAt = new Date().toISOString();
let codexSummary = null;
try {
	if (reuseExistingExtraction) {
		codexSummary = readJsonIfExists(path.join(workDir, 'codex-run-summary.json'));
	} else {
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
	}
	let normalizedPath = ensureNormalizedExtraction();
	let droppedExtractionQuestions = [];
	let validationResult = validateExtraction(normalizedPath, {
		allowFailure: allowUnpublishableSourceDrops
	});
	if (validationResult.failed) {
		const dropResult = writePublishableExtractionSubset(
			normalizedPath,
			validationResult.validation
		);
		normalizedPath = dropResult.outputPath;
		droppedExtractionQuestions = dropResult.dropped;
		validationResult = validateExtraction(normalizedPath);
	}
	mkdirSync(path.dirname(outputPath), { recursive: true });
	copyFileSync(normalizedPath, outputPath);
	const summary = {
		status: 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		codex: codexSummary,
		validation: validationResult.validation,
		droppedExtractionQuestions,
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
	copyCodexImportHelperBundle({ rootDir, workDir });
	copyFileSync(
		path.join(rootDir, 'scripts/answer-chain-specificity.mjs'),
		path.join(workDir, 'answer-chain-specificity.mjs')
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
			originalPath: questionPaperPath,
			pageCount: pdfPageCount(questionPaperPath)
		},
		markScheme: {
			id: markSchemeDocumentId,
			docType: 'mark_scheme',
			...common,
			title: stringArg('mark-scheme-title', markSchemeDocumentId),
			sourceUrl: stringArg('mark-scheme-url', ''),
			path: 'mark-scheme.pdf',
			originalPath: markSchemePath,
			pageCount: pdfPageCount(markSchemePath)
		},
		supportingDocuments: supportingDocumentPaths.map((filePath, index) => ({
			id: `${sourceDocumentId}-support-${index + 1}`,
			docType: supportingDocumentType(filePath),
			title: path.basename(filePath),
			path: `supporting-${String(index + 1).padStart(2, '0')}.pdf`,
			originalPath: filePath,
			pageCount: pdfPageCount(filePath)
		}))
	};
}

function pdfPageCount(filePath) {
	const result = spawnSync('pdfinfo', [filePath], { encoding: 'utf8' });
	if (result.status !== 0) return null;
	const match = /^Pages:\s+(\d+)\s*$/m.exec(result.stdout ?? '');
	return match ? Number(match[1]) : null;
}

function supportingDocumentType(filePath) {
	const basename = path.basename(filePath).toLowerCase();
	if (/\bwre\b|examiner|examiners|report/.test(basename)) return 'examiner_report';
	if (/\bins\b|insert|preliminary/.test(basename)) return 'insert';
	return 'supporting_document';
}

function historyKnownLineCountPromptNote(id) {
	const notes = {
		'aqa-history-2022-june-paper-1-section-b-option-b-conflict-and-tension-the-inter-war-years-1918-1939-qp':
			'Known fragile checks for History 2022 Paper 1 Section B Option B Inter-war Years: exact rendered-page response-line expectations are 01.1 = 22; 02.1 = 76 total with 23 lines on page 3, 26 lines on page 4, and 27 lines on page 5; 03.1 = 51 total with 25 lines on page 6 and 26 lines on page 7; 04.1 = 102 total with 22 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count the final inner ruled learner line above the page footer, but exclude the outer page-frame border. If extraction differs, repair the fragment before validation.',
		'aqa-history-2022-june-paper-1-section-b-option-c-conflict-and-tension-between-east-and-west-1945-1972-qp':
			'Known fragile checks for History 2022 Paper 1 Section B Option C East-West: exact rendered-page response-line expectations are 01.1 = 22; 02.1 = 76 total with 23 lines on page 3, 26 lines on page 4, and 27 lines on page 5; 03.1 = 51 total with 25 lines on page 6 and 26 lines on page 7; 04.1 = 102 total with 22 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count the final inner ruled learner line above the page footer, but exclude the outer page-frame border. If extraction differs, repair the fragment before validation.',
		'aqa-history-2022-june-paper-1-section-b-option-d-conflict-and-tension-in-asia-1950-1975-qp':
			'Known fragile checks for History 2022 Paper 1 Section B Option D Asia: exact rendered-page response-line expectations are 01.1 = 22; 02.1 = 76 total with 23 lines on page 3, 26 lines on page 4, and 27 lines on page 5; 03.1 = 51 total with 25 lines on page 6 and 26 lines on page 7; 04.1 = 102 total with 22 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count the final inner ruled learner line above the page footer, but exclude the outer page-frame border. If extraction differs, repair the fragment before validation.',
		'aqa-history-2022-june-paper-1-section-b-option-e-conflict-and-tension-in-the-gulf-and-afghanistan-1990-2009-qp':
			'Known fragile checks for History 2022 Paper 1 Section B Option E Gulf/Afghanistan: exact rendered-page response-line expectations are 01.0 = 22; 02.0 = 75 total with 22 lines on page 3, 26 lines on page 4, and 27 lines on page 5; 03.0 = 48 total with 22 lines on page 6 and 26 lines on page 7; 04.0 = 102 total with 22 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count the final inner ruled learner line above the page footer, but exclude the outer page-frame border. For Q02/Source B, make this exact provenance learner-visible either in the crop or a labelled structured block: "A cartoon published in many American newspapers, September 2001." The note "The giant in the doorway represents the United States." must also be learner-visible. If extraction differs, repair the fragment before validation.',
		'aqa-history-2023-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp':
			'Known fragile checks for History 2023 Paper 1 Section A Option B Germany: exact rendered-page response-line expectations are 01.1 = 22; 02.1 = 24; 03.1 = 50 total with 23 lines on page 4 and 27 lines on page 5; 04.1 = 25; 05.1 = 51 total with 24 lines on page 7 and 27 lines on page 8; 06.1 = 75 total with 22 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", and final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.',
		'aqa-history-2023-june-paper-1-section-b-option-a-conflict-and-tension-the-first-world-war-1894-1918-qp':
			'Known fragile checks for History 2023 Paper 1 Section B Option A First World War: exact rendered-page response-line expectations are 01.1 = 22; 02.1 = 76 total with 23 lines on page 3, 26 lines on page 4, and 27 lines on page 5; 03.1 = 51 total with 25 lines on page 6 and 26 lines on page 7; 04.1 = 103 total with 23 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. For Q02.1, Source C must expose this learner-visible provenance/caption either in the crop or as a labelled structured source block: "A poster produced by the American navy, in January 1917, to recruit sailors." The line "The standing figure represents Germany." and the poster body alone are not enough for the source-utility task.',
		'aqa-history-2023-june-paper-1-section-b-option-b-conflict-and-tension-the-inter-war-years-1918-1939-qp':
			'Known fragile checks for History 2023 Paper 1 Section B Option B Inter-war Years: exact rendered-page response-line expectations are 01.1 = 22; 02.1 = 76 total with 23 lines on page 3, 26 lines on page 4, and 27 lines on page 5; 03.1 = 51 total with 25 lines on page 6 and 26 lines on page 7; 04.1 = 102 total with 23 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 25 lines on page 11. Count the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", and final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.',
		'aqa-history-2023-june-paper-1-section-b-option-c-conflict-and-tension-between-east-and-west-1945-1972-qp':
			'Known fragile checks for History 2023 Paper 1 Section B Option C East-West: exact rendered-page response-line expectations are 01.0 = 22; 02.0 = 76 total with 23 lines on page 3, 26 lines on page 4, and 27 lines on page 5; 03.0 = 51 total with 25 lines on page 6 and 26 lines on page 7; 04.0 = 103 total with 23 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count first lines, Extra space lines, and final inner ruled lines as learner-writable; exclude only page-frame borders.',
		'aqa-history-2023-june-paper-1-section-b-option-d-conflict-and-tension-in-asia-1950-1975-qp':
			'Known fragile checks for History 2023 Paper 1 Section B Option D Asia: exact rendered-page response-line expectations are 01.0 = 21; 02.0 = 75 total with 22 lines on page 3, 26 lines on page 4, and 27 lines on page 5; 03.0 = 49 total with 23 lines on page 6 and 26 lines on page 7; 04.0 = 101 total with 21 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count first lines, Extra space lines, and final inner ruled lines as learner-writable; exclude only page-frame borders.',
		'aqa-history-2023-june-paper-1-section-b-option-e-conflict-and-tension-in-the-gulf-and-afghanistan-1990-2009-qp':
			'Known fragile checks for History 2023 Paper 1 Section B Option E Gulf/Afghanistan: exact rendered-page response-line expectations are 01.0 = 22; 02.0 = 76 total with 23 lines on page 3, 26 lines on page 4, and 27 lines on page 5; 03.0 = 51 total with 25 lines on page 6 and 26 lines on page 7; 04.0 = 102 total with 22 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count first lines, Extra space lines, and final inner ruled lines as learner-writable; exclude only page-frame borders. If extraction differs, repair the fragment before validation.',
		'aqa-history-2022-june-paper-2-section-b-option-a-norman-england-c1066-c1100-qp':
			'Known fragile checks for History 2022 Paper 2 Section B Option A Norman England: exact rendered-page response-line expectations are 01.1 = 48 total with 21 lines on page 2 and 27 lines on page 3; 02.1 = 52 total with 25 lines on page 4 and 27 lines on page 5; 03.1 = 52 total with 25 lines on page 6 and 27 lines on page 7; 04.1 = 102 total with 23 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 25 lines on page 11. Count the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", and final inner ruled line as learner-writable; exclude only the outer page-frame border.',
		'aqa-history-2022-june-paper-2-section-b-option-b-medieval-england-the-reign-of-edward-i-1272-1307-qp':
			'Known fragile checks for History 2022 Paper 2 Section B Option B Medieval England: exact rendered-page response-line expectations are 01.0 = 48 total with 21 lines on page 2 and 27 lines on page 3; 02.0 = 52 total with 25 lines on page 4 and 27 lines on page 5; 03.0 = 52 total with 25 lines on page 6 and 27 lines on page 7; 04.0 = 100 total with 21 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 25 lines on page 11. Count the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", and final inner ruled line as learner-writable; exclude only the outer page-frame border.',
		'aqa-history-2022-june-paper-2-section-b-option-c-elizabethan-england-c1568-1603-qp':
			'Known fragile checks for History 2022 Paper 2 Section B Option C Elizabethan England: exact rendered-page response-line expectations are 01.1 = 48 total with 21 lines on page 2 and 27 lines on page 3; 02.1 = 52 total with 25 lines on page 4 and 27 lines on page 5; 03.1 = 52 total with 25 lines on page 6 and 27 lines on page 7; 04.1 = 102 total with 23 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 25 lines on page 11. Count the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", and final inner ruled line as learner-writable; exclude only the outer page-frame border.',
		'aqa-history-2022-june-paper-2-section-b-option-d-restoration-england-1660-1685-qp':
			'Known fragile checks for History 2022 Paper 2 Section B Option D Restoration England: exact rendered-page response-line expectations are 01.1 = 48 total with 21 lines on page 2 and 27 lines on page 3; 02.1 = 52 total with 25 lines on page 4 and 27 lines on page 5; 03.1 = 52 total with 25 lines on page 6 and 27 lines on page 7; 04.1 = 97 total with 20 lines on page 8, 26 lines on page 9, 26 lines on page 10, and 25 lines on page 11. Count the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", and final inner ruled line as learner-writable; exclude only the outer page-frame border.'
	};
	return notes[id] ? `\n${notes[id]}` : '';
}

function buildExtractionPrompt() {
	const fragileLineNote =
		sourceDocumentId ===
		'aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp'
			? [
					'',
					'Known fragile checks for Computer Science 2024 Paper 1A: this programming paper has long code-grid responses. Count editable grid rows from rendered pages, not from marks or the apparent answer length.',
					'Exact response-control expectations from independent rendered-page judge evidence are: 01.5 = 20 writable code-grid rows; 02.4 = 3 visible ruled lines; 02.5 = 1 visible ruled line; 03.1 = 2 visible ruled lines; 04.2 = 1 visible ruled line; 06.0 = 32 across pages 12 and 13; 07.0 = 20 across pages 14 and 15; 09.3 = 12 visible ruled lines; 11.0 = 37 across pages 22 and 23; 12.6 = 25 on page 31 only; 12.7 = 25 on page 33 only; 13.0 = 12 visible ruled lines; 14.1 = 3 visible ruled lines; 14.2 = 40 across pages 35 and 36; and 15.0 = 35 editable code-grid rows across pages 39 and 40. If your extraction differs, repair the fragment before validation.',
					'For Q12.7, do not count page 32 prompt text as answer rows. The answer grid is on page 33 only.',
					'For Q03.2, the boundary test row has paired acceptable answers: 0 or 101 must pair with Invalid number, while 1 or 100 must pair with Valid number entered. Do not encode row2-data aliases and row2-expected aliases independently, because that accepts invalid pairings. Use labeled/free response fields with markChecklist/modelAnswer pairing guidance unless the app schema gains a structured paired-table response.',
					'For Q08.0, the official trace-table response must preserve the whole table progression, not a compressed final-answer blank list. The response surface must include intermediate retained weeks states [4,0,0], [4,6,0], [4,6,2] and the final weeksTotal 12, with i values 0,1,2 and daysTotal 30,48,16. Do not represent the weeks columns as only weeks[0]=4, weeks[1]=6, weeks[2]=2.',
					'For Q12.2 and Q12.5, carry the shared sliding-puzzle context into the atomic question: getTile(row, column) returns the tile value, the blank space is represented by 0, and the board context from Figure 17 is visible where the subpart depends on it. Q12.5 must not render as only Figure 16 code plus a bare purpose question.',
					'For Q15.0, count only the editable grid after the printed starter code and before the printed closing brace. The closing brace itself is not a writable row, but the 35 grid rows before it are learner response space.'
				].join('\n')
			: computerScience2021Paper2SourceDocumentIds.has(sourceDocumentId)
				? [
						'',
						'Known fragile checks for Computer Science 2021 Paper 2: verify visible ruled response lines from rendered pages before final validation. Some source filenames say NOV21, but the official visible paper identity is June 2021.',
						'Exact line-count expectations from independent rendered-page judge evidence are: 01.1 = 2, 01.2 = 5 including the final Answer line, 01.3 = 2, 01.4 = 2, 03.0 = 2, 04.0 = 1, 05.1 = 9, 05.2 = 4, 07.2 = 4, 10.0 = 18 total across Clock speed / Number of processor cores / Cache size, 12.0 = 6, 13.1 = 4, 13.3 = 4 including the partial ruled line after "How it works", 14.0 = 18, 16.2 = 5, 18.2 = 6, and 20.0 = 24 across pages 22 and 23. If your extraction differs, repair the fragment before validation.',
						'For labeled responses such as Q10.0, count every ruled line under every label and sum the fields. For page-spanning long responses such as Q20.0, count each page separately and do not add a phantom extra line at the page break.',
						'For Q03.0 Figure 1, the visible bit pattern is 1 0 1 1 0 0 0 0. Use a structured Figure 1 text/code block and omit the screenshot asset; this simple bit pattern should not depend on a fragile crop.',
						'For Q11 Figure 2, if you attach an image asset, crop the complete diagram including all input labels and the output P label. Figure 3 is a small truth table and can be structured if clearer.',
						'For Q13.3, preserve the printed ring choice as response.choiceOptions = ["Authentication", "MAC address filtering"] on the labeled-lines response, with response.labels only for the written explanation area. Do not turn the chosen security method into a writable line. The written explanation area has four ruled lines.',
						'For Q16.1, Figure 4 and Figure 5 must render completely and answerably. Prefer faithful structured bitmap grids for both figures, with structured-table cells that have explicit text values such as {"text":"B"} / {"text":"W"}; if using an image, inspect that Figure 5 is not clipped.'
					].join('\n')
				: computerScience2021Paper1SourceDocumentIds.has(sourceDocumentId)
					? [
							'',
							'Known fragile checks for Computer Science 2021 Paper 1: verify trace tables, logic-circuit crops, duplicate context, and drawing grids from rendered pages before final validation. Some source filenames say NOV21, but the official visible paper identity is June 2021.',
							'Exact line-count expectations from independent rendered-page judge evidence are: 02.1 = 2, 02.2 = 2, 02.3 = 2, 03.1 = 4, 03.2 = 4, 04.1 = 6 total across the two corrected-statement fields, 04.2 = 2, 04.3 = 6, 04.5 = 2, 05.2 = 4 total across the two advantage fields, 05.3 = 17, 06.1 = 6, 06.2 = 6, 07.6 = 18 continuation lines after the three printed starter-code lines or 21 total lines if representing the full answer area, and 09.3 = 16. If your extraction differs, repair the fragment before validation.',
							'For Q02.4, carry the complete Figure 1 algorithm forward as a learner-visible structured code block before the trace-table response. Do not rely on an asset-only Figure 1 dependency for the trace table question.',
							'For Q04.4, the trace table response must include the initial newRow row plus six iteration rows for i = 0, 1, 2, 3, 4, 5: seven response rows total. Do not reduce the response control to the rows needed by the final answer.',
							'For Q07.2 Figure 6, crop the complete circuit including all left input labels/dots and the right output line with Q. For Q07.3 Figure 7, crop the complete circuit including the top A input NOT-gate area and the right-side output/Q area. Inspect the crops before final validation.',
							'For Q07.5, render the sewing-machine scenario and the AND/OR/NOT gate restriction exactly once. Put shared setup in stem/context and keep promptBlocks to the marked instruction.',
							'For Q09.2, the official drawing response grid is 4 rows by 7 columns. Store response.grid as { rows: 4, columns: 7 }.'
						].join('\n')
					: sourceDocumentId === 'aqa-computer-science-2022-june-paper-2-computing-concepts-qp'
						? [
								'',
								'Known fragile checks for Computer Science 2022 Paper 2: Q03.2 uses a labelled logic-circuit drawing response surface. The crop or structured response must show the official D, L, W input labels, connector dots, drawing box, output connector, and R output label.',
								'Exact response-control expectations from independent rendered-page judge evidence are: 01.2 has four visible working lines plus a final keyed hexadecimal answer field; Q02.2 is an eight-cell bit box, not ruled lines; 02.3 = 2; 02.4 = 2; 03.4 = 2 lines for the G = field; 04.1 has two labelled fields, System software = 3 lines and Application software = 3 lines; 04.2 = 2 lines for each of the four numbered function fields; 05.0 = 23; 07.1 = 2; 07.2 = 12; 08.0 = 2 lines for each of the two numbered reason fields; 09.1 = 2 lines for each of the two numbered advantage fields; 09.2 = 4; 10.0 = 5 total with four working lines plus one final labelled Answer bits line; 12.0 = 7 total with six working lines plus one final labelled Answer bytes line; 13.3 = 5 total with four working lines plus one final labelled Answer megabytes line; 14.1 = 2; 14.3 = 2 lines for each of the three numbered advantage fields; 14.5 = 4; 15.1 = 2 lines for each of the two numbered issue fields; 15.2 = 4; 15.3 = 3 lines for each of the two numbered reason fields; 16.1 = 4; 16.2 = 4; 17.1 = 2 lines for each of the two numbered reason fields; 18.1 = 4; 18.3 = 2; and 18.4 = 2. If your extraction differs, repair the fragment before validation.',
								'Short one-mark "state" responses in this paper often have two ruled lines. Do not collapse them to one line just because the question is worth one mark. For numbered prompts such as "State two..." or "Give three...", count the visible ruled lines under each numbered field; use response.fields when counts vary or when it helps preserve per-field evidence.',
								'For Q01.2, do not use response.kind="equation-blanks" alone. Use response.kind="labeled-lines" with response.fields for Working (lineCount 4) and Hexadecimal = (lineCount 1), retain response.correctAnswers with left-hex-digit = B and right-hex-digit = 9, and include a modelAnswer that shows the binary grouping and final B9 answer. The learner-visible prompt must not reveal B9.',
								'For Q04.1, use response.kind="labeled-lines" with response.fields exactly labelled System software and Application software, each with lineCount 3. Do not collapse this to one unlabelled three-line response.',
								'For Q02.2, the official response surface is an eight-cell bit box for the 8-bit shifted result, not generic ruled answer lines. Represent it as response.kind="equation-blanks" with eight one-bit blank targets and response.correctAnswers for the bits of 00010101.',
								'Do not crop only the inner blank drawing box for Q03.2, and do not include duplicated prompt instruction text or the [3 marks] label inside the asset. Use a tight drawing-surface crop that still includes D, L, W, R and connector dots, then inspect it before final validation.',
								'For Q03.3, preserve the official Boolean overline notation: options B and D use an overline on W, so represent them with LaTeX such as \\overline{W} or equivalent unambiguous notation.',
								'For Q12.0, Figure 1 is a bitmap image. If attaching an asset, use a tight bitmap-only crop and inspect that it does not include clipped following prompt text.',
								'For Q17.2 and Q17.3, use structured blocks for Figure 2 MISSISSIPPI and Figure 3 Huffman code table; omit the Figure 2 screenshot asset because this simple text figure is prone to wrong/clipped crops. If you attach Figure 3 or the Q17.3 response-surface crop, inspect that Figure 3 includes the P / 101 row and the Q17.3 crop includes the complete Huffman tree and all blank leaf boxes.',
								'For Q17.3, key the Huffman tree response by path from the rendered tree and Figure 3: root-left/code 0 = I, node-7-right/code 11 = S, and node-3-right/code 101 = P. Do not swap S and P. Prefer zone IDs such as code-0-leaf, code-11-leaf, and code-101-leaf if you create new response zones.'
							].join('\n')
						: sourceDocumentId === 'aqa-computer-science-2024-june-paper-2-computing-concepts-qp'
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
							: sourceDocumentId === 'aqa-computer-science-2023-june-paper-2-computing-concepts-qp'
								? [
										'',
										'Known fragile checks for Computer Science 2023 Paper 2: verify response controls and figure crops from rendered pages before final validation.',
										'Exact line-count expectations from independent rendered-page judge evidence are: 02.1 = 2, 02.2 = 5 including the final Answer line, 04.0 = 5 including the final Answer line, 06.2 = 6 including the final Answer line, 07.2 = 8, 07.3 = 5 including the final Answer line, 08.2 = 12 total with 4 lines each for Clock / Control unit / Register, 10.2 = 6 total with 3 lines each for Fetch stage / Decode stage, 13.4 = 3, 13.5 = 4 total with 2 lines each for the two numbered TCP/IP layer responses, 14.3 = 2, 14.4 = 10, 15.0 = 18, and 16.3 = 18. If your extraction undercounts any visible ruled lines, repair before validation.',
										'For calculation questions on this paper, the printed final "Answer" ruled line is part of the learner response area. Count it together with the working lines; do not count only the working area above the answer label.',
										'For Q03.0, the paper leaves an unruled blank workspace under the binary addition. The digital extraction still needs a learner answer control; use response.kind="lines" with a single digital answer line and evidence that the paper has unruled workspace. Do not use response.kind="none" for this marked binary-answer question. The official mark-scheme split is 10111; 100; and the complete model answer is 10111100. Do not reuse the Computer Science 2024 Q03 answer 11010101.',
										'For Q15.0 and Q16.3, use a full-height answer-area crop. Prior extraction undercounted these long response areas by stopping before the first or bottom ruled lines.',
										'For Q07.2, Figure 1 is the 5 by 5 bitmap only. If you attach an image asset, crop tightly to the bitmap and do not include the caption or following prompt text; at 180 DPI, a good crop is approximately x=610, y=640, width=440, height=380.',
										'For Q07.4, Figure 2 is a simple 16-cell RLE bit pattern. Prefer a structured-table block containing the 16 visible bits and omit a screenshot asset. If you attach a Figure 2 image asset, the crop must include the full visible bit-pattern row, not just the lead-in text or "Figure 2" label. At 180 DPI, a good figure-only crop is approximately x=260, y=1110, width=1000, height=220.',
										'For Q11.2 and Q11.3, Figure 3 must include the complete logic circuit: inputs A, B, C, gates G1 and G2, both left/right rails, the right-side output line, and output D. Do not crop only the caption/top of the figure. At 180 DPI, a good figure-only crop is approximately x=515, y=720, width=600, height=365.',
										'For Q14.1, Q14.2, Q14.3, Q14.4, and Q14.5, carry the Figure 5 database evidence into every atomic subquestion that depends on it. Prefer complete structured tables for BookCopy, Student, and Loan. Q14.5 must include enough learner-visible Student and Loan table data to derive Barry Tucker -> StudentID TUC004 and the PB002 loan row; do not put only the derived WHERE condition in learner-facing text. If you attach a Figure 5 image asset, it must include all three complete tables and the Loan table through row L0007. At 180 DPI, a good figure-only crop is approximately x=155, y=330, width=1175, height=1450. A crop with height about 1220 cuts off L0007 and must not be used.',
										'For Q14.5, render the DELETE FROM / WHERE SQL skeleton exactly once. Preferred shape: keep promptBlocks to the surrounding task wording and put the DELETE FROM text, WHERE text, and blanks in response.kind="equation-blanks". Do not also add a promptBlocks code block containing the same skeleton.'
									].join('\n')
								: sourceDocumentId === 'aqa-84611h-qp-nov20'
									? [
											'',
											'Known fragile checks for Biology Paper 1 November 2020: verify response controls and figure crops from rendered pages before final validation.',
											'Exact line-count expectations from rendered source/judge evidence are: 01.2 = 4, 01.3 = 4 including the final X answer line, 01.5 = 2, 01.6 = 2, 01.7 = 1, 01.8 = 2, 02.1 = 4, 02.3 = 14, 02.4 = 1, 02.5 = 6 with one Name of process line plus five Explanation lines, 03.1 = 2, 03.2 = 6, 03.3 = 5 including the final Ratio = 1 : line, 03.4 = 1, 03.6 = 8 total with Stage 1 = 4 / Stage 2 = 2 / Stage 3 = 2, 04.2 = 7, 04.3 = 2, 04.4 = 6, 04.5 = 4, 04.6 = 4, 04.7 = 6, 04.8 = 2, 05.1 = 1, 05.2 = 2, 05.3 = 1, 05.4 = 12 total across the two reason/explanation fields, 05.5 = 5, 05.6 = 5, 06.1 = 4, 06.2 = 5 including the final Percentage decrease answer line, 06.3 = 5 including the final Relative risk answer line, 06.4 = 6, 06.5 = 4, 06.6 = 2, 06.7 = 10, 07.1 = 7, 07.2 = 4, 07.3 = 16, and 07.4 = 3. If your extraction undercounts any visible ruled lines, repair before validation.',
											'Also verify Q01.1 has a keyed answer for every visible equation blank, but selfContainedPromptText must not reveal the completed equation; it should ask the learner to complete the word equation and leave the blanks in the response control. Preserve Table 1 with the official superheader/unit "Rate of photosynthesis in cm3/hour" wherever it renders, and include the printed final-answer unit in Q01.3 as "X = ... cm3/hour". Verify Q02.4 mark-scheme/checklist/model grading support includes the official allowed answer "diffusion" as well as osmosis. For Q01.4, do not use an asset-canvas table crop and do not render Table 1 twice. Prefer one full choice-table response containing all official columns, including Mean, with the anomalous value keyed; if a separate structural Table 1 block is necessary, use a non-table choice response that does not repeat its cells.',
											'Verify Figure 2 includes the complete Mesophyll cell label, Figure 3 includes the full Capillary label, Figure 4 includes the full key including Water molecules and Nitrate ions, Figure 5 includes complete bacterial/liver/mesophyll cell diagrams and scale bars, Figure 6 includes the full cell-cycle chart and Stage 1 label, Figure 9 includes the full Nodules label and arrows, and both Figure 10 uses include the full graph key below the graph plus axes, curve labels/legend, and complete graph extent.',
											'Use precise figure-only crops: a crop must not include the following source prompt, mark label, answer lines, or unrelated question text. If an embedded image includes the complete figure/key/axes, prefer it. If you must render-crop, keep the crop inside the figure boundary while preserving labels/keys. At the 180 DPI render used by pdf-tools, good approximate clean crop sizes are Figure 2 about 1000x560, Figure 4 about 1130x650, Figure 5 about 1240x520, and repeated Figure 10 about 1000x1000. For this paper, do not make Figure 2 taller than needed for the Stomata label, do not include Q02.2 text; do not include Q02.4 text in Figure 4; do not include Q03.1 text in Figure 5; and do not include Q06.4 prompt text in the repeated Figure 10 crop.',
											'For 03.1, 03.2, 06.1, 06.4, and 06.5, split the official any-two/any-three mark scheme into independently awardable 1-mark rows. For Q06.5 and Q06.6, carry the visible Million Women survey setup into stemBlocks and selfContainedPromptText, including the 15-year duration, the two 400 000-person groups / 800 000 total cohort, the exclusion of existing liver disease, and the alcohol-consumption controlled-factor context. Leave contextText null when those learner-visible blocks already contain the setup; never add a compact summary that repeats them. For Q01.9, preserve the graph plotting mark scheme exactly: all mean points plotted correctly earns 2 marks, and 3 or 4 correct plots earns 1 mark; do not change this to two correct points.',
											'For Q02.3, Q06.7, and Q07.3, include the official level-of-response mark bands/descriptors as markSchemeItems/guidance, including Level 1 and Level 2, alongside the indicative content; do not replace level descriptors with isolated one-mark rows.'
										].join('\n')
									: '';
	const geographyGeneralNote = sourceDocumentId?.startsWith('aqa-geography-')
		? [
				'',
				'Geography source handling: if the question paper says a source, figure, photograph, map, or article cannot be reproduced because of copyright, do not leave that placeholder as learner-visible evidence. First inspect supporting PDFs such as pre-release/resource booklets, OS map inserts, other inserts, and examiner reports. If a supporting document contains the original source, render/crop or faithfully structure that source. If no supporting document contains it but the official mark scheme/examiner report gives enough source evidence, create a compact neutral structured substitute, keep the reconstruction provenance in reviewNotes, and set needsHumanReview=false so the question can proceed. If the official evidence is insufficient or contradictory, keep needsHumanReview=true and validation/judging should block import.',
				'For Geography Paper 3, the pre-release/resources booklet is official input for Section A. Use supporting-XX.pdf resource booklets as source evidence; do not try to answer Section A from the question paper alone.'
			].join('\n')
		: '';
	const geographyPaperSpecificNote =
		sourceDocumentId === 'aqa-geography-2020-june-paper-1-living-with-the-physical-environment-qp'
			? [
					'',
					'Known fragile checks for Geography 2020 Paper 1: this paper has optional Section C routes, several copyright source substitutes, and long answer areas that continue through "Extra space" lines. Validate from rendered pages before final JSON.',
					'For Geography 2020 Paper 1 response line counts, count every visible ruled learner-answer line, including ruled lines beside/after printed "Extra space" labels and continuation pages. Exact counts from independent rendered-page judge evidence are: Q01.5=18, Q01.12=27, Q02.6=18, Q02.9=27, Q03.6=18, Q04.5=12, Q04.6=18, Q05.5=12, and Q05.6=18. If extraction differs, repair before validation.',
					'For Q01.2/Figure 1, the graph crop must include the full lower x-axis/month labels and the August bar/value evidence; a crop that omits the month axis is invalid. For Q03.6/Figure 15, include the full official Figure 15 source, not photograph-only: preserve the photograph plus the before/after sketch maps, harder-rock/softer-rock/beach/wave-cut-platform key, and any sequence evidence needed by the mark scheme.',
					'For copyright-withheld figures, the learner-visible substitute must be clean source content only. Do not include phrases such as "neutral substitute", "official marking evidence", "official marking/report evidence", "mark scheme evidence", "reconstructed", or "source unavailable" in stemBlocks, leadBlocks, promptBlocks, contextText, table cells, or source labels; keep provenance in reviewNotes.'
				].join('\n')
			: sourceDocumentId ===
				  'aqa-geography-2021-june-paper-1-living-with-the-physical-environment-qp'
				? [
						'',
						'Known fragile checks for Geography 2021 Paper 1: the official visible PDF may be a November 2021 file while the manifest identity is June 2021. Preserve the manifest/source id, but verify response controls from the visible rendered paper.',
						'For Geography 2021 Paper 1 response line counts, count every visible ruled learner-answer line, including ruled lines beside/after printed "Extra space" labels and continuation pages. Exact counts from independent rendered-page judge evidence are: Q01.3=16, Q01.11=27, Q02.5=18, Q02.9=27, Q03.5=12, Q03.6=18, Q04.5=12, Q04.6=18, Q05.5=12, and Q05.6=18. If extraction differs, repair before validation.',
						'For Q02.5, preserve both the Hot desert environment / Cold environment tick choice and the written response lines as explicit learner response controls.',
						'Crop Figure 1 as a clean complete graph surface: include all left-side labels, all bars and axes/key/labels, but exclude the following Q01.1 prompt text. Crop Figure 15 as a clean OS map surface: remove stray preceding stem fragments such as "in Wales." while preserving the full map, grid labels, highlighted area, spot heights and scale. Crop Figure 17 wide enough to include the complete Snowdon Sherpa source text and photograph; do not clip the left or right edges.'
					].join('\n')
				: sourceDocumentId ===
					  'aqa-geography-2021-june-paper-2-challenges-in-the-human-environment-qp'
					? [
							'',
							'Known fragile checks for Geography 2021 Paper 2: the official visible PDFs may be November 2021 files while the manifest identity is June 2021. Use the question paper, mark scheme, official insert/resource PDF, and examiner report as inputs; preserve the manifest/source id.',
							'For Geography 2021 Paper 2 response line counts, count every visible ruled learner-answer line, including ruled lines beside/after printed "Extra space" labels and continuation pages. Exact counts from independent rendered-page judge evidence are: Q01.7=18, Q02.6 has Name of country=1 and Answer=10, Q03.4=18, Q04.5=18, Q05.5=18, and Q06.5=18. If extraction differs, repair before validation.',
							'For Q01.5-Q01.7/Figures 3 and 4, the learner-visible source must be answerable and clean. First inspect the official insert/resource PDF for the OS-map evidence. If copyright/source limits require a substitute, build a neutral learner-facing substitute from official evidence and keep provenance only in reviewNotes; do not put phrases such as "official insert is not present", "mark scheme describes", "source unavailable", or "reconstructed" in visible blocks.',
							'For Q02.7/Figure 8, crop only the official Figure 8 source text and figure label. Do not include the following 02.7 prompt, mark value, answer lines, or neighboring question text in the asset.',
							'For Q02.7-Q02.9/Figure 8, render the Asha source exactly once. Either attach a readable Figure 8 asset and keep stemBlocks to the short setup/prompt only, or transcribe Figure 8 as learner-visible text/table blocks and do not attach/reference a duplicate Figure 8 PNG. Do not show the full Asha source both as text and as an image.',
							'For Q02.9/Figure 9, include the complete world well-being map and the official Low / Medium / High well-being key. A crop without the full map or key is invalid.',
							'For Q03.4/Figure 11, Q04.5/Figure 13, and Q05.5/Figure 15, each divided bar chart asset must include the full chart, all key labels, the complete 0-100 percentage scale, and the relevant y-axis/source label (% calories, % water used, or % energy generated). A crop that omits the axis label or scale is invalid.'
						].join('\n')
					: sourceDocumentId === 'aqa-geography-2021-june-paper-3-geographical-applications-qp'
						? [
								'',
								'Known fragile checks for Geography 2021 Paper 3: Section A and the issue-evaluation questions depend on source/resource evidence, and several written-response areas are easy to undercount from text extraction alone. Verify all response controls from rendered pages before final JSON.',
								'For Geography 2021 Paper 3 response line counts, count every visible ruled learner-answer line, including continuation/extra-space lines. Exact counts from independent rendered-page judge evidence are: Q01.2=4, Q01.3=18, Q01.4=17, Q02.2=2, Q02.3=18, Q03.1=4, Q03.2=30, Q04.3=4, Q04.4=1, Q04.5=4, Q04.8=4, and Q04.10=12. If extraction differs, repair before validation.',
								'Do not represent source-placeholder or provenance text as learner-visible content. If a supporting resource or mark scheme is needed to reconstruct source evidence, keep that provenance in reviewNotes only.'
							].join('\n')
						: sourceDocumentId ===
							  'aqa-geography-2020-june-paper-2-challenges-in-the-human-environment-qp'
							? [
									'',
									'Known fragile checks for Geography 2020 Paper 2: verify choropleth/category labels from rendered source tables and mark scheme, not by splitting category text into alternatives.',
									'For Geography 2020 Paper 2 response line counts, count every visible ruled learner-answer line from rendered pages, including continuation and extra-space lines when present. Exact counts from independent rendered-page judge evidence are: Q01.5=12, Q02.4=12, Q02.9=4, Q04.4=2, Q05.4=2, and Q06.4=2. Q01.5 has 3 ruled lines on page 4 plus 9 continuation/extra-space lines on page 5. Q02.4 has 8 ruled answer lines plus the ruled "Extra space" line and 3 further ruled extra-space lines. If extraction differs, repair before validation.',
									'For Q01.2/Figure 1, inspect the rendered graph before writing the asset-canvas answer key. The graph already shows UK 2019/2050, China 2019, India 2050, and Nigeria 2019/2050. The learner completes the missing bars: China 2050 projected bar at 80% and India 2019 bar at 35%. Do not key India 2050 or Nigeria 2050 as missing.',
									'For Q01.6/Figure 3, the asset-canvas response surface must show the complete pictogram graph, including the Figure 3 label, y-axis label, full grid, all city labels including Hull, the City x-axis label, and the key showing one recycling symbol represents 10% household waste recycled. A crop that cuts off the bottom city labels or Hull column is invalid. At 180 DPI a good page-6 crop is approximately x=110, y=260, width=1280, height=1120; inspect the crop before validation.',
									'For Q02.5-Q02.7/Figures 7a and 7b, preserve the full learner-visible South Africa tourism source. Figure 7a needs the complete tourist-arrivals graph through 2023. Figure 7b must include all five opinion bubbles and speakers: "Safari tourism helps promote conservation." / UN habitat spokesperson; "Elephants damage my crops but I am not allowed to shoot them because they are protected in tourist safari parks." / Local farmer; "Tourism helps develop infrastructure in the country." / Government minister; "I can only get work as a driver or waiter at a safari camp." / Local resident; and "Tourism brings much needed foreign currency." / World Bank official. Q02.6 and Q02.7 are not solvable without those Figure 7b opinions. If a clean image crop is awkward, transcribe Figure 7b as learner-visible structured text instead of relying on an incomplete crop. At 180 DPI a generous page-14 crop for the source is approximately x=100, y=250, width=1300, height=1460, then trim/avoid the following Q02.5 prompt if possible.',
									'For Q03.4/Figures 10a and 10b, visually verify the energy-cost graph before writing the grading evidence. Figure 10a shows offshore wind as the lowest-cost bar at about £50 per MWh and onshore wind at about £81 per MWh; do not write a model answer or mark key that says onshore wind is cheapest unless the rendered graph contradicts this.',
									'For Q04.1/Figure 11, preserve the table category "25 or more" as one complete category label in learner-visible source data and response.correctAnswers for Central African Republic. Do not normalize it to correctAnswer "25" with alias "more".',
									'For all map/graph completion questions, distinguish the source data table from the learner response surface. Use asset-canvas only when the learner completes a map/graph; keep the exact category/value key in correctAnswers and mark evidence.',
									'For Q04.1, Q05.1 and Q06.1, the short country/category data table printed beside the map is learner-visible source evidence. It must appear in stemBlocks, leadBlocks, promptBlocks, or afterResponseBlocks, not only in selfContainedPromptText, response.correctAnswers, or mark evidence. Exact visible rows: Q04.1 Egypt / less than 5 and Central African Republic / 25 or more; Q05.1 Niger / more than 2000 and Central African Republic / 1001-1384; Q06.1 Libya / 50-74.99 and Central African Republic / 25-49.99.'
								].join('\n')
							: sourceDocumentId === 'aqa-geography-2020-june-paper-3-geographical-applications-qp'
								? [
										'',
										'Known fragile checks for Geography 2020 Paper 3: Section A depends on resource/source evidence and long fieldwork responses. Use the official supporting resource booklet/examiner evidence where available, and validate every line count from rendered pages.',
										'For Geography 2020 Paper 3 response line counts, exact counts from independent rendered-page judge evidence are: Q01.3=12, Q01.5=4, Q03.1=27, Q05.3 has Title of physical fieldwork enquiry=2 and Assessment=18, and Q05.4 has Title of fieldwork enquiry=2 and Evaluation=30. If extraction differs, repair before validation.',
										'If a source substitute is needed, the learner-visible source/table must be clean content only. Do not include provenance phrases such as "official marking/report evidence" in table headers, labels, or visible rows; put that provenance in reviewNotes. For Q03.1/Figure 3, the public resource booklet withholds the Kibera Factfile but the mark scheme and examiner report give enough official evidence to build a neutral answerable substitute. If you build that substitute cleanly from official evidence, set needsHumanReview=false; do not block the row merely because the original third-party source is unavailable.'
									].join('\n')
								: sourceDocumentId ===
									  'aqa-geography-2022-june-paper-1-living-with-the-physical-environment-qp'
									? [
											'',
											'Known fragile checks for Geography 2022 Paper 1: this paper has optional Section C routes, SPaG marks, and large map/graph/photo assets. Validate from rendered pages before final JSON, not from cropped-image existence alone.',
											'Extract all printed optional Section C routes as learner questions for the question bank, but record in reviewNotes that a candidate answers only two of the three 15-mark Section C options. The extracted printed-question mark total must include all printed routes plus SPaG; the candidate route total is separate provenance, not a reason to omit printed questions.',
											'For Geography 2022 Paper 1 response line counts, count every visible ruled answer line, including the ruled line immediately beside/after the printed "Extra space" label. Known long-response counts are Q01.8=18, Q01.9=12, Q01.10=27, Q02.4=18, Q02.9=28, Q03.7=18, Q04.7=18, and Q05.7=18.',
											'For Q01.10, include the separate +3 SPaG rubric in the question marks and grading evidence. The question is 12 marks total: 9 content marks plus 3 SPaG marks. Do not hide SPaG as zero-mark guidance only. The model answer must use one or more named tectonic hazard examples from the mark scheme, for example L\'Aquila, Italy 2009 and Gorkha/Nepal 2015; a generic "poorer area / wealthier area" answer is invalid.',
											'For Q02.3, copy the multiple-choice options verbatim from the question paper. Option B on the paper is "The trees drop their dead leaves because of lower temperatures in winter." The mark scheme key omits "dead"; keep the learner-visible option source-verbatim, and use response.correctAnswers/markSchemeItems/modelAnswer to record the keyed answer and mark-scheme wording.',
											'For Figure 3/Q01.5, use a clean graph-only response-surface crop: include Figure 3, the divided bar graph, x-axis labels through 2019, right edge, and key/legend. Do not include the repeated "Study Figure 3" setup, Q01.5 prompt text, mark label, or the data table in the image; represent table values in structured text/table blocks.',
											'For Figure 5, inspect that the complete world ecosystem map and full key are visible. Q02.1 and Q02.2 depend on the key; a map-only crop is not answerable. The learner-visible key must include Tropical forest, Savanna, Desert, Polar and high-mountain ice, Mediterranean, Temperate grassland, Temperate deciduous forest, Coniferous forest, and Tundra (arctic and alpine). A crop that shows only the word "Key" without the legend entries is invalid.',
											'For Figure 6/Q02.4, inspect that the asset includes both the complete climate graph/key and the full rainforest vegetation photograph below it. A crop that shows only a shallow strip of the photo is invalid because the mark scheme credits visible vegetation adaptations.',
											'For Figure 4/Q01.8, crop only the source figure: the two captioned photographs/statements. Do not include the repeated "Study Figure 4" setup line or Q01.8 prompt text in the image.',
											'For Figure 7/Q02.5, inspect that the graph includes the full 2002-2018 extent, especially the 2018 bar/label, but crop graph-only. Do not include the Q02.5 prompt text in the image.',
											'For Figure 9 and Figure 10/Q02.9, include the complete optional source figures for both routes without duplicate rendering. Either attach one combined asset with sourceLabel "Figures 9 and 10" and render it once, or crop Figure 9 and Figure 10 into two separate clean assets. Do not attach two separate assets that both contain the same combined Figure 9/Figure 10 source block.',
											'For Figure 11, inspect that the Holderness map includes Spurn Head, the southern spit shape, the complete erosion-rate graph, scale bar, and key. A good 180 DPI figure-only crop from page 20 is approximately x=250, y=690, width=1050, height=1220; a crop that includes the Section C setup/question heading but cuts off Spurn Head/key is invalid.',
											'For Figure 13/Q03.7, include the full coastal-management diagram, preserving all edge labels and arrows including Cliff collapse, North groyne, South groyne, and Longshore drift. A horizontally clipped crop is invalid even if the surrounding structured context mentions the missing labels.',
											'For Figure 14/Q04.1 and Q04.2, split structured source data from the response surface. Put the Figure 14 table values, including Site 7, into structured table/text blocks on every atomic question that refers to Figure 14, including Q04.2; do not rely on Q04.1 to supply the table for Q04.2. The Q04.1 response-canvas asset should be the complete clean plotting grid/graph surface with the x-axis title/scale "Distance from source (km)", x-axis labels through 90 km, y-axis label "River width (m)", and y-axis down to 0; do not crop off the lower x-axis/title, and do not include the Q04.1 prompt, mark label, Q04.2 prompt, or repeated table/prompt text in the image. A crop that ends mid-grid or before the x-axis labels is invalid.',
											'For Q03.6, Q04.6, and Q05.6, the official prompt says "Use one or more diagrams to support your answer" and the mark scheme caps answers without diagrams. Do not use response.kind="lines" alone. Use response.kind="drawing-box" with label "Diagram and written answer", preserve the checked visible ruled-line count in lineCount/lineCountEvidence metadata, and make modelAnswer/markChecklist mention the diagram features needed for full credit.',
											'For Figure 16/Q04.7, crop only the quotation/source boxes and both role labels; the Environment Officer box must not be clipped. Do not include the Q04.7 prompt text below the source boxes.',
											'For Q05.1/Figure 18, the learner needs the actual cross-section response graph/canvas. The Figure 18 asset must be a clean graph crop with title, axes, X/Y endpoints, lower axis, and Y endpoint down to 0 m. Do not include the repeated "Figure 18 is a partly completed..." setup sentence, page artifacts, or neighboring prompt text. Do not add synthetic labels, OCR-helper text, or annotations to the crop; the official vertical y-axis label may OCR as separate "Depth" and "of ice" text. If a combined Figure 17/18 crop is too large or fragile, split Figure 17 and Figure 18 into separate assets and point the asset-canvas response at the complete clean Figure 18 surface.',
											'For Figure 20/Q05.7, inspect that the asset includes the complete Snowdonia tourism infographic and the full visitor photograph at the bottom. A crop that cuts off the lower part of the photo is invalid.',
											'For Geography figure assets, crop to the figure boundary: include the figure label/caption/key/axes/source boxes needed to answer, but do not include surrounding "Study Figure..." setup lines, mark labels, answer lines, or neighboring question text that is also represented in stemBlocks or promptBlocks.'
										].join('\n')
									: sourceDocumentId ===
										  'aqa-geography-2022-june-paper-2-challenges-in-the-human-environment-qp'
										? [
												'',
												'Known fragile checks for Geography 2022 Paper 2: count every visible ruled answer line, including ruled lines beside/after "Extra space" labels and continuation areas. Exact response-line expectations from independent rendered-page judge evidence are: Q01.4=18, Q01.5=12, Q01.10=30 excluding the separate city-name field, Q02.5=18, Q02.10=12 excluding the separate country field, Q02.11=18 excluding the separate LIC/NEE name field, Q03.3=12, Q03.4=18, Q04.7=17 excluding the separate local-scheme name field, Q05.7=17 excluding the separate local-scheme name field, and Q06.7=17 excluding the separate local-scheme name field. If extraction differs, repair before validation.',
												'For Q01.10, include the separate +3 SPaG rubric in the question marks and grading evidence. The official SPaG rows are distinct: High performance = 3 marks, Intermediate performance = 2 marks, and Threshold performance = 1 mark. Do not merge Intermediate and Threshold into one 2-mark row; checklist support must point at all three SPaG rows.',
												'For Q03.1/Figure 10, the public question-paper PDF withholds the world map/category source for copyright. For this exact paper, the mark scheme and examiner report do not contain enough learner-safe source evidence to reconstruct Figure 10 without leaking the keyed answer. Do not create a neutral structured substitute for Q03.1. If no official supporting PDF contains a real renderable Figure 10 asset, keep Q03.1 needsHumanReview=true with a concise blocking note so the production runner can hold it out with --allow-unpublishable-source-drops.'
											].join('\n')
										: sourceDocumentId ===
											  'aqa-geography-2022-june-paper-3-geographical-applications-qp'
											? [
													'',
													'Known fragile checks for Geography 2022 Paper 3: Figure 4 comes from the official pre-release/resources booklet and contains multiple fieldwork tables. Verify the environmental quality survey values visually from the resource booklet, not by mental arithmetic or OCR alone.',
													'For Q04.2/Figure 4, the environmental quality scores must be transcribed exactly: Noisy = -1, Lots of traffic = -2, Unattractive = 0, Lots of litter = -2, and Crowded = -1. Do not swap Lots of litter and Crowded; Q04.2 total remains -6 only when the source table values are visible correctly.'
												].join('\n')
											: sourceDocumentId ===
												  'aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp'
												? [
														'',
														'Known fragile checks for Geography 2023 Paper 1: Q01.2 and Q01.3 depend on Figure 1, a graph on page 3. The Figure 1 asset must be a full, uncropped graph render including the title/caption, y-axis scale, x-axis year labels 1980, 1990, 2000, 2010 and 2020, the x-axis title Year, graph bottom, and all plotted values. A crop that cuts off the lower graph area or axis labels is invalid even if the multiple-choice key is known. After cropping, inspect the image and verify Q01.3 can be answered from the displayed graph with the mark-scheme answer 3 million square km.',
														'Known fragile checks for Geography 2023 Paper 1: Q01.6-Q01.8 depend on Figure 4 on page 8. The Figure 4 asset must include the world map, key, and the complete tropical storm deaths table down to the last row "2005 Central America Stan 1 629". If the image crop is too tall, transcribe the full table as a structured table on every Figure 4 question that needs the table.',
														'Known fragile checks for Geography 2023 Paper 1: Q01.10 depends on Figure 5 on page 10. The learner-visible Figure 5 evidence must include both the cyclone shelter photograph and the Cyclone Amphan track map with its key, dates, speeds, locations, observed track, forecast track, and affected-area shading. Use one complete Figure 5 crop or separate Figure 5 photograph/map assets, but inspect the assets and do not describe the map as included unless it is actually visible.',
														'Known fragile checks for Geography 2023 Paper 1: Q02.5 depends on Figure 8. Crop Figure 8 as the tropical-rainforest distribution map only, with the figure label/title/map/key, and exclude Q02.4 answer lines above and the "Study Figure 8" setup/prompt text. Q02.6-Q02.8 depend on Figure 9; crop only the nutrient-cycle diagram and key, excluding the Q02.6 prompt and "Shade one circle only" response instruction below the diagram. Q04.6 depends on Figure 16; crop the website/source extract box only and stop before the Q04.6 "Discuss the issues..." prompt.',
														'Known fragile checks for Geography 2023 Paper 1: Q03.3/Q03.4 depend on Figure 11. The OS map asset must include the full grid 39-41 eastings and 71-74 northings, both X and Y markers, the scale bar and north arrow. A crop that shows Y/Duncansby Head but cuts off X near the lower centre is invalid. Q05.3/Q05.4 similarly require Figure 17 to include the full grid 63-67 eastings and 59-61 northings, both X and Y markers, the scale bar and north arrow; a crop that shows Y/Llyn Ogwen but cuts off X near the lower-left is invalid.',
														'For Geography 2023 Paper 1 response line counts, use the independent rendered-page convention consistently and count every visible ruled learner-answer line, including ruled lines beside/after printed "Extra space" labels where the learner can write. Known counts are Q01.4=12, Q01.10=18, Q01.11=27, Q02.9=18, Q03.5=12, Q03.6=18, Q04.5=12, Q04.6=18, Q05.5=12, and Q05.6=18. For Q02.10, keep separate labeled fields with Chosen environment = 2 lines and Answer = 24 lines. For Q01.11 specifically, the rendered evidence is 9 ruled lines on page 12 plus 9 continuation lines, the Extra space ruled line, and 8 further ruled lines on page 13, for 27 total. For Q02.9, the rendered evidence is 12 ruled lines on page 18 plus the Extra space ruled line and 5 further lines on page 19, for 18 total.',
														'Known fragile checks for Geography 2023 Paper 1: Q02.1 and Q02.3 depend on Figure 7, a food-web source that may be copyright-blanked in the public PDF. Do not leave "not reproduced" text as the learner source. If no usable source appears in supporting PDFs, use only official mark-scheme evidence to build a minimal neutral food-web substitute. Preserve exact organism/source labels from official evidence, especially "Large water plant"; do not shorten it to "water plant". The learner-visible substitute must be clean source content only; do not include provenance phrases such as "neutral substitute", "official marking evidence", "mark scheme evidence", "reconstructed", or "source unavailable". The mark scheme confirms the producer is Large water plant and that if disease killed most trout, aquatic insects or crayfish may increase and humans could not eat trout; do not label those as answers in learner-visible text. In particular, Q02.1 selfContainedPromptText/stemBlocks may show organism names and feeding links, but must not say that Large water plant is the producer before the learner answers.'
													].join('\n')
												: sourceDocumentId ===
													  'aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp'
													? [
															'',
															'Known fragile checks for Geography 2023 Paper 2: Q01.3/Figure 2 is an asset-canvas graph-completion response. The learner-visible Figure 2 surface must include the complete bar graph, including the Figure 2 label, all category labels, the full grid, the x-axis numerical scale 0, 100, 200, ... 1000, and the x-axis title "Number of reports". A crop that shows the bars/grid but cuts off the x-axis numbers is invalid because the learner cannot place the 350 bar. At the 180 DPI render used by pdf-tools, a good page-4 crop is approximately x=80, y=255, width=1320, height=650; inspect it before final validation. Also transcribe the x-axis scale/title as visible source evidence so deterministic validation can catch missing scale text.',
															'Known fragile checks for Geography 2023 Paper 2: Q02.3/Figure 6 requires the complete official Southampton Science Park learner source, not a text-only substitute. Include the Figure 6 source as a renderable asset or complete structured source containing both the text block and all three photographs: construction/road/tree-removal scene, park shuttle/building scene, and aerial site/green-setting/car-parking scene. At the 180 DPI render used by pdf-tools, a good page-14 figure-only crop is approximately x=105, y=270, width=1260, height=1135; inspect it before final validation. Keep the existing source text in learner-visible blocks as well, but do not omit the photographic evidence.',
															'Known fragile checks for Geography 2023 Paper 2: Q02.4/Figure 7 is an asset-canvas map-completion response. The learner-visible Figure 7 evidence must include the map and the readable birth-rate key/category mapping, including the "11.47 or more" category needed to shade Iceland for birth rate 12.3. A map-only crop or a crop where the key labels are unreadable is invalid. If the key is not readable in the asset, transcribe the key as structured visible stem evidence; selfContainedPromptText alone is not rendered to learners.',
															'Known fragile checks for Geography 2023 Paper 2: Q04.5/Figure 13 requires the full Zai appropriate-technology source information, not only the photograph. Render or structure the learner-visible Figure 13 source so it includes Zai holes, water/compost or manure, termites, and yields increasing by up to 500%. Do not put this source evidence only in selfContainedPromptText; it must appear in stemBlocks/leadBlocks/context/source blocks or in a readable asset.',
															'For mixed count-and-percentage questions such as Q04.1, Q05.1, and Q06.1, use response.kind="labeled-lines" with response.choiceOptions for the shaded-circle count options and a separate Percentage field. Keep choiceOptions visible and key response.correctAnswers.choice plus the percentage answer.'
														].join('\n')
													: '';
	const geographyLineNote = [geographyGeneralNote, geographyPaperSpecificNote]
		.filter(Boolean)
		.join('\n');
	const historyGeneralNote = sourceDocumentId?.startsWith('aqa-history-')
		? [
				'',
				'History source handling: Paper 1 Section A interpretation booklets and other source booklets are official learner evidence. Inspect every supporting insert/source booklet before deciding a source is missing. If the public PDF says an interpretation/source cannot be reproduced for third-party copyright, do not publish that placeholder as the learner-visible source. Use a neutral structured substitute only when official mark-scheme/examiner-report evidence is enough to make the question answerable without giving away the answer; keep provenance and copyright caveats in reviewNotes, not learner-visible blocks. Learner-visible source blocks, key/table items, labels, contextText, selfContainedPromptText, and prompt text must not include phrases such as "neutral substitute", "Neutral official-evidence substitute", "official evidence indicates", "mark scheme evidence", "reconstructed", "source unavailable", "copyright-removed", or "not reproduced". If the neutral substitute is sufficient and learner-safe, set needsHumanReview=false so the question can proceed through import. Set needsHumanReview=true only when official evidence is insufficient or contradictory.',
				'For copyright-withheld History interpretations/sources, the learner-visible substitute must be concrete source-like evidence, not a topic outline, grading summary, or key block of broad labels. If the official task asks what the interpretation/source says, or how convincing/useful it is, include the specific claims, details, and provenance clues needed for a learner to answer from the app-visible question alone. Keep "this was reconstructed from official marking evidence" out of learner-visible text.',
				'For History source assets, do not show the same official source label, caption, provenance note, cartoon/photo caption, or source setup twice. If a rendered crop/image asset already contains the official label/caption/setup, do not also put that same text into visible stemBlocks, leadBlocks, promptBlocks, figure text, or contextText. If you need structured caption text for rendering instead, crop the asset to the source image/body only and keep the single structured caption outside the image.',
				'For History source-utility questions, source provenance is learner-visible evidence, not hidden metadata. If the learner is asked how useful or convincing a source is, preserve each source label, provenance/caption line, and explanatory note exactly from the insert either inside the renderable crop or in a separate labelled structured block. Do not claim an asset includes provenance unless you inspect the crop and can see it. If you crop to the cartoon/photo/body only, put the exact official provenance and notes in stemBlocks/leadBlocks next to the asset.',
				'History answer books often continue long responses onto one or more "Extra space" pages. For every written response, count from rendered full response boxes on each page, then sum the pages. Use a broad 180dpi inner-page line-count crop first, typically x=120, y=150, width=1180, height=1800 for continuation pages, then compare the reported lineYs against the full rendered page before deciding which top prompt separators or bottom page-frame borders to exclude. On continuation pages, the first ruled line just below/near "Extra space" and the last ruled line above the page footer are normally learner-writable lines; do not discard them as borders unless visual inspection shows they are only the outer page box. A line-count crop that starts too low or ends too high will undercount. Prefer a wide inner-page crop, compare against the full rendered page, and record page-by-page counts in response.lineCountEvidence.',
				'For AQA History 16-page answer booklets, Q03/Q05/Q06 style long responses commonly span pages. Verify continuation-page counts explicitly; do not reuse the short first-page crop pattern from Q01/Q02.',
				'For AQA History Paper 1 Section B answer books, response layouts vary by option and year. Do not copy a line-count pattern from another option. Count the exact rendered pages for this PDF, then run helper.mjs validate-extraction. For known History papers, helper validation includes source-specific independent rendered-page guardrails and will report known_response_line_count_mismatch with the expected count when a repair is required.',
				'For response.lineCountEvidence, make the page-by-page counts arithmetic-consistent with response.lineCount/count. If a helper guardrail changes the total, rerender/reinspect the relevant pages and repair the evidence; do not leave page counts whose sum contradicts the stored total. Count the first full-width ruled line immediately below the printed question/mark allocation as learner-writable unless it is visibly only a section divider.'
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
	const historyPaperSpecificNote =
		sourceDocumentId ===
		'aqa-history-2020-june-paper-1-section-a-option-a-america-1840-1895-expansion-and-consolidation-qp'
			? [
					'',
					'Known fragile checks for History 2020 Paper 1 Section A Option A America: the 16-page answer booklet has several ruled response areas where wide crops undercount by starting below the first learner-writable line or ending above the last continuation-page line. Use tight rendered-page crops around the ruled answer area, then compare with the full page before writing response.lineCount.',
					'Exact response-line expectations from independent rendered-page judge evidence are: 01.1 = 22, 02.1 = 24, 03.1 = 50 total with 23 lines on page 4 and 27 continuation lines on page 5, 04.1 = 25, 05.1 = 51 total with 24 lines on page 7 and 27 continuation lines on page 8, and 06.1 = 75 total with 22 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count the ruled line beside/after the printed "Extra space" label as learner-writable, but exclude the outer page-frame border and mark-box border. If extraction differs, repair the fragment before validation.'
				].join('\n')
			: sourceDocumentId ===
				  'aqa-history-2020-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp'
				? [
						'',
						'Known fragile checks for History 2020 Paper 1 Section A Option B Germany: Interpretation A in the public insert is withheld for third-party copyright. Do not expose the "cannot be reproduced" placeholder as the learner source. If you build a neutral substitute from official mark-scheme/examiner-report evidence, keep provenance in reviewNotes, keep learner-visible source blocks clean, and set needsHumanReview=false when the assembled question is answerable. Learner-visible Interpretation A text must not include provenance phrases such as "official evidence indicates", "mark scheme evidence", "reconstructed", "source unavailable", or "neutral substitute".',
						'Exact response-line expectations from independent rendered-page judge evidence are: 01.0 = 22, 02.0 = 23, 03.0 = 49 total with 23 lines on page 4 and 26 continuation lines on page 5, 04.0 = 24, 05.0 = 49 total with 23 lines on page 7 and 26 continuation lines on page 8, and 06.0 = 74 total with 22 lines on page 9, 26 lines on page 10, and 26 lines on page 11. If extraction differs, repair the fragment before validation.'
					].join('\n')
				: sourceDocumentId ===
					  'aqa-history-2021-june-paper-1-section-a-option-a-america-1840-1895-expansion-and-consolidation-qp'
					? [
							'',
							'Known fragile checks for History 2021 Paper 1 Section A Option A America: the independent judge found that undercounting the final essay response by two lines blocks D1 import. Count every learner-writable ruled line from rendered pages before validation.',
							'Exact response-line expectations from independent rendered-page judge evidence are: 01.1 = 22, 02.1 = 23, 03.1 = 50 total with 23 lines on page 4 and 27 continuation lines on page 5, 04.1 = 23, 05.1 = 50 total with 23 lines on page 7 and 27 continuation lines on page 8, and 06.1 = 76 total with 22 lines on page 9, 27 lines on page 10, and 27 lines on page 11. Count the ruled line beside/after "Extra space" and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
						].join('\n')
					: sourceDocumentId ===
						  'aqa-history-2021-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp'
						? [
								'',
								'Known fragile checks for History 2021 Paper 1 Section A Option B Germany: independent judging found that Q03, Q05, and Q06 are easy to undercount from broad crops. Count every learner-writable ruled line from rendered pages before validation.',
								'Exact response-line expectations from independent rendered-page judge evidence are: 01.1 = 22, 02.1 = 24, 03.1 = 50 total with 23 lines on page 4 and 27 continuation lines on page 5, 04.1 = 24, 05.1 = 51 total with 24 lines on page 7 and 27 continuation lines on page 8, and 06.1 = 76 total with 23 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count the ruled line beside/after "Extra space" and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
							].join('\n')
						: sourceDocumentId ===
							  'aqa-history-2021-june-paper-1-section-a-option-c-russia-1894-1945-tsardom-and-communism-qp'
							? [
									'',
									'Known fragile checks for History 2021 Paper 1 Section A Option C Russia: the official paper numbers subquestions as 01.0-06.0 in current extraction artifacts. Long written answers are easy to undercount by one line on first pages and extra-space pages.',
									'Exact response-line expectations from independent rendered-page judge evidence are: 01.0 = 22, 02.0 = 24, 03.0 = 51 total with 24 lines on page 4 and 27 continuation lines on page 5, 04.0 = 23, 05.0 = 51 total with 24 lines on page 7 and 27 continuation lines on page 8, and 06.0 = 73 total with 20 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count the ruled line beside/after "Extra space" and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
								].join('\n')
							: sourceDocumentId ===
								  'aqa-history-2021-june-paper-1-section-a-option-d-america-1920-1973-opportunity-and-inequality-qp'
								? [
										'',
										'Known fragile checks for History 2021 Paper 1 Section A Option D America: the official interpretations booklet contains learner-visible Interpretation A and Interpretation B text. For Q01.1-Q03.1, include both complete interpretations and their provenance as visible stemBlocks/source blocks or as a readable present asset; do not leave only "Read Interpretations A and B" or only author names in selfContainedPromptText.',
										'Exact response-line expectations from independent rendered-page judge evidence are: 01.1 = 21, 02.1 = 23, 03.1 = 49 total with 22 lines on page 4 and 27 continuation lines on page 5, 04.1 = 23, 05.1 = 50 total with 23 lines on page 7 and 27 continuation lines on page 8, and 06.1 = 73 total with 20 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count the ruled line beside/after "Extra space" and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
									].join('\n')
								: sourceDocumentId ===
									  'aqa-history-2022-june-paper-1-section-a-option-a-america-1840-1895-expansion-and-consolidation-qp'
									? [
											'',
											'Known fragile checks for History 2022 Paper 1 Section A Option A America: the independent judge found that broad crops undercount Q01, Q03-Q06. Count every learner-writable ruled line from the rendered official PDF before validation.',
											'Exact response-line expectations from independent rendered-page judge evidence are: 01.1 = 21, 02.1 = 22, 03.1 = 49 total with 23 lines on page 4 and 26 continuation lines on page 5, 04.1 = 23, 05.1 = 49 total with 23 lines on page 7 and 26 continuation lines on page 8, and 06.1 = 71 total with 20 lines on page 9, 25 lines on page 10, and 26 lines on page 11. Count the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
										].join('\n')
									: sourceDocumentId ===
										  'aqa-history-2022-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp'
										? [
												'',
												'Known fragile checks for History 2022 Paper 1 Section A Option B Germany: the independent judge found that broad crops undercount Q02-Q05. Count every learner-writable ruled line from the rendered official PDF before validation.',
												'Exact response-line expectations from independent rendered-page judge evidence are: 01.1 = 21, 02.1 = 23, 03.1 = 49 total with 23 lines on page 4 and 26 continuation lines on page 5, 04.1 = 24, 05.1 = 50 total with 24 lines on page 7 and 26 continuation lines on page 8, and 06.1 = 72 total with 21 lines on page 9, 26 lines on page 10, and 25 lines on page 11. Count the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
											].join('\n')
										: sourceDocumentId ===
											  'aqa-history-2022-june-paper-1-section-a-option-c-russia-1894-1945-tsardom-and-communism-qp'
											? [
													'',
													'Known fragile checks for History 2022 Paper 1 Section A Option C Russia: the public insert withholds some interpretation text, so source substitutes must stay learner-clean while line counts still come from rendered pages.',
													'Exact response-line expectations from independent rendered-page judge evidence are: 01.1 = 22, 02.1 = 22, 03.1 = 46 total with 20 lines on page 4 and 26 continuation lines on page 5, 04.1 = 22, 05.1 = 47 total with 21 lines on page 7 and 26 continuation lines on page 8, and 06.1 = 70 total with 18 lines on page 9, 26 lines on page 10, and 26 lines on page 11. Count the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
												].join('\n')
											: sourceDocumentId ===
												  'aqa-history-2022-june-paper-1-section-a-option-d-america-1920-1973-opportunity-and-inequality-qp'
												? [
														'',
														'Known fragile checks for History 2022 Paper 1 Section A Option D America: the independent judge found that broad crops undercount Q01 and Q03-Q06. Count every learner-writable ruled line from the rendered official PDF before validation.',
														'Exact response-line expectations from independent rendered-page judge evidence are: 01.1 = 22, 02.1 = 24, 03.1 = 48 total with 22 lines on page 4 and 26 continuation lines on page 5, 04.1 = 25, 05.1 = 50 total with 24 lines on page 7 and 26 continuation lines on page 8, and 06.1 = 74 total with 21 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
													].join('\n')
												: sourceDocumentId ===
													  'aqa-history-2021-june-paper-1-section-b-option-a-conflict-and-tension-the-first-world-war-1894-1918-qp'
													? [
															'',
															'Known fragile checks for History 2021 Paper 1 Section B Option A First World War: broad crops undercount the ruled response boxes by dropping first lines, continuation-page top lines, or the final inner line above the page frame. Count every learner-writable ruled line from rendered pages before validation.',
															'Exact response-line expectations from independent rendered-page judge evidence are: 01.0 = 21, 02.0 = 76 total with 23 lines on page 3, 26 lines on page 4, and 27 continuation lines on page 5, 03.0 = 51 total with 25 lines on page 6 and 26 continuation lines on page 7, and 04.0 = 102 total with 22 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count the first full-width ruled line below the prompt and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
														].join('\n')
													: sourceDocumentId ===
														  'aqa-history-2022-june-paper-1-section-b-option-a-conflict-and-tension-the-first-world-war-1894-1918-qp'
														? [
																'',
																'Known fragile checks for History 2022 Paper 1 Section B Option A First World War: source image assets must be renderable, and answer-line counts differ from 2021. Count this PDF directly from rendered pages before validation.',
																'Exact response-line expectations from independent rendered-page judge evidence are: 01.0 = 23; 02.0 = 74 total with 23 lines on page 3, 27 lines on page 4, and 24 lines on page 5; 03.0 = 48 total with 24 lines on page 6 and 24 lines on page 7; 04.0 = 101 total with 23 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 24 lines on page 11. Count the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
															].join('\n')
														: sourceDocumentId ===
															  'aqa-history-2021-june-paper-1-section-b-option-b-conflict-and-tension-the-inter-war-years-1918-1939-qp'
															? [
																	'',
																	'Known fragile checks for History 2021 Paper 1 Section B Option B Inter-war Years: broad crops undercount the ruled response boxes by dropping first lines, continuation-page top lines, or the final inner line above the page frame. Count every learner-writable ruled line from rendered pages before validation.',
																	'Exact response-line expectations from independent rendered-page judge evidence are: 01.1 = 22, 02.1 = 77 total with 23 lines on page 3, 27 lines on page 4, and 27 continuation lines on page 5, 03.1 = 52 total with 25 lines on page 6 and 27 continuation lines on page 7, and 04.1 = 103 total with 22 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 27 lines on page 11. Count the first full-width ruled line below the prompt, lines beside/after "Extra space", and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
																].join('\n')
															: sourceDocumentId ===
																  'aqa-history-2021-june-paper-1-section-b-option-c-conflict-and-tension-between-east-and-west-1945-1972-qp'
																? [
																		'',
																		'Known fragile checks for History 2021 Paper 1 Section B Option C East and West: broad crops undercount the ruled response boxes by dropping first lines, continuation-page top lines, or the final inner line above the page frame. Count every learner-writable ruled line from rendered pages before validation.',
																		'Exact response-line expectations from independent rendered-page judge evidence are: 01.0 = 22, 02.0 = 76 total with 23 lines on page 3, 26 lines on page 4, and 27 continuation lines on page 5, 03.0 = 52 total with 25 lines on page 6 and 27 continuation lines on page 7, and 04.0 = 102 total with 21 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 27 lines on page 11. Count the first full-width ruled line below the prompt, lines beside/after "Extra space", and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
																	].join('\n')
																: sourceDocumentId ===
																	  'aqa-history-2021-june-paper-1-section-b-option-d-conflict-and-tension-in-asia-1950-1975-qp'
																	? [
																			'',
																			'Known fragile checks for History 2021 Paper 1 Section B Option D Asia: broad crops undercount the ruled response boxes by dropping first lines, continuation-page top lines, lines beside/after "Extra space", or the final inner line above the page frame. Count every learner-writable ruled line from rendered pages before validation.',
																			'Exact response-line expectations from independent rendered-page judge evidence are: 01.0 = 22, 02.0 = 77 total with 23 lines on page 3, 26 lines on page 4, and 28 continuation lines on page 5, 03.0 = 51 total with 25 lines on page 6 and 26 continuation lines on page 7, and 04.0 = 103 total with 23 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. Count the first full-width ruled line below the prompt, lines beside/after "Extra space", and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
																		].join('\n')
																	: sourceDocumentId ===
																		  'aqa-history-2021-june-paper-2-section-a-option-c-britain-migration-empires-and-the-people-c790-to-the-present-day-qp'
																		? [
																				'',
																				'Known fragile checks for History 2021 Paper 2 Section A Option C Migration: broad crops can undercount or overcount by dropping first/last learner-writable ruled lines or including page-frame borders. Count every response page from rendered pages before validation.',
																				'Exact response-line expectations from independent rendered-page judge evidence are: 01.1 = 47 total with 20 lines on page 2 and 27 lines on page 3; 02.1 = 48 total with 21 lines on page 4 and 27 lines on page 5; 03.1 = 47 total with 20 lines on page 6 and 27 lines on page 7; 04.1 = 97 total with 18 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 25 lines on page 11. Count the first full-width ruled line below the prompt, lines beside/after "Extra space", continuation-page top lines, and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
																			].join('\n')
																		: sourceDocumentId ===
																			  'aqa-history-2021-june-paper-2-section-b-option-b-medieval-england-the-reign-of-edward-i-1272-1307-qp'
																			? [
																					'',
																					'Known fragile checks for History 2021 Paper 2 Section B Option B Medieval England: the independent judge found that broad crops undercounted every long response. Do not reuse the 2020 Section B answer-book pattern; count this PDF directly.',
																					'Exact response-line expectations from independent rendered-page judge evidence are: 01.1 = 48 total with 22 lines on page 2 and 26 lines on page 3; 02.1 = 51 total with 25 lines on page 4 and 26 lines on page 5; 03.1 = 51 total with 25 lines on page 6 and 26 lines on page 7; 04.1 = 96 total with 22 lines on page 8, 26 lines on page 9, 26 lines on page 10, and 22 lines on page 11. Count the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
																				].join('\n')
																			: sourceDocumentId ===
																				  'aqa-history-2021-june-paper-2-section-b-option-d-restoration-england-1660-1685-qp'
																				? [
																						'',
																						'Known fragile checks for History 2021 Paper 2 Section B Option D Restoration England: the independent judge found that broad crops undercounted every long response. Do not reuse the 2020 Section B answer-book pattern; count this PDF directly.',
																						'Exact response-line expectations from independent rendered-page judge evidence are: 01.1 = 48 total with 21 lines on page 2 and 27 lines on page 3; 02.1 = 52 total with 25 lines on page 4 and 27 lines on page 5; 03.1 = 52 total with 25 lines on page 6 and 27 lines on page 7; 04.1 = 97 total with 20 lines on page 8, 26 lines on page 9, 26 lines on page 10, and 25 lines on page 11. Count the first full-width ruled line below the prompt, continuation-page top lines, lines beside/after "Extra space", and the final inner ruled line as learner-writable; exclude only the outer page-frame border. If extraction differs, repair the fragment before validation.'
																					].join('\n')
																				: sourceDocumentId ===
																					  'aqa-history-2024-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp'
																					? [
																							'',
																							'Known fragile checks for History 2024 Paper 1 Section A Option B Germany: Interpretation A in the public insert is withheld for third-party copyright. Do not expose the "cannot be reproduced" placeholder as the learner source. If you build a neutral substitute from official mark-scheme/examiner-report evidence, keep provenance in reviewNotes, keep learner-visible source blocks clean, and set needsHumanReview=false when the assembled question is answerable. Learner-visible Interpretation A text must not include provenance phrases such as "official evidence indicates", "mark scheme evidence", "reconstructed", "source unavailable", or "neutral substitute".',
																							'Exact response-line expectations from independent rendered-page judge evidence are: 01.1 = 22, 02.1 = 24, 03.1 = 50 total with 23 lines on page 4 and 27 continuation lines on page 5, 04.1 = 25, 05.1 = 51 total with 24 lines on page 7 and 27 continuation lines on page 8, and 06.1 = 75 total with 22 lines on page 9, 27 lines on page 10, and 26 lines on page 11. If your extraction differs, repair the fragment before validation.'
																						].join('\n')
																					: sourceDocumentId ===
																						  'aqa-history-2020-june-paper-1-section-b-option-a-conflict-and-tension-the-first-world-war-1894-1918-qp'
																						? [
																								'',
																								'Known fragile checks for History 2020 Paper 1 Section B Option A First World War: count the first ruled answer line immediately below the prompt/mark allocation and the final inner ruled line above the page frame. Exclude only the outer page-frame border. Exact response-line expectations from rendered-page judge evidence are: 01.0 = 22; 02.0 = 76 total with 23 lines on page 3, 26 lines on page 4, and 27 continuation lines on page 5; 03.0 = 51 total with 25 lines on page 6 and 26 continuation lines on page 7; 04.0 = 103 total with 23 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 26 lines on page 11. If extraction or lineCountEvidence differs, repair the fragment before validation.'
																							].join('\n')
																						: sourceDocumentId ===
																							  'aqa-history-2020-june-paper-1-section-b-option-d-conflict-and-tension-in-asia-1950-1975-qp'
																							? [
																									'',
																									'Known fragile checks for History 2020 Paper 1 Section B Option D Asia: count the first ruled answer line immediately below the prompt/mark allocation, every ruled line on continuation pages, the ruled line beside/after "Extra space", and the final inner ruled line above the page frame. Exclude only the outer page-frame border. Exact response-line expectations from rendered-page judge evidence are: 01.0 = 22; 02.0 = 73 total with 22 lines on page 3, 26 lines on page 4, and 25 continuation/Extra space lines on page 5; 03.0 = 48 total with 23 lines on page 6 and 25 continuation/Extra space lines on page 7; 04.0 = 101 total with 23 lines on page 8, 26 lines on page 9, 26 lines on page 10, and 26 continuation/Extra space lines on page 11. If extraction or lineCountEvidence differs, repair the fragment before validation.'
																								].join('\n')
																							: history2020Paper2SectionAIds.has(sourceDocumentId)
																								? [
																										'',
																										'Known fragile checks for History 2020 Paper 2 Section A options: count every visible learner-writable ruled line in the response box, including the first full-width line below the prompt, lines beside/after "Extra space", continuation-page top lines, and the final inner ruled line above the page frame. Exclude only the outer page-frame border. Exact response-line expectations from rendered-page judge evidence and matching answer-book layout are: 01.1 = 49 total with 22 lines on page 2 and 27 lines on page 3; 02.1 = 52 total with 25 lines on page 4 and 27 lines on page 5; 03.1 = 52 total with 25 lines on page 6 and 27 lines on page 7; 04.1 = 101 total with 22 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 25 lines on page 11. If extraction or lineCountEvidence differs, repair the fragment before validation.'
																									].join('\n')
																								: history2020Paper2SectionBIds.has(sourceDocumentId)
																									? [
																											'',
																											'Known fragile checks for History 2020 Paper 2 Section B options: count every visible learner-writable ruled line in the response box, including the first full-width line below the prompt, lines beside/after "Extra space", continuation-page top lines, and the final inner ruled line above the page frame. Exclude only the outer page-frame border. Exact response-line expectations from rendered-page judge evidence and matching answer-book layout are: 01.1 = 48 total with 21 lines on page 2 and 27 lines on page 3; 02.1 = 50 total with 23 lines on page 4 and 27 lines on page 5; 03.1 = 49 total with 22 lines on page 6 and 27 lines on page 7; 04.1 = 98 total with 19 lines on page 8, 27 lines on page 9, 27 lines on page 10, and 25 lines on page 11. If extraction or lineCountEvidence differs, repair the fragment before validation.'
																										].join('\n')
																									: '';
	const historyWithheldSourceSpecificNote =
		sourceDocumentId ===
		'aqa-history-2022-june-paper-2-section-b-option-a-norman-england-c1066-c1100-qp'
			? [
					'',
					'Known fragile checks for History 2022 Paper 2 Section B Option A Norman England: Q01.1 asks about Interpretation A, but the public insert withholds the body text for third-party copyright. A sparse key block with only broad labels such as Focus, Claimants, or William is not publishable. If you create a learner-visible substitute from the official mark scheme/examiner report, make it concrete source-like evidence that lets a student answer "what it says" questions without seeing the original interpretation.',
					'For Q01.1, the learner-visible Interpretation A substitute should include concrete claims from official evidence: the Witan/dead king wishes and uncertainty around choosing the next king; William being shocked because he believed Harold had sworn or supported his claim, with Harold treating the oath as personal/under duress; why William pursuing the claim meant a dangerous invasion involving fleet/troops/Normandy/allies/Papal support; and rival claimant evidence such as Harold Godwinson/Earl of Wessex, Edgar as nearest blood relative but weak, and/or Harald Hardrada. Phrase this as compact Interpretation A/source content, not as mark-scheme evidence, and keep copyright/provenance caveats only in reviewNotes.'
				].join('\n')
			: sourceDocumentId ===
				  'aqa-history-2022-june-paper-2-section-b-option-b-medieval-england-the-reign-of-edward-i-1272-1307-qp'
				? [
						'',
						'Known fragile checks for History 2022 Paper 2 Section B Option B Medieval England: Q01.0 asks about Interpretation A, but the public insert withholds the body text for third-party copyright. If the official mark scheme/examiner report does not provide enough concrete source-like content to reconstruct a learner-safe Interpretation A, do not fabricate it. Keep Q01.0 needsHumanReview=true with a concise copyright/source note; when --allow-unpublishable-source-drops is enabled, the production runner will hold out Q01.0 and continue with the publishable Q02-Q04 rows.'
					].join('\n')
				: '';
	const historyLineNote = [
		historyGeneralNote,
		sourceDocumentId?.startsWith('aqa-history-')
			? 'History line-count notes below are reference evidence for sizing response boxes. Apply the response-line precision policy: exact for short controls, one-line tolerance for 6-10 lines, and about 20% tolerance for long written responses over 10 lines. Do not repair an otherwise usable long essay response solely because its exact line total differs within that tolerance.'
			: '',
		historyPaperSpecificNote,
		historyWithheldSourceSpecificNote,
		historyKnownLineCountPromptNote(sourceDocumentId)
	]
		.filter(Boolean)
		.join('\n');
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
Do not create a custom generator script, extraction synthesizer, or new program that infers question data. Codex must recover the source-derived records in this run. To avoid one huge brittle final JSON response, write those records incrementally as small JSON fragments under question-fragments/ by parent question or source section, then use helper.mjs to assemble, normalize, and validate them. Small PDF/image observation artifacts and figure crops are fine.

Task: extract the whole paper into structured JSON for downstream import. Focus only on question extraction and mark-scheme extraction/alignment. Do not create final answer chains; leave answerChain absent or placeholder-like. A separate Codex run will reconcile answer chains.

Required extraction coverage:
- Atomic sourceQuestionRef values, parentSourceQuestionRef, displayOrder, pageStart/pageEnd, marks, command words, prompt text, self-contained prompt text, context/stem/lead/prompt blocks, response controls, response-line counts, assets, figure/table dependencies, formulae/equations, markSchemeItems, markChecklist, modelAnswer or fixed response answer keys, review flags, and provenance notes.
- Preserve the paper's printed subpart labels in sourceQuestionRef. Do not silently turn alphabetic parts such as (a) and (b) into numeric sibling refs such as .1 and .2. For a top-level question 1 with printed parts (a) and (b) but no printed decimal sub-number, use the app's stable form 01.1a and 01.1b; printed numeric subparts such as 01.1 and 01.2 stay numeric.
- ${expectedQuestionLine}
- ${expectedMarkLine}
- Omit withdrawn questions, replacement notices, statistics-only rows, mean-mark rows, and anything lacking the original prompt plus positive marking criteria.
- If supporting documents include examiner reports, examiners' reports, or similar mark/commentary reports, use them as secondary evidence for common traps, common weak answers, grading warnings, and hint explanations. Do not treat report comments as replacement mark-scheme points; keep positive credit grounded in the mark scheme. For each report-derived trap, cite it in provenance/review notes where possible and put the student-facing distilled trap in commonWeakAnswers.explanation.
- If the question paper contains a learner-facing copyright placeholder such as "not reproduced", "cannot be reproduced", or "third-party copyright restrictions", search supporting documents first. Do not publish that placeholder as the only stimulus. Provide a renderable/structured official source, a neutral official-evidence substitute, or block the row with needsHumanReview when there is not enough evidence.
- When a source/interpretation/image is withheld and you build a neutral learner-visible substitute from official mark-scheme, examiner-report, or booklet evidence, the substitute must include every source detail that the official marking guidance uses to make the question answerable. Preserve critical visual relationships and meanings such as hidden objects, captions, labels, speaker/source identity, contrasts, directionality, or irony. A broad topic summary is not enough. If the official evidence does not let you reconstruct those answer-critical details without revealing the answer, set needsHumanReview=true instead of publishing a sparse substitute.
- Every atomic question must be usable as a learner-facing question. When the printed prompt uses referential wording such as "this investigation", "these data", "the mAbs", "the anomalous result", "other factors", "the sample", "the treatment", "the graph", "Figure/Table is repeated", or similar, include the exact surrounding parent/source stem that defines the reference in stemBlocks or leadBlocks and in selfContainedPromptText. Use contextText only when it adds a compact non-duplicating text-only summary for search/grading; leave it null/empty when the same learner-visible setup is already present in blocks.
- Treat an existing hypothesis as a required source dependency. If the task refers to "their hypothesis", "the hypothesis", "this hypothesis", or asks whether a hypothesis is supported, copy the exact hypothesis statement into a learner-visible stemBlock or leadBlock and into selfContainedPromptText. A mark-scheme inference or selfContainedPromptText-only repair is not enough because the student must see the hypothesis before answering. Do not apply this rule when the task asks the learner to devise a new hypothesis.
- For reaction-specific questions about how pressure changes equilibrium position, direction, or product yield, include the exact reversible equation in a learner-visible equation block. Preserve coefficients, formulae, state symbols, and therefore the molecule/mole count on each side. A generic sentence such as "the forward reaction has fewer molecules" or an equation available only in another subquestion/mark scheme is not a complete learner source.
- For multipart questions, do not rely on a later renderer or judge to rediscover parent context from the PDF. Carry the exact source setup forward to every subpart that needs it, especially investigation descriptions, study/survey setup, graph/table captions and units, figure definitions, named treatments/organisms, and preceding sentences that define abbreviations.
- If an atomic question depends on a figure, image, graph, table, source extract, or data grid printed earlier in the same parent question, carry that earlier dependency forward even when it is not repeated on the same page. This is especially important for prompts like "Image D", "the image", "the graph", "the source", "these data", or "the table" where a later figure encodes data derived from an earlier figure.
- Do not duplicate learner-visible setup between any rendered blocks or between contextText and rendered blocks. Put shared setup, figure/table introductions, and source context in stemBlocks or leadBlocks; keep promptBlocks to the marked instruction/question only. If a sentence appears in stemBlocks/leadBlocks/promptBlocks/afterResponseBlocks, do not copy the same sentence into contextText. For table blocks, put table captions and data in the table block but do not prepend the same paragraph already present in a neighboring paragraph block. selfContainedPromptText may repeat context for standalone grading, but rendered blocks and contextText must not repeat the same sentence.
- For fixed-response, multiple-choice, matching, choice-table, equation-blank, and asset-canvas answer keys, store exact answers in response.correctAnswers plus markSchemeItems/markChecklist. Do not add a redundant modelAnswer that only repeats the fixed answer; modelAnswer is for written-response grading support.
- selfContainedPromptText must make the question standalone without revealing the answer. For equation-blanks, fill-in blanks, graph/table selection, calculation, fixed-choice, logic-gate, diagram-interpretation, and other keyed responses, never place the completed answer, selected option, gate/function name, derived dimensions, calculated intermediate values, or mark-scheme-derived facts in selfContainedPromptText or learner-visible prompt/context blocks. Learner-visible blocks should preserve official source evidence and task wording; put solved facts only in response.correctAnswers, markSchemeItems, markChecklist, or modelAnswer.
- For Computer Science code, SQL, pseudo-code, database, Boolean logic, Huffman/tree/graph, circuit, and truth-table questions, treat the printed code/diagram/skeleton as learner-visible source evidence, not as disposable prose. Reproduce exact visible labels, placeholder letters, line breaks, indentation, brackets, punctuation, table headers, and target positions in stemBlocks/promptBlocks/response metadata. Verify these surfaces from rendered pages or embedded images before final JSON.
- For SQL/program/code skeleton questions with labels such as A, B, C or numbered blanks, the learner-visible blocks must show where each label sits in the official skeleton. Do not flatten a labelled skeleton into a generic sentence like "INSERT INTO ( )", and do not rename official labels to generic "first/second/third" fields.
- If an interactive response control already renders a SQL/code skeleton with blanks, do not duplicate the same skeleton in stemBlocks, leadBlocks, or promptBlocks. Use one learner-visible skeleton surface only: either a structured prompt/code block with a non-duplicating response, or an equation-blanks response that includes the code text and blank targets.
- Prefer faithful structured code/table blocks over extra screenshot assets for simple printed code, SQL skeletons, bit patterns, and small one-line figures. If the structured block fully represents the learner-visible source, omit the image asset. Only attach a screenshot asset when the crop has been visually checked to contain exactly the figure/skeleton and no neighboring prompt text, answer lines, or adjacent question material.
- For Boolean expressions, logic formulae, overbars, subscripts/superscripts, set notation, mathematical fractions, units, and chemical equations, use faithful notation in learner-visible text and model answers. Prefer LaTeX where it prevents ambiguity, for example \`\\overline{A} + B \\cdot C\`; do not use ambiguous plain text such as "A-bar" when the paper shows a NOT bar.
- Use only app response kinds: none, lines, labeled-lines, number-line, choice, choice-table, matching, equation-blanks, asset-canvas, image-label-zones, drawing-box.
- For response.kind "matching", include the learner-visible descriptions/prompts in response.left and the selectable letters/items in response.right. Do not use prompts/options alone; those can normalize, but left/right is the app-rendered shape.
- If the printed task says to complete, finish, balance, or fill in a word, symbol, balanced, chemical, or ionic equation, use response.kind="equation-blanks" with the printed text/math/blank segments in order and a keyed correctAnswers target for every blank. Never replace an equation-completion surface with generic lines or a textarea.
- If the paper asks for two or more separately named written fields, such as Test and Result/Observation, use response.kind="labeled-lines" with one field per exact printed label and the correct visible line count for each. Never merge those fields into one generic textarea.
- Use only app block kinds for learner-visible content: paragraph, figure, table, structured-table, key, ordered-list, bullet-list, equation. For formulae, Boolean expressions, equations, overlines, subscripts/superscripts, fractions, and charges, use block kind "equation" with renderable text/LaTeX notation; do not emit unsupported block kinds such as "formula" or "math".
- Response-line precision policy: exact counts matter for short controls, not long essay boxes. For expected counts of 1-5 visible lines, count exactly. For 6-10 visible lines, a one-line tolerance is acceptable. For long written responses over 10 lines, an approximate count within about 20% is enough; the app renders these as substantial resizable long-answer areas. Do not spend time reconciling every continuation-page ruled line for long essays unless the count is missing, collapsed to an obviously tiny response, or outside a plausible long-answer range.
- For response.kind "lines" and every labeled-lines field, count the number of visible ruled horizontal writing lines in the answer area from rendered pages. Do not infer short line counts from marks or command words, including one-mark "state" questions. Do not count the gaps between rules and do not subtract one from the number of rules; a learner can write on each visible rule. Use rendered-page crops and bash pdf-tools.sh line-count for short written responses and for long responses only enough to size the answer box plausibly. Put brief line-count evidence in response.lineCountEvidence or the field's lineCountEvidence.
- For labeled written responses, count each visible ruled line available for the learner, including the first line beside/after a printed label and any separate "Name" line before a description field. Do not halve or compress line counts because the response has sublabels.
- For calculation and structured-response questions, count both visible working lines and the printed final answer line when both are ruled response lines. Do not treat a labelled final "Answer" line as separate from the learner response area.
- Some official questions combine a fixed selection with written response lines, for example "Ring your chosen method" followed by "How it works" lines. Represent these as response.kind="labeled-lines" with response.choiceOptions containing the fixed choices and response.labels/fields only for the written explanation lines. Do not convert the fixed selection into a writable text line.
- For long written responses, check whether the response space continues on the next page and set pageEnd to the final response page. Sum or estimate the visible ruled lines across pages well enough for the digital box to be long, but do not block or repair solely for small exact count differences on essay-size responses.
- For Computer Science programming papers, code answer grids are response controls. Count writable grid rows from rendered pages across every continuation page. Include every writable row between visible horizontal rules, but do not count prompt text, non-editable starter code outside the answer grid, or a printed closing brace outside the editable grid. If the grid is labelled by vertical guide lines, still count rows from horizontal rules and explain which pages were included.
- For drawing-box and table-trace responses, reproduce the official response surface dimensions exactly. If the printed trace table has an initial row plus six iteration rows, response.rows must include all seven rows. If the printed drawing grid is 4 by 7, response.grid must be { rows: 4, columns: 7 }. Do not infer a smaller response from marks, answer length, or an algorithm trace.
- If the official prompt asks the student to use, draw, sketch, complete, label, or support the answer with one or more diagrams, the learner response needs a diagram-capable surface. Use response.kind="drawing-box" for blank diagram/written-answer spaces, or asset-canvas/image-label-zones when the answer must be drawn on a source graph/image. Do not represent such questions as response.kind="lines" or "labeled-lines" alone; carry any visible ruled-line count in response.lineCount and response.lineCountEvidence metadata.
- For response.kind "equation-blanks", every visible blank segment must have a matching response.correctAnswers target. If two same-side reactants can be in either order, still key both visible blank ids and represent order flexibility explicitly; do not leave an unkeyed blank.
- For source-paper instructions such as "draw a ring around" or "circle" a value in a printed table, prefer a structural table block plus a fixed response (choice or choice-table) whose answer key names the selected cell/value. Do not use asset-canvas for tables that can be represented structurally. If a table absolutely must be an image response surface, the crop must include the complete table data and validation/judging must prove it renders.
- If a question has separately printed SPaG / spelling, punctuation, grammar, or specialist-terminology marks, include those marks in question.marks and represent the SPaG rubric in positive grading evidence. Do not reduce the question to content marks only, and do not store separately awarded SPaG marks only as zero-mark guidance.
- For optional-route papers, extract every printed question/route that can appear in the question bank. Keep official candidate-route totals and "answer any two" instructions as provenance/review notes; do not confuse candidate-route total with the printed extracted-question mark total.
- For fixed-response or multiple-choice options, copy every learner-visible option exactly from the question paper. Do not simplify, modernize, paraphrase, add clarifying words, or merge option text with mark-scheme wording. Verify the selected correct option against both the rendered page and the mark scheme, but keep the option text itself source-verbatim even when the mark scheme abbreviates or slightly rephrases the correct option.
- Mark schemes must be granular enough for grading. Do not compress an official "any two", "any three", or "give two/three" mark scheme into one row. Emit one positive markSchemeItems row per independently awardable mark, normally with marks: 1, and point the matching checklist row(s) at those separate indexes. Put allow/accept/reject/guidance in additional non-positive rows only when useful.
- For markChecklist.required, true means every full-credit answer must satisfy that row. If the official mark scheme says "any one", "any two", "any three", "or", or otherwise lists alternative credited points, do not mark every alternative as required. Either set alternative checklist rows to required=false or use required=true only for the number of mandatory slots/steps that every full-credit answer needs. A question must not have more required checklist rows than its mark value.
- If learner-facing text, contextText, stemBlocks, leadBlocks, or promptBlocks mention "Figure N", "Fig N", or "Table N", the question must also include that dependency in a renderable way. Simple printed code, SQL skeletons, bit patterns, small text figures, and tables may be represented as faithful structured blocks with the same Figure/Table label; keep the official label rather than rewriting it away. Visual diagrams, graphs, image grids, maps, photographs, circuits, and other layout-dependent figures need a matching assets[] entry with a real filePath/publicPath/r2Key unless you can represent the full learner-visible surface structurally without loss. Attach the same figure/table dependency to every atomic subquestion that refers to it; do not rely on another question row to supply it.
- Carry a stem, table, equation, figure, or asset from a prior/lookahead/adjacent page only when this atomic question actually depends on it. Bind every carried dependency to a learner-visible block or response with the exact source label. Visually verify that the crop is relevant to this question and excludes neighboring prompts/assets; keep needsHumanReview=true on the question/asset if relevance or crop identity is not proven.
- For source tables represented structurally, use block kind "structured-table" when there is no column header row, or "table" only with a non-empty columns array and string rows. If the paper labels the table as a figure or table, put that official label directly on the structured block using label or assetLabel, for example label: "Figure 14"; do not rely only on surrounding prose to name the table. For structured-table rows, use renderable cell objects such as {"text":"B"} when practical; the normalizer can accept string cells, but the intended renderer shape is explicit cell text. Do not emit "table" with null/empty columns.
- Use image-label-zones only when the response surface is a real extracted/rendered image asset with assetLabel, label bank, target zones, and correctAnswers. Do not point image-label-zones at a structured table or label-only asset; use a text/choice response plus the structured table context instead, or mark the question for review if faithful interaction is impossible.
- Every figure or response asset used by a renderer must have a local file path that can be uploaded to R2, or an existing publicPath/r2Key. A local-only file path is acceptable in extraction JSON, but validation/import will fail unless the production pipeline derives/uploads the matching R2 object before deployment checks. For official figure/table dependencies, put the official label such as "Figure 3" or "Table 2" directly on the concrete asset via sourceLabel or assetLabel; do not create only a label-only alias while the real file uses a descriptive label such as "graph source". Descriptions can explain what the crop contains, but renderer/audit matching needs the official label on the renderable asset itself.
- Figure and response-surface assets must be complete learner-visible crops from rendered pages or faithful embedded images. Preserve all required axes, scales, legends, graph keys, figure keys, labels, option text, leaf labels, node labels, arrows, captions, source boxes, photos, and full diagram/graph extents. Do not use a crop that only shows part of a graph/photo/tree/circuit/diagram, omits an x-axis or key, clips right-side or bottom labels, loses a figure key that the question depends on, or includes surrounding prompt/answer text from the next question. Do not edit an extracted/rendered asset by adding synthetic labels, OCR-helper text, arrows, boxes, annotations, or other non-official content; only crop or render the official PDF/embedded image content. A figure asset should contain the figure, caption/label, and required key/axes/labels/source boxes/photos only. When embedded images omit keys/captions/axes/labels, create a rendered-page crop that is generous within the figure boundary but stops before unrelated source text. After cropping, use identify or direct image inspection to check that the crop dimensions and visible content plausibly include the whole figure.
- For Ordnance Survey map extracts and other grid-reference maps, the map crop must include the complete map frame plus readable eastings and northings on the relevant margins. Before final validation, inspect every referenced grid square, coordinate label, scale bar, north arrow, and measurement endpoint mentioned by any subquestion. A crop is invalid if it omits a northing/easting needed to locate a grid square such as 0870, 0970, or 7109, or if it clips a labelled point such as X/Y used for a distance or width measurement. Prefer a slightly wider official rendered-page crop over a tight embedded-image crop when margins carry coordinate labels.
- After cropping source assets, run helper validation and repair any asset whose OCR includes surrounding task text such as "Study Figure", "Using Figure", "With the help of Figure", or "Shade one circle only". Those setup/prompt lines must be represented in stemBlocks/promptBlocks, not duplicated inside the source-image crop. Recrop to the figure/table/source boundary before final validation.
- For Computer Science logic-circuit figures and drawing responses, the crop must include every official input label, output label, connector dot, gate, rail, and output line. Do not crop only the central gate box. If the question labels inputs such as A/B/C, D/L/W, F/H/R or an output such as Q/R/D, those labels must be visible in the asset or represented explicitly in a structured response surface tied to the same connector positions.
- For fixed-response answer keys with accepted alternatives, keep one canonical correctAnswer and put the other accepted values in aliases, for example {"targetId":"unicode-w","correctAnswer":"119","aliases":["77"]}. Do not encode alternatives as one literal string such as "119 or 77"; validation and grading treat that as defective.
- Do not use independent aliases when two visible blanks/cells must be paired, such as boundary test data plus expected result. If one accepted value requires one paired expected result and another value requires a different expected result, use labeled/free response fields plus markChecklist/modelAnswer pairing guidance rather than separate fixed-response aliases that would accept wrong cross-pairs.
- Chemistry equations, ionic formulae, state symbols, subscripts/superscripts, charges, physics formulae, fractions, units, rearranged equations, Computer Science Boolean expressions, SQL/program code, binary/hex values, and database/table notation must be verified visually through rendered pages or embedded-image inspection, not trusted to OCR/plain text alone.
- Strip all exam-booklet furniture before writing question JSON. Do not put Additional page text, question-number margin instructions, copyright/footer lines, page-turn instructions, END OF QUESTIONS, blank-page notices, or text from a neighboring question into promptText, selfContainedPromptText, contextText, or render blocks.
- OCR is fallback only. Prefer PDF text layer for exact printed text, rendered pages/contact sheets for layout, embedded-image extraction for figures/tables, and geometry/rendered checks for answer lines.
${fragileLineNote}${geographyLineNote}${historyLineNote}

Useful PDF observation commands. Use the shell helper for commands that call system PDF/image tools; the Codex sandbox can run those tools directly more reliably than nested Node child_process calls:
- bash pdf-tools.sh pdf-info --pdf=question-paper.pdf --output=question-paper.info.txt
- bash pdf-tools.sh pdftotext-pages --pdf=question-paper.pdf --pages=2-4 --output=qp-pages-2-4.txt
- bash pdf-tools.sh render-pages --pdf=question-paper.pdf --pages=1-4 --dpi=180 --output-dir=qp-pages
- bash pdf-tools.sh extract-embedded-images --pdf=question-paper.pdf --output-dir=qp-images --manifest=qp-images.txt
- bash pdf-tools.sh contact-sheet --glob='qp-pages/*.png' --output=qp-contact.jpg --thumb=220x310 --columns=4
- bash pdf-tools.sh crop --image=qp-pages/page-03.png --crop=x,y,width,height --output=q-crop.png
- bash pdf-tools.sh line-count --image=qp-pages/page-09.png --crop=120,150,1180,1800 --threshold=200 --min-run-ratio=0.25 --min-dark-ratio=0.03 --output=page-09-lines.json
- bash pdf-tools.sh crop-page --pdf=question-paper.pdf --page=3 --bbox=x1,y1,x2,y2 --dpi=180 --output=q-page-crop.png
- bash pdf-tools.sh line-count --image=qp-pages/page-03.png --crop=x,y,width,height --output=q-lines.json

Useful JSON normalization and validation commands:
- node helper.mjs assemble-extraction-fragments --fragments-dir=question-fragments --output=extraction.json --metadata=metadata.json
- node helper.mjs normalize-extraction --input=extraction.json --output=normalized-extraction.json --metadata=metadata.json
- node helper.mjs validate-extraction --input=normalized-extraction.json${
		expectedMarks === null ? '' : ` --expected-marks=${expectedMarks}`
	}${
		expectedQuestions === null ? '' : ` --expected-questions=${expectedQuestions}`
	} --output=validation.json

Required write workflow:
1. Create question-fragments/ early.
2. As soon as a parent question or source section is fully observed, write one JSON fragment file such as question-fragments/q01.json containing { "questions": [...] }. Do not wait until the whole paper is observed before writing any question data.
3. Keep each fragment small enough to inspect and repair directly. A fragment may include reviewNotes and localAssetManifest entries for assets used by its questions.
4. After all fragments are written, run assemble-extraction-fragments to create extraction.json.
5. Then run normalize-extraction and validate-extraction.

If validation fails, repair the relevant question-fragments/*.json file, rerun assemble-extraction-fragments, normalize-extraction, and validate-extraction until validation.json passes or a genuine source defect remains. A passing run should leave:
- question-fragments/*.json
- extraction.json
- normalized-extraction.json
- validation.json

Finish with a concise final message listing question count, mark total, any unresolved review refs, and artifact paths.`;
}

function ensureNormalizedExtraction() {
	const normalizedPath = path.join(workDir, 'normalized-extraction.json');
	if (existsSync(normalizedPath)) return normalizedPath;
	if (!existsSync(path.join(workDir, 'extraction.json'))) {
		const fragmentsDir = path.join(workDir, 'question-fragments');
		if (!existsSync(fragmentsDir)) throw new Error('Codex did not write extraction.json.');
		runHelper([
			'assemble-extraction-fragments',
			'--fragments-dir=question-fragments',
			'--output=extraction.json',
			'--metadata=metadata.json'
		]);
	}
	runHelper([
		'normalize-extraction',
		'--input=extraction.json',
		'--output=normalized-extraction.json',
		'--metadata=metadata.json'
	]);
	return normalizedPath;
}

function validateExtraction(normalizedPath, { allowFailure = false } = {}) {
	const args = validateExtractionArgs(normalizedPath);
	const result = runHelperResult(args);
	const validationPath = path.join(workDir, 'validation.json');
	if (result.status !== 0) {
		if (allowFailure && existsSync(validationPath)) {
			return {
				validation: readJson(validationPath),
				failed: true,
				error: helperError('validate-extraction', result).message
			};
		}
		throw helperError('validate-extraction', result);
	}
	return { validation: readJson(validationPath), failed: false };
}

function validateExtractionArgs(normalizedPath) {
	const args = [
		'validate-extraction',
		`--input=${path.basename(normalizedPath)}`,
		'--output=validation.json'
	];
	if (expectedMarks !== null) args.push(`--expected-marks=${expectedMarks}`);
	if (expectedQuestions !== null) args.push(`--expected-questions=${expectedQuestions}`);
	return args;
}

function writePublishableExtractionSubset(normalizedPath, failedValidation) {
	const paper = readJson(normalizedPath);
	const issueMap = deterministicIssueMap(paper, failedValidation);
	const keptQuestions = [];
	const dropped = [];
	for (const question of paper.questions ?? []) {
		const issues = issueMap.get(question.sourceQuestionRef) ?? [];
		if (isAllowedUnpublishableSourceDrop(question, issues)) {
			dropped.push({
				sourceQuestionRef: question.sourceQuestionRef,
				reasons: allowedDropReasons(question, issues)
			});
			continue;
		}
		keptQuestions.push(question);
	}
	if (dropped.length === 0) {
		throw new Error(
			'Extraction validation failed, but no known unpublishable-source question was eligible to drop.'
		);
	}
	const output = {
		...paper,
		questions: keptQuestions,
		extractionRun: {
			...(paper.extractionRun ?? {}),
			publishableSubset: true,
			publishableSubsetSource: relative(normalizedPath),
			droppedUnpublishableSourceQuestions: dropped,
			droppedUnpublishableSourceQuestionRefs: dropped.map((item) => item.sourceQuestionRef)
		}
	};
	const outputPath = path.join(workDir, 'normalized-extraction.publishable.json');
	writeJson(outputPath, output);
	return { outputPath, dropped };
}

function deterministicIssueMap(paper, validation) {
	const map = new Map();
	for (const finding of validation?.deterministicIssues ?? []) {
		if (!finding.sourceQuestionRef) continue;
		map.set(finding.sourceQuestionRef, finding.issues ?? []);
	}
	if (map.size > 0) return map;
	for (const finding of deterministicCandidateIssues(paper)) {
		if (!finding.sourceQuestionRef) continue;
		map.set(finding.sourceQuestionRef, finding.issues ?? []);
	}
	return map;
}

function isAllowedUnpublishableSourceDrop(question, issues) {
	return issues.some((issue) => issue.code === 'known_unresolved_copyright_source');
}

function allowedDropReasons(question, issues) {
	const reasons = [];
	if (question?.needsHumanReview === true) reasons.push('question_needs_human_review');
	for (const issue of issues) {
		if (issue.code === 'known_unresolved_copyright_source') reasons.push(issue.code);
	}
	return [...new Set(reasons)];
}

function runHelper(args) {
	const result = runHelperResult(args);
	if (result.status !== 0) {
		throw helperError(args[0], result);
	}
	if (result.stdout.trim()) process.stderr.write(result.stdout);
	if (result.stderr.trim()) process.stderr.write(result.stderr);
}

function runHelperResult(args) {
	return spawnSync(process.execPath, ['helper.mjs', ...args], {
		cwd: workDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 64 * 1024 * 1024
	});
}

function helperError(label, result) {
	return new Error(
		`helper ${label} failed with exit code ${result.status ?? result.signal}.\n${result.stdout}\n${result.stderr}`
	);
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

function readJsonIfExists(filePath) {
	return existsSync(filePath) ? readJson(filePath) : null;
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
