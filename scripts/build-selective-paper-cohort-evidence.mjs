#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { jsonArtifact, jsonArtifactMatches } from './lib/codex-phase-artifacts.mjs';
import {
	auditExtractionInputEvidence,
	extractionInputsFromSources
} from './lib/extraction-input-evidence.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';
import {
	exactOcrEnglishCopyrightSubsetDrops,
	OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_SOURCE_IDS
} from './lib/ocr-english-copyright-subsets.mjs';
import { auditOcrEnglishJune2024OriginalInventory } from './lib/ocr-j351-june-2024-inventory.mjs';
import { validReviewedSourceClosurePhase } from './lib/reviewed-source-closure-phase.mjs';

const rootDir = process.cwd();
const manifestPath = requiredPath('manifest');
const planPath = requiredPath('plan');
const cohortLockPath = path.resolve(
	rootDir,
	stringArg('cohort-lock', 'data/release/selective-paper-cohort-lock.json')
);
const primaryWorkRoot = requiredPath('primary-work-root');
const combinedWorkRoot = optionalPath('combined-work-root');
const primarySummaryPath = optionalPath('primary-summary');
const resumeSummaryPath = optionalPath('resume-summary');
const combinedSummaryPath = optionalPath('combined-summary');
const databaseVerificationPath = optionalPath('database-verification');
const illustrationVerificationPath = optionalPath('illustration-verification');
const recoveredEvidencePath = optionalPath('recovered-evidence');
const illustrationSummaryPaths = repeatedPaths('illustration-summary');
const supportingEvidencePaths = repeatedPaths('supporting-evidence');
const outputPath = path.resolve(
	rootDir,
	stringArg('output', 'docs/release-evidence/selective-paper-cohort.json')
);
const subsetArtifactRoot = path.resolve(
	rootDir,
	stringArg('subset-artifact-root', 'docs/release-evidence/selective-paper-subsets')
);
const allowIncomplete = hasArg('allow-incomplete');
const COPYRIGHT_SUBSET_SOURCE_IDS = new Set(OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_SOURCE_IDS);

const manifest = readJson(manifestPath);
const plan = readJson(planPath);
if (!existsSync(cohortLockPath)) {
	throw new Error(`Missing selective cohort lock: ${relative(cohortLockPath)}.`);
}
const cohortLock = readJson(cohortLockPath);
const planned = plan.planned ?? [];
if (planned.length !== 20) {
	throw new Error(
		`Selective cohort evidence requires exactly 20 planned papers; found ${planned.length}.`
	);
}
const duplicateIds = duplicateValues(planned.map((paper) => paper.sourceDocumentId));
if (duplicateIds.length > 0) {
	throw new Error(`Selective cohort contains duplicate source ids: ${duplicateIds.join(', ')}.`);
}

const manifestRows = manifest.rows ?? [];
if (manifestRows.length !== planned.length) {
	throw new Error(
		`Manifest/plan row count mismatch: manifest=${manifestRows.length}, plan=${planned.length}.`
	);
}
validateCohortLock(cohortLock, planned, manifestRows);
const primarySummary = readJsonIfExists(primarySummaryPath);
const resumeSummary = readJsonIfExists(resumeSummaryPath);
const combinedSummary = readJsonIfExists(combinedSummaryPath);
const databaseVerification = readJsonIfExists(databaseVerificationPath);
if (
	databaseVerification &&
	databaseVerification.schemaVersion !== 'selective-paper-cohort-d1-verification-v3'
) {
	throw new Error('Database verification has an unsupported schemaVersion.');
}
const databaseRows = indexRows(databaseVerification, 'sourceDocumentId');
const illustrationRows = indexRows(
	readJsonIfExists(illustrationVerificationPath),
	'sourceDocumentId'
);
const recoveredEvidence = readJsonIfExists(recoveredEvidencePath);
const recoveredRows = indexRows(recoveredEvidence?.papers ?? recoveredEvidence, 'sourceDocumentId');

if (recoveredEvidence) {
	if (recoveredEvidence.schemaVersion !== 'selective-paper-recovered-rollout-evidence-v1') {
		throw new Error('Recovered rollout evidence has an unsupported schemaVersion.');
	}
	const recoveredIds = [...recoveredRows.keys()];
	const plannedIds = new Set(planned.map((paper) => paper.sourceDocumentId));
	const unexpectedIds = recoveredIds.filter(
		(sourceDocumentId) => !plannedIds.has(sourceDocumentId)
	);
	if (unexpectedIds.length > 0) {
		throw new Error(
			`Recovered rollout evidence contains unplanned papers: ${unexpectedIds.join(', ')}.`
		);
	}
}

const papers = planned.map((plannedPaper, index) =>
	buildPaperEvidence(plannedPaper, manifestRows[index], index)
);
const allPassed = papers.every((paper) => paper.finalStatus === 'passed');
const databaseComplete = papers.every((paper) => paper.database?.status === 'matched');
const approvalComplete = papers.every(
	(paper) =>
		paper.approvalDisposition?.status === 'approved' ||
		paper.approvalDisposition?.status === 'withheld_ineligible'
);
const output = {
	schemaVersion: 'selective-paper-cohort-release-evidence-v4',
	cohortId: 'current-model-representative-20-july-2026',
	generatedAt: new Date().toISOString(),
	scope: {
		paperCount: papers.length,
		description:
			'Selective current-model re-extraction cohort; this is not a claim that the historical corpus was fully re-extracted.',
		cohortLockPath: relative(cohortLockPath),
		cohortLockSha256: fileSha256(cohortLockPath),
		manifestSha256: fileSha256(manifestPath),
		planSha256: fileSha256(planPath)
	},
	status: allPassed && databaseComplete && approvalComplete ? 'passed' : 'incomplete',
	counts: {
		planned: papers.length,
		passed: papers.filter((paper) => paper.finalStatus === 'passed').length,
		failed: papers.filter((paper) => paper.finalStatus !== 'passed').length,
		databaseMatched: papers.filter((paper) => paper.database?.status === 'matched').length,
		approvedFullPapers: papers.filter((paper) => paper.approvalDisposition?.status === 'approved')
			.length,
		withheldIneligiblePapers: papers.filter(
			(paper) => paper.approvalDisposition?.status === 'withheld_ineligible'
		).length,
		questions: sum(papers.map((paper) => paper.import?.questions ?? 0)),
		marks: sum(papers.map((paper) => paper.import?.marks ?? 0)),
		questionSourceDocuments: sum(
			papers.map((paper) => paper.database?.questionSourceDocuments ?? 0)
		),
		markingSourceDocuments: sum(papers.map((paper) => paper.database?.markingSourceDocuments ?? 0)),
		questionAssets: sum(papers.map((paper) => paper.database?.questionAssets ?? 0)),
		requiredAssets: sum(papers.map((paper) => paper.database?.requiredAssets ?? 0)),
		sourceAssets: sum(papers.map((paper) => paper.database?.sourceAssets ?? 0)),
		deliveredSourceAssets: sum(papers.map((paper) => paper.database?.deliveredSourceAssets ?? 0)),
		r2Assets: sum(papers.map((paper) => paper.database?.r2Assets ?? 0)),
		renderingOverlays: sum(papers.map((paper) => paper.database?.renderingOverlays ?? 0)),
		readyRenderingOverlays: sum(papers.map((paper) => paper.database?.readyRenderingOverlays ?? 0)),
		copyrightSubsetPapers: papers.filter(
			(paper) =>
				paper.publishableSubsetDisposition?.required === true &&
				paper.publishableSubsetDisposition?.status === 'passed'
		).length,
		copyrightSourceQuestionsDropped: sum(
			papers.map(
				(paper) => paper.phases?.extraction?.publishableSubset?.dropped?.questionCount ?? 0
			)
		),
		copyrightSourceMarksDropped: sum(
			papers.map((paper) => paper.phases?.extraction?.publishableSubset?.dropped?.markTotal ?? 0)
		)
	},
	databaseVerification: databaseVerificationPath
		? {
				...artifactEvidence(databaseVerificationPath),
				schemaVersion: readJsonIfExists(databaseVerificationPath)?.schemaVersion ?? null,
				status: readJsonIfExists(databaseVerificationPath)?.status ?? null,
				verifiedAt: readJsonIfExists(databaseVerificationPath)?.verifiedAt ?? null,
				counts: readJsonIfExists(databaseVerificationPath)?.counts ?? null
			}
		: null,
	batchRuns: {
		primary: batchEvidence(primarySummaryPath, primarySummary),
		patchedResume: batchEvidence(resumeSummaryPath, resumeSummary),
		combinedRetry: batchEvidence(combinedSummaryPath, combinedSummary)
	},
	recoveredRuns: recoveredEvidencePath
		? {
				path: relative(recoveredEvidencePath),
				sha256: fileSha256(recoveredEvidencePath),
				schemaVersion: recoveredEvidence?.schemaVersion ?? null,
				paperCount: recoveredRows.size,
				basis: recoveredEvidence?.basis ?? null
			}
		: null,
	illustrationRuns: illustrationSummaryPaths.map((summaryPath) => {
		const summary = readJson(summaryPath);
		return {
			path: relative(summaryPath),
			sha256: fileSha256(summaryPath),
			status: summary.status ?? null,
			startedAt: summary.startedAt ?? null,
			finishedAt: summary.finishedAt ?? null,
			counts: summary.counts ?? null,
			planner: phaseRun(summary.planner)
		};
	}),
	supportingEvidence: supportingEvidencePaths.map((evidencePath) =>
		path.extname(evidencePath).toLowerCase() === '.json'
			? jsonArtifactEvidence(evidencePath)
			: artifactEvidence(evidencePath)
	),
	papers
};

