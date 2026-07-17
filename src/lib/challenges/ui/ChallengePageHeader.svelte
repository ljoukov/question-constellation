<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		eyebrow,
		title,
		description,
		actions,
		aside
	}: {
		eyebrow: string;
		title: string;
		description?: string;
		actions?: Snippet;
		aside?: Snippet;
	} = $props();
</script>

<header class:with-aside={Boolean(aside)} class="challenge-page-header">
	<div class="header-copy">
		<p>{eyebrow}</p>
		<h1>{title}</h1>
		{#if description}<span>{description}</span>{/if}
	</div>
	{#if aside}<div class="header-aside">{@render aside()}</div>{/if}
	{#if actions}<div class="header-actions">{@render actions()}</div>{/if}
</header>

<style>
	.challenge-page-header {
		display: grid;
		gap: 1rem 2rem;
		align-items: end;
	}

	.challenge-page-header.with-aside {
		grid-template-columns: minmax(0, 1fr) minmax(19rem, 0.9fr);
		grid-template-areas:
			'copy aside'
			'actions aside';
	}

	.header-copy {
		display: grid;
		grid-area: copy;
		gap: 0.45rem;
		min-width: 0;
	}

	p,
	h1,
	span {
		margin: 0;
	}

	p {
		color: var(--qc-ui-accent-text);
		font-size: 0.78rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	h1 {
		max-width: 16ch;
		color: var(--qc-ui-text);
		font-size: clamp(2rem, 4.2vw, 3.25rem);
		font-weight: 560;
		line-height: 1;
		letter-spacing: -0.025em;
	}

	.header-copy > span {
		max-width: 46rem;
		color: var(--qc-ui-text-secondary);
		font-size: 0.98rem;
		line-height: 1.5;
	}

	.header-actions {
		display: flex;
		grid-area: actions;
		flex-wrap: wrap;
		gap: 0.65rem;
		margin-top: 0.55rem;
	}

	.header-aside {
		grid-area: aside;
		min-width: 0;
	}

	@media (max-width: 760px) {
		.challenge-page-header.with-aside {
			grid-template-columns: 1fr;
			grid-template-areas:
				'copy'
				'aside'
				'actions';
		}

		h1 {
			font-size: clamp(2rem, 8.8vw, 2.25rem);
		}
	}
</style>
