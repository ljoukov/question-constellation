<script lang="ts">
	import { authStartHref } from '$lib/authReturn';
	import {
		markAnonymousLearnerProfileSynced,
		readAnonymousLearnerProfile,
		type AnonymousLearnerProfile
	} from '$lib/anonymousLearnerProfile';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import { markHomeSnapshotDirty } from '$lib/homeSnapshotClient';
	import {
		classifyRequestFailure,
		fetchWithResponseTimeout,
		requestErrorFromResponse,
		type RequestFailure
	} from '$lib/requestFailure';
	import type { AdminUser } from '$lib/server/auth/session';
	import { onMount } from 'svelte';

	let {
		user,
		onInitialSettled
	}: {
		user: AdminUser | null;
		onInitialSettled?: (userId: string) => void;
	} = $props();
	let pendingProfile = $state<AnonymousLearnerProfile | null>(null);
	let syncFailure = $state<RequestFailure | null>(null);
	let syncing = $state(false);
	let initialAttemptSettled = false;

	function settleInitialAttempt(userId: string) {
		if (initialAttemptSettled) return;
		initialAttemptSettled = true;
		onInitialSettled?.(userId);
	}

	async function syncProfile(initialAttemptUserId: string | null = null) {
		if (!user || !pendingProfile || syncing) {
			if (initialAttemptUserId) settleInitialAttempt(initialAttemptUserId);
			return;
		}
		const profile = pendingProfile;
		let syncLatestAfterward = false;
		let serverMayHavePartiallyCommitted = false;
		syncing = true;
		syncFailure = null;
		try {
			// Once the request is sent, a timeout or dropped response cannot prove
			// the Worker did not commit. Conservatively republish the projection;
			// retries remain idempotent and the coordinator coalesces this signal.
			serverMayHavePartiallyCommitted = true;
			const response = await fetchWithResponseTimeout('/api/profile/import-local', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ profile }),
				keepalive: true
			});
			if (!response.ok) {
				serverMayHavePartiallyCommitted = response.status >= 500;
				throw await requestErrorFromResponse(response, 'Saved profile sync failed.');
			}
			const result = (await response.json()) as { snapshotChanged?: unknown };
			const currentProfile = readAnonymousLearnerProfile();
			if (currentProfile?.updatedAt === profile.updatedAt) {
				markAnonymousLearnerProfileSynced(profile);
				pendingProfile = null;
			} else {
				pendingProfile = currentProfile?.pendingSync ? currentProfile : null;
				syncLatestAfterward = Boolean(pendingProfile);
			}
			if (result.snapshotChanged === true) markHomeSnapshotDirty({ immediate: true });
		} catch (error) {
			if (serverMayHavePartiallyCommitted) markHomeSnapshotDirty({ immediate: true });
			console.warn('[local-profile-sync] import deferred', error);
			syncFailure = classifyRequestFailure(error, {
				action: 'sync your saved profile',
				serverLabel: 'Profile sync'
			});
		} finally {
			syncing = false;
			if (initialAttemptUserId) settleInitialAttempt(initialAttemptUserId);
			if (syncLatestAfterward) void syncProfile();
		}
	}

	function retryProfileSync() {
		if (syncFailure?.kind === 'auth') {
			window.location.assign(
				authStartHref(`${window.location.pathname}${window.location.search}${window.location.hash}`)
			);
			return;
		}
		void syncProfile();
	}

	onMount(() => {
		if (!user) return;
		const initialUserId = user.uid;
		const tryPendingProfile = () => {
			const storedProfile = readAnonymousLearnerProfile();
			pendingProfile = storedProfile?.pendingSync ? storedProfile : null;
			if (pendingProfile) void syncProfile();
		};
		const storedProfile = readAnonymousLearnerProfile();
		pendingProfile = storedProfile?.pendingSync ? storedProfile : null;
		if (pendingProfile) {
			void syncProfile(initialUserId);
		} else {
			settleInitialAttempt(initialUserId);
		}
		window.addEventListener('online', tryPendingProfile);
		window.addEventListener('focus', tryPendingProfile);
		window.addEventListener('pageshow', tryPendingProfile);
		return () => {
			window.removeEventListener('online', tryPendingProfile);
			window.removeEventListener('focus', tryPendingProfile);
			window.removeEventListener('pageshow', tryPendingProfile);
		};
	});
</script>

{#if syncFailure}
	<div class="local-profile-sync-failure">
		<RequestFailureNotice
			failure={syncFailure}
			onRetry={retryProfileSync}
			retrying={syncing}
			retryLabel={syncFailure.kind === 'auth' ? 'Sign in again' : 'Retry sync'}
			compact
		/>
	</div>
{/if}

<style>
	.local-profile-sync-failure {
		position: fixed;
		z-index: 1150;
		right: 1rem;
		bottom: max(1rem, env(safe-area-inset-bottom));
		width: min(31rem, calc(100vw - 2rem));
	}

	@media (max-width: 560px) {
		.local-profile-sync-failure {
			left: 0.75rem;
			right: 0.75rem;
			bottom: max(0.75rem, env(safe-area-inset-bottom));
			width: auto;
		}
	}
</style>
