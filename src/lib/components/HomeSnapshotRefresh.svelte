<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { listenForHomeSnapshotDirty } from '$lib/homeSnapshotClient';
	import {
		acknowledgeHomeSnapshotMutation,
		homeSnapshotRefreshDecision,
		homeSnapshotRefreshRequested,
		rollbackHomeSnapshotMutationAcknowledgement
	} from './homeSnapshotRefresh';

	let {
		shouldRefresh = false,
		snapshot = null,
		bootstrapReady = true
	}: {
		shouldRefresh?: boolean;
		snapshot?: object | null;
		bootstrapReady?: boolean;
	} = $props();
	let invalidatedCurrentSnapshot = false;
	let previousSnapshot: object | null = null;
	let mutationRequestVersion = $state(0);
	let immediateRequestVersion = $state(0);
	let handledMutationRequestVersion = 0;
	let refreshInFlight: Promise<{ ok: boolean; status?: unknown }> | null = null;

	onMount(() => {
		const stopListening = listenForHomeSnapshotDirty(({ immediate }) => {
			mutationRequestVersion += 1;
			if (immediate) immediateRequestVersion = mutationRequestVersion;
			invalidatedCurrentSnapshot = false;
		});
		const resumeRefresh = () => {
			if (!shouldRefresh && mutationRequestVersion <= handledMutationRequestVersion) return;
			mutationRequestVersion += 1;
			invalidatedCurrentSnapshot = false;
		};
		window.addEventListener('online', resumeRefresh);
		window.addEventListener('focus', resumeRefresh);
		window.addEventListener('pageshow', resumeRefresh);
		return () => {
			stopListening();
			window.removeEventListener('online', resumeRefresh);
			window.removeEventListener('focus', resumeRefresh);
			window.removeEventListener('pageshow', resumeRefresh);
		};
	});

	async function requestSnapshotRefresh(): Promise<{ ok: boolean; status?: unknown }> {
		if (refreshInFlight) return await refreshInFlight;
		const request = (async () => {
			try {
				const response = await fetch('/api/home-snapshot/refresh', {
					method: 'POST',
					headers: { accept: 'application/json' }
				});
				if (!response.ok) return { ok: false };
				const result = (await response.json()) as { status?: unknown };
				return { ok: true, status: result.status };
			} catch {
				return { ok: false };
			}
		})();
		refreshInFlight = request;
		try {
			return await request;
		} finally {
			if (refreshInFlight === request) refreshInFlight = null;
		}
	}

	$effect(() => {
		const pathname = page.url.pathname;
		const requestedMutationVersion = mutationRequestVersion;
		const hasPendingMutation = requestedMutationVersion > handledMutationRequestVersion;
		const hasImmediateMutation = immediateRequestVersion > handledMutationRequestVersion;
		if (snapshot !== previousSnapshot) {
			previousSnapshot = snapshot;
			invalidatedCurrentSnapshot = false;
		}
		if (
			!homeSnapshotRefreshRequested({
				shouldRefresh,
				hasPendingMutation,
				hasImmediateMutation,
				pathname,
				bootstrapReady
			})
		) {
			return;
		}
		if (typeof window === 'undefined') return;

		let cancelled = false;
		let retryTimer: number | null = null;
		const scheduleRetry = (attempt: number) => {
			if (cancelled || attempt >= 6) return;
			retryTimer = window.setTimeout(
				() => void refresh(attempt + 1),
				Math.min(300 * 2 ** attempt, 2400)
			);
		};
		const refresh = async (attempt: number) => {
			const result = await requestSnapshotRefresh();
			if (cancelled) return;
			if (!result.ok) {
				scheduleRetry(attempt);
				return;
			}

			const decision = homeSnapshotRefreshDecision(result.status, invalidatedCurrentSnapshot);
			if (decision === 'invalidate') {
				invalidatedCurrentSnapshot = true;
				const acknowledgement = acknowledgeHomeSnapshotMutation(
					handledMutationRequestVersion,
					requestedMutationVersion
				);
				// A new snapshot prop can arrive before invalidateAll resolves. Treat
				// this request as handled first so that rerender cannot start a second
				// refresh for the same mutation.
				handledMutationRequestVersion = acknowledgement.acknowledgedVersion;
				try {
					await invalidateAll();
				} catch {
					handledMutationRequestVersion = rollbackHomeSnapshotMutationAcknowledgement(
						handledMutationRequestVersion,
						acknowledgement
					);
					invalidatedCurrentSnapshot = false;
					scheduleRetry(attempt);
				}
				return;
			}
			if (decision === 'retry') scheduleRetry(attempt);
		};
		retryTimer = window.setTimeout(
			() => void refresh(0),
			hasImmediateMutation || !hasPendingMutation ? 0 : 160
		);

		return () => {
			cancelled = true;
			if (retryTimer !== null) window.clearTimeout(retryTimer);
		};
	});
</script>
