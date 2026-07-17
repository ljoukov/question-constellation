import {
	MAX_PAPER_ANSWER_LENGTH,
	MAX_PAPER_SITTING_ELAPSED_MS
} from '$lib/experiments/questions/paperSitting';
import type {
	ExperimentGradeResponse,
	ExperimentQuestionGradeResult
} from '$lib/experiments/questions/gradingTypes';
import { executePersonalQuery, queryPersonalFirst } from './db';
import { getQuestionExperimentPaper, sourceDocumentIdForSlug } from './questionExperimentData';
import { getQuestionExperimentPaperSittingAvailability } from './paperSittingReadiness';

const PAPER_SITTING_CLAIM_TIMEOUT_MS = 15 * 60 * 1_000;

export type PaperSittingSessionStatus = 'in_progress' | 'submitted' | 'grading' | 'complete';

export type ApprovedPaperSittingManifest = {
	paperSlug: string;
	sourceDocumentId: string;
	reviewedAt: string;
	approvedContentFingerprint: string;
	durationMinutes: number;
	totalMarks: number;
	questionGroups: Array<{ questionRef: string; partRefs: string[] }>;
};

export type PaperSittingSessionRecord = {
	id: string;
	userId: string;
	nonceHash: string;
	paperSlug: string;
	sourceDocumentId: string;
	reviewFingerprint: string;
	reviewedAt: string;
	durationMinutes: number;
	totalMarks: number;
	questionGroups: Array<{ questionRef: string; partRefs: string[] }>;
	status: PaperSittingSessionStatus;
	startedAtMs: number;
	submittedAtMs: number | null;
	completedAtMs: number | null;
	answers: Record<string, string>;
	responseDurationsMs: Record<string, number>;
	draftRevision: number;
	activePartRef: string | null;
	activePartStartedAtMs: number | null;
	results: Record<string, ExperimentQuestionGradeResult>;
	gradeResponses: Record<string, ExperimentGradeResponse>;
	nextQuestionIndex: number;
	gradedQuestionRefs: string[];
	inFlightClaimId: string | null;
	inFlightQuestionRef: string | null;
	inFlightStartedAtMs: number | null;
	version: number;
	transitionToken: string;
};

export type AuthorizedPaperSittingGrade = {
	authorizationKind: 'server_paper_sitting_claim_v1';
	sessionId: string;
	userId: string;
	paperSlug: string;
	sourceDocumentId: string;
	reviewedAt: string;
	questionRef: string;
	partRefs: string[];
	responseDurationsMs: Record<string, number>;
	serverStartedAtMs: number;
	serverSubmittedAtMs: number;
	claimId: string;
};

export type ClaimedPaperSittingGrade = {
	kind: 'claimed';
	answers: Record<string, string>;
	authorization: AuthorizedPaperSittingGrade;
	reusedResponse: ExperimentGradeResponse | null;
};

export type ReplayedPaperSittingGrade = {
	kind: 'replay';
	response: ExperimentGradeResponse;
};

export type PaperSittingSessionView = {
	sessionId: string;
	status: PaperSittingSessionStatus;
	startedAtMs: number;
	submittedAtMs: number | null;
	completedAtMs: number | null;
	reviewedAt: string;
	nextQuestionRef: string | null;
	gradedQuestionRefs: string[];
	results: Record<string, ExperimentQuestionGradeResult>;
	answers: Record<string, string>;
	draftRevision: number;
};

export type PaperSittingSessionErrorCode =
	| 'paper_unavailable'
	| 'review_missing'
	| 'review_not_approved'
	| 'not_complete_official_paper'
	| 'inventory_mismatch'
	| 'question_not_reviewed'
	| 'overlay_missing'
	| 'overlay_version_mismatch'
	| 'review_stale'
	| 'content_changed_since_review'
	| 'required_asset_not_reviewed'
	| 'solvability_failed'
	| 'renderer_incomplete'
	| 'unsupported_response'
	| 'marks_mismatch'
	| 'grading_incomplete'
	| 'session_missing'
	| 'session_mismatch'
	| 'session_nonce_mismatch'
	| 'session_review_stale'
	| 'session_expired'
	| 'session_not_submittable'
	| 'session_not_submitted'
	| 'session_replay'
	| 'session_timing_invalid'
	| 'session_inventory_mismatch'
	| 'question_out_of_order'
	| 'session_busy'
	| 'session_conflict';

