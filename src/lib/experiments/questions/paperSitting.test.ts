import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ExperimentGradeResponse } from './gradingTypes';
import {
	answerablePaperParts,
	activatePaperSittingPart,
	createPaperSitting,
	elapsedPaperSittingMs,
	hasMeaningfulPaperAnswer,
	mergePaperGradeResponse,
	MAX_PAPER_SITTING_ELAPSED_MS,
	normalizedPaperAnswer,
	paperAnswerProgress,
	paperGradeSummary,
	paperPartResponseDurationMs,
	paperSittingDeadlineAtMs,
	paperSittingNeedsDeadlineSubmission,
	parseStoredPaperSitting,
	remainingPaperSittingMs,
	submitPaperSitting,
	unsafePaperGradingPartRefs
} from './paperSitting';
import { serializeAssetCanvasAnswer } from './assetCanvasAnswer';
import type { ExamPaper, ExamResponse } from './types';

function paperFixture(): ExamPaper {
	return {
		id: 'paper-1',
		title: 'Paper 1',
		subtitle: 'June 2025',
		source: 'Fixture',
		assets: {},
		questions: [
			{
				ref: '01',
				blocks: [],
				parts: [
					{
						questionId: 'q-1',
						ref: '01.1',
						marks: 2,
						blocks: [],
						response: { kind: 'lines', count: 2 }
					},
					{
						questionId: 'q-2',
						ref: '01.2',
						marks: 1,
						blocks: [],
						response: { kind: 'labeled-lines', labels: ['Value'] }
					}
				]
			},
			{
				ref: '02',
				blocks: [],
				parts: [
					{
						questionId: 'q-3',
						ref: '02.1',
						marks: 1,
						blocks: [],
						response: { kind: 'matching', left: ['A'], right: ['B'] }
					},
					{
						questionId: 'q-4',
						ref: '02.2',
						marks: 0,
						blocks: [],
						response: { kind: 'none' }
					},
					{
						questionId: 'q-5',
						ref: '02.3',
						marks: 2,
						blocks: [],
						response: { kind: 'drawing-box' }
					}
				]
			}
		]
	};
}

describe('paper sitting answers', () => {
	it('does not count empty structured-response scaffolding as an answer', () => {
		const labeled: ExamResponse = { kind: 'labeled-lines', labels: ['Value'] };
		const matching: ExamResponse = { kind: 'matching', left: ['A'], right: ['B'] };
		const equation: ExamResponse = {
			kind: 'equation-blanks',
			segments: [{ kind: 'blank', id: 'x', label: 'x' }]
		};

		expect(hasMeaningfulPaperAnswer(labeled, 'Value:')).toBe(false);
		expect(hasMeaningfulPaperAnswer(matching, 'A ->')).toBe(false);
		expect(hasMeaningfulPaperAnswer(equation, 'x:   ')).toBe(false);
		expect(hasMeaningfulPaperAnswer(labeled, 'Value: 42')).toBe(true);
		expect(hasMeaningfulPaperAnswer(matching, 'A -> B')).toBe(true);
		expect(normalizedPaperAnswer(labeled, 'Value:')).toBe('');
	});

	it('reports real part and question progress and flags drawing grading as unsafe', () => {
		const paper = paperFixture();
		expect(answerablePaperParts(paper).map(({ part }) => part.ref)).toEqual([
			'01.1',
			'01.2',
			'02.1',
			'02.3'
		]);
		expect(unsafePaperGradingPartRefs(paper)).toEqual(['02.3']);

		expect(
			paperAnswerProgress(paper, {
				'01.1': 'A real answer',
				'01.2': 'Value:',
				'02.1': 'A -> B'
			})
		).toEqual({
			answered: 2,
			total: 4,
			unanswered: 2,
			totalMarks: 6,
			questionProgress: [
				{ ref: '01', answered: 1, total: 2, complete: false },
				{ ref: '02', answered: 1, total: 2, complete: false }
			]
		});
	});

	it('counts mixed diagram-and-written responses while keeping visual grading fail-closed', () => {
		const paper = paperFixture();
		paper.questions[1].parts.push({
			questionId: 'q-6',
			ref: '02.4',
			marks: 5,
			blocks: [],
			response: {
				kind: 'asset-canvas',
				assetId: 'figure-12',
				lineCount: 8,
				answerLabel: 'Rate of reaction',
				unit: 'mol/s'
			}
		});
		const answer = serializeAssetCanvasAnswer({
			strokes: [
				[
					[100, 800],
					[900, 200]
				]
			],
			working: 'gradient = 6 / 3',
			finalAnswer: '2 × 10^-5'
		});

		expect(answerablePaperParts(paper).map(({ part }) => part.ref)).toContain('02.4');
		expect(hasMeaningfulPaperAnswer(paper.questions[1].parts.at(-1)!.response, answer)).toBe(true);
		expect(unsafePaperGradingPartRefs(paper)).toEqual(['02.3', '02.4']);
		expect(paperAnswerProgress(paper, { '02.4': answer }).answered).toBe(1);
	});
});

