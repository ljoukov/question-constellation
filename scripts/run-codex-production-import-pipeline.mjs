#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync
} from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { preserveExtractionFactsForChainPhase } from './lib/answer-chain-phase-boundary.mjs';
import { d1Rows } from './lib/d1-rest.mjs';
import {
	binaryArtifactMatches,
	canonicalJsonSha256,
	jsonArtifact,
	jsonArtifactMatches,
	jsonValueMatches,
	phaseArtifactSchemaMatches
} from './lib/codex-phase-artifacts.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';
import {
	assertLearnerVisibleAssetBundleCurrent,
	assertVerifiedLearnerAssetCopiesCurrent,
	stageLearnerVisibleAssetBundle
} from './lib/learner-visible-asset-binding.mjs';
import { exactExistingChainContextSnapshotEvidenceMatches } from './lib/existing-chain-context-evidence.mjs';
import {
	componentCodeCompatibility,
	findVisibleComponent,
	normalizeComponentCode
} from './lib/source-identity.mjs';
import { exactQuestionRefSetMatches } from './lib/question-ref-set.mjs';
import {
	assertBoundJsonInputCurrent,
	assertExactJsonArtifactsEqual,
	captureBoundJsonInput,
	exactJsonArtifactMatches,
	stageBoundJsonSnapshot
} from './lib/phase-input-binding.mjs';
import {
	assertRealImportGatePolicy,
	assertRealImportModelPolicy,
	assertRealImportSourceDropPolicy,
	codexRunMatchesModelPolicy
} from './lib/production-import-policy.mjs';
import {
	exactOcrEnglishCopyrightSubsetExtractionEvidence,
	expectedOcrEnglishCopyrightSubsetDrops
} from './lib/ocr-english-copyright-subsets.mjs';
import {
	resolveSelectivePaperCommandLock,
	verifySelectivePaperCommandInputs
} from './lib/selective-paper-cohort-lock.mjs';
import { exactSupportingDocumentMetadataMatches } from './lib/supporting-document-metadata.mjs';
import { fingerprintPaperSittingContent } from '../src/lib/server/paperSittingContentFingerprint.js';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/run-codex-production-import-pipeline.mjs \\
  --question-paper=<official-question-paper.pdf> \\
  --mark-scheme=<official-mark-scheme.pdf> \\
  --source-document-id=<stable-source-id>

Optional:
  --mark-scheme-document-id=<stable-mark-scheme-id>
  --cohort-lock=data/release/selective-paper-cohort-lock.json
  --supporting-document=<insert-or-examiner-report.pdf>
  --existing-chains=<existing-chain-context.json>
  --existing-chain-input-root=<audited-json-root>
  --work-root=tmp/codex-production-import/<source-id>
  --model=gpt-5.6-sol
  --extraction-model=gpt-5.6-sol
  --extraction-thinking-level=max
  --chain-model=gpt-5.6-sol
  --chain-thinking-level=max
  --judge-model=gpt-5.6-sol
  --judge-thinking-level=max
  --solvability-model=gpt-5.6-sol
  --solvability-thinking-level=max
  --solvability-timeout-ms=7200000
  --expected-marks=100
  --expected-questions=46
  --run-id=<stable-log-id>
  --skip-solvability           skip the default Codex SDK solvability judge
  --run-legacy-solvability     use the old @ljoukov/llm solvability path instead of Codex SDK
  --skip-extraction-judge
  --run-legacy-chain-style-judge
  --no-import-check
  --skip-d1-conflict-check
  --allow-shared-chain-updates
  --skip-r2-upload
  --r2-asset-root=<audited-extraction-root>  upload referenced assets from a preserved run root
  --generate-chain-illustrations  compatibility flag; real D1 imports generate illustrations by default
  --skip-chain-illustrations      opt out of the automatic post-import illustration phase
  --require-chain-illustrations   make illustration failure fail the paper import
  --chain-illustration-max-chains=5
  --chain-illustration-planner-model=gpt-5.6-sol
  --chain-illustration-planner-thinking-level=max
  --chain-illustration-judge-model=gpt-5.6-sol
  --chain-illustration-judge-thinking-level=max
  --chain-illustration-image-model=chatgpt-gpt-image-2
  --chain-illustration-image-timeout-ms=7200000
  --force-chain-illustrations     regenerate even when a primary illustration exists
  --allow-visible-source-mismatch
  --allow-unpublishable-source-drops
  --reviewed-repair-evidence=<bounded-repair-evidence.json>
  --reviewed-asset-repair-evidence=<bounded-asset-repair-evidence.json>
  --reuse-existing-extraction
  --allow-dropped-questions  diagnostic only: allow partial import-ready subsets
  --import
  --force
  --resume-passed-phases      reuse exact passed artifacts; force-replace any rejected phase workdir
  --rerun-passed-phases       opt out of failed-attempt phase reuse when forcing a retry
  --dry-run

