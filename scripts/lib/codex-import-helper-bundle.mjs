import { copyFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Copy the deterministic extraction helper with every local module it imports.
 * The resulting bundle must run from an isolated Codex paper work directory.
 *
 * @param {{rootDir?: string, workDir: string}} options
 */
export function copyCodexImportHelperBundle({ rootDir = process.cwd(), workDir }) {
	copyFileSync(
		path.join(rootDir, 'scripts/codex-import-helper.mjs'),
		path.join(workDir, 'helper.mjs')
	);
	copyFileSync(
		path.join(rootDir, 'src/lib/questionCardTitle.js'),
		path.join(workDir, 'question-card-title.js')
	);
	copyFileSync(
		path.join(rootDir, 'scripts/answer-chain-specificity.mjs'),
		path.join(workDir, 'answer-chain-specificity.mjs')
	);
	copyFileSync(
		path.join(rootDir, 'scripts/extraction-learner-guardrails.mjs'),
		path.join(workDir, 'extraction-learner-guardrails.mjs')
	);
}
