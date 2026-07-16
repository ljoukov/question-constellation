import type { RecallCard } from './aqaScienceRecall';

export type RecallCardContentIdentity = Pick<
	RecallCard,
	'id' | 'contentRevision' | 'contentHash'
>;

/**
 * Local progress and active sessions use the immutable content identity, not
 * the stable card id. A revised card therefore starts clean instead of
 * inheriting an answer, interval, or half-finished interaction for old copy.
 */
export function recallCardContentKey(card: RecallCardContentIdentity): string {
	return `${card.id}@${card.contentRevision}:${card.contentHash}`;
}

export function recallCardContentMatches(
	card: RecallCardContentIdentity,
	identity: { contentRevision: number; contentHash: string }
): boolean {
	return (
		card.contentRevision === identity.contentRevision && card.contentHash === identity.contentHash
	);
}
