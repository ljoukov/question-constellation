import path from 'node:path';
import {
	buildFreshDarkRegenerationPrompt,
	buildFreshLightEditRetryPrompt,
	buildGenerationPrompt,
	buildLightEditPrompt,
	buildLightEditStylePrompt,
	buildStylePrompt,
	sha256,
	stableStringify
} from './chain-illustration-pipeline.mjs';

/** @typedef {'Biology' | 'Chemistry' | 'Physics'} ChallengeSubject */
/** @typedef {'teaser' | 'earned'} ChallengeDisplayStage */
/** @typedef {'dark' | 'light'} IllustrationTheme */
/** @typedef {'dark' | 'pair'} UsageJudgeMode */
/** @typedef {'continuous-journey' | 'single-subject-state-progression' | 'linked-distinct-scenes'} CompositionMode */
/** @typedef {Record<string, unknown>} UnknownRecord */

/**
 * @typedef {object} ChallengeEvidence
 * @property {string} id
 * @property {string} source
 * @property {string} text
 */

/**
 * @typedef {object} ChallengeDetails
 * @property {string} question
 * @property {string} learningGoal
 * @property {string} correctAnswer
 * @property {ChallengeEvidence[]} evidence
 */

/**
 * @typedef {object} ChallengeVisualStep
 * @property {number} order
 * @property {string} heading
 * @property {string} microcopy
 * @property {string} visual
 * @property {string} distinctVisualAnchor
 * @property {string} textHiddenMeaning
 * @property {string[]} misconceptionGuards
 * @property {string[]} evidenceIds
 */

/**
 * @typedef {object} ChallengeIllustrationBrief
 * @property {string} title
 * @property {string} altText
 * @property {string} caption
 * @property {string} approvedMeaning
 * @property {CompositionMode} compositionMode
 * @property {string} visualAnchor
 * @property {string} continuousPath
 * @property {string} textHiddenSummary
 * @property {ChallengeVisualStep[]} steps
 */

/**
 * @typedef {object} ChallengeUsage
 * @property {'contain' | 'cover' | 'pan'} mobileFit
 * @property {string} mobilePosition
 * @property {number} mobileWidth
 * @property {number} mobileHeight
 * @property {number | undefined} [mobileViewportWidth]
 */

/**
 * @typedef {object} ChallengeTeaserLeakage
 * @property {string[]} allowedClues
 * @property {string[]} forbiddenText
 * @property {string[]} forbiddenVisuals
 */

/**
 * @typedef {object} ChallengeIllustrationSpec
 * @property {string} schemaVersion
 * @property {string} id
 * @property {ChallengeSubject} subjectArea
 * @property {string | undefined} [broadTopic]
 * @property {ChallengeDisplayStage} displayStage
 * @property {ChallengeDetails} challenge
 * @property {ChallengeIllustrationBrief} illustration
 * @property {ChallengeUsage} usage
 * @property {{darkPath: string, lightPath: string}} output
 * @property {ChallengeTeaserLeakage | undefined} [teaserLeakage]
 * @property {string[] | undefined} [promptConstraints]
 */

/**
 * @typedef {object} ChallengeRunOptions
 * @property {'generate' | 'review-existing' | undefined} [mode]
 * @property {string | null | undefined} [darkPath]
 * @property {string | null | undefined} [lightPath]
 * @property {number | undefined} [maxAttempts]
 * @property {string | undefined} [judgeModel]
 * @property {string | undefined} [judgeThinkingLevel]
 * @property {boolean | undefined} [replaceOutput]
 */

/**
 * @typedef {object} ChallengeRetryFailure
 * @property {UnknownRecord | null | undefined} [visualJudge]
 * @property {UnknownRecord | null | undefined} [usageJudge]
 * @property {UnknownRecord | null | undefined} [hardCheck]
 */

export const CHALLENGE_ILLUSTRATION_SPEC_VERSION = 'challenge-illustration-spec/v1';
export const CHALLENGE_ILLUSTRATION_JOB_VERSION = 'challenge-illustration-job/v1';
export const CHALLENGE_ILLUSTRATION_IMAGE_MODEL = 'chatgpt-gpt-image-2';

