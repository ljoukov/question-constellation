import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
	assertBoundJsonInputCurrent,
	captureBoundJsonInput,
	exactJsonArtifactMatches,
	stageBoundJsonSnapshot
} from '../../../scripts/lib/phase-input-binding.mjs';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('generated phase input binding', () => {
	it('stages the exact captured bytes and detects source or snapshot mutation', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'phase-input-binding-'));
		roots.push(root);
		const sourcePath = path.join(root, 'source.json');
		const snapshotPath = path.join(root, 'snapshots', 'source.json');
		writeFileSync(sourcePath, '{"paper":"a","questions":[1]}\n');

		const source = captureBoundJsonInput(sourcePath, { rootDir: root });
		const snapshot = stageBoundJsonSnapshot(source, snapshotPath, { rootDir: root });
		expect(exactJsonArtifactMatches(source.artifact, snapshot.artifact)).toBe(true);
		expect(() => assertBoundJsonInputCurrent(source)).not.toThrow();

		writeFileSync(sourcePath, '{"paper":"b","questions":[1]}\n');
		expect(() => assertBoundJsonInputCurrent(source)).toThrow(/differs from its exact bound/);

		chmodSync(snapshotPath, 0o644);
		writeFileSync(snapshotPath, '{"paper":"a","questions":[2]}\n');
		expect(() => assertBoundJsonInputCurrent(snapshot)).toThrow(/differs from its exact bound/);
	});

	it('rejects a wrong expected byte or canonical JSON hash before a consumer runs', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'phase-input-digest-'));
		roots.push(root);
		const sourcePath = path.join(root, 'source.json');
		writeFileSync(sourcePath, '{"paper":"a"}\n');
		const captured = captureBoundJsonInput(sourcePath, { rootDir: root });

		expect(() =>
			captureBoundJsonInput(sourcePath, {
				rootDir: root,
				expectedSha256: '0'.repeat(64)
			})
		).toThrow(/byte SHA-256 differs/);
		expect(() =>
			captureBoundJsonInput(sourcePath, {
				rootDir: root,
				expectedCanonicalJsonSha256: 'f'.repeat(64)
			})
		).toThrow(/canonical JSON SHA-256 differs/);
		expect(
			captureBoundJsonInput(sourcePath, {
				rootDir: root,
				expectedSha256: captured.artifact.sha256,
				expectedCanonicalJsonSha256: captured.artifact.canonicalJsonSha256
			}).artifact
		).toEqual(captured.artifact);
	});
});
