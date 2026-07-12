import {
	clearAdminSessionCookie,
	clearAuthReturnPathCookie,
	clearAuthSessionIdCookie,
	clearDevAdminSessionCookie
} from '$lib/server/auth/session';
import { clientSideRedirect } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	clearAuthSessionIdCookie(cookies);
	clearAuthReturnPathCookie(cookies);
	clearAdminSessionCookie(cookies);
	clearDevAdminSessionCookie(cookies);
	return clientSideRedirect(new URL('/', url));
};
