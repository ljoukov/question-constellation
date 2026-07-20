import type { AnswerChain, ChainStep } from '$lib/server/questionData';
import type { ChallengeDefinition } from './types';

const HANDLE_SEPARATOR = /\s*(?:→|⟶)\s*/;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K & keyof T> : never;

export type PublicChallengeDefinition = DistributiveOmit<
	ChallengeDefinition,
	'sourceQuestionId' | 'transferQuestionId'
>;

export type PublicChallengePreviewDefinition = Pick<
	ChallengeDefinition,
	| 'id'
	| 'slug'
	| 'subject'
	| 'subjectArtTheme'
	| 'title'
	| 'topic'
	| 'hook'
	| 'marks'
	| 'previewQuestion'
>;

export type PublicNextChallengeDefinition = Pick<ChallengeDefinition, 'id' | 'slug' | 'subject'>;

/**
 * Builds the small method model used by the challenge UI from its reviewed,
 * authored content. A focused challenge must not depend on an imported paper
 * row or a published answer-chain record in order to load.
 */
export function buildAuthoredChallengeChain(challenge: ChallengeDefinition): AnswerChain {
	const labels = challenge.memoryHandle
		.split(HANDLE_SEPARATOR)
		.map((label) => label.trim())
		.filter(Boolean);
	const stepLabels = labels.length > 0 ? labels : [challenge.memoryHandle.trim()];
	const steps: ChainStep[] = stepLabels.map((label, index) => ({
		id: `${challenge.id}-method-${index + 1}`,
		short: label,
		label,
		role: index === stepLabels.length - 1 ? 'conclusion' : index === 0 ? 'given' : 'link',
		explanation: challenge.repairSuccess,
		markEvidence: label,
		commonOmission: challenge.showdownExplanation
	}));

	return {
		id: `${challenge.id}-authored-method`,
		title: challenge.memoryHandle,
		canonicalText: challenge.memoryHandle,
		concreteText: challenge.repairSuccess,
		pageTitle: challenge.title,
		summary: challenge.transferExplanation,
		steps,
		commonMissingLink: challenge.showdownExplanation,
		modelAnswer: challenge.staticAnswers[challenge.strongerAnswer],
		illustration: null
	};
}

/** Remove internal paper-row references before serialising challenge data. */
export function publicChallengeDefinition(
	challenge: ChallengeDefinition
): PublicChallengeDefinition {
	const publicChallenge = { ...challenge };
	delete publicChallenge.sourceQuestionId;
	delete publicChallenge.transferQuestionId;
	return publicChallenge;
}

/** Allowlist the fields needed by public catalogue cards. */
export function publicChallengePreviewDefinition(
	challenge: ChallengeDefinition
): PublicChallengePreviewDefinition {
	return {
		id: challenge.id,
		slug: challenge.slug,
		subject: challenge.subject,
		subjectArtTheme: challenge.subjectArtTheme,
		title: challenge.title,
		topic: challenge.topic,
		hook: challenge.hook,
		marks: challenge.marks,
		previewQuestion: challenge.previewQuestion
	};
}

/** Allowlist the route identity used after a completed challenge. */
export function publicNextChallengeDefinition(
	challenge: ChallengeDefinition
): PublicNextChallengeDefinition {
	return {
		id: challenge.id,
		slug: challenge.slug,
		subject: challenge.subject
	};
}
