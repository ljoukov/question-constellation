import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
	hashStudyCardArtifact,
	stableStringify,
	validateStudyCardBundle
} from './study-card-artifact.mjs';

export const STUDY_CARD_LINEAGE_SCHEMA_VERSION = 'study-card-model-lineage-v2';
export const STUDY_CARD_LINEAGE_FILE = 'model-lineage-evidence.json';
export const REQUIRED_STUDY_CARD_MODEL = 'gpt-5.6-sol';
export const REQUIRED_STUDY_CARD_THINKING_LEVEL = 'max';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SUMMARY_SUFFIX = '-codex-run-summary.json';

/** @typedef {Record<string, any>} JsonObject */
/** @typedef {{ cardId: string, semanticSha256: string }} SemanticCardRow */
/** @typedef {{ cardId: string, semanticSha256s: string[] }} ReviewedSemanticCardRow */
/** @typedef {{ releaseDir: string, rootDir?: string }} LineageOptions */

export class StudyCardModelLineageError extends Error {
	/** @param {string[]} issues */
	constructor(issues) {
		super(`Study-card model lineage validation failed:\n- ${issues.join('\n- ')}`);
		this.name = 'StudyCardModelLineageError';
		this.issues = issues;
	}
}

/**
 * Build the compact, commit-safe provenance record while raw event streams are
 * still available. Subsequent validation intentionally does not require those
 * ignored JSONL files, but it does require their exact digest and a nonzero
 * sanitized row count.
 *
 * @param {LineageOptions} options
 */
