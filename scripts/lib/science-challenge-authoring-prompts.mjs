import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { buildScienceChallengeAuthoringParts } from './science-challenge-authoring-parts.mjs';
import {
	SCIENCE_CHALLENGE_BATCH_SCHEMA,
	SUBJECT_ART_THEMES,
	canonicalHash,
	stableStringify
} from './science-challenge-release.mjs';
import {
	buildScienceChallengeVerificationRepairAuthority,
	validateScienceChallengeVerificationRepairAuthority
} from './science-challenge-verification-repair-transaction.mjs';

/**
 * Pure, versioned prompt construction shared by live generation and provenance replay.
 *
 * Keeping this logic outside the executable generator lets resume/materialization reconstruct
 * the exact bytes that each multipart request was allowed to send. A recorded hash alone is not
 * sufficient: an attacker could replace a prompt and recompute every descendant hash.
 */
export function buildScienceChallengeAuthoringPrompt({ inputs, existingChallengeDefinitions }) {
	if (!Array.isArray(inputs) || inputs.length === 0) {
		throw new Error('Science challenge authoring prompt requires non-empty inputs.');
	}
	if (!Array.isArray(existingChallengeDefinitions)) {
		throw new Error('Science challenge authoring prompt requires the existing public catalogue.');
	}
	return `You are the release-grade author and examiner for a public GCSE science challenge library.

Return exactly the requested JSON. Author ${inputs.length} complete two-context challenge rounds from the supplied rows.
The supplied prompt is complete. Do not inspect the filesystem or call tools.

NON-NEGOTIABLE GROUNDING
- The official AQA specification excerpt is the authority for what may be taught. Stay inside the exact leaf component and its tier.
- The published paper row, mark scheme, checklist and primary answer chain are CALIBRATION EVIDENCE: use them to match command-word demand, mark density, plausible weak work and examiner credit.
- Do not copy or lightly paraphrase the source prompt, names, values, table, apparatus arrangement, answer wording or scenario. Create two genuinely new contexts.
- Copy every supplied grounding id and SHA-256 exactly. definition.sourceQuestionId is the calibration question id.
- Never invent examiner commentary, a required practical, a constant, a formula or a curriculum requirement.

LEARNER EXPERIENCE
- Each round compares two realistic pupil answers, diagnoses exactly one decisive weakness, repairs it, then applies the same scoring method to a distinct transfer question.
- The opening and transfer must each be independently solvable from their text. Never say a diagram, drawing, graph, chart, image, micrograph, apparatus, circuit, map, table above/below, or source is shown unless the complete evidence is encoded in questionPresentation.table.
- Apply that self-contained rule to every learner-facing string, including presentation text, choices and feedback. Do not ask the learner to draw, sketch, label, annotate or plot anywhere. Illustrations support context but never carry required evidence.
- Store the mark allocation only in definition.marks. Never write an allocation such as "3 marks", "(3 marks)", "[3 mark]" or "three marks" anywhere in learner-facing copy.
- Use British English, GCSE-accessible prose and correct scientific terminology. Avoid chatbot language, internal ids, answer-chain jargon and motivational filler.
- Never use "answer chain", "missing link", "repair chain", "close the gap", "practise this step" or "constellation" in any learner-facing string. The internal mechanic value may still be "missing-link"; do not repeat that internal value in public copy.
- Numerical questions must be dimensionally correct, use realistic values, state required constants, and make every distractor trace to one recognisable working error.
- Practical/data questions must specify usable variables, units and observations; conclusions must not overclaim causation.
- Strong and weak showdown answers must be within 20% word length and within one sentence of each other. Both should sound plausible; the stronger answer must not be signalled by polish or length.
- Each three-choice stage has exactly one correct option. Put correct options at the exact supplied positions. Keep choice lengths and grammar comparable.
- The hook is NOT small-card copy. It is a 24-180 character misconception teaser used only as a featured/recommendation headline. It must be interesting without disclosing the correct answer.
- title is a concise question ending in ?. previewQuestion is the actual opening exam-style task. transferPromptLead is the distinct second exam-style task.
- Every title must be globally distinct learner-facing copy, not a repeated generic topic question.
- Do not reuse any exact title from EXISTING PUBLIC TITLES below.
- When this batch contains more than one row from the same leaf curriculum component, give every opening and transfer a materially different situation and task framing. Do not reuse a sentence skeleton with swapped names, objects or values.
- metaDescription is unique, 90-169 characters, and includes the exact phrase GCSE Biology, GCSE Chemistry or GCSE Physics.
- memoryHandle is a short 3-5 step method joined with →. freeTextKeywordGroups capture independently required ideas, with acceptable synonyms grouped together.

ILLUSTRATION BRIEFS
- Create one unique art brief for opening and one different unique brief for transfer. Their ids must be <challenge-id>-opening and <challenge-id>-transfer.
- Use exactly one subjectArtTheme allowed for the challenge subject: ${Object.entries(
		SUBJECT_ART_THEMES
	)
		.map(([subject, themes]) => `${subject} = ${themes.join(', ')}`)
		.join('; ')}.
- Each brief describes one polished 16:9, text-free, answer-neutral scientific still life or conceptual scene in the established tactile editorial style. It must be specific to that exact context, not a reusable topic collage.
- The learner-facing previewQuestion or transferPromptLead is the authority. Before returning, compare every variable, allele letter and case, genotype, chemical formula, unit, object count, direction, sample label and apparatus state in scene, visualAnchor, altText and accuracyConstraints with that exact question. Never substitute a conventional example such as A/a for the question's own R/r, P/p or F/f notation.
- If any draft brief contradicts the learner-facing question, repair the brief. A scientifically coherent image for the wrong variable, notation, material, direction or setup is still wrong.
- For any force-producing current-carrying-wire and magnetic-field scene, accuracyConstraints must require visibly opposite facing poles, the exact powered conductor segment perpendicular to the pole-to-pole field axis, and that segment in one closed series circuit with no dead-end branch or electrical connection to the magnets. Prefer a literal front-on layout: magnets left/right, vertical powered conductor in the centre of the horizontal air gap, one circuit lead at its top and one at its bottom.
- For sodium/chlorine ionic-bonding art, do not rely on generative raster art to count a full 2,8,1 / 2,8,7 shell diagram. Prefer an answer-neutral pre-reaction still life with sodium metal safely under oil and chlorine gas in a separate sealed vessel. If exact electron counts carry teaching value, require a deterministic code-native diagram rather than a probabilistic generated count. Forbid arrows, charges, ions, transfer and products in opening art.
- For any electronic-structure task that gives an exact electron count, do not brief loose countable counters, beads, dots or a completed shell population. Use an empty unmarked teaching board beside a closed opaque counter container so the generated image cannot contradict or reveal the count. Exact electron diagrams belong in deterministic code-native visuals.
- Apply that counted-notation rule to every atom/ion bonding brief: do not ask generative raster art for exact shell populations or electron counts. Use separate pre-reaction materials for opening art, and require a deterministic code-native diagram if exact counts carry teaching value.
- When a learner-facing electrolysis question states that a molten compound is being electrolysed, do not brief a disconnected or pre-power apparatus. Require an active complete DC circuit at the onset of electrolysis while forbidding visible deposits, bubbles, gases, polarity labels and products.
- For a data-conclusion question whose complete values are already stated in learner-facing text, do not re-encode the pattern as bars, lengths, rankings, arrows or other quantitative marks that give away the conclusion. Use a neutral study-context tableau with visually equivalent unresolved comparison elements.
- For a homeostasis explanation, do not brief the completed receptor → coordination centre → effector → corrected-condition loop that the learner must supply. Use a body and unresolved internal-condition indicator or an incomplete unlabelled framework, with no completed return arrow or successful result.
- For a thermoregulation question, do not visibly show the response the learner must explain. Exercise context must remain pre-response: dry skin and clothing, neutral skin colour, and no sweat, flushing, goosebumps, shivering, vessel cutaway, cooling result or response arrow.
- When a learner must supply differences between cell types, do not brief answer-bearing cutaways or transparent models that expose the nucleus, DNA, plasmids or organelles. Use intact opaque exterior forms without labels or scale claims. A decorative background texture is not a scale grid.
- When a question states that a sealed water vessel has an outward-curving flexible wall membrane, require a visibly closed transparent top sheet with a continuous perimeter seal and an oblique view in which the membrane's restrained convex bow is readable at mobile-card size. A head-on flat disc or open-topped tank does not establish the given observation.
- If the learner-facing scenario names a driver, patient, passenger, operator or other essential person, include that person in scene and altText. Never replace them with an empty vehicle or unattended apparatus.
- When showing a moulded component beside or across an open mould, require every visible cavity outline and cross-section to be the physical inverse of that exact component. If matching geometry is not needed for the question, hide or close the cavity instead of pairing visibly incompatible part and mould shapes.
- Trace every proposed wire, tube, hose, beam, collection path and mechanical connection to its literal endpoint. A hidden connection cannot rescue an open circuit, leaking gas path, blocked detector path or impossible apparatus. "Sealed" must be visibly closed on every side; a transparent enclosure needs an explicitly visible closed lid or top sheet with a continuous perimeter seal. One named sample/plate/object must remain exactly one, objects described as identical must visibly match in size, shape and material, and gas particles must be dispersed rather than close-packed.
- Any inverted gas-collection tube must have a continuous sealed end at the top and an open submerged mouth at the bottom aligned directly above its gas source or electrode. Never brief a tube open at both ends, an open upper rim, or a sealed rounded end where the collection opening must be.
- If a question says a gas sample is contained or retained, require a scientifically plausible vessel state and orientation for that named gas. Never brief a less-dense-than-air sample such as possible hydrogen in an open, mouth-up tube.
- Do not translate question-given measurements, percentages or rankings into countable blocks, bars, lengths, scales, marker rows or proportional spacing. Keep those values in learner-facing text and brief a neutral contextual scene; exact quantitative diagrams must be deterministic and code-native.
- Keep separate procedures and locations separate rather than combining them into one simultaneous or physically tethered setup. Put sources, sensors, detectors, meters, specimens and targets on the physically correct sides of barriers, body parts and tested materials.
- When a question states that a source faces, aims at or sends something towards a target, require a true side-on or strongly oblique composition that makes the source axis visibly intersect the target. Show the source mainly in profile rather than with its emitting face aimed at the viewer. Do not allow both faces to point at the viewer while the source merely sits beside the target.
- If the learner must supply differences, controls, a method, a sequence, a probability, a mechanism or an explanation, stop the art before the missing answer-bearing step. Never brief the completed solution merely because it is visually clear.
- When the learner-facing question explicitly gives an electrical topology as starting context, the art brief must preserve it literally. For a stated parallel circuit, require complete continuous wires, the stated number of separate branches, and shared junctions across the named source; forbid loose components, open endpoints, bare conductors that bridge the supply rails, accidental shorts and hidden connections. A simple physical teaching board may use two vertical junction rails and three cross-rail paths: one path interrupted by the battery and two paths each interrupted by one resistor, with no empty cross-rail path. If constructing or identifying the topology is instead the missing learner answer, use an answer-neutral component still life and require a deterministic code-native diagram wherever the exact connection pattern carries teaching value.
- For National Grid or other network-completion questions, preserve every connection and component explicitly given in each starting network while omitting only the addition the learner must supply. Never forbid or remove stated cables, transformers, generators, sources or consumers merely to keep the missing answer unresolved.
- Do not ask generative art to typeset a notation-heavy functional diagram unless the exact notation is already required by the learner-facing question. Prefer an answer-neutral physical starting scene; use deterministic code-native diagrams elsewhere when exact labels carry the teaching value.
- Show only scientifically accurate objects/states that frame the question. Do not show the result, correct choice, worked method, numeric answer, labels, equations, arrows, captions, branding or exam-board marks.
- Before returning, compare scene, visualAnchor and altText with the correct and incorrect choices. Remove any object, state, quantity or relation that appears only in the correct choice and would cue it; show only information already present in the question or balanced across all choices.
- accuracyConstraints must be visible facts the image judge can verify. forbiddenDetails must explicitly prevent answer leakage and common scientific visual errors.
- altText describes only what is visibly present and must not reveal the answer.

STRUCTURE
- Set questionPresentation to null unless a compact two-column table is necessary. When it is used, set table to null unless the task actually needs the supplied table.
- sourceQuestionId is required; transferQuestionId must not be emitted because the transfer is newly authored.
- lastReviewed is 2026-07-21 and version is 1.
- Use the supplied id exactly. Create a meaningful route slug that is not an exam-board/source id.

INPUT ROWS
${stableStringify(inputs)}

EXISTING PUBLIC TITLES
${stableStringify(existingChallengeDefinitions.map(({ id, title }) => ({ id, title })))}

Return ${SCIENCE_CHALLENGE_BATCH_SCHEMA} JSON only.`;
}

