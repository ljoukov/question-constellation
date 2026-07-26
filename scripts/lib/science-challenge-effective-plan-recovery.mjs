import {
	SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD,
	SCIENCE_CHALLENGE_DESCENDANT_REMAP_SCHEMA,
	validateScienceChallengeDescendantRemapManifest
} from './science-challenge-descendant-remap.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SCHEMA,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA,
	validateScienceChallengeDifficultyPlanAdjustmentManifest,
	validateScienceChallengeDifficultyPlanAdjustmentSetManifest
} from './science-challenge-difficulty-plan-adjustment.mjs';
import { canonicalHash } from './science-challenge-release.mjs';

export const SCIENCE_CHALLENGE_EFFECTIVE_PLAN_RECOVERY_SCHEMA =
	'science-challenge-effective-plan-recovery/v1';

/**
 * Compose independent, target-field-local plan projections over one immutable base plan.
 *
 * Every recovery is validated against the same base plan. A recovery's historical
 * effective.planSha256 binds its one-recovery projection; the returned plan hash binds the
 * combined projection used by the fresh verifier cohort.
 */
export function projectScienceChallengeEffectiveRecoveryPlan(basePlan, recoveries) {
	const issues = [];
	if (!isRecord(basePlan) || !Array.isArray(basePlan.rows)) {
		return failed('Effective-plan recovery requires an exact base plan.');
	}
	if (!Array.isArray(recoveries) || recoveries.length === 0) {
		return failed('Effective-plan recovery requires at least one typed recovery.');
	}
	const effectivePlan = structuredClone(basePlan);
	const basePlanSha256 = canonicalHash(basePlan);
	const seenTargets = new Set();
	const applied = [];

	for (const [index, recovery] of recoveries.entries()) {
		const manifest = recovery?.manifest ?? recovery;
		const kind = recoveryKind(manifest);
		if (!kind) {
			issues.push(`recovery[${index}] has an unsupported schema.`);
			continue;
		}
		const integrity =
			kind === 'descendant-remap'
				? validateScienceChallengeDescendantRemapManifest({
						manifest,
						plan: basePlan,
						priorCandidate: recovery?.priorCandidate,
						candidate: recovery?.candidate
					})
				: kind === 'difficulty-plan-adjustment-set'
					? validateScienceChallengeDifficultyPlanAdjustmentSetManifest({
							manifest,
							plan: basePlan,
							priorCandidate: recovery?.priorCandidate,
							candidate: recovery?.candidate
						})
					: validateScienceChallengeDifficultyPlanAdjustmentManifest({
							manifest,
							plan: basePlan,
							priorCandidate: recovery?.priorCandidate,
							candidate: recovery?.candidate
						});
		if (integrity.status !== 'passed') {
			issues.push(...integrity.issues.map((issue) => `recovery[${index}]: ${issue}`));
			continue;
		}
		if (manifest.base?.planSha256 !== basePlanSha256) {
			issues.push(`recovery[${index}] targets another base plan.`);
			continue;
		}
		if (kind === 'difficulty-plan-adjustment-set') {
			const isolatedPlan = structuredClone(basePlan);
			for (const adjustment of manifest.adjustments) {
				const targetKey = `${adjustment.challengeId}:${adjustment.field}`;
				if (seenTargets.has(targetKey)) {
					issues.push(
						`${adjustment.challengeId} has ambiguous duplicate ${adjustment.field} recoveries.`
					);
					continue;
				}
				seenTargets.add(targetKey);
				const rowIndex = basePlan.rows.findIndex((row) => row?.id === adjustment.challengeId);
				if (
					rowIndex !== adjustment.basePlanRowIndex ||
					canonicalHash(basePlan.rows[rowIndex]) !== adjustment.basePlanRowSha256
				) {
					issues.push(`${adjustment.challengeId} recovery base row is stale.`);
					continue;
				}
				effectivePlan.rows[rowIndex].difficulty = adjustment.to;
				isolatedPlan.rows[rowIndex].difficulty = adjustment.to;
				if (canonicalHash(effectivePlan.rows[rowIndex]) !== adjustment.effectivePlanRowSha256) {
					issues.push(
						`${adjustment.challengeId} effective row differs from its difficulty-plan adjustment set.`
					);
				}
				applied.push({
					kind: 'difficulty-plan-adjustment',
					challengeId: adjustment.challengeId,
					field: adjustment.field,
					manifestSha256: canonicalHash(manifest),
					basePlanRowSha256: adjustment.basePlanRowSha256,
					effectivePlanRowSha256: adjustment.effectivePlanRowSha256
				});
			}
			if (canonicalHash(isolatedPlan) !== manifest.effective.planSha256) {
				issues.push(
					`${manifest.shardId} isolated projection differs from its difficulty-plan adjustment set manifest.`
				);
			}
		} else {
			const field =
				manifest.field ??
				(kind === 'descendant-remap' ? manifest.remap?.field : manifest.adjustment?.field);
			const targetKey = `${manifest.challengeId}:${field}`;
			if (seenTargets.has(targetKey)) {
				issues.push(
					`${manifest.challengeId} has ambiguous duplicate ${manifest.field} recoveries.`
				);
				continue;
			}
			seenTargets.add(targetKey);
			const rowIndex = basePlan.rows.findIndex((row) => row?.id === manifest.challengeId);
			if (
				rowIndex !== manifest.base.planRowIndex ||
				canonicalHash(basePlan.rows[rowIndex]) !== manifest.base.planRowSha256
			) {
				issues.push(`${manifest.challengeId} recovery base row is stale.`);
				continue;
			}
			const isolatedPlan = structuredClone(basePlan);
			if (kind === 'descendant-remap') {
				applyCurriculumComponent(effectivePlan.rows[rowIndex], manifest.effective.component);
				applyCurriculumComponent(isolatedPlan.rows[rowIndex], manifest.effective.component);
			} else {
				effectivePlan.rows[rowIndex].difficulty = manifest.adjustment.to;
				isolatedPlan.rows[rowIndex].difficulty = manifest.adjustment.to;
			}
			if (
				canonicalHash(effectivePlan.rows[rowIndex]) !== manifest.effective.planRowSha256 ||
				canonicalHash(isolatedPlan) !== manifest.effective.planSha256
			) {
				issues.push(
					`${manifest.challengeId} effective row or isolated projection differs from its ${kind} manifest.`
				);
				continue;
			}
			applied.push({
				kind,
				challengeId: manifest.challengeId,
				field,
				manifestSha256: canonicalHash(manifest),
				basePlanRowSha256: manifest.base.planRowSha256,
				effectivePlanRowSha256: manifest.effective.planRowSha256
			});
		}
	}

	if (issues.length) return failed(issues);
	if (canonicalHash(basePlan) === canonicalHash(effectivePlan)) {
		return failed('Typed effective-plan recoveries did not change the base plan.');
	}
	return {
		status: 'passed',
		issues: [],
		schemaVersion: SCIENCE_CHALLENGE_EFFECTIVE_PLAN_RECOVERY_SCHEMA,
		basePlanSha256,
		effectivePlan,
		effectivePlanSha256: canonicalHash(effectivePlan),
		recoveryCount: applied.length,
		recoverySetSha256: canonicalHash(applied),
		applied
	};
}

export function recoveryKind(manifest) {
	if (
		manifest?.schemaVersion === SCIENCE_CHALLENGE_DESCENDANT_REMAP_SCHEMA &&
		(manifest?.field ?? manifest?.remap?.field) === SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD
	) {
		return 'descendant-remap';
	}
	if (
		manifest?.schemaVersion === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SCHEMA &&
		manifest?.field === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD
	) {
		return 'difficulty-plan-adjustment';
	}
	if (
		manifest?.schemaVersion === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA &&
		manifest?.field === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD
	) {
		return 'difficulty-plan-adjustment-set';
	}
	return null;
}

function applyCurriculumComponent(row, component) {
	for (const field of [
		'curriculumComponentId',
		'curriculumCode',
		'curriculumTitle',
		'curriculumPageStart',
		'curriculumPageEnd',
		'specificationId',
		'specificationSha256'
	]) {
		row[field] = component[field];
	}
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failed(value) {
	return { status: 'failed', issues: Array.isArray(value) ? value : [value] };
}
