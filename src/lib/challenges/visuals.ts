import type { ChainIllustration } from '$lib/chains/chainIllustration';

export type ChallengeCardArt = {
	src: string;
	darkSrc?: string;
	alt: string;
	width: number;
	height: number;
};

export type ChallengeVisualDefinition = {
	segments: string[];
	decisiveIndex: number;
	decisiveLabel: string;
	cardArt?: ChallengeCardArt;
	transferArt?: ChallengeCardArt;
	earnedIllustration?: ChainIllustration;
	mobilePanels?: Array<{ label: string; position: string }>;
	teaserPosition?: string;
};

export type ChallengeArtOwnershipInput = {
	id: string;
	visual: ChallengeVisualDefinition | undefined;
};

export type ChallengeArtPairOwnership = {
	challengeId: string;
	roles: Array<'primary' | 'transfer' | 'earned'>;
	lightSource: string;
	darkSource: string;
};

/**
 * Validate a materialized catalogue without importing its content into the app
 * bundle. The D1/R2 release builder uses the same ownership rule.
 */
export function assertFinalChallengeArtOwnership(
	inputs: readonly ChallengeArtOwnershipInput[]
): ChallengeArtPairOwnership[] {
	const challengeIds = new Set<string>();
	const ownershipByPair = new Map<
		string,
		ChallengeArtPairOwnership & { roleSet: Set<ChallengeArtPairOwnership['roles'][number]> }
	>();

	for (const { id, visual } of inputs) {
		if (!id.trim()) throw new Error('Challenge art ownership requires a non-empty challenge id.');
		if (challengeIds.has(id)) {
			throw new Error(`Challenge art ownership lists ${id} more than once.`);
		}
		challengeIds.add(id);
		if (!visual?.cardArt) {
			throw new Error(`${id} must own exactly one primary light/dark art pair.`);
		}

		const references: Array<{
			role: ChallengeArtPairOwnership['roles'][number];
			lightSource: string;
			darkSource: string | undefined;
		}> = [{ role: 'primary', lightSource: visual.cardArt.src, darkSource: visual.cardArt.darkSrc }];
		if (visual.transferArt) {
			references.push({
				role: 'transfer',
				lightSource: visual.transferArt.src,
				darkSource: visual.transferArt.darkSrc
			});
		}
		if (visual.earnedIllustration) {
			references.push({
				role: 'earned',
				lightSource: visual.earnedIllustration.lightSrc,
				darkSource: visual.earnedIllustration.src
			});
		}

		for (const { role, lightSource, darkSource } of references) {
			const normalizedLight = normalizeArtSource(lightSource);
			const normalizedDark = normalizeArtSource(darkSource);
			if (!normalizedLight || !normalizedDark || normalizedLight === normalizedDark) {
				throw new Error(`${id} ${role} art must contain one distinct light/dark pair.`);
			}
			const pairKey = [normalizedLight, normalizedDark].sort().join('\n');
			const existing = ownershipByPair.get(pairKey);
			if (existing && existing.challengeId !== id) {
				throw new Error(`Challenge art pair is shared across ${existing.challengeId} and ${id}.`);
			}
			if (existing) {
				existing.roleSet.add(role);
				existing.roles = [...existing.roleSet];
			} else {
				ownershipByPair.set(pairKey, {
					challengeId: id,
					roles: [role],
					roleSet: new Set([role]),
					lightSource: normalizedLight,
					darkSource: normalizedDark
				});
			}
		}
	}

	return [...ownershipByPair.values()].map(({ challengeId, roles, lightSource, darkSource }) => ({
		challengeId,
		roles,
		lightSource,
		darkSource
	}));
}

function normalizeArtSource(source: string | undefined) {
	return source?.trim().split(/[?#]/u, 1)[0] ?? '';
}
