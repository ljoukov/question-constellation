import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalHash, sha256, stableStringify } from './lib/science-challenge-release.mjs';
import {
	prepareOwnedArtWorkRoot,
	prepareRepairLineageIdentity
} from './lib/science-question-art-run-state.mjs';
import {
	SCIENCE_QUESTION_ART_CONFIRMATION_DHASH_THRESHOLD,
	SCIENCE_QUESTION_ART_DHASH_ALGORITHM,
	SCIENCE_QUESTION_ART_DHASH_THRESHOLD,
	SCIENCE_QUESTION_ART_DHASH_VARIANTS,
	SCIENCE_QUESTION_ART_PERCEPTUAL_AUDIT_SCHEMA,
	findPerceptualCollisions
} from './lib/science-question-art-perceptual.mjs';

const generatorPath = fileURLToPath(
	new URL('./generate-science-question-art.mjs', import.meta.url)
);

test('generator and accepted-art lineage share the four-attempt ceiling', () => {
	const result = spawnSync(process.execPath, [generatorPath, '--help', '--max-attempts=5'], {
		encoding: 'utf8'
	});
	assert.equal(result.status, 1);
	assert.match(result.stderr, /--max-attempts must be an integer from 1 to 4/);
});

test('generator rejects unknown, bare-value and boolean-assignment arguments before any work', () => {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'science-art-argument-guard-')));
	try {
		const manifestPath = path.join(root, 'art-manifest.json');
		const workRoot = path.join(root, 'generation-work');
		writeFileSync(manifestPath, `${JSON.stringify(artManifest())}\n`);
		for (const [args, expected] of [
			[['--dryrun'], /Unknown option --dryrun/],
			[['--id', 'biology-safety-test-01-opening'], /requires the documented/],
			[['--resume=false'], /does not accept a value/],
			[['--unknown=value'], /Unknown option --unknown/]
		]) {
			const result = runGenerator(root, manifestPath, workRoot, args);
			assert.equal(result.status, 1);
			assert.match(result.stderr, expected);
			assert.equal(existsSync(workRoot), false);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('bare replacement refuses existing output before writing or scheduling work', () => {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'science-art-replacement-guard-')));
	try {
		const manifest = artManifest();
		const manifestPath = path.join(root, 'art-manifest.json');
		const workRoot = path.join(root, 'generation-work');
		const existingOutput = path.join(root, manifest.specs[0].output.darkPath);
		mkdirSync(path.dirname(existingOutput), { recursive: true });
		writeFileSync(existingOutput, Buffer.from([1, 2, 3]));
		writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);

		const result = spawnSync(
			process.execPath,
			[
				generatorPath,
				'--dry-run',
				'--replace-output',
				`--manifest=${manifestPath}`,
				`--work-root=${workRoot}`,
				'--require-count=2'
			],
			{ cwd: root, encoding: 'utf8' }
		);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /Refusing bare --replace-output/);
		assert.match(result.stderr, /overwrite accepted lineage evidence/);
		assert.equal(existsSync(workRoot), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('preflight reserve failure exits non-zero without claiming a work root', () => {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'science-art-preflight-stop-')));
	try {
		const manifest = artManifest();
		const manifestPath = path.join(root, 'art-manifest.json');
		const workRoot = path.join(root, 'generation-work');
		writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
		const result = runGenerator(root, manifestPath, workRoot, ['--min-free-space-gib=1024']);
		assert.equal(result.status, 1);
		const summary = JSON.parse(result.stdout);
		assert.equal(summary.status, 'failed-resumable');
		assert.equal(summary.scheduledCount, 0);
		assert.equal(summary.resumableFailure.code, 'SCIENCE_ART_MIN_FREE_SPACE');
		assert.match(summary.nextAction.instruction, /recorded safety prerequisite/);
		assert.doesNotMatch(summary.nextAction.instruction, /Free the required disk reserve/);
		assert.equal(existsSync(workRoot), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('ordinary retry prompts never expose prior operational failure text to the image model', () => {
	const source = readFileSync(generatorPath, 'utf8');
	assert.doesNotMatch(source, /priorFailure\.error/);
	assert.doesNotMatch(source, /A prior attempt failed:/);
	assert.match(source, /buildVariantPrompt\(spec, repair, 'dark'\)/);
	assert.match(source, /buildVariantPrompt\(spec, repair, 'light'\)/);
	assert.match(source, /action: 'generate'/);
	assert.doesNotMatch(source, /action: 'edit'/);
	assert.doesNotMatch(source, /styleImages:/);
});

test('generator combines generic safety rules with exact D1-backed challenge guards', () => {
	const source = readFileSync(generatorPath, 'utf8');
	for (const expected of [
		'Trace every visible wire, tube, beam, hose, collection path',
		'never draw a sealed rounded end where the collection opening must be',
		'"Sealed" means visibly closed',
		'objects described as identical must visibly match',
		'a gas particle model must remain widely dispersed',
		'Never leave a less-dense-than-air sample such as possible hydrogen',
		'Do not translate question-given measurements, percentages or rankings',
		'stop before the missing answer-bearing step',
		'Include every person, team, patient, driver, operator',
		'black lava remains visibly black or dark charcoal',
		'regeneration instruction as a diagnosis of what failed'
	]) {
		assert.match(source, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
	}
	assert.match(source, /const guards = spec\.generationGuards \?\? \[\]/);
	assert.match(source, /has invalid D1-backed generation guards/);
	assert.match(source, /VISIBLE DEFECT TO ELIMINATE/);
	assert.match(source, /question-specific guards are present above/);
	assert.match(source, /suggested correction is intentionally omitted/);
	assert.match(source, /rejected images are not edit targets or composition references/i);
	assert.doesNotMatch(source, /physics-exp-current-wire-motor-effect-opening/);
	assert.doesNotMatch(
		source,
		/one bacterium and one budding yeast cell only as intact OPAQUE exterior teaching models/
	);
});

test('repair reserve summaries refresh canonical evidence and never prescribe repair resume', () => {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'science-art-repair-action-')));
	try {
		const manifest = artManifest();
		const manifestPath = path.join(root, 'art-manifest.json');
		const workRoot = path.join(root, 'generation-work');
		const customReviewPath = 'custom-review/old-evidence-name.json';
		writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
		const result = runGenerator(root, manifestPath, workRoot, [
			'--min-free-space-gib=1024',
			`--repair-review=${customReviewPath}`,
			'--replace-output'
		]);
		assert.equal(result.status, 1);
		const summary = JSON.parse(result.stdout);
		assert.equal(summary.nextAction.kind, 'refresh-review-before-repair');
		const [reviewAction, repairAction] = summary.nextAction.actions;
		assert.ok(reviewAction.args.includes('--require-count=2'));
		assert.ok(reviewAction.args.includes('--output-root=custom-review'));
		assert.ok(repairAction.args.includes('--repair-review=custom-review/review-summary.json'));
		assert.equal(repairAction.args.includes('--resume'), false);
		assert.equal(existsSync(workRoot), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('a new repair lineage cannot bypass unresolved cleanup from an older repair hash', () => {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'science-art-old-repair-cleanup-')));
	try {
		const manifest = artManifest();
		const spec = manifest.specs[0];
		const manifestPath = path.join(root, 'art-manifest.json');
		const workRoot = path.join(root, 'generation-work');
		writeFileSync(manifestPath, `${stableStringify(manifest)}\n`);
		prepareOwnedArtWorkRoot({
			workRoot,
			workspaceRoot: root,
			releaseId: manifest.releaseId,
			manifestSha256: canonicalHash(manifest)
		});
		const specDir = path.join(workRoot, spec.id);
		mkdirSync(specDir);
		const oldHash = `aaaaaaaaaaaa${'b'.repeat(52)}`;
		prepareRepairLineageIdentity({
			specDir,
			repairRunId: oldHash.slice(0, 12),
			repairEvidenceKind: 'independent-review',
			repairEvidenceSha256: oldHash
		});
		const oldAttempt = path.join(specDir, `repair-${oldHash.slice(0, 12)}-attempt-01`);
		mkdirSync(oldAttempt);
		mkdirSync(path.join(oldAttempt, 'dark.webp'));
		writeFileSync(
			path.join(oldAttempt, 'failure.json'),
			`${stableStringify({
				attempt: 1,
				error: 'old repair cleanup failed',
				finishedAt: '2026-01-01T00:00:00.000Z',
				retainedArtifacts: {},
				discardedImageArtifacts: [],
				evidenceIssues: [],
				imageCleanup: { status: 'failed', removed: [], issues: ['not a regular file'] }
			})}\n`
		);
		const result = runGenerator(root, manifestPath, workRoot, [
			'--repair-review=new-review/review-summary.json',
			'--replace-output',
			'--min-free-space-gib=1'
		]);
		assert.equal(result.status, 1);
		const summary = JSON.parse(result.stdout);
		assert.equal(summary.scheduledCount, 0);
		assert.equal(summary.resumableFailure.code, 'SCIENCE_ART_FAILED_ATTEMPT_CLEANUP_FAILED');
		assert.match(summary.nextAction.prerequisite, /no generation may start/);
		assert.equal(existsSync(path.join(specDir, 'attempt-01')), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('ordinary immutable attempts require explicit resume before the scheduler claims work', () => {
	const fixture = makeFailedResumeFixture(1);
	const jobPath = path.join(fixture.workRoot, fixture.spec.id, 'job.json');
	try {
		unlinkSync(jobPath);
		const result = runGenerator(fixture.root, fixture.manifestPath, fixture.workRoot, [
			`--id=${fixture.spec.id}`,
			'--max-attempts=1',
			'--min-free-space-gib=1'
		]);
		assert.equal(result.status, 1, result.stderr);
		const summary = JSON.parse(result.stdout);
		assert.equal(summary.status, 'failed-resumable');
		assert.equal(summary.scheduledCount, 0);
		assert.equal(summary.resumableFailure.code, 'SCIENCE_ART_RESUME_REQUIRED');
		assert.match(summary.nextAction.prerequisite, /--resume/);
		assert.equal(existsSync(jobPath), false);
	} finally {
		fixture.cleanup();
	}
});

test('a used repair evidence hash requires refreshed evidence before any work is scheduled', () => {
	const fixture = makeUsedPerceptualRepairFixture();
	try {
		const result = runGenerator(fixture.root, fixture.manifestPath, fixture.workRoot, [
			`--repair-perceptual-audit=${fixture.auditPath}`,
			'--replace-output',
			'--max-attempts=1',
			'--min-free-space-gib=1'
		]);
		assert.equal(result.status, 1, result.stderr);
		const summary = JSON.parse(result.stdout);
		assert.equal(summary.status, 'failed-resumable');
		assert.equal(summary.scheduledCount, 0);
		assert.equal(summary.resumableFailure.code, 'SCIENCE_ART_REPAIR_EVIDENCE_REFRESH_REQUIRED');
		assert.match(summary.nextAction.prerequisite, /refresh/i);
		assert.equal(summary.nextAction.kind, 'refresh-review-and-audit-before-repair');
		assert.equal(
			existsSync(path.join(fixture.attemptDir, '..', `repair-${fixture.repairRunId}-job.json`)),
			false
		);
	} finally {
		fixture.cleanup();
	}
});

test('ordinary resume replays full lineage and transactionally restores missing finals', () => {
	const fixture = makeResumeFixture();
	try {
		const first = runGenerator(fixture.root, fixture.manifestPath, fixture.workRoot, [
			`--id=${fixture.spec.id}`,
			'--resume',
			'--min-free-space-gib=1'
		]);
		assert.equal(first.status, 0, first.stderr);
		assert.equal(JSON.parse(first.stdout).results[0].action, 'resumed');

		unlinkSync(fixture.finalDark);
		unlinkSync(fixture.finalLight);
		const restored = runGenerator(fixture.root, fixture.manifestPath, fixture.workRoot, [
			`--id=${fixture.spec.id}`,
			'--resume',
			'--min-free-space-gib=1'
		]);
		assert.equal(restored.status, 0, restored.stderr);
		assert.equal(JSON.parse(restored.stdout).results[0].action, 'recovered-and-resumed');
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'normalized-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'normalized-light');
	} finally {
		fixture.cleanup();
	}
});

test('lowering the requested attempt limit never relabels valid immutable history as corrupt', () => {
	const fixture = makeFailedResumeFixture(3);
	try {
		const result = runGenerator(fixture.root, fixture.manifestPath, fixture.workRoot, [
			`--id=${fixture.spec.id}`,
			'--resume',
			'--max-attempts=2',
			'--min-free-space-gib=1'
		]);
		assert.equal(result.status, 1, result.stderr);
		const summary = JSON.parse(result.stdout);
		assert.equal(summary.status, 'failed');
		assert.equal(summary.resumableFailure, null);
		assert.equal(summary.scheduledCount, 1);
		assert.equal(summary.results[0].status, 'failed');
		assert.equal(existsSync(path.join(fixture.workRoot, fixture.spec.id, 'attempt-04')), false);
	} finally {
		fixture.cleanup();
	}
});

test('ordinary resume preserves the canonical repaired lineage and never restores rejected ordinary bytes', () => {
	const fixture = makeResumeFixture();
	try {
		addRepairLineage(fixture);
		const resumed = runGenerator(fixture.root, fixture.manifestPath, fixture.workRoot, [
			`--id=${fixture.spec.id}`,
			'--resume',
			'--min-free-space-gib=1'
		]);
		assert.equal(resumed.status, 0, resumed.stderr);
		assert.equal(JSON.parse(resumed.stdout).results[0].action, 'resumed');
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'repaired-normalized-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'repaired-normalized-light');

		unlinkSync(fixture.finalDark);
		unlinkSync(fixture.finalLight);
		const restored = runGenerator(fixture.root, fixture.manifestPath, fixture.workRoot, [
			`--id=${fixture.spec.id}`,
			'--resume',
			'--min-free-space-gib=1'
		]);
		assert.equal(restored.status, 0, restored.stderr);
		assert.equal(JSON.parse(restored.stdout).results[0].action, 'recovered-and-resumed');
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'repaired-normalized-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'repaired-normalized-light');
	} finally {
		fixture.cleanup();
	}
});

test('canonical repaired resume rejects a symlinked repair-evidence archive before mutation', () => {
	const fixture = makeResumeFixture();
	try {
		const repair = addRepairLineage(fixture);
		const outsideEvidence = path.join(fixture.root, 'outside-repair-evidence.json');
		writeFileSync(outsideEvidence, readFileSync(repair.evidencePath));
		unlinkSync(repair.evidencePath);
		symlinkSync(outsideEvidence, repair.evidencePath);
		const originalDark = readFileSync(fixture.finalDark);
		const originalLight = readFileSync(fixture.finalLight);
		const result = runGenerator(fixture.root, fixture.manifestPath, fixture.workRoot, [
			`--id=${fixture.spec.id}`,
			'--resume',
			'--min-free-space-gib=1'
		]);
		assert.equal(result.status, 1);
		const summary = JSON.parse(result.stdout);
		assert.equal(summary.scheduledCount, 0);
		assert.equal(summary.resumableFailure.code, 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID');
		assert.deepEqual(readFileSync(fixture.finalDark), originalDark);
		assert.deepEqual(readFileSync(fixture.finalLight), originalLight);
		assert.equal(existsSync(path.join(fixture.workRoot, fixture.spec.id, 'attempt-02')), false);
	} finally {
		fixture.cleanup();
	}
});

test('ordinary resume rejects every adversarial lineage mutation before generation', () => {
	const mutations = [
		['schema', (job) => (job.schemaVersion = 'foreign/v1')],
		['id', (job) => (job.id = 'biology-other-opening')],
		['attempt ceiling', (job) => (job.attempt = 5)],
		[
			'artifact location',
			(job) => (job.artifacts.darkMaster.path = job.artifacts.lightMaster.path)
		],
		['check binding', (job) => (job.checks.darkMaster.sha256 = 'f'.repeat(64))],
		['repair identity', (job) => (job.repairReviewSha256 = 'e'.repeat(64))],
		['output location', (job) => (job.outputs.dark.path = 'wrong/dark.webp')]
	];
	for (const [label, mutate] of mutations) {
		const fixture = makeResumeFixture();
		try {
			const originalDark = readFileSync(fixture.finalDark);
			const originalLight = readFileSync(fixture.finalLight);
			const job = JSON.parse(readFileSync(fixture.jobPath, 'utf8'));
			mutate(job);
			writeFileSync(fixture.jobPath, `${stableStringify(job)}\n`);
			const result = runGenerator(fixture.root, fixture.manifestPath, fixture.workRoot, [
				`--id=${fixture.spec.id}`,
				'--resume',
				'--min-free-space-gib=1'
			]);
			assert.equal(result.status, 1, `${label}: ${result.stderr}`);
			const summary = JSON.parse(result.stdout);
			assert.equal(summary.status, 'failed-resumable', label);
			assert.equal(
				summary.resumableFailure.code,
				['attempt ceiling', 'artifact location'].includes(label)
					? 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID'
					: 'SCIENCE_ART_LINEAGE_INVALID',
				label
			);
			assert.equal(typeof summary.nextAction.prerequisite, 'string', label);
			assert.ok(summary.nextAction.prerequisite.length > 0, label);
			assert.deepEqual(readFileSync(fixture.finalDark), originalDark, label);
			assert.deepEqual(readFileSync(fixture.finalLight), originalLight, label);
			assert.equal(
				existsSync(path.join(fixture.workRoot, fixture.spec.id, 'attempt-02')),
				false,
				label
			);
		} finally {
			fixture.cleanup();
		}
	}
});

function runGenerator(root, manifestPath, workRoot, extraArgs = []) {
	return spawnSync(
		process.execPath,
		[
			generatorPath,
			`--manifest=${manifestPath}`,
			`--work-root=${workRoot}`,
			'--require-count=2',
			...extraArgs
		],
		{ cwd: root, encoding: 'utf8' }
	);
}

function makeResumeFixture() {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'science-art-resume-lineage-')));
	const manifest = artManifest();
	const spec = manifest.specs[0];
	const manifestPath = path.join(root, 'art-manifest.json');
	const workRoot = path.join(root, 'generation-work');
	writeFileSync(manifestPath, `${stableStringify(manifest)}\n`);
	prepareOwnedArtWorkRoot({
		workRoot,
		workspaceRoot: root,
		releaseId: manifest.releaseId,
		manifestSha256: canonicalHash(manifest)
	});
	const specDir = path.join(workRoot, spec.id);
	const attemptDir = path.join(specDir, 'attempt-01');
	mkdirSync(attemptDir, { recursive: true });
	const specPath = path.join(specDir, 'spec.json');
	const darkPrompt = path.join(attemptDir, 'dark-prompt.txt');
	const lightPrompt = path.join(attemptDir, 'light-prompt.txt');
	const darkMaster = path.join(attemptDir, 'dark-master.webp');
	const lightMaster = path.join(attemptDir, 'light-master.webp');
	const darkNormalized = path.join(attemptDir, 'dark.webp');
	const lightNormalized = path.join(attemptDir, 'light.webp');
	writeFileSync(specPath, `${stableStringify(spec)}\n`);
	writeFileSync(darkPrompt, 'exact dark prompt\n');
	writeFileSync(lightPrompt, 'exact light prompt\n');
	writeFileSync(darkMaster, 'master-dark');
	writeFileSync(lightMaster, 'master-light');
	writeFileSync(darkNormalized, 'normalized-dark');
	writeFileSync(lightNormalized, 'normalized-light');
	const finalDark = path.join(root, spec.output.darkPath);
	const finalLight = path.join(root, spec.output.lightPath);
	mkdirSync(path.dirname(finalDark), { recursive: true });
	writeFileSync(finalDark, readFileSync(darkNormalized));
	writeFileSync(finalLight, readFileSync(lightNormalized));
	const artifact = (filePath) => {
		const bytes = readFileSync(filePath);
		return {
			path: path.relative(root, filePath),
			sha256: sha256(bytes),
			size: bytes.byteLength
		};
	};
	const outputs = {
		dark: {
			path: spec.output.darkPath,
			sha256: sha256(readFileSync(finalDark)),
			width: 960,
			height: 540
		},
		light: {
			path: spec.output.lightPath,
			sha256: sha256(readFileSync(finalLight)),
			width: 960,
			height: 540
		}
	};
	const job = {
		schemaVersion: 'science-question-art-job/v1',
		id: spec.id,
		status: 'passed',
		attempt: 1,
		imageModel: 'chatgpt-gpt-image-2',
		specSha256: canonicalHash(spec),
		repairReviewSha256: null,
		repairPerceptualAuditSha256: null,
		repairInstructions: [],
		artifacts: {
			spec: artifact(specPath),
			darkPrompt: artifact(darkPrompt),
			lightPrompt: artifact(lightPrompt),
			darkMaster: artifact(darkMaster),
			lightMaster: artifact(lightMaster),
			darkNormalized: artifact(darkNormalized),
			lightNormalized: artifact(lightNormalized)
		},
		checks: {
			darkMaster: {
				status: 'passed',
				width: 1672,
				height: 941,
				sha256: sha256(readFileSync(darkMaster))
			},
			lightMaster: {
				status: 'passed',
				width: 1672,
				height: 941,
				sha256: sha256(readFileSync(lightMaster))
			},
			pair: {
				status: 'passed',
				width: 960,
				height: 540,
				darkSha256: outputs.dark.sha256,
				lightSha256: outputs.light.sha256
			}
		},
		outputs,
		finishedAt: '2026-01-01T00:00:00.000Z'
	};
	const jobPath = path.join(specDir, 'job.json');
	writeFileSync(jobPath, `${stableStringify(job)}\n`);
	return {
		root,
		manifest,
		manifestPath,
		workRoot,
		spec,
		jobPath,
		finalDark,
		finalLight,
		cleanup() {
			rmSync(root, { recursive: true, force: true });
		}
	};
}

function makeFailedResumeFixture(attemptCount) {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'science-art-failed-resume-')));
	const manifest = artManifest();
	const spec = manifest.specs[0];
	const manifestPath = path.join(root, 'art-manifest.json');
	const workRoot = path.join(root, 'generation-work');
	writeFileSync(manifestPath, `${stableStringify(manifest)}\n`);
	prepareOwnedArtWorkRoot({
		workRoot,
		workspaceRoot: root,
		releaseId: manifest.releaseId,
		manifestSha256: canonicalHash(manifest)
	});
	const specDir = path.join(workRoot, spec.id);
	mkdirSync(specDir);
	writeFileSync(path.join(specDir, 'spec.json'), `${stableStringify(spec)}\n`);
	const attempts = [];
	for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
		const attemptDir = path.join(specDir, `attempt-${String(attempt).padStart(2, '0')}`);
		mkdirSync(attemptDir);
		const failure = {
			attempt,
			error: `simulated failure ${attempt}`,
			finishedAt: `2026-01-0${attempt}T00:00:00.000Z`,
			retainedArtifacts: {},
			discardedImageArtifacts: [],
			evidenceIssues: [],
			imageCleanup: { status: 'passed', removed: [], issues: [] }
		};
		writeFileSync(path.join(attemptDir, 'failure.json'), `${stableStringify(failure)}\n`);
		attempts.push(failure);
	}
	writeFileSync(
		path.join(specDir, 'job.json'),
		`${stableStringify({
			schemaVersion: 'science-question-art-job/v1',
			id: spec.id,
			status: 'failed',
			imageModel: 'chatgpt-gpt-image-2',
			specSha256: canonicalHash(spec),
			repairReviewSha256: null,
			repairPerceptualAuditSha256: null,
			attempts,
			finishedAt: '2026-01-04T00:00:00.000Z'
		})}\n`
	);
	return {
		root,
		manifestPath,
		workRoot,
		spec,
		cleanup() {
			rmSync(root, { recursive: true, force: true });
		}
	};
}

