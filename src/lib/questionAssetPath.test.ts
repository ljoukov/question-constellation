import { describe, expect, it } from 'vitest';
import { questionAssetPublicPath } from './questionAssetPath';

describe('question asset public paths', () => {
	it('uses an R2 image key when an optional public_path was not stored', () => {
		expect(questionAssetPublicPath(null, 'images/papers/paper-1/figure-12.png')).toBe(
			'/images/papers/paper-1/figure-12.png'
		);
	});

	it('prefers an explicit public path and preserves absolute URLs', () => {
		expect(questionAssetPublicPath('/images/reviewed.png', 'images/fallback.png')).toBe(
			'/images/reviewed.png'
		);
		expect(questionAssetPublicPath('https://example.test/image.png', null)).toBe(
			'https://example.test/image.png'
		);
	});
});
