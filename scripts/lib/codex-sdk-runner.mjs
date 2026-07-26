import { Codex } from '@openai/codex-sdk';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

export const SELF_CONTAINED_STRUCTURED_TURN_INSTRUCTIONS = `# Self-contained structured turn

Do not use tools, run commands, inspect the filesystem, search for repository files, or read any files. All evidence is supplied directly in the turn input, including any attached local images. Evaluate only that supplied evidence and emit only the structured result required by the provided output schema.`;

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

/**
 * Run a self-contained structured turn from a dedicated temporary directory while
 * keeping prompts, event logs, summaries and outputs in the caller's artifact
 * workDir. This prevents repository instructions and unrelated project files
 * from becoming ambient agent context.
 */
export async function runCodexSdkTurnInTemporaryAgentDirectory(
	turnOptions,
	{
		prefix = 'codex-structured-agent-',
		forbiddenDirectories = [],
		temporaryRoot = tmpdir(),
		agentInstructions = SELF_CONTAINED_STRUCTURED_TURN_INSTRUCTIONS,
		runTurn = runCodexSdkTurn
	} = {}
) {
	if (!turnOptions || typeof turnOptions !== 'object' || Array.isArray(turnOptions)) {
		throw new Error('turnOptions must be an object.');
	}
	if (typeof runTurn !== 'function') throw new Error('runTurn must be a function.');
	assertNoForbiddenAdditionalDirectories(
		turnOptions.additionalDirectories ?? [],
		forbiddenDirectories
	);
	const agentWorkDir = createTemporaryCodexAgentWorkDir({
		prefix,
		forbiddenDirectories,
		temporaryRoot
	});
	try {
		if (typeof agentInstructions !== 'string' || !agentInstructions.trim()) {
			throw new Error('agentInstructions must be non-empty text.');
		}
		const instructionText = `${agentInstructions.trim()}\n`;
		writeFileSync(path.join(agentWorkDir, 'AGENTS.md'), instructionText, { flag: 'wx' });
		return await runTurn({
			...turnOptions,
			agentWorkDir,
			agentInstructionsSha256: sha256Text(instructionText)
		});
	} finally {
		removeTemporaryCodexAgentWorkDir(agentWorkDir, { prefix, temporaryRoot });
	}
}

export function createTemporaryCodexAgentWorkDir({
	prefix = 'codex-structured-agent-',
	forbiddenDirectories = [],
	temporaryRoot = tmpdir()
} = {}) {
	assertTemporaryAgentPrefix(prefix);
	const resolvedTemporaryRoot = requiredDirectory(temporaryRoot, 'temporaryRoot');
	const resolvedHome = path.resolve(homedir());
	if (resolvedTemporaryRoot === resolvedHome) {
		throw new Error('Codex agent temporaryRoot must not be HOME.');
	}
	if (!existsSync(resolvedTemporaryRoot) || !statSync(resolvedTemporaryRoot).isDirectory()) {
		throw new Error(`Codex agent temporaryRoot does not exist: ${resolvedTemporaryRoot}`);
	}
	const agentWorkDir = mkdtempSync(path.join(resolvedTemporaryRoot, prefix));
	try {
		for (const forbidden of normalizeDirectories(forbiddenDirectories, 'forbiddenDirectories')) {
			if (pathIsWithin(forbidden, agentWorkDir)) {
				throw new Error(
					`Codex agent working directory must be outside forbidden directory ${forbidden}.`
				);
			}
		}
		return agentWorkDir;
	} catch (error) {
		removeTemporaryCodexAgentWorkDir(agentWorkDir, {
			prefix,
			temporaryRoot: resolvedTemporaryRoot
		});
		throw error;
	}
}

function removeTemporaryCodexAgentWorkDir(agentWorkDir, { prefix, temporaryRoot }) {
	const resolvedTemporaryRoot = path.resolve(temporaryRoot);
	const resolvedAgentWorkDir = path.resolve(agentWorkDir);
	if (
		path.dirname(resolvedAgentWorkDir) !== resolvedTemporaryRoot ||
		!path.basename(resolvedAgentWorkDir).startsWith(prefix)
	) {
		throw new Error('Refusing to remove an unscoped Codex agent working directory.');
	}
	rmSync(resolvedAgentWorkDir, { recursive: true, force: true });
}

