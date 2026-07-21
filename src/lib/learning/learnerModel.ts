export const LEARNER_MODEL_ALGORITHM_VERSION = 'learner-state-v1';

export const EVIDENCE_KIND_STRENGTH = {
	independent_transfer_constructed: 5,
	independent_exam_constructed: 5,
	short_constructed: 4,
	multiple_choice: 3,
	true_false: 2,
	flashcard_self_rating: 1
} as const;

export type EvidenceKind = keyof typeof EVIDENCE_KIND_STRENGTH;
export type EvidenceOutcome = 'correct' | 'partial' | 'incorrect' | 'known' | 'unsure';
export type LearnerState = 'no_evidence' | 'developing' | 'secure' | 'due' | 'conflicting';
export type LearnerUncertainty = 'high' | 'medium' | 'low';
export type LearnerActionKind = 'recall' | 'close_gap' | 'apply_chain';

export interface LearnerEvidence {
	id: string;
	kind: EvidenceKind;
	outcome: EvidenceOutcome;
	occurredAt: string | number | Date;
	/** A question, card, or task id. Missing ids are treated as one unknown item. */
	itemId?: string;
	/** Required for short constructed responses to count as independent production. */
	independent?: boolean;
	/** When present, the referenced observation is ignored in the derived state. */
	supersedesEvidenceId?: string;
}

export type LearnerStateReasonCode =
	| 'no_evidence'
	| 'recognition_only'
	| 'recent_gap'
	| 'insufficient_independent_evidence'
	| 'repeated_independent_constructed_success'
	| 'scheduled_check_due'
	| 'contradictory_constructed_evidence';

export interface LearnerStateSummary {
	state: LearnerState;
	uncertainty: LearnerUncertainty;
	reasonCode: LearnerStateReasonCode;
	evidenceCount: number;
	independentEvidenceCount: number;
	distinctItemCount: number;
	strongestEvidenceKind: EvidenceKind | null;
	lastEvidenceId: string | null;
	lastOutcome: EvidenceOutcome | null;
	lastEvidenceAt: string | null;
	nextCheckAt: string | null;
	supportingEvidenceIds: string[];
	algorithmVersion: typeof LEARNER_MODEL_ALGORITHM_VERSION;
}

export interface ComputeLearnerStateOptions {
	/** Injected to keep state calculation deterministic and testable. */
	now: string | number | Date;
}

export interface LearningActionCandidate {
	id: string;
	subject: string;
	kind: LearnerActionKind;
	curriculumComponentId: string;
	componentId: string;
	state: LearnerState;
	uncertainty: LearnerUncertainty;
	estimatedMinutes: number;
	available?: boolean;
	activeGap?: boolean;
	dueAt?: string | null;
	lastPractisedAt?: string | null;
	curriculumOrder?: number;
}

