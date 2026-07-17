import type { ExperimentGradeResponse, ExperimentQuestionGradeResult } from './gradingTypes';
import { assetCanvasAnswerIsMeaningful } from './assetCanvasAnswer';
import { isUnsupportedPaperSittingResponseKind } from './paperSittingResponsePolicy.js';
import type { ExamPaper, ExamQuestionPart, ExamResponse } from './types';

export const PAPER_SITTING_STORAGE_VERSION = 4;
export const MAX_PAPER_ANSWER_LENGTH = 5_000;
export const MAX_PAPER_SITTING_ELAPSED_MS = 7 * 24 * 60 * 60 * 1_000;

export type PaperSittingStatus = 'in_progress' | 'grading' | 'complete';

export type StoredPaperSitting = {
	version: typeof PAPER_SITTING_STORAGE_VERSION;
	paperId: string;
	userId: string;
	readinessReviewedAt: string;
	sessionId: string;
	nonce: string;
	draftRevision: number;
	status: PaperSittingStatus;
	startedAt: number;
	submittedAt: number | null;
	updatedAt: number;
	answers: Record<string, string>;
	results: Record<string, ExperimentQuestionGradeResult>;
	gradedQuestionRefs: string[];
	responseDurationsMs: Record<string, number>;
	activePartRef: string | null;
	activePartStartedAt: number | null;
};

export type PaperSittingPart = {
	questionRef: string;
	part: ExamQuestionPart;
};

function assetCanvasHasWrittenResponse(response: Extract<ExamResponse, { kind: 'asset-canvas' }>) {
	return Boolean(response.lineCount || response.answerLabel);
}

export function answerablePaperParts(paper: ExamPaper): PaperSittingPart[] {
	return paper.questions.flatMap((question) =>
		question.parts
			.filter(
				(part) =>
					part.response.kind !== 'none' &&
					(part.response.kind !== 'asset-canvas' || assetCanvasHasWrittenResponse(part.response))
			)
			.map((part) => ({ questionRef: question.ref, part }))
	);
}

export function unsafePaperGradingPartRefs(paper: ExamPaper) {
	return paper.questions.flatMap((question) =>
		question.parts
			.filter((part) => part.marks > 0 && isUnsupportedPaperSittingResponseKind(part.response.kind))
			.map((part) => part.ref)
	);
}

function valueAfterSeparator(line: string, separator: ':' | '->') {
	const index = line.indexOf(separator);
	if (index < 0) return '';
	return line.slice(index + separator.length).trim();
}

export function hasMeaningfulPaperAnswer(response: ExamResponse, answer: string) {
	const value = answer.trim();
	if (!value || response.kind === 'none') return false;
	if (response.kind === 'asset-canvas') return assetCanvasAnswerIsMeaningful(answer);

	if (
		response.kind === 'labeled-lines' ||
		response.kind === 'equation-blanks' ||
		response.kind === 'image-label-zones'
	) {
		return value.split(/\r?\n/).some((line) => valueAfterSeparator(line, ':').length > 0);
	}

	if (response.kind === 'matching') {
		return value.split(/\r?\n/).some((line) => valueAfterSeparator(line, '->').length > 0);
	}

	return true;
}

export function normalizedPaperAnswer(response: ExamResponse, answer: string) {
	return hasMeaningfulPaperAnswer(response, answer) ? answer.trim() : '';
}

export function paperAnswerProgress(paper: ExamPaper, answers: Record<string, string>) {
	const parts = answerablePaperParts(paper);
	const answeredParts = parts.filter(({ part }) =>
		hasMeaningfulPaperAnswer(part.response, answers[part.ref] ?? '')
	);
	const questionProgress = paper.questions.map((question) => {
		const questionParts = parts.filter((candidate) => candidate.questionRef === question.ref);
		const answered = questionParts.filter(({ part }) =>
			hasMeaningfulPaperAnswer(part.response, answers[part.ref] ?? '')
		).length;
		return {
			ref: question.ref,
			answered,
			total: questionParts.length,
			complete: questionParts.length > 0 && answered === questionParts.length
		};
	});

	return {
		answered: answeredParts.length,
		total: parts.length,
		unanswered: Math.max(0, parts.length - answeredParts.length),
		totalMarks: parts.reduce((sum, { part }) => sum + part.marks, 0),
		questionProgress
	};
}

export function overlongPaperAnswerRefs(paper: ExamPaper, answers: Record<string, string>) {
	return answerablePaperParts(paper)
		.filter(({ part }) => (answers[part.ref] ?? '').length > MAX_PAPER_ANSWER_LENGTH)
		.map(({ part }) => part.ref);
}

export function paperSittingStorageKey(userId: string, paperId: string) {
	return `question-constellation:paper-sitting:v4:${encodeURIComponent(userId)}:${encodeURIComponent(paperId)}`;
}

