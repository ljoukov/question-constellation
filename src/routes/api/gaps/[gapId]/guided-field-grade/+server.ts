import { judgeGapField } from '$lib/server/personalLearning';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const requestSchema = z.object({
	questionId: z.string().trim().min(1),
	answer: z.string().max(400)
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

	const result = await judgeGapField({
		userId: locals.user.uid,
		gapId: params.gapId,
		questionId: body.questionId,
		answer: body.answer
	});

	if (!result) {
		return json({ error: 'not_found' }, { status: 404 });
	}

	return json({ status: 'ok', ...result });
};
