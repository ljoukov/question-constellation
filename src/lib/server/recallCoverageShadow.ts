import type { RecallCard, RecallRuntimeSubject } from '$lib/recall/aqaScienceRecall';
import type { AdminUser } from '$lib/server/auth/session';
import { getCurriculumOffering } from '$lib/server/curriculumCatalog';
import {
	executePersonalQuery,
	queryPersonalFirst,
	queryPersonalRows,
	queryRows
} from '$lib/server/db';
import { getLearnerProfileSettings } from '$lib/server/personalLearning';

export const RECALL_COVERAGE_SHADOW_VERSION = 'recall-coverage-shadow-v1';

type StableGapCandidate = {
	id: string;
	answer_chain_id: string;
	chain_step_id: string;
	source_question_id: string | null;
	status: string;
	evidence_count: number;
	distinct_item_count: number;
	state: string | null;
	uncertainty: string | null;
};

type ReviewedGapMapping = {
	question_id: string;
	curriculum_component_id: string;
	topic_component_id: string | null;
};

type ScopeRow = {
	board: string;
	qualification: string;
	course: string;
	tier: string;
	scope_mode: 'all' | 'selected';
	selected_component_ids_json: string;
};

export function isStableRecallCoverageGap(
	gap: Pick<
		StableGapCandidate,
		'status' | 'source_question_id' | 'evidence_count' | 'distinct_item_count' | 'state'
	>
): boolean {
	return (
		gap.status === 'active' &&
		Boolean(gap.source_question_id) &&
		gap.evidence_count >= 2 &&
		gap.distinct_item_count >= 2 &&
		(gap.state === 'developing' || gap.state === 'conflicting')
	);
}

function selectedComponentIds(scope: ScopeRow): Set<string> | null {
	if (scope.scope_mode === 'all') return new Set();
	try {
		const parsed = JSON.parse(scope.selected_component_ids_json) as unknown;
		if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string')) return null;
		return new Set(parsed);
	} catch {
		return null;
	}
}

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Observe only: this never changes a deck and never creates learner-facing
 * content. All target and scope decisions are reconstructed server-side.
 */
