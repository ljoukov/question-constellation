import { env } from '$env/dynamic/private';
import { configureChatGptCodexProxy, streamText } from '@ljoukov/llm';
import { executeQuery, queryRows } from './db';

const SUMMARY_MODEL = 'chatgpt-gpt-5.6-sol';
const THINKING_LEVEL = 'medium';

type Db = App.Locals['analyticsDb'];

function compactRows(rows: Array<Record<string, unknown>>, maximum: number) {
	return rows
		.slice(0, maximum)
		.map((row) =>
			Object.fromEntries(
				Object.entries(row).map(([key, value]) => [
					key,
					typeof value === 'string' && value.length > 1_500 ? `${value.slice(0, 1_500)}…` : value
				])
			)
		);
}

function configureModel() {
	const url = env.CHATGPT_CODEX_PROXY_URL;
	const apiKey = env.CHATGPT_CODEX_PROXY_API_KEY;
	if (!url || !apiKey) throw new Error('ChatGPT Codex proxy credentials are not configured.');
	configureChatGptCodexProxy({ url, apiKey });
	process.env.CHATGPT_CODEX_PROXY_URL = url;
	process.env.CHATGPT_CODEX_PROXY_API_KEY = apiKey;
	process.env.CHATGPT_RESPONSES_WEBSOCKET_MODE = 'off';
}

export async function createSummaryJob(args: {
	db: Db;
	environment: 'all' | 'production' | 'development';
	days: number;
	requestedBy: string | null;
}) {
	const summaryId = crypto.randomUUID();
	await executeQuery(
		args.db,
		`INSERT INTO analytics_ai_summaries (
			summary_id, status, environment, window_days, requested_by, created_at, model, thinking_level
		) VALUES (?, 'queued', ?, ?, ?, ?, ?, ?)`,
		[
			summaryId,
			args.environment,
			args.days,
			args.requestedBy,
			new Date().toISOString(),
			SUMMARY_MODEL,
			THINKING_LEVEL
		]
	);
	return summaryId;
}

