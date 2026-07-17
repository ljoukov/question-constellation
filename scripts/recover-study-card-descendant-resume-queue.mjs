#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Historical rollout JSONL is validated before it contributes coverage.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateStudyCardBundle } from './lib/study-card-artifact.mjs';

const QUEUE_STARTED_AT = '2026-07-16T18:34:07.305Z';
const ORIGINAL_RECOMMENDED_CARD_COUNT = 532;
const FAILED_BATCH_ID =
	'aqa-combined-science-trilogy-8464-physics-shared-descendants-03-e7b6933413-v1';
const RUNNING_BATCH_IDS = new Set([
	'aqa-chemistry-8462-chemistry-higher-only-descendants-01-f5183346cd-v1',
	'aqa-computer-science-8525-computer-science-all-descendants-01-ea3593b819-v1'
]);
const ACCIDENTAL_INTERRUPTED_BATCH_IDS = [
	'aqa-physics-8463-physics-higher-only-descendants-01-6fced879cf-v1',
	'aqa-biology-8461-biology-higher-only-descendants-01-f6a241e8b9-v1'
];

const missingBaseLineages = [
	{
		releaseId: 'aqa-biology-8461-standard-v1',
		specificationId: 'aqa-gcse-biology-8461-v1.0',
		subject: 'Biology',
		generationRunIds: ['019f6bcf-35e8-7c63-b8ba-e189fea5788d'],
		reviewRunId: '019f6bf1-00cd-77b1-8d56-7299e68d3874',
		acceptedRepairRunIds: [],
		expectedAcceptedCards: 26
	},
	{
		releaseId: 'aqa-history-8145-standard-v1',
		specificationId: 'aqa-gcse-history-8145-v1.3',
		subject: 'History',
		generationRunIds: ['019f6bcf-37cf-78e2-9ea0-e534dac0309c'],
		reviewRunId: '019f6be5-ab67-76c2-9aa5-2e869bcfb19d',
		acceptedRepairRunIds: ['019f6bfb-0a55-7653-97dc-36cc4d3cd8f2'],
		expectedAcceptedCards: 73
	},
	{
		releaseId: 'aqa-chemistry-8462-standard-v1',
		specificationId: 'aqa-gcse-chemistry-8462-v1.1',
		subject: 'Chemistry',
		generationRunIds: ['019f6c04-d1a1-7493-85bd-dbe904f31811'],
		reviewRunId: '019f6c10-902d-7dd2-a6f1-a86175d2f6d0',
		acceptedRepairRunIds: [],
		expectedAcceptedCards: 37
	},
	{
		releaseId: 'aqa-physics-8463-standard-v1',
		specificationId: 'aqa-gcse-physics-8463-v1.1',
		subject: 'Physics',
		generationRunIds: ['019f6c04-d167-7a00-9fe9-a8640c321f5a'],
		reviewRunId: '019f6c0c-170c-7ec2-8834-878572263196',
		acceptedRepairRunIds: [],
		expectedAcceptedCards: 31
	},
	{
		releaseId: 'aqa-combined-biology-8464-standard-v1',
		specificationId: 'aqa-gcse-combined-science-trilogy-8464-v1.1',
		subject: 'Biology',
		generationRunIds: ['019f6c11-b988-7933-b4f4-09c525d34e76'],
		reviewRunId: '019f6c1a-8864-7911-9e35-56d2f21c7e79',
		acceptedRepairRunIds: [],
		expectedAcceptedCards: 25
	},
	{
		releaseId: 'aqa-combined-chemistry-8464-standard-v1',
		specificationId: 'aqa-gcse-combined-science-trilogy-8464-v1.1',
		subject: 'Chemistry',
		generationRunIds: ['019f6c18-d2b3-70d1-bd85-198a97e2179e'],
		reviewRunId: '019f6c24-fc72-73e2-9745-10fbbbe6dfdb',
		acceptedRepairRunIds: [],
		expectedAcceptedCards: 35
	},
	{
		releaseId: 'aqa-combined-physics-8464-standard-v1',
		specificationId: 'aqa-gcse-combined-science-trilogy-8464-v1.1',
		subject: 'Physics',
		generationRunIds: ['019f6c21-cdcd-79f1-9d07-e4658280830e'],
		reviewRunId: '019f6c28-59f2-73b2-9167-d3c0a44d2f9f',
		acceptedRepairRunIds: ['019f6c31-f7cc-7e22-ae0f-0544d1b140be'],
		expectedAcceptedCards: 26
	}
];

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
const sessionRoot = path.resolve(
	args.sessionRoot ?? path.join(os.homedir(), '.codex/sessions/2026/07/16')
);
const evidenceDir = path.join(rootDir, 'docs/release-evidence/study-card-descendant-coverage');
const catalog = readJson(path.join(rootDir, 'data/curricula/curriculum-catalog.json'));
const acceptedManifest = readJson(
	path.join(rootDir, 'data/study-cards/rollout-recovery/accepted-descendant-releases.json')
);

