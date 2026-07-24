import { CHALLENGE_INTERLUDE_SCORE, type ChallengeInterludeMechanic } from './challengeInterludes';

export const CHALLENGE_SESSION_STORAGE_KEY = 'question-constellation.challenge-session.v1';
export const CHALLENGE_SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1_000;
export const CHALLENGE_ROUNDS_PER_ORBIT = 3;

const canonicalChallengeScores = [400, 425, 450, 475, 500] as const;
const interludeMechanics = [
	'faded-examiner',
	'chain-echo',
	'evidence-sweep',
	'weakness-lens',
	'link-order',
	'reason-match'
] as const satisfies readonly ChallengeInterludeMechanic[];

const interludeOrbitPalettes = [
	['faded-examiner', 'chain-echo', 'reason-match'],
	['weakness-lens', 'link-order', 'evidence-sweep']
] as const satisfies readonly (readonly ChallengeInterludeMechanic[])[];

export type CanonicalChallengeScore = (typeof canonicalChallengeScores)[number];
export type { ChallengeInterludeMechanic } from './challengeInterludes';

export type ChallengeSessionRound = {
	challengeId: string;
	score: CanonicalChallengeScore;
	completedAt: string;
	interludeMechanic?: ChallengeInterludeMechanic;
	interludeScore?: number;
	interludeCompletedAt?: string;
};

export type ChallengeSessionState = {
	version: 1;
	startedAt: string | null;
	updatedAt: string | null;
	rounds: ChallengeSessionRound[];
};

export type ChallengeSessionTotals = {
	challengeCount: number;
	interludeCount: number;
	totalScore: number;
	currentOrbitNumber: number;
	currentOrbitPosition: number;
	orbitComplete: boolean;
};

export type ReadableChallengeSessionStorage = {
	getItem(key: string): string | null;
};

export type WritableChallengeSessionStorage = {
	setItem(key: string, value: string): void;
};

type TimestampInput = string | Date;

export function emptyChallengeSession(): ChallengeSessionState {
	return {
		version: 1,
		startedAt: null,
		updatedAt: null,
		rounds: []
	};
}

export function isCanonicalChallengeScore(value: unknown): value is CanonicalChallengeScore {
	return canonicalChallengeScores.includes(value as CanonicalChallengeScore);
}

export function parseChallengeSession(
	raw: string | null | undefined,
	now: number | Date = Date.now()
): ChallengeSessionState {
	if (!raw) return emptyChallengeSession();

	try {
		const normalizedNow = timestampMilliseconds(now);
		if (normalizedNow === null) return emptyChallengeSession();
		const parsed = JSON.parse(raw) as unknown;
		return normalizeChallengeSession(parsed, normalizedNow, true) ?? emptyChallengeSession();
	} catch {
		return emptyChallengeSession();
	}
}

export function readChallengeSession(
	storage?: ReadableChallengeSessionStorage,
	now: number | Date = Date.now()
): ChallengeSessionState {
	if (!storage) return emptyChallengeSession();

	try {
		return parseChallengeSession(storage.getItem(CHALLENGE_SESSION_STORAGE_KEY), now);
	} catch {
		return emptyChallengeSession();
	}
}

export function writeChallengeSession(
	session: ChallengeSessionState,
	storage?: WritableChallengeSessionStorage
): void {
	if (!storage) return;

	try {
		const normalized =
			normalizeChallengeSession(session, sessionTimestampMilliseconds(session), false) ??
			emptyChallengeSession();
		storage.setItem(CHALLENGE_SESSION_STORAGE_KEY, JSON.stringify(normalized));
	} catch {
		// The challenge orbit remains playable when session storage is unavailable.
	}
}

