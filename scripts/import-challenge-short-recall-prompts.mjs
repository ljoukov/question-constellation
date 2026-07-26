#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { d1Batch, d1Rows } from './lib/d1-rest.mjs';
import { readScienceChallengeReleaseShortRecallUploadEvidence } from './lib/science-challenge-release-upload.mjs';

export const AUTHORED_PROMPT_COUNT = 92;
export const ACCEPTED_RELEASE_GENERATED_PROMPT_COUNT = 179;
export const D1_BOUND_PARAMETER_LIMIT = 100;
export const D1_INSERT_COLUMNS = 8;
export const D1_UPSERT_CHUNK_SIZE = Math.floor(D1_BOUND_PARAMETER_LIMIT / D1_INSERT_COLUMNS);
export const D1_READBACK_CHUNK_SIZE = 100;

const AUTHORED_SUBJECT_COUNTS = Object.freeze({
	biology: 30,
	chemistry: 30,
	physics: 32
});
const ACCEPTED_RELEASE_GENERATED_SUBJECT_COUNTS = Object.freeze({
	biology: 34,
	chemistry: 71,
	physics: 74
});
const ACCEPTED_RELEASE_COMBINED_SUBJECT_COUNTS = Object.freeze({
	biology: 64,
	chemistry: 101,
	physics: 106
});
const SUBJECTS = Object.freeze(Object.keys(AUTHORED_SUBJECT_COUNTS));
const TABLE_NAME = 'challenge_short_recall_prompts';
const DEFAULT_INPUT = 'src/lib/challenges/data/short-recall-prompts.v1.json';
// This is the minimum runtime/short-recall authentication set, not an exact release-tree inventory.
// The materialized release may contain additional reviewed art, lineage and provenance files.
const REQUIRED_RELEASE_EVIDENCE_FILE_NAMES = Object.freeze([
	'accepted-challenges.json',
	'runtime.json',
	'short-recall-prompts.json',
	'short-recall-authoring-evidence.json',
	'short-recall-review-evidence.json'
]);
const STORED_FIELDS = Object.freeze([
	'challenge_id',
	'prompt_stem',
	'canonical_answer',
	'accepted_aliases_json',
	'spelling_variants_json',
	'preferred_hidden_step_index',
	'content_version',
	'content_sha256'
]);
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40,64}$/;

