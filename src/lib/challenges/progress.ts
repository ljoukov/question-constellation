export const LEGACY_CHALLENGE_PROGRESS_STORAGE_KEY = 'question-constellation.challenge-progress.v1';
export const CHALLENGE_PROGRESS_V1_STORAGE_KEY = LEGACY_CHALLENGE_PROGRESS_STORAGE_KEY;
export const CHALLENGE_PROGRESS_GUEST_STORAGE_KEY =
	'question-constellation.challenge-progress.v2:guest';
/** Backwards-compatible name used by guest catalogue storage listeners. */
export const CHALLENGE_PROGRESS_STORAGE_KEY = CHALLENGE_PROGRESS_GUEST_STORAGE_KEY;

const challengeProgressUserStoragePrefix = 'question-constellation.challenge-progress.v2:user:';
const stages = ['showdown', 'diagnose', 'repair', 'transfer', 'complete'] as const;
const maxChallengeDurationMs = 6 * 60 * 60 * 1000;
const completionBaseScore = 400;
const challengeScoreValues = new Set([400, 425, 450, 475, 500]);

export type ChallengeProgressStage = (typeof stages)[number];

export type ChallengeProgressEntry = {
	startedAt: string;
	updatedAt: string;
	completedAt: string | null;
	plays: number;
	lastStage: ChallengeProgressStage;
	bestScore: number | null;
	bestTimeMs: number | null;
	lastScore: number | null;
	lastTimeMs: number | null;
};

export type ChallengeProgress = {
	version: 2;
	challenges: Record<string, ChallengeProgressEntry>;
};

type LegacyChallengeProgressEntry = {
	startedAt: string;
	completedAt: string | null;
	plays: number;
	lastStage: ChallengeProgressStage;
};

type LegacyChallengeProgress = {
	version: 1;
	challenges: Record<string, LegacyChallengeProgressEntry>;
};

type ReadableStorage = Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'setItem' | 'removeItem'>>;
type ChallengeProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyChallengeProgress(): ChallengeProgress {
	return {
		version: 2,
		challenges: {}
	};
}

export function challengeProgressStorageKey(userId?: string | null): string {
	const normalizedUserId = userId?.trim();
	return normalizedUserId
		? `${challengeProgressUserStoragePrefix}${encodeURIComponent(normalizedUserId)}`
		: CHALLENGE_PROGRESS_GUEST_STORAGE_KEY;
}

function isStage(value: unknown): value is ChallengeProgressStage {
	return stages.includes(value as ChallengeProgressStage);
}

function isTimestamp(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0) return false;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function parsedScore(value: unknown): number | null | undefined {
	if (value === null) return null;
	return typeof value === 'number' && Number.isInteger(value) && challengeScoreValues.has(value)
		? value
		: undefined;
}

function parsedDuration(value: unknown): number | null | undefined {
	if (value === null) return null;
	return typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= 0 &&
		value <= maxChallengeDurationMs
		? value
		: undefined;
}

function score(value: unknown): number | null {
	return parsedScore(value) ?? null;
}

function duration(value: unknown): number | null {
	return parsedDuration(value) ?? null;
}

function plays(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1_000_000
		? value
		: null;
}

function parseVersionTwo(parsed: Record<string, unknown>): ChallengeProgress | null {
	if (parsed.version !== 2 || !parsed.challenges || typeof parsed.challenges !== 'object') {
		return null;
	}

	const challenges: Record<string, ChallengeProgressEntry> = {};
	for (const [id, value] of Object.entries(parsed.challenges)) {
		if (!id || !value || typeof value !== 'object' || Array.isArray(value)) continue;
		const candidate = value as Partial<ChallengeProgressEntry>;
		const parsedPlays = plays(candidate.plays);
		const parsedBestScore = parsedScore(candidate.bestScore);
		const parsedBestTimeMs = parsedDuration(candidate.bestTimeMs);
		const parsedLastScore = parsedScore(candidate.lastScore);
		const parsedLastTimeMs = parsedDuration(candidate.lastTimeMs);
		if (
			!isTimestamp(candidate.startedAt) ||
			!isTimestamp(candidate.updatedAt) ||
			(candidate.completedAt !== null && !isTimestamp(candidate.completedAt)) ||
			parsedPlays === null ||
			!isStage(candidate.lastStage) ||
			parsedBestScore === undefined ||
			parsedBestTimeMs === undefined ||
			parsedLastScore === undefined ||
			parsedLastTimeMs === undefined
		) {
			continue;
		}

		const startedAtMs = Date.parse(candidate.startedAt);
		const updatedAtMs = Date.parse(candidate.updatedAt);
		const completedAtMs = candidate.completedAt === null ? null : Date.parse(candidate.completedAt);
		if (
			updatedAtMs < startedAtMs ||
			(completedAtMs !== null && completedAtMs > updatedAtMs) ||
			(candidate.lastStage === 'complete' && completedAtMs === null) ||
			(parsedBestScore === null && parsedBestTimeMs !== null) ||
			(parsedLastScore === null && parsedLastTimeMs !== null) ||
			(parsedLastScore !== null && (parsedBestScore === null || parsedBestScore < parsedLastScore))
		) {
			continue;
		}

		const hasCompleted = candidate.completedAt !== null;
		const needsLegacyCompletionScore =
			hasCompleted && parsedBestScore === null && parsedLastScore === null;
		const bestScore = needsLegacyCompletionScore ? completionBaseScore : parsedBestScore;
		const lastScore = needsLegacyCompletionScore ? completionBaseScore : parsedLastScore;
		challenges[id] = {
			startedAt: candidate.startedAt,
			updatedAt: candidate.updatedAt,
			completedAt: candidate.completedAt ?? null,
			plays: parsedPlays,
			lastStage: candidate.lastStage,
			bestScore,
			bestTimeMs: bestScore === null ? null : parsedBestTimeMs,
			lastScore,
			lastTimeMs: lastScore === null ? null : parsedLastTimeMs
		};
	}
	return { version: 2, challenges };
}