const acceptedBatchIds = new Set(acceptedManifest.releases.map((row) => row.batchId));
if (acceptedBatchIds.size !== 12) throw new Error('Accepted descendant manifest must pin 12 jobs.');

const recoveredBase = recoverMissingBaseCoverage();
const coveredByGroup = existingBaseCoverage();
for (const base of recoveredBase) {
	const key = `${base.specificationId}|${base.subject}`;
	const covered = coveredByGroup.get(key) ?? new Set();
	for (const componentId of base.acceptedComponentIds) covered.add(componentId);
	coveredByGroup.set(key, covered);
}

const before = buildPlan(coveredByGroup);
const jobs = buildJobs(before);
if (before.plans.reduce((sum, plan) => sum + plan.recommendedCardCount, 0) !== 532) {
	throw new Error('Recovered base coverage did not reproduce the pinned 532-card queue input.');
}
if (jobs.length !== 35) throw new Error(`Recovered ${jobs.length} jobs instead of 35.`);

const unknownAccepted = [...acceptedBatchIds].filter(
	(batchId) => !jobs.some((job) => job.batchId === batchId)
);
if (unknownAccepted.length) {
	const comparable = jobs
		.filter((job) =>
			unknownAccepted.some((batchId) =>
				batchId.includes(`-${slug(job.subject)}-${job.mode}-descendants-`)
			)
		)
		.map((job) => job.batchId);
	throw new Error(
		`Accepted queue identities are absent: ${unknownAccepted.join(', ')}. Recovered comparable jobs: ${comparable.join(', ')}`
	);
}
for (const batchId of [FAILED_BATCH_ID, ...RUNNING_BATCH_IDS]) {
	if (!jobs.some((job) => job.batchId === batchId)) {
		throw new Error(`Pinned non-accepted queue identity is absent: ${batchId}`);
	}
}

for (const job of jobs) {
	if (acceptedBatchIds.has(job.batchId)) {
		const accepted = acceptedManifest.releases.find((row) => row.batchId === job.batchId);
		job.historicalStatus = 'accepted';
		job.resumeStatus = 'preserved-accepted';
		job.recoveryReleaseId = `${job.batchId}-rollout-recovered-v1`;
		job.acceptedCardCount = accepted.expectedAcceptedCards;
	} else if (job.batchId === FAILED_BATCH_ID) {
		job.historicalStatus = 'failed';
		job.resumeStatus = 'withheld-failed';
		job.startedAt = '2026-07-16T18:56:32.690Z';
		job.finishedAt = '2026-07-16T19:06:37.025Z';
		job.error = `Generator exited 1; inspect ${job.logPath}.`;
	} else if (RUNNING_BATCH_IDS.has(job.batchId)) {
		job.historicalStatus = 'running';
		job.resumeStatus = 'pending-from-interrupted-run';
		job.startedAt =
			job.subject === 'Chemistry' ? '2026-07-16T19:06:37.026Z' : '2026-07-16T19:07:18.509Z';
	} else {
		job.historicalStatus = 'queued';
		job.resumeStatus = 'pending-not-started';
	}
	job.command = resumeCommand(job);
}

