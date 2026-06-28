import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { generateJson, loadLocalEnv } from '@ljoukov/llm';
import { z } from 'zod';

const DEFAULT_BASE_URL = 'http://localhost:5173';
const DEFAULT_FIXTURE = 'scripts/fixtures/grading-eval-cases.json';
const DEFAULT_OUTPUT = 'tmp/grading-eval/results.json';
const DEFAULT_MODELS = ['chatgpt-gpt-5.3-codex-spark'];
const DEFAULT_THINKING_LEVELS = ['medium'];
const COMPARISON_MODELS = [
	'chatgpt-gpt-5.3-codex-spark',
	'chatgpt-gpt-5.5-fast',
	'chatgpt-gpt-5.4-fast',
	'chatgpt-gpt-5.4-mini'
];
const COMPARISON_THINKING_LEVELS = ['medium', 'low', 'none'];
const DEFAULT_JUDGE_MODEL = 'chatgpt-gpt-5.5';
const DEFAULT_JUDGE_THINKING_LEVEL = 'xhigh';

const JudgeSchema = z.object({
	verdict: z.enum(['pass', 'fail', 'uncertain']),
	score: z.number().min(0).max(1),
	expectedMarks: z.number().nullable(),
	reasons: z.array(z.string()),
	notes: z.string()
});

function usage() {
	return [
		'Usage:',
		'  node scripts/eval-experiment-grading.mjs [options]',
		'',
		'Defaults start with chatgpt-gpt-5.3-codex-spark / medium.',
		'',
		'Options:',
		'  --base-url=http://localhost:5173',
		'  --fixture=scripts/fixtures/grading-eval-cases.json',
		'  --output=tmp/grading-eval/results.json',
		'  --model=chatgpt-gpt-5.3-codex-spark[,chatgpt-gpt-5.4-mini]',
		'  --thinking-level=medium[,low,none]',
		'  --preset=comparison',
		'  --case=physics-swimmer-drag-full[,biology-amylase-ph-full]',
		'  --limit=4',
		'  --judge',
		'  --judge-model=chatgpt-gpt-5.5',
		'  --judge-thinking-level=xhigh',
		'  --include-prompts',
		'  --fail-on-judge',
		'',
		'The installed LLM wrapper currently exposes chatgpt-gpt-5.3-codex-spark, chatgpt-gpt-5.4-fast, and chatgpt-gpt-5.4-mini.',
		'Production deployments ignore model/thinking overrides unless EXPERIMENT_GRADING_DEBUG_PROMPTS=1.'
	].join('\n');
}

function list(value) {
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function parseArgs(argv) {
	const options = {
		baseUrl: DEFAULT_BASE_URL,
		fixture: DEFAULT_FIXTURE,
		output: DEFAULT_OUTPUT,
		models: [...DEFAULT_MODELS],
		thinkingLevels: [...DEFAULT_THINKING_LEVELS],
		caseIds: [],
		limit: null,
		judge: false,
		judgeModel: DEFAULT_JUDGE_MODEL,
		judgeThinkingLevel: DEFAULT_JUDGE_THINKING_LEVEL,
		includePrompts: false,
		failOnJudge: false
	};

	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') {
			console.log(usage());
			process.exit(0);
		}
		if (arg === '--judge') {
			options.judge = true;
			continue;
		}
		if (arg === '--include-prompts') {
			options.includePrompts = true;
			continue;
		}
		if (arg === '--fail-on-judge') {
			options.failOnJudge = true;
			continue;
		}
		const [key, rawValue = ''] = arg.split(/=(.*)/s);
		if (!key.startsWith('--')) {
			throw new Error(`Unexpected argument: ${arg}`);
		}
		const value = rawValue.trim();
		switch (key) {
			case '--base-url':
				options.baseUrl = value.replace(/\/+$/, '');
				break;
			case '--fixture':
				options.fixture = value;
				break;
			case '--output':
				options.output = value;
				break;
			case '--model':
			case '--models':
				options.models = list(value);
				break;
			case '--thinking-level':
			case '--thinking-levels':
				options.thinkingLevels = list(value);
				break;
			case '--preset':
				if (value !== 'comparison') throw new Error(`Unknown preset: ${value}`);
				options.models = [...COMPARISON_MODELS];
				options.thinkingLevels = [...COMPARISON_THINKING_LEVELS];
				break;
			case '--case':
				options.caseIds.push(...list(value));
				break;
			case '--limit':
				options.limit = Number.parseInt(value, 10);
				if (!Number.isInteger(options.limit) || options.limit < 1) {
					throw new Error('--limit must be a positive integer.');
				}
				break;
			case '--judge-model':
				options.judgeModel = value;
				break;
			case '--judge-thinking-level':
				options.judgeThinkingLevel = value;
				break;
			default:
				throw new Error(`Unknown argument: ${key}`);
		}
	}

	if (options.models.length === 0) throw new Error('At least one model is required.');
	if (options.thinkingLevels.length === 0)
		throw new Error('At least one thinking level is required.');
	return options;
}

