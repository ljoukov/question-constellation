import assert from 'node:assert/strict';
import test from 'node:test';

import {
	normalizeScienceChallengeAuthoringProviderValue,
	scienceChallengeAuthoringProviderSchema
} from './science-challenge-authoring-provider-schema.mjs';
import { canonicalHash, normalizeGeneratedChallengeBatch } from './science-challenge-release.mjs';

const PROVIDER_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['schemaVersion', 'challenges'],
	properties: {
		schemaVersion: { type: 'string', const: 'science-challenge-batch/v1' },
		challenges: {
			type: 'array',
			minItems: 1,
			maxItems: 1,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['definition'],
				properties: {
					definition: {
						type: 'object',
						additionalProperties: false,
						required: ['id', 'questionPresentation'],
						properties: {
							id: { type: 'string', minLength: 1 },
							questionPresentation: {
								anyOf: [
									{ type: 'null' },
									{
										type: 'object',
										additionalProperties: false,
										required: ['lead', 'task', 'table'],
										properties: {
											lead: { type: 'string', minLength: 1 },
											task: { type: 'string', minLength: 1 },
											table: { type: 'null' }
										}
									}
								]
							}
						}
					}
				}
			}
		}
	}
};

test('authoring provider schema defaults only an omitted nullable questionPresentation', () => {
	const schema = scienceChallengeAuthoringProviderSchema(PROVIDER_SCHEMA);
	const omitted = batch({ id: 'omitted' });
	const parsed = schema.parse(omitted);

	assert.equal(Object.hasOwn(omitted.challenges[0].definition, 'questionPresentation'), false);
	assert.equal(parsed.challenges[0].definition.questionPresentation, null);
	assert.notStrictEqual(parsed, omitted);
});

test('authoring provider schema leaves explicit null unchanged', () => {
	const schema = scienceChallengeAuthoringProviderSchema(PROVIDER_SCHEMA);
	const explicitNull = batch({ id: 'explicit-null', questionPresentation: null });

	assert.strictEqual(
		normalizeScienceChallengeAuthoringProviderValue(explicitNull),
		explicitNull,
		'explicitly schema-valid output must not be cloned or rewritten'
	);
	assert.deepEqual(schema.parse(explicitNull), explicitNull);
});

test('authoring provider schema rejects malformed non-null questionPresentation', () => {
	const schema = scienceChallengeAuthoringProviderSchema(PROVIDER_SCHEMA);
	const malformed = batch({
		id: 'malformed',
		questionPresentation: {
			lead: 'A measurement is supplied.'
		}
	});

	assert.strictEqual(normalizeScienceChallengeAuthoringProviderValue(malformed), malformed);
	assert.equal(schema.safeParse(malformed).success, false);
});

test('authoring provider normalization does not weaken unrelated schema requirements', () => {
	const schema = scienceChallengeAuthoringProviderSchema(PROVIDER_SCHEMA);
	const missingId = batch({});
	const extraDefinitionField = batch({ id: 'extra', unsupported: true });
	const extraRootField = { ...batch({ id: 'root-extra' }), unsupported: true };

	for (const value of [missingId, extraDefinitionField, extraRootField]) {
		assert.equal(schema.safeParse(value).success, false);
	}
});

test('omitted and explicit-null provider forms retain one deterministic accepted candidate hash', () => {
	const omitted = batch({ id: 'same-candidate' });
	const explicitNull = batch({ id: 'same-candidate', questionPresentation: null });
	const schema = scienceChallengeAuthoringProviderSchema(PROVIDER_SCHEMA);

	assert.equal(canonicalHash(schema.parse(omitted)), canonicalHash(schema.parse(explicitNull)));
	assert.equal(
		canonicalHash(normalizeGeneratedChallengeBatch(omitted)),
		canonicalHash(normalizeGeneratedChallengeBatch(explicitNull))
	);
});

function batch(definition) {
	return {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: [{ definition }]
	};
}
