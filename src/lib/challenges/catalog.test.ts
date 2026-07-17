import { describe, expect, it } from 'vitest';
import {
	challengeArcs,
	challengeByRoute,
	challengeCatalog,
	challengePath,
	challengeSubjects,
	challengesForSubject
} from './catalog';
import type { ChallengeChoice } from './types';

const expectedChallengeIds = [
	'biology-data-conclusions',
	'biology-cell-differences',
	'biology-extra-controls',
	'biology-enzyme-denature',
	'biology-reagent-colour',
	'biology-heated-food-test',
	'biology-ivf-sequence',
	'biology-vaccine-immunity',
	'physics-gas-pressure',
	'physics-half-range',
	'physics-weight-equation',
	'physics-momentum-sharing',
	'physics-conductivity-rate',
	'physics-motor-force',
	'physics-parallel-currents',
	'physics-resultant-acceleration',
	'physics-radiation-risk',
	'physics-drag-balance',
	'physics-thinking-distance',
	'physics-zero-resultant'
] as const;

const expectedWeakAnswerKinds = {
	'biology-data-conclusions': 'incorrect-claim',
	'biology-cell-differences': 'incomplete',
	'biology-extra-controls': 'off-command',
	'biology-enzyme-denature': 'incorrect-claim',
	'biology-reagent-colour': 'incomplete',
	'biology-heated-food-test': 'incomplete',
	'biology-ivf-sequence': 'incorrect-claim',
	'biology-vaccine-immunity': 'incorrect-claim',
	'physics-gas-pressure': 'incorrect-claim',
	'physics-half-range': 'wrong-value',
	'physics-weight-equation': 'incorrect-claim',
	'physics-momentum-sharing': 'incorrect-claim',
	'physics-conductivity-rate': 'incomplete',
	'physics-motor-force': 'incorrect-claim',
	'physics-parallel-currents': 'wrong-value',
	'physics-resultant-acceleration': 'incomplete',
	'physics-radiation-risk': 'incorrect-claim',
	'physics-drag-balance': 'incorrect-claim',
	'physics-thinking-distance': 'wrong-value',
	'physics-zero-resultant': 'incorrect-claim'
} as const;

const reviewedWeakAnswerSourceIds = new Set([
	'84611h-jun24-01-6',
	'8464b1h-jun24-05-2',
	'8464b2h-jun24-06-5',
	'8464b1h-jun24-04-3',
	'8464b1h-jun24-01-3',
	'8464b1h-jun24-01-2',
	'8464b2h-jun24-03-5',
	'8464b1h-jun24-03-3',
	'84631h-jun24-08-1',
	'84632h-jun24-05-4',
	'8464p2h-jun24-06-2',
	'8464p2h-jun22-03-2',
	'aqa-8464p1h-qp-nov20-05-3',
	'8464p2h-jun22-04-1',
	'8464p1h-jun18-06-2',
	'84632h-jun24-02-4',
	'aqa-8464p2h-qp-nov20-05.2',
	'8464p2h-jun24-06-4',
	'aqa-8464p2h-qp-jun18-06-1',
	'84632h-jun24-02-1'
]);

