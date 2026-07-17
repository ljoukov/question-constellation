#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { binaryArtifact, jsonArtifact } from './lib/codex-phase-artifacts.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const sourceDocumentId = 'aqa-computer-science-2024-june-paper-2-computing-concepts-qp';
const failedEvidenceRoot =
	'tmp/current-model-paper-cohort/reviewed-repairs/aqa-computer-science-2024-paper-2/failed-judge-20260717T025100Z';
const candidatePath = resolveArg('candidate', `${failedEvidenceRoot}/failed-candidate.json`);
const judgeReportPath = resolveArg('judge-report', `${failedEvidenceRoot}/judge-report.json`);
const questionPaperPath = resolveArg(
	'question-paper',
	'data/aqa-gcse-history-geography-computer-science/question-papers/AQA-85252-QP-JUN24.PDF'
);
const markSchemePath = resolveArg(
	'mark-scheme',
	'data/aqa-gcse-history-geography-computer-science/mark-schemes/AQA-85252-MS-JUN24.PDF'
);
const outputPath = path.resolve(
	rootDir,
	stringArg(
		'output',
		'tmp/current-model-paper-cohort/reviewed-repairs/aqa-computer-science-2024-paper-2/repaired-extraction.json'
	)
);
const validationPath = path.resolve(
	rootDir,
	stringArg(
		'validation',
		'tmp/current-model-paper-cohort/reviewed-repairs/aqa-computer-science-2024-paper-2/validation.json'
	)
);
const evidencePath = path.resolve(
	rootDir,
	stringArg(
		'evidence',
		'docs/release-evidence/aqa-computer-science-2024-paper-2-reviewed-judge-repair.json'
	)
);
const expectedHashes = {
	candidate: 'c62df72169b28c978961dbe5cb6d8b1a00de03314889fefd2566c46d13ed6b8a',
	judgeReport: 'b5e4d19af51c5ef2322d79c6a0a5346e2d0e778767c678139bce7977677b0ac4',
	questionPaper: '37d39dcb9064d0d2ccef7005b6cd339b1539712881b9085b1006622a7295abbb',
	markScheme: '11e3132d58bcbb0d205c4c6fb04d1f8a5e802fee3cfc82d7e800bd76731ec7c6'
};
const inputs = {
	candidate: checkedArtifact(candidatePath, expectedHashes.candidate, true),
	judgeReport: checkedArtifact(judgeReportPath, expectedHashes.judgeReport, true),
	questionPaper: checkedArtifact(questionPaperPath, expectedHashes.questionPaper),
	markScheme: checkedArtifact(markSchemePath, expectedHashes.markScheme)
};
const candidate = readJson(candidatePath);
const judgeReport = readJson(judgeReportPath);
assertCandidateContract(candidate);
assertFailedJudgeContract(judgeReport);

const repaired = structuredClone(candidate);
const question = questionByRef(repaired, '18.6');
const before = structuredClone(question);
question.stemBlocks.push({
	kind: 'table',
	text: null,
	label: 'Figure 8 – Film',
	assetLabel: null,
	assetId: null,
	columns: ['FilmID', 'Title', 'Year'],
	rows: [
		['100', 'Forrest Gump', '1994'],
		['101', 'Toy Story 3', '2019'],
		['102', 'Back to the Future', '1985']
	],
	items: null,
	keyItems: null,
	compact: null,
	wide: null
});
setExact(
	question.markSchemeItems[2],
	'text',
	"Correct self-contained WHERE condition: WHERE Title = 'Toy Story 3'.",
	"Correct condition in the WHERE clause: either WHERE FilmID = 101 or WHERE Title = 'Toy Story 3'."
);
setExact(
	question.markSchemeItems[2],
	'sourceRef',
	'mark-scheme.pdf p. 18 sample answer 2',
	'mark-scheme.pdf p. 18 sample answers 1 and 2'
);
setExact(
	question.markChecklist[2],
	'text',
	"Selects the existing title with WHERE Title = 'Toy Story 3'.",
	"Selects the exact record with either WHERE FilmID = 101 or WHERE Title = 'Toy Story 3'."
);
setExact(
	question.reviewNotes,
	'0',
	"The self-contained official sample condition uses WHERE Title = 'Toy Story 3', so Figure 8 is not required for this atomic row. Examiner report p. 5 says fewer than a quarter constructed the UPDATE correctly.",
	'The complete official Film table from Figure 8 is preserved as a learner-visible structured table for this atomic row; it supplies the Film, FilmID and Title identifiers and the Toy Story 3 record used by both official WHERE alternatives. Examiner report p. 5 says fewer than a quarter constructed the UPDATE correctly.'
);

