import type { RequestFailure } from '$lib/requestFailure';

export const BACKGROUND_SYNC_ISSUE_EVENT = 'qc:background-sync-issue';
export const BACKGROUND_SYNC_CLEAR_EVENT = 'qc:background-sync-clear';

export type BackgroundSyncIssue = {
	id: string;
	failure: RequestFailure;
	retry: () => void | Promise<void>;
};

export function reportBackgroundSyncIssue(issue: BackgroundSyncIssue) {
	if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
	window.dispatchEvent(
		new CustomEvent<BackgroundSyncIssue>(BACKGROUND_SYNC_ISSUE_EVENT, { detail: issue })
	);
}

export function clearBackgroundSyncIssue(id: string) {
	if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
	window.dispatchEvent(new CustomEvent<string>(BACKGROUND_SYNC_CLEAR_EVENT, { detail: id }));
}
