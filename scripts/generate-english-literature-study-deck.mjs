#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import {
	ENGLISH_LITERATURE_CUES,
	ENGLISH_LITERATURE_MODEL,
	ENGLISH_LITERATURE_MODES,
	ENGLISH_LITERATURE_PROMPT_VERSION,
	ENGLISH_LITERATURE_THINKING_LEVEL,
	buildEnglishLiteraturePostReviewCoverage,
	coverageModes,
	englishLiteratureCoverageMatrix,
	normalizeInlineText,
	prepareEnglishLiteratureEvidence,
	sha256,
	sourceManifestValue,
	stableJson,
	validateEnglishLiteratureSourcePlan
} from './lib/english-literature-study-deck.mjs';
import {
	STUDY_CARD_SCHEMA_VERSION,
	expectedStudyCardArtifactRelativePath,
	hashStudyCardArtifact,
	validateStudyCardBundle
} from './lib/study-card-artifact.mjs';

const rootDir = process.cwd();
const REVIEWED_CARD_REPAIR_PROMPT_VERSION = 'ocr-j352-literature-reviewed-card-repair-v1';
const DETERMINISTIC_CARD_REPAIR_PROMPT_VERSION = 'ocr-j352-literature-deterministic-card-repair-v1';
loadDefaultEnv(rootDir);
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
if (
	args.model !== ENGLISH_LITERATURE_MODEL ||
	args.thinkingLevel !== ENGLISH_LITERATURE_THINKING_LEVEL
) {
	throw new Error(
		`Import-grade English Literature decks require ${ENGLISH_LITERATURE_MODEL}/${ENGLISH_LITERATURE_THINKING_LEVEL}.`
	);
}

const catalog = readJson(path.resolve(args.catalog));
const sourcePlanInput = readJson(path.resolve(args.sourcePlan));
const sourcePlan = validateEnglishLiteratureSourcePlan(sourcePlanInput, catalog);
const existingDeck = args.existingArtifact
	? loadExistingDeck(path.resolve(args.existingArtifact), sourcePlan)
	: { releaseId: null, artifactHash: null, cards: [] };
const specification = catalog.specifications.find(
	(entry) => entry.id === sourcePlan.specificationId
);
const offering = catalog.offerings.find((entry) => entry.id === sourcePlan.offeringId);
const expectedCardCount = sourcePlan.topics.flatMap((topic) => topic.evidence).length;
const releaseId = args.releaseId;
const workDir = path.resolve(
	args.workDir ??
		(args.repairFrom
			? `tmp/study-card-generation/${releaseId}-targeted-repair-macbeth`
			: `tmp/study-card-generation/${releaseId}`)
);
const artifactRelativePath = expectedStudyCardArtifactRelativePath(releaseId);
const artifactDir = path.dirname(path.resolve(artifactRelativePath));
const dryPlan = {
	schemaVersion: STUDY_CARD_SCHEMA_VERSION,
	promptVersion: ENGLISH_LITERATURE_PROMPT_VERSION,
	releaseId,
	specificationId: specification.id,
	offeringId: offering.id,
	model: args.model,
	thinkingLevel: args.thinkingLevel,
	topicCount: sourcePlan.topics.length,
	expectedCardCount,
	existingAcceptedReleaseId: existingDeck.releaseId,
	existingAcceptedArtifactHash: existingDeck.artifactHash,
	existingAcceptedCardCount: existingDeck.cards.length,
	coverage: summarizeCoverage(sourcePlan)
};

if (args.repairFrom) {
	await runTargetedRepair();
	process.exit(0);
}

if (!args.generate && !args.prepareSources) {
	console.log(
		JSON.stringify(
			{
				...dryPlan,
				matrix: englishLiteratureCoverageMatrix(sourcePlan),
				note: 'Pass --prepare-sources for a no-model source check or --generate for generator plus independent review.'
			},
			null,
			2
		)
	);
	process.exit(0);
}

if (existsSync(workDir)) {
	if (!args.force) throw new Error(`Work directory exists: ${path.relative(rootDir, workDir)}`);
	rmSync(workDir, { recursive: true, force: true });
}
if (args.generate && existsSync(artifactDir)) {
	throw new Error(`Durable artifact directory exists: ${path.relative(rootDir, artifactDir)}`);
}
mkdirSync(workDir, { recursive: true });
writeJson(path.join(workDir, 'plan.json'), dryPlan);
writeJson(path.join(workDir, 'source-plan.json'), sourcePlanInput);

const downloadedAt = new Date().toISOString();
const snapshots = await downloadSourceSnapshots(sourcePlan, args.sourceTimeoutMs);
const prepared = prepareEnglishLiteratureEvidence(sourcePlan, snapshots);
if (args.sourceHashLock) {
	validateSourceHashLock(prepared, readJson(path.resolve(args.sourceHashLock)));
}
const sourceEvidence = {
	downloadedAt,
	officialSpecification: publicSpecification(specification),
	offering: publicOffering(offering),
	sourceManifest: sourceManifestValue(prepared),
	...(existingDeck.releaseId
		? {
				additiveContext: {
					releaseId: existingDeck.releaseId,
					artifactHash: existingDeck.artifactHash,
					cardCount: existingDeck.cards.length
				}
			}
		: {})
};
writeJson(path.join(workDir, 'source-evidence.json'), sourceEvidence);

if (!args.generate) {
	console.log(
		JSON.stringify(
			{
				...dryPlan,
				status: 'sources_prepared',
				sourceCount: sourcePlan.topics.reduce((sum, topic) => sum + topic.sources.length, 0),
				sourceEvidencePath: path.relative(rootDir, path.join(workDir, 'source-evidence.json'))
			},
			null,
			2
		)
	);
	process.exit(0);
}

const startedAt = new Date().toISOString();
const generationPrompt = buildGenerationPrompt({
	dryPlan,
	specification,
	offering,
	prepared
});
writeFileSync(path.join(workDir, 'generation-prompt.txt'), `${generationPrompt}\n`);
const generation = await runStage('generation', generationPrompt, buildGenerationSchema());
writeFileSync(path.join(workDir, 'generation-model-output.json'), `${generation.finalResponse}\n`);
const rawCandidates = parseModelJson(generation.finalResponse);
writeJson(path.join(workDir, 'raw-candidate-cards.json'), rawCandidates);
const deterministicRepair = await validateOrRepairGeneratedCandidates(rawCandidates, prepared);
let candidates = deterministicRepair.candidates;
writeJson(path.join(workDir, 'candidate-cards.json'), candidates);

const reviewPrompt = buildReviewPrompt({ specification, offering, prepared, candidates });
writeFileSync(path.join(workDir, 'review-prompt.txt'), `${reviewPrompt}\n`);
const review = await runStage('review', reviewPrompt, buildReviewSchema());
writeFileSync(path.join(workDir, 'review-model-output.json'), `${review.finalResponse}\n`);
let reviews = validateReviews(parseModelJson(review.finalResponse), candidates.cards);
writeJson(path.join(workDir, 'review.json'), reviews);

const initialCandidates = candidates;
const initialReviews = reviews;
const reviewedRepair = await repairReviewerRejections(candidates, reviews, prepared);
candidates = reviewedRepair.candidates;
reviews = reviewedRepair.reviews;
if (reviewedRepair.runs.length > 0) {
	writeJson(path.join(workDir, 'final-candidate-cards.json'), candidates);
	writeJson(path.join(workDir, 'final-review.json'), reviews);
}

const reviewById = new Map(reviews.reviews.map((row) => [row.cardId, row]));
const independentlyAccepted = candidates.cards.filter(
	(card) => reviewById.get(card.id)?.accepted === true
);
const result = buildEnglishLiteraturePostReviewCoverage(sourcePlan, independentlyAccepted);
writeJson(path.join(workDir, 'coverage-mode-matrix.json'), { matrix: result.modeMatrix });
writeJson(path.join(workDir, 'rejected-cards.json'), {
	cards: candidates.cards
		.filter((card) => !result.acceptedCards.some((accepted) => accepted.id === card.id))
		.map((card) => ({ card, review: reviewById.get(card.id) })),
	initialReviewerRejections: initialCandidates.cards.flatMap((card, index) =>
		initialReviews.reviews[index].accepted ? [] : [{ card, review: initialReviews.reviews[index] }]
	),
	repairHistory: reviewedRepair.runs.map((run) => ({
		attempt: run.attempt,
		originalRejected: run.originalRejected,
		replacements: run.replacements.map((card, index) => ({
			card,
			review: run.replacementReviews[index]
		})),
		deterministicFailures: run.deterministicFailures
	}))
});
const unresolvedReviewerCards = candidates.cards.filter(
	(card) => reviewById.get(card.id)?.accepted !== true
);
if (
	(result.unexpectedWithheld.length > 0 || unresolvedReviewerCards.length > 0) &&
	!args.allowReviewWithheld
) {
	throw new Error(
		`Independent review left ${unresolvedReviewerCards.length} planned card(s) rejected and ${result.unexpectedWithheld.length} planned-ready topic(s) below their mode gates after targeted repair. --allow-review-withheld is only for an explicitly accepted partial release.`
	);
}

