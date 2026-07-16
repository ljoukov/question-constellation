<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		children,
		icon
	}: {
		label: string;
		children: Snippet;
		icon?: Snippet;
	} = $props();

	const titleId = $derived(`control-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
</script>

<section class="qc-control-section" aria-labelledby={titleId}>
	<div id={titleId} class="qc-control-title">
		{#if icon}
			{@render icon()}
		{/if}
		<span>{label}</span>
	</div>
	{@render children()}
</section>

<style>
	.qc-control-section {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		border-bottom: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
		box-shadow: none;
	}

	.qc-control-section:last-child {
		border-bottom: 0;
	}

	.qc-control-title {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		color: var(--qc-ui-text);
		font-size: 0.92rem;
		font-weight: 650;
		line-height: 1.2;
	}

	.qc-control-title :global(svg) {
		flex: 0 0 auto;
		color: var(--qc-ui-accent);
	}
</style>
