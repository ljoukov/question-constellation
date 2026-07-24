import { describe, expect, it } from 'vitest';
import {
	challengePathWithScope,
	normalizeChallengePathScope,
	type ChallengePathScope
} from './routing';

describe('challenge path scope', () => {
	it('keeps an explicit mixed or subject path and defaults direct links to the current subject', () => {
		expect(normalizeChallengePathScope('mixed', 'biology')).toBe('mixed');
		expect(normalizeChallengePathScope('physics', 'biology')).toBe('physics');
		expect(normalizeChallengePathScope(null, 'biology')).toBe('biology');
		expect(normalizeChallengePathScope('anything-else', 'chemistry')).toBe('chemistry');
	});

	it('carries the one-time scope choice between challenge routes', () => {
		const challenge = { subject: 'physics', slug: 'balanced-forces' } as const;
		const scopes: ChallengePathScope[] = ['mixed', 'physics'];

		expect(scopes.map((scope) => challengePathWithScope(challenge, scope))).toEqual([
			'/challenges/physics/balanced-forces?scope=mixed',
			'/challenges/physics/balanced-forces?scope=physics'
		]);
	});
});
