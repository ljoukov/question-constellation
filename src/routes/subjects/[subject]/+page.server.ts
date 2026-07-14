import { learnerSubjectFromSlug } from '$lib/learning/subjects';
import { getSignedInSubjectView } from '$lib/server/subjectLearning';
import { refreshSubjectRecommendationWithModel } from '$lib/server/recommendationLlm';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url, platform }) => {
	if (!locals.user) {
		throw redirect(303, `/auth/start?next=${encodeURIComponent(url.pathname)}`);
	}
	const subjectName = learnerSubjectFromSlug(params.subject);
	if (!subjectName) throw error(404, 'Subject not found.');
	const subject = await getSignedInSubjectView(locals.user, subjectName);
	if (!subject) throw error(404, 'This subject is not enabled in your profile.');
	if (
		subject.scope.status !== 'not_set' &&
		subject.alternatives.filter((action) => action.available).length >= 2 &&
		platform?.ctx &&
		typeof platform.env.CHATGPT_CODEX_PROXY_URL === 'string' &&
		typeof platform.env.CHATGPT_CODEX_PROXY_API_KEY === 'string'
	) {
		platform.ctx.waitUntil(
			refreshSubjectRecommendationWithModel({
				user: locals.user,
				subject: subject.subject,
				platformEnv: platform.env
			})
		);
	}
	return { subject, user: locals.user };
};