if (!allowIncomplete && output.status !== 'passed') {
	const failures = papers
		.filter(
			(paper) =>
				paper.finalStatus !== 'passed' ||
				paper.database?.status !== 'matched' ||
				!['approved', 'withheld_ineligible'].includes(paper.approvalDisposition?.status)
		)
		.map(
			(paper) =>
				`${paper.sourceDocumentId}: pipeline=${paper.finalStatus}, database=${paper.database?.status ?? 'missing'}, approval=${paper.approvalDisposition?.status ?? 'missing'}`
		);
	throw new Error(`Selective cohort evidence is incomplete:\n${failures.join('\n')}`);
}

writeJson(outputPath, output);
console.log(
	JSON.stringify(
		{
			status: output.status,
			output: relative(outputPath),
			sha256: fileSha256(outputPath),
			counts: output.counts
		},
		null,
		2
	)
);

function buildPaperEvidence(plannedPaper, manifestRow, index) {
	const sourceDocumentId = plannedPaper.sourceDocumentId;
	const sourceDocuments = {
		questionPaper: documentEvidence(manifestRow.question_paper),
		markScheme: documentEvidence(manifestRow.mark_scheme),
		supportingDocuments: supportingDocuments(manifestRow).map(documentEvidence)
	};
	const recovered = recoveredRows.get(sourceDocumentId) ?? null;
	const finalWorkRoot = finalWorkRootFor(sourceDocumentId);
	const initialWorkRoot = path.join(primaryWorkRoot, sourceDocumentId);
	const pipelineSummaryPath = path.join(finalWorkRoot, 'codex-production-import-summary.json');
	const pipelineSummary = readJsonIfExists(pipelineSummaryPath);
	const extractionSummary = readJsonIfExists(
		path.join(finalWorkRoot, 'codex-extraction-summary.json')
	);
	const judgeSummary = readJsonIfExists(
		path.join(finalWorkRoot, 'codex-extraction-judge-summary.json')
	);
	const chainSummary = readJsonIfExists(path.join(finalWorkRoot, 'codex-chain-summary.json'));
	const solvabilitySummary = readJsonIfExists(
		path.join(finalWorkRoot, 'codex-solvability-summary.json')
	);
	const importReadyPath = path.join(finalWorkRoot, 'import-ready', `${sourceDocumentId}.json`);
	const importReady = readJsonIfExists(importReadyPath);
	const questions = importReady?.questions ?? [];
	const questionCount = questions.length || Number(recovered?.import?.questions ?? 0);
	const marks = questions.length
		? sum(questions.map((question) => Number(question.marks ?? 0)))
		: Number(recovered?.import?.marks ?? 0);
	const phaseSummaries = {
		extraction:
			phaseEvidence(extractionSummary, 'extraction', {
				requireVerifiedModelInputSnapshots: true
			}) ?? recoveredPhase(recovered, 'extraction'),
		extractionJudge:
			phaseEvidence(judgeSummary, 'extractionJudge') ??
			recoveredPhase(recovered, 'extractionJudge'),
		answerChains:
			phaseEvidence(chainSummary, 'answerChains') ?? recoveredPhase(recovered, 'answerChains'),
		solvability:
			phaseEvidence(solvabilitySummary, 'solvability') ?? recoveredPhase(recovered, 'solvability')
	};
	const phaseThreadIds = Object.values(phaseSummaries).map((phase) => phase?.run?.threadId);
	const phasesPassed =
		Object.entries(phaseSummaries).every(([phaseName, phase]) =>
			phasePassed(phaseName, phase, questionCount, marks)
		) &&
		phaseThreadIds.every((threadId) => typeof threadId === 'string' && threadId.length > 0) &&
		new Set(phaseThreadIds).size === phaseThreadIds.length;
	const extractionInputDisposition = auditExtractionInputEvidence({
		rootDir,
		sourceDocumentId,
		extractionPhase: phaseSummaries.extraction,
		expectedInputs: extractionInputsFromSources(sourceDocuments),
		requireVerifiedModelInputSnapshots: phaseSummaries.extraction?.phaseArtifacts != null
	});
	const localImportPassed =
		pipelineSummary?.status === 'passed' &&
		pipelineSummary?.importReady?.status === 'passed' &&
		pipelineSummary?.importReady?.droppedQuestions === 0 &&
		pipelineSummary?.importReady?.keptQuestions === questionCount &&
		questionCount > 0;
	const recoveredImportPassed =
		recovered?.status === 'passed' &&
		recovered?.import?.status === 'passed' &&
		recovered?.import?.mode === 'write' &&
		Number(recovered?.import?.questions) === questionCount &&
		Number(recovered?.import?.marks) === marks &&
		Number(recovered?.import?.droppedQuestions) === 0 &&
		questionCount > 0 &&
		marks > 0;
	const importPassed = localImportPassed || recoveredImportPassed;
	const subsetReleaseArtifacts = materializePublishableSubsetArtifacts({
		sourceDocumentId,
		extractionPhase: phaseSummaries.extraction,
		finalWorkRoot
	});
	const publishableSubsetPassed = validPublishableSubsetEvidence({
		sourceDocumentId,
		extractionPhase: phaseSummaries.extraction,
		importReady,
		questionCount,
		marks,
		releaseArtifacts: subsetReleaseArtifacts,
		finalWorkRoot
	});
	const finalStatus =
		phasesPassed &&
		importPassed &&
		publishableSubsetPassed &&
		extractionInputDisposition.status === 'passed'
			? 'passed'
			: 'failed';
	const database = databaseEvidence(databaseRows.get(sourceDocumentId), questionCount, marks);
	const illustration = illustrationRows.get(sourceDocumentId) ?? null;
	const primaryBatchResult = batchResult(primarySummary, sourceDocumentId);
	const resumeBatchResult = batchResult(resumeSummary, sourceDocumentId);
	const combinedBatchResult = batchResult(combinedSummary, sourceDocumentId);

	return {
		position: index + 1,
		sourceDocumentId,
		board: manifestRow.board ?? null,
		qualification: manifestRow.qualification ?? null,
		subject: plannedPaper.subject ?? manifestRow.subject ?? null,
		subjectArea: manifestRow.subject_area ?? manifestRow.subject ?? null,
		paper: plannedPaper.paper ?? manifestRow.paper ?? null,
		component: manifestRow.component ?? manifestRow.unit_code ?? null,
		series: plannedPaper.series ?? manifestRow.series ?? null,
		year: manifestRow.year ?? yearFromSeries(manifestRow.series),
		fullPaperPolicy: fullPaperPolicy(sourceDocumentId),
		sources: sourceDocuments,
		extractionInputDisposition,
		finalStatus,
		evidenceMode: localImportPassed
			? 'preserved-workdir'
			: recoveredImportPassed
				? 'recovered-rollout-and-d1'
				: 'missing',
		recovery: recovered
			? {
					status: recovered.status ?? null,
					basis: recovered.basis ?? null,
					recoveredAt: recovered.recoveredAt ?? null,
					production: recovered.production ?? null
				}
			: null,
		finalWorkRoot: relative(finalWorkRoot),
		batchRecordedStatus: {
			primary: primaryBatchResult,
			patchedResume: resumeBatchResult,
			combinedRetry: combinedBatchResult,
			recoveredOutsidePrimaryBatch:
				finalStatus === 'passed' && primaryBatchResult?.status !== 'passed'
		},
		attemptHistory: attemptHistory(sourceDocumentId, initialWorkRoot, finalWorkRoot),
		chainContext: chainContextEvidence(finalWorkRoot),
		phases: phaseSummaries,
		publishableSubsetDisposition: {
			required: COPYRIGHT_SUBSET_SOURCE_IDS.has(sourceDocumentId),
			status: publishableSubsetPassed ? 'passed' : 'failed',
			releaseArtifacts: subsetReleaseArtifacts,
			retainedQuestionInventory: COPYRIGHT_SUBSET_SOURCE_IDS.has(sourceDocumentId)
				? questions.map((question) => ({
						sourceQuestionRef: question.sourceQuestionRef ?? null,
						marks: numberOrNull(question.marks)
					}))
				: null,
			importReadyExtractionRun: importReady?.extractionRun
				? {
						publishableSubset: importReady.extractionRun.publishableSubset ?? null,
						publishableSubsetSource: importReady.extractionRun.publishableSubsetSource ?? null,
						droppedUnpublishableSourceQuestions:
							importReady.extractionRun.droppedUnpublishableSourceQuestions ?? [],
						droppedUnpublishableSourceQuestionRefs:
							importReady.extractionRun.droppedUnpublishableSourceQuestionRefs ?? []
					}
				: null
		},
		import: {
			status: importPassed ? 'passed' : 'failed',
			questions: questionCount,
			marks,
			droppedQuestions: pipelineSummary?.importReady?.droppedQuestions ?? null,
			artifact: artifactEvidence(importReadyPath),
			recoveredArtifact: recovered?.import?.artifact ?? null,
			chainArtifact: artifactEvidence(
				path.join(finalWorkRoot, 'chain-reconciled', `${sourceDocumentId}.json`)
			),
			judgeArtifact: artifactEvidence(
				path.join(finalWorkRoot, 'extraction-judge', 'judge-report.json')
			),
			solvabilityArtifact: artifactEvidence(
				path.join(finalWorkRoot, 'codex-solvability', 'solvability-report.json')
			),
			transientArtifacts: {
				productionSummary: artifactEvidence(pipelineSummaryPath),
				extractionSummary: artifactEvidence(
					path.join(finalWorkRoot, 'codex-extraction-summary.json')
				),
				extraction: artifactEvidence(path.join(finalWorkRoot, 'raw', `${sourceDocumentId}.json`)),
				extractionJudgeSummary: artifactEvidence(
					path.join(finalWorkRoot, 'codex-extraction-judge-summary.json')
				),
				answerChainSummary: artifactEvidence(path.join(finalWorkRoot, 'codex-chain-summary.json')),
				solvabilitySummary: artifactEvidence(
					path.join(finalWorkRoot, 'codex-solvability-summary.json')
				),
				importReadyAudit: artifactEvidence(path.join(finalWorkRoot, 'import-ready-audit.json'))
			},
			transientArtifactDisposition: recoveredImportPassed
				? 'Original normalized/import-ready files were transient and are not reconstructed; immutable rollout hashes and live D1 verification are retained in recovered evidence.'
				: 'Transient artifacts were present and hashed when this evidence file was generated.'
		},
		database,
		approvalDisposition: approvalDisposition(fullPaperPolicy(sourceDocumentId), database),
		illustrations: illustration,
		reviewedExtractionRepair: reviewedExtractionRepairEvidence(finalWorkRoot),
		mixedResponseImportVerification: jsonArtifactEvidence(
			path.join(finalWorkRoot, 'mixed-response-import-verification.json')
		),
		phaseBoundaryRepair: chainSummary?.phaseBoundaryRepair ?? null
	};
}

