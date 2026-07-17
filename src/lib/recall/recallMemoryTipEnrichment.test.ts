import { describe, expect, it } from 'vitest';

import {
	RECALL_MEMORY_TIP_EFFECTIVE_CONTENT_VERSION,
	RECALL_MEMORY_TIP_PROMPT_VERSION,
	RECALL_MEMORY_TIP_SCHEMA_VERSION,
	RecallMemoryTipValidationError,
	buildRecallMemoryTipGenerationPrompt,
	compileRecallMemoryTipArtifact,
	hashEffectiveRecallMemoryTip,
	hashRecallMemoryTipSourceSnapshot,
	normalizeRecallMemoryTipSourceSnapshot,
	validateRecallMemoryTipArtifactAgainstSnapshot,
	validateRecallMemoryTipCandidates,
	validateRecallMemoryTipReviews
} from '../../../scripts/lib/recall-memory-tip-enrichment.mjs';
import {
	hashRecallCardContent,
	normalizeEvidenceText,
	sha256
} from '../../../scripts/lib/recall-card-bundle.mjs';

describe('recall memory-tip enrichment contract', () => {
	it('normalizes a complete immutable base snapshot and binds every content child', () => {
		const snapshot = snapshotFixture();
		expect(snapshot.cards[0].contentHash).toBe(hashRecallCardContent(snapshot.cards[0]));
		expect(snapshot.cards[0].provenanceHash).toMatch(/^[a-f0-9]{64}$/);
		expect(snapshot.cards[0].evidence[0].supportsHash).toMatch(/^[a-f0-9]{64}$/);
		expect(hashRecallMemoryTipSourceSnapshot(snapshot)).toMatch(/^[a-f0-9]{64}$/);

		const unsafeOwner = structuredClone(snapshot);
		unsafeOwner.cards[0].importOwner = 'manual';
		expect(() => normalizeRecallMemoryTipSourceSnapshot(unsafeOwner)).toThrow(/owned by/);

		const existingTip = structuredClone(snapshot);
		existingTip.cards[0].memoryTip = 'Already enriched';
		existingTip.cards[0].contentHash = hashRecallCardContent(existingTip.cards[0]);
		expect(() => normalizeRecallMemoryTipSourceSnapshot(existingTip)).toThrow(/already has/);

		const booleanish = structuredClone(snapshot);
		booleanish.cards[0].choices[0].isCorrect = '0' as unknown as boolean;
		expect(() => normalizeRecallMemoryTipSourceSnapshot(booleanish)).toThrow(/boolean or integer/);
	});

	it('accepts a three-choice compiler-v10 base without weakening compiler-v9 enrichment checks', () => {
		const v10Input = structuredClone(snapshotFixture());
		const v10Card = v10Input.cards[0];
		v10Card.generationRunId = 'base-run-compiler-v10';
		v10Card.generationRun.id = v10Card.generationRunId;
		v10Card.generationRun.promptVersion = 'recall-card-compiler-v10';
		v10Card.generationRun.artifactPath =
			'data/recall/generated/base-run-compiler-v10/accepted-cards.json';
		v10Card.provenance.generationRunId = v10Card.generationRunId;
		v10Card.provenance.promptVersion = 'recall-card-compiler-v10';
		v10Card.choices.pop();
		v10Card.contentHash = hashRecallCardContent(v10Card);

		const v10 = normalizeRecallMemoryTipSourceSnapshot(v10Input);
		expect(v10.cards[0].choices).toHaveLength(3);

		const relabelledAsV9 = structuredClone(v10);
		const v9Card = relabelledAsV9.cards[0];
		v9Card.generationRunId = 'base-run-compiler-v9';
		v9Card.generationRun.id = v9Card.generationRunId;
		v9Card.generationRun.promptVersion = 'recall-card-compiler-v9';
		v9Card.generationRun.artifactPath =
			'data/recall/generated/base-run-compiler-v9/accepted-cards.json';
		v9Card.provenance.generationRunId = v9Card.generationRunId;
		v9Card.provenance.promptVersion = 'recall-card-compiler-v9';
		expect(() => normalizeRecallMemoryTipSourceSnapshot(relabelledAsV9)).toThrow(
			/exactly four rows for recall-card-compiler-v9/
		);
	});

	it('requires exact selected ids, exact evidence ids, canonical one-line tips and a second encoding', () => {
		const snapshot = snapshotFixture();
		const candidates = candidateFixture();
		expect(validateRecallMemoryTipCandidates(candidates, snapshot)).toEqual(candidates);
		const prompt = buildRecallMemoryTipGenerationPrompt(snapshot);
		expect(prompt).toContain(RECALL_MEMORY_TIP_PROMPT_VERSION);
		expect(prompt).toContain('Every factual or causal learner-facing claim');
		expect(prompt).toContain('must not merely restate');

		expect(() =>
			validateRecallMemoryTipCandidates(
				{ ...candidates, tips: [{ ...candidates.tips[0], memoryTip: '  not canonical  ' }] },
				snapshot
			)
		).toThrow(/trimmed, normalized single-line/);
		expect(() =>
			validateRecallMemoryTipCandidates(
				{ ...candidates, tips: [{ ...candidates.tips[0], evidenceIds: ['other-evidence'] }] },
				snapshot
			)
		).toThrow(/unknown card/);
		expect(() =>
			validateRecallMemoryTipCandidates(
				{ ...candidates, tips: [{ ...candidates.tips[0], memoryTip: snapshot.cards[0].back }] },
				snapshot
			)
		).toThrow(/distinct from base teaching text/);
	});

	it('requires every independently reviewed card to pass every grounding and encoding check', () => {
		const candidates = candidateFixture();
		const accepted = reviewFixture();
		expect(validateRecallMemoryTipReviews(accepted, candidates)).toEqual(accepted);
		const rejected: any = structuredClone(accepted);
		rejected.reviews[0].accepted = false;
		rejected.reviews[0].checks.secondEncodingUseful = false;
		rejected.reviews[0].issues = ['This merely restates the answer.'];
		expect(() =>
			compileRecallMemoryTipArtifact({
				snapshot: snapshotFixture(),
				candidates,
				reviews: rejected,
				run: runFixture(),
				companionArtifacts: companionFixture()
			})
		).toThrow(/reviewer rejected selected card/);
	});

	it('compiles a canonical overlay without mutating the base and pins source, artifact and evidence identities', () => {
		const snapshot = snapshotFixture();
		const artifact = compileRecallMemoryTipArtifact({
			snapshot,
			candidates: candidateFixture(),
			reviews: reviewFixture(),
			run: runFixture(),
			companionArtifacts: companionFixture()
		});
		const row = artifact.enrichments[0];
		expect(artifact.schemaVersion).toBe(RECALL_MEMORY_TIP_SCHEMA_VERSION);
		expect(row.effectiveContentRevision).toBe(snapshot.cards[0].contentRevision + 1);
		expect(row.effectiveHashVersion).toBe(RECALL_MEMORY_TIP_EFFECTIVE_CONTENT_VERSION);
		expect(row.effectiveContentHash).toBe(
			hashEffectiveRecallMemoryTip(snapshot.cards[0].contentHash, row.memoryTip)
		);
		expect(row.baseSourceFingerprint).toBe(snapshot.cards[0].sourceFingerprint);
		expect(row.baseArtifactHash).toBe(snapshot.cards[0].generationRun.artifactHash);
		expect(row.baseProvenanceHash).toBe(snapshot.cards[0].provenanceHash);
		expect(row.provenance.citedEvidence[0]).toEqual(
			expect.objectContaining({
				id: 'curriculum-1',
				sourceFileHash: snapshot.cards[0].evidence[0].sourceFileHash,
				excerptHash: snapshot.cards[0].evidence[0].excerptHash,
				supportsHash: snapshot.cards[0].evidence[0].supportsHash
			})
		);
		expect(() => validateRecallMemoryTipArtifactAgainstSnapshot(artifact, snapshot)).not.toThrow();

		const changed = structuredClone(snapshot);
		changed.cards[0].evidence[0].supports = ['front'];
		changed.cards[0].evidence[0].supportsHash = sha256(JSON.stringify(['front']));
		expect(() => validateRecallMemoryTipArtifactAgainstSnapshot(artifact, changed)).toThrow();
	});
});