Metadata flags are forwarded to the PDF extraction run:
  --board --qualification --subject --subject-area --tier --paper-label --component-code
  --series --year --question-paper-title --mark-scheme-title --question-paper-url --mark-scheme-url`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const sourceDocumentId = requiredStringArg('source-document-id');
const questionPaperPath = path.resolve(rootDir, requiredStringArg('question-paper'));
const markSchemePath = path.resolve(rootDir, requiredStringArg('mark-scheme'));
const supportingDocumentPaths = repeatedStringArg('supporting-document').map((filePath) =>
	path.resolve(rootDir, filePath)
);
const workRoot = path.resolve(
	rootDir,
	stringArg('work-root', path.join('tmp/codex-production-import', sourceDocumentId))
);
const sourceSnapshotRoot = path.join(workRoot, 'verified-source-snapshots');
const sourceSnapshotPaths = {
	questionPaper: path.join(sourceSnapshotRoot, 'question-paper.pdf'),
	markScheme: path.join(sourceSnapshotRoot, 'mark-scheme.pdf'),
	supportingDocuments: supportingDocumentPaths.map((filePath, index) =>
		path.join(
			sourceSnapshotRoot,
			`supporting-${String(index + 1).padStart(2, '0')}-${path.basename(filePath)}`
		)
	)
};
const phaseSnapshotRoot = path.join(workRoot, 'verified-phase-snapshots');
const phaseSnapshotPaths = {
	extraction: path.join(phaseSnapshotRoot, 'extraction.json'),
	reconciled: path.join(phaseSnapshotRoot, 'chain-reconciled.json'),
	importReady: path.join(phaseSnapshotRoot, 'import-ready.json')
};
const learnerAssetBundleRoot = path.join(workRoot, 'verified-learner-assets');
const learnerAssetManifestPath = path.join(learnerAssetBundleRoot, 'manifest.json');
const r2AssetRoot = path.resolve(
	rootDir,
	stringArg('r2-asset-root', path.join(workRoot, 'codex-extraction'))
);
const rawOutputPath = path.join(workRoot, 'raw', `${sourceDocumentId}.json`);
const extractionSummaryPath = path.join(workRoot, 'codex-extraction-summary.json');
const extractionJudgeOutputPath = path.join(workRoot, 'extraction-judge', 'judge-report.json');
const extractionJudgeSummaryPath = path.join(workRoot, 'codex-extraction-judge-summary.json');
const reconciledOutputPath = path.join(workRoot, 'chain-reconciled', `${sourceDocumentId}.json`);
const chainSummaryPath = path.join(workRoot, 'codex-chain-summary.json');
const importReadyRoot = path.join(workRoot, 'import-ready');
const importReadyAuditPath = path.join(workRoot, 'import-ready-audit.json');
const importReadyPaperPath = path.join(importReadyRoot, `${sourceDocumentId}.json`);
const solvabilityOutputPath = path.join(workRoot, 'codex-solvability', 'solvability-report.json');
const solvabilitySummaryPath = path.join(workRoot, 'codex-solvability-summary.json');
const summaryPath = path.join(workRoot, 'codex-production-import-summary.json');
const dryRun = hasArg('dry-run');
const force = hasArg('force');
const previousAttemptSummary = readJsonIfExists(summaryPath);
const resumePassedPhases =
	!hasArg('rerun-passed-phases') &&
	(hasArg('resume-passed-phases') ||
		(force &&
			previousAttemptSummary?.plan?.sourceDocumentId === sourceDocumentId &&
			previousAttemptSummary?.status === 'failed'));
// A phase command is reached only after exact reuse was rejected, so its stale workdir is disposable.
const replaceRejectedPhaseArtifacts = force || resumePassedPhases;
const runExtractionJudge = !hasArg('skip-extraction-judge');
const skipSolvability = hasArg('skip-solvability');
const runLegacySolvability = hasArg('run-legacy-solvability') && !skipSolvability;
const runCodexSolvability = !skipSolvability && !runLegacySolvability;
const noImportCheck = hasArg('no-import-check');
const importToD1 = hasArg('import');
const checkExisting = !noImportCheck && !hasArg('skip-d1-conflict-check');
const allowUnpublishableSourceDrops = hasArg('allow-unpublishable-source-drops');
const allowDroppedQuestions = hasArg('allow-dropped-questions');
const uploadR2Assets = importToD1 && !hasArg('skip-r2-upload');
const phaseModelPolicy = {
	extraction: {
		model: stringArg('extraction-model', stringArg('model', 'gpt-5.6-sol')),
		thinkingLevel: stringArg('extraction-thinking-level', stringArg('thinking-level', 'max'))
	},
	'extraction judge': {
		model: stringArg('judge-model', stringArg('model', 'gpt-5.6-sol')),
		thinkingLevel: stringArg('judge-thinking-level', 'max')
	},
	'answer chains': {
		model: stringArg('chain-model', stringArg('model', 'gpt-5.6-sol')),
		thinkingLevel: stringArg('chain-thinking-level', 'max')
	},
	solvability: {
		model: stringArg('solvability-model', stringArg('model', 'gpt-5.6-sol')),
		thinkingLevel: stringArg('solvability-thinking-level', 'max')
	}
};
const explicitlyGenerateChainIllustrations =
	hasArg('generate-chain-illustrations') || hasArg('require-chain-illustrations');
const skipChainIllustrations = hasArg('skip-chain-illustrations');
const generateChainIllustrations = !skipChainIllustrations && importToD1 && !noImportCheck;
const requireChainIllustrations = hasArg('require-chain-illustrations');
const chainIllustrationSummaryPath = path.join(workRoot, 'chain-illustrations', 'summary.json');
let extractionSnapshotBinding = null;
let reconciledSnapshotBinding = null;
let importReadySnapshotBinding = null;
let learnerAssetManifestBinding = null;

if (importToD1 && !runCodexSolvability) {
	throw new Error(
		'A real --import requires the current Codex solvability gate; do not use --skip-solvability or --run-legacy-solvability.'
	);
}
if (importToD1 && hasArg('skip-r2-upload')) {
	throw new Error('A real --import cannot opt out of the required R2 upload gate.');
}
if (explicitlyGenerateChainIllustrations && (!importToD1 || noImportCheck)) {
	throw new Error(
		'--generate-chain-illustrations requires a real D1 import: use --import without --no-import-check.'
	);
}
if (skipChainIllustrations && explicitlyGenerateChainIllustrations) {
	throw new Error(
		'--skip-chain-illustrations cannot be combined with --generate-chain-illustrations or --require-chain-illustrations.'
	);
}
assertRealImportGatePolicy({
	importToD1,
	extractionJudgeEnabled: runExtractionJudge,
	d1ConflictCheckEnabled: checkExisting
});
assertRealImportModelPolicy({ importToD1, phases: phaseModelPolicy });

for (const filePath of [questionPaperPath, markSchemePath, ...supportingDocumentPaths]) {
	if (!existsSync(filePath)) throw new Error(`Input file does not exist: ${filePath}`);
}

const cohortLockArgument = stringArg('cohort-lock', '');
let cohortLockEvidence = null;
const resolvedCommandLock = resolveSelectivePaperCommandLock({
	rootDir,
	sourceDocumentId,
	requestedLockPath: cohortLockArgument
});
if (resolvedCommandLock) {
	const loaded = resolvedCommandLock;
	const verifiedInputs = verifySelectivePaperCommandInputs({
		lock: loaded.lock,
		sourceDocumentId,
		rootDir,
		questionPaperPath,
		markSchemePath,
		supportingDocumentPaths
	});
	const lockedSupportingDocuments =
		loaded.lock.supportingDocumentsBySourceId[sourceDocumentId] ?? [];
	cohortLockEvidence = {
		path: relative(loaded.path),
		sha256: loaded.sha256,
		...verifiedInputs,
		supportingDocuments: verifiedInputs.supportingDocuments.map((document, index) => ({
			...document,
			documentType: lockedSupportingDocuments[index].documentType,
			filename: lockedSupportingDocuments[index].filename
		}))
	};
}
assertRealImportSourceDropPolicy({
	importToD1,
	sourceDocumentId,
	unpublishableSourceDropsAllowed: allowUnpublishableSourceDrops,
	droppedQuestionsAllowed: allowDroppedQuestions,
	cohortLockEvidence
});

const sourceIdentityCheck = inspectSourceIdentity();

const plan = {
	sourceDocumentId,
	questionPaperPath: relative(questionPaperPath),
	markSchemePath: relative(markSchemePath),
	supportingDocumentPaths: supportingDocumentPaths.map(relative),
	verifiedSourceSnapshotRoot: relative(sourceSnapshotRoot),
	verifiedPhaseSnapshotRoot: relative(phaseSnapshotRoot),
	learnerAssetManifestPath: relative(learnerAssetManifestPath),
	cohortLock: cohortLockEvidence,
	reviewedRepairEvidencePath: stringArg('reviewed-repair-evidence', '') || null,
	reviewedAssetRepairEvidencePath: stringArg('reviewed-asset-repair-evidence', '') || null,
	workRoot: relative(workRoot),
	rawOutputPath: relative(rawOutputPath),
	extractionJudgeOutputPath: relative(extractionJudgeOutputPath),
	reconciledOutputPath: relative(reconciledOutputPath),
	importReadyRoot: relative(importReadyRoot),
	importReadyAuditPath: relative(importReadyAuditPath),
	summaryPath: relative(summaryPath),
	sourceIdentityCheck,
	phaseModelPolicy,
	runExtractionJudge,
	solvabilityMode: skipSolvability ? 'none' : runLegacySolvability ? 'legacy' : 'codex',
	solvabilityOutputPath: runCodexSolvability ? relative(solvabilityOutputPath) : null,
	importMode: noImportCheck ? 'none' : importToD1 ? 'write' : 'dry-run',
	checkExisting,
	allowUnpublishableSourceDrops,
	allowDroppedQuestions,
	uploadR2Assets,
	r2AssetRoot: uploadR2Assets ? relative(r2AssetRoot) : null,
	skipChainIllustrations,
	generateChainIllustrations,
	requireChainIllustrations,
	resumePassedPhases,
	replaceRejectedPhaseArtifacts,
	chainIllustrationSummaryPath: generateChainIllustrations
		? relative(chainIllustrationSummaryPath)
		: null
};

if (dryRun) {
	console.log(JSON.stringify({ status: 'dry-run', plan, commands: plannedCommands() }, null, 2));
	process.exit(0);
}

mkdirSync(workRoot, { recursive: true });
const startedAt = new Date().toISOString();
const steps = [];
try {
	stageVerifiedSourceSnapshots();
	steps.push({ label: 'verified read-only source snapshots', status: 'passed' });
	enforceSourceIdentity(sourceIdentityCheck);
	steps.push({ label: 'visible PDF source identity preflight', status: 'passed' });
	if (resumePassedPhases && reusableExtraction()) {
		steps.push({ label: 'Codex PDF extraction', status: 'reused' });
	} else {
		steps.push(runInherited(extractionCommand(), 'Codex PDF extraction'));
	}
	if (!reusableExtraction()) {
		throw new Error('Fresh extraction artifacts failed exact post-phase validation.');
	}
	extractionSnapshotBinding = stageGeneratedPhaseSnapshot(
		rawOutputPath,
		phaseSnapshotPaths.extraction,
		'PDF extraction output'
	);
	learnerAssetManifestBinding = stageLearnerVisibleAssetBundle({
		paper: extractionSnapshotBinding.value,
		paperArtifact: extractionSnapshotBinding.artifact,
		rootDir,
		bundleRoot: learnerAssetBundleRoot,
		sourceDocumentId
	});
	steps.push({
		label: 'verified learner-visible binary asset bundle',
		status: 'passed',
		assetCount: learnerAssetManifestBinding.manifest.assetCount
	});
	if (runExtractionJudge) {
		if (resumePassedPhases && reusableExtractionJudge()) {
			steps.push({ label: 'independent Codex extraction judge', status: 'reused' });
		} else {
			steps.push(runInherited(extractionJudgeCommand(), 'independent Codex extraction judge'));
		}
		if (!reusableExtraction() || !reusableExtractionJudge()) {
			throw new Error('Fresh extraction-judge artifacts failed exact post-phase validation.');
		}
	}
	const chainReuse = resumePassedPhases ? reusableOrRepairableChains() : null;
	if (chainReuse) {
		steps.push({
			label: 'Codex answer-chain reconciliation',
			status: chainReuse === 'repaired' ? 'reused-after-boundary-repair' : 'reused'
		});
	} else {
		steps.push(runInherited(chainCommand(), 'Codex answer-chain reconciliation'));
	}
	const verifiedChain = reusableOrRepairableChains();
	if (!verifiedChain) {
		throw new Error('Fresh answer-chain artifacts failed exact post-phase validation.');
	}
	reconciledSnapshotBinding = stageGeneratedPhaseSnapshot(
		reconciledOutputPath,
		phaseSnapshotPaths.reconciled,
		'Answer-chain reconciliation output'
	);
	let importReady = null;
	if (runCodexSolvability) {
		importReady = runJson(
			prepareImportReadyCommand({ forceNoImportCheck: true }),
			'strict audit before Codex solvability'
		);
		steps.push({ label: 'strict audit before Codex solvability', status: 'passed' });
		importReadySnapshotBinding = stageGeneratedPhaseSnapshot(
			importReadyPaperPath,
			phaseSnapshotPaths.importReady,
			'Import-ready output'
		);
		if (resumePassedPhases && reusableSolvability()) {
			steps.push({ label: 'Codex solvability judge', status: 'reused' });
		} else {
			steps.push(runInherited(codexSolvabilityCommand(), 'Codex solvability judge'));
		}
		if (!reusableSolvability()) {
			throw new Error('Fresh solvability artifacts failed exact post-phase validation.');
		}
		if (uploadR2Assets) {
			steps.push(runInherited(uploadAssetsCommand(), 'exact R2 asset upload and remote readback'));
		}
		if (!noImportCheck) {
			importReady = runJson(
				prepareImportReadyCommand(),
				`strict audit / D1 ${importToD1 ? 'write' : 'dry-run'}`
			);
			steps.push({
				label: `strict audit / D1 ${importToD1 ? 'write' : 'dry-run'}`,
				status: 'passed'
			});
			assertImportReadyStillMatchesSolvabilityInput();
			if (importToD1) {
				importReady = await bindExactPostImportContentFingerprint(importReady);
				steps.push({
					label: 'exact post-import D1 content fingerprint',
					status: 'passed'
				});
			}
		}
	} else {
		importReady = runJson(
			prepareImportReadyCommand({ includeLegacySolvability: runLegacySolvability }),
			`strict audit${runLegacySolvability ? ' / legacy solvability' : ''} / D1 ${
				noImportCheck ? 'none' : importToD1 ? 'write' : 'dry-run'
			}`
		);
		steps.push({
			label: `strict audit${runLegacySolvability ? ' / legacy solvability' : ''} / D1 ${
				noImportCheck ? 'none' : importToD1 ? 'write' : 'dry-run'
			}`,
			status: 'passed'
		});
	}
	if (generateChainIllustrations) {
		steps.push(
			runOptionalInherited(chainIllustrationCommand(), 'answer-chain illustration generation', {
				required: requireChainIllustrations
			})
		);
	}
	const summary = {
		status: 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		steps,
		importReady,
		solvabilitySummary: readJsonIfExists(solvabilitySummaryPath),
		extractionSummary: readJsonIfExists(extractionSummaryPath),
		extractionJudgeSummary: readJsonIfExists(extractionJudgeSummaryPath),
		chainSummary: readJsonIfExists(chainSummaryPath),
		chainIllustrationSummary: readJsonIfExists(chainIllustrationSummaryPath)
	};
	writeJson(summaryPath, summary);
	console.log(JSON.stringify({ ...summary, summary: relative(summaryPath) }, null, 2));
} catch (error) {
	const summary = {
		status: 'failed',
		startedAt,
		finishedAt: new Date().toISOString(),
		plan,
		steps,
		error: error instanceof Error ? error.message : String(error),
		extractionSummary: readJsonIfExists(extractionSummaryPath),
		extractionJudgeSummary: readJsonIfExists(extractionJudgeSummaryPath),
		chainSummary: readJsonIfExists(chainSummaryPath),
		solvabilitySummary: readJsonIfExists(solvabilitySummaryPath),
		chainIllustrationSummary: readJsonIfExists(chainIllustrationSummaryPath)
	};
	writeJson(summaryPath, summary);
	console.error(JSON.stringify({ ...summary, summary: relative(summaryPath) }, null, 2));
	process.exit(1);
}

function plannedCommands() {
	return [
		extractionCommand(),
		...(runExtractionJudge ? [extractionJudgeCommand()] : []),
		chainCommand(),
		...(runCodexSolvability
			? [
					prepareImportReadyCommand({ forceNoImportCheck: true }),
					codexSolvabilityCommand(),
					...(uploadR2Assets ? [uploadAssetsCommand()] : []),
					...(noImportCheck ? [] : [prepareImportReadyCommand()])
				]
			: [prepareImportReadyCommand({ includeLegacySolvability: runLegacySolvability })]),
		...(generateChainIllustrations ? [chainIllustrationCommand()] : [])
	].map((command) => command.map(String));
}

function reusableExtraction() {
	const summary = readJsonIfExists(extractionSummaryPath);
	const paper = readJsonIfExists(rawOutputPath);
	const phase = summary?.phaseArtifacts;
	return (
		summary?.status === 'passed' &&
		codexRunMatchesPhasePolicy(summary?.codex, 'extraction') &&
		paperMatchesSource(paper) &&
		phaseArtifactSchemaMatches(phase) &&
		sourceArtifactsMatch(phase.inputs) &&
		exactJsonFileMatches(phase.outputs?.extraction, rawOutputPath) &&
		extractionSourceDropEvidenceMatches(summary, paper) &&
		reviewedAssetOutputsMatch(phase.outputs?.reviewedAssets)
	);
}

function extractionSourceDropEvidenceMatches(summary, paper) {
	const summaryDrops = summary?.droppedExtractionQuestions;
	const extractionRun = paper?.extractionRun;
	if (!allowUnpublishableSourceDrops) {
		return (
			Array.isArray(summaryDrops) &&
			summaryDrops.length === 0 &&
			(summary?.publishableSubset === null || summary?.publishableSubset === undefined) &&
			extractionRun?.publishableSubset !== true &&
			(!Array.isArray(extractionRun?.droppedUnpublishableSourceQuestions) ||
				extractionRun.droppedUnpublishableSourceQuestions.length === 0) &&
			(!Array.isArray(extractionRun?.droppedUnpublishableSourceQuestionRefs) ||
				extractionRun.droppedUnpublishableSourceQuestionRefs.length === 0)
		);
	}

	const originalPath = path.join(workRoot, 'codex-extraction', 'normalized-extraction.json');
	const retainedPath = path.join(
		workRoot,
		'codex-extraction',
		'normalized-extraction.publishable.json'
	);
	const originalPaper = readJsonIfExists(originalPath);
	const retainedArtifactPaper = readJsonIfExists(retainedPath);
	const subset = summary?.publishableSubset;
	const exactArtifactsAndGenericEvidence =
		subset?.original?.artifact?.path === relative(originalPath) &&
		subset?.retained?.artifact?.path === relative(retainedPath) &&
		jsonArtifactMatches(subset.original.artifact, originalPath) &&
		jsonArtifactMatches(subset.retained.artifact, retainedPath) &&
		isDeepStrictEqual(retainedArtifactPaper, paper) &&
		subset.retained.artifact.sha256 === summary?.phaseArtifacts?.outputs?.extraction?.sha256 &&
		subset.retained.artifact.canonicalJsonSha256 ===
			summary?.phaseArtifacts?.outputs?.extraction?.canonicalJsonSha256 &&
		genericSourceDropEvidenceMatches({
			summary,
			originalPaper,
			retainedPaper: paper,
			originalPath
		});
	if (!exactArtifactsAndGenericEvidence) return false;
	if (!expectedOcrEnglishCopyrightSubsetDrops(sourceDocumentId)) return true;
	return exactOcrEnglishCopyrightSubsetExtractionEvidence({
		sourceDocumentId,
		extractionSummary: summary,
		originalPaper,
		retainedPaper: paper
	});
}

function genericSourceDropEvidenceMatches({ summary, originalPaper, retainedPaper, originalPath }) {
	const summaryDrops = summary?.droppedExtractionQuestions;
	const subset = summary?.publishableSubset;
	const subsetDrops = subset?.dropped?.questions;
	const extractionRun = retainedPaper?.extractionRun;
	const retainedDrops = extractionRun?.droppedUnpublishableSourceQuestions;
	const retainedRefs = extractionRun?.droppedUnpublishableSourceQuestionRefs;
	const originalQuestions = Array.isArray(originalPaper?.questions) ? originalPaper.questions : [];
	if (
		!Array.isArray(summaryDrops) ||
		summaryDrops.length === 0 ||
		!isDeepStrictEqual(summaryDrops, subsetDrops) ||
		!isDeepStrictEqual(summaryDrops, retainedDrops) ||
		!isDeepStrictEqual(
			retainedRefs,
			summaryDrops.map((row) => row?.sourceQuestionRef)
		)
	) {
		return false;
	}
	const droppedRefs = new Set();
	const originalByRef = new Map(
		originalQuestions.map((question) => [
			String(question?.sourceQuestionRef ?? ''),
			Number(question?.marks)
		])
	);
	for (const row of summaryDrops) {
		const ref = String(row?.sourceQuestionRef ?? '');
		if (
			!ref ||
			droppedRefs.has(ref) ||
			!Number.isInteger(Number(row?.marks)) ||
			originalByRef.get(ref) !== Number(row.marks) ||
			row?.deterministicReason !== 'known_unresolved_copyright_source' ||
			!Array.isArray(row?.reasons) ||
			!row.reasons.includes('known_unresolved_copyright_source')
		) {
			return false;
		}
		droppedRefs.add(ref);
	}
	const retainedQuestions = originalQuestions.filter(
		(question) => !droppedRefs.has(String(question?.sourceQuestionRef ?? ''))
	);
	const originalMarkTotal = questionRowsMarkTotal(originalQuestions);
	const retainedMarkTotal = questionRowsMarkTotal(retainedQuestions);
	const droppedMarkTotal = summaryDrops.reduce((total, row) => total + Number(row?.marks ?? 0), 0);
	const expectedRetainedPaper = {
		...originalPaper,
		questions: retainedQuestions,
		extractionRun: {
			...(originalPaper?.extractionRun ?? {}),
			publishableSubset: true,
			publishableSubsetSource: relative(originalPath),
			droppedUnpublishableSourceQuestions: summaryDrops,
			droppedUnpublishableSourceQuestionRefs: [...droppedRefs]
		}
	};
	return (
		subset?.status === 'passed' &&
		subset?.policy === 'known_unresolved_copyright_source_only_v1' &&
		subset?.invariants?.questionCountConserved === true &&
		subset?.invariants?.markTotalConserved === true &&
		subset?.invariants?.onlyKnownUnresolvedCopyrightSource === true &&
		Number(subset?.original?.questionCount) === originalQuestions.length &&
		Number(subset?.original?.markTotal) === originalMarkTotal &&
		Number(subset?.retained?.questionCount) === retainedQuestions.length &&
		Number(subset?.retained?.markTotal) === retainedMarkTotal &&
		Number(subset?.dropped?.questionCount) === summaryDrops.length &&
		Number(subset?.dropped?.markTotal) === droppedMarkTotal &&
		originalQuestions.length === retainedQuestions.length + summaryDrops.length &&
		originalMarkTotal === retainedMarkTotal + droppedMarkTotal &&
		isDeepStrictEqual(expectedRetainedPaper, retainedPaper)
	);
}

function questionRowsMarkTotal(questions) {
	return questions.reduce((total, question) => total + Number(question?.marks ?? 0), 0);
}

function reusableExtractionJudge() {
	const summary = readJsonIfExists(extractionJudgeSummaryPath);
	const report = readJsonIfExists(extractionJudgeOutputPath);
	const paper = readJsonIfExists(rawOutputPath);
	const phase = summary?.phaseArtifacts;
	const ordinaryModelPass = summary?.status === 'passed' && report?.status === 'passed';
	const reviewedSourceClosure =
		summary?.status === 'passed_after_reviewed_source_closure' &&
		report?.status === 'passed_after_reviewed_source_closure' &&
		report?.verdict === 'reviewed_source_closure' &&
		report?.modelJudgePass === false &&
		report?.reviewedSourceClosure?.status === 'passed' &&
		report?.reviewedSourceClosure?.outputArtifact?.sha256 === fileSha256(rawOutputPath) &&
		report?.reviewedSourceClosure?.deterministicValidation?.status === 'passed' &&
		Array.isArray(report?.reviewedSourceClosure?.modelAudits) &&
		report.reviewedSourceClosure.modelAudits.length >= 1 &&
		report.reviewedSourceClosure.modelAudits.every(
			(audit) =>
				audit?.verdict === 'fail' &&
				audit?.model === phaseModelPolicy['extraction judge'].model &&
				audit?.thinkingLevel === phaseModelPolicy['extraction judge'].thinkingLevel &&
				Boolean(audit?.threadId) &&
				Array.isArray(audit?.requiredRepairs)
		);
	if (
		(!ordinaryModelPass && !reviewedSourceClosure) ||
		!codexRunMatchesPhasePolicy(summary?.codex, 'extraction judge') ||
		!paperMatchesSource(paper) ||
		!phaseArtifactSchemaMatches(phase) ||
		!judgeSourceArtifactsMatch(phase.inputs) ||
		!learnerAssetPhaseInputsMatch(phase.inputs, paper, { requireCopies: true }) ||
		!phaseInputMatchesBinding(phase.inputs?.candidate, extractionSnapshotBinding) ||
		!judgeCandidateSnapshotMatches(phase.inputs, {
			allowLegacy: !summary?.plan?.expectedSourceHashes
		}) ||
		!exactJsonFileMatches(phase.outputs?.report, extractionJudgeOutputPath) ||
		!jsonValueMatches(phase.outputs?.report, summary?.judgeReport) ||
		!Array.isArray(report?.requiredRepairs) ||
		report.requiredRepairs.length !== 0
	) {
		return false;
	}
	const auditedDroppedRefs = (summary?.plan?.allowedDroppedSourceQuestions ?? [])
		.map((entry) => entry?.sourceQuestionRef)
		.filter(Boolean);
	const checkedRefs = Array.isArray(report.checkedRefs)
		? report.checkedRefs
		: report.checkedRefList;
	return exactQuestionRefSetMatches({
		checkedRefs,
		questions: paper.questions,
		additionalRefs: auditedDroppedRefs
	});
}

function reusableOrRepairableChains() {
	const summary = readJsonIfExists(chainSummaryPath);
	const inputPaper = readJsonIfExists(
		extractionSnapshotBinding?.path ?? phaseSnapshotPaths.extraction
	);
	const candidatePaper = readJsonIfExists(reconciledOutputPath);
	const phase = summary?.phaseArtifacts;
	if (
		summary?.status !== 'passed' ||
		!codexRunMatchesPhasePolicy(summary?.codex, 'answer chains') ||
		summary?.validation?.status !== 'passed' ||
		!paperMatchesSource(inputPaper) ||
		!paperMatchesSource(candidatePaper) ||
		!phaseArtifactSchemaMatches(phase) ||
		!learnerAssetPhaseInputsMatch(phase.inputs, candidatePaper) ||
		!phaseInputMatchesBinding(phase.inputs?.extraction, extractionSnapshotBinding) ||
		!exactJsonFileMatches(phase.outputs?.reconciled, reconciledOutputPath) ||
		!existingChainContextEvidenceMatches(phase.inputs) ||
		!sameQuestionRefs(
			candidatePaper.questions?.map((question) => question.sourceQuestionRef),
			inputPaper.questions
		)
	) {
		return null;
	}

	const preservedPaper = preserveExtractionFactsForChainPhase(inputPaper, candidatePaper);
	if (!learnerAssetBundleMatchesPaper(preservedPaper)) return null;
	if (isDeepStrictEqual(preservedPaper, candidatePaper)) return 'reused';

	const priorHash = canonicalJsonSha256(candidatePaper);
	writeJson(reconciledOutputPath, preservedPaper);
	writeJson(chainSummaryPath, {
		...summary,
		phaseArtifacts: {
			...phase,
			outputs: {
				...phase.outputs,
				reconciled: jsonArtifact(reconciledOutputPath, { rootDir })
			}
		},
		phaseBoundaryRepair: {
			status: 'repaired',
			version: 'answer-chain-phase-boundary-v1',
			repairedAt: new Date().toISOString(),
			inputExtraction: relative(rawOutputPath),
			chainCandidate: relative(reconciledOutputPath),
			priorCanonicalJsonSha256: priorHash,
			repairedCanonicalJsonSha256: canonicalJsonSha256(preservedPaper),
			hashEncoding: 'sha256(stable-key-sorted-json)',
			mutableQuestionFields: ['answerChain', 'chainResolution', 'commonWeakAnswers']
		}
	});
	return 'repaired';
}

function reusableSolvability() {
	const summary = readJsonIfExists(solvabilitySummaryPath);
	const report = readJsonIfExists(solvabilityOutputPath);
	const paper = readJsonIfExists(
		importReadySnapshotBinding?.path ?? phaseSnapshotPaths.importReady
	);
	const phase = summary?.phaseArtifacts;
	if (
		summary?.status !== 'passed' ||
		!codexRunMatchesPhasePolicy(summary?.codex, 'solvability') ||
		report?.status !== 'passed' ||
		report?.sourceDocumentId !== sourceDocumentId ||
		report?.failed !== 0 ||
		!paperMatchesSource(paper) ||
		!phaseArtifactSchemaMatches(phase) ||
		!learnerAssetPhaseInputsMatch(phase.inputs, paper, { requireCopies: true }) ||
		!phaseInputMatchesBinding(phase.inputs?.candidate, importReadySnapshotBinding) ||
		!exactJsonFileMatches(phase.outputs?.report, solvabilityOutputPath) ||
		!jsonValueMatches(phase.outputs?.report, summary?.report) ||
		!Array.isArray(report?.results) ||
		report.results.some(
			(result) =>
				result?.status !== 'passed' ||
				result?.studentVisibleSolvable !== true ||
				result?.markSchemeFits !== true ||
				!Array.isArray(result?.requiredRepairs) ||
				result.requiredRepairs.length !== 0
		)
	) {
		return false;
	}
	return sameQuestionRefs(
		report.results.map((result) => result.sourceQuestionRef),
		paper.questions
	);
}

function codexRunMatchesPhasePolicy(run, phase) {
	return codexRunMatchesModelPolicy(run, phaseModelPolicy[phase]);
}

function sourceArtifactsMatch(inputs) {
	const reviewedRepairEvidenceArg = stringArg('reviewed-repair-evidence', '');
	const reviewedRepairEvidenceMatches = inputs?.reviewedRepairEvidence
		? Boolean(reviewedRepairEvidenceArg) &&
			jsonArtifactMatches(
				inputs.reviewedRepairEvidence,
				path.resolve(rootDir, reviewedRepairEvidenceArg)
			)
		: !reviewedRepairEvidenceArg;
	const reviewedAssetRepairEvidenceArg = stringArg('reviewed-asset-repair-evidence', '');
	const reviewedAssetRepairEvidenceMatches = inputs?.reviewedAssetRepairEvidence
		? Boolean(reviewedAssetRepairEvidenceArg) &&
			jsonArtifactMatches(
				inputs.reviewedAssetRepairEvidence,
				path.resolve(rootDir, reviewedAssetRepairEvidenceArg)
			)
		: !reviewedAssetRepairEvidenceArg;
	return (
		binaryArtifactMatches(inputs?.questionPaper, questionPaperPath) &&
		binaryArtifactMatches(inputs?.markScheme, markSchemePath) &&
		Array.isArray(inputs?.supportingDocuments) &&
		inputs.supportingDocuments.length === supportingDocumentPaths.length &&
		inputs.supportingDocuments.every((artifact, index) =>
			binaryArtifactMatches(artifact, supportingDocumentPaths[index])
		) &&
		exactSupportingDocumentMetadataMatches(
			inputs?.supportingDocumentMetadata,
			expectedSupportingDocumentMetadata()
		) &&
		verifiedSourceSnapshotsMatch(inputs, {
			questionPaperPath,
			markSchemePath,
			supportingDocumentPaths
		}) &&
		reviewedRepairEvidenceMatches &&
		reviewedAssetRepairEvidenceMatches
	);
}

function expectedSupportingDocumentMetadata() {
	if (cohortLockEvidence) {
		return cohortLockEvidence.supportingDocuments.map(({ documentType, filename }) => ({
			documentType,
			filename
		}));
	}
	return sourceSnapshotPaths.supportingDocuments.map((filePath) => ({
		documentType: inferredSupportingDocumentType(filePath),
		filename: path.basename(filePath)
	}));
}

function inferredSupportingDocumentType(filePath) {
	const basename = path.basename(filePath).toLowerCase();
	if (/\bwre\b|(?:^|-)er(?:-|\.pdf$)|examiner|examiners|report/.test(basename)) {
		return 'examiner_report';
	}
	if (/\bins\b|insert|preliminary/.test(basename)) return 'insert';
	return 'supporting_document';
}

function reviewedAssetOutputsMatch(outputs) {
	const evidenceArg = stringArg('reviewed-asset-repair-evidence', '');
	if (!evidenceArg) return outputs === null || outputs === undefined;
	if (!Array.isArray(outputs) || outputs.length !== 1) return false;
	const artifact = outputs[0];
	return (
		Boolean(artifact?.path) && binaryArtifactMatches(artifact, path.resolve(rootDir, artifact.path))
	);
}

function judgeSourceArtifactsMatch(inputs) {
	return (
		binaryArtifactMatches(inputs?.questionPaper, questionPaperPath) &&
		binaryArtifactMatches(inputs?.markScheme, markSchemePath) &&
		verifiedSourceSnapshotsMatch(inputs, {
			questionPaperPath,
			markSchemePath,
			supportingDocumentPaths: []
		})
	);
}

function verifiedSourceSnapshotsMatch(
	inputs,
	{
		questionPaperPath: canonicalQuestionPaper,
		markSchemePath: canonicalMarkScheme,
		supportingDocumentPaths: canonicalSupporting
	}
) {
	const attestation = inputs?.verifiedModelInputSnapshots ?? null;
	const canonicalPathsMatch =
		inputs?.questionPaper?.path === relative(canonicalQuestionPaper) &&
		inputs?.markScheme?.path === relative(canonicalMarkScheme) &&
		Array.isArray(inputs?.supportingDocuments) &&
		inputs.supportingDocuments.length === canonicalSupporting.length &&
		inputs.supportingDocuments.every(
			(artifact, index) => artifact?.path === relative(canonicalSupporting[index])
		);
	if (!attestation) return !cohortLockEvidence && canonicalPathsMatch;
	if (
		!canonicalPathsMatch ||
		Object.keys(attestation).sort().join(',') !== 'schemaVersion,snapshots,sourceDocumentId' ||
		attestation.schemaVersion !== 'verified-source-snapshot-attestation-v1' ||
		attestation.sourceDocumentId !== sourceDocumentId
	) {
		return false;
	}
	const snapshotRecords = [
		[attestation.snapshots?.questionPaper, inputs.questionPaper],
		[attestation.snapshots?.markScheme, inputs.markScheme],
		...(Array.isArray(attestation.snapshots?.supportingDocuments) &&
		attestation.snapshots.supportingDocuments.length === inputs.supportingDocuments.length
			? attestation.snapshots.supportingDocuments.map((snapshot, index) => [
					snapshot,
					inputs.supportingDocuments[index]
				])
			: [[null, null]])
	];
	return snapshotRecords.every(([snapshot, canonical]) => {
		if (!snapshot?.path || snapshot.sha256 !== canonical?.sha256) return false;
		const snapshotPath = path.resolve(rootDir, snapshot.path);
		return (
			snapshotPath.startsWith(`${workRoot}${path.sep}`) &&
			binaryArtifactMatches(snapshot, snapshotPath)
		);
	});
}

function judgeCandidateSnapshotMatches(inputs, { allowLegacy = false } = {}) {
	const snapshot = inputs?.judgeCandidateSnapshot;
	const derivation = inputs?.candidateSnapshotDerivation;
	if (!snapshot?.path) return false;
	const snapshotPath = path.resolve(rootDir, snapshot.path);
	const snapshotIsCurrent =
		snapshotPath.startsWith(`${workRoot}${path.sep}`) &&
		exactJsonFileMatches(snapshot, snapshotPath);
	if (!snapshotIsCurrent) return false;
	if (!derivation) return allowLegacy;
	return (
		derivation.schemaVersion === 'judge-candidate-snapshot-v1' &&
		isDeepStrictEqual(derivation.source, inputs?.candidate) &&
		isDeepStrictEqual(derivation.snapshot, snapshot)
	);
}

function existingChainContextEvidenceMatches(inputs) {
	const source = inputs?.existingChainContext;
	const snapshot = inputs?.existingChainContextModelSnapshot;
	const derivation = inputs?.existingChainContextSnapshotDerivation;
	const currentPath = stringArg('existing-chains', '');
	const currentInputRoot = stringArg('existing-chain-input-root', '');
	if (!currentPath && !currentInputRoot) {
		return (
			(source === null || source === undefined) &&
			(snapshot === null || snapshot === undefined) &&
			(derivation === null || derivation === undefined)
		);
	}
	if (!source?.path || !snapshot?.path || !derivation) return false;

	const chainWorkDir = path.join(workRoot, 'codex-chains');
	const snapshotPath = path.resolve(rootDir, snapshot.path);
	if (
		snapshotPath !== path.join(chainWorkDir, 'existing-chain-context.json') ||
		!exactJsonFileMatches(snapshot, snapshotPath)
	) {
		return false;
	}

	let generation = null;
	if (currentPath) {
		const resolvedCurrentPath = path.resolve(rootDir, currentPath);
		if (
			source.path !== relative(resolvedCurrentPath) ||
			!exactJsonFileMatches(source, resolvedCurrentPath)
		) {
			return false;
		}
	} else {
		generation = derivation.generation;
		const resolvedInputRoot = path.resolve(rootDir, currentInputRoot);
		const sourcePath = path.resolve(rootDir, source.path);
		if (
			Object.keys(generation ?? {})
				.sort()
				.join(',') !== 'generatedAt,inputRoot,schemaVersion' ||
			generation.schemaVersion !== 'existing-chain-context-input-root-v1' ||
			generation.inputRoot !== relative(resolvedInputRoot) ||
			sourcePath !== path.join(chainWorkDir, 'existing-chain-context-source.json') ||
			!exactJsonFileMatches(source, sourcePath) ||
			!generatedExistingChainContextMatches({
				source,
				sourcePath,
				inputRoot: resolvedInputRoot,
				generatedAt: generation.generatedAt
			})
		) {
			return false;
		}
	}

	return exactExistingChainContextSnapshotEvidenceMatches({
		source,
		snapshot,
		derivation,
		generation
	});
}

function generatedExistingChainContextMatches({ source, sourcePath, inputRoot, generatedAt }) {
	const preserved = readJsonIfExists(sourcePath);
	if (!preserved || preserved.generatedAt !== generatedAt) return false;
	const tempDir = mkdtempSync(path.join(workRoot, '.existing-chain-context-reuse-'));
	const rebuiltPath = path.join(tempDir, 'existing-chain-context.json');
	try {
		const result = spawnSync(
			process.execPath,
			[
				'scripts/build-existing-chain-context.mjs',
				`--input-root=${inputRoot}`,
				`--output=${rebuiltPath}`,
				`--generated-at=${generatedAt}`
			],
			{
				cwd: rootDir,
				encoding: 'utf8',
				stdio: ['ignore', 'ignore', 'ignore']
			}
		);
		return result.status === 0 && exactJsonFileMatches(source, rebuiltPath);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

function paperMatchesSource(paper) {
	return (
		paper?.sourceDocument?.id === sourceDocumentId &&
		Array.isArray(paper?.questions) &&
		paper.questions.length > 0 &&
		paper.questions.every((question) => Boolean(question?.sourceQuestionRef))
	);
}

function learnerAssetPhaseInputsMatch(inputs, paper, { requireCopies = false } = {}) {
	if (
		!learnerAssetManifestBinding ||
		!exactJsonFileMatches(inputs?.learnerAssetManifest, learnerAssetManifestPath) ||
		!learnerAssetBundleMatchesPaper(paper)
	) {
		return false;
	}
	if (!requireCopies) return inputs?.verifiedLearnerAssetCopies === undefined;
	try {
		return assertVerifiedLearnerAssetCopiesCurrent({
			manifest: learnerAssetManifestBinding.manifest,
			attestation: inputs?.verifiedLearnerAssetCopies,
			rootDir
		});
	} catch {
		return false;
	}
}

function learnerAssetBundleMatchesPaper(paper) {
	if (!learnerAssetManifestBinding) return false;
	try {
		const current = captureBoundJsonInput(learnerAssetManifestPath, {
			rootDir,
			label: 'Learner asset manifest'
		});
		assertExactJsonArtifactsEqual(
			learnerAssetManifestBinding.artifact,
			current.artifact,
			'Learner asset manifest'
		);
		return assertLearnerVisibleAssetBundleCurrent({
			paper,
			manifest: learnerAssetManifestBinding.manifest,
			rootDir
		});
	} catch {
		return false;
	}
}

function sameQuestionRefs(refs, questions) {
	return exactQuestionRefSetMatches({ checkedRefs: refs, questions });
}

function fileSha256(filePath) {
	if (!existsSync(filePath)) return null;
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function stageGeneratedPhaseSnapshot(sourcePath, snapshotPath, label) {
	const source = captureBoundJsonInput(sourcePath, { rootDir, label });
	return stageBoundJsonSnapshot(source, snapshotPath, { rootDir, label });
}

function exactJsonFileMatches(record, filePath) {
	try {
		const current = captureBoundJsonInput(filePath, { rootDir, label: 'Phase artifact' });
		return exactJsonArtifactMatches(record, current.artifact);
	} catch {
		return false;
	}
}

function phaseInputMatchesBinding(record, binding) {
	if (!binding) return false;
	try {
		assertBoundJsonInputCurrent(binding, { label: 'Generated phase snapshot' });
		return exactJsonArtifactMatches(record, binding.artifact);
	} catch {
		return false;
	}
}

function assertImportReadyStillMatchesSolvabilityInput() {
	if (!importReadySnapshotBinding) {
		throw new Error('No bound import-ready solvability input exists.');
	}
	assertBoundJsonInputCurrent(importReadySnapshotBinding, {
		label: 'Import-ready solvability input snapshot'
	});
	const finalOutput = captureBoundJsonInput(importReadyPaperPath, {
		rootDir,
		label: 'Final import-ready output'
	});
	assertExactJsonArtifactsEqual(
		importReadySnapshotBinding.artifact,
		finalOutput.artifact,
		'Final import-ready output'
	);
	if (!learnerAssetBundleMatchesPaper(finalOutput.value)) {
		throw new Error('Final import-ready output differs from its bound learner asset bundle.');
	}
}

async function bindExactPostImportContentFingerprint(importReady) {
	const importResults = Array.isArray(importReady?.importResults) ? importReady.importResults : [];
	const matchingIndexes = importResults
		.map((result, index) => ({ result, index }))
		.filter(
			({ result }) => result?.sourceDocumentId === sourceDocumentId && result?.mode === 'write'
		);
	if (matchingIndexes.length !== 1) {
		throw new Error(
			'The exact D1 write did not yield exactly one matching import result for fingerprint capture.'
		);
	}
	const postImportContentFingerprint = await fingerprintPaperSittingContent({
		sourceDocumentId,
		query: (sql, params) => d1Rows(sql, params)
	});
	const postImportContentFingerprintEvidence = {
		schemaVersion: 'production-import-post-write-content-fingerprint-v1',
		producer: 'scripts/run-codex-production-import-pipeline.mjs',
		sourceDocumentId,
		importMode: 'write',
		capturedAt: new Date().toISOString(),
		contentFingerprint: postImportContentFingerprint
	};
	const nextResults = importResults.map((result, index) =>
		index === matchingIndexes[0].index
			? { ...result, postImportContentFingerprintEvidence }
			: result
	);
	return { ...importReady, importResults: nextResults };
}

function boundPath(binding, fallbackPath) {
	return binding?.path ?? fallbackPath;
}

function forwardExpectedJsonInput(args, binding) {
	if (!binding) return;
	args.push(`--expected-input-sha256=${binding.artifact.sha256}`);
	args.push(`--expected-input-canonical-json-sha256=${binding.artifact.canonicalJsonSha256}`);
}

function stageVerifiedSourceSnapshots() {
	const records = [
		{
			label: 'question paper',
			sourcePath: questionPaperPath,
			snapshotPath: sourceSnapshotPaths.questionPaper,
			expectedSha256: cohortLockEvidence?.questionPaper?.sha256 ?? fileSha256(questionPaperPath)
		},
		{
			label: 'mark scheme',
			sourcePath: markSchemePath,
			snapshotPath: sourceSnapshotPaths.markScheme,
			expectedSha256: cohortLockEvidence?.markScheme?.sha256 ?? fileSha256(markSchemePath)
		},
		...supportingDocumentPaths.map((sourcePath, index) => ({
			label: `supporting document ${index + 1}`,
			sourcePath,
			snapshotPath: sourceSnapshotPaths.supportingDocuments[index],
			expectedSha256:
				cohortLockEvidence?.supportingDocuments?.[index]?.sha256 ?? fileSha256(sourcePath)
		}))
	];
	rmSync(sourceSnapshotRoot, { recursive: true, force: true });
	mkdirSync(sourceSnapshotRoot, { recursive: true });
	for (const record of records) {
		if (!/^[a-f0-9]{64}$/.test(String(record.expectedSha256 ?? ''))) {
			throw new Error(`Cannot stage ${record.label} without an exact SHA-256.`);
		}
		copyFileSync(record.sourcePath, record.snapshotPath);
		if (fileSha256(record.snapshotPath) !== record.expectedSha256) {
			rmSync(sourceSnapshotRoot, { recursive: true, force: true });
			throw new Error(`${record.label} changed while its verified snapshot was being staged.`);
		}
		chmodSync(record.snapshotPath, 0o444);
	}
}

function forwardLockedSourceHashes(args, { includeSupportingDocuments = true } = {}) {
	if (!cohortLockEvidence) return;
	args.push(`--expected-question-paper-sha256=${cohortLockEvidence.questionPaper.sha256}`);
	args.push(`--expected-mark-scheme-sha256=${cohortLockEvidence.markScheme.sha256}`);
	args.push(`--canonical-question-paper=${questionPaperPath}`);
	args.push(`--canonical-mark-scheme=${markSchemePath}`);
	if (includeSupportingDocuments) {
		for (const [index, document] of cohortLockEvidence.supportingDocuments.entries()) {
			args.push(`--expected-supporting-document-sha256=${document.sha256}`);
			args.push(`--canonical-supporting-document=${supportingDocumentPaths[index]}`);
			args.push(`--supporting-document-type=${document.documentType}`);
			args.push(`--supporting-document-filename=${document.filename}`);
		}
	}
}

function extractionCommand() {
	const args = [
		'scripts/run-codex-pdf-extraction.mjs',
		`--question-paper=${sourceSnapshotPaths.questionPaper}`,
		`--mark-scheme=${sourceSnapshotPaths.markScheme}`,
		`--source-document-id=${sourceDocumentId}`,
		`--output=${rawOutputPath}`,
		`--summary=${extractionSummaryPath}`,
		`--work-dir=${path.join(workRoot, 'codex-extraction')}`,
		`--model=${phaseModelPolicy.extraction.model}`,
		`--thinking-level=${phaseModelPolicy.extraction.thinkingLevel}`,
		`--timeout-ms=${stringArg('extraction-timeout-ms', stringArg('timeout-ms', '7200000'))}`
	];
	for (const supportingDocumentPath of sourceSnapshotPaths.supportingDocuments) {
		args.push(`--supporting-document=${supportingDocumentPath}`);
	}
	forwardLockedSourceHashes(args);
	forwardCommonExtractionArgs(args);
	if (hasArg('allow-unpublishable-source-drops')) args.push('--allow-unpublishable-source-drops');
	if (hasArg('reuse-existing-extraction')) args.push('--reuse-existing-extraction');
	if (replaceRejectedPhaseArtifacts) args.push('--force');
	return args;
}

function extractionJudgeCommand() {
	const args = [
		'scripts/run-codex-extraction-judge.mjs',
		`--candidate=${boundPath(extractionSnapshotBinding, rawOutputPath)}`,
		`--question-paper=${sourceSnapshotPaths.questionPaper}`,
		`--mark-scheme=${sourceSnapshotPaths.markScheme}`,
		`--source-document-id=${sourceDocumentId}`,
		`--work-dir=${path.join(workRoot, 'extraction-judge')}`,
		`--output=${extractionJudgeOutputPath}`,
		`--summary=${extractionJudgeSummaryPath}`,
		`--asset-manifest=${learnerAssetManifestPath}`,
		`--model=${phaseModelPolicy['extraction judge'].model}`,
		`--thinking-level=${phaseModelPolicy['extraction judge'].thinkingLevel}`,
		`--timeout-ms=${stringArg('judge-timeout-ms', stringArg('timeout-ms', '7200000'))}`
	];
	forwardLockedSourceHashes(args, { includeSupportingDocuments: false });
	forwardString(args, 'expected-marks');
	forwardString(args, 'expected-questions');
	if (replaceRejectedPhaseArtifacts) args.push('--force');
	return args;
}

function chainCommand() {
	const args = [
		'scripts/run-codex-answer-chains.mjs',
		`--input=${boundPath(extractionSnapshotBinding, rawOutputPath)}`,
		`--output=${reconciledOutputPath}`,
		`--summary=${chainSummaryPath}`,
		`--work-dir=${path.join(workRoot, 'codex-chains')}`,
		`--asset-manifest=${learnerAssetManifestPath}`,
		`--model=${phaseModelPolicy['answer chains'].model}`,
		`--thinking-level=${phaseModelPolicy['answer chains'].thinkingLevel}`,
		`--timeout-ms=${stringArg('chain-timeout-ms', stringArg('timeout-ms', '7200000'))}`
	];
	forwardExpectedJsonInput(args, extractionSnapshotBinding);
	forwardString(args, 'existing-chains');
	forwardString(args, 'existing-chain-input-root');
	if (hasArg('allow-shared-chain-updates')) args.push('--allow-shared-chain-updates');
	if (hasArg('run-legacy-chain-style-judge')) {
		args.push('--run-legacy-chain-style-judge');
	} else {
		args.push('--skip-chain-style-judge');
	}
	if (replaceRejectedPhaseArtifacts) args.push('--force');
	return args;
}

function uploadAssetsCommand() {
	const args = [
		'scripts/upload-r2-images.mjs',
		`--referenced-baseline=${boundPath(importReadySnapshotBinding, importReadyPaperPath)}`,
		`--asset-manifest=${learnerAssetManifestPath}`,
		`--source-document-id=${sourceDocumentId}`,
		`--expected-asset-manifest-sha256=${learnerAssetManifestBinding?.artifact.sha256 ?? ''}`,
		`--expected-asset-manifest-canonical-json-sha256=${
			learnerAssetManifestBinding?.artifact.canonicalJsonSha256 ?? ''
		}`
	];
	if (importReadySnapshotBinding) {
		args.push(`--expected-baseline-sha256=${importReadySnapshotBinding.artifact.sha256}`);
		args.push(
			`--expected-baseline-canonical-json-sha256=${importReadySnapshotBinding.artifact.canonicalJsonSha256}`
		);
	}
	return args;
}

function chainIllustrationCommand() {
	const args = [
		'scripts/generate-chain-illustrations.mjs',
		`--source-document-id=${sourceDocumentId}`,
		`--max-chains=${stringArg('chain-illustration-max-chains', '5')}`,
		`--work-root=${path.join(workRoot, 'chain-illustrations')}`,
		`--planner-model=${stringArg('chain-illustration-planner-model', 'gpt-5.6-sol')}`,
		`--planner-thinking-level=${stringArg('chain-illustration-planner-thinking-level', 'max')}`,
		`--judge-model=${stringArg('chain-illustration-judge-model', 'gpt-5.6-sol')}`,
		`--judge-thinking-level=${stringArg('chain-illustration-judge-thinking-level', 'max')}`,
		`--image-model=${stringArg('chain-illustration-image-model', 'chatgpt-gpt-image-2')}`,
		`--image-timeout-ms=${stringArg('chain-illustration-image-timeout-ms', stringArg('timeout-ms', '7200000'))}`,
		`--timeout-ms=${stringArg('chain-illustration-timeout-ms', stringArg('timeout-ms', '7200000'))}`,
		'--publish'
	];
	if (requireChainIllustrations) args.push('--require');
	args.push('--replace-work-root');
	if (hasArg('force-chain-illustrations')) args.push('--include-existing');
	return args;
}

function codexSolvabilityCommand() {
	const minScore = stringArg('min-solvability-score', stringArg('min-score', ''));
	const args = [
		'scripts/run-codex-solvability-judge.mjs',
		`--input=${boundPath(importReadySnapshotBinding, importReadyPaperPath)}`,
		`--source-document-id=${sourceDocumentId}`,
		`--work-dir=${path.join(workRoot, 'codex-solvability')}`,
		`--output=${solvabilityOutputPath}`,
		`--summary=${solvabilitySummaryPath}`,
		`--asset-manifest=${learnerAssetManifestPath}`,
		`--model=${phaseModelPolicy.solvability.model}`,
		`--thinking-level=${phaseModelPolicy.solvability.thinkingLevel}`,
		`--timeout-ms=${stringArg('solvability-timeout-ms', stringArg('timeout-ms', '7200000'))}`
	];
	forwardExpectedJsonInput(args, importReadySnapshotBinding);
	if (minScore) args.push(`--min-score=${minScore}`);
	const question = stringArg('solvability-question', '');
	if (question) args.push(`--question=${question}`);
	const maxQuestions = stringArg('solvability-max-questions', '');
	if (maxQuestions) args.push(`--max-questions=${maxQuestions}`);
	if (hasArg('solvability-target-only')) args.push('--target-only');
	if (replaceRejectedPhaseArtifacts) args.push('--force');
	return args;
}

function prepareImportReadyCommand({
	forceNoImportCheck = false,
	includeLegacySolvability = false
} = {}) {
	const args = [
		'scripts/prepare-import-ready-extraction.mjs',
		`--input=${boundPath(reconciledSnapshotBinding, reconciledOutputPath)}`,
		`--output-root=${importReadyRoot}`,
		`--audit-output=${importReadyAuditPath}`
	];
	args.push(`--asset-manifest=${learnerAssetManifestPath}`);
	forwardExpectedJsonInput(args, reconciledSnapshotBinding);
	if (!forceNoImportCheck && runCodexSolvability && importReadySnapshotBinding) {
		args.push(`--expected-output-sha256=${importReadySnapshotBinding.artifact.sha256}`);
		args.push(
			`--expected-output-canonical-json-sha256=${importReadySnapshotBinding.artifact.canonicalJsonSha256}`
		);
	}
	if (includeLegacySolvability) {
		args.push('--run-solvability');
		args.push(`--model=${phaseModelPolicy.solvability.model}`);
		args.push(`--thinking-level=${phaseModelPolicy.solvability.thinkingLevel}`);
		forwardString(args, 'min-solvability-score');
		forwardString(args, 'concurrency');
	}
	forwardString(args, 'run-id');
	if (noImportCheck || forceNoImportCheck) args.push('--no-import-check');
	if (checkExisting && !forceNoImportCheck) args.push('--check-existing');
	if (hasArg('allow-shared-chain-updates')) args.push('--allow-shared-chain-updates');
	if (hasArg('allow-dropped-questions')) args.push('--allow-dropped-questions');
	if (importToD1 && !forceNoImportCheck) args.push('--import');
	return args;
}

function inspectSourceIdentity() {
	const expectedSeries = stringArg('series', '');
	const expectedComponent = stringArg('component-code', '');
	const questionPaper = inspectPdfSource(questionPaperPath);
	const markScheme = inspectPdfSource(markSchemePath);
	const issues = [];
	const expectedSeriesKey = normalizeSeries(expectedSeries);
	const visibleSeries = firstNonEmpty([questionPaper.series, markScheme.series]);
	const visibleSeriesKey = normalizeSeries(visibleSeries);
	if (expectedSeriesKey && visibleSeriesKey && expectedSeriesKey !== visibleSeriesKey) {
		issues.push({
			code: 'visible_series_mismatch',
			severity: 'error',
			expected: expectedSeries,
			visible: visibleSeries,
			evidence: {
				questionPaper: questionPaper.seriesEvidence,
				markScheme: markScheme.seriesEvidence
			}
		});
	}
	if (
		normalizeSeries(questionPaper.series) &&
		normalizeSeries(markScheme.series) &&
		normalizeSeries(questionPaper.series) !== normalizeSeries(markScheme.series)
	) {
		issues.push({
			code: 'question_paper_mark_scheme_series_mismatch',
			severity: 'error',
			questionPaper: questionPaper.series,
			markScheme: markScheme.series,
			evidence: {
				questionPaper: questionPaper.seriesEvidence,
				markScheme: markScheme.seriesEvidence
			}
		});
	}
	const expectedComponentKey = normalizeComponentCode(expectedComponent);
	const visibleComponent = firstNonEmpty([questionPaper.component, markScheme.component]);
	const expectedToVisibleComponentCompatibility = componentCodeCompatibility(
		expectedComponent,
		visibleComponent
	);
	const questionPaperToMarkSchemeComponentCompatibility = componentCodeCompatibility(
		questionPaper.component,
		markScheme.component
	);
	if (
		expectedComponentKey &&
		normalizeComponentCode(visibleComponent) &&
		!expectedToVisibleComponentCompatibility.compatible
	) {
		issues.push({
			code: 'visible_component_mismatch',
			severity: 'error',
			expected: expectedComponent,
			visible: visibleComponent,
			evidence: {
				questionPaper: questionPaper.componentEvidence,
				markScheme: markScheme.componentEvidence
			}
		});
	}
	if (
		normalizeComponentCode(questionPaper.component) &&
		normalizeComponentCode(markScheme.component) &&
		!questionPaperToMarkSchemeComponentCompatibility.compatible
	) {
		issues.push({
			code: 'question_paper_mark_scheme_component_mismatch',
			severity: 'error',
			questionPaper: questionPaper.component,
			markScheme: markScheme.component,
			evidence: {
				questionPaper: questionPaper.componentEvidence,
				markScheme: markScheme.componentEvidence
			}
		});
	}
	return {
		status: issues.some((issue) => issue.severity === 'error') ? 'failed' : 'passed',
		expected: {
			series: expectedSeries || null,
			componentCode: expectedComponent || null
		},
		visible: {
			series: visibleSeries || null,
			componentCode: visibleComponent || null
		},
		componentCompatibility: {
			expectedToVisible: expectedToVisibleComponentCompatibility,
			questionPaperToMarkScheme: questionPaperToMarkSchemeComponentCompatibility
		},
		questionPaper,
		markScheme,
		issues
	};
}

function enforceSourceIdentity(check) {
	if (hasArg('allow-visible-source-mismatch')) return;
	const errors = check.issues.filter((issue) => issue.severity === 'error');
	if (errors.length === 0) return;
	throw new Error(
		`Visible PDF source identity preflight failed: ${errors
			.map(
				(issue) =>
					`${issue.code} expected=${issue.expected ?? 'n/a'} visible=${issue.visible ?? 'n/a'}`
			)
			.join('; ')}. Pass --allow-visible-source-mismatch only for an audited exception.`
	);
}

function inspectPdfSource(filePath) {
	const firstPagesText = pdfTextFirstPages(filePath, 2);
	const seriesMatch = findSeries(firstPagesText);
	const componentMatch = findVisibleComponent(firstPagesText, { sha256: fileSha256(filePath) });
	return {
		path: relative(filePath),
		series: seriesMatch?.series ?? null,
		seriesEvidence: seriesMatch?.evidence ?? null,
		component: componentMatch?.component ?? null,
		componentEvidence: componentMatch?.evidence ?? null,
		componentEvidenceRule: componentMatch?.rule ?? null
	};
}

function pdfTextFirstPages(filePath, pages) {
	const result = spawnSync('pdftotext', ['-f', '1', '-l', String(pages), filePath, '-'], {
		cwd: rootDir,
		encoding: 'utf8',
		maxBuffer: 4 * 1024 * 1024
	});
	if (result.status !== 0) return '';
	return result.stdout;
}

function findSeries(text) {
	const longMatch = text.match(/\b(January|June|November)\s+(20\d{2})\b/i);
	if (longMatch) {
		return {
			series: `${titleCase(longMatch[1])} ${longMatch[2]}`,
			evidence: trimEvidence(longMatch[0])
		};
	}
	const compactMatch = text.match(/\b(Jan|Jun|Nov)(\d{2})\b/i);
	if (compactMatch) {
		const month = { jan: 'January', jun: 'June', nov: 'November' }[compactMatch[1].toLowerCase()];
		return {
			series: `${month} 20${compactMatch[2]}`,
			evidence: trimEvidence(compactMatch[0])
		};
	}
	return null;
}

function normalizeSeries(value) {
	const match = String(value ?? '').match(
		/\b(january|jan|june|jun|november|nov)\s*(20)?(\d{2})\b/i
	);
	if (!match) return '';
	const monthMap = {
		jan: 'january',
		january: 'january',
		jun: 'june',
		june: 'june',
		nov: 'november',
		november: 'november'
	};
	return `${monthMap[match[1].toLowerCase()]}-20${match[3]}`;
}

function firstNonEmpty(values) {
	return values.find((value) => String(value ?? '').trim()) ?? '';
}

function titleCase(value) {
	const lower = String(value ?? '').toLowerCase();
	return lower ? `${lower[0].toUpperCase()}${lower.slice(1)}` : '';
}

function trimEvidence(value) {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 120);
}

function forwardCommonExtractionArgs(args) {
	forwardString(args, 'reviewed-repair-evidence');
	forwardString(args, 'reviewed-asset-repair-evidence');
	for (const name of [
		'mark-scheme-document-id',
		'board',
		'qualification',
		'subject',
		'subject-area',
		'tier',
		'paper-label',
		'component-code',
		'series',
		'year',
		'question-paper-title',
		'mark-scheme-title',
		'question-paper-url',
		'mark-scheme-url',
		'expected-marks',
		'expected-questions'
	]) {
		forwardString(args, name);
	}
}

function runInherited(args, label) {
	const result = spawnSync(process.execPath, args, {
		cwd: rootDir,
		stdio: 'inherit'
	});
	if (result.status !== 0) {
		throw new Error(`${label} failed with exit code ${result.status ?? result.signal}.`);
	}
	return { label, status: 'passed' };
}

function runOptionalInherited(args, label, { required = false } = {}) {
	try {
		return runInherited(args, label);
	} catch (error) {
		if (required) throw error;
		return {
			label,
			status: 'failed-optional',
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

function runJson(args, label) {
	const result = spawnSync(process.execPath, args, {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
		maxBuffer: 64 * 1024 * 1024
	});
	if (result.status !== 0) {
		throw new Error(`${label} failed with exit code ${result.status ?? result.signal}.`);
	}
	return JSON.parse(result.stdout);
}

function readJsonIfExists(filePath) {
	if (!existsSync(filePath)) return null;
	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch {
		return null;
	}
}

function forwardString(args, name) {
	const value = stringArg(name, '');
	if (value) args.push(`--${name}=${value}`);
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

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}
