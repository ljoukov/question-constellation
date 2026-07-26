#!/usr/bin/env node

import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import { canonicalHash, stableStringify } from './lib/science-challenge-release.mjs';
import { buildScienceChallengeVerifierPacketBundle } from './lib/science-challenge-verifier-packets.mjs';

try {
	main(process.argv.slice(2));
} catch (error) {
	console.error(
		`Science challenge verifier packet creation failed: ${
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
	const dispatchLedgerPath = path.resolve(rootDir, args.dispatchLedger);
	const outputRoot = path.resolve(rootDir, args.outputRoot);
	const reviewRoot = path.resolve(rootDir, args.reviewRoot);
	assertWithin(rootDir, indexPath, 'assignment index');
	assertWithin(rootDir, dispatchLedgerPath, 'dispatch ledger');

	if (!existsSync(dispatchLedgerPath)) {
		throw new Error(
			`frozen dispatch ledger does not exist; refusing to emit verifier evidence: ${dispatchLedgerPath}`
		);
	}
	if (!existsSync(indexPath)) throw new Error(`assignment index does not exist: ${indexPath}`);

	const verificationRoot = path.dirname(indexPath);
	if (path.dirname(dispatchLedgerPath) !== verificationRoot) {
		throw new Error('assignment index and frozen dispatch ledger must share one verification root');
	}
	assertWithin(verificationRoot, outputRoot, 'packet output root');
	assertWithin(verificationRoot, reviewRoot, 'review root');
	if (outputRoot === verificationRoot || reviewRoot === verificationRoot) {
		throw new Error('packet output and review roots must be descendants of the verification root');
	}

	const assignmentIndex = readJson(indexPath, 'assignment index');
	const dispatchLedger = readJson(dispatchLedgerPath, 'frozen dispatch ledger');
	const bundle = buildScienceChallengeVerifierPacketBundle({
		assignmentIndex,
		dispatchLedger,
		assignmentIndexPath: path.relative(rootDir, indexPath),
		dispatchLedgerPath: path.relative(rootDir, dispatchLedgerPath),
		packetRootPath: path.relative(rootDir, outputRoot),
		reviewRootPath: path.relative(rootDir, reviewRoot)
	});

	if (existsSync(outputRoot)) {
		throw new Error(`refusing to overwrite verifier packet output: ${outputRoot}`);
	}

	const outputParent = path.dirname(outputRoot);
	mkdirSync(outputParent, { recursive: true });
	let stagingRoot = mkdtempSync(path.join(outputParent, '.verifier-packets-staging-'));
	try {
		for (const artifact of bundle.artifacts) {
			writeJson(path.join(stagingRoot, artifact.relativePath), artifact.value);
		}
		writeJson(path.join(stagingRoot, 'manifest.json'), bundle.manifest);
		renameSync(stagingRoot, outputRoot);
		stagingRoot = '';
	} finally {
		if (stagingRoot && existsSync(stagingRoot)) {
			rmSync(stagingRoot, { recursive: true, force: true });
		}
	}

	const report = {
		status: 'passed',
		assignmentIndexPath: path.relative(rootDir, indexPath),
		assignmentIndexSha256: bundle.manifest.assignmentIndexSha256,
		dispatchLedgerPath: path.relative(rootDir, dispatchLedgerPath),
		dispatchLedgerSha256: bundle.manifest.dispatchLedgerSha256,
		outputRoot: path.relative(rootDir, outputRoot),
		manifestPath: path.relative(rootDir, path.join(outputRoot, 'manifest.json')),
		manifestSha256: canonicalHash(bundle.manifest),
		packetCount: bundle.manifest.packetCount,
		waveCount: bundle.manifest.waveCount,
		usage:
			'For wave 01 through 17, load the matching verifier-NN/wave-NN.json and pass its exact target and message fields to followup_task. Send at most one payload per verifier, wait for that assignment result, then advance that verifier to its next wave.',
		allocations: bundle.manifest.packets
	};
	console.log(JSON.stringify(report, null, 2));
}

function readJson(filePath, label) {
	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch (error) {
		throw new Error(
			`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`, { flag: 'wx' });
}

function assertWithin(parentPath, childPath, label) {
	const relativePath = path.relative(parentPath, childPath);
	if (!relativePath || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
		throw new Error(`${label} must be strictly inside ${parentPath}`);
	}
}

function parseArgs(argv) {
	const values = new Map();
	for (const arg of argv) {
		if (arg === '--') continue;
		if (arg === '--help' || arg === '-h') {
			if (values.has('help')) throw new Error('--help may be supplied only once');
			values.set('help', true);
			continue;
		}
		if (arg.startsWith('--') && arg.includes('=')) {
			const [key, ...rest] = arg.slice(2).split('=');
			if (!['index', 'dispatch-ledger', 'output-root', 'review-root'].includes(key)) {
				throw new Error(`unknown option --${key}`);
			}
			if (values.has(key)) throw new Error(`--${key} may be supplied only once`);
			const value = rest.join('=');
			if (!value) throw new Error(`--${key}=<value> may not be empty`);
			values.set(key, value);
			continue;
		}
		throw new Error(`unknown argument ${arg}`);
	}

	if (values.get('help')) {
		if (values.size !== 1) throw new Error('--help cannot be combined with packet options');
		return { help: true };
	}
	return {
		help: false,
		index: String(
			values.get('index') ??
				'tmp/science-challenges/science-500-v1/verification/assignment-index.json'
		),
		dispatchLedger: String(
			values.get('dispatch-ledger') ??
				'tmp/science-challenges/science-500-v1/verification/dispatch-ledger.json'
		),
		outputRoot: String(
			values.get('output-root') ??
				'tmp/science-challenges/science-500-v1/verification/verifier-packets'
		),
		reviewRoot: String(
			values.get('review-root') ?? 'tmp/science-challenges/science-500-v1/verification/reviews'
		)
	};
}

function usage() {
	return [
		'Usage: node scripts/create-science-challenge-verifier-packets.mjs [options]',
		'',
		'Requires a complete, frozen and validated dispatch ledger. Reads only the assignment index',
		'and ledger; it does not open assignment/candidate evidence or invoke verifier agents.',
		'',
		'--index=<assignment-index.json>',
		'--dispatch-ledger=<dispatch-ledger.json>',
		'--output-root=<new verifier-packets directory>',
		'--review-root=<review-result directory>',
		'--help'
	].join('\n');
}
