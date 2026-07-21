#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { d1Rows } from './lib/d1-rest.mjs';

const MAX_SNAPSHOT_CHARACTERS = 524_288;

function integerArg(name) {
	const raw = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
	if (!raw) return null;
	const value = Number(raw.slice(name.length + 3));
	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`--${name} must be a positive integer.`);
	}
	return value;
}

function wait(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function refreshWithRetry(refresh, user) {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const result = await refresh(user);
		if (result.status === 'refreshed' || result.status === 'current') return result;
		if (result.status !== 'busy' && result.status !== 'superseded') return result;
		await wait(250 * (attempt + 1));
	}
	return { status: 'failed' };
}

export async function prewarmUserHomeSnapshots({
	rootDir = process.cwd(),
	dryRun = false,
	limit = null
} = {}) {
	const users = await d1Rows(
		`SELECT uid, email, name, photo_url
		   FROM user_profiles
		  ORDER BY uid
		  ${limit ? 'LIMIT ?' : ''}`,
		limit ? [limit] : [],
		{ rootDir, binding: 'PERSONAL_DB' }
	);
	if (dryRun) {
		const summary = { selected_users: users.length, dry_run: true };
		console.log(JSON.stringify(summary, null, 2));
		return summary;
	}

	const { createServer } = await import('vite');
	const vite = await createServer({
		root: rootDir,
		logLevel: 'error',
		appType: 'custom',
		server: { middlewareMode: true }
	});
	const statusCounts = new Map();
	try {
		const homeSnapshot = await vite.ssrLoadModule('/src/lib/server/homeSnapshot.ts');
		for (const [index, row] of users.entries()) {
			const result = await refreshWithRetry(homeSnapshot.refreshUserHomeSnapshot, {
				uid: row.uid,
				email: row.email,
				name: row.name,
				photoUrl: row.photo_url
			});
			statusCounts.set(result.status, (statusCounts.get(result.status) ?? 0) + 1);
			if (result.status !== 'refreshed' && result.status !== 'current') {
				throw new Error(
					`Selected user snapshot ${index + 1} of ${users.length} could not be prewarmed (${result.status}).`
				);
			}
		}
	} finally {
		await vite.close();
	}

	const selectedUserIds = users.map((row) => row.uid);
	const [verification] = await d1Rows(
		`SELECT
		   COUNT(*) AS total_rows,
		   SUM(
		     CASE
		       WHEN schema_version = 3
		        AND dirty = 0
		        AND source_revision = snapshot_revision
		        AND json_extract(payload_json, '$.version') = 3
		        AND json_type(payload_json, '$.subjectViews') = 'array'
		       THEN 1 ELSE 0
		     END
		   ) AS current_v3_rows,
		   MAX(length(payload_json)) AS max_payload_characters
		 FROM user_home_snapshots
		 WHERE user_id IN (${selectedUserIds.map(() => '?').join(', ')})`,
		selectedUserIds,
		{ rootDir, binding: 'PERSONAL_DB' }
	);
	const maxPayloadCharacters = Number(verification?.max_payload_characters ?? 0);
	if (
		Number(verification?.current_v3_rows ?? 0) !== Number(verification?.total_rows ?? 0) ||
		maxPayloadCharacters > MAX_SNAPSHOT_CHARACTERS
	) {
		throw new Error('Snapshot prewarm verification failed.');
	}
	const summary = {
		selected_users: users.length,
		refreshed: statusCounts.get('refreshed') ?? 0,
		already_current: statusCounts.get('current') ?? 0,
		current_v3_rows: Number(verification?.current_v3_rows ?? 0),
		total_snapshot_rows: Number(verification?.total_rows ?? 0),
		max_payload_characters: maxPayloadCharacters,
		payload_limit_characters: MAX_SNAPSHOT_CHARACTERS,
		dry_run: false
	};
	console.log(JSON.stringify(summary, null, 2));
	return summary;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	prewarmUserHomeSnapshots({
		rootDir: process.cwd(),
		dryRun: process.argv.includes('--dry-run'),
		limit: integerArg('limit')
	}).catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
