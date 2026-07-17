import { json, type RequestHandler } from '@sveltejs/kit';
import { executeQuery, queryRows } from '$lib/server/db';

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
	const sessionRows =
		scope === 'session'
			? await queryRows<{ session_id: string }>(
					db,
					'SELECT session_id FROM analytics_sessions WHERE session_id = ?',
					[identifier]
				)
			: scope === 'anonymous'
				? await queryRows<{ session_id: string }>(
						db,
						'SELECT session_id FROM analytics_sessions WHERE anonymous_id = ?',
						[identifier]
					)
				: await queryRows<{ session_id: string }>(
						db,
						`SELECT session_id FROM analytics_sessions
						WHERE user_id = ? OR user_email = ?`,
						[identifier, identifier]
					);
	const sessionIds = sessionRows.map((row) => row.session_id).filter(Boolean);
	const actorKeys =
		scope === 'user'
			? await queryRows<{ actor_key: string }>(
					db,
					`SELECT DISTINCT 'user:' || user_id AS actor_key
					FROM analytics_sessions
					WHERE user_id IS NOT NULL AND (user_id = ? OR user_email = ?)`,
					[identifier, identifier]
				)
			: scope === 'anonymous'
				? [{ actor_key: `anon:${identifier}` }]
				: [];
	if (scope === 'user' && /^[a-zA-Z0-9_-]{1,128}$/.test(identifier)) {
		actorKeys.push({ actor_key: `user:${identifier}` });
	}
	const summaryIdentifiers = [...new Set([identifier, ...sessionIds])];
	for (let offset = 0; offset < summaryIdentifiers.length; offset += 20) {
		const chunk = summaryIdentifiers.slice(offset, offset + 20);
		const predicate = chunk
			.map(
				() =>
					`(instr(COALESCE(source_snapshot_json, ''), ?) > 0
						OR instr(COALESCE(prompt_text, ''), ?) > 0
						OR instr(COALESCE(summary_markdown, ''), ?) > 0
						OR instr(COALESCE(reasoning_text, ''), ?) > 0)`
			)
			.join(' OR ');
		await executeQuery(
			db,
			`DELETE FROM analytics_ai_summaries WHERE ${predicate}`,
			chunk.flatMap((value) => [value, value, value, value])
		);
	}

	for (let offset = 0; offset < sessionIds.length; offset += 80) {
		const chunk = sessionIds.slice(offset, offset + 80);
		const placeholders = chunk.map(() => '?').join(', ');
		await executeQuery(
			db,
			`DELETE FROM analytics_requests WHERE session_id IN (${placeholders})`,
			chunk
		);
		await executeQuery(
			db,
			`DELETE FROM analytics_events WHERE session_id IN (${placeholders})`,
			chunk
		);
		await executeQuery(
			db,
			`DELETE FROM analytics_model_runs WHERE session_id IN (${placeholders})`,
			chunk
		);
	}

	if (scope === 'session') {
		await executeQuery(db, 'DELETE FROM analytics_requests WHERE session_id = ?', [identifier]);
		await executeQuery(db, 'DELETE FROM analytics_events WHERE session_id = ?', [identifier]);
		await executeQuery(db, 'DELETE FROM analytics_model_runs WHERE session_id = ?', [identifier]);
		await executeQuery(db, 'DELETE FROM analytics_sessions WHERE session_id = ?', [identifier]);
	} else if (scope === 'anonymous') {
		await executeQuery(db, 'DELETE FROM analytics_events WHERE anonymous_id = ?', [identifier]);
		await executeQuery(db, 'DELETE FROM analytics_model_runs WHERE anonymous_id = ?', [identifier]);
		await executeQuery(db, 'DELETE FROM analytics_sessions WHERE anonymous_id = ?', [identifier]);
	} else {
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
	for (const actor of actorKeys) {
		await executeQuery(db, 'DELETE FROM analytics_actor_labels WHERE actor_key = ?', [
			actor.actor_key
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
