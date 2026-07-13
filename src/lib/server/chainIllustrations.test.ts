import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryFirst } = vi.hoisted(() => ({ queryFirst: vi.fn() }));

vi.mock('./db', () => ({ queryFirst }));

import { getPublishedChainIllustration, illustrationFromRow } from './chainIllustrations';

describe('chain illustration theme pairs', () => {
	beforeEach(() => queryFirst.mockReset());

	it('maps the existing public path as dark and the paired path as light', () => {
		expect(
			illustrationFromRow({
				id: 'chain-image',
				public_path: '/images/chains/chain-dark.webp',
				light_public_path: '/images/chains/chain-light.webp',
				alt_text: 'A four-step scientific answer chain.',
				caption: 'One → two → three → four.',
				width: 1600,
				height: 900
			})
		).toEqual({
			id: 'chain-image',
			src: '/images/chains/chain-dark.webp',
			lightSrc: '/images/chains/chain-light.webp',
			alt: 'A four-step scientific answer chain.',
			caption: 'One → two → three → four.',
			width: 1600,
			height: 900
		});
	});

	it('keeps an optional caption independent from the required theme pair', () => {
		expect(
			illustrationFromRow({
				id: 'paired-image',
				public_path: '/images/chains/dark.webp',
				light_public_path: '/images/chains/light.webp',
				alt_text: 'A scientific answer chain.',
				caption: null,
				width: 1600,
				height: 900
			}).caption
		).toBe('');
	});

	it('does not surface a published illustration unless every light asset field is present', async () => {
		queryFirst.mockResolvedValue(null);

		await expect(getPublishedChainIllustration('physics-chain')).resolves.toBeNull();
		const [sql, params] = queryFirst.mock.calls[0];

		expect(sql).toContain('light_r2_key IS NOT NULL');
		expect(sql).toContain('light_public_path IS NOT NULL');
		expect(sql).toContain('light_asset_sha256 IS NOT NULL');
		expect(params).toEqual(['physics-chain']);
	});
});
