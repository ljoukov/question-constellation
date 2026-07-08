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
});
