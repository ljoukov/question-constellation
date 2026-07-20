import { markHomeSnapshotDirty } from '$lib/homeSnapshotClient';

export type LatestProfileSaveQueue = {
	request(revision: number): boolean;
	settle(revision: number): boolean;
	reset(): void;
	readonly activeRevision: number | null;
	readonly queuedRevision: number | null;
};

/**
 * Keeps profile writes single-flight while retaining only the newest edit made
 * during the active request. The caller owns the request itself and must call
 * `settle` after it has finished (or has been aborted).
 */
export function createLatestProfileSaveQueue(
	start: (revision: number) => void
): LatestProfileSaveQueue {
	let activeRevision: number | null = null;
	let queuedRevision: number | null = null;

	function startRevision(revision: number) {
		activeRevision = revision;
		start(revision);
	}

	return {
		request(revision) {
			if (activeRevision === null) {
				startRevision(revision);
				return true;
			}
			if (revision !== activeRevision && (queuedRevision === null || revision > queuedRevision)) {
				queuedRevision = revision;
			}
			return false;
		},
		settle(revision) {
			if (activeRevision !== revision) return false;
			const nextRevision = queuedRevision;
			activeRevision = null;
			queuedRevision = null;
			if (nextRevision !== null) startRevision(nextRevision);
			return true;
		},
		reset() {
			activeRevision = null;
			queuedRevision = null;
		},
		get activeRevision() {
			return activeRevision;
		},
		get queuedRevision() {
			return queuedRevision;
		}
	};
}

export function handleProfileSaveSnapshotResult(result: { type: string }): boolean {
	if (result.type === 'success') {
		markHomeSnapshotDirty({ immediate: true });
		return true;
	}
	// Profile subjects/selections are persisted by independent statements.
	// A server error can therefore follow a partial commit.
	if (result.type === 'error') markHomeSnapshotDirty({ immediate: true });
	return false;
}
