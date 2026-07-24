import type {
	ChallengeLeaderboardEntry,
	ChallengeLeaderboardSnapshot
} from '$lib/challenges/leaderboard';
import { queryPersonalRows } from '$lib/server/db';

const aliasAdjectives = [
	'Amber',
	'Bright',
	'Calm',
	'Copper',
	'Curious',
	'Deep',
	'Electric',
	'Green',
	'Hidden',
	'Keen',
	'Lucid',
	'Mint',
	'North',
	'Open',
	'Quiet',
	'Rapid',
	'Ready',
	'Silver',
	'Solar',
	'Steady',
	'Swift',
	'True',
	'Vivid'
] as const;

const aliasNouns = [
	'Comet',
	'Falcon',
	'Fox',
	'Kite',
	'Lantern',
	'Lynx',
	'Meteor',
	'Nova',
	'Orbit',
	'Owl',
	'Pilot',
	'Pioneer',
	'Pulse',
	'Raven',
	'Rocket',
	'Signal',
	'Spark',
	'Star',
	'Vector',
	'Venture',
	'Voyager'
] as const;

type LeaderboardRow = {
	user_id: string;
	total_score: number;
	completed_count: number;
	rank: number;
	participant_count: number;
};

export async function challengeLeaderboardAlias(userId: string): Promise<string> {
	const payload = new TextEncoder().encode(`question-constellation:challenge-board:v1:${userId}`);
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', payload));
	const adjective = aliasAdjectives[(digest[0] ?? 0) % aliasAdjectives.length];
	const noun = aliasNouns[(digest[1] ?? 0) % aliasNouns.length];
	return `${adjective} ${noun}`;
}

export async function getChallengeLeaderboard({
	challengeIds,
	currentUserId = null,
	limit = 5
}: {
	challengeIds: readonly string[];
	currentUserId?: string | null;
	limit?: number;
}): Promise<ChallengeLeaderboardSnapshot> {
	const ids = [...new Set(challengeIds.map((id) => id.trim()).filter(Boolean))];
	const safeLimit = Math.min(10, Math.max(3, Math.floor(limit)));
	if (ids.length === 0) {
		return { entries: [], currentUserEntry: null, participantCount: 0 };
	}

	const placeholders = ids.map(() => '?').join(', ');
	const normalizedCurrentUserId = currentUserId?.trim() ?? '';
	const rows = await queryPersonalRows<LeaderboardRow>(
		`WITH learner_scores AS (
		   SELECT user_id,
		          SUM(best_score) AS total_score,
		          COUNT(*) AS completed_count
		     FROM user_challenge_progress
		    WHERE best_score IS NOT NULL
		      AND challenge_id IN (${placeholders})
		    GROUP BY user_id
		 ),
		 ranked AS (
		   SELECT user_id,
		          total_score,
		          completed_count,
		          ROW_NUMBER() OVER (
		            ORDER BY total_score DESC, completed_count DESC, user_id ASC
		          ) AS rank,
		          COUNT(*) OVER () AS participant_count
		     FROM learner_scores
		 )
		 SELECT user_id, total_score, completed_count, rank, participant_count
		   FROM ranked
		  WHERE rank <= ? OR user_id = ?
		  ORDER BY rank ASC
		  LIMIT ?`,
		[...ids, safeLimit, normalizedCurrentUserId, safeLimit + 1]
	);

	const mapped = await Promise.all(
		rows.map(async (row): Promise<(ChallengeLeaderboardEntry & { userId: string }) | null> => {
			const userId = typeof row.user_id === 'string' ? row.user_id.trim() : '';
			const rank = boundedPositiveInteger(row.rank);
			const score = boundedNonNegativeInteger(row.total_score);
			const completed = boundedPositiveInteger(row.completed_count);
			if (!userId || rank === null || score === null || completed === null) return null;

			return {
				userId,
				rank,
				alias: await challengeLeaderboardAlias(userId),
				score,
				completed,
				isCurrentUser: Boolean(normalizedCurrentUserId && userId === normalizedCurrentUserId)
			};
		})
	);
	const valid = mapped.filter(
		(entry): entry is ChallengeLeaderboardEntry & { userId: string } => entry !== null
	);
	const participantCount =
		rows.length > 0 ? (boundedNonNegativeInteger(rows[0]?.participant_count) ?? 0) : 0;
	const entries = valid.filter((entry) => entry.rank <= safeLimit).map(toPublicLeaderboardEntry);
	const currentOutsideBoard = valid.find((entry) => entry.isCurrentUser && entry.rank > safeLimit);

	return {
		entries,
		currentUserEntry: currentOutsideBoard ? toPublicLeaderboardEntry(currentOutsideBoard) : null,
		participantCount
	};
}

function toPublicLeaderboardEntry(
	entry: ChallengeLeaderboardEntry & { userId: string }
): ChallengeLeaderboardEntry {
	return {
		rank: entry.rank,
		alias: entry.alias,
		score: entry.score,
		completed: entry.completed,
		isCurrentUser: entry.isCurrentUser
	};
}

function boundedPositiveInteger(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1_000_000
		? value
		: null;
}

function boundedNonNegativeInteger(value: unknown): number | null {
	return typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= 0 &&
		value <= 1_000_000_000
		? value
		: null;
}
