import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { uploadScienceChallengeArtObject } from './lib/science-challenge-art-r2-upload.mjs';

const repositoryRoot = process.cwd();
const uploaderCli = path.join(repositoryRoot, 'scripts/upload-science-challenge-art.mjs');

test('science-179-v1 dry-run authenticates exactly 239 pairs and 478 perceptual WebPs without Wrangler', () => {
	withAcceptedUploaderFixture((fixture) => {
		const result = runAcceptedUploader(fixture);
		assert.equal(result.status, 0, result.stderr);
		const output = JSON.parse(result.stdout);
		assert.equal(output.status, 'dry-run');
		assert.equal(output.releaseId, 'science-179-v1');
		assert.equal(output.artPairs, 239);
		assert.equal(output.objects, 478);
		assert.equal(output.perceptualRecords, 478);
		assert.equal(output.manifestFileSha256, fixture.fileSha256);
		assert.equal(output.manifestCanonicalSha256, fixture.canonicalSha256);
		assert.equal(output.acceptedReleaseSha256, fixture.releaseSha256);
		assert.equal(output.remoteReadback, 'not-run');
		assert.equal(existsSync(fixture.wranglerMarker), false);
	});
});

test('science-179-v1 rejects any 239/478/perceptual count drift before Wrangler', async (t) => {
	await t.test('art pair count', () => {
		withAcceptedUploaderFixture((fixture) => {
			const manifest = readJson(fixture.artManifestPath);
			manifest.specs.pop();
			writeJson(fixture.artManifestPath, manifest);
			const result = runAcceptedUploader(fixture);
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, /exactly 179 challenges, 239 pairs, 478 delivery objects/);
			assert.equal(existsSync(fixture.wranglerMarker), false);
		});
	});

	await t.test('delivery object count', () => {
		withAcceptedUploaderFixture((fixture) => {
			const manifest = readJson(fixture.manifestPath);
			manifest.objects.pop();
			manifest.objectCount = manifest.objects.length;
			writeJson(fixture.manifestPath, manifest);
			const result = runAcceptedUploader(fixture);
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, /exactly 179 challenges, 239 pairs, 478 delivery objects/);
			assert.equal(existsSync(fixture.wranglerMarker), false);
		});
	});

	await t.test('perceptual record count', () => {
		withAcceptedUploaderFixture((fixture) => {
			const audit = readJson(fixture.perceptualPath);
			audit.records.pop();
			audit.recordCount = audit.records.length;
			writeJson(fixture.perceptualPath, audit);
			const result = runAcceptedUploader(fixture);
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, /478 perceptual records/);
			assert.equal(existsSync(fixture.wranglerMarker), false);
		});
	});
});

test('science-179-v1 upload requires all explicit delivery and release hashes before Wrangler', () => {
	withAcceptedUploaderFixture((fixture) => {
		const pins = [
			`--expected-file-sha256=${fixture.fileSha256}`,
			`--expected-canonical-sha256=${fixture.canonicalSha256}`,
			`--expected-release-sha256=${fixture.releaseSha256}`
		];
		for (let omitted = 0; omitted < pins.length; omitted += 1) {
			const result = runAcceptedUploader(
				fixture,
				'--upload',
				...pins.filter((_, index) => index !== omitted)
			);
			assert.notEqual(result.status, 0);
			assert.match(
				result.stderr,
				/--upload requires --expected-file-sha256, --expected-canonical-sha256 and --expected-release-sha256/
			);
			assert.equal(existsSync(fixture.wranglerMarker), false);
		}
		for (let mismatched = 0; mismatched < pins.length; mismatched += 1) {
			const result = runAcceptedUploader(
				fixture,
				'--upload',
				...pins.map((pin, index) =>
					index === mismatched ? `${pin.slice(0, pin.indexOf('=') + 1)}${'c'.repeat(64)}` : pin
				)
			);
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, /SHA-256 differs from --expected-/);
			assert.equal(existsSync(fixture.wranglerMarker), false);
		}
	});
});