export async function recordRecallCoverageMisses({
	user,
	subject,
	canonicalCards
}: {
	user: AdminUser;
	subject: RecallRuntimeSubject;
	canonicalCards: readonly RecallCard[];
}): Promise<number> {
	const settings = await getLearnerProfileSettings(user);
	const learnerSubject = settings.subjects.find(
		(entry) => entry.enabled && entry.subject === subject
	);
	if (!learnerSubject) return 0;
	const offering = await getCurriculumOffering({
		board: learnerSubject.board,
		qualification: learnerSubject.qualification,
		profileSubject: learnerSubject.subject,
		course: learnerSubject.course,
		tier: learnerSubject.tier
	});
	if (!offering) return 0;
	const scope = await queryPersonalFirst<ScopeRow>(
		`SELECT board, qualification, course, tier, scope_mode, selected_component_ids_json
		 FROM user_subject_curriculum_scopes
		 WHERE user_id = ? AND subject = ?
		 LIMIT 1`,
		[user.uid, subject]
	);
	if (
		!scope ||
		scope.board !== learnerSubject.board ||
		scope.qualification !== learnerSubject.qualification ||
		scope.course !== learnerSubject.course ||
		scope.tier !== learnerSubject.tier
	) {
		return 0;
	}
	const selectedIds = selectedComponentIds(scope);
	if (!selectedIds) return 0;

	const gaps = (
		await queryPersonalRows<StableGapCandidate>(
			`SELECT g.id, g.answer_chain_id, g.chain_step_id, g.source_question_id,
			        g.status, g.evidence_count,
			        COALESCE(state.distinct_item_count, 0) AS distinct_item_count,
			        state.state, state.uncertainty
			 FROM user_chain_gaps g
			 LEFT JOIN user_learner_component_states state
			   ON state.user_id = g.user_id
			  AND state.subject = g.subject
			  AND state.course = g.course
			  AND state.tier = g.tier
			  AND state.component_kind = 'chain_step'
			  AND state.component_id = g.chain_step_id
			 WHERE g.user_id = ? AND g.subject = ? AND g.course = ? AND g.tier = ?
			   AND g.status IN ('active', 'awaiting_check')`,
			[user.uid, subject, learnerSubject.course, learnerSubject.tier]
		)
	).filter(isStableRecallCoverageGap);
	if (gaps.length === 0) return 0;

	const questionIds = [...new Set(gaps.map((gap) => gap.source_question_id!))];
	const mappings = await queryRows<ReviewedGapMapping>(
		`WITH RECURSIVE requested_questions(question_id) AS (
		   SELECT value FROM json_each(?)
		 ), reviewed_targets AS (
		   SELECT mapping.question_id,
		          component.id AS curriculum_component_id,
		          component.id, component.parent_id, component.selectable, component.depth
		   FROM question_curriculum_components mapping
		   JOIN curriculum_components component ON component.id = mapping.curriculum_component_id
		   JOIN requested_questions requested ON requested.question_id = mapping.question_id
		   WHERE mapping.specification_id = ?
		     AND mapping.is_primary = 1
		     AND mapping.reviewed = 1
		 ), ancestors(
		   question_id, curriculum_component_id, id, parent_id, selectable, depth
		 ) AS (
		   SELECT question_id, curriculum_component_id, id, parent_id, selectable, depth
		   FROM reviewed_targets
		   UNION ALL
		   SELECT child.question_id, child.curriculum_component_id,
		          parent.id, parent.parent_id, parent.selectable, parent.depth
		   FROM ancestors child
		   JOIN curriculum_components parent ON parent.id = child.parent_id
		 )
		 SELECT target.question_id, target.curriculum_component_id,
		        (SELECT ancestor.id
		         FROM ancestors ancestor
		         WHERE ancestor.question_id = target.question_id
		           AND ancestor.curriculum_component_id = target.curriculum_component_id
		           AND ancestor.selectable = 1
		         ORDER BY ancestor.depth DESC, ancestor.id
		         LIMIT 1) AS topic_component_id
		 FROM reviewed_targets target`,
		[JSON.stringify(questionIds), offering.specification.id]
	);
	const mappingByQuestion = new Map(mappings.map((mapping) => [mapping.question_id, mapping]));
	const exactCanonicalTargets = new Set(
		canonicalCards
			.filter((card) => card.offeringId === offering.id)
			.map((card) => card.curriculumComponentId)
	);
	let recorded = 0;
	for (const gap of gaps) {
		const mapping = mappingByQuestion.get(gap.source_question_id!);
		if (!mapping?.topic_component_id) continue;
		if (scope.scope_mode === 'selected' && !selectedIds.has(mapping.topic_component_id)) continue;
		if (exactCanonicalTargets.has(mapping.curriculum_component_id)) continue;
		const id = `coverage_${(
			await sha256(
				[
					user.uid,
					gap.id,
					offering.id,
					mapping.curriculum_component_id,
					RECALL_COVERAGE_SHADOW_VERSION
				].join('\u0000')
			)
		).slice(0, 48)}`;
		await executePersonalQuery(
			`INSERT INTO user_recall_coverage_misses (
			   id, user_id, subject, board, qualification, course, tier,
			   offering_id, specification_id, gap_id, answer_chain_id, chain_step_id,
			   source_question_id, curriculum_component_id, topic_component_id,
			   learner_state, learner_uncertainty, evidence_count, distinct_item_count,
			   reason_code, shadow_version
			 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
			           'stable_gap_no_exact_reviewed_card', ?)
			 ON CONFLICT(user_id, gap_id, offering_id, curriculum_component_id) DO UPDATE SET
			   learner_state = excluded.learner_state,
			   learner_uncertainty = excluded.learner_uncertainty,
			   evidence_count = excluded.evidence_count,
			   distinct_item_count = excluded.distinct_item_count,
			   shadow_version = excluded.shadow_version,
			   observation_count = user_recall_coverage_misses.observation_count + 1,
			   last_seen_at = CURRENT_TIMESTAMP`,
			[
				id,
				user.uid,
				subject,
				learnerSubject.board,
				learnerSubject.qualification,
				learnerSubject.course,
				learnerSubject.tier,
				offering.id,
				offering.specification.id,
				gap.id,
				gap.answer_chain_id,
				gap.chain_step_id,
				gap.source_question_id!,
				mapping.curriculum_component_id,
				mapping.topic_component_id,
				gap.state!,
				gap.uncertainty ?? 'high',
				gap.evidence_count,
				gap.distinct_item_count,
				RECALL_COVERAGE_SHADOW_VERSION
			]
		);
		recorded += 1;
	}
	return recorded;
}