export class PaperSittingSessionError extends Error {
	constructor(
		public readonly code: PaperSittingSessionErrorCode,
		message = 'This full-paper sitting is not authorized.'
	) {
		super(message);
		this.name = 'PaperSittingSessionError';
	}
}

export function isPaperSittingSessionError(error: unknown): error is PaperSittingSessionError {
	return error instanceof PaperSittingSessionError;
}

type SessionRow = {
	id: string;
	user_id: string;
	nonce_hash: string;
	paper_slug: string;
	source_document_id: string;
	review_fingerprint: string;
	reviewed_at: string;
	duration_minutes: number;
	total_marks: number;
	question_groups_json: string;
	status: PaperSittingSessionStatus;
	started_at_ms: number;
	submitted_at_ms: number | null;
	completed_at_ms: number | null;
	answers_json: string;
	response_durations_json: string;
	draft_revision: number;
	active_part_ref: string | null;
	active_part_started_at_ms: number | null;
	results_json: string;
	grade_responses_json: string;
	next_question_index: number;
	graded_question_refs_json: string;
	in_flight_claim_id: string | null;
	in_flight_question_ref: string | null;
	in_flight_started_at_ms: number | null;
	version: number;
	transition_token: string;
};

export type PaperSittingSessionStore = {
	insert(record: PaperSittingSessionRecord): Promise<void>;
	get(id: string): Promise<PaperSittingSessionRecord | null>;
	compareAndSwap(
		id: string,
		expectedVersion: number,
		next: PaperSittingSessionRecord
	): Promise<boolean>;
};

type PaperSittingSessionDependencies = {
	store: PaperSittingSessionStore;
	loadManifest: (paperSlug: string) => Promise<ApprovedPaperSittingManifest>;
	now: () => number;
	randomId: (prefix: string) => string;
};

