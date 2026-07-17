<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import HapticSurface from './HapticSurface.svelte';

	let {
		href,
		variant = 'primary',
		fullWidth = false,
		disabled = false,
		onclick,
		analyticsLabel,
		ariaLabel,
		ariaExpanded,
		ariaControls,
		children
	}: {
		href?: string;
		variant?: 'primary' | 'secondary' | 'quiet';
		fullWidth?: boolean;
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		analyticsLabel?: string;
		ariaLabel?: string;
		ariaExpanded?: boolean;
		ariaControls?: string;
		children: Snippet;
	} = $props();
</script>

{#if href}
	<a
		class:full-width={fullWidth}
		class="qc-action-button challenge-button {variant}"
		href={resolve(href as '/')}
		aria-label={ariaLabel}
		data-analytics-label={analyticsLabel}
	>
		{@render children()}
	</a>
{:else}
	<HapticSurface block={fullWidth}>
		<button
			type="button"
			class:full-width={fullWidth}
			class="qc-action-button challenge-button {variant}"
			{disabled}
			{onclick}
			aria-label={ariaLabel}
			aria-expanded={ariaExpanded}
			aria-controls={ariaControls}
			data-analytics-label={analyticsLabel}
			data-haptic-control
		>
			{@render children()}
		</button>
	</HapticSurface>
{/if}

<style>
	.challenge-button {
		transition:
			border-color 150ms ease,
			background 150ms ease,
			color 150ms ease,
			transform 150ms ease;
	}

	.challenge-button.quiet {
		min-height: 2.6rem;
		padding: 0.55rem 0.2rem;
		border-color: transparent;
		background: transparent;
		color: var(--qc-ui-text-muted);
		font-size: 0.86rem;
	}

	.challenge-button.full-width {
		width: 100%;
	}

	.challenge-button:hover:not(:disabled) {
		border-color: var(--qc-ui-accent-strong);
	}

	.challenge-button.secondary:hover:not(:disabled) {
		background: var(--qc-ui-surface-muted);
	}

	.challenge-button:active:not(:disabled) {
		transform: translateY(1px);
	}

	.challenge-button:focus-visible {
		outline: 3px solid var(--qc-ui-accent-text);
		outline-offset: 2px;
	}

	.challenge-button:disabled {
		border-color: var(--qc-ui-disabled-border);
		background: var(--qc-ui-disabled-surface);
		color: var(--qc-ui-disabled-text);
		cursor: default;
	}

	.challenge-button :global(svg) {
		flex: 0 0 auto;
		pointer-events: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.challenge-button {
			transition: none;
		}
	}
</style>
