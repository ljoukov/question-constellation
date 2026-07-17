<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, Check } from '@lucide/svelte';
	import type { ChallengeDefinition } from '../types';
	import ChallengeVisualStory from './ChallengeVisualStory.svelte';

	let {
		href,
		eyebrow,
		title,
		description,
		meta,
		visualChallenge,
		complete = false,
		analyticsLabel
	}: {
		href: string;
		eyebrow: string;
		title: string;
		description: string;
		meta?: string;
		visualChallenge?: ChallengeDefinition;
		complete?: boolean;
		analyticsLabel?: string;
	} = $props();
</script>

<a class:complete href={resolve(href as '/')} data-analytics-label={analyticsLabel}>
	{#if visualChallenge}
		<div class="card-visual">
			<ChallengeVisualStory challenge={visualChallenge} mode="teaser" compact />
		</div>
	{/if}
	<div class="card-copy">
		<span>{eyebrow}</span>
		<strong>{title}</strong>
		<p>{description}</p>
		{#if meta}<small>{meta}</small>{/if}
	</div>
	<span class="card-action" aria-hidden="true">
		{#if complete}<Check size={18} strokeWidth={2.4} />{:else}<ArrowRight size={18} />{/if}
	</span>
</a>

<style>
	a {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 1rem;
		align-items: center;
		min-width: 0;
		padding: 1rem;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		text-decoration: none;
		transition:
			border-color 150ms ease,
			background 150ms ease;
	}

	a:hover {
		border-color: var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-muted);
	}

	a.complete {
		border-color: var(--qc-ui-accent-border);
	}

	.card-copy {
		display: grid;
		gap: 0.28rem;
		min-width: 0;
	}

	.card-visual {
		grid-column: 1 / -1;
		min-width: 0;
		margin: -1rem -1rem 0;
	}

	.card-copy > span,
	.card-copy small {
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
		font-weight: 650;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.card-copy strong {
		font-size: 1.04rem;
		font-weight: 650;
		line-height: 1.3;
	}

	.card-copy p {
		margin: 0;
		color: var(--qc-ui-text-secondary);
		font-size: 0.9rem;
		line-height: 1.45;
	}

	.card-copy small {
		margin-top: 0.25rem;
		font-weight: 550;
		letter-spacing: 0;
		text-transform: none;
	}

	.card-action {
		display: inline-grid;
		width: 2.65rem;
		height: 2.65rem;
		place-items: center;
		border: 1px solid var(--qc-ui-border-subtle);
		color: var(--qc-ui-accent-text);
	}

	a.complete .card-action {
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
	}

	@media (prefers-reduced-motion: reduce) {
		a {
			transition: none;
		}
	}
</style>
