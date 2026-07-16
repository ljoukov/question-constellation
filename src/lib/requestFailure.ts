export type RequestFailureKind =
	| 'offline'
	| 'connection'
	| 'timeout'
	| 'interrupted'
	| 'server'
	| 'busy'
	| 'auth'
	| 'invalid'
	| 'unknown';

export type RequestFailure = {
	kind: RequestFailureKind;
	title: string;
	message: string;
	retryable: boolean;
	reference: string | null;
	status: number | null;
};

export type RequestFailureContext = {
	action?: string;
	serverLabel?: string;
	streamStarted?: boolean;
	timedOut?: boolean;
	online?: boolean;
};

type FailureDetails = {
	status?: number;
	reference?: string | null;
	code?: string | null;
	serverMessage?: string | null;
};

export class ResponseRequestError extends Error {
	status: number;
	reference: string | null;
	code: string | null;
	serverMessage: string | null;

	constructor(message: string, details: FailureDetails & { status: number }) {
		super(message);
		this.name = 'ResponseRequestError';
		this.status = details.status;
		this.reference = details.reference ?? null;
		this.code = details.code ?? null;
		this.serverMessage = details.serverMessage ?? null;
	}
}

export class ServerRequestError extends Error {
	reference: string | null;
	code: string | null;

	constructor(message: string, details: Omit<FailureDetails, 'status'> = {}) {
		super(message);
		this.name = 'ServerRequestError';
		this.reference = details.reference ?? null;
		this.code = details.code ?? null;
	}
}

export class InterruptedRequestError extends Error {
	constructor(message = 'The response ended before it was complete.') {
		super(message);
		this.name = 'InterruptedRequestError';
	}
}

export class RequestTimeoutError extends Error {
	constructor(message = 'The request timed out.') {
		super(message);
		this.name = 'RequestTimeoutError';
	}
}

function responseReference(response: Response) {
	return response.headers?.get?.('cf-ray') ?? response.headers?.get?.('x-request-id') ?? null;
}

async function responseErrorPayload(response: Response) {
	const contentType = response.headers?.get?.('content-type')?.toLowerCase() ?? '';
	try {
		if (contentType.includes('application/json')) {
			const readable = typeof response.clone === 'function' ? response.clone() : response;
			if (typeof readable.json !== 'function') return { code: null, message: null };
			const body = (await readable.json()) as Record<string, unknown>;
			return {
				code: typeof body.error === 'string' ? body.error : null,
				message:
					typeof body.message === 'string'
						? body.message
						: typeof body.error_description === 'string'
							? body.error_description
							: null
			};
		}
		const readable = typeof response.clone === 'function' ? response.clone() : response;
		if (typeof readable.text !== 'function') return { code: null, message: null };
		const text = (await readable.text()).trim();
		return { code: null, message: text.length <= 300 ? text : null };
	} catch {
		return { code: null, message: null };
	}
}

export async function requestErrorFromResponse(
	response: Response,
	fallbackMessage = `Request failed with ${response.status}`
) {
	const payload = await responseErrorPayload(response);
	return new ResponseRequestError(fallbackMessage, {
		status: response.status,
		reference: responseReference(response),
		code: payload.code,
		serverMessage: payload.message
	});
}

