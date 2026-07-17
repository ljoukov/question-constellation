#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { binaryArtifact, jsonArtifact } from './lib/codex-phase-artifacts.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const sourceDocumentId = 'ocr-j352-01-qp-jun24';
const failedEvidenceRoot =
	'tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-01-qp-jun24/failed-solvability-20260717T083144Z';
const candidatePath = resolveArg('candidate', `${failedEvidenceRoot}/failed-full-candidate.json`);
const importReadyCandidatePath = resolveArg(
	'import-ready-candidate',
	`${failedEvidenceRoot}/failed-import-ready-candidate.json`
);
const solvabilityReportPath = resolveArg(
	'solvability-report',
	`${failedEvidenceRoot}/solvability-report.json`
);
const solvabilitySummaryPath = resolveArg(
	'solvability-summary',
	`${failedEvidenceRoot}/solvability-summary.json`
);
const questionPaperPath = resolveArg(
	'question-paper',
	'data/ocr-gcse-english-literature/question-papers/OCR-J352-01-QP-JUN24.PDF'
);
const markSchemePath = resolveArg(
	'mark-scheme',
	'data/ocr-gcse-english-literature/mark-schemes/OCR-J352-01-MS-JUN24.PDF'
);
const outputPath = path.resolve(
	rootDir,
	stringArg(
		'output',
		'tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-01-qp-jun24/repaired-extraction.json'
	)
);
const validationPath = path.resolve(
	rootDir,
	stringArg(
		'validation',
		'tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-01-qp-jun24/validation.json'
	)
);
const fullValidationPath = path.resolve(
	rootDir,
	stringArg(
		'full-validation',
		'tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-01-qp-jun24/full-validation.json'
	)
);
const publishableValidationCandidatePath = path.resolve(
	rootDir,
	stringArg(
		'publishable-validation-candidate',
		'tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-01-qp-jun24/publishable-validation-candidate.json'
	)
);
const evidencePath = path.resolve(
	rootDir,
	stringArg(
		'evidence',
		'docs/release-evidence/ocr-j352-01-reviewed-solvability-repair.json'
	)
);

const expectedHashes = {
	candidate: '2ab967927c0e78c59e9d1814a318faf6d7d282c1a131f806b1542b4d9ba0b024',
	importReadyCandidate: 'cae61238efd2940c6551a4b0f7fe09bbb799026176f5c66dc3c2e3494a490975',
	solvabilityReport: '2d5131503733402980e90170304e6ec24f0223af4a45c9fd92f5a2fb0ce514fd',
	solvabilitySummary: 'de283ed156821a9ef9ce871b36944529bb3550bc3567c774e7b4cda64a0d633e',
	questionPaper: 'c3d6821647f4a752624a67416fb62571f5bda72479f663bd40ce21e83ba2c160',
	markScheme: '8ec499a8b6a0665fd3bb8ac5619b501d5f67071f27b75afd4cbeacd030e96a7d'
};
const inputs = {
	candidate: checkedArtifact(candidatePath, expectedHashes.candidate, true),
	importReadyCandidate: checkedArtifact(
		importReadyCandidatePath,
		expectedHashes.importReadyCandidate,
		true
	),
	solvabilityReport: checkedArtifact(
		solvabilityReportPath,
		expectedHashes.solvabilityReport,
		true
	),
	solvabilitySummary: checkedArtifact(
		solvabilitySummaryPath,
		expectedHashes.solvabilitySummary,
		true
	),
	questionPaper: checkedArtifact(questionPaperPath, expectedHashes.questionPaper),
	markScheme: checkedArtifact(markSchemePath, expectedHashes.markScheme)
};

const candidate = readJson(candidatePath);
const importReadyCandidate = readJson(importReadyCandidatePath);
const solvabilityReport = readJson(solvabilityReportPath);
const solvabilitySummary = readJson(solvabilitySummaryPath);
assertCandidateContract(candidate, { includeHeldOutQuestion: true });
assertCandidateContract(importReadyCandidate, { includeHeldOutQuestion: false });
assertFailedSolvabilityContract(solvabilityReport, solvabilitySummary);

const repaired = structuredClone(candidate);
const question = questionByRef(repaired, '13.1');
const importReadyQuestion = questionByRef(importReadyCandidate, '13.1');
const beforeAnswer = String(question?.modelAnswer?.answerText ?? '');
const importReadyAnswer = String(importReadyQuestion?.modelAnswer?.answerText ?? '');
const wrongSentence =
	'In the extract Jekyll claims Hyde’s note ‘was handed in’, but when Utterson asks directly how it arrived he ‘shut his mouth tight and nodded’.';
const correctedSentence =
	'In the extract Jekyll claims Hyde’s note ‘was handed in’, but when Utterson asks whether Hyde dictated the terms in Jekyll’s will, Jekyll ‘shut his mouth tight and nodded’.';
