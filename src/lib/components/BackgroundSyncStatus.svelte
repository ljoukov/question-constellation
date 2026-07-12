<script lang="ts">
	import {
		BACKGROUND_SYNC_CLEAR_EVENT,
		BACKGROUND_SYNC_ISSUE_EVENT,
		type BackgroundSyncIssue
	} from '$lib/backgroundSync';
	import { authStartHref } from '$lib/authReturn';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import { onMount } from 'svelte';

	let issues = $state<BackgroundSyncIssue[]>([]);
	let retrying = $state(false);
	const activeIssue = $derived(issues.at(-1) ?? null);

	onMount(() => {
		const handleIssue = (event: Event) => {
			const issue = (event as CustomEvent<BackgroundSyncIssue>).detail;
			issues = [...issues.filter((entry) => entry.id !== issue.id), issue];
		};
		const handleClear = (event: Event) => {
			const id = (event as CustomEvent<string>).detail;
			issues = issues.filter((entry) => entry.id !== id);
		};
		window.addEventListener(BACKGROUND_SYNC_ISSUE_EVENT, handleIssue);
		window.addEventListener(BACKGROUND_SYNC_CLEAR_EVENT, handleClear);
		return () => {
			window.removeEventListener(BACKGROUND_SYNC_ISSUE_EVENT, handleIssue);
			window.removeEventListener(BACKGROUND_SYNC_CLEAR_EVENT, handleClear);
		};
	});

	async function retryActiveIssue() {
		if (!activeIssue || retrying) return;
		if (activeIssue.failure.kind === 'auth') {
			window.location.assign(
				authStartHref(`${window.location.pathname}${window.location.search}${window.location.hash}`)
			);
			return;
		}
		retrying = true;
		try {
			await activeIssue.retry();
		} finally {
			retrying = false;
		}
	}
</script>

{#if activeIssue}
	<div class="background-sync-status">
		<RequestFailureNotice
			failure={activeIssue.failure}
			onRetry={() => void retryActiveIssue()}
			{retrying}
			retryLabel={activeIssue.failure.kind === 'auth'
				? 'Sign in again'
				: issues.length > 1
					? `Retry sync (${issues.length})`
					: 'Retry sync'}
			compact
		/>
	</div>
{/if}

<style>
	.background-sync-status {
		position: fixed;
		z-index: 110;
		top: 4.75rem;
		right: 1rem;
		width: min(31rem, calc(100vw - 2rem));
	}

	@media (max-width: 560px) {
		.background-sync-status {
			left: 0.75rem;
			right: 0.75rem;
			top: 4.25rem;
			width: auto;
		}
	}
</style>
