import { validateShortRecallPrompt, type ShortRecallPrompt } from './shortRecall';
import { loadGeneratedScienceChallengeRuntimes } from './generatedRuntime';

export const GENERATED_SCIENCE_SHORT_RECALL_CONTENT_VERSION = 'generated-science-short-recall-v1';

const RUNTIME_SCHEMA = 'generated-science-challenge-runtime/v1';
const ACCEPTED_RELEASE_SCHEMA = 'science-challenge-release/v1';
const RUNTIME_PATH = /\/data\/challenges\/releases\/([^/]+)\/runtime\.json$/;
const ACCEPTED_RELEASE_PATH = /\/data\/challenges\/releases\/([^/]+)\/accepted-challenges\.json$/;
const PROMPT_BUNDLE_PATH = /\/data\/challenges\/releases\/([^/]+)\/short-recall-prompts\.json$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SUBJECTS = ['biology', 'chemistry', 'physics'] as const;
const PROMPT_KEYS = [
	'acceptedAliases',
	'canonicalAnswer',
	'challengeId',
	'contentVersion',
	'preferredHiddenStepIndex',
	'stem'
] as const;

type GeneratedSubject = (typeof SUBJECTS)[number];

type RuntimeDefinition = {
	id: string;
	subject: GeneratedSubject;
	[key: string]: unknown;
};

type GeneratedRuntime = {
	schemaVersion: typeof RUNTIME_SCHEMA;
	releaseId: string;
	definitions: RuntimeDefinition[];
	[key: string]: unknown;
};

type AcceptedRelease = {
	schemaVersion: typeof ACCEPTED_RELEASE_SCHEMA;
	release: {
		id: string;
		status: 'accepted';
		runtimeSha256: string;
		shortRecallBundleSha256: string;
		shortRecallCandidateSetSha256: string;
		[key: string]: unknown;
	};
	challenges: Array<{ definition: RuntimeDefinition; [key: string]: unknown }>;
	[key: string]: unknown;
};

export type GeneratedScienceShortRecallAcceptedReleaseEvidence = {
	releaseId: string;
	challengeIds: string[];
	runtimePath: string;
	acceptedReleasePath: string;
	promptBundlePath: string;
	runtimeSha256: string;
	shortRecallBundleSha256: string;
	shortRecallCandidateSetSha256: string;
};

export type LoadedGeneratedScienceShortRecall = {
	releaseIds: string[];
	challengeIds: string[];
	prompts: ShortRecallPrompt[];
	countsBySubject: Record<GeneratedSubject, number>;
	acceptedReleaseEvidence: GeneratedScienceShortRecallAcceptedReleaseEvidence | null;
};

/**
 * Load the generated prompt bundle only when all three accepted-release siblings agree exactly.
 * An absent release is a supported authored-only state; any partial, stale or tampered release is
 * a build error.
 */
