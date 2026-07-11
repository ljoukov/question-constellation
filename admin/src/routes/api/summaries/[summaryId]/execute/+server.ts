import { json, type RequestHandler } from '@sveltejs/kit';
import { queryRows } from '$lib/server/db';
import { generateSummaryJob } from '$lib/server/aiSummary';

export const POST: RequestHandler = async ({ params, locals }) => {
	const summaryId = params.summaryId;
	if (!summaryId || !/^[a-zA-Z0-9-]{1,96}$/.test(summaryId)) {
		return json({ error: 'Not found' }, { status: 404 });
	}
	const summary = (
		await queryRows<{ environment: string; window_days: number }>(
			locals.analyticsDb,
			'SELECT environment, window_days FROM analytics_ai_summaries WHERE summary_id = ? LIMIT 1',
			[summaryId]
		)
	)[0];
	if (!summary) return json({ error: 'Not found' }, { status: 404 });
	const environment = ['production', 'development'].includes(summary.environment)
		? (summary.environment as 'production' | 'development')
		: 'all';
	await generateSummaryJob({
		db: locals.analyticsDb,
		summaryId,
		environment,
		days: summary.window_days
	});
	return json({ ok: true, summaryId });
};
