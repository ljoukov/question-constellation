import {
	inspectScienceChallengeDifficultyPlanAdjustment,
	stageScienceChallengeDifficultyPlanAdjustment
} from './science-challenge-difficulty-plan-adjustment-evidence.mjs';
import { canonicalHash } from './science-challenge-release.mjs';

/**
 * Generator adapter for immutable terminal attempt-04 difficulty recovery. It has no model
 * callback and can only stage review-pending evidence for a fresh verifier pass.
 */
export function recoverExhaustedScienceChallengeDifficultyPlanAdjustment({
	dryRun,
	replayOptions,
	inspect = inspectScienceChallengeDifficultyPlanAdjustment,
	stage = stageScienceChallengeDifficultyPlanAdjustment
}) {
	const recovery = dryRun ? inspect(replayOptions) : stage(replayOptions);
	if (recovery.status !== 'passed') return recovery;
	return {
		...recovery,
		status: dryRun ? 'planned' : 'review-pending',
		recoveryKind: 'difficulty-plan-adjustment',
		action: dryRun
			? recovery.action === 'reuse-staged-difficulty-plan-adjustment'
				? 'reuse-verifier-directed-difficulty-plan-adjustment'
				: 'stage-verifier-directed-difficulty-plan-adjustment'
			: 'verification-repair-difficulty-plan-adjustment-review-pending',
		sourceAttempt: recovery.sourceAttempt ?? recovery.manifest.sourceAttempt.attempt,
		candidateSha256: canonicalHash(recovery.candidate),
		basePlanSha256: recovery.manifest.base.planSha256,
		effectivePlanSha256: recovery.manifest.effective.planSha256,
		manifestSha256: canonicalHash(recovery.manifest),
		adjustmentCount: recovery.manifest.adjustmentCount ?? 1,
		requiresFreshFullVerification: true,
		modelCalls: 0,
		writes: dryRun ? 0 : 1
	};
}