export function materializeStudyCardModelLineage({ releaseDir, rootDir = process.cwd() }) {
	const manifestPath = path.join(releaseDir, STUDY_CARD_LINEAGE_FILE);
	if (existsSync(manifestPath)) {
		const existing = readJson(manifestPath);
		if (existing.schemaVersion === STUDY_CARD_LINEAGE_SCHEMA_VERSION) {
			return validateStudyCardModelLineage({ releaseDir, rootDir });
		}
	}

	const artifactPath = path.join(releaseDir, 'accepted-study-cards.json');
	const generationRunPath = path.join(releaseDir, 'generation-run.json');
	if (!existsSync(artifactPath) || !existsSync(generationRunPath)) {
		throw new StudyCardModelLineageError([
			`${relative(rootDir, releaseDir)} lacks accepted-study-cards.json or generation-run.json`
		]);
	}
	const bundle = validateStudyCardBundle(readJson(artifactPath));
	readJson(generationRunPath);
	const fallbackByRunId = collectFallbackEventEvidence(releaseDir);
	const summaries = readdirSync(releaseDir)
		.filter((name) => name.endsWith(SUMMARY_SUFFIX))
		.sort();
	if (!summaries.length) {
		throw new StudyCardModelLineageError([
			`${bundle.release.id} has no persisted passed run summaries`
		]);
	}

	const runs = summaries.map((summaryName) =>
		materializeRun({ releaseDir, rootDir, summaryName, fallbackByRunId })
	);
	const artifactCardIds = sortedUnique(bundle.cards.map((card) => card.id));
	const artifactCardContent = semanticCardRows(bundle.cards);
	const generatedCardIds = sortedUnique(
		runs.filter((run) => run.role === 'generator').flatMap((run) => run.generatedCardIds)
	);
	const reviewedAcceptedCardIds = sortedUnique(
		runs.filter((run) => run.role === 'reviewer').flatMap((run) => run.reviewedAcceptedCardIds)
	);
	const generatedCardContent = runs
		.filter((run) => run.role === 'generator')
		.flatMap((run) => run.generatedCardContent);
	const reviewedAcceptedCardContent = runs
		.filter((run) => run.role === 'reviewer')
		.flatMap((run) => run.reviewedAcceptedCardContent);
	const missingGeneratedContent = uncoveredSemanticCards(artifactCardContent, generatedCardContent);
	const missingReviewedContent = uncoveredSemanticCards(
		artifactCardContent,
		reviewedAcceptedCardContent.flatMap((row) =>
			row.semanticSha256s.map((semanticSha256) => ({
				cardId: row.cardId,
				semanticSha256
			}))
		)
	);
	if (missingGeneratedContent.length || missingReviewedContent.length) {
		throw new StudyCardModelLineageError([
			...(missingGeneratedContent.length
				? [
						`accepted learner content for ${missingGeneratedContent.join(', ')} is absent from every generator output`
					]
				: []),
			...(missingReviewedContent.length
				? [
						`accepted learner content for ${missingReviewedContent.join(', ')} is absent from every accepting reviewer input`
					]
				: [])
		]);
	}
	const evidence = {
		schemaVersion: STUDY_CARD_LINEAGE_SCHEMA_VERSION,
		status: 'passed',
		releaseId: bundle.release.id,
		requiredModel: REQUIRED_STUDY_CARD_MODEL,
		requiredThinkingLevel: REQUIRED_STUDY_CARD_THINKING_LEVEL,
		artifact: {
			path: relative(rootDir, artifactPath),
			fileSha256: sha256(readFileSync(artifactPath)),
			semanticSha256: hashStudyCardArtifact(bundle),
			acceptedCardCount: artifactCardIds.length,
			acceptedCardIdsSha256: hashStringList(artifactCardIds),
			acceptedCardContent: artifactCardContent,
			acceptedCardContentSha256: hashSemanticCardRows(artifactCardContent),
			sourceManifestHash: bundle.release.sourceManifestHash
		},
		generationRun: {
			path: relative(rootDir, generationRunPath),
			sha256: sha256(readFileSync(generationRunPath))
		},
		runs,
		linkage: {
			contentProjection: 'study-card-learner-content-v1',
			allowedDeterministicBinding:
				'board/qualification/subject/contentRevision, official source metadata, offering targets and normalized choice keys are bound after model review; all learner-visible fields, ordered choice content, source excerpt and component identities hash exactly',
			generatorOutputSha256: hashStringList(
				runs.filter((run) => run.role === 'generator').map((run) => run.modelOutput.sha256)
			),
			reviewerInputSha256: hashStringList(
				runs.filter((run) => run.role === 'reviewer').map((run) => run.prompt.sha256)
			),
			reviewerOutputSha256: hashStringList(
				runs.filter((run) => run.role === 'reviewer').map((run) => run.modelOutput.sha256)
			),
			generatedAcceptedCardIdsSha256: hashStringList(
				artifactCardIds.filter((id) => generatedCardIds.includes(id))
			),
			reviewedAcceptedCardIdsSha256: hashStringList(
				artifactCardIds.filter((id) => reviewedAcceptedCardIds.includes(id))
			),
			generatedAcceptedCardContentSha256: hashSemanticCardRows(artifactCardContent),
			reviewedAcceptedCardContentSha256: hashSemanticCardRows(artifactCardContent),
			acceptedArtifactCardContentSha256: hashSemanticCardRows(artifactCardContent),
			acceptedArtifactSha256: sha256(readFileSync(artifactPath))
		}
	};

	writeFileSync(manifestPath, `${JSON.stringify(evidence, null, 2)}\n`);
	return validateStudyCardModelLineage({ releaseDir, rootDir });
}

/**
 * Validate a previously materialized lineage record without raw JSONL.
 *
 * @param {LineageOptions} options
 */