// Image-science glitches remain owned by the chain pipeline. These checks describe only how an
// otherwise valid illustration behaves inside a challenge card.
export const CHALLENGE_USAGE_DEFECT_CATALOGUE = Object.freeze({
	mobile_crop: Object.freeze({
		judgeRule:
			'Fail when the representative mobile rendering clips, hides, or makes ambiguous a required subject, stage, arrow, label, or reading-order cue.',
		regenerationRule:
			'Keep every required subject, stage, arrow and label inside the configured mobile-safe region, with generous edge clearance.'
	}),
	mobile_sequence: Object.freeze({
		judgeRule:
			'For horizontal pan, fail a two-row, snake, circular, or otherwise non-linear layout when the initial viewport juxtaposes non-consecutive stages or panning right does not reveal the stages in numerical order.',
		regenerationRule:
			'Lay out stages in one left-to-right row for horizontal pan, so the initial viewport shows stage 1 and the next content reached to the right is stage 2.'
	}),
	mobile_legibility: Object.freeze({
		judgeRule:
			'Fail when required text, symbols, or visual state changes cannot be read or distinguished at the supplied mobile size without zooming.',
		regenerationRule:
			'Increase the scale and contrast of required wording and mechanism cues, and remove non-essential detail until the mobile rendering is immediately legible.'
	}),
	unsupported_evidence: Object.freeze({
		judgeRule:
			'Fail any visible scientific claim, causal relationship, number, label, or implication not supported by the evidence embedded in the judge prompt.',
		regenerationRule:
			'Remove the unsupported claim or replace it with a depiction directly supported by the cited evidence; do not add plausible background facts.'
	}),
	teaser_answer_leakage: Object.freeze({
		judgeRule:
			'For a teaser, fail any wording or visual mechanism that gives away the correct choice, missing causal link, repair, or earned answer chain before the learner acts.',
		regenerationRule:
			'Show only the allowed situation and clues. Remove the revealed answer, missing causal link, repair wording, and any visual that makes the correct choice automatic.'
	}),
	stage_mismatch: Object.freeze({
		judgeRule:
			'Fail when a teaser behaves like a completed explanation, or when an earned illustration fails to show the approved explanatory payoff.',
		regenerationRule:
			'Match the configured stage: teaser is an unresolved evidence-bounded question; earned is the complete approved visual explanation.'
	})
});

export const CHALLENGE_USAGE_DEFECT_IDS = Object.freeze(
	Object.keys(CHALLENGE_USAGE_DEFECT_CATALOGUE)
);

