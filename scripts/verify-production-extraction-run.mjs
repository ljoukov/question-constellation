#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/verify-production-extraction-run.mjs --work-root=tmp/production-extraction/<source-id>
node scripts/verify-production-extraction-run.mjs --summary=tmp/production-extraction/<source-id>/production-extraction-summary.json

Options:
  --run-id=<llm-log-run-id>
  --log-dir=tmp/llm-extraction-logs
  --output=tmp/production-extraction-verification.json
  --min-extraction-judge-score=0.8
  --min-chain-judge-score=0.8
  --min-solvability-score=0.8
  --allow-dropped-questions
  --skip-llm-log`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const summaryArg = stringArg('summary', '');
const workRootArg = stringArg('work-root', '');
if (!summaryArg && !workRootArg)
	throw new Error(`Pass --summary=... or --work-root=...\n\n${usage}`);
const summaryPath = path.resolve(
	rootDir,
	summaryArg || path.join(workRootArg, 'production-extraction-summary.json')
);
const logDir = path.resolve(rootDir, stringArg('log-dir', 'tmp/llm-extraction-logs'));
const outputPath = stringArg('output', '');
const minExtractionJudgeScore = numberArg('min-extraction-judge-score', 0.8);
const minChainJudgeScore = numberArg('min-chain-judge-score', 0.8);
const minSolvabilityScore = numberArg('min-solvability-score', 0.8);
const allowDroppedQuestions = hasArg('allow-dropped-questions');
const skipLlmLog = hasArg('skip-llm-log');

const failures = [];
const warnings = [];
const summary = mustReadJson(summaryPath, 'production summary');
const plan = summary.plan ?? {};
const runId = stringArg('run-id', '') || plan.runId || '';

check(summary.status === 'passed', 'summary.status must be passed', {
	actual: summary.status
});

for (const label of [
	'PDF extraction',
	'answer-chain reconciliation',
	'strict import-ready preparation'
]) {
	const step = (summary.steps ?? []).find((candidate) => candidate.label === label);
	check(step?.status === 'passed', `summary step ${label} must be passed`, {
		actual: step?.status ?? null
	});
}

const raw = readCandidate(plan.rawOutputPath, 'raw extraction output');
const extractionEval = mustReadJson(plan.extractionEvalPath, 'extraction evaluation');
const reconciled = readCandidate(plan.reconciledOutputPath, 'chain-reconciled output');
const reconcileSummary = mustReadJson(plan.reconcileSummaryPath, 'chain reconciliation summary');
const importReadyAudit = mustReadJson(plan.importReadyAuditPath, 'import-ready audit');

const importReadyFiles = importReadyFilePaths(summary.importReady, importReadyAudit);
const importReadyCandidates = importReadyFiles.map((filePath) =>
	readCandidate(filePath, `import-ready file ${relative(filePath)}`)
);

check(candidateQuestionCount(raw) > 0, 'raw extraction must contain questions', {
	questions: candidateQuestionCount(raw)
});
check(candidateQuestionCount(reconciled) > 0, 'chain-reconciled output must contain questions', {
	questions: candidateQuestionCount(reconciled)
});
check(importReadyCandidates.length > 0, 'import-ready audit must reference at least one file');

verifyExtractionEval(extractionEval);
verifyReconcileSummary(reconcileSummary);
verifyImportReady(summary.importReady, importReadyAudit, importReadyCandidates);
verifyNoReviewFlags(importReadyCandidates);

let llmLogSummary = null;
if (!skipLlmLog) {
	if (!runId) {
		fail('No runId available for LLM log verification; pass --run-id or run a newer orchestrator.');
	} else {
		llmLogSummary = summarizeLlmRun(runId);
		verifyLlmLog(llmLogSummary, {
			runSolvability: plan.runSolvability !== false,
			skipExtractionJudge: Boolean(plan.skipExtractionJudge),
			skipChainJudge: Boolean(plan.skipChainJudge)
		});
	}
}

const result = {
	status: failures.length ? 'failed' : 'passed',
	summary: relative(summaryPath),
	sourceDocumentId:
		plan.sourceDocumentId ?? raw?.sourceDocument?.id ?? raw?.sourceDocumentId ?? null,
	runId: runId || null,
	questionCounts: {
		raw: candidateQuestionCount(raw),
		reconciled: candidateQuestionCount(reconciled),
		importReady: importReadyCandidates.reduce(
			(sum, candidate) => sum + candidateQuestionCount(candidate),
			0
		)
	},
	importReady: {
		status: summary.importReady?.status ?? null,
		importMode: summary.importReady?.importMode ?? null,
		keptQuestions: summary.importReady?.keptQuestions ?? null,
		droppedQuestions: summary.importReady?.droppedQuestions ?? null
	},
	llmLog: llmLogSummary
		? {
				status: llmLogSummary.status,
				started: llmLogSummary.started,
				completed: llmLogSummary.completed,
				failed: llmLogSummary.failed,
				costUsd: llmLogSummary.costUsd,
				totalTokens: llmLogSummary.usage.totalTokens ?? null,
				labelPrefixes: Object.keys(llmLogSummary.byLabelPrefix).sort()
			}
		: null,
	failures,
	warnings
};

if (outputPath) writeJson(path.resolve(rootDir, outputPath), result);
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function numberArg(name, defaultValue) {
	const raw = stringArg(name, '');
	if (!raw) return defaultValue;
	const value = Number(raw);
	if (!Number.isFinite(value)) throw new Error(`--${name} must be a number.`);
	return value;
}

function relative(filePath) {
	if (!filePath) return filePath;
	return path.relative(rootDir, path.resolve(rootDir, filePath)).split(path.sep).join('/');
}

function resolveRunPath(filePath) {
	if (!filePath) return '';
	return path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);
}

function mustReadJson(filePath, label) {
	const resolved = resolveRunPath(filePath);
	check(Boolean(resolved), `${label} path must be present`);
	if (!resolved) return null;
	check(existsSync(resolved), `${label} file must exist`, { file: relative(resolved) });
	if (!existsSync(resolved)) return null;
	try {
		return readJson(resolved);
	} catch (error) {
		fail(`${label} must be valid JSON`, {
			file: relative(resolved),
			error: error instanceof Error ? error.message : String(error)
		});
		return null;
	}
}

function readCandidate(filePath, label) {
	return mustReadJson(filePath, label) ?? { questions: [] };
}

function check(condition, message, details = null) {
	if (condition) return;
	fail(message, details);
}

function fail(message, details = null) {
	failures.push({ message, details });
}

function candidateQuestionCount(candidate) {
	return Array.isArray(candidate?.questions) ? candidate.questions.length : 0;
}

function verifyExtractionEval(evaluation) {
	check(evaluation?.status === 'passed', 'extraction evaluation status must be passed', {
		actual: evaluation?.status ?? null
	});
	check(
		(evaluation?.mechanicalErrors ?? []).length === 0,
		'extraction evaluation must have no mechanical errors',
		{
			mechanicalErrors: evaluation?.mechanicalErrors ?? []
		}
	);
	check(
		(evaluation?.deterministicBlockingIssues ?? []).length === 0,
		'extraction evaluation must have no deterministic blocking issues',
		{ deterministicBlockingIssues: evaluation?.deterministicBlockingIssues ?? [] }
	);
	if (evaluation?.judge) {
		check(evaluation.judge.verdict === 'pass', 'extraction judge verdict must be pass', {
			actual: evaluation.judge.verdict
		});
		check(evaluation.judge.score >= minExtractionJudgeScore, 'extraction judge score is too low', {
			score: evaluation.judge.score,
			minExtractionJudgeScore
		});
		check(
			(evaluation.judge.requiredRepairs ?? []).length === 0,
			'extraction judge must not request required repairs',
			{ requiredRepairs: evaluation.judge.requiredRepairs ?? [] }
		);
	}
}

function verifyReconcileSummary(reconcile) {
	check(reconcile?.status === 'passed', 'chain reconciliation summary status must be passed', {
		actual: reconcile?.status ?? null
	});
	check(
		(reconcile?.finalBlockingRefs ?? 0) === 0,
		'chain reconciliation must leave no blocking refs',
		{
			finalBlockingRefs: reconcile?.finalBlockingRefs ?? null
		}
	);
	check(
		(reconcile?.finalWarningRefs ?? 0) === 0,
		'chain reconciliation must leave no warning refs',
		{
			finalWarningRefs: reconcile?.finalWarningRefs ?? null
		}
	);
	for (const file of reconcile?.files ?? []) {
		check(file.status === 'passed', 'each reconciled file must pass', {
			file: file.file,
			status: file.status
		});
		if (file.judge) {
			check(file.judge.status === 'passed', 'chain judge status must be passed', {
				file: file.file,
				status: file.judge.status
			});
			check(file.judge.judgeVerdict === 'pass', 'chain judge verdict must be pass', {
				file: file.file,
				verdict: file.judge.judgeVerdict
			});
			check(file.judge.judgeScore >= minChainJudgeScore, 'chain judge score is too low', {
				file: file.file,
				score: file.judge.judgeScore,
				minChainJudgeScore
			});
			check(
				(file.judge.requiredRepairs ?? []).length === 0,
				'chain judge must not request repairs',
				{
					file: file.file,
					requiredRepairs: file.judge.requiredRepairs ?? []
				}
			);
		}
	}
}

function verifyImportReady(importReady, audit, importReadyCandidates) {
	check(importReady?.status === 'passed', 'import-ready summary status must be passed', {
		actual: importReady?.status ?? null
	});
	check(
		(importReady?.keptQuestions ?? 0) > 0,
		'import-ready subset must keep at least one question',
		{
			keptQuestions: importReady?.keptQuestions ?? null
		}
	);
	if (!allowDroppedQuestions) {
		check((importReady?.droppedQuestions ?? 0) === 0, 'import-ready subset dropped questions', {
			droppedQuestions: importReady?.droppedQuestions ?? null
		});
	}
	check(
		importReady?.importMode !== 'none',
		'production run must include an import dry-run or write',
		{
			importMode: importReady?.importMode ?? null
		}
	);
	check(
		(importReady?.importResults ?? []).length > 0,
		'import-ready summary must include import results'
	);
	check(audit?.status === 'passed', 'import-ready audit status must be passed', {
		actual: audit?.status ?? null
	});
	check(audit?.mechanical?.status === 'passed', 'mechanical import-ready audit must pass', {
		actual: audit?.mechanical?.status ?? null
	});
	check(
		(audit?.mechanical?.errorCount ?? 0) === 0,
		'mechanical import-ready audit must have no errors',
		{
			errorCount: audit?.mechanical?.errorCount ?? null
		}
	);
	check(
		(audit?.mechanical?.warningCount ?? 0) === 0,
		'mechanical import-ready audit must have no warnings',
		{
			warningCount: audit?.mechanical?.warningCount ?? null
		}
	);
	const importReadyQuestionCount = importReadyCandidates.reduce(
		(sum, candidate) => sum + candidateQuestionCount(candidate),
		0
	);
	check(
		importReadyQuestionCount === importReady?.keptQuestions,
		'import-ready file question count must match summary keptQuestions',
		{ importReadyQuestionCount, keptQuestions: importReady?.keptQuestions ?? null }
	);
	verifySolvabilityAudit(audit?.solvability);
}

function verifySolvabilityAudit(solvability) {
	check(solvability?.enabled === true, 'solvability audit must be enabled', {
		enabled: solvability?.enabled ?? null
	});
	check(solvability?.status === 'passed', 'solvability audit status must be passed', {
		actual: solvability?.status ?? null
	});
	check((solvability?.planned ?? 0) > 0, 'solvability audit must plan questions', {
		planned: solvability?.planned ?? null
	});
	check(
		solvability?.completed === solvability?.planned,
		'solvability audit must complete all planned questions',
		{
			completed: solvability?.completed ?? null,
			planned: solvability?.planned ?? null
		}
	);
	check((solvability?.failed ?? 0) === 0, 'solvability audit must have no failed questions', {
		failed: solvability?.failed ?? null
	});
	for (const result of solvability?.results ?? []) {
		check(result.status === 'passed', 'each solvability result must pass', {
			sourceQuestionRef: result.sourceQuestionRef,
			status: result.status
		});
		check(result.judge?.score >= minSolvabilityScore, 'solvability judge score is too low', {
			sourceQuestionRef: result.sourceQuestionRef,
			score: result.judge?.score ?? null,
			minSolvabilityScore
		});
		check(
			(result.judge?.requiredRepairs ?? []).length === 0,
			'solvability judge must not request required repairs',
			{
				sourceQuestionRef: result.sourceQuestionRef,
				requiredRepairs: result.judge?.requiredRepairs ?? []
			}
		);
		const blockingFindings = [
			...(result.judge?.missingContext ?? []),
			...(result.judge?.renderFindings ?? [])
		].filter((finding) => finding?.severity === 'blocking');
		check(blockingFindings.length === 0, 'solvability judge must have no blocking findings', {
			sourceQuestionRef: result.sourceQuestionRef,
			blockingFindings
		});
	}
}

function verifyNoReviewFlags(candidates) {
	for (const candidate of candidates) {
		for (const question of candidate.questions ?? []) {
			const ref = question.sourceQuestionRef ?? 'unknown';
			check(
				question.needsHumanReview !== true,
				'import-ready question must not need human review',
				{
					sourceQuestionRef: ref
				}
			);
			check(
				question.answerChain?.needsHumanReview !== true,
				'import-ready answer chain must not need human review',
				{ sourceQuestionRef: ref, chainId: question.answerChain?.id ?? null }
			);
			check(question.answerChain?.id, 'import-ready answer chain must have a stable id', {
				sourceQuestionRef: ref
			});
			for (const [index, asset] of (question.assets ?? []).entries()) {
				check(asset?.needsHumanReview !== true, 'import-ready asset must not need human review', {
					sourceQuestionRef: ref,
					index,
					label: asset?.sourceLabel ?? asset?.label ?? null
				});
			}
		}
	}
}

function importReadyFilePaths(importReady, audit) {
	const files = new Set();
	for (const file of audit?.mechanical?.files ?? []) {
		if (file.file) files.add(resolveRunPath(file.file));
	}
	if (files.size === 0) {
		const outputRoot = resolveRunPath(importReady?.outputRoot);
		if (outputRoot && existsSync(outputRoot)) {
			for (const filePath of walkJsonFiles(outputRoot)) files.add(filePath);
		}
	}
	return [...files].sort();
}

function walkJsonFiles(dir) {
	const entries = [];
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		const filePath = path.join(dir, name.name);
		if (name.isDirectory()) entries.push(...walkJsonFiles(filePath));
		else if (name.name.endsWith('.json')) entries.push(filePath);
	}
	return entries;
}

function summarizeLlmRun(wantedRunId) {
	const logPath = path.join(logDir, `${wantedRunId}.jsonl`);
	check(existsSync(logPath), 'LLM log file must exist', { logPath: relative(logPath) });
	if (!existsSync(logPath)) {
		return {
			status: 'failed',
			started: 0,
			completed: 0,
			failed: 0,
			costUsd: 0,
			usage: {},
			byLabelPrefix: {},
			activeCallIds: []
		};
	}
	const summary = {
		status: 'passed',
		started: 0,
		completed: 0,
		failed: 0,
		costUsd: 0,
		usage: {},
		byLabelPrefix: {},
		activeCallIds: []
	};
	const started = new Set();
	const completed = new Set();
	for (const line of readFileSync(logPath, 'utf8').split(/\n+/).filter(Boolean)) {
		let record;
		try {
			record = JSON.parse(line);
		} catch {
			continue;
		}
		if (record.runId !== wantedRunId) continue;
		if (record.type === 'llm_call_started') {
			started.add(record.callId);
			summary.started += 1;
			bucketFor(summary.byLabelPrefix, labelPrefix(record.label)).calls += 1;
		}
		if (record.type !== 'llm_call_completed') continue;
		completed.add(record.callId);
		summary.completed += 1;
		if (record.ok === false) summary.failed += 1;
		summary.costUsd += typeof record.costUsd === 'number' ? record.costUsd : 0;
		addUsage(summary.usage, record.usage);
		const bucket = bucketFor(summary.byLabelPrefix, labelPrefix(record.label));
		bucket.completed += 1;
		if (record.ok === false) bucket.failed += 1;
		bucket.costUsd += typeof record.costUsd === 'number' ? record.costUsd : 0;
		addUsage(bucket.usage, record.usage);
	}
	summary.activeCallIds = [...started].filter((callId) => !completed.has(callId));
	summary.status = summary.activeCallIds.length
		? 'running'
		: summary.failed > 0
			? 'failed'
			: 'passed';
	summary.costUsd = Number(summary.costUsd.toFixed(6));
	for (const bucket of Object.values(summary.byLabelPrefix)) {
		bucket.costUsd = Number(bucket.costUsd.toFixed(6));
	}
	return summary;
}

function verifyLlmLog(logSummary, options) {
	check(logSummary.status === 'passed', 'LLM log summary must be passed', {
		status: logSummary.status,
		activeCallIds: logSummary.activeCallIds,
		failed: logSummary.failed
	});
	check(logSummary.started > 0, 'LLM log must contain started calls', {
		started: logSummary.started
	});
	check(logSummary.started === logSummary.completed, 'LLM log must complete every started call', {
		started: logSummary.started,
		completed: logSummary.completed
	});
	check(logSummary.failed === 0, 'LLM log must have no failed calls', {
		failed: logSummary.failed
	});
	const requiredPrefixes = ['extract-full-paper'];
	if (!options.skipExtractionJudge) requiredPrefixes.push('judge-extraction');
	if (!options.skipChainJudge) requiredPrefixes.push('judge-rubric');
	if (options.runSolvability) requiredPrefixes.push('judge-solvability');
	for (const prefix of requiredPrefixes) {
		check(
			(logSummary.byLabelPrefix[prefix]?.completed ?? 0) > 0,
			`LLM log must include ${prefix} calls`,
			{ byLabelPrefix: logSummary.byLabelPrefix }
		);
	}
}

function addUsage(target, usage = null) {
	if (!usage) return;
	for (const [key, value] of Object.entries(usage)) {
		if (typeof value !== 'number' || !Number.isFinite(value)) continue;
		target[key] = (target[key] ?? 0) + value;
	}
}

function bucketFor(map, key) {
	if (!map[key]) {
		map[key] = {
			calls: 0,
			completed: 0,
			failed: 0,
			costUsd: 0,
			usage: {}
		};
	}
	return map[key];
}

function labelPrefix(label) {
	return String(label ?? 'unknown').split(':')[0] || 'unknown';
}
