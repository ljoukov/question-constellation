import { describe, expect, it } from 'vitest';

import {
	RECALL_COMPANION_ARTIFACT_SCHEMA_VERSION,
	recallHashBoundCompanionEntries
} from '../../../scripts/lib/recall-card-artifacts.mjs';
import {
	RECALL_REVIEW_CHECKS,
	compileRecallCardBundle,
	validateRecallCandidateBatch,
	validateRecallCardBundle,
	validateRecallCueReviews,
	validateRecallFullReviews
} from '../../../scripts/lib/recall-card-bundle.mjs';

const pageText =
	'Vaccination involves introducing small quantities of dead or inactive forms of a pathogen into the body. This stimulates white blood cells to produce antibodies against the pathogen.';

describe('versioned recall card bundle', () => {
	it('compiles only exact, independently accepted, evidence-grounded cards', () => {
		const candidates = validateRecallCandidateBatch(candidateBatch(), {
			subject: 'Biology',
			pageText,
			expectedCount: 1
		});
		const fullReviews = validateRecallFullReviews(fullReview(true), ['bio-vaccination-antibodies']);
		const completeCards = candidates.cards.map((card) => ({ ...card, subject: 'Biology' }));
		const cueReviews = validateRecallCueReviews(cueReview(true), completeCards, 'Biology');
		const { bundle, rejectedCards } = compileRecallCardBundle({
			candidates,
			fullReviews,
			cueReviews,
			evidence: evidenceFixture(),
			run: runFixture(),
			companionArtifacts: companionArtifactsFixture()
		});

		expect(rejectedCards).toEqual([]);
		expect(bundle.schemaVersion).toBe('recall-card-bundle-v2');
		expect(bundle.promptVersion).toBe('recall-card-compiler-v10');
		expect(bundle.cards[0]).toEqual(
			expect.objectContaining({
				id: 'bio-vaccination-antibodies',
				contentRevision: 1,
				contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
				memoryTip: null
			})
		);
		expect(bundle.cards[0].choices).toHaveLength(4);
		expect(bundle.cards[0].evidence[0]).toEqual(
			expect.objectContaining({
				specificationId: 'aqa-8464',
				curriculumComponentId: 'aqa-8464-vaccination',
				sourceFileHash: 'a'.repeat(64),
				excerptHash: expect.stringMatching(/^[a-f0-9]{64}$/)
			})
		);
		expect(
			bundle.cards[0].targets.filter((target: Record<string, unknown>) => target.isPrimary === true)
		).toHaveLength(1);
	});

	it('accepts three choices for compiler-v10 while compiler-v9 remains exact-four', () => {
		const raw = candidateBatch();
		raw.cards[0].choices.pop();
		raw.cards[0].evidence.supports = raw.cards[0].evidence.supports.filter(
			(support: string) => !support.includes('antibiotics')
		);
		const candidates = validateRecallCandidateBatch(raw, {
			subject: 'Biology',
			pageText,
			expectedCount: 1
		});
		const completeCards = candidates.cards.map((card) => ({ ...card, subject: 'Biology' }));
		const { bundle } = compileRecallCardBundle({
			candidates,
			fullReviews: validateRecallFullReviews(fullReview(true), ['bio-vaccination-antibodies']),
			cueReviews: validateRecallCueReviews(cueReview(true), completeCards, 'Biology'),
			evidence: evidenceFixture(),
			run: runFixture(),
			companionArtifacts: companionArtifactsFixture()
		});

		expect(bundle.promptVersion).toBe('recall-card-compiler-v10');
		expect(validateRecallCardBundle(bundle).cards[0].choices).toHaveLength(3);

		const relabelledAsV9 = structuredClone(bundle);
		relabelledAsV9.promptVersion = 'recall-card-compiler-v9';
		relabelledAsV9.run.id = 'recall-test-run-compiler-v9';
		for (const card of relabelledAsV9.cards) {
			card.provenance.promptVersion = relabelledAsV9.promptVersion;
			card.provenance.generationRunId = relabelledAsV9.run.id;
		}
		expect(() => validateRecallCardBundle(relabelledAsV9)).toThrow(
			/exactly four items for recall-card-compiler-v9/
		);
	});

	it('rejects answer-control language, non-diagnostic choices and invented quotes', () => {
		const raw = candidateBatch();
		raw.cards[0].front = 'Choose the correct answer about vaccination.';
		raw.cards[0].choices[1].text = raw.cards[0].choices[0].text;
		raw.cards[0].evidence.sourceExcerpt = 'This sentence was not in the official PDF.';

		expect(() =>
			validateRecallCandidateBatch(raw, {
				subject: 'Biology',
				pageText,
				expectedCount: 1
			})
		).toThrow(/must not mention answer controls/);
		expect(() =>
			validateRecallCandidateBatch(raw, {
				subject: 'Biology',
				pageText,
				expectedCount: 1
			})
		).toThrow(/normalized choice text must be unique/);
		expect(() =>
			validateRecallCandidateBatch(raw, {
				subject: 'Biology',
				pageText,
				expectedCount: 1
			})
		).toThrow(/not an exact quote/);
	});

	it('rejects current generator output outside the exact three-or-four range', () => {
		const twoChoices = candidateBatch();
		twoChoices.cards[0].choices.splice(2);
		expect(() =>
			validateRecallCandidateBatch(twoChoices, {
				subject: 'Biology',
				pageText,
				expectedCount: 1
			})
		).toThrow(/exactly three or four choices/);

		const fiveChoices = candidateBatch();
		fiveChoices.cards[0].choices.push({
			choiceKey: 'extra',
			text: 'It causes an unrelated extra response.',
			isCorrect: false,
			feedback: 'This is not the response stated by the specification.',
			misconception: 'Adds an unrelated response.'
		});
		expect(() =>
			validateRecallCandidateBatch(fiveChoices, {
				subject: 'Biology',
				pageText,
				expectedCount: 1
			})
		).toThrow(/exactly three or four choices/);
	});

	it('collapses PDF line breaks in an otherwise exact source excerpt', () => {
		const raw = candidateBatch();
		raw.cards[0].evidence.sourceExcerpt =
			'This stimulates white blood cells\n\tto produce antibodies against the pathogen.';

		const normalized = validateRecallCandidateBatch(raw, {
			subject: 'Biology',
			pageText,
			expectedCount: 1
		});

		expect(normalized.cards[0].evidence.sourceExcerpt).toBe(
			'This stimulates white blood cells to produce antibodies against the pathogen.'
		);
	});

	it('requires exact correct-choice text and evidence for every learner-facing prompt', () => {
		const caseChangedAnswer = candidateBatch();
		caseChangedAnswer.cards[0].choices[0].text =
			'it stimulates white blood cells to produce antibodies.';
		expect(() =>
			validateRecallCandidateBatch(caseChangedAnswer, {
				subject: 'Biology',
				pageText,
				expectedCount: 1
			})
		).toThrow(/correct choice text must exactly match back/);

		const unsupportedFront = candidateBatch();
		unsupportedFront.cards[0].evidence.supports =
			unsupportedFront.cards[0].evidence.supports.filter((claim: string) => claim !== 'front');
		expect(() =>
			validateRecallCandidateBatch(unsupportedFront, {
				subject: 'Biology',
				pageText,
				expectedCount: 1
			})
		).toThrow(/supports must include front/);
	});

	it('requires evidence for an explicit reverse pair', () => {
		const raw: any = candidateBatch();
		raw.cards[0].reverseFront = 'What do white blood cells produce after vaccination?';
		raw.cards[0].reverseBack = 'Antibodies against the pathogen.';
		expect(() =>
			validateRecallCandidateBatch(raw, {
				subject: 'Biology',
				pageText,
				expectedCount: 1
			})
		).toThrow(/supports must include reverse/);

		raw.cards[0].evidence.supports.push('reverse');
		expect(
			validateRecallCandidateBatch(raw, {
				subject: 'Biology',
				pageText,
				expectedCount: 1
			}).cards[0].reverseFront
		).toBe('What do white blood cells produce after vaccination?');
	});

	it('cannot accept failed full-review checks or a changed cue without another review', () => {
		const candidates = validateRecallCandidateBatch(candidateBatch(), {
			subject: 'Biology',
			pageText,
			expectedCount: 1
		});
		const invalidFullReview = fullReview(true);
		invalidFullReview.reviews[0].checks.feedbackUseful = false;
		expect(() => validateRecallFullReviews(invalidFullReview, [candidates.cards[0].id])).toThrow(
			/cannot be accepted/
		);

		const completeCards = candidates.cards.map((card) => ({ ...card, subject: 'Biology' }));
		const invalidCueReview = cueReview(true);
		invalidCueReview.reviews[0].replacementCue = '📘';
		expect(() => validateRecallCueReviews(invalidCueReview, completeCards, 'Biology')).toThrow(
			/must equal the accepted card cue/
		);
	});

	it('rejects legacy v1/v3 artifacts instead of reinterpreting coarse evidence tags', () => {
		expect(() =>
			validateRecallCardBundle({
				schemaVersion: 'recall-card-bundle-v1',
				promptVersion: 'recall-card-compiler-v3'
			})
		).toThrow(/v1 artifacts predate granular choice evidence/);
	});

	it('keeps immutable compiler-v5 through compiler-v9 bundles importable and version-bound', () => {
		const candidates = validateRecallCandidateBatch(candidateBatch(), {
			subject: 'Biology',
			pageText,
			expectedCount: 1
		});
		const completeCards = candidates.cards.map((card) => ({ ...card, subject: 'Biology' }));
		const { bundle } = compileRecallCardBundle({
			candidates,
			fullReviews: validateRecallFullReviews(fullReview(true), ['bio-vaccination-antibodies']),
			cueReviews: validateRecallCueReviews(cueReview(true), completeCards, 'Biology'),
			evidence: evidenceFixture(),
			run: runFixture(),
			companionArtifacts: companionArtifactsFixture()
		});
		for (const version of [5, 6, 7, 8, 9]) {
			const frozen = structuredClone(bundle);
			frozen.promptVersion = `recall-card-compiler-v${version}`;
			frozen.run.id = `recall-test-run-compiler-v${version}`;
			for (const card of frozen.cards) {
				card.provenance.promptVersion = frozen.promptVersion;
				card.provenance.generationRunId = frozen.run.id;
			}
			expect(validateRecallCardBundle(frozen)).toBe(frozen);
		}

		const compilerV5 = structuredClone(bundle);
		compilerV5.promptVersion = 'recall-card-compiler-v5';
		compilerV5.run.id = 'recall-test-run-compiler-v5';
		for (const card of compilerV5.cards) {
			card.provenance.promptVersion = compilerV5.promptVersion;
			card.provenance.generationRunId = compilerV5.run.id;
		}
		expect(() =>
			validateRecallCardBundle({
				...compilerV5,
				run: { ...compilerV5.run, id: 'ambiguous-compiler-v6' }
			})
		).toThrow(/run.id must end with -compiler-v5/);
	});

	it('requires hash-bound compiler companions and the full replacement-cue trail for v7', () => {
		const candidates = validateRecallCandidateBatch(candidateBatch(), {
			subject: 'Biology',
			pageText,
			expectedCount: 1
		});
		const completeCards = candidates.cards.map((card) => ({ ...card, subject: 'Biology' }));
		const { bundle } = compileRecallCardBundle({
			candidates,
			fullReviews: validateRecallFullReviews(fullReview(true), ['bio-vaccination-antibodies']),
			cueReviews: validateRecallCueReviews(cueReview(true), completeCards, 'Biology'),
			evidence: evidenceFixture(),
			run: runFixture(),
			companionArtifacts: companionArtifactsFixture()
		});

		const missingIdentity = structuredClone(bundle);
		delete missingIdentity.companionArtifacts;
		expect(() => validateRecallCardBundle(missingIdentity)).toThrow(
			/companionArtifacts is required/
		);

		const replacementRun = structuredClone(bundle);
		replacementRun.run.cueReviewer.replacementReviewRun = true;
		replacementRun.companionArtifacts = companionArtifactsFixture(true);
		expect(validateRecallCardBundle(replacementRun)).toBe(replacementRun);

		delete replacementRun.companionArtifacts.sha256ByFile['final-cue-review.json'];
		expect(() => validateRecallCardBundle(replacementRun)).toThrow(
			/missing final-cue-review\.json/
		);
	});
});

