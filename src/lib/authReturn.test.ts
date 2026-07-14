import { describe, expect, it } from 'vitest';
import { authStartHref, safeAuthReturnPath } from './authReturn';

describe('auth return paths', () => {
	it('preserves a local practice route including its query', () => {
		const path = '/questions/example/practice/step-by-step/task?resume=check';
		expect(safeAuthReturnPath(path)).toBe(path);
		expect(authStartHref(path)).toBe(`/auth/start?next=${encodeURIComponent(path)}`);
	});

	it('rejects external and protocol-relative return targets', () => {
		expect(safeAuthReturnPath('https://example.com')).toBe('/');
		expect(safeAuthReturnPath('//example.com')).toBe('/');
		expect(safeAuthReturnPath('/\\example.com')).toBe('/');
		expect(safeAuthReturnPath('/safe\nLocation: https://example.com')).toBe('/');
	});
});
