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
import { error, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, cookies, platform }) => {
	const code = url.searchParams.get('code');
	if (!code) {
		throw error(400, 'Missing Google OAuth code.');
	}

	const sessionId = cookies.get(AUTH_SESSION_ID_COOKIE_NAME);
	if (!sessionId) {
		throw error(400, 'Missing Google auth session cookie.');
	}

	const signIn = await signInWithGoogleRedirect({
		requestUri: url,
		sessionId,
		platformEnv: platform?.env
	});
	const env = getRuntimeEnv(platform?.env);
	const token = await verifyFirebaseIdToken(signIn.idToken, env);
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
	await setAdminSessionCookie(cookies, session, env.authCookieSecret);
	return clientSideRedirect(new URL('/', url));
};
