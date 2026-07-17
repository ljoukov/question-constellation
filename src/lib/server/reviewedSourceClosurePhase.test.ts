import { describe, expect, it } from 'vitest';

import { validReviewedSourceClosurePhase } from '../../../scripts/lib/reviewed-source-closure-phase.mjs';

const hash = 'a'.repeat(64);

function falsePositiveFixture() {
	const artifact = (path: string) => ({ path, sha256: hash });
	const jsonArtifact = (path: string) => ({
		...artifact(path),
		canonicalJsonSha256: hash
	});
	const invariants = Object.fromEntries(
		[
			'exactCandidateHash',
			'exactFailedJudgeReportHash',
			'exactFailedJudgeSummaryHash',
			'exactOfficialQuestionPaperHash',
			'exactOfficialMarkSchemeHash',
			'exactOfficialExaminerReportHash',
			'soleFailedFindingSourceDisproved',
			'candidateUnchanged',
			'changedFieldCountExact',
			'fullRefInventoryValidated',
			'fullMarkInventoryValidated',
			'zeroDeterministicBlockers'
		].map((key) => [key, true])
	);
	const candidate = jsonArtifact('candidate.json');
	return {
		phase: {
			status: 'passed_after_reviewed_source_closure',
			modelJudgePass: false,
			reviewedSourceClosure: {
				status: 'passed',
				closureType: 'human_source_reviewed_false_positive',
				modelJudgePass: false,
				assertion: 'No model-judge pass is claimed.',
				outputArtifact: artifact('candidate.json'),
				candidateMutation: {
					before: candidate,
					after: candidate,
					changedPaths: [],
					unchanged: true
				},
				deterministicValidation: {
					...jsonArtifact('validation.json'),
					status: 'passed',
					questionCount: 2,
					markTotal: 5,
					blockingIssues: 0,
					deterministicIssueCount: 0
				},
				sourceDocuments: {
					questionPaper: artifact('qp.pdf'),
					markScheme: artifact('ms.pdf'),
					examinerReport: artifact('er.pdf')
				},
				modelAudits: [
					{
						executionStatus: 'passed',
						verdict: 'fail',
						score: 0.97,
						threadId: 'model-thread',
						model: 'gpt-5.6-sol',
						thinkingLevel: 'max',
						checkedRefs: 2,
						checkedRefList: ['01.1', '02.1'],
						questionCount: 2,
						markTotal: 5,
						requiredRepairs: [{ sourceQuestionRef: '01.1', field: 'modelAnswer.answerText' }],
						report: artifact('failed-report.json'),
						summary: artifact('failed-summary.json'),
						events: artifact('events.jsonl'),
						candidate
					}
				],
				falsePositiveFindings: [
					{
						sourceQuestionRef: '01.1',
						field: 'modelAnswer.answerText',
						modelFinding: {
							sourceQuestionRef: '01.1',
							field: 'modelAnswer.answerText'
						},
						disposition: 'false_positive_no_candidate_change',
						officialSource: {
							document: 'Official examiner report',
							physicalPdfPage: 7,
							anchors: ['Exact official source anchor']
						},
						rationale: 'The official source contradicts the sole model finding.'
					}
				],
				invariants
			}
		},
		result: {
			status: 'passed_after_reviewed_source_closure',
			verdict: 'reviewed_source_closure',
			score: 0.97,
			checkedRefCount: 2,
			requiredRepairCount: 0
		}
	};
}

describe('reviewed source closure release phase', () => {
	it('accepts a hash-bound false-positive closure without claiming a model pass or mutation', () => {
		const fixture = falsePositiveFixture();
		expect(validReviewedSourceClosurePhase({ ...fixture, questionCount: 2, markTotal: 5 })).toBe(
			true
		);
	});

	it('fails closed when the candidate, audit inventory, source or final repair state drifts', () => {
		type Fixture = ReturnType<typeof falsePositiveFixture>;
		const mutations: Array<(fixture: Fixture) => void> = [
			(fixture) =>
				(fixture.phase.reviewedSourceClosure.candidateMutation.after.sha256 = 'b'.repeat(64)),
			(fixture) => (fixture.phase.reviewedSourceClosure.sourceDocuments.examinerReport.sha256 = ''),
			(fixture) =>
				(fixture.phase.reviewedSourceClosure.modelAudits[0].checkedRefList = ['01.1', '01.1']),
			(fixture) => (fixture.phase.reviewedSourceClosure.invariants.candidateUnchanged = false),
			(fixture) => (fixture.phase.modelJudgePass = true),
			(fixture) => (fixture.result.requiredRepairCount = 1)
		];
		for (const mutate of mutations) {
			const fixture = structuredClone(falsePositiveFixture());
			mutate(fixture);
			expect(validReviewedSourceClosurePhase({ ...fixture, questionCount: 2, markTotal: 5 })).toBe(
				false
			);
		}
	});

	it('preserves the older repaired-candidate contract and requires its recovered rollout', () => {
		const artifact = (path: string) => ({ path, sha256: hash });
		const phase = {
			status: 'passed_after_reviewed_source_closure',
			modelJudgePass: false,
			reviewedSourceClosure: {
				status: 'passed',
				closureType: 'human_source_reviewed_after_failed_model_audits',
				modelJudgePass: false,
				repairRef: 'reviewed-repair.json',
				databaseSittingApprovalRetained: true,
				outputArtifact: artifact('candidate.json'),
				deterministicValidation: {
					...artifact('validation.json'),
					status: 'passed',
					questionCount: 2,
					markTotal: 5,
					blockingIssues: 0
				},
				sourceDocuments: {
					questionPaper: artifact('qp.pdf'),
					markScheme: artifact('ms.pdf')
				}
			}
		};
		const result = { modelVerdict: 'fail', score: 0.9, checkedRefs: 2, requiredRepairs: 1 };
		expect(
			validReviewedSourceClosurePhase({
				phase,
				result,
				questionCount: 2,
				markTotal: 5,
				recoveredRollout: true
			})
		).toBe(true);
		expect(validReviewedSourceClosurePhase({ phase, result, questionCount: 2, markTotal: 5 })).toBe(
			false
		);
	});
});
