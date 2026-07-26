import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
	buildScienceChallengeModelRunPolicyAttestation,
	parseScienceChallengeAuthoringEventLog,
	requireScienceChallengeAuthoringRunPolicy,
	requireScienceChallengeModelRunPolicy,
	validateScienceChallengeModelRunPolicyAttestation,
	validateScienceChallengeModelRunPolicy,
	validateScienceChallengeAuthoringRunPolicy
} from './science-challenge-authoring-run-policy.mjs';

test('accepts a successful tool-free max authoring run bound to its exact bytes', () => {
	const fixture = cleanFixture();
	const validation = validateScienceChallengeAuthoringRunPolicy(fixture);
	assert.equal(validation.status, 'passed');
	assert.deepEqual(validation.issues, []);
	assert.deepEqual(validation.agentMessages, [fixture.lastMessageBytes.toString('utf8')]);
	assert.equal(validation.hashes.eventLogSha256, fixture.summary.eventLogSha256);
	assert.equal(validation.hashes.lastMessageSha256, fixture.summary.lastMessageFileSha256);
});

test('accepts omitted optional hash and count bindings', () => {
	const fixture = cleanFixture();
	delete fixture.summary.eventLogSha256;
	delete fixture.summary.finalResponseSha256;
	delete fixture.summary.lastMessageFileSha256;
	delete fixture.summary.events;
	delete fixture.summary.agentMessages;
	assert.equal(validateScienceChallengeAuthoringRunPolicy(fixture).status, 'passed');
});

test('parses malformed JSONL safely and reports its source line', () => {
	const parsed = parseScienceChallengeAuthoringEventLog(
		'{"type":"thread.started"}\nnot-json\n{"type":"turn.completed"}\n'
	);
	assert.equal(parsed.status, 'failed');
	assert.match(parsed.issues.join('\n'), /line 2 is not valid JSON/);
	assert.deepEqual(
		parsed.events.map((event) => event.type),
		['thread.started', 'turn.completed']
	);

	const fixture = cleanFixture();
	fixture.eventLogBytes = Buffer.from('{"type":"thread.started"}\n{\n');
	assert.doesNotThrow(() => validateScienceChallengeAuthoringRunPolicy(fixture));
	assert.match(
		validateScienceChallengeAuthoringRunPolicy(fixture).issues.join('\n'),
		/line 2 is not valid JSON/
	);
});

test('rejects command, reasoning, error and failed-turn events outside the tight vocabulary', () => {
	for (const forbiddenEvent of [
		{ type: 'item.completed', item: { type: 'command_execution', command: 'pwd' } },
		{ type: 'item.completed', item: { type: 'reasoning', text: 'summary' } },
		{ type: 'error', message: 'failure' },
		{ type: 'turn.failed', error: { message: 'failure' } }
	]) {
		const fixture = cleanFixture({
			middleEvents: [
				forbiddenEvent,
				{ type: 'item.completed', item: { type: 'agent_message', text: LAST_MESSAGE } }
			]
		});
		const validation = validateScienceChallengeAuthoringRunPolicy(fixture);
		assert.equal(validation.status, 'failed');
		assert.match(validation.issues.join('\n'), /forbidden or out of order/);
	}
});

test('rejects missing, misplaced and duplicate lifecycle events', () => {
	const missingTerminal = cleanFixture();
	missingTerminal.eventLogBytes = eventBytes([
		{ type: 'thread.started', thread_id: 'thread-1' },
		{ type: 'turn.started' },
		{ type: 'item.completed', item: { type: 'agent_message', text: LAST_MESSAGE } }
	]);
	assert.match(
		validateScienceChallengeAuthoringRunPolicy(missingTerminal).issues.join('\n'),
		/must end with turn.completed/
	);

	const duplicateStart = cleanFixture({
		middleEvents: [
			{ type: 'turn.started' },
			{ type: 'item.completed', item: { type: 'agent_message', text: LAST_MESSAGE } }
		]
	});
	assert.match(
		validateScienceChallengeAuthoringRunPolicy(duplicateStart).issues.join('\n'),
		/forbidden or out of order/
	);
});

test('requires an agent message whose last text exactly equals last-message bytes', () => {
	const noMessage = cleanFixture({ middleEvents: [] });
	assert.match(
		validateScienceChallengeAuthoringRunPolicy(noMessage).issues.join('\n'),
		/at least one completed agent message/
	);

	const mismatch = cleanFixture();
	mismatch.lastMessageBytes = Buffer.from(`${LAST_MESSAGE}\n`);
	assert.match(
		validateScienceChallengeAuthoringRunPolicy(mismatch).issues.join('\n'),
		/does not equal the raw last-message bytes/
	);
});

test('rejects failed, wrong-model, wrong-thinking and non-zero action summaries', () => {
	for (const [field, value, expectedIssue] of [
		['status', 'failed', /status must be passed/],
		['error', 'model failure', /must not contain an error/],
		['model', 'gpt-5.6-terra', /model must be gpt-5.6-sol/],
		['thinkingLevel', 'high', /thinkingLevel must be max/],
		['commandActions', 1, /commandActions must be 0/],
		['failedCommandActions', 1, /failedCommandActions must be 0/],
		['webSearches', 1, /webSearches must be 0/],
		['fileChanges', 1, /fileChanges must be 0/]
	]) {
		const fixture = cleanFixture();
		fixture.summary[field] = value;
		const validation = validateScienceChallengeAuthoringRunPolicy(fixture);
		assert.equal(validation.status, 'failed');
		assert.match(validation.issues.join('\n'), expectedIssue);
	}
});

