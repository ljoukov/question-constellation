<script lang="ts">
	import '../app.css';
	import { navigating } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	let showRouteLoading = $state(false);

	$effect(() => {
		if (navigating.to) {
			showRouteLoading = true;
			return;
		}

		if (!showRouteLoading) {
			return;
		}

		const timeout = window.setTimeout(() => {
			showRouteLoading = false;
		}, 450);

		return () => window.clearTimeout(timeout);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app-shell">
	{#if showRouteLoading}
		<div class="route-loading" role="status" aria-live="polite">
			<span class="loading-spinner"></span>
			<span>Loading question...</span>
		</div>
	{/if}
	{@render children()}
</div>