export function validateStudyCardModelLineage({ releaseDir, rootDir = process.cwd() }) {
	/** @type {string[]} */
	const issues = [];
	const manifestPath = path.join(releaseDir, STUDY_CARD_LINEAGE_FILE);
	if (!existsSync(manifestPath)) {
		throw new StudyCardModelLineageError([
			`${relative(rootDir, releaseDir)} lacks ${STUDY_CARD_LINEAGE_FILE}`
		]);
	}
	const evidence = readJson(manifestPath);
	const artifactPath = path.join(releaseDir, 'accepted-study-cards.json');
	const generationRunPath = path.join(releaseDir, 'generation-run.json');
	let bundle = null;
	let generationRun = null;
	try {
		bundle = validateStudyCardBundle(readJson(artifactPath));
	} catch (error) {
		issues.push(`accepted artifact is invalid: ${message(error)}`);
	}
	try {
		generationRun = readJson(generationRunPath);
	} catch (error) {
		issues.push(`generation-run.json is invalid: ${message(error)}`);
	}
	if (!bundle || !generationRun) throw new StudyCardModelLineageError(issues);

	const artifactCardIds = sortedUnique(bundle.cards.map((card) => card.id));
	const artifactCardContent = semanticCardRows(bundle.cards);
	const artifactFileSha256 = sha256(readFileSync(artifactPath));
	const artifactSemanticSha256 = hashStudyCardArtifact(bundle);
	if (
		evidence.schemaVersion !== STUDY_CARD_LINEAGE_SCHEMA_VERSION ||
		evidence.status !== 'passed' ||
		evidence.releaseId !== bundle.release.id ||
		evidence.requiredModel !== REQUIRED_STUDY_CARD_MODEL ||
		evidence.requiredThinkingLevel !== REQUIRED_STUDY_CARD_THINKING_LEVEL
	) {
		issues.push('lineage header does not match the required release/model contract');
	}
	if (
		evidence.artifact?.path !== relative(rootDir, artifactPath) ||
		evidence.artifact?.fileSha256 !== artifactFileSha256 ||
		evidence.artifact?.semanticSha256 !== artifactSemanticSha256 ||
		evidence.artifact?.acceptedCardCount !== artifactCardIds.length ||
		evidence.artifact?.acceptedCardIdsSha256 !== hashStringList(artifactCardIds) ||
		stableStringify(evidence.artifact?.acceptedCardContent) !==
			stableStringify(artifactCardContent) ||
		evidence.artifact?.acceptedCardContentSha256 !== hashSemanticCardRows(artifactCardContent) ||
		evidence.artifact?.sourceManifestHash !== bundle.release.sourceManifestHash
	) {
		issues.push('accepted artifact identity/hash/semantic-content linkage drifted');
	}
	if (
		evidence.generationRun?.path !== relative(rootDir, generationRunPath) ||
		evidence.generationRun?.sha256 !== sha256(readFileSync(generationRunPath)) ||
		generationRun.artifactPath !== bundle.release.artifactPath ||
		generationRun.artifactHash !== artifactSemanticSha256 ||
		(generationRun.sourceManifestHash != null &&
			generationRun.sourceManifestHash !== bundle.release.sourceManifestHash)
	) {
		issues.push('generation-run.json is not hash-bound to the accepted artifact');
	}

	const declared = declaredRuns(bundle.release);
	/** @type {JsonObject[]} */
	const runs = Array.isArray(evidence.runs) ? evidence.runs : [];
	if (!runs.length) issues.push('lineage must contain at least one run');
	/** @type {Set<string>} */
	const generatorRunIds = new Set();
	/** @type {Set<string>} */
	const reviewerRunIds = new Set();
	/** @type {string[]} */
	const generatedCardIds = [];
	/** @type {string[]} */
	const reviewedAcceptedCardIds = [];
	/** @type {SemanticCardRow[]} */
	const generatedCardContent = [];
	/** @type {ReviewedSemanticCardRow[]} */
	const reviewedAcceptedCardContent = [];
	for (const [index, run] of runs.entries()) {
		validateRun(run, index, { releaseDir, rootDir, issues });
		if (run.role === 'generator') {
			generatorRunIds.add(run.runId);
			generatedCardIds.push(...(run.generatedCardIds ?? []));
			generatedCardContent.push(...(run.generatedCardContent ?? []));
		} else if (run.role === 'reviewer') {
			reviewerRunIds.add(run.runId);
			reviewedAcceptedCardIds.push(...(run.reviewedAcceptedCardIds ?? []));
			reviewedAcceptedCardContent.push(...(run.reviewedAcceptedCardContent ?? []));
		}
	}
	for (const runId of generatorRunIds) {
		if (reviewerRunIds.has(runId))
			issues.push(`${runId} is reused across generator/reviewer roles`);
	}
	for (const row of declared) {
		const actual = row.role === 'generator' ? generatorRunIds : reviewerRunIds;
		if (!actual.has(row.runId)) {
			issues.push(`${row.label} run ${row.runId} lacks exact persisted lineage evidence`);
		}
	}
	if (!artifactCardIds.every((id) => generatedCardIds.includes(id))) {
		issues.push('generator model outputs do not cover every accepted artifact card id');
	}
	if (!artifactCardIds.every((id) => reviewedAcceptedCardIds.includes(id))) {
		issues.push('accepted reviewer model outputs do not cover every accepted artifact card id');
	}
	const missingGeneratedContent = uncoveredSemanticCards(artifactCardContent, generatedCardContent);
	const missingReviewedContent = uncoveredSemanticCards(
		artifactCardContent,
		reviewedAcceptedCardContent.flatMap((row) =>
			(row.semanticSha256s ?? []).map((semanticSha256) => ({
				cardId: row.cardId,
				semanticSha256
			}))
		)
	);
	if (missingGeneratedContent.length) {
		issues.push(
			`accepted learner content for ${missingGeneratedContent.join(', ')} is absent from every generator output`
		);
	}
	if (missingReviewedContent.length) {
		issues.push(
			`accepted learner content for ${missingReviewedContent.join(', ')} is absent from every accepting reviewer input`
		);
	}

	const generatorOutputs = runs
		.filter((run) => run.role === 'generator')
		.map((run) => run.modelOutput?.sha256);
	const reviewerInputs = runs
		.filter((run) => run.role === 'reviewer')
		.map((run) => run.prompt?.sha256);
	const reviewerOutputs = runs
		.filter((run) => run.role === 'reviewer')
		.map((run) => run.modelOutput?.sha256);
	if (
		evidence.linkage?.generatorOutputSha256 !== hashStringList(generatorOutputs) ||
		evidence.linkage?.reviewerInputSha256 !== hashStringList(reviewerInputs) ||
		evidence.linkage?.reviewerOutputSha256 !== hashStringList(reviewerOutputs) ||
		evidence.linkage?.generatedAcceptedCardIdsSha256 !== hashStringList(artifactCardIds) ||
		evidence.linkage?.reviewedAcceptedCardIdsSha256 !== hashStringList(artifactCardIds) ||
		evidence.linkage?.contentProjection !== 'study-card-learner-content-v1' ||
		!nonempty(evidence.linkage?.allowedDeterministicBinding) ||
		evidence.linkage?.generatedAcceptedCardContentSha256 !==
			hashSemanticCardRows(artifactCardContent) ||
		evidence.linkage?.reviewedAcceptedCardContentSha256 !==
			hashSemanticCardRows(artifactCardContent) ||
		evidence.linkage?.acceptedArtifactCardContentSha256 !==
			hashSemanticCardRows(artifactCardContent) ||
		evidence.linkage?.acceptedArtifactSha256 !== artifactFileSha256
	) {
		issues.push('generator output -> reviewer input/output -> accepted artifact linkage drifted');
	}

	throwIfIssues(issues);
	return {
		manifestPath: relative(rootDir, manifestPath),
		manifestSha256: sha256(readFileSync(manifestPath)),
		releaseId: bundle.release.id,
		artifactFileSha256,
		artifactHash: artifactSemanticSha256,
		generatorRunIds: [...generatorRunIds].sort(),
		reviewerRunIds: [...reviewerRunIds].sort(),
		runs: runs.length
	};
}

