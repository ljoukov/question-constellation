import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const RECALL_COMPANION_ARTIFACT_SCHEMA_VERSION = 'recall-companion-artifacts-v1';

const BASE_HASH_BOUND_ARTIFACTS = Object.freeze([
	{ name: 'plan.json', workPath: 'plan.json' },
	{ name: 'source-evidence.json', workPath: 'source-evidence.json' },
	{ name: 'generation-prompt.txt', workPath: 'generation-prompt.txt' },
	{ name: 'generation-model-output.json', workPath: 'generation/last-message.json' },
	{ name: 'candidate-cards.json', workPath: 'candidate-cards.json' },
	{ name: 'full-review-prompt.txt', workPath: 'full-review-prompt.txt' },
	{ name: 'full-review-model-output.json', workPath: 'full-review/last-message.json' },
	{ name: 'full-review.json', workPath: 'full-review.json' },
	{ name: 'cue-review-prompt.txt', workPath: 'cue-review-prompt.txt' },
	{ name: 'cue-review-model-output.json', workPath: 'cue-review/last-message.json' },
	{ name: 'cue-review.json', workPath: 'cue-review.json' }
]);

const REPLACEMENT_HASH_BOUND_ARTIFACTS = Object.freeze([
	{
		name: 'cue-replacement-review-prompt.txt',
		workPath: 'cue-replacement-review-prompt.txt'
	},
	{
		name: 'cue-replacement-review-model-output.json',
		workPath: 'cue-replacement-review/last-message.json'
	},
	{ name: 'cue-replacement-review.json', workPath: 'cue-replacement-review.json' },
	{ name: 'final-cue-review.json', workPath: 'final-cue-review.json' }
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/** @param {boolean} replacementReviewRun */
export function recallRequiredDurableCompanionNames(replacementReviewRun) {
	return [
		'plan.json',
		'source-evidence.json',
		'generation-prompt.txt',
		'generation-model-output.json',
		'generation-codex-run-summary.json',
		'candidate-cards.json',
		'full-review-prompt.txt',
		'full-review-model-output.json',
		'full-review-codex-run-summary.json',
		'full-review.json',
		'cue-review-prompt.txt',
		'cue-review-model-output.json',
		'cue-review-codex-run-summary.json',
		'cue-review.json',
		...(replacementReviewRun
			? [
					'cue-replacement-review-prompt.txt',
					'cue-replacement-review-model-output.json',
					'cue-replacement-codex-run-summary.json',
					'cue-replacement-review.json',
					'final-cue-review.json'
				]
			: []),
		'rejected-cards.json',
		'recall-generation-run.json'
	];
}

/**
 * Return the exact durable filenames whose bytes are part of an accepted
 * bundle's audit identity. Codex summaries remain required by the importer,
 * but prompts, raw structured outputs and normalized review records are the
 * evidence-bearing companions that must be cryptographically bound.
 *
 * @param {boolean} replacementReviewRun
 */
export function recallHashBoundCompanionEntries(replacementReviewRun) {
	return [
		...BASE_HASH_BOUND_ARTIFACTS,
		...(replacementReviewRun ? REPLACEMENT_HASH_BOUND_ARTIFACTS : [])
	];
}

/**
 * Build the companion identity before accepted-cards.json is written. Each
 * work path maps to the byte-identical durable filename copied by the
 * generator.
 *
 * @param {string} workDir
 * @param {{replacementReviewRun:boolean}} options
 */
export function buildRecallCompanionArtifacts(workDir, { replacementReviewRun }) {
	/** @type {Record<string, string>} */
	const sha256ByFile = {};
	for (const entry of recallHashBoundCompanionEntries(replacementReviewRun)) {
		const filePath = path.join(workDir, entry.workPath);
		if (!existsSync(filePath)) {
			throw new Error(`Recall companion artifact is missing: ${entry.workPath}`);
		}
		sha256ByFile[entry.name] = sha256(readFileSync(filePath));
	}
	return {
		schemaVersion: RECALL_COMPANION_ARTIFACT_SCHEMA_VERSION,
		sha256ByFile
	};
}

/**
 * Bind an already-completed durable run without replaying any model stage.
 * This is intentionally the same byte contract as the generator-side builder,
 * but reads the copied durable filenames rather than scratch work paths.
 *
 * @param {string} artifactDir
 * @param {{replacementReviewRun:boolean}} options
 */
export function buildRecallCompanionArtifactsFromDurableDirectory(
	artifactDir,
	{ replacementReviewRun }
) {
	/** @type {Record<string, string>} */
	const sha256ByFile = {};
	for (const entry of recallHashBoundCompanionEntries(replacementReviewRun)) {
		const filePath = path.join(artifactDir, entry.name);
		if (!existsSync(filePath)) {
			throw new Error(`Durable recall run is incomplete; missing: ${entry.name}`);
		}
		sha256ByFile[entry.name] = sha256(readFileSync(filePath));
	}
	return {
		schemaVersion: RECALL_COMPANION_ARTIFACT_SCHEMA_VERSION,
		sha256ByFile
	};
}

/**
 * Deterministically validate an in-bundle companion identity. The exact key
 * set matters: a replacement-cue run cannot omit the replacement reviewer,
 * and a non-replacement run cannot smuggle unrelated files into its identity.
 *
 * @param {unknown} input
 * @param {{replacementReviewRun:boolean, required?:boolean}} options
 * @returns {string[]}
 */
export function recallCompanionArtifactIssues(input, { replacementReviewRun, required = true }) {
	if (input === undefined || input === null) {
		return required ? ['companionArtifacts is required'] : [];
	}
	if (!isRecord(input)) return ['companionArtifacts must be an object'];
	const issues = [];
	if (input.schemaVersion !== RECALL_COMPANION_ARTIFACT_SCHEMA_VERSION) {
		issues.push(
			`companionArtifacts.schemaVersion must be ${RECALL_COMPANION_ARTIFACT_SCHEMA_VERSION}`
		);
	}
	if (!isRecord(input.sha256ByFile)) {
		issues.push('companionArtifacts.sha256ByFile must be an object');
		return issues;
	}
	const expectedNames = recallHashBoundCompanionEntries(replacementReviewRun).map(
		(entry) => entry.name
	);
	const expected = new Set(expectedNames);
	const actualNames = Object.keys(input.sha256ByFile);
	for (const name of expectedNames) {
		if (!Object.hasOwn(input.sha256ByFile, name)) {
			issues.push(`companionArtifacts.sha256ByFile is missing ${name}`);
		}
	}
	for (const name of actualNames) {
		if (!expected.has(name)) {
			issues.push(`companionArtifacts.sha256ByFile contains unexpected ${name}`);
		}
		if (!SHA256_PATTERN.test(input.sha256ByFile[name] ?? '')) {
			issues.push(`companionArtifacts.sha256ByFile.${name} must be a SHA-256 hash`);
		}
	}
	return issues;
}

/**
 * Verify that every hash-bound durable companion still has the exact bytes
 * accepted into the bundle.
 *
 * @param {string} artifactDir
 * @param {unknown} companionArtifacts
 * @param {{replacementReviewRun:boolean}} options
 */
export function verifyRecallCompanionArtifactFiles(
	artifactDir,
	companionArtifacts,
	{ replacementReviewRun }
) {
	const missing = recallRequiredDurableCompanionNames(replacementReviewRun).filter(
		(name) => !existsSync(path.join(artifactDir, name))
	);
	if (missing.length) {
		throw new Error(`Durable recall run is incomplete; missing: ${missing.join(', ')}`);
	}
	const issues = recallCompanionArtifactIssues(companionArtifacts, {
		replacementReviewRun,
		required: true
	});
	if (issues.length) {
		throw new Error(`Recall companion identity is invalid: ${issues.join('; ')}`);
	}
	const acceptedCompanions = /** @type {{sha256ByFile:Record<string,string>}} */ (
		companionArtifacts
	);
	for (const entry of recallHashBoundCompanionEntries(replacementReviewRun)) {
		const filePath = path.join(artifactDir, entry.name);
		const actualHash = sha256(readFileSync(filePath));
		if (actualHash !== acceptedCompanions.sha256ByFile[entry.name]) {
			throw new Error(`Durable recall companion hash differs: ${entry.name}`);
		}
	}
}

/** @param {string|Buffer} value */
function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