export function loadGeneratedScienceShortRecallBundles(
	promptModules: Record<string, unknown>,
	runtimeModules: Record<string, unknown>,
	acceptedReleaseModules: Record<string, unknown>
): LoadedGeneratedScienceShortRecall {
	const promptEntries = indexedReleaseModules(promptModules, PROMPT_BUNDLE_PATH, 'prompt bundle');
	const runtimeEntries = indexedReleaseModules(runtimeModules, RUNTIME_PATH, 'runtime');
	const markerEntries = indexedReleaseModules(
		acceptedReleaseModules,
		ACCEPTED_RELEASE_PATH,
		'accepted marker'
	);
	const releaseIds = new Set([
		...promptEntries.keys(),
		...runtimeEntries.keys(),
		...markerEntries.keys()
	]);

	if (releaseIds.size === 0) {
		return {
			releaseIds: [],
			challengeIds: [],
			prompts: [],
			countsBySubject: emptySubjectCounts(),
			acceptedReleaseEvidence: null
		};
	}
	if (releaseIds.size !== 1) {
		throw new Error(
			`Generated short-recall loading requires exactly one accepted release, found ${releaseIds.size}.`
		);
	}

	const releaseId = [...releaseIds][0]!;
	const promptEntry = promptEntries.get(releaseId);
	const runtimeEntry = runtimeEntries.get(releaseId);
	const markerEntry = markerEntries.get(releaseId);
	if (!promptEntry || !runtimeEntry || !markerEntry) {
		const missing = [
			!promptEntry ? 'short-recall-prompts.json' : null,
			!runtimeEntry ? 'runtime.json' : null,
			!markerEntry ? 'accepted-challenges.json' : null
		].filter(Boolean);
		throw new Error(
			`Generated short-recall release ${releaseId} is orphaned; missing ${missing.join(', ')}.`
		);
	}

	const canonicalRuntime = loadGeneratedScienceChallengeRuntimes(
		{ [runtimeEntry.modulePath]: runtimeEntry.value },
		{ [markerEntry.modulePath]: markerEntry.value }
	);
	if (
		!sameStringArray(canonicalRuntime.releaseIds, [releaseId]) ||
		canonicalRuntime.definitions.length === 0
	) {
		throw new Error(
			`Generated short-recall release has no canonical accepted runtime membership: ${runtimeEntry.modulePath}`
		);
	}
	const runtime = validateRuntime(runtimeEntry.value, runtimeEntry.modulePath, releaseId);
	const marker = validateAcceptedRelease(markerEntry.value, markerEntry.modulePath, releaseId);
	const prompts = validatePromptBundle(promptEntry.value, promptEntry.modulePath);

	if (marker.release.runtimeSha256 !== canonicalJsonSha256(runtimeEntry.value)) {
		throw new Error(
			`Generated short-recall runtime differs from its accepted release hash: ${runtimeEntry.modulePath}`
		);
	}
	if (marker.release.shortRecallBundleSha256 !== canonicalJsonSha256(promptEntry.value)) {
		throw new Error(
			`Generated short-recall prompt bundle differs from its accepted release hash: ${promptEntry.modulePath}`
		);
	}
	if (marker.release.shortRecallCandidateSetSha256 !== canonicalJsonSha256(marker.challenges)) {
		throw new Error(
			`Generated short-recall candidate set differs from its accepted release hash: ${markerEntry.modulePath}`
		);
	}

	const runtimeIds = runtime.definitions.map((definition) => definition.id);
	if (
		!sameStringArray(
			runtimeIds,
			canonicalRuntime.definitions.map((definition) => definition.id)
		)
	) {
		throw new Error(
			`Generated short-recall membership differs from the canonical runtime: ${runtimeEntry.modulePath}`
		);
	}
	const acceptedIds = marker.challenges.map((entry) => entry.definition.id);
	const promptIds = prompts.map((prompt) => prompt.challengeId);
	if (!sameStringArray(runtimeIds, acceptedIds) || !sameStringArray(runtimeIds, promptIds)) {
		throw new Error(
			`Generated short-recall runtime, accepted marker and prompt bundle order differ for ${releaseId}.`
		);
	}
	for (let index = 0; index < runtime.definitions.length; index += 1) {
		if (
			canonicalJsonStringify(runtime.definitions[index]) !==
			canonicalJsonStringify(marker.challenges[index]?.definition)
		) {
			throw new Error(
				`Generated short-recall runtime definition differs from its accepted marker at index ${index}.`
			);
		}
	}

	const countsBySubject = emptySubjectCounts();
	for (const definition of runtime.definitions) countsBySubject[definition.subject] += 1;

	return {
		releaseIds: [releaseId],
		challengeIds: runtimeIds,
		prompts,
		countsBySubject,
		acceptedReleaseEvidence: {
			releaseId,
			challengeIds: runtimeIds,
			runtimePath: runtimeEntry.modulePath,
			acceptedReleasePath: markerEntry.modulePath,
			promptBundlePath: promptEntry.modulePath,
			runtimeSha256: marker.release.runtimeSha256,
			shortRecallBundleSha256: marker.release.shortRecallBundleSha256,
			shortRecallCandidateSetSha256: marker.release.shortRecallCandidateSetSha256
		}
	};
}

