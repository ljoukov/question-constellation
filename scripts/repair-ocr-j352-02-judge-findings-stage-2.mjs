#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { binaryArtifact, jsonArtifact } from './lib/codex-phase-artifacts.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const sourceDocumentId = 'ocr-j352-02-qp-jun24';
const failedEvidenceRoot =
	'tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-02-qp-jun24/failed-judge-20260717T025100Z';
const candidatePath = resolveArg('candidate', `${failedEvidenceRoot}/failed-candidate.json`);
const judgeReportPath = resolveArg('judge-report', `${failedEvidenceRoot}/judge-report.json`);
const previousRepairEvidencePath = resolveArg(
	'previous-repair-evidence',
	'docs/release-evidence/ocr-j352-02-reviewed-judge-repair.json'
);
const questionPaperPath = resolveArg(
	'question-paper',
	'data/ocr-gcse-english-literature/question-papers/OCR-J352-02-QP-JUN24.PDF'
);
const markSchemePath = resolveArg(
	'mark-scheme',
	'data/ocr-gcse-english-literature/mark-schemes/OCR-J352-02-MS-JUN24.PDF'
);
const outputPath = path.resolve(
	rootDir,
	stringArg(
		'output',
		'tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-02-qp-jun24/stage-2-repaired-extraction.json'
	)
);
const validationPath = path.resolve(
	rootDir,
	stringArg(
		'validation',
		'tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-02-qp-jun24/stage-2-validation.json'
	)
);
const evidencePath = path.resolve(
	rootDir,
	stringArg('evidence', 'docs/release-evidence/ocr-j352-02-reviewed-judge-repair-stage-2.json')
);
const expectedHashes = {
	candidate: 'ce99c660d727de76aba5ccad825ccbc97c3c4ae42ee2020d56a2b646983d4320',
	judgeReport: '3ee81d07d18cd85f02c18b0c68c2a5e4f3e10d8dfeeeeed1a8a6bbcf07becb30',
	previousRepairEvidence: '48f8d4e36d22fb31b45a80d9bb6e01a13b7bac03d2feb7d7dc8e5557840eaa8d',
	questionPaper: 'c0f3be806bddf97e106ac6a1c3ff57e676871c83a68a086eaad97cf0f2017574',
	markScheme: 'c0981d3849667c48d0a9ca553ca312688766058b0c55df66a3a115e3c86be04b'
};
const inputs = {
	candidate: checkedArtifact(candidatePath, expectedHashes.candidate, true),
	judgeReport: checkedArtifact(judgeReportPath, expectedHashes.judgeReport, true),
	previousRepairEvidence: checkedArtifact(
		previousRepairEvidencePath,
		expectedHashes.previousRepairEvidence,
		true
	),
	questionPaper: checkedArtifact(questionPaperPath, expectedHashes.questionPaper),
	markScheme: checkedArtifact(markSchemePath, expectedHashes.markScheme)
};
const previousRepairEvidence = readJson(previousRepairEvidencePath);
if (
	previousRepairEvidence?.schemaVersion !== 'codex-reviewed-extraction-repair-v1' ||
	previousRepairEvidence?.status !== 'passed' ||
	previousRepairEvidence?.sourceDocumentId !== sourceDocumentId ||
	previousRepairEvidence?.outputArtifact?.sha256 !== inputs.candidate.sha256 ||
	previousRepairEvidence?.invariants?.noOtherFieldsChanged !== true
) {
	throw new Error(
		'First-stage J352/02 evidence does not bind exactly to the second failed candidate.'
	);
}

const candidate = readJson(candidatePath);
const judgeReport = readJson(judgeReportPath);
assertCandidateContract(candidate);
assertFailedJudgeContract(judgeReport);
const repaired = structuredClone(candidate);
const repairs = [
	addExactTitleBlock('05.1', 'Romeo and Juliet'),
	addExactTitleBlock('09.1', 'Macbeth'),
	addExactTitleBlock('11.1', 'Much Ado About Nothing')
];
const changedPaths = deepChangedPaths(candidate, repaired);
const expectedChangedPaths = [
	'questions[7].stemBlocks',
	'questions[11].stemBlocks',
	'questions[13].stemBlocks'
];
if (JSON.stringify(changedPaths) !== JSON.stringify(expectedChangedPaths)) {
	throw new Error(
		`Second-stage J352/02 repair escaped the three reviewed fields: ${JSON.stringify({ changedPaths, expectedChangedPaths })}`
	);
}