export function createPaperSitting({
	paper,
	userId,
	readinessReviewedAt,
	sessionId,
	nonce,
	now = Date.now()
}: {
	paper: ExamPaper;
	userId: string;
	readinessReviewedAt: string;
	sessionId: string;
	nonce: string;
	now?: number;
}): StoredPaperSitting {
	const firstPartRef = answerablePaperParts(paper)[0]?.part.ref ?? null;
	return {
		version: PAPER_SITTING_STORAGE_VERSION,
		paperId: paper.id,
		userId,
		readinessReviewedAt,
		sessionId,
		nonce,
		draftRevision: 0,
		status: 'in_progress',
		startedAt: now,
		submittedAt: null,
		updatedAt: now,
		answers: {},
		results: {},
		gradedQuestionRefs: [],
		responseDurationsMs: {},
		activePartRef: firstPartRef,
		activePartStartedAt: firstPartRef ? now : null
	};
}

function closeActivePaperPart(session: StoredPaperSitting, now: number): StoredPaperSitting {
	if (!session.activePartRef || session.activePartStartedAt === null) return session;
	const activeDuration = Math.max(0, now - session.activePartStartedAt);
	return {
		...session,
		responseDurationsMs: {
			...session.responseDurationsMs,
			[session.activePartRef]:
				(session.responseDurationsMs[session.activePartRef] ?? 0) + activeDuration
		},
		activePartRef: null,
		activePartStartedAt: null,
		updatedAt: now
	};
}

export function activatePaperSittingPart(
	session: StoredPaperSitting,
	partRef: string,
	now = Date.now()
): StoredPaperSitting {
	if (session.status !== 'in_progress' || session.activePartRef === partRef) return session;
	const closed = closeActivePaperPart(session, now);
	return {
		...closed,
		activePartRef: partRef,
		activePartStartedAt: now,
		updatedAt: now
	};
}

export function submitPaperSitting(
	session: StoredPaperSitting,
	now = Date.now()
): StoredPaperSitting {
	if (session.status !== 'in_progress') return session;
	const closed = closeActivePaperPart(session, now);
	return {
		...closed,
		status: 'grading',
		submittedAt: now,
		updatedAt: now
	};
}

export function paperPartResponseDurationMs(
	session: StoredPaperSitting,
	partRef: string,
	now = Date.now()
) {
	const stored = session.responseDurationsMs[partRef] ?? 0;
	if (
		session.status !== 'in_progress' ||
		session.activePartRef !== partRef ||
		session.activePartStartedAt === null
	) {
		return stored;
	}
	return stored + Math.max(0, now - session.activePartStartedAt);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPaperSittingStatus(value: unknown): value is PaperSittingStatus {
	return value === 'in_progress' || value === 'grading' || value === 'complete';
}

export function parseStoredPaperSitting(
	raw: string | null,
	{
		paper,
		userId,
		readinessReviewedAt,
		now = Date.now(),
		recoveryMode = false
	}: {
		paper: ExamPaper;
		userId: string;
		readinessReviewedAt: string;
		now?: number;
		recoveryMode?: boolean;
	}
): StoredPaperSitting | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as unknown;
		if (!isRecord(value)) return null;
		if (value.version !== PAPER_SITTING_STORAGE_VERSION) return null;
		if (value.paperId !== paper.id || value.userId !== userId) return null;
		if (
			typeof value.readinessReviewedAt !== 'string' ||
			!value.readinessReviewedAt.trim() ||
			(!recoveryMode && value.readinessReviewedAt !== readinessReviewedAt)
		)
			return null;
		if (typeof value.sessionId !== 'string' || !value.sessionId.trim()) return null;
		if (typeof value.nonce !== 'string' || value.nonce.length < 32) return null;
		if (
			typeof value.draftRevision !== 'number' ||
			!Number.isInteger(value.draftRevision) ||
			value.draftRevision < 0
		)
			return null;
		if (!isPaperSittingStatus(value.status)) return null;
		if (typeof value.startedAt !== 'number' || !Number.isFinite(value.startedAt)) return null;
		if (typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) return null;
		if (value.submittedAt !== null && typeof value.submittedAt !== 'number') return null;
		if (value.startedAt <= 0 || value.startedAt > now || value.updatedAt < value.startedAt)
			return null;
		if (value.status === 'in_progress' && value.submittedAt !== null) return null;
		if (value.status !== 'in_progress' && typeof value.submittedAt !== 'number') return null;
		if (typeof value.submittedAt === 'number' && value.submittedAt < value.startedAt) return null;
		if (
			!recoveryMode &&
			value.status !== 'complete' &&
			now - value.startedAt > MAX_PAPER_SITTING_ELAPSED_MS
		) {
			return null;
		}
		if (!isRecord(value.answers) || !isRecord(value.results)) return null;
		if (!Array.isArray(value.gradedQuestionRefs)) return null;
		if (!isRecord(value.responseDurationsMs)) return null;

		const partRefs = new Set(
			paper.questions.flatMap((question) => question.parts.map((part) => part.ref))
		);
		const questionRefs = new Set(paper.questions.map((question) => question.ref));
		const answers = Object.fromEntries(
			Object.entries(value.answers)
				.filter(
					(entry): entry is [string, string] =>
						typeof entry[1] === 'string' && (recoveryMode || partRefs.has(entry[0]))
				)
				.map(([ref, answer]) => [ref, answer])
		);
		const results = Object.fromEntries(
			Object.entries(value.results).filter(
				([ref, result]) =>
					(recoveryMode || partRefs.has(ref)) && isRecord(result) && result.ref === ref
			)
		) as Record<string, ExperimentQuestionGradeResult>;
		const gradedQuestionRefs = value.gradedQuestionRefs.filter(
			(ref): ref is string => typeof ref === 'string' && (recoveryMode || questionRefs.has(ref))
		);
		const responseDurationsMs = Object.fromEntries(
			Object.entries(value.responseDurationsMs).filter(
				(entry): entry is [string, number] =>
					(recoveryMode || partRefs.has(entry[0])) &&
					typeof entry[1] === 'number' &&
					Number.isFinite(entry[1]) &&
					entry[1] >= 0 &&
					entry[1] <= MAX_PAPER_SITTING_ELAPSED_MS
			)
		);
		const activePartRef =
			typeof value.activePartRef === 'string' && (recoveryMode || partRefs.has(value.activePartRef))
				? value.activePartRef
				: null;
		const activePartStartedAt =
			typeof value.activePartStartedAt === 'number' &&
			Number.isFinite(value.activePartStartedAt) &&
			value.activePartStartedAt >= value.startedAt &&
			value.activePartStartedAt <= now
				? value.activePartStartedAt
				: null;
		if ((activePartRef === null) !== (activePartStartedAt === null)) return null;
		if (
			!recoveryMode &&
			value.status === 'in_progress' &&
			answerablePaperParts(paper).length > 0 &&
			!activePartRef
		) {
			return null;
		}
		if (value.status !== 'in_progress' && activePartRef) return null;
		const elapsed = (value.submittedAt ?? now) - value.startedAt;
		const measured =
			Object.values(responseDurationsMs).reduce((sum, duration) => sum + duration, 0) +
			(activePartStartedAt === null ? 0 : now - activePartStartedAt);
		if (measured > elapsed + 1_000) return null;

		return {
			version: PAPER_SITTING_STORAGE_VERSION,
			paperId: paper.id,
			userId,
			readinessReviewedAt: value.readinessReviewedAt,
			sessionId: value.sessionId,
			nonce: value.nonce,
			draftRevision: value.draftRevision,
			status: value.status,
			startedAt: value.startedAt,
			submittedAt: value.submittedAt as number | null,
			updatedAt: value.updatedAt,
			answers,
			results,
			gradedQuestionRefs: [...new Set(gradedQuestionRefs)],
			responseDurationsMs,
			activePartRef,
			activePartStartedAt
		};
	} catch {
		return null;
	}
}