export function buildScienceChallengeVerificationRepairPrompt({
	inputs,
	priorCandidate,
	rows,
	verificationReviews,
	existingChallengeDefinitions,
	verificationRepairAuthority = null
}) {
	const reviewsById = reviewMap(verificationReviews);
	const rejectedReviews = rows
		.map((row) => reviewsById.get(row.id))
		.filter((review) => review?.accepted === false);
	if (verificationRepairAuthority) {
		const authorityValidation = validateScienceChallengeVerificationRepairAuthority({
			authority: verificationRepairAuthority
		});
		if (authorityValidation.status !== 'passed') {
			throw new Error(
				`Verification-repair prompt authority is invalid:\n${authorityValidation.issues.join('\n')}`
			);
		}
		const independentlyRejectedIds = [...reviewsById.values()]
			.filter((review) => review?.accepted === false)
			.map((review) => review.id)
			.sort();
		if (
			canonicalHash(independentlyRejectedIds) !==
			canonicalHash(verificationRepairAuthority.independentRejectedChallengeIds)
		) {
			throw new Error(
				'Verification-repair prompt reviews differ from the frozen independent-defect authority.'
			);
		}
		const rowIds = new Set(rows.map((row) => row.id));
		const mutableChallengeIds = verificationRepairAuthority.mutableChallengeIds.filter((id) =>
			rowIds.has(id)
		);
		const independentDefects = rejectedReviews.map(reviewDefectForPrompt);
		const deterministicCohortRemediations =
			verificationRepairAuthority.collectionRemediations.filter((remediation) =>
				rowIds.has(remediation.preferredChallengeId)
			);
		return `${buildScienceChallengeAuthoringPrompt({
			inputs,
			existingChallengeDefinitions
		})}

This is a targeted repair after a fresh independent empty-context review of a
parent-bound review-rebase cohort. The two evidence classes below grant one frozen mutation
authority; they must remain distinct. Return the entire batch and change EVERY challenge id in
FROZEN MUTABLE CHALLENGE IDS. Preserve every other challenge byte-for-byte, including property
values and array order, even when it shares this shard or multipart response. If the local frozen
list is empty, return the exact prior rows unchanged. Repair every cited defect minimally, then
re-check each changed challenge against the full authoring rules. Do not weaken, delete or reframe
valid content merely to make an issue disappear. A fresh independent verifier will review the new
candidate.

INDEPENDENT REVIEW DEFECTS
These are conclusions made independently from the candidate and official evidence.
${stableStringify(independentDefects)}

DETERMINISTIC COHORT REMEDIATIONS
These are exact preferred mutation targets from the typed parent collection failure. They are not
independent-review conclusions. Each issue may name other collision participants, but that does
not make those other participants mutable.
${stableStringify(deterministicCohortRemediations)}

FROZEN MUTABLE CHALLENGE IDS
${stableStringify(mutableChallengeIds)}

PRIOR BATCH
${stableStringify(priorCandidate)}`;
	}
	return `${buildScienceChallengeAuthoringPrompt({
		inputs,
		existingChallengeDefinitions
	})}

This is a targeted repair after an independent empty-context verifier reviewed the prior batch.
Return the entire batch, but change ONLY the rejected challenge ids listed below. Preserve every
accepted challenge byte-for-byte, including property values and array order. Repair every cited
defect minimally, then re-check the complete repaired challenge against the full authoring rules.
Do not weaken, delete or reframe valid content merely to make the issue disappear. A fresh
independent verifier will review the new candidate.

INDEPENDENT REJECTIONS
${stableStringify(rejectedReviews.map(reviewDefectForPrompt))}

PRIOR BATCH
${stableStringify(priorCandidate)}`;
}