export async function buildImportSnapshot({
	rootDir = process.cwd(),
	inputPath = path.resolve(rootDir, DEFAULT_INPUT)
} = {}) {
	if (!existsSync(inputPath)) {
		throw new Error(`Curated prompt file does not exist: ${path.relative(rootDir, inputPath)}`);
	}

	const rawSource = readFileSync(inputPath, 'utf8');
	const raw = JSON.parse(rawSource);
	if (!Array.isArray(raw)) throw new Error('Curated prompt file must be a JSON array.');
	if (raw.length !== AUTHORED_PROMPT_COUNT) {
		throw new Error(
			`Authored prompt coverage is ${raw.length}/${AUTHORED_PROMPT_COUNT}; the generated sibling bundle must not replace or rewrite authored prompts.`
		);
	}

	const vite = await createServer({
		root: rootDir,
		logLevel: 'error',
		appType: 'custom',
		server: { middlewareMode: true }
	});

	try {
		const [
			{ challengeCatalog },
			{
				authoredShortRecallPromptSources,
				bundledShortRecallPrompts,
				excludedShortRecallSpellingVariantCollisions,
				shortRecallPromptContentSha256
			},
			{
				generatedScienceShortRecallAcceptedReleaseEvidence,
				generatedScienceShortRecallChallengeIds,
				generatedScienceShortRecallCountsBySubject
			},
			{ challengeMemorySteps },
			{ challengeVisual },
			{ normalizeShortRecallAnswer }
		] = await Promise.all([
			vite.ssrLoadModule('/src/lib/challenges/catalog.ts'),
			vite.ssrLoadModule('/src/lib/challenges/shortRecallCatalog.ts'),
			vite.ssrLoadModule('/src/lib/challenges/generatedShortRecall.ts'),
			vite.ssrLoadModule('/src/lib/challenges/challengeInterludes.ts'),
			vite.ssrLoadModule('/src/lib/challenges/visuals.ts'),
			vite.ssrLoadModule('/src/lib/challenges/shortRecall.ts')
		]);

		const generatedChallengeIds = validatedGeneratedChallengeIds(
			generatedScienceShortRecallChallengeIds,
			generatedScienceShortRecallAcceptedReleaseEvidence
		);
		validateCatalogShape(
			challengeCatalog,
			generatedChallengeIds,
			generatedScienceShortRecallCountsBySubject
		);
		if (
			!Array.isArray(authoredShortRecallPromptSources) ||
			stableStringify(raw) !== stableStringify(authoredShortRecallPromptSources)
		) {
			throw new Error(
				'The authored prompt input differs from the immutable 92-prompt application source.'
			);
		}
		if (
			!Array.isArray(bundledShortRecallPrompts) ||
			bundledShortRecallPrompts.length !== challengeCatalog.length
		) {
			throw new Error(
				`Prompt coverage is ${bundledShortRecallPrompts?.length ?? 0}/${challengeCatalog.length}; every catalogue challenge needs exactly one prompt.`
			);
		}

		const acceptedOwners = buildAcceptedOwners(
			bundledShortRecallPrompts,
			normalizeShortRecallAnswer
		);
		const rows = bundledShortRecallPrompts.map((prompt, index) => {
			const challenge = challengeCatalog[index];
			if (!challenge || prompt.challengeId !== challenge.id) {
				throw new Error(
					`Prompt order mismatch at index ${index}: expected ${challenge?.id ?? '<none>'}, found ${prompt.challengeId}.`
				);
			}
			const visualSteps = challengeVisual(challenge)?.segments;
			const memorySteps = challengeMemorySteps(challenge.memoryHandle);
			const usableSteps =
				Array.isArray(visualSteps) && visualSteps.length > 0 ? visualSteps : memorySteps;
			if (prompt.preferredHiddenStepIndex >= usableSteps.length) {
				throw new Error(
					`${prompt.challengeId} uses hidden step ${prompt.preferredHiddenStepIndex}, but its ${visualSteps?.length ? 'visual' : 'memory'} chain has ${usableSteps.length} steps.`
				);
			}
			if (typeof prompt.contentVersion !== 'string' || !prompt.contentVersion) {
				throw new Error(`${prompt.challengeId} has no immutable content version.`);
			}
			for (const variant of prompt.spellingVariants ?? []) {
				const owners = acceptedOwners.get(normalizeShortRecallAnswer(variant));
				if (owners?.size) {
					throw new Error(
						`${prompt.challengeId} spelling variant "${variant}" is an accepted answer owned by ${[...owners].join(', ')}.`
					);
				}
			}
			const content = {
				challengeId: prompt.challengeId,
				stem: prompt.stem,
				canonicalAnswer: prompt.canonicalAnswer,
				acceptedAliases: prompt.acceptedAliases,
				spellingVariants: prompt.spellingVariants ?? [],
				preferredHiddenStepIndex: prompt.preferredHiddenStepIndex,
				contentVersion: prompt.contentVersion
			};
			return {
				...content,
				subject: challenge.subject,
				contentSha256: shortRecallPromptContentSha256(prompt)
			};
		});

		const countsBySubject = countBySubject(rows);
		const expectedCombinedCounts = Object.fromEntries(
			SUBJECTS.map((subject) => [
				subject,
				AUTHORED_SUBJECT_COUNTS[subject] +
					Number(generatedScienceShortRecallCountsBySubject?.[subject] ?? 0)
			])
		);
		assertSubjectCounts(countsBySubject, expectedCombinedCounts, 'combined');
		const generatedRows = rows.slice(AUTHORED_PROMPT_COUNT);
		if (
			!sameStringArray(
				generatedRows.map((row) => row.challengeId),
				generatedChallengeIds
			)
		) {
			throw new Error('Generated prompt rows differ from the exact accepted runtime membership.');
		}
		const generatedCountsBySubject = countBySubject(generatedRows);

		const contentVersions = [...new Set(rows.map((row) => row.contentVersion))].sort();
		const expectedVersionCount = generatedChallengeIds.length === 0 ? 1 : 2;
		if (contentVersions.length !== expectedVersionCount) {
			throw new Error(
				`Expected ${expectedVersionCount} content version${expectedVersionCount === 1 ? '' : 's'}, found: ${contentVersions.join(', ')}.`
			);
		}

		const snapshot = {
			rows,
			authoredChallengeIds: rows.slice(0, AUTHORED_PROMPT_COUNT).map((row) => row.challengeId),
			generatedChallengeIds,
			generatedCountsBySubject,
			countsBySubject,
			contentVersions,
			contentVersion: contentVersions.length === 1 ? contentVersions[0] : null,
			excludedSpellingVariantCollisions: excludedShortRecallSpellingVariantCollisions ?? [],
			contentFingerprint: contentFingerprint(rows),
			authoredSourceSha256: sha256(rawSource),
			acceptedReleaseEvidence: generatedScienceShortRecallAcceptedReleaseEvidence ?? null
		};
		assertAcceptedReleaseTarget(snapshot);
		return snapshot;
	} finally {
		await vite.close();
	}
}

