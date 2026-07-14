<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		children
	}: {
		label: string;
		children: Snippet;
	} = $props();
</script>

<label class="qc-form-field">
	<span>{label}</span>
	{@render children()}
</label>

<style>
	.qc-form-field {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
		color: var(--qc-ui-text-muted);
		font-size: 0.8rem;
		font-weight: 680;
		line-height: 1.2;
	}

	.qc-form-field :global(input),
	.qc-form-field :global(select) {
		width: 100%;
		min-width: 0;
		min-height: 2.75rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--qc-ui-border);
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		font: inherit;
		font-size: 0.92rem;
		font-weight: 500;
	}

	.qc-form-field :global(input:focus-visible),
	.qc-form-field :global(select:focus-visible) {
		border-color: var(--qc-ui-accent);
		outline: 2px solid color-mix(in srgb, var(--qc-ui-accent) 24%, transparent);
		outline-offset: 1px;
	}

	.qc-form-field :global(input::placeholder) {
		color: var(--qc-ui-text-subtle);
	}
</style>
