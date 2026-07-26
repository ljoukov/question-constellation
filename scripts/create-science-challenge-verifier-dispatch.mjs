#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalHash, stableStringify } from './lib/science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER,
	SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_COUNT,
	SCIENCE_CHALLENGE_VERIFIER_COUNT,
	validateScienceChallengeVerifierDispatchLedger
} from './lib/science-challenge-verifier-dispatch.mjs';

const ASSIGNMENT_INDEX_SCHEMA = 'science-challenge-verification-assignment-index/v1';
const DISPATCH_LEDGER_SCHEMA = 'science-challenge-verifier-dispatch-ledger/v1';
const ORCHESTRATOR = 'codex-collaboration';
const REVIEW_MODEL = 'gpt-5.6-sol';
const REVIEW_REASONING_EFFORT = 'max';
const CANONICAL_TASK_NAME_PATTERN = /^\/root\/[a-z0-9_]+(?:\/[a-z0-9_]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

try {
	main(process.argv.slice(2));
} catch (error) {
	console.error(
		`Science challenge verifier dispatch creation failed: ${
			error instanceof Error ? error.message : String(error)
		}`
	);
	process.exitCode = 1;
}

function main(argv) {
	const args = parseArgs(argv);
	if (args.help) {
		console.log(usage());
		return;
	}

	const rootDir = process.cwd();
	const indexPath = path.resolve(rootDir, args.index);
	const outputPath = path.resolve(rootDir, args.output);
	const assignmentIndex = readAssignmentIndex(indexPath);
	validateAssignmentIndex(assignmentIndex);
	const verifiers = parseVerifiers(args.verifiers);
	const ledger = buildLedger(assignmentIndex, verifiers, args.createdAt);
	validateLedgerOrder(ledger, assignmentIndex, verifiers);

	const validation = validateScienceChallengeVerifierDispatchLedger(ledger, assignmentIndex);
	if (validation.status !== 'passed') {
		throw new Error(`generated ledger is invalid:\n- ${validation.issues.join('\n- ')}`);
	}
	if (existsSync(outputPath)) {
		throw new Error(`refusing to overwrite the frozen dispatch ledger: ${outputPath}`);
	}

	mkdirSync(path.dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, `${stableStringify(ledger)}\n`, { flag: 'wx' });

	console.log(
		JSON.stringify(
			{
				status: 'passed',
				indexPath: path.relative(rootDir, indexPath),
				indexSha256: ledger.indexSha256,
				outputPath: path.relative(rootDir, outputPath),
				dispatchLedgerSha256: canonicalHash(ledger),
				dispatchCount: ledger.dispatches.length,
				allocations: verifiers.map((verifier, index) => {
					const first = index * SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER;
					const last = first + SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER - 1;
					return {
						taskName: verifier,
						assignmentCount: SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER,
						firstAssignmentId: assignmentIndex.assignments[first].assignmentId,
						lastAssignmentId: assignmentIndex.assignments[last].assignmentId
					};
				})
			},
			null,
			2
		)
	);
}

function buildLedger(assignmentIndex, verifiers, createdAt) {
	return {
		schemaVersion: DISPATCH_LEDGER_SCHEMA,
		orchestrator: ORCHESTRATOR,
		indexSha256: canonicalHash(assignmentIndex),
		createdAt,
		dispatches: assignmentIndex.assignments.map((assignment, index) => {
			const taskName = verifiers[Math.floor(index / SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER)];
			return {
				assignmentId: assignment.assignmentId,
				assignmentPath: assignment.path,
				assignmentSha256: assignment.sha256,
				orchestrator: ORCHESTRATOR,
				taskName,
				forkTurns: 'none',
				model: REVIEW_MODEL,
				reasoningEffort: REVIEW_REASONING_EFFORT
			};
		})
	};
}

function readAssignmentIndex(indexPath) {
	if (!existsSync(indexPath)) throw new Error(`assignment index does not exist: ${indexPath}`);
	try {
		return JSON.parse(readFileSync(indexPath, 'utf8'));
	} catch (error) {
		throw new Error(
			`assignment index is not valid JSON: ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error }
		);
	}
}

function validateAssignmentIndex(index) {
	if (index?.schemaVersion !== ASSIGNMENT_INDEX_SCHEMA) {
		throw new Error(`assignment index schemaVersion must be ${ASSIGNMENT_INDEX_SCHEMA}`);
	}
	if (
		!Array.isArray(index.assignments) ||
		index.assignments.length !== SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_COUNT
	) {
		throw new Error(
			`assignment index must contain exactly ${SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_COUNT} assignments`
		);
	}

	const paths = new Set();
	const challengeIds = new Set();
	for (const [indexPosition, assignment] of index.assignments.entries()) {
		const expectedAssignmentId = `science-${String(indexPosition + 1).padStart(3, '0')}`;
		if (assignment?.assignmentId !== expectedAssignmentId) {
			throw new Error(
				`assignment index order must be science-001 through science-051; position ${
					indexPosition + 1
				} contains ${String(assignment?.assignmentId)}`
			);
		}
		if (
			typeof assignment.path !== 'string' ||
			!assignment.path ||
			assignment.path !== assignment.path.trim() ||
			path.isAbsolute(assignment.path) ||
			assignment.path.includes('\0') ||
			paths.has(assignment.path)
		) {
			throw new Error(`${expectedAssignmentId} has an invalid or duplicate relative path`);
		}
		paths.add(assignment.path);
		if (!SHA256_PATTERN.test(String(assignment.sha256 ?? ''))) {
			throw new Error(`${expectedAssignmentId} has an invalid assignment SHA-256`);
		}
		if (!Array.isArray(assignment.ids) || assignment.ids.length !== 8) {
			throw new Error(`${expectedAssignmentId} must bind exactly 8 challenge ids`);
		}
		for (const challengeId of assignment.ids) {
			if (
				typeof challengeId !== 'string' ||
				!challengeId ||
				challengeId !== challengeId.trim() ||
				challengeIds.has(challengeId)
			) {
				throw new Error(`${expectedAssignmentId} has an invalid or duplicate challenge id`);
			}
			challengeIds.add(challengeId);
		}
	}
}

function parseVerifiers(values) {
	if (values.length !== SCIENCE_CHALLENGE_VERIFIER_COUNT) {
		throw new Error(
			`exactly ${SCIENCE_CHALLENGE_VERIFIER_COUNT} --verifier arguments are required`
		);
	}

	const verifiers = values.map((taskName, index) => {
		if (!CANONICAL_TASK_NAME_PATTERN.test(taskName)) {
			throw new Error(`--verifier ${index + 1} task name must be a canonical /root/... task name`);
		}
		return taskName;
	});

	if (new Set(verifiers).size !== verifiers.length) {
		throw new Error('verifier canonical task names must be unique');
	}
	return verifiers;
}

function validateLedgerOrder(ledger, assignmentIndex, verifiers) {
	for (const [index, dispatch] of ledger.dispatches.entries()) {
		const assignment = assignmentIndex.assignments[index];
		const expectedTaskName =
			verifiers[Math.floor(index / SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER)];
		if (
			dispatch.assignmentId !== assignment.assignmentId ||
			dispatch.assignmentPath !== assignment.path ||
			dispatch.assignmentSha256 !== assignment.sha256 ||
			dispatch.taskName !== expectedTaskName
		) {
			throw new Error(`dispatch ${index + 1} does not preserve deterministic index order`);
		}
	}
}

function parseArgs(argv) {
	const values = new Map();
	const verifiers = [];
	for (const arg of argv) {
		if (arg === '--') continue;
		if (arg === '--help' || arg === '-h') {
			if (values.has('help')) throw new Error('--help may be supplied only once');
			values.set('help', true);
			continue;
		}
		if (arg.startsWith('--verifier=')) {
			verifiers.push(arg.slice('--verifier='.length));
			continue;
		}
		if (arg.startsWith('--') && arg.includes('=')) {
			const [key, ...rest] = arg.slice(2).split('=');
			if (!['created-at', 'index', 'output'].includes(key)) {
				throw new Error(`unknown option --${key}`);
			}
			if (values.has(key)) throw new Error(`--${key} may be supplied only once`);
			values.set(key, rest.join('='));
			continue;
		}
		throw new Error(`unknown argument ${arg}`);
	}

	if (values.get('help')) {
		if (values.size !== 1 || verifiers.length > 0) {
			throw new Error('--help cannot be combined with ledger creation options');
		}
		return { help: true, verifiers: [] };
	}
	for (const required of ['created-at', 'index', 'output']) {
		if (!values.get(required)) throw new Error(`--${required}=<value> is required`);
	}
	const createdAt = values.get('created-at');
	if (Number.isNaN(Date.parse(createdAt)) || new Date(createdAt).toISOString() !== createdAt) {
		throw new Error(
			'--created-at must be a canonical ISO date-time such as 2026-07-23T00:00:00.000Z'
		);
	}

	return {
		help: false,
		createdAt,
		index: values.get('index'),
		output: values.get('output'),
		verifiers
	};
}

function usage() {
	return [
		'Usage: node scripts/create-science-challenge-verifier-dispatch.mjs [options]',
		'',
		'--index=<assignment-index.json>       Required; must contain science-001 through science-051',
		'--output=<dispatch-ledger.json>        Required; existing files are never overwritten',
		'--created-at=<canonical ISO datetime>  Required; for example 2026-07-23T00:00:00.000Z',
		'--verifier=/root/<canonical-task>      Repeat exactly 3 times in 1-17, 18-34, 35-51 order',
		'--help'
	].join('\n');
}
