import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const R2_PREFIX = 'admin/experiments/gallery/';
const VALID_KEY = /^(full|thumb)\/[a-z0-9-]+\.webp$/;

export const GET: RequestHandler = async ({ params, platform }) => {
	const key = params.key;
	if (!key || !VALID_KEY.test(key)) throw error(404, 'Gallery image not found.');

	const bucket = platform?.env.QUESTION_R2;
	if (!bucket) throw error(503, 'Gallery image storage is unavailable.');

	const object = await bucket.get(`${R2_PREFIX}${key}`);
	if (!object) throw error(404, 'Gallery image not found.');

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('Content-Type', object.httpMetadata?.contentType || 'image/webp');
	headers.set('Content-Length', String(object.size));
	headers.set('ETag', object.httpEtag);
	headers.set('Cache-Control', 'private, no-store');
	headers.set('X-Content-Type-Options', 'nosniff');

	return new Response(object.body, { headers });
};
