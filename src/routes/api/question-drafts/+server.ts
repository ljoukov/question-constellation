import { saveQuestionDrafts } from '$lib/server/personalLearning';
import {
	practiceDraftBatchWithinSyncLimit,
	practiceDraftPayloadWithinSyncLimit
} from '$lib/practiceDrafts';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const draftSchema = z
	.object({
		questionId: z.string().trim().min(1).max(220),
		draftKind: z.enum(['science-practice', 'english-guided']),
		answerText: z.string().max(10_000).default(''),
		payload: z.record(z.string(), z.unknown()).default({}),
		clientUpdatedAt: z.number().int().nonnegative()
	})
	.refine((draft) => practiceDraftPayloadWithinSyncLimit(draft.payload), {
		message: 'Draft payload is too large.',
		path: ['payload']
	});

const requestSchema = z
	.object({
		drafts: z.array(draftSchema).min(1).max(50)
	})
	.refine((request) => practiceDraftBatchWithinSyncLimit(request.drafts), {
		message: 'Draft batch payload is too large.',
		path: ['drafts']
	});

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const parsed = requestSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
	}

	const result = await saveQuestionDrafts(locals.user, parsed.data.drafts);
	return json(result);
};
