#!/usr/bin/env node

import {
	closeSync,
	fstatSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { d1Batch } from './lib/d1-rest.mjs';
import {
	buildScienceChallengeSourceSnapshot,
	serializeScienceChallengeSourceSnapshot
} from './lib/science-challenge-source-snapshot.mjs';

const QUESTION_SCOPE = `LOWER(COALESCE(q.board, '')) = 'aqa'
  AND LOWER(COALESCE(q.qualification, '')) = 'gcse'
  AND LOWER(COALESCE(q.subject, '')) IN ('biology', 'chemistry', 'physics')
  AND q.status = 'published'
  AND q.needs_human_review = 0`;

const DEFAULT_OUTPUT = 'tmp/science-challenge-sources-v1.json';

const TABLE_QUERIES = Object.freeze({
	sourceDocuments: `WITH scoped_questions AS (
    SELECT q.id, q.source_document_id
      FROM questions q
     WHERE ${QUESTION_SCOPE}
  ), linked_documents AS (
    SELECT source_document_id AS id FROM scoped_questions
    UNION
    SELECT row.source_document_id AS id
      FROM mark_scheme_items row
      JOIN scoped_questions q ON q.id = row.question_id
     WHERE row.source_document_id IS NOT NULL
  )
  SELECT source.*
    FROM linked_documents linked
    JOIN source_documents source ON source.id = linked.id
   ORDER BY source.id`,
	questions: `SELECT q.*
    FROM questions q
   WHERE ${QUESTION_SCOPE}
   ORDER BY q.subject, q.source_document_id, q.display_order, q.id`,
	renderingOverlays: `SELECT row.*
    FROM question_rendering_overlays row
    JOIN questions q ON q.id = row.question_id
   WHERE ${QUESTION_SCOPE}
   ORDER BY row.question_id, row.overlay_version, row.id`,
	responseAnswerKeys: `SELECT row.*
    FROM question_response_answer_keys row
    JOIN questions q ON q.id = row.question_id
   WHERE ${QUESTION_SCOPE}
   ORDER BY row.question_id, row.response_kind, row.display_order, row.target_id, row.id`,
	markSchemeItems: `SELECT row.*
    FROM mark_scheme_items row
    JOIN questions q ON q.id = row.question_id
   WHERE ${QUESTION_SCOPE}
   ORDER BY row.question_id, row.display_order, row.id`,
	markChecklistItems: `SELECT row.*
    FROM mark_checklist_items row
    JOIN questions q ON q.id = row.question_id
   WHERE ${QUESTION_SCOPE}
   ORDER BY row.question_id, row.display_order, row.id`,
	modelAnswers: `SELECT row.*
    FROM model_answers row
    JOIN questions q ON q.id = row.question_id
   WHERE ${QUESTION_SCOPE}
   ORDER BY row.question_id, row.id`,
	questionAssets: `SELECT row.*
    FROM question_assets row
    JOIN questions q ON q.id = row.question_id
   WHERE ${QUESTION_SCOPE}
     AND row.required = 1
   ORDER BY row.question_id, row.id`,
	primaryChainMappings: `SELECT row.*
    FROM question_answer_chains row
    JOIN questions q ON q.id = row.question_id
   WHERE ${QUESTION_SCOPE}
     AND row.is_primary = 1
   ORDER BY row.question_id, row.display_order, row.id`,
	answerChains: `SELECT DISTINCT chain.*
    FROM question_answer_chains mapping
    JOIN questions q ON q.id = mapping.question_id
    JOIN answer_chains chain ON chain.id = mapping.answer_chain_id
   WHERE ${QUESTION_SCOPE}
     AND mapping.is_primary = 1
   ORDER BY chain.id`,
	answerChainSteps: `SELECT DISTINCT step.*
    FROM question_answer_chains mapping
    JOIN questions q ON q.id = mapping.question_id
    JOIN answer_chain_steps step ON step.answer_chain_id = mapping.answer_chain_id
   WHERE ${QUESTION_SCOPE}
     AND mapping.is_primary = 1
   ORDER BY step.answer_chain_id, step.display_order, step.id`,
	questionWeakAnswers: `SELECT weak.*
    FROM common_weak_answers weak
    JOIN questions q ON q.id = weak.question_id
   WHERE ${QUESTION_SCOPE}
   ORDER BY weak.question_id, weak.id`,
	chainWeakAnswers: `SELECT DISTINCT weak.*
    FROM question_answer_chains mapping
    JOIN questions q ON q.id = mapping.question_id
    JOIN common_weak_answers weak ON weak.answer_chain_id = mapping.answer_chain_id
   WHERE ${QUESTION_SCOPE}
     AND mapping.is_primary = 1
     AND weak.question_id IS NULL
   ORDER BY weak.answer_chain_id, weak.id`
});

/**
 * Read the accepted source cohort. Every statement is a SELECT (or a WITH followed by SELECT); this
 * exporter has no D1 write path.
 *
 * @param {{ rootDir?: string }} [options]
 */
export async function collectScienceChallengeSourceRows({ rootDir = process.cwd() } = {}) {
	const queries = Object.entries(TABLE_QUERIES);
	for (const [name, sql] of queries) assertReadOnlyQuery(name, sql);
	const results = await d1Batch(
		queries.map(([, sql]) => ({ sql })),
		{ rootDir, binding: 'QUESTION_DB' }
	);
	return Object.fromEntries(queries.map(([name], index) => [name, results[index]?.results ?? []]));
}

/**
 * @param {{ rootDir?: string, output?: string, expectedQuestionCount?: number }} [options]
 */
export async function exportScienceChallengeSources({
	rootDir = process.cwd(),
	output = DEFAULT_OUTPUT,
	expectedQuestionCount = 498
} = {}) {
	resolveScienceChallengeSourceOutput({ rootDir, output });
	const rows = await collectScienceChallengeSourceRows({ rootDir });
	const snapshot = buildScienceChallengeSourceSnapshot(rows, { expectedQuestionCount });
	const written = writeScienceChallengeSourceOutput({
		rootDir,
		output,
		contents: serializeScienceChallengeSourceSnapshot(snapshot)
	});
	return { ...written, snapshot };
}

/**
 * Resolve an operator-supplied output without accepting absolute or repository-escaping paths.
 *
 * @param {{ rootDir?: string, output?: string }} [options]
 */
export function resolveScienceChallengeSourceOutput({
	rootDir = process.cwd(),
	output = DEFAULT_OUTPUT
} = {}) {
	if (typeof rootDir !== 'string' || rootDir.length === 0) {
		throw new Error('Repository root must be a non-empty path.');
	}
	if (
		typeof output !== 'string' ||
		output.length === 0 ||
		output.includes('\0') ||
		path.isAbsolute(output) ||
		path.win32.isAbsolute(output)
	) {
		throw invalidOutputPathError();
	}

	const repositoryRoot = path.resolve(rootDir);
	const outputPath = path.resolve(repositoryRoot, output);
	const relative = path.relative(repositoryRoot, outputPath);
	if (
		!relative ||
		relative === '..' ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	) {
		throw invalidOutputPathError();
	}

	return {
		repositoryRoot,
		outputPath,
		outputLabel: relative.split(path.sep).join('/')
	};
}

/**
 * Create one source export without following symlinked parents or replacing an existing entry.
 *
 * @param {{ rootDir?: string, output?: string, contents: string | NodeJS.ArrayBufferView }} options
 */
export function writeScienceChallengeSourceOutput({
	rootDir = process.cwd(),
	output = DEFAULT_OUTPUT,
	contents
}) {
	const target = resolveScienceChallengeSourceOutput({ rootDir, output });
	ensureSafeOutputParent(target);
	let descriptor = null;
	let claim = null;

	try {
		descriptor = openSync(target.outputPath, 'wx', 0o666);
		const metadata = fstatSync(descriptor);
		if (!metadata.isFile()) {
			throw new Error('Exclusive output claim did not create a regular file.');
		}
		claim = {
			filePath: target.outputPath,
			device: metadata.dev,
			inode: metadata.ino
		};

		// Refuse a parent-path swap after claiming but before payload bytes are written.
		ensureSafeOutputParent(target);
		writeFileSync(descriptor, contents, { encoding: 'utf8' });
		fsyncSync(descriptor);
		closeSync(descriptor);
		descriptor = null;
	} catch (error) {
		if (descriptor !== null) {
			try {
				closeSync(descriptor);
			} catch {
				// Identity-checked cleanup below is still safe after a close failure.
			}
		}
		const cleanupIncomplete = claim ? !removeMatchingOutputClaim(claim) : false;
		throw safeOutputWriteError(error, target.outputLabel, cleanupIncomplete);
	}

	return { outputPath: target.outputPath, outputLabel: target.outputLabel };
}

/** @param {string} name @param {string} sql */
function assertReadOnlyQuery(name, sql) {
	const normalized = sql.trim().toLowerCase();
	if (!normalized.startsWith('select ') && !normalized.startsWith('with ')) {
		throw new Error(`Source query ${name} is not read-only.`);
	}
	if (
		/\b(insert|update|delete|replace|drop|alter|create|pragma|attach|detach)\b/.test(normalized)
	) {
		throw new Error(`Source query ${name} contains a write or schema operation.`);
	}
}

function parseArgs(argv) {
	const options = {};
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === '--') continue;
		if (argument === '--help') return { help: true };
		if (argument === '--output') {
			options.output = argv[++index];
			if (!options.output) throw new Error('--output requires a path.');
			continue;
		}
		if (argument.startsWith('--output=')) {
			options.output = argument.slice('--output='.length);
			if (!options.output) throw new Error('--output requires a path.');
			continue;
		}
		if (argument === '--expected-count') {
			options.expectedQuestionCount = positiveInteger(argv[++index], '--expected-count');
			continue;
		}
		if (argument.startsWith('--expected-count=')) {
			options.expectedQuestionCount = positiveInteger(
				argument.slice('--expected-count='.length),
				'--expected-count'
			);
			continue;
		}
		if (argument.startsWith('-')) {
			throw new Error(`Unknown option: ${argument.split('=', 1)[0]}`);
		}
		throw new Error('Unexpected positional argument.');
	}
	return options;
}

