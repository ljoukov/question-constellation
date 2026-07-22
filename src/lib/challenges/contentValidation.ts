import type { ChallengeDefinition } from './types';
import type { ChallengeVisualDefinition } from './visuals';

const VISUAL_REFERENCE =
	/\b(?:diagram|drawing|figure|graph|image|photograph|picture|plot|sketch|table)\b|\b(?:shown|displayed|pictured)\s+(?:above|below|here)\b/iu;
const UNSUPPORTED_DRAWING_TASK =
	/\b(?:draw|sketch|plot|shade|label)\b|\bcomplete\s+(?:the|this|a)\s+(?:diagram|drawing|figure|graph|image|plot|sketch|table)\b/iu;

export type ChallengeTransferVisualIssue = {
	challengeId: string;
	code: 'missing-transfer-art' | 'unsupported-drawing-task' | 'inaccessible-transfer-art';
	message: string;
};

function transferCopy(challenge: ChallengeDefinition): string {
	return [
		challenge.transferPromptLead,
		...challenge.transferChoices.flatMap(({ text, feedback }) => [text, feedback ?? '']),
		challenge.transferExplanation
	].join(' ');
}

/**
 * Challenge transfer stages only render prose, choices and an optional reviewed
 * transfer image. A prompt that points at an absent visual is therefore not
 * learner-solvable, even when the scientific answer itself is correct.
 */
export function validateChallengeTransferVisuals(
	challenge: ChallengeDefinition,
	visual: ChallengeVisualDefinition | undefined
): ChallengeTransferVisualIssue[] {
	const copy = transferCopy(challenge);
	const issues: ChallengeTransferVisualIssue[] = [];

	if (UNSUPPORTED_DRAWING_TASK.test(copy)) {
		issues.push({
			challengeId: challenge.id,
			code: 'unsupported-drawing-task',
			message:
				'Transfer stages do not provide a drawing canvas; rewrite this as a self-contained choice task.'
		});
	}

	if (!VISUAL_REFERENCE.test(copy)) return issues;

	if (!visual?.transferArt) {
		issues.push({
			challengeId: challenge.id,
			code: 'missing-transfer-art',
			message:
				'The transfer copy refers to visual material, but the stage has no reviewed transferArt.'
		});
		return issues;
	}

	if (
		!visual.transferArt.alt.trim() ||
		visual.transferArt.width < 1 ||
		visual.transferArt.height < 1
	) {
		issues.push({
			challengeId: challenge.id,
			code: 'inaccessible-transfer-art',
			message: 'The reviewed transferArt must include useful alt text and intrinsic dimensions.'
		});
	}

	return issues;
}
