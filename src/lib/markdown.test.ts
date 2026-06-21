import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderMarkdownInline } from './markdown';

describe('renderMarkdown', () => {
	it('renders feedback lists with inline emphasis', () => {
		const html = renderMarkdown(
			[
				'- You said voltage goes down, but a **step-up transformer increases the potential difference**.',
				'- Add the missing link: higher potential difference means **lower current**.'
			].join('\n')
		);

		expect(html).toContain('<ul>');
		expect(html).toContain('<li>You said voltage goes down');
		expect(html).toContain(
			'<strong>step-up transformer increases the potential difference</strong>'
		);
		expect(html).toContain('<strong>lower current</strong>');
	});

	it('escapes raw html from untrusted markdown', () => {
		const html = renderMarkdown('<script>alert("x")</script>');

		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});
});

describe('renderMarkdownInline', () => {
	it('unwraps a single paragraph', () => {
		expect(renderMarkdownInline('Use **lower current**.')).toBe(
			'Use <strong>lower current</strong>.'
		);
	});
});
