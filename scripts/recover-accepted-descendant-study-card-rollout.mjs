#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Historical rollout JSONL is validated defensively at runtime.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
	expectedStudyCardArtifactRelativePath,
	hashStudyCardArtifact,
	stableStringify,
	validateStudyCardBundle
} from './lib/study-card-artifact.mjs';
import { assertStudyCardCurriculumScope } from './lib/study-card-import.mjs';
import { normalizeReviewedChoiceKeys } from './lib/standard-study-card-compiler.mjs';

const MODEL = 'gpt-5.6-sol';
const THINKING_LEVEL = 'max';
const PROMPT_VERSION = 'standard-study-card-descendant-coverage-v1';
const REVIEWED_REPAIR_PROMPT_VERSION = 'standard-study-card-reviewed-repair-v3';
const RECOVERY_SUFFIX = '-rollout-recovered-v1';
const PHYSICS_SCOPE_BATCH = 'aqa-physics-8463-physics-shared-descendants-04-4e998fe959-v1';
const PHYSICS_FOUNDATION = 'aqa-gcse-physics-8463-v1.1:foundation';
const PHYSICS_HIGHER = 'aqa-gcse-physics-8463-v1.1:higher';
const PHYSICS_SCOPE_CARD_IDS = new Set([
	'aqa-8463-ba4007ba2c-aqa-physics-8463-4-5-7-3-force-causes-momentum-change',
	'aqa-8463-d6d0e2d29f-aqa-physics-8463-4-5-7-2-closed-system-momentum'
]);
const PHYSICS_WITHHELD_REASON =
	'No card remains in this release after removing Foundation targets beneath the Higher-only Momentum section.';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
const manifestPath = path.resolve(
	args.manifest ?? 'data/study-cards/rollout-recovery/accepted-descendant-releases.json'
);
const sessionRoot = path.resolve(
	args.sessionRoot ?? path.join(os.homedir(), '.codex/sessions/2026/07/16')
);
const evidencePath = path.join(
	rootDir,
	'docs/release-evidence/study-card-descendant-rollout-recovery.json'
);
const catalog = readJson(path.join(rootDir, 'data/curricula/curriculum-catalog.json'));
const manifest = readJson(manifestPath);

if (manifest.schemaVersion !== 'accepted-descendant-study-card-rollout-recovery-v1') {
	throw new Error('Unexpected accepted descendant recovery manifest schema.');
}
if (!Array.isArray(manifest.releases) || manifest.releases.length !== 12) {
	throw new Error('The accepted descendant recovery manifest must pin exactly 12 releases.');
}
if (manifest.queueEvidence?.acceptedJobs !== 12) {
	throw new Error('The manifest queue evidence must pin exactly 12 accepted jobs.');
}

const results = [];
for (const entry of manifest.releases) {
	results.push(recoverRelease(entry));
}
const totals = {
	releases: results.length,
	cards: results.reduce((sum, result) => sum + result.cardCount, 0),
	coverageRows: results.reduce((sum, result) => sum + result.coverageCount, 0),
	reviewerRepairs: results.reduce((sum, result) => sum + result.reviewerRepairCount, 0),
	postAcceptanceScopeCorrections: results.filter((result) => result.scopeCorrectionApplied).length
};
if (totals.cards !== 82) {
	throw new Error(`Accepted descendant recovery expected 82 cards, found ${totals.cards}.`);
}
writeJson(evidencePath, {
	schemaVersion: 'study-card-descendant-rollout-recovery-evidence-v1',
	status: 'accepted_transcripts_recovered',
	policy:
		'Only the 12 queue jobs recorded as accepted were recovered. No model was called. Failed, running and queued jobs were excluded.',
	identityPolicy:
		'Recovered releases use an explicit rollout-recovered-v1 suffix because the original wrapper timestamps and all original artifact hashes are not available. Historical batch ids remain recorded as evidence, never silently substituted.',
	manifestPath: relative(manifestPath),
	manifestHash: sha256(readFileSync(manifestPath)),
	sessionRoot,
	queueEvidence: manifest.queueEvidence,
	totals,
	releases: results
});

