export const HOME_SNAPSHOT_DIRTY_EVENT = 'qc:home-snapshot-dirty';

export type HomeSnapshotDirtyRequest = {
	immediate: boolean;
};

/**
 * Tell the root snapshot coordinator that a confirmed learner mutation made
 * its one-row projection stale. Activity routes latch the default request
 * until the learner enters a snapshot-consuming route. Identity/profile
 * imports can request an immediate publication before a new subject route is
 * reachable.
 */
export function markHomeSnapshotDirty({ immediate = false }: { immediate?: boolean } = {}): void {
	if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
	window.dispatchEvent(
		new CustomEvent<HomeSnapshotDirtyRequest>(HOME_SNAPSHOT_DIRTY_EVENT, {
			detail: { immediate }
		})
	);
}

export function listenForHomeSnapshotDirty(
	onDirty: (request: HomeSnapshotDirtyRequest) => void
): () => void {
	if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
		return () => {};
	}
	const listener = (event: Event) => {
		const detail = (event as CustomEvent<Partial<HomeSnapshotDirtyRequest>>).detail;
		onDirty({ immediate: detail?.immediate === true });
	};
	window.addEventListener(HOME_SNAPSHOT_DIRTY_EVENT, listener);
	return () => window.removeEventListener(HOME_SNAPSHOT_DIRTY_EVENT, listener);
}
