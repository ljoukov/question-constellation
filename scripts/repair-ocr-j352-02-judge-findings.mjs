#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { binaryArtifact, jsonArtifact } from './lib/codex-phase-artifacts.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const sourceDocumentId = 'ocr-j352-02-qp-jun24';
const candidatePath = resolveArg(
	'candidate',
	'tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-02-qp-jun24/failed-judge-20260717T0207Z/failed-candidate.json'
);
const judgeReportPath = resolveArg(
	'judge-report',
	'tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-02-qp-jun24/failed-judge-20260717T0207Z/judge-report.json'
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
		'tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-02-qp-jun24/repaired-extraction.json'
	)
);
const validationPath = path.resolve(
	rootDir,
	stringArg(
		'validation',
		'tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-02-qp-jun24/validation.json'
	)
);
const evidencePath = path.resolve(
	rootDir,
	stringArg('evidence', 'docs/release-evidence/ocr-j352-02-reviewed-judge-repair.json')
);

const expectedHashes = {
	candidate: '6befb95965c174bc17f2013154907240c5fba5691c0be9930f8349df31bf8bc9',
	judgeReport: '8a9fd42786c932f05d60e81bcf0ab676abdc12b71a13df7b946a57c1e54fe6a1',
	questionPaper: 'c0f3be806bddf97e106ac6a1c3ff57e676871c83a68a086eaad97cf0f2017574',
	markScheme: 'c0981d3849667c48d0a9ca553ca312688766058b0c55df66a3a115e3c86be04b'
};
const inputs = {
	candidate: checkedJsonArtifact(candidatePath, expectedHashes.candidate),
	judgeReport: checkedJsonArtifact(judgeReportPath, expectedHashes.judgeReport),
	questionPaper: checkedJsonArtifact(questionPaperPath, expectedHashes.questionPaper, false),
	markScheme: checkedJsonArtifact(markSchemePath, expectedHashes.markScheme, false)
};
const candidate = readJson(candidatePath);
const judgeReport = readJson(judgeReportPath);
assertFailedJudgeContract(judgeReport);
if (candidate?.sourceDocument?.id !== sourceDocumentId) {
	throw new Error(`Candidate source mismatch: ${candidate?.sourceDocument?.id ?? 'missing'}`);
}

const repaired = structuredClone(candidate);
const repairs = [];
setExactField(
	'01.1b',
	'contextText',
	null,
	'This question is from the OCR Love and Relationships poetry cluster. Choose one anthology poem other than ‘Love After Love’.',
	'Question paper PDF page 4 prints the Love and Relationships cluster, the paired Love After Love route, and the part-(b) instruction.',
	'Adds the cluster and exclusion to the learner-visible assembled context.'
);
setExactField(
	'02.1b',
	'contextText',
	null,
	'This question is from the OCR Conflict poetry cluster. Choose one anthology poem other than ‘Songs for the People’.',
	'Question paper PDF page 6 prints the Conflict cluster, the paired Songs for the People route, and the part-(b) instruction.',
	'Adds the cluster and exclusion to the learner-visible assembled context.'
);
setExactField(
	'03.1b',
	'contextText',
	null,
	'This question is from the OCR Youth and Age poetry cluster. Choose one anthology poem other than ‘Holy Thursday’.',
	'Question paper PDF page 8 prints the Youth and Age cluster, the paired Holy Thursday route, and the part-(b) instruction.',
	'Adds the cluster and exclusion to the learner-visible assembled context.'
);
setExactField(
	'07.1',
	'contextText',
	null,
	'The Merchant of Venice by William Shakespeare',
	'Question paper PDF page 11 prints The Merchant of Venice immediately before Q6/Q7.',
	'Gives “this play” an explicit learner-visible referent.'
);

const modelAnswerQuestion = questionByRef(repaired, '01.1b');
const wrongOrangeSentence =
	'The image of an unpeeled orange makes the new relationship seem sweet, refreshing and still waiting to be discovered; at the same time, the Wedgwood plate suggests something precious but fragile.';
const correctedOrangeSentence =
	'The image of ‘an orange, peeled / and quartered’ makes the new relationship seem sweet, generous and ready to be shared; at the same time, the Wedgwood plate suggests something precious but fragile.';
