#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { assertLearnerVisibleAssetBundleCurrent } from './lib/learner-visible-asset-binding.mjs';
import {
	assertBoundJsonInputCurrent,
	assertExactJsonArtifactsEqual,
	captureBoundJsonInput
} from './lib/phase-input-binding.mjs';

const rootDir = process.cwd();
const inputPath = stringArg('input', '');
const inputRoot = stringArg('input-root', 'data/vision-extracted');
const outputRoot = stringArg('output-root', 'tmp/import-ready-extracted');
const auditOutput = stringArg('audit-output', 'tmp/import-ready-extracted-audit.json');
const paperArg = stringArg('paper', '');
const subjectArg = stringArg('subject', 'all').toLowerCase();
const recursive = !hasArg('no-recursive');
const runSolvability = hasArg('run-solvability');
const importToD1 = hasArg('import');
const noImportCheck = hasArg('no-import-check');
const checkExisting = hasArg('check-existing');
const allowSharedChainUpdates = hasArg('allow-shared-chain-updates');
const refreshSharedChainDefinitions = hasArg('refresh-shared-chain-definitions');
const allowDroppedQuestions = hasArg('allow-dropped-questions');
const keepWarnings = hasArg('keep-warnings');
const model = stringArg('model', '');
const thinkingLevel = stringArg('thinking-level', '');
const concurrency = stringArg('concurrency', '');
const minSolvabilityScore = stringArg('min-solvability-score', '');
const runId = stringArg('run-id', '');
const expectedInputSha256 = stringArg('expected-input-sha256', '');
const expectedInputCanonicalJsonSha256 = stringArg('expected-input-canonical-json-sha256', '');
const expectedOutputSha256 = stringArg('expected-output-sha256', '');
const expectedOutputCanonicalJsonSha256 = stringArg('expected-output-canonical-json-sha256', '');
const assetManifestArg = stringArg('asset-manifest', '');
if (Boolean(expectedOutputSha256) !== Boolean(expectedOutputCanonicalJsonSha256)) {
	throw new Error('Pass both expected import-ready output hashes together.');
}
if ((expectedInputSha256 || expectedInputCanonicalJsonSha256) && !inputPath) {
	throw new Error('Exact input hashes require --input=<paper.json>.');
}
const inputBinding = inputPath
	? captureBoundJsonInput(path.resolve(rootDir, inputPath), {
			rootDir,
			expectedSha256: expectedInputSha256,
			expectedCanonicalJsonSha256: expectedInputCanonicalJsonSha256,
			label: 'Import-ready source input'
		})
	: null;
const assetManifestBinding = assetManifestArg
	? captureBoundJsonInput(path.resolve(rootDir, assetManifestArg), {
			rootDir,
			label: 'Import-ready learner asset manifest'
		})
	: null;
if (assetManifestBinding && !inputBinding) {
	throw new Error('A learner asset manifest requires --input=<paper.json>.');
}
if (assetManifestBinding) assertPaperAssetsCurrent(inputBinding.value);

if (runId) process.env.EXTRACTION_RUN_ID = runId;

clearOutputRoot();
const buildSummary = buildImportReadySubset();
auditImportReadySubset();
const outputBindings = bindImportReadyOutputs(buildSummary);
const importResults = noImportCheck ? [] : runImportChecks(buildSummary);

