import {
	gradeEnglishPracticeStepStreaming,
	type EnglishStepGradeDelta
} from '$lib/server/englishStepGrading';
import { createSseStream, sseResponse } from '$lib/server/sse';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const paramsSchema = z.object({
	questionId: z.string().trim().min(1)
});

const requestSchema = z.object({
	stepId: z.string().trim().min(1).max(100),
	answer: z.string().trim().min(1).max(5000),
	stepAnswers: z.record(z.string(), z.string().max(5000)).default({}),
	attemptHistory: z
		.array(
			z.object({
				stepId: z.string().trim().min(1).max(100),
				stepTitle: z.string().trim().min(1).max(200),
				answer: z.string().trim().min(1).max(5000),
				decision: z.enum(['pass', 'revise']),
				checks: z
					.array(
						z.object({
							id: z.string().trim().min(1).max(100),
							label: z.string().trim().min(1).max(200),
							status: z.enum(['met', 'not_yet']),
							feedback: z.string().trim().min(1).max(500)
						})
					)
					.max(8),
				nextImprovement: z.string().trim().min(1).max(600)
			})
		)
		.max(16)
		.default([])
});

function sendDelta(send: ReturnType<typeof createSseStream>['send'], delta: EnglishStepGradeDelta) {
	send({
		event: 'status',
		data: JSON.stringify({ phase: delta.phase, summaryDelta: delta.summaryDelta })
	});
}

export const POST: RequestHandler = async ({ params, request, platform }) => {
	let questionId: string;
	let body: z.infer<typeof requestSchema>;
	try {
		questionId = paramsSchema.parse(params).questionId;
		body = requestSchema.parse(await request.json());
	} catch (error) {
		if (error instanceof z.ZodError) {
			return json({ error: 'invalid_request', issues: error.issues }, { status: 400 });
		}
		return json({ error: 'invalid_request' }, { status: 400 });
	}

	const { stream, send, close } = createSseStream({ signal: request.signal });
	const response = sseResponse(stream);

	void (async () => {
		try {
			const result = await gradeEnglishPracticeStepStreaming({
				questionId,
				stepId: body.stepId,
				studentAnswer: body.answer,
				stepAnswers: body.stepAnswers,
				attemptHistory: body.attemptHistory,
				platformEnv: platform?.env,
				signal: request.signal,
				onDelta: (delta) => sendDelta(send, delta)
			});
			send({ event: 'done', data: JSON.stringify(result) });
		} catch (error) {
			console.error('[english-step-grade] failed to grade step', {
				error,
				questionId,
				stepId: body.stepId
			});
			send({
				event: 'error',
				data: JSON.stringify({
					error: 'step_grading_failed',
					message: 'Unable to check this step right now.'
				})
			});
		} finally {
			close();
		}
	})();

	return response;
};