test('rejects missing zero-action summary counters rather than treating them as zero', () => {
	const fixture = cleanFixture();
	delete fixture.summary.commandActions;
	assert.match(
		validateScienceChallengeAuthoringRunPolicy(fixture).issues.join('\n'),
		/commandActions must be 0/
	);
});

test('rejects mismatched and malformed summary hash bindings', () => {
	for (const [field, value, expectedIssue] of [
		['eventLogSha256', '0'.repeat(64), /eventLogSha256 does not match/],
		['finalResponseSha256', '1'.repeat(64), /finalResponseSha256 does not match/],
		['lastMessageFileSha256', 'not-a-hash', /lastMessageFileSha256 must be a SHA-256/]
	]) {
		const fixture = cleanFixture();
		fixture.summary[field] = value;
		assert.match(
			validateScienceChallengeAuthoringRunPolicy(fixture).issues.join('\n'),
			expectedIssue
		);
	}
});

test('cross-checks optional event and agent-message counts', () => {
	const fixture = cleanFixture();
	fixture.summary.events += 1;
	fixture.summary.agentMessages += 1;
	const issues = validateScienceChallengeAuthoringRunPolicy(fixture).issues.join('\n');
	assert.match(issues, /events does not match/);
	assert.match(issues, /agentMessages does not match/);
});

test('throwing wrapper returns clean evidence and includes concrete failure issues', () => {
	const fixture = cleanFixture();
	assert.equal(requireScienceChallengeAuthoringRunPolicy(fixture).status, 'passed');
	fixture.summary.webSearches = 1;
	assert.throws(
		() => requireScienceChallengeAuthoringRunPolicy(fixture),
		/Science challenge authoring run violates policy:[\s\S]*webSearches must be 0/
	);
});

test('generic model-run core supports another release gate without changing authoring exports', () => {
	const fixture = cleanFixture();
	assert.equal(
		validateScienceChallengeModelRunPolicy({
			...fixture,
			expectedModel: 'gpt-5.6-sol',
			expectedThinkingLevel: 'max'
		}).status,
		'passed'
	);
	fixture.summary.commandActions = 1;
	assert.throws(
		() =>
			requireScienceChallengeModelRunPolicy({
				...fixture,
				expectedModel: 'gpt-5.6-sol',
				expectedThinkingLevel: 'max',
				policyLabel: 'Science challenge art review run'
			}),
		/Science challenge art review run violates policy:[\s\S]*commandActions must be 0/
	);
	assert.throws(
		() => requireScienceChallengeAuthoringRunPolicy(fixture),
		/Science challenge authoring run violates policy:/
	);
});

test('builds and replays a content-free durable policy attestation', () => {
	const fixture = cleanFixture();
	const attestation = buildScienceChallengeModelRunPolicyAttestation({
		...fixture,
		policyLabel: 'Fixture model run'
	});
	assert.doesNotMatch(JSON.stringify(attestation), /science-challenge-batch|thread-1/);
	assert.deepEqual(attestation.allowedEventVocabulary, [
		'thread.started',
		'turn.started',
		'item.completed:agent_message',
		'turn.completed'
	]);
	assert.equal(
		validateScienceChallengeModelRunPolicyAttestation({
			attestation,
			summary: fixture.summary,
			eventLogSha256: fixture.summary.eventLogSha256,
			eventCount: fixture.summary.events,
			lastMessageSha256: fixture.summary.lastMessageFileSha256
		}).status,
		'passed'
	);

	const relabelled = structuredClone(attestation);
	relabelled.commandActions = 1;
	relabelled.events = [{ type: 'command_execution', command: 'cat secret' }];
	const replay = validateScienceChallengeModelRunPolicyAttestation({
		attestation: relabelled,
		summary: fixture.summary,
		eventLogSha256: fixture.summary.eventLogSha256,
		eventCount: fixture.summary.events,
		lastMessageSha256: fixture.summary.lastMessageFileSha256
	});
	assert.equal(replay.status, 'failed');
	assert.match(replay.issues.join('\n'), /forbidden fields: events/);
	assert.match(replay.issues.join('\n'), /commandActions must be 0/);
});

const LAST_MESSAGE = '{"schemaVersion":"science-challenge-batch/v1","challenges":[]}';

function cleanFixture({ middleEvents } = {}) {
	const events = [
		{ type: 'thread.started', thread_id: 'thread-1' },
		{ type: 'turn.started' },
		...(middleEvents ?? [
			{ type: 'item.completed', item: { type: 'agent_message', text: LAST_MESSAGE } }
		]),
		{
			type: 'turn.completed',
			usage: { input_tokens: 100, output_tokens: 20 }
		}
	];
	const eventLogBytes = eventBytes(events);
	const lastMessageBytes = Buffer.from(LAST_MESSAGE);
	return {
		summary: {
			status: 'passed',
			error: null,
			model: 'gpt-5.6-sol',
			thinkingLevel: 'max',
			commandActions: 0,
			failedCommandActions: 0,
			webSearches: 0,
			fileChanges: 0,
			events: events.length,
			agentMessages: events.filter(
				(event) => event.type === 'item.completed' && event.item?.type === 'agent_message'
			).length,
			eventLogSha256: sha256(eventLogBytes),
			finalResponseSha256: sha256(lastMessageBytes),
			lastMessageFileSha256: sha256(lastMessageBytes)
		},
		eventLogBytes,
		lastMessageBytes
	};
}

function eventBytes(events) {
	return Buffer.from(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
