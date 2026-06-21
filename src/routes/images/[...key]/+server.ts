import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const R2_ROUTE_PREFIX = 'papers/';
const R2_KEY_PREFIX = 'images/';

function contentTypeForKey(key: string): string {
	const lowerKey = key.toLowerCase();

	if (lowerKey.endsWith('.jpg') || lowerKey.endsWith('.jpeg')) return 'image/jpeg';
	if (lowerKey.endsWith('.png')) return 'image/png';
	if (lowerKey.endsWith('.webp')) return 'image/webp';
	if (lowerKey.endsWith('.gif')) return 'image/gif';
	if (lowerKey.endsWith('.svg')) return 'image/svg+xml';

	return 'application/octet-stream';
}

function getR2ObjectKey(routeKey: string | undefined): string {
	if (!routeKey || !routeKey.startsWith(R2_ROUTE_PREFIX) || routeKey.includes('..')) {
		throw error(404, 'Image not found.');
	}

	return `${R2_KEY_PREFIX}${routeKey}`;
}

async function getImageResponse(
	{ params, platform, request }: Parameters<RequestHandler>[0],
	headOnly = false
): Promise<Response> {
	const bucket = platform?.env.QUESTION_R2;
	if (!bucket) {
		throw error(500, 'QUESTION_R2 binding is not configured.');
	}

	const objectKey = getR2ObjectKey(params.key);
	const object = await bucket.get(objectKey);
	if (!object) {
		throw error(404, 'Image not found.');
	}

	if (request.headers.get('if-none-match') === object.httpEtag) {
		return new Response(null, { status: 304 });
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('content-type', headers.get('content-type') ?? contentTypeForKey(objectKey));
	headers.set('etag', object.httpEtag);
	headers.set('cache-control', 'public, max-age=31536000, immutable');
	headers.set('content-length', String(object.size));

	return new Response(headOnly ? null : object.body, { headers });
}

export const GET: RequestHandler = async (event) => getImageResponse(event);

export const HEAD: RequestHandler = async (event) => getImageResponse(event, true);
