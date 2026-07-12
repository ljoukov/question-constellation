import { dev } from '$app/environment';
import {
	clearAdminSessionCookie,
	clearAuthReturnPathCookie,
	clearAuthSessionIdCookie,
	clearDevAdminSessionCookie,
	setDevAdminSessionCookie
} from '$lib/server/auth/session';
import { getRuntimeEnv } from '$lib/server/env';
import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { safeAuthReturnPath } from '$lib/authReturn';
import {
	classifyRequestFailure,
	ResponseRequestError,
	ServerRequestError
} from '$lib/requestFailure';

function safeNext(value: FormDataEntryValue | string | null): string {
	return safeAuthReturnPath(typeof value === 'string' ? value : null);
}

export const load: PageServerLoad = async ({ cookies, url }) => {
	clearAuthSessionIdCookie(cookies);
	clearAuthReturnPathCookie(cookies);
	clearAdminSessionCookie(cookies);
	clearDevAdminSessionCookie(cookies);

	const issue = url.searchParams.get('issue');
	const authFailure =
		issue === 'auth_expired'
			? classifyRequestFailure(
					new ResponseRequestError('The sign-in attempt expired.', { status: 401 }),
					{
						action: 'complete sign-in',
						serverLabel: 'Google sign-in',
						online: true
					}
				)
			: issue === 'auth_start_failed' || issue === 'auth_continue_failed'
				? classifyRequestFailure(new ServerRequestError('Google sign-in failed.'), {
						action: issue === 'auth_start_failed' ? 'start sign-in' : 'complete sign-in',
						serverLabel: 'Google sign-in',
						online: true
					})
				: null;

	return {
		devLoginEnabled: dev,
		defaultEmail: 'learner@example.com',
		next: safeNext(url.searchParams.get('next')),
		authFailure
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, platform, url }) => {
		if (!dev) {
			throw error(404, 'Not found');
		}

		const data = await request.formData();
		const email = String(data.get('email') ?? '')
			.trim()
			.toLowerCase();
		const next = safeNext(data.get('next') ?? url.searchParams.get('next'));

		if (!z.string().email().safeParse(email).success) {
			return fail(400, {
				email,
				next,
				message: 'Enter a valid email address.'
			});
		}

		const env = getRuntimeEnv(platform?.env);
		clearAuthSessionIdCookie(cookies);
		clearAuthReturnPathCookie(cookies);
		clearAdminSessionCookie(cookies);
		await setDevAdminSessionCookie(cookies, email, env.authCookieSecret);
		throw redirect(303, next);
	}
};
