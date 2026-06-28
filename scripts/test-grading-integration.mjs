#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

const rootDir = process.cwd();
const casesPath = path.join(rootDir, 'tests/integration/grading-cases.json');
const baseUrl = (process.env.GRADING_INTEGRATION_BASE_URL ?? 'http://127.0.0.1:5174').replace(
	/\/$/,
	''
);
const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
const printPrompts = process.env.GRADING_INTEGRATION_PRINT_PROMPTS === '1';

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function flattenText(value) {
	if (value == null) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) return value.map(flattenText).join(' ');
	if (typeof value === 'object') return Object.values(value).map(flattenText).join(' ');
	return '';
}

function includesAll(text, fragments) {
	const normalized = text.toLowerCase();
	return fragments.every((fragment) => normalized.includes(String(fragment).toLowerCase()));
}

async function postJson(url, body) {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const text = await response.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 300)}`);
	}
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} from ${url}: ${JSON.stringify(json)}`);
	}
	return json;
}

function parseSseEvent(rawEvent) {
	let event = 'message';
	const dataLines = [];
	for (const line of rawEvent.split(/\r?\n/)) {
		if (!line || line.startsWith(':')) continue;
		if (line.startsWith('event:')) {
			event = line.slice('event:'.length).trim();
			continue;
		}
		if (line.startsWith('data:')) {
			dataLines.push(line.slice('data:'.length).trimStart());
		}
	}
	return { event, data: dataLines.join('\n') };
}

async function postSse(url, body) {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
		body: JSON.stringify(body)
	});
	if (!response.ok || !response.body) {
		throw new Error(`HTTP ${response.status} from ${url}: ${await response.text()}`);
	}

	const events = [];
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let boundary = buffer.indexOf('\n\n');
		while (boundary >= 0) {
			const rawEvent = buffer.slice(0, boundary).trimEnd();
			buffer = buffer.slice(boundary + 2);
			if (rawEvent) events.push(parseSseEvent(rawEvent));
			boundary = buffer.indexOf('\n\n');
		}
	}
	buffer += decoder.decode();
	if (buffer.trim()) events.push(parseSseEvent(buffer.trim()));
	return events;
}

async function waitForServer() {
	const deadline = Date.now() + 15_000;
	let lastError;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${baseUrl}/experiments/questions/aqa-8464p1h-jun18/01.2`);
			if (response.ok) return;
			lastError = new Error(`HTTP ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await delay(500);
	}
	throw new Error(
		`Grading integration server did not respond at ${baseUrl}. Start it with scripts/dev-server.sh start 5174. Last error: ${
			lastError instanceof Error ? lastError.message : String(lastError)
		}`
	);
}

function assertTotals(testCase, response) {
	for (const [key, expected] of Object.entries(testCase.totals)) {
		assert(
			response.totals[key] === expected,
			`${testCase.name}: expected totals.${key}=${expected}, got ${response.totals[key]}`
		);
	}
}

function assertModel(testCase, response) {
	if (testCase.model === 'deterministic') {
		assert(
			response.model === 'deterministic',
			`${testCase.name}: expected deterministic model, got ${response.model}`
		);
		return;
	}

	const isProductionModel = (value) =>
		typeof value === 'string' && value.startsWith('chatgpt-gpt-');
	assert(
		response.model !== 'deterministic' && isProductionModel(response.model),
		`${testCase.name}: expected production ChatGPT model, got ${response.model}`
	);
	assert(
		isProductionModel(response.modelVersion),
		`${testCase.name}: expected ChatGPT model version, got ${response.modelVersion}`
	);
}

function assertChecklist(testCase, result) {
	const expectedChecklist = testCase.checklist ?? [];
	if (Number.isInteger(testCase.checklistLength)) {
		assert(
			result.checklist.length === testCase.checklistLength,
			`${testCase.name}: expected exactly ${testCase.checklistLength} checklist rows, got ${result.checklist.length}: ${JSON.stringify(
				result.checklist
			)}`
		);
	}

	assert(
		result.checklist.length >= expectedChecklist.length,
		`${testCase.name}: expected at least ${expectedChecklist.length} checklist rows, got ${result.checklist.length}`
	);

	for (const expected of expectedChecklist) {
		const match = result.checklist.find(
			(item) =>
				item.verdict === expected.verdict && includesAll(flattenText(item), expected.textIncludes)
		);
		assert(
			Boolean(match),
			`${testCase.name}: missing ${expected.verdict} checklist row containing ${expected.textIncludes.join(
				', '
			)}. Got ${JSON.stringify(result.checklist)}`
		);
	}
}

