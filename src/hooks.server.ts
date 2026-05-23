import { dev } from '$app/environment';
import { readAdminAuthFromCookies, type AdminAuthResult } from '$lib/server/auth/session';
import type { Handle } from '@sveltejs/kit';

const PUBLIC_PATHS = new Set(['/robots.txt']);

function isPublicPath(pathname: string): boolean {
	return (
		pathname.startsWith('/auth/') ||
		pathname.startsWith('/_app/') ||
		pathname.startsWith('/favicon') ||
		PUBLIC_PATHS.has(pathname)
	);
}

function redirectToAuthStart(eventUrl: URL): Response {
	const loginUrl = new URL(dev ? '/auth/relogin' : '/auth/start', eventUrl);
	loginUrl.searchParams.set('next', `${eventUrl.pathname}${eventUrl.search}`);
	return Response.redirect(loginUrl, 307);
}

function forbiddenResponse(result: Extract<AdminAuthResult, { status: 'forbidden' }>): Response {
	return new Response(`Not authorized for ${result.user.email}`, {
		status: 403,
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	if (isPublicPath(event.url.pathname)) {
		return await resolve(event);
	}

	const authResult = await readAdminAuthFromCookies(event.cookies, event.platform?.env);
	if (authResult.status === 'signed_out') {
		return redirectToAuthStart(event.url);
	}
	if (authResult.status === 'forbidden') {
		return forbiddenResponse(authResult);
	}

	event.locals.user = authResult.user;
	return await resolve(event);
};
