import type { ChallengeProgress } from './progress';
import type { ChallengePathScope } from './routing';
import type { ChallengeDefinition, ChallengeDifficulty, ChallengeSubject } from './types';

type ChallengeRouteIdentity = Pick<ChallengeDefinition, 'id' | 'slug' | 'subject' | 'marks'>;
type ChallengePathIdentity = ChallengeRouteIdentity &
	Pick<ChallengeDefinition, 'arc' | 'difficulty' | 'marks'>;

const subjectPathOrder = [
	'biology',
	'chemistry',
	'physics'
] as const satisfies readonly ChallengeSubject[];
export const CHALLENGE_PATH_PLANNER_VERSION = 'science-path-v2';

function updatedAt(progress: ChallengeProgress, challengeId: string): number {
	const entry = progress.challenges[challengeId];
	if (!entry) return 0;
	const value = Date.parse(entry.updatedAt ?? entry.startedAt);
	return Number.isFinite(value) ? value : 0;
}

function isInProgress(progress: ChallengeProgress, challengeId: string): boolean {
	const entry = progress.challenges[challengeId];
	return Boolean(entry && !entry.completedAt && entry.lastStage !== 'showdown');
}

function completionActivityAt(progress: ChallengeProgress, challengeId: string): number {
	const entry = progress.challenges[challengeId];
	if (!entry?.completedAt) return 0;
	const value = Date.parse(entry.lastStage === 'complete' ? entry.updatedAt : entry.completedAt);
	return Number.isFinite(value) ? value : 0;
}

/**
 * Choose a useful unfinished challenge without sending the learner straight
 * back to the round they just completed. A genuinely started round wins. After
 * a completed four-marker, prefer a shorter question before returning to
 * catalogue order so pause-and-resume surfaces keep the same pacing.
 */
export function recommendedUnfinishedChallenge<T extends ChallengeRouteIdentity>(
	challenges: readonly T[],
	progress: ChallengeProgress,
	options: {
		currentChallengeId?: string | null;
		preferredSubject?: ChallengeSubject | null;
	} = {}
): T | null {
	const unfinished = challenges.filter(
		(challenge) =>
			challenge.id !== options.currentChallengeId && !progress.challenges[challenge.id]?.completedAt
	);
	if (unfinished.length === 0) return null;

	const subjectCandidates = options.preferredSubject
		? unfinished.filter((challenge) => challenge.subject === options.preferredSubject)
		: unfinished;
	const candidates = subjectCandidates.length > 0 ? subjectCandidates : unfinished;
	const active = [...candidates].sort((left, right) => {
		const progressDifference =
			Number(isInProgress(progress, right.id)) - Number(isInProgress(progress, left.id));
		if (progressDifference !== 0) return progressDifference;
		if (isInProgress(progress, left.id) && isInProgress(progress, right.id)) {
			return updatedAt(progress, right.id) - updatedAt(progress, left.id);
		}
		return challenges.indexOf(left) - challenges.indexOf(right);
	});
	if (active[0] && isInProgress(progress, active[0].id)) return active[0];

	const latestCompleted = mostRecentlyCompletedChallenge(challenges, progress);
	const shorter =
		(latestCompleted?.marks ?? 0) >= 4 ? candidates.filter((challenge) => challenge.marks < 4) : [];
	const paced = shorter.length > 0 ? shorter : candidates;

	return (
		[...paced].sort((left, right) => challenges.indexOf(left) - challenges.indexOf(right))[0] ??
		null
	);
}

/**
 * Conduct the next step in a learner-chosen path. The rule is deliberately
 * deterministic: resume real unfinished work first, rotate subjects in mixed
 * science, soften the next step after a four-marker, then choose an appropriate
 * difficulty without a runtime model call.
 */
