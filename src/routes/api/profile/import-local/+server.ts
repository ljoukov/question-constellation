import { parseAnonymousLearnerProfile } from '$lib/anonymousLearnerProfile';
import {
	getLearnerProfileSettings,
	updateEnglishLiteratureSelections,
	updateLearnerSubjects
} from '$lib/server/personalLearning';
import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });
	const body = (await request.json().catch(() => null)) as { profile?: unknown } | null;
	const profile = parseAnonymousLearnerProfile(body?.profile);
	if (!profile) return json({ error: 'invalid_profile' }, { status: 400 });

	await getLearnerProfileSettings(locals.user);
	await Promise.all([
		updateLearnerSubjects({ userId: locals.user.uid, subjects: profile.subjects }),
		updateEnglishLiteratureSelections({
			userId: locals.user.uid,
			selections: profile.englishLiteratureSelections
		})
	]);
	return json({ status: 'ok', importedAt: new Date().toISOString() });
};