function assertModelAnswer(testCase, result) {
	const expectedFragments = testCase.modelAnswerIncludes ?? [];
	if (expectedFragments.length === 0) {
		assert(
			result.modelAnswer == null,
			`${testCase.name}: expected no model answer, got ${JSON.stringify(result.modelAnswer)}`
		);
		return;
	}

	assert(
		typeof result.modelAnswer === 'string' && result.modelAnswer.trim().length > 0,
		`${testCase.name}: expected a stored model answer`
	);
	assert(
		includesAll(result.modelAnswer, expectedFragments),
		`${testCase.name}: model answer did not contain ${expectedFragments.join(', ')}. Got ${result.modelAnswer}`
	);
}

function assertForbiddenText(testCase, response) {
	const text = response.results
		.map((result) =>
			flattenText([
				result.summary,
				result.nextStep,
				result.checklist,
				result.chain,
				result.modelAnswer
			])
		)
		.join(' ')
		.toLowerCase();
	for (const forbidden of testCase.forbidText ?? []) {
		assert(
			!text.includes(String(forbidden).toLowerCase()),
			`${testCase.name}: response contains forbidden text "${forbidden}"`
		);
	}
}

function assertResponseText(testCase, response) {
	const expectedFragments = testCase.responseTextIncludes ?? [];
	if (expectedFragments.length === 0) return;
	const text = flattenText(response.results);
	assert(
		includesAll(text, expectedFragments),
		`${testCase.name}: response text did not contain ${expectedFragments.join(', ')}. Got ${text}`
	);
}

function assertPrompt(testCase, response) {
	const expectedFragments = testCase.promptIncludes ?? [];
	if (expectedFragments.length === 0 && !printPrompts) return;
	if (response.model === 'deterministic' && expectedFragments.length === 0) {
		if (printPrompts) {
			console.log(
				`\n--- PROMPT ${testCase.name} ---\nNo LLM prompt; deterministic grading.\n--- END PROMPT ---\n`
			);
		}
		return;
	}

	assert(
		typeof response.debugPrompt === 'string' && response.debugPrompt.trim().length > 0,
		`${testCase.name}: expected debugPrompt from dev grading endpoint`
	);

	if (expectedFragments.length > 0) {
		assert(
			includesAll(response.debugPrompt, expectedFragments),
			`${testCase.name}: prompt did not contain ${expectedFragments.join(', ')}`
		);
	}

	if (printPrompts) {
		console.log(`\n--- PROMPT ${testCase.name} ---\n${response.debugPrompt}\n--- END PROMPT ---\n`);
	}
}

async function assertStreaming(testCase, url) {
	if (!testCase.streamPhases?.length) return;
	const events = await postSse(url, { answers: testCase.answers });
	const phases = events
		.filter((event) => event.event === 'status')
		.map((event) => JSON.parse(event.data).phase);
	for (const phase of testCase.streamPhases) {
		assert(
			phases.includes(phase),
			`${testCase.name}: expected streaming phase "${phase}", got ${phases.join(', ')}`
		);
	}
	const done = events.find((event) => event.event === 'done');
	assert(done, `${testCase.name}: streaming response did not include done event`);
	const response = JSON.parse(done.data);
	assertTotals(testCase, response);
	const result = response.results.find((candidate) => candidate.ref === testCase.ref);
	assert(result, `${testCase.name}: streaming done event had no result for ${testCase.ref}`);
	assertChecklist(testCase, result);
	assertModelAnswer(testCase, result);
	assertForbiddenText(testCase, response);
	assertResponseText(testCase, response);
	console.log(`PASS ${testCase.name} stream: ${phases.join(' -> ')}`);
}

async function runCase(testCase) {
	const url = `${baseUrl}/api/experiments/questions/${testCase.paperSlug}/${encodeURIComponent(
		testCase.ref
	)}/grade`;
	const response = await postJson(url, {
		answers: testCase.answers,
		includeDebugPrompt: printPrompts || Boolean(testCase.promptIncludes?.length)
	});
	const result = response.results.find((candidate) => candidate.ref === testCase.ref);

	assert(result, `${testCase.name}: no result for ${testCase.ref}`);
	assertPrompt(testCase, response);
	assertModel(testCase, response);
	assertTotals(testCase, response);
	assert(
		result.result === testCase.result,
		`${testCase.name}: expected result=${testCase.result}, got ${result.result}`
	);
	assertChecklist(testCase, result);
	assertModelAnswer(testCase, result);
	assertForbiddenText(testCase, response);
	assertResponseText(testCase, response);
	await assertStreaming(testCase, url);

	console.log(
		`PASS ${testCase.name}: ${response.model} ${response.totals.awardedMarks}/${response.totals.maxMarks}`
	);
}

await waitForServer();
for (const testCase of cases) {
	await runCase(testCase);
}
