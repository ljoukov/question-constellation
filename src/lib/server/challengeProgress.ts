import { challengeCatalog } from '$lib/challenges/catalog';
import {
	mergeChallengeProgress,
	type ChallengeProgress,
	type ChallengeProgressEntry
} from '$lib/challenges/progress';
import { executePersonalQuery, queryPersonalRows } from '$lib/server/db';
import {
	invalidateUserHomeSnapshotForRepair,
	updateUserHomeSnapshotChallengeProjection
} from '$lib/server/homeSnapshot';

export const CHALLENGE_PROGRESS_MAX_ENTRIES = challengeCatalog.length;
export const CHALLENGE_PROGRESS_SCORE_VALUES = [400, 425, 450, 475, 500] as const;
export const CHALLENGE_PROGRESS_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const challengeIds = new Set(challengeCatalog.map((challenge) => challenge.id));
const challengeScores = new Set<number>(CHALLENGE_PROGRESS_SCORE_VALUES);
const challengeStages = new Set<ChallengeProgressEntry['lastStage']>([
	'showdown',
	'diagnose',
	'repair',
	'transfer',
	'complete'
]);

type ChallengeProgressRow = {
	challenge_id: string;
	started_at: string;
	updated_at: string;
	completed_at: string | null;
	plays: number;
	last_stage: string;
	best_score: number | null;
	best_time_ms: number | null;
	last_score: number | null;
	last_time_ms: number | null;
};

function emptyProgress(): ChallengeProgress {
	return { version: 2, challenges: {} };
}

function isTimestamp(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length >= 20 &&
		value.length <= 40 &&
		Number.isFinite(Date.parse(value))
	);
}

function boundedInteger(
	value: unknown,
	{ min, max, nullable = false }: { min: number; max: number; nullable?: boolean }
): number | null | undefined {
	if (nullable && value === null) return null;
	if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
		return undefined;
	}
	return value;
}

function boundedScore(value: unknown): number | null | undefined {
	if (value === null) return null;
	return typeof value === 'number' && Number.isInteger(value) && challengeScores.has(value)
		? value
		: undefined;
}

function safeEntry(value: unknown, nowMs: number): ChallengeProgressEntry | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const candidate = value as Partial<ChallengeProgressEntry>;
	if (
		!isTimestamp(candidate.startedAt) ||
		!isTimestamp(candidate.updatedAt) ||
		(candidate.completedAt !== null && !isTimestamp(candidate.completedAt)) ||
		!challengeStages.has(candidate.lastStage as ChallengeProgressEntry['lastStage'])
	) {
		return null;
	}

	const startedAtMs = Date.parse(candidate.startedAt);
	const updatedAtMs = Date.parse(candidate.updatedAt);
	const completedAtMs = candidate.completedAt === null ? null : Date.parse(candidate.completedAt);
	const latestAllowedTimestamp = nowMs + CHALLENGE_PROGRESS_FUTURE_TOLERANCE_MS;
	if (
		updatedAtMs < startedAtMs ||
		(completedAtMs !== null && completedAtMs > updatedAtMs) ||
		startedAtMs > latestAllowedTimestamp ||
		updatedAtMs > latestAllowedTimestamp ||
		(completedAtMs !== null && completedAtMs > latestAllowedTimestamp) ||
		(candidate.lastStage === 'complete' && completedAtMs === null)
	) {
		return null;
	}

	const plays = boundedInteger(candidate.plays, { min: 1, max: 1_000_000 });
	const bestScore = boundedScore(candidate.bestScore);
	const bestTimeMs = boundedInteger(candidate.bestTimeMs, {
		min: 0,
		max: 21_600_000,
		nullable: true
	});
	const lastScore = boundedScore(candidate.lastScore);
	const lastTimeMs = boundedInteger(candidate.lastTimeMs, {
		min: 0,
		max: 21_600_000,
		nullable: true
	});
	if (
		plays === undefined ||
		plays === null ||
		bestScore === undefined ||
		bestTimeMs === undefined ||
		lastScore === undefined ||
		lastTimeMs === undefined
	) {
		return null;
	}
	if (
		(bestScore === null && bestTimeMs !== null) ||
		(lastScore === null && lastTimeMs !== null) ||
		(lastScore !== null && (bestScore === null || bestScore < lastScore))
	) {
		return null;
	}

	return {
		startedAt: new Date(candidate.startedAt).toISOString(),
		updatedAt: new Date(candidate.updatedAt).toISOString(),
		completedAt:
			candidate.completedAt === null ? null : new Date(candidate.completedAt).toISOString(),
		plays,
		lastStage: candidate.lastStage as ChallengeProgressEntry['lastStage'],
		bestScore,
		bestTimeMs,
		lastScore,
		lastTimeMs
	};
}

