import { recordRecallCardReview, type RecallReviewGrade } from '$lib/server/personalLearning';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const requestSchema = z.object({
	cardId: z.string().trim().min(1),
	grade: z.enum(['again', 'hard', 'good', 'easy']),
	mode: z.enum(['recall', 'recognise', 'reverse']).default('recall')
});

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
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

	const result = await recordRecallCardReview({
		user: locals.user,
		cardId: body.cardId,
		grade: body.grade as RecallReviewGrade,
		mode: body.mode
	});

	if (!result) {
		return json({ error: 'not_found' }, { status: 404 });
	}

	return json(result);
};