export function snapshotFixture() {
	const excerpt = 'Plant and algal cells have a cell wall made of cellulose.';
	const card: any = {
		id: 'bio-cellulose-wall',
		conceptKey: 'cellulose-wall',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		kind: 'fact',
		visualCue: '🧱',
		front: 'What is the plant cell wall made from?',
		back: 'Cellulose.',
		reverseFront: null,
		reverseBack: null,
		explanation: 'Cellulose forms the cell wall around plant and algal cells.',
		memoryTip: null,
		contentRevision: 3,
		contentHash: '',
		sourceFingerprint: 'b'.repeat(64),
		generationRunId: 'base-run-compiler-v5',
		provenance: {
			generationRunId: 'base-run-compiler-v5',
			promptVersion: 'recall-card-compiler-v5'
		},
		status: 'published',
		needsHumanReview: 0,
		importOwner: 'recall-card-import/v1',
		generationRun: {
			id: 'base-run-compiler-v5',
			schemaVersion: 'recall-card-bundle-v2',
			promptVersion: 'recall-card-compiler-v5',
			sourceFingerprint: 'b'.repeat(64),
			artifactHash: 'c'.repeat(64),
			artifactPath: 'data/recall/generated/base-run-compiler-v5/accepted-cards.json',
			status: 'imported',
			importOwner: 'recall-card-import/v1'
		},
		choices: [
			{
				displayOrder: 0,
				choiceKey: 'cellulose',
				text: 'Cellulose.',
				isCorrect: true,
				feedback: 'Correct: the wall is cellulose.',
				misconception: null
			},
			...['Chitin.', 'Glycogen.', 'Starch.'].map((text, index) => ({
				displayOrder: index + 1,
				choiceKey: `wrong-${index + 1}`,
				text,
				isCorrect: false,
				feedback: 'This is not the material named by the specification.',
				misconception: 'Confuses cell-wall material with another substance.'
			}))
		],
		evidence: [
			{
				id: 'curriculum-1',
				sourceKind: 'curriculum_component',
				specificationId: 'aqa-biology',
				curriculumComponentId: 'cell-structure',
				pageStart: 20,
				pageEnd: 20,
				sourceExcerpt: excerpt,
				sourceFileHash: 'd'.repeat(64),
				excerptHash: sha256(normalizeEvidenceText(excerpt)),
				supports: ['front', 'back', 'explanation']
			}
		],
		targets: [
			{
				offeringId: 'aqa-biology-higher',
				curriculumComponentId: 'cell-structure',
				topicComponentId: 'cell-structure',
				isPrimary: true,
				confidence: 1,
				reviewed: true,
				mappingSource: 'recall-card-compiler-v2'
			}
		]
	};
	card.contentHash = hashRecallCardContent(card);
	return normalizeRecallMemoryTipSourceSnapshot({ cards: [card] });
}

