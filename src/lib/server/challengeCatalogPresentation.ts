import {
	publicChallengePreviewDefinition,
	type PublicChallengePreviewDefinition
} from '$lib/challenges/authoredData';
import type { ChallengeDefinition } from '$lib/challenges/types';
import { challengeVisual, type ChallengeCardArt } from '$lib/challenges/visuals';

export type PublicChallengeCardDefinition = PublicChallengePreviewDefinition & {
	cardArt: ChallengeCardArt | null;
};

/**
 * Resolve catalogue artwork on the server so browse pages do not ship the
 * complete challenge-visual registry and authored expansion definitions just
 * to paint a card.
 */
export function publicChallengeCardDefinition(
	challenge: ChallengeDefinition
): PublicChallengeCardDefinition {
	return {
		...publicChallengePreviewDefinition(challenge),
		cardArt: challengeVisual(challenge)?.cardArt ?? null
	};
}
