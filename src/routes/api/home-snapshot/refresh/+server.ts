import { refreshUserHomeSnapshot } from '$lib/server/homeSnapshot';
import { json, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const result = await refreshUserHomeSnapshot(locals.user);
	const status = result.status === 'busy' ? 202 : result.status === 'failed' ? 503 : 200;

	return json(
		{ status: result.status },
		{
			status,
			headers: { 'cache-control': 'no-store' }
		}
	);
};