export function assertAcceptedReleaseTarget(snapshot) {
	const releaseExists = snapshot.acceptedReleaseEvidence !== null;
	if (!releaseExists) {
		if (
			snapshot.generatedChallengeIds.length !== 0 ||
			snapshot.rows.length !== AUTHORED_PROMPT_COUNT
		) {
			throw new Error('Authored-only short-recall snapshot contains generated membership.');
		}
		return;
	}
	if (
		snapshot.generatedChallengeIds.length !== ACCEPTED_RELEASE_GENERATED_PROMPT_COUNT ||
		snapshot.rows.length !== AUTHORED_PROMPT_COUNT + ACCEPTED_RELEASE_GENERATED_PROMPT_COUNT
	) {
		throw new Error(
			`Accepted release target must contain ${AUTHORED_PROMPT_COUNT} authored plus ${ACCEPTED_RELEASE_GENERATED_PROMPT_COUNT} generated prompts; found ${snapshot.rows.length}.`
		);
	}
	assertSubjectCounts(
		snapshot.generatedCountsBySubject,
		ACCEPTED_RELEASE_GENERATED_SUBJECT_COUNTS,
		'accepted generated'
	);
	assertSubjectCounts(
		snapshot.countsBySubject,
		ACCEPTED_RELEASE_COMBINED_SUBJECT_COUNTS,
		'accepted combined'
	);
}

function validatedGeneratedChallengeIds(challengeIds, acceptedReleaseEvidence) {
	if (!Array.isArray(challengeIds)) {
		throw new Error('Generated short-recall challenge membership did not load as an array.');
	}
	if (
		challengeIds.some((id) => typeof id !== 'string' || !id) ||
		new Set(challengeIds).size !== challengeIds.length
	) {
		throw new Error('Generated short-recall challenge membership is malformed.');
	}
	if (challengeIds.length === 0) {
		if (acceptedReleaseEvidence !== null) {
			throw new Error('Generated short-recall release evidence exists without runtime membership.');
		}
		return [];
	}
	if (
		!acceptedReleaseEvidence ||
		!sameStringArray(acceptedReleaseEvidence.challengeIds ?? [], challengeIds)
	) {
		throw new Error(
			'Generated short-recall runtime membership has no exact accepted-release evidence.'
		);
	}
	return challengeIds;
}

function validateCatalogShape(challengeCatalog, generatedChallengeIds, generatedCountsBySubject) {
	if (!Array.isArray(challengeCatalog)) {
		throw new Error('challengeCatalog did not load as an array.');
	}
	const expectedCount = AUTHORED_PROMPT_COUNT + generatedChallengeIds.length;
	if (challengeCatalog.length !== expectedCount) {
		throw new Error(
			`Catalogue guard expected ${AUTHORED_PROMPT_COUNT} authored challenges plus ${generatedChallengeIds.length} accepted generated challenges, found ${challengeCatalog.length}.`
		);
	}
	const ids = challengeCatalog.map((challenge) => challenge?.id);
	if (ids.some((id) => typeof id !== 'string' || !id)) {
		throw new Error('Every catalogue challenge must have a non-empty id.');
	}
	if (new Set(ids).size !== ids.length) throw new Error('Challenge catalogue ids are not unique.');

	const authoredCounts = countBySubject(challengeCatalog.slice(0, AUTHORED_PROMPT_COUNT));
	assertSubjectCounts(authoredCounts, AUTHORED_SUBJECT_COUNTS, 'authored');
	const generated = challengeCatalog.slice(AUTHORED_PROMPT_COUNT);
	if (
		!sameStringArray(
			generated.map((challenge) => challenge.id),
			generatedChallengeIds
		)
	) {
		throw new Error('Challenge catalogue generated membership differs from the accepted runtime.');
	}
	assertSubjectCounts(
		countBySubject(generated),
		Object.fromEntries(
			SUBJECTS.map((subject) => [subject, Number(generatedCountsBySubject?.[subject] ?? 0)])
		),
		'generated'
	);
}

function assertSubjectCounts(actual, expected, label) {
	for (const [subject, expectedCount] of Object.entries(expected)) {
		if (actual[subject] !== expectedCount) {
			throw new Error(
				`${label} ${subject} prompt coverage is ${actual[subject] ?? 0}/${expectedCount}.`
			);
		}
	}
}

function countBySubject(rows) {
	return Object.fromEntries(
		SUBJECTS.map((subject) => [subject, rows.filter((row) => row.subject === subject).length])
	);
}

function buildAcceptedOwners(prompts, normalizeAnswer) {
	const acceptedOwners = new Map();
	for (const prompt of prompts) {
		for (const answer of [prompt.canonicalAnswer, ...prompt.acceptedAliases]) {
			const normalized = normalizeAnswer(answer);
			const owners = acceptedOwners.get(normalized) ?? new Set();
			owners.add(prompt.challengeId);
			acceptedOwners.set(normalized, owners);
		}
	}
	return acceptedOwners;
}

