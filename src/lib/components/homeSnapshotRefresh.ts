export type HomeSnapshotRefreshDecision = 'invalidate' | 'retry' | 'stop';
export type HomeSnapshotInitialSync = 'profile' | 'challenge';

export type HomeSnapshotBootstrapState = {
	userId: string | null;
	profileSettled: boolean;
	challengeSettled: boolean;
};

export type HomeSnapshotMutationAcknowledgement = {
	previousHandledVersion: number;
	acknowledgedVersion: number;
};

export function createHomeSnapshotBootstrapState(
	userId: string | null
): HomeSnapshotBootstrapState {
	return {
		userId,
		profileSettled: false,
		challengeSettled: false
	};
}

export function resetHomeSnapshotBootstrapForUser(
	state: HomeSnapshotBootstrapState,
	userId: string | null
): HomeSnapshotBootstrapState {
	return state.userId === userId ? state : createHomeSnapshotBootstrapState(userId);
}

export function settleHomeSnapshotInitialSync(
	state: HomeSnapshotBootstrapState,
	userId: string,
	sync: HomeSnapshotInitialSync
): HomeSnapshotBootstrapState {
	if (!userId || state.userId !== userId) return state;
	if (sync === 'profile') {
		return state.profileSettled ? state : { ...state, profileSettled: true };
	}
	return state.challengeSettled ? state : { ...state, challengeSettled: true };
}

export function homeSnapshotBootstrapReady(
	state: HomeSnapshotBootstrapState,
	userId: string | null
): boolean {
	if (!userId) return true;
	return (
		state.userId === userId && state.profileSettled === true && state.challengeSettled === true
	);
}

export function acknowledgeHomeSnapshotMutation(
	handledVersion: number,
	requestedVersion: number
): HomeSnapshotMutationAcknowledgement {
	return {
		previousHandledVersion: handledVersion,
		acknowledgedVersion: Math.max(handledVersion, requestedVersion)
	};
}

export function rollbackHomeSnapshotMutationAcknowledgement(
	handledVersion: number,
	acknowledgement: HomeSnapshotMutationAcknowledgement
): number {
	return handledVersion === acknowledgement.acknowledgedVersion
		? acknowledgement.previousHandledVersion
		: handledVersion;
}

export function isHomeSnapshotConsumerPath(pathname: string): boolean {
	const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
	return (
		normalized === '/' ||
		normalized === '/profile' ||
		normalized.startsWith('/profile/') ||
		normalized === '/subjects' ||
		normalized.startsWith('/subjects/') ||
		normalized === '/challenges' ||
		/^\/challenges\/[^/]+$/.test(normalized)
	);
}

export function homeSnapshotRefreshRequested({
	shouldRefresh,
	hasPendingMutation,
	hasImmediateMutation,
	pathname,
	bootstrapReady = true
}: {
	shouldRefresh: boolean;
	hasPendingMutation: boolean;
	hasImmediateMutation: boolean;
	pathname: string;
	bootstrapReady?: boolean;
}): boolean {
	if (!bootstrapReady) return false;
	if (!shouldRefresh && !hasPendingMutation) return false;
	return hasImmediateMutation || isHomeSnapshotConsumerPath(pathname);
}

export function homeSnapshotRefreshDecision(
	status: unknown,
	alreadyInvalidated: boolean
): HomeSnapshotRefreshDecision {
	if (status === 'refreshed' || status === 'current') {
		return alreadyInvalidated ? 'stop' : 'invalidate';
	}
	if (status === 'busy' || status === 'superseded' || status === 'failed') return 'retry';
	return 'stop';
}
