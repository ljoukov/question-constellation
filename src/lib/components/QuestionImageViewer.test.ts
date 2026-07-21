import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import QuestionImageViewer from './QuestionImageViewer.svelte';

describe('QuestionImageViewer', () => {
	it('uses an unobstructed image link with a desktop enlarged-view dialog', () => {
		const { body } = render(QuestionImageViewer, {
			props: {
				src: '/images/physics-equations-sheet.png',
				alt: 'Page two of the Physics Equations Sheet',
				label: 'Physics Equations Sheet (page 2)',
				intrinsicWidth: 1280,
				intrinsicHeight: 1810
			}
		});

		expect(body).toContain(
			'aria-label="Page two of the Physics Equations Sheet. Open full-size image"'
		);
		expect(body).toContain('href="/images/physics-equations-sheet.png"');
		expect(body).toContain('target="_blank"');
		expect(body).not.toContain('>Enlarge</span>');
		expect(body).toContain('<dialog');
		expect(body).toContain('aria-labelledby=');
		expect(body).toContain('Enlarged question image');
		expect(body).toContain('aria-label="Close enlarged image"');
		expect(body).toContain('width="1280"');
		expect(body).toContain('height="1810"');
	});

	it('keeps the calibrated ruler outside the linked measured image', () => {
		const { body } = render(QuestionImageViewer, {
			props: {
				src: '/images/measured-diagram.png',
				alt: 'A measured cell diagram',
				label: 'Cell diagram',
				measurement: {
					axis: 'horizontal',
					pixelWidth: 1000,
					pixelsPerMillimetre: 4
				}
			}
		});

		expect(body).toContain('aria-label="Digital paper ruler"');
		expect(body).toContain('aria-label="A measured cell diagram. Open full-size image"');
		expect(body).toContain('class="image-open-link');
		expect(body).toContain('target="_blank"');
		expect(body).toContain('aria-label="Close enlarged image"');
	});
});
