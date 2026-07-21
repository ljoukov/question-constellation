import { startModelAnalytics } from '$lib/server/analytics';
import { configureLlmProcessEnv } from '$lib/server/answerGrading';
import type { AdminUser } from '$lib/server/auth/session';
import { executePersonalQuery, queryPersonalFirst } from '$lib/server/db';
import type { LlmTextModelId } from '@ljoukov/llm';

const RECOMMENDATION_MODEL: LlmTextModelId = 'chatgpt-gpt-5.6-sol-fast';
const RECOMMENDATION_THINKING_LEVEL = 'low';

type StoredRecommendationRow = {
	id: string;
	board: string;
	qualification: string;
	curriculum_scope_snapshot_json: string;
	learner_state_snapshot_json: string;
	candidate_actions_json: string;
};

type StoredCandidate = {
	id: string;
	subject: string;
	kind: 'recall' | 'close_gap' | 'apply_chain';
	curriculumComponentId: string;
	componentId: string;
	state: string;
	uncertainty: string;
	estimatedMinutes: number;
	available?: boolean;
	title: string;
	detail: string;
	route: string;
};

export type RecommendationModelChoice = {
	candidateId: string;
};

function parseJson<T>(value: string, fallback: T): T {
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

export function parseRecommendationResponse(
	raw: string,
	allowedCandidateIds: ReadonlySet<string>
): RecommendationModelChoice | null {
	const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	const object = (fenced ?? raw).match(/\{[\s\S]*\}/)?.[0];
	if (!object) return null;
	try {
		const parsed = JSON.parse(object) as { candidateId?: unknown };
		if (typeof parsed.candidateId !== 'string' || !allowedCandidateIds.has(parsed.candidateId)) {
			return null;
		}
		return { candidateId: parsed.candidateId };
	} catch {
		return null;
	}
}

function buildPrompt({
	subject,
	scope,
	learnerState,
	candidates
}: {
	subject: string;
	scope: unknown;
	learnerState: unknown;
	candidates: StoredCandidate[];
}): string {
	return [
		'You choose one next GCSE practice action for a signed-in student.',
		'The candidate list is already constrained to the official board curriculum scope and available reviewed content.',
		'Choose exactly one supplied candidate. Never invent a topic, action, route, grade, or mastery value.',
		'Prefer due retrieval, a repeatedly supported gap, or useful independent transfer according to the evidence. Recognition-only evidence is weak. Do not overreact to one mistake.',
		'',
		`Subject: ${subject}`,
		`Curriculum scope: ${JSON.stringify(scope)}`,
		`Learner state: ${JSON.stringify(learnerState)}`,
		`Eligible candidates: ${JSON.stringify(candidates)}`,
		'',
		'Output JSON only:',
		'{"candidateId":"exact supplied id"}'
	].join('\n');
}

async function hasCurrentLlmDecision(userId: string, subject: string): Promise<boolean> {
	const row = await queryPersonalFirst<{ id: string }>(
		`SELECT id
		 FROM user_recommendation_decisions
		 WHERE user_id = ? AND subject = ? AND decision_source = 'llm'
		   AND dismissed_at IS NULL AND acted_at IS NULL
		   AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)
		 ORDER BY created_at DESC
		 LIMIT 1`,
		[userId, subject]
	);
	return Boolean(row);
}

async function latestRulesDecision(
	userId: string,
	subject: string
): Promise<StoredRecommendationRow | null> {
	return await queryPersonalFirst<StoredRecommendationRow>(
		`SELECT id, board, qualification, curriculum_scope_snapshot_json,
		        learner_state_snapshot_json, candidate_actions_json
		 FROM user_recommendation_decisions
		 WHERE user_id = ? AND subject = ? AND decision_source = 'rules'
		   AND dismissed_at IS NULL AND acted_at IS NULL
		   AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)
		 ORDER BY created_at DESC
		 LIMIT 1`,
		[userId, subject]
	);
}

export async function refreshSubjectRecommendationWithModel({
	user,
	subject,
	platformEnv
}: {
	user: AdminUser;
	subject: string;
	platformEnv?: unknown;
}): Promise<'already_current' | 'not_ready' | 'refreshed'> {
	if (await hasCurrentLlmDecision(user.uid, subject)) return 'already_current';
	const rules = await latestRulesDecision(user.uid, subject);
	if (!rules) return 'not_ready';
	const candidates = parseJson<StoredCandidate[]>(rules.candidate_actions_json, []).filter(
		(candidate) => candidate.available !== false
	);
	if (candidates.length < 2) return 'not_ready';
	const allowedIds = new Set(candidates.map((candidate) => candidate.id));
	const scope = parseJson<unknown>(rules.curriculum_scope_snapshot_json, {});
	const learnerState = parseJson<unknown>(rules.learner_state_snapshot_json, []);
	const prompt = buildPrompt({ subject, scope, learnerState, candidates });
	const analytics = startModelAnalytics({
		feature: 'subject_next_action_recommendation',
		model: RECOMMENDATION_MODEL,
		thinkingLevel: RECOMMENDATION_THINKING_LEVEL,
		prompt,
		modelInput: { subject, scope, learnerState, candidates }
	});

	try {
		configureLlmProcessEnv(platformEnv, RECOMMENDATION_MODEL);
		const { streamText } = await import('@ljoukov/llm');
		const call = streamText({
			model: RECOMMENDATION_MODEL,
			input: prompt,
			thinkingLevel: RECOMMENDATION_THINKING_LEVEL,
			telemetry: false
		});
		let responseText = '';
		let reasoningText = '';
		for await (const event of call.events) {
			if (event.type !== 'delta') continue;
			if (event.channel === 'response') responseText += event.text;
			if (event.channel === 'thought') reasoningText += event.text;
		}
		const result = await call.result;
		const output = responseText.trim() || result.text;
		const reasoning = reasoningText.trim() || result.thoughts;
		const choice = parseRecommendationResponse(output, allowedIds);
		if (!choice) throw new Error('Recommendation model returned an invalid candidate selection.');
		const selected = candidates.find((candidate) => candidate.id === choice.candidateId)!;
		const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000)
			.toISOString()
			.slice(0, 19)
			.replace('T', ' ');
		const recommendationId = `recommendation_${crypto.randomUUID().replace(/-/g, '')}`;
		await executePersonalQuery(
			`INSERT INTO user_recommendation_decisions (
			   id, user_id, subject, board, qualification,
			   curriculum_scope_snapshot_json, learner_state_snapshot_json,
			   candidate_actions_json, selected_action_id, selected_action_kind,
			   selected_component_kind, selected_component_id,
			   selected_curriculum_component_id, selected_route,
			   decision_source, algorithm_version,
			   model_run_id, valid_until
			 )
			 SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'llm', ?, ?, ?
			 WHERE EXISTS (
			   SELECT 1
			   FROM user_recommendation_decisions source
			   WHERE source.id = ?
			     AND source.dismissed_at IS NULL
			     AND source.acted_at IS NULL
			     AND (source.valid_until IS NULL OR source.valid_until > CURRENT_TIMESTAMP)
			 )`,
			[
				recommendationId,
				user.uid,
				subject,
				rules.board,
				rules.qualification,
				rules.curriculum_scope_snapshot_json,
				rules.learner_state_snapshot_json,
				rules.candidate_actions_json,
				selected.id,
				selected.kind,
				selected.kind === 'apply_chain' ? 'answer_chain' : selected.kind,
				selected.componentId,
				selected.curriculumComponentId,
				selected.route,
				'next-action-v1',
				analytics.runId,
				validUntil,
				rules.id
			]
		);
		const inserted = await queryPersonalFirst<{ id: string }>(
			`SELECT id FROM user_recommendation_decisions WHERE id = ?`,
			[recommendationId]
		);
		analytics.complete({
			modelVersion: result.modelVersion,
			output,
			reasoning,
			usage: result.usage,
			costUsd: result.costUsd,
			metadata: {
				subject,
				selectedActionId: selected.id,
				discardedAsStale: !inserted
			}
		});
		return inserted ? 'refreshed' : 'not_ready';
	} catch (error) {
		analytics.fail(error, { metadata: { subject } });
		console.warn('[recommendation] model refinement failed; keeping deterministic action', {
			subject,
			userId: user.uid,
			error
		});
		return 'not_ready';
	}
}

export async function refreshOneStaleRecommendationWithModel({
	user,
	subjects,
	platformEnv
}: {
	user: AdminUser;
	subjects: string[];
	platformEnv?: unknown;
}): Promise<void> {
	for (const subject of subjects) {
		const result = await refreshSubjectRecommendationWithModel({ user, subject, platformEnv });
		if (result === 'refreshed') return;
	}
}
