export type ChallengeLeaderboardEntry = {
	rank: number;
	alias: string;
	score: number;
	completed: number;
	isCurrentUser: boolean;
};

export type ChallengeLeaderboardSnapshot = {
	entries: ChallengeLeaderboardEntry[];
	currentUserEntry: ChallengeLeaderboardEntry | null;
	participantCount: number;
};

export type ChallengeLeaderboardProjection = {
	previousRank: number | null;
	projectedRank: number | null;
	rankImproved: boolean;
	nextRival: ChallengeLeaderboardEntry | null;
	pointsToNextRank: number | null;
};

export function emptyChallengeLeaderboard(): ChallengeLeaderboardSnapshot {
	return {
		entries: [],
		currentUserEntry: null,
		participantCount: 0
	};
}

export function nextChallengeScoreLandmark(score: number, interval = 500) {
	const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
	const safeInterval = Number.isFinite(interval) ? Math.max(1, Math.floor(interval)) : 500;
	const previous = Math.floor(safeScore / safeInterval) * safeInterval;
	const next = previous + safeInterval;

	return {
		previous,
		next,
		remaining: next - safeScore,
		progress: Math.min(1, Math.max(0, (safeScore - previous) / safeInterval))
	};
}

export function projectChallengeLeaderboard({
	snapshot,
	score,
	completed,
	includeCurrentUser
}: {
	snapshot: ChallengeLeaderboardSnapshot;
	score: number;
	completed: number;
	includeCurrentUser: boolean;
}): ChallengeLeaderboardProjection {
	const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
	const safeCompleted = Number.isFinite(completed) ? Math.max(0, Math.floor(completed)) : 0;
	const visibleEntries = [
		...snapshot.entries,
		...(snapshot.currentUserEntry ? [snapshot.currentUserEntry] : [])
	];
	const currentEntry = visibleEntries.find((entry) => entry.isCurrentUser) ?? null;
	const rivals = visibleEntries.filter((entry) => !entry.isCurrentUser);
	const previousRank =
		currentEntry?.rank ??
		(includeCurrentUser && snapshot.participantCount <= rivals.length
			? snapshot.participantCount + 1
			: null);
	const completeRankingVisible =
		includeCurrentUser && snapshot.participantCount <= rivals.length + (currentEntry ? 1 : 0);
	const hasIndeterminateTie = rivals.some(
		(entry) => entry.score === safeScore && entry.completed === safeCompleted
	);
	const projectedRank =
		completeRankingVisible && !hasIndeterminateTie
			? 1 +
				rivals.filter(
					(entry) =>
						entry.score > safeScore ||
						(entry.score === safeScore && entry.completed > safeCompleted)
				).length
			: null;
	const nextRival =
		rivals
			.filter((entry) => entry.score > safeScore)
			.sort((a, b) => a.score - b.score || b.rank - a.rank)[0] ?? null;

	return {
		previousRank,
		projectedRank,
		rankImproved: Boolean(
			previousRank !== null && projectedRank !== null && projectedRank < previousRank
		),
		nextRival,
		pointsToNextRank: nextRival ? nextRival.score - safeScore : null
	};
}
