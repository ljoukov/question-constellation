import path from 'node:path';

/** @param {{rootDir:string, runId:string, workDir?:string|null}} input */
export function resolveRecallGenerationDirectories({ rootDir, runId, workDir }) {
	const workRoot = path.resolve(rootDir, 'tmp/recall-generation');
	const resolvedWorkDir = path.resolve(
		rootDir,
		workDir ?? path.join('tmp/recall-generation', runId)
	);
	assertStrictChild(workRoot, resolvedWorkDir, 'Recall generation work directory');
	return {
		workRoot,
		workDir: resolvedWorkDir,
		artifactDir: resolveRecallArtifactDirectory({ rootDir, runId })
	};
}

/** @param {{rootDir:string, runId:string}} input */
export function resolveRecallArtifactDirectory({ rootDir, runId }) {
	const artifactRoot = path.resolve(rootDir, 'data/recall/generated');
	const artifactDir = path.resolve(artifactRoot, String(runId));
	assertStrictChild(artifactRoot, artifactDir, 'Recall generation artifact directory');
	return artifactDir;
}

/** @param {{rootDir:string, runId:string}} input */
export function resolveRecallAcceptedArtifactPath({ rootDir, runId }) {
	return path.join(resolveRecallArtifactDirectory({ rootDir, runId }), 'accepted-cards.json');
}

/**
 * Durable provenance may describe the scratch directory, but must not retain a
 * machine-specific absolute workspace path.
 *
 * @param {Record<string, any>} summary
 * @param {string} rootDir
 */
export function portableRecallRunSummary(summary, rootDir) {
	const portable = { ...summary };
	if (typeof portable.workDir !== 'string') return portable;
	const workDir = path.resolve(rootDir, portable.workDir);
	assertStrictChild(rootDir, workDir, 'Recall run work directory');
	portable.workDir = path.relative(path.resolve(rootDir), workDir);
	return portable;
}

/** @param {string} parent @param {string} candidate @param {string} label */
export function assertStrictChild(parent, candidate, label = 'Path') {
	const relative = path.relative(path.resolve(parent), path.resolve(candidate));
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error(`${label} must be a strict child of ${path.resolve(parent)}.`);
	}
}
