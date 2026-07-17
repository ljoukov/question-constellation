<script lang="ts">
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import type { AdminUser } from '$lib/server/auth/session';
	import type { Snippet } from 'svelte';

	let {
		user = null,
		wide = false,
		immersive = false,
		children
	}: {
		user?: AdminUser | null;
		wide?: boolean;
		immersive?: boolean;
		children: Snippet;
	} = $props();
</script>

<main class:immersive class="qc-real-app challenge-route-page">
	<AppTopbar {user} showSearch={false} showSubject={false} showNavigation sticky />
	<div class:wide class="challenge-route-shell">
		{@render children()}
	</div>
</main>

<style>
	.challenge-route-page {
		display: flex;
		min-height: var(--app-viewport-height, 100vh);
		flex-direction: column;
		--qc-topbar-height: calc(4rem + env(safe-area-inset-top));
	}

	.challenge-route-shell {
		display: grid;
		gap: clamp(2rem, 5vw, 4rem);
		width: min(100%, 64rem);
		margin: 0 auto;
		padding: clamp(1rem, 3vw, 2rem) max(clamp(1rem, 3vw, 2rem), env(safe-area-inset-right))
			max(5rem, env(safe-area-inset-bottom)) max(clamp(1rem, 3vw, 2rem), env(safe-area-inset-left));
	}

	.challenge-route-shell.wide {
		width: min(100%, 72rem);
	}

	@media (max-height: 520px) and (orientation: landscape) {
		.challenge-route-page.immersive {
			--qc-topbar-height: 0px;
		}

		.challenge-route-page.immersive :global(.qc-topbar) {
			display: none;
		}

		.challenge-route-page.immersive .challenge-route-shell {
			padding-top: 0.4rem;
		}
	}
</style>