function readFixture(filePath) {
	const fixture = JSON.parse(readFileSync(filePath, 'utf8'));
	if (!Array.isArray(fixture.cases)) {
		throw new Error(`Fixture ${filePath} must contain a cases array.`);
	}
	return fixture;
}

function selectedCases(fixture, options) {
	let cases = fixture.cases;
	if (options.caseIds.length > 0) {
		const wanted = new Set(options.caseIds);
		cases = cases.filter((testCase) => wanted.has(testCase.id));
		const found = new Set(cases.map((testCase) => testCase.id));
		const missing = options.caseIds.filter((id) => !found.has(id));
		if (missing.length > 0) throw new Error(`Unknown case id(s): ${missing.join(', ')}`);
	}
	if (options.limit) cases = cases.slice(0, options.limit);
	return cases;
}

function expectedVerdict(result, expected) {
	if (!result || typeof result.awardedMarks !== 'number') return 'ungraded';
	return result.awardedMarks >= expected.minMarks && result.awardedMarks <= expected.maxMarks
		? 'inside_expected_range'
		: 'outside_expected_range';
}

function compactResult(result) {
	if (!result) return null;
	return {
		ref: result.ref,
		status: result.status,
		result: result.result,
		awardedMarks: result.awardedMarks,
		maxMarks: result.maxMarks,
		gradeableMarks: result.gradeableMarks,
		confidence: result.confidence,
		summary: result.summary,
		nextStep: result.nextStep,
		warnings: result.warnings ?? [],
		checklist: result.checklist ?? [],
		chain: result.chain
			? {
					id: result.chain.id,
					title: result.chain.title,
					steps: result.chain.steps
				}
			: null
	};
}

async function gradeCase({ baseUrl, testCase, model, thinkingLevel, includePrompts }) {
	const url = `${baseUrl}/api/experiments/questions/${encodeURIComponent(
		testCase.paperSlug
	)}/${encodeURIComponent(testCase.ref)}/grade`;
	const started = performance.now();
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			answers: { [testCase.ref]: testCase.answer },
			model,
			thinkingLevel,
			includeDebugPrompt: true
		})
	});
	const durationMs = Math.round(performance.now() - started);
	const text = await response.text();
	let payload;
	try {
		payload = JSON.parse(text);
	} catch {
		payload = { rawText: text };
	}
	if (!response.ok) {
		return {
			ok: false,
			durationMs,
			status: response.status,
			error: payload
		};
	}
	const questionResult =
		payload.results?.find((candidate) => candidate.ref === testCase.ref) ??
		payload.results?.[0] ??
		null;
	const debugPrompt = typeof payload.debugPrompt === 'string' ? payload.debugPrompt : null;
	return {
		ok: true,
		durationMs,
		status: response.status,
		serverModel: payload.model,
		serverModelVersion: payload.modelVersion,
		serverThinkingLevel: payload.thinkingLevel ?? null,
		usage: payload.usage ?? null,
		costUsd: typeof payload.costUsd === 'number' ? payload.costUsd : null,
		totals: payload.totals,
		debugPromptChars: debugPrompt?.length ?? null,
		debugPrompt: includePrompts ? debugPrompt : undefined,
		result: compactResult(questionResult)
	};
}

async function judgeCase({ testCase, run, model, thinkingLevel }) {
	const input = [
		'You are judging whether an automated GCSE answer grader behaved correctly.',
		'Use the expected mark range and notes as the main criterion.',
		'Return pass if the awarded mark and feedback are defensible, fail if the mark is clearly wrong, and uncertain if the evidence is ambiguous.',
		'Give concise but specific reasons.',
		'',
		`CASE_ID: ${testCase.id}`,
		`SUBJECT: ${testCase.subject}`,
		`QUESTION: ${testCase.questionSummary}`,
		`EXPECTED_MARK_RANGE: ${testCase.expected.minMarks} to ${testCase.expected.maxMarks}`,
		`EXPECTED_NOTES: ${testCase.expected.notes}`,
		'',
		'STUDENT_ANSWER:',
		testCase.answer,
		'',
		'GRADER_OUTPUT:',
		JSON.stringify(
			{
				model: run.serverModel,
				thinkingLevel: run.serverThinkingLevel,
				durationMs: run.durationMs,
				result: run.result
			},
			null,
			2
		)
	].join('\n');
	const started = performance.now();
	const response = await generateJson({
		model,
		input,
		schema: JudgeSchema,
		...(thinkingLevel === 'none' ? {} : { thinkingLevel }),
		telemetry: false
	});
	return {
		...response.value,
		durationMs: Math.round(performance.now() - started),
		model: response.result.model,
		modelVersion: response.result.modelVersion,
		usage: response.result.usage ?? null,
		costUsd: response.result.costUsd
	};
}

function percentile(values, p) {
	if (values.length === 0) return null;
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
	return sorted[index];
}

