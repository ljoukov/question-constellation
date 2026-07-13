import { describe, expect, it } from 'vitest';
import {
	buildGenerationPrompt,
	buildStylePrompt,
	sourceFingerprint,
	validateSemanticPlan,
	validateVisualJudge,
	visualJudgePrompt
} from '../../../scripts/lib/chain-illustration-pipeline.mjs';
import { mechanicalBlockers } from '../../../scripts/lib/chain-illustration-candidates.mjs';

const steps = [
	{ id: 's1', displayOrder: 1, stepText: 'Collision', stepRole: 'cause', explanation: '' },
	{
		id: 's2',
		displayOrder: 2,
		stepText: 'Momentum conserved',
		stepRole: 'process',
		explanation: ''
	},
	{ id: 's3', displayOrder: 3, stepText: 'Momentum shared', stepRole: 'link', explanation: '' },
	{ id: 's4', displayOrder: 4, stepText: 'Both move', stepRole: 'effect', explanation: '' }
];

const members = ['q1', 'q2'].map((questionId, index) => ({
	chainId: 'physics-chain',
	questionId,
	questionStatus: 'published',
	questionNeedsReview: 0,
	membershipNeedsReview: 0,
	extractionConfidence: 0.95,
	fitConfidence: 0.96,
	sourceDocumentId: `paper-${index + 1}`,
	sourceQuestionRef: `${index + 1}.1`,
	promptText: `Two objects collide in context ${index + 1}.`,
	selfContainedPromptText: `Two objects collide in context ${index + 1}.`,
	marks: 4,
	overlayCount: 0,
	markSchemeItems: steps.map((step, stepIndex) => ({
		id: `${questionId}-m${stepIndex + 1}`,
		displayOrder: stepIndex + 1,
		itemType: 'mark',
		text: step.stepText,
		marks: 1,
		confidence: 0.96
	})),
	checklistItems: steps.map((step, stepIndex) => ({
		id: `${questionId}-c${stepIndex + 1}`,
		displayOrder: stepIndex + 1,
		text: step.stepText,
		required: true,
		confidence: 0.95,
		needsHumanReview: 0,
		markSchemeItemIds: [`${questionId}-m${stepIndex + 1}`]
	})),
	modelAnswers: [
		{
			id: `${questionId}-model`,
			answerText: 'Momentum is conserved and shared, so both objects move.',
			derivation: 'Uses all four mark rows.',
			confidence: 0.95,
			needsHumanReview: 0,
			supportingMarkSchemeItemIds: steps.map((_, stepIndex) => `${questionId}-m${stepIndex + 1}`)
		}
	]
}));

const candidate = {
	id: 'physics-chain',
	slug: 'momentum-sharing',
	title: 'Momentum sharing',
	canonicalChainText: 'collision -> momentum conserved -> momentum shared -> both move',
	summary: 'How momentum moves through a collision.',
	subjectArea: 'Physics',
	broadTopic: 'Forces and motion',
	confidence: 0.96,
	updatedAt: '2026-07-12T00:00:00Z',
	steps,
	members
};

const decision = {
	chainId: candidate.id,
	verdict: 'accept',
	rationale: 'The same ordered four marks occur in both contexts.',
	sameOrderedLinks: true,
	allMembersCovered: true,
	contextOnlyVariation: true,
	branching: false,
	representativeQuestionId: 'q1',
	title: 'MOMENTUM SHARING',
	altText: 'Four steps show a collision, conservation, sharing and both objects moving.',
	caption: 'Collision → momentum conserved → momentum shared → both move.',
	visualSteps: steps.map((step, index) => ({
		order: index + 1,
		heading: step.stepText.toUpperCase(),
		microcopy: step.stepText,
		sourceStepIds: [step.id],
		visual: `Accurate visual for ${step.stepText}.`,
		misconceptionGuards: ['Do not imply momentum is created.']
	})),
	evidenceByQuestion: members.map((member) => ({
		questionId: member.questionId,
		mappings: steps.map((step, index) => ({
			sourceStepId: step.id,
			supportType: 'mark_scored',
			markSchemeItemIds: [`${member.questionId}-m${index + 1}`],
			excerpt: step.stepText
		}))
	}))
};

describe('chain illustration evidence and prompt pipeline', () => {
	it('accepts a clean cross-paper mechanism and produces the stable landscape prompt', () => {
		expect(mechanicalBlockers(candidate)).toEqual([]);
		expect(validateSemanticPlan([candidate], { decisions: [decision] })).toEqual({
			status: 'passed',
			issues: []
		});
		const prompt = buildGenerationPrompt(candidate, decision);
		expect(prompt).toContain('16:9 landscape');
		expect(prompt).toContain('Exactly 4 large numbered panels');
		expect(prompt).toContain('Do not use any previous image');
		expect(prompt).toContain('one internally consistent event');
		expect(
			visualJudgePrompt(candidate, decision, {
				A: { status: 'passed' },
				B: { status: 'passed' }
			})
		).toContain('cross-panel consistency audit');
		expect(buildStylePrompt(candidate)).toContain('mechanics and motion atlas');
		expect(sourceFingerprint(candidate)).toHaveLength(64);
	});

	it('rejects a visual plan that reorders or drops source steps', () => {
		const bad = structuredClone(decision);
		bad.visualSteps[1].sourceStepIds = ['s3'];
		bad.visualSteps[2].sourceStepIds = ['s2'];
		const validation = validateSemanticPlan([candidate], { decisions: [bad] });
		expect(validation.status).toBe('failed');
		expect(validation.issues.join(' ')).toContain('exactly once in order');
	});

	it('rejects invented evidence even when the cited mark-row ID exists', () => {
		const bad = structuredClone(decision);
		bad.evidenceByQuestion[0].mappings[0].excerpt = 'An unrelated claim invented by the planner.';
		const validation = validateSemanticPlan([candidate], { decisions: [bad] });
		expect(validation.status).toBe('failed');
		expect(validation.issues.join(' ')).toContain('not verbatim in the cited rows');
	});

	it('rejects dangling checklist evidence before semantic review', () => {
		const badCandidate = structuredClone(candidate);
		badCandidate.members[0].checklistItems[0].markSchemeItemIds = ['missing-mark'];
		expect(mechanicalBlockers(badCandidate).join(' ')).toContain('dangling checklist mark ID');
	});

	it('enforces the 18/20 visual pass threshold and winner selection', () => {
		const judge = {
			candidates: [
				{
					label: 'A',
					pass: true,
					scientificAccuracy: 4,
					evidenceFidelity: 4,
					textExactness: 3,
					sequenceClarity: 3,
					ipadLegibility: 2,
					mnemonicCoherence: 1,
					appStyleFit: 1,
					total: 18,
					defects: []
				},
				{
					label: 'B',
					pass: false,
					scientificAccuracy: 4,
					evidenceFidelity: 4,
					textExactness: 2,
					sequenceClarity: 3,
					ipadLegibility: 2,
					mnemonicCoherence: 2,
					appStyleFit: 1,
					total: 18,
					defects: ['One heading is misspelled.']
				}
			],
			winner: 'A',
			rationale: 'A is the only exact-text pass.'
		};
		const hardChecks = { A: { status: 'passed' }, B: { status: 'passed' } };
		expect(validateVisualJudge(judge, hardChecks)).toEqual({ status: 'passed', issues: [] });
	});
});
