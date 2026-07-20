<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ChallengePanel from '$lib/challenges/ui/ChallengePanel.svelte';
	import { ArrowLeft, FileQuestion, RotateCcw, TriangleAlert, WifiOff } from '@lucide/svelte';
	import type { Component } from 'svelte';

	const notFound = $derived(page.status === 404);
	const failure = $derived(page.error?.failure ?? null);
	const connectionFailure = $derived(
		failure?.kind === 'offline' ||
			failure?.kind === 'connection' ||
			failure?.kind === 'timeout' ||
			failure?.kind === 'interrupted'
	);
	const title = $derived.by(() => {
		if (notFound) return "We can't find that page";
		if (failure?.kind === 'offline') return "You're offline";
		if (connectionFailure) return 'The connection dropped';
		if (failure?.kind === 'busy') return 'Question Constellation is busy';
		return 'Something went wrong';
	});
	const message = $derived.by(() => {
		if (notFound) return 'The link may be out of date. Return to Challenges to keep exploring.';
		if (failure?.kind === 'offline') return 'Check your internet connection, then try again.';
		if (connectionFailure) return 'Check your connection, then try loading the page again.';
		if (failure?.kind === 'busy') return 'Wait a moment, then try loading the page again.';
		return 'We could not load this page. Try again in a moment.';
	});
	const ErrorIcon = $derived<Component>(
		notFound ? FileQuestion : connectionFailure ? WifiOff : TriangleAlert
	);

	function retryPage() {
		window.location.reload();
	}
</script>

<svelte:head>
	<title>{title} | Question Constellation</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="qc-error-page">
	<AppTopbar showNavigation />
	<section class="qc-error-card" aria-labelledby="qc-error-title">
		<ChallengePanel>
			<div class="qc-error-icon" class:missing={notFound} aria-hidden="true">
				<ErrorIcon size={24} strokeWidth={1.8} />
			</div>
			<div class="qc-error-copy">
				<p class="qc-error-kicker">{notFound ? 'Page not found' : 'Page could not load'}</p>
				<h1 id="qc-error-title">{title}</h1>
				<p>{message}</p>
			</div>
			<div class="qc-error-actions">
				{#if !notFound}
					<button class="qc-action-button primary" type="button" onclick={retryPage}>
						<RotateCcw size={17} aria-hidden="true" />
						Try again
					</button>
				{/if}
				<a class:primary={notFound} class="qc-action-button" href={resolve('/challenges')}>
					<ArrowLeft size={17} aria-hidden="true" />
					Back to challenges
				</a>
			</div>
		</ChallengePanel>
	</section>
</main>

<style>
	.qc-error-page {
		display: flex;
		flex-direction: column;
		min-height: var(--app-viewport-height, 100vh);
		background: var(--qc-ui-canvas);
		color: var(--qc-ui-text);
	}

	.qc-error-card {
		display: grid;
		flex: 1 1 auto;
		align-items: start;
		width: min(100% - 4rem, 48rem);
		margin: 0 auto;
		padding: clamp(2.5rem, 9vh, 6rem) 0 2rem;
	}

	.qc-error-card :global(.challenge-panel) {
		grid-template-columns: auto minmax(0, 1fr);
		gap: 1.15rem 1.25rem;
		padding: clamp(1.25rem, 3.5vw, 2rem);
	}

	.qc-error-icon {
		display: grid;
		place-items: center;
		width: 3.25rem;
		height: 3.25rem;
		border: 1px solid color-mix(in srgb, var(--qc-ui-danger, #b42318) 25%, transparent);
		background: var(--qc-ui-danger-soft, color-mix(in srgb, #b42318 9%, transparent));
		color: var(--qc-ui-danger, #b42318);
	}

	.qc-error-icon.missing {
		border-color: var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text-secondary);
	}

	.qc-error-copy {
		display: grid;
		gap: 0.7rem;
		max-width: 35rem;
	}

	.qc-error-kicker,
	.qc-error-copy h1,
	.qc-error-copy > p {
		margin: 0;
	}

	.qc-error-kicker {
		color: var(--qc-ui-text-subtle, var(--qc-ui-text-muted));
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.qc-error-copy h1 {
		font-family: inherit;
		font-size: clamp(1.7rem, 4.5vw, 2.4rem);
		font-weight: 750;
		line-height: 1.08;
		letter-spacing: -0.025em;
	}

	.qc-error-copy > p {
		color: var(--qc-ui-text-muted);
		line-height: 1.6;
	}

	.qc-error-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		grid-column: 2;
	}

	.qc-error-actions :global(.qc-action-button) {
		min-height: 3rem;
	}

	@media (max-width: 36rem) {
		.qc-error-card {
			width: calc(100% - 2rem);
			padding-top: 2rem;
		}

		.qc-error-card :global(.challenge-panel) {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.qc-error-actions {
			display: grid;
			grid-column: 1;
		}

		.qc-error-actions :global(.qc-action-button) {
			width: 100%;
		}
	}
</style>