function isOffline(context: RequestFailureContext) {
	if (typeof context.online === 'boolean') return !context.online;
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function actionPhrase(context: RequestFailureContext) {
	return context.action?.trim() || 'finish this request';
}

function serverLabel(context: RequestFailureContext) {
	return context.serverLabel?.trim() || 'Question Constellation';
}

function inlineLabel(value: string) {
	if (/^(Question Constellation|Google\b)/.test(value)) return value;
	if (/^The\s+/.test(value)) return value.replace(/^The\s+/, 'the ');
	return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}

function displayLabel(value: string) {
	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function classifyRequestFailure(
	error: unknown,
	context: RequestFailureContext = {}
): RequestFailure {
	const action = actionPhrase(context);
	const service = serverLabel(context);
	const displayService = displayLabel(service);
	const inlineService = inlineLabel(service);
	const status = error instanceof ResponseRequestError ? error.status : null;
	const reference =
		error instanceof ResponseRequestError || error instanceof ServerRequestError
			? error.reference
			: null;

	if (
		isOffline(context) &&
		!(error instanceof ResponseRequestError) &&
		!(error instanceof ServerRequestError)
	) {
		return {
			kind: 'offline',
			title: "You're offline",
			message: `This browser has no internet connection, so it could not ${action}. Your work is still here. Reconnect, then retry.`,
			retryable: true,
			reference,
			status
		};
	}

	if (context.timedOut || error instanceof RequestTimeoutError) {
		return {
			kind: 'timeout',
			title: 'The connection timed out',
			message: `The browser did not receive a response in time. Your work is still here. Try to ${action} again when the connection is stable.`,
			retryable: true,
			reference,
			status
		};
	}

	if (error instanceof ResponseRequestError) {
		if (error.status === 401 || error.status === 403) {
			return {
				kind: 'auth',
				title: 'Sign in again',
				message: `Your session is no longer valid. Your work is still here; sign in, then try to ${action} again.`,
				retryable: true,
				reference,
				status
			};
		}
		if (error.status === 408 || error.status === 429 || error.status === 503) {
			return {
				kind: 'busy',
				title: `${displayService} is temporarily busy`,
				message: `The service responded but cannot ${action} just now. Your work is still here; wait a moment and retry.`,
				retryable: true,
				reference,
				status
			};
		}
		if (error.status >= 500) {
			return {
				kind: 'server',
				title: `${displayService} had a problem`,
				message: `The server received the request but could not ${action}. Your work is still here; retry in a moment.`,
				retryable: true,
				reference,
				status
			};
		}
		if (error.status === 404) {
			return {
				kind: 'invalid',
				title: `Couldn't ${action}`,
				message:
					'The server could not find the requested content. Retry once; if it remains unavailable, continue without it or choose another question.',
				retryable: true,
				reference,
				status
			};
		}
		return {
			kind: 'invalid',
			title: `Couldn't ${action}`,
			message: `The server rejected this request. Your work is still here; review it and retry.`,
			retryable: true,
			reference,
			status
		};
	}

	if (error instanceof ServerRequestError) {
		return {
			kind: 'server',
			title: `${displayService} had a problem`,
			message: `The server received the request but could not ${action}. Your work is still here; retry in a moment.`,
			retryable: true,
			reference,
			status
		};
	}

	if (error instanceof InterruptedRequestError || context.streamStarted) {
		return {
			kind: 'interrupted',
			title: 'Connection interrupted',
			message: `The browser connected, but the response stopped before ${inlineService} could ${action}. Your work is still here; retry the check.`,
			retryable: true,
			reference,
			status
		};
	}

	if (error instanceof TypeError) {
		return {
			kind: 'connection',
			title: `Couldn't reach ${inlineService}`,
			message: `The browser could not connect to the service to ${action}. Your work is still here. Check the connection, then retry.`,
			retryable: true,
			reference: null,
			status: null
		};
	}

	if (error instanceof DOMException && error.name === 'AbortError') {
		return {
			kind: 'timeout',
			title: 'The connection timed out',
			message: `The browser did not receive a response in time. Your work is still here. Try to ${action} again.`,
			retryable: true,
			reference: null,
			status: null
		};
	}

	return {
		kind: 'unknown',
		title: `Couldn't ${action}`,
		message: 'Something unexpected happened. Your work is still here; please retry.',
		retryable: true,
		reference,
		status
	};
}

export async function fetchWithResponseTimeout(
	input: RequestInfo | URL,
	init: RequestInit = {},
	timeoutMs = 12_000
) {
	const timeoutController = new AbortController();
	let timedOut = false;
	const signal = init.signal
		? AbortSignal.any([init.signal, timeoutController.signal])
		: timeoutController.signal;
	const timeout = setTimeout(() => {
		timedOut = true;
		timeoutController.abort();
	}, timeoutMs);
	try {
		return await fetch(input, { ...init, signal });
	} catch (error) {
		if (timedOut) throw new RequestTimeoutError();
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

export async function readStreamChunkWithTimeout<T>(
	reader: ReadableStreamDefaultReader<T>,
	timeoutMs = 45_000
) {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			reader.read(),
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => {
					void reader.cancel('Stream inactivity timeout.').catch(() => {});
					reject(new RequestTimeoutError('The response stopped making progress.'));
				}, timeoutMs);
			})
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

export async function diagnoseResourceLoadFailure(
	url: string,
	context: RequestFailureContext = {}
): Promise<RequestFailure> {
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		return classifyRequestFailure(new TypeError('Browser is offline.'), context);
	}
	try {
		const response = await fetchWithResponseTimeout(url, { cache: 'no-store' });
		if (!response.ok) {
			throw await requestErrorFromResponse(response, 'Resource request failed.');
		}
		return classifyRequestFailure(
			new InterruptedRequestError('The original resource request was interrupted.'),
			context
		);
	} catch (error) {
		return classifyRequestFailure(error, context);
	}
}
