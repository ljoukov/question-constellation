<script lang="ts">
	import { renderMarkdown, renderMarkdownInline } from '$lib/markdown';

	let {
		markdown,
		inline = false,
		class: className = undefined
	}: {
		markdown: string;
		inline?: boolean;
		class?: string;
	} = $props();

	const renderedHtml = $derived.by(() => {
		const trimmed = markdown.trim();
		if (!trimmed) return '';
		return inline ? renderMarkdownInline(markdown) : renderMarkdown(markdown);
	});

	const rootClass = $derived(
		['markdown-content', inline ? 'is-inline' : null, className].filter(Boolean).join(' ')
	);
</script>

{#if inline}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<span class={rootClass}>{@html renderedHtml}</span>
{:else}
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<div class={rootClass}>{@html renderedHtml}</div>
{/if}

<style>
	.markdown-content {
		color: var(--markdown-text, inherit);
		font-size: inherit;
		line-height: inherit;
	}

	.markdown-content.is-inline {
		display: inline;
	}

	:global(.markdown-content > * + *) {
		margin-top: 0.7rem;
	}

	:global(.markdown-content p) {
		margin: 0;
	}

	:global(.markdown-content ul),
	:global(.markdown-content ol) {
		margin: 0;
		padding-left: 1.2rem;
		list-style-position: outside;
	}

	:global(.markdown-content ul) {
		list-style-type: disc;
	}

	:global(.markdown-content ol) {
		list-style-type: decimal;
	}

	:global(.markdown-content li + li) {
		margin-top: 0.45rem;
	}

	:global(.markdown-content strong) {
		color: var(--markdown-strong, currentColor);
		font-weight: 800;
	}

	:global(.markdown-content em) {
		font-style: italic;
	}

	:global(.markdown-content a) {
		color: var(--markdown-link, currentColor);
		text-decoration: underline;
		text-underline-offset: 0.16em;
	}

	:global(.markdown-content :not(pre) > code) {
		padding: 0.08rem 0.26rem;
		border-radius: 0.28rem;
		background: color-mix(in srgb, currentColor 10%, transparent);
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
		font-size: 0.9em;
	}
</style>