const beforeModelAnswer = String(modelAnswerQuestion?.modelAnswer?.answerText ?? '');
if (!beforeModelAnswer.includes(wrongOrangeSentence)) {
	throw new Error('01.1b model answer no longer contains the exact independently judged defect.');
}
const afterModelAnswer = beforeModelAnswer.replace(wrongOrangeSentence, correctedOrangeSentence);
modelAnswerQuestion.modelAnswer.answerText = afterModelAnswer;
repairs.push({
	sourceQuestionRef: '01.1b',
	field: 'modelAnswer.answerText',
	before: beforeModelAnswer,
	after: afterModelAnswer,
	officialAnchor:
		'Mark scheme PDF page 21 names Flirtation as valid and cites its sensual imagery; the preserved failed judge report identifies the exact reversed “unpeeled” detail and required correction.',
	judgeFinding:
		'Corrects the reversed orange detail and removes the interpretation that depended on it.'
});

assertWholePaperInventory(repaired);
const changedPaths = deepChangedPaths(candidate, repaired);
const expectedChangedPaths = [
	'questions[1].contextText',
	'questions[1].modelAnswer.answerText',
	'questions[3].contextText',
	'questions[5].contextText',
	'questions[9].contextText'
];
if (JSON.stringify(changedPaths) !== JSON.stringify(expectedChangedPaths)) {
	throw new Error(
		`Repair escaped the five reviewed fields: ${JSON.stringify({ changedPaths, expectedChangedPaths })}`
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
	throw new Error(
		`Repaired candidate validation did not pass exactly: ${JSON.stringify(validation)}`
	);
}

const evidence = {
	schemaVersion: 'codex-reviewed-extraction-repair-v1',
	status: 'passed',
	sourceDocumentId,
	basis:
		'Five-field deterministic repair bounded to the complete failed independent judge report; no question, mark, source asset, prompt, response, chain, checklist, or other model-answer field changed.',
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
		requiredRepairCountExact: judgeReport.requiredRepairs.length === 5,
		changedFieldCountExact: changedPaths.length === 5,
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

function setExactField(
	sourceQuestionRef,
	field,
	expectedBefore,
	after,
	officialAnchor,
	judgeFinding
) {
	const question = questionByRef(repaired, sourceQuestionRef);
	if (question[field] !== expectedBefore) {
		throw new Error(
			`${sourceQuestionRef}.${field} changed before reviewed repair: ${JSON.stringify(question[field])}`
		);
	}
	question[field] = after;
	repairs.push({
		sourceQuestionRef,
		field,
		before: expectedBefore,
		after,
		officialAnchor,
		judgeFinding
	});
}

function assertFailedJudgeContract(report) {
	const requiredRefs = (report?.requiredRepairs ?? [])
		.map((repair) => String(repair?.sourceQuestionRef ?? ''))
		.sort();
	const expectedRefs = ['01.1b', '01.1b', '02.1b', '03.1b', '07.1'].sort();
	if (
		report?.status !== 'failed' ||
		report?.verdict !== 'fail' ||
		Number(report?.score) !== 0.91 ||
		JSON.stringify(requiredRefs) !== JSON.stringify(expectedRefs)
	) {
		throw new Error('Failed J352/02 judge report no longer has the exact five-repair contract.');
	}
}

function assertWholePaperInventory(paper) {
	const refs = (paper?.questions ?? []).map((question) => question.sourceQuestionRef);
	const expectedRefs = [
		'01.1a',
		'01.1b',
		'02.1a',
		'02.1b',
		'03.1a',
		'03.1b',
		'04.1',
		'05.1',
		'06.1',
		'07.1',
		'08.1',
		'09.1',
		'10.1',
		'11.1'
	];
	const marks = (paper?.questions ?? []).reduce(
		(total, question) => total + Number(question?.marks ?? 0),
		0
	);
	if (JSON.stringify(refs) !== JSON.stringify(expectedRefs) || marks !== 440) {
		throw new Error(`J352/02 bank inventory changed: ${JSON.stringify({ refs, marks })}`);
	}
}

function questionByRef(paper, sourceQuestionRef) {
	const matches = (paper?.questions ?? []).filter(
		(question) => question.sourceQuestionRef === sourceQuestionRef
	);
	if (matches.length !== 1) {
		throw new Error(
			`${sourceQuestionRef}: expected exactly one question, found ${matches.length}.`
		);
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
		throw new Error(
			`Repaired J352/02 validation failed.\n${result.stdout ?? ''}\n${result.stderr ?? ''}`
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

function checkedJsonArtifact(filePath, expectedSha256, json = true) {
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
