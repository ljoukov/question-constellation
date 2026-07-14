import { gradeQuestionAnswerStreaming, type GradeStreamDelta } from '$lib/server/answerGrading';
import { recordQuestionAttempt } from '$lib/server/personalLearning';
import { recordQuestionAttemptEvidence } from '$lib/server/subjectLearning';
import { createSseStream, sseResponse } from '$lib/server/sse';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

type SerializedError = {
	name: string;
	message: string;
	stack?: string;
	stage?: string;
	cause?: SerializedError | string;
	code?: string | number;
	status?: string | number;
};

const paramsSchema = z.object({
	questionId: z.string().trim().min(1, 'questionId is required')
});

const requestSchema = z.object({
	answer: z.string().trim().min(1, 'answer is required').max(5000),
	attemptId: z.string().trim().min(1).max(128),
	sourceSessionId: z.string().trim().min(1).max(128),
	responseDurationMs: z
		.number()
		.int()
		.min(0)
		.max(6 * 60 * 60 * 1000)
		.nullable(),
	assistance: z
		.object({
			hintOpened: z.boolean().default(false),
			markingPointsViewed: z.boolean().default(false),
			feedbackRewrite: z.boolean().default(false)
		})
		.default({
			hintOpened: false,
			markingPointsViewed: false,
			feedbackRewrite: false
		})
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

function serializeError(error: unknown, depth = 0): SerializedError | string {
	if (depth > 2) return '[cause truncated]';
	if (!(error instanceof Error)) return String(error);

	const record = error as Error & {
		stage?: unknown;
		cause?: unknown;
		code?: unknown;
		status?: unknown;
	};
	const serialized: SerializedError = {
		name: error.name,
		message: error.message
	};
	if (error.stack) serialized.stack = error.stack;
	if (typeof record.stage === 'string') serialized.stage = record.stage;
	if (typeof record.code === 'string' || typeof record.code === 'number') {
		serialized.code = record.code;
	}
	if (typeof record.status === 'string' || typeof record.status === 'number') {
		serialized.status = record.status;
	}
	if (record.cause) serialized.cause = serializeError(record.cause, depth + 1);
	return serialized;
}

function gradingRuntimeDiagnostics(platformEnv: unknown) {
	const envRecord =
		platformEnv && typeof platformEnv === 'object' ? (platformEnv as Record<string, unknown>) : {};
	return {
		hasCodexProxyUrl: typeof envRecord.CHATGPT_CODEX_PROXY_URL === 'string',
		hasCodexProxyApiKey: typeof envRecord.CHATGPT_CODEX_PROXY_API_KEY === 'string',
		chatGptWebsocketMode:
			typeof envRecord.CHATGPT_RESPONSES_WEBSOCKET_MODE === 'string'
				? envRecord.CHATGPT_RESPONSES_WEBSOCKET_MODE
				: 'off'
	};
}

export const POST: RequestHandler = async ({ locals, params, request, platform }) => {
	if (!locals.user) return json({ error: 'authentication_required' }, { status: 401 });
	const user = locals.user;
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
			let savedAttempt = null;
			try {
				savedAttempt = await recordQuestionAttempt({
					user,
					questionId,
					answer: body.answer,
					result,
					attemptId: body.attemptId
				});
				if (savedAttempt) {
					await recordQuestionAttemptEvidence({
						user,
						attemptId: savedAttempt.id,
						questionId,
						result,
						assistance: body.assistance,
						sourceSessionId: body.sourceSessionId,
						responseDurationMs: body.responseDurationMs
					});
				}
			} catch (error) {
				console.warn('[question-grade] failed to save personal attempt', {
					error,
					questionId,
					userId: user.uid
				});
			}

			send({
				event: 'done',
				data: JSON.stringify({ ...result, savedAttempt })
			});
		} catch (error) {
			console.error('[question-grade] failed to grade answer', {
				error: serializeError(error),
				runtime: gradingRuntimeDiagnostics(platform?.env),
				questionId
			});
			send({
				event: 'error',
				data: JSON.stringify({
					error: 'grading_failed',
					stage:
						error instanceof Error && 'stage' in error && typeof error.stage === 'string'
							? error.stage
							: 'unknown',
					message: 'Unable to grade this answer right now.'
				})
			});
		} finally {
			close();
		}
	})();

	return response;
};
