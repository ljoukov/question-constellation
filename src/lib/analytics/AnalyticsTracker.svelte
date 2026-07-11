<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { analyticsPageView, installAnalytics } from './client';

	let ready = $state(false);
	let lastLocation = '';

	onMount(() => {
		const stop = installAnalytics();
		ready = true;
		return stop;
	});

	$effect(() => {
		const location = `${page.url.pathname}${page.url.search}${page.url.hash}`;
		if (ready && location !== lastLocation) {
			lastLocation = location;
			analyticsPageView();
		}
	});
</script>