test('science-179-v1 accepts only the exact manifest siblings inside its authenticated tree', () => {
	withAcceptedUploaderFixture((fixture) => {
		const copiedManifest = path.join(fixture.root, 'copied-art-delivery-manifest.json');
		writeFileSync(copiedManifest, readFileSync(fixture.manifestPath));
		const result = runAcceptedUploader(fixture, `--manifest=${copiedManifest}`);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /must be the exact art-delivery-manifest\.json release sibling/);
		assert.equal(existsSync(fixture.wranglerMarker), false);
	});
});

test('science-179-v1 can read bound art bytes from an explicit evidence root without emitting it', () => {
	withAcceptedUploaderFixture((fixture) => {
		const alternateRoot = path.join(fixture.root, 'private-art-evidence');
		mkdirSync(alternateRoot);
		renameSync(path.join(fixture.root, 'tmp'), path.join(alternateRoot, 'tmp'));
		const result = runAcceptedUploader(fixture, `--art-evidence-root=${alternateRoot}`);
		assert.equal(result.status, 0, result.stderr);
		const output = JSON.parse(result.stdout);
		assert.equal(output.objects, 478);
		assert.equal(result.stdout.includes(alternateRoot), false);
		assert.equal(existsSync(fixture.wranglerMarker), false);
	});
});

