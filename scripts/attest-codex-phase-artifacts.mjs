#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	CODEX_PHASE_ARTIFACT_SCHEMA,
	binaryArtifact,
	canonicalJsonSha256,
	jsonArtifact,
	phaseArtifacts,
	withoutLocalArtifactPaths
} from './lib/codex-phase-artifacts.mjs';

const rootDir = process.cwd();
const workRoot = path.resolve(rootDir, requiredStringArg('work-root'));
const write = process.argv.includes('--write');
const selectedPhase = optionalStringArg('phase', 'all');
invariant(
	['all', 'extraction', 'extraction-judge', 'answer-chains'].includes(selectedPhase),
	'--phase must be all, extraction, extraction-judge, or answer-chains.'
);
const rawDir = path.join(workRoot, 'raw');
const rawFiles = existsSync(rawDir)
	? readdirSync(rawDir).filter((name) => name.endsWith('.json'))
	: [];
invariant(rawFiles.length === 1, 'Expected exactly one raw paper JSON in the work root.');

const rawPath = path.join(rawDir, rawFiles[0]);
const sourceDocumentId = path.basename(rawFiles[0], '.json');
const actions = [];

if (selectedPhase === 'all' || selectedPhase === 'extraction') attestExtraction();
if (selectedPhase === 'all' || selectedPhase === 'extraction-judge') attestExtractionJudge();
if (selectedPhase === 'all' || selectedPhase === 'answer-chains') attestChains();

console.log(
	JSON.stringify(
		{
			status: write ? 'written' : 'dry-run',
			schemaVersion: CODEX_PHASE_ARTIFACT_SCHEMA,
			sourceDocumentId,
			workRoot: relative(workRoot),
			actions
		},
		null,
		2
	)
);

function attestExtraction() {
	const summaryPath = path.join(workRoot, 'codex-extraction-summary.json');
	const summary = readJson(summaryPath);
	const normalizedPath = path.join(workRoot, 'codex-extraction', 'normalized-extraction.json');
	assertPassedCodexSummary(summary, 'extraction');
	assertSameJson(
		rawPath,
		normalizedPath,
		'Raw extraction differs from its preserved normalized output.'
	);
	const questionPaperPath = resolvePlanPath(summary.plan?.questionPaperPath);
	const markSchemePath = resolvePlanPath(summary.plan?.markSchemePath);
	const supportingDocumentPaths = (summary.plan?.supportingDocumentPaths ?? []).map(
		resolvePlanPath
	);
	const next = {
		...summary,
		phaseArtifacts: phaseArtifacts({
			inputs: {
				questionPaper: binaryArtifact(questionPaperPath, { rootDir }),
				markScheme: binaryArtifact(markSchemePath, { rootDir }),
				supportingDocuments: supportingDocumentPaths.map((filePath) =>
					binaryArtifact(filePath, { rootDir })
				)
			},
			outputs: { extraction: jsonArtifact(rawPath, { rootDir }) },
			attestation: preservedSnapshotAttestation({
				normalizedExtraction: jsonArtifact(normalizedPath, { rootDir })
			})
		})
	};
	writeSummary(summaryPath, next, 'extraction');
}

function attestExtractionJudge() {
	const summaryPath = path.join(workRoot, 'codex-extraction-judge-summary.json');
	const summary = readJson(summaryPath);
	const candidateSnapshotPath = path.join(workRoot, 'extraction-judge', 'candidate.json');
	const reportPath = path.join(workRoot, 'extraction-judge', 'judge-report.json');
	assertPassedCodexSummary(summary, 'independent extraction judge');
	invariant(
		summary.judgeReport?.status === 'passed',
		'Judge report is not an ordinary model pass.'
	);
	invariant(
		canonicalJsonSha256(withoutLocalArtifactPaths(readJson(rawPath))) ===
			canonicalJsonSha256(withoutLocalArtifactPaths(readJson(candidateSnapshotPath))),
		'Judge candidate snapshot differs from the raw paper beyond deterministic local asset paths.'
	);
	invariant(
		canonicalJsonSha256(summary.judgeReport) === canonicalJsonSha256(readJson(reportPath)),
		'Embedded judge report differs from the preserved report artifact.'
	);
	const questionPaperPath = resolvePlanPath(summary.plan?.questionPaperPath);
	const markSchemePath = resolvePlanPath(summary.plan?.markSchemePath);
	const next = {
		...summary,
		phaseArtifacts: phaseArtifacts({
			inputs: {
				candidate: jsonArtifact(rawPath, { rootDir }),
				judgeCandidateSnapshot: jsonArtifact(candidateSnapshotPath, { rootDir }),
				questionPaper: binaryArtifact(questionPaperPath, { rootDir }),
				markScheme: binaryArtifact(markSchemePath, { rootDir })
			},
			outputs: { report: jsonArtifact(reportPath, { rootDir }) },
			attestation: preservedSnapshotAttestation({
				candidateProjectionCanonicalJsonSha256: canonicalJsonSha256(
					withoutLocalArtifactPaths(readJson(rawPath))
				)
			})
		})
	};
	writeSummary(summaryPath, next, 'independent extraction judge');
}

