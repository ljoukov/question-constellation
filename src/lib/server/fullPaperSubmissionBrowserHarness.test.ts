import { describe, expect, it } from 'vitest';
import { DEV_AUTH_CLEANUP_CONFIRMATION } from '../../../scripts/cleanup-dev-auth-data.mjs';
import {
	evidenceToken,
	isSafeLoopbackOrigin,
	parseFullPaperSubmissionArgs,
	sanitizePersistedSitting
} from '../../../scripts/validate-full-paper-submission-browser.mjs';

describe('approved full-paper submission browser harness', () => {
	it('is read-only by default and requires both explicit write locks', () => {
		expect(parseFullPaperSubmissionArgs([])).toMatchObject({
			executeApprovedSubmission: false,
			confirm: null
		});
		expect(() =>
			parseFullPaperSubmissionArgs([`--confirm=${DEV_AUTH_CLEANUP_CONFIRMATION}`])
		).toThrow(/only valid together/);
		expect(() => parseFullPaperSubmissionArgs(['--execute-approved-submission'])).toThrow(
			/Approved submission requires/
		);
		expect(() =>
			parseFullPaperSubmissionArgs([
				'--execute-approved-submission',
				'--confirm=not-the-disposable-user'
			])
		).toThrow(/Approved submission requires/);
		expect(
			parseFullPaperSubmissionArgs([
				'--execute-approved-submission',
				`--confirm=${DEV_AUTH_CLEANUP_CONFIRMATION}`
			])
		).toMatchObject({ executeApprovedSubmission: true, confirm: DEV_AUTH_CLEANUP_CONFIRMATION });
	});

	it('accepts only credential-free loopback HTTP origins', () => {
		expect(isSafeLoopbackOrigin('http://127.0.0.1:5173/')).toBe(true);
		expect(isSafeLoopbackOrigin('http://localhost:5173/')).toBe(true);
		expect(isSafeLoopbackOrigin('http://[::1]:5173/')).toBe(true);
		expect(isSafeLoopbackOrigin('https://127.0.0.1:5173/')).toBe(false);
		expect(isSafeLoopbackOrigin('http://127.0.0.1:5173/path')).toBe(false);
		expect(isSafeLoopbackOrigin('http://user:password@127.0.0.1:5173/')).toBe(false);
		expect(isSafeLoopbackOrigin('https://questionconstellation.example/')).toBe(false);
	});

	it('removes raw session, attempt, evidence, answer, and grade-response content', () => {
		const sanitized = sanitizePersistedSitting(
			{
				id: 'raw-session-id',
				status: 'complete',
				started_at_ms: 100,
				submitted_at_ms: 200,
				completed_at_ms: 300,
				question_groups_json: JSON.stringify([{ questionRef: '01', partRefs: ['01.1'] }]),
				answers_json: JSON.stringify({ '01.1': 'raw learner answer' }),
				response_durations_json: JSON.stringify({ '01.1': 900 }),
				results_json: JSON.stringify({
					'01.1': {
						questionId: 'public-question-id',
						status: 'graded',
						result: 'correct',
						awardedMarks: 1,
						maxMarks: 1,
						gradeableMarks: 1,
						summary: 'raw model feedback'
					}
				}),
				grade_responses_json: JSON.stringify({ '01': { output: 'raw model response' } }),
				graded_question_refs_json: JSON.stringify(['01']),
				next_question_index: 1,
				version: 6,
				updated_at: '2026-07-16T00:00:00Z'
			},
			[
				{
					id: 'raw-attempt-id',
					question_id: 'public-question-id',
					source_question_ref: '01.1',
					result: 'correct',
					awarded_marks: 1,
					max_marks: 1,
					model: 'test-model',
					model_version: 'test-version',
					created_at: '2026-07-16T00:00:00Z'
				}
			],
			[
				{
					id: 'raw-evidence-id',
					source_attempt_id: 'raw-attempt-id',
					question_id: 'public-question-id',
					outcome: 'correct',
					awarded_marks: 1,
					max_marks: 1,
					response_duration_ms: 900,
					occurred_at: '2026-07-16T00:00:00Z'
				}
			]
		);
		const json = JSON.stringify(sanitized);
		expect(json).not.toContain('raw-session-id');
		expect(json).not.toContain('raw-attempt-id');
		expect(json).not.toContain('raw-evidence-id');
		expect(json).not.toContain('raw learner answer');
		expect(json).not.toContain('raw model feedback');
		expect(json).not.toContain('raw model response');
		expect(sanitized.session.sessionToken).toBe(evidenceToken('raw-session-id'));
		expect(sanitized.session.answers['01.1']).toMatchObject({ nonBlank: true, length: 18 });
		expect(sanitized.evidence[0].responseDurationMs).toBe(900);
	});
});
