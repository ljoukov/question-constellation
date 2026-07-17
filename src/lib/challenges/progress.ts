export const CHALLENGE_PROGRESS_STORAGE_KEY = 'question-constellation.challenge-progress.v1';

export type ChallengeProgressEntry = {
	startedAt: string;
	completedAt: string | null;
	plays: number;
	lastStage: 'showdown' | 'diagnose' | 'repair' | 'transfer' | 'complete';
};

export type ChallengeProgress = {
	version: 1;
	challenges: Record<string, ChallengeProgressEntry>;
};

const emptyProgress = (): ChallengeProgress => ({
	version: 1,
	challenges: {}
});

function isStage(value: unknown): value is ChallengeProgressEntry['lastStage'] {
	return ['showdown', 'diagnose', 'repair', 'transfer', 'complete'].includes(String(value));
}

export function parseChallengeProgress(raw: string | null | undefined): ChallengeProgress {
	if (!raw) return emptyProgress();

	try {
		const parsed = JSON.parse(raw) as Partial<ChallengeProgress>;
		if (parsed.version !== 1 || !parsed.challenges || typeof parsed.challenges !== 'object') {
			return emptyProgress();
		}

		const challenges: Record<string, ChallengeProgressEntry> = {};
		for (const [id, value] of Object.entries(parsed.challenges)) {
			if (!value || typeof value !== 'object') continue;
			const candidate = value as Partial<ChallengeProgressEntry>;
			if (
				typeof candidate.startedAt !== 'string' ||
				(candidate.completedAt !== null && typeof candidate.completedAt !== 'string') ||
				typeof candidate.plays !== 'number' ||
				!Number.isFinite(candidate.plays) ||
				candidate.plays < 1 ||
				!isStage(candidate.lastStage)
			) {
				continue;
			}
			challenges[id] = {
				startedAt: candidate.startedAt,
				completedAt: candidate.completedAt ?? null,
				plays: Math.floor(candidate.plays),
				lastStage: candidate.lastStage
			};
		}
		return { version: 1, challenges };
	} catch {
		return emptyProgress();
	}
}

export function readChallengeProgress(storage?: Pick<Storage, 'getItem'>): ChallengeProgress {
	if (!storage) return emptyProgress();
	try {
		return parseChallengeProgress(storage.getItem(CHALLENGE_PROGRESS_STORAGE_KEY));
	} catch {
		return emptyProgress();
	}
}

export function writeChallengeProgress(
	progress: ChallengeProgress,
	storage?: Pick<Storage, 'setItem'>
): void {
	if (!storage) return;
	try {
		storage.setItem(CHALLENGE_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
	} catch {
		// Challenge progress is enhancement-only when browser storage is unavailable.
	}
}

export function updateChallengeProgress({
	progress,
	challengeId,
	stage,
	now = new Date(),
	newPlay = false
}: {
	progress: ChallengeProgress;
	challengeId: string;
	stage: ChallengeProgressEntry['lastStage'];
	now?: Date;
	newPlay?: boolean;
}): ChallengeProgress {
	const current = progress.challenges[challengeId];
	const timestamp = now.toISOString();
	const entry: ChallengeProgressEntry = current
		? {
				...current,
				plays: current.plays + (newPlay ? 1 : 0),
				lastStage: stage,
				completedAt: stage === 'complete' ? timestamp : current.completedAt
			}
		: {
				startedAt: timestamp,
				completedAt: stage === 'complete' ? timestamp : null,
				plays: 1,
				lastStage: stage
			};

	return {
		version: 1,
		challenges: {
			...progress.challenges,
			[challengeId]: entry
		}
	};
}

export function completedChallengeIds(progress: ChallengeProgress): Set<string> {
	return new Set(
		Object.entries(progress.challenges)
			.filter(([, entry]) => Boolean(entry.completedAt))
			.map(([id]) => id)
	);
}
