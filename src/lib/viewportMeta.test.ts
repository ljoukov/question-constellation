import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const LOCKED_VIEWPORT =
	'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

describe('root viewport meta', () => {
	it('locks browser zoom from the shared app shell', () => {
		const appHtmlPath = resolve(dirname(fileURLToPath(import.meta.url)), '../app.html');
		const appHtml = readFileSync(appHtmlPath, 'utf8');

		expect(appHtml).toContain('name="viewport"');
		expect(appHtml).toContain(`content="${LOCKED_VIEWPORT}"`);
	});

	it('installs the active zoom lock during global client startup', () => {
		const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
		const clientHooks = readFileSync(resolve(srcRoot, 'hooks.client.ts'), 'utf8');
		const appCss = readFileSync(resolve(srcRoot, 'app.css'), 'utf8');

		expect(clientHooks).toContain("import { installViewportZoomLock } from '$lib/viewportZoom'");
		expect(clientHooks).toContain('export const init: ClientInit');
		expect(clientHooks).toContain('installViewportZoomLock();');
		expect(appCss).toContain('touch-action: pan-x pan-y;');
	});
});
