import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildScienceChallengeAuthoringParts } from './lib/science-challenge-authoring-parts.mjs';
import {
	buildScienceChallengeAuthoringPrompt,
	reconstructScienceChallengeAuthoringAttemptPrompt,
	reconstructScienceChallengeMultipartAttemptParts
} from './lib/science-challenge-authoring-prompts.mjs';
import { runDirectScienceChallengeJsonTurn } from './lib/science-challenge-direct-json-runner.mjs';
import { runDirectScienceChallengeMultipartTurn } from './lib/science-challenge-direct-multipart-runner.mjs';
import {
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	SCIENCE_QUESTION_ART_SCHEMA,
	canonicalHash,
	challengeBatchOutputSchema,
	normalizeGeneratedChallengeBatch,
	sha256,
	stableStringify
} from './lib/science-challenge-release.mjs';
import { buildSameCurriculumComponentPeerEvidence } from './lib/science-challenge-verification-peers.mjs';
import {
	claimVerificationRepairExecutionAttempt,
	initializeVerificationRepairExecutionLedger,
	scienceChallengeVerificationRepairExecutionIdentity,
	verificationRepairExecutionLedgerRoot
} from './lib/science-challenge-verification-repair-lineage.mjs';

const rootDir = process.cwd();
const generator = path.join(rootDir, 'scripts/generate-science-challenges.mjs');
const node = process.execPath;

test('direct multipart CLI is explicit, bounded and llm-direct only', () => {
	const accepted = run('--help', '--transport=llm-direct', '--direct-part-size=4');
	assert.equal(accepted.status, 0, accepted.stderr);
	assert.match(accepted.stdout, /--direct-part-size=<1-7>/);

	const defaultTransport = run('--help', '--direct-part-size=4');
	assert.notEqual(defaultTransport.status, 0);
	assert.match(defaultTransport.stderr, /valid only with --transport=llm-direct/);

	for (const value of ['0', '8', '2.5']) {
		const rejected = run('--help', '--transport=llm-direct', `--direct-part-size=${value}`);
		assert.notEqual(rejected.status, 0, `unexpectedly accepted ${value}`);
		assert.match(rejected.stderr, /must be an integer from 1 to 7/);
	}
});

test('legacy SDK and single-direct help paths remain valid without multipart', () => {
	assert.equal(run('--help').status, 0);
	assert.equal(run('--help', '--transport=llm-direct').status, 0);
});

test('preflight-only is explicit and llm-direct only', () => {
	const accepted = run('--help', '--transport=llm-direct', '--preflight-only');
	assert.equal(accepted.status, 0, accepted.stderr);
	assert.match(accepted.stdout, /--preflight-only/);
	assert.equal(
		run(
			'--help',
			'--transport=llm-direct',
			'--preflight-only',
			'--preflight-output=tmp/preflight.json'
		).status,
		0
	);

	for (const args of [
		['--help', '--preflight-only'],
		['--help', '--transport=llm-direct', '--preflight-output=tmp/preflight.json'],
		['--help', '--transport=llm-direct', '--preflight-only=true'],
		['--help', '--transport=llm-direct', '--preflight-only', '--dry-run']
	]) {
		const rejected = run(...args);
		assert.notEqual(rejected.status, 0, args.join(' '));
		assert.match(rejected.stderr, /preflight-only|boolean flag/);
	}
});

test('approval prevalidation is ordered before direct preflight and every repair write', () => {
	const source = readFileSync(generator, 'utf8');
	const bindingIndex = source.indexOf('const verificationRepairRecovery =');
	const approvalPrevalidationIndex = source.indexOf(
		'prevalidateMultipartSalvageSourceApprovals();'
	);
	const preflightIndex = source.indexOf('const directGenerationPreflight =');
	const preflightCallIndex = source.indexOf(
		'directGenerationPreflight.result = await runScienceChallengeDirectTransportPreflight'
	);
	const recoveryIndex = source.indexOf('recoverVerificationRepairPublication({');
	const ledgerInitializationIndex = source.indexOf('initializeVerificationRepairExecutionLedger({');
	const generationIndex = source.indexOf(
		'const gatedGeneration = await runScienceChallengeGenerationBehindPreflight'
	);
	assert.notEqual(bindingIndex, -1);
	assert.notEqual(approvalPrevalidationIndex, -1);
	assert.notEqual(preflightIndex, -1);
	assert.notEqual(preflightCallIndex, -1);
	assert.notEqual(recoveryIndex, -1);
	assert.notEqual(ledgerInitializationIndex, -1);
	assert.notEqual(generationIndex, -1);
	assert.ok(bindingIndex < preflightIndex);
	assert.ok(preflightIndex < approvalPrevalidationIndex);
	assert.ok(approvalPrevalidationIndex < preflightCallIndex);
	assert.ok(approvalPrevalidationIndex < recoveryIndex);
	assert.ok(approvalPrevalidationIndex < ledgerInitializationIndex);
	assert.ok(recoveryIndex < generationIndex);
});

test('a successful direct review-rebase repair publishes its proposal cohort before staging S1', () => {
	const source = readFileSync(generator, 'utf8');
	const branchStart = source.indexOf('verificationRepairEvidence.reviewRebase &&');
	assert.notEqual(branchStart, -1);
	const branchEnd = source.indexOf(
		'} else if (verificationRepairPredecessorEffectiveCohort) {',
		branchStart
	);
	assert.notEqual(branchEnd, -1);
	const branch = source.slice(branchStart, branchEnd);
	const publicationIndex = branch.indexOf('publication = publishVerificationRepairCohort({');
	const stageIndex = branch.indexOf(
		'const staged = stageScienceChallengeEffectiveCohortSuccessor({'
	);
	assert.ok(publicationIndex >= 0);
	assert.ok(stageIndex > publicationIndex);
	assert.match(branch, /reviewRebaseEvidence: verificationRepairEvidence\.reviewRebase/);
	assert.match(branch, /verificationRepairAuthority/);
	assert.match(branch, /successorReviewPending = true/);
	assert.match(branch, /parentChainSha256: canonicalHash\(staged\.manifest\.parentChain\)/);

	const successorBranchStart = source.indexOf(
		'} else if (verificationRepairPredecessorEffectiveCohort) {',
		branchStart
	);
	const successorBranchEnd = source.indexOf('\n\t\t} else {', successorBranchStart);
	const successorBranch = source.slice(successorBranchStart, successorBranchEnd);
	assert.match(successorBranch, /predecessor: verificationRepairPredecessorEffectiveCohort/);
	assert.match(successorBranch, /reviewRebaseEvidence: verificationRepairEvidence\.reviewRebase/);
	assert.match(
		successorBranch,
		/parentChainSha256: canonicalHash\(staged\.manifest\.parentChain\)/
	);
});

test('direct B0/V1 registry lifecycle gates, reserves, seeds, then commits before model work', () => {
	const source = readFileSync(generator, 'utf8');
	const identityValidation = source.indexOf(
		"label: 'Validated verification-repair execution identity'"
	);
	const inspection = source.indexOf(
		'inspectScienceChallengeReviewRebaseChildRegistration(',
		identityValidation
	);
	const freshness = source.indexOf(
		'requireFreshReviewRebaseRepairObjective();',
		identityValidation
	);
	const cohort = source.indexOf('requireCompleteVerificationRepairCohort({', freshness);
	const reservation = source.indexOf('reserveScienceChallengeReviewRebaseChild(', cohort);
	const seed = source.indexOf('seedReviewRebaseRepairRoot({');
	const ledger = source.indexOf('initializeVerificationRepairExecutionLedger({');
	const executionMarker = source.indexOf('bindVerificationRepairExecutionMarker({', ledger);
	const commit = source.indexOf('commitScienceChallengeReviewRebaseChild(', executionMarker);
	const preflight = source.indexOf(
		'directGenerationPreflight.result = await runScienceChallengeDirectTransportPreflight',
		commit
	);
	assert.ok(identityValidation >= 0);
	assert.ok(freshness > identityValidation);
	assert.ok(cohort > freshness);
	assert.ok(inspection > cohort);
	assert.ok(reservation > cohort);
	assert.ok(reservation > inspection);
	assert.ok(seed > reservation);
	assert.ok(ledger > seed);
	assert.ok(executionMarker > ledger);
	assert.ok(commit > ledger);
	assert.ok(commit > executionMarker);
	assert.ok(preflight > commit);
	assert.doesNotMatch(
		source.slice(identityValidation, reservation),
		/registerScienceChallengeReviewRebaseChild|commitScienceChallengeReviewRebaseChild/
	);
});