export function recordChallengeRound({
	session,
	challengeId,
	score,
	completedAt = new Date()
}: {
	session: ChallengeSessionState;
	challengeId: string;
	score: number;
	completedAt?: TimestampInput;
}): ChallengeSessionState {
	const timestamp = normalizedTimestamp(completedAt);
	const normalizedChallengeId = challengeId.trim();
	if (!timestamp || !normalizedChallengeId || !isCanonicalChallengeScore(score)) {
		return normalizedSessionWithoutExpiry(session);
	}

	const completedAtMs = Date.parse(timestamp);
	const activeSession =
		normalizeChallengeSession(session, completedAtMs, true) ?? emptyChallengeSession();
	const updatedAtMs = activeSession.updatedAt ? Date.parse(activeSession.updatedAt) : null;
	if (updatedAtMs !== null && completedAtMs < updatedAtMs) return activeSession;

	const pendingRound = activeSession.rounds.at(-1);
	if (
		pendingRound &&
		!pendingRound.interludeCompletedAt &&
		pendingRound.challengeId !== normalizedChallengeId
	) {
		return newChallengeSessionRound(normalizedChallengeId, score, timestamp);
	}

	const existingRoundIndex = activeSession.rounds.findIndex(
		(round) => round.challengeId === normalizedChallengeId
	);
	if (existingRoundIndex >= 0) {
		const rounds = activeSession.rounds.map((round, index) =>
			index === existingRoundIndex && score > round.score ? { ...round, score } : round
		);
		return {
			...activeSession,
			updatedAt: timestamp,
			rounds
		};
	}

	return {
		version: 1,
		startedAt: activeSession.startedAt ?? timestamp,
		updatedAt: timestamp,
		rounds: [
			...activeSession.rounds,
			{
				challengeId: normalizedChallengeId,
				score,
				completedAt: timestamp
			}
		]
	};
}

export function recordChallengeInterludeCompletion({
	session,
	challengeId,
	challengeScore,
	mechanic,
	score,
	interludeCompletedAt = new Date()
}: {
	session: ChallengeSessionState;
	challengeId: string;
	challengeScore: number;
	mechanic: ChallengeInterludeMechanic;
	score: number;
	interludeCompletedAt?: TimestampInput;
}): ChallengeSessionState {
	const attached = recordChallengeInterlude({
		session,
		challengeId,
		mechanic,
		score,
		interludeCompletedAt
	});
	const currentRound = attached.rounds.at(-1);
	if (
		currentRound?.challengeId === challengeId.trim() &&
		currentRound.interludeMechanic === mechanic &&
		currentRound.interludeCompletedAt
	) {
		return attached;
	}

	const timestamp = normalizedTimestamp(interludeCompletedAt);
	if (!timestamp || !isCanonicalChallengeScore(challengeScore)) return attached;
	const freshRound = recordChallengeRound({
		session: emptyChallengeSession(),
		challengeId,
		score: challengeScore,
		completedAt: timestamp
	});
	return recordChallengeInterlude({
		session: freshRound,
		challengeId,
		mechanic,
		score,
		interludeCompletedAt: timestamp
	});
}

export function recordChallengeInterlude({
	session,
	challengeId,
	mechanic,
	score,
	interludeCompletedAt = new Date()
}: {
	session: ChallengeSessionState;
	challengeId: string;
	mechanic: ChallengeInterludeMechanic;
	score: number;
	interludeCompletedAt?: TimestampInput;
}): ChallengeSessionState {
	const timestamp = normalizedTimestamp(interludeCompletedAt);
	const normalizedChallengeId = challengeId.trim();
	if (
		!timestamp ||
		!normalizedChallengeId ||
		!isInterludeMechanic(mechanic) ||
		!isInterludeScore(score)
	) {
		return normalizedSessionWithoutExpiry(session);
	}

	const completedAtMs = Date.parse(timestamp);
	const activeSession =
		normalizeChallengeSession(session, completedAtMs, true) ?? emptyChallengeSession();
	const updatedAtMs = activeSession.updatedAt ? Date.parse(activeSession.updatedAt) : null;
	if (updatedAtMs !== null && completedAtMs < updatedAtMs) return activeSession;

	const roundIndex = activeSession.rounds.findIndex(
		(round) => round.challengeId === normalizedChallengeId
	);
	if (roundIndex < 0) return activeSession;

	const round = activeSession.rounds[roundIndex];
	if (!round || completedAtMs < Date.parse(round.completedAt)) return activeSession;

	const rounds = activeSession.rounds.map((candidate, index) => {
		if (index !== roundIndex) return candidate;
		if (candidate.interludeCompletedAt) {
			return score > (candidate.interludeScore ?? 0)
				? { ...candidate, interludeScore: score }
				: candidate;
		}
		return {
			...candidate,
			interludeMechanic: mechanic,
			interludeScore: score,
			interludeCompletedAt: timestamp
		};
	});

	return {
		...activeSession,
		updatedAt: timestamp,
		rounds
	};
}

