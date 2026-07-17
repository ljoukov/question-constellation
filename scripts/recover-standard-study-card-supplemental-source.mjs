#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import { hashStudyCardArtifact, validateStudyCardBundle } from './lib/study-card-artifact.mjs';
import {
	standardStudyCardMemoryTipIssue,
	standardStudyCardSourceExcerptIssue
} from './lib/standard-study-card-compiler.mjs';
import {
	sha256,
	stableStringify,
	supplementalRecoveryModelGate,
	validateSupplementalRecoveryPlan,
	validateSupplementalReplacementCard
} from './lib/standard-study-card-supplemental-recovery.mjs';

const rootDir = process.cwd();
loadDefaultEnv(rootDir);
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}

const planPath = path.resolve(args.plan);
const plan = validateSupplementalRecoveryPlan(readJson(planPath));
const prepared = prepareRecovery(plan, {
	baseWorkDir: args.baseWorkDir ? path.resolve(args.baseWorkDir) : path.resolve(plan.baseWorkDir)
});
if (!args.generate) {
	console.log(
		JSON.stringify(
			{
				status: 'ready_no_model',
				wouldLaunchModel: false,
				recoveryId: plan.recoveryId,
				batchId: plan.batchId,
				planPath: path.relative(rootDir, planPath),
				planHash: prepared.planHash,
				baseTrace: {
					workDir: path.relative(rootDir, prepared.baseDir),
					manifestHash: prepared.baseTraceManifestHash,
					candidateCount: prepared.baseCandidates.cards.length,
					acceptedCardsPreserved: prepared.acceptedIndexes.length,
					rejectedCardsToRepair: prepared.rejectedIndexes.length,
					generatorRunId: prepared.generationSummary.threadId,
					reviewerRunId: prepared.reviewSummary.threadId
				},
				supplementalSources: prepared.sources.map((source) => ({
					id: source.id,
					kind: source.kind,
					url: source.url,
					sha256: source.sha256,
					pdfPage: source.pdfPage,
					pageTextSha256: source.pageTextSha256,
					locator: source.locator,
					excerpt: source.excerpt
				})),
				modelGate: {
					queueTerminal: prepared.queueGate.terminal,
					queueFinishedAt: prepared.queueGate.finishedAt,
					explicitConfirmationRequired: `--confirm-recovery=${plan.recoveryId}`
				},
				queueReuseGuard: {
					artifactPath: plan.artifactPath,
					sameBatchIdentity: true,
					freshCoveragePlanningExcludesItsTargets: true,
					existingQueueJobDisposition: 'immutable-artifact-reuse'
				}
			},
			null,
			2
		)
	);
	process.exit(0);
}

supplementalRecoveryModelGate({
	generate: args.generate,
	confirmRecovery: args.confirmRecovery,
	recoveryId: plan.recoveryId,
	queueTerminal: prepared.queueGate.terminal,
	activeJobCount: prepared.queueGate.activeJobCount
});

const workDir = path.resolve(args.workDir ?? `tmp/study-card-generation/${plan.recoveryId}`);
const artifactPath = path.resolve(plan.artifactPath);
const artifactDir = path.dirname(artifactPath);
if (existsSync(workDir)) {
	throw new Error(
		`Recovery work directory already exists; preserve it and inspect before retrying: ${path.relative(rootDir, workDir)}`
	);
}
if (existsSync(artifactDir)) {
	throw new Error(
		`Immutable artifact directory already exists: ${path.relative(rootDir, artifactDir)}`
	);
}
mkdirSync(workDir, { recursive: true });
writeJson(path.join(workDir, 'recovery-plan.json'), plan);
writeJson(path.join(workDir, 'base-trace-manifest.json'), prepared.baseTraceManifest);
writeJson(path.join(workDir, 'supplemental-source-evidence.json'), sourceEvidence(prepared));