function migrateVersionOne(parsed: Record<string, unknown>): ChallengeProgress | null {
	if (parsed.version !== 1 || !parsed.challenges || typeof parsed.challenges !== 'object') {
		return null;
	}

	const legacy = parsed as unknown as Partial<LegacyChallengeProgress>;
	const challenges: Record<string, ChallengeProgressEntry> = {};
	for (const [id, value] of Object.entries(legacy.challenges ?? {})) {
		if (!id || !value || typeof value !== 'object' || Array.isArray(value)) continue;
		const candidate = value as Partial<LegacyChallengeProgressEntry>;
		const parsedPlays = plays(candidate.plays);
		if (
			!isTimestamp(candidate.startedAt) ||
			(candidate.completedAt !== null && !isTimestamp(candidate.completedAt)) ||
			parsedPlays === null ||
			!isStage(candidate.lastStage)
		) {
			continue;
		}
		const completedAt = candidate.completedAt ?? null;
		const completionScore = completedAt ? completionBaseScore : null;
		challenges[id] = {
			startedAt: candidate.startedAt,
			updatedAt: completedAt ?? candidate.startedAt,
			completedAt,
			plays: parsedPlays,
			lastStage: candidate.lastStage,
			bestScore: completionScore,
			bestTimeMs: null,
			lastScore: completionScore,
			lastTimeMs: null
		};
	}
	return { version: 2, challenges };
}

export function parseChallengeProgress(raw: string | null | undefined): ChallengeProgress {
	if (!raw) return emptyChallengeProgress();

	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return emptyChallengeProgress();
		}
		return (
			parseVersionTwo(parsed as Record<string, unknown>) ??
			migrateVersionOne(parsed as Record<string, unknown>) ??
			emptyChallengeProgress()
		);
	} catch {
		return emptyChallengeProgress();
	}
}

export function readChallengeProgress(
	storage?: ReadableStorage,
	userId?: string | null
): ChallengeProgress {
	if (!storage) return emptyChallengeProgress();
	try {
		const currentRaw = storage.getItem(challengeProgressStorageKey(userId));
		if (currentRaw !== null) return parseChallengeProgress(currentRaw);
		if (userId) return emptyChallengeProgress();

		const legacyRaw = storage.getItem(LEGACY_CHALLENGE_PROGRESS_STORAGE_KEY);
		const migrated = parseChallengeProgress(legacyRaw);
		if (legacyRaw !== null && storage.setItem) {
			storage.setItem(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY, JSON.stringify(migrated));
		}
		return migrated;
	} catch {
		return emptyChallengeProgress();
	}
}

export function writeChallengeProgress(
	progress: ChallengeProgress,
	storage?: Pick<Storage, 'setItem'>,
	userId?: string | null
): void {
	if (!storage) return;
	try {
		storage.setItem(challengeProgressStorageKey(userId), JSON.stringify(progress));
	} catch {
		// Challenge progress is enhancement-only when browser storage is unavailable.
	}
}

/**
 * Reconciles an in-memory snapshot with both a newly observed snapshot and the
 * latest value in shared browser storage before writing. This prevents a stale
 * tab from replacing progress another tab recorded after it was opened.
 */
