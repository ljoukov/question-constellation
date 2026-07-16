import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	buildRecallCompanionArtifacts,
	buildRecallCompanionArtifactsFromDurableDirectory,
	recallHashBoundCompanionEntries,
	recallRequiredDurableCompanionNames,
	verifyRecallCompanionArtifactFiles
} from '../../../scripts/lib/recall-card-artifacts.mjs';

describe('recall compiler companion identity', () => {
	it('hash-binds prompts, raw model outputs and normalized reviews byte-for-byte', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'recall-companions-'));
		try {
			const workDir = path.join(root, 'work');
			const artifactDir = path.join(root, 'durable');
			writeCompanions(workDir, artifactDir, false);
			const manifest = buildRecallCompanionArtifacts(workDir, {
				replacementReviewRun: false
			});
			expect(
				buildRecallCompanionArtifactsFromDurableDirectory(artifactDir, {
					replacementReviewRun: false
				})
			).toEqual(manifest);

			expect(() =>
				verifyRecallCompanionArtifactFiles(artifactDir, manifest, {
					replacementReviewRun: false
				})
			).not.toThrow();

			writeFileSync(path.join(artifactDir, 'full-review-model-output.json'), '{"tampered":true}\n');
			expect(() =>
				verifyRecallCompanionArtifactFiles(artifactDir, manifest, {
					replacementReviewRun: false
				})
			).toThrow(/companion hash differs: full-review-model-output\.json/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('requires the complete second-review trail when a cue was replaced', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'recall-replacement-companions-'));
		try {
			const workDir = path.join(root, 'work');
			const artifactDir = path.join(root, 'durable');
			writeCompanions(workDir, artifactDir, true);
			const manifest = buildRecallCompanionArtifacts(workDir, {
				replacementReviewRun: true
			});
			rmSync(path.join(artifactDir, 'final-cue-review.json'));

			expect(() =>
				verifyRecallCompanionArtifactFiles(artifactDir, manifest, {
					replacementReviewRun: true
				})
			).toThrow(/missing: final-cue-review\.json/);
			writeFileSync(path.join(artifactDir, 'final-cue-review.json'), 'restored\n');

			const noReplacementManifest = buildRecallCompanionArtifacts(workDir, {
				replacementReviewRun: false
			});
			expect(() =>
				verifyRecallCompanionArtifactFiles(artifactDir, noReplacementManifest, {
					replacementReviewRun: true
				})
			).toThrow(/missing cue-replacement-review-prompt\.txt/);

			rmSync(path.join(artifactDir, 'cue-replacement-codex-run-summary.json'));
			expect(() =>
				verifyRecallCompanionArtifactFiles(artifactDir, manifest, {
					replacementReviewRun: true
				})
			).toThrow(/missing: cue-replacement-codex-run-summary\.json/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

function writeCompanions(workDir: string, artifactDir: string, replacementReviewRun: boolean) {
	for (const name of recallRequiredDurableCompanionNames(replacementReviewRun)) {
		const durablePath = path.join(artifactDir, name);
		mkdirSync(path.dirname(durablePath), { recursive: true });
		writeFileSync(durablePath, `${name}:durable\n`);
	}
	for (const [index, entry] of recallHashBoundCompanionEntries(replacementReviewRun).entries()) {
		const workPath = path.join(workDir, entry.workPath);
		const durablePath = path.join(artifactDir, entry.name);
		mkdirSync(path.dirname(workPath), { recursive: true });
		mkdirSync(path.dirname(durablePath), { recursive: true });
		writeFileSync(workPath, `${entry.name}:${index}\n`);
		writeFileSync(durablePath, readFileSync(workPath));
	}
}
