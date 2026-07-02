const SCALABLE_VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover';
const LOCKED_VIEWPORT =
	'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

export function allowsViewportZoom(pathname: string) {
	return pathname === '/past-papers' || pathname.startsWith('/past-papers/');
}

export function applyViewportZoomPolicy(pathname: string) {
	if (typeof document === 'undefined') return;

	const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
	if (!viewportMeta) return;

	viewportMeta.content = allowsViewportZoom(pathname) ? SCALABLE_VIEWPORT : LOCKED_VIEWPORT;
}

export function disableViewportZoomUnless(getPathname: () => string) {
	if (typeof window === 'undefined') return () => {};

	const shouldPreventZoom = () => !allowsViewportZoom(getPathname());
	const preventGesture = (event: Event) => {
		if (shouldPreventZoom()) {
			event.preventDefault();
		}
	};
	const preventMultiTouchMove = (event: TouchEvent) => {
		if (shouldPreventZoom() && event.touches.length > 1) {
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
