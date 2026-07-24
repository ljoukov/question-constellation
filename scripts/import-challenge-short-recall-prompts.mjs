#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { d1Batch, d1Rows } from './lib/d1-rest.mjs';

const EXPECTED_CATALOG_COUNT = 92;
const EXPECTED_SUBJECT_COUNTS = {
	biology: 30,
	chemistry: 30,
	physics: 32
};
const TABLE_NAME = 'challenge_short_recall_prompts';
const DEFAULT_INPUT = 'src/lib/challenges/data/short-recall-prompts.v1.json';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));

if (args.help) {
	printHelp();
	process.exit(0);
}

try {
	const result = await buildImportSnapshot();
	let remoteVerification = null;

	if (args.write) {
		await requireRemoteSchema();
		await d1Batch(buildWriteStatements(result.rows), { rootDir, binding: 'QUESTION_DB' });
		remoteVerification = await verifyRemoteSnapshot(result.rows);
	} else if (args.verifyRemote) {
		await requireRemoteSchema();
		remoteVerification = await verifyRemoteSnapshot(result.rows);
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
				contentVersion: result.contentVersion,
				contentFingerprint: result.contentFingerprint,
				remote: remoteVerification,
				nextStep:
					!args.write && !args.verifyRemote
						? 'Run the QUESTION_DB migration, then repeat with --write for an explicit remote import.'
						: null
			},
			null,
			2
		)
	);
} catch (error) {
	console.error(
		`Short-recall prompt import failed: ${error instanceof Error ? error.message : String(error)}`
	);
	process.exitCode = 1;
}