if (beforeAnswer !== importReadyAnswer || !beforeAnswer.includes(wrongSentence)) {
	throw new Error('13.1 no longer contains the exact independently judged model-answer defect.');
}
const afterAnswer = beforeAnswer.replace(wrongSentence, correctedSentence);
if (afterAnswer === beforeAnswer || afterAnswer.includes('asks directly how it arrived')) {
	throw new Error('13.1 exact sentence replacement did not complete.');
}
question.modelAnswer.answerText = afterAnswer;

assertCandidateContract(repaired, { includeHeldOutQuestion: true });
const changedPaths = deepChangedPaths(candidate, repaired);
const expectedChangedPaths = ['questions[18].modelAnswer.answerText'];
if (JSON.stringify(changedPaths) !== JSON.stringify(expectedChangedPaths)) {
	throw new Error(
		`Repair escaped the one reviewed field: ${JSON.stringify({
			changedPaths,
			expectedChangedPaths
		})}`
	);
}

writeJson(outputPath, repaired);
runValidation({
	inputPath: outputPath,
	outputPath: fullValidationPath,
	expectedMarks: 720,
	expectedQuestions: 24,
	expectedExitStatus: 1
});
const fullValidation = readJson(fullValidationPath);
assertExactCopyrightHoldout(fullValidation);
const publishableValidationCandidate = {
	...structuredClone(repaired),
	questions: repaired.questions.filter((entry) => entry.sourceQuestionRef !== '17.1')
};
assertCandidateContract(publishableValidationCandidate, { includeHeldOutQuestion: false });
writeJson(publishableValidationCandidatePath, publishableValidationCandidate);
runValidation({
	inputPath: publishableValidationCandidatePath,
	outputPath: validationPath,
	expectedMarks: 680,
	expectedQuestions: 23,
	expectedExitStatus: 0
});
const validation = readJson(validationPath);
if (
	validation.status !== 'passed' ||
	validation.questionCount !== 23 ||
	validation.markTotal !== 680 ||
	(validation.blockingIssues ?? []).length !== 0
) {
	throw new Error(`Repaired J352/01 candidate did not validate: ${JSON.stringify(validation)}`);
}

const failedResult = solvabilityReport.results.find(
	(result) => result.sourceQuestionRef === '13.1'
);
const evidence = {
	schemaVersion: 'codex-reviewed-extraction-repair-v1',
	status: 'passed',
	sourceDocumentId,
	basis:
		'One-field deterministic repair bounded to the complete failed Codex solvability report. It corrects only the exchange attributed to Jekyll’s closed-mouth gesture, using the official printed extract; no question, mark, source asset, prompt, response, chain, checklist, or other model-answer field changed. The full 24-row inventory retains the exact reviewed 17.1 copyright hold-out, while the exact 23-row publishable subset passes deterministic validation.',
	inputs,
	failedModelAudit: {
		status: solvabilityReport.status,
		questionCount: solvabilityReport.questionCount,
		passed: solvabilityReport.passed,
		failed: solvabilityReport.failed,
		minScore: solvabilityReport.minScore,
		failedResult
	},
	repairs: [
		{
			sourceQuestionRef: '13.1',
			field: 'modelAnswer.answerText',
			before: beforeAnswer,
			after: afterAnswer,
			officialAnchor:
				'Question paper PDF page 19: Jekyll says the note “was handed in”; separately, after Utterson asks whether Hyde dictated the terms of Jekyll’s will, Jekyll “shut his mouth tight and nodded”.',
			judgeFinding: failedResult.requiredRepairs[0]
		}
	],
	changedPaths,
	outputArtifact: jsonArtifact(outputPath, { rootDir }),
	deterministicValidation: {
		...validation,
		candidateArtifact: jsonArtifact(publishableValidationCandidatePath, { rootDir }),
		artifact: jsonArtifact(validationPath, { rootDir })
	},
	copyrightHoldoutValidation: {
		fullCandidateArtifact: jsonArtifact(outputPath, { rootDir }),
		fullValidation: {
			...fullValidation,
			artifact: jsonArtifact(fullValidationPath, { rootDir })
		},
		heldOutSourceQuestionRefs: ['17.1'],
		publishableQuestionCount: 23,
		publishableMarkTotal: 680
	},
	invariants: {
		exactFailedCandidateHash: true,
		exactFailedImportReadyCandidateHash: true,
		exactFailedSolvabilityReportHash: true,
		exactFailedSolvabilitySummaryHash: true,
		exactOfficialPdfHashes: true,
		requiredRepairCountExact: failedResult.requiredRepairs.length === 1,
		changedFieldCountExact: changedPaths.length === 1,
		noOtherFieldsChanged: true,
		questionCountPreserved: repaired.questions.length === 24,
		markTotalPreserved:
			repaired.questions.reduce((total, entry) => total + Number(entry?.marks ?? 0), 0) ===
			720,
		refOrderPreserved: true,
		exactCopyrightHoldoutPreserved: true,
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
			validation: {
				questionCount: validation.questionCount,
				markTotal: validation.markTotal,
				heldOutSourceQuestionRefs: ['17.1']
			}
		},
		null,
		2
	)
);

