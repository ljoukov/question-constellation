import { describe, expect, it } from 'vitest';
import { biologyExpansion, biologyCurriculumAliases } from './biology';
import { biologyExpansionIdentities } from './biologyIdentity';
import { chemistryExpansion, chemistryCurriculumAliases } from './chemistry';
import { chemistryExpansionIdentities } from './chemistryIdentity';
import { physicsExpansion, physicsCurriculumAliases } from './physics';
import { physicsExpansionIdentities } from './physicsIdentity';

const groups = [
	{
		subject: 'biology',
		challenges: biologyExpansion,
		identities: biologyExpansionIdentities,
		aliases: biologyCurriculumAliases,
		expectedTopicCount: 11
	},
	{
		subject: 'chemistry',
		challenges: chemistryExpansion,
		identities: chemistryExpansionIdentities,
		aliases: chemistryCurriculumAliases,
		expectedTopicCount: 10
	},
	{
		subject: 'physics',
		challenges: physicsExpansion,
		identities: physicsExpansionIdentities,
		aliases: physicsCurriculumAliases,
		expectedTopicCount: 12
	}
] as const;

function wordCount(text: string): number {
	return text
		.trim()
		.split(/\s+/u)
		.filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function collectStrings(value: unknown): string[] {
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) return value.flatMap(collectStrings);
	if (value && typeof value === 'object') {
		return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
	}
	return [];
}

describe('science challenge expansion cohort', () => {
	it('adds exactly 20 independently addressable challenges per subject', () => {
		for (const group of groups) {
			expect(group.challenges, group.subject).toHaveLength(20);
			expect(group.identities, `${group.subject} identities`).toEqual(
				group.challenges.map(({ id, slug, subject }) => ({ id, slug, subject }))
			);
			expect(Object.keys(group.aliases), `${group.subject} aliases`).toEqual(
				group.challenges.map(({ id }) => id)
			);
		}
	});

	it('uses every reviewed curriculum topic in each subject expansion', () => {
		for (const group of groups) {
			expect(new Set(Object.values(group.aliases)).size, group.subject).toBe(
				group.expectedTopicCount
			);
		}
	});

	it('keeps authored contexts unique and independent of imported paper rows', () => {
		const challenges = groups.flatMap(({ challenges }) => [...challenges]);
		expect(new Set(challenges.map(({ previewQuestion }) => previewQuestion)).size).toBe(
			challenges.length
		);
		expect(new Set(challenges.map(({ transferPromptLead }) => transferPromptLead)).size).toBe(
			challenges.length
		);
		for (const challenge of challenges) {
			expect('sourceQuestionId' in challenge, challenge.id).toBe(false);
			expect('transferQuestionId' in challenge, challenge.id).toBe(false);
		}
	});

	it('keeps every new showdown answer pair within the 20% length balance', () => {
		const imbalanced = groups
			.flatMap(({ challenges }) => [...challenges])
			.map((challenge) => {
				const a = wordCount(challenge.staticAnswers.a);
				const b = wordCount(challenge.staticAnswers.b);
				return { id: challenge.id, a, b, ratio: Math.max(a, b) / Math.min(a, b) };
			})
			.filter(({ ratio }) => ratio > 1.2);

		expect(imbalanced).toEqual([]);
	});

	it('preserves authored LaTeX commands at runtime without control-character corruption', () => {
		// eslint-disable-next-line no-control-regex -- this assertion deliberately detects corrupted control bytes.
		const controlCharacter = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u;
		const swallowedMathCommand = /(?<!\\)\b(?:div|mathrm|rightleftharpoons|rightarrow|times)\b/u;

		for (const challenge of groups.flatMap(({ challenges }) => [...challenges])) {
			for (const authoredText of collectStrings(challenge)) {
				expect(controlCharacter.test(authoredText), `${challenge.id}: ${authoredText}`).toBe(false);

				for (const [index, mathSegment] of authoredText.split('$').entries()) {
					if (index % 2 === 1) {
						expect(
							swallowedMathCommand.test(mathSegment),
							`${challenge.id} has a swallowed LaTeX slash in $${mathSegment}$`
						).toBe(false);
					}
				}
			}
		}

		expect(
			chemistryExpansion.find(({ id }) => id === 'chemistry-magnesium-oxide-mass')?.previewQuestion
		).toContain('\\rightarrow');
	});
});
