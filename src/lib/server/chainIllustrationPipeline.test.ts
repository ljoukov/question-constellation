import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	CHAIN_ILLUSTRATION_GLITCH_CATALOGUE,
	CHAIN_ILLUSTRATION_GLITCH_IDS,
	buildFreshDarkRegenerationPrompt,
	buildFreshLightEditRetryPrompt,
	buildGenerationPrompt,
	buildLightEditPrompt,
	buildLightEditStylePrompt,
	buildPlannerPrompt,
	buildStylePrompt,
	darkVisualJudgePrompt,
	darkVisualJudgeSchema,
	lightEditJudgePrompt,
	lightEditJudgeSchema,
	sourceFingerprint,
	validateDarkVisualJudge,
	validateLightEditJudge,
	validateSemanticPlan,
	validateVisualJudge,
	visualJudgePrompt,
	visualJudgeSchema
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
		const plannerPrompt = buildPlannerPrompt([candidate]);
		expect(prompt).toContain('16:9 landscape');
		expect(prompt).toContain('4 numbered stages or callouts');
		expect(prompt).toContain('Do not use any previous image');
		expect(prompt).toContain('three-second test');
		expect(prompt).toContain('Do not copy the same complete background');
		expect(prompt).toContain('MEANING WITH ALL TEXT HIDDEN');
		expect(prompt).toContain('Never copy their given values');
		expect(prompt).toContain('Use qualitative comparisons or universal symbols instead');
		expect(plannerPrompt).toContain(
			'Never plan question-specific or illustrative numerical values'
		);
		expect(plannerPrompt).toContain('correct and useful for every chain member');
		expect(
			visualJudgePrompt(candidate, decision, {
				dark: { status: 'passed' },
				light: { status: 'passed' }
			})
		).toContain('cross-theme consistency audit');
		expect(
			visualJudgePrompt(candidate, decision, {
				dark: { status: 'passed' },
				light: { status: 'passed' }
			})
		).toContain('noQuestionSpecificValues must be false');
		expect(buildStylePrompt(candidate)).toContain('mechanics and motion atlas');
		expect(buildLightEditStylePrompt(candidate)).toContain('light-mode scientific atlas');
		const lightPrompt = buildLightEditPrompt(candidate, decision);
		expect(lightPrompt).toContain('strict theme conversion');
		expect(lightPrompt).toContain('PRESERVE EXACTLY');
		expect(lightPrompt).toContain('same locations');
		expect(lightPrompt).toContain('Do not add or reproduce a question-specific');
		expect(sourceFingerprint(candidate)).toHaveLength(64);
	});

	it('keeps the full glitch catalogue in the judge and only triggered rules in a fresh retry', () => {
		expect(CHAIN_ILLUSTRATION_GLITCH_IDS).toEqual([
			'ambiguous_symbol_or_label_placement',
			'conductor_association',
			'bypass_topology',
			'dimensional_equation_errors',
			'repeated_object_identity_or_size_drift',
			'force_removal_direction',
			'conventional_current_or_electron_direction_confusion',
			'question_specific_numbers'
		]);
		const judgePrompt = visualJudgePrompt(candidate, decision, {
			dark: { status: 'passed' },
			light: { status: 'passed' }
		});
		for (const glitchId of CHAIN_ILLUSTRATION_GLITCH_IDS as ReadonlyArray<
			keyof typeof CHAIN_ILLUSTRATION_GLITCH_CATALOGUE
		>) {
			expect(judgePrompt).toContain(glitchId);
			expect(CHAIN_ILLUSTRATION_GLITCH_CATALOGUE[glitchId].judgeRule).not.toBe('');
			expect(CHAIN_ILLUSTRATION_GLITCH_CATALOGUE[glitchId].observedExamples.length).toBeGreaterThan(
				0
			);
		}
		expect(judgePrompt).toContain('Previously observed examples to recognise');
		expect(judgePrompt).toContain('Equations must occupy a visually separate equation region');

		const retry = buildFreshDarkRegenerationPrompt(buildGenerationPrompt(candidate, decision), {
			judge: {
				glitchFindings: [
					{
						glitchId: 'bypass_topology',
						themes: ['dark', 'light'],
						panelOrders: [2],
						defect: 'A wire bridges the resistor in panel 2.'
					}
				],
				variants: [],
				crossThemeConsistency: {
					compositionMatch: true,
					contentMatch: true,
					textMatch: true,
					scientificMeaningMatch: true,
					score: 4,
					defects: ['Do not copy this cross-theme duplicate defect.']
				},
				pass: false,
				rationale: 'Invalid circuit topology. Do not copy this unstructured duplicate defect.'
			}
		});
		expect(retry).toContain('brand-new DARK ORIGINAL from scratch');
		expect(retry).toContain('No previous image is supplied');
		expect(retry).toContain('never an edit');
		expect(retry).toContain('bypass_topology');
		expect(retry).toContain('A wire bridges the resistor in panel 2.');
		expect(retry).not.toContain('force_removal_direction:');
		expect(retry).not.toContain('question_specific_numbers:');
		expect(retry).not.toContain('total-current equation or label placed beside the lower branch');
		expect(retry).not.toContain('Do not copy this unstructured duplicate defect.');
		expect(retry).not.toContain('Do not copy this cross-theme duplicate defect.');

		const lightRetry = buildFreshLightEditRetryPrompt(buildLightEditPrompt(candidate, decision), {
			judge: {
				glitchFindings: [
					{
						glitchId: 'ambiguous_symbol_or_label_placement',
						themes: ['light'],
						panelOrders: [4],
						defect: 'The total-current label appears to name the lower branch.'
					}
				]
			}
		});
		expect(lightRetry).toContain('attached ACCEPTED DARK MASTER');
		expect(lightRetry).toContain('failed light image is not supplied');
		expect(lightRetry).toContain('The total-current label appears to name the lower branch.');
		expect(lightRetry).not.toContain('value copied from one member question');
	});

	it('gates the light edit behind an accepted dark and retries it only from that master', () => {
		const source = readFileSync('scripts/generate-chain-illustrations.mjs', 'utf8');
		const darkPhaseStart = source.indexOf('const darkAttempts = []');
		const darkAcceptanceGate = source.indexOf('if (!acceptedDarkAttempt)');
		const lightPhaseStart = source.indexOf('const lightAttempts = []');
		expect(darkPhaseStart).toBeGreaterThan(-1);
		expect(darkAcceptanceGate).toBeGreaterThan(darkPhaseStart);
		expect(lightPhaseStart).toBeGreaterThan(darkAcceptanceGate);

		const darkRunnerStart = source.indexOf('async function generateAndJudgeDarkAttempt');
		const lightRunnerStart = source.indexOf('async function generateAndJudgeLightAttempt');
		const darkRunner = source.slice(darkRunnerStart, lightRunnerStart);
		expect(darkRunner).toContain('darkVisualJudgePrompt');
		expect(darkRunner).not.toContain('generateLightIllustration');
		expect(source).toContain('dark: acceptedDarkAttempt.dark');
		expect(source).toContain('buildFreshLightEditRetryPrompt(lightPromptText');
		expect(source).not.toContain('validationIssues:');
		expect(source).not.toContain('generateAndJudgeAttempt');
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
					noQuestionSpecificValues: true,
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
					noQuestionSpecificValues: true,
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
			glitchFindings: [],
			pass: true,
			rationale: 'Both variants are correct and the light edit changes only the theme.'
		};
		const hardChecks = { dark: { status: 'passed' }, light: { status: 'passed' } };
		const variantSchema = visualJudgeSchema().properties.variants.items;
		expect(variantSchema.required).toContain('noQuestionSpecificValues');
		expect(variantSchema.properties.noQuestionSpecificValues).toEqual({ type: 'boolean' });
		expect(validateVisualJudge(judge, hardChecks, decision.visualSteps)).toEqual({
			status: 'passed',
			issues: []
		});

		const darkJudge = {
			variant: structuredClone(judge.variants[0]),
			glitchFindings: [],
			pass: true,
			rationale: 'The dark original passes independently before any light edit.'
		};
		expect(darkVisualJudgePrompt(candidate, decision, hardChecks.dark)).toContain(
			'must pass before any light edit is allowed'
		);
		expect(darkVisualJudgeSchema().properties.variant.properties.theme.enum).toEqual(['dark']);
		expect(validateDarkVisualJudge(darkJudge, hardChecks.dark, decision.visualSteps)).toEqual({
			status: 'passed',
			issues: []
		});

		const lightJudge = {
			variant: structuredClone(judge.variants[1]),
			crossThemeConsistency: structuredClone(judge.crossThemeConsistency),
			glitchFindings: [],
			pass: true,
			rationale: 'The light edit exactly preserves the accepted dark master.'
		};
		expect(lightEditJudgePrompt(candidate, decision, hardChecks)).toContain(
			'ACCEPTED DARK MASTER, then NEW LIGHT EDIT'
		);
		expect(lightEditJudgeSchema().properties.variant.properties.theme.enum).toEqual(['light']);
		expect(validateLightEditJudge(lightJudge, hardChecks, decision.visualSteps)).toEqual({
			status: 'passed',
			issues: []
		});

		const invalidDarkThemeFinding = structuredClone(darkJudge) as any;
		invalidDarkThemeFinding.glitchFindings = [
			{
				glitchId: 'bypass_topology',
				themes: ['light'],
				panelOrders: [1],
				defect: 'Wrong theme in the dark-only audit.'
			}
		];
		invalidDarkThemeFinding.variant.pass = false;
		invalidDarkThemeFinding.pass = false;
		expect(
			validateDarkVisualJudge(
				invalidDarkThemeFinding,
				hardChecks.dark,
				decision.visualSteps
			).issues.join(' ')
		).toContain('may name only the dark theme');
		const missingNumericTransferabilityAudit = structuredClone(judge);
		delete (
			missingNumericTransferabilityAudit.variants[0] as { noQuestionSpecificValues?: boolean }
		).noQuestionSpecificValues;
		missingNumericTransferabilityAudit.variants[0].pass = false;
		missingNumericTransferabilityAudit.pass = false;
		expect(
			validateVisualJudge(
				missingNumericTransferabilityAudit,
				hardChecks,
				decision.visualSteps
			).issues.join(' ')
		).toContain('noQuestionSpecificValues must be a boolean');

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
			'terminologyClear',
			'compositionPlanFollowed',
			'noQuestionSpecificValues'
		] as const) {
			const rejected: any = structuredClone(judge);
			rejected.variants[0][hardFailure] = false;
			if (hardFailure === 'noQuestionSpecificValues') {
				rejected.glitchFindings = [
					{
						glitchId: 'question_specific_numbers',
						themes: ['dark'],
						panelOrders: [2],
						defect: 'Panel 2 contains a value copied from one question.'
					}
				];
			}
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
