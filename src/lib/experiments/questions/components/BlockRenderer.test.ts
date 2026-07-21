import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BlockRenderer from './BlockRenderer.svelte';

describe('BlockRenderer figure enlargement', () => {
	it('uses the accessible enlarged viewer for structured question source images', () => {
		const { body } = render(BlockRenderer, {
			props: {
				block: {
					kind: 'figure',
					assetId: 'equations-page-2',
					label: 'Physics Equations Sheet (page 2)',
					width: 520
				},
				assets: {
					'equations-page-2': {
						id: 'equations-page-2',
						label: 'Physics Equations Sheet',
						src: '/images/equations-page-2.png',
						alt: 'Page two of the Physics Equations Sheet',
						width: 1280,
						height: 1810
					}
				}
			}
		});

		expect(body).toContain('Physics Equations Sheet (page 2)');
		expect(body).toContain(
			'aria-label="Page two of the Physics Equations Sheet. Open full-size image"'
		);
		expect(body).toContain('target="_blank"');
		expect(body).not.toContain('>Enlarge</span>');
		expect(body).toContain('aria-label="Close enlarged image"');
		expect(body).toContain('width="1280"');
		expect(body).toContain('height="1810"');
	});
});
