import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const practicePageSource = readFileSync(
	new URL('./[questionId]/practice/+page.svelte', import.meta.url),
	'utf8'
);

describe('whole-answer practice page', () => {
	it('keeps marking guidance out of the attempt state', () => {
		expect(practicePageSource).not.toContain('MarkSchemeDisclosure');
		expect(practicePageSource).not.toContain('Show marking points');
	});

	it('shows marking-point diagnostics only as checked-result content', () => {
		expect(practicePageSource).toContain('aria-label={rewriteCheckPending');
		expect(practicePageSource).toContain("'Checked marking points'");
		expect(practicePageSource).toContain('class="qc-marking-result"');
	});
});