function reviewedExtractionRepairEvidence(workRoot) {
	const repairPath = path.join(workRoot, 'reviewed-extraction-repair.json');
	if (!existsSync(repairPath)) return null;
	const repair = readJson(repairPath);
	return {
		path: relative(repairPath),
		sha256: fileSha256(repairPath),
		status: repair.status ?? null,
		appliedAt: repair.appliedAt ?? null,
		modelExtractionRerun: repair.modelExtractionRerun ?? null,
		modelJudgeRerun: repair.modelJudgeRerun ?? null,
		modelChainRerun: repair.modelChainRerun ?? null,
		modelSolvabilityRerun: repair.modelSolvabilityRerun ?? null,
		inputArtifact: repair.inputArtifact ?? null,
		inputChainArtifact: repair.inputChainArtifact ?? null,
		outputArtifact: repair.outputArtifact ?? null,
		outputChainArtifact: repair.outputChainArtifact ?? null,
		deterministicValidation: repair.deterministicValidation ?? null,
		reviewedSourceClosure: repair.reviewedSourceClosure ?? null,
		basis: repair.basis ?? null,
		repairs: repair.repairs ?? []
	};
}

function chainContextEvidence(workRoot) {
	const contextPath = path.join(workRoot, 'codex-chains', 'existing-chain-context.json');
	if (!existsSync(contextPath)) return null;
	const context = readJson(contextPath);
	const answerChainCount = Array.isArray(context.answerChains) ? context.answerChains.length : null;
	const overlayIndependent = context.selectionPolicy?.requireRenderingOverlay === false;
	return {
		path: relative(contextPath),
		sha256: fileSha256(contextPath),
		generatedAt: context.generatedAt ?? null,
		source: context.source ?? null,
		answerChainCount,
		selectionPolicy: context.selectionPolicy ?? null,
		classification: overlayIndependent
			? 'corrected_overlay_independent'
			: answerChainCount === 0
				? 'empty_legacy_overlay_filtered'
				: 'nonempty_legacy_overlay_filtered'
	};
}