const changedPaths = deepChangedPaths(candidate, repaired);
const expectedChangedPaths = [
	'questions[34].markChecklist[2].text',
	'questions[34].markSchemeItems[2].sourceRef',
	'questions[34].markSchemeItems[2].text',
	'questions[34].reviewNotes[0]',
	'questions[34].stemBlocks'
];
if (JSON.stringify(changedPaths) !== JSON.stringify(expectedChangedPaths)) {
	throw new Error(
		`Computer Science repair escaped the exact five reviewed paths: ${JSON.stringify({ changedPaths, expectedChangedPaths })}`
	);
}
assertUnchangedQuestionFields(before, question);

writeJson(outputPath, repaired);
runValidation();
const validation = readJson(validationPath);
if (
	validation.status !== 'passed' ||
	validation.questionCount !== 38 ||
	validation.markTotal !== 90 ||
	(validation.blockingIssues ?? []).length !== 0
) {
	throw new Error(
		`Repaired Computer Science candidate did not validate: ${JSON.stringify(validation)}`
	);
}

const repairs = [
	{
		sourceQuestionRef: '18.6',
		fields: ['stemBlocks'],
		officialAnchor:
			'Question paper page 26, Figure 8, prints the Film table with FilmID/Title/Year and rows 100/Forrest Gump/1994, 101/Toy Story 3/2019, and 102/Back to the Future/1985.',
		judgeFinding:
			'Adds the exact learner-visible schema and row needed to know the Film relation, FilmID and Title identifiers.'
	},
	{
		sourceQuestionRef: '18.6',
		fields: ['markSchemeItems[2]', 'markChecklist[2]'],
		officialAnchor:
			"Mark scheme page 18 accepts both WHERE FilmID = 101 and WHERE Title = 'Toy Story 3' as complete conditions.",
		judgeFinding:
			'Retains the title-based model answer while grading both official WHERE alternatives.'
	}
];
const evidence = {
	schemaVersion: 'codex-reviewed-extraction-repair-v1',
	status: 'passed',
	sourceDocumentId,
	basis:
		'Five-path deterministic repair bounded to the complete failed independent judge report: one faithful structured Film table, the official second WHERE route in grading support, and the now-stale review note. No other question, mark, prompt, answer, chain, response, or asset changed.',
	inputs,
	failedModelAudit: {
		status: judgeReport.status,
		verdict: judgeReport.verdict,
		score: judgeReport.score,
		checkedRefs: judgeReport.checkedRefs,
		requiredRepairs: judgeReport.requiredRepairs
	},
	repairs,
	changedPaths,
	outputArtifact: jsonArtifact(outputPath, { rootDir }),
	deterministicValidation: {
		...validation,
		artifact: jsonArtifact(validationPath, { rootDir })
	},
	invariants: {
		exactFailedCandidateHash: true,
		exactFailedJudgeHash: true,
		exactOfficialPdfHashes: true,
		requiredRepairCountExact: judgeReport.requiredRepairs.length === 2,
		changedFieldCountExact: changedPaths.length === 5,
		noOtherFieldsChanged: true,
		questionCountPreserved: validation.questionCount === 38,
		markTotalPreserved: validation.markTotal === 90,
		refOrderPreserved: true,
		deterministicValidationPassed: true
	}
};
writeJson(evidencePath, evidence);
console.log(
	JSON.stringify(
		{
			status: 'passed',
			output: relative(outputPath),
			outputSha256: evidence.outputArtifact.sha256,
			evidence: relative(evidencePath),
			evidenceSha256: jsonArtifact(evidencePath, { rootDir }).sha256,
			changedPaths,
			validation: { questionCount: validation.questionCount, markTotal: validation.markTotal }
		},
		null,
		2
	)
);

