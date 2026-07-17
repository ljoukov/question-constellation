import { readFileSync } from 'node:fs';
import path from 'node:path';
import { binaryArtifactMatches, jsonArtifactMatches } from './codex-phase-artifacts.mjs';

/**
 * @param {{
 *   summary: {
 *     status?: string,
 *     outputArtifacts?: Array<{
 *       path?: string,
 *       sha256?: string | null,
 *       canonicalJsonSha256?: string | null
 *     }>
 *   },
 *   rootDir?: string,
 *   outputRoot: string,
 *   sourceDocumentId: string
 * }} options
 * @returns {string}
 */
export function resolveSingleImportReadyOutput({
	summary,
	rootDir = process.cwd(),
	outputRoot,
	sourceDocumentId
}) {
	if (summary?.status !== 'passed') {
		throw new Error('Import-ready preparation did not return a passed summary.');
	}
	if (!Array.isArray(summary.outputArtifacts) || summary.outputArtifacts.length !== 1) {
		throw new Error('Import-ready preparation must emit exactly one paper artifact.');
	}

	const artifact = summary.outputArtifacts[0];
	if (!artifact?.path) {
		throw new Error('Import-ready preparation omitted its output artifact path.');
	}
	const resolvedRoot = path.resolve(rootDir);
	const resolvedOutputRoot = path.resolve(resolvedRoot, outputRoot);
	const resolvedOutput = path.resolve(resolvedRoot, artifact.path);
	if (
		resolvedOutput === resolvedOutputRoot ||
		!resolvedOutput.startsWith(`${resolvedOutputRoot}${path.sep}`)
	) {
		throw new Error('Import-ready output escaped the declared output root.');
	}
	if (
		!binaryArtifactMatches(artifact, resolvedOutput) ||
		!jsonArtifactMatches(artifact, resolvedOutput)
	) {
		throw new Error('Import-ready output differs from its returned artifact hashes.');
	}

	let paper;
	try {
		paper = JSON.parse(readFileSync(resolvedOutput, 'utf8'));
	} catch {
		throw new Error('Import-ready output is not valid JSON.');
	}
	if (
		paper?.sourceDocument?.id !== sourceDocumentId ||
		!Array.isArray(paper?.questions) ||
		paper.questions.length === 0
	) {
		throw new Error('Import-ready output belongs to a different or empty paper.');
	}
	return resolvedOutput;
}