function phaseEvidence(summary, phaseName, { requireVerifiedModelInputSnapshots = false } = {}) {
	if (!summary) return null;
	return {
		status: summary.status ?? null,
		modelJudgePass: summary.modelJudgePass ?? null,
		reviewedSourceClosure:
			summary.reviewedSourceClosure ?? summary.judgeReport?.reviewedSourceClosure ?? null,
		startedAt: summary.startedAt ?? null,
		finishedAt: summary.finishedAt ?? null,
		run: phaseRun(summary.codex),
		result: phaseResult(summary, phaseName),
		publishableSubset: phaseName === 'extraction' ? (summary.publishableSubset ?? null) : null,
		originalInventoryLock:
			phaseName === 'extraction' ? (summary.originalInventoryLock ?? null) : null,
		droppedExtractionQuestions:
			phaseName === 'extraction' ? (summary.droppedExtractionQuestions ?? []) : [],
		plan:
			phaseName === 'extraction'
				? {
						expectedSourceHashes: summary.plan?.expectedSourceHashes ?? null,
						canonicalSourcePaths: summary.plan?.canonicalSourcePaths ?? null
					}
				: null,
		requireVerifiedModelInputSnapshots:
			phaseName === 'extraction' ? requireVerifiedModelInputSnapshots : false,
		phaseArtifacts: summary.phaseArtifacts ?? null,
		artifacts: phaseArtifacts(summary.artifacts)
	};
}

function recoveredPhase(recovered, phaseName) {
	const phase = recovered?.phases?.[phaseName];
	if (!phase) return null;
	return {
		status: phase.status ?? null,
		modelJudgePass: phase.modelJudgePass ?? null,
		reviewedSourceClosure: phase.reviewedSourceClosure ?? null,
		startedAt: phase.startedAt ?? phase.run?.startedAt ?? null,
		finishedAt: phase.finishedAt ?? phase.run?.finishedAt ?? null,
		run: phaseRun(phase.run),
		rollout: phase.rollout ?? null,
		inputAttestation: phaseName === 'extraction' ? (phase.inputAttestation ?? null) : null,
		result: phase.result ?? null,
		recoveryBasis: phase.recoveryBasis ?? null
	};
}

function phaseRun(run) {
	if (!run) return null;
	return {
		status: run.status ?? null,
		threadId: run.threadId ?? null,
		model: run.model ?? null,
		thinkingLevel: run.thinkingLevel ?? null,
		startedAt: run.startedAt ?? null,
		finishedAt: run.finishedAt ?? null,
		durationSeconds: run.durationSeconds ?? null,
		usage: run.usage ?? null
	};
}

function phaseResult(summary, phaseName) {
	if (phaseName === 'extraction') {
		const validation = summary.validation ?? null;
		return validation
			? {
					status: validation.status ?? null,
					questionCount: numberOrNull(validation.questionCount),
					markTotal: numberOrNull(validation.markTotal),
					firstRef: validation.firstRef ?? null,
					lastRef: validation.lastRef ?? null,
					reviewQuestionCount: Array.isArray(validation.reviewQuestionRefs)
						? validation.reviewQuestionRefs.length
						: null,
					deterministicIssueCount: numberOrNull(validation.deterministicIssueCount),
					blockingIssueCount: Array.isArray(validation.blockingIssues)
						? validation.blockingIssues.length
						: null
				}
			: null;
	}
	if (phaseName === 'extractionJudge') {
		const report = summary.judgeReport ?? null;
		return report
			? {
					status: report.status ?? null,
					verdict: report.verdict ?? null,
					score: numberOrNull(report.score),
					questionCount: numberOrNull(report.questionCount),
					markTotal: numberOrNull(report.markTotal),
					checkedRefCount: Array.isArray(report.checkedRefs) ? report.checkedRefs.length : null,
					requiredRepairCount: Array.isArray(report.requiredRepairs)
						? report.requiredRepairs.length
						: null
				}
			: null;
	}
	if (phaseName === 'answerChains') {
		const validation = summary.validation ?? null;
		return validation
			? {
					status: validation.status ?? null,
					questionCount: numberOrNull(validation.questionCount),
					deterministicIssueCount: numberOrNull(validation.deterministicIssueCount),
					blockingIssueCount: Array.isArray(validation.blockingIssues)
						? validation.blockingIssues.length
						: null,
					validationRepairCount: Array.isArray(summary.artifacts?.validationRepairSummaries)
						? summary.artifacts.validationRepairSummaries.length
						: null,
					styleRepairCount: Array.isArray(summary.artifacts?.styleRepairSummaries)
						? summary.artifacts.styleRepairSummaries.length
						: null
				}
			: null;
	}
	if (phaseName === 'solvability') {
		const report = summary.report ?? null;
		return report
			? {
					status: report.status ?? null,
					questionCount: numberOrNull(report.questionCount),
					passed: numberOrNull(report.passed),
					failed: numberOrNull(report.failed),
					minScore: numberOrNull(report.minScore),
					requiredRepairCount: Array.isArray(report.results)
						? sum(
								report.results.map((result) =>
									Array.isArray(result.requiredRepairs) ? result.requiredRepairs.length : 0
								)
							)
						: null
				}
			: null;
	}
	return null;
}

function phaseArtifacts(artifacts) {
	if (!artifacts || typeof artifacts !== 'object') return null;
	return Object.fromEntries(
		Object.entries(artifacts).map(([name, value]) => [name, phaseArtifactValue(value)])
	);
}

function phaseArtifactValue(value) {
	if (Array.isArray(value)) return value.map(phaseArtifactValue);
	if (typeof value !== 'string') return value ?? null;
	const resolvedPath = path.isAbsolute(value) ? value : path.resolve(rootDir, value);
	if (!existsSync(resolvedPath)) {
		return { path: relative(resolvedPath), exists: false, sha256: null };
	}
	if (statSync(resolvedPath).isDirectory()) {
		return { path: relative(resolvedPath), exists: true, kind: 'directory', sha256: null };
	}
	return {
		path: relative(resolvedPath),
		exists: true,
		kind: 'file',
		sha256: fileSha256(resolvedPath)
	};
}

