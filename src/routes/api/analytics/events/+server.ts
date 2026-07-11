import { json, type RequestHandler } from '@sveltejs/kit';
import { parseAnalyticsBatch, recordAnalyticsBatch } from '$lib/server/analytics';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const contentLength = Number(request.headers.get('content-length') || '0');
	if (contentLength > 256_000) return json({ ok: false }, { status: 413 });
	if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
		return json({ ok: false }, { status: 415 });
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ ok: false }, { status: 400 });
	}
	const payload = parseAnalyticsBatch(raw);
	if (!payload) return json({ ok: false }, { status: 400 });

	const write = recordAnalyticsBatch({
		db: locals.analyticsDb,
		request,
		cf: platform?.cf,
		user: locals.user,
		payload
	}).catch((error) => console.error('Analytics batch could not be stored.', error));

	if (platform?.ctx) platform.ctx.waitUntil(write);
	else await write;
	return json({ ok: true }, { status: 202 });
};