function makeUsedPerceptualRepairFixture() {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'science-art-used-repair-')));
	const manifest = artManifest();
	const manifestPath = path.join(root, 'art-manifest.json');
	const workRoot = path.join(root, 'generation-work');
	writeFileSync(manifestPath, `${stableStringify(manifest)}\n`);
	const assetInventory = [];
	const fingerprints = Object.fromEntries(
		SCIENCE_QUESTION_ART_DHASH_VARIANTS.map((variant) => [variant, '0'.repeat(16)])
	);
	const confirmationFingerprints = Object.fromEntries(
		SCIENCE_QUESTION_ART_DHASH_VARIANTS.map((variant) => [variant, '0'.repeat(64)])
	);
	const records = [];
	for (const spec of manifest.specs) {
		const inventory = { id: spec.id };
		for (const theme of ['dark', 'light']) {
			const outputPath = path.join(root, spec.output[`${theme}Path`]);
			mkdirSync(path.dirname(outputPath), { recursive: true });
			writeFileSync(outputPath, `${spec.id}-${theme}-bytes`);
			const digest = sha256(readFileSync(outputPath));
			inventory[`${theme}Sha256`] = digest;
			records.push({
				id: `${spec.id}-${theme}`,
				artId: spec.id,
				theme,
				localPath: spec.output[`${theme}Path`],
				sha256: digest,
				dHashes: fingerprints,
				confirmationDHashes: confirmationFingerprints
			});
		}
		assetInventory.push(inventory);
	}
	const collisions = findPerceptualCollisions(records, SCIENCE_QUESTION_ART_DHASH_THRESHOLD);
	const audit = {
		schemaVersion: SCIENCE_QUESTION_ART_PERCEPTUAL_AUDIT_SCHEMA,
		manifestSha256: canonicalHash(manifest),
		assetInventorySha256: canonicalHash(assetInventory),
		algorithm: SCIENCE_QUESTION_ART_DHASH_ALGORITHM,
		threshold: SCIENCE_QUESTION_ART_DHASH_THRESHOLD,
		confirmationThreshold: SCIENCE_QUESTION_ART_CONFIRMATION_DHASH_THRESHOLD,
		recordCount: records.length,
		collisionCount: collisions.length,
		status: 'failed',
		records,
		collisions
	};
	const auditPath = path.join(root, 'review', 'perceptual-audit.json');
	mkdirSync(path.dirname(auditPath));
	writeFileSync(auditPath, `${stableStringify(audit)}\n`);
	prepareOwnedArtWorkRoot({
		workRoot,
		workspaceRoot: root,
		releaseId: manifest.releaseId,
		manifestSha256: canonicalHash(manifest)
	});
	const repairHash = canonicalHash(audit);
	const repairRunId = repairHash.slice(0, 12);
	const specDir = path.join(workRoot, manifest.specs[0].id);
	mkdirSync(specDir);
	prepareRepairLineageIdentity({
		specDir,
		repairRunId,
		repairEvidenceKind: 'perceptual-audit',
		repairEvidenceSha256: repairHash
	});
	const attemptDir = path.join(specDir, `repair-${repairRunId}-attempt-01`);
	mkdirSync(attemptDir);
	const failure = {
		attempt: 1,
		error: 'simulated interrupted repair',
		finishedAt: '2026-01-01T00:00:00.000Z',
		retainedArtifacts: {},
		discardedImageArtifacts: [],
		evidenceIssues: [],
		imageCleanup: { status: 'passed', removed: [], issues: [] }
	};
	writeFileSync(path.join(attemptDir, 'failure.json'), `${stableStringify(failure)}\n`);
	return {
		root,
		manifestPath,
		workRoot,
		auditPath,
		attemptDir,
		repairRunId,
		cleanup() {
			rmSync(root, { recursive: true, force: true });
		}
	};
}

