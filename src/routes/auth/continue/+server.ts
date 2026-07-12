import { getRuntimeEnv } from '$lib/server/env';
import { signInWithGoogleRedirect, verifyFirebaseIdToken } from '$lib/server/auth/firebase';
import {
	clearAdminSessionCookie,
	clearAuthSessionIdCookie,
	createAdminSession,
	AUTH_SESSION_ID_COOKIE_NAME,
	setAdminSessionCookie
} from '$lib/server/auth/session';
import { clientSideRedirect } from '$lib/server/http';
import { safeAuthReturnPath } from '$lib/authReturn';
import type { RequestHandler } from '@sveltejs/kit';

function authProblemUrl(url: URL, next: string, issue: string) {
	const problemUrl = new URL('/auth/relogin', url);
	problemUrl.searchParams.set('next', next);
	problemUrl.searchParams.set('issue', issue);
	return problemUrl;
}

export const GET: RequestHandler = async ({ url, cookies, platform }) => {
	const next = safeAuthReturnPath(url.searchParams.get('next'));
	const code = url.searchParams.get('code');
	if (!code) {
		return clientSideRedirect(authProblemUrl(url, next, 'auth_expired'));
	}

	const sessionId = cookies.get(AUTH_SESSION_ID_COOKIE_NAME);
	if (!sessionId) {
		return clientSideRedirect(authProblemUrl(url, next, 'auth_expired'));
	}

	let signIn: Awaited<ReturnType<typeof signInWithGoogleRedirect>>;
	let token: Awaited<ReturnType<typeof verifyFirebaseIdToken>>;
	let env: ReturnType<typeof getRuntimeEnv>;
	try {
		signIn = await signInWithGoogleRedirect({
			requestUri: url,
			sessionId,
			platformEnv: platform?.env
		});
		env = getRuntimeEnv(platform?.env);
		token = await verifyFirebaseIdToken(signIn.idToken, env);
	} catch (error) {
		console.error('[auth-continue] Google sign-in could not be completed.', error);
		clearAuthSessionIdCookie(cookies);
		clearAdminSessionCookie(cookies);
		return clientSideRedirect(authProblemUrl(url, next, 'auth_continue_failed'));
	}
	const email = (token.email ?? signIn.email ?? '').toLowerCase();
	if (!email) {
		clearAuthSessionIdCookie(cookies);
		clearAdminSessionCookie(cookies);
		return clientSideRedirect(new URL('/auth/denied', url));
	}

	const session = createAdminSession({
		uid: signIn.localId,
		email,
		name: token.name ?? signIn.displayName ?? null,
		photoUrl: token.picture ?? signIn.photoUrl ?? null,
		idToken: signIn.idToken,
		refreshToken: signIn.refreshToken,
		expiresInSeconds: signIn.expiresIn
	});

	clearAuthSessionIdCookie(cookies);
	try {
		await setAdminSessionCookie(cookies, session, env.authCookieSecret);
	} catch (error) {
		console.error('[auth-continue] Session cookie could not be created.', error);
		return clientSideRedirect(authProblemUrl(url, next, 'auth_continue_failed'));
	}
	return clientSideRedirect(new URL(next, url));
};