console.log(
	JSON.stringify(
		{
			status: 'recovered',
			evidencePath: relative(evidencePath),
			totals,
			releases: results.map((result) => ({
				releaseId: result.releaseId,
				cardCount: result.cardCount,
				coverageCount: result.coverageCount,
				artifactHash: result.artifactHash
			}))
		},
		null,
		2
	)
);

function recoverRelease(entry) {
	const generation = loadSession(entry.generatorRunId, 'generation');
	const review = loadSession(entry.reviewerRunId, 'review');
	assertSessionBatch(generation, entry.batchId);
	assertSessionBatch(review, entry.batchId);
	const rawCandidates = generation.output;
	if (!Array.isArray(rawCandidates?.cards)) {
		throw new Error(`${entry.batchId} generator output does not contain cards.`);
	}

	const firstComponentId = rawCandidates.cards[0]?.curriculumComponentId;
	const specificationId = String(firstComponentId ?? '').split(':')[0];
	const specification = catalog.specifications.find((row) => row.id === specificationId);
	if (!specification) throw new Error(`${entry.batchId} references unknown ${specificationId}.`);
	const offerings = catalog.offerings.filter(
		(offering) =>
			offering.specificationId === specificationId &&
			offering.profileSubject === entry.subject &&
			(entry.mode !== 'higher-only' || offering.tier === 'Higher')
	);
	if (!offerings.length) throw new Error(`${entry.batchId} has no matching offerings.`);
	const scope = buildSourceScope(specification, offerings, rawCandidates.cards);
	const candidates = {
		cards: rawCandidates.cards.map((card, index) =>
			scopeRequiredIdentity(card, scope.orderedRequiredComponentIds[index], specification)
		)
	};
	assertReviewMatches(review.output, candidates.cards, entry.batchId);

	let finalCards = [...candidates.cards];
	let finalReviews = [...review.output.reviews];
	let repaired = null;
	if (entry.reviewedRepair) {
		const repairGeneration = loadSession(
			entry.reviewedRepair.generatorRunId,
			'reviewed-repair-generation-1'
		);
		const repairReview = loadSession(
			entry.reviewedRepair.reviewerRunId,
			'reviewed-repair-review-1'
		);
		assertSessionBatch(repairGeneration, entry.batchId);
		assertSessionBatch(repairReview, entry.batchId);
		if (repairGeneration.output?.cards?.length !== 1) {
			throw new Error(`${entry.batchId} recovery expects one reviewed replacement card.`);
		}
		const replacement = repairGeneration.output.cards[0];
		assertReviewMatches(repairReview.output, [replacement], `${entry.batchId} repair`);
		if (!repairReview.output.reviews[0].accepted) {
			throw new Error(`${entry.batchId} reviewed replacement was not accepted.`);
		}
		const replaceIndex = finalCards.findIndex((card) => card.id === replacement.id);
		if (replaceIndex < 0) throw new Error(`${entry.batchId} replacement identity is absent.`);
		finalCards[replaceIndex] = replacement;
		finalReviews[replaceIndex] = repairReview.output.reviews[0];
		repaired = { repairGeneration, repairReview, cardId: replacement.id };
	}

	const acceptedCards = finalCards.filter((card, index) => finalReviews[index]?.accepted === true);
	if (acceptedCards.length !== entry.expectedAcceptedCards) {
		throw new Error(
			`${entry.batchId} expected ${entry.expectedAcceptedCards} accepted cards, recovered ${acceptedCards.length}.`
		);
	}
	const releaseId = `${entry.batchId}${RECOVERY_SUFFIX}`;
	const artifactRelativePath = expectedStudyCardArtifactRelativePath(releaseId);
	const releaseDir = path.join(rootDir, path.dirname(artifactRelativePath));
	if (existsSync(releaseDir)) {
		if (!args.force) throw new Error(`Recovery release already exists: ${relative(releaseDir)}.`);
		rmSync(releaseDir, { recursive: true, force: true });
	}
	mkdirSync(releaseDir, { recursive: true });

	const finishedAt = repaired ? repaired.repairReview.completedAt : review.completedAt;
	const supplementalRuns = repaired
		? [
				{
					purpose: 'targeted-card-repair',
					promptVersion: REVIEWED_REPAIR_PROMPT_VERSION,
					cardIds: [repaired.cardId],
					generator: modelRun(repaired.repairGeneration.runId),
					reviewer: reviewerRun(repaired.repairReview.runId),
					startedAt: repaired.repairGeneration.startedAt,
					finishedAt: repaired.repairReview.completedAt
				}
			]
		: [];
	const release = {
		id: releaseId,
		promptVersion: PROMPT_VERSION,
		generator: modelRun(generation.runId),
		reviewer: reviewerRun(review.runId),
		...(supplementalRuns.length ? { supplementalRuns } : {}),
		startedAt: generation.startedAt,
		finishedAt,
		sourceManifestHash: sha256(
			stableStringify({
				specification: publicSpecification(specification),
				offerings: offerings.map(publicOffering),
				topics: scope.sourceTopics
			})
		),
		artifactPath: artifactRelativePath
	};
	const bundle = {
		schemaVersion: 'standard-study-deck-v1',
		release,
		cards: acceptedCards.map((card) =>
			bindCard(card, {
				specification,
				offerings,
				sourceTopics: scope.sourceTopics,
				subject: entry.subject
			})
		),
		coverage: buildCoverage(acceptedCards, offerings, scope.topics)
	};
	const scopeCorrectionApplied = entry.batchId === PHYSICS_SCOPE_BATCH;
	if (scopeCorrectionApplied) applyPhysicsScopeCorrection(bundle);
	const validated = validateStudyCardBundle(bundle);
	assertStudyCardCurriculumScope(validated, catalog);
	const artifactHash = hashStudyCardArtifact(validated);

	writeJson(path.join(releaseDir, 'accepted-study-cards.json'), bundle);
	writeJson(path.join(releaseDir, 'raw-candidate-cards.json'), rawCandidates);
	writeJson(path.join(releaseDir, 'candidate-cards.json'), candidates);
	writeJson(path.join(releaseDir, 'review.json'), review.output);
	writeJson(path.join(releaseDir, 'coverage.json'), { coverage: bundle.coverage });
	writeJson(path.join(releaseDir, 'generation-model-output.json'), generation.output);
	writeJson(path.join(releaseDir, 'review-model-output.json'), review.output);
	if (repaired) {
		writeJson(
			path.join(releaseDir, 'reviewed-repair-generation-1-model-output.json'),
			repaired.repairGeneration.output
		);
		writeJson(
			path.join(releaseDir, 'reviewed-repair-review-1-model-output.json'),
			repaired.repairReview.output
		);
	}
	writeJson(path.join(releaseDir, 'recovery-evidence.json'), {
		schemaVersion: 'study-card-rollout-jsonl-recovery-v1',
		status: 'accepted_transcript_recovered',
		historicalBatchId: entry.batchId,
		recoveredReleaseId: releaseId,
		identityPolicy:
			'This explicit recovery id preserves accepted card/review evidence without claiming byte identity with the missing historical artifact wrapper.',
		queueStatus: 'accepted',
		...(entry.historicalArtifactHash
			? { historicalArtifactHash: entry.historicalArtifactHash }
			: {}),
		generator: sessionEvidence(generation),
		reviewer: sessionEvidence(review),
		...(repaired
			? {
					reviewedRepair: {
						generator: sessionEvidence(repaired.repairGeneration),
						reviewer: sessionEvidence(repaired.repairReview),
						cardId: repaired.cardId
					}
				}
			: {}),
		modelCallsDuringRecovery: 0,
		scopeCorrectionApplied,
		artifactHash
	});
	writeJson(path.join(releaseDir, 'generation-run.json'), {
		status: 'accepted_rollout_recovery',
		plan: {
			historicalBatchId: entry.batchId,
			recoveredReleaseId: releaseId,
			specificationId,
			subject: entry.subject,
			mode: entry.mode,
			offeringIds: offerings.map((offering) => offering.id),
			requiredComponentIds: scope.orderedRequiredComponentIds,
			model: MODEL,
			thinkingLevel: THINKING_LEVEL
		},
		counts: {
			generated: rawCandidates.cards.length,
			accepted: acceptedCards.length,
			rejectedByInitialReviewer: review.output.reviews.filter((row) => !row.accepted).length,
			reviewerRepairAttempts: repaired ? 1 : 0,
			readyCoverageRows: bundle.coverage.filter((row) => row.status === 'ready').length,
			withheldCoverageRows: bundle.coverage.filter((row) => row.status === 'withheld').length
		},
		artifactPath: artifactRelativePath,
		artifactHash,
		modelCallsDuringRecovery: 0
	});

	return {
		historicalBatchId: entry.batchId,
		releaseId,
		cardCount: acceptedCards.length,
		coverageCount: bundle.coverage.length,
		reviewerRepairCount: repaired ? 1 : 0,
		scopeCorrectionApplied,
		generatorRunId: generation.runId,
		reviewerRunId: review.runId,
		artifactPath: artifactRelativePath,
		artifactHash,
		...(entry.historicalArtifactHash
			? { historicalArtifactHash: entry.historicalArtifactHash }
			: {})
	};
}

