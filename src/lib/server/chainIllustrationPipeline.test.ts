import { describe, expect, it } from 'vitest';
import {
	buildGenerationPrompt,
	buildLightEditPrompt,
	buildLightEditStylePrompt,
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
	compositionMode: 'single-subject-state-progression' as
		| 'single-subject-state-progression'
		| 'continuous-journey'
		| 'linked-distinct-scenes',
	visualAnchor: 'One collision followed through four visible states.',
	continuousPath: 'Follow the two objects from impact to shared motion.',
	visualWithoutTextSummary: 'The collision redistributes conserved momentum so both objects move.',
	visualSteps: steps.map((step, index) => ({
		order: index + 1,
		heading: step.stepText.toUpperCase(),
		microcopy: step.stepText,
		sourceStepIds: [step.id],
		visual: `Accurate visual for ${step.stepText}.`,
		distinctVisualAnchor: `Stage ${index + 1} ${step.stepText}`,
		textHiddenMeaning: `The learner sees ${step.stepText.toLowerCase()}.`,
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
		expect(prompt).toContain('4 numbered stages or callouts');
		expect(prompt).toContain('Do not use any previous image');
		expect(prompt).toContain('three-second test');
		expect(prompt).toContain('Do not copy the same complete background');
		expect(prompt).toContain('MEANING WITH ALL TEXT HIDDEN');
		expect(
			visualJudgePrompt(candidate, decision, {
				dark: { status: 'passed' },
				light: { status: 'passed' }
			})
		).toContain('cross-theme consistency audit');
		expect(buildStylePrompt(candidate)).toContain('mechanics and motion atlas');
		expect(buildLightEditStylePrompt(candidate)).toContain('light-mode scientific atlas');
		const lightPrompt = buildLightEditPrompt(candidate, decision);
		expect(lightPrompt).toContain('strict theme conversion');
		expect(lightPrompt).toContain('PRESERVE EXACTLY');
		expect(lightPrompt).toContain('same locations');
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

	it('rejects opaque shorthand and repeated dominant visual anchors before generation', () => {
		const shorthand = structuredClone(decision);
		shorthand.visualSteps[0].heading = 'Step up p.d., then transmit';
		let validation = validateSemanticPlan([candidate], { decisions: [shorthand] });
		expect(validation.status).toBe('failed');
		expect(validation.issues.join(' ')).toContain('unexplained shorthand');

		const hiddenShorthand = structuredClone(decision);
		hiddenShorthand.visualSteps[0].visual = 'A transformer increases P. D. before the cable.';
		validation = validateSemanticPlan([candidate], { decisions: [hiddenShorthand] });
		expect(validation.status).toBe('failed');
		expect(validation.issues.join(' ')).toContain('unexplained shorthand');

		const repeated = structuredClone(decision);
		for (const step of repeated.visualSteps) step.distinctVisualAnchor = 'Same transformer view';
		validation = validateSemanticPlan([candidate], { decisions: [repeated] });
		expect(validation.status).toBe('failed');
		expect(validation.issues.join(' ')).toContain('unique dominant visual anchor');
	});

	it('accepts the approved one-journey grammar with a different causal visual at every stage', () => {
		const gridJourney = structuredClone(decision);
		gridJourney.compositionMode = 'continuous-journey';
		gridJourney.visualAnchor =
			'One National Grid journey from a power station through the network to homes.';
		gridJourney.continuousPath =
			'Follow electrical energy left to right from transformer to cable to homes.';
		gridJourney.visualWithoutTextSummary =
			'A transformer raises potential difference, current falls, cables heat less, and homes receive more energy.';
		const stagePlans = [
			{
				heading: 'POTENTIAL DIFFERENCE UP',
				microcopy: 'The transformer raises potential difference.',
				visual: 'A cutaway transformer with visibly different input and output coils.',
				anchor: 'Transformer coil cutaway',
				meaning: 'The output side is stepped up.'
			},
			{
				heading: 'CURRENT DOWN',
				microcopy: 'The same power needs less current.',
				visual: 'A transmission cable carrying a visibly sparser flow of charge.',
				anchor: 'Transmission cable current flow',
				meaning: 'Less current travels through the cable.'
			},
			{
				heading: 'LESS CABLE HEATING',
				microcopy: 'Less current wastes less energy as heat.',
				visual: 'A cable cross-section with weak heat glow beside a hot comparison.',
				anchor: 'Cool cable cross-section beside heat loss',
				meaning: 'The cable loses less energy by heating.'
			},
			{
				heading: 'HIGHER EFFICIENCY',
				microcopy: 'More energy reaches consumers.',
				visual: 'Illuminated homes at the concrete end of the transmission route.',
				anchor: 'Illuminated homes receiving energy',
				meaning: 'More of the transmitted energy reaches homes.'
			}
		];
		gridJourney.visualSteps = gridJourney.visualSteps.map((step, index) => ({
			...step,
			heading: stagePlans[index].heading,
			microcopy: stagePlans[index].microcopy,
			visual: stagePlans[index].visual,
			distinctVisualAnchor: stagePlans[index].anchor,
			textHiddenMeaning: stagePlans[index].meaning
		}));

		expect(validateSemanticPlan([candidate], { decisions: [gridJourney] })).toEqual({
			status: 'passed',
			issues: []
		});
		const prompt = buildGenerationPrompt(candidate, gridJourney);
		expect(prompt).toContain('Establish the shared system or subject once');
		expect(prompt).toContain('Transformer coil cutaway');
		expect(prompt).toContain('Illuminated homes receiving energy');
	});

	it('rejects invented evidence even when the cited mark-row ID exists', () => {
		const bad = structuredClone(decision);
		bad.evidenceByQuestion[0].mappings[0].excerpt = 'An unrelated claim invented by the planner.';
		const validation = validateSemanticPlan([candidate], { decisions: [bad] });
		expect(validation.status).toBe('failed');
		expect(validation.issues.join(' ')).toContain('not verbatim in the cited rows');
	});

	it('allows only a final endpoint to alternate between prompt-given and mark-scored evidence', () => {
		const endpointCandidate = structuredClone(candidate);
		endpointCandidate.members[1].promptText = 'Explain why both objects move.';
		endpointCandidate.members[1].selfContainedPromptText = 'Explain why both objects move.';
		const endpointDecision = structuredClone(decision);
		endpointDecision.evidenceByQuestion[1].mappings[3] = {
			sourceStepId: 's4',
			supportType: 'prompt_given',
			markSchemeItemIds: [],
			excerpt: 'both objects move'
		};
		expect(validateSemanticPlan([endpointCandidate], { decisions: [endpointDecision] })).toEqual({
			status: 'passed',
			issues: []
		});

		const internalDecision = structuredClone(endpointDecision);
		endpointCandidate.members[1].promptText = 'Momentum is shared. Explain why both objects move.';
		endpointCandidate.members[1].selfContainedPromptText =
			'Momentum is shared. Explain why both objects move.';
		internalDecision.evidenceByQuestion[1].mappings[2] = {
			sourceStepId: 's3',
			supportType: 'prompt_given',
			markSchemeItemIds: [],
			excerpt: 'Momentum is shared'
		};
		const validation = validateSemanticPlan([endpointCandidate], {
			decisions: [internalDecision]
		});
		expect(validation.status).toBe('failed');
		expect(validation.issues.join(' ')).toContain('step s3 is not mark-scored in two papers');
	});

	it('rejects dangling checklist evidence before semantic review', () => {
		const badCandidate = structuredClone(candidate);
		badCandidate.members[0].checklistItems[0].markSchemeItemIds = ['missing-mark'];
		expect(mechanicalBlockers(badCandidate).join(' ')).toContain('dangling checklist mark ID');
	});

	it('requires both theme variants and exact cross-theme preservation', () => {
		const judge = {
			variants: [
				{
					theme: 'dark' as const,
					pass: true,
					scientificAccuracy: 4,
					evidenceFidelity: 4,
					textExactness: 3,
					sequenceClarity: 3,
					ipadLegibility: 2,
					mnemonicCoherence: 1,
					appStyleFit: 1,
					textIndependentMeaning: true,
					distinctVisualAnchors: true,
					causalChangesVisible: true,
					noDominantRepetition: true,
					terminologyClear: true,
					compositionPlanFollowed: true,
					panelAudits: steps.map((step, index) => ({
						order: index + 1,
						dominantVisual: step.stepText,
						visibleCausalEvidence: `Visible evidence for ${step.stepText}.`,
						understandableWithoutText: true,
						defects: []
					})),
					total: 18,
					defects: []
				},
				{
					theme: 'light' as const,
					pass: true,
					scientificAccuracy: 4,
					evidenceFidelity: 4,
					textExactness: 3,
					sequenceClarity: 3,
					ipadLegibility: 2,
					mnemonicCoherence: 1,
					appStyleFit: 1,
					textIndependentMeaning: true,
					distinctVisualAnchors: true,
					causalChangesVisible: true,
					noDominantRepetition: true,
					terminologyClear: true,
					compositionPlanFollowed: true,
					panelAudits: steps.map((step, index) => ({
						order: index + 1,
						dominantVisual: step.stepText,
						visibleCausalEvidence: `Visible evidence for ${step.stepText}.`,
						understandableWithoutText: true,
						defects: []
					})),
					total: 18,
					defects: []
				}
			],
			crossThemeConsistency: {
				compositionMatch: true,
				contentMatch: true,
				textMatch: true,
				scientificMeaningMatch: true,
				score: 4,
				defects: []
			},
			pass: true,
			rationale: 'Both variants are correct and the light edit changes only the theme.'
		};
		const hardChecks = { dark: { status: 'passed' }, light: { status: 'passed' } };
		expect(validateVisualJudge(judge, hardChecks, decision.visualSteps)).toEqual({
			status: 'passed',
			issues: []
		});

		for (const invalidAudits of [
			judge.variants[0].panelAudits.slice(0, -1),
			[
				judge.variants[0].panelAudits[0],
				judge.variants[0].panelAudits[2],
				judge.variants[0].panelAudits[1],
				judge.variants[0].panelAudits[3]
			]
		]) {
			const incompleteOrReordered = structuredClone(judge);
			incompleteOrReordered.variants[0].panelAudits = structuredClone(invalidAudits);
			const validation = validateVisualJudge(
				incompleteOrReordered,
				hardChecks,
				decision.visualSteps
			);
			expect(validation.status).toBe('failed');
			expect(validation.issues.join(' ')).toContain(
				'panel audits must match every approved visual step exactly once in order'
			);
		}

		expect(validateVisualJudge(judge, hardChecks, decision.visualSteps.slice(0, 3)).status).toBe(
			'failed'
		);
		expect(validateVisualJudge(judge, hardChecks, []).issues).toContain(
			'Validator requires the complete approved visual-step sequence.'
		);

		const restagedLight = structuredClone(judge);
		restagedLight.crossThemeConsistency.compositionMatch = false;
		restagedLight.crossThemeConsistency.score = 3;
		expect(validateVisualJudge(restagedLight, hardChecks, decision.visualSteps).status).toBe(
			'failed'
		);

		const repetitive = structuredClone(judge);
		repetitive.variants[0].noDominantRepetition = false;
		expect(validateVisualJudge(repetitive, hardChecks, decision.visualSteps).status).toBe('failed');

		for (const hardFailure of [
			'textIndependentMeaning',
			'distinctVisualAnchors',
			'causalChangesVisible',
			'noDominantRepetition',
			'terminologyClear'
		] as const) {
			const rejected = structuredClone(judge);
			rejected.variants[0][hardFailure] = false;
			rejected.variants[0].pass = false;
			rejected.pass = false;
			expect(validateVisualJudge(rejected, hardChecks, decision.visualSteps)).toEqual({
				status: 'passed',
				issues: []
			});
			expect(rejected.pass).toBe(false);
		}

		const repeatedAudit = structuredClone(judge);
		for (const panel of repeatedAudit.variants[0].panelAudits) {
			panel.dominantVisual = 'The same transformer front view';
		}
		repeatedAudit.variants[0].distinctVisualAnchors = false;
		repeatedAudit.variants[0].noDominantRepetition = false;
		repeatedAudit.variants[0].pass = false;
		repeatedAudit.pass = false;
		expect(validateVisualJudge(repeatedAudit, hardChecks, decision.visualSteps)).toEqual({
			status: 'passed',
			issues: []
		});

		const abbreviationAudit = structuredClone(judge);
		abbreviationAudit.variants[0].panelAudits[0].visibleCausalEvidence =
			'The label says p.d. rises.';
		abbreviationAudit.variants[0].terminologyClear = false;
		abbreviationAudit.variants[0].pass = false;
		abbreviationAudit.pass = false;
		expect(validateVisualJudge(abbreviationAudit, hardChecks, decision.visualSteps)).toEqual({
			status: 'passed',
			issues: []
		});
	});
});