export function buildScienceChallengeRepairPrompt({
	basePrompt,
	candidate,
	issues,
	attempt = null
}) {
	const listedIssues = Array.isArray(issues) ? issues : [];
	const similarityRepairGuidance =
		attempt === 4 &&
		listedIssues.some((issue) =>
			/^[^:]+:(opening|transfer) is too similar to [^:]+:(opening|transfer) /u.test(String(issue))
		)
			? `

FINAL-ATTEMPT COLLECTION SIMILARITY REPAIR
- In these diagnostics, opening means definition.previewQuestion and transfer means definition.transferPromptLead.
- Do not merely substitute a new place, organism, object or number into the previous sentence skeleton.
- Rebuild each named target around a materially different core task: change the question stem, evidence structure, requested scientific quantity or consequence, and reasoning route while staying inside the fixed plan row and official evidence.
- Avoid the previous candidate's central phrase sequence. Before returning, compare its content words and adjacent content-word pairs; the new context must not preserve the same conceptual sentence frame.
- Preserve every unaffected challenge and every required plan, grounding, difficulty, mechanic and answer-position binding exactly.`
			: '';
	if (!candidate) {
		return `${basePrompt}

The prior authoring attempt did not produce a usable candidate. Retry the complete batch and satisfy every listed issue. Do not infer or preserve content from the failed attempt.

ATTEMPT ISSUES
${listedIssues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}${similarityRepairGuidance}`;
	}
	return `${basePrompt}

The prior candidate failed deterministic release validation. Repair every listed issue without weakening unaffected science, provenance, balance or uniqueness. Return the entire corrected batch.

VALIDATION ISSUES
${listedIssues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}${similarityRepairGuidance}

PRIOR CANDIDATE
${stableStringify(candidate)}`;
}