function assertTemporaryAgentPrefix(prefix) {
	if (
		typeof prefix !== 'string' ||
		!/^[a-z0-9][a-z0-9-]{5,79}-$/.test(prefix) ||
		prefix.includes('..')
	) {
		throw new Error(
			'Codex agent temp prefix must be a narrow lowercase alphanumeric/hyphen name ending in a hyphen.'
		);
	}
}

function requiredDirectory(value, label) {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`${label} must be a non-empty directory path.`);
	}
	return path.resolve(value);
}

function normalizeDirectories(values, label) {
	if (!Array.isArray(values)) throw new Error(`${label} must be an array.`);
	return values.map((value, index) => requiredDirectory(value, `${label}[${index}]`));
}

function pathIsWithin(parent, candidate) {
	const relative = path.relative(parent, candidate);
	return (
		relative === '' ||
		(!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
	);
}

function assertNoForbiddenAdditionalDirectories(additionalDirectories, forbiddenDirectories) {
	const additional = normalizeDirectories(additionalDirectories, 'additionalDirectories');
	const forbidden = normalizeDirectories(forbiddenDirectories, 'forbiddenDirectories');
	for (const allowedDirectory of additional) {
		for (const forbiddenDirectory of forbidden) {
			if (
				pathIsWithin(forbiddenDirectory, allowedDirectory) ||
				pathIsWithin(allowedDirectory, forbiddenDirectory)
			) {
				throw new Error(
					`Codex additional directory ${allowedDirectory} exposes forbidden directory ${forbiddenDirectory}.`
				);
			}
		}
	}
}

export async function runCodexSdkTurn({
	prompt,
	workDir,
	agentWorkDir = workDir,
	agentInstructionsSha256 = null,
	eventsPath,
	lastMessagePath,
	summaryPath,
	model = 'gpt-5.6-sol',
	thinkingLevel = 'medium',
	timeoutMs = 3_600_000,
	networkAccessEnabled = false,
	webSearchMode = 'disabled',
	additionalDirectories = [],
	outputSchema,
	imagePaths = [],
	structuredInput = null,
	sandboxMode = 'workspace-write',
	environmentMode = 'inherited'
}) {
	mkdirSync(workDir, { recursive: true });
	const resolvedAgentWorkDir = path.resolve(agentWorkDir);
	mkdirSync(resolvedAgentWorkDir, { recursive: true });
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
	const turnInput = buildCodexSdkTurnInput({ prompt, imagePaths, structuredInput });
	const inputEvidence = describeCodexSdkTurnInput(turnInput);
	try {
		const apiKey = codexApiKey();
		const codex = new Codex(codexOptions(apiKey, environmentMode));
		const thread = codex.startThread({
			model,
			modelReasoningEffort: thinkingLevel,
			sandboxMode,
			approvalPolicy: 'never',
			workingDirectory: resolvedAgentWorkDir,
			skipGitRepoCheck: true,
			networkAccessEnabled,
			webSearchMode,
			additionalDirectories
		});
		const streamed = await thread.runStreamed(turnInput, {
			signal: controller.signal,
			...(outputSchema ? { outputSchema } : {})
		});
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
		// The streamed `turn.failed` event often contains the actionable API error
		// (for example, an invalid structured-output schema). The SDK may then throw
		// a generic process-exit error while closing the stream; do not replace the
		// more specific failure we already captured.
		failedError ??= error instanceof Error ? error.message : String(error);
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
		agentWorkDir: resolvedAgentWorkDir,
		agentInstructionsSha256,
		startedAt,
		finishedAt: new Date().toISOString(),
		durationSeconds: Number(((performance.now() - started) / 1000).toFixed(3))
	});
	summary.inputEvidence = inputEvidence;
	summary.finalResponseSha256 = sha256Text(finalResponse);
	summary.eventLogSha256 = sha256File(eventsPath);
	summary.lastMessageFileSha256 =
		lastMessagePath && existsSync(lastMessagePath) ? sha256File(lastMessagePath) : null;
	if (summaryPath) {
		mkdirSync(path.dirname(summaryPath), { recursive: true });
		writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
	}
	if (failedError) throw new Error(failedError);
	return { ...summary, finalResponse };
}

