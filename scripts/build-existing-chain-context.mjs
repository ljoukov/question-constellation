#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const inputPath = stringArg('input', '');
const inputRoot = path.resolve(rootDir, stringArg('input-root', 'data/vision-extracted'));
const outputPath = path.resolve(rootDir, stringArg('output', 'tmp/existing-chain-context.json'));
const paperArg = stringArg('paper', '');
const subjectArg = stringArg('subject', 'all').toLowerCase();
const maxQuestionRefs = integerArg('max-question-refs', 8, 0);
const recursive = !hasArg('no-recursive');
const dryRun = hasArg('dry-run');

const files = selectInputFiles();
if (files.length === 0) throw new Error('No extracted paper JSON files matched the selection.');

const chainMap = new Map();
const skipped = [];
for (const filePath of files) {
	const paper = readJson(filePath);
	const sourceDocumentId = paper.sourceDocument?.id ?? paper.sourceDocumentId ?? path.basename(filePath, '.json');
	const subject = subjectFor(paper, filePath);
	for (const question of paper.questions ?? []) {
		const chain = question.answerChain;
		if (!chain?.id) {
			skipped.push({
				sourceDocumentId,
				sourceQuestionRef: question.sourceQuestionRef,
				reason: 'missing_answer_chain_id'
			});
			continue;
		}
		if (chain.needsHumanReview || question.needsHumanReview) {
			skipped.push({
				sourceDocumentId,
				sourceQuestionRef: question.sourceQuestionRef,
				chainId: chain.id,
				reason: 'needs_human_review'
			});
			continue;
		}
		addChainOccurrence({
			chain,
			sourceDocumentId,
			sourceQuestionRef: question.sourceQuestionRef,
			subject,
			topicPath: question.topicPath ?? [],
			marks: question.marks
		});
	}
}

const answerChains = [...chainMap.values()]
	.map(finalizeChainRecord)
	.sort((a, b) => a.id.localeCompare(b.id));

const output = {
	version: 1,
	generatedAt: new Date().toISOString(),
	source: inputPath || relative(inputRoot),
	paper: paperArg || null,
	subject: subjectArg,
	answerChains,
	skipped
};

if (!dryRun) {
	mkdirSync(path.dirname(outputPath), { recursive: true });
	writeJson(outputPath, output);
}

console.log(
	JSON.stringify(
		{
			status: 'passed',
			output: dryRun ? null : relative(outputPath),
			input: inputPath || null,
			inputRoot: inputPath ? null : relative(inputRoot),
			files: files.length,
			answerChains: answerChains.length,
			questionLinks: answerChains.reduce((sum, chain) => sum + chain.questionCount, 0),
			skipped: skipped.length,
			dryRun
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

function integerArg(name, defaultValue, minValue) {
	const raw = stringArg(name, '');
	if (!raw) return defaultValue;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer >= ${minValue}.`);
	}
	return value;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function walkJsonFiles(dir) {
	const out = [];
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir)) {
		const filePath = path.join(dir, name);
		const stat = statSync(filePath);
		if (stat.isDirectory()) {
			if (recursive) out.push(...walkJsonFiles(filePath));
		} else if (name.endsWith('.json')) {
			out.push(filePath);
		}
	}
	return out.sort();
}

function sourceDocumentIdFor(candidate, filePath) {
	return (
		candidate?.sourceDocument?.id ??
		candidate?.sourceDocumentId ??
		path.basename(filePath ?? '', '.json')
	);
}

function subjectFor(candidate, filePath) {
	return String(
		candidate.sourceDocument?.subjectArea ??
			candidate.sourceDocument?.subject ??
			path.basename(path.dirname(filePath))
	);
}

function selectInputFiles() {
	const candidates = inputPath ? [path.resolve(rootDir, inputPath)] : walkJsonFiles(inputRoot);
	return candidates.filter((filePath) => {
		if (!paperArg && subjectArg === 'all') return true;
		try {
			const candidate = readJson(filePath);
			const sourceDocumentId = sourceDocumentIdFor(candidate, filePath);
			const paperMatches =
				!paperArg || sourceDocumentId === paperArg || sourceDocumentId.includes(paperArg);
			const subjectMatches = subjectArg === 'all' || subjectFor(candidate, filePath).toLowerCase() === subjectArg;
			return paperMatches && subjectMatches;
		} catch {
			return !paperArg && subjectArg === 'all';
		}
	});
}

function addChainOccurrence({ chain, sourceDocumentId, sourceQuestionRef, subject, topicPath, marks }) {
	const existing = chainMap.get(chain.id);
	const record =
		existing ??
		{
			id: chain.id,
			title: chain.title,
			canonicalChainText: chain.canonicalChainText,
			summary: chain.summary,
			broadTopic: chain.broadTopic ?? null,
			chainFamilyId: chain.chainFamilyId ?? null,
			steps: (chain.steps ?? []).map((step) => ({
				stepText: step.stepText,
				stepRole: step.stepRole,
				explanation: step.explanation ?? null,
				commonOmission: step.commonOmission ?? null
			})),
			exampleQuestionRefs: [],
			subjects: new Set(),
			topicPaths: new Set(),
			markCounts: new Set()
		};
	record.subjects.add(subject);
	if (Array.isArray(topicPath) && topicPath.length > 0) record.topicPaths.add(topicPath.join(' > '));
	if (marks !== null && marks !== undefined) record.markCounts.add(Number(marks));
	record.exampleQuestionRefs.push({ sourceDocumentId, sourceQuestionRef });
	chainMap.set(chain.id, record);
}

function finalizeChainRecord(record) {
	const exampleQuestionRefs = record.exampleQuestionRefs
		.sort((a, b) =>
			`${a.sourceDocumentId} ${a.sourceQuestionRef}`.localeCompare(
				`${b.sourceDocumentId} ${b.sourceQuestionRef}`
			)
		)
		.slice(0, maxQuestionRefs);
	return {
		id: record.id,
		title: record.title,
		canonicalChainText: record.canonicalChainText,
		summary: record.summary,
		broadTopic: record.broadTopic,
		chainFamilyId: record.chainFamilyId,
		steps: record.steps,
		subjects: [...record.subjects].sort(),
		topicPaths: [...record.topicPaths].sort(),
		markCounts: [...record.markCounts].sort((a, b) => a - b),
		questionCount: record.exampleQuestionRefs.length,
		exampleQuestionRefs
	};
}