export function buildScienceChallengeMultipartInitialPartPrompt({
	part,
	allRowIds,
	priorCandidate,
	verificationRepair,
	verificationReviews,
	verificationRepairAuthority = null,
	existingChallengeDefinitions
}) {
	const priorPartCandidate = subsetScienceChallengeCandidate(priorCandidate, part.rowIds);
	const prompt = verificationRepair
		? buildScienceChallengeVerificationRepairPrompt({
				inputs: part.inputs,
				priorCandidate: priorPartCandidate,
				rows: part.rows,
				verificationReviews,
				existingChallengeDefinitions,
				verificationRepairAuthority
			})
		: buildScienceChallengeAuthoringPrompt({
				inputs: part.inputs,
				existingChallengeDefinitions
			});
	return `${prompt}

CANONICAL MULTIPART COHORT
This is ${part.partId}, ordered rows ${part.start + 1}-${part.end}, of one canonical shard.
Return only these ids, once each and in this exact order: ${part.rowIds.join(', ')}.
The full shard order is: ${allRowIds.join(', ')}.
Global answer positions in each supplied plan row are final; do not renumber them for this part.
Other parts are authored independently and merged mechanically. Keep every title, opening context,
transfer context and illustration scene specific enough to survive full-shard duplicate checks.`;
}

