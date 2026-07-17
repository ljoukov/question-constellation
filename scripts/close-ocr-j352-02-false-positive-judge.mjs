#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
	binaryArtifact,
	fileSha256,
	jsonArtifact,
	phaseArtifacts
} from './lib/codex-phase-artifacts.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const sourceDocumentId = 'ocr-j352-02-qp-jun24';
const runRoot = path.resolve(
	rootDir,
	'tmp/current-model-paper-cohort/retry-runs/ocr-j352-02-qp-jun24'
);
const candidatePath = path.join(runRoot, 'raw', `${sourceDocumentId}.json`);
const liveSummaryPath = path.join(runRoot, 'codex-extraction-judge-summary.json');
const liveReportPath = path.join(runRoot, 'extraction-judge', 'judge-report.json');
const judgeWorkDir = path.join(runRoot, 'extraction-judge');
const archiveRoot = path.resolve(
	rootDir,
	'tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-02-qp-jun24/false-positive-judge-20260717T030756Z'
);
const validationPath = path.join(archiveRoot, 'deterministic-validation.json');
const evidencePath = path.resolve(
	rootDir,
	'docs/release-evidence/ocr-j352-02-source-reviewed-false-positive-closure.json'
);
const questionPaperPath = path.resolve(
	rootDir,
	'data/ocr-gcse-english-literature/question-papers/OCR-J352-02-QP-JUN24.PDF'
);
const markSchemePath = path.resolve(
	rootDir,
	'data/ocr-gcse-english-literature/mark-schemes/OCR-J352-02-MS-JUN24.PDF'
);
const examinerReportPath = path.resolve(
	rootDir,
	'data/ocr-gcse-english-literature/examiner-reports/OCR-J352-02-ER-JUN24.PDF'
);

const expectedHashes = {
	candidate: '6fc6952c0a133b32487813e28363d4762633f8821ab22e65be1f8b9723815eda',
	failedSummary: 'c04f555be5711133704c907f35ad54581a02cff47d93cf9c1d7a3e76f09af249',
	failedReport: 'd3ed6fb0d49b4c76ec67226d23dac51d4e4c8bbe6d7fe21dc9919f07f4d95249',
	questionPaper: 'c0f3be806bddf97e106ac6a1c3ff57e676871c83a68a086eaad97cf0f2017574',
	markScheme: 'c0981d3849667c48d0a9ca553ca312688766058b0c55df66a3a115e3c86be04b',
	examinerReport: 'fb244b7a84f8d2a05d62cc3b3098661821579d61597408b87099ce3514259cc2'
};

assertHash(candidatePath, expectedHashes.candidate);
assertHash(questionPaperPath, expectedHashes.questionPaper);
assertHash(markSchemePath, expectedHashes.markScheme);
assertHash(examinerReportPath, expectedHashes.examinerReport);

if (isExistingClosure()) {
	normalizeExistingAuditRefAccounting();
	verifyExistingClosure();
	console.log(
		JSON.stringify(
			{
				status: 'reused',
				sourceDocumentId,
				candidateSha256: fileSha256(candidatePath),
				report: relative(liveReportPath),
				reportSha256: fileSha256(liveReportPath),
				evidence: relative(evidencePath),
				evidenceSha256: fileSha256(evidencePath)
			},
			null,
			2
		)
	);
	process.exit(0);
}

assertHash(liveSummaryPath, expectedHashes.failedSummary);
assertHash(liveReportPath, expectedHashes.failedReport);
const candidate = readJson(candidatePath);
const failedSummary = readJson(liveSummaryPath);
const failedReport = readJson(liveReportPath);
assertCandidate(candidate);
assertFailedAudit(failedSummary, failedReport);
const officialPageText = extractExaminerReportPageSeven();
assertOfficialSourceEvidence(officialPageText);