const finishedAt = new Date().toISOString();
const sourceManifestHash = sha256(
	stableJson({
		officialSpecification: publicSpecification(specification),
		offering: publicOffering(offering),
		sourceManifest: sourceManifestValue(prepared),
		...(existingDeck.releaseId
			? {
					additiveContext: {
						releaseId: existingDeck.releaseId,
						artifactHash: existingDeck.artifactHash,
						cardCount: existingDeck.cards.length
					}
				}
			: {})
	})
);
const finalAcceptedIds = new Set(result.acceptedCards.map((card) => card.id));
const reviewerRepairClaimedIds = new Set(
	reviewedRepair.runs.flatMap((run) =>
		run.replacements.flatMap((card, index) =>
			run.replacementReviews[index]?.accepted && finalAcceptedIds.has(card.id) ? [card.id] : []
		)
	)
);
const supplementalRuns = [
	...deterministicRepair.runs.flatMap((run) => {
		const cardIds = run.acceptedCardIds.filter(
			(cardId) => finalAcceptedIds.has(cardId) && !reviewerRepairClaimedIds.has(cardId)
		);
		return cardIds.length
			? [
					{
						purpose: 'targeted-card-repair',
						promptVersion: DETERMINISTIC_CARD_REPAIR_PROMPT_VERSION,
						cardIds,
						generator: modelRun(run.generation),
						reviewer: independentModelRun(review),
						startedAt: run.generation.startedAt,
						finishedAt: review.finishedAt
					}
				]
			: [];
	}),
	...reviewedRepair.runs.flatMap((run) => {
		const cardIds = run.replacements.flatMap((card, index) =>
			run.replacementReviews[index]?.accepted && finalAcceptedIds.has(card.id) ? [card.id] : []
		);
		return cardIds.length && run.review
			? [
					{
						purpose: 'targeted-card-repair',
						promptVersion: REVIEWED_CARD_REPAIR_PROMPT_VERSION,
						cardIds,
						generator: modelRun(run.generation),
						reviewer: independentModelRun(run.review),
						startedAt: run.generation.startedAt,
						finishedAt: run.review.finishedAt
					}
				]
			: [];
	})
];
const bundle = {
	schemaVersion: STUDY_CARD_SCHEMA_VERSION,
	release: {
		id: releaseId,
		promptVersion: ENGLISH_LITERATURE_PROMPT_VERSION,
		generator: {
			model: args.model,
			thinkingLevel: args.thinkingLevel,
			runId: generation.threadId
		},
		reviewer: {
			model: args.model,
			thinkingLevel: args.thinkingLevel,
			runId: review.threadId,
			independentTurn: true
		},
		...(supplementalRuns.length ? { supplementalRuns } : {}),
		startedAt,
		finishedAt,
		sourceManifestHash,
		artifactPath: artifactRelativePath
	},
	cards: result.acceptedCards.map((card) => bindCard(card, prepared, sourcePlan)),
	coverage: result.standardCoverage.map((row) => (row.reason ? row : { ...row, reason: undefined }))
};
const validated = validateStudyCardBundle(bundle);
const artifactHash = hashStudyCardArtifact(validated);
writeJson(path.join(workDir, 'accepted-study-cards.json'), bundle);

mkdirSync(artifactDir, { recursive: true });
for (const name of [
	'plan.json',
	'source-plan.json',
	'source-evidence.json',
	'generation-prompt.txt',
	'generation-model-output.json',
	'raw-candidate-cards.json',
	'candidate-cards.json',
	'deterministic-repair-diagnostics.json',
	'review-prompt.txt',
	'review-model-output.json',
	'review.json',
	'coverage-mode-matrix.json',
	'accepted-study-cards.json',
	'rejected-cards.json'
]) {
	writeFileSync(path.join(artifactDir, name), readFileSync(path.join(workDir, name)));
}
for (const name of ['final-candidate-cards.json', 'final-review.json']) {
	if (existsSync(path.join(workDir, name))) {
		copyFileSync(path.join(workDir, name), path.join(artifactDir, name));
	}
}
for (const stage of ['generation', 'review']) {
	writeFileSync(
		path.join(artifactDir, `${stage}-codex-run-summary.json`),
		readFileSync(path.join(workDir, stage, 'codex-run-summary.json'))
	);
	copyFileSync(
		path.join(workDir, stage, 'events.jsonl'),
		path.join(artifactDir, `${stage}-events.jsonl`)
	);
}
for (const run of [...deterministicRepair.runs, ...reviewedRepair.runs]) {
	copyRepairTrace(run, artifactDir);
}
writeJson(path.join(artifactDir, 'generation-run.json'), {
	status: result.unexpectedWithheld.length
		? 'accepted_with_review_withholding'
		: supplementalRuns.length
			? 'accepted_after_targeted_card_repair'
			: 'accepted',
	plan: dryPlan,
	run: {
		startedAt,
		finishedAt,
		generator: {
			model: args.model,
			thinkingLevel: args.thinkingLevel,
			threadId: generation.threadId
		},
		reviewer: {
			model: args.model,
			thinkingLevel: args.thinkingLevel,
			threadId: review.threadId,
			independentTurn: true
		}
	},
	counts: {
		generated: candidates.cards.length,
		deterministicRepairAttempts: deterministicRepair.runs.length,
		initialReviewerAccepted: initialReviews.reviews.filter((row) => row.accepted).length,
		reviewerRepairAttempts: reviewedRepair.runs.length,
		independentlyAccepted: independentlyAccepted.length,
		published: result.acceptedCards.length,
		readyTopicRows: result.standardCoverage.filter((row) => row.status === 'ready').length,
		withheldTopicRows: result.standardCoverage.filter((row) => row.status === 'withheld').length,
		readyModeRows: result.modeMatrix.filter((row) => row.status === 'ready').length,
		withheldModeRows: result.modeMatrix.filter((row) => row.status === 'withheld').length
	},
	artifactPath: artifactRelativePath,
	artifactHash,
	sourceManifestHash,
	modelUsage: {
		generator: generation.usage,
		reviewer: review.usage,
		deterministicRepairGenerators: deterministicRepair.runs.map((run) => run.generation.usage),
		reviewerRepairGenerators: reviewedRepair.runs.map((run) => run.generation.usage),
		reviewerRepairReviewers: reviewedRepair.runs.flatMap((run) =>
			run.review ? [run.review.usage] : []
		)
	}
});
console.log(readFileSync(path.join(artifactDir, 'generation-run.json'), 'utf8'));

async function validateOrRepairGeneratedCandidates(rawCandidates, prepared) {
	const evidence = prepared.topics.flatMap((topic) => topic.evidence);
	if (!rawCandidates || !Array.isArray(rawCandidates.cards)) {
		throw new Error('Generator output needs cards.');
	}
	if (rawCandidates.cards.length !== evidence.length) {
		writeJson(path.join(workDir, 'deterministic-repair-diagnostics.json'), {
			status: 'unrepairable-cardinality',
			generated: rawCandidates.cards.length,
			expected: evidence.length
		});
		throw new Error(
			`Generator returned ${rawCandidates.cards.length} card(s); expected ${evidence.length}.`
		);
	}

	const cards = [...rawCandidates.cards];
	let invalid = partitionInvalidCandidateIndexes(cards, prepared);
	const initialInvalid = invalid.map(publicInvalidCandidate);
	const runs = [];
	for (let attempt = 1; attempt <= 2 && invalid.length > 0; attempt += 1) {
		const generationStage = `deterministic-repair-generation-${attempt}`;
		const repairPrepared = subsetPreparedEvidence(
			prepared,
			invalid.map((entry) => evidence[entry.index].id)
		);
		const prompt = buildDeterministicRepairPrompt(invalid, repairPrepared, evidence);
		writeFileSync(path.join(workDir, `${generationStage}-prompt.txt`), `${prompt}\n`);
		const generation = await runStage(generationStage, prompt, buildGenerationSchema());
		writeFileSync(
			path.join(workDir, `${generationStage}-model-output.json`),
			`${generation.finalResponse}\n`
		);
		const output = parseModelJson(generation.finalResponse);
		if (!Array.isArray(output.cards) || output.cards.length !== invalid.length) {
			throw new Error(
				`Deterministic repair ${attempt} returned ${output.cards?.length ?? 0} card(s); expected ${invalid.length}.`
			);
		}
		writeJson(path.join(workDir, `${generationStage}-candidates.json`), output);
		const nextInvalid = [];
		const acceptedCardIds = [];
		for (const [replacementIndex, entry] of invalid.entries()) {
			const replacement = output.cards[replacementIndex];
			const expectedEvidence = evidence[entry.index];
			try {
				validateCandidates(
					{ cards: [replacement] },
					subsetPreparedEvidence(prepared, [expectedEvidence.id])
				);
				cards[entry.index] = replacement;
				acceptedCardIds.push(replacement.id);
			} catch (error) {
				nextInvalid.push({
					index: entry.index,
					card: replacement,
					issue: error instanceof Error ? error.message : String(error)
				});
			}
		}
		writeJson(path.join(workDir, `${generationStage}-validation.json`), {
			acceptedCardIds,
			invalid: nextInvalid.map(publicInvalidCandidate)
		});
		runs.push({
			attempt,
			generationStage,
			generation,
			acceptedCardIds,
			deterministicFailures: nextInvalid.map(publicInvalidCandidate)
		});
		invalid = nextInvalid;
	}
	writeJson(path.join(workDir, 'deterministic-repair-diagnostics.json'), {
		status: invalid.length ? 'failed' : initialInvalid.length ? 'repaired' : 'not-needed',
		initialInvalid,
		remainingInvalid: invalid.map(publicInvalidCandidate),
		attempts: runs.map((run) => ({
			attempt: run.attempt,
			acceptedCardIds: run.acceptedCardIds,
			remainingInvalid: run.deterministicFailures
		}))
	});
	if (invalid.length > 0) {
		throw new Error(
			`Targeted deterministic repair left ${invalid.length} invalid Literature card(s).`
		);
	}
	return {
		candidates: validateCandidates({ cards }, prepared),
		runs
	};
}

