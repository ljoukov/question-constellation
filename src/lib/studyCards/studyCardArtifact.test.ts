import { describe, expect, it } from 'vitest';

import {
	STUDY_CARD_KINDS,
	STUDY_CARD_SUBJECTS,
	StudyCardArtifactValidationError,
	hashStudyCardArtifact,
	validateStudyCardBundle
} from '../../../scripts/lib/study-card-artifact.mjs';
import { studyCardArtifactFixture } from './studyCardTestFixtures';

describe('standard study-card artifact', () => {
	it('validates the exact v1 contract and derives immutable database fields', () => {
		const bundle = validateStudyCardBundle(studyCardArtifactFixture());

		expect(bundle.schemaVersion).toBe('standard-study-deck-v1');
		expect(bundle.cards[0]).toEqual(
			expect.objectContaining({
				visualCue: '🔥',
				contentHash: expect.stringMatching(/^[a-f0-9]{64}$/)
			})
		);
		expect(bundle.cards[0].choices.map((choice) => choice.displayOrder)).toEqual([0, 1, 2, 3]);
		expect(bundle.cards[0].choices[0].id).toBe(
			'ocr-english-literature-macbeth-ambition-quotation:choice:vaulting-ambition'
		);
		expect(bundle.cards[0].sources[0].id).toBe(
			'ocr-english-literature-macbeth-ambition-quotation:source:1'
		);
		expect(bundle.coverage.map((row) => row.status)).toEqual(['withheld', 'ready']);
		expect(hashStudyCardArtifact(bundle)).toMatch(/^[a-f0-9]{64}$/);
		expect(hashStudyCardArtifact(bundle)).toBe(
			hashStudyCardArtifact(
				validateStudyCardBundle(JSON.parse(JSON.stringify(studyCardArtifactFixture())))
			)
		);
	});

	it('supports every current subject plus literature and answer-method kinds', () => {
		expect(STUDY_CARD_SUBJECTS).toEqual([
			'Biology',
			'Chemistry',
			'Physics',
			'Computer Science',
			'Geography',
			'History',
			'English Language',
			'English Literature'
		]);
		for (const kind of ['plot', 'quotation', 'character', 'theme', 'context', 'method']) {
			expect(STUDY_CARD_KINDS).toContain(kind);
			const fixture = studyCardArtifactFixture();
			fixture.cards[0].kind = kind;
			expect(validateStudyCardBundle(fixture).cards[0].kind).toBe(kind);
		}
	});

	it('preserves ordinary source line breaks but rejects unsafe control bytes', () => {
		const multiline = studyCardArtifactFixture();
		multiline.cards[0].sources[0].excerpt = 'Act 1, Scene 7\nonly vaulting ambition';
		expect(validateStudyCardBundle(multiline).cards[0].sources[0].sourceExcerpt).toContain('\n');

		const unsafe = studyCardArtifactFixture();
		unsafe.cards[0].sources[0].excerpt = 'Act 1\u0000only vaulting ambition';
		expect(() => validateStudyCardBundle(unsafe)).toThrow(/unsafe control characters/);
	});

	it('keeps the imported memory-tip limit identical to the compiler and runtime', () => {
		const maximum = studyCardArtifactFixture();
		maximum.cards[0].memoryTip = 'm'.repeat(180);
		expect(validateStudyCardBundle(maximum).cards[0].memoryTip).toHaveLength(180);

		const overlong = studyCardArtifactFixture();
		overlong.cards[0].memoryTip = 'm'.repeat(181);
		expect(() => validateStudyCardBundle(overlong)).toThrow(/between 8 and 180 characters/);
	});

	it('accepts either three or four independently reviewed choices', () => {
		const threeChoice = studyCardArtifactFixture();
		threeChoice.cards[0].choices.pop();
		expect(validateStudyCardBundle(threeChoice).cards[0].choices).toHaveLength(3);

		expect(validateStudyCardBundle(studyCardArtifactFixture()).cards[0].choices).toHaveLength(4);
	});

	it('records exact targeted-repair generator and reviewer lineage', () => {
		const fixture = studyCardArtifactFixture() as ReturnType<typeof studyCardArtifactFixture> & {
			release: ReturnType<typeof studyCardArtifactFixture>['release'] & {
				supplementalRuns?: unknown[];
			};
		};
		fixture.release.promptVersion = 'standard-study-card-compiler-v3';
		fixture.release.supplementalRuns = [
			{
				purpose: 'targeted-card-repair',
				promptVersion: 'standard-study-card-compiler-v4',
				cardIds: ['ocr-english-literature-macbeth-ambition-quotation'],
				generator: {
					model: 'gpt-5.6-sol',
					thinkingLevel: 'max',
					runId: 'repair-generator-run-test-v1'
				},
				reviewer: {
					model: 'gpt-5.6-sol',
					thinkingLevel: 'max',
					runId: 'repair-reviewer-run-test-v1',
					independentTurn: true
				},
				startedAt: '2026-07-16T10:10:00.000Z',
				finishedAt: '2026-07-16T10:14:00.000Z'
			}
		];

		const bundle = validateStudyCardBundle(fixture);
		expect(bundle.release.promptVersion).toBe('standard-study-card-compiler-v3');
		expect(bundle.release.supplementalRuns?.[0].promptVersion).toBe(
			'standard-study-card-compiler-v4'
		);
		expect(bundle.release.supplementalRuns).toEqual(fixture.release.supplementalRuns);
		expect(bundle.cards[0].provenance.supplementalRuns).toEqual(fixture.release.supplementalRuns);
	});

	it('requires the top-level generator and independent reviewer to be distinct runs', () => {
		const fixture = studyCardArtifactFixture();
		fixture.release.reviewer.runId = fixture.release.generator.runId;

		expect(() => validateStudyCardBundle(fixture)).toThrow(
			/release generator and reviewer runId values must differ/
		);
	});

	it('rejects targeted-repair lineage for a card outside the accepted artifact', () => {
		const fixture = studyCardArtifactFixture() as ReturnType<typeof studyCardArtifactFixture> & {
			release: ReturnType<typeof studyCardArtifactFixture>['release'] & {
				supplementalRuns?: unknown[];
			};
		};
		fixture.release.supplementalRuns = [
			{
				purpose: 'targeted-card-repair',
				promptVersion: 'english-literature-study-deck-repair-v1',
				cardIds: ['missing-card-id'],
				generator: {
					model: 'gpt-5.6-sol',
					thinkingLevel: 'max',
					runId: 'repair-generator-run-test-v1'
				},
				reviewer: {
					model: 'gpt-5.6-sol',
					thinkingLevel: 'max',
					runId: 'repair-reviewer-run-test-v1',
					independentTurn: true
				},
				startedAt: '2026-07-16T10:10:00.000Z',
				finishedAt: '2026-07-16T10:14:00.000Z'
			}
		];

		expect(() => validateStudyCardBundle(fixture)).toThrow(/does not identify a card/);
	});

	it('allows distinct repair generators to share the final independent reviewer', () => {
		const fixture = studyCardArtifactFixture() as ReturnType<typeof studyCardArtifactFixture> & {
			release: ReturnType<typeof studyCardArtifactFixture>['release'] & {
				supplementalRuns?: unknown[];
			};
		};
		const secondCard = structuredClone(fixture.cards[0]);
		secondCard.id = 'ocr-english-literature-macbeth-guilt-quotation';
		secondCard.conceptKey = 'macbeth-guilt-quotation';
		fixture.cards.push(secondCard);
		fixture.coverage[0].cardCount = 2;
		const sharedReviewer = {
			...fixture.release.reviewer,
			runId: fixture.release.reviewer.runId
		};
		fixture.release.supplementalRuns = fixture.cards.map((card, index) => ({
			purpose: 'targeted-card-repair',
			promptVersion: `repair-prompt-v${index + 1}`,
			cardIds: [card.id],
			generator: {
				model: 'gpt-5.6-sol',
				thinkingLevel: 'max',
				runId: `repair-generator-run-${index + 1}`
			},
			reviewer: sharedReviewer,
			startedAt: `2026-07-16T10:0${index + 1}:00.000Z`,
			finishedAt: '2026-07-16T10:14:00.000Z'
		}));

		const bundle = validateStudyCardBundle(fixture);
		expect(bundle.release.supplementalRuns).toHaveLength(2);
		expect(bundle.release.supplementalRuns?.map((run) => run.reviewer.runId)).toEqual([
			'reviewer-run-test-v1',
			'reviewer-run-test-v1'
		]);
	});

	it('rejects one repaired card identity claimed by multiple generator runs', () => {
		const fixture = studyCardArtifactFixture() as ReturnType<typeof studyCardArtifactFixture> & {
			release: ReturnType<typeof studyCardArtifactFixture>['release'] & {
				supplementalRuns?: unknown[];
			};
		};
		const run = {
			purpose: 'targeted-card-repair',
			promptVersion: 'repair-prompt-v1',
			cardIds: [fixture.cards[0].id],
			generator: {
				model: 'gpt-5.6-sol',
				thinkingLevel: 'max',
				runId: 'repair-generator-run-1'
			},
			reviewer: {
				...fixture.release.reviewer
			},
			startedAt: '2026-07-16T10:01:00.000Z',
			finishedAt: '2026-07-16T10:14:00.000Z'
		};
		fixture.release.supplementalRuns = [
			run,
			{
				...run,
				promptVersion: 'repair-prompt-v2',
				generator: { ...run.generator, runId: 'repair-generator-run-2' }
			}
		];

		expect(() => validateStudyCardBundle(fixture)).toThrow(/already claimed/);
	});

	it('rejects review, choice, source and coverage drift together', () => {
		const fixture = studyCardArtifactFixture();
		fixture.release.reviewer.independentTurn = false;
		fixture.cards[0].choices.splice(-2);
		fixture.cards[0].sources[0].sourceHash = 'not-a-hash';
		fixture.coverage[0].cardCount = 2;

		expect(() => validateStudyCardBundle(fixture)).toThrow(StudyCardArtifactValidationError);
		try {
			validateStudyCardBundle(fixture);
		} catch (error) {
			const issues = (error as StudyCardArtifactValidationError).issues.join('\n');
			expect(issues).toMatch(/independentTurn must be true/);
			expect(issues).toMatch(/three or four/);
			expect(issues).toMatch(/lowercase SHA-256/);
			expect(issues).toMatch(/declares 2 card\(s\), found 1/);
		}
	});

	it('rejects unknown fields and unsupported board/subject pairings', () => {
		const fixture = studyCardArtifactFixture() as ReturnType<typeof studyCardArtifactFixture> & {
			unexpected?: boolean;
		};
		fixture.unexpected = true;
		fixture.cards[0].board = 'AQA';

		expect(() => validateStudyCardBundle(fixture)).toThrow(/unexpected is not allowed/);
		expect(() => validateStudyCardBundle(fixture)).toThrow(/unsupported board\/subject pairing/);
	});
});