/**
 * @param {{
 *   releaseDir: string,
 *   rootDir: string,
 *   summaryName: string,
 *   fallbackByRunId: Map<string, JsonObject>
 * }} options
 */
function materializeRun({ releaseDir, rootDir, summaryName, fallbackByRunId }) {
	const stem = summaryName.slice(0, -SUMMARY_SUFFIX.length);
	const summaryPath = path.join(releaseDir, summaryName);
	const promptPath = path.join(releaseDir, `${stem}-prompt.txt`);
	const outputPath = path.join(releaseDir, `${stem}-model-output.json`);
	const summary = readJson(summaryPath);
	if (!existsSync(promptPath) || !existsSync(outputPath)) {
		throw new StudyCardModelLineageError([
			`${summaryName} lacks exact ${stem} prompt or model output`
		]);
	}
	const output = parseModelJson(readFileSync(outputPath, 'utf8'));
	const role = Array.isArray(output?.reviews)
		? 'reviewer'
		: Array.isArray(output?.cards)
			? 'generator'
			: null;
	if (!role) {
		throw new StudyCardModelLineageError([`${stem} model output has neither cards nor reviews`]);
	}
	/** @type {JsonObject[]} */
	const outputCards = Array.isArray(output.cards) ? output.cards : [];
	/** @type {JsonObject[]} */
	const outputReviews = Array.isArray(output.reviews) ? output.reviews : [];
	const promptText = readFileSync(promptPath, 'utf8');
	const generatedCardContent = role === 'generator' ? semanticCardRows(outputCards) : [];
	const reviewedAcceptedCardIds =
		role === 'reviewer'
			? sortedUnique(
					outputReviews
						.filter((review) => review?.accepted === true && !(review.issues?.length > 0))
						.map((review) => review.cardId)
						.filter(Boolean)
				)
			: [];
	const promptCardContent = semanticCardRows(cardsFromPrompt(promptText));
	const reviewedAcceptedCardContent = reviewedAcceptedCardIds.map((cardId) => ({
		cardId,
		semanticSha256s: sortedUnique(
			promptCardContent.filter((row) => row.cardId === cardId).map((row) => row.semanticSha256)
		)
	}));
	const promptMissing = reviewedAcceptedCardContent
		.filter((row) => row.semanticSha256s.length === 0)
		.map((row) => row.cardId);
	if (promptMissing.length) {
		throw new StudyCardModelLineageError([
			`${stem} accepting reviewer input lacks exact card content for ${promptMissing.join(', ')}`
		]);
	}
	const event = eventEvidence({ releaseDir, stem, summary, fallbackByRunId });
	return {
		stage: stem,
		role,
		status: summary.status,
		runId: summary.threadId,
		model: summary.model,
		thinkingLevel: summary.thinkingLevel,
		startedAt: summary.startedAt,
		finishedAt: summary.finishedAt,
		summary: { path: relative(rootDir, summaryPath), sha256: sha256(readFileSync(summaryPath)) },
		eventStream: event,
		prompt: { path: relative(rootDir, promptPath), sha256: sha256(readFileSync(promptPath)) },
		modelOutput: { path: relative(rootDir, outputPath), sha256: sha256(readFileSync(outputPath)) },
		generatedCardIds:
			role === 'generator'
				? sortedUnique(outputCards.map((card) => card?.id).filter(nonempty))
				: [],
		generatedCardContent,
		reviewedAcceptedCardIds,
		reviewedAcceptedCardContent
	};
}