function assertFailedSolvabilityContract(report, summary) {
	const failedResults = (report?.results ?? []).filter((result) => result.status !== 'passed');
	const failedResult = failedResults[0];
	const expectedRepair =
		"Correct the model answer so Jekyll's action of shutting his mouth tight and nodding is attributed to Utterson's question about Hyde dictating the will, not to a question about how the note arrived.";
	if (
		report?.status !== 'failed' ||
		report?.sourceDocumentId !== sourceDocumentId ||
		report?.questionCount !== 23 ||
		report?.passed !== 22 ||
		report?.failed !== 1 ||
		failedResults.length !== 1 ||
		failedResult?.sourceQuestionRef !== '13.1' ||
		failedResult?.status !== 'failed' ||
		Number(failedResult?.score) !== 0.78 ||
		failedResult?.studentVisibleSolvable !== true ||
		failedResult?.markSchemeFits !== false ||
		JSON.stringify(failedResult?.requiredRepairs) !== JSON.stringify([expectedRepair]) ||
		summary?.status !== 'failed' ||
		summary?.report?.failed !== 1 ||
		summary?.phaseArtifacts?.inputs?.candidate?.sha256 !== expectedHashes.importReadyCandidate
	) {
		throw new Error('Failed J352/01 solvability evidence no longer has the exact one-repair contract.');
	}
}

function assertCandidateContract(paper, { includeHeldOutQuestion }) {
	if (paper?.sourceDocument?.id !== sourceDocumentId) {
		throw new Error(`Candidate source mismatch: ${paper?.sourceDocument?.id ?? 'missing'}`);
	}
	const expectedRefs = [
		'01.1a',
		'01.1b',
		'02.1a',
		'02.1b',
		'03.1a',
		'03.1b',
		'04.1a',
		'04.1b',
		'05.1a',
		'05.1b',
		'06.1a',
		'06.1b',
		'07.1',
		'08.1',
		'09.1',
		'10.1',
		'11.1',
		'12.1',
		'13.1',
		'14.1',
		'15.1',
		'16.1',
		...(includeHeldOutQuestion ? ['17.1'] : []),
		'18.1'
	];
	const refs = (paper?.questions ?? []).map((entry) => entry.sourceQuestionRef);
	const marks = (paper?.questions ?? []).reduce(
		(total, entry) => total + Number(entry?.marks ?? 0),
		0
	);
	const expectedMarks = includeHeldOutQuestion ? 720 : 680;
	if (JSON.stringify(refs) !== JSON.stringify(expectedRefs) || marks !== expectedMarks) {
		throw new Error(
			`J352/01 inventory changed: ${JSON.stringify({ refs, marks, expectedRefs, expectedMarks })}`
		);
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

function assertExactCopyrightHoldout(validation) {
	const expectedCodes = [
		'english_literature_required_source_asset_missing',
		'english_literature_source_asset_count_incomplete',
		'english_literature_source_status_incomplete',
		'english_literature_topology_source_assets_missing',
		'known_unresolved_copyright_source',
		'model_answer_needs_human_review',
		'needs_human_review'
	].sort();
	const actualCodes = (validation?.blockingIssues ?? [])
		.map((issue) => issue.code)
		.sort();
	if (
		validation?.status !== 'failed' ||
		validation?.sourceDocumentId !== sourceDocumentId ||
		validation?.questionCount !== 24 ||
		validation?.markTotal !== 720 ||
		JSON.stringify(validation?.reviewQuestionRefs) !== JSON.stringify(['17.1']) ||
		JSON.stringify(actualCodes) !== JSON.stringify(expectedCodes) ||
		(validation?.blockingIssues ?? []).some(
			(issue) => issue.sourceQuestionRef !== '17.1'
		)
	) {
		throw new Error(
			`Full J352/01 validation no longer fails only for the exact copyright hold-out: ${JSON.stringify(
				validation
			)}`
		);
	}
}

function runValidation({
	inputPath,
	outputPath: validationOutputPath,
	expectedMarks,
	expectedQuestions,
	expectedExitStatus
}) {
	const result = spawnSync(
		process.execPath,
		[
			'scripts/codex-import-helper.mjs',
			'validate-extraction',
			`--input=${inputPath}`,
			`--expected-marks=${expectedMarks}`,
			`--expected-questions=${expectedQuestions}`,
			`--output=${validationOutputPath}`
		],
		{
			cwd: rootDir,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 64 * 1024 * 1024
		}
	);
	if (result.status !== expectedExitStatus) {
		throw new Error(
			`Repaired J352/01 validation exited ${result.status}; expected ${expectedExitStatus}.\n${result.stdout ?? ''}\n${result.stderr ?? ''}`
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
