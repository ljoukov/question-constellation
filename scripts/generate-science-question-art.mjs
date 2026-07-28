#!/usr/bin/env node

import { generateImages } from '@ljoukov/llm';
import { execFile } from 'node:child_process';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { loadDefaultEnv } from './lib/codex-sdk-runner.mjs';
import { requireArtGenerationJobEvidence } from './lib/science-challenge-art-lineage.mjs';
import {
	SCIENCE_QUESTION_ART_REVIEW_SCHEMA,
	canonicalHash,
	sha256,
	stableStringify,
	validateIndependentArtReviewRow,
	validateQuestionArtManifest
} from './lib/science-challenge-release.mjs';
import { requireArtReviewEvidence } from './lib/science-challenge-review-evidence.mjs';
import { validatePerceptualAudit } from './lib/science-question-art-perceptual.mjs';
import {
	SCIENCE_QUESTION_ART_REVIEW_ADJUDICATION_SCHEMA,
	buildAdjudicatedArtReview
} from './lib/science-question-art-review-adjudication.mjs';
import {
	ArtGenerationSafetyStop,
	DEFAULT_MIN_FREE_SPACE_GIB,
	artGenerationExitCode,
	collectMinimumFreeSpaceTargets,
	createMinimumFreeSpaceGuard,
	failedAttemptCleanupStop,
	imageServiceInfrastructureSafetyStop,
	inspectFailedAttemptImages,
	isArtGenerationSafetyStop,
	minimumFreeSpaceBytes,
	removeInspectedFailedAttemptImages,
	runConcurrentUntilStopped,
	serializeArtGenerationSafetyStop,
	storageExhaustionSafetyStop
} from './lib/science-question-art-run-safety.mjs';
import {
	publicationHeadroomBytes,
	publicationRecoveryHeadroomBytes,
	publishArtPairAndJob,
	recoverArtPublication,
	recoverArtPublicationsForSpec
} from './lib/science-question-art-publication.mjs';
import {
	acquireArtReleaseLock,
	acquireArtWorkRootLock,
	inspectAttemptSlots,
	passedJobArtifactPaths,
	prepareArtSpecDirectory,
	prepareOwnedArtWorkRoot,
	prepareRepairLineageIdentity,
	readRepairLineageIdentity,
	writeTextAtomically
} from './lib/science-question-art-run-state.mjs';

const execFileAsync = promisify(execFile);
const IMAGE_MODEL = 'chatgpt-gpt-image-2';
const REQUEST_WIDTH = 2048;
const REQUEST_HEIGHT = 1152;
const MASTER_WIDTH = 1672;
const MASTER_HEIGHT = 941;
const FINAL_WIDTH = 960;
const FINAL_HEIGHT = 540;
const NORMALIZATION_HEADROOM_BYTES = 32n * 1024n * 1024n;
const FAILED_ATTEMPT_CLEANUP_PREREQUISITE =
	'Resolve the recorded cleanup/evidence issue before following the run summary; no generation may start.';
const IMMUTABLE_LINEAGE_PREREQUISITE =
	'Inspect and restore the exact immutable attempt/job evidence before following the run summary.';
const rootDir = process.cwd();
loadDefaultEnv(rootDir);
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
if (args.imageModel !== IMAGE_MODEL) {
	throw new Error(`Release art generation requires ${IMAGE_MODEL}.`);
}

