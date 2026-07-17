import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { redirect, type Handle } from '@sveltejs/kit';
import { isAllowedAdminUserId } from '$lib/server/auth/access';
import { clearAdminSessionCookie, readAdminAuthFromCookies } from '$lib/server/auth/session';
import { signAnalyticsWorkflow, signaturesMatch } from '$lib/server/workflowAuth';

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
	const workflowSecret = String(event.platform?.env.AUTH_COOKIE_SECRET || env.AUTH_COOKIE_SECRET || '');
	const providedWorkflowSignature =
		event.request.headers.get('x-analytics-workflow-signature') || '';
	const workflowAllowed = Boolean(
		workflowSummaryId &&
			workflowSecret.length >= 32 &&
			signaturesMatch(
				await signAnalyticsWorkflow(workflowSummaryId, workflowSecret),
				providedWorkflowSignature
			)
	);

	if (workflowAllowed) {
		event.locals.adminIdentity = 'analytics-summary-workflow';
		return applySecurityHeaders(await resolve(event));
	}

	if (isPublicPath(event.url.pathname)) {
		return applySecurityHeaders(await resolve(event));
	}

	if (dev && env.DEV_AUTH_USER_ID) {
		event.locals.adminUser = {
			uid: env.DEV_AUTH_USER_ID,
			email: env.DEV_AUTH_EMAIL || 'local-admin@example.test',
			name: env.DEV_AUTH_NAME || 'Local admin',
			photoUrl: null
		};
		event.locals.adminIdentity = event.locals.adminUser.email;
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
