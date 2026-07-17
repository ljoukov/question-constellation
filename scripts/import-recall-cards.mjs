#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { d1Batch, d1Rows } from './lib/d1-rest.mjs';
import {
	RECALL_IMPORT_OWNER,
	hashRecallArtifact,
	normalizeEvidenceText,
	stableStringify,
	validateRecallCardBundle
} from './lib/recall-card-bundle.mjs';
import {
	buildRecallCardImportStatements,
	canonicalSourceFileHash,
	planRecallCardImport,
	recallStoredCardParentIssues
} from './lib/recall-card-import.mjs';
import {
	recallRequiredDurableCompanionNames,
	verifyRecallCompanionArtifactFiles
} from './lib/recall-card-artifacts.mjs';
import { loadOfficialRecallEvidence } from './lib/recall-curriculum-evidence.mjs';
import { resolveRecallAcceptedArtifactPath } from './lib/recall-generation-paths.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
const inputPath = path.resolve(rootDir, args.input);
const inputText = readFileSync(inputPath, 'utf8');
const bundle = validateRecallCardBundle(JSON.parse(inputText));
const artifactPath = path.relative(rootDir, inputPath);
const artifactHash = hashRecallArtifact(bundle);
if (args.write) requireDurableArtifact(inputPath, artifactHash, bundle);
validateArtifactAgainstOfficialSource(bundle);

await requireSchema();
await requireCurriculumReferences(bundle);
const existing = await loadExisting(bundle);
const plan = planRecallCardImport(bundle, existing, {
	allowUpdate: args.allowUpdate,
	artifactHash,
	artifactPath
});
if (plan.conflicts.length) {
	emit({ status: 'conflict', dryRun: !args.write, input: artifactPath, plan });
	process.exit(1);
}
const statements = buildRecallCardImportStatements(bundle, plan);
let verification = null;
if (args.write) {
	await d1Batch(statements, { rootDir, binding: 'QUESTION_DB' });
	verification = await verifyImport(bundle, artifactHash);
}
emit({
	status: args.write ? 'imported' : 'dry_run',
	dryRun: !args.write,
	input: artifactPath,
	artifactHash,
	owner: RECALL_IMPORT_OWNER,
	plan,
	statementCount: statements.length,
	transactionPayloadBytes: Buffer.byteLength(JSON.stringify(statements)),
	verification
});

function parseArgs(argv) {
	const value = (name, fallback = null) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
	return {
		help: argv.includes('--help') || argv.includes('-h'),
		input: value('input', 'tmp/recall-generation/latest/accepted-cards.json'),
		output: value('output'),
		write: argv.includes('--write'),
		allowUpdate: argv.includes('--allow-update')
	};
}

function usage() {
	return `Usage:
node scripts/import-recall-cards.mjs --input=<accepted-cards.json>

The default performs a read-only D1 schema, ownership, identity, reference and
idempotency preflight. Add --write only after reviewing the dry-run report.

Options:
  --write           execute the draft -> children -> published transaction
  --allow-update    explicitly revise compiler-owned content that has changed
  --output=<path>   write the JSON report as well as printing it`;
}

function requireDurableArtifact(filePath, artifactHash, bundle) {
	const expectedArtifactPath = resolveRecallAcceptedArtifactPath({
		rootDir,
		runId: bundle.run.id
	});
	if (filePath !== expectedArtifactPath) {
		throw new Error(
			`--write accepts only the reviewed artifact at ${path.relative(rootDir, expectedArtifactPath)} for this run; temporary or differently named output is dry-run only.`
		);
	}
	const artifactDir = path.dirname(filePath);
	const replacementReviewRun = bundle.run.cueReviewer?.replacementReviewRun === true;
	const requiredCompanions = recallRequiredDurableCompanionNames(replacementReviewRun);
	const missing = requiredCompanions.filter((name) => !existsSync(path.join(artifactDir, name)));
	if (missing.length) {
		throw new Error(`Durable recall run is incomplete; missing: ${missing.join(', ')}`);
	}
	const manifest = JSON.parse(
		readFileSync(path.join(artifactDir, 'recall-generation-run.json'), 'utf8')
	);
	if (
		manifest.status !== 'accepted' ||
		stableStringify(manifest.run) !== stableStringify(bundle.run) ||
		manifest.acceptedArtifactHash !== artifactHash
	) {
		throw new Error('Durable recall run manifest does not match the accepted artifact.');
	}
	const replacementCount = Number(manifest.counts?.cueReplacementsReviewed ?? 0);
	if (
		!Number.isInteger(replacementCount) ||
		replacementCount < 0 ||
		replacementCount > 0 !== replacementReviewRun
	) {
		throw new Error('Durable recall run manifest has inconsistent cue-replacement metadata.');
	}
	if (bundle.companionArtifacts) {
		verifyRecallCompanionArtifactFiles(artifactDir, bundle.companionArtifacts, {
			replacementReviewRun
		});
	}
}

