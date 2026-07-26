import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { requireArtGenerationJobEvidence } from './science-challenge-art-lineage.mjs';
import { canonicalHash, sha256, stableStringify } from './science-challenge-release.mjs';

test('art generation job replay binds exact prompts, masters, normalized bytes and outputs', () => {
	const fixture = makeFixture();
	try {
		const artifacts = requireArtGenerationJobEvidence(fixture.context);
		assert.equal(artifacts.darkNormalized.sha256, fixture.currentOutputs.dark.sha256);

		const stale = structuredClone(fixture.context);
		stale.currentOutputs.dark.sha256 = '0'.repeat(64);
		assert.throws(() => requireArtGenerationJobEvidence(stale), /does not bind .* current outputs/);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('art repair jobs require evidence that rejects the exact id with the recorded instructions', () => {
	const fixture = makeFixture({ repair: true });
	const relabelled = makeFixture({ repair: true, repairAccepted: true });
	try {
		assert.doesNotThrow(() => requireArtGenerationJobEvidence(fixture.context));
		assert.throws(
			() => requireArtGenerationJobEvidence(relabelled.context),
			/does not reject .* recorded instructions/
		);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
		rmSync(relabelled.rootDir, { recursive: true, force: true });
	}
});

test('art jobs reject malformed and dual repair hash claims', () => {
	const ordinary = makeFixture();
	const repair = makeFixture({ repair: true });
	try {
		ordinary.context.job.repairReviewSha256 = 'not-a-sha256';
		assert.throws(
			() => requireArtGenerationJobEvidence(ordinary.context),
			/claims repair evidence/
		);
		repair.context.job.repairPerceptualAuditSha256 = '1'.repeat(64);
		assert.throws(() => requireArtGenerationJobEvidence(repair.context), /invalid identity/);
	} finally {
		rmSync(ordinary.rootDir, { recursive: true, force: true });
		rmSync(repair.rootDir, { recursive: true, force: true });
	}
});

test('art lineage accepts the fourth attempt but rejects attempts beyond the generator limit', () => {
	const fourthAttempt = makeFixture({ attempt: 4 });
	const fifthAttempt = makeFixture({ attempt: 5 });
	try {
		assert.doesNotThrow(() => requireArtGenerationJobEvidence(fourthAttempt.context));
		assert.throws(
			() => requireArtGenerationJobEvidence(fifthAttempt.context),
			/invalid attempt number/
		);
	} finally {
		rmSync(fourthAttempt.rootDir, { recursive: true, force: true });
		rmSync(fifthAttempt.rootDir, { recursive: true, force: true });
	}
});

function makeFixture({ repair = false, repairAccepted = false, attempt = 1 } = {}) {
	const rootDir = mkdtempSync(path.join(tmpdir(), 'science-art-lineage-'));
	const id = 'biology-cell-context-opening';
	const specDir = path.join(rootDir, 'work', id);
	const instruction = 'Move the specimen to the centre and remove the false extra organelle.';
	let repairEvidence = null;
	let repairSha256 = null;
	if (repair) {
		repairEvidence = {
			schemaVersion: 'science-question-art-review-summary/v2',
			status: 'failed',
			reviews: [
				{
					id,
					accepted: repairAccepted,
					disposition: repairAccepted ? 'accept' : 'fresh-regenerate',
					issues: repairAccepted
						? []
						: [
								{
									severity: 'major',
									regenerationInstruction: instruction
								}
							]
				}
			]
		};
		repairSha256 = canonicalHash(repairEvidence);
	}
	const attemptSuffix = String(attempt).padStart(2, '0');
	const attemptName = repair
		? `repair-${repairSha256.slice(0, 12)}-attempt-${attemptSuffix}`
		: `attempt-${attemptSuffix}`;
	const attemptDir = path.join(specDir, attemptName);
	mkdirSync(attemptDir, { recursive: true });
	const spec = {
		id,
		output: { darkPath: 'final-dark.webp', lightPath: 'final-light.webp' }
	};
	const paths = {
		spec: path.join(specDir, 'spec.json'),
		darkPrompt: path.join(attemptDir, 'dark-prompt.txt'),
		lightPrompt: path.join(attemptDir, 'light-prompt.txt'),
		darkMaster: path.join(attemptDir, 'dark-master.webp'),
		lightMaster: path.join(attemptDir, 'light-master.webp'),
		darkNormalized: path.join(attemptDir, 'dark.webp'),
		lightNormalized: path.join(attemptDir, 'light.webp')
	};
	writeFileSync(paths.spec, `${stableStringify(spec)}\n`);
	for (const [key, filePath] of Object.entries(paths).filter(([key]) => key !== 'spec')) {
		writeFileSync(filePath, `${key}-fixture`);
	}
	const artifacts = Object.fromEntries(
		Object.entries(paths).map(([key, filePath]) => {
			const bytes = readFileSync(filePath);
			return [
				key,
				{ path: path.relative(rootDir, filePath), sha256: sha256(bytes), size: bytes.byteLength }
			];
		})
	);
	const currentOutputs = {
		dark: {
			path: spec.output.darkPath,
			sha256: artifacts.darkNormalized.sha256,
			width: 960,
			height: 540
		},
		light: {
			path: spec.output.lightPath,
			sha256: artifacts.lightNormalized.sha256,
			width: 960,
			height: 540
		}
	};
	const job = {
		schemaVersion: 'science-question-art-job/v1',
		id,
		status: 'passed',
		attempt,
		imageModel: 'chatgpt-gpt-image-2',
		specSha256: canonicalHash(spec),
		repairReviewSha256: repairSha256,
		repairPerceptualAuditSha256: null,
		repairInstructions: repair ? [instruction] : [],
		artifacts,
		checks: {
			darkMaster: {
				status: 'passed',
				width: 1672,
				height: 941,
				sha256: artifacts.darkMaster.sha256
			},
			lightMaster: {
				status: 'passed',
				width: 1672,
				height: 941,
				sha256: artifacts.lightMaster.sha256
			},
			pair: {
				status: 'passed',
				width: 960,
				height: 540,
				darkSha256: currentOutputs.dark.sha256,
				lightSha256: currentOutputs.light.sha256
			}
		},
		outputs: currentOutputs
	};
	const jobPath = path.join(
		specDir,
		repair ? `repair-${repairSha256.slice(0, 12)}-job.json` : 'job.json'
	);
	writeFileSync(jobPath, `${stableStringify(job)}\n`);
	return {
		rootDir,
		currentOutputs,
		context: { job, jobPath, spec, currentOutputs, rootDir, repairEvidence }
	};
}
