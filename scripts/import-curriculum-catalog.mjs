#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	CURRICULUM_IMPORT_OWNER,
	CURRICULUM_PROFILE_SNAPSHOT_ID,
	buildCurriculumImportSnapshot,
	buildCurriculumUpsertStatements,
	buildTrustedQuestionCurriculumMappings,
	stableStringify,
	validateCurriculumCatalog
} from './lib/curriculum-catalog.mjs';
import { d1Batch, d1Rows } from './lib/d1-rest.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(rootDir, args.input);
const outputPath = args.output ? path.resolve(rootDir, args.output) : null;

if (args.applySchema && !args.write) {
	fail('--apply-schema changes D1 and therefore requires --write.');
}

const rawCatalog = JSON.parse(readFileSync(inputPath, 'utf8'));
const catalog = validateCurriculumCatalog(rawCatalog, { rootDir });
const snapshot = buildCurriculumImportSnapshot(catalog);

let schemaPresent = await hasCurriculumSchema();
if (args.applySchema) {
	await applySchema();
	schemaPresent = await hasCurriculumSchema();
	if (!schemaPresent) fail('Curriculum schema was not visible after applying the migration.');
}
if (args.write && !schemaPresent) {
	fail(
		'Curriculum schema is absent. Re-run with --write --apply-schema for an explicit migration.'
	);
}

const questions = await loadEligibleQuestions(snapshot);
const questionMapping = buildTrustedQuestionCurriculumMappings(questions, snapshot);

const existing = schemaPresent ? await loadExistingCatalogRows(snapshot) : emptyExistingRows();
const reconciliation = reconcileExistingRows(snapshot, questionMapping.mappings, existing);
if (reconciliation.conflicts.length) {
	fail(
		`Catalog ownership/identity preflight found ${reconciliation.conflicts.length} conflicts.`,
		reconciliation.conflicts
	);
}
if (schemaPresent && reconciliation.staleComponentIds.length) {
	const cascadeConflicts = await loadStaleComponentCascadeConflicts(
		reconciliation.staleComponentIds
	);
	if (cascadeConflicts.length) {
		fail(
			`Stale component cleanup would affect ${cascadeConflicts.length} foreign-owned rows.`,
			cascadeConflicts
		);
	}
}

const cleanupStatements = buildCleanupStatements(reconciliation);
const upsertStatements = buildCurriculumUpsertStatements(snapshot, questionMapping.mappings);
const statements = [...cleanupStatements, ...upsertStatements];
let verification = null;

if (args.write) {
	await d1Batch(statements, { rootDir });
	verification = await verifyStoredSnapshot(snapshot, questionMapping.mappings);
}

const sampleOffering = snapshot.offerings.find((offering) => offering.isDefault) ?? null;
const profileSnapshot = snapshot.profileSnapshots.find(
	(snapshotRow) => snapshotRow.id === CURRICULUM_PROFILE_SNAPSHOT_ID
);
const report = {
	status: args.write ? 'applied' : 'dry_run',
	dryRun: !args.write,
	input: path.relative(rootDir, inputPath),
	schema: {
		present: schemaPresent,
		appliedThisRun: args.applySchema,
		migration: 'migrations/0017_curriculum_catalog.sql'
	},
	owner: CURRICULUM_IMPORT_OWNER,
	catalog: {
		schemaVersion: catalog.schemaVersion,
		generatedAt: catalog.generatedAt
	},
	counts: {
		specifications: snapshot.specifications.length,
		components: snapshot.components.length,
		offerings: snapshot.offerings.length,
		profileSnapshots: snapshot.profileSnapshots.length,
		eligibleQuestionsRead: questions.length,
		trustedQuestionMappings: questionMapping.mappings.length,
		unmappedQuestions: questionMapping.unmapped.length,
		ambiguousQuestionMappings: questionMapping.ambiguous.length,
		cleanupStatements: cleanupStatements.length,
		upsertStatements: upsertStatements.length,
		totalTransactionalStatements: statements.length,
		transactionPayloadBytes: Buffer.byteLength(JSON.stringify(statements)),
		largestStatementPayloadBytes: Math.max(
			0,
			...statements.map((statement) => Buffer.byteLength(JSON.stringify(statement)))
		)
	},
	cleanup: {
		questionMappings: reconciliation.staleMappingKeys.length,
		offerings: reconciliation.staleOfferingIds.length,
		components: reconciliation.staleComponentIds.length
	},
	runtimeContractPreview: {
		offering: sampleOffering
			? {
					id: sampleOffering.id,
					snapshotHash: sampleOffering.snapshotHash,
					groupCount: sampleOffering.selectionTree.groups.length,
					selectableComponentCount: sampleOffering.selectableComponentIds.length,
					selectionTree: sampleOffering.selectionTree
				}
			: null,
		profile: profileSnapshot
			? {
					id: profileSnapshot.id,
					sourceFingerprint: profileSnapshot.sourceFingerprint,
					subjectCount: profileSnapshot.options.subjects.length,
					options: profileSnapshot.options
				}
			: null
	},
	questionMapping: {
		unmapped: questionMapping.unmapped,
		ambiguous: questionMapping.ambiguous
	},
	verification
};