export function buildImportPlan(expectedRows, remoteRows) {
	const expectedById = uniqueRowsById(expectedRows, 'Local target', (row) => row.challengeId);
	const remoteById = uniqueRowsById(
		remoteRows,
		'Remote pre-write snapshot',
		(row) => row.challenge_id
	);
	const adds = [];
	const changes = [];
	const deletes = [];
	const unchanged = [];

	for (const challengeId of [...expectedById.keys()].sort()) {
		const expected = expectedById.get(challengeId);
		const actual = remoteById.get(challengeId);
		if (!actual) {
			adds.push({ challengeId, contentSha256: expected.contentSha256 });
			continue;
		}
		const expectedStored = expectedStoredRow(expected);
		const changedFields = STORED_FIELDS.filter((field) => actual[field] !== expectedStored[field]);
		if (changedFields.length === 0) {
			unchanged.push(challengeId);
			continue;
		}
		changes.push({
			challengeId,
			beforeContentSha256: actual.content_sha256,
			afterContentSha256: expected.contentSha256,
			fields: changedFields
		});
	}
	for (const challengeId of [...remoteById.keys()].sort()) {
		if (!expectedById.has(challengeId)) {
			deletes.push({
				challengeId,
				contentSha256: remoteById.get(challengeId).content_sha256
			});
		}
	}

	const plan = {
		before: {
			rowCount: remoteRows.length,
			contentFingerprint: storedContentFingerprint(remoteRows)
		},
		after: {
			rowCount: expectedRows.length,
			contentFingerprint: contentFingerprint(expectedRows)
		},
		adds,
		changes,
		deletes,
		unchanged
	};
	return { ...plan, planSha256: sha256(stableStringify(plan)) };
}

export function assertExpectedBefore(plan, { expectedBeforeCount, expectedBeforeFingerprint }) {
	if (plan.before.rowCount !== expectedBeforeCount) {
		throw new Error(
			`Remote pre-write count is ${plan.before.rowCount}, not the explicitly authorized ${expectedBeforeCount}.`
		);
	}
	if (plan.before.contentFingerprint !== expectedBeforeFingerprint) {
		throw new Error(
			`Remote pre-write fingerprint is ${plan.before.contentFingerprint}, not the explicitly authorized ${expectedBeforeFingerprint}.`
		);
	}
}

export function assertExactAuthoredRemoteMembership(remoteRows, authoredChallengeIds) {
	if (remoteRows.length !== AUTHORED_PROMPT_COUNT) {
		throw new Error(
			`Release import requires the exact ${AUTHORED_PROMPT_COUNT}-row authored remote baseline; found ${remoteRows.length}.`
		);
	}
	const remoteIds = remoteRows.map((row) => row.challenge_id).sort();
	const expectedIds = [...authoredChallengeIds].sort();
	if (!sameStringArray(remoteIds, expectedIds)) {
		throw new Error(
			`Remote ${AUTHORED_PROMPT_COUNT}-row baseline is not the exact authored challenge membership.`
		);
	}
}

export function assertNoAuthoredOnlyDowngrade(snapshot, plan) {
	if (
		snapshot.acceptedReleaseEvidence === null &&
		(plan.deletes.length > 0 || plan.before.rowCount > AUTHORED_PROMPT_COUNT)
	) {
		throw new Error(
			'Refusing a destructive authored-only downgrade while generated remote prompts exist.'
		);
	}
}

