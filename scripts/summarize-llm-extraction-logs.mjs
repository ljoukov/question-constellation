#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

function argValue(name, fallback = null) {
	const prefix = `--${name}=`;
	const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
	return match ? match.slice(prefix.length) : fallback;
}

function fail(message) {
	console.error(JSON.stringify({ status: 'failed', message }, null, 2));
	process.exit(1);
}

const logDir = path.resolve(rootDir, argValue('log-dir', 'tmp/llm-extraction-logs'));
const since = argValue('since', null);
const runIdFilter = argValue('run-id', null);
if (!existsSync(logDir)) fail(`Log directory does not exist: ${path.relative(rootDir, logDir)}`);

function jsonlFiles(dir) {
	return readdirSync(dir)
		.filter((fileName) => fileName.endsWith('.jsonl'))
		.sort()
		.map((fileName) => path.join(dir, fileName));
}

function addUsage(target, usage = null) {
	if (!usage) return;
	for (const [key, value] of Object.entries(usage)) {
		if (typeof value !== 'number' || !Number.isFinite(value)) continue;
		target[key] = (target[key] ?? 0) + value;
	}
}

function emptyBucket() {
	return {
		calls: 0,
		completed: 0,
		failed: 0,
		costUsd: 0,
		usage: {},
		thoughtChars: 0,
		outputTextChars: 0
	};
}

function bucketFor(map, key) {
	if (!map[key]) map[key] = emptyBucket();
	return map[key];
}

function labelPrefix(label) {
	return String(label ?? 'unknown').split(':')[0] || 'unknown';
}

const summary = {
	status: 'passed',
	logDir: path.relative(rootDir, logDir),
	runId: runIdFilter,
	files: [],
	started: 0,
	completed: 0,
	failed: 0,
	costUsd: 0,
	usage: {},
	byModel: {},
	byLabelPrefix: {},
	activeCallIds: []
};
const started = new Set();
const completed = new Set();

for (const filePath of jsonlFiles(logDir)) {
	const rel = path.relative(rootDir, filePath);
	let fileMatched = false;
	const lines = readFileSync(filePath, 'utf8').split(/\n+/).filter(Boolean);
	for (const line of lines) {
		let record;
		try {
			record = JSON.parse(line);
		} catch {
			continue;
		}
		if (since && record.timestamp && record.timestamp < since) continue;
		if (runIdFilter && record.runId !== runIdFilter) continue;
		fileMatched = true;
		if (record.type === 'llm_call_started') {
			started.add(record.callId);
			summary.started += 1;
			bucketFor(summary.byLabelPrefix, labelPrefix(record.label)).calls += 1;
			if (record.model) bucketFor(summary.byModel, record.model).calls += 1;
		}
		if (record.type !== 'llm_call_completed') continue;
		completed.add(record.callId);
		summary.completed += 1;
		if (record.ok === false) summary.failed += 1;
		const costUsd = typeof record.costUsd === 'number' ? record.costUsd : 0;
		summary.costUsd += costUsd;
		addUsage(summary.usage, record.usage);
		const modelBucket = bucketFor(summary.byModel, record.model ?? 'unknown');
		modelBucket.completed += 1;
		if (record.ok === false) modelBucket.failed += 1;
		modelBucket.costUsd += costUsd;
		addUsage(modelBucket.usage, record.usage);
		modelBucket.thoughtChars += record.thoughtChars ?? 0;
		modelBucket.outputTextChars += record.outputTextChars ?? 0;
		const labelBucket = bucketFor(summary.byLabelPrefix, labelPrefix(record.label));
		labelBucket.completed += 1;
		if (record.ok === false) labelBucket.failed += 1;
		labelBucket.costUsd += costUsd;
		addUsage(labelBucket.usage, record.usage);
		labelBucket.thoughtChars += record.thoughtChars ?? 0;
		labelBucket.outputTextChars += record.outputTextChars ?? 0;
	}
	if (fileMatched) summary.files.push(rel);
}

summary.activeCallIds = Array.from(started).filter((callId) => !completed.has(callId));
summary.status = summary.activeCallIds.length ? 'running' : summary.failed > 0 ? 'failed' : 'passed';
summary.costUsd = Number(summary.costUsd.toFixed(6));
for (const bucket of [...Object.values(summary.byModel), ...Object.values(summary.byLabelPrefix)]) {
	bucket.costUsd = Number(bucket.costUsd.toFixed(6));
}

console.log(JSON.stringify(summary, null, 2));