test('R2 upload puts a private read-only snapshot and requires an exact get/readback', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-art-r2-helper-'));
	try {
		const localPath =
			'tmp/science-challenges/science-179-v1/art-assets/challenge-001-opening-dark-v1.webp';
		const sourcePath = path.join(root, localPath);
		const sourceBytes = Buffer.from('reviewed-webp-bytes');
		mkdirSync(path.dirname(sourcePath), { recursive: true });
		writeFileSync(sourcePath, sourceBytes);
		const object = uploadObject(localPath, sourceBytes);
		const actions = [];
		let remoteBytes = null;
		let snapshotPath = null;
		const result = await uploadScienceChallengeArtObject({
			object,
			bucket: 'question-constellation',
			repositoryRoot: root,
			wranglerCommand: 'wrangler',
			retries: 0,
			execFileAsync: async (_command, arguments_) => {
				const action = arguments_[2];
				const filePath = optionValue(arguments_, '--file');
				actions.push(action);
				if (action === 'put') {
					snapshotPath = filePath;
					assert.notEqual(filePath, sourcePath);
					assert.equal(statSync(filePath).mode & 0o777, 0o400);
					assert.deepEqual(readFileSync(filePath), sourceBytes);
					remoteBytes = readFileSync(filePath);
				} else if (action === 'get') {
					writeFileSync(filePath, remoteBytes);
				} else {
					assert.fail(`Unexpected Wrangler action ${String(action)}`);
				}
				return { stdout: '', stderr: '' };
			}
		});
		assert.deepEqual(result, {
			id: object.id,
			status: 'passed',
			attempt: 1
		});
		assert.deepEqual(actions, ['put', 'get']);
		assert.match(path.basename(snapshotPath), new RegExp(`^${object.sha256}\\.webp$`));
		assert.equal(existsSync(snapshotPath), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('R2 upload rejects a get/readback whose bytes differ from the reviewed snapshot', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-art-r2-readback-'));
	try {
		const localPath =
			'tmp/science-challenges/science-179-v1/art-assets/challenge-001-opening-dark-v1.webp';
		const sourcePath = path.join(root, localPath);
		const sourceBytes = Buffer.from('reviewed-webp-bytes');
		mkdirSync(path.dirname(sourcePath), { recursive: true });
		writeFileSync(sourcePath, sourceBytes);
		const object = uploadObject(localPath, sourceBytes);
		const result = await uploadScienceChallengeArtObject({
			object,
			bucket: 'question-constellation',
			repositoryRoot: root,
			wranglerCommand: 'wrangler',
			retries: 0,
			execFileAsync: async (_command, arguments_) => {
				if (arguments_[2] === 'get') {
					writeFileSync(optionValue(arguments_, '--file'), Buffer.from('wrong'));
				}
				return { stdout: '', stderr: '' };
			}
		});
		assert.equal(result.status, 'failed');
		assert.match(result.error, /Remote R2 readback differs from the reviewed bytes/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

function withAcceptedUploaderFixture(callback) {
	const root = mkdtempSync(path.join(tmpdir(), 'science-179-art-uploader-'));
	try {
		const releaseRoot = path.join(root, 'release');
		const manifestPath = path.join(releaseRoot, 'art-delivery-manifest.json');
		const artManifestPath = path.join(releaseRoot, 'art-manifest.json');
		const perceptualPath = path.join(releaseRoot, 'art-perceptual-audit.json');
		const releasePath = path.join(releaseRoot, 'accepted-challenges.json');
		const mockRoot = path.join(root, 'mocks');
		const loaderPath = path.join(mockRoot, 'loader.mjs');
		const wranglerMarker = path.join(root, 'wrangler-called');
		const canonicalSha256 = 'a'.repeat(64);
		const fileSha256 = 'b'.repeat(64);
		const releaseSha256 = canonicalSha256;
		const specs = [];
		const objects = [];
		const records = [];
		for (let index = 1; index <= 239; index += 1) {
			const id = `challenge-${String(index).padStart(3, '0')}-opening`;
			const darkPath = `tmp/science-challenges/science-179-v1/art-assets/${id}-dark-v1.webp`;
			const lightPath = `tmp/science-challenges/science-179-v1/art-assets/${id}-light-v1.webp`;
			specs.push({
				id,
				challengeId: `challenge-${String(index).padStart(3, '0')}`,
				subject: 'Physics',
				context: 'opening',
				output: { darkPath, lightPath }
			});
			for (const [theme, localPath] of [
				['dark', darkPath],
				['light', lightPath]
			]) {
				mkdirSync(path.dirname(path.join(root, localPath)), {
					recursive: true
				});
				writeFileSync(path.join(root, localPath), Buffer.from([1]));
				const objectId = `${id}-${theme}`;
				objects.push({
					id: objectId,
					artId: id,
					challengeId: `challenge-${String(index).padStart(3, '0')}`,
					subject: 'Physics',
					context: 'opening',
					theme,
					localPath,
					r2Key: `images/challenges/science-179-v1/${objectId}.webp`,
					publicPath: `/images/challenges/science-179-v1/${objectId}.webp`,
					sha256: fileSha256,
					size: 1,
					contentType: 'image/webp',
					cacheControl: 'public, max-age=31536000, immutable'
				});
				records.push({ id: objectId, theme, sha256: fileSha256 });
			}
		}
		writeJson(artManifestPath, {
			schemaVersion: 'science-question-art-manifest/v1',
			releaseId: 'science-179-v1',
			cohort: { pairPolicy: 'one-pair-per-challenge' },
			specs
		});
		writeJson(manifestPath, {
			schemaVersion: 'science-question-art-r2-delivery/v1',
			releaseId: 'science-179-v1',
			bucket: 'question-constellation',
			objectCount: objects.length,
			objects
		});
		writeJson(perceptualPath, {
			schemaVersion: 'science-question-art-perceptual-audit/v1',
			releaseId: 'science-179-v1',
			status: 'passed',
			recordCount: records.length,
			records
		});
		const siblings = [
			'art-manifest.json',
			'art-delivery-manifest.json',
			'art-perceptual-audit.json'
		].map((siblingPath) => ({
			path: siblingPath,
			sha256: canonicalSha256,
			fileSha256,
			size: statSync(path.join(releaseRoot, siblingPath)).size
		}));
		writeJson(releasePath, {
			release: {
				id: 'science-179-v1',
				status: 'accepted',
				siblingSetSha256: canonicalSha256,
				siblings
			},
			challenges: Array.from({ length: 179 }, (_, index) => ({
				id: `challenge-${String(index + 1).padStart(3, '0')}`
			}))
		});

		mkdirSync(mockRoot, { recursive: true });
		writeFileSync(
			path.join(mockRoot, 'dependencies.mjs'),
			[
				'import { readFileSync } from "node:fs";',
				'import path from "node:path";',
				`const canonicalSha256 = '${canonicalSha256}';`,
				`const fileSha256 = '${fileSha256}';`,
				'const read = (name) => JSON.parse(readFileSync(path.join(process.env.SCIENCE_ART_UPLOADER_RELEASE_ROOT, name), "utf8"));',
				'export const SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID = "science-179-v1";',
				'export const SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS = Object.freeze({',
				'  accepted: 179, visuals: 239, artPairs: 239, artFiles: 478',
				'});',
				'export const validateScienceChallengeAcceptedReleaseTree = ({ releaseRoot }) => {',
				'  const marker = read("accepted-challenges.json");',
				'  const artManifest = read("art-manifest.json");',
				'  const delivery = read("art-delivery-manifest.json");',
				'  const perceptual = read("art-perceptual-audit.json");',
				'  return {',
				'    status: "passed",',
				'    releaseId: "science-179-v1",',
				'    releaseRoot: path.resolve(releaseRoot),',
				'    marker,',
				'    values: new Map([',
				'      ["art-manifest.json", artManifest],',
				'      ["art-delivery-manifest.json", delivery],',
				'      ["art-perceptual-audit.json", perceptual]',
				'    ]),',
				'    releaseSha256: canonicalSha256,',
				'    siblingSetSha256: canonicalSha256,',
				'    counts: { challenges: 179, visuals: 239, artPairs: 239, artFiles: 478 }',
				'  };',
				'};',
				'export const canonicalHash = () => canonicalSha256;',
				'export const sha256 = () => fileSha256;',
				'export const validateQuestionArtDeliveryManifest = () => ({ status: "passed", issues: [] });',
				'export const validateRelease = () => ({ status: "passed", issues: [] });',
				'export const scienceChallengeProvenanceBindings = () => ({});',
				'export const validateScienceChallengeProvenanceArchive = () => ({ status: "passed", issues: [], manifest: {} });',
				'export const readScienceChallengeReleaseShortRecallUploadEvidence = () => ({ status: "passed", issues: [] });',
				'export const validateScienceChallengeReleaseUploadEvidence = () => ({ status: "passed", issues: [] });',
				'export const buildPerceptualAudit = () => read("art-perceptual-audit.json");',
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
				'  "./lib/science-challenge-accepted-release.mjs",',
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
			releaseRoot,
			manifestPath,
			artManifestPath,
			perceptualPath,
			releasePath,
			mockRoot,
			loaderPath,
			wranglerMarker,
			canonicalSha256,
			fileSha256,
			releaseSha256
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function runAcceptedUploader(fixture, ...extraArguments) {
	const hasOption = (name) => extraArguments.some((argument) => argument.startsWith(`--${name}=`));
	return spawnSync(
		process.execPath,
		[
			'--experimental-loader',
			fixture.loaderPath,
			uploaderCli,
			...(hasOption('manifest') ? [] : [`--manifest=${fixture.manifestPath}`]),
			...(hasOption('art-manifest') ? [] : [`--art-manifest=${fixture.artManifestPath}`]),
			...(hasOption('release') ? [] : [`--release=${fixture.releasePath}`]),
			...extraArguments
		],
		{
			cwd: fixture.root,
			encoding: 'utf8',
			env: {
				...process.env,
				CLOUDFLARE_API_TOKEN: '',
				CLOUDFLARE_ACCOUNT_ACCESS_TOKEN: '',
				SCIENCE_ART_UPLOADER_RELEASE_ROOT: fixture.releaseRoot,
				SCIENCE_ART_UPLOADER_MOCK_ROOT: fixture.mockRoot,
				SCIENCE_ART_UPLOADER_WRANGLER_MARKER: fixture.wranglerMarker
			}
		}
	);
}

function uploadObject(localPath, bytes) {
	const hash = createHash('sha256').update(bytes).digest('hex');
	return {
		id: 'challenge-001-opening-dark',
		localPath,
		r2Key: `images/challenges/science-179-v1/challenge-001-opening-dark-${hash.slice(0, 16)}.webp`,
		size: bytes.length,
		sha256: hash,
		contentType: 'image/webp',
		cacheControl: 'public, max-age=31536000, immutable'
	};
}

function optionValue(arguments_, option) {
	const index = arguments_.indexOf(option);
	assert.notEqual(index, -1, `${option} must be present`);
	return arguments_[index + 1];
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}
