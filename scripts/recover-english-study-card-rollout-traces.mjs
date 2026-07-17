#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Historical JSONL and missing trace files are validated at runtime.

import { createHash } from 'node:crypto';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
	expectedStudyCardArtifactRelativePath,
	hashStudyCardArtifact,
	validateStudyCardBundle
} from './lib/study-card-artifact.mjs';
import {
	coverageModes,
	englishLiteratureCoverageMatrix,
	sha256 as literatureSha256,
	sourceManifestValue,
	stableJson,
	validateEnglishLiteratureSourcePlan
} from './lib/english-literature-study-deck.mjs';

const MODEL = 'gpt-5.6-sol';
const THINKING_LEVEL = 'max';
const LITERATURE_RELEASE_ID = 'ocr-j352-literature-standard-v1';
const LITERATURE_ARTIFACT_HASH = 'f315f85ca91f288668a3ff54404bc4d52646cd9a7afb647b95df9c08e0fbdb84';
const LANGUAGE_HISTORICAL_ID = 'ocr-english-language-j351-standard-v1';
const LANGUAGE_RECOVERY_ID = `${LANGUAGE_HISTORICAL_ID}-rollout-recovered-v1`;
const LANGUAGE_HISTORICAL_HASH = '04daae417aabeb65fd487d2f5fea95dc2173c7ee35455278a8909d645db2c420';
const LITERATURE_UNPROMPTED_SOURCE_HASHES = Object.freeze({
	'ocr-love-poetry-current-teacher-guide':
		'2140bf1093dfddda5bd0fe9c0bf596d82d5aefb490c15591d2c3b2c0ab7f9174',
	'ocr-conflict-poetry-current-teacher-guide':
		'742e786355ac2f7b9a98ea17d04013179bf70bdc7f83ef3d60d2b64697d38559',
	'ocr-youth-poetry-current-teacher-guide':
		'4dfcd9fac234d5ed39966914e8f54c0c9d949e15d61c8c1f58c718167bf765ea'
});

const literatureRuns = {
	generation: '019f6baa-297d-74c0-8469-8323535348c2',
	review: '019f6bb6-db0a-76a3-bccb-e95bd910a0d8',
	rejectedRepairGeneration: '019f6bc7-dc4d-7a82-8940-990aeb6a23b4',
	rejectedRepairReview: '019f6bc8-14e7-73a3-9966-0184c9d1ff8a',
	acceptedRepairGeneration: '019f6bcb-adfe-7291-ba02-8558a717aacc',
	acceptedRepairReview: '019f6bcc-5a18-76f3-9867-b6f7c0f814a5'
};

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
const sessionRoot = path.resolve(
	args.sessionRoot ?? path.join(os.homedir(), '.codex/sessions/2026/07/16')
);
const catalog = readJson(path.join(rootDir, 'data/curricula/curriculum-catalog.json'));

const literature = recoverLiteratureTrace();
const language = recoverLanguageArtifact();

console.log(JSON.stringify({ status: 'recovered', literature, language }, null, 2));

