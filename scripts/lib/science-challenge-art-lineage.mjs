import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
	SCIENCE_QUESTION_ART_REVIEW_SCHEMA,
	canonicalHash,
	sha256
} from './science-challenge-release.mjs';
import {
	SCIENCE_QUESTION_ART_PERCEPTUAL_AUDIT_SCHEMA,
	validatePerceptualAudit
} from './science-question-art-perceptual.mjs';

const IMAGE_MODEL = 'chatgpt-gpt-image-2';
const MASTER_WIDTH = 1672;
const MASTER_HEIGHT = 941;
const ART_REVIEW_SCHEMA = SCIENCE_QUESTION_ART_REVIEW_SCHEMA;
const PERCEPTUAL_REPAIR_INSTRUCTION =
	'Use a materially different camera angle, object arrangement, silhouette, scale hierarchy and negative-space pattern while preserving the exact question-specific science and all accuracy constraints.';

export function requireArtGenerationJobEvidence({
	job,
	jobPath,
	spec,
	manifest = null,
	currentOutputs,
	rootDir,
	repairEvidence = null
}) {
	const absoluteJobPath = path.resolve(rootDir, jobPath);
	const specDir = path.dirname(absoluteJobPath);
	if (!inside(absoluteJobPath, rootDir) || !existsSync(absoluteJobPath)) {
		throw new Error(`Art generation job is missing or outside the workspace: ${jobPath}`);
	}
	if (
		job?.schemaVersion !== 'science-question-art-job/v1' ||
		job.id !== spec.id ||
		job.status !== 'passed' ||
		job.imageModel !== IMAGE_MODEL ||
		job.specSha256 !== canonicalHash(spec) ||
		canonicalHash(job.outputs) !== canonicalHash(currentOutputs) ||
		job.checks?.pair?.status !== 'passed' ||
		job.checks?.pair?.darkSha256 !== currentOutputs.dark.sha256 ||
		job.checks?.pair?.lightSha256 !== currentOutputs.light.sha256
	) {
		throw new Error(`Art generation job does not bind ${spec.id} and its current outputs.`);
	}

	const repairMatch = path.basename(absoluteJobPath).match(/^repair-([a-f0-9]{12})-job\.json$/);
	const reviewRepairHash = job.repairReviewSha256;
	const perceptualRepairHash = job.repairPerceptualAuditSha256;
	const validReviewRepair = sha256String(reviewRepairHash) && perceptualRepairHash === null;
	const validPerceptualRepair = reviewRepairHash === null && sha256String(perceptualRepairHash);
	const repairKinds = validReviewRepair
		? [['review', reviewRepairHash]]
		: validPerceptualRepair
			? [['perceptual', perceptualRepairHash]]
			: [];
	if (repairMatch) {
		if (
			!(validReviewRepair || validPerceptualRepair) ||
			repairKinds.length !== 1 ||
			!repairKinds[0][1].startsWith(repairMatch[1])
		) {
			throw new Error(`Art repair job ${path.basename(absoluteJobPath)} has invalid identity.`);
		}
		if (!repairEvidence || canonicalHash(repairEvidence) !== repairKinds[0][1]) {
			throw new Error(
				`Art repair job ${path.basename(absoluteJobPath)} lacks exact repair evidence.`
			);
		}
		validateRepairSemantics(job, spec.id, repairKinds[0][0], repairEvidence, manifest);
	} else if (
		reviewRepairHash !== null ||
		perceptualRepairHash !== null ||
		repairEvidence !== null
	) {
		throw new Error(`Ordinary art job ${path.basename(absoluteJobPath)} claims repair evidence.`);
	}

	if (!Number.isInteger(job.attempt) || job.attempt < 1 || job.attempt > 4) {
		throw new Error(`Art job ${path.basename(absoluteJobPath)} has an invalid attempt number.`);
	}
	const attemptDirectory = repairMatch
		? `repair-${repairMatch[1]}-attempt-${String(job.attempt).padStart(2, '0')}`
		: `attempt-${String(job.attempt).padStart(2, '0')}`;
	const attemptRoot = path.join(specDir, attemptDirectory);
	const expectedPaths = {
		spec: path.join(specDir, 'spec.json'),
		darkPrompt: path.join(attemptRoot, 'dark-prompt.txt'),
		lightPrompt: path.join(attemptRoot, 'light-prompt.txt'),
		darkMaster: path.join(attemptRoot, 'dark-master.webp'),
		lightMaster: path.join(attemptRoot, 'light-master.webp'),
		darkNormalized: path.join(attemptRoot, 'dark.webp'),
		lightNormalized: path.join(attemptRoot, 'light.webp')
	};
	const artifacts = {};
	for (const [key, expectedPath] of Object.entries(expectedPaths)) {
		const record = job.artifacts?.[key];
		const actualPath = path.resolve(rootDir, String(record?.path ?? ''));
		if (actualPath !== expectedPath || !inside(actualPath, specDir) || !existsSync(actualPath)) {
			throw new Error(
				`Art job ${path.basename(absoluteJobPath)} is missing bound ${key} evidence.`
			);
		}
		const bytes = readFileSync(actualPath);
		if (
			!sha256String(record.sha256) ||
			record.sha256 !== sha256(bytes) ||
			record.size !== bytes.byteLength
		) {
			throw new Error(`Art job ${path.basename(absoluteJobPath)} ${key} evidence hash differs.`);
		}
		artifacts[key] = {
			path: path.relative(rootDir, actualPath),
			sha256: record.sha256,
			size: record.size
		};
	}
	const storedSpec = JSON.parse(readFileSync(expectedPaths.spec, 'utf8'));
	if (canonicalHash(storedSpec) !== canonicalHash(spec)) {
		throw new Error(`Art job ${path.basename(absoluteJobPath)} spec differs from the manifest.`);
	}
	for (const promptPath of [expectedPaths.darkPrompt, expectedPaths.lightPrompt]) {
		if (!readFileSync(promptPath, 'utf8').trim()) {
			throw new Error(`Art job ${path.basename(absoluteJobPath)} contains an empty image prompt.`);
		}
	}
	if (
		job.checks?.darkMaster?.status !== 'passed' ||
		job.checks?.darkMaster?.width !== MASTER_WIDTH ||
		job.checks?.darkMaster?.height !== MASTER_HEIGHT ||
		job.checks?.darkMaster?.sha256 !== artifacts.darkMaster.sha256 ||
		job.checks?.lightMaster?.status !== 'passed' ||
		job.checks?.lightMaster?.width !== MASTER_WIDTH ||
		job.checks?.lightMaster?.height !== MASTER_HEIGHT ||
		job.checks?.lightMaster?.sha256 !== artifacts.lightMaster.sha256 ||
		job.checks?.pair?.width !== 960 ||
		job.checks?.pair?.height !== 540 ||
		artifacts.darkNormalized.sha256 !== currentOutputs.dark.sha256 ||
		artifacts.lightNormalized.sha256 !== currentOutputs.light.sha256
	) {
		throw new Error(
			`Art job ${path.basename(absoluteJobPath)} checks do not bind generated bytes.`
		);
	}
	return artifacts;
}

