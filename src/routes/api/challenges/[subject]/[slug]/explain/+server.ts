import { normalizeChallengeSubject } from '$lib/challenges/routing';
import { getChallengeDetail } from '$lib/server/challengeCatalog';
import { generateChallengeExplanation } from '$lib/server/challengeExplanation';
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, platform, request }) => {
	const subject = normalizeChallengeSubject(params.subject ?? '');
	const slug = params.slug ?? '';
	if (!subject || !slug) return json({ error: 'challenge_not_found' }, { status: 404 });
	const detail = await getChallengeDetail(subject, slug);
	if (!detail) return json({ error: 'challenge_not_found' }, { status: 404 });
	const cache = platform?.caches
		? await platform.caches.open('question-constellation-challenge-explanations-v1')
		: undefined;
	const cacheUrl = new URL(request.url);
	cacheUrl.search = '';
	cacheUrl.searchParams.set('v', String(detail.challenge.version));
	const cacheRequest = new Request(cacheUrl, { method: 'GET' });
	const cached = await cache?.match(cacheRequest);
	if (cached) return cached;

	try {
		const explanation = await generateChallengeExplanation({
			challenge: detail.challenge,
			platformEnv: platform?.env,
			signal: request.signal
		});
		const response = json(explanation, {
			headers: {
				'cache-control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400'
			}
		});
		const cacheWrite = cache?.put(cacheRequest, response.clone());
		if (cacheWrite) {
			if (platform?.ctx) platform.ctx.waitUntil(cacheWrite);
			else await cacheWrite;
		}
		return response;
	} catch (error) {
		if (request.signal.aborted) {
			return json({ error: 'request_cancelled' }, { status: 499 });
		}
		console.error('[challenge-explanation] generation failed', {
			challengeId: detail.challenge.id,
			message: error instanceof Error ? error.message : String(error)
		});
		return json({ error: 'explanation_unavailable' }, { status: 503 });
	}
};