const questionChainById = new Map<string, string>([
	['84611h-jun24-01-6', 'biology-data-conclusions'],
	['8464b1h-jun24-04-2', 'biology-data-conclusions'],
	['8464b1h-jun24-05-2', 'biology-cell-differences'],
	['84611h-nov20-03-2', 'biology-cell-differences'],
	['8464b2h-jun24-06-5', 'biology-extra-controls'],
	['84611h-nov20-06-1', 'biology-extra-controls'],
	['8464b1h-jun24-04-3', 'biology-enzyme-denature'],
	['84611h-nov20-01-8', 'biology-enzyme-denature'],
	['8464b1h-jun24-01-3', 'biology-reagent-colour'],
	['84611h-nov20-04-5', 'biology-reagent-colour'],
	['8464b1h-jun24-01-2', 'biology-heated-food-test'],
	['84611h-nov20-04-4', 'biology-heated-food-test'],
	['8464b2h-jun24-03-5', 'biology-ivf-sequence'],
	['8464b2h-jun22-05-5', 'biology-ivf-sequence'],
	['8464b1h-jun24-03-3', 'biology-vaccine-immunity'],
	['8464b1h-nov20-04-2', 'biology-vaccine-immunity'],
	['84631h-jun24-08-1', 'physics-gas-pressure'],
	['aqa-8464p1h-qp-jun22-04-4', 'physics-gas-pressure'],
	['84632h-jun24-05-4', 'physics-half-range'],
	['aqa-8464p1h-qp-jun22-04-2', 'physics-half-range'],
	['8464p2h-jun24-06-2', 'physics-weight-equation'],
	['aqa-8464p2h-qp-nov20-01.4', 'physics-weight-equation'],
	['8464p2h-jun22-03-2', 'physics-momentum-sharing'],
	['aqa-8464p2h-nov20-04-5', 'physics-momentum-sharing'],
	['aqa-8464p1h-qp-nov20-05-3', 'physics-conductivity-rate'],
	['8464p1h-jun23-06-2', 'physics-conductivity-rate'],
	['8464p2h-jun22-04-1', 'physics-motor-force'],
	['8464p2h-jun23-04-3', 'physics-motor-force'],
	['8464p1h-jun18-06-2', 'physics-parallel-currents'],
	['aqa-8464p1h-nov21-05-4', 'physics-parallel-currents'],
	['84632h-jun24-02-4', 'physics-resultant-acceleration'],
	['84632h-jun24-05-5', 'physics-resultant-acceleration'],
	['aqa-8464p2h-qp-nov20-05.2', 'physics-radiation-risk'],
	['8464p1h-jun19-06-4', 'physics-radiation-risk'],
	['8464p2h-jun24-06-4', 'physics-drag-balance'],
	['aqa-8464p2h-qp-jun18-07-2', 'physics-drag-balance'],
	['aqa-8464p2h-qp-jun18-06-1', 'physics-thinking-distance'],
	['8464p2h-jun22-06-1', 'physics-thinking-distance'],
	['84632h-jun24-02-1', 'physics-zero-resultant'],
	['aqa-8464p2h-qp-jun18-01-1', 'physics-zero-resultant']
]);

function correctIndex(choices: ChallengeChoice[]): number {
	return choices.findIndex((choice) => choice.correct);
}

