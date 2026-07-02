import { describe, expect, it } from 'vitest';
import { allowsViewportZoom, applyViewportZoomPolicy } from './viewportZoom';

describe('allowsViewportZoom', () => {
	it('allows zoom on public past-paper acquisition pages', () => {
		expect(allowsViewportZoom('/past-papers')).toBe(true);
		expect(allowsViewportZoom('/past-papers/gcse')).toBe(true);
		expect(allowsViewportZoom('/past-papers/gcse/aqa/biology-higher')).toBe(true);
	});

	it('locks zoom on the app experience', () => {
		expect(allowsViewportZoom('/')).toBe(false);
		expect(allowsViewportZoom('/questions/bio-question/practice')).toBe(false);
		expect(allowsViewportZoom('/chains/bio-chain')).toBe(false);
		expect(allowsViewportZoom('/practice/bio-chain/01.1')).toBe(false);
	});

	it('applies the expected viewport meta content for each route class', () => {
		const previousDocument = globalThis.document;
		const viewportMeta = { content: '' } as HTMLMetaElement;
		Object.defineProperty(globalThis, 'document', {
			configurable: true,
			value: {
				querySelector: () => viewportMeta
			}
		});

		try {
			applyViewportZoomPolicy('/questions/bio-question/practice');
			expect(viewportMeta.content).toContain('maximum-scale=1');
			expect(viewportMeta.content).toContain('user-scalable=no');

			applyViewportZoomPolicy('/past-papers/gcse');
			expect(viewportMeta.content).toBe('width=device-width, initial-scale=1, viewport-fit=cover');
		} finally {
			if (previousDocument) {
				Object.defineProperty(globalThis, 'document', {
					configurable: true,
					value: previousDocument
				});
			} else {
				Reflect.deleteProperty(globalThis, 'document');
			}
		}
	});
});