function validateArtifactAgainstOfficialSource(bundle) {
	const referenceCard = bundle.cards[0];
	const targetIdentity = (target) => ({
		offeringId: target.offeringId,
		curriculumComponentId: target.curriculumComponentId,
		topicComponentId: target.topicComponentId,
		isPrimary: target.isPrimary,
		confidence: target.confidence,
		reviewed: target.reviewed,
		mappingSource: target.mappingSource
	});
	const expectedTargets = referenceCard.targets.map(targetIdentity);
	for (const card of bundle.cards) {
		if (
			card.subject !== referenceCard.subject ||
			stableStringify(card.targets.map(targetIdentity)) !== stableStringify(expectedTargets)
		) {
			throw new Error(
				'One accepted bundle may contain only one exact subject/offering target set.'
			);
		}
	}
	const primary = expectedTargets.find((target) => target.isPrimary);
	const official = loadOfficialRecallEvidence({
		rootDir,
		catalogPath: bundle.source.catalogPath,
		specificationId: bundle.source.specification.id,
		componentId: bundle.source.component.id,
		subject: referenceCard.subject,
		offeringIds: expectedTargets.map((target) => target.offeringId),
		primaryOfferingId: primary?.offeringId
	});
	if (
		official.fingerprint !== bundle.source.fingerprint ||
		official.specification.sha256 !== bundle.source.specification.sha256 ||
		official.pageStart !== bundle.source.pageStart ||
		official.pageEnd !== bundle.source.pageEnd ||
		stableStringify(official.targets) !== stableStringify(expectedTargets)
	) {
		throw new Error(
			'Accepted artifact source fingerprint or reviewed targets differ from the official catalog.'
		);
	}
	const officialText = normalizeEvidenceText(official.pageText);
	for (const card of bundle.cards) {
		for (const evidence of card.evidence) {
			if (!officialText.includes(normalizeEvidenceText(evidence.sourceExcerpt))) {
				throw new Error(
					`${card.id} source excerpt is not an exact quote from its official PDF pages.`
				);
			}
		}
	}
}

