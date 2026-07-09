import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { clearQuestionBindings, setQuestionR2 } from '$lib/server/bindings';
import { readAdminAuthFromCookies } from '$lib/server/auth/session';

function shouldUseReadReplicaSession(event: Parameters<Handle>[0]['event']) {
	if (event.request.method !== 'GET' && event.request.method !== 'HEAD') return false;
	const pathname = event.url.pathname;
	if (pathname.startsWith('/api/')) return false;
	if (pathname.startsWith('/auth/')) return false;
	if (pathname.startsWith('/profile')) return false;
	if (pathname.startsWith('/gaps/')) return false;
	return true;
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.questionDb = null;
	event.locals.questionDbSessionMode = null;
	event.locals.personalDb = null;

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
	if (event.platform?.env.QUESTION_R2) {
		setQuestionR2(event.platform.env.QUESTION_R2);
	}

	try {
		const auth = await readAdminAuthFromCookies(event.cookies, event.platform?.env);
		if (auth.status === 'ok') {
			event.locals.user = auth.user;
		}
	} catch (error) {
		console.warn('Auth session could not be hydrated.', error);
	}

	return await resolve(event);
};
