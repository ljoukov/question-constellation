import type { ClientInit } from '@sveltejs/kit';
import { installViewportZoomLock } from '$lib/viewportZoom';

export const init: ClientInit = () => {
	installViewportZoomLock();
};