/** @param {unknown} value */
export function validateChallengeIllustrationSpec(value) {
	const spec = /** @type {Partial<ChallengeIllustrationSpec> & UnknownRecord} */ (
		isPlainRecord(value) ? value : {}
	);
	const issues = [];
	if (spec.schemaVersion !== CHALLENGE_ILLUSTRATION_SPEC_VERSION) {
		issues.push('schemaVersion must be ' + CHALLENGE_ILLUSTRATION_SPEC_VERSION + '.');
	}
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(spec.id ?? ''))) {
		issues.push('id must be a lowercase kebab-case identifier.');
	}
	if (!['Biology', 'Chemistry', 'Physics'].includes(String(spec.subjectArea))) {
		issues.push('subjectArea must be Biology, Chemistry, or Physics.');
	}
	if (!['teaser', 'earned'].includes(String(spec.displayStage))) {
		issues.push('displayStage must be teaser or earned.');
	}

	const challenge = /** @type {Partial<ChallengeDetails> & UnknownRecord} */ (
		isPlainRecord(spec.challenge) ? spec.challenge : {}
	);
	for (const field of ['question', 'learningGoal', 'correctAnswer']) {
		if (!nonEmpty(challenge[field])) issues.push('challenge.' + field + ' is required.');
	}
	const evidence = /** @type {Partial<ChallengeEvidence>[]} */ (
		Array.isArray(challenge.evidence) ? challenge.evidence : []
	);
	if (evidence.length === 0) issues.push('challenge.evidence must contain at least one row.');
	const evidenceIds = evidence.map((row) => String(row?.id ?? ''));
	if (evidenceIds.some((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) {
		issues.push('Every challenge.evidence id must be lowercase kebab-case.');
	}
	if (new Set(evidenceIds).size !== evidenceIds.length) {
		issues.push('challenge.evidence ids must be unique.');
	}
	for (const [index, row] of evidence.entries()) {
		if (!nonEmpty(row?.source)) {
			issues.push('challenge.evidence[' + index + '].source is required.');
		}
		if (!nonEmpty(row?.text)) {
			issues.push('challenge.evidence[' + index + '].text is required.');
		}
	}

	const illustration = /** @type {Partial<ChallengeIllustrationBrief> & UnknownRecord} */ (
		isPlainRecord(spec.illustration) ? spec.illustration : {}
	);
	for (const field of [
		'title',
		'altText',
		'caption',
		'approvedMeaning',
		'visualAnchor',
		'continuousPath',
		'textHiddenSummary'
	]) {
		if (!nonEmpty(illustration[field])) issues.push('illustration.' + field + ' is required.');
	}
	if (
		!['continuous-journey', 'single-subject-state-progression', 'linked-distinct-scenes'].includes(
			String(illustration.compositionMode)
		)
	) {
		issues.push('illustration.compositionMode is invalid.');
	}
	if (String(illustration.title ?? '').length > 64) {
		issues.push('illustration.title must be at most 64 characters.');
	}
	if (String(illustration.altText ?? '').length > 320) {
		issues.push('illustration.altText must be at most 320 characters.');
	}
	if (String(illustration.caption ?? '').length > 240) {
		issues.push('illustration.caption must be at most 240 characters.');
	}
	const steps = /** @type {Partial<ChallengeVisualStep>[]} */ (
		Array.isArray(illustration.steps) ? illustration.steps : []
	);
	if (steps.length < 2 || steps.length > 4) {
		issues.push('illustration.steps must contain 2-4 ordered visual stages.');
	}
	for (const [index, step] of steps.entries()) {
		const prefix = 'illustration.steps[' + index + ']';
		if (step?.order !== index + 1) issues.push(prefix + '.order must be ' + (index + 1) + '.');
		const requiredStepFields = /** @type {(keyof ChallengeVisualStep)[]} */ ([
			'heading',
			'microcopy',
			'visual',
			'distinctVisualAnchor',
			'textHiddenMeaning'
		]);
		for (const field of requiredStepFields) {
			if (!nonEmpty(step?.[field])) issues.push(prefix + '.' + field + ' is required.');
		}
		if (String(step?.heading ?? '').length > 34) {
			issues.push(prefix + '.heading must be at most 34 characters.');
		}
		if (wordCount(step?.microcopy) > 10) {
			issues.push(prefix + '.microcopy must be at most ten words.');
		}
		if (!Array.isArray(step?.misconceptionGuards)) {
			issues.push(prefix + '.misconceptionGuards must be an array.');
		}
		const rowEvidenceIds = Array.isArray(step?.evidenceIds) ? step.evidenceIds : [];
		if (rowEvidenceIds.length === 0) issues.push(prefix + '.evidenceIds must not be empty.');
		if (new Set(rowEvidenceIds).size !== rowEvidenceIds.length) {
			issues.push(prefix + '.evidenceIds must not contain duplicates.');
		}
		for (const evidenceId of rowEvidenceIds) {
			if (!evidenceIds.includes(evidenceId)) {
				issues.push(prefix + '.evidenceIds contains unknown id ' + String(evidenceId) + '.');
			}
		}
	}
	const anchors = steps.map((step) => normalize(step?.distinctVisualAnchor));
	if (anchors.some((anchor) => !anchor) || new Set(anchors).size !== anchors.length) {
		issues.push('Every illustration step must have a distinct visual anchor.');
	}

	const usage = /** @type {Partial<ChallengeUsage> & UnknownRecord} */ (
		isPlainRecord(spec.usage) ? spec.usage : {}
	);
	if (!['contain', 'cover', 'pan'].includes(String(usage.mobileFit))) {
		issues.push('usage.mobileFit must be contain, cover, or pan.');
	}
	if (
		!/^(?:left|center|right)(?:\s+(?:top|center|bottom))?$/.test(String(usage.mobilePosition ?? ''))
	) {
		issues.push('usage.mobilePosition must be a simple CSS position such as center or center top.');
	}
	const mobileWidth = Number(usage.mobileWidth);
	const mobileWidthMaximum = usage.mobileFit === 'pan' ? 960 : 480;
	if (!Number.isInteger(mobileWidth) || mobileWidth < 280 || mobileWidth > mobileWidthMaximum) {
		issues.push('usage.mobileWidth must be an integer from 280 to ' + mobileWidthMaximum + '.');
	}
	const mobileHeight = Number(usage.mobileHeight);
	if (!Number.isInteger(mobileHeight) || mobileHeight < 140 || mobileHeight > 540) {
		issues.push('usage.mobileHeight must be an integer from 140 to 540.');
	}
	const mobileViewportWidth = Number(usage.mobileViewportWidth);
	if (
		usage.mobileFit === 'pan' &&
		(!Number.isInteger(mobileViewportWidth) ||
			mobileViewportWidth < 200 ||
			mobileViewportWidth > 480 ||
			mobileViewportWidth >= mobileWidth)
	) {
		issues.push(
			'usage.mobileViewportWidth must be an integer from 200 to 480 and smaller than mobileWidth for pan.'
		);
	}

	const output = /** @type {Partial<ChallengeIllustrationSpec['output']> & UnknownRecord} */ (
		isPlainRecord(spec.output) ? spec.output : {}
	);
	for (const field of ['darkPath', 'lightPath']) {
		if (!isSafeRepoWebpPath(String(output[field] ?? ''))) {
			issues.push('output.' + field + ' must be a relative in-repository .webp path.');
		}
	}
	if (output.darkPath && output.darkPath === output.lightPath) {
		issues.push('output.darkPath and output.lightPath must be different.');
	}

	if (spec.displayStage === 'teaser') {
		const leakage = /** @type {Partial<ChallengeTeaserLeakage> & UnknownRecord} */ (
			isPlainRecord(spec.teaserLeakage) ? spec.teaserLeakage : {}
		);
		const forbiddenText = stringArray(leakage.forbiddenText);
		const forbiddenVisuals = stringArray(leakage.forbiddenVisuals);
		const allowedClues = stringArray(leakage.allowedClues);
		if (forbiddenText.length === 0) {
			issues.push('teaserLeakage.forbiddenText must name answer wording that may not appear.');
		}
		if (forbiddenVisuals.length === 0) {
			issues.push('teaserLeakage.forbiddenVisuals must name visual answer disclosures to avoid.');
		}
		if (allowedClues.length === 0) {
			issues.push('teaserLeakage.allowedClues must define what the teaser may show.');
		}
		const learnerVisible = [
			illustration.title,
			illustration.altText,
			illustration.caption,
			illustration.approvedMeaning,
			illustration.textHiddenSummary,
			...steps.flatMap((step) => [step?.heading, step?.microcopy, step?.textHiddenMeaning])
		]
			.filter(Boolean)
			.join(' ');
		for (const forbidden of forbiddenText) {
			if (normalize(learnerVisible).includes(normalize(forbidden))) {
				issues.push('Teaser learner-visible content leaks forbidden text: ' + forbidden + '.');
			}
		}
	}

	if (spec.promptConstraints !== undefined && !Array.isArray(spec.promptConstraints)) {
		issues.push('promptConstraints must be an array when supplied.');
	}
	return { status: issues.length ? 'failed' : 'passed', issues };
}

// Convert a challenge visual brief to the existing chain prompt/judge inputs. This deliberately
// avoids a second copy of the shared science/glitch judge.
/** @param {ChallengeIllustrationSpec} spec */
export function challengeSpecToChainInputs(spec) {
	const evidence = spec.challenge.evidence;
	const evidenceById = new Map(evidence.map((row) => [row.id, row]));
	const steps = spec.illustration.steps.map((step, index) => ({
		id: spec.id + '-visual-step-' + (index + 1),
		displayOrder: index + 1,
		stepText: step.heading,
		stepRole: index === spec.illustration.steps.length - 1 ? 'effect' : 'process',
		explanation: step.microcopy,
		commonOmission: null
	}));
	const questionId = 'challenge-' + spec.id + '-' + spec.displayStage;
	const markSchemeItems = evidence.map((row, index) => ({
		id: questionId + '-evidence-' + row.id,
		displayOrder: index + 1,
		itemType: 'curated_evidence',
		text: row.text,
		marks: 1,
		confidence: 1
	}));
	const candidate = {
		id: questionId,
		slug: spec.id,
		title: spec.illustration.title,
		canonicalChainText: spec.illustration.approvedMeaning,
		summary: spec.challenge.learningGoal,
		subjectArea: spec.subjectArea,
		broadTopic: spec.broadTopic ?? spec.challenge.learningGoal,
		confidence: 1,
		steps,
		members: [
			{
				questionId,
				sourceDocumentId: 'challenge-spec:' + spec.id,
				sourceQuestionRef: spec.id,
				promptText: spec.challenge.question,
				selfContainedPromptText: spec.challenge.question,
				marks: markSchemeItems.length,
				fitConfidence: 1,
				markSchemeItems,
				checklistItems: [],
				modelAnswers: [
					{
						id: questionId + '-answer',
						answerText: spec.challenge.correctAnswer,
						derivation: 'Curated from ' + evidence.map((row) => row.source).join('; ') + '.',
						confidence: 1,
						needsHumanReview: 0,
						supportingMarkSchemeItemIds: markSchemeItems.map((row) => row.id)
					}
				]
			}
		]
	};
	const visualSteps = spec.illustration.steps.map((step, index) => ({
		order: index + 1,
		heading: step.heading,
		microcopy: step.microcopy,
		sourceStepIds: [steps[index].id],
		visual: step.visual,
		distinctVisualAnchor: step.distinctVisualAnchor,
		textHiddenMeaning: step.textHiddenMeaning,
		misconceptionGuards: step.misconceptionGuards
	}));
	const decision = {
		chainId: candidate.id,
		verdict: 'accept',
		rationale: 'Curated ' + spec.displayStage + ' challenge illustration spec.',
		sameOrderedLinks: true,
		allMembersCovered: true,
		contextOnlyVariation: true,
		branching: false,
		representativeQuestionId: questionId,
		title: spec.illustration.title,
		altText: spec.illustration.altText,
		caption: spec.illustration.caption,
		compositionMode: spec.illustration.compositionMode,
		visualAnchor: spec.illustration.visualAnchor,
		continuousPath: spec.illustration.continuousPath,
		visualWithoutTextSummary: spec.illustration.textHiddenSummary,
		visualSteps,
		evidenceByQuestion: [
			{
				questionId,
				mappings: spec.illustration.steps.map((step, index) => ({
					sourceStepId: steps[index].id,
					supportType: 'mark_scored',
					markSchemeItemIds: step.evidenceIds.map(
						(id) => questionId + '-evidence-' + (evidenceById.get(id)?.id ?? id)
					),
					excerpt: step.evidenceIds.map((id) => evidenceById.get(id)?.text ?? '').join(' ')
				}))
			}
		]
	};
	return { candidate, decision };
}

/** @param {ChallengeIllustrationSpec} spec */
export function buildChallengePromptBundle(spec) {
	const validation = validateChallengeIllustrationSpec(spec);
	if (validation.status !== 'passed') {
		throw new Error('Challenge illustration spec is invalid: ' + validation.issues.join(' '));
	}
	const { candidate, decision } = challengeSpecToChainInputs(spec);
	const stagePrompt = buildDisplayStagePrompt(spec);
	const constraints = stringArray(spec.promptConstraints);
	const constraintsPrompt = constraints.length
		? ['', 'PROJECT-SPECIFIC CONSTRAINTS', ...constraints.map((line) => '- ' + line)].join('\n')
		: '';
	return {
		candidate,
		decision,
		darkStylePrompt: buildStylePrompt(candidate),
		darkInstructionPrompt:
			buildGenerationPrompt(candidate, decision) + '\n\n' + stagePrompt + constraintsPrompt,
		lightStylePrompt: buildLightEditStylePrompt(candidate),
		lightInstructionPrompt:
			buildLightEditPrompt(candidate, decision) + '\n\n' + stagePrompt + constraintsPrompt
	};
}

/** @param {ChallengeIllustrationSpec} spec @param {ChallengeRunOptions} [options] */
export function buildChallengeRunPlan(spec, options = {}) {
	const validation = validateChallengeIllustrationSpec(spec);
	const bundle = validation.status === 'passed' ? buildChallengePromptBundle(spec) : null;
	return {
		schemaVersion: CHALLENGE_ILLUSTRATION_JOB_VERSION,
		status: validation.status === 'passed' ? 'dry-run' : 'invalid',
		mode: options.mode ?? 'generate',
		model: CHALLENGE_ILLUSTRATION_IMAGE_MODEL,
		judgeModel: options.judgeModel ?? 'gpt-5.6-sol',
		judgeThinkingLevel: options.judgeThinkingLevel ?? 'max',
		maxAttempts: options.maxAttempts ?? 3,
		specId: spec?.id ?? null,
		displayStage: spec?.displayStage ?? null,
		specSha256: sha256(stableStringify(spec)),
		validation,
		inputs: {
			darkPath: options.darkPath ?? null,
			lightPath: options.lightPath ?? null
		},
		outputs: {
			darkPath: spec?.output?.darkPath ?? null,
			lightPath: spec?.output?.lightPath ?? null,
			replace: options.replaceOutput === true
		},
		prompts: bundle
			? {
					darkSha256: sha256(bundle.darkStylePrompt + '\n\n' + bundle.darkInstructionPrompt),
					lightSha256: sha256(bundle.lightStylePrompt + '\n\n' + bundle.lightInstructionPrompt)
				}
			: null
	};
}

// Add only defect text returned by a judge. Shared chain glitch rules are selected by the imported
// builders; this wrapper contributes only challenge-usage findings and uncatalogued visible defects.
/** @param {string} basePrompt @param {ChallengeRetryFailure} [failure] */
export function buildChallengeDarkRetryPrompt(basePrompt, failure = {}) {
	const shared = buildFreshDarkRegenerationPrompt(basePrompt, {
		judge: /** @type {any} */ (failure.visualJudge),
		hardChecks: /** @type {any} */ (failure.hardCheck ? { dark: failure.hardCheck } : undefined)
	});
	return appendObservedChallengeDefects(shared, failure, 'dark');
}

/** @param {string} basePrompt @param {ChallengeRetryFailure} [failure] */
export function buildChallengeLightRetryPrompt(basePrompt, failure = {}) {
	const shared = buildFreshLightEditRetryPrompt(basePrompt, {
		judge: /** @type {any} */ (failure.visualJudge),
		hardChecks: /** @type {any} */ (failure.hardCheck ? { light: failure.hardCheck } : undefined)
	});
	return appendObservedChallengeDefects(shared, failure, 'light');
}

/**
 * @param {ChallengeIllustrationSpec} spec
 * @param {Record<string, unknown>} hardChecks
 * @param {UsageJudgeMode} [mode]
 */
export function challengeUsageJudgePrompt(spec, hardChecks, mode = 'pair') {
	const themes = mode === 'dark' ? ['dark'] : ['dark', 'light'];
	const pan = spec.usage.mobileFit === 'pan';
	const imageOrder = pan
		? mode === 'dark'
			? '1. dark desktop/iPad preview; 2. dark mobile horizontal-pan canvas at final display scale; 3. dark initial mobile viewport crop.'
			: '1. accepted dark desktop/iPad preview; 2. dark mobile horizontal-pan canvas at final display scale; 3. dark initial mobile viewport crop; 4. light desktop/iPad preview; 5. light mobile horizontal-pan canvas at final display scale; 6. light initial mobile viewport crop.'
		: mode === 'dark'
			? '1. dark desktop/iPad preview; 2. dark representative mobile rendering.'
			: '1. accepted dark desktop/iPad preview; 2. dark representative mobile rendering; 3. light desktop/iPad preview; 4. light representative mobile rendering.';
	const leakage = spec.displayStage === 'teaser' ? spec.teaserLeakage : null;
	const stageBoundary = leakage
		? [
				'TEASER DISCLOSURE BOUNDARY',
				'Allowed clues:',
				...leakage.allowedClues.map((row) => '- ' + row),
				'Forbidden answer text or equivalent wording:',
				...leakage.forbiddenText.map((row) => '- ' + row),
				'Forbidden visual answer disclosures:',
				...leakage.forbiddenVisuals.map((row) => '- ' + row)
			].join('\n')
		: [
				'EARNED DISCLOSURE BOUNDARY',
				'The learner has completed the repair. The complete approved explanatory payoff should be visible, but no claim beyond the evidence is allowed.'
			].join('\n');
	const defectTaxonomy = Object.entries(CHALLENGE_USAGE_DEFECT_CATALOGUE)
		.map(([id, entry]) => '- ' + id + ': ' + entry.judgeRule)
		.join('\n');
	return [
		'You are the independent in-product usage judge for a GCSE challenge illustration.',
		'Do not inspect files, use tools, or infer unstated evidence.',
		'Inspect the attached images in this order: ' + imageOrder,
		'',
		'DISPLAY CONTRACT',
		'- Challenge id: ' + spec.id,
		'- Display stage: ' + spec.displayStage,
		'- Question shown to the learner: ' + spec.challenge.question,
		'- Learning goal after the complete interaction: ' + spec.challenge.learningGoal,
		'- Correct answer held back by the interaction: ' + spec.challenge.correctAnswer,
		'- Mobile CSS simulation: ' + mobileDisplayContract(spec),
		'- Themes to audit: ' + themes.join(', '),
		'',
		'APPROVED ILLUSTRATION MEANING',
		spec.illustration.approvedMeaning,
		'',
		'SUPPORTED EVIDENCE - EXHAUSTIVE',
		...spec.challenge.evidence.map((row) => '- ' + row.id + ' (' + row.source + '): ' + row.text),
		'',
		stageBoundary,
		'',
		'Audit each supplied theme independently.',
		pan
			? 'mobileCropSafe means the initial viewport clearly establishes the first stage and reading direction, while every required subject, stage, arrow and label is reachable across the supplied horizontal-pan canvas. The pan path itself must be linear: the initial viewport must not juxtapose stage 1 with a later non-consecutive stage, and panning right must reveal stage 2 before stages 3 or 4.'
			: 'mobileCropSafe means no required subject, stage, order cue, arrow or label is clipped or ambiguously lost in the supplied mobile rendering.',
		pan
			? 'mobileLegible means the required text and scientific state changes are readable at the supplied final canvas scale while panning, without browser zoom. Horizontal panning is permitted; zooming is not.'
			: 'mobileLegible means the required text and scientific state changes are readable or distinguishable at that exact size without zoom.',
		'evidenceSupported means every visible or strongly implied scientific claim is directly supported by the exhaustive evidence.',
		'answerLeakFree means the image discloses nothing beyond the configured ' +
			spec.displayStage +
			' boundary.',
		'stageAppropriate means the first glance creates the intended experience: an inviting unresolved clue for teaser, or the complete satisfying explanation for earned.',
		'',
		'USAGE DEFECT TAXONOMY',
		defectTaxonomy,
		'',
		'For every visible failure, return one finding using the exact defectId, all affected supplied themes, affected panel orders (or [] for a whole-image defect), and a concrete observed defect.',
		'Every false hard boolean or non-empty variant defect list must have at least one finding.',
		'Return variants in the supplied theme order. For a dark-only audit set crossThemeUsageMatch=true because cross-theme comparison is not applicable.',
		'The audit passes only when all hard booleans are true, all variant defect lists and findings are empty, and a pair has crossThemeUsageMatch=true.',
		'Return only the requested structured data.',
		'',
		'AUTOMATIC FILE CHECKS',
		JSON.stringify(hardChecks, null, 2)
	].join('\n');
}

/** @param {UsageJudgeMode} [mode] */
export function challengeUsageJudgeSchema(mode = 'pair') {
	const expectedCount = mode === 'dark' ? 1 : 2;
	const themes = mode === 'dark' ? ['dark'] : ['dark', 'light'];
	return {
		type: 'object',
		additionalProperties: false,
		required: ['variants', 'findings', 'crossThemeUsageMatch', 'pass', 'rationale'],
		properties: {
			variants: {
				type: 'array',
				minItems: expectedCount,
				maxItems: expectedCount,
				items: {
					type: 'object',
					additionalProperties: false,
					required: [
						'theme',
						'mobileCropSafe',
						'mobileLegible',
						'evidenceSupported',
						'answerLeakFree',
						'stageAppropriate',
						'defects'
					],
					properties: {
						theme: { type: 'string', enum: themes },
						mobileCropSafe: { type: 'boolean' },
						mobileLegible: { type: 'boolean' },
						evidenceSupported: { type: 'boolean' },
						answerLeakFree: { type: 'boolean' },
						stageAppropriate: { type: 'boolean' },
						defects: { type: 'array', items: { type: 'string' } }
					}
				}
			},
			findings: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['defectId', 'themes', 'panelOrders', 'defect'],
					properties: {
						defectId: { type: 'string', enum: [...CHALLENGE_USAGE_DEFECT_IDS] },
						themes: {
							type: 'array',
							minItems: 1,
							maxItems: expectedCount,
							items: { type: 'string', enum: themes }
						},
						panelOrders: { type: 'array', items: { type: 'integer' } },
						defect: { type: 'string' }
					}
				}
			},
			crossThemeUsageMatch: { type: 'boolean' },
			pass: { type: 'boolean' },
			rationale: { type: 'string' }
		}
	};
}

