import { gradeExperimentQuestionAnswers } from '$lib/server/questionExperimentGrading';
import { createSseStream, sseResponse } from '$lib/server/sse';
import { json, type RequestHandler } from '@sveltejs/kit';
import type { GradeStreamDelta } from '$lib/server/answerGrading';
import { z } from 'zod';

const paramsSchema = z.object({
	paperSlug: z.string().trim().min(1),
	ref: z.string().trim().min(1)
});

const requestSchema = z.object({
	answers: z.record(z.string().trim().min(1), z.string().max(5000))
});

function sendDelta(send: ReturnType<typeof createSseStream>['send'], delta: GradeStreamDelta) {
	if (delta.type === 'status') {
		send({ event: 'status', data: JSON.stringify({ phase: delta.phase }) });
	}
}

function errorResponse(error: unknown, paperSlug: string, ref: string) {
	const message = error instanceof Error ? error.message : String(error);
	const isConfigurationError =
		message.includes('OPENAI_API_KEY') || message.includes('token-provider credentials');
	console.error('[experiment-question-grade] failed', {
		error:
			error instanceof Error
				? { name: error.name, message: error.message, stack: error.stack }
				: String(error),
		paperSlug,
		ref
	});
	return {
		error: isConfigurationError ? 'grading_unconfigured' : 'grading_failed',
		message: isConfigurationError
			? 'Model credentials are not configured for answer grading.'
			: 'Unable to grade this question right now.',
		status: isConfigurationError ? 503 : 500
	};
}

export const POST: RequestHandler = async ({ params, request, platform }) => {
	const parsedParams = paramsSchema.safeParse(params);
	if (!parsedParams.success) {
		return json({ error: 'invalid_params', issues: parsedParams.error.issues }, { status: 400 });
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

	if (request.headers.get('accept')?.includes('text/event-stream')) {
		const { stream, send, close } = createSseStream({ signal: request.signal });
		const response = sseResponse(stream);

		void (async () => {
			try {
				const result = await gradeExperimentQuestionAnswers({
					paperSlug: parsedParams.data.paperSlug,
					ref: parsedParams.data.ref,
					answers: body.answers,
					platformEnv: platform?.env,
					signal: request.signal,
					onDelta: (delta) => sendDelta(send, delta)
				});
				send({ event: 'done', data: JSON.stringify(result) });
			} catch (error) {
				const payload = errorResponse(error, parsedParams.data.paperSlug, parsedParams.data.ref);
				send({
					event: 'error',
					data: JSON.stringify({ error: payload.error, message: payload.message })
				});
			} finally {
				close();
			}
		})();

		return response;
	}

	try {
		const result = await gradeExperimentQuestionAnswers({
			paperSlug: parsedParams.data.paperSlug,
			ref: parsedParams.data.ref,
			answers: body.answers,
			platformEnv: platform?.env,
			signal: request.signal
		});
		return json(result);
	} catch (error) {
		const payload = errorResponse(error, parsedParams.data.paperSlug, parsedParams.data.ref);
		return json(
			{
				error: payload.error,
				message: payload.message
			},
			{ status: payload.status }
		);
	}
};
