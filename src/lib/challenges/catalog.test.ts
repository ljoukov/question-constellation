import { describe, expect, it } from 'vitest';
import {
	challengeArcs,
	challengeByRoute,
	challengeCatalog,
	challengePath,
	challengeSubjects,
	challengesForSubject
} from './catalog';
import { challengeIds, challengeRouteIdentities } from './catalogIdentity';
import type { ChallengeChoice } from './types';

const expectedWeakAnswerKinds = {
	'biology-data-conclusions': 'incorrect-claim',
	'biology-cell-differences': 'incomplete',
	'biology-extra-controls': 'off-command',
	'biology-enzyme-denature': 'incorrect-claim',
	'biology-reagent-colour': 'incomplete',
	'biology-heated-food-test': 'incomplete',
	'biology-ivf-sequence': 'incorrect-claim',
	'biology-vaccine-immunity': 'incorrect-claim',
	'biology-homeostasis-control': 'incorrect-claim',
	'biology-recessive-inheritance': 'wrong-value',
	'chemistry-alloy-hardness': 'incorrect-claim',
	'chemistry-collision-rate': 'incorrect-claim',
	'chemistry-stoichiometric-mass': 'wrong-value',
	'chemistry-constant-mass': 'incorrect-claim',
	'chemistry-ionic-bonding': 'incorrect-claim',
	'chemistry-molten-electrolysis': 'incorrect-claim',
	'chemistry-exothermic-energy': 'incorrect-claim',
	'chemistry-flame-tests': 'incomplete',
	'chemistry-equilibrium-pressure': 'incorrect-claim',
	'chemistry-life-cycle': 'incorrect-claim',
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
	'8464c1h-jun24-01-2',
	'84622h-jun24-09-5',
	'8464c1h-jun24-05-2',
	'84622h-jun24-01-3',
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
	['8464c1h-jun24-01-2', 'chemistry-alloy-hardness'],
	['8464c1h-jun22-05-3', 'chemistry-alloy-hardness'],
	['84622h-jun24-09-5', 'chemistry-collision-rate'],
	['8464c2h-jun24-02-2', 'chemistry-collision-rate'],
	['8464c1h-jun24-05-2', 'chemistry-stoichiometric-mass'],
	['8464c1h-nov20-06-3', 'chemistry-stoichiometric-mass'],
	['84622h-jun24-01-3', 'chemistry-constant-mass'],
	['8464c2h-jun24-06-3', 'chemistry-constant-mass'],
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
	it('contains exactly 30 Biology, 30 Chemistry and 32 Physics definitions', () => {
		expect(challengeCatalog).toHaveLength(92);
		expect(challengeCatalog.map((challenge) => challenge.id)).toEqual(challengeIds);
		expect(challengeCatalog.map(({ id, slug, subject }) => ({ id, slug, subject }))).toEqual(
			challengeRouteIdentities
		);
		expect(challengesForSubject('biology')).toHaveLength(30);
		expect(challengesForSubject('chemistry')).toHaveLength(30);
		expect(challengesForSubject('physics')).toHaveLength(32);
	});

	it('provides two question contexts per challenge for 60, 60 and 64 subject contexts', () => {
		expect(challengesForSubject('biology').length * 2).toBe(60);
		expect(challengesForSubject('chemistry').length * 2).toBe(60);
		expect(challengesForSubject('physics').length * 2).toBe(64);
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
		expect(challengeByRoute('chemistry', 'temperature-collision-rate')?.id).toBe(
			'chemistry-collision-rate'
		);
		expect(challengeByRoute(' CHEMISTRY ', ' TEMPERATURE-COLLISION-RATE ')?.id).toBe(
			'chemistry-collision-rate'
		);
		expect(challengeByRoute('chemistry', 'smoking-risk-data-conclusions')).toBeUndefined();
	});

	it('keeps the four original authored Chemistry cases stable', () => {
		const originalChemistryIds = new Set([
			'chemistry-alloy-hardness',
			'chemistry-collision-rate',
			'chemistry-stoichiometric-mass',
			'chemistry-constant-mass'
		]);
		expect(
			challengesForSubject('chemistry')
				.filter(({ id }) => originalChemistryIds.has(id))
				.map(({ id, slug, marks }) => ({
					id,
					slug,
					marks
				}))
		).toEqual([
			{
				id: 'chemistry-alloy-hardness',
				slug: 'alloy-hardness',
				marks: 3
			},
			{
				id: 'chemistry-collision-rate',
				slug: 'temperature-collision-rate',
				marks: 3
			},
			{
				id: 'chemistry-stoichiometric-mass',
				slug: 'ammonia-to-hydrogen-mass',
				marks: 4
			},
			{
				id: 'chemistry-constant-mass',
				slug: 'heat-to-constant-mass',
				marks: 1
			}
		]);
	});

	it('keeps reviewed Biology feedback consistent with the visible prompt and command', () => {
		const dataConclusions = challengeCatalog.find(({ id }) => id === 'biology-data-conclusions');
		const controls = challengeCatalog.find(({ id }) => id === 'biology-extra-controls');
		const ivf = challengeCatalog.find(({ id }) => id === 'biology-ivf-sequence');
		const vaccine = challengeCatalog.find(({ id }) => id === 'biology-vaccine-immunity');

		expect(dataConclusions).toBeDefined();
		expect(controls).toBeDefined();
		expect(ivf).toBeDefined();
		expect(vaccine).toBeDefined();

		expect(dataConclusions?.repairChoices.map(({ text }) => text).join(' ')).not.toMatch(
			/\bdisease H\b/i
		);
		expect(dataConclusions?.repairChoices.map(({ text }) => text).join(' ')).toMatch(
			/\bdisease Z\b/i
		);

		expect(controls?.freeTextKeywordGroups).toHaveLength(2);
		expect(controls?.staticAnswers.b).toMatch(/\bsame hand\b/i);
		expect(controls?.staticAnswers.b).toMatch(/\bsame amount of sleep\b/i);
		expect(
			controls?.transferChoices.find(({ id }) => id === 'liver-disease-gender')?.feedback
		).not.toMatch(/\bexcluded\b/i);

		expect(ivf?.transferChoices.find(({ id }) => id === 'fertilise-inside')?.feedback).toMatch(
			/laboratory rather than the uterus/i
		);
		expect(ivf?.transferChoices.find(({ id }) => id === 'collect-insert-eggs')?.feedback).toMatch(
			/transferred to the uterus/i
		);

		expect(vaccine?.diagnosisChoices.find(({ id }) => id === 'must-be-live')?.feedback).toBe(
			'Lymphocytes make specific antibodies; phagocytes do not.'
		);
	});

	it('requires the activation-energy link in the collision-theory challenge', () => {
		const collisionRate = challengeCatalog.find(({ id }) => id === 'chemistry-collision-rate');
		expect(collisionRate).toBeDefined();

		expect(collisionRate?.freeTextKeywordGroups.flat()).not.toContain('successful collisions');
		expect(collisionRate?.repairChoices.find(({ correct }) => correct)?.text).toMatch(
			/enough energy to react/i
		);
		expect(collisionRate?.transferChoices.find(({ correct }) => correct)?.text).toMatch(
			/enough energy to react/i
		);
		expect(collisionRate?.memoryHandle).toMatch(/activation energy/i);
	});

	it('uses distinct, source-matched Chemistry transfer contexts', () => {
		const stoichiometry = challengeCatalog.find(({ id }) => id === 'chemistry-stoichiometric-mass');
		const constantMass = challengeCatalog.find(({ id }) => id === 'chemistry-constant-mass');

		expect(stoichiometry).toBeDefined();
		expect(constantMass).toBeDefined();

		expect(stoichiometry?.transferQuestionId).toBe('8464c1h-nov20-06-3');
		expect(stoichiometry?.transferPromptLead).toMatch(/gold reacts with chlorine/i);
		expect(stoichiometry?.transferPromptLead).not.toMatch(/\bammonia\b/i);
		expect(stoichiometry?.transferChoices.find(({ correct }) => correct)?.text).toMatch(
			/94\.6.*mg/i
		);

		expect(constantMass?.transferQuestionId).toBe('8464c2h-jun24-06-3');
		expect(constantMass?.transferPromptLead).toMatch(/seawater sample/i);
		expect(constantMass?.transferExplanation).toMatch(/dissolved-solid mass/i);
		expect(
			[
				constantMass?.transferPromptLead,
				constantMass?.transferExplanation,
				...constantMass!.transferChoices.map(({ text, feedback }) => [text, feedback ?? '']).flat()
			].join(' ')
		).not.toMatch(/\bprecipitate\b/i);
	});

	it('keeps internal source lineage and product jargon out of Chemistry learner copy', () => {
		for (const challenge of challengesForSubject('chemistry')) {
			const learnerCopy = [
				challenge.title,
				challenge.topic,
				challenge.hook,
				challenge.previewQuestion,
				challenge.staticAnswers.a,
				challenge.staticAnswers.b,
				challenge.showdownExplanation,
				challenge.commandWordLesson,
				challenge.diagnosisPrompt,
				...challenge.diagnosisChoices.flatMap(({ text, feedback }) => [text, feedback ?? '']),
				challenge.repairPrompt,
				...challenge.repairChoices.flatMap(({ text, feedback }) => [text, feedback ?? '']),
				challenge.repairSuccess,
				challenge.transferPromptLead,
				...challenge.transferChoices.flatMap(({ text, feedback }) => [text, feedback ?? '']),
				challenge.transferExplanation,
				challenge.memoryHandle
			].join(' ');

			expect(learnerCopy).not.toMatch(
				/\b(?:past paper|source reconstruction|mark scheme|question chain|repair|difficulty)\b/i
			);
			if (challenge.sourceQuestionId) {
				expect(learnerCopy).not.toContain(challenge.sourceQuestionId);
			}
			if (challenge.transferQuestionId) {
				expect(learnerCopy).not.toContain(challenge.transferQuestionId);
			}
		}
	});

	it('validates optional internal provenance without making it a launch requirement', () => {
		for (const challenge of challengeCatalog) {
			const { sourceQuestionId, transferQuestionId } = challenge;
			if (!sourceQuestionId && !transferQuestionId) continue;

			expect(sourceQuestionId).toBeDefined();
			expect(transferQuestionId).toBeDefined();
			if (!sourceQuestionId || !transferQuestionId) continue;
			expect(reviewedWeakAnswerSourceIds.has(sourceQuestionId)).toBe(true);
			expect(sourceQuestionId).not.toBe(transferQuestionId);
			expect(questionChainById.has(sourceQuestionId)).toBe(true);
			expect(questionChainById.has(transferQuestionId)).toBe(true);
			expect(questionChainById.get(sourceQuestionId)).toBe(
				questionChainById.get(transferQuestionId)
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
			expect(challenge.lastReviewed).toMatch(/^2026-07-(?:17|21)$/);
			expect(challenge.version).toBeGreaterThanOrEqual(1);
			expect(challenge.version).toBeLessThanOrEqual(2);
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
		const actualById = Object.fromEntries(
			challengeCatalog.map((challenge) => [challenge.id, challenge.weakAnswerKind])
		);
		for (const [id, kind] of Object.entries(expectedWeakAnswerKinds)) {
			expect(actualById[id], id).toBe(kind);
		}
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
			expect(challenge.metaDescription).toMatch(/GCSE (Biology|Chemistry|Physics)/);
		}
	});

	it('exposes ordered subject and arc metadata with valid hero routes', () => {
		expect(challengeSubjects.map((subject) => subject.subject)).toEqual([
			'biology',
			'chemistry',
			'physics'
		]);
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