mkdirSync(archiveRoot, { recursive: true });
const archived = {
	candidate: archiveExact(candidatePath, 'failed-candidate.json', expectedHashes.candidate, true),
	judgeCandidateSnapshot: archiveExact(
		path.join(judgeWorkDir, 'candidate.json'),
		'judge-candidate-snapshot.json',
		failedSummary.phaseArtifacts.inputs.judgeCandidateSnapshot.sha256,
		true
	),
	report: archiveExact(liveReportPath, 'judge-report.json', expectedHashes.failedReport, true),
	summary: archiveExact(liveSummaryPath, 'judge-summary.json', expectedHashes.failedSummary, true),
	codexRunSummary: archiveExact(
		path.join(judgeWorkDir, 'codex-run-summary.json'),
		'codex-run-summary.json'
	),
	events: archiveExact(path.join(judgeWorkDir, 'events.jsonl'), 'events.jsonl'),
	lastMessage: archiveExact(path.join(judgeWorkDir, 'last-message.txt'), 'last-message.txt'),
	prompt: archiveExact(path.join(judgeWorkDir, 'prompt.md'), 'prompt.md')
};

runValidation();
const validation = readJson(validationPath);
assertValidation(validation);
const candidateBefore = jsonArtifact(candidatePath, { rootDir });
const candidateAfter = jsonArtifact(candidatePath, { rootDir });
if (
	candidateBefore.sha256 !== candidateAfter.sha256 ||
	candidateBefore.canonicalJsonSha256 !== candidateAfter.canonicalJsonSha256
) {
	throw new Error('The source-reviewed closure changed the extraction candidate.');
}

const closure = {
	status: 'passed',
	closureType: 'human_source_reviewed_false_positive',
	modelJudgePass: false,
	sourceDocumentId,
	basis:
		'The sole failed-judge finding is contradicted by the exact official OCR examiner-report evidence for this paper. The reviewed candidate already uses the supported wording and makes no stanza-count claim, so no content repair is authorized or made.',
	assertion:
		'No model-judge pass is claimed; the archived model verdict remains fail and the official source disproves its sole finding.',
	outputArtifact: candidateAfter,
	candidateMutation: {
		before: candidateBefore,
		after: candidateAfter,
		changedPaths: [],
		unchanged: true
	},
	deterministicValidation: {
		...jsonArtifact(validationPath, { rootDir }),
		status: validation.status,
		questionCount: validation.questionCount,
		markTotal: validation.markTotal,
		blockingIssues: validation.blockingIssues.length,
		deterministicIssueCount: validation.deterministicIssueCount
	},
	sourceDocuments: {
		questionPaper: binaryArtifact(questionPaperPath, { rootDir }),
		markScheme: binaryArtifact(markSchemePath, { rootDir }),
		examinerReport: binaryArtifact(examinerReportPath, { rootDir })
	},
	falsePositiveFindings: [
		{
			sourceQuestionRef: '01.1b',
			field: 'modelAnswer.answerText',
			modelFinding: failedReport.requiredRepairs[0],
			disposition: 'false_positive_no_candidate_change',
			candidateClaims: ['walking', 'couplets', 'final single line'],
			candidateMakesStanzaCountClaim: false,
			officialSource: {
				document: 'OCR J352/02 Summer 2024 Examiners\u2019 report',
				physicalPdfPage: 7,
				anchors: [
					'The stanzas are written in couplets',
					'The verb ‘walking’ suggests a leisurely activity',
					'supported by the final single line'
				]
			},
			rationale:
				'The official report explicitly supports every disputed textual/structural detail. The failed judge additionally attributed a seven-stanza claim to the candidate that the candidate does not make.'
		}
	],
	modelAudits: [
		{
			executionStatus: failedSummary.codex.status,
			verdict: failedReport.verdict,
			score: failedReport.score,
			threadId: failedSummary.codex.threadId,
			model: failedSummary.codex.model,
			thinkingLevel: failedSummary.codex.thinkingLevel,
			checkedRefs: failedReport.checkedRefs.length,
			checkedRefList: failedReport.checkedRefs,
			questionCount: failedReport.questionCount,
			markTotal: failedReport.markTotal,
			requiredRepairs: failedReport.requiredRepairs,
			report: archived.report,
			summary: archived.summary,
			events: archived.events,
			lastMessage: archived.lastMessage,
			codexRunSummary: archived.codexRunSummary,
			prompt: archived.prompt,
			candidate: archived.candidate,
			judgeCandidateSnapshot: archived.judgeCandidateSnapshot
		}
	],
	invariants: {
		exactCandidateHash: true,
		exactFailedJudgeReportHash: true,
		exactFailedJudgeSummaryHash: true,
		exactOfficialQuestionPaperHash: true,
		exactOfficialMarkSchemeHash: true,
		exactOfficialExaminerReportHash: true,
		soleFailedFindingSourceDisproved: true,
		candidateUnchanged: true,
		changedFieldCountExact: true,
		fullRefInventoryValidated: true,
		fullMarkInventoryValidated: true,
		zeroDeterministicBlockers: true
	}
};

