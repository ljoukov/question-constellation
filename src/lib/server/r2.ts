import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { getQuestionR2 } from './bindings';
import { QUESTION_R2_BUCKET_NAME } from './cloudflareConfig';

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

function getLocalApiToken() {
	return env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN;
}

function getLocalR2Config() {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = getLocalApiToken();
	const bucketName = env.QUESTION_R2_BUCKET_NAME || QUESTION_R2_BUCKET_NAME;

	if (!accountId || !apiToken || !bucketName) {
		throw new Error(
			'QUESTION_R2 binding is unavailable and local R2 REST credentials are not configured.'
		);
	}

	return { accountId, apiToken, bucketName };
}

export function getR2ObjectKey(routeKey: string | undefined): string {
	if (!routeKey || !routeKey.startsWith(R2_ROUTE_PREFIX) || routeKey.includes('..')) {
		throw error(404, 'Image not found.');
	}

	return `${R2_KEY_PREFIX}${routeKey}`;
}

function headersForNativeObject(object: R2ObjectBody, objectKey: string): Headers {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('content-type', headers.get('content-type') ?? contentTypeForKey(objectKey));
	headers.set('etag', object.httpEtag);
	headers.set('cache-control', 'public, max-age=31536000, immutable');
	headers.set('content-length', String(object.size));
	return headers;
}

function copyRestObjectHeaders(source: Headers, objectKey: string): Headers {
	const headers = new Headers();
	for (const key of ['content-type', 'etag', 'cache-control', 'content-length', 'last-modified']) {
		const value = source.get(key);
		if (value) headers.set(key, value);
	}
	headers.set('content-type', headers.get('content-type') ?? contentTypeForKey(objectKey));
	headers.set(
		'cache-control',
		headers.get('cache-control') ?? 'public, max-age=31536000, immutable'
	);
	return headers;
}

function objectPathForRest(objectKey: string): string {
	return objectKey.split('/').map(encodeURIComponent).join('/');
}

export async function getR2ImageResponse(
	routeKey: string | undefined,
	request: Request,
	headOnly = false
): Promise<Response> {
	const objectKey = getR2ObjectKey(routeKey);
	const bucket = getQuestionR2();

	if (bucket) {
		const object = await bucket.get(objectKey);
		if (!object) {
			throw error(404, 'Image not found.');
		}

		if (request.headers.get('if-none-match') === object.httpEtag) {
			return new Response(null, { status: 304 });
		}

		return new Response(headOnly ? null : object.body, {
			headers: headersForNativeObject(object, objectKey)
		});
	}

	const { accountId, apiToken, bucketName } = getLocalR2Config();
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects/${objectPathForRest(objectKey)}`,
		{
			headers: {
				Authorization: `Bearer ${apiToken}`,
				Accept: contentTypeForKey(objectKey),
				...(request.headers.get('if-none-match')
					? { 'If-None-Match': request.headers.get('if-none-match') ?? '' }
					: {})
			}
		}
	);

	if (response.status === 304) {
		return new Response(null, { status: 304 });
	}
	if (response.status === 404) {
		throw error(404, 'Image not found.');
	}
	if (!response.ok) {
		throw error(502, `R2 REST request failed: ${response.status} ${response.statusText}`);
	}

	return new Response(headOnly ? null : response.body, {
		headers: copyRestObjectHeaders(response.headers, objectKey)
	});
}