/**
 * @param {JsonObject} run
 * @param {number} index
 * @param {{ releaseDir: string, rootDir: string, issues: string[] }} context
 */
function validateRun(run, index, { releaseDir, rootDir, issues }) {
	const label = `runs[${index}]`;
	if (
		!['generator', 'reviewer'].includes(run?.role) ||
		run.status !== 'passed' ||
		run.model !== REQUIRED_STUDY_CARD_MODEL ||
		run.thinkingLevel !== REQUIRED_STUDY_CARD_THINKING_LEVEL ||
		!nonempty(run.runId) ||
		!validIso(run.startedAt) ||
		!validIso(run.finishedAt) ||
		Date.parse(run.finishedAt) < Date.parse(run.startedAt)
	) {
		issues.push(`${label} is not a passed exact ${REQUIRED_STUDY_CARD_MODEL}/max run`);
	}
	const summaryPath = localPath(rootDir, run.summary?.path);
	const promptPath = localPath(rootDir, run.prompt?.path);
	const outputPath = localPath(rootDir, run.modelOutput?.path);
	if (!exactFile(summaryPath, run.summary?.sha256)) issues.push(`${label} summary SHA-256 drifted`);
	if (!exactFile(promptPath, run.prompt?.sha256)) issues.push(`${label} prompt SHA-256 drifted`);
	if (!exactFile(outputPath, run.modelOutput?.sha256)) {
		issues.push(`${label} model-output SHA-256 drifted`);
	}
	if (summaryPath && existsSync(summaryPath)) {
		const summary = readJson(summaryPath);
		if (
			summary.status !== run.status ||
			summary.threadId !== run.runId ||
			summary.model !== run.model ||
			summary.thinkingLevel !== run.thinkingLevel ||
			summary.startedAt !== run.startedAt ||
			summary.finishedAt !== run.finishedAt
		) {
			issues.push(`${label} does not exactly match its passed summary`);
		}
	}
	if (
		!hexSha256(run.eventStream?.sha256) ||
		!Number.isInteger(run.eventStream?.sanitizedEventCount) ||
		run.eventStream.sanitizedEventCount < 1 ||
		!nonempty(run.eventStream?.sourceFileName)
	) {
		issues.push(`${label} lacks a raw-stream SHA-256 or nonzero sanitized event count`);
	}
	const persistedEventPath = path.join(releaseDir, `${run.stage}-events.jsonl`);
	if (existsSync(persistedEventPath)) {
		const exact = jsonlEvidence(persistedEventPath);
		if (
			exact.sha256 !== run.eventStream.sha256 ||
			exact.sanitizedEventCount !== run.eventStream.sanitizedEventCount
		) {
			issues.push(`${label} raw event stream differs from its retained digest/count`);
		}
	}
	if (outputPath && existsSync(outputPath)) {
		try {
			const output = parseModelJson(readFileSync(outputPath, 'utf8'));
			/** @type {JsonObject[]} */
			const outputCards = Array.isArray(output.cards) ? output.cards : [];
			/** @type {JsonObject[]} */
			const outputReviews = Array.isArray(output.reviews) ? output.reviews : [];
			const generated = outputCards.length
				? sortedUnique(outputCards.map((card) => card?.id).filter(nonempty))
				: [];
			const generatedContent = outputCards.length ? semanticCardRows(outputCards) : [];
			const accepted = outputReviews.length
				? sortedUnique(
						outputReviews
							.filter((review) => review?.accepted === true && !(review.issues?.length > 0))
							.map((review) => review.cardId)
							.filter(Boolean)
					)
				: [];
			const promptContent =
				promptPath && existsSync(promptPath)
					? semanticCardRows(cardsFromPrompt(readFileSync(promptPath, 'utf8')))
					: [];
			const reviewedContent = accepted.map((cardId) => ({
				cardId,
				semanticSha256s: sortedUnique(
					promptContent.filter((row) => row.cardId === cardId).map((row) => row.semanticSha256)
				)
			}));
			if (
				stableStringify(generated) !== stableStringify(run.generatedCardIds ?? []) ||
				stableStringify(generatedContent) !== stableStringify(run.generatedCardContent ?? []) ||
				stableStringify(accepted) !== stableStringify(run.reviewedAcceptedCardIds ?? []) ||
				stableStringify(reviewedContent) !== stableStringify(run.reviewedAcceptedCardContent ?? [])
			) {
				issues.push(`${label} card-content linkage differs from its exact prompt/model output`);
			}
		} catch (error) {
			issues.push(`${label} model output is invalid JSON: ${message(error)}`);
		}
	}
}

