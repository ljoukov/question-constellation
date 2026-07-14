import { recallCards } from '$lib/recall/aqaScienceRecall';
import { recordRecallCardReview, type RecallReviewGrade } from '$lib/server/personalLearning';
import {
	hasLearnerEvidence,
	isRecallTopicWithinLearnerScope,
	recordRecallReviewEvidence
} from '$lib/server/subjectLearning';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const requestSchema = z.object({
	reviewId: z.string().trim().min(1).max(128),
	cardId: z.string().trim().min(1),
	grade: z.enum(['again', 'hard', 'good', 'easy']),
	mode: z.enum(['recall', 'recognise', 'reverse']).default('recall'),
	sourceSessionId: z.string().trim().min(1).max(128),
	responseDurationMs: z
		.number()
		.int()
		.min(0)
		.max(6 * 60 * 60 * 1000)
		.nullable(),
	createdAt: z.number().int().positive()
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
	if (body.createdAt > Date.now() + 5 * 60 * 1000 || body.createdAt < Date.UTC(2020, 0, 1)) {
		return json({ error: 'invalid_created_at' }, { status: 400 });
	}
	const card = recallCards.find((entry) => entry.id === body.cardId);
	if (!card) return json({ error: 'not_found' }, { status: 404 });
	if (!(await isRecallTopicWithinLearnerScope(locals.user.uid, card.subject, card.topicId))) {
		return json({ error: 'outside_curriculum_scope' }, { status: 409 });
	}

	const evidenceId = `recall_${body.reviewId}`;
	const duplicate = await hasLearnerEvidence(locals.user.uid, evidenceId);
	await recordRecallReviewEvidence({
		user: locals.user,
		reviewId: body.reviewId,
		cardId: body.cardId,
		grade: body.grade,
		mode: body.mode,
		sourceSessionId: body.sourceSessionId,
		responseDurationMs: body.responseDurationMs,
		createdAt: body.createdAt
	});
	const result = await recordRecallCardReview({
		user: locals.user,
		cardId: body.cardId,
		grade: body.grade as RecallReviewGrade,
		mode: body.mode
	});

	if (!result) return json({ error: 'not_found' }, { status: 404 });

	return json({ ...result, duplicate });
};