export function mergeStoredChallengeProgress({
	progress,
	incomingProgress,
	storage,
	userId
}: {
	progress: ChallengeProgress;
	incomingProgress?: ChallengeProgress | null;
	storage?: ChallengeProgressStorage;
	userId?: string | null;
}): ChallengeProgress {
	const stored = readChallengeProgress(storage, userId);
	const merged = mergeChallengeProgress(
		progress,
		mergeChallengeProgress(incomingProgress ?? emptyChallengeProgress(), stored)
	);
	writeChallengeProgress(merged, storage, userId);
	return merged;
}

export function clearGuestChallengeProgress(storage?: Pick<Storage, 'removeItem'>): void {
	if (!storage) return;
	try {
		storage.removeItem(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY);
		storage.removeItem(LEGACY_CHALLENGE_PROGRESS_STORAGE_KEY);
	} catch {
		// A confirmed server import remains authoritative if browser cleanup is blocked.
	}
}

function timestampMs(value: string): number {
	return Date.parse(value);
}

function earlierTimestamp(left: string, right: string): string {
	return timestampMs(left) <= timestampMs(right) ? left : right;
}

function laterTimestamp(left: string, right: string): string {
	return timestampMs(left) >= timestampMs(right) ? left : right;
}

function shortestDuration(left: number | null, right: number | null): number | null {
	if (left === null) return right;
	if (right === null) return left;
	return Math.min(left, right);
}

function bestResult(
	left: ChallengeProgressEntry,
	right: ChallengeProgressEntry
): Pick<ChallengeProgressEntry, 'bestScore' | 'bestTimeMs'> {
	if (left.bestScore === null && right.bestScore === null) {
		return { bestScore: null, bestTimeMs: null };
	}
	if (left.bestScore === null) {
		return { bestScore: right.bestScore, bestTimeMs: right.bestTimeMs };
	}
	if (right.bestScore === null) {
		return { bestScore: left.bestScore, bestTimeMs: left.bestTimeMs };
	}
	if (left.bestScore > right.bestScore) {
		return { bestScore: left.bestScore, bestTimeMs: left.bestTimeMs };
	}
	if (right.bestScore > left.bestScore) {
		return { bestScore: right.bestScore, bestTimeMs: right.bestTimeMs };
	}
	return {
		bestScore: left.bestScore,
		bestTimeMs: shortestDuration(left.bestTimeMs, right.bestTimeMs)
	};
}

function lastResultSignature(entry: ChallengeProgressEntry): string {
	// This is also the tie-break used by the D1 upsert. It intentionally makes
	// equal timestamps deterministic even when the server canonicalizes a
	// transient last-result tuple differently from the submitting browser.
	return JSON.stringify([entry.lastStage, entry.lastScore, entry.lastTimeMs]);
}

function latestEntry(
	left: ChallengeProgressEntry,
	right: ChallengeProgressEntry
): ChallengeProgressEntry {
	const leftUpdatedAt = timestampMs(left.updatedAt);
	const rightUpdatedAt = timestampMs(right.updatedAt);
	if (leftUpdatedAt > rightUpdatedAt) return left;
	if (rightUpdatedAt > leftUpdatedAt) return right;
	return lastResultSignature(left) >= lastResultSignature(right) ? left : right;
}

function mergeEntry(
	left: ChallengeProgressEntry,
	right: ChallengeProgressEntry
): ChallengeProgressEntry {
	const latest = latestEntry(left, right);
	const best = bestResult(left, right);
	const completedAt =
		left.completedAt && right.completedAt
			? earlierTimestamp(left.completedAt, right.completedAt)
			: (left.completedAt ?? right.completedAt);
	return {
		startedAt: earlierTimestamp(left.startedAt, right.startedAt),
		updatedAt: laterTimestamp(left.updatedAt, right.updatedAt),
		completedAt,
		plays: Math.max(left.plays, right.plays),
		lastStage: latest.lastStage,
		bestScore: best.bestScore,
		bestTimeMs: best.bestTimeMs,
		lastScore: latest.lastScore,
		lastTimeMs: latest.lastTimeMs
	};
}

/**
 * A commutative, idempotent merge. Retrying the same client payload can never
 * inflate play counts or replace a stronger personal best.
 */
export function mergeChallengeProgress(
	left: ChallengeProgress,
	right: ChallengeProgress
): ChallengeProgress {
	const challenges: Record<string, ChallengeProgressEntry> = {};
	const ids = new Set([...Object.keys(left.challenges), ...Object.keys(right.challenges)]);
	for (const id of [...ids].sort()) {
		const leftEntry = left.challenges[id];
		const rightEntry = right.challenges[id];
		challenges[id] =
			leftEntry && rightEntry ? mergeEntry(leftEntry, rightEntry) : (leftEntry ?? rightEntry);
	}
	return { version: 2, challenges };
}