/**
 * @param {{
 *   releaseDir: string,
 *   stem: string,
 *   summary: JsonObject,
 *   fallbackByRunId: Map<string, JsonObject>
 * }} options
 */
function eventEvidence({ releaseDir, stem, summary, fallbackByRunId }) {
	const candidates = [
		path.join(releaseDir, `${stem}-events.jsonl`),
		...(nonempty(summary.workDir) ? [path.join(summary.workDir, 'events.jsonl')] : [])
	];
	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			const exact = jsonlEvidence(candidate);
			return { sourceFileName: path.basename(candidate), ...exact };
		}
	}
	const fallback = fallbackByRunId.get(summary.threadId);
	const fallbackHash = fallback?.eventStreamSha256 ?? fallback?.rolloutHash ?? fallback?.jsonlHash;
	const fallbackCount = Number(
		fallback?.sanitizedEventCount ?? fallback?.rowCount ?? summary.events ?? 0
	);
	if (!hexSha256(fallbackHash) || !Number.isInteger(fallbackCount) || fallbackCount < 1) {
		throw new StudyCardModelLineageError([
			`${stem} lacks an available raw stream or content-addressed recovery evidence`
		]);
	}
	return {
		sourceFileName:
			fallback?.rolloutFileName ??
			fallback?.jsonlFileName ??
			`${summary.threadId}-ignored-events.jsonl`,
		sha256: fallbackHash,
		sanitizedEventCount: fallbackCount
	};
}

/** @param {string} releaseDir */
function collectFallbackEventEvidence(releaseDir) {
	/** @type {Map<string, JsonObject>} */
	const byRunId = new Map();
	for (const name of readdirSync(releaseDir).filter((entry) => entry.endsWith('.json'))) {
		let value;
		try {
			value = readJson(path.join(releaseDir, name));
		} catch {
			continue;
		}
		walk(value, (row) => {
			const runId = row?.runId ?? row?.threadId;
			const eventHash = row?.eventStreamSha256 ?? row?.rolloutHash ?? row?.jsonlHash;
			if (nonempty(runId) && hexSha256(eventHash)) byRunId.set(runId, row);
		});
	}
	return byRunId;
}

