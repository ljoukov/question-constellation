import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';

function timingSafeEqual(left: string, right: string): boolean {
	const leftBytes = new TextEncoder().encode(left);
	const rightBytes = new TextEncoder().encode(right);
	let mismatch = leftBytes.length ^ rightBytes.length;
	const length = Math.max(leftBytes.length, rightBytes.length);
	for (let index = 0; index < length; index += 1) {
		mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
	}
	return mismatch === 0;
}

function basicCredentials(request: Request): { username: string; password: string } | null {
	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Basic ')) return null;
	try {
		const decoded = atob(authorization.slice(6));
		const separator = decoded.indexOf(':');
		if (separator < 0) return null;
		return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
	} catch {
		return null;
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.analyticsDb = event.platform?.env.ANALYTICS_DB?.withSession('first-primary') ?? null;
	event.locals.adminIdentity = null;

	const password = String(event.platform?.env.ADMIN_PASSWORD || env.ADMIN_PASSWORD || '');
	const username = String(event.platform?.env.ADMIN_USERNAME || env.ADMIN_USERNAME || 'admin');
	const allowedEmails = String(
		event.platform?.env.ADMIN_ALLOWED_EMAILS || env.ADMIN_ALLOWED_EMAILS || ''
	)
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean);
	const accessEmail = event.request.headers
		.get('cf-access-authenticated-user-email')
		?.trim()
		.toLowerCase();
	const credentials = basicCredentials(event.request);
	const workflowSummaryId = event.url.pathname.match(
		/^\/api\/summaries\/([a-zA-Z0-9-]{1,96})\/execute$/
	)?.[1];
	const workflowAllowed = Boolean(
		workflowSummaryId && event.request.headers.get('x-analytics-workflow-id') === workflowSummaryId
	);
	const accessAllowed = Boolean(accessEmail && allowedEmails.includes(accessEmail));
	const basicAllowed = Boolean(
		password &&
		credentials &&
		timingSafeEqual(credentials.username, username) &&
		timingSafeEqual(credentials.password, password)
	);
	const localUnprotected = dev && !password && allowedEmails.length === 0;

	if (!accessAllowed && !basicAllowed && !localUnprotected && !workflowAllowed) {
		return new Response(
			password || allowedEmails.length
				? 'Authentication required.'
				: 'Admin authentication is not configured.',
			{
				status: password || allowedEmails.length ? 401 : 503,
				headers: {
					'WWW-Authenticate': 'Basic realm="Question Constellation Analytics", charset="UTF-8"',
					'Cache-Control': 'no-store'
				}
			}
		);
	}

	event.locals.adminIdentity = workflowAllowed
		? 'analytics-summary-workflow'
		: accessEmail || credentials?.username || 'local-development';
	const response = await resolve(event);
	response.headers.set('Cache-Control', 'private, no-store');
	response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
	response.headers.set('Referrer-Policy', 'no-referrer');
	return response;
};
