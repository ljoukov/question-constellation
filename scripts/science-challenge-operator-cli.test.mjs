import assert from 'node:assert/strict';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = process.cwd();
const aggregateCli = path.join(
	repositoryRoot,
	'scripts/aggregate-science-challenge-verification.mjs'
);
const materializeCli = path.join(
	repositoryRoot,
	'scripts/materialize-science-challenge-release.mjs'
);
const uploadArtCli = path.join(repositoryRoot, 'scripts/upload-science-challenge-art.mjs');

test('aggregate help exits before default evidence reads or writes', () => {
	withEmptyCwd((cwd) => {
		const result = run(cwd, aggregateCli, '--help');
		assert.equal(result.status, 0, result.stderr);
		assert.match(
			result.stdout,
			/Usage: node scripts\/aggregate-science-challenge-verification\.mjs/
		);
		assert.deepEqual(readdirSync(cwd), []);
	});
});

test('aggregate parser rejects unknown, positional, assigned boolean, empty and duplicate options', () => {
	for (const arguments_ of [
		['--unknown=value'],
		['--unknown'],
		['unexpected-positional'],
		['--help=true'],
		['--index='],
		['--index=first.json', '--index=second.json'],
		['--help', '-h']
	]) {
		withEmptyCwd((cwd) => {
			const output = path.join(cwd, 'must-not-exist.json');
			const result = run(cwd, aggregateCli, ...arguments_, `--output=${output}`);
			assert.notEqual(result.status, 0, arguments_.join(' '));
			assert.match(
				result.stderr,
				/Unknown option|Unexpected positional|requires a non-empty value|Duplicate/
			);
			assert.equal(existsSync(output), false);
			assert.deepEqual(readdirSync(cwd), []);
		});
	}
});

test('materializer help exits before default evidence reads or writes', () => {
	withEmptyCwd((cwd) => {
		const result = run(cwd, materializeCli, '--help');
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Usage: node scripts\/materialize-science-challenge-release\.mjs/);
		assert.deepEqual(readdirSync(cwd), []);
	});
});

test('materializer parser rejects unknown, positional, assigned boolean, empty and duplicate options', () => {
	for (const arguments_ of [
		['--unknown=value'],
		['--unknown'],
		['unexpected-positional'],
		['--help=true'],
		['--plan='],
		['--plan=first.json', '--plan=second.json'],
		['--mode=candidate', '--mode=release'],
		['--help', '-h']
	]) {
		withEmptyCwd((cwd) => {
			const result = run(cwd, materializeCli, ...arguments_);
			assert.notEqual(result.status, 0, arguments_.join(' '));
			assert.match(
				result.stderr,
				/Unknown option|Unexpected positional|requires a non-empty value|Duplicate/
			);
			assert.deepEqual(readdirSync(cwd), []);
		});
	}
});

test('art uploader full-manifest dry-run binds archived provenance without remote calls', () => {
	withUploaderFixture((fixture) => {
		const result = spawnSync(
			process.execPath,
			[
				'--experimental-loader',
				fixture.loaderPath,
				uploadArtCli,
				`--manifest=${fixture.manifestPath}`,
				`--art-manifest=${fixture.artManifestPath}`,
				`--release=${fixture.releasePath}`
			],
			{
				cwd: fixture.root,
				encoding: 'utf8',
				env: {
					...process.env,
					CLOUDFLARE_API_TOKEN: '',
					CLOUDFLARE_ACCOUNT_ACCESS_TOKEN: '',
					SCIENCE_ART_UPLOADER_MOCK_ROOT: fixture.mockRoot,
					SCIENCE_ART_UPLOADER_WRANGLER_MARKER: fixture.wranglerMarker
				}
			}
		);
		assert.equal(result.status, 0, result.stderr);
		const output = JSON.parse(result.stdout);
		assert.equal(output.status, 'dry-run');
		assert.equal(output.remoteReadback, 'not-run');
		assert.equal(output.objects, 1);
		assert.equal(existsSync(fixture.wranglerMarker), false);
	});
});

test('candidate materialization refuses an existing output before reading content inputs', () => {
	withEmptyCwd((cwd) => {
		const output = path.join(cwd, 'compiled');
		mkdirSync(output);
		const result = run(
			cwd,
			materializeCli,
			'--mode=candidate',
			`--candidate-output=${output}`,
			'--plan=missing-plan.json',
			'--source=missing-source.json',
			'--evidence=missing-evidence.json'
		);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /output already exists; use a fresh absent directory/);
		assert.deepEqual(readdirSync(cwd), ['compiled']);
		assert.deepEqual(readdirSync(output), []);
	});
});