function recoverLiteratureTrace() {
	const releaseDir = path.join(rootDir, 'data/study-cards/releases', LITERATURE_RELEASE_ID);
	const artifactPath = path.join(releaseDir, 'accepted-study-cards.json');
	const artifact = readJson(artifactPath);
	const validated = validateStudyCardBundle(artifact);
	const artifactHash = hashStudyCardArtifact(validated);
	if (artifactHash !== LITERATURE_ARTIFACT_HASH) {
		throw new Error(
			`Literature artifact identity drifted: ${artifactHash} != ${LITERATURE_ARTIFACT_HASH}.`
		);
	}
	if (validated.cards.length !== 67 || validated.coverage.length !== 19) {
		throw new Error('Literature accepted identity must contain 67 cards and 19 coverage rows.');
	}

	const generation = loadSession(literatureRuns.generation, '/generation');
	const review = loadSession(literatureRuns.review, '/review');
	const rejectedRepairGeneration = loadSession(
		literatureRuns.rejectedRepairGeneration,
		'/repair-generation'
	);
	const rejectedRepairReview = loadSession(literatureRuns.rejectedRepairReview, '/repair-review');
	const acceptedRepairGeneration = loadSession(
		literatureRuns.acceptedRepairGeneration,
		'/repair-generation'
	);
	const acceptedRepairReview = loadSession(literatureRuns.acceptedRepairReview, '/repair-review');
	const sessions = [
		generation,
		review,
		rejectedRepairGeneration,
		rejectedRepairReview,
		acceptedRepairGeneration,
		acceptedRepairReview
	];
	for (const session of sessions) {
		if (!session.cwd.includes('/ocr-j352-literature-standard-v1')) {
			throw new Error(`${session.runId} is not an OCR J352 standard-deck trace.`);
		}
	}

	const candidates = generation.output;
	const reviews = review.output;
	assertReviewMatches(reviews, candidates.cards, 'Literature base');
	if (
		candidates.cards.length !== 67 ||
		reviews.reviews.filter((row) => row.accepted).length !== 66
	) {
		throw new Error('Literature base trace must preserve the reviewed 66/67 split.');
	}
	const rejected = candidates.cards.flatMap((card, index) =>
		reviews.reviews[index].accepted ? [] : [{ card, review: reviews.reviews[index] }]
	);
	if (rejected.length !== 1 || rejected[0].card.id !== 'ocr-j352-card-macbeth-plot-murder-sleep') {
		throw new Error('Literature base rejection is not the pinned Macbeth card.');
	}
	assertSingleRepair(
		rejectedRepairGeneration,
		rejectedRepairReview,
		false,
		'Literature first repair'
	);
	assertSingleRepair(
		acceptedRepairGeneration,
		acceptedRepairReview,
		true,
		'Literature accepted repair'
	);
	const replacement = acceptedRepairGeneration.output.cards[0];
	const mergedCandidates = {
		cards: candidates.cards.map((card) => (card.id === replacement.id ? replacement : card))
	};
	if (new Set(mergedCandidates.cards.map((card) => card.id)).size !== 67) {
		throw new Error('Literature merged trace has duplicate identities.');
	}

	const sourcePlanPath = path.join(
		rootDir,
		'data/study-cards/english-literature/ocr-j352-source-plan.json'
	);
	const sourcePlanInput = readJson(sourcePlanPath);
	const sourcePlan = validateEnglishLiteratureSourcePlan(sourcePlanInput, catalog);
	const promptScope = parseTrailingJson(generation.prompt, 'Official scope:\n');
	const prepared = reconstructPreparedEvidence(sourcePlan, promptScope);
	const sourceEvidence = {
		recoveredFromRolloutRunId: generation.runId,
		officialSpecification: promptScope.specification,
		offering: promptScope.offering,
		sourceManifest: sourceManifestValue(prepared)
	};
	const sourceManifestHash = literatureSha256(
		stableJson({
			officialSpecification: sourceEvidence.officialSpecification,
			offering: sourceEvidence.offering,
			sourceManifest: sourceEvidence.sourceManifest
		})
	);
	if (sourceManifestHash !== artifact.release.sourceManifestHash) {
		throw new Error(
			`Literature source manifest recovery drifted: ${sourceManifestHash} != ${artifact.release.sourceManifestHash}.`
		);
	}
	const plan = {
		schemaVersion: 'standard-study-deck-v1',
		promptVersion: artifact.release.promptVersion,
		releaseId: LITERATURE_RELEASE_ID,
		specificationId: sourcePlan.specificationId,
		offeringId: sourcePlan.offeringId,
		model: MODEL,
		thinkingLevel: THINKING_LEVEL,
		topicCount: sourcePlan.topics.length,
		expectedCardCount: candidates.cards.length,
		coverage: summarizeCoverage(sourcePlan),
		recovery: 'reconstructed from the exact generator prompt and accepted source plan'
	};
	const repairPlan = {
		schemaVersion: 'standard-study-deck-v1',
		status: 'accepted_recovered_trace',
		releaseId: LITERATURE_RELEASE_ID,
		basePromptVersion: artifact.release.promptVersion,
		repairPromptVersion: artifact.release.supplementalRuns[0].promptVersion,
		targetEvidenceId: 'macbeth-plot-murder-sleep',
		targetCardId: replacement.id,
		baseAcceptedCardCount: 66,
		mergedCardCount: 67,
		baseGeneratorRunId: generation.runId,
		baseReviewerRunId: review.runId,
		model: MODEL,
		thinkingLevel: THINKING_LEVEL,
		rejectedAttemptRunIds: {
			generator: rejectedRepairGeneration.runId,
			reviewer: rejectedRepairReview.runId
		}
	};
	const modeMatrix = buildModeMatrix(sourcePlan, mergedCandidates.cards);

	writeJson(path.join(releaseDir, 'base-plan.json'), plan);
	copyFileSync(sourcePlanPath, path.join(releaseDir, 'source-plan.json'));
	writeJson(path.join(releaseDir, 'source-evidence.json'), sourceEvidence);
	writeText(path.join(releaseDir, 'base-generation-prompt.txt'), generation.prompt);
	writeJson(path.join(releaseDir, 'base-generation-model-output.json'), candidates);
	writeJson(path.join(releaseDir, 'base-candidate-cards.json'), candidates);
	writeText(path.join(releaseDir, 'base-review-prompt.txt'), review.prompt);
	writeJson(path.join(releaseDir, 'base-review-model-output.json'), reviews);
	writeJson(path.join(releaseDir, 'base-review.json'), reviews);
	writeJson(path.join(releaseDir, 'base-rejected-cards.json'), { cards: rejected });
	writeJson(path.join(releaseDir, 'repair-plan.json'), repairPlan);
	writeText(path.join(releaseDir, 'repair-generation-prompt.txt'), acceptedRepairGeneration.prompt);
	writeJson(
		path.join(releaseDir, 'repair-generation-model-output.json'),
		acceptedRepairGeneration.output
	);
	writeJson(path.join(releaseDir, 'repair-candidate-card.json'), {
		cards: [replacement]
	});
	writeText(path.join(releaseDir, 'repair-review-prompt.txt'), acceptedRepairReview.prompt);
	writeJson(path.join(releaseDir, 'repair-review-model-output.json'), acceptedRepairReview.output);
	writeJson(path.join(releaseDir, 'repair-review.json'), acceptedRepairReview.output);
	writeJson(path.join(releaseDir, 'merged-candidate-cards.json'), mergedCandidates);
	writeJson(path.join(releaseDir, 'coverage-mode-matrix.json'), { matrix: modeMatrix });

	writeText(
		path.join(releaseDir, 'rejected-repair-attempt-1-generation-prompt.txt'),
		rejectedRepairGeneration.prompt
	);
	writeJson(
		path.join(releaseDir, 'rejected-repair-attempt-1-generation-model-output.json'),
		rejectedRepairGeneration.output
	);
	writeText(
		path.join(releaseDir, 'rejected-repair-attempt-1-review-prompt.txt'),
		rejectedRepairReview.prompt
	);
	writeJson(
		path.join(releaseDir, 'rejected-repair-attempt-1-review-model-output.json'),
		rejectedRepairReview.output
	);
	writeJson(
		path.join(releaseDir, 'rejected-repair-attempt-1-review.json'),
		rejectedRepairReview.output
	);

	const traceSessions = [
		['base-generation', generation],
		['base-review', review],
		['rejected-repair-attempt-1-generation', rejectedRepairGeneration],
		['rejected-repair-attempt-1-review', rejectedRepairReview],
		['repair-generation', acceptedRepairGeneration],
		['repair-review', acceptedRepairReview]
	];
	for (const [prefix, session] of traceSessions) {
		writeJson(path.join(releaseDir, `${prefix}-codex-run-summary.json`), recoveredSummary(session));
	}
	const evidence = {
		schemaVersion: 'english-literature-base-trace-recovery-v1',
		status: 'content_addressed_trace_recovered',
		releaseId: LITERATURE_RELEASE_ID,
		artifactHash,
		acceptedArtifactSha256: sha256(readFileSync(artifactPath)),
		artifactIdentityVerified: true,
		acceptedCards: 67,
		baseAcceptedCards: 66,
		baseRejectedCards: 1,
		rejectedRepairAttempts: 1,
		acceptedRepairAttempts: 1,
		modelCallsDuringRecovery: 0,
		sourceManifestHash,
		sessions: Object.fromEntries(
			traceSessions.map(([prefix, session]) => [
				prefix,
				sessionEvidence(session, releaseDir, prefix)
			])
		)
	};
	writeJson(path.join(releaseDir, 'trace-recovery-evidence.json'), evidence);
	writeJson(path.join(releaseDir, 'generation-run.json'), {
		status: 'accepted_after_targeted_card_repair',
		plan: repairPlan,
		base: {
			generatorRunId: generation.runId,
			reviewerRunId: review.runId,
			accepted: 66,
			rejected: 1
		},
		repair: {
			generatorRunId: acceptedRepairGeneration.runId,
			reviewerRunId: acceptedRepairReview.runId,
			cardId: replacement.id,
			accepted: true
		},
		counts: {
			published: 67,
			readyTopicRows: validated.coverage.filter((row) => row.status === 'ready').length,
			withheldTopicRows: validated.coverage.filter((row) => row.status === 'withheld').length,
			readyModeRows: modeMatrix.filter((row) => row.status === 'ready').length,
			withheldModeRows: modeMatrix.filter((row) => row.status === 'withheld').length
		},
		artifactPath: artifact.release.artifactPath,
		artifactHash,
		sourceManifestHash,
		modelUsage: {
			baseGenerator: recoveredSummary(generation).usage,
			baseReviewer: recoveredSummary(review).usage,
			repairGenerator: recoveredSummary(acceptedRepairGeneration).usage,
			repairReviewer: recoveredSummary(acceptedRepairReview).usage
		},
		recovery: {
			modelCalls: 0,
			firstRejectedRepairPreserved: true,
			evidencePath:
				'data/study-cards/releases/ocr-j352-literature-standard-v1/trace-recovery-evidence.json'
		}
	});
	return {
		releaseId: LITERATURE_RELEASE_ID,
		artifactHash,
		cards: 67,
		coverage: 19,
		traceSessions: traceSessions.length
	};
}

