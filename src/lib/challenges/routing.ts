import type { ChallengeDefinition, ChallengeSubject } from './types';

export type ChallengePathScope = 'mixed' | ChallengeSubject;

export function challengeSubjectLabel(subject: ChallengeSubject): string {
	return {
		biology: 'Biology',
		chemistry: 'Chemistry',
		physics: 'Physics'
	}[subject];
}

export function challengePath(
	challenge: Pick<ChallengeDefinition, 'subject' | 'slug'>
): `/challenges/${string}/${string}` {
	return `/challenges/${challenge.subject}/${challenge.slug}`;
}

export function normalizeChallengePathScope(
	value: string | null | undefined,
	fallbackSubject: ChallengeSubject
): ChallengePathScope {
	return value === 'mixed' || value === 'biology' || value === 'chemistry' || value === 'physics'
		? value
		: fallbackSubject;
}

export function challengePathWithScope(
	challenge: Pick<ChallengeDefinition, 'subject' | 'slug'>,
	scope: ChallengePathScope
): `${ReturnType<typeof challengePath>}?scope=${ChallengePathScope}` {
	return `${challengePath(challenge)}?scope=${scope}`;
}