const counts = statusCounts(jobs);
if (counts.accepted !== 12 || counts.failed !== 1 || counts.running !== 2 || counts.queued !== 20) {
	throw new Error(`Recovered queue status split drifted: ${JSON.stringify(counts)}.`);
}
const pending = jobs.filter((job) => ['running', 'queued'].includes(job.historicalStatus));
if (pending.length !== 22) throw new Error('Resume queue must contain exactly 22 pending jobs.');
const unresolved = jobs.filter((job) => job.historicalStatus !== 'accepted');
const unresolvedComponentIds = unresolved.flatMap((job) => job.componentIds);
if (
	unresolved.length !== 23 ||
	unresolvedComponentIds.length !== 450 ||
	new Set(unresolvedComponentIds).size !== 450 ||
	unresolved.some((job) => job.componentCount > 20)
) {
	throw new Error('Completion queue must be 23 non-overlapping jobs covering exactly 450 targets.');
}
const completionJobs = unresolved.map((job) => {
	const completionBatchId =
		job.historicalStatus === 'failed' ? `${job.batchId}-reviewed-retry-01` : job.batchId;
	return {
		...job,
		completionBatchId,
		completionAction:
			job.historicalStatus === 'failed'
				? 'fresh-reviewed-retry-preserving-failed-original'
				: job.historicalStatus === 'running'
					? 'trace-aware-resume-required'
					: 'fresh-generation',
		command: resumeCommand(job, completionBatchId)
	};
});

const queueState = {
	schemaVersion: 'study-card-descendant-coverage-recovered-queue-v1',
	status: 'frozen-recovery-no-model-execution',
	originalSchemaVersion: 'study-card-descendant-coverage-queue-v1',
	startedAt: QUEUE_STARTED_AT,
	acceptedSnapshotFinishedAt: null,
	maxConcurrent: 2,
	shardSize: 20,
	beforeRecommendedCardCount: ORIGINAL_RECOMMENDED_CARD_COUNT,
	modelCallsDuringRecovery: 0,
	statusCounts: counts,
	jobs,
	recovery: {
		missingBaseAcceptedCards: recoveredBase.reduce((sum, base) => sum + base.acceptedCardCount, 0),
		missingBaseReleases: recoveredBase,
		acceptedDescendantManifest:
			'data/study-cards/rollout-recovery/accepted-descendant-releases.json',
		policy:
			'Accepted jobs are immutable and excluded from resume. The failed job remains failed. Only the two interrupted and twenty never-started jobs are pending.'
	}
};
const resumeQueue = {
	schemaVersion: 'study-card-descendant-coverage-resume-v1',
	status: 'ready-but-not-started',
	modelCallsDuringRecovery: 0,
	maxConcurrent: 2,
	jobCount: pending.length,
	interruptedJobCount: pending.filter((job) => job.historicalStatus === 'running').length,
	neverStartedJobCount: pending.filter((job) => job.historicalStatus === 'queued').length,
	jobs: pending
};
const completionQueue = {
	schemaVersion: 'study-card-descendant-coverage-completion-v1',
	status: 'ready-but-not-started',
	modelCallsDuringRecovery: 0,
	maxConcurrent: 2,
	jobCount: completionJobs.length,
	targetCount: unresolvedComponentIds.length,
	uniqueTargetCount: new Set(unresolvedComponentIds).size,
	maximumTargetsPerJob: Math.max(...completionJobs.map((job) => job.componentCount)),
	duplicateTargetCount: unresolvedComponentIds.length - new Set(unresolvedComponentIds).size,
	jobs: completionJobs
};
const accidentalInterruptedAttempts = {
	schemaVersion: 'study-card-accidental-interrupted-attempt-quarantine-v1',
	status: 'quarantined-not-accepted',
	reason:
		'An accidental --help invocation started the runner because that CLI has no help-only mode. The exact process tree was terminated after approximately 15 seconds.',
	modelCallsInferredAsAccepted: 0,
	attempts: ACCIDENTAL_INTERRUPTED_BATCH_IDS.map((batchId) => {
		const workDir = path.join(rootDir, 'tmp/study-card-generation', batchId);
		return {
			batchId,
			workDir: path.relative(rootDir, workDir),
			workDirExists: existsSync(workDir),
			candidateExists: existsSync(path.join(workDir, 'candidate-cards.json')),
			reviewExists: existsSync(path.join(workDir, 'review.json')),
			acceptedArtifactExists: existsSync(
				path.join(rootDir, 'data/study-cards/releases', batchId, 'accepted-study-cards.json')
			),
			disposition: 'ignore-and-never-infer-acceptance'
		};
	})
};
if (
	accidentalInterruptedAttempts.attempts.some(
		(attempt) => attempt.candidateExists || attempt.reviewExists || attempt.acceptedArtifactExists
	)
) {
	throw new Error('An accidental interrupted attempt unexpectedly reached a reviewable artifact.');
}

