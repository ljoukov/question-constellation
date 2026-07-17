import { json, type RequestHandler } from '@sveltejs/kit';
import { createSummaryJob, generateSummaryJob } from '$lib/server/aiSummary';
import type {
	EnvironmentScope,
	IdentityScope,
	TrafficScope
} from '$lib/server/analyticsScope';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const body = (await request.json().catch(() => null)) as {
		environment?: string;
		days?: number;
		traffic?: string;
		identity?: string;
		country?: string;
		path?: string;
	} | null;
	const environment = ['production', 'development'].includes(body?.environment || '')
		? (body?.environment as EnvironmentScope)
		: (body?.environment === 'all' ? 'all' : 'production');
	const days = Number.isInteger(body?.days) ? Math.min(3650, Math.max(1, body?.days ?? 30)) : 30;
	const traffic = ['human', 'bots', 'internal_test', 'unknown', 'all'].includes(
		body?.traffic || ''
	)
		? (body?.traffic as TrafficScope)
		: 'human';
	const identity = ['authenticated', 'anonymous', 'all'].includes(body?.identity || '')
		? (body?.identity as IdentityScope)
		: 'all';
	const country = String(body?.country || '')
		.toUpperCase()
		.replace(/[^A-Z]/g, '')
		.slice(0, 2);
	const path = String(body?.path || '').trim().slice(0, 500);
	const scope = { environment, days, traffic, identity, country, path };
	const summaryId = await createSummaryJob({
		db: locals.analyticsDb,
		scope,
		requestedBy: locals.adminIdentity
	});
	const workflow = platform?.env.ANALYTICS_SUMMARY_WORKFLOW;
	if (workflow) {
		const enqueue = workflow.create({
			id: summaryId,
			params: { summaryId, ...scope }
		});
		if (platform?.ctx) platform.ctx.waitUntil(enqueue);
		else await enqueue;
	} else {
		const task = generateSummaryJob({ db: locals.analyticsDb, summaryId, scope });
		if (platform?.ctx) platform.ctx.waitUntil(task);
		else void task;
	}
	return json({ summaryId, status: 'queued' }, { status: 202 });
};
