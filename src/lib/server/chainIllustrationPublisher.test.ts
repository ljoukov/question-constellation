import { describe, expect, it } from 'vitest';
import {
	illustrationThemePair,
	illustrationUpsert
} from '../../../scripts/lib/chain-illustration-publisher.mjs';

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
		assetSha256: 'dark-sha',
		width: 1600,
		height: 900,
		promptText: 'Dark-mode generation prompt.'
	},
	light: {
		localPath: '/tmp/physics-light.webp',
		r2Key: 'images/chains/physics/light.webp',
		publicPath: '/images/chains/physics/light.webp',
		assetSha256: 'light-sha',
		width: 1600,
		height: 900,
		promptText: 'Light-mode edit prompt.',
		derivedFromAssetSha256: 'dark-sha'
	},
	generationMetadata: { lightEditPrompt: 'Convert only the palette to light mode.' },
	sourceFingerprint: 'fingerprint',
	generationModel: 'chatgpt-gpt-image-2'
};

describe('chain illustration pair publishing', () => {
	it('treats the existing asset fields as dark and requires distinct light fields', () => {
		expect(illustrationThemePair(item)).toEqual([
			{
				theme: 'dark',
				localPath: '/tmp/physics-dark.webp',
				r2Key: 'images/chains/physics/dark.webp',
				publicPath: '/images/chains/physics/dark.webp',
				assetSha256: 'dark-sha',
				width: 1600,
				height: 900,
				promptText: 'Dark-mode generation prompt.'
			},
			{
				theme: 'light',
				localPath: '/tmp/physics-light.webp',
				r2Key: 'images/chains/physics/light.webp',
				publicPath: '/images/chains/physics/light.webp',
				assetSha256: 'light-sha',
				width: 1600,
				height: 900,
				promptText: 'Light-mode edit prompt.',
				derivedFromAssetSha256: 'dark-sha'
			}
		]);
	});

	it('builds one D1 upsert containing both verified asset identities', () => {
		const upsert = illustrationUpsert(item);

		expect(upsert.sql).toContain('light_r2_key, light_public_path, light_asset_sha256');
		expect(upsert.sql).toContain('light_r2_key = excluded.light_r2_key');
		expect(upsert.params).toContain('images/chains/physics/dark.webp');
		expect(upsert.params).toContain('images/chains/physics/light.webp');
		expect(upsert.params).toContain('dark-sha');
		expect(upsert.params).toContain('light-sha');
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