/** @param {unknown} value @param {string} label */
function positiveInteger(value, label) {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`${label} must be a positive integer.`);
	}
	return parsed;
}

function printHelp() {
	console.log(`Export the clean published AQA GCSE science evidence used for challenge generation.

Usage:
  node scripts/export-science-challenge-sources.mjs [options]

Options:
  --output <path>          Absent repo-relative output (default: ${DEFAULT_OUTPUT})
  --expected-count <n>    Required question count (default: 498)
  --help                   Show this help

The exporter performs read-only QUESTION_DB queries and never writes to D1.`);
}

function invalidOutputPathError() {
	return new Error('--output must be a repo-relative file path contained by the repository root.');
}

/**
 * @param {{ repositoryRoot: string, outputPath: string, outputLabel: string }} target
 */
function ensureSafeOutputParent(target) {
	const rootStat = safeLstat(target.repositoryRoot, 'repository root');
	if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
		throw new Error('Repository root must be an existing non-symlink directory.');
	}

	const parentPath = path.dirname(target.outputPath);
	const parentRelative = path.relative(target.repositoryRoot, parentPath);
	const components = parentRelative ? parentRelative.split(path.sep) : [];
	let current = target.repositoryRoot;

	for (const component of components) {
		current = path.join(current, component);
		let stat = safeLstat(current, 'output parent');
		if (!stat) {
			try {
				mkdirSync(current);
			} catch (error) {
				if (!isFilesystemError(error, 'EEXIST')) {
					throw safeParentFilesystemError(error);
				}
			}
			stat = safeLstat(current, 'output parent');
		}
		if (!stat) throw new Error('Could not create the output parent directory.');
		if (stat.isSymbolicLink()) {
			throw new Error('Output parents must not be symbolic links.');
		}
		if (!stat.isDirectory()) {
			throw new Error('Every output parent must be a directory.');
		}
	}

	// Re-check the complete chain immediately before the exclusive file creation.
	current = target.repositoryRoot;
	for (const component of components) {
		current = path.join(current, component);
		const stat = safeLstat(current, 'output parent');
		if (!stat || stat.isSymbolicLink()) {
			throw new Error('Output parents must remain non-symlink directories.');
		}
		if (!stat.isDirectory()) throw new Error('Every output parent must be a directory.');
	}
}