function summarize(runs) {
	const byCombo = new Map();
	for (const run of runs) {
		const key = `${run.requestedModel} / ${run.requestedThinkingLevel}`;
		const group = byCombo.get(key) ?? [];
		group.push(run);
		byCombo.set(key, group);
	}
	return Array.from(byCombo.entries()).map(([combo, group]) => {
		const durations = group.filter((run) => run.ok).map((run) => run.durationMs);
		const usage = group.reduce(
			(total, run) => {
				const current = run.usage ?? {};
				for (const key of Object.keys(current)) {
					total[key] = (total[key] ?? 0) + (typeof current[key] === 'number' ? current[key] : 0);
				}
				total.costUsd += typeof run.costUsd === 'number' ? run.costUsd : 0;
				return total;
			},
			{ costUsd: 0 }
		);
		return {
			combo,
			runs: group.length,
			ok: group.filter((run) => run.ok).length,
			errors: group.filter((run) => !run.ok).length,
			insideExpectedRange: group.filter((run) => run.expectedVerdict === 'inside_expected_range')
				.length,
			outsideExpectedRange: group.filter((run) => run.expectedVerdict === 'outside_expected_range')
				.length,
			judgePass: group.filter((run) => run.judge?.verdict === 'pass').length,
			judgeFail: group.filter((run) => run.judge?.verdict === 'fail').length,
			judgeUncertain: group.filter((run) => run.judge?.verdict === 'uncertain').length,
			avgDurationMs:
				durations.length > 0
					? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
					: null,
			p50DurationMs: percentile(durations, 0.5),
			p95DurationMs: percentile(durations, 0.95),
			usage
		};
	});
}

function printRun(run) {
	if (!run.ok) {
		console.log(
			`${run.caseId} | ${run.requestedModel}/${run.requestedThinkingLevel} | ERROR ${run.durationMs}ms | ${JSON.stringify(run.error)}`
		);
		return;
	}
	const marks = `${run.result?.awardedMarks ?? '?'} / ${run.result?.maxMarks ?? '?'}`;
	const tokens = run.usage?.totalTokens ? `${run.usage.totalTokens} tok` : 'no usage';
	const cost = typeof run.costUsd === 'number' ? `$${run.costUsd.toFixed(6)}` : 'no cost';
	const judge = run.judge ? ` | judge=${run.judge.verdict}` : '';
	console.log(
		`${run.caseId} | ${run.serverModel}/${run.serverThinkingLevel ?? 'n/a'} | ${run.durationMs}ms | ${marks} | ${run.expectedVerdict} | ${tokens} | ${cost}${judge}`
	);
}

async function main() {
	loadLocalEnv();
	process.env.CHATGPT_RESPONSES_WEBSOCKET_MODE = 'off';
	process.env.CHATGPT_RESPONSES_EXPERIMENTAL_HEADER = 'off';

	const options = parseArgs(process.argv.slice(2));
	const fixturePath = path.resolve(options.fixture);
	const outputPath = path.resolve(options.output);
	const fixture = readFixture(fixturePath);
	const cases = selectedCases(fixture, options);
	const runs = [];

	console.log(
		`Running ${cases.length} case(s) across ${options.models.length} model(s) and ${options.thinkingLevels.length} thinking level(s).`
	);

	for (const model of options.models) {
		for (const thinkingLevel of options.thinkingLevels) {
			for (const testCase of cases) {
				const grade = await gradeCase({
					baseUrl: options.baseUrl,
					testCase,
					model,
					thinkingLevel,
					includePrompts: options.includePrompts
				});
				const run = {
					caseId: testCase.id,
					paperSlug: testCase.paperSlug,
					ref: testCase.ref,
					subject: testCase.subject,
					questionSummary: testCase.questionSummary,
					answer: testCase.answer,
					expected: testCase.expected,
					requestedModel: model,
					requestedThinkingLevel: thinkingLevel,
					...grade,
					expectedVerdict: grade.ok ? expectedVerdict(grade.result, testCase.expected) : 'error'
				};
				if (options.judge && grade.ok) {
					run.judge = await judgeCase({
						testCase,
						run,
						model: options.judgeModel,
						thinkingLevel: options.judgeThinkingLevel
					});
				}
				runs.push(run);
				printRun(run);
			}
		}
	}

	const report = {
		generatedAt: new Date().toISOString(),
		fixture: path.relative(process.cwd(), fixturePath),
		baseUrl: options.baseUrl,
		options: {
			models: options.models,
			thinkingLevels: options.thinkingLevels,
			judge: options.judge,
			judgeModel: options.judgeModel,
			judgeThinkingLevel: options.judgeThinkingLevel,
			includePrompts: options.includePrompts
		},
		summary: summarize(runs),
		runs
	};

	mkdirSync(path.dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);

	if (
		runs.some((run) => !run.ok || run.expectedVerdict === 'outside_expected_range') ||
		(options.failOnJudge && runs.some((run) => run.judge?.verdict === 'fail'))
	) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack || error.message : error);
	process.exitCode = 1;
});