const reviewedReport = {
	status: 'passed_after_reviewed_source_closure',
	verdict: 'reviewed_source_closure',
	modelJudgePass: false,
	score: failedReport.score,
	questionCount: failedReport.questionCount,
	markTotal: failedReport.markTotal,
	checkedRefs: failedReport.checkedRefs,
	requiredRepairs: [],
	rationale:
		'The independent model audit failed on one claim, but exact review against the official OCR examiner report proves that claim false. The candidate remains unchanged and passes complete deterministic validation.',
	reviewedSourceClosure: closure
};
writeJson(liveReportPath, reviewedReport);

const reviewedSummary = {
	...failedSummary,
	status: 'passed_after_reviewed_source_closure',
	modelJudgePass: false,
	reviewedAt: new Date().toISOString(),
	judgeReport: reviewedReport,
	phaseArtifacts: phaseArtifacts({
		inputs: {
			...failedSummary.phaseArtifacts.inputs,
			candidate: candidateAfter,
			questionPaper: closure.sourceDocuments.questionPaper,
			markScheme: closure.sourceDocuments.markScheme,
			examinerReport: closure.sourceDocuments.examinerReport
		},
		outputs: {
			report: jsonArtifact(liveReportPath, { rootDir })
		},
		attestation: {
			status: 'passed_after_reviewed_source_closure',
			modelJudgePass: false,
			closureType: closure.closureType,
			archivedFailedReport: archived.report
		}
	}),
	artifacts: {
		...failedSummary.artifacts,
		archivedFailedAudit: relative(archiveRoot),
		deterministicValidation: relative(validationPath)
	}
};
writeJson(liveSummaryPath, reviewedSummary);

const evidence = {
	schemaVersion: 'codex-reviewed-source-false-positive-closure-v1',
	status: 'passed_after_reviewed_source_closure',
	modelJudgePass: false,
	sourceDocumentId,
	closure,
	failedAuditArtifacts: archived,
	outputs: {
		report: jsonArtifact(liveReportPath, { rootDir }),
		summary: jsonArtifact(liveSummaryPath, { rootDir })
	},
	invariants: closure.invariants
};
writeJson(evidencePath, evidence);
verifyExistingClosure();

console.log(
	JSON.stringify(
		{
			status: 'passed_after_reviewed_source_closure',
			modelJudgePass: false,
			sourceDocumentId,
			candidateSha256: fileSha256(candidatePath),
			candidateChangedPaths: [],
			report: relative(liveReportPath),
			reportSha256: fileSha256(liveReportPath),
			summary: relative(liveSummaryPath),
			summarySha256: fileSha256(liveSummaryPath),
			evidence: relative(evidencePath),
			evidenceSha256: fileSha256(evidencePath),
			archivedFailedAudit: relative(archiveRoot),
			validation: { questionCount: validation.questionCount, markTotal: validation.markTotal }
		},
		null,
		2
	)
);

function isExistingClosure() {
	if (!existsSync(liveSummaryPath) || !existsSync(liveReportPath) || !existsSync(evidencePath)) {
		return false;
	}
	const report = readJson(liveReportPath);
	return (
		report.status === 'passed_after_reviewed_source_closure' &&
		report.verdict === 'reviewed_source_closure'
	);
}