function recoverLanguageArtifact() {
	const historicalDir = path.join(rootDir, 'data/study-cards/releases', LANGUAGE_HISTORICAL_ID);
	const recoveredDir = path.join(rootDir, 'data/study-cards/releases', LANGUAGE_RECOVERY_ID);
	if (!existsSync(historicalDir)) {
		if (!existsSync(recoveredDir)) {
			throw new Error('English Language historical reconstruction trace is missing.');
		}
		const existing = validateStudyCardBundle(
			readJson(path.join(recoveredDir, 'accepted-study-cards.json'))
		);
		return {
			releaseId: existing.release.id,
			artifactHash: hashStudyCardArtifact(existing),
			cards: existing.cards.length,
			status: 'already_recovered'
		};
	}
	const historicalBundle = readJson(path.join(historicalDir, 'accepted-study-cards.json'));
	const validatedHistorical = validateStudyCardBundle(historicalBundle);
	const reconstructedHistoricalHash = hashStudyCardArtifact(validatedHistorical);
	if (reconstructedHistoricalHash === LANGUAGE_HISTORICAL_HASH) {
		throw new Error(
			'English Language unexpectedly matches the historical hash; preserve the authoritative id instead.'
		);
	}
	if (validatedHistorical.cards.length !== 8 || validatedHistorical.coverage.length !== 2) {
		throw new Error('English Language reconstruction must contain 8 cards and 2 coverage rows.');
	}
	if (existsSync(recoveredDir)) {
		if (!args.force)
			throw new Error(`English Language recovery already exists at ${recoveredDir}.`);
		rmSync(recoveredDir, { recursive: true, force: true });
	}
	mkdirSync(recoveredDir, { recursive: true });
	const reconstructedRuns = Object.fromEntries(
		['generation', 'review'].map((stage) => {
			const rolloutPath = path.join(historicalDir, `${stage}-rollout-source.jsonl`);
			const promptPath = path.join(historicalDir, `${stage}-prompt.txt`);
			const outputPath = path.join(historicalDir, `${stage}-model-output.json`);
			const summaryPath = path.join(historicalDir, `${stage}-codex-run-summary.json`);
			const summary = readJson(summaryPath);
			return [
				stage,
				{
					runId: summary.threadId,
					jsonlFileName: path.basename(rolloutPath),
					eventStreamSha256: sha256(readFileSync(rolloutPath)),
					sanitizedEventCount: countJsonlRows(rolloutPath),
					promptSha256: sha256(readFileSync(promptPath)),
					modelOutputSha256: sha256(readFileSync(outputPath)),
					summarySha256: sha256(readFileSync(summaryPath))
				}
			];
		})
	);
	for (const name of readdirSync(historicalDir)) {
		if (
			name.endsWith('.jsonl') ||
			[
				'accepted-study-cards.json',
				'generation-run.json',
				'plan.json',
				'source-evidence.json'
			].includes(name)
		) {
			continue;
		}
		copyFileSync(path.join(historicalDir, name), path.join(recoveredDir, name));
	}
	copyFileSync(
		path.join(historicalDir, 'plan.json'),
		path.join(recoveredDir, 'historical-plan.json')
	);
	copyFileSync(
		path.join(historicalDir, 'source-evidence.json'),
		path.join(recoveredDir, 'historical-source-evidence.json')
	);

	const bundle = structuredClone(historicalBundle);
	bundle.release.id = LANGUAGE_RECOVERY_ID;
	bundle.release.artifactPath = expectedStudyCardArtifactRelativePath(LANGUAGE_RECOVERY_ID);
	const validated = validateStudyCardBundle(bundle);
	const artifactHash = hashStudyCardArtifact(validated);
	writeJson(path.join(recoveredDir, 'accepted-study-cards.json'), bundle);
	writeJson(path.join(recoveredDir, 'plan.json'), {
		schemaVersion: 'standard-study-deck-v1',
		status: 'rollout_reconstruction',
		releaseId: LANGUAGE_RECOVERY_ID,
		historicalReleaseId: LANGUAGE_HISTORICAL_ID,
		promptVersion: bundle.release.promptVersion,
		generatorRunId: bundle.release.generator.runId,
		reviewerRunId: bundle.release.reviewer.runId,
		model: MODEL,
		thinkingLevel: THINKING_LEVEL,
		cards: bundle.cards.length,
		coverageRows: bundle.coverage.length
	});
	writeJson(path.join(recoveredDir, 'recovery-evidence.json'), {
		schemaVersion: 'english-language-rollout-recovery-v1',
		status: 'reviewed_content_recovered_under_new_identity',
		historicalReleaseId: LANGUAGE_HISTORICAL_ID,
		historicalArtifactHash: LANGUAGE_HISTORICAL_HASH,
		reconstructedHistoricalIdArtifactHash: reconstructedHistoricalHash,
		hashMismatchConfirmed: true,
		recoveredReleaseId: LANGUAGE_RECOVERY_ID,
		recoveredArtifactHash: artifactHash,
		identityPolicy:
			'The missing historical wrapper is not substituted. The exact recovered generator/reviewer content is bound to an explicit new release id.',
		generatorRunId: bundle.release.generator.runId,
		reviewerRunId: bundle.release.reviewer.runId,
		runs: reconstructedRuns,
		acceptedArtifactSha256: sha256(
			readFileSync(path.join(recoveredDir, 'accepted-study-cards.json'))
		),
		modelCallsDuringRecovery: 0
	});
	writeJson(path.join(recoveredDir, 'generation-run.json'), {
		status: 'accepted_rollout_recovery',
		counts: {
			generated: 8,
			accepted: 8,
			rejectedByReviewer: 0,
			readyCoverageRows: 2,
			withheldCoverageRows: 0
		},
		artifactPath: bundle.release.artifactPath,
		artifactHash,
		recovery: {
			historicalReleaseId: LANGUAGE_HISTORICAL_ID,
			historicalArtifactHash: LANGUAGE_HISTORICAL_HASH,
			reconstructedHistoricalIdArtifactHash: reconstructedHistoricalHash,
			modelCalls: 0
		}
	});
	const check = validateStudyCardBundle(
		readJson(path.join(recoveredDir, 'accepted-study-cards.json'))
	);
	if (hashStudyCardArtifact(check) !== artifactHash) {
		throw new Error('English Language recovered artifact failed its write verification.');
	}
	rmSync(historicalDir, { recursive: true, force: true });
	return {
		releaseId: LANGUAGE_RECOVERY_ID,
		artifactHash,
		cards: 8,
		coverage: 2,
		historicalArtifactHash: LANGUAGE_HISTORICAL_HASH,
		reconstructedHistoricalIdArtifactHash: reconstructedHistoricalHash,
		status: 'recovered_under_explicit_new_identity'
	};
}

