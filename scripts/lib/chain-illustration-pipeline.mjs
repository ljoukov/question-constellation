import { createHash } from 'node:crypto';

export const CHAIN_ILLUSTRATION_SCHEMA_VERSION = 'chain-illustration-job/v2';
export const CHAIN_ILLUSTRATION_STYLE_KEY = 'luminous-scientific-atlas-v2';

/**
 * @typedef {object} ChainStep
 * @property {string} id
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
 * @property {string} questionId
 * @property {string} sourceDocumentId
 * @property {string} sourceQuestionRef
 * @property {string} promptText
 * @property {string | null | undefined} [selfContainedPromptText]
 * @property {number} marks
 * @property {number} fitConfidence
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
/** @typedef {Record<string, { status?: string } | undefined>} HardImageChecks */

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
 * @property {{order: number, dominantVisual: string, visibleCausalEvidence: string, understandableWithoutText: boolean, defects: string[]}[]} panelAudits
 * @property {number} total
 * @property {string[]} defects
 */

/**
 * @typedef {object} VisualJudge
 * @property {VisualJudgeVariant[]} [variants]
 * @property {{compositionMatch: boolean, contentMatch: boolean, textMatch: boolean, scientificMeaningMatch: boolean, score: number, defects: string[]}} crossThemeConsistency
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
			displayOrder: step.displayOrder,
			stepText: step.stepText,
			stepRole: step.stepRole,
			explanation: step.explanation,
			commonOmission: step.commonOmission
		})),
		members: candidate.members.map((member) => ({
			questionId: member.questionId,
			sourceDocumentId: member.sourceDocumentId,
			promptText: member.promptText,
			selfContainedPromptText: member.selfContainedPromptText,
			marks: member.marks,
			fitConfidence: member.fitConfidence,
			markSchemeItems: member.markSchemeItems.map((item) => ({
				id: item.id,
				displayOrder: item.displayOrder,
				itemType: item.itemType,
				text: item.text,
				marks: item.marks
			})),
			checklistItems: member.checklistItems.map((item) => ({
				id: item.id,
				displayOrder: item.displayOrder,
				text: item.text,
				markSchemeItemIds: item.markSchemeItemIds
			})),
			modelAnswers: member.modelAnswers.map((answer) => ({
				id: answer.id,
				answerText: answer.answerText,
				derivation: answer.derivation,
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

TRANSFER GOAL
Make this mechanism reconstructable across the attached exam contexts, without overfitting to one question:
- ${contexts}

VISUAL-LEARNING OBJECTIVE
Optimise for immediate grasp, memorisation and deeper understanding through complementary visual channels: whole-system context, mechanism-specific close-ups, spatial direction, semantic colour, and visible state change. Run a three-second test: if every word and number were covered, the pictures alone must still let a GCSE learner retell the causal sequence.

COMPOSITION
Composition mode: ${decision.compositionMode}
Whole-image mnemonic anchor: ${decision.visualAnchor}
Continuous eye path: ${decision.continuousPath}
What the learner should retell without reading: ${decision.visualWithoutTextSummary}

Build one coherent 16:9 composition with ${decision.visualSteps.length} numbered stages or callouts in an unambiguous 1→${decision.visualSteps.length} path. Establish the shared system or subject once, then reveal a different causal feature at each stage. Do not copy the same complete background, camera view, transformer, body, apparatus or other hero object into several boxes. If an object recurs for continuity, change scale, crop or physical state so the specified mechanism—not repetition—dominates that stage.

Each stage must have a unique visual silhouette and mechanism-specific dominant visual. Prefer physical cutaways, microscopic views, before/after contrasts, visible flow and concrete outcomes. A gauge, dashboard, checkmark or generic success icon may only support a physical explanation; it may never be the main visual evidence. Generous iPad-safe margins. The sequence must remain clear at 1024×576.

Where stages revisit one event, keep colours, directions, identities and quantities scientifically consistent. Never reset or contradict an earlier state merely to illustrate the next link.

TITLE — verbatim: "${decision.title}"

PANELS — all text verbatim:
${panels}

MISCONCEPTION GUARDS
${guards.length ? guards.map((guard) => `- ${guard}`).join('\n') : '- Do not imply any relationship beyond the approved chain.'}

TYPOGRAPHY
Keep text minimal and horizontal. Render the title, numbers, headings and microcopy exactly as supplied. Use full learner-facing terminology—never invent or shorten wording into unexplained abbreviations. Make every label readable after downscaling to an iPad-width preview.

HARD CONSTRAINTS
Exactly ${decision.visualSteps.length} stages and numbers. No extra stage, fifth step, legend, logo, exam-board branding, watermark, circular arrow, decorative prose, unsupported claim, internally inconsistent repeated state, unexplained shorthand, repeated dominant imagery, text-dependent stage, or scientifically misleading metaphor. This is an in-app explanatory illustration, not a marketing page.`;
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
- Every arrow, connector, equation and semantic subject colour.
- The title, panel numbers, headings and microcopy character-for-character, in the same locations.
- The scientific meaning and the same internally consistent event across panels.

CHANGE ONLY THE THEME
- Replace deep navy atlas surfaces with pale warm-white or cool-ivory atlas surfaces and a very subtle graphite-cyan grid.
- Change white typography and dark-mode strokes to deep navy or charcoal for strong accessible contrast.
- Rebalance shadows, highlights and glow so the same illustration remains crisp and luminous on a light surface.
- Keep all meaning-bearing accent colours recognisably the same; adjust luminance only when needed for contrast.

HARD CONSTRAINTS
Do not add, remove, move, crop, reorder, relabel, restage or reinterpret anything. Do not change wording, line meaning, object identity, quantities, arrow direction, panel count, number sequence or scientific claim. No new legend, prose, logo, watermark, border decoration or background object. The result must look like the exact same illustration switched from dark mode to light mode.`;
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
- the final outcome is concrete whenever the approved mechanism has a visible organism, material, apparatus or consumer outcome;
- readable and unclipped at 1024×576 iPad preview size;
- no logo, watermark, extra legend, fifth step, or misleading metaphor.

For each REQUIRED PANELS visualSteps entry, return exactly one panelAudit at the same array index and copy that entry's exact order value. Name its dominant visual, the visible causal evidence, whether it is understandable with the text covered, and any defects. Mark the variant as failing if panelAudits do not match the complete approved visualSteps sequence exactly once in order.

Hard visual-learning failures regardless of the numeric score:
- the same dominant transformer, body, apparatus, background or camera view appears substantially unchanged in multiple stages;
- only a gauge needle, caption or arrow changes while the physical mechanism remains visually absent;
- a stage requires its microcopy to explain what the picture means;
- an unexplained abbreviation appears in learner-facing text;
- an abstract efficiency/success meter replaces a concrete available outcome.

Run an explicit cross-panel consistency audit. Compare every repeated object, state, vector, label and quantity. Panels are not independent examples unless the approved plan says so. A reset or contradiction between depictions of the same event is a scientific-accuracy and evidence-fidelity failure, even when each isolated panel looks plausible.

Then run a strict cross-theme consistency audit. The light image must keep the dark original's exact panel geometry, composition, objects, counts, states, arrows, equations, wording, sequence and scientific meaning. Only background/surface tone, text contrast, shadows, highlights and glow may change. A moved object, rewritten label, changed arrow, restaged scene or altered scientific state is a failure even when the light image is attractive.

Score each theme variant: scientificAccuracy 0-4, evidenceFidelity 0-4, textExactness 0-3, sequenceClarity 0-3, ipadLegibility 0-2, mnemonicCoherence 0-2, appStyleFit 0-2. Also return the hard booleans textIndependentMeaning, distinctVisualAnchors, causalChangesVisible, noDominantRepetition, terminologyClear and compositionPlanFollowed. A variant passes only with at least 18/20, full scores for scientificAccuracy/evidenceFidelity/textExactness, all six hard booleans true, and every panelAudit understandable without text. Score crossThemeConsistency 0-4; the pair passes only at 4/4 with compositionMatch, contentMatch, textMatch and scientificMeaningMatch all true, and with both variants passing. Prefer immediate visual understanding and correctness over spectacle.`;
}

export function visualJudgeSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['variants', 'crossThemeConsistency', 'pass', 'rationale'],
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
			panelAuditAnchorsDistinct &&
			auditTerminologyClear &&
			panelAuditPass
		);
		const hardPass = hardChecks[row.theme]?.status === 'passed';
		const eligible =
			hardPass &&
			visualLearningPass &&
			Array.isArray(row.defects) &&
			row.defects.length === 0 &&
			row.total >= 18 &&
			row.scientificAccuracy === 4 &&
			row.evidenceFidelity === 4 &&
			row.textExactness === 3;
		if (row.pass !== eligible)
			issues.push(`${row.theme}: pass does not follow the hard threshold.`);
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
		rows.length === 2 && rows.every((row) => row.pass === true) && crossThemePass;
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
