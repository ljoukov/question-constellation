import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalHash, sha256 } from './science-challenge-release.mjs';

export const SCIENCE_QUESTION_ART_PERCEPTUAL_AUDIT_SCHEMA =
	'science-question-art-perceptual-audit/v2';
export const SCIENCE_QUESTION_ART_DHASH_ALGORITHM = 'dhash-gray-9x8-full-mirror-center-crops-v2';
export const SCIENCE_QUESTION_ART_DHASH_THRESHOLD = 4;
export const SCIENCE_QUESTION_ART_DHASH_VARIANTS = Object.freeze([
	'full',
	'mirror',
	'center90',
	'center90Mirror',
	'center80',
	'center80Mirror'
]);

export function dHashFromGrayPixels(pixels) {
	if (!(pixels instanceof Uint8Array) || pixels.length !== 72) {
		throw new Error('dHash requires exactly 72 grayscale pixels in a 9x8 grid.');
	}
	let hash = 0n;
	for (let row = 0; row < 8; row += 1) {
		for (let column = 0; column < 8; column += 1) {
			hash <<= 1n;
			if (pixels[row * 9 + column] > pixels[row * 9 + column + 1]) hash |= 1n;
		}
	}
	return hash.toString(16).padStart(16, '0');
}

export function hammingDistanceHex(left, right) {
	if (!/^[a-f0-9]{16}$/.test(left) || !/^[a-f0-9]{16}$/.test(right)) {
		throw new Error('dHash values must be 16 lowercase hexadecimal characters.');
	}
	let difference = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
	let distance = 0;
	while (difference) {
		difference &= difference - 1n;
		distance += 1;
	}
	return distance;
}

export function findPerceptualCollisions(
	records,
	threshold = SCIENCE_QUESTION_ART_DHASH_THRESHOLD
) {
	if (!Number.isInteger(threshold) || threshold < 0 || threshold > 64) {
		throw new Error('Perceptual collision threshold must be an integer from 0 to 64.');
	}
	const collisions = [];
	for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
		for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
			const left = records[leftIndex];
			const right = records[rightIndex];
			if (left.artId === right.artId) continue;
			const closest = closestFingerprintDistance(left, right);
			if (closest.distance <= threshold) {
				collisions.push({
					leftId: left.artId,
					leftTheme: left.theme,
					rightId: right.artId,
					rightTheme: right.theme,
					distance: closest.distance,
					leftVariant: closest.leftVariant,
					rightVariant: closest.rightVariant
				});
			}
		}
	}
	return collisions;
}

function closestFingerprintDistance(left, right) {
	const leftHashes = fingerprintEntries(left);
	const rightHashes = fingerprintEntries(right);
	let closest = { distance: 65, leftVariant: null, rightVariant: null };
	for (const [leftVariant, leftHash] of leftHashes) {
		for (const [rightVariant, rightHash] of rightHashes) {
			const distance = hammingDistanceHex(leftHash, rightHash);
			if (distance < closest.distance) {
				closest = { distance, leftVariant, rightVariant };
			}
		}
	}
	return closest;
}

function fingerprintEntries(record) {
	if (record?.dHashes && typeof record.dHashes === 'object') {
		return SCIENCE_QUESTION_ART_DHASH_VARIANTS.map((variant) => [variant, record.dHashes[variant]]);
	}
	return [['full', record?.dHash]];
}