export function buildScienceChallengeMultipartAttemptParts({
	parts,
	allRowIds,
	existingChallengeDefinitions,
	verificationRepair = false,
	verificationReviews = [],
	verificationRepairAuthority = null,
	priorCandidate = null,
	attempt,
	previousCandidate = null,
	previousIssues = [],
	previousPartCandidates = new Map(),
	allPlanIds = allRowIds
}) {
	if (!Array.isArray(parts) || parts.length < 2) {
		throw new Error('Multipart prompt construction requires at least two ordered parts.');
	}
	if (!Number.isInteger(attempt) || attempt < 1) {
		throw new Error('Multipart prompt construction requires a positive attempt number.');
	}
	const partCandidates =
		previousPartCandidates instanceof Map
			? previousPartCandidates
			: new Map(Object.entries(previousPartCandidates ?? {}));
	return parts.map((part) => {
		const initialPrompt = buildScienceChallengeMultipartInitialPartPrompt({
			part,
			allRowIds,
			priorCandidate,
			verificationRepair,
			verificationReviews,
			verificationRepairAuthority,
			existingChallengeDefinitions
		});
		if (attempt === 1) return { ...part, prompt: initialPrompt };
		const previousPartCandidate =
			subsetScienceChallengeCandidate(previousCandidate, part.rowIds) ??
			subsetScienceChallengeCandidate(partCandidates.get(part.partId), part.rowIds);
		return {
			...part,
			prompt: buildScienceChallengeRepairPrompt({
				basePrompt: initialPrompt,
				candidate: previousPartCandidate,
				issues: scienceChallengeIssuesForMultipartPart({
					issues: previousIssues,
					rowIds: part.rowIds,
					allPlanIds
				}),
				attempt
			})
		};
	});
}

