export function disableViewportZoom() {
	if (typeof window === 'undefined') return () => {};

	const preventGesture = (event: Event) => {
		event.preventDefault();
	};
	const preventMultiTouchMove = (event: TouchEvent) => {
		if (event.touches.length > 1) {
			event.preventDefault();
		}
	};

	document.addEventListener('gesturestart', preventGesture, { passive: false });
	document.addEventListener('gesturechange', preventGesture, { passive: false });
	document.addEventListener('gestureend', preventGesture, { passive: false });
	document.addEventListener('touchmove', preventMultiTouchMove, { passive: false });

	return () => {
		document.removeEventListener('gesturestart', preventGesture);
		document.removeEventListener('gesturechange', preventGesture);
		document.removeEventListener('gestureend', preventGesture);
		document.removeEventListener('touchmove', preventMultiTouchMove);
	};
}
