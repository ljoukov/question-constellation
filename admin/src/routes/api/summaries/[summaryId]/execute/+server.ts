import { json, type RequestHandler } from '@sveltejs/kit';
import { queryRows } from '$lib/server/db';
import { generateSummaryJob } from '$lib/server/aiSummary';
import type {
	EnvironmentScope,
	IdentityScope,
	TrafficScope
} from '$lib/server/analyticsScope';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (locals.adminIdentity !== 'analytics-summary-workflow') {
		return json({ error: 'Forbidden' }, { status: 403 });
	}
	const summaryId = params.summaryId;
	if (!summaryId || !/^[a-zA-Z0-9-]{1,96}$/.test(summaryId)) {
		return json({ error: 'Not found' }, { status: 404 });
	}
	const summary = (
		await queryRows<{
			environment: string;
			window_days: number;
			traffic_scope: string;
			identity_scope: string;
			country_scope: string | null;
			path_scope: string | null;
		}>(
			locals.analyticsDb,
			`SELECT environment, window_days, traffic_scope, identity_scope, country_scope, path_scope
			FROM analytics_ai_summaries WHERE summary_id = ? LIMIT 1`,
			[summaryId]
		)
	)[0];
	if (!summary) return json({ error: 'Not found' }, { status: 404 });
	const environment = ['production', 'development'].includes(summary.environment)
		? (summary.environment as EnvironmentScope)
		: 'all';
	const normalizedTraffic = summary.traffic_scope === 'legacy_all' ? 'all' : summary.traffic_scope;
	const traffic = ['human', 'bots', 'internal_test', 'unknown', 'all'].includes(normalizedTraffic)
		? (normalizedTraffic as TrafficScope)
		: 'human';
	const identity = ['authenticated', 'anonymous', 'all'].includes(summary.identity_scope)
		? (summary.identity_scope as IdentityScope)
		: 'all';
	const started = await generateSummaryJob({
		db: locals.analyticsDb,
		summaryId,
		scope: {
			environment,
			days: summary.window_days,
			traffic,
			identity,
			country: summary.country_scope || '',
			path: summary.path_scope || ''
		}
	});
	return json({ ok: true, summaryId, started });
};