function attemptHistory(sourceDocumentId, initialWorkRoot, finalWorkRoot) {
	const candidates = [
		path.join(
			initialWorkRoot,
			'preserved-before-reviewed-resolution-alternative-repair',
			'codex-production-import-summary.json'
		),
		path.join(
			initialWorkRoot,
			'preserved-before-reviewed-unit-control-repair',
			'codex-production-import-summary.json'
		),
		path.join(
			initialWorkRoot,
			'preserved-before-reviewed-evidence-repair',
			'codex-production-import-summary.json'
		),
		path.join(
			initialWorkRoot,
			'preserved-before-mixed-response-reimport',
			'codex-production-import-summary.json'
		),
		path.join(
			initialWorkRoot,
			'preserved-before-patched-resume',
			'codex-production-import-summary.json'
		),
		path.join(
			initialWorkRoot,
			'preserved-initial-source-identity-failure',
			'codex-production-import-summary.json'
		),
		path.join(initialWorkRoot, 'preserved-passed-attempt1', 'codex-production-import-summary.json'),
		path.join(initialWorkRoot, 'preserved-first-attempt', 'failed-pipeline-summary.json'),
		path.join(initialWorkRoot, 'codex-production-import-summary.json'),
		path.join(finalWorkRoot, 'codex-production-import-summary.json')
	];
	const seen = new Set();
	return candidates.flatMap((summaryPath) => {
		if (!existsSync(summaryPath)) return [];
		const sha256 = fileSha256(summaryPath);
		if (seen.has(sha256)) return [];
		seen.add(sha256);
		const summary = readJson(summaryPath);
		if (summary?.plan?.sourceDocumentId !== sourceDocumentId) return [];
		return [
			{
				path: relative(summaryPath),
				sha256,
				status: summary.status ?? null,
				startedAt: summary.startedAt ?? null,
				finishedAt: summary.finishedAt ?? null,
				error: summary.error ?? null,
				steps: summary.steps ?? []
			}
		];
	});
}

function databaseEvidence(row, questionCount, marks) {
	if (!row) return { status: 'missing' };
	const questions = Number(row.questions ?? row.questionCount ?? 0);
	const databaseMarks = Number(row.marks ?? 0);
	const missingEvidence = Number(row.missingEvidence ?? row.missing_evidence ?? 0);
	const requiredAssets = Number(row.requiredAssets ?? 0);
	const requiredAssetEvidence = Array.isArray(row.requiredAssetEvidence)
		? row.requiredAssetEvidence
		: [];
	const exactAssetEvidence =
		requiredAssetEvidence.length === requiredAssets &&
		requiredAssetEvidence.every(
			(asset) =>
				asset.id &&
				asset.r2Key &&
				/^[a-f0-9]{64}$/.test(String(asset.sha256 ?? '')) &&
				['local-file', 'remote-r2-baseline'].includes(asset.hashSource)
		);
	const exactRowFingerprint =
		row.canonicalRowFingerprint?.schemaVersion === 'paper-d1-row-lock-v2' &&
		/^[a-f0-9]{64}$/.test(String(row.canonicalRowFingerprint?.sha256 ?? ''));
	const approvedContentFingerprint = row.approvedContentFingerprint ?? null;
	const liveContentFingerprint = row.liveContentFingerprint ?? null;
	const exactApprovedContent =
		row.approvedFullPaper !== true ||
		(/^paper-sitting-content-v1:[a-f0-9]{64}$/.test(String(approvedContentFingerprint ?? '')) &&
			approvedContentFingerprint === liveContentFingerprint);
	return {
		status:
			questions === questionCount &&
			databaseMarks === marks &&
			missingEvidence === 0 &&
			exactAssetEvidence &&
			exactRowFingerprint &&
			exactApprovedContent
				? 'matched'
				: 'mismatch',
		verifiedAt: row.verifiedAt ?? null,
		questions,
		marks: databaseMarks,
		distinctRefs: Number(row.distinctRefs ?? row.distinct_refs ?? questions),
		missingEvidence,
		approvedFullPaper: row.approvedFullPaper ?? null,
		fullPaperReviewStatus: row.fullPaperReviewStatus ?? null,
		approvedQuestionCount: numberOrNull(row.approvedQuestionCount),
		approvedMarkTotal: numberOrNull(row.approvedMarkTotal),
		durationMinutes: numberOrNull(row.durationMinutes),
		fullPaperReviewedAt: row.fullPaperReviewedAt ?? null,
		approvedContentFingerprint,
		liveContentFingerprint,
		primaryIllustrationPairs: Number(row.primaryIllustrationPairs ?? 0),
		questionSourceDocuments: Number(row.questionSourceDocuments ?? 0),
		markingSourceDocuments: Number(row.markingSourceDocuments ?? 0),
		questionAssets: Number(row.questionAssets ?? 0),
		requiredAssets,
		sourceAssets: Number(row.sourceAssets ?? 0),
		deliveredSourceAssets: Number(row.deliveredSourceAssets ?? 0),
		r2Assets: Number(row.r2Assets ?? 0),
		renderingOverlays: Number(row.renderingOverlays ?? 0),
		readyRenderingOverlays: Number(row.readyRenderingOverlays ?? 0),
		requiredAssetEvidence: requiredAssetEvidence.map((asset) => ({
			id: asset.id ?? null,
			r2Key: asset.r2Key ?? null,
			sha256: asset.sha256 ?? null,
			hashSource: asset.hashSource ?? null
		})),
		canonicalRowFingerprint: row.canonicalRowFingerprint ?? null,
		diagnostics: row.diagnostics ?? null,
		paperSittingDiagnostics: {
			unsupportedResponses: Number(row.paperSittingDiagnostics?.unsupportedResponses ?? 0),
			incompleteGradingQuestions: Number(
				row.paperSittingDiagnostics?.incompleteGradingQuestions ?? 0
			)
		}
	};
}

function validateCohortLock(lock, plannedPapers, manifestRows) {
	const lockedPapers = Array.isArray(lock?.papers) ? lock.papers : [];
	const lockedSupportingDocuments = lock?.supportingDocumentsBySourceId ?? {};
	if (
		lock?.schemaVersion !== 'selective-paper-cohort-lock-v1' ||
		lock?.cohortId !== 'current-model-representative-20-july-2026' ||
		lockedPapers.length !== 20 ||
		new Set(lockedPapers.map((paper) => paper.sourceDocumentId)).size !== 20
	) {
		throw new Error('Selective cohort lock is not the exact 20-paper release scope.');
	}
	const plannedIds = new Set(lockedPapers.map((paper) => paper.sourceDocumentId));
	if (
		!lockedSupportingDocuments ||
		typeof lockedSupportingDocuments !== 'object' ||
		Array.isArray(lockedSupportingDocuments) ||
		Object.keys(lockedSupportingDocuments).length !== lockedPapers.length ||
		Object.entries(lockedSupportingDocuments).some(
			([sourceDocumentId, documents]) =>
				!plannedIds.has(sourceDocumentId) || !Array.isArray(documents)
		)
	) {
		throw new Error('Selective cohort supporting-document lock is invalid.');
	}
	for (let index = 0; index < lockedPapers.length; index += 1) {
		const locked = lockedPapers[index];
		const planned = plannedPapers[index] ?? {};
		const manifestRow = manifestRows[index] ?? {};
		const questionPaper = documentEvidence(manifestRow.question_paper);
		const markScheme = documentEvidence(manifestRow.mark_scheme);
		const actualSupportingDocuments = supportingDocuments(manifestRow).map((document) => {
			const evidence = documentEvidence(document);
			return {
				documentType: evidence?.documentType ?? null,
				filename: evidence?.filename ?? null,
				localPath: evidence?.localPath ?? null,
				sha256: evidence?.sha256 ?? null
			};
		});
		const expectedSupportingDocuments = lockedSupportingDocuments[locked.sourceDocumentId] ?? [];
		if (
			locked.position !== index + 1 ||
			planned.sourceDocumentId !== locked.sourceDocumentId ||
			manifestRow.board !== locked.board ||
			(planned.subject ?? manifestRow.subject) !== locked.subject ||
			(manifestRow.component ?? manifestRow.unit_code) !== locked.component ||
			(planned.series ?? manifestRow.series) !== locked.series ||
			questionPaper?.sha256 !== locked.questionPaperSha256 ||
			markScheme?.sha256 !== locked.markSchemeSha256 ||
			JSON.stringify(actualSupportingDocuments) !== JSON.stringify(expectedSupportingDocuments)
		) {
			throw new Error(
				`Manifest/plan row ${index + 1} does not match the tracked cohort lock (${locked.sourceDocumentId ?? 'missing id'}).`
			);
		}
	}
}

