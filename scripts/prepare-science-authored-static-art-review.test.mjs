import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	buildAuthoredStaticReviewManifest,
	parseArgs
} from './prepare-science-authored-static-art-review.mjs';
import { sha256, validateQuestionArtManifest } from './lib/science-challenge-release.mjs';

test('authored-static manifest binds current question, source paths and exact theme bytes', () => {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'authored-static-manifest-')));
	try {
		const darkPath = 'static/product/test/recessive-dark-v2.webp';
		const lightPath = 'static/product/test/recessive-light-v2.webp';
		mkdirSync(path.dirname(path.join(root, darkPath)), { recursive: true });
		writeFileSync(path.join(root, darkPath), Buffer.from('dark-bytes'));
		writeFileSync(path.join(root, lightPath), Buffer.from('light-bytes'));
		const manifest = buildAuthoredStaticReviewManifest({
			repositoryRoot: root,
			releaseId: 'authored-static-review-v1',
			rows: [
				{
					definition: {
						id: 'biology-recessive-inheritance',
						subject: 'biology',
						previewQuestion:
							'A recessive condition uses allele r. Two heterozygous parents, Rr and Rr, have a child.'
					},
					visual: {
						cardArt: {
							darkSrc: '/product/test/recessive-dark-v2.webp?rev=current',
							src: '/product/test/recessive-light-v2.webp?rev=current',
							alt: 'A blank Punnett square for Rr × Rr.'
						}
					}
				}
			]
		});
		assert.equal(validateQuestionArtManifest(manifest, { expectedCount: 1 }).status, 'passed');
		assert.equal(manifest.specs[0].question.includes('Rr and Rr'), true);
		assert.equal(manifest.cohort.sourceBindings[0].darkSourcePath, darkPath);
		assert.equal(
			manifest.cohort.sourceBindings[0].darkSourceSha256,
			sha256(Buffer.from('dark-bytes'))
		);
		assert.equal(
			manifest.cohort.sourceBindings[0].lightSourceSha256,
			sha256(Buffer.from('light-bytes'))
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('authored-static manifest validation rejects a conflicting conventional allele diagram', () => {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'authored-static-authority-')));
	try {
		for (const relative of [
			'static/product/test/recessive-dark-v2.webp',
			'static/product/test/recessive-light-v2.webp'
		]) {
			mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
			writeFileSync(path.join(root, relative), Buffer.from(relative));
		}
		const manifest = buildAuthoredStaticReviewManifest({
			repositoryRoot: root,
			releaseId: 'authored-static-review-v1',
			rows: [
				{
					definition: {
						id: 'biology-recessive-inheritance',
						subject: 'biology',
						previewQuestion:
							'A recessive condition uses allele r. Two heterozygous parents, Rr and Rr, have a child.'
					},
					visual: {
						cardArt: {
							darkSrc: '/product/test/recessive-dark-v2.webp',
							src: '/product/test/recessive-light-v2.webp',
							alt: 'A completed Punnett square for Aa × Aa.'
						}
					}
				}
			]
		});
		assert.match(
			validateQuestionArtManifest(manifest, { expectedCount: 1 }).issues.join('\n'),
			/introduces allele\/genotype symbol A\/a/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('authored-static CLI requires explicit immutable ids for generation candidates', () => {
	assert.throws(
		() => parseArgs(['--release-id=authored-static-repair-v1', '--generation-candidate']),
		/generation-candidate requires at least one explicit --id/
	);
	assert.deepEqual(
		parseArgs([
			'--release-id=authored-static-repair-v1',
			'--generation-candidate',
			'--id=biology-recessive-inheritance'
		]),
		{
			releaseId: 'authored-static-repair-v1',
			dryRun: false,
			generationCandidate: true,
			ids: ['biology-recessive-inheritance'],
			help: false
		}
	);
});
