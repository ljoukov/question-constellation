import type { ChallengeDefinition, ChallengeSubject } from './types';

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
