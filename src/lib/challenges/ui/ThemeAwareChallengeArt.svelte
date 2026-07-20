<script lang="ts">
	import { onMount } from 'svelte';

	let {
		src,
		darkSrc,
		alt,
		width,
		height,
		loading = 'lazy',
		fetchpriority = 'auto'
	}: {
		src: string;
		darkSrc?: string;
		alt: string;
		width: number;
		height: number;
		loading?: 'eager' | 'lazy';
		fetchpriority?: 'high' | 'low' | 'auto';
	} = $props();

	type ResolvedTheme = 'light' | 'dark';

	let resolvedTheme = $state<ResolvedTheme | null>(null);
	const activeSrc = $derived(
		darkSrc ? (resolvedTheme === null ? undefined : resolvedTheme === 'dark' ? darkSrc : src) : src
	);

	onMount(() => {
		const root = document.documentElement;
		const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

		const syncResolvedTheme = () => {
			const documentTheme = root.dataset.theme;
			resolvedTheme =
				documentTheme === 'light' || documentTheme === 'dark'
					? documentTheme
					: systemTheme.matches
						? 'dark'
						: 'light';
		};

		syncResolvedTheme();

		const themeObserver = new MutationObserver(syncResolvedTheme);
		themeObserver.observe(root, {
			attributes: true,
			attributeFilter: ['data-theme']
		});
		systemTheme.addEventListener('change', syncResolvedTheme);

		return () => {
			themeObserver.disconnect();
			systemTheme.removeEventListener('change', syncResolvedTheme);
		};
	});
</script>

<span
	class="theme-aware-challenge-art"
	role="img"
	aria-label={alt}
	style:aspect-ratio={`${width} / ${height}`}
>
	<img
		src={activeSrc}
		alt=""
		aria-hidden="true"
		{width}
		{height}
		{loading}
		{fetchpriority}
		decoding="async"
	/>
</span>

<style>
	.theme-aware-challenge-art {
		position: relative;
		isolation: isolate;
		display: block;
		width: 100%;
		min-width: 0;
		overflow: hidden;
		background: var(--qc-ui-surface-muted);
	}

	:global(html[data-visual-effects='on']) .theme-aware-challenge-art::after {
		position: absolute;
		z-index: 2;
		top: -38%;
		bottom: -38%;
		left: -42%;
		width: 24%;
		pointer-events: none;
		content: '';
		background: linear-gradient(
			90deg,
			transparent 0%,
			color-mix(in srgb, white 18%, transparent) 26%,
			color-mix(in srgb, var(--qc-ui-accent) 34%, white 28%) 50%,
			color-mix(in srgb, white 15%, transparent) 72%,
			transparent 100%
		);
		mix-blend-mode: screen;
		transform: translate3d(0, 0, 0) rotate(16deg);
		animation: challenge-art-light-ray 2.35s cubic-bezier(0.2, 0.76, 0.2, 1) 240ms 1 both;
	}

	img {
		position: absolute;
		z-index: 1;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	@keyframes challenge-art-light-ray {
		from {
			transform: translate3d(0, 0, 0) rotate(16deg);
		}
		to {
			transform: translate3d(720%, 0, 0) rotate(16deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(html[data-visual-effects='on']) .theme-aware-challenge-art::after {
			display: none;
			animation: none;
		}
	}
</style>