function phasePassed(phaseName, phase, questionCount, marks) {
	if (
		!['passed', 'passed_after_reviewed_source_closure'].includes(phase?.status) ||
		phase?.run?.status !== 'passed' ||
		phase?.run?.model !== 'gpt-5.6-sol' ||
		phase?.run?.thinkingLevel !== 'max' ||
		!phase?.run?.threadId
	) {
		return false;
	}
	const result = phase.result ?? {};
	const recoveredRollout =
		phase.rollout &&
		/^[a-f0-9]{64}$/.test(String(phase.rollout.sha256 ?? '')) &&
		phase.rollout.sessionId === phase.run.threadId &&
		Boolean(phase.recoveryBasis);
	if (phaseName === 'extraction') {
		return (
			(result.status === 'passed' || recoveredRollout) &&
			Number(result.questionCount ?? result.questions) === questionCount &&
			Number(result.markTotal ?? result.marks) === marks &&
			Number(result.blockingIssueCount ?? result.unresolvedReviewRefs ?? 0) === 0 &&
			Number(result.deterministicIssueCount ?? 0) === 0
		);
	}
	if (phaseName === 'extractionJudge') {
		if (phase.status === 'passed_after_reviewed_source_closure') {
			return validReviewedSourceClosurePhase({
				phase,
				result,
				questionCount,
				markTotal: marks,
				recoveredRollout
			});
		}
		return (
			(result.status === 'passed' || result.verdict === 'pass') &&
			(result.score == null ? recoveredRollout : Number(result.score) >= 0.8) &&
			Number(result.questionCount ?? result.checkedRefCount ?? result.checkedRefs) ===
				questionCount &&
			(result.markTotal == null || Number(result.markTotal) === marks) &&
			Number(result.requiredRepairCount ?? result.requiredRepairs) === 0
		);
	}
	if (phaseName === 'answerChains') {
		if (phase.status === 'passed_after_reviewed_source_closure') {
			const closure = phase.reviewedSourceClosure ?? {};
			const heldRefs = Array.isArray(closure.heldRefs) ? closure.heldRefs : [];
			return (
				closure.status === 'passed' &&
				closure.closureType === 'source_reviewed_chain_link_clearance' &&
				heldRefs.length > 0 &&
				new Set(heldRefs).size === heldRefs.length &&
				closure.databasePrimaryLinksClean === true &&
				Number(result.reused ?? 0) + Number(result.created ?? 0) + heldRefs.length ===
					questionCount &&
				Number(result.initialNeedsReview) === heldRefs.length &&
				Number(result.databaseNeedsReview) === 0 &&
				recoveredRollout
			);
		}
		const countedQuestions = Number(
			result.questionCount ??
				result.questions ??
				Number(result.reused ?? 0) +
					Number(result.created ?? result.createdActions ?? result.uniqueCreated ?? 0)
		);
		return (
			(result.status === 'passed' || recoveredRollout) &&
			countedQuestions === questionCount &&
			Number(result.blockingIssueCount ?? result.needsReview ?? 0) === 0 &&
			Number(result.deterministicIssueCount ?? 0) === 0
		);
	}
	if (phaseName === 'solvability') {
		return (
			(result.status === 'passed' || recoveredRollout) &&
			Number(result.questionCount ?? result.passed) === questionCount &&
			Number(result.passed) === questionCount &&
			Number(result.failed) === 0 &&
			(result.minScore == null ? recoveredRollout : Number(result.minScore) >= 0.8) &&
			Number(result.requiredRepairCount ?? 0) === 0
		);
	}
	return false;
}