function validateRepairSemantics(job, id, kind, evidence, manifest) {
	if (kind === 'review') {
		const review = Array.isArray(evidence.reviews)
			? evidence.reviews.find((candidate) => candidate.id === id)
			: null;
		const instructions =
			review?.issues
				?.filter((issue) => issue.severity === 'major')
				.map((issue) => issue.regenerationInstruction) ?? [];
		if (
			evidence.schemaVersion !== ART_REVIEW_SCHEMA ||
			evidence.status !== 'failed' ||
			review?.accepted !== false ||
			review?.disposition !== 'fresh-regenerate' ||
			instructions.length === 0 ||
			canonicalHash(instructions) !== canonicalHash(job.repairInstructions)
		) {
			throw new Error(`Art repair review does not reject ${id} with the recorded instructions.`);
		}
		return;
	}
	const recordsById = new Map(
		Array.isArray(evidence.records) ? evidence.records.map((record) => [record.id, record]) : []
	);
	const assetInventory = manifest
		? manifest.specs.map((candidate) => ({
				id: candidate.id,
				darkSha256: recordsById.get(`${candidate.id}-dark`)?.sha256,
				lightSha256: recordsById.get(`${candidate.id}-light`)?.sha256
			}))
		: undefined;
	const auditValidation = validatePerceptualAudit(evidence, {
		manifest,
		assetInventory,
		expectedRecordCount: manifest ? manifest.specs.length * 2 : 2_000,
		requireNoCollisions: false
	});
	const collisions = Array.isArray(evidence.collisions) ? evidence.collisions : [];
	if (
		evidence.schemaVersion !== SCIENCE_QUESTION_ART_PERCEPTUAL_AUDIT_SCHEMA ||
		auditValidation.status !== 'passed' ||
		evidence.status !== 'failed' ||
		!collisions.some((collision) => collision.leftId === id || collision.rightId === id) ||
		canonicalHash(job.repairInstructions) !== canonicalHash([PERCEPTUAL_REPAIR_INSTRUCTION])
	) {
		throw new Error(`Perceptual repair evidence does not identify ${id} with the required repair.`);
	}
}

function inside(filePath, directory) {
	const root = path.resolve(directory);
	return filePath === root || filePath.startsWith(`${root}${path.sep}`);
}

function sha256String(value) {
	return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
