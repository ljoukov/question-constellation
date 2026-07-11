import { json, type RequestHandler } from '@sveltejs/kit';
import { queryRows } from '$lib/server/db';

export const GET: RequestHandler = async ({ params, locals }) => {
	const summaryId = params.summaryId;
	if (!summaryId || !/^[a-zA-Z0-9-]{1,96}$/.test(summaryId))
		return json({ error: 'Not found' }, { status: 404 });
	const summary = (
		await queryRows<Record<string, unknown>>(
			locals.analyticsDb,
			'SELECT * FROM analytics_ai_summaries WHERE summary_id = ? LIMIT 1',
			[summaryId]
		)
	)[0];
	return summary ? json(summary) : json({ error: 'Not found' }, { status: 404 });
};
