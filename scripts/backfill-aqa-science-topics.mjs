#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import {
	AQA_SCIENCE_TOPICS,
	REVIEWED_TOPIC_BACKFILL_ROWS,
	aqaScienceTopicFieldsForImport
} from './lib/aqa-science-topic-mapping.mjs';
import { d1Query, d1Rows } from './lib/d1-rest.mjs';

const rootDir = process.cwd();
const write = process.argv.includes('--write');
const outputArg = process.argv.find((argument) => argument.startsWith('--output='));
const outputPath = outputArg?.slice('--output='.length) || null;
const manifestById = new Map(REVIEWED_TOPIC_BACKFILL_ROWS.map((row) => [row.id, row]));

const eligibleRows = await d1Rows(
	`SELECT q.id, q.source_document_id, q.source_question_ref, q.subject, q.subject_area,
	        q.component_code, q.topic_path_json, q.spec_ref
	 FROM questions q
	 JOIN question_answer_chains qac
	   ON qac.question_id = q.id AND qac.is_primary = 1
	 JOIN answer_chains ac ON ac.id = qac.answer_chain_id
	 WHERE q.status = 'published'
	   AND q.needs_human_review = 0
	   AND qac.needs_human_review = 0
	   AND ac.status = 'published'
	   AND ac.needs_human_review = 0
	   AND (q.subject_area IN ('Biology', 'Chemistry') OR q.subject IN ('Biology', 'Chemistry'))
	 ORDER BY q.id`,
	[],
	{ rootDir }
);

const eligibleById = new Map(eligibleRows.map((row) => [row.id, row]));
const changes = [];
const alreadyMapped = [];
const unresolved = [];
const conflicts = [];
const missingOrIneligible = [];

for (const manifest of REVIEWED_TOPIC_BACKFILL_ROWS) {
	const row = eligibleById.get(manifest.id);
	if (!row) {
		missingOrIneligible.push({ id: manifest.id, reason: 'not currently eligible or not present' });
		continue;
	}
	if (
		row.source_document_id !== manifest.sourceDocumentId ||
		row.source_question_ref !== manifest.sourceQuestionRef ||
		(row.subject_area ?? row.subject) !== manifest.subjectArea ||
		row.component_code !== manifest.componentCode
	) {
		conflicts.push({
			id: row.id,
			reason: 'database identity does not match reviewed manifest',
			expected: manifest,
			actual: {
				sourceDocumentId: row.source_document_id,
				sourceQuestionRef: row.source_question_ref,
				subjectArea: row.subject_area ?? row.subject,
				componentCode: row.component_code
			}
		});
		continue;
	}
	if (!manifest.topicCode) {
		unresolved.push({
			id: row.id,
			sourceDocumentId: row.source_document_id,
			sourceQuestionRef: row.source_question_ref,
			reason: manifest.reason
		});
		continue;
	}
	const derived = aqaScienceTopicFieldsForImport({
		...row,
		sourceDocumentId: row.source_document_id,
		sourceQuestionRef: row.source_question_ref,
		subjectArea: row.subject_area ?? row.subject,
		componentCode: row.component_code,
		topicPath: parseJson(row.topic_path_json, []),
		specRef: row.spec_ref
	});
	if (!derived.topic || derived.provenance === 'conflicting_trusted_evidence') {
		conflicts.push({
			id: row.id,
			reason: derived.provenance ?? 'reviewed mapping did not resolve to an official topic',
			currentSpecRef: row.spec_ref,
			currentTopicPath: parseJson(row.topic_path_json, [])
		});
		continue;
	}
	const nextTopicPathJson = JSON.stringify(derived.topicPath);
	if (
		row.spec_ref === derived.specRef &&
		canonicalJson(row.topic_path_json) === nextTopicPathJson
	) {
		alreadyMapped.push({
			id: row.id,
			specRef: derived.specRef,
			topicPath: derived.topicPath
		});
		continue;
	}
	changes.push({
		id: row.id,
		sourceDocumentId: row.source_document_id,
		sourceQuestionRef: row.source_question_ref,
		before: {
			specRef: row.spec_ref,
			topicPath: parseJson(row.topic_path_json, [])
		},
		after: { specRef: derived.specRef, topicPath: derived.topicPath },
		provenance: derived.provenance
	});
}