describe('paper sitting persistence and results', () => {
	it('restores only a matching user and paper and freezes timing at submission', () => {
		const paper = paperFixture();
		const session = createPaperSitting({
			paper,
			userId: 'learner-1',
			readinessReviewedAt: '2025-06-03T10:00:00.000Z',
			sessionId: 'session-1',
			nonce: 'n'.repeat(64),
			now: 1_000
		});
		const submitted = submitPaperSitting(session, 61_000);

		expect(
			parseStoredPaperSitting(JSON.stringify(session), {
				paper,
				userId: 'learner-1',
				readinessReviewedAt: '2025-06-03T10:00:00.000Z',
				now: 61_000
			})
		).toEqual(session);
		expect(
			parseStoredPaperSitting(JSON.stringify(session), {
				paper,
				userId: 'another-user',
				readinessReviewedAt: '2025-06-03T10:00:00.000Z',
				now: 61_000
			})
		).toBe(null);
		expect(
			parseStoredPaperSitting(JSON.stringify(session), {
				paper,
				userId: 'learner-1',
				readinessReviewedAt: '2025-06-04T10:00:00.000Z',
				now: 61_000
			})
		).toBe(null);
		expect(elapsedPaperSittingMs(submitted, 999_000)).toBe(60_000);
		expect(remainingPaperSittingMs(submitted, 2, 999_000)).toBe(60_000);
	});

	it('restores and freezes non-overlapping time for each active answer', () => {
		const paper = paperFixture();
		const started = createPaperSitting({
			paper,
			userId: 'learner-1',
			readinessReviewedAt: '2025-06-03T10:00:00.000Z',
			sessionId: 'session-1',
			nonce: 'n'.repeat(64),
			now: 1_000
		});
		expect(started.activePartRef).toBe('01.1');
		expect(paperPartResponseDurationMs(started, '01.1', 11_000)).toBe(10_000);

		const secondPart = activatePaperSittingPart(started, '01.2', 11_000);
		expect(secondPart.responseDurationsMs).toEqual({ '01.1': 10_000 });
		expect(paperPartResponseDurationMs(secondPart, '01.2', 31_000)).toBe(20_000);

		const restored = parseStoredPaperSitting(JSON.stringify(secondPart), {
			paper,
			userId: 'learner-1',
			readinessReviewedAt: '2025-06-03T10:00:00.000Z',
			now: 31_000
		});
		expect(restored).toEqual(secondPart);

		const submitted = submitPaperSitting(secondPart, 31_000);
		expect(submitted.responseDurationsMs).toEqual({ '01.1': 10_000, '01.2': 20_000 });
		expect(submitted.activePartRef).toBeNull();
		expect(submitted.activePartStartedAt).toBeNull();
		expect(elapsedPaperSittingMs(submitted, 99_000)).toBe(30_000);
	});

	it('locks an in-progress sitting exactly at the approved deadline for automatic submission', () => {
		const session = createPaperSitting({
			paper: paperFixture(),
			userId: 'learner-1',
			readinessReviewedAt: '2025-06-03T10:00:00.000Z',
			sessionId: 'session-1',
			nonce: 'n'.repeat(64),
			now: 1_000
		});
		const deadline = paperSittingDeadlineAtMs(session, 75);

		expect(deadline).toBe(4_501_000);
		expect(paperSittingNeedsDeadlineSubmission(session, 75, deadline - 1)).toBe(false);
		expect(paperSittingNeedsDeadlineSubmission(session, 75, deadline)).toBe(true);
		expect(
			paperSittingNeedsDeadlineSubmission(submitPaperSitting(session, deadline), 75, deadline + 1)
		).toBe(false);
	});

	it('resumes overnight but expires unfinished sittings after seven days', () => {
		const paper = paperFixture();
		const session = createPaperSitting({
			paper,
			userId: 'learner-1',
			readinessReviewedAt: '2025-06-03T10:00:00.000Z',
			sessionId: 'session-1',
			nonce: 'n'.repeat(64),
			now: 1_000
		});
		const options = {
			paper,
			userId: 'learner-1',
			readinessReviewedAt: '2025-06-03T10:00:00.000Z'
		};

		expect(
			parseStoredPaperSitting(JSON.stringify(session), {
				...options,
				now: 24 * 60 * 60 * 1_000
			})
		).toEqual(session);
		expect(
			parseStoredPaperSitting(JSON.stringify(session), {
				...options,
				now: session.startedAt + MAX_PAPER_SITTING_ELAPSED_MS + 1
			})
		).toBe(null);

		const recoverable = parseStoredPaperSitting(JSON.stringify(session), {
			...options,
			readinessReviewedAt: '2025-06-04T10:00:00.000Z',
			now: session.startedAt + MAX_PAPER_SITTING_ELAPSED_MS + 1,
			recoveryMode: true
		});
		expect(recoverable).toEqual(session);
	});

	it('recovers removed active refs, answers and results without rewriting the stale snapshot', () => {
		const originalPaper = paperFixture();
		const session = createPaperSitting({
			paper: originalPaper,
			userId: 'learner-1',
			readinessReviewedAt: '2025-06-03T10:00:00.000Z',
			sessionId: 'session-1',
			nonce: 'n'.repeat(64),
			now: 1_000
		});
		const removedRefSnapshot = {
			...session,
			answers: { '01.1': 'My answer to the removed part.' },
			results: {
				'01.1': {
					questionId: 'q-1',
					ref: '01.1',
					status: 'graded' as const,
					result: 'correct' as const,
					awardedMarks: 2,
					maxMarks: 2,
					gradeableMarks: 2,
					confidence: 'high' as const,
					summary: 'Saved result.',
					nextStep: '',
					checklist: [],
					chain: null,
					modelAnswer: null,
					warnings: []
				}
			}
		};
		const currentPaper = paperFixture();
		currentPaper.questions[0].parts = currentPaper.questions[0].parts.filter(
			(part) => part.ref !== '01.1'
		);

		expect(
			parseStoredPaperSitting(JSON.stringify(removedRefSnapshot), {
				paper: currentPaper,
				userId: 'learner-1',
				readinessReviewedAt: '2025-06-04T10:00:00.000Z',
				now: 2_000,
				recoveryMode: true
			})
		).toEqual(removedRefSnapshot);
	});

	it('merges sequential question grades and distinguishes unchecked marks from zero marks', () => {
		const paper = paperFixture();
		const session = {
			...createPaperSitting({
				paper,
				userId: 'learner-1',
				readinessReviewedAt: '2025-06-03T10:00:00.000Z',
				sessionId: 'session-1',
				nonce: 'n'.repeat(64),
				now: 1_000
			}),
			status: 'grading' as const,
			submittedAt: 5_000
		};
		const response: ExperimentGradeResponse = {
			status: 'ok',
			paperSlug: paper.id,
			ref: '01',
			model: 'deterministic',
			modelVersion: 'deterministic',
			totals: { awardedMarks: 1, maxMarks: 3, gradeableMarks: 2, ungradedMarks: 1 },
			results: [
				{
					questionId: 'q-1',
					ref: '01.1',
					status: 'graded',
					result: 'partial',
					awardedMarks: 1,
					maxMarks: 2,
					gradeableMarks: 2,
					confidence: 'high',
					summary: 'One mark',
					nextStep: '',
					checklist: [],
					chain: null,
					modelAnswer: null,
					warnings: []
				},
				{
					questionId: 'q-2',
					ref: '01.2',
					status: 'not_gradeable',
					result: 'ungraded',
					awardedMarks: null,
					maxMarks: 1,
					gradeableMarks: 0,
					confidence: 'low',
					summary: 'Not gradeable',
					nextStep: '',
					checklist: [],
					chain: null,
					modelAnswer: null,
					warnings: []
				}
			]
		};

		const merged = mergePaperGradeResponse(session, response, 6_000);
		expect(merged.gradedQuestionRefs).toEqual(['01']);
		expect(Object.keys(merged.results)).toEqual(['01.1', '01.2']);
		expect(paperGradeSummary(merged.results, 6)).toEqual({
			awardedMarks: 1,
			totalMarks: 6,
			checkedMarks: 2,
			ungradedMarks: 4,
			percent: 16.7
		});
	});
});

