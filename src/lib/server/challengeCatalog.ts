import {
	CHALLENGE_CATALOG_INDEX_PATH,
	CHALLENGE_CATALOG_ROUTE_SCHEMA,
	type ChallengeCatalogIndexPayload,
	type ChallengeDetailPayload,
	type ChallengeHubPayload,
	type ChallengeSubjectPayload
} from '$lib/challenges/catalogPayloads';
import { normalizeChallengeSubject } from '$lib/challenges/routing';
import { queryFirst } from './db';

type ChallengeRoutePayloadRow = {
	payload_json: string;
	payload_sha256: string;
	release_id: string;
	release_sha256: string;
};

export async function getChallengeCatalogIndex(): Promise<ChallengeCatalogIndexPayload | null> {
	return await getActiveChallengeRoutePayload<ChallengeCatalogIndexPayload>(
		CHALLENGE_CATALOG_INDEX_PATH
	);
}

export async function getChallengeHub(): Promise<ChallengeHubPayload | null> {
	return await getActiveChallengeRoutePayload<ChallengeHubPayload>('/challenges');
}

export async function getChallengeSubject(
	subject: string
): Promise<ChallengeSubjectPayload | null> {
	const normalized = normalizeChallengeSubject(subject);
	if (!normalized) return null;
	return await getActiveChallengeRoutePayload<ChallengeSubjectPayload>(`/challenges/${normalized}`);
}

export async function getChallengeDetail(
	subject: string,
	slug: string
): Promise<ChallengeDetailPayload | null> {
	const normalized = normalizeChallengeSubject(subject);
	const normalizedSlug = safeRoutePart(slug);
	if (!normalized || !normalizedSlug) return null;
	return await getActiveChallengeRoutePayload<ChallengeDetailPayload>(
		`/challenges/${normalized}/${normalizedSlug}`
	);
}

export async function getActiveChallengeIds(): Promise<string[]> {
	return (await getChallengeCatalogIndex())?.challengeIds ?? [];
}

export async function getActiveChallengeRoutePayload<T>(routePath: string): Promise<T | null> {
	const row = await queryFirst<ChallengeRoutePayloadRow>(
		`SELECT payload_json,
		        content_sha256 AS payload_sha256,
		        release_id,
		        release_sha256
		   FROM challenge_active_route_payloads
		  WHERE route_path = ?
		  LIMIT 1`,
		[routePath]
	);
	if (!row) return null;

	const payload = JSON.parse(row.payload_json) as unknown;
	if (
		!payload ||
		typeof payload !== 'object' ||
		Array.isArray(payload) ||
		(payload as { schemaVersion?: unknown }).schemaVersion !== CHALLENGE_CATALOG_ROUTE_SCHEMA ||
		(payload as { releaseId?: unknown }).releaseId !== row.release_id
	) {
		throw new Error(`Active challenge route payload is invalid: ${routePath}`);
	}
	return payload as T;
}

function safeRoutePart(value: string): string | null {
	const normalized = value.trim().toLowerCase();
	return /^[a-z0-9][a-z0-9-]*$/u.test(normalized) ? normalized : null;
}
