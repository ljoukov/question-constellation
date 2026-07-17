import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
	assertIllustrationBatchIdentities,
	assertIllustrationProvenance,
	buildIllustrationProvenance,
	illustrationThemePair,
	illustrationUpsert,
	validateIllustrationReplacementState
} from '../../../scripts/lib/chain-illustration-publisher.mjs';

const darkSha = 'a'.repeat(64);
const lightSha = 'b'.repeat(64);
const sourceFingerprint = 'c'.repeat(64);

const item = {
	id: 'paired-image',
	answerChainId: 'physics-chain',
	sourceQuestionId: 'question-1',
	altText: 'Four steps explain grid efficiency.',
	caption: 'Voltage up → current down → less heating → higher efficiency.',
	styleKey: 'luminous-scientific-atlas-v1',
	dark: {
		localPath: '/tmp/physics-dark.webp',
		r2Key: 'images/chains/physics/dark.webp',
		publicPath: '/images/chains/physics/dark.webp',
		assetSha256: darkSha,
		width: 1600,
		height: 900,
		promptText: 'Dark-mode generation prompt.'
	},
	light: {
		localPath: '/tmp/physics-light.webp',
		r2Key: 'images/chains/physics/light.webp',
		publicPath: '/images/chains/physics/light.webp',
		assetSha256: lightSha,
		width: 1600,
		height: 900,
		promptText: 'Light-mode edit prompt.',
		derivedFromAssetSha256: darkSha
	},
	generationMetadata: { lightEditPrompt: 'Convert only the palette to light mode.' },
	sourceFingerprint,
	generationModel: 'chatgpt-gpt-image-2'
};

const hardChecks = {
	dark: {
		status: 'passed',
		width: 1600,
		height: 900,
		format: 'WEBP',
		sha256: darkSha,
		issues: []
	},
	light: {
		status: 'passed',
		width: 1600,
		height: 900,
		format: 'WEBP',
		sha256: lightSha,
		issues: []
	}
};