async function requireSchema() {
	const required = [
		'recall_generation_runs',
		'recall_cards',
		'recall_card_choices',
		'recall_card_evidence',
		'recall_card_curriculum_targets',
		'curriculum_specifications',
		'curriculum_components',
		'curriculum_offerings'
	];
	const rows = await d1Rows(
		`SELECT name FROM sqlite_master
		 WHERE type = 'table' AND name IN (${required.map(() => '?').join(', ')})`,
		required,
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const found = new Set(rows.map((row) => row.name));
	const missing = required.filter((name) => !found.has(name));
	if (missing.length) {
		throw new Error(
			`Recall import schema is absent: ${missing.join(', ')}. Apply migrations first.`
		);
	}
	const draftFirstTriggers = [
		'recall_cards_insert_as_draft',
		'recall_cards_published_content_immutable',
		'recall_choices_published_parent_immutable_insert',
		'recall_choices_published_parent_immutable_update',
		'recall_choices_published_parent_immutable_delete',
		'recall_evidence_published_parent_immutable_insert',
		'recall_evidence_published_parent_immutable_update',
		'recall_evidence_published_parent_immutable_delete',
		'recall_targets_published_parent_immutable_insert',
		'recall_targets_published_parent_immutable_update',
		'recall_targets_published_parent_immutable_delete'
	];
	const triggerRows = await d1Rows(
		`SELECT name FROM sqlite_master
		 WHERE type = 'trigger' AND name IN (${draftFirstTriggers.map(() => '?').join(', ')})`,
		draftFirstTriggers,
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const installedTriggers = new Set(triggerRows.map((row) => row.name));
	const missingTriggers = draftFirstTriggers.filter((name) => !installedTriggers.has(name));
	if (missingTriggers.length) {
		throw new Error(
			`Recall draft-first guards are absent: ${missingTriggers.join(', ')}. Apply migration 0019 before import.`
		);
	}
	const choiceCountTriggerRows = await d1Rows(
		`SELECT sql FROM sqlite_master
		 WHERE type = 'trigger' AND name = 'recall_cards_publish_choice_count'`,
		[],
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const choiceCountTriggerSql = String(choiceCountTriggerRows[0]?.sql ?? '').replace(/\s+/g, ' ');
	if (!/NOT BETWEEN 3 AND 4/i.test(choiceCountTriggerSql)) {
		throw new Error(
			'Recall three-or-four-choice publication guard is absent. Apply migration 0023 before import.'
		);
	}
}

async function requireCurriculumReferences(bundle) {
	const specificationIds = [
		...new Set(bundle.cards.flatMap((card) => card.evidence.map((row) => row.specificationId)))
	];
	const offeringIds = [
		...new Set(bundle.cards.flatMap((card) => card.targets.map((target) => target.offeringId)))
	];
	const [specificationRows, componentRows, offeringRows] = await Promise.all([
		d1Rows(
			`SELECT id, board, qualification, file_hash FROM curriculum_specifications
			 WHERE id IN (${specificationIds.map(() => '?').join(', ')})`,
			specificationIds,
			{ rootDir, binding: 'QUESTION_DB' }
		),
		d1Rows(
			`SELECT id, specification_id, parent_id, selectable, subject_area
			 FROM curriculum_components
			 WHERE specification_id IN (${specificationIds.map(() => '?').join(', ')})`,
			specificationIds,
			{ rootDir, binding: 'QUESTION_DB' }
		),
		d1Rows(
			`SELECT id, board, qualification, profile_subject, specification_id,
			        root_component_id, selectable_component_ids_json, enabled
			 FROM curriculum_offerings
			 WHERE id IN (${offeringIds.map(() => '?').join(', ')})`,
			offeringIds,
			{ rootDir, binding: 'QUESTION_DB' }
		)
	]);
	assertAllReferences('curriculum specification', specificationIds, specificationRows);
	assertAllReferences('curriculum offering', offeringIds, offeringRows);
	const specificationById = new Map(specificationRows.map((row) => [row.id, row]));
	const componentById = new Map(componentRows.map((row) => [row.id, row]));
	const offeringById = new Map(offeringRows.map((row) => [row.id, row]));
	for (const card of bundle.cards) {
		for (const evidence of card.evidence) {
			const specification = specificationById.get(evidence.specificationId);
			const component = componentById.get(evidence.curriculumComponentId);
			if (!component)
				throw new Error(`Unknown curriculum component ${evidence.curriculumComponentId}`);
			if (component.specification_id !== evidence.specificationId) {
				throw new Error(`${component.id} does not belong to ${evidence.specificationId}`);
			}
			if (
				specification.board !== card.board ||
				specification.qualification !== card.qualification ||
				canonicalSourceFileHash(specification.file_hash) !== evidence.sourceFileHash
			) {
				throw new Error(`${card.id} official specification identity or file hash differs in D1.`);
			}
		}
		for (const target of card.targets) {
			const component = componentById.get(target.curriculumComponentId);
			const topic = componentById.get(target.topicComponentId);
			const offering = offeringById.get(target.offeringId);
			if (!component || !topic || !offering) {
				throw new Error(`${card.id} has an unknown curriculum target relationship.`);
			}
			if (
				component.specification_id !== offering.specification_id ||
				topic.specification_id !== offering.specification_id ||
				!isComponentAncestor(topic.id, component.id, componentById) ||
				!isComponentAncestor(offering.root_component_id, component.id, componentById)
			) {
				throw new Error(`${card.id} target is not in the offering's specification tree.`);
			}
			let selectableIds;
			try {
				selectableIds = JSON.parse(offering.selectable_component_ids_json);
			} catch {
				throw new Error(`${offering.id} has invalid selectable_component_ids_json.`);
			}
			if (
				Number(topic.selectable) !== 1 ||
				!Array.isArray(selectableIds) ||
				!selectableIds.includes(topic.id) ||
				Number(offering.enabled) !== 1 ||
				offering.board !== card.board ||
				offering.qualification !== card.qualification ||
				offering.profile_subject !== card.subject
			) {
				throw new Error(`${card.id} target is not selectable for ${offering.id}.`);
			}
		}
	}
}

function assertAllReferences(label, expected, rows) {
	const found = new Set(rows.map((row) => row.id));
	const missing = expected.filter((id) => !found.has(id));
	if (missing.length) throw new Error(`Unknown ${label} reference(s): ${missing.join(', ')}`);
}

function isComponentAncestor(ancestorId, componentId, componentById) {
	let current = componentById.get(componentId);
	while (current) {
		if (current.id === ancestorId) return true;
		current = current.parent_id ? componentById.get(current.parent_id) : null;
	}
	return false;
}

async function loadExisting(bundle) {
	const ids = bundle.cards.map((card) => card.id);
	const conceptClauses = bundle.cards.map(() => '(subject = ? AND concept_key = ?)');
	const cards = await d1Rows(
		`SELECT id, subject, concept_key, content_revision, content_hash,
		        source_fingerprint, generation_run_id, provenance_json, status, import_owner
		 FROM recall_cards
		 WHERE id IN (${ids.map(() => '?').join(', ')})
		    OR ${conceptClauses.join(' OR ')}`,
		[...ids, ...bundle.cards.flatMap((card) => [card.subject, card.conceptKey])],
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const generationRuns = await d1Rows(
		`SELECT id, schema_version, prompt_version, source_fingerprint,
		        artifact_hash, artifact_path, status, import_owner
		 FROM recall_generation_runs WHERE id = ?`,
		[bundle.run.id],
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const childRows = ids.length
		? await d1Rows(
				`SELECT 'recall_card_choices' AS table_name, id, card_id, import_owner
				 FROM recall_card_choices WHERE card_id IN (${ids.map(() => '?').join(', ')})
				 UNION ALL
				 SELECT 'recall_card_evidence' AS table_name, id, card_id, import_owner
				 FROM recall_card_evidence WHERE card_id IN (${ids.map(() => '?').join(', ')})
				 UNION ALL
				 SELECT 'recall_card_curriculum_targets' AS table_name,
				        card_id || ':' || offering_id AS id, card_id, import_owner
				 FROM recall_card_curriculum_targets WHERE card_id IN (${ids.map(() => '?').join(', ')})`,
				[...ids, ...ids, ...ids],
				{ rootDir, binding: 'QUESTION_DB' }
			)
		: [];
	return { cards, generationRun: generationRuns[0] ?? null, childRows };
}

async function verifyImport(bundle, artifactHash) {
	const ids = bundle.cards.map((card) => card.id);
	const rows = await d1Rows(
		`SELECT c.id, c.status, c.content_revision, c.content_hash,
		        c.source_fingerprint, c.generation_run_id, c.provenance_json,
		        (SELECT COUNT(*) FROM recall_card_choices x WHERE x.card_id = c.id) AS choice_count,
		        (SELECT SUM(is_correct) FROM recall_card_choices x WHERE x.card_id = c.id) AS correct_count,
		        (SELECT COUNT(*) FROM recall_card_evidence x WHERE x.card_id = c.id) AS evidence_count,
		        (SELECT COUNT(*) FROM recall_card_curriculum_targets x WHERE x.card_id = c.id AND x.reviewed = 1) AS reviewed_target_count,
		        (SELECT COUNT(*) FROM recall_card_curriculum_targets x WHERE x.card_id = c.id AND x.is_primary = 1 AND x.reviewed = 1) AS primary_target_count
		 FROM recall_cards c
		 WHERE c.id IN (${ids.map(() => '?').join(', ')})
		 ORDER BY c.id`,
		ids,
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const errors = recallStoredCardParentIssues(bundle, rows);
	const expectedChoiceCounts = new Map(bundle.cards.map((card) => [card.id, card.choices.length]));
	for (const row of rows) {
		if (
			Number(row.choice_count) !== expectedChoiceCounts.get(row.id) ||
			Number(row.correct_count) !== 1
		) {
			errors.push(`${row.id} choice invariant failed`);
		}
		if (Number(row.evidence_count) < 1) errors.push(`${row.id} has no evidence`);
		if (Number(row.reviewed_target_count) < 1 || Number(row.primary_target_count) !== 1) {
			errors.push(`${row.id} curriculum target invariant failed`);
		}
	}
	const [choiceRows, evidenceRows, targetRows] = await Promise.all([
		d1Rows(
			`SELECT id, card_id, display_order, choice_key, text, is_correct,
			        feedback, misconception, import_owner
			 FROM recall_card_choices
			 WHERE card_id IN (${ids.map(() => '?').join(', ')})
			 ORDER BY card_id, display_order`,
			ids,
			{ rootDir, binding: 'QUESTION_DB' }
		),
		d1Rows(
			`SELECT id, card_id, source_kind, specification_id, curriculum_component_id,
			        source_page_start, source_page_end, source_excerpt, source_file_hash,
			        excerpt_hash, supports_json, import_owner
			 FROM recall_card_evidence
			 WHERE card_id IN (${ids.map(() => '?').join(', ')})
			 ORDER BY card_id, id`,
			ids,
			{ rootDir, binding: 'QUESTION_DB' }
		),
		d1Rows(
			`SELECT card_id, offering_id, curriculum_component_id, topic_component_id,
			        is_primary, confidence, reviewed, mapping_source, import_owner
			 FROM recall_card_curriculum_targets
			 WHERE card_id IN (${ids.map(() => '?').join(', ')})
			 ORDER BY card_id, offering_id`,
			ids,
			{ rootDir, binding: 'QUESTION_DB' }
		)
	]);
	const expectedChoices = bundle.cards
		.flatMap((card) =>
			card.choices.map((choice) => ({
				id: choice.id,
				card_id: card.id,
				display_order: choice.displayOrder,
				choice_key: choice.choiceKey,
				text: choice.text,
				is_correct: choice.isCorrect ? 1 : 0,
				feedback: choice.feedback,
				misconception: choice.misconception,
				import_owner: RECALL_IMPORT_OWNER
			}))
		)
		.sort(compareRows('card_id', 'display_order'));
	const expectedEvidence = bundle.cards
		.flatMap((card) =>
			card.evidence.map((evidence) => ({
				id: evidence.id,
				card_id: card.id,
				source_kind: evidence.sourceKind,
				specification_id: evidence.specificationId,
				curriculum_component_id: evidence.curriculumComponentId,
				source_page_start: evidence.pageStart,
				source_page_end: evidence.pageEnd,
				source_excerpt: evidence.sourceExcerpt,
				source_file_hash: evidence.sourceFileHash,
				excerpt_hash: evidence.excerptHash,
				supports_json: stableStringify(evidence.supports),
				import_owner: RECALL_IMPORT_OWNER
			}))
		)
		.sort(compareRows('card_id', 'id'));
	const expectedTargets = bundle.cards
		.flatMap((card) =>
			card.targets.map((target) => ({
				card_id: card.id,
				offering_id: target.offeringId,
				curriculum_component_id: target.curriculumComponentId,
				topic_component_id: target.topicComponentId,
				is_primary: target.isPrimary ? 1 : 0,
				confidence: target.confidence,
				reviewed: target.reviewed ? 1 : 0,
				mapping_source: target.mappingSource,
				import_owner: RECALL_IMPORT_OWNER
			}))
		)
		.sort(compareRows('card_id', 'offering_id'));
	if (stableStringify(choiceRows) !== stableStringify(expectedChoices)) {
		errors.push('stored choice rows differ from the accepted artifact');
	}
	if (stableStringify(evidenceRows) !== stableStringify(expectedEvidence)) {
		errors.push('stored evidence rows differ from the accepted artifact');
	}
	if (stableStringify(targetRows) !== stableStringify(expectedTargets)) {
		errors.push('stored curriculum target rows differ from the accepted artifact');
	}
	const runRows = await d1Rows(
		`SELECT status, artifact_hash, source_fingerprint, import_owner
		 FROM recall_generation_runs WHERE id = ?`,
		[bundle.run.id],
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const run = runRows[0];
	if (
		!run ||
		run.status !== 'imported' ||
		run.artifact_hash !== artifactHash ||
		run.source_fingerprint !== bundle.source.fingerprint ||
		run.import_owner !== RECALL_IMPORT_OWNER
	) {
		errors.push('generation run verification failed');
	}
	if (errors.length) throw new Error(`Recall import verification failed: ${errors.join('; ')}`);
	return { run, cards: rows };
}

function compareRows(primary, secondary) {
	return (left, right) =>
		String(left[primary]).localeCompare(String(right[primary])) ||
		String(left[secondary]).localeCompare(String(right[secondary]));
}

function emit(report) {
	const json = `${JSON.stringify(report, null, 2)}\n`;
	if (args.output) writeFileSync(path.resolve(rootDir, args.output), json);
	console.log(json.trimEnd());
}
