import { createHash } from 'node:crypto';

export const CHAIN_ILLUSTRATION_SCHEMA_VERSION = 'chain-illustration-job/v1';
export const CHAIN_ILLUSTRATION_STYLE_KEY = 'luminous-scientific-atlas-v1';

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
 * @property {VisualStep[]} visualSteps
 * @property {EvidenceByQuestion[]} evidenceByQuestion
 */

/** @typedef {{ decisions?: SemanticDecision[] }} SemanticPlan */
/** @typedef {Record<string, { status?: string } | undefined>} HardImageChecks */

/**
 * @typedef {object} VisualJudgeCandidate
 * @property {string} label
 * @property {boolean} pass
 * @property {number} scientificAccuracy
 * @property {number} evidenceFidelity
 * @property {number} textExactness
 * @property {number} sequenceClarity
 * @property {number} ipadLegibility
 * @property {number} mnemonicCoherence
 * @property {number} appStyleFit
 * @property {number} total
 * @property {string[]} defects
 */

/**
 * @typedef {object} VisualJudge
 * @property {VisualJudgeCandidate[]} [candidates]
 * @property {string} winner
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

/** @param {ChainIllustrationCandidate} candidate */
export function sourceFingerprint(candidate) {
	const source = {
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
	return sha256(stableStringify(source));
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
- Every non-given causal/process/link/effect step must be mark-scored in at least two distinct source papers.
- Use 2, 3, or 4 panels. Never pad a short chain to four panels.
- A five-step chain may merge exactly one adjacent pair only if both scoring ideas remain explicit in one panel. Every source step must appear exactly once, in order.
- Reject chains that are only recall labels, formatting instructions, a worked answer, or visually misleading abstractions.
- The plan must remain transferable across the attached contexts; do not turn it into an illustration of only the representative question.
- Headings should be short, concrete and reconstruct the causal chain. Microcopy must be at most ten words.
- Alt text and caption must state the full approved chain without adding facts.

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
									'misconceptionGuards'
								],
								properties: {
									order: { type: 'integer' },
									heading: { type: 'string' },
									microcopy: { type: 'string' },
									sourceStepIds: { type: 'array', items: { type: 'string' } },
									visual: { type: 'string' },
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
		for (const sourceStep of candidate.steps.filter((step) => step.stepRole !== 'given')) {
			const scoredPapers = new Set();
			for (const evidenceRow of evidenceRows) {
				const mapping = (evidenceRow.mappings ?? []).find(
					(item) => item.sourceStepId === sourceStep.id
				);
				if (mapping?.supportType === 'mark_scored') {
					const member = candidate.members.find(
						(item) => item.questionId === evidenceRow.questionId
					);
					if (member) scoredPapers.add(member.sourceDocumentId);
				}
			}
			if (scoredPapers.size < 2) {
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

/**
 * @param {ChainIllustrationCandidate} candidate
 * @param {SemanticDecision} decision
 */
export function buildGenerationPrompt(candidate, decision) {
	const panels = decision.visualSteps
		.map(
			(step) =>
				`${step.order}. HEADING — verbatim: "${step.heading}"\n   MICROCOPY — verbatim: "${step.microcopy}"\n   VISUAL: ${step.visual}`
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
Depict only the approved claims and panel plan below. Do not add causal steps, facts, equations or labels.

TRANSFER GOAL
Make this mechanism reconstructable across the attached exam contexts, without overfitting to one question:
- ${contexts}

COMPOSITION
Exactly ${decision.visualSteps.length} large numbered panels in one unambiguous left-to-right 1→${decision.visualSteps.length} path. No return arrow and no circular loop. One dominant scientific visual per panel. Generous iPad-safe margins. The sequence must remain clear at 1024×576.
When several panels revisit the same system, they must show one internally consistent event: keep the same objects, colours, directions, before-state and after-state throughout. Never reset a quantity or contradict an earlier panel merely to illustrate the next claim.

TITLE — verbatim: "${decision.title}"

PANELS — all text verbatim:
${panels}

MISCONCEPTION GUARDS
${guards.length ? guards.map((guard) => `- ${guard}`).join('\n') : '- Do not imply any relationship beyond the approved chain.'}

TYPOGRAPHY
Keep text minimal and horizontal. Render the title, numbers, headings and microcopy exactly as supplied. Make every label readable after downscaling to an iPad-width preview.

HARD CONSTRAINTS
Exactly ${decision.visualSteps.length} panels and numbers. No extra panel, fifth step, legend, logo, exam-board branding, watermark, circular arrow, decorative prose, invented equation, unsupported claim, internally inconsistent repeated state, or scientifically misleading metaphor. This is an in-app explanatory illustration, not a marketing page.`;
}

/**
 * @param {ChainIllustrationCandidate} candidate
 * @param {SemanticDecision} decision
 * @param {HardImageChecks} hardChecks
 */
export function visualJudgePrompt(candidate, decision, hardChecks) {
	return `You are an independent visual QA judge for a GCSE answer-chain illustration. Inspect Candidate A and Candidate B from scratch. The two attached images were generated independently from the exact same prompt.

Do not inspect the repository or filesystem, run commands, or use the web. Judge only the attached
images and the complete ground-truth evidence embedded below. Return only the requested structured
QA data.

GROUND TRUTH CHAIN: ${candidate.canonicalChainText}
REQUIRED TITLE: ${decision.title}
REQUIRED PANELS:
${decision.visualSteps.map((step) => `${step.order}. ${step.heading} / ${step.microcopy} — ${step.visual}`).join('\n')}

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

Hard requirements for a pass:
- scientifically correct against every approved source step and no invented causal claim;
- exactly ${decision.visualSteps.length} numbered panels in the correct one-way order, with no loop;
- title, headings, panel numbers and microcopy rendered correctly enough for a learner to read;
- every approved visual step appears exactly once;
- every repeated object or system keeps the same before-state, after-state, direction, colour coding and quantities across panels that depict the same event;
- readable and unclipped at 1024×576 iPad preview size;
- no logo, watermark, extra legend, fifth step, or misleading metaphor.

Run an explicit cross-panel consistency audit. Compare every repeated object, state, vector, label and quantity. Panels are not independent examples unless the approved plan says so. A reset or contradiction between depictions of the same event is a scientific-accuracy and evidence-fidelity failure, even when each isolated panel looks plausible.

Score each candidate: scientificAccuracy 0-4, evidenceFidelity 0-4, textExactness 0-3, sequenceClarity 0-3, ipadLegibility 0-2, mnemonicCoherence 0-2, appStyleFit 0-2. A candidate passes only with at least 18/20 and full scores for scientificAccuracy, evidenceFidelity and textExactness. Choose neither if both fail. Prefer correctness and clarity over spectacle.`;
}

export function visualJudgeSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['candidates', 'winner', 'rationale'],
		properties: {
			candidates: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: [
						'label',
						'pass',
						'scientificAccuracy',
						'evidenceFidelity',
						'textExactness',
						'sequenceClarity',
						'ipadLegibility',
						'mnemonicCoherence',
						'appStyleFit',
						'total',
						'defects'
					],
					properties: {
						label: { type: 'string', enum: ['A', 'B'] },
						pass: { type: 'boolean' },
						scientificAccuracy: { type: 'integer', minimum: 0, maximum: 4 },
						evidenceFidelity: { type: 'integer', minimum: 0, maximum: 4 },
						textExactness: { type: 'integer', minimum: 0, maximum: 3 },
						sequenceClarity: { type: 'integer', minimum: 0, maximum: 3 },
						ipadLegibility: { type: 'integer', minimum: 0, maximum: 2 },
						mnemonicCoherence: { type: 'integer', minimum: 0, maximum: 2 },
						appStyleFit: { type: 'integer', minimum: 0, maximum: 2 },
						total: { type: 'integer', minimum: 0, maximum: 20 },
						defects: { type: 'array', items: { type: 'string' } }
					}
				}
			},
			winner: { type: 'string', enum: ['A', 'B', 'neither'] },
			rationale: { type: 'string' }
		}
	};
}

/**
 * @param {VisualJudge} judge
 * @param {HardImageChecks} hardChecks
 */
export function validateVisualJudge(judge, hardChecks) {
	const issues = [];
	const rows = Array.isArray(judge?.candidates) ? judge.candidates : [];
	if (rows.length !== 2 || new Set(rows.map((row) => row.label)).size !== 2) {
		issues.push('Judge must return exactly Candidate A and Candidate B.');
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
			issues.push(`${row.label}: total does not match score fields.`);
		const hardPass = hardChecks[row.label]?.status === 'passed';
		const eligible =
			hardPass &&
			row.total >= 18 &&
			row.scientificAccuracy === 4 &&
			row.evidenceFidelity === 4 &&
			row.textExactness === 3;
		if (row.pass !== eligible)
			issues.push(`${row.label}: pass does not follow the hard threshold.`);
	}
	const passing = rows.filter((row) => row.pass);
	if (judge.winner === 'neither' && passing.length > 0)
		issues.push('Judge chose neither despite a pass.');
	if (judge.winner !== 'neither' && !rows.find((row) => row.label === judge.winner)?.pass) {
		issues.push('Judge winner is not a passing candidate.');
	}
	if (passing.length > 1) {
		const best = [...passing].sort((a, b) => b.total - a.total)[0];
		if (judge.winner !== best.label) issues.push('Judge did not choose the highest-scoring pass.');
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