function addRepairLineage(fixture) {
	const instruction = 'Use a materially different, question-specific composition.';
	const repairEvidence = {
		schemaVersion: 'science-question-art-review-summary/v2',
		status: 'failed',
		reviews: [
			{
				id: fixture.spec.id,
				accepted: false,
				disposition: 'fresh-regenerate',
				issues: [
					{
						severity: 'major',
						regenerationInstruction: instruction
					}
				]
			}
		]
	};
	const repairHash = canonicalHash(repairEvidence);
	const repairRunId = repairHash.slice(0, 12);
	const specDir = path.join(fixture.workRoot, fixture.spec.id);
	prepareRepairLineageIdentity({
		specDir,
		repairRunId,
		repairEvidenceKind: 'independent-review',
		repairEvidenceSha256: repairHash
	});
	const evidencePath = path.join(fixture.workRoot, `repair-evidence-${repairHash}.json`);
	writeFileSync(evidencePath, `${stableStringify(repairEvidence)}\n`);
	const attemptDir = path.join(specDir, `repair-${repairRunId}-attempt-01`);
	mkdirSync(attemptDir);
	const paths = {
		spec: path.join(specDir, 'spec.json'),
		darkPrompt: path.join(attemptDir, 'dark-prompt.txt'),
		lightPrompt: path.join(attemptDir, 'light-prompt.txt'),
		darkMaster: path.join(attemptDir, 'dark-master.webp'),
		lightMaster: path.join(attemptDir, 'light-master.webp'),
		darkNormalized: path.join(attemptDir, 'dark.webp'),
		lightNormalized: path.join(attemptDir, 'light.webp')
	};
	writeFileSync(paths.darkPrompt, 'repair dark prompt\n');
	writeFileSync(paths.lightPrompt, 'repair light prompt\n');
	writeFileSync(paths.darkMaster, 'repaired-master-dark');
	writeFileSync(paths.lightMaster, 'repaired-master-light');
	writeFileSync(paths.darkNormalized, 'repaired-normalized-dark');
	writeFileSync(paths.lightNormalized, 'repaired-normalized-light');
	writeFileSync(fixture.finalDark, readFileSync(paths.darkNormalized));
	writeFileSync(fixture.finalLight, readFileSync(paths.lightNormalized));
	const artifact = (filePath) => {
		const bytes = readFileSync(filePath);
		return {
			path: path.relative(fixture.root, filePath),
			sha256: sha256(bytes),
			size: bytes.byteLength
		};
	};
	const outputs = {
		dark: {
			path: fixture.spec.output.darkPath,
			sha256: sha256(readFileSync(fixture.finalDark)),
			width: 960,
			height: 540
		},
		light: {
			path: fixture.spec.output.lightPath,
			sha256: sha256(readFileSync(fixture.finalLight)),
			width: 960,
			height: 540
		}
	};
	const job = {
		schemaVersion: 'science-question-art-job/v1',
		id: fixture.spec.id,
		status: 'passed',
		attempt: 1,
		imageModel: 'chatgpt-gpt-image-2',
		specSha256: canonicalHash(fixture.spec),
		repairReviewSha256: repairHash,
		repairPerceptualAuditSha256: null,
		repairInstructions: [instruction],
		artifacts: Object.fromEntries(
			Object.entries(paths).map(([name, filePath]) => [name, artifact(filePath)])
		),
		checks: {
			darkMaster: {
				status: 'passed',
				width: 1672,
				height: 941,
				sha256: sha256(readFileSync(paths.darkMaster))
			},
			lightMaster: {
				status: 'passed',
				width: 1672,
				height: 941,
				sha256: sha256(readFileSync(paths.lightMaster))
			},
			pair: {
				status: 'passed',
				width: 960,
				height: 540,
				darkSha256: outputs.dark.sha256,
				lightSha256: outputs.light.sha256
			}
		},
		outputs,
		finishedAt: '2026-02-01T00:00:00.000Z'
	};
	writeFileSync(path.join(specDir, `repair-${repairRunId}-job.json`), `${stableStringify(job)}\n`);
	return { evidencePath, job, repairHash, repairRunId };
}