function buildSourceScope(specification, offerings, rawCards) {
	const requiredSet = new Set(rawCards.map((card) => card.curriculumComponentId));
	if (requiredSet.size !== rawCards.length) {
		throw new Error(`${specification.id} rollout candidates do not map one-to-one to components.`);
	}
	const componentById = new Map(
		specification.components.map((component) => [component.id, component])
	);
	const selectableIds = new Set(offerings.flatMap((offering) => offering.selectableComponentIds));
	const selectedTopicFor = (componentId) => {
		let current = componentById.get(componentId);
		while (current) {
			if (selectableIds.has(current.id)) return current.id;
			current = componentById.get(current.parentId);
		}
		return null;
	};
	const topicIds = new Set([...requiredSet].map(selectedTopicFor));
	if (topicIds.has(null))
		throw new Error(`${specification.id} contains an out-of-scope component.`);
	const topics = specification.components
		.filter((component) => topicIds.has(component.id))
		.sort((left, right) => left.displayOrder - right.displayOrder);
	const pdfPath = resolvePdfPath(specification);
	const sourceTopics = topics.map((topic) =>
		sourceForTopic(specification, topic, pdfPath, requiredSet)
	);
	const orderedRequiredComponentIds = sourceTopics.flatMap((topic) =>
		topic.components.map((component) => component.id)
	);
	if (
		orderedRequiredComponentIds.length !== requiredSet.size ||
		orderedRequiredComponentIds.some((componentId) => !requiredSet.has(componentId))
	) {
		throw new Error(`${specification.id} could not reconstruct required component order.`);
	}
	return { topics, sourceTopics, orderedRequiredComponentIds };
}