export function requireCommittedAcceptedReleaseEvidence(
	snapshot,
	{
		rootDir = process.cwd(),
		readHeadFileImpl = readHeadFile,
		readHeadCommitImpl = readHeadCommit,
		evidenceReader = readScienceChallengeReleaseShortRecallUploadEvidence
	} = {}
) {
	const evidence = snapshot.acceptedReleaseEvidence;
	if (!evidence) {
		throw new Error(
			'--write requires an authenticated accepted science release; the local catalog is authored-only.'
		);
	}
	if (typeof evidence.releaseId !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(evidence.releaseId)) {
		throw new Error('Accepted short-recall release id is unsafe.');
	}
	const releaseRoot = path.join('data', 'challenges', 'releases', evidence.releaseId);
	const relativePaths = REQUIRED_RELEASE_EVIDENCE_FILE_NAMES.map((fileName) =>
		path.posix.join(releaseRoot.replaceAll(path.sep, '/'), fileName)
	);
	const headCommit = String(readHeadCommitImpl({ rootDir })).trim();
	if (!GIT_COMMIT.test(headCommit)) {
		throw new Error('Could not resolve the authenticated accepted-release HEAD commit.');
	}
	for (const relativePath of relativePaths) {
		const absolutePath = path.resolve(rootDir, ...relativePath.split('/'));
		if (!existsSync(absolutePath)) {
			throw new Error(`Accepted release evidence is missing: ${relativePath}`);
		}
		const current = readFileSync(absolutePath);
		let committed;
		try {
			committed = readHeadFileImpl(relativePath, { rootDir, headCommit });
		} catch (error) {
			throw new Error(
				`Accepted release evidence is not tracked in HEAD: ${relativePath} (${errorMessage(error)})`,
				{ cause: error }
			);
		}
		const committedBytes = Buffer.isBuffer(committed) ? committed : Buffer.from(String(committed));
		if (!current.equals(committedBytes)) {
			throw new Error(`Accepted release evidence differs from HEAD: ${relativePath}`);
		}
	}

	const acceptedReleasePath = path.resolve(
		rootDir,
		...releaseRoot.split(path.sep),
		'accepted-challenges.json'
	);
	const release = JSON.parse(readFileSync(acceptedReleasePath, 'utf8'));
	if (
		release?.schemaVersion !== 'science-challenge-release/v1' ||
		release?.release?.id !== evidence.releaseId ||
		release?.release?.status !== 'accepted'
	) {
		throw new Error('Committed short-recall release marker is not an accepted release.');
	}
	for (const [field, expected] of [
		['runtimeSha256', evidence.runtimeSha256],
		['shortRecallBundleSha256', evidence.shortRecallBundleSha256],
		['shortRecallCandidateSetSha256', evidence.shortRecallCandidateSetSha256]
	]) {
		if (!SHA256.test(String(expected ?? '')) || release.release[field] !== expected) {
			throw new Error(`Committed accepted release ${field} differs from the runtime loader.`);
		}
	}

	const replay = evidenceReader({ acceptedReleasePath, release });
	if (replay?.status !== 'passed') {
		throw new Error(
			`Committed accepted release short-recall evidence did not replay: ${(replay?.issues ?? []).join('; ') || 'unknown failure'}`
		);
	}
	const replayIds = replay.candidateSet?.rows?.map((row) => row.challengeId);
	if (
		!Array.isArray(replayIds) ||
		!sameStringArray(replayIds, evidence.challengeIds) ||
		!sameStringArray(replayIds, snapshot.generatedChallengeIds)
	) {
		throw new Error(
			'Committed accepted release replay differs from the active generated runtime membership.'
		);
	}
	const targetGeneratedIds = snapshot.rows
		.slice(AUTHORED_PROMPT_COUNT)
		.map((row) => row.challengeId);
	if (!sameStringArray(replayIds, targetGeneratedIds)) {
		throw new Error(
			'Committed accepted release replay differs from the generated D1 target membership.'
		);
	}

	return {
		releaseId: evidence.releaseId,
		headCommit,
		files: relativePaths,
		challengeCount: replayIds.length,
		runtimeSha256: evidence.runtimeSha256,
		shortRecallBundleSha256: evidence.shortRecallBundleSha256,
		shortRecallCandidateSetSha256: evidence.shortRecallCandidateSetSha256,
		shortRecallReviewSha256: release.release.shortRecallReviewSha256
	};
}

export function buildWriteStatements(
	rows,
	{ plan, expectedBeforeRows, parameterLimit = D1_BOUND_PARAMETER_LIMIT } = {}
) {
	if (!plan) throw new Error('An exact pre-write import plan is required.');
	const { planSha256, ...planBody } = plan;
	if (!SHA256.test(String(planSha256 ?? '')) || sha256(stableStringify(planBody)) !== planSha256) {
		throw new Error('The exact pre-write import plan hash is invalid.');
	}
	if (
		plan.after?.rowCount !== rows.length ||
		plan.after?.contentFingerprint !== contentFingerprint(rows)
	) {
		throw new Error('The write target differs from the exact pre-write import plan.');
	}
	if (!Array.isArray(expectedBeforeRows)) {
		throw new Error('The exact remote pre-write rows are required for the transactional guard.');
	}
	for (const [index, row] of expectedBeforeRows.entries()) validateStoredRow(row, index);
	uniqueRowsById(
		expectedBeforeRows,
		'Transactional remote pre-write snapshot',
		(row) => row.challenge_id
	);
	if (
		expectedBeforeRows.length !== plan.before?.rowCount ||
		storedContentFingerprint(expectedBeforeRows) !== plan.before?.contentFingerprint
	) {
		throw new Error('The transactional remote pre-write rows differ from the import plan.');
	}
	const insertChunkSize = Math.floor(parameterLimit / D1_INSERT_COLUMNS);
	if (insertChunkSize < 1) {
		throw new Error(
			`D1 parameter limit ${parameterLimit} cannot fit one ${D1_INSERT_COLUMNS}-column insert.`
		);
	}
	const rowsById = new Map(rows.map((row) => [row.challengeId, row]));
	const statements = [buildTransactionalPreconditionStatement(expectedBeforeRows)];

	for (const deletion of plan.deletes) {
		statements.push({
			sql: `DELETE FROM ${TABLE_NAME}
				WHERE challenge_id = ? AND content_sha256 = ?`,
			params: [deletion.challengeId, deletion.contentSha256]
		});
	}
	for (const change of plan.changes) {
		const row = rowsById.get(change.challengeId);
		if (!row) throw new Error(`Planned changed row is absent: ${change.challengeId}`);
		statements.push({
			sql: `UPDATE ${TABLE_NAME} SET
					prompt_stem = ?,
					canonical_answer = ?,
					accepted_aliases_json = ?,
					spelling_variants_json = ?,
					preferred_hidden_step_index = ?,
					content_version = ?,
					content_sha256 = ?,
					updated_at = CURRENT_TIMESTAMP
				WHERE challenge_id = ? AND content_sha256 = ?`,
			params: [
				row.stem,
				row.canonicalAnswer,
				JSON.stringify(row.acceptedAliases),
				JSON.stringify(row.spellingVariants),
				row.preferredHiddenStepIndex,
				row.contentVersion,
				row.contentSha256,
				row.challengeId,
				change.beforeContentSha256
			]
		});
	}

	const addRows = plan.adds.map((addition) => {
		const row = rowsById.get(addition.challengeId);
		if (!row) throw new Error(`Planned added row is absent: ${addition.challengeId}`);
		return row;
	});
	for (let start = 0; start < addRows.length; start += insertChunkSize) {
		const chunk = addRows.slice(start, start + insertChunkSize);
		const valuePlaceholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
		statements.push({
			sql: `INSERT INTO ${TABLE_NAME} (
					challenge_id,
					prompt_stem,
					canonical_answer,
					accepted_aliases_json,
					spelling_variants_json,
					preferred_hidden_step_index,
					content_version,
					content_sha256
				) VALUES ${valuePlaceholders}
				ON CONFLICT(challenge_id) DO NOTHING`,
			params: chunk.flatMap((row) => [
				row.challengeId,
				row.stem,
				row.canonicalAnswer,
				JSON.stringify(row.acceptedAliases),
				JSON.stringify(row.spellingVariants),
				row.preferredHiddenStepIndex,
				row.contentVersion,
				row.contentSha256
			])
		});
	}
	for (const statement of statements) {
		if (statement.params.length > parameterLimit) {
			throw new Error(
				`D1 statement exceeds the ${parameterLimit}-parameter guard (${statement.params.length}).`
			);
		}
	}
	return statements;
}

