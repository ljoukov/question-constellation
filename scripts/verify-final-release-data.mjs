#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- This release CLI validates external JSON and D1 rows at runtime.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { d1Rows, loadD1Env } from './lib/d1-rest.mjs';
import { loadChainIllustrationCandidates } from './lib/chain-illustration-candidates.mjs';
import {
	STUDY_CARD_IMPORT_OWNER,
	hashStudyCardArtifact,
	stableStringify,
	validateStudyCardBundle
} from './lib/study-card-artifact.mjs';
import { assertStudyCardCurriculumScope } from './lib/study-card-import.mjs';
import { validateStudyCardModelLineage } from './lib/study-card-model-lineage.mjs';
import { buildCanonicalPaperFingerprints } from './lib/paper-cohort-fingerprint.mjs';
import {
	auditExtractionInputEvidence,
	extractionInputsFromSources
} from './lib/extraction-input-evidence.mjs';
import {
	exactOcrEnglishCopyrightSubsetDrops,
	OCR_ENGLISH_JUNE_2024_COPYRIGHT_DROPPED_MARK_TOTAL,
	OCR_ENGLISH_JUNE_2024_COPYRIGHT_DROPPED_QUESTION_COUNT,
	OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_SOURCE_IDS
} from './lib/ocr-english-copyright-subsets.mjs';
import { auditOcrEnglishJune2024OriginalInventory } from './lib/ocr-j351-june-2024-inventory.mjs';
import { estimateOfficialGradeableMarks } from '../src/lib/experiments/questions/paperSittingGradeabilityPolicy.js';
import { isUnsupportedPaperSittingResponseKind } from '../src/lib/experiments/questions/paperSittingResponsePolicy.js';
import { fingerprintPaperSittingContent } from '../src/lib/server/paperSittingContentFingerprint.js';
import { validReviewedSourceClosurePhase } from './lib/reviewed-source-closure-phase.mjs';

const DETERMINISTIC_RESPONSE_KINDS = new Set([
	'choice',
	'choice-table',
	'matching',
	'equation-blanks',
	'number-line',
	'image-label-zones'
]);
const COPYRIGHT_SUBSET_SOURCE_IDS = new Set(OCR_ENGLISH_JUNE_2024_COPYRIGHT_SUBSET_SOURCE_IDS);
const RECONSTRUCTED_BASELINE_LINEAGE_RELEASE_IDS = new Set([
	'aqa-computer-science-2027-standard-v1',
	'aqa-geography-8035-standard-v1',
	'ocr-english-language-j351-standard-v1-rollout-recovered-v1',
	'ocr-j352-literature-standard-v1'
]);

export const EXPECTED = Object.freeze({
	baselineReleases: 24,
	baselineCards: 488,
	standardReleases: 26,
	standardCards: 438,
	standardPromptVersion: 'standard-study-card-descendant-coverage-v2',
	archivedRecoveryPromptVersion: 'standard-study-card-descendant-coverage-v1',
	literatureReleases: 13,
	literatureCards: 171,
	totalReleases: 63,
	totalCards: 1097,
	offerings: 17,
	canonicalDescendantTargets: 789,
	offeringComponentPairs: 1401,
	effectiveDeckScopes: 152,
	papers: 20
});

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	await main();
}

async function main() {
	const rootDir = process.cwd();
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(usage());
		return;
	}
	if (args.verifyR2 && !args.remote) fail('--verify-r2 requires --remote.');

	const report = await buildFinalReleaseDataReport({
		rootDir,
		remote: args.remote,
		verifyR2: args.verifyR2,
		verifyLocalSources: args.verifyLocalSourceInputs,
		requireLegacyCleanup: args.requireLegacyCleanup,
		r2Concurrency: args.r2Concurrency
	});
	if (args.output) {
		const outputPath = path.resolve(rootDir, args.output);
		mkdirSync(path.dirname(outputPath), { recursive: true });
		writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	}
	console.log(JSON.stringify(report, null, 2));
	if (report.status === 'incomplete') process.exitCode = 1;
}

export async function buildFinalReleaseDataReport({
	rootDir: releaseRoot,
	remote = false,
	verifyR2 = false,
	verifyLocalSources = false,
	requireLegacyCleanup = false,
	r2Concurrency = 4
}) {
	const issues = [];
	const local = verifyLocalReleaseSet(releaseRoot, issues, { verifyLocalSources });
	let questionD1 = null;
	let personalD1 = null;
	let r2 = null;
	if (remote) {
		questionD1 = await verifyQuestionD1(releaseRoot, local, {
			issues,
			requireLegacyCleanup
		});
		personalD1 = await verifyPersonalMigrations(releaseRoot, issues);
		if (verifyR2) {
			r2 = await verifyReleaseR2(questionD1.r2Objects, {
				rootDir: releaseRoot,
				concurrency: r2Concurrency,
				issues
			});
		}
	}
	const releaseModeComplete = remote && verifyR2 && verifyLocalSources && requireLegacyCleanup;
	return {
		schemaVersion: 'final-release-data-gate-v1',
		status:
			issues.length > 0 ? 'incomplete' : releaseModeComplete ? 'passed' : 'local-preflight-passed',
		verifiedAt: new Date().toISOString(),
		mode: {
			remoteD1: remote,
			remoteR2ByteVerification: verifyR2,
			localSourceByteVerification: verifyLocalSources,
			requireLegacyCleanup
		},
		expected: EXPECTED,
		local: local.report,
		questionD1: questionD1?.report ?? null,
		personalD1: personalD1?.report ?? null,
		r2,
		issues
	};
}

