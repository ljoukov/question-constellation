import assert from 'node:assert/strict';
import test from 'node:test';

import {
	SCIENCE_QUESTION_ART_DHASH_ALGORITHM,
	SCIENCE_QUESTION_ART_DHASH_THRESHOLD,
	SCIENCE_QUESTION_ART_DHASH_VARIANTS,
	SCIENCE_QUESTION_ART_PERCEPTUAL_AUDIT_SCHEMA,
	dHashFromGrayPixels,
	findPerceptualCollisions,
	hammingDistanceHex,
	validatePerceptualAudit
} from './science-question-art-perceptual.mjs';
import { canonicalHash } from './science-challenge-release.mjs';

test('builds a deterministic 64-bit dHash from a 9x8 grayscale grid', () => {
	const descendingRows = Uint8Array.from(
		Array.from({ length: 8 }, () => [255, 224, 192, 160, 128, 96, 64, 32, 0]).flat()
	);
	const ascendingRows = Uint8Array.from(
		Array.from({ length: 8 }, () => [0, 32, 64, 96, 128, 160, 192, 224, 255]).flat()
	);
	assert.equal(dHashFromGrayPixels(descendingRows), 'ffffffffffffffff');
	assert.equal(dHashFromGrayPixels(ascendingRows), '0000000000000000');
});

test('computes exact Hamming distance and rejects malformed hashes', () => {
	assert.equal(hammingDistanceHex('0000000000000000', '000000000000000f'), 4);
	assert.equal(hammingDistanceHex('ffffffffffffffff', '0000000000000000'), 64);
	assert.throws(() => hammingDistanceHex('xyz', '0000000000000000'), /16 lowercase/);
});

test('reports near-duplicates across themes while excluding each intended light/dark sibling pair', () => {
	const records = [
		{ artId: 'one', theme: 'dark', dHashes: fingerprints('0000000000000000') },
		{ artId: 'two', theme: 'dark', dHashes: fingerprints('0000000000000003') },
		{ artId: 'one', theme: 'light', dHashes: fingerprints('0000000000000000') },
		{ artId: 'three', theme: 'light', dHashes: fingerprints('0000000000000001') },
		{ artId: 'four', theme: 'dark', dHashes: fingerprints('ffffffffffffffff') }
	];
	assert.deepEqual(findPerceptualCollisions(records, 2), [
		{
			leftId: 'one',
			leftTheme: 'dark',
			rightId: 'two',
			rightTheme: 'dark',
			distance: 2,
			leftVariant: 'full',
			rightVariant: 'full'
		},
		{
			leftId: 'one',
			leftTheme: 'dark',
			rightId: 'three',
			rightTheme: 'light',
			distance: 1,
			leftVariant: 'full',
			rightVariant: 'full'
		},
		{
			leftId: 'two',
			leftTheme: 'dark',
			rightId: 'one',
			rightTheme: 'light',
			distance: 2,
			leftVariant: 'full',
			rightVariant: 'full'
		},
		{
			leftId: 'two',
			leftTheme: 'dark',
			rightId: 'three',
			rightTheme: 'light',
			distance: 1,
			leftVariant: 'full',
			rightVariant: 'full'
		},
		{
			leftId: 'one',
			leftTheme: 'light',
			rightId: 'three',
			rightTheme: 'light',
			distance: 1,
			leftVariant: 'full',
			rightVariant: 'full'
		}
	]);
});

test('multi-transform fingerprints catch horizontally mirrored compositions', () => {
	const rows = Array.from({ length: 8 }, (_, row) =>
		Array.from(
			{ length: 9 },
			(_, column) => (row * 53 + column * 97 + column * column * 11 + row * column * 17) % 256
		)
	);
	const original = dHashFromGrayPixels(Uint8Array.from(rows.flat()));
	const mirrored = dHashFromGrayPixels(
		Uint8Array.from(rows.map((row) => [...row].reverse()).flat())
	);
	assert.ok(hammingDistanceHex(original, mirrored) > SCIENCE_QUESTION_ART_DHASH_THRESHOLD);
	const collisions = findPerceptualCollisions(
		[
			{ artId: 'original', theme: 'dark', dHashes: fingerprints(original, mirrored) },
			{ artId: 'mirrored', theme: 'dark', dHashes: fingerprints(mirrored, original) }
		],
		SCIENCE_QUESTION_ART_DHASH_THRESHOLD
	);
	assert.equal(collisions.length, 1);
	assert.equal(collisions[0].distance, 0);
});

