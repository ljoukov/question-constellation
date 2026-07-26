import { describe, expect, it } from 'vitest';
import {
	authoredChallengeIds,
	authoredChallengeRouteIdentities,
	challengeIds,
	challengeRouteIdentities,
	generatedChallengeRouteIdentities
} from './catalogIdentity';
import { generatedScienceChallengeDefinitions } from './generatedRuntime';

describe('challenge route identities', () => {
	it('keeps authored identities explicit and appends every accepted generated runtime identity', () => {
		const runtimeIdentities = generatedScienceChallengeDefinitions.map(({ id, slug, subject }) => ({
			id,
			slug,
			subject
		}));

		expect(authoredChallengeIds).toEqual(
			authoredChallengeRouteIdentities.map((challenge) => challenge.id)
		);
		expect(generatedChallengeRouteIdentities).toEqual(runtimeIdentities);
		expect(challengeRouteIdentities).toEqual([
			...authoredChallengeRouteIdentities,
			...runtimeIdentities
		]);
		expect(challengeIds).toEqual(challengeRouteIdentities.map((challenge) => challenge.id));
	});
});
