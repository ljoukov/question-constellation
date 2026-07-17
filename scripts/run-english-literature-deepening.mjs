#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const maxConcurrent = integerArg('max-concurrent', 2, 1, 2);
const sourceTimeoutMs = integerArg('source-timeout-ms', 180_000, 5_000, 180_000);
const manifestPath = path.resolve(
	valueArg('manifest', 'data/study-cards/english-literature/ocr-j352-deepening-shard-manifest.json')
);
const evidenceDir = path.join(rootDir, 'docs/release-evidence/english-literature-deepening');
const statePath = path.join(evidenceDir, 'queue-state.json');
const preflightPath = path.join(evidenceDir, 'source-preflight.json');
const aggregatePath = path.join(evidenceDir, 'aggregate-audit.json');
const logDir = path.join(rootDir, 'tmp/study-card-generation/literature-deepening-logs');
const descendantStatePath = path.join(
	rootDir,
	'docs/release-evidence/study-card-descendant-coverage/queue-state.json'
);
mkdirSync(evidenceDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

const manifest = validateManifest(readJson(manifestPath));
const sourcePreflight = await runSourcePreflight(manifest);
writeJson(preflightPath, sourcePreflight);
if (process.argv.includes('--preflight-only')) {
	console.log(JSON.stringify(sourcePreflight, null, 2));
	process.exit(0);
}
const descendantState = requireTerminalDescendantQueue();

const jobs = manifest.shards.map((shard) => ({
	releaseId: shard.releaseId,
	sourcePlanPath: shard.sourcePlanPath,
	sourcePlanHash: shard.sourcePlanHash,
	expectedCardCount: shard.expectedCardCount,
	titles: shard.titles,
	status: 'queued',
	logPath: path.relative(rootDir, path.join(logDir, `${shard.releaseId}.log`))
}));
const state = {
	schemaVersion: 'ocr-j352-literature-deepening-queue-v1',
	startedAt: new Date().toISOString(),
	finishedAt: null,
	maxConcurrent,
	manifestPath: path.relative(rootDir, manifestPath),
	manifestHash: sha256(readFileSync(manifestPath)),
	descendantQueue: {
		finishedAt: descendantState.finishedAt,
		accepted: descendantState.jobs.filter((job) => job.status === 'accepted').length,
		failed: descendantState.jobs.filter((job) => job.status === 'failed').length,
		postRetryRemainingCardCount: descendantState.postRetryRemainingCardCount
	},
	sourcePreflightPath: path.relative(rootDir, preflightPath),
	jobs
};
writeJson(statePath, state);

let nextJobIndex = 0;
await Promise.all(Array.from({ length: Math.min(maxConcurrent, jobs.length) }, runWorker));
state.finishedAt = new Date().toISOString();
state.acceptedJobCount = jobs.filter((job) => job.status === 'accepted').length;
state.failedJobCount = jobs.filter((job) => job.status === 'failed').length;
state.acceptedCardCount = jobs.reduce((sum, job) => sum + (job.acceptedCardCount ?? 0), 0);
writeJson(statePath, state);

if (state.failedJobCount > 0) {
	console.error(JSON.stringify(state, null, 2));
	process.exitCode = 1;
} else {
	const aggregate = runAggregateAudit(manifest, jobs, sourcePreflight);
	writeJson(aggregatePath, aggregate);
	state.aggregateAuditPath = path.relative(rootDir, aggregatePath);
	state.aggregateStatus = aggregate.status;
	writeJson(statePath, state);
	console.log(JSON.stringify(state, null, 2));
	if (aggregate.status !== 'passed') process.exitCode = 1;
}

async function runWorker() {
	while (nextJobIndex < jobs.length) {
		const job = jobs[nextJobIndex];
		nextJobIndex += 1;
		const artifactPath = path.join(
			rootDir,
			'data/study-cards/releases',
			job.releaseId,
			'accepted-study-cards.json'
		);
		if (existsSync(artifactPath)) {
			validateArtifact(artifactPath);
			const bundle = readJson(artifactPath);
			validateJobArtifact(job, bundle);
			job.status = 'accepted';
			job.note = 'Existing immutable artifact validated and reused.';
			job.acceptedCardCount = bundle.cards.length;
			job.artifactHash = readJson(
				path.join(path.dirname(artifactPath), 'generation-run.json')
			).artifactHash;
			writeJson(statePath, state);
			continue;
		}

		job.status = 'running';
		job.startedAt = new Date().toISOString();
		writeJson(statePath, state);
		const args = [
			path.join(rootDir, 'scripts/generate-english-literature-study-deck.mjs'),
			`--source-plan=${job.sourcePlanPath}`,
			`--release-id=${job.releaseId}`,
			`--source-hash-lock=${preflightPath}`,
			`--existing-artifact=${manifest.additiveContext.artifactPath}`,
			`--source-timeout-ms=${sourceTimeoutMs}`,
			'--generate',
			'--force'
		];
		const exitCode = await runLogged(process.execPath, args, path.join(rootDir, job.logPath));
		job.finishedAt = new Date().toISOString();
		job.exitCode = exitCode;
		if (exitCode === 0 && existsSync(artifactPath)) {
			validateArtifact(artifactPath);
			const bundle = readJson(artifactPath);
			validateJobArtifact(job, bundle);
			const generationRun = readJson(path.join(path.dirname(artifactPath), 'generation-run.json'));
			job.status = 'accepted';
			job.acceptedCardCount = bundle.cards.length;
			job.deterministicRepairAttempts = generationRun.counts.deterministicRepairAttempts ?? 0;
			job.reviewerRepairAttempts = generationRun.counts.reviewerRepairAttempts ?? 0;
			job.artifactHash = generationRun.artifactHash;
			job.sourceManifestHash = generationRun.sourceManifestHash;
		} else {
			job.status = 'failed';
			job.error = `Generator exited ${exitCode}; inspect ${job.logPath}.`;
		}
		writeJson(statePath, state);
	}
}

function requireTerminalDescendantQueue() {
	if (!existsSync(descendantStatePath)) {
		throw new Error(
			`Descendant queue evidence is absent: ${path.relative(rootDir, descendantStatePath)}.`
		);
	}
	const descendant = readJson(descendantStatePath);
	const nonterminal = descendant.jobs.filter((job) => ['queued', 'running'].includes(job.status));
	if (!descendant.finishedAt || nonterminal.length > 0) {
		throw new Error(
			`Descendant queue is not terminal (${nonterminal.length} queued/running); Literature generation must not consume its two model slots.`
		);
	}
	const remainingPlan = JSON.parse(
		execFileSync(
			process.execPath,
			[path.join(rootDir, 'scripts/plan-study-card-descendant-coverage.mjs')],
			{ cwd: rootDir, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }
		)
	);
	const remainingCards = remainingPlan.plans.reduce(
		(sum, plan) => sum + plan.recommendedCardCount,
		0
	);
	if (remainingCards > 0) {
		throw new Error(
			`Descendant queue is terminal but ${remainingCards} official descendant card(s) remain uncovered; complete corrected retries before Literature generation.`
		);
	}
	descendant.postRetryRemainingCardCount = remainingCards;
	return descendant;
}

function validateManifest(value) {
	if (value?.schemaVersion !== 'ocr-j352-literature-deepening-shards-v1') {
		throw new Error('Unexpected English Literature deepening manifest schema.');
	}
	if (!Array.isArray(value.shards) || value.shards.length !== 13) {
		throw new Error('English Literature deepening manifest must contain 13 shards.');
	}
	if (
		value.totalCards !== 171 ||
		stableJson(value.counts) !== stableJson({ plot: 96, quotation: 72, method: 3 })
	) {
		throw new Error('English Literature deepening manifest count contract drifted.');
	}
	const masterPath = path.resolve(value.masterSourcePlan);
	if (!existsSync(masterPath) || sha256(readFileSync(masterPath)) !== value.masterSourcePlanHash) {
		throw new Error('Master English Literature source-plan hash mismatch.');
	}
	const additiveArtifactPath = path.resolve(value.additiveContext?.artifactPath ?? '');
	if (!existsSync(additiveArtifactPath)) {
		throw new Error('The accepted additive-context artifact is absent.');
	}
	const additiveSummary = validateArtifact(additiveArtifactPath);
	if (
		additiveSummary.releaseId !== 'ocr-j352-literature-standard-v1' ||
		additiveSummary.artifactHash !== value.additiveContext?.artifactHash ||
		additiveSummary.counts?.cards !== 67
	) {
		throw new Error('The accepted additive-context artifact hash or 67-card contract drifted.');
	}
	const releaseIds = new Set();
	let plannedCards = 0;
	for (const shard of value.shards) {
		if (releaseIds.has(shard.releaseId)) throw new Error(`Duplicate release ${shard.releaseId}.`);
		releaseIds.add(shard.releaseId);
		const sourcePlanPath = path.resolve(shard.sourcePlanPath);
		if (
			!existsSync(sourcePlanPath) ||
			sha256(readFileSync(sourcePlanPath)) !== shard.sourcePlanHash
		) {
			throw new Error(`Source-plan hash mismatch for ${shard.releaseId}.`);
		}
		if (
			!Number.isInteger(shard.expectedCardCount) ||
			shard.expectedCardCount < 1 ||
			shard.expectedCardCount > 20
		) {
			throw new Error(`${shard.releaseId} exceeds the 20-card shard ceiling.`);
		}
		const sourcePlan = readJson(sourcePlanPath);
		const evidenceCount = sourcePlan.topics.flatMap((topic) => topic.evidence).length;
		if (evidenceCount !== shard.expectedCardCount) {
			throw new Error(`${shard.releaseId} source-plan count differs from its manifest.`);
		}
		plannedCards += evidenceCount;
	}
	if (plannedCards !== value.totalCards) throw new Error('Shard card totals do not equal 171.');
	return value;
}

async function runSourcePreflight(manifestValue) {
	const releaseId = 'ocr-j352-literature-deepening-source-preflight-v1';
	const workDir = path.join(rootDir, 'tmp/study-card-generation', releaseId);
	const logPath = path.join(logDir, `${releaseId}.log`);
	const startedAt = new Date().toISOString();
	const exitCode = await runLogged(
		process.execPath,
		[
			path.join(rootDir, 'scripts/generate-english-literature-study-deck.mjs'),
			`--source-plan=${manifestValue.masterSourcePlan}`,
			`--release-id=${releaseId}`,
			`--work-dir=${workDir}`,
			`--source-timeout-ms=${sourceTimeoutMs}`,
			'--prepare-sources',
			'--force'
		],
		logPath
	);
	if (exitCode !== 0) {
		throw new Error(
			`English Literature source preflight failed closed; inspect ${path.relative(rootDir, logPath)}.`
		);
	}
	const evidencePath = path.join(workDir, 'source-evidence.json');
	if (!existsSync(evidencePath)) throw new Error('Source preflight produced no evidence manifest.');
	const evidence = readJson(evidencePath);
	const topics = evidence.sourceManifest.topics;
	const rows = topics.flatMap((topic) => topic.evidence);
	const sources = topics.flatMap((topic) => topic.sources);
	if (topics.length !== 19 || rows.length !== 171 || sources.length !== 25) {
		throw new Error(
			`Source preflight count drift: ${topics.length} topics, ${rows.length} evidence, ${sources.length} sources.`
		);
	}
	if (sources.some((source) => !/^[a-f0-9]{64}$/.test(source.sourceHash ?? ''))) {
		throw new Error('Source preflight left an invalid source hash.');
	}
	return {
		schemaVersion: 'ocr-j352-literature-source-preflight-v1',
		status: 'passed',
		startedAt,
		finishedAt: new Date().toISOString(),
		downloadedAt: evidence.downloadedAt,
		masterSourcePlan: manifestValue.masterSourcePlan,
		masterSourcePlanHash: manifestValue.masterSourcePlanHash,
		preparedSourceManifestHash: sha256(stableJson(evidence.sourceManifest)),
		counts: { topics: topics.length, evidence: rows.length, sources: sources.length },
		exactAnchorAndExcerptValidation: 'passed',
		failClosed: true,
		sources: sources.map((source) => ({
			id: source.id,
			kind: source.kind,
			retrievalType: source.retrievalType,
			url: source.url,
			title: source.title,
			rightsBasis: source.rightsBasis,
			sourceHash: source.sourceHash
		})),
		logPath: path.relative(rootDir, logPath)
	};
}

function validateJobArtifact(job, bundle) {
	if (bundle.release.id !== job.releaseId) throw new Error(`${job.releaseId} artifact id drifted.`);
	if (bundle.cards.length !== job.expectedCardCount) {
		throw new Error(
			`${job.releaseId} published ${bundle.cards.length}; expected ${job.expectedCardCount}.`
		);
	}
}

function runAggregateAudit(manifestValue, acceptedJobs, sourcePreflight) {
	const issues = [];
	const expectedByCardId = new Map();
	for (const shard of manifestValue.shards) {
		const sourcePlan = readJson(path.resolve(shard.sourcePlanPath));
		for (const topic of sourcePlan.topics) {
			for (const evidence of topic.evidence) {
				const cardId = `ocr-j352-card-${evidence.id}`;
				if (expectedByCardId.has(cardId)) issues.push(`Duplicate planned card identity ${cardId}.`);
				expectedByCardId.set(cardId, {
					releaseId: shard.releaseId,
					conceptKey: `ocr-j352-concept-${evidence.id}`,
					kind: evidence.mode,
					topicComponentId: topic.topicComponentId
				});
			}
		}
	}

	const releaseBundles = acceptedArtifactBundles();
	const newReleaseIds = new Set(manifestValue.shards.map((shard) => shard.releaseId));
	const newBundles = releaseBundles.filter(({ bundle }) => newReleaseIds.has(bundle.release.id));
	const newCards = newBundles.flatMap(({ bundle }) =>
		bundle.cards.map((card) => ({ releaseId: bundle.release.id, card }))
	);
	const preflightSourceByIdentity = new Map(
		sourcePreflight.sources.map((source) => [`${source.url}\n${source.title}`, source])
	);
	if (newBundles.length !== 13) issues.push(`Found ${newBundles.length} of 13 deepening releases.`);
	if (newCards.length !== 171) issues.push(`Found ${newCards.length} of 171 deepening cards.`);

	const actualKinds = countBy(newCards.map(({ card }) => card.kind));
	if (stableJson(actualKinds) !== stableJson(manifestValue.counts)) {
		issues.push(`Deepening kind counts drifted: ${JSON.stringify(actualKinds)}.`);
	}
	for (const { releaseId, card } of newCards) {
		const expected = expectedByCardId.get(card.id);
		if (!expected) {
			issues.push(`Unexpected deepening card ${card.id}.`);
			continue;
		}
		if (expected.releaseId !== releaseId) issues.push(`${card.id} is in the wrong release.`);
		if (card.conceptKey !== expected.conceptKey || card.kind !== expected.kind) {
			issues.push(`${card.id} changed its planned concept or kind.`);
		}
		if (!card.targets.some((target) => target.topicComponentId === expected.topicComponentId)) {
			issues.push(`${card.id} lost its planned topic target.`);
		}
		if (
			card.kind === 'quotation' &&
			card.sources.some((source) => source.kind !== 'primary-text')
		) {
			issues.push(`${card.id} quotation is not exclusively supported by primary-text evidence.`);
		}
		for (const source of card.sources) {
			const lockedSource = preflightSourceByIdentity.get(`${source.url}\n${source.title}`);
			if (!lockedSource || lockedSource.sourceHash !== source.sourceHash) {
				issues.push(`${card.id} source differs from the passed master preflight.`);
			}
			if (!source.title.startsWith('Wikipedia:')) continue;
			if (
				card.kind !== 'plot' ||
				source.kind !== 'secondary-source' ||
				!source.rightsBasis.includes('CC BY-SA 4.0') ||
				!source.url.startsWith('https://en.wikipedia.org/') ||
				wordCount(source.excerpt) > 20
			) {
				issues.push(`${card.id} violates the licensed synopsis boundary.`);
			}
		}
	}
	for (const cardId of expectedByCardId.keys()) {
		if (!newCards.some(({ card }) => card.id === cardId)) issues.push(`Missing ${cardId}.`);
	}

	const cardOwners = new Map();
	const conceptOwners = new Map();
	const cardCollisions = [];
	const conceptCollisions = [];
	for (const { artifactPath, bundle } of releaseBundles) {
		validateArtifact(artifactPath);
		for (const card of bundle.cards) {
			const previousCard = cardOwners.get(card.id);
			if (previousCard)
				cardCollisions.push({ identity: card.id, releases: [previousCard, bundle.release.id] });
			else cardOwners.set(card.id, bundle.release.id);
			const conceptIdentity = `${card.board}:${card.subject}:${card.conceptKey}`;
			const previousConcept = conceptOwners.get(conceptIdentity);
			if (previousConcept) {
				conceptCollisions.push({
					identity: conceptIdentity,
					releases: [previousConcept, bundle.release.id]
				});
			} else conceptOwners.set(conceptIdentity, bundle.release.id);
		}
	}
	if (cardCollisions.length) issues.push(`${cardCollisions.length} global card-id collision(s).`);
	if (conceptCollisions.length)
		issues.push(`${conceptCollisions.length} global concept collision(s).`);

	return {
		schemaVersion: 'ocr-j352-literature-deepening-aggregate-audit-v1',
		status: issues.length ? 'failed' : 'passed',
		finishedAt: new Date().toISOString(),
		manifestHash: sha256(readFileSync(manifestPath)),
		sourcePreflightHash: sha256(stableJson(sourcePreflight)),
		counts: {
			deepeningReleases: newBundles.length,
			deepeningCards: newCards.length,
			...actualKinds,
			allAcceptedArtifacts: releaseBundles.length,
			allAcceptedCards: releaseBundles.reduce((sum, entry) => sum + entry.bundle.cards.length, 0)
		},
		rightsBoundary: manifestValue.rightsBoundary,
		licensedSynopsisCards: newCards.filter(({ card }) =>
			card.sources.some((source) => source.title.startsWith('Wikipedia:'))
		).length,
		modernPrimaryTextQuotations: 'withheld',
		poetryCompleteness: 'withheld',
		collisions: { cardIds: cardCollisions, concepts: conceptCollisions },
		jobs: acceptedJobs.map((job) => ({
			releaseId: job.releaseId,
			acceptedCardCount: job.acceptedCardCount,
			artifactHash: job.artifactHash,
			sourceManifestHash: job.sourceManifestHash ?? null
		})),
		issues
	};
}

function acceptedArtifactBundles() {
	const releasesDir = path.join(rootDir, 'data/study-cards/releases');
	return readdirSync(releasesDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.flatMap((entry) => {
			const artifactPath = path.join(releasesDir, entry.name, 'accepted-study-cards.json');
			return existsSync(artifactPath) ? [{ artifactPath, bundle: readJson(artifactPath) }] : [];
		});
}

function validateArtifact(artifactPath) {
	return JSON.parse(
		execFileSync(
			process.execPath,
			[
				path.join(rootDir, 'scripts/import-study-cards.mjs'),
				`--input=${artifactPath}`,
				'--validate-only'
			],
			{ cwd: rootDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
		)
	);
}

function runLogged(command, args, logPath) {
	return new Promise((resolve, reject) => {
		const output = createWriteStream(logPath, { flags: 'a' });
		output.write(`\n[${new Date().toISOString()}] ${command} ${args.join(' ')}\n`);
		const child = spawn(command, args, {
			cwd: rootDir,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		child.stdout.pipe(output, { end: false });
		child.stderr.pipe(output, { end: false });
		child.once('error', (error) => {
			output.end(`\nspawn error: ${error.stack ?? error}\n`);
			reject(error);
		});
		child.once('close', (code) => {
			output.end(`\n[${new Date().toISOString()}] exit ${code ?? 1}\n`);
			resolve(code ?? 1);
		});
	});
}

function countBy(values) {
	return Object.fromEntries(
		[...new Set(values)]
			.sort()
			.map((value) => [value, values.filter((candidate) => candidate === value).length])
	);
}

function wordCount(value) {
	return String(value ?? '')
		.trim()
		.split(/\s+/u)
		.filter(Boolean).length;
}

function stableJson(value) {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function valueArg(name, fallback) {
	return (
		process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ??
		fallback
	);
}

function integerArg(name, fallback, minimum, maximum) {
	const parsed = Number(valueArg(name, String(fallback)));
	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}.`);
	}
	return parsed;
}
