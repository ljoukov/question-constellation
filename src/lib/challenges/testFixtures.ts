import type { ChallengeDefinition } from './types';
import type { PublicChallengePreviewDefinition } from './authoredData';

/**
 * Synthetic challenge used only by unit tests. Production challenge content is
 * loaded from the active D1 catalogue and must not be recreated in source.
 */
export function challengeDefinitionFixture(
	overrides: Partial<ChallengeDefinition> = {}
): ChallengeDefinition {
	return {
		id: 'biology-fixture-a',
		slug: 'fixture-a',
		subject: 'biology',
		subjectArtTheme: 'cells-practical',
		title: 'Fixture challenge',
		topic: 'Fixture topic',
		hook: 'A synthetic hook.',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		difficulty: 'standard',
		marks: 2,
		estimatedMinutes: 4,
		previewQuestion: 'Which link completes the synthetic explanation?',
		metaDescription: 'A synthetic challenge used only by automated tests.',
		lastReviewed: '2026-01-01',
		version: 1,
		staticAnswers: {
			a: 'The first answer has a claim.',
			b: 'The stronger answer has a claim because it includes evidence.'
		},
		strongerAnswer: 'b',
		weakAnswer: 'a',
		weakAnswerKind: 'incomplete',
		showdownExplanation: 'The stronger answer includes the missing idea.',
		commandWordLesson: 'Explain means connect the evidence to the claim.',
		diagnosisPrompt: 'What is missing?',
		diagnosisChoices: [
			{ id: 'diagnosis-correct', text: 'The evidence link.', correct: true },
			{ id: 'diagnosis-wrong', text: 'A new topic.', correct: false }
		],
		repairPrompt: 'Choose the repaired answer.',
		repairChoices: [
			{ id: 'repair-correct', text: 'The claim because of the evidence.', correct: true },
			{ id: 'repair-wrong', text: 'The claim.', correct: false }
		],
		freeTextKeywordGroups: [['because'], ['evidence']],
		repairSuccess: 'The answer now connects evidence to the claim.',
		transferPromptLead: 'Choose the explanation that uses the same link.',
		transferChoices: [
			{ id: 'transfer-correct', text: 'A because B.', correct: true },
			{ id: 'transfer-wrong', text: 'A.', correct: false }
		],
		transferExplanation: 'The same evidence link transfers.',
		memoryHandle: 'Claim → Evidence → Link',
		...overrides
	} as ChallengeDefinition;
}

export function publicChallengePreviewFixture(
	overrides: Partial<PublicChallengePreviewDefinition> = {}
): PublicChallengePreviewDefinition {
	const challenge = challengeDefinitionFixture(overrides as Partial<ChallengeDefinition>);
	return {
		id: challenge.id,
		slug: challenge.slug,
		subject: challenge.subject,
		subjectArtTheme: challenge.subjectArtTheme,
		title: challenge.title,
		topic: challenge.topic,
		hook: challenge.hook,
		marks: challenge.marks,
		previewQuestion: challenge.previewQuestion,
		cardArt: null,
		...overrides
	};
}
