import { afterEach, describe, expect, it, vi } from 'vitest';
import { installViewportZoomLock } from './viewportZoom';

type RegisteredListener = {
	listener: EventListenerOrEventListenerObject;
	options?: boolean | AddEventListenerOptions;
};

const previousDocument = globalThis.document;

function createMockDocument() {
	const listeners = new Map<string, RegisteredListener[]>();
	const addEventListener = vi.fn(
		(
			type: string,
			listener: EventListenerOrEventListenerObject,
			options?: boolean | AddEventListenerOptions
		) => {
			const registered = listeners.get(type) ?? [];
			registered.push({ listener, options });
			listeners.set(type, registered);
		}
	);
	const removeEventListener = vi.fn();

	Object.defineProperty(globalThis, 'document', {
		configurable: true,
		value: {
			addEventListener,
			removeEventListener
		}
	});

	const dispatch = (type: string, event: Event) => {
		for (const { listener } of listeners.get(type) ?? []) {
			if (typeof listener === 'function') {
				listener(event);
			} else {
				listener.handleEvent(event);
			}
		}
	};

	return { addEventListener, dispatch, listeners, removeEventListener };
}

function touchEvent({
	changedTouches = [],
	timeStamp = 0,
	touches = []
}: {
	changedTouches?: Array<Pick<Touch, 'clientX' | 'clientY'>>;
	timeStamp?: number;
	touches?: Array<Pick<Touch, 'clientX' | 'clientY'>>;
}) {
	return {
		changedTouches,
		preventDefault: vi.fn(),
		timeStamp,
		touches
	} as unknown as TouchEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

afterEach(() => {
	if (previousDocument) {
		Object.defineProperty(globalThis, 'document', {
			configurable: true,
			value: previousDocument
		});
	} else {
		Reflect.deleteProperty(globalThis, 'document');
	}
});

describe('installViewportZoomLock', () => {
	it('registers global capture-phase non-passive zoom guards', () => {
		const { listeners } = createMockDocument();

		installViewportZoomLock();

		for (const type of [
			'gesturestart',
			'gesturechange',
			'gestureend',
			'touchstart',
			'touchmove',
			'touchend',
			'touchcancel'
		]) {
			expect(listeners.get(type)?.[0]?.options).toMatchObject({ capture: true, passive: false });
		}
	});

	it('prevents Safari gesture zoom and multi-touch moves without blocking one-finger moves', () => {
		const { dispatch } = createMockDocument();

		installViewportZoomLock();

		const gesture = { preventDefault: vi.fn() } as unknown as Event & {
			preventDefault: ReturnType<typeof vi.fn>;
		};
		dispatch('gesturestart', gesture);
		expect(gesture.preventDefault).toHaveBeenCalledTimes(1);

		const oneFingerMove = touchEvent({ touches: [{ clientX: 10, clientY: 20 }] });
		dispatch('touchmove', oneFingerMove);
		expect(oneFingerMove.preventDefault).not.toHaveBeenCalled();

		const twoFingerMove = touchEvent({
			touches: [
				{ clientX: 10, clientY: 20 },
				{ clientX: 30, clientY: 40 }
			]
		});
		dispatch('touchmove', twoFingerMove);
		expect(twoFingerMove.preventDefault).toHaveBeenCalledTimes(1);
	});

	it('prevents rapid same-place double taps', () => {
		const { dispatch } = createMockDocument();

		installViewportZoomLock();

		const firstTap = touchEvent({
			changedTouches: [{ clientX: 100, clientY: 100 }],
			timeStamp: 1000
		});
		dispatch('touchend', firstTap);
		expect(firstTap.preventDefault).not.toHaveBeenCalled();

		const secondTap = touchEvent({
			changedTouches: [{ clientX: 108, clientY: 105 }],
			timeStamp: 1220
		});
		dispatch('touchend', secondTap);
		expect(secondTap.preventDefault).toHaveBeenCalledTimes(1);

		const farTap = touchEvent({
			changedTouches: [{ clientX: 220, clientY: 220 }],
			timeStamp: 1360
		});
		dispatch('touchend', farTap);
		expect(farTap.preventDefault).not.toHaveBeenCalled();
	});

	it('removes the installed global listeners on cleanup', () => {
		const { removeEventListener } = createMockDocument();

		const cleanup = installViewportZoomLock();
		cleanup();

		expect(removeEventListener).toHaveBeenCalledTimes(7);
		expect(removeEventListener).toHaveBeenCalledWith(
			'gesturestart',
			expect.any(Function),
			expect.objectContaining({ capture: true, passive: false })
		);
	});
});