describe('chain illustration pair publishing', () => {
	it('rejects incomplete or overlapping batch identities before external publication', () => {
		expect(() => assertIllustrationBatchIdentities([])).toThrow('at least one item');
		expect(() => assertIllustrationBatchIdentities([item, { ...item }])).toThrow('duplicate id');
		expect(() =>
			assertIllustrationBatchIdentities([
				item,
				{
					...item,
					id: 'paired-image-2',
					answerChainId: 'physics-chain-2'
				}
			])
		).toThrow('duplicate R2 object keys');
	});

	it('makes the accepted set visible with one transactional D1 batch', () => {
		const source = readFileSync('scripts/lib/chain-illustration-publisher.mjs', 'utf8');
		const batchStart = source.indexOf('async function publishIllustrationD1Batch');
		const batchEnd = source.indexOf('function publicationResult', batchStart);
		const batchSource = source.slice(batchStart, batchEnd);
		expect(batchSource).toContain('await d1Batch(items.map(illustrationUpsert), { rootDir })');
		expect(batchSource).not.toContain('await d1Query(');
	});

	it('keeps the scoped repair manifest truthful, hash-bound and limited to five changed pairs', () => {
		const manifest = JSON.parse(
			readFileSync(
				path.join(process.cwd(), 'docs/chain-illustrations/manifest-number-rule-repairs-v3.json'),
				'utf8'
			)
		);
		const expectedChainIds = [
			'physics-chain-collision-momentum-conservation-qualitative',
			'physics-chain-elastic-deformation-return-original-length',
			'physics-chain-parallel-current-sharing-addition',
			'physics-chain-resistance-decreases-current-increases',
			'physics-chain-resultant-force-acceleration-proportionality'
		];
		expect(manifest.version).toBe(3);
		expect(manifest.illustrations.map((entry: any) => entry.answerChainId).sort()).toEqual(
			expectedChainIds
		);

		const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
		for (const entry of manifest.illustrations) {
			expect(entry.generatedBy).toBe('codex-built-in-imagegen-number-rule-repair');
			expect(entry.generationTool).toBe('codex-built-in-imagegen');
			expect(entry).not.toHaveProperty('selectedCandidate');
			expect(entry).not.toHaveProperty('candidates');
			expect(entry).not.toHaveProperty('selectionRationale');
			expect(entry.modelVisualAudit.status).toBe('not_performed');
			expect(entry.humanAudit.status).toBe('not_performed');
			expect(entry.imageGeneration.lightDerivedFromDarkCallId).toBe(
				entry.imageGeneration.darkCallId
			);
			expect(entry.imageGeneration.lightCallId).not.toBe(entry.imageGeneration.darkCallId);

			const darkBytes = readFileSync(path.join(process.cwd(), entry.localPath));
			const lightBytes = readFileSync(path.join(process.cwd(), entry.lightLocalPath));
			expect(digest(darkBytes)).toBe(entry.assetSha256);
			expect(digest(lightBytes)).toBe(entry.lightAssetSha256);
			expect(entry.lightDerivedFromAssetSha256).toBe(entry.assetSha256);
			const pairPrefix = digest(`${entry.assetSha256}\n${entry.lightAssetSha256}`).slice(0, 16);
			expect(entry.id.endsWith(`-${pairPrefix}`)).toBe(true);

			const darkPrompt = readFileSync(path.join(process.cwd(), entry.promptPath), 'utf8').trim();
			const lightPrompt = readFileSync(
				path.join(process.cwd(), entry.lightPromptPath),
				'utf8'
			).trim();
			expect(digest(darkPrompt)).toBe(entry.promptSha256);
			expect(digest(lightPrompt)).toBe(entry.lightPromptSha256);
		}
	});

	it('treats the existing asset fields as dark and requires distinct light fields', () => {
		expect(illustrationThemePair(item)).toEqual([
			{
				theme: 'dark',
				localPath: '/tmp/physics-dark.webp',
				r2Key: 'images/chains/physics/dark.webp',
				publicPath: '/images/chains/physics/dark.webp',
				assetSha256: darkSha,
				width: 1600,
				height: 900,
				promptText: 'Dark-mode generation prompt.'
			},
			{
				theme: 'light',
				localPath: '/tmp/physics-light.webp',
				r2Key: 'images/chains/physics/light.webp',
				publicPath: '/images/chains/physics/light.webp',
				assetSha256: lightSha,
				width: 1600,
				height: 900,
				promptText: 'Light-mode edit prompt.',
				derivedFromAssetSha256: darkSha
			}
		]);
	});

	it('builds one D1 upsert containing both verified asset identities', () => {
		const upsert = illustrationUpsert(item);

		expect(upsert.sql).toContain('light_r2_key, light_public_path, light_asset_sha256');
		expect(upsert.sql).toContain('light_r2_key = excluded.light_r2_key');
		expect(upsert.params).toContain('images/chains/physics/dark.webp');
		expect(upsert.params).toContain('images/chains/physics/light.webp');
		expect(upsert.params).toContain(darkSha);
		expect(upsert.params).toContain(lightSha);
	});

	it('records honest prompt, asset, derivation, hard-check and audit provenance', () => {
		const provenance = buildIllustrationProvenance(item, {
			hardChecks,
			modelVisualAudit: {
				status: 'passed',
				model: 'gpt-5.6-sol',
				outputSha256: 'd'.repeat(64),
				notes: 'Independent model QA, not human review.'
			},
			humanAudit: {
				status: 'not_performed',
				notes: 'No human audit claimed.'
			}
		});
		expect(provenance.sourceFingerprint).toBe(sourceFingerprint);
		expect(provenance.prompts.dark.sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(provenance.assets).toMatchObject({
			darkSha256: darkSha,
			lightSha256: lightSha,
			lightDerivedFromDarkAssetSha256: darkSha
		});
		expect(provenance.assets.darkToLightDerivationSha256).toMatch(/^[a-f0-9]{64}$/);
		expect(provenance.deterministicHardChecks.recordSha256).toMatch(/^[a-f0-9]{64}$/);
		expect(provenance.modelVisualAudit.status).toBe('passed');
		expect(provenance.humanAudit).toMatchObject({
			status: 'not_performed',
			reviewer: null,
			reviewedAt: null
		});

		const withProvenance: any = structuredClone(item);
		withProvenance.generationMetadata.provenance = provenance;
		expect(assertIllustrationProvenance(withProvenance, hardChecks)).toEqual(provenance);
		withProvenance.dark.promptText = 'A different prompt.';
		expect(() => assertIllustrationProvenance(withProvenance, hardChecks)).toThrow(
			'generation provenance does not match'
		);
	});

	it('safely replaces an older primary when the content-addressed illustration ID changes', () => {
		const database = new DatabaseSync(':memory:');
		database.exec(`
			PRAGMA foreign_keys = ON;
			CREATE TABLE answer_chains (id TEXT PRIMARY KEY);
			CREATE TABLE questions (id TEXT PRIMARY KEY);
			INSERT INTO answer_chains (id) VALUES ('physics-chain');
			INSERT INTO questions (id) VALUES ('question-1');
		`);
		for (const migration of [
			'0013_answer_chain_illustrations.sql',
			'0014_answer_chain_illustration_freshness.sql',
			'0015_answer_chain_illustration_theme_pairs.sql',
			'0016_answer_chain_illustration_primary_replacement.sql'
		]) {
			database.exec(readFileSync(path.join(process.cwd(), 'migrations', migration), 'utf8'));
		}

		const oldItem: any = structuredClone(item);
		oldItem.id = 'old-content-addressed-id';
		oldItem.dark.r2Key = 'images/chains/physics/old-dark.webp';
		oldItem.dark.publicPath = '/images/chains/physics/old-dark.webp';
		oldItem.light.r2Key = 'images/chains/physics/old-light.webp';
		oldItem.light.publicPath = '/images/chains/physics/old-light.webp';
		oldItem.generationMetadata = { provenance: { sourceFingerprint } };
		const oldUpsert = illustrationUpsert(oldItem);
		database
			.prepare(oldUpsert.sql)
			.run(
				...oldUpsert.params.map((value) => (typeof value === 'boolean' ? Number(value) : value))
			);
		const priorPrimaryRows = database
			.prepare(
				`SELECT id, answer_chain_id, is_primary, status, source_fingerprint
				 FROM answer_chain_illustrations
				 WHERE answer_chain_id = ? AND is_primary = 1 AND status = 'published'`
			)
			.all(item.answerChainId) as any[];

		const newItem: any = structuredClone(item);
		newItem.generationMetadata.provenance = buildIllustrationProvenance(newItem, {
			hardChecks,
			modelVisualAudit: { status: 'not_recorded' },
			humanAudit: { status: 'not_recorded' }
		});
		const newUpsert = illustrationUpsert(newItem);
		database
			.prepare(newUpsert.sql)
			.run(
				...newUpsert.params.map((value) => (typeof value === 'boolean' ? Number(value) : value))
			);
		const afterRows = database
			.prepare(
				`SELECT id, answer_chain_id, is_primary, status, source_fingerprint,
				        generation_metadata_json
				 FROM answer_chain_illustrations
				 WHERE answer_chain_id = ? ORDER BY id`
			)
			.all(item.answerChainId) as any[];

		expect(validateIllustrationReplacementState(newItem, priorPrimaryRows, afterRows)).toEqual({
			status: 'passed',
			publishedIllustrationId: item.id,
			replacedIllustrationId: oldItem.id
		});
		expect(
			afterRows.map((row) => ({ id: row.id, isPrimary: row.is_primary, status: row.status }))
		).toEqual([
			{ id: oldItem.id, isPrimary: 0, status: 'draft' },
			{ id: item.id, isPrimary: 1, status: 'published' }
		]);
		database.close();
	});

	it('rejects a partial pair before any upload or D1 write can start', () => {
		expect(() =>
			illustrationThemePair({ ...item, light: { ...item.light, publicPath: '' } })
		).toThrow('paired-image light publicPath is required');
		expect(() =>
			illustrationThemePair({
				...item,
				light: { ...item.light, r2Key: item.dark.r2Key }
			})
		).toThrow('dark and light images must use different R2 objects');
		expect(() =>
			illustrationThemePair({
				...item,
				light: { ...item.light, derivedFromAssetSha256: '' }
			})
		).toThrow('paired-image light derivedFromAssetSha256 is required');
	});
});