const manifestPath = path.resolve(rootDir, args.manifest);
assertIgnoredWorkspacePath(manifestPath, 'Art manifest');
if (!existsSync(manifestPath)) throw new Error(`Art manifest does not exist: ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
validateManifest(manifest, args.requireCount);
const manifestSha256 = canonicalHash(manifest);
const workRoot = path.resolve(rootDir, args.workRoot);
assertIgnoredWorkspacePath(workRoot, 'Art work root');
validateManifestOutputDestinations(manifest);
const requestedRepairKind = args.repairReview
	? 'independent-review'
	: args.repairPerceptualAudit
		? 'perceptual-audit'
		: null;
if (args.repairReview && args.repairPerceptualAudit) {
	throw new Error('--repair-review and --repair-perceptual-audit are mutually exclusive.');
}
if (requestedRepairKind && !args.replaceOutput) {
	throw new Error('Repair modes require --replace-output because they replace rejected pairs.');
}
if (requestedRepairKind && args.resume) {
	throw new Error(
		'Repair modes cannot be combined with --resume; re-review or re-audit current bytes before another repair pass.'
	);
}
const nextAction = generationSafetyNextAction(requestedRepairKind, args);
const diskGuard = createMinimumFreeSpaceGuard({
	paths: collectMinimumFreeSpaceTargets([
		workRoot,
		rootDir,
		...manifest.specs.flatMap((spec) => [
			path.resolve(rootDir, spec.output.darkPath),
			path.resolve(rootDir, spec.output.lightPath)
		])
	]),
	minimumBytes: minimumFreeSpaceBytes(args.minFreeSpaceGiB),
	resumeInstruction: nextAction.instruction
});
let resumableStop = null;
let workRootLock = null;
let releaseLock = null;
if (!args.dryRun) {
	try {
		diskGuard.check({ phase: 'preflight' });
	} catch (error) {
		if (!isArtGenerationSafetyStop(error)) throw error;
		exitBeforeGeneration(error);
	}
	try {
		releaseLock = acquireArtReleaseLock({
			workspaceRoot: rootDir,
			releaseId: manifest.releaseId,
			manifestSha256
		});
		prepareOwnedArtWorkRoot({
			workRoot,
			workspaceRoot: rootDir,
			releaseId: manifest.releaseId,
			manifestSha256
		});
		workRootLock = acquireArtWorkRootLock({
			workRoot,
			releaseId: manifest.releaseId,
			manifestSha256
		});
		process.once('exit', () => {
			workRootLock?.release();
			releaseLock?.release();
		});
		prepareOwnedArtWorkRoot({
			workRoot,
			workspaceRoot: rootDir,
			releaseId: manifest.releaseId,
			manifestSha256
		});
		recoverAllArtPublications(manifest, workRoot);
		reconcileAllFailedAttemptCleanup(manifest, workRoot);
		diskGuard.check({ phase: 'after publication recovery' });
	} catch (error) {
		workRootLock?.release();
		workRootLock = null;
		releaseLock?.release();
		releaseLock = null;
		if (isArtGenerationSafetyStop(error)) exitBeforeGeneration(error);
		const storageStop = storageExhaustionSafetyStop(error, {
			phase: 'while preparing the art run',
			nextAction: nextAction.instruction
		});
		if (storageStop) exitBeforeGeneration(diskGuard.stop(storageStop));
		throw error;
	}
}

const repairReview = args.repairReview
	? readAndValidateRepairReview(args.repairReview, manifest)
	: null;
const perceptualRepair = args.repairPerceptualAudit
	? readAndValidatePerceptualRepair(args.repairPerceptualAudit, manifest)
	: null;
const repairPerceptualAudit = perceptualRepair?.audit ?? null;
const repairEvidence = repairReview ?? repairPerceptualAudit;
const repairEvidencePath = args.repairReview ?? args.repairPerceptualAudit;
const repairEvidenceKind = repairReview
	? 'independent-review'
	: repairPerceptualAudit
		? 'perceptual-audit'
		: null;
const repairById = new Map(
	repairReview
		? repairReview.reviews
				.filter((review) => review.accepted === false && review.disposition === 'fresh-regenerate')
				.map((review) => [review.id, review])
		: (perceptualRepair?.repairRows.map((row) => [row.id, row]) ?? [])
);
const selectableSpecs = repairEvidence
	? manifest.specs.filter((spec) => repairById.has(spec.id))
	: manifest.specs;
const selected = selectSpecs(selectableSpecs, args.ids, args.limit);
if (repairEvidence && selected.length === 0) {
	throw new Error('The supplied repair evidence contains no rejected pairs to regenerate.');
}
if (args.replaceOutput && !repairEvidence) {
	const conflict = selected.find((spec) => ordinaryReplacementWouldMutateEvidence(spec, workRoot));
	if (conflict) {
		throw new Error(
			`Refusing bare --replace-output for ${conflict.id}: an ordinary output or passed job already ` +
				'exists, and reusing its attempt directories would overwrite accepted lineage evidence. ' +
				'Use --resume for unchanged bytes or a validated --repair-review/--repair-perceptual-audit workflow.'
		);
	}
}
if (repairEvidence && !resumableStop && !args.dryRun) {
	const evidenceSha256 = canonicalHash(repairEvidence);
	const evidencePath = path.join(workRoot, `repair-evidence-${evidenceSha256}.json`);
	try {
		if (existsSync(evidencePath)) {
			const existingEvidence = readJson(evidencePath, 'stored repair evidence');
			if (canonicalHash(existingEvidence) !== evidenceSha256) {
				throw new Error('Existing repair evidence file does not match its content-addressed name.');
			}
		} else {
			writeTextAtomically(evidencePath, `${stableStringify(repairEvidence)}\n`);
		}
	} catch (error) {
		const storageStop = storageExhaustionSafetyStop(error, {
			phase: 'while archiving repair evidence',
			nextAction: nextAction.instruction
		});
		if (!storageStop) throw error;
		resumableStop ??= diskGuard.stop(storageStop);
	}
}

if (args.dryRun) {
	console.log(
		JSON.stringify(
			{
				status: 'planned',
				manifest: path.relative(rootDir, manifestPath),
				selected: selected.length,
				concurrency: args.concurrency,
				minFreeSpaceGiB: args.minFreeSpaceGiB,
				finalDimensions: `${FINAL_WIDTH}x${FINAL_HEIGHT}`,
				calls: { generate: selected.length * 2 },
				repairEvidence: repairEvidence
					? {
							kind: repairEvidenceKind,
							path: repairEvidencePath,
							sha256: canonicalHash(repairEvidence),
							rejectedPairs: repairById.size
						}
					: null
			},
			null,
			2
		)
	);
	process.exit(0);
}

if (!resumableStop) {
	try {
		preflightFreshInvocation();
		if (args.resume) {
			for (const spec of selected) preflightResumeSpec(spec);
		}
	} catch (error) {
		const safetyStop = isArtGenerationSafetyStop(error)
			? error
			: storageExhaustionSafetyStop(error, {
					phase: 'while preflighting immutable generation lineage',
					nextAction: nextAction.instruction
				});
		if (!safetyStop) throw error;
		resumableStop ??= diskGuard.stop(safetyStop);
	}
}

const startedAt = new Date().toISOString();
const run = resumableStop
	? { results: new Array(selected.length), scheduledCount: 0 }
	: await runConcurrentUntilStopped(
			selected.map((spec) => async () => {
				try {
					return await generatePair(spec);
				} catch (error) {
					const storageStop = storageExhaustionSafetyStop(error, {
						phase: 'while processing an art pair',
						artId: spec.id,
						nextAction: nextAction.instruction
					});
					if (!storageStop) throw error;
					resumableStop ??= diskGuard.stop(storageStop);
					throw storageStop;
				}
			}),
			args.concurrency,
			{
				beforeClaim(index) {
					diskGuard.check({
						phase: 'before scheduling a new pair',
						artId: selected[index].id
					});
				},
				getStopError: () => resumableStop ?? diskGuard.failure,
				onTaskError(error) {
					if (isArtGenerationSafetyStop(error)) {
						resumableStop ??= diskGuard.stop(error);
					}
				}
			}
		);
resumableStop ??= diskGuard.failure;
const results = selected.map((spec, index) => {
	const result = run.results[index];
	if (result) return result.id ? result : { id: spec.id, ...result };
	return {
		id: spec.id,
		status: 'not-started',
		action: nextAction.kind,
		resumable: true,
		error: 'Not scheduled after a generation safety stop; follow the summary nextAction exactly.'
	};
});
const serializedResumableStop = serializeArtGenerationSafetyStop(resumableStop);
const summary = {
	schemaVersion: 'science-question-art-generation-summary/v1',
	releaseId: manifest.releaseId,
	status: resumableStop
		? 'failed-resumable'
		: results.some((result) => result.status !== 'passed')
			? 'failed'
			: 'passed',
	imageModel: args.imageModel,
	startedAt,
	finishedAt: new Date().toISOString(),
	selectedCount: selected.length,
	scheduledCount: run.scheduledCount,
	passedCount: results.filter((result) => result.status === 'passed').length,
	failedCount: results.filter((result) => result.status !== 'passed').length,
	notStartedCount: results.filter((result) => result.status === 'not-started').length,
	minFreeSpaceGiB: args.minFreeSpaceGiB,
	resumableFailure: serializedResumableStop,
	nextAction: resumableStop
		? {
				...nextAction,
				prerequisite: serializedResumableStop?.nextAction ?? null
			}
		: null,
	repairReviewSha256: repairReview ? canonicalHash(repairReview) : null,
	repairPerceptualAuditSha256: repairPerceptualAudit ? canonicalHash(repairPerceptualAudit) : null,
	results
};
const generationSummaryName = repairEvidence
	? `repair-${canonicalHash(repairEvidence).slice(0, 12)}-summary.json`
	: 'generation-summary.json';
try {
	writeTextAtomically(path.join(workRoot, generationSummaryName), `${stableStringify(summary)}\n`);
} catch (error) {
	const storageStop = storageExhaustionSafetyStop(error, {
		phase: 'while writing the generation summary',
		nextAction: nextAction.instruction
	});
	if (!storageStop) throw error;
	resumableStop ??= diskGuard.stop(storageStop);
	summary.status = 'failed-resumable';
	summary.resumableFailure = serializeArtGenerationSafetyStop(resumableStop);
	summary.nextAction = {
		...nextAction,
		prerequisite: summary.resumableFailure?.nextAction ?? null
	};
}
console.log(JSON.stringify(summary, null, 2));
if (resumableStop) console.error(resumableStop.message);
workRootLock?.release();
workRootLock = null;
releaseLock?.release();
releaseLock = null;
if (artGenerationExitCode(summary)) process.exit(1);

async function generatePair(spec) {
	const specDir = prepareArtSpecDirectory({ workRoot, artId: spec.id });
	const finalDark = path.resolve(rootDir, spec.output.darkPath);
	const finalLight = path.resolve(rootDir, spec.output.lightPath);
	const specSha256 = canonicalHash(spec);
	const repair = repairById.get(spec.id) ?? null;
	const repairReviewSha256 = repairReview ? canonicalHash(repairReview) : null;
	const repairPerceptualAuditSha256 = repairPerceptualAudit
		? canonicalHash(repairPerceptualAudit)
		: null;
	const repairRunId = (repairReviewSha256 ?? repairPerceptualAuditSha256)?.slice(0, 12) ?? null;
	if (repairRunId) {
		prepareRepairLineageIdentity({
			specDir,
			repairRunId,
			repairEvidenceKind,
			repairEvidenceSha256: repairReviewSha256 ?? repairPerceptualAuditSha256
		});
	}
	const jobPath = path.join(specDir, repairRunId ? `repair-${repairRunId}-job.json` : 'job.json');
	recoverArtPublication({ jobPath, finalDark, finalLight });
	if (args.resume) {
		const passedResolution = resolvePassedResumeJob({
			spec,
			specDir,
			finalDark,
			finalLight
		});
		if (passedResolution) {
			const resumed = resumePassedJob({
				job: passedResolution.job,
				jobPath: passedResolution.jobPath,
				spec,
				finalDark,
				finalLight,
				resumeRepairEvidence: passedResolution.repairEvidence
			});
			return {
				id: spec.id,
				status: 'passed',
				action: resumed.restored ? 'recovered-and-resumed' : 'resumed',
				outputs: resumed.outputs,
				safetyStop: resumed.safetyStop
			};
		}
	}
	let existingFailedJob = null;
	if (args.resume && existsSync(jobPath)) {
		const job = readJson(jobPath, 'art generation job');
		validateFailedJobForResume({
			job,
			spec,
			specSha256,
			repairReviewSha256,
			repairPerceptualAuditSha256
		});
		existingFailedJob = job;
	} else if (!args.resume && existsSync(jobPath)) {
		return {
			id: spec.id,
			status: 'failed',
			error:
				'Existing generation job requires the matching explicit resume or fresh hash-bound repair workflow.'
		};
	}
	if (existsSync(finalDark) !== existsSync(finalLight)) {
		return {
			id: spec.id,
			status: 'failed',
			error: 'Only one final theme output exists and no validated passed job can recover the pair.'
		};
	}
	if (!args.replaceOutput && existsSync(finalDark) && existsSync(finalLight)) {
		return {
			id: spec.id,
			status: 'failed',
			error: 'Final pair exists; use --resume so its full generation lineage is replayed.'
		};
	}
	const specPath = path.join(specDir, 'spec.json');
	if (existsSync(specPath)) {
		const storedSpec = readJson(specPath, 'stored art spec');
		if (canonicalHash(storedSpec) !== specSha256) {
			throw new ArtGenerationSafetyStop(
				`Stored art spec differs from the manifest for ${spec.id}; existing lineage will not be overwritten.`,
				{
					code: 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID',
					details: {
						artId: spec.id,
						nextAction: IMMUTABLE_LINEAGE_PREREQUISITE
					}
				}
			);
		}
	} else {
		writeTextAtomically(specPath, `${stableStringify(spec)}\n`);
	}
	const protectedPaths = passedJobArtifactPaths({ specDir, rootDir });
	const history = inspectAttemptSlots({
		specDir,
		repairRunId,
		maxAttempts: 4
	});
	if (existingFailedJob && existingFailedJob.attempts.length > history.slots.size) {
		throw new ArtGenerationSafetyStop(
			`Failed job for ${spec.id} claims attempts whose immutable directories are missing.`,
			{
				code: 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID',
				details: {
					artId: spec.id,
					jobAttemptCount: existingFailedJob.attempts.length,
					directoryCount: history.slots.size,
					nextAction: IMMUTABLE_LINEAGE_PREREQUISITE
				}
			}
		);
	}
	const attempts = loadPriorAttemptFailures({
		spec,
		slots: history.slots,
		protectedPaths
	});
	if (
		existingFailedJob &&
		existingFailedJob.attempts.some(
			(attempt, index) => canonicalHash(attempt) !== canonicalHash(attempts[index])
		)
	) {
		throw new ArtGenerationSafetyStop(
			`Failed job for ${spec.id} differs from its immutable attempt evidence.`,
			{
				code: 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID',
				details: {
					artId: spec.id,
					nextAction: IMMUTABLE_LINEAGE_PREREQUISITE
				}
			}
		);
	}
	const firstAttempt =
		history.nextAttempt !== null && history.nextAttempt <= args.maxAttempts
			? history.nextAttempt
			: null;
	if (firstAttempt === null) {
		return writeFailedJob({
			jobPath,
			spec,
			specSha256,
			repairReviewSha256,
			repairPerceptualAuditSha256,
			attempts
		});
	}
	for (let attempt = firstAttempt; attempt <= args.maxAttempts; attempt += 1) {
		const attemptDir = attemptDirectory(specDir, repairRunId, attempt);
		mkdirSync(attemptDir);
		const darkPromptPath = path.join(attemptDir, 'dark-prompt.txt');
		const lightPromptPath = path.join(attemptDir, 'light-prompt.txt');
		let publicationCommitted = false;
		try {
			const darkMaster = path.join(attemptDir, 'dark-master.webp');
			const lightMaster = path.join(attemptDir, 'light-master.webp');
			const darkPrompt = buildVariantPrompt(spec, repair, 'dark');
			diskGuard.check({ phase: 'before starting an attempt', artId: spec.id });
			writeTextAtomically(darkPromptPath, `${darkPrompt}\n`);
			diskGuard.check({ phase: 'before dark generation', artId: spec.id });
			await generateVariant(spec.id, 'dark', darkPrompt, darkMaster);
			diskGuard.check({ phase: 'after dark generation', artId: spec.id });
			const darkMasterCheck = await imageCheck(darkMaster, MASTER_WIDTH, MASTER_HEIGHT, spec.id);
			if (darkMasterCheck.status !== 'passed') {
				throw new Error(`Dark master check failed: ${darkMasterCheck.issues.join(' ')}`);
			}
			const lightPrompt = buildVariantPrompt(spec, repair, 'light');
			writeTextAtomically(lightPromptPath, `${lightPrompt}\n`);
			diskGuard.check({ phase: 'before light generation', artId: spec.id });
			await generateVariant(spec.id, 'light', lightPrompt, lightMaster);
			diskGuard.check({ phase: 'after light generation', artId: spec.id });
			const lightMasterCheck = await imageCheck(lightMaster, MASTER_WIDTH, MASTER_HEIGHT, spec.id);
			if (lightMasterCheck.status !== 'passed') {
				throw new Error(`Light master check failed: ${lightMasterCheck.issues.join(' ')}`);
			}
			const normalizedDark = path.join(attemptDir, 'dark.webp');
			const normalizedLight = path.join(attemptDir, 'light.webp');
			await normalizeWebp(darkMaster, normalizedDark, spec.id, 'dark');
			await normalizeWebp(lightMaster, normalizedLight, spec.id, 'light');
			const darkCheck = await imageCheck(normalizedDark, FINAL_WIDTH, FINAL_HEIGHT, spec.id);
			const lightCheck = await imageCheck(normalizedLight, FINAL_WIDTH, FINAL_HEIGHT, spec.id);
			const pairCheck = validatePair(normalizedDark, normalizedLight, darkCheck, lightCheck);
			if (pairCheck.status !== 'passed') {
				throw new Error(`Final pair check failed: ${pairCheck.issues.join(' ')}`);
			}
			const outputs = {
				dark: outputRecordFromSource(normalizedDark, finalDark),
				light: outputRecordFromSource(normalizedLight, finalLight)
			};
			const job = {
				schemaVersion: 'science-question-art-job/v1',
				id: spec.id,
				status: 'passed',
				attempt,
				imageModel: args.imageModel,
				specSha256,
				repairReviewSha256,
				repairPerceptualAuditSha256,
				repairInstructions: repair
					? repair.issues
							.filter((issue) => issue.severity === 'major')
							.map((issue) => issue.regenerationInstruction)
					: [],
				artifacts: {
					spec: artifactRecord(specPath),
					darkPrompt: artifactRecord(darkPromptPath),
					lightPrompt: artifactRecord(lightPromptPath),
					darkMaster: artifactRecord(darkMaster),
					lightMaster: artifactRecord(lightMaster),
					darkNormalized: artifactRecord(normalizedDark),
					lightNormalized: artifactRecord(normalizedLight)
				},
				checks: { darkMaster: darkMasterCheck, lightMaster: lightMasterCheck, pair: pairCheck },
				outputs,
				finishedAt: new Date().toISOString()
			};
			const jobText = `${stableStringify(job)}\n`;
			diskGuard.check({
				phase: 'before transactional pair publication',
				artId: spec.id,
				headroomBytes: publicationHeadroomBytes({
					darkSource: normalizedDark,
					lightSource: normalizedLight,
					finalDark,
					finalLight,
					jobPath,
					jobText
				})
			});
			const publication = publishArtPairAndJob({
				darkSource: normalizedDark,
				lightSource: normalizedLight,
				finalDark,
				finalLight,
				jobPath,
				jobText,
				validateCommitted() {
					const publishedJob = readJson(jobPath, 'published art generation job');
					if (canonicalHash(publishedJob) !== canonicalHash(job)) {
						throw new Error('Published art job bytes differ from the prepared job.');
					}
					requireArtGenerationJobEvidence({
						job: publishedJob,
						jobPath,
						spec,
						manifest,
						currentOutputs: {
							dark: outputRecord(finalDark),
							light: outputRecord(finalLight)
						},
						rootDir,
						repairEvidence
					});
				}
			});
			publicationCommitted = true;
			if (publication.action === 'committed-pending-cleanup') {
				resumableStop ??= diskGuard.stop(
					publicationCleanupStop(spec.id, jobPath, publication.warnings)
				);
			}
			const currentOutputs = {
				dark: outputRecord(finalDark),
				light: outputRecord(finalLight)
			};
			let safetyStop = null;
			try {
				diskGuard.check({ phase: 'after transactional pair publication', artId: spec.id });
			} catch (error) {
				if (!isArtGenerationSafetyStop(error)) throw error;
				resumableStop ??= error;
				safetyStop = serializeArtGenerationSafetyStop(error);
			}
			return {
				id: spec.id,
				status: 'passed',
				action: 'generated',
				attempt,
				outputs: currentOutputs,
				safetyStop
			};
		} catch (error) {
			if (publicationCommitted) {
				const lineageStop = new ArtGenerationSafetyStop(
					`Published pair/job for ${spec.id} failed its full lineage replay; accepted artifacts were preserved.`,
					{
						code: 'SCIENCE_ART_PUBLICATION_RECOVERY_FAILED',
						details: {
							artId: spec.id,
							nextAction:
								'Do not regenerate or delete artifacts. Inspect the coherent published job and lineage error.'
						},
						cause: error
					}
				);
				resumableStop ??= diskGuard.stop(lineageStop);
				throw lineageStop;
			}
			if (
				isArtGenerationSafetyStop(error) &&
				error.code === 'SCIENCE_ART_PUBLICATION_RECOVERY_FAILED'
			) {
				resumableStop ??= diskGuard.stop(error);
				throw error;
			}
			const storageStop = storageExhaustionSafetyStop(error, {
				phase: 'while materializing an art attempt',
				artId: spec.id,
				nextAction: nextAction.instruction
			});
			const failure = recordFailedAttempt({
				attemptDir,
				attempt,
				error: storageStop ?? error,
				artId: spec.id,
				protectedPaths
			});
			attempts.push(failure);
			const serviceStop = imageServiceInfrastructureSafetyStop(error, {
				phase: 'while requesting image generation or theme conversion',
				artId: spec.id
			});
			const safetyError =
				diskGuard.failure ??
				storageStop ??
				serviceStop ??
				(isArtGenerationSafetyStop(error) ? error : null);
			if (safetyError) {
				resumableStop ??= diskGuard.stop(safetyError);
				throw safetyError;
			}
		}
	}
	return writeFailedJob({
		jobPath,
		spec,
		specSha256,
		repairReviewSha256,
		repairPerceptualAuditSha256,
		attempts
	});
}

function preflightResumeSpec(spec) {
	const specDir = path.join(workRoot, spec.id);
	if (!existsSync(specDir)) return;
	prepareArtSpecDirectory({ workRoot, artId: spec.id });
	const finalDark = path.resolve(rootDir, spec.output.darkPath);
	const finalLight = path.resolve(rootDir, spec.output.lightPath);
	if (resolvePassedResumeJob({ spec, specDir, finalDark, finalLight })) return;

	const specSha256 = canonicalHash(spec);
	const jobPath = path.join(specDir, 'job.json');
	let existingFailedJob = null;
	if (existsSync(jobPath)) {
		existingFailedJob = readJson(jobPath, 'art generation job');
		validateFailedJobForResume({
			job: existingFailedJob,
			spec,
			specSha256,
			repairReviewSha256: null,
			repairPerceptualAuditSha256: null
		});
	}
	const specPath = path.join(specDir, 'spec.json');
	if (existsSync(specPath) && canonicalHash(readJson(specPath, 'stored art spec')) !== specSha256) {
		throw new ArtGenerationSafetyStop(
			`Stored art spec differs from the manifest for ${spec.id}; existing lineage will not be overwritten.`,
			{
				code: 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID',
				details: {
					artId: spec.id,
					nextAction: IMMUTABLE_LINEAGE_PREREQUISITE
				}
			}
		);
	}
	const protectedPaths = passedJobArtifactPaths({ specDir, rootDir });
	const history = inspectAttemptSlots({ specDir, maxAttempts: 4 });
	if (existingFailedJob && existingFailedJob.attempts.length > history.slots.size) {
		throw new ArtGenerationSafetyStop(
			`Failed job for ${spec.id} claims attempts whose immutable directories are missing.`,
			{
				code: 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID',
				details: {
					artId: spec.id,
					jobAttemptCount: existingFailedJob.attempts.length,
					directoryCount: history.slots.size,
					nextAction: IMMUTABLE_LINEAGE_PREREQUISITE
				}
			}
		);
	}
	const attempts = loadPriorAttemptFailures({
		spec,
		slots: history.slots,
		protectedPaths
	});
	if (
		existingFailedJob &&
		existingFailedJob.attempts.some(
			(attempt, index) => canonicalHash(attempt) !== canonicalHash(attempts[index])
		)
	) {
		throw new ArtGenerationSafetyStop(
			`Failed job for ${spec.id} differs from its immutable attempt evidence.`,
			{
				code: 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID',
				details: {
					artId: spec.id,
					nextAction: IMMUTABLE_LINEAGE_PREREQUISITE
				}
			}
		);
	}
}

function preflightFreshInvocation() {
	if (!repairEvidence) {
		if (args.resume) return;
		for (const spec of selected) {
			const specDir = path.join(workRoot, spec.id);
			if (!existsSync(specDir)) continue;
			prepareArtSpecDirectory({ workRoot, artId: spec.id });
			const consumed = readdirSync(specDir).filter(
				(name) => name === 'job.json' || /^attempt-\d{2}$/.test(name)
			);
			if (consumed.length) {
				throw new ArtGenerationSafetyStop(
					`Ordinary lineage for ${spec.id} already has immutable work and requires --resume.`,
					{
						code: 'SCIENCE_ART_RESUME_REQUIRED',
						details: {
							artId: spec.id,
							entries: consumed,
							nextAction:
								'Preserve the existing attempts and job, then rerun the summary action with --resume.'
						}
					}
				);
			}
		}
		return;
	}

	const repairEvidenceSha256 = canonicalHash(repairEvidence);
	const repairRunId = repairEvidenceSha256.slice(0, 12);
	for (const spec of manifest.specs) {
		const specDir = path.join(workRoot, spec.id);
		if (!existsSync(specDir)) continue;
		prepareArtSpecDirectory({ workRoot, artId: spec.id });
		const consumed = readdirSync(specDir).filter(
			(name) =>
				name === `repair-${repairRunId}-job.json` ||
				new RegExp(`^repair-${repairRunId}-attempt-\\d{2}$`).test(name)
		);
		if (!consumed.length) continue;
		prepareRepairLineageIdentity({
			specDir,
			repairRunId,
			repairEvidenceKind,
			repairEvidenceSha256
		});
		throw new ArtGenerationSafetyStop(
			`Repair evidence ${repairRunId} already has immutable work and cannot be resumed implicitly.`,
			{
				code: 'SCIENCE_ART_REPAIR_EVIDENCE_REFRESH_REQUIRED',
				details: {
					artId: spec.id,
					repairRunId,
					entries: consumed,
					nextAction: nextAction.instruction
				}
			}
		);
	}
	for (const spec of selected) {
		const specDir = prepareArtSpecDirectory({ workRoot, artId: spec.id });
		prepareRepairLineageIdentity({
			specDir,
			repairRunId,
			repairEvidenceKind,
			repairEvidenceSha256
		});
	}
}

function resolvePassedResumeJob({ spec, specDir, finalDark, finalLight }) {
	const candidates = [];
	for (const entry of readdirSync(specDir, { withFileTypes: true })) {
		if (!/^(?:job|repair-[a-f0-9]{12}-job)\.json$/.test(entry.name)) continue;
		if (!entry.isFile() || entry.isSymbolicLink?.()) {
			throw new ArtGenerationSafetyStop(
				`Canonical resume job is not a regular file for ${spec.id}: ${entry.name}`,
				{
					code: 'SCIENCE_ART_LINEAGE_INVALID',
					details: {
						artId: spec.id,
						job: entry.name,
						nextAction: IMMUTABLE_LINEAGE_PREREQUISITE
					}
				}
			);
		}
		const candidateJobPath = path.join(specDir, entry.name);
		const candidateJob = readJson(candidateJobPath, 'candidate resume job');
		if (candidateJob.status !== 'passed') continue;
		const candidateRepairEvidence = repairEvidenceForJob(candidateJobPath, workRoot);
		const expectedOutputs = {
			dark: {
				path: path.relative(rootDir, finalDark),
				sha256: candidateJob.outputs?.dark?.sha256,
				width: FINAL_WIDTH,
				height: FINAL_HEIGHT
			},
			light: {
				path: path.relative(rootDir, finalLight),
				sha256: candidateJob.outputs?.light?.sha256,
				width: FINAL_WIDTH,
				height: FINAL_HEIGHT
			}
		};
		requireResumeLineage({
			job: candidateJob,
			jobPath: candidateJobPath,
			spec,
			currentOutputs: expectedOutputs,
			resumeRepairEvidence: candidateRepairEvidence
		});
		candidates.push({
			job: candidateJob,
			jobPath: candidateJobPath,
			repairEvidence: candidateRepairEvidence,
			isRepair: candidateRepairEvidence !== null
		});
	}
	if (candidates.length === 0) return null;
	const actualOutputs =
		existsSync(finalDark) && existsSync(finalLight)
			? { dark: outputRecord(finalDark), light: outputRecord(finalLight) }
			: null;
	const repairCandidates = candidates.filter((candidate) => candidate.isRepair);
	const relevantCandidates = repairCandidates.length ? repairCandidates : candidates;
	const currentMatches = actualOutputs
		? relevantCandidates.filter(
				(candidate) => canonicalHash(candidate.job.outputs) === canonicalHash(actualOutputs)
			)
		: [];
	if (currentMatches.length === 1) return currentMatches[0];
	if (currentMatches.length > 1) {
		throw canonicalResumeStop(spec.id, 'Multiple passed jobs bind the same current final bytes.');
	}
	if (relevantCandidates.length === 1) {
		const onlyCandidate = relevantCandidates[0];
		const currentOrdinaryMatch =
			actualOutputs &&
			candidates.some(
				(candidate) =>
					!candidate.isRepair &&
					canonicalHash(candidate.job.outputs) === canonicalHash(actualOutputs)
			);
		if (!actualOutputs || currentOrdinaryMatch) return onlyCandidate;
	}
	throw canonicalResumeStop(
		spec.id,
		repairCandidates.length
			? 'Repaired finals are missing or differ, and multiple validated repair lineages prevent a safe implicit choice.'
			: 'Current finals differ from their validated ordinary job.'
	);
}

function canonicalResumeStop(artId, reason) {
	return new ArtGenerationSafetyStop(
		`Cannot resolve canonical resume lineage for ${artId}: ${reason}`,
		{
			code: 'SCIENCE_ART_LINEAGE_INVALID',
			details: {
				artId,
				nextAction:
					'Preserve every passed job and attempt; restore the uniquely canonical final pair before retrying --resume.'
			}
		}
	);
}

function resumePassedJob({
	job,
	jobPath,
	spec,
	finalDark,
	finalLight,
	resumeRepairEvidence = null
}) {
	const expectedClaimedOutputs = {
		dark: {
			path: path.relative(rootDir, finalDark),
			sha256: job.outputs?.dark?.sha256,
			width: FINAL_WIDTH,
			height: FINAL_HEIGHT
		},
		light: {
			path: path.relative(rootDir, finalLight),
			sha256: job.outputs?.light?.sha256,
			width: FINAL_WIDTH,
			height: FINAL_HEIGHT
		}
	};
	requireResumeLineage({
		job,
		jobPath,
		spec,
		currentOutputs: expectedClaimedOutputs,
		resumeRepairEvidence
	});
	let restored = false;
	const currentOutputs =
		existsSync(finalDark) && existsSync(finalLight)
			? { dark: outputRecord(finalDark), light: outputRecord(finalLight) }
			: null;
	if (!currentOutputs || canonicalHash(currentOutputs) !== canonicalHash(job.outputs)) {
		const darkSource = path.resolve(rootDir, job.artifacts.darkNormalized.path);
		const lightSource = path.resolve(rootDir, job.artifacts.lightNormalized.path);
		const jobText = readFileSync(jobPath, 'utf8');
		diskGuard.check({
			phase: 'before restoring a passed pair from full lineage',
			artId: spec.id,
			headroomBytes: publicationHeadroomBytes({
				darkSource,
				lightSource,
				finalDark,
				finalLight,
				jobPath,
				jobText
			})
		});
		const publication = publishArtPairAndJob({
			darkSource,
			lightSource,
			finalDark,
			finalLight,
			jobPath,
			jobText,
			validateCommitted() {
				const publishedJob = readJson(jobPath, 'restored art generation job');
				requireResumeLineage({
					job: publishedJob,
					jobPath,
					spec,
					currentOutputs: {
						dark: outputRecord(finalDark),
						light: outputRecord(finalLight)
					},
					resumeRepairEvidence
				});
			}
		});
		if (publication.action === 'committed-pending-cleanup') {
			resumableStop ??= diskGuard.stop(
				publicationCleanupStop(spec.id, jobPath, publication.warnings)
			);
		}
		restored = true;
	}
	const actualOutputs = {
		dark: outputRecord(finalDark),
		light: outputRecord(finalLight)
	};
	requireResumeLineage({
		job,
		jobPath,
		spec,
		currentOutputs: actualOutputs,
		resumeRepairEvidence
	});
	let safetyStop = null;
	try {
		diskGuard.check({ phase: 'after restoring/resuming a passed pair', artId: spec.id });
	} catch (error) {
		if (!isArtGenerationSafetyStop(error)) throw error;
		resumableStop ??= error;
		safetyStop = serializeArtGenerationSafetyStop(error);
	}
	return { outputs: actualOutputs, restored, safetyStop };
}

function requireResumeLineage({ job, jobPath, spec, currentOutputs, resumeRepairEvidence = null }) {
	try {
		return requireArtGenerationJobEvidence({
			job,
			jobPath,
			spec,
			manifest,
			currentOutputs,
			rootDir,
			repairEvidence: resumeRepairEvidence
		});
	} catch (error) {
		throw new ArtGenerationSafetyStop(
			`Resume lineage validation failed for ${spec.id}; no generation artifacts were pruned.`,
			{
				code: 'SCIENCE_ART_LINEAGE_INVALID',
				details: {
					artId: spec.id,
					jobPath,
					nextAction:
						'Restore the exact canonical job, artifacts and repair evidence, then retry --resume.'
				},
				cause: error
			}
		);
	}
}

function publicationCleanupStop(artId, jobPath, warnings = []) {
	return new ArtGenerationSafetyStop(
		`Published pair/job for ${artId} is valid, but transaction cleanup remains incomplete.`,
		{
			code: 'SCIENCE_ART_PUBLICATION_RECOVERY_FAILED',
			details: {
				artId,
				jobPath,
				warnings,
				nextAction:
					'Preserve the valid pair, job, journal and backups; rerun the prescribed workflow so lineage-aware recovery can finish cleanup.'
			}
		}
	);
}

function loadPriorAttemptFailures({ spec, slots, protectedPaths }) {
	return reconcileAttemptFailures({
		spec,
		slots,
		protectedPaths,
		rejectProtected: true,
		cleanupNextAction: FAILED_ATTEMPT_CLEANUP_PREREQUISITE
	});
}

function reconcileAttemptFailures({
	spec,
	slots,
	protectedPaths,
	rejectProtected,
	cleanupNextAction
}) {
	const failures = [];
	for (const [attempt, attemptDir] of [...slots.entries()].sort(
		([left], [right]) => left - right
	)) {
		const protectedAttemptArtifacts = [...protectedPaths].filter((filePath) =>
			filePath.startsWith(`${attemptDir}${path.sep}`)
		);
		if (protectedAttemptArtifacts.length) {
			if (rejectProtected) {
				throw new ArtGenerationSafetyStop(
					`Attempt ${attempt} for ${spec.id} belongs to a passed job and cannot be reused or pruned.`,
					{
						code: 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID',
						details: {
							artId: spec.id,
							attempt,
							protectedAttemptArtifacts,
							nextAction: IMMUTABLE_LINEAGE_PREREQUISITE
						}
					}
				);
			}
			continue;
		}
		const failurePath = path.join(attemptDir, 'failure.json');
		let existingFailure = null;
		if (existsSync(failurePath)) {
			existingFailure = readJson(failurePath, 'art attempt failure');
			if (existingFailure.attempt !== attempt || typeof existingFailure.error !== 'string') {
				throw new ArtGenerationSafetyStop(
					`Attempt ${attempt} for ${spec.id} has malformed failure evidence.`,
					{
						code: 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID',
						details: {
							artId: spec.id,
							attempt,
							nextAction: IMMUTABLE_LINEAGE_PREREQUISITE
						}
					}
				);
			}
		}
		failures.push(
			recordFailedAttempt({
				attemptDir,
				attempt,
				artId: spec.id,
				error:
					existingFailure?.error ??
					'The prior process ended before this immutable attempt recorded a terminal result.',
				existingFailure,
				protectedPaths,
				cleanupNextAction
			})
		);
	}
	return failures;
}

function recordFailedAttempt({
	attemptDir,
	attempt,
	artId,
	error,
	existingFailure = null,
	protectedPaths,
	cleanupNextAction = FAILED_ATTEMPT_CLEANUP_PREREQUISITE
}) {
	const retainedArtifacts = { ...(existingFailure?.retainedArtifacts ?? {}) };
	const evidenceIssues = [...(existingFailure?.evidenceIssues ?? [])];
	for (const [name, filePath] of [
		['darkPrompt', path.join(attemptDir, 'dark-prompt.txt')],
		['lightPrompt', path.join(attemptDir, 'light-prompt.txt')]
	]) {
		const recordedArtifact = existingFailure?.retainedArtifacts?.[name] ?? null;
		if (!existsSync(filePath)) {
			if (recordedArtifact) {
				evidenceIssues.push(`${path.basename(filePath)} is missing from immutable evidence.`);
			}
			continue;
		}
		try {
			const currentArtifact = artifactRecord(filePath);
			if (recordedArtifact && canonicalHash(recordedArtifact) !== canonicalHash(currentArtifact)) {
				evidenceIssues.push(
					`${path.basename(filePath)} differs from its immutable failure evidence.`
				);
			} else if (!recordedArtifact) {
				retainedArtifacts[name] = currentArtifact;
			}
		} catch (artifactError) {
			evidenceIssues.push(
				`${path.basename(filePath)} could not be hashed: ${
					artifactError instanceof Error ? artifactError.message : String(artifactError)
				}`
			);
		}
	}
	const inspection = inspectFailedAttemptImages(attemptDir, { protectedPaths });
	if (
		existingFailure?.imageCleanup?.status === 'passed' &&
		inspection.artifacts.length === 0 &&
		inspection.issues.length === 0 &&
		evidenceIssues.length === 0
	) {
		return existingFailure;
	}
	const discardedImageArtifacts = uniqueArtifactEvidence([
		...(existingFailure?.discardedImageArtifacts ?? []),
		...inspection.artifacts
	]);
	const failure = {
		...(existingFailure ?? {}),
		attempt,
		error: error instanceof Error ? error.message : String(error),
		finishedAt: existingFailure?.finishedAt ?? new Date().toISOString(),
		retainedArtifacts,
		discardedImageArtifacts,
		evidenceIssues,
		imageCleanup: {
			status: 'pending',
			removed: existingFailure?.imageCleanup?.removed ?? [],
			issues: inspection.issues
		}
	};
	const failurePath = path.join(attemptDir, 'failure.json');
	try {
		writeTextAtomically(failurePath, `${stableStringify(failure)}\n`);
	} catch (failureWriteError) {
		const evidenceStop = failedAttemptCleanupStop(
			[
				`failure.json could not record image hashes before cleanup: ${
					failureWriteError instanceof Error ? failureWriteError.message : String(failureWriteError)
				}`
			],
			{ artId, attempt, nextAction: cleanupNextAction }
		);
		diskGuard.stop(evidenceStop);
		throw evidenceStop;
	}
	const removal = removeInspectedFailedAttemptImages(attemptDir, inspection.artifacts, {
		protectedPaths
	});
	const cleanupIssues = [...evidenceIssues, ...inspection.issues, ...removal.issues];
	failure.imageCleanup = {
		status: cleanupIssues.length ? 'failed' : 'passed',
		removed: [...new Set([...(failure.imageCleanup.removed ?? []), ...removal.removed])],
		issues: cleanupIssues
	};
	try {
		writeTextAtomically(failurePath, `${stableStringify(failure)}\n`);
	} catch (failureWriteError) {
		const evidenceStop = failedAttemptCleanupStop(
			[
				`failure.json could not record the completed cleanup: ${
					failureWriteError instanceof Error ? failureWriteError.message : String(failureWriteError)
				}`
			],
			{ artId, attempt, nextAction: cleanupNextAction }
		);
		diskGuard.stop(evidenceStop);
		throw evidenceStop;
	}
	if (cleanupIssues.length) {
		const cleanupStop = failedAttemptCleanupStop(cleanupIssues, {
			artId,
			attempt,
			nextAction: cleanupNextAction
		});
		diskGuard.stop(cleanupStop);
		throw cleanupStop;
	}
	return failure;
}

function writeFailedJob({
	jobPath,
	spec,
	specSha256,
	repairReviewSha256,
	repairPerceptualAuditSha256,
	attempts
}) {
	const job = {
		schemaVersion: 'science-question-art-job/v1',
		id: spec.id,
		status: 'failed',
		imageModel: args.imageModel,
		specSha256,
		repairReviewSha256,
		repairPerceptualAuditSha256,
		attempts,
		finishedAt: new Date().toISOString()
	};
	writeTextAtomically(jobPath, `${stableStringify(job)}\n`);
	return { id: spec.id, status: 'failed', attempts };
}

function attemptDirectory(specDir, repairRunId, attempt) {
	const suffix = String(attempt).padStart(2, '0');
	return path.join(
		specDir,
		repairRunId ? `repair-${repairRunId}-attempt-${suffix}` : `attempt-${suffix}`
	);
}

function uniqueArtifactEvidence(artifacts) {
	return [
		...new Map(
			artifacts.map((artifact) => [`${String(artifact.name)}:${String(artifact.sha256)}`, artifact])
		).values()
	];
}

async function generateVariant(artId, theme, prompt, outputPath) {
	const images = await withTimeout((signal) =>
		generateImages({
			model: args.imageModel,
			stylePrompt: baseStylePrompt(theme),
			imagePrompts: [prompt],
			imageResolution: `${REQUEST_WIDTH}x${REQUEST_HEIGHT}`,
			imageQuality: 'high',
			outputFormat: 'webp',
			action: 'generate',
			numImages: 1,
			signal
		})
	);
	if (images.length !== 1) {
		throw new Error(`${titleCase(theme)} generation returned ${images.length} images.`);
	}
	diskGuard.check({
		phase: `before writing the returned ${theme} master`,
		artId,
		headroomBytes: BigInt(images[0].data.byteLength)
	});
	writeFileSync(outputPath, images[0].data);
	diskGuard.check({ phase: `after writing the returned ${theme} master`, artId });
}

function buildVariantPrompt(spec, repair, theme) {
	if (theme !== 'dark' && theme !== 'light') {
		throw new Error(`Unsupported art theme ${String(theme)}.`);
	}
	const questionSpecificAccuracyGuards = buildQuestionSpecificArtAccuracyGuards(spec);
	const repairGuidance = repair
		? repair.issues
				.filter((issue) => issue.severity === 'major')
				.map((issue) =>
					questionSpecificAccuracyGuards.length
						? `- VISIBLE DEFECT TO ELIMINATE: ${issue.description}`
						: `- VISIBLE DEFECT TO ELIMINATE: ${issue.description}\n  SUGGESTED CORRECTION: ${issue.regenerationInstruction}`
				)
				.join('\n')
		: '';
	const themeDirection =
		theme === 'dark'
			? 'Use a deep ink-navy background, warm cream and desaturated green accents, restrained soft glow and precise editorial studio lighting.'
			: 'Use a warm ivory paper-like background, ink-navy structure, restrained green accents, natural soft shadows and crisp high contrast.';
	return `Create one brand-new ${theme.toUpperCase()}-MODE 16:9 GCSE ${titleCase(spec.subject)} editorial illustration for this exact question context.

This is an independent fresh generation. No earlier image is attached or authoritative. Do not imitate, convert, edit, inpaint or preserve the geometry of any earlier variant. ${themeDirection}

AUTHORITATIVE LEARNER-FACING QUESTION (never typeset it unless exact notation is explicitly required below): ${spec.question}
SCENE: ${spec.scene}
WHOLE-IMAGE VISUAL ANCHOR: ${spec.visualAnchor}
APPROVED VISIBLE MEANING: ${spec.approvedMeaning}

The learner-facing question is authoritative. The scene and constraints are implementation guidance only. Before generating, verify that every variable, allele letter and case, genotype, chemical formula, unit, object count, direction, sample label, material and apparatus state agrees with the question. If any brief line conflicts, follow the question and do not reproduce the contradiction. Never substitute a conventional example such as A/a for the question's R/r, P/p or F/f notation.

SCIENTIFIC ACCURACY CONSTRAINTS
${[...spec.accuracyConstraints, ...questionSpecificAccuracyGuards]
	.map((item) => `- ${item}`)
	.join('\n')}
- Trace every visible wire, tube, beam, hose, collection path and mechanical connection to its literal endpoint. Do not rely on an implied hidden connection to rescue an open circuit, leaking gas path, blocked detector path or impossible apparatus.
- If an inverted gas-collection tube is shown, its open mouth must be visibly submerged and aligned directly above the gas source or electrode; never draw a sealed rounded end where the collection opening must be.
- Obey exact task-state words. "Sealed" means visibly closed; one named sample/plate/object means exactly one; objects described as identical must visibly match in size, shape and material and be arranged clearly enough to compare; a gas particle model must remain widely dispersed rather than close-packed; separate procedures or locations must not be fused into one simultaneous or physically tethered setup.
- If the question says a gas sample is contained or retained, use a scientifically plausible vessel state and orientation for that named gas. Never leave a less-dense-than-air sample such as possible hydrogen in an open, mouth-up tube merely because a conflicting brief requests it.
- Preserve every question-defining colour and material in both themes: black lava remains visibly black or dark charcoal, a named indicator/flame/object colour remains recognisable, and transparent/opaque states do not swap.
- Do not translate question-given measurements, percentages or rankings into countable blocks, bars, lengths, scales, marker rows or proportional spacing. Generated art is not a quantitative diagram; keep the supplied values in learner-facing text and use a neutral contextual scene.
- If the learner is asked to supply differences, controls, a method, a sequence, a probability, a mechanism or an explanation, stop before the missing answer-bearing step. Show only the neutral starting context already given in the question.
- Include every person, team, patient, driver, operator or other essential actor explicitly named by the question. Keep sources, specimens, sensors, detectors, meters and targets on the physically correct sides of any barrier, body part or tested material.

FORBIDDEN DETAILS
${spec.forbiddenDetails.map((item) => `- ${item}`).join('\n')}
- No answer, result, worked method, conclusion, equation, numerical value, choice marker, label, caption, title, paragraph, logo, watermark or exam-board branding.
- No decorative object that implies a different experiment or mechanism.

Make the composition unmistakably specific to this scenario and distinct from every generic topic collage. Keep all important objects inside a generous mobile-safe central area. One coherent scene, clean hierarchy, tactile physical models/apparatus, accurate counts and connections, editorial studio lighting.${
		repair
			? `\n\nA RELEASE QUALITY GATE REJECTED THE PREVIOUS PAIR\n${repairGuidance}\nGenerate a genuinely fresh composition from the authoritative question and corrected brief. When question-specific guards are present above, they are the complete replacement recipe; the rejected review's suggested correction is intentionally omitted so it cannot reintroduce brittle or conflicting geometry. The rejected images are not edit targets or composition references. Do not preserve their geometry, layout or mistakes.`
			: ''
	}

FINAL PRE-RENDER CHECK
The learner-facing question and every scientific guard above override a conflicting scene line or defect-focused regeneration instruction. Treat a regeneration instruction as a diagnosis of what failed, not permission to render brittle counted notation, answer leakage or an apparatus state forbidden above.`;
}

function buildQuestionSpecificArtAccuracyGuards(spec) {
	const guards = spec.generationGuards ?? [];
	if (
		!Array.isArray(guards) ||
		guards.some((guard) => typeof guard !== 'string' || !guard.trim())
	) {
		throw new Error(`${spec.id} has invalid D1-backed generation guards.`);
	}
	return [...guards];
}

function baseStylePrompt(theme) {
	return theme === 'dark'
		? 'Polished tactile editorial science still life for a premium GCSE learning app. Deep ink-navy background, warm cream and desaturated green accents, subtle grid texture, crisp accurate objects, restrained soft glow, museum-model materiality, generous negative space, no rounded UI cards, no visible prose.'
		: 'Polished tactile editorial science still life for a premium GCSE learning app. Warm ivory background, ink-navy structure, restrained green accent, subtle paper texture, natural soft shadows, precise scientific objects, generous negative space, no rounded UI cards, no visible prose.';
}

async function normalizeWebp(input, output, artId, theme) {
	const releaseReservation = diskGuard.reserve({
		phase: `before ${theme} normalization`,
		artId,
		bytes: NORMALIZATION_HEADROOM_BYTES
	});
	try {
		await execFileAsync(
			'magick',
			[
				input,
				'-auto-orient',
				'-resize',
				`${FINAL_WIDTH}x${FINAL_HEIGHT}^`,
				'-gravity',
				'center',
				'-extent',
				`${FINAL_WIDTH}x${FINAL_HEIGHT}`,
				'-alpha',
				'remove',
				'-quality',
				'78',
				output
			],
			{ signal: diskGuard.signal }
		);
		diskGuard.check({ phase: `after ${theme} normalization`, artId });
	} finally {
		releaseReservation();
	}
}

async function imageCheck(filePath, expectedWidth, expectedHeight, artId) {
	const issues = [];
	if (!existsSync(filePath)) return { status: 'failed', issues: ['File is missing.'] };
	const { stdout } = await execFileAsync(
		'identify',
		['-format', '%m|%w|%h|%[channels]|%[entropy]|%b', filePath],
		{ signal: diskGuard.signal }
	);
	diskGuard.check({ phase: `after validating ${path.basename(filePath)}`, artId });
	const [format, width, height, channels, entropy, bytes] = stdout.trim().split('|');
	if (format !== 'WEBP') issues.push(`Expected WEBP, found ${format}.`);
	if (Number(width) !== expectedWidth || Number(height) !== expectedHeight) {
		issues.push(`Expected ${expectedWidth}x${expectedHeight}, found ${width}x${height}.`);
	}
	if (/a/i.test(channels)) issues.push(`Image must be opaque; channels are ${channels}.`);
	if (Number(entropy) < 0.25) issues.push(`Image entropy ${entropy} is implausibly low.`);
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		format,
		width: Number(width),
		height: Number(height),
		channels,
		entropy: Number(entropy),
		bytes,
		sha256: sha256(readFileSync(filePath))
	};
}

function validatePair(darkPath, lightPath, darkCheck, lightCheck) {
	const issues = [...darkCheck.issues, ...lightCheck.issues];
	const darkHash = sha256(readFileSync(darkPath));
	const lightHash = sha256(readFileSync(lightPath));
	if (darkHash === lightHash) issues.push('Light and dark outputs are byte-identical.');
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		darkSha256: darkHash,
		lightSha256: lightHash,
		width: FINAL_WIDTH,
		height: FINAL_HEIGHT
	};
}

function outputRecord(filePath) {
	return {
		path: path.relative(rootDir, filePath),
		sha256: sha256(readFileSync(filePath)),
		width: FINAL_WIDTH,
		height: FINAL_HEIGHT
	};
}

function outputRecordFromSource(sourcePath, destinationPath) {
	return {
		path: path.relative(rootDir, destinationPath),
		sha256: sha256(readFileSync(sourcePath)),
		width: FINAL_WIDTH,
		height: FINAL_HEIGHT
	};
}

function artifactRecord(filePath) {
	const bytes = readFileSync(filePath);
	return {
		path: path.relative(rootDir, filePath),
		sha256: sha256(bytes),
		size: bytes.byteLength
	};
}

function validateManifest(manifest, requireCount) {
	const validation = validateQuestionArtManifest(manifest, {
		expectedCount: requireCount ?? undefined
	});
	if (validation.status !== 'passed') {
		throw new Error(`Art manifest validation failed:\n${validation.issues.join('\n')}`);
	}
}

function readAndValidateRepairReview(relativePath, artManifest) {
	const reviewPath = path.resolve(rootDir, relativePath);
	assertIgnoredWorkspacePath(reviewPath, 'Art review');
	if (!existsSync(reviewPath)) throw new Error(`Art review does not exist: ${reviewPath}`);
	const input = JSON.parse(readFileSync(reviewPath, 'utf8'));
	let sourceReview = input;
	let review = input;
	if (input.schemaVersion === SCIENCE_QUESTION_ART_REVIEW_ADJUDICATION_SCHEMA) {
		if (
			typeof input.sourceReviewPath !== 'string' ||
			path.isAbsolute(input.sourceReviewPath) ||
			input.sourceReviewPath.includes('\\')
		) {
			throw new Error('Art review adjudication sourceReviewPath must be repo-relative.');
		}
		const sourceReviewPath = path.resolve(rootDir, input.sourceReviewPath);
		assertIgnoredWorkspacePath(sourceReviewPath, 'Adjudication source review');
		if (
			sourceReviewPath === rootDir ||
			!sourceReviewPath.startsWith(`${rootDir}${path.sep}`) ||
			!existsSync(sourceReviewPath) ||
			!lstatSync(sourceReviewPath).isFile() ||
			lstatSync(sourceReviewPath).isSymbolicLink()
		) {
			throw new Error('Art review adjudication sourceReviewPath is not a safe regular file.');
		}
		sourceReview = JSON.parse(readFileSync(sourceReviewPath, 'utf8'));
		review = buildAdjudicatedArtReview({
			sourceReview,
			adjudication: input
		});
	}
	const issues = [];
	const rawEvidence = requireArtReviewEvidence({
		review: sourceReview,
		reviewPath,
		manifest: artManifest,
		rootDir,
		requiredStatus: 'failed'
	});
	issues.push(...rawEvidence.issues.map((issue) => `Raw art-review evidence: ${issue}`));
	if (review.schemaVersion !== SCIENCE_QUESTION_ART_REVIEW_SCHEMA) {
		issues.push('schemaVersion is not a science question art review summary.');
	}
	if (review.manifestSha256 !== canonicalHash(artManifest)) {
		issues.push('The review was produced from a different art manifest.');
	}
	if (
		review.selectedCount !== artManifest.specs.length ||
		review.missingCount !== 0 ||
		review.invalidBatchCount !== 0 ||
		!Array.isArray(review.reviews) ||
		review.reviews.length !== artManifest.specs.length
	) {
		issues.push('The repair source must be a complete, structurally valid full-manifest review.');
	}
	const currentInventory = [];
	for (const spec of artManifest.specs) {
		const darkPath = path.resolve(rootDir, spec.output.darkPath);
		const lightPath = path.resolve(rootDir, spec.output.lightPath);
		if (!existsSync(darkPath) || !existsSync(lightPath)) {
			issues.push(`Current image pair is incomplete for ${spec.id}.`);
			continue;
		}
		currentInventory.push({
			id: spec.id,
			darkSha256: sha256(readFileSync(darkPath)),
			lightSha256: sha256(readFileSync(lightPath))
		});
	}
	if (review.assetInventorySha256 !== canonicalHash(currentInventory)) {
		issues.push('The review does not bind the current illustration bytes.');
	}
	const reviewsById = new Map();
	for (const item of Array.isArray(review.reviews) ? review.reviews : []) {
		if (reviewsById.has(item.id)) issues.push(`The review duplicates ${item.id}.`);
		const rowValidation = validateIndependentArtReviewRow(item);
		for (const issue of rowValidation.issues) issues.push(`${item.id}: ${issue}`);
		reviewsById.set(item.id, item);
	}
	for (const spec of artManifest.specs) {
		if (!reviewsById.has(spec.id)) issues.push(`The review is missing ${spec.id}.`);
	}
	const rejected = [...reviewsById.values()].filter(
		(item) => item.accepted === false && item.disposition === 'fresh-regenerate'
	);
	if (rejected.length === 0) issues.push('The review contains no rejected pairs.');
	if (
		review.status !== 'failed' ||
		review.rejectedCount !== rejected.length ||
		review.acceptedCount + review.rejectedCount !== artManifest.specs.length
	) {
		issues.push('Review status and accepted/rejected counts are inconsistent.');
	}
	for (const item of rejected) {
		const majorIssues = Array.isArray(item.issues)
			? item.issues.filter((issue) => issue.severity === 'major')
			: [];
		if (
			majorIssues.length === 0 ||
			majorIssues.some(
				(issue) =>
					typeof issue?.regenerationInstruction !== 'string' ||
					!issue.regenerationInstruction.trim()
			)
		) {
			issues.push(`${item.id} has no usable regeneration instructions.`);
		}
	}
	if (issues.length) throw new Error(`Invalid repair review:\n${issues.join('\n')}`);
	return review;
}

function readAndValidatePerceptualRepair(relativePath, artManifest) {
	const auditPath = path.resolve(rootDir, relativePath);
	assertIgnoredWorkspacePath(auditPath, 'Perceptual audit');
	if (!existsSync(auditPath)) throw new Error(`Perceptual audit does not exist: ${auditPath}`);
	const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
	const currentInventory = [];
	const issues = [];
	for (const spec of artManifest.specs) {
		const darkPath = path.resolve(rootDir, spec.output.darkPath);
		const lightPath = path.resolve(rootDir, spec.output.lightPath);
		if (!existsSync(darkPath) || !existsSync(lightPath)) {
			issues.push(`Current image pair is incomplete for ${spec.id}.`);
			continue;
		}
		currentInventory.push({
			id: spec.id,
			darkSha256: sha256(readFileSync(darkPath)),
			lightSha256: sha256(readFileSync(lightPath))
		});
	}
	const validation = validatePerceptualAudit(audit, {
		manifest: artManifest,
		assetInventory: currentInventory,
		expectedRecordCount: artManifest.specs.length * 2,
		requireNoCollisions: false
	});
	issues.push(...validation.issues);
	if (audit.status !== 'failed' || audit.collisionCount < 1) {
		issues.push('The perceptual repair source must contain at least one validated collision.');
	}
	const knownIds = new Set(artManifest.specs.map((spec) => spec.id));
	for (const collision of Array.isArray(audit.collisions) ? audit.collisions : []) {
		if (!knownIds.has(collision.leftId) || !knownIds.has(collision.rightId)) {
			issues.push('The perceptual audit contains an unknown art id.');
		}
	}
	if (issues.length) throw new Error(`Invalid perceptual repair audit:\n${issues.join('\n')}`);
	const selectedIds = selectPerceptualRepairCover(audit.collisions, artManifest.specs);
	const repairRows = selectedIds.map((id) => {
		const collisions = audit.collisions.filter(
			(collision) => collision.leftId === id || collision.rightId === id
		);
		const otherIds = [
			...new Set(
				collisions.map((collision) =>
					collision.leftId === id ? collision.rightId : collision.leftId
				)
			)
		];
		const themes = [
			...new Set(collisions.flatMap((collision) => [collision.leftTheme, collision.rightTheme]))
		];
		return {
			id,
			accepted: false,
			issues: [
				{
					category: 'duplication',
					description: `The ${themes.join(' and ')} composition is perceptually too close to ${otherIds.join(', ')}.`,
					regenerationInstruction:
						'Use a materially different camera angle, object arrangement, silhouette, scale hierarchy and negative-space pattern while preserving the exact question-specific science and all accuracy constraints.'
				}
			]
		};
	});
	return { audit, repairRows };
}

function selectPerceptualRepairCover(collisions, specs) {
	const order = new Map(specs.map((spec, index) => [spec.id, index]));
	let edges = [
		...new Map(
			collisions.map((collision) => {
				const pair = [collision.leftId, collision.rightId].sort();
				return [pair.join(':'), pair];
			})
		).values()
	];
	const selected = [];
	while (edges.length) {
		const degree = new Map();
		for (const [left, right] of edges) {
			degree.set(left, (degree.get(left) ?? 0) + 1);
			degree.set(right, (degree.get(right) ?? 0) + 1);
		}
		const victim = [...degree.keys()].sort((left, right) => {
			const countDifference = degree.get(right) - degree.get(left);
			if (countDifference) return countDifference;
			return (order.get(right) ?? 0) - (order.get(left) ?? 0);
		})[0];
		selected.push(victim);
		edges = edges.filter(([left, right]) => left !== victim && right !== victim);
	}
	return selected;
}

function selectSpecs(specs, ids, limit) {
	let selected = ids.length ? specs.filter((spec) => ids.includes(spec.id)) : [...specs];
	for (const id of ids)
		if (!specs.some((spec) => spec.id === id)) throw new Error(`Unknown art id ${id}.`);
	if (limit !== null) selected = selected.slice(0, limit);
	return selected;
}

function generationSafetyNextAction(repairKind, parsedArgs) {
	const requiredCount = parsedArgs.requireCount ?? manifest.specs.length;
	const sharedGenerationArguments = [
		`--manifest=${parsedArgs.manifest}`,
		`--work-root=${parsedArgs.workRoot}`,
		`--require-count=${requiredCount}`,
		`--concurrency=${parsedArgs.concurrency}`,
		`--max-attempts=${parsedArgs.maxAttempts}`,
		`--min-free-space-gib=${parsedArgs.minFreeSpaceGiB}`,
		`--timeout-ms=${parsedArgs.timeoutMs}`
	];
	const ordinaryGenerationArguments = [
		...sharedGenerationArguments,
		...parsedArgs.ids.map((id) => `--id=${id}`),
		...(parsedArgs.limit === null ? [] : [`--limit=${parsedArgs.limit}`])
	];
	const command = (script, commandArgs, extra = {}) => ({
		command: 'pnpm',
		args: ['run', script, '--', ...commandArgs],
		...extra
	});
	if (!repairKind) {
		return {
			kind: 'resume',
			instruction:
				'Resolve the recorded safety prerequisite, then rerun this ordinary generation lineage with --resume.',
			actions: [
				command('generate:science-question-art', [...ordinaryGenerationArguments, '--resume'])
			]
		};
	}
	const reviewOutputRoot =
		repairKind === 'independent-review'
			? path.dirname(parsedArgs.repairReview)
			: path.dirname(parsedArgs.repairPerceptualAudit);
	const reviewSummaryPath = path.join(reviewOutputRoot, 'review-summary.json');
	const evidenceRefreshActions = [
		command('review:science-question-art', [
			`--manifest=${parsedArgs.manifest}`,
			`--output-root=${reviewOutputRoot}`,
			`--require-count=${requiredCount}`,
			'--resume'
		])
	];
	if (repairKind === 'independent-review') {
		evidenceRefreshActions.push(
			command(
				'generate:science-question-art',
				[...sharedGenerationArguments, `--repair-review=${reviewSummaryPath}`, '--replace-output'],
				{ when: 'the refreshed complete review still has rejected pairs' }
			)
		);
		return {
			kind: 'refresh-review-before-repair',
			instruction:
				'Do not use --resume or the stale repair bytes. Free the reserve, refresh the complete independent review, then start a new hash-bound repair only if it still rejects pairs.',
			actions: evidenceRefreshActions
		};
	}
	evidenceRefreshActions.push(
		command(
			'generate:science-question-art',
			[...sharedGenerationArguments, `--repair-review=${reviewSummaryPath}`, '--replace-output'],
			{
				when: 'the refreshed complete independent review has rejected pairs',
				then: 'repeat the independent review before running the perceptual audit'
			}
		),
		command(
			'audit:science-question-art-perceptual',
			[
				`--manifest=${parsedArgs.manifest}`,
				`--output=${parsedArgs.repairPerceptualAudit}`,
				`--require-count=${requiredCount}`
			],
			{
				when: 'the refreshed complete independent review passes'
			}
		),
		command(
			'generate:science-question-art',
			[
				...sharedGenerationArguments,
				`--repair-perceptual-audit=${parsedArgs.repairPerceptualAudit}`,
				'--replace-output'
			],
			{
				when: 'the refreshed independent review is acceptable and the refreshed audit still reports collisions'
			}
		)
	);
	return {
		kind: 'refresh-review-and-audit-before-repair',
		instruction:
			'Do not use --resume or the stale audit. Free the reserve, refresh the complete independent review and perceptual audit, then start a new hash-bound repair only from newly rejected evidence.',
		actions: evidenceRefreshActions
	};
}

function validateManifestOutputDestinations(artManifest) {
	for (const spec of artManifest.specs) {
		for (const theme of ['dark', 'light']) {
			const destination = path.resolve(rootDir, spec.output[`${theme}Path`]);
			assertIgnoredWorkspacePath(destination, `Output for ${spec.id}`);
			if (destination === rootDir || !destination.startsWith(`${rootDir}${path.sep}`)) {
				throw outputPathStop(spec.id, destination, 'is outside the workspace');
			}
			const relativeParent = path.relative(rootDir, path.dirname(destination));
			let current = rootDir;
			for (const component of relativeParent.split(path.sep).filter(Boolean)) {
				current = path.join(current, component);
				if (!existsSync(current)) break;
				const stats = lstatSync(current);
				if (!stats.isDirectory() || stats.isSymbolicLink()) {
					throw outputPathStop(
						spec.id,
						destination,
						`traverses non-directory or symbolic-link component ${current}`
					);
				}
			}
			if (existsSync(destination)) {
				const stats = lstatSync(destination);
				if (!stats.isFile() || stats.isSymbolicLink()) {
					throw outputPathStop(spec.id, destination, 'is not a regular file');
				}
			}
		}
	}
}

function assertIgnoredWorkspacePath(targetPath, label) {
	const ignoredRoot = path.resolve(rootDir, 'tmp');
	const relativePath = path.relative(ignoredRoot, targetPath);
	if (!existsSync(path.join(rootDir, '.git'))) {
		const relativeToFixtureRoot = path.relative(rootDir, targetPath);
		if (
			relativeToFixtureRoot &&
			!relativeToFixtureRoot.startsWith(`..${path.sep}`) &&
			!path.isAbsolute(relativeToFixtureRoot)
		) {
			return;
		}
	}
	if (!relativePath || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
		throw new Error(`${label} must be under ignored tmp/.`);
	}
}

function outputPathStop(artId, destination, reason) {
	return new ArtGenerationSafetyStop(
		`Unsafe output destination for ${artId}: ${destination} ${reason}.`,
		{
			code: 'SCIENCE_ART_OUTPUT_PATH_INVALID',
			details: {
				artId,
				destination,
				nextAction: 'Restore the canonical real output directory and regular files before retrying.'
			}
		}
	);
}

function recoverAllArtPublications(artManifest, generationRoot) {
	for (const spec of artManifest.specs) {
		const specDir = path.join(generationRoot, spec.id);
		if (!existsSync(specDir)) continue;
		prepareArtSpecDirectory({ workRoot: generationRoot, artId: spec.id });
		const entries = readdirSync(specDir, { withFileTypes: true });
		const journalNames = entries
			.filter((entry) => entry.name.endsWith('.publication.json'))
			.map((entry) => entry.name);
		for (const name of journalNames) {
			if (!/^(?:job|repair-[a-f0-9]{12}-job)\.json\.publication\.json$/.test(name)) {
				throw new ArtGenerationSafetyStop(
					`Unknown art publication journal blocks recovery for ${spec.id}: ${name}`,
					{
						code: 'SCIENCE_ART_PUBLICATION_RECOVERY_FAILED',
						details: {
							artId: spec.id,
							nextAction:
								'Inspect the unknown journal without deleting or regenerating accepted art.'
						}
					}
				);
			}
		}
		if (journalNames.length > 1) {
			throw new ArtGenerationSafetyStop(
				`Multiple publication journals make recovery ambiguous for ${spec.id}.`,
				{
					code: 'SCIENCE_ART_PUBLICATION_RECOVERY_FAILED',
					details: {
						artId: spec.id,
						journals: journalNames,
						nextAction:
							'Inspect both transactions and preserve every backup before choosing a recovery.'
					}
				}
			);
		}
		const jobNames = new Set(['job.json']);
		for (const entry of entries) {
			const match = entry.name.match(
				/^(repair-[a-f0-9]{12}-job\.json)(?:$|\.publication\.json$|\.qc-art-[a-f0-9-]+\.(?:candidate|backup)$|\.tmp-\d+(?:-[a-f0-9-]+)?$)$/
			);
			if (match) jobNames.add(match[1]);
		}
		const finalDark = path.resolve(rootDir, spec.output.darkPath);
		const finalLight = path.resolve(rootDir, spec.output.lightPath);
		for (const jobName of jobNames) {
			const repairMatch = jobName.match(/^repair-([a-f0-9]{12})-job\.json$/);
			if (repairMatch) {
				readRepairLineageIdentity({ specDir, repairRunId: repairMatch[1] });
			}
		}
		recoverArtPublicationsForSpec({
			jobPaths: [...jobNames].map((jobName) => path.join(specDir, jobName)),
			finalDark,
			finalLight,
			beforeRecover(jobPath) {
				diskGuard.check({
					phase: `before recovering ${path.basename(jobPath)}`,
					artId: spec.id,
					headroomBytes: publicationRecoveryHeadroomBytes({
						jobPath,
						finalDark,
						finalLight
					})
				});
			},
			afterRecover(jobPath) {
				diskGuard.check({
					phase: `after recovering ${path.basename(jobPath)}`,
					artId: spec.id
				});
			},
			validateCommitted(jobPath) {
				validateRecoveredPublication({
					jobPath,
					spec,
					finalDark,
					finalLight,
					generationRoot
				});
			}
		});
	}
}

function reconcileAllFailedAttemptCleanup(artManifest, generationRoot) {
	for (const spec of artManifest.specs) {
		const specDir = path.join(generationRoot, spec.id);
		if (!existsSync(specDir)) continue;
		prepareArtSpecDirectory({ workRoot: generationRoot, artId: spec.id });
		const protectedPaths = passedJobArtifactPaths({ specDir, rootDir });
		reconcileAttemptFailures({
			spec,
			slots: inspectAttemptSlots({ specDir, maxAttempts: 4 }).slots,
			protectedPaths,
			rejectProtected: false,
			cleanupNextAction: FAILED_ATTEMPT_CLEANUP_PREREQUISITE
		});
		const repairRunIds = new Set();
		for (const entry of readdirSync(specDir, { withFileTypes: true })) {
			if (!entry.name.startsWith('repair-') || !entry.name.includes('-attempt-')) continue;
			const match = entry.name.match(/^repair-([a-f0-9]{12})-attempt-\d{2}$/);
			if (!match || !entry.isDirectory() || entry.isSymbolicLink?.()) {
				throw new ArtGenerationSafetyStop(
					`Malformed historical repair attempt blocks cleanup for ${spec.id}: ${entry.name}`,
					{
						code: 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID',
						details: {
							artId: spec.id,
							entry: entry.name,
							nextAction: IMMUTABLE_LINEAGE_PREREQUISITE
						}
					}
				);
			}
			repairRunIds.add(match[1]);
		}
		for (const repairRunId of repairRunIds) {
			readRepairLineageIdentity({ specDir, repairRunId });
			reconcileAttemptFailures({
				spec,
				slots: inspectAttemptSlots({
					specDir,
					repairRunId,
					maxAttempts: 4
				}).slots,
				protectedPaths,
				rejectProtected: false,
				cleanupNextAction: FAILED_ATTEMPT_CLEANUP_PREREQUISITE
			});
		}
	}
}

function validateRecoveredPublication({ jobPath, spec, finalDark, finalLight, generationRoot }) {
	const job = readJson(jobPath, 'recovered art generation job');
	const recoveredRepairEvidence = repairEvidenceForJob(jobPath, generationRoot);
	requireArtGenerationJobEvidence({
		job,
		jobPath,
		spec,
		manifest,
		currentOutputs: {
			dark: outputRecord(finalDark),
			light: outputRecord(finalLight)
		},
		rootDir,
		repairEvidence: recoveredRepairEvidence
	});
}

function repairEvidenceForJob(jobPath, generationRoot) {
	const repairMatch = path.basename(jobPath).match(/^repair-([a-f0-9]{12})-job\.json$/);
	if (!repairMatch) return null;
	const identity = readRepairLineageIdentity({
		specDir: path.dirname(jobPath),
		repairRunId: repairMatch[1]
	});
	const evidencePath = path.join(
		generationRoot,
		`repair-evidence-${identity.repairEvidenceSha256}.json`
	);
	const evidence = readJson(evidencePath, 'recovered repair evidence');
	if (canonicalHash(evidence) !== identity.repairEvidenceSha256) {
		throw new Error('Recovered repair evidence differs from its full-hash identity.');
	}
	return evidence;
}

function readJson(filePath, label) {
	try {
		const stats = lstatSync(filePath);
		if (!stats.isFile() || stats.isSymbolicLink()) {
			throw new Error('it is not a regular file');
		}
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch (error) {
		throw new ArtGenerationSafetyStop(`Could not read ${label} at ${filePath}.`, {
			code: 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID',
			details: {
				filePath,
				nextAction: 'Inspect and restore the immutable evidence file before continuing.'
			},
			cause: error
		});
	}
}

function validateFailedJobForResume({
	job,
	spec,
	specSha256,
	repairReviewSha256,
	repairPerceptualAuditSha256
}) {
	const attempts = Array.isArray(job?.attempts) ? job.attempts : null;
	const validAttempts =
		attempts &&
		attempts.length <= 4 &&
		attempts.every(
			(attempt, index) =>
				attempt?.attempt === index + 1 &&
				typeof attempt.error === 'string' &&
				attempt.error.length > 0
		);
	if (
		job?.schemaVersion !== 'science-question-art-job/v1' ||
		job.id !== spec.id ||
		job.status !== 'failed' ||
		job.imageModel !== IMAGE_MODEL ||
		job.specSha256 !== specSha256 ||
		job.repairReviewSha256 !== repairReviewSha256 ||
		job.repairPerceptualAuditSha256 !== repairPerceptualAuditSha256 ||
		!validAttempts
	) {
		throw new ArtGenerationSafetyStop(
			`Failed art job for ${spec.id} does not bind this exact immutable attempt lineage.`,
			{
				code: 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID',
				details: {
					artId: spec.id,
					nextAction: 'Inspect the failed job and attempt directories; do not reuse them.'
				}
			}
		);
	}
}

function ordinaryReplacementWouldMutateEvidence(spec, generationRoot) {
	const finalDark = path.resolve(rootDir, spec.output.darkPath);
	const finalLight = path.resolve(rootDir, spec.output.lightPath);
	if (existsSync(finalDark) || existsSync(finalLight)) return true;
	const specDir = path.join(generationRoot, spec.id);
	if (!existsSync(specDir)) return false;
	try {
		const stats = lstatSync(specDir);
		if (!stats.isDirectory() || stats.isSymbolicLink()) return true;
		return readdirSync(specDir).some(
			(name) =>
				name === 'job.json' ||
				name === 'spec.json' ||
				name.startsWith('attempt-') ||
				name.startsWith('repair-')
		);
	} catch {
		return true;
	}
}

function exitBeforeGeneration(error) {
	const serialized = serializeArtGenerationSafetyStop(error);
	const summary = {
		schemaVersion: 'science-question-art-generation-summary/v1',
		releaseId: manifest.releaseId,
		status: 'failed-resumable',
		imageModel: args.imageModel,
		startedAt: null,
		finishedAt: new Date().toISOString(),
		selectedCount: null,
		scheduledCount: 0,
		passedCount: 0,
		failedCount: 0,
		notStartedCount: null,
		minFreeSpaceGiB: args.minFreeSpaceGiB,
		resumableFailure: serialized,
		nextAction: {
			...nextAction,
			prerequisite: serialized?.nextAction ?? null
		},
		results: []
	};
	console.log(JSON.stringify(summary, null, 2));
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

async function withTimeout(callback) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), args.timeoutMs);
	try {
		return await callback(AbortSignal.any([controller.signal, diskGuard.signal]));
	} finally {
		clearTimeout(timer);
	}
}

function parseArgs(argv) {
	const values = new Map();
	const ids = [];
	const booleanOptions = new Set(['help', 'resume', 'replace-output', 'dry-run']);
	const valueOptions = new Set([
		'manifest',
		'work-root',
		'repair-review',
		'repair-perceptual-audit',
		'image-model',
		'concurrency',
		'max-attempts',
		'min-free-space-gib',
		'timeout-ms',
		'require-count',
		'limit'
	]);
	for (const arg of argv) {
		if (arg === '-h') {
			if (values.has('help')) throw new Error('Duplicate option --help.');
			values.set('help', true);
		} else if (/^--(?:help|resume|replace-output|dry-run)$/.test(arg)) {
			const key = arg.slice(2);
			if (values.has(key)) throw new Error(`Duplicate option --${key}.`);
			values.set(key, true);
		} else if (arg.startsWith('--') && arg.includes('=')) {
			const [key, ...rest] = arg.slice(2).split('=');
			const value = rest.join('=');
			if (booleanOptions.has(key)) {
				throw new Error(`Boolean option --${key} does not accept a value.`);
			}
			if (key === 'id') {
				if (!value) throw new Error('--id requires a non-empty =value.');
				ids.push(value);
				continue;
			}
			if (!valueOptions.has(key)) throw new Error(`Unknown option --${key}.`);
			if (!value) throw new Error(`--${key} requires a non-empty =value.`);
			if (values.has(key)) throw new Error(`Duplicate option --${key}.`);
			values.set(key, value);
		} else if (arg.startsWith('--')) {
			const key = arg.slice(2);
			if (valueOptions.has(key) || key === 'id') {
				throw new Error(`--${key} requires the documented --${key}=<value> form.`);
			}
			throw new Error(`Unknown option ${arg}.`);
		} else {
			throw new Error(`Unexpected positional argument ${arg}.`);
		}
	}
	return {
		help: Boolean(values.get('help')),
		resume: Boolean(values.get('resume')),
		replaceOutput: Boolean(values.get('replace-output')),
		dryRun: Boolean(values.get('dry-run')),
		ids,
		manifest: String(
			values.get('manifest') ??
				'tmp/science-challenges/candidate-release/compiled/art-manifest.json'
		),
		workRoot: String(
			values.get('work-root') ?? 'tmp/science-challenges/candidate-release/art-generation'
		),
		repairReview: values.has('repair-review') ? String(values.get('repair-review')) : null,
		repairPerceptualAudit: values.has('repair-perceptual-audit')
			? String(values.get('repair-perceptual-audit'))
			: null,
		imageModel: String(values.get('image-model') ?? IMAGE_MODEL),
		concurrency: integer(values.get('concurrency') ?? 2, '--concurrency', 1, 6),
		maxAttempts: integer(values.get('max-attempts') ?? 3, '--max-attempts', 1, 4),
		minFreeSpaceGiB: integer(
			values.get('min-free-space-gib') ?? DEFAULT_MIN_FREE_SPACE_GIB,
			'--min-free-space-gib',
			1,
			1024
		),
		timeoutMs: integer(values.get('timeout-ms') ?? 7_200_000, '--timeout-ms', 1, 14_400_000),
		requireCount: nullableInteger(values.get('require-count') ?? 1_000, '--require-count', 1),
		limit: nullableInteger(values.get('limit'), '--limit', 1)
	};
}

function integer(value, label, minimum, maximum) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
	}
	return parsed;
}

function nullableInteger(value, label, minimum) {
	if (value === undefined || value === null || value === '') return null;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum)
		throw new Error(`${label} must be an integer >= ${minimum}.`);
	return parsed;
}

function titleCase(value) {
	return value[0].toUpperCase() + value.slice(1);
}

function usage() {
	return [
		'Usage: node scripts/generate-science-question-art.mjs [options]',
		'',
		'--manifest=<art-manifest.json>',
		'--work-root=<directory>',
		'--id=<art-id>             Repeat to select specific contexts',
		'--limit=<count>            Generate only the first N selected contexts',
		'--require-count=<count>    Full manifest count gate; default 1000',
		'--concurrency=<1-6>        Default 2',
		'--max-attempts=<1-4>       Default 3',
		`--min-free-space-gib=<1-1024>  Stop safely below this reserve; default ${DEFAULT_MIN_FREE_SPACE_GIB}`,
		'--timeout-ms=<number>',
		'--repair-review=<review-summary.json>  Freshly regenerate only major-rejected pairs; retain annotated minor issues',
		'--repair-perceptual-audit=<audit.json>  Regenerate a deterministic cover of duplicate pairs',
		'--resume',
		'--replace-output            Required with either repair mode',
		'--dry-run'
	].join('\n');
}