const generationPrompt = buildGenerationPrompt(prepared);
writeFileSync(path.join(workDir, 'generation-prompt.txt'), `${generationPrompt}\n`);
const generation = await runStage({
	name: 'generation',
	prompt: generationPrompt,
	outputSchema: generationSchema(),
	workDir,
	plan,
	timeoutMs: args.timeoutMs
});
writeFileSync(path.join(workDir, 'generation-model-output.json'), `${generation.finalResponse}\n`);
const generated = parseOutput(generation.finalResponse);
if (!Array.isArray(generated.cards) || generated.cards.length !== 1) {
	throw new Error('Supplemental recovery generator must return exactly one card.');
}
const replacement = validateSupplementalReplacementCard(generated.cards[0], plan);
writeJson(path.join(workDir, 'replacement-card.json'), { cards: [replacement] });

const reviewPrompt = buildReviewPrompt(prepared, replacement);
writeFileSync(path.join(workDir, 'review-prompt.txt'), `${reviewPrompt}\n`);
const review = await runStage({
	name: 'review',
	prompt: reviewPrompt,
	outputSchema: reviewSchema(),
	workDir,
	plan,
	timeoutMs: args.timeoutMs
});
writeFileSync(path.join(workDir, 'review-model-output.json'), `${review.finalResponse}\n`);
const replacementReview = validateReplacementReview(
	parseOutput(review.finalResponse),
	replacement.id
);
writeJson(path.join(workDir, 'review.json'), replacementReview);
if (generation.threadId === review.threadId) {
	throw new Error('Supplemental generator and reviewer must be independent model turns.');
}
if (!replacementReview.reviews[0].accepted) {
	writeJson(path.join(workDir, 'rejected-cards.json'), {
		cards: [
			{
				stage: 'supplemental-source-independent-review',
				card: replacement,
				review: replacementReview.reviews[0]
			}
		]
	});
	throw new Error(
		'Independent reviewer rejected the supplemental-source replacement; no artifact was written.'
	);
}

const finalCandidates = {
	cards: prepared.baseCandidates.cards.map((card, index) =>
		index === prepared.rejectedIndexes[0] ? replacement : card
	)
};
const finalReview = {
	reviews: prepared.baseReview.reviews.map((entry, index) =>
		index === prepared.rejectedIndexes[0] ? replacementReview.reviews[0] : entry
	)
};
const finishedAt = review.finishedAt;
const coverage = buildCoverage(prepared, finalCandidates.cards);
const sourceManifestHash = sha256(
	stableStringify({
		baseSourceEvidenceHash: plan.baseTraceFiles['source-evidence.json'],
		specification: prepared.baseSourceEvidence.specification,
		offerings: prepared.baseSourceEvidence.offerings,
		topics: prepared.baseSourceEvidence.topics,
		supplementalRecovery: sourceEvidence(prepared)
	})
);
const bundle = {
	schemaVersion: prepared.basePlan.schemaVersion,
	release: {
		id: plan.batchId,
		promptVersion: prepared.basePlan.promptVersion,
		generator: {
			model: prepared.generationSummary.model,
			thinkingLevel: prepared.generationSummary.thinkingLevel,
			runId: prepared.generationSummary.threadId
		},
		reviewer: {
			model: prepared.reviewSummary.model,
			thinkingLevel: prepared.reviewSummary.thinkingLevel,
			runId: prepared.reviewSummary.threadId,
			independentTurn: true
		},
		supplementalRuns: [
			{
				purpose: 'targeted-card-repair',
				promptVersion: plan.promptVersion,
				cardIds: [replacement.id],
				generator: {
					model: generation.model,
					thinkingLevel: generation.thinkingLevel,
					runId: generation.threadId
				},
				reviewer: {
					model: review.model,
					thinkingLevel: review.thinkingLevel,
					runId: review.threadId,
					independentTurn: true
				},
				startedAt: generation.startedAt,
				finishedAt
			}
		],
		startedAt: prepared.generationSummary.startedAt,
		finishedAt,
		sourceManifestHash,
		artifactPath: plan.artifactPath
	},
	cards: finalCandidates.cards.map((card) => bindCard(card, prepared, card.id === replacement.id)),
	coverage
};
const validatedBundle = validateStudyCardBundle(bundle);
const artifactHash = hashStudyCardArtifact(validatedBundle);