function reconstructPreparedEvidence(sourcePlan, promptScope) {
	const promptTopicById = new Map(
		promptScope.topics.map((topic) => [topic.topicComponentId, topic])
	);
	return {
		schemaVersion: sourcePlan.schemaVersion,
		specificationId: sourcePlan.specificationId,
		offeringId: sourcePlan.offeringId,
		topics: sourcePlan.topics.map((topic) => {
			const promptTopic = promptTopicById.get(topic.topicComponentId);
			if (!promptTopic) throw new Error(`Generator prompt is missing ${topic.topicComponentId}.`);
			const promptSourceById = new Map(
				promptTopic.evidence.map((row) => [row.source.id, row.source])
			);
			return {
				...topic,
				sources: topic.sources.map((source) => {
					const recovered = promptSourceById.get(source.id);
					const sourceHash =
						recovered?.sourceHash ?? LITERATURE_UNPROMPTED_SOURCE_HASHES[source.id];
					if (!sourceHash) {
						throw new Error(`Generator prompt is missing source ${source.id}.`);
					}
					return { ...source, sourceHash };
				}),
				evidence: promptTopic.evidence.map((row) => ({
					id: row.evidenceId,
					mode: row.mode,
					topicComponentId: topic.topicComponentId,
					sourceId: row.source.id,
					locator: row.locator,
					requiredAnswer: row.requiredAnswer,
					excerpt: row.excerpt,
					source: row.source
				}))
			};
		})
	};
}