export function buildPerceptualAudit(
	manifest,
	{
		rootDir = process.cwd(),
		threshold = SCIENCE_QUESTION_ART_DHASH_THRESHOLD,
		batchSize = 100
	} = {}
) {
	const inputs = manifest.specs.flatMap((spec) =>
		['dark', 'light'].map((theme) => ({
			id: `${spec.id}-${theme}`,
			artId: spec.id,
			theme,
			localPath: spec.output[`${theme}Path`]
		}))
	);
	const records = [];
	for (let offset = 0; offset < inputs.length; offset += batchSize) {
		const batch = inputs.slice(offset, offset + batchSize);
		const command = [];
		for (const input of batch) {
			const filePath = path.resolve(rootDir, input.localPath);
			if (!existsSync(filePath))
				throw new Error(`Perceptual audit image is missing: ${input.localPath}`);
			for (const variant of SCIENCE_QUESTION_ART_DHASH_VARIANTS) {
				command.push('(', filePath, '-auto-orient', ...variantTransform(variant));
				command.push('-colorspace', 'Gray', '-resize', '9x8!', '-depth', '8', ')');
			}
		}
		command.push('gray:-');
		const pixels = execFileSync('magick', command, {
			cwd: rootDir,
			encoding: null,
			maxBuffer: batch.length * SCIENCE_QUESTION_ART_DHASH_VARIANTS.length * 72 + 1024
		});
		const expectedPixelCount = batch.length * SCIENCE_QUESTION_ART_DHASH_VARIANTS.length * 72;
		if (pixels.length !== expectedPixelCount) {
			throw new Error(
				`ImageMagick returned ${pixels.length} grayscale bytes; expected ${expectedPixelCount}.`
			);
		}
		for (const [index, input] of batch.entries()) {
			const bytes = readFileSync(path.resolve(rootDir, input.localPath));
			const dHashes = Object.fromEntries(
				SCIENCE_QUESTION_ART_DHASH_VARIANTS.map((variant, variantIndex) => {
					const fingerprintIndex =
						index * SCIENCE_QUESTION_ART_DHASH_VARIANTS.length + variantIndex;
					const start = fingerprintIndex * 72;
					return [variant, dHashFromGrayPixels(pixels.subarray(start, start + 72))];
				})
			);
			records.push({
				...input,
				sha256: sha256(bytes),
				dHashes
			});
		}
	}
	const collisions = findPerceptualCollisions(records, threshold);
	const assetInventory = manifest.specs.map((spec) => ({
		id: spec.id,
		darkSha256: records.find((record) => record.id === `${spec.id}-dark`)?.sha256,
		lightSha256: records.find((record) => record.id === `${spec.id}-light`)?.sha256
	}));
	return {
		schemaVersion: SCIENCE_QUESTION_ART_PERCEPTUAL_AUDIT_SCHEMA,
		manifestSha256: canonicalHash(manifest),
		assetInventorySha256: canonicalHash(assetInventory),
		algorithm: SCIENCE_QUESTION_ART_DHASH_ALGORITHM,
		threshold,
		recordCount: records.length,
		collisionCount: collisions.length,
		status: collisions.length ? 'failed' : 'passed',
		records,
		collisions
	};
}

function variantTransform(variant) {
	const transforms = {
		full: [],
		mirror: ['-flop'],
		center90: ['-gravity', 'center', '-crop', '90%x90%+0+0', '+repage'],
		center90Mirror: ['-gravity', 'center', '-crop', '90%x90%+0+0', '+repage', '-flop'],
		center80: ['-gravity', 'center', '-crop', '80%x80%+0+0', '+repage'],
		center80Mirror: ['-gravity', 'center', '-crop', '80%x80%+0+0', '+repage', '-flop']
	};
	if (!(variant in transforms)) throw new Error(`Unknown perceptual hash variant ${variant}.`);
	return transforms[variant];
}

