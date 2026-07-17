import type { ExperimentGradeResponse } from '$lib/experiments/questions/gradingTypes';
import type { ConstructedAnswerAssistance } from '$lib/learning/answerAssistance';
import type { AdminUser } from '$lib/server/auth/session';
import type { QuestionGradeResult } from '$lib/server/answerGrading';
import type { AuthorizedPaperSittingGrade } from '$lib/server/paperSittingSession';
import { recordQuestionAttempt } from '$lib/server/personalLearning';
import { recordQuestionAttemptEvidence } from '$lib/server/subjectLearning';

const INDEPENDENT_PAPER_ASSISTANCE: ConstructedAnswerAssistance = {};

export function paperSittingAttemptId({
	userId,
	sessionId,
	paperSlug,
	questionId
}: {
	userId: string;
	sessionId: string;
	paperSlug: string;
	questionId: string;
}) {
	return `paper:${encodeURIComponent(userId)}:${encodeURIComponent(sessionId)}:${encodeURIComponent(paperSlug)}:${encodeURIComponent(questionId)}`;
}

function questionGradeResult(
	response: ExperimentGradeResponse,
	result: ExperimentGradeResponse['results'][number]
): QuestionGradeResult | null {
	if (result.maxMarks <= 0) return null;
	if (
		result.status === 'unanswered' &&
		result.gradeableMarks === result.maxMarks &&
		result.maxMarks > 0
	) {
		return {
			status: 'ok',
			result: 'incorrect',
			awardedMarks: 0,
			maxMarks: result.maxMarks,
			presentStepIds: [],
			missingStepIds: result.chain?.steps.map((step) => step.id) ?? [],
			feedbackMarkdown: result.summary.trim() || 'No answer was submitted.',
			thinkingMarkdown: null,
			model: response.model,
			modelVersion: response.modelVersion
		};
	}
	if (
		result.status !== 'graded' ||
		result.result === 'ungraded' ||
		typeof result.awardedMarks !== 'number'
	) {
		return null;
	}
	const presentStepIds =
		result.chain?.steps.filter((step) => step.verdict === 'credited').map((step) => step.id) ?? [];
	const missingStepIds =
		result.chain?.steps.filter((step) => step.verdict === 'missed').map((step) => step.id) ?? [];
	const feedbackMarkdown = [result.summary.trim(), result.nextStep.trim()]
		.filter(Boolean)
		.join('\n\n');

	return {
		status: 'ok',
		result: result.result,
		awardedMarks: result.awardedMarks,
		maxMarks: result.maxMarks,
		presentStepIds,
		missingStepIds,
		feedbackMarkdown,
		thinkingMarkdown: null,
		model: response.model,
		modelVersion: response.modelVersion
	};
}

export type PaperSittingPersistenceSummary = {
	saved: number;
	skipped: number;
	failed: number;
};

export async function persistPaperSittingGradeResponse({
	user,
	answers,
	response,
	authorization
}: {
	user: AdminUser;
	answers: Record<string, string>;
	response: ExperimentGradeResponse;
	authorization: AuthorizedPaperSittingGrade;
}): Promise<PaperSittingPersistenceSummary> {
	const expectedRefs = [...new Set(authorization.partRefs)].sort();
	const answerRefs = Object.keys(answers).sort();
	const resultRefs = response.results.map((result) => result.ref).sort();
	const durationRefs = Object.keys(authorization.responseDurationsMs).sort();
	if (
		authorization.authorizationKind !== 'server_paper_sitting_claim_v1' ||
		authorization.userId !== user.uid ||
		authorization.paperSlug !== response.paperSlug ||
		authorization.questionRef !== response.ref ||
		expectedRefs.length !== authorization.partRefs.length ||
		JSON.stringify(expectedRefs) !== JSON.stringify(answerRefs) ||
		JSON.stringify(expectedRefs) !== JSON.stringify(resultRefs) ||
		JSON.stringify(expectedRefs) !== JSON.stringify(durationRefs) ||
		!Number.isInteger(authorization.serverStartedAtMs) ||
		!Number.isInteger(authorization.serverSubmittedAtMs) ||
		authorization.serverSubmittedAtMs < authorization.serverStartedAtMs
	) {
		throw new Error(
			'Paper sitting persistence requires an exact server-authorized question inventory.'
		);
	}

	const summary: PaperSittingPersistenceSummary = { saved: 0, skipped: 0, failed: 0 };

	for (const result of response.results) {
		const gradeResult = questionGradeResult(response, result);
		const answer = answers[result.ref]?.trim() ?? '';
		const responseDurationMs = authorization.responseDurationsMs[result.ref];
		if (!gradeResult) {
			summary.skipped += 1;
			continue;
		}
		const attemptId = paperSittingAttemptId({
			userId: user.uid,
			sessionId: authorization.sessionId,
			paperSlug: authorization.paperSlug,
			questionId: result.questionId
		});
		try {
			const savedAttempt = await recordQuestionAttempt({
				user,
				questionId: result.questionId,
				answer,
				result: gradeResult,
				attemptId,
				assistance: INDEPENDENT_PAPER_ASSISTANCE
			});
			if (!savedAttempt) {
				summary.failed += 1;
				continue;
			}
			const evidenceRecorded = await recordQuestionAttemptEvidence({
				user,
				attemptId: savedAttempt.id,
				questionId: result.questionId,
				result: gradeResult,
				assistance: INDEPENDENT_PAPER_ASSISTANCE,
				sourceSessionId: authorization.sessionId,
				responseDurationMs,
				occurredAt: new Date(authorization.serverSubmittedAtMs).toISOString()
			});
			if (evidenceRecorded !== true) {
				summary.failed += 1;
				continue;
			}
			summary.saved += 1;
		} catch (error) {
			summary.failed += 1;
			console.error('[paper-sitting-persistence] unable to save graded answer', {
				paperSlug: authorization.paperSlug,
				questionId: result.questionId,
				attemptId,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	return summary;
}
