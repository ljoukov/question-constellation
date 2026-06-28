#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
	blockingIssues,
	deterministicCandidateIssues,
	readJson,
	sanitizeAnswerChainEvidenceIndexes,
	writeJson
} from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();
const inputPath = stringArg('input', '');
const inputRoot = stringArg('input-root', 'data/vision-extracted');
const outputPath = path.resolve(
	rootDir,
	stringArg('summary', 'tmp/extracted-question-data-repair-summary.json')
);
const paperArg = stringArg('paper', '');
const subjectArg = stringArg('subject', 'all').toLowerCase();
const recursive = !hasArg('no-recursive');
const write = hasArg('write');
const dropWithdrawn = !hasArg('keep-withdrawn');
const dropUnsupportedSteps = !hasArg('keep-unsupported-steps');

const files = selectInputFiles();
if (files.length === 0) throw new Error('No extracted paper JSON files matched the selection.');

const results = files.map(repairFile);
const summary = {
	status: results.some((result) => result.error) ? 'failed' : 'passed',
	write,
	inputRoot: inputPath ? null : inputRoot,
	input: inputPath || null,
	recursive,
	paper: paperArg || null,
	subject: subjectArg,
	files: results,
	changedFiles: results.filter((result) => result.changed).length,
	droppedQuestions: results.reduce((sum, result) => sum + result.droppedQuestions.length, 0),
	droppedSteps: results.reduce((sum, result) => sum + result.droppedSteps.length, 0)
};

writeJson(outputPath, summary);
console.log(
	[
		`extracted-data repair ${summary.status}${write ? '' : ' dry-run'}`,
		`summary: ${relative(outputPath)}`,
		`files: ${summary.files.length}, changed: ${summary.changedFiles}`,
		`dropped withdrawn/statistics-only questions: ${summary.droppedQuestions}`,
		`dropped unsupported chain steps: ${summary.droppedSteps}`
	].join('\n')
);
if (summary.status === 'failed') process.exit(1);

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

function selectInputFiles() {
	const candidates = inputPath
		? [path.resolve(rootDir, inputPath)]
		: walkJsonFiles(path.resolve(rootDir, inputRoot));
	return candidates.filter((filePath) => {
		if (!paperArg && subjectArg === 'all') return true;
		try {
			const candidate = readJson(filePath);
			const sourceDocumentId = sourceDocumentIdFor(candidate, filePath);
			const subject = String(
				candidate.sourceDocument?.subjectArea ??
					candidate.sourceDocument?.subject ??
					path.basename(path.dirname(filePath))
			).toLowerCase();
			const paperMatches =
				!paperArg || sourceDocumentId === paperArg || sourceDocumentId.includes(paperArg);
			const subjectMatches = subjectArg === 'all' || subject === subjectArg;
			return paperMatches && subjectMatches;
		} catch {
			return !paperArg && subjectArg === 'all';
		}
	});
}

function repairFile(filePath) {
	try {
		const original = readJson(filePath);
		let candidate = sanitizeAnswerChainEvidenceIndexes(original);
		const droppedQuestions = [];
		const droppedSteps = [];

		if (dropWithdrawn) {
			const withdrawnRefs = new Set(
				blockingIssues(deterministicCandidateIssues(candidate))
					.filter((issue) => issue.code === 'question_withdrawn_or_statistics_only')
					.map((issue) => issue.sourceQuestionRef)
					.filter(Boolean)
			);
			if (withdrawnRefs.size > 0) {
				candidate = {
					...candidate,
					questions: (candidate.questions ?? []).filter((question) => {
						const shouldDrop = withdrawnRefs.has(question.sourceQuestionRef);
						if (shouldDrop) droppedQuestions.push(question.sourceQuestionRef);
						return !shouldDrop;
					})
				};
			}
		}

		if (dropUnsupportedSteps) {
			candidate = {
				...candidate,
				questions: (candidate.questions ?? []).map((question) => {
					if (!question.answerChain?.steps?.length) return question;
					const stepIndexes = new Set(
						blockingIssues(deterministicCandidateIssues({ questions: [question] }))
							.filter((issue) => issue.code === 'chain_step_missing_positive_evidence')
							.map((issue) => Number(issue.field?.match(/steps\[(\d+)\]/)?.[1]))
							.filter((index) => Number.isInteger(index))
					);
					if (stepIndexes.size === 0) return question;
					const steps = question.answerChain.steps.filter((_, index) => {
						const shouldDrop = stepIndexes.has(index);
						if (shouldDrop) {
							droppedSteps.push(`${question.sourceQuestionRef}:${index}`);
						}
						return !shouldDrop;
					});
					return {
						...question,
						answerChain: {
							...question.answerChain,
							steps,
							needsHumanReview: true,
							reviewNotes: [
								...(question.answerChain.reviewNotes ?? []),
								'Unsupported answer-chain tail steps were removed by repair-extracted-question-data.'
							]
						},
						needsHumanReview: true,
						reviewNotes: [
							...(question.reviewNotes ?? []),
							'Unsupported answer-chain tail steps were removed by repair-extracted-question-data.'
						]
					};
				})
			};
		}

		const changed = JSON.stringify(candidate) !== JSON.stringify(original);
		if (changed && write) writeJson(filePath, candidate);
		return {
			file: relative(filePath),
			sourceDocumentId: sourceDocumentIdFor(candidate, filePath),
			changed,
			written: changed && write,
			droppedQuestions,
			droppedSteps
		};
	} catch (error) {
		return {
			file: relative(filePath),
			changed: false,
			written: false,
			droppedQuestions: [],
			droppedSteps: [],
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
