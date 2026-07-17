import { json, type RequestHandler } from '@sveltejs/kit';
import { queryRows } from '$lib/server/db';

export const GET: RequestHandler = async ({ params, locals }) => {
	const summaryId = params.summaryId;
	if (!summaryId || !/^[a-zA-Z0-9-]{1,96}$/.test(summaryId))
		return json({ error: 'Not found' }, { status: 404 });
	const summary = (
		await queryRows<Record<string, unknown>>(
			locals.analyticsDb,
			`SELECT
				summary_id, status, environment, window_days, traffic_scope, identity_scope,
				country_scope, path_scope, created_at, started_at, completed_at, duration_ms,
				model, model_version, summary_markdown, usage_json, cost_usd, error_message
			FROM analytics_ai_summaries WHERE summary_id = ? LIMIT 1`,
			[summaryId]
		)
	)[0];
	return summary ? json(summary) : json({ error: 'Not found' }, { status: 404 });
};
