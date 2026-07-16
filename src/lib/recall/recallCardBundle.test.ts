import { describe, expect, it } from 'vitest';

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
			run: runFixture()
		});

		expect(rejectedCards).toEqual([]);
		expect(bundle.schemaVersion).toBe('recall-card-bundle-v2');
		expect(bundle.promptVersion).toBe('recall-card-compiler-v6');
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

	it('keeps immutable compiler-v5 bundles importable while binding each run id to its version', () => {
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
			run: runFixture()
		});
		const compilerV5 = structuredClone(bundle);
		compilerV5.promptVersion = 'recall-card-compiler-v5';
		compilerV5.run.id = 'recall-test-run-compiler-v5';
		for (const card of compilerV5.cards) {
			card.provenance.promptVersion = compilerV5.promptVersion;
			card.provenance.generationRunId = compilerV5.run.id;
		}

		expect(validateRecallCardBundle(compilerV5)).toBe(compilerV5);
		expect(() =>
			validateRecallCardBundle({
				...compilerV5,
				run: { ...compilerV5.run, id: 'ambiguous-compiler-v6' }
			})
		).toThrow(/run.id must end with -compiler-v5/);
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
		id: 'recall-test-run-compiler-v6',
		startedAt: '2026-07-15T10:00:00.000Z',
		finishedAt: '2026-07-15T10:01:00.000Z',
		generator: { model: 'gpt-5.6-sol', thinkingLevel: 'max' },
		fullReviewer: { model: 'gpt-5.6-sol', thinkingLevel: 'max', independentTurn: true },
		cueReviewer: { model: 'gpt-5.6-sol', thinkingLevel: 'max', independentTurn: true }
	};
}

export { candidateBatch, cueReview, evidenceFixture, fullReview, pageText, runFixture };