test('release audit validation binds every perceptual record to manifest paths and image bytes', () => {
	const manifest = {
		specs: [
			{ id: 'one', output: { darkPath: 'one-dark.webp', lightPath: 'one-light.webp' } },
			{ id: 'two', output: { darkPath: 'two-dark.webp', lightPath: 'two-light.webp' } }
		]
	};
	const assetInventory = [
		{ id: 'one', darkSha256: '1'.repeat(64), lightSha256: '2'.repeat(64) },
		{ id: 'two', darkSha256: '3'.repeat(64), lightSha256: '4'.repeat(64) }
	];
	const records = [
		{
			id: 'one-dark',
			artId: 'one',
			theme: 'dark',
			localPath: 'one-dark.webp',
			sha256: '1'.repeat(64),
			dHashes: fingerprints('0000000000000000')
		},
		{
			id: 'one-light',
			artId: 'one',
			theme: 'light',
			localPath: 'one-light.webp',
			sha256: '2'.repeat(64),
			dHashes: fingerprints('0000000000000000')
		},
		{
			id: 'two-dark',
			artId: 'two',
			theme: 'dark',
			localPath: 'two-dark.webp',
			sha256: '3'.repeat(64),
			dHashes: fingerprints('ffffffffffffffff')
		},
		{
			id: 'two-light',
			artId: 'two',
			theme: 'light',
			localPath: 'two-light.webp',
			sha256: '4'.repeat(64),
			dHashes: fingerprints('ffffffffffffffff')
		}
	];
	const audit = {
		schemaVersion: SCIENCE_QUESTION_ART_PERCEPTUAL_AUDIT_SCHEMA,
		manifestSha256: canonicalHash(manifest),
		assetInventorySha256: canonicalHash(assetInventory),
		algorithm: SCIENCE_QUESTION_ART_DHASH_ALGORITHM,
		threshold: SCIENCE_QUESTION_ART_DHASH_THRESHOLD,
		recordCount: records.length,
		collisionCount: 0,
		status: 'passed',
		records,
		collisions: []
	};
	assert.deepEqual(
		validatePerceptualAudit(audit, {
			manifest,
			assetInventory,
			expectedRecordCount: 4
		}),
		{ status: 'passed', issues: [] }
	);

	const stale = structuredClone(audit);
	stale.records[0].localPath = 'wrong.webp';
	assert.match(
		validatePerceptualAudit(stale, {
			manifest,
			assetInventory,
			expectedRecordCount: 4
		}).issues.join('\n'),
		/metadata differs/
	);

	const duplicateEvidence = structuredClone(audit);
	duplicateEvidence.records.find((record) => record.id === 'two-dark').dHashes =
		fingerprints('0000000000000003');
	duplicateEvidence.collisions = [
		{
			leftId: 'one',
			leftTheme: 'dark',
			rightId: 'two',
			rightTheme: 'dark',
			distance: 2,
			leftVariant: 'full',
			rightVariant: 'full'
		},
		{
			leftId: 'one',
			leftTheme: 'light',
			rightId: 'two',
			rightTheme: 'dark',
			distance: 2,
			leftVariant: 'full',
			rightVariant: 'full'
		}
	];
	duplicateEvidence.collisionCount = 2;
	duplicateEvidence.status = 'failed';
	assert.equal(
		validatePerceptualAudit(duplicateEvidence, {
			manifest,
			assetInventory,
			expectedRecordCount: 4,
			requireNoCollisions: false
		}).status,
		'passed'
	);
	assert.match(
		validatePerceptualAudit(duplicateEvidence, {
			manifest,
			assetInventory,
			expectedRecordCount: 4
		}).issues.join('\n'),
		/zero collisions/
	);
});

function fingerprints(full, mirror = full) {
	return Object.fromEntries(
		SCIENCE_QUESTION_ART_DHASH_VARIANTS.map((variant) => [
			variant,
			variant.toLowerCase().includes('mirror') ? mirror : full
		])
	);
}
