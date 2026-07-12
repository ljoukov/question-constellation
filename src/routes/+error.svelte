<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import { ArrowLeft, FileQuestion } from '@lucide/svelte';

	const notFound = $derived(page.status === 404);
	const failure = $derived(page.error?.failure ?? null);
	const title = $derived(
		notFound ? 'Page not found' : (failure?.title ?? 'Could not load this page')
	);
	const message = $derived(
		notFound
			? 'This page may have moved, or the link may be incomplete.'
			: (failure?.message ??
					'Question Constellation could not load this page. Retry, or return to the question bank.')
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
		<div class="qc-error-icon" aria-hidden="true"><FileQuestion size={26} /></div>
		<p class="qc-error-kicker">{notFound ? 'Missing page' : 'Page load failed'}</p>
		<h1 id="qc-error-title">{title}</h1>
		{#if failure}
			<RequestFailureNotice {failure} onRetry={retryPage} retryLabel="Retry page" />
		{:else}
			<p>{message}</p>
		{/if}
		<div class="qc-error-actions">
			<a href={resolve('/')}>
				<ArrowLeft size={17} aria-hidden="true" />
				Question bank
			</a>
		</div>
		{#if !notFound}
			<small>Status {page.status}</small>
		{/if}
	</section>
</main>

<style>
	.qc-error-page {
		min-height: var(--app-viewport-height, 100vh);
		background: var(--qc-ui-canvas);
		color: var(--qc-ui-text);
	}

	.qc-error-card {
		display: grid;
		gap: 0.8rem;
		width: min(100% - 2rem, 40rem);
		margin: clamp(3rem, 10vh, 7rem) auto 2rem;
		padding: clamp(1.4rem, 5vw, 2.5rem);
		border: 1px solid var(--qc-ui-border);
		border-radius: 1rem;
		background: var(--qc-ui-surface);
		box-shadow: 0 20px 70px rgb(2 6 23 / 0.12);
	}

	.qc-error-icon {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		border-radius: 999px;
		background: var(--qc-ui-danger-soft, color-mix(in srgb, #b42318 9%, transparent));
		color: var(--qc-ui-danger, #b42318);
	}

	.qc-error-kicker,
	.qc-error-card h1,
	.qc-error-card > p,
	.qc-error-card small {
		margin: 0;
	}

	.qc-error-kicker {
		color: var(--qc-ui-text-subtle, var(--qc-ui-text-muted));
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.qc-error-card h1 {
		font-family: inherit;
		font-size: clamp(1.65rem, 5vw, 2.35rem);
		font-weight: 750;
		letter-spacing: -0.025em;
	}

	.qc-error-card > p {
		color: var(--qc-ui-text-muted);
		line-height: 1.6;
	}

	.qc-error-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		margin-top: 0.4rem;
	}

	.qc-error-actions a {
		display: inline-flex;
		gap: 0.45rem;
		align-items: center;
		justify-content: center;
		min-height: 2.7rem;
		padding: 0.65rem 0.9rem;
		border: 1px solid var(--qc-ui-border);
		border-radius: 0.55rem;
		background: var(--qc-ui-surface-raised, var(--qc-ui-surface));
		color: var(--qc-ui-text);
		font: inherit;
		font-weight: 750;
		text-decoration: none;
		cursor: pointer;
	}

	.qc-error-card small {
		color: var(--qc-ui-text-subtle, var(--qc-ui-text-muted));
		font-size: 0.72rem;
	}
</style>
