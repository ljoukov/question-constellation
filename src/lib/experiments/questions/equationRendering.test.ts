import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BlockRenderer from './components/BlockRenderer.svelte';
import { equationBlockUsesDisplayMath } from './equationRendering';

describe('equation block rendering', () => {
	it('keeps printed word equations as ordinary centred text', () => {
		expect(equationBlockUsesDisplayMath('specific latent heat of fuse wire = 60 kJ/kg')).toBe(
			false
		);

		const { body } = render(BlockRenderer, {
			props: {
				block: {
					kind: 'equation',
					text: 'specific latent heat of fuse wire = 60 kJ/kg'
				},
				assets: {}
			}
		});

		expect(body).toContain('specific latent heat of fuse wire = 60 kJ/kg');
		expect(body).not.toContain('katex');
	});

	it('renders inline TeX inside equation prose without a KaTeX error', () => {
		const text = 'thermal energy for a change of state = mass × specific latent heat, \\(E=mL\\)';
		expect(equationBlockUsesDisplayMath(text)).toBe(false);

		const { body } = render(BlockRenderer, {
			props: {
				block: { kind: 'equation', text },
				assets: {}
			}
		});

		expect(body).toContain('thermal energy for a change of state = mass × specific latent heat');
		expect(body).toContain('application/x-tex');
		expect(body).toContain('E=mL');
		expect(body).not.toContain('katex-error');
		expect(body).not.toContain('color:#cc0000');
	});

	it('continues to use display maths for a pure TeX expression', () => {
		const text = 'I \\propto \\frac{1}{d^2}';
		expect(equationBlockUsesDisplayMath(text)).toBe(true);

		const { body } = render(BlockRenderer, {
			props: {
				block: { kind: 'equation', text },
				assets: {}
			}
		});

		expect(body).toContain('katex-display');
		expect(body).toContain('I \\propto \\frac{1}{d^2}');
		expect(body).not.toContain('katex-error');
	});

	it('keeps multiple inline runs and trailing punctuation out of display parsing', () => {
		for (const text of ['\\(F\\) = \\(ma\\)', '\\(E=mL\\).']) {
			expect(equationBlockUsesDisplayMath(text)).toBe(false);
			const { body } = render(BlockRenderer, {
				props: { block: { kind: 'equation', text }, assets: {} }
			});
			expect(body).not.toContain('katex-error');
			expect(body).not.toContain('color:#cc0000');
		}
	});

	it('keeps prose containing a TeX multiplication command as ordinary text', () => {
		const text = 'force = mass \\times acceleration';
		expect(equationBlockUsesDisplayMath(text)).toBe(false);
		const { body } = render(BlockRenderer, {
			props: { block: { kind: 'equation', text }, assets: {} }
		});
		expect(body).toContain('force = mass × acceleration');
		expect(body).not.toContain('katex-error');
	});
});