function buildTransactionalPreconditionStatement(expectedBeforeRows) {
	const expectedRowsJson = JSON.stringify(expectedBeforeRows);
	const fieldComparisons = STORED_FIELDS.map(
		(field) => `actual.${field} IS NOT json_extract(expected.value, '$.${field}')`
	).join('\n\t\t\t\t\tOR ');
	return {
		sql: `SELECT CASE WHEN
				(SELECT COUNT(*) FROM ${TABLE_NAME}) = ?
				AND NOT EXISTS (
					SELECT 1
					FROM json_each(?) AS expected
					LEFT JOIN ${TABLE_NAME} AS actual
						ON actual.challenge_id = json_extract(expected.value, '$.challenge_id')
					WHERE actual.challenge_id IS NULL
						OR ${fieldComparisons}
				)
			THEN 1
			ELSE json('challenge_short_recall_import_precondition_failed')
		END AS exact_pre_write_guard`,
		params: [expectedBeforeRows.length, expectedRowsJson]
	};
}

export async function requireRemoteSchema({ rootDir = process.cwd(), d1RowsImpl = d1Rows } = {}) {
	const rows = await d1RowsImpl(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
		[TABLE_NAME],
		{ rootDir, binding: 'QUESTION_DB' }
	);
	if (rows.length !== 1) {
		throw new Error(
			`Remote ${TABLE_NAME} schema is absent. Apply migrations/0030_challenge_short_recall_prompts.sql before importing.`
		);
	}
}

export async function readRemoteSnapshot({ rootDir = process.cwd(), d1RowsImpl = d1Rows } = {}) {
	const rows = await d1RowsImpl(
		`SELECT
			challenge_id,
			prompt_stem,
			canonical_answer,
			accepted_aliases_json,
			spelling_variants_json,
			preferred_hidden_step_index,
			content_version,
			content_sha256
		FROM ${TABLE_NAME}
		ORDER BY challenge_id`,
		[],
		{ rootDir, binding: 'QUESTION_DB' }
	);
	for (const [index, row] of rows.entries()) validateStoredRow(row, index);
	uniqueRowsById(rows, 'Remote snapshot', (row) => row.challenge_id);
	return {
		rows,
		rowCount: rows.length,
		contentFingerprint: storedContentFingerprint(rows)
	};
}