function partitionInvalidCandidateIndexes(cards, prepared) {
	const evidence = prepared.topics.flatMap((topic) => topic.evidence);
	return cards.flatMap((card, index) => {
		try {
			validateCandidates({ cards: [card] }, subsetPreparedEvidence(prepared, [evidence[index].id]));
			return [];
		} catch (error) {
			return [
				{
					index,
					card,
					issue: error instanceof Error ? error.message : String(error)
				}
			];
		}
	});
}

function publicInvalidCandidate(entry) {
	return {
		index: entry.index,
		cardId: entry.card?.id ?? null,
		evidenceId: entry.card?.evidenceId ?? null,
		issue: entry.issue,
		card: entry.card
	};
}

function buildDeterministicRepairPrompt(invalid, repairPrepared, evidence) {
	return `You are performing a narrowly scoped deterministic repair in an import-grade OCR J352 English Literature study-card release.

Return exactly ${invalid.length} replacement card(s), in the listed order. Preserve each evidenceId, id, conceptKey, topicComponentId and kind exactly. Fix every stated validation issue using only the supplied evidence. Do not alter or discuss valid cards.

All fronts must name the exact text or poetry cluster and stand alone. Qualify every non-primary source with "According to <named source>" in both front and explanation. sourceExcerpt must be a short exact contiguous substring of evidence.excerpt; licensed or copyrighted web synopsis excerpts may contain at most 20 words and support plot only. Copy requiredAnswer byte-for-byte for quotation backs. memoryTip must add an honest retrieval route and contain at most 180 characters. Use three or four unique choices with one exact correct answer; use four only for three distinct plausible misconceptions. Quotation distractors must be exact neighbouring wording or start with "Paraphrase:". Do not duplicate an existing accepted retrieval task. Output JSON only.

Invalid candidates and fixed identities:
${JSON.stringify(
	invalid.map((entry) => {
		const row = evidence[entry.index];
		return {
			requiredIdentity: {
				evidenceId: row.id,
				id: expectedCardId(row.id),
				conceptKey: expectedConceptKey(row.id),
				topicComponentId: row.topicComponentId,
				kind: row.mode
			},
			validationIssue: entry.issue,
			rejectedCandidate: entry.card
		};
	}),
	null,
	2
)}

Exact evidence scope:
${JSON.stringify({ topics: promptTopics(repairPrepared) }, null, 2)}

Existing accepted cards in these target topics:
${JSON.stringify(existingDeck.cards, null, 2)}`;
}

async function repairReviewerRejections(initialCandidates, initialReviews, prepared) {
	const evidence = prepared.topics.flatMap((topic) => topic.evidence);
	const workingCards = [...initialCandidates.cards];
	const workingReviews = [...initialReviews.reviews];
	let activeIndexes = workingReviews.flatMap((row, index) => (row.accepted ? [] : [index]));
	const runs = [];
	for (let attempt = 1; attempt <= 2; attempt += 1) {
		const rejectedIndexes = activeIndexes.filter((index) => !workingReviews[index].accepted);
		if (rejectedIndexes.length === 0) break;
		const originalRejected = rejectedIndexes.map((index) => ({
			index,
			card: workingCards[index],
			review: workingReviews[index]
		}));
		const generationStage = `reviewed-repair-generation-${attempt}`;
		const reviewStage = `reviewed-repair-review-${attempt}`;
		const repairPrepared = subsetPreparedEvidence(
			prepared,
			rejectedIndexes.map((index) => evidence[index].id)
		);
		const prompt = buildReviewerRepairPrompt(originalRejected, repairPrepared);
		writeFileSync(path.join(workDir, `${generationStage}-prompt.txt`), `${prompt}\n`);
		const generation = await runStage(generationStage, prompt, buildGenerationSchema());
		writeFileSync(
			path.join(workDir, `${generationStage}-model-output.json`),
			`${generation.finalResponse}\n`
		);
		const output = parseModelJson(generation.finalResponse);
		if (!Array.isArray(output.cards) || output.cards.length !== originalRejected.length) {
			throw new Error(
				`Reviewer repair ${attempt} returned ${output.cards?.length ?? 0} card(s); expected ${originalRejected.length}.`
			);
		}
		writeJson(path.join(workDir, `${generationStage}-candidates.json`), output);
		const validReplacements = [];
		const deterministicFailures = [];
		for (const [replacementIndex, original] of originalRejected.entries()) {
			const replacement = output.cards[replacementIndex];
			try {
				const validated = validateCandidates(
					{ cards: [replacement] },
					subsetPreparedEvidence(prepared, [evidence[original.index].id])
				).cards[0];
				validReplacements.push({ original, card: validated });
			} catch (error) {
				const issue = error instanceof Error ? error.message : String(error);
				deterministicFailures.push({
					index: original.index,
					card: replacement,
					issue
				});
				workingReviews[original.index] = {
					cardId: workingCards[original.index].id,
					accepted: false,
					issues: [`Replacement failed deterministic validation: ${issue}`],
					learnerValue: original.review.learnerValue
				};
			}
		}
		writeJson(path.join(workDir, `${generationStage}-validation.json`), {
			validCardIds: validReplacements.map((entry) => entry.card.id),
			deterministicFailures: deterministicFailures.map(publicInvalidCandidate)
		});

		let review = null;
		let replacementReviews = [];
		if (validReplacements.length > 0) {
			const replacements = { cards: validReplacements.map((entry) => entry.card) };
			const replacementPrepared = subsetPreparedEvidence(
				prepared,
				validReplacements.map((entry) => evidence[entry.original.index].id)
			);
			const reviewPrompt = buildReviewPrompt({
				specification,
				offering,
				prepared: replacementPrepared,
				candidates: replacements
			});
			writeFileSync(path.join(workDir, `${reviewStage}-prompt.txt`), `${reviewPrompt}\n`);
			review = await runStage(reviewStage, reviewPrompt, buildReviewSchema());
			writeFileSync(
				path.join(workDir, `${reviewStage}-model-output.json`),
				`${review.finalResponse}\n`
			);
			const reviewed = validateReviews(parseModelJson(review.finalResponse), replacements.cards);
			replacementReviews = reviewed.reviews;
			writeJson(path.join(workDir, `${reviewStage}.json`), reviewed);
			for (const [index, entry] of validReplacements.entries()) {
				workingCards[entry.original.index] = entry.card;
				workingReviews[entry.original.index] = replacementReviews[index];
			}
		}
		runs.push({
			attempt,
			generationStage,
			reviewStage,
			generation,
			review,
			originalRejected,
			replacements: validReplacements.map((entry) => entry.card),
			replacementReviews,
			deterministicFailures: deterministicFailures.map(publicInvalidCandidate)
		});
		activeIndexes = rejectedIndexes;
	}
	return {
		candidates: { cards: workingCards },
		reviews: { reviews: workingReviews },
		runs
	};
}

function buildReviewerRepairPrompt(rejected, repairPrepared) {
	return `You are repairing cards rejected by a fresh independent reviewer in an import-grade OCR J352 English Literature release.

Return exactly ${rejected.length} replacement card(s), in the listed order. Preserve evidenceId, id, conceptKey, topicComponentId and kind exactly. Address every reviewer issue using only that card's supplied evidence. Do not alter or discuss accepted cards.

Every front must stand alone and name the exact text or poetry cluster. A non-primary source must be explicitly qualified in both front and explanation. sourceExcerpt must be an exact contiguous substring; a licensed or copyrighted web synopsis excerpt is plot-only and at most 20 words. A quotation back must copy requiredAnswer byte-for-byte. Keep explanation, feedback and memoryTip fully evidence-grounded; memoryTip is at most 180 characters. Use three or four unique choices with one correct answer, choosing four only when three distinct plausible misconceptions exist. Quotation distractors must use exact neighbouring wording or be labelled "Paraphrase:". Do not duplicate an existing accepted retrieval task. Output JSON only.

Rejected cards and reviewer findings:
${JSON.stringify(
	rejected.map(({ card, review }) => ({
		requiredIdentity: {
			evidenceId: card.evidenceId,
			id: card.id,
			conceptKey: card.conceptKey,
			topicComponentId: card.topicComponentId,
			kind: card.kind
		},
		reviewer: review,
		rejectedCandidate: card
	})),
	null,
	2
)}

Exact evidence scope:
${JSON.stringify({ topics: promptTopics(repairPrepared) }, null, 2)}

Existing accepted cards in these target topics:
${JSON.stringify(existingDeck.cards, null, 2)}`;
}

