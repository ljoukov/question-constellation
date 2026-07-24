<script lang="ts">
	import { onMount } from 'svelte';

	let {
		src,
		darkSrc,
		alt,
		width,
		height,
		loading = 'lazy',
		fetchpriority = 'auto',
		decorative = false
	}: {
		src: string;
		darkSrc?: string;
		alt: string;
		width: number;
		height: number;
		loading?: 'eager' | 'lazy';
		fetchpriority?: 'high' | 'low' | 'auto';
		decorative?: boolean;
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
	role={decorative ? undefined : 'img'}
	aria-label={decorative ? undefined : alt}
	aria-hidden={decorative ? 'true' : undefined}
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

	img {
		position: absolute;
		z-index: 1;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
</style>