export async function generateSummaryJob(args: {
	db: Db;
	summaryId: string;
	environment: 'all' | 'production' | 'development';
	days: number;
}) {
	const startedAt = new Date();
	const startedAtMs = Date.now();
	await executeQuery(
		args.db,
		"UPDATE analytics_ai_summaries SET status = 'running', started_at = ? WHERE summary_id = ?",
		[startedAt.toISOString(), args.summaryId]
	);

	try {
		const since = new Date(Date.now() - args.days * 86_400_000).toISOString();
		const environmentSql = args.environment === 'all' ? '' : ' AND environment = ?';
		const params = args.environment === 'all' ? [since] : [since, args.environment];
		const [sessions, events, modelRuns, topPages, eventCounts] = await Promise.all([
			queryRows<Record<string, unknown>>(
				args.db,
				`SELECT session_id, anonymous_id, user_id, user_email, started_at, last_seen_at,
				initial_path, initial_referrer, country, region, city, browser_name, operating_system,
				device_type, connection_effective_type, connection_downlink_mbps, connection_rtt_ms,
				event_count, page_view_count, engaged_ms, environment
				FROM analytics_sessions WHERE last_seen_at >= ?${environmentSql}
				ORDER BY last_seen_at DESC LIMIT 80`,
				params
			),
			queryRows<Record<string, unknown>>(
				args.db,
				`SELECT session_id, user_email, event_type, occurred_at, path, duration_ms, engaged_ms,
				scroll_depth_percent, element_text, element_href, input_name, input_value, previous_value,
				is_redacted, properties_json, environment
				FROM analytics_events WHERE received_at >= ?${environmentSql}
				ORDER BY client_timestamp_ms DESC LIMIT 300`,
				params
			),
			queryRows<Record<string, unknown>>(
				args.db,
				`SELECT run_id, session_id, user_email, feature, path, model, model_version, thinking_level,
				status, started_at, duration_ms, output_text, reasoning_text, usage_json, cost_usd, error_message,
				environment FROM analytics_model_runs WHERE started_at >= ?${environmentSql}
				ORDER BY started_at DESC LIMIT 80`,
				params
			),
			queryRows<Record<string, unknown>>(
				args.db,
				`SELECT path, COUNT(*) AS views, COUNT(DISTINCT anonymous_id) AS visitors
				FROM analytics_events WHERE event_type = 'page_view' AND received_at >= ?${environmentSql}
				GROUP BY path ORDER BY views DESC LIMIT 30`,
				params
			),
			queryRows<Record<string, unknown>>(
				args.db,
				`SELECT event_type, COUNT(*) AS count FROM analytics_events
				WHERE received_at >= ?${environmentSql} GROUP BY event_type ORDER BY count DESC`,
				params
			)
		]);

		const snapshot = {
			scope: { environment: args.environment, days: args.days, since },
			counts: {
				sessions: sessions.length,
				eventsSampled: events.length,
				modelRuns: modelRuns.length
			},
			topPages,
			eventCounts,
			sessions: compactRows(sessions, 80),
			recentEvents: compactRows(events, 300),
			modelRuns: compactRows(modelRuns, 80)
		};
		const prompt = `You are the product analytics reviewer for Question Constellation, a lightweight public GCSE exam-question atlas. Analyze the attached first-party event snapshot and give an evidence-grounded operational summary.

Priorities:
- Reconstruct representative user journeys in chronological terms, distinguishing logged-in and anonymous behavior.
- Identify friction, confusion, abandonment, repeated retries, weak engagement, and successful learning loops.
- Review model runs: latency, failures, reasoning availability, and whether outputs appear aligned with the learner action. Do not reveal hidden chain-of-thought verbatim; summarize behavioral signals from the recorded reasoning.
- Separate development traffic from production and never generalize from tiny samples.
- Never invent intent, demographics, examiner commentary, or causality. Label inferences explicitly.
- Quote user-entered text only when necessary and keep excerpts short.
- Hard limit: 700 words total. Use no more than 3 high-signal bullets per section, omit low-confidence trivia, and do not turn the event log back into a long narrative.

Return concise Markdown with these exact sections:
## What is happening
## Representative journeys
## Friction and drop-off signals
## Model behavior
## Data quality and uncertainty
## Recommended next checks

Analytics snapshot:
${JSON.stringify(snapshot)}`;

		configureModel();
		const call = streamText({
			model: SUMMARY_MODEL,
			input: prompt,
			thinkingLevel: THINKING_LEVEL,
			telemetry: false
		});
		let output = '';
		let reasoning = '';
		for await (const event of call.events) {
			if (event.type !== 'delta') continue;
			if (event.channel === 'response') output += event.text;
			if (event.channel === 'thought') reasoning += event.text;
		}
		const result = await call.result;
		const completedAt = new Date();
		await executeQuery(
			args.db,
			`UPDATE analytics_ai_summaries SET status = 'complete', completed_at = ?, duration_ms = ?,
				model_version = ?, prompt_text = ?, source_snapshot_json = ?, reasoning_text = ?,
				summary_markdown = ?, usage_json = ?, cost_usd = ? WHERE summary_id = ?`,
			[
				completedAt.toISOString(),
				completedAt.getTime() - startedAtMs,
				result.modelVersion,
				prompt,
				JSON.stringify(snapshot),
				reasoning.trim() || result.thoughts || null,
				output.trim() || result.text,
				JSON.stringify(result.usage ?? null),
				result.costUsd ?? null,
				args.summaryId
			]
		);
	} catch (error) {
		await executeQuery(
			args.db,
			"UPDATE analytics_ai_summaries SET status = 'error', completed_at = ?, duration_ms = ?, error_message = ? WHERE summary_id = ?",
			[
				new Date().toISOString(),
				Date.now() - startedAtMs,
				error instanceof Error ? error.message : String(error),
				args.summaryId
			]
		);
	}
}