test('materializer derives top-level thinking metadata from accepted shard lineage', () => {
	const source = readFileSync(materializeCli, 'utf8');
	assert.match(source, /acceptedContentThinkingLevels/);
	assert.match(source, /thinkingLevel:\s*acceptedContentThinkingLevels\.length === 1/s);
	assert.match(source, /thinkingLevels: acceptedContentThinkingLevels/);
	assert.doesNotMatch(
		source,
		/release:\s*\{[\s\S]*?thinkingLevel:\s*'max'[\s\S]*?\.\.\.releaseBindings/
	);
});

test('materializer keeps review-rebase B0 and successor release gates fail-closed', () => {
	const source = readFileSync(materializeCli, 'utf8');
	assert.match(source, /--review-rebase-manifest=<repo-relative review-rebase manifest\.json>/);
	assert.match(source, /readScienceChallengeReviewRebaseEvidence\(\{/);
	assert.match(
		source,
		/Direct review-rebase candidates are review-pending and cannot materialize an accepted release/
	);
	assert.match(
		source,
		/if \(args\.mode === 'release' && effectiveCohort\) \{\s*effectiveReleaseGate = validateScienceChallengeEffectiveReleaseGate/s
	);
	assert.match(
		source,
		/effectiveCohort && recoveryDirectoryCount === 0 && !effectiveReviewRebaseEvidence/
	);
	assert.match(
		source,
		/validateScienceChallengeEffectiveReleaseGate\(\{[\s\S]*?reviewRebaseEvidence[\s\S]*?\}\)/
	);
	assert.match(
		source,
		/contentParentLineageSha256:\s*effectiveReleaseGate\?\.contentParentLineageSha256 \?\? null/
	);
	assert.match(source, /reviewRebaseSource\s*=\s*reviewRebaseSourced/);
	assert.match(source, /kind: 'review-rebase-selection'/);
	assert.match(source, /runSummaries,\s*reviewRebaseSource,/s);
	assert.match(
		source,
		/reviewRebaseEvidence,[\s\S]*?reviewRebaseInfrastructureRecoveryEvidence,[\s\S]*?reviewRebaseExistingDefinitions: reviewRebaseEvidence \? existingCatalog : null/s
	);
});

test('materializer forwards the authenticated empty-recovery successor binding into raw review replay', () => {
	const source = readFileSync(materializeCli, 'utf8');
	assert.match(
		source,
		/import\s*\{[\s\S]*?buildScienceChallengeReviewRebaseSuccessorEmptyRecoveryBinding,[\s\S]*?\}\s*from '\.\/lib\/science-challenge-review-evidence\.mjs';/
	);
	assert.match(
		source,
		/function readAndRequireContentReview\([\s\S]*?const expectedReviewRebaseSuccessorEmptyRecoveryBinding =\s*buildMaterializerReviewRebaseSuccessorEmptyRecoveryBinding\(\{\s*effectiveCohort,\s*reviewRebaseEvidence,\s*reviewRebaseInfrastructureRecoveryEvidence\s*\}\);[\s\S]*?requireContentVerificationEvidence\(\{[\s\S]*?expectedReviewRebaseSuccessorEmptyRecoveryBinding,[\s\S]*?\}\);/
	);

	const calls = [];
	const expectedBinding = {
		schemaVersion: 'trusted-empty-successor-binding/v1',
		effectiveCohortManifestSha256: 'a'.repeat(64),
		recoverySetSha256: 'b'.repeat(64)
	};
	const helper = loadMaterializerEmptySuccessorBindingHelper(source, (input) => {
		calls.push(input);
		return expectedBinding;
	});
	const effectiveCohort = { status: 'passed', manifest: { disposition: 'successor' } };
	const reviewRebaseEvidence = { status: 'passed', manifest: { rebaseId: 'review-rebase' } };
	const reviewRebaseInfrastructureRecoveryEvidence = {
		status: 'passed',
		manifest: { recoveryId: 'review-rebase-infrastructure-recovery' }
	};

	assert.equal(
		helper({
			effectiveCohort,
			reviewRebaseEvidence,
			reviewRebaseInfrastructureRecoveryEvidence
		}),
		expectedBinding
	);
	assert.deepEqual(calls, [
		{ effectiveCohort, reviewRebaseEvidence, reviewRebaseInfrastructureRecoveryEvidence }
	]);
});

test('materializer empty-successor binding is absent only without ancestry and propagates tamper rejection', () => {
	const source = readFileSync(materializeCli, 'utf8');
	let buildCalls = 0;
	const missingAncestryHelper = loadMaterializerEmptySuccessorBindingHelper(source, () => {
		buildCalls += 1;
		return {};
	});
	const effectiveCohort = { status: 'passed' };
	const reviewRebaseEvidence = { status: 'passed' };

	assert.equal(missingAncestryHelper({ effectiveCohort: null, reviewRebaseEvidence }), null);
	assert.equal(missingAncestryHelper({ effectiveCohort, reviewRebaseEvidence: null }), null);
	assert.equal(buildCalls, 0);

	const rejected = new Error('Authenticated review-rebase successor ancestry is invalid');
	const tamperedHelper = loadMaterializerEmptySuccessorBindingHelper(source, () => {
		throw rejected;
	});
	assert.throws(
		() => tamperedHelper({ effectiveCohort, reviewRebaseEvidence }),
		(error) => error === rejected
	);
});

test('candidate materialization commits both typed verifier inputs inside the atomic output tree', () => {
	const source = readFileSync(materializeCli, 'utf8');
	const remapWrite = source.indexOf(
		"path.join(materializationRoot, 'curriculum-remap-verifier-input.json')"
	);
	const difficultyWrite = source.indexOf(
		"path.join(materializationRoot, 'difficulty-plan-adjustment-verifier-input.json')"
	);
	const releaseMarker = source.indexOf(
		"path.join(materializationRoot, 'accepted-challenges.json')"
	);
	assert.ok(remapWrite >= 0);
	assert.ok(difficultyWrite >= 0);
	assert.ok(releaseMarker > remapWrite);
	assert.ok(releaseMarker > difficultyWrite);
	assert.match(source, /if \(args\.mode === 'candidate' && curriculumRemapVerifierInput\)/);
	assert.match(
		source,
		/if \(args\.mode === 'candidate' && difficultyPlanAdjustmentVerifierInput\)/
	);
	assert.match(source, /renameSync\(releaseStagingRoot, outputRoot\)/);
});

function loadMaterializerEmptySuccessorBindingHelper(source, buildBinding) {
	const match = source.match(
		/function buildMaterializerReviewRebaseSuccessorEmptyRecoveryBinding\(\{\s*effectiveCohort,\s*reviewRebaseEvidence,\s*reviewRebaseInfrastructureRecoveryEvidence\s*\}\) \{[\s\S]*?\n\}/
	);
	assert.ok(match, 'materializer empty-successor binding helper must exist');
	return Function(
		'buildScienceChallengeReviewRebaseSuccessorEmptyRecoveryBinding',
		`"use strict"; return (${match[0]});`
	)(buildBinding);
}

function run(cwd, cli, ...arguments_) {
	return spawnSync(process.execPath, [cli, ...arguments_], {
		cwd,
		encoding: 'utf8',
		env: {
			...process.env,
			CLOUDFLARE_API_TOKEN: '',
			CLOUDFLARE_ACCOUNT_ACCESS_TOKEN: ''
		}
	});
}

function withEmptyCwd(callback) {
	const cwd = mkdtempSync(path.join(tmpdir(), 'science-challenge-operator-cli-'));
	try {
		callback(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function withUploaderFixture(callback) {
	const root = mkdtempSync(path.join(tmpdir(), 'science-challenge-art-uploader-'));
	try {
		const releaseRoot = path.join(root, 'release');
		const provenanceRoot = path.join(releaseRoot, 'provenance');
		const assetPath = path.join(
			root,
			'tmp/science-challenges/science-test-v1/art-assets/challenge-001-opening-dark-v1.webp'
		);
		const manifestPath = path.join(releaseRoot, 'art-delivery-manifest.json');
		const artManifestPath = path.join(releaseRoot, 'art-manifest.json');
		const releasePath = path.join(releaseRoot, 'accepted-challenges.json');
		const mockRoot = path.join(root, 'mocks');
		const loaderPath = path.join(mockRoot, 'loader.mjs');
		const wranglerMarker = path.join(root, 'wrangler-called');
		const hashA = 'a'.repeat(64);
		const hashB = 'b'.repeat(64);
		const materializedAt = '2026-07-23T00:00:00.000Z';

		writeJson(artManifestPath, {
			schemaVersion: 'science-question-art-manifest/v1',
			releaseId: 'science-test-v1',
			specs: []
		});
		writeJson(manifestPath, {
			schemaVersion: 'science-question-art-delivery/v1',
			releaseId: 'science-test-v1',
			bucket: 'question-constellation',
			objects: [
				{
					id: 'challenge-001-opening-dark',
					localPath: path.relative(root, assetPath),
					r2Key: 'images/challenges/science-test-v1/challenge-001-opening-dark.webp',
					size: 1,
					sha256: hashB
				}
			]
		});
		writeJson(releasePath, {
			release: {
				id: 'science-test-v1',
				status: 'accepted',
				materializedAt,
				artManifestSha256: hashA,
				artDeliveryManifestSha256: hashA,
				artPerceptualAuditSha256: hashA,
				provenanceArchiveSha256: hashA,
				runtimeSha256: hashA
			},
			challenges: []
		});
		writeJson(path.join(releaseRoot, 'short-recall-prompts.json'), []);
		writeJson(path.join(releaseRoot, 'short-recall-authoring-evidence.json'), {});
		writeJson(path.join(releaseRoot, 'short-recall-review-evidence.json'), {});
		writeJson(path.join(releaseRoot, 'runtime.json'), { releaseId: 'science-test-v1' });
		writeJson(path.join(provenanceRoot, 'art/perceptual-audit.json'), { status: 'passed' });
		mkdirSync(path.dirname(assetPath), { recursive: true });
		writeFileSync(assetPath, Buffer.from([1]));

		mkdirSync(mockRoot, { recursive: true });
		writeFileSync(
			path.join(mockRoot, 'dependencies.mjs'),
			[
				'import { readFileSync } from "node:fs";',
				'import path from "node:path";',
				`const hashA = '${hashA}';`,
				`const hashB = '${hashB}';`,
				'export const canonicalHash = () => hashA;',
				'export const sha256 = () => hashB;',
				'export const validateQuestionArtDeliveryManifest = () => ({ status: "passed", issues: [] });',
				'export const validateRelease = () => ({ status: "passed", issues: [] });',
				'export const scienceChallengeProvenanceBindings = () => ({});',
				'export const validateScienceChallengeProvenanceArchive = () => ({',
				'  status: "passed",',
				'  issues: [],',
				`  manifest: { releaseId: "science-test-v1", materializedAt: "${materializedAt}" }`,
				'});',
				'export const validateScienceChallengeReleaseUploadEvidence = () => ({',
				'  status: "passed",',
				'  issues: [],',
				'  basePlan: { rows: [] },',
				'  effectivePlan: { rows: [] },',
				'  sourceHashIndex: { questions: [] },',
				'  curriculumHashIndex: { components: [] },',
				`  candidateSetSha256: '${'c'.repeat(64)}'`,
				'});',
				'export const readScienceChallengeReleaseShortRecallUploadEvidence = ({ acceptedReleasePath }) => {',
				'  const releaseRoot = path.dirname(acceptedReleasePath);',
				'  const read = (name) => {',
				'    const filePath = path.join(releaseRoot, name);',
				'    return { path: filePath, bytes: readFileSync(filePath), value: {} };',
				'  };',
				'  return {',
				'    status: "passed",',
				'    issues: [],',
				'    bundleSha256: hashA,',
				'    reviewSha256: hashA,',
				'    authoringEvidenceSha256: hashA,',
				'    files: {',
				'      prompts: read("short-recall-prompts.json"),',
				'      reviewEvidence: read("short-recall-review-evidence.json"),',
				'      authoringEvidence: read("short-recall-authoring-evidence.json")',
				'    }',
				'  };',
				'};',
				'export const buildPerceptualAudit = () => ({ status: "passed" });',
				'export const validatePerceptualAudit = () => ({ status: "passed", issues: [] });',
				''
			].join('\n')
		);
		writeFileSync(
			loaderPath,
			[
				"import path from 'node:path';",
				"import { pathToFileURL } from 'node:url';",
				'const mocked = new Set([',
				'  "./lib/science-challenge-provenance-archive.mjs",',
				'  "./lib/science-challenge-release.mjs",',
				'  "./lib/science-challenge-release-upload.mjs",',
				'  "./lib/science-question-art-perceptual.mjs"',
				']);',
				'export async function resolve(specifier, context, nextResolve) {',
				'  if (context.parentURL?.endsWith("/scripts/upload-science-challenge-art.mjs") && mocked.has(specifier)) {',
				'    return {',
				'      url: pathToFileURL(path.join(process.env.SCIENCE_ART_UPLOADER_MOCK_ROOT, "dependencies.mjs")).href,',
				'      shortCircuit: true',
				'    };',
				'  }',
				'  return nextResolve(specifier, context);',
				'}',
				''
			].join('\n')
		);
		const wranglerPath = path.join(root, 'node_modules/.bin/wrangler');
		mkdirSync(path.dirname(wranglerPath), { recursive: true });
		writeFileSync(
			wranglerPath,
			[
				'#!/usr/bin/env node',
				"import { writeFileSync } from 'node:fs';",
				"writeFileSync(process.env.SCIENCE_ART_UPLOADER_WRANGLER_MARKER, 'called\\n');",
				'process.exit(97);',
				''
			].join('\n')
		);
		chmodSync(wranglerPath, 0o755);

		callback({
			root,
			manifestPath,
			artManifestPath,
			releasePath,
			mockRoot,
			loaderPath,
			wranglerMarker
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}
