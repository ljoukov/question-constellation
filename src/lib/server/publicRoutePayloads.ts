import { queryFirst } from './db';

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