/**
 * @param {unknown} value
 * @param {ChallengeIllustrationSpec} spec
 * @param {UsageJudgeMode} [mode]
 */
export function validateChallengeUsageJudge(value, spec, mode = 'pair') {
	const judge = /** @type {UnknownRecord} */ (isPlainRecord(value) ? value : {});
	const issues = [];
	const expectedThemes = mode === 'dark' ? ['dark'] : ['dark', 'light'];
	const variants = /** @type {UnknownRecord[]} */ (
		Array.isArray(judge.variants) ? judge.variants : []
	);
	if (
		variants.length !== expectedThemes.length ||
		variants.some((row, index) => row?.theme !== expectedThemes[index])
	) {
		issues.push('Usage judge variants must be ' + expectedThemes.join(', ') + ' in order.');
	}
	const findings = /** @type {UnknownRecord[]} */ (
		Array.isArray(judge.findings) ? judge.findings : []
	);
	if (!Array.isArray(judge.findings)) issues.push('Usage judge must return a findings array.');
	for (const [index, finding] of findings.entries()) {
		const prefix = 'findings[' + index + ']';
		if (!CHALLENGE_USAGE_DEFECT_IDS.includes(String(finding.defectId))) {
			issues.push(prefix + '.defectId is unknown.');
		}
		const themes = /** @type {string[]} */ (Array.isArray(finding.themes) ? finding.themes : []);
		if (
			themes.length === 0 ||
			new Set(themes).size !== themes.length ||
			themes.some((theme) => !expectedThemes.includes(theme))
		) {
			issues.push(prefix + '.themes must name supplied themes without duplicates.');
		}
		const panelOrders = /** @type {number[]} */ (
			Array.isArray(finding.panelOrders) ? finding.panelOrders : []
		);
		if (
			new Set(panelOrders).size !== panelOrders.length ||
			panelOrders.some(
				(order) => !Number.isInteger(order) || order < 1 || order > spec.illustration.steps.length
			)
		) {
			issues.push(prefix + '.panelOrders contains an invalid panel order.');
		}
		if (!nonEmpty(finding.defect)) issues.push(prefix + '.defect is required.');
		if (spec.displayStage !== 'teaser' && finding.defectId === 'teaser_answer_leakage') {
			issues.push(prefix + ' uses teaser_answer_leakage for an earned illustration.');
		}
	}
	for (const row of variants) {
		const hardFields = [
			'mobileCropSafe',
			'mobileLegible',
			'evidenceSupported',
			'answerLeakFree',
			'stageAppropriate'
		];
		for (const field of hardFields) {
			if (typeof row?.[field] !== 'boolean') {
				issues.push((row?.theme ?? 'variant') + '.' + field + ' must be boolean.');
			}
		}
		if (!Array.isArray(row?.defects)) {
			issues.push((row?.theme ?? 'variant') + '.defects must be an array.');
		}
		const rowFailed =
			hardFields.some((field) => row?.[field] !== true) ||
			!Array.isArray(row?.defects) ||
			row.defects.length > 0;
		if (
			rowFailed &&
			!findings.some(
				(finding) => Array.isArray(finding.themes) && finding.themes.includes(String(row.theme))
			)
		) {
			issues.push((row?.theme ?? 'variant') + ' failure must have a structured finding.');
		}
	}
	if (typeof judge.crossThemeUsageMatch !== 'boolean') {
		issues.push('crossThemeUsageMatch must be boolean.');
	}
	if (mode === 'dark' && judge.crossThemeUsageMatch !== true) {
		issues.push('Dark-only usage audit must use crossThemeUsageMatch=true as not applicable.');
	}
	const eligible =
		variants.length === expectedThemes.length &&
		variants.every(
			(row) =>
				row.mobileCropSafe === true &&
				row.mobileLegible === true &&
				row.evidenceSupported === true &&
				row.answerLeakFree === true &&
				row.stageAppropriate === true &&
				Array.isArray(row.defects) &&
				row.defects.length === 0
		) &&
		findings.length === 0 &&
		judge.crossThemeUsageMatch === true;
	if (judge.pass !== eligible) issues.push('Usage judge pass does not follow the hard threshold.');
	return { status: issues.length ? 'failed' : 'passed', issues };
}