function indexedReleaseModules(
	modules: Record<string, unknown>,
	pathPattern: RegExp,
	label: string
): Map<string, { modulePath: string; value: unknown }> {
	const indexed = new Map<string, { modulePath: string; value: unknown }>();
	for (const [modulePath, value] of Object.entries(modules)) {
		const normalizedPath = modulePath.replaceAll('\\', '/');
		const match = normalizedPath.match(pathPattern);
		const releaseId = match?.[1];
		if (!releaseId || !safeId(releaseId)) {
			throw new Error(`Generated short-recall ${label} has an unsafe path: ${modulePath}`);
		}
		if (indexed.has(releaseId)) {
			throw new Error(`Generated short-recall ${label} is duplicated for ${releaseId}.`);
		}
		indexed.set(releaseId, { modulePath, value });
	}
	return indexed;
}

function validateRuntime(value: unknown, modulePath: string, releaseId: string): GeneratedRuntime {
	if (
		!isRecord(value) ||
		value.schemaVersion !== RUNTIME_SCHEMA ||
		value.releaseId !== releaseId ||
		!Array.isArray(value.definitions) ||
		value.definitions.length === 0
	) {
		throw new Error(`Generated short-recall runtime is malformed: ${modulePath}`);
	}
	const ids = new Set<string>();
	for (const definition of value.definitions) {
		if (
			!isRecord(definition) ||
			!safeId(definition.id) ||
			!isSubject(definition.subject) ||
			ids.has(definition.id)
		) {
			throw new Error(`Generated short-recall runtime definition is malformed: ${modulePath}`);
		}
		ids.add(definition.id);
	}
	return value as GeneratedRuntime;
}

function validateAcceptedRelease(
	value: unknown,
	modulePath: string,
	releaseId: string
): AcceptedRelease {
	if (
		!isRecord(value) ||
		value.schemaVersion !== ACCEPTED_RELEASE_SCHEMA ||
		!isRecord(value.release) ||
		value.release.id !== releaseId ||
		value.release.status !== 'accepted' ||
		!SHA256.test(String(value.release.runtimeSha256 ?? '')) ||
		!SHA256.test(String(value.release.shortRecallBundleSha256 ?? '')) ||
		!SHA256.test(String(value.release.shortRecallCandidateSetSha256 ?? '')) ||
		!Array.isArray(value.challenges) ||
		value.challenges.length === 0
	) {
		throw new Error(`Generated short-recall accepted marker is malformed: ${modulePath}`);
	}
	const ids = new Set<string>();
	for (const entry of value.challenges) {
		const definition = isRecord(entry) ? entry.definition : null;
		if (
			!isRecord(definition) ||
			!safeId(definition.id) ||
			!isSubject(definition.subject) ||
			ids.has(definition.id)
		) {
			throw new Error(
				`Generated short-recall accepted marker definition is malformed: ${modulePath}`
			);
		}
		ids.add(definition.id);
	}
	return value as AcceptedRelease;
}

function validatePromptBundle(value: unknown, modulePath: string): ShortRecallPrompt[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(`Generated short-recall prompt bundle is malformed: ${modulePath}`);
	}
	const prompts: ShortRecallPrompt[] = [];
	const ids = new Set<string>();
	for (const [index, candidate] of value.entries()) {
		if (
			!isRecord(candidate) ||
			!sameStringArray(Object.keys(candidate).sort(), [...PROMPT_KEYS]) ||
			candidate.contentVersion !== GENERATED_SCIENCE_SHORT_RECALL_CONTENT_VERSION
		) {
			throw new Error(
				`Generated short-recall prompt is malformed at index ${index}: ${modulePath}`
			);
		}
		const prompt = validateShortRecallPrompt(candidate);
		if (
			!prompt ||
			ids.has(prompt.challengeId) ||
			canonicalJsonStringify(prompt) !== canonicalJsonStringify(candidate)
		) {
			throw new Error(
				`Generated short-recall prompt is malformed at index ${index}: ${modulePath}`
			);
		}
		ids.add(prompt.challengeId);
		prompts.push(prompt);
	}
	return prompts;
}

function emptySubjectCounts(): Record<GeneratedSubject, number> {
	return { biology: 0, chemistry: 0, physics: 0 };
}

function isSubject(value: unknown): value is GeneratedSubject {
	return SUBJECTS.includes(value as GeneratedSubject);
}

function safeId(value: unknown): value is string {
	return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sortJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortJson);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
			.map((key) => [key, sortJson(value[key])])
	);
}

