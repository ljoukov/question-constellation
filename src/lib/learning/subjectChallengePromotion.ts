import type { PublicChallengePreviewDefinition } from '$lib/challenges/authoredData';
import {
	mergeChallengeProgress,
	readChallengeProgress,
	type ChallengeProgress
} from '$lib/challenges/progress';
import type { ChallengeProgressUpdatedDetail } from '$lib/challenges/progressSync';
import {
	mostRecentlyCompletedChallenge,
	recommendedUnfinishedChallenge
} from '$lib/challenges/recommendations';

export type SubjectChallengePromotion = {
	challenge: PublicChallengePreviewDefinition | null;
	challengeCompleted: boolean;
	completedCount: number;
	totalBestScore: number;
};

/**
 * Projects the live subject promo from the subject catalogue only. Progress
 * belonging to another subject or a retired challenge must not affect the
 * learner-facing count, score, or recommendation.
 */
export function subjectChallengePromotion(
	challenges: readonly PublicChallengePreviewDefinition[],
	progress: ChallengeProgress
): SubjectChallengePromotion {
	const challenge =
		recommendedUnfinishedChallenge(challenges, progress) ??
		mostRecentlyCompletedChallenge(challenges, progress) ??
		challenges[0] ??
		null;

	return {
		challenge,
		challengeCompleted: challenge ? Boolean(progress.challenges[challenge.id]?.completedAt) : false,
		completedCount: challenges.filter((candidate) =>
			Boolean(progress.challenges[candidate.id]?.completedAt)
		).length,
		totalBestScore: challenges.reduce(
			(total, candidate) => total + (progress.challenges[candidate.id]?.bestScore ?? 0),
			0
		)
	};
}

/**
 * Reconciles progress events for the signed-in learner while ignoring stale
 * events from a previous account. Merging retains newer local work when an
 * account-sync response contains only the server-confirmed subset.
 */
export function mergeSubjectChallengeProgressUpdate(
	current: ChallengeProgress,
	expectedUserId: string,
	detail: ChallengeProgressUpdatedDetail | null | undefined
): ChallengeProgress {
	if (!detail?.progress || detail.userId !== expectedUserId) return current;
	return mergeChallengeProgress(current, detail.progress);
}

/**
 * A signed-in SPA navigation can mount after the live progress event fired.
 * Merge the account-scoped browser watermark so home/subject promotions do
 * not need a root data invalidation after every challenge stage.
 */
export function hydrateSignedInChallengeProgress(
	current: ChallengeProgress,
	userId: string,
	storage: Pick<Storage, 'getItem'>
): ChallengeProgress {
	const accountProgress = readChallengeProgress(storage, userId);
	const guestProgress = readChallengeProgress(storage);
	return mergeChallengeProgress(current, mergeChallengeProgress(accountProgress, guestProgress));
}