function scopeRequiredIdentity(card, requiredComponentId, specification) {
	const prefix = `${slug(specification.board)}-${slug(specification.specificationCode)}-${sha256(requiredComponentId).slice(0, 10)}`;
	const rawId = isSlug(card?.id) ? card.id : 'card';
	const rawConcept = isSlug(card?.conceptKey) ? card.conceptKey : 'concept';
	return {
		...card,
		id: boundedSlug(`${prefix}-${rawId}`, 160),
		conceptKey: boundedSlug(`${prefix}-${rawConcept}`, 100)
	};
}

function assertReviewMatches(output, cards, label) {
	if (!Array.isArray(output?.reviews) || output.reviews.length !== cards.length) {
		throw new Error(`${label} reviewer did not return one decision per card.`);
	}
	for (const [index, review] of output.reviews.entries()) {
		if (review.cardId !== cards[index].id || typeof review.accepted !== 'boolean') {
			throw new Error(`${label} reviewer identity mismatch at ${index}.`);
		}
	}
}

function bindCard(card, { specification, offerings, sourceTopics, subject }) {
	const sourceTopic = sourceTopics.find(
		(topic) => topic.topicComponentId === card.topicComponentId
	);
	const sourceComponent = sourceTopic?.components.find(
		(component) => component.id === card.curriculumComponentId
	);
	if (!sourceTopic || !sourceComponent) throw new Error(`${card.id} source scope is absent.`);
	const applicableOfferings = offerings.filter((offering) =>
		offering.selectableComponentIds.includes(card.topicComponentId)
	);
	const primary = applicableOfferings[0];
	const content = {
		...card,
		choices: normalizeReviewedChoiceKeys(card.choices),
		board: specification.board,
		qualification: specification.qualification,
		subject,
		contentRevision: 1,
		sources: [
			{
				kind: 'curriculum-specification',
				url: specification.landingUrl,
				title: specification.title,
				locator: card.sourceLocator,
				excerpt: card.sourceExcerpt,
				sourceHash: specification.sha256,
				rightsBasis: 'official_exam_board_specification',
				supports: [
					'front',
					'back',
					'explanation',
					...(card.memoryTip === null ? [] : ['memoryTip'])
				]
			}
		],
		targets: applicableOfferings.map((offering) => ({
			offeringId: offering.id,
			curriculumComponentId: sourceComponent.id,
			topicComponentId: sourceTopic.topicComponentId,
			isPrimary: offering.id === primary.id,
			confidence: 1,
			reviewed: true
		}))
	};
	delete content.topicComponentId;
	delete content.curriculumComponentId;
	delete content.sourceExcerpt;
	delete content.sourceLocator;
	return content;
}