export function challengeSessionTotals(session: ChallengeSessionState): ChallengeSessionTotals {
	const normalized = normalizedSessionWithoutExpiry(session);
	const challengeCount = normalized.rounds.length;
	const interludeCount = normalized.rounds.filter((round) => round.interludeCompletedAt).length;
	const currentOrbitNumber =
		challengeCount === 0 ? 1 : Math.floor((challengeCount - 1) / CHALLENGE_ROUNDS_PER_ORBIT) + 1;
	const currentOrbitPosition =
		challengeCount === 0 ? 0 : ((challengeCount - 1) % CHALLENGE_ROUNDS_PER_ORBIT) + 1;
	const currentRound = normalized.rounds.at(-1);

	return {
		challengeCount,
		interludeCount,
		totalScore: normalized.rounds.reduce(
			(total, round) => total + round.score + (round.interludeScore ?? 0),
			0
		),
		currentOrbitNumber,
		currentOrbitPosition,
		orbitComplete:
			currentOrbitPosition === CHALLENGE_ROUNDS_PER_ORBIT &&
			Boolean(currentRound?.interludeCompletedAt)
	};
}

export function chooseAutomaticInterludeMechanic(
	score: number,
	history: readonly ChallengeSessionRound[] | Pick<ChallengeSessionState, 'rounds'> = []
): ChallengeInterludeMechanic {
	const rounds = Array.isArray(history)
		? history
		: (history as Pick<ChallengeSessionState, 'rounds'>).rounds;
	const orbitNumber =
		rounds.length === 0 ? 1 : Math.floor((rounds.length - 1) / CHALLENGE_ROUNDS_PER_ORBIT) + 1;
	const orbitPosition =
		rounds.length === 0 ? 1 : ((rounds.length - 1) % CHALLENGE_ROUNDS_PER_ORBIT) + 1;
	const palette = interludeOrbitPalettes[(orbitNumber - 1) % interludeOrbitPalettes.length];
	if (!palette || !isCanonicalChallengeScore(score)) return 'faded-examiner';
	if (score <= 425) return palette[0] ?? 'faded-examiner';
	return palette[orbitPosition - 1] ?? palette[0] ?? 'faded-examiner';
}