/** @param {ChallengeIllustrationSpec} spec */
function buildDisplayStagePrompt(spec) {
	const mobileInstruction =
		spec.usage.mobileFit === 'pan'
			? `On the ${spec.usage.mobileWidth}-pixel-wide horizontal mobile canvas, keep every required label and state change legible without browser zoom. Use one linear left-to-right sequence: the first ${spec.usage.mobileViewportWidth}-pixel viewport must clearly establish stage 1, and panning right must encounter stage 2 before stages 3 or 4. Do not use a two-row, snake, circular, or corner-panel layout for horizontal pan.`
			: `At ${spec.usage.mobileWidth} pixels wide, preserve the full ${spec.displayStage === 'teaser' ? 'question clue' : 'mechanism'}, reading order, and all required labels without zoom.`;
	if (spec.displayStage === 'teaser') {
		if (!spec.teaserLeakage) {
			throw new Error('A teaser prompt requires teaserLeakage after validation.');
		}
		return [
			'CHALLENGE DISPLAY STAGE - TEASER',
			'This image appears before the learner answers. Make the situation and permitted clues immediately understandable, but do not reveal the correct option, missing link, repair, or earned chain.',
			'Allowed clues:',
			...spec.teaserLeakage.allowedClues.map((line) => '- ' + line),
			'Never show or write:',
			...spec.teaserLeakage.forbiddenText.map(
				(line) => '- the answer wording "' + line + '" or an equivalent paraphrase'
			),
			...spec.teaserLeakage.forbiddenVisuals.map((line) => '- ' + line),
			mobileInstruction
		].join('\n');
	}
	return [
		'CHALLENGE DISPLAY STAGE - EARNED',
		'This image appears only after the learner has completed the repair. Deliver the complete approved explanatory payoff with a clear cause-to-effect reading path. Do not add any claim beyond the cited evidence.',
		mobileInstruction
	].join('\n');
}

