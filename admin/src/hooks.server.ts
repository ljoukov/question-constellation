import { redirect, type Handle } from '@sveltejs/kit';
import { isAllowedAdminUserId } from '$lib/server/auth/access';
import { clearAdminSessionCookie, readAdminAuthFromCookies } from '$lib/server/auth/session';

function isPublicPath(pathname: string): boolean {
	return pathname === '/login' || pathname.startsWith('/auth/') || pathname.startsWith('/_app/');
}

function applySecurityHeaders(response: Response): Response {
	response.headers.set('Cache-Control', 'private, no-store');
	response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
	response.headers.set('Referrer-Policy', 'no-referrer');
	return response;
}

function authFailure(event: Parameters<Handle>[0]['event'], status = 401): Response {
	if (event.url.pathname.startsWith('/api/')) {
		return new Response(status === 403 ? 'Forbidden.' : 'Authentication required.', {
			status,
			headers: { 'Cache-Control': 'no-store' }
		});
	}
	throw redirect(status === 403 ? 303 : 307, status === 403 ? '/auth/denied' : '/login');
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.analyticsDb = event.platform?.env.ANALYTICS_DB?.withSession('first-primary') ?? null;
	event.locals.adminIdentity = null;
	event.locals.adminUser = null;

	const workflowSummaryId = event.url.pathname.match(
		/^\/api\/summaries\/([a-zA-Z0-9-]{1,96})\/execute$/
	)?.[1];
	const workflowAllowed = Boolean(
		workflowSummaryId && event.request.headers.get('x-analytics-workflow-id') === workflowSummaryId
	);

	if (workflowAllowed) {
		event.locals.adminIdentity = 'analytics-summary-workflow';
		return applySecurityHeaders(await resolve(event));
	}

	if (isPublicPath(event.url.pathname)) {
		return applySecurityHeaders(await resolve(event));
	}

	let auth: Awaited<ReturnType<typeof readAdminAuthFromCookies>>;
	try {
		auth = await readAdminAuthFromCookies(event.cookies, event.platform?.env);
	} catch (error) {
		console.error('Admin Firebase authentication is not configured.', error);
		return new Response('Admin authentication is not configured.', {
			status: 503,
			headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }
		});
	}

	if (auth.status !== 'ok') return authFailure(event);
	if (!isAllowedAdminUserId(auth.user.uid)) {
		clearAdminSessionCookie(event.cookies);
		return authFailure(event, 403);
	}

	event.locals.adminUser = auth.user;
	event.locals.adminIdentity = auth.user.email;
	return applySecurityHeaders(await resolve(event));
};
