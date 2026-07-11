import { clientSideRedirect } from '$lib/server/auth/http';
import { clearAdminSessionCookie, clearAuthSessionIdCookie } from '$lib/server/auth/session';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, cookies }) => {
	clearAuthSessionIdCookie(cookies);
	clearAdminSessionCookie(cookies);
	return clientSideRedirect(new URL('/login', url));
};