export function buildCodexSdkTurnInput({ prompt, imagePaths = [], structuredInput = null }) {
	if (structuredInput != null && imagePaths.length > 0) {
		throw new Error('Pass either structuredInput or imagePaths, not both.');
	}
	if (structuredInput != null) {
		if (!Array.isArray(structuredInput) || structuredInput.length === 0) {
			throw new Error('structuredInput must be a non-empty array.');
		}
		const normalized = structuredInput.map((item, index) =>
			normalizeCodexInputItem(item, `structuredInput[${index}]`)
		);
		if (!normalized.some((item) => item.type === 'text')) {
			throw new Error('structuredInput must contain at least one text item.');
		}
		return normalized;
	}
	if (typeof prompt !== 'string' || prompt.trim().length === 0) {
		throw new Error('prompt must be non-empty text.');
	}
	if (!Array.isArray(imagePaths)) throw new Error('imagePaths must be an array.');
	if (imagePaths.length === 0) return prompt;
	return [
		{ type: 'text', text: prompt },
		...imagePaths.map((imagePath, index) =>
			normalizeCodexInputItem({ type: 'local_image', path: imagePath }, `imagePaths[${index}]`)
		)
	];
}

export function describeCodexSdkTurnInput(input) {
	const items =
		typeof input === 'string'
			? [{ type: 'text', text: input }]
			: input.map((item, index) => normalizeCodexInputItem(item, `input[${index}]`));
	const textParts = items.filter((item) => item.type === 'text').map((item) => item.text);
	const images = items
		.filter((item) => item.type === 'local_image')
		.map((item) => {
			const bytes = readFileSync(item.path);
			return {
				path: item.path,
				size: bytes.length,
				sha256: sha256Bytes(bytes)
			};
		});
	const payload = {
		mode: typeof input === 'string' ? 'text' : 'structured',
		textSha256: sha256Text(textParts.join('\n\n')),
		images
	};
	return {
		...payload,
		requestSha256: sha256Text(JSON.stringify(payload))
	};
}

function normalizeCodexInputItem(item, label) {
	if (!item || typeof item !== 'object' || Array.isArray(item)) {
		throw new Error(`${label} must be a structured Codex input item.`);
	}
	if (item.type === 'text') {
		if (typeof item.text !== 'string' || item.text.trim().length === 0) {
			throw new Error(`${label}.text must be non-empty.`);
		}
		return { type: 'text', text: item.text };
	}
	if (item.type === 'local_image') {
		if (typeof item.path !== 'string' || item.path.trim().length === 0) {
			throw new Error(`${label}.path must be non-empty.`);
		}
		const resolved = path.resolve(item.path);
		if (!existsSync(resolved) || !statSync(resolved).isFile()) {
			throw new Error(`${label} image does not exist: ${resolved}`);
		}
		return { type: 'local_image', path: resolved };
	}
	throw new Error(`${label}.type must be text or local_image.`);
}

function sha256Text(value) {
	return createHash('sha256').update(value).digest('hex');
}

function sha256Bytes(value) {
	return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function codexApiKey() {
	if (process.env.CODEX_API_KEY) return process.env.CODEX_API_KEY;
	const useOpenAiKey = ['1', 'true', 'yes'].includes(
		String(process.env.CODEX_USE_OPENAI_API_KEY ?? '').toLowerCase()
	);
	return useOpenAiKey ? (process.env.OPENAI_API_KEY ?? undefined) : undefined;
}

function codexOptions(apiKey, environmentMode) {
	if (!apiKey) {
		return {
			env:
				environmentMode === 'minimal'
					? codexMinimalSubscriptionEnvironment()
					: codexSubscriptionEnvironment()
		};
	}
	return {
		apiKey,
		env: codexEnvironment(apiKey)
	};
}

function codexMinimalSubscriptionEnvironment() {
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
		'CODEX_HOME',
		'CHATGPT_CODEX_PROXY_URL',
		'CHATGPT_CODEX_PROXY_API_KEY'
	];
	const env = {};
	for (const name of allowedNames) {
		if (process.env[name] !== undefined) env[name] = process.env[name];
	}
	return env;
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