export function canonicalJsonStringify(value: unknown): string {
	const serialized = JSON.stringify(sortJson(value));
	if (serialized === undefined) throw new Error('Canonical JSON value is not serializable.');
	return serialized;
}

export function canonicalJsonSha256(value: unknown): string {
	return sha256Hex(canonicalJsonStringify(value));
}

function sha256Hex(value: string): string {
	const bytes = new TextEncoder().encode(value);
	const byteLength = Math.ceil((bytes.length + 9) / 64) * 64;
	const padded = new Uint8Array(byteLength);
	padded.set(bytes);
	padded[bytes.length] = 0x80;
	const bitLength = bytes.length * 8;
	const paddedView = new DataView(padded.buffer);
	paddedView.setUint32(byteLength - 8, Math.floor(bitLength / 0x100000000), false);
	paddedView.setUint32(byteLength - 4, bitLength >>> 0, false);

	const state = new Uint32Array([
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
	]);
	const words = new Uint32Array(64);
	for (let offset = 0; offset < byteLength; offset += 64) {
		for (let index = 0; index < 16; index += 1) {
			words[index] = paddedView.getUint32(offset + index * 4, false);
		}
		for (let index = 16; index < 64; index += 1) {
			const left = words[index - 15]!;
			const right = words[index - 2]!;
			const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
			const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
			words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
		}

		let a = state[0]!;
		let b = state[1]!;
		let c = state[2]!;
		let d = state[3]!;
		let e = state[4]!;
		let f = state[5]!;
		let g = state[6]!;
		let h = state[7]!;
		for (let index = 0; index < 64; index += 1) {
			const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
			const choice = (e & f) ^ (~e & g);
			const temporary1 = (h + sum1 + choice + SHA256_CONSTANTS[index]! + words[index]!) >>> 0;
			const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
			const majority = (a & b) ^ (a & c) ^ (b & c);
			const temporary2 = (sum0 + majority) >>> 0;
			h = g;
			g = f;
			f = e;
			e = (d + temporary1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (temporary1 + temporary2) >>> 0;
		}
		state[0] = (state[0]! + a) >>> 0;
		state[1] = (state[1]! + b) >>> 0;
		state[2] = (state[2]! + c) >>> 0;
		state[3] = (state[3]! + d) >>> 0;
		state[4] = (state[4]! + e) >>> 0;
		state[5] = (state[5]! + f) >>> 0;
		state[6] = (state[6]! + g) >>> 0;
		state[7] = (state[7]! + h) >>> 0;
	}
	return [...state].map((word) => word.toString(16).padStart(8, '0')).join('');
}

function rotateRight(value: number, count: number): number {
	return (value >>> count) | (value << (32 - count));
}

const SHA256_CONSTANTS = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const promptModules = import.meta.glob(
	'../../../data/challenges/releases/*/short-recall-prompts.json',
	{ eager: true, import: 'default' }
) as Record<string, unknown>;
const runtimeModules = import.meta.glob('../../../data/challenges/releases/*/runtime.json', {
	eager: true,
	import: 'default'
}) as Record<string, unknown>;
const acceptedReleaseModules = import.meta.glob(
	'../../../data/challenges/releases/*/accepted-challenges.json',
	{ eager: true, import: 'default' }
) as Record<string, unknown>;

const generatedShortRecall = loadGeneratedScienceShortRecallBundles(
	promptModules,
	runtimeModules,
	acceptedReleaseModules
);

export const generatedScienceShortRecallReleaseIds = generatedShortRecall.releaseIds;
export const generatedScienceShortRecallChallengeIds = generatedShortRecall.challengeIds;
export const generatedScienceShortRecallPrompts = generatedShortRecall.prompts;
export const generatedScienceShortRecallCountsBySubject = generatedShortRecall.countsBySubject;
export const generatedScienceShortRecallAcceptedReleaseEvidence =
	generatedShortRecall.acceptedReleaseEvidence;
export const GENERATED_SCIENCE_SHORT_RECALL_COUNT = generatedShortRecall.challengeIds.length;
export const GENERATED_SCIENCE_SHORT_RECALL_SUBJECT_COUNTS = Object.freeze({
	...generatedShortRecall.countsBySubject
});
