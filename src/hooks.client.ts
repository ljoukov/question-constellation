import {
	classifyRequestFailure,
	ResponseRequestError,
	type RequestFailure
} from '$lib/requestFailure';
import { installViewportZoomLock } from '$lib/viewportZoom';
import type { ClientInit, HandleClientError } from '@sveltejs/kit';

export const init: ClientInit = () => {
	installViewportZoomLock();
};

export const handleError: HandleClientError = ({ error, status, message }) => {
	if (status === 404) return { message: 'Page not found.' };
	console.error('[page-navigation] client navigation failed', error);
	let failure: RequestFailure;
	if (
		error instanceof TypeError ||
		(error instanceof DOMException && error.name === 'AbortError')
	) {
		failure = classifyRequestFailure(error, {
			action: 'load this page',
			serverLabel: 'Question Constellation'
		});
	} else {
		failure = classifyRequestFailure(
			new ResponseRequestError(message || 'Page request failed.', {
				status: status >= 400 ? status : 500
			}),
			{
				action: 'load this page',
				serverLabel: 'Question Constellation'
			}
		);
	}
	return { message: failure.message, failure };
};
