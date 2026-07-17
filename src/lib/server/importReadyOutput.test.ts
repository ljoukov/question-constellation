import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { jsonArtifact } from '../../../scripts/lib/codex-phase-artifacts.mjs';
import { resolveSingleImportReadyOutput } from '../../../scripts/lib/import-ready-output.mjs';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('import-ready output binding', () => {
	it('resolves the exact returned artifact instead of assuming the input filename', () => {
		const fixture = outputFixture();
		expect(
			resolveSingleImportReadyOutput({
				summary: fixture.summary,
				rootDir: fixture.root,
				outputRoot: fixture.outputRoot,
				sourceDocumentId: 'paper-source-id'
			})
		).toBe(fixture.outputPath);
	});

	it('rejects ambiguous, escaped, mutated, or wrong-paper outputs', () => {
		const fixture = outputFixture();
		expect(() =>
			resolveSingleImportReadyOutput({
				summary: { ...fixture.summary, outputArtifacts: [] },
				rootDir: fixture.root,
				outputRoot: fixture.outputRoot,
				sourceDocumentId: 'paper-source-id'
			})
		).toThrow(/exactly one paper artifact/i);
		expect(() =>
			resolveSingleImportReadyOutput({
				summary: {
					...fixture.summary,
					outputArtifacts: [{ ...fixture.summary.outputArtifacts[0], path: 'outside.json' }]
				},
				rootDir: fixture.root,
				outputRoot: fixture.outputRoot,
				sourceDocumentId: 'paper-source-id'
			})
		).toThrow(/escaped/i);

		writeFileSync(fixture.outputPath, '{"changed":true}\n');
		expect(() =>
			resolveSingleImportReadyOutput({
				summary: fixture.summary,
				rootDir: fixture.root,
				outputRoot: fixture.outputRoot,
				sourceDocumentId: 'paper-source-id'
			})
		).toThrow(/artifact hashes/i);

		const wrong = outputFixture('different-paper');
		expect(() =>
			resolveSingleImportReadyOutput({
				summary: wrong.summary,
				rootDir: wrong.root,
				outputRoot: wrong.outputRoot,
				sourceDocumentId: 'paper-source-id'
			})
		).toThrow(/different or empty paper/i);
	});
});

function outputFixture(sourceDocumentId = 'paper-source-id') {
	const root = mkdtempSync(path.join(tmpdir(), 'import-ready-output-'));
	roots.push(root);
	const outputRoot = 'tmp/import-ready';
	const outputPath = path.join(root, outputRoot, 'chain-reconciled.json');
	mkdirSync(path.dirname(outputPath), { recursive: true });
	writeFileSync(
		outputPath,
		`${JSON.stringify({
			sourceDocument: { id: sourceDocumentId },
			questions: [{ sourceQuestionRef: '01.1' }]
		})}\n`
	);
	return {
		root,
		outputRoot,
		outputPath,
		summary: {
			status: 'passed',
			outputArtifacts: [jsonArtifact(outputPath, { rootDir: root })]
		}
	};
}