function candidateBatch() {
	return {
		cards: [
			{
				id: 'bio-vaccination-antibodies',
				conceptKey: 'vaccination-antibodies',
				kind: 'process',
				visualCue: '💉',
				front: 'How does vaccination prepare white blood cells for a pathogen?',
				back: 'It stimulates white blood cells to produce antibodies.',
				reverseFront: null,
				reverseBack: null,
				explanation:
					'The harmless pathogen material triggers an antibody response before infection.',
				memoryTip: null,
				choices: [
					{
						choiceKey: 'antibodies',
						text: 'It stimulates white blood cells to produce antibodies.',
						isCorrect: true,
						feedback: 'Vaccination primes the specific antibody response.',
						misconception: null
					},
					{
						choiceKey: 'red-blood-cells',
						text: 'It stimulates red blood cells to engulf the pathogen.',
						isCorrect: false,
						feedback: 'Red blood cells transport oxygen; white blood cells make antibodies.',
						misconception: 'Confuses red and white blood cell roles.'
					},
					{
						choiceKey: 'painkillers',
						text: 'It causes painkillers to destroy the pathogen directly.',
						isCorrect: false,
						feedback: 'Painkillers relieve symptoms and do not create immunity.',
						misconception: 'Confuses vaccination with symptom relief.'
					},
					{
						choiceKey: 'antibiotics',
						text: 'It causes the body to produce antibiotics against the pathogen.',
						isCorrect: false,
						feedback: 'The immune response produces antibodies, not antibiotics.',
						misconception: 'Confuses antibodies with antibiotics.'
					}
				],
				evidence: {
					sourceExcerpt:
						'This stimulates white blood cells to produce antibodies against the pathogen.',
					supports: [
						'front',
						'back',
						'explanation',
						'choice:antibodies:feedback',
						'choice:red-blood-cells:feedback',
						'choice:red-blood-cells:misconception',
						'choice:painkillers:feedback',
						'choice:painkillers:misconception',
						'choice:antibiotics:feedback',
						'choice:antibiotics:misconception'
					]
				}
			}
		]
	};
}