function attestChains() {
	const summaryPath = path.join(workRoot, 'codex-chain-summary.json');
	const summary = readJson(summaryPath);
	const inputSnapshotPath = path.join(workRoot, 'codex-chains', 'extraction.json');
	const outputSnapshotPath = path.join(workRoot, 'codex-chains', 'chain-reconciled.json');
	const outputPath = path.join(workRoot, 'chain-reconciled', `${sourceDocumentId}.json`);
	const existingContextPath = path.join(workRoot, 'codex-chains', 'existing-chain-context.json');
	assertPassedCodexSummary(summary, 'answer chains');
	invariant(summary.validation?.status === 'passed', 'Answer-chain validation did not pass.');
	assertSameJson(
		rawPath,
		inputSnapshotPath,
		'Chain input snapshot differs from the raw extraction.'
	);
	assertSameJson(
		outputPath,
		outputSnapshotPath,
		'Chain output differs from its preserved snapshot.'
	);
	const next = {
		...summary,
		phaseArtifacts: phaseArtifacts({
			inputs: {
				extraction: jsonArtifact(rawPath, { rootDir }),
				existingChainContext: existsSync(existingContextPath)
					? jsonArtifact(existingContextPath, { rootDir })
					: null
			},
			outputs: { reconciled: jsonArtifact(outputPath, { rootDir }) },
			attestation: preservedSnapshotAttestation({
				inputSnapshot: jsonArtifact(inputSnapshotPath, { rootDir }),
				outputSnapshot: jsonArtifact(outputSnapshotPath, { rootDir })
			})
		})
	};
	writeSummary(summaryPath, next, 'answer chains');
}

function preservedSnapshotAttestation(evidence) {
	return {
		mode: 'preserved-exact-phase-snapshots-v1',
		attestedAt: new Date().toISOString(),
		...evidence
	};
}

function assertPassedCodexSummary(summary, label) {
	invariant(summary?.status === 'passed', `${label} summary did not pass.`);
	invariant(
		summary?.codex?.status === 'passed' && summary.codex.threadId && summary.codex.model,
		`${label} summary lacks a passed Codex run identity.`
	);
}

function assertSameJson(leftPath, rightPath, message) {
	invariant(
		canonicalJsonSha256(readJson(leftPath)) === canonicalJsonSha256(readJson(rightPath)),
		message
	);
}

function writeSummary(filePath, value, phase) {
	if (write) writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
	actions.push({ phase, summary: relative(filePath), written: write });
}

function resolvePlanPath(value) {
	invariant(typeof value === 'string' && value, 'Phase summary has a missing source path.');
	const resolved = path.resolve(rootDir, value);
	invariant(existsSync(resolved), `Phase source artifact is missing: ${relative(resolved)}`);
	return resolved;
}

function readJson(filePath) {
	invariant(existsSync(filePath), `Required artifact is missing: ${relative(filePath)}`);
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function relative(filePath) {
	return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

function invariant(condition, message) {
	if (!condition) throw new Error(message);
}

function requiredStringArg(name) {
	const prefix = `--${name}=`;
	const value = process.argv
		.find((entry) => entry.startsWith(prefix))
		?.slice(prefix.length)
		.trim();
	if (!value) throw new Error(`Missing required ${prefix}<value>`);
	return value;
}

function optionalStringArg(name, fallback) {
	const prefix = `--${name}=`;
	return (
		process.argv
			.find((entry) => entry.startsWith(prefix))
			?.slice(prefix.length)
			.trim() ?? fallback
	);
}