mkdirSync(evidenceDir, { recursive: true });
writeJson(path.join(evidenceDir, 'recovered-before.json'), before);
writeJson(path.join(evidenceDir, 'recovered-queue-state.json'), queueState);
writeJson(path.join(evidenceDir, 'resume-queue.json'), resumeQueue);
writeJson(path.join(evidenceDir, 'completion-queue.json'), completionQueue);
writeJson(
	path.join(evidenceDir, 'quarantined-accidental-interrupted-attempts.json'),
	accidentalInterruptedAttempts
);

console.log(
	JSON.stringify(
		{
			status: queueState.status,
			beforeRecommendedCardCount: ORIGINAL_RECOMMENDED_CARD_COUNT,
			totalJobs: jobs.length,
			statusCounts: counts,
			resumeJobs: pending.length,
			completionJobs: completionJobs.length,
			completionTargets: unresolvedComponentIds.length,
			modelCalls: 0
		},
		null,
		2
	)
);

function recoverMissingBaseCoverage() {
	return missingBaseLineages.map((lineage) => {
		const generation = lineage.generationRunIds.map(loadSession);
		const review = loadSession(lineage.reviewRunId);
		const repairs = lineage.acceptedRepairRunIds.map(loadSession);
		const candidateById = new Map(
			[...generation, ...repairs].flatMap((session) =>
				session.output.cards.map((card) => [card.id, card])
			)
		);
		if (!Array.isArray(review.output.reviews)) {
			throw new Error(`${lineage.releaseId} review output is malformed.`);
		}
		const acceptedIds = [
			...review.output.reviews.filter((row) => row.accepted).map((row) => row.cardId),
			...repairs.flatMap((session) => session.output.cards.map((card) => card.id))
		];
		if (
			acceptedIds.length !== lineage.expectedAcceptedCards ||
			new Set(acceptedIds).size !== acceptedIds.length
		) {
			throw new Error(`${lineage.releaseId} accepted cardinality drifted.`);
		}
		const acceptedCards = acceptedIds.map((cardId) => {
			const card = candidateById.get(cardId);
			if (!card?.curriculumComponentId) {
				throw new Error(`${lineage.releaseId} is missing accepted card ${cardId}.`);
			}
			return card;
		});
		return {
			releaseId: lineage.releaseId,
			specificationId: lineage.specificationId,
			subject: lineage.subject,
			acceptedCardCount: acceptedCards.length,
			acceptedComponentCount: new Set(acceptedCards.map((card) => card.curriculumComponentId)).size,
			acceptedComponentIds: [...new Set(acceptedCards.map((card) => card.curriculumComponentId))],
			generatorRunIds: lineage.generationRunIds,
			reviewerRunId: lineage.reviewRunId,
			acceptedRepairRunIds: lineage.acceptedRepairRunIds,
			rolloutHashes: Object.fromEntries(
				[...generation, review, ...repairs].map((session) => [session.runId, session.fileHash])
			)
		};
	});
}

