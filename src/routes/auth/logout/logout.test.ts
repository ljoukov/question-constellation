import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

describe('/auth/logout', () => {
	it('clears auth cookies and returns to the public homepage', async () => {
		expect.assertions(5);

		const cookies = {
			set: vi.fn()
		};

		const response = await GET({
			url: new URL('https://constellation.eviworld.com/auth/logout'),
			cookies
		} as unknown as Parameters<typeof GET>[0]);
		const body = await response.text();

		expect(cookies.set).toHaveBeenCalledTimes(4);
		expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(body).toContain("url='https://constellation.eviworld.com/'");
		expect(body).not.toContain('/auth/relogin');
		expect(body).not.toContain('Sign in required');
	});
});