function parseJson<T>(raw: string, fallback: T): T {
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function recordFromRow(row: SessionRow): PaperSittingSessionRecord {
	return {
		id: row.id,
		userId: row.user_id,
		nonceHash: row.nonce_hash,
		paperSlug: row.paper_slug,
		sourceDocumentId: row.source_document_id,
		reviewFingerprint: row.review_fingerprint,
		reviewedAt: row.reviewed_at,
		durationMinutes: Number(row.duration_minutes),
		totalMarks: Number(row.total_marks),
		questionGroups: parseJson(row.question_groups_json, []),
		status: row.status,
		startedAtMs: Number(row.started_at_ms),
		submittedAtMs: row.submitted_at_ms === null ? null : Number(row.submitted_at_ms),
		completedAtMs: row.completed_at_ms === null ? null : Number(row.completed_at_ms),
		answers: parseJson(row.answers_json, {}),
		responseDurationsMs: parseJson(row.response_durations_json, {}),
		draftRevision: Number(row.draft_revision),
		activePartRef: row.active_part_ref,
		activePartStartedAtMs:
			row.active_part_started_at_ms === null ? null : Number(row.active_part_started_at_ms),
		results: parseJson(row.results_json, {}),
		gradeResponses: parseJson(row.grade_responses_json, {}),
		nextQuestionIndex: Number(row.next_question_index),
		gradedQuestionRefs: parseJson(row.graded_question_refs_json, []),
		inFlightClaimId: row.in_flight_claim_id,
		inFlightQuestionRef: row.in_flight_question_ref,
		inFlightStartedAtMs:
			row.in_flight_started_at_ms === null ? null : Number(row.in_flight_started_at_ms),
		version: Number(row.version),
		transitionToken: row.transition_token
	};
}

const SESSION_COLUMNS = `id, user_id, nonce_hash, paper_slug, source_document_id,
  review_fingerprint, reviewed_at, duration_minutes, total_marks, question_groups_json,
  status, started_at_ms, submitted_at_ms, completed_at_ms, answers_json,
  response_durations_json, draft_revision, active_part_ref, active_part_started_at_ms,
  results_json, grade_responses_json, next_question_index, graded_question_refs_json,
  in_flight_claim_id, in_flight_question_ref, in_flight_started_at_ms, version,
  transition_token`;

function recordParams(record: PaperSittingSessionRecord) {
	return [
		record.id,
		record.userId,
		record.nonceHash,
		record.paperSlug,
		record.sourceDocumentId,
		record.reviewFingerprint,
		record.reviewedAt,
		record.durationMinutes,
		record.totalMarks,
		JSON.stringify(record.questionGroups),
		record.status,
		record.startedAtMs,
		record.submittedAtMs,
		record.completedAtMs,
		JSON.stringify(record.answers),
		JSON.stringify(record.responseDurationsMs),
		record.draftRevision,
		record.activePartRef,
		record.activePartStartedAtMs,
		JSON.stringify(record.results),
		JSON.stringify(record.gradeResponses),
		record.nextQuestionIndex,
		JSON.stringify(record.gradedQuestionRefs),
		record.inFlightClaimId,
		record.inFlightQuestionRef,
		record.inFlightStartedAtMs,
		record.version,
		record.transitionToken
	] as const;
}

export const d1PaperSittingSessionStore: PaperSittingSessionStore = {
	async insert(record) {
		await executePersonalQuery(
			`INSERT INTO user_paper_sitting_sessions (${SESSION_COLUMNS})
			 VALUES (${Array.from({ length: 28 }, () => '?').join(', ')})`,
			[...recordParams(record)]
		);
	},
	async get(id) {
		const row = await queryPersonalFirst<SessionRow>(
			`SELECT ${SESSION_COLUMNS}
			 FROM user_paper_sitting_sessions
			 WHERE id = ?
			 LIMIT 1`,
			[id]
		);
		return row ? recordFromRow(row) : null;
	},
	async compareAndSwap(id, expectedVersion, next) {
		const params = recordParams(next);
		await executePersonalQuery(
			`UPDATE user_paper_sitting_sessions
			 SET user_id = ?, nonce_hash = ?, paper_slug = ?, source_document_id = ?,
			     review_fingerprint = ?, reviewed_at = ?, duration_minutes = ?, total_marks = ?,
			     question_groups_json = ?, status = ?, started_at_ms = ?, submitted_at_ms = ?,
			     completed_at_ms = ?, answers_json = ?, response_durations_json = ?,
			     draft_revision = ?, active_part_ref = ?, active_part_started_at_ms = ?,
			     results_json = ?, grade_responses_json = ?, next_question_index = ?, graded_question_refs_json = ?,
			     in_flight_claim_id = ?, in_flight_question_ref = ?, in_flight_started_at_ms = ?,
			     version = ?, transition_token = ?, updated_at = CURRENT_TIMESTAMP
			 WHERE id = ? AND version = ?`,
			[...params.slice(1), id, expectedVersion]
		);
		const current = await this.get(id);
		return current?.version === next.version && current.transitionToken === next.transitionToken;
	}
};

function randomId(prefix: string) {
	return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}${crypto
		.randomUUID()
		.replaceAll('-', '')}`;
}

async function sha256(value: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function manifestPayload(manifest: ApprovedPaperSittingManifest) {
	return JSON.stringify({
		paperSlug: manifest.paperSlug,
		sourceDocumentId: manifest.sourceDocumentId,
		reviewedAt: manifest.reviewedAt,
		approvedContentFingerprint: manifest.approvedContentFingerprint,
		durationMinutes: manifest.durationMinutes,
		totalMarks: manifest.totalMarks,
		questionGroups: manifest.questionGroups
	});
}

async function manifestFingerprint(manifest: ApprovedPaperSittingManifest) {
	return sha256(manifestPayload(manifest));
}

function unavailableCode(value: string | null): PaperSittingSessionErrorCode {
	const allowed = new Set<PaperSittingSessionErrorCode>([
		'review_missing',
		'review_not_approved',
		'not_complete_official_paper',
		'inventory_mismatch',
		'question_not_reviewed',
		'overlay_missing',
		'overlay_version_mismatch',
		'review_stale',
		'content_changed_since_review',
		'required_asset_not_reviewed',
		'solvability_failed',
		'renderer_incomplete',
		'unsupported_response',
		'marks_mismatch',
		'grading_incomplete'
	]);
	return allowed.has(value as PaperSittingSessionErrorCode)
		? (value as PaperSittingSessionErrorCode)
		: 'paper_unavailable';
}

export async function loadApprovedPaperSittingManifest(
	paperSlug: string
): Promise<ApprovedPaperSittingManifest> {
	let paper;
	try {
		paper = await getQuestionExperimentPaper(paperSlug);
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'status' in error &&
			Number((error as { status?: unknown }).status) === 404
		) {
			throw new PaperSittingSessionError('paper_unavailable');
		}
		throw error;
	}
	const [availability, sourceDocumentId] = await Promise.all([
		getQuestionExperimentPaperSittingAvailability(paper),
		sourceDocumentIdForSlug(paper.id)
	]);
	if (
		!availability.available ||
		!availability.reviewedAt ||
		!availability.approvedContentFingerprint ||
		availability.durationMinutes === null ||
		!sourceDocumentId
	) {
		throw new PaperSittingSessionError(unavailableCode(availability.reason));
	}
	const questionGroups = paper.questions.map((question) => ({
		questionRef: question.ref,
		partRefs: question.parts.map((part) => part.ref)
	}));
	const allQuestionRefs = questionGroups.map((group) => group.questionRef);
	const allPartRefs = questionGroups.flatMap((group) => group.partRefs);
	if (
		questionGroups.length === 0 ||
		new Set(allQuestionRefs).size !== allQuestionRefs.length ||
		new Set(allPartRefs).size !== allPartRefs.length ||
		questionGroups.some((group) => group.partRefs.length === 0)
	) {
		throw new PaperSittingSessionError('inventory_mismatch');
	}
	return {
		paperSlug: paper.id,
		sourceDocumentId,
		reviewedAt: availability.reviewedAt,
		approvedContentFingerprint: availability.approvedContentFingerprint,
		durationMinutes: availability.durationMinutes,
		totalMarks: availability.totalMarks,
		questionGroups
	};
}

function exactKeys(record: Record<string, unknown>, expected: string[]) {
	const keys = Object.keys(record).sort();
	const expectedKeys = [...expected].sort();
	return (
		keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index])
	);
}

function exactStringRecord(left: Record<string, string>, right: Record<string, string>) {
	const keys = Object.keys(left);
	return exactKeys(right, keys) && keys.every((key) => left[key] === right[key]);
}

function nextRecord(
	record: PaperSittingSessionRecord,
	random: (prefix: string) => string,
	patch: Partial<PaperSittingSessionRecord>
): PaperSittingSessionRecord {
	return {
		...record,
		...patch,
		version: record.version + 1,
		transitionToken: random('pt')
	};
}

function sessionView(record: PaperSittingSessionRecord): PaperSittingSessionView {
	return {
		sessionId: record.id,
		status: record.status,
		startedAtMs: record.startedAtMs,
		submittedAtMs: record.submittedAtMs,
		completedAtMs: record.completedAtMs,
		reviewedAt: record.reviewedAt,
		nextQuestionRef: record.questionGroups[record.nextQuestionIndex]?.questionRef ?? null,
		gradedQuestionRefs: [...record.gradedQuestionRefs],
		results: { ...record.results },
		answers: { ...record.answers },
		draftRevision: record.draftRevision
	};
}

export function createPaperSittingSessionService(
	overrides: Partial<PaperSittingSessionDependencies> = {}
) {
	const dependencies: PaperSittingSessionDependencies = {
		store: d1PaperSittingSessionStore,
		loadManifest: loadApprovedPaperSittingManifest,
		now: Date.now,
		randomId,
		...overrides
	};

	async function checkedIdentity({
		userId,
		paperSlug,
		sessionId,
		nonce
	}: {
		userId: string;
		paperSlug: string;
		sessionId: string;
		nonce: string;
	}) {
		const record = await dependencies.store.get(sessionId);
		if (!record) throw new PaperSittingSessionError('session_missing');
		if (record.userId !== userId || record.paperSlug !== paperSlug) {
			throw new PaperSittingSessionError('session_mismatch');
		}
		if ((await sha256(nonce)) !== record.nonceHash) {
			throw new PaperSittingSessionError('session_nonce_mismatch');
		}
		const now = dependencies.now();
		if (now < record.startedAtMs || now - record.startedAtMs > MAX_PAPER_SITTING_ELAPSED_MS) {
			throw new PaperSittingSessionError('session_expired');
		}
		return { record, now };
	}

	async function checkedSession(input: {
		userId: string;
		paperSlug: string;
		sessionId: string;
		nonce: string;
	}) {
		const { record, now } = await checkedIdentity(input);
		const manifest = await currentManifestForRecord(record);
		return { record, manifest, now };
	}

	async function currentManifestForRecord(record: PaperSittingSessionRecord) {
		let manifest: ApprovedPaperSittingManifest;
		try {
			manifest = await dependencies.loadManifest(record.paperSlug);
		} catch (error) {
			if (isPaperSittingSessionError(error)) {
				throw new PaperSittingSessionError('session_review_stale');
			}
			throw error;
		}
		if (
			manifest.paperSlug !== record.paperSlug ||
			manifest.sourceDocumentId !== record.sourceDocumentId ||
			manifest.reviewedAt !== record.reviewedAt ||
			(await manifestFingerprint(manifest)) !== record.reviewFingerprint
		) {
			throw new PaperSittingSessionError('session_review_stale');
		}
		return manifest;
	}

	async function currentClaimIdentityRecord(authorization: AuthorizedPaperSittingGrade) {
		const record = await dependencies.store.get(authorization.sessionId);
		const expectedGroup = record?.questionGroups[record.nextQuestionIndex];
		const expectedDurations = expectedGroup
			? Object.fromEntries(
					expectedGroup.partRefs.map((ref) => [ref, record?.responseDurationsMs[ref]])
				)
			: {};
		if (
			!record ||
			authorization.authorizationKind !== 'server_paper_sitting_claim_v1' ||
			record.userId !== authorization.userId ||
			record.paperSlug !== authorization.paperSlug ||
			record.sourceDocumentId !== authorization.sourceDocumentId ||
			record.reviewedAt !== authorization.reviewedAt ||
			record.startedAtMs !== authorization.serverStartedAtMs ||
			record.submittedAtMs === null ||
			record.submittedAtMs !== authorization.serverSubmittedAtMs ||
			record.inFlightClaimId !== authorization.claimId ||
			record.inFlightQuestionRef !== authorization.questionRef ||
			!expectedGroup ||
			expectedGroup.questionRef !== authorization.questionRef ||
			JSON.stringify(expectedGroup.partRefs) !== JSON.stringify(authorization.partRefs) ||
			!exactKeys(authorization.responseDurationsMs, expectedGroup.partRefs) ||
			expectedGroup.partRefs.some(
				(ref) => authorization.responseDurationsMs[ref] !== expectedDurations[ref]
			)
		) {
			throw new PaperSittingSessionError('session_conflict');
		}
		return record;
	}

	function deadlineAt(record: PaperSittingSessionRecord) {
		return record.startedAtMs + record.durationMinutes * 60_000;
	}

	function closeActivePart(record: PaperSittingSessionRecord, endedAtMs: number) {
		if (!record.activePartRef || record.activePartStartedAtMs === null) {
			return {
				responseDurationsMs: { ...record.responseDurationsMs },
				activePartRef: null,
				activePartStartedAtMs: null
			};
		}
		const safeEnd = Math.max(record.activePartStartedAtMs, Math.min(endedAtMs, deadlineAt(record)));
		return {
			responseDurationsMs: {
				...record.responseDurationsMs,
				[record.activePartRef]:
					(record.responseDurationsMs[record.activePartRef] ?? 0) +
					(safeEnd - record.activePartStartedAtMs)
			},
			activePartRef: null,
			activePartStartedAtMs: null
		};
	}

	async function lockSubmission(record: PaperSittingSessionRecord, submittedAtMs: number) {
		if (record.status !== 'in_progress') return record;
		const closed = closeActivePart(record, submittedAtMs);
		const next = nextRecord(record, dependencies.randomId, {
			status: 'submitted',
			submittedAtMs,
			...closed
		});
		if (!(await dependencies.store.compareAndSwap(record.id, record.version, next))) {
			const current = await dependencies.store.get(record.id);
			if (current && current.status !== 'in_progress') return current;
			throw new PaperSittingSessionError('session_conflict');
		}
		return next;
	}

	return {
		async start({ userId, paperSlug }: { userId: string; paperSlug: string }) {
			const manifest = await dependencies.loadManifest(paperSlug);
			const now = dependencies.now();
			const nonce = dependencies.randomId('pn');
			const partRefs = manifest.questionGroups.flatMap((group) => group.partRefs);
			const record: PaperSittingSessionRecord = {
				id: dependencies.randomId('ps'),
				userId,
				nonceHash: await sha256(nonce),
				paperSlug: manifest.paperSlug,
				sourceDocumentId: manifest.sourceDocumentId,
				reviewFingerprint: await manifestFingerprint(manifest),
				reviewedAt: manifest.reviewedAt,
				durationMinutes: manifest.durationMinutes,
				totalMarks: manifest.totalMarks,
				questionGroups: manifest.questionGroups,
				status: 'in_progress',
				startedAtMs: now,
				submittedAtMs: null,
				completedAtMs: null,
				answers: Object.fromEntries(partRefs.map((ref) => [ref, ''])),
				responseDurationsMs: Object.fromEntries(partRefs.map((ref) => [ref, 0])),
				draftRevision: 0,
				activePartRef: partRefs[0] ?? null,
				activePartStartedAtMs: partRefs[0] ? now : null,
				results: {},
				gradeResponses: {},
				nextQuestionIndex: 0,
				gradedQuestionRefs: [],
				inFlightClaimId: null,
				inFlightQuestionRef: null,
				inFlightStartedAtMs: null,
				version: 0,
				transitionToken: dependencies.randomId('pt')
			};
			await dependencies.store.insert(record);
			return { ...sessionView(record), nonce };
		},

		async resume(input: { userId: string; paperSlug: string; sessionId: string; nonce: string }) {
			const { record: checkedRecord, now } = await checkedIdentity(input);
			let record = checkedRecord;
			const expectedGroup = record.questionGroups[record.nextQuestionIndex];
			const canResumeHistoricalResult =
				record.status === 'complete' ||
				(record.status === 'grading' &&
					Boolean(expectedGroup && record.gradeResponses[expectedGroup.questionRef]));
			if (!canResumeHistoricalResult) await currentManifestForRecord(record);
			if (record.status === 'in_progress' && now >= deadlineAt(record)) {
				record = await lockSubmission(record, deadlineAt(record));
			}
			return sessionView(record);
		},

		async saveDraft(input: {
			userId: string;
			paperSlug: string;
			sessionId: string;
			nonce: string;
			draftRevision: number;
			answers: Record<string, string>;
			activePartRef: string | null;
		}) {
			const { record, now } = await checkedIdentity(input);
			if (record.status !== 'in_progress') return sessionView(record);
			if (now >= deadlineAt(record)) {
				return sessionView(await lockSubmission(record, deadlineAt(record)));
			}
			const expectedPartRefs = record.questionGroups.flatMap((group) => group.partRefs);
			if (
				!Number.isInteger(input.draftRevision) ||
				input.draftRevision < 1 ||
				!exactKeys(input.answers, expectedPartRefs) ||
				Object.values(input.answers).some(
					(answer) => typeof answer !== 'string' || answer.length > MAX_PAPER_ANSWER_LENGTH
				) ||
				(input.activePartRef !== null && !expectedPartRefs.includes(input.activePartRef))
			) {
				throw new PaperSittingSessionError('session_inventory_mismatch');
			}
			if (input.draftRevision < record.draftRevision) return sessionView(record);
			if (input.draftRevision === record.draftRevision) {
				if (
					!exactStringRecord(input.answers, record.answers) ||
					input.activePartRef !== record.activePartRef
				) {
					throw new PaperSittingSessionError('session_conflict');
				}
				return sessionView(record);
			}

			let timing = {
				responseDurationsMs: { ...record.responseDurationsMs },
				activePartRef: record.activePartRef,
				activePartStartedAtMs: record.activePartStartedAtMs
			};
			if (input.activePartRef !== record.activePartRef) {
				timing = {
					...closeActivePart(record, now),
					activePartRef: input.activePartRef,
					activePartStartedAtMs: input.activePartRef ? now : null
				};
			}
			const next = nextRecord(record, dependencies.randomId, {
				answers: { ...input.answers },
				draftRevision: input.draftRevision,
				...timing
			});
			if (!(await dependencies.store.compareAndSwap(record.id, record.version, next))) {
				throw new PaperSittingSessionError('session_conflict');
			}
			return sessionView(next);
		},

		async submit(input: { userId: string; paperSlug: string; sessionId: string; nonce: string }) {
			const { record, now } = await checkedSession(input);
			if (record.status !== 'in_progress') return sessionView(record);
			return sessionView(await lockSubmission(record, Math.min(now, deadlineAt(record))));
		},

		async claimGrade(input: {
			userId: string;
			paperSlug: string;
			sessionId: string;
			nonce: string;
			questionRef: string;
		}): Promise<ClaimedPaperSittingGrade | ReplayedPaperSittingGrade> {
			const { record: checkedRecord, now } = await checkedIdentity(input);
			let record = checkedRecord;
			if (record.status === 'in_progress' && now >= deadlineAt(record)) {
				record = await lockSubmission(record, deadlineAt(record));
			}
			if (record.status === 'in_progress') {
				throw new PaperSittingSessionError('session_not_submitted');
			}
			if (record.gradedQuestionRefs.includes(input.questionRef)) {
				const response = record.gradeResponses[input.questionRef];
				if (!response) throw new PaperSittingSessionError('session_inventory_mismatch');
				return { kind: 'replay', response };
			}
			if (record.status === 'complete') {
				throw new PaperSittingSessionError('question_out_of_order');
			}
			const expectedGroup = record.questionGroups[record.nextQuestionIndex];
			if (!expectedGroup || expectedGroup.questionRef !== input.questionRef) {
				throw new PaperSittingSessionError('question_out_of_order');
			}
			const reusedResponse = record.gradeResponses[expectedGroup.questionRef] ?? null;
			if (
				!reusedResponse &&
				record.inFlightClaimId &&
				(record.inFlightStartedAtMs === null ||
					now - record.inFlightStartedAtMs <= PAPER_SITTING_CLAIM_TIMEOUT_MS)
			) {
				throw new PaperSittingSessionError('session_busy');
			}
			// A staged response is the durable authorization commit. New model work still
			// requires the live approved manifest, while an exact staged response may be
			// retried after a later review change so Personal writes can finish idempotently.
			if (!reusedResponse) await currentManifestForRecord(record);
			const allPartRefs = record.questionGroups.flatMap((group) => group.partRefs);
			if (
				!exactKeys(record.answers, allPartRefs) ||
				!exactKeys(record.responseDurationsMs, allPartRefs) ||
				record.submittedAtMs === null
			) {
				throw new PaperSittingSessionError('session_inventory_mismatch');
			}
			const answers = Object.fromEntries(
				expectedGroup.partRefs.map((ref) => [ref, record.answers[ref]])
			);
			const responseDurationsMs = Object.fromEntries(
				expectedGroup.partRefs.map((ref) => [ref, record.responseDurationsMs[ref]])
			);
			if (
				!exactKeys(answers, expectedGroup.partRefs) ||
				!exactKeys(responseDurationsMs, expectedGroup.partRefs)
			) {
				throw new PaperSittingSessionError('session_inventory_mismatch');
			}
			const claimId = dependencies.randomId('pc');
			const next = nextRecord(record, dependencies.randomId, {
				status: 'grading',
				inFlightClaimId: claimId,
				inFlightQuestionRef: expectedGroup.questionRef,
				inFlightStartedAtMs: now
			});
			if (!(await dependencies.store.compareAndSwap(record.id, record.version, next))) {
				throw new PaperSittingSessionError('session_conflict');
			}
			return {
				kind: 'claimed',
				answers,
				reusedResponse,
				authorization: {
					authorizationKind: 'server_paper_sitting_claim_v1',
					sessionId: record.id,
					userId: record.userId,
					paperSlug: record.paperSlug,
					sourceDocumentId: record.sourceDocumentId,
					reviewedAt: record.reviewedAt,
					questionRef: expectedGroup.questionRef,
					partRefs: [...expectedGroup.partRefs],
					responseDurationsMs,
					serverStartedAtMs: record.startedAtMs,
					serverSubmittedAtMs: record.submittedAtMs,
					claimId
				}
			};
		},

		async releaseGradeClaim({ sessionId, claimId }: { sessionId: string; claimId: string }) {
			const record = await dependencies.store.get(sessionId);
			if (!record || record.inFlightClaimId !== claimId) return false;
			const next = nextRecord(record, dependencies.randomId, {
				inFlightClaimId: null,
				inFlightQuestionRef: null,
				inFlightStartedAtMs: null
			});
			return dependencies.store.compareAndSwap(record.id, record.version, next);
		},

		async stageGrade({
			authorization,
			response
		}: {
			authorization: AuthorizedPaperSittingGrade;
			response: ExperimentGradeResponse;
		}) {
			const record = await currentClaimIdentityRecord(authorization);
			if (
				response.paperSlug !== authorization.paperSlug ||
				response.ref !== authorization.questionRef ||
				!exactKeys(
					Object.fromEntries(response.results.map((result) => [result.ref, true])),
					authorization.partRefs
				)
			) {
				throw new PaperSittingSessionError('session_inventory_mismatch');
			}
			const existing = record.gradeResponses[authorization.questionRef];
			if (existing && JSON.stringify(existing) !== JSON.stringify(response)) {
				throw new PaperSittingSessionError('session_replay');
			}
			if (existing) return existing;
			await currentManifestForRecord(record);
			const next = nextRecord(record, dependencies.randomId, {
				gradeResponses: {
					...record.gradeResponses,
					[authorization.questionRef]: response
				}
			});
			if (!(await dependencies.store.compareAndSwap(record.id, record.version, next))) {
				throw new PaperSittingSessionError('session_conflict');
			}
			return response;
		},

		async completeGrade({
			authorization,
			results
		}: {
			authorization: AuthorizedPaperSittingGrade;
			results: ExperimentQuestionGradeResult[];
		}) {
			const record = await currentClaimIdentityRecord(authorization);
			const expectedGroup = record.questionGroups[record.nextQuestionIndex];
			const stagedResponse = record.gradeResponses[authorization.questionRef];
			const resultRefs = results.map((result) => result.ref);
			if (
				!expectedGroup ||
				expectedGroup.questionRef !== authorization.questionRef ||
				!stagedResponse ||
				JSON.stringify(stagedResponse.results) !== JSON.stringify(results) ||
				!exactKeys(
					Object.fromEntries(resultRefs.map((ref) => [ref, true])),
					expectedGroup.partRefs
				) ||
				results.some((result) => !result || typeof result !== 'object')
			) {
				throw new PaperSittingSessionError('session_inventory_mismatch');
			}
			const nextQuestionIndex = record.nextQuestionIndex + 1;
			const complete = nextQuestionIndex === record.questionGroups.length;
			const now = dependencies.now();
			const next = nextRecord(record, dependencies.randomId, {
				status: complete ? 'complete' : 'grading',
				completedAtMs: complete ? now : null,
				nextQuestionIndex,
				gradedQuestionRefs: [...record.gradedQuestionRefs, authorization.questionRef],
				results: {
					...record.results,
					...Object.fromEntries(results.map((result) => [result.ref, result]))
				},
				inFlightClaimId: null,
				inFlightQuestionRef: null,
				inFlightStartedAtMs: null
			});
			if (!(await dependencies.store.compareAndSwap(record.id, record.version, next))) {
				throw new PaperSittingSessionError('session_conflict');
			}
			return sessionView(next);
		}
	};
}

const defaultService = createPaperSittingSessionService();

export const startPaperSittingSession = defaultService.start;
export const resumePaperSittingSession = defaultService.resume;
export const savePaperSittingDraft = defaultService.saveDraft;
export const submitPaperSittingSession = defaultService.submit;
export const claimPaperSittingGrade = defaultService.claimGrade;
export const releasePaperSittingGradeClaim = defaultService.releaseGradeClaim;
export const stagePaperSittingGrade = defaultService.stageGrade;
export const completePaperSittingGrade = defaultService.completeGrade;
