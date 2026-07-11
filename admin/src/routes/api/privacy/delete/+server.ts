import { json, type RequestHandler } from '@sveltejs/kit';
import { executeQuery } from '$lib/server/db';

type DeleteScope = 'session' | 'user' | 'anonymous';

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => null)) as {
		scope?: DeleteScope;
		identifier?: string;
		confirm?: string;
	} | null;
	const scope = body?.scope;
	const identifier = body?.identifier?.trim().slice(0, 512);
	if (!scope || !['session', 'user', 'anonymous'].includes(scope) || !identifier) {
		return json({ error: 'A valid scope and identifier are required.' }, { status: 400 });
	}
	if (body?.confirm !== `delete ${scope} ${identifier}`) {
		return json({ error: 'The exact deletion confirmation did not match.' }, { status: 400 });
	}

	const db = locals.analyticsDb;
	await executeQuery(
		db,
		'DELETE FROM analytics_ai_summaries WHERE instr(source_snapshot_json, ?) > 0 OR instr(prompt_text, ?) > 0',
		[identifier, identifier]
	);

	if (scope === 'session') {
		await executeQuery(db, 'DELETE FROM analytics_events WHERE session_id = ?', [identifier]);
		await executeQuery(db, 'DELETE FROM analytics_requests WHERE session_id = ?', [identifier]);
		await executeQuery(db, 'DELETE FROM analytics_model_runs WHERE session_id = ?', [identifier]);
		await executeQuery(db, 'DELETE FROM analytics_sessions WHERE session_id = ?', [identifier]);
	} else if (scope === 'anonymous') {
		await executeQuery(
			db,
			'DELETE FROM analytics_requests WHERE session_id IN (SELECT session_id FROM analytics_sessions WHERE anonymous_id = ?)',
			[identifier]
		);
		await executeQuery(db, 'DELETE FROM analytics_events WHERE anonymous_id = ?', [identifier]);
		await executeQuery(db, 'DELETE FROM analytics_model_runs WHERE anonymous_id = ?', [identifier]);
		await executeQuery(db, 'DELETE FROM analytics_sessions WHERE anonymous_id = ?', [identifier]);
	} else {
		await executeQuery(
			db,
			'DELETE FROM analytics_requests WHERE session_id IN (SELECT session_id FROM analytics_sessions WHERE user_id = ? OR user_email = ?)',
			[identifier, identifier]
		);
		await executeQuery(db, 'DELETE FROM analytics_events WHERE user_id = ? OR user_email = ?', [
			identifier,
			identifier
		]);
		await executeQuery(
			db,
			'DELETE FROM analytics_model_runs WHERE user_id = ? OR user_email = ?',
			[identifier, identifier]
		);
		await executeQuery(db, 'DELETE FROM analytics_sessions WHERE user_id = ? OR user_email = ?', [
			identifier,
			identifier
		]);
	}

	await executeQuery(
		db,
		`INSERT INTO analytics_admin_audit (
			audit_id, action, scope, target_hash, requested_by, created_at, metadata_json
		) VALUES (?, 'delete', ?, ?, ?, ?, ?)`,
		[
			crypto.randomUUID(),
			scope,
			await sha256(identifier),
			locals.adminIdentity,
			new Date().toISOString(),
			JSON.stringify({ source: 'admin-api' })
		]
	);

	return json({ ok: true, scope });
};
