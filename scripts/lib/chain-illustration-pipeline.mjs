import { createHash } from 'node:crypto';

export const CHAIN_ILLUSTRATION_SCHEMA_VERSION = 'chain-illustration-job/v2';
export const CHAIN_ILLUSTRATION_STYLE_KEY = 'luminous-scientific-atlas-v2';

/**
 * Persistent visual failure taxonomy. The base image prompt intentionally stays compact; this
 * catalogue belongs to the independent judge and only the rules for defects it actually finds are
 * copied into a fresh-regeneration prompt.
 */
export const CHAIN_ILLUSTRATION_GLITCH_CATALOGUE = Object.freeze({
	ambiguous_symbol_or_label_placement: Object.freeze({
		label: 'Ambiguous symbol or label placement',
		judgeRule:
			'Fail any symbol, current label, quantity label or leader that can plausibly refer to more than one object, branch or location. Every symbol must have an unambiguous leader or sit directly beside the exact physical quantity/location it names. Equations must be visually separated from conductor and object labels.',
		observedExamples: Object.freeze([
			'a total-current equation or label placed beside the lower branch so it appears to label that branch',
			'a bidirectional subtraction arrow that leaves the intended resultant direction ambiguous'
		]),
		regenerationRule:
			'Give every symbol or quantity label one unmistakable target using a short leader or immediate adjacency. Keep equations in a separate equation region, never floating on a conductor or between possible targets.'
	}),
	conductor_association: Object.freeze({
		label: 'Wrong conductor or branch association',
		judgeRule:
			'Fail when a current, charge, voltage, field, force or energy cue is visually attached to the wrong conductor, branch, component or body, including cues placed between two candidates.',
		observedExamples: Object.freeze([
			'a potential-difference cue drawn along one rail instead of across the intended branch'
		]),
		regenerationRule:
			'Attach each flow, arrow and quantity cue to the exact intended conductor, branch, component or body; leave enough space that it cannot be read as belonging to a neighbour.'
	}),
	bypass_topology: Object.freeze({
		label: 'Bypass or invalid topology',
		judgeRule:
			'Fail any wire, connector, meter, pipe or pathway that accidentally bypasses the mechanism, shorts a component, breaks continuity, or uses an instrument in a scientifically invalid topology.',
		observedExamples: Object.freeze([
			'a source disappearing in a later stage and leaving a bare bypass wire',
			'circuit rails dangling below the final junction instead of ending in a complete circuit'
		]),
		regenerationRule:
			'Draw one physically valid, continuous topology. Do not create a bypass or short circuit; connect measuring instruments in the scientifically correct place and make every junction explicit.'
	}),
	dimensional_equation_errors: Object.freeze({
		label: 'Dimensionally or algebraically invalid equation',
		judgeRule:
			'Fail a malformed, dimensionally inconsistent or contextually false equation, including an equality between unlike quantities or a formula visually fused with a component label.',
		observedExamples: Object.freeze([
			'a resultant-force arrow shown equal in magnitude to the applied-force arrow even though a non-zero resistive force is also shown'
		]),
		regenerationRule:
			'Use only the approved universal equation in a clean, self-contained equation box. Check algebra, dimensions, symbols and subscripts; do not merge the equation with a physical label.'
	}),
	repeated_object_identity_or_size_drift: Object.freeze({
		label: 'Repeated-object identity, count or size drift',
		judgeRule:
			'Fail when the same object silently changes identity, scale, count, density, direction or baseline state across stages unless that exact change is the approved mechanism. In particular, do not imply that carriers, particles or objects are created merely to show a faster rate.',
		observedExamples: Object.freeze([
			'equal before-and-after total-momentum bars that retain the same object contribution split while the surrounding arrows claim momentum transfer',
			'a repeated object or system resetting to an incompatible earlier state between panels',
			'after-collision objects overlapping or moving in directions incoherent with the shown collision',
			'carrier-count inflation used to depict a higher current or reaction rate'
		]),
		regenerationRule:
			'Keep repeated objects recognisably identical in scale, count, density and baseline state unless the approved step changes that property. Show a higher rate with motion, spacing in time or a counting gate—not by inventing more objects.'
	}),
	force_removal_direction: Object.freeze({
		label: 'Wrong direction after force removal',
		judgeRule:
			'Fail when removing a force shows continued loading, sideways motion, ambiguous axes or recovery away from equilibrium instead of a clear return toward the equilibrium state.',
		observedExamples: Object.freeze([
			'a force-removal or recovery arrow pointing away from the marked equilibrium state'
		]),
		regenerationRule:
			'When the applied force is removed, show the restoring motion on one registered axis pointing back toward the clearly marked equilibrium state. Remove loading arrows rather than rotating or continuing them.'
	}),
	conventional_current_or_electron_direction_confusion: Object.freeze({
		label: 'Conventional-current and electron-direction confusion',
		judgeRule:
			'Fail inconsistent current arrows around one circuit, an electron depiction moving in the conventional-current direction, or unlabeled carrier beads whose direction makes current semantics ambiguous. If both are shown, electron flow must be explicitly labelled and opposite conventional current.',
		observedExamples: Object.freeze([
			'conventional-current arrows changing direction between panels without a polarity change'
		]),
		regenerationRule:
			'Use one consistent conventional-current direction around the complete circuit. If electrons are shown, label them explicitly and point them oppositely; otherwise avoid electron-like beads and show current rate with neutral flow cues.'
	}),
	question_specific_numbers: Object.freeze({
		label: 'Question-specific or invented numbers',
		judgeRule:
			'Fail any given value, worked substitution, intermediate result, final answer, one-question unit or invented example scale. Permit only panel ordinals and universal notation valid for every attached question.',
		observedExamples: Object.freeze([
			'a value copied from one member question even though the illustration is reused by questions with different values'
		]),
		regenerationRule:
			'Remove every example or question-specific value and unit. Keep only panel ordinals and universal symbols, equations, constants or ratios that remain valid for every attached question.'
	}),
	ground_contact_or_motion_discontinuity: Object.freeze({
		label: 'Ground contact or motion discontinuity',
		judgeRule:
			'Fail when a wheeled, sliding, suspended or otherwise constrained object visibly floats, jumps, tilts off, clips through or loses contact with its track, road, surface or support without that being the approved mechanism. Motion across stages must remain physically continuous.',
		observedExamples: Object.freeze([
			'a collision trolley appearing to jump above the rail in one stage even though no vertical motion is involved'
		]),
		regenerationRule:
			'Keep every constrained object visibly registered to the same track, surface or support throughout the event. Preserve a physically continuous path and do not imply an unapproved jump, lift, tilt or teleport.'
	}),
	unexplained_abstract_encoding: Object.freeze({
		label: 'Unexplained abstract visual encoding',
		judgeRule:
			'Fail a bar, chart, gauge, colour split, detached arrow group or other abstract encoding whose visual grammar is not self-evident and directly tied to the physical mechanism. An unexplained diagram must not carry a required causal step.',
		observedExamples: Object.freeze([
			'before-and-after colour bars with no clear physical meaning or mapping to the colliding objects'
		]),
		regenerationRule:
			'Replace unexplained charts or detached encodings with visible physical state changes on the actual objects. Retain a compact diagram only when its mapping is immediate, necessary and unambiguous.'
	}),
	spatial_story_breakdown: Object.freeze({
		label: 'Spatial story or layout breakdown',
		judgeRule:
			'Fail when excessive unused space, disconnected repeated boxes, contradictory positions or a scrambled scan path prevent the learner from reading one coherent causal event in the required order.',
		observedExamples: Object.freeze([
			'most of each panel left empty while small repeated objects and detached arrows fail to form a continuous collision story'
		]),
		regenerationRule:
			'Use the canvas to form one coherent physical story with balanced spacing and an unmistakable ordered eye path. Keep related objects, arrows and state changes close enough to be read together.'
	}),
	missing_derived_quantity_bridge: Object.freeze({
		label: 'Missing bridge for a central derived quantity',
		judgeRule:
			'Fail when the illustration depends on a central derived scientific quantity that remains opaque even after viewing the physical mechanism, and one compact universal relationship would connect it to familiar quantities without adding a new causal step. Do not demand a formula when the visual already makes the term clear or the relationship is irrelevant.',
		observedExamples: Object.freeze([
			'a momentum-transfer illustration repeatedly naming momentum without connecting it to mass and velocity'
		]),
		regenerationRule:
			'Add at most one compact, universally valid concept bridge in a separate supporting region, using full familiar terms and optionally the standard formula. Do not add example values, units, worked substitution or another numbered step.'
	}),
	missing_governing_law_bridge: Object.freeze({
		label: 'Missing bridge for a governing law or invariant',
		judgeRule:
			'Fail when the approved mechanism depends on a conservation, balance, equality or other governing property but the illustration leaves that connection implicit even though one compact universal statement would make the relationship memorable. Do not require a law that is not part of the approved reasoning.',
		observedExamples: Object.freeze([
			'a collision showing momentum transfer without connecting it to total momentum before equalling total momentum after'
		]),
		regenerationRule:
			'Add one compact, universally valid statement of the governing conservation, balance or equality property in a separate supporting region. Keep it connected to the depicted mechanism, outside the numbered steps, and free of example values.'
	}),
	ambiguous_physical_quantity_encoding: Object.freeze({
		label: 'Ambiguous physical-quantity encoding',
		judgeRule:
			'Fail when an arrow, glow, length, area, colour or repeated cue could represent two materially different quantities and that ambiguity changes the scientific meaning, such as velocity versus momentum.',
		observedExamples: Object.freeze([
			'collision arrows whose lengths appear to prove momentum conservation but are never identified as velocity or momentum'
		]),
		regenerationRule:
			'Make each scientific encoding explicit and consistent using one concise full-word label or unmistakable direct attachment. Do not let a qualitative arrow length appear to assert a different conserved quantity.'
	}),
	conserved_quantity_creation_cue: Object.freeze({
		label: 'Conserved quantity appears to be created',
		judgeRule:
			'Fail when a burst, glow, particle source, expanding halo or other effect makes a conserved quantity appear to originate at an interaction instead of being transferred, redistributed or transformed within the stated system.',
		observedExamples: Object.freeze([
			'an explosive contact flash that makes momentum appear to be created during a collision'
		]),
		regenerationRule:
			'Show a directional transfer or redistribution between the existing objects, using a restrained connector or flow cue. Avoid a source-like burst that implies the conserved quantity appears from nowhere.'
	}),
	scientifically_inexact_relationship_terminology: Object.freeze({
		label: 'Scientifically inexact relationship terminology',
		judgeRule:
			'Fail a concise label that sounds plausible but names the scientific condition, relationship or system incorrectly, especially when the wording changes what law applies.',
		observedExamples: Object.freeze([
			'calling a collision itself closed instead of identifying a closed system'
		]),
		regenerationRule:
			'Replace the imprecise label with the exact GCSE term for the condition, relationship or system. Make the term visibly attach to what it describes and keep the wording concise.'
	})
});

export const CHAIN_ILLUSTRATION_GLITCH_IDS = Object.freeze(
	Object.keys(CHAIN_ILLUSTRATION_GLITCH_CATALOGUE)
);

/**
 * @typedef {object} ChainStep
 * @property {string} id
 * @property {string | undefined} [chainId]
 * @property {number} displayOrder
 * @property {string} stepText
 * @property {string} stepRole
 * @property {string | null | undefined} [explanation]
 * @property {string | null | undefined} [commonOmission]
 */