export function recommendedChallengePathStep<T extends ChallengePathIdentity>(
	challenges: readonly T[],
	progress: ChallengeProgress,
	options: {
		currentChallenge: Pick<T, 'id' | 'subject' | 'arc' | 'marks'>;
		scope: ChallengePathScope;
		roundScore: number;
		resumeStarted?: boolean;
	}
): T | null {
	const scoped = challenges.filter(
		(challenge) =>
			challenge.id !== options.currentChallenge.id &&
			(options.scope === 'mixed' || challenge.subject === options.scope) &&
			!progress.challenges[challenge.id]?.completedAt
	);
	if (scoped.length === 0) return null;

	if (options.resumeStarted !== false) {
		const active = scoped
			.filter((challenge) => isInProgress(progress, challenge.id))
			.sort(
				(left, right) =>
					updatedAt(progress, right.id) - updatedAt(progress, left.id) ||
					challenges.indexOf(left) - challenges.indexOf(right)
			);
		if (active[0]) return active[0];
	}

	const subjectPool =
		options.scope === 'mixed'
			? nearestMixedSubjectCandidates(scoped, options.currentChallenge.subject)
			: scoped;
	const paced = easierCandidatesAfterLongQuestion(subjectPool, options.currentChallenge.marks);
	const difficultyOrder = nextDifficultyOrder(options.roundScore);
	return (
		[...paced].sort((left, right) => {
			if (options.scope === 'mixed') {
				const subjectDifference =
					mixedSubjectDistance(options.currentChallenge.subject, left.subject) -
					mixedSubjectDistance(options.currentChallenge.subject, right.subject);
				if (subjectDifference !== 0) return subjectDifference;
			}

			const difficultyDifference =
				difficultyOrder.indexOf(left.difficulty) - difficultyOrder.indexOf(right.difficulty);
			if (difficultyDifference !== 0) return difficultyDifference;

			const arcDifference =
				Number(left.arc === options.currentChallenge.arc) -
				Number(right.arc === options.currentChallenge.arc);
			if (arcDifference !== 0) return arcDifference;

			return challenges.indexOf(left) - challenges.indexOf(right);
		})[0] ?? null
	);
}

function easierCandidatesAfterLongQuestion<
	T extends Pick<ChallengeDefinition, 'difficulty' | 'marks'>
>(candidates: readonly T[], currentMarks: number): readonly T[] {
	if (currentMarks < 4) return candidates;

	const starters = candidates.filter(
		(challenge) => challenge.marks < 4 && challenge.difficulty === 'starter'
	);
	if (starters.length > 0) return starters;

	const shorter = candidates.filter((challenge) => challenge.marks < 4);
	return shorter.length > 0 ? shorter : candidates;
}

function nearestMixedSubjectCandidates<T extends Pick<ChallengeDefinition, 'subject'>>(
	candidates: readonly T[],
	currentSubject: ChallengeSubject
): readonly T[] {
	const nearestDistance = Math.min(
		...candidates.map((challenge) => mixedSubjectDistance(currentSubject, challenge.subject))
	);
	return candidates.filter(
		(challenge) => mixedSubjectDistance(currentSubject, challenge.subject) === nearestDistance
	);
}

/**
 * When a learner has completed the available catalogue, keep the card tied to
 * their journey by showing the challenge they completed most recently.
 */
export function mostRecentlyCompletedChallenge<T extends ChallengeRouteIdentity>(
	challenges: readonly T[],
	progress: ChallengeProgress
): T | null {
	return (
		[...challenges]
			.filter((challenge) => Boolean(progress.challenges[challenge.id]?.completedAt))
			.sort((left, right) => {
				const timeDifference =
					completionActivityAt(progress, right.id) - completionActivityAt(progress, left.id);
				if (timeDifference !== 0) return timeDifference;
				return challenges.indexOf(right) - challenges.indexOf(left);
			})[0] ?? null
	);
}

function mixedSubjectDistance(
	currentSubject: ChallengeSubject,
	candidateSubject: ChallengeSubject
): number {
	const currentIndex = subjectPathOrder.indexOf(currentSubject);
	const candidateIndex = subjectPathOrder.indexOf(candidateSubject);
	const distance =
		(candidateIndex - currentIndex + subjectPathOrder.length) % subjectPathOrder.length;
	return distance === 0 ? subjectPathOrder.length : distance;
}

function nextDifficultyOrder(roundScore: number): readonly ChallengeDifficulty[] {
	if (!Number.isFinite(roundScore) || roundScore <= 425) {
		return ['starter', 'standard', 'stretch'];
	}
	if (roundScore >= 475) {
		return ['standard', 'stretch', 'starter'];
	}
	return ['standard', 'starter', 'stretch'];
}
