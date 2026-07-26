import {
	inspectScienceChallengeDescendantRemap,
	stageScienceChallengeDescendantRemap
} from './science-challenge-descendant-remap-evidence.mjs';
import { canonicalHash } from './science-challenge-release.mjs';

/**
 * Generator adapter for deterministic exhausted-ledger recovery. It has no model callback.
 */
export function recoverExhaustedScienceChallengeDescendantRemap({
	dryRun,
	replayOptions,
	inspect = inspectScienceChallengeDescendantRemap,
	stage = stageScienceChallengeDescendantRemap
}) {
	const recovery = dryRun ? inspect(replayOptions) : stage(replayOptions);
	if (recovery.status !== 'passed') return recovery;
	return {
		...recovery,
		status: dryRun ? 'planned' : 'review-pending',
		action: dryRun
			? recovery.action === 'reuse-staged-descendant-remap'
				? 'reuse-verifier-directed-descendant-remap'
				: 'stage-verifier-directed-descendant-remap'
			: 'verification-repair-descendant-remap-review-pending',
		sourceAttempt: recovery.sourceAttempt ?? recovery.manifest.sourceAttempt.attempt,
		candidateSha256: canonicalHash(recovery.candidate),
		basePlanSha256: recovery.manifest.base.planSha256,
		effectivePlanSha256: recovery.manifest.effective.planSha256,
		manifestSha256: canonicalHash(recovery.manifest),
		requiresFreshFullVerification: true,
		modelCalls: 0,
		writes: dryRun ? 0 : 1
	};
}