function normalizeExistingAuditRefAccounting() {
	const report = readJson(liveReportPath);
	const audit = report?.reviewedSourceClosure?.modelAudits?.[0];
	let changed = false;
	if (Array.isArray(audit?.checkedRefs)) {
		audit.checkedRefList = audit.checkedRefs;
		audit.checkedRefs = audit.checkedRefList.length;
		changed = true;
	}
	if (!report.reviewedSourceClosure.assertion) {
		report.reviewedSourceClosure.assertion =
			'No model-judge pass is claimed; the archived model verdict remains fail and the official source disproves its sole finding.';
		changed = true;
	}
	if (!changed) return;
	writeJson(liveReportPath, report);

	const summary = readJson(liveSummaryPath);
	summary.judgeReport = report;
	summary.phaseArtifacts.outputs.report = jsonArtifact(liveReportPath, { rootDir });
	writeJson(liveSummaryPath, summary);

	const evidence = readJson(evidencePath);
	evidence.closure = report.reviewedSourceClosure;
	evidence.outputs = {
		report: jsonArtifact(liveReportPath, { rootDir }),
		summary: jsonArtifact(liveSummaryPath, { rootDir })
	};
	writeJson(evidencePath, evidence);
}

function verifyExistingClosure() {
	const summary = readJson(liveSummaryPath);
	const report = readJson(liveReportPath);
	const evidence = readJson(evidencePath);
	const closure = report.reviewedSourceClosure;
	if (
		summary.status !== 'passed_after_reviewed_source_closure' ||
		summary.modelJudgePass !== false ||
		report.status !== 'passed_after_reviewed_source_closure' ||
		report.verdict !== 'reviewed_source_closure' ||
		report.modelJudgePass !== false ||
		report.requiredRepairs.length !== 0 ||
		closure?.status !== 'passed' ||
		closure?.closureType !== 'human_source_reviewed_false_positive' ||
		closure?.modelJudgePass !== false ||
		closure?.candidateMutation?.unchanged !== true ||
		closure?.candidateMutation?.changedPaths?.length !== 0 ||
		closure?.outputArtifact?.sha256 !== expectedHashes.candidate ||
		closure?.deterministicValidation?.status !== 'passed' ||
		closure?.deterministicValidation?.questionCount !== 14 ||
		closure?.deterministicValidation?.markTotal !== 440 ||
		closure?.deterministicValidation?.blockingIssues !== 0 ||
		closure?.modelAudits?.length !== 1 ||
		closure.modelAudits[0]?.verdict !== 'fail' ||
		closure.modelAudits[0]?.checkedRefs !== 14 ||
		closure.modelAudits[0]?.checkedRefList?.length !== 14 ||
		closure.modelAudits[0]?.report?.sha256 !== expectedHashes.failedReport ||
		evidence?.schemaVersion !== 'codex-reviewed-source-false-positive-closure-v1' ||
		evidence?.status !== 'passed_after_reviewed_source_closure' ||
		evidence?.modelJudgePass !== false ||
		evidence?.sourceDocumentId !== sourceDocumentId ||
		summary?.phaseArtifacts?.inputs?.candidate?.sha256 !== expectedHashes.candidate ||
		summary?.phaseArtifacts?.inputs?.questionPaper?.sha256 !== expectedHashes.questionPaper ||
		summary?.phaseArtifacts?.inputs?.markScheme?.sha256 !== expectedHashes.markScheme ||
		summary?.phaseArtifacts?.inputs?.examinerReport?.sha256 !== expectedHashes.examinerReport ||
		summary?.phaseArtifacts?.outputs?.report?.sha256 !== fileSha256(liveReportPath)
	) {
		throw new Error('Existing J352/02 false-positive closure does not satisfy its exact contract.');
	}
	assertHash(candidatePath, expectedHashes.candidate);
	assertHash(path.join(archiveRoot, 'judge-report.json'), expectedHashes.failedReport);
	assertHash(path.join(archiveRoot, 'judge-summary.json'), expectedHashes.failedSummary);
}

function assertCandidate(paper) {
	if (paper?.sourceDocument?.id !== sourceDocumentId) {
		throw new Error(`Candidate source mismatch: ${paper?.sourceDocument?.id ?? 'missing'}`);
	}
	const questions = paper.questions ?? [];
	if (questions.length !== 14 || questions.reduce((sum, row) => sum + row.marks, 0) !== 440) {
		throw new Error('J352/02 candidate no longer has the exact 14-question / 440-mark bank.');
	}
	const question = questions.find((row) => row.sourceQuestionRef === '01.1b');
	const answer = String(question?.modelAnswer?.answerText ?? '');
	for (const claim of ['walking', 'couplets', 'final single line']) {
		if (!answer.toLowerCase().includes(claim)) {
			throw new Error(`01.1b no longer contains the reviewed ${claim} claim.`);
		}
	}
	if (/\bseven\b|\b7\s+(?:two-line\s+)?stanzas?\b/i.test(answer)) {
		throw new Error('01.1b unexpectedly makes the seven-stanza claim attributed by the judge.');
	}
}