export async function verifyRemoteSnapshot(
	expectedRows,
	{ rootDir = process.cwd(), d1RowsImpl = d1Rows } = {}
) {
	uniqueRowsById(expectedRows, 'Expected post-write snapshot', (row) => row.challengeId);
	const remote = await readRemoteSnapshot({ rootDir, d1RowsImpl });
	const remoteById = new Map(remote.rows.map((row) => [row.challenge_id, row]));
	const mismatches = [];
	for (const expected of expectedRows) {
		const actual = remoteById.get(expected.challengeId);
		if (!actual) {
			mismatches.push(`${expected.challengeId}: missing`);
			continue;
		}
		const expectedStored = expectedStoredRow(expected);
		for (const [field, expectedValue] of Object.entries(expectedStored)) {
			if (actual[field] !== expectedValue) mismatches.push(`${expected.challengeId}.${field}`);
		}
	}
	const expectedIds = new Set(expectedRows.map((row) => row.challengeId));
	for (const actual of remote.rows) {
		if (!expectedIds.has(actual.challenge_id)) {
			mismatches.push(`${actual.challenge_id}: unexpected`);
		}
	}
	const expectedFingerprint = contentFingerprint(expectedRows);
	if (
		remote.rows.length !== expectedRows.length ||
		mismatches.length > 0 ||
		remote.contentFingerprint !== expectedFingerprint
	) {
		throw new Error(
			`Remote verification failed (${remote.rows.length}/${expectedRows.length} rows; actual fingerprint ${remote.contentFingerprint}; expected ${expectedFingerprint}; mismatches: ${mismatches.slice(0, 12).join(', ') || 'fingerprint only'}).`
		);
	}
	return {
		verified: true,
		rowCount: remote.rows.length,
		contentFingerprint: remote.contentFingerprint,
		expectedContentFingerprint: expectedFingerprint
	};
}

function expectedStoredRow(expected) {
	return {
		challenge_id: expected.challengeId,
		prompt_stem: expected.stem,
		canonical_answer: expected.canonicalAnswer,
		accepted_aliases_json: JSON.stringify(expected.acceptedAliases),
		spelling_variants_json: JSON.stringify(expected.spellingVariants),
		preferred_hidden_step_index: expected.preferredHiddenStepIndex,
		content_version: expected.contentVersion,
		content_sha256: expected.contentSha256
	};
}

function validateStoredRow(row, index) {
	if (!row || typeof row !== 'object' || Array.isArray(row)) {
		throw new Error(`Remote stored row ${index} is malformed.`);
	}
	for (const field of STORED_FIELDS) {
		if (!Object.hasOwn(row, field)) {
			throw new Error(`Remote stored row ${index} is missing ${field}.`);
		}
	}
	if (
		typeof row.challenge_id !== 'string' ||
		!row.challenge_id ||
		typeof row.content_sha256 !== 'string' ||
		!SHA256.test(row.content_sha256)
	) {
		throw new Error(`Remote stored row ${index} has an invalid identity or content hash.`);
	}
}

function uniqueRowsById(rows, label, idForRow) {
	const byId = new Map();
	for (const row of rows) {
		const id = idForRow(row);
		if (typeof id !== 'string' || !id || byId.has(id)) {
			throw new Error(`${label} challenge ids are missing or duplicated.`);
		}
		byId.set(id, row);
	}
	return byId;
}

export function contentFingerprint(rows) {
	return sha256(
		rows
			.map((row) => `${row.challengeId}:${row.contentSha256}`)
			.sort()
			.join('\n')
	);
}

export function storedContentFingerprint(rows) {
	return sha256(
		rows
			.map((row) => `${row.challenge_id}:${row.content_sha256}`)
			.sort()
			.join('\n')
	);
}

