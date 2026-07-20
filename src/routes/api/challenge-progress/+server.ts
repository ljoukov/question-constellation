import type { ChallengeProgress } from '$lib/challenges/progress';
import {
	CHALLENGE_PROGRESS_FUTURE_TOLERANCE_MS,
	CHALLENGE_PROGRESS_MAX_ENTRIES,
	CHALLENGE_PROGRESS_SCORE_VALUES,
	getUserChallengeProgress,
	mergeUserChallengeProgress
} from '$lib/server/challengeProgress';
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const timestampSchema = z.iso
	.datetime({ offset: true })
	.max(40)
	.refine((value) => Number.isFinite(Date.parse(value)), 'Expected a valid ISO date-time.');
const nullableScoreSchema = z
	.number()
	.int()
	.refine(
		(value) => (CHALLENGE_PROGRESS_SCORE_VALUES as readonly number[]).includes(value),
		'Expected a score produced by the challenge game.'
	)
	.nullable();
const nullableDurationSchema = z.number().int().min(0).max(21_600_000).nullable();
const CHALLENGE_PROGRESS_MAX_BODY_BYTES = 64 * 1024;
const BODY_TOO_LARGE = Symbol('body-too-large');

const entrySchema = z
	.object({
		startedAt: timestampSchema,
		updatedAt: timestampSchema,
		completedAt: timestampSchema.nullable(),
		plays: z.number().int().min(1).max(1_000_000),
		lastStage: z.enum(['showdown', 'diagnose', 'repair', 'transfer', 'complete']),
		bestScore: nullableScoreSchema,
		bestTimeMs: nullableDurationSchema,
		lastScore: nullableScoreSchema,
		lastTimeMs: nullableDurationSchema
	})
	.strict()
	.superRefine((entry, context) => {
		const startedAtMs = Date.parse(entry.startedAt);
		const updatedAtMs = Date.parse(entry.updatedAt);
		const completedAtMs = entry.completedAt === null ? null : Date.parse(entry.completedAt);
		const latestAllowedTimestamp = Date.now() + CHALLENGE_PROGRESS_FUTURE_TOLERANCE_MS;

		if (Date.parse(entry.updatedAt) < Date.parse(entry.startedAt)) {
			context.addIssue({
				code: 'custom',
				path: ['updatedAt'],
				message: 'updatedAt must not be earlier than startedAt.'
			});
		}
		if (entry.completedAt && Date.parse(entry.completedAt) > Date.parse(entry.updatedAt)) {
			context.addIssue({
				code: 'custom',
				path: ['completedAt'],
				message: 'completedAt must not be later than updatedAt.'
			});
		}
		if (entry.lastStage === 'complete' && entry.completedAt === null) {
			context.addIssue({
				code: 'custom',
				path: ['completedAt'],
				message: 'A completed stage requires completedAt.'
			});
		}
		if (entry.bestScore === null && entry.bestTimeMs !== null) {
			context.addIssue({
				code: 'custom',
				path: ['bestTimeMs'],
				message: 'bestTimeMs requires bestScore.'
			});
		}
		if (entry.lastScore === null && entry.lastTimeMs !== null) {
			context.addIssue({
				code: 'custom',
				path: ['lastTimeMs'],
				message: 'lastTimeMs requires lastScore.'
			});
		}
		if (
			entry.lastScore !== null &&
			(entry.bestScore === null || entry.bestScore < entry.lastScore)
		) {
			context.addIssue({
				code: 'custom',
				path: ['bestScore'],
				message: 'bestScore must include the last completed score.'
			});
		}
		for (const [field, timestamp] of [
			['startedAt', startedAtMs],
			['updatedAt', updatedAtMs],
			['completedAt', completedAtMs]
		] as const) {
			if (timestamp !== null && timestamp > latestAllowedTimestamp) {
				context.addIssue({
					code: 'custom',
					path: [field],
					message: `${field} is too far in the future.`
				});
			}
		}
	});

const progressSchema = z
	.object({
		version: z.literal(2),
		challenges: z.record(z.string().min(1).max(120), entrySchema)
	})
	.strict()
	.refine((progress) => Object.keys(progress.challenges).length <= CHALLENGE_PROGRESS_MAX_ENTRIES, {
		message: 'Too many challenge progress entries.',
		path: ['challenges']
	});

const requestSchema = z
	.object({
		progress: progressSchema
	})
	.strict();

async function boundedJsonBody(request: Request): Promise<unknown | typeof BODY_TOO_LARGE> {
	const declaredLength = Number(request.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > CHALLENGE_PROGRESS_MAX_BODY_BYTES) {
		return BODY_TOO_LARGE;
	}
	if (!request.body) return null;

	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let bytesRead = 0;
	let body = '';
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytesRead += value.byteLength;
			if (bytesRead > CHALLENGE_PROGRESS_MAX_BODY_BYTES) {
				await reader.cancel().catch(() => undefined);
				return BODY_TOO_LARGE;
			}
			body += decoder.decode(value, { stream: true });
		}
		body += decoder.decode();
		return JSON.parse(body) as unknown;
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });
	const progress = await getUserChallengeProgress(locals.user.uid);
	return json({ progress });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });

	const body = await boundedJsonBody(request);
	if (body === BODY_TOO_LARGE) {
		return json({ error: 'body_too_large' }, { status: 413 });
	}
	const parsed = requestSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
	}

	const progress = await mergeUserChallengeProgress(
		locals.user.uid,
		parsed.data.progress as ChallengeProgress
	);
	return json({ progress });
};