function validPublishableSubsetEvidence({
	sourceDocumentId,
	extractionPhase,
	importReady,
	questionCount,
	marks,
	releaseArtifacts,
	finalWorkRoot
}) {
	const required = COPYRIGHT_SUBSET_SOURCE_IDS.has(sourceDocumentId);
	const subset = extractionPhase?.publishableSubset ?? null;
	const compatibilityRows = Array.isArray(extractionPhase?.droppedExtractionQuestions)
		? extractionPhase.droppedExtractionQuestions
		: [];
	const importRun = importReady?.extractionRun ?? null;
	const importDroppedRows = Array.isArray(importRun?.droppedUnpublishableSourceQuestions)
		? importRun.droppedUnpublishableSourceQuestions
		: [];
	const importDroppedRefs = Array.isArray(importRun?.droppedUnpublishableSourceQuestionRefs)
		? importRun.droppedUnpublishableSourceQuestionRefs
		: [];

	if (!required) {
		return (
			subset == null &&
			extractionPhase?.originalInventoryLock == null &&
			releaseArtifacts == null &&
			compatibilityRows.length === 0 &&
			importRun?.publishableSubset !== true &&
			importDroppedRows.length === 0 &&
			importDroppedRefs.length === 0
		);
	}

	const droppedRows = Array.isArray(subset?.dropped?.questions) ? subset.dropped.questions : [];
	const droppedRefs = droppedRows.map((row) => row?.sourceQuestionRef);
	const droppedMarkTotal = sum(droppedRows.map((row) => Number(row?.marks ?? 0)));
	const exactDropReasons = ['known_unresolved_copyright_source', 'question_needs_human_review'];
	const originalQuestions = subsetArtifactQuestions(releaseArtifacts?.original);
	const retainedQuestions = subsetArtifactQuestions(releaseArtifacts?.retained);
	const importQuestions = Array.isArray(importReady?.questions) ? importReady.questions : [];
	const originalByRef = exactQuestionRefMap(originalQuestions);
	const retainedByRef = exactQuestionRefMap(retainedQuestions);
	const importByRef = exactQuestionRefMap(importQuestions);
	const originalRefs = originalByRef ? [...originalByRef.keys()] : [];
	const retainedRefs = retainedByRef ? [...retainedByRef.keys()] : [];
	const exactRetainedReleasePath = relative(
		path.join(subsetArtifactRoot, sourceDocumentId, 'retained.json')
	);
	const exactOriginalReleasePath = relative(
		path.join(subsetArtifactRoot, sourceDocumentId, 'original.json')
	);
	const phaseOutput = extractionPhase?.phaseArtifacts?.outputs?.extraction ?? null;
	const expectedOriginalPath = relative(
		path.join(finalWorkRoot, 'codex-extraction', 'normalized-extraction.json')
	);
	const expectedRetainedPath = relative(
		path.join(finalWorkRoot, 'codex-extraction', 'normalized-extraction.publishable.json')
	);
	const expectedPhaseOutputPath = relative(
		path.join(finalWorkRoot, 'raw', `${sourceDocumentId}.json`)
	);
	const officialOriginalInventory = auditOcrEnglishJune2024OriginalInventory({
		sourceDocumentId,
		questions: originalQuestions
	});
	return (
		subset?.status === 'passed' &&
		subset?.policy === 'known_unresolved_copyright_source_only_v1' &&
		officialOriginalInventory.status === 'passed' &&
		JSON.stringify(extractionPhase?.originalInventoryLock) ===
			JSON.stringify(officialOriginalInventory) &&
		Number.isInteger(Number(subset.original?.questionCount)) &&
		Number.isInteger(Number(subset.original?.markTotal)) &&
		Number(subset.original.questionCount) ===
			Number(subset.retained?.questionCount) + Number(subset.dropped?.questionCount) &&
		Number(subset.original.markTotal) ===
			Number(subset.retained?.markTotal) + Number(subset.dropped?.markTotal) &&
		Number(subset.retained?.questionCount) === questionCount &&
		Number(subset.retained?.markTotal) === marks &&
		Number(subset.dropped?.questionCount) > 0 &&
		Number(subset.dropped?.questionCount) === droppedRows.length &&
		Number(subset.dropped?.markTotal) === droppedMarkTotal &&
		exactOcrEnglishCopyrightSubsetDrops(sourceDocumentId, droppedRows) &&
		originalByRef !== null &&
		retainedByRef !== null &&
		importByRef !== null &&
		originalQuestions.length === Number(subset.original.questionCount) &&
		questionMarkTotal(originalQuestions) === Number(subset.original.markTotal) &&
		retainedQuestions.length === Number(subset.retained.questionCount) &&
		questionMarkTotal(retainedQuestions) === Number(subset.retained.markTotal) &&
		importQuestions.length === questionCount &&
		questionMarkTotal(importQuestions) === marks &&
		new Set(droppedRefs).size === droppedRows.length &&
		droppedRows.every(
			(row) =>
				Boolean(String(row?.sourceQuestionRef ?? '').trim()) &&
				Number.isInteger(Number(row?.marks)) &&
				Number(row.marks) >= 0 &&
				row.deterministicReason === 'known_unresolved_copyright_source' &&
				Array.isArray(row.reasons) &&
				JSON.stringify([...row.reasons].sort()) === JSON.stringify(exactDropReasons) &&
				originalByRef?.get(row.sourceQuestionRef) === Number(row.marks) &&
				!retainedByRef?.has(row.sourceQuestionRef) &&
				!importByRef?.has(row.sourceQuestionRef)
		) &&
		originalRefs.length === retainedRefs.length + droppedRefs.length &&
		originalRefs.every((ref) => retainedByRef?.has(ref) === true || droppedRefs.includes(ref)) &&
		retainedRefs.every(
			(ref) =>
				originalByRef?.get(ref) === retainedByRef?.get(ref) &&
				importByRef?.get(ref) === retainedByRef?.get(ref)
		) &&
		[...importByRef.keys()].every((ref) => retainedByRef?.has(ref) === true) &&
		subset.invariants?.questionCountConserved === true &&
		subset.invariants?.markTotalConserved === true &&
		subset.invariants?.onlyKnownUnresolvedCopyrightSource === true &&
		validSubsetArtifact(subset.original?.artifact) &&
		validSubsetArtifact(subset.retained?.artifact) &&
		subset.original.artifact.path === expectedOriginalPath &&
		subset.retained.artifact.path === expectedRetainedPath &&
		validSubsetArtifact(releaseArtifacts?.original) &&
		validSubsetArtifact(releaseArtifacts?.retained) &&
		releaseArtifacts.original.path === exactOriginalReleasePath &&
		releaseArtifacts.retained.path === exactRetainedReleasePath &&
		sameArtifactDigest(releaseArtifacts.original, subset.original.artifact) &&
		sameArtifactDigest(releaseArtifacts.retained, subset.retained.artifact) &&
		extractionPhase?.phaseArtifacts?.schemaVersion === 'codex-phase-artifacts-v1' &&
		validSubsetArtifact(phaseOutput) &&
		phaseOutput.path === expectedPhaseOutputPath &&
		sameArtifactDigest(phaseOutput, subset.retained.artifact) &&
		subset.original.artifact.path !== subset.retained.artifact.path &&
		JSON.stringify(compatibilityRows) === JSON.stringify(droppedRows) &&
		importRun?.publishableSubset === true &&
		importRun?.publishableSubsetSource === subset.original.artifact.path &&
		JSON.stringify(importDroppedRows) === JSON.stringify(droppedRows) &&
		JSON.stringify(importDroppedRefs) === JSON.stringify(droppedRefs)
	);
}

function materializePublishableSubsetArtifacts({
	sourceDocumentId,
	extractionPhase,
	finalWorkRoot
}) {
	if (!COPYRIGHT_SUBSET_SOURCE_IDS.has(sourceDocumentId)) return null;
	const subset = extractionPhase?.publishableSubset;
	const expectedOriginalPath = relative(
		path.join(finalWorkRoot, 'codex-extraction', 'normalized-extraction.json')
	);
	const expectedRetainedPath = relative(
		path.join(finalWorkRoot, 'codex-extraction', 'normalized-extraction.publishable.json')
	);
	if (
		!validSubsetArtifact(subset?.original?.artifact) ||
		!validSubsetArtifact(subset?.retained?.artifact) ||
		subset.original.artifact.path !== expectedOriginalPath ||
		subset.retained.artifact.path !== expectedRetainedPath
	) {
		return null;
	}
	const outputDir = path.join(subsetArtifactRoot, sourceDocumentId);
	const originalPath = path.join(outputDir, 'original.json');
	const retainedPath = path.join(outputDir, 'retained.json');
	mkdirSync(outputDir, { recursive: true });
	copyFileSync(path.resolve(rootDir, subset.original.artifact.path), originalPath);
	copyFileSync(path.resolve(rootDir, subset.retained.artifact.path), retainedPath);
	return {
		original: jsonArtifact(originalPath, { rootDir }),
		retained: jsonArtifact(retainedPath, { rootDir })
	};
}

function subsetArtifactQuestions(record) {
	if (!validSubsetArtifact(record)) return [];
	const value = readJson(path.resolve(rootDir, record.path));
	return Array.isArray(value?.questions) ? value.questions : [];
}

function exactQuestionRefMap(questions) {
	const rows = new Map();
	for (const question of questions) {
		const ref = String(question?.sourceQuestionRef ?? '').trim();
		const markValue = Number(question?.marks);
		if (!ref || rows.has(ref) || !Number.isInteger(markValue) || markValue < 0) return null;
		rows.set(ref, markValue);
	}
	return rows;
}

function questionMarkTotal(questions) {
	return sum(questions.map((question) => Number(question?.marks ?? 0)));
}

function sameArtifactDigest(left, right) {
	return left?.sha256 === right?.sha256 && left?.canonicalJsonSha256 === right?.canonicalJsonSha256;
}

function validSubsetArtifact(record) {
	if (
		!record?.path ||
		!/^[a-f0-9]{64}$/.test(String(record.sha256 ?? '')) ||
		!/^[a-f0-9]{64}$/.test(String(record.canonicalJsonSha256 ?? ''))
	) {
		return false;
	}
	const filePath = path.resolve(rootDir, record.path);
	return (
		existsSync(filePath) &&
		jsonArtifactMatches(record, filePath) &&
		fileSha256(filePath) === record.sha256
	);
}

