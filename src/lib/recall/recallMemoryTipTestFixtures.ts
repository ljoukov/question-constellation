import {
	hashRecallCardContent,
	normalizeEvidenceText,
	sha256
} from '../../../scripts/lib/recall-card-bundle.mjs';
import { normalizeRecallMemoryTipSourceSnapshot } from '../../../scripts/lib/recall-memory-tip-enrichment.mjs';

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