function parseArgs(argv) {
	const unknown = argv.filter(
		(argument) =>
			!['--write', '--verify-remote', '--help', '-h'].includes(argument) &&
			!argument.startsWith('--input=')
	);
	if (unknown.length > 0) {
		throw new Error(`Unknown argument${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
	}

	const inputArgument = argv.find((argument) => argument.startsWith('--input='));
	const inputValue = inputArgument?.slice('--input='.length).trim() || DEFAULT_INPUT;
	return {
		write: argv.includes('--write'),
		verifyRemote: argv.includes('--verify-remote') || argv.includes('--write'),
		help: argv.includes('--help') || argv.includes('-h'),
		inputPath: path.resolve(rootDir, inputValue)
	};
}

async function buildImportSnapshot() {
	if (!existsSync(args.inputPath)) {
		throw new Error(
			`Curated prompt file does not exist: ${path.relative(rootDir, args.inputPath)}`
		);
	}

	const raw = JSON.parse(readFileSync(args.inputPath, 'utf8'));
	if (!Array.isArray(raw)) throw new Error('Curated prompt file must be a JSON array.');

	const vite = await createServer({
		root: rootDir,
		logLevel: 'error',
		appType: 'custom',
		server: { middlewareMode: true }
	});

	try {
		const [{ challengeCatalog }, shortRecall, { challengeMemorySteps }, { challengeVisual }] =
			await Promise.all([
				vite.ssrLoadModule('/src/lib/challenges/catalog.ts'),
				vite.ssrLoadModule('/src/lib/challenges/shortRecall.ts'),
				vite.ssrLoadModule('/src/lib/challenges/challengeInterludes.ts'),
				vite.ssrLoadModule('/src/lib/challenges/visuals.ts')
			]);

		validateCatalogShape(challengeCatalog);
		if (raw.length !== challengeCatalog.length) {
			throw new Error(
				`Prompt coverage is ${raw.length}/${challengeCatalog.length}; every catalogue challenge needs exactly one prompt.`
			);
		}

		const seenChallengeIds = new Set();
		const validatedPrompts = raw.map((candidate, index) => {
			validateCuratedAcceptedForms(candidate, index, shortRecall);
			const prompt = shortRecall.validateShortRecallPrompt(candidate);
			if (!prompt) {
				throw new Error(`Prompt ${index + 1} does not satisfy validateShortRecallPrompt().`);
			}
			if (seenChallengeIds.has(prompt.challengeId)) {
				throw new Error(`Duplicate prompt for challenge ${prompt.challengeId}.`);
			}
			seenChallengeIds.add(prompt.challengeId);

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

			const acceptedAnswers = [prompt.canonicalAnswer, ...prompt.acceptedAliases];
			const spellingVariants = shortRecall.generateSpellingVariants(acceptedAnswers);
			return {
				challenge,
				...prompt,
				contentVersion: prompt.contentVersion?.trim() || shortRecall.SHORT_RECALL_CONTENT_VERSION,
				spellingVariants
			};
		});

		const { prompts: collisionSafePrompts, excluded: excludedSpellingVariantCollisions } =
			filterCrossCatalogSpellingCollisions(validatedPrompts, shortRecall);

		const rows = collisionSafePrompts.map((prompt) => {
			const content = {
				challengeId: prompt.challengeId,
				stem: prompt.stem,
				canonicalAnswer: prompt.canonicalAnswer,
				acceptedAliases: prompt.acceptedAliases,
				spellingVariants: prompt.spellingVariants,
				preferredHiddenStepIndex: prompt.preferredHiddenStepIndex,
				contentVersion: prompt.contentVersion
			};
			return {
				...content,
				subject: prompt.challenge.subject,
				contentSha256: sha256(stableStringify(content))
			};
		});

		const countsBySubject = Object.fromEntries(
			Object.keys(EXPECTED_SUBJECT_COUNTS).map((subject) => [
				subject,
				rows.filter((row) => row.subject === subject).length
			])
		);
		for (const [subject, expectedCount] of Object.entries(EXPECTED_SUBJECT_COUNTS)) {
			if (countsBySubject[subject] !== expectedCount) {
				throw new Error(
					`${subject} prompt coverage is ${countsBySubject[subject]}/${expectedCount}.`
				);
			}
		}

		const versions = [...new Set(rows.map((row) => row.contentVersion))];
		if (versions.length !== 1) {
			throw new Error(`Expected one content version, found: ${versions.join(', ')}.`);
		}

		return {
			rows,
			countsBySubject,
			contentVersion: versions[0],
			excludedSpellingVariantCollisions,
			contentFingerprint: sha256(
				rows.map((row) => `${row.challengeId}:${row.contentSha256}`).join('\n')
			)
		};
	} finally {
		await vite.close();
	}
}

function validateCatalogShape(challengeCatalog) {
	if (!Array.isArray(challengeCatalog)) {
		throw new Error('challengeCatalog did not load as an array.');
	}
	if (challengeCatalog.length !== EXPECTED_CATALOG_COUNT) {
		throw new Error(
			`Catalogue guard expected ${EXPECTED_CATALOG_COUNT} challenges, found ${challengeCatalog.length}. Update this importer only after reviewing the new coverage.`
		);
	}
	const ids = challengeCatalog.map((challenge) => challenge?.id);
	if (ids.some((id) => typeof id !== 'string' || !id)) {
		throw new Error('Every catalogue challenge must have a non-empty id.');
	}
	if (new Set(ids).size !== ids.length) throw new Error('Challenge catalogue ids are not unique.');
}

function filterCrossCatalogSpellingCollisions(prompts, shortRecall) {
	const acceptedOwners = new Map();
	for (const prompt of prompts) {
		for (const answer of [prompt.canonicalAnswer, ...prompt.acceptedAliases]) {
			const normalized = shortRecall.normalizeShortRecallAnswer(answer);
			const owners = acceptedOwners.get(normalized) ?? new Set();
			owners.add(prompt.challengeId);
			acceptedOwners.set(normalized, owners);
		}
	}

	const excluded = [];
	const collisionSafePrompts = prompts.map((prompt) => {
		const spellingVariants = prompt.spellingVariants.filter((variant) => {
			const normalized = shortRecall.normalizeShortRecallAnswer(variant);
			const otherOwners = [...(acceptedOwners.get(normalized) ?? [])].filter(
				(challengeId) => challengeId !== prompt.challengeId
			);
			if (otherOwners.length > 0) {
				excluded.push({
					challengeId: prompt.challengeId,
					variant,
					collidesWith: otherOwners
				});
				return false;
			}
			return true;
		});
		return { ...prompt, spellingVariants };
	});

	return { prompts: collisionSafePrompts, excluded };
}

function validateCuratedAcceptedForms(candidate, index, shortRecall) {
	if (
		!candidate ||
		typeof candidate !== 'object' ||
		Array.isArray(candidate) ||
		typeof candidate.canonicalAnswer !== 'string' ||
		!Array.isArray(candidate.acceptedAliases)
	) {
		return;
	}

	const challengeLabel =
		typeof candidate.challengeId === 'string' ? candidate.challengeId : `prompt ${index + 1}`;
	const canonical = shortRecall.normalizeShortRecallAnswer(candidate.canonicalAnswer);
	const seenAliases = new Set();
	for (const alias of candidate.acceptedAliases) {
		if (typeof alias !== 'string') continue;
		const normalized = shortRecall.normalizeShortRecallAnswer(alias);
		if (normalized === canonical) {
			throw new Error(
				`${challengeLabel} repeats its canonical answer "${candidate.canonicalAnswer}" as an alias.`
			);
		}
		if (seenAliases.has(normalized)) {
			throw new Error(`${challengeLabel} contains the duplicate accepted alias "${alias}".`);
		}
		seenAliases.add(normalized);
	}
}

function buildWriteStatements(rows) {
	const placeholders = rows.map(() => '?').join(', ');
	return [
		{
			sql: `DELETE FROM ${TABLE_NAME} WHERE challenge_id NOT IN (${placeholders})`,
			params: rows.map((row) => row.challengeId)
		},
		...rows.map((row) => ({
			sql: `
				INSERT INTO ${TABLE_NAME} (
					challenge_id,
					prompt_stem,
					canonical_answer,
					accepted_aliases_json,
					spelling_variants_json,
					preferred_hidden_step_index,
					content_version,
					content_sha256
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(challenge_id) DO UPDATE SET
					prompt_stem = excluded.prompt_stem,
					canonical_answer = excluded.canonical_answer,
					accepted_aliases_json = excluded.accepted_aliases_json,
					spelling_variants_json = excluded.spelling_variants_json,
					preferred_hidden_step_index = excluded.preferred_hidden_step_index,
					content_version = excluded.content_version,
					content_sha256 = excluded.content_sha256,
					updated_at = CASE
						WHEN ${TABLE_NAME}.content_sha256 <> excluded.content_sha256
						THEN CURRENT_TIMESTAMP
						ELSE ${TABLE_NAME}.updated_at
					END
			`,
			params: [
				row.challengeId,
				row.stem,
				row.canonicalAnswer,
				JSON.stringify(row.acceptedAliases),
				JSON.stringify(row.spellingVariants),
				row.preferredHiddenStepIndex,
				row.contentVersion,
				row.contentSha256
			]
		}))
	];
}

async function requireRemoteSchema() {
	const rows = await d1Rows(
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

async function verifyRemoteSnapshot(expectedRows) {
	const remoteRows = await d1Rows(
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

	const remoteById = new Map(remoteRows.map((row) => [row.challenge_id, row]));
	const mismatches = [];
	for (const expected of expectedRows) {
		const actual = remoteById.get(expected.challengeId);
		if (!actual) {
			mismatches.push(`${expected.challengeId}: missing`);
			continue;
		}
		const expectedStored = {
			challenge_id: expected.challengeId,
			prompt_stem: expected.stem,
			canonical_answer: expected.canonicalAnswer,
			accepted_aliases_json: JSON.stringify(expected.acceptedAliases),
			spelling_variants_json: JSON.stringify(expected.spellingVariants),
			preferred_hidden_step_index: expected.preferredHiddenStepIndex,
			content_version: expected.contentVersion,
			content_sha256: expected.contentSha256
		};
		for (const [field, expectedValue] of Object.entries(expectedStored)) {
			if (actual[field] !== expectedValue) {
				mismatches.push(`${expected.challengeId}.${field}`);
			}
		}
	}

	const expectedIds = new Set(expectedRows.map((row) => row.challengeId));
	for (const actual of remoteRows) {
		if (!expectedIds.has(actual.challenge_id))
			mismatches.push(`${actual.challenge_id}: unexpected`);
	}

	if (remoteRows.length !== expectedRows.length || mismatches.length > 0) {
		throw new Error(
			`Remote verification failed (${remoteRows.length}/${expectedRows.length} rows; mismatches: ${mismatches.slice(0, 12).join(', ') || 'count only'}).`
		);
	}

	return {
		verified: true,
		rowCount: remoteRows.length,
		contentFingerprint: sha256(
			expectedRows.map((row) => `${row.challengeId}:${row.contentSha256}`).join('\n')
		)
	};
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

function printHelp() {
	console.log(`Usage:
  node scripts/import-challenge-short-recall-prompts.mjs [options]

Options:
  --input=<path>     Curated prompt JSON (default: ${DEFAULT_INPUT})
  --write            Explicitly upsert the validated snapshot into remote QUESTION_DB
  --verify-remote    Read-only comparison of remote QUESTION_DB with the local snapshot
  --help, -h         Show this help

Without --write or --verify-remote, the script validates locally and performs no remote access.`);
}
