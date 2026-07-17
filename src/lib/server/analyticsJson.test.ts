import { describe, expect, it } from 'vitest';
import { safeAnalyticsJson } from './analyticsJson';

describe('safeAnalyticsJson', () => {
	it('keeps ordinary values intact', () => {
		expect(safeAnalyticsJson({ path: '/questions/example', count: 2 })).toBe(
			'{"path":"/questions/example","count":2}'
		);
	});

	it('returns valid bounded JSON when a value is too large', () => {
		const encoded = safeAnalyticsJson({ input: '"\\'.repeat(200) }, 160);
		expect(encoded).not.toBeNull();
		expect(encoded!.length).toBeLessThanOrEqual(160);
		expect(JSON.parse(encoded!)).toMatchObject({ truncated: true });
	});

	it('does not fail analytics for unserializable values', () => {
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(safeAnalyticsJson(cyclic)).toBeNull();
	});
});
