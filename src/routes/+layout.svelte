<script lang="ts">
	import '../app.css';
	import { navigating } from '$app/state';
	import { onMount } from 'svelte';
	import {
		applyDocumentTheme,
		setThemePreference,
		startAutomaticThemeSync,
		themePreference,
		type ThemePreference
	} from '$lib/themePreference';
	import {
		applyDocumentVisualEffects,
		setVisualEffectsPreference,
		visualEffectsPreference
	} from '$lib/visualEffectsPreference';
	import RouteLoadingToast from '$lib/components/RouteLoadingToast.svelte';
	import AnalyticsTracker from '$lib/analytics/AnalyticsTracker.svelte';
	import BackgroundSyncStatus from '$lib/components/BackgroundSyncStatus.svelte';
	import ConnectionStatus from '$lib/components/ConnectionStatus.svelte';
	import ChallengeProgressSync from '$lib/components/ChallengeProgressSync.svelte';
	import HomeSnapshotRefresh from '$lib/components/HomeSnapshotRefresh.svelte';
	import LocalLearnerStateSync from '$lib/components/LocalLearnerStateSync.svelte';
	import {
		createHomeSnapshotBootstrapState,
		homeSnapshotBootstrapReady,
		resetHomeSnapshotBootstrapForUser,
		settleHomeSnapshotInitialSync,
		type HomeSnapshotInitialSync
	} from '$lib/components/homeSnapshotRefresh';
	import { routeLoadingContentTypeForRoute, type RouteLoadingContentType } from '$lib/routeLoading';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	let showRouteLoading = $state(false);
	let routeLoadingContentType = $state<RouteLoadingContentType>('default');
	let homeSnapshotBootstrap = $state(createHomeSnapshotBootstrapState(null));

	const serverThemePreference = $derived(validThemePreference(data.themePreference));
	const serverVisualEffectsEnabled = $derived(data.visualEffectsEnabled !== false);
	const homeSnapshotUserId = $derived(data.user?.uid ?? null);
	const canRefreshHomeSnapshot = $derived(
		homeSnapshotBootstrapReady(homeSnapshotBootstrap, homeSnapshotUserId)
	);

	function settleHomeSnapshotBootstrap(userId: string, sync: HomeSnapshotInitialSync) {
		if (userId !== homeSnapshotUserId) return;
		const current = resetHomeSnapshotBootstrapForUser(homeSnapshotBootstrap, userId);
		homeSnapshotBootstrap = settleHomeSnapshotInitialSync(current, userId, sync);
	}

	function validThemePreference(value: unknown): ThemePreference | null {
		return value === 'auto' || value === 'light' || value === 'dark' ? value : null;
	}

	function syncAppViewportHeight() {
		if (typeof window === 'undefined') return;
		const root = document.documentElement;
		const visualViewport = window.visualViewport;
		if (visualViewport && visualViewport.scale > 1.01) {
			root.dataset.viewportZoomed = 'true';
			// Keep the last layout-height value while pinch-zoom changes only the
			// visual viewport. Reflowing full-screen cards to the magnified viewport
			// would enlarge text and shrink its container at the same time.
			if (!root.style.getPropertyValue('--app-viewport-height')) {
				root.style.setProperty('--app-viewport-height', `${root.clientHeight}px`);
			}
			return;
		}
		delete root.dataset.viewportZoomed;
		const viewportHeight = visualViewport?.height ?? window.innerHeight;
		root.style.setProperty('--app-viewport-height', `${viewportHeight}px`);
	}

	onMount(() => {
		let stopAutomaticThemeSync = () => {};
		syncAppViewportHeight();
		if (serverThemePreference) {
			setThemePreference(serverThemePreference);
		}
		setVisualEffectsPreference(serverVisualEffectsEnabled);
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
		const unsubscribeVisualEffects = visualEffectsPreference.subscribe(applyDocumentVisualEffects);

		return () => {
			unsubscribe();
			unsubscribeVisualEffects();
			stopAutomaticThemeSync();
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
			const timeout = window.setTimeout(() => {
				showRouteLoading = true;
			}, 180);

			return () => window.clearTimeout(timeout);
		}

		if (!showRouteLoading) {
			return;
		}

		const timeout = window.setTimeout(() => {
			showRouteLoading = false;
		}, 180);

		return () => window.clearTimeout(timeout);
	});

	$effect(() => {
		homeSnapshotBootstrap = resetHomeSnapshotBootstrapForUser(
			homeSnapshotBootstrap,
			homeSnapshotUserId
		);
	});
</script>

<svelte:head>
	<meta name="qc-theme-preference" content={serverThemePreference ?? ''} />
	<meta name="qc-visual-effects-enabled" content={serverVisualEffectsEnabled ? 'true' : 'false'} />
	<script>
		(() => {
			const visualEffectsEnabled = document
				.querySelector('meta[name="qc-visual-effects-enabled"]')
				?.getAttribute('content');
			document.documentElement.dataset.visualEffects =
				visualEffectsEnabled === 'false' ? 'off' : 'on';
			try {
				const serverPreference = document
					.querySelector('meta[name="qc-theme-preference"]')
					?.getAttribute('content');
				const storedPreference = window.localStorage.getItem('question-constellation-theme');
				const preference =
					serverPreference === 'auto' || serverPreference === 'light' || serverPreference === 'dark'
						? serverPreference
						: storedPreference;
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
	<link rel="preload" as="image" href="/brand/question-constellation-logo.svg" />
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
	<AnalyticsTracker />
	<BackgroundSyncStatus />
	<ConnectionStatus />
	{#key homeSnapshotUserId ?? 'signed-out'}
		<HomeSnapshotRefresh
			shouldRefresh={data.homeSnapshotShouldRefresh}
			snapshot={data.homeSnapshot}
			bootstrapReady={canRefreshHomeSnapshot}
		/>
		<LocalLearnerStateSync
			user={data.user}
			onInitialSettled={(userId) => settleHomeSnapshotBootstrap(userId, 'profile')}
		/>
		<ChallengeProgressSync
			user={data.user}
			initialProgress={data.homeSnapshot?.challengeProgress}
			onInitialSettled={(userId) => settleHomeSnapshotBootstrap(userId, 'challenge')}
		/>
	{/key}
	{#if showRouteLoading}
		<RouteLoadingToast contentType={routeLoadingContentType} />
	{/if}
	{@render children()}
</div>
