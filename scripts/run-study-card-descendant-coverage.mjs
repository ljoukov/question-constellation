#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const maxConcurrent = integerArg('max-concurrent', 2, 1, 2);
const shardSize = integerArg('shard-size', 20, 1, 20);
const sourceRoot = valueArg('source-root', path.join(rootDir, 'data/curricula/sources'));
const evidenceDir = path.join(rootDir, 'docs/release-evidence/study-card-descendant-coverage');
const statePath = path.join(evidenceDir, 'queue-state.json');
const beforePath = path.join(evidenceDir, 'before.json');
const afterPath = path.join(evidenceDir, 'after.json');
const logDir = path.join(rootDir, 'tmp/study-card-generation/descendant-coverage-logs');
mkdirSync(evidenceDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

const before = currentPlan();
writeJson(beforePath, before);
const jobs = before.plans
	.flatMap((plan) =>
		chunks(plan.uncoveredComponents, shardSize).map((components, index) => {
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
				status: 'queued',
				logPath: path.relative(rootDir, path.join(logDir, `${batchId}.log`))
			};
		})
	)
	.sort(
		(left, right) =>
			left.componentCount - right.componentCount || left.batchId.localeCompare(right.batchId)
	);
const state = {
	schemaVersion: 'study-card-descendant-coverage-queue-v1',
	startedAt: new Date().toISOString(),
	finishedAt: null,
	maxConcurrent,
	shardSize,
	beforeRecommendedCardCount: before.plans.reduce(
		(total, plan) => total + plan.recommendedCardCount,
		0
	),
	jobs
};
writeJson(statePath, state);

let nextJobIndex = 0;
await Promise.all(Array.from({ length: Math.min(maxConcurrent, jobs.length) }, runWorker));
state.finishedAt = new Date().toISOString();
const after = currentPlan();
writeJson(afterPath, after);
state.afterRecommendedCardCount = after.plans.reduce(
	(total, plan) => total + plan.recommendedCardCount,
	0
);
state.completedJobCount = jobs.filter((job) => job.status === 'accepted').length;
state.failedJobCount = jobs.filter((job) => job.status === 'failed').length;
writeJson(statePath, state);
console.log(JSON.stringify(state, null, 2));
if (state.failedJobCount > 0) process.exitCode = 1;

async function runWorker() {
	while (nextJobIndex < jobs.length) {
		const job = jobs[nextJobIndex];
		nextJobIndex += 1;
		const artifactPath = path.join(
			rootDir,
			'data/study-cards/releases',
			job.batchId,
			'accepted-study-cards.json'
		);
		if (existsSync(artifactPath)) {
			job.status = 'accepted';
			job.retryMode = 'immutable-artifact-reuse';
			job.note =
				'Existing immutable artifact validated and reused; no failed or partial work trace was resumed.';
			validateArtifact(artifactPath);
			const runPath = path.join(path.dirname(artifactPath), 'generation-run.json');
			if (existsSync(runPath)) {
				const run = JSON.parse(readFileSync(runPath, 'utf8'));
				job.acceptedCardCount = run.counts?.accepted ?? null;
				job.artifactHash = run.artifactHash ?? null;
			}
			writeJson(statePath, state);
			continue;
		}
		job.status = 'running';
		job.startedAt = new Date().toISOString();
		writeJson(statePath, state);
		const args = [
			path.join(rootDir, 'scripts/generate-standard-study-card-batch.mjs'),
			`--specification-id=${job.specificationId}`,
			`--subject=${job.subject}`,
			`--source-root=${sourceRoot}`,
			`--batch-id=${job.batchId}`,
			'--generate',
			...job.offeringIds.map((id) => `--offering-id=${id}`),
			...job.componentIds.map((id) => `--required-component-id=${id}`)
		];
		const logPath = path.join(rootDir, job.logPath);
		const exitCode = await runLogged(process.execPath, args, logPath);
		job.finishedAt = new Date().toISOString();
		job.exitCode = exitCode;
		if (exitCode === 0 && existsSync(artifactPath)) {
			validateArtifact(artifactPath);
			const run = JSON.parse(
				readFileSync(path.join(path.dirname(artifactPath), 'generation-run.json'), 'utf8')
			);
			job.status = 'accepted';
			job.acceptedCardCount = run.counts.accepted;
			job.deterministicInvalidCount = run.counts.deterministicInvalid;
			job.reviewerRepairAttempts = run.counts.reviewerRepairAttempts;
			job.artifactHash = run.artifactHash;
		} else {
			job.status = 'failed';
			job.error = `Generator exited ${exitCode}; inspect ${job.logPath}.`;
		}
		writeJson(statePath, state);
	}
}

function currentPlan() {
	return JSON.parse(
		execFileSync(
			process.execPath,
			[path.join(rootDir, 'scripts/plan-study-card-descendant-coverage.mjs')],
			{
				cwd: rootDir,
				encoding: 'utf8',
				maxBuffer: 128 * 1024 * 1024
			}
		)
	);
}

function validateArtifact(artifactPath) {
	execFileSync(
		process.execPath,
		[
			path.join(rootDir, 'scripts/import-study-cards.mjs'),
			`--input=${artifactPath}`,
			'--validate-only'
		],
		{ cwd: rootDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
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

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function slug(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function writeJson(filePath, value) {
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