/** @param {JsonObject} release */
function declaredRuns(release) {
	const rows = [
		{ label: 'release.generator', role: 'generator', ...release.generator },
		{ label: 'release.reviewer', role: 'reviewer', ...release.reviewer }
	];
	for (const [index, run] of (release.supplementalRuns ?? []).entries()) {
		rows.push({
			label: `release.supplementalRuns[${index}].generator`,
			role: 'generator',
			...run.generator
		});
		rows.push({
			label: `release.supplementalRuns[${index}].reviewer`,
			role: 'reviewer',
			...run.reviewer
		});
	}
	return rows;
}

/** @param {string} filePath */
function jsonlEvidence(filePath) {
	const bytes = readFileSync(filePath);
	const lines = bytes
		.toString('utf8')
		.split(/\r?\n/)
		.filter((line) => line.trim());
	for (const [index, line] of lines.entries()) {
		try {
			JSON.parse(line);
		} catch (error) {
			throw new StudyCardModelLineageError([
				`${filePath} row ${index + 1} is not valid JSON: ${message(error)}`
			]);
		}
	}
	if (!lines.length) {
		throw new StudyCardModelLineageError([`${filePath} has no sanitized event rows`]);
	}
	return { sha256: sha256(bytes), sanitizedEventCount: lines.length };
}

/**
 * @param {unknown} value
 * @param {(row: JsonObject) => void} visitor
 */
function walk(value, visitor) {
	if (!value || typeof value !== 'object') return;
	visitor(/** @type {JsonObject} */ (value));
	for (const child of Array.isArray(value) ? value : Object.values(value)) walk(child, visitor);
}

/**
 * @param {unknown} cards
 * @returns {SemanticCardRow[]}
 */
function semanticCardRows(cards) {
	/** @type {JsonObject[]} */
	const cardRows = Array.isArray(cards) ? cards : [];
	/** @type {SemanticCardRow[]} */
	const rows = [];
	for (const card of cardRows) {
		if (!nonempty(card?.id)) continue;
		const projection = semanticCardProjection(card);
		rows.push({ cardId: card.id, semanticSha256: sha256(stableStringify(projection)) });
	}
	return uniqueSemanticCardRows(rows);
}

/** @param {JsonObject} card */
function semanticCardProjection(card) {
	/** @type {JsonObject[]} */
	const targets = Array.isArray(card?.targets) ? card.targets : [];
	const topicComponentIds = sortedUnique(
		targets.length
			? targets.map((target) => target?.topicComponentId).filter(nonempty)
			: [card?.topicComponentId].filter(nonempty)
	);
	const curriculumComponentIds = sortedUnique(
		targets.length
			? targets.map((target) => target?.curriculumComponentId).filter(nonempty)
			: [card?.curriculumComponentId ?? card?.topicComponentId].filter(nonempty)
	);
	/** @type {JsonObject[]} */
	const sources = Array.isArray(card?.sources) ? card.sources : [];
	const sourceExcerpts = sources.length
		? sources.map((source) => source?.sourceExcerpt ?? source?.excerpt ?? null)
		: [card?.sourceExcerpt ?? null];
	return {
		schemaVersion: 'study-card-learner-content-v1',
		id: card?.id ?? null,
		conceptKey: card?.conceptKey ?? null,
		topicComponentIds,
		curriculumComponentIds,
		kind: card?.kind ?? null,
		visualCue: card?.visualCue ?? null,
		front: card?.front ?? null,
		back: card?.back ?? null,
		reverseFront: card?.reverseFront ?? null,
		reverseBack: card?.reverseBack ?? null,
		explanation: card?.explanation ?? null,
		memoryTip: card?.memoryTip ?? null,
		choices: /** @type {JsonObject[]} */ (Array.isArray(card?.choices) ? card.choices : []).map(
			(choice) => ({
				text: choice?.text ?? null,
				isCorrect: choice?.isCorrect === true,
				feedback: choice?.feedback ?? null,
				misconception: choice?.misconception ?? null
			})
		),
		sourceExcerpts
	};
}

/** @param {string} prompt */
function cardsFromPrompt(prompt) {
	/** @type {JsonObject[]} */
	const cards = [];
	for (const value of jsonValuesInText(prompt)) {
		walk(value, (row) => {
			if (
				nonempty(row?.id) &&
				nonempty(row?.front) &&
				nonempty(row?.back) &&
				Array.isArray(row?.choices) &&
				row.choices.length >= 3
			) {
				cards.push(row);
			}
		});
	}
	return cards;
}