function existingBaseCoverage() {
	const releaseIds = [
		'aqa-geography-8035-standard-v1',
		'aqa-computer-science-2027-standard-v1',
		'ocr-english-language-j351-standard-v1-rollout-recovered-v1'
	];
	const offeringById = new Map(catalog.offerings.map((offering) => [offering.id, offering]));
	const covered = new Map();
	for (const releaseId of releaseIds) {
		const artifactPath = path.join(
			rootDir,
			'data/study-cards/releases',
			releaseId,
			'accepted-study-cards.json'
		);
		if (!existsSync(artifactPath)) throw new Error(`Missing recovered base ${releaseId}.`);
		const bundle = validateStudyCardBundle(readJson(artifactPath));
		for (const card of bundle.cards) {
			for (const target of card.targets) {
				const offering = offeringById.get(target.offeringId);
				if (!offering) throw new Error(`Unknown offering ${target.offeringId}.`);
				const key = `${offering.specificationId}|${offering.profileSubject}`;
				const values = covered.get(key) ?? new Set();
				values.add(target.curriculumComponentId);
				covered.set(key, values);
			}
		}
	}
	return covered;
}

function buildPlan(coveredByGroup) {
	const offeringGroups = new Map();
	for (const offering of catalog.offerings) {
		if (offering.profileSubject === 'English Literature') continue;
		const key = `${offering.specificationId}|${offering.profileSubject}`;
		const rows = offeringGroups.get(key) ?? [];
		rows.push(offering);
		offeringGroups.set(key, rows);
	}
	const plans = [];
	for (const [key, offerings] of offeringGroups) {
		const specification = catalog.specifications.find(
			(entry) => entry.id === offerings[0].specificationId
		);
		if (!specification) continue;
		const selectedRootIds = new Set(
			offerings.flatMap((offering) => offering.selectableComponentIds)
		);
		if (!selectedRootIds.size) continue;
		const componentById = new Map(
			specification.components.map((component) => [component.id, component])
		);
		const selectedRootFor = (componentId) => {
			let current = componentById.get(componentId);
			while (current) {
				if (selectedRootIds.has(current.id)) return current.id;
				current = componentById.get(current.parentId);
			}
			return null;
		};
		const eligibleComponents = specification.components.filter(
			(component) =>
				selectedRootFor(component.id) &&
				(component.kind === 'section' || component.kind === 'topic')
		);
		if (!eligibleComponents.length) continue;
		const covered = coveredByGroup.get(key) ?? new Set();
		const hasFoundation = offerings.some((offering) => offering.tier === 'Foundation');
		const hasHigher = offerings.some((offering) => offering.tier === 'Higher');
		const modes = hasFoundation && hasHigher ? ['shared', 'higher-only'] : ['all'];
		for (const mode of modes) {
			const applicable = eligibleComponents.filter((component) => {
				// The queue was materialized before tier inheritance was corrected.
				// Reproduce its direct component-tier partition exactly here; the
				// durable artifacts retain the later target-only correction.
				if (mode === 'higher-only') {
					return component.tier.length === 1 && component.tier[0] === 'Higher';
				}
				if (mode === 'shared') return component.tier.includes('Foundation');
				return true;
			});
			const uncovered = applicable.filter((component) => !covered.has(component.id));
			plans.push({
				key,
				specificationId: specification.id,
				subject: offerings[0].profileSubject,
				mode,
				offeringIds: offerings
					.filter((offering) => mode !== 'higher-only' || offering.tier === 'Higher')
					.map((offering) => offering.id),
				eligibleComponentCount: applicable.length,
				coveredComponentCount: applicable.length - uncovered.length,
				uncoveredComponentCount: uncovered.length,
				recommendedCardCount: uncovered.length,
				uncoveredComponents: uncovered.map((component) => ({
					id: component.id,
					parentId: component.parentId,
					kind: component.kind,
					tier: component.tier,
					code: component.code,
					title: component.title,
					selectableRootId: selectedRootFor(component.id)
				}))
			});
		}
	}
	return {
		generatedAt: QUEUE_STARTED_AT,
		definition:
			'One additive card for each uncovered official section or topic descendant; Higher-only rows are separate from Foundation/shared rows.',
		plans
	};
}

