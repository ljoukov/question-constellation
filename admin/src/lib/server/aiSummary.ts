import { env } from '$env/dynamic/private';
import { configureChatGptCodexProxy, streamText } from '@ljoukov/llm';
import { executeQuery, queryRows } from './db';
import {
	ENRICHED_SESSIONS_CTE,
	sessionScope,
	type AnalyticsFilters,
	type EnvironmentScope,
	type IdentityScope,
	type TrafficScope
} from './analyticsScope';
import { conciseSummary } from './summaryFormat';

const SUMMARY_MODEL = 'chatgpt-gpt-5.6-sol';
const THINKING_LEVEL = 'medium';

type Db = App.Locals['analyticsDb'];
type Row = Record<string, unknown>;

export type SummaryScope = {
	environment: EnvironmentScope;
	days: number;
	traffic: TrafficScope;
	identity: IdentityScope;
	country: string;
	path: string;
};

function configureModel() {
	const url = env.CHATGPT_CODEX_PROXY_URL;
	const apiKey = env.CHATGPT_CODEX_PROXY_API_KEY;
	if (!url || !apiKey) throw new Error('ChatGPT Codex proxy credentials are not configured.');
	configureChatGptCodexProxy({ url, apiKey });
	process.env.CHATGPT_CODEX_PROXY_URL = url;
	process.env.CHATGPT_CODEX_PROXY_API_KEY = apiKey;
	process.env.CHATGPT_RESPONSES_WEBSOCKET_MODE = 'off';
}

function dashboardFilters(scope: SummaryScope): AnalyticsFilters {
	return {
		view: 'overview',
		days: scope.days,
		environment: scope.environment,
		traffic: scope.traffic,
		identity: scope.identity,
		country: scope.country,
		search: '',
		path: scope.path
	};
}