if (conflicts.length || missingOrIneligible.length) {
	const report = buildReport({
		status: 'blocked',
		changes,
		alreadyMapped,
		unresolved,
		conflicts,
		missingOrIneligible
	});
	emit(report);
	process.exitCode = 1;
} else {
	if (write) {
		if (changes.length) {
			const updatePayload = JSON.stringify(
				changes.map((change) => ({
					id: change.id,
					topicPathJson: JSON.stringify(change.after.topicPath),
					specRef: change.after.specRef
				}))
			);
			await d1Query(
				`WITH updates AS (
				   SELECT json_extract(value, '$.id') AS id,
				          json_extract(value, '$.topicPathJson') AS topic_path_json,
				          json_extract(value, '$.specRef') AS spec_ref
				   FROM json_each(?)
				 )
				 UPDATE questions
				 SET topic_path_json = (SELECT updates.topic_path_json FROM updates WHERE updates.id = questions.id),
				     spec_ref = (SELECT updates.spec_ref FROM updates WHERE updates.id = questions.id),
				     updated_at = CURRENT_TIMESTAMP
				 WHERE id IN (SELECT id FROM updates)
				   AND status = 'published'
				   AND needs_human_review = 0
				   AND EXISTS (
				     SELECT 1
				     FROM question_answer_chains qac
				     JOIN answer_chains ac ON ac.id = qac.answer_chain_id
				     WHERE qac.question_id = questions.id
				       AND qac.is_primary = 1
				       AND qac.needs_human_review = 0
				       AND ac.status = 'published'
				       AND ac.needs_human_review = 0
				   )`,
				[updatePayload],
				{ rootDir }
			);
		}
		const verification = await verifyChanges(changes);
		if (verification.length) {
			const report = buildReport({
				status: 'verification_failed',
				changes,
				alreadyMapped,
				unresolved,
				conflicts: verification,
				missingOrIneligible
			});
			emit(report);
			process.exitCode = 1;
		} else {
			emit(
				buildReport({
					status: 'applied',
					changes,
					alreadyMapped,
					unresolved,
					conflicts,
					missingOrIneligible
				})
			);
		}
	} else {
		emit(
			buildReport({
				status: 'dry_run',
				changes,
				alreadyMapped,
				unresolved,
				conflicts,
				missingOrIneligible
			})
		);
	}
}

function buildReport({
	status,
	changes,
	alreadyMapped,
	unresolved,
	conflicts,
	missingOrIneligible
}) {
	const mappedRows = [...changes, ...alreadyMapped];
	const byTopic = {};
	for (const row of mappedRows) {
		const specRef = row.after?.specRef ?? row.specRef;
		const manifest = manifestById.get(row.id);
		const definition = AQA_SCIENCE_TOPICS.find(
			(topic) =>
				topic.subjectArea === manifest?.subjectArea &&
				topic.course === manifest?.course &&
				topic.code === specRef
		);
		const key = `${manifest?.subjectArea} · ${manifest?.course} · ${specRef} ${definition?.title ?? ''}`;
		byTopic[key] = (byTopic[key] ?? 0) + 1;
	}
	return {
		status,
		writeRequested: write,
		scope: {
			description:
				'Frozen reviewed snapshot of currently eligible published, clean, primary-chained Biology/Chemistry questions',
			manifestRows: REVIEWED_TOPIC_BACKFILL_ROWS.length,
			mappedRows: REVIEWED_TOPIC_BACKFILL_ROWS.filter((row) => row.topicCode).length,
			intentionallyUnmappedRows: REVIEWED_TOPIC_BACKFILL_ROWS.filter((row) => !row.topicCode).length
		},
		counts: {
			changes: changes.length,
			alreadyMapped: alreadyMapped.length,
			unresolved: unresolved.length,
			conflicts: conflicts.length,
			missingOrIneligible: missingOrIneligible.length
		},
		coveragePercent: Number(
			(
				((changes.length + alreadyMapped.length) / REVIEWED_TOPIC_BACKFILL_ROWS.length) *
				100
			).toFixed(1)
		),
		byTopic,
		changes,
		alreadyMapped,
		unresolved,
		conflicts,
		missingOrIneligible
	};
}

async function verifyChanges(changes) {
	if (!changes.length) return [];
	const ids = changes.map((change) => change.id);
	const rows = await d1Rows(
		`SELECT id, topic_path_json, spec_ref
		 FROM questions
		 WHERE id IN (${ids.map(() => '?').join(', ')})`,
		ids,
		{ rootDir }
	);
	const byId = new Map(rows.map((row) => [row.id, row]));
	return changes.flatMap((change) => {
		const row = byId.get(change.id);
		if (
			row?.spec_ref === change.after.specRef &&
			canonicalJson(row.topic_path_json) === JSON.stringify(change.after.topicPath)
		) {
			return [];
		}
		return [
			{
				id: change.id,
				reason: 'stored values do not match the reviewed update',
				actual: row ?? null,
				expected: change.after
			}
		];
	});
}

function parseJson(value, fallback) {
	if (Array.isArray(value) || (value && typeof value === 'object')) return value;
	try {
		return JSON.parse(value ?? '') ?? fallback;
	} catch {
		return fallback;
	}
}

function canonicalJson(value) {
	return JSON.stringify(parseJson(value, []));
}

function emit(report) {
	const json = JSON.stringify(report, null, 2);
	if (outputPath) writeFileSync(outputPath, `${json}\n`);
	console.log(json);
}