function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function sameStringArray(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function readHeadFile(relativePath, { rootDir, headCommit }) {
	return execFileSync('git', ['show', `${headCommit}:${relativePath}`], {
		cwd: rootDir,
		encoding: 'buffer',
		maxBuffer: 64 * 1024 * 1024
	});
}

function readHeadCommit({ rootDir }) {
	return execFileSync('git', ['rev-parse', 'HEAD'], {
		cwd: rootDir,
		encoding: 'utf8'
	});
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

export function parseArgs(argv, rootDir) {
	const allowedExact = new Set(['--write', '--verify-remote', '--help', '-h']);
	const allowedPrefixes = [
		'--input=',
		'--expected-before-count=',
		'--expected-before-fingerprint='
	];
	const unknown = argv.filter(
		(argument) =>
			!allowedExact.has(argument) && !allowedPrefixes.some((prefix) => argument.startsWith(prefix))
	);
	if (unknown.length > 0) {
		throw new Error(`Unknown argument${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
	}
	const inputValue = argumentValue(argv, '--input=') || DEFAULT_INPUT;
	const expectedCountValue = argumentValue(argv, '--expected-before-count=');
	const expectedBeforeCount =
		expectedCountValue === null || expectedCountValue === '' ? null : Number(expectedCountValue);
	const expectedBeforeFingerprint = argumentValue(argv, '--expected-before-fingerprint=');
	const write = argv.includes('--write');
	if (
		expectedBeforeCount !== null &&
		(!Number.isInteger(expectedBeforeCount) || expectedBeforeCount < 0)
	) {
		throw new Error('--expected-before-count must be a non-negative integer.');
	}
	if (expectedBeforeFingerprint !== null && !SHA256.test(expectedBeforeFingerprint)) {
		throw new Error('--expected-before-fingerprint must be a lowercase SHA-256 hash.');
	}
	if (write && (expectedBeforeCount === null || expectedBeforeFingerprint === null)) {
		throw new Error(
			'--write requires both --expected-before-count and --expected-before-fingerprint.'
		);
	}
	return {
		write,
		verifyRemote: argv.includes('--verify-remote') || write,
		help: argv.includes('--help') || argv.includes('-h'),
		inputPath: path.resolve(rootDir, inputValue),
		expectedBeforeCount,
		expectedBeforeFingerprint
	};
}

function argumentValue(argv, prefix) {
	const matches = argv.filter((argument) => argument.startsWith(prefix));
	if (matches.length > 1) throw new Error(`${prefix.slice(0, -1)} may be provided only once.`);
	return matches.length === 0 ? null : matches[0].slice(prefix.length).trim();
}

async function runCli() {
	const rootDir = process.cwd();
	const args = parseArgs(process.argv.slice(2), rootDir);
	if (args.help) {
		printHelp();
		return;
	}
	const result = await buildImportSnapshot({ rootDir, inputPath: args.inputPath });
	let remoteVerification = null;
	let writePlan = null;
	let authenticatedRelease = null;
	if (args.write) {
		await requireRemoteSchema({ rootDir });
		const remoteBefore = await readRemoteSnapshot({ rootDir });
		writePlan = buildImportPlan(result.rows, remoteBefore.rows);
		assertExpectedBefore(writePlan, {
			expectedBeforeCount: args.expectedBeforeCount,
			expectedBeforeFingerprint: args.expectedBeforeFingerprint
		});
		assertNoAuthoredOnlyDowngrade(result, writePlan);
		assertExactAuthoredRemoteMembership(remoteBefore.rows, result.authoredChallengeIds);
		authenticatedRelease = requireCommittedAcceptedReleaseEvidence(result, { rootDir });
		console.log(
			JSON.stringify(
				{
					status: 'authenticated_write_plan',
					dryRun: true,
					table: TABLE_NAME,
					acceptedRelease: authenticatedRelease,
					plan: writePlan
				},
				null,
				2
			)
		);
		const statements = buildWriteStatements(result.rows, {
			plan: writePlan,
			expectedBeforeRows: remoteBefore.rows
		});
		if (statements.length > 0) {
			await d1Batch(statements, { rootDir, binding: 'QUESTION_DB' });
		}
		remoteVerification = await verifyRemoteSnapshot(result.rows, { rootDir });
	} else if (args.verifyRemote) {
		await requireRemoteSchema({ rootDir });
		remoteVerification = await verifyRemoteSnapshot(result.rows, { rootDir });
	}
	console.log(
		JSON.stringify(
			{
				status: args.write
					? 'applied_and_verified'
					: args.verifyRemote
						? 'validated_and_remote_verified'
						: 'validated_dry_run',
				dryRun: !args.write,
				input: path.relative(rootDir, args.inputPath),
				table: TABLE_NAME,
				counts: {
					total: result.rows.length,
					bySubject: result.countsBySubject,
					aliases: result.rows.reduce((total, row) => total + row.acceptedAliases.length, 0),
					spellingVariants: result.rows.reduce(
						(total, row) => total + row.spellingVariants.length,
						0
					),
					excludedSpellingVariantCollisions: result.excludedSpellingVariantCollisions.length
				},
				excludedSpellingVariantCollisions: {
					items: result.excludedSpellingVariantCollisions.slice(0, 20),
					truncated: result.excludedSpellingVariantCollisions.length > 20
				},
				contentVersions: result.contentVersions,
				contentFingerprint: result.contentFingerprint,
				authoredSourceSha256: result.authoredSourceSha256,
				acceptedRelease: authenticatedRelease,
				writePlan,
				remote: remoteVerification,
				nextStep:
					!args.write && !args.verifyRemote
						? 'Commit the accepted release, inspect the exact 92-row remote fingerprint, then repeat with --write plus both expected-before guards.'
						: null
			},
			null,
			2
		)
	);
}

function printHelp() {
	console.log(`Usage:
  node scripts/import-challenge-short-recall-prompts.mjs [options]

Options:
  --input=<path>                         Immutable authored prompt JSON (default: ${DEFAULT_INPUT})
  --write                                Apply the authenticated accepted release to QUESTION_DB
  --expected-before-count=<integer>      Required with --write; exact remote row count
  --expected-before-fingerprint=<sha256> Required with --write; exact remote content fingerprint
  --verify-remote                        Read-only exact comparison with the local snapshot
  --help, -h                             Show this help

--write accepts only a complete accepted release whose runtime, prompt bundle, authoring evidence,
review evidence and accepted marker are tracked and byte-identical in HEAD. It first proves the
explicit remote fingerprint and exact ${AUTHORED_PROMPT_COUNT}-row authored membership, prints the
complete add/change/delete plan, then executes only those planned mutations and verifies an exact
post-write readback.`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
	runCli().catch((error) => {
		console.error(`Short-recall prompt import failed: ${errorMessage(error)}`);
		process.exitCode = 1;
	});
}
