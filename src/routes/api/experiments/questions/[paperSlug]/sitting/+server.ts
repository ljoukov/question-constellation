import {
	isPaperSittingSessionError,
	resumePaperSittingSession,
	savePaperSittingDraft,
	startPaperSittingSession,
	submitPaperSittingSession
} from '$lib/server/paperSittingSession';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const paramsSchema = z.object({
	paperSlug: z.string().trim().min(1)
});

const sessionIdentitySchema = z.object({
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
});

const requestSchema = z.discriminatedUnion('action', [
	z.object({ action: z.literal('start') }).strict(),
	z
		.object({
			action: z.literal('resume'),
			...sessionIdentitySchema.shape
		})
		.strict(),
	z
		.object({
			action: z.literal('save'),
			...sessionIdentitySchema.shape,
			draftRevision: z.number().int().min(1),
			answers: z.record(z.string().trim().min(1), z.string().max(5_000)),
			activePartRef: z.string().trim().min(1).nullable()
		})
		.strict(),
	z
		.object({
			action: z.literal('submit'),
			...sessionIdentitySchema.shape
		})
		.strict()
]);

function noStore(body: unknown, init?: ResponseInit) {
	const headers = new Headers(init?.headers);
	headers.set('Cache-Control', 'no-store');
	return json(body, { ...init, headers });
}

function unavailable(error: unknown) {
	if (isPaperSittingSessionError(error)) {
		return noStore(
			{
				error: 'paper_sitting_unavailable',
				reason: error.code,
				message: 'This full-paper sitting is no longer authorized.'
			},
			{ status: 409 }
		);
	}
	console.error('[paper-sitting-session] failed', {
		error: error instanceof Error ? error.message : String(error)
	});
	return noStore(
		{
			error: 'paper_sitting_unavailable',
			message: 'The full-paper sitting could not be verified right now.'
		},
		{ status: 503 }
	);
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) return noStore({ error: 'authentication_required' }, { status: 401 });
	const parsedParams = paramsSchema.safeParse(params);
	if (!parsedParams.success) {
		return noStore({ error: 'invalid_params', issues: parsedParams.error.issues }, { status: 400 });
	}

	let body: z.infer<typeof requestSchema>;
	try {
		body = requestSchema.parse(await request.json());
	} catch (error) {
		if (error instanceof z.ZodError) {
			return noStore({ error: 'invalid_body', issues: error.issues }, { status: 400 });
		}
		return noStore(
			{ error: 'invalid_body', message: 'Unable to parse request body.' },
			{ status: 400 }
		);
	}

	const identity = {
		userId: locals.user.uid,
		paperSlug: parsedParams.data.paperSlug
	};
	try {
		if (body.action === 'start') {
			return noStore(await startPaperSittingSession(identity), { status: 201 });
		}
		if (body.action === 'resume') {
			return noStore(
				await resumePaperSittingSession({
					...identity,
					sessionId: body.sessionId,
					nonce: body.nonce
				})
			);
		}
		if (body.action === 'save') {
			return noStore(
				await savePaperSittingDraft({
					...identity,
					sessionId: body.sessionId,
					nonce: body.nonce,
					draftRevision: body.draftRevision,
					answers: body.answers,
					activePartRef: body.activePartRef
				})
			);
		}
		return noStore(
			await submitPaperSittingSession({
				...identity,
				sessionId: body.sessionId,
				nonce: body.nonce
			})
		);
	} catch (error) {
		return unavailable(error);
	}
};