function safeProgress(value: unknown): ChallengeProgress {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyProgress();
	const candidate = value as Partial<ChallengeProgress>;
	if (
		candidate.version !== 2 ||
		!candidate.challenges ||
		typeof candidate.challenges !== 'object' ||
		Array.isArray(candidate.challenges)
	) {
		return emptyProgress();
	}

	const challenges: Record<string, ChallengeProgressEntry> = {};
	const nowMs = Date.now();
	for (const [challengeId, value] of Object.entries(candidate.challenges)) {
		if (!challengeIds.has(challengeId)) continue;
		const entry = safeEntry(value, nowMs);
		if (entry) challenges[challengeId] = entry;
		if (Object.keys(challenges).length >= CHALLENGE_PROGRESS_MAX_ENTRIES) break;
	}
	return { version: 2, challenges };
}

function progressFromRows(rows: ChallengeProgressRow[]): ChallengeProgress {
	return safeProgress({
		version: 2,
		challenges: Object.fromEntries(
			rows.map((row) => [
				row.challenge_id,
				{
					startedAt: row.started_at,
					updatedAt: row.updated_at,
					completedAt: row.completed_at,
					plays: row.plays,
					lastStage: row.last_stage,
					bestScore: row.best_score,
					bestTimeMs: row.best_time_ms,
					lastScore: row.last_score,
					lastTimeMs: row.last_time_ms
				}
			])
		)
	});
}

export async function getUserChallengeProgress(userId: string): Promise<ChallengeProgress> {
	const knownChallengeIds = [...challengeIds];
	const knownChallengePlaceholders = knownChallengeIds.map(() => '?').join(', ');
	const rows = await queryPersonalRows<ChallengeProgressRow>(
		`SELECT challenge_id, started_at, updated_at, completed_at, plays, last_stage,
		        best_score, best_time_ms, last_score, last_time_ms
		   FROM user_challenge_progress
		  WHERE user_id = ?
		    AND challenge_id IN (${knownChallengePlaceholders})
		  ORDER BY updated_at DESC
		  LIMIT ?`,
		[userId, ...knownChallengeIds, CHALLENGE_PROGRESS_MAX_ENTRIES]
	);
	return progressFromRows(rows);
}