/** @param {ChallengeIllustrationSpec} spec */
function mobileDisplayContract(spec) {
	if (spec.usage.mobileFit === 'pan') {
		return (
			'horizontal pan, ' +
			spec.usage.mobileWidth +
			'x' +
			spec.usage.mobileHeight +
			' final canvas inside a ' +
			spec.usage.mobileViewportWidth +
			'px-wide viewport, starting at ' +
			spec.usage.mobilePosition
		);
	}
	return (
		spec.usage.mobileWidth +
		'x' +
		spec.usage.mobileHeight +
		', object-fit ' +
		spec.usage.mobileFit +
		', object-position ' +
		spec.usage.mobilePosition
	);
}

/**
 * @param {string} prompt
 * @param {ChallengeRetryFailure} failure
 * @param {IllustrationTheme} theme
 */
function appendObservedChallengeDefects(prompt, failure, theme) {
	const rawUsageFindings = /** @type {UnknownRecord[]} */ (
		Array.isArray(failure.usageJudge?.findings) ? failure.usageJudge.findings : []
	);
	const usageFindings = rawUsageFindings.filter(
		(finding) =>
			CHALLENGE_USAGE_DEFECT_IDS.includes(String(finding.defectId)) &&
			Array.isArray(finding.themes) &&
			finding.themes.includes(theme)
	);
	const standardDefects = collectStandardObservedDefects(failure.visualJudge, theme);
	if (usageFindings.length === 0 && standardDefects.length === 0) return prompt;
	const exact = unique([
		...standardDefects,
		...usageFindings.map(
			(finding) =>
				theme +
				(Array.isArray(finding.panelOrders) && finding.panelOrders.length
					? ' panel ' + finding.panelOrders.join(',')
					: '') +
				': ' +
				String(finding.defect)
		)
	]);
	const rules = unique(
		usageFindings.map((finding) => {
			const defectId = /** @type {keyof typeof CHALLENGE_USAGE_DEFECT_CATALOGUE} */ (
				String(finding.defectId)
			);
			return defectId + ': ' + CHALLENGE_USAGE_DEFECT_CATALOGUE[defectId].regenerationRule;
		})
	);
	return [
		prompt,
		'',
		'ADDITIONAL OBSERVED CHALLENGE-USAGE DEFECTS',
		...exact.map((line) => '- ' + line),
		'',
		'ONLY THE TRIGGERED CHALLENGE-USAGE RULES',
		...(rules.length
			? rules.map((line) => '- ' + line)
			: [
					'- No challenge-usage taxonomy rule was triggered; correct only the exact observed defect text above.'
				])
	].join('\n');
}

