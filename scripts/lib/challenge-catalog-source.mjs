import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { d1Rows } from './d1-rest.mjs';
import { CHALLENGE_CATALOG_SOURCE_SCHEMA, canonicalHash } from './challenge-catalog-bundle.mjs';

/**
 * Load the complete current catalogue from an explicit ignored-workspace
 * snapshot or directly from the active D1 release. Generation and review
 * workflows must never import authored content from src/.
 */
export async function loadChallengeCatalogSource({
	rootDir = process.cwd(),
	sourcePath = process.env.CHALLENGE_CATALOG_SOURCE ?? null
} = {}) {
	if (sourcePath) {
		const absolutePath = resolveChallengeCatalogSourcePath({ rootDir, sourcePath });
		if (!existsSync(absolutePath)) {
			throw new Error(`Challenge catalogue source does not exist: ${absolutePath}`);
		}
		return normalizeChallengeCatalogSource(JSON.parse(readFileSync(absolutePath, 'utf8')), {
			source: path.relative(rootDir, absolutePath).replaceAll(path.sep, '/')
		});
	}

	const stateRows = await d1Rows(
		`SELECT r.id AS release_id, r.content_sha256, r.challenge_count
		   FROM challenge_catalog_state AS s
		   JOIN challenge_catalog_releases AS r
		     ON r.id = s.release_id
		    AND r.status = 'published'
		    AND r.content_sha256 = s.content_sha256
		  WHERE s.state_key = 'active'
		  LIMIT 1`
	);
	const state = stateRows[0];
	if (!state) {
		throw new Error(
			'No active D1 challenge catalogue exists. Pass --catalog-source=<ignored JSON snapshot>.'
		);
	}
	const rows = await d1Rows(
		`SELECT display_order, record_json, content_sha256
		   FROM challenge_catalog_entries
		  WHERE release_id = ?
		  ORDER BY display_order`,
		[state.release_id]
	);
	if (rows.length !== state.challenge_count) {
		throw new Error(
			`Active D1 challenge catalogue read ${rows.length}/${state.challenge_count} records.`
		);
	}
	const records = rows.map((row, index) => {
		const record = JSON.parse(row.record_json);
		if (record.displayOrder !== index || canonicalHash(record) !== row.content_sha256) {
			throw new Error(`Active D1 challenge record ${index} failed exact hash-bound readback.`);
		}
		return record;
	});
	const indexRows = await d1Rows(
		`SELECT payload_json
		   FROM challenge_route_payloads
		  WHERE release_id = ?
		    AND route_path = ?
		  LIMIT 1`,
		[state.release_id, '/_challenge-index']
	);
	const indexPayload = indexRows[0] ? JSON.parse(indexRows[0].payload_json) : null;
	if (
		!indexPayload ||
		indexPayload.releaseId !== state.release_id ||
		!Array.isArray(indexPayload.subjects) ||
		!Array.isArray(indexPayload.arcs)
	) {
		throw new Error(`Active D1 challenge release ${state.release_id} has no valid index payload.`);
	}
	const unsigned = {
		schemaVersion: CHALLENGE_CATALOG_SOURCE_SCHEMA,
		release: {
			id: state.release_id,
			contentSha256: state.content_sha256,
			challengeCount: state.challenge_count
		},
		records,
		subjects: indexPayload.subjects,
		arcs: indexPayload.arcs,
		socialImage: indexPayload.socialImage
	};
	return normalizeChallengeCatalogSource(
		{ ...unsigned, contentSha256: canonicalHash(unsigned) },
		{ source: `d1:${state.release_id}` }
	);
}

export function resolveChallengeCatalogSourcePath({ rootDir = process.cwd(), sourcePath }) {
	const absolutePath = path.resolve(rootDir, sourcePath);
	const ignoredRoot = path.resolve(rootDir, 'tmp');
	const relativeToIgnored = path.relative(ignoredRoot, absolutePath);
	if (!existsSync(path.join(rootDir, '.git'))) {
		const relativeToFixtureRoot = path.relative(rootDir, absolutePath);
		if (
			relativeToFixtureRoot &&
			!relativeToFixtureRoot.startsWith(`..${path.sep}`) &&
			!path.isAbsolute(relativeToFixtureRoot)
		) {
			return absolutePath;
		}
	}
	if (
		!relativeToIgnored ||
		relativeToIgnored.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relativeToIgnored)
	) {
		throw new Error('Challenge catalogue source must be an ignored JSON file under tmp/.');
	}
	return absolutePath;
}

export function normalizeChallengeCatalogSource(value, { source = '<memory>' } = {}) {
	if (value?.schemaVersion !== CHALLENGE_CATALOG_SOURCE_SCHEMA) {
		throw new Error(`Unsupported challenge catalogue source schema: ${source}`);
	}
	const unsigned = { ...value };
	delete unsigned.contentSha256;
	if (typeof value.contentSha256 !== 'string' || canonicalHash(unsigned) !== value.contentSha256) {
		throw new Error(`Challenge catalogue source hash is invalid: ${source}`);
	}
	const records = value.records;
	const release = value.release ?? null;
	if (!Array.isArray(records) || records.length === 0) {
		throw new Error(`Challenge catalogue source is empty: ${source}`);
	}
	const definitions = records.map((record) => record?.definition);
	const ids = definitions.map((definition) => definition?.id);
	const routes = definitions.map((definition) => `${definition?.subject}/${definition?.slug}`);
	if (
		ids.some((id) => typeof id !== 'string' || !id) ||
		new Set(ids).size !== ids.length ||
		new Set(routes).size !== routes.length
	) {
		throw new Error(`Challenge catalogue source has invalid or duplicate identities: ${source}`);
	}
	return {
		source,
		contentSha256: value.contentSha256,
		release,
		records,
		definitions,
		subjects: Array.isArray(value.subjects) ? value.subjects : [],
		arcs: Array.isArray(value.arcs) ? value.arcs : [],
		socialImage: value.socialImage ?? null
	};
}
