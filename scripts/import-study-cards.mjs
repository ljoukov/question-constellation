#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- CLI inputs are validated before any D1 query or write.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { d1Batch, d1Rows } from './lib/d1-rest.mjs';
import {
	STUDY_CARD_IMPORT_OWNER,
	expectedStudyCardArtifactPath,
	hashStudyCardArtifact,
	stableStringify,
	validateStudyCardBundle
} from './lib/study-card-artifact.mjs';
import {
	assertStudyCardCurriculumScope,
	buildStudyCardImportStatements,
	planStudyCardImport,
	storedStudyCardIssues
} from './lib/study-card-import.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
if (!args.input) fail('--input=<accepted-study-cards.json> is required.');

const inputPath = path.resolve(rootDir, args.input);
const bundle = validateStudyCardBundle(JSON.parse(readFileSync(inputPath, 'utf8')));
const curriculumCatalog = JSON.parse(
	readFileSync(path.join(rootDir, 'data/curricula/curriculum-catalog.json'), 'utf8')
);
assertStudyCardCurriculumScope(bundle, curriculumCatalog);
const artifactHash = hashStudyCardArtifact(bundle);
const artifactPath = toPosixPath(path.relative(rootDir, inputPath));

if (args.write) {
	const durablePath = expectedStudyCardArtifactPath({
		rootDir,
		releaseId: bundle.release.id
	});
	if (inputPath !== durablePath || artifactPath !== bundle.release.artifactPath) {
		fail(
			`--write accepts only ${bundle.release.artifactPath}; copy the reviewed artifact there before importing.`
		);
	}
}

if (args.validateOnly) {
	emit({
		status: 'valid',
		dryRun: true,
		input: artifactPath,
		artifactHash,
		releaseId: bundle.release.id,
		owner: STUDY_CARD_IMPORT_OWNER,
		counts: bundleCounts(bundle)
	});
	process.exit(0);
}

await requireSchema();
await requireCurriculumReferences(bundle);
const existing = await loadExisting(bundle);
const plan = planStudyCardImport(bundle, existing, {
	artifactHash,
	artifactPath: bundle.release.artifactPath
});
if (plan.conflicts.length) {
	emit({ status: 'conflict', dryRun: !args.write, input: artifactPath, artifactHash, plan });
	process.exit(1);
}

const statements = buildStudyCardImportStatements(bundle, plan);
let verification = null;
if (args.write) {
	if (statements.length) {
		await d1Batch(statements, { rootDir, binding: 'QUESTION_DB' });
	}
	verification = await verifyImport(bundle, artifactHash);
}

emit({
	status: args.write ? (plan.action === 'noop' ? 'already_imported' : 'imported') : 'dry_run',
	dryRun: !args.write,
	input: artifactPath,
	artifactHash,
	releaseId: bundle.release.id,
	owner: STUDY_CARD_IMPORT_OWNER,
	plan,
	statementCount: statements.length,
	transactionPayloadBytes: Buffer.byteLength(JSON.stringify(statements)),
	verification
});

function parseArgs(argv) {
	const value = (name) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
	return {
		help: argv.includes('--help') || argv.includes('-h'),
		input: value('input'),
		output: value('output'),
		validateOnly: argv.includes('--validate-only'),
		write: argv.includes('--write')
	};
}

function usage() {
	return `Usage:
node scripts/import-study-cards.mjs --input=<accepted-study-cards.json> [options]

The default performs a read-only QUESTION_DB schema, curriculum-reference,
ownership and identity preflight. A release is append-only; changed content
requires a new release id and a newly reviewed accepted artifact.

Options:
  --validate-only   validate and hash the versioned artifact without D1 access
  --write           atomically import draft cards, children, coverage and release
  --output=<path>   also write the JSON report to this path
  --help            show this help`;
}

