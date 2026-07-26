import { z } from 'zod';

/**
 * The authoring contract requires `questionPresentation` because structured-output providers
 * handle required nullable fields more reliably than optional fields. Schema-free prompt JSON can
 * still omit that one nullable key. Normalize only that omission before Zod validation so the
 * strict schema continues to reject every malformed non-null value and every other missing field.
 */
export function normalizeScienceChallengeAuthoringProviderValue(value) {
	if (!isRecord(value) || !Array.isArray(value.challenges)) return value;

	let challenges = null;
	for (const [index, challenge] of value.challenges.entries()) {
		if (
			!isRecord(challenge) ||
			!isRecord(challenge.definition) ||
			Object.hasOwn(challenge.definition, 'questionPresentation')
		) {
			continue;
		}
		if (challenges === null) challenges = value.challenges.slice();
		challenges[index] = {
			...challenge,
			definition: {
				...challenge.definition,
				questionPresentation: null
			}
		};
	}

	return challenges === null ? value : { ...value, challenges };
}

export function scienceChallengeAuthoringProviderSchema(responseJsonSchema) {
	return z.preprocess(
		normalizeScienceChallengeAuthoringProviderValue,
		z.fromJSONSchema(responseJsonSchema)
	);
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
