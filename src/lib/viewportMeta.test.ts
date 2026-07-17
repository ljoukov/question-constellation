import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ACCESSIBLE_VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover';

describe('root viewport meta', () => {
	it('allows browser zoom from the shared app shell', () => {
		const appHtmlPath = resolve(dirname(fileURLToPath(import.meta.url)), '../app.html');
		const appHtml = readFileSync(appHtmlPath, 'utf8');

		expect(appHtml).toContain('name="viewport"');
		expect(appHtml).toContain(`content="${ACCESSIBLE_VIEWPORT}"`);
		expect(appHtml).not.toContain('user-scalable=no');
		expect(appHtml).not.toContain('maximum-scale=1');
	});

	it('does not install a client-side gesture zoom lock', () => {
		const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
		const clientHooks = readFileSync(resolve(srcRoot, 'hooks.client.ts'), 'utf8');
		const appCss = readFileSync(resolve(srcRoot, 'app.css'), 'utf8');

		expect(clientHooks).not.toContain('installViewportZoomLock');
		expect(appCss).not.toContain('touch-action: pan-x pan-y;');
	});
});
