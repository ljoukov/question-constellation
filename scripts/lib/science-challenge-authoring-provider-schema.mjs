import { z } from 'zod';

export function scienceChallengeAuthoringProviderSchema(responseJsonSchema) {
	return z.fromJSONSchema(responseJsonSchema);
}