/** @param {string} filePath @param {string} label */
function safeLstat(filePath, label) {
	try {
		return lstatSync(filePath);
	} catch (error) {
		if (isFilesystemError(error, 'ENOENT')) return null;
		const code = filesystemErrorCode(error);
		throw new Error(`Could not inspect the ${label}${code ? ` (${code})` : ''}.`, {
			cause: error
		});
	}
}

/** @param {unknown} error */
function safeParentFilesystemError(error) {
	const code = filesystemErrorCode(error);
	return new Error(`Could not create the output parent directory${code ? ` (${code})` : ''}.`, {
		cause: error
	});
}

/**
 * @param {{filePath: string, device: number | bigint, inode: number | bigint}} claim
 */
function removeMatchingOutputClaim(claim) {
	try {
		const metadata = safeLstat(claim.filePath, 'claimed output');
		if (!metadata) return true;
		if (
			metadata.isSymbolicLink() ||
			!metadata.isFile() ||
			metadata.dev !== claim.device ||
			metadata.ino !== claim.inode
		) {
			return false;
		}
		unlinkSync(claim.filePath);
		return true;
	} catch {
		return false;
	}
}

/** @param {unknown} error @param {string} outputLabel @param {boolean} cleanupIncomplete */
function safeOutputWriteError(error, outputLabel, cleanupIncomplete = false) {
	const cleanupSuffix = cleanupIncomplete ? ' Claimed-output cleanup was incomplete.' : '';
	if (isFilesystemError(error, 'EEXIST') || isFilesystemError(error, 'ELOOP')) {
		return new Error(
			`Output already exists or is a symbolic link; refusing to overwrite: ${outputLabel}${cleanupSuffix}`,
			{ cause: error }
		);
	}
	const code = filesystemErrorCode(error);
	return new Error(
		`Could not create output ${outputLabel}${code ? ` (${code})` : ''}.${cleanupSuffix}`,
		{ cause: error }
	);
}

/** @param {unknown} error @param {string} expected */
function isFilesystemError(error, expected) {
	return filesystemErrorCode(error) === expected;
}

/** @param {unknown} error */
function filesystemErrorCode(error) {
	return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
		? error.code
		: null;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
	try {
		const options = parseArgs(process.argv.slice(2));
		if (options.help) {
			printHelp();
		} else {
			const { outputLabel, snapshot } = await exportScienceChallengeSources(options);
			console.log(
				`Exported ${snapshot.counts.questions} clean published science questions to ${outputLabel}.`
			);
			console.log(`Canonical payload SHA-256: ${snapshot.integrity.canonicalPayloadHash}`);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