emit(report);

function parseArgs(argv) {
	const value = (name, fallback = null) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
	const input = value('input') ?? value('catalog') ?? 'data/curricula/curriculum-catalog.json';
	return {
		input,
		output: value('output'),
		write: argv.includes('--write'),
		applySchema: argv.includes('--apply-schema')
	};
}

async function hasCurriculumSchema() {
	const rows = await d1Rows(
		`SELECT name
		 FROM sqlite_master
		 WHERE type = 'table'
		   AND name IN (
		     'curriculum_specifications', 'curriculum_components', 'curriculum_offerings',
		     'curriculum_profile_snapshots', 'question_curriculum_components'
		   )`,
		[],
		{ rootDir }
	);
	return new Set(rows.map((row) => row.name)).size === 5;
}

async function applySchema() {
	const migrationPath = path.join(rootDir, 'migrations/0017_curriculum_catalog.sql');
	const sql = readFileSync(migrationPath, 'utf8');
	const statements = splitSqlStatements(sql).map((statement) => ({ sql: statement, params: [] }));
	await d1Batch(statements, { rootDir });
}

function splitSqlStatements(sql) {
	return sql
		.replace(/^\s*--.*$/gm, '')
		.split(';')
		.map((statement) => statement.trim())
		.filter(Boolean);
}

async function loadEligibleQuestions(snapshot) {
	const boards = [...new Set(snapshot.specifications.map((row) => row.board))];
	const qualifications = [...new Set(snapshot.specifications.map((row) => row.qualification))];
	return d1Rows(
		`SELECT id, status, needs_human_review, board, qualification, subject, subject_area,
		        component_code, spec_ref, year
		 FROM questions
		 WHERE status = 'published'
		   AND needs_human_review = 0
		   AND board IN (${boards.map(() => '?').join(', ')})
		   AND qualification IN (${qualifications.map(() => '?').join(', ')})
		 ORDER BY id`,
		[...boards, ...qualifications],
		{ rootDir }
	);
}

async function loadExistingCatalogRows(snapshot) {
	const specificationIds = snapshot.specifications.map((row) => row.id);
	return {
		specifications: await d1Rows(`SELECT * FROM curriculum_specifications`, [], { rootDir }),
		components: await d1Rows(`SELECT * FROM curriculum_components`, [], { rootDir }),
		offerings: await d1Rows(`SELECT * FROM curriculum_offerings`, [], { rootDir }),
		profileSnapshots: await d1Rows(`SELECT * FROM curriculum_profile_snapshots`, [], {
			rootDir
		}),
		questionMappings:
			specificationIds.length
				? await d1Rows(
						`SELECT *
					 FROM question_curriculum_components
					 WHERE specification_id IN (${specificationIds.map(() => '?').join(', ')})`,
						specificationIds,
						{ rootDir }
					)
				: []
	};
}

function emptyExistingRows() {
	return {
		specifications: [],
		components: [],
		offerings: [],
		profileSnapshots: [],
		questionMappings: []
	};
}

