import { dev } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { clearQuestionBindings, setQuestionDb, setQuestionR2 } from '$lib/server/bindings';

export const handle: Handle = async ({ event, resolve }) => {
	if (dev) {
		clearQuestionBindings();
		return await resolve(event);
	}

	if (event.platform?.env.QUESTION_DB) {
		setQuestionDb(event.platform.env.QUESTION_DB);
	}
	if (event.platform?.env.QUESTION_R2) {
		setQuestionR2(event.platform.env.QUESTION_R2);
	}

	return await resolve(event);
};