export function subsetScienceChallengeCandidate(candidate, rowIds) {
	if (!candidate || !Array.isArray(candidate.challenges)) return null;
	const byId = new Map(candidate.challenges.map((entry) => [entry?.definition?.id, entry]));
	const challenges = rowIds.map((id) => byId.get(id));
	if (challenges.some((entry) => !entry)) return null;
	return { schemaVersion: SCIENCE_CHALLENGE_BATCH_SCHEMA, challenges };
}

export function scienceChallengeIssuesForMultipartPart({ issues, rowIds, allPlanIds }) {
	const planIds = new Set(allPlanIds ?? []);
	const scoped = (Array.isArray(issues) ? issues : []).filter((issue) => {
		const mentionedIds = [...planIds].filter((id) => String(issue).includes(id));
		return mentionedIds.length === 0 || mentionedIds.some((id) => rowIds.includes(id));
	});
	return scoped.length ? scoped : ['The previous canonical multipart attempt did not pass.'];
}

export function reconstructScienceChallengeMultipartAttemptParts({
	shardDir,
	attemptDirectory,
	rows,
	inputs,
	partSize,
	existingChallengeDefinitions,
	allPlanIds
}) {
	if (typeof shardDir !== 'string' || !shardDir.trim()) {
		throw new Error('Multipart prompt replay requires the shard directory.');
	}
	const repairMatch = String(attemptDirectory).match(
		/^verification-repair-([a-f0-9]{12})-attempt-(\d{2})$/
	);
	const ordinaryMatch = String(attemptDirectory).match(/^attempt-(\d{2})$/);
	if (!repairMatch && !ordinaryMatch) {
		throw new Error(`Invalid multipart attempt directory ${String(attemptDirectory)}.`);
	}
	const attempt = Number(repairMatch?.[2] ?? ordinaryMatch?.[1]);
	const parts = buildScienceChallengeAuthoringParts({ rows, inputs, partSize });
	let verificationRepair = false;
	let verificationReviews = [];
	let verificationRepairAuthority = null;
	let priorCandidate = null;
	if (repairMatch) {
		verificationRepair = true;
		const repairRoot = path.join(shardDir, `verification-repair-${repairMatch[1]}`);
		const verificationSummaryPath = path.join(repairRoot, 'verification-summary.json');
		const priorCandidatePath = path.join(repairRoot, 'prior-candidate.json');
		const verificationSummary = readRequiredJson(
			verificationSummaryPath,
			'multipart verification repair summary'
		);
		verificationReviews = verificationSummary.reviews;
		verificationRepairAuthority = buildScienceChallengeVerificationRepairAuthority({
			verificationSummary,
			allowManifestlessReplay: true
		});
		priorCandidate = readRequiredJson(priorCandidatePath, 'multipart verification prior candidate');
	}

	let previousCandidate = null;
	let previousIssues = [];
	const previousPartCandidates = new Map();
	if (attempt > 1) {
		const previousAttemptDirectory = repairMatch
			? `verification-repair-${repairMatch[1]}-attempt-${String(attempt - 1).padStart(2, '0')}`
			: `attempt-${String(attempt - 1).padStart(2, '0')}`;
		const previousAttemptRoot = path.join(shardDir, previousAttemptDirectory);
		previousCandidate = readOptionalJson(path.join(previousAttemptRoot, 'candidate.json'));
		const previousValidation = readOptionalJson(path.join(previousAttemptRoot, 'validation.json'));
		const currentValidation = readOptionalJson(
			path.join(shardDir, attemptDirectory, 'validation.json')
		);
		previousIssues = [
			...(Array.isArray(previousValidation?.issues) ? previousValidation.issues : []),
			...verificationRepairCohortIssues(currentValidation)
		];
		for (const part of parts) {
			previousPartCandidates.set(
				part.partId,
				readOptionalJson(path.join(previousAttemptRoot, 'parts', part.partId, 'last-message.json'))
			);
		}
	}
	return buildScienceChallengeMultipartAttemptParts({
		parts,
		allRowIds: rows.map((row) => row.id),
		existingChallengeDefinitions,
		verificationRepair,
		verificationReviews,
		verificationRepairAuthority,
		priorCandidate,
		attempt,
		previousCandidate,
		previousIssues,
		previousPartCandidates,
		allPlanIds
	});
}

