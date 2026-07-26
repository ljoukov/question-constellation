import type { ChallengeProgress } from './progress';

export const CHALLENGE_PROGRESS_UPDATED_EVENT = 'qc:challenge-progress-updated';

export type ChallengeProgressUpdatedDetail = {
	userId: string | null;
	progress: ChallengeProgress;
	confirmed?: boolean;
};
