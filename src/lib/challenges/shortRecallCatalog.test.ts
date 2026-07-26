import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { challengeCatalog, challengesForSubject } from './catalog';
import rawShortRecallPrompts from './data/short-recall-prompts.v1.json';
import {
	GENERATED_SCIENCE_SHORT_RECALL_CONTENT_VERSION,
	generatedScienceShortRecallChallengeIds,
	generatedScienceShortRecallCountsBySubject
} from './generatedShortRecall';
import { buildShortRecallPromptCatalog, bundledShortRecallPrompts } from './shortRecallCatalog';
import {
	generateSpellingVariants,
	matchShortRecall,
	normalizeShortRecallAnswer,
	validateShortRecallPrompt
} from './shortRecall';

const ACCEPTED_GENERATED_COUNT = 179;
const ACCEPTED_GENERATED_SUBJECT_COUNTS = Object.freeze({
	biology: 34,
	chemistry: 71,
	physics: 74
});
const ACCEPTED_COMBINED_SUBJECT_COUNTS = Object.freeze({
	biology: 64,
	chemistry: 101,
	physics: 106
});

describe('short recall prompt catalog', () => {
	it('preserves the authored 92-prompt source byte-for-byte', () => {
		const source = readFileSync(new URL('./data/short-recall-prompts.v1.json', import.meta.url));
		expect(createHash('sha256').update(source).digest('hex')).toBe(
			'e767b4d4e8c20e1fa2fe3e999fe502138cf86a4c1dab2f3c9021faaf746fb1cb'
		);
	});

	it('covers the active catalog exactly once and in catalog order', () => {
		expect(bundledShortRecallPrompts.map((prompt) => prompt.challengeId)).toEqual(
			challengeCatalog.map((challenge) => challenge.id)
		);
		expect(new Set(bundledShortRecallPrompts.map((prompt) => prompt.challengeId)).size).toBe(
			challengeCatalog.length
		);

		const releaseExists = generatedScienceShortRecallChallengeIds.length > 0;
		expect(generatedScienceShortRecallChallengeIds).toHaveLength(
			releaseExists ? ACCEPTED_GENERATED_COUNT : 0
		);
		expect(challengeCatalog).toHaveLength(releaseExists ? 271 : 92);
		expect(generatedScienceShortRecallCountsBySubject).toEqual(
			releaseExists ? ACCEPTED_GENERATED_SUBJECT_COUNTS : { biology: 0, chemistry: 0, physics: 0 }
		);
		expect(challengesForSubject('biology')).toHaveLength(
			releaseExists ? ACCEPTED_COMBINED_SUBJECT_COUNTS.biology : 30
		);
		expect(challengesForSubject('chemistry')).toHaveLength(
			releaseExists ? ACCEPTED_COMBINED_SUBJECT_COUNTS.chemistry : 30
		);
		expect(challengesForSubject('physics')).toHaveLength(
			releaseExists ? ACCEPTED_COMBINED_SUBJECT_COUNTS.physics : 32
		);
	});

	it('compiles the accepted 179-prompt membership into the required 271-prompt snapshot', () => {
		const { prompts, challengeIds } = generatedPromptsFixture();
		const compiled = buildShortRecallPromptCatalog(rawShortRecallPrompts, prompts, challengeIds);

		expect(compiled.prompts).toHaveLength(271);
		expect(compiled.prompts.slice(0, 92).map(sourcePromptFields)).toEqual(rawShortRecallPrompts);
		expect(new Set(compiled.prompts.slice(0, 92).map((prompt) => prompt.contentVersion))).toEqual(
			new Set(['short-recall-v1'])
		);
		expect(new Set(compiled.prompts.slice(92).map((prompt) => prompt.contentVersion))).toEqual(
			new Set([GENERATED_SCIENCE_SHORT_RECALL_CONTENT_VERSION])
		);
		const crossCatalogAcceptedAnswer = normalizeShortRecallAnswer(prompts[0]!.canonicalAnswer);
		expect(compiled.prompts[0]!.spellingVariants?.map(normalizeShortRecallAnswer)).not.toContain(
			crossCatalogAcceptedAnswer
		);
	});

	it('allows an authored-only catalog only with absent runtime membership', () => {
		expect(buildShortRecallPromptCatalog(rawShortRecallPrompts, [], []).prompts).toHaveLength(92);

		const { prompts, challengeIds } = generatedPromptsFixture();
		expect(() =>
			buildShortRecallPromptCatalog(rawShortRecallPrompts, prompts.slice(0, -1), challengeIds)
		).toThrow(/complete accepted runtime/);
		expect(() => buildShortRecallPromptCatalog(rawShortRecallPrompts, prompts, [])).toThrow(
			/complete accepted runtime/
		);

		const reordered = [...prompts];
		[reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
		expect(() =>
			buildShortRecallPromptCatalog(rawShortRecallPrompts, reordered, challengeIds)
		).toThrow(/membership or order/);
	});

	it('keeps every prompt short, inspectable and valid', () => {
		for (const prompt of bundledShortRecallPrompts) {
			expect(validateShortRecallPrompt(prompt), prompt.challengeId).not.toBeNull();
			expect(prompt.stem.match(/___/g), prompt.challengeId).toHaveLength(1);
			for (const answer of [prompt.canonicalAnswer, ...prompt.acceptedAliases]) {
				expect(
					normalizeShortRecallAnswer(answer).split(' ').filter(Boolean).length,
					`${prompt.challengeId}: ${answer}`
				).toBeGreaterThanOrEqual(1);
				expect(
					normalizeShortRecallAnswer(answer).split(' ').filter(Boolean).length,
					`${prompt.challengeId}: ${answer}`
				).toBeLessThanOrEqual(2);
			}
		}
	});

	it('removes generated typo variants that are valid answers elsewhere', () => {
		const accepted = new Set(
			bundledShortRecallPrompts.flatMap((prompt) =>
				[prompt.canonicalAnswer, ...prompt.acceptedAliases].map(normalizeShortRecallAnswer)
			)
		);

		for (const prompt of bundledShortRecallPrompts) {
			const rawVariants = generateSpellingVariants([
				prompt.canonicalAnswer,
				...prompt.acceptedAliases
			]);
			expect(prompt.spellingVariants?.length ?? 0).toBeLessThanOrEqual(rawVariants.length);
			for (const variant of prompt.spellingVariants ?? []) {
				expect(accepted.has(normalizeShortRecallAnswer(variant)), prompt.challengeId).toBe(false);
			}
		}
	});

	it('accepts standard no-space force notation for both zero-resultant prompts', () => {
		for (const challengeId of ['physics-drag-balance', 'physics-exp-tug-of-war-zero-resultant']) {
			const prompt = bundledShortRecallPrompts.find(
				(candidate) => candidate.challengeId === challengeId
			);
			expect(prompt, challengeId).toBeDefined();
			expect(matchShortRecall('0N', prompt!), challengeId).toMatchObject({
				correct: true,
				kind: 'alias'
			});
		}
	});
});

function sourcePromptFields(prompt: (typeof bundledShortRecallPrompts)[number]) {
	return {
		challengeId: prompt.challengeId,
		stem: prompt.stem,
		canonicalAnswer: prompt.canonicalAnswer,
		acceptedAliases: prompt.acceptedAliases,
		preferredHiddenStepIndex: prompt.preferredHiddenStepIndex
	};
}

function generatedPromptsFixture() {
	const challengeIds = Array.from(
		{ length: ACCEPTED_GENERATED_COUNT },
		(_, index) => `generated-science-${String(index + 1).padStart(3, '0')}`
	);
	const collision = generateSpellingVariants([
		rawShortRecallPrompts[0]!.canonicalAnswer,
		...rawShortRecallPrompts[0]!.acceptedAliases
	])[0]!;
	const prompts = challengeIds.map((challengeId, index) => ({
		challengeId,
		stem: `Generated science statement ${index + 1} needs the ___.`,
		canonicalAnswer: index === 0 ? collision : `term${index + 1}`,
		acceptedAliases: [],
		preferredHiddenStepIndex: 1,
		contentVersion: GENERATED_SCIENCE_SHORT_RECALL_CONTENT_VERSION
	}));
	return { prompts, challengeIds };
}
