import { describe, expect, it } from 'vitest';
import {
	classifyRequestFailure,
	InterruptedRequestError,
	requestErrorFromResponse,
	RequestTimeoutError,
	ServerRequestError
} from './requestFailure';

describe('request failure classification', () => {
	it('distinguishes an offline browser from a reachable server failure', async () => {
		const offline = classifyRequestFailure(new TypeError('Failed to fetch'), {
			action: 'check this answer',
			online: false
		});
		expect(offline.kind).toBe('offline');
		expect(offline.message).toContain('work is still here');

		const responseError = await requestErrorFromResponse(
			new Response(JSON.stringify({ error: 'grading_failed' }), {
				status: 500,
				headers: { 'content-type': 'application/json', 'cf-ray': 'abc123-SEA' }
			})
		);
		const server = classifyRequestFailure(responseError, {
			action: 'check this answer',
			serverLabel: 'The answer checker',
			online: true
		});
		expect(server).toMatchObject({
			kind: 'server',
			status: 500,
			reference: 'abc123-SEA'
		});
	});

	it('distinguishes a connection failure from an interrupted stream', () => {
		expect(
			classifyRequestFailure(new TypeError('Failed to fetch'), {
				action: 'check this answer',
				online: true
			}).kind
		).toBe('connection');
		expect(
			classifyRequestFailure(new InterruptedRequestError(), {
				action: 'finish checking this answer',
				online: true
			}).kind
		).toBe('interrupted');
		expect(
			classifyRequestFailure(new RequestTimeoutError(), {
				action: 'check this answer',
				streamStarted: true,
				online: true
			}).kind
		).toBe('timeout');
	});

	it('classifies streamed server errors, authentication, and throttling', async () => {
		expect(
			classifyRequestFailure(new ServerRequestError('model failed'), {
				serverLabel: 'The answer checker',
				online: true
			}).kind
		).toBe('server');

		const unauthorized = await requestErrorFromResponse(new Response('', { status: 401 }));
		expect(classifyRequestFailure(unauthorized, { online: true }).kind).toBe('auth');

		const throttled = await requestErrorFromResponse(new Response('', { status: 429 }));
		expect(classifyRequestFailure(throttled, { online: true }).kind).toBe('busy');
	});
});
