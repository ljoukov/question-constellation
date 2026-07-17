import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { spawnSync } from 'node:child_process';
import {
	assertLearnerVisibleAssetBundleCurrent,
	assertVerifiedLearnerAssetCopiesCurrent,
	remapPaperToVerifiedLearnerAssets,
	stageLearnerVisibleAssetBundle,
	stageVerifiedLearnerAssetCopies
} from '../../../scripts/lib/learner-visible-asset-binding.mjs';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'learner-asset-binding-'));
	roots.push(root);
	const assetPath = path.join(root, 'extract', 'figure-1.png');
	const otherPath = path.join(root, 'extract', 'figure-2.png');
	mkdirSync(path.dirname(assetPath), { recursive: true });
	writeFileSync(assetPath, Buffer.from('exact figure one'));
	writeFileSync(otherPath, Buffer.from('exact figure two'));
	const paper = {
		sourceDocument: { id: 'paper-1' },
		questions: [
			{
				sourceQuestionRef: '01.1',
				assets: [
					{
						assetId: 'figure-1',
						sourceLabel: 'Figure 1',
						filePath: 'extract/figure-1.png'
					}
				],
				stemBlocks: [{ kind: 'figure', assetId: 'figure-1' }]
			}
		],
		localAssetManifest: [
			{ assetId: 'figure-1', filePath: 'extract/figure-1.png' },
			{ assetId: 'unused', filePath: 'extract/figure-2.png' }
		]
	};
	const bundle = stageLearnerVisibleAssetBundle({
		paper,
		rootDir: root,
		bundleRoot: path.join(root, 'bundle'),
		sourceDocumentId: 'paper-1'
	});
	return { root, assetPath, otherPath, paper, bundle };
}

