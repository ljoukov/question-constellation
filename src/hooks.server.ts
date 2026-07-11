import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import { clearQuestionBindings, setQuestionR2 } from '$lib/server/bindings';
import type { AdminUser } from '$lib/server/auth/session';

const AUTH_USER_COOKIE_NAME = 'questionConstellationAuth';
const DEV_AUTH_USER_COOKIE_NAME = 'questionConstellationDevAuth';

function shouldUseReadReplicaSession(event: Parameters<Handle>[0]['event']) {
	if (event.request.method !== 'GET' && event.request.method !== 'HEAD') return false;
	const pathname = event.url.pathname;
	if (pathname.startsWith('/api/')) return false;
	if (pathname.startsWith('/auth/')) return false;
	if (pathname.startsWith('/profile')) return false;
	if (pathname.startsWith('/gaps/')) return false;
	return true;
}

function devAuthUserFromEnv(): AdminUser | null {
	if (!dev) return null;
	const uid = env.DEV_AUTH_USER_ID?.trim();
	if (!uid) return null;
	const email =
		env.DEV_AUTH_EMAIL?.trim().toLowerCase() ||
		`${uid.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')}@example.test`;
	const name = env.DEV_AUTH_NAME?.trim() || 'Local learner';
	const photoUrl = env.DEV_AUTH_PHOTO_URL?.trim() || null;
	return { uid, email, name, photoUrl };
}

function hasReadableAuthCookie(event: Parameters<Handle>[0]['event']): boolean {
	if (event.cookies.get(AUTH_USER_COOKIE_NAME)) return true;
	return dev && Boolean(event.cookies.get(DEV_AUTH_USER_COOKIE_NAME));
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.questionDb = null;
	event.locals.questionDbSessionMode = null;
	event.locals.personalDb = null;
	event.locals.analyticsDb = null;

	if (dev) {
		clearQuestionBindings();
	} else if (event.platform?.env.QUESTION_DB) {
		const useReadReplica = shouldUseReadReplicaSession(event);
		event.locals.questionDb = event.platform.env.QUESTION_DB.withSession(
			useReadReplica ? 'first-unconstrained' : 'first-primary'
		);
		event.locals.questionDbSessionMode = useReadReplica ? 'read-replica' : 'primary';
	}
	if (!dev && event.platform?.env.PERSONAL_DB) {
		event.locals.personalDb = event.platform.env.PERSONAL_DB.withSession('first-primary');
	}
	if (!dev && event.platform?.env.ANALYTICS_DB) {
		event.locals.analyticsDb = event.platform.env.ANALYTICS_DB.withSession('first-primary');
	}
	if (event.platform?.env.QUESTION_R2) {
		setQuestionR2(event.platform.env.QUESTION_R2);
	}

	const devAuthUser = devAuthUserFromEnv();
	if (devAuthUser) {
		event.locals.user = devAuthUser;
	} else if (hasReadableAuthCookie(event)) {
		try {
			const { readAdminAuthFromCookies } = await import('$lib/server/auth/session');
			const auth = await readAdminAuthFromCookies(event.cookies, event.platform?.env);
			if (auth.status === 'ok') {
				event.locals.user = auth.user;
			}
		} catch (error) {
			console.warn('Auth session could not be hydrated.', error);
		}
	}

	return await resolve(event);
};
