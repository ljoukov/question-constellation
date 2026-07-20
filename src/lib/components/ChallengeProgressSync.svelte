<script lang="ts">
	import {
		CHALLENGE_PROGRESS_UPDATED_EVENT,
		importGuestChallengeProgress,
		syncChallengeProgress,
		type ChallengeProgressUpdatedDetail
	} from '$lib/challenges/progressSync';
	import type { ChallengeProgress } from '$lib/challenges/progress';
	import type { AdminUser } from '$lib/server/auth/session';
	import { untrack } from 'svelte';

	let {
		user,
		initialProgress = null,
		onInitialSettled
	}: {
		user: AdminUser | null;
		initialProgress?: ChallengeProgress | null;
		onInitialSettled?: (userId: string) => void;
	} = $props();
	const userId = $derived(user?.uid ?? null);
	let handledSnapshotUserId: string | null = null;
	let handledSnapshotFingerprint: string | null = null;
	let settledInitialUserId: string | null = null;

	function settleInitialAttempt(userId: string) {
		if (settledInitialUserId === userId) return;
		settledInitialUserId = userId;
		onInitialSettled?.(userId);
	}

	function snapshotFingerprint(progress: ChallengeProgress | null): string | null {
		return progress ? JSON.stringify(progress) : null;
	}

	$effect(() => {
		if (!userId || typeof window === 'undefined') return;
		const snapshotProgress = untrack(() => initialProgress);
		handledSnapshotUserId = userId;
		handledSnapshotFingerprint = snapshotFingerprint(snapshotProgress);
		let initialImportFinished = false;
		let lastConfirmedProgress = snapshotProgress;
		let syncInFlight = false;
		let stopped = false;

		const sync = async () => {
			if (syncInFlight) return;
			syncInFlight = true;
			try {
				if (!initialImportFinished) {
					lastConfirmedProgress = await importGuestChallengeProgress(
						userId,
						window.localStorage,
						snapshotProgress
					);
					initialImportFinished = true;
					return;
				}
				lastConfirmedProgress = await syncChallengeProgress(
					userId,
					undefined,
					window.localStorage,
					lastConfirmedProgress
				);
			} catch (error) {
				// The shared background-sync surface owns retry messaging.
				console.warn('[challenge-progress-sync] sync deferred', error);
			} finally {
				syncInFlight = false;
				settleInitialAttempt(userId);
			}
		};
		const handleProgressUpdated = (event: Event) => {
			const detail = (event as CustomEvent<ChallengeProgressUpdatedDetail>).detail;
			if (detail?.userId === userId && detail.confirmed) {
				lastConfirmedProgress = detail.progress;
			}
		};
		const retry = () => {
			if (!stopped) void sync();
		};

		retry();
		window.addEventListener(CHALLENGE_PROGRESS_UPDATED_EVENT, handleProgressUpdated);
		window.addEventListener('online', retry);
		window.addEventListener('focus', retry);
		window.addEventListener('pageshow', retry);
		return () => {
			stopped = true;
			window.removeEventListener(CHALLENGE_PROGRESS_UPDATED_EVENT, handleProgressUpdated);
			window.removeEventListener('online', retry);
			window.removeEventListener('focus', retry);
			window.removeEventListener('pageshow', retry);
		};
	});

	$effect(() => {
		if (!userId || typeof window === 'undefined') {
			handledSnapshotUserId = null;
			handledSnapshotFingerprint = null;
			return;
		}
		const incomingFingerprint = snapshotFingerprint(initialProgress);
		if (
			!initialProgress ||
			(handledSnapshotUserId === userId && handledSnapshotFingerprint === incomingFingerprint)
		) {
			return;
		}

		handledSnapshotUserId = userId;
		handledSnapshotFingerprint = incomingFingerprint;
		void importGuestChallengeProgress(userId, window.localStorage, initialProgress).catch(
			(error) => {
				// The shared background-sync surface owns retry messaging.
				console.warn('[challenge-progress-sync] snapshot reconciliation deferred', error);
			}
		);
	});
</script>
