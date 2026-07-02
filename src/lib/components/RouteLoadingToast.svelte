<script lang="ts">
	import { routeLoadingMessageFor, type RouteLoadingContentType } from '$lib/routeLoading';

	let {
		contentType = 'default',
		message = ''
	}: {
		contentType?: RouteLoadingContentType;
		message?: string;
	} = $props();

	const resolvedMessage = $derived(message.trim() || routeLoadingMessageFor(contentType));
</script>

<div class="route-loading" role="status" aria-live="polite">
	<span class="loading-spinner" aria-hidden="true"></span>
	<span>{resolvedMessage}</span>
</div>