writeJson(path.join(workDir, 'final-candidate-cards.json'), finalCandidates);
writeJson(path.join(workDir, 'final-review.json'), finalReview);
writeJson(path.join(workDir, 'accepted-study-cards.json'), bundle);
writeJson(path.join(workDir, 'coverage.json'), { coverage });
writeJson(path.join(workDir, 'rejected-cards.json'), prepared.baseRejectedEvidence);
const generationRun = {
	status: 'accepted',
	mode: 'supplemental-source-review-repair',
	plan: prepared.basePlan,
	recovery: {
		recoveryId: plan.recoveryId,
		promptVersion: plan.promptVersion,
		planHash: prepared.planHash,
		baseTraceManifestHash: prepared.baseTraceManifestHash,
		repairedCardId: replacement.id,
		sourceManifestHash
	},
	run: {
		id: plan.batchId,
		startedAt: prepared.generationSummary.startedAt,
		finishedAt,
		generator: {
			model: prepared.generationSummary.model,
			thinkingLevel: prepared.generationSummary.thinkingLevel,
			threadId: prepared.generationSummary.threadId
		},
		reviewer: {
			model: prepared.reviewSummary.model,
			thinkingLevel: prepared.reviewSummary.thinkingLevel,
			threadId: prepared.reviewSummary.threadId,
			independentTurn: true
		},
		supplementalSourceRecovery: {
			generatorRunId: generation.threadId,
			reviewerRunId: review.threadId,
			independentTurn: true
		}
	},
	counts: {
		generated: prepared.baseCandidates.cards.length,
		preservedAfterOriginalReview: prepared.acceptedIndexes.length,
		supplementalSourceRepairs: 1,
		sentForReview: 1,
		accepted: finalCandidates.cards.length,
		rejectedByReviewer: 0,
		readyCoverageRows: coverage.length,
		withheldCoverageRows: 0
	},
	artifactPath: plan.artifactPath,
	artifactHash,
	modelUsage: {
		generator: prepared.generationSummary.usage,
		reviewer: prepared.reviewSummary.usage,
		supplementalRecoveryGenerator: generation.usage,
		supplementalRecoveryReviewer: review.usage
	}
};
writeJson(path.join(workDir, 'generation-run.json'), generationRun);

mkdirSync(artifactDir, { recursive: true });
copyTree(prepared.baseDir, path.join(artifactDir, 'failed-base-trace'));
for (const name of [
	'recovery-plan.json',
	'base-trace-manifest.json',
	'supplemental-source-evidence.json',
	'generation-prompt.txt',
	'generation-model-output.json',
	'replacement-card.json',
	'review-prompt.txt',
	'review-model-output.json',
	'review.json',
	'final-candidate-cards.json',
	'final-review.json',
	'accepted-study-cards.json',
	'rejected-cards.json',
	'coverage.json',
	'generation-run.json'
]) {
	copyFileSync(path.join(workDir, name), path.join(artifactDir, name));
}
for (const stage of ['generation', 'review']) {
	for (const name of ['events.jsonl', 'last-message.json', 'codex-run-summary.json']) {
		copyFileSync(
			path.join(workDir, stage, name),
			path.join(artifactDir, `supplemental-${stage}-${name}`)
		);
	}
}
copyFileSync(planPath, path.join(artifactDir, 'supplemental-source-plan.json'));
console.log(JSON.stringify(generationRun, null, 2));