function reconcileExistingRows(snapshot, mappings, existing) {
	const conflicts = [];
	const specificationById = new Map(snapshot.specifications.map((row) => [row.id, row]));
	for (const row of existing.specifications) {
		const byId = specificationById.get(row.id);
		const byUnique = snapshot.specifications.find(
			(candidate) =>
				candidate.board === row.board &&
				candidate.qualification === row.qualification &&
				candidate.subject === row.subject &&
				candidate.course === row.course &&
				candidate.specificationCode === row.specification_code &&
				candidate.version === row.version
		);
		if (!byId && !byUnique) continue;
		if (row.import_owner !== CURRICULUM_IMPORT_OWNER) {
			conflicts.push({ table: 'curriculum_specifications', id: row.id, owner: row.import_owner });
		} else if (byUnique && byUnique.id !== row.id) {
			conflicts.push({
				table: 'curriculum_specifications',
				id: row.id,
				reason: `owned unique identity is already attached to ${row.id}, not ${byUnique.id}`
			});
		}
	}

	const desiredComponentIds = new Set(snapshot.components.map((row) => row.id));
	const scopeSpecificationIds = new Set(snapshot.specifications.map((row) => row.id));
	for (const row of existing.components) {
		const byId = desiredComponentIds.has(row.id);
		const byUnique = snapshot.components.some(
			(candidate) =>
				candidate.specificationId === row.specification_id &&
				(candidate.subjectArea ?? null) === (row.subject_area ?? null) &&
				candidate.code === row.code
		);
		if ((byId || byUnique) && row.import_owner !== CURRICULUM_IMPORT_OWNER) {
			conflicts.push({ table: 'curriculum_components', id: row.id, owner: row.import_owner });
		}
	}

	const desiredOfferingIds = new Set(snapshot.offerings.map((row) => row.id));
	for (const row of existing.offerings) {
		const byId = desiredOfferingIds.has(row.id);
		const byUnique = snapshot.offerings.some(
			(candidate) =>
				candidate.board === row.board &&
				candidate.qualification === row.qualification &&
				candidate.profileSubject === row.profile_subject &&
				candidate.course === row.course &&
				candidate.tier === row.tier
		);
		if ((byId || byUnique) && row.import_owner !== CURRICULUM_IMPORT_OWNER) {
			conflicts.push({ table: 'curriculum_offerings', id: row.id, owner: row.import_owner });
		}
	}

	const desiredSnapshotIds = new Set(snapshot.profileSnapshots.map((row) => row.id));
	for (const row of existing.profileSnapshots) {
		if (desiredSnapshotIds.has(row.id) && row.import_owner !== CURRICULUM_IMPORT_OWNER) {
			conflicts.push({
				table: 'curriculum_profile_snapshots',
				id: row.id,
				owner: row.import_owner
			});
		}
	}

	const desiredMappingKeys = new Set(
		mappings.map((row) => `${row.questionId}\u0000${row.curriculumComponentId}`)
	);
	const mappedQuestionIds = new Set(mappings.map((row) => row.questionId));
	for (const row of existing.questionMappings) {
		const key = `${row.question_id}\u0000${row.curriculum_component_id}`;
		const ours = String(row.mapping_source).startsWith(`${CURRICULUM_IMPORT_OWNER}:`);
		if (desiredMappingKeys.has(key) && !ours) {
			conflicts.push({
				table: 'question_curriculum_components',
				questionId: row.question_id,
				componentId: row.curriculum_component_id,
				mappingSource: row.mapping_source
			});
		} else if (
			mappedQuestionIds.has(row.question_id) &&
			Number(row.is_primary) === 1 &&
			!ours &&
			!desiredMappingKeys.has(key)
		) {
			conflicts.push({
				table: 'question_curriculum_components',
				questionId: row.question_id,
				componentId: row.curriculum_component_id,
				reason: 'foreign-owned primary mapping already exists'
			});
		}
	}

	return {
		conflicts,
		staleComponentIds: existing.components
			.filter(
				(row) =>
					scopeSpecificationIds.has(row.specification_id) &&
					row.import_owner === CURRICULUM_IMPORT_OWNER &&
					!desiredComponentIds.has(row.id)
			)
			.sort((a, b) => Number(b.depth) - Number(a.depth))
			.map((row) => row.id),
		staleOfferingIds: existing.offerings
			.filter(
				(row) =>
					scopeSpecificationIds.has(row.specification_id) &&
					row.import_owner === CURRICULUM_IMPORT_OWNER &&
					!desiredOfferingIds.has(row.id)
			)
			.map((row) => row.id),
		staleMappingKeys: existing.questionMappings
			.filter(
				(row) =>
					scopeSpecificationIds.has(row.specification_id) &&
					String(row.mapping_source).startsWith(`${CURRICULUM_IMPORT_OWNER}:`) &&
					!desiredMappingKeys.has(`${row.question_id}\u0000${row.curriculum_component_id}`)
			)
			.map((row) => [row.question_id, row.curriculum_component_id])
	};
}

