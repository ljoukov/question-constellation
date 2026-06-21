import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function safeHref(rawHref: string): string | null {
	const trimmed = rawHref.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;

	try {
		const url = new URL(trimmed);
		if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
			return trimmed;
		}
	} catch {
		return null;
	}

	return null;
}

const renderer = new marked.Renderer();

renderer.html = ({ text }) => escapeHtml(text);
renderer.link = function ({ href, title, tokens }) {
	const label = this.parser.parseInline(tokens);
	const safe = safeHref(href);
	if (!safe) return label;

	const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
	return `<a href="${escapeHtml(safe)}"${titleAttr} rel="noreferrer">${label}</a>`;
};
renderer.image = ({ text }) => escapeHtml(text);

export function renderMarkdown(markdown: string): string {
	const parsed = marked.parse(markdown, { renderer, async: false });
	return typeof parsed === 'string' ? parsed : '';
}

export function renderMarkdownInline(markdown: string): string {
	const rendered = renderMarkdown(markdown).trim();
	if (
		rendered.startsWith('<p>') &&
		rendered.endsWith('</p>') &&
		!rendered.includes('</p><p>') &&
		!rendered.includes('</p>\n<p>')
	) {
		return rendered.slice(3, -4);
	}
	return rendered;
}