function buildCoverage(cards, offerings, topics) {
	return offerings.flatMap((offering) =>
		topics
			.filter((topic) => offering.selectableComponentIds.includes(topic.id))
			.map((topic) => ({
				offeringId: offering.id,
				topicComponentId: topic.id,
				status: 'ready',
				cardCount: cards.filter((card) => card.topicComponentId === topic.id).length,
				reason: null
			}))
	);
}

function applyPhysicsScopeCorrection(bundle) {
	const found = new Set();
	for (const card of bundle.cards) {
		if (!PHYSICS_SCOPE_CARD_IDS.has(card.id)) continue;
		found.add(card.id);
		card.targets = card.targets.filter((target) => target.offeringId !== PHYSICS_FOUNDATION);
		if (card.targets.length !== 1 || card.targets[0].offeringId !== PHYSICS_HIGHER) {
			throw new Error(`${card.id} did not retain exactly one Higher target.`);
		}
		card.targets[0].isPrimary = true;
	}
	if (found.size !== PHYSICS_SCOPE_CARD_IDS.size) {
		throw new Error('Physics post-acceptance correction did not find both pinned cards.');
	}
	for (const row of bundle.coverage) {
		const count = bundle.cards.filter((card) =>
			card.targets.some(
				(target) =>
					target.offeringId === row.offeringId && target.topicComponentId === row.topicComponentId
			)
		).length;
		row.cardCount = count;
		row.status = count === 0 ? 'withheld' : 'ready';
		row.reason = count === 0 ? PHYSICS_WITHHELD_REASON : null;
	}
}

function sourceForTopic(specification, topic, pdfPath, requiredSet) {
	const components = descendants(specification.components, topic.id).filter(
		(component) =>
			requiredSet.has(component.id) &&
			Number.isInteger(component.sourcePageStart) &&
			Number.isInteger(component.sourcePageEnd)
	);
	const pageStart = Math.min(...components.map((component) => component.sourcePageStart));
	const pageEnd = Math.max(...components.map((component) => component.sourcePageEnd));
	if (!Number.isFinite(pageStart) || !Number.isFinite(pageEnd)) {
		throw new Error(`Topic ${topic.id} has no source pages.`);
	}
	const physicalText = execFileSync(
		'pdftotext',
		['-f', String(pageStart), '-l', String(pageEnd), '-raw', '-nopgbrk', pdfPath, '-'],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
	);
	const pageHeader = `Official PDF pages ${pageStart}-${pageEnd}`;
	return {
		topicComponentId: topic.id,
		code: topic.code,
		title: topic.title,
		paper: topic.paper,
		pageStart,
		pageEnd,
		components: components.map((component) => ({
			id: component.id,
			code: component.code,
			title: component.title,
			kind: component.kind,
			tier: component.tier,
			locator: `${pageHeader}; ${component.code} ${component.title}`,
			text: sourceSliceForComponent(physicalText, component, pageHeader)
		}))
	};
}

