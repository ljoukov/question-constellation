<script lang="ts">
	import { routeLoadingMessageFor, type RouteLoadingContentType } from '$lib/routeLoading';

	let {
		contentType = 'default',
		message = '',
		compactMessage = 'Loading...'
	}: {
		contentType?: RouteLoadingContentType;
		message?: string;
		compactMessage?: string;
	} = $props();

	const resolvedMessage = $derived(message.trim() || routeLoadingMessageFor(contentType));
	const resolvedCompactMessage = $derived(compactMessage.trim() || 'Loading...');
</script>

<div class="route-loading" role="status" aria-live="polite">
	<span class="loading-spinner" aria-hidden="true"></span>
	<span class="route-loading-copy route-loading-copy-compact">{resolvedCompactMessage}</span>
	<span class="route-loading-copy route-loading-copy-expanded">{resolvedMessage}</span>
</div>