function prepareRecovery(plan, { baseWorkDir }) {
	const baseDir = baseWorkDir;
	if (!existsSync(baseDir)) throw new Error(`Preserved base trace is missing: ${baseDir}`);
	for (const [relativeName, expectedHash] of Object.entries(plan.baseTraceFiles)) {
		const filePath = path.join(baseDir, relativeName);
		if (!existsSync(filePath)) throw new Error(`Preserved base trace is missing ${relativeName}.`);
		const actualHash = sha256(readFileSync(filePath));
		if (actualHash !== expectedHash) {
			throw new Error(`Preserved base trace drifted at ${relativeName}: ${actualHash}.`);
		}
	}
	const basePlan = readJson(path.join(baseDir, 'plan.json'));
	const baseSourceEvidence = readJson(path.join(baseDir, 'source-evidence.json'));
	const baseCandidates = readJson(path.join(baseDir, 'candidate-cards.json'));
	const baseReview = readJson(path.join(baseDir, 'review.json'));
	const generationSummary = readJson(path.join(baseDir, 'generation/codex-run-summary.json'));
	const reviewSummary = readJson(path.join(baseDir, 'review/codex-run-summary.json'));
	if (
		basePlan.batchId !== plan.batchId ||
		basePlan.specificationId !== plan.specificationId ||
		basePlan.subject !== plan.subject ||
		basePlan.generationMode !== 'required-descendants'
	) {
		throw new Error('Preserved base plan does not match the supplemental recovery scope.');
	}
	if (stableStringify(baseSourceEvidence.plan) !== stableStringify(basePlan)) {
		throw new Error('Preserved source evidence does not contain the exact base plan.');
	}
	validatePassedSummary(generationSummary, plan, 'generator');
	validatePassedSummary(reviewSummary, plan, 'reviewer');
	if (
		generationSummary.threadId !== plan.expectedBase.generatorRunId ||
		reviewSummary.threadId !== plan.expectedBase.reviewerRunId ||
		generationSummary.threadId === reviewSummary.threadId
	) {
		throw new Error('Preserved generator/reviewer run identity differs from the pinned plan.');
	}
	if (
		!Array.isArray(baseCandidates.cards) ||
		baseCandidates.cards.length !== plan.expectedBase.candidateCount ||
		!Array.isArray(baseReview.reviews) ||
		baseReview.reviews.length !== plan.expectedBase.candidateCount
	) {
		throw new Error('Preserved candidate/review counts differ from the pinned plan.');
	}
	const componentById = new Map(
		baseSourceEvidence.topics.flatMap((topic) =>
			topic.components.map((component) => [component.id, { topic, component }])
		)
	);
	const ids = new Set();
	const concepts = new Set();
	for (const [index, card] of baseCandidates.cards.entries()) {
		const expectedComponentId = basePlan.requiredComponentIds[index];
		if (card.curriculumComponentId !== expectedComponentId) {
			throw new Error(`Preserved candidate ${index} changed required descendant order.`);
		}
		const source = componentById.get(card.curriculumComponentId);
		if (!source || source.topic.topicComponentId !== card.topicComponentId) {
			throw new Error(`Preserved candidate ${card.id} has drifted source mapping.`);
		}
		const sourceIssue = standardStudyCardSourceExcerptIssue(
			source.component.text,
			card.sourceExcerpt
		);
		if (sourceIssue || card.sourceLocator !== source.component.locator) {
			throw new Error(`Preserved candidate ${card.id} no longer has exact official evidence.`);
		}
		const memoryIssue = standardStudyCardMemoryTipIssue(card.memoryTip);
		if (memoryIssue) throw new Error(`Preserved candidate ${card.id}: ${memoryIssue}.`);
		if (ids.has(card.id) || concepts.has(card.conceptKey)) {
			throw new Error('Preserved candidates contain duplicate identity.');
		}
		ids.add(card.id);
		concepts.add(card.conceptKey);
		if (baseReview.reviews[index].cardId !== card.id) {
			throw new Error(`Preserved review order drifted at ${card.id}.`);
		}
	}
	const acceptedIndexes = baseReview.reviews.flatMap((entry, index) =>
		entry.accepted === true ? [index] : []
	);
	const rejectedIndexes = baseReview.reviews.flatMap((entry, index) =>
		entry.accepted === false ? [index] : []
	);
	if (
		acceptedIndexes.length !== plan.expectedBase.acceptedCount ||
		rejectedIndexes.length !== plan.expectedBase.rejectedCount
	) {
		throw new Error('Preserved review acceptance split differs from the pinned plan.');
	}
	const rejectedCard = baseCandidates.cards[rejectedIndexes[0]];
	for (const field of ['id', 'conceptKey', 'topicComponentId', 'curriculumComponentId']) {
		if (rejectedCard[field] !== plan.requiredIdentity[field]) {
			throw new Error(`The only rejected base card is not requiredIdentity.${field}.`);
		}
	}

	const catalog = readJson(path.join(rootDir, 'data/curricula/curriculum-catalog.json'));
	const specification = catalog.specifications.find((entry) => entry.id === plan.specificationId);
	if (!specification) throw new Error(`Catalog specification ${plan.specificationId} is missing.`);
	const offerings = catalog.offerings.filter((entry) => basePlan.offeringIds.includes(entry.id));
	if (offerings.length !== basePlan.offeringIds.length) {
		throw new Error('At least one preserved offering is missing from the current catalog.');
	}
	for (const card of baseCandidates.cards) {
		const collision = findGlobalCollision(card, plan.batchId, specification.board, plan.subject);
		if (collision) throw new Error(collision);
	}

	const sources = plan.sources.map((source) => {
		const filePath = path.resolve(source.localPath);
		if (!existsSync(filePath)) throw new Error(`Pinned source PDF is missing: ${source.localPath}`);
		const pdfHash = sha256(readFileSync(filePath));
		if (pdfHash !== source.sha256) {
			throw new Error(`Pinned source PDF drifted at ${source.localPath}: ${pdfHash}.`);
		}
		const pageText = execFileSync(
			'pdftotext',
			[
				'-f',
				String(source.pdfPage),
				'-l',
				String(source.pdfPage),
				'-raw',
				'-nopgbrk',
				filePath,
				'-'
			],
			{ encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
		);
		const pageTextHash = sha256(pageText);
		if (pageTextHash !== source.pageTextSha256) {
			throw new Error(`Pinned page text drifted for ${source.id}: ${pageTextHash}.`);
		}
		if (!pageText.includes(source.excerpt)) {
			throw new Error(`Pinned exact excerpt is absent from ${source.id}.`);
		}
		return { ...source, pageText };
	});
	const baseTraceManifest = traceManifest(baseDir);
	const baseTraceManifestHash = sha256(stableStringify(baseTraceManifest));
	const queueGate = queueStatus(path.resolve(plan.queueStatePath));
	const baseRejectedEvidence = existsSync(path.join(baseDir, 'rejected-cards.json'))
		? readJson(path.join(baseDir, 'rejected-cards.json'))
		: {
				cards: rejectedIndexes.map((index) => ({
					stage: 'independent-review',
					card: baseCandidates.cards[index],
					review: baseReview.reviews[index]
				}))
			};
	return {
		plan,
		planHash: sha256(readFileSync(planPath)),
		baseDir,
		basePlan,
		baseSourceEvidence,
		baseCandidates,
		baseReview,
		baseRejectedEvidence,
		generationSummary,
		reviewSummary,
		acceptedIndexes,
		rejectedIndexes,
		catalog,
		specification,
		offerings,
		sources,
		baseTraceManifest,
		baseTraceManifestHash,
		queueGate
	};
}

function buildGenerationPrompt(prepared) {
	const originalIndex = prepared.rejectedIndexes[0];
	return `You are repairing exactly one import-grade GCSE study card. The original independent reviewer rejected it because the curriculum objective named hardware/software without supplying substantive definitions. AQA's official question paper and mark scheme now supply narrowly pinned evidence. Do not generate or alter any other card.

Return JSON only. Preserve the four required identity fields exactly. Use the exact pinned kind, front, back, reverse fields, null memoryTip, sourceExcerpt and sourceLocator. The explanation and every item of choice feedback must be fully entailed by the supplied evidence; do not add a hardware definition or any claim absent from the evidence. Provide exactly three or four unique choices with one correct choice exactly equal to back. Wrong choices must be plausible, distinct misconceptions with concise diagnostic feedback. Use one allowed visual cue that does not reveal the answer.

Required identity and retrieval contract:
${JSON.stringify(
	{
		requiredIdentity: prepared.plan.requiredIdentity,
		retrieval: prepared.plan.retrieval,
		allowedVisualCues: prepared.plan.allowedVisualCues,
		sourceExcerpt: prepared.plan.sources.find(
			(source) => source.id === prepared.plan.answerSourceId
		).excerpt,
		sourceLocator: prepared.plan.sources.find(
			(source) => source.id === prepared.plan.answerSourceId
		).locator
	},
	null,
	2
)}

Original rejected card and independent review:
${JSON.stringify(
	{
		card: prepared.baseCandidates.cards[originalIndex],
		review: prepared.baseReview.reviews[originalIndex]
	},
	null,
	2
)}

Pinned official evidence:
${JSON.stringify(
	prepared.sources.map((source) => sourceWithoutRuntimeFields(source, true)),
	null,
	2
)}`;
}

function buildReviewPrompt(prepared, replacement) {
	return `You are the fresh independent reviewer for one narrowly repaired GCSE Computer Science study card. You did not generate it. Review only this replacement and output JSON only.

Accept only if the identity and pinned retrieval contract are exact; the front is useful substantive recall rather than curriculum trivia; the answer, explanation and all feedback are fully entailed by the official question-paper/mark-scheme excerpts; no hardware definition or other outside fact was invented; the source excerpt and locator are exact; the card has three or four unique, plausible choices with one exact correct answer; distractors teach distinct misconceptions; null memoryTip is retained; and the visual cue does not reveal the answer.

Pinned contract and official evidence:
${JSON.stringify(
	{
		requiredIdentity: prepared.plan.requiredIdentity,
		retrieval: prepared.plan.retrieval,
		sources: prepared.sources.map((source) => sourceWithoutRuntimeFields(source, true))
	},
	null,
	2
)}

Replacement candidate:
${JSON.stringify(replacement, null, 2)}`;
}

function bindCard(card, prepared, supplemental) {
	const applicableOfferings = prepared.offerings.filter((offering) =>
		offering.selectableComponentIds.includes(card.topicComponentId)
	);
	if (!applicableOfferings.length) {
		throw new Error(`No offering applies to preserved card ${card.id}.`);
	}
	const sources = supplemental
		? prepared.plan.sources.map((source) => ({
				kind: source.kind,
				url: source.url,
				title: source.title,
				locator: source.locator,
				excerpt: source.excerpt,
				sourceHash: source.sha256,
				rightsBasis: source.rightsBasis,
				supports: source.supports
			}))
		: [
				{
					kind: 'curriculum-specification',
					url: prepared.specification.landingUrl,
					title: prepared.specification.title,
					locator: card.sourceLocator,
					excerpt: card.sourceExcerpt,
					sourceHash: prepared.specification.sha256,
					rightsBasis: 'official_exam_board_specification',
					supports: [
						'front',
						'back',
						'explanation',
						...(card.memoryTip === null ? [] : ['memoryTip']),
						...(card.reverseFront === null ? [] : ['reverse'])
					]
				}
			];
	const content = {
		...card,
		choices: card.choices.map((choice, index) => ({
			...choice,
			key: String.fromCharCode('a'.charCodeAt(0) + index)
		})),
		board: prepared.specification.board,
		qualification: prepared.specification.qualification,
		subject: prepared.plan.subject,
		contentRevision: 1,
		sources,
		targets: applicableOfferings.map((offering, index) => ({
			offeringId: offering.id,
			curriculumComponentId: card.curriculumComponentId,
			topicComponentId: card.topicComponentId,
			isPrimary: index === 0,
			confidence: 1,
			reviewed: true
		}))
	};
	for (const field of [
		'topicComponentId',
		'curriculumComponentId',
		'sourceExcerpt',
		'sourceLocator'
	]) {
		delete content[field];
	}
	return content;
}

function buildCoverage(prepared, cards) {
	const acceptedComponentIds = new Set(cards.map((card) => card.curriculumComponentId));
	return prepared.offerings.flatMap((offering) =>
		prepared.basePlan.topicComponentIds
			.filter((topicId) => offering.selectableComponentIds.includes(topicId))
			.map((topicComponentId) => {
				const topicCards = cards.filter((card) => card.topicComponentId === topicComponentId);
				const requiredIds = prepared.basePlan.requiredComponentIds.filter((componentId) =>
					topicCards.some((card) => card.curriculumComponentId === componentId)
				);
				if (!requiredIds.every((componentId) => acceptedComponentIds.has(componentId))) {
					throw new Error(`Coverage remains incomplete for ${topicComponentId}.`);
				}
				return {
					offeringId: offering.id,
					topicComponentId,
					status: 'ready',
					cardCount: topicCards.length,
					reason: null
				};
			})
	);
}

function sourceEvidence(prepared) {
	return {
		schemaVersion: prepared.plan.schemaVersion,
		recoveryId: prepared.plan.recoveryId,
		planHash: prepared.planHash,
		baseTraceManifestHash: prepared.baseTraceManifestHash,
		requiredIdentity: prepared.plan.requiredIdentity,
		retrieval: prepared.plan.retrieval,
		answerSourceId: prepared.plan.answerSourceId,
		sources: prepared.sources.map((source) => ({
			...sourceWithoutRuntimeFields(source, false),
			exactExcerptVerified: true
		}))
	};
}

function sourceWithoutRuntimeFields(source, omitLocalPath) {
	const output = { ...source };
	delete output.pageText;
	if (omitLocalPath) delete output.localPath;
	return output;
}

function findGlobalCollision(card, batchId, board, subject) {
	const releaseRoot = path.join(rootDir, 'data/study-cards/releases');
	if (!existsSync(releaseRoot)) return null;
	for (const entry of readdirSync(releaseRoot, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name === batchId) continue;
		const artifactPath = path.join(releaseRoot, entry.name, 'accepted-study-cards.json');
		if (!existsSync(artifactPath)) continue;
		const artifact = readJson(artifactPath);
		for (const existing of artifact.cards ?? []) {
			if (existing.id === card.id) return `Card id ${card.id} already exists in ${entry.name}.`;
			if (
				existing.board === board &&
				existing.subject === subject &&
				existing.conceptKey === card.conceptKey
			) {
				return `Concept ${card.conceptKey} already exists in ${entry.name}.`;
			}
		}
	}
	return null;
}

function validatePassedSummary(summary, plan, label) {
	if (
		summary.status !== 'passed' ||
		summary.model !== plan.model ||
		summary.thinkingLevel !== plan.thinkingLevel ||
		!summary.threadId ||
		!summary.startedAt ||
		!summary.finishedAt
	) {
		throw new Error(
			`Preserved ${label} summary is not a passed ${plan.model}/${plan.thinkingLevel} run.`
		);
	}
}

function queueStatus(statePath) {
	if (!existsSync(statePath)) {
		return { terminal: false, finishedAt: null, activeJobCount: 0, reason: 'missing-state' };
	}
	const state = readJson(statePath);
	const activeJobCount = Array.isArray(state.jobs)
		? state.jobs.filter((job) => job.status === 'queued' || job.status === 'running').length
		: 0;
	return {
		terminal: typeof state.finishedAt === 'string' && activeJobCount === 0,
		finishedAt: state.finishedAt ?? null,
		activeJobCount,
		reason: null
	};
}

async function runStage({ name, prompt, outputSchema, workDir, plan, timeoutMs }) {
	const directory = path.join(workDir, name);
	return await runCodexSdkTurn({
		prompt,
		workDir: directory,
		eventsPath: path.join(directory, 'events.jsonl'),
		lastMessagePath: path.join(directory, 'last-message.json'),
		summaryPath: path.join(directory, 'codex-run-summary.json'),
		model: plan.model,
		thinkingLevel: plan.thinkingLevel,
		timeoutMs,
		networkAccessEnabled: false,
		webSearchMode: 'disabled',
		outputSchema,
		sandboxMode: 'read-only',
		environmentMode: 'minimal'
	});
}

function generationSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['cards'],
		properties: {
			cards: {
				type: 'array',
				minItems: 1,
				maxItems: 1,
				items: cardSchema()
			}
		}
	};
}

function cardSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: [
			'id',
			'conceptKey',
			'topicComponentId',
			'curriculumComponentId',
			'kind',
			'visualCue',
			'front',
			'back',
			'reverseFront',
			'reverseBack',
			'explanation',
			'memoryTip',
			'choices',
			'sourceExcerpt',
			'sourceLocator'
		],
		properties: {
			id: { type: 'string' },
			conceptKey: { type: 'string' },
			topicComponentId: { type: 'string' },
			curriculumComponentId: { type: 'string' },
			kind: { type: 'string' },
			visualCue: { type: 'string' },
			front: { type: 'string' },
			back: { type: 'string' },
			reverseFront: { type: ['string', 'null'] },
			reverseBack: { type: ['string', 'null'] },
			explanation: { type: 'string' },
			memoryTip: { type: ['string', 'null'] },
			choices: {
				type: 'array',
				minItems: 3,
				maxItems: 4,
				items: {
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
				}
			},
			sourceExcerpt: { type: 'string' },
			sourceLocator: { type: 'string' }
		}
	};
}

function reviewSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['reviews'],
		properties: {
			reviews: {
				type: 'array',
				minItems: 1,
				maxItems: 1,
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

function validateReplacementReview(value, cardId) {
	if (!value || !Array.isArray(value.reviews) || value.reviews.length !== 1) {
		throw new Error('Supplemental reviewer must return exactly one review.');
	}
	const review = value.reviews[0];
	if (
		review.cardId !== cardId ||
		typeof review.accepted !== 'boolean' ||
		!Array.isArray(review.issues) ||
		!Array.isArray(review.learnerValue)
	) {
		throw new Error('Supplemental reviewer output is malformed.');
	}
	if (review.accepted && review.issues.length) {
		throw new Error('Accepted supplemental review cannot contain issues.');
	}
	if (!review.accepted && !review.issues.length) {
		throw new Error('Rejected supplemental review must contain issues.');
	}
	return value;
}

function traceManifest(directory) {
	const files = walkFiles(directory).map((filePath) => {
		const relativeName = path.relative(directory, filePath);
		return {
			path: relativeName,
			sha256: sha256(readFileSync(filePath)),
			size: statSync(filePath).size
		};
	});
	return {
		schemaVersion: 'standard-study-card-base-trace-manifest-v1',
		baseRunDir: path.relative(rootDir, directory),
		files
	};
}

function walkFiles(directory) {
	return readdirSync(directory, { withFileTypes: true })
		.flatMap((entry) => {
			const filePath = path.join(directory, entry.name);
			return entry.isDirectory() ? walkFiles(filePath) : [filePath];
		})
		.sort();
}

function copyTree(sourceDir, destinationDir) {
	for (const filePath of walkFiles(sourceDir)) {
		const destination = path.join(destinationDir, path.relative(sourceDir, filePath));
		mkdirSync(path.dirname(destination), { recursive: true });
		copyFileSync(filePath, destination);
	}
}

function parseOutput(value) {
	const trimmed = String(value ?? '').trim();
	const unwrapped = trimmed.startsWith('```')
		? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
		: trimmed;
	return JSON.parse(unwrapped);
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
		plan: value(
			'plan',
			'data/study-cards/supplemental-source-recovery/aqa-8525-hardware-software-mark-scheme-v1.json'
		),
		baseWorkDir: value('base-work-dir'),
		workDir: value('work-dir'),
		confirmRecovery: value('confirm-recovery'),
		timeoutMs: integer('timeout-ms', 3_600_000, 60_000, 14_400_000)
	};
}

function usage() {
	return `Usage:
node scripts/recover-standard-study-card-supplemental-source.mjs \\
  [--plan=<pinned recovery plan>] [--base-work-dir=<preserved trace>]

The default performs a fail-closed, no-model preflight. It verifies the
preserved 17/1 review split, all pinned trace and PDF hashes, exact page-text
hashes/excerpts, global identities, and queue/artifact reuse identity.

Generation is deliberately double-gated: the descendant queue must be
terminal, and the command must include both --generate and the exact
--confirm-recovery=<recovery id>. It generates and independently reviews only
the one rejected identity, then merges it with the 17 untouched candidates and
writes the immutable artifact under the original batch id.`;
}