writeJson(outputPath, repaired);
runValidation();
const validation = readJson(validationPath);
if (
	validation.status !== 'passed' ||
	validation.questionCount !== 14 ||
	validation.markTotal !== 440 ||
	(validation.blockingIssues ?? []).length !== 0
) {
	throw new Error(`Second-stage J352/02 candidate did not validate: ${JSON.stringify(validation)}`);
}
const evidence = {
	schemaVersion: 'codex-reviewed-extraction-repair-v1',
	status: 'passed',
	sourceDocumentId,
	basis:
		'Three-field second-stage deterministic repair bounded to the complete second failed independent judge report. It adds only the three official whole-text play headings as pre-prompt learner-visible blocks and explicitly chains to the first reviewed repair evidence.',
	inputs,
	previousRepair: {
		artifact: inputs.previousRepairEvidence,
		outputArtifact: previousRepairEvidence.outputArtifact,
		changedPaths: previousRepairEvidence.changedPaths
	},
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
		exactFirstStageCandidateHash: true,
		exactSecondFailedJudgeHash: true,
		exactPreviousRepairEvidenceHash: true,
		exactOfficialPdfHashes: true,
		requiredRepairGroupCountExact: judgeReport.requiredRepairs.length === 1,
		changedFieldCountExact: changedPaths.length === 3,
		noOtherFieldsChanged: true,
		questionCountPreserved: validation.questionCount === 14,
		markTotalPreserved: validation.markTotal === 440,
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

function addExactTitleBlock(sourceQuestionRef, title) {
	const question = questionByRef(repaired, sourceQuestionRef);
	if (
		question.contextText !== null ||
		!Array.isArray(question.stemBlocks) ||
		question.stemBlocks.length !== 0
	) {
		throw new Error(`${sourceQuestionRef} learner-visible context changed before repair.`);
	}
	if (!question.selfContainedPromptText?.startsWith(`In ${title},`)) {
		throw new Error(
			`${sourceQuestionRef} does not retain the same official title in source metadata.`
		);
	}
	question.stemBlocks.push({
		kind: 'paragraph',
		text: title,
		label: 'Play',
		assetLabel: null,
		assetId: null,
		columns: null,
		rows: null,
		items: null,
		keyItems: null,
		compact: null,
		wide: null
	});
	return {
		sourceQuestionRef,
		field: 'stemBlocks',
		before: [],
		after: [{ kind: 'paragraph', label: 'Play', text: title }],
		officialAnchor: `Question paper heading immediately before ${sourceQuestionRef}: ${title}.`,
		judgeFinding: 'Restores the printed whole-text work heading before the marked prompt.'
	};
}

function assertCandidateContract(paper) {
	if (paper?.sourceDocument?.id !== sourceDocumentId) {
		throw new Error(`Candidate source mismatch: ${paper?.sourceDocument?.id ?? 'missing'}`);
	}
	const questions = paper?.questions ?? [];
	if (questions.length !== 14 || questions.reduce((sum, entry) => sum + entry.marks, 0) !== 440) {
		throw new Error('J352/02 inventory no longer equals 14 questions / 440 bank marks.');
	}
	for (const [index, ref] of [
		[7, '05.1'],
		[11, '09.1'],
		[13, '11.1']
	]) {
		if (questions[index]?.sourceQuestionRef !== ref) {
			throw new Error(`${ref} no longer occupies reviewed index ${index}.`);
		}
	}
}

function assertFailedJudgeContract(report) {
	const repair = report?.requiredRepairs?.[0];
	if (
		report?.status !== 'failed' ||
		report?.verdict !== 'fail' ||
		Number(report?.score) !== 0.96 ||
		report?.questionCount !== 14 ||
		report?.markTotal !== 440 ||
		!Array.isArray(report?.checkedRefs) ||
		report.checkedRefs.length !== 14 ||
		!Array.isArray(report?.requiredRepairs) ||
		report.requiredRepairs.length !== 1 ||
		JSON.stringify(repair?.sourceQuestionRefs) !== JSON.stringify(['05.1', '09.1', '11.1'])
	) {
		throw new Error('Second failed J352/02 judge no longer has the exact three-title contract.');
	}
}

function questionByRef(paper, sourceQuestionRef) {
	const matches = paper.questions.filter((entry) => entry.sourceQuestionRef === sourceQuestionRef);
	if (matches.length !== 1) {
		throw new Error(`${sourceQuestionRef}: expected one question, found ${matches.length}.`);
	}
	return matches[0];
}

function runValidation() {
	const result = spawnSync(
		process.execPath,
		[
			'scripts/codex-import-helper.mjs',
			'validate-extraction',
			`--input=${outputPath}`,
			'--expected-marks=440',
			'--expected-questions=14',
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
		throw new Error(`Second-stage J352/02 validation failed.\n${result.stdout}\n${result.stderr}`);
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