function wordCount(text: string): number {
	return text
		.trim()
		.split(/\s+/u)
		.filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function sentenceCount(text: string): number {
	return text.trim().split(/(?<=[.!?])\s+(?=[A-Z])/u).length;
}

function expectThreeChoicesWithOneCorrect(choices: ChallengeChoice[]): void {
	expect(choices).toHaveLength(3);
	expect(new Set(choices.map((choice) => choice.id)).size).toBe(3);
	expect(choices.filter((choice) => choice.correct)).toHaveLength(1);
	for (const choice of choices) {
		expect(choice.id.trim().length).toBeGreaterThan(0);
		expect(choice.text.trim().length).toBeGreaterThan(0);
		expect(choice.feedback?.trim().length).toBeGreaterThan(0);
	}
}

describe('challenge launch catalog', () => {
	it('contains exactly the 8 Biology and 12 Physics reviewed launch definitions', () => {
		expect(challengeCatalog).toHaveLength(20);
		expect(challengeCatalog.map((challenge) => challenge.id)).toEqual(expectedChallengeIds);
		expect(challengesForSubject('biology')).toHaveLength(8);
		expect(challengesForSubject('physics')).toHaveLength(12);
	});

	it('uses unique ids, slugs and public paths', () => {
		const ids = challengeCatalog.map((challenge) => challenge.id);
		const slugs = challengeCatalog.map((challenge) => challenge.slug);
		const paths = challengeCatalog.map(challengePath);

		expect(new Set(ids).size).toBe(challengeCatalog.length);
		expect(new Set(slugs).size).toBe(challengeCatalog.length);
		expect(new Set(paths).size).toBe(challengeCatalog.length);

		for (const challenge of challengeCatalog) {
			expect(challenge.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(challengePath(challenge)).toBe(`/challenges/${challenge.subject}/${challenge.slug}`);
		}
	});

	it('resolves routes and subject filters without inventing fallback content', () => {
		const biologyHero = challengeByRoute('biology', 'smoking-risk-data-conclusions');
		expect(biologyHero?.id).toBe('biology-data-conclusions');
		expect(challengeByRoute(' BIOLOGY ', ' SMOKING-RISK-DATA-CONCLUSIONS ')?.id).toBe(
			'biology-data-conclusions'
		);
		expect(challengeByRoute('biology', 'does-not-exist')).toBeUndefined();
		expect(challengeByRoute('chemistry', 'smoking-risk-data-conclusions')).toBeUndefined();
		expect(challengesForSubject('chemistry')).toEqual([]);
	});

	it('keeps source and transfer questions distinct but within the same reviewed chain', () => {
		for (const challenge of challengeCatalog) {
			expect(reviewedWeakAnswerSourceIds.has(challenge.sourceQuestionId)).toBe(true);
			expect(challenge.sourceQuestionId).not.toBe(challenge.transferQuestionId);
			expect(questionChainById.has(challenge.sourceQuestionId)).toBe(true);
			expect(questionChainById.has(challenge.transferQuestionId)).toBe(true);
			expect(questionChainById.get(challenge.sourceQuestionId)).toBe(
				questionChainById.get(challenge.transferQuestionId)
			);
		}
	});

	it('contains complete, versioned and learner-facing content', () => {
		const requiredStringFields = [
			'id',
			'slug',
			'title',
			'topic',
			'hook',
			'previewQuestion',
			'metaDescription',
			'sourceQuestionId',
			'transferQuestionId',
			'lastReviewed',
			'showdownExplanation',
			'commandWordLesson',
			'diagnosisPrompt',
			'repairPrompt',
			'repairSuccess',
			'transferPromptLead',
			'transferExplanation',
			'memoryHandle'
		] as const;

		for (const challenge of challengeCatalog) {
			for (const field of requiredStringFields) {
				expect(challenge[field].trim().length, `${challenge.id}.${field}`).toBeGreaterThan(0);
			}
			expect(challenge.lastReviewed).toBe('2026-07-17');
			expect(challenge.version).toBe(1);
			expect(Number.isInteger(challenge.estimatedMinutes)).toBe(true);
			expect(challenge.estimatedMinutes).toBeGreaterThanOrEqual(4);
			expect(challenge.estimatedMinutes).toBeLessThanOrEqual(6);
			expect(challenge.staticAnswers.a.trim().length).toBeGreaterThan(0);
			expect(challenge.staticAnswers.b.trim().length).toBeGreaterThan(0);
			expect(challenge.staticAnswers.a).not.toBe(challenge.staticAnswers.b);
			expect(challenge.strongerAnswer).not.toBe(challenge.weakAnswer);
			expect(new Set([challenge.strongerAnswer, challenge.weakAnswer])).toEqual(
				new Set(['a', 'b'])
			);
			expect(
				`${challenge.staticAnswers[challenge.weakAnswer]} ${challenge.showdownExplanation}`
			).not.toMatch(/\b\d+\s*\/\s*\d+\b/);
		}
	});

	it('keeps answer showdowns balanced so length and sentence count do not reveal the stronger answer', () => {
		const withinTwentyPercent: string[] = [];

		for (const challenge of challengeCatalog) {
			const answerWordCounts = [
				wordCount(challenge.staticAnswers.a),
				wordCount(challenge.staticAnswers.b)
			];
			const shorter = Math.min(...answerWordCounts);
			const longer = Math.max(...answerWordCounts);
			const lengthRatio = longer / shorter;

			expect(lengthRatio, `${challenge.id} answer-word-count ratio`).toBeLessThanOrEqual(1.35);
			if (lengthRatio <= 1.2) withinTwentyPercent.push(challenge.id);
			expect(
				Math.abs(
					sentenceCount(challenge.staticAnswers.a) - sentenceCount(challenge.staticAnswers.b)
				),
				`${challenge.id} sentence-count difference`
			).toBeLessThanOrEqual(1);
		}

		expect(withinTwentyPercent).toHaveLength(challengeCatalog.length);
	});

	it('classifies the reviewed weakness learners are being asked to repair', () => {
		const allowedKinds = new Set(['incomplete', 'incorrect-claim', 'wrong-value', 'off-command']);
		const usedKinds = new Set(challengeCatalog.map((challenge) => challenge.weakAnswerKind));

		for (const challenge of challengeCatalog) {
			expect(allowedKinds.has(challenge.weakAnswerKind), challenge.id).toBe(true);
		}
		expect(usedKinds).toEqual(allowedKinds);
		expect(
			Object.fromEntries(
				challengeCatalog.map((challenge) => [challenge.id, challenge.weakAnswerKind])
			)
		).toEqual(expectedWeakAnswerKinds);
	});

	it('requires appropriate heating for Benedict’s test without treating one apparatus as mandatory', () => {
		const benedicts = challengeByRoute('biology', 'benedicts-sugar-test');
		expect(benedicts).toBeDefined();
		if (!benedicts) throw new Error('Benedict’s challenge is missing');

		expect(benedicts.staticAnswers[benedicts.weakAnswer]).not.toMatch(/\bwarm\b/i);
		expect(benedicts.diagnosisChoices.find((choice) => choice.correct)?.text).toMatch(
			/appropriate heating method/i
		);
		const acceptedHeatingPhrases = benedicts.freeTextKeywordGroups.flat();
		expect(acceptedHeatingPhrases).toContain('hot water bath');
		expect(acceptedHeatingPhrases).toContain('heating block');
		expect(acceptedHeatingPhrases).toContain('electric test tube heater');
	});

	it('provides exactly three plausible choices and one correct choice at every stage', () => {
		for (const challenge of challengeCatalog) {
			expectThreeChoicesWithOneCorrect(challenge.diagnosisChoices);
			expectThreeChoicesWithOneCorrect(challenge.repairChoices);
			expectThreeChoicesWithOneCorrect(challenge.transferChoices);
		}
	});

	it('mixes correct positions without making answer length a reliable shortcut', () => {
		const stages = [
			challengeCatalog.map((challenge) => challenge.diagnosisChoices),
			challengeCatalog.map((challenge) => challenge.repairChoices),
			challengeCatalog.map((challenge) => challenge.transferChoices)
		];

		for (const choicesAtStage of stages) {
			expect(new Set(choicesAtStage.map(correctIndex))).toEqual(new Set([0, 1, 2]));

			let correctStrictlyLongest = 0;
			let correctStrictlyShortest = 0;
			for (const choices of choicesAtStage) {
				const counts = choices.map((choice) => wordCount(choice.text));
				const correctChoiceIndex = correctIndex(choices);
				const correctLength = counts[correctChoiceIndex];
				const distractorLengths = counts.filter((_, index) => index !== correctChoiceIndex);
				const longest = Math.max(...counts);
				const shortest = Math.min(...counts);

				expect(longest - shortest).toBeLessThanOrEqual(6);
				if (longest >= 5) {
					expect(shortest / longest).toBeGreaterThanOrEqual(0.6);
				}
				if (correctLength > Math.max(...distractorLengths)) correctStrictlyLongest += 1;
				if (correctLength < Math.min(...distractorLengths)) correctStrictlyShortest += 1;
			}

			expect(correctStrictlyLongest).toBeLessThanOrEqual(challengeCatalog.length / 2);
			expect(correctStrictlyShortest).toBeLessThanOrEqual(challengeCatalog.length / 2);
		}

		expect(new Set(challengeCatalog.map((challenge) => challenge.strongerAnswer))).toEqual(
			new Set(['a', 'b'])
		);
	});

	it('has usable synonym groups for free-text repair checking', () => {
		for (const challenge of challengeCatalog) {
			expect(challenge.freeTextKeywordGroups.length).toBeGreaterThan(0);
			for (const group of challenge.freeTextKeywordGroups) {
				expect(group.length).toBeGreaterThan(0);
				expect(new Set(group).size).toBe(group.length);
				for (const synonym of group) {
					expect(synonym.trim().length).toBeGreaterThan(0);
				}
			}
		}
	});

	it('keeps every SEO description useful, concise and unique', () => {
		const descriptions = challengeCatalog.map((challenge) => challenge.metaDescription);
		expect(new Set(descriptions).size).toBe(descriptions.length);
		for (const challenge of challengeCatalog) {
			expect(challenge.metaDescription.length, challenge.id).toBeGreaterThanOrEqual(90);
			expect(challenge.metaDescription.length, challenge.id).toBeLessThan(170);
			expect(challenge.metaDescription).toMatch(/GCSE (Biology|Physics)/);
		}
	});

	it('exposes ordered subject and arc metadata with valid hero routes', () => {
		expect(challengeSubjects.map((subject) => subject.subject)).toEqual(['biology', 'physics']);
		for (const subject of challengeSubjects) {
			expect(subject.label.trim().length).toBeGreaterThan(0);
			expect(subject.description.trim().length).toBeGreaterThan(0);
			expect(subject.accent.trim().length).toBeGreaterThan(0);
			expect(challengeByRoute(subject.subject, subject.heroSlug)).toBeDefined();
		}

		const arcIds = challengeArcs.map((arc) => arc.id);
		expect(new Set(arcIds).size).toBe(challengeArcs.length);
		expect(new Set(challengeCatalog.map((challenge) => challenge.arc))).toEqual(new Set(arcIds));
		for (const arc of challengeArcs) {
			expect(arc.label.trim().length).toBeGreaterThan(0);
			expect(arc.description.trim().length).toBeGreaterThan(0);
		}
	});
});
