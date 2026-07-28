import assert from 'node:assert/strict';
import test from 'node:test';

import { scienceChallengeAuthoringProviderSchema } from './science-challenge-authoring-provider-schema.mjs';

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

test('authoring provider schema rejects an omitted required nullable questionPresentation', () => {
	const schema = scienceChallengeAuthoringProviderSchema(PROVIDER_SCHEMA);
	const omitted = batch({ id: 'omitted' });

	assert.equal(Object.hasOwn(omitted.challenges[0].definition, 'questionPresentation'), false);
	assert.equal(schema.safeParse(omitted).success, false);
});

test('authoring provider schema leaves explicit null unchanged', () => {
	const schema = scienceChallengeAuthoringProviderSchema(PROVIDER_SCHEMA);
	const explicitNull = batch({ id: 'explicit-null', questionPresentation: null });

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

	assert.equal(schema.safeParse(malformed).success, false);
});

test('authoring provider schema keeps every unrelated requirement strict', () => {
	const schema = scienceChallengeAuthoringProviderSchema(PROVIDER_SCHEMA);
	const missingId = batch({});
	const extraDefinitionField = batch({ id: 'extra', unsupported: true });
	const extraRootField = { ...batch({ id: 'root-extra' }), unsupported: true };

	for (const value of [missingId, extraDefinitionField, extraRootField]) {
		assert.equal(schema.safeParse(value).success, false);
	}
});

function batch(definition) {
	return {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: [{ definition }]
	};
}