async function loadStaleComponentCascadeConflicts(staleComponentIds) {
	const rows = await d1Rows(
		`WITH RECURSIVE stale(id) AS (
		   SELECT value FROM json_each(?)
		 ), descendants(id) AS (
		   SELECT id FROM stale
		   UNION
		   SELECT child.id
		   FROM curriculum_components child
		   JOIN descendants parent ON child.parent_id = parent.id
		 )
		 SELECT 'component' AS entity_kind, component.id, component.import_owner AS owner
		 FROM curriculum_components component
		 JOIN descendants ON descendants.id = component.id
		 WHERE component.import_owner <> ?
		 UNION ALL
		 SELECT 'question_mapping' AS entity_kind,
		        mapping.question_id || ':' || mapping.curriculum_component_id AS id,
		        mapping.mapping_source AS owner
		 FROM question_curriculum_components mapping
		 JOIN descendants ON descendants.id = mapping.curriculum_component_id
		 WHERE mapping.mapping_source NOT LIKE ?`,
		[JSON.stringify(staleComponentIds), CURRICULUM_IMPORT_OWNER, `${CURRICULUM_IMPORT_OWNER}:%`],
		{ rootDir }
	);
	return rows;
}

function buildCleanupStatements(reconciliation) {
	const statements = [];
	if (reconciliation.staleMappingKeys.length) {
		statements.push({
			sql: `DELETE FROM question_curriculum_components
			      WHERE mapping_source LIKE ?
			        AND EXISTS (
			          SELECT 1 FROM json_each(?) AS stale
			          WHERE json_extract(stale.value, '$[0]') = question_id
			            AND json_extract(stale.value, '$[1]') = curriculum_component_id
			        )`,
			params: [`${CURRICULUM_IMPORT_OWNER}:%`, JSON.stringify(reconciliation.staleMappingKeys)]
		});
	}
	if (reconciliation.staleOfferingIds.length) {
		statements.push({
			sql: `DELETE FROM curriculum_offerings
			      WHERE id IN (SELECT value FROM json_each(?)) AND import_owner = ?`,
			params: [JSON.stringify(reconciliation.staleOfferingIds), CURRICULUM_IMPORT_OWNER]
		});
	}
	if (reconciliation.staleComponentIds.length) {
		statements.push({
			sql: `DELETE FROM curriculum_components
			      WHERE id IN (SELECT value FROM json_each(?)) AND import_owner = ?`,
			params: [JSON.stringify(reconciliation.staleComponentIds), CURRICULUM_IMPORT_OWNER]
		});
	}
	return statements;
}