function sourceSliceForComponent(physicalText, component, pageHeader) {
	const normalized = physicalText.split(String.fromCharCode(0)).join('').trim();
	const titleIndex = normalized.toLowerCase().indexOf(component.title.toLowerCase());
	const start = titleIndex >= 0 ? titleIndex : 0;
	const slice = normalized.slice(start, start + 7_000).trim();
	if (slice.length < 80) throw new Error(`${component.id} produced too little source text.`);
	return `${pageHeader}\n${slice}`;
}

function descendants(components, rootId) {
	const children = new Map();
	for (const component of components) {
		const rows = children.get(component.parentId) ?? [];
		rows.push(component);
		children.set(component.parentId, rows);
	}
	const byId = new Map(components.map((component) => [component.id, component]));
	const output = [];
	const visit = (id) => {
		const row = byId.get(id);
		if (row) output.push(row);
		for (const child of children.get(id) ?? []) visit(child.id);
	};
	visit(rootId);
	return output;
}

function resolvePdfPath(specification) {
	const configured = path.resolve(specification.localPath);
	if (existsSync(configured)) return configured;
	const fallback = path.join(
		rootDir,
		'data/curricula/sources',
		path.basename(specification.localPath)
	);
	if (existsSync(fallback)) return fallback;
	throw new Error(`Official source PDF is missing: ${specification.localPath}`);
}

function loadSession(runId, expectedStage) {
	const fileName = readdirSync(sessionRoot).find((name) => name.endsWith(`-${runId}.jsonl`));
	if (!fileName) throw new Error(`Rollout JSONL is missing for ${runId}.`);
	const filePath = path.join(sessionRoot, fileName);
	const raw = readFileSync(filePath, 'utf8');
	const rows = raw
		.split('\n')
		.filter(Boolean)
		.map((line, index) => {
			try {
				return JSON.parse(line);
			} catch (error) {
				throw new Error(`${fileName}:${index + 1}: ${error.message}`, { cause: error });
			}
		});
	const meta = rows.find((row) => row.type === 'session_meta')?.payload;
	const complete = rows
		.filter((row) => row.type === 'event_msg' && row.payload?.type === 'task_complete')
		.at(-1);
	if (!meta || !complete?.payload?.last_agent_message) {
		throw new Error(`${fileName} lacks session metadata or a completed model response.`);
	}
	if (!String(meta.cwd).endsWith(`/${expectedStage}`)) {
		throw new Error(`${runId} expected stage ${expectedStage}, found ${meta.cwd}.`);
	}
	const outputText = complete.payload.last_agent_message;
	return {
		runId,
		filePath,
		fileHash: sha256(raw),
		cwd: meta.cwd,
		startedAt: meta.timestamp,
		completedAt: complete.timestamp,
		outputText,
		outputHash: sha256(outputText),
		output: parseModelJson(outputText)
	};
}

function assertSessionBatch(session, batchId) {
	if (!session.cwd.includes(`/study-card-generation/${batchId}/`)) {
		throw new Error(`${session.runId} does not belong to ${batchId}.`);
	}
}

function sessionEvidence(session) {
	return {
		runId: session.runId,
		jsonlPath: session.filePath,
		jsonlHash: session.fileHash,
		cwd: session.cwd,
		startedAt: session.startedAt,
		completedAt: session.completedAt,
		modelOutputHash: session.outputHash
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

function modelRun(runId) {
	return { model: MODEL, thinkingLevel: THINKING_LEVEL, runId };
}

function reviewerRun(runId) {
	return { ...modelRun(runId), independentTurn: true };
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
	return {
		force: argv.includes('--force'),
		manifest: value('manifest'),
		sessionRoot: value('session-root')
	};
}

function isSlug(value) {
	return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function boundedSlug(value, maximumLength) {
	return value.slice(0, maximumLength).replace(/-+$/, '');
}

function slug(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
