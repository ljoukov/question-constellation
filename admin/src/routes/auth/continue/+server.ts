import { isAllowedAdminUserId } from '$lib/server/auth/access';
import { getAuthRuntimeEnv } from '$lib/server/auth/env';
import { signInWithGoogleRedirect, verifyFirebaseIdToken } from '$lib/server/auth/firebase';
import { clientSideRedirect } from '$lib/server/auth/http';
import {
	AUTH_SESSION_ID_COOKIE_NAME,
	clearAdminSessionCookie,
	clearAuthSessionIdCookie,
	createAdminSession,
	setAdminSessionCookie
} from '$lib/server/auth/session';
import { error, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, cookies, platform }) => {
	if (!url.searchParams.get('code')) throw error(400, 'Missing Google OAuth code.');
	const sessionId = cookies.get(AUTH_SESSION_ID_COOKIE_NAME);
	if (!sessionId) throw error(400, 'Missing Google auth session cookie.');

	const signIn = await signInWithGoogleRedirect({
		requestUri: url,
		sessionId,
		platformEnv: platform?.env
	});
	const authEnv = getAuthRuntimeEnv(platform?.env);
	const token = await verifyFirebaseIdToken(signIn.idToken, authEnv);
	clearAuthSessionIdCookie(cookies);

	if (!isAllowedAdminUserId(token.user_id) || token.user_id !== signIn.localId) {
		clearAdminSessionCookie(cookies);
		return clientSideRedirect(new URL('/auth/denied', url));
	}
	const email = (token.email ?? signIn.email ?? '').toLowerCase();
	if (!email) {
		clearAdminSessionCookie(cookies);
		return clientSideRedirect(new URL('/auth/denied', url));
	}

	await setAdminSessionCookie(
		cookies,
		createAdminSession({
			uid: signIn.localId,
			email,
			name: token.name ?? signIn.displayName ?? null,
			photoUrl: token.picture ?? signIn.photoUrl ?? null,
			idToken: signIn.idToken,
			refreshToken: signIn.refreshToken,
			expiresInSeconds: signIn.expiresIn
		}),
		authEnv.authCookieSecret
	);
	return clientSideRedirect(new URL('/', url));
};