console.log(
	JSON.stringify(
		{
			status: 'passed',
			input: inputPath || null,
			inputRoot: inputPath ? null : relative(path.resolve(rootDir, inputRoot)),
			outputRoot: relative(path.resolve(rootDir, outputRoot)),
			auditOutput: relative(path.resolve(rootDir, auditOutput)),
			paper: paperArg || null,
			subject: subjectArg,
			recursive,
			runSolvability,
			importMode: noImportCheck ? 'none' : importToD1 ? 'write' : 'dry-run',
			checkExisting,
			allowSharedChainUpdates,
			refreshSharedChainDefinitions,
			allowDroppedQuestions,
			inputArtifact: inputBinding?.artifact ?? null,
			assetManifestArtifact: assetManifestBinding?.artifact ?? null,
			outputArtifacts: outputBindings.map((binding) => binding.artifact),
			keptQuestions: buildSummary.keptQuestions,
			droppedQuestions: buildSummary.droppedQuestions,
			importedPapers: importResults.map((result) => result.sourceDocumentId),
			importResults
		},
		null,
		2
	)
);

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function clearOutputRoot() {
	const resolvedOutputRoot = path.resolve(rootDir, outputRoot);
	const resolvedInputRoot = inputPath ? null : path.resolve(rootDir, inputRoot);
	if (resolvedOutputRoot === rootDir || resolvedOutputRoot === path.dirname(rootDir)) {
		throw new Error(`Refusing to clear unsafe output root: ${relative(resolvedOutputRoot)}`);
	}
	if (resolvedInputRoot && resolvedOutputRoot === resolvedInputRoot) {
		throw new Error('Refusing to clear output root because it is the same as input root.');
	}
	if (inputPath && resolvedOutputRoot === path.dirname(path.resolve(rootDir, inputPath))) {
		throw new Error('Refusing to clear output root because it is the input file directory.');
	}
	rmSync(resolvedOutputRoot, { recursive: true, force: true });
}

function runCapture(args, label) {
	assertBoundInputsCurrent();
	const result = spawnSync(process.execPath, args, {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
		maxBuffer: 16 * 1024 * 1024
	});
	assertBoundInputsCurrent();
	if (result.status !== 0) {
		throw new Error(`${label} failed with exit code ${result.status ?? result.signal}.`);
	}
	return result.stdout;
}

function runCapturedLog(args, label) {
	const output = runCapture(args, label);
	if (output.trim()) process.stderr.write(output);
	return output;
}

function buildImportReadySubset() {
	const args = [
		'scripts/build-import-ready-extracted-subset.mjs',
		`--output-root=${outputRoot}`,
		`--subject=${subjectArg}`
	];
	if (inputPath) args.push(`--input=${inputPath}`);
	else args.push(`--input-root=${inputRoot}`);
	if (paperArg) args.push(`--paper=${paperArg}`);
	if (!recursive) args.push('--no-recursive');
	if (keepWarnings) args.push('--keep-warnings');

	const raw = runCapture(args, 'import-ready subset build');
	const summary = JSON.parse(raw);
	if (summary.status !== 'passed') {
		throw new Error(`Import-ready subset build returned ${summary.status}.`);
	}
	if (summary.keptQuestions <= 0) {
		throw new Error('Import-ready subset contains no questions; nothing is safe to import.');
	}
	if (summary.droppedQuestions > 0 && !allowDroppedQuestions) {
		const reasonSummary = Object.entries(summary.dropReasons ?? {})
			.slice(0, 8)
			.map(([reason, count]) => `${reason}=${count}`)
			.join(', ');
		throw new Error(
			`Import-ready subset dropped ${summary.droppedQuestions} question(s). ` +
				`This is not safe for production import without --allow-dropped-questions. ` +
				(reasonSummary ? `Top reasons: ${reasonSummary}.` : '')
		);
	}
	return summary;
}

function auditImportReadySubset() {
	const resolvedOutputRoot = path.resolve(rootDir, outputRoot);
	const resolvedAuditOutput = path.resolve(rootDir, auditOutput);
	if (
		resolvedAuditOutput.startsWith(`${resolvedOutputRoot}${path.sep}`) &&
		existsSync(resolvedAuditOutput)
	) {
		rmSync(resolvedAuditOutput, { force: true });
	}
	const args = [
		'scripts/audit-extracted-question-data.mjs',
		`--input-root=${outputRoot}`,
		`--output=${auditOutput}`,
		`--subject=${subjectArg}`,
		'--fail-on-warnings'
	];
	if (!recursive) args.push('--no-recursive');
	if (paperArg) args.push(`--paper=${paperArg}`);
	if (runSolvability) {
		args.push('--run-solvability');
		if (model) args.push(`--model=${model}`);
		if (thinkingLevel) args.push(`--thinking-level=${thinkingLevel}`);
		if (concurrency) args.push(`--concurrency=${concurrency}`);
		if (minSolvabilityScore) args.push(`--min-solvability-score=${minSolvabilityScore}`);
	}
	runCapturedLog(args, 'strict import-ready audit');
}

