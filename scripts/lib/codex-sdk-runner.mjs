import { Codex } from '@openai/codex-sdk';
import { performance } from 'node:perf_hooks';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function loadDotEnvFile(filePath) {
	if (!existsSync(filePath)) return;
	for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;
		const [, key, rawValue] = match;
		if (process.env[key] !== undefined) continue;
		let value = rawValue.trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] = value;
	}
}

export function loadDefaultEnv(rootDir) {
	loadDotEnvFile(path.join(rootDir, '.env'));
	loadDotEnvFile(path.join(rootDir, '.env.local'));
}

export async function runCodexSdkTurn({
	prompt,
	workDir,
	eventsPath,
	lastMessagePath,
	summaryPath,
	model = 'gpt-5.5',
	thinkingLevel = 'medium',
	timeoutMs = 3_600_000,
	networkAccessEnabled = false,
	webSearchMode = 'disabled',
	additionalDirectories = []
}) {
	mkdirSync(workDir, { recursive: true });
	mkdirSync(path.dirname(eventsPath), { recursive: true });
	writeFileSync(eventsPath, '');
	if (lastMessagePath) {
		mkdirSync(path.dirname(lastMessagePath), { recursive: true });
		writeFileSync(lastMessagePath, '');
	}
	const controller = new AbortController();
	const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
	const startedAt = new Date().toISOString();
	const started = performance.now();
	const events = [];
	let finalResponse = '';
	let threadId = null;
	let failedError = null;
	try {
		const apiKey = codexApiKey();
		const codex = new Codex(codexOptions(apiKey));
		const thread = codex.startThread({
			model,
			modelReasoningEffort: thinkingLevel,
			sandboxMode: 'workspace-write',
			approvalPolicy: 'never',
			workingDirectory: workDir,
			skipGitRepoCheck: true,
			networkAccessEnabled,
			webSearchMode,
			additionalDirectories
		});
		const streamed = await thread.runStreamed(prompt, { signal: controller.signal });
		for await (const event of streamed.events) {
			events.push(event);
			writeFileSync(eventsPath, `${JSON.stringify(event)}\n`, { flag: 'a' });
			if (event.type === 'thread.started') threadId = event.thread_id;
			if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
				finalResponse = event.item.text ?? '';
				if (lastMessagePath) writeFileSync(lastMessagePath, finalResponse);
			}
			if (event.type === 'turn.failed') failedError = event.error?.message ?? 'Codex turn failed.';
		}
	} catch (error) {
		failedError = error instanceof Error ? error.message : String(error);
	} finally {
		if (timer) clearTimeout(timer);
	}
	const summary = summarizeCodexEvents(events, {
		status: failedError ? 'failed' : 'passed',
		error: failedError,
		threadId,
		model,
		thinkingLevel,
		workDir,
		startedAt,
		finishedAt: new Date().toISOString(),
		durationSeconds: Number(((performance.now() - started) / 1000).toFixed(3))
	});
	if (summaryPath) {
		mkdirSync(path.dirname(summaryPath), { recursive: true });
		writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
	}
	if (failedError) throw new Error(failedError);
	return { ...summary, finalResponse };
}

function codexApiKey() {
	if (process.env.CODEX_API_KEY) return process.env.CODEX_API_KEY;
	const useOpenAiKey = ['1', 'true', 'yes'].includes(
		String(process.env.CODEX_USE_OPENAI_API_KEY ?? '').toLowerCase()
	);
	return useOpenAiKey ? (process.env.OPENAI_API_KEY ?? undefined) : undefined;
}

function codexOptions(apiKey) {
	if (!apiKey) return { env: codexSubscriptionEnvironment() };
	return {
		apiKey,
		env: codexEnvironment(apiKey)
	};
}

function codexSubscriptionEnvironment() {
	const env = {};
	for (const [name, value] of Object.entries(process.env)) {
		if (value === undefined) continue;
		if (/^OPENAI_/i.test(name)) continue;
		if (name === 'CODEX_API_KEY') continue;
		env[name] = value;
	}
	return env;
}

export function summarizeCodexEvents(events, base = {}) {
	const completedCommands = events.filter(
		(event) => event.type === 'item.completed' && event.item?.type === 'command_execution'
	);
	const failedCommands = completedCommands.filter(
		(event) => event.item?.status === 'failed' || Number(event.item?.exit_code ?? 0) !== 0
	);
	const fileChanges = events
		.filter((event) => event.type === 'item.completed' && event.item?.type === 'file_change')
		.flatMap((event) => event.item?.changes ?? []);
	const usage =
		events.filter((event) => event.type === 'turn.completed').slice(-1)[0]?.usage ?? null;
	return {
		...base,
		events: events.length,
		commandActions: completedCommands.length,
		failedCommandActions: failedCommands.length,
		agentMessages: events.filter(
			(event) => event.type === 'item.completed' && event.item?.type === 'agent_message'
		).length,
		reasoningSummaries: events.filter(
			(event) => event.type === 'item.completed' && event.item?.type === 'reasoning'
		).length,
		webSearches: events.filter(
			(event) => event.type === 'item.completed' && event.item?.type === 'web_search'
		).length,
		fileChanges: fileChanges.length,
		usage,
		failedCommands: failedCommands.map((event) => ({
			command: event.item.command,
			exitCode: event.item.exit_code ?? null
		}))
	};
}

function codexEnvironment(apiKey) {
	const allowedNames = [
		'PATH',
		'HOME',
		'SHELL',
		'USER',
		'LOGNAME',
		'TMPDIR',
		'TEMP',
		'TMP',
		'LANG',
		'LC_ALL',
		'HTTP_PROXY',
		'HTTPS_PROXY',
		'NO_PROXY',
		'OPENAI_BASE_URL',
		'CODEX_HOME'
	];
	const env = {};
	for (const name of allowedNames) {
		if (process.env[name] !== undefined) env[name] = process.env[name];
	}
	if (apiKey) env.CODEX_API_KEY = apiKey;
	return env;
}
