import { createGoogleAuthUri } from '$lib/server/auth/firebase';
import { clearAdminSessionCookie, setAuthSessionIdCookie } from '$lib/server/auth/session';
import { clientSideRedirect } from '$lib/server/auth/http';
import { redirect, type RequestHandler } from '@sveltejs/kit';

const LOCALHOST_ALIASES = new Set(['127.0.0.1', '0.0.0.0', '::1', '[::1]']);

export const GET: RequestHandler = async ({ url, cookies, platform }) => {
	if (LOCALHOST_ALIASES.has(url.hostname)) {
		const canonicalUrl = new URL(url);
		canonicalUrl.hostname = 'localhost';
		throw redirect(307, canonicalUrl.toString());
	}
	clearAdminSessionCookie(cookies);
	const authUri = await createGoogleAuthUri({
		continueUri: new URL('/auth/continue', url),
		platformEnv: platform?.env
	});
	setAuthSessionIdCookie(cookies, authUri.sessionId);
	return clientSideRedirect(new URL(authUri.authUri));
};