/**
 * @param {string} text
 * @returns {unknown[]}
 */
function jsonValuesInText(text) {
	/** @type {unknown[]} */
	const values = [];
	let start = -1;
	/** @type {string[]} */
	let stack = [];
	let inString = false;
	let escaped = false;
	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (start < 0) {
			if (character === '{' || character === '[') {
				start = index;
				stack = [character];
				inString = false;
				escaped = false;
			}
			continue;
		}
		if (inString) {
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === '"') inString = false;
			continue;
		}
		if (character === '"') {
			inString = true;
			continue;
		}
		if (character === '{' || character === '[') {
			stack.push(character);
			continue;
		}
		if (character !== '}' && character !== ']') continue;
		const opener = stack.at(-1);
		if ((opener === '{' && character !== '}') || (opener === '[' && character !== ']')) {
			start = -1;
			stack = [];
			continue;
		}
		stack.pop();
		if (stack.length) continue;
		try {
			values.push(JSON.parse(text.slice(start, index + 1)));
		} catch {
			// Prompt prose can contain braces. Only complete JSON values are evidence.
		}
		start = -1;
	}
	return values;
}

/**
 * @param {SemanticCardRow[]} rows
 * @returns {SemanticCardRow[]}
 */
function uniqueSemanticCardRows(rows) {
	return [
		...new Map(rows.map((row) => [`${row.cardId}\n${row.semanticSha256}`, row])).values()
	].sort(
		(left, right) =>
			left.cardId.localeCompare(right.cardId) ||
			left.semanticSha256.localeCompare(right.semanticSha256)
	);
}

/** @param {SemanticCardRow[]} rows */
function hashSemanticCardRows(rows) {
	return sha256(stableStringify(uniqueSemanticCardRows(rows)));
}

/**
 * @param {SemanticCardRow[]} expectedRows
 * @param {SemanticCardRow[]} actualRows
 */
function uncoveredSemanticCards(expectedRows, actualRows) {
	const actual = new Set(
		uniqueSemanticCardRows(actualRows).map((row) => `${row.cardId}\n${row.semanticSha256}`)
	);
	return sortedUnique(
		expectedRows
			.filter((row) => !actual.has(`${row.cardId}\n${row.semanticSha256}`))
			.map((row) => row.cardId)
	);
}

/**
 * @param {unknown} value
 * @returns {JsonObject}
 */
function parseModelJson(value) {
	const trimmed = String(value ?? '').trim();
	const unwrapped = trimmed.startsWith('```')
		? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
		: trimmed;
	return JSON.parse(unwrapped);
}

/**
 * @param {string | null} filePath
 * @param {unknown} expectedHash
 */
function exactFile(filePath, expectedHash) {
	return Boolean(
		filePath &&
		existsSync(filePath) &&
		hexSha256(expectedHash) &&
		sha256(readFileSync(filePath)) === expectedHash
	);
}

/**
 * @param {string} rootDir
 * @param {unknown} value
 * @returns {string | null}
 */
function localPath(rootDir, value) {
	if (!nonempty(value)) return null;
	return path.isAbsolute(value) ? value : path.join(rootDir, value);
}

/**
 * @template T
 * @param {T[]} values
 * @returns {T[]}
 */
function sortedUnique(values) {
	return [...new Set(values)].sort();
}

/** @param {unknown[]} values */
function hashStringList(values) {
	return sha256(stableStringify([...values].sort()));
}

/** @param {unknown} value */
function validIso(value) {
	return nonempty(value) && !Number.isNaN(Date.parse(value));
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function nonempty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

/** @param {unknown} value */
function hexSha256(value) {
	return typeof value === 'string' && SHA256_PATTERN.test(value);
}

/**
 * @param {string} filePath
 * @returns {JsonObject}
 */
function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

/**
 * @param {string} rootDir
 * @param {string} filePath
 */
function relative(rootDir, filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

/** @param {string | Buffer} value */
function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

/** @param {unknown} error */
function message(error) {
	return error instanceof Error ? error.message : String(error);
}

/** @param {string[]} issues */
function throwIfIssues(issues) {
	if (issues.length) throw new StudyCardModelLineageError(issues);
}