function buildJobs(before) {
	return before.plans
		.flatMap((plan) =>
			chunks(plan.uncoveredComponents, 20).map((components, index) => {
				const identityHash = sha256(components.map((component) => component.id).join('\n')).slice(
					0,
					10
				);
				const batchId = slug(
					`${shortSpecification(plan.specificationId)}-${plan.subject}-${plan.mode}-descendants-${String(index + 1).padStart(2, '0')}-${identityHash}-v1`
				);
				return {
					batchId,
					specificationId: plan.specificationId,
					subject: plan.subject,
					mode: plan.mode,
					offeringIds: plan.offeringIds,
					componentIds: components.map((component) => component.id),
					componentCount: components.length,
					logPath: `tmp/study-card-generation/descendant-coverage-logs/${batchId}.log`
				};
			})
		)
		.sort(
			(left, right) =>
				left.componentCount - right.componentCount || left.batchId.localeCompare(right.batchId)
		);
}

function resumeCommand(job, batchId = job.batchId) {
	return [
		'node',
		'scripts/generate-standard-study-card-batch.mjs',
		`--specification-id=${job.specificationId}`,
		`--subject=${job.subject}`,
		'--source-root=data/curricula/sources',
		`--batch-id=${batchId}`,
		'--generate',
		...job.offeringIds.map((id) => `--offering-id=${id}`),
		...job.componentIds.map((id) => `--required-component-id=${id}`)
	];
}

function loadSession(runId) {
	const fileName = readdirSync(sessionRoot).find((name) => name.endsWith(`-${runId}.jsonl`));
	if (!fileName) throw new Error(`Rollout JSONL is missing for ${runId}.`);
	const filePath = path.join(sessionRoot, fileName);
	const raw = readFileSync(filePath, 'utf8');
	const rows = raw
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
	const complete = rows
		.filter((row) => row.type === 'event_msg' && row.payload?.type === 'task_complete')
		.at(-1);
	if (!complete?.payload?.last_agent_message) {
		throw new Error(`${runId} lacks completed model output.`);
	}
	return {
		runId,
		fileHash: sha256(raw),
		output: JSON.parse(complete.payload.last_agent_message)
	};
}

function statusCounts(jobs) {
	return Object.fromEntries(
		['accepted', 'failed', 'running', 'queued'].map((status) => [
			status,
			jobs.filter((job) => job.historicalStatus === status).length
		])
	);
}

function shortSpecification(specificationId) {
	return specificationId
		.replace(/^aqa-gcse-/, 'aqa-')
		.replace(/^ocr-gcse-/, 'ocr-')
		.replace(/-v\d+(?:\.\d+)*(?:-\d+)?$/, '');
}

function chunks(values, size) {
	const output = [];
	for (let index = 0; index < values.length; index += size) {
		output.push(values.slice(index, index + size));
	}
	return output;
}

function slug(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function parseArgs(argv) {
	const sessionRoot = argv
		.find((argument) => argument.startsWith('--session-root='))
		?.slice('--session-root='.length);
	return { sessionRoot };
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
