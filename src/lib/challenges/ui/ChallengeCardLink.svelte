<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, Check } from '@lucide/svelte';
	import type { PublicChallengePreviewDefinition } from '../authoredData';
	import { challengeVisual, type ChallengeCardArt } from '../visuals';
	import ThemeAwareChallengeArt from './ThemeAwareChallengeArt.svelte';

	let {
		href,
		eyebrow,
		title,
		description,
		meta,
		markLabel,
		visualChallenge,
		art,
		complete = false,
		balanced = false,
		analyticsLabel
	}: {
		href: string;
		eyebrow?: string;
		title: string;
		description?: string;
		meta?: string;
		markLabel?: string;
		visualChallenge?: PublicChallengePreviewDefinition;
		art?: ChallengeCardArt;
		complete?: boolean;
		balanced?: boolean;
		analyticsLabel?: string;
	} = $props();

	const visualArt = $derived(
		visualChallenge ? challengeVisual(visualChallenge)?.cardArt : undefined
	);
	const shownArt = $derived(art ?? visualArt);
	const showCardArt = $derived(Boolean(shownArt));
</script>

<a
	class:complete
	class:balanced
	class:has-card-art={showCardArt}
	href={resolve(href as '/')}
	data-analytics-label={analyticsLabel}
>
	{#if showCardArt}
		<div class="card-visual">
			{#if shownArt}
				<ThemeAwareChallengeArt
					src={shownArt.src}
					darkSrc={shownArt.darkSrc}
					alt={shownArt.alt}
					width={shownArt.width}
					height={shownArt.height}
				/>
			{/if}
		</div>
	{/if}
	<div class="card-copy">
		<div class="card-copy-header">
			{#if markLabel}<span class="card-format">{markLabel}</span>{/if}
			{#if eyebrow}<span class="card-eyebrow">{eyebrow}</span>{/if}
		</div>
		<strong>{title}</strong>
		{#if description}<p>{description}</p>{/if}
		{#if meta}<small>{meta}</small>{/if}
	</div>
	<span class="card-action" aria-hidden="true">
		<span>{complete ? 'Play again' : 'Play'}</span>
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

	a.balanced {
		box-sizing: border-box;
		height: 100%;
		align-items: stretch;
		grid-template-rows: minmax(0, 1fr);
	}

	a.balanced.has-card-art {
		grid-template-rows: auto minmax(0, 1fr);
	}

	.card-copy {
		display: grid;
		gap: 0.28rem;
		min-width: 0;
	}

	a.balanced .card-copy {
		height: 100%;
		grid-template-rows: auto 4.45rem 4.2rem minmax(2.1rem, 1fr);
		align-content: stretch;
	}

	.card-visual {
		grid-column: 1 / -1;
		min-width: 0;
		margin: -1rem -1rem 0;
	}

	.card-copy-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
		min-width: 0;
	}

	.card-eyebrow,
	.card-copy small {
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
		font-weight: 650;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.card-eyebrow {
		min-width: 0;
	}

	.card-format {
		flex: 0 0 auto;
		padding: 0.42rem 0.58rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text-muted);
		font-size: 0.82rem;
		font-weight: 650;
		letter-spacing: 0.03em;
		line-height: 1;
		white-space: nowrap;
	}

	.card-copy strong {
		font-size: 1.04rem;
		font-weight: 650;
		line-height: 1.3;
	}

	a.balanced .card-copy strong,
	a.balanced .card-copy p,
	a.balanced .card-copy small {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
	}

	a.balanced .card-copy strong,
	a.balanced .card-copy p {
		line-clamp: 3;
		-webkit-line-clamp: 3;
	}

	a.balanced .card-copy small {
		line-clamp: 2;
		-webkit-line-clamp: 2;
		align-self: end;
		margin-top: 0;
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
		display: inline-flex;
		width: auto;
		height: 2.65rem;
		gap: 0.42rem;
		align-self: center;
		align-items: center;
		justify-content: center;
		padding: 0 0.7rem;
		border: 1px solid var(--qc-ui-border-subtle);
		color: var(--qc-ui-accent-text);
		font-size: 0.78rem;
		font-weight: 700;
		white-space: nowrap;
	}

	a.balanced .card-action {
		align-self: end;
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

	@media (max-width: 760px) {
		a.balanced {
			height: auto;
		}

		a.balanced .card-copy {
			height: auto;
			grid-template-rows: none;
		}

		a.balanced .card-copy strong,
		a.balanced .card-copy p,
		a.balanced .card-copy small {
			display: block;
			overflow: visible;
		}

		a.balanced .card-copy small {
			margin-top: 0.25rem;
		}

		a.balanced .card-action {
			align-self: center;
		}
	}
</style>