/**
 * @typedef {object} MarkSchemeItem
 * @property {string} id
 * @property {number} displayOrder
 * @property {string} itemType
 * @property {string} text
 * @property {number | null} marks
 * @property {number} confidence
 */

/**
 * @typedef {object} ChecklistItem
 * @property {string} id
 * @property {number} displayOrder
 * @property {string} text
 * @property {boolean} required
 * @property {number} confidence
 * @property {number} needsHumanReview
 * @property {string[]} markSchemeItemIds
 */

/**
 * @typedef {object} ModelAnswer
 * @property {string} id
 * @property {string} answerText
 * @property {string | null | undefined} [derivation]
 * @property {number} confidence
 * @property {number} needsHumanReview
 * @property {string[]} supportingMarkSchemeItemIds
 */

/**
 * @typedef {object} ChainMember
 * @property {string | undefined} [chainId]
 * @property {string} questionId
 * @property {string | undefined} [questionStatus]
 * @property {number | undefined} [questionNeedsReview]
 * @property {number | undefined} [membershipNeedsReview]
 * @property {number | undefined} [extractionConfidence]
 * @property {string} sourceDocumentId
 * @property {string} sourceQuestionRef
 * @property {string} promptText
 * @property {string | null | undefined} [selfContainedPromptText]
 * @property {string | null | undefined} [commandWord]
 * @property {number} marks
 * @property {number} fitConfidence
 * @property {string | null | undefined} [paper]
 * @property {string | null | undefined} [series]
 * @property {number | null | undefined} [year]
 * @property {number | undefined} [overlayCount]
 * @property {MarkSchemeItem[]} markSchemeItems
 * @property {ChecklistItem[]} checklistItems
 * @property {ModelAnswer[]} modelAnswers
 */

/**
 * @typedef {object} ChainIllustrationCandidate
 * @property {string} id
 * @property {string | null | undefined} [slug]
 * @property {string | null | undefined} [title]
 * @property {string} canonicalChainText
 * @property {string | null | undefined} [summary]
 * @property {string} subjectArea
 * @property {string | null | undefined} [broadTopic]
 * @property {number} confidence
 * @property {string | null | undefined} [updatedAt]
 * @property {ChainStep[]} steps
 * @property {ChainMember[]} members
 */

/**
 * @typedef {object} EvidenceMapping
 * @property {string} sourceStepId
 * @property {string} supportType
 * @property {string[]} markSchemeItemIds
 * @property {string} excerpt
 */

/**
 * @typedef {object} EvidenceByQuestion
 * @property {string} questionId
 * @property {EvidenceMapping[]} mappings
 */

/**
 * @typedef {object} VisualStep
 * @property {number} order
 * @property {string} heading
 * @property {string} microcopy
 * @property {string[]} sourceStepIds
 * @property {string} visual
 * @property {string} distinctVisualAnchor
 * @property {string} textHiddenMeaning
 * @property {string[]} misconceptionGuards
 */

/**
 * @typedef {object} SemanticDecision
 * @property {string} chainId
 * @property {string} verdict
 * @property {string} rationale
 * @property {boolean} sameOrderedLinks
 * @property {boolean} allMembersCovered
 * @property {boolean} contextOnlyVariation
 * @property {boolean} branching
 * @property {string} representativeQuestionId
 * @property {string} title
 * @property {string} altText
 * @property {string} caption
 * @property {'continuous-journey' | 'single-subject-state-progression' | 'linked-distinct-scenes'} compositionMode
 * @property {string} visualAnchor
 * @property {string} continuousPath
 * @property {string} visualWithoutTextSummary
 * @property {VisualStep[]} visualSteps
 * @property {EvidenceByQuestion[]} evidenceByQuestion
 */

/** @typedef {{ decisions?: SemanticDecision[] }} SemanticPlan */
/** @typedef {Record<string, { status?: string, issues?: string[] } | undefined>} HardImageChecks */

/**
 * @typedef {object} GlitchFinding
 * @property {keyof typeof CHAIN_ILLUSTRATION_GLITCH_CATALOGUE} glitchId
 * @property {('dark' | 'light')[]} themes
 * @property {number[]} panelOrders
 * @property {string} defect
 */

/**
 * @typedef {object} VisualJudgeVariant
 * @property {'dark' | 'light'} theme
 * @property {boolean} pass
 * @property {number} scientificAccuracy
 * @property {number} evidenceFidelity
 * @property {number} textExactness
 * @property {number} sequenceClarity
 * @property {number} ipadLegibility
 * @property {number} mnemonicCoherence
 * @property {number} appStyleFit
 * @property {boolean} textIndependentMeaning
 * @property {boolean} distinctVisualAnchors
 * @property {boolean} causalChangesVisible
 * @property {boolean} noDominantRepetition
 * @property {boolean} terminologyClear
 * @property {boolean} compositionPlanFollowed
 * @property {boolean} noQuestionSpecificValues
 * @property {string} textHiddenTakeaway
 * @property {string} fullImageTakeaway
 * @property {{visualCue: string, concept: string, relationship: string}[]} associativeLinks
 * @property {string[]} unintendedTakeaways
 * @property {boolean} takeawayMatchesGoal
 * @property {{order: number, dominantVisual: string, visibleCausalEvidence: string, understandableWithoutText: boolean, defects: string[]}[]} panelAudits
 * @property {number} total
 * @property {string[]} defects
 */

/**
 * @typedef {object} VisualJudge
 * @property {VisualJudgeVariant[]} [variants]
 * @property {{compositionMatch: boolean, contentMatch: boolean, textMatch: boolean, scientificMeaningMatch: boolean, score: number, defects: string[]}} crossThemeConsistency
 * @property {GlitchFinding[]} glitchFindings
 * @property {boolean} pass
 * @property {string} rationale
 */

const STYLE_ROUTES = {
	biology: {
		default:
			'luminous biological textbook cutaway mixed with elegant scientific illustration, accurate but accessible for GCSE',
		cellular:
			'luminous cellular-microscopy atlas mixed with elegant scientific illustration, accurate but accessible for GCSE',
		ecology:
			'luminous natural-history and ecology atlas mixed with elegant scientific illustration, accurate but accessible for GCSE',
		laboratory:
			'luminous biological laboratory-process atlas mixed with elegant scientific illustration, accurate but accessible for GCSE'
	},
	chemistry: {
		default:
			'luminous molecular and materials atlas mixed with elegant scientific illustration, accurate but accessible for GCSE',
		energy:
			'luminous reaction-energy atlas mixed with elegant scientific illustration, accurate but accessible for GCSE',
		apparatus:
			'luminous chemistry apparatus and process atlas mixed with elegant scientific illustration, accurate but accessible for GCSE',
		geological:
			'luminous geological-resource atlas mixed with elegant scientific illustration, accurate but accessible for GCSE'
	},
	physics: {
		default:
			'luminous engineering and physical-systems atlas mixed with elegant scientific illustration, accurate but accessible for GCSE',
		mechanics:
			'luminous mechanics and motion atlas mixed with elegant scientific illustration, accurate but accessible for GCSE',
		electrical:
			'luminous electrical-engineering atlas mixed with elegant scientific illustration, accurate but accessible for GCSE',
		waves:
			'luminous fields and waves atlas mixed with elegant scientific illustration, accurate but accessible for GCSE',
		nuclear:
			'luminous nuclear-particle atlas mixed with elegant scientific illustration, accurate but accessible for GCSE',
		measurement:
			'luminous precision-measurement atlas mixed with elegant scientific illustration, accurate but accessible for GCSE'
	}
};

/**
 * Return the exact normalized evidence projection used for freshness fingerprints.
 *
 * Keep this helper separate from hashing so tightly scoped data migrations can prove that a
 * source-identity correction changes only the intended leaves before rebasing a published row.
 * @param {ChainIllustrationCandidate} candidate
 */
export function normalizedSourceFingerprintInput(candidate) {
	return {
		chain: {
			id: candidate.id,
			slug: candidate.slug,
			title: candidate.title,
			canonicalChainText: candidate.canonicalChainText,
			summary: candidate.summary,
			subjectArea: candidate.subjectArea,
			broadTopic: candidate.broadTopic,
			confidence: candidate.confidence,
			updatedAt: candidate.updatedAt
		},
		steps: candidate.steps.map((step) => ({
			id: step.id,
			chainId: step.chainId,
			displayOrder: step.displayOrder,
			stepText: step.stepText,
			stepRole: step.stepRole,
			explanation: step.explanation,
			commonOmission: step.commonOmission
		})),
		members: candidate.members.map((member) => ({
			chainId: member.chainId,
			questionId: member.questionId,
			questionStatus: member.questionStatus,
			questionNeedsReview: member.questionNeedsReview,
			membershipNeedsReview: member.membershipNeedsReview,
			extractionConfidence: member.extractionConfidence,
			sourceDocumentId: member.sourceDocumentId,
			sourceQuestionRef: member.sourceQuestionRef,
			promptText: member.promptText,
			selfContainedPromptText: member.selfContainedPromptText,
			commandWord: member.commandWord,
			marks: member.marks,
			fitConfidence: member.fitConfidence,
			paper: member.paper,
			series: member.series,
			year: member.year,
			overlayCount: member.overlayCount,
			markSchemeItems: member.markSchemeItems.map((item) => ({
				id: item.id,
				displayOrder: item.displayOrder,
				itemType: item.itemType,
				text: item.text,
				marks: item.marks,
				confidence: item.confidence
			})),
			checklistItems: member.checklistItems.map((item) => ({
				id: item.id,
				displayOrder: item.displayOrder,
				text: item.text,
				required: item.required,
				confidence: item.confidence,
				needsHumanReview: item.needsHumanReview,
				markSchemeItemIds: item.markSchemeItemIds
			})),
			modelAnswers: member.modelAnswers.map((answer) => ({
				id: answer.id,
				answerText: answer.answerText,
				derivation: answer.derivation,
				confidence: answer.confidence,
				needsHumanReview: answer.needsHumanReview,
				supportingMarkSchemeItemIds: answer.supportingMarkSchemeItemIds
			}))
		}))
	};
}

/** @param {unknown} source */
export function sourceFingerprintFromInput(source) {
	return sha256(stableStringify(source));
}

/** @param {ChainIllustrationCandidate} candidate */
export function sourceFingerprint(candidate) {
	return sourceFingerprintFromInput(normalizedSourceFingerprintInput(candidate));
}

