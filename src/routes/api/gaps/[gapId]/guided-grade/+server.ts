import { judgeGapFinalAnswer } from '$lib/server/personalLearning';
import { recordGapOutcomeEvidence } from '$lib/server/subjectLearning';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const requestSchema = z.object({
	answer: z.string().trim().min(1).max(5000),
	guidedAnswers: z.record(z.string(), z.string().max(400)).default({}),
	submissionId: z.string().trim().min(1).max(128),
	sourceSessionId: z.string().trim().min(1).max(128),
	responseDurationMs: z
		.number()
		.int()
		.min(0)
		.max(6 * 60 * 60 * 1000)
		.nullable(),
	assistance: z
		.object({
			externalInputDetected: z.boolean().default(false),
			externalInputSources: z
				.array(z.enum(['paste', 'drop']))
				.max(2)
				.default([])
		})
		.default({ externalInputDetected: false, externalInputSources: [] })
});

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	if (!params.gapId) {
		return json({ error: 'missing_gap_id' }, { status: 400 });
	}

	let body: z.infer<typeof requestSchema>;
	try {
		body = requestSchema.parse(await request.json());
	} catch (error) {
		if (error instanceof z.ZodError) {
			return json({ error: 'invalid_body', issues: error.issues }, { status: 400 });
		}
		return json({ error: 'invalid_body' }, { status: 400 });
	}

	const result = await judgeGapFinalAnswer({
		userId: locals.user.uid,
		gapId: params.gapId,
		answer: body.answer,
		guidedAnswers: body.guidedAnswers,
		submissionId: body.submissionId,
		assistance: body.assistance
	});

	if (!result) {
		return json({ error: 'not_found' }, { status: 404 });
	}
	await recordGapOutcomeEvidence({
		user: locals.user,
		gapId: params.gapId,
		result,
		sourceSessionId: body.sourceSessionId,
		responseDurationMs: body.responseDurationMs
	});

	return json({ status: 'ok', ...result });
};
