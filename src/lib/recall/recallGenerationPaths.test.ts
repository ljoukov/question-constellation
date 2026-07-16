import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	assertStrictChild,
	portableRecallRunSummary,
	resolveRecallAcceptedArtifactPath,
	resolveRecallArtifactDirectory,
	resolveRecallGenerationDirectories
} from '../../../scripts/lib/recall-generation-paths.mjs';

describe('recall generation paths', () => {
	const rootDir = '/workspace/question-constellation';

	it('binds durable artifacts to the runtime run-id path', () => {
		const paths = resolveRecallGenerationDirectories({
			rootDir,
			runId: 'biology-cell-compiler-v6'
		});
		expect(paths.workDir).toBe(
			path.join(rootDir, 'tmp/recall-generation/biology-cell-compiler-v6')
		);
		expect(paths.artifactDir).toBe(
			path.join(rootDir, 'data/recall/generated/biology-cell-compiler-v6')
		);
		expect(resolveRecallAcceptedArtifactPath({ rootDir, runId: 'biology-cell-compiler-v6' })).toBe(
			path.join(rootDir, 'data/recall/generated/biology-cell-compiler-v6/accepted-cards.json')
		);
	});

	it('stores scratch work directories as portable repository-relative provenance', () => {
		const source = {
			status: 'passed',
			workDir: path.join(rootDir, 'tmp/recall-generation/run/generator')
		};
		expect(portableRecallRunSummary(source, rootDir)).toEqual({
			status: 'passed',
			workDir: 'tmp/recall-generation/run/generator'
		});
		expect(source.workDir).toBe(path.join(rootDir, 'tmp/recall-generation/run/generator'));
		expect(() =>
			portableRecallRunSummary({ workDir: '/private/outside-workspace' }, rootDir)
		).toThrow('must be a strict child');
	});

	it('allows a custom work directory only below the recall scratch root', () => {
		expect(
			resolveRecallGenerationDirectories({
				rootDir,
				runId: 'run-one',
				workDir: 'tmp/recall-generation/scratch/run-one'
			}).workDir
		).toBe(path.join(rootDir, 'tmp/recall-generation/scratch/run-one'));
		expect(() =>
			resolveRecallGenerationDirectories({ rootDir, runId: 'run-one', workDir: rootDir })
		).toThrow('must be a strict child');
		expect(() =>
			resolveRecallGenerationDirectories({
				rootDir,
				runId: 'run-one',
				workDir: 'tmp/recall-generation/../../important'
			})
		).toThrow('must be a strict child');
		expect(() =>
			assertStrictChild(
				path.join(rootDir, 'tmp/recall-generation'),
				path.join(rootDir, 'tmp/recall-generation')
			)
		).toThrow('must be a strict child');
	});

	it('rejects artifact run ids that escape or collapse the durable run directory', () => {
		expect(() => resolveRecallArtifactDirectory({ rootDir, runId: '..' })).toThrow(
			'must be a strict child'
		);
		expect(() => resolveRecallArtifactDirectory({ rootDir, runId: '.' })).toThrow(
			'must be a strict child'
		);
	});
});