/** @param {ChainIllustrationCandidate[]} candidates */
export function buildPlannerPrompt(candidates) {
	return `You are the evidence gate and visual planner for answer-chain illustrations in Question Constellation, a GCSE exam-question atlas.

You are not generating images. Decide whether each candidate is a genuinely reusable, mark-scoring reasoning chain and, only when it is safe, create a lossless plan of at most four visual panels.

Everything you need is embedded below. Do not inspect the repository or filesystem, run commands,
use the web, or look for other instructions. Return only the requested structured decision data.

Non-negotiable acceptance rules:
- The same ordered reasoning must fit every attached public question. Multi-paper reuse alone is not proof.
- For every original source step and every question, cite either an exact prompt-given excerpt or one or more real mark-scheme item IDs from that question.
- Reject if a step is absent, optional, question-specific, out of order, or if a linked question needs a different endpoint or branch.
- Every substantive internal causal/process/link/effect step must be mark-scored in at least two distinct source papers.
- The final endpoint is the only exception: it may be prompt-given in one or more questions and mark-scored in others, but it must be explicitly supported by the prompt or a clean positive mark row in every source paper. Do not use this exception for an internal reasoning link.
- Use 2, 3, or 4 panels. Never pad a short chain to four panels.
- A five-step chain may merge exactly one adjacent pair only if both scoring ideas remain explicit in one panel. Every source step must appear exactly once, in order.
- Reject chains that are only recall labels, formatting instructions, a worked answer, or visually misleading abstractions.
- The plan must remain transferable across the attached contexts; do not turn it into an illustration of only the representative question.
- Never plan question-specific or illustrative numerical values. Do not copy given values, substitutions, intermediate results, final answers, one-question units or arbitrary example scales from any attached question. Panel ordinal numbers are allowed. A universal equation, symbol, formula constant or ratio is allowed only when it is correct and useful for every chain member.
- Headings should be short, concrete and reconstruct the causal chain. Microcopy must be at most ten words.
- Alt text and caption must state the full approved chain without adding facts.

Visual-learning gate for every accepted plan:
- Optimise for a three-second grasp: with all words hidden, the pictures alone must let a learner recover the ordered mechanism.
- Trigger complementary visual channels at once: one coherent whole-system journey, distinct mechanism close-ups, spatial direction, meaningful colour/state changes, and a concrete before/after or real-world outcome where appropriate.
- Establish shared context once. Do not redraw the complete system or repeat the same dominant object in every panel.
- Every panel needs a different mechanism-specific visual anchor and silhouette. A recurring object may provide continuity, but it must not dominate an unrelated panel.
- Prefer physical mechanisms, cutaways, scale changes and visible comparisons over generic gauges, dashboards, checkmarks or abstract icons. A gauge may support a mechanism; it may never be the main explanation.
- Make the endpoint concrete when possible: show the organism, material or consumer outcome rather than an abstract success meter.
- Use full student-facing terminology. Never use unexplained shorthand such as "p.d."; write "potential difference" or an equally clear full phrase.
- Small, correct GCSE equations may support an approved causal link when they explain it visually, but must not become an extra step.
- When a chain depends on a derived scientific quantity whose name may remain opaque, plan at most one compact universal bridge to familiar quantities (for example, momentum = mass × velocity). Keep it outside the numbered causal steps. Omit it when the physical mechanism already explains the term or the relationship is not essential.
- When an approved conservation, balance, equality or other governing property deepens the same mechanism, plan at most one compact universal law reminder (for example, total momentum before = total momentum after, or total current into a junction = total current out). Keep it visually connected to the mechanism but outside the numbered steps. Never invent a law that the evidence does not support.
- Design associations deliberately: every supporting cue must connect a visible object or state to one concept and then to the approved causal relationship. For example, changed motion on either side of a collision can connect momentum transfer to conservation; branch flows meeting at a junction can connect individual currents to current balance. Do not return a disconnected list of facts, icons or formulae.
- Keep all planned visuals and learner-facing text numerically transferable: no sample measurements or worked-example numbers. Use qualitative comparisons or universal symbols instead, and include a formula constant or ratio only when it applies unchanged to every attached question.
- Choose compositionMode deliberately: continuous-journey for a process through a system, single-subject-state-progression for one object changing state, or linked-distinct-scenes when the causal steps require different scales or subjects.
- visualAnchor names the memorable whole-image subject; continuousPath states how the eye travels through the mechanism; visualWithoutTextSummary states what a learner can retell after seeing the art for three seconds with all wording hidden.
- For each panel, distinctVisualAnchor must name its unique hero visual, and textHiddenMeaning must say exactly what a learner should infer before reading.

Return one decision for every candidate. A rejected decision may use empty visualSteps and evidenceByQuestion arrays.

Candidate evidence follows:
${JSON.stringify(candidates, null, 2)}`;
}

