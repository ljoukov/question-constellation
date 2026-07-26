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
- For any force-producing current-carrying-wire and permanent-magnet scene, accuracyConstraints must require visibly opposite facing poles, the exact powered conductor segment perpendicular to the pole-to-pole field axis, and that segment in one closed series circuit with no dead-end branch or electrical connection to the magnets. Prefer a literal front-on layout: magnets left/right, vertical powered conductor in the centre of the horizontal air gap, one circuit lead at its top and one at its bottom.
- For sodium/chlorine ionic-bonding atom models, accuracyConstraints must require separate neutral three-shell atoms with exactly 2,8,1 and 2,8,7 countable electrons before transfer. Forbid extra electron-like beads, arrows, charges, ions and products. Prefer a simpler answer-neutral physical scene or deterministic code-native diagram if exact shell counts cannot be made reliably countable.
- When a learner-facing electrolysis question states that a molten compound is being electrolysed, do not brief a disconnected or pre-power apparatus. Require an active complete DC circuit at the onset of electrolysis while forbidding visible deposits, bubbles, gases, polarity labels and products.
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