export function updateChallengeProgress({
	progress,
	challengeId,
	stage,
	now = new Date(),
	newPlay = false,
	score: completedScore,
	durationMs
}: {
	progress: ChallengeProgress;
	challengeId: string;
	stage: ChallengeProgressStage;
	now?: Date;
	newPlay?: boolean;
	score?: number;
	durationMs?: number;
}): ChallengeProgress {
	const current = progress.challenges[challengeId];
	const timestamp = now.toISOString();
	const startsFreshPlay = Boolean(current && newPlay);
	const nextScore = stage === 'complete' ? score(completedScore) : null;
	const nextDuration = stage === 'complete' && nextScore !== null ? duration(durationMs) : null;
	const nextBest =
		stage === 'complete'
			? bestResult(
					current ?? {
						startedAt: timestamp,
						updatedAt: timestamp,
						completedAt: null,
						plays: 1,
						lastStage: stage,
						bestScore: null,
						bestTimeMs: null,
						lastScore: null,
						lastTimeMs: null
					},
					{
						startedAt: timestamp,
						updatedAt: timestamp,
						completedAt: timestamp,
						plays: 1,
						lastStage: stage,
						bestScore: nextScore,
						bestTimeMs: nextDuration,
						lastScore: nextScore,
						lastTimeMs: nextDuration
					}
				)
			: {
					bestScore: current?.bestScore ?? null,
					bestTimeMs: current?.bestTimeMs ?? null
				};

	const entry: ChallengeProgressEntry = current
		? {
				...current,
				startedAt: startsFreshPlay ? timestamp : current.startedAt,
				updatedAt: timestamp,
				plays: current.plays + (startsFreshPlay ? 1 : 0),
				lastStage: stage,
				completedAt:
					stage === 'complete' ? (current.completedAt ?? timestamp) : current.completedAt,
				bestScore: nextBest.bestScore,
				bestTimeMs: nextBest.bestTimeMs,
				lastScore: stage === 'complete' ? nextScore : current.lastScore,
				lastTimeMs: stage === 'complete' ? nextDuration : current.lastTimeMs
			}
		: {
				startedAt: timestamp,
				updatedAt: timestamp,
				completedAt: stage === 'complete' ? timestamp : null,
				plays: 1,
				lastStage: stage,
				bestScore: nextBest.bestScore,
				bestTimeMs: nextBest.bestTimeMs,
				lastScore: stage === 'complete' ? nextScore : null,
				lastTimeMs: stage === 'complete' ? nextDuration : null
			};

	return {
		version: 2,
		challenges: {
			...progress.challenges,
			[challengeId]: entry
		}
	};
}

/**
 * Applies one game update to the union of the active tab, its latest prop and
 * shared storage. Callers should use the returned document as their next
 * in-memory snapshot.
 */
export function updateStoredChallengeProgress({
	progress,
	incomingProgress,
	storage,
	userId,
	...update
}: Omit<Parameters<typeof updateChallengeProgress>[0], 'progress'> & {
	progress: ChallengeProgress;
	incomingProgress?: ChallengeProgress | null;
	storage?: ChallengeProgressStorage;
	userId?: string | null;
}): ChallengeProgress {
	const stored = readChallengeProgress(storage, userId);
	const reconciled = mergeChallengeProgress(
		progress,
		mergeChallengeProgress(incomingProgress ?? emptyChallengeProgress(), stored)
	);
	const next = updateChallengeProgress({ progress: reconciled, ...update });
	writeChallengeProgress(next, storage, userId);
	return next;
}

export type ChallengeScoreInput = {
	showdownFirstTryCorrect: boolean;
	diagnosisFirstTryCorrect: boolean;
	repairFirstTryCorrect: boolean;
	transferFirstTryCorrect: boolean;
};

export function calculateChallengeScore(result: ChallengeScoreInput): number {
	const bonuses = [
		result.showdownFirstTryCorrect,
		result.diagnosisFirstTryCorrect,
		result.repairFirstTryCorrect,
		result.transferFirstTryCorrect
	].filter(Boolean).length;
	return Math.min(500, 400 + bonuses * 25);
}

export function completedChallengeIds(progress: ChallengeProgress): Set<string> {
	return new Set(
		Object.entries(progress.challenges)
			.filter(([, entry]) => Boolean(entry.completedAt))
			.map(([id]) => id)
	);
}

export function challengeProgressTotals(progress: ChallengeProgress): {
	completedCount: number;
	totalBestScore: number;
} {
	const entries = Object.values(progress.challenges);
	return {
		completedCount: entries.filter((entry) => entry.completedAt !== null).length,
		totalBestScore: entries.reduce((total, entry) => total + (entry.bestScore ?? 0), 0)
	};
}

export const progressTotals = challengeProgressTotals;
