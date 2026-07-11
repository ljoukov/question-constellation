import { json, type RequestHandler } from '@sveltejs/kit';
import { createSummaryJob, generateSummaryJob } from '$lib/server/aiSummary';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	const body = (await request.json().catch(() => null)) as {
		environment?: string;
		days?: number;
	} | null;
	const environment = ['production', 'development'].includes(body?.environment || '')
		? (body?.environment as 'production' | 'development')
		: 'all';
	const days = Number.isInteger(body?.days) ? Math.min(3650, Math.max(1, body?.days ?? 30)) : 30;
	const summaryId = await createSummaryJob({
		db: locals.analyticsDb,
		environment,
		days,
		requestedBy: locals.adminIdentity
	});
	const workflow = platform?.env.ANALYTICS_SUMMARY_WORKFLOW;
	if (workflow) {
		const enqueue = workflow.create({
			id: summaryId,
			params: { summaryId, environment, days }
		});
		if (platform?.ctx) platform.ctx.waitUntil(enqueue);
		else await enqueue;
	} else {
		const task = generateSummaryJob({ db: locals.analyticsDb, summaryId, environment, days });
		if (platform?.ctx) platform.ctx.waitUntil(task);
		else void task;
	}
	return json({ summaryId, status: 'queued' }, { status: 202 });
};