async function requireSchema() {
	const tables = [
		'study_card_releases',
		'study_cards',
		'study_card_choices',
		'study_card_sources',
		'study_card_targets',
		'study_deck_coverage',
		'curriculum_specifications',
		'curriculum_components',
		'curriculum_offerings'
	];
	const rows = await d1Rows(
		`SELECT name FROM sqlite_master
		 WHERE type = 'table' AND name IN (${tables.map(() => '?').join(', ')})`,
		tables,
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const found = new Set(rows.map((row) => row.name));
	const missing = tables.filter((name) => !found.has(name));
	if (missing.length) {
		fail(
			`Study-card schema is absent: ${missing.join(', ')}. Apply migrations/0021_study_card_catalog.sql first.`
		);
	}

	const triggers = [
		'study_card_releases_insert_as_accepted',
		'study_cards_insert_as_draft',
		'study_card_releases_import_expected_counts',
		'study_card_releases_import_coverage_counts',
		'study_cards_publish_choice_count',
		'study_cards_publish_sources',
		'study_cards_publish_targets',
		'study_cards_publish_target_coverage',
		'study_cards_published_content_immutable',
		'study_card_choices_published_parent_update',
		'study_card_sources_published_parent_update',
		'study_card_targets_published_parent_update'
	];
	const triggerRows = await d1Rows(
		`SELECT name FROM sqlite_master
		 WHERE type = 'trigger' AND name IN (${triggers.map(() => '?').join(', ')})`,
		triggers,
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const installed = new Set(triggerRows.map((row) => row.name));
	const missingTriggers = triggers.filter((name) => !installed.has(name));
	if (missingTriggers.length) {
		fail(`Study-card publication guards are absent: ${missingTriggers.join(', ')}.`);
	}
}

async function requireCurriculumReferences(bundle) {
	const offeringIds = [
		...new Set([
			...bundle.cards.flatMap((card) => card.targets.map((target) => target.offeringId)),
			...bundle.coverage.map((row) => row.offeringId)
		])
	];
	const offerings = await d1Rows(
		`SELECT id, board, qualification, profile_subject, tier, specification_id,
		        root_component_id, selectable_component_ids_json, enabled
		 FROM curriculum_offerings
		 WHERE id IN (${offeringIds.map(() => '?').join(', ')})`,
		offeringIds,
		{ rootDir, binding: 'QUESTION_DB' }
	);
	assertAllReferences('curriculum offering', offeringIds, offerings);
	const specificationIds = [...new Set(offerings.map((row) => row.specification_id))];
	const components = await d1Rows(
		`SELECT id, specification_id, parent_id, selectable, tier_json
		 FROM curriculum_components
		 WHERE specification_id IN (${specificationIds.map(() => '?').join(', ')})`,
		specificationIds,
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const offeringById = new Map(offerings.map((row) => [row.id, row]));
	const componentById = new Map(components.map((row) => [row.id, row]));
	for (const component of components) {
		try {
			component.tier = JSON.parse(component.tier_json);
		} catch {
			fail(`${component.id} has invalid tier_json.`);
		}
		if (!Array.isArray(component.tier)) fail(`${component.id} tier_json must be an array.`);
	}
	const selectableByOffering = new Map(
		offerings.map((offering) => {
			let ids;
			try {
				ids = JSON.parse(offering.selectable_component_ids_json);
			} catch {
				fail(`${offering.id} has invalid selectable_component_ids_json.`);
			}
			if (!Array.isArray(ids)) fail(`${offering.id} selectable ids must be an array.`);
			return [offering.id, new Set(ids)];
		})
	);

	for (const card of bundle.cards) {
		for (const target of card.targets) {
			const offering = offeringById.get(target.offeringId);
			const component = componentById.get(target.curriculumComponentId);
			const topic = componentById.get(target.topicComponentId);
			if (!offering || !component || !topic) {
				fail(`${card.id} has an unknown curriculum target relationship.`);
			}
			if (
				Number(offering.enabled) !== 1 ||
				offering.board !== card.board ||
				offering.qualification !== card.qualification ||
				offering.profile_subject !== card.subject ||
				component.specification_id !== offering.specification_id ||
				topic.specification_id !== offering.specification_id ||
				Number(topic.selectable) !== 1 ||
				!selectableByOffering.get(offering.id).has(topic.id) ||
				!isComponentAncestor(topic.id, component.id, componentById) ||
				(offering.root_component_id &&
					!isComponentAncestor(offering.root_component_id, component.id, componentById)) ||
				(offering.tier === 'Foundation' && hasHigherOnlyAncestor(component.id, componentById))
			) {
				fail(`${card.id} target is not selectable for ${offering.id}.`);
			}
		}
	}

	for (const coverage of bundle.coverage) {
		const offering = offeringById.get(coverage.offeringId);
		const topic = componentById.get(coverage.topicComponentId);
		if (
			!offering ||
			!topic ||
			Number(offering.enabled) !== 1 ||
			topic.specification_id !== offering.specification_id ||
			Number(topic.selectable) !== 1 ||
			!selectableByOffering.get(offering.id).has(topic.id)
		) {
			fail(
				`Coverage ${coverage.offeringId}/${coverage.topicComponentId} is not a selectable topic.`
			);
		}
	}
}

async function loadExisting(bundle) {
	const releases = await d1Rows(
		`SELECT id, schema_version, prompt_version,
		        generator_model, generator_thinking_level, generator_run_id,
		        reviewer_model, reviewer_thinking_level, reviewer_run_id,
		        source_manifest_hash, artifact_hash, artifact_path,
		        expected_card_count, expected_coverage_count, status, import_owner
		 FROM study_card_releases WHERE id = ?`,
		[bundle.release.id],
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const ids = bundle.cards.map((card) => card.id);
	const cards = ids.length
		? await d1Rows(
				`SELECT id, release_id, content_hash, status, needs_human_review, import_owner
			 FROM study_cards WHERE id IN (${ids.map(() => '?').join(', ')})`,
				ids,
				{ rootDir, binding: 'QUESTION_DB' }
			)
		: [];
	return { releases, cards };
}

async function verifyImport(bundle, artifactHash) {
	const releaseRows = await d1Rows(
		`SELECT id, status, artifact_hash, artifact_path, source_manifest_hash,
		        expected_card_count, expected_coverage_count, import_owner,
		        (SELECT COUNT(*) FROM study_cards card WHERE card.release_id = release.id) AS card_count,
		        (SELECT COUNT(*) FROM study_deck_coverage coverage
		         WHERE coverage.release_id = release.id) AS coverage_count
		 FROM study_card_releases release WHERE id = ?`,
		[bundle.release.id],
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const release = releaseRows[0];
	if (
		!release ||
		release.status !== 'imported' ||
		release.artifact_hash !== artifactHash ||
		release.artifact_path !== bundle.release.artifactPath ||
		release.source_manifest_hash !== bundle.release.sourceManifestHash ||
		release.import_owner !== STUDY_CARD_IMPORT_OWNER ||
		Number(release.card_count) !== bundle.cards.length ||
		Number(release.coverage_count) !== bundle.coverage.length
	) {
		fail('Stored study-card release verification failed.');
	}

	const ids = bundle.cards.map((card) => card.id);
	const cards = ids.length
		? await d1Rows(
				`SELECT card.id, card.release_id, card.status, card.needs_human_review,
			        card.content_hash, card.source_fingerprint, card.import_owner,
			        (SELECT COUNT(*) FROM study_card_choices choice
			         WHERE choice.card_id = card.id) AS choice_count,
			        (SELECT SUM(is_correct) FROM study_card_choices choice
			         WHERE choice.card_id = card.id) AS correct_count,
			        (SELECT COUNT(*) FROM study_card_sources source
			         WHERE source.card_id = card.id) AS source_count,
			        (SELECT COUNT(*) FROM study_card_targets target
			         WHERE target.card_id = card.id AND target.reviewed = 1) AS target_count,
			        (SELECT COUNT(*) FROM study_card_targets target
			         WHERE target.card_id = card.id AND target.reviewed = 1
			           AND target.is_primary = 1) AS primary_count
			 FROM study_cards card
			 WHERE card.id IN (${ids.map(() => '?').join(', ')}) ORDER BY card.id`,
				ids,
				{ rootDir, binding: 'QUESTION_DB' }
			)
		: [];
	const errors = storedStudyCardIssues(bundle, cards);
	const expectedChoiceCounts = new Map(bundle.cards.map((card) => [card.id, card.choices.length]));
	for (const card of cards) {
		if (
			Number(card.choice_count) !== expectedChoiceCounts.get(card.id) ||
			Number(card.choice_count) < 3 ||
			Number(card.choice_count) > 4 ||
			Number(card.correct_count) !== 1
		) {
			errors.push(`${card.id} choice invariant failed`);
		}
		if (Number(card.source_count) < 1) errors.push(`${card.id} has no source`);
		if (Number(card.target_count) < 1 || Number(card.primary_count) !== 1) {
			errors.push(`${card.id} curriculum target invariant failed`);
		}
	}

	const coverage = await d1Rows(
		`SELECT offering_id, topic_component_id, status, reason, card_count, reviewed, import_owner
		 FROM study_deck_coverage WHERE release_id = ?
		 ORDER BY offering_id, topic_component_id`,
		[bundle.release.id],
		{ rootDir, binding: 'QUESTION_DB' }
	);
	const expectedCoverage = bundle.coverage.map((row) => ({
		offering_id: row.offeringId,
		topic_component_id: row.topicComponentId,
		status: row.status,
		reason: row.reason,
		card_count: row.cardCount,
		reviewed: 1,
		import_owner: STUDY_CARD_IMPORT_OWNER
	}));
	if (stableStringify(coverage) !== stableStringify(expectedCoverage)) {
		errors.push('stored coverage differs from the accepted artifact');
	}
	if (errors.length) fail(`Study-card import verification failed: ${errors.join('; ')}`);
	return { release, cards, coverage };
}

function assertAllReferences(label, expected, rows) {
	const found = new Set(rows.map((row) => row.id));
	const missing = expected.filter((id) => !found.has(id));
	if (missing.length) fail(`Unknown ${label} reference(s): ${missing.join(', ')}`);
}

function isComponentAncestor(ancestorId, componentId, componentById) {
	let current = componentById.get(componentId);
	while (current) {
		if (current.id === ancestorId) return true;
		current = current.parent_id ? componentById.get(current.parent_id) : null;
	}
	return false;
}

function hasHigherOnlyAncestor(componentId, componentById) {
	const visited = new Set();
	let current = componentById.get(componentId);
	while (current) {
		if (visited.has(current.id)) return true;
		visited.add(current.id);
		if (Array.isArray(current.tier) && current.tier.length === 1 && current.tier[0] === 'Higher') {
			return true;
		}
		if (!current.parent_id) return false;
		current = componentById.get(current.parent_id);
		if (!current) return true;
	}
	return true;
}

function bundleCounts(bundle) {
	return {
		cards: bundle.cards.length,
		choices: bundle.cards.reduce((sum, card) => sum + card.choices.length, 0),
		sources: bundle.cards.reduce((sum, card) => sum + card.sources.length, 0),
		targets: bundle.cards.reduce((sum, card) => sum + card.targets.length, 0),
		coverage: bundle.coverage.length,
		readyCoverage: bundle.coverage.filter((row) => row.status === 'ready').length,
		withheldCoverage: bundle.coverage.filter((row) => row.status === 'withheld').length
	};
}

function toPosixPath(value) {
	return value.split(path.sep).join('/');
}

function emit(report) {
	const json = `${JSON.stringify(report, null, 2)}\n`;
	if (args.output) writeFileSync(path.resolve(rootDir, args.output), json);
	console.log(json.trimEnd());
}

function fail(message) {
	throw new Error(message);
}