function approvalDisposition(policy, database) {
	const unsupportedResponses = Number(database?.paperSittingDiagnostics?.unsupportedResponses ?? 0);
	const incompleteGradingQuestions = Number(
		database?.paperSittingDiagnostics?.incompleteGradingQuestions ?? 0
	);
	const runtimeBlocker = unsupportedResponses
		? `${unsupportedResponses} marked response(s) cannot be completely automatically graded`
		: incompleteGradingQuestions
			? `${incompleteGradingQuestions} question(s) lack complete official grading evidence`
			: null;
	const effectivePolicy = runtimeBlocker ? { eligible: false, reason: runtimeBlocker } : policy;
	if (!database || database.status === 'missing') {
		return {
			status: 'missing_database',
			eligible: effectivePolicy.eligible,
			reason: effectivePolicy.reason
		};
	}
	if (!effectivePolicy.eligible) {
		return {
			status:
				database.approvedFullPaper === true ? 'invalid_approval_present' : 'withheld_ineligible',
			eligible: false,
			reason: effectivePolicy.reason
		};
	}
	if (database.status !== 'matched') {
		return { status: 'database_mismatch', eligible: true, reason: effectivePolicy.reason };
	}
	if (database.approvedFullPaper !== true || database.fullPaperReviewStatus !== 'approved') {
		return { status: 'not_approved', eligible: true, reason: effectivePolicy.reason };
	}
	if (
		database.approvedQuestionCount !== database.questions ||
		database.approvedMarkTotal !== database.marks
	) {
		return { status: 'approval_count_mismatch', eligible: true, reason: effectivePolicy.reason };
	}
	if (
		!Number.isInteger(database.durationMinutes) ||
		database.durationMinutes <= 0 ||
		!database.fullPaperReviewedAt ||
		!/^paper-sitting-content-v1:[a-f0-9]{64}$/.test(
			String(database.approvedContentFingerprint ?? '')
		) ||
		database.approvedContentFingerprint !== database.liveContentFingerprint
	) {
		return {
			status: 'approval_metadata_incomplete',
			eligible: true,
			reason: effectivePolicy.reason
		};
	}
	return { status: 'approved', eligible: true, reason: effectivePolicy.reason };
}

function documentEvidence(document) {
	if (!document) return null;
	const localPath = document.local_path ?? document.path ?? null;
	const resolvedPath = localPath ? path.resolve(rootDir, localPath) : null;
	return {
		documentType: supportingDocumentType(document),
		filename: document.filename ?? (localPath ? path.basename(localPath) : null),
		title: document.title ?? null,
		url: document.url ?? document.source_url ?? null,
		localPath,
		sha256:
			resolvedPath && existsSync(resolvedPath)
				? fileSha256(resolvedPath)
				: (document.sha256 ?? null),
		declaredSha1: document.sha1hash ?? null,
		pageCount: document.page_count ?? null
	};
}

function supportingDocumentType(document) {
	const declared = String(document?.document_type ?? document?.documentType ?? '').trim();
	if (declared) return declared;
	const filename = String(document?.filename ?? document?.local_path ?? '').toLowerCase();
	if (filename.includes('wre') || filename.includes('-er-')) return 'examiner_report';
	if (filename.includes('pre-release') || filename.includes('pre_release')) return 'pre_release';
	if (filename.includes('insert') || filename.includes('-ins-')) return 'insert';
	return 'supporting_document';
}

function supportingDocuments(row) {
	const documents = [];
	if (row.examiner_report) documents.push(row.examiner_report);
	documents.push(...(row.examiner_reports ?? []));
	documents.push(...(row.supporting_documents ?? []));
	const seen = new Set();
	return documents.filter((document) => {
		const key =
			document.local_path ?? document.filename ?? document.url ?? JSON.stringify(document);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function artifactEvidence(filePath) {
	if (!existsSync(filePath)) return null;
	return { path: relative(filePath), sha256: fileSha256(filePath) };
}

function jsonArtifactEvidence(filePath) {
	if (!existsSync(filePath)) return null;
	return {
		path: relative(filePath),
		sha256: fileSha256(filePath),
		...readJson(filePath)
	};
}

function batchEvidence(summaryPath, summary) {
	if (!summaryPath || !summary) return null;
	return {
		path: relative(summaryPath),
		sha256: fileSha256(summaryPath),
		status: summary.status ?? null,
		selected: summary.selected ?? null,
		passed: summary.passed ?? null,
		failed: summary.failed ?? null,
		illustrations: summary.chainIllustrations
			? {
					status: summary.chainIllustrations.status ?? null,
					counts: summary.chainIllustrations.counts ?? null
				}
			: null
	};
}

function batchResult(summary, sourceDocumentId) {
	const result = summary?.results?.find((row) => row.sourceDocumentId === sourceDocumentId);
	if (!result) return null;
	return { status: result.status ?? null, error: result.error ?? null };
}

function finalWorkRootFor(sourceDocumentId) {
	if (
		combinedWorkRoot &&
		existsSync(
			path.join(combinedWorkRoot, sourceDocumentId, 'codex-production-import-summary.json')
		)
	) {
		return path.join(combinedWorkRoot, sourceDocumentId);
	}
	return path.join(primaryWorkRoot, sourceDocumentId);
}

function indexRows(value, key) {
	const rows = Array.isArray(value) ? value : (value?.rows ?? []);
	return new Map(rows.filter((row) => row?.[key]).map((row) => [row[key], row]));
}

function duplicateValues(values) {
	const seen = new Set();
	const duplicates = new Set();
	for (const value of values) {
		if (seen.has(value)) duplicates.add(value);
		seen.add(value);
	}
	return [...duplicates];
}

function fullPaperPolicy(sourceDocumentId) {
	if (sourceDocumentId.includes('section-a-option-b-germany')) {
		return {
			eligible: false,
			reason: 'partial-option-booklet; must not be approved as a complete timed paper'
		};
	}
	if (
		new Set([
			'ocr-j351-01-qp-jun24',
			'ocr-j351-02-qp-jun24',
			'ocr-j352-01-qp-jun24',
			'ocr-j352-02-qp-jun24'
		]).has(sourceDocumentId)
	) {
		return {
			eligible: false,
			reason:
				'official paper contains learner-selected alternatives; the flat all-question inventory is not an answer-all timed sitting'
		};
	}
	return {
		eligible: true,
		reason: 'complete-paper candidate; approval still requires the full sitting gate'
	};
}

function yearFromSeries(series) {
	const match = String(series ?? '').match(/\b(20\d{2})\b/);
	return match ? Number(match[1]) : null;
}

function sum(values) {
	return values.reduce((total, value) => total + Number(value ?? 0), 0);
}

function numberOrNull(value) {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function fileSha256(filePath) {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath) {
	return filePath && existsSync(filePath) ? readJson(filePath) : null;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, fallback = '') {
	const prefix = `--${name}=`;
	const argument = process.argv.find((candidate) => candidate.startsWith(prefix));
	return argument ? argument.slice(prefix.length) : fallback;
}

function requiredPath(name) {
	const value = stringArg(name, '');
	if (!value) throw new Error(`--${name}=<path> is required.`);
	const resolved = path.resolve(rootDir, value);
	if (!existsSync(resolved)) throw new Error(`--${name} does not exist: ${relative(resolved)}.`);
	return resolved;
}

function optionalPath(name) {
	const value = stringArg(name, '');
	return value ? path.resolve(rootDir, value) : null;
}

function repeatedPaths(name) {
	const prefix = `--${name}=`;
	return process.argv
		.filter((candidate) => candidate.startsWith(prefix))
		.map((candidate) => path.resolve(rootDir, candidate.slice(prefix.length)))
		.filter((filePath) => existsSync(filePath));
}