function artManifest() {
	const releaseId = 'science-art-safety-test-v1';
	const challengeId = 'biology-safety-test-01';
	return {
		schemaVersion: 'science-question-art-manifest/v1',
		releaseId,
		width: 960,
		height: 540,
		specs: ['opening', 'transfer'].map((context) => {
			const id = `${challengeId}-${context}`;
			return {
				schemaVersion: 'science-question-art/v1',
				id,
				challengeId,
				subject: 'biology',
				context,
				question:
					context === 'opening'
						? 'Describe the starting arrangement of cells in this investigation.'
						: 'Explain how a second cell sample should be prepared for comparison.',
				scene:
					context === 'opening'
						? 'A microscope beside one prepared biological slide'
						: 'A second microscope beside two empty sample dishes',
				visualAnchor:
					context === 'opening'
						? 'One central microscope and a single slide'
						: 'One central microscope and two separated dishes',
				altText:
					context === 'opening'
						? 'A text-free microscope scene with one prepared slide.'
						: 'A text-free microscope scene with two empty sample dishes.',
				approvedMeaning: 'The starting setup is visible without revealing an answer or outcome.',
				accuracyConstraints: [
					'Keep the microscope components physically plausible.',
					'Keep every sample container intact.'
				],
				forbiddenDetails: [
					'Do not show an experimental result.',
					'Do not add labels, values or equations.'
				],
				output: {
					darkPath: `tmp/science-challenges/${releaseId}/art-assets/${id}-dark-v1.webp`,
					lightPath: `tmp/science-challenges/${releaseId}/art-assets/${id}-light-v1.webp`
				}
			};
		})
	};
}