export function candidateFixture() {
	return {
		tips: [
			{
				cardId: 'bio-cellulose-wall',
				memoryTip: 'Picture cellulose as the bricks in a plant cell’s outer wall.',
				evidenceIds: ['curriculum-1'],
				groundingRationale: 'The cited specification names cellulose as the cell-wall material.'
			}
		]
	};
}

export function reviewFixture() {
	return {
		reviews: [
			{
				cardId: 'bio-cellulose-wall',
				accepted: true,
				reason: 'The image is accurate, grounded and adds a concrete retrieval route.',
				checks: {
					officialEvidenceGrounded: true,
					scientificallyAccurate: true,
					distinctFromAnswer: true,
					secondEncodingUseful: true,
					concise: true
				},
				issues: []
			}
		]
	};
}

export function runFixture() {
	return {
		id: 'test-memory-tips-enricher-v1',
		startedAt: '2026-07-16T12:00:00.000Z',
		finishedAt: '2026-07-16T12:01:00.000Z',
		generator: { model: 'gpt-5.6-sol', thinkingLevel: 'max' },
		reviewer: { model: 'gpt-5.6-sol', thinkingLevel: 'max', independentTurn: true }
	};
}

export function companionFixture() {
	return {
		schemaVersion: 'recall-memory-tip-enrichment-companions-v1',
		sha256ByFile: Object.fromEntries(
			[
				'plan.json',
				'source-snapshot.json',
				'generation-prompt.txt',
				'generation-model-output.json',
				'candidate-enrichments.json',
				'review-prompt.txt',
				'review-model-output.json',
				'review.json'
			].map((name, index) => [name, String(index + 1).padStart(64, '0')])
		)
	};
}