export function semanticPlanSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['decisions'],
		properties: {
			decisions: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: [
						'chainId',
						'verdict',
						'rationale',
						'sameOrderedLinks',
						'allMembersCovered',
						'contextOnlyVariation',
						'branching',
						'representativeQuestionId',
						'title',
						'altText',
						'caption',
						'compositionMode',
						'visualAnchor',
						'continuousPath',
						'visualWithoutTextSummary',
						'visualSteps',
						'evidenceByQuestion'
					],
					properties: {
						chainId: { type: 'string' },
						verdict: { type: 'string', enum: ['accept', 'reject'] },
						rationale: { type: 'string' },
						sameOrderedLinks: { type: 'boolean' },
						allMembersCovered: { type: 'boolean' },
						contextOnlyVariation: { type: 'boolean' },
						branching: { type: 'boolean' },
						representativeQuestionId: { type: 'string' },
						title: { type: 'string' },
						altText: { type: 'string' },
						caption: { type: 'string' },
						compositionMode: {
							type: 'string',
							enum: [
								'continuous-journey',
								'single-subject-state-progression',
								'linked-distinct-scenes'
							]
						},
						visualAnchor: { type: 'string' },
						continuousPath: { type: 'string' },
						visualWithoutTextSummary: { type: 'string' },
						visualSteps: {
							type: 'array',
							items: {
								type: 'object',
								additionalProperties: false,
								required: [
									'order',
									'heading',
									'microcopy',
									'sourceStepIds',
									'visual',
									'distinctVisualAnchor',
									'textHiddenMeaning',
									'misconceptionGuards'
								],
								properties: {
									order: { type: 'integer' },
									heading: { type: 'string' },
									microcopy: { type: 'string' },
									sourceStepIds: { type: 'array', items: { type: 'string' } },
									visual: { type: 'string' },
									distinctVisualAnchor: { type: 'string' },
									textHiddenMeaning: { type: 'string' },
									misconceptionGuards: { type: 'array', items: { type: 'string' } }
								}
							}
						},
						evidenceByQuestion: {
							type: 'array',
							items: {
								type: 'object',
								additionalProperties: false,
								required: ['questionId', 'mappings'],
								properties: {
									questionId: { type: 'string' },
									mappings: {
										type: 'array',
										items: {
											type: 'object',
											additionalProperties: false,
											required: ['sourceStepId', 'supportType', 'markSchemeItemIds', 'excerpt'],
											properties: {
												sourceStepId: { type: 'string' },
												supportType: {
													type: 'string',
													enum: ['prompt_given', 'mark_scored']
												},
												markSchemeItemIds: {
													type: 'array',
													items: { type: 'string' }
												},
												excerpt: { type: 'string' }
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	};
}

/**
 * @param {ChainIllustrationCandidate[]} candidates
 * @param {SemanticPlan | null | undefined} plan
 */
export function validateSemanticPlan(candidates, plan) {
	const issues = [];
	const decisions = Array.isArray(plan?.decisions) ? plan.decisions : [];
	const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
	const decisionIds = decisions.map((decision) => decision.chainId);
	if (new Set(decisionIds).size !== decisionIds.length) issues.push('Duplicate chain decisions.');
	for (const id of candidateById.keys()) {
		if (!decisionIds.includes(id)) issues.push(`Missing decision for ${id}.`);
	}
	for (const decision of decisions) {
		const candidate = candidateById.get(decision.chainId);
		if (!candidate) {
			issues.push(`Unexpected decision for ${decision.chainId}.`);
			continue;
		}
		if (decision.verdict !== 'accept') continue;
		if (
			!decision.sameOrderedLinks ||
			!decision.allMembersCovered ||
			!decision.contextOnlyVariation ||
			decision.branching
		) {
			issues.push(`${candidate.id}: accepted without all semantic reuse gates.`);
		}
		const memberIds = candidate.members.map((member) => member.questionId);
		if (!memberIds.includes(decision.representativeQuestionId)) {
			issues.push(`${candidate.id}: representative question is not a member.`);
		}
		if (!String(decision.title ?? '').trim() || String(decision.title).length > 64) {
			issues.push(`${candidate.id}: title must be 1-64 characters.`);
		}
		if (!String(decision.altText ?? '').trim() || String(decision.altText).length > 320) {
			issues.push(`${candidate.id}: alt text must be 1-320 characters.`);
		}
		if (!String(decision.caption ?? '').trim() || String(decision.caption).length > 240) {
			issues.push(`${candidate.id}: caption must be 1-240 characters.`);
		}
		if (
			![
				'continuous-journey',
				'single-subject-state-progression',
				'linked-distinct-scenes'
			].includes(decision.compositionMode)
		) {
			issues.push(`${candidate.id}: choose a supported visual composition mode.`);
		}
		for (const [field, value] of [
			['whole-image visual anchor', decision.visualAnchor],
			['continuous visual path', decision.continuousPath],
			['text-hidden summary', decision.visualWithoutTextSummary]
		]) {
			if (!String(value ?? '').trim()) issues.push(`${candidate.id}: ${field} is required.`);
		}
		for (const [field, value] of [
			['title', decision.title],
			['alt text', decision.altText],
			['caption', decision.caption],
			['whole-image visual anchor', decision.visualAnchor],
			['continuous visual path', decision.continuousPath],
			['text-hidden summary', decision.visualWithoutTextSummary]
		]) {
			if (hasUnexplainedShorthand(value)) {
				issues.push(`${candidate.id}: ${field} contains unexplained shorthand.`);
			}
		}
		if (
			hasUnexplainedShorthand(
				[
					candidate.title,
					candidate.canonicalChainText,
					candidate.summary,
					...candidate.steps.flatMap((step) => [step.stepText, step.explanation])
				].join(' ')
			)
		) {
			issues.push(`${candidate.id}: source chain contains unexplained shorthand.`);
		}
		const visualSteps = decision.visualSteps ?? [];
		if (visualSteps.length < 2 || visualSteps.length > 4) {
			issues.push(`${candidate.id}: visual plan must use 2-4 panels.`);
		}
		for (const [index, step] of visualSteps.entries()) {
			if (step.order !== index + 1) issues.push(`${candidate.id}: panel order is not contiguous.`);
			if (!String(step.heading ?? '').trim() || String(step.heading).length > 34) {
				issues.push(`${candidate.id}: panel ${index + 1} heading is missing or too long.`);
			}
			if (wordCount(step.microcopy) > 10) {
				issues.push(`${candidate.id}: panel ${index + 1} microcopy exceeds ten words.`);
			}
			if (
				hasUnexplainedShorthand(
					`${step.heading} ${step.microcopy} ${step.visual} ${step.distinctVisualAnchor} ${step.textHiddenMeaning}`
				)
			) {
				issues.push(`${candidate.id}: panel ${index + 1} contains unexplained shorthand.`);
			}
			if (!String(step.distinctVisualAnchor ?? '').trim()) {
				issues.push(`${candidate.id}: panel ${index + 1} needs a distinct visual anchor.`);
			}
			if (!String(step.textHiddenMeaning ?? '').trim()) {
				issues.push(`${candidate.id}: panel ${index + 1} needs a text-hidden meaning.`);
			}
		}
		const visualAnchors = visualSteps.map((step) =>
			normalizeVisualAnchor(step.distinctVisualAnchor)
		);
		if (
			visualAnchors.some((anchor) => !anchor) ||
			new Set(visualAnchors).size !== visualAnchors.length
		) {
			issues.push(`${candidate.id}: every panel must use a unique dominant visual anchor.`);
		}
		const expectedStepIds = candidate.steps.map((step) => step.id);
		const flattenedStepIds = visualSteps.flatMap((step) => step.sourceStepIds ?? []);
		if (JSON.stringify(flattenedStepIds) !== JSON.stringify(expectedStepIds)) {
			issues.push(
				`${candidate.id}: visual panels do not cover source steps exactly once in order.`
			);
		}
		if (candidate.steps.length === 5) {
			const merged = visualSteps.filter((step) => (step.sourceStepIds ?? []).length === 2);
			if (visualSteps.length !== 4 || merged.length !== 1) {
				issues.push(`${candidate.id}: five source steps require one adjacent lossless merge.`);
			}
		} else if (visualSteps.length !== candidate.steps.length) {
			issues.push(`${candidate.id}: chains with at most four steps must map one-to-one.`);
		}
		const evidenceRows = decision.evidenceByQuestion ?? [];
		if (
			JSON.stringify(evidenceRows.map((row) => row.questionId).sort()) !==
			JSON.stringify([...memberIds].sort())
		) {
			issues.push(`${candidate.id}: evidence map must cover every question exactly once.`);
		}
		for (const evidenceRow of evidenceRows) {
			const member = candidate.members.find(
				(candidateMember) => candidateMember.questionId === evidenceRow.questionId
			);
			if (!member) continue;
			const mappings = evidenceRow.mappings ?? [];
			if (
				JSON.stringify(mappings.map((mapping) => mapping.sourceStepId).sort()) !==
				JSON.stringify([...expectedStepIds].sort())
			) {
				issues.push(`${candidate.id}/${member.questionId}: map every source step exactly once.`);
			}
			const markIds = new Set(member.markSchemeItems.map((item) => item.id));
			for (const mapping of mappings) {
				if (!String(mapping.excerpt ?? '').trim()) {
					issues.push(`${candidate.id}/${member.questionId}: evidence excerpt is missing.`);
				}
				if (mapping.supportType === 'mark_scored') {
					if (!(mapping.markSchemeItemIds ?? []).length) {
						issues.push(`${candidate.id}/${member.questionId}: mark-scored evidence has no IDs.`);
					}
					const citedRows = [];
					for (const markId of mapping.markSchemeItemIds ?? []) {
						const cited = member.markSchemeItems.find((item) => item.id === markId);
						if (!markIds.has(markId) || !cited) {
							issues.push(`${candidate.id}/${member.questionId}: unknown mark row ${markId}.`);
							continue;
						}
						if (
							Number(cited.marks ?? 0) <= 0 ||
							Number(cited.confidence ?? 0) < 0.8 ||
							/^level(?:[_ -]?descriptor|[_ -]?guidance)?$/i.test(String(cited.itemType ?? ''))
						) {
							issues.push(
								`${candidate.id}/${member.questionId}: cited mark row ${markId} is not clean positive evidence.`
							);
						}
						citedRows.push(cited);
					}
					if (
						citedRows.length &&
						!normalizedIncludes(citedRows.map((row) => row.text).join(' '), mapping.excerpt)
					) {
						issues.push(
							`${candidate.id}/${member.questionId}: mark excerpt is not verbatim in the cited rows.`
						);
					}
				} else if (mapping.supportType === 'prompt_given') {
					const prompt = `${member.promptText ?? ''} ${member.selfContainedPromptText ?? ''}`;
					if (!normalizedIncludes(prompt, mapping.excerpt)) {
						issues.push(
							`${candidate.id}/${member.questionId}: prompt excerpt is not verbatim evidence.`
						);
					}
				}
			}
		}
		for (const [sourceStepIndex, sourceStep] of candidate.steps.entries()) {
			if (sourceStep.stepRole === 'given') continue;
			const scoredPapers = new Set();
			const promptGivenPapers = new Set();
			const supportedPapers = new Set();
			for (const evidenceRow of evidenceRows) {
				const mapping = (evidenceRow.mappings ?? []).find(
					(item) => item.sourceStepId === sourceStep.id
				);
				const member = candidate.members.find((item) => item.questionId === evidenceRow.questionId);
				if (!member || !mapping) continue;
				supportedPapers.add(member.sourceDocumentId);
				if (mapping.supportType === 'mark_scored') scoredPapers.add(member.sourceDocumentId);
				if (mapping.supportType === 'prompt_given') {
					promptGivenPapers.add(member.sourceDocumentId);
				}
			}
			const isFinalEndpoint =
				sourceStepIndex === candidate.steps.length - 1 &&
				/^(?:effect|conclusion|outcome|result)$/i.test(String(sourceStep.stepRole ?? ''));
			const endpointIsFullySupported =
				isFinalEndpoint &&
				promptGivenPapers.size > 0 &&
				supportedPapers.size ===
					new Set(candidate.members.map((member) => member.sourceDocumentId)).size;
			if (scoredPapers.size < 2 && !endpointIsFullySupported) {
				issues.push(`${candidate.id}: step ${sourceStep.id} is not mark-scored in two papers.`);
			}
		}
	}
	return { status: issues.length ? 'failed' : 'passed', issues };
}

/**
 * Prove that the semantic plan has reached one terminal, publication-safe state before any
 * external write begins. Rejected decisions need an explicit rejected job; every accepted
 * decision needs exactly one ready job and exactly one matching publish item. Failed, missing,
 * duplicate or already-published jobs make the whole release ineligible for publication.
 *
 * @param {{
 *   decisions: Array<{chainId?: string, verdict?: string}>,
 *   jobs: Array<{chainId?: string, status?: string}>,
 *   prepared: Array<{chainId?: string, item?: {id?: string, answerChainId?: string}}>
 * }} input
 */
export function validatePreparedIllustrationRelease({ decisions, jobs, prepared }) {
	if (!Array.isArray(decisions) || !Array.isArray(jobs) || !Array.isArray(prepared)) {
		throw new Error('Prepared illustration release inputs must be arrays.');
	}
	const decisionIds = decisions.map((decision) => String(decision?.chainId ?? ''));
	const jobIds = jobs.map((job) => String(job?.chainId ?? ''));
	const preparedIds = prepared.map((entry) => String(entry?.chainId ?? ''));
	if (
		decisionIds.some((id) => !id) ||
		new Set(decisionIds).size !== decisionIds.length ||
		jobs.length !== decisions.length ||
		jobIds.some((id) => !id) ||
		new Set(jobIds).size !== jobIds.length ||
		preparedIds.some((id) => !id) ||
		new Set(preparedIds).size !== preparedIds.length
	) {
		throw new Error(
			'Prepared illustration release identities are missing, duplicated or incomplete.'
		);
	}
	const jobByChainId = new Map(jobs.map((job) => [job.chainId, job]));
	const preparedByChainId = new Map(prepared.map((entry) => [entry.chainId, entry]));
	const items = [];
	for (const decision of decisions) {
		const job = jobByChainId.get(decision.chainId);
		const entry = preparedByChainId.get(decision.chainId);
		if (decision.verdict === 'reject') {
			if (job?.status !== 'rejected-by-semantic-gate' || entry) {
				throw new Error(
					`${decision.chainId} does not have the exact terminal semantic-rejection state.`
				);
			}
			continue;
		}
		if (
			decision.verdict !== 'accept' ||
			job?.status !== 'ready' ||
			!entry?.item?.id ||
			entry.item.answerChainId !== decision.chainId
		) {
			throw new Error(`${decision.chainId} is not ready for fail-closed batch publication.`);
		}
		items.push(entry.item);
	}
	if (prepared.length !== items.length) {
		throw new Error('Prepared illustration release contains an item outside the accepted plan.');
	}
	const itemIds = items.map((item) => item.id);
	if (new Set(itemIds).size !== itemIds.length) {
		throw new Error('Prepared illustration release contains duplicate illustration ids.');
	}
	return items;
}

/** @param {ChainIllustrationCandidate} candidate */
export function styleProfileFor(candidate) {
	const subject = String(candidate.subjectArea ?? '').toLowerCase();
	const context =
		`${candidate.title ?? ''} ${candidate.broadTopic ?? ''} ${candidate.summary ?? ''}`.toLowerCase();
	if (subject.includes('biology')) {
		if (/cell|microscop|mitosis|meiosis|chromosom|dna|gene|antibod|antigen/.test(context))
			return STYLE_ROUTES.biology.cellular;
		if (/ecosystem|food chain|population|biodiversity|habitat|community/.test(context))
			return STYLE_ROUTES.biology.ecology;
		if (/practical|test|sample|enzyme|apparatus/.test(context))
			return STYLE_ROUTES.biology.laboratory;
		return STYLE_ROUTES.biology.default;
	}
	if (subject.includes('chemistry')) {
		if (/energy|exo|endo|activation|bond/.test(context)) return STYLE_ROUTES.chemistry.energy;
		if (/crude|ore|rock|earth|resource|fractional/.test(context))
			return STYLE_ROUTES.chemistry.geological;
		if (/apparatus|titration|electrolysis|distill|chromatograph|practical/.test(context))
			return STYLE_ROUTES.chemistry.apparatus;
		return STYLE_ROUTES.chemistry.default;
	}
	if (/electric|current|voltage|potential|resistance|circuit|transformer|grid/.test(context))
		return STYLE_ROUTES.physics.electrical;
	if (/force|motion|momentum|spring|speed|velocity|acceleration|energy to height/.test(context))
		return STYLE_ROUTES.physics.mechanics;
	if (/wave|field|magnet|radiation|signal|light|sound/.test(context))
		return STYLE_ROUTES.physics.waves;
	if (/nuclear|isotope|half-life|activity|count rate|decay/.test(context))
		return STYLE_ROUTES.physics.nuclear;
	if (/measure|zero offset|precision|accuracy|uncertainty/.test(context))
		return STYLE_ROUTES.physics.measurement;
	return STYLE_ROUTES.physics.default;
}

/** @param {ChainIllustrationCandidate} candidate */
export function buildStylePrompt(candidate) {
	return `${styleProfileFor(candidate)}. Deep navy scientific-atlas background with a subtle grid. Restrained cinematic glow, crisp high-end editorial finish, strong depth and material detail. Subject colours should encode meaning consistently. Bold condensed white headings and clean sans-serif microcopy. Beautiful, memorable and serious, never a marketing poster or generic classroom worksheet.`;
}

/** @param {ChainIllustrationCandidate} candidate */
export function buildLightEditStylePrompt(candidate) {
	return `${styleProfileFor(candidate)}, faithfully adapted into a light-mode scientific atlas. Pale warm-white and cool ivory surfaces with a subtle graphite-cyan grid. Deep navy typography, restrained luminous accents, crisp high-end editorial finish, strong depth and material detail. Preserve the dark original's subject colour coding exactly while adjusting contrast for a light background. Beautiful, memorable and serious, never a marketing poster or generic classroom worksheet.`;
}

/**
 * @param {ChainIllustrationCandidate} candidate
 * @param {SemanticDecision} decision
 */
export function buildGenerationPrompt(candidate, decision) {
	const panels = decision.visualSteps
		.map(
			(step) =>
				`${step.order}. HEADING — verbatim: "${step.heading}"\n   MICROCOPY — verbatim: "${step.microcopy}"\n   DISTINCT VISUAL ANCHOR: ${step.distinctVisualAnchor}\n   VISUAL: ${step.visual}\n   MEANING WITH ALL TEXT HIDDEN: ${step.textHiddenMeaning}`
		)
		.join('\n');
	const guards = [
		...new Set(decision.visualSteps.flatMap((step) => step.misconceptionGuards ?? []))
	];
	const contexts = candidate.members
		.map((member) => `${member.sourceQuestionRef}: ${oneLine(member.promptText).slice(0, 180)}`)
		.join('\n- ');
	return `Create a polished 16:9 landscape educational infographic for an iPad GCSE app, generated from scratch. Do not use any previous image or visual reference.

SOURCE OF TRUTH
Approved chain: ${candidate.canonicalChainText}
Depict only the approved causal steps and panel plan below. A small, correct GCSE equation may support an approved link when it genuinely makes that link visible; it must not become an extra step or decorative fact.

If this chain depends on a derived scientific quantity whose name alone may remain opaque, add at most one compact universal concept bridge to familiar quantities in a separate supporting region—for example, "momentum = mass × velocity". If an approved conservation, balance, equality or other governing property deepens the same mechanism, add at most one compact universal law reminder—for example, "total momentum before = total momentum after". Keep both outside the numbered steps, omit either when unnecessary, and never use example values, units or worked substitutions.

TRANSFER GOAL
Make this mechanism reconstructable across the attached exam contexts, without overfitting to one question:
- ${contexts}

The contexts are evidence, not worked examples. Never copy their given values, substitutions, intermediate values, final numerical answers, one-question units or arbitrary example scales into the image. Do not invent example numbers. Use qualitative comparisons or universal symbols instead. The required panel ordinal numbers 1–${decision.visualSteps.length} are the only non-scientific numbers that may appear.

VISUAL-LEARNING OBJECTIVE
Optimise for immediate grasp, memorisation and deeper understanding through complementary visual channels: whole-system context, mechanism-specific close-ups, spatial direction, semantic colour, and visible state change. Run a three-second test: if every word and number were covered, the pictures alone must still let a GCSE learner retell the causal sequence.

The intended learner takeaway is: ${decision.visualWithoutTextSummary}
Build specific cue → concept → relationship associations: each important visual cue must attach to a physical object or state, evoke one relevant concept, and connect that concept to the approved mechanism. A learner should reconstruct one connected explanation, not remember a loose list of objects, labels and formulae.

COMPOSITION
Composition mode: ${decision.compositionMode}
Whole-image mnemonic anchor: ${decision.visualAnchor}
Continuous eye path: ${decision.continuousPath}
What the learner should retell without reading: ${decision.visualWithoutTextSummary}

Build one coherent 16:9 composition with ${decision.visualSteps.length} numbered stages or callouts in an unambiguous 1→${decision.visualSteps.length} path. Establish the shared system or subject once, then reveal a different causal feature at each stage. Do not copy the same complete background, camera view, transformer, body, apparatus or other hero object into several boxes. If an object recurs for continuity, change scale, crop or physical state so the specified mechanism—not repetition—dominates that stage.

Each stage must have a unique visual silhouette and mechanism-specific dominant visual. Prefer physical cutaways, microscopic views, before/after contrasts, visible flow and concrete outcomes. A gauge, dashboard, checkmark or generic success icon may only support a physical explanation; it may never be the main visual evidence. Generous iPad-safe margins. The sequence must remain clear at 1024×576.

Where stages revisit one event, keep colours, directions, identities and qualitative relationships scientifically consistent. Never reset or contradict an earlier state merely to illustrate the next link.

TITLE — verbatim: "${decision.title}"

PANELS — all text verbatim:
${panels}

MISCONCEPTION GUARDS
${guards.length ? guards.map((guard) => `- ${guard}`).join('\n') : '- Do not imply any relationship beyond the approved chain.'}

TYPOGRAPHY
Keep text minimal and horizontal. Render the title, numbers, headings and microcopy exactly as supplied. Use full learner-facing terminology—never invent or shorten wording into unexplained abbreviations. Make every label readable after downscaling to an iPad-width preview.

HARD CONSTRAINTS
Exactly ${decision.visualSteps.length} stages and ordinal panel numbers. No extra stage, fifth step, legend, logo, exam-board branding, watermark, circular arrow, decorative prose, unsupported claim, internally inconsistent repeated state, unexplained shorthand, repeated dominant imagery, text-dependent stage, or scientifically misleading metaphor. This is an in-app explanatory illustration, not a marketing page.`;
}

/**
 * Build the next dark prompt after a dark original fails deterministic or visual QA. The original
 * prompt remains the complete source of truth; this suffix contains only defects observed on the
 * failed attempt and catalogue rules explicitly triggered by the judge.
 *
 * @param {string} basePrompt
 * @param {{judge?: VisualJudge | {glitchFindings?: GlitchFinding[]} | null, hardChecks?: HardImageChecks | null}} [failure]
 */
export function buildFreshDarkRegenerationPrompt(basePrompt, failure = {}) {
	const judge = failure.judge;
	const findings = Array.isArray(judge?.glitchFindings)
		? judge.glitchFindings.filter((finding) =>
				CHAIN_ILLUSTRATION_GLITCH_IDS.includes(finding?.glitchId)
			)
		: [];
	const triggeredIds = [...new Set(findings.map((finding) => finding.glitchId))];
	const exactDefects = uniqueNonEmptyLines([
		...findings.map(
			(finding) =>
				`${finding.themes?.join('+') || 'pair'}${finding.panelOrders?.length ? ` panel ${finding.panelOrders.join(',')}` : ''}: ${finding.defect}`
		),
		...Object.entries(failure.hardChecks ?? {}).flatMap(([theme, check]) =>
			(check?.issues ?? []).map((issue) => `${theme} file check: ${issue}`)
		)
	]);
	const defectLines = exactDefects.length
		? exactDefects.map((defect) => `- ${defect}`).join('\n')
		: '- The dark original failed QA without a usable defect description; make a wholly independent rendering and satisfy every base constraint.';
	const triggeredRules = triggeredIds.length
		? triggeredIds
				.map(
					(glitchId) =>
						`- ${glitchId}: ${CHAIN_ILLUSTRATION_GLITCH_CATALOGUE[glitchId].regenerationRule}`
				)
				.join('\n')
		: '- No catalogue-specific rule was triggered; do not import rules for unrelated failure modes.';

	return `${String(basePrompt ?? '').trim()}

FRESH REGENERATION AFTER QA FAILURE
Generate a brand-new DARK ORIGINAL from scratch. No previous image is supplied. This is never an edit, patch, variation, trace, restyle or reconstruction of the failed image; do not try to preserve its composition.

CORRECT THESE EXACT OBSERVED DEFECTS
${defectLines}

ONLY THE TRIGGERED ADDITIONAL GLITCH RULES
${triggeredRules}

Keep every other approved semantic, visual-learning, wording and transfer constraint from the base prompt unchanged.`;
}

/**
 * @param {ChainIllustrationCandidate} candidate
 * @param {SemanticDecision} decision
 */
export function buildLightEditPrompt(candidate, decision) {
	return `Edit the attached dark-mode answer-chain illustration into its light-mode sibling. This is a strict theme conversion of the supplied image, not a new design and not a fresh generation.

SOURCE OF TRUTH
Approved chain: ${candidate.canonicalChainText}
Required title — verbatim: "${decision.title}"
Required panels — all text verbatim:
${decision.visualSteps.map((step) => `${step.order}. "${step.heading}" / "${step.microcopy}"`).join('\n')}

PRESERVE EXACTLY
- The 16:9 canvas, crop, camera, composition, panel positions, spacing and reading path.
- Every scientific object, its geometry, count, state, direction, relative size and relationship.
- Every arrow, connector, universal equation or symbol, and semantic subject colour.
- The title, panel numbers, headings and microcopy character-for-character, in the same locations.
- The scientific meaning and the same internally consistent event across panels.

CHANGE ONLY THE THEME
- Replace deep navy atlas surfaces with pale warm-white or cool-ivory atlas surfaces and a very subtle graphite-cyan grid.
- Change white typography and dark-mode strokes to deep navy or charcoal for strong accessible contrast.
- Rebalance shadows, highlights and glow so the same illustration remains crisp and luminous on a light surface.
- Keep all meaning-bearing accent colours recognisably the same; adjust luminance only when needed for contrast.

HARD CONSTRAINTS
Do not add or reproduce a question-specific, worked-example or invented numerical value. Preserve only equations, symbols, formula constants and ratios that are already present and valid across every chain member. Do not add, remove, move, crop, reorder, relabel, restage or reinterpret anything else. Do not change wording, line meaning, object identity, qualitative relationship, arrow direction, panel count, ordinal number sequence or scientific claim. No new legend, prose, logo, watermark, border decoration or background object. The result must look like the exact same illustration switched from dark mode to light mode.`;
}

/**
 * @param {string} basePrompt
 * @param {{judge?: {glitchFindings?: GlitchFinding[]} | null, hardChecks?: HardImageChecks | null}} [failure]
 */
export function buildFreshLightEditRetryPrompt(basePrompt, failure = {}) {
	const findings = Array.isArray(failure.judge?.glitchFindings)
		? failure.judge.glitchFindings.filter((finding) =>
				CHAIN_ILLUSTRATION_GLITCH_IDS.includes(finding?.glitchId)
			)
		: [];
	const triggeredIds = [...new Set(findings.map((finding) => finding.glitchId))];
	const exactDefects = uniqueNonEmptyLines([
		...findings.map(
			(finding) =>
				`light${finding.panelOrders?.length ? ` panel ${finding.panelOrders.join(',')}` : ''}: ${finding.defect}`
		),
		...Object.entries(failure.hardChecks ?? {}).flatMap(([theme, check]) =>
			(check?.issues ?? []).map((issue) => `${theme} file check: ${issue}`)
		)
	]);
	return `${String(basePrompt ?? '').trim()}

FRESH LIGHT EDIT AFTER QA FAILURE
Create a new light edit directly from the attached ACCEPTED DARK MASTER. The failed light image is not supplied and must not be imitated, patched, restyled or edited.

CORRECT THESE OBSERVED DEFECTS
${exactDefects.length ? exactDefects.map((defect) => `- ${defect}`).join('\n') : '- No catalogue-specific visual defect was recorded; independently reapply the strict theme-only edit.'}

ONLY THE TRIGGERED ADDITIONAL GLITCH RULES
${triggeredIds.length ? triggeredIds.map((glitchId) => `- ${glitchId}: ${CHAIN_ILLUSTRATION_GLITCH_CATALOGUE[glitchId].regenerationRule}`).join('\n') : '- No catalogue-specific rule was triggered.'}`;
}

/**
 * @param {ChainIllustrationCandidate} candidate
 * @param {SemanticDecision} decision
 * @param {{status?: string, issues?: string[]}} hardCheck
 */
export function darkVisualJudgePrompt(candidate, decision, hardCheck) {
	return `You are the independent visual QA judge for one newly generated DARK ORIGINAL GCSE answer-chain illustration. Inspect the single attached image. It has no reference image and must pass before any light edit is allowed. Return only the requested structured QA data.

GROUND TRUTH CHAIN: ${candidate.canonicalChainText}
REQUIRED TITLE: ${decision.title}
REQUIRED COMPOSITION MODE: ${decision.compositionMode}
WHOLE-IMAGE VISUAL ANCHOR: ${decision.visualAnchor}
REQUIRED CONTINUOUS PATH: ${decision.continuousPath}
THREE-SECOND TEXT-HIDDEN RETELLING: ${decision.visualWithoutTextSummary}
REQUIRED PANELS:
${decision.visualSteps.map((step) => `${step.order}. ${step.heading} / ${step.microcopy} — anchor: ${step.distinctVisualAnchor}; visual: ${step.visual}; without text: ${step.textHiddenMeaning}`).join('\n')}

SOURCE EVIDENCE:
${visualJudgeEvidence(candidate, decision)}

AUTOMATIC DARK FILE CHECK:
${JSON.stringify(hardCheck, null, 2)}

LEARNER RECONSTRUCTION — DO THIS BEFORE SCORING
First infer what a GCSE student would learn from the visible objects, states, directions and changes with all wording conceptually hidden; return that as textHiddenTakeaway. Then read the complete image and return the connected explanation a student would retain as fullImageTakeaway. Do not list visible nouns or copy the captions. Return explicit associativeLinks, each mapping one visible cue → one concept → its relationship to the approved chain. List every plausible wrong lesson in unintendedTakeaways. Set takeawayMatchesGoal true only when the full takeaway specifically matches "${decision.visualWithoutTextSummary}", the associations are visibly supported, and there is no materially misleading alternative.

Audit scientific accuracy, evidence fidelity, exact text, one-way sequence, iPad legibility, text-hidden comprehension, distinct mechanism visuals, internal identity/state/direction consistency, clear terminology, and numeric transferability. If a central derived quantity is still opaque after viewing the mechanism, check whether one compact universal relationship was needed to bridge it to familiar quantities. If a relevant approved conservation, balance or equality property would deepen the same mechanism, check whether a compact universal law reminder is present and connected. Exactly one panelAudit must correspond to every required panel in order. Any visible defect belongs in variant.defects/panelAudits and, when it matches the catalogue below, in one concise structured glitchFindings row.

STRUCTURED GLITCH CATALOGUE
${glitchCatalogueJudgeText()}

The symbol-placement contract is strict: every symbol or current label needs an unambiguous leader or immediate adjacency to the exact physical quantity and location it names. Equations must occupy a visually separate equation region and must not read as labels for a conductor, branch or object.

Score the dark variant: scientificAccuracy 0-4, evidenceFidelity 0-4, textExactness 0-3, sequenceClarity 0-3, ipadLegibility 0-2, mnemonicCoherence 0-2, appStyleFit 0-2. Return all hard booleans, both learner takeaways, associativeLinks, unintendedTakeaways and panelAudits. It passes only at least 18/20, full scientificAccuracy/evidenceFidelity/textExactness, all hard booleans including takeawayMatchesGoal true, at least one specific associative link, no unintended takeaway, every panel understandable without text, no defects, and no glitch finding. Set the top-level pass to the same value as variant.pass.`;
}

export function darkVisualJudgeSchema() {
	const pairSchema = visualJudgeSchema();
	return {
		type: 'object',
		additionalProperties: false,
		required: ['variant', 'glitchFindings', 'pass', 'rationale'],
		properties: {
			variant: variantSchemaForTheme(pairSchema.properties.variants.items, 'dark'),
			glitchFindings: pairSchema.properties.glitchFindings,
			pass: { type: 'boolean' },
			rationale: { type: 'string' }
		}
	};
}

/**
 * @param {unknown} judge
 * @param {{status?: string, issues?: string[]}} hardCheck
 * @param {VisualStep[]} approvedVisualSteps
 */
export function validateDarkVisualJudge(judge, hardCheck, approvedVisualSteps) {
	const record = isPlainRecord(judge) ? judge : {};
	const issues = [];
	if (!isPlainRecord(record.variant) || record.variant.theme !== 'dark') {
		issues.push('Dark judge must return one dark variant.');
		return { status: 'failed', issues };
	}
	const findings = /** @type {GlitchFinding[]} */ (
		Array.isArray(record.glitchFindings) ? record.glitchFindings : []
	);
	for (const finding of findings) {
		if (!Array.isArray(finding?.themes) || finding.themes.some((theme) => theme !== 'dark')) {
			issues.push('Dark judge glitch findings may name only the dark theme.');
		}
	}
	const synthetic = /** @type {VisualJudge} */ ({
		variants: [
			/** @type {VisualJudgeVariant} */ (record.variant),
			perfectJudgeVariant('light', approvedVisualSteps)
		],
		crossThemeConsistency: perfectCrossThemeConsistency(),
		glitchFindings: findings,
		pass: record.pass,
		rationale: record.rationale
	});
	const validation = validateVisualJudge(
		synthetic,
		{ dark: hardCheck, light: { status: 'passed' } },
		approvedVisualSteps
	);
	issues.push(...validation.issues);
	return { status: issues.length ? 'failed' : 'passed', issues };
}

/**
 * @param {ChainIllustrationCandidate} candidate
 * @param {SemanticDecision} decision
 * @param {HardImageChecks} hardChecks
 */
export function lightEditJudgePrompt(candidate, decision, hardChecks) {
	return `You are the independent visual QA judge for a LIGHT EDIT of an already accepted dark GCSE answer-chain illustration. Inspect two attached images in order: ACCEPTED DARK MASTER, then NEW LIGHT EDIT. Treat the dark image as the approved content reference; judge only whether the light edit is correct, legible, and a strict theme-only conversion. Return only the requested structured QA data.

GROUND TRUTH CHAIN: ${candidate.canonicalChainText}
REQUIRED TITLE: ${decision.title}
REQUIRED PANELS:
${decision.visualSteps.map((step) => `${step.order}. ${step.heading} / ${step.microcopy} — ${step.textHiddenMeaning}`).join('\n')}

AUTOMATIC FILE CHECKS:
${JSON.stringify(hardChecks, null, 2)}

The light edit must keep the dark master's exact canvas, crop, panel geometry, objects, counts, states, directions, equations, wording, sequence, and scientific meaning. Only background/surface tone, text contrast, shadows, highlights, and glow may change. Reconstruct what a student learns from the light image in textHiddenTakeaway and fullImageTakeaway, map visible cue → concept → relationship in associativeLinks, list unintendedTakeaways, and compare the result with "${decision.visualWithoutTextSummary}" in takeawayMatchesGoal. Audit the light image at iPad size using the same scientific, evidence, text-hidden, terminology, state-consistency, and numeric-transferability thresholds as the accepted dark. Return one light variant audit and a strict crossThemeConsistency audit.

STRUCTURED GLITCH CATALOGUE
${glitchCatalogueJudgeText()}

Every structured finding must name only the light theme. The symbol-placement contract remains strict and equations stay separate from physical labels. The pair passes only when the light variant meets the 18/20/full-correctness thresholds with all hard booleans true and no defects/findings, and cross-theme preservation is 4/4 with every match boolean true.`;
}

export function lightEditJudgeSchema() {
	const pairSchema = visualJudgeSchema();
	return {
		type: 'object',
		additionalProperties: false,
		required: ['variant', 'crossThemeConsistency', 'glitchFindings', 'pass', 'rationale'],
		properties: {
			variant: variantSchemaForTheme(pairSchema.properties.variants.items, 'light'),
			crossThemeConsistency: pairSchema.properties.crossThemeConsistency,
			glitchFindings: pairSchema.properties.glitchFindings,
			pass: { type: 'boolean' },
			rationale: { type: 'string' }
		}
	};
}

/**
 * @param {unknown} judge
 * @param {HardImageChecks} hardChecks
 * @param {VisualStep[]} approvedVisualSteps
 */
export function validateLightEditJudge(judge, hardChecks, approvedVisualSteps) {
	const record = isPlainRecord(judge) ? judge : {};
	const issues = [];
	if (!isPlainRecord(record.variant) || record.variant.theme !== 'light') {
		issues.push('Light-edit judge must return one light variant.');
		return { status: 'failed', issues };
	}
	const findings = /** @type {GlitchFinding[]} */ (
		Array.isArray(record.glitchFindings) ? record.glitchFindings : []
	);
	for (const finding of findings) {
		if (!Array.isArray(finding?.themes) || finding.themes.some((theme) => theme !== 'light')) {
			issues.push('Light-edit glitch findings may name only the light theme.');
		}
	}
	const synthetic = /** @type {VisualJudge} */ ({
		variants: [
			perfectJudgeVariant('dark', approvedVisualSteps),
			/** @type {VisualJudgeVariant} */ (record.variant)
		],
		crossThemeConsistency: record.crossThemeConsistency,
		glitchFindings: findings,
		pass: record.pass,
		rationale: record.rationale
	});
	const validation = validateVisualJudge(synthetic, hardChecks, approvedVisualSteps);
	issues.push(...validation.issues);
	return { status: issues.length ? 'failed' : 'passed', issues };
}

/**
 * @param {ChainIllustrationCandidate} candidate
 * @param {SemanticDecision} decision
 * @param {HardImageChecks} hardChecks
 */
export function visualJudgePrompt(candidate, decision, hardChecks) {
	return `You are an independent visual QA judge for a GCSE answer-chain illustration pair. Inspect the two attached images in this exact order: first the generated DARK ORIGINAL, then its LIGHT EDIT. They are theme variants of one illustration, not competing candidates. There is no winner: both must pass and the light edit must preserve the dark original's composition and scientific content.

Do not inspect the repository or filesystem, run commands, or use the web. Judge only the attached
images and the complete ground-truth evidence embedded below. Return only the requested structured
QA data.

GROUND TRUTH CHAIN: ${candidate.canonicalChainText}
REQUIRED TITLE: ${decision.title}
REQUIRED COMPOSITION MODE: ${decision.compositionMode}
WHOLE-IMAGE VISUAL ANCHOR: ${decision.visualAnchor}
REQUIRED CONTINUOUS PATH: ${decision.continuousPath}
THREE-SECOND TEXT-HIDDEN RETELLING: ${decision.visualWithoutTextSummary}
REQUIRED PANELS:
${decision.visualSteps.map((step) => `${step.order}. ${step.heading} / ${step.microcopy} — anchor: ${step.distinctVisualAnchor}; visual: ${step.visual}; without text: ${step.textHiddenMeaning}`).join('\n')}

INDEPENDENT SOURCE EVIDENCE:
${JSON.stringify(
	{
		steps: candidate.steps,
		questions: candidate.members.map((member) => ({
			questionId: member.questionId,
			sourceDocumentId: member.sourceDocumentId,
			promptText: member.promptText,
			selfContainedPromptText: member.selfContainedPromptText,
			markSchemeItems: member.markSchemeItems,
			modelAnswers: member.modelAnswers
		})),
		plannerEvidenceMap: decision.evidenceByQuestion
	},
	null,
	2
)}

AUTOMATIC FILE CHECKS:
${JSON.stringify(hardChecks, null, 2)}

LEARNER RECONSTRUCTION — DO THIS BEFORE SCORING EACH THEME
1. Conceptually cover every word and number. State the connected lesson a GCSE student would infer from the visible objects, states, directions and changes as textHiddenTakeaway.
2. Read the complete image. State the specific connected explanation the student would retain as fullImageTakeaway; do not merely list nouns or repeat captions.
3. Return associativeLinks that explicitly map visible cue → concept → relationship to the approved chain. A decorative association or disconnected fact does not count.
4. List every plausible wrong or competing lesson in unintendedTakeaways.
5. Compare the reconstructed lesson with the intended goal, "${decision.visualWithoutTextSummary}". takeawayMatchesGoal is true only when the causal relationship is specific, visibly supported and free of a materially misleading alternative.

Hard requirements for each theme variant:
- scientifically correct against every approved source step and no invented causal claim;
- exactly ${decision.visualSteps.length} numbered panels in the correct one-way order, with no loop;
- title, headings, panel numbers and microcopy rendered correctly enough for a learner to read;
- every approved visual step appears exactly once;
- every repeated object or system keeps the same before-state, after-state, direction, colour coding and quantities across panels that depict the same event;
- the whole illustration passes a three-second, text-hidden comprehension test: the causal order is recoverable from objects, space, colour and physical state changes before reading;
- every stage has a different mechanism-specific dominant visual and silhouette;
- causal changes are physically visible rather than represented only by labels, arrows, gauges, dashboard dials, checkmarks or generic icons;
- the complete system/background is established once rather than decoratively copied into several panels;
- student-facing wording uses full clear terminology with no unexplained shorthand such as "p.d.";
- a central derived quantity is not left as an opaque repeated label when one compact, universally valid relationship is needed to connect it to familiar quantities; that bridge remains outside the numbered causal steps and contains no example values;
- a relevant approved conservation, balance, equality or governing property is connected to the depicted mechanism with one compact universal reminder when that connection materially deepens the lesson;
- the reconstructed learner takeaway is a specific connected explanation that matches the intended goal, at least one cue → concept → relationship association is visibly grounded, and no materially misleading takeaway remains;
- no given, example, substitution, intermediate-result, final-answer, one-question-unit or arbitrary-scale numerical value appears. Panel ordinal numbers are allowed. Equations, symbols, formula constants and ratios are allowed only when they apply unchanged to every attached question;
- the final outcome is concrete whenever the approved mechanism has a visible organism, material, apparatus or consumer outcome;
- readable and unclipped at 1024×576 iPad preview size;
- no logo, watermark, extra legend, fifth step, or misleading metaphor.

For each REQUIRED PANELS visualSteps entry, return exactly one panelAudit at the same array index and copy that entry's exact order value. Name its dominant visual, the visible causal evidence, whether it is understandable with the text covered, and any defects. Mark the variant as failing if panelAudits do not match the complete approved visualSteps sequence exactly once in order.

Hard visual-learning failures regardless of the numeric score:
- the same dominant transformer, body, apparatus, background or camera view appears substantially unchanged in multiple stages;
- only a gauge needle, caption or arrow changes while the physical mechanism remains visually absent;
- a stage requires its microcopy to explain what the picture means;
- an unexplained abbreviation appears in learner-facing text;
- any question-specific or invented example number appears, even if it is scientifically plausible in isolation;
- an abstract efficiency/success meter replaces a concrete available outcome.

Run an explicit cross-panel consistency audit. Compare every repeated object, state, vector, label and qualitative or universal quantitative relationship. Panels are not independent examples unless the approved plan says so. A reset or contradiction between depictions of the same event is a scientific-accuracy and evidence-fidelity failure, even when each isolated panel looks plausible. Compare every displayed number against all source questions: if it is not an ordinal panel number or part of a universal equation, symbol, formula constant or ratio valid for every chain member, noQuestionSpecificValues must be false.

Then run a strict cross-theme consistency audit. The light image must keep the dark original's exact panel geometry, composition, objects, counts, states, arrows, equations, wording, sequence and scientific meaning. Only background/surface tone, text contrast, shadows, highlights and glow may change. A moved object, rewritten label, changed arrow, restaged scene or altered scientific state is a failure even when the light image is attractive.

STRUCTURED GLITCH CATALOGUE
Audit every entry below independently. For every triggered entry, add one concise glitchFindings row using its exact glitchId, all affected themes, the affected panel orders (or an empty array for a whole-image defect), and a concrete description of what is visibly wrong. Do not report an entry that is not visibly triggered.
${Object.entries(CHAIN_ILLUSTRATION_GLITCH_CATALOGUE)
	.map(
		([glitchId, entry]) =>
			`- ${glitchId}: ${entry.judgeRule}\n  Previously observed examples to recognise (judge guidance only): ${entry.observedExamples.join('; ')}.`
	)
	.join('\n')}

The symbol-placement contract is strict: every symbol or current label needs an unambiguous leader or immediate adjacency to the exact physical quantity and location it names. Equations must occupy a visually separate equation region and must not read as labels for a conductor, branch or object.

Score each theme variant: scientificAccuracy 0-4, evidenceFidelity 0-4, textExactness 0-3, sequenceClarity 0-3, ipadLegibility 0-2, mnemonicCoherence 0-2, appStyleFit 0-2. Also return the hard booleans textIndependentMeaning, distinctVisualAnchors, causalChangesVisible, noDominantRepetition, terminologyClear, compositionPlanFollowed, noQuestionSpecificValues and takeawayMatchesGoal, plus both takeaways, associativeLinks and unintendedTakeaways. A variant passes only with at least 18/20, full scores for scientificAccuracy/evidenceFidelity/textExactness, every hard boolean true, at least one specific associative link, no unintended takeaway, every panelAudit understandable without text, and no glitch finding affecting that theme. Score crossThemeConsistency 0-4; the pair passes only at 4/4 with compositionMatch, contentMatch, textMatch and scientificMeaningMatch all true, with both variants passing, and with an empty glitchFindings array. Prefer immediate visual understanding and correctness over spectacle.`;
}

export function visualJudgeSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['variants', 'crossThemeConsistency', 'glitchFindings', 'pass', 'rationale'],
		properties: {
			variants: {
				type: 'array',
				minItems: 2,
				maxItems: 2,
				items: {
					type: 'object',
					additionalProperties: false,
					required: [
						'theme',
						'pass',
						'scientificAccuracy',
						'evidenceFidelity',
						'textExactness',
						'sequenceClarity',
						'ipadLegibility',
						'mnemonicCoherence',
						'appStyleFit',
						'textIndependentMeaning',
						'distinctVisualAnchors',
						'causalChangesVisible',
						'noDominantRepetition',
						'terminologyClear',
						'compositionPlanFollowed',
						'noQuestionSpecificValues',
						'textHiddenTakeaway',
						'fullImageTakeaway',
						'associativeLinks',
						'unintendedTakeaways',
						'takeawayMatchesGoal',
						'panelAudits',
						'total',
						'defects'
					],
					properties: {
						theme: { type: 'string', enum: ['dark', 'light'] },
						pass: { type: 'boolean' },
						scientificAccuracy: { type: 'integer', minimum: 0, maximum: 4 },
						evidenceFidelity: { type: 'integer', minimum: 0, maximum: 4 },
						textExactness: { type: 'integer', minimum: 0, maximum: 3 },
						sequenceClarity: { type: 'integer', minimum: 0, maximum: 3 },
						ipadLegibility: { type: 'integer', minimum: 0, maximum: 2 },
						mnemonicCoherence: { type: 'integer', minimum: 0, maximum: 2 },
						appStyleFit: { type: 'integer', minimum: 0, maximum: 2 },
						textIndependentMeaning: { type: 'boolean' },
						distinctVisualAnchors: { type: 'boolean' },
						causalChangesVisible: { type: 'boolean' },
						noDominantRepetition: { type: 'boolean' },
						terminologyClear: { type: 'boolean' },
						compositionPlanFollowed: { type: 'boolean' },
						noQuestionSpecificValues: { type: 'boolean' },
						textHiddenTakeaway: { type: 'string' },
						fullImageTakeaway: { type: 'string' },
						associativeLinks: {
							type: 'array',
							minItems: 1,
							maxItems: 6,
							items: {
								type: 'object',
								additionalProperties: false,
								required: ['visualCue', 'concept', 'relationship'],
								properties: {
									visualCue: { type: 'string' },
									concept: { type: 'string' },
									relationship: { type: 'string' }
								}
							}
						},
						unintendedTakeaways: { type: 'array', items: { type: 'string' } },
						takeawayMatchesGoal: { type: 'boolean' },
						panelAudits: {
							type: 'array',
							items: {
								type: 'object',
								additionalProperties: false,
								required: [
									'order',
									'dominantVisual',
									'visibleCausalEvidence',
									'understandableWithoutText',
									'defects'
								],
								properties: {
									order: { type: 'integer' },
									dominantVisual: { type: 'string' },
									visibleCausalEvidence: { type: 'string' },
									understandableWithoutText: { type: 'boolean' },
									defects: { type: 'array', items: { type: 'string' } }
								}
							}
						},
						total: { type: 'integer', minimum: 0, maximum: 20 },
						defects: { type: 'array', items: { type: 'string' } }
					}
				}
			},
			crossThemeConsistency: {
				type: 'object',
				additionalProperties: false,
				required: [
					'compositionMatch',
					'contentMatch',
					'textMatch',
					'scientificMeaningMatch',
					'score',
					'defects'
				],
				properties: {
					compositionMatch: { type: 'boolean' },
					contentMatch: { type: 'boolean' },
					textMatch: { type: 'boolean' },
					scientificMeaningMatch: { type: 'boolean' },
					score: { type: 'integer', minimum: 0, maximum: 4 },
					defects: { type: 'array', items: { type: 'string' } }
				}
			},
			glitchFindings: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['glitchId', 'themes', 'panelOrders', 'defect'],
					properties: {
						glitchId: { type: 'string', enum: [...CHAIN_ILLUSTRATION_GLITCH_IDS] },
						themes: {
							type: 'array',
							minItems: 1,
							maxItems: 2,
							items: { type: 'string', enum: ['dark', 'light'] }
						},
						panelOrders: { type: 'array', items: { type: 'integer' } },
						defect: { type: 'string' }
					}
				}
			},
			pass: { type: 'boolean' },
			rationale: { type: 'string' }
		}
	};
}

/**
 * @param {VisualJudge} judge
 * @param {HardImageChecks} hardChecks
 * @param {VisualStep[]} approvedVisualSteps
 */
export function validateVisualJudge(judge, hardChecks, approvedVisualSteps) {
	const issues = [];
	const expectedAuditOrders = Array.isArray(approvedVisualSteps)
		? approvedVisualSteps.map((step) => step.order)
		: [];
	const expectedAuditOrderSet = new Set(expectedAuditOrders);
	const glitchFindings = Array.isArray(judge?.glitchFindings) ? judge.glitchFindings : [];
	if (!Array.isArray(judge?.glitchFindings)) {
		issues.push('Judge must return a glitchFindings array.');
	}
	for (const [index, finding] of glitchFindings.entries()) {
		const prefix = `glitchFindings[${index}]`;
		if (!CHAIN_ILLUSTRATION_GLITCH_IDS.includes(finding?.glitchId)) {
			issues.push(`${prefix}: unknown glitchId ${String(finding?.glitchId ?? '')}.`);
		}
		const themes = Array.isArray(finding?.themes) ? finding.themes : [];
		if (
			themes.length < 1 ||
			themes.length > 2 ||
			new Set(themes).size !== themes.length ||
			themes.some((theme) => theme !== 'dark' && theme !== 'light')
		) {
			issues.push(`${prefix}: themes must name dark and/or light exactly once.`);
		}
		const panelOrders = Array.isArray(finding?.panelOrders) ? finding.panelOrders : [];
		if (
			new Set(panelOrders).size !== panelOrders.length ||
			panelOrders.some((order) => !Number.isInteger(order) || !expectedAuditOrderSet.has(order))
		) {
			issues.push(`${prefix}: panelOrders must contain only approved panel orders.`);
		}
		if (!String(finding?.defect ?? '').trim()) {
			issues.push(`${prefix}: defect must describe the visible failure.`);
		}
	}
	const approvedAuditContractValid =
		expectedAuditOrders.length >= 2 &&
		expectedAuditOrders.length <= 4 &&
		expectedAuditOrders.every((order) => Number.isInteger(order)) &&
		new Set(expectedAuditOrders).size === expectedAuditOrders.length;
	if (!approvedAuditContractValid) {
		issues.push('Validator requires the complete approved visual-step sequence.');
	}
	const rows = Array.isArray(judge?.variants) ? judge.variants : [];
	if (
		rows.length !== 2 ||
		new Set(rows.map((row) => row.theme)).size !== 2 ||
		!rows.some((row) => row.theme === 'dark') ||
		!rows.some((row) => row.theme === 'light')
	) {
		issues.push('Judge must return exactly the dark and light variants.');
	}
	for (const row of rows) {
		const themeFindings = glitchFindings.filter((finding) => finding?.themes?.includes(row.theme));
		const hardBooleanFields = /** @type {const} */ ([
			'textIndependentMeaning',
			'distinctVisualAnchors',
			'causalChangesVisible',
			'noDominantRepetition',
			'terminologyClear',
			'compositionPlanFollowed',
			'noQuestionSpecificValues',
			'takeawayMatchesGoal'
		]);
		for (const field of hardBooleanFields) {
			if (typeof row[field] !== 'boolean') {
				issues.push(`${row.theme}: ${field} must be a boolean.`);
			}
		}
		const expectedTotal =
			row.scientificAccuracy +
			row.evidenceFidelity +
			row.textExactness +
			row.sequenceClarity +
			row.ipadLegibility +
			row.mnemonicCoherence +
			row.appStyleFit;
		if (row.total !== expectedTotal)
			issues.push(`${row.theme}: total does not match score fields.`);
		const panelAudits = Array.isArray(row.panelAudits) ? row.panelAudits : [];
		const panelAuditAnchors = panelAudits.map((panel) =>
			normalizeVisualAnchor(panel.dominantVisual)
		);
		const panelAuditOrders = panelAudits.map((panel) => panel.order);
		const panelAuditsMatchApprovedSteps =
			approvedAuditContractValid &&
			panelAudits.length === approvedVisualSteps.length &&
			panelAuditOrders.every((order, index) => order === expectedAuditOrders[index]);
		const panelAuditStructurallyComplete =
			panelAuditsMatchApprovedSteps &&
			panelAudits.every(
				(panel) =>
					Boolean(String(panel.dominantVisual ?? '').trim()) &&
					Boolean(String(panel.visibleCausalEvidence ?? '').trim()) &&
					typeof panel.understandableWithoutText === 'boolean' &&
					Array.isArray(panel.defects)
			);
		if (!panelAuditStructurallyComplete) {
			issues.push(
				`${row.theme}: panel audits must match every approved visual step exactly once in order (${expectedAuditOrders.join(', ')}).`
			);
		}
		const panelAuditAnchorsDistinct = Boolean(
			panelAuditAnchors.length &&
			!panelAuditAnchors.some((anchor) => !anchor) &&
			new Set(panelAuditAnchors).size === panelAuditAnchors.length
		);
		if (
			!panelAuditAnchorsDistinct &&
			(row.distinctVisualAnchors === true || row.noDominantRepetition === true)
		) {
			issues.push(`${row.theme}: dominant-visual booleans contradict the panel audits.`);
		}
		const auditTerminologyClear = !hasUnexplainedShorthand(
			[
				...(Array.isArray(row.defects) ? row.defects : []),
				...panelAudits.flatMap((panel) => [
					panel.dominantVisual,
					panel.visibleCausalEvidence,
					...(Array.isArray(panel.defects) ? panel.defects : [])
				])
			].join(' ')
		);
		if (!auditTerminologyClear && row.terminologyClear === true) {
			issues.push(`${row.theme}: terminology boolean contradicts the visual audit.`);
		}
		const associativeLinks = Array.isArray(row.associativeLinks) ? row.associativeLinks : [];
		const learningAuditComplete = Boolean(
			String(row.textHiddenTakeaway ?? '').trim() &&
			String(row.fullImageTakeaway ?? '').trim() &&
			associativeLinks.length >= 1 &&
			associativeLinks.length <= 6 &&
			associativeLinks.every(
				(link) =>
					String(link?.visualCue ?? '').trim() &&
					String(link?.concept ?? '').trim() &&
					String(link?.relationship ?? '').trim()
			) &&
			Array.isArray(row.unintendedTakeaways)
		);
		if (!learningAuditComplete) {
			issues.push(
				`${row.theme}: learner reconstruction requires two takeaways, 1–6 complete associative links and an unintendedTakeaways array.`
			);
		}
		const panelAuditPass =
			panelAuditStructurallyComplete &&
			panelAudits.every(
				(panel) => panel.understandableWithoutText === true && panel.defects.length === 0
			);
		const visualLearningPass = Boolean(
			row.textIndependentMeaning &&
			row.distinctVisualAnchors &&
			row.causalChangesVisible &&
			row.noDominantRepetition &&
			row.terminologyClear &&
			row.compositionPlanFollowed &&
			row.noQuestionSpecificValues &&
			row.takeawayMatchesGoal &&
			learningAuditComplete &&
			row.unintendedTakeaways.length === 0 &&
			panelAuditAnchorsDistinct &&
			auditTerminologyClear &&
			panelAuditPass
		);
		const hardPass = hardChecks[row.theme]?.status === 'passed';
		const eligible =
			hardPass &&
			visualLearningPass &&
			themeFindings.length === 0 &&
			Array.isArray(row.defects) &&
			row.defects.length === 0 &&
			row.total >= 18 &&
			row.scientificAccuracy === 4 &&
			row.evidenceFidelity === 4 &&
			row.textExactness === 3;
		if (row.pass !== eligible)
			issues.push(`${row.theme}: pass does not follow the hard threshold.`);
		if (
			row.noQuestionSpecificValues === false &&
			!themeFindings.some((finding) => finding.glitchId === 'question_specific_numbers')
		) {
			issues.push(
				`${row.theme}: question_specific_numbers finding is required when numeric transferability fails.`
			);
		}
	}
	if (
		rows.length === 2 &&
		(rows[0].panelAudits?.length ?? -1) !== (rows[1].panelAudits?.length ?? -1)
	) {
		issues.push('Dark and light audits must cover the same number of stages.');
	}
	const crossTheme = judge?.crossThemeConsistency;
	if (
		!crossTheme ||
		typeof crossTheme.compositionMatch !== 'boolean' ||
		typeof crossTheme.contentMatch !== 'boolean' ||
		typeof crossTheme.textMatch !== 'boolean' ||
		typeof crossTheme.scientificMeaningMatch !== 'boolean' ||
		!Number.isInteger(crossTheme.score) ||
		crossTheme.score < 0 ||
		crossTheme.score > 4 ||
		!Array.isArray(crossTheme.defects)
	) {
		issues.push('Judge must return a complete cross-theme consistency audit.');
	}
	const crossThemePass = Boolean(
		crossTheme?.compositionMatch &&
		crossTheme?.contentMatch &&
		crossTheme?.textMatch &&
		crossTheme?.scientificMeaningMatch &&
		crossTheme?.score === 4 &&
		crossTheme?.defects?.length === 0
	);
	const expectedPass =
		rows.length === 2 &&
		rows.every((row) => row.pass === true) &&
		crossThemePass &&
		glitchFindings.length === 0;
	if (judge?.pass !== expectedPass) {
		issues.push('Pair pass does not follow the variant and cross-theme thresholds.');
	}
	return { status: issues.length ? 'failed' : 'passed', issues };
}

/** @param {unknown} value */
export function slugify(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 96);
}

/** @param {string} value */
export function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

/** @param {unknown} value */
export function stableStringify(value) {
	return /** @type {string} */ (JSON.stringify(sortValue(value)));
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function sortValue(value) {
	if (Array.isArray(value)) return value.map(sortValue);
	if (!value || typeof value !== 'object') return value;
	const record = /** @type {Record<string, unknown>} */ (value);
	return Object.fromEntries(
		Object.keys(record)
			.sort()
			.map((key) => [key, sortValue(record[key])])
	);
}

/**
 * @param {unknown} haystack
 * @param {unknown} needle
 */
function normalizedIncludes(haystack, needle) {
	/** @param {unknown} value */
	const normalize = (value) =>
		String(value ?? '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();
	const target = normalize(needle);
	return target.length > 0 && normalize(haystack).includes(target);
}

/** @param {unknown} value */
function wordCount(value) {
	return String(value ?? '').match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
}

/** @param {unknown} value */
function oneLine(value) {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** @param {unknown} value */
function hasUnexplainedShorthand(value) {
	return /\bp\s*\.\s*d\s*\.?(?=$|[^a-z0-9])/i.test(String(value ?? ''));
}

/** @param {unknown} value */
function normalizeVisualAnchor(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** @param {unknown[]} values */
function uniqueNonEmptyLines(values) {
	const seen = new Set();
	const lines = [];
	for (const value of values) {
		const line = oneLine(value);
		if (!line) continue;
		const key = line.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		lines.push(line);
	}
	return lines;
}

/** @param {ChainIllustrationCandidate} candidate @param {SemanticDecision} decision */
function visualJudgeEvidence(candidate, decision) {
	return JSON.stringify(
		{
			steps: candidate.steps,
			questions: candidate.members.map((member) => ({
				questionId: member.questionId,
				sourceDocumentId: member.sourceDocumentId,
				promptText: member.promptText,
				selfContainedPromptText: member.selfContainedPromptText,
				markSchemeItems: member.markSchemeItems,
				modelAnswers: member.modelAnswers
			})),
			plannerEvidenceMap: decision.evidenceByQuestion
		},
		null,
		2
	);
}

function glitchCatalogueJudgeText() {
	return Object.entries(CHAIN_ILLUSTRATION_GLITCH_CATALOGUE)
		.map(
			([glitchId, entry]) =>
				`- ${glitchId}: ${entry.judgeRule}\n  Previously observed examples to recognise (judge guidance only): ${entry.observedExamples.join('; ')}.`
		)
		.join('\n');
}

/** @param {any} schema @param {'dark' | 'light'} theme */
function variantSchemaForTheme(schema, theme) {
	return {
		...schema,
		properties: {
			...schema.properties,
			theme: { type: 'string', enum: [theme] }
		}
	};
}

/** @param {'dark' | 'light'} theme @param {VisualStep[]} steps */
function perfectJudgeVariant(theme, steps) {
	return {
		theme,
		pass: true,
		scientificAccuracy: 4,
		evidenceFidelity: 4,
		textExactness: 3,
		sequenceClarity: 3,
		ipadLegibility: 2,
		mnemonicCoherence: 2,
		appStyleFit: 2,
		textIndependentMeaning: true,
		distinctVisualAnchors: true,
		causalChangesVisible: true,
		noDominantRepetition: true,
		terminologyClear: true,
		compositionPlanFollowed: true,
		noQuestionSpecificValues: true,
		textHiddenTakeaway: 'The visible mechanism forms one connected causal sequence.',
		fullImageTakeaway: 'The approved reasoning chain explains the visible mechanism.',
		associativeLinks: [
			{
				visualCue: steps[0]?.distinctVisualAnchor ?? 'Visible mechanism',
				concept: steps[0]?.heading ?? 'First causal concept',
				relationship: steps.map((step) => step.heading).join(' → ')
			}
		],
		unintendedTakeaways: [],
		takeawayMatchesGoal: true,
		panelAudits: steps.map((step) => ({
			order: step.order,
			dominantVisual: step.distinctVisualAnchor,
			visibleCausalEvidence: step.textHiddenMeaning,
			understandableWithoutText: true,
			defects: []
		})),
		total: 20,
		defects: []
	};
}

function perfectCrossThemeConsistency() {
	return {
		compositionMatch: true,
		contentMatch: true,
		textMatch: true,
		scientificMeaningMatch: true,
		score: 4,
		defects: []
	};
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isPlainRecord(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