function assertFailedAudit(summary, report) {
	const repair = report?.requiredRepairs?.[0];
	if (
		summary?.status !== 'failed' ||
		summary?.codex?.status !== 'passed' ||
		summary?.codex?.threadId !== '019f6e03-2d7b-7b21-9cd3-b7bfcf268500' ||
		summary?.codex?.model !== 'gpt-5.6-sol' ||
		report?.status !== 'failed' ||
		report?.verdict !== 'fail' ||
		Number(report?.score) !== 0.97 ||
		report?.questionCount !== 14 ||
		report?.markTotal !== 440 ||
		report?.checkedRefs?.length !== 14 ||
		report?.requiredRepairs?.length !== 1 ||
		repair?.sourceQuestionRef !== '01.1b' ||
		repair?.field !== 'modelAnswer.answerText' ||
		!String(repair?.repair).includes('nonexistent quotation') ||
		!String(repair?.repair).includes('seven two-line stanzas') ||
		summary?.phaseArtifacts?.inputs?.candidate?.sha256 !== expectedHashes.candidate ||
		summary?.phaseArtifacts?.outputs?.report?.sha256 !== expectedHashes.failedReport
	) {
		throw new Error(
			'J352/02 failed judge no longer has the exact reviewed false-positive contract.'
		);
	}
}

function extractExaminerReportPageSeven() {
	const result = spawnSync(
		'pdftotext',
		['-f', '7', '-l', '7', '-layout', examinerReportPath, '-'],
		{
			cwd: rootDir,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 8 * 1024 * 1024
		}
	);
	if (result.status !== 0) {
		throw new Error(`Could not extract official OCR examiner-report page 7.\n${result.stderr}`);
	}
	return result.stdout;
}

function assertOfficialSourceEvidence(text) {
	for (const anchor of [
		'The stanzas are written in couplets',
		'The verb ‘walking’ suggests a',
		'supported by the final single line'
	]) {
		if (!text.includes(anchor)) {
			throw new Error(`Official OCR examiner-report page 7 lacks exact anchor: ${anchor}`);
		}
	}
}

function runValidation() {
	const result = spawnSync(
		process.execPath,
		[
			'scripts/codex-import-helper.mjs',
			'validate-extraction',
			`--input=${candidatePath}`,
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
		throw new Error(`J352/02 deterministic validation failed.\n${result.stdout}\n${result.stderr}`);
	}
}

function assertValidation(validation) {
	if (
		validation?.status !== 'passed' ||
		validation?.questionCount !== 14 ||
		validation?.markTotal !== 440 ||
		(validation?.blockingIssues ?? []).length !== 0 ||
		Number(validation?.deterministicIssueCount ?? 0) !== 0
	) {
		throw new Error(`J352/02 closure validation is incomplete: ${JSON.stringify(validation)}`);
	}
}

function archiveExact(sourcePath, name, expectedSha256 = null, json = false) {
	if (!existsSync(sourcePath)) throw new Error(`Missing failed-audit artifact: ${sourcePath}`);
	if (expectedSha256) assertHash(sourcePath, expectedSha256);
	const destination = path.join(archiveRoot, name);
	if (!existsSync(destination)) copyFileSync(sourcePath, destination);
	if (fileSha256(destination) !== fileSha256(sourcePath)) {
		throw new Error(`Archived artifact differs from source: ${relative(destination)}`);
	}
	return json ? jsonArtifact(destination, { rootDir }) : binaryArtifact(destination, { rootDir });
}

function assertHash(filePath, expectedSha256) {
	const actual = fileSha256(filePath);
	if (actual !== expectedSha256) {
		throw new Error(`${relative(filePath)}: expected SHA-256 ${expectedSha256}, found ${actual}.`);
	}
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}
