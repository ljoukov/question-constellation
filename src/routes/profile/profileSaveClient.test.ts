import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenForHomeSnapshotDirty, type HomeSnapshotDirtyRequest } from '$lib/homeSnapshotClient';

import { createLatestProfileSaveQueue, handleProfileSaveSnapshotResult } from './profileSaveClient';

let events: EventTarget;
let dirtyEventCount: number;
let lastDirtyRequest: HomeSnapshotDirtyRequest | null;
let stopListening: () => void;

beforeEach(() => {
	events = new EventTarget();
	dirtyEventCount = 0;
	lastDirtyRequest = null;
	vi.stubGlobal('window', events);
	stopListening = listenForHomeSnapshotDirty((request) => {
		dirtyEventCount += 1;
		lastDirtyRequest = request;
	});
});

afterEach(() => {
	stopListening();
	vi.unstubAllGlobals();
});

describe('profile save snapshot refresh', () => {
	it('requests a root snapshot rebuild after a confirmed profile save', () => {
		expect(handleProfileSaveSnapshotResult({ type: 'success' })).toBe(true);
		expect(dirtyEventCount).toBe(1);
		expect(lastDirtyRequest).toEqual({ immediate: true });
	});

	it('conservatively requests publication after a server error that may follow a partial save', () => {
		expect(handleProfileSaveSnapshotResult({ type: 'error' })).toBe(false);
		expect(dirtyEventCount).toBe(1);
		expect(lastDirtyRequest).toEqual({ immediate: true });
	});

	it.each(['failure', 'redirect'] as const)(
		'does not refresh the root snapshot for a %s result',
		(type) => {
			expect(handleProfileSaveSnapshotResult({ type })).toBe(false);
			expect(dirtyEventCount).toBe(0);
		}
	);
});

describe('latest profile save queue', () => {
	it('serializes rapid edits and starts only the latest state after the active request settles', () => {
		const started: number[] = [];
		const persisted: number[] = [];
		const completions = new Map<number, () => void>();
		const queue = createLatestProfileSaveQueue((revision) => {
			started.push(revision);
			completions.set(revision, () => {
				persisted.push(revision);
				queue.settle(revision);
			});
		});

		expect(queue.request(1)).toBe(true);
		expect(queue.request(2)).toBe(false);
		expect(queue.request(3)).toBe(false);
		expect(started).toEqual([1]);
		expect(queue.activeRevision).toBe(1);
		expect(queue.queuedRevision).toBe(3);

		completions.get(1)?.();
		expect(persisted).toEqual([1]);
		expect(started).toEqual([1, 3]);
		expect(queue.activeRevision).toBe(3);
		expect(queue.queuedRevision).toBeNull();

		completions.get(3)?.();
		expect(persisted).toEqual([1, 3]);
		expect(persisted.at(-1)).toBe(3);
		expect(queue.activeRevision).toBeNull();
	});

	it('does not let a stale completion release or duplicate the latest request', () => {
		const started: number[] = [];
		const queue = createLatestProfileSaveQueue((revision) => started.push(revision));

		queue.request(7);
		queue.request(8);
		expect(queue.settle(6)).toBe(false);
		expect(started).toEqual([7]);
		expect(queue.activeRevision).toBe(7);
		expect(queue.queuedRevision).toBe(8);

		expect(queue.settle(7)).toBe(true);
		expect(started).toEqual([7, 8]);
		expect(queue.settle(7)).toBe(false);
		expect(started).toEqual([7, 8]);
	});

	it('keeps the latest revision blocked behind an active request after a soft timeout', () => {
		const started: number[] = [];
		const queue = createLatestProfileSaveQueue((revision) => started.push(revision));

		queue.request(11);
		queue.request(12);

		// Reporting a timeout changes UI state, not queue ownership.
		expect(started).toEqual([11]);
		expect(queue.activeRevision).toBe(11);
		expect(queue.queuedRevision).toBe(12);

		queue.settle(11);
		expect(started).toEqual([11, 12]);
		expect(queue.activeRevision).toBe(12);
	});
});

describe('profile save timeout and offline wiring', () => {
	it('does not abort or settle the active request when its UI deadline expires', () => {
		const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
		const timeoutStart = page.indexOf('saveTimeoutTimer = setTimeout(() => {');
		const timeoutEnd = page.indexOf('}, autosaveTimeoutMs);', timeoutStart);
		expect(timeoutStart).toBeGreaterThan(-1);
		expect(timeoutEnd).toBeGreaterThan(timeoutStart);
		const timeoutHandler = page.slice(timeoutStart, timeoutEnd);

		expect(timeoutHandler).not.toContain('controller.abort()');
		expect(timeoutHandler).not.toContain('profileSaveQueue.settle');
		expect(timeoutHandler).not.toContain('activeSaveController = null');
		expect(timeoutHandler).toContain('handleAutosaveFailure(');
	});

	it('queues the latest offline revision without aborting the active request', () => {
		const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
		const offlineStart = page.indexOf('const handleOffline = () => {');
		const offlineEnd = page.indexOf("window.addEventListener('offline'", offlineStart);
		expect(offlineStart).toBeGreaterThan(-1);
		expect(offlineEnd).toBeGreaterThan(offlineStart);
		const offlineHandler = page.slice(offlineStart, offlineEnd);

		expect(offlineHandler).toContain('profileSaveQueue.request(changeRevision)');
		expect(offlineHandler).not.toContain('.abort()');
		expect(offlineHandler).not.toContain('profileSaveQueue.reset()');
	});
});