export function elapsedPaperSittingMs(session: StoredPaperSitting, now = Date.now()) {
	const end = session.submittedAt ?? now;
	return Math.max(0, end - session.startedAt);
}

export function remainingPaperSittingMs(
	session: StoredPaperSitting,
	durationMinutes: number,
	now = Date.now()
) {
	return durationMinutes * 60_000 - elapsedPaperSittingMs(session, now);
}

export function paperSittingDeadlineAtMs(
	session: Pick<StoredPaperSitting, 'startedAt'>,
	durationMinutes: number
) {
	return session.startedAt + Math.max(0, durationMinutes * 60_000);
}

export function paperSittingNeedsDeadlineSubmission(
	session: Pick<StoredPaperSitting, 'status' | 'startedAt'>,
	durationMinutes: number,
	now = Date.now()
) {
	return (
		session.status === 'in_progress' && now >= paperSittingDeadlineAtMs(session, durationMinutes)
	);
}

export function mergePaperGradeResponse(
	session: StoredPaperSitting,
	response: ExperimentGradeResponse,
	now = Date.now()
): StoredPaperSitting {
	const results = { ...session.results };
	for (const result of response.results) results[result.ref] = result;
	return {
		...session,
		status: 'grading',
		updatedAt: now,
		results,
		gradedQuestionRefs: [...new Set([...session.gradedQuestionRefs, response.ref])]
	};
}

export function paperGradeSummary(
	results: Record<string, ExperimentQuestionGradeResult>,
	expectedTotalMarks: number
) {
	const values = Object.values(results);
	const awardedMarks = values.reduce((sum, result) => sum + (result.awardedMarks ?? 0), 0);
	const returnedMaxMarks = values.reduce((sum, result) => sum + result.maxMarks, 0);
	const ungradedMarks =
		values.reduce((sum, result) => sum + Math.max(0, result.maxMarks - result.gradeableMarks), 0) +
		Math.max(0, expectedTotalMarks - returnedMaxMarks);
	const checkedMarks = Math.max(0, expectedTotalMarks - ungradedMarks);
	return {
		awardedMarks,
		totalMarks: expectedTotalMarks,
		checkedMarks,
		ungradedMarks,
		percent:
			expectedTotalMarks > 0 ? Math.round((awardedMarks / expectedTotalMarks) * 1_000) / 10 : 0
	};
}
