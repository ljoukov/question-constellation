import { recordRecallCardReview, type RecallReviewGrade } from '$lib/server/personalLearning';
import { recallCardContentMatches } from '$lib/recall/contentIdentity';
import {
	getRecallReviewEvidenceReceipt,
	getRecallCardForLearner,
	isRecallCardWithinLearnerScope,
	recordRecallReviewEvidence
} from '$lib/server/subjectLearning';
import { recallChoiceDiagnostic } from '$lib/recall/personalization';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const requestSchema = z.object({
	reviewId: z.string().trim().min(1).max(128),
	cardId: z.string().trim().min(1),
	contentRevision: z.number().int().min(1),
	contentHash: z.string().trim().min(1).max(256),
	grade: z.enum(['again', 'hard', 'good', 'easy']),
	mode: z.enum(['recall', 'recognise', 'reverse', 'true_false']).default('recall'),
	selectedChoiceKey: z.string().trim().min(1).max(80).nullable(),
	statementChoiceKey: z.string().trim().min(1).max(80).nullable(),
	selectedTruth: z.boolean().nullable(),
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
	const card = await getRecallCardForLearner(locals.user, body.cardId);
	if (
		!card ||
		!recallCardContentMatches(card, {
			contentRevision: body.contentRevision,
			contentHash: body.contentHash
		})
	) {
		return json({ error: 'stale_recall_card' }, { status: 409 });
	}
	if (!(await isRecallCardWithinLearnerScope(locals.user.uid, card))) {
		return json({ error: 'outside_curriculum_scope' }, { status: 409 });
	}
	const selectedChoice = body.selectedChoiceKey
		? recallChoiceDiagnostic(card, body.selectedChoiceKey)
		: null;
	const statementChoice = body.statementChoiceKey
		? recallChoiceDiagnostic(card, body.statementChoiceKey)
		: null;
	if (
		(body.mode === 'recognise' && !selectedChoice) ||
		(body.mode !== 'recognise' && body.selectedChoiceKey !== null) ||
		(body.mode === 'true_false' && (!statementChoice || body.selectedTruth === null)) ||
		(body.mode !== 'true_false' &&
			(body.statementChoiceKey !== null || body.selectedTruth !== null))
	) {
		return json({ error: 'invalid_selected_choice' }, { status: 400 });
	}
	const trueFalseCorrect = statementChoice
		? statementChoice.isCorrect === body.selectedTruth
		: null;
	if (
		(selectedChoice && !selectedChoice.isCorrect && body.grade !== 'again') ||
		(trueFalseCorrect === false && body.grade !== 'again')
	) {
		return json({ error: 'inconsistent_review' }, { status: 400 });
	}

	const existing = await getRecallReviewEvidenceReceipt(locals.user.uid, body.reviewId);
	const duplicate = Boolean(existing);
	if (
		existing &&
		(existing.cardId !== card.id ||
			existing.contentRevision !== card.contentRevision ||
			existing.contentHash !== card.contentHash ||
			existing.grade !== body.grade ||
			existing.mode !== body.mode ||
			existing.selectedChoiceKey !== body.selectedChoiceKey ||
			(existing.statementChoiceKey ?? null) !== body.statementChoiceKey ||
			(existing.selectedTruth ?? null) !== body.selectedTruth ||
			existing.sourceSessionId !== body.sourceSessionId ||
			existing.responseDurationMs !== body.responseDurationMs ||
			existing.createdAt !== body.createdAt)
	) {
		return json({ error: 'review_id_conflict' }, { status: 409 });
	}
	await recordRecallReviewEvidence({
		user: locals.user,
		reviewId: body.reviewId,
		card,
		grade: body.grade,
		mode: body.mode,
		selectedChoice,
		statementChoice,
		selectedTruth: body.selectedTruth,
		sourceSessionId: body.sourceSessionId,
		responseDurationMs: body.responseDurationMs,
		createdAt: body.createdAt
	});
	const result = await recordRecallCardReview({
		user: locals.user,
		card,
		grade: body.grade as RecallReviewGrade,
		mode: body.mode
	});

	if (!result) return json({ error: 'not_found' }, { status: 404 });

	return json({ ...result, duplicate });
};