describe('learner-visible binary asset binding', () => {
	it('binds only referenced local assets and stages exact read-only copies', () => {
		const { root, paper, bundle } = fixture();
		expect(bundle.manifest.assetCount).toBe(1);
		expect(bundle.manifest.entries[0].sourcePath).toBe('extract/figure-1.png');
		expect(
			bundle.manifest.entries[0].references.map(
				(entry: { jsonPointer: string }) => entry.jsonPointer
			)
		).toEqual(['/localAssetManifest/0/filePath', '/questions/0/assets/0/filePath']);
		expect(() =>
			assertLearnerVisibleAssetBundleCurrent({
				paper,
				manifest: bundle.manifest,
				rootDir: root
			})
		).not.toThrow();

		const copies = stageVerifiedLearnerAssetCopies({
			manifest: bundle.manifest,
			rootDir: root,
			destinationRoot: path.join(root, 'judge', 'assets')
		});
		expect(() =>
			assertVerifiedLearnerAssetCopiesCurrent({
				manifest: bundle.manifest,
				attestation: copies,
				rootDir: root
			})
		).not.toThrow();
		const remapped = remapPaperToVerifiedLearnerAssets({
			paper,
			manifest: bundle.manifest,
			attestation: copies,
			rootDir: root
		});
		expect(remapped.questions[0].assets[0].filePath).toBe('assets/figure-1.png');
		expect(remapped.localAssetManifest[0].filePath).toBe('assets/figure-1.png');
		expect(readFileSync(path.join(root, 'judge', 'assets', 'figure-1.png'), 'utf8')).toBe(
			'exact figure one'
		);
	});

	it('fails closed on source, bundle snapshot, or consumer-copy mutation', () => {
		const sourceMutation = fixture();
		writeFileSync(sourceMutation.assetPath, Buffer.from('mutated source bytes'));
		expect(() =>
			assertLearnerVisibleAssetBundleCurrent({
				paper: sourceMutation.paper,
				manifest: sourceMutation.bundle.manifest,
				rootDir: sourceMutation.root
			})
		).toThrow(/exact SHA-256\/size binding/);

		const snapshotMutation = fixture();
		const snapshotPath = path.join(
			snapshotMutation.root,
			snapshotMutation.bundle.manifest.entries[0].snapshotPath
		);
		chmodSync(snapshotPath, 0o644);
		writeFileSync(snapshotPath, Buffer.from('mutated snapshot'));
		expect(() =>
			assertLearnerVisibleAssetBundleCurrent({
				paper: snapshotMutation.paper,
				manifest: snapshotMutation.bundle.manifest,
				rootDir: snapshotMutation.root
			})
		).toThrow(/exact SHA-256\/size binding/);

		const consumerMutation = fixture();
		const copies = stageVerifiedLearnerAssetCopies({
			manifest: consumerMutation.bundle.manifest,
			rootDir: consumerMutation.root,
			destinationRoot: path.join(consumerMutation.root, 'judge', 'assets')
		});
		const consumerPath = path.join(consumerMutation.root, copies.entries[0].consumerSnapshot.path);
		chmodSync(consumerPath, 0o644);
		writeFileSync(consumerPath, Buffer.from('mutated consumer'));
		expect(() =>
			assertVerifiedLearnerAssetCopiesCurrent({
				manifest: consumerMutation.bundle.manifest,
				attestation: copies,
				rootDir: consumerMutation.root
			})
		).toThrow(/exact SHA-256\/size binding/);
	});

	it('rejects missing, extra, or path-swapped manifest entries', () => {
		const missing = fixture();
		missing.bundle.manifest.entries = [];
		missing.bundle.manifest.assetCount = 0;
		expect(() =>
			assertLearnerVisibleAssetBundleCurrent({
				paper: missing.paper,
				manifest: missing.bundle.manifest,
				rootDir: missing.root
			})
		).toThrow(/missing or extra/);

		const extra = fixture();
		extra.bundle.manifest.entries.push({
			...extra.bundle.manifest.entries[0],
			sourcePath: 'extract/figure-2.png',
			snapshotPath: extra.bundle.manifest.entries[0].snapshotPath,
			r2Key: 'images/papers/paper-1/figure-2.png',
			publicPath: '/images/papers/paper-1/figure-2.png'
		});
		extra.bundle.manifest.assetCount = 2;
		expect(() =>
			assertLearnerVisibleAssetBundleCurrent({
				paper: extra.paper,
				manifest: extra.bundle.manifest,
				rootDir: extra.root
			})
		).toThrow(/missing or extra/);

		const swapped = fixture();
		swapped.paper.questions[0].assets[0].filePath = 'extract/figure-2.png';
		expect(() =>
			assertLearnerVisibleAssetBundleCurrent({
				paper: swapped.paper,
				manifest: swapped.bundle.manifest,
				rootDir: swapped.root
			})
		).toThrow(/missing or extra/);
	});

	it('rejects missing files and delivery-basename collisions before staging', () => {
		const { root, paper } = fixture();
		paper.questions[0].assets[0].filePath = 'extract/missing.png';
		expect(() =>
			stageLearnerVisibleAssetBundle({
				paper,
				rootDir: root,
				bundleRoot: path.join(root, 'missing-bundle'),
				sourceDocumentId: 'paper-1'
			})
		).toThrow(/is missing/);

		const duplicateDir = path.join(root, 'other');
		writeFileSync(path.join(root, 'extract', 'same.png'), Buffer.from('one'));
		mkdirSync(duplicateDir, { recursive: true });
		writeFileSync(path.join(duplicateDir, 'same.png'), Buffer.from('two'));
		paper.questions[0].assets = [
			{ assetId: 'a', sourceLabel: 'Asset A', filePath: 'extract/same.png' },
			{ assetId: 'b', sourceLabel: 'Asset B', filePath: 'other/same.png' }
		];
		paper.localAssetManifest = [];
		expect(() =>
			stageLearnerVisibleAssetBundle({
				paper,
				rootDir: root,
				bundleRoot: path.join(root, 'collision-bundle'),
				sourceDocumentId: 'paper-1'
			})
		).toThrow(/collide on delivery basename/);
	});

	it('plans R2 staged-byte readback only after solvability and before D1 publication', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'learner-asset-order-'));
		roots.push(root);
		const questionPaper = path.join(root, 'question-paper.pdf');
		const markScheme = path.join(root, 'mark-scheme.pdf');
		writeFileSync(questionPaper, 'question paper fixture');
		writeFileSync(markScheme, 'mark scheme fixture');
		const result = spawnSync(
			process.execPath,
			[
				'scripts/run-codex-production-import-pipeline.mjs',
				`--question-paper=${questionPaper}`,
				`--mark-scheme=${markScheme}`,
				'--source-document-id=learner-asset-order-fixture',
				'--import',
				'--dry-run'
			],
			{ cwd: process.cwd(), encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(0);
		const plan = JSON.parse(result.stdout) as {
			commands: string[][];
			plan: { learnerAssetManifestPath: string };
		};
		const commands = plan.commands;
		const solvabilityIndex = commands.findIndex(
			(command) => command[0] === 'scripts/run-codex-solvability-judge.mjs'
		);
		const uploadIndex = commands.findIndex(
			(command) => command[0] === 'scripts/upload-r2-images.mjs'
		);
		const importIndex = commands.findIndex(
			(command) =>
				command[0] === 'scripts/prepare-import-ready-extraction.mjs' && command.includes('--import')
		);
		expect(solvabilityIndex).toBeGreaterThan(-1);
		expect(uploadIndex).toBeGreaterThan(solvabilityIndex);
		expect(importIndex).toBeGreaterThan(uploadIndex);
		expect(commands[uploadIndex]).toContainEqual(expect.stringMatching(/^--asset-manifest=/));
		expect(commands[uploadIndex]).toContainEqual(
			expect.stringMatching(/^--expected-asset-manifest-sha256=/)
		);
		expect(plan.plan.learnerAssetManifestPath).toMatch(/verified-learner-assets\/manifest\.json$/);
		for (const command of commands.filter((entry) =>
			[
				'scripts/run-codex-extraction-judge.mjs',
				'scripts/run-codex-answer-chains.mjs',
				'scripts/run-codex-solvability-judge.mjs',
				'scripts/prepare-import-ready-extraction.mjs'
			].includes(entry[0])
		)) {
			expect(command).toContainEqual(expect.stringMatching(/^--asset-manifest=/));
		}
	});
});
