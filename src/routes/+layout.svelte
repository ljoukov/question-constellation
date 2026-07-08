<script lang="ts">
	import '../app.css';
	import { navigating } from '$app/state';
	import { onMount } from 'svelte';
	import {
		applyDocumentTheme,
		startAutomaticThemeSync,
		themePreference,
		type ThemePreference
	} from '$lib/themePreference';
	import RouteLoadingToast from '$lib/components/RouteLoadingToast.svelte';
	import { routeLoadingContentTypeForRoute, type RouteLoadingContentType } from '$lib/routeLoading';
	import { installViewportZoomLock } from '$lib/viewportZoom';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	let showRouteLoading = $state(false);
	let routeLoadingContentType = $state<RouteLoadingContentType>('default');

	function syncAppViewportHeight() {
		if (typeof window === 'undefined') return;
		const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
		document.documentElement.style.setProperty('--app-viewport-height', `${viewportHeight}px`);
	}

	onMount(() => {
		let stopAutomaticThemeSync = () => {};
		const stopViewportZoomLock = installViewportZoomLock();
		syncAppViewportHeight();
		window.addEventListener('resize', syncAppViewportHeight);
		window.visualViewport?.addEventListener('resize', syncAppViewportHeight);
		window.visualViewport?.addEventListener('scroll', syncAppViewportHeight);
		const unsubscribe = themePreference.subscribe((preference: ThemePreference) => {
			stopAutomaticThemeSync();
			if (preference === 'auto') {
				stopAutomaticThemeSync = startAutomaticThemeSync();
			} else {
				applyDocumentTheme(preference);
				stopAutomaticThemeSync = () => {};
			}
		});

		return () => {
			unsubscribe();
			stopAutomaticThemeSync();
			stopViewportZoomLock();
			window.removeEventListener('resize', syncAppViewportHeight);
			window.visualViewport?.removeEventListener('resize', syncAppViewportHeight);
			window.visualViewport?.removeEventListener('scroll', syncAppViewportHeight);
		};
	});

	$effect(() => {
		if (navigating.to) {
			routeLoadingContentType = routeLoadingContentTypeForRoute(
				navigating.to.route.id,
				navigating.to.url.pathname
			);
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
	<script>
		(() => {
			try {
				const preference = window.localStorage.getItem('question-constellation-theme');
				const mode =
					preference === 'light' || preference === 'dark'
						? preference
						: window.matchMedia('(prefers-color-scheme: dark)').matches
							? 'dark'
							: 'light';
				document.documentElement.dataset.theme = mode;
				document.documentElement.classList.toggle('dark', mode === 'dark');
				document.documentElement.style.colorScheme = mode;
			} catch {
				// Keep the server-rendered default if browser storage is unavailable.
			}
		})();
	</script>
	<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
	<link rel="icon" type="image/x-icon" href="/favicon.ico" />
	<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
	<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
	<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
	<link rel="manifest" href="/site.webmanifest" />
	<meta name="application-name" content="Question Constellation" />
	<meta name="apple-mobile-web-app-title" content="Question Constellation" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="theme-color" content="#eff8f8" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#020617" media="(prefers-color-scheme: dark)" />
</svelte:head>

<div class="app-shell">
	{#if showRouteLoading}
		<RouteLoadingToast contentType={routeLoadingContentType} />
	{/if}
	{@render children()}
</div>
