import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { clearQuestionBindings, setQuestionDb, setQuestionR2 } from '$lib/server/bindings';
import { readAdminAuthFromCookies } from '$lib/server/auth/session';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	if (dev) {
		clearQuestionBindings();
	} else if (event.platform?.env.QUESTION_DB) {
		setQuestionDb(event.platform.env.QUESTION_DB);
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