function runImportChecks(summary) {
	const files = (summary.files ?? []).filter((file) => file.keptQuestions > 0);
	if (files.length === 0) {
		throw new Error('Import-ready subset has no paper files with kept questions.');
	}
	return files.map((file) => {
		const sourceDocumentId = file.sourceDocumentId;
		if (!sourceDocumentId)
			throw new Error(`Missing sourceDocumentId in subset file ${file.output}.`);
		const args = [
			'scripts/import-physics-vision.mjs',
			`--input-root=${outputRoot}`,
			'--recursive',
			`--paper=${sourceDocumentId}`,
			`--expected-paper-sha256=${outputArtifactFor(file).sha256}`,
			`--expected-paper-canonical-json-sha256=${outputArtifactFor(file).canonicalJsonSha256}`
		];
		if (!importToD1) args.push('--dry-run');
		if (checkExisting) args.push('--check-existing');
		if (allowSharedChainUpdates) args.push('--allow-shared-chain-updates');
		if (refreshSharedChainDefinitions) args.push('--refresh-shared-chain-definitions');
		runCapturedLog(args, `${importToD1 ? 'import' : 'import dry-run'} ${sourceDocumentId}`);
		assertBoundOutputCurrent(file);
		return {
			sourceDocumentId,
			mode: importToD1 ? 'write' : 'dry-run',
			questions: file.keptQuestions
		};
	});
}

function bindImportReadyOutputs(summary) {
	const files = (summary.files ?? []).filter((file) => file.keptQuestions > 0);
	const bindings = files.map((file) => {
		const binding = captureBoundJsonInput(resolveOutputPath(file), {
			rootDir,
			label: `Import-ready output ${file.sourceDocumentId ?? file.output}`
		});
		chmodSync(binding.path, 0o444);
		assertPaperAssetsCurrent(binding.value);
		return { ...binding, sourceDocumentId: file.sourceDocumentId, output: file.output };
	});
	if (expectedOutputSha256 || expectedOutputCanonicalJsonSha256) {
		if (bindings.length !== 1) {
			throw new Error(
				'Exact expected import-ready output hashes require exactly one output paper.'
			);
		}
		const [binding] = bindings;
		const expected = {
			sha256: expectedOutputSha256,
			canonicalJsonSha256: expectedOutputCanonicalJsonSha256
		};
		assertExactJsonArtifactsEqual(expected, binding.artifact, 'Import-ready output');
	}
	assertBoundInputsCurrent();
	return bindings;
}

function outputArtifactFor(file) {
	const binding = outputBindings.find(
		(candidate) =>
			candidate.sourceDocumentId === file.sourceDocumentId && candidate.output === file.output
	);
	if (!binding) throw new Error(`No bound output artifact exists for ${file.output}.`);
	return binding.artifact;
}

function assertBoundOutputCurrent(file) {
	const binding = outputBindings.find(
		(candidate) =>
			candidate.sourceDocumentId === file.sourceDocumentId && candidate.output === file.output
	);
	if (!binding) throw new Error(`No bound output artifact exists for ${file.output}.`);
	assertBoundJsonInputCurrent(binding, {
		label: `Import-ready output ${file.sourceDocumentId ?? file.output}`
	});
	assertPaperAssetsCurrent(binding.value);
}

function assertBoundInputsCurrent() {
	if (inputBinding) {
		assertBoundJsonInputCurrent(inputBinding, { label: 'Import-ready source input' });
	}
	if (assetManifestBinding) {
		assertBoundJsonInputCurrent(assetManifestBinding, {
			label: 'Import-ready learner asset manifest'
		});
		assertPaperAssetsCurrent(inputBinding.value);
	}
}

function assertPaperAssetsCurrent(paper) {
	if (!assetManifestBinding) return;
	assertLearnerVisibleAssetBundleCurrent({
		paper,
		manifest: assetManifestBinding.value,
		rootDir
	});
}

function resolveOutputPath(file) {
	const value = String(file?.output ?? '');
	if (!value) throw new Error('Import-ready subset output record is missing its path.');
	return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}