function subsetPreparedEvidence(prepared, evidenceIds) {
	const wanted = new Set(evidenceIds);
	return {
		...prepared,
		topics: prepared.topics
			.map((topic) => ({
				...topic,
				evidence: topic.evidence.filter((row) => wanted.has(row.id))
			}))
			.filter((topic) => topic.evidence.length > 0)
	};
}

function validateSourceHashLock(prepared, lock) {
	if (
		lock?.schemaVersion !== 'ocr-j352-literature-source-preflight-v1' ||
		lock.status !== 'passed' ||
		!Array.isArray(lock.sources)
	) {
		throw new Error('The Literature source-hash lock is not a passed preflight artifact.');
	}
	const expectedById = new Map(lock.sources.map((source) => [source.id, source]));
	for (const source of prepared.topics.flatMap((topic) => topic.sources)) {
		const expected = expectedById.get(source.id);
		if (!expected) throw new Error(`Source-hash lock is missing ${source.id}.`);
		if (
			expected.url !== source.url ||
			expected.title !== source.title ||
			expected.sourceHash !== source.sourceHash
		) {
			throw new Error(
				`Source-hash mismatch for ${source.id}; repeat and review the master preflight before any model generation.`
			);
		}
	}
}

function modelRun(run) {
	return {
		model: run.model,
		thinkingLevel: run.thinkingLevel,
		runId: run.threadId
	};
}

function independentModelRun(run) {
	return { ...modelRun(run), independentTurn: true };
}

function copyRepairTrace(run, destination) {
	const stages = [run.generationStage, run.review ? run.reviewStage : null].filter(Boolean);
	for (const stage of stages) {
		for (const suffix of [
			'prompt.txt',
			'model-output.json',
			'candidates.json',
			'validation.json'
		]) {
			const name = `${stage}-${suffix}`;
			if (existsSync(path.join(workDir, name))) {
				copyFileSync(path.join(workDir, name), path.join(destination, name));
			}
		}
		const reviewJson = `${stage}.json`;
		if (existsSync(path.join(workDir, reviewJson))) {
			copyFileSync(path.join(workDir, reviewJson), path.join(destination, reviewJson));
		}
		const summary = path.join(workDir, stage, 'codex-run-summary.json');
		if (existsSync(summary)) {
			copyFileSync(summary, path.join(destination, `${stage}-codex-run-summary.json`));
		}
		const events = path.join(workDir, stage, 'events.jsonl');
		if (existsSync(events)) {
			copyFileSync(events, path.join(destination, `${stage}-events.jsonl`));
		}
	}
}

async function runTargetedRepair() {
	const targetEvidenceId = 'macbeth-plot-murder-sleep';
	const targetCardId = 'ocr-j352-card-macbeth-plot-murder-sleep';
	const repairPromptVersion = 'ocr-j352-literature-targeted-card-repair-v1';
	const baseDir = path.resolve(args.repairFrom);
	if (baseDir === workDir)
		throw new Error('Repair work directory must differ from the base trace.');
	const base = validateBaseRepairTrace(baseDir, targetEvidenceId, targetCardId);
	const repairPlan = {
		schemaVersion: STUDY_CARD_SCHEMA_VERSION,
		status: args.generate ? 'repair_pending' : 'repair_ready',
		releaseId,
		baseRunDir: path.relative(rootDir, baseDir),
		basePromptVersion: base.plan.promptVersion,
		repairPromptVersion,
		targetEvidenceId,
		targetCardId,
		baseAcceptedCardCount: base.acceptedCards.length,
		mergedCardCount: base.candidates.cards.length,
		baseGeneratorRunId: base.generationSummary.threadId,
		baseReviewerRunId: base.reviewSummary.threadId,
		model: args.model,
		thinkingLevel: args.thinkingLevel
	};
	if (!args.generate) {
		console.log(JSON.stringify(repairPlan, null, 2));
		return;
	}
	if (existsSync(workDir)) {
		if (!args.force)
			throw new Error(`Repair work directory exists: ${path.relative(rootDir, workDir)}`);
		rmSync(workDir, { recursive: true, force: true });
	}
	if (existsSync(artifactDir)) {
		throw new Error(`Durable artifact directory exists: ${path.relative(rootDir, artifactDir)}`);
	}
	mkdirSync(workDir, { recursive: true });
	writeJson(path.join(workDir, 'repair-plan.json'), repairPlan);

	const repairStartedAt = new Date().toISOString();
	const generationPrompt = buildTargetedRepairPrompt(base);
	writeFileSync(path.join(workDir, 'repair-generation-prompt.txt'), `${generationPrompt}\n`);
	const generation = await runStage(
		'repair-generation',
		generationPrompt,
		buildTargetedGenerationSchema()
	);
	writeFileSync(
		path.join(workDir, 'repair-generation-model-output.json'),
		`${generation.finalResponse}\n`
	);
	const repaired = validateCandidates(parseModelJson(generation.finalResponse), base.targetPrepared)
		.cards[0];
	if (
		repaired.id !== targetCardId ||
		repaired.conceptKey !== base.originalCard.conceptKey ||
		repaired.evidenceId !== targetEvidenceId
	) {
		throw new Error(
			'Targeted repair must preserve the rejected card, concept and evidence identities.'
		);
	}
	if (repaired.choices.length !== 4) {
		throw new Error('The targeted v2 repair must preserve the four-choice base contract.');
	}
	if (!/(?:Duncan|Act\s*2|chamber aftermath)/iu.test(repaired.front)) {
		throw new Error(
			'Targeted repair front must disambiguate Duncan or the Act 2 chamber aftermath.'
		);
	}
	if (
		!repaired.sourceExcerpt.includes('I could not say “Amen,”') ||
		!repaired.sourceExcerpt.includes('Macbeth does murder sleep')
	) {
		throw new Error(
			'Targeted repair sourceExcerpt must directly support both halves of the answer.'
		);
	}
	if (
		repaired.choices.some((choice) =>
			/daggers?/iu.test(`${choice.text} ${choice.feedback} ${choice.misconception ?? ''}`)
		)
	) {
		throw new Error('Targeted repair must not reuse the unsupported dagger-return distractor.');
	}
	writeJson(path.join(workDir, 'repair-candidate-card.json'), { cards: [repaired] });

	const reviewPrompt = buildTargetedRepairReviewPrompt(base, repaired);
	writeFileSync(path.join(workDir, 'repair-review-prompt.txt'), `${reviewPrompt}\n`);
	const review = await runStage('repair-review', reviewPrompt, buildReviewSchema());
	writeFileSync(path.join(workDir, 'repair-review-model-output.json'), `${review.finalResponse}\n`);
	const reviewed = validateReviews(parseModelJson(review.finalResponse), [repaired]);
	writeJson(path.join(workDir, 'repair-review.json'), reviewed);
	if (!reviewed.reviews[0].accepted) {
		throw new Error(
			`Targeted repair failed independent review: ${reviewed.reviews[0].issues.join(' ')}`
		);
	}

	const mergedCandidates = {
		cards: base.candidates.cards.map((card) => (card.id === targetCardId ? repaired : card))
	};
	validateCandidates(mergedCandidates, base.prepared);
	const mergedResult = buildEnglishLiteraturePostReviewCoverage(sourcePlan, mergedCandidates.cards);
	if (mergedResult.unexpectedWithheld.length > 0 || mergedResult.acceptedCards.length !== 67) {
		throw new Error('Merged repair did not restore complete 67-card reviewed coverage.');
	}
	const repairFinishedAt = new Date().toISOString();
	const sourceManifestHash = sha256(
		stableJson({
			officialSpecification: base.sourceEvidence.officialSpecification,
			offering: base.sourceEvidence.offering,
			sourceManifest: base.sourceEvidence.sourceManifest
		})
	);
	const bundle = {
		schemaVersion: STUDY_CARD_SCHEMA_VERSION,
		release: {
			id: releaseId,
			promptVersion: base.plan.promptVersion,
			generator: {
				model: base.generationSummary.model,
				thinkingLevel: base.generationSummary.thinkingLevel,
				runId: base.generationSummary.threadId
			},
			reviewer: {
				model: base.reviewSummary.model,
				thinkingLevel: base.reviewSummary.thinkingLevel,
				runId: base.reviewSummary.threadId,
				independentTurn: true
			},
			supplementalRuns: [
				{
					purpose: 'targeted-card-repair',
					promptVersion: repairPromptVersion,
					cardIds: [targetCardId],
					generator: {
						model: args.model,
						thinkingLevel: args.thinkingLevel,
						runId: generation.threadId
					},
					reviewer: {
						model: args.model,
						thinkingLevel: args.thinkingLevel,
						runId: review.threadId,
						independentTurn: true
					},
					startedAt: repairStartedAt,
					finishedAt: repairFinishedAt
				}
			],
			startedAt: base.generationSummary.startedAt,
			finishedAt: repairFinishedAt,
			sourceManifestHash,
			artifactPath: artifactRelativePath
		},
		cards: mergedResult.acceptedCards.map((card) => bindCard(card, base.prepared, sourcePlan)),
		coverage: mergedResult.standardCoverage.map((row) =>
			row.reason ? row : { ...row, reason: undefined }
		)
	};
	const validated = validateStudyCardBundle(bundle);
	const artifactHash = hashStudyCardArtifact(validated);
	writeJson(path.join(workDir, 'merged-candidate-cards.json'), mergedCandidates);
	writeJson(path.join(workDir, 'coverage-mode-matrix.json'), {
		matrix: mergedResult.modeMatrix
	});
	writeJson(path.join(workDir, 'accepted-study-cards.json'), bundle);

	mkdirSync(artifactDir, { recursive: true });
	copyBaseTraceForRepair(baseDir, artifactDir);
	for (const name of [
		'repair-plan.json',
		'repair-generation-prompt.txt',
		'repair-generation-model-output.json',
		'repair-candidate-card.json',
		'repair-review-prompt.txt',
		'repair-review-model-output.json',
		'repair-review.json',
		'merged-candidate-cards.json',
		'coverage-mode-matrix.json',
		'accepted-study-cards.json'
	]) {
		copyFileSync(path.join(workDir, name), path.join(artifactDir, name));
	}
	copyFileSync(
		path.join(workDir, 'repair-generation', 'codex-run-summary.json'),
		path.join(artifactDir, 'repair-generation-codex-run-summary.json')
	);
	copyFileSync(
		path.join(workDir, 'repair-review', 'codex-run-summary.json'),
		path.join(artifactDir, 'repair-review-codex-run-summary.json')
	);
	copyFileSync(
		path.join(workDir, 'repair-generation', 'events.jsonl'),
		path.join(artifactDir, 'repair-generation-events.jsonl')
	);
	copyFileSync(
		path.join(workDir, 'repair-review', 'events.jsonl'),
		path.join(artifactDir, 'repair-review-events.jsonl')
	);
	writeJson(path.join(artifactDir, 'generation-run.json'), {
		status: 'accepted_after_targeted_card_repair',
		plan: repairPlan,
		base: {
			generatorRunId: base.generationSummary.threadId,
			reviewerRunId: base.reviewSummary.threadId,
			accepted: base.acceptedCards.length,
			rejected: 1
		},
		repair: {
			generatorRunId: generation.threadId,
			reviewerRunId: review.threadId,
			cardId: targetCardId,
			accepted: true
		},
		counts: {
			published: mergedResult.acceptedCards.length,
			readyTopicRows: mergedResult.standardCoverage.filter((row) => row.status === 'ready').length,
			withheldTopicRows: mergedResult.standardCoverage.filter((row) => row.status === 'withheld')
				.length,
			readyModeRows: mergedResult.modeMatrix.filter((row) => row.status === 'ready').length,
			withheldModeRows: mergedResult.modeMatrix.filter((row) => row.status === 'withheld').length
		},
		artifactPath: artifactRelativePath,
		artifactHash,
		sourceManifestHash,
		modelUsage: {
			baseGenerator: base.generationSummary.usage,
			baseReviewer: base.reviewSummary.usage,
			repairGenerator: generation.usage,
			repairReviewer: review.usage
		}
	});
	console.log(readFileSync(path.join(artifactDir, 'generation-run.json'), 'utf8'));
}

