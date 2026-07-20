import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	acknowledgeHomeSnapshotMutation,
	createHomeSnapshotBootstrapState,
	homeSnapshotBootstrapReady,
	homeSnapshotRefreshDecision,
	homeSnapshotRefreshRequested,
	isHomeSnapshotConsumerPath,
	resetHomeSnapshotBootstrapForUser,
	rollbackHomeSnapshotMutationAcknowledgement,
	settleHomeSnapshotInitialSync
} from './homeSnapshotRefresh';

function componentSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('home snapshot initial sync barrier', () => {
	it('opens only after profile then challenge have both settled', () => {
		const userId = 'learner-1';
		let state = createHomeSnapshotBootstrapState(userId);

		expect(homeSnapshotBootstrapReady(state, userId)).toBe(false);
		state = settleHomeSnapshotInitialSync(state, userId, 'profile');
		expect(homeSnapshotBootstrapReady(state, userId)).toBe(false);
		state = settleHomeSnapshotInitialSync(state, userId, 'challenge');
		expect(homeSnapshotBootstrapReady(state, userId)).toBe(true);
	});

	it('opens after the same two settlements arrive in the opposite order', () => {
		const userId = 'learner-1';
		let state = createHomeSnapshotBootstrapState(userId);

		state = settleHomeSnapshotInitialSync(state, userId, 'challenge');
		expect(homeSnapshotBootstrapReady(state, userId)).toBe(false);
		state = settleHomeSnapshotInitialSync(state, userId, 'profile');
		expect(homeSnapshotBootstrapReady(state, userId)).toBe(true);
	});

	it('treats each first-attempt settlement alike, including no-op and failure outcomes', () => {
		const userId = 'learner-1';
		let state = createHomeSnapshotBootstrapState(userId);

		// The producers report settlement from their no-work branch or `finally`,
		// so the barrier deliberately does not distinguish success from failure.
		state = settleHomeSnapshotInitialSync(state, userId, 'profile');
		state = settleHomeSnapshotInitialSync(state, userId, 'profile');
		state = settleHomeSnapshotInitialSync(state, userId, 'challenge');

		expect(state).toEqual({
			userId,
			profileSettled: true,
			challengeSettled: true
		});
		expect(homeSnapshotBootstrapReady(state, userId)).toBe(true);
	});

	it('resets for a changed uid and ignores late settlement from the previous uid', () => {
		let state = createHomeSnapshotBootstrapState('learner-1');
		state = settleHomeSnapshotInitialSync(state, 'learner-1', 'profile');
		state = settleHomeSnapshotInitialSync(state, 'learner-1', 'challenge');
		expect(homeSnapshotBootstrapReady(state, 'learner-1')).toBe(true);

		state = resetHomeSnapshotBootstrapForUser(state, 'learner-2');
		state = settleHomeSnapshotInitialSync(state, 'learner-1', 'profile');

		expect(homeSnapshotBootstrapReady(state, 'learner-2')).toBe(false);
		expect(state).toEqual({
			userId: 'learner-2',
			profileSettled: false,
			challengeSettled: false
		});
	});

	it('does not block signed-out pages', () => {
		expect(homeSnapshotBootstrapReady(createHomeSnapshotBootstrapState(null), null)).toBe(true);
	});

	it('keeps a dirty request pending while bootstrap is closed and releases it afterward', () => {
		const request = {
			shouldRefresh: false,
			hasPendingMutation: true,
			hasImmediateMutation: true,
			pathname: '/'
		};

		expect(homeSnapshotRefreshRequested({ ...request, bootstrapReady: false })).toBe(false);
		expect(homeSnapshotRefreshRequested({ ...request, bootstrapReady: true })).toBe(true);
	});

	it('settles profile no-work and failure paths and challenge failure paths', () => {
		const profileSync = componentSource('./LocalLearnerStateSync.svelte');
		const challengeSync = componentSource('./ChallengeProgressSync.svelte');

		expect(profileSync).toMatch(
			/if \(pendingProfile\) \{\s*void syncProfile\(initialUserId\);\s*\} else \{\s*settleInitialAttempt\(initialUserId\);/
		);
		expect(profileSync).toMatch(
			/finally \{\s*syncing = false;\s*if \(initialAttemptUserId\) settleInitialAttempt\(initialAttemptUserId\);/
		);
		expect(challengeSync).toMatch(
			/finally \{\s*syncInFlight = false;\s*settleInitialAttempt\(userId\);/
		);
	});

	it('mounts the dirty-event listener before either initial sync producer', () => {
		const layout = componentSource('../../routes/+layout.svelte');

		expect(layout.indexOf('<HomeSnapshotRefresh')).toBeLessThan(
			layout.indexOf('<LocalLearnerStateSync')
		);
		expect(layout.indexOf('<HomeSnapshotRefresh')).toBeLessThan(
			layout.indexOf('<ChallengeProgressSync')
		);
	});
});

describe('home snapshot refresh decision', () => {
	it('invalidates exactly once when another request made the snapshot current', () => {
		expect(homeSnapshotRefreshDecision('current', false)).toBe('invalidate');
		expect(homeSnapshotRefreshDecision('current', true)).toBe('stop');
	});

	it('invalidates once after this request refreshes the snapshot', () => {
		expect(homeSnapshotRefreshDecision('refreshed', false)).toBe('invalidate');
		expect(homeSnapshotRefreshDecision('refreshed', true)).toBe('stop');
	});

	it('retries concurrent, superseded, or transiently failed work', () => {
		expect(homeSnapshotRefreshDecision('busy', false)).toBe('retry');
		expect(homeSnapshotRefreshDecision('superseded', false)).toBe('retry');
		expect(homeSnapshotRefreshDecision('failed', false)).toBe('retry');
		expect(homeSnapshotRefreshDecision('unexpected', false)).toBe('stop');
	});

	it('latches activity mutations until navigation reaches a snapshot consumer', () => {
		expect(
			homeSnapshotRefreshRequested({
				shouldRefresh: false,
				hasPendingMutation: true,
				hasImmediateMutation: false,
				pathname: '/recall'
			})
		).toBe(false);
		expect(
			homeSnapshotRefreshRequested({
				shouldRefresh: false,
				hasPendingMutation: true,
				hasImmediateMutation: false,
				pathname: '/subjects/biology'
			})
		).toBe(true);
		expect(homeSnapshotRefreshDecision('refreshed', false)).toBe('invalidate');
		expect(
			homeSnapshotRefreshRequested({
				shouldRefresh: false,
				hasPendingMutation: false,
				hasImmediateMutation: false,
				pathname: '/'
			})
		).toBe(false);
	});

	it('allows identity/profile imports to publish immediately from an activity route', () => {
		expect(
			homeSnapshotRefreshRequested({
				shouldRefresh: false,
				hasPendingMutation: true,
				hasImmediateMutation: true,
				pathname: '/questions/q-1/practice'
			})
		).toBe(true);
	});

	it('defers an already-stale snapshot on activity routes and refreshes it on consumers', () => {
		expect(
			homeSnapshotRefreshRequested({
				shouldRefresh: true,
				hasPendingMutation: false,
				hasImmediateMutation: false,
				pathname: '/recall'
			})
		).toBe(false);
		expect(
			homeSnapshotRefreshRequested({
				shouldRefresh: true,
				hasPendingMutation: false,
				hasImmediateMutation: false,
				pathname: '/'
			})
		).toBe(true);
	});

	it('recognises only the routes that consume the root snapshot projection', () => {
		expect(isHomeSnapshotConsumerPath('/')).toBe(true);
		expect(isHomeSnapshotConsumerPath('/profile')).toBe(true);
		expect(isHomeSnapshotConsumerPath('/subjects/biology')).toBe(true);
		expect(isHomeSnapshotConsumerPath('/challenges')).toBe(true);
		expect(isHomeSnapshotConsumerPath('/challenges/physics')).toBe(true);
		expect(isHomeSnapshotConsumerPath('/challenges/physics/half-range')).toBe(false);
		expect(isHomeSnapshotConsumerPath('/recall')).toBe(false);
		expect(isHomeSnapshotConsumerPath('/questions/q-1/practice')).toBe(false);
		expect(isHomeSnapshotConsumerPath('/gaps/gap-1')).toBe(false);
	});

	it('acknowledges a dirty version before invalidation and restores it after failure', () => {
		const acknowledgement = acknowledgeHomeSnapshotMutation(2, 5);

		expect(acknowledgement).toEqual({
			previousHandledVersion: 2,
			acknowledgedVersion: 5
		});
		expect(rollbackHomeSnapshotMutationAcknowledgement(5, acknowledgement)).toBe(2);
	});

	it('does not roll back a newer mutation acknowledgement when an older invalidation fails', () => {
		const olderAcknowledgement = acknowledgeHomeSnapshotMutation(2, 5);
		const newerAcknowledgement = acknowledgeHomeSnapshotMutation(
			olderAcknowledgement.acknowledgedVersion,
			7
		);

		expect(
			rollbackHomeSnapshotMutationAcknowledgement(
				newerAcknowledgement.acknowledgedVersion,
				olderAcknowledgement
			)
		).toBe(7);
	});
});