/** @param {unknown} judge @param {IllustrationTheme} theme */
function collectStandardObservedDefects(judge, theme) {
	if (!isPlainRecord(judge)) return [];
	const crossTheme = isPlainRecord(judge.crossThemeConsistency)
		? judge.crossThemeConsistency
		: null;
	const variant = isPlainRecord(judge.variant)
		? judge.variant
		: Array.isArray(judge.variants)
			? /** @type {UnknownRecord[]} */ (judge.variants).find((row) => row.theme === theme)
			: null;
	return unique([
		...(Array.isArray(variant?.defects) ? variant.defects : []),
		...(Array.isArray(variant?.panelAudits)
			? /** @type {UnknownRecord[]} */ (variant.panelAudits).flatMap((panel) =>
					(Array.isArray(panel.defects) ? panel.defects : []).map(
						(defect) =>
							theme + (panel.order ? ' panel ' + String(panel.order) : '') + ': ' + String(defect)
					)
				)
			: []),
		...(theme === 'light' && Array.isArray(crossTheme?.defects)
			? crossTheme.defects.map(
					/** @param {unknown} defect */ (defect) => 'cross-theme: ' + String(defect)
				)
			: [])
	]);
}

/** @param {string} value */
function isSafeRepoWebpPath(value) {
	if (!value || path.isAbsolute(value) || path.extname(value).toLowerCase() !== '.webp') {
		return false;
	}
	const normalized = path.normalize(value);
	return normalized !== '..' && !normalized.startsWith('..' + path.sep);
}

/** @param {unknown} value @returns {value is UnknownRecord} */
function isPlainRecord(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** @param {unknown} value */
function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

/** @param {unknown} value @returns {string[]} */
function stringArray(value) {
	return Array.isArray(value)
		? value.filter(/** @returns {item is string} */ (item) => typeof item === 'string')
		: [];
}

/** @param {unknown} value */
function wordCount(value) {
	return String(value ?? '')
		.trim()
		.split(/\s+/)
		.filter(Boolean).length;
}

/** @param {unknown} value */
function normalize(value) {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** @param {unknown[]} values */
function unique(values) {
	return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}