export function reconstructScienceChallengeAuthoringAttemptPrompt({
	shardDir,
	attemptDirectory,
	rows,
	inputs,
	existingChallengeDefinitions
}) {
	if (typeof shardDir !== 'string' || !shardDir.trim()) {
		throw new Error('Authoring prompt replay requires the shard directory.');
	}
	const repairMatch = String(attemptDirectory).match(
		/^verification-repair-([a-f0-9]{12})-attempt-(\d{2})$/
	);
	const ordinaryMatch = String(attemptDirectory).match(/^attempt-(\d{2})$/);
	if (!repairMatch && !ordinaryMatch) {
		throw new Error(`Invalid authoring attempt directory ${String(attemptDirectory)}.`);
	}
	const attempt = Number(repairMatch?.[2] ?? ordinaryMatch?.[1]);
	let basePrompt;
	if (repairMatch) {
		const repairRoot = path.join(shardDir, `verification-repair-${repairMatch[1]}`);
		const verificationSummary = readRequiredJson(
			path.join(repairRoot, 'verification-summary.json'),
			'authoring verification repair summary'
		);
		const priorCandidate = readRequiredJson(
			path.join(repairRoot, 'prior-candidate.json'),
			'authoring verification prior candidate'
		);
		basePrompt = buildScienceChallengeVerificationRepairPrompt({
			inputs,
			priorCandidate,
			rows,
			verificationReviews: verificationSummary.reviews,
			existingChallengeDefinitions,
			verificationRepairAuthority: buildScienceChallengeVerificationRepairAuthority({
				verificationSummary,
				allowManifestlessReplay: true
			})
		});
	} else {
		basePrompt = buildScienceChallengeAuthoringPrompt({
			inputs,
			existingChallengeDefinitions
		});
	}
	if (attempt === 1) return basePrompt;
	const previousAttemptDirectory = repairMatch
		? `verification-repair-${repairMatch[1]}-attempt-${String(attempt - 1).padStart(2, '0')}`
		: `attempt-${String(attempt - 1).padStart(2, '0')}`;
	const previousAttemptRoot = path.join(shardDir, previousAttemptDirectory);
	const previousCandidate = readOptionalJson(path.join(previousAttemptRoot, 'candidate.json'));
	const previousValidation = readOptionalJson(path.join(previousAttemptRoot, 'validation.json'));
	const currentValidation = readOptionalJson(
		path.join(shardDir, attemptDirectory, 'validation.json')
	);
	return buildScienceChallengeRepairPrompt({
		basePrompt,
		candidate: previousCandidate,
		issues: [
			...(Array.isArray(previousValidation?.issues) ? previousValidation.issues : []),
			...verificationRepairCohortIssues(currentValidation)
		],
		attempt
	});
}

function verificationRepairCohortIssues(validation) {
	const issues = validation?.verificationRepairCohortIssues;
	if (issues === undefined || issues === null) return [];
	if (
		!Array.isArray(issues) ||
		issues.some((issue) => typeof issue !== 'string' || !issue.trim())
	) {
		throw new Error('verificationRepairCohortIssues must contain non-empty strings.');
	}
	return issues;
}

function reviewDefectForPrompt(review) {
	return {
		id: review.id,
		failedGates: Object.entries(review)
			.filter(([, value]) => value === false)
			.map(([field]) => field),
		issues: review.issues
	};
}

function reviewMap(value) {
	if (value instanceof Map) return value;
	if (!Array.isArray(value)) return new Map();
	return new Map(value.map((review) => [review?.id, review]));
}

function readRequiredJson(filePath, label) {
	if (!existsSync(filePath)) throw new Error(`${label} is missing: ${filePath}`);
	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch (error) {
		throw new Error(
			`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
}

function readOptionalJson(filePath) {
	if (!existsSync(filePath)) return null;
	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch {
		return null;
	}
}