function fullReview(accepted: boolean) {
	return {
		reviews: [
			{
				cardId: 'bio-vaccination-antibodies',
				accepted,
				reason: accepted
					? 'The card is concise and fully evidenced.'
					: 'The answer is unsupported.',
				checks: Object.fromEntries(RECALL_REVIEW_CHECKS.map((name) => [name, accepted])),
				issues: accepted ? [] : ['The answer is unsupported.']
			}
		]
	};
}

function cueReview(accepted: boolean) {
	return {
		reviews: [
			{
				cardId: 'bio-vaccination-antibodies',
				accepted,
				reason: accepted
					? 'The syringe identifies vaccination already stated in the question.'
					: 'The cue could reveal the answer.',
				replacementCue: accepted ? '💉' : '📘'
			}
		]
	};
}

function evidenceFixture() {
	return {
		catalogSchemaVersion: 2,
		catalogPath: 'data/curricula/curriculum-catalog.json',
		specification: {
			id: 'aqa-8464',
			board: 'AQA',
			qualification: 'GCSE',
			subject: 'Combined Science: Trilogy',
			course: 'Combined Science',
			specificationCode: '8464',
			version: '1.1',
			title: 'AQA GCSE Combined Science',
			landingUrl: 'https://www.aqa.org.uk/',
			pdfUrl: 'https://www.aqa.org.uk/spec.pdf',
			localPath: 'data/curricula/spec.pdf',
			sha256: 'a'.repeat(64)
		},
		component: { id: 'aqa-8464-vaccination', code: '4.3.1.7', title: 'Vaccination' },
		topicComponent: { id: 'aqa-8464-infection', code: '4.3', title: 'Infection and response' },
		subject: 'Biology',
		pageStart: 37,
		pageEnd: 37,
		pageText,
		targets: [
			{
				offeringId: 'aqa-8464-biology-higher',
				curriculumComponentId: 'aqa-8464-vaccination',
				topicComponentId: 'aqa-8464-infection',
				isPrimary: true,
				confidence: 1,
				reviewed: true,
				mappingSource: 'recall-card-compiler-v2'
			}
		],
		fingerprint: 'b'.repeat(64)
	};
}

function runFixture() {
	return {
		id: 'recall-test-run-compiler-v10',
		startedAt: '2026-07-15T10:00:00.000Z',
		finishedAt: '2026-07-15T10:01:00.000Z',
		generator: { model: 'gpt-5.6-sol', thinkingLevel: 'max' },
		fullReviewer: { model: 'gpt-5.6-sol', thinkingLevel: 'max', independentTurn: true },
		cueReviewer: {
			model: 'gpt-5.6-sol',
			thinkingLevel: 'max',
			independentTurn: true,
			replacementReviewRun: false
		}
	};
}

function companionArtifactsFixture(replacementReviewRun = false) {
	return {
		schemaVersion: RECALL_COMPANION_ARTIFACT_SCHEMA_VERSION,
		sha256ByFile: Object.fromEntries(
			recallHashBoundCompanionEntries(replacementReviewRun).map((entry, index) => [
				entry.name,
				(index + 1).toString(16).padStart(64, '0')
			])
		)
	};
}

export {
	candidateBatch,
	companionArtifactsFixture,
	cueReview,
	evidenceFixture,
	fullReview,
	pageText,
	runFixture
};