describe('full-paper browser integrity wiring', () => {
	it('marks the home snapshot after any confirmed grading mutation, including partial runs', () => {
		const source = readFileSync(
			new URL('./components/FullPaperSitting.svelte', import.meta.url),
			'utf8'
		);
		const gradingStart = source.indexOf('async function runGrading');
		const gradingEnd = source.indexOf('async function finishOrContinue', gradingStart);
		const grading = source.slice(gradingStart, gradingEnd);

		expect(gradingStart).toBeGreaterThan(-1);
		expect(grading).toContain('let snapshotWasMutated = false');
		expect(grading.indexOf('const response = await gradeQuestion')).toBeLessThan(
			grading.indexOf('snapshotWasMutated = true')
		);
		expect(grading).toContain('if (streamStarted) snapshotWasMutated = true');
		expect(grading).toContain('finally {');
		expect(grading).toContain('if (snapshotWasMutated) markHomeSnapshotDirty()');
	});

	it('flushes the newest server draft before submit and on browser suspension', () => {
		const source = readFileSync(
			new URL('./components/FullPaperSitting.svelte', import.meta.url),
			'utf8'
		);
		const finishStart = source.indexOf('async function finishOrContinue');
		const finishEnd = source.indexOf('function finishManually', finishStart);
		const finish = source.slice(finishStart, finishEnd);

		expect(finishStart).toBeGreaterThan(-1);
		expect(finish.indexOf('await flushDraftSaves()')).toBeLessThan(
			finish.indexOf("action: 'submit'")
		);
		expect(finish.match(/paperSittingNeedsDeadlineSubmission/g)?.length).toBeGreaterThanOrEqual(2);
		expect(source).toContain("action: 'save'");
		expect(source).toContain("addEventListener('pagehide'");
		expect(source).toContain("addEventListener('visibilitychange'");
		expect(source).toContain('queueDraftSave(nextSession)');

		const submitPayload = finish.slice(
			finish.indexOf("action: 'submit'"),
			finish.indexOf('})) as ServerSittingView')
		);
		expect(submitPayload).not.toContain('answers');
		expect(submitPayload).not.toContain('responseDurationsMs');
	});

	it('keeps a stale or expired 409 snapshot visible read-only until explicit replacement', () => {
		const source = readFileSync(
			new URL('./components/FullPaperSitting.svelte', import.meta.url),
			'utf8'
		);
		const resumeCatchStart = source.indexOf(
			'if (error instanceof ResponseRequestError && error.status === 409)'
		);
		const resumeCatchEnd = source.indexOf('} else {', resumeCatchStart);
		const resumeCatch = source.slice(resumeCatchStart, resumeCatchEnd);

		expect(source).toContain('recoveryMode: true');
		expect(resumeCatch).toContain('session = restored');
		expect(resumeCatch).toContain('authorizationBlocked = true');
		expect(resumeCatch).not.toContain('localStorage.removeItem');
		expect(source).not.toContain('if (raw && !restored) window.localStorage.removeItem');
		expect(source).toContain('Saved answers no longer present in this paper');
		expect(source).toContain(
			"readOnly={authorizationBlocked || session.status !== 'in_progress' || deadlineReached}"
		);
		expect(source).toContain("authorizationBlocked ? 'Start again' : 'Start another sitting'");
	});
});