function validateBaseRepairTrace(baseDir, targetEvidenceId, targetCardId) {
	for (const name of [
		'plan.json',
		'source-plan.json',
		'source-evidence.json',
		'candidate-cards.json',
		'review.json',
		'generation/codex-run-summary.json',
		'review/codex-run-summary.json'
	]) {
		if (!existsSync(path.join(baseDir, name))) throw new Error(`Base trace is missing ${name}.`);
	}
	const plan = readJson(path.join(baseDir, 'plan.json'));
	if (
		plan.releaseId !== releaseId ||
		plan.promptVersion !== 'ocr-j352-literature-study-deck-compiler-v2' ||
		plan.expectedCardCount !== 67
	) {
		throw new Error('Base trace is not the failed 67-card English Literature v2 release.');
	}
	const baseSourcePlan = readJson(path.join(baseDir, 'source-plan.json'));
	if (stableJson(baseSourcePlan) !== stableJson(sourcePlanInput)) {
		throw new Error('Current source plan drifted from the preserved base trace.');
	}
	const sourceEvidence = readJson(path.join(baseDir, 'source-evidence.json'));
	const prepared = rehydratePreparedEvidence(sourceEvidence.sourceManifest);
	const candidates = validateCandidates(
		readJson(path.join(baseDir, 'candidate-cards.json')),
		prepared
	);
	const reviews = validateReviews(readJson(path.join(baseDir, 'review.json')), candidates.cards);
	const rejected = reviews.reviews.filter((row) => !row.accepted);
	if (rejected.length !== 1 || rejected[0].cardId !== targetCardId) {
		throw new Error('Base trace must contain exactly the expected single Macbeth rejection.');
	}
	if (!rejected[0].issues.some((issue) => /the killing|Duncan|Act 2/iu.test(issue))) {
		throw new Error('Base rejection does not contain the preserved ambiguity finding.');
	}
	const generationSummary = readJson(path.join(baseDir, 'generation', 'codex-run-summary.json'));
	const reviewSummary = readJson(path.join(baseDir, 'review', 'codex-run-summary.json'));
	for (const [label, summary] of [
		['generator', generationSummary],
		['reviewer', reviewSummary]
	]) {
		if (
			summary.status !== 'passed' ||
			summary.model !== ENGLISH_LITERATURE_MODEL ||
			summary.thinkingLevel !== ENGLISH_LITERATURE_THINKING_LEVEL ||
			!summary.threadId
		) {
			throw new Error(`Base ${label} provenance is incomplete.`);
		}
	}
	if (generationSummary.threadId === reviewSummary.threadId) {
		throw new Error('Base generator and reviewer must be independent turns.');
	}
	const acceptedCards = candidates.cards.filter(
		(card) => reviews.reviews.find((row) => row.cardId === card.id)?.accepted === true
	);
	if (acceptedCards.length !== 66)
		throw new Error('Base trace must have exactly 66 accepted cards.');
	const originalCard = candidates.cards.find((card) => card.id === targetCardId);
	const targetTopic = prepared.topics.find((topic) =>
		topic.evidence.some((row) => row.id === targetEvidenceId)
	);
	const targetEvidence = targetTopic?.evidence.find((row) => row.id === targetEvidenceId);
	if (!originalCard || !targetTopic || !targetEvidence) {
		throw new Error('Target Macbeth card/evidence is absent from the base trace.');
	}
	const targetPrepared = {
		...prepared,
		topics: [{ ...targetTopic, evidence: [targetEvidence] }]
	};
	return {
		plan,
		sourceEvidence,
		prepared,
		candidates,
		reviews,
		acceptedCards,
		generationSummary,
		reviewSummary,
		originalCard,
		originalReview: rejected[0],
		targetEvidence,
		targetPrepared
	};
}

function rehydratePreparedEvidence(sourceManifest) {
	return {
		...sourceManifest,
		topics: sourceManifest.topics.map((topic) => {
			const sourceById = new Map(topic.sources.map((source) => [source.id, source]));
			return {
				...topic,
				evidence: topic.evidence.map((row) => ({
					...row,
					topicComponentId: topic.topicComponentId,
					source: sourceById.get(row.sourceId) ?? null
				}))
			};
		})
	};
}

function buildTargetedRepairPrompt(base) {
	return `You are performing one narrowly scoped, source-grounded repair in an import-grade OCR J352 English Literature deck. Do not regenerate or discuss any other card.

The base reviewer accepted the evidence, answer and learner value but rejected the front because "the killing" is ambiguous in Macbeth. A first targeted repair fixed the front but was also rejected because an inherited distractor claimed that Macbeth "returns the daggers himself" even though the bounded excerpt only shows Lady Macbeth's order, not its outcome. Produce exactly one new replacement card incorporating both findings.

Preserve evidenceId, id, conceptKey, topicComponentId and kind exactly. The front must remain self-contained, name Macbeth, and explicitly identify Duncan's killing or the Act 2 chamber aftermath. Use only the supplied evidence window; do not add remembered facts. Every distractor, feedback sentence and misconception must be a supported reversal or character-confusion grounded wholly in this bounded excerpt. Do not mention daggers in any choice. Keep exactly four unique choices because this repairs an already-generated four-choice v2 release. Make sourceExcerpt one exact contiguous substring that includes both the blocked Amen and "Macbeth does murder sleep," directly supporting both halves of the answer. Output JSON only.

Evidence:
${JSON.stringify(base.targetEvidence, null, 2)}

Rejected candidate:
${JSON.stringify(base.originalCard, null, 2)}

Reviewer finding:
${JSON.stringify(base.originalReview, null, 2)}`;
}

