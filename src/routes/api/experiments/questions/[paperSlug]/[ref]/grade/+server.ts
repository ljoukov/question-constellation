import { dev } from '$app/environment';
import type { GradeStreamDelta } from '$lib/server/answerGrading';
import { persistPaperSittingGradeResponse } from '$lib/server/paperSittingAttemptPersistence';
import {
	claimPaperSittingGrade,
	completePaperSittingGrade,
	isPaperSittingSessionError,
	releasePaperSittingGradeClaim,
	stagePaperSittingGrade,
	type ClaimedPaperSittingGrade
} from '$lib/server/paperSittingSession';
import { gradeExperimentQuestionAnswers } from '$lib/server/questionExperimentGrading';
import { createSseStream, sseResponse } from '$lib/server/sse';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const paramsSchema = z.object({
	paperSlug: z.string().trim().min(1),
	ref: z.string().trim().min(1)
});

const debugFields = {
	includeDebugPrompt: z.boolean().optional(),
	model: z.string().trim().min(1).optional(),
	thinkingLevel: z.enum(['low', 'medium', 'high', 'xhigh', 'none']).optional()
};

const ordinaryRequestSchema = z
	.object({
		answers: z.record(z.string().trim().min(1), z.string().max(5_000)),
		...debugFields
	})
	.strict();

const paperSittingRequestSchema = z
	.object({
		paperSitting: z
			.object({
				sessionId: z
					.string()
					.trim()
					.min(1)
					.max(160)
					.regex(/^[a-zA-Z0-9_-]+$/),
				nonce: z
					.string()
					.trim()
					.min(32)
					.max(256)
					.regex(/^[a-zA-Z0-9_-]+$/)
			})
			.strict()
	})
	.strict();

const requestSchema = z.union([ordinaryRequestSchema, paperSittingRequestSchema]);
type GradeRequestBody = z.infer<typeof requestSchema>;

function isPaperSittingRequest(
	body: GradeRequestBody
): body is z.infer<typeof paperSittingRequestSchema> {
	return 'paperSitting' in body;
}

function sendDelta(send: ReturnType<typeof createSseStream>['send'], delta: GradeStreamDelta) {
	if (delta.type === 'status') {
		send({ event: 'status', data: JSON.stringify({ phase: delta.phase }) });
	}
}