function normalizeChallengeSession(
	value: unknown,
	nowMs: number,
	enforceExpiry: boolean
): ChallengeSessionState | null {
	if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.rounds)) return null;

	if (value.startedAt === null && value.updatedAt === null && value.rounds.length === 0) {
		return emptyChallengeSession();
	}
	if (!isTimestamp(value.startedAt) || !isTimestamp(value.updatedAt)) return null;

	const startedAtMs = Date.parse(value.startedAt);
	const updatedAtMs = Date.parse(value.updatedAt);
	if (updatedAtMs < startedAtMs) return null;
	if (enforceExpiry && nowMs - updatedAtMs > CHALLENGE_SESSION_MAX_AGE_MS) return null;

	const rounds: ChallengeSessionRound[] = [];
	const challengeIds = new Set<string>();
	let previousActivityMs = startedAtMs;

	for (const candidate of value.rounds) {
		const round = normalizeRound(candidate);
		if (!round || challengeIds.has(round.challengeId)) return null;

		const roundCompletedAtMs = Date.parse(round.completedAt);
		if (roundCompletedAtMs < previousActivityMs || roundCompletedAtMs > updatedAtMs) return null;
		if (rounds.length > 0 && !rounds.at(-1)?.interludeCompletedAt) return null;

		if (round.interludeCompletedAt) {
			const interludeCompletedAtMs = Date.parse(round.interludeCompletedAt);
			if (interludeCompletedAtMs < roundCompletedAtMs || interludeCompletedAtMs > updatedAtMs) {
				return null;
			}
			previousActivityMs = interludeCompletedAtMs;
		} else {
			previousActivityMs = roundCompletedAtMs;
		}

		challengeIds.add(round.challengeId);
		rounds.push(round);
	}

	if (rounds.length === 0) return null;
	return {
		version: 1,
		startedAt: value.startedAt,
		updatedAt: value.updatedAt,
		rounds
	};
}

function normalizeRound(value: unknown): ChallengeSessionRound | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.challengeId !== 'string' ||
		!value.challengeId.trim() ||
		value.challengeId !== value.challengeId.trim() ||
		!isCanonicalChallengeScore(value.score) ||
		!isTimestamp(value.completedAt)
	) {
		return null;
	}

	const hasMechanic = value.interludeMechanic !== undefined;
	const hasScore = value.interludeScore !== undefined;
	const hasCompletedAt = value.interludeCompletedAt !== undefined;
	if (hasMechanic !== hasScore || hasScore !== hasCompletedAt) return null;

	const round: ChallengeSessionRound = {
		challengeId: value.challengeId,
		score: value.score,
		completedAt: value.completedAt
	};
	if (!hasMechanic) return round;
	if (
		!isInterludeMechanic(value.interludeMechanic) ||
		!isInterludeScore(value.interludeScore) ||
		!isTimestamp(value.interludeCompletedAt)
	) {
		return null;
	}

	return {
		...round,
		interludeMechanic: value.interludeMechanic,
		interludeScore: value.interludeScore,
		interludeCompletedAt: value.interludeCompletedAt
	};
}

function normalizedSessionWithoutExpiry(session: ChallengeSessionState): ChallengeSessionState {
	return (
		normalizeChallengeSession(session, sessionTimestampMilliseconds(session), false) ??
		emptyChallengeSession()
	);
}

function newChallengeSessionRound(
	challengeId: string,
	score: CanonicalChallengeScore,
	completedAt: string
): ChallengeSessionState {
	return {
		version: 1,
		startedAt: completedAt,
		updatedAt: completedAt,
		rounds: [{ challengeId, score, completedAt }]
	};
}

function sessionTimestampMilliseconds(session: ChallengeSessionState): number {
	return typeof session?.updatedAt === 'string' && Number.isFinite(Date.parse(session.updatedAt))
		? Date.parse(session.updatedAt)
		: 0;
}

function normalizedTimestamp(value: TimestampInput): string | null {
	if (value instanceof Date) {
		return Number.isFinite(value.getTime()) ? value.toISOString() : null;
	}
	return isTimestamp(value) ? value : null;
}

function timestampMilliseconds(value: number | Date): number | null {
	if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
	return Number.isFinite(value) ? value : null;
}

function isTimestamp(value: unknown): value is string {
	if (typeof value !== 'string' || !value) return false;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isInterludeMechanic(value: unknown): value is ChallengeInterludeMechanic {
	return interludeMechanics.includes(value as ChallengeInterludeMechanic);
}

function isInterludeScore(value: unknown): value is number {
	return value === CHALLENGE_INTERLUDE_SCORE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
