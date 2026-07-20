import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import ThemeAwareChallengeArt from './ThemeAwareChallengeArt.svelte';

const sharedProps = {
	alt: 'A diagram used to compare two scientific observations.',
	width: 1672,
	height: 941
};

describe('ThemeAwareChallengeArt', () => {
	it('server-renders one stable image without preloading either themed source', () => {
		const { body } = render(ThemeAwareChallengeArt, {
			props: {
				...sharedProps,
				src: '/art-light.webp',
				darkSrc: '/art-dark.webp'
			}
		});

		expect(body.match(/<img\b/g)).toHaveLength(1);
		expect(body).not.toContain('/art-light.webp');
		expect(body).not.toContain('/art-dark.webp');
		expect(body).toContain(`aria-label="${sharedProps.alt}"`);
		expect(body).toContain(`style="aspect-ratio: ${sharedProps.width} / ${sharedProps.height};"`);
	});

	it('keeps an unthemed source available during server rendering', () => {
		const { body } = render(ThemeAwareChallengeArt, {
			props: {
				...sharedProps,
				src: '/single-art.webp'
			}
		});

		expect(body.match(/<img\b/g)).toHaveLength(1);
		expect(body).toContain('src="/single-art.webp"');
		expect(body).toContain('loading="lazy"');
		expect(body).toContain('decoding="async"');
	});
});
