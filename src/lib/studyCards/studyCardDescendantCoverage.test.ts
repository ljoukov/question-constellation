import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	assertStudyCardCurriculumScope,
	studyCardCurriculumScopeIssues
} from '../../../scripts/lib/study-card-import.mjs';

const rootDir = process.cwd();
const plannerPath = path.join(rootDir, 'scripts/plan-study-card-descendant-coverage.mjs');
const generatorPath = path.join(rootDir, 'scripts/generate-standard-study-card-batch.mjs');
const inheritedHigherComponent = 'aqa-gcse-combined-science-trilogy-8464-v1.1:6-5-5-1';

describe('study-card descendant coverage tier inheritance', () => {
	it('keeps descendants of a Higher-only parent out of Foundation/shared plans', () => {
		const output = execFileSync(process.execPath, [plannerPath], {
			cwd: rootDir,
			encoding: 'utf8'
		});
		const plan = JSON.parse(output) as {
			plans: Array<{
				specificationId: string;
				mode: string;
				uncoveredComponents: Array<{ id: string }>;
			}>;
		};
		const relevant = plan.plans.filter(
			(entry) => entry.specificationId === 'aqa-gcse-combined-science-trilogy-8464-v1.1'
		);

		expect(
			relevant
				.filter((entry) => entry.mode === 'shared')
				.flatMap((entry) => entry.uncoveredComponents)
				.some((component) => component.id === inheritedHigherComponent)
		).toBe(false);
		expect(
			relevant
				.filter((entry) => entry.mode === 'higher-only')
				.flatMap((entry) => entry.uncoveredComponents)
				.some((component) => component.id === inheritedHigherComponent)
		).toBe(true);
	});

	it('rejects a Foundation generation request for an inherited Higher-only descendant', () => {
		const result = spawnSync(
			process.execPath,
			[
				generatorPath,
				'--specification-id=aqa-gcse-combined-science-trilogy-8464-v1.1',
				'--subject=Physics',
				'--offering-id=aqa-gcse-combined-science-trilogy-8464-v1.1:physics:foundation',
				`--required-component-id=${inheritedHigherComponent}`,
				'--batch-id=inherited-higher-tier-guard-test'
			],
			{ cwd: rootDir, encoding: 'utf8' }
		);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('is Higher-only but a Foundation offering is selected');
	});

	it('rejects a mutated official source PDF before extraction or model use', () => {
		const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'study-card-pdf-pin-'));
		try {
			const catalog = JSON.parse(
				readFileSync(path.join(rootDir, 'data/curricula/curriculum-catalog.json'), 'utf8')
			);
			const specification = catalog.specifications.find(
				(entry: { id: string }) => entry.id === 'aqa-gcse-biology-8461-v1.0'
			);
			expect(specification).toBeDefined();
			const mutatedPdfPath = path.join(temporaryRoot, 'mutated-source.pdf');
			const catalogPath = path.join(temporaryRoot, 'catalog.json');
			writeFileSync(mutatedPdfPath, 'not the hash-locked official source\n');
			specification!.localPath = mutatedPdfPath;
			writeFileSync(catalogPath, JSON.stringify(catalog));

			const result = spawnSync(
				process.execPath,
				[
					generatorPath,
					`--catalog=${catalogPath}`,
					'--specification-id=aqa-gcse-biology-8461-v1.0',
					'--subject=Biology',
					'--offering-id=aqa-gcse-biology-8461-v1.0:foundation',
					'--required-component-id=aqa-gcse-biology-8461-v1.0:4-1-1',
					'--batch-id=mutated-source-pdf-guard-test'
				],
				{ cwd: rootDir, encoding: 'utf8' }
			);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('Official source PDF hash differs from the catalog lock');
			expect(result.stderr).not.toContain('Syntax Error');
		} finally {
			rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});

	it('fails a Foundation import even when only an ancestor is marked Higher-only', () => {
		const catalog = {
			offerings: [
				{
					id: 'physics:foundation',
					tier: 'Foundation',
					specificationId: 'physics-spec'
				},
				{
					id: 'physics:higher',
					tier: 'Higher',
					specificationId: 'physics-spec'
				}
			],
			specifications: [
				{
					id: 'physics-spec',
					components: [
						{ id: 'root', parentId: null, tier: ['Foundation', 'Higher'] },
						{ id: 'higher-section', parentId: 'root', tier: ['Higher'] },
						{
							id: 'misleading-shared-leaf',
							parentId: 'higher-section',
							tier: ['Foundation', 'Higher']
						}
					]
				}
			]
		};
		const foundationBundle = {
			cards: [
				{
					id: 'momentum-card',
					targets: [
						{
							offeringId: 'physics:foundation',
							curriculumComponentId: 'misleading-shared-leaf'
						}
					]
				}
			]
		};

		expect(studyCardCurriculumScopeIssues(foundationBundle, catalog)).toEqual([
			'momentum-card Foundation target misleading-shared-leaf is beneath Higher-only ancestor higher-section'
		]);
		expect(() => assertStudyCardCurriculumScope(foundationBundle, catalog)).toThrow(
			/Higher-only ancestor higher-section/
		);

		foundationBundle.cards[0].targets[0].offeringId = 'physics:higher';
		expect(() => assertStudyCardCurriculumScope(foundationBundle, catalog)).not.toThrow();
	});

	it('fails closed when import ancestry is unknown or cyclic', () => {
		const bundle = {
			cards: [
				{
					id: 'bad-card',
					targets: [
						{
							offeringId: 'physics:foundation',
							curriculumComponentId: 'leaf'
						}
					]
				}
			]
		};
		const catalog = {
			offerings: [
				{
					id: 'physics:foundation',
					tier: 'Foundation',
					specificationId: 'physics-spec'
				}
			],
			specifications: [
				{
					id: 'physics-spec',
					components: [{ id: 'leaf', parentId: 'missing', tier: ['Foundation', 'Higher'] }]
				}
			]
		};

		expect(studyCardCurriculumScopeIssues(bundle, catalog)).toEqual([
			'bad-card target ancestry is missing parent missing'
		]);
	});
});
