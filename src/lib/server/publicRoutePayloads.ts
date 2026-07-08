import { queryFirst } from './db';

type PublicRoutePayloadRow = {
	payload_json: string;
};

export function practiceRoutePayloadId(chainId: string, ref: string) {
	return `practice:${chainId}:${ref}`;
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
	return JSON.parse(row.payload_json) as T;
}