function buildTargetedRepairReviewPrompt(base, repaired) {
	return `You are the fresh independent reviewer for a single targeted OCR J352 English Literature card repair. You did not generate this repair. Do not rewrite it.

Accept only if the repaired front is self-contained, names Macbeth, and removes the original ambiguity by identifying Duncan's killing or the Act 2 chamber aftermath; every teaching claim is supported by the supplied evidence; sourceExcerpt is verbatim and directly covers both the blocked “Amen” and “Macbeth does murder sleep”; the answer is clear; all four choices are unique with one exact correct answer and three plausible neighbouring misconceptions grounded wholly in the bounded excerpt; no choice or feedback repeats the unsupported dagger-return claim; feedback diagnoses each confusion; and no unsourced or silently corrected literary detail appears. Return exactly one review in the required JSON shape.

Evidence:
${JSON.stringify(base.targetEvidence, null, 2)}

Original rejection:
${JSON.stringify(base.originalReview, null, 2)}

Repaired candidate:
${JSON.stringify(repaired, null, 2)}`;
}

function buildTargetedGenerationSchema() {
	const schema = buildGenerationSchema();
	schema.properties.cards.minItems = 1;
	schema.properties.cards.maxItems = 1;
	schema.properties.cards.items.properties.choices.minItems = 4;
	schema.properties.cards.items.properties.choices.maxItems = 4;
	return schema;
}

function copyBaseTraceForRepair(baseDir, destination) {
	const files = [
		['plan.json', 'base-plan.json'],
		['source-plan.json', 'source-plan.json'],
		['source-evidence.json', 'source-evidence.json'],
		['generation-prompt.txt', 'base-generation-prompt.txt'],
		['generation-model-output.json', 'base-generation-model-output.json'],
		['candidate-cards.json', 'base-candidate-cards.json'],
		['review-prompt.txt', 'base-review-prompt.txt'],
		['review-model-output.json', 'base-review-model-output.json'],
		['review.json', 'base-review.json'],
		['rejected-cards.json', 'base-rejected-cards.json'],
		['generation/codex-run-summary.json', 'base-generation-codex-run-summary.json'],
		['review/codex-run-summary.json', 'base-review-codex-run-summary.json']
	];
	for (const [source, target] of files) {
		copyFileSync(path.join(baseDir, source), path.join(destination, target));
	}
	for (const stage of ['generation', 'review']) {
		const eventsPath = path.join(baseDir, stage, 'events.jsonl');
		if (existsSync(eventsPath)) {
			copyFileSync(eventsPath, path.join(destination, `base-${stage}-events.jsonl`));
		}
	}
}

async function runStage(name, prompt, outputSchema) {
	const directory = path.join(workDir, name);
	return await runCodexSdkTurn({
		prompt,
		workDir: directory,
		eventsPath: path.join(directory, 'events.jsonl'),
		lastMessagePath: path.join(directory, 'last-message.json'),
		summaryPath: path.join(directory, 'codex-run-summary.json'),
		model: args.model,
		thinkingLevel: args.thinkingLevel,
		timeoutMs: args.timeoutMs,
		networkAccessEnabled: false,
		webSearchMode: 'disabled',
		outputSchema,
		sandboxMode: 'read-only',
		environmentMode: 'minimal'
	});
}

function buildGenerationPrompt({ dryPlan, specification, offering, prepared }) {
	return `You are the generator in an offline, import-grade OCR J352 English Literature study-deck compiler.

Create exactly one card for every supplied evidence row (${dryPlan.expectedCardCount} cards). Each row fixes the text/cluster, card kind and evidence. This is deliberate: missing source rights become explicit withheld coverage, never guessed content.

Hard rules:
- Output JSON only and match the schema. Preserve evidenceId, cardId and conceptKey exactly as supplied and output in evidence order.
- This is additive. Do not recreate an existing accepted card's retrieval task or concept merely by changing its wording. A different card kind may reuse a source moment only when it asks the learner to retrieve a genuinely different thing.
- Use only the evidence excerpt attached to that row. sourceExcerpt must be a short, exact, contiguous substring of evidence.excerpt.
- Every front must stand alone outside this route: name the exact selected text or poetry cluster verbatim, identify what the learner must retrieve, and never rely on a heading, previous card or unspecified "this text".
- If evidence.source.kind is not primary-text, begin the front with "According to <named source>" (OCR, Pearson, Faber, Penguin, Wikipedia or Nick Hern Books as applicable) and retain that qualification in the explanation. A synopsis or specification statement must never be disguised as a claim quoted from the literary work.
- A quotation row has requiredAnswer. Copy it byte-for-byte as back. Never modernise spelling, change punctuation, add quotation marks, silently correct a line, or substitute a remembered edition.
- Web synopsis evidence supports plot only. It does not license any line from the primary text. sourceExcerpt must contain no more than 20 words and may not exceed the supplied approved excerpt.
- A plot back must identify the specific event supported by the excerpt, not claim a whole-work summary that the excerpt cannot prove.
- Method cards must rehearse an actionable analytical move. Do not ask learners to recall curriculum headings, component numbers, anthology counts, dates or administrative scope trivia.
- front is a clear unaided-recall question; back is concise; explanation says where the event/line sits and why it matters without adding unsupported plot facts; memoryTip is a retrieval route, not a restatement, and is at most 180 characters.
- Give three or four unique choices. Exactly one isCorrect=true and its text equals back exactly. Use four only when there are three distinct, plausible misconceptions; use three when a fourth distractor would be contrived. Never pad a card to four. Distractors must be plausible neighbouring confusions from the same work, moment or analytical move, never random alternatives from another text. For quotation cards, use exact neighbouring wording from the supplied evidence window; if that is impossible, label a distractor "Paraphrase:" instead of inventing a quotation. Feedback must explicitly identify the confusion.
- Use one meaningful cue from the allowlist, but do not leak the answer. IDs/concept keys and choice keys are lowercase kebab-case and globally specific.
- reverseFront/reverseBack may both be null. If used, both must be present and directly supported.

Allowed cues: ${ENGLISH_LITERATURE_CUES.join(' ')}
Official scope:
${JSON.stringify(
	{
		specification: publicSpecification(specification),
		offering: publicOffering(offering),
		topics: promptTopics(prepared)
	},
	null,
	2
)}

Existing accepted cards in this shard's target topics:
${JSON.stringify(existingDeck.cards, null, 2)}`;
}

function buildReviewPrompt({ specification, offering, prepared, candidates }) {
	return `You are the independent reviewer in an offline, import-grade OCR J352 English Literature study-deck pipeline. You did not generate these cards and must not rewrite or silently repair them.

Accept a card only if every condition holds: it is mapped to the exact selected OCR text; its front is self-contained and names that exact text or poetry cluster; a non-primary source is explicitly named and qualified in both front and explanation; the event or exact quotation is supported by the supplied evidence; quotation punctuation and wording match requiredAnswer byte-for-byte; the card never converts a publisher synopsis into an invented primary-text quotation; a method card rehearses analysis rather than curriculum-heading, component, count or date trivia; the prompt is unambiguous; the explanation adds no unsupported plot claim; it has three or four unique choices with exactly one correct answer; a four-choice card has three genuinely distinct plausible misconceptions, while a card uses three when another distractor would be contrived; choices are plausible neighbouring confusions from the same work/moment/skill rather than random cross-text options; every quotation distractor is exact neighbouring source wording or visibly labelled as a paraphrase; feedback diagnoses the actual confusion; the memory route helps retrieval; and the cue does not reveal the answer.

This is an additive release. Reject a candidate that recreates an existing accepted card's retrieval task or concept with surface rewording. Shared source evidence across different card kinds is acceptable only when the learner retrieves a genuinely different thing.

Reject remembered-but-unsourced details, corrected spellings, edition substitutions, whole-plot claims from a narrow excerpt, invented quotation fragments, and any rights-boundary breach. Return exactly one review for every card in candidate order. Output JSON only.

Official scope and source evidence:
${JSON.stringify(
	{
		specification: publicSpecification(specification),
		offering: publicOffering(offering),
		topics: promptTopics(prepared)
	},
	null,
	2
)}

Candidates:
${JSON.stringify(candidates, null, 2)}

Existing accepted cards in these target topics:
${JSON.stringify(existingDeck.cards, null, 2)}`;
}

function promptTopics(prepared) {
	return prepared.topics
		.filter((topic) => topic.evidence.length > 0)
		.map((topic) => ({
			topicComponentId: topic.topicComponentId,
			title: topic.title,
			evidence: topic.evidence.map((row) => ({
				evidenceId: row.id,
				cardId: expectedCardId(row.id),
				conceptKey: expectedConceptKey(row.id),
				mode: row.mode,
				source: row.source,
				locator: row.locator,
				requiredAnswer: row.requiredAnswer,
				excerpt: row.excerpt
			}))
		}));
}

