const VIEWPORT_ZOOM_LOCK_OPTIONS: AddEventListenerOptions = {
	capture: true,
	passive: false
};

const DOUBLE_TAP_MAX_DELAY_MS = 320;
const DOUBLE_TAP_MAX_DISTANCE_PX = 44;

type TapPoint = {
	time: number;
	x: number;
	y: number;
};

function eventTime(event: Event) {
	return Number.isFinite(event.timeStamp) ? event.timeStamp : Date.now();
}

function distanceBetween(a: TapPoint, b: TapPoint) {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

export function installViewportZoomLock() {
	if (typeof document === 'undefined') return () => {};

	let lastTap: TapPoint | null = null;

	const preventGestureZoom = (event: Event) => {
		event.preventDefault();
	};

	const preventMultiTouchZoom = (event: TouchEvent) => {
		if (event.touches.length > 1) {
			event.preventDefault();
		}
	};

	const preventDoubleTapZoom = (event: TouchEvent) => {
		if (event.changedTouches.length !== 1) {
			lastTap = null;
			return;
		}

		const touch = event.changedTouches[0];
		const tap: TapPoint = {
			time: eventTime(event),
			x: touch.clientX,
			y: touch.clientY
		};

		if (
			lastTap &&
			tap.time - lastTap.time <= DOUBLE_TAP_MAX_DELAY_MS &&
			distanceBetween(tap, lastTap) <= DOUBLE_TAP_MAX_DISTANCE_PX
		) {
			event.preventDefault();
		}

		lastTap = tap;
	};

	const resetTap = () => {
		lastTap = null;
	};

	document.addEventListener('gesturestart', preventGestureZoom, VIEWPORT_ZOOM_LOCK_OPTIONS);
	document.addEventListener('gesturechange', preventGestureZoom, VIEWPORT_ZOOM_LOCK_OPTIONS);
	document.addEventListener('gestureend', preventGestureZoom, VIEWPORT_ZOOM_LOCK_OPTIONS);
	document.addEventListener('touchstart', preventMultiTouchZoom, VIEWPORT_ZOOM_LOCK_OPTIONS);
	document.addEventListener('touchmove', preventMultiTouchZoom, VIEWPORT_ZOOM_LOCK_OPTIONS);
	document.addEventListener('touchend', preventDoubleTapZoom, VIEWPORT_ZOOM_LOCK_OPTIONS);
	document.addEventListener('touchcancel', resetTap, VIEWPORT_ZOOM_LOCK_OPTIONS);

	return () => {
		document.removeEventListener('gesturestart', preventGestureZoom, VIEWPORT_ZOOM_LOCK_OPTIONS);
		document.removeEventListener('gesturechange', preventGestureZoom, VIEWPORT_ZOOM_LOCK_OPTIONS);
		document.removeEventListener('gestureend', preventGestureZoom, VIEWPORT_ZOOM_LOCK_OPTIONS);
		document.removeEventListener('touchstart', preventMultiTouchZoom, VIEWPORT_ZOOM_LOCK_OPTIONS);
		document.removeEventListener('touchmove', preventMultiTouchZoom, VIEWPORT_ZOOM_LOCK_OPTIONS);
		document.removeEventListener('touchend', preventDoubleTapZoom, VIEWPORT_ZOOM_LOCK_OPTIONS);
		document.removeEventListener('touchcancel', resetTap, VIEWPORT_ZOOM_LOCK_OPTIONS);
	};
}
