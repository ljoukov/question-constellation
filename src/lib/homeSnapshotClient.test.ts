import { afterEach, describe, expect, it, vi } from 'vitest';
import { listenForHomeSnapshotDirty, markHomeSnapshotDirty } from './homeSnapshotClient';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('home snapshot client mutation signal', () => {
	it('dispatches one generic dirty event in the browser', () => {
		const browserWindow = new EventTarget();
		const listener = vi.fn();
		vi.stubGlobal('window', browserWindow);
		const stopListening = listenForHomeSnapshotDirty(listener);

		markHomeSnapshotDirty();
		expect(listener).toHaveBeenCalledOnce();
		expect(listener).toHaveBeenLastCalledWith({ immediate: false });
		stopListening();
		markHomeSnapshotDirty();
		expect(listener).toHaveBeenCalledOnce();
	});

	it('carries the immediate publication override for profile imports', () => {
		const browserWindow = new EventTarget();
		const listener = vi.fn();
		vi.stubGlobal('window', browserWindow);
		listenForHomeSnapshotDirty(listener);

		markHomeSnapshotDirty({ immediate: true });

		expect(listener).toHaveBeenCalledWith({ immediate: true });
	});

	it('is a no-op during server rendering', () => {
		vi.stubGlobal('window', undefined);
		expect(() => markHomeSnapshotDirty()).not.toThrow();
	});
});