export function validatePerceptualAudit(
	audit,
	{
		manifest,
		assetInventory,
		assetInventorySha256,
		expectedRecordCount = 2_000,
		requireNoCollisions = true
	} = {}
) {
	const issues = [];
	if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
		return { status: 'failed', issues: ['Perceptual audit must be an object.'] };
	}
	if (audit.schemaVersion !== SCIENCE_QUESTION_ART_PERCEPTUAL_AUDIT_SCHEMA) {
		issues.push(`schemaVersion must be ${SCIENCE_QUESTION_ART_PERCEPTUAL_AUDIT_SCHEMA}.`);
	}
	if (audit.algorithm !== SCIENCE_QUESTION_ART_DHASH_ALGORITHM) {
		issues.push(`algorithm must be ${SCIENCE_QUESTION_ART_DHASH_ALGORITHM}.`);
	}
	if (audit.threshold !== SCIENCE_QUESTION_ART_DHASH_THRESHOLD) {
		issues.push(`threshold must be ${SCIENCE_QUESTION_ART_DHASH_THRESHOLD}.`);
	}
	if (manifest && audit.manifestSha256 !== canonicalHash(manifest)) {
		issues.push('manifestSha256 differs from the current art manifest.');
	}
	const expectedInventorySha256 = assetInventory
		? canonicalHash(assetInventory)
		: assetInventorySha256;
	if (expectedInventorySha256 && audit.assetInventorySha256 !== expectedInventorySha256) {
		issues.push('assetInventorySha256 differs from the reviewed images.');
	}
	if (!Array.isArray(audit.records) || audit.records.length !== expectedRecordCount) {
		issues.push(`records must contain exactly ${expectedRecordCount} image hashes.`);
	} else {
		if (audit.recordCount !== audit.records.length) {
			issues.push('recordCount must match records.length.');
		}
		const ids = new Set();
		const recordsById = new Map();
		for (const record of audit.records) {
			if (!/^[a-f0-9]{64}$/.test(String(record.sha256 ?? ''))) {
				issues.push(`${record.id} has an invalid SHA-256 hash.`);
			}
			const dHashes = record.dHashes;
			if (
				!dHashes ||
				typeof dHashes !== 'object' ||
				Array.isArray(dHashes) ||
				Object.keys(dHashes).length !== SCIENCE_QUESTION_ART_DHASH_VARIANTS.length ||
				SCIENCE_QUESTION_ART_DHASH_VARIANTS.some(
					(variant) => !/^[a-f0-9]{16}$/.test(String(dHashes[variant] ?? ''))
				)
			) {
				issues.push(`${record.id} has an invalid multi-transform dHash set.`);
			}
			if (!['dark', 'light'].includes(record.theme))
				issues.push(`${record.id} has an invalid theme.`);
			if (ids.has(record.id)) issues.push(`Perceptual audit duplicates ${record.id}.`);
			ids.add(record.id);
			recordsById.set(record.id, record);
		}
		if (manifest) {
			const inventoryById = new Map(assetInventory?.map((item) => [item.id, item]) ?? []);
			for (const spec of manifest.specs ?? []) {
				const inventory = inventoryById.get(spec.id);
				for (const theme of ['dark', 'light']) {
					const id = `${spec.id}-${theme}`;
					const record = recordsById.get(id);
					if (!record) {
						issues.push(`Perceptual audit is missing ${id}.`);
						continue;
					}
					if (
						record.artId !== spec.id ||
						record.theme !== theme ||
						record.localPath !== spec.output?.[`${theme}Path`]
					) {
						issues.push(`${id} metadata differs from the art manifest.`);
					}
					const expectedSha256 = inventory?.[`${theme}Sha256`];
					if (expectedSha256 && record.sha256 !== expectedSha256) {
						issues.push(`${id} differs from the reviewed image bytes.`);
					}
				}
			}
		}
	}
	let recomputed = [];
	try {
		recomputed = Array.isArray(audit.records)
			? findPerceptualCollisions(audit.records, SCIENCE_QUESTION_ART_DHASH_THRESHOLD)
			: [];
	} catch (error) {
		issues.push(
			`Perceptual collision records are invalid: ${error instanceof Error ? error.message : String(error)}`
		);
	}
	if (
		!Array.isArray(audit.collisions) ||
		canonicalHash(audit.collisions) !== canonicalHash(recomputed)
	) {
		issues.push('collisions do not match the recorded dHashes.');
	}
	if (audit.collisionCount !== recomputed.length) {
		issues.push('collisionCount must match the recomputed collisions.');
	}
	const expectedStatus = recomputed.length ? 'failed' : 'passed';
	if (audit.status !== expectedStatus) {
		issues.push(`status must be ${expectedStatus} for the recorded collisions.`);
	}
	if (requireNoCollisions && recomputed.length !== 0) {
		issues.push('Perceptual duplicate gate did not pass with zero collisions.');
	}
	return { status: issues.length ? 'failed' : 'passed', issues };
}