export async function createSummaryJob(args: {
	db: Db;
	scope: SummaryScope;
	requestedBy: string | null;
}) {
	const summaryId = crypto.randomUUID();
	await executeQuery(
		args.db,
		`INSERT INTO analytics_ai_summaries (
			summary_id, status, environment, window_days, traffic_scope, identity_scope,
			country_scope, path_scope, requested_by, created_at, model, thinking_level
		) VALUES (?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			summaryId,
			args.scope.environment,
			args.scope.days,
			args.scope.traffic,
			args.scope.identity,
			args.scope.country || null,
			args.scope.path || null,
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
	scope: SummaryScope;
}): Promise<boolean> {
	const startedAt = new Date();
	const startedAtMs = Date.now();
	const claimedRows = await queryRows<{ summary_id: string }>(
		args.db,
		`UPDATE analytics_ai_summaries
		SET status = 'running', started_at = ?
		WHERE summary_id = ? AND status = 'queued'
		RETURNING summary_id`,
		[startedAt.toISOString(), args.summaryId]
	);
	if (!claimedRows.length) return false;

	try {
		const filters = dashboardFilters(args.scope);
		const scoped = sessionScope(filters);
		const [summaryRows, topEntries, representativeSessions] = await Promise.all([
			queryRows<Row>(
				args.db,
				`${ENRICHED_SESSIONS_CTE}
				SELECT
					COUNT(*) AS sessions,
					COUNT(DISTINCT s.actor_key) AS profiles,
					COUNT(DISTINCT CASE WHEN s.actor_kind = 'user' THEN s.actor_key END)
						AS signed_in_people,
					COUNT(DISTINCT CASE WHEN s.actor_kind = 'anonymous' THEN s.actor_key END)
						AS anonymous_browsers,
					SUM(CASE WHEN s.engaged_ms >= 10000 OR s.page_view_count >= 2 THEN 1 ELSE 0 END)
						AS engaged_sessions,
					SUM(CASE WHEN EXISTS (
						SELECT 1 FROM analytics_events e
						WHERE e.session_id = s.session_id AND e.event_type = 'page_view'
							AND e.path LIKE '%/practice%'
					) THEN 1 ELSE 0 END) AS practice_sessions
				FROM enriched_sessions s WHERE ${scoped.sql}`,
				scoped.params
			),
			queryRows<Row>(
				args.db,
				`${ENRICHED_SESSIONS_CTE}
				SELECT COALESCE(s.initial_path, '/') AS path, COUNT(*) AS sessions
				FROM enriched_sessions s WHERE ${scoped.sql}
				GROUP BY path ORDER BY sessions DESC LIMIT 6`,
				scoped.params
			),
			queryRows<Row>(
				args.db,
				`${ENRICHED_SESSIONS_CTE}
				SELECT
					s.session_id, s.actor_kind, s.started_at, s.last_seen_at, s.initial_path,
					s.country, s.device_type, s.page_view_count, s.engaged_ms
				FROM enriched_sessions s WHERE ${scoped.sql}
				ORDER BY
					CASE WHEN s.engaged_ms >= 10000 OR s.page_view_count >= 2 THEN 0 ELSE 1 END,
					s.engaged_ms DESC, s.last_seen_at DESC
				LIMIT 5`,
				scoped.params
			)
		]);

		const sessionIds = representativeSessions
			.map((session) => String(session.session_id || ''))
			.filter(Boolean);
		let events: Row[] = [];
		let modelRuns: Row[] = [];
		if (sessionIds.length) {
			const placeholders = sessionIds.map(() => '?').join(', ');
			[events, modelRuns] = await Promise.all([
				queryRows<Row>(
					args.db,
					`SELECT
						session_id, event_type, occurred_at, path, action
					FROM (
						SELECT
							session_id, event_type, occurred_at, path,
							CASE WHEN event_type = 'click' THEN SUBSTR(element_text, 1, 160) END
								AS action,
							ROW_NUMBER() OVER (
								PARTITION BY session_id
								ORDER BY client_timestamp_ms ASC, sequence_number ASC
							) AS event_rank
						FROM analytics_events
						WHERE session_id IN (${placeholders})
							AND (
								event_type IN ('page_view', 'form_submit', 'client_error')
								OR (
									event_type = 'click'
									AND (
										LOWER(COALESCE(element_text, '')) LIKE '%check%'
										OR LOWER(COALESCE(element_text, '')) LIKE '%practice%'
										OR LOWER(COALESCE(element_text, '')) LIKE '%answer chain%'
										OR LOWER(COALESCE(element_text, '')) LIKE '%next question%'
										OR LOWER(COALESCE(element_text, '')) LIKE '%try again%'
									)
								)
							)
					)
					WHERE event_rank <= 40
					ORDER BY session_id, event_rank
					LIMIT 200`,
					sessionIds
				),
				queryRows<Row>(
					args.db,
					`SELECT
						run_id, session_id, feature, path, model, model_version, thinking_level,
						status, started_at, duration_ms, cost_usd
					FROM analytics_model_runs
					WHERE session_id IN (${placeholders})
					ORDER BY session_id, started_at ASC
					LIMIT 40`,
					sessionIds
				)
			]);
		}

		const journeys = representativeSessions.map((session) => {
			const sessionEvents = events.filter((event) => event.session_id === session.session_id);
			const routeSequence: string[] = [];
			for (const event of sessionEvents) {
				if (event.event_type !== 'page_view') continue;
				const path = String(event.path || '/');
				if (routeSequence.at(-1) !== path) routeSequence.push(path);
			}
			return {
				...session,
				routeSequence: routeSequence.slice(0, 12),
				keyActions: sessionEvents
					.filter((event) => event.event_type === 'click' && event.action)
					.slice(0, 8)
					.map((event) => ({ at: event.occurred_at, action: event.action })),
				clientErrors: sessionEvents.filter((event) => event.event_type === 'client_error').length,
				modelRuns: modelRuns.filter((run) => run.session_id === session.session_id).slice(0, 8)
			};
		});
		const snapshot = {
			scope: args.scope,
			counts: summaryRows[0] ?? {},
			topEntries,
			representativeJourneys: journeys
		};
		const prompt = `You are reviewing a small, filtered cohort from Question Constellation, a public GCSE question bank organized around question → answer chain → constellation → practice.

Write a terse analyst note based only on the attached snapshot.

Rules:
- Hard limit: 150 words and at most 3 bullets total.
- State the exact scope and sample size first.
- Give one concrete observed pattern, citing counts and one supporting session id when possible.
- Give one next journey to inspect or one instrumentation check.
- If the evidence is too thin, say that directly. Never inflate tiny changes or infer intent, causality, demographics, learning, or product success.
- Do not quote learner-entered text, prompts, model output, or reasoning.
- Do not repeat raw logs and do not offer generic product advice.

Use exactly these headings:
## Signal
## Inspect next
## Limitation

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
		const summary = conciseSummary(output.trim() || result.text);
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
				summary,
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
	return true;
}