function errorResponse(error: unknown, paperSlug: string, ref: string) {
	const message = error instanceof Error ? error.message : String(error);
	const isConfigurationError =
		message.includes('Use chatgpt-* models') || message.includes('Codex proxy credentials');
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

function paperSittingUnavailable(error: unknown) {
	if (!isPaperSittingSessionError(error)) return null;
	return json(
		{
			error: 'paper_sitting_unavailable',
			reason: error.code,
			message: 'This full-paper sitting is no longer authorized.'
		},
		{ status: 409, headers: { 'Cache-Control': 'no-store' } }
	);
}

function replayResponse(
	request: Request,
	response: Awaited<ReturnType<typeof gradeExperimentQuestionAnswers>>
) {
	if (!request.headers.get('accept')?.includes('text/event-stream')) return json(response);
	const { stream, send, close } = createSseStream({ signal: request.signal });
	queueMicrotask(() => {
		send({ event: 'done', data: JSON.stringify(response) });
		close();
	});
	return sseResponse(stream);
}

export const POST: RequestHandler = async ({ locals, params, request, platform }) => {
	if (!locals.user) return json({ error: 'authentication_required' }, { status: 401 });
	const parsedParams = paramsSchema.safeParse(params);
	if (!parsedParams.success) {
		return json({ error: 'invalid_params', issues: parsedParams.error.issues }, { status: 400 });
	}
	const { paperSlug, ref } = parsedParams.data;

	let body: GradeRequestBody;
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

	let sittingClaim: ClaimedPaperSittingGrade | null = null;
	if (isPaperSittingRequest(body)) {
		try {
			const claim = await claimPaperSittingGrade({
				userId: locals.user.uid,
				paperSlug,
				questionRef: ref,
				sessionId: body.paperSitting.sessionId,
				nonce: body.paperSitting.nonce
			});
			if (claim.kind === 'replay') return replayResponse(request, claim.response);
			sittingClaim = claim;
		} catch (error) {
			const unavailable = paperSittingUnavailable(error);
			if (unavailable) return unavailable;
			console.error('[paper-sitting-authorization] failed', {
				paperSlug,
				ref,
				error: error instanceof Error ? error.message : String(error)
			});
			return json(
				{
					error: 'paper_sitting_unavailable',
					message: 'The full-paper sitting could not be verified right now.'
				},
				{ status: 503, headers: { 'Cache-Control': 'no-store' } }
			);
		}
	}

	const ordinaryBody = isPaperSittingRequest(body) ? null : body;
	const answers = sittingClaim ? sittingClaim.answers : ordinaryBody!.answers;
	let sittingCompleted = false;

	async function releaseClaimAfterFailure() {
		if (!sittingClaim || sittingCompleted) return;
		try {
			await releasePaperSittingGradeClaim({
				sessionId: sittingClaim.authorization.sessionId,
				claimId: sittingClaim.authorization.claimId
			});
		} catch (error) {
			console.error('[paper-sitting-claim-release] failed', {
				paperSlug,
				ref,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	async function finalizeSittingResult(
		result: Awaited<ReturnType<typeof gradeExperimentQuestionAnswers>>
	) {
		if (!sittingClaim) return;
		await stagePaperSittingGrade({
			authorization: sittingClaim.authorization,
			response: result
		});
		const persistence = await persistPaperSittingGradeResponse({
			user: locals.user!,
			answers: sittingClaim.answers,
			response: result,
			authorization: sittingClaim.authorization
		});
		const nonEvidencePartCount = result.results.filter((entry) => entry.maxMarks <= 0).length;
		const expectedSavedCount = sittingClaim.authorization.partRefs.length - nonEvidencePartCount;
		if (
			persistence.failed !== 0 ||
			persistence.skipped !== nonEvidencePartCount ||
			persistence.saved !== expectedSavedCount
		) {
			throw new Error('The complete paper grade could not be saved as independent evidence.');
		}
		await completePaperSittingGrade({
			authorization: sittingClaim.authorization,
			results: result.results
		});
		sittingCompleted = true;
	}

	const allowOverrides = dev || platform?.env?.EXPERIMENT_GRADING_DEBUG_PROMPTS === '1';
	const grade = (onDelta?: (delta: GradeStreamDelta) => void) =>
		sittingClaim?.reusedResponse
			? Promise.resolve(sittingClaim.reusedResponse)
			: gradeExperimentQuestionAnswers({
					paperSlug,
					ref,
					answers,
					platformEnv: platform?.env,
					signal: request.signal,
					onDelta,
					includeDebugPrompt: ordinaryBody?.includeDebugPrompt === true && allowOverrides,
					modelOverride: allowOverrides ? ordinaryBody?.model : undefined,
					thinkingLevelOverride: allowOverrides ? ordinaryBody?.thinkingLevel : undefined
				});

	if (request.headers.get('accept')?.includes('text/event-stream')) {
		const { stream, send, close } = createSseStream({ signal: request.signal });
		const response = sseResponse(stream);

		void (async () => {
			try {
				const result = await grade((delta) => sendDelta(send, delta));
				await finalizeSittingResult(result);
				send({ event: 'done', data: JSON.stringify(result) });
			} catch (error) {
				await releaseClaimAfterFailure();
				const payload = errorResponse(error, paperSlug, ref);
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
		const result = await grade();
		await finalizeSittingResult(result);
		return json(result);
	} catch (error) {
		await releaseClaimAfterFailure();
		const unavailable = paperSittingUnavailable(error);
		if (unavailable) return unavailable;
		const payload = errorResponse(error, paperSlug, ref);
		return json(
			{
				error: payload.error,
				message: payload.message
			},
			{ status: payload.status }
		);
	}
};
