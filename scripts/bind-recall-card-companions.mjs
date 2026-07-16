#!/usr/bin/env node

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
	hashRecallArtifact,
	sha256,
	stableStringify,
	validateRecallCardBundle
} from './lib/recall-card-bundle.mjs';
import {
	buildRecallCompanionArtifactsFromDurableDirectory,
	verifyRecallCompanionArtifactFiles
} from './lib/recall-card-artifacts.mjs';
import { resolveRecallAcceptedArtifactPath } from './lib/recall-generation-paths.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}

const inputPath = path.resolve(rootDir, args.input);
const artifactDir = path.dirname(inputPath);
const bundle = JSON.parse(readFileSync(inputPath, 'utf8'));
const runId = String(bundle.run?.id ?? '');
const expectedPath = resolveRecallAcceptedArtifactPath({ rootDir, runId });
if (inputPath !== expectedPath) {
	throw new Error(
		`Companion binding accepts only ${path.relative(rootDir, expectedPath)} for run ${runId}.`
	);
}
if (!/^recall-card-compiler-v(?:[7-9]|\d{2,})$/.test(String(bundle.promptVersion ?? ''))) {
	throw new Error('Companion binding is supported only for compiler-v7 or newer bundles.');
}
if (typeof bundle.run?.cueReviewer?.replacementReviewRun !== 'boolean') {
	throw new Error('run.cueReviewer.replacementReviewRun must be boolean before companion binding.');
}

const manifestPath = path.join(artifactDir, 'recall-generation-run.json');
if (!existsSync(manifestPath)) {
	throw new Error('Durable recall run is incomplete; missing: recall-generation-run.json');
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const replacementReviewRun = bundle.run.cueReviewer.replacementReviewRun;
const replacementCount = Number(manifest.counts?.cueReplacementsReviewed ?? 0);
if (
	manifest.status !== 'accepted' ||
	stableStringify(manifest.run) !== stableStringify(bundle.run) ||
	!Number.isInteger(replacementCount) ||
	replacementCount < 0 ||
	replacementCount > 0 !== replacementReviewRun
) {
	throw new Error('Durable recall run manifest does not match the completed compiler run.');
}

const companionArtifacts = buildRecallCompanionArtifactsFromDurableDirectory(artifactDir, {
	replacementReviewRun
});
if (bundle.companionArtifacts) {
	if (stableStringify(bundle.companionArtifacts) !== stableStringify(companionArtifacts)) {
		throw new Error(
			'This accepted bundle already has a different companion identity; refusing to replace it.'
		);
	}
	validateRecallCardBundle(bundle);
	verifyRecallCompanionArtifactFiles(artifactDir, bundle.companionArtifacts, {
		replacementReviewRun
	});
	const currentArtifactHash = hashRecallArtifact(bundle);
	if (manifest.acceptedArtifactHash !== currentArtifactHash) {
		throw new Error('Bound run manifest does not match the accepted artifact.');
	}
	emitReport({
		status: 'already_bound',
		inputPath,
		runId,
		replacementReviewRun,
		previousArtifactHash: currentArtifactHash,
		acceptedArtifactHash: currentArtifactHash,
		companionArtifacts
	});
	process.exit(0);
}

const previousArtifactHash = sha256(stableStringify(bundle));
if (manifest.acceptedArtifactHash !== previousArtifactHash) {
	throw new Error('Existing run manifest does not match the pre-binding accepted artifact.');
}

const boundBundle = { ...bundle, companionArtifacts };
validateRecallCardBundle(boundBundle);
verifyRecallCompanionArtifactFiles(artifactDir, companionArtifacts, { replacementReviewRun });
const acceptedArtifactHash = hashRecallArtifact(boundBundle);
const boundManifest = {
	...manifest,
	acceptedArtifactHash,
	companionArtifactSchemaVersion: companionArtifacts.schemaVersion,
	companionArtifactCount: Object.keys(companionArtifacts.sha256ByFile).length
};

if (args.write) {
	writeJsonAtomic(inputPath, boundBundle);
	writeJsonAtomic(manifestPath, boundManifest);
	const storedBundle = validateRecallCardBundle(JSON.parse(readFileSync(inputPath, 'utf8')));
	const storedManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	verifyRecallCompanionArtifactFiles(artifactDir, storedBundle.companionArtifacts, {
		replacementReviewRun
	});
	if (
		hashRecallArtifact(storedBundle) !== acceptedArtifactHash ||
		storedManifest.acceptedArtifactHash !== acceptedArtifactHash
	) {
		throw new Error('Post-write companion binding verification failed.');
	}
}

emitReport({
	status: args.write ? 'bound' : 'dry_run',
	inputPath,
	runId,
	replacementReviewRun,
	previousArtifactHash,
	acceptedArtifactHash,
	companionArtifacts
});

function parseArgs(argv) {
	const value = (name, fallback = null) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
	return {
		help: argv.includes('--help') || argv.includes('-h'),
		input: value('input', 'tmp/recall-generation/latest/accepted-cards.json'),
		write: argv.includes('--write')
	};
}

function usage() {
	return `Usage:
node scripts/bind-recall-card-companions.mjs --input=<accepted-cards.json>

The default is read-only. It verifies the completed run and prints the new
artifact identity. Add --write to bind the exact durable companion bytes into
an unbound compiler-v7-or-newer accepted bundle and refresh its run manifest.`;
}

function writeJsonAtomic(filePath, value) {
	const temporaryPath = path.join(
		path.dirname(filePath),
		`.${path.basename(filePath)}.${process.pid}.tmp`
	);
	writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
	renameSync(temporaryPath, filePath);
}

function emitReport({
	status,
	inputPath,
	runId,
	replacementReviewRun,
	previousArtifactHash,
	acceptedArtifactHash,
	companionArtifacts
}) {
	console.log(
		JSON.stringify(
			{
				status,
				input: path.relative(rootDir, inputPath),
				runId,
				replacementReviewRun,
				previousArtifactHash,
				acceptedArtifactHash,
				companionArtifactSchemaVersion: companionArtifacts.schemaVersion,
				companionArtifactCount: Object.keys(companionArtifacts.sha256ByFile).length
			},
			null,
			2
		)
	);
}
