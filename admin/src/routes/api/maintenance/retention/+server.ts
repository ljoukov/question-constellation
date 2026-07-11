import { json, type RequestHandler } from '@sveltejs/kit';
import { executeQuery } from '$lib/server/db';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => null)) as {
		retentionDays?: number;
		summaryRetentionDays?: number;
		confirm?: string;
	} | null;
	if (body?.confirm !== 'prune expired analytics') {
		return json({ error: 'Explicit retention confirmation is required.' }, { status: 400 });
	}
	const retentionDays = Number.isInteger(body.retentionDays)
		? Math.min(3650, Math.max(7, body.retentionDays ?? 90))
		: 90;
	const summaryRetentionDays = Number.isInteger(body.summaryRetentionDays)
		? Math.min(retentionDays, Math.max(7, body.summaryRetentionDays ?? 30))
		: 30;
	const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
	const summaryCutoff = new Date(Date.now() - summaryRetentionDays * 86_400_000).toISOString();
	const db = locals.analyticsDb;

	await executeQuery(db, 'DELETE FROM analytics_ai_summaries WHERE created_at < ?', [summaryCutoff]);
	await executeQuery(db, 'DELETE FROM analytics_model_runs WHERE started_at < ?', [cutoff]);
	await executeQuery(db, 'DELETE FROM analytics_events WHERE received_at < ?', [cutoff]);
	await executeQuery(db, 'DELETE FROM analytics_requests WHERE received_at < ?', [cutoff]);
	await executeQuery(db, 'DELETE FROM analytics_sessions WHERE last_seen_at < ?', [cutoff]);
	await executeQuery(
		db,
		`INSERT INTO analytics_admin_audit (
			audit_id, action, scope, requested_by, created_at, metadata_json
		) VALUES (?, 'retention-prune', 'database', ?, ?, ?)`,
		[
			crypto.randomUUID(),
			locals.adminIdentity,
			new Date().toISOString(),
			JSON.stringify({ retentionDays, summaryRetentionDays, cutoff, summaryCutoff })
		]
	);

	return json({ ok: true, retentionDays, summaryRetentionDays, cutoff, summaryCutoff });
};