function buildModeMatrix(sourcePlan, acceptedCards) {
	const acceptedByEvidence = new Map(acceptedCards.map((card) => [card.evidenceId, card]));
	return sourcePlan.topics.flatMap((topic) =>
		coverageModes(topic.coverage).map((mode) => {
			const planned = topic.coverage[mode];
			const acceptedCount = topic.evidence.filter(
				(row) => row.mode === mode && acceptedByEvidence.has(row.id)
			).length;
			if (planned.status === 'withheld') {
				return {
					offeringId: sourcePlan.offeringId,
					topicComponentId: topic.topicComponentId,
					topicTitle: topic.title,
					mode,
					status: 'withheld',
					cardCount: acceptedCount,
					reason: planned.reason
				};
			}
			const ready = acceptedCount === planned.expectedCardCount;
			return {
				offeringId: sourcePlan.offeringId,
				topicComponentId: topic.topicComponentId,
				topicTitle: topic.title,
				mode,
				status: ready ? 'ready' : 'withheld',
				cardCount: ready ? acceptedCount : 0,
				reason: ready
					? null
					: `Only ${acceptedCount} of ${planned.expectedCardCount} ${mode} cards passed independent review.`
			};
		})
	);
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

function assertSingleRepair(generation, review, accepted, label) {
	if (generation.output?.cards?.length !== 1) throw new Error(`${label} needs one card.`);
	assertReviewMatches(review.output, generation.output.cards, label);
	if (review.output.reviews[0].accepted !== accepted) {
		throw new Error(`${label} acceptance decision drifted.`);
	}
}

function assertReviewMatches(output, cards, label) {
	if (!Array.isArray(output?.reviews) || output.reviews.length !== cards.length) {
		throw new Error(`${label} review cardinality mismatch.`);
	}
	for (const [index, row] of output.reviews.entries()) {
		if (row.cardId !== cards[index].id || typeof row.accepted !== 'boolean') {
			throw new Error(`${label} review identity mismatch at ${index}.`);
		}
	}
}

function parseTrailingJson(prompt, marker) {
	const index = prompt.indexOf(marker);
	if (index < 0) throw new Error(`Prompt marker ${marker.trim()} is absent.`);
	return JSON.parse(prompt.slice(index + marker.length));
}

function loadSession(runId, expectedSuffix) {
	const fileName = readdirSync(sessionRoot).find((name) => name.endsWith(`-${runId}.jsonl`));
	if (!fileName) throw new Error(`Rollout JSONL is missing for ${runId}.`);
	const filePath = path.join(sessionRoot, fileName);
	const raw = readFileSync(filePath, 'utf8');
	const rows = raw
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
	const meta = rows.find((row) => row.type === 'session_meta')?.payload;
	const complete = rows
		.filter((row) => row.type === 'event_msg' && row.payload?.type === 'task_complete')
		.at(-1);
	if (!meta || !complete?.payload?.last_agent_message) {
		throw new Error(`${fileName} lacks completed session evidence.`);
	}
	if (!String(meta.cwd).endsWith(expectedSuffix)) {
		throw new Error(`${runId} expected ${expectedSuffix}, found ${meta.cwd}.`);
	}
	const prompt = modelPrompt(rows);
	return {
		runId,
		filePath,
		fileHash: sha256(raw),
		rows,
		cwd: meta.cwd,
		startedAt: rows[0].timestamp,
		finishedAt: complete.timestamp,
		prompt,
		promptHash: sha256(prompt),
		outputText: complete.payload.last_agent_message,
		outputHash: sha256(complete.payload.last_agent_message),
		output: parseModelJson(complete.payload.last_agent_message)
	};
}

function modelPrompt(rows) {
	const prompts = rows
		.filter(
			(row) =>
				row.type === 'response_item' &&
				row.payload?.type === 'message' &&
				row.payload.role === 'user'
		)
		.map((row) => row.payload.content.map((part) => part.text ?? part.input_text ?? '').join(''));
	const prompt = prompts.at(-1);
	if (!prompt) throw new Error('Model prompt is absent from rollout JSONL.');
	return prompt;
}

function recoveredSummary(session) {
	const token = [...session.rows]
		.reverse()
		.find((row) => row.type === 'event_msg' && row.payload?.type === 'token_count');
	return {
		status: 'passed',
		error: null,
		threadId: session.runId,
		model: MODEL,
		thinkingLevel: THINKING_LEVEL,
		workDir: session.cwd,
		startedAt: session.startedAt,
		finishedAt: session.finishedAt,
		durationSeconds: Number(
			((Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / 1000).toFixed(3)
		),
		events: session.rows.length,
		commandActions: 0,
		failedCommandActions: 0,
		agentMessages: 1,
		reasoningSummaries: session.rows.filter(
			(row) => row.type === 'response_item' && row.payload?.type === 'reasoning'
		).length,
		webSearches: 0,
		fileChanges: 0,
		usage: token?.payload?.info?.total_token_usage ?? null,
		failedCommands: [],
		recovery: 'summary reconstructed from preserved rollout JSONL boundaries and token counts'
	};
}

function sessionEvidence(session, releaseDir, prefix) {
	const promptPath = path.join(releaseDir, `${prefix}-prompt.txt`);
	const outputPath = path.join(releaseDir, `${prefix}-model-output.json`);
	const summaryPath = path.join(releaseDir, `${prefix}-codex-run-summary.json`);
	return {
		runId: session.runId,
		jsonlFileName: path.basename(session.filePath),
		eventStreamSha256: session.fileHash,
		sanitizedEventCount: session.rows.length,
		startedAt: session.startedAt,
		finishedAt: session.finishedAt,
		promptSha256: sha256(readFileSync(promptPath)),
		modelOutputSha256: sha256(readFileSync(outputPath)),
		summarySha256: sha256(readFileSync(summaryPath))
	};
}

function countJsonlRows(filePath) {
	const rows = readFileSync(filePath, 'utf8')
		.split(/\r?\n/)
		.filter((row) => row.trim());
	for (const row of rows) JSON.parse(row);
	if (!rows.length) throw new Error(`${filePath} has no JSONL rows.`);
	return rows.length;
}

function parseModelJson(value) {
	const trimmed = String(value ?? '').trim();
	const unwrapped = trimmed.startsWith('```')
		? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
		: trimmed;
	return JSON.parse(unwrapped);
}

function parseArgs(argv) {
	const value = (name) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
	return { force: argv.includes('--force'), sessionRoot: value('session-root') };
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${String(value).replace(/\n$/, '')}\n`);
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
