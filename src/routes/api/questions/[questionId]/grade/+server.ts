import { gradeQuestionAnswerStreaming, type GradeStreamDelta } from '$lib/server/answerGrading';
import { createSseStream, sseResponse } from '$lib/server/sse';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const paramsSchema = z.object({
	questionId: z.string().trim().min(1, 'questionId is required')
});

const requestSchema = z.object({
	answer: z.string().trim().min(1, 'answer is required').max(5000)
});

function sendDelta(send: ReturnType<typeof createSseStream>['send'], delta: GradeStreamDelta) {
	if (delta.type === 'status') {
		send({ event: 'status', data: JSON.stringify({ phase: delta.phase }) });
		return;
	}
	send({
		event: delta.type === 'thought' ? 'thought' : 'text',
		data: delta.delta
	});
}

export const POST: RequestHandler = async ({ params, request, platform }) => {
	let questionId: string;
	try {
		questionId = paramsSchema.parse(params).questionId;
	} catch (error) {
		if (error instanceof z.ZodError) {
			return json({ error: 'invalid_params', issues: error.issues }, { status: 400 });
		}
		return json({ error: 'invalid_params', message: 'Invalid route params' }, { status: 400 });
	}

	let body: z.infer<typeof requestSchema>;
	try {
		body = requestSchema.parse(await request.json());
	} catch (error) {
		if (error instanceof z.ZodError) {
			return json({ error: 'invalid_body', issues: error.issues }, { status: 400 });
		}
		return json(
			{ error: 'invalid_body', message: 'Unable to parse request body' },
			{ status: 400 }
		);
	}

	const { stream, send, close } = createSseStream({ signal: request.signal });
	const response = sseResponse(stream);

	void (async () => {
		try {
			const result = await gradeQuestionAnswerStreaming({
				questionId,
				studentAnswer: body.answer,
				platformEnv: platform?.env,
				signal: request.signal,
				onDelta: (delta) => sendDelta(send, delta)
			});

			send({
				event: 'done',
				data: JSON.stringify(result)
			});
		} catch (error) {
			console.error('[question-grade] failed to grade answer', {
				error,
				questionId
			});
			send({
				event: 'error',
				data: JSON.stringify({
					error: 'grading_failed',
					message: 'Unable to grade this answer right now.'
				})
			});
		} finally {
			close();
		}
	})();

	return response;
};