function verifyLocalReleaseSet(releaseRoot, issues, { verifyLocalSources = false } = {}) {
	const initialIssueCount = issues.length;
	const files = {
		baseline: 'data/study-cards/final-release-baseline.json',
		catalog: 'data/curricula/curriculum-catalog.json',
		executionQueue:
			'docs/release-evidence/study-card-descendant-coverage/tier-safe-execution-queue.json',
		literatureManifest:
			'data/study-cards/english-literature/ocr-j352-deepening-shard-manifest.json',
		literatureSourcePreflight:
			'docs/release-evidence/english-literature-deepening/source-preflight.json',
		preparedLock: 'docs/release-evidence/study-card-prepared-completion/prepared-run-lock.json',
		preparedState: 'docs/release-evidence/study-card-prepared-completion/queue-state.json',
		paperCohort: 'docs/release-evidence/selective-paper-cohort.json',
		illustrationManifest: 'docs/release-evidence/chain-illustration-release-manifest.json',
		paperCohortLock: 'data/release/selective-paper-cohort-lock.json'
	};
	const baseline = readJsonOr(files.baseline, releaseRoot, issues, {});
	const catalog = readJsonOr(files.catalog, releaseRoot, issues, {});
	const executionQueue = readJsonOr(files.executionQueue, releaseRoot, issues, {});
	const literatureManifest = readJsonOr(files.literatureManifest, releaseRoot, issues, {});
	const sourcePreflight = readJsonOr(files.literatureSourcePreflight, releaseRoot, issues, {});
	const lock = readJsonOr(files.preparedLock, releaseRoot, issues, {});
	const paperCohort = readJsonOr(files.paperCohort, releaseRoot, issues, {});
	const illustrationManifest = readJsonOr(files.illustrationManifest, releaseRoot, issues, {});
	const paperCohortLock = readJsonOr(files.paperCohortLock, releaseRoot, issues, {});
	const state = existsSync(path.join(releaseRoot, files.preparedState))
		? readJsonOr(files.preparedState, releaseRoot, issues, {})
		: null;

	if (
		baseline.schemaVersion !== 'final-study-card-baseline-v1' ||
		baseline.status !== 'locked' ||
		baseline.releases?.length !== EXPECTED.baselineReleases ||
		baseline.releases?.reduce((sum, row) => sum + Number(row.cards ?? 0), 0) !==
			EXPECTED.baselineCards
	) {
		issues.push('The immutable 24-release/488-card baseline lock drifted.');
	}
	const standardPhysicalBatches = executionQueue.physicalBatches ?? [];
	const standardGenerationBatches = standardPhysicalBatches.filter(
		(row) => row.executionKind === 'standard-generation-review'
	);
	const archivedFreshReviewBatches = standardPhysicalBatches.filter(
		(row) => row.executionKind === 'archived-output-fresh-review-only'
	);
	const standardTargetIds = standardPhysicalBatches.flatMap((row) => row.componentIds ?? []);
	if (
		executionQueue.schemaVersion !== 'study-card-tier-safe-execution-queue-v1' ||
		executionQueue.status !== 'ready-but-not-started' ||
		standardPhysicalBatches.length !== EXPECTED.standardReleases ||
		standardGenerationBatches.length !== 24 ||
		archivedFreshReviewBatches.length !== 2 ||
		executionQueue.lineage?.standardGenerationPromptVersion !== EXPECTED.standardPromptVersion ||
		standardGenerationBatches.some(
			(row) => row.dryPlan?.promptVersion !== EXPECTED.standardPromptVersion
		) ||
		standardPhysicalBatches.reduce((sum, row) => sum + Number(row.componentCount ?? 0), 0) !==
			EXPECTED.standardCards ||
		standardTargetIds.length !== EXPECTED.standardCards ||
		new Set(standardTargetIds).size !== EXPECTED.standardCards ||
		standardPhysicalBatches.some(
			(row) => row.componentCount !== row.componentIds?.length || row.componentCount > 20
		)
	) {
		issues.push('The hash-locked 26-release/438-card standard completion queue drifted.');
	}
	if (
		literatureManifest.schemaVersion !== 'ocr-j352-literature-deepening-shards-v1' ||
		literatureManifest.shards?.length !== EXPECTED.literatureReleases ||
		literatureManifest.totalCards !== EXPECTED.literatureCards ||
		stableStringify(literatureManifest.counts) !==
			stableStringify({ method: 3, plot: 96, quotation: 72 }) ||
		sourcePreflight.status !== 'passed' ||
		sourcePreflight.counts?.evidence !== EXPECTED.literatureCards
	) {
		issues.push('The 13-release/171-card Literature source and shard contract drifted.');
	}
	verifyPreparedLock(lock, releaseRoot, issues);
	verifyLocalPaperCohortEvidence(paperCohort, paperCohortLock, releaseRoot, issues, {
		verifyLocalSources
	});
	verifyLocalIllustrationManifest(illustrationManifest, releaseRoot, issues);
	if (!state) {
		issues.push(`Completion state is absent: ${files.preparedState}.`);
	} else {
		if (
			state.schemaVersion !== 'prepared-study-card-completion-state-v1' ||
			state.status !== 'complete' ||
			state.lockFingerprint !== lock.lockFingerprint ||
			state.standard?.jobs?.length !== EXPECTED.standardReleases ||
			state.literature?.jobs?.length !== EXPECTED.literatureReleases ||
			state.standard.jobs.some((job) => job.status !== 'accepted') ||
			state.literature.jobs.some((job) => job.status !== 'accepted')
		) {
			issues.push('Prepared completion state is not a complete hash-locked 26 + 13 run.');
		}
	}

	const expectedReleases = [];
	for (const row of baseline.releases ?? []) {
		expectedReleases.push({ ...row, cohort: 'baseline', expectedHash: row.artifactHash });
	}
	const standardState = new Map((state?.standard?.jobs ?? []).map((row) => [row.id, row]));
	for (const row of executionQueue.physicalBatches ?? []) {
		expectedReleases.push({
			releaseId: row.physicalBatchId,
			cards: row.componentCount,
			cohort: 'standard-completion',
			expectedPromptVersion:
				row.executionKind === 'standard-generation-review'
					? EXPECTED.standardPromptVersion
					: EXPECTED.archivedRecoveryPromptVersion,
			expectedHash: standardState.get(row.physicalBatchId)?.artifactHash ?? null
		});
	}
	const literatureState = new Map((state?.literature?.jobs ?? []).map((row) => [row.id, row]));
	for (const row of literatureManifest.shards ?? []) {
		expectedReleases.push({
			releaseId: row.releaseId,
			cards: row.expectedCardCount,
			cohort: 'english-literature-deepening',
			expectedHash: literatureState.get(row.releaseId)?.artifactHash ?? null,
			sourcePlanPath: row.sourcePlanPath
		});
	}
	if (
		expectedReleases.length !== EXPECTED.totalReleases ||
		new Set(expectedReleases.map((row) => row.releaseId)).size !== EXPECTED.totalReleases
	) {
		issues.push('Expected release identities are not 63 unique rows.');
	}

	const releasesDir = path.join(releaseRoot, 'data/study-cards/releases');
	const discovered = existsSync(releasesDir)
		? readdirSync(releasesDir, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.filter((entry) =>
					existsSync(path.join(releasesDir, entry.name, 'accepted-study-cards.json'))
				)
				.map((entry) => entry.name)
				.sort()
		: [];
	const expectedIds = new Set(expectedReleases.map((row) => row.releaseId));
	const unexpectedAccepted = discovered.filter((id) => !expectedIds.has(id));
	const missingAccepted = [...expectedIds].filter((id) => !discovered.includes(id)).sort();
	if (unexpectedAccepted.length) {
		issues.push(
			`Unexpected accepted artifact(s), including candidate/quarantine leakage: ${unexpectedAccepted.join(', ')}.`
		);
	}
	if (missingAccepted.length) {
		issues.push(`Missing ${missingAccepted.length} expected accepted artifact(s).`);
	}

	const bundles = [];
	const releases = [];
	const completionLineages = [];
	for (const expected of expectedReleases) {
		const artifactPath = path.join(releasesDir, expected.releaseId, 'accepted-study-cards.json');
		if (!existsSync(artifactPath)) continue;
		try {
			const bundle = validateStudyCardBundle(JSON.parse(readFileSync(artifactPath, 'utf8')));
			assertStudyCardCurriculumScope(bundle, catalog);
			const artifactHash = hashStudyCardArtifact(bundle);
			const canonicalPath = relative(releaseRoot, artifactPath);
			if (
				bundle.release.id !== expected.releaseId ||
				(expected.expectedPromptVersion &&
					bundle.release.promptVersion !== expected.expectedPromptVersion) ||
				bundle.release.artifactPath !== canonicalPath ||
				bundle.cards.length !== expected.cards ||
				!expected.expectedHash ||
				artifactHash !== expected.expectedHash
			) {
				issues.push(`${expected.releaseId} differs from its accepted identity/count/hash lock.`);
			}
			let lineage = null;
			if (
				expected.cohort !== 'baseline' ||
				RECONSTRUCTED_BASELINE_LINEAGE_RELEASE_IDS.has(expected.releaseId)
			) {
				lineage = validateStudyCardModelLineage({
					releaseDir: path.dirname(artifactPath),
					rootDir: releaseRoot
				});
				completionLineages.push(lineage);
			}
			bundles.push(bundle);
			releases.push({
				releaseId: expected.releaseId,
				cohort: expected.cohort,
				artifactHash,
				cards: bundle.cards.length,
				coverage: bundle.coverage.length,
				...(lineage
					? {
							lineageManifestPath: lineage.manifestPath,
							lineageManifestSha256: lineage.manifestSha256
						}
					: {})
			});
		} catch (error) {
			issues.push(`${expected.releaseId} is not a valid accepted artifact: ${message(error)}`);
		}
	}
	const generatorRunIds = new Set(completionLineages.flatMap((lineage) => lineage.generatorRunIds));
	const reviewerRunIds = new Set(completionLineages.flatMap((lineage) => lineage.reviewerRunIds));
	const crossRoleRunIds = [...generatorRunIds].filter((runId) => reviewerRunIds.has(runId));
	if (crossRoleRunIds.length) {
		issues.push(
			`${crossRoleRunIds.length} prepared completion run id(s) are reused across generator/reviewer roles.`
		);
	}
	verifyPartialAcceptedEvidence(baseline, bundles, releaseRoot, issues);
	verifyLiteratureDeepening(literatureManifest, sourcePreflight, bundles, releaseRoot, issues);

	const cards = bundles.flatMap((bundle) =>
		bundle.cards.map((card) => ({ ...card, releaseId: bundle.release.id }))
	);
	const duplicateCardIds = duplicates(cards.map((card) => card.id));
	const duplicateConcepts = duplicates(
		cards.map((card) => `${card.board}:${card.subject}:${card.conceptKey}`)
	);
	if (cards.length !== EXPECTED.totalCards) {
		issues.push(`Accepted artifact union contains ${cards.length}, not 1,097 cards.`);
	}
	if (duplicateCardIds.length) issues.push(`${duplicateCardIds.length} duplicate card id(s).`);
	if (duplicateConcepts.length)
		issues.push(`${duplicateConcepts.length} duplicate board/subject/concept identity(ies).`);
	const baselineTargetIds = new Set(
		bundles
			.filter((bundle) =>
				(baseline.releases ?? []).some((row) => row.releaseId === bundle.release.id)
			)
			.flatMap((bundle) =>
				bundle.cards.flatMap((card) => card.targets.map((target) => target.curriculumComponentId))
			)
	);
	const acceptedTargetOverlap = standardTargetIds.filter((id) => baselineTargetIds.has(id));
	if (acceptedTargetOverlap.length) {
		issues.push(
			`Standard completion queue overlaps ${acceptedTargetOverlap.length} accepted baseline target(s).`
		);
	}
	const curriculum = verifyCurriculumCoverage(catalog, bundles, issues);

	return {
		report: {
			status: issues.length === initialIssueCount ? 'passed' : 'incomplete',
			baseline: files.baseline,
			preparedState: files.preparedState,
			counts: {
				expectedReleases: expectedReleases.length,
				discoveredAcceptedArtifacts: discovered.length,
				validatedReleases: bundles.length,
				cards: cards.length,
				choices: cards.reduce((sum, card) => sum + card.choices.length, 0),
				offeringsRepresented: curriculum.actualOfferings,
				canonicalDescendantTargets: curriculum.expectedCanonicalTargets,
				expectedOfferingComponentPairs: curriculum.expectedOfferingComponentPairs,
				coveredOfferingComponentPairs: curriculum.coveredOfferingComponentPairs,
				effectiveDeckScopes: curriculum.effectiveDeckScopes
			},
			missingAccepted,
			unexpectedAccepted,
			releases
		},
		expectedReleases,
		bundles,
		cards,
		catalog,
		paperCohort,
		paperCohortLock,
		illustrationManifest
	};
}

function verifyPreparedLock(lock, releaseRoot, issues) {
	const { lockFingerprint } = lock;
	const lockInputs = { ...lock };
	delete lockInputs.schemaVersion;
	delete lockInputs.lockFingerprint;
	if (
		lock.schemaVersion !== 'prepared-study-card-completion-lock-v1' ||
		!hexSha256(lockFingerprint) ||
		lockFingerprint !== sha256(stableStringify(lockInputs)) ||
		lock.counts?.standardPhysicalBatches !== EXPECTED.standardReleases ||
		lock.counts?.standardGenerationBatches !== 24 ||
		lock.counts?.archivedFreshReviewPhysicalBatches !== 2 ||
		lock.counts?.atomicStandardExecutionUnits !== 25 ||
		lock.counts?.standardTargets !== EXPECTED.standardCards ||
		lock.counts?.literatureShards !== EXPECTED.literatureReleases ||
		lock.counts?.literatureCards !== EXPECTED.literatureCards ||
		lock.maxModelConcurrency !== 2 ||
		stableStringify(lock.stageOrder) !==
			stableStringify(['standard-study-cards', 'english-literature'])
	) {
		issues.push('Prepared completion lock metadata drifted.');
	}
	for (const key of [
		'executionQueue',
		'literatureQueue',
		'coverageLedger',
		'literatureSourcePreflight'
	]) {
		const entry = lock[key];
		const filePath = entry?.path ? path.join(releaseRoot, entry.path) : null;
		if (!filePath || !existsSync(filePath) || sha256(readFileSync(filePath)) !== entry.sha256) {
			issues.push(`Prepared lock input ${key} no longer matches its SHA-256.`);
		}
	}
}

function verifyLocalPaperCohortEvidence(
	cohort,
	cohortLock,
	releaseRoot,
	issues,
	{ verifyLocalSources = false } = {}
) {
	const papers = Array.isArray(cohort.papers) ? cohort.papers : [];
	const lockedPapers = Array.isArray(cohortLock.papers) ? cohortLock.papers : [];
	const lockedSupportingDocumentsBySourceId = cohortLock?.supportingDocumentsBySourceId ?? {};
	const ids = papers.map((paper) => paper.sourceDocumentId);
	const approved = papers.filter((paper) => paper.approvalDisposition?.status === 'approved');
	const withheld = papers.filter(
		(paper) => paper.approvalDisposition?.status === 'withheld_ineligible'
	);
	const copyrightSubsetPapers = papers.filter(
		(paper) =>
			paper.publishableSubsetDisposition?.required === true &&
			paper.publishableSubsetDisposition?.status === 'passed'
	);
	const copyrightQuestionsDropped = papers.reduce(
		(sum, paper) =>
			sum + Number(paper.phases?.extraction?.publishableSubset?.dropped?.questionCount ?? 0),
		0
	);
	const copyrightMarksDropped = papers.reduce(
		(sum, paper) =>
			sum + Number(paper.phases?.extraction?.publishableSubset?.dropped?.markTotal ?? 0),
		0
	);
	const cohortLockPath = path.join(releaseRoot, 'data/release/selective-paper-cohort-lock.json');
	const databaseVerificationPath = cohort.databaseVerification?.path
		? path.join(releaseRoot, cohort.databaseVerification.path)
		: null;
	if (
		cohortLock.schemaVersion !== 'selective-paper-cohort-lock-v1' ||
		cohortLock.cohortId !== 'current-model-representative-20-july-2026' ||
		lockedPapers.length !== EXPECTED.papers ||
		new Set(lockedPapers.map((paper) => paper.sourceDocumentId)).size !== EXPECTED.papers ||
		!lockedSupportingDocumentsBySourceId ||
		typeof lockedSupportingDocumentsBySourceId !== 'object' ||
		Array.isArray(lockedSupportingDocumentsBySourceId) ||
		Object.keys(lockedSupportingDocumentsBySourceId).length !== lockedPapers.length ||
		Object.entries(lockedSupportingDocumentsBySourceId).some(
			([sourceDocumentId, documents]) =>
				!lockedPapers.some((paper) => paper.sourceDocumentId === sourceDocumentId) ||
				!Array.isArray(documents)
		) ||
		!existsSync(cohortLockPath) ||
		sha256(readFileSync(cohortLockPath)) !== cohort.scope?.cohortLockSha256
	) {
		issues.push('The tracked selective-paper cohort lock is missing, invalid or not hash-bound.');
	}
	if (
		cohort.databaseVerification?.schemaVersion !== 'selective-paper-cohort-d1-verification-v3' ||
		cohort.databaseVerification?.status !== 'passed' ||
		!databaseVerificationPath ||
		!existsSync(databaseVerificationPath) ||
		!hexSha256(cohort.databaseVerification?.sha256) ||
		(databaseVerificationPath && existsSync(databaseVerificationPath)
			? sha256(readFileSync(databaseVerificationPath)) !== cohort.databaseVerification.sha256
			: true)
	) {
		issues.push('The exact selective-paper D1 verification artifact is missing or drifted.');
	}
	if (
		cohort.schemaVersion !== 'selective-paper-cohort-release-evidence-v4' ||
		cohort.status !== 'passed' ||
		cohort.cohortId !== 'current-model-representative-20-july-2026' ||
		papers.length !== EXPECTED.papers ||
		new Set(ids).size !== EXPECTED.papers ||
		cohort.scope?.cohortLockPath !== 'data/release/selective-paper-cohort-lock.json' ||
		!hexSha256(cohort.scope?.cohortLockSha256) ||
		!hexSha256(cohort.scope?.manifestSha256) ||
		!hexSha256(cohort.scope?.planSha256) ||
		Number(cohort.counts?.planned) !== EXPECTED.papers ||
		Number(cohort.counts?.passed) !== EXPECTED.papers ||
		Number(cohort.counts?.databaseMatched) !== EXPECTED.papers ||
		Number(cohort.counts?.approvedFullPapers) !== approved.length ||
		Number(cohort.counts?.withheldIneligiblePapers) !== withheld.length ||
		Number(cohort.counts?.copyrightSubsetPapers) !== COPYRIGHT_SUBSET_SOURCE_IDS.size ||
		Number(cohort.counts?.copyrightSubsetPapers) !== copyrightSubsetPapers.length ||
		Number(cohort.counts?.copyrightSourceQuestionsDropped) !== copyrightQuestionsDropped ||
		Number(cohort.counts?.copyrightSourceMarksDropped) !== copyrightMarksDropped ||
		copyrightQuestionsDropped !== OCR_ENGLISH_JUNE_2024_COPYRIGHT_DROPPED_QUESTION_COUNT ||
		copyrightMarksDropped !== OCR_ENGLISH_JUNE_2024_COPYRIGHT_DROPPED_MARK_TOTAL ||
		approved.length + withheld.length !== EXPECTED.papers
	) {
		issues.push(
			'Tracked selective-paper evidence is not an exact passed 20-paper release manifest.'
		);
	}
	for (let index = 0; index < papers.length; index += 1) {
		const paper = papers[index];
		const locked = lockedPapers[index] ?? {};
		const phases = paper.phases ?? {};
		const extractionInputDisposition = auditExtractionInputEvidence({
			rootDir: releaseRoot,
			sourceDocumentId: paper.sourceDocumentId,
			extractionPhase: phases.extraction,
			expectedInputs: extractionInputsFromSources(paper.sources),
			verifyLocalFiles: verifyLocalSources
		});
		const phaseThreadIds = Object.values(phases).map((phase) => phase?.run?.threadId);
		const exactPhases =
			['extraction', 'extractionJudge', 'answerChains', 'solvability'].every((phaseName) =>
				validPaperPhase(
					phaseName,
					phases[phaseName],
					Number(paper.import?.questions),
					Number(paper.import?.marks)
				)
			) &&
			phaseThreadIds.length === 4 &&
			new Set(phaseThreadIds).size === 4;
		const requiredAssetEvidence = Array.isArray(paper.database?.requiredAssetEvidence)
			? paper.database.requiredAssetEvidence
			: [];
		if (
			locked.position !== index + 1 ||
			paper.position !== index + 1 ||
			paper.sourceDocumentId !== locked.sourceDocumentId ||
			paper.board !== locked.board ||
			paper.subject !== locked.subject ||
			paper.component !== locked.component ||
			paper.series !== locked.series ||
			paper.finalStatus !== 'passed' ||
			paper.import?.status !== 'passed' ||
			Number(paper.import?.questions) <= 0 ||
			Number(paper.import?.marks) <= 0 ||
			paper.database?.status !== 'matched' ||
			Number(paper.database?.questions) !== Number(paper.import?.questions) ||
			Number(paper.database?.marks) !== Number(paper.import?.marks) ||
			Number(paper.database?.missingEvidence) !== 0 ||
			!localPaperDocumentMatches(
				paper.sources?.questionPaper,
				locked.questionPaperSha256,
				releaseRoot,
				{ verifyLocalSources }
			) ||
			!localPaperDocumentMatches(paper.sources?.markScheme, locked.markSchemeSha256, releaseRoot, {
				verifyLocalSources
			}) ||
			!localSupportingDocumentsMatch(
				paper.sources?.supportingDocuments,
				lockedSupportingDocumentsBySourceId[paper.sourceDocumentId] ?? [],
				releaseRoot,
				{ verifyLocalSources }
			) ||
			extractionInputDisposition.status !== 'passed' ||
			stableStringify(paper.extractionInputDisposition) !==
				stableStringify(extractionInputDisposition) ||
			!exactPhases ||
			!validPublishableSubsetEvidence(paper, releaseRoot) ||
			!hexSha256(paper.database?.canonicalRowFingerprint?.sha256) ||
			paper.database?.canonicalRowFingerprint?.schemaVersion !== 'paper-d1-row-lock-v2' ||
			requiredAssetEvidence.length !== Number(paper.database?.requiredAssets) ||
			new Set(requiredAssetEvidence.map((asset) => asset.id)).size !==
				requiredAssetEvidence.length ||
			requiredAssetEvidence.some(
				(asset) =>
					!asset.id ||
					!asset.r2Key ||
					!hexSha256(asset.sha256) ||
					!['local-file', 'remote-r2-baseline'].includes(asset.hashSource)
			)
		) {
			issues.push(
				`${paper.sourceDocumentId || 'unknown paper'} is not exact in tracked cohort evidence.`
			);
		}
	}
}

function localPaperDocumentMatches(
	document,
	expectedSha256,
	releaseRoot,
	{ verifyLocalSources = false } = {}
) {
	if (
		document?.sha256 !== expectedSha256 ||
		!hexSha256(expectedSha256) ||
		!document?.localPath ||
		!document?.filename
	) {
		return false;
	}
	const filePath = path.isAbsolute(document.localPath)
		? document.localPath
		: path.join(releaseRoot, document.localPath);
	if (
		path.basename(filePath) !== document.filename ||
		path.extname(filePath).toLowerCase() !== '.pdf'
	) {
		return false;
	}
	if (!verifyLocalSources) return true;
	return existsSync(filePath) && sha256(readFileSync(filePath)) === expectedSha256;
}

function localSupportingDocumentsMatch(
	actualValue,
	expectedValue,
	releaseRoot,
	{ verifyLocalSources = false } = {}
) {
	const actual = Array.isArray(actualValue) ? actualValue : [];
	const expected = Array.isArray(expectedValue) ? expectedValue : [];
	if (actual.length !== expected.length) return false;
	return actual.every((document, index) => {
		const locked = expected[index] ?? {};
		return (
			document?.documentType === locked.documentType &&
			document?.filename === locked.filename &&
			document?.localPath === locked.localPath &&
			localPaperDocumentMatches(document, locked.sha256, releaseRoot, { verifyLocalSources })
		);
	});
}

function validPaperPhase(phaseName, phase, questionCount, marks) {
	if (
		!['passed', 'passed_after_reviewed_source_closure'].includes(phase?.status) ||
		phase?.run?.status !== 'passed' ||
		phase?.run?.model !== 'gpt-5.6-sol' ||
		phase?.run?.thinkingLevel !== 'max' ||
		!String(phase?.run?.threadId ?? '').trim()
	) {
		return false;
	}
	const result = phase.result ?? {};
	const recoveredRollout =
		hexSha256(phase.rollout?.sha256) &&
		phase.rollout?.sessionId === phase.run.threadId &&
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
		return (
			(result.status === 'passed' || recoveredRollout) &&
			Number(
				result.questionCount ??
					result.questions ??
					Number(result.reused ?? 0) +
						Number(result.created ?? result.createdActions ?? result.uniqueCreated ?? 0)
			) === questionCount &&
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

function validPublishableSubsetEvidence(paper, releaseRoot) {
	const sourceDocumentId = paper?.sourceDocumentId;
	const required = COPYRIGHT_SUBSET_SOURCE_IDS.has(sourceDocumentId);
	const extractionPhase = paper?.phases?.extraction ?? null;
	const subset = extractionPhase?.publishableSubset ?? null;
	const compatibilityRows = Array.isArray(extractionPhase?.droppedExtractionQuestions)
		? extractionPhase.droppedExtractionQuestions
		: [];
	const disposition = paper?.publishableSubsetDisposition ?? null;
	const releaseArtifacts = disposition?.releaseArtifacts ?? null;
	const retainedInventory = Array.isArray(disposition?.retainedQuestionInventory)
		? disposition.retainedQuestionInventory
		: [];
	const importRun = disposition?.importReadyExtractionRun ?? null;
	const importDroppedRows = Array.isArray(importRun?.droppedUnpublishableSourceQuestions)
		? importRun.droppedUnpublishableSourceQuestions
		: [];
	const importDroppedRefs = Array.isArray(importRun?.droppedUnpublishableSourceQuestionRefs)
		? importRun.droppedUnpublishableSourceQuestionRefs
		: [];

	if (!required) {
		return (
			disposition?.required === false &&
			disposition?.status === 'passed' &&
			subset == null &&
			extractionPhase?.originalInventoryLock == null &&
			releaseArtifacts == null &&
			disposition?.retainedQuestionInventory == null &&
			compatibilityRows.length === 0 &&
			importRun?.publishableSubset !== true &&
			importDroppedRows.length === 0 &&
			importDroppedRefs.length === 0
		);
	}

	const droppedRows = Array.isArray(subset?.dropped?.questions) ? subset.dropped.questions : [];
	const droppedRefs = droppedRows.map((row) => row?.sourceQuestionRef);
	const droppedMarkTotal = droppedRows.reduce((sum, row) => sum + Number(row?.marks ?? 0), 0);
	const exactDropReasons = ['known_unresolved_copyright_source', 'question_needs_human_review'];
	const originalQuestions = releaseSubsetQuestions(releaseArtifacts?.original, releaseRoot);
	const retainedQuestions = releaseSubsetQuestions(releaseArtifacts?.retained, releaseRoot);
	const originalByRef = exactQuestionRefMap(originalQuestions);
	const retainedByRef = exactQuestionRefMap(retainedQuestions);
	const inventoryByRef = exactQuestionRefMap(retainedInventory);
	const originalRefs = originalByRef ? [...originalByRef.keys()] : [];
	const retainedRefs = retainedByRef ? [...retainedByRef.keys()] : [];
	const exactArtifactRoot = `docs/release-evidence/selective-paper-subsets/${sourceDocumentId}`;
	const phaseOutput = extractionPhase?.phaseArtifacts?.outputs?.extraction ?? null;
	const expectedOriginalPath = `${paper.finalWorkRoot}/codex-extraction/normalized-extraction.json`;
	const expectedRetainedPath = `${paper.finalWorkRoot}/codex-extraction/normalized-extraction.publishable.json`;
	const expectedPhaseOutputPath = `${paper.finalWorkRoot}/raw/${sourceDocumentId}.json`;
	const officialOriginalInventory = auditOcrEnglishJune2024OriginalInventory({
		sourceDocumentId,
		questions: originalQuestions
	});
	return (
		disposition?.required === true &&
		disposition?.status === 'passed' &&
		subset?.status === 'passed' &&
		subset?.policy === 'known_unresolved_copyright_source_only_v1' &&
		officialOriginalInventory.status === 'passed' &&
		stableStringify(extractionPhase?.originalInventoryLock) ===
			stableStringify(officialOriginalInventory) &&
		Number.isInteger(Number(subset.original?.questionCount)) &&
		Number.isInteger(Number(subset.original?.markTotal)) &&
		Number(subset.original.questionCount) ===
			Number(subset.retained?.questionCount) + Number(subset.dropped?.questionCount) &&
		Number(subset.original.markTotal) ===
			Number(subset.retained?.markTotal) + Number(subset.dropped?.markTotal) &&
		Number(subset.retained?.questionCount) === Number(paper.import?.questions) &&
		Number(subset.retained?.markTotal) === Number(paper.import?.marks) &&
		Number(subset.dropped?.questionCount) > 0 &&
		Number(subset.dropped?.questionCount) === droppedRows.length &&
		Number(subset.dropped?.markTotal) === droppedMarkTotal &&
		exactOcrEnglishCopyrightSubsetDrops(sourceDocumentId, droppedRows) &&
		originalByRef !== null &&
		retainedByRef !== null &&
		inventoryByRef !== null &&
		originalQuestions.length === Number(subset.original.questionCount) &&
		questionRowsMarkTotal(originalQuestions) === Number(subset.original.markTotal) &&
		retainedQuestions.length === Number(subset.retained.questionCount) &&
		questionRowsMarkTotal(retainedQuestions) === Number(subset.retained.markTotal) &&
		retainedInventory.length === Number(paper.import?.questions) &&
		questionRowsMarkTotal(retainedInventory) === Number(paper.import?.marks) &&
		new Set(droppedRefs).size === droppedRows.length &&
		droppedRows.every(
			(row) =>
				Boolean(String(row?.sourceQuestionRef ?? '').trim()) &&
				Number.isInteger(Number(row?.marks)) &&
				Number(row.marks) >= 0 &&
				row.deterministicReason === 'known_unresolved_copyright_source' &&
				Array.isArray(row.reasons) &&
				stableStringify([...row.reasons].sort()) === stableStringify(exactDropReasons) &&
				originalByRef?.get(row.sourceQuestionRef) === Number(row.marks) &&
				!retainedByRef?.has(row.sourceQuestionRef) &&
				!inventoryByRef?.has(row.sourceQuestionRef)
		) &&
		originalRefs.length === retainedRefs.length + droppedRefs.length &&
		originalRefs.every((ref) => retainedByRef?.has(ref) === true || droppedRefs.includes(ref)) &&
		retainedRefs.every(
			(ref) =>
				originalByRef?.get(ref) === retainedByRef?.get(ref) &&
				inventoryByRef?.get(ref) === retainedByRef?.get(ref)
		) &&
		[...inventoryByRef.keys()].every((ref) => retainedByRef?.has(ref) === true) &&
		subset.invariants?.questionCountConserved === true &&
		subset.invariants?.markTotalConserved === true &&
		subset.invariants?.onlyKnownUnresolvedCopyrightSource === true &&
		validSubsetArtifactRecord(subset.original?.artifact) &&
		validSubsetArtifactRecord(subset.retained?.artifact) &&
		subset.original.artifact.path === expectedOriginalPath &&
		subset.retained.artifact.path === expectedRetainedPath &&
		validSubsetArtifactRecord(releaseArtifacts?.original, releaseRoot) &&
		validSubsetArtifactRecord(releaseArtifacts?.retained, releaseRoot) &&
		releaseArtifacts.original.path === `${exactArtifactRoot}/original.json` &&
		releaseArtifacts.retained.path === `${exactArtifactRoot}/retained.json` &&
		sameArtifactDigest(releaseArtifacts.original, subset.original.artifact) &&
		sameArtifactDigest(releaseArtifacts.retained, subset.retained.artifact) &&
		extractionPhase?.phaseArtifacts?.schemaVersion === 'codex-phase-artifacts-v1' &&
		validSubsetArtifactRecord(phaseOutput) &&
		phaseOutput.path === expectedPhaseOutputPath &&
		sameArtifactDigest(phaseOutput, subset.retained.artifact) &&
		subset.original.artifact.path !== subset.retained.artifact.path &&
		stableStringify(compatibilityRows) === stableStringify(droppedRows) &&
		importRun?.publishableSubset === true &&
		importRun?.publishableSubsetSource === subset.original.artifact.path &&
		stableStringify(importDroppedRows) === stableStringify(droppedRows) &&
		stableStringify(importDroppedRefs) === stableStringify(droppedRefs)
	);
}

function validSubsetArtifactRecord(record, releaseRoot = null) {
	if (
		!String(record?.path ?? '').trim() ||
		!hexSha256(record?.sha256) ||
		!hexSha256(record?.canonicalJsonSha256)
	) {
		return false;
	}
	if (!releaseRoot) return true;
	const filePath = path.resolve(releaseRoot, record.path);
	if (!existsSync(filePath)) return false;
	const bytes = readFileSync(filePath);
	let value;
	try {
		value = JSON.parse(bytes.toString('utf8'));
	} catch {
		return false;
	}
	return (
		sha256(bytes) === record.sha256 &&
		sha256(Buffer.from(stableStringify(value))) === record.canonicalJsonSha256
	);
}

function releaseSubsetQuestions(record, releaseRoot) {
	if (!validSubsetArtifactRecord(record, releaseRoot)) return [];
	const value = JSON.parse(readFileSync(path.resolve(releaseRoot, record.path), 'utf8'));
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

function questionRowsMarkTotal(questions) {
	return questions.reduce((total, question) => total + Number(question?.marks ?? 0), 0);
}

function sameArtifactDigest(left, right) {
	return left?.sha256 === right?.sha256 && left?.canonicalJsonSha256 === right?.canonicalJsonSha256;
}

function verifyLocalIllustrationManifest(manifest, releaseRoot, issues) {
	const pairs = Array.isArray(manifest.pairs) ? manifest.pairs : [];
	const ids = pairs.map((pair) => pair.id);
	const chainIds = pairs.map((pair) => pair.answerChainId);
	const r2Keys = pairs.flatMap((pair) => [pair.dark?.r2Key, pair.light?.r2Key]);
	const summaryPath = manifest.sourceSummary?.path
		? path.join(releaseRoot, manifest.sourceSummary.path)
		: null;
	const summary =
		summaryPath && existsSync(summaryPath)
			? readJsonOr(manifest.sourceSummary.path, releaseRoot, issues, {})
			: null;
	if (
		manifest.schemaVersion !== 'chain-illustration-release-manifest-v1' ||
		manifest.status !== 'passed' ||
		!summaryPath ||
		!existsSync(summaryPath) ||
		!hexSha256(manifest.sourceSummary?.sha256) ||
		(summaryPath && existsSync(summaryPath)
			? sha256(readFileSync(summaryPath)) !== manifest.sourceSummary.sha256
			: true) ||
		Number(manifest.selection?.selected) < 1 ||
		Number(manifest.selection?.selected) > 20 ||
		Number(manifest.selection?.maxChains) > 20 ||
		Number(manifest.selection?.published) !== pairs.length ||
		Number(manifest.selection?.semanticRejected) + pairs.length !==
			Number(manifest.selection?.selected) ||
		pairs.length < 1 ||
		new Set(ids).size !== pairs.length ||
		new Set(chainIds).size !== pairs.length ||
		new Set(r2Keys).size !== pairs.length * 2
	) {
		issues.push('Tracked chain-illustration manifest is missing or not an exact one-pass release.');
	}
	if (
		!summary ||
		summary.schemaVersion !== 'chain-illustration-run-summary-v1' ||
		summary.status !== 'passed' ||
		summary.plan?.publish !== true ||
		summary.plan?.requirePairs !== true ||
		summary.plan?.plannerModel !== 'gpt-5.6-sol' ||
		summary.plan?.plannerThinkingLevel !== 'max' ||
		summary.plan?.judgeModel !== 'gpt-5.6-sol' ||
		summary.plan?.judgeThinkingLevel !== 'max' ||
		summary.plan?.imageModel !== 'chatgpt-gpt-image-2' ||
		Number(summary.plan?.maxChains) > 20 ||
		!validModelRunEvidence(summary.planner, 'gpt-5.6-sol', 'max') ||
		!exactIllustrationSummaryJobs(summary, pairs, manifest.selection)
	) {
		issues.push('Tracked illustration run does not prove its planner, judges and hard checks.');
	}
	for (const pair of pairs) {
		if (
			!pair.id ||
			!pair.answerChainId ||
			!pair.sourceQuestionId ||
			!hexSha256(pair.sourceFingerprint) ||
			!pair.dark?.r2Key ||
			!pair.dark?.publicPath ||
			!hexSha256(pair.dark?.assetSha256) ||
			!Number.isInteger(Number(pair.dark?.width)) ||
			!Number.isInteger(Number(pair.dark?.height)) ||
			Number(pair.dark?.width) <= Number(pair.dark?.height) ||
			!pair.light?.r2Key ||
			!pair.light?.publicPath ||
			!hexSha256(pair.light?.assetSha256) ||
			Number(pair.light?.width) !== Number(pair.dark?.width) ||
			Number(pair.light?.height) !== Number(pair.dark?.height) ||
			pair.light?.derivedFromAssetSha256 !== pair.dark?.assetSha256
		) {
			issues.push(`${pair.id || 'unknown illustration'} has incomplete exact pair evidence.`);
		}
	}
}

function exactIllustrationSummaryJobs(summary, pairs, selection) {
	const jobs = Array.isArray(summary?.jobs) ? summary.jobs : [];
	const selected = Array.isArray(summary?.plan?.selected) ? summary.plan.selected : [];
	const published = jobs.filter((job) => job.status === 'published');
	const rejected = jobs.filter((job) => job.status === 'rejected-by-semantic-gate');
	const publishedIds = published.map((job) => job.illustrationId);
	const selectedIds = selected.map((candidate) => candidate.id);
	const jobChainIds = jobs.map((job) => job.chainId);
	if (
		selected.length !== Number(selection?.selected) ||
		jobs.length !== selected.length ||
		new Set(selectedIds).size !== selected.length ||
		new Set(jobChainIds).size !== jobs.length ||
		stableStringify([...selectedIds].sort()) !== stableStringify([...jobChainIds].sort()) ||
		rejected.length !== Number(selection?.semanticRejected) ||
		jobs.some(
			(job) =>
				!['published', 'rejected-by-semantic-gate'].includes(job.status) ||
				(job.status === 'rejected-by-semantic-gate' && !String(job.rationale ?? '').trim())
		) ||
		published.length !== pairs.length ||
		new Set(publishedIds).size !== published.length ||
		pairs.some((pair) => !publishedIds.includes(pair.id))
	) {
		return false;
	}
	const modelThreadIds = [
		summary.planner?.threadId,
		...published.flatMap((job) => [job.judgeRuns?.dark?.threadId, job.judgeRuns?.light?.threadId])
	];
	if (
		modelThreadIds.some((threadId) => !String(threadId ?? '').trim()) ||
		new Set(modelThreadIds).size !== modelThreadIds.length
	) {
		return false;
	}
	const expectedById = new Map(pairs.map((pair) => [pair.id, pair]));
	const selectedByChain = new Map(selected.map((candidate) => [candidate.id, candidate]));
	return published.every((job) => {
		const pair = expectedById.get(job.illustrationId);
		const candidate = selectedByChain.get(job.chainId);
		return (
			pair &&
			candidate?.sourceFingerprint === job.sourceFingerprint &&
			job.chainId === pair.answerChainId &&
			job.sourceQuestionId === pair.sourceQuestionId &&
			job.sourceFingerprint === pair.sourceFingerprint &&
			job.variants?.dark?.r2Key === pair.dark.r2Key &&
			job.variants?.dark?.publicPath === pair.dark.publicPath &&
			job.variants?.dark?.assetSha256 === pair.dark.assetSha256 &&
			Number(job.variants?.dark?.width) === Number(pair.dark.width) &&
			Number(job.variants?.dark?.height) === Number(pair.dark.height) &&
			job.variants?.light?.r2Key === pair.light.r2Key &&
			job.variants?.light?.publicPath === pair.light.publicPath &&
			job.variants?.light?.assetSha256 === pair.light.assetSha256 &&
			Number(job.variants?.light?.width) === Number(pair.light.width) &&
			Number(job.variants?.light?.height) === Number(pair.light.height) &&
			job.variants?.light?.derivedFromAssetSha256 === pair.light.derivedFromAssetSha256 &&
			job.hardChecks?.dark?.status === 'passed' &&
			Number(job.hardChecks?.dark?.width) === Number(job.variants?.dark?.width) &&
			Number(job.hardChecks?.dark?.height) === Number(job.variants?.dark?.height) &&
			job.hardChecks?.light?.status === 'passed' &&
			Number(job.hardChecks?.light?.width) === Number(job.variants?.light?.width) &&
			Number(job.hardChecks?.light?.height) === Number(job.variants?.light?.height) &&
			job.judge?.dark?.pass === true &&
			job.judge?.light?.pass === true &&
			validModelRunEvidence(job.judgeRuns?.dark, 'gpt-5.6-sol', 'max') &&
			validModelRunEvidence(job.judgeRuns?.light, 'gpt-5.6-sol', 'max')
		);
	});
}

function validModelRunEvidence(run, model, thinkingLevel) {
	const startedAt = Date.parse(run?.startedAt ?? '');
	const finishedAt = Date.parse(run?.finishedAt ?? '');
	return (
		run?.status === 'passed' &&
		run?.model === model &&
		run?.thinkingLevel === thinkingLevel &&
		Boolean(String(run?.threadId ?? '').trim()) &&
		Number.isFinite(startedAt) &&
		Number.isFinite(finishedAt) &&
		finishedAt >= startedAt
	);
}

function verifyIllustrationRows(manifest, rows, currentCandidates, issues) {
	const expectedPairs = Array.isArray(manifest.pairs) ? manifest.pairs : [];
	const byId = new Map(rows.map((row) => [row.id, row]));
	const currentByChain = new Map(
		[
			...(currentCandidates?.eligible ?? []),
			...(currentCandidates?.rejected ?? []),
			...(currentCandidates?.skippedFresh ?? [])
		].map((candidate) => [candidate.id, candidate])
	);
	const publishedPrimaries = rows.filter(
		(row) =>
			row.status === 'published' &&
			Number(row.needs_human_review) === 0 &&
			Number(row.is_primary) === 1
	);
	const expectedIds = expectedPairs.map((pair) => pair.id).sort();
	const actualIds = publishedPrimaries.map((row) => row.id).sort();
	if (stableStringify(actualIds) !== stableStringify(expectedIds)) {
		issues.push('Published primary illustrations are not exactly the fresh release-manifest set.');
	}
	for (const row of publishedPrimaries) {
		const current = currentByChain.get(row.answer_chain_id);
		if (
			!current ||
			current.mechanicalGate?.status !== 'passed' ||
			current.sourceFingerprint !== row.source_fingerprint
		) {
			issues.push(`${row.id} is published against stale answer-chain evidence.`);
		}
	}
	const matched = [];
	for (const pair of expectedPairs) {
		const row = byId.get(pair.id);
		if (
			!row ||
			row.answer_chain_id !== pair.answerChainId ||
			row.source_question_id !== pair.sourceQuestionId ||
			row.source_fingerprint !== pair.sourceFingerprint ||
			row.r2_key !== pair.dark.r2Key ||
			row.public_path !== pair.dark.publicPath ||
			row.asset_sha256 !== pair.dark.assetSha256 ||
			row.light_r2_key !== pair.light.r2Key ||
			row.light_public_path !== pair.light.publicPath ||
			row.light_asset_sha256 !== pair.light.assetSha256 ||
			Number(row.width) !== Number(pair.dark.width) ||
			Number(row.height) !== Number(pair.dark.height) ||
			Number(pair.light.width) !== Number(pair.dark.width) ||
			Number(pair.light.height) !== Number(pair.dark.height) ||
			Number(row.is_primary) !== 1 ||
			row.status !== 'published' ||
			Number(row.needs_human_review) !== 0
		) {
			issues.push(`${pair.id} differs from the exact published illustration manifest.`);
			continue;
		}
		matched.push(row);
	}
	return matched;
}

function verifyPartialAcceptedEvidence(baseline, bundles, releaseRoot, issues) {
	const releaseId =
		'aqa-combined-science-trilogy-8464-physics-partial-accepted-rollout-recovered-v1';
	const lock = (baseline.releases ?? []).find((row) => row.releaseId === releaseId);
	const bundle = bundles.find((row) => row.release.id === releaseId);
	const evidencePath = lock?.acceptanceEvidencePath
		? path.join(releaseRoot, lock.acceptanceEvidencePath)
		: null;
	if (
		!lock ||
		!bundle ||
		!evidencePath ||
		!existsSync(evidencePath) ||
		sha256(readFileSync(evidencePath)) !== lock.acceptanceEvidenceHash
	) {
		issues.push('The explicitly accepted Combined Physics subset lost its exact evidence lock.');
		return;
	}
	const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
	if (
		evidence.schemaVersion !== 'combined-physics-partial-accepted-release-recovery-v1' ||
		evidence.status !== 'accepted_partial_release_materialized' ||
		evidence.artifactHash !== lock.artifactHash ||
		evidence.lineage?.independentReview !== true ||
		evidence.counts?.archivedAccepted !== 12 ||
		evidence.counts?.archivedRejectedExcluded !== 3 ||
		evidence.counts?.unreviewedRepairCandidatesExcluded !== 3 ||
		stableStringify([...evidence.acceptedCardIds].sort()) !==
			stableStringify(bundle.cards.map((card) => card.id).sort())
	) {
		issues.push('The Combined Physics subset no longer proves exact accepted-only recovery.');
	}
}

function verifyLiteratureDeepening(manifest, sourcePreflight, bundles, releaseRoot, issues) {
	const shardIds = new Set((manifest.shards ?? []).map((row) => row.releaseId));
	const deepening = bundles.filter((bundle) => shardIds.has(bundle.release.id));
	const expected = new Map();
	for (const shard of manifest.shards ?? []) {
		const sourcePlan = readJsonOr(shard.sourcePlanPath, releaseRoot, issues, {});
		if (
			!existsSync(path.join(releaseRoot, shard.sourcePlanPath)) ||
			sha256(readFileSync(path.join(releaseRoot, shard.sourcePlanPath))) !== shard.sourcePlanHash
		) {
			issues.push(`${shard.releaseId} source-plan hash drifted.`);
		}
		for (const topic of sourcePlan.topics ?? []) {
			for (const row of topic.evidence ?? []) {
				expected.set(`ocr-j352-card-${row.id}`, {
					releaseId: shard.releaseId,
					kind: row.mode,
					topicComponentId: topic.topicComponentId
				});
			}
		}
	}
	const actual = deepening.flatMap((bundle) =>
		bundle.cards.map((card) => ({ releaseId: bundle.release.id, card }))
	);
	const lockedSource = new Map(
		(sourcePreflight.sources ?? []).map((source) => [
			`${source.url}\n${source.title}`,
			source.sourceHash
		])
	);
	for (const { releaseId, card } of actual) {
		const row = expected.get(card.id);
		if (
			!row ||
			row.releaseId !== releaseId ||
			row.kind !== card.kind ||
			!card.targets.some((target) => target.topicComponentId === row.topicComponentId)
		) {
			issues.push(`${card.id} differs from its Literature source shard.`);
		}
		if (
			card.kind === 'quotation' &&
			card.sources.some((source) => source.kind !== 'primary-text')
		) {
			issues.push(`${card.id} quotation is not exclusively primary-text grounded.`);
		}
		for (const source of card.sources) {
			if (lockedSource.get(`${source.url}\n${source.title}`) !== source.sourceHash) {
				issues.push(`${card.id} source differs from the passed Literature source lock.`);
			}
		}
	}
	if (
		expected.size !== EXPECTED.literatureCards ||
		actual.length !== EXPECTED.literatureCards ||
		[...expected.keys()].some((id) => !actual.some(({ card }) => card.id === id))
	) {
		issues.push('Literature deepening does not contain the exact 171 planned card identities.');
	}
}

function verifyCurriculumCoverage(catalog, bundles, issues) {
	if (catalog.offerings?.length !== EXPECTED.offerings) {
		issues.push(`Curriculum catalog has ${catalog.offerings?.length ?? 0}, not 17 offerings.`);
	}
	const expectedPairs = new Set();
	const allowedPairs = new Set();
	let canonicalTargets = 0;
	const groups = new Map();
	for (const offering of catalog.offerings ?? []) {
		if (offering.profileSubject === 'English Literature') continue;
		const key = `${offering.specificationId}|${offering.profileSubject}`;
		groups.set(key, [...(groups.get(key) ?? []), offering]);
	}
	for (const offerings of groups.values()) {
		const specification = catalog.specifications.find(
			(row) => row.id === offerings[0].specificationId
		);
		if (!specification) continue;
		const byId = new Map(specification.components.map((row) => [row.id, row]));
		const roots = new Set(offerings.flatMap((row) => row.selectableComponentIds));
		const withinScope = (id) => ancestry(id, byId).some((row) => roots.has(row.id));
		const eligible = specification.components.filter(
			(row) => withinScope(row.id) && ['section', 'topic'].includes(row.kind)
		);
		// Older accepted releases can intentionally target a selectable chapter/root
		// as well as its section/topic descendants. Those targets are valid, but
		// they do not discharge the additive descendant-coverage requirement.
		for (const offering of offerings) {
			const offeringRoots = new Set(offering.selectableComponentIds);
			for (const component of specification.components) {
				const componentAncestry = ancestry(component.id, byId);
				const higherOnly = componentAncestry.some(
					(row) => row.tier?.length === 1 && row.tier[0] === 'Higher'
				);
				if (
					componentAncestry.some((row) => offeringRoots.has(row.id)) &&
					(!higherOnly || offering.tier === 'Higher')
				) {
					allowedPairs.add(`${offering.id}\n${component.id}`);
				}
			}
		}
		canonicalTargets += eligible.length;
		for (const component of eligible) {
			const higherOnly = ancestry(component.id, byId).some(
				(row) => row.tier?.length === 1 && row.tier[0] === 'Higher'
			);
			for (const offering of offerings.filter((row) => !higherOnly || row.tier === 'Higher')) {
				expectedPairs.add(`${offering.id}\n${component.id}`);
			}
		}
	}
	if (canonicalTargets !== EXPECTED.canonicalDescendantTargets) {
		issues.push(`Official descendant target definition is ${canonicalTargets}, not 789.`);
	}
	if (expectedPairs.size !== EXPECTED.offeringComponentPairs) {
		issues.push(
			`Official offering/component pair definition is ${expectedPairs.size}, not ${EXPECTED.offeringComponentPairs}.`
		);
	}
	const actualPairs = new Set(
		bundles.flatMap((bundle) =>
			bundle.cards.flatMap((card) =>
				card.subject === 'English Literature'
					? []
					: card.targets.map((target) => `${target.offeringId}\n${target.curriculumComponentId}`)
			)
		)
	);
	const missingPairs = [...expectedPairs].filter((key) => !actualPairs.has(key));
	const unexpectedPairs = [...actualPairs].filter((key) => !allowedPairs.has(key));
	if (missingPairs.length)
		issues.push(
			`${missingPairs.length} official offering/component study-card pair(s) are missing.`
		);
	if (unexpectedPairs.length)
		issues.push(`${unexpectedPairs.length} out-of-scope offering/component target pair(s) exist.`);

	const effectiveDeckScopes = new Set(
		bundles.flatMap((bundle) =>
			bundle.coverage.map((row) => `${row.offeringId}\n${row.topicComponentId}`)
		)
	);
	const expectedDeckScopes = new Set(
		(catalog.offerings ?? []).flatMap((offering) =>
			offering.selectableComponentIds.map((id) => `${offering.id}\n${id}`)
		)
	);
	const missingDeckScopes = [...expectedDeckScopes].filter((key) => !effectiveDeckScopes.has(key));
	const unexpectedDeckScopes = [...effectiveDeckScopes].filter(
		(key) => !expectedDeckScopes.has(key)
	);
	if (expectedDeckScopes.size !== EXPECTED.effectiveDeckScopes) {
		issues.push(
			`Selectable offering/topic deck-scope definition is ${expectedDeckScopes.size}, not ${EXPECTED.effectiveDeckScopes}.`
		);
	}
	if (effectiveDeckScopes.size !== EXPECTED.effectiveDeckScopes) {
		issues.push(
			`Accepted release union declares ${effectiveDeckScopes.size}, not ${EXPECTED.effectiveDeckScopes}, deck scopes.`
		);
	}
	if (missingDeckScopes.length)
		issues.push(
			`${missingDeckScopes.length} selectable offering/topic deck scope(s) are undeclared.`
		);
	if (unexpectedDeckScopes.length)
		issues.push(`${unexpectedDeckScopes.length} undeclared offering/topic deck scope(s) exist.`);
	const offerings = new Set(
		bundles.flatMap((bundle) =>
			bundle.cards.flatMap((card) => card.targets.map((target) => target.offeringId))
		)
	);
	if (offerings.size !== EXPECTED.offerings)
		issues.push(`Accepted cards represent ${offerings.size}, not all 17 offerings.`);
	return {
		expectedCanonicalTargets: canonicalTargets,
		expectedOfferingComponentPairs: expectedPairs.size,
		coveredOfferingComponentPairs: [...expectedPairs].filter((key) => actualPairs.has(key)).length,
		effectiveDeckScopes: effectiveDeckScopes.size,
		actualOfferings: offerings.size
	};
}

async function verifyQuestionD1(releaseRoot, local, { issues, requireLegacyCleanup }) {
	const migrationFiles = rootMigrationFiles(releaseRoot);
	const migrationRows = await d1Rows('SELECT name FROM d1_migrations ORDER BY id');
	const remoteMigrations = migrationRows.map((row) => row.name);
	if (stableStringify(remoteMigrations) !== stableStringify(migrationFiles)) {
		issues.push('QUESTION_DB migrations do not exactly match the checked-in root migration set.');
	}
	// Cloudflare's remote D1 API rejects integrity_check with SQLITE_AUTH. The
	// table-valued foreign-key check is supported, and the exact release/child
	// invariants below provide the actionable relational consistency gate.
	const foreignKeys = await d1Rows('SELECT * FROM pragma_foreign_key_check');
	if (foreignKeys.length)
		issues.push(`QUESTION_DB has ${foreignKeys.length} foreign-key violation(s).`);

	const expectedById = new Map(local.expectedReleases.map((row) => [row.releaseId, row]));
	const releaseRows = await d1Rows(
		`SELECT id, schema_version, prompt_version,
		        generator_model, generator_thinking_level, generator_run_id,
		        reviewer_model, reviewer_thinking_level, reviewer_run_id,
		        reviewer_independent_turn, source_manifest_hash,
		        artifact_hash, artifact_path, expected_card_count,
		        expected_coverage_count, release_json, started_at, finished_at,
		        status, import_owner
		   FROM study_card_releases ORDER BY id`
	);
	if (releaseRows.length !== EXPECTED.totalReleases) {
		issues.push(`QUESTION_DB contains ${releaseRows.length}, not 63 study-card releases.`);
	}
	for (const row of releaseRows) {
		const expected = expectedById.get(row.id);
		const bundle = local.bundles.find((candidate) => candidate.release.id === row.id);
		if (
			!expected ||
			!bundle ||
			row.schema_version !== bundle.schemaVersion ||
			row.prompt_version !== bundle.release.promptVersion ||
			row.generator_model !== bundle.release.generator.model ||
			row.generator_thinking_level !== bundle.release.generator.thinkingLevel ||
			row.generator_run_id !== bundle.release.generator.runId ||
			row.reviewer_model !== bundle.release.reviewer.model ||
			row.reviewer_thinking_level !== bundle.release.reviewer.thinkingLevel ||
			row.reviewer_run_id !== bundle.release.reviewer.runId ||
			Number(row.reviewer_independent_turn) !== 1 ||
			row.source_manifest_hash !== bundle.release.sourceManifestHash ||
			row.artifact_hash !== expected.expectedHash ||
			row.artifact_path !== `data/study-cards/releases/${row.id}/accepted-study-cards.json` ||
			Number(row.expected_card_count) !== expected.cards ||
			Number(row.expected_coverage_count) !== bundle.coverage.length ||
			row.release_json !== stableStringify(bundle.release) ||
			row.started_at !== bundle.release.startedAt ||
			row.finished_at !== bundle.release.finishedAt ||
			row.status !== 'imported' ||
			row.import_owner !== STUDY_CARD_IMPORT_OWNER
		) {
			issues.push(`${row.id} stored release identity/status/hash differs from the accepted union.`);
		}
	}
	for (const id of expectedById.keys()) {
		if (!releaseRows.some((row) => row.id === id)) issues.push(`${id} is absent from QUESTION_DB.`);
	}

	const cardRows = await d1Rows(
		`SELECT c.id, c.release_id, c.concept_key, c.board, c.qualification,
		        c.subject, c.kind, c.emoji, c.front, c.back,
		        c.reverse_front, c.reverse_back, c.explanation, c.memory_tip,
		        c.content_revision, c.content_hash, c.source_fingerprint,
		        c.provenance_json, c.status,
		        c.needs_human_review, c.import_owner,
		        COUNT(DISTINCT ch.id) AS choices,
		        COUNT(DISTINCT CASE WHEN ch.is_correct = 1 THEN ch.id END) AS correct_choices,
		        COUNT(DISTINCT src.id) AS sources,
		        COUNT(DISTINCT t.offering_id || char(10) || t.curriculum_component_id) AS targets
		   FROM study_cards c
		   LEFT JOIN study_card_choices ch ON ch.card_id = c.id
		   LEFT JOIN study_card_sources src ON src.card_id = c.id
		   LEFT JOIN study_card_targets t ON t.card_id = c.id
		  GROUP BY c.id ORDER BY c.id`
	);
	const localCards = new Map(local.cards.map((card) => [card.id, card]));
	if (cardRows.length !== EXPECTED.totalCards) {
		issues.push(`QUESTION_DB contains ${cardRows.length}, not 1,097 study cards.`);
	}
	for (const row of cardRows) {
		const expected = localCards.get(row.id);
		if (
			!expected ||
			row.release_id !== expected.releaseId ||
			row.concept_key !== expected.conceptKey ||
			row.board !== expected.board ||
			row.qualification !== expected.qualification ||
			row.subject !== expected.subject ||
			row.kind !== expected.kind ||
			row.emoji !== expected.visualCue ||
			row.front !== expected.front ||
			row.back !== expected.back ||
			row.reverse_front !== expected.reverseFront ||
			row.reverse_back !== expected.reverseBack ||
			row.explanation !== expected.explanation ||
			row.memory_tip !== expected.memoryTip ||
			Number(row.content_revision) !== expected.contentRevision ||
			row.content_hash !== expected.contentHash ||
			row.source_fingerprint !==
				local.bundles.find((bundle) => bundle.release.id === expected.releaseId)?.release
					.sourceManifestHash ||
			row.provenance_json !== stableStringify(expected.provenance) ||
			row.status !== 'published' ||
			Number(row.needs_human_review) !== 0 ||
			row.import_owner !== STUDY_CARD_IMPORT_OWNER ||
			Number(row.choices) !== expected.choices.length ||
			Number(row.correct_choices) !== 1 ||
			Number(row.sources) !== expected.sources.length ||
			Number(row.targets) !== expected.targets.length
		) {
			issues.push(`${row.id} stored card/child identity or publication state differs.`);
		}
	}

	const choiceRows = await d1Rows(
		`SELECT id, card_id, display_order, choice_key, text, is_correct,
		        feedback, misconception, import_owner
		   FROM study_card_choices
		  ORDER BY card_id, display_order, id`
	);
	const localChoices = local.bundles
		.flatMap((bundle) =>
			bundle.cards.flatMap((card) =>
				card.choices.map((choice) => ({
					id: choice.id,
					card_id: card.id,
					display_order: choice.displayOrder,
					choice_key: choice.choiceKey,
					text: choice.text,
					is_correct: choice.isCorrect ? 1 : 0,
					feedback: choice.feedback,
					misconception: choice.misconception,
					import_owner: STUDY_CARD_IMPORT_OWNER
				}))
			)
		)
		.sort(compareChoice);
	if (stableStringify(choiceRows) !== stableStringify(localChoices)) {
		issues.push('QUESTION_DB study-card choices differ from the accepted artifact union.');
	}

	const sourceRows = await d1Rows(
		`SELECT id, card_id, source_kind, source_url, source_title, source_locator,
		        source_excerpt, source_hash, rights_basis, supports_json, import_owner
		   FROM study_card_sources
		  ORDER BY card_id, id`
	);
	const localSources = local.bundles
		.flatMap((bundle) =>
			bundle.cards.flatMap((card) =>
				card.sources.map((source) => ({
					id: source.id,
					card_id: card.id,
					source_kind: source.sourceKind,
					source_url: source.sourceUrl,
					source_title: source.sourceTitle,
					source_locator: source.sourceLocator,
					source_excerpt: source.sourceExcerpt,
					source_hash: source.sourceHash,
					rights_basis: source.rightsBasis,
					supports_json: stableStringify(source.supports),
					import_owner: STUDY_CARD_IMPORT_OWNER
				}))
			)
		)
		.sort(compareSource);
	if (stableStringify(sourceRows) !== stableStringify(localSources)) {
		issues.push('QUESTION_DB study-card sources differ from the accepted artifact union.');
	}

	const targetRows = await d1Rows(
		`SELECT card_id, offering_id, curriculum_component_id, topic_component_id,
		        is_primary, confidence, reviewed, mapping_source, import_owner
		   FROM study_card_targets ORDER BY card_id, offering_id, curriculum_component_id`
	);
	const localTargets = local.bundles
		.flatMap((bundle) =>
			bundle.cards.flatMap((card) =>
				card.targets.map((target) => ({
					card_id: card.id,
					offering_id: target.offeringId,
					curriculum_component_id: target.curriculumComponentId,
					topic_component_id: target.topicComponentId,
					is_primary: target.isPrimary ? 1 : 0,
					confidence: target.confidence,
					reviewed: target.reviewed ? 1 : 0,
					mapping_source: target.mappingSource,
					import_owner: STUDY_CARD_IMPORT_OWNER
				}))
			)
		)
		.sort(compareTarget);
	if (stableStringify(targetRows) !== stableStringify(localTargets)) {
		issues.push('QUESTION_DB study-card targets differ from the accepted artifact union.');
	}

	const coverageRows = await d1Rows(
		`SELECT release_id, offering_id, topic_component_id, status, reason,
		        card_count, reviewed, import_owner
		   FROM study_deck_coverage ORDER BY release_id, offering_id, topic_component_id`
	);
	const localCoverage = local.bundles
		.flatMap((bundle) =>
			bundle.coverage.map((row) => ({
				release_id: bundle.release.id,
				offering_id: row.offeringId,
				topic_component_id: row.topicComponentId,
				status: row.status,
				reason: row.reason,
				card_count: row.cardCount,
				reviewed: row.reviewed ? 1 : 0,
				import_owner: STUDY_CARD_IMPORT_OWNER
			}))
		)
		.sort(compareCoverage);
	if (stableStringify(coverageRows) !== stableStringify(localCoverage)) {
		issues.push('QUESTION_DB study-deck coverage differs from the accepted artifact union.');
	}

	const triggerNames = [
		'study_card_releases_insert_as_accepted',
		'study_cards_insert_as_draft',
		'study_card_releases_import_expected_counts',
		'study_card_releases_import_coverage_counts',
		'study_cards_publish_choice_count',
		'study_cards_publish_sources',
		'study_cards_publish_targets',
		'study_cards_publish_target_coverage',
		'study_cards_published_content_immutable',
		'study_card_choices_published_parent_update',
		'study_card_sources_published_parent_update',
		'study_card_targets_published_parent_update',
		'answer_chain_illustrations_stale_on_chain_update',
		'answer_chain_illustrations_stale_on_step_insert',
		'answer_chain_illustrations_stale_on_step_update',
		'answer_chain_illustrations_stale_on_step_delete',
		'answer_chain_illustrations_stale_on_mapping_insert',
		'answer_chain_illustrations_stale_on_mapping_update',
		'answer_chain_illustrations_stale_on_mapping_delete',
		'answer_chain_illustrations_stale_on_question_update',
		'answer_chain_illustrations_stale_on_question_delete',
		'answer_chain_illustrations_stale_on_overlay_insert',
		'answer_chain_illustrations_stale_on_overlay_update',
		'answer_chain_illustrations_stale_on_overlay_delete',
		'answer_chain_illustrations_stale_on_mark_insert',
		'answer_chain_illustrations_stale_on_mark_update',
		'answer_chain_illustrations_stale_on_mark_delete',
		'answer_chain_illustrations_stale_on_checklist_insert',
		'answer_chain_illustrations_stale_on_checklist_update',
		'answer_chain_illustrations_stale_on_checklist_delete',
		'answer_chain_illustrations_stale_on_model_insert',
		'answer_chain_illustrations_stale_on_model_update',
		'answer_chain_illustrations_stale_on_model_delete'
	];
	const triggerRows = await d1Rows(
		`SELECT name FROM sqlite_master WHERE type = 'trigger'
		  AND name IN (${triggerNames.map(() => '?').join(',')})`,
		triggerNames
	);
	if (triggerRows.length !== triggerNames.length) {
		issues.push('QUESTION_DB is missing one or more publication/freshness guards.');
	}

	const paper = await verifyPaperCohortD1(local.paperCohort, issues);
	const legacy = await verifyLegacyEnglishReplacement(requireLegacyCleanup, issues);
	const illustrationRows = await d1Rows(
		`SELECT id, answer_chain_id, source_question_id, source_fingerprint,
		        r2_key, public_path, asset_sha256,
		        light_r2_key, light_public_path, light_asset_sha256,
		        width, height, is_primary, status, needs_human_review
		   FROM answer_chain_illustrations
			  ORDER BY id`
	);
	const currentIllustrationCandidates = await loadChainIllustrationCandidates({
		rootDir: releaseRoot,
		includeExisting: true,
		limit: 0
	});
	const releaseIllustrations = verifyIllustrationRows(
		local.illustrationManifest,
		illustrationRows,
		currentIllustrationCandidates,
		issues
	);
	const r2Objects = dedupeObjects([
		...paper.assets.map((row) => ({
			key: row.r2_key,
			kind: 'question-asset',
			sha256: row.sha256
		})),
		...releaseIllustrations.flatMap((row) => [
			{ key: row.r2_key, kind: 'illustration-dark', sha256: row.asset_sha256 },
			{ key: row.light_r2_key, kind: 'illustration-light', sha256: row.light_asset_sha256 }
		])
	]);
	return {
		report: {
			migrations: { local: migrationFiles.length, applied: remoteMigrations.length },
			integrityCheck: 'not-exposed-by-remote-d1-api',
			foreignKeyViolations: foreignKeys.length,
			studyCards: {
				releases: releaseRows.length,
				cards: cardRows.length,
				targets: targetRows.length,
				coverage: coverageRows.length,
				publicationGuards: triggerRows.length
			},
			paperCohort: paper.report,
			legacyEnglishReplacement: legacy,
			primaryIllustrationPairs: illustrationRows.filter(
				(row) =>
					Number(row.is_primary) === 1 &&
					row.status === 'published' &&
					Number(row.needs_human_review) === 0
			).length,
			releaseIllustrationPairs: releaseIllustrations.length,
			r2ObjectsPlanned: r2Objects.length
		},
		r2Objects
	};
}

async function verifyPaperCohortD1(cohort, issues) {
	const expectedPapers = Array.isArray(cohort.papers) ? cohort.papers : [];
	const ids = expectedPapers.map((row) => row.sourceDocumentId);
	if (ids.length !== EXPECTED.papers || new Set(ids).size !== EXPECTED.papers) {
		issues.push('Tracked selective paper cohort is not exactly 20 unique source documents.');
		return { report: { papers: ids.length, complete: 0, missingEvidence: null }, assets: [] };
	}
	const placeholders = ids.map(() => '?').join(',');
	const [
		rows,
		questionRows,
		reviewRows,
		assets,
		canonicalFingerprints,
		approvedContentFingerprints
	] = await Promise.all([
		d1Rows(
			`SELECT q.source_document_id,
			        COUNT(*) questions,
			        COUNT(DISTINCT q.source_question_ref) distinct_refs,
			        COALESCE(SUM(q.marks), 0) marks,
			        SUM(CASE WHEN q.status <> 'published' OR q.needs_human_review <> 0 THEN 1 ELSE 0 END) bad_state,
			        SUM(CASE WHEN NOT EXISTS (
			          SELECT 1 FROM question_rendering_overlays o
			           WHERE o.question_id = q.id AND o.needs_human_review = 0
			        ) THEN 1 ELSE 0 END) missing_overlay,
			        SUM(CASE WHEN NOT EXISTS (
			          SELECT 1 FROM mark_scheme_items m WHERE m.question_id = q.id
			        ) THEN 1 ELSE 0 END) missing_marks,
			        SUM(CASE WHEN NOT EXISTS (
			          SELECT 1 FROM mark_checklist_items c WHERE c.question_id = q.id
			        ) THEN 1 ELSE 0 END) missing_checklist,
			        SUM(CASE WHEN NOT EXISTS (
			          SELECT 1 FROM question_answer_chains qc
			          JOIN answer_chains ac ON ac.id = qc.answer_chain_id
			           WHERE qc.question_id = q.id AND qc.is_primary = 1
			             AND qc.needs_human_review = 0 AND ac.needs_human_review = 0
			             AND ac.status = 'published'
			        ) THEN 1 ELSE 0 END) missing_chain,
			        SUM(CASE WHEN EXISTS (
			          SELECT 1 FROM question_assets a WHERE a.question_id = q.id AND a.required = 1
			             AND (a.needs_human_review <> 0 OR NULLIF(TRIM(a.r2_key), '') IS NULL
			                  OR NULLIF(TRIM(a.public_path), '') IS NULL)
			        ) THEN 1 ELSE 0 END) missing_asset_delivery
			   FROM questions q WHERE q.source_document_id IN (${placeholders})
			  GROUP BY q.source_document_id ORDER BY q.source_document_id`,
			ids
		),
		d1Rows(
			`SELECT q.source_document_id, q.id, q.source_question_ref, q.marks,
			        q.updated_at AS question_updated_at,
			        o.overlay_version, o.updated_at AS overlay_updated_at,
			        LOWER(json_extract(o.render_json, '$.response.kind')) AS response_kind,
			        (SELECT COALESCE(SUM(CASE WHEN m.marks > 0 THEN m.marks ELSE 0 END), 0)
			           FROM mark_scheme_items m WHERE m.question_id = q.id) AS mark_scheme_mark_total,
			        (SELECT COUNT(*) FROM mark_checklist_items c
			          WHERE c.question_id = q.id AND c.required != 0) AS required_checklist_count,
			        (SELECT COUNT(*) FROM question_response_answer_keys k
			          WHERE k.question_id = q.id) AS response_answer_key_count
			   FROM questions q
			   LEFT JOIN question_rendering_overlays o ON o.id = (
			     SELECT candidate.id FROM question_rendering_overlays candidate
			      WHERE candidate.question_id = q.id AND candidate.needs_human_review = 0
			      ORDER BY candidate.updated_at DESC, candidate.id DESC LIMIT 1
			   )
			  WHERE q.source_document_id IN (${placeholders})
			  ORDER BY q.source_document_id, q.display_order, q.source_question_ref`,
			ids
		),
		d1Rows(
			`SELECT source_document_id, past_paper_entry_id, scope, overlay_version,
			        expected_question_count, expected_total_marks, duration_minutes,
			        question_refs_json, solvability_report_json, approved_content_fingerprint,
			        status, reviewed_at
			   FROM question_paper_sitting_reviews
			  WHERE source_document_id IN (${placeholders})`,
			ids
		),
		d1Rows(
			`SELECT q.source_document_id, qa.id, qa.r2_key
			   FROM question_assets qa JOIN questions q ON q.id = qa.question_id
			  WHERE q.source_document_id IN (${placeholders})
			    AND qa.required = 1
			  ORDER BY qa.id`,
			ids
		),
		buildCanonicalPaperFingerprints(ids),
		Promise.all(
			ids.map(async (sourceDocumentId) => [
				sourceDocumentId,
				await fingerprintPaperSittingContent({
					sourceDocumentId,
					query: (sql, params) => d1Rows(sql, params)
				})
			])
		).then((entries) => new Map(entries))
	]);

	const questionsByPaper = groupRows(questionRows, 'source_document_id');
	const reviewsByPaper = new Map(reviewRows.map((row) => [row.source_document_id, row]));
	let missingEvidence = 0;
	let approved = 0;
	let withheld = 0;
	const verifiedAssets = [];
	for (const expected of expectedPapers) {
		const id = expected.sourceDocumentId;
		const row = rows.find((candidate) => candidate.source_document_id === id);
		const paperQuestions = questionsByPaper.get(id) ?? [];
		const review = reviewsByPaper.get(id) ?? null;
		if (COPYRIGHT_SUBSET_SOURCE_IDS.has(id)) {
			const expectedInventory = Array.isArray(
				expected.publishableSubsetDisposition?.retainedQuestionInventory
			)
				? expected.publishableSubsetDisposition.retainedQuestionInventory
						.map((question) => ({
							sourceQuestionRef: question.sourceQuestionRef,
							marks: Number(question.marks)
						}))
						.sort((left, right) => left.sourceQuestionRef.localeCompare(right.sourceQuestionRef))
				: [];
			const actualInventory = paperQuestions
				.map((question) => ({
					sourceQuestionRef: question.source_question_ref,
					marks: Number(question.marks)
				}))
				.sort((left, right) => left.sourceQuestionRef.localeCompare(right.sourceQuestionRef));
			if (stableStringify(actualInventory) !== stableStringify(expectedInventory)) {
				issues.push(`${id} retained copyright-safe question inventory differs in QUESTION_DB.`);
			}
		}
		const expectedFingerprint = expected.database?.canonicalRowFingerprint ?? null;
		const actualFingerprint = canonicalFingerprints.get(id) ?? null;
		if (
			!expectedFingerprint ||
			actualFingerprint?.schemaVersion !== expectedFingerprint.schemaVersion ||
			actualFingerprint?.sha256 !== expectedFingerprint.sha256 ||
			stableStringify(actualFingerprint?.rowCounts ?? {}) !==
				stableStringify(expectedFingerprint.rowCounts ?? {})
		) {
			issues.push(`${id} canonical D1 rows differ from the tracked release fingerprint.`);
		}
		const expectedAssets = Array.isArray(expected.database?.requiredAssetEvidence)
			? expected.database.requiredAssetEvidence
			: [];
		const actualAssets = assets
			.filter((asset) => asset.source_document_id === id)
			.map((asset) => ({ id: asset.id, r2Key: asset.r2_key }))
			.sort((a, b) => a.id.localeCompare(b.id));
		const lockedAssets = expectedAssets
			.map((asset) => ({ id: asset.id, r2Key: asset.r2Key }))
			.sort((a, b) => a.id.localeCompare(b.id));
		if (stableStringify(actualAssets) !== stableStringify(lockedAssets)) {
			issues.push(`${id} required D1 asset rows differ from the tracked release evidence.`);
		}
		const assetHashById = new Map(expectedAssets.map((asset) => [asset.id, asset.sha256]));
		verifiedAssets.push(
			...actualAssets.map((asset) => ({
				source_document_id: id,
				id: asset.id,
				r2_key: asset.r2Key,
				sha256: assetHashById.get(asset.id) ?? null
			}))
		);
		const missing = row
			? [
					'bad_state',
					'missing_overlay',
					'missing_marks',
					'missing_checklist',
					'missing_chain',
					'missing_asset_delivery'
				].reduce((sum, key) => sum + Number(row[key] ?? 0), 0)
			: 1;
		if (
			!row ||
			Number(row.questions) !== Number(row.distinct_refs) ||
			Number(row.questions) !== Number(expected.import?.questions) ||
			Number(row.marks) !== Number(expected.import?.marks) ||
			Number(row.marks) <= 0 ||
			missing
		) {
			issues.push(`${id} differs from its exact imported cohort evidence in QUESTION_DB.`);
		}
		missingEvidence += missing;

		const unsupportedResponses = paperQuestions.filter(
			(question) =>
				Number(question.marks) > 0 && isUnsupportedPaperSittingResponseKind(question.response_kind)
		).length;
		const incompleteGradingQuestions = paperQuestions.filter(
			(question) => !fullyGradeablePaperQuestion(question)
		).length;
		const disposition = expected.approvalDisposition?.status;
		if (disposition === 'approved') {
			approved += 1;
			if (
				!validApprovedPaperReview({
					review,
					expected,
					questions: paperQuestions,
					liveContentFingerprint: approvedContentFingerprints.get(id) ?? null,
					unsupportedResponses,
					incompleteGradingQuestions
				})
			) {
				issues.push(`${id} does not have an exact current, solvable and fully gradeable approval.`);
			}
		} else if (disposition === 'withheld_ineligible') {
			withheld += 1;
			const staticIneligible = expected.fullPaperPolicy?.eligible === false;
			if (
				review?.status === 'approved' ||
				(!staticIneligible && unsupportedResponses === 0 && incompleteGradingQuestions === 0)
			) {
				issues.push(`${id} does not match its exact withheld full-paper disposition.`);
			}
		} else {
			issues.push(`${id} has no exact approved/withheld sitting disposition.`);
		}
	}
	return {
		report: {
			papers: ids.length,
			present: rows.length,
			questions: rows.reduce((sum, row) => sum + Number(row.questions), 0),
			marks: rows.reduce((sum, row) => sum + Number(row.marks), 0),
			missingEvidence,
			approvedFullPapers: approved,
			withheldIneligiblePapers: withheld,
			requiredR2Assets: assets.length
		},
		assets: verifiedAssets
	};
}

function validApprovedPaperReview({
	review,
	expected,
	questions,
	liveContentFingerprint,
	unsupportedResponses,
	incompleteGradingQuestions
}) {
	if (
		!review ||
		review.status !== 'approved' ||
		review.scope !== 'complete_official_paper' ||
		!String(review.past_paper_entry_id ?? '').trim() ||
		Number(review.expected_question_count) !== Number(expected.import?.questions) ||
		Number(review.expected_total_marks) !== Number(expected.import?.marks) ||
		Number(review.duration_minutes) <= 0 ||
		!/^paper-sitting-content-v1:[a-f0-9]{64}$/.test(
			String(review.approved_content_fingerprint ?? '')
		) ||
		review.approved_content_fingerprint !== liveContentFingerprint ||
		unsupportedResponses !== 0 ||
		incompleteGradingQuestions !== 0 ||
		expected.database?.approvedFullPaper !== true ||
		expected.database?.fullPaperReviewStatus !== 'approved' ||
		Number(expected.database?.approvedQuestionCount) !== Number(review.expected_question_count) ||
		Number(expected.database?.approvedMarkTotal) !== Number(review.expected_total_marks) ||
		Number(expected.database?.durationMinutes) !== Number(review.duration_minutes) ||
		expected.database?.fullPaperReviewedAt !== review.reviewed_at
	) {
		return false;
	}
	const refs = questions.map((question) => String(question.source_question_ref));
	const reviewedRefs = parseStringArray(review.question_refs_json);
	if (!reviewedRefs || !sameStringRefs(refs, reviewedRefs)) return false;
	const reviewedAt = sortableTimestamp(review.reviewed_at);
	if (
		!Number.isFinite(reviewedAt) ||
		questions.some(
			(question) =>
				question.overlay_version !== review.overlay_version ||
				sortableTimestamp(question.question_updated_at) > reviewedAt ||
				sortableTimestamp(question.overlay_updated_at) > reviewedAt
		)
	) {
		return false;
	}
	return validStoredSolvabilityReport(
		review.solvability_report_json,
		expected.sourceDocumentId,
		refs
	);
}

function fullyGradeablePaperQuestion(question) {
	const marks = Number(question.marks ?? 0);
	if (!Number.isFinite(marks) || marks <= 0) return true;
	const kind = String(question.response_kind ?? '');
	const gradeableMarks = DETERMINISTIC_RESPONSE_KINDS.has(kind)
		? Math.min(marks, Number(question.response_answer_key_count ?? 0))
		: estimateOfficialGradeableMarks({
				maxMarks: marks,
				markScheme: [{ marks: Number(question.mark_scheme_mark_total ?? 0) }],
				checklist: Array.from({ length: Number(question.required_checklist_count ?? 0) }, () => ({
					required: true
				})),
				answerKeys: []
			});
	return gradeableMarks >= marks;
}

function validStoredSolvabilityReport(raw, sourceDocumentId, expectedRefs) {
	let report;
	try {
		report = JSON.parse(String(raw ?? ''));
	} catch {
		return false;
	}
	const minScore = Number(report?.minScore);
	const results = Array.isArray(report?.results) ? report.results : [];
	const resultRefs = results.map((result) => String(result?.sourceQuestionRef ?? ''));
	return (
		report?.status === 'passed' &&
		report?.sourceDocumentId === sourceDocumentId &&
		Number.isFinite(minScore) &&
		minScore >= 0.8 &&
		Number(report?.questionCount) === expectedRefs.length &&
		Number(report?.passed) === expectedRefs.length &&
		Number(report?.failed) === 0 &&
		sameStringRefs(resultRefs, expectedRefs) &&
		results.every(
			(result) =>
				result?.status === 'passed' &&
				Number(result?.score) >= minScore &&
				result?.studentVisibleSolvable === true &&
				result?.markSchemeFits === true &&
				Array.isArray(result?.requiredRepairs) &&
				result.requiredRepairs.length === 0 &&
				Array.isArray(result?.missingContext) &&
				Array.isArray(result?.renderFindings) &&
				blockingFindings(result.missingContext).length === 0 &&
				blockingFindings(result.renderFindings).length === 0
		)
	);
}

function blockingFindings(value) {
	return Array.isArray(value)
		? value.filter((finding) => String(finding?.severity ?? '').toLowerCase() === 'blocking')
		: [];
}

function parseStringArray(raw) {
	try {
		const value = JSON.parse(String(raw ?? ''));
		return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : null;
	} catch {
		return null;
	}
}

function sameStringRefs(left, right) {
	if (left.length !== right.length) return false;
	const normalizedLeft = [...new Set(left)].sort(numericStringSort);
	const normalizedRight = [...new Set(right)].sort(numericStringSort);
	return (
		normalizedLeft.length === left.length &&
		normalizedRight.length === right.length &&
		normalizedLeft.every((value, index) => value === normalizedRight[index])
	);
}

function numericStringSort(left, right) {
	return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function sortableTimestamp(value) {
	const raw = String(value ?? '');
	const normalized = /(?:Z|[+-]\d\d:\d\d)$/i.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`;
	return Date.parse(normalized);
}

function groupRows(rows, key) {
	const groups = new Map();
	for (const row of rows) {
		const values = groups.get(row[key]) ?? [];
		values.push(row);
		groups.set(row[key], values);
	}
	return groups;
}

async function verifyLegacyEnglishReplacement(requireCleanup, issues) {
	const [row] = await d1Rows(
		`SELECT
		 (SELECT COUNT(*) FROM content_imports
		   WHERE source = 'tmp/current-model-paper-cohort/retry-runs/ocr-j352-02-qp-jun24/import-ready'
		     AND json_extract(metadata_json, '$.vision_extracted') = 1) current_imports,
		 (SELECT COUNT(*) FROM questions
		   WHERE id = 'ocr-j352-02-jun24-04-0'
		     AND source_document_id = 'ocr-j352-02-qp-jun24'
		     AND source_question_ref = '04.0' AND marks = 40
		     AND status = 'published' AND needs_human_review = 0) official_question,
		 (SELECT COUNT(*) FROM question_rendering_overlays
		   WHERE question_id = 'ocr-j352-02-jun24-04-0'
		     AND needs_human_review = 0 AND confidence >= 0.75) official_overlays,
		 (SELECT COUNT(*) FROM question_assets
		   WHERE question_id = 'ocr-j352-02-jun24-04-0' AND required = 1
		     AND needs_human_review = 0 AND r2_key IS NOT NULL AND public_path IS NOT NULL
		     AND REPLACE(LOWER(COALESCE(role, '')), '_', '-') IN
		       ('source-page', 'source-text', 'printed-extract')) official_sources,
		 (SELECT COUNT(*) FROM questions
		   WHERE id = 'english-lit-romeo-juliet-fate-guided') legacy_question,
		 (SELECT COUNT(*) FROM source_documents
		   WHERE id = 'ocr-j352-02-jun24-romeo-juliet-fate') legacy_source,
		 (SELECT COUNT(*) FROM answer_chains
		   WHERE id = 'english-chain-romeo-juliet-fate') legacy_chain,
		 (SELECT COUNT(*) FROM constellations
		   WHERE id = 'english-constellation-romeo-juliet-fate') legacy_constellation,
		 (SELECT COUNT(*) FROM content_imports
		   WHERE id = 'english-guided-romeo-juliet-fate-seed-v1') legacy_import,
		 (SELECT COUNT(*) FROM public_route_payloads
		   WHERE route_path LIKE '/questions/english-lit-romeo-juliet-fate-guided%'
		      OR payload_json LIKE '%english-lit-romeo-juliet-fate-guided%') legacy_payloads`
	);
	if (
		Number(row.current_imports) < 1 ||
		Number(row.official_question) !== 1 ||
		Number(row.official_overlays) < 1 ||
		Number(row.official_sources) < 1
	) {
		issues.push('Official current-cohort J352/02 Q04.0 replacement is not independently complete.');
	}
	const legacyCount =
		Number(row.legacy_question) +
		Number(row.legacy_source) +
		Number(row.legacy_chain) +
		Number(row.legacy_constellation) +
		Number(row.legacy_import) +
		Number(row.legacy_payloads);
	if (requireCleanup && legacyCount !== 0) {
		issues.push('Migration 0024 has not completely removed the superseded English guided seed.');
	}
	return { ...row, cleanupRequired: requireCleanup, legacyRows: legacyCount };
}

async function verifyPersonalMigrations(releaseRoot, issues) {
	const files = readdirSync(path.join(releaseRoot, 'migrations/personal'))
		.filter((name) => name.endsWith('.sql'))
		.sort();
	const rows = await d1Rows('SELECT name FROM d1_migrations ORDER BY id', [], {
		binding: 'PERSONAL_DB'
	});
	const applied = rows.map((row) => row.name);
	if (stableStringify(files) !== stableStringify(applied)) {
		issues.push('PERSONAL_DB migrations do not exactly match migrations/personal.');
	}
	const foreignKeys = await d1Rows('SELECT * FROM pragma_foreign_key_check', [], {
		binding: 'PERSONAL_DB'
	});
	if (foreignKeys.length)
		issues.push(`PERSONAL_DB has ${foreignKeys.length} foreign-key violation(s).`);
	return {
		report: {
			migrations: { local: files.length, applied: applied.length },
			integrityCheck: 'not-exposed-by-remote-d1-api',
			foreignKeyViolations: foreignKeys.length
		}
	};
}

async function verifyReleaseR2(objects, { rootDir: releaseRoot, concurrency, issues }) {
	loadD1Env(releaseRoot);
	const results = new Array(objects.length);
	let next = 0;
	async function worker() {
		while (next < objects.length) {
			const index = next++;
			const object = objects[index];
			try {
				const result = await fetchR2Object(object.key, releaseRoot);
				const hashMatches = object.sha256 ? result.sha256 === object.sha256 : true;
				results[index] = { ...object, ...result, hashMatches };
				if (!hashMatches) issues.push(`R2 object ${object.key} does not match its D1 SHA-256.`);
			} catch (error) {
				results[index] = { ...object, error: message(error) };
				issues.push(`R2 object ${object.key} could not be read: ${message(error)}`);
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, objects.length) }, worker));
	return {
		status: results.every((row) => row && !row.error && row.hashMatches) ? 'passed' : 'failed',
		bucket: 'question-constellation',
		objects: results.length,
		bytes: results.reduce((sum, row) => sum + Number(row?.bytes ?? 0), 0),
		hashChecked: results.filter((row) => row?.sha256).length,
		failed: results.filter((row) => row?.error || row?.hashMatches === false).length,
		results
	};
}

function fetchR2Object(key, releaseRoot) {
	return new Promise((resolve, reject) => {
		const child = spawn(
			'corepack',
			[
				'pnpm',
				'exec',
				'wrangler',
				'r2',
				'object',
				'get',
				`question-constellation/${key}`,
				'--remote',
				'--pipe'
			],
			{ cwd: releaseRoot, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
		);
		const hash = createHash('sha256');
		let bytes = 0;
		let stderr = '';
		child.stdout.on('data', (chunk) => {
			hash.update(chunk);
			bytes += chunk.length;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk.toString();
		});
		child.once('error', reject);
		child.once('close', (code) => {
			if (code !== 0) reject(new Error(stderr.trim() || `wrangler exited ${code}`));
			else if (bytes <= 0) reject(new Error('R2 returned an empty object'));
			else resolve({ bytes, sha256: hash.digest('hex') });
		});
	});
}

function rootMigrationFiles(releaseRoot) {
	return readdirSync(path.join(releaseRoot, 'migrations'), { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
		.map((entry) => entry.name)
		.sort();
}

function ancestry(id, byId) {
	const rows = [];
	const seen = new Set();
	let current = byId.get(id);
	while (current && !seen.has(current.id)) {
		seen.add(current.id);
		rows.push(current);
		current = current.parentId ? byId.get(current.parentId) : null;
	}
	return rows;
}

function dedupeObjects(objects) {
	const byKey = new Map();
	for (const object of objects.filter((row) => row.key)) {
		const existing = byKey.get(object.key);
		if (existing?.sha256 && object.sha256 && existing.sha256 !== object.sha256) {
			throw new Error(`R2 key ${object.key} has conflicting expected hashes.`);
		}
		byKey.set(object.key, existing?.sha256 ? existing : object);
	}
	return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function compareTarget(a, b) {
	return (
		a.card_id.localeCompare(b.card_id) ||
		a.offering_id.localeCompare(b.offering_id) ||
		a.curriculum_component_id.localeCompare(b.curriculum_component_id)
	);
}

function compareChoice(a, b) {
	return (
		a.card_id.localeCompare(b.card_id) ||
		Number(a.display_order) - Number(b.display_order) ||
		a.id.localeCompare(b.id)
	);
}

function compareSource(a, b) {
	return a.card_id.localeCompare(b.card_id) || a.id.localeCompare(b.id);
}

function compareCoverage(a, b) {
	return (
		a.release_id.localeCompare(b.release_id) ||
		a.offering_id.localeCompare(b.offering_id) ||
		a.topic_component_id.localeCompare(b.topic_component_id)
	);
}

function duplicates(values) {
	const counts = new Map();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return [...counts].filter(([, count]) => count > 1).map(([value]) => value);
}

function readJsonOr(relativePath, releaseRoot, issues, fallback) {
	const filePath = path.join(releaseRoot, relativePath ?? '');
	if (!relativePath || !existsSync(filePath)) {
		issues.push(`Missing ${relativePath || 'JSON path'}.`);
		return fallback;
	}
	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch (error) {
		issues.push(`Invalid JSON in ${relativePath}: ${message(error)}`);
		return fallback;
	}
}

function parseArgs(argv) {
	const value = (name, fallback = null) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
	const r2Concurrency = Number(value('r2-concurrency', '4'));
	if (!Number.isInteger(r2Concurrency) || r2Concurrency < 1 || r2Concurrency > 8) {
		fail('--r2-concurrency must be an integer from 1 to 8.');
	}
	return {
		help: argv.includes('--help') || argv.includes('-h'),
		remote: argv.includes('--remote'),
		verifyR2: argv.includes('--verify-r2'),
		verifyLocalSourceInputs: argv.includes('--verify-local-source-inputs'),
		requireLegacyCleanup: argv.includes('--require-legacy-cleanup'),
		r2Concurrency,
		output: value('output')
	};
}

function usage() {
	return `Usage: node scripts/verify-final-release-data.mjs [options]

Default: tracked-evidence local preflight, suitable for a clean clone. Only
--remote --verify-r2 --verify-local-source-inputs --require-legacy-cleanup
together can return the final status "passed".

Options:
  --remote                  also verify QUESTION_DB and PERSONAL_DB read-only
  --verify-r2               stream every required cohort asset and published
	                            illustration pair from R2; requires --remote
  --verify-local-source-inputs
                            hash all ignored official paper/source PDFs on an
                            operator machine that holds the source corpus
  --require-legacy-cleanup  require migration 0024 postconditions
  --r2-concurrency=<1..8>   remote R2 read concurrency (default 4)
  --output=<path>           write the same JSON report locally
  --help                    show this help`;
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function hexSha256(value) {
	return /^[a-f0-9]{64}$/.test(String(value ?? ''));
}

function relative(releaseRoot, filePath) {
	return path.relative(releaseRoot, filePath).split(path.sep).join('/');
}

function message(error) {
	return error instanceof Error ? error.message : String(error);
}

function fail(value) {
	throw new Error(value);
}
