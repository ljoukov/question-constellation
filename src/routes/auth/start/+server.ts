import { createGoogleAuthUri } from '$lib/server/auth/firebase';
import {
	clearAdminSessionCookie,
	clearDevAdminSessionCookie,
	setAuthSessionIdCookie
} from '$lib/server/auth/session';
import { clientSideRedirect } from '$lib/server/http';
import { safeAuthReturnPath } from '$lib/authReturn';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const LOCALHOST_ALIASES = new Set(['127.0.0.1', '0.0.0.0', '::1', '[::1]']);

function canonicalizeLocalStartUrl(url: URL): URL | null {
	if (!LOCALHOST_ALIASES.has(url.hostname)) {
		return null;
	}

	const canonicalUrl = new URL(url);
	canonicalUrl.hostname = 'localhost';
	return canonicalUrl;
}

export const GET: RequestHandler = async ({ url, cookies, platform }) => {
	const canonicalUrl = canonicalizeLocalStartUrl(url);
	if (canonicalUrl) {
		throw redirect(307, canonicalUrl.toString());
	}

	clearAdminSessionCookie(cookies);
	clearDevAdminSessionCookie(cookies);
	const continueUri = new URL('/auth/continue', url);
	const next = safeAuthReturnPath(url.searchParams.get('next'));
	continueUri.searchParams.set('next', next);
	try {
		const authUri = await createGoogleAuthUri({
			continueUri,
			platformEnv: platform?.env
		});
		setAuthSessionIdCookie(cookies, authUri.sessionId);
		return clientSideRedirect(new URL(authUri.authUri));
	} catch (error) {
		console.error('[auth-start] Google sign-in could not be started.', error);
		const problemUrl = new URL('/auth/relogin', url);
		problemUrl.searchParams.set('next', next);
		problemUrl.searchParams.set('issue', 'auth_start_failed');
		return clientSideRedirect(problemUrl);
	}
};