function validateCandidates(value, prepared) {
	if (!value || !Array.isArray(value.cards)) throw new Error('Generator output needs cards.');
	const evidence = prepared.topics.flatMap((topic) => topic.evidence);
	const topicById = new Map(prepared.topics.map((topic) => [topic.topicComponentId, topic]));
	if (value.cards.length !== evidence.length) {
		throw new Error(
			`Generator returned ${value.cards.length} card(s); expected ${evidence.length}.`
		);
	}
	const ids = new Set();
	const concepts = new Set();
	for (const [index, card] of value.cards.entries()) {
		const expected = evidence[index];
		const label = `cards[${index}]`;
		if (card.evidenceId !== expected.id) {
			throw new Error(`${label}.evidenceId must equal ${expected.id}.`);
		}
		if (card.id !== expectedCardId(expected.id)) {
			throw new Error(`${label}.id must equal ${expectedCardId(expected.id)}.`);
		}
		if (card.conceptKey !== expectedConceptKey(expected.id)) {
			throw new Error(`${label}.conceptKey must equal ${expectedConceptKey(expected.id)}.`);
		}
		for (const field of [
			'id',
			'conceptKey',
			'topicComponentId',
			'kind',
			'visualCue',
			'front',
			'back',
			'explanation',
			'memoryTip',
			'sourceExcerpt'
		]) {
			if (typeof card[field] !== 'string' || !card[field].trim()) {
				throw new Error(`${label}.${field} is required.`);
			}
			if (card[field] !== card[field].trim()) throw new Error(`${label}.${field} must be trimmed.`);
		}
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(card.id)) throw new Error(`${label}.id is invalid.`);
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(card.conceptKey)) {
			throw new Error(`${label}.conceptKey is invalid.`);
		}
		if (ids.has(card.id) || concepts.has(card.conceptKey))
			throw new Error(`${label} is duplicated.`);
		ids.add(card.id);
		concepts.add(card.conceptKey);
		if (card.topicComponentId !== expected.topicComponentId) {
			throw new Error(`${label}.topicComponentId is outside its evidence scope.`);
		}
		if (card.kind !== expected.mode) throw new Error(`${label}.kind must equal ${expected.mode}.`);
		const topic = topicById.get(expected.topicComponentId);
		if (
			!normalizeInlineText(card.front)
				.toLocaleLowerCase('en-GB')
				.includes(normalizeInlineText(topic.title).toLocaleLowerCase('en-GB'))
		) {
			throw new Error(`${label}.front must name the exact selected text or poetry cluster.`);
		}
		if (expected.source.kind !== 'primary-text') {
			const qualifier = requiredSourceQualifier(expected.source);
			if (
				!/^according to\b/iu.test(card.front) ||
				!card.front.toLocaleLowerCase('en-GB').includes(qualifier.toLocaleLowerCase('en-GB')) ||
				!card.explanation.toLocaleLowerCase('en-GB').includes(qualifier.toLocaleLowerCase('en-GB'))
			) {
				throw new Error(
					`${label} must qualify non-primary evidence with ${qualifier} in its front and explanation.`
				);
			}
		}
		if (
			card.kind === 'method' &&
			/\b(?:fifteen|1789|component\s*0?2|how many poems?|curriculum headings?)\b/iu.test(
				`${card.front} ${card.back}`
			)
		) {
			throw new Error(`${label} tests curriculum trivia instead of an analytical move.`);
		}
		if (!ENGLISH_LITERATURE_CUES.includes(card.visualCue)) {
			throw new Error(`${label}.visualCue is outside the Literature allowlist.`);
		}
		if (Array.from(card.memoryTip).length > 180) {
			throw new Error(`${label}.memoryTip exceeds 180 characters.`);
		}
		if (!expected.excerpt.includes(card.sourceExcerpt)) {
			throw new Error(`${label}.sourceExcerpt is not verbatim in its evidence window.`);
		}
		if (
			['copyrighted-web-synopsis', 'licensed-web-synopsis'].includes(
				expected.source.retrievalType
			) &&
			wordCount(card.sourceExcerpt) > 20
		) {
			throw new Error(`${label}.sourceExcerpt exceeds the copyrighted-source word cap.`);
		}
		if (expected.requiredAnswer !== null && card.back !== expected.requiredAnswer) {
			throw new Error(`${label}.back silently changed the required quotation.`);
		}
		if (!Array.isArray(card.choices) || ![3, 4].includes(card.choices.length)) {
			throw new Error(`${label}.choices must contain three or four rows.`);
		}
		const correct = card.choices.filter((choice) => choice.isCorrect === true);
		if (correct.length !== 1 || correct[0].text !== card.back) {
			throw new Error(`${label} must have one correct choice exactly equal to back.`);
		}
		if (
			new Set(card.choices.map((choice) => normalizeInlineText(choice.text).toLowerCase())).size !==
			card.choices.length
		) {
			throw new Error(`${label}.choices must be unique.`);
		}
		for (const [choiceIndex, choice] of card.choices.entries()) {
			if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(choice.key ?? '')) {
				throw new Error(`${label}.choices[${choiceIndex}].key is invalid.`);
			}
			if (!choice.text?.trim() || !choice.feedback?.trim()) {
				throw new Error(`${label}.choices[${choiceIndex}] is incomplete.`);
			}
			if (choice.isCorrect && choice.misconception !== null) {
				throw new Error(`${label}.choices[${choiceIndex}] correct choice has a misconception.`);
			}
			if (!choice.isCorrect && !choice.misconception?.trim()) {
				throw new Error(`${label}.choices[${choiceIndex}] distractor needs a misconception.`);
			}
			if (
				card.kind === 'quotation' &&
				!choice.isCorrect &&
				!/^paraphrase:/iu.test(choice.text) &&
				!expected.excerpt.includes(normalizeInlineText(choice.text))
			) {
				throw new Error(
					`${label}.choices[${choiceIndex}] must be neighbouring source wording or an explicit paraphrase.`
				);
			}
		}
		const reverseFront = card.reverseFront ?? null;
		const reverseBack = card.reverseBack ?? null;
		if ((reverseFront === null) !== (reverseBack === null)) {
			throw new Error(`${label} reverse fields must both be null or both be present.`);
		}
	}
	return { cards: value.cards };
}

function requiredSourceQualifier(source) {
	if (source.title.includes('Nick Hern Books')) return 'Nick Hern Books';
	for (const name of ['OCR', 'Pearson', 'Faber', 'Penguin', 'Wikipedia']) {
		if (source.title.includes(name)) return name;
	}
	throw new Error(`No learner-facing source qualifier is configured for ${source.id}.`);
}

function expectedCardId(evidenceId) {
	return `ocr-j352-card-${evidenceId}`;
}

function expectedConceptKey(evidenceId) {
	return `ocr-j352-concept-${evidenceId}`;
}

function validateReviews(value, cards) {
	if (!value || !Array.isArray(value.reviews) || value.reviews.length !== cards.length) {
		throw new Error('Reviewer must return one review for every candidate.');
	}
	for (const [index, review] of value.reviews.entries()) {
		if (review.cardId !== cards[index].id || typeof review.accepted !== 'boolean') {
			throw new Error(`Review ${index} does not match candidate order.`);
		}
		if (!Array.isArray(review.issues) || !Array.isArray(review.learnerValue)) {
			throw new Error(`Review ${index} needs issues and learnerValue arrays.`);
		}
		if (review.accepted && review.issues.length) {
			throw new Error(`Accepted review ${review.cardId} cannot contain issues.`);
		}
		if (!review.accepted && !review.issues.length) {
			throw new Error(`Rejected review ${review.cardId} must explain its issues.`);
		}
	}
	return value;
}

function bindCard(card, prepared, sourcePlan) {
	const evidence = prepared.topics
		.flatMap((topic) => topic.evidence)
		.find((row) => row.id === card.evidenceId);
	const supports = ['front', 'back', 'explanation', 'memoryTip'];
	if (card.reverseFront && card.reverseBack) supports.push('reverse');
	const result = {
		id: card.id,
		conceptKey: card.conceptKey,
		board: 'OCR',
		qualification: 'GCSE',
		subject: 'English Literature',
		kind: card.kind,
		visualCue: card.visualCue,
		front: card.front,
		back: card.back,
		...(card.reverseFront ? { reverseFront: card.reverseFront } : {}),
		...(card.reverseBack ? { reverseBack: card.reverseBack } : {}),
		explanation: card.explanation,
		memoryTip: card.memoryTip,
		contentRevision: 1,
		choices: card.choices,
		sources: [
			{
				kind: evidence.source.kind,
				url: evidence.source.url,
				title: evidence.source.title,
				locator: evidence.locator,
				excerpt: card.sourceExcerpt,
				sourceHash: evidence.source.sourceHash,
				rightsBasis: evidence.source.rightsBasis,
				supports
			}
		],
		targets: [
			{
				offeringId: sourcePlan.offeringId,
				curriculumComponentId: evidence.topicComponentId,
				topicComponentId: evidence.topicComponentId,
				isPrimary: true,
				confidence: 1,
				reviewed: true
			}
		]
	};
	return result;
}