export interface ActionRankingConstraints {
	subject: string;
	/** Undefined means all official components; an empty array means none. */
	scopeComponentIds?: readonly string[];
	allowedKinds?: readonly LearnerActionKind[];
	maxMinutes?: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const CONFLICT_WINDOW_MS = 45 * DAY_MS;

interface TimedEvidence {
	evidence: LearnerEvidence;
	time: number;
}

export function evidenceStrength(kind: EvidenceKind): number {
	return EVIDENCE_KIND_STRENGTH[kind];
}

function timestamp(value: string | number | Date): number {
	const parsed =
		value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
	if (!Number.isFinite(parsed)) throw new TypeError(`Invalid evidence timestamp: ${String(value)}`);
	return parsed;
}

function iso(value: number): string {
	return new Date(value).toISOString();
}

function isPositive(outcome: EvidenceOutcome): boolean {
	return outcome === 'correct' || outcome === 'known';
}

function isNegative(outcome: EvidenceOutcome): boolean {
	return outcome === 'incorrect' || outcome === 'partial' || outcome === 'unsure';
}

function isIndependentConstructed(evidence: LearnerEvidence): boolean {
	if (evidence.independent === false) return false;
	return (
		evidence.kind === 'independent_transfer_constructed' ||
		evidence.kind === 'independent_exam_constructed' ||
		(evidence.kind === 'short_constructed' && evidence.independent === true)
	);
}

function evidenceItemKey(evidence: LearnerEvidence): string {
	return evidence.itemId?.trim() || '__unknown_item__';
}

function strongestKind(evidence: readonly TimedEvidence[]): EvidenceKind | null {
	let strongest: EvidenceKind | null = null;
	for (const item of evidence) {
		if (strongest === null || evidenceStrength(item.evidence.kind) > evidenceStrength(strongest)) {
			strongest = item.evidence.kind;
		}
	}
	return strongest;
}

function nextDevelopingCheck(latest: TimedEvidence): number {
	if (!isPositive(latest.evidence.outcome)) return latest.time + DAY_MS;
	const strength = evidenceStrength(latest.evidence.kind);
	if (strength <= 1) return latest.time + DAY_MS;
	if (strength <= 3) return latest.time + 2 * DAY_MS;
	return latest.time + 3 * DAY_MS;
}

export function computeLearnerState(
	evidence: readonly LearnerEvidence[],
	options: ComputeLearnerStateOptions
): LearnerStateSummary {
	const now = timestamp(options.now);
	const supersededIds = new Set(
		evidence
			.map((item) => item.supersedesEvidenceId?.trim())
			.filter((id): id is string => Boolean(id))
	);
	const ordered: TimedEvidence[] = evidence
		.filter((item) => !supersededIds.has(item.id))
		.map((item) => ({ evidence: item, time: timestamp(item.occurredAt) }))
		.sort(
			(left, right) => left.time - right.time || left.evidence.id.localeCompare(right.evidence.id)
		);

	if (ordered.length === 0) {
		return {
			state: 'no_evidence',
			uncertainty: 'high',
			reasonCode: 'no_evidence',
			evidenceCount: 0,
			independentEvidenceCount: 0,
			distinctItemCount: 0,
			strongestEvidenceKind: null,
			lastEvidenceId: null,
			lastOutcome: null,
			lastEvidenceAt: null,
			nextCheckAt: null,
			supportingEvidenceIds: [],
			algorithmVersion: LEARNER_MODEL_ALGORITHM_VERSION
		};
	}

	const latest = ordered.at(-1)!;
	const recent = ordered.filter((item) => item.time >= now - CONFLICT_WINDOW_MS);
	const recentConstructedPositive = recent.filter(
		(item) => isIndependentConstructed(item.evidence) && isPositive(item.evidence.outcome)
	);
	const recentConstructedNegative = recent.filter(
		(item) => isIndependentConstructed(item.evidence) && isNegative(item.evidence.outcome)
	);
	const latestConstructedFailureTime = Math.max(
		...recentConstructedNegative.map((item) => item.time),
		Number.NEGATIVE_INFINITY
	);
	const distinctSuccessesAfterFailure = new Set(
		recentConstructedPositive
			.filter((item) => item.time > latestConstructedFailureTime)
			.map((item) => evidenceItemKey(item.evidence))
	);
	const unresolvedComparableConflict =
		recentConstructedPositive.some((positive) =>
			recentConstructedNegative.some(
				(negative) =>
					Math.abs(
						evidenceStrength(positive.evidence.kind) - evidenceStrength(negative.evidence.kind)
					) <= 1
			)
		) && distinctSuccessesAfterFailure.size < 2;

	const independentConstructedSuccesses = ordered.filter(
		(item) => isPositive(item.evidence.outcome) && isIndependentConstructed(item.evidence)
	);
	const latestIndependentSuccessByItem = new Map<string, TimedEvidence>();
	for (const item of independentConstructedSuccesses) {
		latestIndependentSuccessByItem.set(evidenceItemKey(item.evidence), item);
	}
	const distinctIndependentSuccesses = [...latestIndependentSuccessByItem.values()];
	const earliestConstructedSuccessTime = Math.min(
		...distinctIndependentSuccesses.map((item) => item.time),
		Number.POSITIVE_INFINITY
	);
	const topTierSuccessCount = distinctIndependentSuccesses.filter(
		(item) => evidenceStrength(item.evidence.kind) === 5
	).length;
	const latestConstructedSuccessTime = Math.max(
		...distinctIndependentSuccesses.map((item) => item.time),
		Number.NEGATIVE_INFINITY
	);
	const hasLaterUnresolvedFailure = ordered.some(
		(item) =>
			item.time > latestConstructedSuccessTime &&
			evidenceStrength(item.evidence.kind) >= 3 &&
			(isNegative(item.evidence.outcome) || item.evidence.outcome === 'partial')
	);
	const hasSecureEvidence =
		distinctIndependentSuccesses.length >= 2 &&
		(topTierSuccessCount >= 1 || distinctIndependentSuccesses.length >= 3) &&
		latestConstructedSuccessTime - earliestConstructedSuccessTime >= DAY_MS &&
		!hasLaterUnresolvedFailure;

	let baseState: Exclude<LearnerState, 'due'>;
	let reasonCode: LearnerStateReasonCode;
	let nextCheckTime: number | null;

	if (unresolvedComparableConflict) {
		baseState = 'conflicting';
		reasonCode = 'contradictory_constructed_evidence';
		nextCheckTime = latest.time;
	} else if (hasSecureEvidence) {
		baseState = 'secure';
		reasonCode = 'repeated_independent_constructed_success';
		nextCheckTime = latestConstructedSuccessTime + (topTierSuccessCount >= 2 ? 21 : 14) * DAY_MS;
	} else {
		baseState = 'developing';
		if (!isPositive(latest.evidence.outcome)) {
			reasonCode = 'recent_gap';
		} else if (strongestKind(ordered) && evidenceStrength(strongestKind(ordered)!) <= 3) {
			reasonCode = 'recognition_only';
		} else {
			reasonCode = 'insufficient_independent_evidence';
		}
		nextCheckTime = nextDevelopingCheck(latest);
	}

	let state: LearnerState = baseState;
	if (
		baseState !== 'conflicting' &&
		nextCheckTime !== null &&
		now >= nextCheckTime &&
		(baseState === 'secure' || isPositive(latest.evidence.outcome))
	) {
		state = 'due';
		reasonCode = 'scheduled_check_due';
	}

	let uncertainty: LearnerUncertainty;
	if (state === 'conflicting') {
		uncertainty = 'high';
	} else if (state === 'secure') {
		uncertainty =
			topTierSuccessCount >= 2 &&
			recentConstructedNegative.length === 0 &&
			latestConstructedSuccessTime - earliestConstructedSuccessTime >= 7 * DAY_MS
				? 'low'
				: 'medium';
	} else if (state === 'due') {
		uncertainty = baseState === 'secure' ? 'medium' : 'high';
	} else {
		uncertainty =
			ordered.length >= 2 && ordered.some((item) => evidenceStrength(item.evidence.kind) >= 4)
				? 'medium'
				: 'high';
	}

	return {
		state,
		uncertainty,
		reasonCode,
		evidenceCount: ordered.length,
		independentEvidenceCount: ordered.filter((item) => isIndependentConstructed(item.evidence))
			.length,
		distinctItemCount: new Set(
			ordered
				.map((item) => item.evidence.itemId?.trim())
				.filter((item): item is string => Boolean(item))
		).size,
		strongestEvidenceKind: strongestKind(ordered),
		lastEvidenceId: latest.evidence.id,
		lastOutcome: latest.evidence.outcome,
		lastEvidenceAt: iso(latest.time),
		nextCheckAt: nextCheckTime === null ? null : iso(nextCheckTime),
		supportingEvidenceIds: ordered.map((item) => item.evidence.id),
		algorithmVersion: LEARNER_MODEL_ALGORITHM_VERSION
	};
}

function statePriority(candidate: LearningActionCandidate): number {
	if (candidate.state === 'conflicting') return 0;
	if (candidate.state === 'developing' && candidate.activeGap) return 1;
	if (candidate.state === 'due') return 2;
	if (candidate.state === 'developing') return 3;
	if (candidate.state === 'no_evidence') return 4;
	return 5;
}

function kindPriority(candidate: LearningActionCandidate): number {
	const byState: Record<LearnerState, Record<LearnerActionKind, number>> = {
		conflicting: { close_gap: 0, apply_chain: 1, recall: 2 },
		due: { recall: 0, apply_chain: 1, close_gap: 2 },
		developing: { close_gap: candidate.activeGap ? 0 : 2, recall: 1, apply_chain: 2 },
		no_evidence: { recall: 0, apply_chain: 1, close_gap: 2 },
		secure: { apply_chain: 0, recall: 1, close_gap: 2 }
	};
	return byState[candidate.state][candidate.kind];
}

function optionalTimestamp(value: string | null | undefined, fallback: number): number {
	return value ? timestamp(value) : fallback;
}

function compareCandidates(left: LearningActionCandidate, right: LearningActionCandidate): number {
	const uncertaintyPriority: Record<LearnerUncertainty, number> = { high: 0, medium: 1, low: 2 };
	return (
		statePriority(left) - statePriority(right) ||
		kindPriority(left) - kindPriority(right) ||
		optionalTimestamp(left.dueAt, Number.POSITIVE_INFINITY) -
			optionalTimestamp(right.dueAt, Number.POSITIVE_INFINITY) ||
		uncertaintyPriority[left.uncertainty] - uncertaintyPriority[right.uncertainty] ||
		optionalTimestamp(left.lastPractisedAt, Number.NEGATIVE_INFINITY) -
			optionalTimestamp(right.lastPractisedAt, Number.NEGATIVE_INFINITY) ||
		(left.curriculumOrder ?? Number.MAX_SAFE_INTEGER) -
			(right.curriculumOrder ?? Number.MAX_SAFE_INTEGER) ||
		left.estimatedMinutes - right.estimatedMinutes ||
		left.id.localeCompare(right.id)
	);
}

export function rankCandidateActions(
	candidates: readonly LearningActionCandidate[],
	constraints: ActionRankingConstraints
): LearningActionCandidate[] {
	const scope =
		constraints.scopeComponentIds === undefined ? null : new Set(constraints.scopeComponentIds);
	const allowedKinds = constraints.allowedKinds ? new Set(constraints.allowedKinds) : null;

	return candidates
		.filter((candidate) => candidate.subject === constraints.subject)
		.filter((candidate) => candidate.available !== false)
		.filter((candidate) => scope === null || scope.has(candidate.curriculumComponentId))
		.filter((candidate) => allowedKinds === null || allowedKinds.has(candidate.kind))
		.filter(
			(candidate) =>
				constraints.maxMinutes === undefined || candidate.estimatedMinutes <= constraints.maxMinutes
		)
		.slice()
		.sort(compareCandidates);
}