test('authenticated V2+ review-rebase successor exhaustion is terminal without blocking V2 to S2 entry', () => {
	const source = readFileSync(generator, 'utf8');
	assert.match(source, /validateScienceChallengeReviewRebaseSuccessorLineage/);

	const ancestryStart = source.indexOf('const verificationRepairSuccessorAncestry =');
	const ancestryEnd = source.indexOf('const verificationReviewById =', ancestryStart);
	assert.notEqual(ancestryStart, -1);
	assert.ok(ancestryEnd > ancestryStart);
	const ancestryBinding = source.slice(ancestryStart, ancestryEnd);
	assert.match(
		ancestryBinding,
		/verificationRepairPredecessorEffectiveCohort\?\.manifest\s*\?\.parentChain/
	);
	assert.match(
		ancestryBinding,
		/validateScienceChallengeReviewRebaseSuccessorLineage\(\{[\s\S]*effectiveCohort: verificationRepairPredecessorEffectiveCohort,[\s\S]*reviewRebaseEvidence: verificationRepairEvidence\?\.reviewRebase/
	);
	assert.match(ancestryBinding, /Authenticated review-rebase successor ancestry is invalid/);
	assert.match(
		ancestryBinding,
		/const exhaustedReviewRebaseRepairIsTerminal =[\s\S]*verificationRepairAuthority[\s\S]*verificationRepairSuccessorAncestry\?\.status === 'passed'/
	);

	const dryRunStart = source.indexOf('function planDryRunShard(shardId)');
	const dryRunEnd = source.indexOf('async function generateShard(shardId)', dryRunStart);
	const dryRunBranch = source.slice(dryRunStart, dryRunEnd);
	const dryRunFreshEntry = dryRunBranch.indexOf("if (resumePlan.action === 'run')");
	const dryRunGuard = dryRunBranch.indexOf('if (exhaustedReviewRebaseRepairIsTerminal)');
	const dryRunLegacyRecovery = dryRunBranch.indexOf(
		'const replayOptions = multipartContinuationReplayOptions'
	);
	assert.ok(dryRunFreshEntry >= 0);
	assert.ok(dryRunGuard > dryRunFreshEntry);
	assert.ok(dryRunLegacyRecovery > dryRunGuard);
	for (const legacyRecoveryCall of [
		'const salvage = inspectScienceChallengeMultipartPlanSalvage',
		'const difficultyAdjustment = recoverExhaustedScienceChallengeDifficultyPlanAdjustment',
		'const descendantRemap = recoverExhaustedScienceChallengeDescendantRemap'
	]) {
		assert.ok(dryRunBranch.indexOf(legacyRecoveryCall) > dryRunGuard, legacyRecoveryCall);
	}
	assert.match(
		dryRunBranch.slice(dryRunGuard, dryRunLegacyRecovery),
		/action: 'refuse-exhausted-review-rebase-repair'/
	);

	const generationStart = dryRunEnd;
	const generationEnd = source.indexOf('function buildAuthoringInput', generationStart);
	const generationBranch = source.slice(generationStart, generationEnd);
	const generationFreshEntry = generationBranch.indexOf("if (resumePlan.action === 'reuse')");
	const generationExhausted = generationBranch.indexOf("if (resumePlan.action === 'exhausted')");
	const generationGuard = generationBranch.indexOf(
		'if (exhaustedReviewRebaseRepairIsTerminal)',
		generationExhausted
	);
	const generationLegacyRecovery = generationBranch.indexOf(
		'const continuation = readScienceChallengeMultipartContinuation',
		generationGuard
	);
	assert.ok(generationFreshEntry >= 0);
	assert.ok(generationExhausted > generationFreshEntry);
	assert.ok(generationGuard > generationExhausted);
	assert.ok(generationLegacyRecovery > generationGuard);
	for (const legacyRecoveryCall of [
		'const salvage = stageScienceChallengeMultipartPlanSalvage',
		'const difficultyAdjustment = recoverExhaustedScienceChallengeDifficultyPlanAdjustment',
		'const descendantRemap = recoverExhaustedScienceChallengeDescendantRemap'
	]) {
		assert.ok(generationBranch.indexOf(legacyRecoveryCall) > generationGuard, legacyRecoveryCall);
	}
	assert.match(
		generationBranch.slice(generationGuard, generationLegacyRecovery),
		/action: 'refuse-exhausted-review-rebase-repair'/
	);

	const successorStart = source.indexOf(
		'} else if (verificationRepairPredecessorEffectiveCohort) {'
	);
	const successorEnd = source.indexOf('\n\t\t} else {', successorStart);
	assert.ok(successorStart >= 0);
	assert.ok(successorEnd > successorStart);
	const successorBranch = source.slice(successorStart, successorEnd);
	assert.match(successorBranch, /predecessor: verificationRepairPredecessorEffectiveCohort/);
	assert.match(successorBranch, /reviewRebaseEvidence: verificationRepairEvidence\.reviewRebase/);
	assert.match(
		successorBranch,
		/reviewEffectiveCohortManifestSha256:\s*verificationRepairBase\.assignmentIndex\.effectiveCohortManifestSha256/
	);
});

test('direct response mode is explicit, closed and llm-direct only', () => {
	for (const mode of ['structured-json', 'prompt-json']) {
		const accepted = run('--help', '--transport=llm-direct', `--direct-response-mode=${mode}`);
		assert.equal(accepted.status, 0, accepted.stderr);
	}
	const sdk = run('--help', '--direct-response-mode=prompt-json');
	assert.notEqual(sdk.status, 0);
	assert.match(sdk.stderr, /valid only with --transport=llm-direct/);
	const unknown = run('--help', '--transport=llm-direct', '--direct-response-mode=automatic');
	assert.notEqual(unknown.status, 0);
	assert.match(unknown.stderr, /must be structured-json or prompt-json/);
	assert.match(
		run('--help', '--transport=llm-direct').stdout,
		/--direct-response-mode=structured-json\|prompt-json/
	);
});

test('high thinking is explicit and exclusive to llm-direct prompt-json', () => {
	const accepted = run(
		'--help',
		'--transport=llm-direct',
		'--direct-response-mode=prompt-json',
		'--thinking-level=high'
	);
	assert.equal(accepted.status, 0, accepted.stderr);
	for (const args of [
		['--help', '--thinking-level=high'],
		['--help', '--transport=llm-direct', '--thinking-level=high'],
		[
			'--help',
			'--transport=llm-direct',
			'--direct-response-mode=structured-json',
			'--thinking-level=high'
		],
		[
			'--help',
			'--transport=llm-direct',
			'--direct-response-mode=prompt-json',
			'--thinking-level=xhigh'
		],
		[
			'--help',
			'--transport=llm-direct',
			'--direct-response-mode=prompt-json',
			'--thinking-level=medium'
		],
		[
			'--help',
			'--transport=llm-direct',
			'--direct-response-mode=prompt-json',
			'--thinking-level=low'
		]
	]) {
		const rejected = run(...args);
		assert.notEqual(rejected.status, 0, args.join(' '));
		assert.match(rejected.stderr, /only llm-direct prompt-json may explicitly use high/);
	}
});

test('exhausted multipart continuation is explicit, single-shard and dry-run compatible', () => {
	const required = [
		'--help',
		'--transport=llm-direct',
		'--direct-response-mode=prompt-json',
		'--thinking-level=high',
		'--direct-part-size=2',
		'--repair-verification=tmp/review.json',
		'--resume',
		'--shard=science-016',
		'--continue-exhausted-multipart'
	];
	const accepted = run(...required);
	assert.equal(accepted.status, 0, accepted.stderr);
	assert.match(accepted.stdout, /--continue-exhausted-multipart/);
	assert.equal(run(...required, '--dry-run').status, 0);
	for (const omitted of [
		'--transport=llm-direct',
		'--direct-response-mode=prompt-json',
		'--thinking-level=high',
		'--direct-part-size=2',
		'--repair-verification=tmp/review.json',
		'--resume',
		'--shard=science-016'
	]) {
		const rejected = run(...required.filter((argument) => argument !== omitted));
		assert.notEqual(rejected.status, 0, omitted);
	}
	const duplicateShard = run(...required, '--shard=science-017');
	assert.notEqual(duplicateShard.status, 0);
	assert.match(duplicateShard.stderr, /exactly one --shard/);
	const assignment = run(...required, '--continue-exhausted-multipart=true');
	assert.notEqual(assignment.status, 0);
	assert.match(assignment.stderr, /boolean flag/);
});

test('verification repair always uses the immutable four-attempt ceiling', () => {
	const defaulted = run('--help', '--repair-verification=review.json');
	assert.equal(defaulted.status, 0, defaulted.stderr);
	assert.match(defaulted.stdout, /verification repair requires exactly 4 and defaults to 4/);
	assert.match(defaulted.stdout, /four total attempts/);
	assert.match(defaulted.stdout, /four-attempt exhaustion/);
	assert.match(defaulted.stdout, /later full rejected-cohort --resume/);

	const explicit = run('--help', '--repair-verification=review.json', '--max-attempts=4');
	assert.equal(explicit.status, 0, explicit.stderr);
	for (const attempts of ['1', '2', '3', '5']) {
		const rejected = run(
			'--help',
			'--repair-verification=review.json',
			`--max-attempts=${attempts}`
		);
		assert.notEqual(rejected.status, 0, attempts);
		assert.match(rejected.stderr, /requires --max-attempts=4/);
	}
});

test('review-rebase repair mode requires the exact fresh parent-bound authoring policy', () => {
	const required = [
		'--help',
		'--repair-verification=verification/summary.json',
		'--review-rebase-manifest=review-rebase/manifest.json',
		'--transport=llm-direct',
		'--direct-response-mode=prompt-json',
		'--thinking-level=high',
		'--direct-part-size=2',
		'--max-attempts=4'
	];
	const accepted = run(...required);
	assert.equal(accepted.status, 0, accepted.stderr);
	assert.match(accepted.stdout, /--review-rebase-manifest=<manifest\.json>/);

	for (const omitted of [
		'--repair-verification=verification/summary.json',
		'--transport=llm-direct',
		'--direct-response-mode=prompt-json',
		'--thinking-level=high',
		'--direct-part-size=2'
	]) {
		const rejected = run(...required.filter((argument) => argument !== omitted));
		assert.notEqual(rejected.status, 0, omitted);
		assert.match(
			rejected.stderr,
			/review-rebase-manifest|llm-direct|prompt-json|thinking|part-size/i
		);
	}
	for (const replacement of [
		['--direct-part-size=2', '--direct-part-size=1'],
		['--direct-part-size=2', '--direct-part-size=3'],
		['--direct-response-mode=prompt-json', '--direct-response-mode=structured-json'],
		['--thinking-level=high', '--thinking-level=max'],
		['--max-attempts=4', '--max-attempts=3']
	]) {
		const rejected = run(
			...required.map((argument) => (argument === replacement[0] ? replacement[1] : argument))
		);
		assert.notEqual(rejected.status, 0, replacement.join(' -> '));
		assert.match(
			rejected.stderr,
			/review-rebase-manifest|requires --max-attempts=4|thinking-level/i
		);
	}
	for (const forbidden of [
		'--preflight-only',
		'--continue-exhausted-multipart',
		'--multipart-salvage-source-approval=approval.json'
	]) {
		const extra =
			forbidden === '--continue-exhausted-multipart'
				? ['--resume', '--shard=science-001', forbidden]
				: forbidden.startsWith('--multipart')
					? ['--resume', forbidden]
					: [forbidden];
		const rejected = run(...required, ...extra);
		assert.notEqual(rejected.status, 0, forbidden);
		assert.match(rejected.stderr, /review-rebase-manifest|preflight|continuation|salvage/i);
	}
});

test('typed review-rebase infrastructure recovery is explicit and full-cohort only', () => {
	const required = [
		'--help',
		'--repair-verification=verification/summary.json',
		'--review-rebase-manifest=review-rebase/manifest.json',
		'--review-rebase-infrastructure-recovery=recovery/manifest.json',
		'--transport=llm-direct',
		'--direct-response-mode=prompt-json',
		'--thinking-level=high',
		'--direct-part-size=2',
		'--max-attempts=4',
		'--resume'
	];
	const accepted = run(...required);
	assert.equal(accepted.status, 0, accepted.stderr);
	assert.match(accepted.stdout, /--review-rebase-infrastructure-recovery=<manifest\.json>/);

	for (const omitted of [
		'--repair-verification=verification/summary.json',
		'--review-rebase-manifest=review-rebase/manifest.json',
		'--resume'
	]) {
		const rejected = run(...required.filter((argument) => argument !== omitted));
		assert.notEqual(rejected.status, 0, omitted);
		assert.match(
			rejected.stderr,
			/infrastructure-recovery|review-rebase-manifest|repair-verification|resume/i
		);
	}
	for (const forbidden of [
		'--shard=science-008',
		'--preflight-only',
		'--multipart-salvage-source-approval=approval.json'
	]) {
		const rejected = run(...required, forbidden);
		assert.notEqual(rejected.status, 0, forbidden);
		assert.match(
			rejected.stderr,
			/infrastructure-recovery|preflight|salvage|complete rejected cohort/i
		);
	}
	const continuation = run(...required, '--shard=science-008', '--continue-exhausted-multipart');
	assert.notEqual(continuation.status, 0);
	assert.match(
		continuation.stderr,
		/infrastructure-recovery|review-rebase-manifest|continuation|complete rejected cohort/i
	);
});

test('typed recovery evidence and publication roots are separate, non-nested and non-aliased', () => {
	const fixtureRoot = realpathSync(
		mkdtempSync(path.join(tmpdir(), 'science-generator-recovery-roots-'))
	);
	try {
		const recoveryRoot = path.join(fixtureRoot, 'recovery-evidence');
		const failedRoot = path.join(fixtureRoot, 'failed-s1');
		const publicationRoot = path.join(fixtureRoot, 'publication-s2');
		mkdirSync(recoveryRoot, { recursive: true });
		mkdirSync(failedRoot, { recursive: true });
		const manifestPath = writeJson(
			recoveryRoot,
			'verification-repair-infrastructure-recovery.json',
			{
				failedRoot: { path: path.relative(fixtureRoot, failedRoot) },
				successor: { path: path.relative(fixtureRoot, recoveryRoot) }
			}
		);
		const baseArgs = [
			'--repair-verification=verification/summary.json',
			'--review-rebase-manifest=review-rebase/manifest.json',
			`--review-rebase-infrastructure-recovery=${manifestPath}`,
			'--transport=llm-direct',
			'--direct-response-mode=prompt-json',
			'--thinking-level=high',
			'--direct-part-size=2',
			'--max-attempts=4',
			'--resume'
		];

		for (const [label, output] of [
			['equal recovery root', recoveryRoot],
			['nested recovery root', path.join(recoveryRoot, 'publication')],
			['original failed root', failedRoot]
		]) {
			const rejected = runInRoot(fixtureRoot, [...baseArgs, `--output-root=${output}`]);
			assert.notEqual(rejected.status, 0, label);
			assert.match(rejected.stderr, /distinct|non-nested|non-aliased/i, label);
		}

		const aliasRoot = path.join(fixtureRoot, 'recovery-alias');
		symlinkSync(recoveryRoot, aliasRoot, 'dir');
		const aliasRejected = runInRoot(fixtureRoot, [...baseArgs, `--output-root=${aliasRoot}`]);
		assert.notEqual(aliasRejected.status, 0);
		assert.match(aliasRejected.stderr, /symbolic|aliased/i);

		const sibling = runInRoot(fixtureRoot, [...baseArgs, `--output-root=${publicationRoot}`]);
		assert.notEqual(sibling.status, 0);
		assert.match(sibling.stderr, /Required input does not exist/);
		assert.doesNotMatch(sibling.stderr, /distinct|non-nested|non-aliased/i);
		assert.equal(existsSync(publicationRoot), false);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

test('typed review-rebase infrastructure recovery uses separate bounded ledgers and stage-before-publish', () => {
	const source = readFileSync(generator, 'utf8');
	const collectionPass = source.indexOf('recordVerificationRepairCollectionPass({');
	const typedBranchStart = source.indexOf(
		'if (reviewRebaseInfrastructureRecovery) {',
		collectionPass
	);
	const typedBranchEnd = source.indexOf('} else if (', typedBranchStart);
	assert.ok(collectionPass >= 0);
	assert.ok(typedBranchStart > collectionPass);
	assert.ok(typedBranchEnd > typedBranchStart);
	const typedBranch = source.slice(typedBranchStart, typedBranchEnd);
	const stageIndex = typedBranch.indexOf('stageScienceChallengeEffectiveCohortSuccessor({');
	const publicationIndex = typedBranch.indexOf('publishVerificationRepairCohort({');
	assert.ok(stageIndex >= 0);
	assert.ok(publicationIndex > stageIndex);
	assert.match(
		typedBranch,
		/reviewRebaseInfrastructureRecoveryEvidence:\s*reviewRebaseInfrastructureRecovery/
	);

	const generatorStart = source.indexOf(
		'async function generateReviewRebaseInfrastructureRecoveryShard'
	);
	const generatorEnd = source.indexOf(
		'function evaluateReviewRebaseInfrastructureRecoveryAttempt',
		generatorStart
	);
	assert.ok(generatorStart >= 0);
	assert.ok(generatorEnd > generatorStart);
	const recoveryGenerator = source.slice(generatorStart, generatorEnd);
	assert.match(recoveryGenerator, /claimScienceChallengeReviewRebaseRecoveryInvocation/);
	assert.match(recoveryGenerator, /completeScienceChallengeReviewRebaseRecoveryInvocation/);
	assert.match(recoveryGenerator, /inspectScienceChallengeReviewRebaseRecoveryInvocations/);
	assert.match(recoveryGenerator, /SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS/);
	assert.match(
		recoveryGenerator,
		/SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_INFRASTRUCTURE_INVOCATIONS_PER_LOGICAL_SLOT/
	);
	assert.doesNotMatch(recoveryGenerator, /inspectVerificationRepairAttempts/);
	assert.doesNotMatch(recoveryGenerator, /claimVerificationRepairAttemptPair/);
	assert.doesNotMatch(recoveryGenerator, /runBoundedScienceChallengeAuthoringAttempts/);
	assert.doesNotMatch(recoveryGenerator, /verification-repair-\$\{[^}]+\}-attempt-/);
});

test('typed recovery is pinned to the exact 51-shard mixed-ordinal cohort', () => {
	const source = readFileSync(generator, 'utf8');
	const start = source.indexOf('const REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_EXPECTED_SHARD_IDS');
	const end = source.indexOf('const rootDir = process.cwd()', start);
	assert.ok(start >= 0);
	assert.ok(end > start);
	const constants = source.slice(start, end);
	for (const shardId of [
		'science-001',
		'science-007',
		'science-009',
		'science-012',
		'science-013',
		'science-035',
		'science-044'
	]) {
		assert.match(constants, new RegExp(`'${shardId}'`));
	}
	for (const [shardId, ordinal] of [
		['science-008', 4],
		['science-010', 3],
		['science-011', 3],
		['science-014', 3],
		['science-015', 2],
		['science-016', 2]
	]) {
		assert.match(constants, new RegExp(`'${shardId}': ${ordinal}`));
	}

	const guardStart = source.indexOf(
		'function requireExactReviewRebaseInfrastructureRecoveryCohort'
	);
	const guardEnd = source.indexOf(
		'function reviewRebaseInfrastructureRecoveryShardRequiresModelCall',
		guardStart
	);
	const guard = source.slice(guardStart, guardEnd);
	assert.match(guard, /plan\.rows\.length !== 408/);
	assert.match(guard, /passed\.length !== 10/);
	assert.match(guard, /unresolved\.length !== 39/);
	assert.match(guard, /frozen\.length !== 2/);
	assert.match(guard, /planRowCountByShard\.get\(shardId\) !== 8/);
	assert.match(guard, /invalidUnresolvedOrdinal/);

	const terminalStart = source.indexOf(
		'function requireExactReviewRebaseInfrastructureRecoveryTerminal'
	);
	const terminalEnd = source.indexOf(
		'function reviewRebaseInfrastructureRecoveryShardRequiresModelCall',
		terminalStart
	);
	const terminal = source.slice(terminalStart, terminalEnd);
	assert.equal(
		terminal.match(/inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal/g)?.length,
		2
	);
	assert.match(terminal, /first\.finalProposals\.length !== 49/);
	assert.match(terminal, /first\.frozenShardIds\.length !== 2/);
	assert.match(terminal, /preserved\.length !== 10/);
	assert.match(terminal, /recovered\.length !== 39/);
	assert.match(terminal, /first\.finalProposalSetSha256 !== replay\.finalProposalSetSha256/);

	const collectionStart = source.indexOf(
		'if (verificationRepair && failures.length === 0 && reviewPending.length === 0)'
	);
	const terminalGate = source.indexOf(
		'requireExactReviewRebaseInfrastructureRecoveryTerminal(proposals)',
		collectionStart
	);
	const collectionPass = source.indexOf(
		'recordVerificationRepairCollectionPass({',
		collectionStart
	);
	const effectiveStage = source.indexOf(
		'stageScienceChallengeEffectiveCohortSuccessor({',
		collectionStart
	);
	const publication = source.indexOf('publishVerificationRepairCohort({', effectiveStage);
	assert.ok(terminalGate > collectionStart);
	assert.ok(collectionPass > terminalGate);
	assert.ok(effectiveStage > collectionPass);
	assert.ok(publication > effectiveStage);
});

test('typed recovery crash replay consumes ambiguous claims without fabricated validation', () => {
	const source = readFileSync(generator, 'utf8');
	const generatorStart = source.indexOf(
		'async function generateReviewRebaseInfrastructureRecoveryShard'
	);
	const previousOutcomeEnd = source.indexOf('function planDryRunShard', generatorStart);
	const recovery = source.slice(generatorStart, previousOutcomeEnd);
	assert.match(
		recovery,
		/if \(invocations\.openInvocation\)[\s\S]*completeScienceChallengeReviewRebaseRecoveryInvocation/
	);
	assert.match(
		recovery,
		/if \(!existsSync\(path\.join\(claimed\.directory, 'run-summary\.json'\)\)\)[\s\S]*completeScienceChallengeReviewRebaseRecoveryInvocation[\s\S]*continue;/
	);
	assert.match(recovery, /completion\?\.indeterminate === true/);
	assert.match(
		recovery,
		/The prior claimed invocation ended with indeterminate partial infrastructure evidence\./
	);
	assert.match(recovery, /completion\?\.evidenceInventory/);
	assert.match(recovery, /sha256\(bytes\) !== binding\.sha256/);

	const partialFailureStart = source.indexOf(
		'} else if (reviewRebaseInfrastructureRecovery) {',
		source.indexOf('let collectionValidation;')
	);
	const partialFailureEnd = source.indexOf('} else if (verificationRepair) {', partialFailureStart);
	assert.ok(partialFailureStart >= 0);
	assert.ok(partialFailureEnd > partialFailureStart);
	const partialFailure = source.slice(partialFailureStart, partialFailureEnd);
	assert.match(partialFailure, /validateAvailableCandidateCollection\(proposedCandidates\)/);
	assert.doesNotMatch(partialFailure, /exactVerificationRepairLastAttemptByShard/);
	assert.doesNotMatch(partialFailure, /recordVerificationRepairCollectionFailure/);
	assert.doesNotMatch(partialFailure, /publishVerificationRepairCohort/);

	const summaryWriteStart = source.indexOf('const persistGenerationSummary =');
	const summaryWriteEnd = source.indexOf('console.log(JSON.stringify(summary', summaryWriteStart);
	assert.ok(summaryWriteStart >= 0);
	assert.ok(summaryWriteEnd > summaryWriteStart);
	const summaryWrite = source.slice(summaryWriteStart, summaryWriteEnd);
	assert.match(summaryWrite, /!reviewRebaseInfrastructureRecovery/);
	assert.match(summaryWrite, /if \(persistGenerationSummary\)/);
});

test('typed recovery summary keeps objective and execution identities distinct', () => {
	const source = readFileSync(generator, 'utf8');
	const start = source.indexOf('function reviewRebaseInfrastructureRecoverySummaryBindings');
	const end = source.indexOf(
		'function requireExactReviewRebaseInfrastructureRecoveryCohort',
		start
	);
	const bindings = source.slice(start, end);
	assert.match(
		bindings,
		/reviewRebaseInfrastructureRecoveryId:\s*reviewRebaseInfrastructureRecovery\.manifest\.recoveryId/
	);
	assert.match(
		bindings,
		/reviewRebaseInfrastructureRecoveryExecutionId:\s*reviewRebaseInfrastructureRecovery\.recoveryExecutionId/
	);
	assert.match(
		bindings,
		/reviewRebaseInfrastructureRecoveryPreservedProposalSetSha256:\s*reviewRebaseInfrastructureRecovery\.manifest\.preservedProposalSetSha256/
	);
	assert.doesNotMatch(bindings, /manifest\.recoveryProposalSetSha256/);
});

test('multipart salvage source approvals are repeatable and restricted to full-cohort repair resume', () => {
	const accepted = run(
		'--help',
		'--repair-verification=review.json',
		'--resume',
		'--multipart-salvage-source-approval=approval-028.json',
		'--multipart-salvage-source-approval=approval-044.json'
	);
	assert.equal(accepted.status, 0, accepted.stderr);
	assert.match(accepted.stdout, /--multipart-salvage-source-approval=<json>/);
	for (const args of [
		['--help', '--multipart-salvage-source-approval=approval.json'],
		[
			'--help',
			'--repair-verification=review.json',
			'--multipart-salvage-source-approval=approval.json'
		],
		[
			'--help',
			'--transport=llm-direct',
			'--preflight-only',
			'--repair-verification=review.json',
			'--resume',
			'--multipart-salvage-source-approval=approval.json'
		],
		[
			'--help',
			'--transport=llm-direct',
			'--direct-response-mode=prompt-json',
			'--thinking-level=high',
			'--direct-part-size=2',
			'--repair-verification=review.json',
			'--resume',
			'--shard=science-028',
			'--continue-exhausted-multipart',
			'--multipart-salvage-source-approval=approval.json'
		],
		[
			'--help',
			'--repair-verification=review.json',
			'--resume',
			'--multipart-salvage-source-approval='
		]
	]) {
		const rejected = run(...args);
		assert.notEqual(rejected.status, 0, args.join(' '));
		assert.match(rejected.stderr, /multipart-salvage-source-approval|preflight|continuation/i);
	}
});

test('repair dry-run and actual run refuse an invalid recovery binding before writes', () => {
	const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'science-generator-dry-run-recovery-'));
	try {
		const plan = { planId: 'dry-run-recovery-test', existingRoundCount: 0, rows: [] };
		const source = { questions: [], sourceDocuments: [] };
		const evidence = { components: [] };
		const review = {
			candidateSetSha256: 'a'.repeat(64),
			status: 'failed',
			reviews: []
		};
		const planPath = writeJson(fixtureRoot, 'plan.json', plan);
		const sourcePath = writeJson(fixtureRoot, 'source.json', source);
		const evidencePath = writeJson(fixtureRoot, 'evidence.json', evidence);
		const reviewPath = writeJson(fixtureRoot, 'review.json', review);
		const outputRoot = path.join(fixtureRoot, 'generation');
		const identity = scienceChallengeVerificationRepairExecutionIdentity({
			planSha256: canonicalHash(plan),
			verificationSha256: canonicalHash(review),
			priorCandidateSetSha256: review.candidateSetSha256,
			model: 'gpt-5.6-sol',
			transport: 'codex-sdk',
			responseMode: null,
			thinkingLevel: 'max',
			directPartSize: null
		});
		const ledgerRoot = verificationRepairExecutionLedgerRoot(fixtureRoot, identity.objectiveId);
		mkdirSync(ledgerRoot, { recursive: true });
		const invalidBindingPath = path.join(ledgerRoot, 'recovery.json');
		writeFileSync(invalidBindingPath, '{"schemaVersion":"wrong"}\n');
		mkdirSync(path.join(fixtureRoot, 'src/lib/challenges'), { recursive: true });
		writeFileSync(
			path.join(fixtureRoot, 'src/lib/challenges/catalog.ts'),
			'export const challengeCatalog = [];\n'
		);

		for (const dryRun of [true, false]) {
			const result = runInRoot(fixtureRoot, [
				`--plan=${planPath}`,
				`--source=${sourcePath}`,
				`--evidence=${evidencePath}`,
				`--output-root=${outputRoot}`,
				`--repair-verification=${reviewPath}`,
				'--resume',
				...(dryRun ? ['--dry-run'] : [])
			]);
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, /recovery|execution identity/i);
			assert.equal(existsSync(outputRoot), false);
			assert.equal(readFileSync(invalidBindingPath, 'utf8'), '{"schemaVersion":"wrong"}\n');
		}
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

test('full-cohort CLI discovers, validates and reuses exact multipart terminal approvals', async (t) => {
	const fixture = await buildTerminalApprovalCliFixture();
	try {
		let approvalTemplate;
		let alternateCandidateSha256;

		await t.test(
			'dry-run emits the exact ambiguous-source vector and template without writes',
			() => {
				const before = snapshotRepairState(fixture);
				const result = runInRoot(fixture.root, [...terminalApprovalArgs(fixture), '--dry-run']);
				assert.equal(result.status, 0, result.stderr);
				const output = JSON.parse(result.stdout);
				assert.equal(output.status, 'planned');
				assert.equal(output.selectedShardCount, 2);
				assert.equal(output.generationRequiresModelCall, false);
				const ambiguous = output.shards.find((shard) => shard.shardId === 'science-001');
				const sole = output.shards.find((shard) => shard.shardId === 'science-002');
				assert.equal(ambiguous.action, 'approve-terminal-multipart-salvage-source');
				assert.equal(ambiguous.requiresApproval, true);
				assert.deepEqual(
					ambiguous.eligibleSources.map((source) => source.attempt),
					[3, 4]
				);
				assert.notEqual(
					ambiguous.eligibleSources[0].recoveredCandidateSha256,
					ambiguous.eligibleSources[1].recoveredCandidateSha256
				);
				assert.equal(ambiguous.terminalAttemptEligible, true);
				assert.equal(ambiguous.writesDuringDryRun, false);
				assert.equal(ambiguous.modelCallsDuringDryRun, false);
				assert.equal(ambiguous.eligibleSourcesSha256, canonicalHash(ambiguous.eligibleSources));
				assert.deepEqual(Object.keys(ambiguous.approvalTemplate).sort(), [
					'decision',
					'eligibleSourcesSha256',
					'executionId',
					'objectiveId',
					'repairSha256',
					'schemaVersion',
					'selectedAttempt',
					'selectedCandidateSha256',
					'shardId'
				]);
				assert.equal(ambiguous.approvalTemplate.selectedAttempt, 4);
				assert.equal(
					ambiguous.approvalTemplate.selectedCandidateSha256,
					ambiguous.eligibleSources.find((source) => source.attempt === 4).recoveredCandidateSha256
				);
				assert.equal(sole.action, 'stage-multipart-plan-drift-salvage');
				assert.equal(sole.sourceAttempt, 4);
				approvalTemplate = ambiguous.approvalTemplate;
				alternateCandidateSha256 = ambiguous.eligibleSources.find(
					(source) => source.attempt === 3
				).recoveredCandidateSha256;
				assert.deepEqual(snapshotRepairState(fixture), before);
				assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /thread\.started|model call/i);
			}
		);

		const approvalPath = writeJson(
			fixture.root,
			'approval-for-science-002-by-name-only.json',
			approvalTemplate
		);

		await t.test(
			'approval routes by its bound shardId and is omitted from the sole-source shard',
			() => {
				const before = snapshotRepairState(fixture);
				const result = runInRoot(fixture.root, [
					...terminalApprovalArgs(fixture),
					'--dry-run',
					`--multipart-salvage-source-approval=${approvalPath}`
				]);
				assert.equal(result.status, 0, result.stderr);
				const output = JSON.parse(result.stdout);
				assert.deepEqual(
					output.shards.map(({ shardId, action, sourceAttempt }) => ({
						shardId,
						action,
						sourceAttempt
					})),
					[
						{
							shardId: 'science-001',
							action: 'stage-multipart-plan-drift-salvage',
							sourceAttempt: 4
						},
						{
							shardId: 'science-002',
							action: 'stage-multipart-plan-drift-salvage',
							sourceAttempt: 4
						}
					]
				);
				assert.deepEqual(snapshotRepairState(fixture), before);
			}
		);

		await t.test('wrong, duplicate, foreign and unused approvals fail before writes', () => {
			const mutations = [
				['wrong objective', { objectiveId: '0'.repeat(64) }, /another repair execution/i],
				['wrong execution', { executionId: '1'.repeat(64) }, /another repair execution/i],
				[
					'wrong decision',
					{ decision: 'accept-content-without-fresh-verification' },
					/does not limit selection/i
				],
				[
					'wrong candidate',
					{ selectedCandidateSha256: alternateCandidateSha256 },
					/stale selected candidate hash/i
				],
				[
					'nonterminal candidate',
					{
						selectedAttempt: 3,
						selectedCandidateSha256: alternateCandidateSha256
					},
					/must select the eligible, non-invalidated terminal attempt/i
				],
				[
					'wrong eligible set',
					{ eligibleSourcesSha256: '2'.repeat(64) },
					/stale eligible-source evidence/i
				],
				['unbound field', { rationale: 'not provenance' }, /contains unbound fields/i]
			];
			for (const [name, mutation, pattern] of mutations) {
				const invalidPath = writeJson(fixture.root, `invalid-${slug(name)}.json`, {
					...approvalTemplate,
					...mutation
				});
				assertApprovalFailureWithoutWrites(fixture, [invalidPath], pattern);
			}

			const foreignPath = writeJson(fixture.root, 'foreign-shard.json', {
				...approvalTemplate,
				shardId: 'science-003'
			});
			assertApprovalFailureWithoutWrites(
				fixture,
				[foreignPath],
				/outside the selected rejected repair cohort/i
			);
			assertApprovalFailureWithoutWrites(
				fixture,
				[approvalPath, approvalPath],
				/Multiple multipart salvage source approvals target science-001/i
			);
			const unusedPath = writeJson(fixture.root, 'unused-sole-source.json', {
				...approvalTemplate,
				shardId: 'science-002',
				selectedCandidateSha256: '3'.repeat(64)
			});
			assertApprovalFailureWithoutWrites(
				fixture,
				[unusedPath],
				/stale because the eligible source set is no longer ambiguous/i
			);
		});

		await t.test('approval does not weaken mandatory full rejected-cohort selection', () => {
			const before = snapshotRepairState(fixture);
			const result = runInRoot(fixture.root, [
				...terminalApprovalArgs(fixture),
				'--shard=science-001',
				`--multipart-salvage-source-approval=${approvalPath}`
			]);
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, /complete rejected-shard cohort.*science-002/i);
			assert.deepEqual(snapshotRepairState(fixture), before);
		});

		await t.test(
			'actual staging persists approval and interrupted pre-aggregate dry-run reuses it',
			() => {
				const staged = runInRoot(fixture.root, [
					...terminalApprovalArgs(fixture),
					`--multipart-salvage-source-approval=${approvalPath}`
				]);
				assert.equal(staged.status, 0, staged.stderr);
				const stagedOutput = JSON.parse(staged.stdout);
				assert.equal(stagedOutput.status, 'passed');
				assert.equal(stagedOutput.preflight, null);
				assert.deepEqual(
					stagedOutput.results.map(({ shardId, action, attempt }) => ({
						shardId,
						action,
						attempt
					})),
					[
						{
							shardId: 'science-001',
							action: 'verification-repair-plan-drift-salvaged',
							attempt: 4
						},
						{
							shardId: 'science-002',
							action: 'verification-repair-plan-drift-salvaged',
							attempt: 4
						}
					]
				);
				const manifestPath = path.join(
					fixture.outputRoot,
					'shards',
					'science-001',
					`verification-repair-${fixture.repairSha256.slice(0, 12)}-multipart-plan-salvage`,
					'manifest.json'
				);
				const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
				assert.deepEqual(manifest.sourceSelection.approval, approvalTemplate);

				const publishedRootFiles = [];
				const aggregateBackupRoot = path.join(fixture.root, 'interrupted-aggregate-backup');
				const aggregateCommitPaths = readdirSync(fixture.outputRoot)
					.filter((name) =>
						name.startsWith(`verification-repair-${fixture.repairSha256.slice(0, 12)}`)
					)
					.map((name) => path.join(fixture.outputRoot, name));
				try {
					mkdirSync(aggregateBackupRoot);
					for (const aggregatePath of aggregateCommitPaths) {
						renameSync(aggregatePath, path.join(aggregateBackupRoot, path.basename(aggregatePath)));
					}
					for (const shardId of ['science-001', 'science-002']) {
						const shardDir = path.join(fixture.outputRoot, 'shards', shardId);
						for (const fileName of ['candidate.json', 'validation.json']) {
							const rootPath = path.join(shardDir, fileName);
							publishedRootFiles.push({
								path: rootPath,
								bytes: readFileSync(rootPath)
							});
							writeFileSync(
								rootPath,
								readFileSync(
									path.join(
										shardDir,
										`verification-repair-${fixture.repairSha256.slice(0, 12)}`,
										`prior-${fileName}`
									)
								)
							);
						}
					}
					const interruptedValidation = JSON.parse(
						readFileSync(
							path.join(fixture.outputRoot, 'shards/science-001/validation.json'),
							'utf8'
						)
					);
					assert.equal(interruptedValidation.verificationRepairSha256, null);
					assert.equal(interruptedValidation.authoringDisposition ?? null, null);

					const beforeInterruptedReuse = snapshotRepairState(fixture);
					const interruptedReuse = runInRoot(fixture.root, [
						...terminalApprovalArgs(fixture),
						'--dry-run'
					]);
					assert.equal(interruptedReuse.status, 0, interruptedReuse.stderr);
					const interruptedReuseOutput = JSON.parse(interruptedReuse.stdout);
					assert.deepEqual(
						interruptedReuseOutput.shards.map(({ shardId, action, sourceAttempt }) => ({
							shardId,
							action,
							sourceAttempt
						})),
						[
							{
								shardId: 'science-001',
								action: 'reuse-multipart-plan-drift-salvage',
								sourceAttempt: 4
							},
							{
								shardId: 'science-002',
								action: 'reuse-multipart-plan-drift-salvage',
								sourceAttempt: 4
							}
						]
					);
					assert.doesNotMatch(interruptedReuse.stderr, /repair snapshots are missing/i);
					assert.deepEqual(snapshotRepairState(fixture), beforeInterruptedReuse);
				} finally {
					for (const rootFile of publishedRootFiles) {
						writeFileSync(rootFile.path, rootFile.bytes);
					}
					for (const aggregatePath of aggregateCommitPaths) {
						renameSync(path.join(aggregateBackupRoot, path.basename(aggregatePath)), aggregatePath);
					}
					rmSync(aggregateBackupRoot, { recursive: true, force: true });
				}

				const beforeReuse = snapshotRepairState(fixture);
				const reused = runInRoot(fixture.root, [...terminalApprovalArgs(fixture), '--dry-run']);
				assert.equal(reused.status, 0, reused.stderr);
				const reuseOutput = JSON.parse(reused.stdout);
				assert.deepEqual(
					reuseOutput.shards.map(({ shardId, action, sourceAttempt }) => ({
						shardId,
						action,
						sourceAttempt
					})),
					[
						{
							shardId: 'science-001',
							action: 'reuse-multipart-plan-drift-salvage',
							sourceAttempt: 4
						},
						{
							shardId: 'science-002',
							action: 'reuse-multipart-plan-drift-salvage',
							sourceAttempt: 4
						}
					]
				);
				assert.deepEqual(snapshotRepairState(fixture), beforeReuse);
			}
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('unknown, positional and boolean-assignment arguments fail closed before any work', () => {
	for (const args of [
		['--help', '--definitely-unknown'],
		['--help', '--definitely-unknown=value'],
		['--help', 'unexpected-positional'],
		['--help=true'],
		['--resume=true'],
		['--dry-run=false'],
		['--preflight-only=false'],
		['--continue-exhausted-multipart=false'],
		['--help', '--shard='],
		['--help', '--output-root='],
		['--help', '--model='],
		['--help', '--shard=science-001', '--shard=science-001'],
		['--help', '--help'],
		['--help', '--resume', '--resume'],
		['--help', '--dry-run', '--dry-run'],
		['--help', '--preflight-only', '--preflight-only'],
		['--help', '--continue-exhausted-multipart', '--continue-exhausted-multipart'],
		['--help', '--plan=first.json', '--plan=second.json'],
		['--help', '--output-root=first', '--output-root=second'],
		['--help', '--repair-verification=first.json', '--repair-verification=second.json'],
		['--help', '--']
	]) {
		const rejected = run(...args);
		assert.notEqual(rejected.status, 0, args.join(' '));
		assert.match(
			rejected.stderr,
			/Unknown option|Unexpected positional|boolean flag|non-empty value|Duplicate|Bare --/
		);
	}
});

function run(...args) {
	return runInRoot(tmpdir(), args);
}

function runInRoot(cwd, args) {
	return spawnSync(node, [generator, ...args], {
		cwd,
		encoding: 'utf8',
		env: {
			...process.env,
			// Help exits before transport authentication or any authoring input/model work.
			CLOUDFLARE_API_TOKEN: '',
			CLOUDFLARE_ACCOUNT_ACCESS_TOKEN: ''
		}
	});
}

function writeJson(root, name, value) {
	const filePath = path.join(root, name);
	writeFileSync(filePath, `${stableStringify(value)}\n`);
	return filePath;
}

async function buildTerminalApprovalCliFixture() {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'science-terminal-approval-cli-')));
	const outputRoot = path.join(root, 'generation');
	const specificationSha256 = '1'.repeat(64);
	try {
		const rows = [];
		for (let shardIndex = 0; shardIndex < 51; shardIndex += 1) {
			const shardId = `science-${String(shardIndex + 1).padStart(3, '0')}`;
			const rowCount = shardIndex < 2 ? 2 : 1;
			for (let itemIndex = 0; itemIndex < rowCount; itemIndex += 1) {
				const globalIndex = rows.length;
				const suffix = `${String(shardIndex + 1).padStart(3, '0')}-${itemIndex + 1}`;
				rows.push({
					id: `biology-terminal-cli-${suffix}`,
					shard: shardId,
					subject: 'biology',
					specificationId: 'aqa-gcse-biology-8461-v1-0',
					specificationSha256,
					curriculumComponentId: `biology-terminal-component-${suffix}`,
					calibrationQuestionId: `paper-terminal-question-${suffix}`,
					calibrationQuestionSha256: canonicalHash({
						kind: 'terminal-approval-calibration',
						suffix
					}),
					difficulty: shardIndex < 2 ? (itemIndex === 0 ? 'starter' : 'stretch') : 'standard',
					taskShape: 'explanation',
					arc: 'connect-cause-to-effect',
					mechanic: 'missing-link',
					fixtureGlobalIndex: globalIndex
				});
			}
		}
		const curriculumCatalog = {
			schemaVersion: 'science-terminal-approval-curriculum/v1',
			components: rows.map((row) => ({
				componentId: row.curriculumComponentId,
				specificationId: row.specificationId,
				specificationSha256: row.specificationSha256
			}))
		};
		const curriculumCatalogPath = writeJson(root, 'curriculum-catalog.json', curriculumCatalog);
		const plan = {
			planId: 'science-terminal-approval-cli-v1',
			existingRoundCount: 0,
			curriculumCatalogPath: path.relative(root, curriculumCatalogPath),
			curriculumCatalogSha256: canonicalHash(curriculumCatalog),
			rows
		};
		const sourceSnapshot = {
			schemaVersion: 'science-terminal-approval-source/v1',
			sourceDocuments: [],
			questions: rows.map((row) => ({
				id: row.calibrationQuestionId,
				contentSha256: row.calibrationQuestionSha256,
				sourceQuestionRef: row.calibrationQuestionId,
				promptText: `Explain the calibrated biological sequence for ${row.id}.`,
				selfContainedPromptText: `Explain the calibrated biological sequence for ${row.id}.`,
				contextText: 'All required biological context is provided in the question.',
				commandWord: 'Explain',
				marks: 3,
				answerFormat: 'extended response',
				renderingOverlays: [],
				markScheme: [{ mark: 1, text: 'One relevant biological link.' }],
				checklist: ['State the cause.', 'Link it to the effect.'],
				modelAnswers: ['A complete cause-and-effect explanation.'],
				answerKeys: [],
				primaryChain: ['cause', 'link', 'effect'],
				weakAnswers: ['A response that omits the link.'],
				requiredAssets: []
			}))
		};
		const curriculumEvidence = {
			schemaVersion: 'science-terminal-approval-evidence/v1',
			components: rows.map((row, index) => ({
				componentId: row.curriculumComponentId,
				specificationId: row.specificationId,
				specificationSha256: row.specificationSha256,
				code: `4.${index + 1}`,
				title: `Terminal approval component ${index + 1}`,
				pageStart: index + 1,
				pageEnd: index + 1,
				sourceText: `Learners should explain the exact biological relationship for component ${index + 1}.`
			}))
		};
		const planPath = writeJson(root, 'plan.json', plan);
		const sourcePath = writeJson(root, 'source.json', sourceSnapshot);
		const evidencePath = writeJson(root, 'evidence.json', curriculumEvidence);
		mkdirSync(path.join(root, 'src/lib/challenges'), { recursive: true });
		writeFileSync(
			path.join(root, 'src/lib/challenges/catalog.ts'),
			'export const challengeCatalog = [];\n'
		);

		const sourceById = new Map(sourceSnapshot.questions.map((question) => [question.id, question]));
		const curriculumById = new Map(
			curriculumEvidence.components.map((component) => [component.componentId, component])
		);
		const priorCandidateByShard = new Map();
		const priorValidationByShard = new Map();
		for (let shardIndex = 0; shardIndex < 51; shardIndex += 1) {
			const shardId = `science-${String(shardIndex + 1).padStart(3, '0')}`;
			const shardRows = rows.filter((row) => row.shard === shardId);
			const inputs = shardRows.map((row, index) =>
				buildFixtureAuthoringInput({
					row,
					shardIndex: index,
					plan,
					sourceById,
					curriculumById
				})
			);
			const candidate = {
				schemaVersion: 'science-challenge-batch/v1',
				challenges: shardRows.map((row) =>
					makeFixtureChallenge(row, {
						globalIndex: rows.findIndex((candidateRow) => candidateRow.id === row.id),
						variant: 'prior',
						difficulty: row.difficulty
					})
				)
			};
			const validation = await writeOrdinaryFixtureShard({
				outputRoot,
				shardId,
				inputs,
				candidate
			});
			priorCandidateByShard.set(
				shardId,
				JSON.parse(readFileSync(path.join(outputRoot, 'shards', shardId, 'candidate.json'), 'utf8'))
			);
			priorValidationByShard.set(shardId, validation);
		}

		const verification = writeFixtureVerificationEvidence({
			root,
			plan,
			sourceSnapshot,
			curriculumEvidence,
			priorCandidateByShard
		});
		const repairSha256 = canonicalHash(verification.summary);
		const identity = scienceChallengeVerificationRepairExecutionIdentity({
			planSha256: canonicalHash(plan),
			verificationSha256: repairSha256,
			priorCandidateSetSha256: verification.summary.candidateSetSha256,
			model: 'chatgpt-gpt-5.6-sol',
			transport: 'llm-direct',
			responseMode: 'structured-json',
			thinkingLevel: 'max',
			directPartSize: 1
		});
		const ledgerRoot = verificationRepairExecutionLedgerRoot(root, identity.objectiveId);
		initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });

		for (const shardId of ['science-001', 'science-002']) {
			const shardDir = path.join(outputRoot, 'shards', shardId);
			const repairRoot = path.join(shardDir, `verification-repair-${repairSha256.slice(0, 12)}`);
			mkdirSync(repairRoot, { recursive: true });
			writeBoundJson(path.join(repairRoot, 'verification-summary.json'), verification.summary);
			writeBoundJson(
				path.join(repairRoot, 'prior-candidate.json'),
				priorCandidateByShard.get(shardId)
			);
			writeBoundJson(
				path.join(repairRoot, 'prior-validation.json'),
				priorValidationByShard.get(shardId)
			);
			for (let attempt = 1; attempt <= 4; attempt += 1) {
				claimVerificationRepairExecutionAttempt({
					ledgerRoot,
					identity,
					shardId,
					attempt,
					outputRoot
				});
			}
		}

		await prepareRepairShard({
			root,
			outputRoot,
			plan,
			sourceById,
			curriculumById,
			priorCandidate: priorCandidateByShard.get('science-001'),
			priorValidation: priorValidationByShard.get('science-001'),
			verificationSummary: verification.summary,
			repairSha256,
			shardId: 'science-001',
			sourceAttempts: [
				{ attempt: 3, variant: 'eligible-three' },
				{ attempt: 4, variant: 'eligible-four' }
			]
		});
		await prepareRepairShard({
			root,
			outputRoot,
			plan,
			sourceById,
			curriculumById,
			priorCandidate: priorCandidateByShard.get('science-002'),
			priorValidation: priorValidationByShard.get('science-002'),
			verificationSummary: verification.summary,
			repairSha256,
			shardId: 'science-002',
			sourceAttempts: [{ attempt: 4, variant: 'sole-four' }]
		});
		return {
			root,
			outputRoot,
			ledgerRoot,
			planPath,
			sourcePath,
			evidencePath,
			verificationPath: verification.summaryPath,
			repairSha256,
			identity
		};
	} catch (error) {
		rmSync(root, { recursive: true, force: true });
		throw error;
	}
}

async function writeOrdinaryFixtureShard({ outputRoot, shardId, inputs, candidate }) {
	const shardDir = path.join(outputRoot, 'shards', shardId);
	const attemptDir = path.join(shardDir, 'attempt-01');
	mkdirSync(attemptDir, { recursive: true });
	writeBoundJson(path.join(shardDir, 'input.json'), inputs);
	const prompt = buildScienceChallengeAuthoringPrompt({
		inputs,
		existingChallengeDefinitions: []
	});
	writeFileSync(path.join(shardDir, 'prompt-attempt-1.txt'), `${prompt}\n`);
	await runDirectScienceChallengeJsonTurn({
		prompt,
		outputSchema: challengeBatchOutputSchema(candidate.challenges.length),
		eventsPath: path.join(attemptDir, 'events.jsonl'),
		lastMessagePath: path.join(attemptDir, 'last-message.json'),
		thoughtsPath: path.join(attemptDir, 'thoughts.txt'),
		requestPath: path.join(attemptDir, 'request.json'),
		resultMetadataPath: path.join(attemptDir, 'result-metadata.json'),
		summaryPath: path.join(attemptDir, 'run-summary.json'),
		streamJsonImpl: successfulFixtureDirectStream(candidate, shardId)
	});
	const summary = JSON.parse(readFileSync(path.join(attemptDir, 'run-summary.json'), 'utf8'));
	const rawCandidate = JSON.parse(readFileSync(path.join(attemptDir, 'last-message.json'), 'utf8'));
	const normalizedCandidate = normalizeGeneratedChallengeBatch(rawCandidate);
	const validation = {
		status: 'passed',
		issues: [],
		inputSha256: canonicalHash({
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			inputs
		}),
		verificationRepairSha256: null,
		verificationRepairCohortIssues: null,
		priorCandidateSha256: null,
		rawCandidateSha256: canonicalHash(rawCandidate),
		candidateSha256: canonicalHash(normalizedCandidate),
		normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
		promptSha256: sha256(`${prompt}\n`),
		runSummarySha256: canonicalHash(summary),
		transport: summary.transport,
		transportVersion: summary.transportVersion,
		responseMode: summary.responseMode,
		providerSchemaApplied: summary.providerSchemaApplied,
		provider: summary.provider,
		model: summary.model,
		modelVersion: summary.modelVersion,
		modelVersions: null,
		directPartSize: null,
		thinkingLevel: summary.thinkingLevel,
		transportError: null
	};
	writeBoundJson(path.join(attemptDir, 'candidate.json'), normalizedCandidate);
	writeBoundJson(path.join(attemptDir, 'validation.json'), validation);
	writeBoundJson(path.join(shardDir, 'candidate.json'), normalizedCandidate);
	writeBoundJson(path.join(shardDir, 'validation.json'), validation);
	return validation;
}

function writeFixtureVerificationEvidence({
	root,
	plan,
	sourceSnapshot,
	curriculumEvidence,
	priorCandidateByShard
}) {
	const verificationRoot = path.join(root, 'verification');
	const assignmentRoot = path.join(verificationRoot, 'assignments');
	const reviewRoot = path.join(verificationRoot, 'reviews');
	mkdirSync(assignmentRoot, { recursive: true });
	mkdirSync(reviewRoot, { recursive: true });
	const candidateById = new Map(
		[...priorCandidateByShard.values()].flatMap((candidate) =>
			candidate.challenges.map((entry) => [entry.definition.id, entry])
		)
	);
	const candidateSet = plan.rows.map((row) => candidateById.get(row.id));
	const candidateSetSha256 = canonicalHash(candidateSet);
	const assignmentValues = new Map();
	const assignments = [...new Set(plan.rows.map((row) => row.shard))].map((assignmentId) => {
		const assignmentRows = plan.rows.filter((row) => row.shard === assignmentId);
		const assignmentCore = {
			schemaVersion: 'science-challenge-verification-assignment/v2',
			assignmentId,
			planSha256: canonicalHash(plan),
			basePlanSha256: canonicalHash(plan),
			effectivePlanSha256: canonicalHash(plan),
			sourceSnapshotSha256: canonicalHash(sourceSnapshot),
			curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
			items: assignmentRows.map((row) => ({
				planRowIndex: plan.rows.findIndex((candidateRow) => candidateRow.id === row.id),
				plan: row,
				candidate: candidateById.get(row.id),
				sameCurriculumComponentPeerEvidence: buildSameCurriculumComponentPeerEvidence({
					currentRow: row,
					planRows: plan.rows,
					candidateById
				})
			}))
		};
		const assignment = {
			...assignmentCore,
			evidenceSha256: canonicalHash(assignmentCore)
		};
		const assignmentPath = path.join(assignmentRoot, `${assignmentId}.json`);
		writeBoundJson(assignmentPath, assignment);
		assignmentValues.set(assignmentId, assignment);
		return {
			assignmentId,
			path: path.relative(root, assignmentPath),
			sha256: canonicalHash(assignment),
			ids: assignmentRows.map((row) => row.id)
		};
	});
	const index = {
		schemaVersion: 'science-challenge-verification-assignment-index/v1',
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		basePlanSha256: canonicalHash(plan),
		effectivePlanSha256: canonicalHash(plan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateCount: candidateSet.length,
		candidateSetSha256,
		assignments
	};
	writeBoundJson(path.join(verificationRoot, 'assignment-index.json'), index);
	const dispatches = assignments.map((assignment, assignmentIndex) => ({
		assignmentId: assignment.assignmentId,
		assignmentPath: assignment.path,
		assignmentSha256: assignment.sha256,
		orchestrator: 'codex-collaboration',
		taskName: `/root/science_verify_${String(Math.floor(assignmentIndex / 17) + 1).padStart(
			3,
			'0'
		)}`,
		forkTurns: 'none',
		model: 'gpt-5.6-sol',
		reasoningEffort: 'max'
	}));
	const ledger = {
		schemaVersion: 'science-challenge-verifier-dispatch-ledger/v1',
		orchestrator: 'codex-collaboration',
		indexSha256: canonicalHash(index),
		createdAt: '2026-07-23T00:00:00.000Z',
		dispatches
	};
	writeBoundJson(path.join(verificationRoot, 'dispatch-ledger.json'), ledger);

	const reviews = [];
	const assignmentResults = assignments.map((assignment, assignmentIndex) => {
		const assignmentReviews = assignment.ids.map((id) =>
			id.startsWith('biology-terminal-cli-001-') || id.startsWith('biology-terminal-cli-002-')
				? rejectedFixtureContentReview(id)
				: acceptedFixtureContentReview(id)
		);
		reviews.push(...assignmentReviews);
		const dispatch = dispatches[assignmentIndex];
		const verifier = {
			context: 'empty',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'max',
			reviewedAt: '2026-07-23T01:00:00.000Z',
			provenance: {
				orchestrator: 'codex-collaboration',
				taskName: dispatch.taskName,
				forkTurns: 'none',
				dispatchLedgerSha256: canonicalHash(ledger)
			}
		};
		const result = {
			schemaVersion: 'science-challenge-independent-verification/v1',
			assignmentId: assignment.assignmentId,
			assignmentEvidenceSha256: assignmentValues.get(assignment.assignmentId).evidenceSha256,
			verifier,
			reviews: assignmentReviews
		};
		const resultPath = path.join(reviewRoot, `${assignment.assignmentId}.json`);
		writeBoundJson(resultPath, result);
		return {
			assignmentId: assignment.assignmentId,
			path: path.relative(root, resultPath),
			sha256: canonicalHash(result),
			verifier,
			status: 'passed',
			issues: []
		};
	});
	const acceptedCount = reviews.filter((review) => review.accepted).length;
	const rejectedCount = reviews.length - acceptedCount;
	const summary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		basePlanSha256: canonicalHash(plan),
		effectivePlanSha256: canonicalHash(plan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateSetSha256,
		indexSha256: canonicalHash(index),
		dispatchLedgerSha256: canonicalHash(ledger),
		status: 'failed',
		assignmentCount: assignments.length,
		reviewCount: reviews.length,
		acceptedCount,
		rejectedCount,
		acceptedRemapDecisionCount: 0,
		rejectedRemapDecisionCount: 0,
		issues: [],
		assignmentResults,
		reviews
	};
	const summaryPath = path.join(verificationRoot, 'summary.json');
	writeBoundJson(summaryPath, summary);
	return { summary, summaryPath };
}

async function prepareRepairShard({
	outputRoot,
	plan,
	sourceById,
	curriculumById,
	priorCandidate,
	verificationSummary,
	repairSha256,
	shardId,
	sourceAttempts
}) {
	const shardDir = path.join(outputRoot, 'shards', shardId);
	const rows = plan.rows.filter((row) => row.shard === shardId);
	const inputs = rows.map((row, index) =>
		buildFixtureAuthoringInput({
			row,
			shardIndex: index,
			plan,
			sourceById,
			curriculumById
		})
	);
	const inputSha256 = canonicalHash({
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
		inputs,
		priorCandidateSha256: canonicalHash(priorCandidate),
		verificationSummarySha256: repairSha256
	});
	const sourceAttemptByNumber = new Map(
		sourceAttempts.map((sourceAttempt) => [sourceAttempt.attempt, sourceAttempt])
	);
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		const sourceAttempt = sourceAttemptByNumber.get(attempt);
		const attemptDir = path.join(
			shardDir,
			`verification-repair-${repairSha256.slice(0, 12)}-attempt-${String(attempt).padStart(2, '0')}`
		);
		if (!sourceAttempt) {
			mkdirSync(attemptDir, { recursive: true });
			continue;
		}
		const attemptDirectory = path.basename(attemptDir);
		const orchestrationPrompt = reconstructScienceChallengeAuthoringAttemptPrompt({
			shardDir,
			attemptDirectory,
			rows,
			inputs,
			existingChallengeDefinitions: []
		});
		const parts = reconstructScienceChallengeMultipartAttemptParts({
			shardDir,
			attemptDirectory,
			rows,
			inputs,
			partSize: 1,
			existingChallengeDefinitions: [],
			allPlanIds: plan.rows.map((row) => row.id)
		});
		const candidate = {
			schemaVersion: 'science-challenge-batch/v1',
			challenges: rows.map((row) =>
				makeFixtureChallenge(row, {
					globalIndex: plan.rows.findIndex((candidateRow) => candidateRow.id === row.id),
					variant: sourceAttempt.variant,
					difficulty: 'standard'
				})
			)
		};
		let partIndex = 0;
		await runDirectScienceChallengeMultipartTurn({
			parts,
			partSize: 1,
			attemptDir,
			orchestrationPrompt,
			inputSha256,
			runPartImpl: (options) => {
				const partCandidate = {
					schemaVersion: 'science-challenge-batch/v1',
					challenges: [candidate.challenges[partIndex]]
				};
				const streamJsonImpl = successfulFixtureDirectStream(
					partCandidate,
					`${shardId}-${attempt}-${partIndex + 1}`
				);
				partIndex += 1;
				return runDirectScienceChallengeJsonTurn({
					...options,
					streamJsonImpl
				});
			}
		});
		const summary = JSON.parse(readFileSync(path.join(attemptDir, 'run-summary.json'), 'utf8'));
		const rawCandidate = JSON.parse(
			readFileSync(path.join(attemptDir, 'last-message.json'), 'utf8')
		);
		const normalizedCandidate = normalizeGeneratedChallengeBatch(rawCandidate);
		const promptBytes = Buffer.from(`${orchestrationPrompt}\n`);
		const validation = {
			status: 'failed',
			issues: rows.map((row) => `${row.id}: definition.difficulty differs from the plan row.`),
			inputSha256,
			verificationRepairSha256: repairSha256,
			verificationRepairCohortIssues: [],
			priorCandidateSha256: canonicalHash(priorCandidate),
			rawCandidateSha256: canonicalHash(rawCandidate),
			candidateSha256: canonicalHash(normalizedCandidate),
			normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			promptSha256: sha256(promptBytes),
			runSummarySha256: canonicalHash(summary),
			transport: summary.transport,
			transportVersion: summary.transportVersion,
			responseMode: summary.responseMode,
			providerSchemaApplied: summary.providerSchemaApplied,
			provider: summary.provider,
			model: summary.model,
			modelVersion: null,
			modelVersions: summary.modelVersions,
			directPartSize: summary.partSize,
			thinkingLevel: summary.thinkingLevel,
			transportError: null
		};
		writeFileSync(
			path.join(
				shardDir,
				`verification-repair-${repairSha256.slice(0, 12)}-prompt-attempt-${attempt}.txt`
			),
			promptBytes
		);
		writeBoundJson(path.join(attemptDir, 'candidate.json'), normalizedCandidate);
		writeBoundJson(path.join(attemptDir, 'validation.json'), validation);
	}
}

function buildFixtureAuthoringInput({ row, shardIndex, plan, sourceById, curriculumById }) {
	const source = sourceById.get(row.calibrationQuestionId);
	const curriculum = curriculumById.get(row.curriculumComponentId);
	const globalIndex = plan.rows.findIndex((candidate) => candidate.id === row.id);
	return {
		plan: {
			...row,
			expectedAnswerPositions: {
				strongerAnswer: globalIndex % 2 === 0 ? 'a' : 'b',
				diagnosisCorrectIndex: globalIndex % 3,
				repairCorrectIndex: (globalIndex + 1) % 3,
				transferCorrectIndex: (globalIndex + 2) % 3
			}
		},
		curriculum: {
			componentId: curriculum.componentId,
			specificationId: curriculum.specificationId,
			specificationSha256: curriculum.specificationSha256,
			code: curriculum.code,
			title: curriculum.title,
			pageStart: curriculum.pageStart,
			pageEnd: curriculum.pageEnd,
			officialPageText: curriculum.sourceText
		},
		calibrationEvidence: {
			id: source.id,
			contentSha256: source.contentSha256,
			sourceDocument: null,
			sourceQuestionRef: source.sourceQuestionRef,
			promptText: source.promptText,
			selfContainedPromptText: source.selfContainedPromptText,
			contextText: source.contextText,
			commandWord: source.commandWord,
			marks: source.marks,
			answerFormat: source.answerFormat,
			renderingOverlays: source.renderingOverlays,
			markScheme: source.markScheme,
			checklist: source.checklist,
			modelAnswers: source.modelAnswers,
			answerKeys: source.answerKeys,
			primaryChain: source.primaryChain,
			weakAnswers: source.weakAnswers,
			assets: []
		},
		shardIndex
	};
}

function makeFixtureChallenge(row, { globalIndex, variant, difficulty }) {
	const correctPositions = {
		diagnosis: globalIndex % 3,
		repair: (globalIndex + 1) % 3,
		transfer: (globalIndex + 2) % 3
	};
	const strongerAnswer = globalIndex % 2 === 0 ? 'a' : 'b';
	const strongText =
		'The relevant cells are selected, cloned and used to produce one specific biological product.';
	const weakText =
		'The available cells are collected, mixed and used to produce one general biological product.';
	const variantSlug = slug(`${variant}-${row.id}`);
	const variantLabel = variant.replaceAll('-', ' ');
	return {
		definition: {
			id: row.id,
			slug: variantSlug,
			subject: 'biology',
			subjectArtTheme: 'regulation-immunity',
			title: `How is ${variantLabel} ${row.id} checked?`,
			topic: `Biological sequence ${row.id}`,
			hook: `One plausible ${variantLabel} explanation misses the decisive biological link.`,
			arc: row.arc,
			mechanic: row.mechanic,
			difficulty,
			marks: 3,
			estimatedMinutes: 4,
			previewQuestion: `Explain the complete biological sequence in opening context ${variantLabel} ${row.id}.`,
			questionPresentation: null,
			metaDescription: `Practise a calibrated GCSE Biology explanation for ${row.id}, identify its missing causal link, and repair the response precisely.`,
			sourceQuestionId: row.calibrationQuestionId,
			lastReviewed: '2026-07-21',
			version: 1,
			staticAnswers:
				strongerAnswer === 'a' ? { a: strongText, b: weakText } : { a: weakText, b: strongText },
			strongerAnswer,
			weakAnswer: strongerAnswer === 'a' ? 'b' : 'a',
			weakAnswerKind: 'incomplete',
			showdownExplanation:
				'The stronger answer includes the decisive controlled biological link that the weaker answer omits.',
			commandWordLesson: 'Explain means connect each biological stage to the next result.',
			diagnosisPrompt: 'Which scientific link is missing from the weaker answer?',
			diagnosisChoices: fixtureChoices(
				'It omits the controlled selection and cloning stage.',
				correctPositions.diagnosis
			),
			repairPrompt: 'Which phrase repairs the weaker answer most precisely?',
			repairChoices: fixtureChoices(
				'Select the required cell and clone it under controlled conditions.',
				correctPositions.repair
			),
			freeTextKeywordGroups: [['select'], ['clone'], ['specific product']],
			repairSuccess:
				'The repaired answer now includes the controlled selection and cloning stages.',
			transferPromptLead: `Apply the same reasoning to distinct transfer context ${variantLabel} ${row.id} and identify the controlled sequence.`,
			transferChoices: fixtureChoices(
				'Clone one selected cell so its biological product stays specific.',
				correctPositions.transfer
			),
			transferExplanation:
				'Cloning one selected cell preserves the required biological specificity.',
			memoryHandle: 'Identify → select → clone → check'
		},
		grounding: {
			curriculumComponentId: row.curriculumComponentId,
			specificationId: row.specificationId,
			specificationSha256: row.specificationSha256,
			calibrationQuestionId: row.calibrationQuestionId,
			calibrationQuestionSha256: row.calibrationQuestionSha256
		},
		art: {
			opening: fixtureArt(row.id, 'opening', `Sealed opening laboratory vessel for ${variantSlug}`),
			transfer: fixtureArt(
				row.id,
				'transfer',
				`Sealed transfer laboratory bench for ${variantSlug}`
			)
		}
	};
}

function fixtureChoices(correctText, correctIndex) {
	const choices = [
		{
			id: 'wrong-before',
			text: 'Use every available cell without any controlled selection.',
			feedback: 'This does not preserve biological specificity.',
			correct: false
		},
		{
			id: 'wrong-after',
			text: 'Mix the final products until they become biologically identical.',
			feedback: 'Mixing final products does not make their source controlled.',
			correct: false
		}
	];
	choices.splice(correctIndex, 0, {
		id: 'correct-link',
		text: correctText,
		feedback: 'This supplies the decisive controlled biological link.',
		correct: true
	});
	return choices;
}

function fixtureArt(challengeId, context, scene) {
	return {
		schemaVersion: SCIENCE_QUESTION_ART_SCHEMA,
		id: `${challengeId}-${context}`,
		context,
		scene,
		visualAnchor: `${scene} with one central sealed culture vessel`,
		altText: `${scene} arranged as a text-free laboratory still life.`,
		approvedMeaning:
			'The laboratory setting is visible without revealing the correct biological sequence.',
		accuracyConstraints: ['Show intact laboratory equipment.', 'Keep all culture vessels sealed.'],
		forbiddenDetails: ['Do not show the final answer.', 'Do not add labels, arrows or equations.']
	};
}

function acceptedFixtureContentReview(id) {
	return {
		id,
		accepted: true,
		curriculumGrounded: true,
		paperCalibrated: true,
		scientificallyCorrect: true,
		contextsDistinct: true,
		selfContained: true,
		flowCoherent: true,
		choicesFair: true,
		difficultyCalibrated: true,
		learnerCopyClean: true,
		artBriefsSafe: true,
		heroTeaserSafe: true,
		checkedCalculations: [],
		issues: []
	};
}

function rejectedFixtureContentReview(id) {
	return {
		...acceptedFixtureContentReview(id),
		accepted: false,
		difficultyCalibrated: false,
		issues: [
			{
				field: 'definition.difficulty',
				category: 'difficulty',
				evidence: 'The candidate difficulty does not match the required cohort calibration.',
				repair: 'Return a fully validated challenge at the plan-bound difficulty.'
			}
		]
	};
}

function successfulFixtureDirectStream(batch, label) {
	const rawText = JSON.stringify(batch);
	const thoughts = `Checked immutable terminal approval fixture ${label}.`;
	const modelVersion = `chatgpt-gpt-5.6-sol-terminal-${slug(label)}`;
	const usage = {
		promptTokens: 20,
		responseTokens: 10,
		thinkingTokens: 5,
		totalTokens: 35
	};
	return () => ({
		events: {
			async *[Symbol.asyncIterator]() {
				yield { type: 'delta', channel: 'thought', text: thoughts };
				yield { type: 'delta', channel: 'response', text: rawText };
				yield { type: 'model', modelVersion };
				yield { type: 'usage', usage, costUsd: 0.001, modelVersion };
				yield { type: 'json', stage: 'final', value: batch };
			}
		},
		result: Promise.resolve({
			value: batch,
			rawText,
			result: {
				provider: 'chatgpt',
				model: 'chatgpt-gpt-5.6-sol',
				modelVersion,
				text: rawText,
				thoughts,
				blocked: false,
				usage,
				costUsd: 0.001
			}
		}),
		abort() {}
	});
}

function terminalApprovalArgs(fixture) {
	return [
		`--plan=${fixture.planPath}`,
		`--source=${fixture.sourcePath}`,
		`--evidence=${fixture.evidencePath}`,
		`--output-root=${fixture.outputRoot}`,
		`--repair-verification=${fixture.verificationPath}`,
		'--resume',
		'--transport=llm-direct',
		'--direct-response-mode=structured-json',
		'--direct-part-size=1',
		'--thinking-level=max',
		'--timeout-ms=5000'
	];
}

function assertApprovalFailureWithoutWrites(fixture, approvalPaths, pattern) {
	const before = snapshotRepairState(fixture);
	const result = runInRoot(fixture.root, [
		...terminalApprovalArgs(fixture),
		...approvalPaths.map((approvalPath) => `--multipart-salvage-source-approval=${approvalPath}`)
	]);
	assert.notEqual(result.status, 0, approvalPaths.join(', '));
	assert.match(result.stderr, pattern);
	assert.deepEqual(snapshotRepairState(fixture), before);
	assert.doesNotMatch(result.stderr, /ECONNREFUSED|transport preflight failed/i);
}

function snapshotRepairState(fixture) {
	return {
		output: snapshotDirectory(fixture.outputRoot),
		ledger: snapshotDirectory(fixture.ledgerRoot)
	};
}

function snapshotDirectory(directory) {
	if (!existsSync(directory)) return [];
	const rows = [];
	const visit = (current, relative) => {
		for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) =>
			left.name.localeCompare(right.name)
		)) {
			const absolutePath = path.join(current, entry.name);
			const relativePath = path.join(relative, entry.name);
			if (entry.isDirectory()) {
				rows.push({ path: `${relativePath}/`, type: 'directory' });
				visit(absolutePath, relativePath);
				continue;
			}
			const stats = statSync(absolutePath, { bigint: true });
			rows.push({
				path: relativePath,
				type: 'file',
				size: String(stats.size),
				mtimeNs: String(stats.mtimeNs),
				sha256: sha256(readFileSync(absolutePath))
			});
		}
	};
	visit(directory, '');
	return rows;
}

function writeBoundJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}

function slug(value) {
	return String(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