async function downloadSourceSnapshots(sourcePlan, timeoutMs) {
	const sources = sourcePlan.topics.flatMap((topic) => topic.sources);
	const downloadDir = path.join(workDir, 'source-downloads');
	mkdirSync(downloadDir, { recursive: true });
	const entries = await Promise.all(
		sources.map(async (source) => {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const response = await fetch(source.url, {
					redirect: 'follow',
					signal: controller.signal,
					headers: {
						'user-agent': 'QuestionConstellationStudyDeckCompiler/1.0 (+source-validation)'
					}
				});
				if (!response.ok) throw new Error(`${source.id} download returned HTTP ${response.status}`);
				if (new URL(response.url).protocol !== 'https:') {
					throw new Error(`${source.id} redirected away from HTTPS`);
				}
				const isPdf = source.retrievalType.endsWith('-pdf');
				let body;
				let contentType;
				if (isPdf) {
					const bytes = Buffer.from(await response.arrayBuffer());
					if (bytes.length > 16 * 1024 * 1024) {
						throw new Error(`${source.id} PDF source snapshot exceeds 16 MiB`);
					}
					const pdfPath = path.join(downloadDir, `${source.id}.pdf`);
					writeFileSync(pdfPath, bytes);
					body = execFileSync('pdftotext', ['-raw', '-nopgbrk', pdfPath, '-'], {
						encoding: 'utf8',
						maxBuffer: 32 * 1024 * 1024
					});
					contentType = 'text/plain; source=application/pdf';
				} else {
					body = await response.text();
					if (Buffer.byteLength(body, 'utf8') > 4 * 1024 * 1024) {
						throw new Error(`${source.id} source snapshot exceeds 4 MiB`);
					}
					contentType = response.headers.get('content-type') ?? '';
				}
				return [source.id, { body, contentType }];
			} finally {
				clearTimeout(timer);
			}
		})
	);
	return new Map(entries);
}

function summarizeCoverage(sourcePlan) {
	const matrix = englishLiteratureCoverageMatrix(sourcePlan);
	return {
		readyTopicRows: sourcePlan.topics.filter((topic) =>
			coverageModes(topic.coverage).some((mode) => topic.coverage[mode].status === 'ready')
		).length,
		fullyWithheldTopicRows: sourcePlan.topics.filter((topic) =>
			coverageModes(topic.coverage).every((mode) => topic.coverage[mode].status === 'withheld')
		).length,
		readyModeRows: matrix.filter((row) => row.status === 'ready').length,
		withheldModeRows: matrix.filter((row) => row.status === 'withheld').length
	};
}

function publicSpecification(specification) {
	return {
		id: specification.id,
		board: specification.board,
		qualification: specification.qualification,
		subject: specification.subject,
		specificationCode: specification.specificationCode,
		version: specification.version,
		title: specification.title,
		landingUrl: specification.landingUrl,
		pdfUrl: specification.pdfUrl,
		sha256: specification.sha256
	};
}

function publicOffering(offering) {
	return {
		id: offering.id,
		profileSubject: offering.profileSubject,
		course: offering.course,
		tier: offering.tier,
		label: offering.label,
		selectableComponentIds: offering.selectableComponentIds
	};
}

function parseModelJson(value) {
	const trimmed = String(value ?? '').trim();
	const unwrapped = trimmed.startsWith('```')
		? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
		: trimmed;
	return JSON.parse(unwrapped);
}

function wordCount(value) {
	return normalizeInlineText(value).split(/\s+/u).filter(Boolean).length;
}

function loadExistingDeck(filePath, plan) {
	const bundle = validateStudyCardBundle(readJson(filePath));
	if (
		bundle.cards.some(
			(card) =>
				card.board !== 'OCR' ||
				card.qualification !== 'GCSE' ||
				card.subject !== 'English Literature'
		)
	) {
		throw new Error('The additive-context artifact is not an OCR GCSE English Literature deck.');
	}
	const activeTopicIds = new Set(
		plan.topics.filter((topic) => topic.evidence.length > 0).map((topic) => topic.topicComponentId)
	);
	return {
		releaseId: bundle.release.id,
		artifactHash: hashStudyCardArtifact(bundle),
		cards: bundle.cards
			.filter((card) => card.targets.some((target) => activeTopicIds.has(target.topicComponentId)))
			.map((card) => ({
				id: card.id,
				conceptKey: card.conceptKey,
				kind: card.kind,
				front: card.front,
				back: card.back,
				topicComponentIds: card.targets.map((target) => target.topicComponentId)
			}))
	};
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
	const value = (name, fallback = null) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
	const integer = (name, fallback, min, max) => {
		const parsed = Number(value(name, String(fallback)));
		if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
			throw new Error(`--${name} must be an integer from ${min} to ${max}.`);
		}
		return parsed;
	};
	return {
		help: argv.includes('--help') || argv.includes('-h'),
		generate: argv.includes('--generate'),
		prepareSources: argv.includes('--prepare-sources'),
		force: argv.includes('--force'),
		allowReviewWithheld: argv.includes('--allow-review-withheld'),
		repairFrom: value('repair-from'),
		catalog: value('catalog', 'data/curricula/curriculum-catalog.json'),
		sourcePlan: value(
			'source-plan',
			'data/study-cards/english-literature/ocr-j352-source-plan.json'
		),
		sourceHashLock: value('source-hash-lock'),
		existingArtifact: value('existing-artifact'),
		releaseId: value('release-id', 'ocr-j352-literature-standard-v1'),
		workDir: value('work-dir'),
		model: value('model', ENGLISH_LITERATURE_MODEL),
		thinkingLevel: value('thinking-level', ENGLISH_LITERATURE_THINKING_LEVEL),
		timeoutMs: integer('timeout-ms', 3_600_000, 60_000, 14_400_000),
		sourceTimeoutMs: integer('source-timeout-ms', 45_000, 5_000, 180_000)
	};
}

function usage() {
	return `Usage:
node scripts/generate-english-literature-study-deck.mjs [--prepare-sources|--generate] \\
  [--release-id=<new-release-id>] [--force]
node scripts/generate-english-literature-study-deck.mjs --repair-from=<preserved-failed-run> \\
  [--generate] [--release-id=<failed-release-id>] [--force]

Default: validate the complete 19-option rights/coverage plan without network or model use.
--prepare-sources: download and verify exact evidence anchors, but do not call a model.
--generate: run a ${ENGLISH_LITERATURE_MODEL}/${ENGLISH_LITERATURE_THINKING_LEVEL} generator and a separate independent reviewer, then write the standard-study-deck-v1 artifact.
--source-hash-lock: fail before model use if any selected source differs from a passed master preflight artifact.
--existing-artifact: supply an accepted deck as additive duplicate-review context without changing it.
--repair-from: validate the preserved 66/67 v2 trace; with --generate, repair only its rejected Macbeth card and record supplemental run provenance.`;
}

function choiceSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['key', 'text', 'isCorrect', 'feedback', 'misconception'],
		properties: {
			key: { type: 'string' },
			text: { type: 'string' },
			isCorrect: { type: 'boolean' },
			feedback: { type: 'string' },
			misconception: { type: ['string', 'null'] }
		}
	};
}

function buildGenerationSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['cards'],
		properties: {
			cards: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: [
						'evidenceId',
						'id',
						'conceptKey',
						'topicComponentId',
						'kind',
						'visualCue',
						'front',
						'back',
						'reverseFront',
						'reverseBack',
						'explanation',
						'memoryTip',
						'choices',
						'sourceExcerpt'
					],
					properties: {
						evidenceId: { type: 'string' },
						id: { type: 'string' },
						conceptKey: { type: 'string' },
						topicComponentId: { type: 'string' },
						kind: { type: 'string', enum: ENGLISH_LITERATURE_MODES },
						visualCue: { type: 'string', enum: ENGLISH_LITERATURE_CUES },
						front: { type: 'string' },
						back: { type: 'string' },
						reverseFront: { type: ['string', 'null'] },
						reverseBack: { type: ['string', 'null'] },
						explanation: { type: 'string' },
						memoryTip: { type: 'string' },
						choices: { type: 'array', minItems: 3, maxItems: 4, items: choiceSchema() },
						sourceExcerpt: { type: 'string' }
					}
				}
			}
		}
	};
}

function buildReviewSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['reviews'],
		properties: {
			reviews: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['cardId', 'accepted', 'issues', 'learnerValue'],
					properties: {
						cardId: { type: 'string' },
						accepted: { type: 'boolean' },
						issues: { type: 'array', items: { type: 'string' } },
						learnerValue: { type: 'array', items: { type: 'string' } }
					}
				}
			}
		}
	};
}