function assertCandidateContract(paper) {
	if (paper?.sourceDocument?.id !== sourceDocumentId) {
		throw new Error(`Candidate source mismatch: ${paper?.sourceDocument?.id ?? 'missing'}`);
	}
	const questions = paper?.questions ?? [];
	if (questions.length !== 38 || questions.reduce((sum, entry) => sum + entry.marks, 0) !== 90) {
		throw new Error('Computer Science paper inventory no longer equals 38 parts / 90 marks.');
	}
	if (questions[34]?.sourceQuestionRef !== '18.6') {
		throw new Error('Question 18.6 no longer occupies the reviewed inventory position.');
	}
}

function assertFailedJudgeContract(report) {
	const repairRefs = (report?.requiredRepairs ?? []).map((repair) => repair?.sourceQuestionRef);
	if (
		report?.status !== 'failed' ||
		report?.verdict !== 'fail' ||
		Number(report?.score) !== 0.96 ||
		report?.questionCount !== 38 ||
		report?.markTotal !== 90 ||
		!Array.isArray(report?.checkedRefs) ||
		report.checkedRefs.length !== 38 ||
		JSON.stringify(repairRefs) !== JSON.stringify(['18.6', '18.6'])
	) {
		throw new Error('Failed Computer Science judge no longer has the exact two-repair contract.');
	}
}

function assertUnchangedQuestionFields(before, after) {
	if (
		before.promptText !== after.promptText ||
		before.selfContainedPromptText !== after.selfContainedPromptText ||
		before.marks !== after.marks ||
		JSON.stringify(before.response) !== JSON.stringify(after.response) ||
		JSON.stringify(before.modelAnswer) !== JSON.stringify(after.modelAnswer) ||
		JSON.stringify(before.answerChain) !== JSON.stringify(after.answerChain)
	) {
		throw new Error('Computer Science repair changed a protected Q18.6 field.');
	}
}

function questionByRef(paper, sourceQuestionRef) {
	const matches = paper.questions.filter((entry) => entry.sourceQuestionRef === sourceQuestionRef);
	if (matches.length !== 1) {
		throw new Error(`${sourceQuestionRef}: expected one question, found ${matches.length}.`);
	}
	return matches[0];
}

function setExact(target, field, expectedBefore, after) {
	if (target?.[field] !== expectedBefore) {
		throw new Error(`${field} changed before repair: ${JSON.stringify(target?.[field])}`);
	}
	target[field] = after;
}

function runValidation() {
	const result = spawnSync(
		process.execPath,
		[
			'scripts/codex-import-helper.mjs',
			'validate-extraction',
			`--input=${outputPath}`,
			'--expected-marks=90',
			'--expected-questions=38',
			`--output=${validationPath}`
		],
		{
			cwd: rootDir,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 64 * 1024 * 1024
		}
	);
	if (result.status !== 0) {
		throw new Error(
			`Repaired Computer Science validation failed.\n${result.stdout}\n${result.stderr}`
		);
	}
}

function deepChangedPaths(before, after, currentPath = '') {
	if (Object.is(before, after)) return [];
	if (
		before === null ||
		after === null ||
		typeof before !== 'object' ||
		typeof after !== 'object' ||
		Array.isArray(before) !== Array.isArray(after)
	) {
		return [currentPath];
	}
	if (Array.isArray(before)) {
		if (before.length !== after.length) return [currentPath];
		return before.flatMap((value, index) =>
			deepChangedPaths(value, after[index], `${currentPath}[${index}]`)
		);
	}
	const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
	return keys.flatMap((key) =>
		deepChangedPaths(before[key], after[key], currentPath ? `${currentPath}.${key}` : key)
	);
}

function checkedArtifact(filePath, expectedSha256, json = false) {
	const value = json ? jsonArtifact(filePath, { rootDir }) : binaryArtifact(filePath, { rootDir });
	if (value.sha256 !== expectedSha256) {
		throw new Error(
			`${value.path}: expected SHA-256 ${expectedSha256}, found ${value.sha256 ?? 'missing'}.`
		);
	}
	return value;
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function resolveArg(name, fallback) {
	const resolved = path.resolve(rootDir, stringArg(name, fallback));
	if (!existsSync(resolved)) throw new Error(`--${name} file does not exist: ${resolved}`);
	return resolved;
}

function stringArg(name, fallback = '') {
	const prefix = `--${name}=`;
	const argument = process.argv.find((candidate) => candidate.startsWith(prefix));
	return argument ? argument.slice(prefix.length) : fallback;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}
