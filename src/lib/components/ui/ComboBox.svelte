<script lang="ts" generics="Value extends string | number">
	import { ChevronDown } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		value = $bindable(),
		name,
		disabled = false,
		required = false,
		ariaLabel,
		children
	}: {
		value: Value;
		name?: string;
		disabled?: boolean;
		required?: boolean;
		ariaLabel?: string;
		children: Snippet;
	} = $props();
</script>

<span class="qc-combo-box">
	<select bind:value {name} {disabled} {required} aria-label={ariaLabel}>
		{@render children()}
	</select>
	<ChevronDown size={17} aria-hidden="true" strokeWidth={2.2} />
</span>

<style>
	.qc-combo-box {
		position: relative;
		display: grid;
		min-width: 0;
		transition: background-color 140ms ease;
	}

	select {
		width: 100%;
		min-width: 0;
		min-height: 2.8rem;
		padding: 0.5rem 2.6rem 0.5rem 0.75rem;
		border: 1px solid var(--qc-ui-border, #b8c7d3);
		border-radius: 0;
		outline: 0;
		appearance: none;
		-webkit-appearance: none;
		background: var(--qc-ui-surface-raised, #ffffff);
		color: var(--qc-ui-text, #102033);
		font: inherit;
		font-size: 0.92rem;
		font-weight: 500;
		line-height: 1.2;
		cursor: pointer;
	}

	.qc-combo-box :global(svg) {
		position: absolute;
		top: 50%;
		right: 0.75rem;
		transform: translateY(-50%);
		color: var(--qc-ui-text-secondary, #526778);
		pointer-events: none;
	}

	.qc-combo-box:hover {
		background: color-mix(in srgb, var(--qc-ui-accent, #168458) 5%, transparent);
	}

	select:focus-visible {
		border-color: var(--qc-ui-accent, #168458);
		box-shadow: inset 0 0 0 1px var(--qc-ui-accent, #168458);
	}

	.qc-combo-box:focus-within :global(svg) {
		color: var(--qc-ui-accent-text, #0f7650);
	}

	select:disabled {
		cursor: not-allowed;
		opacity: 0.58;
	}

	@media (forced-colors: active) {
		select {
			padding-right: 0.75rem;
			appearance: auto;
			-webkit-appearance: auto;
		}

		.qc-combo-box :global(svg) {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.qc-combo-box {
			transition: none;
		}
	}
</style>