async function verifyStoredSnapshot(snapshot, mappings) {
	const expectedIds = {
		specifications: snapshot.specifications.map((row) => row.id),
		components: snapshot.components.map((row) => row.id),
		offerings: snapshot.offerings.map((row) => row.id),
		profiles: snapshot.profileSnapshots.map((row) => row.id)
	};
	const counts = {
		specifications: await countIds('curriculum_specifications', expectedIds.specifications),
		components: await countIds('curriculum_components', expectedIds.components),
		offerings: await countIds('curriculum_offerings', expectedIds.offerings),
		profileSnapshots: await countIds('curriculum_profile_snapshots', expectedIds.profiles)
	};
	const expectedCounts = {
		specifications: expectedIds.specifications.length,
		components: expectedIds.components.length,
		offerings: expectedIds.offerings.length,
		profileSnapshots: expectedIds.profiles.length
	};
	if (stableStringify(counts) !== stableStringify(expectedCounts)) {
		fail('Post-write normalized row counts did not match the validated snapshot.', {
			expectedCounts,
			actual: counts
		});
	}
	const sampleOffering = snapshot.offerings.find((offering) => offering.isDefault);
	const offeringRows = await d1Rows(
		`SELECT id, selection_tree_json, selectable_component_ids_json, snapshot_hash
		 FROM curriculum_offerings
		 WHERE board = ? AND qualification = ? AND profile_subject = ? AND course = ? AND tier = ?`,
		[
			sampleOffering.board,
			sampleOffering.qualification,
			sampleOffering.profileSubject,
			sampleOffering.course,
			sampleOffering.tier
		],
		{ rootDir }
	);
	if (offeringRows.length !== 1) fail('Expected an exact one-row offering read.', offeringRows);
	const storedOffering = offeringRows[0];
	if (
		stableStringify(JSON.parse(storedOffering.selection_tree_json)) !==
			stableStringify(sampleOffering.selectionTree) ||
		stableStringify(JSON.parse(storedOffering.selectable_component_ids_json)) !==
			stableStringify(sampleOffering.selectableComponentIds) ||
		storedOffering.snapshot_hash !== sampleOffering.snapshotHash
	) {
		fail('Stored offering snapshot differs from the validated runtime contract.');
	}
	const expectedProfile = snapshot.profileSnapshots[0];
	const profileRows = await d1Rows(
		`SELECT id, options_json, source_fingerprint
		 FROM curriculum_profile_snapshots
		 WHERE id = ?`,
		[expectedProfile.id],
		{ rootDir }
	);
	if (profileRows.length !== 1)
		fail('Expected an exact one-row profile snapshot read.', profileRows);
	if (
		stableStringify(JSON.parse(profileRows[0].options_json)) !==
			stableStringify(expectedProfile.options) ||
		profileRows[0].source_fingerprint !== expectedProfile.sourceFingerprint
	) {
		fail('Stored profile snapshot differs from the validated runtime contract.');
	}
	const mappingCountRows = await d1Rows(
		`SELECT COUNT(*) AS count
		 FROM question_curriculum_components
		 WHERE mapping_source LIKE ?
		   AND specification_id IN (${snapshot.specifications.map(() => '?').join(', ')})`,
		[`${CURRICULUM_IMPORT_OWNER}:%`, ...snapshot.specifications.map((row) => row.id)],
		{ rootDir }
	);
	const mappingCount = Number(mappingCountRows[0]?.count ?? 0);
	if (mappingCount !== mappings.length) {
		fail('Stored trusted question-mapping count differs from the validated plan.', {
			expected: mappings.length,
			actual: mappingCount
		});
	}
	return {
		counts: { ...counts, questionMappings: mappingCount },
		offeringRead: {
			rows: 1,
			id: storedOffering.id,
			snapshotHash: storedOffering.snapshot_hash
		},
		profileRead: {
			rows: 1,
			id: profileRows[0].id,
			sourceFingerprint: profileRows[0].source_fingerprint
		}
	};
}

async function countIds(table, ids) {
	if (!ids.length) return 0;
	const rows = await d1Rows(
		`SELECT COUNT(*) AS count
		 FROM ${table}
		 WHERE id IN (SELECT value FROM json_each(?))`,
		[JSON.stringify(ids)],
		{ rootDir }
	);
	return Number(rows[0]?.count ?? 0);
}

function emit(report) {
	const json = `${JSON.stringify(report, null, 2)}\n`;
	if (outputPath) writeFileSync(outputPath, json);
	process.stdout.write(json);
}

function fail(message, details = null) {
	if (details) process.stderr.write(`${JSON.stringify(details, null, 2)}\n`);
	throw new Error(message);
}
