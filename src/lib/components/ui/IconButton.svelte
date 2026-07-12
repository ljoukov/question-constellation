<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		onclick,
		children,
		disabled = false,
		title = label
	}: {
		label: string;
		onclick?: (event: MouseEvent) => void;
		children: Snippet;
		disabled?: boolean;
		title?: string;
	} = $props();
</script>

<button class="qc-icon-button" type="button" aria-label={label} {title} {disabled} {onclick}>
	{@render children()}
</button>

<style>
	.qc-icon-button {
		display: inline-grid;
		place-items: center;
		flex: 0 0 auto;
		width: 2.75rem;
		height: 2.75rem;
		padding: 0;
		border: 1px solid var(--qc-ui-border);
		border-radius: 999px;
		background: var(--qc-ui-surface-raised, var(--qc-ui-surface));
		box-shadow: 0 4px 14px var(--qc-ui-shadow);
		color: var(--qc-ui-text-muted);
		font: inherit;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			background 140ms ease,
			color 140ms ease,
			transform 140ms ease;
	}

	.qc-icon-button:hover:not(:disabled) {
		border-color: var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text);
	}

	.qc-icon-button:active:not(:disabled) {
		transform: scale(0.96);
	}

	.qc-icon-button:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--qc-ui-accent) 32%, transparent);
		outline-offset: 2px;
	}

	.qc-icon-button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.qc-icon-button :global(svg) {
		pointer-events: none;
	}
</style>
