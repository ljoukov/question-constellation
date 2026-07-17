#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const manifestPath = requiredPath(
	'manifest',
	'tmp/current-model-paper-cohort/patched-resume-manifest.json'
);
const workRoot = requiredPath('work-root', 'tmp/current-model-paper-cohort/runs');
const sourceSummaryPaths = repeatedPaths('source-summary');
const outputPath = path.resolve(
	rootDir,
	stringArg('output', 'tmp/current-model-paper-cohort/patched-resume-summary.json')
);
const allowIncomplete = process.argv.includes('--allow-incomplete');

const manifest = readJson(manifestPath);
const rows = manifest.rows ?? [];
if (rows.length !== 15 || new Set(rows.map(sourceDocumentId)).size !== 15) {
	throw new Error(`Expected 15 unique remaining cohort rows; found ${rows.length}.`);
}

const sources = sourceSummaryPaths.map((filePath) => {
	const value = readJson(filePath);
	return {
		path: relative(filePath),
		sha256: fileSha256(filePath),
		status: value.status ?? null,
		selected: value.selected ?? null,
		passed: value.passed ?? null,
		failed: value.failed ?? null
	};
});
const results = rows.map((row) => {
	const id = sourceDocumentId(row);
	const summaryPath = path.join(workRoot, id, 'codex-production-import-summary.json');
	const summary = existsSync(summaryPath) ? readJson(summaryPath) : null;
	return {
		sourceDocumentId: id,
		status: summary?.status === 'passed' ? 'passed' : 'failed',
		error:
			summary?.status === 'passed' ? null : (summary?.error ?? 'missing terminal passed summary'),
		pipelineSummary: existsSync(summaryPath)
			? { path: relative(summaryPath), sha256: fileSha256(summaryPath) }
			: null,
		finishedAt: summary?.finishedAt ?? null
	};
});
const passed = results.filter((result) => result.status === 'passed').length;
const output = {
	schemaVersion: 'selective-paper-cohort-merged-resume-summary-v1',
	status: passed === rows.length ? 'passed' : 'incomplete',
	generatedAt: new Date().toISOString(),
	manifest: relative(manifestPath),
	manifestSha256: fileSha256(manifestPath),
	workRoot: relative(workRoot),
	selected: rows.length,
	passed,
	failed: rows.length - passed,
	sources,
	results
};

if (!allowIncomplete && output.status !== 'passed') {
	throw new Error(
		`Merged resume evidence is incomplete: ${results
			.filter((result) => result.status !== 'passed')
			.map((result) => result.sourceDocumentId)
			.join(', ')}`
	);
}
writeJson(outputPath, output);
console.log(
	JSON.stringify(
		{
			status: output.status,
			output: relative(outputPath),
			selected: output.selected,
			passed: output.passed,
			failed: output.failed
		},
		null,
		2
	)
);

function sourceDocumentId(row) {
	if (row?.source_document_id || row?.sourceDocumentId) {
		return String(row.source_document_id ?? row.sourceDocumentId).trim();
	}
	const board = slugPart(row?.board ?? manifest.board ?? 'source');
	const spec = slugPart(row?.spec_code ?? manifest.spec_code ?? row?.unit_code ?? row?.component);
	const unit = slugPart(row?.unit_code ?? row?.component ?? row?.paper);
	const series = slugPart(row?.series_code ?? row?.series ?? row?.year);
	const componentParts = unit.startsWith(spec) ? [unit] : [spec, unit];
	return [board, ...componentParts, 'qp', series].filter(Boolean).join('-');
}

function slugPart(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function fileSha256(filePath) {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function stringArg(name, fallback = '') {
	const prefix = `--${name}=`;
	const argument = process.argv.find((candidate) => candidate.startsWith(prefix));
	return argument ? argument.slice(prefix.length) : fallback;
}

function requiredPath(name, fallback) {
	const value = stringArg(name, fallback);
	const filePath = path.resolve(rootDir, value);
	if (!existsSync(filePath)) throw new Error(`Missing --${name}: ${relative(filePath)}.`);
	return filePath;
}

function repeatedPaths(name) {
	const prefix = `--${name}=`;
	return process.argv
		.filter((argument) => argument.startsWith(prefix))
		.map((argument) => path.resolve(rootDir, argument.slice(prefix.length)))
		.filter(existsSync);
}
