import { executeQuery, queryFirst } from './db';

type PublicRoutePayloadRow = {
	payload_json: string;
};

type EncodedPublicRoutePayload = {
	__qcPayloadEncoding: 'gzip-base64';
	data: string;
	rawBytes?: number;
};

export function practiceRoutePayloadId(chainId: string, ref: string) {
	return `practice:${chainId}:${ref}`;
}

function isEncodedPayload(value: unknown): value is EncodedPublicRoutePayload {
	return (
		Boolean(value) &&
		typeof value === 'object' &&
		(value as EncodedPublicRoutePayload).__qcPayloadEncoding === 'gzip-base64' &&
		typeof (value as EncodedPublicRoutePayload).data === 'string'
	);
}

async function decodeGzipBase64Json<T>(payload: EncodedPublicRoutePayload): Promise<T> {
	const compressedBytes = Uint8Array.from(atob(payload.data), (character) =>
		character.charCodeAt(0)
	);
	const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream('gzip'));
	const json = await new Response(stream).text();
	return JSON.parse(json) as T;
}

export async function getPublicRoutePayload<T>(id: string): Promise<T | null> {
	const row = await queryFirst<PublicRoutePayloadRow>(
		`SELECT payload_json
		 FROM public_route_payloads
		 WHERE id = ?
		 LIMIT 1`,
		[id]
	);
	if (!row) return null;
	const payload = JSON.parse(row.payload_json) as unknown;
	if (isEncodedPayload(payload)) return await decodeGzipBase64Json<T>(payload);
	return payload as T;
}

export async function getVersionedPublicRoutePayload<T>(
	id: string,
	sourceVersion: string
): Promise<T | null> {
	const row = await queryFirst<PublicRoutePayloadRow>(
		`SELECT payload_json
		 FROM public_route_payloads
		 WHERE id = ?
		   AND source_version = ?
		 LIMIT 1`,
		[id, sourceVersion]
	);
	if (!row) return null;
	const payload = JSON.parse(row.payload_json) as unknown;
	if (isEncodedPayload(payload)) return await decodeGzipBase64Json<T>(payload);
	return payload as T;
}

export async function putPublicRoutePayload({
	id,
	routeKind,
	routePath,
	payload,
	sourceVersion
}: {
	id: string;
	routeKind: string;
	routePath: string;
	payload: unknown;
	sourceVersion: string;
}): Promise<void> {
	await executeQuery(
		`INSERT INTO public_route_payloads (
		   id, route_kind, route_path, payload_json, source_version, updated_at
		 )
		 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(id) DO UPDATE SET
		   route_kind = excluded.route_kind,
		   route_path = excluded.route_path,
		   payload_json = excluded.payload_json,
		   source_version = excluded.source_version,
		   updated_at = CURRENT_TIMESTAMP`,
		[id, routeKind, routePath, JSON.stringify(payload), sourceVersion]
	);
}