export async function mergeUserChallengeProgress(
	userId: string,
	incoming: ChallengeProgress
): Promise<ChallengeProgress> {
	const safeIncoming = safeProgress(incoming);
	const incomingIds = Object.keys(safeIncoming.challenges);
	if (incomingIds.length === 0) return await getUserChallengeProgress(userId);

	const current = await getUserChallengeProgress(userId);
	const merged = mergeChallengeProgress(current, safeIncoming);

	try {
		for (const challengeId of incomingIds) {
			const entry = merged.challenges[challengeId];
			if (!entry) continue;
			await executePersonalQuery(
				`INSERT INTO user_challenge_progress (
			   user_id, challenge_id, started_at, updated_at, completed_at, plays,
			   last_stage, best_score, best_time_ms, last_score, last_time_ms
			 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(user_id, challenge_id) DO UPDATE SET
			   started_at = MIN(user_challenge_progress.started_at, excluded.started_at),
			   updated_at = MAX(user_challenge_progress.updated_at, excluded.updated_at),
			   completed_at = CASE
			     WHEN user_challenge_progress.completed_at IS NULL THEN excluded.completed_at
			     WHEN excluded.completed_at IS NULL THEN user_challenge_progress.completed_at
			     ELSE MIN(user_challenge_progress.completed_at, excluded.completed_at)
			   END,
			   plays = MAX(user_challenge_progress.plays, excluded.plays),
			   best_score = CASE
			     WHEN user_challenge_progress.best_score IS NULL THEN excluded.best_score
			     WHEN excluded.best_score IS NULL THEN user_challenge_progress.best_score
			     ELSE MAX(user_challenge_progress.best_score, excluded.best_score)
			   END,
			   best_time_ms = CASE
			     WHEN user_challenge_progress.best_score IS NULL THEN excluded.best_time_ms
			     WHEN excluded.best_score IS NULL THEN user_challenge_progress.best_time_ms
			     WHEN excluded.best_score > user_challenge_progress.best_score
			       THEN excluded.best_time_ms
			     WHEN excluded.best_score < user_challenge_progress.best_score
			       THEN user_challenge_progress.best_time_ms
			     WHEN user_challenge_progress.best_time_ms IS NULL THEN excluded.best_time_ms
			     WHEN excluded.best_time_ms IS NULL THEN user_challenge_progress.best_time_ms
			     ELSE MIN(user_challenge_progress.best_time_ms, excluded.best_time_ms)
			   END,
			   last_stage = CASE
			     WHEN excluded.updated_at > user_challenge_progress.updated_at
			       THEN excluded.last_stage
			     WHEN excluded.updated_at < user_challenge_progress.updated_at
			       THEN user_challenge_progress.last_stage
			     WHEN json_array(excluded.last_stage, excluded.last_score, excluded.last_time_ms)
			       > json_array(
			           user_challenge_progress.last_stage,
			           user_challenge_progress.last_score,
			           user_challenge_progress.last_time_ms
			         )
			       THEN excluded.last_stage
			     ELSE user_challenge_progress.last_stage
			   END,
			   last_score = CASE
			     WHEN excluded.updated_at > user_challenge_progress.updated_at
			       THEN excluded.last_score
			     WHEN excluded.updated_at < user_challenge_progress.updated_at
			       THEN user_challenge_progress.last_score
			     WHEN json_array(excluded.last_stage, excluded.last_score, excluded.last_time_ms)
			       > json_array(
			           user_challenge_progress.last_stage,
			           user_challenge_progress.last_score,
			           user_challenge_progress.last_time_ms
			         )
			       THEN excluded.last_score
			     ELSE user_challenge_progress.last_score
			   END,
			   last_time_ms = CASE
			     WHEN excluded.updated_at > user_challenge_progress.updated_at
			       THEN excluded.last_time_ms
			     WHEN excluded.updated_at < user_challenge_progress.updated_at
			       THEN user_challenge_progress.last_time_ms
			     WHEN json_array(excluded.last_stage, excluded.last_score, excluded.last_time_ms)
			       > json_array(
			           user_challenge_progress.last_stage,
			           user_challenge_progress.last_score,
			           user_challenge_progress.last_time_ms
			         )
			       THEN excluded.last_time_ms
			     ELSE user_challenge_progress.last_time_ms
			   END`,
				[
					userId,
					challengeId,
					entry.startedAt,
					entry.updatedAt,
					entry.completedAt,
					entry.plays,
					entry.lastStage,
					entry.bestScore,
					entry.bestTimeMs,
					entry.lastScore,
					entry.lastTimeMs
				]
			);
		}
	} catch (error) {
		await invalidateUserHomeSnapshotForRepair(userId);
		throw error;
	}

	const stored = await getUserChallengeProgress(userId);
	try {
		await updateUserHomeSnapshotChallengeProjection(userId, stored);
	} catch {
		// Challenge progress is authoritative even if an optional cached home
		// projection cannot be updated. The next snapshot refresh repairs it.
	}
	return stored;
}
