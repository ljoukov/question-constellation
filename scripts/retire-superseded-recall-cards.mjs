#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { d1Batch, d1Rows } from './lib/d1-rest.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
const manifestPath = path.resolve(rootDir, args.manifest);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (manifest.schemaVersion !== 'recall-card-retirement-v1') {
	throw new Error('Retirement manifest must use recall-card-retirement-v1.');
}
if (!Array.isArray(manifest.cards) || manifest.cards.length === 0) {
	throw new Error('Retirement manifest must contain at least one card.');
}

const cardIds = manifest.cards.flatMap((card) => [card.id, card.replacementId]);
if (new Set(cardIds).size !== cardIds.length) {
	throw new Error('Retirement and replacement card ids must be unique.');
}
const rows = await d1Rows(
	`SELECT id, status, content_revision, content_hash, generation_run_id, import_owner
	   FROM recall_cards
	  WHERE id IN (${cardIds.map(() => '?').join(', ')})`,
	cardIds,
	{ rootDir, binding: 'QUESTION_DB' }
);
const byId = new Map(rows.map((row) => [row.id, row]));
const conflicts = [];
const pendingCards = [];
for (const card of manifest.cards) {
	const current = byId.get(card.id);
	const replacement = byId.get(card.replacementId);
	if (!current) {
		conflicts.push({ id: card.id, reason: 'retirement card is missing' });
	} else {
		for (const [field, expected] of [
			['content_revision', card.expectedContentRevision],
			['content_hash', card.expectedContentHash],
			['generation_run_id', card.expectedGenerationRunId],
			['import_owner', 'recall-card-import/v1']
		]) {
			if (current[field] !== expected) {
				conflicts.push({
					id: card.id,
					reason: `${field} changed`,
					expected,
					actual: current[field]
				});
			}
		}
		if (current.status === card.expectedStatus) pendingCards.push(card);
		else if (current.status !== 'retired') {
			conflicts.push({
				id: card.id,
				reason: 'status changed',
				expected: `${card.expectedStatus} or retired`,
				actual: current.status
			});
		}
	}
	if (
		!replacement ||
		replacement.status !== 'published' ||
		replacement.generation_run_id !== card.replacementGenerationRunId ||
		replacement.import_owner !== 'recall-card-import/v1'
	) {
		conflicts.push({
			id: card.replacementId,
			reason: 'reviewed replacement is not the expected published compiler-owned card'
		});
	}
}

if (conflicts.length > 0) {
	emit({ status: 'conflict', dryRun: !args.write, manifest: relative(manifestPath), conflicts });
	process.exit(1);
}

const statements = pendingCards.map((card) => ({
	sql: `UPDATE recall_cards
	         SET status = 'retired', updated_at = CURRENT_TIMESTAMP
	       WHERE id = ? AND status = ? AND content_revision = ? AND content_hash = ?
	         AND generation_run_id = ? AND import_owner = 'recall-card-import/v1'`,
	params: [
		card.id,
		card.expectedStatus,
		card.expectedContentRevision,
		card.expectedContentHash,
		card.expectedGenerationRunId
	]
}));

let verification = null;
if (args.write) {
	if (statements.length > 0) {
		await d1Batch(statements, { rootDir, binding: 'QUESTION_DB' });
	}
	verification = await d1Rows(
		`SELECT id, status, content_revision, content_hash, generation_run_id
		   FROM recall_cards
		  WHERE id IN (${manifest.cards.map(() => '?').join(', ')})
		  ORDER BY id`,
		manifest.cards.map((card) => card.id),
		{ rootDir, binding: 'QUESTION_DB' }
	);
	if (
		verification.length !== manifest.cards.length ||
		verification.some((row) => row.status !== 'retired')
	) {
		throw new Error('Post-write retirement verification failed.');
	}
}

emit({
	status: args.write ? 'retired' : 'dry_run',
	dryRun: !args.write,
	manifest: relative(manifestPath),
	reason: manifest.reason,
	count: manifest.cards.length,
	pendingCount: pendingCards.length,
	alreadyRetiredCount: manifest.cards.length - pendingCards.length,
	statements,
	verification
});

function parseArgs(argv) {
	const value = (name, fallback) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
	return {
		manifest: value(
			'manifest',
			'data/recall/migrations/combined-biology-cell-structure-v8-rollout.json'
		),
		write: argv.includes('--write')
	};
}

function emit(value) {
	console.log(JSON.stringify(value, null, 2));
}

function relative(filePath) {
	return path.relative(rootDir, filePath);
}
