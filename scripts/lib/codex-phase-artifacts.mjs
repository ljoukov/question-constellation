// @ts-nocheck -- Operator artifacts are validated by explicit runtime digest and schema guards.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const CODEX_PHASE_ARTIFACT_SCHEMA = 'codex-phase-artifacts-v1';

export function stableJsonStringify(value) {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value))
		return `[${value.map((entry) => stableJsonStringify(entry)).join(',')}]`;
	return `{${Object.keys(value)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`)
		.join(',')}}`;
}

export function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

export function canonicalJsonSha256(value) {
	return sha256(stableJsonStringify(value));
}

export function fileSha256(filePath) {
	if (!existsSync(filePath)) return null;
	return sha256(readFileSync(filePath));
}

export function canonicalJsonFileSha256(filePath) {
	if (!existsSync(filePath)) return null;
	return canonicalJsonSha256(JSON.parse(readFileSync(filePath, 'utf8')));
}

export function binaryArtifact(filePath, { rootDir = process.cwd() } = {}) {
	return {
		path: relativePath(rootDir, filePath),
		sha256: fileSha256(filePath)
	};
}

export function jsonArtifact(filePath, { rootDir = process.cwd() } = {}) {
	return {
		...binaryArtifact(filePath, { rootDir }),
		canonicalJsonSha256: canonicalJsonFileSha256(filePath)
	};
}

export function binaryArtifactMatches(record, filePath) {
	return validDigest(record?.sha256) && record.sha256 === fileSha256(filePath);
}

export function jsonArtifactMatches(record, filePath) {
	return (
		validDigest(record?.canonicalJsonSha256) &&
		record.canonicalJsonSha256 === canonicalJsonFileSha256(filePath)
	);
}

export function jsonValueMatches(record, value) {
	return (
		validDigest(record?.canonicalJsonSha256) &&
		record.canonicalJsonSha256 === canonicalJsonSha256(value)
	);
}

export function phaseArtifacts({ inputs = {}, outputs = {}, attestation = null } = {}) {
	return {
		schemaVersion: CODEX_PHASE_ARTIFACT_SCHEMA,
		inputs,
		outputs,
		...(attestation ? { attestation } : {})
	};
}

export function phaseArtifactSchemaMatches(value) {
	return value?.schemaVersion === CODEX_PHASE_ARTIFACT_SCHEMA;
}

export function withoutLocalArtifactPaths(value) {
	if (Array.isArray(value)) return value.map(withoutLocalArtifactPaths);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => !['filePath', 'publicPath', 'r2Key'].includes(key))
			.map(([key, child]) => [key, withoutLocalArtifactPaths(child)])
	);
}

function relativePath(rootDir, filePath) {
	return path.relative(rootDir, path.resolve(filePath)).replaceAll(path.sep, '/');
}

function validDigest(value) {
	return /^[a-f0-9]{64}$/.test(String(value ?? ''));
}
